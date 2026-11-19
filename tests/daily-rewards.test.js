import { createIcon } from '../src/ui/icons.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import plugin from '../src/plugins/daily-rewards/index.js';
import { createNativeAdapter, nativeMethod, planRewards, taskSkipReason } from '../src/plugins/daily-rewards/native.js';
import { awaitClaim, createRewardsController, rewardWorkflowGroup } from '../src/plugins/daily-rewards/controller.js';

class Emitter {
  constructor() { this._events = {}; }
  on(type, caller, fn) { (this._events[type] ||= []).push({ caller, fn }); }
  off(type, caller, fn) { this._events[type] = (this._events[type] || []).filter(item => item.caller !== caller || item.fn !== fn); }
  event(type, ...args) { for (const item of [...(this._events[type] || [])]) item.fn.apply(item.caller, args); }
}
function storage() { const map = new Map(); return new Settings({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }, 'daily:'); }
function fixture(t, change = {}) {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const sent = [], classes = {}, proxy = new Emitter();
  const self = { ClientId: 41, VipActiveLevel: 2, OfficerLevel: 0 };
  const login = Object.assign(new Emitter(), { LoginUserName: 'test-account', IsOnLine: true, signDataInit: true, CheckInfo: [1], SubCheckGetInfo: [], VipPrizeGetInfo: [], AddupprizeDays: [], TotalSignNum: 1,
    RequestLoginPrize(day, kind) { sent.push(['sign', day, kind]); this[kind === 1 ? 'SubCheckGetInfo' : kind === 2 ? 'VipPrizeGetInfo' : 'AddupprizeDays'].push(day); this.event('GET_LOGIN_REWARD', kind, day); } });
  const first = { mid: 'm1', hasAttachMent: true, AttachmentType: 2, Geted: false, attachment: { getStringKey: key => key === 'key' ? ['gift-key'] : [] } };
  const second = { mid: 'm2', hasAttachMent: true, AttachmentType: 1, Geted: false, attachment: { getStringKey: key => key === 'key' ? ['gift-key-2'] : key === 'id' ? ['42'] : [] } };
  const mail = Object.assign(new Emitter(), { systemMailList: [first, second], friendMailList: [],
    SendClientDbsGetgmawardReq(key, id, sender) { sent.push(['mail-item', key, id, sender]); first.Geted = true; this.event('GET_GIFT_SUCCESS'); },
    DeleteMail() { throw new Error('Must never delete mail'); }, ReadMail() { throw new Error('Must never need a read request'); } });
  const gift = Object.assign(new Emitter(), { SendMySingleGift(id, key, mid) { sent.push(['mail-gift', id, key, mid]); second.Geted = true; mail.event('GET_GIFT_SUCCESS'); } });
  const task = { id: 101, CanAward: true, HasAward: false, CanRewardCount: 1, baseVo: { name: '每日活跃', clientTaskType: 3, maxComplete: 1 }, TaskConditions: [{ reqType: 1 }] };
  const tasks = Object.assign(new Emitter(), { allTasks: [task], GetServerTaskDataByTaskID(id) { return id === 101 ? task : null; },
    RequestTaskAward(id, selected, count) { sent.push(['task', id, selected, count]); task.HasAward = true; task.CanAward = false; this.event('REWARD_REP', id); } });
  const ranked = Object.assign(new Emitter(), { NewPWDailyRewardId: 0, NewPWDailyWinNum: 3,
    get CanGetDailyReward() { return this.NewPWDailyRewardId < 2; },
    reqDailyReward() { sent.push(['ranked', this.NewPWDailyRewardId + 1]); this.NewPWDailyRewardId++; this.event('NEWTTRANKDATA_CHANGE'); } });
  // Object.assign materializes getters; use a native-style getter here.
  Object.defineProperty(ranked, 'CanGetDailyReward', { configurable: true, get() { return this.NewPWDailyRewardId < 2; } });
  const timer = { ServerDate: new Date(2026, 10, 13) };
  Object.assign(classes, { LoginManager: login, MailManager: mail, GiftManager: gift, TaskManager: tasks, TianTiManager: ranked, TimerManager: timer, UserData: { Self: self } });
  const signConfig = { root: { bigprize: [{ month: 11, loginday: 1, goods: '1,1', doubleVipLevel: 1, totalRewards: '2,1' }] } };
  const game = { getClass: name => classes[name], getSelf: () => self, getServerProxy: () => proxy, getConfigData: name => name === 'gn_zonghe' ? signConfig : null };
  const adapter = createNativeAdapter({ window: {}, game });
  const settings = storage();
  settings.set("account:41:options", { schemaVersion: 2, excludeRecruit: false, excludeCoupon: false, excludeTrial: false });
  const controller = createRewardsController({ adapter, settings, scope, timeout: 40, poll: 2, ...change });
  return { scope, sent, classes, proxy, self, login, mail, gift, first, second, task, tasks, ranked, timer, game, adapter, controller, settings };
}

