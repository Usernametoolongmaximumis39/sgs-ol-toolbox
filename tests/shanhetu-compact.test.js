import {projectSnapshot,createNativeAdapter} from '../src/plugins/shanhetu/native.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { rewardTokens, rewardToken, compactReward, currencyTokens } from '../src/plugins/shanhetu/reward-tokens.js';
import { buildConfig, buildView, rewardDetail, rewardCost, reward } from '../src/plugins/shanhetu/model.js';
import { fixtureConfig, fixtureData, Emitter } from './fixtures/shanhetu.js';
import { labelLines, optionSummary, optionTokens } from '../src/plugins/shanhetu/presentation.js';
import { nativeRewardTexture, createRewardTextureResolver } from '../src/plugins/shanhetu/native-assets.js';
test('compact rewards preserve selection, quality and counts while omitting only the routine slot bonus',()=>{
  assert.equal(rewardToken('技能槽+1'),null);assert.ok(rewardToken('技能槽+2'));
  assert.equal(rewardToken('500 铜钱').icon,'rogue_money_icon');
  assert.deepEqual(rewardTokens(['随机史诗战法','自选稀有战法','可以从三张史诗手牌中选择一张获取']).map(t=>[t.icon,t.text]),[
    ['rogue_event_zhanfa2','史诗·随机'],['rogue_event_zhanfa0','稀有·自选'],['rogue_event_card1','史诗·3选1']]);
  for (const quality of ['普通','稀有','史诗','传说','普通或稀有']) {
    assert.equal(rewardToken(quality+'战法三选一').icon,'rogue_event_zhanfa1');
    assert.equal(rewardToken('随机'+quality+'战法').icon,'rogue_event_zhanfa2');
    assert.equal(rewardToken('自选'+quality+'战法').icon,'rogue_event_zhanfa0');
    assert.equal(rewardToken(quality+'手牌三选一').icon,'rogue_event_card1');
  }
  assert.equal(compactReward('可以从三张史诗手牌中选择一张获取'),'史诗手牌3选1');
  assert.equal(rewardToken('随机稀有战法 × 2').text,'稀有·随机× 2');
  assert.equal(rewardToken('神秘奖励').text,'神秘奖励');
});
test('equipment classifiers compact fully, with explicit compensation and exchange semantics',()=>{
  for(const wording of ['可以从三件普通装备中选择一件获取','从3件普通装备中选择1件获得']) {
    const token=rewardToken({text:wording,abandonMoney:50});
    assert.equal(token.icon,'rogue_event_equip1');assert.equal(token.text,'普通·3选1');assert.equal(token.abandonMoney,50);
  }
  const tokens=optionTokens({order:1,lost:'随机普通战法',gain:'稀有战法三选一'});
  assert.equal(tokens.filter(t=>t.icon).length,1);assert.equal(tokens[1].icon,'rogue_event_zhanfa2');
  assert.equal(tokens.map(t=>t.text).join(''),'① 普通·随机 → 稀有·3选1');
  const unlike=optionTokens({lost:'随机普通装备',gain:'稀有战法三选一'}).map(t=>t.fallback||t.text).join('');
  assert.match(unlike,/装备.*战法/);
  assert.match(optionTokens({lost:'随机普通战法 × 2',gain:'稀有战法三选一 × 3'}).map(t=>t.text).join(''),/随机× 2.*3选1× 3/);
});

