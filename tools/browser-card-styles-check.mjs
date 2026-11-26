import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { gzipSync, zipSync } from 'fflate';

const clientPath = process.env.SGS_CLIENT_SOURCE || path.join(process.env.TEMP, 'sgs-client/game/sgsGame_a.sgs');
const source = await readFile(clientPath,'utf8');
const start = source.indexOf('class qqi extends '), end = source.indexOf('class Qqi extends ',start);
assert(start >= 0 && end > start, 'Native NormalCardUi evidence is missing');
const native = source.slice(start,end);
const method = native.slice(native.indexOf('SetCardFace(t){'),native.indexOf('getCardFaceBaseTexture(t){'));
assert(method.startsWith('SetCardFace(t){') && method.includes('this.theCard.IsEmpty'));
const playcards = { abbreviation: [{ Short: 'a', Long: 'id' }, { Short: 'b', Long: 'name' }, { Short: 'p', Long: 'res' }],
  GamePlayCards: { card: [{ a: 1, b: '杀', p: 'Sha' }, { a: 2, b: '杀', p: 'HuoSha' }, { a: 3, b: '闪', p: 'Shan' }] } };
const configArchive = [...zipSync({ 'sys_playcard.sgs': gzipSync(Buffer.from(JSON.stringify(playcards))) })];
const bundle = await build({stdin:{contents:`export { CardStyleRegistry } from './src/core/card-styles.js'; export { createGameAdapter } from './src/core/game.js'; export { ResourceScope } from './src/core/resources.js'; export { Settings } from './src/core/storage.js'; export { createShell } from './src/ui/shell.js'; export { ThemeRegistry, BLACK_GOLD } from './src/core/themes.js'; export { registerGoldCardStyles } from './src/plugins/card-styles-extra/gold/index.js'; export { registerNativeCardStyles } from './src/plugins/card-styles-extra/native/index.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'CardCheck',define:{__SGS_TOOLBOX_DEVELOPMENT__:'true',__SGS_TOOLBOX_EDITION__:'"dev"'}});
await mkdir('test-results',{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1000,height:780},hasTouch:true}), errors=[];
page.on('pageerror',e=>errors.push(e.stack || e.message));
try {
  await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#26332d"></body>'}));
  const host=page.locator('[data-sgs-toolbox="core"]');
  async function mount(reload = false) {
  if (reload) await page.reload(); else await page.goto('http://localhost/');
  await page.addScriptTag({path:process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(({ method, playcards, configArchive })=>{
    Laya.init(1000,780); Laya.stage.bgColor='#26332d';
    const {CardStyleRegistry,ResourceScope,Settings,createShell,ThemeRegistry}=CardCheck;
    const scope=new ResourceScope(),settings=new Settings(localStorage,'card-check:');
    const nativeTexture=(color)=>{const canvas=document.createElement('canvas');canvas.width=93;canvas.height=130;const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,93,130);const bitmap=new Laya.Texture2D(93,130);bitmap.loadImageSource(canvas);return new Laya.Texture(bitmap);};
    const originals={face:nativeTexture('#e4dcc8'),back:nativeTexture('#708c8c')};
    window.JH={I:()=>({GetBarDataById:()=>null})};window.vCt={Bottom_CardFace:0};window.ZK={I:()=>({GetCardFaceVOByIdAndType:()=>true})};window.Ki={BACK:1};window.xk={NORMAL_SIZE:{width:93,height:130}};
    window.wKi={GetEmptyTextrue:()=>null};window.mNt={GetRes:name=>name.startsWith('cardBack_')?originals.back:originals.face};
    const Native= new Function('return class Native {'+method+'}')();
    const cards=[];
    function addCard(empty,x,res='Sha'){
      const ui={isNewCardUI:true,theCard:{IsEmpty:empty,ResName:res},bmpFace:new Laya.Sprite(),bmpFace2:{visible:!empty},bmpName:{visible:true},bmpFlower:{visible:true},bmpNumber:{visible:true},SetCardFace:Native.prototype.SetCardFace,getCardFaceBaseTexture:()=>originals.face,updateNewCardFace(){},measure(){}};
      ui.bmpFace.pos(x,260);Laya.stage.addChild(ui.bmpFace);ui.SetCardFace(null);cards.push(ui);
      if(!empty){const label=new Laya.Text();label.text=res==='Shan'?'7 ♣\n\n闪':'A ♥\n\n杀';label.color=res==='Shan'?'#242a2b':'#7e261d';label.fontSize=20;label.pos(x+8,268);Laya.stage.addChild(label);}
      return ui;
    }
    addCard(false,60);addCard(true,170);
    const hand={cardUis:cards,createNormalCardUi(card){return addCard(card.IsEmpty,390);}},self={cardContainer:hand};
    window.CtrUtil = { AllDatas: { 'sys_playcard.sgs': playcards }, Ctr: { Ofb_Dec: value => value } };
    const configLoads = [];
    const configWindow = { get Laya() { return window.Laya; }, get CtrUtil() { return window.CtrUtil; }, location: { origin: 'https://web.sanguosha.com' },
      resourceVersion: 'cards-fixture', fetch(url, options) {
        return new Promise((resolve, reject) => configLoads.push({
          url, credentials: options.credentials, reject,
          succeed: () => resolve(new Response(Uint8Array.from(configArchive))),
        }));
      } };
    const game = CardCheck.createGameAdapter(configWindow, scope);
    const registry=new CardStyleRegistry({window,document,game:{...game,getSelfSeatUI:()=>game.getSelfSeatUI() || self},settings,scope});
    let releases=[]; const enable=()=>CardCheck.registerGoldCardStyles({cardStyles:{register:s=>{const off=registry.register(s,'card-styles-extra');releases.push(off);return off;}}});
    enable();
    const officialFixtures = { cardFace_0: originals.face, cardBack_0: originals.back,
      cardFace_10: nativeTexture('#f9d26e'), cardBack_5: nativeTexture('#705322') };
    for (const [key,texture] of Object.entries(officialFixtures)) Laya.Loader.cacheTexture('/fixture-atlas/'+key+'.png',texture);
    CardCheck.registerNativeCardStyles({cardStyles:{register:s=>scope.add(registry.register(s,'card-styles-extra'))}});
    const shell=createShell({window,document,scope,settings});const themes=new ThemeRegistry(settings,t=>shell.applyTheme(t));
    shell.setHandlers({cardStyles:registry,themes,manager:{list:()=>[]},market:()=>null});
    window.check={hand,scope,settings,registry,cards,originals,officialFixtures,shell,themes,enable,disable:()=>{releases.forEach(f=>f());releases=[];},addCard,configLoads,Native};
  },{ method, playcards, configArchive });
  await host.locator('[data-category="manage"]').click();await host.getByRole('button',{name:'外观',exact:true}).click();
  const workshop = host.locator('.card-style-workshop .plugin-toggle');
  if (await workshop.getAttribute('aria-expanded') === 'false') await workshop.click();
  }
  await mount();
  for (const side of ['face','back']) await host.locator('[data-card-style="card-styles-extra.gold"][data-card-side="'+side+'"]').click();
  const result=await page.evaluate(()=>{
    const c=check,r=c.registry,id='card-styles-extra.gold',assert=(yes,msg)=>{if(!yes)throw Error(msg);};
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
  for (const side of ['face','back']) await host.locator('[data-card-style="card-styles-extra.native-general"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{
    const {registry:r,cards,officialFixtures:f}=check;
    if(cards[0].bmpFace.texture!==f.cardFace_10 || cards[1].bmpFace.texture!==f.cardBack_5) throw Error('official general pair mismatch');
    cards[0].SetCardFace(null);if(cards[0].bmpFace.texture!==f.cardFace_10)throw Error('native refresh lost official face');
  });
  for (const side of ['face','back']) await host.locator('[data-card-style="card-styles-extra.native-classic"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{const {cards,officialFixtures:f}=check;if(cards[0].bmpFace.texture!==f.cardFace_0||cards[1].bmpFace.texture!==f.cardBack_0)throw Error('official classic pair mismatch');});
  assert.equal(await host.locator('[data-card-style^="card-styles-extra.native-"] canvas').count(),4);
  for (const side of ['face','back']) await host.locator('[data-card-style="card-styles-extra.native-general"][data-card-side="'+side+'"]').click();
  await page.evaluate(()=>{
    const first=check.hand.createNormalCardUi({IsEmpty:false});
    if(first.bmpFace.texture!==check.officialFixtures.cardFace_10)throw Error('new native card flashes original before factory returns');
    first.theCard.IsEmpty=true;first.SetCardFace(null);
    if(first.bmpFace.texture!==check.officialFixtures.cardBack_5)throw Error('immediate face/back refresh failed');
    // No waiting for the 400ms interval, no refreshNative call here.
  });
  const firstFrames = await page.evaluate(async () => {
    const { registry, originals, officialFixtures, Native } = check;
    const sceneLayer = new Laya.Sprite(); sceneLayer.name = 'SceneLayer';
    const scene = new Laya.Sprite(); scene.name = 'GameScene';
    const outer = new Laya.Sprite(), hand = new Laya.Sprite(), drawLayer = new Laya.Sprite();
    scene.SelfSeatUi = { cardContainer: hand };
    scene.addChild(outer); outer.addChild(hand); hand.addChild(drawLayer);
    hand.cardUis = [];
    const makeCard = (empty, x) => {
      const card = new Laya.Sprite(); card.pos(x, 410);
      Object.assign(card, { isNewCardUI: true, theCard: { IsEmpty: empty, ResName: 'Sha' },
        bmpFace: new Laya.Sprite(), bmpFace2: { visible: !empty }, bmpName: { visible: true },
        bmpFlower: { visible: true }, bmpNumber: { visible: true }, SetCardFace: Native.prototype.SetCardFace,
        getCardFaceBaseTexture: () => originals.face, updateNewCardFace() {}, measure() {} });
      card.addChild(card.bmpFace); card.SetCardFace(null);
      const render = card.bmpFace.render;
      const firstPaint = new Promise(resolve => {
        card.bmpFace.render = function (...args) {
          this.render = render;
          resolve(this.texture === officialFixtures.cardFace_10 ? 'custom face'
            : this.texture === officialFixtures.cardBack_5 ? 'custom back'
            : this.texture === originals.face ? 'original face'
            : this.texture === originals.back ? 'original back' : 'other');
          return render.apply(this, args);
        };
      });
      return { card, firstPaint };
    };
    const flatLayer = new Laya.Sprite();
    let flatX = 60;
    flatLayer.addDrawChild = function (bitmap) {
      const texture = bitmap.texture;
      this.graphics.drawTexture(texture, flatX, 560);
      flatX += 110;
      return texture;
    };
    drawLayer.addChild(flatLayer);
    const face = makeCard(false, 60), back = makeCard(true, 170), other = makeCard(true, 280);
    hand.cardUis.push(face.card, back.card);
    drawLayer.addChild(face.card); drawLayer.addChild(back.card); drawLayer.addChild(other.card);
    registry.selectScope('self');
    Laya.stage.addChild(sceneLayer);
    sceneLayer.addChild(scene);
    check.finishFirstFrames = () => { sceneLayer.destroy(true); registry.selectScope('all'); };
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Laya never drew a card under test')), 2000);
    });
    try {
      const entry = await Promise.race([deadline, Promise.all([face.firstPaint, back.firstPaint, other.firstPaint])]);
      const nextFace = makeCard(false, 60), nextBack = makeCard(true, 170);
      // A nested draw layer created after entry uses no previously discovered card factory.
      const animation = new Laya.Sprite(); drawLayer.addChild(animation);
      face.card.removeSelf(); back.card.removeSelf();
      hand.cardUis.splice(0, 2, nextFace.card, nextBack.card);
      animation.addChild(nextFace.card); animation.addChild(nextBack.card);
      const duringMatch = await Promise.race([deadline, Promise.all([nextFace.firstPaint, nextBack.firstPaint])]);
      const flat = [makeCard(false, 0).card, makeCard(true, 0).card];
      hand.cardUis.push(...flat);
      const flatDraw = flat.map(card => {
        card.bmpFace.on(Laya.Event.MOUSE_DOWN, card, () => {});
        const drawn = flatLayer.addDrawChild(card.bmpFace);
        return drawn === (card.theCard.IsEmpty ? officialFixtures.cardBack_5 : officialFixtures.cardFace_10);
      });
      return { entry, duringMatch, flatDraw };
    } finally {
      clearTimeout(timeout);
    }
  });
  try {
    await page.screenshot({ path: 'test-results/card-styles-first-frame.png', clip: { x: 45, y: 390, width: 350, height: 320 } });
  } finally {
    await page.evaluate(() => check.finishFirstFrames?.());
  }
  assert.deepEqual(firstFrames, {
    entry: ['custom face', 'custom back', 'original back'],
    duringMatch: ['custom face', 'custom back'],
    flatDraw: [true, true],
  }, 'selected sides must apply before the first Laya render during entry and later card insertion');
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
  const themeToggle = host.locator('[aria-controls="core-theme-workshop"]');
  assert.equal(await themeToggle.getAttribute('aria-expanded'), 'false', 'opening the card workshop collapses the theme workshop');
  await host.locator('.content').evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({path:'test-results/card-style-heading-expanded.png'});
  await host.locator('.card-style-workshop .plugin-toggle').focus();await page.keyboard.press('Enter');await page.waitForTimeout(50);assert.equal(await host.locator('.card-style-workshop .plugin-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await themeToggle.getAttribute('aria-expanded'), 'false', 'closing the card workshop leaves the theme workshop collapsed');
  const appearanceHeadings = host.locator('[aria-controls="core-theme-workshop"], [aria-controls="core-card-style-workshop"]');
  for (const width of [248,280,420]) {
    await host.evaluate((node,width)=>{node.style.width=width+'px';},width);
    const rows=await appearanceHeadings.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));
    assert(rows.every(row=>row.height===36)); assert.equal(rows[1].top-rows[0].bottom,21,JSON.stringify(rows));
    const metrics=await appearanceHeadings.evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return [s.minHeight,s.padding,s.gap];}));
    assert(metrics.every(m=>JSON.stringify(m)===JSON.stringify(['36px','6px 3px','9px'])));
    await page.screenshot({path:'test-results/appearance-spacing-'+width+'.png'});
  }
  await page.screenshot({path:'test-results/card-style-heading-collapsed.png'});
  await page.evaluate(()=>{check.scope.dispose();if(check.cards[0].bmpFace.texture!==check.originals.face)throw Error('core disposal restore failed');if(Object.values(check.officialFixtures).some(t=>t.destroyed||t.bitmap.destroyed))throw Error('destroyed borrowed official texture');});
  await mount(true);
  const custom = host.locator('.custom-card-backs');
  const requests = [];
  const trackRequest = request => { if (/^https?:/.test(request.url())) requests.push(request.url()); };
  page.on('request', trackRequest);
  const picker = custom.locator('input[type=file]');
  const wideName = '横图居中裁剪测试-带很长的原始文件名称以检查窄面板布局.png';
  const tallName = '竖图.png';
  const fixture = await page.evaluate(() => {
    function stripes(horizontal) {
      const canvas = document.createElement('canvas');
      canvas.width = horizontal ? 900 : 200;
      canvas.height = horizontal ? 300 : 900;
      const ctx = canvas.getContext('2d');
      for (const [i, color] of ['#f20c19', '#14b33a', '#1639ed'].entries()) {
        ctx.fillStyle = color;
        if (horizontal) ctx.fillRect(i * 300, 0, 300, 300);
        else ctx.fillRect(0, i * 300, 200, 300);
      }
      return canvas.toDataURL().split(',')[1];
    }
    return { wide: stripes(true), tall: stripes(false) };
  });
  const select = name => custom.getByRole('button', { name, exact: true });
  const originalBack = host.locator('[data-card-style=""][data-card-side="back"]');
  async function assertLocalBack(themeName) {
    await page.waitForFunction(() => check.cards[1].bmpFace.texture.bitmap.width === 372);
    const texture = await page.evaluate(() => {
      const [face, back] = check.cards.map(card => card.bmpFace.texture);
      if (face !== check.officialFixtures.cardFace_10) throw Error('local back changed face');
      check.cards[1].SetCardFace(null);
      if (check.cards[1].bmpFace.texture !== back) throw Error('native refresh lost local back');
      return [back.width, back.height, back.bitmap.width, back.bitmap.height];
    });
    assert.deepEqual(texture, [93, 130, 372, 520]);
    const img = select(themeName).locator('img');
    const crop = await img.evaluate(async image => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return [canvas.width, canvas.height, ...[[2, 2], [canvas.width - 3, canvas.height - 3]].map(
        ([x, y]) => [...ctx.getImageData(x, y, 1, 1).data])];
    });
    assert.deepEqual(crop.slice(0, 2), [372, 520]);
    for (const [r, g, b, alpha] of crop.slice(2)) {
      assert(g > 160 && r < 45 && b < 85 && alpha === 255, 'expected the center stripe at both corners');
    }
    assert.equal(await select(themeName).getAttribute('aria-pressed'), 'true');
    assert.equal(await originalBack.getAttribute('aria-pressed'), 'false');
  }
  const upload = custom.getByRole('button', { name: '选择图片' });
  await upload.scrollIntoViewIfNeeded();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), upload.press('Enter')]);
  await chooser.setFiles({ name: wideName, mimeType: 'image/png', buffer: Buffer.from(fixture.wide, 'base64') });
  await assertLocalBack(wideName);
  const touchChooser = page.waitForEvent('filechooser');
  await upload.tap();
  await (await touchChooser).setFiles({ name: tallName, mimeType: 'image/png', buffer: Buffer.from(fixture.tall, 'base64') });
  await select(tallName).waitFor();
  await assertLocalBack(tallName);
  await picker.setInputFiles({ name: '损坏.png', mimeType: 'image/png', buffer: Buffer.from('bad image') });
  await custom.getByRole('status').filter({ hasText: '导入失败' }).waitFor();
  assert.equal(await custom.locator('.custom-card-back-row').count(), 2);
  await originalBack.click();
  await page.waitForFunction(() => check.cards[1].bmpFace.texture === check.originals.back);
  await select(wideName).focus();
  await page.keyboard.press('Enter');
  await assertLocalBack(wideName);

  for (const width of [248, 280, 420]) for (const [size, offset] of [['tiny', -2], ['small', -1], ['standard', 0], ['large', 2]]) {
    for (const light of [false, true]) {
      const bounds = await page.evaluate(({ width, offset, light }) => {
        const { shell } = check;
        shell.host.style.width = width + 'px';
        shell.host.style.setProperty('--sgs-font-offset', offset + 'px');
        shell.applyTheme({ ...CardCheck.BLACK_GOLD.tokens, ...(light ? { bg: '#f6f0e4', surface: '#fffaf0',
          raised: '#ebe2cf', text: '#312a20', muted: '#746957', accent: '#826121', border: '#c7b89b', scheme: 'light' } : {}) });
        const root = shell.host.shadowRoot, panel = root.querySelector('.content');
        const section = root.querySelector('.custom-card-backs');
        section.scrollIntoView({ block: 'end' });
        const title = section.querySelector('h4').getBoundingClientRect();
        const button = section.querySelector('.custom-card-backs-heading button');
        const { width: buttonWidth, height: buttonHeight, top } = button.getBoundingClientRect();
        return { overflow: panel.scrollWidth > panel.clientWidth, buttonWidth, buttonHeight, headerOneLine: top < title.bottom,
          removeWidth: section.querySelector('.custom-card-back-remove').getBoundingClientRect().width };
      }, { width, offset, light });
      assert(!bounds.overflow && bounds.headerOneLine && bounds.buttonWidth >= 64 && bounds.buttonHeight >= 34 && bounds.removeWidth >= 34);
      if ((width === 280 && size === 'standard') || (width === 248 && size === 'large')) {
        await page.screenshot({ path: `test-results/custom-card-backs-${width}-${size}-${light ? 'light' : 'dark'}.png`, animations: 'disabled' });
      }
    }
  }
  assert.deepEqual(requests, [], 'local import and preview must not make network requests');
  page.off('request', trackRequest);
  await page.setViewportSize({ width: 1000, height: 540 });
  await mount(true);
  await select(wideName).waitFor();
  await assertLocalBack(wideName);
  await custom.getByRole('button', { name: '删除 ' + tallName, exact: true }).click();
  await select(tallName).waitFor({ state: 'detached' });
  await assertLocalBack(wideName);
  const removedTexture = await page.evaluateHandle(() => check.cards[1].bmpFace.texture);
  await custom.getByRole('button', { name: '删除 ' + wideName, exact: true }).click();
  await select(wideName).waitFor({ state: 'detached' });
  await page.waitForFunction(() => check.cards[1].bmpFace.texture === check.originals.back);
  assert.equal(await removedTexture.evaluate(texture => texture.destroyed), true);
  await removedTexture.dispose();
  assert.equal(await originalBack.getAttribute('aria-pressed'), 'true');
  await mount(true);
  await page.evaluate(() => check.registry.localBacksReady);
  assert.equal(await custom.locator('.custom-card-back-row').count(), 0);
  assert.equal(await originalBack.getAttribute('aria-pressed'), 'true');
  page.on('request', trackRequest);
  const localFace = host.getByRole('button', { name: '自定义卡面', exact: true });
  await localFace.focus(); await page.keyboard.press('Enter');
  const editor = host.locator('.custom-card-faces');
  const search = editor.getByRole('searchbox', { name: '搜索牌名' });
  const cardSelect = editor.getByRole('combobox', { name: '选择牌名' });
  const facePicker = editor.locator('input[type=file]');
  const faceFile = (name, type = 'wide') => ({ name, mimeType: 'image/png', buffer: Buffer.from(fixture[type], 'base64') });
  const backgroundMode = editor.getByRole('button', { name: '统一底图' });
  const fullMode = editor.getByRole('button', { name: '逐牌换图' });
  assert.equal(await backgroundMode.getAttribute('aria-pressed'), 'true');
  assert.equal(await cardSelect.isVisible(), false);
  const backgroundFixture = await page.evaluate(() => {
    delete window.CtrUtil.AllDatas;
    check.addCard(false, 280, 'Shan');
    const canvas = document.createElement('canvas');
    canvas.width = 405; canvas.height = 570;
    const c = canvas.getContext('2d');
    const gradient = c.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f2e5c4'); gradient.addColorStop(1, '#9ab2aa');
    c.fillStyle = gradient; c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = '#83734f'; c.lineWidth = 4; c.strokeRect(12, 12, 381, 546);
    return canvas.toDataURL().split(',')[1];
  });
  const backgroundFile = '卡面统一底纹.png';
  await facePicker.setInputFiles({ name: backgroundFile, mimeType: 'image/png', buffer: Buffer.from(backgroundFixture, 'base64') });
  await editor.getByRole('status').filter({ hasText: '已保存底图' }).waitFor();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405 && check.cards[0].bmpFace.texture === check.cards[2].bmpFace.texture);
  await page.evaluate(() => {
    const [sha, hidden, shan] = check.cards;
    const texture = sha.bmpFace.texture;
    for (const ui of [sha, shan]) {
      ui.SetCardFace(null);
      if (ui.bmpFace.texture !== texture || ![ui.bmpFace2, ui.bmpName, ui.bmpNumber, ui.bmpFlower].every(layer => layer.visible)) throw Error('background affected face layers');
    }
    if (hidden.bmpFace.texture !== check.originals.back) throw Error('background changed card back');
    shan.isNewCardUI = false;
    check.registry.refreshNative();
    if (shan.bmpFace.texture !== check.originals.face || !shan.bmpFace2.visible) throw Error('legacy art should remain native');
    shan.isNewCardUI = true;
    check.registry.refreshNative();
    if (shan.bmpFace.texture !== texture) throw Error('modern art should pick up the saved background');
  });
  for (const width of [248, 280, 420]) for (const offset of [-2, -1, 0, 2]) for (const light of [false, true]) {
    const metrics = await page.evaluate(({ width, offset, light }) => {
      const { shell } = check, root = shell.host.shadowRoot, frame = root.querySelector('.shell');
      frame.style.width = shell.host.style.width = width + 'px';
      shell.host.style.setProperty('--sgs-font-offset', offset + 'px');
      shell.applyTheme({ ...CardCheck.BLACK_GOLD.tokens, ...(light ? { bg: '#f6f0e4', surface: '#fffaf0',
        raised: '#ebe2cf', text: '#312a20', muted: '#746957', accent: '#826121', border: '#c7b89b', scheme: 'light' } : {}) });
      const panel = root.querySelector('.content');
      const editor = root.querySelector('.custom-card-faces');
      editor.scrollIntoView({ block: 'center' });
      const buttons = [...editor.querySelectorAll('.sgs-segments button, .custom-card-face-fields button')];
      return { host: shell.host.getBoundingClientRect().width, frame: frame.getBoundingClientRect().width,
        overflow: panel.scrollWidth > panel.clientWidth, buttonsFit: buttons.every(button => button.scrollWidth <= button.clientWidth),
        uploadHeight: buttons[2].offsetHeight };
    }, { width, offset, light });
    assert.deepEqual(metrics, { host: width, frame: width, overflow: false, buttonsFit: true, uploadHeight: 34 });
    if (width === 248 && offset === 2 || width === 280 && offset === 0) {
      await page.screenshot({ path: `test-results/card-face-background-${width}-${offset}-${light ? 'light' : 'dark'}.png`, animations: 'disabled' });
    }
  }
  assert.equal(await page.evaluate(() => check.configLoads.length), 0, 'background mode must not load the card catalog');
  await fullMode.click();
  await page.waitForFunction(() => check.configLoads.length === 1);
  assert.deepEqual(await cardSelect.locator('option').allTextContents(), ['正在读取牌表…']);
  assert.equal(await cardSelect.isEnabled(), false);
  await fullMode.click();
  assert.equal(await page.evaluate(() => check.configLoads.length), 1, 'reopening must reuse the pending load');
  await page.evaluate(() => check.configLoads[0].reject(new Error('模拟网络超时')));
  await editor.getByRole('status').filter({ hasText: '读取游戏牌表失败：模拟网络超时' }).waitFor();
  await page.evaluate(() => {
    check.shell.host.style.width = '248px';
    check.shell.host.shadowRoot.querySelector('.shell').style.width = '248px';
    check.shell.applyTheme(CardCheck.BLACK_GOLD.tokens);
    check.shell.host.shadowRoot.querySelector('.custom-card-faces').scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: 'test-results/custom-card-faces-load-error.png', animations: 'disabled' });
  await editor.getByRole('button', { name: '重试读取牌表' }).press('Enter');
  await page.waitForFunction(() => check.configLoads.length === 2);
  const { url, credentials } = await page.evaluate(() => {
    const load = check.configLoads[1];
    load.succeed();
    return { url: load.url, credentials: load.credentials };
  });
  assert.match(url, /Config_w\.sgs\?v=cards-fixture$/);
  assert.equal(credentials, 'omit');
  await cardSelect.locator('option[value="HuoSha"]').waitFor({ state: 'attached' });
  assert.equal(await cardSelect.isEnabled(), true);
  assert.equal(await editor.getByRole('button', { name: '重试读取牌表' }).isVisible(), false);
  await page.waitForFunction(() => check.cards[0].bmpFace.texture === check.originals.face);
  await search.fill('火杀');
  assert.deepEqual(await cardSelect.locator('option').allTextContents(), ['选择牌名', '火杀']);
  await search.fill('杀');
  await cardSelect.selectOption('Sha');
  const chooseFace = editor.getByRole('button', { name: '选择图片', exact: true });
  const faceChooser = page.waitForEvent('filechooser');
  await chooseFace.tap();
  await (await faceChooser).setFiles(faceFile(wideName));
  await editor.getByRole('status').filter({ hasText: '已保存卡图' }).waitFor();
  const shaTexture = await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405 && check.cards[0].bmpFace.texture);
  assert.deepEqual(await shaTexture.evaluate(t => [t.width, t.height, t.bitmap.width, t.bitmap.height]), [93, 130, 405, 570]);
  await page.evaluate(() => {
    const [sha, hidden] = check.cards;
    const texture = sha.bmpFace.texture;
    sha.SetCardFace(null);
    if (sha.bmpFace.texture !== texture || sha.bmpName.visible || !sha.bmpNumber.visible || !sha.bmpFlower.visible) throw Error('face layers changed incorrectly');
    if (hidden.bmpFace.texture !== check.originals.back) throw Error('custom face changed card back');
    hidden.theCard = { IsEmpty: false, ResName: 'HuoSha' }; hidden.SetCardFace(null);
    if (hidden.bmpFace.texture !== check.originals.face || !hidden.bmpName.visible) throw Error('different card incorrectly inherited custom face');
  });
  await cardSelect.selectOption('HuoSha');
  await facePicker.setInputFiles(faceFile(tallName, 'tall'));
  await page.waitForFunction(() => check.cards[1].bmpFace.texture.bitmap.width === 405);
  assert.equal(await shaTexture.evaluate(t => t.destroyed), false);
  await cardSelect.selectOption('Sha');
  await facePicker.setInputFiles({ name: '损坏.png', mimeType: 'image/png', buffer: Buffer.from('bad image') });
  await editor.getByRole('status').filter({ hasText: '导入失败' }).waitFor();
  assert.equal(await shaTexture.evaluate(t => t.destroyed), false);
  await facePicker.setInputFiles(faceFile('替换测试.png', 'tall'));
  await page.waitForFunction(old => check.cards[0].bmpFace.texture !== old && check.cards[0].bmpFace.texture.bitmap.width === 405, shaTexture);
  assert.equal(await shaTexture.evaluate(t => t.destroyed), true);
  await shaTexture.dispose();
  await facePicker.setInputFiles(faceFile(wideName));
  await editor.locator('.custom-card-face-preview [title]').filter({ hasText: wideName }).waitFor();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405);
  for (const width of [248, 280, 420]) for (const [size, offset] of [['tiny', -2], ['small', -1], ['standard', 0], ['large', 2]]) {
    for (const light of [false, true]) {
      const metrics = await page.evaluate(({ width, offset, light }) => {
        const { shell } = check, root = shell.host.shadowRoot;
        const frame = root.querySelector('.shell');
        frame.style.width = shell.host.style.width = width + 'px';
        shell.host.style.setProperty('--sgs-font-offset', offset + 'px');
        shell.applyTheme({ ...CardCheck.BLACK_GOLD.tokens, ...(light ? { bg: '#f6f0e4', surface: '#fffaf0',
          raised: '#ebe2cf', text: '#312a20', muted: '#746957', accent: '#826121', border: '#c7b89b', scheme: 'light' } : {}) });
        const body = root.querySelector('.content'), editor = root.querySelector('.custom-card-faces');
        editor.scrollIntoView({ block: 'center' });
        const picker = editor.querySelector('.custom-card-face-fields button');
        const select = editor.querySelector('select');
        return { width: frame.getBoundingClientRect().width, hostWidth: shell.host.getBoundingClientRect().width,
          overflow: body.scrollWidth > body.clientWidth, pickerAligned: picker.offsetTop === select.offsetTop,
          pickerHeight: picker.getBoundingClientRect().height, pickerFits: picker.scrollWidth <= picker.clientWidth };
      }, { width, offset, light });
      assert.deepEqual(metrics, { width, hostWidth: width, overflow: false, pickerAligned: true, pickerHeight: 34, pickerFits: true });
      if ((width === 280 && size === 'standard') || (width === 248 && size === 'large')) {
        await page.screenshot({ path: `test-results/custom-card-faces-${width}-${size}-${light ? 'light' : 'dark'}.png`, animations: 'disabled' });
      }
    }
  }
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 507, height: 768 }]) {
    const beforeResize = await editor.elementHandle();
    await page.setViewportSize(viewport);
    await page.waitForFunction(node => !node.isConnected, beforeResize, { timeout: 2000 });
    await beforeResize.dispose();
    await cardSelect.selectOption('Sha');
    await cardSelect.scrollIntoViewIfNeeded();
    const box = await cardSelect.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height);
    assert(await editor.getByRole('button', { name: '更换图片' }).isEnabled({ timeout: 2000 }));
  }
  await page.setViewportSize({ width: 1000, height: 540 });
  await host.locator('[data-card-style="card-styles-extra.native-general"][data-card-side="face"]').click();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture === check.officialFixtures.cardFace_10 && check.cards[0].bmpName.visible);
  await localFace.click();
  assert.equal(await backgroundMode.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405 && check.cards[0].bmpName.visible);
  await fullMode.click();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405);
  assert.deepEqual(requests, [], 'local face imports never contact a remote server');
  page.off('request', trackRequest);
  await mount(true);
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405);
  await cardSelect.selectOption('Sha');
  const finalTexture = await page.evaluateHandle(() => check.cards[0].bmpFace.texture);
  await editor.getByRole('button', { name: '删除这张卡图' }).click();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture === check.originals.face && check.cards[0].bmpName.visible);
  assert.equal(await finalTexture.evaluate(t => t.destroyed), true);
  await finalTexture.dispose();
  assert.deepEqual(await page.evaluate(() => check.registry.listLocalFaces().map(face => face.card)), ['HuoSha']);
  await mount(true);
  await page.evaluate(() => check.registry.localFacesReady);
  assert.deepEqual(await page.evaluate(() => check.registry.listLocalFaces().map(face => face.card)), ['HuoSha']);
  await backgroundMode.click();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405 && check.cards[0].bmpName.visible);
  await mount(true);
  assert.equal(await backgroundMode.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => check.cards[0].bmpFace.texture.bitmap.width === 405 && check.cards[0].bmpName.visible);
  const oldBackground = await page.evaluateHandle(() => check.cards[0].bmpFace.texture);
  await editor.getByRole('button', { name: '删除底图' }).click();
  await page.waitForFunction(() => check.cards[0].bmpFace.texture === check.originals.face && check.registry.localFaceBackground === null);
  assert.equal(await oldBackground.evaluate(texture => texture.destroyed), true);
  await oldBackground.dispose();
  await mount(true);
  await page.evaluate(() => check.registry.localFacesReady);
  assert.equal(await page.evaluate(() => check.registry.localFaceBackground), null);
  assert.deepEqual(await page.evaluate(() => check.registry.listLocalFaces().map(face => face.card)), ['HuoSha']);
  await page.evaluate(() => check.scope.dispose());
  assert.deepEqual(errors,[]);
  const evidence={...result,firstFrames,officialSourceSha256:createHash('sha256').update(source).digest('hex'),checks:'native SetCardFace replay with official Laya; first rendered frame during scene entry and nested card insertion, replacement before flat graphics submission, synchronous new-card creation, independent sides, pool transition, poker exclusion, restore, cleanup, sticky tabs, keyboard collapse; custom back import and deletion; uniform face background without card catalog, shared texture for different cards, native artwork and other layers, legacy fallback, persistent independent modes and deletion; catalog loading from a simulated official archive, failure and keyboard retry; custom face exact card match, invalid import, replacement, restore; 248/280/420px, four text sizes, dark and light, keyboard and touch; tablet portrait, landscape and split-screen viewport sizes',limitations:'Controlled native-method replay; native resource cache uses colored fixture textures, not official artwork or a logged-in game.'};
  await writeFile('test-results/card-styles-check.json',JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await browser.close();}
