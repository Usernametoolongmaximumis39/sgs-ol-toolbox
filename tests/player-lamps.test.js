import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { ResourceScope } from '../src/core/resources.js';
import { DEFAULT_GENERALS, lampSettings, resolveWatchSettings, watchedGenerals, generalCatalogue, classifyLamps, projectBattleLamp, ddzGeneralPool, ddzModePool, ddzSearchCatalogue } from '../src/plugins/player-info/lamps-model.js';
import { createBattleLamps, lampManager, lampNickname } from '../src/plugins/player-info/lamps.js';
import { createPlayerSettings, renderPlayerSettings } from '../src/plugins/player-info/settings.js';
const config = { GameCharacters: { character: [
  { id:1,name:'吕布',name_prefix:'魔' }, { id:2,name:'吕布',name_prefix:'界' }, {id:3,name:'吕布',name_prefix:'神'},
  {id:4,name:'裴秀'}, {id:5,name:'曹婴'}, {id:6,name:'诸葛亮',name_prefix:'谋'},
] }, WuJiangs:{ Spgroup:[{spgenerals:'1,2,3'}], Parent:[{pargeneral:'10',chigeneral:'6'}] } };
test('defaults enable player cards and lamps, preserve explicit choices and independent custom lists', () => {
  const a=lampSettings(),b=lampSettings(); assert.equal(a.cards,true); assert.equal(a.lamps,true); assert.equal(lampSettings({cards:false,lamps:false}).cards,false); assert.equal(lampSettings({lamps:false}).lamps,false);
  assert.deepEqual(a.landlord,DEFAULT_GENERALS.landlord); assert.deepEqual(a.farmer,DEFAULT_GENERALS.farmer);
  a.landlord[0]='别的武将';assert.notEqual(a.landlord[0],b.landlord[0]);
  assert.deepEqual(lampSettings({farmer:['重复','重复']}).farmer,DEFAULT_GENERALS.farmer);
});
test('ownership precedes blocking; gods coexist, linked ownership, stable groups and full names', () => {
  const catalogue=generalCatalogue(config), names=['曹婴','魔吕布','裴秀','神吕布','谋诸葛亮'];
  const rows=classifyLamps(names,catalogue,new Set([1,3,4,10]),[2]);
  assert.deepEqual(rows.map(r=>[r.name,r.status]),[['裴秀','owned'],['神吕布','owned'],['谋诸葛亮','owned'],['魔吕布','blocked'],['曹婴','missing']]);
  assert.equal(classifyLamps(['魔吕布'],catalogue,new Set(),[2])[0].status,'missing');
  assert.equal(classifyLamps(['魔吕布'],catalogue,new Set([1]),[3])[0].status,'owned');
  assert.equal(classifyLamps(['魔吕布'],catalogue,null,[2])[0].status,'unknown');
  assert.match(rows.at(-1).tip,/体验卡或限免/);
  assert.equal(projectBattleLamp({Type:0}),null);
});

test('gods, Jin Sima Yi/Zhang Chunhua and timed copies cannot block in either direction',()=>{
  const catalogue=generalCatalogue({GameCharacters:{character:[
    {id:16,name:'司马懿'},{id:161,name:'张春华'},
    {id:7003,name:'司马懿',country:6,exType:40},{id:7007,name:'张春华',country:6,exType:40},
    {id:7005,name:'王元姬',country:6,exType:40},{id:77,name:'王元姬',SpecifyName:'界'},
    {id:208,name:'司马懿',SpecifyName:'神'},{id:16000,name:'司马懿'},
  ]}});
  const state=(target,frame)=>classifyLamps([{id:target,name:catalogue.get(target).name}],catalogue,new Set([target]),[frame])[0].status;
  for(const [a,b] of [[16,7003],[161,7007],[16,208],[16,16000]]){assert.equal(state(a,b),'owned');assert.equal(state(b,a),'owned');}
  assert.equal(state(7005,77),'blocked');assert.equal(state(77,7005),'blocked');
});
test('official SpecifyName abbreviation retains original artwork alias and prefixed names',()=>{
  const rows=generalCatalogue({abbreviation:{field:[{Short:'a',Long:'id'},{Short:'b',Long:'name'},{Short:'ai',Long:'SpecifyName'},{Short:'z',Long:'AvatarUseId'}]},GameCharacters:{character:[{a:'5',b:'孙权',ai:'魔',z:'9'}]}});
  assert.equal(rows.get(5).name,'魔孙权');assert.equal(rows.get(5).avatar,9);
});

