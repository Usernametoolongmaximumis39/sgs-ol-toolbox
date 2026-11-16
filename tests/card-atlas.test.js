import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Settings } from '../src/core/storage.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { CardStyleRegistry } from '../src/core/card-styles.js';
import { ResourceScope } from '../src/core/resources.js';
import { cardFrameName, parseCardFrames, validateCardAtlas, loadCardAtlas } from '../src/core/card-atlas.js';
import plugin from '../src/plugins/yjcm-cards/index.js';
import { resources } from '../src/plugins/yjcm-cards/resources.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { verifyPackage } from '../src/core/packages.js';

test('local atlas allows literal IPv4 loopback while retaining integrity and remote HTTPS rules', () => {
  const spec = url => ({ ...resources.miao, index: { url, sha256: 'a'.repeat(64) } });
  assert.equal(validateCardAtlas(spec('http://127.0.0.1:17321/card-art/card.atlas')).index.url, 'http://127.0.0.1:17321/card-art/card.atlas');
  for (const url of ['http://example.com/card.atlas', 'http://192.168.1.1/card.atlas', 'http://127.0.0.1.example.com/card.atlas', 'http://user@127.0.0.1/card.atlas']) {
    assert.throws(() => validateCardAtlas(spec(url)), /HTTPS/);
  }
  assert.throws(() => validateCardAtlas({ ...spec('http://127.0.0.1/card.atlas'), index: { url: 'http://127.0.0.1/card.atlas', sha256: 'bad' } }), /SHA-256/);
});

test('atlas contract: source, integrity, exact names and untrimmed card frames only', () => {
  const descriptor = validateCardAtlas(resources.zhuzhuxia);
  assert.equal(descriptor.pages.length, 2);
  assert.throws(() => validateCardAtlas({ ...resources.miao, source: '' }), /来源/);
  assert.throws(() => validateCardAtlas({ ...resources.miao, index: {url:'http://example.com',sha256:'bad'} }), /HTTPS/);
  assert.throws(() => validateCardAtlas({ ...resources.miao, previewImage: 'https://example.com/preview.png' }), /内嵌 PNG/);
  assert.equal(cardFrameName('GuoZhanSha'), 'GuoZhanSha_png.png');
  assert.equal(cardFrameName('../Sha'), null);
  const full = {frame:{x:0,y:0,w:135,h:190,idx:0},sourceSize:{w:135,h:190},spriteSourceSize:{x:0,y:0}};
  const index = {meta:{image:'cardZhuZhuXia.png,cardZhuZhuXia1.png'},frames:{'Sha_png.png':full,'GuoZhanSha_png.png':full,
    'Mask_png.png':{...full,frame:{...full.frame,w:5}},'Invalid_png.png':{...full,rotated:true}}};
  const frames = parseCardFrames(index,[{width:135,height:190},{width:256,height:240}],descriptor);
  assert.deepEqual([...frames.keys()],['Sha_png.png','GuoZhanSha_png.png']);
  assert.throws(() => parseCardFrames({...index,meta:{image:'else.png'}},[],descriptor), /清单/);
});

test('download hash mismatch and cancellation never decode or publish card art', async () => {
  const win={fetch:async()=>new Response('incorrect content'),crypto:globalThis.crypto,createImageBitmap(){assert.fail('must verify first');}};
  await assert.rejects(loadCardAtlas(win,resources.miao,new AbortController().signal), /SHA-256/);
  await assert.rejects(loadCardAtlas({...win,fetch:async()=>{throw new Error('cancelled');}},resources.miao,new AbortController().signal), /cancelled/);
});

