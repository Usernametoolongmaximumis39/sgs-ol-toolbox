import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BackgroundRegistry, backgroundSpec, containBackground } from '../src/core/backgrounds.js';
import { createBackgroundMotion } from '../src/core/background-motion.js';
import { ResourceScope } from '../src/core/resources.js';
import { activate as activateBackgrounds, skinBackgroundSpec } from '../src/plugins/backgrounds/index.js';

test('portrait, landscape and square backgrounds preserve the entire image inside resized viewports', () => {
  for (const [w,h,vw,vh] of [[800,1200,1946,1234],[2400,1000,1200,850],[1000,1000,800,1200],[800,1200,850,500]]) {
    const f = containBackground(w,h,vw,vh);
    assert.equal(f.width / f.height, w / h);
    assert.ok(w*f.scale <= vw + 1e-9 && h*f.scale <= vh + 1e-9);
    assert.equal(f.x, (vw-w*f.scale)/2); assert.equal(f.y, (vh-h*f.scale)/2);
  }
  assert.equal(containBackground(0,1200,1200,850),null);
});

test('video background updates once per decoded frame and refreshes when resuming', async t => {
  for (const source of ['video callback', 'frame counter', 'media time']) await t.test(source, t => {
    const scope = new ResourceScope();
    t.after(() => scope.dispose());
    let repaint = 0, upload = 0, render, request = 0, totalVideoFrames = 1;
    const callbacks = new Map();
    class Video extends EventTarget {
      readyState = 2;
      currentTime = 1;
      videoWidth = 320;
      videoHeight = 180;
      play() { return Promise.resolve(); }
      pause() {}
      removeAttribute() {}
      load() {}
    }
    const video = new Video();
    if (source === 'video callback') {
      video.requestVideoFrameCallback = callback => { callbacks.set(++request, callback); return request; };
      video.cancelVideoFrameCallback = id => callbacks.delete(id);
    } else if (source === 'frame counter') video.getVideoPlaybackQuality = () => ({ totalVideoFrames });
    class Sprite {
      graphics = { clear() {}, drawTexture() {} };
      size() {}
      destroy() {}
      repaint() { repaint++; }
    }
    const Laya = { Sprite, Rectangle: class {},
      Texture: class { setTo() {} destroy() {} },
      VideoTexture: class { _updateVideoData() { upload++; } videoPause() {} destroy() {} },
      timer: { frameLoop(n, owner, fn) { render = fn; }, clear() { render = null; } },
    };
    const layer = { bgSprite: {}, getChildIndex: () => 0, addChildAt() {} };
    const motion = createBackgroundMotion({ window: { Laya, document: { createElement: () => video } }, layer, scope,
      spec: { kind: 'video', url: 'res/skin.mp4' }, size: { width: 320, height: 180 }, ready() {}, fail: assert.fail });
    video.dispatchEvent(new Event('loadeddata'));
    motion.show(true);
    for (let i = 0; i < 60; i++) render();
    assert.deepEqual([upload, repaint], [1, 1]);

    if (source === 'video callback') {
      for (let i = 0; i < 2; i++) {
        const [id, callback] = callbacks.entries().next().value;
        callbacks.delete(id);
        callback();
      }
    } else if (source === 'frame counter') {
      video.currentTime += 0.05;
      render();
      assert.equal(upload, 1, 'time can advance without another decoded frame');
      totalVideoFrames++;
    } else video.currentTime += 0.05;
    render();
    render();
    assert.deepEqual([upload, repaint], [2, 2]);

    motion.show(false);
    assert.equal(callbacks.size, 0);
    render();
    assert.equal(upload, 2);
    motion.show(true);
    render();
    assert.deepEqual([upload, repaint], [3, 3]);
    scope.dispose();
    assert.equal(callbacks.size, 0);
    assert.equal(render, null);
  });
});

