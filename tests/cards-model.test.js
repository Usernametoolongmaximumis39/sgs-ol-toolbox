import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, cardsInZone, handCandidates, zoneKey, POSITION, unknownCards, queryCards, sortCards, deckComposition, CONSERVATIVE_SKILLS } from '../src/plugins/cards/model.js';

function recording(deck = [1, 2, 3, 4, 5, 6]) {
  let seq = 0, state = initialState();
  const send = (type, payload = {}, sessionId = 'a') => {
    state = reduce(state, { seq: ++seq, type, payload, sessionId, at: seq * 100 });
    return state;
  };
  send('MsgGamePlayCardNtf', { CardList: deck });
  return { send, get state() { return state; } };
}
const transfer = (extra = {}) => ({ FromID: 255, FromZone: 1, FromPosition: POSITION.unknown,
  ToID: 1, ToZone: 5, ToPosition: POSITION.unknown, CardIDs: [1], CardCount: 1, MoveType: 1, SpellID: 0, ...extra });

test('hand candidates require observed pile exhaustion and one uncertain hand, including visible teammates', () => {
  const r = recording([1, 2, 3, 4, 5, 6]);
  r.send('toolbox:snapshot', { selfSeatId: 0, seats: [0, 1, 2, 3].map(seatId => ({ seatId, handCount: 0, dead: false })) });
  r.send('PubGsCMoveCard', transfer({ ToID: 0, CardIDs: [1], CardCount: 1 }));
  r.send('PubGsCMoveCard', transfer({ ToID: 2, CardIDs: [2], CardCount: 1 }));
  r.send('PubGsCMoveCard', transfer({ ToID: 3, CardIDs: [3], CardCount: 1 }));
  r.send('PubGsCMoveCard', transfer({ ToID: 2, CardIDs: [], CardCount: 1 }));
  r.send('PubGsCMoveCard', transfer({ ToID: 1, CardIDs: [], CardCount: 1 }));
  assert.ok(cardsInZone(r.state, zoneKey(5, 1), 'possible').length);
  assert.deepEqual(handCandidates(r.state, 1), [], 'no broad candidates before the first pile runs out');
  r.send('PubGsCMoveCard', transfer({ ToID: 1, CardIDs: [], CardCount: 1 }));
  assert.equal(r.state.deckCycleCompleted, true);
  assert.deepEqual(handCandidates(r.state, 1), [], 'two uncertain hands still disable inference after exhaustion');
  r.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 2, knownHandCardIds: [2, 4] }] });
  assert.deepEqual(handCandidates(r.state, 1), [5, 6], 'three other fully known hands allow multiplayer inference');
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [], 'candidates must not become confirmed hand cards');
  r.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 3, knownHandCardIds: [2, 4] }] });
  assert.deepEqual(handCandidates(r.state, 1), [], 'a newly hidden teammate card disables inference');
  r.send('SmsgGamePlayerDead', { SeatID: 2 });
  r.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 2 }] });
  assert.equal(r.state.seats[2].dead, true, 'an omitted death flag must not resurrect a dead player');
  assert.deepEqual(handCandidates(r.state, 1), [5, 6]);
  r.send('toolbox:gap', { reason: 'lost event' });
  assert.deepEqual(handCandidates(r.state, 1), []);
  assert.equal(r.state.deckCycleCompleted, false);
});

test('reconnect, new game and missing self hand suppress broad hand inference', () => {
  const r = recording([1, 2, 3]);
  r.send('toolbox:snapshot', { selfSeatId: 0, seats: [{ seatId: 0, handCount: 1 }, { seatId: 1, handCount: 0 }] });
  r.send('PubGsCMoveCard', transfer({ CardIDs: [], CardCount: 3 }));
  assert.deepEqual(handCandidates(r.state, 1), [], 'own hidden hand cannot be silently excluded');
  r.send('MsgReconnectGame');
  assert.equal(r.state.deckCycleCompleted, false);
  r.send('MsgGamePlayCardNtf', { CardList: [1, 2, 3] });
  assert.equal(r.state.deckCycleCompleted, false);
});