test('category exchange costs stay neutral while a confirmed missing candidate cannot be selected',()=>{
  const files=fixtureConfig(),s=fixtureData();
  Object.assign(files.hd_roguelike.Root.Choose.find(c=>c.effectID===10011),{lostitem:'2,1',lostnum:1});
  const c=buildConfig(files),option=buildView(c,s).nodes[1].options[0];
  assert.equal(option.lost,'普通战法 × 1');
  assert.equal(reward(c,'2,1',1),'随机普通战法'); // only gains retain random acquisition
  assert.equal(rewardCost(c,'2,0',2),'战法 × 2');
  assert.equal(rewardCost(c,'2,2',0),'稀有战法 × 0');
  assert.equal(rewardCost(c,1000,100),'铜钱 × 100');
  const tokens=optionTokens({...option,gain:'稀有战法三选一'});
  assert.equal(tokens[1].icon,'rogue_event_zhanfa0');
  assert.equal(tokens.filter(t=>!t.breakBefore).map(t=>t.text).join(''),'① 普通× 1 → 稀有·3选1');
  assert.equal(tokens.find(t=>t.breakBefore).text,'无法选择（无合适扣除对象）');
  assert.equal(tokens.find(t=>t.breakBefore).warning,true);
  s.gameData.itemId.push(999999);
  assert.equal(optionTokens(buildView(c,s).nodes[1].options[0]).find(t=>t.breakBefore).text,'扣除对象待确认');
  s.gameData.itemId.reverse();
  assert.equal(buildView(c,s).nodes[1].options[0].lost,option.lost);
});

test('tactics use distinct official art and release only their own texture',()=>{
  const images=[], cleanups=[], bitmaps=[];
  class Image { constructor(){images.push(this);this.naturalWidth=134;this.naturalHeight=128;} }
  class Texture2D {constructor(){bitmaps.push(this);} loadImageSource(){} destroy(){this.destroyed=true;} }
  class Texture {constructor(bitmap){this.bitmap=bitmap;} destroy(release){this.destroyed=true;if(release)this.bitmap.destroy();} }
  const gold={bitmap:{},width:20,height:20};
  const L={Texture2D,Texture,Loader:{textureMap:{'/rogue_event_zhanfa1.png':gold}},loader:{getRes(){return null;}}};
  const get=createRewardTextureResolver({window:{Image},scope:{add:f=>cleanups.push(f)}});
  assert.equal(get(L,'rogue_event_zhanfa1'),null); // do not reuse ambiguous gold glyph
  assert.match(images[0].src,/^data:image\/png;base64,/);
  images[0].onload();const texture=get(L,'rogue_event_zhanfa1');
  assert.equal(texture.bitmap,bitmaps[0]);assert.equal(get(L,'rogue_event_zhanfa2'),texture);
  cleanups[0]();assert.equal(texture.destroyed,true);assert.equal(gold.destroyed,undefined);
  assert.equal(get(L,'rogue_event_zhanfa1'),null);

  const later=createRewardTextureResolver({window:{Image},scope:{add:f=>cleanups.push(f)}});
  later(L,'rogue_event_zhanfa0');const callback=images[1].onload;
  cleanups[1]();callback();assert.equal(bitmaps.length,1);assert.equal(images[1].onload,null);
});
test('only worn defensive equipment is shown, after difficulty removes or adds equipment',()=>{
  const files=fixtureConfig(),s=fixtureData();
  files.sys_playcard.GamePlayCards.card.push({id:90,name:'藤甲',type:3,subType:2},{id:91,name:'青龙偃月刀',type:3,subType:1},{id:92,name:'白银狮子',type:3,subType:2});
  Object.assign(files.hd_roguelike.Root.General[0],{equip:'90;91',equip_KN:'_90;92',carddesc:'90'});
  const c=buildConfig(files),g=buildView(c,s).nodes[0].fight.generals[0];
  assert.deepEqual(g.armors.map(x=>x.name),['白银狮子']);
  const lines=labelLines({fight:{generals:[{...g,skills:[{name:'灵动'},{name:'刚烈'}]}],rewards:['技能槽+1','500 铜钱']}});
  assert.deepEqual(lines.find(l=>l.kind==='name').warnings,['灵动','刚烈']);
  assert.ok(lines.some(l=>l.kind==='armor'&&l.text.includes('白银狮子')));
  assert.ok(lines.every(l=>!l.text.includes('青龙偃月刀')&&!l.text.includes('技能槽')));
});
test('native icons use cached atlas subtextures and fall back when absent',()=>{
  const texture={bitmap:{},width:43,height:38},L={Loader:{loadedMap:{'https://game/res/rogue/rogue_event_zhanfa3.png':texture}},loader:{getRes(){return null;}}};
  assert.equal(nativeRewardTexture(L,'rogue_event_zhanfa3'),texture);
  assert.equal(nativeRewardTexture(L,'rogue_money_icon'),null);
});