test('the skin background shortcut checks the switch and native popup cache before scanning', t => {
  const { window } = new JSDOM('<body><canvas></canvas></body>');
  const scope = new ResourceScope();
  t.after(() => { scope.dispose(); window.close(); });
  let visits = 0, refresh, enabled = false, cache;
  const stage = { width: 200, get _children() { visits++; return [detail]; } };
  const detail = { parent: stage, isHor: true, visible: true, showMaxSkinWindow() {}, updateSkinInfo() {},
    skinImg: { width: 160, height: 90, localToGlobal: p => p },
    skinData: { skinBaseVo: { SkinBigUrl: () => 'res/skin.png' } } };
  const canvas = window.document.querySelector('canvas');
  canvas.getBoundingClientRect = () => ({ width: 200, left: 0, top: 0 });
  window.Laya = { stage, Render: { canvas }, Point: class { constructor(x, y) { Object.assign(this, { x, y }); } },
    loader: { getRes: () => ({ width: 160, height: 90 }) } };
  const game = { getDispatcher: () => cache && { _events: { OPEN_WINDOW: { caller: { WindowInstanceDict: cache } } } } };
  scope.interval = (fn, interval) => { if (interval === 200) refresh = fn; };
  activateBackgrounds({ window, document: window.document, scope, game, settings: { get: (key, fallback) => fallback },
    backgrounds: { register() {}, skinShortcutEnabled: () => enabled },
    ui: { nativeTheme: { watch() {} }, registerPanel() {} } });
  const floating = window.document.querySelector('.bg-skin-action');
  visits = 0;
  refresh();
  assert.equal(visits, 0);
  assert.equal(floating.hidden, true);
  enabled = true;
  cache = { getStringKey: () => null };
  refresh();
  assert.equal(visits, 0);
  assert.equal(floating.hidden, true);
  cache = { getStringKey: () => detail };
  refresh();
  assert.equal(visits, 0);
  assert.equal(floating.hidden, false);
  detail.visible = false;
  refresh();
  assert.equal(floating.hidden, true);
  assert.equal(visits, 0);
  detail.visible = true;
  cache = undefined;
  refresh();
  assert.equal(visits, 1);
  assert.equal(floating.hidden, false);
});

function fixture() {
  const scope = new ResourceScope(), data = new Map(), pending = [];
  class Seat {
    events = new Map();
    on(name, caller, fn) { this.events.set(name, { caller, fn }); }
    off(name, caller, fn) {
      const handler = this.events.get(name);
      if (handler?.caller === caller && handler.fn === fn) this.events.delete(name);
    }
    event(name, ...args) { const handler = this.events.get(name); handler?.fn.apply(handler.caller, args); }
  }
  const cards = new Map();
  const special = { visible: true, clicks: 0, click() { this.clicks++; } };
  let scene;
  const dispatcher = { _events: {} };
  const makeScene = () => ({ currentWeatherWallPaper: 0, image: 'personal', special, SelfSeatUi: { seat: new Seat() },
    SetWallPaperById(id, url) { this.image = url || `personal-${id}`; },
    SetWallPaperByUrl(url) { this.image = url; },
    OnNormalWallPaperChange() { this.SetWallPaperById(7); },
    onWallPaperChange() { if (this.currentWeatherWallPaper) this.image = 'weather-' + this.currentWeatherWallPaper; else this.OnNormalWallPaperChange(); },
  });
  scene = makeScene();
  const handler = { caller: scene, method: scene.SetWallPaperById };
  dispatcher._events.BACKGROUND_USEDID_GOT = handler;
  const game = { getScene: () => scene, isInGame: () => typeof scene?.SetWallPaperById === 'function', getDispatcher: () => dispatcher,
    getSelfSeatUI: () => scene.SelfSeatUi, getCardMeta: id => cards.get(id) };
  const effects = [];
  class Sprite {
    constructor() { this.children=[]; this.visible=true; this.graphics={clear(){},drawTexture(){},drawRect(){}}; }
    addChild(child) { this.children.push(child); }
    addChildAt(child, index) { this.children.splice(index, 0, child); }
    getChildIndex(child) { return this.children.indexOf(child); }
    size() {} pos() {} scale() {} destroy() { this.destroyed=true; }
  }
  class Effect extends Sprite {
    static SPINE_EFFECT_LOAD_COMPLETE = 'spine-ready';
    AutoStart = true;
    constructor(){super();this.events={};this.plays=0;effects.push(this);}
    on(event,caller,fn){this.events[event]={caller,fn};}
    once(event,caller,fn){this.events[event]={caller,fn,once:true};}
    off(event){delete this.events[event];}
    InitEffect(url,name,loop){Object.assign(this,{url,name,loop});}
    playEffect(){this.plays++;this.stopped=false;if(this.templet)this.event('start');}
    stop(){this.stopped=true;}
    load(names = ['ChuChang', 'DaiJi']) {
      if (this.AutoStart) this.event('start');
      else {
        this.templet = { skeletonData: { animations: names.map(name => ({ name })) } };
        this.event(Effect.SPINE_EFFECT_LOAD_COMPLETE);
      }
    }
    event(event){const h=this.events[event];if(h?.once)this.off(event);if(h)h.fn.call(h.caller,this);}
  }
  const layer={bgSprite:{},updateBgSize(){},bgLoadComplete(){},O(){},addChildAt(){},getChildIndex(){return 0;}};
  layer.SetBgLiveEffect=function(url){this.bgLiveEffect=new Effect();this.addChild(this.bgLiveEffect);this.bgLiveEffect.on('start',this,this.beforeLiveStart);this.bgLiveEffect.InitEffect(url,0,true);this.bgLiveEffect.playEffect();this.layoutBgLiveEffect();};
  layer.wt=function(url,name){this.bgEffect=new Effect();this.addChild(this.bgEffect);this.bgEffect.on('start',this,this.beforeStart);this.bgEffect.InitEffect(url,name,true);this.bgEffect.playEffect();this.layoutBgEffect();};
  const stage={_children:[layer]};
  const registry = new BackgroundRegistry({ scope, game,
    settings: { get: (k, d) => data.has(k) ? data.get(k) : d, set: (k, v) => data.set(k, v) },
    window: { SystemContext:{gameWidth:1200,gameHeight:850}, Laya: { stage, Sprite, Rectangle:class {}, Handler: { create: (_, fn) => fn }, loader: { load: (url, fn) => pending.push({ url, fn }) } } },
  });
  const release = registry.register('backgrounds');
  return { scope, registry, release, handler, special, stage, layer, pending, effects, cards, Seat, get scene() { return scene; },
    select: (url = 'res/skin.png') => registry.select('backgrounds', { name: '皮肤', url }),
    finish: (index = pending.length - 1, ok = {}) => pending[index].fn(ok),
    next: () => { scene = makeScene(); registry.refresh(); },
    changeScene: next => { scene = next; },
  };
}

