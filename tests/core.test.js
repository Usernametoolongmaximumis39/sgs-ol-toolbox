import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { PACKAGE_FORMAT, canonical, packageDigest, verifyPackage, compilePackage } from '../src/core/packages.js';
import { Settings, PackageStore } from '../src/core/storage.js';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { ThemeRegistry, BLACK_GOLD } from '../src/core/themes.js';
import { PluginManager } from '../src/core/plugins.js';
import { CARD_JOURNAL_EVENTS, initialState as initialCards, reduce as reduceCards } from '../src/plugins/cards/model.js';

const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => structuredClone(value);

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
}

class MemoryPackageStore {
  constructor(records = []) { this.records = new Map(records.map((r) => [r.id, clone(r)])); this.failNextPut = false; }
  async list() { return clone([...this.records.values()]); }
  async put(record) {
    if (this.beforePut) await this.beforePut(record);
    if (this.failNextPut) { this.failNextPut = false; throw new Error('测试存储失败'); }
    this.records.set(record.id, clone(record));
  }
  async delete(id) { this.records.delete(id); }
}

async function pluginPackage(version = '0.1.0', { factor = 1, failActivate = false } = {}) {
  const manifest = { id: 'test.cards', name: '测试卡牌', version, apiVersion: 1, categories: ['game'] };
  const code = `return {
    manifest: ${JSON.stringify(manifest)},
    initialState: () => ({ total: 0, seqs: [] }),
    reduce: (state, event) => ({ total: state.total + (Number(event.payload.value) || 0) * ${factor}, seqs: [...state.seqs, event.seq] }),
    async activate(ctx) {
      ctx.window.metrics.activations.push(${JSON.stringify(version)});
      ctx.ui.registerPanel({ id: 'main', title: '测试', category: 'game', render() {} });
      ctx.scope.add(() => ctx.window.metrics.disposals.push(${JSON.stringify(version)}));
      ctx.subscribe((state, event) => ctx.window.metrics.seen.push({ version: ${JSON.stringify(version)}, seq: event.seq, total: state.total }));
      if (${JSON.stringify(failActivate)}) throw new Error('测试激活失败');
      if (ctx.window.activationGate) await ctx.window.activationGate;
    }
  };`;
  return { format: PACKAGE_FORMAT, manifest, code, sha256: await packageDigest(manifest, code) };
}

async function harness(t, { store = new MemoryPackageStore(), journal = new SessionJournal(), settings = new Settings(new MemoryStorage()), builtin } = {}) {
  const metrics = { activations: [], disposals: [], seen: [], notifications: [] };
  const panels = new Map();
  const context = {
    window: { metrics }, document: {}, game: {},
    notify(message) { metrics.notifications.push(message); },
    ui: { registerPanel(spec) {
      if (panels.has(spec.id)) throw new Error(`重复面板 ${spec.id}`);
      panels.set(spec.id, spec);
      return () => { if (panels.get(spec.id) === spec) panels.delete(spec.id); };
    } },
    themes: new ThemeRegistry(settings),
  };
  const manager = new PluginManager({ journal, store, settings, context });
  manager.registerBuiltin(builtin || compilePackage(await pluginPackage()));
  await manager.init();
  t.after(() => manager.dispose());
  return { manager, journal, store, settings, metrics, panels, context };
}

function state(manager) { return manager.slots.get('test.cards')?.state; }

test('package digest includes canonical manifest and exact code; tampering cannot install', async () => {
  const pkg = await pluginPackage();
  assert.equal(await verifyPackage(pkg), pkg);
  const reversed = Object.fromEntries(Object.entries(pkg.manifest).reverse());
  assert.equal(await packageDigest(reversed, pkg.code), pkg.sha256);
  assert.equal(compilePackage(pkg).manifest.version, '0.1.0');
  await assert.rejects(verifyPackage({ ...pkg, code: pkg.code + '\n' }), /校验失败/);
  await assert.rejects(verifyPackage({ ...pkg, manifest: { ...pkg.manifest, version: '0.2.0' } }), /校验失败/);
  await assert.rejects(verifyPackage({ ...pkg, manifest: { ...pkg.manifest, apiVersion: 2 } }), /不兼容/);
  assert.throws(() => compilePackage({ ...pkg, manifest: { ...pkg.manifest, name: '冒名插件' } }), /不匹配/);
  assert.equal(canonical({ b: [3, 2], a: 1 }), '{"a":1,"b":[3,2]}');
});

