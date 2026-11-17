import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { createManualLampQuery, projectLampProfile, renderManualLampQuery } from '../src/plugins/player-info/manual-lamps.js';
import { createBattleLamps } from '../src/plugins/player-info/lamps.js';
import { lampSettings } from '../src/plugins/player-info/lamps-model.js';
const wait=()=>new Promise(resolve=>setTimeout(resolve,8));
function fixture(t){
  const dom=new JSDOM('<main></main>'),scope=new ResourceScope(),handlers=new Map(),requests=[];
  let account=1000000001,proxy;
  const connection={on(e,c,f){const rows=handlers.get(e)||[];rows.push({c,f});handlers.set(e,rows);},off(e,c,f){handlers.set(e,(handlers.get(e)||[]).filter(h=>h.c!==c||h.f!==f));},
    N(id,body){requests.push({id,body});},emit(e,packet){for(const h of handlers.get(e)||[])h.f.call(h.c,packet);}};proxy=connection;
  const users=new Map();
  class User {constructor(id,name){this.ClientId=id;this.Nickname=name;}static GetInstance(id){return users.get(id);}static GetNameInstance(name){return [...users.values()].find(u=>u.Nickname===name);}static TryGetUserDataUid(name){return this.GetNameInstance(name)?.ClientId||0;} }
  const m={ReqOtherbuygeneral(name){requests.push({native:'ReqOtherbuygeneral',name,targetId:User.TryGetUserDataUid(name)});},ReqSelfbuygeneral(){requests.push({native:'ReqSelfbuygeneral'});},on:connection.on.bind(connection),off:connection.off.bind(connection),emit:connection.emit.bind(connection)};
  const ctx={scope,document:dom.window.document,window:dom.window,game:{getSelf:()=>account?new User(account,'自己'):null,getClass:()=>m,getServerProxy:()=>proxy,getConfigData:()=>({GameCharacters:{character:[{id:1,name:'诸葛亮',SpecifyName:'谋'},{id:2,name:'裴秀'}]}})}};
  t.after(()=>{scope.dispose();dom.window.close();});
  return {ctx,scope,requests,connection,handlers,m,users,User,account(value){account=value;},proxy(value){proxy=value;},profile(id=1000000002,name='测试玩家'){users.set(id,new User(id,name));connection.emit('decodeClientUserBaseInfoRep',{Protocol:{Data:{ProtoObj:{nickname_usertempid:id,nickname:name}}}});},
    lamps(ids,end=true,name='测试玩家'){connection.emit('decodeClientSelfBuyGeneralRep',{Protocol:{Data:{ProtoObj:{reptype:'REP_TYPE_QUERY',nickname:name,is_end:end,generals:ids.map(id=>({generalid:id,goodsid:1}))}}}});}};
}
test('manual ID query validates input, verifies matching profile ID, uses the same native friend query with a verified target ID, commits only complete permanent lamps',async t=>{
  const f=fixture(t),query=createManualLampQuery(f.ctx,f.scope);
  for(const id of ['123','0000000001','100000000x','9999999999'])assert.equal(query.query(id),false);
  assert.equal(f.requests.length,0);
  assert.equal(query.query('1000000002'),true);assert.equal(query.query('1000000003'),false);
  assert.deepEqual(f.requests,[{id:180052,body:{uid:1000000002,nickname:'',reqtype:0}}]);
  f.profile(1000000003,'无关玩家');await wait();assert.equal(f.requests.length,1);
  f.profile();await wait();assert.deepEqual(f.requests[1],{native:'ReqOtherbuygeneral',name:'测试玩家',targetId:1000000002});
  f.lamps([1],false);await wait();assert.equal(query.snapshot().phase,'lamps');assert.deepEqual(query.snapshot().ids,[]);
  f.lamps([9],true,'无关玩家');await wait();assert.equal(query.snapshot().phase,'lamps');
  f.connection.emit('ClientSelfbuygeneralRep',{Protocol:{Type:1,Nickname:'测试玩家',IsEnd:1,GeneralIDList:[{ID:2,EndTime:0,GoodsID:1},{ID:3,EndTime:123,GoodsID:1},{ID:4,EndTime:0,GoodsID:0}]}});
  await wait();const result=query.snapshot();assert.equal(result.phase,'done');assert.deepEqual(result.ids,[1,2]);assert.equal(result.profileId,'1000000002');assert.equal(result.targetId,'1000000002');
  assert.equal([...f.handlers.values()].flat().length,0);
});
test('manual query cancels on user request, account switch and disposal; ignores late packets',async t=>{
  const f=fixture(t),query=createManualLampQuery(f.ctx,f.scope);query.query('1000000002');query.cancel();f.profile();await wait();assert.equal(query.snapshot().phase,'cancelled');assert.equal(f.requests.length,1);
  query.query('1000000002');f.account(1000000003);assert.equal(query.snapshot().phase,'idle');f.profile();await wait();assert.equal(f.requests.length,2);
  query.query('1000000002');f.scope.dispose();f.profile();await wait();assert.equal([...f.handlers.values()].flat().length,0);
});
test('manual ID UI supports Enter submit and full diagnostic/result names without persisting queried players',async t=>{
  const f=fixture(t),host=f.ctx.document.querySelector('main');renderManualLampQuery(f.ctx,host,f.scope);
  const input=host.querySelector('input');input.value='1000000002';host.querySelector('form').dispatchEvent(new f.ctx.window.Event('submit',{cancelable:true}));
  f.profile();await wait();f.lamps([1,2]);await wait();await new Promise(resolve=>setTimeout(resolve,220));
  assert.match(host.textContent,/查询完成：永久拥有 2 位/);assert.match(host.textContent,/谋诸葛亮（1）/);assert.match(host.textContent,/资料返回 ID：1000000002/);assert.match(host.textContent,/将灯请求目标 ID：1000000002/);
  f.scope.dispose();assert.equal(host.children.length,0);
});
test('manual projection follows native user base response and native Uuid is ClientId alias',()=>{
  assert.deepEqual(projectLampProfile({Protocol:{clientID:1000000002,nickname:'甲'}}),{id:'1000000002',name:'甲'});
  assert.equal(projectLampProfile({Protocol:{clientID:0,nickname:'甲'}}),null);

});
test('manual timeouts distinguish profile lookup from lamp query and release all listeners',t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture(t),query=createManualLampQuery(f.ctx,f.scope);
  query.query('1000000002');t.mock.timers.tick(10001);assert.match(query.snapshot().message,/未取得该 ID/);assert.equal(f.requests.length,1);
  query.query('1000000002');f.profile();t.mock.timers.tick(1);assert.equal(f.requests.length,3);
  t.mock.timers.tick(15001);assert.match(query.snapshot().message,/将灯查询超时/);assert.equal(query.snapshot().phase,'error');assert.deepEqual(query.snapshot().ids,[]);assert.equal([...f.handlers.values()].flat().length,0);
});
test('querying own displayed ID uses existing self and permanent lamp cache without any profile request',t=>{
  const f=fixture(t);f.account(1786345389);delete f.connection.N;
  f.m.selfGeneralDict=new Map([[1,{ID:1,IsForeverWithOutParent:true}],[2,{ID:2,IsForeverWithOutParent:false,IsForever:true}],[3,{ID:3,IsForeverWithOutParent:false}]]);
  const query=createManualLampQuery(f.ctx,f.scope);assert.equal(query.query('1786345389'),true);
  assert.equal(query.snapshot().phase,'done');assert.equal(query.snapshot().profileSource,'当前账号');assert.equal(query.snapshot().lampSource,'当前账号已加载将灯');assert.deepEqual(query.snapshot().ids,[1]);assert.deepEqual(f.requests,[]);
});
test('known friend ID resolves from native UserData cache and directly uses working native lamp method',async t=>{
  const f=fixture(t);f.users.set(1000000002,new f.User(1000000002,'好友'));delete f.connection.N;
  const query=createManualLampQuery(f.ctx,f.scope);query.query('1000000002');
  assert.deepEqual(f.requests,[{native:'ReqOtherbuygeneral',name:'好友',targetId:1000000002}]);
  f.lamps([1,2],true,'好友');await wait();assert.deepEqual(query.snapshot().ids,[1,2]);assert.equal(query.snapshot().phase,'done');
});
test('own in-flight cache cannot yield false emptiness; native self completion delivers known result',async t=>{
  const f=fixture(t);f.m.selfGeneralDict=new Map();f.m.selfBuyGeneralLastIds=[];
  const query=createManualLampQuery(f.ctx,f.scope);query.query('1000000001');assert.equal(query.snapshot().phase,'lamps');assert.deepEqual(f.requests,[{native:'ReqSelfbuygeneral'}]);
  f.m.selfGeneralDict.set(1,{ID:1,IsForeverWithOutParent:true});f.m.emit('SELF_DATA_UPDATE');await wait();assert.deepEqual(query.snapshot().ids,[1]);assert.equal(query.snapshot().phase,'done');
});
test('conflicting nickname cache cannot redirect a known ID query to another player',t=>{
  const f=fixture(t);f.users.set(1000000003,new f.User(1000000003,'重名'));f.users.set(1000000002,new f.User(1000000002,'重名'));
  const query=createManualLampQuery(f.ctx,f.scope);query.query('1000000002');assert.equal(query.snapshot().phase,'error');assert.match(query.snapshot().message,/尚未关联到输入 ID/);assert.deepEqual(f.requests,[]);
});
test('successful manual result immediately replaces timed-out in-game state by ID without a second response',t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=fixture(t),user=new f.User(1000000002,'好友');f.users.set(user.ClientId,user);
  f.ctx.game.getSeatUIs=()=>[{seat:{PlayerInfo:user,Figure:1}}];f.ctx.game.getSnapshot=()=>({inGame:true,modeId:148});f.ctx.getState=()=>({sessionId:1});
  let paints=0;const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}),()=>paints++);
  battle.update(f.ctx.game.getSnapshot(),1);assert.equal(f.requests.length,1);
  t.mock.timers.tick(15001);assert.equal(battle.rows(user,1),null);
  const cache=new Map([[2,{ID:2,IsForeverWithOutParent:true}]]);
  f.m.otherGeneralDict={getStringKey:name=>name==='好友'?cache:null};f.m.otherTimeDict={get:()=>1};f.m.otherRequestingDict={has:()=>false};
  const manual=createManualLampQuery(f.ctx,f.scope,()=>Date.now(),result=>battle.acceptResult(result));
  manual.query('1000000002');assert.equal(manual.snapshot().phase,'done');
  assert.equal(battle.rows(user,1).find(g=>g.name==='裴秀').status,'owned');assert.ok(paints>0);assert.equal(f.requests.length,1);
  const foreign={phase:'done',accountId:'1000000003',id:'1000000002',ids:[]};assert.equal(battle.acceptResult(foreign),false);assert.equal(battle.rows(user,1).find(g=>g.name==='裴秀').status,'owned');
});
test('seat identity with missing nickname-to-ID cache is hydrated through native base-info method before lamps',async t=>{
  const f=fixture(t),user=new f.User(1000000002,'好友');f.ctx.game.getSeatUIs=()=>[{seat:{PlayerInfo:user}}];
  f.User.TryGetUserDataUid=()=>0;
  f.User.SendUserBaseInfo=(name,type,queued)=>{f.requests.push({native:'SendUserBaseInfo',name,type,queued});f.User.TryGetUserDataUid=()=>1000000002;f.profile(1000000002,name);};
  const query=createManualLampQuery(f.ctx,f.scope);query.query('1000000002');
  assert.deepEqual(f.requests,[{native:'SendUserBaseInfo',name:'好友',type:0,queued:false}]);await wait();
  assert.deepEqual(f.requests[1],{native:'ReqOtherbuygeneral',name:'好友',targetId:1000000002});
  f.lamps([2],true,'好友');await wait();assert.deepEqual(query.snapshot().ids,[2]);assert.equal(query.snapshot().phase,'done');
});