test('pinned card art prefers GitHub and falls back after HTTP, hash and timeout failures', async () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71]);
  const dimensions = new DataView(png.buffer); dimensions.setUint32(16, 135); dimensions.setUint32(20, 190);
  const frame = { frame: { x: 0, y: 0, w: 135, h: 190 }, sourceSize: { w: 135, h: 190 }, spriteSourceSize: { x: 0, y: 0 } };
  const index = new TextEncoder().encode(JSON.stringify({ meta: { image: 'cards.png' }, frames: { 'Sha_png.png': frame } }));
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  const spec = async (name, bytes) => ({ url: 'https://github.example/' + name, fallbackUrls: ['https://oss.example/' + name], sha256: await digest(bytes) });
  const descriptor = validateCardAtlas({ index: await spec('card.atlas', index), pages: [await spec('cards.png', png)], source: 'Fixture' });
  for (const failure of [null, 'http', 'hash', 'timeout']) {
    const calls = []; let closed = 0;
    const win = { crypto, Blob, async fetch(url) {
      calls.push(url);
      if (url.startsWith('https://github.example/') && failure) {
        if (failure === 'timeout') return new Promise(() => {});
        return failure === 'hash' ? new Response('corrupt') : new Response('', { status: 404 });
      }
      return new Response(url.endsWith('.atlas') ? index : png);
    }, async createImageBitmap() { return { width: 135, height: 190, close() { closed++; } }; } };
    const atlas = await loadCardAtlas(win, descriptor, new AbortController().signal, { timeoutMs: 15 });
    assert(atlas.frames.has('Sha_png.png'));
    assert.deepEqual(calls, failure ? ['https://github.example/card.atlas', 'https://oss.example/card.atlas', 'https://github.example/cards.png', 'https://oss.example/cards.png']
      : ['https://github.example/card.atlas', 'https://github.example/cards.png']);
    atlas.dispose(); assert.equal(closed, 1);
  }
  const abort = new AbortController(); abort.abort(new Error('stopped'));
  await assert.rejects(loadCardAtlas({ fetch() { assert.fail('cancel must not request either host'); } }, descriptor, abort.signal), /stopped/);
  assert.throws(() => validateCardAtlas({ ...resources.miao, index: { ...descriptor.index, fallbackUrls: ['http://unsafe.example/card.atlas'] } }), /HTTPS/);
});

test('HD atlas requires an explicit integer pixel ratio and exact complete frames at that ratio', () => {
  assert.equal(validateCardAtlas(resources.miao).pixelRatio, 1, 'existing official packs stay 1x');
  for (const pixelRatio of [0, 4, 1.5, '3', NaN]) {
    assert.throws(() => validateCardAtlas({ ...resources.miao, pixelRatio }), /像素倍率/);
  }
  for (const pixelRatio of [2, 3]) {
    const descriptor = validateCardAtlas({ ...resources.miao, pixelRatio });
    const w = 135 * pixelRatio, h = 190 * pixelRatio;
    const full = { frame: { x: 0, y: 0, w, h, idx: 0 }, sourceSize: { w, h }, spriteSourceSize: { x: 0, y: 0 } };
    const index = { meta: { image: 'cardMiaoMiaoBei.png' }, frames: {
      'Sha_png.png': full,
      'Trimmed_png.png': { ...full, trimmed: true },
      'Rotated_png.png': { ...full, rotated: true },
      'WrongSize_png.png': { ...full, frame: { ...full.frame, w: 135 } },
      'WrongSource_png.png': { ...full, sourceSize: { w: 135, h: 190 } },
      'Offset_png.png': { ...full, spriteSourceSize: { x: 1, y: 0 } },
      'Outside_png.png': { ...full, frame: { ...full.frame, x: 1 } },
    } };
    const pages = [{ width: w, height: h }];
    assert.deepEqual([...parseCardFrames(index, pages, descriptor).keys()], ['Sha_png.png']);
    assert.throws(() => parseCardFrames(index, pages, validateCardAtlas(resources.miao)), /完整卡图/, 'undeclared HD frames must not silently load');
  }
});