test('already prefixed general names do not become double-prefixed unknown entries',()=>{
  const rows=generalCatalogue({GameCharacters:{character:[{id:5,name:'谋&周瑜',SpecifyName:'谋',AvatarUseId:8},{id:6,name:'周瑜'}]}});
  assert.equal(rows.get(5).name,'谋周瑜');assert.equal(rows.get(5).base,'周瑜');assert.equal(rows.get(5).avatar,8);
  assert.equal(classifyLamps(['谋周瑜'],rows,new Set([5]),[6])[0].status,'blocked');
});

test('saved general IDs survive renamed/missing metadata and another general taking the old name',()=>{
  const catalogue=generalCatalogue(config),legacy=lampSettings({scheme:'custom'});
  const migrated=resolveWatchSettings(legacy,catalogue);
  assert.equal(migrated.landlordIds[0],4);assert.equal(migrated.defaultLandlordIds[0],4);
  assert.equal(legacy.landlordIds[0],null,'migration does not mutate the input');
  catalogue.get(4).name='更名后的裴秀';catalogue.set(99,{...catalogue.get(4),id:99,name:'裴秀'});
  const next=resolveWatchSettings(migrated,catalogue);
  assert.equal(next.landlordIds[0],4);assert.equal(next.landlord[0],'更名后的裴秀');
  const selected=watchedGenerals(next,'landlord');
  assert.equal(classifyLamps(selected,catalogue,new Set([99])).find(g=>g.id===4).status,'missing');
  catalogue.delete(4);
  assert.equal(classifyLamps(selected,catalogue,new Set([4])).find(g=>g.id===4).status,'owned');
  assert.equal(resolveWatchSettings(next,catalogue).landlordIds[0],4);
});