test('install, reload, disable, enable, uninstall, reinstall and rollback retain the same journal', async (t) => {
  const { manager, journal, panels, metrics } = await harness(t);
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2] });
  journal.push('PubGsCMoveCard', { value: 3 });
  assert.equal(state(manager).total, 3);
  await manager.install(await pluginPackage('0.2.0', { factor: 2 }));
  assert.equal(state(manager).total, 6);
  assert.equal(manager.list()[0].version, '0.2.0');
  assert.equal(panels.size, 1);
  await manager.reload('test.cards');
  assert.equal(state(manager).total, 6);
  await manager.disable('test.cards');
  journal.push('PubGsCMoveCard', { value: 2 });
  assert.equal(panels.size, 0);
  assert.equal(state(manager).total, 10);
  await manager.enable('test.cards');
  assert.equal(panels.size, 1);
  await manager.rollback('test.cards');
  assert.equal(manager.list()[0].version, '0.1.0');
  assert.equal(state(manager).total, 5);
  await manager.uninstall('test.cards');
  assert.equal(manager.list().length, 0);
  assert.equal(panels.size, 0);
  journal.push('PubGsCMoveCard', { value: 4 });
  await manager.install(await pluginPackage('0.3.0'));
  assert.equal(state(manager).total, 9);
  assert.equal(state(manager).seqs.length, journal.events.length);
  assert.equal(new Set(state(manager).seqs).size, journal.events.length);
  assert.equal(panels.size, 1);
  assert.equal(metrics.notifications.length, 0);
});

test('ten hot reloads never multiply subscriptions or replay historical UI notifications', async (t) => {
  const { manager, journal, panels, metrics } = await harness(t);
  journal.push('PubGsCMoveCard', { value: 1 });
  const beforeReplay = metrics.seen.length;
  for (let i = 0; i < 10; i++) await manager.reload('test.cards');
  assert.equal(metrics.seen.length, beforeReplay);
  assert.equal(panels.size, 1);
  assert.equal(manager.slots.get('test.cards').listeners.size, 1);
  assert.equal(journal.listeners.size, 1);
  const event = journal.push('PubGsCMoveCard', { value: 2 });
  assert.equal(metrics.seen.filter((item) => item.seq === event.seq).length, 1);
  assert.equal(state(manager).total, 3);
  manager.dispose();
  assert.equal(panels.size, 0);
  assert.equal(journal.listeners.size, 0);
});

test('events arriving during async activation and storage commit are counted once', async (t) => {
  const { manager, journal, context, store } = await harness(t);
  journal.push('PubGsCMoveCard', { value: 1 });
  let release;
  context.window.activationGate = new Promise((resolve) => { release = resolve; });
  const pkg = await pluginPackage('0.2.0');
  const installing = manager.install(pkg);
  for (let i = 0; i < 100 && manager.list()[0].version !== '0.2.0'; i++) await pause(1);
  assert.equal(manager.list()[0].version, '0.2.0');
  journal.push('PubGsCMoveCard', { value: 2 });
  store.beforePut = () => { journal.push('PubGsCMoveCard', { value: 3 }); };
  release();
  await installing;
  delete context.window.activationGate;
  delete store.beforePut;
  assert.equal(state(manager).total, 6);
  assert.deepEqual(state(manager).seqs, journal.events.map((event) => event.seq));
});

test('failed activation cleans candidate resources and restores the old version from current history', async (t) => {
  const { manager, journal, panels, store } = await harness(t);
  journal.push('PubGsCMoveCard', { value: 5 });
  await assert.rejects(manager.install(await pluginPackage('0.2.0', { failActivate: true })), /激活失败/);
  assert.equal(manager.list()[0].version, '0.1.0');
  assert.equal(manager.list()[0].active, true);
  assert.equal(state(manager).total, 5);
  assert.equal(panels.size, 1);
  assert.equal(store.records.has('test.cards'), false);
  journal.push('PubGsCMoveCard', { value: 3 });
  assert.equal(state(manager).total, 8);
});

