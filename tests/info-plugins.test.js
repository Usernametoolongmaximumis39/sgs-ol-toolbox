import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginNative } from '../src/core/plugin-native.js';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import { ThemeRegistry } from '../src/core/themes.js';
import { definitions, evaluate } from '../src/plugins/baisheng/model.js';
import { projectAchievementReply } from '../src/core/native-achievements.js';
import { createController as achievements, activate as activateAchievements } from '../src/plugins/baisheng/index.js';
import { createController as appearances } from '../src/plugins/appearances/index.js';
import { modeId, statistics, capture } from '../src/plugins/appearances/model.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { verifyPackage } from '../src/core/packages.js';
import { eligibleMode, projectSettlement, winSummary, winStatistics, retainedScope } from '../src/plugins/appearances/battle.js';
import { BACKUP_FORMAT } from '../src/plugins/appearances/controller.js';

const projectAchievements = packet => projectAchievementReply(packet)?.snapshot ?? null;
const ach = { AchievementAll: { Achievement: [
  { _attributes: { Id: 10, characterId: 1, flags: 2048 }, CriteriaEntry: [{ _attributes: { Id: 100, count: 40 } }, { _attributes: { Id: 101, count: 60 } }] },
  { _attributes: { Id: 11, characterId: 2, flags: 2048 }, CriteriaEntry: { _attributes: { Id: 102, count: 100 } } },
  { _attributes: { Id: 12, characterId: 1, flags: 1024 } },
] } };
const chars = { GameCharacters: { character: [{ a: 1, b: '刘备' }, { a: 2, b: '关羽' }] }, WuJiangs: { Zhangong: [{ id: 10, describe: '获得一百场胜利' }, { id: 12, describe: '技能战功说明' }] } };
const flush = () => new Promise(resolve => setTimeout(resolve, 8));
function fixture(t, id) {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' }), scope = new ResourceScope();
  const handlers = new Map(), proxy = { _events: {}, on(type, caller, fn) { const a = handlers.get(type) || []; a.push({ caller, fn }); handlers.set(type, a); },
    off(type, caller, fn) { handlers.set(type, (handlers.get(type) || []).filter(row => row.caller !== caller || row.fn !== fn)); },
    event(type, packet) { for (const h of [...(handlers.get(type) || [])]) h.fn.call(h.caller, packet); } };
  let self = { ClientId: 41, NickName: '甲' }, mode = 148, group = 3, selfSeat = 0, replay = false, activeProxy = proxy;
  const requests = [], settings = new Settings(dom.window.localStorage).namespace(id), classes = {
    AchievementManager: { sendGetAchInfo(nick, type) { requests.push([nick, type]); } },
    GameGeneralManager: { HasGeneral: id => id === 1 },
    GameContext: { GetSeat: () => ({FixedViewId:1,Figure:1}), GetModeType: () => mode, GetGroupID: () => group, GetModeVO: () => ({ Model: mode }), IsViewerOrReplay: () => replay },
  };
  const ctx = { scope, storage: settings, settings, window: dom.window, document: dom.window.document, game: {
    getSelf: () => self, getServerProxy: () => activeProxy, getClass: name => classes[name], getSnapshot: () => ({ selfSeatId: selfSeat }),
    getScene: () => ({ SceneName: 'GameScene' }), getConfigData: name => name === 'character' ? chars : ach,
    loadConfigData: async name => name === 'character' ? chars : ach,
  } };
  ctx.native = createPluginNative(ctx);
  t.after(() => { scope.dispose(); dom.window.close(); });
  return { ctx, scope, proxy, handlers, requests, account: (id, nickname = id === 41 ? '甲' : '乙') => { self = { ClientId: id, NickName: nickname }; },
    proxyTo: next => { activeProxy = next; }, classes, mode: value => { mode = value; }, group: value => { group = value; },
    seat: value => { selfSeat = value; }, replay: value => { replay = value; } };
}
for (const id of ['baisheng', 'appearances']) test(`${id}: automatic initialization waits for login, retries, switches accounts and ignores disposed work`, async t => {
  const f = fixture(t, id), ticks = [], loads = [];
  f.ctx.scope.interval = fn => { ticks.push(fn); return () => {}; };
  f.account(0);
  let failLoad = true;
  f.ctx.game.getConfigData = () => null;
  f.ctx.game.loadConfigData = async name => {
    loads.push(name);
    if (failLoad) throw new Error('temporary config failure');
    return name === 'character' ? chars : ach;
  };
  const c = (id === 'baisheng' ? achievements : appearances)(f.ctx);
  await flush(); assert.equal(loads.length, 0);
  f.account(41); ticks.forEach(fn => fn()); await flush();
  assert.ok(c.view().error.includes('temporary config failure'));
  const failedCount = loads.length;
  ticks.forEach(fn => fn()); await flush();
  assert.equal(loads.length, failedCount, 'failed initialization is throttled');
  failLoad = false;
  if (id === 'baisheng') {
    await c.refresh();
    f.proxy.event('ClientDbsGetuserachinfoRep', { Protocol: { requestType: 0, NickName: '甲', Achs: [] } });
  } else await c.refreshNames();
  await flush(); assert.equal(c.view().error, '');
  const initializedCount = loads.length;
  ticks.forEach(fn => fn()); await flush(); assert.equal(loads.length, initializedCount);
  if (id === 'appearances') assert.equal(c.view().names[1], '刘备');
  else assert.deepEqual(f.requests, [['甲', 0]]);
  f.account(42); ticks.forEach(fn => fn()); await flush();
  assert.ok(loads.length > initializedCount);
  if (id === 'baisheng') assert.deepEqual(f.requests, [['甲', 0], ['乙', 0]]);
  f.scope.dispose();
  const disposedCount = loads.length;
  f.account(41); ticks.forEach(fn => fn()); await flush(); assert.equal(loads.length, disposedCount);
});

test('百胜与盖主的同账号战功查询共用请求和回包', async t => {
  const f = fixture(t, 'baisheng'), secondScope = new ResourceScope();
  t.after(() => secondScope.dispose());
  const first = f.ctx.native.achievements;
  const second = createPluginNative({ ...f.ctx, scope: secondScope }).achievements;
  const received = [], strict = [];
  first.subscribe((snapshot, id) => received.push([snapshot, id]));
  second.subscribe((snapshot, id) => strict.push([snapshot, id]), undefined, { strict: true });
  const request = first.query();
  assert.equal(second.query(), request);
  assert.deepEqual(f.requests, [['甲', 0]]);
  const reply = (NickName, detailInfo = 12) => ({ requestType: 0, NickName, Achs: [{ id: 100, type: 2, detailInfo }] });
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('别人'));
  await flush();
  assert.equal(received.length, 0);
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('甲'));
  await flush();
  assert.equal(received[0][1], request);
  assert.strictEqual(received[0][0], strict[0][0]);
  assert.equal(received[0][0].progress[100], 12);

  const old = first.query();
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('甲'));
  f.account(42);
  const current = second.query();
  assert.notEqual(current, old);
  assert.deepEqual(f.requests, [['甲', 0], ['甲', 0], ['乙', 0]]);
  await flush();
  assert.equal(received.length, 1);
  secondScope.dispose();
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('乙', ' '));
  await flush();
  assert.equal(received.at(-1)[0].progress[100], 0);
  assert.equal(strict.length, 1);
});

