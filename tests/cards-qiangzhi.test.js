import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, cardsInZone, zoneKey } from '../src/plugins/cards/model.js';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';

// Reconstructed official QiangZhiPo / SelectCardWindow contract, not live traffic.
test('界强识 native hand request records the full target hand and tracks departures', async t => {
  const scope = new ResourceScope(), journal = new SessionJournal();
  t.after(() => scope.dispose());
  let state = initialState();
  journal.subscribe(event => { state = reduce(state, event); });
  const target = { event() {} };
  const bridge = installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  const send = async payload => { target.event('GsCRoleOptTargetNtf', payload); await bridge.flush(); };
  const packet = { SpellID: 3876, Type: 3, SeatID: 0, SrcSeatID: 0, TargetSeatID: 2, Params: [101, 102, 103] };
  class NativeRequest {}
  for (const [key, value] of Object.entries(packet)) Object.defineProperty(NativeRequest.prototype, key, { get: () => key === 'Params' ? new Uint32Array(value) : value });
  await send({ Protocol: new NativeRequest() });
  const hand = () => cardsInZone(state, zoneKey(5, 2));
  assert.deepEqual(hand(), [101, 102, 103]);
  assert.deepEqual(cardsInZone(state, zoneKey(5, 0)), []);
  for (const extra of [{ Type: 28 }, { SpellID: 484 }, { isSend: true }, { TargetSeatID: 255 },
    { Params: [] }, { Params: [0] }, { Params: [101, 101] }, { Params: [-1] }]) {
    await send({ ...packet, Params: [104], ...extra });
    assert.deepEqual(hand(), [101, 102, 103]);
  }
  target.event('PubGsCMoveCard', { FromZone: 5, FromID: 2, ToZone: 2, ToID: 255, CardIDs: [102], CardCount: 1, MoveType: 1 });
  await bridge.flush();
  assert.deepEqual(hand(), [101, 103]);
  await send({ ...packet, Params: [105, 106] });
  assert.deepEqual(hand(), [105, 106]);
});
