import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { manifest } from '../src/plugins/play-assist/index.js';

const output = resolve('test-results/peixiu');
const client = await readFile(process.env.SGS_CLASSIC_SOURCE || 'test-results/reference/client-static/sgsGame_a.js', 'utf8');
const hitStart = client.indexOf('getTextureByPosition(t,i){let s=null');
const hitEnd = client.indexOf('UpdateTweenPos(t)', hitStart);
assert.ok(hitStart >= 0 && hitEnd > hitStart, 'classic flat card hit testing is present in the cached client');
const nativeHitTest = client.slice(hitStart, hitEnd);
const laya = process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js');
const bundle = (await build({
  stdin: { contents: [
    "export { default as plugin } from './src/plugins/play-assist/index.js';",
    "export { ResourceScope } from './src/core/resources.js';",
    "export { createNativeTheme } from './src/ui/native-theme.js';",
    "export { mountPluginUI } from './src/ui/plugin-ui.js';",
  ].join('\n'), resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'PeixiuFixture',
})).outputFiles[0].text;
const checks = [], errors = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function setup(options, jizhou = false, classic = false) {
  const context = await browser.newContext(options);
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#101918"><div data-sgs-toolbox="core"></div><aside id="assist-options" style="position:fixed;top:0;left:0;z-index:100;width:248px;background:#201e1a" hidden></aside></body>');
  await page.addScriptTag({ path: laya });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(({ nativeMethod, jizhou, classic }) => {
    Laya.init(1320, 760);
    const stage = Laya.stage;
    stage.scaleMode = Laya.Stage.SCALE_SHOWALL;
    stage.alignH = Laya.Stage.ALIGN_CENTER;
    stage.alignV = Laya.Stage.ALIGN_MIDDLE;
    stage.bgColor = '#223434';
    const font = 'Microsoft YaHei';
    function sprite(parent, name, x, y, width, height, color) {
      const node = new Laya.Sprite();
      node.name = name; node.pos(x, y); node.size(width, height);
      if (color) node.graphics.drawRect(0, 0, width, height, color);
      parent.addChild(node);
      return node;
    }
    function text(parent, value, x, y, size, color) {
      const item = new Laya.Text();
      Object.assign(item, { text: value, font, fontSize: size, color, mouseEnabled: false });
      item.pos(x, y); parent.addChild(item);
      return item;
    }
    const layer = sprite(stage, 'BackgroundLayer', 0, 0, 1320, 760); layer.layerOrder = 1;
    const map = sprite(layer, 'PeiXiuMapBackground', 0, 0, 1320, 760);
    const tableWidth = classic ? 1080 : jizhou ? 1220 : 1320;
    map.getTableViewportWidth = () => tableWidth;
    map.scrollEffect = jizhou ? sprite(map, 'scrollEffect', 18, 70, 1180, 556, '#8c7355')
      : sprite(map, 'scrollEffect', 246, 156, 828, 384, '#8c7355');
    map.panel = jizhou ? sprite(map, 'panel', 44, 154, 1090, 450, '#b69d73')
      : sprite(map, 'panel', 282, 189, 756, 322, '#b69d73');
    const cellWidth = jizhou ? 146 : 132, cellHeight = jizhou ? 48 : 43;
    map.boardLayer = sprite(map, 'boardLayer', jizhou ? 250 : 334, jizhou ? 245 : 230, cellWidth * 5, cellHeight * 5);
    map.boardLayer.skewX = -10;
    map.boardRoot = sprite(map.boardLayer, 'boardRoot', 0, 0, cellWidth * 5, cellHeight * 5);
    map.cityNameRoot = sprite(map, 'cityNameRoot', jizhou ? 194 : 300, 228, 29, 42, '#5b3830');
    text(map.cityNameRoot, jizhou ? '冀' : '梁', 5, 7, 21, '#ffe8b5');
    const cells = jizhou ? [7, 8, 9, 11, 12, 13, 14, 17, 18, 19, 20, 23] : [3, 4, 7, 8, 9, 12, 13, 14, 18, 19, 20, 24];
    const mapConfig = { Cells: cells, PreCell: 13, name: jizhou ? '冀州' : '梁州',
      SpecialCells: (jizhou ? [[17, 3, 2, 1], [11, 1, 1], [19, 2, 1], [9, 1, 2]] : [[4, 3, 4, 3], [12, 2, 1], [8, 1, 1], [20, 1, 2]])
        .map(([CellID, EffectID, Param1, Param2]) => ({ CellID, EffectID, Param1, Param2 })),
      RewardCells: (jizhou ? [9, 11, 17, 19, 26] : [4, 8, 12, 20, 26]).map(CellID => ({ CellID })),
    };
    map.boardCellSlots = Array.from({ length: 25 }, (_, index) => {
      const node = sprite(map.boardRoot, 'cell-' + (index + 1),
        (index % 5) * cellWidth, Math.floor(index / 5) * cellHeight, cellWidth - 3, cellHeight - 3);
      node.visible = cells.includes(index + 1);
      return node;
    });
    function updateMap(currentPos, drawnCells) {
      map.mapState = { mapId: jizhou ? 4 : 11, currentPos, drawnCells, mapConfig };
      for (const id of cells) {
        const tile = map.boardCellSlots[id - 1];
        const color = id === currentPos ? '#729875' : drawnCells.includes(id) ? '#cbb486'
          : mapConfig.RewardCells.some(city => city.CellID === id) ? '#d3a268' : '#e9d7ac';
        tile.graphics.clear();
        tile.graphics.drawRect(0, 0, tile.width, tile.height, color, '#8a6a47', 1);
      }
    }
    updateMap(13, []);
    const scene = sprite(stage, 'TableGameScene', 0, 0, 1320, 760);
    const avatars = jizhou ? [
      [290, 8, '#78604c'], [506, 8, '#5b7050'], [722, 8, '#6b5054'],
      [0, 122, '#674244'], [0, 326, '#656152'], [1038, 122, '#565349'], [1038, 326, '#657050'],
    ].map(([x, y, color], index) => {
      const portrait = sprite(scene, 'seat-' + (index + 1), x, y, 168, 184, color);
      portrait.graphics.drawRect(0, 0, portrait.width, portrait.height, null, '#d4b587', 2);
      return portrait;
    }) : [];
    scene.seatContainer = { seatUIs: avatars.map(seatAvatar => ({ seatAvatar })) };
    const windowLayer = sprite(stage, 'WindowLayer', 0, 0, 1320, 760);
    windowLayer.layerOrder = 4;
    const self = sprite(scene, 'self', 0, 0, 1320, 760);
    scene.SelfSeatUi = self;
    self.seat = { IsSelf: true, IsDead: false, InOwnRound2: true, HasSkill: id => id === 4021 };
    const bar = classic ? sprite(self, 'buttonBar', 75, 530, tableWidth - 150, 80)
      : sprite(self, 'buttonBar', 0, 0, 1320, 760);
    if (classic) bar.SetActualSize = () => {};
    const okX = classic ? bar.width / 2 - 40 : 594;
    const okY = classic ? 40 : jizhou ? 591 : 551;
    const ok = sprite(bar, 'btnOK', okX, okY, 80, 43, '#267065');
    const cancel = sprite(bar, 'btnCancel', ok.x + 114, ok.y, 80, 43, '#354340');
    text(ok, '确定', 20, 8, 20, '#fff3cb'); text(cancel, '取消', 20, 8, 20, '#fff3cb');
    bar.txtOptMsg = sprite(bar, 'action-prompt', classic ? 392 : 467, classic ? -12 : jizhou ? 540 : 496, 310, 24);
    text(bar.txtOptMsg, '出牌阶段，请选择一张卡牌', 0, 1, 20, '#fff3cb');
    self.countdownTimer = classic ? sprite(self, 'countdown', 345, 550, 390, 12, '#9f352b')
      : sprite(self, 'countdown', 416, jizhou ? 575 : 532, 390, 9, '#9f352b');
    let confirms = 0;
    ok.on('click', ok, () => confirms++);
    bar.btns = [ok, cancel].map(node => ({
      name: node.name, width: node.width, height: node.height, x: node.x, y: node.y, visible: true,
    }));
    self.getButtonBar = () => bar;
    const hand = sprite(self, 'cardContainer', 0, classic ? 591 : 620, 1320, classic ? 169 : 140);
    hand.NORMAL_Y = classic ? 32 : 19;
    hand.SELECTED_Y = classic ? 15 : 10;
    hand.mouseThrough = true;
    self.cardContainer = hand;
    hand.cardUis = []; hand.equipCardUis = []; hand.textureList = [];
    hand.areChoosingCard = true; hand.selectCardContext = { Skill: { SkillId: 4023 } };
    hand.getTextureByPosition = new Function('Laya', 'return ({' + nativeMethod + '}).getTextureByPosition')(Laya);
    // The classic flat renderer resolves overlapping cards in reverse texture order on click.
    hand.graphics.drawRect(0, 0, hand.width, hand.height, '#1c2a27');
    hand.mouseThrough = false;
    hand.on('click', hand, event => hand.getTextureByPosition(event.stageX, event.stageY)?.ui.CardUI_Click(null));
    function addCard(id, suit, name, x, y, equip = false) {
      const width = equip ? 116 : 83, height = equip ? 29 : 108;
      const visual = sprite(hand, name, x, y, width, height, equip ? '#7b6d52' : '#e9d9b4');
      const symbols = ['', '♥', '♦', '♠', '♣'];
      text(visual, symbols[suit], 7, 4, equip ? 16 : 20, suit <= 2 ? '#a72728' : '#2c2a26');
      text(visual, name, equip ? 26 : 11, equip ? 5 : 45, equip ? 15 : 21, equip ? '#fff3cb' : '#31271d');
      const ui = {
        Card: { CardId: id, FlowerOnSeat: suit, Selected: false }, Activated: true, clicks: 0,
        CardUI_Click() {
          this.clicks++;
          this.Card.Selected = !this.Card.Selected;
          visual.y = y - Number(this.Card.Selected) * (hand.NORMAL_Y - hand.SELECTED_Y);
        },
      };
      const face = { ui, mouseEnabled: true, renderVisible: true, render: hand, renderX: x,
        get renderY() { return visual.y; }, renderWidth: width, renderHeight: height, alpha: 1 };
      ui.bmpFace = face;
      hand.textureList.push(face);
      (equip ? hand.equipCardUis : hand.cardUis).push(ui);
      return ui;
    }
    addCard(10, 1, '杀', 316, hand.NORMAL_Y);
    addCard(11, 1, '桃', 379, hand.NORMAL_Y);
    addCard(12, 1, '闪', 442, hand.NORMAL_Y);
    addCard(13, 3, '过拆', 505, hand.NORMAL_Y);
    addCard(14, 4, '杀', 568, hand.NORMAL_Y);
    addCard(15, 2, '酒', 631, hand.NORMAL_Y);
    addCard(20, 1, '赤兔', 135, 45, true);
    addCard(21, 2, '方天', 135, 77, true);
    let currentScene = scene, replay = false;
    const scope = new PeixiuFixture.ResourceScope();
    const themeListeners = new Set();
    const preferences = new Map([['autoConfirm', true]]);
    const themes = { current: { tokens: {} },
      subscribe(callback) { themeListeners.add(callback); return () => themeListeners.delete(callback); } };
    const context = { window, document, scope };
    const options = document.getElementById('assist-options');
    const ui = { ...PeixiuFixture.mountPluginUI(context, () => context),
      nativeTheme: PeixiuFixture.createNativeTheme({ themes, window, scope }),
      registerPanel(panel) { scope.add(panel.render(options)); },
    };
    scope.add(PeixiuFixture.plugin.activate({ ...context, ui,
      settings: { get: (key, fallback) => preferences.get(key) ?? fallback, set: (key, value) => preferences.set(key, value) },
      game: { getScene: () => currentScene, getSnapshot: () => ({ inGame: !!currentScene, isReplay: replay }),
        getClass: () => ({ IsViewerOrReplay: () => replay }), isReplay: () => replay },
    }));
    window.fixture = {
      map, updateMap, hand, ok, bar, scene, self, scope, windowLayer,
      get confirms() { return confirms; },
      moveMiddlePortrait(y) { avatars[1].y = y; },
      setScene(value) { currentScene = value ? scene : null; },
      setReplay(value) { replay = value; },
      showOptions(value) { options.hidden = !value; },
      addCard,
      light() {
        themes.current.tokens = { scheme: 'light', bg: '#f6f1e5', text: '#28251b',
          surface: '#fffbef', accent: '#74501c', border: '#a29275', danger: '#9e262e' };
        for (const callback of themeListeners) callback();
      },
      point(x, y) {
        const rect = document.getElementById('layaCanvas').getBoundingClientRect();
        return { x: rect.left + x * rect.width / stage.width, y: rect.top + y * rect.height / stage.height };
      },
      bounds(node, x = 0, y = 0, width = node.width, height = node.height) {
        const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]].map(([a, b]) => {
          const global = node.localToGlobal(new Laya.Point(a, b));
          return this.point(global.x, global.y);
        });
        return { left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)),
          right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y)) };
      },
      bareMapRect() { return this.bounds(map.scrollEffect); },
      routeGeometry() {
        const tiles = map.boardCellSlots.filter(node => node.visible).map(node => this.bounds(node));
        return {
          table: this.bounds(map, 0, 0, map.getTableViewportWidth(), map.height),
          board: { left: Math.min(...tiles.map(box => box.left)), right: Math.max(...tiles.map(box => box.right)),
            top: Math.min(...tiles.map(box => box.top)), bottom: Math.max(...tiles.map(box => box.bottom)) },
          obstacles: [...avatars, map.cityNameRoot, ok, cancel, bar.txtOptMsg, self.countdownTimer].map(node => this.bounds(node))
            .concat(hand.textureList.map(face => this.bounds(hand, face.renderX, face.renderY, face.renderWidth, face.renderHeight))),
        };
      },
    };
  }, { nativeMethod: nativeHitTest, jizhou, classic });
  await page.locator('.routes').waitFor();
  await page.locator('.suits').waitFor();
  return { page, context };
}

