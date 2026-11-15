import { BLACK_GOLD } from '../core/themes.js';

// This module is shared source, also bundled as a fallback by standalone plugins.
// Native Laya Graphics cannot consume CSS variables or color-mix expressions.
const colorKeys = ['bg', 'surface', 'raised', 'text', 'muted', 'accent', 'border', 'danger'];
const contexts = new WeakMap(), textureCaches = new WeakMap(), destruction = new WeakMap();
const channel = n => Math.max(0, Math.min(255, Math.round(n)));
const hex = values => '#' + values.map(n => channel(n).toString(16).padStart(2, '0')).join('');
function parseHex(value) {
  if (!/^#[\da-f]{3}(?:[\da-f]|[\da-f]{3}|[\da-f]{5})?$/i.test(value)) return null;
  let raw = value.slice(1); if (raw.length <= 4) raw = [...raw].map(n => n + n).join('');
  return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16)).concat(raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
}
function color(value, fallback, document, background = '#000000') {
  let rgba = typeof value === 'string' && parseHex(value.trim());
  if (!rgba && typeof value === 'string' && document) {
    // A local 1px canvas resolves browser-supported CSS colors, never URLs/artwork.
    // Only needed for third-party themes; the shipped palettes all use hex.
    let ctx = contexts.get(document);
    if (ctx === undefined) {
      try { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch { ctx = null; }
      contexts.set(document, ctx || null);
    }
    if (ctx) try {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = fallback; ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const bytes = ctx.getImageData(0, 0, 1, 1).data; rgba = [bytes[0], bytes[1], bytes[2], bytes[3] / 255];
    } catch {}
  }
  rgba ||= parseHex(fallback);
  const base = parseHex(background);
  return hex(rgba.slice(0, 3).map((v, i) => v * rgba[3] + base[i] * (1 - rgba[3])));
}
export function mixNativeColors(a, b, amount = .5) {
  if (!Number.isFinite(amount)) throw new Error('原生主题混色比例必须是有限数值');
  const left = parseHex(a), right = parseHex(b), ratio = Math.max(0, Math.min(1, amount));
  if (!left || !right) throw new Error('原生主题混色需要十六进制颜色');
  return hex(left.slice(0, 3).map((v, i) => v * (1 - ratio) + right[i] * ratio));
}
export function resolveNativePalette(tokens = {}, document) {
  const p = {};
  for (const key of colorKeys) p[key] = color(tokens[key] ?? BLACK_GOLD.tokens[key], BLACK_GOLD.tokens[key], document, p.bg);
  return Object.freeze({ ...p, borderSoft: mixNativeColors(p.bg, p.border, .65),
    highlight: mixNativeColors(p.accent, p.text, .36), shadow: mixNativeColors(p.bg, '#000000', tokens.scheme === 'light' ? .04 : .35),
    selected: mixNativeColors(p.surface, p.accent, .23), hover: mixNativeColors(p.surface, p.accent, .11),
    accentSoft: mixNativeColors(p.bg, p.accent, .35) });
}
export const DEFAULT_NATIVE_PALETTE = resolveNativePalette();

// One instance-level hook per native target; no engine prototype is modified.
function onDestroy(target, callback) {
  if (!target || typeof target.destroy !== 'function') return () => {};
  let entry = destruction.get(target);
  if (!entry || target.destroy !== entry.wrapper) {
    const original = target.destroy, own = Object.getOwnPropertyDescriptor(target, 'destroy');
    entry = { callbacks: new Set(), own, original };
    entry.wrapper = function (...args) {
      try { return original.apply(this, args); }
      finally { for (const fn of [...entry.callbacks]) fn(); }
    };
    try { target.destroy = entry.wrapper; } catch { return () => {}; }
    if (target.destroy !== entry.wrapper) return () => {};
    destruction.set(target, entry);
  }
  entry.callbacks.add(callback);
  return () => {
    entry.callbacks.delete(callback);
    if (!entry.callbacks.size) {
      if (target.destroy === entry.wrapper) { if (entry.own) Object.defineProperty(target, 'destroy', entry.own); else delete target.destroy; }
      if (destruction.get(target) === entry) destruction.delete(target);
    }
  };
}

function cacheFor(laya) {
  let cache = textureCaches.get(laya); if (!cache) textureCaches.set(laya, cache = new Map()); return cache;
}
function prune(cache, laya) {
  // Keep warm combinations, and never evict textures still drawn by a live node.
  for (const [key, entry] of cache) {
    if (cache.size <= 128) break;
    if (entry.pending || entry.refs) continue;
    cache.delete(key); laya.loader.clearRes?.(entry.uri);
  }
}
function surfaceSVG(p, width, height, { kind, selected, hover, disabled }) {
  const panel = kind === 'panel', option = kind === 'option', tab = kind === 'tab' || kind === 'segment';
  const active = selected && !disabled, over = hover && !disabled;
  const radius = panel ? 6 : option ? 3 : 5, accent = disabled ? p.muted : p.accent;
  let body;
  if (option || tab) {
    body = `<defs><linearGradient id="wash"><stop stop-color="${accent}" stop-opacity="${active ? '.23' : '.09'}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>`
      + (active || over ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="url(#wash)"/>` : '')
      + (active ? `<rect x="1" y="${option ? 7 : height - 2}" width="${option ? 2 : width - 2}" height="${option ? Math.max(1, height - 14) : 1}" rx="1" fill="${accent}"/>` : '');
  } else {
    body = `<defs><linearGradient id="base" x2="0" y2="1"><stop stop-color="${active ? p.selected : over ? p.hover : p.raised}"/><stop offset=".46" stop-color="${active ? mixNativeColors(p.surface, p.accent, .16) : p.surface}"/><stop offset="1" stop-color="${panel ? p.shadow : p.bg}"/></linearGradient><linearGradient id="rim" x2="0" y2="1"><stop stop-color="${active ? accent : p.border}"/><stop offset=".5" stop-color="${p.borderSoft}"/><stop offset="1" stop-color="${p.shadow}"/></linearGradient></defs>`
      + `<rect x="1" y="2" width="${width - 2}" height="${height - 3}" rx="${radius}" fill="#000" fill-opacity=".3"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 2}" rx="${radius}" fill="url(#base)" stroke="url(#rim)"/><path d="M${radius + 1} 2H${width - radius - 1}" stroke="${p.highlight}" stroke-opacity="${panel ? '.16' : '.21'}"/>`
      + (active ? `<path d="M8 ${height - 3}H${width - 8}" stroke="${accent}" stroke-opacity=".6"/>` : '');
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

/** Core-owned, scope-aware native theme service. No game runtime is required until drawing. */
export function createNativeTheme({ themes, scope, window = {}, document = window.document } = {}) {
  const states = new WeakMap(); let lastSignature, palette = DEFAULT_NATIVE_PALETTE;
  function current() {
    const tokens = themes?.current?.tokens || {}, signature = JSON.stringify([...colorKeys, 'scheme'].map(key => tokens[key]));
    if (lastSignature !== signature) { lastSignature = signature; palette = resolveNativePalette(tokens, document); }
    return palette;
  }
  function watch(fn, { target } = {}) {
    if (scope.closed || target?.destroyed) return () => {};
    let off = () => {}, offDestroy = () => {}, active = true;
    const release = scope.add(() => { active = false; off(); offDestroy(); });
    const update = () => { if (!active || scope.closed) return; if (target?.destroyed) { release(); return; } fn(current()); };
    try {
      off = themes?.subscribe?.(update) || (() => {});
      offDestroy = onDestroy(target, release); update();
    } catch (error) { release(); throw error; }
    return release;
  }
  function bind(target, properties) {
    if (!target || scope.closed || target.destroyed) return () => {};
    const saved = new Map(), applied = new Map();
    let disposed = false;
    for (const key of Object.keys(properties)) {
      const own = Object.getOwnPropertyDescriptor(target, key); let inherited;
      for (let parent = Object.getPrototypeOf(target); parent && !inherited; parent = Object.getPrototypeOf(parent)) inherited = Object.getOwnPropertyDescriptor(parent, key);
      saved.set(key, { own, setter: !!(own || inherited)?.set, value: target[key] });
    }
    const restoreFields = () => {
      if (target.destroyed) return;
      for (const [key, old] of saved) if (applied.has(key) && target[key] === applied.get(key)) {
        applied.delete(key);
        if (old.setter) target[key] = old.value;
        else if (old.own) Object.defineProperty(target, key, old.own);
        else delete target[key];
      }
    };
    const restore = scope.add(() => { disposed = true; restoreFields(); });
    let unwatch;
    try {
      unwatch = watch(p => {
        for (const [key, value] of Object.entries(properties)) {
          if (typeof value !== 'function' && !Object.hasOwn(p, value)) throw new Error(`未知原生主题颜色：${value}`);
          const next = typeof value === 'function' ? value(p) : p[value];
          if (disposed || scope.closed || target.destroyed) return;
          applied.set(key, next); target[key] = next;
          if (target.destroyed) return;
          applied.set(key, target[key]);
          if (disposed || scope.closed) { restoreFields(); return; }
        }
      }, { target });
    } catch (error) { restore(); throw error; }
    if (scope.closed || target.destroyed) { unwatch(); restore(); return () => {}; }
    let offDestroy = () => {};
    const release = scope.add(() => { unwatch(); restore(); offDestroy(); });
    if (!scope.closed && !target.destroyed) offDestroy = onDestroy(target, release);
    return release;
  }
  function surface(node, options = {}) {
    if (scope.closed || node?.destroyed || !node?.graphics) return;
    const p = current(), width = Number(options.width ?? node.width), height = Number(options.height ?? node.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4 || width > 4096 || height > 4096) return;
    const config = { kind: options.kind || 'button', selected: !!options.selected, hover: !!options.hover, disabled: !!options.disabled };
    const uri = surfaceSVG(p, width, height, config), laya = window.Laya ?? window.laya;
    let state = states.get(node);
    if (state?.key === uri && state.entry && (state.entry.texture || state.entry.pending)) return;
    if (!state) {
      state = { key: '', entry: null, cancel: () => {}, active: true }; states.set(node, state);
      let offDestroy = () => {};
      const release = scope.add(() => {
        state.active = false; state.cancel();
        if (state.entry) { state.entry.refs--; if (!node.destroyed && node._sgsNativeSurfaceKey === state.key) node.graphics.clear(); if (laya) prune(cacheFor(laya), laya); }
        offDestroy(); states.delete(node);
      });
      offDestroy = onDestroy(node, release);
    }
    state.cancel();
    node.graphics.clear(); if (state.entry) state.entry.refs--;
    state.entry = null; state.key = uri; node._sgsNativeSurfaceKey = uri; node._sgsNativeSurfaceAppliedKey = '';
    if (!['option', 'tab', 'segment'].includes(config.kind)) node.graphics.drawRect(1, 1, width - 2, height - 2, p.surface);
    if (!laya?.loader?.load || !laya?.Handler?.create) return;
    const cache = cacheFor(laya); let entry = cache.get(uri);
    if (entry) { cache.delete(uri); cache.set(uri, entry); }
    else { entry = { uri, refs: 0, pending: true, texture: null, waiters: new Set() }; cache.set(uri, entry); }
    state.entry = entry; entry.refs++;
    const draw = texture => {
      if (!texture || scope.closed || !state.active || node.destroyed || state.key !== uri || node._sgsNativeSurfaceKey !== uri) return;
      state.cancel();
      node.graphics.clear(); node.graphics.drawTexture(texture, 0, 0, width, height); node._sgsNativeSurfaceAppliedKey = uri;
    };
    if (entry.texture) { draw(entry.texture); prune(cache, laya); return; }
    entry.waiters.add(draw); state.cancel = () => entry.waiters.delete(draw);
    if (entry.started) return;
    entry.started = true;
    try {
      laya.loader.load(uri, laya.Handler.create(null, texture => {
        entry.pending = false; entry.texture = texture;
        for (const waiter of [...entry.waiters]) waiter(texture);
        entry.waiters.clear(); if (!texture) cache.delete(uri); prune(cache, laya);
      }), null, laya.Loader?.IMAGE);
    } catch (error) { entry.pending = false; cache.delete(uri); entry.waiters.clear(); throw error; }
  }
  return Object.freeze({ get palette() { return current(); }, watch, bind, surface,
    chevron(node, x, y, open, ink = current().accent) { if (scope.closed || node?.destroyed) return; node.graphics.clear(); node.graphics.drawLines(x, y, open ? [0, 3, 3, 0, 6, 3] : [0, 0, 3, 3, 6, 0], ink, 1.2); },
    get cacheStats() { const laya = window.Laya ?? window.laya, entries = laya ? [...cacheFor(laya).values()] : []; return { entries: entries.length, pending: entries.filter(e => e.pending).length, live: entries.reduce((n, e) => n + e.refs, 0) }; }
  });
}
const fallbacks = new WeakMap();
export function getNativeTheme(ctx) {
  if (ctx.ui?.nativeTheme) return ctx.ui.nativeTheme;
  let theme = fallbacks.get(ctx);
  if (!theme) { theme = createNativeTheme(ctx); fallbacks.set(ctx, theme); }
  return theme;
}