// Drive one scheduled cycle without waiting for a real minute.
const enable = controller => { controller.options({ automatic: true }); return controller; };

test('conditional return rewards and raw selection lists never issue ordinary task claims', async t => {
  const f = fixture(t); f.ranked.NewPWDailyRewardId = 2;
  f.task.baseVo = { _name: '回归登录-第四天', _rewardItem: { ReturnReward: { RewardItem: [] } } };
  f.controller.options({ sign: false, mail: false });
  await enable(f.controller).run();
  assert.equal(f.sent.length, 0);
  assert.match(f.controller.snapshot().capabilities.map(n => n.text).join(''), /回归登录-第四天.*回归任务已排除/);
  f.task.baseVo = { _name: '二选一', taskSelectReward: [{ id: 1 }, { id: 2 }] };
  await f.controller.run();
  assert.equal(f.sent.length, 0);
  assert.match(f.controller.snapshot().capabilities.map(n => n.text).join(''), /需要选择奖励/);
});

test('task rejection matches exact task, persists error and removes proxy listeners', async t => {
  const f = fixture(t); f.ranked.NewPWDailyRewardId = 2;
  f.controller.options({ sign: false, mail: false });
  f.tasks.RequestTaskAward = id => {
    f.sent.push(['task', id]);
    f.proxy.event('SmsgTaskFailed', { Protocol: { TaskID: 999, ErrorCode: 7 } });
    f.proxy.event('SmsgTaskFailed', { Protocol: { TaskID: id, ErrorCode: 23 } });
  };
  await enable(f.controller).run();
  const issue = f.controller.snapshot().issues[0];
  assert.equal(issue.status, 'rejected');
  assert.match(issue.label, /每日活跃/);
  assert.match(issue.text, /错误码 23/);
  assert.equal((f.proxy._events.SmsgTaskFailed || []).length, 0);
  await f.controller.run(); assert.equal(f.sent.length, 1);
  assert.match(f.controller.snapshot().issues[0].text, /错误码 23/);
});

test('unrelated task rejection remains uncertain and historical claimed tasks reconcile without resend', async t => {
  const f = fixture(t); f.ranked.NewPWDailyRewardId = 2;
  f.controller.options({ sign: false, mail: false });
  f.tasks.RequestTaskAward = id => { f.sent.push(['task', id]); f.proxy.event('SmsgTaskFailed', { Protocol: { TaskID: 999, ErrorCode: 7 } }); };
  await enable(f.controller).run();
  assert.equal(f.controller.snapshot().issues[0].status, 'unconfirmed');
  f.task.HasAward = true;
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const next = createRewardsController({ adapter: f.adapter, settings: f.settings, scope });
  await next.run();
  assert.equal(next.snapshot().issues.length, 0);
  assert.equal(f.sent.length, 1);
});

