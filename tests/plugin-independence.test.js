import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { verifyPackage } from '../src/core/packages.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { Settings } from '../src/core/storage.js';
import { ThemeRegistry } from '../src/core/themes.js';

test('Shanhe uses its own scoring and endings without an add-on package', async () => {
  const bundle = await bundlePlugin('shanhetu');
  assert.ok(bundle.inputs.includes('src/shared/shanhe-attributes.js'));
  assert.ok(bundle.inputs.includes('src/plugins/shanhetu/extra/score.js'));
  assert.ok(!bundle.manifest.dependencies?.length);
});

for (const id of ['play-assist', 'daily-rewards', 'effects', 'skins', 'ledger', 'shanhetu', 'seckill', 'recharge']) test(`${id} package installs and renders alone without cards or other plugins`, async t => {
  const bundle = await bundlePlugin(id), pkg = await makePluginPackage(bundle);
  assert.ok(bundle.inputs.every(path => !path.startsWith('src/plugins/') || path.startsWith(`src/plugins/${id}/`)));
  assert.doesNotMatch(pkg.code, /Uc1cryZVg|VIiR0YfvE4s|sgs\.ol\.toolbox\.core/);
  await verifyPackage(pkg);
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' }); t.after(() => dom.window.close());
  const panels = new Map(), cleanups = new Map(), records = new Map();
  const settings = new Settings(dom.window.localStorage);
  const manager = new PluginManager({ journal: new SessionJournal(), settings,
    store: { async list() { return []; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: { window: dom.window, document: dom.window.document, game: {
      getScene: () => null, getClass: () => null, getSelf: () => null, getSeatUIs: () => [], getServerProxy: () => null,
      getConfigData: () => null, loadConfigData: async () => { throw new Error('No native configuration available in this fixture'); },
    }, themes: new ThemeRegistry(settings), notify() {}, ui: { registerPanel(panel) {
      panels.set(panel.id, panel); const container = dom.window.document.createElement('section'); dom.window.document.body.append(container);
      const cleanup = panel.render(container); cleanups.set(panel.id, cleanup);
      return () => { cleanup?.(); cleanups.delete(panel.id); panels.delete(panel.id); container.remove(); };
    } } },
  }); t.after(() => manager.dispose());
  await manager.init(); await manager.install(pkg);
  assert.deepEqual(manager.list().map(row => row.id), [id]); assert.equal(manager.list()[0].active, true);
  const panelCount = 1;
  assert.equal(panels.size, panelCount);
  const content = { ledger: '.sgs-ledger button', recharge: '[data-sgs-recharge] button', skins: '[data-sgs-skin-settings] label' };
  if (panelCount) assert.ok(dom.window.document.querySelector(content[id] || 'h3')?.textContent);
  const activeScope = manager.slots.get(id).scope;
  await manager.disable(id); assert.equal(activeScope.closed, true); assert.equal(panels.size, 0);
  await manager.enable(id); assert.equal(panels.size, panelCount);
  await manager.reload(id); assert.equal(panels.size, panelCount);
  await manager.uninstall(id); assert.equal(panels.size, 0); assert.deepEqual(manager.list(), []);
});