test('disposing the manager during async activation prevents a late install from reviving or persisting', async (t) => {
  const { manager, context, store, panels, journal } = await harness(t);
  let release;
  context.window.activationGate = new Promise((resolve) => { release = resolve; });
  const installing = manager.install(await pluginPackage('0.2.0'));
  for (let i = 0; i < 100 && manager.list()[0].version !== '0.2.0'; i++) await pause(1);
  assert.equal(manager.list()[0].version, '0.2.0');
  manager.dispose();
  delete context.window.activationGate;
  release();
  await assert.rejects(installing);
  assert.equal(panels.size, 0);
  assert.equal(journal.listeners.size, 0);
  assert.equal(manager.list().some((item) => item.active), false);
  assert.equal(store.records.size, 0);
});

test('failed persistence rolls runtime back and includes events received during the failed switch', async (t) => {
  const { manager, journal, panels, store } = await harness(t);
  journal.push('PubGsCMoveCard', { value: 4 });
  store.beforePut = () => { journal.push('PubGsCMoveCard', { value: 2 }); };
  store.failNextPut = true;
  await assert.rejects(manager.install(await pluginPackage('0.2.0', { factor: 2 })), /存储失败/);
  delete store.beforePut;
  assert.equal(manager.list()[0].version, '0.1.0');
  assert.equal(state(manager).total, 6);
  assert.equal(panels.size, 1);
  assert.equal(store.records.size, 0);
});

test('disabled and uninstalled builtins stay disabled after application restart', async (t) => {
  const first = await harness(t);
  await first.manager.disable('test.cards');
  first.manager.dispose();
  const second = await harness(t, { store: first.store, settings: first.settings });
  assert.equal(second.manager.list()[0].enabled, false);
  assert.equal(second.manager.list()[0].active, false);
  assert.equal(second.metrics.activations.length, 0);
  assert.equal(second.panels.size, 0);
  await second.manager.uninstall('test.cards');
  second.manager.dispose();
  const third = await harness(t, { store: first.store, settings: first.settings });
  assert.equal(third.manager.list().length, 0);
  assert.equal(third.panels.size, 0);
  await third.manager.restoreBuiltin('test.cards');
  assert.equal(third.manager.list()[0].active, true);
});

test('failed enable or disable persistence does not change the recorded enabled state', async (t) => {
  const { manager, store, panels } = await harness(t);
  store.failNextPut = true;
  await assert.rejects(manager.disable('test.cards'), /存储失败/);
  assert.equal(manager.list()[0].active, true);
  assert.equal(panels.size, 1);
  await manager.disable('test.cards');
  store.failNextPut = true;
  await assert.rejects(manager.enable('test.cards'), /存储失败/);
  assert.equal(manager.list()[0].enabled, false);
  assert.equal(manager.list()[0].active, false);
  assert.equal(panels.size, 0);
});

test('startup activation failure falls back to the previous working package', async (t) => {
  const previous = await pluginPackage('0.2.0');
  const active = await pluginPackage('0.3.0', { failActivate: true });
  const store = new MemoryPackageStore([{ id: 'test.cards', enabled: true, uninstalled: false, active, previous }]);
  const { manager, panels } = await harness(t, { store });
  assert.equal(manager.list()[0].version, '0.2.0');
  assert.equal(manager.list()[0].active, true);
  assert.equal(panels.size, 1);
});

test('a startup package load failure can use the builtin while retaining the stored package', async (t) => {
  const active = await pluginPackage('0.3.0'); active.code += '\n// altered';
  const store = new MemoryPackageStore([{ id: 'test.cards', enabled: false, uninstalled: false, active, previous: null }]);
  const { manager } = await harness(t, { store });
  assert.equal(manager.list()[0].version, '0.1.0');
  assert.equal(manager.list()[0].active, false);
  assert.equal(manager.list()[0].source, '内置');
  assert.equal(store.records.get('test.cards').active.code, active.code);
  assert.match(manager.loadIssues.get('test.cards').message, /校验失败/);
  assert.equal(store.records.get('test.cards').enabled, false);
});

