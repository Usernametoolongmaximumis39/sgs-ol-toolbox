import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNativeAdapter, planRewards } from '../src/plugins/daily-rewards/native.js';
import { planWelfare } from '../src/plugins/daily-rewards/welfare.js';
import { prepareActivities } from '../src/plugins/daily-rewards/activities.js';
import { awaitClaim, createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';

const reference = JSON.parse(readFileSync(new URL('./fixtures/rewards-privilege-military-config.json', import.meta.url)));
class Events {
  _events = {};
  on(event, caller, method) { (this._events[event] ||= []).push({ caller, method }); }
  off(event, caller, method) { this._events[event] = (this._events[event] || []).filter(row => row.caller !== caller || row.method !== method); }
  emit(event, ...args) { for (const row of [...(this._events[event] || [])]) row.method.apply(row.caller, args); }
}
function fixture() {
  const configs = structuredClone(reference), proxy = new Events(), sent = [];
  const cards = Object.assign(new Events(), { active: new Set([1, 2]), claimed: new Set(), proxy,
    IsCardActive(id) { return this.active.has(id); }, IsClaimedToday(id) { return this.claimed.has(id); },
    SendNewPrivilegeCardDailyRewardReq(id) { sent.push(['card', id]); proxy.emit(160121, { Protocol: { Data: { ProtoObj: { card_id: id, result: 1 } } } }); },
  });
  const activity = Object.assign(new Events(), {
    HasJDRewardRed: true, HasNewJDRewardRed: true, JDHaveRewardList: [], JDHaveRewardList_bp: [], NewJDHaveRewardList: [], NewJDHaveRewardList_bp: [], hadBuyJD: true, hadBuyNewJD: true,
    GetFestivalSignData() {},
    SendGetNewJDInfoReq() {
      this.NewJDHaveRewardList = [...this.NewJDHaveRewardList];
      this.NewJDHaveRewardList_bp = [...this.NewJDHaveRewardList_bp];
      this.emit('NEW_JD_INFO_SUC');
    },
    SendGetJDRewardReq(id, high, all) { assert.equal(all, false); sent.push(['jd', id, high]); this[high ? 'JDHaveRewardList_bp' : 'JDHaveRewardList'].push(id); },
    SendGetNewJDRewardReq(id, high, all) { assert.equal(all, false); sent.push(['new-jd', id, high]); this[high ? 'NewJDHaveRewardList_bp' : 'NewJDHaveRewardList'].push(id); },
    ReqDrawAllJDRwd() { throw Error('batch must not bypass exclusions'); }, ReqDrawAllNewJDRwd() { throw Error('batch must not bypass exclusions'); },
  });
  const counts = new Map([[11981101, 0], [11987201, 3300]]);
  const classes = { ActivityManager: activity, NewPrivilegeCardManager: cards,
    GameGoodsManager: { GetGoodsNumByBaseID: id => counts.get(id) ?? 0 }, TimerManager: { ServerDate: new Date(2026, 10, 14, 12) } };
  const files = { 'ff_task_daily.sgs': configs.military, 'ff_dbs_pay_gift.sgs': configs.pay, 'sys_gs_dbs_fs_goodsbaseinfo.sgs': configs.goods };
  const adapter = createNativeAdapter({ window: {}, game: { getClass: name => classes[name], getSelf: () => ({ ClientId: 41 }), getServerProxy: () => proxy, getConfigData: name => files[name + '.sgs'] } });
  return { adapter, cards, activity, configs, classes, proxy, sent, counts, files };
}
const selected = { welfare: true, activities: true, excludeCoupon: true, excludeTrial: true };
const runClaim = item => awaitClaim(item, { timeout: 20, poll: 1, valid: () => true });

test('official new weekly/monthly reward_e remains claimable with coupon/trial exclusions; numeric replies confirm exact card', async () => {
  const f = fixture(), items = planRewards(f.adapter, selected).actions.filter(row => row.key.startsWith('welfare:'));
  assert.deepEqual(items.map(row => row.key), ['welfare:new-card:1', 'welfare:new-card:2']);
  for (const item of items) assert.equal((await runClaim(item)).status, 'confirmed');
  assert.deepEqual(f.sent, [['card', 1], ['card', 2]]);
  // The native manager does not mutate last_daily_reward_time on this reply.
  assert.equal(f.cards.claimed.size, 0);
});

test('new card raw response rejects wrong ID, incomplete reply and failure; claimed/inactive cards do not send', async () => {
  for (const [body, status] of [[{ card_id: 2, result: 1 }, 'unconfirmed'], [{ card_id: 1 }, 'unconfirmed'], [{ card_id: 1, result: 4 }, 'rejected']]) {
    const f = fixture(); f.cards.SendNewPrivilegeCardDailyRewardReq = () => f.proxy.emit(160121, { Protocol: { Data: { ProtoObj: body } } });
    const result = await runClaim(planWelfare(f.adapter, { welfare: true }).actions[0]);
    assert.equal(result.status, status); if (status === 'rejected') assert.match(result.text, /错误码 4/);
  }
  const f = fixture(); f.cards.active.delete(1); f.cards.claimed.add(2);
  assert.equal(planWelfare(f.adapter, { welfare: true }).actions.length, 0);
});

test('numeric native event caller discovers new card manager without constructing a singleton', () => {
  const f = fixture(); delete f.classes.NewPrivilegeCardManager;
  f.proxy.on(160119, f.cards, () => {});
  assert.equal(f.adapter.manager('NewPrivilegeCardManager'), f.cards);
});

test('new card exclusion reads current reward data and leaves no unknown-content bypass', () => {
  const f = fixture(), item = planRewards(f.adapter, selected).actions[0];
  f.configs.pay.root.new_card.new_card_content[0].reward_e = '9020101,1';
  const excluded = { ...selected, excludeBeans: true };
  assert.equal(planRewards(f.adapter, excluded).actions.some(row => row.key === item.key), false);
  f.configs.pay.root.new_card.new_card_content[0].reward_e = '999999999,1';
  assert.equal(item.eligible(), false); assert.equal(item.send(), false); assert.deepEqual(f.sent, []);
});

test('official shortened military config claims earned free/owned deluxe tiers individually', async () => {
  const f = fixture(), items = planRewards(f.adapter, selected).actions.filter(row => row.key.startsWith('activity:'));
  assert.equal(items.length, 6);
  for (const item of items) assert.equal((await runClaim(item)).status, 'confirmed');
  assert.deepEqual(f.sent, [['jd', 1, false], ['jd', 1, true], ['new-jd', 11, false], ['new-jd', 11, true], ['new-jd', 12, false], ['new-jd', 12, true]]);
  assert.equal(planRewards(f.adapter, selected).actions.filter(row => row.key.startsWith('activity:')).length, 0);
});

test('military exclusions affect only matching tier; unlocked premium right is required again at send time', () => {
  const f = fixture(); f.counts.set(11987201, 3900);
  const plan = planRewards(f.adapter, { ...selected, excludeBeans: true });
  assert.equal(plan.actions.some(row => row.key.includes(':14:')), false);
  assert.ok(plan.actions.some(row => row.key === 'activity:new-jd:tier:4:12:0'));
  const high = plan.actions.find(row => row.key === 'activity:new-jd:tier:4:12:1');
  f.activity.hadBuyNewJD = false; assert.equal(high.eligible(), false); assert.equal(high.send(), false);
  assert.deepEqual(f.sent, []);
});

test('military queued claims recheck points, season, config and exact claimed tier', () => {
  for (const change of [f => f.counts.set(11987201, 0), f => { f.classes.TimerManager.ServerDate = new Date(2027, 2, 1); }, f => { f.configs.military.root.newdailyreward = []; }]) {
    const f = fixture(), item = planRewards(f.adapter, selected).actions.find(row => row.key === 'activity:new-jd:tier:4:12:0');
    change(f); assert.equal(item.eligible(), false); assert.equal(item.send(), false); assert.deepEqual(f.sent, []);
  }
  const f = fixture(), item = planRewards(f.adapter, selected).actions.find(row => row.key === 'activity:new-jd:tier:4:12:0');
  f.activity.NewJDHaveRewardList.push(11); assert.equal(item.done(), false);
  f.activity.NewJDHaveRewardList.push(12); assert.equal(item.done(), true); assert.equal(item.send(), false);
});

test('military table retains current high tiers after more than 4096 historical rows', () => {
  const f = fixture(); f.configs.military.root.dailyreward = [...Array.from({ length: 4100 }, (_, i) => ({ a: 1, b: i + 1, c: 0, d: '100011,1' })), { a: 146, b: 91, c: 10000, d: '100011,1' }];
  f.counts.set(11981101, 10000);
  assert.ok(planRewards(f.adapter, selected).actions.some(row => row.key === 'activity:jd:tier:53:91:0'));
});

test('military config preparation works with activity manager alone and disposal prevents reads', async () => {
  const calls = [], adapter = { manager: name => name === 'ActivityManager' ? { SendGetNewJDRewardReq() {} } : null, config: () => null, loadConfig: name => calls.push(name) };
  await prepareActivities(adapter, { activities: true }); assert.deepEqual(calls, ['ff_task_daily']);
  adapter.signal = { aborted: true }; await prepareActivities(adapter, { activities: true }); assert.equal(calls.length, 1);
});

test('controller confirms native card replies and per-tier military awards once across reload', async t => {
  const f = fixture(), data = new Map(), settings = { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, structuredClone(value)) };
  f.adapter.prepare = async () => {};
  const make = () => { const scope = new ResourceScope(); t.after(() => scope.dispose()); return createRewardsController({ adapter: f.adapter, settings, scope, timeout: 20, poll: 1 }); };
  const controller = make(); controller.options({ ...selected, automatic: true, sign: false, mail: false, tasks: false, codes: false });
  await controller.run(); assert.equal(controller.snapshot().confirmed, 8); assert.equal(f.sent.length, 8);
  await controller.run(); await make().run(); assert.equal(f.sent.length, 8);
});