test('ordinary personalization replaced, cached Laya listener redirected, Pei Xiu interactive child untouched', () => {
  const f = fixture(); try {
    const original = f.handler.method; f.select(); assert.equal(f.scene.image, 'personal'); f.finish();
    assert.equal(f.scene.image, 'res/skin.png');
    assert.equal(f.handler.method, f.scene.SetWallPaperById, 'native off retains exact method identity');
    f.handler.method.call(f.scene, 99); assert.equal(f.scene.image, 'res/skin.png');
    assert.equal(f.scene.special, f.special); f.special.click(); assert.equal(f.special.clicks, 1); assert.equal(f.special.visible, true);
    f.release(); assert.equal(f.scene.image, 'personal-7'); assert.equal(f.handler.method, original);
  } finally { f.scope.dispose(); }
});

function globalFixture() {
  const f = fixture();
  const battle = f.scene, writes = [], fills = [];
  const skin = { skin: 'res/hall.png', visible: true,
    size(w, h) { this.width = w; this.height = h; }, posInteger(x, y) { this.position = [x, y]; }, scale(x) { this.zoom = x; } };
  Object.assign(f.layer, {
    bg: skin, scrollRect: { width: 1000, height: 800 },
    tt(...args) { writes.push(args); skin.skin = args[0]; this.updateBgSize(); },
    addChildAt(fill) { fills.push(fill); },
  });
  const original = f.layer.tt;
  battle.SetWallPaperByUrl = url => f.layer.tt(url);
  battle.SetWallPaperById = (id, url) => f.layer.tt(url || `res/battle-${id}.png`);
  const scene = SceneName => f.changeScene({ SceneName });
  scene('LobbyScene');
  return { ...f, battle, writes, fills, skin, original, scene, enable: value => f.registry.setGlobalBackground('backgrounds', value) };
}