test('native wrapped protocol bodies preserve card list, movements, reveals and recent use', () => {
  const r = recording([]);
  r.send('MsgGamePlayCardNtf', { CardList: [], Protocol: { cardList: new Uint32Array([1, 2, 3, 4]) } });
  r.send('toolbox:snapshot', { selfSeatId: 0 });
  r.send('PubGsCMoveCard', { CardIDs: [], Data: { Protocol: { from_id: 255, from_zone: 1, to_id: 1, to_zone: 5, card_count: 2, card_ids: new Uint32Array([0, 0]), move_type: 1 } } });
  assert.equal(r.state.zones[zoneKey(1)].count, 2);
  assert.equal(r.state.historyComplete, true);
  r.send('decodeClientGetCardInfoResp', { ProtoObj: { seatId: 1, cardList: { 0: 2, length: 1 } } });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2]);
  r.send('PubGsCUseCard', { Protocol: { seatId: 0, cardId: 3, UseType: 1 } });
  assert.equal(r.state.recentBySeat[0], 3);
  r.send('PubGsCMoveCard', { msg: { Protocol: { from_id: 1, from_zone: 5, to_id: 255, to_zone: 2, card_count: 1, card_ids: [2], move_type: 2 } } });
  assert.deepEqual(r.state.discardTurn, [2]);
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), []);
});

test('public same-hand movement records a shown card without changing hand counts', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardIDs: [], CardCount: 3 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 1, ToZone: 5, CardIDs: [2], MoveType: 21, SpellID: 0 }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2]);
  assert.equal(r.state.zones[zoneKey(5, 1)].count, 3);
  assert.equal(r.state.zones[zoneKey(1)].count, 3);
});

test('friend hand response recognizes Protocol body and ignores failed or outgoing replies', () => {
  const r = recording();
  r.send('ClientHappyGetFriendHandcardRep', { Protocol: { error_id: 0, seat_id: 1, card_list: [3] } });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [3]);
  r.send('ClientHappyGetFriendHandcardRep', { Protocol: { error_id: 7, seat_id: 1, card_list: [4] } });
  r.send('ClientHappyGetFriendHandcardRep', { Protocol: { IsSend: true, error_id: 0, seat_id: 1, card_list: [5] } });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [3]);
});

test('deck composition counts distinct seen cards, without treating hidden draws or the deck list as sightings', () => {
  const r = recording([1,2,3,4]);
  const getMeta = id => ({ name: id <= 3 ? '乐不思蜀' : '闪', suit: id <= 2 ? 3 : 1, number: id });
  let table = deckComposition(r.state, 'name', getMeta);
  assert.equal(table.total,4); assert.equal(table.seen,0); assert.equal(table.unseen,4);
  r.send('PubGsCMoveCard', transfer({ CardIDs: [] }));
  assert.equal(deckComposition(r.state,'name',getMeta).seen,0);
  r.send('decodeClientGetCardInfoResp', { ProtoObj: { seatId: 1, cardList: [1] } });
  table=deckComposition(r.state,'name',getMeta);
  assert.equal(table.rows.find(row=>row.key==='乐不思蜀').unseen,2);
  assert.equal(table.rows.find(row=>row.key==='乐不思蜀').total,3);
  r.send('PubGsCUseCard',{SeatID:1,CardID:1});
  r.send('PubGsCUseCard',{SeatID:1,CardID:1});
  r.send('PubGsCMoveCard',transfer({FromID:1,FromZone:5,ToID:255,ToZone:1,CardIDs:[1]}));
  assert.equal(deckComposition(r.state,'name',getMeta).seen,1,'returning a seen card must not undo its sighting');
  assert.equal(deckComposition(r.state,'suit',getMeta).rows.length,2);
  assert.equal(deckComposition(r.state,'number',getMeta).rows.length,4);
  r.send('toolbox:gap',{reason:'lost event'});
  assert.equal(deckComposition(r.state,'name',getMeta).complete,false);
  assert.equal(deckComposition(r.state,'name',getMeta).seen,1);
  r.send('MsgGamePlayCardNtf',{CardList:[1,2,3,4]});
  assert.equal(deckComposition(r.state,'name',getMeta).seen,0);
  assert.equal(deckComposition(initialState(),'name',getMeta).available,false);
});

