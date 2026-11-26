import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export { createGeneralPoolControls } from './src/plugins/player-info/general-pools/index.js';
  export { ResourceScope } from './src/core/resources.js';
  export { createNativeTheme } from './src/ui/native-theme.js';
  export { createPluginNative } from './src/core/plugin-native.js';
` }, bundle: true, write: false, format: 'iife', globalName: 'Check' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = 'test-results/general-pools';
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 620 }, hasTouch: true });
  await page.route('http://general-pools.test/', route => route.fulfill({
    contentType: 'text/html', body: '<body style="margin:0;background:#181713"></body>',
  }));
  await page.goto('http://general-pools.test/');
  const engineRoot = process.env.SGS_LAYA_DIR || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game';
  for (const file of ['laya.core.min.js', 'laya.ui.min.js']) await page.addScriptTag({ path: resolve(engineRoot, file) });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    Laya.init(920, 620);
    Laya.stage.scaleMode = Laya.Stage.SCALE_FULL;
    const view = new Laya.Sprite();
    view.name = 'ModeGeneralPoolWindow';
    view.size(851, 568);
    view.moveCenter = () => {
      view.centerScale = view.scaleX;
      view.pos(Math.round((Laya.stage.width - view.width * view.scaleX) / 2),
        Math.round((Laya.stage.height - view.height * view.scaleY) / 2));
    };
    Laya.stage.on(Laya.Event.RESIZE, view, () => view.moveCenter());
    view.moveCenter();
    view.Schemeid = 1;
    view.graphics.drawRect(0, 0, 851, 568, '#23211d', '#79684e', 2);
    view.graphics.drawRect(126, 80, 706, 402, '#1b1916', '#584f40', 1);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 8; column++) {
        view.graphics.drawRect(145 + column * 84, 109 + row * 120, 65, 92,
          ['#373229', '#3e382e', '#342e26'][(row + column) % 3], '#554937', 1);
      }
    }
    class NativeHost extends Laya.Sprite {
      addDrawChild(node) { this.addChild(node); }
      removeDrawChild(node) { node.destroy(true); }
    }
    class NativeButton extends Laya.Sprite {
      constructor() {
        super();
        this.caption = new Laya.Text();
        this.caption.color = '#ecdbad';
        this.caption.align = 'center';
        this.caption.valign = 'middle';
        this.addChild(this.caption);
        this.mouseEnabled = true;
      }
      set enabled(value) {
        if (!this.mouseEnabled) throw new Error('切换可用状态时改写了原生按钮的命中状态');
        this.activeForClick = value;
      }
      get enabled() { return this.activeForClick; }
      InitSkin(key) { this.skinKey = key; }
      size(width, height) {
        super.size(width, height);
        this.caption.size(width, height);
        this.graphics.drawRect(0, 0, width, height, '#3c2b20', '#79654c', 1);
      }
      set label(value) { this.caption.text = value; }
      set labelSize(value) { this.caption.fontSize = value; }
    }
    view.contentSprite = new NativeHost();
    view.addChild(view.contentSprite);
    const original = new NativeButton();
    original.size(102, 32);
    original.pos(11, 47);
    original.label = '禁将方案';
    view.planSetBtn = original;
    view.contentSprite.addDrawChild(original);
    const tabs = new Laya.Sprite();
    tabs.pos(11, 80);
    tabs.BtnList = [];
    for (const [index, label] of ['百胜', '斗地主', '1242', '山河图', '单骑'].entries()) {
      const tab = new NativeButton();
      tab.size(102, 45); tab.pos(0, index * 48); tab.label = label;
      tabs.BtnList.push(tab); tabs.addChild(tab);
    }
    view.contentSprite.addChild(tabs);
    view.leftTabGroup = tabs;
    view.bg1 = { x: 130, y: 80 };
    let nativeClicks = 0;
    const anchor = new NativeButton();
    anchor.name = 'fixture-game-action';
    anchor.pos(130, 498); anchor.size(112, 34);
    anchor.label = '游戏按钮';
    anchor.on(Laya.Event.CLICK, anchor, () => { nativeClicks++; });
    view.contentSprite.addChild(anchor);
    view.openBtn = anchor;
    view.layout = () => {};
    view.tabGroup = { SelectedValue: 1 };
    const list = new Laya.Text();
    list.pos(132, 43); list.fontSize = 25; list.color = '#eaddc6';
    view.contentSprite.addChild(list);
    const rows = [{ ItemName: '界赵云' }, { GeneralName: '神吕布' }, { Name: '刘备' }];
    view.updateItems = (_panel, items) => { list.text = items.map(row => Object.values(row)[0]).join('   '); };
    view.updateList = tab => view.updateItems(null, tab === 1 ? rows : rows.slice(1));
    Laya.stage.addChild(view);
    view.updateList(1);

    let id = 1;
    const current = { 1: new Set([15]), 2: new Set([22]) };
    const calls = [];
    const native = {
      ShieldGeneralDic: { _maps: { 15: {}, 22: {} } },
      GetAllShieldGeneralSCheme: () => [1, 2].map(i => ({ scheme_id: i, scheme_node: { scheme_name: '原生方案 ' + i } })),
      GetShieldGeneralState: (general, scheme) => current[scheme].has(general),
      SendClientShieldGeneralBatchReq(scheme, close, open) {
        calls.push([scheme, close, open]);
        open.forEach(general => current[scheme].delete(general));
        close.forEach(general => current[scheme].add(general));
      },
    };
    const scope = new Check.ResourceScope();
    const storage = { get: (key, fallback) => JSON.parse(localStorage.getItem(key)) ?? fallback,
      set: (key, value) => localStorage.setItem(key, JSON.stringify(value)) };
    const themeListeners = new Set();
    const themes = {
      current: { tokens: {} },
      subscribe(listener) { themeListeners.add(listener); return () => themeListeners.delete(listener); },
    };
    const ctx = { window, scope, storage,
      themes,
      game: { getSelf: () => ({ ClientId: id }), getClass: name => name === 'GameShieldGeneralManager' ? native : null },
      reportError: error => { throw error; },
    };
    ctx.ui = { nativeTheme: Check.createNativeTheme(ctx) };
    ctx.native = Check.createPluginNative(ctx);
    Check.createGeneralPoolControls(ctx);
    function find(name, node = view) {
      if (node.name === name && node.visible) return node;
      if (!node.visible) return null;
      for (const child of node._children ?? []) {
        const found = find(name, child);
        if (found) return found;
      }
      return null;
    }
    window.fixture = { view, list, calls, scope, current, find, nativeClicks: () => nativeClicks,
      account: value => { id = value; },
      setTheme(tokens) { themes.current = { tokens }; for (const listener of themeListeners) listener(); },
    };
  });
  const hud = 'toolbox-general-pool-hud';
  await page.evaluate(() => {
    const input = fixture.view.contentSprite.getChildByName('toolbox-general-pool-search').getChildAt(0);
    input.text = '赵云';
    input.event(Laya.Event.INPUT);
  });
  assert.equal(await page.evaluate(() => fixture.list.text), '界赵云');
  assert.equal(await page.evaluate(() => {
    fixture.view.tabGroup.SelectedValue = 2;
    fixture.view.updateList(2);
    return fixture.list.text;
  }), '');
  assert.equal(await page.evaluate(() => {
    fixture.view.tabGroup.SelectedValue = 1;
    fixture.view.updateList(1);
    return fixture.list.text;
  }), '界赵云');

  const entry = await page.evaluate(() => {
    const node = fixture.view.contentSprite.getChildByName('toolbox-general-pool-entry');
    return { x: node.x, y: node.y, skin: node.skinKey };
  });
  assert.deepEqual(entry, { x: 11, y: 327, skin: 'modeGeneralPool_tipbg' });
  const read = name => page.evaluate(id => fixture.find(id)?.text, name);
  const exists = name => page.evaluate(id => !!fixture.find(id), name);
  const pointFor = name => page.evaluate(id => {
    const node = fixture.find(id);
    if (!node) throw new Error('缺少控件 ' + id);
    return node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
  }, name);
  const transform = () => page.evaluate(() => {
    const { x, y, scaleX, scaleY } = fixture.view;
    return { x, y, scaleX, scaleY };
  });
  async function assertDock() {
    const rects = await page.evaluate(id => {
      function bounds(node) {
        const start = node.localToGlobal(new Laya.Point(0, 0));
        const end = node.localToGlobal(new Laya.Point(node.width, node.height));
        return { left: start.x, top: start.y, right: end.x, bottom: end.y };
      }
      return { game: bounds(fixture.view), dock: bounds(fixture.find(id)),
        width: Laya.stage.width, height: Laya.stage.height };
    }, hud);
    assert(rects.dock.right + 2 < rects.game.left, JSON.stringify(rects));
    for (const area of [rects.dock, rects.game]) {
      assert(area.left >= 0 && area.top >= 0 && area.right <= rects.width + 0.001 &&
        area.bottom <= rects.height + 0.001, JSON.stringify(rects));
    }
  }
  async function openDock(touch = false, verifyMotion = false) {
    const { x, y } = await pointFor('toolbox-general-pool-entry');
    const startX = (await transform()).x;
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    assert.equal(await exists(hud), true);
    if (verifyMotion) await page.waitForFunction(({ id, from }) => {
      const panel = fixture.find(id);
      return fixture.view.x > from && panel.alpha > 0 && panel.alpha < 1 && !panel.mouseEnabled;
    }, { id: hud, from: startX });
    await page.waitForFunction(id => fixture.find(id)?.mouseEnabled, hud);
    await assertDock();
  }
  const initial = await transform();
  await openDock(false, true);
  const docked = await transform();
  await press('close');
  await page.waitForFunction(({ from, to }) => fixture.view.x < from && fixture.view.x > to,
    { from: docked.x, to: initial.x });
  await page.waitForFunction(value => fixture.view.x === value, initial.x);
  assert.deepEqual(await transform(), initial);
  await openDock();
  const gameAction = await pointFor('fixture-game-action');
  await page.mouse.click(gameAction.x, gameAction.y);
  assert.equal(await page.evaluate(() => fixture.nativeClicks()), 1);
  await page.mouse.click((await pointFor(hud)).x, (await pointFor(hud)).y);
  async function press(name, touch = false) {
    const { x, y } = await pointFor('toolbox-pool-' + name);
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  }
  async function fill(name) {
    const { x, y } = await pointFor('toolbox-general-pool-name');
    await page.mouse.click(x, y);
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(name);
    assert.equal(await read('toolbox-general-pool-name'), name);
    assert.deepEqual(await page.evaluate(() => {
      const input = fixture.find('toolbox-general-pool-name');
      return { focus: input.focus, native: document.activeElement.value, canvasOpacity: input.textField.alpha };
    }), { focus: true, native: name, canvasOpacity: 0 }, '编辑时应只显示原生输入框里的文字');
  }
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('schemes:1')) ?? []);
  const calls = () => page.evaluate(() => fixture.calls);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await exists('toolbox-pool-game-source-0'), false);
  assert.equal(await exists('toolbox-pool-game-target-0'), false);
  await press('mode-save');
  assert.equal(await read('toolbox-general-pool-name'), '原生方案 1');
  await page.screenshot({ path: output + '/save-local.png' });
  await press('submit');
  assert.deepEqual((await saved()).map(row => [row.name, row.ids]), [['原生方案 1', [15]]]);
  assert.deepEqual(await calls(), []);

  await press('game-source-1');
  await press('local-target-1');
  assert.equal(await exists('toolbox-general-pool-name'), false);
  await press('submit');
  assert.equal(await read('toolbox-pool-review-heading'), '确认更新拓展方案');
  assert.match(await read('toolbox-pool-review-impact'), /替换原来的名单/);
  assert.deepEqual((await saved())[0].ids, [15]);
  await page.keyboard.press('Escape');
  assert.equal(await exists('toolbox-pool-review-heading'), false);
  await press('submit');
  await page.evaluate(() => fixture.current[2].add(15));
  await press('confirm');
  assert.match(await read('toolbox-general-pool-status'), /方案有变化/);
  assert.deepEqual((await saved())[0].ids, [15]);
  await press('submit');
  await press('confirm');
  assert.deepEqual((await saved())[0].ids, [15, 22]);
  assert.deepEqual(await calls(), []);

  await press('mode-load');
  assert.equal(await exists('toolbox-pool-game-target-0'), false);
  await press('local-source-0');
  await press('submit');
  assert.equal(await exists('toolbox-pool-review-heading'), false);
  await press('game-target-0');
  await page.screenshot({ path: output + '/load-game.png' });
  await press('submit');
  assert.equal(await read('toolbox-pool-review-heading'), '确认替换游戏名单');
  assert.match(await read('toolbox-pool-review-impact'), /新增禁将 1 名，解除禁将 0 名/);
  await page.screenshot({ path: output + '/confirm-load.png' });
  assert.deepEqual(await calls(), []);
  await press('back');
  assert.deepEqual(await calls(), []);
  await press('submit');
  await press('confirm');
  await page.waitForFunction(() => fixture.find('toolbox-general-pool-status').text.includes('禁将名单已更新'));
  assert.deepEqual(await calls(), [[1, [22], []]]);

  await press('mode-manage');
  await press('local-source-0');
  await fill('保留的长名称拓展禁将方案');
  await page.screenshot({ path: output + '/focused-name.png' });
  await press('submit');
  assert.equal((await saved())[0].name, '保留的长名称拓展禁将方案');
  await press('delete');
  assert.equal(await read('toolbox-pool-review-heading'), '删除这份拓展方案？');
  assert.equal((await saved()).length, 1);
  await press('back');
  assert.equal((await saved()).length, 1);

  await page.evaluate(() => {
    const appended = Array.from({ length: 19 }, (_, index) => ({
      id: 'test-' + index, name: '历史方案 ' + (index + 2), ids: [15],
    }));
    localStorage.setItem('schemes:1', JSON.stringify([...JSON.parse(localStorage.getItem('schemes:1')), ...appended]));
  });
  await press('mode-save');
  assert.equal(await exists('toolbox-general-pool-name'), false);
  await press('mode-manage');
  const listPoint = await pointFor('toolbox-pool-local-source-2');
  // Laya ignores mousemoves within 10 ms of the previous move.
  await page.waitForTimeout(25);
  await page.mouse.move(listPoint.x, listPoint.y);
  for (let index = 0; index < 24; index++) await page.mouse.wheel(0, 120);
  const last = await pointFor('toolbox-pool-local-source-19');
  assert(last.y < listPoint.y + 72, `滚动后应能看见第 20 份方案（${last.y}, ${listPoint.y}）`);
  await press('local-source-19');
  assert.equal(await read('toolbox-general-pool-name'), '历史方案 20');
  await press('delete');
  await press('confirm');
  assert.equal((await saved()).length, 19);

  await press('mode-load');
  await press('local-source-0');
  await press('game-target-1');
  await press('submit');
  await page.evaluate(() => fixture.account(2));
  await page.waitForFunction(() => !fixture.find('toolbox-pool-review-heading') && !fixture.find('toolbox-pool-local-target-1'));
  assert.deepEqual(await calls(), [[1, [22], []]]);
  await page.evaluate(() => {
    fixture.setTheme({ scheme: 'light', bg: '#f5efe1', surface: '#f0e7d6', raised: '#fffaed',
      text: '#382c20', muted: '#6a5742', accent: '#8f5d1e', border: '#aa9270', danger: '#a12d29' });
    fixture.view.scale(0.64, 0.64);
  });
  await page.setViewportSize({ width: 610, height: 420 });
  await page.waitForFunction(() => Laya.stage.width === 610);
  await assertDock();
  assert.equal(await page.evaluate(() => fixture.view.centerScale), 0.64);
  await press('mode-load', true);
  assert.equal(await exists('toolbox-pool-local-source-0'), false);
  await press('mode-save', true);
  assert.equal(await exists('toolbox-pool-local-target-0'), true);
  await press('game-source-1', true);
  assert.equal(await read('toolbox-general-pool-name'), '原生方案 2');
  await page.screenshot({ path: output + '/native-hud.png' });
  await press('close', true);
  assert.equal(await exists(hud), false);
  await page.waitForFunction(() => fixture.view.x === 33);
  assert.deepEqual(await transform(), { x: 33, y: 28, scaleX: 0.64, scaleY: 0.64 });
  await openDock(true);
  await page.evaluate(() => { fixture.view.visible = false; });
  await page.waitForFunction(() => !fixture.view.contentSprite.getChildByName('toolbox-general-pool-entry'));
  assert.deepEqual(await transform(), { x: 33, y: 28, scaleX: 0.64, scaleY: 0.64 });
  await page.evaluate(() => { fixture.view.visible = true; });
  await page.waitForFunction(() => fixture.view.contentSprite.getChildByName('toolbox-general-pool-entry'));
  await page.setViewportSize({ width: 1240, height: 650 });
  await page.waitForFunction(() => Laya.stage.width === 1240);
  await page.evaluate(() => { fixture.view.scale(1, 1); fixture.view.moveCenter(); });
  const shifted = await transform();
  await openDock(true);
  assert.equal((await transform()).scaleX, 1);
  assert((await transform()).x > shifted.x);
  await press('close', true);
  await page.waitForFunction(value => fixture.view.x === value, shifted.x);
  assert.deepEqual(await transform(), shifted);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await pointFor('toolbox-general-pool-entry');
  await page.touchscreen.tap(reduced.x, reduced.y);
  assert.equal(await page.evaluate(id => fixture.find(id)?.mouseEnabled, hud), true);
  await assertDock();
  await press('close', true);
  assert.deepEqual(await transform(), shifted);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1600, height: 690 });
  await page.waitForFunction(() => Laya.stage.width === 1600);
  await page.evaluate(() => { fixture.view.scale(1, 1); fixture.view.moveCenter(); });
  const wide = await transform();
  await openDock(true);
  assert.deepEqual(await transform(), wide);
  await page.screenshot({ path: output + '/dock-wide.png' });
  assert.equal(await page.evaluate(() => {
    fixture.scope.dispose();
    return fixture.list.text;
  }), '界赵云   神吕布   刘备');
  assert.equal(await exists(hud), false);
  assert.deepEqual(await transform(), wide);
  console.log('拓展将池 Laya 演练通过：左侧停靠、将池点击与还原、流程、滚动、键鼠与触控');
} finally {
  await browser.close();
}