test('global mode is opt-in, preserves the latest native tt arguments and restores them on every exit path', t => {
  const f = globalFixture();
  t.after(() => f.scope.dispose());
  f.select();
  assert.equal(f.registry.globalBackground, false);
  assert.equal(f.registry.status, '已保存，等待进入牌局');
  assert.equal(f.pending.length, 0);
  f.enable(true);
  f.finish(undefined, { width: 2000, height: 1000 });
  assert.equal(f.skin.skin, 'res/skin.png');
  assert.equal(f.registry.status, '静态全局背景已启用');
  assert.equal(f.skin.zoom, .5);
  assert.equal(f.fills[0].visible, true);
  f.layer.scrollRect.width = 1200;
  f.layer.updateBgSize();
  assert.equal(f.skin.zoom, .6);
  f.scene('RoomScene');
  f.layer.tt('res/room.png', true, false);
  f.registry.refresh();
  assert.equal(f.skin.skin, 'res/skin.png');
  assert.equal(f.fills.length, 1);
  f.enable(false);
  assert.equal(f.skin.skin, 'res/room.png');
  assert.deepEqual(f.writes.at(-1), ['res/room.png', true, false]);
  assert.equal(f.layer.tt, f.original);
  assert.equal(f.fills[0].destroyed, true);
  f.layer.tt('res/practice.png', false, true);
  f.enable(true);
  f.layer.tt('res/updated-practice.png', true, true);
  f.registry.select('backgrounds', null);
  assert.deepEqual(f.writes.at(-1), ['res/updated-practice.png', true, true]);
  assert.equal(f.registry.status, '跟随游戏背景');
  f.select(); f.finish();
  f.layer.tt('res/mode.png', false, true);
  f.release();
  assert.deepEqual(f.writes.at(-1), ['res/mode.png', false, true]);
  assert.equal(f.layer.tt, f.original);
});

test('global mode leaves startup scenes alone and hands the shared layer over to battle and back', t => {
  const f = globalFixture();
  t.after(() => f.scope.dispose());
  f.enable(true);
  for (const name of ['LoginScene', 'LoadingScene', 'CreateUserScene', 'CreateRoleScene', 'MainNullScene']) {
    f.scene(name);
    f.select();
    assert.equal(f.pending.length, 0);
    assert.equal(f.layer.tt, f.original);
  }
  f.scene('LobbyScene');
  f.registry.refresh();
  f.finish();
  f.layer.tt('res/latest-hall.png', false, true);
  f.writes.length = 0;
  f.changeScene(f.battle);
  f.registry.refresh();
  assert.deepEqual(f.writes, [['res/skin.png']], 'entering battle does not replay the lobby background');
  assert.equal(f.registry.status, '静态牌局背景已启用');
  f.battle.SetWallPaperById(10, 'res/skill.png');
  f.registry.refresh();
  assert.equal(f.skin.skin, 'res/skill.png');
  assert.equal(f.registry.status, '技能背景优先');
  f.battle.OnNormalWallPaperChange();
  f.registry.refresh();
  f.scene('LobbyScene');
  f.layer.tt('res/next-hall.png', true, false);
  f.registry.refresh();
  assert.equal(f.registry.status, '静态全局背景已启用');
  assert.equal(f.skin.skin, 'res/skin.png');
  f.scene('LoadingScene');
  f.layer.tt('res/loading.png');
  f.registry.refresh();
  assert.equal(f.skin.skin, 'res/loading.png');
  assert.equal(f.layer.tt, f.original);
  f.changeScene(f.battle);
  f.registry.refresh();
  f.layer.tt('res/early-room.png', true, true);
  f.scene('RoomScene');
  f.registry.refresh();
  assert.equal(f.skin.skin, 'res/skin.png');
  f.enable(false);
  assert.deepEqual(f.writes.at(-1), ['res/early-room.png', true, true]);
});