const selected = page => page.evaluate(() => [...fixture.hand.cardUis, ...fixture.hand.equipCardUis]
  .filter(ui => ui.Card.Selected).map(ui => ui.Card.CardId));
const clickCount = page => page.evaluate(() => fixture.hand.cardUis.map(ui => ui.clicks));
const point = (page, x, y) => page.evaluate(([px, py]) => fixture.point(px, py), [x, y]);
const rightOn = async (page, x, y) => { const p = await point(page, x, y); await page.mouse.click(p.x, p.y, { button: 'right' }); };
const button = (page, suit) => page.locator(`[data-sgs-peixiu] button[data-suit="${suit}"]`);
async function setFont(page, offset) {
  await page.evaluate(value => document.querySelector('[data-sgs-toolbox="core"]').style.setProperty('--sgs-font-offset', value + 'px'), offset);
  await page.waitForFunction(size => getComputedStyle(document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.move')).fontSize === size + 'px', 24 + offset);
}
function intersects(a, b) {
  return a.x < b.right && a.x + a.width > b.left && a.y < b.bottom && a.y + a.height > b.top;
}
async function layout(page) {
  const { table, board, obstacles } = await page.evaluate(() => fixture.routeGeometry());
  const routes = await page.locator('.routes').boundingBox();
  const suits = await page.locator('.suits').boundingBox();
  const confirm = await page.evaluate(() => fixture.bounds(fixture.ok));
  assert.ok(routes && suits);
  assert.ok(!intersects(routes, board), 'routes are outside the visible native map cells');
  assert.ok(obstacles.every(box => !intersects(routes, box)), 'routes clear the portraits, controls, cards and region seal');
  assert.ok(routes.x >= table.left && routes.x + routes.width <= table.right && routes.y >= 0
    && routes.y + routes.height <= page.viewportSize().height, 'routes stay within the visible game width and viewport');
  const inTable = routes.y >= table.top && routes.y + routes.height <= table.bottom;
  const gaps = [board.top - (routes.y + routes.height), routes.y - board.bottom,
    board.left - (routes.x + routes.width), routes.x - board.right];
  const gutterGaps = [table.top - (routes.y + routes.height), routes.y - table.bottom];
  assert.ok((inTable ? gaps : gutterGaps).some(gap => gap >= 7 && gap <= 10), 'routes dock to the visible grid or the edge of a letterboxed table');
  assert.ok(!intersects(suits, board), 'suit buttons are outside the visible map cells');
  assert.ok(obstacles.every(box => !intersects(suits, box)), 'suit buttons clear native portraits, cards and controls');
  assert.ok(!intersects(routes, confirm), 'routes are outside the native confirm button');
  assert.ok(suits.x + suits.width < confirm.left, 'suit buttons are to the left of the native confirm button');
  assert.ok(suits.y >= table.top && suits.x >= table.left
    && suits.x + suits.width <= table.right && suits.y + suits.height <= table.bottom,
  'suit buttons stay inside the visible table');
  assert.ok(!intersects(routes, { left: suits.x, top: suits.y, right: suits.x + suits.width, bottom: suits.y + suits.height }));
  assert.ok(await page.locator('.suits').evaluate(group => [...group.querySelectorAll('button')].every(button => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return group.getRootNode().elementFromPoint(x + width / 2, y + height / 2) === button;
  })), 'every fixed suit button receives clicks at its center');
  assert.ok(await page.locator('.routes').evaluate(node => [...node.querySelectorAll('.move')].every(move => {
    const { left, right } = node.getBoundingClientRect();
    const rect = move.getBoundingClientRect();
    return /^[♥♦♠♣]\uFE0E$/u.test(move.textContent) && Number.parseFloat(getComputedStyle(move).fontSize) >= 22
      && rect.left >= left && rect.right <= right;
  })), 'the large suit symbols stay within the route panel');
  return { routes, board, suits };
}
const take = (page, name) => page.screenshot({ path: resolve(output, name + '.png') });

try {
  const desktop = await setup({ viewport: { width: 1320, height: 760 } });
  const { page } = desktop;
  await page.evaluate(() => fixture.showOptions(true));
  const toggle = page.getByRole('switch', { name: '裴秀辅助', exact: true });
  assert.equal(await toggle.isChecked(), true);
  await toggle.press('Space');
  await page.locator('[data-sgs-peixiu]').waitFor({ state: 'detached' });
  await toggle.press('Space');
  await page.locator('.routes').waitFor();
  assert.equal(await page.locator('[data-sgs-peixiu]').count(), 1);
  await page.evaluate(() => fixture.showOptions(false));
  checks.push('出牌辅助开关可启停裴秀路线和花色按钮，重新开启只挂载一套');
  const { suits: fixedSuits } = await layout(page);
  assert.ok(await page.locator('.routes li').count() >= 2);
  assert.ok(await page.locator('.routes').evaluate(node => !node.querySelector('p')
    && /^[♥♦♠♣\uFE0E\s]+$/u.test(node.innerText)), 'a complete plan only displays the suit sequences');
  await page.evaluate(() => {
    fixture.bar.pos(68, -35);
    fixture.hand.cardUis[0].CardUI_Click();
  });
  await page.locator('button[data-suit="1"][aria-pressed="mixed"]').waitFor();
  assert.deepEqual((await layout(page)).suits, fixedSuits, 'moving the native bar and picking a card leaves the suits in place');
  await page.evaluate(() => {
    fixture.bar.pos(0, 0);
    fixture.hand.cardUis[0].CardUI_Click();
  });
  await page.locator('button[data-suit="1"][aria-pressed="false"]').waitFor();
  const before = await page.locator('.routes').innerText();
  await rightOn(page, 335, 665);
  await rightOn(page, 180, 715);
  assert.equal(await page.locator('.lock').count(), 2);
  const heartBox = await button(page, 1).boundingBox();
  await button(page, 1).click();
  assert.deepEqual(await selected(page), [11, 12, 20]);
  await button(page, 3).click();
  assert.deepEqual(await selected(page), [11, 12, 13, 20]);
  assert.deepEqual(await Promise.all([1, 3].map(suit => button(page, suit).getAttribute('aria-pressed'))), ['true', 'true']);
  await page.mouse.click(heartBox.x + heartBox.width / 2, heartBox.y + heartBox.height / 2);
  assert.deepEqual(await selected(page), [13]);
  assert.equal(await button(page, 1).getAttribute('aria-pressed'), 'false');
  const manualHeart = await point(page, 395, 665);
  await page.mouse.click(manualHeart.x, manualHeart.y);
  await page.locator('button[data-suit="1"][aria-pressed="mixed"]').waitFor();
  await button(page, 1).press('Enter');
  assert.deepEqual(await selected(page), [11, 12, 13, 20]);
  await button(page, 1).click({ button: 'right' });
  assert.deepEqual(await selected(page), [13, 14, 15]);
  await button(page, 3).focus();
  await page.keyboard.press('Shift+Enter');
  assert.deepEqual(await selected(page), [11, 12, 14, 15, 20]);
  assert.equal(await page.evaluate(() => fixture.confirms), 0);
  await take(page, 'desktop-dark');
  await rightOn(page, 335, 665);
  assert.equal(await page.locator('.lock').count(), 1);
  await button(page, 1).click();
  assert.deepEqual(await selected(page), [10, 11, 12, 14, 15, 20]);
  await page.evaluate(() => {
    for (const card of fixture.hand.cardUis) card.Activated = false;
    fixture.hand.equipCardUis[0].CardUI_Click();
  });
  await page.locator('button[data-suit="1"][aria-pressed="false"]').waitFor();
  await button(page, 1).click();
  assert.deepEqual(await selected(page), [10, 11, 12, 14, 15, 20], 'equipped cards are selectable on their own');
  await page.evaluate(() => { for (const card of fixture.hand.cardUis) card.Activated = true; });
  checks.push('手牌与装备可按花色叠加、取消、补齐和反选，只有装备可选时也能批选，锁定和手动确定照常');

  await page.evaluate(() => fixture.updateMap(12, [12]));
  await page.waitForFunction(value => document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.routes').innerText !== value, before);
  await page.evaluate(() => fixture.updateMap(7, [4, 12, 20]));
  await page.locator('.routes li[aria-label="黑桃"]').waitFor();
  assert.equal(await page.locator('.routes li').count(), 1);
  assert.ok((await page.locator('.routes').boundingBox()).width < 90);
  await page.evaluate(() => {
    fixture.updateMap(7, [4, 12, 20]);
    fixture.map.mapState.mapConfig = {
      ...fixture.map.mapState.mapConfig, Cells: [7, 8, 25], RewardCells: [{ CellID: 8 }, { CellID: 25 }],
    };
  });
  await page.locator('.routes').waitFor({ state: 'hidden' });
  await page.evaluate(() => fixture.updateMap(13, []));
  await page.locator('.routes').waitFor();
  await page.evaluate(() => { fixture.map.isScrollDisappearPlaying = true; });
  await page.locator('.routes').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.locator('.suits').boundingBox(), fixedSuits);
  await page.evaluate(() => { fixture.map.isScrollDisappearPlaying = false; fixture.updateMap(13, []); });
  await page.locator('.routes').waitFor();
  await page.evaluate(() => fixture.light());
  for (const offset of [-2, -1, 0, 2]) {
    await setFont(page, offset);
    await layout(page);
  }
  await take(page, 'desktop-light');
  checks.push('地图位置及已绘格变化更新路线，地图关闭时收起提示，检查了深浅主题和四档字号');

  await page.evaluate(() => {
    fixture.hand.equipCardUis.splice(1, 1);
    fixture.hand.textureList.pop();
    fixture.addCard(22, 4, '护甲', 135, 77, true);
  });
  await page.locator('.lock').waitFor({ state: 'hidden' });
  await page.evaluate(() => { fixture.hand.selectCardContext = { Skill: { SkillId: 3910 } }; });
  await page.locator('.suits').waitFor({ state: 'hidden' });
  await page.evaluate(() => fixture.setReplay(true));
  await page.locator('.routes').waitFor({ state: 'hidden' });
  await page.evaluate(() => fixture.setReplay(false));
  await page.locator('.routes').waitFor();
  await page.evaluate(() => fixture.setScene(false));
  await page.locator('.routes').waitFor({ state: 'hidden' });
  await page.evaluate(() => fixture.scope.dispose());
  assert.equal(await page.locator('[data-sgs-peixiu]').count(), 0);
  checks.push('移除换出的装备锁，其他选牌、回放、离桌和停用时收起相应界面');
  await desktop.context.close();

  const classic = await setup({ viewport: { width: 1320, height: 760 } }, false, true);
  const classicRow = (await layout(classic.page)).suits;
  const classicAnchors = await classic.page.evaluate(() => ({
    hand: fixture.bounds(fixture.hand), confirm: fixture.bounds(fixture.ok), countdown: fixture.bounds(fixture.self.countdownTimer),
  }));
  assert.ok(classicRow.y < classicAnchors.hand.top && classicRow.y + classicRow.height > classicAnchors.hand.top);
  assert.ok(Math.abs(classicRow.y + classicRow.height / 2 - (classicAnchors.confirm.top + classicAnchors.confirm.bottom) / 2) <= .5);
  assert.ok(!intersects(classicRow, classicAnchors.countdown));
  await classic.page.evaluate(() => {
    fixture.bar.pos(68, -35);
    fixture.hand.cardUis[0].CardUI_Click();
  });
  await classic.page.locator('button[data-suit="1"][aria-pressed="mixed"]').waitFor();
  assert.deepEqual(await classic.page.locator('.suits').boundingBox(), classicRow);
  await classic.context.close();
  checks.push('经典版带聊天栏的采风按钮与原生确定同排，可使用手牌容器顶部留白，操作栏平移和手牌上浮时坐标一致');

  const reference = await setup({ viewport: { width: 2041, height: 1212 } });
  await layout(reference.page);
  await reference.context.close();

  const practice = await setup({ viewport: { width: 1850, height: 1207 } }, true);
  let placement = await layout(practice.page);
  const practiceSuits = placement.suits;
  assert.ok(placement.routes.y + placement.routes.height < placement.board.top, 'the wide practice table puts the route above its cells');
  assert.ok(Math.abs(placement.routes.x + placement.routes.width / 2 - (placement.board.left + placement.board.right) / 2) <= 1,
    'the route is centered over the visible cells');
  assert.ok(await practice.page.locator('.routes').evaluate(node => node.hasAttribute('data-horizontal')));
  await practice.page.evaluate(() => { fixture.hand.selectCardContext = { Purpose: 'deal' }; });
  await practice.page.locator('.suits').waitFor({ state: 'hidden' });
  assert.equal(await practice.page.locator('.routes li').count(), 3);
  await take(practice.page, 'jizhou-route-position');
  await practice.page.evaluate(() => { fixture.hand.selectCardContext = { Skill: { SkillId: 4023 } }; fixture.moveMiddlePortrait(103); });
  await practice.page.locator('.suits').waitFor();
  assert.deepEqual(await practice.page.locator('.suits').boundingBox(), practiceSuits);
  await practice.page.waitForFunction(() => {
    const route = document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.routes');
    return route.getBoundingClientRect().top > fixture.routeGeometry().board.bottom;
  });
  placement = await layout(practice.page);
  assert.ok(placement.routes.y > placement.board.bottom, 'an encroaching portrait moves the route below the grid');
  await take(practice.page, 'jizhou-route-below');
  await practice.context.close();
  checks.push('冀州八人桌按实际可见格定位，默认在上沿居中，武将牌占用上沿时转到下沿');

  const mobile = await setup({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const touchPage = mobile.page;
  const session = await mobile.context.newCDPSession(touchPage);
  await layout(touchPage);
  async function hold(position, dragTo) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
    if (dragTo) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [dragTo] });
    await touchPage.waitForTimeout(570);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.waitForTimeout(110);
  }
  const card = await point(touchPage, 335, 665);
  const equipment = await point(touchPage, 180, 715);
  const initialClicks = await clickCount(touchPage);
  await hold(card);
  assert.deepEqual(await clickCount(touchPage), initialClicks, 'holding the card suppresses the release tap');
  await hold(equipment);
  assert.equal(await touchPage.locator('.lock').count(), 2);
  await button(touchPage, 1).tap();
  assert.deepEqual(await selected(touchPage), [11, 12, 20]);
  await button(touchPage, 2).tap();
  assert.deepEqual(await selected(touchPage), [11, 12, 15, 20]);
  const heart = await button(touchPage, 1).boundingBox();
  await hold({ x: heart.x + heart.width / 2, y: heart.y + heart.height / 2 });
  assert.deepEqual(await selected(touchPage), [13, 14, 15], 'holding a suit selects the complement');
  await take(touchPage, 'mobile-landscape');
  await hold(card);
  assert.equal(await touchPage.locator('.lock').count(), 1);
  const ordinary = await point(touchPage, 339, 668);
  await touchPage.touchscreen.tap(ordinary.x, ordinary.y);
  await touchPage.waitForFunction(() => fixture.hand.cardUis[0].Card.Selected);
  await hold(await point(touchPage, 455, 665), await point(touchPage, 495, 665));
  assert.equal(await touchPage.locator('.lock').count(), 1, 'dragging is not a lock gesture');
  assert.equal(await touchPage.evaluate(() => fixture.confirms), 0);
  checks.push('移动端长按锁定、解除及反选，普通轻点仍由游戏处理，拖动不触发锁定');
  await mobile.context.close();
  for (const [width, height, name, jizhou] of [[390, 844, 'mobile-portrait', false], [1180, 820, 'tablet-landscape', false],
    [768, 1024, 'tablet-portrait', true], [540, 820, 'tablet-split', true]]) {
    const sized = await setup({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, jizhou);
    const fixed = (await layout(sized.page)).suits;
    for (const offset of [-2, -1, 0, 2]) {
      await setFont(sized.page, offset);
      assert.deepEqual((await layout(sized.page)).suits, fixed);
      if (offset === 0) await take(sized.page, name);
    }
    await sized.page.evaluate(() => {
      fixture.bar.pos(68, -35);
      fixture.hand.cardUis[0].CardUI_Click();
      fixture.map.isScrollDisappearPlaying = true;
    });
    await sized.page.locator('.routes').waitFor({ state: 'hidden' });
    assert.deepEqual(await sized.page.locator('.suits').boundingBox(), fixed);
    await sized.page.evaluate(() => { fixture.hand.selectCardContext = { Purpose: 'deal' }; });
    await sized.page.locator('.suits').waitFor({ state: 'hidden' });
    await sized.page.evaluate(() => {
      fixture.bar.pos(0, 0);
      fixture.hand.selectCardContext = { Skill: { SkillId: 4023 } };
      fixture.map.isScrollDisappearPlaying = false;
    });
    await sized.page.locator('.routes').waitFor();
    assert.deepEqual((await layout(sized.page)).suits, fixed);
    await sized.context.close();
  }
  checks.push('花色按钮落在用户截图中「确定」左侧、手牌上方的空位，移动原生按钮栏、选牌、收卷和下次采风时坐标一致');
  checks.push('四档字号在手机竖屏及平板横屏、竖屏、分屏保持路线可读，花色按钮固定且可点击');
  assert.deepEqual(errors, []);
  console.log(checks.join('\n'));
} finally {
  await browser.close();
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ version: manifest.version, checks, errors }, null, 2));
}
