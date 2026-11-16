import test from 'node:test';
import assert from 'node:assert/strict';
import { planRewards, createNativeAdapter } from '../src/plugins/daily-rewards/native.js';
import { prepareActivityQuests } from '../src/plugins/daily-rewards/quest-rewards.js';
import { awaitClaim } from '../src/plugins/daily-rewards/controller.js';

class Events {
  handlers = new Map();
  on(event, caller, fn) { const list = this.handlers.get(event) || []; list.push({ caller, fn }); this.handlers.set(event, list); }
  off(event, caller, fn) { this.handlers.set(event, (this.handlers.get(event) || []).filter(x => x.caller !== caller || x.fn !== fn)); }
  emit(event, data) { for (const x of [...(this.handlers.get(event) || [])]) x.fn.call(x.caller, data); }
  get count() { return [...this.handlers.values()].reduce((n, x) => n + x.length, 0); }
}
const exclusions = { excludeBeans: true, excludeRecruit: true, excludeCoupon: true, excludeTrial: true };

test('officer daily beans stay excluded while weekly salary passes other exclusions and confirms reply without stamp update', async () => {
  const proxy = new Events(), sent = [];
  const officer = { OfficerSLv: 4, DataInited: true, DayRewardTime: 0, WeekRewardTime: 0,
    CanGetOfficerDayReward: () => true, CanGetOfficerWeekReward: () => true,
    sendGetDayReward() { sent.push('day'); },
    sendGetWeekReward() { sent.push('week'); proxy.emit(23969, { Protocol: { result: 0 } }); },
  };
  const adapter = { day: () => '2026-11-15', manager: name => name === 'OfficerManager' ? officer : null, proxy: () => proxy,
    config: name => name === 'h5_officer.sgs' ? { root: { officer: [{ ID: 4, dayReward: '9020101,100', weekReward: '10,100' }] } } : null,
    goods: id => id === 10 ? { name: '银两' } : null };
  const actions = planRewards(adapter, { activities: true, ...exclusions }).actions;
  assert.deepEqual(actions.map(x => x.key), ['officer:week']);
  assert.equal((await awaitClaim(actions[0], { valid: () => true, timeout: 30, poll: 1 })).status, 'confirmed');
  assert.equal(officer.WeekRewardTime, 0); assert.deepEqual(sent, ['week']); assert.equal(proxy.count, 0);
  const daily = planRewards(adapter, { activities: true, excludeCoupon: true }).actions.find(x => x.key === 'officer:day');
  assert.ok(daily);
  assert.equal(daily.confirmations[0].accept({ Protocol: { Data: { ProtoObj: { result: 0 } } } }), true);
  assert.equal(daily.confirmations[0].accept({ Protocol: { Data: { ProtoObj: { result: 2 } } } }), false);
  assert.equal(daily.rejections[0].accept({ Protocol: { Data: { ProtoObj: { result: 2 } } } }), true);
});

test('all three free drums remain claimable with exclusions and stop at zero', async () => {
  let sent = 0;
  const guild = { GuildID: 8, CanDrum: true, LeftFreeDrumTimes: 3,
    SendGuildDonate() { sent++; this.LeftFreeDrumTimes--; }, SendGuildDrumUse() { throw Error('paid'); } };
  const adapter = { day: () => '2026-11-15', manager: name => name === 'GuildManager' ? guild : null, config: () => null };
  for (let i = 3; i > 0; i--) {
    const action = planRewards(adapter, { welfare: true, ...exclusions }).actions[0];
    assert.equal(action.key, `welfare:drum:8:${i}`);
    assert.equal((await awaitClaim(action, { valid: () => true, timeout: 30, poll: 1 })).status, 'confirmed');
  }
  assert.equal(sent, 3); assert.equal(planRewards(adapter, { welfare: true, ...exclusions }).actions.length, 0);
});

test('guild discovery matches numeric official proxy handlers', () => {
  const guild = { SendGuildDonate() {} };
  const adapter = createNativeAdapter({ game: { getClass: () => null, getServerProxy: () => ({ _events: { 22517: { caller: guild } } }) }, window: {} });
  assert.equal(adapter.manager('GuildManager'), guild);
});