test('core upgrade replaces only exact released package digests and preserves disabled state and rollback', async t => {
  const old = await pluginPackage('0.1.0'), custom = await pluginPackage('0.1.0', { factor: 7 });
  const builtin = { ...compilePackage(await pluginPackage('0.1.2', { factor: 2 })), replacesPackageDigests: [old.sha256] };
  for (const enabled of [true, false]) {
    const store = new MemoryPackageStore([{ id: 'test.cards', enabled, active: old, previous: null, uninstalled: false }]);
    const { manager } = await harness(t, { store, builtin });
    assert.equal(manager.list()[0].version, '0.1.2'); assert.equal(manager.list()[0].active, enabled);
    assert.equal(store.records.get('test.cards').active, null);
    assert.equal(store.records.get('test.cards').previous.sha256, old.sha256);
    await manager.rollback('test.cards'); assert.equal(manager.list()[0].version, '0.1.0'); manager.dispose();
    const restarted = await harness(t, { store, builtin }); assert.equal(restarted.manager.list()[0].version, '0.1.0', 'An explicit rollback must survive refresh');
  }
  const store = new MemoryPackageStore([{ id: 'test.cards', enabled: true, active: custom, previous: null, uninstalled: false }]);
  const customRun = await harness(t, { store, builtin });
  assert.equal(customRun.manager.list()[0].version, '0.1.0'); assert.equal(store.records.get('test.cards').active.sha256, custom.sha256);
  const removed = await harness(t, { store: new MemoryPackageStore([{ id: 'test.cards', uninstalled: true, active: old }]), builtin });
  assert.equal(removed.manager.list().length, 0);
});

test('released and expired resources do not accumulate in a long lived scope', async () => {
  const scope = new ResourceScope(); let disposed = 0;
  const release = scope.add(() => disposed++); release(); release();
  assert.equal(scope.cleanups.length, 0);
  scope.timeout(() => disposed++, 1);
  await pause(15);
  assert.equal(scope.cleanups.length, 0);
  scope.dispose();
  assert.equal(disposed, 2);
});

test('new session resets plugin state without carrying previous game totals', async (t) => {
  const { manager, journal } = await harness(t);
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2] });
  journal.push('PubGsCMoveCard', { value: 9 });
  journal.push('MsgGamePlayCardNtf', { CardList: [3, 4] });
  assert.equal(state(manager).total, 0);
  assert.equal(state(manager).seqs.length, 1);
  await manager.reload('test.cards');
  assert.equal(state(manager).total, 0);
  assert.equal(state(manager).seqs.length, 1);
});

test('journal snapshots game payloads and keeps repeated legitimate messages', () => {
  const journal = new SessionJournal();
  const payload = { CardIDs: [1], seat: { id: 2 } };
  journal.push('PubGsCMoveCard', payload);
  payload.CardIDs[0] = 99;
  payload.seat.id = 3;
  journal.push('PubGsCMoveCard', { CardIDs: [1], seat: { id: 2 } });
  assert.deepEqual(journal.events[0].payload, { CardIDs: [1], seat: { id: 2 } });
  assert.equal(journal.events.length, 2);
  assert.notEqual(journal.events[0].seq, journal.events[1].seq);
  journal.subscribe(() => { throw new Error('consumer failure'); });
  assert.doesNotThrow(() => journal.push('MsgGameRoundNtf', {}));
  journal.push('MsgGamePlayCardNtf', { CardList: [1] });
  assert.equal(journal.incomplete, false);
  journal.push('MsgReconnectGame', {});
  assert.equal(journal.incomplete, true);
});

test('projected signatures match cross-source echoes and keep all same-source copies and distinct card lists', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope();
  t.after(() => scope.dispose());
  const native = { event() {} }, other = { event() {} }, win = { console: { log() {} } };
  const type = 'PubGsCMoveCard';
  const bridge = installMessageBridge(win, journal, scope, undefined, { getTargets: () => [
    { name: 'ServerProxy', target: native }, { name: 'ActivityManager', target: other },
  ] });
  const raw = { CardIDs: [{ CardId: 41, CardID: 41 }, 42], CardCount: 2, FromID: 255 };
  native.event(type, raw);
  native.event(type, raw);
  await Promise.resolve().then(() => {
    const echo = { ClassName: type, CardCount: 2, FromID: 255, CardIDs: [{ CardID: 41, CardId: 41 }, 42] };
    win.console.log('recv', echo);
    win.console.log('recv', echo);
    other.event(type, raw);
    win.console.log('recv', { ...echo, CardIDs: [{ CardID: 41, CardId: 41 }, 43] });
    other.event(type, { ...raw, CardIDs: [42, { CardId: 41, CardID: 41 }] });
  });
  await bridge.flush();
  assert.deepEqual(journal.events.map(event => event.payload.CardIDs.map(id => id.CardId ?? id)), [
    [41, 42], [41, 42], [41, 43], [42, 41],
  ]);
  win.console.log('recv', { ClassName: type, ...raw });
  await bridge.flush();
  assert.equal(journal.events.length, 5, 'the next task starts a new echo window');
});