test('global mode reuses local texture URLs and official wallpaper motion', t => {
  const f = globalFixture();
  t.after(() => f.scope.dispose());
  const url = 'blob:null/test-local#://';
  const revoked = [];
  f.registry.window.URL = { revokeObjectURL: value => revoked.push(value) };
  f.registry.settings.set('battleBackground', { name: '本地', owner: 'backgrounds', localImageId: 7 });
  f.registry.localImage = { id: 7, url, objectUrl: 'blob:null/test-local' };
  f.enable(true);
  assert.equal(f.pending.at(-1).url, url);
  f.finish(undefined, { width: 1200, height: 900 });
  assert.equal(f.skin.skin, url);
  f.registry.select('backgrounds', { name: '官图', url: 'res/wallpaper.png', officialWallpaper: true,
    wallpaperMotion: { kind: 'spine', url: 'res/wallpaper.sk' } });
  assert.deepEqual(revoked, ['blob:null/test-local']);
  f.layer.layoutBgLiveEffect = () => {};
  f.finish(undefined, { width: 1600, height: 900 });
  const effect = f.effects.at(-1);
  assert.equal(effect.url, 'res/wallpaper.sk');
  effect.load();
  assert.equal(f.registry.status, '动态全局背景已启用');
  f.enable(false);
  assert.equal(f.skin.skin, 'res/hall.png');
  assert.equal(effect.destroyed, true);
});

const dynamic = {kind:'spine',url:'res/animate/skinEffectNew/123',modern:true,width:594,height:335};
test('dynamic capability and resource forms never read skin or dynamic ownership', () => {
  const vo={skinID:123,skinname:'动态皮肤',SkinBigUrl:s=>`res/static/123_${s}.png`,canUpdateDynamic:()=>true,DynamicSkinBigUrl:'res/video/123',DynamicSkinBigSkeletonUrl:'res/dynamic/123',DynamicSkinBigSkeletonUrlNew:s=>`res/new/123_${s}`,NewSkinJudge:2,ManyPeopleResourceList:['role1','role2']};
  const owner={skinData:{skinBaseVo:vo},juexingState:2,skinImg:{width:594,height:335}};
  for(const key of ['ownNum','isOwnDynamic','isTryOwnDynamic','isUseDynamic']) Object.defineProperty(owner,key,{get(){throw Error('must not read ownership');}});
  for(const [type,kind,part] of [[1,'video','video/123.mp4'],[2,'bone','dynamic/123'],[3,'spine','new/123_2'],[4,'spine','dynamic/123']]){
    vo.ResType=type;const s=skinBackgroundSpec(owner);assert.equal(s.dynamic.kind,kind);assert.equal(s.dynamic.url,'res/'+part);assert.equal(s.animated,true);assert.doesNotThrow(()=>backgroundSpec(s));
  }
  vo.canUpdateDynamic=()=>false;assert.equal(skinBackgroundSpec(owner).dynamic,null);
  vo.IsManyStateDyskin=true;assert.ok(skinBackgroundSpec(owner).dynamic);
  assert.equal(skinBackgroundSpec(owner,false).animated,false);
  vo.ResType=3;
  assert.equal(skinBackgroundSpec(owner).dynamic.attack,true);
  vo.HasGongJi=false;
  assert.equal(backgroundSpec(skinBackgroundSpec(owner)).dynamic.attack,false);
  vo.HasGongJi=true; vo.IsChuChangOnlyDySkin=true;
  assert.equal(skinBackgroundSpec(owner).dynamic.attack,false);
  assert.equal(skinBackgroundSpec(owner,true,false).attackEffects,false);
});

test('dynamic metadata rejects invalid sizes, traversal, duplicate and excessive layers', () => {
  const base={name:'x',url:'res/x.png',dynamic};
  assert.equal(backgroundSpec(base).animated,true);
  for(const d of [{width:0},{height:Infinity},{parts:['../bad']},{parts:['a','a']},{parts:['beijing']},{kind:'html'},{url:'javascript:x'}]) assert.throws(()=>backgroundSpec({...base,dynamic:{...dynamic,...d}}));
});

