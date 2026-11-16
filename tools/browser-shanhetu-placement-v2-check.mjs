import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const performanceOnly = process.argv.includes('--performance-only'), baselinePerformance = process.argv.includes('--perf-baseline');
const output = path.join(root, performanceOnly ? 'test-results/shanhetu-placement-v2-performance' : process.argv.includes('--measure-card-widths-only') ? 'test-results/shanhetu-placement-v2-widths' : 'test-results/shanhetu-placement-v2');
const layaPath = process.env.SGS_LAYA_CORE || path.resolve(root, '../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js');
const clientPath = process.env.SGS_CLIENT_SOURCE || 'C:/Users/Admin/AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs';
const officialAssetDirectory = path.join(root, 'test-results/shanhetu-placement-v2/official-assets');
const officialAssets = JSON.parse(await readFile(path.join(officialAssetDirectory, 'city-assets.json'), 'utf8'));
const officialControlPngs = JSON.parse(await readFile(path.join(officialAssetDirectory, 'control-png-evidence.json'), 'utf8'));
const officialControlAtlas = JSON.parse(await readFile(path.join(officialAssetDirectory, 'control-atlas-evidence.json'), 'utf8')).find(asset => asset.name === 'roguelikesmallmap');
await mkdir(output, { recursive: true });
const [bundle, laya, nativeClient] = await Promise.all([
  build({ entryPoints: [path.join(root, 'dev/shanhetu-placement-v2-fixture.js')], bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' }),
  readFile(layaPath),
  readFile(clientPath),
]);
const clientSha256 = createHash('sha256').update(nativeClient).digest('hex');
assert.equal(clientSha256, 'c1f3d824d59a7c2ca9f335cbe50fcc24dd4cd75a614fadf26cf65ddd7b668473', 'official flat-button getter source identity');
const clientSource = nativeClient.toString('utf8');
const fixtureBytes = performanceOnly && baselinePerformance ? await readFile(path.join(output, 'baseline.bundle.js')) : bundle.outputFiles[0].contents;
function nativeDeclaration(name) {
  const start = clientSource.indexOf(`class ${name} `), body = clientSource.indexOf('{', start);
  assert(start >= 0 && body > start, `official class ${name} must exist`);
  let depth = 1, quote = '';
  for (let index = body + 1; index < clientSource.length; index++) {
    const char = clientSource[index];
    if (quote) {
      if (char === '\\') { index++; continue; }
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return clientSource.slice(start, index + 1);
  }
  throw new Error(`Unclosed official class ${name}`);
}
// Evaluate only these three original declarations. Constructors, game bootstrap
// and business methods never run; the fixture uses original native getters on
// explicit base fields and real Laya Sprite render owners.
const getterSource = ['fO', 'EO', '$jt'].map(nativeDeclaration).join('\n');
const flatClasses = `(() => {
  class Base {
    get visible() { return this._visible !== false; }
    get x() { return this._x; } get y() { return this._y; }
    get width() { return this._width; } get height() { return this._height; }
  }
  const nativeLaya = { EventDispatcher: Base,
    superGetter: (Type, item, key) => Reflect.get(Object.getPrototypeOf(Type.prototype), key, item) };
  window.fixtureNativeFlatClasses = new Function('Laya', 'y$t', ${JSON.stringify(getterSource + '\nreturn {FlatButton:$jt,FlatImage:fO};')})(nativeLaya, Base => Base);
  // Extract the original UI method without running the city constructor or
  // client bootstrap. Calling it reproduces the end of the boss appearance.
  window.fixtureOfficialShowBossIcon = new Function('T$t', ${JSON.stringify(nativeDeclaration('a8t') + '\nreturn a8t.prototype.ShowBossIcon;')})(class {});
})();`;
const assets = new Map([
  ['/', { type: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>山河图全新布局独立演练</title><style>html,body{margin:0}body{overflow:hidden;font-family:Microsoft YaHei,sans-serif}</style></head><body><script src="/laya.js"></script><script src="/native-flat.js"></script><script src="/fixture.js"></script></body></html>' }],
  ['/laya.js', { type: 'application/javascript', body: laya }],
  ['/native-flat.js', { type: 'application/javascript', body: flatClasses }],
  ['/fixture.js', { type: 'application/javascript', body: fixtureBytes }],
]);
await Promise.all(officialAssets.assets.map(async asset => {
  const bytes = await readFile(path.join(officialAssetDirectory, asset.name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `original official PNG ${asset.name}`);
  assets.set(`/official-city/${asset.name}`, { type: 'image/png', body: bytes });
}));
await Promise.all([...officialControlPngs, { ...officialControlAtlas, name: 'roguelikesmallmap.atlas' }].map(async asset => {
  const bytes = await readFile(path.join(officialAssetDirectory, asset.name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `original official control ${asset.name}`);
  assets.set(`/official-city/${asset.name}`, { type: asset.name.endsWith('.png') ? 'image/png' : 'application/json', body: bytes });
}));
const server = createServer((request, response) => {
  const asset = assets.get(new URL(request.url, 'http://127.0.0.1').pathname);
  response.writeHead(asset ? 200 : 404, { 'content-type': asset?.type || 'text/plain', 'cache-control': 'no-store' }); response.end(asset?.body || 'not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { environment: '真实 Laya core + Chromium + 官方扁平按钮原始 getter，本机合成场景，未连接官服', layaPath,
  fixtureBundleSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  nativeClasses: { clientPath, clientSha256, declarations: ['fO', 'EO', '$jt'], uiMethods: ['a8t.ShowBossIcon'], constructorsExecuted: false },
  officialCityAssets: officialAssets, officialControlAssets: { png: officialControlPngs, atlas: officialControlAtlas }, scenarios: [], screenshots: [], errors: [], blockedRequests: [] };
let browser;
async function runPerformanceChecks() {
  report.performance = { methodology: 'Local synthetic Chromium/Laya scene, 3 fresh pages per CPU rate. No official server. Entry includes local assets, scene setup, completion and settle frames; frame gaps measure main-thread blocking. Renderer span runs from first owned card Text.typeset to scene overlay addChild. With the new shared measurement probe it no longer includes pre-build measurement/solver, so compare frame gaps and use production rendererPerformance for phase timing; owned-card typeset excludes that unparented probe. Remaining span is not a pure solver-only measurement.', trials: [] };
  for (const rate of [1, 6]) for (let trial = 1; trial <= 3; trial++) {
    const bench = await browser.newPage({ viewport: { width: 1299, height: 739 }, deviceScaleFactor: 1 });
    const trialErrors = [];
    bench.on('pageerror', error => trialErrors.push(String(error.stack || error)));
    const cdp = await bench.context().newCDPSession(bench); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await bench.route('**/*', route => route.request().url().startsWith(base) || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    await bench.addInitScript(() => {
      window.__placementPerf = { frames: [], longTasks: [], renderSpans: [], updates: [], typeMs: 0, typeCalls: 0 };
      let prior;
      const frame = now => { if (prior != null) window.__placementPerf.frames.push({ at: now, gap: now - prior }); prior = now; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__placementPerf.longTasks.push({ at: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    });
    await bench.goto(base); await bench.waitForFunction(() => window.fixtureReady);
    const startup = await bench.evaluate(() => ({ duration: performance.now(), frames: window.__placementPerf.frames, longTasks: window.__placementPerf.longTasks }));
    await bench.evaluate(() => {
      const perf = window.__placementPerf, L = window.Laya, originalTypeset = L.Text.prototype.typeset, originalAdd = L.Sprite.prototype.addChild;
      let active = null, depth = 0;
      L.Text.prototype.typeset = function (...args) {
        let owner = this.parent; while (owner && !/^shanhe-card-\d+$/.test(owner.name || '')) owner = owner.parent;
        if (!owner || depth) return Reflect.apply(originalTypeset, this, args);
        if (!active) active = { start: performance.now(), typeStart: perf.typeMs, callsStart: perf.typeCalls };
        const start = performance.now(); depth++;
        try { return Reflect.apply(originalTypeset, this, args); }
        finally { depth--; perf.typeMs += performance.now() - start; perf.typeCalls++; }
      };
      L.Sprite.prototype.addChild = function (child, ...args) {
        const value = Reflect.apply(originalAdd, this, [child, ...args]);
        if (child?.name === 'sgs-shanhetu-labels-v2' && active) {
          const end = performance.now(); perf.renderSpans.push({ at: active.start, duration: end - active.start,
            typesetMs: perf.typeMs - active.typeStart, typesetCalls: perf.typeCalls - active.callsStart }); active = null;
        }
        return value;
      };
      const originalUpdate = window.fixture.update;
      window.fixture.update = function (...args) {
        const start = performance.now(), priorType = perf.typeMs;
        try { return Reflect.apply(originalUpdate, this, args); }
        finally { perf.updates.push({ at: start, duration: performance.now() - start, typesetMs: perf.typeMs - priorType }); }
      };
      window.__benchAction = async action => {
        active = null;
        const start = performance.now(), typeStart = perf.typeMs, typeCallsStart = perf.typeCalls;
        const config = { width: 1299, height: 739, screenshotContent: true, screenshotDistribution: true, officialTextures: true, screenshotNativeControls: true };
        if (action === 'cold-entry' || action === 'hot-scene-rebuild') await window.fixture.configure(config);
        else if (action === 'battle-return') { await window.fixture.enabled(false); await window.fixture.enabled(true); }
        else if (action === 'ordinary-refreshes') for (let i = 0; i < 30; i++) { window.fixture.update(); await new Promise(requestAnimationFrame); }
        const end = performance.now(); await new Promise(requestAnimationFrame);
        const inspected = window.fixture.inspect();
        const startsWithScene = action === 'cold-entry' || action === 'hot-scene-rebuild';
        const updateAt = startsWithScene ? inspected.fixture.configureTimings?.updateAt : start;
        return { action, start, end, duration: end - start, totalTypesetMs: perf.typeMs - typeStart, totalTypesetCalls: perf.typeCalls - typeCallsStart, cards: inspected.cards,
          rendererPerformance: action === 'ordinary-refreshes' ? null : inspected.performance || null, caches: inspected.caches || null,
          fixtureTimings: inspected.fixture.configureTimings || null,
          preUpdateMs: startsWithScene && updateAt ? updateAt - inspected.fixture.configureTimings.startedAt : null,
          updateWindowFrames: updateAt ? perf.frames.filter(x => x.at >= updateAt && x.at <= end + 40) : [],
          renderSpans: perf.renderSpans.filter(x => x.at >= start && x.at <= end), updates: perf.updates.filter(x => x.at >= start && x.at <= end),
          frames: perf.frames.filter(x => x.at >= start && x.at <= end + 40), longTasks: perf.longTasks.filter(x => x.at >= start && x.at <= end) };
      };
    });
    const actions = [];
    for (const action of ['cold-entry', 'battle-return', 'hot-scene-rebuild', 'ordinary-refreshes']) {
      actions.push(await bench.evaluate(action => window.__benchAction(action), action));
      const state = await bench.evaluate(() => window.fixture.inspect());
      verify(state, `performance ${rate}x trial ${trial} ${action}`);
      assert.equal(state.cards.length, 3, 'performance comparison must retain all three complete cards');
      assert.equal(state.drawer.ids.length, 0, 'performance comparison must retain the same map-visible content');
    }
    const clickStart = await bench.evaluate(() => performance.now());
    for (let i = 0; i < 15; i++) await bench.mouse.click(160, 475);
    await bench.waitForTimeout(100);
    actions.push(await bench.evaluate(start => { const end = performance.now(), perf = window.__placementPerf; return { action: 'native-city-clicks', start, end, duration: end - start,
      clickCount: window.fixture.inspect().fixture.cityClicks.length, renderSpans: perf.renderSpans.filter(x => x.at >= start && x.at <= end),
      updates: perf.updates.filter(x => x.at >= start && x.at <= end), frames: perf.frames.filter(x => x.at >= start && x.at <= end), longTasks: perf.longTasks.filter(x => x.at >= start && x.at <= end) }; }, clickStart));
    assert.equal(actions.at(-1).clickCount, 15, 'all performance-trial native clicks must reach the city');
    assert.deepEqual(trialErrors, [], 'performance trial must not hide runtime errors');
    report.performance.trials.push({ cpuRate: rate, trial, startup, actions });
    console.log(`performance ${rate}x trial ${trial}: ` + actions.map(action => `${action.action}=${action.duration.toFixed(1)}ms / maxRAF=${Math.max(0,...action.frames.map(x=>x.gap)).toFixed(1)}ms`).join(', '));
    await bench.close();
  }
  const summary = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return { min: sorted[0] || 0,
    median: sorted[Math.floor(sorted.length / 2)] || 0, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0, max: sorted.at(-1) || 0 }; };
  report.performance.summary = [1, 6].flatMap(cpuRate => ['cold-entry', 'battle-return', 'hot-scene-rebuild', 'ordinary-refreshes', 'native-city-clicks'].map(action => {
    const rows = report.performance.trials.filter(trial => trial.cpuRate === cpuRate).map(trial => trial.actions.find(row => row.action === action));
    return { cpuRate, action, durationMs: summary(rows.map(row => row.duration)), rendererSpanMs: summary(rows.flatMap(row => row.renderSpans.map(span => span.duration))),
      nativeTypesetMs: summary(rows.map(row => row.totalTypesetMs || 0)),
      nonTypesetRendererMs: summary(rows.flatMap(row => row.renderSpans.map(span => span.duration - span.typesetMs))),
      refreshMs: summary(rows.flatMap(row => row.updates.map(update => update.duration))), maxRafGapMs: summary(rows.map(row => Math.max(0,...row.frames.map(frame => frame.gap)))),
      preUpdateMs: summary(rows.map(row => row.preUpdateMs)),
      updateWindowMaxRafGapMs: summary(rows.map(row => Math.max(0,...(row.updateWindowFrames || []).map(frame => frame.gap)))),
      instrumented: Object.fromEntries(['geometryMs', 'measureMs', 'solveMs', 'renderMs', 'workMs', 'elapsedMs', 'slices', 'maxSliceMs']
        .map(key => [key, summary(rows.map(row => row.rendererPerformance?.last?.[key]))])),
      longTaskCount: rows.reduce((n, row) => n + row.longTasks.length, 0), maxLongTaskMs: Math.max(0,...rows.flatMap(row => row.longTasks.map(task => task.duration))) };
  }));
}
function rectangle(value) {
  if (!value) return null; const r = value.rect || value.bounds || value;
  const x = r.x ?? r.left, y = r.y ?? r.top, w = r.w ?? r.width ?? r.right - x, h = r.h ?? r.height ?? r.bottom - y;
  return [x, y, w, h].every(Number.isFinite) ? { x, y, w, h } : null;
}
function inside(a, b, epsilon = .6) { return a.x >= b.x - epsilon && a.y >= b.y - epsilon && a.x + a.w <= b.x + b.w + epsilon && a.y + a.h <= b.y + b.h + epsilon; }
function overlap(a, b) { return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .5; }
function uiOcclusions(state) {
  return state.cards.flatMap(card => state.geometry.controls.flatMap((control, controlIndex) => {
    const box = intersection(card, control); return box.w > .5 && box.h > .5
      ? [{ id: card.id, controlIndex, area: box.w * box.h, cardFraction: box.w * box.h / (card.w * card.h), rect: box }] : [];
  }));
}
function aboveOwn(card, node) { return card.y + card.h <= node.anchor.y + .6 && Math.min(card.x + card.w, node.anchor.x + node.anchor.w) > Math.max(card.x, node.anchor.x); }
function ownOverlay(card, anchor) { const area = intersection(card, anchor); return area.w > 0 && area.h > 0
  && Math.abs(card.x + card.w / 2 - anchor.x - anchor.w / 2) <= anchor.w / 4 + 1e-6
  && Math.abs(card.y + card.h / 2 - anchor.y - anchor.h / 2) <= anchor.h / 4 + 1e-6
  && area.w * area.h >= .5 * Math.min(card.w * card.h, anchor.w * anchor.h) - 1e-6; }
function distance(a, b) { return Math.hypot(Math.max(a.x - b.x - b.w, b.x - a.x - a.w, 0), Math.max(a.y - b.y - b.h, b.y - a.y - a.h, 0)); }
function intersection(a, b) { return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y),
  w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) }; }
function verifyOfficialDom(state, name) {
  const dom = state.fixture.dom, config = state.fixture.config;
  assert.equal(dom.html.h, 0, `${name}: html must keep the official zero-height DOM shape`);
  assert.equal(dom.body.h, 0, `${name}: body must keep the official zero-height DOM shape`);
  assert.equal(dom.container.h, 0, `${name}: layaContainer must not acquire a synthetic height`);
  assert.equal(dom.canvasPosition, 'absolute', `${name}: Laya canvas remains absolutely positioned`);
  assert.equal(dom.bodyOverflow, 'hidden', `${name}: native body overflow propagation is exercised`);
  assert(dom.canvas.w > 0 && dom.canvas.h > 0, `${name}: native canvas must actually be visible`);
  let clip = intersection(dom.canvas, { x: 0, y: 0, w: config.screenWidth || config.width, h: config.screenHeight || config.height });
  if (dom.clip) clip = intersection(clip, dom.clip);
  assert(clip.w > 0 && clip.h > 0, `${name}: test requires a real visible canvas region`);
  // These scenarios deliberately have no native scale/pivot/scrollRect. Derive
  // the expected local viewport directly from DOM pixels, independently of the
  // production placementRectToClient helper.
  const sx = dom.canvas.w / config.width, sy = dom.canvas.h / config.height;
  const expected = { x: (clip.x - dom.canvas.x) / sx - config.width / 2,
    y: (clip.y - dom.canvas.y) / sy - config.height / 2, w: clip.w / sx, h: clip.h / sy };
  const actual = rectangle(state.geometry?.viewport);
  assert(actual, `${name}: visible native canvas must yield a viewport`);
  for (const k of ['x', 'y', 'w', 'h']) assert(Math.abs(actual[k] - expected[k]) < .65,
    `${name}: ${k} must follow actual canvas/DOM clipping (${actual[k]} vs ${expected[k]})`);
  for (const card of state.cards) {
    const client = { x: dom.canvas.x + (card.x + config.width / 2) * sx,
      y: dom.canvas.y + (card.y + config.height / 2) * sy, w: card.w * sx, h: card.h * sy };
    assert(inside(client, clip), `${name}: card ${card.id} must be visible in real browser pixels`);
  }
}
function verify(state, name) {
  // A 250ms no-op refresh can become scheduled between browser RPCs. Its
  // pending flag does not make the already committed ready layout unfinished.
  assert.notEqual(state.status?.state, 'placing', `${name}: assertions require a completed layout job`);
  assert.deepEqual(state.fixture.reportedErrors, [], `${name}: renderer errors`);
  const viewport = rectangle(state.geometry?.viewport);
  const cards = (state.cards || []).map(card => ({ id: card.id, ...rectangle(card) }));
  assert.deepEqual(state.fixture.mountedCards.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })).sort((a, b) => a.id - b.id), [...cards].sort((a, b) => a.id - b.id),
    `${name}: inspected placement must match the actual mounted native Sprite sizes and coordinates`);
  if (cards.length) assert(viewport, `${name}: viewport must be explicit`);
  for (const card of cards) {
    assert(inside(card, viewport), `${name}: card ${card.id} outside viewport`);
    const own = state.geometry.nodes.find(node => String(node.id) === String(card.id)); assert(own, `${name}: missing explicit owner`);
    const ownDistance = distance(card, rectangle(own.anchor));
    const permittedOwnOverlay = ownOverlay(card, own.anchor);
    if (permittedOwnOverlay) {
      const line = state.lastLayout.placements.find(placement => String(placement.id) === String(card.id)).line;
      assert(Math.abs(line.fromX - line.toX) < 1e-6 && Math.abs(line.fromY - line.toY) < 1e-6, `${name}: valid own-overlay requires a zero-length connector`);
    }
    for (const node of state.geometry.nodes) {
      for (const region of node.regions) if (!(permittedOwnOverlay && String(node.id) === String(card.id)))
        assert(!overlap(card, rectangle(region)), `${name}: card ${card.id} covers another city or has an invalid own overlay`);
      if (String(node.id) !== String(card.id)) assert(ownDistance < distance(card, rectangle(node.anchor)), `${name}: card ${card.id} visually closer to city ${node.id}`);
    }
    // Native UI is now a soft preference. Preserve the overlap as evidence;
    // viewport, city ownership, city regions and card/card overlap stay hard.
    if (state.fixture.config.screenshotContent && report.cardWidthMeasurements) {
      const measured = report.cardWidthMeasurements.find(row => row.id === card.id)?.sizes.find(size => size.w === card.w);
      assert(measured && measured.h === card.h, `${name}: final Sprite uses exact full-content measured dimensions`);
      const texts = state.fixture.nativeTexts.filter(text => text.id === card.id && !text.iconFallback);
      const semantic = report.expectedCards.find(row => row.id === card.id);
      const expected = semantic.visibleRows || semantic.rows;
      const actual = state.fixture.mountedCards.find(row => row.id === card.id);
      assert.equal(actual.accessibleText, semantic.accessibleText, `${name}: all original semantic lines remain available`);
      assert.deepEqual(actual.iconLabels, semantic.iconLabels, `${name}: every rendered icon retains its complete Chinese meaning`);
      assert.deepEqual(texts.map(text => text.text), expected.map(row => row.text), `${name}: all quantities, names and reward qualifications remain visibly rendered`);
      for (const [index, text] of texts.entries()) {
        assert.equal(text.font, 'Microsoft YaHei'); assert.equal(text.fontSize, expected[index].fontSize);
        assert.equal(text.leading, 4); assert(text.height >= text.textHeight);
        assert.equal(text.alpha, 1); assert.equal(text.parentAlpha, 1); assert.equal(text.mouseEnabled, false);
        assert(inside({ x: text.x, y: text.y, w: text.width, h: text.height }, { x: 0, y: 0, w: card.w, h: card.h }), `${name}: text stays inside its measured card`);
      }
    }
  }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert(!overlap(cards[i], cards[j]), `${name}: cards overlap`);
  assert(state.fixture.overlays <= 1, `${name}: duplicate overlays`);
  const drawer = rectangle(state.drawer?.rect);
  if (drawer && viewport) {
    assert(inside(drawer, viewport), `${name}: drawer outside viewport`);
    for (const card of cards) assert(!overlap(card, drawer), `${name}: interactive drawer/header remains a hard obstacle`);
  }
  if (viewport) assert.deepEqual([...cards.map(card => card.id), ...(state.drawer?.ids || [])].sort((a, b) => a - b), [...state.fixture.sourceIds].sort((a, b) => a - b), `${name}: every complete card retains its exact owner id`);
  return { name, viewport, cards, drawer: state.drawer, geometry: state.geometry, layout: state.lastLayout, uiOcclusions: uiOcclusions(state), fixture: state.fixture };
}
try {
  const executablePath = process.env.SGS_BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  if (performanceOnly) {
    await runPerformanceChecks(); report.passed = true;
  } else {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  await page.route('**/*', route => {
    const url = route.request().url(); if (url.startsWith(base) || /^(data:|blob:)/.test(url)) return route.continue();
    report.blockedRequests.push(url); return route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => window.fixtureReady);
  async function screenshot(name) { const file = `${name}.png`; await page.screenshot({ path: path.join(output, file), animations: 'disabled' }); report.screenshots.push(file); }
  async function scenario(name, config) {
    await page.setViewportSize({ width: config.screenWidth || config.width || 1200, height: config.screenHeight || config.height || 800 });
    const state = await page.evaluate(options => window.fixture.configure(options), config); report.scenarios.push(verify(state, name)); await screenshot(name); return state;
  }
  async function cancellationScenarios() {
    const main = { width: 1299, height: 739, screenshotContent: true, screenshotDistribution: true,
      officialTextures: true, screenshotNativeControls: true };
    await page.setViewportSize({ width: main.width, height: main.height });
    const pending = await page.evaluate(options => window.fixture.configure({ ...options, deferLayoutWait: true }), main);
    assert(pending.pending, 'clear interruption requires an actual queued layout');
    await page.evaluate(() => window.fixture.beginEnabled(false));
    await page.waitForTimeout(120);
    const cleared = await page.evaluate(() => window.fixture.inspect());
    assert.equal(cleared.fixture.overlays, 0); assert.equal(cleared.cards.length, 0);
    assert.equal(cleared.status.state, 'inactive'); assert(!cleared.pending);
    const restored = await page.evaluate(async () => { window.fixture.beginEnabled(true); return window.fixture.waitForLayout(); });
    report.scenarios.push(verify(restored, 'async-clear-cancels-unfinished-layout')); await screenshot('async-clear-cancels-unfinished-layout');
    assert.equal(restored.cards.length, 3); assert(restored.performance.cancelledJobs >= 1);
    const stateA = restored;
    await page.evaluate(() => window.fixture.beginResize(1180, 680));
    await page.waitForFunction(() => window.fixture.inspect().status.state === 'placing');
    const stateB = await page.evaluate(() => window.fixture.inspect());
    assert(stateB.pending && stateB.cards.length === 0, 'B must be computing with the previous overlay removed');
    const returnedA = await page.evaluate(async () => { window.fixture.beginResize(1299, 739); return window.fixture.waitForLayout(); });
    report.scenarios.push(verify(returnedA, 'async-viewport-a-b-a-rebuilds-overlay')); await screenshot('async-viewport-a-b-a-rebuilds-overlay');
    assert.equal(returnedA.cards.length, 3); assert.equal(returnedA.fixture.overlays, 1);
    assert.deepEqual(returnedA.cards, stateA.cards, 'returning to original viewport restores its complete layout');
    assert(returnedA.performance.cancelledJobs > stateB.performance.cancelledJobs, 'unfinished B must be cancelled');
    await page.waitForTimeout(100);
    assert.deepEqual((await page.evaluate(() => window.fixture.inspect())).cards, returnedA.cards, 'stale B callbacks cannot replace A');
    await page.evaluate(() => window.fixture.configure({ width: 1200, height: 800, count: 3, late: true, reuseRenderer: true, deferLayoutWait: true }));
    const replaced = await page.evaluate(options => window.fixture.configure({ ...options, reuseRenderer: true }), main);
    report.scenarios.push(verify(replaced, 'async-scene-replacement-discards-old-job')); await screenshot('async-scene-replacement-discards-old-job');
    assert.equal(replaced.cards.length, 3); assert.equal(replaced.fixture.overlays, 1);
    const afterOldComplete = await page.evaluate(() => window.fixture.emitRetiredComplete());
    assert.deepEqual(afterOldComplete.cards, replaced.cards, 'late COMPLETE from retired scene cannot republish it');
    assert.equal(afterOldComplete.revision, replaced.revision, 'retired callback cannot restart current layout');
  }
  if (!process.argv.includes('--measure-card-widths-only')) await cancellationScenarios();
  async function exceptionScenario(kind) {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.evaluate(() => window.fixture.configure({ width: 1200, height: 800, count: 3,
      positions: [{ x: 150, y: 300 }, { x: 440, y: 300 }, { x: 730, y: 300 }] }));
    const observed = await page.evaluate(async faultKind => {
      const L = window.Laya;
      const OriginalSprite = L.Sprite, originalTypeset = L.Text.prototype.typeset;
      const ownWidthDescriptor = Object.getOwnPropertyDescriptor(L.Text.prototype, 'width');
      let widthOwner = L.Text.prototype;
      while (widthOwner && !Object.getOwnPropertyDescriptor(widthOwner, 'width')) widthOwner = Object.getPrototypeOf(widthOwner);
      const widthDescriptor = Object.getOwnPropertyDescriptor(widthOwner, 'width');
      const restoreWidth = () => { if (ownWidthDescriptor) Object.defineProperty(L.Text.prototype, 'width', ownWidthDescriptor);
        else delete L.Text.prototype.width; };
      const created = [], ownedAtFault = new Set();
      const locate = (parent, name) => {
        if (parent.name === name) return parent;
        for (let i = 0; i < parent.numChildren; i++) { const found = locate(parent.getChildAt(i), name); if (found) return found; }
        return null;
      };
      const host = locate(L.stage, 'RogueSmallMapScene'), originalAdd = host.addChild;
      const collect = sprite => {
        if (!sprite || ownedAtFault.has(sprite)) return;
        ownedAtFault.add(sprite);
        for (let i = 0; i < sprite.numChildren; i++) collect(sprite.getChildAt(i));
      };
      let armed = true, lineCalls = 0;
      const fail = extra => {
        armed = false; created.forEach(collect); collect(extra);
        throw new Error(`placement-v2 injected ${faultKind} failure`);
      };
      L.Sprite = function (...args) {
        const sprite = new OriginalSprite(...args); created.push(sprite);
        if (faultKind === 'drawLine') {
          const drawLine = sprite.graphics.drawLine;
          sprite.graphics.drawLine = function (...lineArgs) {
            // Fail after one child is attached, exercising recursive cleanup of
            // an unattached overlay as well as still-unattached sibling cards.
            if (armed && sprite.name === 'sgs-shanhetu-label-content-v2' && ++lineCalls === 2) fail(sprite);
            return Reflect.apply(drawLine, this, lineArgs);
          };
        }
        return sprite;
      };
      L.Sprite.prototype = OriginalSprite.prototype;
      if (faultKind === 'typeset' || faultKind === 'measure-probe-typeset') L.Text.prototype.typeset = function (...args) {
        if (armed && (faultKind === 'typeset' ? this.text?.includes('青州') : !this.parent && this.text?.includes('测量异常探针'))) fail(this);
        return Reflect.apply(originalTypeset, this, args);
      };
      if (faultKind === 'text-width-setter') Object.defineProperty(L.Text.prototype, 'width', {
        configurable: true, get() { return Reflect.apply(widthDescriptor.get, this, []); },
        set(value) { if (armed && value > 0 && /^shanhe-card-\d+$/.test(this.parent?.name || '')) fail(this);
          return Reflect.apply(widthDescriptor.set, this, [value]); },
      });
      if (faultKind === 'scene.addChild') host.addChild = function (child, ...args) {
        if (armed && child?.name === 'sgs-shanhetu-labels-v2') fail(child);
        return Reflect.apply(originalAdd, this, [child, ...args]);
      };
      try {
        // The new renderer fails inside a scheduled slice. Observe that exact
        // completion before the periodic retry can hide an owned resource.
        const themeUpdate = faultKind === 'measure-probe-typeset' ? Promise.resolve(window.fixture.invalidateContent()) : window.fixture.theme('light');
        const failureStart = performance.now();
        while (armed && performance.now() - failureStart < 3000) await new Promise(requestAnimationFrame);
        const failed = window.fixture.inspect();
        const afterFailure = {
          injected: !armed, overlays: failed.fixture.overlays, drawers: document.querySelectorAll('.sgs-shanhetu-drawer-v2').length,
          created: created.length, trackedAtFault: ownedAtFault.size,
          allCreatedDestroyed: created.every(sprite => sprite.destroyed),
          allFaultOwnedDestroyed: [...ownedAtFault].every(sprite => sprite.destroyed),
          errors: [...failed.fixture.reportedErrors],
          nativeCities: failed.fixture.nativeCityStates,
        };
        L.Text.prototype.typeset = originalTypeset; host.addChild = originalAdd; restoreWidth();
        await themeUpdate;
        const recovered = await window.fixture.repeat(2);
        const orphansAfterRecovery = created.filter(sprite => !sprite.destroyed && !sprite.parent)
          .map(sprite => ({ name: sprite.name, children: sprite.numChildren }));
        const disposed = await window.fixture.dispose();
        return { afterFailure, recovered, orphansAfterRecovery, disposed,
          trackedSprites: created.length, allTrackedDestroyedAfterDispose: created.every(sprite => sprite.destroyed) };
      } finally {
        L.Sprite = OriginalSprite; L.Text.prototype.typeset = originalTypeset; host.addChild = originalAdd; restoreWidth();
        await window.fixture.dispose();
      }
    }, kind);
    const name = `exception-recovery-${kind.replaceAll('.', '-')}`;
    assert(observed.afterFailure.injected, `${name}: failure must actually be injected`);
    assert(observed.afterFailure.trackedAtFault > 0 && (kind === 'measure-probe-typeset' || observed.afterFailure.created > 0), `${name}: fault must own native resources`);
    assert.equal(observed.afterFailure.overlays, 0, `${name}: failed overlay is removed`);
    assert.equal(observed.afterFailure.drawers, 0, `${name}: failed drawer is removed`);
    assert(observed.afterFailure.allCreatedDestroyed && observed.afterFailure.allFaultOwnedDestroyed,
      `${name}: every half-built sprite and text must be destroyed before retry`);
    assert(observed.afterFailure.nativeCities.length >= 3 && observed.afterFailure.nativeCities.every(city => !city.destroyed), `${name}: native city nodes survive renderer failure`);
    assert.equal(observed.afterFailure.errors.length, 1, `${name}: exactly the injected error is reported`);
    assert(observed.afterFailure.errors[0].includes(`placement-v2 injected ${kind} failure`), `${name}: original error remains inspectable`);
    assert.equal(observed.recovered.fixture.reportedErrors.length, 0, `${name}: successful recovery clears its current error`);
    const recordedErrors = observed.recovered.fixture.errorHistory.filter(value => value !== null);
    assert.equal(recordedErrors.length, 1, `${name}: recovery must not produce additional errors`);
    assert(recordedErrors[0].includes(`placement-v2 injected ${kind} failure`), `${name}: history preserves the original error`);
    assert.equal(observed.recovered.fixture.overlays, 1, `${name}: recovery creates exactly one overlay`);
    assert.equal(observed.recovered.cards.length, 3, `${name}: all complete cards recover`);
    assert.deepEqual(observed.orphansAfterRecovery, [], `${name}: retry must not leave native orphans`);
    assert.deepEqual(observed.disposed, { overlays: 0, drawers: 0, themeListeners: 0 }, `${name}: dispose releases all owned resources`);
    assert(observed.allTrackedDestroyedAfterDispose, `${name}: all created native sprites are destroyed after dispose`);
    const cleanRecovery = { ...observed.recovered, fixture: { ...observed.recovered.fixture, reportedErrors: [] } };
    report.scenarios.push({ ...verify(cleanRecovery, name), injectedFailure: observed.afterFailure,
      trackedSprites: observed.trackedSprites, disposed: observed.disposed,
      allTrackedDestroyedAfterDispose: observed.allTrackedDestroyedAfterDispose });
  }
  async function abovePriorityScenarios() {
    const state = await scenario('above-native-ui-layer-and-click-through', { width: 900, height: 650, count: 1,
      positions: [{ x: 400, y: 350 }], aboveControls: true });
    assert.equal(state.cards.length, 1);
    assert(aboveOwn(state.cards[0], state.geometry.nodes[0]), 'a real UI button above the owner must not send its card below');
    assert(uiOcclusions(state).length >= 2, 'the test must actually overlap both Sprite and flat native buttons');
    const samples = [{ x: 405, y: 255 }, { x: 490, y: 255 }];
    for (const p of samples) assert(inside({ x: p.x - 450, y: p.y - 325, w: 1, h: 1 }, state.cards[0]), 'pixel probe must be inside the actual card');
    const pixels = async () => {
      const values = [];
      for (const { x, y } of samples) {
        const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, animations: 'disabled' });
        assert.equal(png.readUInt32BE(16), 1); assert.equal(png.readUInt32BE(20), 1); assert.equal(png[24], 8);
        assert([2, 6].includes(png[25]), 'pixel probe expects RGB or RGBA PNG');
        const chunks = [];
        for (let offset = 8; offset < png.length;) { const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
          if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length)); offset += length + 12; }
        // A single pixel has no left/up neighbours, so every PNG filter uses
        // a zero predictor. This reads compositor pixels even with WebGL.
        const row = inflateSync(Buffer.concat(chunks)), rgba = [...row.subarray(1, png[25] === 6 ? 5 : 4)];
        if (rgba.length === 3) rgba.push(255); values.push(rgba);
      }
      return values;
    };
    const withCards = await pixels(); await page.evaluate(() => window.fixture.overlayVisible(false)); const onlyNativeUI = await pixels();
    await page.evaluate(() => window.fixture.overlayVisible(true));
    report.aboveLayerProbe = { samples, withCards, onlyNativeUI };
    for (let i = 0; i < samples.length; i++) assert.notDeepEqual(withCards[i], onlyNativeUI[i], 'the floating card must draw above the native UI it may overlap');
    await page.mouse.click(438, 266); await page.mouse.click(523, 266);
    let clicked = await page.evaluate(() => window.fixture.inspect());
    assert.equal(clicked.fixture.buttonCounts.aboveControl, 1, 'overlapped native Sprite button still receives exactly one click');
    assert.equal(clicked.fixture.buttonCounts.helpBtn, 1, 'overlapped native flat button still receives exactly one click');
    assert.deepEqual(clicked.cards, state.cards, 'clicking through the overlay keeps placement stable');
    clicked = await page.evaluate(() => window.fixture.repeat(12)); assert.deepEqual(clicked.cards, state.cards, 'repeated refresh keeps the above placement stable');
    for (const [name, config] of [
      ['above-crowded-wide-dark', { width: 1000, height: 650, positions: [{ x: 200, y: 350 }, { x: 400, y: 350 }, { x: 600, y: 350 }] }],
      ['above-crowded-narrow-light', { width: 700, height: 600, theme: 'light', positions: [{ x: 120, y: 330 }, { x: 320, y: 330 }, { x: 520, y: 330 }] }],
    ]) {
      const crowded = await scenario(name, { count: 3, ...config });
      assert.equal(crowded.cards.length, 3, `${name}: all complete cards fit`);
      for (const card of crowded.cards) assert(aboveOwn(card, crowded.geometry.nodes.find(node => node.id === card.id)), `${name}: jointly arranged cards remain above their own city`);
      assert.deepEqual((await page.evaluate(() => window.fixture.repeat(12))).cards, crowded.cards, `${name}: joint arrangement is stable`);
    }
    const covered = await scenario('own-city-overlay-when-above-unavailable', { width: 600, height: 400, screenshotContent: true,
      onlySourceId: 5028, ownOverlayCase: true, positions: [{ x: 240, y: 30 }] });
    assert.equal(covered.cards.length, 1);
    assert(ownOverlay(covered.cards[0], covered.geometry.nodes[0].anchor), 'when above has insufficient space, card may cover its own city with the independent anchor/area criteria');
    assert.equal(covered.fixture.cardSurfaces.length, 1); assert.equal(covered.fixture.cardSurfaces[0].alpha, .88);
    await page.mouse.click(300, 80);
    const coveredClick = await page.evaluate(() => window.fixture.inspect());
    assert.deepEqual(coveredClick.fixture.cityClicks, [5028], 'own-overlay remains transparent to clicking its actual city');
    assert.deepEqual(coveredClick.cards, covered.cards, 'clicking through own-overlay keeps placement stable');
    const unresolved = await scenario('unresolved-native-control-keeps-complete-card', { width: 900, height: 650, count: 1,
      positions: [{ x: 400, y: 350 }], unresolvedControl: true });
    assert.equal(unresolved.geometry.ready, true); assert.equal(unresolved.geometry.reason, 'ready-with-unresolved-controls');
    assert.equal(unresolved.geometry.controlsComplete, false); assert.equal(unresolved.geometry.diagnostics.controlPendingCount, 1);
    assert.equal(unresolved.geometry.diagnostics.cityPendingCount, 0); assert.equal(unresolved.cards.length, 1);
    assert(aboveOwn(unresolved.cards[0], unresolved.geometry.nodes[0]));
    const resolved = await page.evaluate(() => window.fixture.resolveControl());
    report.scenarios.push(verify(resolved, 'resolved-native-control-updates-soft-coverage')); await screenshot('resolved-native-control-updates-soft-coverage');
    assert.equal(resolved.geometry.ready, true); assert.equal(resolved.geometry.controlsComplete, true);
    assert.equal(resolved.geometry.diagnostics.controlPendingCount, 0); assert.equal(resolved.cards.length, 1);
    assert(resolved.geometry.controls.length > unresolved.geometry.controls.length, 'late control geometry must join soft coverage after COMPLETE');
  }
  if (!process.argv.includes('--measure-card-widths-only')) await abovePriorityScenarios();
  if (!process.argv.includes('--above-probe-only')) {
  const screenshotMeasurements = [];
  for (const id of [5026, 5027, 5028]) {
    const measured = await scenario(`official-content-measure-${id}`, { width: 1220, height: 732, screenshotContent: true, onlySourceId: id,
      positions: [{ x: 500, y: 300 }] });
    assert.equal(measured.geometry.ready, true, `content ${id}: measurement requires ready native geometry`);
    assert.equal(measured.cards.length, 1, `content ${id}: isolated complete card must be measurable`);
    screenshotMeasurements.push({ id, w: measured.cards[0].w, h: measured.cards[0].h, lines: measured.fixture.nativeTexts });
  }
  report.expectedCards = await page.evaluate(() => window.fixture.expectedCards());
  const runtimeMeasurements = [];
  for (const id of [5026, 5027, 5028]) {
    const measured = await page.evaluate(id => window.fixture.configure({ width: 600, height: 400, screenshotContent: true,
      onlySourceId: id, variantCorridor: true, positions: [{ x: 260, y: 320 }] }), id);
    const record = measured.measuredCards.find(card => card.id === id);
    assert(record?.alternatives?.length, 'the hard city corridor must force real production width measurements');
    runtimeMeasurements.push({ id, sizes: [{ w: record.w, h: record.h }, ...record.alternatives].sort((a, b) => a.w - b.w) });
  }
  report.cardWidthMeasurements = runtimeMeasurements;
  for (const measured of screenshotMeasurements) {
    const baseline = report.cardWidthMeasurements.find(row => row.id === measured.id).sizes.find(size => size.w === 220);
    assert.equal(baseline.h, measured.h, 'runtime alternative measurement must match the actual isolated default Sprite');
  }
  console.log('固定字号完整内容候选宽高：' + JSON.stringify(report.cardWidthMeasurements.map(row => ({ id: row.id, sizes: row.sizes.map(({ w, h }) => [w, h]) }))));
  if (!process.argv.includes('--measure-card-widths-only')) {
  report.screenshotReproduction = { provenance: 'Exact three content models from the user screenshot, eight city positions from official hd_roguelike Root.Level 5021..5028, and original official city PNGs with hash/size provenance. This is a synthetic Laya scene; native control rectangles remain explicit approximations, not an official runtime capture.',
    measuredCards: screenshotMeasurements, nativeTransition: 'Original cached a8t.ShowBossIcon method, invoked only on fixture Laya Sprites; no official constructor or client bootstrap.' };
  const reproduction = await scenario('official-content-screenshot-distribution', { width: 1220, height: 732, screenWidth: 1952, screenHeight: 1172,
    screenshotContent: true, screenshotDistribution: true, officialTextures: true, canvasCss: { scaleX: 1.6, scaleY: 1.6 } });
  verifyOfficialDom(reproduction, 'official-content-screenshot-distribution');
  assert.equal(reproduction.geometry.ready, true, 'screenshot distribution uses resolved native geometry');
  assert.equal(reproduction.geometry.nodes.length, 8, 'all five visible passive cities remain protected');
  assert.equal(reproduction.cards.length, 3, 'original official city assets must keep all three complete cards on the map');
  assert.deepEqual(reproduction.drawer.ids, [], 'the former all-or-one drawer regression must be solved without discarding content');
  report.screenshotReproduction.result = { geometryReason: reproduction.geometry.reason, status: reproduction.status,
    cards: reproduction.cards, drawer: reproduction.drawer };
  const bossFinished = await page.evaluate(() => window.fixture.finishBossAppearance());
  report.scenarios.push(verify(bossFinished, 'official-content-empty-boss-after-appearance')); await screenshot('official-content-empty-boss-after-appearance');
  const boss = bossFinished.fixture.nativeCityStates.find(item => item.id === 5028);
  assert.equal(boss.eventtypeVisible, true, 'original ShowBossIcon makes the empty boss Sprite visible');
  assert.equal(boss.eventtypeWidth, 0); assert.equal(boss.eventtypeHeight, 0); assert.equal(boss.eventtypeTexture, false);
  assert.equal(boss.citynameVisible, '', 'Laya preserves the official empty-string visible value');
  if (!process.argv.includes('--capture-boss-before-fix')) {
    assert.equal(bossFinished.geometry.ready, true, 'empty native boss Sprite must not block placement');
    assert.deepEqual(bossFinished.cards, reproduction.cards, 'boss appearance completion must preserve every placed card');
  }
  const stable = await page.evaluate(() => window.fixture.repeat(12));
  assert.deepEqual(stable.cards, reproduction.cards, 'measured width choices remain stable across consecutive updates');
  // This fixture's extra CSS transform is applied after Laya computes its
  // internal mouse matrix. Restore identity for native pointer dispatch, then
  // restore CSS scaling after the input checks; geometry stays in native units.
  await page.evaluate(() => window.fixture.setDom({ canvasCss: null }));
  for (const id of [5026, 5027, 5028]) {
    const city = reproduction.geometry.nodes.find(node => node.id === id).anchor;
    await page.mouse.click(city.x + city.w / 2 + 610, city.y + city.h / 2 + 366);
  }
  const clicked = await page.evaluate(() => window.fixture.inspect());
  assert.deepEqual(clicked.fixture.cityClicks, [5026, 5027, 5028], 'complete cards must leave the three real city click targets reachable');
  assert.deepEqual(clicked.cards, reproduction.cards, 'native city clicks do not churn measured card widths');
  await page.evaluate(() => window.fixture.setDom({ canvasCss: { scaleX: 1.6, scaleY: 1.6 } }));
  await page.evaluate(() => window.fixture.enabled(false));
  const returned = await page.evaluate(() => window.fixture.enabled(true));
  assert.deepEqual(returned.cards, reproduction.cards, 'returning from the battle surface restores the same complete cards');
  report.scenarios.push(verify(returned, 'official-assets-battle-return')); await screenshot('official-assets-battle-return');
  for (const [name, options] of [
    ['official-coordinate-116x90-regression', { width: 1220, height: 732 }],
    ['official-assets-wide-dark', { width: 1299, height: 739, screenWidth: 2144, screenHeight: 1220, officialTextures: true, canvasCss: { scaleX: 1.65, scaleY: 1.65 } }],
    ['official-assets-wide-light', { width: 1299, height: 739, screenWidth: 2144, screenHeight: 1220, officialTextures: true, theme: 'light', canvasCss: { scaleX: 1.65, scaleY: 1.65 } }],
    ['official-assets-avatar-raid-dark', { width: 1299, height: 739, screenWidth: 2144, screenHeight: 1220,
      officialTextures: true, screenshotNativeControls: true, canvasCss: { scaleX: 1.65, scaleY: 1.65 } }],
    ['official-assets-avatar-raid-light', { width: 1299, height: 739, screenWidth: 2144, screenHeight: 1220,
      officialTextures: true, screenshotNativeControls: true, theme: 'light', canvasCss: { scaleX: 1.65, scaleY: 1.65 } }],
    ['official-assets-narrow-light', { width: 1220, height: 732, officialTextures: true, theme: 'light' }],
  ]) {
    const caseState = await scenario(name, { screenshotContent: true, screenshotDistribution: true, ...options });
    assert.equal(caseState.geometry.ready, true, `${name}: native geometry ready`);
    assert.equal(caseState.cards.length, 3, `${name}: all three complete cards remain on the map`);
    assert.deepEqual(caseState.drawer.ids, [], `${name}: no unnecessary drawer`);
    if (options.screenshotNativeControls) {
      const d = options.width / 1220, boss = caseState.geometry.nodes.find(node => node.id === 5028).anchor;
      const raidX = -264 * d | 0, raidY = 102 * d | 0;
      const expectedControls = [
        { x: boss.x + (boss.w >> 1) - 28, y: Math.max(20 - (options.height >> 1), boss.y - 73), w: 56, h: 73 },
        { x: raidX, y: raidY, w: 86 * d, h: 71 * d },
        { x: raidX - 10 * d, y: raidY - 25 * d, w: 152 * d, h: 107 * d },
        { x: raidX + 40 * d, y: raidY - 18 * d, w: 100 * d, h: 20 * d },
      ];
      assert.equal(caseState.geometry.controls.length, reproduction.geometry.controls.length + 4, `${name}: avatar and all three raid regions must be collected`);
      for (const expected of expectedControls) assert(caseState.geometry.controls.some(actual => ['x', 'y', 'w', 'h'].every(k => Math.abs(actual[k] - expected[k]) < 1e-6)),
        `${name}: native control geometry must match official placement and scaling formulas`);
      assert(caseState.caches?.iconTextures > 0, `${name}: actual local artwork must decode into native textures`);
      assert(!caseState.fixture.nativeTexts.some(text => text.iconFallback), `${name}: decoded icons replace temporary single-character fallbacks`);
      const accessible = await page.locator('section[aria-label="山河图地图节点信息"] p').allTextContents();
      assert.deepEqual(accessible, report.expectedCards.map(card => card.accessibleText), `${name}: screen reader text preserves complete original semantics`);
      const bossCard = caseState.cards.find(card => card.id === 5028);
      const hp = caseState.fixture.nativeTexts.find(text => text.id === 5028 && text.text === '6');
      const scale = options.canvasCss?.scaleX || 1;
      await page.mouse.move((bossCard.x + hp.x - 12 + options.width / 2) * scale,
        (bossCard.y + hp.y + 8 + options.height / 2) * scale);
      const tip = page.locator('.sgs-shanhetu-icon-tooltip');
      assert.equal(await tip.textContent(), '体力6', `${name}: native icon hover exposes its full Chinese meaning`);
      assert.equal(await tip.evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'icon tooltip never intercepts native input');
      await page.mouse.move(4, 4); assert(await tip.evaluate(element => element.hidden), 'moving away hides the icon tooltip');
    }
    assert.deepEqual((await page.evaluate(() => window.fixture.repeat(8))).cards, caseState.cards, `${name}: width/layout stability`);
  }
  for (const [w, h] of [[160, 120], [250, 200]]) {
    const scaled = await scenario(`official-content-city-bounds-${w}x${h}`, { width: 1220, height: 732,
      screenshotContent: true, screenshotDistribution: true, cityTextureSizes: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [5021 + i, { w, h }])) });
    assert.equal(scaled.geometry.ready, true, 'native texture sensitivity case must have ready geometry');
  }
  const sparseApproximation = await scenario('full-content-sparse-screen-approximation', { width: 1390, height: 796, screenWidth: 2085, screenHeight: 1194,
    screenshotContent: true, screenshotApproximation: true, canvasCss: { scaleX: 1.5, scaleY: 1.5 } });
  assert.equal(sparseApproximation.geometry.ready, true);
  assert.equal(sparseApproximation.cards.length, 3, 'known feasible sparse screen approximation must retain all three complete floating cards');
  assert.deepEqual(sparseApproximation.drawer.ids, []);
  const sparseFinished = await page.evaluate(() => window.fixture.finishBossAppearance());
  report.scenarios.push(verify(sparseFinished, 'full-content-sparse-empty-boss-after-appearance')); await screenshot('full-content-sparse-empty-boss-after-appearance');
  assert.equal(sparseFinished.geometry.ready, true); assert.deepEqual(sparseFinished.cards, sparseApproximation.cards);
  report.screenshotReproduction.sparseScreenApproximation = { provenance: 'Independent estimated screen rectangles from the supplied screenshot divided by assumed 1.5 scale; not an official runtime geometry capture.',
    cards: sparseFinished.cards, drawer: sparseFinished.drawer };
  console.log('截图内容测量：' + JSON.stringify({ cards: screenshotMeasurements.map(({ id, w, h }) => ({ id, w, h })),
    officialCoordinateModel: report.screenshotReproduction.result, sparseScreenModel: report.screenshotReproduction.sparseScreenApproximation.cards }));
  if (!process.argv.includes('--screenshot-repro-only')) {
  let state = await scenario('normal-dark', { count: 4 });
  verifyOfficialDom(state, 'normal-dark');
  for (const control of state.fixture.flatControls) {
    assert.equal(control.nativeClass, '$jt', 'shop/help must execute the original official flat-button prototype');
    assert(control.isFlatButton && !control.isSprite && !control.hasRenderWidth && control.renderIsSprite,
      'flat buttons must expose their real render/background contract without Sprite-only conveniences');
    assert(control.backgroundWidth > 0 && control.backgroundHeight > 0, 'original fO getters must supply rendered bounds');
  }
  assert.equal(state.geometry.ready, true, 'official flat buttons must not leave geometry pending forever');
  assert.equal(state.cards.length, 4, 'normal scene should keep all complete cards near nodes');
  const firstCards = state.cards; state = await page.evaluate(() => window.fixture.repeat()); assert.deepEqual(state.cards, firstCards, 'unchanged scene must keep card placement');
  await page.mouse.click(46, 106); assert.equal((await page.evaluate(() => window.fixture.inspect())).fixture.buttonCounts.shopBtn, 1, 'native shop click must work');
  await page.mouse.click(138, 106); assert.equal((await page.evaluate(() => window.fixture.inspect())).fixture.buttonCounts.helpBtn, 1, 'native help click must work');
  await page.mouse.click(1150, 766); assert.equal((await page.evaluate(() => window.fixture.inspect())).fixture.buttonCounts.btnRefine, 1, 'native bottom click must work');
  await page.mouse.click(1150, 666); assert.equal((await page.evaluate(() => window.fixture.inspect())).fixture.buttonCounts.changeIcon, 1, 'native change-general click must work');
  state = await page.evaluate(() => window.fixture.theme('light')); verify(state, 'live-theme-light'); await screenshot('normal-live-light');
  state = await page.evaluate(() => window.fixture.enabled(false)); assert.equal(state.fixture.overlays, 0, 'disable removes native overlay'); assert.equal(await page.locator('.sgs-shanhetu-drawer-v2').count(), 0, 'disable removes drawer');
  state = await page.evaluate(() => window.fixture.enabled(true)); verify(state, 'reenabled'); assert.equal(state.fixture.overlays, 1, 're-enable creates one native overlay');
  for (const [name, options] of [
    ['official-dom-css-scale-offset', { width: 1050, height: 700, count: 4, canvasCss: { scaleX: .82, scaleY: .86, left: -76, top: 39 } }],
    ['ordinary-div-overflow-clip', { width: 1200, height: 800, count: 4, domClip: { left: 70, top: 55, width: 960, height: 640 } }],
    ['ordinary-div-css-scale-offset', { width: 1200, height: 800, count: 4, domClip: { left: 40, top: 30, width: 900, height: 600 },
      canvasCss: { scaleX: .85, scaleY: .8, left: -110, top: -45 } }],
  ]) {
    state = await scenario(name, options); verifyOfficialDom(state, name);
    assert(state.cards.length > 0, `${name}: native cards must remain visible`);
  }
  await scenario('scale-pivot-clip', { width: 1050, height: 700, count: 4, transform: true, clip: true });
  await scenario('stage-scroll-origin', { width: 1050, height: 700, count: 4, stageClip: true });
  state = await scenario('upper-node-soft-head-preference', { width: 1000, height: 700, count: 1, positions: [{ x: 500, y: 210 }] });
  assert.equal(state.cards.length, 1, 'upper node retains its complete card');
  await scenario('adjacent-owner-regression', { width: 700, height: 400, count: 3, positions: [{ x: 413, y: 223 }, { x: 142, y: 197 }, { x: 276, y: 234 }] });
  state = await scenario('long-name-warning-passive-city', { width: 1200, height: 800, count: 3, longNames: true, passiveNode: true });
  assert(state.geometry.nodes.some(node => node.id === 99), 'visible HasEvent=false city must be protected');
  const allText = state.fixture.nativeTexts.map(text => text.text).join('\n') + state.fixture.mountedCards.map(card => card.accessibleText).join('\n') + await page.locator('.sgs-shanhetu-drawer-v2').allTextContents();
  assert(allText.includes('临淄东郊古城完整长标题验证地点'), 'full long city title retained');
  assert(allText.includes('谋略无双·夏侯元让完整长武将名称'), 'full long general name retained');
  assert(allText.includes('注意 · 贞烈'), 'priority warning fully retained');
  for (const text of state.fixture.nativeTexts) assert(text.height >= text.textHeight, 'measured native text must fit its assigned height');
  const beforeAnimation = state; state = await page.evaluate(() => window.fixture.animateDecoration());
  assert.equal(state.geometry.signature, beforeAnimation.geometry.signature, 'animated decoration must not inflate native geometry'); assert.deepEqual(state.cards, beforeAnimation.cards, 'animated decoration must not move cards');
  state = await page.evaluate(() => window.fixture.mutateNodes()); report.scenarios.push(verify(state, 'dynamic-remove-add-owner')); await screenshot('dynamic-remove-add-owner');
  assert(!state.geometry.nodes.some(node => node.id === 2) && state.geometry.nodes.some(node => node.id === 9), 'native node dictionary change reflected');
  state = await scenario('image-pending', { count: 3, late: true });
  state = await page.evaluate(() => window.fixture.lateImageReady()); report.scenarios.push(verify(state, 'image-ready')); await screenshot('image-ready');
  for (const drawerWidth of [248, 280, 420]) {
    state = await scenario(`dense-long-${drawerWidth}`, { width: 900, height: 520, count: 8, long: true, drawerWidth });
    const drawer = page.locator('.sgs-shanhetu-drawer-v2'), toggle = drawer.locator('[data-action="toggle"]'), body = drawer.locator('[data-role="body"]');
    assert.equal(await drawer.count(), 1, 'dense content must provide drawer');
    if (!state.drawer?.open) { await toggle.focus(); await toggle.press('Enter'); }
    state = await page.evaluate(() => window.fixture.waitForLayout()); verify(state, `drawer-open-${drawerWidth}`);
    assert(state.drawer.open, 'Enter opens drawer');
    const before = state.fixture.nativeClicks; const scrollBox = await body.boundingBox(); assert(scrollBox, 'drawer body visible');
    await page.mouse.move(scrollBox.x + Math.min(100, scrollBox.width / 2), scrollBox.y + Math.min(100, scrollBox.height / 2)); await page.mouse.wheel(0, 800); await page.waitForTimeout(100);
    assert(await body.evaluate(element => element.scrollHeight > element.clientHeight && element.scrollTop > 0), 'full long content must scroll');
    await body.click({ position: { x: 30, y: 40 } }); assert.equal((await page.evaluate(() => window.fixture.inspect())).fixture.nativeClicks, before, 'drawer clicks must not reach native canvas');
    assert(await drawer.locator('article[data-node-id]').count() > 0, 'drawer retains node identities');
    assert((await drawer.textContent()).includes('完整说明应保留换行，并在有限高度下允许滚动查看。'), 'complete event descriptions retained');
    await screenshot(`drawer-${drawerWidth}-scrolled`);
    await toggle.focus(); await toggle.press('Space'); assert.equal((await page.evaluate(() => window.fixture.waitForLayout())).drawer.open, false, 'Space closes drawer');
  }
  await scenario('low-height-light', { width: 780, height: 360, count: 6, long: true, theme: 'light', drawerWidth: 280 });
  for (const [width, height] of [[248, 180], [420, 140]]) {
    const name = `tiny-canvas-${width}x${height}`;
    state = await scenario(name, { width, height, count: 2, long: true });
    const header = await page.locator('.sgs-shanhetu-drawer-v2').evaluate(element => {
      const toggle = element.querySelector('[data-action="toggle"]'), body = element.querySelector('[data-role="body"]');
      const r = element.getBoundingClientRect(), t = toggle.getBoundingClientRect();
      const spans = [...toggle.children].map(span => { const s = span.getBoundingClientRect(); return { top: s.top, bottom: s.bottom, height: s.height }; });
      return { drawer: { top: r.top, bottom: r.bottom }, toggle: { top: t.top, bottom: t.bottom, height: t.height }, spans,
        expanded: toggle.getAttribute('aria-expanded') === 'true', disabled: toggle.disabled, title: toggle.title,
        label: toggle.getAttribute('aria-label'), bodyHidden: body.hidden, bodyHeight: body.clientHeight };
    });
    assert(header.toggle.height >= 31 && header.toggle.height <= 33, `${name}: header remains one full 32px row`);
    assert(header.toggle.top >= header.drawer.top && header.toggle.bottom <= header.drawer.bottom + .1, `${name}: header must not be vertically clipped`);
    for (const span of header.spans) assert(span.height > 0 && span.top >= header.toggle.top && span.bottom <= header.toggle.bottom, `${name}: header text remains visible`);
    assert(header.label?.includes('完整详情'), `${name}: full accessible header label retained`);
    if (header.expanded) assert(!header.disabled && !header.bodyHidden && header.bodyHeight >= 24, `${name}: expanded body must have at least 24 visible pixels`);
    else assert(header.disabled && header.bodyHidden && header.title.includes('工具箱'), `${name}: unavailable body requires disabled explanatory fallback`);
    report.scenarios[report.scenarios.length - 1].tinyHeader = header;
  }
  await scenario('pending-before-replacement', { width: 1200, height: 800, count: 3, late: true });
  const replacement = await page.evaluate(() => window.fixture.configure({ width: 1200, height: 800, count: 3, reuseRenderer: true }));
  report.scenarios.push(verify(replacement, 'replacement-scene')); await screenshot('replacement-scene');
  state = await page.evaluate(() => window.fixture.emitRetiredComplete()); assert.deepEqual(state.cards, replacement.cards, 'late old-scene COMPLETE must not change current cards');
  assert.equal(state.revision, replacement.revision, 'late old-scene COMPLETE must not re-render current scene'); assert.equal(state.fixture.overlays, 1, 'late old-scene COMPLETE cannot reattach an overlay');
  const disposed = await page.evaluate(() => window.fixture.dispose()); assert.deepEqual(disposed, { overlays: 0, drawers: 0, themeListeners: 0 }, 'dispose releases overlays, DOM, theme subscriptions');
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.evaluate(() => window.fixture.configure({ width: 1200, height: 800, count: 4,
    domClip: { left: 0, top: 0, width: 900, height: 0 } }));
  await page.waitForTimeout(1700);
  const unavailable = await page.evaluate(() => window.fixture.inspect());
  assert.equal(unavailable.geometry?.viewport, null, 'ordinary zero-height div really clips the canvas');
  assert.equal(unavailable.status?.state, 'viewport-unavailable', 'existing data without a viewport must expose a diagnostic state');
  assert.equal(unavailable.status?.sourceCount, 4, 'diagnostic preserves known source count');
  assert(unavailable.status?.reason, 'missing viewport diagnostic needs an inspectable reason');
  assert.equal(unavailable.fixture.reportedErrors.length, 1, 'persistent viewport failure reports one current error');
  assert.equal(unavailable.fixture.errorHistory.filter(value => value !== null).length, 1, 'polling must not repeat the same viewport error');
  const restored = await page.evaluate(() => window.fixture.setDom({ domClip: null }));
  verifyOfficialDom(restored, 'viewport-diagnostic-recovered');
  assert.equal(restored.cards.length, 4, 'same renderer recovers all cards when the real DOM clip is removed');
  assert.equal(restored.fixture.reportedErrors.length, 0, 'recovery clears the current viewport error');
  assert(restored.fixture.errorHistory.includes(null), 'recovery explicitly clears its own error report');
  report.scenarios.push({ ...verify(restored, 'viewport-diagnostic-recovered'), failureStatus: unavailable.status,
    failureErrors: unavailable.fixture.reportedErrors, errorHistory: restored.fixture.errorHistory });
  await page.evaluate(() => window.fixture.dispose());
  const engineRecovery = await page.evaluate(async () => {
    const before = await window.fixture.configure({ width: 1200, height: 800, count: 3 });
    const originalEngine = window.Laya;
    try {
      // Keep the native stage and scene unchanged. Only the exposed engine
      // constructor disappears, so recovery must invalidate the old signature.
      window.Laya = { ...originalEngine, Sprite: undefined };
      window.fixture.update();
      await new Promise(resolve => setTimeout(resolve, 1800));
      const failed = window.fixture.inspect();
      window.Laya = originalEngine;
      const recovered = await window.fixture.repeat(2);
      return { before, failed, recovered };
    } finally { window.Laya = originalEngine; }
  });
  assert.equal(engineRecovery.before.status.state, 'ready', 'engine recovery starts with an already-rendered scene');
  assert.equal(engineRecovery.failed.status.state, 'engine-unavailable', 'missing Sprite constructor must be diagnosed');
  assert.equal(engineRecovery.failed.status.sourceCount, 3, 'engine diagnostic keeps the complete source count');
  assert.equal(engineRecovery.failed.fixture.reportedErrors.length, 1, 'persistent engine failure reports one current error');
  assert(engineRecovery.failed.fixture.reportedErrors[0].includes('Laya Sprite/Text'), 'engine diagnostic preserves its actual reason');
  assert.equal(engineRecovery.failed.fixture.errorHistory.filter(value => value !== null).length, 1, 'polling must not repeat the engine error');
  assert.equal(engineRecovery.recovered.status.state, 'ready', 'unchanged scene must leave engine-unavailable after recovery');
  assert.equal(engineRecovery.recovered.geometry.signature, engineRecovery.before.geometry.signature, 'recovery must exercise an unchanged geometry signature');
  assert.deepEqual(engineRecovery.recovered.cards, engineRecovery.before.cards, 'all three complete cards retain their positions and owners');
  assert.equal(engineRecovery.recovered.cards.length, 3, 'all complete cards recover');
  assert(engineRecovery.recovered.revision > engineRecovery.before.revision, 'restored engine must rebuild the unchanged scene');
  assert.equal(engineRecovery.recovered.fixture.overlays, 1, 'recovery leaves exactly one native overlay');
  assert.deepEqual(engineRecovery.recovered.fixture.reportedErrors, [], 'recovery clears the current engine error');
  assert.deepEqual(engineRecovery.recovered.fixture.errorHistory, [...engineRecovery.failed.fixture.reportedErrors, null], 'recovery explicitly clears its one recorded engine error');
  report.scenarios.push({ ...verify(engineRecovery.recovered, 'engine-diagnostic-recovered'),
    failureStatus: engineRecovery.failed.status, failureErrors: engineRecovery.failed.fixture.reportedErrors,
    errorHistory: engineRecovery.recovered.fixture.errorHistory });
  await screenshot('engine-diagnostic-recovered');
  assert.deepEqual(await page.evaluate(() => window.fixture.dispose()), { overlays: 0, drawers: 0, themeListeners: 0 }, 'engine recovery dispose releases all owned resources');
  for (const kind of ['typeset', 'text-width-setter', 'drawLine', 'scene.addChild', 'measure-probe-typeset']) await exceptionScenario(kind);
  const resources = await page.evaluate(async () => {
    const OriginalSprite = Laya.Sprite, created = [];
    Laya.Sprite = function (...args) { const sprite = new OriginalSprite(...args); created.push(sprite); return sprite; };
    Laya.Sprite.prototype = OriginalSprite.prototype;
    try {
      const state = await window.fixture.configure({ width: 600, height: 400, screenshotContent: true, onlySourceId: 5027, variantCorridor: true, positions: [{ x: 260, y: 320 }] });
      const cards = created.filter(sprite => /^shanhe-card-\d+$/.test(sprite.name || ''));
      const beforeDispose = { created: cards.length, destroyed: cards.filter(sprite => sprite.destroyed).length,
        mounted: cards.filter(sprite => !sprite.destroyed && sprite.parent).length, orphans: cards.filter(sprite => !sprite.destroyed && !sprite.parent).length };
      await window.fixture.dispose();
      return { state, beforeDispose, allCardsDestroyed: cards.every(sprite => sprite.destroyed) };
    } finally { Laya.Sprite = OriginalSprite; }
  });
  const measured = resources.state.measuredCards[0];
  assert.deepEqual([measured, ...measured.alternatives].map(size => size.w).sort((a, b) => a - b),
    [173, 190, 220, 250, 280, 320], 'the complete width set includes the default width; alternatives exclude it');
  assert.equal(resources.beforeDispose.created, 1, 'measurement alternatives must reuse the probe and create only the selected display card');
  assert.equal(resources.beforeDispose.mounted, 1); assert.equal(resources.beforeDispose.orphans, 0);
  assert.equal(resources.beforeDispose.destroyed, 0, 'no discarded alternate display tree is constructed');
  assert(resources.allCardsDestroyed, 'dispose destroys the selected variants too');
  report.scenarios.push({ ...verify(resources.state, 'official-variant-resource-cleanup'), resources: resources.beforeDispose, allCardsDestroyed: resources.allCardsDestroyed });
  }
  }
  }
  assert.deepEqual(report.errors, [], 'browser page errors'); assert.deepEqual(report.blockedRequests, [], 'fixture must use no remote resources');
  report.passed = true;
  }
} catch (error) { report.passed = false; report.failure = error.stack || error.message; throw error; }
finally { await writeFile(path.join(output, performanceOnly ? baselinePerformance ? 'baseline-report.json' : 'final-report.json' : 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
console.log(performanceOnly ? `山河图性能测量完成：${report.performance.trials.length} trials；${output}` : `山河图新布局浏览器检查通过：${report.scenarios.length} 场景，${report.screenshots.length} 张截图；${path.join(output, 'report.json')}`);


