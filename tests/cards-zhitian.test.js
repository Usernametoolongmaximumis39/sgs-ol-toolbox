import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMessage } from '../src/core/protocol.js';
import { initialState, reduce, zoneKey, POSITION } from '../src/plugins/cards/model.js';

const type = 'CGsRoleSpellOptRep';
function recording() {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload: projectMessage(type, payload), seq: ++seq });
  send('MsgGamePlayCardNtf', { CardList: [1,2,3,4,5,6,7,8,9] });
  return { send, get state() { return state; }, get top() { return state.zones[zoneKey(1)].top; } };
}
test('Zhitian native and PB responses preserve seven top cards in order through journal projection', () => {
  for (const payload of [
    { SpellID: 3744, SeatID: 0, Type: 30, Datas: [7,6,5,4,3,2,1] },
    { Datas: [], Protocol: { SpellID: 3744, SeatID: 0, Type: 50, Datas: [7,6,5,4,3,2,1] } },
    { data: { spell_id: 3744, seat_id: 0, opt_type: 50, data: [7,6,5,4,3,2,1] } },
  ]) {
    const r = recording(); r.send(type, payload);
    assert.deepEqual(r.top, [7,6,5,4,3,2,1]);
    assert.equal(r.state.deckRemaining, 9, 'looking does not draw or shrink the pile');
    assert.equal(r.state.recentCurrent, null, 'looking is not playing a card');
    assert.ok(r.top.every(id => r.state.cards[id].seen));
  }
});
test('Zhitian updates shorter views, consumes drawn prefix and clears on reconnect/shuffle', () => {
  const r = recording();
  r.send(type, { SpellID: 3744, Type: 30, Datas: [1,2,3,4,5,6,7] });
  r.send('PubGsCMoveCard', { FromZone: 1, FromID: 255, FromPosition: POSITION.top, ToZone: 5, ToID: 0, CardIDs: [], CardCount: 2, MoveType: 1 });
  assert.deepEqual(r.top, [3,4,5,6,7]);
  assert.deepEqual(r.state.cards[1].locations, ['5:0']);
  r.send(type, { SpellID: 3744, Type: 50, Datas: [3,4,5] });
  assert.deepEqual(r.top, [3,4,5]);
  r.send('MsgReconnectGame', {});
  assert.equal(r.state.zones[zoneKey(1)], undefined);
  r.send(type, { SpellID: 3744, Type: 30, Datas: [3] });
  assert.deepEqual(r.top, [3]);
  r.send('PubGsCMoveCard', { FromZone: 2, FromID: 255, ToZone: 9, ToID: 255, CardIDs: [], CardCount: 1, MoveType: 1 });
  assert.deepEqual(r.top, []);
});
test('unrelated, outgoing, masked or malformed skill responses cannot invent top cards', () => {
  const r = recording(); r.send(type, { SpellID: 3744, Type: 30, Datas: [1,2] });
  for (const patch of [
    { SpellID: 3746 }, { Type: 73 }, { Type: 0 }, { isSend: true },
    { Datas: [] }, { Datas: [3,0,4] }, { Datas: [3,3] }, { Datas: [65535] },
    { Datas: [true] }, { Datas: ['3'] }, { Datas: [1,2,3,4,5,6,7,8] },
  ]) {
    r.send(type, { SpellID: 3744, Type: 50, Datas: [3,4], ...patch });
    assert.deepEqual(r.top, [1,2]);
  }
  assert.deepEqual(projectMessage(type, { SpellID: 3744, Datas: [1], token: 'secret', other: { data: [9] } }), { SpellID: 3744, Datas: [1] });
  assert.throws(() => projectMessage(type, { Datas: Array(2049).fill(1) }), /长度超限/);
});