test('release panel omits legacy return details without deleting or resending intent', t => {
  const f = fixture(t), dom = new JSDOM('<main></main>'); t.after(() => dom.window.close());
  f.task.baseVo = { _name: '回归登录-第四天', _rewardItem: { ReturnReward: {} } };
  f.settings.set('account:41:attempts', { day: f.adapter.day(), items: { 'task:101': { status: 'unconfirmed', at: 1 } } });
  let panel;
  plugin.activate({ window: dom.window, document: dom.window.document, game: f.game, settings: f.settings, scope: f.scope, ui: { icon: spec => createIcon(dom.window.document, spec), registerPanel(spec) { panel = spec; } } });
  const dispose = panel.render(dom.window.document.querySelector('main'));
  const detail = dom.window.document.querySelector('[data-rewards-attention]');
  assert.equal(detail, null);
  assert.equal(f.settings.get('account:41:attempts').items['task:101'].status, 'unconfirmed');
  assert.equal(f.sent.length, 0); dispose();
});

test('daily rewards runs all three categories independently, confirms native state, retains mail', async t => {
  const f = fixture(t);
  assert.equal(f.controller.snapshot().config.automatic, false);
  await enable(f.controller).run();
  assert.equal(f.controller.snapshot().confirmed, 8);
  assert.equal(f.sent.length, 8);
  assert.deepEqual(f.sent.filter(item => item[0] === 'sign').map(item => item[2]), [1, 2, 5]);
  assert.deepEqual(f.sent.filter(item => item[0] === 'ranked').map(item => item[1]), [1, 2]);
  assert.equal(f.mail.systemMailList.length, 2);
  await enable(f.controller).run();
  assert.equal(f.sent.length, 8, 'no duplicate claim on repeated execution');
});

test('categories can execute separately and use no old script global', async t => {
  const f = fixture(t);
  f.controller.options({ sign: false, mail: true, tasks: false });
  await enable(f.controller).run();
  assert.deepEqual(f.sent.map(item => item[0]), ['mail-item', 'mail-gift']);
  assert.equal(f.controller.snapshot().confirmed, 2);
});

test('native method fallback accepts unique signature and does not invoke getters or constructors', () => {
  let calls = 0;
  class Login {
    B(day,type){const payload={};payload.bigdays=day;payload.reqtype=type;calls++;return payload;}
    get dangerous() { throw new Error('Getter was called'); }
  }
  const object = new Login();
  const method = nativeMethod(object, 'RequestLoginPrize', ['.bigdays=', '.reqtype=']);
  assert.deepEqual(method(2, 1), { bigdays: 2, reqtype: 1 });
  assert.equal(calls, 1);
  object.C = function(day,type){let payload={};payload.bigdays=day;payload.reqtype=type;};
  assert.equal(nativeMethod(object, 'RequestLoginPrize', ['.bigdays=', '.reqtype=']), null, 'ambiguous match must not issue a request');
});

test('existing event caller resolution is bounded and does not create singleton instances', t => {
  const f = fixture(t);
  const native = f.classes.LoginManager;
  let getterCalled = false;
  f.classes.LoginManager = class { static get Instance() { getterCalled = true; throw new Error('not allowed'); } };
  f.proxy._events.error = [{ caller: { signDataInit: true } }, { caller: native }];
  // The first fake event lacks a viable request method; manager lookup must reject it.
  delete f.proxy._events.error[0].caller.signDataInit;
  assert.equal(f.adapter.manager('LoginManager'), native);
  assert.equal(getterCalled, false);
});

test('unsupported, birthday and automatic-delete mails are excluded', t => {
  const f = fixture(t);
  f.mail.systemMailList = [
    { ...f.first, mid: 'birthday', IsBirthdayMail: true },
    { ...f.first, mid: 'sys', attachment: { getStringKey: key => key === 'opt' ? ['sys'] : ['key'] } },
    { ...f.first, mid: 'unsupported', AttachmentType: 17 },
  ];
  const plan = planRewards(f.adapter, { mail: true });
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.notes.length, 3);
  assert.deepEqual(f.sent, []);
});

