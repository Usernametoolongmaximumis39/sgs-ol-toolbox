import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundRegistry, backgroundSpec, containBackground } from '../src/core/backgrounds.js';
import { ResourceScope } from '../src/core/resources.js';
import { skinBackgroundSpec } from '../src/plugins/backgrounds/index.js';

test('portrait, landscape and square backgrounds preserve the entire image inside resized viewports', () => {
  for (const [w,h,vw,vh] of [[800,1200,1946,1234],[2400,1000,1200,850],[1000,1000,800,1200],[800,1200,850,500]]) {
    const f = containBackground(w,h,vw,vh);
    assert.equal(f.width / f.height, w / h);
    assert.ok(w*f.scale <= vw + 1e-9 && h*f.scale <= vh + 1e-9);
    assert.equal(f.x, (vw-w*f.scale)/2); assert.equal(f.y, (vh-h*f.scale)/2);
  }
  assert.equal(containBackground(0,1200,1200,850),null);
});

function fixture() {
  const scope = new ResourceScope(), data = new Map(), pending = [];
  const special = { visible: true, clicks: 0, click() { this.clicks++; } };
  let scene;
  const dispatcher = { _events: {} };
  const makeScene = () => ({ currentWeatherWallPaper: 0, image: 'personal', special,
    SetWallPaperById(id, url) { this.image = url || `personal-${id}`; },
    SetWallPaperByUrl(url) { this.image = url; },
    OnNormalWallPaperChange() { this.SetWallPaperById(7); },
    onWallPaperChange() { if (this.currentWeatherWallPaper) this.image = 'weather-' + this.currentWeatherWallPaper; else this.OnNormalWallPaperChange(); },
  });
  scene = makeScene();
  const handler = { caller: scene, method: scene.SetWallPaperById };
  dispatcher._events.BACKGROUND_USEDID_GOT = handler;
  const game = { getScene: () => scene, isInGame: () => Boolean(scene), getDispatcher: () => dispatcher };
  const effects = [];
  class Sprite { constructor(){this.graphics={clear(){},drawTexture(){},drawRect(){}};} addChild(){} size(){} pos(){} scale(){} destroy(){this.destroyed=true;} }
  class Effect extends Sprite {
    constructor(){super();this.events={};this.plays=0;effects.push(this);}
    on(event,caller,fn){this.events[event]={caller,fn};} once(...args){this.on(...args);} off(event){delete this.events[event];}
    InitEffect(url,name,loop){Object.assign(this,{url,name,loop});} playEffect(){this.plays++;} stop(){this.stopped=true;}
    event(event){const h=this.events[event];if(h)h.fn.call(h.caller,this);}
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
  return { scope, registry, release, handler, special, stage, layer, pending, effects, get scene() { return scene; },
    select: (url = 'res/skin.png') => registry.select('backgrounds', { name: '皮肤', url }),
    finish: (index = pending.length - 1, ok = {}) => pending[index].fn(ok),
    next: () => { scene = makeScene(); registry.refresh(); },
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
    assert.deepEqual(f.effects.map(e=>[e.url,e.name,e.loop]),[['res/animate/skinEffectNew/123/beijing.json',0,true],['res/animate/skinEffectNew/123/daiji.json','DaiJi',true],['res/animate/skinEffectNew/123/qianjing.json','DaiJi',true]]);
    assert.match(f.registry.status,/正在加载动态/);
    for(const e of f.effects)e.event('start');f.registry.refresh();assert.equal(f.registry.status,'动态牌局背景已启用');
    const counts=f.effects.map(e=>e.plays);f.registry.refresh();assert.deepEqual(f.effects.map(e=>e.plays),counts);
    f.scene.SetWallPaperByUrl('res/skill.png');assert.ok(f.effects.every(e=>e.stopped));
    f.registry.select('backgrounds',{...f.registry.current,animated:false});f.finish();assert.equal(f.scene.image,'res/skill.png','switching does not dismiss active skill');
    assert.ok(f.effects.every(e=>e.destroyed));assert.equal(f.registry.binding.motion,undefined);
    f.scene.onWallPaperChange();assert.equal(f.scene.image,'res/skin.png');f.release();assert.equal(f.scene.image,'personal-7');
  }finally{f.scope.dispose();}
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
