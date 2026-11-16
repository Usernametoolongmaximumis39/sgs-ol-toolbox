import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMessage } from '../src/core/protocol.js';
import { initialState, reduce, zoneKey, POSITION } from '../src/plugins/cards/model.js';

function recording() {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload: projectMessage(type, payload), seq: ++seq });
  send('MsgGamePlayCardNtf', { CardList: [1,2,3,4,5,6,7,8,9] });
  return { send, get state() { return state; }, get pile() { return state.zones[zoneKey(1)]; } };
}
test('Siqi preserves a known one-card bottom placement even when identities are omitted', () => {
  const r = recording();
  r.send('PubGsCMoveCard', { FromZone: 1, FromPosition: POSITION.top, ToZone: 5, ToID: 0, CardIDs: [1], CardCount: 1, MoveType: 1 });
  r.send('PubGsCMoveCard', { SpellID: 3543, FromZone: 5, FromID: 0, ToZone: 1, ToPosition: 0, CardIDs: [], CardCount: 1, MoveType: 15 });
  assert.deepEqual(r.pile.bottom, [1]);
  assert.deepEqual(r.state.cards[1].locations, [zoneKey(1)]);
  assert.equal(r.state.deckRemaining, 9);
});
test('Siqi viewing and bottom consumption retain order without treating viewing as a draw', () => {
  const r = recording();
  r.send('GsCRoleOptTargetNtf', { SpellID: 3543, Type: 28, Params: [3,2,1] });
  assert.deepEqual(r.pile.bottom, [3,2,1]);
  assert.equal(r.state.deckRemaining, 9);
  r.send('PubGsCMoveCard', { SpellID: 3543, FromZone: 1, FromPosition: 0, ToZone: 3, CardIDs: [], CardCount: 1, MoveType: 1 });
  assert.deepEqual(r.pile.bottom, [2,1]);
  assert.deepEqual(r.state.cards[3].locations, [zoneKey(3)]);
});
test('Siqi cannot infer a multi-card hidden placement order from the known hand set', () => {
  const r = recording();
  r.send('PubGsCMoveCard', { FromZone: 1, FromPosition: POSITION.top, ToZone: 5, ToID: 0, CardIDs: [1,2], CardCount: 2, MoveType: 1 });
  r.send('PubGsCMoveCard', { SpellID: 3543, FromZone: 5, FromID: 0, ToZone: 1, ToPosition: 0, CardIDs: [], CardCount: 2, MoveType: 15 });
  assert.deepEqual(r.pile.bottom, []);
  assert.deepEqual(r.state.cards[1].locations, [zoneKey(1)], 'whole hand destination is known, its internal order is not');
});
test('Jieli reads only the counted pile group, including PB wrappers', () => {
  const r = recording();
  r.send('GsCRoleOptTargetNtf', { Protocol: { spell_id: 3483, opt_type: 28, params: [3,2,3,2,1,8,9] } });
  assert.deepEqual(r.pile.top, [3,2,1]);
  assert.equal(r.state.cards[8]?.seen ?? false, false);
  assert.equal(r.state.deckRemaining, 9);
  r.send('PubGsCMoveCard', { FromZone: 1, FromPosition: POSITION.top, ToZone: 5, ToID: 0, CardIDs: [], CardCount: 1, MoveType: 1 });
  assert.deepEqual(r.pile.top, [2,1]);
});
test('unrelated, outgoing, malformed and masked choices cannot invent pile identities', () => {
  for (const payload of [
    { SpellID: 3543, Type: 29, Params: [1] },
    { SpellID: 3543, Type: 28, Params: [1,0] },
    { SpellID: 3543, Type: 28, Params: [1,1] },
    { SpellID: 3543, Type: 28, Params: [1], isSend: true },
    { SpellID: 3483, Type: 28, Params: [2,1,1,2] },
    { SpellID: 3483, Type: 28, Params: [2,0,1,0] },
    { SpellID: 3612, Type: 28, Params: [1,0,1] },
  ]) {
    const r = recording(); r.send('GsCRoleOptTargetNtf', payload);
    assert.deepEqual(r.pile.top, []); assert.deepEqual(r.pile.bottom, []);
  }
});
