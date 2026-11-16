import test from 'node:test';
import assert from 'node:assert/strict';
import {ResourceScope} from '../src/core/resources.js';
import {userId,captureFriends,normalizeRecord,pinnedFirst} from '../src/plugins/social/model.js';
import {createFriendManagement} from '../src/plugins/social/friends.js';
test('friend identity uses padded client ID; invalid and missing identities stay unknown',()=>{
 assert.equal(userId(123),'0000000123');for(const n of [null,undefined,'',0,-1,2**32,1.5])assert.equal(userId(n),null);
 const r=captureFriends(normalizeRecord(null),[{id:null,name:'same'},{id:1000000001,name:'old'}],1).record;
 const next=captureFriends(r,[{id:1000000001,name:'new'}],2);
 assert.deepEqual(next.changes,[{id:'1000000001',from:'old',to:'new',at:2}]);
 assert.equal(captureFriends(next.record,[{id:1000000001,name:'new'}],3).changes.length,0);
 assert.equal(next.record.friends['1000000001'].name,'new');
 assert.deepEqual(pinnedFirst([{id:1},{id:2},{id:3}],['0000000002'],f=>f.id).map(f=>f.id),[2,1,3]);
});
test('corrupt historical entries cannot prevent loading valid friend data',()=>{
 const r=normalizeRecord({version:1,pins:[true,'1e9',1000000001],friends:{1000000001:{name:'好友',seenAt:1}},changes:[null,{}, {id:1000000001,from:'旧名',to:'新名',at:5}]});
 assert.deepEqual(r.pins,['1000000001']);assert.equal(r.friends['1000000001'].name,'好友');assert.deepEqual(r.changes,[{id:'1000000001',from:'旧名',to:'新名',at:5}]);
});
function fixture(){
 const scope=new ResourceScope(),storage=new Map(),messages=[],errors=[],requests=[];
 class User {static names=new Map();static GetNameInstance(n){return this.names.get(n)}static SendUserBaseInfo(n){requests.push(n)}}
 const self=new User();self.ClientId=1000000000;
 let rows=[];
 const a={GroupID:1,FriendNickname:'A',friendID:1,userData:{ClientId:1000000001}},b={GroupID:1,FriendNickname:'B',friendID:2,userData:{ClientId:1000000002}};
 const manager={GetGoodFriendsList(){return [a,b].sort(this.sortFriend)},GetFriendArrBygroupID(){return this.GetGoodFriendsList()},sortFriend:(a,b)=>a.FriendNickname.localeCompare(b.FriendNickname),GetFriendByNickName(n){return [a,b].find(f=>f.FriendNickname===n)}};
 class Sprite {constructor(){this.graphics={drawLines(){},drawLine(){}}}size(){}destroy(){this.destroyed=true}}
 const stage={_children:[]};const ctx={scope,window:{Laya:{stage,Sprite}},game:{getSelf:()=>self,getServerProxy:()=>({_events:{FsCAddFriendsNtf:{caller:manager}}})},storage:{get:k=>storage.get(k),set:(k,v)=>storage.set(k,structuredClone(v))},notify:m=>messages.push(m),reportError:e=>errors.push(e)};
 function row(data){const r={data,vipIcon:{x:168,y:2,visible:false},vipSprite:{visible:false},addChild(p){this.pin=p},updateVipCrown(){this.vipIcon.visible=this.vipSprite.visible=false},updateGameStatus(){},initData(d){this.data=d}};rows.push(r);return r}
 return {scope,storage,messages,errors,requests,self,manager,a,b,stage,ctx,row};
}
test('native friend sorting, non-VIP pin and one-time rename are account isolated; disable restores owned UI',()=>{
 const f=fixture(),a=f.row(f.a),b=f.row(f.b),view={manager:f.manager,goodFriendsList:[a,b],itemResizeHandler(){this.layout=(this.layout||0)+1}};f.stage._children=[view,a,b];
 const run=createFriendManagement(f.ctx);
 assert.equal(run.togglePin('1000000002'),true);assert.equal(view.goodFriendsList[0],b);assert.equal(f.manager.GetGoodFriendsList()[0],f.b);
 assert.equal(b.pin.visible,true);assert.equal(b.vipSprite.visible,true);assert.equal(b.vipIcon.visible,false);
 assert.equal(run.togglePin('1000000002'),true);assert.equal(view.goodFriendsList[0],a);assert.equal(b.vipSprite.visible,false);assert.equal(run.togglePin('1000000002'),true);
 f.b.FriendNickname='B2';run.tick();assert.equal(f.messages.length,1);run.tick();assert.equal(f.messages.length,1);
 assert.equal(run.getRecord().changes[0].id,'1000000002');
 f.self.ClientId=1000000009;run.tick();assert.deepEqual(run.getRecord().pins,[]);assert.equal(run.getRecord().changes.length,0);
 f.scope.dispose();assert.equal(b.pin.destroyed,true);assert.equal(b.vipSprite.visible,false);assert.equal(Object.hasOwn(b,'initData'),true);
});
test('byte friendID is never persisted; unresolved users are requested once, storage failures preserve baseline',()=>{
 const f=fixture();f.a.userData=null;const run=createFriendManagement(f.ctx);assert.deepEqual(f.requests,['A']);run.tick();assert.deepEqual(f.requests,['A']);
 assert.equal(run.getRecord().friends['0000000001'],undefined);assert.equal(run.togglePin(1),false);
 f.b.FriendNickname='new';f.ctx.storage.set=()=>{throw Error('disk full')};run.tick();assert.equal(run.getRecord().friends['1000000002'].name,'B');assert.equal(f.messages.length,0);assert.match(run.getRecord().error,/disk full/);f.scope.dispose();
});
test('native friend menu adds and removes native pin action with current stable target',()=>{
 const f=fixture();function button(label){return {label,on(e,c,fn){(this.events||={})[e]=fn},off(e,c,fn){if(this.events && this.events[e]===fn)delete this.events[e]},destroy(){this.destroyed=true}}}
 const menu={useType:5,userName:'B',userData:f.b.userData,allBtnList:[],showBtnList:[],getBtn(label){const b=button(label);this.allBtnList.push(b);return b},updateOptMenu(){this.showBtnList=[];this.layoutBtn()},layoutBtn(){this.layout=(this.layout||0)+1},removeSelf(){this.closed=true}};f.stage._children=[menu];
 const run=createFriendManagement(f.ctx);assert.equal(menu.showBtnList[0].label,'置顶好友');menu.showBtnList[0].events.click();assert.equal(run.getRecord().pins[0],'1000000002');
 menu.updateOptMenu();assert.equal(menu.showBtnList[0].label,'取消置顶');const b=menu.showBtnList[0];f.scope.dispose();assert.equal(b.destroyed,true);assert.equal(menu.showBtnList.length,0);assert.equal(menu.allBtnList.length,0);
});