test('official config identifies Mou Zhuge Liang 717 and Mou Zhou Yu 770; type 64 alone is not country war',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/player-lamps-verified-mou.json',import.meta.url),'utf8'));
  const catalogue=generalCatalogue(fixture),pool=new Set([717,770,2060]);
  for(const [id,name] of [[717,'谋诸葛亮'],[770,'谋周瑜']]){
    assert.equal(catalogue.get(id).name,name);assert.equal(catalogue.get(id).countryWar,false);
    assert.equal(ddzSearchCatalogue(catalogue,pool).has(id),true);
  }
  assert.equal(catalogue.get(2060).countryWar,true);assert.equal(ddzSearchCatalogue(catalogue,pool).has(2060),false);
  const migrated=resolveWatchSettings(lampSettings(),catalogue);
  assert.equal(migrated.defaultLandlordIds[1],717);assert.equal(migrated.defaultLandlordIds[3],770);
  assert.equal(migrated.landlordIds[1],717);assert.equal(migrated.landlordIds[3],770);
  const rows=classifyLamps(watchedGenerals(migrated,'landlord'),catalogue,new Set([717]));
  assert.equal(rows.find(r=>r.id===717).status,'owned');assert.equal(rows.find(r=>r.id===770).status,'missing');
});
test('battle prefetch, complete packets, role gate, frame updates, mode and account isolation, cleanup',async t=>{
  const dom=new JSDOM('<body></body>'),scope=new ResourceScope(),listeners=new Map(),calls=[];
  t.after(()=>{scope.dispose();dom.window.close();});
  let who=1000000001,session=1,mode=148,opts=lampSettings({lamps:true,scheme:'custom',landlord:['魔吕布','曹婴','神吕布','裴秀','谋诸葛亮','a','b','c','d','e']});
  const seats=[{seat:{IsSelf:true,PlayerInfo:{ClientId:1000000001}}},{seat:{PlayerInfo:{ClientId:1000000002,NickNameForLocal:'甲'},Figure:0}},{seat:{PlayerInfo:{ClientId:1000000003,NickNameForLocal:'乙'},Figure:0}}];
  const proxy={on(e,c,f){listeners.set(e,[...(listeners.get(e)||[]),{c,f}]);},off(e,c,f){const next=(listeners.get(e)||[]).filter(h=>h.c!==c||h.f!==f);if(next.length)listeners.set(e,next);else listeners.delete(e);}};
  const m={ReqOtherbuygeneral(n){calls.push(n);}};
  class User{static TryGetUserDataUid(name){return name==='甲'?1000000002:1000000003;}}
  const ctx={scope,window:dom.window,document:dom.window.document,getState:()=>({sessionId:session}),game:{getSelf:()=>({ClientId:who,constructor:User}),getSnapshot:()=>({inGame:true,modeId:mode}),getSeatUIs:()=>seats,getServerProxy:()=>proxy,getClass:n=>n==='GeneralManager'?m:null,getConfigData:()=>config}};
  let refreshes=0;const lamps=createBattleLamps(ctx,()=>opts,()=>refreshes++);
  const update=()=>lamps.update({inGame:true,modeId:mode},session);
  const send=async(e,p)=>{for(const h of listeners.get(e)||[])h.f.call(h.c,{Protocol:p});await new Promise(r=>setTimeout(r,5));};
  update();assert.deepEqual(calls,['甲','乙']);assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);
  await send('MsgGameDealCharacter',{Type:1,Datas:[2]});
  await send('ClientSelfbuygeneralRep',{Type:1,Nickname:'甲',IsEnd:0,GeneralIDList:[{ID:1,EndTime:0,GoodsID:1}]});
  await send('MsgGameShowFigure',{Type:5,Figure:1});assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);
  await send('MsgGameShowFigure',{Type:1,Figure:1});assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);
  await send('ClientSelfbuygeneralRep',{Type:1,Nickname:'甲',IsEnd:1,GeneralIDList:[{ID:4,EndTime:99,GoodsID:1}]});
  const rows=lamps.rows(seats[1].seat.PlayerInfo,1);assert.equal(rows.find(r=>r.name==='魔吕布').status,'blocked');assert.equal(rows.find(r=>r.name==='裴秀').status,'missing');assert.ok(refreshes>=4);
  mode=132;update();assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);assert.equal(calls.length,2);
  mode=148;who=1000000004;session++;update();assert.equal(calls.length,4);assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);
  opts={...opts,cards:false};update();assert.equal(lamps.rows(seats[1].seat.PlayerInfo,1),null);
  scope.dispose();assert.equal(listeners.size,0);
});
test('settings dependency, search replacement, persistence and panel cleanup',()=>{
  const dom=new JSDOM('<main></main>'),scope=new ResourceScope(),saved=new Map();
  const ctx={scope,window:dom.window,document:dom.window.document,storage:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,v)}};
  const options=createPlayerSettings(ctx,()=>{}),host=ctx.document.querySelector('main');
  const dispose=renderPlayerSettings(ctx,host,options,{searchCatalogue:()=>ddzSearchCatalogue(generalCatalogue(config),new Set([1,2,3,4,5,6]))});
  const [cards,lamps]=host.querySelectorAll('input[type=checkbox]');
  assert.equal(cards.checked,true);assert.equal(lamps.checked,true);host.querySelectorAll('.sgs-segments button')[1].click();
  host.querySelector('.pi-slots button').click();const search=host.querySelector('input[type=search]');search.value='界吕布';search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(host.querySelectorAll('.pi-results button').length,1);host.querySelector('.pi-results button').click();assert.equal(options.get().landlord[0],'界吕布');
  assert.equal(options.get().landlordIds[0],2);assert.equal(saved.get('settings').landlordIds[0],2);
  cards.click();assert.equal(lamps.disabled,true);assert.equal(options.get().lamps,true);
  assert.equal(createPlayerSettings(ctx,()=>{}).get().cards,false);dispose();assert.equal(host.children.length,0);scope.dispose();dom.window.close();
});
test('search intersects only current DDZ cycle; rejects historical, future and malformed pools',()=>{
  const now=new Date(2026,10,17,12).getTime(), Root={CycID:[
    {cycID:1,beginTime:'20260101T000000',endTime:'20261001T000000',generalOpen:'1,2'},
    {cycID:2,beginTime:'20261101T000000',endTime:'20261201T000000',generalOpen:'3,4'},
    {cycID:3,beginTime:'20261202T000000',generalOpen:'5,6'},
  ]};
  assert.deepEqual([...ddzGeneralPool({Root},now)],[3,4]);
  assert.equal(ddzGeneralPool({},now),null);
  assert.equal(ddzGeneralPool({Root:{CycID:[{generalOpen:'1,NaN'}]}},now),null);
  assert.equal(ddzGeneralPool({Root:{CycID:[{beginTime:'bad',generalOpen:'1'}]}},now),null);
});
test('duplicate Liu Bei results distinguish prefixes and reject timed IDs even when included in DDZ pool',()=>{
  const raw={abbreviation:{field:[{Short:'a',Long:'id'},{Short:'b',Long:'name'},{Short:'ai',Long:'SpecifyName'}]},GameCharacters:{character:[
    {a:1,b:'刘备'}, {a:2,b:'刘备',ai:'界'}, {a:3,b:'刘备',ai:'谋'},
    {a:4,b:'刘备',GeneralItemType:16}, {a:10001,b:'刘备'}, {a:10002,b:'刘备',ai:'界'},
    {a:10003,b:'刘备',ai:'谋'}, {a:10004,b:'刘备',ai:'限时'}, {a:10005,b:'曹操',freetitle:'148,限时武将'},
    {a:6,b:'曹操'}, {a:7,b:'孙权',GeneralEnable:0}, {a:10007,b:'孙权'},
  ]},WuJiangs:{Parent:[{pargeneral:'1',chigeneral:'10001'}]}};
  const catalogue=generalCatalogue(raw);
  const pool=new Set([...catalogue.keys()].filter(id=>id!==3));
  const choices=ddzSearchCatalogue(catalogue,pool);
  assert.deepEqual([...choices.values()].map(g=>g.name),['刘备','界刘备','曹操']);
  assert.equal(choices.has(10003),false,'a timed-only pool entry must not replace the absent permanent original');
  assert.equal(ddzSearchCatalogue(catalogue,null),null);
});
test('runtime search waits for DDZ config, never exposes all characters, and follows pool replacement',async t=>{
  const dom=new JSDOM('<body></body>'),scope=new ResourceScope();t.after(()=>{scope.dispose();dom.window.close();});
  let resolvePool,currentPool=null;const loads=[];
  const ctx={scope,window:dom.window,document:dom.window.document,game:{getSelf:()=>({ClientId:100}),getClass:()=>null,getServerProxy:()=>null,
    getConfigData:name=>name==='character'?config:currentPool,
    loadConfigData(name){loads.push(name);return name==='hd_fight_lord_config'?new Promise(resolve=>{resolvePool=resolve;}):Promise.resolve(null);}}};
  const lamps=createBattleLamps(ctx,()=>lampSettings());assert.equal(lamps.searchCatalogue(),null);
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(loads,['hd_fight_lord_config','sys_ss_gamelabel_config']);
  resolvePool({Root:{CycID:[{cycID:1,generalOpen:'1,2'}]}});await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([...lamps.searchCatalogue().keys()],[1,2]);
  currentPool={Root:{CycID:[{cycID:2,generalOpen:'3'}]}};assert.deepEqual([...lamps.searchCatalogue().keys()],[3]);
});

