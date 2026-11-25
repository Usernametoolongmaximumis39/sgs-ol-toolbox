import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const out=resolve('test-results/social');await mkdir(out,{recursive:true});
const sourcePath=resolve(process.env.SGS_SOCIAL_CLIENT_SOURCE||resolve(homedir(),'AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs'));
const source=await readFile(sourcePath,'utf8');
function method(start,end,from){
 assert.ok(from>=0,`${sourcePath}: 找不到 ${start} 所在的原生类`);
 const a=source.indexOf(start,from), b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,`${sourcePath}: 找不到完整的原生方法 ${start}`);
 const code=source.slice(a,b);
 assert.doesNotThrow(()=>new Function(`return class {${code}}`),`${sourcePath}: 无法解析原生方法 ${start}`);
 return code;
}
const vip=method('updateVipCrown(){','updateLevelTxt(){',source.indexOf('class kqi'));
const resize=method('itemResizeHandler(){','Clear(){',source.indexOf('findFriendItem(this.goodFriendsList'));
const office=method('getOfficeImg(t){','getGuildImg(){',source.indexOf('class aJi'));
const passwordConfirm=method('vt(){','destroy(){',source.indexOf('class z8i'));
const nativeOfficerIcon=method('GetOfficerChatIcon(t){','set CurOfficerLv(t)',source.indexOf('class cZt'));
const nativeDetailRequest=method('static SendUserDetailReq(t,i=!1){','static SendUserTTDateReq(t)',source.indexOf('class NNt'));
const nativeChatSize=method('Size(t,i){','get Drawed(){',source.indexOf('class aJi'));
const nativeChatRefresh=method('onChatUpdateMsg(t){','chatInputEvent(t){',source.indexOf('onChatMsg(t,i){let s=!0;if(this.currentShowChanel'));
const nativeShowDecree=method('showSuperZhaoLing(t){','layoutSuperZhao(){',source.indexOf('onChatMsg(t,i){let s=!0;if(this.currentShowChanel'));
const nativeLayoutDecree=method('layoutSuperZhao(){','hideSuperZhaoLing(){',source.indexOf(nativeShowDecree));
const nativeInsertDecree=method('updateData(t){','getHtmlBase(t){',source.lastIndexOf('class ',source.indexOf('i.SetSuperZhaoLing(t),i.SetRescriptMsg(!0),i}')));
 await writeFile(resolve(out,'native-source.js'),['export const nativeVip={'+vip+'};','export const nativeResize={'+resize+'};','export const nativeOffice={'+office+'};','export const nativeOfficerService={'+nativeOfficerIcon+'};','export const nativeDetailRequest={'+nativeDetailRequest.replace('static ','')+'};','export const nativeChatSize={'+nativeChatSize+'};'].join('\n'));
 await writeFile(resolve(out,'source-report.json'),JSON.stringify({source:sourcePath,sha256:createHash('sha256').update(source).digest('hex'),methods:[vip,resize,office,passwordConfirm,nativeOfficerIcon,nativeDetailRequest,nativeChatSize,nativeChatRefresh,nativeShowDecree,nativeLayoutDecree,nativeInsertDecree].map(code=>({name:code.slice(0,code.indexOf('{')),offset:source.indexOf(code),end:source.indexOf(code)+code.length,sha256:createHash('sha256').update(code).digest('hex')}))},null,2));
