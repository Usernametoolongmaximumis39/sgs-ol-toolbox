import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeTheme, getNativeTheme, resolveNativePalette, DEFAULT_NATIVE_PALETTE } from '../src/ui/native-theme.js';
import { ResourceScope } from '../src/core/resources.js';
import { ThemeRegistry } from '../src/core/themes.js';
import { THEMES } from '../src/core/theme-palettes.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';

function setup(t) {
  const values = new Map(), settings = { get: (k, d) => values.has(k) ? values.get(k) : d, set: (k, v) => values.set(k, v), namespace() { return this; } };
  const themes = new ThemeRegistry(settings), scope = new ResourceScope(); t.after(() => scope.dispose());
  for (const value of THEMES) themes.register(value, 'themes');
  const pending = [], cleared = [], window = { Laya: { Handler: { create: (_, fn) => fn }, Loader: { IMAGE: 'image' },
    loader: { load(uri, handler) { pending.push({ uri, handler }); }, clearRes(uri) { cleared.push(uri); } } } };
  const ui = createNativeTheme({ themes, scope, window });
  const finish = index => pending[index].handler({ url: pending[index].uri });
  return { themes, scope, ui, pending, finish, cleared, window, settings };
}
function node() {
  return { color: 'original', destroyed: false, width: 100, height: 26, texture: null,
    graphics: { clear() { this.texture = null; }, drawRect() {}, drawTexture(texture) { this.texture = texture; }, drawLines() {} },
    destroy() { this.destroyed = true; this.graphics.clear(); } };
}