test('slash composition includes elemental slashes in total and overlapping red/black groups', () => {
  const meta={1:{name:'杀',suit:1},2:{name:'杀',suit:3},3:{name:'火焰杀',suit:2},4:{name:'雷电杀',suit:4},5:{name:'杀',cardClass:'BingShaNCard',suit:3},6:{name:'乐不思蜀',suit:1},7:{name:'杀',cardClass:'HuoShaNCard',suit:1}};
  const r=recording([1,2,3,4,5,6,7]), getMeta=id=>meta[id];
  r.send('PubGsCUseCard',{SeatID:1,CardIDs:[1,5]});
  const table=deckComposition(r.state,'name',getMeta), rows=Object.fromEntries(table.rows.map(row=>[row.key,row]));
  assert.equal(table.total,7); assert.equal(table.seen,2);
  for(const [name,total,unseen] of [['杀',6,4],['普通杀',2,1],['火杀',2,2],['雷杀',1,1],['冰杀',1,0],['红杀',3,2],['黑杀',3,2]]) {
    assert.equal(rows[name].total,total,name); assert.equal(rows[name].unseen,unseen,name);
    assert.equal('min' in rows[name],false);
  }
});

test('legacy seen records stay explicitly partial and inferred hidden identity is not a sighting', () => {
  const r=recording([1]);
  r.send('PubGsCMoveCard',transfer({CardIDs:[]}));
  assert.equal(deckComposition(r.state,'name',()=>({name:'乐不思蜀'})).unseen,1);
  const old=initialState();old.historyComplete=true;old.deckIds=[1,2];
  old.cards={1:{id:1,locations:['5:0'],tags:[],lastSeq:2},2:{id:2,locations:['1:255'],tags:[],lastSeq:1}};
  const table=deckComposition(old,'name',()=>({name:'乐不思蜀'}));
  assert.equal(table.seen,1);assert.equal(table.complete,false);
});

test('initial state is JSON data and an unrelated event is a no-op', () => {
  const state = initialState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(reduce(state, { type: 'Unrelated', payload: {}, seq: 1 }), state);
});

test('reducer leaves prior state and packet unchanged, suppresses duplicate seq and outgoing packets', () => {
  const before = initialState();
  const packet = { seq: 1, sessionId: 'a', type: 'MsgGamePlayCardNtf', payload: { CardList: [1, 2] } };
  const copy = JSON.stringify(packet);
  const state = reduce(before, packet);
  assert.deepEqual(before, initialState()); assert.equal(JSON.stringify(packet), copy);
  assert.equal(reduce(state, packet), state);
  assert.equal(reduce(state, { ...packet, seq: 2, payload: { isSend: true } }), state);
});

test('null, blank and boolean seat IDs remain unknown; numeric zero is valid', () => {
  for (const bad of [null, undefined, '', false, true, 'NaN']) {
    const r = recording();
    r.send('toolbox:snapshot', { selfSeatId: bad, seats: [{ seatId: bad, handCount: 1, knownHandCardIds: [1] }] });
    assert.equal(r.state.selfSeatId, null, `unknown self ${String(bad)}`);
    assert.deepEqual(r.state.seats, {});
  }
  const r = recording(); r.send('toolbox:snapshot', { selfSeatId: 0 });
  assert.equal(r.state.selfSeatId, 0);
});

test('known move establishes location, source label and accurate counts', () => {
  const r = recording(); r.send('PubGsCMoveCard', transfer());
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [1]);
  assert.equal(r.state.zones[zoneKey(1)].count, 5);
  assert.equal(r.state.zones[zoneKey(5, 1)].count, 1);
  assert.deepEqual(r.state.cards[1].tags, ['摸牌']);
});

