import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import themesPlugin, { THEMES } from '../src/plugins/themes/index.js';
import { ThemeRegistry, BLACK_GOLD } from '../src/core/themes.js';
import { Settings } from '../src/core/storage.js';
import { ResourceScope } from '../src/core/resources.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { mountThemeWorkshop } from '../src/ui/theme-workshop.js';
import { createShell } from '../src/ui/shell.js';
import { REPLACED_THEME_PACKAGES } from '../src/core/version.js';
import { readFile } from 'node:fs/promises';
import { verifyPackage } from '../src/core/packages.js';

function setup(t) {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' });
  const settings = new Settings(dom.window.localStorage), messages = [];
  const registry = new ThemeRegistry(settings);
  const mounts = []; t.after(() => { for (const mount of mounts) mount.scope.dispose(); dom.window.close(); });
  function mount() {
    const scope = new ResourceScope(), container = dom.window.document.createElement('div'); dom.window.document.querySelector('main').append(container);
    let unmount;
    const api = {
      register: theme => scope.add(registry.register(theme, 'themes')),
      get current() { return registry.current; },
    };
    Object.assign(api, {
      list: () => registry.list(), select: id => registry.select(id),
      subscribe: fn => scope.add(registry.subscribe(fn)),
    });
    themesPlugin.activate({ scope, themes: api, ui: { registerPanel() { assert.fail('theme packs must not register panels'); } } });
    unmount = scope.add(mountThemeWorkshop(container, { document: dom.window.document, themes: api, notify: text => messages.push(text) }));
    const result = { scope, container, unmount, api }; mounts.push(result); return result;
  }
  return { dom, settings, registry, messages, mount };
}

test('themes: install keeps the current choice; switching, fallback and reactivation preserve preference', t => {
  const h = setup(t), first = h.mount();
  assert.equal(h.registry.list().length, THEMES.length + 1);
  assert.equal(h.registry.current.id, BLACK_GOLD.id);
  assert.equal(h.settings.get('theme'), undefined, 'installing must not rewrite the default preference');
  first.container.querySelector('[data-theme-id="themes.jade"]').click();
  assert.equal(h.registry.current.id, 'themes.jade');
  assert.equal(h.settings.get('theme'), 'themes.jade');
  assert.equal(first.container.querySelectorAll('[aria-pressed=true]').length, 1);
  assert.equal(first.container.querySelector('[data-theme-status]').textContent, '当前 · 青瓷');
  h.registry.select('themes.violet');
  assert.equal(first.container.querySelector('[data-theme-id="themes.violet"]').getAttribute('aria-pressed'), 'true');
  first.scope.dispose();
  assert.equal(h.registry.current.id, BLACK_GOLD.id);
  assert.equal(h.settings.get('theme'), 'themes.violet');
  assert.equal(h.registry.listeners.size, 0);
  const second = h.mount();
  assert.equal(h.registry.current.id, 'themes.violet');
  assert.equal(second.container.querySelector('[data-theme-id="themes.violet"]').getAttribute('aria-pressed'), 'true');
  second.container.querySelector('[data-theme-id="core.black-gold"]').click();
  second.scope.dispose();
  h.mount(); assert.equal(h.registry.current.id, BLACK_GOLD.id, 'explicit user choice supersedes the saved plugin theme');
});

test('themes: closing a panel releases its subscription and detached controls without unregistering palettes', t => {
  const h = setup(t), mounted = h.mount(), card = mounted.container.querySelector('[data-theme-id="themes.blue"]');
  assert.equal(h.registry.listeners.size, 1);
  mounted.unmount();
  assert.equal(h.registry.listeners.size, 0);
  assert.equal(mounted.container.querySelector('.sgs-themes'), null);
  assert.equal(h.registry.list().length, THEMES.length + 1);
  card.click(); assert.equal(h.registry.current.id, BLACK_GOLD.id);
  assert.equal(mounted.scope.cleanups.length, THEMES.length, 'only theme registrations remain');
});

test('themes: core workshop works without a theme pack and discovers third party registrations live', t => {
  const h = setup(t), container = h.dom.window.document.querySelector('main');
  const unmount = mountThemeWorkshop(container, { document: h.dom.window.document, themes: h.registry, notify: () => {} });
  assert.equal(container.querySelectorAll('[data-theme-id]').length, 1);
  assert.equal(container.querySelector('.theme-count').textContent, '1 套配色');
  const unregister = h.registry.register({ id: 'author.custom', name: '作者主题', tokens: { accent: '#abcdef' } }, 'author');
  assert.equal(container.querySelector('.theme-count').textContent, '2 套配色');
  const card = container.querySelector('[data-theme-id="author.custom"]');
  assert.equal(card.querySelector('.theme-preview').style.getPropertyValue('--preview-bg'), BLACK_GOLD.tokens.bg);
  card.click(); assert.equal(h.registry.current.id, 'author.custom');
  assert.equal(container.querySelector('[data-theme-status]').textContent, '当前 · 作者主题');
  unregister();
  assert.equal(container.querySelectorAll('[data-theme-id]').length, 1);
  assert.equal(h.registry.current.id, BLACK_GOLD.id);
  assert.equal(h.settings.get('theme'), 'author.custom');
  card.click(); assert.equal(h.registry.current.id, BLACK_GOLD.id, 'removed cards cannot select a theme');
  unmount(); unmount(); assert.equal(h.registry.listeners.size, 0);
});