test('百胜：重连时等待昵称和战功接口，就绪后自行查询且不覆盖上一份快照', async t => {
  const f = fixture(t, 'baisheng'), ticks = [], reports = [];
  f.scope.interval = fn => { ticks.push(fn); };
  f.ctx.reportError = message => reports.push(message);
  f.account(41, '');
  const saved = { nickname: '甲', at: 1, finish: {}, progress: { 100: 23 } };
  f.ctx.storage.set('account:41:snapshot-v1', { schema: 1, snapshot: saved });
  const c = achievements(f.ctx), tick = () => ticks.forEach(fn => fn());
  await c.refresh();
  assert.equal(c.view().ready, false);
  assert.equal(c.view().snapshot, null, 'do not display a cached nickname before it is confirmed');
  assert.equal(c.view().error, '');
  assert.equal(f.requests.length, 0);
  f.account(41);
  f.proxy.IsOffline = true;
  tick(); await c.refresh();
  assert.equal(c.view().ready, false);
  assert.deepEqual(c.view().snapshot, saved);
  assert.equal(f.requests.length, 0);
  f.proxy.IsOffline = false;
  const manager = f.classes.AchievementManager;
  f.classes.AchievementManager = null;
  tick(); await c.refresh();
  assert.equal(c.view().ready, false);
  assert.deepEqual(c.view().snapshot, saved);
  f.classes.AchievementManager = manager;
  tick(); await flush();
  assert.deepEqual(f.requests, [['甲', 0]]);
  f.proxy.event('ClientDbsGetuserachinfoRep', { Protocol: { requestType: 0, NickName: '甲', Achs: [{ id: 100, type: 2, detailInfo: 26 }] } });
  await flush();
  assert.equal(c.view().snapshot.progress[100], 26);
  assert.equal(c.view().loading, false);
  assert.equal(reports.filter(Boolean).length, 0);
});

test('百胜：加载公共配置期间暂时失去连接，不计为失败或消耗自动重试', async t => {
  const f = fixture(t, 'baisheng'), ticks = [], reports = [];
  f.scope.interval = fn => { ticks.push(fn); };
  f.ctx.reportError = message => reports.push(message);
  const c = achievements(f.ctx), tick = () => ticks.forEach(fn => fn());
  for (let i = 0; i < 4; i++) {
    const loaders = [];
    f.ctx.game.loadConfigData = name => new Promise(resolve => loaders.push(() => resolve(name === 'character' ? chars : ach)));
    const first = c.refresh();
    assert.equal(loaders.length, 2);
    f.proxy.ConnId = i + 1;
    f.proxy.ConnectedSucess1 = false;
    loaders.forEach(done => done());
    await first;
    assert.equal(c.view().error, '');
    assert.equal(c.view().loading, false);
    f.proxy.ConnectedSucess1 = true;
  }
  f.ctx.game.loadConfigData = async name => name === 'character' ? chars : ach;
  tick(); await flush();
  assert.deepEqual(f.requests, [['甲', 0]]);
  assert.equal(reports.filter(Boolean).length, 0);
});

test('百胜：接口在配置加载后返回未就绪，仍不触发运行错误', async t => {
  const f = fixture(t, 'baisheng'), reports = [];
  f.ctx.reportError = message => reports.push(message);
  const native = f.ctx.native;
  f.ctx.native = { ...native, achievements: { ...native.achievements, query: () => null } };
  const c = achievements(f.ctx);
  await c.refresh();
  assert.equal(c.view().error, '');
  assert.equal(c.view().loading, false);
  assert.equal(reports.filter(Boolean).length, 0);
});

test('百胜：已发送的查询在正常连接超时仍显示提示，掉线则保留快照等待', async t => {
  const f = fixture(t, 'baisheng');
  f.scope.timeout = () => {};
  f.scope.interval = () => {};
  const timers = new Map();
  f.ctx.window = { setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: id => timers.delete(id) };
  const saved = { nickname: '甲', at: 1, finish: {}, progress: { 100: 23 } };
  f.ctx.storage.set('account:41:snapshot-v1', { schema: 1, snapshot: saved });
  const c = achievements(f.ctx);
  await c.refresh();
  timers.get(12000)();
  assert.match(c.view().error, /战功查询超时/);
  assert.deepEqual(c.view().snapshot, saved);
  f.proxy.ConnId = 1;
  await c.refresh();
  assert.deepEqual(f.requests, [['甲', 0], ['甲', 0]]);
  f.proxy.IsOffline = true;
  timers.get(12000)();
  assert.equal(c.view().error, '');
  assert.deepEqual(c.view().snapshot, saved);
  assert.equal(c.view().loading, false);
  assert.equal(timers.size, 0);
});

test('百胜与盖主不会跨连接复用请求，也不会接受排队中的旧连接回复', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(t, 'baisheng'), other = fixture(t, 'gaizhu');
  f.proxy.ConnId = 1;
  const queries = f.ctx.native.achievements, received = [], gaps = [];
  queries.subscribe((snapshot, id) => received.push([snapshot.progress[100], id]), gap => gaps.push(gap.reason));
  const reply = detailInfo => ({ requestType: 0, NickName: '甲', Achs: [{ id: 100, type: 2, detailInfo }] });
  const old = queries.query();
  f.proxy.event('ClientDbsGetuserachinfoRep', reply(11));
  f.proxy.ConnId++;
  assert.notEqual(queries.query(), old);
  await flush();
  assert.deepEqual(received, []);
  f.proxyTo(other.proxy);
  assert.equal(queries.ready(), false, 'wait for observation to bind to the replacement proxy');
  assert.equal(queries.query(), null);
  f.proxy.event('ClientDbsGetuserachinfoRep', reply(22));
  await flush();
  assert.deepEqual(received, []);
  t.mock.timers.tick(500);
  assert.deepEqual(gaps, ['rebind']);
  assert.equal(queries.ready(), true);
  const latest = queries.query();
  other.proxy.event('ClientDbsGetuserachinfoRep', reply(33));
  await flush();
  assert.deepEqual(received, [[33, latest]]);
  assert.deepEqual(f.requests, [['甲', 0], ['甲', 0], ['甲', 0]]);
});

test('official achievement projection: request/nickname, flags, multiple criteria and completion time', () => {
  const snapshot = projectAchievements({ Protocol: { requestType: 0, NickName: '甲', Achs: [
    { ID: 100, type: 2, detailInfo: 35 }, { ID: 101, type: 2, detailInfo: 20 },
    { ID: 11, type: 1, detailInfo: 1700000000 }, { ID: 12, type: 1, detailInfo: 1700000001 }, { ID: 900, type: 4 },
  ] } });
  const rows = evaluate(definitions(ach, chars), snapshot, { 1: '刘备', 2: '关羽' });
  assert.equal(rows[0].value, 55); assert.equal(rows[0].required, 100); assert.equal(rows[0].completed, false); assert.equal(rows[0].skill.completed, true);
  assert.equal(rows[1].completed, true); assert.equal(rows[1].finishTime, 1700000000);
  assert.equal(projectAchievements({ requestType: 2, NickName: '甲', Achs: [] }), null);
  assert.equal(projectAchievements({ NickName: '甲', Achs: [] }), null);
  assert.equal(evaluate(definitions(ach, chars), null, {})[0].value, null);
});

