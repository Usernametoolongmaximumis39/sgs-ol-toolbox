import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { nativeWallpaperFixture } from './native-wallpaper-fixture.mjs';

const out = resolve('test-results/background-history');
await mkdir(out, { recursive: true });
const { nativeClass, nativeMethod } = await nativeWallpaperFixture(resolve('test-results/reference/client-static/sgsGame_a.js'));
const currentClient = await nativeWallpaperFixture();
const source = await build({ stdin: { contents: `
  export { default as backgroundsPlugin } from './src/plugins/backgrounds/index.js';
  export { BackgroundRegistry } from './src/core/backgrounds.js';
  export { localBackgroundImage } from './src/core/background-local.js';
  export { ResourceScope } from './src/core/resources.js';
  export { Settings } from './src/core/storage.js';
  export { SessionJournal } from './src/core/session.js';
  export { PluginManager } from './src/core/plugins.js';
  export { ThemeRegistry } from './src/core/themes.js';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'Check' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 }, hasTouch: true });
  page.setDefaultTimeout(7500);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith('https://background-history.fixture/res/')) requests.push(request.url());
  });
  await page.route('https://background-history.fixture/', route => route.fulfill({
    contentType: 'text/html', body: '<body style="margin:0"><div data-sgs-toolbox="core"></div></body>',
  }));
  const makeImage = async (name, color) => ({
    name, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(color => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const draw = canvas.getContext('2d');
      draw.fillStyle = color; draw.fillRect(0, 0, 640, 360);
      draw.fillStyle = '#f2d88d'; draw.beginPath(); draw.arc(414, 100, 44, 0, 2 * Math.PI); draw.fill();
      draw.fillStyle = '#27323b';
      draw.beginPath(); draw.moveTo(0, 360); draw.lineTo(180, 98); draw.lineTo(300, 272);
      draw.lineTo(450, 169); draw.lineTo(640, 360); draw.fill();
      return canvas.toDataURL().split(',')[1];
    }, color), 'base64'),
  });
  const mount = async () => {
    await page.goto('https://background-history.fixture/');
    await page.addScriptTag({ path: 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js' });
    await page.addScriptTag({ content: source.outputFiles[0].text });
    await page.evaluate(() => {
      Laya.init(innerWidth, innerHeight);
      Laya.stage.bgColor = '#253640';
      const txt = (parent, value, width, height, color, size) => {
        const label = new Laya.Text();
        Object.assign(label, { text: value, width, height, fontSize: size, color, align: 'center', valign: 'middle' });
        label.posInteger = (x, y) => label.pos(Math.round(x), Math.round(y));
        parent.addChild(label);
        return label;
      };
      window.j_ = class extends Laya.Sprite {
        addDrawChild(node) { return this.addChild(node); }
        addClick() { this.mouseEnabled = true; }
        addMouseMoveEvent() {}
        OnStageResize() {}
        posInteger(x, y) { this.pos(Math.round(x), Math.round(y)); }
      };
      window.z_ = class extends j_ {
        get width() { return super.width; }
        get height() { return super.height; }
        set width(value) { super.width = value; this.paint(); }
        set height(value) { super.height = value; this.paint(); }
        posInteger(x, y) { this.pos(x, y); }
        paint() { this.graphics.clear(); this.graphics.drawRect(0, 0, this.width, this.height, '#211e1b', '#776746', 1); }
      };
      window.Fgs = class extends z_ { constructor() { super(); this.size(15, 15); } };
      window.fkt = { Create: (parent, value, size, color, width, height) => txt(parent, value, width, height, color, size) };
      window.Gkt = { SIMSUN: 'SimSun' };
      window.$_ = { Create: (size, color, _font, _x, _y, _wrap, _stroke, _c, _align, _valign, parent) =>
        txt(parent, '查看更多', 56, 16, color, size) };
      class TabButton extends j_ {
        constructor() { super(); this.enabled = true; this.mouseEnabled = true; }
        init() { this.labelText = txt(this, '', 102, 27, '#decda3', 13); }
        ShowLock() {}
        ShowRedPoint() {}
        RemoveRedPoint() {}
        AfterInitUiByGroup() {}
        layoutStaticTexX() { this.paint(); }
        layoutSubLabelX() {}
        set label(value) { this.labelText.text = value; }
        get label() { return this.labelText.text; }
        set selected(value) { this.active = value; this.paint(); }
        get selected() { return this.active; }
        paint() {
          if (!this.labelText) return;
          this.labelText.size(this.width, this.height);
          this.graphics.clear();
          this.graphics.drawRect(0, 0, this.width, this.height, this.active ? '#674327' : '#302c26', '#8a7754', 1);
        }
        InitSkin() { this.init(); this.paint(); }
      }
      window.rei = TabButton;
      window.Zi = { GetInstanceByClassName: () => new TabButton() };
      window.ZOt = { GetRes() {} };
      window.dt = window.chi = window.Chi = { I: () => ({ on() {}, off() {}, AddNodeEventByRedId() {},
        RemoveNodeEventByRedId() {}, GetNodeIsShowByPath: () => false }) };
      window.ok = window.fK = window.Nbt = {};
      window.jF = { I: () => ({ GetBarDataById: () => ({ IsOpen: true }) }) };
      window.Cg = { I: () => ({}) };
      window.y8t = { I: () => ({ WallSkinPaperRed: false }) };
      window.POt = { wallPaperBtn1: '主题背景', wallPaperBtn2: '静态皮肤', wallPaperBtn3: '动态皮肤', checkMore: '查看更多' };
      const ids = Array.from({ length: 12 }, (_, i) => i + 1);
      const data = ids.map(ID => ({ Group: 1, IsOutside: true, ID, Name: '游戏背景 ' + ID,
        Source: `full${ID}.png`, ...(ID === 2 && { fcSrc: 'full2-wide.png' }),
        Vip: ID === 3 ? 3 : 0, GoodsID: ID === 2 ? 200 : 0, PowerId: 0 }));
      const live = { ID: 1001, Name: '未解锁动态背景', IsCanUse: false, SmallImgUrl: 'res/wallpaper/small/live.png',
        ActiveAniURL: 'res/wallpaper/ani/live.json' };
      const skin = { ID: 101, Name: '已有皮肤', canUsed: true };
      const nativeSelections = [];
      const wallpaper = { LiveBgConfs: [live], NowModeConfs: ids, NowCommonModeConfs: ids, UsedId: 1,
        GetDataById: id => data[id - 1], GetWallSkinVoById: () => skin,
        WallSkinVoListInculedTryUse: [skin], WallSort0Normal: () => 0, GetModeForceBgId: () => 0,
        IsBgCanUse: id => id !== live.ID, SetGameWallPaper: id => nativeSelections.push(id) };
      window._g = { LiveIdBase: 1000, I: () => wallpaper };
      window.qOt = { Self: { VipLevelIncludeTrial: 1 } };
      window.F9t = { I: () => ({ GetGoodsByFourID: () => false }) };
      window.L8t = { getFourId: id => id };
      window.z1i = { ShowTextPrompt: () => nativeSelections.push('locked') };
      window.wallpaperData = { config: { WallPapers: { WallPaper: data } }, nativeSelections };
      window.Kii = class extends j_ {
        constructor(id) { super(); this.Id = this.id = id; this.size(97, 65); this.initUI();
          this.bindSelection(Laya.Event.MOUSE_DOWN); }
        bindSelection(event) {
          this.selectedBtn = this.addChild(new j_());
          this.selectedBtn.size(97, 45); this.selectedBtn.hitArea = new Laya.Rectangle(0, 0, 97, 45);
          this.selectedBtn.addClick();
          this.selectedBtn.on(event, this, this.onSelectedClicked);
          this.selectedBtn.on(Laya.Event.CLICK, this, event => event.stopPropagation());
        }
        initUI() {
          this.graphics.clear();
          this.graphics.drawRect(0, 0, 96, 41, ['#6c6243', '#71665c', '#415b60'][this.Id % 3], '#9d987c', 1);
          if (!this.label) { this.label = txt(this, '游戏背景 ' + this.Id, 96, 19, '#ddcc9f', 12); this.label.y = 42; }
          this.bg = { skin: `res/wallpaper/small/thumb${this.Id}.png` };
          this.tagLock = { visible: this.Id === 2 };
          this.vipImg = { visible: this.Id === 3 };
          if (!this.lock && (this.tagLock.visible || this.vipImg.visible)) {
            this.lock = txt(this, this.tagLock.visible ? '未解锁' : 'VIP 3', 96, 41, '#ffedbf', 13);
            this.lock.mouseEnabled = false;
          }
        }
        clear() {}
      };
      window.Xii = window.Yii = class extends Kii {
        constructor() { super(); this.selectedBtn.destroy(); this.selectedBtn = null; }
        init() { this.bindSelection(Laya.Event.CLICK); }
        UpdateData(data) { this.data = data; this.ID = data.ID; this.label.text = data.Name; this.init(); }
        UpdateSelectedUI() {}
      };
      window.Yii = class extends Xii {};
      window.JM = class extends j_ { UpdateDrawContent() {} };
    });
    await page.addScriptTag({ content: `
      window.lk = (${nativeClass('lk')});
      window.ak = (${nativeClass('ak')});
      Object.assign(Kii.prototype, { ${nativeMethod('Kii', 'onSelectedClicked')}, ${nativeMethod('Kii', 'useWall')} });
      Object.assign(Yii.prototype, { ${nativeMethod('Yii', 'onSelectedClicked')}, ${nativeMethod('Yii', 'useWall')} });
      window.toolbarMethods = { ${nativeMethod('hk', 'onClickSkin')}, ${nativeMethod('hk', 'stageclickHandler')} };
    ` });
    await page.evaluate(async () => {
      const toolbar = new j_();
      Object.assign(toolbar, toolbarMethods);
      toolbar.updateRedPoint = () => {};
      toolbar.size(320, 24);
      Laya.stage.addChild(toolbar);
      const entry = new rei();
      entry.init(); entry.size(86, 24); entry.label = '换肤'; entry.paint();
      toolbar.addChild(entry);
      entry.pos(195, 0);
      entry.on(Laya.Event.CLICK, toolbar, event => { event.stopPropagation(); toolbar.onClickSkin(); });
      const layout = (width = 301, font = 0) => {
        Laya.stage.size(innerWidth, innerHeight);
        const scale = width / 301;
        toolbar.scale(scale, scale);
        toolbar.pos(innerWidth - 325 * scale, 8);
        document.querySelector('[data-sgs-toolbox]').style.setProperty('--sgs-font-offset', font + 'px');
      };
      layout();
      const scope = new Check.ResourceScope(), settings = new Check.Settings(localStorage, 'background-history:');
      if (!settings.get('seeded')) {
        const canvas = document.createElement('canvas');
        canvas.width = 192; canvas.height = 108;
        const draw = canvas.getContext('2d');
        draw.fillStyle = '#314d5c'; draw.fillRect(0, 0, 192, 108);
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const bytes = await blob.arrayBuffer();
        const localImageId = await Check.localBackgroundImage(window, 'readwrite', store => store.add({ bytes, type: 'image/png' }));
        settings.set('battleBackground', { owner: 'backgrounds', name: '升级前本地背景', localImageId, animated: false, dynamic: null });
        settings.set('seeded', true);
      }
      const game = { getScene: () => null, isInGame: () => false, getSelf: () => qOt.Self,
        getConfigData: () => null, async loadConfigData(name) {
          if (name !== 'gn_WallPaper') throw new Error(name);
          await wallpaperData.wait;
          return wallpaperData.config;
        } };
      const registry = new Check.BackgroundRegistry({ window, game, settings, scope });
      const themes = new Check.ThemeRegistry(settings);
      const opens = [], notifications = [];
      const manager = new Check.PluginManager({ settings, journal: new Check.SessionJournal(),
        context: { window, document, game, backgrounds: registry, themes, notify: message => notifications.push(message), ui: {
          registerPanel: () => () => {},
        } } });
      const skins = manager.makeSlot({ manifest: { id: 'skins' }, activate(ctx) {
        ctx.skinWindows.register(source => { opens.push(source); });
      } }, { enabled: true });
      const backgrounds = manager.makeSlot(Check.backgroundsPlugin, { enabled: true });
      manager.slots.set('skins', skins); manager.slots.set('backgrounds', backgrounds);
      await manager.activate(skins); await manager.activate(backgrounds);
      window.fixture = { toolbar, entry, layout, scope, manager, registry, themes, opens, notifications, backgrounds };
    });
  };

  const point = (control, value) => page.evaluate(({ control, value }) => {
    const owner = fixture.toolbar.wallPaperUI;
    const target = control === 'toolbar' ? fixture.entry : control === 'theme' ? owner.wallPaperItems[value - 1].selectedBtn
      : control === 'live' ? owner.wallPaperLiveItems[0].selectedBtn : owner.tabGroup.GetButtonByValue(value);
    const center = target.localToGlobal(new Laya.Point(target.width / 2, target.height / 2));
    const canvas = document.getElementById('layaCanvas').getBoundingClientRect();
    return { x: canvas.left + center.x * canvas.width / Laya.stage.width, y: canvas.top + center.y * canvas.height / Laya.stage.height };
  }, { control, value });
  const clickCanvas = async (control, value) => {
    const { x, y } = await point(control, value);
    await page.mouse.click(x, y);
  };
  const openMenu = async () => {
    await clickCanvas('toolbar');
    await page.waitForFunction(() => fixture.toolbar.wallPaperUI?.visible && fixture.toolbar.wallPaperUI.tabGroup.BtnList.length === 4, null, { timeout: 4000 })
      .catch(async cause => {
        const state = await page.evaluate(() => ({ visible: fixture.toolbar.wallPaperUI?.visible, opens: fixture.opens,
          values: fixture.toolbar.wallPaperUI?.tabGroup.BtnList.map(button => button.value), notifications: fixture.notifications }));
        throw new Error(JSON.stringify({ ...state, errors }), { cause });
      });
  };
  const region = page.getByRole('region', { name: '自定义背景' });
  const card = name => region.getByRole('button', { name: new RegExp(name) });

  async function mountWardrobe() {
    await page.evaluate(() => {
      window.gO = j_;
      window.vm = class {};
      window.Pm = class {};
      const theme = (ID, Name, args) => Object.assign(new vm(), { ID, Name, Source: `wardrobe-${ID}.png`,
        BgURL: `res/wallpaper/bg/wardrobe-${ID}.png`, ...args });
      const themes = [theme(1, '已选原生背景', { IsCanUse: true }),
        theme(201, '未解锁官方主题', { Vip: 9, IsCanUse: false, fcSrc: 'wardrobe-201-wide.png',
          ActiveBgURL: 'res/wallpaper/bg/wardrobe-201-wide.png' }),
        theme(25, '已解锁背景', { IsCanUse: true })];
      const skin = Object.assign(new Pm(), { ID: 111, Name: '未解锁静态皮肤', SkinID: 103, canUsed: false, BgURL: 'res/wallpaper/bg/wardrobe-skin.png' });
      const live = theme(100002, '未解锁动态皮肤', { IsLiveBg: true, IsCanUse: false, SmallImgUrl: 'res/wallpaper/small/wardrobe-live.png',
        ActiveAniURL: 'res/wallpaper/ani/wardrobe-live.json' });
      const actions = [];
      const nativeWallpaper = { UsedId: 1, BattleBgPreviewConfs: themes, SkinBgPreviewConfs: [skin], LiveBgConfs: [live],
        IsLiveBgId: id => id === live.ID, GetDataById: id => [...themes, live].find(data => data.ID === id),
        GetWallSkinVoById: id => id === skin.ID ? skin : null, IsBgCanUse: id => [...themes, live].find(data => data.ID === id)?.IsCanUse ?? skin.canUsed,
        SetGameWallPaper(id) { actions.push(['use', id]); this.UsedId = id; fixture.wardrobe.preview.updateUI(); } };
      window.Mm = { I: () => nativeWallpaper };
      window.NNt = { Self: { VipLevelIncludeTrial: 2 } };
      window.VJt = { VIPItemID: 9 };
      window.xNt = { I: () => ({ Buy: id => actions.push(['buy', id]) }) };
      window.B$t = { I: () => ({ NavigationGotoFunc: (...args) => actions.push(['go', ...args]) }) };
      window.gNt = { SKILL_USE: '使用', BUY_EMOJI_VIP: '开通 VIP X', GENERAL_BREAK_TIP3: '获取方式' };
      window.le = { F: (text, value) => text.replace('X', value) };
      window.yQ = { BG_PREVIEW_COMMON_ID: 'preview', Personalization: 'wardrobe', PERSONAL_BG_GETWAY: 'obtain' };
      window.c1t = { I: () => ({ ClickEventUpLoad: payload => actions.push(['log', ...payload]) }) };
      window.JJt = { I: () => ({ ReqSkinGetWays: () => {} }) };
      const dispatcher = new Laya.EventDispatcher();
      fixture.wardrobe = { dispatcher, actions, nativeWallpaper, rows: [themes, [skin], [live]] };
    });
    await page.addScriptTag({ content: `
      window.Tji = class Tji extends j_ {
        static BTN_ST_INVISIBLE = 0;
        static BTN_ST_USE = 1;
        static BTN_ST_GET_WAYS = 2;
        ${['getBtnSt', 'clickBotBtn', 'updateSkinBtn', 'getDataList', 'updateUI', 'clickItem'].map(name => currentClient.nativeMethod('Tji', name)).join('\n')}
        get crtSkinId() { return this.crtData?.SkinID || 0; }
      };
      window.openWardrobeItem = (${currentClient.nativeMethod('n4t', 'clickItem').replace(/^clickItem/, 'function clickItem')});
    ` });
    await page.evaluate(() => {
      const wardrobe = fixture.wardrobe;
      const addButton = (parent, name, width, x, y, click) => {
        const button = new rei();
        button.init(); button.size(width, 36); button.label = name; button.paint(); button.pos(x, y);
        button.labelText.fontSize = 16;
        button.on(Laya.Event.CLICK, parent, click);
        parent.addChild(button);
        return button;
      };
      const preview = wardrobe.preview = new Tji();
      preview.size(640, 470); preview.pos(192, 70);
      preview.graphics.drawRect(0, 0, 640, 470, '#211e1b', '#a18352', 1);
      const heading = new Laya.Text();
      Object.assign(heading, { width: 600, height: 40, fontSize: 20, color: '#e8d5a7', align: 'center', valign: 'middle' });
      preview.addChild(heading); heading.pos(20, 18);
      Object.assign(preview, { imgInUse: { visible: false }, arrL: {}, arrR: {}, btnCoin: {}, btnCoinLb: {},
        skinGetWayDataDic: { getNumberKey: () => undefined }, updateBg() { heading.text = `背景预览 · ${this.crtData.Name}`; },
        bgItems: Array.from({ length: 3 }, (_, index) => {
          const item = { UpdateData(data, callback) { this.Data = data; this.click = callback; }, Draw() { this.button.label = this.Data.Name; } };
          item.button = addButton(preview, '', 165, 55 + index * 181, 322, () => item.click(item));
          return item;
        }) });
      preview.botBtn = addButton(preview, '', 126, 257, 405, preview.clickBotBtn);
      preview.visible = false;
      Laya.stage.addChild(preview);
      const cache = { WindowInstanceDict: { getStringKey: name => name === 'BgPreviewWin' ? preview : null } };
      wardrobe.dispatcher.on('OPEN_WINDOW', cache, ({ id }) => {
        preview.visible = true;
        preview.crtBgId = id;
        preview.getDataList(); preview.updateUI();
      });
      fixture.manager.context.game.getDispatcher = () => wardrobe.dispatcher;
      const list = new j_();
      list.size(862, 544); list.pos(81, 40); Laya.stage.addChildAt(list, Laya.stage.getChildIndex(preview));
      list.ged = { _(name, id) { wardrobe.dispatcher.event('OPEN_WINDOW', { WindowName: name, id }); } };
      wardrobe.rows.flat().forEach((data, index) => {
        const button = addButton(list, data.Name, 170, 70 + 186 * (index % 4), 95 + 135 * Math.floor(index / 4), () => {
          if (!preview.visible) openWardrobeItem.call(list, { Data: data });
        });
        if (data.ID === 201) wardrobe.lockedTheme = button;
        if (data.IsLiveBg) wardrobe.lockedLive = button;
        if (data.SkinID) wardrobe.lockedSkin = button;
      });
      fixture.registry.select('backgrounds', null);
    });
  }

  async function clickWardrobe(key) {
    const { x, y } = await page.evaluate(key => {
      const { wardrobe } = fixture;
      const button = key === 'use' ? wardrobe.preview.botBtn : wardrobe[key];
      const center = button.localToGlobal(new Laya.Point(button.width / 2, button.height / 2));
      const canvas = document.getElementById('layaCanvas').getBoundingClientRect();
      return { x: canvas.left + center.x * canvas.width / Laya.stage.width, y: canvas.top + center.y * canvas.height / Laya.stage.height };
    }, key);
    await page.mouse.click(x, y);
  }

  await mount();
  await openMenu();
  assert.deepEqual(await page.evaluate(() => {
    const ui = fixture.toolbar.wallPaperUI;
    return ui.tabGroup.BtnList.map(button => [button.value, button.label]);
  }), [[0, '主题背景'], [1, '静态皮肤'], [2, '动态皮肤'], [3, '自定义背景']]);
  await clickCanvas('tab', 3);
  await card('升级前本地背景').waitFor();
  assert.equal(await card('升级前本地背景').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => {
    const ui = fixture.toolbar.wallPaperUI;
    return ui.wallPaperItems.every(item => !item.visible) && !ui.allmodeSelectBox.visible;
  }), true);

  const upload = region.getByRole('button', { name: '选择本地图片' });
  const first = await makeImage('晚霞山峦.png', '#99392a');
  const second = await makeImage('湖畔清晨.png', '#3f7f83');
  const official = await makeImage('本服立绘.png', '#535480');
  await page.route('https://background-history.fixture/res/official.png', route => route.fulfill({
    body: official.buffer, contentType: official.mimeType,
  }));
  await page.route('https://background-history.fixture/res/wallpaper/**', route => route.fulfill({
    body: official.buffer, contentType: official.mimeType,
  }));
  const chooser = page.waitForEvent('filechooser');
  await upload.press('Enter');
  await (await chooser).setFiles(first);
  await card('晚霞山峦').waitFor();
  await region.locator('input[type=file]').setInputFiles(second);
  await card('湖畔清晨').waitFor();
  assert.equal(await card('湖畔清晨').getAttribute('aria-pressed'), 'true');
  await card('晚霞山峦').press('Enter');
  await page.waitForFunction(() => fixture.registry.current?.name === '晚霞山峦.png');
  assert.equal(await card('晚霞山峦').getAttribute('aria-pressed'), 'true');
  assert.equal(await region.locator('.history-card').count(), 3);
  assert.deepEqual(requests, [], 'uploads and local thumbnail history use browser storage only');

  await region.getByRole('button', { name: '一将成名', exact: true }).click();
  await region.getByRole('button', { name: '移动版皮肤', exact: true }).click();
  await region.getByRole('button', { name: '本服皮肤', exact: true }).click();
  await region.waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => fixture.opens), ['cross', 'mobile', 'native']);
  await page.evaluate(() => {
    fixture.registry.select('backgrounds', { name: '本服演练皮肤', url: 'res/official.png', animated: false });
  });
  const previewLoaded = page.waitForResponse('https://background-history.fixture/res/official.png');
  await openMenu();
  await card('本服演练皮肤').waitFor();
  await previewLoaded;
  await card('本服演练皮肤').locator('img').evaluate(image => image.decode());
  assert.deepEqual(requests, ['https://background-history.fixture/res/official.png']);

  for (const value of [0, 1, 2]) {
    await clickCanvas('tab', value);
    await region.waitFor({ state: 'hidden' });
    const state = await page.evaluate(() => {
      const ui = fixture.toolbar.wallPaperUI;
      return [ui.tabGroup.SelectedValue, ui.allmodeSelectBox.visible, ui.panel?.visible ?? false, ui.livePanel?.visible ?? false];
    });
    assert.deepEqual(state, [value, true, value === 1, value === 2]);
  }
  await page.getByRole('button', { name: '自定义背景', exact: true }).press('Enter');
  await card('本服演练皮肤').waitFor();
  for (const [width, font] of [[248, 2], [280, 0], [420, -1], [420, -2]]) {
    await page.evaluate(([width, font]) => {
      fixture.layout(width, font);
      fixture.restoreTheme?.();
      if (font === -1) fixture.restoreTheme = fixture.themes.override('fixture', { bg: '#f3ece0', surface: '#fffaf1',
        raised: '#eee3cb', text: '#35271a', muted: '#675b4c', accent: '#865d16', border: '#ad997a', scheme: 'light' });
    }, [width, font]);
    await page.waitForFunction(width => Math.abs(document.querySelector('[data-sgs-background-history]').shadowRoot.querySelector('.pane').clientWidth - width) < 20, width);
    assert.ok(await region.evaluate(node => [...node.querySelectorAll('.sources button,.heading button')].every(button =>
      button.clientHeight >= 26 && button.scrollWidth <= button.clientWidth + 1 && button.getBoundingClientRect().right <= node.getBoundingClientRect().right)),
    `actions fit at ${width}px and font offset ${font}`);
    await page.screenshot({ path: resolve(out, `native-tab-${width}-${font}.png`) });
  }
  await page.setViewportSize({ width: 1024, height: 310 });
  await page.evaluate(() => fixture.layout(280, 2));
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-sgs-background-history]').shadowRoot;
    return root.querySelector('.pane').getBoundingClientRect().bottom < innerHeight && root.querySelector('.tab-key').getBoundingClientRect().bottom < innerHeight;
  });
  await page.screenshot({ path: resolve(out, 'native-tab-low-height.png') });
  const pane = await region.boundingBox();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await page.mouse.wheel(0, 150);
  await page.waitForFunction(() => document.querySelector('[data-sgs-background-history]').shadowRoot.querySelector('.pane').scrollTop > 0);
  await region.getByRole('button', { name: '恢复游戏背景' }).click();
  assert.equal(await page.evaluate(() => fixture.registry.current), null);
  assert.equal(await region.locator('.history-card').count(), 4);

  await page.setViewportSize({ width: 1024, height: 640 });
  await mount();
  await openMenu();
  const touch = await point('tab', 3);
  await page.touchscreen.tap(touch.x, touch.y);
  await card('本服演练皮肤').waitFor();
  assert.match(await card('本服演练皮肤').locator('img').getAttribute('src'), /^data:image\//);
  await card('升级前本地背景').click();
  await page.waitForFunction(() => fixture.registry.current?.name === '升级前本地背景');
  assert.equal(await region.locator('.history-card').count(), 4);
  await mount();
  await openMenu();
  await clickCanvas('theme', 2);
  await page.waitForFunction(() => fixture.registry.current?.officialWallpaper).catch(async cause => {
    const state = await page.evaluate(() => {
      const owner = fixture.toolbar.wallPaperUI, tile = owner.wallPaperItems[1];
      return { tab: owner.tabGroup.SelectedValue, visible: tile.visible, current: fixture.registry.current,
        method: tile.selectedBtn._events?.mousedown?.method?.name,
        native: wallpaperData.nativeSelections, notifications: fixture.notifications };
    });
    throw new Error(JSON.stringify({ ...state, errors }), { cause });
  });
  assert.deepEqual(await page.evaluate(() => {
    const { url, officialWallpaperWide } = fixture.registry.current;
    return [url, officialWallpaperWide];
  }), ['res/wallpaper/bg/full2-wide.png', true]);
  assert.deepEqual(await page.evaluate(() => wallpaperData.nativeSelections), []);
  await page.screenshot({ path: resolve(out, 'native-locked-themes.png') });
  await clickCanvas('theme', 3);
  await page.waitForFunction(() => fixture.registry.current?.url === 'res/wallpaper/bg/full3.png');
  assert.equal(await page.evaluate(() => fixture.registry.current.officialWallpaperWide), false);
  await clickCanvas('tab', 2);
  await clickCanvas('live');
  await page.waitForFunction(() => fixture.registry.current?.wallpaperMotion?.url === 'res/wallpaper/ani/live.json');
  assert.deepEqual(await page.evaluate(() => wallpaperData.nativeSelections), []);
  await clickCanvas('tab', 3);
  await card('未解锁动态背景').waitFor();
  assert.match(await card('未解锁动态背景').textContent(), /官方背景/);
  await card('未解锁动态背景').locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(out, 'official-wallpaper-history.png') });
  await clickCanvas('tab', 0);
  await page.evaluate(() => { wallpaperData.wait = new Promise(resolve => { wallpaperData.finish = resolve; }); });
  await clickCanvas('theme', 2);
  await clickCanvas('theme', 1);
  await page.evaluate(() => wallpaperData.finish());
  assert.equal(await page.evaluate(() => fixture.registry.current), null);
  assert.deepEqual(await page.evaluate(() => wallpaperData.nativeSelections), [1]);
  await clickCanvas('tab', 3);
  await card('未解锁动态背景').click();
  await page.waitForFunction(() => fixture.registry.current?.wallpaperMotion?.url === 'res/wallpaper/ani/live.json');
  await page.evaluate(() => fixture.backgrounds.scope.dispose());
  assert.equal(await page.locator('[data-sgs-background-history]').count(), 0);
  assert.deepEqual(await page.evaluate(() => {
    const ui = fixture.toolbar.wallPaperUI;
    return [ui.tabGroup.BtnList.length, ui.tabGroup.btnWidth, ui.allmodeSelectBox.visible, ui.tabGroup.SelectedValue];
  }), [3, 102, true, 0]);
  await clickCanvas('theme', 2);
  assert.deepEqual(await page.evaluate(() => fixture.notifications), [
    '已在本地使用「游戏背景 2」', '已在本地使用「游戏背景 3」', '已在本地使用「未解锁动态背景」']);

  await mount();
  await mountWardrobe();
  const waitForLabel = label => page.waitForFunction(label => {
    const button = fixture.wardrobe.preview.botBtn;
    return button.visible && button.label === label;
  }, label);
  await clickWardrobe('lockedTheme');
  await waitForLabel('仅本地使用');
  assert.equal(await page.evaluate(() => fixture.registry.current), null, 'preview alone does not apply anything');
  await clickWardrobe('use');
  await waitForLabel('取消本地使用');
  assert.deepEqual(await page.evaluate(() => {
    const { url, officialWallpaperWide } = fixture.registry.current;
    return [url, officialWallpaperWide];
  }), ['res/wallpaper/bg/wardrobe-201-wide.png', true]);
  assert.deepEqual(await page.evaluate(() => fixture.wardrobe.actions), []);
  assert.ok(await page.evaluate(() => {
    const button = fixture.wardrobe.preview.botBtn;
    return button.labelText.textWidth <= button.width - 8;
  }), 'local-use label fits the native button');
  await page.screenshot({ path: resolve(out, 'wardrobe-preview-local.png') });
  await clickWardrobe('use');
  await waitForLabel('仅本地使用');
  assert.equal(await page.evaluate(() => fixture.registry.current), null);

  for (const [key, url] of [['lockedSkin', 'res/wallpaper/bg/wardrobe-skin.png'], ['lockedLive', 'res/wallpaper/small/wardrobe-live.png']]) {
    await page.evaluate(() => { fixture.wardrobe.preview.visible = false; });
    await clickWardrobe(key);
    await waitForLabel('仅本地使用');
    await clickWardrobe('use');
    await waitForLabel('取消本地使用');
    assert.equal(await page.evaluate(() => fixture.registry.current?.url), url);
  }
  assert.equal(await page.evaluate(() => fixture.registry.current?.wallpaperMotion?.url), 'res/wallpaper/ani/wardrobe-live.json');
  assert.deepEqual(await page.evaluate(() => fixture.wardrobe.actions), []);
  await page.evaluate(() => fixture.wardrobe.dispatcher.event('OPEN_WINDOW', { WindowName: 'BgPreviewWin', id: 1 }));
  await waitForLabel('恢复此背景');
  await clickWardrobe('use');
  assert.equal(await page.evaluate(() => fixture.registry.current), null);
  assert.deepEqual(await page.evaluate(() => fixture.wardrobe.actions), []);
  await page.evaluate(() => fixture.wardrobe.dispatcher.event('OPEN_WINDOW', { WindowName: 'BgPreviewWin', id: 25 }));
  await waitForLabel('使用');
  await clickWardrobe('use');
  assert.deepEqual(await page.evaluate(() => fixture.wardrobe.actions), [['use', 25], ['log', 'preview', 25]]);
  await page.evaluate(() => fixture.wardrobe.dispatcher.event('OPEN_WINDOW', { WindowName: 'BgPreviewWin', id: 201 }));
  await waitForLabel('仅本地使用');
  assert.deepEqual(await page.evaluate(() => {
    fixture.backgrounds.scope.dispose();
    const { preview } = fixture.wardrobe;
    return [preview.botBtn.label, preview.botBtn._events[Laya.Event.CLICK].method === preview.clickBotBtn];
  }), ['开通 VIP 9', true]);
  assert.deepEqual(errors, []);
  console.log('原生背景界面演练通过：换肤菜单与个人装扮预览本地设用、取消、原生切换、历史恢复和停用清理。');
} finally { await browser.close(); }