test('battle queries occupied seat IDs directly without profile cache, manual input, or manager pending flags',async t=>{
  const f=fixture(t),users=[new f.User(123456789,'短号玩家'),new f.User(1000000002,'跨服玩家[12]')];
  let seats=users.map((user,i)=>({seat:{PlayerInfo:user,Figure:i?3:1}}));
  f.ctx.game.getSeatUIs=()=>seats;f.ctx.game.getSnapshot=()=>({inGame:true,modeId:148});
  f.User.TryGetUserDataUid=()=>0;
  f.User.SendUserBaseInfo=()=>assert.fail('occupied seats do not need a profile lookup');
  f.m.ReqOtherbuygeneral=()=>assert.fail('do not rely on pending or cooldown state to dispatch a seat query');
  f.m.otherRequestingDict={has:()=>true};f.m.otherTimeDict={get:()=>1};
  const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}));
  battle.update(f.ctx.game.getSnapshot(),1);
  assert.deepEqual(f.requests,[
    {id:180056,body:{target_uid:123456789,who:'REQ_TYPE_CLIENT',nickname:'短号玩家'}},
    {id:180056,body:{target_uid:1000000002,who:'REQ_TYPE_CLIENT',nickname:'跨服玩家'}},
  ]);
  f.lamps([2],false,'短号玩家');await wait();
  assert.equal(battle.rows(users[0],1),null);
  f.lamps([1],true,'短号玩家');f.lamps([2],true,'跨服玩家');await wait();
  assert.equal(battle.rows(users[0],1).find(g=>g.name==='裴秀').status,'owned');
  assert.equal(battle.rows(users[1],3).find(g=>g.name==='裴秀').status,'owned');
  seats=seats.reverse();battle.update(f.ctx.game.getSnapshot(),1);assert.equal(f.requests.length,2);
  battle.update({inGame:true,modeId:132},1);assert.equal(battle.rows(users[0],1),null);
});