test('a saved Jieyue attempt is settled only by the current season and matching reward track', async t => {
  const f = fixture(), data = new Map(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const settings = { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, structuredClone(value)) };
  const free = 'activity:new-jd:tier:4:1:0', premium = 'activity:new-jd:tier:4:1:1', otherSeason = 'activity:new-jd:tier:3:1:0';
  settings.set('account:41:attempts', { day: f.adapter.day(), items: Object.fromEntries([free, premium, otherSeason].map(key => [key, { status: 'unconfirmed' }])) });
  const controller = createRewardsController({ adapter: f.adapter, settings, scope });
  controller.options({ automatic: true, sign: false, mail: false, tasks: false, welfare: false, activities: false, codes: false });
  await controller.run();
  assert.equal(controller.snapshot().issues.length, 3);
  f.activity.NewJDHaveRewardList.push(1);
  await controller.run();
  assert.equal(settings.get('account:41:attempts').items[free].status, 'confirmed');
  assert.deepEqual(controller.snapshot().issues.map(issue => issue.key), [premium, otherSeason]);
  assert.equal(controller.snapshot().confirmed, 0);
  assert.deepEqual(f.sent, []);
});

for (const oldLedger of [false, true]) {
  test(`an unconfirmed military tier leaves other tiers runnable (old ledger: ${oldLedger})`, async t => {
    const f = fixture(), data = new Map(), scope = new ResourceScope();
    t.after(() => scope.dispose());
    const settings = { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, structuredClone(value)) };
    const ledgerKey = 'account:41:attempts', tierKey = 'activity:new-jd:tier:4:11:0';
    if (oldLedger) settings.set(ledgerKey, { day: f.adapter.day(), items: {
      [tierKey]: { status: 'unconfirmed', workflowGroup: 'activity:new-jd' },
    } });
    const send = f.activity.SendGetNewJDRewardReq;
    f.activity.SendGetNewJDRewardReq = function (id, high, all) {
      if (id === 11 && !high) f.sent.push(['no-reply']);
      else send.call(this, id, high, all);
    };
    const controller = createRewardsController({ adapter: f.adapter, settings, scope, timeout: 20, poll: 1 });
    controller.options({ ...selected, automatic: true, sign: false, mail: false, tasks: false, codes: false });
    await controller.run();
    assert.equal(controller.snapshot().confirmed, 7);
    assert.equal(settings.get(ledgerKey).items[tierKey].status, 'unconfirmed');
    await controller.run();
    assert.equal(f.sent.filter(row => row[0] === 'no-reply').length, oldLedger ? 0 : 1);
    assert.equal(f.sent.length, oldLedger ? 7 : 8);
    assert.equal(controller.snapshot().running, false);
  });
}

