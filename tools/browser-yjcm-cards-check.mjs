import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const source = await readFile(process.env.SGS_CLIENT_SOURCE || 'C:/Users/Admin/AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs','utf8');
const start=source.indexOf('class qqi extends '), end=source.indexOf('class Qqi extends ',start), native=source.slice(start,end);
const methods=native.slice(native.indexOf('SetCardFace(t){'),native.indexOf('UpdateCardFaceRes('));
const faceStart=source.indexOf('class fO extends'),faceSetterStart=source.indexOf('set texture(t){',faceStart);
const faceSetter=source.slice(faceSetterStart,source.indexOf('SetNativeSize(',faceSetterStart));
assert(methods.includes('updateNewCardFace(t=null)'));
const bundle=await build({stdin:{contents:`export { CardStyleRegistry } from './src/core/card-styles.js'; export { ResourceScope } from './src/core/resources.js'; export { Settings } from './src/core/storage.js'; export { createShell } from './src/ui/shell.js'; export { ThemeRegistry, BLACK_GOLD } from './src/core/themes.js'; export { default as plugin } from './src/plugins/yjcm-cards/index.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'YjcmCheck'});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1120,height:860}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
let corrupt=false, delayed=false;
try {
  await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#29352e"></body>'}));
  await page.route('https://web.sanguosha.com/x/pc/res/assets/cards/normal/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);requests.push(name);
    if(delayed) await new Promise(resolve=>setTimeout(resolve,250));
    await route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:name.endsWith('.png')?'image/png':'application/octet-stream',body:corrupt?'corrupt':await readFile(new URL('../test-results/yjcm-resources/'+name,import.meta.url))});
  });
  await page.goto('http://localhost/');
  await page.addScriptTag({path:process.env.SGS_LAYA_CORE || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(methods=>{
    Laya.init(1120,860);Laya.stage.bgColor='#29352e';
    const {CardStyleRegistry,ResourceScope,Settings,createShell,ThemeRegistry}=YjcmCheck;
    const scope=new ResourceScope(),settings=new Settings(localStorage,'yjcm-test:');
    const canvas=document.createElement('canvas');canvas.width=93;canvas.height=130;const c=canvas.getContext('2d');c.fillStyle='#ddd0b0';c.fillRect(0,0,93,130);
    const bitmap=new Laya.Texture2D(93,130);bitmap.loadImageSource(canvas);const original=new Laya.Texture(bitmap);
    window.JH={I:()=>({GetBarDataById:()=>null})};window.vCt={Bottom_CardFace:0};window.ZK={I:()=>({GetCardFaceVOByIdAndType:()=>true})};window.Ki={BACK:1,FACE:2};window.xk={NORMAL_SIZE:{width:93,height:130}};window.xmt={BASIC:1,JINNANG:2,EQUIP:3};window.qqi={SMALL_DESC_PREFIX:'small_desc'};
    window.wKi={GetEmptyTextrue:()=>null};window.mNt={GetRes:name=>/^card|_png$/.test(name)?original:null};
    const Native=new Function('return class Native {'+methods+'}')();
    const cards=[];
    function add(name,x,y=170){
      const ui={isNewCardUI:true,theCard:{IsEmpty:false,ResName:name,CardBaseType:1},measure(){},layout(){},
        SetCardFace:Native.prototype.SetCardFace,getCardFaceBaseTexture:Native.prototype.getCardFaceBaseTexture,updateNewCardFace:Native.prototype.updateNewCardFace};
      for(const key of ['bmpFace','bmpFace2','bmpName','bmpNameBg','bmpNormalName','bmpCardType','bmpSmallDesc','bmpFlower','bmpNumber']) ui[key]=new Laya.Sprite();
      ui.bmpFace.pos(x,y);Laya.stage.addChild(ui.bmpFace);ui.SetCardFace(null);cards.push(ui);
      const label=new Laya.Text();label.text=name;label.fontSize=13;label.color='#f5e9cd';label.pos(x,y+140);Laya.stage.addChild(label);
      return ui;
    }
    add('Sha',35);add('Shan',145);add('Tao',255);add('GuoZhanXianQu',365);add('Limited2026Unknown',475);add('Activity2026Unknown',585);
    const hand={cardUis:cards,virtualCardUis:[],createNormalCardUi(card){return add(card.ResName,35,380);},
      StartSelectCard(){const ui=this.createNormalCardUi({ResName:'HuoGong'});ui.theCard.IsVirtualCard=true;cards.splice(cards.indexOf(ui),1);this.virtualCardUis.push(ui);}},self={cardContainer:hand};
    const registry=new CardStyleRegistry({window,document,game:{getSelfSeatUI:()=>self},settings,scope});
    let releases=[];const enable=()=>YjcmCheck.plugin.activate({cardStyles:{register:s=>releases.push(registry.register(s,'yjcm-cards'))}});
    enable();const disable=()=>{for(const release of releases)release();releases=[];};
    const shell=createShell({window,document,scope,settings});const themes=new ThemeRegistry(settings,t=>shell.applyTheme(t));
    shell.setHandlers({cardStyles:registry,themes,manager:{list:()=>[]},market:()=>null});
    window.check={registry,original,cards,hand,scope,shell,enable,disable};
  },methods);
  const host=page.locator('[data-sgs-toolbox="core"]');
  await host.locator('[data-category="manage"]').click();await host.getByRole('button',{name:'外观',exact:true}).click();await host.locator('.card-style-workshop .plugin-toggle').click();
  assert.equal(requests.length,0,'install/open must not download');
  await page.waitForFunction(()=>[...check.shell.host.shadowRoot.querySelectorAll('[data-card-style^="yjcm-cards."] img')].filter(img=>img.complete&&img.naturalWidth===135&&img.naturalHeight===190).length===2);
  assert.equal(requests.length,0,'both previews must be available before any atlas download');
  await host.locator('[data-card-style="yjcm-cards.miao"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/yjcm-before-download.png'});
  assert.equal(await host.locator('[data-card-side="back"][data-card-style^="yjcm-cards."]').count(),0);
  await host.locator('[data-card-style="yjcm-cards.miao"]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>check.registry.atlases.get('yjcm-cards.miao')?.data);
  assert(!await host.locator('.card-style-workshop').textContent().then(text=>text.includes('小抄')));
  await page.evaluate(()=>{
    const {cards,registry:r,original}=check;
    for (const ui of cards.slice(0,4)) { ui.IsYiCard=true;ui.isSkillChangeStatus=true;ui.SetCardFace(null); }
    for(const ui of cards.slice(0,3))if(ui.bmpFace.texture===original)throw Error('exact full-card art missing: '+ui.theCard.ResName);
    if(cards[3].bmpFace.texture!==original)throw Error('identical Guozhan card must remain native');
    // Own-hand full-image mode differs from the popup's new-card composition.
    cards[0].isNewCardUI=false;cards[0].IsYiCard=false;cards[0].SetCardFace(null);
    if(cards[0].bmpFace.texture===original)throw Error('legacy own-hand art was excluded');
    cards[0].isNewCardUI=true;cards[0].SetCardFace(null);
    for(const ui of cards.slice(4))if(ui.bmpFace.texture!==original)throw Error('unknown special card did not fall back');
    cards[0].SetCardFace(null);if(cards[0].bmpFace.texture===original)throw Error('native refresh lost art');
    const extra=check.hand.createNormalCardUi({ResName:'Sha'});if(extra.bmpFace.texture===original)throw Error('factory flashed native art');
    extra.theCard.ResName='ActivityMissing';extra.SetCardFace(null);if(extra.bmpFace.texture!==original)throw Error('pooled UI kept previous card art');
    r.selectScope('self');const opponent={...cards[4],theCard:{ResName:'Sha',IsEmpty:false},bmpFace:{texture:original}};r.captureCard(opponent);if(opponent.bmpFace.texture!==original)throw Error('opponent styled in self scope');r.selectScope('all');
  });
  await page.evaluate(({faceSetter,methods})=>{
    const NativeFace=new Function('return class NativeFace {'+faceSetter+' get texture(){return this._texture;} AfterSetWH(){this.invalidateUpdateFlag=true;} update(){if(this.render){this.render.graphics.clear();this.command=this.render.graphics.drawTexture(this.texture,0,0,this._rWidth.value,this._rHeight.value);this.invalidateUpdateFlag=false;}} }')();
    const NativeCard=new Function('return class NativeCard {'+methods+'}')();
    const make=(width,height)=>{
      const face=new NativeFace();face._rWidth={value:0};face._rHeight={value:0};face.texture=check.original;
      face.render=new Laya.Sprite();
      return {width,height,isNewCardUI:false,theCard:{ResName:'Sha',IsEmpty:false},bmpFace:face,measure(){},
        SetCardFace:NativeCard.prototype.SetCardFace,getCardFaceBaseTexture:()=>check.original,updateNewCardFace(){}};
    };
    const hand=make(133,184),skill=make(126,174);check.registry.captureCard(hand);check.registry.captureCard(skill);
    const art=hand.bmpFace.texture;
    if(hand.bmpFace.command.width!==133||hand.bmpFace.command.height!==184)throw Error('fresh native graphics command shrank art');
    // The inquiry path writes a native face and recreates draw commands,
    // rather than entering SetCardFace. No timer or registry refresh allowed.
    for(let i=0;i<3;i++){
      hand.bmpFace.render.graphics.clear();hand.bmpFace.texture=check.original;
      if(hand.bmpFace.texture!==art||hand.bmpFace.command.width!==133||hand.bmpFace.command.height!==184)throw Error('direct native write flashed/shrank art during inquiry');
    }
    for(let i=0;i<4;i++){hand.SetCardFace(null);hand.updateNewCardFace();if(hand.bmpFace._rWidth.value!==133||hand.bmpFace._rHeight.value!==184)throw Error('native setter shrank hand after skill refresh');}
    if(skill.bmpFace.texture.width!==126||skill.bmpFace.texture.height!==174)throw Error('skill and hand texture sizes interfered');
    hand.width=169;hand.height=224;hand.SetCardFace(null);
    if(hand.bmpFace._rWidth.value!==169||hand.bmpFace._rHeight.value!==224)throw Error('native size change ignored');
  },{faceSetter,methods});
  await page.evaluate(methods=>{
    check.hand.StartSelectCard();const virtual=check.hand.virtualCardUis[0];
    if(virtual.bmpFace.texture===check.original)throw Error('skill virtual selection failed before return');
    const Native=new Function('return class Native {'+methods+'}')();
    const ui={isNewCardUI:true,theCard:{IsEmpty:false,IsVirtualCard:true,ResName:'Shan',CardBaseType:1},measure(){},layout(){},
      SetCardFace:Native.prototype.SetCardFace,getCardFaceBaseTexture:Native.prototype.getCardFaceBaseTexture,updateNewCardFace:Native.prototype.updateNewCardFace};
    for(const key of ['bmpFace','bmpFace2','bmpName','bmpNameBg','bmpNormalName','bmpCardType','bmpSmallDesc','bmpFlower','bmpNumber'])ui[key]=new Laya.Sprite();
    ui.SetCardFace(null);const shop=new Laya.Sprite();shop.cardUi=ui;shop.pos(480,380);shop.addChild(ui.bmpFace);
    Laya.stage.addChild(shop);
    if(ui.bmpFace.texture===check.original)throw Error('new shop card flashed native before addChild returned');
    for(let i=0;i<3;i++){check.registry.refreshNative();if(!check.registry.bindings.has(ui)||!check.registry.bindings.has(virtual))throw Error('shop or virtual cards lost hooks on discovery');}
    check.shop=shop;
  },methods);
  await host.locator('.card-style-workshop').getByRole('status').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/yjcm-self-hand-status.png'});
  for(const width of [248,280,420])for(const light of [false,true]){
    await page.evaluate(({width,light})=>{check.shell.host.style.width=width+'px';check.shell.applyTheme({...YjcmCheck.BLACK_GOLD.tokens,...(light?{bg:'#f6f0e4',surface:'#fffaf0',raised:'#ebe2cf',text:'#312a20',muted:'#746957',accent:'#826121',border:'#c7b89b',scheme:'light'}:{})});const s=check.shell.host.shadowRoot;s.querySelector('[data-card-style="yjcm-cards.miao"]').scrollIntoView({block:'center'});},{width,light});
    await page.waitForTimeout(220);
    await page.screenshot({path:`test-results/yjcm-${width}-${light?'light':'dark'}.png`});
    assert.equal(await page.evaluate(()=>{const c=check.shell.host.shadowRoot.querySelector('.content');return c.scrollWidth>c.clientWidth;}),false);
  }
  await host.locator('[data-card-style="yjcm-cards.zhuzhuxia"]').click();await page.waitForFunction(()=>check.registry.atlases.get('yjcm-cards.zhuzhuxia')?.data);
  assert(requests.includes('cardZhuZhuXia1.png'),'second sheet must load');
  await page.screenshot({path:'test-results/yjcm-zhuzhuxia.png'});
  await page.evaluate(()=>{check.disable();if(check.cards[0].bmpFace.texture!==check.original)throw Error('disable restore');check.enable();});
  await page.waitForFunction(()=>check.registry.atlases.get('yjcm-cards.zhuzhuxia')?.data);
  corrupt=true;
  await host.locator('[data-card-style="yjcm-cards.miao"]').click();await page.waitForFunction(()=>check.registry.atlases.get('yjcm-cards.miao')?.error);
  await page.evaluate(()=>{if(check.cards[0].bmpFace.texture!==check.original)throw Error('integrity error did not restore original');});
  await host.locator('.card-style-workshop').getByRole('status').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>{const c=check.shell.host.shadowRoot.querySelector('.content');return c.scrollWidth>c.clientWidth;}),false,'error detail overflow');
  await page.screenshot({path:'test-results/yjcm-load-error.png'});
  await host.getByRole('button',{name:'重新加载卡面'}).waitFor();corrupt=false;
  await host.getByRole('button',{name:'重新加载卡面'}).click();await page.waitForFunction(()=>check.registry.atlases.get('yjcm-cards.miao')?.data);
  delayed=true;
  await page.evaluate(()=>{check.registry.selectSide('face','yjcm-cards.zhuzhuxia');check.registry.selectSide('face','');});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{if(check.cards[0].bmpFace.texture!==check.original||check.registry.atlases.size)throw Error('late download revived selection');check.scope.dispose();});
  assert.deepEqual(errors,[]);
  await writeFile('test-results/yjcm-cards-check.json',JSON.stringify({requests,checks:'official downloaded atlases and original native SetCardFace/updateNewCardFace with official Laya; exact special card and unknown activity/limited fallback, immediate creation, reuse, self scope, disable/enable, hash failure, retry, cancellation; 248/280/420px dark/light',limitations:'Controlled native-method replay with real official artwork; no logged-in official match.'},null,2));
  console.log('YJCM card browser check passed');
}finally{await browser.close();}
