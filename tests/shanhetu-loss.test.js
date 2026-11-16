import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConfig,buildView,choiceLoss} from '../src/plugins/shanhetu/model.js';
import {createNativeAdapter,projectSnapshot} from '../src/plugins/shanhetu/native.js';
import {optionTokens,optionSummary} from '../src/plugins/shanhetu/presentation.js';
import {fixtureConfig,fixtureData,Emitter} from './fixtures/shanhetu.js';

function setup() {
  const files=fixtureConfig(),s=fixtureData();
  files.hd_roguelike.Root.Tactics.push({plot:9000,plotname:'和光盟',level:2});
  Object.assign(files.hd_roguelike.Root.Choose[0],{lostitem:'2,2',lostnum:1});
  s.gameData.itemId=[3001,9000,2091];s.chapterData.curLocation=102;
  const c=buildConfig(files),choice=c.choices.get('10011'),location=s.chapterData.locations[1];
  return {c,s,choice,location};
}
test('loss prediction preserves original inventory order, not ID order, and preserves unknowns',()=>{
  const {c,s,choice,location}=setup(),read=()=>choiceLoss(c,choice,location,s);
  assert.equal(read().items[0].name,'和光盟');assert.equal(read().source,'predicted');
  s.gameData.itemId=[2091,9000];assert.equal(read().items[0].name,'能说会道');
  s.gameData.itemId=[99999,9000];assert.equal(read().source,'unknown');
  s.gameData.itemId=[];assert.equal(read().source,'unavailable');
  delete s.gameData.itemId;assert.equal(read().source,'unknown');
  s.gameData.itemId=[9000,2091];choice.lostnum=2;assert.equal(read().source,'unknown');
  choice.lostnum=1;choice.lostitem='2,0';assert.equal(read().source,'unknown');
});

test('equipment exchanges distinguish missing quality from unknown inventory and accept all native equipment subtypes',()=>{
  const files=fixtureConfig(),s=fixtureData(),location=s.chapterData.locations[1];
  for(let isequip=0;isequip<=6;isequip++)files.hd_roguelike.Root.Card.push({id:9500+isequip,cardid:1,isequip,level:2});
  const c=buildConfig(files),choice={effectID:152402,lostitem:'5,2',lostnum:1};
  const read=()=>choiceLoss(c,choice,location,s);
  for(let subtype=1;subtype<=6;subtype++){
    s.gameData.itemId=[9500+subtype];assert.equal(c.items.get(String(9500+subtype)).type,5);
    assert.equal(read().source,'predicted');assert.equal(read().items[0].id,9500+subtype);
  }
  s.gameData.itemId=[9500,2100,3001];assert.equal(read().source,'unavailable','cards, tactics and skills are not equipment');
  s.gameData.itemId=[9506,9501];assert.equal(read().items[0].id,9506,'keep native inventory order');
  choice.lostitem='5,1';assert.equal(read().source,'unavailable','rarer gear cannot pay a normal-quality cost');
  assert.match(optionSummary({lost:'普通装备 × 1',gain:'稀有装备',loss:read()}),/无法选择/);
  assert.ok(optionTokens({loss:read()}).some(t=>t.warning&&t.text.includes('无法选择')));
  s.gameData.itemId=[99999];assert.equal(read().source,'unknown');
  delete s.gameData.itemId;assert.equal(read().source,'unknown');
  s.gameData.itemId=[9501];delete c.items.get('9501').level;assert.equal(read().source,'unknown');
  // A current server-confirmed deduction still wins over the inventory preview.
  s.gameData.itemId=[];s.chapterData.curLocation=location.location;
  s.chapterData.curEventData={eventId:choice.effectID,eventType:4,loseData:[{id:9506,num:1}]};
  assert.equal(read().source,'server');assert.doesNotMatch(optionSummary({loss:read()}),/无法选择/);
});
test('explicit loss is scoped to current city and effect, wins over prediction and retains quantities',()=>{
  const {c,s,choice,location}=setup();
  s.chapterData.curEventData={eventId:10011,eventType:4,loseData:[{type:2,id:2091,num:2},{type:2,id:98765,num:1}]};
  const snapshot=projectSnapshot(s),read=()=>choiceLoss(c,choice,location,snapshot);
  assert.deepEqual(read(),{source:'server',items:[{id:2091,name:'能说会道',count:2},{id:98765,name:'未知物品 #98765',count:1}]});
  snapshot.chapterData.curEventData.eventId=10012;assert.equal(read().source,'predicted');
  snapshot.chapterData.curEventData.eventId=10011;snapshot.chapterData.curLocation=101;assert.equal(read().source,'predicted');
  snapshot.chapterData.curLocation=102;snapshot.chapterData.curEventData.isSelect=true;assert.equal(read().source,'predicted');
  snapshot.chapterData.curEventData.isSelect=false;snapshot.chapterData.curEventData.eventType=2;assert.equal(read().source,'predicted');
  s.chapterData.curEventData.loseData=Array(33).fill({id:2091});assert.throws(()=>projectSnapshot(s),/长度/);
});
test('native award notification carries loss without changing AllDatas and expires across event, move, run and account',()=>{
  const {c,s}=setup(),m=new Emitter();m.allDatas=s;m.RogueLikeDataReq=()=>{};
  Object.defineProperty(m,'AllDatas',{get:()=>m.allDatas});let account='a';
  const adapter=createNativeAdapter({game:{getScene:()=>({SceneName:'RogueSmallMapScene'}),getSelf:()=>({ClientId:account}),getClass:()=>m}});
  let calls=0;const off=adapter.subscribe(m,()=>calls++);
  const notify=()=>m.event('CLIENT_ROGUE_EVENT_SELECT_NTF',{eventId:10011,eventType:4,loseData:[{type:2,id:2091,num:1}]});
  const read=()=>buildView(c,adapter.snapshot(m)).nodes[1].options[0];
  notify();assert.equal(read().loss.source,'server');assert.equal(read().loss.items[0].name,'能说会道');assert.equal(s.chapterData.curEventData,undefined);
  assert.match(optionSummary(read()),/扣除：能说会道/);assert.doesNotMatch(optionSummary(read()),/预计/);
  m.event('CLIENT_ROGUE_EVENT_SELECT_REP',{});assert.equal(read().loss.source,'predicted');
  assert.ok(optionTokens(read()).some(t=>t.breakBefore&&t.text==='预计扣除：和光盟'));
  notify();s.chapterData.curEventData={eventId:888,eventType:4};assert.equal(read().loss.source,'predicted');
  notify();s.chapterData.curLocation=101;read();s.chapterData.curLocation=102;assert.equal(read().loss.source,'predicted');
  notify();s.seasonData.roundId++;assert.equal(read().loss.source,'predicted');
  notify();account='b';assert.equal(read().loss.source,'predicted');
  notify();off();assert.equal(read().loss.source,'predicted');const previous=calls;notify();assert.equal(calls,previous);
});
