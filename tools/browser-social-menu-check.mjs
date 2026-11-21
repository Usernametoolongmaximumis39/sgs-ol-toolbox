import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out=resolve('test-results/social/menu-ghost');await mkdir(out,{recursive:true});
const sourcePath=resolve(process.env.SGS_SOCIAL_CLIENT_SOURCE||resolve(homedir(),'AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs'));
const source=await readFile(sourcePath,'utf8');
function method(cls,start,end){
 const from=source.indexOf(`class ${cls} `);
 assert.ok(from>=0,`${sourcePath}: 找不到原生类 ${cls}`);
 const a=source.indexOf(start,from), b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,`${sourcePath}: 找不到完整的原生方法 ${cls}.${start}`);
 const code=source.slice(a,b);
 assert.doesNotThrow(()=>new Function(`return class extends Object {${code}}`),`${sourcePath}: 无法解析原生方法 ${cls}.${start}`);
 return code;
}
const methods={remove:method('gO','removeDrawChild(t,i=!0){','cmdSort(t,i){'),containerClear:method('EO','clear(t=!0){','get Childs(){'),textClear:method('CO','clear(t=!0){','update(){')};
methods.showMenu=method('LKi','ShowUserOptMenu(t,i,s,e,h,r=null,n="",a=0,l=-1,o){','ResetOptMenuPos(){');
methods.resetMenu=method('LKi','ResetOptMenuPos(){','ShowRecordLinkTip(t){');
methods.addToLayer=method('GD','addChild(t){','addChildAt(t,i){');
await writeFile(resolve(out,'source.json'),JSON.stringify({source:sourcePath,sha256:createHash('sha256').update(source).digest('hex'),methods},null,2));
const bundle=await build({stdin:{contents:"export {createFriendManagement} from './src/plugins/social/friends.js';export {ResourceScope} from './src/core/resources.js';export {createPluginNative} from './src/core/plugin-native.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'Check'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:520,height:390}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<body style="margin:0"></body>');await page.addScriptTag({path:resolve(process.env.SGS_LAYA_DIR||'C:/Users/Admin/AppData/Local/Temp/sgsres/game','laya.core.min.js')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(methods=>{
  Laya.init(520,390);Laya.stage.bgColor='#181914';
  class CO extends Laya.EventDispatcher{
   Dispose(){}draw(render,text,y){this.render=render;render.graphics.fillText(text,72,y,'22px SimSun','#d7cba7','left');this.cmds=[render.graphics.cmds.at(-1)];}
  }
  CO.prototype.clear=new Function('Laya','return ({'+methods.textClear+'}).clear')(Laya);
  class EO extends Laya.EventDispatcher{constructor(){super();this.childs=[]}Dispose(){}removeChildMouseEvent(){} }
  EO.prototype.clear=new Function('Laya','return ({'+methods.containerClear+'}).clear')(Laya);
  class fO{}
  const menu=window.menu=new Laya.Sprite();menu.pos(65,50);menu.graphics.drawRect(0,0,260,270,'#26261e','#665b42',1);menu.graphics.fillText('原生扁平按钮清理演练',25,15,'16px SimSun','#e9d7a5','left');Laya.stage.addChild(menu);
  Object.assign(menu,{useType:5,userName:'好友乙',allBtnList:[],showBtnList:[],drawContaniers:[],_originalChildSizes:new Map(),_originalChildPositions:new Map(),_originalChildFontSizes:new Map()});
  menu.removeDrawChild=new Function('EO','fO','CO','return ({'+methods.remove+'}).removeDrawChild')(EO,fO,CO);
  menu.getBtn=function(label){const b=new EO();b.label=label;b.render=this;const text=new CO();text.draw(this,label,65);b.childs.push(text);this.drawContaniers.push(b);this.allBtnList.push(b);return b};
  menu.layoutBtn=function(){};menu.updateOptMenu=function(){this.showBtnList=[];this.layoutBtn()};
  const friend={GroupID:1,FriendNickname:'好友乙',userData:{ClientId:1234567891}},manager={GetGoodFriendsList:()=>[friend],GetFriendArrBygroupID:()=>[friend],GetFriendByNickName:()=>friend};
  const proxy={_events:{FsCAddFriendsNtf:{caller:manager}}},storage=new Map();
  window.scope=new Check.ResourceScope();
  const ctx={scope,window,document,game:{getSelf:()=>({ClientId:1234567890}),getServerProxy:()=>proxy},storage:{get:k=>storage.get(k),set:(k,v)=>storage.set(k,structuredClone(v))}};
  ctx.native=Check.createPluginNative(ctx);window.runtime=Check.createFriendManagement(ctx);
  window.commandCount=()=>menu.graphics.cmds.length;window.openCount=commandCount();
  window.cycle=()=>{menu.removeSelf();runtime.tick();if(commandCount()!==openCount-1)throw Error('old text draw command leaked');Laya.stage.addChild(menu);runtime.tick();menu.updateOptMenu();if(commandCount()!==openCount)throw Error('reopening accumulated text');if(menu.drawContaniers.length!==1)throw Error('flat container leaked')};
 },methods);
 await page.screenshot({path:resolve(out,'before-cycles.png')});
 await page.evaluate(()=>{for(let i=0;i<100;i++)cycle()});
 await page.screenshot({path:resolve(out,'after-100-cycles.png')});
 assert.deepEqual(await page.evaluate(()=>({buttons:menu.allBtnList.length,drawContainers:menu.drawContaniers.length,commands:commandCount(),openCount})),{buttons:1,drawContainers:1,commands:3,openCount:3});
 assert.deepEqual(await page.evaluate(()=>scope.dispose()),[]);assert.equal(await page.evaluate(()=>commandCount()),2);
 await page.screenshot({path:resolve(out,'disposed.png')});assert.deepEqual(errors,[]);
 const first=await page.evaluate(methods=>{
  menu.destroy(true);
  const NativeLayer=new Function('Laya','bD','return class extends Laya.Sprite{'+methods.addToLayer+'}')(Laya,{AddChildToLayer(layer){Laya.stage.addChild(layer)}});
  const host=window.host=new NativeLayer();
  const popup=window.popup=new Laya.Sprite();host.optMenu=popup;popup.allBtnList=[];popup.showBtnList=[];popup.LayoutCopyBtn=()=>{};
  popup.getBtn=function(label){const b=new Laya.Sprite();b.size(140,20);const text=new Laya.Text();text.fontSize=16;text.color='#d7cba7';text.text=label;text.pos(10,1);b.addChild(text);Object.defineProperty(b,'label',{get:()=>text.text,set:v=>text.text=v});this.allBtnList.push(b);this.addChild(b);return b};
  const base=['个人信息','发送信件','复制昵称','修改备注'].map(t=>popup.getBtn(t));
  popup.layoutBtn=function(){this.showBtnList.forEach((b,i)=>{b.pos(5,50+22*i);b.visible=true});this.size(155,57+22*this.showBtnList.length);this.graphics.clear();this.graphics.drawRect(0,0,this.width,this.height,'#29271f','#89734e',1);host.ResetOptMenuPos()};
  popup.updateOptMenu=function(){this.showBtnList=[...base];this.layoutBtn()};popup.ShowOptMenu=function(id,nick,type){this.userName=nick;this.useType=type;this.updateOptMenu()};
  host.addStageClick=()=>{};host.ResetOptMenuPos=new Function('cAt','return ({'+methods.resetMenu+'}).ResetOptMenuPos')({gameWidth:520,gameHeight:390});
  host.ShowUserOptMenu=new Function('NNt','Laya','Djt','fO','return ({'+methods.showMenu+'}).ShowUserOptMenu')({IsSelf:()=>false},Laya,{},class {});
  const friend={GroupID:1,FriendNickname:'好友乙',userData:{ClientId:1234567891}},manager={GetGoodFriendsList:()=>[friend],GetFriendArrBygroupID:()=>[friend],GetFriendByNickName:()=>friend};
  window.scope=new Check.ResourceScope();const storage=new Map();window.ctx={scope,window,document,game:{getSelf:()=>({ClientId:1234567890}),getScene:()=>({ged:{_events:{SHOW_TEXT_PROMPT:{caller:host}}}}),getServerProxy:()=>({_events:{FsCAddFriendsNtf:{caller:manager}}})},storage:{get:k=>storage.get(k),set:(k,v)=>storage.set(k,structuredClone(v))}};
  ctx.native=Check.createPluginNative(ctx);
  window.runtime=Check.createFriendManagement(ctx);const anchor=new Laya.Sprite();anchor.pos(250,210);anchor.size(10,20);Laya.stage.addChild(anchor);
  host.ShowUserOptMenu(anchor,0,'好友乙',5);window.firstPosition={x:popup.x,y:popup.y,height:popup.height};return firstPosition;
 },methods);
 assert.deepEqual(first,{x:255,y:63,height:167});await page.waitForTimeout(40);await page.screenshot({path:resolve(out,'position-first-frame.png')});
 await page.evaluate(()=>{for(let i=0;i<20;i++)runtime.tick()});await page.waitForTimeout(550);
 assert.deepEqual(await page.evaluate(()=>({x:popup.x,y:popup.y,height:popup.height})),first);await page.screenshot({path:resolve(out,'position-after-polls.png')});
 await page.evaluate(()=>{scope.dispose();popup.y=230;popup.updateOptMenu();scope=new Check.ResourceScope();ctx.scope=scope;runtime=Check.createFriendManagement(ctx);runtime.tick()});
 assert.deepEqual(await page.evaluate(()=>({y:popup.y,height:popup.height})),{y:230,height:145},'already visible native menu stays at its original position and height');
 assert.deepEqual(await page.evaluate(()=>scope.dispose()),[]);assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,cycles:100,errors,firstPosition:first,positionStableAfterPolls:true,visibleMenuNotExpanded:true,nativeMethods:['gO.removeDrawChild','EO.clear','CO.clear','LKi.ShowUserOptMenu','LKi.ResetOptMenuPos'],limitations:'Real Laya and captured native methods; simulated button setup, no official server.'},null,2));
 console.log('Flat menu cleanup: 100 close/reopen cycles passed.');
}finally{await browser.close()}