test('dynamic lifecycle loads all layers, pauses for skills and cleans on toggle/disable', () => {
  const f=fixture();try{
    f.layer.bg={skin:'res/skin.png',size(){},posInteger(){},scale(){}};
    f.registry.select('backgrounds',{name:'皮肤',url:'res/skin.png',dynamic});f.finish(undefined,{width:1600,height:900});
    assert.equal(f.effects.length,3);assert.equal(f.layer.bgLiveEffect,undefined,'shared native effect remains untouched');
    assert.deepEqual(f.effects.map(e=>[e.url,e.name,e.loop]),[['res/animate/skinEffectNew/123/beijing.json','DaiJi',true],['res/animate/skinEffectNew/123/daiji.json','DaiJi',true],['res/animate/skinEffectNew/123/qianjing.json','DaiJi',true]]);
    assert.match(f.registry.status,/正在加载动态/);
    for(const e of f.effects)e.load();f.registry.refresh();assert.equal(f.registry.status,'动态牌局背景已启用');
    const counts=f.effects.map(e=>e.plays);f.registry.refresh();assert.deepEqual(f.effects.map(e=>e.plays),counts);
    f.scene.SetWallPaperByUrl('res/skill.png');assert.ok(f.effects.every(e=>e.stopped));
    f.registry.select('backgrounds',{...f.registry.current,animated:false});f.finish();assert.equal(f.scene.image,'res/skill.png','switching does not dismiss active skill');
    assert.ok(f.effects.every(e=>e.destroyed));assert.equal(f.registry.binding.motion,undefined);
    f.scene.onWallPaperChange();assert.equal(f.scene.image,'res/skin.png');f.release();assert.equal(f.scene.image,'personal-7');
  }finally{f.scope.dispose();}
});

test('global skin animation plays without subscribing to any battle attack events', t => {
  const f = globalFixture();
  t.after(() => f.scope.dispose());
  f.enable(true);
  f.registry.select('backgrounds', { name: '皮肤', url: 'res/skin.png', dynamic: { ...dynamic, attack: true } });
  f.finish(undefined, { width: 1600, height: 900 });
  for (const effect of f.effects) effect.load();
  f.registry.refresh();
  assert.equal(f.registry.status, '动态全局背景已启用');
  assert.equal(f.battle.SelfSeatUi.seat.events.size, 0);
  f.enable(false);
  assert.ok(f.effects.every(effect => effect.destroyed));
  assert.equal(f.skin.skin, 'res/hall.png');
});

test('modern backgrounds use the loaded stable clip and stay hidden when only entrance is available', () => {
  for (const [clips, expected] of [
    [['ChuChang', 'DaiJi'], 'DaiJi'],
    [['ChuChang', 'play'], 'play'],
    [['beijing'], 'beijing'],
    [['ChuChang'], undefined],
  ]) {
    const f = fixture();
    try {
      f.layer.bg = { skin: 'res/skin.png', size() {}, posInteger() {}, scale() {} };
      f.registry.select('backgrounds', { name: '皮肤', url: 'res/skin.png', dynamic });
      f.finish();
      const [background, role, foreground] = f.effects;
      assert.equal(background.AutoStart, false);
      f.scene.SetWallPaperByUrl('res/skill.png');
      background.load(clips);
      role.load();
      foreground.load();
      assert.equal(f.registry.status, '技能背景优先');
      assert.ok(role.stopped && foreground.stopped);
      const plays = background.plays;
      if (expected) {
        assert.equal(background.name, expected);
        assert.equal(background.loop, true);
        assert.ok(background.stopped);
      } else {
        assert.equal(background.visible, false);
        assert.equal(plays, 1, 'only the load request ran');
      }
      f.scene.onWallPaperChange();
      f.registry.refresh();
      assert.equal(f.registry.status, '动态牌局背景已启用');
      assert.equal(background.plays, plays + Number(Boolean(expected)));
      if (expected) assert.equal(background.name, expected);
    } finally { f.scope.dispose(); }
  }
});

test('dynamic load failures keep static background and ignore late animation starts',()=>{
  const f=fixture();try{
    f.layer.bg={skin:'res/skin.png',size(){},posInteger(){},scale(){}};
    f.registry.select('backgrounds',{name:'皮肤',url:'res/skin.png',dynamic});f.finish(undefined,{width:1600,height:900});
    f.effects[1].event('error');assert.match(f.registry.status,/失败，已显示静态/);assert.equal(f.scene.image,'res/skin.png');
    for(const e of f.effects)e.event('start');assert.match(f.registry.status,/失败/);assert.ok(f.effects.every(e=>e.destroyed));
    f.release();assert.equal(f.scene.image,'personal-7');
  }finally{f.scope.dispose();}
});