test('refresh fetches missing login quest before planning, preserves 30/90/30 rewards and cleans subscriptions', async () => {
  const proxy = new Events(), sent = [], tasks = [];
  const manager = { allTasks: tasks, UpTaskState() {},
    GetServerTaskDataByTaskID: id => tasks.find(x => x.id === id),
    getTaskListFromServer() {
      tasks.push({ id: 8001, IsNewQusetType: true, HasServerData: true, IsFromServer: true, completeTimes: 0,
        CanAward: true, CanRewardCount: 1, HasAward: false,
        baseVo: { name: '每日登录游戏', maxComplete: 1, TaskRewardItem: [{ ItemID: 11, ItemNum: 30 }, { ItemID: 12, ItemNum: 90 }, { ItemID: 13, ItemNum: 30 }] } });
      proxy.emit(107009, {});
    },
    RequestTaskAward(id, select, count) { sent.push([id, select, count]); tasks[0].HasAward = true; },
  };
  const adapter = { day: () => '2026-11-15', manager: name => name === 'ActivityQuestManager' ? manager : null, proxy: () => proxy, config: () => null,
    goods: id => ({ name: ({ 11: '军典积分', 12: '节钺积分', 13: '经验' })[id] }) };
  assert.equal(planRewards(adapter, { tasks: true, ...exclusions }).actions.length, 0);
  await prepareActivityQuests(adapter, { tasks: true }); assert.equal(proxy.count, 0);
  const action = planRewards(adapter, { tasks: true, ...exclusions }).actions[0];
  assert.match(action.label, /每日登录游戏/); assert.deepEqual(action.rewards().map(x => x.ItemNum), [30, 90, 30]);
  action.send(); assert.deepEqual(sent, [[8001, 0, 1]]); assert.equal(action.done(), true);
  assert.equal(planRewards(adapter, { tasks: true, ...exclusions }).actions.length, 0);
  const controller = new AbortController(); controller.abort();
  await prepareActivityQuests({ ...adapter, signal: controller.signal }, { tasks: true }); assert.equal(tasks.length, 1);
});

test('uninitialized officer requests native info once, waits for data, and removes listeners', async () => {
  const { prepareActivities } = await import('../src/plugins/daily-rewards/activities.js');
  const proxy = new Events(); let requests = 0;
  const officer = { DataInited: false, CanGetOfficerWeekReward() {}, sendOfficerInfo() { requests++; this.DataInited = true; proxy.emit(23975, {}); } };
  const adapter = { manager: name => name === 'OfficerManager' ? officer : null, config: () => ({}), proxy: () => proxy };
  await prepareActivities(adapter, { activities: true });
  assert.equal(requests, 1); assert.equal(officer.DataInited, true); assert.equal(proxy.count, 0);
  await prepareActivities(adapter, { activities: true }); assert.equal(requests, 1);
  officer.DataInited = false;
  await prepareActivities({ ...adapter, signal: { aborted: true } }, { activities: true }); assert.equal(requests, 1);
});

test('live lowercase officer id and named proxy reply claim daily salary with coupon/trial exclusions', async () => {
  const proxy = new Events(); let sent = 0;
  const officer = { OfficerSLv: 38, DataInited: true, DayRewardTime: 1794591521, WeekRewardTime: 1794591521,
    CanGetOfficerDayReward: () => true, CanGetOfficerWeekReward: () => false,
    sendGetDayReward() { sent++; proxy.emit('decodeUserOfficerGetDayRewardRep', { Protocol: { Data: { ProtoObj: { result: 0 } } } }); }, sendGetWeekReward() {} };
  const adapter = { day: () => '2026-11-15', manager: name => name === 'OfficerManager' ? officer : null, proxy: () => proxy,
    config: name => name === 'h5_officer.sgs' ? { root: { officer: [{ id: 38, dayReward: '100011,300;12119999,6;9020101,200', weekReward: '112301,3;100301,15;953901,3' }] } } : null,
    goods: id => ({ name: ({ 100011: '银两', 12119999: '雁翎甲', 9020101: '欢乐豆' })[id] }) };
  const action = planRewards(adapter, { activities: true, excludeCoupon: true, excludeTrial: true }).actions[0];
  assert.ok(action); assert.equal(action.key, 'officer:day');
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 30, poll: 1 })).status, 'confirmed');
  assert.equal(sent, 1); assert.equal(proxy.count, 0);
  assert.equal(planRewards(adapter, { activities: true, excludeBeans: true }).actions.length, 0);
});
