import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = resolve('test-results/social-bubbles');
await mkdir(out, { recursive: true });
const bundle = await build({
  stdin: { contents: `
    export { createChatBubbles, renderBubblePanel } from './src/plugins/social/bubbles.js';
    export { ResourceScope } from './src/core/resources.js';
    export { mountPluginUI } from './src/ui/plugin-ui.js';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'BubbleCheck',
});
const clients = {
  classic: process.env.SGS_BUBBLE_CLASSIC_SOURCE || '.tmp/poker-client-inspect/classic/sgsGame_a.sgs',
  remastered: process.env.SGS_BUBBLE_REMASTERED_SOURCE || '.tmp/poker-client-inspect/remastered/main.sgs',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [client, path] of Object.entries(clients)) {
    const classic = client === 'classic';
    const source = await readFile(path, 'utf8');
    const names = classic
      ? { dictionary: /let s=(\w+)\.I\(\)\.N\(t\)/, bubble: 'xM', gallery: 'hFt',
        bg: 'SetBackGround(t,i=!1){', seatEnd: 'addTakeShotBbl(){' }
      : { dictionary: /let i=(\w+)\.I\(\)\.N\(t\)/, bubble: 'SQi', gallery: 'Fys',
        bg: 'SetBackGround(t){', seatEnd: 'ShowTakeShotBbl(t,i,s){' };
    const extract = (start, end, offset = 0) => {
      const from = source.indexOf(start, offset), to = source.indexOf(end, from + start.length);
      assert.ok(from > 0 && to > from, `${client} missing ${start}`);
      return source.slice(from, to);
    };
    const bg = extract(names.bg, 'set Style(t)', source.indexOf(`class ${names.bubble} extends`));
    const seat = extract('ShowChatBubleView(t,i,s){', names.seatEnd);
    const galleryOffset = source.indexOf('getPreviewGoodsId(t){');
    const preview = extract('getPreviewGoodsId(t){', 'getPreviewChatHtml(){', galleryOffset);
    const previewState = extract('updatePreviewState(){', 'getRemainSecond(t){', galleryOffset);
    const countdown = extract('updateTimeText(){if(!this.info)return;if(1===this.BubbleId)', 'loadIcon(t){', galleryOffset);
    const dictionary = bg.match(names.dictionary)?.[1];
    assert.ok(dictionary);
    const page = await browser.newPage({ viewport: { width: 1050, height: 620 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://bubbles.fixture/**', route => route.fulfill({ contentType: 'text/html', body: `
      <body style="margin:0;background:#171411">
      <main style="position:absolute;z-index:10;left:750px;top:24px;width:280px;box-sizing:border-box;padding:12px;
        background:#26211c;--sgs-text:#efe1c5;--sgs-muted:#b9a88e;--sgs-accent:#e3be77;--sgs-border:#69523a;
        --sgs-raised:#3b3128;--sgs-surface:#2d251d;--sgs-danger:#ff9d9d"></main>
      </body>` }));
    await page.goto('https://bubbles.fixture/');
    for (const file of ['laya.core.min.js', 'laya.ui.min.js']) {
      await page.addScriptTag({ path: resolve(process.env.SGS_LAYA_DIR || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game', file) });
    }
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(({ classic, bg, seat, preview, previewState, countdown, dictionary }) => {
      const { createChatBubbles, renderBubblePanel, ResourceScope, mountPluginUI } = BubbleCheck;
      Laya.init(720, 520, Laya.WebGL);
      Laya.stage.bgColor = '#231e19';
      Laya.stage.alignH = 'left';
      Laya.stage.alignV = 'top';
      function texture(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 70;
        const g = canvas.getContext('2d');
        g.fillStyle = color;
        g.beginPath(); g.roundRect(0, 0, 200, 70, 17); g.fill();
        const bitmap = new Laya.Texture2D(200, 70);
        bitmap.loadImageSource(canvas, true);
        return new Laya.Texture(bitmap);
      }
      const initial = texture('#544230'), official = texture('#31556a');
      const styles = { DEFAULT: 0, MASK: 1 };
      const goods = { I: () => ({ N: id => id === 902 ? { firstUsedEffect: 10 } : null }) };
      const conf = { I: () => ({ GetChatBubbleVo: () => ({ sx: 20, sy: 18, sw: 200, sh: 70, txtcolor: '#fff7dc' }) }) };
      const getOriginal = (code, name, globals) =>
        new Function(...Object.keys(globals), 'return ({' + code + '}).' + name)(...Object.values(globals));
      class Bubble extends Laya.Sprite {
        constructor() {
          super();
          this.bubbleBg = new Laya.Image();
          this.addChild(this.bubbleBg);
          this.msgContent = new Laya.Text();
          Object.assign(this.msgContent, { fontSize: 19, x: 24, y: 21 });
          this.msgContent.SetStroke = (width, color) => Object.assign(this.msgContent, { stroke: width, strokeColor: color });
          this.addChild(this.msgContent);
        }
        ShowChatMessage(text) { this.msgContent.text = text; }
        layoutByStyle(id) {
          this.size(200, 70);
          this.bubbleBg.sizeGrid = null;
          this.bubbleBg.size(200, 70);
          this.bubbleBg.source = id ? official : initial;
        }
        GetTextLineCount() { return 1; }
        ItemShopBigIconUrl() { return ''; }
      }
      const bgGlobals = classic
        ? { YD: styles, xM: { LINE_THRESHOLD: 2 }, rMt: conf, qni: {}, Zni: {}, ZOt: { GetRes: () => initial } }
        : { mqi: styles, SQi: { LINE_THRESHOLD: 2, BUBBLE_W: 200 }, nOt: conf, Zkt: {}, Kkt: { GetRes: () => initial } };
      Bubble.prototype.SetBackGround = getOriginal(bg, 'SetBackGround', { ...bgGlobals, [dictionary]: goods });
      const context = { SelfSeatIndex: 1 }, left = { Left: 1 };
      const draw = getOriginal(seat, 'ShowChatBubleView', classic
        ? { xM: Bubble, Dbt: { Lv10: 10 }, PN: { EasyChatMag: t => t.chatMsg }, qni: context, Zni: context, NM: left }
        : { SQi: Bubble, zU: { layerMax: 10 }, JG: { EasyChatMagApp: t => t.chatMsg }, Zkt: context, HM: left });
      function createSeat(index, nickname) {
        const host = { seat: { Index: index, PlayerInfo: { Nickname: nickname } },
          x: index === 1 ? 404 : 179, y: index === 1 ? 180 : 296, width: 200, height: 70,
          textSprite: Laya.stage, addChatBuble() { Laya.stage.addChild(this.chatBubleView); } };
        const ui = {
          Seat: host.seat,
          ShowChatMessage(message) { draw.call(host, message, 5000, left.Left); },
          get nativeBubble() { return host.chatBubleView; },
        };
        if (classic) Object.defineProperty(ui, 'chatBubleView', { get: () => host.chatBubleView });
        else ui.otherTopManager = host;
        return ui;
      }
      window.selfSeat = createSeat(1, '青山');
      window.otherSeat = createSeat(2, '明月');
      window.message = { SpokerMan: '青山', ChannelNum: 3, GoodsBaseID: 0, chatMsg: '这是一条牌局消息' };
      window.nativeClicks = 0; window.opens = [];
      const row = { bubbleId: 10, title: '回风', baseInfo: { ID: 902 } };
      const expired = { bubbleId: 11, title: '旧梦', baseInfo: { ID: 903 }, goods: { Expirydate: 99 } };
      class GalleryItem extends Laya.Sprite {
        constructor(info) {
          super();
          this.uiReady = true;
          this.info = info;
          this.lockContainer = new Laya.Sprite();
          this.addChild(this.lockContainer);
          const lock = new Laya.Text();
          lock.text = '🔒';
          lock.fontSize = 22;
          this.lockContainer.addChild(lock);
          this.timeContainer = new Laya.Sprite();
          this.timeTxt = new Laya.Text();
          this.timeContainer.addChild(this.timeTxt);
          this.addChild(this.timeContainer);
          this.tagTex = new Laya.Sprite();
          this.addChild(this.tagTex);
          this.updateView();
        }
        get Data() { return this.info; }
        get BubbleId() { return this.info.bubbleId; }
        get Owned() { return !!this.info.goods; }
        get Expired() { return this.info.goods?.Expirydate < 100; }
        updateView() {
          this.updateTimeText();
          Laya.timer.clear(this, this.updateTimeText);
          Laya.timer.loop(1000, this, this.updateTimeText);
        }
      }
      const time = { TimeCountDownDesc: String };
      GalleryItem.prototype.updateTimeText = getOriginal(countdown, 'updateTimeText', { tMt: time, q: time });
      class Gallery extends Laya.Sprite {
        constructor() {
          super();
          this.selectData = row;
          this.previewText = new Laya.Button('', '前往获取');
          this.previewText.labelSize = 17;
          this.previewText.labelColors = '#f3d591,#f3d591,#f3d591';
          this.previewText.pos(460, 295);
          this.previewText.size(120, 34);
          this.addChild(this.previewText);
          this.previewText.on('click', this, this.onClickAction);
          this.tipsTxt = new Laya.Text();
          Object.assign(this.tipsTxt, { color: '#dabd85', fontSize: 14, x: 474, y: 338 });
          this.addChild(this.tipsTxt);
          this.itemArr = [new GalleryItem(row), new GalleryItem(expired)];
          this.itemArr.forEach((item, i) => { item.pos(455 + i * 60, 250); this.addChild(item); });
          this.renderItems(); this.updatePreview();
          Laya.timer.loop(1000, this, this.updatePreviewState);
        }
        renderItems() { this.itemArr.forEach(item => item.updateView()); }
        recycleItem(item) {
          Laya.timer.clearAll(item);
          item.info = null;
          item.removeSelf();
        }
        onClickAction() { window.nativeClicks++; }
        isExpired(goods) { return goods?.Expirydate < 100; }
        getRemainSecond(goods) { return Math.max(0, goods.Expirydate - 100); }
        updatePreview() { this.previewText.label = '前往获取'; this.updatePreviewState(); }
        destroy() {
          Laya.timer.clear(this, this.updatePreviewState);
          for (const item of this.itemArr.splice(0)) this.recycleItem(item);
          super.destroy(true);
        }
      }
      Gallery.prototype.getPreviewGoodsId = getOriginal(preview, 'getPreviewGoodsId', {});
      Gallery.prototype.updatePreviewState = getOriginal(previewState, 'updatePreviewState', { tMt: time, q: time });
      class Wardrobe {}
      if (classic) Wardrobe.prototype.selectOpenTargetView = () => {};
      window.createGallery = () => Laya.stage.addChild(new Gallery());
      window.gallery = createGallery();
      window.account = { id: '1001', nickname: '青山' };
      window.replay = false;
      const settings = new Map();
      function boot() {
        const ctx = { window, document, scope: new ResourceScope(),
          native: { account: () => window.account },
          game: { getClass: key => ({ DialogueBubbleView: Gallery, SgxWindow: Wardrobe })[key],
            getSelfSeatUI: () => selfSeat, isReplay: () => replay,
            getDispatcher: () => ({ ShowWindowAfterCloseOther: (...args) => opens.push(args) }) },
          settings: { get: (key, fallback) => settings.get(key) ?? fallback, set: (key, value) => settings.set(key, value) },
          notify: text => { window.notice = text; },
        };
        ctx.ui = mountPluginUI(ctx, () => ctx);
        window.ctx = ctx;
        window.runtime = createChatBubbles(ctx);
        renderBubblePanel(ctx, document.querySelector('main'), runtime);
      }
      window.boot = boot; boot();
    }, { classic, bg, seat, preview, previewState, countdown, dictionary });
    const upload = page.getByRole('button', { name: '导入图片' });
    await upload.waitFor();
    await page.waitForFunction(() => runtime.state().ready && !runtime.state().busy);
    await page.getByRole('button', { name: '打开个性化' }).click();
    assert.deepEqual(await page.evaluate(() => opens), [['SgxWindow', null, classic ? 6 : 0]]);
    assert.equal(await page.evaluate(() => gallery.itemArr[0].lockContainer.visible), false);
    const flashed = await page.evaluate(() => new Promise(resolve => {
      const until = performance.now() + 2200;
      let sawLock = false, sawNativeTip = false;
      function frame(now) {
        sawLock ||= gallery.itemArr.some(item => item.lockContainer.visible || item.timeContainer.visible);
        sawNativeTip ||= !gallery.tipsTxt.visible || gallery.tipsTxt.text !== '仅本机显示';
        if (now < until) requestAnimationFrame(frame);
        else resolve({ sawLock, sawNativeTip });
      }
      requestAnimationFrame(frame);
    }));
    assert.equal(flashed.sawLock, false, `${client} lock or expiry returned during a native countdown tick`);
    assert.equal(flashed.sawNativeTip, false, `${client} the open preview reverted to the native ownership hint`);
    assert.deepEqual(await page.evaluate(() => {
      const fresh = createGallery();
      const update = fresh.updatePreviewState;
      const hint = fresh.tipsTxt.text;
      const loops = Laya.timer._handlers.filter(handler => handler.caller === fresh && handler.method === update).length;
      fresh.destroy();
      return [hint, loops, Boolean(Laya.timer._getHandler(fresh, update))];
    }), ['仅本机显示', 1, false], `${client} a new gallery uses a single preview timer that clears on close`);
    assert.deepEqual(await page.evaluate(() => {
      const recycled = gallery.itemArr.pop();
      const originalData = recycled.Data;
      const wrapped = recycled.updateTimeText;
      gallery.recycleItem(recycled);
      const released = !Object.hasOwn(recycled, 'updateTimeText') && !Laya.timer._getHandler(recycled, wrapped);
      recycled.info = originalData;
      gallery.itemArr.push(recycled);
      gallery.addChild(recycled);
      gallery.renderItems();
      return [released, recycled.lockContainer.visible, recycled.timeContainer.visible];
    }), [true, false, false], `${client} recycled card releases the old callback and stays unlocked on reuse`);
    await page.evaluate(() => gallery.previewText.event('click', { type: 'click' }));
    await page.waitForFunction(() => gallery.previewText.label === '本地使用中');
    assert.deepEqual(await page.evaluate(() => {
      selfSeat.ShowChatMessage(message); otherSeat.ShowChatMessage({ ...message, SpokerMan: '明月' });
      return [selfSeat.nativeBubble.lastGoodsId, otherSeat.nativeBubble.lastGoodsId, message.GoodsBaseID, nativeClicks];
    }), [902, 0, 0, 0]);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 140;
      const g = canvas.getContext('2d');
      const gradient = g.createLinearGradient(0, 0, 400, 140);
      gradient.addColorStop(0, '#174644'); gradient.addColorStop(1, '#7b5129');
      g.fillStyle = gradient; g.beginPath(); g.roundRect(0, 0, 400, 140, 36); g.fill();
      g.strokeStyle = '#edcd87'; g.lineWidth = 4; g.beginPath(); g.roundRect(4, 4, 392, 132, 33); g.stroke();
      return canvas.toDataURL().split(',')[1];
    });
    const input = page.locator('input[type=file]');
    await input.setInputFiles({ name: '青绿泡泡.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => runtime.state().image?.naturalWidth === 400 && !runtime.state().busy);
    assert.deepEqual(await page.evaluate(() => {
      selfSeat.ShowChatMessage(message);
      const bg = selfSeat.nativeBubble.bubbleBg;
      window.custom = bg.source;
      return [bg.source.width, bg.source.height, selfSeat.nativeBubble.msgContent.text, message.GoodsBaseID];
    }), [400, 140, '这是一条牌局消息', 0]);
    await page.getByAltText('自定义气泡').evaluate(img => img.decode());
    for (const width of [248, 280, 420]) {
      for (const font of [0, 2, 4, 6]) {
        assert.equal(await page.locator('main').evaluate((panel, [width, font]) => {
          panel.style.width = width + 'px';
          panel.style.setProperty('--sgs-font-offset', font + 'px');
          return panel.scrollWidth <= panel.clientWidth;
        }, [width, font]), true, `${client} ${width}px and font offset ${font}`);
      }
    }
    await page.locator('main').evaluate(panel => {
      panel.style.width = '280px'; panel.style.removeProperty('--sgs-font-offset');
    });
    await page.screenshot({ path: resolve(out, `${client}.png`) });
    await input.setInputFiles({ name: '损坏.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.getByRole('alert').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => runtime.state().record.custom.name), '青绿泡泡.png');
    assert.equal(await page.evaluate(() => {
      selfSeat.ShowChatMessage({ ...message, IsQuickChatMsg: true });
      return selfSeat.nativeBubble.bubbleBg.source === custom;
    }), false);
    assert.deepEqual(await page.evaluate(() => {
      const wrapped = gallery.updatePreviewState;
      ctx.scope.dispose();
      const restored = [gallery.tipsTxt.text, Boolean(Laya.timer._getHandler(gallery, wrapped)),
        Boolean(Laya.timer._getHandler(gallery, gallery.updatePreviewState))];
      boot();
      return restored;
    }), ['尚未获得', false, true], `${client} disabling the plugin restores the original preview refresh`);
    await page.waitForFunction(() => runtime.state().image?.naturalWidth === 400);
    await page.evaluate(() => { account = { id: '1002', nickname: '明月' }; });
    await page.waitForFunction(() => runtime.state().id === '1002' && !runtime.state().busy);
    assert.equal(await page.evaluate(() => runtime.state().record), undefined);
    await page.evaluate(() => { account = { id: '1001', nickname: '青山' }; });
    await page.waitForFunction(() => runtime.state().image?.naturalWidth === 400 && !runtime.state().busy);
    await page.getByRole('button', { name: '恢复游戏气泡' }).click();
    await page.waitForFunction(() => runtime.state().record.choice === null);
    assert.equal(await page.getByRole('button', { name: '用自定义' }).isVisible(), true);
    const toggle = page.getByRole('switch', { name: '本地聊天泡泡' });
    await toggle.focus();
    await toggle.press('Space');
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await page.evaluate(() => gallery.tipsTxt.text), '尚未获得');
    assert.deepEqual(await page.evaluate(() => gallery.itemArr.map(item => [
      item.lockContainer.visible, item.timeContainer.visible,
    ])), [[true, false], [true, true]]);
    await page.evaluate(() => {
      gallery.previewText.event('click', { type: 'click' });
      ctx.scope.dispose();
      gallery.previewText.event('click', { type: 'click' });
    });
    assert.equal(await page.evaluate(() => nativeClicks), 2);
    assert.deepEqual(errors, []);
    report.push({ client, source: resolve(path), sourceSha256: createHash('sha256').update(source).digest('hex'),
      verified: ['native picker and seat rendering', 'local image decoding and persistence', 'game message and other seat unchanged',
        'invalid file and quick chat fallback', 'account isolation', 'revert and cleanup', 'widths and keyboard',
        'locked and expired cards stay unlocked across two native countdown ticks',
        'recycled cards release timer wrappers and toggle restores native status',
        'preview hint stays stable across countdown ticks on an already-open gallery',
        'new galleries close their preview timers and plugin disposal restores the native timer'] });
    await page.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Chat bubble checks passed in Classic and Remastered fixtures.');
} finally { await browser.close(); }
