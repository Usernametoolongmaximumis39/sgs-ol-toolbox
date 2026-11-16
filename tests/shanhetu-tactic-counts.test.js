import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, tacticCount, ROUND_TACTICS, TURN_TACTICS } from '../src/plugins/shanhetu/tactic-counts.js';
import { projectMessage } from '../src/core/protocol.js';
const run = () => {
  let state = initialState(), seq = 0;
  return { get state() { return state; }, send(type, payload = {}, sessionId = 1) {
    state = reduce(state, { type, payload, seq: ++seq, sessionId }); return state;
  }, count(id, seat = 0) { return tacticCount(state, seat, id)?.text; } };
};
const start = f => { f.send('MsgGamePlayCardNtf', { CardList: [1, 2, 3] }); f.send('MsgGameTurnNtf', { TurnCnt: 1 }); f.send('GsCGamephaseNtf', { SeatID: 0, Round: 0 }); };
const draw = (f, n, extra = {}) => f.send('PubGsCMoveCard', { FromZone: 1, ToZone: 5, MoveType: 1, ToID: 0, CardCount: n, ...extra });
test('dragon cycles count drawn cards, not uses, initial hands, gains or other seats', () => {
  const f = run(); f.send('MsgGamePlayCardNtf', { CardList: [1] }); draw(f, 4); assert.equal(f.count(2143), '0/6');
  f.send('MsgGameTurnNtf', { TurnCnt: 1 }); draw(f, 5); assert.equal(f.count(2143), '5/6'); assert.equal(f.count(2104), '5/9');
  draw(f, 1); assert.equal(f.count(2143), '0/6'); draw(f, 3); assert.equal(f.count(2104), '0/9');
  draw(f, 2, { ToID: 1 }); draw(f, 2, { MoveType: 2 }); draw(f, 2, { FromZone: 5 });
  f.send('PubGsCUseCard', { SeatID: 0, SpellID: 2, useType: 1 }); assert.equal(f.count(2143), '3/6');
  assert.equal(f.count(2143, 1), '2/6'); assert.equal(f.count(999), undefined);
});
test('real and virtual card uses, slash cycle and draw batches have distinct semantics', () => {
  const f = run(); start(f);
  for (let i = 0; i < 2; i++) f.send('PubGsCUseCard', { SeatID: 0, SpellID: 1, useType: 1 });
  f.send('MsgNtfUseCardType', { CastSeatID: 0, SpellID: 1, useType: 1 });
  f.send('PubGsCUseCard', { SeatID: 0, SpellID: 2, useType: 1 });
  f.send('PubGsCUseCard', { SeatID: 0, SpellID: 1, useType: 2 });
  f.send('PubGsCUseCard', { SeatID: 0, SpellID: 1, useType: 1, isSend: true });
  draw(f, 3); draw(f, 2); draw(f, 0);
  assert.equal(f.count(2042), '0/3'); assert.equal(f.count(2079), '4'); assert.equal(f.count(2082), '2');
  f.send('GsCGamephaseNtf', { SeatID: 0, Round: 4 }); assert.equal(f.count(2079), '4');
  f.send('GsCGamephaseNtf', { SeatID: 1, Round: 0 }); assert.equal(f.count(2079), '0'); assert.equal(f.count(2082), '0');
  assert.equal(f.count(2143), '5/6');
});
test('all legacy activation groups count confirmed notifications and reset on their own boundary', () => {
  const f = run(); start(f);
  for (const ItemID of [...ROUND_TACTICS, ...TURN_TACTICS]) {
    f.send('decodeRogueLikeItemEffectNtf', { ItemID, ItemParams: [0] });
    f.send('decodeRogueLikeItemEffectNtf', { ItemID, ItemParams: [0] });
    assert.equal(f.count(ItemID), '2');
  }
  f.send('decodeRogueLikeItemEffectNtf', { ItemID: 2033, ItemParams: [0], error_id: 1 });
  f.send('GsCGamephaseNtf', { SeatID: 1, Round: 0 });
  for (const id of ROUND_TACTICS) assert.equal(f.count(id), '2');
  for (const id of TURN_TACTICS) assert.equal(f.count(id), '0');
  f.send('MsgGameTurnNtf', { TurnCnt: 2 });
  for (const id of ROUND_TACTICS) assert.equal(f.count(id), '0');
});
test('late entry, reconnect and gaps stay unknown until a valid reset boundary; next game and login clear history', () => {
  const f = run(); f.send('toolbox:snapshot', { inGame: true, selfSeatId: 0 });
  assert.equal(f.count(2143), '?/6'); assert.equal(f.count(2033), '?');
  start(f); draw(f, 4); f.send('toolbox:gap'); assert.equal(f.count(2143), '?/6'); assert.equal(f.count(2079), '?');
  f.send('GsCGamephaseNtf', { SeatID: 1, Round: 0 }); assert.equal(f.count(2079), '0'); assert.equal(f.count(2033), '?');
  f.send('MsgGameTurnNtf', { TurnCnt: 2 }); assert.equal(f.count(2033), '0'); assert.equal(f.count(2143), '?/6');
  f.send('MsgGamePlayCardNtf', { CardList: [1], IsResume: true }, 2); assert.equal(f.count(2143), '?/6');
  f.send('MsgGamePlayCardNtf', { CardList: [1] }, 3); assert.equal(f.count(2143), '0/6');
  const previous = f.state; assert.equal(reduce(previous, { type: 'PubGsCUseCard', seq: previous.lastSeq, sessionId: 3, payload: {} }), previous);
  f.send('ClientLoginRep', {}, 3); assert.equal(f.state.active, false); assert.deepEqual(f.state.seats, {});
});
test('protocol projection accepts exact public count fields without retaining other native data', () => {
  assert.deepEqual(projectMessage('PubGsCUseCard', { seatId: 0, spellID: 1, useType: 1, secret: 'omit' }), { SeatID: 0, SpellID: 1, useType: 1 });
  assert.deepEqual(projectMessage('MsgNtfUseCardType', { castSeatId: 0, spellId: 1, useType: 1 }), { CastSeatID: 0, SpellID: 1, useType: 1 });
  assert.deepEqual(projectMessage('decodeRogueLikeItemEffectNtf', { Protocol: { errCode: 0, Data: { ProtoObj: { itemId: 2196, param: [0], private: 'omit' } } } }),
    { ItemID: 2196, ItemParams: [0], error_id: 0 });
});

