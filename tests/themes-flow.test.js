import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import plugin, { manifest } from '../src/plugins/themes-flow/index.js';
import { FLOW_THEMES } from '../src/plugins/themes-flow/palettes.js';
import { BLACK_GOLD, OPTIONAL_THEME_TOKENS, ThemeRegistry, isSafeGradient } from '../src/core/themes.js';
import { Settings } from '../src/core/storage.js';
import { ResourceScope } from '../src/core/resources.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { createShell } from '../src/ui/shell.js';
import { createNativeTheme, resolveNativePalette } from '../src/ui/native-theme.js';
import { legacyMicroCSS } from '../src/core/micro-compatibility.js';

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

test('themes-flow: gradient validator accepts safe multi-layer gradients and rejects unsafe CSS', () => {
  for (const theme of FLOW_THEMES) {
    assert.ok(theme.id.startsWith(`${manifest.id}.`), `${theme.id} prefix`);
    for (const key of ['backdrop', 'card', 'compact']) {
      assert.equal(isSafeGradient(theme.tokens[key]), true, `${theme.name}.${key} must pass safe gradient validation`);
    }
  }
  assert.equal(isSafeGradient('none'), true);
  assert.equal(isSafeGradient('conic-gradient(from 45deg, #112233, #223344)'), true);
  assert.equal(isSafeGradient('repeating-radial-gradient(circle, #111 0 4px, #222 4px 8px)'), true);
  for (const unsafe of [
    '',
    'red',
    'url(https://evil.test/x.png)',
    'linear-gradient(#000, #111), url(data:image/svg+xml,<svg/>)',
    'image-set(url("a.png") 1x)',
    'linear-gradient(#000, #111); background: red',
    'linear-gradient(#000, #111){}',
    'linear-gradient(#000, #111',
    'linear-gradient(#000, #111))',
    'expression(alert(1))',
    'linear-gradient(#000, /* comment */ #111)',
    'linear-gradient(#000, #111), '.repeat(9) + 'linear-gradient(#000, #111)',
    'linear-gradient(' + '#111, '.repeat(300) + '#222)',
  ]) {
    assert.equal(isSafeGradient(unsafe), false, `must reject unsafe value: ${unsafe.slice(0, 48)}`);
  }
});

test('themes-flow: all eight non-solid palettes meet >= 4.5 contrast across solid surfaces, native shadow and opaque gradient stops', () => {
  assert.equal(FLOW_THEMES.length, 8);
  assert.equal(FLOW_THEMES.filter(t => t.tokens.scheme === 'light').length, 3);
  assert.equal(FLOW_THEMES.filter(t => t.tokens.scheme !== 'light').length, 5);
  assert.equal(new Set(FLOW_THEMES.map(t => t.id)).size, FLOW_THEMES.length);
  assert.equal(new Set(FLOW_THEMES.map(t => t.name)).size, FLOW_THEMES.length);

  for (const theme of FLOW_THEMES) {
    const nativePalette = resolveNativePalette(theme.tokens);
    const backgrounds = [
      ['bg', theme.tokens.bg],
      ['bg2', theme.tokens.bg2],
      ['surface', theme.tokens.surface],
      ['raised', theme.tokens.raised],
      ['native-shadow', nativePalette.shadow],
    ];
    for (const fgKey of ['text', 'muted', 'accent', 'accent2', 'danger']) {
      for (const [bgName, bgHex] of backgrounds) {
        const ratio = contrast(theme.tokens[fgKey], bgHex);
        assert.ok(ratio >= 4.5, `${theme.name} ${fgKey}/${bgName} (${theme.tokens[fgKey]} on ${bgHex}): ${ratio.toFixed(2)}`);
      }
    }
    for (const key of ['backdrop', 'compact']) {
      const hexStops = theme.tokens[key].match(/#[\da-f]{6}\b/gi) || [];
      assert.ok(hexStops.length >= 2, `${theme.name}.${key} should contain multi-stop gradient colors`);
      for (const stop of hexStops) {
        for (const fgKey of ['text', 'accent', 'accent2']) {
          const ratio = contrast(theme.tokens[fgKey], stop);
          assert.ok(ratio >= 4.5, `${theme.name} ${fgKey}/${key}-stop(${stop}): ${ratio.toFixed(2)}`);
        }
      }
    }
  }
});

test('themes-flow: shell applies decorative tokens and clears all residue on fallback, override or disable', async t => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test/' });
  const scope = new ResourceScope();
  const settings = new Settings(dom.window.localStorage);
  let shell;
  const registry = new ThemeRegistry(settings, tokens => shell?.applyTheme(tokens));
  shell = createShell({ window: dom.window, document: dom.window.document, settings, scope });
  registry.refresh();
  const records = new Map();
  const manager = new PluginManager({
    journal: new SessionJournal(),
    settings,
    store: { async list() { return [...records.values()]; }, async put(row) { records.set(row.id, structuredClone(row)); } },
    context: {
      window: dom.window,
      document: dom.window.document,
      themes: registry,
      ui: { registerPanel() { assert.fail('theme pack must not register panels'); } },
      notify() {},
    },
  });
  t.after(() => { manager.dispose(); scope.dispose(); dom.window.close(); });
  manager.registerBuiltin(plugin);
  await manager.init();

  assert.deepEqual(manifest.categories, []);
  assert.equal(registry.list().length, FLOW_THEMES.length + 1);
  assert.equal(shell.host.hasAttribute('data-theme-textured'), false);

  registry.select('themes-flow.qinglv');
  assert.equal(shell.host.hasAttribute('data-theme-textured'), true);
  for (const key of OPTIONAL_THEME_TOKENS) {
    assert.ok(shell.host.style.getPropertyValue('--sgs-' + key), `--sgs-${key} should be applied`);
  }

  // An override with 'none' strips the gradient token without polluting solid tokens.
  const clearOverride = registry.override('test', { backdrop: 'none' }, 5);
  assert.equal(registry.current.tokens.backdrop, undefined);
  assert.equal(shell.host.style.getPropertyValue('--sgs-backdrop'), '');
  clearOverride();
  assert.ok(shell.host.style.getPropertyValue('--sgs-backdrop'));

  // Disabling falls back to core.black-gold and clears all decorative CSS vars.
  await manager.disable(manifest.id);
  assert.equal(registry.current.id, BLACK_GOLD.id);
  assert.equal(shell.host.hasAttribute('data-theme-textured'), false);
  for (const key of OPTIONAL_THEME_TOKENS) {
    assert.equal(shell.host.style.getPropertyValue('--sgs-' + key), '', `--sgs-${key} must clear on fallback`);
  }
  assert.equal(settings.get('theme'), 'themes-flow.qinglv', 'saved preference persists across disable');

  // Re-enabling restores the saved non-solid theme.
  await manager.enable(manifest.id);
  assert.equal(registry.current.id, 'themes-flow.qinglv');
  assert.equal(shell.host.hasAttribute('data-theme-textured'), true);
});

