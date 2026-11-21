import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CardStyleRegistry, findNativeCardTexture, LOCAL_FACE_STYLE } from '../src/core/card-styles.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import gold from '../src/plugins/gold-cards/index.js';
import nativeCards from '../src/plugins/native-cards/index.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { verifyPackage } from '../src/core/packages.js';

test('native texture discovery preserves exact versioned aliases and can see a late-loaded map entry', () => {
  const texture = { bitmap: {}, width: 93, height: 130 };
  const alias = 'res/cards/cardFace_10.png?v=2';
  const laya = { Loader: { textureMap: { 'wrong/cardFace_100.png': texture, 'wrong/cardFace_10.png?v=3#hash': texture }, _loadedMap: {} },
    loader: { getRes: key => key === alias ? texture : null } };
  assert.equal(findNativeCardTexture(laya, 'cardFace_10'), null);
  laya.Loader._loadedMap[alias] = { backingResource: true };
  assert.equal(findNativeCardTexture(laya, 'cardFace_10'), texture);
});

test('card discovery visits known own display fields without invoking getters or inherited containers', t => {
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const registry = new CardStyleRegistry({ window: {}, document: {}, game: {}, settings: {}, scope });
  const card = id => ({ id, bmpFace: {}, SetCardFace() {}, getCardFaceBaseTexture() {}, updateNewCardFace() {} });
  const root = Object.create({ cardUIs: [card('inherited')] });
  Object.defineProperty(root, 'cardUis', { get() { assert.fail('discovery must not invoke a container getter'); } });
  root._children = [card('child')];
  root.cardUi = card('flat');
  const scanned = [];
  registry.scanCards([root], ui => scanned.push(ui.id));
  assert.deepEqual(scanned, ['child', 'flat']);
});

test('new native cards are styled synchronously at creation and pool checkout, without polling', t => {
  const scope = new ResourceScope(), data = new Map();
  const settings = {get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)};
  const texture = name => ({name, bitmap:{},width:93,height:130});
  const original=texture('original'), face=texture('face'), back=texture('back'), cache={};
  class CardUI {
    constructor() { this.bmpFace={texture:original};this.isNewCardUI=true; }
    SetCardFace() { this.bmpFace.texture=original; }
    getCardFaceBaseTexture() {} updateNewCardFace() {}
  }
  const pool = {T:CardUI,list:[],BorrowObject(){return this.list.pop() || new this.T();},returnObject(ui){this.list.push(ui);}};
  CardUI.flatPool=pool;CardUI.pool=pool;
  const nativeBorrow=pool.BorrowObject,nativeReturn=pool.returnObject;
  const hand={cardUis:[],createNormalCardUi(card){const ui=pool.BorrowObject();ui.theCard=card;ui.SetCardFace();return ui;}};
  const create=hand.createNormalCardUi;
  let sceneListener; const registry=new CardStyleRegistry({window:{Laya:{Texture(){},Texture2D(){},Loader:{textureMap:cache}}},document:{},game:{getSelfSeatUI:()=>({cardContainer:hand}),onSceneChange(fn){sceneListener=fn;return()=>{sceneListener=null;};}},settings,scope});
  t.after(()=>scope.dispose());const releases=[];
  nativeCards.activate({cardStyles:{register:s=>releases.push(registry.register(s,'native-cards'))}});registry.select('native-cards.general');
  // Resource discovery just failed. Creation must bypass that negative-cache delay.
  cache['atlas/cardFace_10.png']=face;cache['atlas/cardBack_5.png']=back;
  const first=hand.createNormalCardUi({IsEmpty:false});assert.equal(first.bmpFace.texture,face,'first card must be styled before factory return');hand.cardUis.push(first);
  const borrowed=pool.BorrowObject();borrowed.theCard={IsEmpty:true};borrowed.SetCardFace();assert.equal(borrowed.bmpFace.texture,back,'direct pool checkout must be hooked before assigning Card');
  pool.returnObject(borrowed);assert.equal(borrowed.bmpFace.texture,original);assert.equal(registry.bindings.has(borrowed),false);
  const reused=pool.BorrowObject();assert.equal(reused,borrowed);reused.theCard={IsEmpty:false};reused.SetCardFace();assert.equal(reused.bmpFace.texture,face);
  registry.select('');assert.equal(first.bmpFace.texture,original);assert.equal(reused.bmpFace.texture,original);assert.equal(hand.createNormalCardUi,create);assert.equal(pool.BorrowObject,nativeBorrow);assert.equal(pool.returnObject,nativeReturn);
  registry.select('native-cards.general');sceneListener();const external=function(){return 'external';};hand.createNormalCardUi=external;scope.dispose();assert.equal(hand.createNormalCardUi,external);assert.equal(pool.BorrowObject,nativeBorrow);assert.equal(sceneListener,null);
});

