import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import path from 'node:path';
import { nativeWallpaperFixture } from './native-wallpaper-fixture.mjs';

const currentClientPath = process.env.SGS_CURRENT_WALLPAPER_CLIENT;
const out = path.resolve(currentClientPath ? 'test-results/backgrounds-current-client' : 'test-results/backgrounds');
await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export { mountPluginUI } from './src/ui/plugin-ui.js'; export { BackgroundRegistry } from './src/core/backgrounds.js'; export { ResourceScope } from './src/core/resources.js'; export { Settings } from './src/core/storage.js'; export { activate } from './src/plugins/backgrounds/index.js'; export { createSkinDownload } from './src/plugins/skins/download.js'; export { advancedSkinOption } from './src/shared/skin-options.js'; export { createYjcmPicker } from './src/plugins/skins/yjcm-picker.js'; export { loadYjcmBackgroundMotion } from './src/plugins/skins/yjcm-motion.js'; export { openNativeSkinWindow } from './src/plugins/skins/native.js'; export { PluginManager } from './src/core/plugins.js'; export { SessionJournal } from './src/core/session.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'Check' });
const { nativeClass, nativeMethod } = await nativeWallpaperFixture(currentClientPath);
const client = currentClientPath
  ? { layer: 'tti', scene: 'nti', resources: 'ZOt', setter: 'tt' }
  : { layer: '_qt', scene: 'Dqt', resources: 'mNt', setter: 'O' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://backgrounds.fixture/', route => route.fulfill({
    contentType: 'text/html',
    body: '<body style="margin:0;background:#191a18"><div id="panel" style="position:fixed;right:12px;top:420px;padding:14px;box-sizing:border-box;background:#24241f;z-index:10"></div></body>',
  }));
  if (currentClientPath) await page.addInitScript(() => {
    const key = 'backgrounds-check:battleBackground';
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({
      name: '此前保存的皮肤', url: 'res/saved-skin.png', animated: false, owner: 'backgrounds',
    }));
  });
  const mount = async () => {
  await page.goto('https://backgrounds.fixture/');
  await page.addScriptTag({ path: 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(currentClient => {
    Laya.init(1200, 850); Laya.stage.bgColor = '#151915';
    window.UZt = class extends Laya.Sprite { constructor() { super(); Laya.stage.addChild(this); } onGameResize() {} };
    window.gO = class extends Laya.Sprite { addDrawChild(c) { return this.addChild(c); } OnStageResize() {} };
    window.p$t = class extends Laya.Sprite {
      set skin(url) {
        this.url = url; this.graphics.clear();
        if (url?.startsWith('blob:')) {
          mNt.GetResByUrl(url, this, (texture, actual) => {
            if (this.url !== actual) return;
            this.graphics.drawTexture(texture,0,0,texture.width,texture.height);
            this.event(Laya.Event.COMPLETE,this);
          }, 'image');
          return;
        }
        this.graphics.drawRect(0, 0, 800, 1200, url?.includes('skin') ? '#394b49' : '#473b2d'); this.graphics.drawCircle(400,600,180,'#ae9760'); this.graphics.drawRect(0,0,800,22,'#ffb858');this.graphics.drawRect(0,1178,800,22,'#85cde0'); this.graphics.drawLine(400,0,400,1200,'#e5dac0',3);
      }
      set scale(value) { this.scaleX=value;this.scaleY=value; }
      get scale() { return this.scaleX; }
      get skin() { return this.url; }
      posInteger(x,y) { this.pos(x,y); }
    };
    window.ti = { backgroundLayer: 0 }; window.hi = { Lv1: 1 };
    window.cAt = { gameWidth: 1200, gameHeight: 850, gameScale: 1 };
    if (!currentClient) window.SystemContext = window.cAt;
    window.V2t = { IsInGame: false }; window.dqt = { CARDUI_CONTAINER_HEIGHT: 100 };
    window.ue = { I: () => ({ event() {} }) };
    // Synthetic resource players with the actual native background factories.
    // Artwork/animation data are fixture-owned; no official session is started.
    window.E$t = window.uO = class extends Laya.Sprite {
      static SPINE_EFFECT_LOAD_COMPLETE = 'SPINE_EFFECT_LOAD_COMPLETE';
      AutoStart = true;
      startedClips = [];
      InitEffect(url, animation, loop) { this.url=url;this.animation=animation;this.loop=loop;this.graphics.clear();this.graphics.drawRect(-297,-167.5,594,335,'#283d42');this.graphics.drawCircle(0,0,75,url.includes('beijing')?'#678e8a':'#dbba70'); }
      playEffect() {
        if (!this.AutoStart && !this.templet) {
          Laya.timer.once(10, this, () => {
            this.templet = { skeletonData: { animations: ['ChuChang', 'DaiJi'].map(name => ({ name })) } };
            this.event(this.constructor.SPINE_EFFECT_LOAD_COMPLETE, this);
          });
          return;
        }
        const clip = this.templet?.skeletonData.animations[this.animation]?.name ?? this.animation;
        this.startedClips.push({ clip, loop: this.loop });
        this.running=true;Laya.timer.loop(30,this,this.animate);Laya.timer.once(10,this,()=>this.event(Laya.Event.START,this));
      }
      animate() { this.rotation=(this.rotation+.2)%3; }
      stop() { this.running=false;Laya.timer.clear(this,this.animate); }
      destroy(...args) { Laya.timer.clearAll(this);super.destroy(...args); }
    };
    if (currentClient) {
      // The shipped layer and its base use closure-private classes; supply the
      // replay's Laya nodes, dispatch and layout values under those names.
      window.JN = class extends Laya.Sprite {
        constructor() { super(); Laya.stage.addChild(this); }
        get ged() { return { on() {} }; }
      };
      window.qN = window.ukt = class extends Laya.Sprite {};
      Object.assign(window, { j_: gO, Iv: ti, KU: p$t, Dbt: hi, _kt: cAt,
        Zni: V2t, iti: dqt, dt: ue, pei: E$t, FU: uO });
      Object.assign(cAt, { GamePaddingLeft: 0, GamePaddingTop: 0 });
    }
  }, Boolean(currentClientPath));
  await page.addScriptTag({ content: `
    ${currentClientPath ? `window.$9t = (${nativeClass('$9t')});` : ''}
    window.${client.layer} = window.NativeBackground = (${nativeClass(client.layer)});
    window.${client.resources} = window.mNt = {
      ${nativeMethod(client.resources, 'GetResByUrl')},
      resConfig: { getResourceUrl(url) { throw Error('Unexpected resource formatting: '+url); } },
      resLoader: { loadItem(url) { throw Error('Unexpected uncached resource: '+url); } }
    };
    window.wallpaperMethods = {
      ${nativeMethod(client.scene, 'SetWallPaperByUrl')},
      ${nativeMethod(client.scene, 'onWallPaperChange')}
    };` });
  await page.evaluate(()=>new Promise(resolve=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;
    const c=canvas.getContext('2d');const gradient=c.createLinearGradient(0,0,800,1200);gradient.addColorStop(0,'#7d9f9b');gradient.addColorStop(1,'#765739');c.fillStyle=gradient;c.fillRect(0,0,800,1200);c.fillStyle='#ae9760';c.beginPath();c.arc(400,600,180,0,Math.PI*2);c.fill();
    Laya.loader.load(canvas.toDataURL(),Laya.Handler.create(null,t=>{window.edgeTexture=t;resolve();}),null,Laya.Loader.IMAGE);
  }));
  await page.evaluate(setter => {
    const scope = new Check.ResourceScope(), pluginScope = new Check.ResourceScope();
    const baseSettings = new Check.Settings(localStorage, 'backgrounds-check:');
    const native = new NativeBackground();
    NativeBackground.instance = native;
    const special = new Laya.Sprite(); special.name = '裴秀地图交互'; special.size(130,70); special.pos(500,260); special.graphics.drawRect(0,0,130,70,'#947b48'); special.mouseEnabled=true; let clicks=0; special.on('click',special,()=>clicks++); native.addChild(special);
    const scene = { currentWeatherWallPaper: 0,
      ...window.wallpaperMethods,
      SetWallPaperById() { native[setter]('res/personal.png'); },
      OnNormalWallPaperChange() { this.SetWallPaperById(); },
      OnWeatherWallPaperChange() { native.effectPath='weather'; },
    };
    const seat = new Laya.EventDispatcher();
    const registry = new Check.BackgroundRegistry({ window: { document, SystemContext: window.SystemContext, URL, Image, Blob, indexedDB, Laya: { ...Laya, stage: Laya.stage, loader: {
      load(url, handler, progress, type) {
        if (url.startsWith('blob:')) Laya.loader.load(url, handler, progress, type);
        else handler.runWith(edgeTexture);
      },
      getRes: url => Laya.loader.getRes(url), clearRes: url => Laya.loader.clearRes(url),
    } } }, scope, settings: baseSettings, game: { getScene:()=>scene,isInGame:()=>true,
      getSelfSeatUI: () => ({ seat }), getCardMeta: () => ({ firstSkillId: 1 }) } });
    const detail = new Laya.Sprite(); detail.showMaxSkinWindow=()=>{}; detail.updateSkinInfo=()=>{}; detail.Close=function(){this.startAnimateOut();};detail.startAnimateOut=()=>{};detail.enterWindow=function(){this.visible=true;};
    detail.skinData={skinBaseVo:{skinname:'山水之间 · 演练皮肤',skinID:123,SkinBigUrl:()=> 'res/skin.png'}};
    detail.isHor=true; detail.skinImg=new Laya.Sprite(); detail.skinImg.skin="res/skin.png"; Object.defineProperty(detail.skinImg,"texture",{value:{width:1600,height:900},writable:true}); detail.skinImg.size(650,280); detail.skinImg.pos(90,65); detail.skinImg.graphics.drawRect(0,0,650,280,'#36483d'); detail.addChild(detail.skinImg); Laya.stage.addChild(detail);
    const label=new Laya.Text();label.text='皮肤详情 · Laya 原生坐标演练';label.color='#e6d5a5';label.fontSize=24;label.pos(120,150);detail.addChild(label);
    let panelCleanup, themeWatch;
    const panelHost=document.querySelector('#panel'); const shadow=panelHost.attachShadow({mode:'open'}); const panelContent=document.createElement('div');shadow.append(panelContent);
    const settings = baseSettings.namespace('backgrounds');
    const skinSettings = baseSettings.namespace('skins');
    const ctx={window,document,scope:pluginScope,settings,notify:()=>{},skinWindows:{open:(...args)=>fixture.skinWindows.open(...args)},backgrounds:{register:()=>pluginScope.add(registry.register('backgrounds')),select:spec=>registry.select('backgrounds',spec),selectLocal:file=>registry.selectLocal('backgrounds',file),subscribe:fn=>registry.subscribe(fn),get current(){return registry.current;},get status(){return registry.status;}},
      ui:{nativeTheme:{watch(fn){themeWatch=fn;fn({text:'#eee3cc',muted:'#b7aa8c',accent:'#dbba70',border:'#665b42',surface:'#2c2922'});}},registerPanel(spec){panelCleanup=spec.render(panelContent);}}};
    Object.assign(ctx.ui, Check.mountPluginUI(ctx, () => ctx));
    ctx.ui.mountStyles(shadow);
    ctx.backgrounds.skinShortcutEnabled = () => Check.advancedSkinOption(skinSettings, 'backgroundShortcut');
    ctx.backgrounds.setAttackEffects = enabled => registry.setAttackEffects('backgrounds', enabled);
    ctx.backgrounds.setAnimated = enabled => registry.setAnimated('backgrounds', enabled);
    Check.activate(ctx); Check.createSkinDownload({ ...ctx, settings: skinSettings });
    const resize = (width, height, stageWidth, stageHeight) => {
      Object.assign(cAt, { gameWidth: width, gameHeight: height });
      Laya.stage.size(stageWidth, stageHeight);
      native.onGameResize();
    };
    window.fixture={scope,pluginScope,registry,native,scene,seat,special,detail,settings,skinSettings,resize,getClicks:()=>clicks,themeWatch,dispose:()=>{panelCleanup();pluginScope.dispose();scope.dispose();}};
    document.querySelector('#panel').style.cssText+=';--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-surface:#2c2922';
  }, client.setter);
  };
  await mount();
  if (currentClientPath) {
    assert.deepEqual(await page.evaluate(() => ({
      legacyMethod: typeof fixture.native.O, globalGeometry: typeof window.SystemContext,
      viewport: [fixture.native.scrollRect.width, fixture.native.scrollRect.height],
      skin: fixture.native.bg?.skin,
    })), { legacyMethod: 'undefined', globalGeometry: 'undefined', viewport: [1200, 850], skin: 'res/saved-skin.png' });
    await page.getByRole('button', { name: '恢复游戏背景' }).click();
  }
  const button = page.getByRole('button', { name: '作为牌局背景', exact: true });
  await page.evaluate(()=>{fixture.detail.skinData.skinBaseVo.SkinBigUrl=()=>{throw Error('skin config pending');};});
  await page.waitForTimeout(250);assert.equal(await button.isVisible(),false);
  await page.evaluate(()=>{fixture.detail.skinData.skinBaseVo.SkinBigUrl=()=> 'res/skin.png';});
  await page.waitForTimeout(250);assert.equal(await button.isVisible(),true);
  await page.evaluate(()=>{fixture.detail.isHor=false;});
  await page.waitForTimeout(250); assert.equal(await button.isVisible(),false);
  await page.screenshot({path:path.join(out,'portrait-no-button.png')});
  await page.evaluate(()=>{fixture.detail.isHor=true;fixture.detail.skinImg.texture={width:800,height:1200};});
  await page.waitForTimeout(250); assert.equal(await button.isVisible(),false);
  await page.evaluate(()=>{fixture.detail.skinImg.texture={width:1600,height:900};});
  await page.waitForTimeout(250); assert.equal(await button.isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'下载皮肤原图',exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(out,'skin-actions.png')});
  const download = page.getByRole('button', { name: '下载皮肤原图', exact: true });
  await page.evaluate(() => fixture.skinSettings.set('quickDownload', false));
  await download.waitFor({ state: 'hidden' });
  assert.equal(await button.isVisible(), true);
  await page.evaluate(() => { fixture.skinSettings.set('quickDownload', true); fixture.skinSettings.set('backgroundShortcut', false); });
  await button.waitFor({ state: 'hidden' });
  assert.equal(await download.isVisible(), true);
  await page.evaluate(() => { fixture.skinSettings.set('backgroundShortcut', true); fixture.skinSettings.set('advanced', false); });
  await download.waitFor({ state: 'hidden' });
  await button.waitFor({ state: 'hidden' });
  await page.evaluate(() => fixture.skinSettings.set('advanced', true));
  await button.waitFor(); await download.waitFor();
  assert.equal(await page.evaluate(()=>{fixture.detail.Close();return document.querySelector('[data-sgs-backgrounds].bg-skin-action').hidden && document.querySelector('[data-sgs-skin-download]').hidden;}),true);
  await page.waitForTimeout(250); assert.equal(await button.isVisible(),false);
  await page.evaluate(()=>fixture.detail.enterWindow()); await page.waitForTimeout(250);
  await page.evaluate(()=>{fixture.detail.isHor=false;});await page.waitForTimeout(250);
  assert.equal(await button.isVisible(),false);assert.equal(await page.getByRole('button',{name:'下载皮肤原图',exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(out,'portrait-download.png')});
  await page.route('https://official.fixture/skin.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGAAAAABJRU5ErkJggg==','base64'),headers:{'access-control-allow-origin':'*'}}));
  await page.evaluate(()=>{fixture.detail.skinData.skinBaseVo.SkinBigUrl=()=> 'https://official.fixture/skin.png';});
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'下载皮肤原图',exact:true}).click();assert.match((await saved).suggestedFilename(),/123_1.png$/);
  await page.evaluate(()=>{fixture.detail.isHor=true;fixture.detail.skinData.skinBaseVo.SkinBigUrl=()=> 'res/skin.png';});await page.waitForTimeout(250);
  await button.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>fixture.native.bg.skin),'res/skin.png');
  // Execute the captured native load completion: effects are cleared, arbitrary
  // SpecialBackground children are not removed or hidden.
  await page.evaluate(()=>{fixture.native.bgLoadComplete();fixture.detail.visible=false;});
  assert.deepEqual(await page.evaluate(()=>({w:fixture.native.bg.width,h:fixture.native.bg.height,x:fixture.native.bg.x,y:fixture.native.bg.y,sx:fixture.native.bg.scaleX,sy:fixture.native.bg.scaleY})),{w:800,h:1200,x:(1200-800*(850/1200))/2,y:0,sx:850/1200,sy:850/1200});
  await page.screenshot({path:path.join(out,'aspect-portrait.png')});
  await page.evaluate(()=>fixture.resize(1000,700,2000,1400));
  assert.deepEqual(await page.evaluate(()=>[fixture.native.bg.scaleX,fixture.native.bg.scaleY,fixture.native.bg.x,fixture.native.bg.y]),[700/1200,700/1200,(1000-800*(700/1200))/2,0]);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=123;fixture.native.updateBgSize();});
  assert.equal(await page.evaluate(()=>fixture.native.bg.width),1600,'weather keeps native layout');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-edge-fill').visible),false);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=0;fixture.resize(1200,850,1200,850);});
  await page.mouse.click(550,290);
  assert.equal(await page.evaluate(()=>fixture.getClicks()),1);
  assert.equal(await page.evaluate(()=>fixture.special.visible),true);
  // Unowned / locked skin exposes the same public dynamic resources. Enter
  // selects the default dynamic mode; an already saved legacy image enriches.
  await page.evaluate(()=>{
    fixture.detail.visible=true;fixture.detail.isOwnDynamic=false;fixture.detail.ownNum=0;
    Object.assign(fixture.detail.skinData.skinBaseVo,{ResType:3,NewSkinJudge:1,canUpdateDynamic:()=>true,DynamicSkinBigSkeletonUrlNew:()=> 'res/animate/skinEffectNew/123'});
  });
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用');
  assert.equal(await page.getByRole('button',{name:'动态',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').visible),true);
  const backgroundClips = () => page.evaluate(() => fixture.native.getChildByName('sgs-background-motion').getChildAt(0).startedClips);
  assert.deepEqual(await backgroundClips(), [{ clip: 'DaiJi', loop: true }]);
  const attack = page.getByRole('switch', { name: '攻击特效' });
  const attackNodes = () => page.evaluate(() => fixture.native.getChildByName('sgs-background-motion')?._children.filter(node => node.animation === 'GongJi').length ?? 0);
  assert.equal(await attack.isChecked(), true);
  await page.evaluate(() => fixture.seat.event('USE_CARD', [1, 2]));
  assert.equal(await attackNodes(), 0);
  await page.evaluate(() => fixture.seat.event('USE_CARD', [1, 1]));
  assert.equal(await attackNodes(), 2);
  await page.waitForFunction(() => fixture.native.getChildByName('sgs-background-motion')._children.some(node => node.animation === 'GongJi' && node.visible));
  await page.screenshot({path:path.join(out,'dynamic-playing.png')});
  await attack.focus(); await page.keyboard.press('Space');
  assert.equal(await attack.isChecked(), false);
  assert.equal(await attackNodes(), 0);
  assert.equal(await page.evaluate(() => fixture.registry.status), '动态牌局背景已启用');
  await page.evaluate(() => fixture.seat.event('USE_SKILL_CARD', [8, 1]));
  assert.equal(await attackNodes(), 0);
  await attack.click();
  await page.evaluate(() => fixture.seat.event('USE_SKILL_CARD', [8, 1]));
  assert.equal(await attackNodes(), 2);
  await page.evaluate(() => fixture.native.getChildByName('sgs-background-motion')._children.find(node => node.animation === 'GongJi').event(Laya.Event.STOPPED));
  assert.equal(await attackNodes(), 0);
  const panelLayout = async (width, offset) => {
    const bounds = await page.evaluate(({width, offset}) => {
      const panel = document.querySelector('#panel');
      panel.style.width = `${width}px`;
      panel.style.setProperty('--sgs-font-offset', `${offset}px`);
      const content = panel.shadowRoot.querySelector('[data-sgs-backgrounds]');
      const row = content.querySelector('.bg-attack');
      const [label, slider] = row.children;
      return { panelWidth: panel.getBoundingClientRect().width, panelRight: panel.getBoundingClientRect().right,
        contentRight: content.getBoundingClientRect().right, labelRight: label.getBoundingClientRect().right,
        switchLeft: slider.getBoundingClientRect().left, switchRight: slider.getBoundingClientRect().right,
        switchWidth: slider.getBoundingClientRect().width, style: getComputedStyle(slider).appearance,
        rowFits: row.scrollWidth === row.clientWidth, labelHeight: label.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(label).lineHeight) };
    }, {width, offset});
    assert.equal(bounds.panelWidth, width);
    assert.equal(bounds.style, 'none');
    assert.equal(bounds.switchWidth, 30);
    assert.ok(bounds.labelRight < bounds.switchLeft && bounds.switchRight <= bounds.contentRight && bounds.contentRight < bounds.panelRight);
    assert.ok(bounds.rowFits && Math.abs(bounds.labelHeight - bounds.lineHeight) < 1);
  };
  for (const width of [248, 280, 420]) {
    for (const offset of [-2, -1, 0, 2]) await panelLayout(width, offset);
    await page.screenshot({path:path.join(out,`attack-panel-${width}.png`)});
  }
  await page.evaluate(() => {
    document.querySelector('#panel').style.cssText += ';background:#f7f3e8;--sgs-bg:#f2e9d6;--sgs-text:#30291e;--sgs-muted:#615747;--sgs-accent:#805714;--sgs-border:#b9ab90;--sgs-surface:#f7f3e8;max-height:145px;overflow:auto';
  });
  for (const offset of [-2, -1, 0, 2]) await panelLayout(248, offset);
  await page.screenshot({path:path.join(out,'attack-panel-light-scroll.png')});
  await page.evaluate(() => {
    document.querySelector('#panel').style.cssText += ';background:#24241f;--sgs-bg:#201e1a;--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-surface:#2c2922;max-height:none;overflow:visible';
  });
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for (const viewport of [{ width: 1024, height: 1366 }, { width: 1366, height: 1024 }, { width: 512, height: 768 }]) {
    await page.setViewportSize(viewport);
    await panelLayout(248, 2);
    for (const checked of [false, true]) {
      const bounds = await attack.boundingBox();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 15, y: bounds.y + 9 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await attack.isChecked(), checked);
    }
  }
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole('button',{name:'静态',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion')),null);
  assert.equal(await page.evaluate(()=>fixture.settings.get('animated')),false);
  assert.equal(await attack.isDisabled(), true);
  await page.getByRole('button',{name:'动态',exact:true}).click();
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用');
  await page.evaluate(() => { fixture.detail.skinData.skinBaseVo.HasGongJi = false; });
  await attack.waitFor({ state: 'hidden' });
  await page.evaluate(() => { fixture.detail.skinData.skinBaseVo.HasGongJi = true; });
  await attack.waitFor();
  await page.waitForFunction(() => fixture.registry.status === '动态牌局背景已启用');
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=1;fixture.native.updateBgSize();fixture.registry.refresh();});
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').visible),false);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=0;fixture.native.updateBgSize();fixture.registry.refresh();});
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').visible),true);
  assert.deepEqual(await backgroundClips(), [{ clip: 'DaiJi', loop: true }, { clip: 'DaiJi', loop: true }]);
  await page.evaluate(()=>fixture.scene.SetWallPaperByUrl('res/skill.png'));
  await page.getByRole('button',{name:'静态',exact:true}).click();
  assert.equal(await page.evaluate(()=>fixture.native.bg.skin),'res/skill.png');
  await page.evaluate(()=>fixture.scene.onWallPaperChange());
  await page.getByRole('button',{name:'动态',exact:true}).click();
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用');
  // Decode a real, locally generated video through the bundled VideoTexture.
  const videoBytes = await page.evaluate(async () => {
    const c=document.createElement('canvas');c.width=320;c.height=180;
    const draw=c.getContext('2d');draw.fillStyle='#468b83';draw.fillRect(0,0,320,180);
    document.body.append(c);const stream=c.captureStream(0),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
    const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});
    recorder.start();for(let i=0;i<5;i++){draw.fillStyle=i%2?'#468b83':'#577c96';draw.fillRect(0,0,320,180);stream.getVideoTracks()[0].requestFrame();await new Promise(resolve=>setTimeout(resolve,150));}recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());c.remove();
    return [...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())];
  });
  assert.ok(videoBytes.length>200,'fixture video includes encoded frames');
  await page.route('https://backgrounds.test/skin.mp4',route=>route.fulfill({status:200,contentType:'video/webm',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from(videoBytes)}));
  await page.evaluate(()=>{
    fixture.registry.select('backgrounds',{...fixture.registry.current,dynamic:{kind:'video',url:'https://backgrounds.test/skin.mp4',width:594,height:335}});
  });
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用' || fixture.registry.status.includes('失败'));
  assert.equal(await page.evaluate(()=>fixture.registry.status),'动态牌局背景已启用');
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(()=>Laya.VideoTexture._videoTexturePool.filter(t=>t.video).length),1);
  const videoShot = await page.screenshot({path:path.join(out,'video-playing.png')});
  const pixel = await page.evaluate(async bytes=>{
    const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const c=canvas.getContext('2d');c.drawImage(bitmap,0,0);return [...c.getImageData(200,550,1,1).data];
  },[...videoShot]);
  assert.ok(pixel[0]>55 && pixel[2]>90,`decoded video is visible in the canvas: ${pixel}`);
  await page.getByRole('button',{name:'静态',exact:true}).click();
  assert.equal(await page.evaluate(()=>Laya.VideoTexture._videoTexturePool.filter(t=>t.video).length),0);
  await page.evaluate(()=>{
    Object.assign(fixture.detail.skinData.skinBaseVo,{ResType:2,DynamicSkinBigSkeletonUrl:'res/bone/123',ManyPeopleResourceList:['role']});
    // Select again instead of reusing the video's saved resource form.
    fixture.registry.select('backgrounds',null);
  });
  await page.getByRole('button',{name:'作为牌局背景',exact:true}).click();
  await page.getByRole('button',{name:'动态',exact:true}).click();
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').numChildren),2);
  assert.equal(await attack.count(), 0);
  for (const width of [248,280,420]) {
    await page.evaluate(width=>document.querySelector('#panel').style.width=width+'px',width);
    await page.screenshot({path:path.join(out,`panel-${width}.png`)});
    assert.equal(await page.evaluate(()=>{const p=document.querySelector('#panel');return p.scrollWidth<=p.clientWidth;}),true);
  }
  await page.evaluate(()=>{
    fixture.themeWatch({text:'#30291e',muted:'#615747',accent:'#805714',border:'#b9ab90',surface:'#f7f3e8'});
    document.querySelector('#panel').style.cssText+=';background:#f7f3e8;--sgs-text:#30291e;--sgs-muted:#615747;--sgs-accent:#805714;--sgs-border:#b9ab90;--sgs-surface:#f7f3e8;width:248px;max-height:160px;overflow:auto';
    fixture.registry.select('backgrounds',{name:'很长的皮肤名称'.repeat(18),url:'res/skin.png'});
  });
  await page.screenshot({path:path.join(out,'light-long.png')});
  await page.getByRole('button',{name:'恢复游戏背景'}).click();
  assert.equal(await page.evaluate(()=>fixture.native.bg.skin),'res/personal.png');

  const remoteRequests = [];
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  const imageFile = async (name, mimeType, width = 640, height = 480) => {
    const data = await page.evaluate(({ mimeType, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const g = canvas.getContext('2d');
      g.fillStyle = '#365f82'; g.fillRect(0, 0, width, height);
      return canvas.toDataURL(mimeType).split(',')[1];
    }, { mimeType, width, height });
    return { name, mimeType, buffer: Buffer.from(data, 'base64') };
  };
  const picker = page.getByRole('button', { name: '选择本地图片' });
  const png = await imageFile('本地背景.png', 'image/png');
  const dialogOpened = page.waitForEvent('filechooser');
  await picker.focus(); await page.keyboard.press('Enter');
  await (await dialogOpened).setFiles(png);
  await page.waitForFunction(() => fixture.registry.status === '静态牌局背景已启用');
  const local = await page.evaluate(() => ({
    choice: fixture.registry.current, url: fixture.native.bg.skin,
    width: fixture.native.bg.width, height: fixture.native.bg.height,
  }));
  assert.match(local.url, /^blob:/);
  assert.deepEqual([local.width, local.height], [640, 480]);
  assert.equal(local.choice.name, png.name);
  assert.equal(local.choice.url, undefined, 'blob URLs are session-only');
  assert.equal(await page.getByRole('group', { name: '背景播放' }).count(), 0);
  assert.equal(await attack.count(), 0);
  assert.equal(await page.evaluate(() => fixture.settings.get('animated')), true);
  const screenshot = await page.screenshot({path:path.join(out, 'local-static.png')});
  const localPixel = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return [...ctx.getImageData(800, 280, 1, 1).data];
  }, [...screenshot]);
  assert.deepEqual(localPixel, [54, 95, 130, 255], 'the selected local image is rendered on the game canvas');

  const input = page.locator('[data-sgs-backgrounds] input[type=file]');
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8); animation.write('acTL', 4); animation.writeUInt32BE(2, 8);
  const apng = Buffer.concat([png.buffer.subarray(0, 33), animation, png.buffer.subarray(33)]);
  const animatedWebp = Buffer.alloc(30);
  animatedWebp.write('RIFF'); animatedWebp.write('WEBPVP8X', 8); animatedWebp[20] = 2;
  for (const [file, message] of [
    [{ name: '动图.png', mimeType: 'image/png', buffer: apng }, /暂不支持 APNG/],
    [{ name: '动图.webp', mimeType: 'image/webp', buffer: animatedWebp }, /暂不支持动态 WebP/],
    [{ name: '伪装.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') }, /请选择 PNG/],
    [{ name: '损坏.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 0]) }, /无法打开图片/],
  ]) {
    await input.setInputFiles(file);
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    assert.equal(await page.evaluate(() => fixture.native.bg.skin), local.url);
  }
  const canceled = page.waitForEvent('filechooser');
  await picker.click();
  await (await canceled).setFiles([]);
  assert.equal(await page.evaluate(() => fixture.native.bg.skin), local.url);
  await page.evaluate(() => fixture.scene.SetWallPaperByUrl('res/skill.png'));
  assert.equal(await page.evaluate(() => fixture.native.bg.skin), 'res/skill.png');
  await page.evaluate(() => {
    Laya.loader.clearRes(fixture.registry.localImage.url);
    fixture.scene.onWallPaperChange();
  });
  await page.waitForFunction(() => fixture.native.bg.skin.startsWith('blob:'));
  assert.deepEqual(remoteRequests, [], 'local image operations never request an HTTP(S) URL');

  await mount();
  await page.waitForFunction(() => fixture.registry.status === '静态牌局背景已启用');
  assert.equal(await page.evaluate(() => fixture.registry.current.name), png.name);
  assert.notEqual(await page.evaluate(() => fixture.native.bg.skin), local.url);
  const readSaved = id => page.evaluate(id => new Promise((resolve, reject) => {
    const open = indexedDB.open('sgs-toolbox-backgrounds', 1);
    open.onsuccess = () => {
      const db = open.result, request = db.transaction('images').objectStore('images').get(id);
      request.onsuccess = () => { db.close(); resolve(Boolean(request.result)); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
    open.onerror = () => reject(open.error);
  }), id);
  const bmp = Buffer.alloc(70, 0);
  bmp.write('BM'); bmp.writeUInt32LE(70, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(2, 18); bmp.writeInt32LE(2, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  let previousId = local.choice.localImageId;
  for (const file of [
    await imageFile('换一张.jpg', 'image/jpeg'),
    await imageFile('换一张.webp', 'image/webp'),
    { name: '换一张.bmp', mimeType: 'image/bmp', buffer: bmp },
  ]) {
    await input.setInputFiles(file);
    await page.waitForFunction(name => fixture.registry.current?.name === name && fixture.registry.status === '静态牌局背景已启用', file.name);
    assert.equal(await readSaved(previousId), false);
    previousId = await page.evaluate(() => fixture.registry.current.localImageId);
  }
  await page.getByRole('button',{name:'恢复游戏背景'}).click();
  assert.equal(await page.evaluate(() => fixture.native.bg.skin), 'res/personal.png');
  assert.equal(await readSaved(previousId), false);
  assert.equal(await page.getByRole('button', { name: '动态', exact:true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(remoteRequests.filter(url => url !== 'https://backgrounds.fixture/'), []);

  const wide = await imageFile('一将横版.png', 'image/png', 1600, 640);
  const portrait = await imageFile('竖版.png', 'image/png', 400, 720);
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/general/**/shortcut-*.png', route => {
    const image = route.request().url().endsWith('/shortcut-first.png') ? portrait : wide;
    return route.fulfill({ contentType: image.mimeType, body: image.buffer, headers: { 'access-control-allow-origin': '*' } });
  });
  const jpeg = await imageFile('手杀横版.jpg', 'image/jpeg');
  const skinClient = currentClientPath ? await nativeWallpaperFixture() : { nativeMethod };
  await page.addScriptTag({ content: `window.skinEntry = {
    ${skinClient.nativeMethod('ue', '_')},
    ${skinClient.nativeMethod('ue', 'ShowWindowAfterCloseOther')},
  };` });
  await page.evaluate(async ([bytes, portraitBytes]) => {
    const { registry, skinSettings, scope } = fixture;
    let open;
    const nativeOpens = [];
    window.JH = { I: () => ({ IsFuncCloseByName: () => false }) };
    window.lNt = class { static OPEN_WINDOW = 'OPEN_WINDOW'; };
    const dispatcher = Object.assign(skinEntry, { windowNameList: [], event(event, payload) {
      nativeOpens.push([event, payload.WindowName, payload.Data]);
    } });
    const game = { getClass: name => name === 'SkinWindow' ? class {} : undefined,
      getSelf: () => ({ ClientId: 12 }), getDispatcher: () => dispatcher };
    const manager = new Check.PluginManager({ journal: new Check.SessionJournal(), settings: registry.settings,
      context: { window, document, backgrounds: registry, game, themes: { subscribe: () => () => {} } } });
    scope.add(() => manager.dispose());
    let releaseLandscape;
    const motionEvents = [];
    const download = async (resource, { signal }) => {
      if (resource === 'wide.jpg') {
        await new Promise(resolve => { releaseLandscape = resolve; });
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      }
      return Uint8Array.from(resource === 'portrait.png' ? portraitBytes : bytes);
    };
    const mobile = { id: 'cloud-1', number: '1', source: 'mobile', general: '势魏延', name: '狂志吞天',
      art: 'portrait.png', backgroundArt: 'wide.jpg', download };
    const cross = { id: 2, general: '界陆逊', name: '连营画卷', assets: [[1, 'shortcut-first']] };
    const catalogue = (entry, ...variants) => ({ searchSkins: query => ({
      all: !query || entry.general.includes(query) ? [entry] : [], categories: new Map(),
    }),
      skinForms: () => [entry, ...variants], skinVoices: () => [] });
    const local = { portraitBinding() {},
      yjcm: { current: catalogue(cross, { ...cross, assets: [[1, 'shortcut-second']], motion: { files: [] } }) },
      mobile: { load: async () => catalogue(mobile, { ...mobile, id: 'cloud-1#2', number: '1#2', art: 'preview.jpg',
        backgroundArt: undefined, mobileMotion: 'placeholder.zip' },
      { ...mobile, id: 'cloud-1#3', number: '1#3', backgroundArt: undefined }) } };
    const slot = manager.makeSlot({ manifest: { id: 'skins' }, activate(ctx) {
      open = Check.createYjcmPicker(ctx, local);
      ctx.skinWindows.register((source, trigger) => source === 'native'
        ? Check.openNativeSkinWindow(ctx) : open({ trigger }, source));
      ctx.backgrounds.registerSkinMotion(key => {
        const actor = new Laya.Sprite();
        actor.name = 'fixture-idle';
        let frame = 0, width, height;
        const repaint = () => {
          actor.graphics.clear();
          actor.graphics.drawRect(width / 4, height / 4, width / 2, height / 2, (frame++ & 1) ? '#365f82' : '#3c6285');
          actor.frames = frame;
        };
        return { actor,
          fit(_x, _y, w, h) { width = w; height = h; repaint(); },
          setPlaying(value) { motionEvents.push([key, value]); if (value) Laya.timer.loop(35, actor, repaint); else Laya.timer.clearAll(actor); },
          dispose() { Laya.timer.clearAll(actor); actor.destroy(true); },
        };
      });
    } }, { enabled: true });
    manager.slots.set('skins', slot);
    await manager.activate(slot);
    const background = manager.makeSlot({ manifest: { id: 'backgrounds', dependencies: ['skins'] }, activate(ctx) {
      fixture.skinWindows = ctx.skinWindows;
    } }, { enabled: true });
    manager.slots.set('backgrounds', background);
    await manager.activate(background);
    const anchor = document.createElement('span');
    anchor.dataset.sgsToolbox = 'core'; document.body.append(anchor);
    fixture.skinShortcut = { open: (kind, offset = 0) => {
      anchor.style.setProperty('--sgs-font-offset', offset + 'px'); return open({}, kind);
    }, landscapePending: () => Boolean(releaseLandscape), finishLandscape: () => {
      const finish = releaseLandscape; releaseLandscape = null; finish();
    }, motionEvents, nativeOpens, enable: value => skinSettings.set('backgroundShortcut', value) };
  }, [[...jpeg.buffer], [...portrait.buffer]]);
  const links = page.getByRole('group', { name: '皮肤入口' });
  const one = links.getByRole('button', { name: '一将皮肤', exact: true });
  const mobile = links.getByRole('button', { name: '手杀皮肤', exact: true });
  const nativeEntry = links.getByRole('button', { name: /本服皮肤管理/ });
  assert.equal(await nativeEntry.getAttribute('aria-keyshortcuts'), 'Control+Alt+K');
  await one.press('Enter');
  const crossPicker = page.getByRole('dialog', { name: '一将成名皮肤' });
  const query = crossPicker.getByRole('searchbox');
  await query.fill('不存在');
  assert.equal(await crossPicker.locator('.result').count(), 0);
  await query.fill('陆逊');
  await crossPicker.locator('.result').waitFor();
  await query.press('Control+Alt+k');
  assert.deepEqual(await page.evaluate(() => fixture.skinShortcut.nativeOpens), []);
  await crossPicker.getByRole('button', { name: '关闭' }).click();
  assert.ok(await one.evaluate(button => button.getRootNode().activeElement === button));
  await mobile.click();
  const mobilePicker = page.getByRole('dialog', { name: '移动版皮肤' });
  await mobilePicker.getByRole('searchbox').fill('魏延');
  await mobilePicker.locator('.result').waitFor();
  await mobilePicker.getByRole('button', { name: '关闭' }).click();
  await nativeEntry.click();
  await page.keyboard.press('Control+Alt+k');
  assert.deepEqual(await page.evaluate(() => fixture.skinShortcut.nativeOpens), [
    ['OPEN_WINDOW', 'SkinWindow', [2]], ['OPEN_WINDOW', 'SkinWindow', [2]],
  ]);
  const panel = page.locator('#panel');
  for (const [width, font, light] of [[248, 2, false], [280, 0, false], [420, -1, true], [420, -2, false]]) {
    await panel.evaluate((node, [width, font]) => {
      node.style.width = `${width}px`;
      node.style.setProperty('--sgs-font-offset', `${font}px`);
    }, [width, font]);
    assert.ok(await links.evaluate(group => Array.from(group.querySelectorAll('button')).every(button =>
      button.getBoundingClientRect().height >= 32 && button.scrollWidth <= button.clientWidth + 1 &&
      button.getBoundingClientRect().right <= group.getBoundingClientRect().right + 1)), `shortcuts fit at ${width}px`);
    if (light) {
      await panel.evaluate(node => {
        node.style.background = '#f7f2e6';
        for (const [key, value] of Object.entries({ text: '#282419', muted: '#67583b', surface: '#fff9ed', accent: '#7c581d', border: '#baa989' }))
          node.style.setProperty(`--sgs-${key}`, value);
      });
    }
    if (width === 248 || light) await panel.screenshot({ path: path.join(out, `skin-entry-panel-${width}.png`) });
  }
  const shortcut = page.getByRole('button', { name: '设为牌局背景', exact: true });
  const selectedShortcut = page.getByRole('button', { name: '已设为牌局背景', exact: true });
  const selectSkin = async (kind, offset) => {
    await page.evaluate(([kind, offset]) => { fixture.skinShortcut.open(kind, offset); }, [kind, offset]);
    const dialog = page.getByRole('dialog');
    await dialog.locator('.result').click();
    return dialog;
  };
  await page.evaluate(() => fixture.skinShortcut.enable(false));
  let importedDialog = await selectSkin('cross');
  assert.equal(await shortcut.count(), 0);
  await importedDialog.getByRole('button', { name: '关闭' }).click();
  await page.evaluate(() => fixture.skinShortcut.enable(true));
  importedDialog = await selectSkin('cross');
  await importedDialog.getByRole('img', { name: '连营画卷预览' }).waitFor();
  assert.equal(await shortcut.count(), 0, 'Yjcm portrait-only form has no background action');
  await importedDialog.getByRole('button', { name: '第二形态' }).click();
  await shortcut.focus(); await page.keyboard.press('Enter');
  await selectedShortcut.waitFor();
  await page.waitForFunction(() => fixture.registry.status === '动态牌局背景已启用', null, { timeout: 4000 }).catch(async error => {
    throw new Error(JSON.stringify(await page.evaluate(() => ({ status: fixture.registry.status, current: fixture.registry.current,
      motionError: fixture.registry.binding?.motionError, motionEvents: fixture.skinShortcut.motionEvents }))), { cause: error });
  });
  const importedCross = await page.evaluate(() => fixture.registry.current);
  assert.match(importedCross.name, /第二形态$/);
  assert.ok(remoteRequests.some(url => url.endsWith('/big/static/shortcut-second.png')));
  await selectedShortcut.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'yjcm-skin-background.png') });
  await importedDialog.getByRole('button', { name: '关闭' }).click();
  assert.ok(await page.evaluate(() => {
    const bg = fixture.native.bg, viewport = fixture.native.scrollRect ?? { width: cAt.gameWidth, height: cAt.gameHeight };
    return bg.width * bg.scale >= viewport.width - 1 && bg.height * bg.scale >= viewport.height - 1;
  }), 'static fallback covers the viewport without stretching');
  const firstFrame = await page.evaluate(() => fixture.native.getChildByName('sgs-background-motion').getChildByName('fixture-idle').frames);
  await page.waitForFunction(previous => fixture.native.getChildByName('sgs-background-motion').getChildByName('fixture-idle').frames > previous, firstFrame);
  assert.equal(await page.evaluate(() => fixture.native.bg.visible), false, 'a transparent idle does not reveal the still');
  await page.evaluate(() => { fixture.previousMotion = fixture.native.getChildByName('sgs-background-motion'); });
  await page.evaluate(() => fixture.scene.SetWallPaperByUrl('res/skill.png'));
  assert.equal(await page.evaluate(() => fixture.skinShortcut.motionEvents.at(-1)[1]), false);
  assert.equal(await page.evaluate(() => fixture.native.bg.visible), true, 'skills restore the native picture layer');
  await page.evaluate(() => fixture.scene.OnNormalWallPaperChange());
  await page.waitForFunction(() => fixture.skinShortcut.motionEvents.at(-1)[1] === true);

  importedDialog = await selectSkin('mobile');
  await page.waitForFunction(() => fixture.skinShortcut.landscapePending());
  assert.equal(await shortcut.count(), 0, 'the portrait preview alone cannot enable the action');
  await importedDialog.getByRole('button', { name: '第三形态' }).click();
  await page.evaluate(() => fixture.skinShortcut.finishLandscape());
  await importedDialog.getByRole('img', { name: '狂志吞天预览' }).waitFor();
  assert.equal(await shortcut.count(), 0, 'mobile portrait-only form has no background action');
  assert.equal(await page.evaluate(() => fixture.registry.current.localImageId), importedCross.localImageId);
  await importedDialog.getByRole('button', { name: '第一形态' }).click();
  await page.waitForFunction(() => fixture.skinShortcut.landscapePending());
  await page.evaluate(() => fixture.skinShortcut.finishLandscape());
  await shortcut.click();
  await selectedShortcut.waitFor();
  await page.waitForFunction(() => fixture.registry.status === '静态牌局背景已启用');
  assert.match(await page.evaluate(() => fixture.registry.current.name), /#1$/);
  assert.ok(await page.evaluate(() => fixture.previousMotion.destroyed && fixture.native.bg.visible));
  await importedDialog.getByRole('button', { name: '第二形态' }).click();
  await shortcut.click();
  await selectedShortcut.waitFor();
  await page.waitForFunction(() => fixture.registry.status === '动态牌局背景已启用');
  assert.match(await page.evaluate(() => fixture.registry.current.name), /#1#2$/);
  assert.equal(await page.evaluate(() => fixture.native.bg.visible), false);
  assert.equal(await readSaved(importedCross.localImageId), false);
  await importedDialog.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '静态', exact: true }).click();
  await page.waitForFunction(() => fixture.registry.status === '静态牌局背景已启用');
  const importedMobile = await page.evaluate(() => fixture.registry.current);
  assert.equal(importedMobile.animated, false);
  assert.equal(await page.evaluate(() => fixture.native.bg.visible), true);
  await page.getByRole('button', { name: '动态', exact: true }).click();
  await page.waitForFunction(() => fixture.registry.status === '动态牌局背景已启用');
  assert.equal(await page.evaluate(() => fixture.registry.current.localImageId), importedMobile.localImageId);
  await page.getByRole('button', { name: '静态', exact: true }).click();

  for (const [width, offset] of [[248, 2], [280, 0], [420, -1], [420, -2]]) {
    await page.setViewportSize({ width, height: 370 });
    importedDialog = await selectSkin('mobile', offset);
    await page.waitForFunction(() => fixture.skinShortcut.landscapePending());
    await page.evaluate(() => fixture.skinShortcut.finishLandscape());
    await shortcut.scrollIntoViewIfNeeded();
    if (width === 248) await page.screenshot({ path: path.join(out, 'mobile-skin-background-248.png') });
    const geometry = await shortcut.evaluate(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      const body = button.closest('.body');
      return { lines: range.getClientRects().length, action: button.getBoundingClientRect().toJSON(),
        body: body.getBoundingClientRect().toJSON(), overflow: body.scrollWidth - body.clientWidth };
    });
    const { lines, action, body, overflow } = geometry;
    assert.ok(lines === 1 && action.height >= 36 && action.right < width && action.top >= body.top - 1 &&
      action.bottom <= body.bottom + 1 && overflow <= 1, JSON.stringify(geometry));
    await importedDialog.getByRole('button', { name: '关闭' }).click();
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await mount();
  await page.waitForFunction(() => fixture.registry.status === '静态牌局背景已启用');
  assert.deepEqual(await page.evaluate(() => fixture.registry.current), importedMobile);
  await page.getByRole('button',{name:'恢复游戏背景'}).click();
  assert.equal(await readSaved(importedMobile.localImageId), false);

  if (process.env.SGS_BACKGROUND_OFFICIAL_REPLAY === '1') {
    const sources = new Map([
      ['8123801', { folder: 'ren-wan', still: '6123801', name: '春宵彩翼' }],
      ['8110801', { folder: 'official-yjcm', still: '6110801', name: '玉妃琼华' }],
    ]);
    await page.route('https://backgrounds.fixture/official/*.png', route => {
      const id = path.basename(new URL(route.request().url()).pathname, '.png');
      const asset = sources.get(id);
      return route.fulfill({ path: `test-results/backgrounds/${asset.folder}/maxBig-${asset.still}.png`, contentType: 'image/png' });
    });
    await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/general/big/dynamic/*/*', route => {
      const [id, file] = new URL(route.request().url()).pathname.split('/').slice(-2);
      const asset = sources.get(id);
      if (!asset || !/^[\w-]+\.(?:skel|atlas|png)$/.test(file)) return route.abort();
      return route.fulfill({ path: `test-results/backgrounds/${asset.folder}/${file}`,
        contentType: file.endsWith('.png') ? 'image/png' : 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' } });
    });
    for (const script of ['laya.ani.min.js', 'spine-core-4.0.min.js', 'laya.spine.min.js']) {
      await page.addScriptTag({ path: `C:/Users/Admin/AppData/Local/Temp/sgsres/game/${script}` });
    }
    await page.evaluate(() => {
      fixture.settings.set('animated', true);
      fixture.detail.visible = false;
      fixture.special.visible = false;
      document.querySelector('#panel').style.visibility = 'hidden';
      fixture.scope.add(fixture.registry.registerSkinMotion((resource, signal) =>
        Check.loadYjcmBackgroundMotion(window, { resource, files: ['daiji.skel'] }, signal)));
    });
    for (const id of ['8123801', '8110801', '8123801', '8110801']) {
      const name = sources.get(id).name;
      await page.evaluate(async ({ id, name }) => {
        fixture.previousMotion = fixture.native.getChildByName('sgs-background-motion');
        const blob = await (await fetch(`/official/${id}.png`)).blob();
        await fixture.registry.selectLocal('backgrounds', new File([blob], name), { skinKey: id, skinMotion: true, animated: true });
      }, { id, name });
      await page.waitForFunction(name => fixture.registry.current?.name === name && fixture.registry.status === '动态牌局背景已启用', name);
      const visible = await page.evaluate(() => {
        const motion = fixture.native.getChildByName('sgs-background-motion');
        const group = motion.getChildAt(0);
        const tracks = Array.from({ length: group.numChildren }, (_, i) => group.getChildAt(i).state.getCurrent(0));
        return { previousReleased: !fixture.previousMotion || fixture.previousMotion.destroyed, stillHidden: !fixture.native.bg.visible,
          scale: group.scaleX, height: motion.height, tracks: tracks.map(track => [track.animation.name, track.loop]) };
      });
      assert.equal(visible.previousReleased, true);
      assert.equal(visible.stillHidden, true);
      assert.deepEqual(visible.tracks, [['play', true], ['play', true]]);
      if (id === '8110801') assert.ok(Math.abs(visible.scale - visible.height / 654.5) < .025, 'frame to the painted plate, excluding effects');
      await page.screenshot({ path: path.join(out, `${id}-after-switch.png`) });
    }
    await page.locator('#panel').evaluate(node => { node.style.visibility = ''; });
    await page.getByRole('button', { name: '恢复游戏背景' }).click();
    assert.equal(await page.evaluate(() => fixture.native.bg.visible), true);
  }

  await page.evaluate(()=>fixture.dispose());
  assert.equal(await page.locator('.bg-skin-action').count(),0);
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-edge-fill')),null);
  assert.deepEqual(errors,[]); console.log('背景浏览器演练通过：一将成名和移动版横版原画铺满、竖版不显示入口、待机循环、技能让行、动静切换、刷新保留及原有背景回归。');
} finally { await browser.close(); }
