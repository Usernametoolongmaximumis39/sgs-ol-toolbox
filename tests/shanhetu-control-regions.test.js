import test from 'node:test';
import assert from 'node:assert/strict';
import { mapControlRegions } from '../src/plugins/shanhetu/control-regions.js';
import { reflowLabelPositions, overlaps, inside } from '../src/plugins/shanhetu/label-layout.js';

const box = (x,y,w,h,extra={}) => ({rect:{x,y,w,h},...extra});
const bounds = part => part.rect;
test('sparse native bottom bar protects actual cards, skills and avatar, leaving its middle free',()=>{
  const top=box(0,0,1200,85), hand=box(20,680,250,170), skills=box(790,650,270,190);
  const avatar=box(1080,590,120,260), mates=box(950,560,120,80);
  const bottom=box(20,590,1180,260,{cardItemList:[hand],skillItemSpr:skills,selfSeatUi:avatar,matePart:mates});
  const controls=mapControlRegions({topProcesserView:top,bottomView:bottom},bounds);
  assert.deepEqual(controls,[top,skills,avatar,mates,hand].map(bounds));
  const cards=[[101,280,250,170,90,106],[102,570,130,170,95,106],[103,470,345,170,175,224]]
    .map(([id,x,y,w,h,height])=>({id,anchor:{x,y,w,h},variants:[{w:204,h:height},{w:240,h:height}]}));
  const buildings=[...cards.map(c=>c.anchor),{x:75,y:265,w:180,h:130},{x:260,y:420,w:175,h:130},
    {x:720,y:345,w:190,h:175},{x:935,y:350,w:190,h:160},{x:930,y:120,w:140,h:130}];
  const v={x:8,y:8,w:1184,h:834};
  const before=reflowLabelPositions(cards,v,[top.rect,bottom.rect],buildings);
  assert.ok([...before.values()].every(p=>!overlaps(p,bottom.rect)),'the union blocks the entire lower band, including its empty middle');
  const after=reflowLabelPositions(cards,v,controls,buildings);
  const boss=after.get(103);
  assert.equal(after.size,cards.length,'all complete cards fit when only actual controls are protected');
  assert.ok(after.size>=before.size,'separating sparse controls never reduces the displayed card count');
  assert.ok(boss&&inside(boss,v),'the full boss card remains inside the visible frame');
  assert.equal(boss.h,224,'all three enemies and rewards stay complete');
  for(const p of after.values()) { assert.ok(inside(p,v)); assert.ok([...controls,...buildings].every(r=>!overlaps(p,r))); }
  assert.deepEqual(reflowLabelPositions([...cards].reverse(),v,controls,buildings,after),after);
});

test('hidden known components do not restore the union; unknown or oversized native shapes stay conservative',()=>{
  const whole=box(0,600,1200,250),hidden=box(0,0,900,900,{visible:false});
  const scene={bottomView:{...whole,skillItemSpr:hidden,matePart:box(0,0,900,900,{alpha:0}),cardItemList:[]}};
  assert.deepEqual(mapControlRegions(scene,bounds),[]);
  scene.bottomView={...whole,skillItemSpr:box(0,0,900,900,{destroyed:true})};
  assert.deepEqual(mapControlRegions(scene,bounds),[]);
  scene.bottomView=whole;
  assert.deepEqual(mapControlRegions(scene,bounds),[whole.rect]);
  scene.bottomView={...whole,skillItemSpr:hidden,cardItemList:Array(129).fill(hidden)};
  assert.deepEqual(mapControlRegions(scene,bounds),[whole.rect]);
  scene.bottomView.visible=false;
  assert.deepEqual(mapControlRegions(scene,bounds),[]);
});