test('journal replay truncation is ordered, private to replay, and clears at the next opening', () => {
  const journal = new SessionJournal({ historyLimit: 3 }), observed = [];
  journal.subscribe(event => observed.push(event));
  journal.push('MsgGamePlayCardNtf', { CardList: [1] });
  for (let i = 0; i < 5; i++) journal.push('PubGsCUseCard', { CardID: i + 1 });
  assert.deepEqual(journal.events.map(event => event.seq), [4, 5, 6]);
  assert.equal(journal.snapshot().omittedEvents, 3);
  assert.equal(journal.incomplete, false);
  assert.equal(observed.length, 6);
  assert.ok(observed.every(event => event.type !== 'toolbox:gap'));
  const replay = [...journal.replayAfter(0)];
  assert.deepEqual(replay.map(event => event.seq), [3, 4, 5, 6]);
  assert.equal(replay[0].payload.replayOnly, true);
  assert.deepEqual([...journal.replayAfter(3)], journal.events);
  assert.deepEqual([...journal.replayAfter(5)].map(event => event.seq), [6]);
  const start = journal.push('MsgGamePlayCardNtf', { CardList: [2] });
  assert.deepEqual([...journal.replayAfter(0)], [start]);
  assert.equal(journal.snapshot().omittedEvents, 0);
});

test('selective reducers and subscriptions receive their events and lifecycle signals while legacy plugins see all', async t => {
  const { manager, journal, metrics } = await harness(t);
  const delivered = [], reduced = [];
  const manifest = { id: 'selective', name: '选择事件', apiVersion: 1, version: '1.0.0', categories: [], journalEvents: ['PubGsCUseCard'] };
  assert.throws(() => manager.registerBuiltin({ manifest: { ...manifest, journalEvents: ['Duplicate', 'Duplicate'] } }), /事件订阅/);
  manager.registerBuiltin({ manifest, initialState: () => 0,
    reduce(state, event) { reduced.push(event.type); return state + 1; },
    activate(ctx) { ctx.subscribe((_, event) => delivered.push(event.type)); },
  });
  await manager.restoreBuiltin('selective');
  const types = ['MsgGamePlayCardNtf', 'PubGsCMoveCard', 'PubGsCUseCard', 'toolbox:gap'];
  for (const type of types) journal.push(type, { CardList: [1] });
  assert.deepEqual(reduced, [types[0], types[2], types[3]]);
  assert.deepEqual(delivered, reduced);
  assert.equal(metrics.seen.length, types.length);
  await manager.disable('selective');
  journal.push('PubGsCUseCard', {});
  assert.equal(reduced.length, 4);
  assert.equal(delivered.length, 3);
  await manager.enable('selective');
  journal.push('MsgGamePlayCardNtf', { CardList: [2] });
  assert.equal(manager.slots.get('selective').state, 1);
  assert.equal(delivered.at(-1), 'MsgGamePlayCardNtf');
});

test('history eviction preserves live cards and reload, signals only a rebuilding reducer, and requests resync', async t => {
  const journal = new SessionJournal({ historyLimit: 4 });
  const module = { manifest: { id: 'test.cards', name: '测试卡牌', version: '1.0.0', categories: [], apiVersion: 1,
    journalEvents: CARD_JOURNAL_EVENTS }, initialState: initialCards, reduce: reduceCards, activate() {} };
  const { manager } = await harness(t, { journal, builtin: module });
  let resync = 0;
  manager.onReplayGap = () => { resync++; };
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2, 3] });
  journal.push('toolbox:snapshot', { inGame: true, selfSeatId: 0, handCardIds: [1], seats: [{ seatId: 0 }] });
  const live = state(manager);
  for (let i = 0; i < 8; i++) journal.push('decodeRogueLikeItemEffectNtf', { ItemID: i });
  assert.equal(state(manager), live);
  assert.equal(live.historyComplete, true);
  assert.equal(resync, 0);
  await manager.reload('test.cards');
  assert.equal(state(manager), live, 'reloading the same module keeps its live state');
  assert.equal(resync, 0);
  manager.registerBuiltin({ ...module, manifest: { ...module.manifest, id: 'late.cards' } });
  await manager.restoreBuiltin('late.cards');
  const late = manager.slots.get('late.cards').state;
  assert.equal(late.historyComplete, false);
  assert.ok(late.limitations.some(item => item.code === 'history-gap'));
  assert.equal(resync, 1);
  assert.equal(state(manager), live);
  await assert.rejects(manager.install(await pluginPackage('2.0.0', { failActivate: true })), /测试激活失败/);
  assert.equal(state(manager), live, 'a failed replacement recovers the old live state');
});

