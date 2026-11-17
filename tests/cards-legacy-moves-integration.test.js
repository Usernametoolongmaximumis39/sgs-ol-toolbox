import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMessage } from '../src/core/protocol.js';
import { initialState, reduce, zoneKey, POSITION } from '../src/plugins/cards/model.js';

function game() {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload: type.startsWith('toolbox:') ? payload : projectMessage(type, payload), seq: ++seq, sessionId: 'integration' });
  send('MsgGamePlayCardNtf', { CardList: [1, 2, 3, 4, 5, 6] });
  return { send, get state() { return state; } };
}
const move = (SpellID, FromZone, ToZone, CardCount, extra = {}) => ({ SpellID, FromZone, ToZone, CardCount, CardIDs: [], FromID: 1, ToID: 0, SrcSeatID: 0, MoveType: 15, ...extra });

test('Projected friend-hand Cards alias and later qi result retain only declared initial owners', () => {
  const g = game();
  g.send('ClientHappyGetFriendHandcardRep', { ProtoObj: { seatId: 1, Cards: [1, 2], error_id: 0 } });
  assert.equal(g.state.cards[1].qiOwner, undefined, 'ordinary friend visibility is not qi');
  g.send('CGsRoleSpellOptRep', { SpellID: 0, Type: 72, Datas: [1] });
  assert.equal(g.state.cards[1].qiOwner, 1);
  assert.equal(g.state.cards[2].qiOwner, undefined);
  g.send('PubGsCMoveCard', move(0, 5, 2, 2, { CardIDs: [1, 2] }));
  g.send('SmsgGamePlayerDead', { SeatID: 1, MurSeatID: 0 });
  g.send('PubGsCMoveCard', move(3731, 2, 5, 1));
  assert.deepEqual(g.state.moves.at(-1).ids, [1]);
  assert.deepEqual(g.state.cards[1].locations, [zoneKey(5, 0)]);
});

test('Projected ordinary, failed and late friend-hand responses cannot establish qi owners', () => {
  for (const mode of ['ordinary', 'failed', 'late']) {
    const g = game();
    if (mode === 'late') g.send('MsgGameTurnNtf', { SeatID: 0, TurnCnt: 3 });
    g.send('ClientHappyGetFriendHandcardRep', { SeatID: 1, CardIDs: [1, 2], error_id: mode === 'failed' ? 9 : 0 });
    if (mode !== 'ordinary') g.send('CGsRoleSpellOptRep', { SpellID: 0, Type: 72, Datas: [1] });
    assert.equal(g.state.cards[1].qiOwner, undefined, mode);
    g.send('PubGsCMoveCard', move(0, 5, 2, 2, { CardIDs: [1, 2] }));
    g.send('SmsgGamePlayerDead', { SeatID: 1, MurSeatID: 0 });
    g.send('PubGsCMoveCard', move(0, 2, 5, 1));
    assert.deepEqual(g.state.moves.at(-1).ids, [], mode);
  }
});

test('A journal gap invalidates qi correlation even when old diagnostic tags remain', () => {
  const g = game();
  g.send('ClientHappyGetFriendHandcardRep', { SeatID: 1, CardIDs: [1, 2] });
  g.send('CGsRoleSpellOptRep', { SpellID: 0, Type: 72, Datas: [1] });
  g.send('toolbox:gap', { reason: 'lost packets' });
  g.send('PubGsCMoveCard', move(0, 5, 2, 2, { CardIDs: [1, 2] }));
  g.send('SmsgGamePlayerDead', { SeatID: 1, MurSeatID: 0 });
  g.send('PubGsCMoveCard', move(0, 2, 5, 1));
  assert.deepEqual(g.state.moves.at(-1).ids, []);
});

function jieli(g) {
  g.send('PubGsCMoveCard', move(3483, 1, 10, 2, { FromID: 255, ToID: 1, CardIDs: [1, 2], FromPosition: POSITION.top }));
  g.send('PubGsCMoveCard', move(0, 1, 5, 1, { FromID: 255, ToID: 1, CardIDs: [3] }));
  g.send('PubGsCMoveCard', move(3483, 5, 10, 1, { FromID: 1, ToID: 1, CardIDs: [3] }));
  g.send('PubGsCMoveCard', move(3483, 10, 1, 2, { FromID: 1, ToID: 255, FromPosition: POSITION.unknown, ToPosition: POSITION.top }));
}
test('Projected Jieli consecutive final hand identifies returned set without inventing order', () => {
  const g = game(); jieli(g);
  g.send('PubGsCMoveCard', move(3483, 10, 5, 1, { FromID: 1, ToID: 1, CardIDs: [2] }));
  for (const id of [1, 3]) assert.deepEqual(g.state.cards[id].locations, [zoneKey(1)]);
  assert.deepEqual(g.state.zones[zoneKey(1)].top, []);
});
test('An intervening unrelated move cancels Jieli delayed return inference', () => {
  const g = game(); jieli(g);
  g.send('PubGsCMoveCard', move(0, 1, 5, 1, { FromID: 255, ToID: 0, CardIDs: [4] }));
  g.send('PubGsCMoveCard', move(3483, 10, 5, 1, { FromID: 1, ToID: 1, CardIDs: [2] }));
  assert.notDeepEqual(g.state.cards[1].locations, [zoneKey(1)]);
  assert.notDeepEqual(g.state.cards[3].locations, [zoneKey(1)]);
});