test('themes-flow: native theme resolves bg2/accent2, invalidates cache and paints distinct dual-tone SVGs', t => {
  const values = new Map();
  const settings = { get: (k, d) => values.has(k) ? values.get(k) : d, set: (k, v) => values.set(k, v) };
  const registry = new ThemeRegistry(settings);
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  for (const theme of FLOW_THEMES) registry.register(theme, manifest.id);
  const loaded = [];
  const win = {
    Laya: {
      Handler: { create: (_, fn) => fn },
      Loader: { IMAGE: 'image' },
      loader: { load(uri, fn) { loaded.push(uri); fn({ url: uri }); }, clearRes() {} },
    },
  };
  const native = createNativeTheme({ themes: registry, scope, window: win });
  const target = {
    width: 120, height: 30, destroyed: false,
    graphics: { clear() {}, drawRect() {}, drawTexture() {}, drawLines() {} },
    destroy() { this.destroyed = true; },
  };

  native.surface(target);
  const solidUri = loaded.at(-1);
  registry.select('themes-flow.qinglv');
  assert.equal(native.palette.bg2, FLOW_THEMES[0].tokens.bg2);
  assert.equal(native.palette.accent2, FLOW_THEMES[0].tokens.accent2);
  native.surface(target);
  const flowUri = loaded.at(-1);
  assert.notEqual(flowUri, solidUri);
  assert.match(decodeURIComponent(flowUri), new RegExp(FLOW_THEMES[0].tokens.bg2, 'i'));

  // Changing only bg2/accent2 invalidates the cached native palette.
  const base = { ...FLOW_THEMES[0].tokens };
  registry.register({ id: 'test.tone-a', name: 'A', tokens: { ...base, accent2: '#7cd6c0' } }, 'test');
  registry.register({ id: 'test.tone-b', name: 'B', tokens: { ...base, accent2: '#e2c278' } }, 'test');
  registry.select('test.tone-a');
  const firstAccent2 = native.palette.accent2;
  registry.select('test.tone-b');
  assert.notEqual(native.palette.accent2, firstAccent2);
});

test('themes-flow: microclient Chromium 85 CSS compatibility preserves gradient variables', () => {
  const sample = ':host([data-theme-textured]) .nav{background-color:color-mix(in srgb,var(--sgs-surface) 78%,transparent);background-image:var(--sgs-card,none)}';
  const translated = legacyMicroCSS(sample, name => ({ '--sgs-surface': '#172b2f' }[name] || ''), value => {
    if (value === 'transparent') return [0, 0, 0, 0];
    return [0x17, 0x2b, 0x2f, 255];
  });
  assert.match(translated, /background-color:rgba\(23,43,47,0\.78\)/);
  assert.match(translated, /background-image:var\(--sgs-card,none\)/);
});
