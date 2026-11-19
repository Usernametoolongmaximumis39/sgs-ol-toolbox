import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validateManifest, packageDigest, PACKAGE_FORMAT } from '../src/core/packages.js';
import { DEFAULT_PLUGIN_PRIORITY, normalizePanel, comparePluginOrder, comparePanelOrder } from '../src/core/plugin-contract.js';
import { createIcon, isIconSpec } from '../src/ui/icons.js';
import { CORE_VERSION } from '../src/core/version.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { Settings } from '../src/core/storage.js';
import { ResourceScope } from '../src/core/resources.js';
import { ThemeRegistry } from '../src/core/themes.js';
import { createShell } from '../src/ui/shell.js';

const manifest = (changes = {}) => ({ id: 'contract.sample', name: '约定演练', version: '1.0.0', apiVersion: 1,
  contractVersion: 1, categories: ['tools'], description: '用于验证开发约定的本地演练插件', icon: 'tools',
  priority: 32768, minCoreVersion: CORE_VERSION, ...changes });
const legacy = changes => ({ id: 'legacy.example', name: '旧插件', version: '1.0.0', apiVersion: 1, categories: ['tools'], ...changes });
const panel = changes => ({ id: 'main', title: '约定演练', render() {}, ...changes });

test('release notes validate optional legacy data and bounded multiline text', () => {
  for (const releaseNotes of [undefined, '修复重复请求。\n保留原有默认值。', 'a'.repeat(2000)]) {
    assert.doesNotThrow(() => validateManifest(manifest({ releaseNotes })));
    assert.doesNotThrow(() => validateManifest(legacy({ releaseNotes })));
  }
  for (const releaseNotes of ['', ' \n ', null, [], 42, 'a'.repeat(2001), 'bad\u0000text']) {
    assert.throws(() => validateManifest(manifest({ releaseNotes })), /更新内容/);
    assert.throws(() => validateManifest(legacy({ releaseNotes })), /更新内容/);
  }
});

test('plugin contract: priority endpoints are valid; invalid present values cannot silently become defaults', () => {
  for (const priority of [0, 1, 32768, 65535]) assert.doesNotThrow(() => validateManifest(manifest({ priority }), { requireContract: true }));
  for (const priority of [-1, 65536, 1.5, '1', null, NaN, Infinity]) {
    assert.throws(() => validateManifest(manifest({ priority })));
    assert.throws(() => validateManifest(legacy({ priority })));
  }
  assert.equal(DEFAULT_PLUGIN_PRIORITY, 32768);
});

test('plugin contract: old packages keep working; strict source builds require complete modern presentation', () => {
  assert.doesNotThrow(() => validateManifest(legacy()));
  assert.throws(() => validateManifest(legacy(), { requireContract: true }));
  for (const key of ['icon', 'priority', 'description', 'minCoreVersion']) {
    const value = manifest(); delete value[key]; assert.throws(() => validateManifest(value), `${key} required for contractVersion 1`);
  }
  assert.throws(() => validateManifest(manifest({ contractVersion: 2 })));
  assert.throws(() => validateManifest(manifest({ name: 'n'.repeat(49) })));
  for (const description of ['', ' ', 'a\nb', 'a'.repeat(161), 8]) assert.throws(() => validateManifest(manifest({ description })));
  assert.throws(() => validateManifest(manifest({ minCoreVersion: '999.0.0' })));
  for (const minCoreVersion of ['0.5', '0.5.0-beta', '00.5.0', '', 500]) assert.throws(() => validateManifest(manifest({ minCoreVersion })));
  assert.throws(() => validateManifest(manifest({ minCoreVersion: '0.1.0' })), 'contract v1 cannot claim compatibility with pre-contract cores');
  assert.doesNotThrow(() => validateManifest(legacy({ minCoreVersion: '0.1.0' })));
  assert.throws(() => validateManifest(manifest({ categories: ['tools', 'tools'] })));
  assert.throws(() => validateManifest(manifest({ categories: ['other'] })));
  for (const changes of [{ icon: 'unknown-name' }, { minCoreVersion: '999.0.0' }, { description: 'a\nb' }, { categories: ['tools', 'tools'] }]) assert.throws(() => validateManifest(legacy(changes)), 'old packages may omit fields, but present invalid fields are rejected');
  assert.doesNotThrow(() => validateManifest(manifest({ categories: [] })));
});