test('appearances: only a cloud binding triggers sync, and changing accounts or bindings discards stale responses', async t => {
  const f = fixture(t, 'appearances'), checks = [], exchanges = [];
  f.account(0);
  f.scope.interval = callback => { checks.push(callback); };
  const bindings = new Map();
  const transport = (account, matches, signal) => new Promise(resolve => {
    exchanges.push({ account, matches, signal, resolve });
  });
  transport.available = id => bindings.has(id);
  transport.cacheKey = id => bindings.get(id);
  f.ctx.devAppearanceSync = transport;
  const controller = appearances(f.ctx);
  await flush();
  assert.equal(exchanges.length, 0);
  const tick = () => checks.forEach(callback => callback());
  f.account(41); tick(); tick();
  assert.equal(exchanges.length, 0);
  bindings.set('41', 'private-41'); tick(); tick();
  assert.deepEqual(exchanges.map(({ account, matches }) => ({ account, matches })), [{ account: '41', matches: [] }]);
  bindings.set('42', 'private-42');
  f.account(42); tick();
  assert.deepEqual(exchanges.map(({ account }) => account), ['41', '42']);
  assert.equal(exchanges[0].signal.aborted, true);
  const row = { gameId: '123', mode: 35, rawMode: 148, rawGroup: 3, endedAt: Date.now(), general: [1], result: 0, duration: 100, figure: 1 };
  exchanges[0].resolve([row]); exchanges[1].resolve([]);
  await flush(); tick();
  assert.equal(controller.view().matches.length, 0);
  assert.equal(exchanges.length, 2);
  f.account(0); tick(); f.account(42); tick();
  assert.deepEqual(exchanges.map(({ account }) => account), ['41', '42', '42']);
  bindings.set('42', 'public-42'); tick();
  assert.equal(exchanges[2].signal.aborted, true);
  assert.equal(exchanges.length, 4);
  exchanges[2].resolve([row]); await flush();
  assert.equal(controller.view().matches.length, 0);
  exchanges[3].resolve([row]); await flush();
  assert.equal(controller.view().matches[0].gameId, '123');
  bindings.delete('42'); tick(); tick();
  assert.equal(exchanges.length, 4);
});
test('achievement controller rejects another nickname and old-account responses; storage/reload and disposal', async t => {
  const f = fixture(t, 'baisheng'), c = achievements(f.ctx);
  assert.equal(f.requests.length, 0); await c.refresh(); assert.deepEqual(f.requests, [['甲', 0]]);
  const reply = (nick, value) => ({ Protocol: { requestType: 0, NickName: nick, Achs: [{ ID: 100, type: 2, detailInfo: value }] } });
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('别人', 88)); await flush(); assert.equal(c.view().snapshot, null);
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('甲', 23)); await flush(); assert.equal(c.view().snapshot.progress[100], 23);
  f.proxy.event('GsClientAchievementProgressUpdate', { Protocol: { CriteriaID: 100, Conut: 30 } }); await flush(); assert.equal(c.view().snapshot.progress[100], 30);
  f.proxy.event('ClientDbsGetuserachinfoRep', reply('甲', 40)); f.account(42); await flush(); assert.equal(c.view().snapshot, null);
  f.account(41); assert.equal(c.view().snapshot.progress[100], 30);
  f.scope.dispose(); assert.ok([...f.handlers.values()].every(a => a.length === 0));
});
test('appearance statistics deduplicate IDs and preserve unknown selection denominators', () => {
  let d = capture(null, { type: 'frame', mode: 148, general: [1, 1, 2], time: 100 });
  d = capture(d, { type: 'change', general: [2, 3] }); assert.deepEqual(d.general, [1, 2, 3]);
  assert.equal(capture(d, { type: 'select', selected: [4] }), null);
  const rows = statistics([{ ...d, selected: [1] }, { ...d, selected: null }]);
  assert.equal(rows[0].appear, 2); assert.equal(rows[0].selected, 1); assert.equal(rows[0].known, 1); assert.equal(rows[0].rate, 1);
  assert.equal(modeId(37), 0); assert.equal(modeId(160), 44);
});
test('appearance protocol lifecycle: change, opponents, duplicate, account, reconnect, replay and unsupported modes', async t => {
  const f = fixture(t, 'appearances'), c = appearances(f.ctx);
  const emit = async (type, packet = {}) => { f.proxy.event(type, { Protocol: packet }); await flush(); };
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('MsgGameDealCharacter', { Type: 3, Datas: [3] });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 1, CharacterID: 2 }] }); assert.equal(c.view().records.length, 0);
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 3 }] }); assert.equal(c.view().records.length, 1); assert.deepEqual(c.view().records[0].general, [1, 2, 3]);
  await emit('MsgEnterGameStageNtf'); assert.equal(c.view().records.length, 1);
  f.account(42); assert.equal(c.view().records.length, 0); f.account(41); assert.equal(c.view().records.length, 1);
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [4, 5] }); await emit('MsgReconnectGame'); await emit('MsgEnterGameStageNtf'); assert.equal(c.view().records.length, 1);
  f.replay(true); await emit('MsgGameDealCharacter', { Type: 1, Datas: [4, 5] }); await emit('MsgEnterGameStageNtf'); assert.equal(c.view().records.length, 1);
  f.replay(false); f.mode(37); await emit('MsgGameDealCharacter', { Type: 1, Datas: [4, 5] }); await emit('MsgEnterGameStageNtf'); assert.equal(c.view().records.length, 1);
  f.scope.dispose(); assert.ok([...f.handlers.values()].every(a => a.length === 0));
});
test('appearance malformed list/gap discards draft, next clean frame works; failed storage keeps draft', async t => {
  const f = fixture(t, 'appearances'), c = appearances(f.ctx);
  const emit = async (type, packet = {}) => { f.proxy.event(type, { Protocol: packet }); await flush(); };
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('MsgGameDealCharacter', { Type: 3, Datas: Array(257).fill(2) }); await emit('MsgEnterGameStageNtf'); assert.equal(c.view().records.length, 0); assert.equal(c.view().gaps, 1);
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [4, 5] });
  const set = f.ctx.storage.set; f.ctx.storage.set = () => { throw new Error('QuotaExceededError'); };
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 4 }] }); assert.equal(c.view().records.length, 0); assert.ok(c.view().draft); assert.match(c.view().error, /QuotaExceeded/);
  f.ctx.storage.set = set; c.retry(); assert.equal(c.view().records.length, 1);
});
test('lobby rank labels cannot capture identity/training/AI frames as ranked or DDZ', async t => {
  const f = fixture(t, 'appearances'), c = appearances(f.ctx);
  const emit = async (type, packet = {}) => { f.proxy.event(type, { Protocol: packet }); await flush(); };
  for (const actualMode of [5, 26, 35, 44, 147]) {
    await emit('ClientEnterpageRep', { LabelModel: 26 }); f.mode(actualMode);
    await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2, 3, 4, 5, 6, 7, 8] });
    await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] });
    assert.equal(c.view().records.length, 0);
  }
  f.mode(132); await emit('ClientTrainingRep', { Result: 1 });
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] }); await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] }); assert.equal(c.view().records.length, 0);
  await emit('ClientEnterpageRep', { LabelModel: 26 }); await emit('ClientSitdownRep', { Result: 1, TypeID: 5, GroupID: 1 });
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] }); await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] }); assert.equal(c.view().records.length, 0);
  await emit('ClientEnterpageRep', { LabelModel: 26 }); await emit('ClientSitdownRep', { Result: 1, TypeID: 132, GroupID: 3 });
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] });
  assert.equal(c.view().records.length, 1); assert.equal(c.view().records[0].rawMode, 132);
});
test('corrupt appearance storage is never overwritten by gap or retry, explicit clear recovers', async t => {
  const f = fixture(t, 'appearances'), key = 'account:41:records-v1', original = { schema: 999, records: ['unknown format'] };
  f.ctx.storage.set(key, original); const c = appearances(f.ctx); assert.equal(c.view().storageBlocked, true);
  f.proxy.event('MsgGameDealCharacter', { Protocol: { Type: 1, Datas: [0] } }); await flush(); c.retry();
  assert.deepEqual(f.ctx.storage.get(key), original);
  c.clear(); assert.equal(c.view().storageBlocked, false); assert.equal(f.ctx.storage.get(key).schema, 1);
});
test('recoverable plugin errors survive activation, clear explicitly, and ignore disposed callbacks', async t => {
  const f = fixture(t, 'errors'); let savedContext;
  const m = new PluginManager({ journal: new SessionJournal(), settings: new Settings(f.ctx.window.localStorage),
    store: { async list() { return []; }, async put() {} }, context: f.ctx }); t.after(() => m.dispose());
  m.registerBuiltin({ manifest: { id: 'error-demo', name: '异常演练', version: '0.1.0', apiVersion: 1, categories: [] }, activate(ctx) { savedContext = ctx; ctx.reportError('完整存储错误'); } });
  await m.init(); await m.tail; assert.equal(m.list()[0].error, '完整存储错误'); assert.equal(m.list()[0].active, true);
  savedContext.reportError(null); assert.equal(m.list()[0].error, '');
  await m.disable('error-demo'); savedContext.reportError('expired'); assert.equal(m.list()[0].error, '');
});
for (const id of ['baisheng', 'appearances']) test(`${id}: standalone package install, disable, reload, upgrade, rollback, uninstall`, async t => {
  const f = fixture(t, id), pkg = await makePluginPackage(await bundlePlugin(id)); await verifyPackage(pkg);
  assert.doesNotMatch(pkg.code, /Uc1cryZVg|VIiR0YfvE4s|\bfetch\s*\(|\bWebSocket\s*\(/);
  if (id === 'appearances') assert.doesNotMatch(pkg.code, /SGS_TRACKER_DB|GAME_ANALYSIS_USER_KEYS|modeID\s*\?\?/);
  const mounted = new Map(), store = new Map();
  const m = new PluginManager({ journal: new SessionJournal(), settings: new Settings(f.ctx.window.localStorage),
    store: { async list() { return []; }, async put(row) { store.set(row.id, row); } },
    context: { ...f.ctx, themes: new ThemeRegistry(new Settings(f.ctx.window.localStorage)), ui: { registerPanel(panel) { const node = f.ctx.document.createElement('div'); f.ctx.document.body.append(node); const off = panel.render(node); mounted.set(panel.id, node); return () => { off(); node.remove(); mounted.delete(panel.id); }; } } },
  }); t.after(() => m.dispose()); await m.init(); await m.install(pkg); assert.equal(mounted.size, 1);
  const scope = m.slots.get(id).scope; await m.disable(id); assert.equal(scope.closed, true); assert.equal(mounted.size, 0);
  await m.enable(id); await m.reload(id); assert.equal(mounted.size, 1);
  await m.install(await makePluginPackage(await bundlePlugin(id), '0.1.2-local')); await m.rollback(id); assert.equal(m.list()[0].version, pkg.manifest.version);
  await m.uninstall(id); assert.equal(mounted.size, 0); assert.equal(m.list().length, 0);
});

test('statistics whitelist requires exact native Model/Section and never accepts excluded variants', () => {
  for (const [m, g, expected] of [[132,3,26],[148,3,35],[149,3,35],[160,2,44],[160,3,44],[160,4,44]]) assert.equal(eligibleMode(m,g),expected);
  for (const m of [33,77,133,157,169,175,47,26,35,44]) assert.equal(eligibleMode(m,3),0);
  for (const g of [undefined,null,0,1,2,4,99]) assert.equal(eligibleMode(132,g),0);
  assert.equal(retainedScope({mode:26,rawMode:133,rawGroup:3}),false);
  assert.equal(retainedScope({mode:26,rawMode:132,rawGroup:3}),true);
});
test('win rates exclude draws and unknown results, and general counts deduplicate each match', () => {
  const matches=[0,1,255,null].map((result,i)=>({general:[1,1],result,duration:i===0?120:null}));
  assert.deepEqual(winSummary(matches),{played:4,wins:1,losses:1,draws:1,unknown:1,rate:.5,duration:120});
  assert.equal(winStatistics(matches)[0].played,4);
  assert.equal(winSummary([{result:null}]).rate,null);
  assert.equal(projectSettlement({Protocol:{Players:[{SeatID:1,Result:0}],SelfResult:{SeatID:0,Result:0}}},0).own,null);
});
test('own settlement, not global/opponent result, links to frames; duplicate settlement and fast next match are safe', async t => {
  const f=fixture(t,'appearances'),c=appearances(f.ctx);
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  for (const result of [0,1,255,2]) {
    await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});
    await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});
    const over={ModeType:148,GoupID:3,GameModel:33,Result:1,time:90,Players:[{SeatID:1,Result:0,isRobot:false},{SeatID:0,userId:41,Result:result,Figure:1,isRobot:false}]};
    await emit('MsgGameOver',over);await emit('MsgGameOver',over);
  }
  assert.equal(c.view().records.length,4);assert.equal(c.view().matches.length,4);
  assert.deepEqual(c.view().matches.map(r=>r.result),[0,1,255,null]);
  assert.equal(winSummary(c.view().matches).rate,.5);
  assert.equal(c.view().records[0].id,c.view().matches[0].id);
  assert.equal(c.view().records[0].figure,1);
});
test('battle without frame is recorded separately; reconnect, wrong user, excluded mode and account change cannot add wins', async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx);
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  const selection=()=>emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});
  const over=(extra={})=>emit('MsgGameOver',{ModeType:148,GoupID:3,GameModel:33,Players:[{SeatID:0,userId:41,Result:0}],...extra});
  await selection();await over();assert.equal(c.view().records.length,0);assert.equal(c.view().matches.length,1);
  await selection();await emit('MsgReconnectGame');await over();assert.equal(c.view().matches.length,1);
  await selection();await over({Players:[{SeatID:0,userId:42,Result:0}]});assert.equal(c.view().matches.length,1);
  await selection();await over({ModeType:157});assert.equal(c.view().matches.length,1);
  await emit('ClientSitdownRep',{Result:1,TypeID:77,GroupID:2});await selection();await over();assert.equal(c.view().matches.length,1);
  await emit('ClientEnterpageRep');
  await selection();f.account(42);c.view();await over();assert.equal(c.view().matches.length,0);
  f.account(41);assert.equal(c.view().matches.length,1);
  for(const m of [33,77,133,157,169,175]){f.mode(m);await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});await selection();await over({ModeType:m});}
  assert.equal(c.view().records.length,0);assert.equal(c.view().matches.length,1);
});
test('single-rider matchmaking records results regardless of player flags and excludes training', async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx);f.mode(160);
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  const round=async()=>{await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});};
  await round();assert.equal(c.view().records.length,1);
  await emit('MsgGameOver',{ModeType:160,GoupID:3,GameModel:37,Players:[{SeatID:0,userId:41,Result:0,isRobot:false},{SeatID:1,Result:1,isRobot:true}]});
  assert.equal(c.view().records.length,1);assert.equal(c.view().matches.length,1);
  assert.equal(c.view().matches[0].result,0);
  await round();await emit('MsgGameOver',{ModeType:160,GoupID:3,GameModel:37,Players:[{SeatID:0,userId:41,Result:1},{SeatID:1,Result:0}]});
  await emit('ClientTrainingRep', { Result: 1 });
  await round(); await emit('MsgGameOver', { ModeType: 160, GoupID: 3, GameModel: 37,
    Players: [{ SeatID: 0, userId: 41, Result: 0, isRobot: false }, { SeatID: 1, Result: 1, isRobot: true }] });
  assert.equal(c.view().records.length,2);
  assert.deepEqual(c.view().matches.map(row => row.result), [0, 1]);
  assert.ok([...c.view().records, ...c.view().matches].every(row => !Object.hasOwn(row, 'isAiMatch')));
});
test('failed frame and settlement save recover atomically and late retry cannot cross accounts',async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx);
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});
  const set=f.ctx.storage.set;f.ctx.storage.set=()=>{throw new Error('QuotaExceededError');};
  await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});
  await emit('MsgGameOver',{ModeType:148,GoupID:3,GameModel:33,Players:[{SeatID:0,userId:41,Result:0}]});
  assert.equal(c.view().records.length,0);assert.equal(c.view().matches.length,0);
  f.ctx.storage.set=set;c.retry();assert.equal(c.view().records.length,1);assert.equal(c.view().matches.length,1);
  f.account(42);c.retry();assert.equal(c.view().matches.length,0);
});
test('own backup restore is atomic/account-bound and old xiaochao formats are no longer accepted',async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx), row={id:'local-1',mode:26,position:1,general:[1,2],selected:[1],time:1791075017589};
  const file=value=>({size:100,text:async()=>JSON.stringify(value)});
  await c.restore(file({records:[{modeID:132,generalIDs:[1],selectedIDs:[1]}],accountKeys:{}}));
  assert.match(c.view().error,/只接受/);assert.equal(c.view().records.length,0);
  await c.restore(file({format:BACKUP_FORMAT,schema:1,accountId:'41',records:[row],matches:[]}));
  assert.equal(c.view().records.length,1);assert.equal(c.view().matches.length,0);
  await c.restore(file({format:BACKUP_FORMAT,schema:1,accountId:'42',records:[row]}));assert.equal(c.view().records.length,1);
  let finish;const late=c.restore({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});
  f.account(42);c.view();finish(JSON.stringify({format:BACKUP_FORMAT,schema:1,accountId:'41',records:[row]}));await late;
  assert.equal(c.view().records.length,0);
});