test('actual November DDZ season has no generalOpen; native mode pool supplies permanent candidates',()=>{
  const data=JSON.parse(readFileSync(new URL('./fixtures/player-ddz-mode-pool.json',import.meta.url),'utf8'));
  const chars=JSON.parse(readFileSync(new URL('./fixtures/player-lamps-verified-mou.json',import.meta.url),'utf8'));
  const catalogue=generalCatalogue(chars),now=new Date(2026,10,17,12).getTime();
  assert.equal(ddzGeneralPool(data,now),null);
  const pool=ddzModePool(data,catalogue,now);
  assert.ok(pool.has(717)&&pool.has(770));assert.equal(pool.has(13),false);assert.ok(pool.has(127),'forced-enabled generals are part of the pool');
  assert.deepEqual([...ddzSearchCatalogue(catalogue,pool).keys()],[717,770]);
});

test('Jin originals are distinct from normal names, national-war and duel copies; open tests follow the mode pool',()=>{
  const data=JSON.parse(readFileSync(new URL('./fixtures/player-lamps-jin-generals.json',import.meta.url),'utf8'));
  const catalogue=generalCatalogue(data),pool=new Set([16,161,7003,7005,7007,3049,2088]);
  const result=ddzSearchCatalogue(catalogue,pool);
  for(const [id,name] of [[7003,'晋司马懿'],[7005,'晋王元姬'],[7007,'晋张春华']])assert.equal(result.get(id)?.name,name);
  assert.ok(result.has(16)&&result.has(161));assert.equal(result.has(3049),false);assert.equal(result.has(2088),false);
  const tests=generalCatalogue({GameCharacters:{character:[{id:900,name:'测试甲',GeneralEnable:'2',exType:51},{id:901,name:'未开放甲',GeneralEnable:'0'},{id:902,name:'测试乙',GeneralEnable:'2',exType:51}]}});
  assert.deepEqual([...ddzSearchCatalogue(tests,new Set([900,901])).keys()],[900]);
});

