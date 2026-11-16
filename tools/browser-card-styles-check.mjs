import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const clientPath = process.env.SGS_CLIENT_SOURCE || path.join(process.env.TEMP, 'sgs-client/game/sgsGame_a.sgs');
const source = await readFile(clientPath,'utf8');
const start = source.indexOf('class qqi extends '), end = source.indexOf('class Qqi extends ',start);
assert(start >= 0 && end > start, 'Native NormalCardUi evidence is missing');
const native = source.slice(start,end);
const method = native.slice(native.indexOf('SetCardFace(t){'),native.indexOf('getCardFaceBaseTexture(t){'));
assert(method.startsWith('SetCardFace(t){') && method.includes('this.theCard.IsEmpty'));
const bundle = await build({stdin:{contents:`export { CardStyleRegistry } from './src/core/card-styles.js'; export { ResourceScope } from './src/core/resources.js'; export { Settings } from './src/core/storage.js'; export { createShell } from './src/ui/shell.js'; export { ThemeRegistry, BLACK_GOLD } from './src/core/themes.js'; export { default as gold } from './src/plugins/gold-cards/index.js'; export { default as nativeCards } from './src/plugins/native-cards/index.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'CardCheck'});
await mkdir('test-results',{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1000,height:780}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#26332d"></body>'}));
  await page.goto('http://localhost/');
  await page.addScriptTag({path:process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(method=>{
    Laya.init(1000,780); Laya.stage.bgColor='#26332d';
    const {CardStyleRegistry,ResourceScope,Settings,createShell,ThemeRegistry}=CardCheck;
    const scope=new ResourceScope(),settings=new Settings(localStorage,'card-check:');
    const nativeTexture=(color)=>{const canvas=document.createElement('canvas');canvas.width=93;canvas.height=130;const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,93,130);const bitmap=new Laya.Texture2D(93,130);bitmap.loadImageSource(canvas);return new Laya.Texture(bitmap);};
    const originals={face:nativeTexture('#e4dcc8'),back:nativeTexture('#708c8c')};
    window.JH={I:()=>({GetBarDataById:()=>null})};window.vCt={Bottom_CardFace:0};window.ZK={I:()=>({GetCardFaceVOByIdAndType:()=>true})};window.Ki={BACK:1};window.xk={NORMAL_SIZE:{width:93,height:130}};
    window.wKi={GetEmptyTextrue:()=>null};window.mNt={GetRes:name=>name.startsWith('cardBack_')?originals.back:originals.face};
    const Native= new Function('return class Native {'+method+'}')();
    const cards=[];
    function addCard(empty,x){
      const ui={isNewCardUI:true,theCard:{IsEmpty:empty,ResName:'sha'},bmpFace:new Laya.Sprite(),SetCardFace:Native.prototype.SetCardFace,getCardFaceBaseTexture:()=>originals.face,updateNewCardFace(){},measure(){}};
      ui.bmpFace.pos(x,260);Laya.stage.addChild(ui.bmpFace);ui.SetCardFace(null);cards.push(ui);
      if(!empty){const label=new Laya.Text();label.text='A ♥\n\n杀';label.color='#7e261d';label.fontSize=20;label.pos(x+8,268);Laya.stage.addChild(label);}
      return ui;
    }
    addCard(false,60);addCard(true,170);
    const hand={cardUis:cards,createNormalCardUi(card){return addCard(card.IsEmpty,390);}},self={cardContainer:hand};
    const registry=new CardStyleRegistry({window,document,game:{getSelfSeatUI:()=>self},settings,scope});
    let releases=[]; const enable=()=>CardCheck.gold.activate({cardStyles:{register:s=>{const off=registry.register(s,'gold-cards');releases.push(off);return off;}}});
    enable();
    const officialFixtures = { cardFace_0: originals.face, cardBack_0: originals.back,
      cardFace_10: nativeTexture('#f9d26e'), cardBack_5: nativeTexture('#705322') };
    for (const [key,texture] of Object.entries(officialFixtures)) Laya.Loader.cacheTexture('/fixture-atlas/'+key+'.png',texture);
    CardCheck.nativeCards.activate({cardStyles:{register:s=>scope.add(registry.register(s,'native-cards'))}});
    const shell=createShell({window,document,scope,settings});const themes=new ThemeRegistry(settings,t=>shell.applyTheme(t));
    shell.setHandlers({cardStyles:registry,themes,manager:{list:()=>[]},market:()=>null});
    window.check={hand,scope,settings,registry,cards,originals,officialFixtures,shell,themes,enable,disable:()=>{releases.forEach(f=>f());releases=[];},addCard};
  },method);
  const host=page.locator('[data-sgs-toolbox="core"]');
  await host.locator('[data-category="manage"]').click();await host.getByRole('button',{name:'外观',exact:true}).click();
  await host.locator('.card-style-workshop .plugin-toggle').click();for (const side of ['face','back']) await host.locator('[data-card-style="gold-cards.classic"][data-card-side="'+side+'"]').click();
  const result=await page.evaluate(()=>{
    const c=check,r=c.registry,id='gold-cards.classic',assert=(yes,msg)=>{if(!yes)throw Error(msg);};
    const goldFace=c.cards[0].bmpFace.texture,goldBack=c.cards[1].bmpFace.texture;
    assert(goldFace!==c.originals.face&&goldBack!==c.originals.back,'native texture not replaced');
    c.cards[0].SetCardFace(null);assert(c.cards[0].bmpFace.texture===goldFace,'native refresh lost styling');
    c.cards[1].theCard.IsEmpty=false;c.cards[1].SetCardFace(null);assert(c.cards[1].bmpFace.texture===goldFace,'pool face transition failed');
    c.cards[1].theCard.IsEmpty=true;c.cards[1].SetCardFace(null);
    c.cards[0].isPokerCardFace=true;r.refreshNative();assert(c.cards[0].bmpFace.texture===c.originals.face,'poker exclusion failed');c.cards[0].isPokerCardFace=false;r.refreshNative();
    c.disable();assert(c.cards[0].bmpFace.texture===c.originals.face&&c.cards[1].bmpFace.texture===c.originals.back,'disable restore failed');assert(!Object.hasOwn(c.cards[0],'_cardStyle'),'unexpected state');
    c.enable();assert(c.cards[0].bmpFace.texture!==c.originals.face,'reenable selection failed');
    r.select('');assert(c.cards[0].bmpFace.texture===c.originals.face,'default restore failed');r.select(id);
    const extra=c.addCard(true,280);r.refreshNative();assert(extra.bmpFace.texture!==c.originals.back,'new card not styled');
    const external=c.originals.face;extra.bmpFace.texture=external;c.disable();assert(extra.bmpFace.texture===external,'clobbered subsequent write');c.enable();
    for(let i=0;i<5;i++){c.disable();c.enable();}assert(r.bindings.size===3,'leaked bindings');
    return {nativeCards:r.bindings.size,status:r.status};
  });
  for (const side of ['face','back']) await host.locator('[data-card-style="native-cards.general"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{
    const {registry:r,cards,officialFixtures:f}=check;
    if(cards[0].bmpFace.texture!==f.cardFace_10 || cards[1].bmpFace.texture!==f.cardBack_5) throw Error('official general pair mismatch');
    cards[0].SetCardFace(null);if(cards[0].bmpFace.texture!==f.cardFace_10)throw Error('native refresh lost official face');
  });
  for (const side of ['face','back']) await host.locator('[data-card-style="native-cards.classic"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{const {cards,officialFixtures:f}=check;if(cards[0].bmpFace.texture!==f.cardFace_0||cards[1].bmpFace.texture!==f.cardBack_0)throw Error('official classic pair mismatch');});
  assert.equal(await host.locator('[data-card-style^="native-cards."] canvas').count(),4);
  for (const side of ['face','back']) await host.locator('[data-card-style="native-cards.general"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{
    const first=check.hand.createNormalCardUi({IsEmpty:false});
    if(first.bmpFace.texture!==check.officialFixtures.cardFace_10)throw Error('new native card flashes original before factory returns');
    first.theCard.IsEmpty=true;first.SetCardFace(null);
    if(first.bmpFace.texture!==check.officialFixtures.cardBack_5)throw Error('immediate face/back refresh failed');
    // No waiting for the 400ms interval, no refreshNative call here.
  });
  for(const width of [248,280,420]) for(const light of [false,true]) {
    await page.evaluate(({width,light})=>{check.shell.host.style.width=width+'px';check.shell.applyTheme({...CardCheck.BLACK_GOLD.tokens,...(light?{bg:'#f6f0e4',surface:'#fffaf0',raised:'#ebe2cf',text:'#312a20',muted:'#746957',accent:'#826121',border:'#c7b89b',scheme:'light'}:{})});check.shell.host.shadowRoot.querySelector('.card-style-workshop').scrollIntoView({block:'center'});},{width,light});
    await page.waitForTimeout(300);
    await page.screenshot({path:`test-results/card-styles-${width}-${light?'light':'dark'}.png`});
    assert.equal(await page.evaluate(()=>{const n=check.shell.host.shadowRoot.querySelector('.content');return n.scrollWidth>n.clientWidth;}),false,'horizontal overflow');
    await page.evaluate(()=>{const n=check.shell.host.shadowRoot.querySelector('.content');n.scrollTop=n.scrollHeight;});
    assert(await page.evaluate(()=>{const s=check.shell.host.shadowRoot,c=s.querySelector('.content').getBoundingClientRect(),t=s.querySelector('.management-tabs').getBoundingClientRect();return t.top>=c.top-1&&t.bottom<c.bottom;}),'management tabs not sticky');
  }
  await host.locator('.management-tabs').getByRole('button',{name:'插件市场',exact:true}).click();await host.locator('.management-tabs').getByRole('button',{name:'外观',exact:true}).click();
  assert.equal(await host.locator('.card-style-workshop .plugin-toggle').getAttribute('aria-expanded'),'true');
  await host.locator('.content').evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({path:'test-results/card-style-heading-expanded.png'});
  await host.locator('.card-style-workshop .plugin-toggle').focus();await page.keyboard.press('Enter');await page.waitForTimeout(50);assert.equal(await host.locator('.card-style-workshop .plugin-toggle').getAttribute('aria-expanded'),'false');
  await host.getByRole('button', {name:'收起主题工坊',exact:true}).click();
  for (const width of [248,280,420]) {
    await host.evaluate((node,width)=>{node.style.width=width+'px';},width);
    const rows=await host.locator('.appearance-page .plugin-toggle').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));
    assert(rows.every(row=>row.height===36)); assert.equal(rows[1].top-rows[0].bottom,21);
    const metrics=await host.locator('.appearance-page .plugin-toggle').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return [s.minHeight,s.padding,s.gap];}));
    assert(metrics.every(m=>JSON.stringify(m)===JSON.stringify(['36px','6px 3px','9px'])));
    await page.screenshot({path:'test-results/appearance-spacing-'+width+'.png'});
  }
  await page.screenshot({path:'test-results/card-style-heading-collapsed.png'});
  await page.evaluate(()=>{check.scope.dispose();if(check.cards[0].bmpFace.texture!==check.originals.face)throw Error('core disposal restore failed');if(Object.values(check.officialFixtures).some(t=>t.destroyed||t.bitmap.destroyed))throw Error('destroyed borrowed official texture');});
  assert.deepEqual(errors,[]);
  const evidence={...result,officialSourceSha256:createHash('sha256').update(source).digest('hex'),checks:'native SetCardFace replay with official Laya; synchronous new-card creation without timer, face/back, pool transition, poker exclusion, restore, reenable, new cards, cleanup, 248/280/420 dark/light, sticky tabs, keyboard collapse',limitations:'Controlled native-method replay; native resource cache uses colored fixture textures, not official artwork or a logged-in game.'};
  await writeFile('test-results/card-styles-check.json',JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await browser.close();}