test('native single-rider capture preserves valid old local records regardless of player flags',async t=>{
  const f=fixture(t,'appearances'),row={id:'already-local',mode:44,position:1,general:[1,2],selected:[1],time:1794000000000,source:'xiaochao'};
  f.ctx.storage.set('account:41:records-v1',{schema:1,records:[row],gaps:2});
  const context=f.ctx.game.getClass('GameContext');context.GetSeat=i=>({FixedViewId:i+1,IsRobot:i===1,PlayerInfo:{IsRobot:i===1}});
  const c=appearances(f.ctx);assert.deepEqual(c.view().records,[row]);assert.equal(c.view().matches.length,0);f.mode(160);
  f.proxy.event('MsgGameDealCharacter',{Protocol:{Type:1,Datas:[1,2]}});await flush();
  f.proxy.event('SmsgGameSetCharacter',{Protocol:{Infos:[{SeatID:0,CharacterID:1}]}});await flush();
  f.proxy.event('MsgGameOver',{Protocol:{ModeType:160,GoupID:3,GameModel:37,Players:[{SeatID:0,userId:41,Result:0},{SeatID:1,isRobot:true}]}});await flush();
  assert.equal(c.view().records.length,2);assert.deepEqual(c.view().records[0],row);assert.equal(c.view().matches.length,1);
  assert.deepEqual(c.view().records[1].selected,[1]);assert.equal(c.view().matches[0].result,0);
  c.clear();assert.equal(f.ctx.storage.get('account:41:records-v1').gaps,0);
});