test('automatic timeout retries once within selection time, accepts completion and stops repeating',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
  const f=fixture(t),user=new f.User(1000000002,'好友');
  f.ctx.game.getSeatUIs=()=>[{seat:{PlayerInfo:user,Figure:1}}];
  const snapshot={inGame:true,modeId:148};f.ctx.game.getSnapshot=()=>snapshot;
  const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}));
  battle.update(snapshot,1);assert.equal(f.requests.length,1);
  t.mock.timers.tick(2501);battle.update(snapshot,1);assert.equal(f.requests.length,1);
  t.mock.timers.tick(500);battle.update(snapshot,1);assert.equal(f.requests.length,2);
  t.mock.timers.tick(20001);battle.update(snapshot,1);assert.equal(f.requests.length,2);
  f.lamps([2],true,'好友');t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1).find(g=>g.name==='裴秀').status,'owned');
  t.mock.timers.tick(60000);battle.update(snapshot,1);assert.equal(f.requests.length,2);
});

test('seats loading separately do not restart in-flight player requests',t=>{
  const f=fixture(t),first=new f.User(1000000002,'甲'),second=new f.User(1000000003,'乙');
  const seats=[{seat:{PlayerInfo:first}}],snapshot={inGame:true,modeId:148};
  f.ctx.game.getSeatUIs=()=>seats;f.ctx.game.getSnapshot=()=>snapshot;
  const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}));
  battle.update(snapshot,1);assert.equal(f.requests.length,1);
  seats.push({seat:{PlayerInfo:second}});battle.update(snapshot,1);
  assert.deepEqual(f.requests.map(r=>r.body.target_uid),[1000000002,1000000003]);
});