test('HD pixels survive canvas and GPU upload while native hand/popup dimensions stay independent', t => {
  const scope = new ResourceScope(), draws = [];
  const page = { width: 810, height: 570 }, frame = { x: 405, y: 0, w: 405, h: 570, idx: 0 };
  const registry = new CardStyleRegistry({
    window: { Laya: {
      Texture2D: class { constructor(width, height) { Object.assign(this, { width, height }); } loadImageSource(canvas) { this.canvas = canvas; } },
      Texture: class { constructor(bitmap) { this.bitmap = bitmap; } destroy() {} },
    } },
    document: { createElement() { return { getContext: () => ({ drawImage: (...args) => draws.push(args) }) }; } },
    game: {}, settings: { get: (key, fallback) => fallback }, scope,
  });
  t.after(() => scope.dispose());
  const style = { id: 'test.hd', atlas: validateCardAtlas({ ...resources.miao, pixelRatio: 3 }) };
  registry.atlases.set(style.id, { controller: new AbortController(), data: { pages: [page], frames: new Map([['Sha_png.png', frame]]), dispose() {} } });
  const ui = { isNewCardUI: true, theCard: { ResName: 'Sha' } };
  const hand = registry.atlasTexture(style, ui, { width: 133, height: 184 });
  const popup = registry.atlasTexture(style, ui, { width: 126, height: 174 });
  for (const texture of [hand, popup]) {
    assert.deepEqual([texture.bitmap.width, texture.bitmap.height], [405, 570]);
    assert.deepEqual([texture.bitmap.canvas.width, texture.bitmap.canvas.height], [405, 570]);
  }
  assert(draws.every(args => args[0] === page && args.slice(1).join(',') === '405,0,405,570,0,0,405,570'), 'copy atlas pixels without downsampling');
  assert.deepEqual([hand.width, hand.height, hand.sourceWidth, hand.sourceHeight], [133, 184, 133, 184]);
  assert.deepEqual([popup.width, popup.height, popup.sourceWidth, popup.sourceHeight], [126, 174, 126, 174]);
  assert.notEqual(hand, popup);
  assert.equal(registry.atlasTexture(style, ui, { width: 133, height: 184 }), hand, 'same-size refresh reuses the HD texture');
});

test('full art: exact special cards, missing/virtual/native overrides, pooled reuse and reversible layers', t => {
  const scope = new ResourceScope(), data = new Map(), original = {}, flower = {}, number = {};
  const make = name => ({theCard:{ResName:name,IsEmpty:false},isNewCardUI:true,bmpFace:{texture:original},bmpFace2:{visible:true},bmpName:{visible:false},bmpNumber:{texture:number},bmpFlower:{texture:flower},
    getCardFaceBaseTexture(){},updateNewCardFace(){this.bmpFace2.visible=true;},SetCardFace(){this.bmpFace.texture=original;this.updateNewCardFace();},
    UpdateCardFaceRes(){this.bmpFace.texture=original;this.bmpFace2.visible=true;},Clear(){this.bmpFace.texture=original;}});
  const cards=['Sha','GuoZhanSha','Limited2026','Activity2026'].map(make), hand={cardUis:cards};
  const registry = new CardStyleRegistry({window:{Laya:{Texture2D:class{loadImageSource(){}},Texture:class{destroy(){this.destroyed=true;}}}},document:{},game:{getSelfSeatUI:()=>({cardContainer:hand})},settings:{get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)},scope});
  t.after(()=>scope.dispose());
  registry.ensureAtlas = () => ({});
  registry.atlasCanvas = (style,name) => ['Sha','GuoZhanSha'].includes(name) ? {} : null;
  plugin.activate({cardStyles:{register:s=>registry.register(s,'yjcm-cards')}});
  registry.selectSide('face','yjcm-cards.miao');
  const themed=cards[0].bmpFace.texture;
  assert.notEqual(themed,original); assert.equal(cards[0].bmpFace2.visible,false);
  assert.equal(cards[0].bmpNumber.texture,number); assert.equal(cards[0].bmpFlower.texture,flower);
  assert.equal(cards[1].bmpFace.texture,original,'cards outside the verified differences keep native art');
  const count=registry.textures.size;cards[1].theCard.ResName='MuNiuLiuMa';registry.refreshNative();
  assert.equal(cards[1].bmpFace.texture,original,'identical MuNiuLiuMa is not replaced');assert.equal(registry.textures.size,count,'identical art creates no GPU texture');
  assert.equal(cards[1].bmpFace2.visible,true,'identical art retains original layers');
  for (const ui of cards.slice(2)) assert.equal(ui.bmpFace.texture,original,'unknown limited/activity art stays native');
  cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed);assert.equal(cards[0].bmpFace2.visible,false);
  cards[0].UpdateCardFaceRes();registry.refreshNative();assert.equal(cards[0].bmpFace.texture,original,'explicit special override wins');
  cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed);
  cards[0].theCard={ResName:'Activity2026',IsEmpty:false};cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,original);assert.equal(cards[0].bmpFace2.visible,true);
  cards[0].theCard={ResName:'Sha',IsEmpty:false,IsVirtualCard:true};cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed,'virtual display cards use their exact native resource name');
  cards[0].theCard={ResName:'Sha',IsEmpty:false};cards[0].IsYiCard=true;cards[0].isSkillChangeStatus=true;cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed,'new-card Yi/skill labels must not block exact illustration');
  cards[0].theCard={ResName:'Sha',IsEmpty:false,IsVirtualCard:true,IsVirtualRealCard:true};cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed,'virtual real cards preserve their exact physical art');registry.selectSide('face','');assert.equal(cards[0].bmpFace.texture,original);assert.equal(cards[0].bmpFace2.visible,true);
  registry.selectSide('face','yjcm-cards.miao');cards[0].isNewCardUI=false;cards[0].IsYiCard=false;cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,themed,'self-hand legacy full-image renderer accepts exact atlas art');
  cards[0].IsYiCard=true;cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,original,'legacy Yi special image remains native');
  assert.throws(()=>registry.selectSide('back','yjcm-cards.miao'), /仅提供卡面/);
});

