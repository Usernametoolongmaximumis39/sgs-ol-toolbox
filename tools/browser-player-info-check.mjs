import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'test-results/player-info'; await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export {activate} from './src/plugins/player-info/index.js';export {ResourceScope} from './src/core/resources.js';`, resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'Check', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body style="margin:0;background:#151715"><canvas id="layaCanvas" style="position:absolute;left:40px;top:60px;width:920px;height:580px;background:#343b35"></canvas></body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    window.stage = { _children: [] }; window.layer = { parent: stage, _children: [] }; stage._children.push(layer);
    window.view = { name: 'UserInfoView', parent: layer, userData: { ClientId: 4000000000 } }; layer._children.push(view);
    window.Laya = { stage }; window.scope = new Check.ResourceScope();
    window.scene = {}; window.inGame = false; window.session = 1; window.account = 123;
    window.seats = []; window.theme = { current: { tokens: {} }, subscribe(fn) { window.paint = fn; return () => { window.paint = null; }; } };
    Check.activate({ window, document, scope, themes: theme, getState: () => ({ sessionId: session }), game: {
      getSelf: () => ({ ClientId: account }), getScene: () => scene, getSnapshot: () => ({ inGame }), getSeatUIs: () => seats,
    } });
  });
  const banner = page.locator('[data-sgs-player-info]');
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  await page.evaluate(() => view.userData = { ClientId: 4000000001 });
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
  await page.evaluate(() => { view.visible = false; account = 456; });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  await page.evaluate(() => { view.visible = true; }); await banner.waitFor();
  await page.evaluate(() => { view.visible = false; inGame = true; seats = [{ seat: { playerInfo: {} } }]; account = 789; });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0);
  await page.evaluate(() => { seats[0].seat.playerInfo.ClientId = 4000000001; });
  await page.waitForFunction(() => document.querySelector('[data-sgs-player-info] strong')?.textContent === '人机对战');
  await page.screenshot({ path: `${out}/battle.png` });
  await page.evaluate(() => { document.querySelector('[data-sgs-player-info]').remove(); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0, 'no repeated popup within session');
  await page.evaluate(() => { session++; }); await banner.waitFor();
  await page.evaluate(() => { scope.dispose(); scope.dispose(); });
  await page.waitForTimeout(350); assert.equal(await banner.count(), 0); assert.equal(await page.evaluate(() => paint), null);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser-report.json`, JSON.stringify({ passed: true, errors, checks: ['strict boundary', 'delayed profile data', 'reopen profile', 'account switch', 'delayed seat data', 'same scene next session', 'deduplication', '248/280/420 dark and light', 'pointer passthrough', 'dispose'] }, null, 2));
  console.log('Player info browser checks passed.');
} finally { await browser.close(); }