test('plugin contract: safe custom paths and shared icons have no executable or external SVG content', () => {
  const custom = { paths: ['M3 12 12 3 21 12 12 21Z', 'M8 12h8'] };
  for (const name of ['cards', 'gift', 'effects', 'skins', 'palette', 'map', 'tools', 'settings', 'info', 'package']) assert.equal(isIconSpec(name), true);
  assert.equal(isIconSpec(custom), true); assert.doesNotThrow(() => validateManifest(manifest({ icon: custom })));
  for (const icon of ['<svg onload="alert(1)">', 'https://example.test/icon.svg', 'unknown-name', { paths: [] },
    { paths: Array(9).fill('M0 0h1') }, { paths: ['M0 0" onload="alert(1)'] }, { paths: ['url(https://example.test/)'] },
    { paths: ['M0 0h1'], fill: 'red' }, { paths: ['M0 0h1'], onload: 'alert(1)' }, { paths: ['M0 0h1'], href: 'https://example.test' }]) {
    assert.equal(isIconSpec(icon), false); assert.throws(() => validateManifest(manifest({ icon })));
  }
  const dom = new JSDOM('<body></body>');
  try {
    const svg = createIcon(dom.window.document, custom);
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg'); assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    assert.deepEqual([...svg.querySelectorAll('path')].map(node => node.getAttribute('d')), custom.paths);
    assert.equal(svg.querySelector('script,foreignObject,image,use'), null);
    assert.equal([...svg.querySelectorAll('*')].flatMap(node => [...node.attributes]).some(a => /^on|href/i.test(a.name)), false);
  } finally { dom.window.close(); }
});

test('plugin contract: panel placement is declared, priorities are independent, and ownership cannot be spoofed', () => {
  const m = manifest({ priority: 123, icon: 'palette' });
  const n = normalizePanel(panel({ priority: 0, pluginId: 'spoof', pluginName: '伪造', pluginIcon: 'gift', pluginPriority: 1 }), m);
  assert.equal(n.id, 'contract.sample:main'); assert.equal(n.category, 'tools');
  assert.equal(n.priority, 0); assert.equal(n.pluginPriority, 123); assert.equal(n.pluginId, m.id);
  assert.equal(n.pluginName, m.name); assert.equal(n.pluginIcon, m.icon);
  const old = normalizePanel(panel(), legacy()); assert.equal(old.pluginPriority, 32768); assert.equal(old.priority, 32768); assert.equal(old.pluginIcon, 'package');
  assert.throws(() => normalizePanel(panel({ category: 'manage' }), m));
  assert.throws(() => normalizePanel(panel(), manifest({ categories: ['tools', 'info'] })));
  assert.throws(() => normalizePanel(panel(), manifest({ categories: [] })));
  assert.throws(() => normalizePanel(panel({ id: '../other' }), m));
  assert.throws(() => normalizePanel(panel({ render: undefined }), m));
  for (const priority of [-1, 65536, 3.5, '0']) assert.throws(() => normalizePanel(panel({ priority }), m));
  assert.throws(() => normalizePanel(panel({ gameView: 'battle' }), m));
  const game = manifest({ categories: ['game'] });
  assert.equal(normalizePanel(panel({ gameView: 'shanhe' }), game).gameView, 'shanhe');
  assert.throws(() => normalizePanel(panel({ gameView: 'other' }), game));
  assert.throws(() => normalizePanel(panel({ groupWith: 'base' }), game), /前置插件组/);
  assert.equal(normalizePanel(panel({ groupWith: 'base' }), { ...game, dependencies: ['base'] }).groupWith, 'base');
  assert.throws(() => normalizePanel(panel({ groupTab: true }), game), /前置插件组/);
  assert.throws(() => normalizePanel(panel({ groupTabs: true }), { ...game, minCoreVersion: '0.6.120' }), /minCoreVersion/);
  assert.throws(() => normalizePanel(panel({ groupWith: 'base', groupTabs: true }), { ...game, dependencies: ['base'] }), /承载组内页签/);
});

test('plugin contract: stable ordering uses numeric priority, ASCII identity, then local panel priority', () => {
  const items = [legacy(), manifest({ id: 'same.z', priority: 100 }), manifest({ id: 'last', priority: 65535 }),
    manifest({ id: 'same.a', priority: 100 }), manifest({ id: 'first', priority: 0 })];
  const expected = ['first', 'same.a', 'same.z', 'legacy.example', 'last'];
  assert.deepEqual([...items].sort(comparePluginOrder).map(i => i.id), expected);
  assert.deepEqual([...items].reverse().sort(comparePluginOrder).map(i => i.id), expected);
  const a = manifest({ id: 'a', priority: 0 }), z = manifest({ id: 'z', priority: 1 });
  const panels = [normalizePanel(panel({ id: 'z', priority: 1 }), a), normalizePanel(panel({ id: 'other', priority: 0 }), z),
    normalizePanel(panel({ id: 'a', priority: 1 }), a), normalizePanel(panel({ id: 'top', priority: 0 }), a)];
  assert.deepEqual(panels.sort(comparePanelOrder).map(i => i.id), ['a:top', 'a:a', 'a:z', 'z:other']);
});

