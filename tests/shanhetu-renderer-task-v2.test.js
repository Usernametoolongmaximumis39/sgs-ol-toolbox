import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { ResourceScope } from '../src/core/resources.js';
import { createInfoCardView } from '../src/plugins/shanhetu/card-view-v2.js';

// Scheduler unit tests: real renderer and solver, deterministic frame queues.
// Native geometry/rendering are separately covered by the actual Laya browser
// suite; these boundary doubles let cancellation happen at exact yield points.
const mocks = new Map([
  ['presentation.js', 'export const labelLines = node => node.lines || [];'],
  ['placement-geometry.js', 'export const capturePlacementGeometry = ({window}) => window.testGeometry; export const placementRectToClient = rect => rect;'],
  ['overlay-host.js', `export const placementOverlaySignature = ({viewport}) => JSON.stringify(viewport);
    export function createPlacementOverlay(L) { const root=new L.Sprite(); root.name='sgs-shanhetu-labels-v2'; const content=new L.Sprite(); root.addChild(content); return {root,content}; }`],
  ['card-view-v2.js', `export function createInfoCardView(ctx) { return {
    measure(node, lines, w) { ctx.window.calls.measure++; return {id:node.id,w,h:80}; },
    build(spec) { ctx.window.calls.build++; const sprite=new ctx.window.Laya.Sprite(); sprite.name='shanhe-card-'+spec.id; sprite.size(spec.w,spec.h); return sprite; },
    inspect() { return {}; }
  }; }`],
]);
const bundle = await build({ entryPoints: ['src/plugins/shanhetu/map-labels-v2.js'], bundle: true, write: false,
  format: 'esm', platform: 'node', plugins: [{ name: 'scheduler-boundaries', setup(builder) {
    builder.onLoad({ filter: /(?:native-theme|presentation|placement-geometry|overlay-host|card-view-v2)\.js$/ }, args => {
      const contents = mocks.get(args.path.split(/[\\/]/).at(-1)); return contents ? { contents, loader: 'js' } : undefined;
    });
  } }] });
const { createMapLabels } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

function sprites() {
  const all = [];
  class Sprite {
    constructor() { all.push(this); this.children = []; this.destroyed = false; this.graphics = { drawLine() {}, drawTexture() {} }; }
    addChild(child) { child.removeSelf(); this.children.push(child); child.parent = this; return child; }
    removeSelf() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; return this; }
    destroy() { if (this.destroyed) return; for (const child of [...this.children]) child.destroy(true); this.removeSelf(); this.destroyed = true; }
    size(w, h) { this.width = w; this.height = h; return this; }
    pos(x, y) { this.x = x; this.y = y; return this; }
  }
  return { Sprite, all };
}