const own = (f, ids, extra = {}) => f.send('GsCRoleOptTargetNtf', { Type: 64, SeatID: 0, Params: [1, 999, ids.length, ...ids], ...extra });
test('single rider dragon starts at acquisition, ignores pre-acquisition draws and duplicate full-list sync', () => {
  const f = run(); start(f); own(f, []); draw(f, 11);
  own(f, [2143]); assert.equal(f.count(2143), '0/6');
  draw(f, 5); assert.equal(f.count(2143), '5/6');
  own(f, [2143]); assert.equal(f.count(2143), '5/6');
  draw(f, 1); assert.equal(f.count(2143), '0/6');
  own(f, []); draw(f, 4); own(f, [2143]); assert.equal(f.count(2143), '0/6');
});
test('new tier and other seats have independent acquisition boundaries; unrelated options cannot reset them', () => {
  const f = run(); start(f); own(f, [2104]); draw(f, 7); assert.equal(f.count(2104), '7/9');
  own(f, [2143]); assert.equal(f.count(2143), '0/6'); draw(f, 2);
  own(f, [], { Type: 63 }); own(f, [], { isSend: true }); own(f, [2143], { SeatID: 1 });
  assert.equal(f.count(2143), '2/6'); assert.equal(f.count(2143, 1), '0/6');
  f.send('toolbox:snapshot', { inGame: true, selfSeatId: 0 }); assert.equal(f.count(2143), '2/6');
});
test('late attach and reconnect do not turn an existing dragon into a fake zero; a subsequent verified acquisition can start fresh', () => {
  const f = run(); f.send('toolbox:snapshot', { inGame: true }); own(f, [2143]); assert.equal(f.count(2143), '?/6');
  f.send('MsgGameTurnNtf', { TurnCnt: 3 }); draw(f, 2); own(f, [2143]); assert.equal(f.count(2143), '?/6');
  own(f, []); own(f, [2143]); assert.equal(f.count(2143), '0/6'); draw(f, 2); assert.equal(f.count(2143), '2/6');
  f.send('MsgReconnectGame'); own(f, [2143]); assert.equal(f.count(2143), '?/6');
  own(f, []); own(f, [2143]); assert.equal(f.count(2143), '0/6');
});
test('malformed ownership packets do not grant false zero, and new games do not inherit acquisition history', () => {
  const f = run(); start(f); own(f, [2143]); draw(f, 3);
  own(f, [], { Params: [0, 2, 2143] }); assert.equal(f.count(2143), '?/6');
  own(f, [2143]); assert.equal(f.count(2143), '?/6');
  f.send('MsgGamePlayCardNtf', { CardList: [1] }, 2);
  assert.equal(tacticCount(f.state, 0, 2143, true).text, '?/6');
  f.send('GsCRoleOptTargetNtf', { Type: 64, SeatID: 0, Params: [0, 1, 2143] }, 2);
  assert.equal(f.count(2143), '0/6');
});
