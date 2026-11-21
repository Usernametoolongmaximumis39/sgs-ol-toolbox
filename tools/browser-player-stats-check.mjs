import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'test-results/player-info/stats'; await mkdir(out, { recursive: true });
const source = await readFile('test-results/reference/client-static/sgsGame_a.js', 'utf8');
function nativeMethod(start, end) {
  const a = source.indexOf(start); assert.ok(a >= 0); const b = source.indexOf(end, a + start.length);
  assert.ok(b > a); return source.slice(a, b);
}
const send = nativeMethod('SendClientGameRecordInfoReq(t,i,s=null,e=100){', 'reqRecordInfoTimeDic=');
const byTab = nativeMethod('SendClientGameRecordInfoReqByTab(t,i,s=!1,e=100){', 'SendClientGetDouDiZhuUserDataReq');
const getRate = nativeMethod('GetWinRateInfoByUuId(t,i){', 'GetWinRateInfoById');
const getRecent = nativeMethod('GetWinRateInfoById(t,i){', 'CheckPaiweiHightlightEntry');
const packetName = send.match(/\bnew ([\w$]+)\b/)?.[1];
const proxyName = byTab.match(/\b([\w$]+)\.I\(\)\.[GL]\(/)?.[1];
assert.ok(packetName && proxyName, 'native record request dependencies');
const bundle = await build({ stdin: { contents: `export {createPlayerStats} from './src/plugins/player-info/stats.js';export {ResourceScope} from './src/core/resources.js';export {createNativeTheme} from './src/ui/native-theme.js';
  export {createPluginNative} from './src/core/plugin-native.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'Check' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }), errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.setContent('<body style="margin:0"></body>');
 await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js') });
 await page.addScriptTag({ content: bundle.outputFiles[0].text });
 await page.evaluate(({ send, byTab, getRate, getRecent, packetName, proxyName }) => {
  Laya.init(1280, 800); Laya.stage.bgColor = '#182321';
  window.scope = new Check.ResourceScope(); window.modeId = 132; window.session = 1; window.account = 123456780;
  window.calls = []; window.seats = []; window.bars = []; window.scene = {}; window.self = null;
  class Dict { constructor() { this.data = new Map(); } get(k) { return this.data.get(k); } add(k, v) { this.data.set(k, v); } getStringKey(k) { return this.get(k); } }
  const proxy = window.proxy = new Laya.EventDispatcher();
  const responses = (uuid, tab, recordId) => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ GameOverTime: tab > 0 ? 0 : 1000 - i, GameResult: i < 3 ? 0 : 1 }));
    if (tab > 0) {
      mgr.winRateDic.add(uuid + '_' + tab, { WinCount: 62, TotalCount: 100, DiZhuWinRate: '72%', NongMinWinRate: '56%', RecordItems: rows });
      proxy.event('ClientGameRecordInfoRep', { Protocol: { Uuid: uuid, Tab: tab, RecordId: 0, RecordItems: rows } });
    }
  };
  const sendRecord = req => {
    calls.push({ uuid: req.uuid, tab: req.tab, record: req.recordId, count: req.record_cnt });
    responses(req.uuid, req.tab, req.recordId);
  };
  const sendProxy = { G: sendRecord, L: sendRecord };
  class Packet { tab = 0; recordId = 0; InitModeInfo() {} }
  const mgr = window.mgr = { proxy: sendProxy, reqRecordInfoTimeDic: new Dict(), reqRecordInfoTimeCD: 180,
    winRateDic: new Dict(), sevenDayWinRateDic: new Dict() };
  for (const code of [send, byTab, getRate, getRecent]) {
    const method = new Function(packetName, proxyName, 'return ({' + code + '})')(Packet, { I: () => sendProxy }); Object.assign(mgr, method);
  }
  proxy.on('ClientGameRecordInfoRep', mgr, function clientGameRecordInfoRep() {});
  class User { constructor(n) { this.ClientId = n; this.Uuid = n; this.Nickname = '玩家' + n; } static SendUserTTDateReq(name) {
    calls.push({ rank: name });
    proxy.event('ClientTTRankInfoRep', { Protocol: { result: 0, ranktype: 7, nickName: name,
      oriData: { curCycData: { roundId: 11, curRecord: { winCnt: 127, loseCnt: 66, maxLevel: { level: 22, star: 44 } } } } } });
  } }
  const config = { TTRankCfg: [{ rankType: 7, RankLevelCfg: { Item: [{ rank: 21, rankName: '枭雄' }] }, Common: [{ xiaoxiongShow: '24,无双枭雄,21;49,无双枭雄,22;99,盖世枭雄,23' }] }] };
  for (let i = 0; i < 4; i++) {
    const avatar = new Laya.Sprite(); avatar.pos(i % 2 ? 900 : 240, i < 2 ? 80 : 490); avatar.size(135, 172);
    avatar.graphics.drawRect(0, 0, 135, 172, '#434d45', '#88774e', 1); Laya.stage.addChild(avatar);
    const name = new Laya.Text(); name.text = '玩家' + (811 + i); name.color = '#eee3cc'; name.fontSize = 19; name.pos(24, 70); avatar.addChild(name);
    const bar = new Laya.Sprite(); bar.pos(avatar.x - 25, avatar.y + 176); bar.size(200, 65);
    bar.graphics.drawRect(0, 0, 200, 65, '#736750', '#bcaa81', 1); Laya.stage.addChild(bar);
    const hand = new Laya.Text(); hand.text = '队友手牌条（避让区）'; hand.fontSize = 14; hand.color = '#fff3d0'; hand.pos(10, 20); bar.addChild(hand); bars.push(bar);
    const user = new User(i === 3 ? 4000000001 : 123456780 + i); if (!i) self = user;
    const officerText = { text: ['卫将军', '大将军', '骠骑将军', ''][i], color: '#9cdaa0', font: 'Microsoft YaHei' };
    seats.push({ seat: { PlayerInfo: user, IsFull: true }, seatAvatar: avatar, otherTopManager: { officerText } });
  }
  const listeners = new Set(); window.themes = { current: { tokens: {} }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  window.changeTheme = tokens => { themes.current = { tokens }; for (const fn of listeners) fn(themes.current); };
  window.ctx = { scope, window, document, themes, game: { getSelf: () => ({ ...self, ClientId: account, constructor: User }), getClass: () => null,
    getServerProxy: () => proxy, getScene: () => scene, getSeatUIs: () => seats, getConfigData: () => config, loadConfigData: async () => config } };
  ctx.ui = { nativeTheme: Check.createNativeTheme(ctx) };
  ctx.native = Check.createPluginNative(ctx);
  window.runtime = Check.createPlayerStats(ctx);
  window.tick = () => runtime.update({ inGame: true, modeId }, session); tick();
  window.layout = name => {
    const positions = name === 'single' ? [[1140,615],[480,18]]
      : name === 'landlord' ? [[1140,615],[370,18],[580,18]]
      : name === 'farmer-left' ? [[1140,615],[480,18],[5,280]]
      : name === 'farmer-right' ? [[1140,615],[480,18],[930,280]]
      : [[1140,615],[480,18],[5,280],[930,280]];
    seats.forEach((ui, i) => {
      ui.seatAvatar.visible = i < positions.length;
      if (positions[i]) ui.seatAvatar.pos(...positions[i]);
      bars[i].visible = false; delete ui.otherTopManager.handCardSpr;
    });
    const mateIndex = name === 'rank-right' ? 3 : name === 'rank-left' ? 2 : name.startsWith('farmer') ? 2 : -1;
    if (mateIndex >= 0) {
      const ui = seats[mateIndex], a = ui.seatAvatar, bar = bars[mateIndex];
      bar.size(59,100); bar.pos(a.x < 640 ? a.x + 140 : a.x - 64, a.y + 60); bar.visible = true;
      bar.graphics.clear(); bar.graphics.drawRect(0,0,59,100,'#554d3c','#a59167',1);
      bar._children[0].text='队友\n手牌\n避让'; bar._children[0].fontSize=12; bar._children[0].pos(10,15);
      ui.otherTopManager.handCardSpr = bar;
    }
    tick();
  };
  scope.interval(tick, 250);
 }, { send, byTab, getRate, getRecent, packetName, proxyName });
 await page.waitForFunction(() => calls.filter(c => c.rank).length === 2);
 await page.waitForTimeout(500);
 const values = () => page.evaluate(() => Laya.stage._children.filter(n => n.name === 'sgs-player-stats').map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height, text: n._children[0]._children.filter(c => c instanceof Laya.Text).map(c => c.text) })));
 const togglePoint = () => page.evaluate(() => {
  const panel = Laya.stage.getChildByName('sgs-player-stats');
  const toggle = panel.getChildByName('sgs-player-stats-toggle');
  return { x: panel.x + toggle.x + toggle.width / 2, y: panel.y + toggle.y + toggle.height / 2 };
 });
 async function checkCompact(total, towardsRight) {
  const panels = await page.evaluate(() => Laya.stage._children.filter(n => n.name === 'sgs-player-stats').map(panel => ({
   width: panel.width, height: panel.height, expanded: panel.getChildAt(0).visible,
   opacity: panel.getChildByName('sgs-player-stats-toggle').getChildAt(0).alpha,
  })));
  assert.equal(panels.length, total);
  assert.deepEqual(panels[0], { width: 28, height: 28, expanded: false, opacity: .25 });
  assert.ok(panels.slice(1).every(panel => panel.expanded), 'other players stay expanded');
  const avatar = await page.evaluate(() => {
   const { x, y, width } = seats[1].seatAvatar;
   return { x, y, width };
  });
  const point = await togglePoint();
  assert.deepEqual(point, { x: towardsRight ? avatar.x + avatar.width + 18 : avatar.x - 18, y: avatar.y + 18 }, 'dot hugs the matching portrait');
  return point;
 }
 const firstButton = page.locator('[data-sgs-player-stats-toggle]').first();
 let panels = await values(); assert.equal(panels.length, 3); assert.ok(panels.some(p => p.text[1] === '胜率 65.8% · 无双枭雄 44星'));
 assert.ok(panels.some(p => p.text[2] === '3连胜'));
 assert.equal(await page.evaluate(() => calls.filter(c => c.tab === 1).length), 2, 'rank history fallback requested separately from season data');
 assert.equal(await page.evaluate(() => calls.some(c => c.uuid > 4000000000)), false);
 assert.equal(await page.evaluate(() => calls.some(c => c.uuid === account || c.rank === self.Nickname)), false, 'self is never queried');
 assert.ok(panels.every(p => p.text[0] !== '玩家123456780'), 'self information is absent');
 assert.ok(panels.every(p => p.text[0].startsWith('玩家')), 'names replace user codes');
 assert.ok(await page.evaluate(() => Laya.stage._children.filter(n=>n.name==='sgs-player-stats').every(n=>n.alpha===1 && n._children[0].getChildByName('sgs-player-stats-background').alpha===.76 && n._children[0]._children.filter(c=>c instanceof Laya.Text).every(t=>t.alpha===1))), 'only background is translucent');
 for (const panel of panels) for (const bar of await page.evaluate(() => bars.map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height }))))
  assert.ok(panel.x + panel.width <= bar.x || panel.x >= bar.x + bar.width || panel.y + panel.height <= bar.y || panel.y >= bar.y + bar.height);
 await page.screenshot({ path: `${out}/rank-dark.png` });
 const rankToggle = await togglePoint();
 await page.mouse.move(rankToggle.x, rankToggle.y);
 assert.ok(await page.evaluate(() => Laya.stage.getChildByName('sgs-player-stats').getChildByName('sgs-player-stats-toggle').getChildAt(2).visible), 'hover shows the action label');
 await page.mouse.click(rankToggle.x, rankToggle.y);
 await page.mouse.move(1, 1);
 const rankDot = await checkCompact(3, false);
 await page.evaluate(() => { seats[1].seatAvatar.x -= 38; tick(); });
 assert.deepEqual(await checkCompact(3, false), { x: rankDot.x - 38, y: rankDot.y });
 await page.evaluate(() => { seats[1].seatAvatar.x += 38; tick(); });
 await page.screenshot({ path: `${out}/rank-collapsed.png` });
 assert.equal(await firstButton.getAttribute('aria-expanded'), 'false');
 await firstButton.focus();
 await page.keyboard.press('Enter');
 assert.equal(await firstButton.getAttribute('aria-expanded'), 'true');
 await firstButton.blur();
 // Reproduce native nested BP, window layers, game zoom, and an unregistered class.
 for (const kind of ['scene-bp', 'SelectNewPaiWeiGeneralWindow', 'PWRandomSelectGeneralWindow', 'PWStandardSelectGenralWindow']) {
  await page.evaluate(kind => {
   window.layer = new Laya.Sprite(); layer.pos(20, 10); layer.scale(.9, .9); Laya.stage.addChild(layer);
   scene = new Laya.Sprite(); layer.addChild(scene);
   window.selection = new Laya.Sprite(); selection.name = kind;
   if (kind === 'scene-bp') {
    scene.selectGeneralView = selection; scene.addChild(selection);
   } else layer.addChild(selection);
   // Deliberately zero-sized parent, as native BP children draw their own bounds.
   if (kind === 'scene-bp') {
    // Native BP has a full-screen background; only the actual pick regions fade panels.
    selection.size(1280, 800); selection.graphics.drawRect(0, 0, 1280, 800, '#182321');
    const item = new Laya.Sprite(); item.pos(800, 80); item.size(400, 500);
    item.graphics.drawRect(0, 0, 400, 500, '#a33456'); selection.addChild(item); selection.selectGeneralItem0 = item;
   } else selection.graphics.drawRect(800, 80, 400, 500, '#a33456');
   tick();
  }, kind);
  await page.waitForTimeout(150);
  const selecting = await page.evaluate(() => {
   const panels = Laya.stage._children.filter(n => n.name === 'sgs-player-stats');
   return { count: panels.length, visible: panels.every(p => p.visible && p.alpha === 1),
    unaffected: panels.some(p => !p._children[1].visible && !p._children[0].mask),
    partial: panels.some(p => p._children[1].visible && p._children[1].alpha === .5 && p._children[0].mask && p._children[1].mask),
    panels: panels.map(p => ({ x: p.x, y: p.y, width: p.width })) };
  });
  assert.equal(selecting.count, 3); assert.equal(selecting.visible, true); assert.equal(selecting.partial, true); assert.equal(selecting.unaffected, true);
  assert.ok(selecting.panels.every((p, i) => p.x === panels[i].x && p.y === panels[i].y && p.width === panels[i].width), 'partial transparency preserves geometry');
  const shot = await page.screenshot({ path: `${out}/selection-layer-${kind}.png` });
  // Check the overlap itself in the rendered canvas: the opaque selection wins.
  const pixel = await page.evaluate(async data => {
   const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
   const target = document.createElement('canvas'); target.width = 1280; target.height = 800;
   target.getContext('2d').drawImage(image, 0, 0);
   return [...target.getContext('2d').getImageData(800, 120, 1, 1).data];
  }, shot.toString('base64'));
  assert.notDeepEqual(pixel, [163, 52, 86, 255], 'overlap retains translucent player information above selection');
  await page.evaluate(() => {
   selection.destroy(true); scene.selectGeneralView = null; tick();
   // Removing native UI must not destroy the now-restored panel resources.
   layer.destroy(true); scene = {}; tick();
  });
  assert.equal((await values()).length, 3);
  assert.ok(await page.evaluate(() => Laya.stage._children.filter(n => n.name === 'sgs-player-stats').every(n => !n._children[0].mask && !n._children[1].visible)), 'closing selection restores full opacity');
 }
 await page.evaluate(() => changeTheme({ bg: '#f3f0e8', surface: '#fffcf5', raised: '#eee8dd', text: '#302c25', muted: '#6b6254', accent: '#997424', border: '#b9a986', scheme: 'light' }));
 await page.waitForTimeout(300); await page.screenshot({ path: `${out}/rank-light.png` });
 for (const name of ['rank-right','rank-left','landlord','farmer-left','farmer-right']) {
  await page.evaluate(name => layout(name), name); await page.waitForTimeout(350);
  panels = await values(); assert.equal(panels.length, name.startsWith('rank') ? 3 : 2);
  const bars = await page.evaluate(() => window.bars.filter(b => b.visible).map(b => ({x:b.x,y:b.y,width:b.width,height:b.height})));
  for (const p of panels) for (const b of bars) assert.ok(p.x+p.width<=b.x || p.x>=b.x+b.width || p.y+p.height<=b.y || p.y>=b.y+b.height, name+' avoids live side hand strip');
  await page.screenshot({ path: `${out}/layout-${name}.png` });
 }
 await page.evaluate(() => layout('landlord'));
 await page.evaluate(() => { modeId = 148; session++; });
 await page.waitForFunction(() => calls.filter(c => c.tab === 9).length === 2); await page.waitForTimeout(300);
 panels = await values(); assert.ok(panels.some(p => p.text[1] === '胜率 62.0%'));
 assert.ok(panels.some(p => p.text[2] === '地主胜率 72% · 农民胜率 56%'));
 assert.ok(panels.some(p => p.text[3] === '3连胜'), 'redacted hundred records recover streak when recent cache is empty');
 await page.screenshot({ path: `${out}/ddz.png` });
 const landlordToggle = await togglePoint();
 await page.mouse.click(landlordToggle.x, landlordToggle.y, { delay: 80 });
 await page.mouse.move(1, 1);
 const landlordDot = await checkCompact(2, true);
 await page.screenshot({ path: `${out}/ddz-collapsed.png` });
 await page.mouse.click(landlordDot.x, landlordDot.y, { delay: 80 });
 assert.equal(await firstButton.getAttribute('aria-expanded'), 'true');
 for (const name of ['landlord', 'farmer-left', 'farmer-right']) {
  await page.evaluate(name => layout(name), name); await page.waitForTimeout(300);
  const cards = await values(); assert.equal(cards.length, 2);
  assert.ok(cards.every(p => p.text[2] === '地主胜率 72% · 农民胜率 56%'));
  assert.ok(await page.evaluate(() => Laya.stage._children.filter(n=>n.name==='sgs-player-stats').every(n=>n._children[0]._children.filter(c=>c instanceof Laya.Text).every(t=>t.textWidth<=t.width))), 'DDZ text fits');
  await page.screenshot({ path: `${out}/ddz-${name}.png` });
 }
 await page.evaluate(() => layout('single'));
 await page.evaluate(() => { modeId = 160; session++; });
 await page.waitForFunction(() => calls.filter(c => c.tab === 12).length === 2); await page.waitForTimeout(300);
 assert.ok((await values()).some(p => p.text[1] === '胜率 62.0%'));
 assert.ok((await values()).some(p => p.text[2] === '3连胜'), 'single-rider redacted records retain outcome streak');
 await page.screenshot({ path: `${out}/single.png` });
 await page.evaluate(() => { modeId = 74; }); await page.waitForTimeout(300); assert.equal((await values()).length, 0);
 const before = await page.evaluate(() => calls.length); await page.waitForTimeout(600); assert.equal(await page.evaluate(() => calls.length), before);
 await page.evaluate(() => { modeId = 160; tick(); });
 await page.waitForTimeout(800);
 assert.ok((await values()).length > 0);
 const soloToggle = await togglePoint();
 await page.touchscreen.tap(soloToggle.x, soloToggle.y);
 const soloDot = await checkCompact(1, true);
 await page.screenshot({ path: `${out}/single-collapsed.png` });
 // The native shop must occlude player information, including its currency strip.
 await page.evaluate(() => {
  window.shop = new Laya.Sprite(); shop.name = 'RogueLike1v1GameShopWindow';
  shop.graphics.drawRect(0, 0, 1280, 500, '#4a3826');
  const title = new Laya.Text(); title.text = '虎符商店    虎符 128'; title.fontSize = 30; title.color = '#f3d892'; title.pos(260, 80); shop.addChild(title);
  Laya.stage.addChild(shop); tick();
 });
 assert.equal(await page.evaluate(() => Laya.stage._children.filter(n => n.name === 'sgs-player-stats').length), 0);
 assert.equal(await firstButton.count(), 0);
 await page.screenshot({ path: `${out}/single-shop.png` });
 await page.evaluate(() => { shop.visible = false; tick(); });
 assert.deepEqual(await checkCompact(1, true), soloDot);
 await page.touchscreen.tap(soloDot.x, soloDot.y);
 assert.equal(await firstButton.getAttribute('aria-expanded'), 'true');
 await page.touchscreen.tap(soloToggle.x, soloToggle.y);
 await checkCompact(1, true);
 await page.evaluate(() => { shop.destroy(true); session++; tick(); });
 assert.equal(await page.locator('[data-sgs-player-stats-toggle][aria-expanded=false]').count(), 0, 'new battle resets compact cards');
 await page.evaluate(() => { account = 999; modeId = 132; session++; tick(); scope.dispose(); scope.dispose(); });
 await page.waitForTimeout(300); assert.equal((await values()).length, 0);
 assert.equal(await firstButton.count(), 0);
 assert.deepEqual(errors, []);
 await writeFile(`${out}/report.json`, JSON.stringify({ passed: true, errors, checks: ['native record request methods replay', 'current-season response', 'official raw rank config schema', 'three mode whitelist', 'combined hundred rate', 'streak order', 'robot no query', 'hand-strip no intersection', 'dark/light Laya render', 'nested ranked BP and three window variants with partial transparency and rendered overlap pixel', 'game zoom preserves panel geometry', 'independent collapse with mouse, keyboard and touch', 'collapsed dots hug the matching portraits on both sides and follow seat movement', 'single-rider shop hides and restores compact card', 'account/session cleanup', 'other mode no queries', 'dispose'] }, null, 2));
 console.log('Player statistics browser checks passed.');
} finally { await browser.close(); }