test('selected individual card images start loading in the lobby before their cards enter the scene', async t => {
  const scope = new ResourceScope(), data = new Map(), imageLoads = new Map();
  const settings = { get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, value) };
  class Image {
    complete = false;
    set src(url) { if (url) imageLoads.set(url, this); }
    finish() {
      this.complete = true;
      this.naturalWidth = 405;
      this.naturalHeight = 570;
      this.onload?.();
    }
  }
  class Texture2D {
    loadImageSource(image) { assert(image.complete); }
  }
  class Texture {
    constructor(bitmap) { this.bitmap = bitmap; }
    destroy() {}
  }
  const hand = { cardUis: [] };
  const registry = new CardStyleRegistry({ window: { Image, Laya: { Texture, Texture2D } }, document: {},
    game: { getSelfSeatUI: () => ({ cardContainer: hand }) }, settings, scope });
  t.after(() => scope.dispose());
  const url = 'data:image/png;base64,c2hh';
  registry.localFaces.set('Sha', { card: 'Sha', name: '杀', label: '杀', url });
  registry.refreshNative();
  assert.equal(imageLoads.size, 0, 'unselected custom images are not loaded');
  registry.selectSide('face', LOCAL_FACE_STYLE.id);
  const image = imageLoads.get(url);
  assert(image, 'decoding must start before a card is created');

  const original = { width: 93, height: 130 };
  const card = { theCard: { IsEmpty: false, ResName: 'Sha' }, isNewCardUI: true,
    bmpFace: { texture: original }, getCardFaceBaseTexture() { return original; }, updateNewCardFace() {},
    SetCardFace() { this.bmpFace.texture = original; } };
  hand.cardUis.push(card);
  registry.refreshNative();
  assert.equal(card.bmpFace.texture, original, 'an asset still decoding keeps the native card visible');
  assert.equal(imageLoads.get(url), image, 'entering the scene reuses the decoding image');
  image.finish();
  await Promise.resolve();
  assert.notEqual(card.bmpFace.texture, original, 'decode completion applies the art without a polling interval');
  const textured = card.bmpFace.texture;
  card.SetCardFace();
  assert.equal(card.bmpFace.texture, textured, 'a ready image is reused synchronously');
});