test('mail uses exact gift ID/key/mid and item sender parameters', async t => {
  const f = fixture(t); f.first.fromUserName = 'friend';
  f.controller.options({ sign: false, tasks: false });
  await enable(f.controller).run();
  assert.deepEqual(f.sent, [['mail-item', 'gift-key', 'm1', 'friend'], ['mail-gift', 42, 'gift-key-2', 'm2']]);
});

test('completed exchanges, selected reward, purchase, expired and repeated tasks are skipped', () => {
  const task = { CanAward: true, baseVo: { name: '活跃任务' }, TaskConditions: [] };
  for (const bad of [
    { ...task, baseVo: { name: '消耗道具兑换' } },
    { ...task, TaskConditions: [{ reqType: 30 }] },
    { ...task, baseVo: { HaveSelectReward: true } },
    { ...task, IsBuyTask: true }, { ...task, HasExpired: true },
    { ...task, CanRewardCount: 2 }, { ...task, baseVo: { maxComplete: 8 } },
  ]) assert.ok(taskSkipReason(bad));
  assert.equal(taskSkipReason(task), '');
});

test('tasks not in server records are not accepted or claimed', t => {
  const f = fixture(t); f.tasks.GetServerTaskDataByTaskID = () => null;
  f.ranked.CanGetDailyReward; f.ranked.NewPWDailyRewardId = 2;
  assert.equal(planRewards(f.adapter, { tasks: true }).actions.length, 0);
});

test('unrelated reply is not success and timeout never retries after plugin reload', async t => {
  const f = fixture(t);
  f.controller.options({ mail: false, tasks: false });
  f.login.RequestLoginPrize = () => { f.sent.push(['pending']); f.login.event('GET_LOGIN_REWARD', 1, 99); };
  const first = enable(f.controller).run(), again = enable(f.controller).run();
  assert.equal(first, again, 'one in-flight queue');
  await first;
  assert.equal(f.controller.snapshot().confirmed, 0);
  assert.equal(f.controller.snapshot().status, '本轮已确认 0 项，另有 1 项待核对（未重发）。以游戏内领取记录为准。');
  assert.equal(f.sent.length, 1);
  const nextScope = new ResourceScope(); t.after(() => nextScope.dispose());
  const next = createRewardsController({ adapter: f.adapter, settings: f.settings, scope: nextScope, timeout: 20, poll: 2 });
  await enable(next).run();
  assert.equal(f.sent.length, 1, 'persisted pending result prevents resend after reload');
  assert.equal(next.snapshot().status, f.controller.snapshot().status);
});

test('one unconfirmed workflow does not block independent mail and task rewards', async t => {
  const f = fixture(t);
  f.login.RequestLoginPrize = () => { f.sent.push(['pending-sign']); };
  await enable(f.controller).run();
  assert.equal(f.sent.filter(row => row[0] === 'pending-sign').length, 1);
  assert.equal(f.sent.filter(row => row[0].startsWith('mail-')).length, 2);
  assert.equal(f.sent.filter(row => row[0] === 'task').length, 1);
  assert.equal(f.sent.filter(row => row[0] === 'ranked').length, 2);
  assert.equal(f.controller.snapshot().confirmed, 5);
  assert.match(f.controller.snapshot().status, /1 项待核对（未重发）/);
  await enable(f.controller).run();
  assert.equal(f.sent.length, 6, 'uncertain sign was not resent after checking the independent rewards');
});

test('legacy pending ledger only blocks its dependent signup day', async t => {
  const f = fixture(t);
  f.controller.options({ mail: false, tasks: false, welfare: false, activities: false, codes: false });
  f.login.CheckInfo = [1, 2];
  f.settings.set('account:41:attempts', { day: '2026-11-13', items: { 'sign:1:1': { status: 'pending' } } });
  await enable(f.controller).run();
  assert.deepEqual(f.sent, [['sign', 2, 1]]);
  assert.match(f.controller.snapshot().status, /1 项待核对（未重发）/);
});

