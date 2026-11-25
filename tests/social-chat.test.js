import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginNative } from '../src/core/plugin-native.js';
import { ResourceScope } from '../src/core/resources.js';
import { BINDING_CODE_FILTER, createChatEnhancements, decorateChatHTML, linkedNames, officerIcon, roomNumbers, roomTableId, ROOM_LINK } from '../src/plugins/social/chat.js';

const link = name => `<a href='ATtextNickname*&amp;.!**.%#${encodeURIComponent(name)}'>${name}</a>`;
const config = { root: { officer: [{ ID: 1, Officerid: 1 }, { ID: 32, Officerid: 9 }, { ID: 38, Officerid: 10 }] } };
test('room links cover 1–5 digit runs and never substrings of long IDs', () => {
  assert.deepEqual(roomNumbers('抗金进1，123，12345。用户123456，1234567890，0，001，1'), ['1', '123', '12345', '001']);
  assert.equal(roomTableId('12345', 22, 2), 202212345);
  assert.equal(roomTableId('123456', 22, 2), null);
  assert.equal(roomTableId('1', 0, 2), null);
});
test('native shares and link parameters never become room candidates', () => {
  for (const text of [
    'showShareGeneral*&.!**.%#48,4809,2671,12,1',
    'showShareGeneral*&amp;.!**.%#48,4809,2671,12,1',
    'enterInviteRoom*&.!**.%#48,4809,2671,12,1',
    'face*&.!.%#48',
  ]) {
    assert.deepEqual(roomNumbers(text), []);
    const html = '<font href="showShareGeneral">【拂尘独行*贾诩】</font>，快来看看吧！';
    assert.equal(decorateChatHTML(html, { MsgType: 1, chatMsg: text }), html);
  }
  assert.deepEqual(roomNumbers('https://example.com/48?skin=4809&id=2671&v=12#1'), []);
  assert.deepEqual(roomNumbers('国战来123，https://example.com/48?v=12 房间1'), ['123', '1']);
  assert.deepEqual(roomNumbers('暗流来123 <font href="share:4809">皮肤12</font> <img width="48"/>'), ['123']);
});

test('short rooms require a chat keyword and native inline face IDs remain opaque', () => {
  assert.deepEqual(roomNumbers('来1、25、123、1234、12345'), ['1234', '12345']);
  for (const keyword of ['kj', 'KJ', '抗金', '暗流', '国战', '置顶', '一轮', 'm', 'M', '军']) {
    assert.deepEqual(roomNumbers(`#25${keyword}1、8、123#69`), ['1', '8', '123']);
  }
  assert.deepEqual(roomNumbers('#25#69'), []);
  assert.deepEqual(roomNumbers('team 25 https://example.com/kj'), []);
  const html = '<img src="face25.png"/>';
  assert.equal(decorateChatHTML(html, { MsgType: 1, chatMsg: '#25' }), html);
});

