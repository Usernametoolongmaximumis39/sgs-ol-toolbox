import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';
import { initialState, reduce, cardsInZone, zoneKey } from '../src/plugins/cards/model.js';

// Contract fixtures reconstructed from the official client: ZUIFENG=4025,
// OPT_SKILL_FLAG1=28; SelectCardWindowServer consumes every Params item as a
// card ID and uses TargetSeatID as the viewed hand. No live packet is claimed.
const TYPE = 'GsCRoleOptTargetNtf';
const hand = (state, seatId = 2) => cardsInZone(state, zoneKey(5, seatId));
const look = extra => ({ SeatID: 0, SrcSeatID: 0, TargetSeatID: 2, SpellID: 4025, Type: 28,
  Param: 0, Params: [101, 102, 103], ...extra });
const move = extra => ({ FromID: 255, FromZone: 1, ToID: 2, ToZone: 5,
  CardCount: 3, CardIDs: [0, 0, 0], MoveType: 1, SpellID: 0, ...extra });

async function harness(t, onNative = () => {}) {
  const journal = new SessionJournal(), scope = new ResourceScope();
  let state = initialState();
  journal.subscribe(event => { state = reduce(state, event); });
  const target = { event(...args) { onNative(this, args); return 'native-result'; } };
  const bridge = installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  t.after(() => scope.dispose());
  const send = async (type, packet) => { target.event(type, packet); await bridge.flush(); };
  await send('MsgGamePlayCardNtf', { CardList: [101, 102, 103, 104, 105, 106, 107, 108] });
  journal.push('toolbox:snapshot', { inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }, { seatId: 2 }, { seatId: 3 }] });
  await send('PubGsCMoveCard', move());
  return { journal, bridge, target, send, get state() { return state; } };
}

test('醉锋 native prototype getters survive projection and async delivery to the target hand', async t => {
  let originalThis, originalArgs, unrelatedReads = 0;
  const h = await harness(t, (self, args) => { originalThis = self; originalArgs = args; });
  const params = new Uint32Array([101, 102, 103]);
  class NativeLook {
    get SeatID() { return 0; }
    get SrcSeatID() { return 3; }
    get TargetSeatID() { return 2; }
    get SpellID() { return 4025; }
    get Type() { return 28; }
    get Param() { return 0; }
    get Params() { return params; }
    get UnrelatedModel() { unrelatedReads++; throw new Error('must not inspect arbitrary protocol getters'); }
  }
  const body = new NativeLook(), packet = { Data: { Protocol: body } }, receiver = {};
  assert.equal(h.target.event.call(receiver, TYPE, [packet], 'extra'), 'native-result');
  assert.equal(originalThis, receiver);
  assert.deepEqual(originalArgs, [TYPE, [packet], 'extra']);
  assert.deepEqual(hand(h.state), [], 'native dispatch must not run card reducer synchronously');
  params[0] = 108;
  await h.bridge.flush();
  assert.deepEqual(h.journal.events.at(-1).payload.Params, [101, 102, 103]);
  assert.equal(h.journal.events.at(-1).payload.TargetSeatID, 2);
  assert.deepEqual(hand(h.state), [101, 102, 103]);
  assert.deepEqual(hand(h.state, 0), []);
  assert.deepEqual(hand(h.state, 3), []);
  assert.equal(unrelatedReads, 0);
});

for (const targetAlias of ['TargetSeatID', 'TargetSeatId', 'targetSeatID', 'targetSeatId']) {
  test(`醉锋 wrapped target alias ${targetAlias} with lower-case param fields reaches the same owner`, async t => {
    const h = await harness(t);
    await h.send(TYPE, { ProtoObj: {
      seatId: 0, srcSeatId: 3, [targetAlias]: 2, spellId: 4025, type: 28,
      param: 0, params: new Uint32Array([101, 102, 103]),
    } });
    assert.deepEqual(hand(h.state), [101, 102, 103]);
    assert.deepEqual(hand(h.state, 0), []);
    assert.deepEqual(hand(h.state, 3), []);
  });
}