test('native self-seat card use triggers only background attack clips and restores idle layers', async () => {
  const f = fixture();
  try {
    f.layer.bg={skin:'res/skin.png',size(){},posInteger(){},scale(){}};
    f.cards.set(1, { firstSkillId: 1, name: '杀' });
    f.cards.set(2, { name: '万箭齐发' });
    f.cards.set(3, { firstSkillId: 7, name: '杀' });
    f.registry.select('backgrounds', { name: '皮肤', url: 'res/skin.png', dynamic });
    f.finish(undefined, { width: 1600, height: 900 });
    const seat = f.scene.SelfSeatUi.seat;
    seat.event('USE_CARD', 1, 1);
    assert.equal(f.effects.length, 3, 'waits for the idle animation to load');
    const idle = f.effects.slice();
    for (const effect of idle) effect.load();
    seat.event('USE_CARD', 1, 2);
    seat.event('USE_CARD', 3, 1);
    seat.event('USE_SKILL_CARD', 11112, 2);
    new f.Seat().event('USE_CARD', 1, 1);
    assert.equal(f.effects.length, 3);

    seat.event('USE_CARD', 1, 1);
    const [main, foreground] = f.effects.slice(3);
    assert.deepEqual([main, foreground].map(e => [e.url.split('/').at(-1), e.name, e.loop]),
      [['xingxiang.json', 'GongJi', false], ['qianjing.json', 'GongJi', false]]);
    main.event('start'); foreground.event('start');
    assert.deepEqual(idle.map(e => e.visible), [true, false, false]);
    seat.event('USE_CARD', 2, 1);
    assert.equal(f.effects.length, 5, 'overlapping attacks do not restart a clip');
    foreground.event('PLAY_NAME_LOSE'); await Promise.resolve();
    assert.equal(foreground.destroyed, true);
    assert.deepEqual(idle.map(e => e.visible), [true, false, true]);
    main.event('stopped'); await Promise.resolve();
    assert.equal(main.destroyed, true);
    assert.ok(idle.every(e => e.visible));

    seat.event('USE_CARD', 2, 1);
    const binding = f.registry.binding;
    const second = f.effects.at(-1);
    f.registry.setAttackEffects('backgrounds', false);
    assert.equal(f.registry.binding, binding, 'toggling keeps the current idle players');
    assert.equal(second.destroyed, true);
    assert.equal(seat.events.size, 0);
    assert.equal(f.registry.current.attackEffects, false);
    second.event('start');
    assert.ok(idle.every(e => e.visible));

    f.registry.setAttackEffects('backgrounds', true);
    seat.event('USE_SKILL_CARD', 11111, 1);
    assert.equal(f.effects.length, 7);
    f.scene.SetWallPaperByUrl('res/skill.png');
    assert.equal(f.effects.at(-1).destroyed, true);
    seat.event('USE_CARD', 1, 1);
    assert.equal(f.effects.length, 7);
    f.scene.onWallPaperChange();
    f.scene.SelfSeatUi.seat = new f.Seat();
    seat.event('USE_CARD', 1, 1);
    assert.equal(f.effects.length, 7);
    f.registry.refresh();
    assert.equal(seat.events.size, 0);
    f.scene.SelfSeatUi.seat.event('USE_SKILL_CARD', 9, 1);
    assert.equal(f.effects.length, 8);
    f.release();
    assert.ok(f.effects.every(e => e.destroyed));
    assert.equal(f.scene.SelfSeatUi.seat.events.size, 0);
  } finally { f.scope.dispose(); }
});

test('current layer uses its clip size and bone factory without legacy globals or setters', () => {
  const f = fixture();
  try {
    delete f.registry.window.SystemContext;
    delete f.layer.O;
    f.layer.Ci = f.layer.wt; delete f.layer.wt;
    f.layer.scrollRect = { width: 1200, height: 850 };
    const bounds = {};
    f.layer.bg = {
      skin: 'res/skin.png',
      size(width, height) { Object.assign(bounds, { width, height }); },
      scale(scale) { bounds.scale = scale; },
      posInteger(x, y) { Object.assign(bounds, { x, y }); },
    };
    f.registry.select('backgrounds', { name: '皮肤', url: 'res/skin.png',
      dynamic: { kind: 'bone', url: 'res/bone', width: 1600, height: 900 } });
    f.finish(undefined, { width: 800, height: 1200 });
    assert.equal(f.scene.image, 'res/skin.png');
    assert.deepEqual(bounds, { width: 800, height: 1200, scale: 850 / 1200, x: (1200 - 800 * (850 / 1200)) / 2, y: 0 });
    assert.equal(f.effects.length, 1);
    f.effects[0].event('start'); f.registry.refresh();
    assert.equal(f.registry.status, '动态牌局背景已启用');
    f.layer.scrollRect = { width: 900, height: 600 };
    f.layer.updateBgSize();
    assert.deepEqual(bounds, { width: 800, height: 1200, scale: 0.5, x: 250, y: 0 });
    f.release();
    assert.equal(f.scene.image, 'personal-7');
  } finally { f.scope.dispose(); }
});