test('yjcm package is standalone and declares two sourced, pinned face-only styles', async () => {
  const styles=[];plugin.activate({cardStyles:{register:s=>styles.push(s)}});
  assert.equal(styles.length,2);assert(styles.every(s=>s.atlas.source.includes('官方资源')&&!s.back));
  assert(styles.every(s=>s.atlas.previewImage.startsWith('data:image/png;base64,')&&!s.atlas.source.includes('小抄')));
  const bundle=await bundlePlugin('yjcm-cards');assert(bundle.inputs.every(p=>p.startsWith('src/plugins/yjcm-cards/')));
  const packet=await makePluginPackage(bundle);await verifyPackage(packet);assert(packet.code.length<200000,'only two small previews are embedded, not full sheets');
});

test('yjcm real plugin manager install/disable/enable/reload/update/rollback/uninstall', async t => {
  const dom=new JSDOM('',{url:'https://example.test/'}),scope=new ResourceScope(),settings=new Settings(dom.window.localStorage),rows=new Map();
  const registry=new CardStyleRegistry({window:dom.window,document:dom.window.document,game:{},settings,scope});
  const manager=new PluginManager({journal:new SessionJournal(),settings,store:{async list(){return [...rows.values()];},async put(r){rows.set(r.id,structuredClone(r));}},context:{window:dom.window,document:dom.window.document,cardStyles:registry,ui:{}}});
  t.after(()=>{manager.dispose();scope.dispose();dom.window.close();});
  await manager.init();const packet=await makePluginPackage(await bundlePlugin('yjcm-cards'));await manager.install(packet);
  assert.equal(registry.list().length,2);assert.equal(registry.atlases.size,0,'installation is offline');
  await manager.disable('yjcm-cards');assert.equal(registry.list().length,0);
  await manager.enable('yjcm-cards');await manager.reload('yjcm-cards');assert.equal(registry.list().length,2);
  await manager.install(packet);assert.equal(registry.list().length,2);await manager.rollback('yjcm-cards');assert.equal(registry.list().length,2);
  await manager.uninstall('yjcm-cards');assert.equal(registry.list().length,0);assert.equal(registry.atlases.size,0);
});

