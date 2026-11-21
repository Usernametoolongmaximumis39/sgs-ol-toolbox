import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pluginReleases, bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { PluginManager } from '../src/core/plugins.js';
import { Settings } from '../src/core/storage.js';
import { SessionJournal } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';
import { ThemeRegistry } from '../src/core/themes.js';
import { CardStyleRegistry } from '../src/core/card-styles.js';
import { BackgroundRegistry } from '../src/core/backgrounds.js';
import { createPluginNative } from '../src/core/plugin-native.js';

test('shared native observation projects immediately, drops cross-account deliveries and releases both scopes', async t => {
  const owner = new ResourceScope(), child = new ResourceScope(), handlers = new Map(), delivered = [], gaps = [];
  t.after(() => { child.dispose(); owner.dispose(); });
  let id = 1;
  const proxy = {
    on(type, caller, fn) { handlers.set(type, fn); },
    off(type, caller, fn) { assert.equal(handlers.get(type), fn); handlers.delete(type); },
  };
  const ctx = { scope: owner, game: { getSelf: () => ({ ClientId: id, NickName: '甲' }), getServerProxy: () => proxy } };
  const native = createPluginNative(ctx);
  const watch = () => native.observe({ Packet: packet => ({ value: packet.value }) },
    (type, packet, account) => delivered.push([type, packet.value, account.id]), detail => gaps.push(detail), { scope: child });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  watch();
  const packet = { value: 1 };
  handlers.get('Packet')(packet); packet.value = 2;
  await flush();
  assert.deepEqual(delivered, [['Packet', 1, '1']]);

  handlers.get('Packet')(packet); id = 2;
  await flush();
  assert.equal(delivered.length, 1);
  for (let i = 0; i < 257; i++) handlers.get('Packet')(packet);
  await flush();
  assert.deepEqual(gaps, [{ reason: 'overflow', type: 'Packet' }]);
  assert.equal(delivered.length, 1);

  const stale = handlers.get('Packet'); stale(packet);
  child.dispose(); stale(packet);
  await flush();
  assert.equal(handlers.size, 0);
  assert.equal(delivered.length, 1);
  assert.equal(owner.cleanups.length, 0);

  let received = 0;
  const stop = native.observe({ Packet: () => true }, () => { received++; stop(); });
  handlers.get('Packet')(packet);
  handlers.get('Packet')(packet);
  await flush();
  assert.equal(received, 1);
  assert.equal(handlers.size, 0);

  const secondChild = new ResourceScope();
  native.observe({ Packet: () => true }, () => {}, undefined, { scope: secondChild });
  owner.dispose();
  assert.equal(handlers.size, 0);
  assert.equal(secondChild.closed, false);
  assert.equal(secondChild.cleanups.length, 0);
});

// All real packages, only declared prerequisites, no login, scene or protocol sends.
// This verifies shared lifecycle obligations; per-feature fixtures cover gameplay.
for (const { id } of pluginReleases) test(`${id}: package lifecycle and panel cleanup in an isolated no-login environment`, async t => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' });
  // The no-account path only opens/closes the ledger DB. This stub deliberately
  // supplies no transaction API; persistence is covered by the browser fixture.
  const databases = new Set();
  dom.window.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      const db = { close() { databases.delete(db); } }; databases.add(db);
      request.result = db; request.onsuccess?.();
    });
    return request;
  } };
  const coreScope = new ResourceScope(), records = new Map(), panels = new Map();
  const settings = new Settings(dom.window.localStorage), journal = new SessionJournal();
  const game = { getScene: () => null, getClass: () => null, getSelf: () => null, getServerProxy: () => null,
    getSeatUIs: () => [], getSnapshot: () => ({}), getConfigData: () => null,
    loadConfigData: async () => { throw new Error('等待游戏配置解码器就绪'); } };
  const context = { window: dom.window, document: dom.window.document, game, settings, scope: coreScope };
  const themes = new ThemeRegistry(settings), cardStyles = new CardStyleRegistry(context), backgrounds = new BackgroundRegistry(context);
  const ui = { registerPanel(spec) {
    assert.equal(panels.has(spec.id), false, 'no duplicate live panel IDs');
    const container = dom.window.document.createElement('section'); dom.window.document.body.append(container);
    let cleanup;
    const mount = () => { cleanup = spec.render(container); assert.equal(typeof cleanup, 'function', spec.id + ' must return a panel cleanup'); };
    mount();
    const row = { spec, remount() { cleanup(); cleanup(); container.replaceChildren(); mount(); } }; panels.set(spec.id, row);
    return () => { cleanup(); cleanup(); container.remove(); panels.delete(spec.id); };
  } };
  const manager = new PluginManager({ journal, settings, store: { list: async () => [], put: async row => records.set(row.id, structuredClone(row)) },
    context: { ...context, themes, cardStyles, backgrounds, ui, notify() {} } });
  t.after(() => { manager.dispose(); coreScope.dispose(); dom.window.close(); });
  await manager.init();
  const bundles = new Map();
  async function install(target) {
    if (bundles.has(target)) return;
    const bundle = await bundlePlugin(target); bundles.set(target, bundle);
    for (const dependency of bundle.manifest.dependencies || []) await install(dependency);
    await manager.install(await makePluginPackage(bundle));
  }
  await install(id);
  const bundle = bundles.get(id), count = () => [...panels.values()].filter(row => row.spec.pluginId === id).length;
  const saved = { marker: 'preserve-user-settings', enabled: false };
  settings.namespace(id).set('lifecycle-test-sentinel', saved);
  const panelCount = count();
  const ready = () => {
    const row = manager.list().find(row => row.id === id); assert.equal(row.active, true); assert.equal(row.error, ''); assert.equal(count(), panelCount);
    assert.deepEqual(settings.namespace(id).get('lifecycle-test-sentinel'), saved, 'lifecycle preserves stored user settings');
    assert.deepEqual(manager.list().map(row => row.id).sort(), [...bundles.keys()].sort(), 'only declared prerequisites may be installed');
  };
  ready();
  for (let i = 0; i < 3; i++) for (const row of [...panels.values()]) row.remount();
  for (let i = 0; i < 2; i++) {
    const oldScope = manager.slots.get(id).scope;
    await manager.disable(id); assert.equal(oldScope.closed, true); assert.equal(oldScope.cleanups.length, 0); assert.equal(count(), 0);
    await manager.enable(id); ready();
  }
  await manager.reload(id); ready();
  await manager.install(await makePluginPackage(bundle, '999.0.0-lifecycle')); ready();
  await manager.rollback(id); ready(); assert.equal(manager.list().find(row => row.id === id).version, bundle.manifest.version);
  const lastScope = manager.slots.get(id).scope;
  await manager.uninstall(id); assert.equal(lastScope.cleanups.length, 0); assert.equal(count(), 0); assert.equal(manager.slots.has(id), false);
  assert.equal(records.get(id).uninstalled, true);
  assert.deepEqual(settings.namespace(id).get('lifecycle-test-sentinel'), saved, 'uninstall does not erase user settings');
  assert.equal([...themes.themes.values()].some(row => row.id.startsWith(id + '.')), false);
  assert.equal(cardStyles.list().some(row => row.id.startsWith(id + '.')), false);
  assert.equal(backgrounds.providers.has(id), false);
  assert.equal(databases.size, 0, 'uninstall closes ledger database handles');
});