test('old account data and restored backups discard the retired flag while preserving linked rows', async t => {
  const f = fixture(t, 'appearances'), key = 'account:41:records-v1';
  const time = 1794000000000;
  const frame = { id: 'legacy', mode: 44, position: 1, general: [1, 2], selected: [1], time, source: 'toolbox' };
  const match = { id: frame.id, mode: 44, position: 1, general: [1], time, result: 0, duration: 98, gameId: '123' };
  const legacy = { records: [{ ...frame, isAiMatch: true }], matches: [{ ...match, isAiMatch: null }] };
  f.ctx.storage.set(key, { schema: 1, startedAt: time, ...legacy });
  const c = appearances(f.ctx);
  assert.deepEqual(c.view().records, [frame]);
  assert.deepEqual(c.view().matches, [match]);
  assert.deepEqual(f.ctx.storage.get(key).records, [frame]);
  assert.deepEqual(f.ctx.storage.get(key).matches, [match]);
  const restore = () => c.restore({ size: 1000, text: async () => JSON.stringify({ format: BACKUP_FORMAT, schema: 1, accountId: '41', ...legacy }) });
  await restore();
  assert.equal(c.view().error, '');
  c.clear(); await restore();
  assert.deepEqual(f.ctx.storage.get(key).records, [frame]);
  assert.deepEqual(f.ctx.storage.get(key).matches, [match]);
});


test('side capture persists real play order across selection/start/settlement and backups',async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx);let position=0,figure=0;
  f.ctx.game.getClass('GameContext').GetSeat=()=>({FixedViewId:position,Figure:figure,IsRobot:false});
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  for(const spec of [
    {raw:148,model:33,seat:2,position:1,figure:1},
    {raw:148,model:33,seat:0,position:3,figure:3},
    {raw:132,model:14,seat:0,position:4,figure:0},
    {raw:132,model:14,seat:3,position:2,figure:0},
    {raw:160,model:37,seat:1,position:1,figure:0},
    {raw:160,model:37,seat:0,position:2,figure:0},
  ]){
    f.mode(spec.raw);f.seat(spec.seat);position=0;figure=spec.figure;
    await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});
    await emit('SmsgGameSetCharacter',{Infos:[{SeatID:spec.seat,CharacterID:1}]});
    position=spec.position;await emit('MsgEnterGameStageNtf');
    assert.equal(c.view().records.at(-1).position,spec.position);
    // A later native object change must not rewrite the captured order at settlement.
    position=4;
    await emit('MsgGameOver',{ModeType:spec.raw,GoupID:3,GameModel:spec.model,
      Players:[{SeatID:spec.seat,userId:41,Figure:spec.figure,Result:0,isRobot:false},
        {SeatID:(spec.seat+1)%4,Result:1,isRobot:false}]});
    assert.equal(c.view().matches.at(-1).position,spec.position);
    assert.equal(c.view().records.at(-1).position,spec.position);
  }
  const before=c.view();assert.equal(before.matches.length,6);
  const backup={format:BACKUP_FORMAT,schema:1,accountId:'41',records:before.records,matches:before.matches};
  c.clear();await c.restore({size:1000,text:async()=>JSON.stringify(backup)});
  assert.deepEqual(c.view().matches.map(r=>r.position),[1,3,4,2,1,2]);
  assert.deepEqual(c.view().records.slice(0,2).map(r=>r.figure),[1,3]);
});