test('a late authoritative state settles its pending group without another request', async t => {
  const f = fixture(t);
  f.controller.options({ mail: false, tasks: false, welfare: false, activities: false, codes: false });
  const original = f.login.RequestLoginPrize;
  f.login.RequestLoginPrize = () => { f.sent.push(['pending-sign']); };
  await enable(f.controller).run();
  f.login.SubCheckGetInfo.push(1);
  f.login.RequestLoginPrize = original;
  await enable(f.controller).run();
  assert.deepEqual(f.sent, [['pending-sign'], ['sign', 1, 2], ['sign', 1, 5]]);
  const ledger = f.settings.get('account:41:attempts');
  assert.equal(ledger.items['sign:1:1'].status, 'confirmed');
});

test('dependent workflow identities group trees, drums, ranked steps and explicit activity rounds', () => {
  for (const [first, next] of [
    ['welfare:tree:start', 'welfare:tree:claim'],
    ['welfare:drum:8:3', 'welfare:drum:8:2'],
    ['ranked:1', 'ranked:2'], ['free-beans:0', 'free-beans:1'],
    ['activity:jd:1/2', 'activity:jd:1,3/2'],
  ]) assert.equal(rewardWorkflowGroup({ key: first }), rewardWorkflowGroup({ key: next }));
  assert.equal(rewardWorkflowGroup({ key: 'flip:1', workflowGroup: 'flip:round-7' }), 'flip:round-7');
  assert.notEqual(rewardWorkflowGroup({ key: 'task:1' }), rewardWorkflowGroup({ key: 'task:2' }));
  assert.notEqual(rewardWorkflowGroup({ key: 'mail:1' }), rewardWorkflowGroup({ key: 'mail:2' }));
});

test('account changes interrupt an in-flight request and leave other account settings off', async t => {
  const f = fixture(t);
  f.controller.options({ automatic: true });
  f.login.RequestLoginPrize = () => { f.sent.push(['old-account']); f.self.ClientId = 42; };
  await enable(f.controller).run();
  assert.deepEqual(f.sent, [['old-account']]);
  assert.equal(f.controller.snapshot().confirmed, 0);
  assert.equal(f.controller.snapshot().config.automatic, false);
  assert.match(f.controller.snapshot().status, /已停止/);
});

test('disable interrupts waits, removes native listeners and blocks later sends', async t => {
  const f = fixture(t);
  f.login.RequestLoginPrize = () => { f.sent.push(['once']); queueMicrotask(() => f.scope.dispose()); };
  await enable(f.controller).run();
  assert.equal(f.sent.length, 1);
  assert.equal(Object.values(f.login._events).flat().length, 0);
  await enable(f.controller).run(); assert.equal(f.sent.length, 1);
});

test('state/date not ready and persistence failure cannot send', async t => {
  const f = fixture(t);
  f.timer.ServerDate = null;
  await enable(f.controller).run(); assert.deepEqual(f.sent, []);
  f.timer.ServerDate = new Date(2026, 10, 13);
  f.settings.set = () => { throw new Error('full'); };
  await enable(f.controller).run(); assert.deepEqual(f.sent, []);
  assert.match(f.controller.snapshot().status, /无法保存/);
});

test('config load is deferred until execution and abort before loading finishes sends nothing', async t => {
  const f = fixture(t);
  let loaded = 0, resolve;
  f.game.getConfigData = () => null;
  f.game.loadConfigData = () => { loaded++; return new Promise(done => { resolve = done; }); };
  f.controller.refresh(); assert.equal(loaded, 0);
  const run = enable(f.controller).run(); assert.equal(loaded, 1);
  f.scope.dispose(); resolve(); await run;
  assert.deepEqual(f.sent, []);
});

