import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'test-results/player-info'; await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export {activate} from './src/plugins/player-info/index.js';export {ResourceScope} from './src/core/resources.js';
  export {createNativeTheme} from './src/ui/native-theme.js'; export {createPluginNative} from './src/core/plugin-native.js';`, resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'Check', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body style="margin:0;background:#151715"><canvas id="layaCanvas" style="position:absolute;left:40px;top:60px;width:920px;height:580px;background:#343b35"></canvas></body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const children = [];
    window.stageReads = 0;
    window.stage = { get _children() { stageReads++; return children; } };
    window.layer = { parent: stage, _children: [] }; children.push(layer);
    window.view = { name: 'UserInfoView', parent: layer, userData: { ClientId: 4000000000 } }; layer._children.push(view);
    window.Laya = { stage }; window.scope = new Check.ResourceScope();
    const interval = scope.interval.bind(scope);
    scope.interval = (fn, ms) => {
      if (ms === 1000) { window.fallback = fn; return 0; }
      return interval(fn, ms);
    };
    window.scene = {}; window.inGame = false; window.session = 1; window.account = 123;
    window.snapshotReads = 0;
    const windows = new Map();
    const owner = { WindowInstanceDict: { getStringKey: key => key === 'UserInfoWindow' && view.visible !== false ? layer : null } };
    const dispatcher = { _events: { OPEN_WINDOW: { caller: owner } },
      on(type, _, fn) { windows.set(type, fn); }, off(type) { windows.delete(type); } };
    window.emitWindow = (type, payload) => windows.get(type)?.(payload);
    window.windowListeners = windows;
    window.seats = []; window.theme = { current: { tokens: {} }, subscribe(fn) { window.paint = fn; return () => { window.paint = null; }; } };
    const ctx = { window, document, scope, themes: theme, getState: () => ({ sessionId: session }),
      subscribe(fn) { window.emitJournal = (type, payload) => fn(null, { type, payload }); },
      game: {
      getSelf: () => ({ ClientId: account }), getScene: () => scene, isInGame: () => inGame,
      getSnapshot: () => { snapshotReads++; return { inGame }; }, getSeatUIs: () => seats, getDispatcher: () => dispatcher,
    } };
    ctx.ui = { nativeTheme: Check.createNativeTheme(ctx), registerPanel: () => () => {} };
    ctx.native = Check.createPluginNative(ctx);
    Check.activate(ctx);
  });
  const banner = page.locator('[data-sgs-player-info]');
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  assert.deepEqual(await page.evaluate(() => [stageReads, snapshotReads, typeof fallback]), [0, 0, 'function']);
  await page.evaluate(() => { view.userData = { ClientId: 4000000001 }; fallback(); });
  await banner.waitFor(); assert.match(await banner.textContent(), /这是个人机/);
  for (const scheme of ['dark', 'light']) for (const width of [248, 280, 420]) {
    await page.evaluate(({ scheme, width }) => {
      document.querySelector('canvas').style.width = width + 'px';
      theme.current.tokens = scheme === 'light' ? { surface: '#fffcf5', text: '#302c25', muted: '#6b6254', accent: '#8c681c', border: '#b7aa8c' } : {};
      paint();
    }, { scheme, width });
    await page.waitForTimeout(300);
    assert.ok(await banner.evaluate(e => e.scrollWidth <= e.clientWidth));
    assert.equal(await banner.evaluate(e => getComputedStyle(e).pointerEvents), 'none');
    await page.screenshot({ path: `${out}/${scheme}-${width}.png` });
  }
  await page.evaluate(() => { view.visible = false; account = 456; emitWindow('HIDE_WINDOW', { WindowName: 'UserInfoWindow' }); emitJournal('ClientLoginRep'); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  await page.evaluate(() => { stageReads = 0; view.visible = true; emitWindow('OPENED_WINDOW', 'UserInfoWindow'); }); await banner.waitFor();
  assert.equal(await page.evaluate(() => stageReads), 0, 'cached profile reopens without walking the stage');
  await page.evaluate(() => { view.visible = false; inGame = true; seats = [{ seat: { playerInfo: {} } }]; account = 789; emitJournal('ClientLoginRep'); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  await page.evaluate(() => { snapshotReads = 0; seats[0].seat.playerInfo.ClientId = 4000000001; emitJournal('toolbox:snapshot', { inGame: true }); });
  await page.waitForFunction(() => document.querySelector('[data-sgs-player-info] strong')?.textContent === '人机对战');
  assert.equal(await page.evaluate(() => snapshotReads), 0, 'the journal supplies the snapshot for the event-driven update');
  await page.screenshot({ path: `${out}/battle.png` });
  await page.evaluate(() => { document.querySelector('[data-sgs-player-info]').remove(); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0, 'no repeated popup within session');
  await page.evaluate(() => { session++; fallback(); }); await banner.waitFor();
  await page.evaluate(() => { scope.dispose(); scope.dispose(); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0); assert.equal(await page.evaluate(() => paint), null);
  assert.equal(await page.evaluate(() => windowListeners.size), 0);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser-report.json`, JSON.stringify({ passed: true, errors, checks: ['strict boundary', 'delayed profile data', 'reopen profile', 'account switch', 'delayed seat data', 'same scene next session', 'deduplication', '248/280/420 dark and light', 'pointer passthrough', 'dispose'] }, null, 2));
  console.log('Player info browser checks passed.');
} finally { await browser.close(); }
