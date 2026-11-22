import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'test-results/player-info'; await mkdir(out, { recursive: true });
const source = await readFile('test-results/reference/client-static/sgsGame_a.js', 'utf8');
// Match the native method bodies by stable fields, since bundle symbols change between builds.
const method = source.match(/SetFigure\((\w+),\w+=0\)\{this\.figureValue=\1,[^{}]+\}(?=get FigurePosGlobal\(\))/)?.[0];
const contextName = method?.match(/(\w+)\.IsFigureMode/)?.[1];
const settingsName = method?.match(/(\w+)\.I\(\)\.SystemSets/)?.[1];
const menuName = method?.match(/(\w+)\.I\(\)\.RemoveUserOptFigure/)?.[1];
assert.ok(contextName && settingsName && menuName, 'native figure manager method and dependencies');
const addEventListener = source.match(/AddEventListener\(\w+,\w+,\w+,\w+\)\{[^{}]+this\.on\(\w+\.GetProtocolNameById\([^{}]+\}/)?.[0];
const protocolName = addEventListener?.match(/(\w+)\.GetProtocolNameById/)?.[1];
assert.ok(protocolName, 'native proxy registration method');
const protocolNames = Object.fromEntries([20508, 21208].map(id => {
  const match = source.match(new RegExp('t\\[' + id + '\\]="([^"]+)"'));
  assert.ok(match); return [id, match[1]];
}));
const bundle = await build({ stdin: { contents: `export {createIdentityHints} from './src/plugins/player-info/identity.js';export {ResourceScope} from './src/core/resources.js';
  export {createPluginNative} from './src/core/plugin-native.js';`, resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'Check', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(({ method, contextName, settingsName, menuName, addEventListener, protocolName, protocolNames }) => {
    Laya.init(1000, 650); Laya.stage.bgColor = '#182321';
    window.scope = new Check.ResourceScope(); window.seats = [];
    window.rc = { TableId: 307300001, TableSetting: { RandMode: 5 }, TabbleSeatInfos: { datum: [] } };
    const SetFigure = new Function(contextName, settingsName, menuName, 'return ({' + method + '}).SetFigure')(
      { IsFigureMode: false }, {}, { I: () => ({ RemoveUserOptFigure() {} }) },
    );
    const roles = ['未知', '主公', '忠臣', '反贼', '内奸'];
    for (let i = 0; i < 8; i++) {
      const host = new Laya.Sprite(); host.pos(55 + i % 4 * 240, 80 + Math.floor(i / 4) * 270);
      host.graphics.drawRect(0, 0, 165, 190, '#343b35', '#786947', 1); Laya.stage.addChild(host);
      const text = new Laya.Text(); text.pos(40, 30); text.fontSize = 24; text.color = '#e1bd76'; text.text = '未知'; host.addChild(text);
      const name = new Laya.Text(); name.text = `房间${i + 1}号`; name.fontSize = 17; name.color = '#ddd5c0'; name.pos(35, 135); host.addChild(name);
      const fm = { figureValue: 0, currentFigure: { visible: true }, get Figure() { return this.figureValue; },
        getFigureSource(n) { return roles[n]; }, setCurrentFigure(value) { text.text = value; }, layout() {}, SetFigure };
      seats.push({ seat: { Figure: 0, PlayerInfo: { ClientId: 100 + i } }, figureManager: fm });
      rc.TabbleSeatInfos.datum.unshift({ SeatID: i, ClientId: 100 + i });
    }
    // Deliberately rotate native UI order: only account mapping may determine role.
    seats.push(seats.shift());
    const proxy = new Laya.EventDispatcher();
    proxy.AddEventListener = new Function(protocolName, 'return ({' + addEventListener + '}).AddEventListener')({ GetProtocolNameById: id => protocolNames[id] });
    proxy.AddEventListener(20508, rc, function clientTableInfoRep() {});
    proxy.AddEventListener(21208, rc, function ServerProxy_StartGame() {});
    const ctx = { scope, game: { getClass: () => null, getServerProxy: () => proxy, getSeatUIs: () => seats } };
    ctx.native = Check.createPluginNative(ctx);
    window.runtime = Check.createIdentityHints(ctx);
    window.snapshot = { inGame: true, isReplay: false };
    runtime.update(snapshot, false);
  }, { method, contextName, settingsName, menuName, addEventListener, protocolName, protocolNames });
  assert.deepEqual(await page.evaluate(() => seats.map(s => s.figureManager.Figure)), [2, 2, 4, 3, 3, 3, 3, 1]);
  await page.evaluate(() => {
    seats[1].figureManager.SetFigure(0);
    runtime.update(snapshot, false);
  });
  assert.equal(await page.evaluate(() => seats[1].figureManager.Figure), 2, 'native opening refresh restores the hint');
  await page.screenshot({ path: `${out}/identity-native-filled.png` });
  await page.evaluate(() => { runtime.update(snapshot, false); seats[0].figureManager.SetFigure(4); runtime.update(snapshot, false); });
  assert.equal(await page.evaluate(() => seats[0].figureManager.Figure), 4);
  await page.evaluate(() => runtime.update(snapshot, true));
  assert.deepEqual(await page.evaluate(() => seats.map(s => s.figureManager.Figure)), [4, 0, 0, 0, 0, 0, 0, 0]);
  await page.evaluate(() => { runtime.update(snapshot, false); scope.dispose(); scope.dispose(); });
  assert.deepEqual(await page.evaluate(() => seats.map(s => s.figureManager.Figure)), [4, 0, 0, 0, 0, 0, 0, 0]);
  await page.screenshot({ path: `${out}/identity-native-disposed.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/identity-native-report.json`, JSON.stringify({ passed: true, errors, source: 'client-static/sgsGame_a.js figure manager SetFigure', checks: ['real Laya renderer', 'native SetFigure replay', 'closed-over controller recovery', 'mode from native table ID', 'shuffled waiting seats and rotated battle seats matched by account', 'unknown icon restored after opening refresh', 'official update retained', 'gap clears owned UI', 'idempotent disposal'] }, null, 2));
  console.log('Player identity Laya checks passed.');
} finally { await browser.close(); }
