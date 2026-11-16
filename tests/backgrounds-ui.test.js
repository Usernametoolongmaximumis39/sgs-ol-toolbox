import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { BackgroundRegistry } from '../src/core/backgrounds.js';
import { ResourceScope } from '../src/core/resources.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { Settings } from '../src/core/storage.js';

test('background package requires enabled skins and preserves static preference through its lifecycle without accumulating UI', async t => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' });
  const scope = new ResourceScope(), settings = new Settings(dom.window.localStorage), records = new Map();
  const game = { getScene: () => null, isInGame: () => false };
  const backgrounds = new BackgroundRegistry({ window: dom.window, game, settings, scope });
  const manager = new PluginManager({ journal: new SessionJournal(), settings,
    store: { async list() { return []; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: { window: dom.window, document: dom.window.document, game, backgrounds, themes: {}, notify() {},
      ui: { registerPanel(panel) {
        const host = dom.window.document.createElement('section'); dom.window.document.body.append(host);
        const cleanup = panel.render(host); return () => { cleanup(); host.remove(); };
      } },
    },
  });
  t.after(() => { manager.dispose(); scope.dispose(); dom.window.close(); });
  const bundle = await bundlePlugin('backgrounds'), pkg = await makePluginPackage(bundle);
  await manager.init();
  assert.deepEqual(pkg.manifest.dependencies, ['skins']);
  await assert.rejects(manager.install(pkg), /skins.*未安装/);
  assert.equal(manager.list().length, 0); assert.equal(records.size, 0);
  assert.equal(backgrounds.providers.size, 0);
  const skinsBundle = await bundlePlugin('skins'), skins = await makePluginPackage(skinsBundle);
  await manager.install(skins); await manager.disable('skins');
  await assert.rejects(manager.install(pkg), /皮肤收集.*已停用/);
  assert.equal(manager.slots.get('skins').record.enabled, false);
  assert.equal(manager.slots.has('backgrounds'), false);
  await manager.enable('skins'); await manager.install(pkg);
  await manager.install(await makePluginPackage(skinsBundle, '0.4.8-test.1'));
  for (const operation of ['disable', 'uninstall', 'reload', 'rollback']) {
    await assert.rejects(manager[operation]('skins'), /请先停用.*自定义背景/);
  }
  const mode = name => [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === name);
  assert.equal(mode('动态').getAttribute('aria-pressed'), 'true');
  mode('静态').click();
  const check = () => {
    assert.equal(manager.slots.get('backgrounds').active, true);
    assert.equal(manager.slots.get('skins').active, true);
    assert.equal(mode('静态').getAttribute('aria-pressed'), 'true');
    assert.equal(backgrounds.providers.size, 1); assert.equal(backgrounds.listeners.size, 1);
    assert.equal(dom.window.document.querySelectorAll('.bg-skin-action').length, 1);
  };
  check();
  for (let i = 0; i < 3; i++) { await manager.reload('backgrounds'); check(); }
  await manager.install(await makePluginPackage(bundle, '0.2.2-test.1')); check();
  await manager.rollback('backgrounds'); check();
  await manager.disable('backgrounds');
  assert.equal(backgrounds.providers.size, 0); assert.equal(backgrounds.listeners.size, 0);
  assert.equal(dom.window.document.querySelectorAll('[data-sgs-backgrounds]').length, 0);
  await manager.disable('skins');
  await assert.rejects(manager.enable('backgrounds'), /皮肤收集.*已停用/);
  assert.equal(backgrounds.providers.size, 0);
  assert.equal(manager.slots.get('skins').record.enabled, false);
  await manager.enable('skins');
  await manager.enable('backgrounds'); check();
  await manager.uninstall('backgrounds'); assert.equal(backgrounds.providers.size, 0);
  await manager.install(pkg); check();
});