test('unclassified legacy/imported rows are discarded, same-game evidence is preserved, cleanup retries',async t=>{
  const f=fixture(t,'appearances'),key='account:41:records-v1';
  const row=(id,mode,extra={})=>({id,mode,general:[1],selected:[1],time:1794000000000,...extra});
  const records=[row('drop-rank',26,{seat:0}),row('drop-ddz',35),row('drop-single',44),
    row('linked-ddz',35),row('linked-rank',26,{position:4})];
  const matches=[row('drop-rank',26,{result:0}),row('linked-ddz',35,{figure:3,result:1}),row('linked-rank',26,{result:0})];
  f.ctx.storage.set(key,{schema:1,records,matches});
  const originalSet=f.ctx.storage.set;f.ctx.storage.set=()=>{throw Error('quota');};
  const c=appearances(f.ctx);
  assert.deepEqual(c.view().records.map(r=>r.id),['linked-ddz','linked-rank']);
  assert.equal(c.view().records[0].figure,3);assert.equal(c.view().matches[1].position,4);
  assert.match(c.view().error,/quota/);
  f.ctx.storage.set=originalSet;c.retry();
  assert.equal(f.ctx.storage.get(key).records.length,2);assert.equal(f.ctx.storage.get(key).matches.length,2);
  c.clear();await c.restore({size:1000,text:async()=>JSON.stringify({format:BACKUP_FORMAT,schema:1,accountId:'41',records,matches})});
  assert.equal(c.view().records.length,2);assert.equal(c.view().matches.length,2);
  f.account(42);assert.equal(c.view().records.length,0);f.account(41);assert.equal(c.view().records.length,2);
});

test('unknown side remains only a draft, can resolve at settlement, and never enters saved history',async t=>{
  const f=fixture(t,'appearances'),c=appearances(f.ctx);
  f.ctx.game.getClass('GameContext').GetSeat=()=>({FixedViewId:0,Figure:0});
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  for(const [raw,model,figure,expected] of [[148,33,undefined,0],[132,14,1,0],[160,37,1,0],[148,33,3,1]]){
    f.mode(raw);await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});
    await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});await emit('MsgEnterGameStageNtf');
    assert.equal(c.view().records.length,0);assert.ok(c.view().draft);
    await emit('MsgGameOver',{ModeType:raw,GoupID:3,GameModel:model,Players:[{SeatID:0,userId:41,Figure:figure,Result:0,isRobot:false},{SeatID:1,isRobot:false}]});
    assert.equal(c.view().records.length,expected);assert.equal(c.view().matches.length,expected);assert.equal(c.view().draft,null);
  }
  assert.equal(c.view().records[0].figure,3);
});

 test('ranked dedicated candidates and late first-seat event retain own frame and completed match', async t => {
  const f = fixture(t, 'appearances'); f.mode(132);
  let position = 0;
  f.ctx.game.getClass('GameContext').GetSeat = () => ({ FixedViewId: position, Figure: 1 });
  const c = appearances(f.ctx);
  const emit = async (type, data = {}) => { f.proxy.event(type, { Protocol: data }); await flush(); };
  await emit('MsgGameDealCharacterPaiwei', { randomHt: new Map([[0, { Datas: [1, 2] }], [1, { Datas: [3, 4] }]]) });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] });
  await emit('MsgEnterGameStageNtf');
  assert.equal(c.view().records.length, 0);
  position = 4;
  await emit('GsCFirstPhaseRole', { SeatID: 1 });
  assert.equal(c.view().records.length, 1);
  assert.deepEqual(c.view().records[0].general, [1, 2]);
  assert.equal(c.view().records[0].position, 4);
  await emit('MsgGameOver', { Players: [{ SeatID: 0, Result: 0, userId: 41 }], ModeType: 132, GoupID: 3, GameModel: 14, time: 300 });
  assert.equal(c.view().matches.length, 1);
  assert.equal(c.view().matches[0].result, 0);
 });
 test('ranked side-select type 9 is captured only in eligible ranked mode', async t => {
  const f = fixture(t, 'appearances'); f.mode(132); const c = appearances(f.ctx);
  f.proxy.event('MsgGameDealCharacter', { Protocol: { Type: 9, Datas: [1, 2] } }); await flush();
  f.proxy.event('SmsgGameSetCharacter', { Protocol: { Infos: [{ SeatID: 0, CharacterID: 1 }] } }); await flush();
  assert.equal(c.view().records.length, 1);
 });

for (const spec of [{ raw:132, model:14, figure:0, position:4, type:9 }, { raw:148, model:33, figure:3, position:2 }, { raw:160, model:37, figure:0, position:2 }])
test(`closed GameContext: table evidence collects ${spec.raw}, replacements, result and native position`, async t => {
  const f=fixture(t,'appearances');
  const original=f.ctx.game.getClass;
  f.ctx.game.getClass=name=>name==='GameContext'?undefined:original(name);
  const ui={seat:{SeatID:0,FixedViewId:spec.position,Figure:spec.figure}};
  f.ctx.game.getSelfSeatUI=()=>ui;f.ctx.game.getSeatUIs=()=>[ui];
  const c=appearances(f.ctx), emit=async(type,p)=>{f.proxy.event(type,{Protocol:p});await flush();};
  // Native events can arrive in the same turn before the deferred consumer runs.
  f.proxy.event('ClientSitdownRep',{Protocol:{Result:1,TypeID:spec.raw,GroupID:3,IsViewer:false}});
  await emit('MsgGameDealCharacter',{Type:spec.type ?? 1,Datas:[1,2]});
  await emit('MsgGameDealCharacter',{Type:3,Datas:[2,3]});
  await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:3}]});
  assert.deepEqual(c.view().records[0].general,[1,2,3]);
  await emit('MsgGameOver',{ModeType:spec.raw,GoupID:3,GameModel:spec.model,
    Players:[{SeatID:0,userId:41,Figure:spec.figure,Result:1},{SeatID:1,Result:0}]});
  assert.equal(c.view().matches.length,1);assert.equal(c.view().matches[0].result,1);
  assert.equal(c.view().records[0].position,spec.position);
  assert.equal(c.view().records[0].figure,spec.figure);
});


for (const early of [true, false]) test(`single-rider native table seat and ${early ? 'early' : 'late'} first-role survive unavailable scene seats`, async t => {
  const f = fixture(t, 'appearances');
  const getClass = f.ctx.game.getClass;
  f.ctx.game.getClass = name => name === 'GameContext' ? undefined : getClass(name);
  f.ctx.game.getSnapshot = () => ({ selfSeatId: early ? null : 0 });
  f.ctx.game.getSeatUIs = () => []; f.ctx.game.getSelfSeatUI = () => null;
  const c = appearances(f.ctx);
  const emit = async (type, Protocol) => { f.proxy.event(type, { Protocol }); await flush(); };
  await emit('ClientSitdownRep', { Result: 1, TypeID: 160, GroupID: 2, SeatID: 1, IsViewer: false });
  if (early) await emit('GsCFirstPhaseRole', { SeatID: 0 });
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 2 }, { SeatID: 1, CharacterID: 1 }] });
  if (!early) {
    assert.equal(c.view().records.length, 0);
    await emit('GsCFirstPhaseRole', { SeatID: 1 });
  }
  assert.equal(c.view().records.length, 1);
  assert.equal(c.view().records[0].seat, 1);
  assert.equal(c.view().records[0].position, early ? 2 : 1);
  const over = { ModeType: 160, GoupID: 2, GameModel: 37, time: 200,
    Players: [{ SeatID: 0, userId: 99, Result: 1 }, { SeatID: 1, userId: 41, Result: 0 }] };
  await emit('MsgGameOver', over);
  assert.equal(c.view().matches.length, 1);
  assert.equal(c.view().matches[0].result, 0);
  assert.equal(c.view().matches[0].position, early ? 2 : 1);
  assert.deepEqual(c.view().matches[0].general, [1]);
  await emit('MsgGameOver', over); assert.equal(c.view().matches.length, 1);
  // A following game without first-role evidence must not inherit the last one.
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 1, CharacterID: 1 }] });
  await emit('MsgGameOver', over);
  assert.equal(c.view().matches.length, 1);
  assert.equal(c.view().records.length, 1);
  // Official matchmaking with a bot at settlement also counts.
  await emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
  await emit('GsCFirstPhaseRole', { SeatID: 1 });
  await emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 1, CharacterID: 1 }] });
  await emit('MsgGameOver', { ...over, Players: [{ SeatID: 0, Result: 1, isRobot: true }, over.Players[1]] });
  assert.equal(c.view().matches.length, 2); assert.equal(c.view().records.length, 2);
  assert.equal(c.view().matches[1].result, 0);
});