test('large replay yields to new native events and catches them up in order without live notifications', async t => {
  const { manager, journal } = await harness(t);
  for (let i = 0; i < 192; i++) journal.push('PubGsCUseCard', {});
  let injected = false, timerQueued = false, liveNotified = 0;
  const id = 'test.replay';
  manager.registerBuiltin({ manifest: { id, name: '测试重放', version: '1.0.0', categories: [], apiVersion: 1 },
    initialState: () => [],
    reduce(items, event) {
      if (!timerQueued) { timerQueued = true; setTimeout(() => { injected = true; journal.push('PubGsCUseCard', {}); }, 0); }
      return [...items, event.seq];
    },
    activate(ctx) { assert.equal(injected, true); ctx.subscribe(() => liveNotified++); },
  });
  await manager.restoreBuiltin(id);
  assert.deepEqual(manager.slots.get(id).state, Array.from({ length: 193 }, (_, i) => i + 1));
  assert.equal(liveNotified, 0);
  journal.push('PubGsCUseCard', {});
  assert.equal(liveNotified, 1);
});

test('console bridge replaces a configurable legacy accessor without invoking its setter', async () => {
  const journal = new SessionJournal(), scope = new ResourceScope(); let setterCalls = 0, forwarded = 0;
  const original = () => ++forwarded;
  const getter = () => original, setter = () => setterCalls++;
  const win = { console: {} };
  Object.defineProperty(win.console, 'log', { get: getter, set: setter, configurable: true, enumerable: false });
  const bridge = installMessageBridge(win, journal, scope);
  assert.equal(win.console.log('recv', { ClassName: 'PubGsCMoveCard', CardIDs: [1] }), 1);
  await bridge.flush();
  assert.equal(journal.events.length, 1); assert.equal(setterCalls, 0);
  scope.dispose();
  assert.equal(Object.getOwnPropertyDescriptor(win.console, 'log').get, getter);
  assert.equal(Object.getOwnPropertyDescriptor(win.console, 'log').set, setter);
});

test('nonconfigurable console accessor reports unavailable capture without changing logging', () => {
  const journal = new SessionJournal(), scope = new ResourceScope(); let setterCalls = 0, forwarded = 0;
  const win = { console: {} }; Object.defineProperty(win.console, 'log', { get: () => () => ++forwarded, set: () => setterCalls++, configurable: false });
  const bridge = installMessageBridge(win, journal, scope);
  assert.match(bridge.error, /日志接入失败/);
  assert.equal(win.console.log({ ClassName: 'PubGsCMoveCard' }), 1);
  assert.equal(setterCalls, 0); assert.equal(journal.events.length, 0); scope.dispose();
});

test('console bridge preserves this, return values, exceptions, and filters outbound messages', async () => {
  const journal = new SessionJournal();
  const scope = new ResourceScope();
  const calls = [];
  const original = function (...args) { calls.push({ self: this, args }); if (args[0] === 'throw') throw new Error('native-error'); return 42; };
  const win = { console: { log: original } };
  const descriptor = Object.getOwnPropertyDescriptor(win.console, 'log');
  try {
    const bridge = installMessageBridge(win, journal, scope);
    const customThis = {};
    const received = { ClassName: 'PubGsCMoveCard', CardIDs: [1] };
    assert.equal(win.console.log.call(customThis, 'recv', received), 42);
    assert.equal(calls[0].self, customThis);
    assert.equal(calls[0].args[1], received);
    win.console.log('send', { ClassName: 'PubGsCMoveCard' });
    win.console.log('发送', { ClassName: 'PubGsCMoveCard' });
    win.console.log('ordinary', { ClassName: 'Unrelated' });
    await bridge.flush();
    assert.equal(journal.events.length, 1);
    assert.throws(() => win.console.log('throw'), /native-error/);
  } finally { scope.dispose(); }
  assert.equal(win.console.log, original);
  assert.deepEqual(Object.getOwnPropertyDescriptor(win.console, 'log'), descriptor);
});