test('native cards: exact official resources, delayed cache, native refresh and borrowed ownership', async t => {
  const scope = new ResourceScope(), data = new Map(), cache = {};
  const settings = { get: (k,d) => data.has(k) ? data.get(k) : d, set: (k,v) => data.set(k,v) };
  const texture = name => ({ name, bitmap: {}, width: 93, height: 130, destroy() { assert.fail('must never destroy official textures'); } });
  const originalFace = texture('original face'), originalBack = texture('original back');
  const makeCard = empty => ({ theCard: { IsEmpty: empty }, isNewCardUI: true,
    bmpFace: { texture: empty ? originalBack : originalFace }, getCardFaceBaseTexture() {}, updateNewCardFace() {},
    SetCardFace() { this.bmpFace.texture = this.theCard.IsEmpty ? originalBack : originalFace; },
  });
  const cards = [makeCard(false), makeCard(true)];
  const loader = { textureMap: cache, cacheTexture(path, value) { cache[path] = value; } };
  const cacheTexture = loader.cacheTexture;
  const registry = new CardStyleRegistry({ window: { Laya: { Texture2D() {}, Texture() {}, Loader: loader } }, document: {},
    game: { getSelfSeatUI: () => ({cardContainer: {cardUis:cards}}) }, settings, scope });
  t.after(() => scope.dispose()); const releases = [];
  nativeCards.activate({cardStyles:{register:s=>releases.push(registry.register(s,'native-cards'))}});
  assert.deepEqual(registry.list().map(s=>s.native), [{face:'cardFace_0',back:'cardBack_0'},{face:'cardFace_10',back:'cardBack_5'}]);
  registry.select('native-cards.general');assert.match(registry.status,/等待官方/);assert.equal(cards[0].bmpFace.texture,originalFace);
  const face=texture('general face'),back=texture('general back');
  loader.cacheTexture('res/atlas/card/cardFace_10.png?v=2', face);
  await Promise.resolve();
  assert.equal(cards[0].bmpFace.texture,face,'late cache entry bypasses the previous miss and applies independently'); assert.equal(cards[1].bmpFace.texture,originalBack);
  loader.cacheTexture('res/atlas/card/cardBack_5.png', back);
  loader.cacheTexture('res/atlas/card/cardFace_0.png', originalFace);
  loader.cacheTexture('res/atlas/card/cardBack_0.png', originalBack);
  await Promise.resolve();
  assert.equal(cards[0].bmpFace.texture,face);assert.equal(cards[1].bmpFace.texture,back);
  cards[0].SetCardFace();assert.equal(cards[0].bmpFace.texture,face);assert.equal(face.width,93);
  cards[1].theCard.IsEmpty=false;cards[1].SetCardFace();assert.equal(cards[1].bmpFace.texture,face);
  registry.select('native-cards.classic');assert.equal(cards[0].bmpFace.texture,originalFace);
  registry.select('native-cards.general');releases.forEach(fn=>fn());assert.equal(cards[0].bmpFace.texture,originalFace);assert.equal(registry.textures.size,0);
  assert.equal(loader.cacheTexture, cacheTexture);
  assert.throws(()=>registry.register({id:'bad.x',name:'bad',native:{face:'https://x',back:'cardBack_0'}},'bad'),/原生/);
});

test('native cards: independent package and real manager disable/reload/update/rollback/uninstall', async t => {
  const dom=new JSDOM('',{url:'https://example.test/'}), scope=new ResourceScope(), settings=new Settings(dom.window.localStorage), rows=new Map();
  const registry=new CardStyleRegistry({window:dom.window,document:dom.window.document,game:{},settings,scope});
  const manager=new PluginManager({journal:new SessionJournal(),settings,store:{async list(){return [...rows.values()];},async put(r){rows.set(r.id,structuredClone(r));}},context:{window:dom.window,document:dom.window.document,cardStyles:registry,ui:{}}});
  t.after(()=>{manager.dispose();scope.dispose();dom.window.close();});manager.registerBuiltin(nativeCards);await manager.init();
  assert.equal(registry.list().length,2);registry.select('native-cards.general');await manager.disable('native-cards');assert.equal(registry.list().length,0);
  await manager.enable('native-cards');await manager.reload('native-cards');assert.equal(registry.list().length,2);assert.equal(registry.current,'native-cards.general');
  const bundle=await bundlePlugin('native-cards');assert(bundle.inputs.every(p=>p.startsWith('src/plugins/native-cards/')));
  const packet=await makePluginPackage(bundle);await verifyPackage(packet);await manager.install(packet);assert.equal(registry.list().length,2);
  await manager.rollback('native-cards');assert.equal(registry.list().length,2);await manager.uninstall('native-cards');assert.equal(registry.list().length,0);
});