test('a response function return value alone never means confirmed success', async () => {
  const manager = new Emitter(), signal = new AbortController().signal;
  const result = await awaitClaim({ manager, send: () => true, done: () => false }, { signal, valid: () => true, timeout: 12, poll: 2 });
  assert.equal(result.status, 'unconfirmed');
  assert.equal(Object.values(manager._events).flat().length, 0);
});

test('code replies correlate requests, reject without success, and persist across days and reloads', async t => {
  const f = fixture(t);
  f.gift.SendGetGift = (type, code, mid) => {
    f.sent.push(['code', code]);
    f.proxy.event('ClientPickupgiftbagRep', { Protocol: { Type: type, CDKey: 'unrelated', mid, Result: 1 } });
    f.proxy.event('ClientPickupgiftbagRep', { Protocol: { Type: type, CDKey: code, mid, Result: code === 'BAD' ? 3 : 1 } });
  };
  f.controller.options({ sign: false, mail: false, tasks: false, welfare: false, activities: false, codeText: 'GOOD BAD GOOD NEXT' });
  await enable(f.controller).run();
  assert.deepEqual(f.sent, [['code', 'GOOD'], ['code', 'BAD'], ['code', 'NEXT']]);
  assert.equal(f.controller.snapshot().confirmed, 2);
  assert.equal(f.controller.snapshot().logs.filter(row => row.status === 'rejected').length, 1);
  assert.equal(Object.values(f.proxy._events).flat().length, 0);
  f.timer.ServerDate = new Date(2026, 10, 14);
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const next = createRewardsController({ adapter: f.adapter, settings: f.settings, scope, timeout: 20, poll: 2 });
  await enable(next).run(); assert.equal(f.sent.length, 3, 'codes are not resent the next day');
  f.self.ClientId = 42;
  next.options({ sign: false, mail: false, tasks: false, welfare: false, activities: false, codeText: 'GOOD' });
  await enable(next).run(); assert.equal(f.sent.length, 4, 'another account owns its own code ledger');
});

test('code timeout persists and abort clears both success and rejection listeners', async t => {
  const f = fixture(t);
  f.gift.SendGetGift = () => { f.sent.push(['code']); queueMicrotask(() => f.scope.dispose()); };
  f.controller.options({ sign: false, mail: false, tasks: false, welfare: false, activities: false, codeText: 'PENDING' });
  await enable(f.controller).run();
  assert.equal(Object.values(f.proxy._events).flat().length, 0);
  f.timer.ServerDate = new Date(2026, 10, 14);
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const next = createRewardsController({ adapter: f.adapter, settings: f.settings, scope, timeout: 20, poll: 2 });
  await enable(next).run(); assert.equal(f.sent.length, 1);
  assert.equal(next.snapshot().confirmed, 0);
});

test('first account-monitor tick does not abort an already running same-account queue', async t => {
  const f = fixture(t); let monitor;
  const scope = { signal: f.scope.signal, add: fn => f.scope.add(fn), interval: fn => { monitor = fn; } };
  const controller = createRewardsController({ adapter: f.adapter, settings: f.settings, scope, timeout: 20, poll: 2 });
  controller.options({ sign: false, mail: false, tasks: false, welfare: false, activities: false, codeText: 'FIRST' });
  f.gift.SendGetGift = (Type, CDKey, mid) => { monitor(); f.proxy.event('ClientPickupgiftbagRep', { Protocol: { Type, CDKey, mid, Result: 1 } }); };
  await enable(controller).run();
  assert.equal(controller.snapshot().confirmed, 1);
  assert.match(controller.snapshot().status, /本轮完成/);
});