test('console bridge diagnostics cannot prevent the original console call', () => {
  const journal = new SessionJournal();
  const scope = new ResourceScope();
  let calls = 0;
  const win = { console: { log() { calls++; return 'native'; } } };
  const payload = { get ClassName() { throw new Error('bad getter'); } };
  try {
    installMessageBridge(win, journal, scope, () => { throw new Error('diagnostic failure'); });
    assert.equal(win.console.log('recv', payload), 'native');
    assert.equal(calls, 1);
  } finally { scope.dispose(); }
});

test('disposed console bridge stays inert when another script still retains its wrapper', async () => {
  const journal = new SessionJournal();
  const scope = new ResourceScope();
  const native = () => 'native';
  const win = { console: { log: native } };
  const bridge = installMessageBridge(win, journal, scope);
  const oldBridge = win.console.log;
  const thirdParty = function (...args) { return Reflect.apply(oldBridge, this, args); };
  win.console.log = thirdParty;
  try {
    await pause(1050);
    win.console.log('recv', { ClassName: 'PubGsCMoveCard', value: 1 });
    await bridge.flush();
    assert.equal(journal.events.length, 1);
    scope.dispose();
    assert.equal(win.console.log, thirdParty);
    win.console.log('recv', { ClassName: 'PubGsCMoveCard', value: 2 });
    await bridge.flush();
    assert.equal(journal.events.length, 1);
  } finally { scope.dispose(); }
});

test('six registered themes coexist and overlays retract without reverting a new user choice', () => {
  const settings = new Settings(new MemoryStorage());
  let applied;
  const themes = new ThemeRegistry(settings, (value) => { applied = value; });
  const unregister = [];
  for (let i = 0; i < 6; i++) unregister.push(themes.register({ id: `skins.theme${i}`, name: `主题${i}`, tokens: { accent: `#00000${i}` } }, 'skins'));
  assert.equal(themes.list().length, 7);
  themes.select('skins.theme5');
  const removeA = themes.override('a', { accent: '#aaaaaa', text: '#111111' });
  const removeB = themes.override('b', { accent: '#bbbbbb' });
  assert.equal(applied.accent, '#bbbbbb');
  themes.select('skins.theme3');
  removeA();
  assert.equal(applied.accent, '#bbbbbb');
  assert.equal(applied.text, BLACK_GOLD.tokens.text);
  removeB();
  assert.equal(applied.accent, '#000003');
  unregister[3]();
  assert.equal(themes.current.id, BLACK_GOLD.id);
  assert.equal(settings.get('theme'), 'skins.theme3');
  themes.register({ id: 'skins.theme3', name: '重载主题3', tokens: { accent: '#ff0000' } }, 'skins');
  assert.equal(themes.current.id, 'skins.theme3');
  assert.equal(applied.accent, '#ff0000');
});

test('theme API enforces ownership and strips CSS injection tokens', () => {
  const themes = new ThemeRegistry(new Settings(new MemoryStorage()));
  assert.throws(() => themes.register({ id: 'other.palette', name: 'bad', tokens: {} }, 'plugin'), /前缀/);
  themes.override('plugin', { accent: 'red; display:none', bg: 'url(https://example.com/x)',
    arbitrary: 'bad', text: '#123456' });
  assert.equal(themes.current.tokens.accent, BLACK_GOLD.tokens.accent);
  assert.equal(themes.current.tokens.bg, BLACK_GOLD.tokens.bg);
  assert.equal(themes.current.tokens.arbitrary, undefined);
  assert.equal(themes.current.tokens.text, '#123456');
});

test('resource disposal remains complete when plugin cleanup throws and does not overwrite another patch', async () => {
  const scope = new ResourceScope();
  const target = new EventTarget();
  const object = { method() { return 1; } };
  const original = object.method;
  let events = 0, timerCalls = 0, disposed = 0;
  scope.listen(target, 'probe', () => { events++; });
  scope.timeout(() => { timerCalls++; }, 10);
  scope.patch(object, 'method', (method) => function () { return method.call(this) + 1; });
  assert.equal(object.method(), 2);
  const later = () => 3;
  object.method = later;
  scope.add(() => { disposed++; });
  scope.add(() => { throw new Error('bad plugin cleanup'); });
  assert.equal(scope.dispose().length, 1);
  assert.equal(scope.signal.aborted, true);
  assert.equal(object.method, later);
  assert.notEqual(object.method, original);
  target.dispatchEvent(new Event('probe'));
  await pause(20);
  assert.equal(events, 0);
  assert.equal(timerCalls, 0);
  assert.equal(disposed, 1);
  scope.dispose();
  assert.equal(disposed, 1);
});

