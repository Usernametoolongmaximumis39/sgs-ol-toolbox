import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { createMilitaryPopupGuard } from '../src/plugins/daily-rewards/military-popup.js';

function fixture() {
  const scope = new ResourceScope(), shown = [], claims = [];
  let owner = 'a', clock = 100;
  const dispatcher = { _(name, ...args) { shown.push([name, ...args]); return 'opened'; } };
  const activity = { SendGetJDRewardReq(...args) { claims.push(args); }, SendGetNewJDRewardReq(...args) { claims.push(args); } };
  const guard = createMilitaryPopupGuard({ scope, game: { getDispatcher: () => dispatcher } }, () => owner, () => clock);
  const popup = (type = 2046, promotion = true) => dispatcher._('OldbackOneClickDrawAwdWin', ['reward'], promotion, type);
  return { scope, shown, claims, activity, guard, popup, dispatcher, owner: value => owner = value, time: value => clock = value };
}

for (const [kind, type, method] of [['jd', 86, 'SendGetJDRewardReq'], ['new-jd', 2046, 'SendGetNewJDRewardReq']]) {
  test(`${kind}: automatic claim suppresses promotion only, manual claims restore it`, () => {
    const f = fixture();
    f.guard(`activity:${kind}:tier:1:2:0`, f.activity, () => f.activity[method](2, false, false));
    assert.equal(f.claims.length, 1);
    f.popup(type); assert.equal(f.shown.length, 0);
    f.popup(type, false); f.popup(999); f.dispatcher._('NewCodexBuyPopWindow');
    assert.equal(f.shown.length, 3);
    f.activity[method](3, false, false); f.popup(type);
    assert.equal(f.shown.length, 4);
    f.scope.dispose();
  });
}
test('guard expires, checks account, rolls back failed sends and releases patches', () => {
  const f = fixture(), original = f.dispatcher._;
  const send = () => f.guard('activity:new-jd:1', f.activity, () => {});
  send(); f.owner('b'); f.popup(); assert.equal(f.shown.length, 1);
  f.owner('a'); f.time(15100); f.popup(); assert.equal(f.shown.length, 2);
  f.time(16000);
  assert.throws(() => f.guard('activity:new-jd:1', f.activity, () => { throw Error('failed'); }));
  f.popup(); assert.equal(f.shown.length, 3);
  send(); f.popup(); assert.equal(f.shown.length, 3);
  f.scope.dispose(); assert.equal(f.dispatcher._, original);
  f.popup(); assert.equal(f.shown.length, 4);
});