function jieyueController(t) {
  const f = fixture(), data = new Map(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const settings = { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, structuredClone(value)) };
  f.configs.military.root.newbp[0].reward = 201;
  f.configs.military.root.newdailyreward = [
    { a: 201, b: 13, c: 3600, d: '100011,200', e: '21356801,2' },
    { a: 201, b: 14, c: 3900, d: '9020101,100', e: '21337401,2' },
    { a: 201, b: 15, c: 4200, d: '8100201,1', e: '111801,500' },
  ];
  f.counts.set(11987201, 4200);
  f.activity.HasJDRewardRed = false;
  const controller = createRewardsController({ adapter: f.adapter, settings, scope, timeout: 60, poll: 2 });
  controller.options({ automatic: true, activities: true, sign: false, tasks: false, welfare: false, mail: false, codes: false,
    excludeCoupon: false, excludeTrial: false, excludeRecruit: false });
  return { ...f, controller, settings };
}

test('Jieyue refreshes before claiming and reads back a missing list push without resending', async t => {
  const f = jieyueController(t), server = [13, 14], key = 'activity:new-jd:tier:4:13:0';
  f.settings.set('account:41:attempts', { day: f.adapter.day(), items: { [key]: { status: 'unconfirmed' } } });
  f.activity.hadBuyNewJD = false;
  f.activity.SendGetNewJDInfoReq = function () {
    f.sent.push('query'); this.NewJDHaveRewardList = [...server]; this.emit('NEW_JD_INFO_SUC');
  };
  f.activity.SendGetNewJDRewardReq = function (id, high, all) {
    f.sent.push([id, high, all]); server.push(id); this.emit('NEW_JD_REWARD_REP');
  };
  const snapshots = []; f.controller.subscribe(state => snapshots.push(state));
  await f.controller.run();
  assert.deepEqual(f.sent, ['query', [15, false, false], 'query']);
  assert.ok(snapshots.some(s => s.status === '正在领取：节钺令第 15 档免费奖励' && s.issues.length === 0));
  assert.equal(f.controller.snapshot().confirmed, 1); assert.deepEqual(f.controller.snapshot().issues, []);
  assert.equal(f.settings.get('account:41:attempts').items[key].status, 'confirmed');
  await f.controller.run(); assert.equal(f.sent.length, 3);
});