test('native theme: concrete palettes, alpha compositing and safe invalid-color fallback', () => {
  const palette = resolveNativePalette({ bg: '#fff', accent: '#0008', text: 'url(https://invalid.test)' });
  assert.equal(palette.bg, '#ffffff'); assert.equal(palette.accent, '#777777');
  assert.equal(palette.text, DEFAULT_NATIVE_PALETTE.text);
  assert.ok(Object.values(palette).every(value => /^#[\da-f]{6}$/i.test(value)));
  assert.equal(Object.isFrozen(palette), true);
});

test('native theme: immediate watch, in-place changes and automatic destruction cleanup', t => {
  const h = setup(t), target = node(), original = target.destroy, colors = [];
  const off = h.ui.watch(p => colors.push(p.accent), { target });
  assert.deepEqual(colors, [DEFAULT_NATIVE_PALETTE.accent]);
  h.themes.select('themes.jade'); assert.equal(colors.at(-1), THEMES[0].tokens.accent);
  target.destroy(); assert.equal(h.themes.listeners.size, 0); assert.equal(target.destroy, original);
  const delivered = colors.length; h.themes.select('themes.blue'); assert.equal(colors.length, delivered);
  off(); assert.equal(h.scope.cleanups.length, 0);
});

test('native theme: declarative fields restore only their own writes and preserve later owners', t => {
  const h = setup(t), target = node(); target.strokeColor = 'original stroke';
  const off = h.ui.bind(target, { color: 'text', strokeColor: p => p.shadow });
  assert.equal(target.color, h.ui.palette.text);
  h.themes.select('themes.violet'); assert.equal(target.strokeColor, h.ui.palette.shadow);
  target.color = 'changed by another owner'; off();
  assert.equal(target.color, 'changed by another owner'); assert.equal(target.strokeColor, 'original stroke');
  assert.equal(h.themes.listeners.size, 0); assert.equal(h.scope.cleanups.length, 0);
  assert.throws(() => h.ui.bind(target, { color: 'typo' }), /未知/);
  assert.equal(h.scope.cleanups.length, 0);
});

test('native theme: disposed services and callbacks cannot revive or repaint targets', t => {
  const h = setup(t), target = node(); let calls = 0;
  h.ui.watch(() => calls++); h.ui.bind(target, { color: 'accent' }); h.ui.surface(target); h.scope.dispose();
  assert.equal(target.color, 'original'); assert.equal(h.themes.listeners.size, 0);
  h.finish(0); assert.equal(target.graphics.texture, null);
  h.ui.watch(() => calls++); h.ui.bind(target, { color: 'accent' }); h.ui.surface(target);
  assert.equal(calls, 1); assert.equal(h.pending.length, 1); assert.equal(h.ui.cacheStats.live, 0);
});

test('native theme: old decoded textures cannot cover a newer palette and warm surfaces reuse textures', t => {
  const h = setup(t), target = node(); h.ui.surface(target);
  const oldKey = target._sgsNativeSurfaceKey;
  h.themes.select('themes.blue'); h.ui.surface(target); const nextKey = target._sgsNativeSurfaceKey;
  assert.notEqual(oldKey, nextKey); h.finish(1); h.finish(0);
  assert.equal(target.graphics.texture.url, nextKey); assert.equal(target._sgsNativeSurfaceAppliedKey, nextKey);
  h.themes.select('core.black-gold'); h.ui.surface(target);
  assert.equal(h.pending.length, 2); assert.equal(target.graphics.texture.url, oldKey);
  for (let i = 0; i < 10; i++) h.ui.surface(target);
  assert.equal(h.pending.length, 2);
  target.destroy(); assert.equal(h.ui.cacheStats.live, 0); assert.equal(h.scope.cleanups.length, 0);
});

test('native theme: multiple nodes share decoding; one destroyed waiter cannot cancel another', t => {
  const h = setup(t), first = node(), second = node();
  h.ui.surface(first); h.ui.surface(second); assert.equal(h.pending.length, 1);
  first.destroy(); h.finish(0);
  assert.equal(first.graphics.texture, null); assert.equal(second.graphics.texture.url, second._sgsNativeSurfaceKey);
  assert.equal(h.ui.cacheStats.live, 1); second.destroy(); assert.equal(h.ui.cacheStats.live, 0);
});

test('native theme: failed decode can retry, and the warm cache bounds unused variants', t => {
  const h = setup(t), target = node(); h.ui.surface(target); h.pending[0].handler(null);
  h.ui.surface(target); assert.equal(h.pending.length, 2); h.finish(1);
  for (let width = 110; width < 250; width++) { h.ui.surface(target, { width }); h.finish(h.pending.length - 1); }
  assert.ok(h.ui.cacheStats.entries <= 128); assert.ok(h.cleared.length > 0);
  assert.equal(h.ui.cacheStats.live, 1); assert.equal(target.graphics.texture.url, target._sgsNativeSurfaceKey);
});

test('native theme: fallback supports older cores without subscription or Laya runtime', t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const ctx = { scope, window: {}, themes: { current: { tokens: { accent: '#abc' } } } };
  const ui = getNativeTheme(ctx); assert.equal(ui, getNativeTheme(ctx));
  let latest; ui.watch(p => { latest = p.accent; }); assert.equal(latest, '#aabbcc');
  const shared = {}; assert.equal(getNativeTheme({ ui: { nativeTheme: shared } }), shared);
});

test('native theme: bind respects reentrant disposal and restores inherited property semantics', t => {
  const h = setup(t), target = node();
  h.ui.bind(target, { color: p => { h.scope.dispose(); return p.accent; } });
  assert.equal(target.color, 'original'); assert.equal(h.scope.cleanups.length, 0); assert.equal(h.themes.listeners.size, 0);
  const second = setup(t), inherited = Object.create({ color: 'inherited' });
  const off = second.ui.bind(inherited, { color: 'text' }); off();
  assert.equal(Object.hasOwn(inherited, 'color'), false); assert.equal(inherited.color, 'inherited');
  const destroyed = node(); second.ui.bind(destroyed, { color: p => { destroyed.destroy(); return p.text; } });
  assert.equal(destroyed.color, 'original'); assert.equal(second.scope.cleanups.length, 0); assert.equal(second.themes.listeners.size, 0);
  const third = setup(t), setter = { value: 'start', get color() { return this.value; }, set color(v) { third.scope.dispose(); this.value = v; } };
  third.ui.bind(setter, { color: 'text' }); assert.equal(setter.color, 'start'); assert.equal(third.scope.cleanups.length, 0);
});

test('native theme: synchronous loader errors and delayed loader availability can recover', t => {
  const h = setup(t), first = node(), second = node(), loader = h.window.Laya.loader;
  h.window.Laya.loader = null; h.ui.surface(first);
  h.window.Laya.loader = loader; h.ui.surface(first); assert.equal(h.pending.length, 1); h.finish(0);
  assert.equal(first.graphics.texture.url, first._sgsNativeSurfaceKey);
  const load = loader.load; loader.load = () => { throw new Error('decode failed'); };
  assert.throws(() => h.ui.surface(second, { width: 120 }), /decode failed/);
  loader.load = load; h.ui.surface(second, { width: 120 }); assert.equal(h.pending.length, 2); h.finish(1);
  assert.equal(second.graphics.texture.url, second._sgsNativeSurfaceKey);
});

test('native theme: manager provides a separate scope-owned service on every activation', async t => {
  const h = setup(t), contexts = [], target = node();
  const manager = new PluginManager({ journal: new SessionJournal(), settings: h.settings,
    store: { async list() { return []; }, async put() {} }, context: { themes: h.themes, window: h.window, ui: {} } });
  t.after(() => manager.dispose());
  manager.registerBuiltin({ manifest: { id: 'native-example', name: '原生示例', version: '1.0.0', apiVersion: 1, categories: ['tools'] },
    activate(ctx) { contexts.push(ctx); ctx.ui.nativeTheme.bind(target, { color: 'accent' }); } });
  await manager.init(); assert.equal(target.color, h.ui.palette.accent);
  await manager.disable('native-example'); assert.equal(target.color, 'original'); assert.equal(h.themes.listeners.size, 0);
  await manager.enable('native-example'); assert.notEqual(contexts[0].ui.nativeTheme, contexts[1].ui.nativeTheme);
  h.themes.select('themes.jade'); assert.equal(target.color, THEMES[0].tokens.accent);
  contexts[0].ui.nativeTheme.bind(target, { color: 'danger' }); assert.equal(target.color, THEMES[0].tokens.accent);
});


test('native theme: light surfaces preserve readable ink and scheme-only changes invalidate cached palette', t => {
  const h = setup(t);
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  for (const theme of THEMES.filter(t => t.tokens.scheme === 'light')) {
    h.themes.select(theme.id);
    const p = h.ui.palette;
    for (const key of ['text', 'muted', 'accent', 'danger']) {
      const values = [luminance(p[key]), luminance(p.shadow)].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${theme.name} ${key} on native panel bottom`);
    }
  }
  const tokens = THEMES.find(t => t.tokens.scheme === 'light').tokens;
  h.themes.register({ id: 'test.light', name: '浅色', tokens }, 'test');
  h.themes.register({ id: 'test.dark', name: '同色深系', tokens: { ...tokens, scheme: 'dark' } }, 'test');
  h.themes.select('test.light'); const light = h.ui.palette.shadow;
  h.themes.select('test.dark'); assert.notEqual(h.ui.palette.shadow, light);
});