test('unknown draw retains alternatives, and later revelation removes ambiguity', () => {
  const r = recording([1, 2, 3]);
  r.send('PubGsCMoveCard', transfer({ CardIDs: [0] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), []);
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'possible'), [1, 2, 3]);
  assert.equal(unknownCards(r.state).length, 3);
  r.send('decodeClientGetCardInfoResp', { ProtoObj: { seatId: 1, cardList: [{ cardId: 2 }] } });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2]);
});

test('a whole known hand transfers deterministically while partial random transfer does not', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 2, CardIDs: [], CardCount: 2 }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 2)), [1, 2]);
  r.send('PubGsCMoveCard', transfer({ FromID: 2, FromZone: 5, ToID: 3, CardIDs: [], CardCount: 1 }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 3)), []);
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 3), 'possible'), [1, 2]);
});

test('playing the last hand card rules out that hand for every other candidate', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2, 3], CardCount: 3 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 2, CardIDs: [] }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 3, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'possible'), [1, 2, 3]);

  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 255, ToZone: 2, MoveType: 2 }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'all'), []);
  assert.deepEqual(r.state.zones[zoneKey(5, 1)].order, []);
  assert.deepEqual(r.state.cards[1].locations, [zoneKey(2)]);
  assert.deepEqual(r.state.cards[2].locations, [zoneKey(5, 2), zoneKey(5, 3)]);
  assert.deepEqual(r.state.cards[3].locations, [zoneKey(5, 2), zoneKey(5, 3)]);

  r.send('PubGsCMoveCard', transfer({ CardIDs: [4] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'all'), [4]);
});

test('a hidden last-card transfer keeps the destination and other possible hands', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 2, CardIDs: [] }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 3, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'all'), []);
  assert.deepEqual(r.state.zones[zoneKey(5, 1)].order, []);
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 2), 'possible'), [1, 2]);
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 3), 'possible'), [1, 2]);
});

test('a confirmed empty hand overrides stale reveals, while partial counts do not rule out cards', () => {
  const r = recording();
  r.send('toolbox:gap', { reason: 'lost packets' });
  r.send('decodeClientGetCardInfoResp', { SeatID: 1, CardIDs: [1, 2] });
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 2, CardIDs: [] }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToID: 255, ToZone: 2 }));
  r.send('toolbox:snapshot', { seats: [{ seatId: 1 }] });
  assert.deepEqual(r.state.cards[2].locations, [zoneKey(5, 1), zoneKey(5, 2)]);

  r.send('toolbox:snapshot', { seats: [{ seatId: 1, handCount: 0, knownHandCardIds: [2] }] });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1), 'all'), []);
  assert.deepEqual(r.state.cards[2].locations, [zoneKey(5, 2)]);
  r.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 0 }] });
  assert.deepEqual(r.state.cards[2].locations, ['?']);
  assert.equal(r.state.cards[2].seen, true);
});

test('deck top and bottom order support subsequent hidden draws', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2, 3], CardCount: 3 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToZone: 1, ToID: 255, ToPosition: POSITION.top, CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCMoveCard', transfer({ FromID: 1, FromZone: 5, ToZone: 1, ToID: 255, ToPosition: POSITION.bottom, CardIDs: [3] }));
  assert.deepEqual(r.state.zones[zoneKey(1)].top, [1, 2]);
  assert.deepEqual(r.state.zones[zoneKey(1)].bottom, [3]);
  r.send('PubGsCMoveCard', transfer({ ToID: 2, FromPosition: POSITION.top, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 2)), [1]);
  assert.deepEqual(r.state.zones[zoneKey(1)].top, [2]);
  r.send('PubGsCMoveCard', transfer({ ToID: 3, FromPosition: POSITION.bottom, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 3)), [3]);
});