test('unreadable or timed-out lamps neither display a strip nor prefetch portrait resources',t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
  const f=fixture(t),user=new f.User(1000000002,'好友');
  let loads=0,artLookups=0;f.ctx.window.Laya={loader:{load(){loads++;}}};
  f.m.getOwnGeneral=()=>{artLookups++;return {generalInfo:{GeneralBigImgUrl:'https://web.sanguosha.com/fixture/1.png'}};};
  f.ctx.game.getSeatUIs=()=>[{seat:{PlayerInfo:user,Figure:1}}];
  const snapshot={inGame:true,modeId:148};f.ctx.game.getSnapshot=()=>snapshot;
  const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}));battle.update(snapshot,1);
  assert.equal(battle.rows(user,1),null);assert.equal(loads,0);assert.equal(artLookups,0);
  f.connection.emit('decodeClientSelfBuyGeneralRep',{Protocol:{errCode:1}});t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1),null);assert.equal(loads,0);assert.equal(artLookups,0);
  t.mock.timers.tick(2501);assert.equal(battle.rows(user,1),null);assert.equal(loads,0);assert.equal(artLookups,0);
  f.lamps([2],true,'好友');t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1).find(g=>g.id===2).status,'owned');assert.ok(artLookups>0);
});

test('frame replacement releases the old block and applies the new block on the next event without a query',async t=>{
  const f=fixture(t),user=new f.User(1000000002,'好友');
  f.ctx.game.getConfigData=()=>({GameCharacters:{character:[{id:1,name:'诸葛亮',SpecifyName:'谋'},{id:2,name:'裴秀'},{id:3,name:'诸葛亮',SpecifyName:'界'},{id:4,name:'裴秀',SpecifyName:'界'}]}});
  f.ctx.game.getSeatUIs=()=>[{seat:{PlayerInfo:user,Figure:1}}];
  const snapshot={inGame:true,modeId:148};f.ctx.game.getSnapshot=()=>snapshot;f.ctx.getState=()=>({sessionId:1});
  let paints=0;const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}),()=>paints++);battle.update(snapshot,1);
  f.lamps([1,2],true,'好友');await wait();
  f.connection.emit('MsgGameDealCharacter',{Protocol:{Type:1,Datas:[3,0,0]}});await wait();
  assert.equal(battle.rows(user,1).find(g=>g.id===1).status,'blocked');
  const before=paints,queries=f.requests.length;
  f.connection.emit('MsgGameDealCharacter',{Protocol:{Type:3,Datas:[4,0,0]}});await wait();
  const rows=battle.rows(user,1);assert.equal(rows.find(g=>g.id===1).status,'owned');assert.equal(rows.find(g=>g.id===2).status,'blocked');
  assert.ok(paints>before);assert.equal(f.requests.length,queries);
});