test('weather begins/ends, direct skill URL yields until normal restoration, disabling during skill does not redraw', () => {
  const f = fixture(); try {
    f.select(); f.finish();
    for (const skill of [123, 456]) {
      f.scene.currentWeatherWallPaper = skill; f.scene.onWallPaperChange(); f.registry.refresh();
      assert.equal(f.scene.image, 'weather-' + skill); assert.equal(f.registry.status, '技能背景优先');
      f.scene.currentWeatherWallPaper = 0; f.scene.onWallPaperChange(); assert.equal(f.scene.image, 'res/skin.png');
    }
    f.scene.SetWallPaperByUrl('skill.png'); f.registry.refresh(); assert.equal(f.scene.image, 'skill.png');
    f.scene.SetWallPaperById(8); assert.equal(f.scene.image, 'personal-8');
    f.scene.onWallPaperChange(); assert.equal(f.scene.image, 'res/skin.png');
    f.scene.currentWeatherWallPaper = 9; f.scene.onWallPaperChange(); f.release(); assert.equal(f.scene.image, 'weather-9');
  } finally { f.scope.dispose(); }
});

test('stale loads, load failure, late completion after disable, scene change and third-party wrapping', () => {
  const f = fixture(); try {
    f.select('res/a.png'); f.select('res/b.png'); f.finish(0); assert.equal(f.scene.image, 'personal');
    f.finish(1, null); assert.match(f.registry.status, /失败/); assert.equal(f.scene.image, 'personal');
    f.select('res/b.png'); f.finish(); assert.equal(f.scene.image, 'res/b.png');
    const wrapped = f.scene.SetWallPaperById; const other = function (...args) { return wrapped.apply(this, args); }; f.scene.SetWallPaperById = other;
    f.release(); assert.equal(f.scene.SetWallPaperById, other); f.scene.SetWallPaperById(6); assert.equal(f.scene.image, 'personal-6');
    const release = f.registry.register('backgrounds'); f.finish(); f.next(); assert.equal(f.scene.image, 'res/b.png');
    f.select('res/c.png'); release(); f.finish(); assert.notEqual(f.scene.image, 'res/c.png');
  } finally { f.scope.dispose(); }
});

test('background URLs and metadata are validated', () => {
  assert.throws(() => backgroundSpec({ name: 'x', url: 'javascript:alert(1)' }));
  assert.throws(() => backgroundSpec({ name: 'x', url: 'https://user:pass@example.com/x' }));
  assert.throws(() => backgroundSpec({ name: '', url: 'res/x.png' }));
});

test('late layer, partial attach failure and failed download recover without reactivating provider',()=>{
 const f=fixture();try {
  f.stage._children=[];f.select();f.finish();assert.equal(f.registry.binding,null);
  assert.match(f.registry.status,/等待游戏背景层/);
  f.stage._children=[f.layer];const add=f.layer.addChildAt;f.layer.addChildAt=()=>{throw Error('not ready');};
  f.registry.refresh();assert.equal(f.registry.binding,null);assert.equal(f.registry.providers.has('backgrounds'),true);
  f.layer.addChildAt=add;f.registry.retryAt=0;f.registry.refresh();assert.equal(f.scene.image,'res/skin.png');
  f.select('res/retry.png');f.finish(undefined,null);const count=f.pending.length;f.registry.refresh();assert.equal(f.pending.length,count);
  f.registry.retryAt=0;f.registry.refresh();assert.equal(f.pending.length,count+1);f.finish();assert.equal(f.scene.image,'res/retry.png');
  f.select('res/cancel.png');f.finish(undefined,null);f.release();f.registry.retryAt=0;f.registry.refresh();assert.equal(f.registry.binding,null);
 } finally {f.scope.dispose();}
});