test('themes: palette previews stay independent from selection and selection errors remain visible', t => {
  const h = setup(t), mounted = h.mount(), preview = mounted.container.querySelector('[data-theme-id="themes.blue"] .theme-preview');
  assert.equal(preview.style.getPropertyValue('--preview-bg'), THEMES[1].tokens.bg);
  mounted.container.querySelector('[data-theme-id="themes.jade"]').click();
  assert.equal(preview.style.getPropertyValue('--preview-bg'), THEMES[1].tokens.bg);
  mounted.api.select = () => { throw new Error('演练写入失败'); };
  mounted.container.querySelector('[data-theme-id="themes.blue"]').click();
  assert.deepEqual(h.messages, ['主题切换失败：演练写入失败']);
  assert.equal(h.registry.current.id, 'themes.jade');
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
test('themes: text, secondary text, accents and errors retain readable contrast across all three surfaces', () => {
  for (const theme of THEMES) for (const text of ['text', 'muted', 'accent', 'danger']) for (const background of ['bg', 'surface', 'raised']) {
    const values = [luminance(theme.tokens[text]), luminance(theme.tokens[background])].sort((a, b) => b - a);
    const contrast = (values[0] + .05) / (values[1] + .05);
    assert.ok(contrast >= 4.5, `${theme.name} ${text}/${background}: ${contrast.toFixed(2)}`);
  }
});

test('themes: release bundle is self-contained and verifiable', async () => {
  const bundle = await bundlePlugin('themes'), pkg = await makePluginPackage(bundle);
  assert.ok(bundle.inputs.every(path => !path.startsWith('src/plugins/') || path.startsWith('src/plugins/themes/')));
  assert.doesNotMatch(pkg.code, /sgs\.ol\.toolbox\.core|Uc1cryZVg|VIiR0YfvE4s/);
  await verifyPackage(pkg);
});

test('themes: real manager exposes current/list/select/subscribe and rejects unknown or disposed selections', async t => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' });
  const settings = new Settings(dom.window.localStorage), registry = new ThemeRegistry(settings);
  const records = new Map(), contexts = [], notifications = [], panels = new Map();
  const manager = new PluginManager({ journal: new SessionJournal(), settings,
    store: { async list() { return [...records.values()]; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: { window: dom.window, document: dom.window.document, themes: registry,
      notify: message => notifications.push(message), ui: { registerPanel(spec) {
        assert.equal(panels.has(spec.id), false, 'reload must remove the previous panel');
        const container = dom.window.document.createElement('section'); dom.window.document.querySelector('main').append(container);
        const cleanup = spec.render(container); panels.set(spec.id, container);
        return () => { cleanup?.(); panels.delete(spec.id); container.remove(); };
      } },
    },
  });
  t.after(() => { manager.dispose(); dom.window.close(); });
  manager.registerBuiltin({ ...themesPlugin, activate(ctx) { contexts.push(ctx); return themesPlugin.activate(ctx); } });
  await manager.init();
  const first = contexts[0], observed = [];
  assert.deepEqual(first.themes.list().map(theme => theme.id), [BLACK_GOLD.id, ...THEMES.map(theme => theme.id)]);
  assert.equal(first.themes.current, registry.current);
  assert.equal(registry.listeners.size, 0, 'a theme pack has no UI subscriptions');
  first.themes.subscribe(current => observed.push(current));
  assert.equal(registry.listeners.size, 1);
  assert.throws(() => first.themes.select('themes.missing'), /尚未启用|已被卸载/);
  assert.equal(settings.get('theme'), undefined, 'invalid selection must not overwrite persistence');
  assert.equal(registry.current.id, BLACK_GOLD.id);
  assert.equal(observed.length, 0);
  first.themes.select('themes.jade');
  assert.equal(first.themes.current.id, 'themes.jade');
  assert.equal(observed.at(-1), registry.current, 'observer receives the current snapshot');
  assert.equal(panels.size, 0);
  assert.deepEqual(themesPlugin.manifest.categories, []);
  const staleSelect = first.themes.select;
  await manager.disable('themes');
  assert.equal(first.scope.closed, true);
  assert.equal(registry.current.id, BLACK_GOLD.id);
  assert.equal(settings.get('theme'), 'themes.jade');
  assert.equal(registry.listeners.size, 0, 'both panel and plugin observers are scope-owned');
  assert.equal(panels.size, 0);
  assert.equal(registry.list().length, 1);
  assert.throws(() => registry.select('themes.jade'), /尚未启用|已被卸载/);
  assert.equal(settings.get('theme'), 'themes.jade', 'unavailable palette preserves its saved preference');
  registry.select(BLACK_GOLD.id);
  await manager.enable('themes');
  const second = contexts[1];
  assert.equal(second.themes.current.id, BLACK_GOLD.id, 'new user choice while disabled wins over old palette');
  second.themes.select('themes.blue');
  const deliveredBefore = observed.length;
  staleSelect('themes.jade');
  assert.equal(registry.current.id, 'themes.blue', 'disposed callback cannot replace the new active choice');
  assert.equal(settings.get('theme'), 'themes.blue');
  assert.equal(observed.length, deliveredBefore, 'disposed observer cannot receive new notifications');
  let staleNotifications = 0;
  first.themes.subscribe(() => { staleNotifications++; });
  assert.equal(registry.listeners.size, 0, 'late subscription on a disposed scope is immediately removed');
  second.themes.select('themes.silver');
  assert.equal(staleNotifications, 0);
  await manager.reload('themes');
  assert.equal(panels.size, 0);
  assert.equal(registry.listeners.size, 0, 'reload keeps theme pack free of UI resources');
  assert.equal(registry.current.id, 'themes.silver');
  await manager.uninstall('themes');
  assert.equal(panels.size, 0);
  assert.equal(registry.listeners.size, 0);
  assert.equal(registry.list().length, 1);
  assert.deepEqual(notifications, []);
});


test('themes: settings owns the workshop independently of plugins and cleans it up with manage panels present', async t => {
  const h = setup(t), scope = new ResourceScope(); t.after(() => scope.dispose());
  const shell = createShell({ window: h.dom.window, document: h.dom.window.document, settings: h.settings, scope });
  shell.setHandlers({ themes: h.registry, manager: { list: () => [] }, market: () => ({}) });
  shell.registerPanel({ id: 'other:manage', pluginId: 'other', pluginName: '维护', category: 'manage', render() { return () => {}; } });
  const tab = id => shell.shadow.querySelector(`[data-category=${id}]`).click();
  const settings = () => [...shell.shadow.querySelectorAll('.tabs button')].find(n => n.textContent === '外观').click();
  tab('manage'); settings();
  assert.ok(shell.shadow.querySelector('[data-theme-workshop]'));
  assert.equal(shell.shadow.querySelectorAll('[data-theme-id]').length, 1);
  assert.equal(h.registry.listeners.size, 1);
  for (let i = 0; i < 3; i++) {
    shell.render(); assert.equal(h.registry.listeners.size, 1);
    tab('tools'); assert.equal(h.registry.listeners.size, 0);
    assert.equal(shell.shadow.querySelector('[data-theme-workshop]'), null);
    tab('manage'); assert.equal(h.registry.listeners.size, 1);
  }
  scope.dispose(); assert.equal(h.registry.listeners.size, 0);
});

test('themes: verified former workshop package migrates once with selection, disable and rollback preserved', async t => {
  const pkg = JSON.parse(await readFile(new URL('./fixtures/themes-0.1.1.json', import.meta.url), 'utf8'));
  await verifyPackage(pkg); assert.ok(REPLACED_THEME_PACKAGES.includes(pkg.sha256));
  const h = setup(t), records = new Map(); h.settings.set('theme', 'themes.blue');
  const module = { ...themesPlugin, replacesPackageDigests: REPLACED_THEME_PACKAGES };
  const create = () => { const manager = new PluginManager({ journal: new SessionJournal(), settings: h.settings,
    store: { async list() { return [...records.values()]; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: { document: h.dom.window.document, window: h.dom.window, themes: h.registry, ui: { registerPanel() { return () => {}; } }, notify() {} },
  }); manager.registerBuiltin(module); return manager; };
  records.set('themes', { id: 'themes', active: pkg, previous: null, enabled: false, uninstalled: false });
  let manager = create(); t.after(() => manager.dispose()); await manager.init();
  assert.equal(manager.list()[0].version, themesPlugin.manifest.version);
  assert.equal(manager.list()[0].enabled, false); assert.equal(h.registry.list().length, 1);
  assert.equal(h.settings.get('theme'), 'themes.blue');
  await manager.enable('themes'); assert.equal(h.registry.current.id, 'themes.blue');
  await manager.rollback('themes'); assert.equal(manager.list()[0].version, '0.1.1');
  manager.dispose(); manager = create(); await manager.init();
  assert.equal(manager.list()[0].version, '0.1.1', 'explicit rollback must not be migrated again');
});


test('themes: light schemes are explicit, validated and reset when switching to a dark palette', t => {
  const h = setup(t), mounted = h.mount();
  const light = THEMES.filter(theme => theme.tokens.scheme === 'light');
  assert.equal(light.length, 3);
  for (const theme of light) {
    mounted.api.select(theme.id); assert.equal(h.registry.current.tokens.scheme, 'light');
  }
  mounted.api.select('themes.blue'); assert.equal(h.registry.current.tokens.scheme, 'dark');
  const off = h.registry.register({ id: 'test.invalid', name: '无效色系', tokens: { scheme: 'dark light' } }, 'test');
  h.registry.select('test.invalid'); assert.equal(h.registry.current.tokens.scheme, 'dark'); off();
});