test('own selection confirmation hides lamps and cancels automatic retries; next match resets',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
  const f=fixture(t),user=new f.User(1000000002,'好友'),self={seat:{Index:0,IsSelf:true,PlayerInfo:new f.User(1000000001,'自己'),GeneralId:9}};
  f.ctx.game.getSeatUIs=()=>[self,{seat:{Index:1,PlayerInfo:user,Figure:1}}];
  const snapshot={inGame:true,modeId:148};f.ctx.game.getSnapshot=()=>snapshot;f.ctx.getState=()=>({sessionId:1});
  const battle=createBattleLamps(f.ctx,()=>lampSettings({lamps:true}));battle.update(snapshot,1);
  f.lamps([2],true,'好友');t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1).length,10,'existing general ID is not proof of completed selection');
  f.connection.emit('MsgGamePlayCardNtf',{Protocol:{CardList:[1,2,3]}});t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1).length,10,'deck synchronization must not hide selection lamps');
  f.connection.emit('SmsgGameSelectCharacterResult',{Protocol:{Result:0,SeatID:1}});t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1).length,10,'opponent choosing does not end our selection');
  f.connection.emit('SmsgGameSelectCharacterResult',{Protocol:{Result:0,SeatID:0}});t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1),null);
  t.mock.timers.tick(10000);battle.update(snapshot,1);assert.equal(f.requests.length,1);
  battle.update(snapshot,2);assert.equal(battle.rows(user,1).length,10);
  self.seat.GeneralId=9;battle.update(snapshot,2);assert.equal(battle.rows(user,1).length,10);
  f.ctx.getState=()=>({sessionId:2});
  f.connection.emit('SmsgGameSetCharacter',{Protocol:{Infos:[{SeatID:0,CharacterID:9}]}});t.mock.timers.tick(1);
  assert.equal(battle.rows(user,1),null,'authoritative self general assignment closes selection');
});