test('skill refresh preserves native auto-sized face dimensions and isolates different UI sizes', t => {
  const scope=new ResourceScope(),data=new Map(),original={width:133,height:184};
  // Official fO.texture's relevant behavior: texture assignment changes
  // dimensions unless width/height were explicitly set by native layout.
  class Face {
    constructor(texture){this.texture=texture;}
    set texture(value){this._texture=value;if(!this.isSetWidth)this.width=value.width;if(!this.isSetHeight)this.height=value.height;}
    get texture(){return this._texture;}
  }
  const make=(width,height)=>({width,height,theCard:{ResName:'Sha',IsEmpty:false},isNewCardUI:false,bmpFace:new Face(original),
    getCardFaceBaseTexture(){},updateNewCardFace(){},SetCardFace(){this.bmpFace.texture=original;},});
  const hand=make(133,184),popup=make(126,174),cards=[hand,popup];
  const registry=new CardStyleRegistry({window:{Laya:{Texture2D:class{loadImageSource(){}},Texture:class{destroy(){}}}},document:{},
    game:{getSelfSeatUI:()=>({cardContainer:{cardUis:cards}})},settings:{get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)},scope});
  t.after(()=>scope.dispose());registry.ensureAtlas=()=>({});registry.atlasCanvas=()=>({});
  plugin.activate({cardStyles:{register:s=>registry.register(s,'yjcm-cards')}});registry.selectSide('face','yjcm-cards.miao');
  const before=hand.bmpFace.texture;
  assert.deepEqual([hand.bmpFace.width,hand.bmpFace.height],[133,184]);
  assert.deepEqual([popup.bmpFace.width,popup.bmpFace.height],[126,174]);assert.notEqual(before,popup.bmpFace.texture);
  for(let i=0;i<5;i++){hand.SetCardFace();hand.updateNewCardFace();assert.deepEqual([hand.bmpFace.width,hand.bmpFace.height],[133,184]);}
  hand.width=169;hand.height=224;hand.SetCardFace();assert.deepEqual([hand.bmpFace.width,hand.bmpFace.height],[169,224]);
  assert.deepEqual([popup.bmpFace.texture.width,popup.bmpFace.texture.height],[126,174]);
  assert.deepEqual([original.width,original.height],[133,184]);
  assert.equal(hand.bmpFace.texture.sourceWidth,169);assert.equal(hand.bmpFace.texture.sourceHeight,224);
  const art=hand.bmpFace.texture;hand.bmpFace.texture=original;assert.equal(hand.bmpFace.texture,art,'direct ordinary refresh is styled synchronously');
  const special={width:169,height:224};hand.bmpFace.texture=special;assert.equal(hand.bmpFace.texture,special,'unknown explicit skill art stays native');
  scope.dispose();assert.equal(Object.getOwnPropertyDescriptor(hand.bmpFace,'texture'),undefined,'owned texture accessor is released');
});

test('virtual skill lists and standalone shop cards bind before insertion returns and survive discovery', t => {
  const scope=new ResourceScope(),data=new Map(),original={},base={},stage={_children:[],addChild(node){this._children.push(node);return node;}};
  const addChild=stage.addChild;
  class Face {get texture(){return this.value;}set texture(value){this.value=value;}}
  const make=name=>{const face=new Face();face.texture=original;return {theCard:{ResName:name,IsEmpty:false,IsVirtualCard:true},isNewCardUI:true,bmpFace:face,
    getCardFaceBaseTexture:()=>base,updateNewCardFace(){},SetCardFace(){this.bmpFace.texture=original;}};};
  const hand={cardUis:[],virtualCardUis:[],createNormalCardUi(card){const ui=make(card.ResName);ui.theCard=card;return ui;},
    StartSelectCard(){this.virtualCardUis.push(this.createNormalCardUi({ResName:'Sha',IsEmpty:false,IsVirtualCard:true}));}};
  const registry=new CardStyleRegistry({window:{Laya:{stage,Texture2D:class{loadImageSource(){}},Texture:class{destroy(){}}}},document:{},game:{getScene:()=>stage,getSelfSeatUI:()=>({cardContainer:hand})},settings:{get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)},scope});
  t.after(()=>scope.dispose());registry.ensureAtlas=()=>({});registry.atlasCanvas=()=>({});
  plugin.activate({cardStyles:{register:s=>registry.register(s,'yjcm-cards')}});registry.selectSide('face','yjcm-cards.miao');
  hand.StartSelectCard();const virtual=hand.virtualCardUis[0];assert.notEqual(virtual.bmpFace.texture,original,'skill card is styled in same call');
  const shop={cardUi:make('Shan')};stage.addChild(shop);assert.notEqual(shop.cardUi.bmpFace.texture,original,'shop single card styled before addChild returns');
  for(let i=0;i<3;i++){registry.refreshNative();assert(registry.bindings.has(virtual));assert(registry.bindings.has(shop.cardUi));}
  virtual.bmpFace.texture=base;assert.notEqual(virtual.bmpFace.texture,base,'known native face refresh stays themed without polling');
  scope.dispose();assert.equal(stage.addChild,addChild);assert.equal(shop.cardUi.bmpFace.texture,original);
});