function harness(raf = true) {
  const { Sprite, all } = sprites(), frames = new Map(), timers = new Map(), intervals = new Set(), errors = [];
  let serial = 0, clock = 0;
  const window = { Laya: { Sprite, Text: Sprite }, performance: { now: () => clock += 2 }, calls: { measure: 0, build: 0 },
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  if (raf) {
    window.requestAnimationFrame = fn => { const id = ++serial; frames.set(id, fn); return id; };
    window.cancelAnimationFrame = id => frames.delete(id);
  }
  const scope = new ResourceScope();
  scope.timeout = fn => {
    let release; const id = window.setTimeout(() => { release(); if (!scope.closed) fn(); });
    release = scope.add(() => window.clearTimeout(id)); return id;
  };
  scope.interval = fn => { intervals.add(fn); scope.add(() => intervals.delete(fn)); return 1; };
  const palette = { accent: '#ddd', surface: '#222', raised: '#333', text: '#fff', muted: '#888', border: '#666', danger: '#f00' };
  const ctx = { window, document: null, scope, settings: { get: (_, fallback) => fallback }, reportError: error => errors.push(error),
    ui: { nativeTheme: { palette, watch: () => () => {}, surface() {} } } };
  const renderer = createMapLabels(ctx), scene = new Sprite(); scene.cityView = new Sprite(); scene.addChild(scene.cityView);
  const nodes = [{ id: 1, city: '城', lines: [{ kind: 'text', text: '完整内容' }] }];
  const geometry = signature => ({ ready: true, controlsComplete: true, reason: 'ready', signature,
    viewport: { x: 0, y: 0, w: 800, h: 600 }, nodes: [{ id: 1, anchor: { x: 380, y: 280, w: 40, h: 40 }, regions: [] }],
    controls: [], pending: [] });
  window.testGeometry = geometry('A');
  const tick = () => { const queue = frames.size ? frames : timers; const entry = queue.entries().next().value;
    assert(entry, 'a pending job must have a scheduled continuation'); queue.delete(entry[0]); entry[1](); };
  const drain = () => { let count = 0; while (renderer.inspect().pending) { assert(++count < 2000); tick(); }
    assert.deepEqual(errors, []); return renderer.inspect(); };
  const overlays = () => all.filter(sprite => sprite.name === 'sgs-shanhetu-labels-v2' && !sprite.destroyed && sprite.parent);
  return { window, scope, renderer, scene, nodes, geometry, tick, drain, overlays, frames, timers, intervals, all, Sprite };
}

test('A→B→A during incremental resize rebuilds the returned signature instead of caching an absent layer', () => {
  const h = harness();
  try {
    h.renderer.update(h.scene, h.nodes, true); const first = h.drain(); assert.equal(h.overlays().length, 1);
    h.window.testGeometry = h.geometry('B'); h.renderer.update(h.scene, h.nodes, true); h.tick();
    assert.equal(h.overlays().length, 0, 'B has actually invalidated the old visible layer');
    h.window.testGeometry = h.geometry('A'); h.renderer.update(h.scene, h.nodes, true);
    const returned = h.drain();
    assert.equal(h.overlays().length, 1); assert.equal(returned.status.state, 'ready');
    assert.equal(returned.cards.length, 1); assert.equal(returned.revision, first.revision + 1);
    const measured = h.window.calls.measure;
    for (const poll of h.intervals) poll(); h.drain();
    assert.equal(h.window.calls.measure, measured, 'unchanged polling must not start a duplicate job');
  } finally { h.scope.dispose(); }
});

test('scene replacement and disable cancel unfinished native resources and reject captured stale frame callbacks', () => {
  const h = harness();
  try {
    h.renderer.update(h.scene, h.nodes, true); h.tick();
    const stale = h.frames.values().next().value;
    const nextScene = new h.Sprite(); nextScene.cityView = new h.Sprite(); nextScene.addChild(nextScene.cityView);
    h.window.testGeometry = h.geometry('replacement'); h.renderer.update(nextScene, h.nodes, true);
    const measured = h.window.calls.measure; stale();
    assert.equal(h.window.calls.measure, measured, 'a stale callback cannot run the new job');
    h.drain(); assert.equal(h.overlays()[0].parent, nextScene);
    h.window.testGeometry = h.geometry('C'); h.renderer.update(nextScene, h.nodes, true); h.tick();
    const built = h.window.calls.build;
    while (h.window.calls.build === built) h.tick();
    assert.equal(h.overlays().length, 0, 'new sprites exist but have not been committed');
    h.renderer.update(nextScene, h.nodes, false);
    assert.equal(h.renderer.inspect().status.state, 'inactive');
    assert(h.all.filter(s => s.name?.startsWith('shanhe-card-') || s.name === 'sgs-shanhetu-labels-v2').every(s => s.destroyed));
    assert.equal(h.frames.size, 0);
  } finally { h.scope.dispose(); }
});

test('numeric timeout fallback is really cancelled and a captured old timeout cannot advance replacement work', () => {
  const h = harness(false);
  try {
    h.renderer.update(h.scene, h.nodes, true);
    const [oldId, oldCallback] = h.timers.entries().next().value;
    h.window.testGeometry = h.geometry('B'); h.renderer.update(h.scene, [{ ...h.nodes[0], city: '更新城' }], true);
    assert.equal(h.timers.has(oldId), false, 'scope.timeout returns a numeric timer id, not a RAF id');
    const measured = h.window.calls.measure; oldCallback();
    assert.equal(h.window.calls.measure, measured);
    h.drain(); assert.equal(h.overlays().length, 1);
    assert.equal(h.timers.size, 0);
  } finally { h.scope.dispose(); }
});

test('failed or cancelled icon loads retain no listeners for destroyed native cards', async () => {
  const { Sprite } = sprites(), cleanups = [], images = [];
  class Image { constructor() { images.push(this); } set src(value) { this.source = value; } }
  const ctx = { window: { Laya: { Sprite, Text: Sprite, Texture2D: class {}, Texture: class {} }, Image },
    scope: { add(fn) { cleanups.push(fn); } } };
  const view = createInfoCardView(ctx, { palette: { accent: '#fff' }, surface() {} });
  const spec = { id: 1, w: 220, h: 100, texts: [], rules: [], accessibleText: '体力4',
    images: [{ name: 'stat_hp', label: '体力', x: 12, y: 12, w: 17, h: 17 }] };
  try {
    const first = view.build(spec); assert.equal(view.inspect().pendingIconListeners, 1);
    first.destroy(true); assert.equal(view.inspect().pendingIconListeners, 0, 'destroy releases an in-flight icon subscription');
    images[0].onerror();
    for (let i = 0; i < 12; i++) view.build(spec).destroy(true);
    assert.equal(view.inspect().failedIcons, 1); assert.equal(view.inspect().pendingIconListeners, 0);
    assert.equal(images.length, 1, 'failure falls back without an unbounded retry/load queue');
  } finally { for (const cleanup of cleanups) cleanup(); }
});