const bundle=await build({stdin:{contents:"export {mountPluginUI} from './src/ui/plugin-ui.js';export {createFriendManagement} from './src/plugins/social/friends.js';export {createChatEnhancements} from './src/plugins/social/chat.js';export {createLampTracking} from './src/plugins/social/lamps.js';export {activate,renderHistory} from './src/plugins/social/index.js';export {ResourceScope} from './src/core/resources.js';export {createPluginNative} from './src/core/plugin-native.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'SocialCheck'});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],checks=[];
const roomFilterBundle=await build({entryPoints:['src/plugins/social/room-filter.js'],bundle:true,write:false,format:'iife',globalName:'RoomFilterCheck'});
try{
 const page=await browser.newPage({viewport:{width:1150,height:780}});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head><base href="http://social.fixture/"></head><body style="margin:0"></body></html>');
 for(const file of ['laya.core.min.js','laya.ui.min.js','laya.html.min.js']) await page.addScriptTag({path:resolve(process.env.SGS_LAYA_DIR||'C:/Users/Admin/AppData/Local/Temp/sgsres/game',file)});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=24;c.height=24;const g=c.getContext('2d');g.fillStyle='#b39044';g.beginPath();g.moveTo(12,1);g.lineTo(22,8);g.lineTo(19,20);g.lineTo(12,23);g.lineTo(5,20);g.lineTo(2,8);g.closePath();g.fill();g.strokeStyle='#e6d48b';g.lineWidth=2;g.beginPath();g.moveTo(7,9);g.lineTo(12,16);g.lineTo(18,7);g.stroke();return c.toDataURL().split(',')[1]});
 await page.route('http://social.fixture/**',async route=>{await new Promise(r=>setTimeout(r,100));await route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')})});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(({vip,resize,office,passwordConfirm,nativeOfficerIcon,nativeDetailRequest,nativeChatSize})=>{
  Laya.init(1150,780);Laya.URL.basePath='http://social.fixture/';Laya.stage.bgColor='#161813';
  const text=(parent,value,x,y,width=250,size=16)=>{const t=new Laya.Text();Object.assign(t,{text:value,x,y,width,height:28,font:'Microsoft YaHei',fontSize:size,color:'#e5d4b0'});parent.addChild(t);return t};
  text(Laya.stage,'好友与聊天 · 原生控件演练',30,20,700,23);text(Laya.stage,'本地模拟资料与图标，未连接官服',30,54,700,13);
  window.users=new Map([['青山旧友',{ClientId:1234567891,Nickname:'青山旧友',OfficerLevel:1,VipActiveLevel:0}],['长江东逝水',{ClientId:1234567892,Nickname:'长江东逝水',OfficerLevel:3,VipActiveLevel:3}],['神军大在',{ClientId:4000000001,Nickname:'神军大在',OfficerLevel:2,VipActiveLevel:0}]]);
  class User{static GetNameInstance(name){return users.get(name)}static VipCrownStr(level){return 'vip'+level}}
  window.detailRequests=[];User.TryGetUserDataUid=()=>0;User.detailTimeCD=180;const detailTimes=new Map();User.reqUserDetailTimeDic={get:n=>detailTimes.get(n),add:(n,t)=>detailTimes.set(n,t)};
  User.SendUserDetailReq=new Function('NNt','QV','ks','ve','DNt','return ({'+nativeDetailRequest.replace('static ','')+'}).SendUserDetailReq')(User,class {},{ORIGINAL_SERVER:1},{I:()=>({L(){throw Error('forced request not allowed')}})},{I:()=>({AddMsg(req){detailRequests.push(req.Nickname);Laya.timer.once(120,null,()=>{const user=users.get(req.Nickname);if(user){user.BaseInfoInit=true;if(req.Nickname==='青山旧友')user.OfficerLevel=3}})}})});
  users.get('青山旧友').BaseInfoInit=false;
  window.account=1234567890;window.notices=[];window.values=new Map();window.joined=[];
  window.self={ClientId:account,constructor:User};window.scope=new SocialCheck.ResourceScope();
  const proxy=window.proxy=new Laya.EventDispatcher();
  window.friendRows=Array.from(users.values()).slice(0,2).map((u,i)=>({FriendNickname:u.Nickname,userData:u,GroupID:1,friendID:i+1,vip:i?3:0,FriendState:i?1:0}));
  window.manager={GetGoodFriendsList(){return this.GetFriendArrBygroupID(1)},GetFriendArrBygroupID(){return [...friendRows].sort(this.sortFriend)},sortFriend(a,b){return b.vip-a.vip},GetFriendByNickName(name){return friendRows.find(f=>f.FriendNickname===name)}};
  proxy.on('FsCAddFriendsNtf',manager,function(){});
  const list=window.list=new Laya.Sprite();list.pos(30,110);list.size(220,360);Laya.stage.addChild(list);
  list.graphics.drawRect(0,0,220,360,'#25251d','#746344',1);list.goodFriendsList=[];list.newFriendsList=[];list.blackFriendsList=[];list.startPosY=32;list.txtWidth=24;list.gap=3;
  list.goodTitle=text(list,'我的好友',10,8,180,14);list.newTitle=text(list,'',0,0);list.blackTitle=text(list,'黑名单',10,0,180,14);list.panel={UpdateDrawContent(){}};
  list.itemResizeHandler=new Function('return ({'+resize+'}).itemResizeHandler')();
  const updateVip=new Function('NNt','mNt','return ({'+vip+'}).updateVipCrown')(User,{GetRes:key=>key});
  for(const d of manager.GetGoodFriendsList()){
   const row=new Laya.Sprite();row.pos(15,0);row.size(186,46);row.data=d;row.userData=d.userData;row.inited=true;row.updateVipCrown=updateVip;row.graphics.drawRect(0,0,186,46,'#353329','#514832',1);row.graphics.drawRect(4,4,37,37,'#53655d');text(row,d.FriendNickname,48,6,120,14);text(row,d.vip?'在线 · Lv.100':'离线 · Lv.36',48,28,125,11);
   row.vipSprite=new Laya.Sprite();row.vipSprite.pos(158,0);row.vipSprite.graphics.drawPoly(0,0,[0,0,28,0,28,28],'#929187');row.addChild(row.vipSprite);
   row.vipIcon=new Laya.Sprite();row.vipIcon.pos(168,2);row.vipIcon.size(16,16);row.vipIcon.graphics.drawRect(1,1,13,12,'#d1c4a1');row.addChild(row.vipIcon);row.updateVipCrown();list.addChild(row);list.goodFriendsList.push(row);
  }list.itemResizeHandler();
  window.menu=new Laya.Sprite();menu.pos(275,112);menu.size(138,260);menu.graphics.drawRect(0,0,138,260,'#25251e','#746344',1);menu.userName='青山旧友';menu.userData=users.get(menu.userName);menu.useType=5;menu.showBtnList=[];menu.allBtnList=[];Laya.stage.addChild(menu);
  menu.getBtn=function(label){const b=new Laya.Sprite();b.size(120,25);let name=text(b,label,0,2,120,15);name.align='center';Object.defineProperty(b,'label',{get(){return name.text},set(v){name.text=v}});b.mouseEnabled=true;b.on('mouseover',b,()=>b.graphics.drawRect(0,0,120,25,'#403b29'));b.on('mouseout',b,()=>b.graphics.clear());menu.allBtnList.push(b);menu.addChild(b);return b};
  const baseButtons=['个人信息','发送信件','复制昵称','修改备注','删除好友','穿戴对比','举报玩家','加黑名单'].map(s=>menu.getBtn(s));
  menu.layoutBtn=function(){this.showBtnList.forEach((b,i)=>{b.pos(9,8+i*27);b.visible=true});this.height=16+this.showBtnList.length*27};
  menu.updateOptMenu=function(){this.showBtnList=[...baseButtons];this.layoutBtn()};menu.updateOptMenu();
  window.scene={SceneName:'HallScene',chatViewUI:null,roomListView:{modeId:22,groupId:1}};
  const controller=window.controller=new Laya.EventDispatcher();controller.TableId=0;controller.SendJoinTable=(...args)=>joined.push(args);proxy.on('ClientTableinfoRep',controller,function(){});
  window.nativePasswordErrors=0;controller.on('PASSWORD_ERROR_EVENT',controller,()=>nativePasswordErrors++);
  controller.Ged={_(name,caller,callback){if(name!=='ShowPwdWindow')throw Error('unexpected native window');
   window.passwordWindow?.destroy(true);const win=window.passwordWindow=new Laya.Sprite();win.pos(430,250);win.size(260,140);win.graphics.drawRect(0,0,260,140,'#29271f','#a49264',1);Laya.stage.addChild(win);
   text(win,'请输入房间密码',25,14,200,18);win.passwordInput=new Laya.TextInput();Object.assign(win.passwordInput,{x:30,y:50,width:200,height:28,type:'password',maxChars:4,restrict:'0-9',color:'#eee0ba',bgColor:'#171810',borderColor:'#786c50'});win.addChild(win.passwordInput);
   win.callBackObj=caller;win.callBackFun=callback;win.vt=new Function('wKi','gNt','return ({'+passwordConfirm+'}).vt')({ShowTextPrompt(){}},{CONFIRM_PWD_TITLE:'请输入密码'});
   const confirm=new Laya.Sprite();confirm.size(70,28);confirm.pos(95,95);confirm.graphics.drawRect(0,0,70,28,'#51462d','#ad9560',1);text(confirm,'确认',17,3,60,15);confirm.mouseEnabled=true;confirm.on('click',win,win.vt);win.addChild(confirm);
  }};
  window.chat=new Laya.Sprite();chat.pos(450,110);chat.size(660,390);chat.graphics.drawRect(0,0,660,390,'#24261f','#746344',1);Laya.stage.addChild(chat);chat.msgContainer=new Laya.Sprite();chat.msgContainer.pos(12,35);chat.addChild(chat.msgContainer);text(chat,'公屏 / 综合 / 工会 / 系统',15,8,600,14);
  const getOfficeImg=new Function('return ({'+office+'}).getOfficeImg')();
  const sizeChat=new Function('return ({'+nativeChatSize+'}).Size')();
  chat.getHtmlBase=function(data){const row=new Laya.Sprite();row.chatData=data;row.getOfficeImg=getOfficeImg;row.size(630,42);row.htmlTxt=new Laya.HTMLDivElement();row.htmlTxt.width=630;Object.assign(row.htmlTxt.style,{fontFamily:'Microsoft YaHei',fontSize:17,color:'#d8d1b4',leading:5,wordWrap:true});row.htmlTxt.innerHTML=data.MessageHtml;row.addChild(row.htmlTxt);row.Size=sizeChat;Object.defineProperty(row,'contextHeight',{get:()=>row.htmlTxt.contextHeight});row.htmlTxt.on('link',row,href=>{row.nativeLink=href});this.msgContainer.addChild(row);return row};
  scene.chatViewUI=chat;
  window.config={root:{officer:[{ID:1,Officerid:1,bigName:'士兵'},{ID:2,Officerid:2,bigName:'伍长'},{ID:3,Officerid:3,bigName:'偏将军'}]}};
  const nativeOfficer={GetOfficerChatIcon:new Function('IF','return ({'+nativeOfficerIcon+'}).GetOfficerChatIcon')({I:()=>({GetlittleOfficerById:id=>config.root.officer.find(v=>v.ID===id)})})};proxy.on('ClientOfficerInfoRep',nativeOfficer,function(){});
  window.ctx={window,document,scope,storage:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>{values.set(k,structuredClone(v));return v}},settings:{get:(k,d)=>values.get(k)??d,set:(k,v)=>values.set(k,v)},game:{getSelf:()=>({...self,ClientId:account}),getScene:()=>scene,getClass:()=>null,getServerProxy:()=>proxy,getConfigData:()=>config,loadConfigData:async()=>config},ui:{toast:message=>notices.push(message)},notify:message=>notices.push(message)};
  ctx.native=SocialCheck.createPluginNative(ctx);
  window.friendRuntime=SocialCheck.createFriendManagement(ctx);window.chatRuntime=SocialCheck.createChatEnhancements(ctx);friendRuntime.tick();chatRuntime.tick();
  // Native SM.htmlStyleLink uses font[href], not an HTML anchor.
  const user=name=>'<font style="font:12px SimSun cursor:hand" color="#ddcb76" underline="1" href="ATtextNickname*&amp;.!**.%#'+encodeURIComponent(encodeURIComponent(name))+'">'+name+'</font>';
  window.messages=[{ChannelNum:1,MsgType:1,SpokerMan:'青山旧友',OfficerLv:1,chatMsg:'房间 12345 等你来',MessageHtml:user('青山旧友')+'：房间 12345 等你来'},{ChannelNum:2,MsgType:1,SpokerMan:'长江东逝水',OfficerLv:3,MessageHtml:user('长江东逝水')+'：综合频道也显示官阶'},{ChannelNum:3,MsgType:1,SpokerMan:'青山旧友',OfficerLv:1,chatMsg:'工会频道 54321',MessageHtml:user('青山旧友')+'：工会频道 54321'},{ChannelNum:4,MsgType:9,MessageHtml:'恭喜 '+user('神军大在')+' 在活动中获得稀有武将！'},{ChannelNum:4,MsgType:9,MessageHtml:'恭喜 '+user('青山旧友')+' 升官阶！'}];
  window.chatRows=messages.map((m,i)=>{const row=chat.getHtmlBase(m);row.pos(0,i*55);return row});chatRuntime.tick();
  window.initialProfileBatch=detailRequests.slice();
  window.initialChatVisibility=chatRows.map(row=>row.visible);
 },{vip,resize,office,passwordConfirm,nativeOfficerIcon,nativeDetailRequest,nativeChatSize});
 assert.deepEqual(await page.evaluate(()=>initialProfileBatch),['青山旧友','神军大在','长江东逝水'],'whole visible viewport enqueues newest-first in the same tick');
 assert.deepEqual(await page.evaluate(()=>initialChatVisibility),[false,false,false,true,false],'native chat hides rows whose rank is still loading');
 checks.push('all distinct visible player names queued in the first tick newest-first, with native non-forced cooldown');
 assert.deepEqual(await page.evaluate(()=>friendRuntime.getRecord().pins),[]);
 assert.deepEqual(await page.evaluate(()=>list.goodFriendsList.map(r=>r.data.FriendNickname)),['长江东逝水','青山旧友']);
 assert.equal(await page.evaluate(()=>menu.showBtnList[0].label),'置顶好友');
 await page.mouse.click(335,132);await page.evaluate(()=>friendRuntime.tick());
 assert.deepEqual(await page.evaluate(()=>list.goodFriendsList.map(r=>r.data.FriendNickname)),['青山旧友','长江东逝水']);
 assert.deepEqual(await page.evaluate(()=>friendRuntime.getRecord().pins),['1234567891']);
 assert.deepEqual(await page.evaluate(()=>{const r=list.goodFriendsList[0];return [r.vipSprite.visible,r.vipIcon.visible,r.getChildAt(r.numChildren-1).visible]}),[true,false,true]);
 checks.push('native menu mouse click pins non-VIP friend using stable account ID','native list reordered and VIP corner replaced');
 await page.evaluate(()=>{menu.userName='青山旧友';menu.userData=users.get(menu.userName);Laya.stage.addChild(menu);menu.updateOptMenu();friendRuntime.tick()});
 assert.equal(await page.evaluate(()=>menu.showBtnList[0].label),'取消置顶');
 await page.waitForFunction(()=>chatRows.every(r=>r.htmlTxt._element._children.some(c=>c._tex?.getIsReady())));await page.waitForTimeout(80);
 await page.screenshot({path:resolve(out,'native-pinned-menu.png')});
 const startupRequests=await page.evaluate(()=>{
  friendRuntime.dispose();
  window.savedFriendProfiles=friendRows.map(row=>row.userData);
  for(const row of friendRows)row.userData=null;
  const requests=[];
  class LoadingUser{static SendUserBaseInfo(name){requests.push(name)}}
  const game={...ctx.game,getSelf:()=>({...ctx.game.getSelf(),constructor:LoadingUser})};
  const loadingContext={...ctx,game};loadingContext.native=SocialCheck.createPluginNative(loadingContext);
  window.friendRuntime=SocialCheck.createFriendManagement(loadingContext);
  return requests;
 });
 assert.deepEqual(startupRequests,['青山旧友']);
 assert.equal(await page.evaluate(()=>list.goodFriendsList[0].data.FriendNickname),'长江东逝水');
 const firstNativeOrder=await page.evaluate(()=>{
  friendRows[0].userData=savedFriendProfiles[0];
  proxy.event('ClientUserbaseinfoRep',{Protocol:{clientID:1234567891}});
  return manager.GetGoodFriendsList().map(f=>f.FriendNickname);
 });
 assert.deepEqual(firstNativeOrder,['青山旧友','长江东逝水']);
 await page.waitForFunction(()=>{
  const row=list.goodFriendsList[0];
  return row.data.FriendNickname==='青山旧友'&&row.getChildAt(row.numChildren-1).visible&&!row.vipIcon.visible;
 });
 await page.screenshot({path:resolve(out,'native-startup-pin.png'),clip:{x:28,y:108,width:225,height:170}});
 await page.evaluate(()=>{friendRows.forEach((row,i)=>{row.userData=savedFriendProfiles[i]})});
 checks.push('login requests saved pin first; profile reply sorts the native list and paints the pin');
 await page.evaluate(()=>{const f=friendRows.find(f=>f.userData.ClientId===1234567891);f.FriendNickname='青山新名';users.set('青山新名',f.userData);f.userData.Nickname='青山新名';friendRuntime.tick();friendRuntime.tick()});
 assert.equal(await page.evaluate(()=>friendRuntime.getRecord().changes.length),1);assert.equal(await page.evaluate(()=>notices.length),1);
 assert.equal(await page.evaluate(()=>friendRuntime.getRecord().friends['1234567891'].name),'青山新名');
 checks.push('ID-pinned friend remains pinned across rename','rename observed once despite repeated ticks');

 await page.waitForFunction(()=>chatRows.every(row=>row.htmlTxt._innerHTML.includes('<img')));
 assert.equal(await page.evaluate(()=>chatRows.every(row=>row.visible)),true,'rank-ready rows are revealed in the native chat list');
 checks.push('chat rows with pending officer ranks are hidden until their native icons are ready');
 assert.equal(await page.evaluate(()=>detailRequests.includes('青山旧友')),true,'detail must be fetched without clicking nickname');
 await page.waitForFunction(()=>chatRows[4].htmlTxt._innerHTML.includes('officer/3.png'));
 assert.equal(await page.evaluate(()=>chatRuntime.getDiagnostics().nativeOfficer),true);
 assert.equal(await page.evaluate(()=>chatRuntime.getDiagnostics().config),false,'native officer service avoids redundant config download');
 assert.equal(await page.evaluate(()=>chatRows.every(row=>row.htmlTxt._innerHTML.includes('<img'))),true);
 assert.equal(await page.evaluate(()=>/src='(?:blob:|data:image\/png;base64,)/.test(chatRows[3].htmlTxt._innerHTML)),true);
 assert.equal(await page.evaluate(()=>chatRows[0].htmlTxt._innerHTML.includes('sgs-social-room:12345')),true);
 await page.evaluate(()=>chatRows[0].htmlTxt.event('link','ATtextNickname*&.!**.%#'+encodeURIComponent('青山旧友')));
 assert.equal(await page.evaluate(()=>chatRows[0].nativeLink.startsWith('ATtextNickname')),true);
 const linkPoint=await page.evaluate(()=>{const row=chatRows[0],hit=row.htmlTxt._recList.find(r=>r.href==='sgs-social-room:12345');if(!hit)throw Error('native Laya room link hit rectangle missing');const p=row.htmlTxt.localToGlobal(new Laya.Point(hit.rec.x+hit.rec.width/2,hit.rec.y+hit.rec.height/2));return{x:p.x,y:p.y}});await page.mouse.click(linkPoint.x,linkPoint.y);
 assert.deepEqual(await page.evaluate(()=>joined),[[102212345,22]]);
 checks.push('all channel rows and system mentions receive rank/robot icons','native username link retained','room link calls native SendJoinTable using current mode and group');
 await page.waitForTimeout(80);
 await page.waitForFunction(()=>chatRows.every(row=>row.htmlTxt._element._children.filter(c=>c._tex).every(c=>c._tex.getIsReady())));
 const robotURL=await page.evaluate(()=>chatRows[3].htmlTxt._element._children.find(c=>c._tex)._url);
 const robotRect=await page.evaluate(()=>{const row=chatRows[3],img=row.htmlTxt._element._children.find(c=>c._tex);const p=row.htmlTxt.localToGlobal(new Laya.Point(img.x,img.y));return{x:Math.floor(p.x),y:Math.floor(p.y),width:18,height:15}});
 const robotPixels=await page.screenshot({clip:robotRect});
 const visible=await page.evaluate(async(base64)=>{const i=new Image();i.src='data:image/png;base64,'+base64;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);let lit=0;const d=g.getImageData(0,0,c.width,c.height).data;for(let p=0;p<d.length;p+=4)if(d[p]>150&&d[p+1]>135&&d[p+2]>90)lit++;return lit},robotPixels.toString('base64'));
 assert.ok(visible>25,'actual inline robot must paint visible light pixels in its own 18x15 rectangle');checks.push('all icon textures ready and actual inline robot paints visible pixels');
 await page.screenshot({path:resolve(out,'native-chat.png')});

 await page.evaluate(({nativeChatRefresh,nativeShowDecree,nativeLayoutDecree,nativeInsertDecree})=>{
  const host=document.createElement('div');host.id='social-panel';host.style.cssText='position:absolute;left:450px;top:450px;box-sizing:border-box;padding:14px;border:1px solid var(--sgs-border);border-radius:10px;background:var(--sgs-bg);width:280px;max-height:220px;overflow:auto';document.body.append(host);
  Object.assign(ctx.ui,SocialCheck.mountPluginUI(ctx,()=>ctx));ctx.storage.set('lamps:1234567890',{version:1,friends:{'1234567891':{name:'青山旧友',ids:[1,2],names:{1:'谋周瑜',2:'界曹操'},at:123},'1234567899':{name:'已取消置顶的好友',ids:[3],names:{3:'神郭嘉'},at:124}}});
  window.lampRuntime=SocialCheck.createLampTracking(ctx,friendRuntime);window.panelDispose=SocialCheck.renderHistory(ctx,host,friendRuntime,lampRuntime,chatRuntime);
  const chatData=(chatMsg,ChannelNum=0)=>({MsgType:1,ChannelNum,chatMsg,MessageHtml:chatMsg});
  const history=['来打牌吧','周年活动','ABCDE','CDEFG','BCDEF','ABCD','下局见'].map(text=>chatData(text));
  history.push(chatData('系统周年公告',1),chatData('系统维护通知',1),chatData('公会好友',2),chatData('私聊 ABCDE',4));
  const view=window.bindingChat=new Laya.Sprite();view.pos(30,490);Laya.stage.addChild(view);
  view.msgContainer=view.addChild(new Laya.Sprite());view.msgContainer.size(320,220);view.msgContainer.refresh=()=>{};
  function createRow(data){
   const row=new Laya.Sprite();row.chatData=data;
   row.htmlTxt=row.addChild(new Laya.HTMLDivElement());row.htmlTxt.width=300;row.htmlTxt.innerHTML=data.MessageHtml;
   row.size(300,row.htmlTxt.contextHeight+8);return row;
  }
  view.getHtmlBase=createRow;
  view.currentShowChanel=0;view.GetCurrentShowChanel=()=>view.currentShowChanel;
  view.ClearChatItem=()=>{for(const row of [...view.msgContainer._children])row.destroy(true)};
  view.isCurrentPersonalData=()=>true;view.refreshMsgSize=()=>{};
  view.onChatUpdateMsg=new Function('G$t','Laya','return ({'+nativeChatRefresh+'}).onChatUpdateMsg')({I:()=>({GetChatMessageDataByChannel:channel=>channel===0?history:history.filter(data=>data.ChannelNum===channel)})},Laya);
  const insertDecree=new Function('Laya','return ({'+nativeInsertDecree+'}).updateData')(Laya);
  class DecreeBanner extends Laya.Sprite {
   constructor(){super();this.height=50;this.itemUIs=[];}
   getHtmlBase(data){return createRow(data);}
   updateData(data){return insertDecree.call(this,data);}
  }
  view.topButtonBar={y:-55,height:0};view.currentViewSizeType=1;
  view.layoutSuperZhao=new Function('gQt','return ({'+nativeLayoutDecree+'}).layoutSuperZhao')({S_SMALL_UI:0});
  view.hideSuperZhaoLing=function(){this.superZhaolingUI.destroy(true);this.superZhaolingUI=null;};
  const showDecree=new Function('yQt','Laya','VJt','vi','return ({'+nativeShowDecree+'}).showSuperZhaoLing')(DecreeBanner,Laya,{getValById:()=>10000},{SUPERZHAOLING:1});
  view.onChatUpdateMsg(0);chatRuntime.tick();
  window.readBindingRows=()=>view.msgContainer._children.map(row=>row.chatData.chatMsg);
  window.bindingRowsAreContiguous=()=>view.msgContainer._children.every((row,i,rows)=>row.y===(i?rows[i-1].y+rows[i-1].height:0));
  window.showBindingDecree=text=>showDecree.call(view,chatData(text));
  window.readBindingDecrees=()=>view.superZhaolingUI.itemUIs.map(row=>row.visible);
  window.showBindingChannel=channel=>{view.currentShowChanel=channel;view.onChatUpdateMsg(channel);if(view.superZhaolingUI)view.layoutSuperZhao();};
 },{nativeChatRefresh,nativeShowDecree,nativeLayoutDecree,nativeInsertDecree});
 const filter=page.getByRole('switch',{name:'过滤绑定码'});
 const filteredRows=['来打牌吧','BCDEF','ABCD','下局见','系统维护通知','公会好友','私聊 ABCDE'];
 assert.equal(await filter.isChecked(),true);
 assert.deepEqual(await page.evaluate(()=>readBindingRows()),filteredRows);
 assert.equal(await page.evaluate(()=>bindingRowsAreContiguous()),true);
 const decreeVisibility=await page.evaluate(()=>{
  showBindingDecree('加好友互帮');showBindingDecree('普通高级诏令');return readBindingDecrees();
 });
 assert.deepEqual(decreeVisibility,[false,true],'native decree insertion hides only the matching row synchronously');
 assert.deepEqual(await page.evaluate(()=>{showBindingChannel(1);return [readBindingRows(),readBindingDecrees()]}),[['系统维护通知'],[false,true]]);
 assert.deepEqual(await page.evaluate(()=>{showBindingChannel(2);return [readBindingRows(),readBindingDecrees()]}),[['公会好友'],[false,true]]);
 assert.deepEqual(await page.evaluate(()=>{showBindingChannel(4);return [readBindingRows(),readBindingDecrees()]}),[['私聊 ABCDE'],[false,true]]);
 assert.deepEqual(await page.evaluate(()=>{
  bindingChat.hideSuperZhaoLing();
  showBindingDecree('CDEFG');showBindingDecree('普通高级诏令 CDEF');
  return readBindingDecrees();
 }),[false,true],'a new native banner in private chat also hides matching rows immediately');
 await filter.focus();await page.keyboard.press('Space');
 assert.equal(await filter.isChecked(),false);
 assert.deepEqual(await page.evaluate(()=>readBindingRows()),['私聊 ABCDE']);
 assert.deepEqual(await page.evaluate(()=>readBindingDecrees()),[true,true]);
 await page.evaluate(()=>showBindingChannel(0));
 assert.deepEqual(await page.evaluate(()=>readBindingRows()),['来打牌吧','周年活动','ABCDE','CDEFG','BCDEF','ABCD','下局见','系统周年公告','系统维护通知','公会好友','私聊 ABCDE']);
 await filter.click();
 assert.deepEqual(await page.evaluate(()=>readBindingRows()),filteredRows);
 assert.deepEqual(await page.evaluate(()=>readBindingDecrees()),[false,true]);
 assert.equal(await page.evaluate(()=>bindingRowsAreContiguous()),true);
 checks.push('binding-code switch defaults on; keyboard and pointer rebuild native Laya history with contiguous rows');
 checks.push('A- and C-prefixed codes are filtered; matching advanced decrees stay hidden across tabs and on first arrival in private chat');
 for(const width of [248,280,420])for(const light of [false,true]){
  await page.evaluate(({width,light})=>{const host=document.querySelector('#social-panel');host.style.width=width+'px';const t=light?{bg:'#f1eee7',text:'#302b22',muted:'#756e5e',accent:'#896b25',border:'#c6bba3',raised:'#fffdf6'}:{bg:'#23231b',text:'#e8dec7',muted:'#a59a80',accent:'#d4b268',border:'#665b40',raised:'#343125'};for(const[k,v]of Object.entries(t))host.style.setProperty('--sgs-'+k,v)},{width,light});
  for(const offset of [-2,-1,0,2]){
   const layout=await page.locator('#social-panel').evaluate((host,offset)=>{
    host.style.setProperty('--sgs-font-offset',offset+'px');
    const label=host.querySelector('.social-filter'), toggle=label.querySelector('input');
    const range=document.createRange();range.selectNode(label.firstChild);
    const text=range.getBoundingClientRect(),sw=toggle.getBoundingClientRect();
    return{width:host.getBoundingClientRect().width,overflow:host.scrollWidth>host.clientWidth,fontSize:parseFloat(getComputedStyle(label).fontSize),switchFits:sw.left>=text.right&&sw.top<text.bottom&&sw.bottom>text.top&&sw.right<=label.getBoundingClientRect().right};
   },offset);
   assert.deepEqual(layout,{width,overflow:false,fontSize:12+offset,switchFits:true});
  }
  await page.locator('#social-panel').screenshot({path:resolve(out,'panel-'+width+'-'+(light?'light':'dark')+'.png')});
 }
 assert.equal(await page.locator('[data-social-history] li').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-social-export]').focus();await page.keyboard.press('Enter');const download=await downloadPromise;
 assert.equal(download.suggestedFilename(),'好友-1234567890.json');const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.friends['1234567891'].name,'青山新名');assert.deepEqual(exported.pins,['1234567891']);
 assert.deepEqual(exported.ownedGenerals['1234567891'].generals,[{id:1,name:'谋周瑜'},{id:2,name:'界曹操'}]);assert.equal(exported.ownedGenerals['1234567899'].pinned,false);assert.deepEqual(exported.ownedGenerals['1234567899'].generals,[{id:3,name:'神郭嘉'}]);
 const restored=await page.evaluate(()=>{
  const originalFriends=ctx.storage.get('friends:1234567890'),originalLamps=ctx.storage.get('lamps:1234567890');
  ctx.storage.set('friends:1234567890',{...originalFriends,pins:['1234567892']});
  ctx.storage.set('lamps:1234567890',{version:1,friends:{'1234567892':{name:'长江东逝水',ids:[3],names:{3:'神郭嘉'},at:125}}});
  friendRuntime.reload(); lampRuntime.reload();
  const result={pins:friendRuntime.getRecord().pins,lamps:lampRuntime.getRecords()};
  ctx.storage.set('friends:1234567890',originalFriends);ctx.storage.set('lamps:1234567890',originalLamps);
  friendRuntime.reload();lampRuntime.reload();friendRuntime.tick();
  return result;
 });
 assert.deepEqual(restored,{pins:['1234567892'],lamps:{'1234567892':{name:'长江东逝水',pinned:true,queriedAt:125,generals:[{id:3,name:'神郭嘉'}]}}});
 checks.push('restored pins and lamp snapshots replace live account records');
 checks.push('248/280/420px dark/light panel renders at all four font sizes without horizontal overflow or split switch label','keyboard export contains stable IDs and rename history');
 assert.equal(await page.locator('[data-social-chat-export], [data-social-chat-status]').count(),0);
 assert.doesNotMatch(await page.locator('#social-panel').textContent(),/导出聊天诊断|原生官阶服务|图片加载中|已记录/);
 const diagnostics=await page.evaluate(()=>chatRuntime.getDiagnostics());
 assert.equal(diagnostics.nativeOfficer,true);assert.equal(diagnostics.failed,0);assert.ok(diagnostics.inserted>=4);
 checks.push('native officer service still works; HUD has no diagnostic counts, readiness or export');
 await page.evaluate(()=>{ctx.now=()=>Date.now()+10000;scene.roomListView.hallManager={getTableInfoByID:id=>({TableID:id,HasPass:true})};window.beforePasswordJoin=joined.length;chatRuntime.requestEnterRoom('6776')});
 assert.equal(await page.evaluate(()=>joined.length===beforePasswordJoin),true,'known password room must not send empty password');
 await page.screenshot({path:resolve(out,'native-password.png')});
 await page.evaluate(()=>passwordWindow.passwordInput.text='1234');await page.mouse.click(560,360);
 assert.deepEqual(await page.evaluate(()=>joined.at(-1)),[102206776,22,255,0,'1234',0,1]);
 await page.evaluate(()=>{passwordWindow.destroy(true);ctx.now=()=>Date.now()+20000;scene.roomListView.hallManager=null;chatRuntime.requestEnterRoom('6776');controller.event('PASSWORD_ERROR_EVENT')});
 assert.equal(await page.evaluate(()=>nativePasswordErrors),0,'first rejection routes directly to native password input');
 assert.equal(await page.evaluate(()=>!!passwordWindow.parent),true);await page.evaluate(()=>passwordWindow.destroy(true));
 checks.push('native font href and double-encoded user names receive actual icons','known password room opens input before join','unknown room first password event opens input without failure dialog');
 await page.evaluate(()=>{chatRows[0].htmlTxt.width=260;chatRows[0].chatData.MessageHtml=messages[0].MessageHtml+'测试奖励'.repeat(28)+'*1';chatRows[0].htmlTxt.innerHTML=chatRows[0].chatData.MessageHtml;chatRuntime.tick()});
 await page.waitForTimeout(60);await page.evaluate(()=>chatRuntime.tick());
 assert.equal(await page.evaluate(()=>chatRows.every((r,i)=>r.height===r.contextHeight+8&&(i===0||r.y===chatRows[i-1].y+chatRows[i-1].height))),true,'all wrapped lines have native height and do not overlap next message');
 await page.screenshot({path:resolve(out,'native-wrapped.png')});checks.push('cached placeholder profile is refreshed without nickname click','late wrapping updates native row height and subsequent positions');
 const viewportBatch=await page.evaluate(()=>{
  const probe=new Laya.Sprite();probe.pos(30,480);Laya.stage.addChild(probe);
  probe.msgContainer=new Laya.Sprite();probe.addChild(probe.msgContainer);
  probe.msgContainer.scrollRect=new Laya.Rectangle(0,60,260,60);
  probe.getHtmlBase=chat.getHtmlBase;
  for(let i=0;i<8;i++){
   const name='可见测试'+i;users.set(name,{ClientId:1234567900+i,Nickname:name,OfficerLevel:1});
   const row=probe.getHtmlBase({MsgType:1,MessageHtml:'<font href="ATtextNickname*&amp;.!**.%#'+encodeURIComponent(name)+'">'+name+'</font>'});
   row.Size=function(){this.size(260,20)};row.size(260,20);row.y=i*20;
  }
  const before=detailRequests.length;chatRuntime.tick();const first=detailRequests.slice(before);
  probe.msgContainer.scrollRect=new Laya.Rectangle(0,100,260,60);chatRuntime.tick();const second=detailRequests.slice(before+first.length);
  probe.destroy(true);chatRuntime.tick();return{first,second};
 });
 assert.deepEqual(viewportBatch,{first:['可见测试5','可见测试4','可见测试3'],second:['可见测试7','可见测试6']},'real Laya scrollRect excludes old rows and newly exposed names enqueue bottom-up');
 checks.push('real Laya clipped viewport skips offscreen history, scrolling requests only new visible names bottom-up');
 const shareProbe=await page.evaluate(()=>{
  const data={MsgType:1,chatMsg:'showShareGeneral*&.!**.%#48,4809,2671,12,1',MessageHtml:'离云天：我分享了皮肤 <font color="#41b94d" href="showShareGeneral">【拂尘独行*贾诩】</font>，快来看看吧！'};
  const row=chat.getHtmlBase(data);row.pos(0,280);chatRuntime.tick();
  const html=row.htmlTxt._innerHTML,before=joined.length;
  row.htmlTxt.event('link','sgs-social-room:4809');
  row.htmlTxt.event('link','showShareGeneral');
  return{html,unchanged:joined.length===before,nativeLink:row.nativeLink};
 });
 assert.ok(!shareProbe.html.includes('sgs-social-room:'));
 assert.equal(shareProbe.unchanged,true);assert.equal(shareProbe.nativeLink,'showShareGeneral');
 await page.screenshot({path:resolve(out,'native-share-room-filter.png')});
 checks.push('native skin share parameters never create room links or join requests; original share link remains actionable');
 const faceLinks=await page.evaluate(()=>{
  const face='<img style="width:18px;height:18px;" src="face25.png"/>';
  const decorate=(chatMsg,message)=>chat.getHtmlBase({MsgType:1,chatMsg,MessageHtml:face+message});
  const faceOnly=decorate('#25','');
  const plain=decorate('#25 来123',' 来123');
  const recruitment=decorate('#25 KJ123',' KJ123');
  chatRuntime.tick();
  const result=[faceOnly,plain,recruitment].map(row=>row.htmlTxt._innerHTML);
  for(const row of [faceOnly,plain,recruitment])row.destroy(true);
  return result;
 });
 assert.ok(faceLinks.every(html=>html.includes('face25.png')&&!html.includes('sgs-social-room:25')));
 assert.doesNotMatch(faceLinks[1],/sgs-social-room:/);
 assert.match(faceLinks[2],/sgs-social-room:123/);
 checks.push('inline face IDs are ignored and short room links require a keyword');
 await page.evaluate(()=>{window.account=2234567890;friendRuntime.tick();chatRuntime.tick()});
 assert.deepEqual(await page.evaluate(()=>friendRuntime.getRecord().pins),[]);assert.equal(await page.evaluate(()=>friendRuntime.getRecord().changes.length),0);
 await page.evaluate(()=>{account=1234567890;friendRuntime.tick()});assert.equal(await page.evaluate(()=>notices.length),1);assert.deepEqual(await page.evaluate(()=>friendRuntime.getRecord().pins),['1234567891']);
 checks.push('switching account clears previous account pin and rename history','returning to saved account retains pin without repeating rename alert');
 await page.addScriptTag({content:roomFilterBundle.outputFiles[0].text});
 await page.evaluate(()=>{
  document.querySelector('#social-panel').hidden=true;
  const view=new Laya.Sprite();view.pos(450,530);view.size(660,200);Laya.stage.addChild(view);
  view.graphics.drawRect(0,0,660,200,'#24261f','#746344',1);
  class HallCheckBox extends Laya.Sprite {
   constructor(label){
    super();
    const caption=new Laya.Text();Object.assign(caption,{text:label,fontSize:16,color:'#e5d4b0',x:24,y:2});this.addChild(caption);
    this.size(caption.textWidth+24,24);
    this.selected=false;
    this.on('click',this,()=>{this.selected=!this.selected;this.event('change')});
   }
   get selected(){return this.checked}
   set selected(value){this.checked=value;this.graphics.clear();this.graphics.drawRect(0,3,16,16,value?'#ac8945':'#171813','#9a8d69',1)}
  }
  view.isWaitCheckBox=view.addChild(new HallCheckBox('只显示等待中的房间'));
  view.OnStageResize=function(x=24){this.isWaitCheckBox.pos(x,8)};
  view.OnStageResize();
  const rows=new Laya.Text();Object.assign(rows,{x:24,y:44,color:'#e5d4b0',fontSize:16,leading:14});view.addChild(rows);
  view.ReloadRoomList=function(data){rows.text=(data??[]).map(room=>room.name).join('\n')};
  view.tableDataList=[{name:'房间 A'},{name:'房间 B（有密码）',HasPass:true},{name:'房间 C（有密码）',hasPass:true}];
  view.ReloadRoomList(view.tableDataList);
  scene.roomListView=view;window.roomFilterView=view;window.roomRows=rows;
  RoomFilterCheck.installRoomFilter(ctx);
  window.roomToggle=view.getChildAt(view.numChildren-1);
 });
 assert.deepEqual(await page.evaluate(()=>[roomToggle.x-roomFilterView.isWaitCheckBox.x-roomFilterView.isWaitCheckBox.width,roomToggle.y]),[12,8]);
 const point=await page.evaluate(()=>{const p=roomToggle.localToGlobal(new Laya.Point(10,10));return{x:p.x,y:p.y}});
 await page.mouse.click(point.x,point.y);
 assert.equal(await page.evaluate(()=>roomRows.text),'房间 A');
 await page.screenshot({path:resolve(out,'native-password-free-rooms.png'),clip:{x:450,y:530,width:660,height:200}});
 await page.mouse.click(point.x,point.y);
 assert.equal(await page.evaluate(()=>roomRows.text),'房间 A\n房间 B（有密码）\n房间 C（有密码）');
 await page.mouse.click(point.x,point.y);
 await page.evaluate(()=>{
  roomFilterView.tableDataList=[{name:'新页有密码',HasPass:true},{name:'新页无密码',HasPass:false}];
  roomFilterView.ReloadRoomList(roomFilterView.tableDataList);
  roomFilterView.OnStageResize(40);
 });
 assert.deepEqual(await page.evaluate(()=>[roomRows.text,roomToggle.x-roomFilterView.isWaitCheckBox.x-roomFilterView.isWaitCheckBox.width]),['新页无密码',12]);
 await page.evaluate(()=>{panelDispose();scope.dispose();scope.dispose()});
 assert.deepEqual(await page.evaluate(()=>[roomToggle.destroyed,roomRows.text]),[true,'新页有密码\n新页无密码']);
 checks.push('room password filtering refreshes on native clicks, survives page updates and resize, and restores rows on disposal');
 assert.equal(await page.locator('.sgs-social').count(),0);
 assert.deepEqual(await page.evaluate(()=>list.goodFriendsList.map(r=>[r.data.userData.ClientId,r.vipIcon.visible])),[[1234567892,true],[1234567891,false]]);
 assert.equal(await page.evaluate(()=>chatRows[0].htmlTxt._innerHTML===messages[0].MessageHtml),true);
 assert.equal(await page.evaluate(()=>menu.allBtnList.some(b=>b.label==='置顶好友'||b.label==='取消置顶')),false);
 checks.push('idempotent cleanup removes menu/panel and restores native chat/VIP appearance');
 assert.equal(await page.evaluate(url=>Laya.Loader.getRes(url)==null,robotURL),true,'owned robot texture released from Laya loader');
 await page.screenshot({path:resolve(out,'native-disposed.png')});
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'browser-report.json'),JSON.stringify({passed:true,errors,checks,inlineRobotLightPixels:visible,limitations:['Synthetic account, friend/chat data, backgrounds and officer art. Real Laya rendering and captured native methods; no official-server result.']},null,2));
 console.log('Social native/browser checks passed.');
}finally{await browser.close()}