test('unknown insertion invalidates remembered deck order', () => {
  const r = recording();
  r.send('decodeGameDealPileTopCardList', { IsResume: true, ProtoObj: { list_card_id: [1, 2] } });
  r.send('PubGsCMoveCard', transfer({ FromZone: 0, ToZone: 1, ToID: 255, CardIDs: [7] }));
  assert.deepEqual(r.state.zones[zoneKey(1)].top, []);
});

test('discard records are per turn, removals disappear, and same player extra turn resets', () => {
  const r = recording();
  r.send('GsCGamephaseNtf', { SeatID: 0, Round: 0 });
  r.send('PubGsCMoveCard', transfer({ ToZone: 2, ToID: 255, CardIDs: [1, 2], CardCount: 2 }));
  assert.deepEqual(r.state.discardTurn, [1, 2]);
  r.send('PubGsCMoveCard', transfer({ FromZone: 2, CardIDs: [1] }));
  assert.deepEqual(r.state.discardTurn, [2]);
  r.send('GsCGamephaseNtf', { SeatID: 0, Round: 4 });
  r.send('GsCGamephaseNtf', { SeatID: 0, Round: 0 });
  assert.deepEqual(r.state.discardTurn, []);
});

test('shuffle clears order and returns discard cards to deck without retaining hand guesses', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ ToZone: 2, ToID: 255, CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCMoveCard', transfer({ FromZone: 2, ToZone: 9, ToID: 255, CardIDs: [], CardCount: 2, MoveType: 255 }));
  assert.equal(r.state.zones[zoneKey(1)].count, 6);
  assert.equal(r.state.zones[zoneKey(2)].count, 0);
  assert.deepEqual(r.state.cards[1].locations, [zoneKey(1)]);
  assert.deepEqual(r.state.discardTurn, []);
});

test('recent card switches only on observed play, current-turn record follows current seat', () => {
  const r = recording(); r.send('toolbox:snapshot', { selfSeatId: 0 });
  r.send('GsCGamephaseNtf', { SeatID: 1, Round: 0 });
  r.send('PubGsCUseCard', { SeatID: 1, CardID: 2, useType: 1 });
  r.send('PubGsCUseCard', { SeatID: 0, CardID: 3, useType: 1 });
  assert.equal(r.state.recentCurrent, 2); assert.equal(r.state.recentBySeat[0], 3);
  r.send('PubGsCUseCard', { SeatID: 1, CardID: 4, useType: 2 });
  assert.equal(r.state.recentCurrent, 2);
});

test('reconnect invalidates old certainty; only explicitly restored cards are known', () => {
  const r = recording(); r.send('PubGsCMoveCard', transfer());
  r.send('MsgReconnectGame');
  assert.equal(r.state.historyComplete, false); assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), []);
  r.send('MsgReconnectGameHand', { SeatIndex: 1, Count: 2, CardIDs: [2, 3] });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2, 3]);
  assert.ok(r.state.limitations.some(item => item.code === 'history-gap'));
});

test('authoritative own hand snapshot removes stale certainty without inventing destination', () => {
  const r = recording(); r.send('toolbox:snapshot', { selfSeatId: 0, handCardIds: [1, 2] });
  r.send('toolbox:snapshot', { selfSeatId: 0, handCardIds: [2] });
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 0)), [2]);
  assert.deepEqual(r.state.cards[1].locations, ['?']);
});

test('new session and leaving table cannot leak previous cards, labels or recent actions', () => {
  const r = recording(); r.send('PubGsCMoveCard', transfer());
  r.send('toolbox:snapshot', { selfSeatId: 2 }, 'b');
  assert.deepEqual(r.state.cards, {}); assert.equal(r.state.selfSeatId, 2);
  r.send('ClientLeavetableRep', {}, 'b'); assert.deepEqual(r.state.cards, {});
});