test('standalone plugin mounts its panel, leaves automation off and removes panel callbacks', t => {
  const f = fixture(t), dom = new JSDOM('<main></main>'); t.after(() => dom.window.close());
  let panel;
  plugin.activate({ window: dom.window, document: dom.window.document, game: f.game, settings: f.settings, scope: f.scope, ui: { icon: spec => createIcon(dom.window.document, spec), registerPanel(spec) { panel = spec; } } });
  assert.equal(plugin.manifest.id, 'daily-rewards');
  const dispose = panel.render(dom.window.document.querySelector('main'));
  const automatic = dom.window.document.querySelector('[data-reward-option="automatic"]');
  assert.equal(automatic.getAttribute('aria-checked'), 'false');
  assert.equal(dom.window.document.querySelectorAll('[data-rewards-run], [data-rewards-stop]').length, 0);
  assert.deepEqual(f.sent, []);
  dispose(); assert.equal(dom.window.document.querySelector('main').children.length, 0);
});

test('release panel contains six reward cards and three code switches with no editors or logs', t => {
  const f = fixture(t), dom = new JSDOM('<main></main>'); t.after(() => dom.window.close());
  const host = dom.window.document.querySelector('main'), shadow = host.attachShadow({ mode: 'open' });
  f.settings.set('account:41:options', {});
  let panel;
  plugin.activate({ window: dom.window, document: dom.window.document, game: f.game, settings: f.settings, scope: f.scope, ui: { icon: spec => createIcon(dom.window.document, spec), registerPanel(spec) { panel = spec; } } });
  panel.render(shadow);
  assert.equal(shadow.querySelectorAll('[data-reward-exclusions] button').length, 6);
  assert.equal(shadow.querySelector('[data-reward-exclusions]').textContent, '免费招募令跳过抵价券跳过体验卡跳过欢乐豆领取邮件领取免费翻翻跳过');
  assert.equal(shadow.querySelectorAll('[data-reward-code-options] button').length, 3);
  assert.equal(shadow.querySelectorAll('textarea, input[type=url], [data-rewards-log]').length, 0);
  assert.equal(shadow.querySelectorAll('[data-rewards-attention], [data-rewards-code-history], [data-reward-choices]').length, 0);
  assert.equal(shadow.querySelectorAll('input').length, 0);
  const excluded = shadow.querySelector('[data-reward-option=excludeBeans]');
  excluded.click();
  assert.equal(excluded.getAttribute('aria-pressed'), 'true');
  assert.equal(excluded.classList.contains('is-excluded'), true);
  assert.equal(f.controller.snapshot().config.excludeBeans, true);
});

test('completed cumulative silver task claims once without relaxing cost or completion guards', async t => {
  const f = fixture(t); f.ranked.NewPWDailyRewardId = 2;
  f.task.baseVo.name = '累计消耗3500银两';
  f.controller.options({ sign: false, mail: false });
  const blocked = [
    { CanAward: false }, { HasAward: true }, { IsBuyTask: true },
    { TaskConditions: [{ reqType: 30 }] },
    { baseVo: { ...f.task.baseVo, desc: '领取时扣除100银两' } },
    { baseVo: { ...f.task.baseVo, desc: '消耗道具兑换奖励' } },
    { HaveSelectReward: true },
  ];
  for (const change of blocked) assert.notEqual(taskSkipReason({ ...f.task, ...change }), '');
  assert.equal(taskSkipReason(f.task), '');
  await enable(f.controller).run();
  await f.controller.run();
  assert.equal(f.sent.filter(item => item[0] === 'task').length, 1);
  assert.equal(f.task.HasAward, true);
});

test('return task names are excluded even without reward matrix; daily tasks still run', async t => {
  for (const name of ['回归登录-第四天','回流活跃奖励','老玩家任务']) {
    const f=fixture(t);f.task.baseVo={_name:name,maxComplete:1};
    assert.match(taskSkipReason(f.task),/回归任务已排除/);
    assert.match(taskSkipReason(f.task,{allowSelection:true}),/回归任务已排除/);
    assert.equal(planRewards(f.adapter,{tasks:true}).actions.some(a=>a.key==='task:101'),false);
    f.task.baseVo={name:'每日活跃',maxComplete:1};
    assert.equal(planRewards(f.adapter,{tasks:true}).actions.some(a=>a.key==='task:101'),true);
  }
});