function harness(t) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test' });
  const scope = new ResourceScope(), settings = new Settings(dom.window.localStorage), themes = new ThemeRegistry(settings), records = new Map();
  settings.set('category', 'tools');
  const shell = createShell({ window: dom.window, document: dom.window.document, settings, scope });
  const manager = new PluginManager({ journal: new SessionJournal(), settings,
    store: { async list() { return [...records.values()]; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: { window: dom.window, document: dom.window.document, themes, ui: shell, notify() {} }, onChange: () => shell.render() });
  shell.setHandlers({ manager, themes, market: () => ({ baseUrl: 'http://127.0.0.1:17321' }), compat: {} });
  t.after(() => { manager.dispose(); scope.dispose(); dom.window.close(); });
  return { dom, scope, settings, themes, records, shell, manager };
}
const groupOrder = shell => [...shell.shadow.querySelectorAll('[data-plugin-group]')].map(node => node.dataset.pluginGroup);
const moduleFor = (m, specs = [panel()]) => ({ manifest: m, activate(ctx) {
  for (const spec of specs) ctx.ui.registerPanel({ ...spec, render(node) {
    node.dataset.contractPanel = spec.id; node.append(ctx.ui.icon(m.icon || 'package'), ctx.document.createTextNode(spec.id));
  } });
} });

test('plugin contract: grouped tabs mount once in their host, clean up and fall back in a legacy host', t => {
  const { dom, shell } = harness(t);
  const parent = manifest({ id: 'tab-host' }), child = manifest({ id: 'tab-extension', dependencies: [parent.id] });
  let tab, outlet, loads = 0, cleanups = 0;
  const removeChild = shell.registerPanel(normalizePanel(panel({ groupWith: parent.id, groupTab: true, render(node) {
    loads++;
    node.textContent = '扩展内容';
    return () => { cleanups++; };
  } }), child));
  const removeHost = shell.registerPanel(normalizePanel(panel({ groupTabs: true, render(container, options) {
    [tab] = options.groupTabs;
    outlet = container.appendChild(dom.window.document.createElement('div'));
  } }), parent));
  assert.equal(loads, 0);
  assert.throws(() => tab.mount(shell.shadow.querySelector('.content')), /内容容器/);
  assert.equal(tab.mount(outlet), tab.mount(outlet));
  assert.equal(outlet.textContent, '扩展内容');
  assert.equal(loads, 1);
  removeHost();
  assert.equal(cleanups, 1);
  assert.throws(() => tab.mount(outlet), /内容容器/);
  shell.registerPanel(normalizePanel(panel(), parent));
  assert.equal(shell.shadow.querySelector('[data-plugin-group=tab-host] [data-panel-id="tab-extension:main"]').textContent, '扩展内容');
  assert.equal(loads, 2);
  removeChild();
  assert.equal(cleanups, 2);
});

test('plugin contract: real manager and shell keep order and collapse through reload; manage/info panels render', async t => {
  const h = harness(t);
  h.manager.registerBuiltin(moduleFor(manifest({ id: 'late', priority: 65535 })));
  h.manager.registerBuiltin(moduleFor(manifest({ id: 'first', priority: 0 }), [panel({ id: 'second', priority: 20 }), panel({ id: 'first', priority: 0 })]));
  h.manager.registerBuiltin(moduleFor(manifest({ id: 'placement', categories: ['manage', 'info'] }), [panel({ category: 'manage' }), panel({ id: 'help', category: 'info' })]));
  h.manager.registerBuiltin(moduleFor(legacy()));
  await h.manager.init();
  assert.deepEqual(groupOrder(h.shell), ['first', 'legacy.example', 'late']);
  assert.deepEqual([...h.shell.shadow.querySelectorAll('[data-plugin-group=first] [data-contract-panel]')].map(n => n.dataset.contractPanel), ['first', 'second']);
  h.shell.shadow.querySelector('[data-plugin-group=first] .plugin-toggle').click();
  await h.manager.reload('first'); assert.deepEqual(groupOrder(h.shell), ['first', 'legacy.example', 'late']);
  assert.equal(h.shell.shadow.querySelector('[data-plugin-group=first] .plugin-body').hidden, true);
  h.shell.shadow.querySelector('[data-category=manage]').click();
  assert.ok(h.shell.shadow.querySelector('.tabs')); assert.deepEqual(groupOrder(h.shell), ['placement']);
  assert.ok(h.shell.shadow.querySelector('[data-contract-panel=main]'));
  h.shell.shadow.querySelector('[data-category=info]').click(); assert.deepEqual(groupOrder(h.shell), ['placement']);
  assert.ok(h.shell.shadow.querySelector('[data-contract-panel=help]'));
});

test('plugin contract: invalid package metadata cannot replace a running installation', async t => {
  const h = harness(t), m = manifest({ id: 'installed' });
  h.manager.registerBuiltin(moduleFor(m)); await h.manager.init(); const old = h.manager.slots.get(m.id);
  const broken = { ...m, version: '1.0.1', priority: 65536 }, code = 'throw new Error("This code must not execute");';
  const pkg = { format: PACKAGE_FORMAT, manifest: broken, code, sha256: await packageDigest(broken, code) };
  await assert.rejects(h.manager.install(pkg));
  assert.equal(h.manager.slots.get(m.id), old); assert.equal(h.manager.list()[0].version, '1.0.0');
  assert.equal(h.manager.list()[0].active, true); assert.deepEqual(groupOrder(h.shell), [m.id]);
});

test('plugin contract: an undeclared panel category rolls back installation without losing the active plugin', async t => {
  const h = harness(t), m = manifest({ id: 'installed' });
  h.manager.registerBuiltin(moduleFor(m)); await h.manager.init();
  const replacement = { ...m, version: '1.0.1' };
  const code = `return {manifest:${JSON.stringify(replacement)}, activate(ctx) {ctx.ui.registerPanel({id:'wrong',category:'manage',render(node){node.textContent='unexpected';}})}};`;
  const pkg = { format: PACKAGE_FORMAT, manifest: replacement, code, sha256: await packageDigest(replacement, code) };
  await assert.rejects(h.manager.install(pkg));
  assert.equal(h.manager.list()[0].version, '1.0.0'); assert.equal(h.manager.list()[0].active, true);
  assert.deepEqual(groupOrder(h.shell), [m.id]); assert.equal(h.records.size, 0, 'failed installation never persists a replacement');
  h.shell.shadow.querySelector('[data-category=manage]').click(); assert.deepEqual(groupOrder(h.shell), []);
});

test('plugin contract: a throwing panel cleanup cannot retain later plugin resources or the core host', t => {
  const h = harness(t), activeListeners = new Set(), released = new Map();
  let events = 0;
  h.shell.shadow.querySelector('[data-category=info]').click();
  for (const [id, throws] of [['first', true], ['second', false]]) {
    h.shell.registerPanel(normalizePanel(panel({ render() {
      const listener = () => { events++; };
      activeListeners.add(listener); h.dom.window.addEventListener('contract-resource', listener);
      return () => {
        released.set(listener, (released.get(listener) || 0) + 1);
        activeListeners.delete(listener); h.dom.window.removeEventListener('contract-resource', listener);
        if (throws) throw new Error('broken plugin cleanup');
      };
    } }), manifest({ id })));
  }
  h.shell.shadow.querySelector('[data-category=tools]').click();
  assert.equal(activeListeners.size, 2);
  h.dom.window.dispatchEvent(new h.dom.window.Event('contract-resource')); assert.equal(events, 2);
  h.shell.shadow.querySelector('[data-category=info]').click();
  assert.equal(activeListeners.size, 0, 'category changes release both plugins even when the first cleanup throws');
  h.dom.window.dispatchEvent(new h.dom.window.Event('contract-resource')); assert.equal(events, 2);
  h.shell.shadow.querySelector('[data-category=tools]').click();
  assert.equal(activeListeners.size, 2);
  assert.equal(h.shell.host.isConnected, true);
  h.scope.dispose(); h.scope.dispose();
  assert.equal(activeListeners.size, 0, 'core shutdown releases all panel listeners');
  h.dom.window.dispatchEvent(new h.dom.window.Event('contract-resource')); assert.equal(events, 2);
  assert.equal(h.shell.host.isConnected, false, 'core shutdown always removes the host');
  assert.equal(released.size, 4);
  assert.ok([...released.values()].every(count => count === 1), 'each mounted panel is cleaned up exactly once');
});
