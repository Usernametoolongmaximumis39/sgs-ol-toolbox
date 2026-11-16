import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import path from 'node:path';

const out = path.resolve('test-results/backgrounds'); await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export { mountPluginUI } from './src/ui/plugin-ui.js'; export { BackgroundRegistry } from './src/core/backgrounds.js'; export { ResourceScope } from './src/core/resources.js'; export { activate } from './src/plugins/backgrounds/index.js'; export { createSkinDownload } from './src/plugins/skins/download.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'Check' });
const source = await readFile('C:/Users/Admin/AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs', 'utf8');
const extract = name => { const a = source.indexOf(`class ${name} extends`); assert.ok(a >= 0); return source.slice(a, source.indexOf('class ', a + 10)); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body style="margin:0;background:#191a18"><div id="panel" style="position:fixed;right:12px;top:420px;padding:14px;box-sizing:border-box;background:#24241f;z-index:10"></div></body>');
  await page.addScriptTag({ path: 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    Laya.init(1200, 850); Laya.stage.bgColor = '#151915';
    window.UZt = class extends Laya.Sprite { constructor() { super(); Laya.stage.addChild(this); } onGameResize() {} };
    window.gO = class extends Laya.Sprite { addDrawChild(c) { return this.addChild(c); } };
    window.p$t = class extends Laya.Sprite {
      set skin(url) { this.url = url; this.graphics.clear(); this.graphics.drawRect(0, 0, 800, 1200, url?.includes('skin') ? '#394b49' : '#473b2d'); this.graphics.drawCircle(400,600,180,'#ae9760'); this.graphics.drawRect(0,0,800,22,'#ffb858');this.graphics.drawRect(0,1178,800,22,'#85cde0'); this.graphics.drawLine(400,0,400,1200,'#e5dac0',3); }
      set scale(value) { this.scaleX=value;this.scaleY=value; }
      get scale() { return this.scaleX; }
      get skin() { return this.url; }
      posInteger(x,y) { this.pos(x,y); }
    };
    window.ti = { backgroundLayer: 0 }; window.hi = { Lv1: 1 };
    window.cAt = { gameWidth: 1200, gameHeight: 850, gameScale: 1 };
    window.SystemContext = window.cAt; window.V2t = { IsInGame: false }; window.dqt = { CARDUI_CONTAINER_HEIGHT: 100 };
    window.ue = { I: () => ({ event() {} }) };
    // Synthetic resource players with the actual native background factories.
    // Artwork/animation data are fixture-owned; no official session is started.
    window.E$t = window.uO = class extends Laya.Sprite {
      InitEffect(url, animation) { this.url=url;this.animation=animation;this.graphics.clear();this.graphics.drawRect(-297,-167.5,594,335,'#283d42');this.graphics.drawCircle(0,0,75,url.includes('beijing')?'#678e8a':'#dbba70'); }
      playEffect() { this.running=true;Laya.timer.loop(30,this,this.animate);Laya.timer.once(10,this,()=>this.event(Laya.Event.START,this)); }
      animate() { this.rotation=(this.rotation+.2)%3; }
      stop() { this.running=false;Laya.timer.clear(this,this.animate); }
      destroy(...args) { Laya.timer.clearAll(this);super.destroy(...args); }
    };
  });
  await page.addScriptTag({ content: `window.NativeBackground = (${extract('_qt')});` });
  await page.evaluate(()=>new Promise(resolve=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;
    const c=canvas.getContext('2d');const gradient=c.createLinearGradient(0,0,800,1200);gradient.addColorStop(0,'#7d9f9b');gradient.addColorStop(1,'#765739');c.fillStyle=gradient;c.fillRect(0,0,800,1200);c.fillStyle='#ae9760';c.beginPath();c.arc(400,600,180,0,Math.PI*2);c.fill();
    Laya.loader.load(canvas.toDataURL(),Laya.Handler.create(null,t=>{window.edgeTexture=t;resolve();}),null,Laya.Loader.IMAGE);
  }));
  await page.evaluate(() => {
    const scope = new Check.ResourceScope(), pluginScope = new Check.ResourceScope(), values = new Map();
    const native = new NativeBackground();
    const special = new Laya.Sprite(); special.name = '裴秀地图交互'; special.size(130,70); special.pos(500,260); special.graphics.drawRect(0,0,130,70,'#947b48'); special.mouseEnabled=true; let clicks=0; special.on('click',special,()=>clicks++); native.addChild(special);
    const scene = { currentWeatherWallPaper: 0,
      SetWallPaperById() { native.O('res/personal.png'); },
      SetWallPaperByUrl(url) { native.O(url); },
      OnNormalWallPaperChange() { this.SetWallPaperById(); },
      onWallPaperChange() { if (this.currentWeatherWallPaper) native.effectPath='weather'; else this.OnNormalWallPaperChange(); },
    };
    const registry = new Check.BackgroundRegistry({ window: { document, SystemContext, Laya: { ...Laya, stage: Laya.stage, loader: { load(url, handler) { handler.runWith(edgeTexture); } } } }, scope,
      settings: { get: (k,d) => values.has(k)?values.get(k):d, set: (k,v) => values.set(k,v) }, game: { getScene:()=>scene,isInGame:()=>true } });
    const detail = new Laya.Sprite(); detail.showMaxSkinWindow=()=>{}; detail.updateSkinInfo=()=>{}; detail.Close=function(){this.startAnimateOut();};detail.startAnimateOut=()=>{};detail.enterWindow=function(){this.visible=true;};
    detail.skinData={skinBaseVo:{skinname:'山水之间 · 演练皮肤',skinID:123,SkinBigUrl:()=> 'res/skin.png'}};
    detail.isHor=true; detail.skinImg=new Laya.Sprite(); detail.skinImg.skin="res/skin.png"; Object.defineProperty(detail.skinImg,"texture",{value:{width:1600,height:900},writable:true}); detail.skinImg.size(650,280); detail.skinImg.pos(90,65); detail.skinImg.graphics.drawRect(0,0,650,280,'#36483d'); detail.addChild(detail.skinImg); Laya.stage.addChild(detail);
    const label=new Laya.Text();label.text='皮肤详情 · Laya 原生坐标演练';label.color='#e6d5a5';label.fontSize=24;label.pos(120,150);detail.addChild(label);
    let panelCleanup, themeWatch;
    const panelHost=document.querySelector('#panel'); const shadow=panelHost.attachShadow({mode:'open'}); const panelContent=document.createElement('div');shadow.append(panelContent);
    const settings={get:(k,d)=>values.has('plugin.'+k)?values.get('plugin.'+k):d,set:(k,v)=>values.set('plugin.'+k,v)};
    const ctx={window,document,scope:pluginScope,settings,notify:()=>{},backgrounds:{register:()=>pluginScope.add(registry.register('backgrounds')),select:spec=>registry.select('backgrounds',spec),subscribe:fn=>registry.subscribe(fn),get current(){return registry.current;},get status(){return registry.status;}},
      ui:{nativeTheme:{watch(fn){themeWatch=fn;fn({text:'#eee3cc',muted:'#b7aa8c',accent:'#dbba70',border:'#665b42',surface:'#2c2922'});}},registerPanel(spec){panelCleanup=spec.render(panelContent);}}};
    Object.assign(ctx.ui, Check.mountPluginUI(ctx, () => ctx));
    Check.activate(ctx); Check.createSkinDownload(ctx);
    window.fixture={scope,pluginScope,registry,native,scene,special,detail,settings,getClicks:()=>clicks,themeWatch,dispose:()=>{panelCleanup();pluginScope.dispose();scope.dispose();}};
    document.querySelector('#panel').style.cssText+=';--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-surface:#2c2922';
  });
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
  await page.evaluate(()=>{SystemContext.gameWidth=1000;SystemContext.gameHeight=700;Laya.stage.size(2000,1400);fixture.native.updateBgSize();});
  assert.deepEqual(await page.evaluate(()=>[fixture.native.bg.scaleX,fixture.native.bg.scaleY,fixture.native.bg.x,fixture.native.bg.y]),[700/1200,700/1200,(1000-800*(700/1200))/2,0]);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=123;fixture.native.updateBgSize();});
  assert.equal(await page.evaluate(()=>fixture.native.bg.width),1600,'weather keeps native layout');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-edge-fill').visible),false);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=0;SystemContext.gameWidth=1200;SystemContext.gameHeight=850;Laya.stage.size(1200,850);fixture.native.updateBgSize();});
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
  await page.screenshot({path:path.join(out,'dynamic-playing.png')});
  await page.getByRole('button',{name:'静态',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion')),null);
  assert.equal(await page.evaluate(()=>fixture.settings.get('animated')),false);
  await page.getByRole('button',{name:'动态',exact:true}).click();
  await page.waitForFunction(()=>fixture.registry.status==='动态牌局背景已启用');
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=1;fixture.native.updateBgSize();fixture.registry.refresh();});
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').visible),false);
  await page.evaluate(()=>{fixture.scene.currentWeatherWallPaper=0;fixture.native.updateBgSize();fixture.registry.refresh();});
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-motion').visible),true);
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
  await page.evaluate(()=>fixture.dispose());
  assert.equal(await page.locator('.bg-skin-action').count(),0);
  assert.equal(await page.evaluate(()=>fixture.native.getChildByName('sgs-background-edge-fill')),null);
  assert.deepEqual(errors,[]); console.log('背景浏览器演练通过：未拥有动态、默认动态、键盘动静切换、天气与技能让行、原生工厂、裴秀式交互子层、三种宽度、浅色长标题、恢复与清理。');
} finally { await browser.close(); }