test('achievement initializes without a mounted panel and remount does not query again', async t => {
  const f = fixture(t, 'baisheng'); let panel;
  f.ctx.ui = { registerPanel(value) { panel = value; }, icon() { return f.ctx.document.createElement('i'); } };
  Object.assign(f.ctx.ui, mountPluginUI(f.ctx, () => f.ctx));
  activateAchievements(f.ctx);
  const root = f.ctx.document.querySelector('main');
  await flush();
  assert.equal(f.requests.length, 1);
  let dispose = panel.render(root); await flush();
  assert.equal(f.requests.length, 1);
  f.proxy.event('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: '甲', Achs: [{ ID: 100, type: 2, detailInfo: 17 }] });
  await flush(); assert.match(root.textContent, /17 \/ 100/);
  // No local refresh in flight: a different caller's authoritative reply updates immediately.
  f.proxy.event('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: '甲', Achs: [{ ID: 100, type: 2, detailInfo: 29 }] });
  await flush(); assert.match(root.textContent, /29 \/ 100/);
  assert.equal(f.requests.length, 1);
  dispose(); dispose = panel.render(root); await flush();
  assert.equal(f.requests.length, 1); dispose();
});


test('single-rider training remains excluded even when matchmaking bots are accepted', async t => {
  const f=fixture(t,'appearances'), c=appearances(f.ctx); f.mode(160);
  const emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  await emit('ClientTrainingRep',{Result:1});
  await emit('MsgGameDealCharacter',{Type:1,Datas:[1,2]});
  await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:1}]});
  await emit('GsCFirstPhaseRole',{SeatID:0});
  await emit('MsgGameOver',{ModeType:160,GoupID:3,GameModel:37,Players:[{SeatID:0,userId:41,Result:0},{SeatID:1,isRobot:true}]});
  assert.equal(c.view().records.length,0);assert.equal(c.view().matches.length,0);
});


for (const spec of [{group:2,first:1,training:false,count:1}, {group:3,first:0,training:true,count:0}, {group:99,first:0,training:false,count:0}])
test(`missing native mode waits for settlement: group=${spec.group} training=${spec.training}`, async t => {
  const f=fixture(t,'appearances'), original=f.ctx.game.getClass;
  f.ctx.game.getClass=name=>name==='GameContext'?undefined:original(name);
  const c=appearances(f.ctx), emit=async(type,p={})=>{f.proxy.event(type,{Protocol:p});await flush();};
  if(spec.training)await emit('ClientTrainingRep',{Result:1});
  await emit('MsgGameDealCharacter',{Type:1,Datas:[374,393,498,709,437]});
  await emit('MsgGameDealCharacter',{Type:3,Datas:[715]});
  await emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:709}]});
  await emit('GsCFirstPhaseRole',{SeatID:spec.first});
  assert.equal(c.view().records.length,0,'no unverified mode is persisted');
  await emit('MsgGameOver',{ModeType:160,GoupID:spec.group,GameModel:37,time:142,Players:[{SeatID:0,Result:0,isRobot:false},{SeatID:1,Result:1,isRobot:false}]});
  assert.equal(c.view().records.length,spec.count);assert.equal(c.view().matches.length,spec.count);
  if(spec.count){assert.equal(c.view().matches[0].position,2);assert.equal(c.view().matches[0].result,0);assert.deepEqual(c.view().records[0].general,[374,393,498,709,437,715]);}
});


test('observed training then matchmaking sequence saves only the last single-rider win',async t=>{
  const {readFile}=await import('node:fs/promises');
  const rows=JSON.parse(await readFile(new URL('./fixtures/appearance-single-rider-missing-mode.json',import.meta.url),'utf8'));
  const f=fixture(t,'appearances'),original=f.ctx.game.getClass;
  f.ctx.game.getClass=name=>name==='GameContext'?undefined:original(name);
  const c=appearances(f.ctx);
  for(const row of rows){f.proxy.event(row.type,{Protocol:row.packet});await flush();}
  assert.equal(c.view().records.length,1);assert.equal(c.view().matches.length,1);
  assert.deepEqual(c.view().records[0].general,[374,393,498,709,437]);
  assert.deepEqual(c.view().matches[0].general,[709]);
  assert.equal(c.view().matches[0].position,2);assert.equal(c.view().matches[0].result,0);
  assert.equal(c.view().matches[0].duration,142);
});


for(const variant of ['observed','wrong-model','incomplete-roster','duplicate-roster','missing-first'])
test(`ranked real event replay with unavailable native positions: ${variant}`, async t=>{
 const {readFile}=await import('node:fs/promises');
 const rows=JSON.parse(await readFile(new URL('./fixtures/appearance-ranked-missing-mode.json',import.meta.url),'utf8'));
 const f=fixture(t,'appearances'),original=f.ctx.game.getClass;
 f.ctx.game.getClass=name=>name==='GameContext'?undefined:original(name);
 const c=appearances(f.ctx);
 for(const row of rows){
  if(variant==='missing-first'&&row.type==='GsCFirstPhaseRole')continue;
  if(row.type==='SmsgGameSetCharacter'&&row.packet.Infos.length===4){
   if(variant==='incomplete-roster')row.packet.Infos.pop();
   if(variant==='duplicate-roster')row.packet.Infos[3].SeatID=2;
  }
  if(variant==='wrong-model'&&row.type==='MsgGameOver')row.packet.GameModel=37;
  f.proxy.event(row.type,{Protocol:row.packet});await flush();
 }
 const count=variant==='observed'?1:0;
 assert.equal(c.view().records.length,count);assert.equal(c.view().matches.length,count);
 if(count){assert.equal(c.view().matches[0].position,2);assert.equal(c.view().matches[0].result,1);assert.equal(c.view().matches[0].duration,387);assert.deepEqual(c.view().matches[0].general,[543]);assert.equal(c.view().records[0].general.length,12);}
});


