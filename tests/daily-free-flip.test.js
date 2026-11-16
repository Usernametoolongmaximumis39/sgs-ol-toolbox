import test from 'node:test';
import assert from 'node:assert/strict';
import { planFreeFlip } from '../src/plugins/daily-rewards/free-flip.js';
import { awaitClaim } from '../src/plugins/daily-rewards/controller.js';

function fixture(values = [1, 0, 0, 0, 0]) {
  const sent = [], handlers = new Map();
  const proxy = { on(type, caller, fn) { (handlers.get(type) || handlers.set(type, []).get(type)).push({ caller, fn }); },
    off(type, caller, fn) { handlers.set(type, (handlers.get(type) || []).filter(item => item.caller !== caller || item.fn !== fn)); },
    event(type, data) { for (const item of [...(handlers.get(type) || [])]) item.fn.call(item.caller, data); } };
  const bless = { FreeBlessItemEnough: true };
  const activity = { TreasureInfoVo: { SessionId: 71, Time_Next_Free: 100, IsCanFreeOpen: true }, TreasureCardVos: values.map(Card => ({ Card })), TreasureNewCardFreeCard: true,
    SendOpenTreasureCard(...args) { sent.push(args); }, SendResetTreasureCard() { throw Error('must not reset'); } };
  const adapter = { manager: name => ({ ActivityManager: activity, BlessManager: bless })[name], proxy: () => proxy };
  return { activity, bless, adapter, sent, proxy, actions: () => planFreeFlip(adapter, { activities: true, autoFlip: true }).actions };
}
test('free flip defaults off without touching managers and never starts five empty cards', () => {
  assert.deepEqual(planFreeFlip({ manager() { throw Error('disabled'); } }, { activities: true }), { actions: [], notes: [] });
  const f = fixture([0, 0, 0, 0, 0]); assert.equal(f.actions().length, 0); assert.deepEqual(f.sent, []);
  f.activity.TreasureCardVos = [1, 2, 3, 1, 2].map(Card => ({ Card })); assert.equal(f.actions().length, 0);
  f.activity.TreasureCardVos = [255, 0, 0, 0, 0].map(Card => ({ Card })); assert.equal(f.actions().length, 0);
});
test('only an eligible already-started round sends exactly one card at explicit zero cost', () => {
  const f = fixture(); const action = f.actions()[0];
  assert.equal(action.exclusionMode, 'free-draw'); action.send(); assert.deepEqual(f.sent, [[71, 0, 1, 1]]);
  assert.equal(action.done(), false); f.activity.TreasureCardVos[1].Card = 2; assert.equal(action.done(), true);
});
test('first recharge, activity eligibility and current free flag are all required', () => {
  const f = fixture(); f.bless.FreeBlessItemEnough = false; assert.equal(f.actions().length, 0);
  f.bless.FreeBlessItemEnough = true; f.activity.TreasureNewCardFreeCard = false; assert.equal(f.actions().length, 0);
  f.activity.TreasureNewCardFreeCard = true; f.activity.TreasureInfoVo.IsCanFreeOpen = false; assert.equal(f.actions().length, 0);
});
test('changed round, cards, free deadline, free entitlement or destroyed manager cancels planned send', () => {
  for (const mutate of [f => { f.activity.TreasureInfoVo.SessionId++; }, f => { f.activity.TreasureInfoVo.Time_Next_Free++; },
    f => { f.activity.TreasureCardVos[0].Card = 3; }, f => { f.activity.TreasureCardVos = []; }, f => { f.activity.TreasureNewCardFreeCard = false; }, f => { f.activity.destroyed = true; }]) {
    const f = fixture(), action = f.actions()[0]; mutate(f); assert.equal(action.eligible(), false); assert.equal(action.send(), false); assert.deepEqual(f.sent, []);
  }
});
test('free response must match season, operation, zero result and exactly the requested card', async () => {
  const f = fixture(), action = f.actions()[0];
  const packet = { Protocol: { SeaonId: 71, OPType: 12, Result: 0, CardItems: [1, 2, 0, 0, 0].map(Card => ({ Card })) } };
  const accept = action.confirmations[0].accept;
  for (const change of [{ SeaonId: 72 }, { OPType: 11 }, { Result: 1 }, { CardItems: [1, 0, 2, 0, 0].map(Card => ({ Card })) }]) assert.equal(accept({ Protocol: { ...packet.Protocol, ...change } }), false);
  const original = f.activity.SendOpenTreasureCard;
  f.activity.SendOpenTreasureCard = (...args) => { original(...args); f.proxy.event('ClientTreasureNTF', packet); };
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 30, poll: 2 })).status, 'confirmed');
  assert.deepEqual(f.sent, [[71, 0, 1, 1]]);
});