test('search reads the open native DDZ window model, independent of its visible/owned/selected tab',t=>{
  const dom=new JSDOM('<body></body>'),scope=new ResourceScope();t.after(()=>{scope.dispose();dom.window.close();});
  const window={ClassName:'ModeGeneralPoolWindow',info:{ModeID:148,Section:3},vo:{Id:8,InFactGeneralList:[1,4],CantCloseGeneralList:[5]},generalInfoList:[{Id:1}]};
  dom.window.Laya={stage:{_children:[window]}};
  const ctx={scope,window:dom.window,game:{getSelf:()=>({ClientId:100}),getClass:()=>null,getServerProxy:()=>null,getConfigData:n=>n==='character'?config:null,loadConfigData:()=>assert.fail('native pool needs no config query')}};
  const lamps=createBattleLamps(ctx,()=>lampSettings());
  assert.deepEqual([...lamps.searchCatalogue().keys()],[1,4,5]);
  window.vo.InFactGeneralList=[3];assert.deepEqual([...lamps.searchCatalogue().keys()],[3,5]);
});
test('native manager discovery accepts current PB event and canonicalizes cross-server display names',()=>{
  const native={ReqOtherbuygeneral(){},realName:n=>n.replace(/\[[0-9]+\]/,'')};
  const ctx={game:{getClass:()=>null,getServerProxy:()=>({_events:{decodeClientSelfBuyGeneralRep:{caller:native}}})}};
  assert.equal(lampManager(ctx),native);
  assert.equal(lampNickname({NickNameForLocal:'待字包轻语[12]'},native),'待字包轻语');
  assert.equal(lampNickname({NickNameForLocal:'',Nickname:'真实昵称'},null),'真实昵称');
  const raw=projectBattleLamp({ProtoObj:{reptype:'REP_TYPE_QUERY',nickname:'甲',is_end:true,generals:[{generalid:1,goodsid:1},{generalid:2,expirydate:123,goodsid:2}]}});
  assert.deepEqual(raw,{name:'甲',end:true,ids:[1]});
  const body={reptype:'REP_TYPE_QUERY',nickname:'甲',is_end:true,generals:[{generalid:1,goodsid:1}]};
  assert.deepEqual(projectBattleLamp({Protocol:{ProtoObj:body}}),raw);
  assert.deepEqual(projectBattleLamp({Protocol:{Data:{ProtoObj:body}}}),raw);
});