test('Jieyue delays only unsynchronized tracks and never treats a generic event as a list', async t => {
  for (const mode of ['missing method', 'no list', 'free only', 'both lists']) {
    const f = jieyueController(t);
    if (mode === 'missing method') delete f.activity.SendGetNewJDInfoReq;
    else f.activity.SendGetNewJDInfoReq = function () {
      if (mode !== 'no list') this.NewJDHaveRewardList = mode === 'free only' ? [13, 14] : [13, 14, 15];
      if (mode === 'both lists') this.NewJDHaveRewardList_bp = [13, 14];
      this.emit('NEW_JD_INFO_SUC');
    };
    await f.controller.run();
    if (mode === 'both lists') {
      assert.deepEqual(f.sent, [['new-jd', 15, true]]);
      assert.equal(f.controller.snapshot().confirmed, 1);
    } else {
      assert.deepEqual(f.sent, mode === 'free only' ? [['new-jd', 15, false]] : []);
      assert.match(f.controller.snapshot().status, /等待游戏同步节钺令领取记录/);
    }
    assert.equal(f.activity._events.NEW_JD_INFO_SUC?.length ?? 0, 0);
  }
});

test('屯粮令 claims earned bean tiers despite other exclusions; respects ownership and bean exclusion', async () => {
  const f = fixture();
  f.configs.military.root.battletask = [{ id: 99, reward: 999, stime: '20261101T000000', etime: '20261201T000000' }];
  f.configs.military.root.dailyreward.push(...[
    { id: 1, teamid: 999, point: 7800, item: '9020101,300', ffitem: '9020101,600' },
    { id: 2, teamid: 999, point: 8400, item: '9020101,300' },
  ]);
  Object.assign(f.activity, { HasDDZTLLRewardRed: true, DDZBattlePoint: 7800, HadBuyDDZTLL: false,
    DDZBattleRewardList: [], DDZBattleAwardBpList: [],
    SendDDZTLLAwardReq(id, high, all) { assert.equal(all, false); f.sent.push([id, high]); this[high ? 'DDZBattleAwardBpList' : 'DDZBattleRewardList'].push(id); },
  });
  const planned = () => planRewards(f.adapter, selected).actions.filter(row => row.key.startsWith('activity:ddz-tll:'));
  assert.equal(planned().length, 1);
  assert.deepEqual(planned()[0].rewards(), { ItemID: 9020101, ItemNum: 300 });
  assert.equal(planRewards(f.adapter, { ...selected, excludeBeans: true }).actions.filter(row => row.key.startsWith('activity:ddz-tll:')).length, 0);
  assert.equal((await runClaim(planned()[0])).status, 'confirmed');
  assert.equal(planned().length, 0);
  f.activity.HadBuyDDZTLL = true;
  assert.equal(planned().length, 1);
  const stale = planned()[0]; f.activity.HadBuyDDZTLL = false;
  assert.equal(stale.send(), false);
  assert.deepEqual(f.sent, [[1, false]]);
  f.activity.HadBuyDDZTLL = true;
  assert.equal((await runClaim(planned()[0])).status, 'confirmed');
  assert.deepEqual(f.sent, [[1, false], [1, true]]);
});