test('system and all channel user mentions retain links and get exact low-rank/robot icons', () => {
  const source = `恭喜${link('甲')}和${link('乙')}晋升`;
  const lookup = name => name === '甲' ? { ClientId: 1234567890, OfficerLevel: 1 } : { ClientId: 4000000001, OfficerLevel: 38 };
  assert.deepEqual(linkedNames(source), ['甲', '乙']);
  for (const ChannelNum of [0, 1, 2, 3, 7, 9]) {
    const result = decorateChatHTML(source, { MsgType: 12, ChannelNum }, { lookup, config, robotIcon: 'robot-local.png' });
    assert.match(result, /officer\/1.png/); assert.match(result, /robot-local.png/);
    assert.ok(result.includes(link('甲'))); assert.ok(result.includes(link('乙')));
    assert.equal((result.match(/<img/g) || []).length, 2);
    assert.ok(!result.includes(ROOM_LINK));
  }
  assert.equal(officerIcon(32, config), 'res/assets/chat/officer/9_32.png');
  assert.equal(officerIcon(99, config), '');
});
test('speaker native rank is replaced once; unknown users keep original rendering', () => {
  const source = `<img src='res/assets/chat/officer/10.png'/>${link('甲')}说12345`;
  const result = decorateChatHTML(source, { SpokerMan: '甲', MsgType: 1, chatMsg: '12345' }, { config, lookup: () => ({ ClientId: 1000000000, OfficerLevel: 1 }) });
  assert.equal((result.match(/officer\//g) || []).length, 1);
  assert.match(result, /sgs-social-room:12345/);
  assert.equal(decorateChatHTML(source, {}, { config, lookup: () => null }), source);
});
test('native font href system broadcasts and double-encoded nicknames receive rank icons',()=>{
 const name='河内尉迟威',href='ATtextNickname*&amp;.!**.%#'+encodeURIComponent(encodeURIComponent(name));
 const native=`恭喜<font style="font:12px SimSun cursor:hand" color="#FFFF00" underline="1" href="${href}">${name}</font>升为中尉`;
 assert.deepEqual(linkedNames(native),[name]);
 const result=decorateChatHTML(native,{MsgType:18,ChannelNum:4},{config,lookup:n=>n===name?{ClientId:1234567890,OfficerLevel:1}:null});
 assert.match(result,/officer\/1.png/);assert.ok(result.includes(native.slice(2)),'native user link and label unchanged');
 assert.deepEqual(linkedNames(`<font href="ATtextNickname*&amp;.!**.%#${encodeURIComponent('%20')}">%20</font>`),['%20']);
});
function fixture() {
  const scope = new ResourceScope(), calls = [], userLinks = [];
  class User { static GetNameInstance() { return { ClientId: 1234567890, OfficerLevel: 1 }; } }
  const self = new User(); self.ClientId = 1000000000;
  const data = { SpokerMan: '甲', MsgType: 1, chatMsg: '来12345' };
  const row = { chatData: data, htmlTxt: { innerHTML: link('甲') + '来12345', event(type, value) { userLinks.push([type, value]); } }, width: 260, height: 22, contextHeight: 14, Size() {}, linkHandler() {} };
  const view = { getHtmlBase() { return row; }, msgContainer: { _children: [row] } };
  const rc = { TableId: 0, SendJoinTable(...args) { calls.push(['join', ...args]); }, SendLeaveTable(...args) { calls.push(['leave', ...args]); } };
  const scene = { SceneName: 'HallScene', roomListView: { modeId: 22, groupId: 2 }, chatViewUI: view };
  const ctx = { scope, window: { Laya: { Event: { LINK: 'link' }, stage: { _children: [view] } } }, document: {}, ui: { toast() {} },
    game: { getSelf: () => self, getClass: () => null, getScene: () => scene, getSnapshot: () => ({ inGame: false }), getConfigData: () => config,
      getServerProxy: () => ({ _events: { ClientTableinfoRep: { caller: rc } } }) } };
  ctx.native = createPluginNative(ctx);
  return { ctx, scope, row, view, scene, self, rc, calls, userLinks };
}

test('binding-code filtering applies only to public messages in the combined and system tabs', t => {
  const { ctx, scope, view } = fixture();
  t.after(() => scope.dispose());
  const texts = ['互换', '请绑一下', '加个好友', '周年活动', '码 ABCDE', '【AXYZBCD】', '见面再聊', 'ABCD', 'AbCDE', 'XABCDE', 'A BCDE'];
  const history = texts.map(chatMsg => ({ ChannelNum: 0, chatMsg }));
  const otherChannels = [2, 3, 4, 6, 7, undefined].map(ChannelNum => ({ ChannelNum, chatMsg: '好友 ABCDE' }));
  history.push({ ChannelNum: 0, chatMsg: '打牌吗', MessageHtml: link('周年好友') + '打牌吗' },
    { ChannelNum: 1, MessageHtml: '<font>周</font><font>年活动</font>' },
    { ChannelNum: 1, MessageHtml: '<font href="ABCDE">正常消息</font>' }, ...otherChannels);
  const settings = new Map();
  ctx.settings = { get: (key, fallback) => settings.get(key) ?? fallback };
  let selected = 0;
  view.GetCurrentShowChanel = () => selected;
  view.getHtmlBase = data => ({ chatData: data });
  view.onChatUpdateMsg = channel => {
    assert.equal(channel, selected);
    const messages = channel === 0 ? history : history.filter(data => data.ChannelNum === channel);
    view.msgContainer._children = messages.map(data => view.getHtmlBase(data)).filter(Boolean);
  };
  const switchChannel = channel => { selected = channel; view.onChatUpdateMsg(channel); };
  const rows = () => view.msgContainer._children.map(row => row.chatData);
  const nativeFactory = view.getHtmlBase;
  view.onChatUpdateMsg(0);
  const runtime = createChatEnhancements(ctx);
  const filtered = [...history.slice(6, 12), history[13], ...otherChannels];
  assert.deepEqual(rows(), filtered);
  assert.equal(view.getHtmlBase({ ChannelNum: 0, chatMsg: '新消息 AAAAA' }), null);
  assert.ok(view.getHtmlBase({ ChannelNum: 0, chatMsg: '新消息 AAAA' }));
  for (const code of ['CDEFG', 'CDEFGH']) assert.equal(view.getHtmlBase({ ChannelNum: 0, chatMsg: `码 ${code}` }), null);
  for (const code of ['CDEF', 'CdEFG', 'BCDEFG']) assert.ok(view.getHtmlBase({ ChannelNum: 0, chatMsg: `码 ${code}` }));
  assert.ok(view.getHtmlBase({ ChannelNum: 2, chatMsg: 'CDEFG' }));
  switchChannel(1);
  assert.deepEqual(rows(), [history[13]]);
  switchChannel(2);
  assert.deepEqual(rows(), [otherChannels[0]]);
  assert.ok(view.getHtmlBase({ ChannelNum: 1, chatMsg: '新消息 AAAAA' }));

  settings.set(BINDING_CODE_FILTER, false);
  runtime.tick();
  assert.deepEqual(rows(), [otherChannels[0]]);
  switchChannel(0);
  assert.deepEqual(rows(), history);
  settings.set(BINDING_CODE_FILTER, true);
  runtime.tick();
  assert.deepEqual(rows(), filtered);
  scope.dispose();
  assert.deepEqual(rows(), history);
  assert.equal(view.getHtmlBase, nativeFactory);
});

test('forged room clicks on native share parameters cannot join a room', () => {
  const f = fixture();
  f.row.chatData.chatMsg = 'showShareGeneral*&.!**.%#48,4809,2671,12,1';
  const runtime = createChatEnhancements(f.ctx);
  assert.ok(!f.row.htmlTxt.innerHTML.includes(ROOM_LINK));
  f.row.htmlTxt.event('link', `${ROOM_LINK}4809`);
  assert.deepEqual(f.calls, []);
  runtime.dispose(); f.scope.dispose();
});
test('instance patches intercept only owned room links; disposal restores HTML and native event', () => {
  const f = fixture(), before = f.row.htmlTxt.innerHTML, event = f.row.htmlTxt.event;
  const runtime = createChatEnhancements(f.ctx);
  assert.match(f.row.htmlTxt.innerHTML, /officer\/1.png/);
  f.row.htmlTxt.event('link', 'ATtextNickname*&.!**.%#甲');
  assert.equal(f.userLinks.length, 1);
  f.row.htmlTxt.event('link', `${ROOM_LINK}12345`);
  assert.deepEqual(f.calls, [['join', 202212345, 22]]);
  f.row.htmlTxt.event('link', `${ROOM_LINK}12345`); assert.equal(f.calls.length, 1);
  f.row.htmlTxt.event('link', `${ROOM_LINK}99999`);
  assert.equal(f.calls.length, 1);
  runtime.dispose(); runtime.dispose(); assert.equal(f.row.htmlTxt.innerHTML, before); assert.equal(f.row.htmlTxt.event, event); f.scope.dispose();
});
test('queued leave/join is single-shot and cancelled on account change or disable', () => {
  const f = fixture(); f.rc.TableId = 202200001; f.scene.SceneName = 'RoomScene';
  const runtime = createChatEnhancements(f.ctx);
  assert.equal(runtime.requestEnterRoom('12345'), true); assert.equal(runtime.requestEnterRoom('1'), false);
  assert.deepEqual(f.calls, [['leave', 1, true]]);
  f.self.ClientId = 1000000001; f.rc.TableId = 0; f.scene.SceneName = 'HallScene'; runtime.tick();
  assert.equal(f.calls.length, 1);
  f.ctx.game.getSnapshot = () => ({ inGame: true }); assert.equal(runtime.requestEnterRoom('1'), false);
  f.scope.dispose(); runtime.tick(); assert.equal(runtime.requestEnterRoom('1'), false); assert.equal(f.calls.length, 1);
});
test('real Laya setter-only HTML shape decorates, relayouts and restores', () => {
  const f = fixture(), before = f.row.htmlTxt.innerHTML;
  delete f.row.htmlTxt.innerHTML; f.row.htmlTxt._innerHTML = before;
  Object.defineProperty(f.row.htmlTxt, 'innerHTML', { set(value) { this._innerHTML = value; }, configurable: true });
  f.view._children = [f.row]; let refreshed = 0; f.view.msgContainer.refresh = () => refreshed++;
  const runtime = createChatEnhancements(f.ctx);
  assert.match(f.row.htmlTxt._innerHTML, /officer\/1.png/); assert.ok(refreshed > 0);
  runtime.tick(); assert.equal((f.row.htmlTxt._innerHTML.match(/officer\//g) || []).length, 1);
  runtime.dispose(); assert.equal(f.row.htmlTxt._innerHTML, before); f.scope.dispose();
});
test('pending room entry is cancelled when mode changes', () => {
  const f = fixture(); f.rc.TableId = 202200001; f.scene.SceneName = 'RoomScene';
  const runtime = createChatEnhancements(f.ctx); runtime.requestEnterRoom('12345');
  f.scene.roomListView.modeId = 73; f.rc.TableId = 0; f.scene.SceneName = 'HallScene'; runtime.tick();
  assert.deepEqual(f.calls, [['leave', 1, true]]); f.scope.dispose();
});
test('known password rooms prompt before sending and use native password join arguments',()=>{
 const f=fixture(),opened=[];f.rc.Ged={_(...args){opened.push(args)}};
 f.scene.roomListView.hallManager={getTableInfoByID:id=>({HasPass:true,TableID:id})};
 const runtime=createChatEnhancements(f.ctx);assert.equal(runtime.requestEnterRoom('6776'),true);assert.equal(f.calls.length,0);
 const [name,owner,callback]=opened[0];assert.equal(name,'ShowPwdWindow');callback.call(owner,'1357');
 assert.deepEqual(f.calls,[['join',202206776,22,255,0,'1357',0,1]]);
 callback.call(owner,'9999');assert.equal(f.calls.length,1);f.scope.dispose();
});
test('own initial password rejection opens input; manual joins and stale callbacks retain native handling',()=>{
 const f=fixture(),opened=[],events=[];f.rc.Ged={_(...args){opened.push(args)}};f.rc.event=(...args)=>events.push(args);
 const native=f.rc.event,runtime=createChatEnhancements(f.ctx);runtime.requestEnterRoom('6776');
 f.rc.event('PASSWORD_ERROR_EVENT');assert.equal(events.length,0);assert.equal(opened.length,1);assert.equal(f.rc.event,native);
 f.rc.event('PASSWORD_ERROR_EVENT');assert.equal(events.length,1,'typed password errors retain native dialog');
 f.self.ClientId++;opened[0][2].call(opened[0][1],'1234');assert.equal(f.calls.length,1);f.scope.dispose();
 const g=fixture();g.rc.Ged={_(){throw Error('must not open unrelated prompt')}};g.rc.event=(...args)=>events.push(args);
 const run=createChatEnhancements(g.ctx);run.requestEnterRoom('6776');g.rc.SendJoinTable(202200001,22);g.rc.event('PASSWORD_ERROR_EVENT');assert.equal(events.length,2);g.scope.dispose();
});
test('robot texture is preloaded before native HTML insertion and late completion is ignored', () => {
  const f = fixture(); f.self.constructor.GetNameInstance = () => ({ ClientId: 4000000001, OfficerLevel: 1 });
  const drawing = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {}, fillRect() {} };
  f.ctx.document = { createElement: () => ({ getContext: () => drawing, toDataURL: () => 'data:image/png;base64,robot' }) };
  let callback; f.ctx.window.Laya.Handler = { create: (_caller, fn) => fn };
  f.ctx.window.Laya.loader = { load: (_url, complete) => { callback = complete; } };
  const runtime = createChatEnhancements(f.ctx);
  assert.ok(!f.row.htmlTxt.innerHTML.includes('<img'));
  callback(); assert.match(f.row.htmlTxt.innerHTML, /data:image\/png;base64,robot/);
  runtime.dispose(); const restored = f.row.htmlTxt.innerHTML; callback();
  assert.equal(f.row.htmlTxt.innerHTML, restored); f.scope.dispose();
});
test('unique robot URL ownership cancels and releases only its own cache, including late completion', () => {
  const f = fixture(), cache = new Map([['native-officer.png', { native: true }]]), cleared = [], revoked = [], cancelled = [];
  f.self.constructor.GetNameInstance=()=>({ClientId:4000000001,OfficerLevel:1});
  const drawing = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {}, fillRect() {} };
  f.ctx.document = { createElement: () => ({ getContext: () => drawing, toDataURL: () => 'data:image/png;base64,cm9ib3Q=' }) };
  f.ctx.window.URL = { createObjectURL: () => 'blob:owned-robot', revokeObjectURL: url => revoked.push(url) };
  f.ctx.window.Blob = Blob; f.ctx.window.atob = atob;
  let complete; f.ctx.window.Laya.Handler = { create: (_caller, fn) => fn };
  f.ctx.window.Laya.loader = { load: (_url, callback) => { complete = callback; }, getRes: url => cache.get(url),
    cancelLoadByUrl: url => cancelled.push(url), clearRes: url => { cleared.push(url); cache.delete(url); } };
  const runtime = createChatEnhancements(f.ctx); runtime.dispose();
  assert.deepEqual(cancelled, ['blob:owned-robot']); assert.deepEqual(revoked, ['blob:owned-robot']);
  cache.set('blob:owned-robot', { ready: true }); complete();
  assert.deepEqual(cleared, ['blob:owned-robot']); assert.ok(cache.has('native-officer.png')); assert.ok(!cache.has('blob:owned-robot'));
  assert.deepEqual(revoked, ['blob:owned-robot']); f.scope.dispose();
});

test('existing native officer service works without config and rank images wait for real readiness',()=>{
 const f=fixture(),cache=new Map(),loads=new Map(),officer={GetOfficerChatIcon:n=>n===1?'res/assets/chat/officer/1.png':''};
 const proxy={_events:{ClientTableinfoRep:{caller:f.rc},ClientOfficerInfoRep:{caller:officer}}};
 f.ctx.game.getServerProxy=()=>proxy;f.ctx.game.getConfigData=()=>null;
 f.ctx.window.Laya.Handler={create:(_caller,fn)=>fn};f.ctx.window.Laya.loader={getRes:url=>cache.get(url),load:(url,callback)=>loads.set(url,callback)};
 const runtime=createChatEnhancements(f.ctx);assert.doesNotMatch(f.row.htmlTxt.innerHTML,/officer\/1.png/);
 assert.equal(f.row.visible, false);
 assert.equal(runtime.getDiagnostics().nativeOfficer,true);assert.equal(runtime.getDiagnostics().loading,1);
 cache.set('res/assets/chat/officer/1.png',{getIsReady:()=>true});loads.get('res/assets/chat/officer/1.png')();
 assert.equal(f.row.visible, true);
 assert.match(f.row.htmlTxt.innerHTML,/officer\/1.png/);assert.equal(runtime.getDiagnostics().inserted,1);
 assert.equal(runtime.getDiagnostics().loading,0);f.scope.dispose();
});
test('visible chat profiles enqueue together newest-first, skip clipped history, deduplicate and follow scrolling',()=>{
 const f=fixture(),requests=[];
 f.self.constructor.SendUserDetailReq=(name,force)=>requests.push([name,force]);
 const container=f.view.msgContainer;
 container.scrollRect={x:0,y:60,width:260,height:60};
 container.localToGlobal=p=>({x:p.x,y:p.y-container.scrollRect.y});
 container.parent=f.view;
 const rows=Array.from({length:8},(_,i)=>({chatData:{MsgType:1,SpokerMan:'玩家'+i,chatMsg:'测试'},
   htmlTxt:{innerHTML:link('玩家'+i),event(){}},width:260,height:20,contextHeight:20,y:i*20,parent:container,
   localToGlobal(p){return{x:p.x,y:this.y+p.y-container.scrollRect.y}},Size(){},linkHandler(){}}));
 rows[4].visible=false;
 container._children=rows;
 const runtime=createChatEnhancements(f.ctx);
 assert.deepEqual(requests,[['玩家5',false],['玩家3',false]],'whole visible viewport queued immediately bottom-up');
 runtime.tick();assert.equal(requests.length,2,'no repeated requests each tick');
 container.scrollRect.y=100;runtime.tick();
 assert.deepEqual(requests.slice(2),[['玩家7',false],['玩家6',false]],'newly visible names prioritized newest-first');
 runtime.dispose();runtime.tick();assert.equal(requests.length,4);f.scope.dispose();
});

test('all player links in one visible system message enqueue without waiting between names',()=>{
 const f=fixture(),requests=[];f.self.Nickname='自己';
 f.self.constructor.SendUserDetailReq=(name,force)=>requests.push([name,force]);
 f.row.htmlTxt.innerHTML=link('甲')+link('乙')+link('甲')+link('自己');
 const runtime=createChatEnhancements(f.ctx);
 assert.deepEqual(requests,[['乙',false],['甲',false]]);
 f.scope.dispose();runtime.tick();assert.equal(requests.length,2);
});

test('cached nickname with placeholder rank automatically loads native detail without clicking',()=>{
 const f=fixture(),user={ClientId:1234567890,OfficerLevel:1,BaseInfoInit:false},requests=[];
 f.self.constructor.GetNameInstance=()=>user;f.self.constructor.SendUserDetailReq=(name,force)=>requests.push([name,force]);
 const runtime=createChatEnhancements(f.ctx);assert.deepEqual(requests,[['甲',false]]);
 runtime.tick();assert.equal(requests.length,1);
 user.BaseInfoInit=true;user.OfficerLevel=38;runtime.tick();assert.match(f.row.htmlTxt.innerHTML,/officer\/10.png/);
 runtime.dispose();runtime.tick();assert.equal(requests.length,1);f.scope.dispose();
});

test('a chat row waits for each unresolved officer rank and then shows them together', t => {
  const f = fixture(), requests = [], profiles = new Map();
  t.after(() => f.scope.dispose());
  f.self.constructor.GetNameInstance = name => profiles.get(name);
  f.self.constructor.SendUserDetailReq = (name, force) => requests.push([name, force]);
  f.row.chatData = { MsgType: 9 };
  f.row.htmlTxt.innerHTML = link('甲') + link('乙');
  const runtime = createChatEnhancements(f.ctx);
  assert.equal(f.row.visible, false);
  assert.deepEqual(requests, [['乙', false], ['甲', false]]);
  profiles.set('甲', { BaseInfoInit: true, OfficerLevel: 38 });
  runtime.tick();
  assert.equal(f.row.visible, false);
  profiles.set('乙', { BaseInfoInit: true, OfficerLevel: 1 });
  runtime.tick();
  assert.equal(f.row.visible, true);
  assert.match(f.row.htmlTxt.innerHTML, /officer\/10\.png.*officer\/1\.png/);
});

test('a rebuilt message keeps its ten-second deadline and can still gain a late rank', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), requests = [];
  t.after(() => f.scope.dispose());
  let time = 0, profile;
  f.ctx.now = () => time;
  f.self.constructor.GetNameInstance = () => profile;
  f.self.constructor.SendUserDetailReq = name => requests.push(name);
  f.view.getHtmlBase = data => ({ ...f.row, chatData: data, htmlTxt: { innerHTML: link('甲') }, visible: true });
  const runtime = createChatEnhancements(f.ctx);
  assert.equal(f.row.visible, false);
  time = 6000;
  t.mock.timers.tick(6000);
  const rebuilt = f.view.getHtmlBase(f.row.chatData);
  f.view.msgContainer._children = [rebuilt];
  runtime.tick();
  assert.equal(rebuilt.visible, false);
  time = 9999;
  t.mock.timers.tick(3999);
  assert.equal(rebuilt.visible, false);
  time = 10000;
  t.mock.timers.tick(1);
  assert.equal(rebuilt.visible, true);
  assert.doesNotMatch(rebuilt.htmlTxt.innerHTML, /officer\//);
  assert.deepEqual(requests, ['甲']);
  profile = { BaseInfoInit: true, OfficerLevel: 1 };
  runtime.tick();
  assert.match(rebuilt.htmlTxt.innerHTML, /officer\/1\.png/);
  const next = f.view.getHtmlBase({ ...f.row.chatData, SpokerMan: '乙' });
  f.self.constructor.GetNameInstance = () => undefined;
  f.view.msgContainer._children = [next];
  runtime.tick();
  assert.equal(next.visible, true, 'an already displayed row does not start waiting on a later cache miss');
});

test('filtered chat and decrees skip player lookup, requests and rank image loading', t => {
  const f = fixture(), lookedUp = [], requests = [], loads = [];
  t.after(() => f.scope.dispose());
  f.self.constructor.GetNameInstance = name => { lookedUp.push(name); return null; };
  f.self.constructor.SendUserDetailReq = name => requests.push(name);
  f.ctx.window.Laya.Handler = { create: (_caller, fn) => fn };
  f.ctx.window.Laya.loader = { load: url => loads.push(url) };
  const data = name => ({ ChannelNum: 0, chatMsg: '周年', MessageHtml: link(name), SpokerMan: name, OfficerLv: 38 });
  const createRow = data => ({ ...f.row, chatData: data, htmlTxt: { innerHTML: data.MessageHtml }, visible: true });
  f.view.GetCurrentShowChanel = () => 0;
  f.view.getHtmlBase = createRow;
  const oldData = data('已有聊天'), oldRow = createRow(oldData);
  f.view.msgContainer._children = [oldRow];
  f.view.onChatUpdateMsg = () => {
    f.view._children = [];
    f.view.msgContainer._children = [f.view.getHtmlBase(oldData)].filter(Boolean);
  };
  const banner = f.view.superZhaolingUI = { itemUIs: [createRow(data('已有诏令'))], updateData(data) {
    this.itemUIs.push(createRow(data));
  } };
  f.view.layoutSuperZhao = () => {};
  f.view._children = [oldRow];
  banner._children = banner.itemUIs;
  f.ctx.window.Laya.stage._children.push(banner);
  const runtime = createChatEnhancements(f.ctx);
  assert.deepEqual(f.view.msgContainer._children, []);
  assert.equal(f.view.getHtmlBase(data('新聊天')), null);
  banner.updateData(data('新诏令'));
  runtime.tick();
  assert.deepEqual(banner.itemUIs.map(row => row.visible), [false, false]);
  assert.deepEqual(lookedUp, []);
  assert.deepEqual(requests, []);
  assert.deepEqual(loads, []);
});

test('late HTML wrap height updates following message positions without new markup',()=>{
 const f=fixture();f.row.Size=function(w,h){this.height=h+8};
 const second={chatData:{},height:22,y:22};f.view.msgContainer._children.push(second);
 const runtime=createChatEnhancements(f.ctx);f.row.contextHeight=62;runtime.tick();
 assert.equal(f.row.height,70);assert.equal(second.y,70,'next row starts after all wrapped lines');
 runtime.tick();assert.equal(second.y,70);f.scope.dispose();
});
