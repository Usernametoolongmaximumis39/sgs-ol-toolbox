import test from 'node:test';
import assert from 'node:assert/strict';
import { excludedReward } from '../src/plugins/daily-rewards/exclusions.js';
import { planRewards } from '../src/plugins/daily-rewards/native.js';
import { createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';

test('four exclusions resolve native IDs, names and trial type/period; mixed rewards skip the whole claim', () => {
  const table = new Map([[1, { name: '免费招募令' }], [2, { name: '500抵价券' }], [3, { name: '武将体验卡', TypeID: 149 }], [4, { name: '普通银两' }], [5, { name: '限时武将', TypeID: 25, period: 3600 }]]);
  const adapter = { goods: id => table.get(id) };
  for (const [key, id, name] of [['excludeRecruit', 1, '免费招募令'], ['excludeCoupon', 2, '抵价券'], ['excludeTrial', 3, '体验卡'], ['excludeTrial', 5, '体验卡'], ['excludeBeans', 9020101, '欢乐豆'], ['excludeBeans', 9030101, '欢乐豆']]) {
    assert.equal(excludedReward(adapter, { [key]: true }, [[4, 100], [id, 1]]), name);
    assert.equal(excludedReward(adapter, {}, [[id, 1]]), '');
  }
  assert.equal(excludedReward(adapter, { excludeTrial: true }, '4,100'), '');
});

test('exclusions block native task send, recheck changed rewards, and leave unrelated rewards claimable', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const items = [1, 2, 3].map(id => ({ id, CanAward: true, CanRewardCount: 1, baseVo: { TaskRewardItem: [{ ItemID: id }] } }));
  const sent = [], manager = { allTasks: items, GetServerTaskDataByTaskID: id => items.find(task => task.id === id),
    RequestTaskAward(id) { sent.push(id); items[id - 1].HasAward = true; } };
  const adapter = { account: () => 'A', day: () => '2026-11-13', config: () => null,
    goods: id => ({ name: id === 2 ? '抵价券' : '银两' }), manager: name => name === 'TaskManager' ? manager : null };
  const settingsMap = new Map(), settings = { get: (key, fallback) => settingsMap.get(key) ?? fallback, set: (key, value) => settingsMap.set(key, structuredClone(value)) };
  const controller = createRewardsController({ adapter, settings, scope, timeout: 25, poll: 2 });
  controller.options({ automatic: true, sign: false, mail: false, activities: false, welfare: false, codes: false, excludeCoupon: true });
  const queued = planRewards(adapter, controller.snapshot().config).actions[0];
  items[0].baseVo.TaskRewardItem = [{ ItemID: 2 }];
  assert.equal(queued.eligible(), false); assert.equal(queued.send(), false); assert.deepEqual(sent, []);
  await controller.run(); assert.deepEqual(sent, [3]);
  controller.options({ excludeCoupon: false }); await controller.run(); assert.deepEqual(sent, [3, 1, 2]);
});

test('free recruitment and bean endpoints obey exclusions and unknown bundles defer', () => {
  const manager = { FreeOpenGeneralPackTime: 0, CanFreeOpenGeneral: () => true, SendClientUseGeneralDrawCardReq() {} };
  const beans = { DdzFreeBeanCount: 0, CanGetDdzFreeBean: true, SendClientGetWeekFreeBeanReq() {} };
  const officer = { DayRewardTime: 1, WeekRewardTime: 1, CanGetOfficerDayReward: () => true, CanGetOfficerWeekReward: () => true, sendGetDayReward() {}, sendGetWeekReward() {} };
  const adapter = { day: () => '2026-11-13', config: name => name === 'ff_general_chest_info_config.sgs' ? { root: { Common: [{ freeGeneralDropId: 8123456 }] } } : null, manager: name => ({ GameGeneralManager: manager, ActivityGameDataManager: beans, OfficerManager: officer })[name] };
  assert.equal(planRewards(adapter, { activities: true }).actions.length, 4);
  const plan = planRewards(adapter, { activities: true, excludeRecruit: true, excludeBeans: true });
  assert.equal(plan.actions.length, 0);
  assert.ok(plan.notes.some(note => note.text.includes('奖励明细未就绪')));
});

test('legacy category switches migrate to default inclusion while account opt-ins stay isolated', t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose()); let owner = 'A';
  const data = new Map([['account:A:options', { automatic: false, sign: false, mail: false, tasks: false, clipboardCodes: true }]]);
  const controller = createRewardsController({ adapter: { account: () => owner, day: () => '2026-11-13' }, scope,
    settings: { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, value) } });
  assert.equal(controller.snapshot().config.sign, true); assert.equal(controller.snapshot().config.mail, true);
  controller.options({ excludeTrial: true }); owner = 'B';
  assert.equal(controller.snapshot().config.excludeTrial, true); assert.equal(controller.snapshot().config.clipboardCodes, false);
});

test('native military points without goods rows do not block login quests; unknown extra items still block', () => {
  const adapter = { goods: () => null };
  const rewards = [{ ItemID: 11981101, ItemNum: 30 }, { ItemID: 11987201, ItemNum: 90 }];
  assert.equal(excludedReward(adapter, { excludeCoupon: true, excludeTrial: true }, rewards), '');
  assert.equal(excludedReward(adapter, { excludeCoupon: true }, [...rewards, { ItemID: 99999999 }]), '奖励明细未就绪');
  assert.equal(excludedReward(adapter, { excludeBeans: true }, [...rewards, { ItemID: 9020101 }]), '欢乐豆');
});