test('abandon compensation is per explicit reward group, not rarity or sale price',()=>{
  const files=fixtureConfig(), r=files.hd_roguelike.Root;
  r.RewardGroup.push({reward:111,rewarditem:'普通技能三选一',abandonmoney:50},{reward:112,rewarditem:'稀有技能三选一',abandonmoney:0},{reward:113,rewarditem:'史诗技能三选一',abandonmoney:-1});
  r.Fight[0].reward='101;111;112;113';
  const c=buildConfig(files), fight=buildView(c,fixtureData()).nodes[0].fight;
  assert.equal(rewardDetail(c,111).abandonMoney,50);
  for(const id of [101,112,113,2100,99999]) assert.equal(rewardDetail(c,id).abandonMoney,null);
  const tokens=rewardTokens(fight.rewardDetails);
  assert.equal(tokens.filter(t=>t.abandonMoney>0).length,1);
  assert.match(tokens.find(t=>t.abandonMoney>0).fallback,/普通·技能·3选1.*50铜钱/);
});
test('event choices show ordered costs and outcomes without flavor labels or invented fixed rewards',()=>{
  const files=fixtureConfig(),c=buildConfig(files),options=buildView(c,fixtureData()).nodes[1].options;
  assert.equal(optionSummary(options[0]),'① 铜钱100 → 随机稀有战法');
  assert.match(optionSummary(options[1]),/^② 战斗：赵云/);
  assert.equal(optionSummary({order:3,label:'人来就好',gain:'铜币 × 140'}),'③ 铜钱140');
  assert.equal(optionSummary({order:1,gain:'特定获取一个普通战法'}),'① 普通战法（名称未下发）');
  assert.equal(optionSummary({order:1,gain:'特定获取一个普通战法',reveal:'on-entry',costHint:'免费'}),'① 普通战法（待揭示）');
  assert.doesNotMatch(labelLines({options}).map(l=>l.text).join(' '),/解囊相助|护送商队/);
});


test('dense layout never drops rewards, later enemies or event options',()=>{
  const generals=Array.from({length:5},(_,i)=>({name:'敌军'+i,skills:[],stats:{hp:5,cardnum:4,draw:2,exshatimes:1}}));
  const node={fight:{generals,rewardDetails:[{text:'500 铜钱'},{text:'史诗技能三选一',abandonMoney:150}]}};
  const lines=labelLines(node,true);
  assert.deepEqual(lines,labelLines(node,false));
  assert.equal(lines.filter(l=>l.kind==='name').length,5);
  assert.match(lines.find(l=>l.kind==='reward').text,/500.*150/);
  const options=[1,2,3].map(order=>({order,gain:'铜钱 × '+order}));
  assert.deepEqual(labelLines({options},true),labelLines({options},false));
  assert.equal(labelLines({options},true).length,3);
});