test('醉锋 complete hand replaces stale target certainty and a later empty snapshot preserves it', async t => {
  const h = await harness(t);
  await h.send('decodeClientGetCardInfoResp', { SeatID: 2, CardIDs: [104] });
  await h.send(TYPE, look());
  assert.deepEqual(hand(h.state), [101, 102, 103]);
  assert.deepEqual(h.state.cards[104].locations, ['?']);
  assert.equal(h.state.zones[zoneKey(5, 2)].count, 3);
  h.journal.push('toolbox:snapshot', {
    inGame: true, selfSeatId: 0, handCardIds: [],
    seats: [{ seatId: 0, handCount: 0 }, { seatId: 2, handCount: 3, knownHandCardIds: [] }],
  });
  assert.deepEqual(hand(h.state), [101, 102, 103]);
  await h.send(TYPE, look({ Params: [102, 103] }));
  assert.deepEqual(hand(h.state), [102, 103]);
  assert.deepEqual(h.state.cards[101].locations, ['?']);
  assert.equal(h.state.zones[zoneKey(5, 2)].count, 2);
});

test('醉锋 knowledge follows later known use and becomes uncertain after a partial hidden transfer', async t => {
  const h = await harness(t);
  await h.send(TYPE, look());
  await h.send('PubGsCUseCard', { SeatID: 2, CardID: 101, useType: 1 });
  assert.equal(h.state.recentBySeat[2], 101);
  await h.send('PubGsCMoveCard', move({ FromID: 2, FromZone: 5, ToID: 255, ToZone: 2,
    CardIDs: [101], CardCount: 1, MoveType: 2 }));
  assert.deepEqual(hand(h.state), [102, 103]);
  assert.deepEqual(cardsInZone(h.state, zoneKey(2)), [101]);
  await h.send('PubGsCMoveCard', move({ FromID: 2, FromZone: 5, ToID: 3,
    CardIDs: [0], CardCount: 1, MoveType: 18 }));
  assert.deepEqual(hand(h.state), []);
  assert.deepEqual(hand(h.state, 3), []);
  assert.deepEqual(cardsInZone(h.state, zoneKey(5, 2), 'possible'), [102, 103]);
  assert.deepEqual(cardsInZone(h.state, zoneKey(5, 3), 'possible'), [102, 103]);
});

for (const [label, changes] of [
  ['missing target', { TargetSeatID: undefined }],
  ['invalid sentinel target', { TargetSeatID: 255 }],
  ['negative target', { TargetSeatID: -1 }],
  ['boolean target', { TargetSeatID: false }],
  ['missing params', { Params: undefined }],
  ['empty params', { Params: [] }],
  ['zero masked params', { Params: [101, 0, 103] }],
  ['duplicate params', { Params: [101, 101] }],
  ['negative params', { Params: [101, -102] }],
  ['fractional params', { Params: [101, 102.5] }],
  ['nonfinite params', { Params: [101, NaN] }],
  ['record objects are not card IDs', { Params: [{ CardId: 101 }] }],
  ['other option type', { Type: 29 }],
  ['missing option type', { Type: undefined }],
  ['other skill', { SpellID: 4026 }],
  ['outgoing packet', { isSend: true }],
]) {
  test(`醉锋 ignores ${label} while retaining the previously confirmed hand and count`, async t => {
    const h = await harness(t);
    await h.send(TYPE, look());
    const knownBefore = hand(h.state), countBefore = h.state.zones[zoneKey(5, 2)].count;
    assert.deepEqual(knownBefore, [101, 102, 103]);
    assert.equal(countBefore, 3);
    await h.send(TYPE, look(changes));
    assert.deepEqual(hand(h.state), knownBefore);
    assert.equal(h.state.zones[zoneKey(5, 2)].count, countBefore);
    for (const seatId of [0, 3]) assert.deepEqual(hand(h.state, seatId), []);
  });
}