test('excluded return attempts stay persisted but disappear from issues and unresolved total', async t => {
 const f=fixture(t);f.ranked.NewPWDailyRewardId=2;f.task.baseVo={_name:'回归登录-第四天'};
 f.settings.set('account:41:attempts',{day:f.adapter.day(),items:{'task:101':{status:'unconfirmed',at:1},'task:999':{status:'unconfirmed',at:2,label:'回流奖励'}}});
 f.controller.options({sign:false,mail:false});
 assert.equal(f.controller.snapshot().issues.length,0);
 await enable(f.controller).run();
 assert.equal(f.controller.snapshot().issues.length,0);assert.match(f.controller.snapshot().status,/本轮完成/);assert.deepEqual(f.sent,[]);
 assert.equal(f.settings.get('account:41:attempts').items['task:101'].status,'unconfirmed');
 // An unrelated historical request must remain visible and counted.
 const ledger=f.settings.get('account:41:attempts');ledger.items['task:998']={status:'unconfirmed',at:3,label:'每日活跃'};f.settings.set('account:41:attempts',ledger);
 await f.controller.run();assert.equal(f.controller.snapshot().issues.length,1);assert.match(f.controller.snapshot().status,/1 项待核对（未重发）/);
});

test('release UI names uncertain task and ID with full long text but hides excluded return task', t => {
 const f=fixture(t),dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 const long='每日任务'.repeat(40);f.task.baseVo={name:long};
 f.settings.set('account:41:attempts',{day:f.adapter.day(),items:{'task:101':{status:'unconfirmed',at:1},'task:999':{status:'unconfirmed',at:2,label:'回归登录'}}});
 let panel;plugin.activate({window:dom.window,document:dom.window.document,game:f.game,settings:f.settings,scope:f.scope,ui:{icon:spec=>createIcon(dom.window.document,spec),registerPanel(spec){panel=spec;}}});
 const dispose=panel.render(dom.window.document.querySelector('main'));
 const pending=dom.window.document.querySelector('[data-rewards-unconfirmed]');assert.equal(pending.hidden,false);assert.match(pending.textContent,/任务 101/);assert.doesNotMatch(pending.textContent,/回归登录/);assert.equal(f.sent.length,0);dispose();
});

test('release UI shows non-task and unknown uncertain records with exact keys', t => {
 const f=fixture(t),dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 f.settings.set('account:41:attempts',{day:f.adapter.day(),items:{'activity:weekly:3':{status:'unconfirmed',label:'每周奖励',at:1},'unknown:9':{status:'interrupted',at:2},'mail:m3':{status:'pending',label:'邮件附件',at:3}}});
 let panel;plugin.activate({window:dom.window,document:dom.window.document,game:f.game,settings:f.settings,scope:f.scope,ui:{icon:spec=>createIcon(dom.window.document,spec),registerPanel(spec){panel=spec;}}});
 const dispose=panel.render(dom.window.document.querySelector('main')),pending=dom.window.document.querySelector('[data-rewards-unconfirmed]');
 for(const key of ['activity:weekly:3','unknown:9','mail:m3'])assert.ok(!pending.textContent.includes(key));assert.match(pending.textContent,/未命名领奖项目/);assert.match(pending.textContent,/邮件附件/);assert.match(pending.textContent,/每周奖励/);assert.equal(pending.hidden,false);dispose();
});

 test('old invisible lamp attempts are retained but excluded from issues', async t => {
  const f = fixture(t);
  f.settings.set('account:41:attempts', { day: f.adapter.day(), items: {
    'lamp:81': { status: 'unconfirmed', label: '武将集灯 81 奖励' },
    'lamp:5': { status: 'pending', label: '武将集灯 5 奖励' },
    'task:other': { status: 'unconfirmed', label: '其他任务' },
  } });
  assert.deepEqual(f.controller.snapshot().issues.map(item => item.key), ['task:other']);
  assert.equal(f.settings.get('account:41:attempts').items['lamp:81'].status, 'unconfirmed');
});
