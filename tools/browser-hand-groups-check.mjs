import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import path from 'node:path';

const out = 'test-results/hand-sort-groups';
await mkdir(out, { recursive: true });
const source = await readFile(process.env.SGS_CLIENT_SOURCE || 'test-results/reference/client-static/sgsGame_a.js', 'utf8');
const classStart = source.indexOf('class dqt extends'), classEnd = source.indexOf('class ', classStart + 10);
assert.ok(classStart >= 0 && classEnd > classStart);
const owner = source.slice(classStart, classEnd);
function method(name) {
  const start = owner.indexOf('}' + name + '(') + 1; assert.ok(start > 0, name);
  const body = owner.indexOf('{', start); let level = 1, end = body + 1;
  while (level && end < owner.length) { if (owner[end] === '{') level++; if (owner[end] === '}') level--; end++; }
  assert.equal(level, 0); return owner.slice(start, end);
}
// These exact native methods run with inert scene/guide stubs and synthetic cards.
const methods = ['computeHandCard', 'layoutHandCard', 'setCardUIPos', 'getHasSelectedCards'].map(method);
const bundle = await build({ stdin: { contents: `export { sortHand } from './src/plugins/cards/native.js'; export { createSortControls } from './src/plugins/cards/sort-controls.js'; export { createHandGrouping } from './src/plugins/cards/hand-groups.js'; export { ResourceScope } from './src/core/resources.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'HandCheck' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1260, height: 440 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body style="margin:0;background:#181b20">');
  await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: `window.hQi={I:()=>({CardUpTime:0})};window.YKi={handCardRight:0};window.dqt={STATE_CARD_MARK_ICON_SIZE:0};window.LKi={I:()=>({UpdateYingBianCardUseGuidePos(){},UpdateNewbieCardUseGuidePos(){}})};window.CapturedHand=class extends Laya.Sprite {${methods.join('\n')}};` });
  await page.evaluate(() => {
    Laya.init(1260, 440); Laya.stage.bgColor = '#181b20';
    const hand = new CapturedHand(); hand.pos(30, 110); hand.width = 1200;
    hand.cardUiSize = { width: 135, height: 190 }; hand.NORMAL_Y = 32; hand.SELECTED_Y = 15; hand.MAX_HGAP = 1; hand.STACK_GAP = 1;
    hand.handCardRect = { x: 0, width: 1150 }; hand.HandCardRect = hand.handCardRect;
    for (const key of ['cardUis', 'muniuCardUis', 'stateCardUis', 'pileCardUis', 'additionalCardUis', 'virtualGeneralUis', 'virtualCardUis', 'equipCardUis']) hand[key] = [];
    hand.muniuCardStartX = 0;
    hand.updateMuniuBg = hand.updateStateBg = hand.ShowZiruoCardEffect = hand.startHandCardTween = () => {};
    hand.resetFlag = () => { hand.invalidateLayoutHandCardFlag = false; };
    hand.invalidateLayoutHandCard = () => hand.layoutHandCard();
    hand.seat = { HandCards: [], SortHandCardsCompare: (a, b) => (a.CardBaseType - b.CardBaseType) || a.CardId - b.CardId };
    hand.SortNormalCards = () => { hand.seat.HandCards.sort(hand.seat.SortHandCardsCompare); hand.cardUis.sort((a, b) => hand.seat.SortHandCardsCompare(a.Card, b.Card)); hand.layoutHandCard(); };
    Laya.stage.addChild(hand);
    const scope = new HandCheck.ResourceScope(), watchers = new Set();
    const palette = { accent: '#ddbe78', bg: '#202127', border: '#87744f', borderSoft: '#514935', highlight: '#81744e', muted: '#bbb4a4', text: '#eee3cc' };
    const values = new Map();
    const ctx = { window, document, scope, settings: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set(key, value) { values.set(key, value); } }, ui: { nativeTheme: { palette, watch(fn) { watchers.add(fn); fn(); return () => watchers.delete(fn); } } } };
    const controller = HandCheck.createHandGrouping(ctx); controller.update(hand);
    const controls = HandCheck.createSortControls(ctx, { sort() {}, lock() {} }); controls.update(hand, null);
    scope.add(() => controls.dispose());
    const title = new Laya.Text(); title.font = 'Microsoft YaHei'; title.fontSize = 20; title.color = '#eae4d5'; title.pos(30, 24); Laya.stage.addChild(title);
    const names = ['杀', '火杀', '闪', '桃', '酒', '新基本牌', '顺手牵羊', '过河拆桥', '无中生有', '铁索连环', '决斗', '南蛮入侵', '万箭齐发', '火攻', '无懈可击', '五谷丰登', '桃园结义', '借刀杀人', '乐不思蜀', '兵粮寸断', '闪电', '新锦囊', '装备甲', '装备乙'];
    const models = names.map((CardName, i) => ({ CardName, CardId: i + 1, CardBaseType: i >= 22 ? 8 : i >= 6 ? 4 : 2, CardNumber: i % 13 + 1, FlowerOnSeat: i % 4 + 1 }));
    window.fixture = { hand, scope, controller, values, watchers, palette, title, models, original: CapturedHand.prototype.layoutHandCard,
      settle() { hand.cardUis.forEach((ui, i) => { ui.pos(ui.EndX, ui.EndY); ui.zOrder = i; }); const root = hand.getChildByName('sgs-hand-groups'); if (root) root.zOrder = 999; },
      render(indices, width, mode) {
        for (const ui of hand.cardUis) ui.destroy(true);
        hand.handCardRect.width = width;
        hand.cardUis = indices.map(index => {
          const ui = new Laya.Sprite(); ui.Card = models[index]; ui.Selected = false; ui.size(135, 190); ui.mouseEnabled = true;
          ui.graphics.drawRect(0, 0, 133, 188, '#e9dfc9', '#87744f', 1);
          const text = new Laya.Text(); text.text = ui.Card.CardName.split('').join('\n'); text.font = 'Microsoft YaHei'; text.fontSize = 16; text.color = '#282820'; text.pos(8, 42); ui.addChild(text);
          const suit = new Laya.Text(); suit.text = ['','♥','♦','♠','♣'][ui.Card.FlowerOnSeat] + '\n' + ui.Card.CardNumber; suit.fontSize = 16; suit.color = ui.Card.FlowerOnSeat < 3 ? '#b43636' : '#282820'; suit.pos(7, 6); ui.addChild(suit);
          ui.on('click', ui, () => { ui.Selected = !ui.Selected; hand.layoutHandCard(); fixture.settle(); });
          hand.addChild(ui); return ui;
        });
        hand.seat.HandCards = hand.cardUis.map(ui => ui.Card);
        controls.update(hand, null);
        HandCheck.sortHand({ getSelfSeatUI: () => ({ cardContainer: hand, sortCardBtn: { enabled: true } }) }, mode);
        this.settle();
      },
      snapshot() { const root = hand.getChildByName('sgs-hand-groups'); return { xs: hand.cardUis.map(ui => ui.x), labels: root?.visible ? root._children.filter(c => c.visible).map(c => c.text) : [], order: hand.cardUis.map(ui => ui.Card.CardName), width: hand.handCardRect.width }; },
    };
  });
  await page.waitForTimeout(60);
  const scenarios = [
    ['roomy', [0, 2, 3, 4], 720, 'type', '类型 · 牌少时分组留白'],
    ['shrinking', [0, 2, 3, 4], 565, 'type', '类型 · 空间不足时逐渐收紧'],
    ['overlap', Array.from({ length: 24 }, (_, i) => 23 - i), 1150, 'type', '类型 · 重叠时显示十组定位'],
    ['narrow', Array.from({ length: 24 }, (_, i) => i), 420, 'type', '类型 · 窄手牌区'],
    ['narrow-280', Array.from({ length: 24 }, (_, i) => i), 280, 'type', '类型 · 280px 手排'],
    ['narrow-248', Array.from({ length: 24 }, (_, i) => i), 248, 'type', '类型 · 248px 手排'],
    ['suit', [0, 1, 4, 6], 720, 'suit', '花色 · 分隔花色，不显示组名'],
    ['number', [0, 1, 13, 15], 720, 'number', '点数 · 分隔点数，不显示组名'],
  ];
  for (const [name, indices, width, mode, title] of scenarios) {
    const snapshot = await page.evaluate(({ indices, width, mode, title }) => { fixture.title.text = title; fixture.render(indices, width, mode); return fixture.snapshot(); }, { indices, width, mode, title });
    assert.ok(snapshot.xs.at(-1) + 135 <= width + 0.01);
    if (name === 'roomy') assert.equal(snapshot.xs[1] - snapshot.xs[0], 169.75);
    if (name === 'shrinking') assert.equal(snapshot.xs[1] - snapshot.xs[0], 147);
    if (name === 'overlap' || name.startsWith('narrow')) assert.deepEqual(snapshot.labels, ['杀', '闪', '桃酒', '未知', '顺拆', '输出', '杂项', '兵乐', '未知', '装备']);
    else assert.deepEqual(snapshot.labels, []);
    await page.waitForTimeout(60); await page.screenshot({ path: `${out}/${name}.png` }); checks.push({ name, ...snapshot });
  }
  const spacing = await page.evaluate(() => {
    fixture.render([0, 2, 3, 4], 720, 'type');
    const button = fixture.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('spacing');
    button.event('click', { stopPropagation() {} }); fixture.settle();
    const compact = fixture.snapshot();
    const saved = fixture.values.get('handGroupSpacing');
    fixture.original.call(fixture.hand); fixture.settle();
    const native = fixture.snapshot();
    button.event('click', { stopPropagation() {} }); fixture.settle();
    return { compact, native, saved, restored: fixture.snapshot() };
  });
  assert.equal(spacing.saved, false);
  assert.deepEqual(spacing.compact.xs, spacing.native.xs);
  assert.deepEqual(spacing.compact.labels, []);
  assert.equal(spacing.restored.xs[1] - spacing.restored.xs[0], 169.75);
  checks.push({ name: 'spacing-toggle-native-parity', ...spacing });
  await page.evaluate(() => {
    fixture.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('spacing').event('click', { stopPropagation() {} }); fixture.settle();
  });
  await page.waitForTimeout(60); await page.screenshot({ path: `${out}/compact.png` });
  await page.evaluate(() => fixture.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('spacing').event('click', { stopPropagation() {} }));
  await page.evaluate(() => fixture.render([0, 2, 3, 4], 720, 'type'));
  await page.waitForTimeout(100);
  await page.mouse.click(42, 190);
  assert.equal(await page.evaluate(() => fixture.hand.cardUis[0].Selected), true);
  assert.equal(await page.evaluate(() => fixture.hand.cardUis[0].y), 15);
  const lifecycle = await page.evaluate(() => {
    fixture.title.text = '类型 · 浅色主题与选中状态';
    fixture.render([0, 1, 2, 3, 4, 6], 650, 'type');
    const hand = fixture.hand; hand.cardUis[1].RollOvered = true; hand.layoutHandCard(); fixture.settle();
    const hoverWidth = hand.cardUis[2].x - hand.cardUis[1].x;
    const groupYs = () => hand.getChildByName('sgs-hand-groups')._children.filter(c => c.visible).map(c => c.y);
    const beforeSelection = groupYs();
    hand.cardUis[1].Selected = true; hand.layoutHandCard(); fixture.settle(); const selectedY = hand.cardUis[1].y;
    const afterSelection = groupYs();
    hand.cardUis[1].Selected = false; hand.layoutHandCard(); fixture.settle();
    const afterDeselect = groupYs();
    if (JSON.stringify(beforeSelection) !== JSON.stringify(afterSelection) || JSON.stringify(beforeSelection) !== JSON.stringify(afterDeselect)) throw new Error('Group row moved during selection');
    hand.cardUis[1].Selected = true; hand.layoutHandCard(); fixture.settle();
    hand.dragIng = true; hand.layoutHandCard(); const dragHidden = !hand.getChildByName('sgs-hand-groups').visible; hand.dragIng = false;
    hand.virtualCardUis.push({ x: 0, y: 0 }); hand.layoutHandCard(); const virtualHidden = !hand.getChildByName('sgs-hand-groups').visible; hand.virtualCardUis = [];
    fixture.palette.accent = '#644a16'; fixture.palette.bg = '#f8f4e9'; fixture.palette.border = '#927236';
    for (const fn of fixture.watchers) fn();
    hand.cardUis[1].RollOvered = false; hand.layoutHandCard(); fixture.settle();
    const bar = hand.getChildByName('sgs-toolbox-hand-sort'), root = hand.getChildByName('sgs-hand-groups');
    const noControlOverlap = root._children.filter(c => c.visible).every(c => c.x + c.width <= bar.x || c.x >= bar.x + bar.width || c.y + c.height <= bar.y || c.y >= bar.y + bar.height);
    return { hoverWidth, selectedY, dragHidden, virtualHidden, noControlOverlap, bar: {x:bar.x,y:bar.y,width:bar.width,height:bar.height,visible:bar.visible}, labels:root._children.filter(c=>c.visible).map(c=>({text:c.text,x:c.x,y:c.y,width:c.width,height:c.height})) };
  });
  assert.equal(lifecycle.hoverWidth, 136); assert.equal(lifecycle.selectedY, 15); assert.equal(lifecycle.dragHidden, true); assert.equal(lifecycle.virtualHidden, true);
  assert.equal(lifecycle.noControlOverlap, true, JSON.stringify(lifecycle));
  await page.waitForTimeout(100); await page.screenshot({ path: `${out}/light-selected.png` });
  const cleaned = await page.evaluate(() => {
    fixture.scope.dispose(); fixture.controller.dispose();
    return { restored: fixture.hand.layoutHandCard === fixture.original, absent: !fixture.hand.getChildByName('sgs-hand-groups'), watchers: fixture.watchers.size };
  });
  assert.deepEqual(cleaned, { restored: true, absent: true, watchers: 0 }); assert.deepEqual(errors, []);
  await writeFile(`${out}/browser-report.json`, JSON.stringify({ scope: 'Cached official native layout methods + real Laya renderer + synthetic cards; not live game', sourceSha256: createHash('sha256').update(source).digest('hex'), methods: methods.map(code => ({ name: code.slice(0, code.indexOf('(')), sha256: createHash('sha256').update(code).digest('hex') })), checks, lifecycle, cleaned, errors }, null, 2));
  console.log('Hand group browser checks passed:', checks.length, 'scenarios + hover/selection/drag/virtual/theme/disposal');
} finally { await browser.close(); }