for (const [sceneName, extraCard, flag] of [
  ['GameScene', 0, null], ['GuoZhanScene', 0x47e, 'guozhan'], ['DdzScene', 0x32cd, 'ddz'],
  ['ShanHeScene', 0x4e84, 'shanhetu'], ['RogueLike1v1Scene', 0, 'single-rider'], ['SWJGScene', 0, 'swjg'],
]) {
  test(`${sceneName}: same public moves work while preserving mode identity`, () => {
    const r = recording([1, 2, 3, ...(extraCard ? [extraCard] : [])]);
    r.send('toolbox:snapshot', { sceneName, selfSeatId: 0, seats: [{ seatId: 0 }, { seatId: 1 }] });
    r.send('PubGsCMoveCard', transfer());
    assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [1]);
    if (flag) assert.ok(r.state.mode.flags.includes(flag));
    assert.equal(r.state.mode.sceneName, sceneName);
  });
}

for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`public seat observations support ${count} participants without positional ownership assumptions`, () => {
    const r = recording(Array.from({ length: count }, (_, i) => i + 1));
    r.send('toolbox:snapshot', { selfSeatId: 0, seats: Array.from({ length: count }, (_, i) => ({ seatId: i, viewId: count - i, knownHandCardIds: [i + 1], handCount: 1 })) });
    for (let i = 0; i < count; i++) assert.deepEqual(cardsInZone(r.state, zoneKey(5, i)), [i + 1]);
  });
}

test('DDZ single-character info identifies self; Guozhan retains two generals', () => {
  const r = recording([1, 0x32cd]);
  r.send('SmsgGameSetCharacter', { Infos: [{ SeatID: 2, CharacterID: 88 }] });
  assert.equal(r.state.selfSeatId, 2);
  r.send('GsCGuoZhanSetCharacter', { SeatID: 1, GeneralData: [{ index: 0, cardID: 10 }, { index: 1, cardID: 11 }] });
  assert.deepEqual(r.state.seats[1].generals, [10, 11]);
});

for (const skill of CONSERVATIVE_SKILLS) {
  test(`hidden special-skill ${skill} never upgrades a possible card to certain`, () => {
    const r = recording([1, 2]);
    r.send('decodeGameDealPileTopCardList', { IsResume: true, ProtoObj: { list_card_id: [1] } });
    r.send('PubGsCMoveCard', transfer({ SpellID: skill, FromPosition: POSITION.top, CardIDs: [] }));
    assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), []);
    assert.ok(r.state.limitations.some(item => item.code === `skill:${skill}`));
  });
}