test('ranked rematch uses the opening roster instead of the old table and UI seat for candidates, selection and settlement', async t => {
  const f = fixture(t, 'appearances'), c = appearances(f.ctx);
  f.mode(132);
  const emit = (type, Protocol) => f.proxy.event(type, { Protocol });
  const roster = ownSeat => [0, 1, 2, 3].map(SeatID => ({ SeatID, ClientID: SeatID === ownSeat ? 41 : 90 + SeatID }));
  emit('ClientSitdownRep', { Result: 1, TypeID: 132, GroupID: 3, SeatID: 0 });
  emit('GsCModifyUserseatNtf', { IsGameStart: true, Infos: roster(3) });
  emit('MsgGameDealCharacterPaiwei', { randomHt: new Map([[0, { Datas: [2, 4] }], [3, { Datas: [1, 2] }]]) });
  emit('GsCFirstPhaseRole', { SeatID: 0 });
  emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 2 }] });
  await flush();
  assert.equal(c.view().records[0].selected, null);
  emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 3, CharacterID: 1 }] });
  await flush();
  assert.deepEqual(c.view().records[0].selected, [1]);
  emit('MsgGameOver', { ModeType: 132, GoupID: 3, GameModel: 7, time: 141, Players: [
    { SeatID: 1, Result: 1 }, { SeatID: 0, userId: 90, Result: 0 }, { SeatID: 3, userId: 41, Result: 0 }, { SeatID: 2, Result: 1 },
  ] });
  await flush();
  const { records, matches } = c.view();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].general, [1, 2]);
  assert.deepEqual(records[0].selected, [1]);
  assert.equal(records[0].position, 4);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, records[0].id);
  assert.equal(matches[0].result, 0);
  assert.equal(matches[0].duration, 141);

  // The next game has its own seat map, and a spectator/absent account cannot
  // inherit the previous seat, even if it is still the UI's self seat.
  emit('GsCModifyUserseatNtf', { IsGameStart: true, Infos: roster(-1) });
  emit('MsgGameDealCharacter', { Type: 1, Datas: [2, 3] });
  emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 2 }] });
  await flush();
  assert.equal(c.view().records.length, 1);
  assert.equal(c.view().matches.length, 1);
});

test('appearances: official history requests on login and next opening; deduplicates, isolates account and disposes', async t => {
  const f = fixture(t, 'appearances'), calls = [];
  f.ctx.game.getClass = ((original) => name => name === 'UserInfoManger'
    ? { SendClientGameRecordInfoReq: (...args) => calls.push(args) } : original(name))(f.ctx.game.getClass);
  const ended = Math.floor(Date.now()/1000) + 28800 - 60;
  f.ctx.storage.set('account:41:records-v1', {schema:1,records:[{id:'missed',mode:35,general:[1,2],selected:[1],time:(ended-28800)*1000-310000,figure:3}],matches:[]});
  const c = appearances(f.ctx);
  for (let i=0; i<30 && !calls.length; i++) await flush();
  assert.equal(calls[0][1], 26);
  const row = { label_mode: 14803, figure: 3, game_result: 0, game_time: 300,
    game_over_time: ended, used_general: [1], game_id: '123456789' };
  const reply = (mode, rows) => f.proxy.event('ClientGameRecordInfoRep', { Protocol: { query_uid: 41, id: mode, all_record: rows } });
  reply(35, [null, row]); reply(26, []); reply(44, []); await flush();
  assert.equal(c.view().matches.length, 1);
  assert.equal(c.view().matches[0].figure, 3);
  assert.equal(c.view().historyStatus, '已补收 1 局战绩');
  // Start another query after the request throttle without waiting in real time.
  const originalNow = Date.now; Date.now = () => originalNow() + 11000;
  try {
    f.proxy.event('SmsgGameSetCharacter', { Protocol: { Infos: [{ SeatID: 0, CharacterID: 1 }] } }); await flush();
    assert.ok(c.view().historyLoading);
    reply(35, [row]); reply(26, []); reply(44, []); await flush();
    assert.equal(c.view().matches.length, 1);
    Date.now = () => originalNow() + 22000; c.refreshHistory(); f.account(42);
    reply(35, [{ ...row, game_id: '999' }]); await flush();
    assert.equal(c.view().matches.length, 0);
  } finally { Date.now = originalNow; }
  f.scope.dispose(); assert.equal([...f.handlers.values()].flat().length, 0);
});

test('ranked official history uses the native 排位 tab and repairs a binary-list record after clicking 战绩', async t => {
  const f = fixture(t, 'appearances'), requests = [];
  const manager = { SendClientGameRecordInfoReq() {}, SendGetLastModeHighScore(...args) { requests.push(args); } };
  const getClass = f.ctx.game.getClass;
  f.ctx.game.getClass = name => name === 'UserInfoManger' ? manager : getClass(name);
  const endedAt = Math.floor(Date.now() / 1000) * 1000 - 60000;
  const frame = { id: 'teammate-was-recorded', mode: 26, rawMode: 132, rawGroup: 3, source: 'toolbox',
    seat: 0, position: 1, selected: [102], general: [101, 102, 103], time: endedAt - 150000 };
  const key = 'account:41:records-v1';
  f.ctx.storage.set(key, { schema: 1, records: [frame], matches: [] });
  const c = appearances(f.ctx);
  for (let i = 0; i < 15 && !requests.length; i++) await flush();
  assert.deepEqual(requests, [[41, 100, 1, false]]);
  const recordId = { high: 1, low: 2 };
  const row = { GameId: recordId, Label: 13203, GameTime: 141,
    GameResult: 0, GameOverTime: endedAt / 1000 + 28800, UsedGenerals: [101] };
  const list = (uuid, tab = 1) => f.proxy.event('ClientGameRecordInfoRep',
    { Protocol: { Uuid: uuid, RecordId: 9999, Tab: tab, RecordItems: [row] } });
  const detail = (ownAccount, gameid = recordId) => f.proxy.event('decodeClientGameOverRecordResp', {
    Protocol: { Data: { ProtoObj: { gameid, info: { info: { gamemodel: 7, label_model: 132, section: 3 },
      player_list: [
        { uid: 90, general_id: [102, 0] }, { seatid: 1, uid: 91, general_id: [4] },
        { seatid: 2, uid: 92, general_id: [5] }, { seatid: 3, uid: ownAccount, general_id: [101, 0] },
      ] } } } },
  });
  list(42); detail(41); await flush();
  assert.equal(c.view().matches.length, 0, 'another account’s list is ignored');
  list(41); detail(42); detail(41, '42'); await flush();
  assert.deepEqual(c.view().records, [frame], 'the list, another player or another game ID alone cannot overwrite a frame');
  detail(41); await flush();
  const saved = f.ctx.storage.get(key);
  assert.deepEqual(saved.records, [{ ...frame, seat: 3, position: 4, selected: [101] }]);
  assert.equal(saved.matches[0].id, frame.id);
  assert.equal(saved.matches[0].result, 0);
  assert.equal(saved.matches[0].duration, 141);
  assert.equal(c.view().historyStatus, '已补收 1 局战绩');
  list(41, 0); detail(41); await flush();
  assert.equal(c.view().matches.length, 1, 'opening the same official record cannot duplicate it');
});

test('appearances: capture notices are separate from save failures and idle proxy changes do not count gaps', async t => {
 t.mock.timers.enable({ apis: ['setInterval'] });
 const f=fixture(t,'appearances');
 const c=appearances(f.ctx); await flush();
 const proxy=f.ctx.game.getServerProxy();
 f.ctx.game.getServerProxy=()=>({...proxy});
 t.mock.timers.tick(500); await flush(); assert.equal(c.view().gaps,0); assert.equal(c.view().error,'');
 // Rebind to a stable native proxy, then provoke a malformed candidate packet.
 f.ctx.game.getServerProxy=()=>proxy; t.mock.timers.tick(500);
 f.proxy.event('MsgGameDealCharacter',{Protocol:{Type:1,Datas:[1,2]}}); await flush();
 f.proxy.event('MsgGameDealCharacter',{Protocol:{Type:3,Datas:Array(257).fill(2)}}); await flush();
 assert.equal(c.view().gaps,1); assert.match(c.view().captureNotice,/采集中断/);
 assert.match(c.view().captureDetail,/MsgGameDealCharacter/);
 assert.equal(c.view().error,''); assert.equal(c.view().canRetrySave,false);
 c.dismissCaptureNotice(); assert.equal(c.view().captureNotice,'');
 assert.equal(c.view().gaps,1);
});