test('card styles: standalone package, manager lifecycle, persisted selection and stale contexts', async t => {
  const dom=new JSDOM('',{url:'https://example.test/'}),scope=new ResourceScope(),settings=new Settings(dom.window.localStorage);
  const registry=new CardStyleRegistry({window:dom.window,document:dom.window.document,game:{},settings,scope});
  const records=new Map(),contexts=[];
  const manager=new PluginManager({journal:new SessionJournal(),settings,store:{async list(){return [...records.values()];},async put(r){records.set(r.id,structuredClone(r));}},context:{window:dom.window,document:dom.window.document,cardStyles:registry,ui:{registerPanel(){assert.fail('style pack must not own UI');}}}});
  t.after(()=>{manager.dispose();scope.dispose();dom.window.close();});
  manager.registerBuiltin({...gold,activate(ctx){contexts.push(ctx);return gold.activate(ctx);}});
  await manager.init();assert.equal(manager.list().length,1);assert.equal(registry.list().length,1);assert.equal(registry.current,'');
  const stale=contexts[0].cardStyles;stale.select('gold-cards.classic');stale.subscribe(()=>{});
  await manager.disable('gold-cards');assert.equal(registry.list().length,0);assert.equal(registry.listeners.size,0);assert.equal(registry.current,'gold-cards.classic');
  stale.select('');assert.equal(registry.current,'gold-cards.classic');stale.subscribe(()=>{});assert.equal(registry.listeners.size,0);
  stale.register({id:'gold-cards.stale'});assert.equal(registry.list().length,0);
  await manager.enable('gold-cards');await manager.reload('gold-cards');assert.equal(registry.list().length,1);
  assert.throws(()=>registry.select('missing'),/尚未启用/);assert.equal(registry.current,'gold-cards.classic');
  const bundle=await bundlePlugin('gold-cards');assert(bundle.inputs.every(p=>!p.startsWith('src/core/')&&!p.startsWith('src/plugins/cards/')));
  const packet=await makePluginPackage(bundle);await verifyPackage(packet);
  await manager.install(packet);assert.equal(registry.list().length,1);await manager.rollback('gold-cards');assert.equal(registry.list().length,1);
  await manager.uninstall('gold-cards');assert.equal(registry.list().length,0);
});

test('card styles: invalid data and duplicate IDs cannot partially register',t=>{
  const scope=new ResourceScope(),data=new Map(),settings={get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)};
  const registry=new CardStyleRegistry({window:{},document:{},game:{},settings,scope});t.after(()=>scope.dispose());
  assert.throws(()=>registry.register({id:'other.x',name:'x'},'gold-cards'),/ID/);
  let style;gold.activate({cardStyles:{register:s=>{style=s;}}});
  assert.throws(()=>registry.register({...style,back:{...style.back,base:'url(x)'}},'gold-cards'),/颜色/);assert.equal(registry.list().length,0);
  const release=registry.register(style,'gold-cards');assert.throws(()=>registry.register(style,'gold-cards'),/ID/);
  style.face.base='#ffffff';assert.notEqual(registry.list()[0].face.base,style.face.base);
  release();release();assert.equal(registry.list().length,0);
});

test('independent sides and self hand provenance survive table animations without styling opponents', t => {
  const scope = new ResourceScope(), data = new Map(), settings = {get:(k,d)=>data.has(k)?data.get(k):d,set:(k,v)=>data.set(k,v)};
  const texture = name => ({name,bitmap:{},width:93,height:130});
  const original=texture('original'),face=texture('face'),back=texture('back');
  const make = card => ({theCard:card,isNewCardUI:true,bmpFace:{texture:original},SetCardFace(){this.bmpFace.texture=original;},getCardFaceBaseTexture(){},updateNewCardFace(){}});
  const mine={CardId:12,IsEmpty:false}, other={CardId:13,IsEmpty:false};
  const ownUI=make(mine), otherUI=make(other), hand={cardUis:[ownUI]}, table={cardUis:[otherUI]};
  const scene={_children:[table]}, registry=new CardStyleRegistry({window:{Laya:{Texture(){},Texture2D(){},Loader:{textureMap:{'cardFace_0.png':face,'cardBack_0.png':back}}}},document:{},game:{getScene:()=>scene,getSelfSeatUI:()=>({cardContainer:hand})},settings,scope});
  t.after(()=>scope.dispose());registry.register({id:'test.style',name:'test',native:{face:'cardFace_0',back:'cardBack_0'}},'test');
  registry.selectSide('face','test.style');registry.selectScope('self');
  assert.equal(ownUI.bmpFace.texture,face);assert.equal(otherUI.bmpFace.texture,original);
  hand.cardUis=[]; const played=make({CardId:12,IsEmpty:false});table.cardUis.push(played);registry.refreshNative();assert.equal(played.bmpFace.texture,face);
  played.theCard.IsEmpty=true;played.SetCardFace();assert.equal(played.bmpFace.texture,original,'back remains independently native');
  registry.selectSide('back','test.style');assert.equal(played.bmpFace.texture,back);
  registry.selectScope('all');assert.equal(otherUI.bmpFace.texture,face);
  registry.selectScope('self');assert.equal(otherUI.bmpFace.texture,original);
  registry.selectSide('face','');assert.equal(registry.selection.back,'test.style');
});