test('verified top-position correction can use a previously observed top card', () => {
  const r = recording();
  r.send('decodeGameDealPileTopCardList', { IsResume: true, ProtoObj: { list_card_id: [2] } });
  r.send('PubGsCMoveCard', transfer({ SpellID: 0xc88, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2]);
});

test('known placement spell only recovers identities for the matching own skill-mark placement', () => {
  const r = recording(); r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCUseSpell', { SpellID: 0x122, SeatID: 1, EffectIndex: 1, CardIDs: [2] });
  r.send('PubGsCMoveCard', transfer({ SpellID: 0x122, FromID: 1, FromZone: 5, ToID: 1, ToZone: 4, ToZoneParam: 0x122, MoveType: 15, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(4, 1, 0x122)), [2]);
  const wrong = recording(); wrong.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  wrong.send('PubGsCUseSpell', { SpellID: 0x122, SeatID: 1, EffectIndex: 1, CardIDs: [2] });
  wrong.send('PubGsCMoveCard', transfer({ SpellID: 0x122, FromID: 1, FromZone: 5, ToID: 255, ToZone: 1, ToPosition: POSITION.top, CardIDs: [] }));
  assert.deepEqual(wrong.state.zones[zoneKey(1)].top, [null]);
});

for (const skill of [0xc55, 0xd6a]) {
  test(`public discard choice for skill ${skill} correlates only to the chosen receiver`, () => {
    const r = recording();
    r.send('PubGsCMoveCard', transfer({ ToZone: 2, ToID: 255, CardIDs: [1, 2], CardCount: 2 }));
    r.send('PubGsCUseSpell', { SpellID: skill, SeatID: 1, EffectIndex: 1, CardCount: 1, CardIDs: [2] });
    r.send('PubGsCMoveCard', transfer({ SpellID: skill, FromZone: 2, ToID: 1, CardIDs: [] }));
    assert.deepEqual(cardsInZone(r.state, zoneKey(5, 1)), [2]);
  });
}

for (const skill of [0xea6, 0xea9]) {
  test(`qianfu variant ${skill} restores publicly chosen return-to-top order`, () => {
    const r = recording();
    r.send('PubGsCMoveCard', transfer({ ToZone: 2, ToID: 255, CardIDs: [1, 2, 3], CardCount: 3 }));
    r.send('PubGsCUseSpell', { SpellID: skill, SeatID: 1, EffectIndex: 2, DestSeatIDs: [], CardIDs: [2, 1] });
    r.send('PubGsCMoveCard', transfer({ SpellID: skill, SrcSeatID: 1, FromZone: 2, ToZone: 1, ToID: 255, ToPosition: POSITION.top, MoveType: 15, CardIDs: [], CardCount: 2 }));
    assert.deepEqual(r.state.zones[zoneKey(1)].top, [2, 1]);
  });
}

test('zexing shown-card association expires on another transfer or turn', () => {
  const r = recording(); r.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  r.send('PubGsCMoveCard', transfer({ SpellID: 0xf0e, FromID: 1, FromZone: 5, ToID: 1, ToZone: 5, MoveType: 21, CardIDs: [2] }));
  r.send('PubGsCMoveCard', transfer({ SpellID: 0xf0e, FromID: 1, FromZone: 5, ToID: 2, ToZone: 5, MoveType: 18, CardIDs: [] }));
  assert.deepEqual(cardsInZone(r.state, zoneKey(5, 2)), [2]);
  assert.equal(r.state.pending['zexing:1'], undefined);
  const later = recording(); later.send('PubGsCMoveCard', transfer({ CardIDs: [1, 2], CardCount: 2 }));
  later.send('PubGsCMoveCard', transfer({ SpellID: 0xf0e, FromID: 1, FromZone: 5, ToID: 1, ToZone: 5, MoveType: 21, CardIDs: [2] }));
  later.send('MsgGameTurnNtf', { TurnCnt: 2 });
  later.send('PubGsCMoveCard', transfer({ SpellID: 0xf0e, FromID: 1, FromZone: 5, ToID: 2, ToZone: 5, MoveType: 18, CardIDs: [] }));
  assert.deepEqual(cardsInZone(later.state, zoneKey(5, 2)), []);
});

test('skill windows are shared by skill id, while general marks retain seat ownership', () => {
  assert.equal(zoneKey(8, 1, 100), zoneKey(8, 2, 100));
  assert.notEqual(zoneKey(8, 1, 100), zoneKey(8, 1, 101));
  assert.notEqual(zoneKey(4, 1, 100), zoneKey(4, 2, 100));
});

test('compound card query and stable multi-key discard sorts operate without game objects', () => {
  const r = recording([1, 2, 3]);
  const lookup = id => ({ id, name: id < 3 ? '杀' : '闪', suit: id < 3 ? 3 : 1, number: 4 - id, type: 1 });
  assert.deepEqual(queryCards(r.state, { name: '杀', suit: '3', number: '2' }, lookup), [2]);
  assert.deepEqual(sortCards([1, 3, 2], 'number', lookup), [3, 2, 1]);
  assert.deepEqual(sortCards([1, 3, 2], 'time', lookup), [1, 3, 2]);
});

test('unbounded malformed input cannot allocate huge card arrays and does not claim a move', () => {
  const r = recording();
  r.send('PubGsCMoveCard', transfer({ CardCount: 1e9 }));
  assert.equal(r.state.moves.length, 0);
  assert.ok(r.state.limitations.some(item => item.code === 'invalid-move'));
});
