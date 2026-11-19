import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const output = path.resolve('test-results/ledger-bag'); await mkdir(output, { recursive: true });
const engineRoot = process.env.SGS_LAYA_DIR || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game';
const clientPath = process.env.SGS_CLIENT_SOURCE || path.resolve('test-results/reference/client-static/sgsGame_a.js');
const source = await readFile(clientPath, 'utf8'), at = source.indexOf('showBags(t){'), start = source.lastIndexOf('class ', at), end = source.indexOf('class ', at);
assert.ok(at > 0 && start >= 0 && end > at);
const captured = source.slice(start, end).replace(/extends \w+\{/, 'extends Laya.Sprite{');
const bundle = await build({ stdin: { contents: `export { ResourceScope } from './src/core/resources.js'; export { createNativeTheme } from './src/ui/native-theme.js'; export { createBagEnhancements } from './src/plugins/ledger/bag.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'BagCheck' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } }), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.setContent('<html><body style="margin:0;background:#151513"></body></html>');
  for (const file of ['laya.core.min.js', 'laya.ui.min.js']) await page.addScriptTag({ path: path.join(engineRoot, file) });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: `window.CapturedBag=(${captured});` });
  await page.evaluate(() => {
    const L = window.Laya; L.init(1200, 850); L.stage.bgColor = '#151513';
    const scope = new BagCheck.ResourceScope(), owner = new L.Sprite(); owner.size(807, 506); owner.pos(130, 110); L.stage.addChild(owner);
    owner.graphics.drawRect(0, 0, 807, 506, '#252119', '#665635', 1); owner.graphics.drawRect(31, 76, 745, 347, '#171613', '#51452f', 1);
    const text = (parent, value, x, y, width, height = 24, size = 13) => { const node = new L.Text(); Object.assign(node, { text: value, x, y, width, height, font: 'Microsoft YaHei', fontSize: size, color: '#e3d3b2', align: 'center', valign: 'middle', mouseEnabled: false }); parent.addChild(node); return node; };
    text(owner, '背 包', 330, -35, 140, 28, 22); text(owner, '道具　　礼包　　材料　　其他', 47, 31, 350);
    text(owner, '锁定　删除', 713, 29, 87); text(owner, '‹', 290, 438, 36); text(owner, '›', 438, 438, 36);
    owner.topSp = new L.Sprite(); owner.topSp.pos(31, 80); owner.addChild(owner.topSp);
    owner.pageCountTxt = text(owner, '', 365, 438, 80); owner.deleteBtn = { selected: false }; owner.tabGroup = { SelectedValue: 1 };
    owner.xNum = 9; owner.yNum = 4; owner.curPage = 1;
    const rows = Array.from({ length: 87 }, (_, i) => ({ ID: i + 1, BaseID: 1000 + i, Count: i === 78 ? 123456 : i % 6 === 0 ? 1 : i + 1, RemainingTime: i % 6 < 2 ? 172800 : 0, baseInfo: { name: i % 3 ? '普通道具' + i : '周年抵价券' + i, TypeID: i % 3 ? 1 : 98, usedeffect: 'GType-2;GRmb-1;UTime-1', sortindex: i, toneType: 0 } }));
    const bottom = new L.Sprite(); bottom.pos(31, 80); owner.addChildAt(bottom, 1);
    const ribbonCanvas = document.createElement('canvas'); ribbonCanvas.width = 64; ribbonCanvas.height = 17;
    const ribbonPaint = ribbonCanvas.getContext('2d');
    ribbonPaint.fillStyle = '#963b2b'; ribbonPaint.beginPath(); ribbonPaint.moveTo(0, 0);
    ribbonPaint.lineTo(59, 0); ribbonPaint.lineTo(64, 8); ribbonPaint.lineTo(59, 17); ribbonPaint.lineTo(0, 17); ribbonPaint.fill();
    const ribbonBitmap = new L.Texture2D(64, 17); ribbonBitmap.loadImageSource(ribbonCanvas);
    const ribbonTexture = new L.Texture(ribbonBitmap);
    owner.bags = Array.from({ length: 36 }, (_, i) => {
      const art = new L.Sprite(), name = text(art, '', 1, 25, 69, 20, 10);
      const count = text(owner.topSp, '', 0, 0, 0, 16, 14); count.align = 'left';
      const ribbon = new L.Sprite(); ribbon.name = 'remaining-time'; ribbon.texture = ribbonTexture;
      const caption = text(ribbon, '剩余2天', 0, 2, 0, 13, 12); caption.align = 'left';
      caption.font = 'SimSun'; owner.topSp.addChild(ribbon);
      let countLeft = 0;
      const offset = new L.Point(-3, -5);
      const slot = { _x: 16 + i % 9 * 81, _y: Math.floor(i / 9) * 87, width: 71, height: 70,
        leftTimeBg: ribbon, leftTimeTxt: caption, countTxt: count, itemPosDict: new Map([[ribbon.name, offset]]),
        MoveItem(key, x, y) { this.itemPosDict.get(key).setTo(x, y); ribbon.pos(this._x + x, this._y + y); },
        Move(x, y) { this._x = x; this._y = y; art.pos(x, y); ribbon.pos(x + offset.x, y + offset.y); count.pos(x + countLeft, y + 48); },
        updateItem(row) { this.data = row; this.id = row?.ID; this.baseData = row?.baseInfo; art.graphics.clear(); art.graphics.drawRect(0, 0, 71, 70, '#302a20', '#62523a', 1);
          ribbon.visible = Boolean(row?.RemainingTime);
          caption.x = (ribbon.width - caption.textWidth) >> 1;
          if (row) { art.graphics.drawRect(14, 16, 43, 34, row.baseInfo.TypeID === 98 ? '#96742f' : '#3d5659', '#a48b58', 1); name.text = row.baseInfo.TypeID === 98 ? '抵价券' : '道具'; count.text = 'x' + row.Count; } else name.text = count.text = '';
          countLeft = Math.floor(this.width - 5 - count.textWidth); count.pos(this._x + countLeft, this._y + 48);
        },
        get ID() { return this.id; }, get BaseData() { return this.baseData; }, initData() { this.updateItem(null); } };
      art.mouseEnabled = true; art.size(71, 70); bottom.addChild(art); slot.Move(slot._x, slot._y); return slot;
    });
    // Exact captured native list/paging/incremental-update methods; construction,
    // art, account and inventory are synthetic. No official server connection.
    for (const key of ['showBags', 'updatePageIdx', 'onAddBagItem', 'onUpdateBagItem', 'onDelBagItem', 'updateBagData', 'dealChangePage', 'getBagNum', 'onPreClick', 'onNextClick']) owner[key] = CapturedBag.prototype[key];
    owner.updateRadioBtnData = function (rows) { this.curPage = 1; this.showBags(rows); this.updatePageIdx(); }; owner.canJoinBags = () => true;
    owner.showBags(rows); owner.updatePageIdx();
    const gm = { GetGoodsNumByBaseID() {}, _events: { BAG_ADD_PROP: [{ caller: owner, method: owner.onAddBagItem }], BAG_DELETE_PROP: [{ caller: owner, method: owner.onDelBagItem }] } };
    let config = null; const couponConfig = { sgs_config: { couponsys: { GRmb: { seting: [{ AID: 1, AVV: '7000-2000' }] } } } };
    let tokens = { bg: '#211e18', surface: '#302b22', raised: '#3b3326', text: '#f0e4cc', muted: '#a99c80', accent: '#d8b66b', border: '#66573d', danger: '#d26155' }; const subscribers = new Set();
    const ctx = { scope, window, document, game: { getClass: () => gm, getServerProxy: () => null, getConfigData: () => config, loadConfigData: async () => config = couponConfig },
      themes: { get current() { return { tokens }; }, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } }, ui: {} };
    ctx.ui.nativeTheme = BagCheck.createNativeTheme({ window, document, scope, themes: ctx.themes });
    const original = owner.showBags, originalAdd = gm._events.BAG_ADD_PROP[0].method;
    const fixture = window.bagFixture = { ctx, owner, gm, rows, original, originalAdd, subscribers, scope,
      setTheme(next) { tokens = next; for (const fn of subscribers) fn(); }, restart() { this.scope.dispose(); } };
    fixture.runtime = BagCheck.createBagEnhancements(ctx);
  });
  const snapshot = () => page.evaluate(() => { const f = bagFixture, o = f.owner; return { page: o.curPage, pages: o.allPage, total: o.bagDatas.length, ids: o.bags.map(b => b.ID || null),
    texts: o.topSp._children.filter(n => n.visible && n.name === 'sgs-toolbox-coupon-amount').map(n => n.text), status: o.getChildByName('sgs-toolbox-bag-search')?.getChildByName('bag-search-status')?.text }; });
  const point = async name => page.evaluate(name => { const root = bagFixture.owner.getChildByName('sgs-toolbox-bag-search'), node = root.getChildByName(name), p = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2), true); return { x: p.x, y: p.y }; }, name);
  await page.waitForFunction(() => bagFixture.owner.topSp._children.some(n => n.visible && n.text === '7000-2000'));
  const countdownLayout = () => page.evaluate(() => {
    const { owner } = bagFixture;
    return owner.bags.filter(slot => slot.leftTimeBg.visible).map(slot => {
      const { leftTimeBg: ribbon, _x, _y } = slot;
      return { x: ribbon.x - _x, y: ribbon.y - _y, width: ribbon.width,
        captionCentered: slot.leftTimeTxt.x === (64 - slot.leftTimeTxt.textWidth >> 1) };
    });
  });
  const badgeLayout = () => page.evaluate(() => {
    const { owner } = bagFixture;
    return owner.topSp._children.filter(node => node.visible && node.name === 'sgs-toolbox-coupon-amount').map(badge => {
      const slot = owner.bags.find(({ _x, _y, width, height }) => badge.x >= _x && badge.x < _x + width && badge.y >= _y && badge.y < _y + height);
      if (!slot) return null;
      const { _x, _y, countTxt } = slot;
      return { x: badge.x - _x, y: badge.y - _y, right: badge.x + badge.width - _x, bottom: badge.y + badge.height - _y,
        countX: countTxt.x - _x, countY: countTxt.y - _y, count: countTxt.text, font: badge.fontSize,
        readable: badge.width >= badge.textWidth, coupon: slot.BaseData?.TypeID === 98 };
    });
  });
  const nativeCountdown = ({ x, y, width, captionCentered }) => x === -3 && y === -5 && width === 64 && captionCentered;
  const fitsSlot = badge => badge && badge.x === 2 && badge.y > 30 && badge.right <= 69 && badge.bottom <= 68 &&
    (badge.right < badge.countX || badge.bottom < badge.countY) && badge.font < 11 && badge.readable && badge.coupon;
  const ribbons = await countdownLayout();
  assert.ok(ribbons.length > 0 && ribbons.every(nativeCountdown));
  const badges = await badgeLayout();
  assert.equal(badges.length, 12);
  assert.ok(badges.every(fitsSlot));
  assert.ok(badges.some(badge => badge.count === 'x1' && badge.bottom === 68));
  assert.ok(badges.some(badge => badge.count === 'x123456' && badge.bottom < badge.countY));
  checks.push('原生倒计时留在原位；更小的满减角标贴左下角，数量过宽时在格内避让');
  await page.screenshot({ path: path.join(output, 'bag-dark.png') });
  await page.screenshot({ path: path.join(output, 'coupon-badge-detail.png'), clip: { x: 250, y: 182, width: 257, height: 164 } });
  await page.keyboard.press('Control+f');
  assert.equal(await page.evaluate(() => bagFixture.owner.getChildByName('sgs-toolbox-bag-search').getChildByName('bag-search-input').focus), true);
  let p; await page.keyboard.type('抵价券'); await page.keyboard.press('Enter');
  assert.equal((await snapshot()).pages, 1); assert.equal((await snapshot()).total, 87); assert.equal((await snapshot()).ids.filter(Boolean).length, 29);
  assert.ok((await snapshot()).texts.every(t => t === '7000-2000')); checks.push('真实 Laya 输入/Enter 搜索，原生筛选分页与完整背包并存；抵价券角标');
  assert.ok((await countdownLayout()).every(nativeCountdown));
  assert.ok((await badgeLayout()).every(fitsSlot));
  await page.screenshot({ path: path.join(output, 'search-dark.png') });
  // Add 20 matching items through the existing native event identity.
  await page.evaluate(() => { const f = bagFixture, coupon = f.rows.find(r => r.baseInfo.TypeID === 98), rows = Array.from({ length: 20 }, (_, i) => ({ ...coupon, ID: 1000 + i, baseInfo: { ...coupon.baseInfo, sortindex: 1000 + i } })); f.gm._events.BAG_ADD_PROP[0].method.call(f.owner, rows); f.owner.onNextClick(); f.runtime.tick(); });
  assert.equal((await snapshot()).pages, 2); assert.equal((await snapshot()).page, 2); assert.equal((await snapshot()).ids.filter(Boolean).length, 13);
  await page.evaluate(() => { const f = bagFixture; f.gm._events.BAG_DELETE_PROP[0].method.call(f.owner, [{ PropID: f.owner.bags[0].ID }]); f.runtime.tick(); });
  assert.equal((await snapshot()).ids.filter(Boolean).length, 12); checks.push('原生背包添加事件、跨页及删除事件保持筛选，不泄漏未匹配物品');
  await page.keyboard.press('Control+A'); await page.keyboard.type('不存在的道具'); assert.ok((await snapshot()).ids.every(id => !id));
  assert.equal(await page.evaluate(() => bagFixture.owner.getChildByName('bag-search-empty').visible), true);
  await page.screenshot({ path: path.join(output, 'search-empty.png') }); await page.keyboard.press('Escape'); assert.equal((await snapshot()).ids.filter(Boolean).length, 36);
  p = await point('bag-search-input'); await page.mouse.click(p.x, p.y); await page.keyboard.type('抵价券');
  await page.evaluate(() => bagFixture.owner.updateRadioBtnData(bagFixture.rows.filter(r => r.baseInfo.TypeID !== 98))); assert.ok((await snapshot()).ids.every(id => !id));
  p = await point('bag-search-button'); await page.mouse.click(p.x, p.y); assert.ok((await snapshot()).ids.some(Boolean)); assert.equal((await snapshot()).texts.length, 0);
  checks.push('零结果、Esc 清空、按钮清空、切分类及格子复用清除旧角标');
  await page.evaluate(() => { bagFixture.owner.updateRadioBtnData(bagFixture.rows); bagFixture.setTheme({ bg: '#f7f1e6', surface: '#eee5d4', raised: '#fffaf1', text: '#352b1c', muted: '#77684f', accent: '#886213', border: '#bdad8e', danger: '#b33328', scheme: 'light', motion: '0s' }); });
  await page.waitForTimeout(200); await page.screenshot({ path: path.join(output, 'bag-light.png') });
  assert.equal(await page.evaluate(() => bagFixture.owner.topSp._children.find(n => n.visible && n.name === 'sgs-toolbox-coupon-amount').color), '#886213');
  await page.evaluate(() => { const f = bagFixture; f.owner.visible = false; f.runtime.tick(); });
  assert.equal(await page.evaluate(() => bagFixture.owner.showBags === bagFixture.original), true);
  assert.ok((await countdownLayout()).every(nativeCountdown));
  await page.evaluate(() => { bagFixture.owner.visible = true; bagFixture.runtime.tick(); });
  assert.equal(await page.evaluate(() => bagFixture.owner.topSp._children.filter(n => n.name === 'sgs-toolbox-coupon-amount').length), 36);
  assert.ok((await countdownLayout()).every(nativeCountdown));
  assert.ok((await badgeLayout()).every(fitsSlot));
  await page.evaluate(() => { bagFixture.scope.dispose(); });
  assert.deepEqual(await page.evaluate(() => { const f = bagFixture; return [f.owner.topSp._children.length, f.owner.showBags === f.original, f.gm._events.BAG_ADD_PROP[0].method === f.originalAdd, f.subscribers.size]; }), [72, true, true, 0]);
  assert.ok((await countdownLayout()).every(nativeCountdown));
  checks.push('浅/深主题即时更新；关闭/重新打开与停用释放节点、监听和原生方法');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors, clientPath, environment: 'Chrome headless + 本机真实 Laya 引擎，捕获客户端列表/分页/增删方法；合成物品与图像，非官服实局' }, null, 2));
  console.log(checks.join('\n'));
} finally { await browser.close(); }