test('flat native menu buttons release draw commands on every close and reopen',()=>{
 const f=fixture(), commands=[], removed=[];
 const menu={useType:5,userName:'B',allBtnList:[],showBtnList:[],
  getBtn(label){const command={text:label};commands.push(command);const b={label,on(){},off(){},clear(){commands.splice(commands.indexOf(command),1)}};this.allBtnList.push(b);return b},
  removeDrawChild(button,dispose){assert.equal(dispose,true);button.clear();removed.push(button)},
  updateOptMenu(){this.showBtnList=[];this.layoutBtn()},layoutBtn(){},removeSelf(){f.stage._children=[]}};
 f.stage._children=[menu];const runtime=createFriendManagement(f.ctx);
 for(let i=0;i<30;i++){
  assert.equal(commands.length,1);assert.equal(menu.showBtnList.length,1);
  f.stage._children=[];runtime.tick();assert.equal(commands.length,0);assert.equal(menu.allBtnList.length,0);
  f.stage._children=[menu];runtime.tick();menu.updateOptMenu();
 }
 assert.equal(removed.length,30);assert.deepEqual(f.scope.dispose(),[]);assert.equal(commands.length,0);assert.equal(menu.allBtnList.length,0);
});

test('native host binds before first positioning; visible menus never acquire a late row',()=>{
 const f=fixture(),base={label:'个人信息',height:20},frames=[];
 const menu={useType:5,userName:'B',showBtnList:[base],allBtnList:[base],height:80,y:50,
  getBtn(label){const b={label,height:20,on(){},off(){},destroy(){}};this.allBtnList.push(b);return b},
  layoutBtn(){this.height=60+20*this.showBtnList.length;if(this.y+this.height>140)this.y-=this.height},
  updateOptMenu(){this.showBtnList=[base];this.layoutBtn()},ShowOptMenu(){this.updateOptMenu()}};
 const host={optMenu:menu,addChild(node){node.parent=this;f.stage._children=[this,node]},ResetOptMenuPos(){},ShowUserOptMenu(){this.addChild(this.optMenu);menu.y=50;menu.ShowOptMenu();frames.push([menu.y,menu.height])}};
 f.stage._children=[];f.ctx.game.getScene=()=>({ged:{_events:{SHOW_TEXT_PROMPT:{caller:host}}}});
 const runtime=createFriendManagement(f.ctx);host.ShowUserOptMenu();
 assert.deepEqual(frames,[[-50,100]]);assert.equal(menu.showBtnList[0].label,'置顶好友');
 for(let i=0;i<10;i++)runtime.tick();assert.deepEqual([menu.y,menu.height],frames[0]);
 f.scope.dispose();
 const g=fixture();menu.showBtnList=[base];menu.height=80;menu.y=50;g.stage._children=[menu];
 const late=createFriendManagement(g.ctx);late.tick();assert.deepEqual([menu.y,menu.height],[50,80]);assert.equal(menu.showBtnList.length,1);
 menu.ShowOptMenu();assert.equal(menu.showBtnList.length,2);g.scope.dispose();
});