test('settings namespaces preserve independent values and survive corrupt local entries', () => {
  const storage = new MemoryStorage();
  const settings = new Settings(storage);
  settings.namespace('one').set('enabled', true);
  settings.namespace('two').set('enabled', false);
  assert.equal(settings.namespace('one').get('enabled'), true);
  assert.equal(settings.namespace('two').get('enabled'), false);
  storage.setItem('sgstoolbox:broken', '{');
  assert.equal(settings.get('broken', 'fallback'), 'fallback');
});

test('PackageStore.put waits for the IndexedDB transaction commit and rejects an abort', async () => {
  let transaction;
  const db = { transaction() {
    transaction = { objectStore() { return { put() {} }; }, error: null };
    return transaction;
  } };
  const store = new PackageStore({});
  store.dbPromise = Promise.resolve(db);
  let resolved = false;
  const saving = store.put({ id: 'cards' }).then(() => { resolved = true; });
  await pause();
  assert.equal(resolved, false);
  transaction.oncomplete();
  await saving;
  assert.equal(resolved, true);
  const aborting = store.put({ id: 'cards' });
  await pause();
  transaction.error = new Error('transaction aborted');
  transaction.onabort();
  await assert.rejects(aborting, /transaction aborted/);
});


test('runtime errors refresh management once per changed error and activation retry clears stale status', async t => {
  let failActivation = false;
  const builtin = { manifest: { id: 'test.cards', name: '测试', version: '1.0.0', apiVersion: 1, categories: ['game'] },
    activate() { if (failActivation) throw new Error('activation failed'); },
    reduce(state, event) { if (event.type === 'broken') throw new Error('event failed'); return state; } };
  const h = await harness(t, { builtin }); let changes = 0;
  h.manager.onChange = () => changes++;
  h.journal.push('broken', {});
  assert.equal(h.manager.list()[0].error, ''); await h.manager.tail;
  assert.match(h.manager.list()[0].error, /自动重启失败/); assert.equal(changes, 1);
  assert.equal(h.metrics.notifications.length, 1);
  await h.manager.disable('test.cards'); failActivation = true;
  await assert.rejects(h.manager.enable('test.cards'), /activation failed/);
  assert.equal(h.manager.list()[0].error, 'activation failed'); assert.equal(changes, 3);
  failActivation = false; await h.manager.enable('test.cards');
  assert.equal(h.manager.list()[0].error, ''); assert.equal(h.manager.list()[0].active, true);
});

test('automatic recovery cleans resources, hides transient errors and retries only once', async t => {
  let starts = 0, stops = 0, ctx;
  const builtin = { manifest: { id: 'test.cards', name: '测试', version: '1.0.0', apiVersion: 1, categories: [] },
    activate(c) { ctx = c; starts++; c.scope.add(() => stops++); } };
  const h = await harness(t, { builtin });
  const old = ctx;
  ctx.reportError('temporary');
  assert.equal(h.manager.list()[0].error, '');
  await h.manager.tail;
  assert.equal(starts, 2); assert.equal(stops, 1); assert.equal(old.scope.closed, true);
  assert.equal(h.manager.list()[0].error, '');
  old.reportError('stale'); assert.equal(h.manager.list()[0].error, '');
  ctx.reportError('persistent'); await h.manager.tail;
  assert.equal(starts, 2); assert.equal(h.manager.list()[0].error, 'persistent');
});

test('transient startup exception retries activation after cleaning the failed scope', async t => {
  let starts = 0, stops = 0;
  const builtin = { manifest: { id: 'test.cards', name: '测试', version: '1.0.0', apiVersion: 1, categories: [] },
    activate(ctx) { starts++; ctx.scope.add(() => stops++); if (starts === 1) throw new Error('temporary'); } };
  const h = await harness(t, { builtin });
  assert.equal(starts, 2); assert.equal(stops, 1);
  assert.equal(h.manager.list()[0].active, true); assert.equal(h.manager.list()[0].error, '');
});