test('standalone camps have no map explanation; mixed adventures retain other choices',()=>{
  const files=fixtureConfig(),s=fixtureData();s.chapterData.locations[1].event=1002;
  Object.assign(files.hd_roguelike.Root.Adventure[1],{chapname:'上赛季内容，暂时隐藏'});
  Object.assign(files.hd_roguelike.Root.Choose[2],{getitem:101,getnum:1});
  let node=buildView(buildConfig(files),s).nodes[1];
  assert.equal(node.type,'camp');assert.equal(node.name,'营地');assert.deepEqual(labelLines(node),[]);
  assert.equal(optionSummary(node.options[0]),'① 营地');
  Object.assign(files.hd_roguelike.Root.Adventure[1],{option2:'得钱',effect2:10011});
  node=buildView(buildConfig(files),s).nodes[1];assert.equal(node.type,'event');assert.equal(node.options.length,2);
  assert.match(labelLines(node).map(l=>l.text).join(' '),/① 营地.*②.*100/);
});
test('fixed adventure rewards use only the matching live event and zero-based option IDs',()=>{
  const files=fixtureConfig(),raw=fixtureData();
  Object.assign(files.hd_roguelike.Root.Choose[0],{showitem:1});
  raw.chapterData.curLocation=102;
  raw.chapterData.curEventData={eventId:1001,eventType:2,EventData:[{id:1,subData:[{type:2,id:2101,num:1}]},{subData:[{type:2,id:2100,num:1},{type:0,num:25}]}]};
  const c=buildConfig(files),snapshot=projectSnapshot(raw,{});
  assert.equal(buildView(c,snapshot).nodes[1].options[0].gain,'步步为营、铜钱 × 25');
  assert.equal(snapshot.chapterData.curEventData.EventData.length,2);
  for(const mutate of [s=>s.chapterData.curEventData.eventId=1002,s=>s.chapterData.curLocation=101,s=>s.chapterData.curEventData.isSelect=true,s=>s.chapterData.curEventData.eventType=3]){
    const s=structuredClone(snapshot);mutate(s);assert.equal(buildView(c,s).nodes[1].options[0].gain,'特定稀有战法');
  }
  files.hd_roguelike.Root.Choose[0].showitem=0;
  assert.equal(buildView(buildConfig(files),snapshot).nodes[1].options[0].gain,'步步为营、铜钱 × 25');
});

test('all inline money amounts retain order, signs and zero values as accessible icons',()=>{
  for(const text of ['① 铜钱100 → 普通战法','③ 获得 铜币 × 140','稀有技能（可弃换50铜钱）','0 铜钱','铜钱待同步']) {
    const tokens=currencyTokens(text);assert.equal(tokens.filter(t=>t.icon).length,1);
    assert.doesNotMatch(tokens.map(t=>t.text).join(''),/铜钱|铜币/);
    assert.match(tokens.find(t=>t.icon).fallback,/铜钱/);
  }
  assert.deepEqual(currencyTokens('花费 -10 铜钱，获得铜钱 × 0').filter(t=>t.icon).map(t=>t.text),['-10','0']);
});

test('live event notifications resolve options without AllDatas mutation and expire on selection, movement and run changes',()=>{
  let account='a', calls=0;
  const m=new Emitter();m.allDatas=fixtureData();Object.defineProperty(m,'AllDatas',{get:()=>m.allDatas});
  const ctx={game:{getSelf:()=>({ClientId:account})}},adapter=createNativeAdapter(ctx);
  const c=buildConfig(fixtureConfig());c.choices.get('10011').showitem=1;
  const read=()=>buildView(c,adapter.snapshot(m)).nodes[1].options[0];
  const off=adapter.subscribe(m,()=>calls++);
  const notify=()=>m.event('CLIENT_ROGUE_EVENT_SELECT_NTF',{eventId:1001,eventType:2,data:[{subData:[{type:2,id:2100,num:1}]},{id:1,subData:[{type:2,id:2101,num:2}]}]});
  assert.equal(read().reveal,'on-entry');notify();assert.equal(read().gain,'特定稀有战法');
  m.allDatas.chapterData.curLocation=102;
  // A previous battle's selected snapshot must not mask the newly notified event.
  m.allDatas.chapterData.curEventData={eventId:2001,eventType:3,isSelect:true};
  notify();assert.equal(read().gain,'步步为营');assert.equal(m.allDatas.chapterData.curEventData.eventId,2001);
  assert.equal(buildView(c,adapter.snapshot(m)).nodes[1].options[1].gain,'破釜沉舟 × 2');
  m.event('CLIENT_ROGUE_EVENT_SELECT_REP',{});assert.equal(read().gain,'特定稀有战法');
  notify();m.allDatas.chapterData.curLocation=101;read();m.allDatas.chapterData.curLocation=102;assert.equal(read().gain,'特定稀有战法');
  notify();m.allDatas.seasonData.roundId++;assert.equal(read().gain,'特定稀有战法');
  notify();account='b';assert.equal(read().gain,'特定稀有战法');
  notify();off();assert.equal(read().gain,'特定稀有战法');
  const before=calls;notify();assert.equal(calls,before);
});
