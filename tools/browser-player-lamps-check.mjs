import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out='test-results/player-info/lamps';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:`export {createStatsView} from './src/plugins/player-info/stats-view.js';export {createLampStrip} from './src/plugins/player-info/lamps-view.js';export {createBattleLamps} from './src/plugins/player-info/lamps.js';export {renderPlayerSettings,createPlayerSettings} from './src/plugins/player-info/settings.js';export {DEFAULT_GENERALS,generalCatalogue,classifyLamps,ddzSearchCatalogue} from './src/plugins/player-info/lamps-model.js';export {ResourceScope} from './src/core/resources.js';`,resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Check',write:false});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://web.sanguosha.com/**',async route=>{
  const id=Number(route.request().url().match(/(\d+)\.png/)?.[1]||1);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"><rect width="80" height="112" fill="hsl(${id*47%360} 45% 35%)"/><path d="M12 110Q18 68 40 68Q64 68 70 110" fill="#a0b580"/><ellipse cx="40" cy="37" rx="22" ry="28" fill="#dbb384"/><path d="M16 32Q12 0 40 1Q72 1 64 32L54 17 22 23" fill="#232526"/><path d="M28 37h5M47 37h5M34 55h12" stroke="#402c27" stroke-width="3"/></svg>`;
  await route.fulfill({contentType:'image/svg+xml',body:svg,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.setContent('<body style="margin:0;background:#182321"><aside style="position:fixed;right:0;top:0;bottom:0;width:280px;box-sizing:border-box;padding:16px;overflow:auto;background:#22251f;--sgs-bg:#191d19;--sgs-surface:#22251f;--sgs-raised:#2c3028;--sgs-text:#eee4ce;--sgs-muted:#aaa38f;--sgs-accent:#d2b574;--sgs-border:#62573d;font:13px/1.6 sans-serif"></aside></body>');
 await page.addScriptTag({path:process.env.SGS_LAYA_CORE||resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  Laya.init(1000,800);Laya.stage.bgColor='#182321';window.scope=new Check.ResourceScope();
  document.querySelector('aside').style.zIndex='1000';
  window.ctx={scope,window,document,themes:{current:{tokens:{}},subscribe:()=>()=>{}},game:{getClass:()=>null,getServerProxy:()=>null,getSelf:()=>({ClientId:100})},storage:{get:()=>null,set(){}}};
  const names=[...new Set([...Check.DEFAULT_GENERALS.landlord,...Check.DEFAULT_GENERALS.farmer,'界吕布','神吕布'])];
  const catalogue=Check.generalCatalogue({GameCharacters:{character:names.map((name,i)=>({id:name==='谋诸葛亮'?717:name==='谋周瑜'?770:i+1,name,...(['谋诸葛亮','谋周瑜'].includes(name)?{exType:51,GeneralItemType:'64'}:{})}))}});
  window.opts=Check.createPlayerSettings(ctx,()=>{});opts.set({lamps:true});
  const duplicates = Check.generalCatalogue({abbreviation:{field:[{Short:'a',Long:'id'},{Short:'b',Long:'name'},{Short:'ai',Long:'SpecifyName'}]},GameCharacters:{character:[{a:100,b:'刘备'},{a:101,b:'刘备',ai:'界'},{a:102,b:'刘备',ai:'谋'},{a:103,b:'刘备',GeneralItemType:16},{a:10100,b:'刘备'},{a:10101,b:'刘备',ai:'界'},{a:10102,b:'刘备',ai:'谋'},{a:10103,b:'刘备',ai:'限时'}]}});
  for(const [id,g] of duplicates)catalogue.set(id,g);
  const choices=Check.ddzSearchCatalogue(catalogue,new Set(catalogue.keys()));
  window.disposePanel=Check.renderPlayerSettings(ctx,document.querySelector('aside'),opts,{searchCatalogue:()=>choices,acceptResult:result=>window.reader?.acceptResult(result)});
  window.view=Check.createStatsView(ctx);window.seats=[];
  for(let i=0;i<2;i++){
   const avatar=new Laya.Sprite();avatar.size(135,172);avatar.pos(i?720:180,i?440:110);avatar.graphics.drawRect(0,0,135,172,'#435047','#9b8757',1);Laya.stage.addChild(avatar);
   const label=new Laya.Text();label.text=i?'农民':'地主';label.fontSize=24;label.color='#eee3cc';label.pos(38,65);avatar.addChild(label);
   seats.push({seatAvatar:avatar,otherTopManager:{officerText:{text:'大将军'}}});
  }
  window.paint=()=>{
   const rows=seats.map((ui,i)=>({ui,name:i?'农民玩家':'地主玩家',second:'胜率 62.0%',roles:'地主胜率 72% · 农民胜率 56%',third:'3连胜',streakState:'win',lamps:(i?Check.DEFAULT_GENERALS.farmer:Check.DEFAULT_GENERALS.landlord).map((name,j)=>({id:j+1,name,status:j<4?'owned':j<7?'blocked':'missing',tip:name+' '+(j<4?'已开通':j<7?'你框里有同名武将':'未开通，但可能有体验卡或限免'),url:`https://web.sanguosha.com/fixture/${j+1}.png`}))}));
   view.update(rows,seats,'ddz');
  };paint();
 });
 await page.waitForTimeout(800);
 const geometry=await page.evaluate(()=>Laya.stage._children.filter(n=>n.name==='sgs-player-stats').map(n=>({x:n.x,y:n.y,width:n.width,height:n.height,lamps:n._children.find(c=>c.name==='sgs-player-lamps')?._children.map(c=>({x:c.x,y:c.y,width:c.width,name:c.name}))})));
 assert.equal(geometry.length,2);assert.ok(geometry.every(g=>g.lamps.length===10));
 for(const g of geometry){assert.equal(new Set(g.lamps.map(l=>l.y)).size,2);assert.ok(g.lamps.every(l=>l.width>=29));assert.equal(g.lamps.filter(l=>l.y===0).length,5);}
 for(const g of geometry) assert.ok(g.lamps.at(-1).x+g.lamps.at(-1).width<=g.width-20);
 await page.screenshot({path:`${out}/native-default.png`});
 // Verify native hit testing and tooltip delivery through the full card hierarchy.
 const first=geometry[0];await page.mouse.move(first.x+first.lamps[0].x+18,first.y+first.height-94+18);
 await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').textContent(),/已开通/);
 await page.mouse.move(1,1);await page.getByRole('tooltip').waitFor({state:'detached'});
 await page.getByRole('group',{name:'地主玩家的将灯'}).getByRole('button').first().focus();
 await page.getByRole('tooltip').waitFor();await page.keyboard.press('Escape');await page.getByRole('tooltip').waitFor({state:'detached'});
 await page.evaluate(()=>document.activeElement.blur());
 await page.evaluate(g=>{window.passedThrough=false;window.under=new Laya.Sprite();under.size(g.width,g.height);under.pos(g.x,g.y);under.mouseEnabled=true;under.zOrder=80;under.graphics.drawRect(0,0,g.width,g.height,'#182321');under.on(Laya.Event.CLICK,under,()=>{passedThrough=true;});Laya.stage.addChild(under);},first);
 await page.mouse.click(first.x+30,first.y+40);assert.equal(await page.evaluate(()=>passedThrough),true,'card body remains click-through');
 await page.evaluate(()=>under.destroy(true));
 // Native shop/window occlusion also blocks mouse access to lamp sprites.
 await page.evaluate(()=>{window.cover=new Laya.Sprite();cover.pos(0,0);cover.size(1000,800);cover.mouseEnabled=true;cover.zOrder=200;cover.graphics.drawRect(0,0,1000,800,'#294238');Laya.stage.addChild(cover);});
 await page.mouse.move(first.x+18,first.y+first.height-94+18);await page.waitForTimeout(50);assert.equal(await page.getByRole('tooltip').count(),0);
 await page.screenshot({path:`${out}/native-occluded.png`});await page.evaluate(()=>cover.destroy(true));
 await page.getByRole('button',{name:'自定义方案',exact:true}).click();
 await page.locator('.pi-slots button').first().click();await page.getByRole('searchbox').fill('界吕布');await page.locator('.pi-results button').click();
 assert.equal(await page.evaluate(()=>opts.get().landlord[0]),'界吕布');
 assert.ok(await page.evaluate(()=>Number.isSafeInteger(opts.get().landlordIds[0])),'custom selection must save its actual general ID');
 await page.locator('.pi-slots button').first().click();await page.getByRole('searchbox').fill('刘备');
 assert.deepEqual(await page.locator('.pi-results button').allTextContents(),['刘备','界刘备','谋刘备']);
 await page.locator('.pi-results').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/search-liubei-prefixes.png`});
 const layouts=[];
 for(const width of [248,280,420])for(const font of [11,12,13,15,16]){
  await page.evaluate(({width,font})=>{const p=document.querySelector('aside');p.style.width=width+'px';p.style.fontSize=font+'px';},{width,font});
  const valid=await page.locator('aside').evaluate(el=>el.scrollWidth<=el.clientWidth);assert.ok(valid,`${width}/${font} panel horizontal overflow`);
  layouts.push({width,font,valid});await page.screenshot({path:`${out}/settings-${width}-${font}.png`});
 }
 await page.evaluate(()=>{document.querySelector('aside').style.height='230px';document.querySelector('aside').style.bottom='auto';});
 await page.screenshot({path:`${out}/settings-low-height.png`});
 await page.evaluate(()=>{const p=document.querySelector('aside');p.style.height='800px';p.style.background='#f4efe3';for(const [k,v] of Object.entries({bg:'#f4efe3',surface:'#fffaf0',raised:'#e9e2d1',text:'#302c25',muted:'#716958',accent:'#84631d',border:'#b5a785'}))p.style.setProperty('--sgs-'+k,v);});
 await page.screenshot({path:`${out}/settings-light.png`});
 await page.evaluate(()=>{
  const proxy=window.lampProxy=new Laya.EventDispatcher();window.lampRequests=[];
  const manager=window.lampNative={ReqOtherbuygeneral(name){lampRequests.push(name);proxy.event('decodeClientSelfBuyGeneralRep',{Protocol:{Data:{ProtoObj:{reptype:'REP_TYPE_QUERY',nickname:name,is_end:true,generals:[1,2,3,4].map(generalid=>({generalid,goodsid:1}))}}}});},
   realName:name=>name.replace(/\[[0-9]+\]/,''),getOwnGeneral:id=>({generalInfo:{GeneralBigImgUrl:`https://web.sanguosha.com/fixture/${id}.png`}})};
  proxy.N=(id,body)=>{
   if(id!==180056)throw Error('automatic lamps must not request a separate player profile');
   const expected=1000000200+Number(body.nickname.replace('对手',''));
   if(body.target_uid!==expected||body.who!=='REQ_TYPE_CLIENT')throw Error('wrong occupied-seat target');
   manager.ReqOtherbuygeneral(body.nickname);
  };
  proxy.on('decodeClientSelfBuyGeneralRep',manager,()=>{});
  const names=[...new Set([...Check.DEFAULT_GENERALS.landlord,...Check.DEFAULT_GENERALS.farmer])];
  ctx.game.getConfigData=()=>({GameCharacters:{character:names.map((name,i)=>({id:name==='谋诸葛亮'?717:name==='谋周瑜'?770:i+1,name,...(['谋诸葛亮','谋周瑜'].includes(name)?{exType:51,GeneralItemType:'64'}:{})}))}});
  ctx.game.getServerProxy=()=>proxy;ctx.game.getSnapshot=()=>({inGame:true,modeId:148});ctx.game.getSeatUIs=()=>seats;
  class SeatUser{static TryGetUserDataUid(){return 0;}static SendUserBaseInfo(){throw Error('no profile lookup needed for occupied seats');}}
  ctx.game.getSelf=()=>({ClientId:1000000001,constructor:SeatUser});
  seats.forEach((ui,i)=>{ui.seat={PlayerInfo:{ClientId:1000000200+i,NickNameForLocal:`对手${i}[12]`},Figure:i?3:1};});
  opts.set({scheme:'default'});window.reader=Check.createBattleLamps(ctx,()=>opts.get(),()=>{if(window.paintReadback)paintReadback();});reader.update({inGame:true,modeId:148},null);
 });
 await page.waitForTimeout(80);
 const readback=await page.evaluate(()=>{
  window.paintReadback=()=>{
  reader.update({inGame:true,modeId:148},null);
  const rows=seats.map((ui,i)=>({ui,name:`对手${i}`,second:'胜率 62.0%',roles:'地主胜率 72% · 农民胜率 56%',third:'2连胜',streakState:'win',lamps:reader.rows(ui.seat.PlayerInfo,ui.seat.Figure)}));
  view.update(rows,seats,'ddz');return {requests:lampRequests,statuses:rows.map(r=>r.lamps?.map(g=>g.status)??null)};
  };return paintReadback();
 });
 assert.deepEqual(readback.requests,['对手0','对手1']);
 assert.deepEqual(await page.evaluate(()=>reader.rows(seats[0].seat.PlayerInfo,1).filter(g=>['谋诸葛亮','谋周瑜'].includes(g.name)).map(g=>[g.id,g.name]).sort((a,b)=>a[0]-b[0])),[[717,'谋诸葛亮'],[770,'谋周瑜']]);
 assert.ok(readback.statuses.every(rows=>rows.length===10&&!rows.includes('unknown')),JSON.stringify(readback));
 await page.waitForTimeout(200);await page.screenshot({path:`${out}/native-query-readback.png`});
 await page.evaluate(()=>lampProxy.event('MsgGameDealCharacter',{Protocol:{Type:1,Datas:[1]}}));await page.waitForTimeout(30);
 assert.equal(await page.evaluate(()=>reader.rows(seats[0].seat.PlayerInfo,1).find(g=>g.id===1).status),'blocked');
 await page.evaluate(()=>lampProxy.event('MsgGameDealCharacter',{Protocol:{Type:3,Datas:[3]}}));await page.waitForTimeout(30);
 assert.deepEqual(await page.evaluate(()=>{const rows=reader.rows(seats[0].seat.PlayerInfo,1);return [rows.find(g=>g.id===1).status,rows.find(g=>g.id===3).status,lampRequests.length];}),['owned','blocked',2]);
 await page.screenshot({path:`${out}/two-rows-frame-swap.png`});

 assert.equal(await page.locator('[data-manual-lamps]').count(),0);
 assert.equal(await page.locator('.pi-current-players').count(),0);
 assert.ok(await page.evaluate(()=>Laya.stage._children.filter(n=>n.name==='sgs-player-stats').every(n=>n._children[0]._children.filter(t=>t instanceof Laya.Text).every(t=>!t.text.startsWith('ID：')))));
 for(const width of [248,280,420])for(const font of [11,12,13,15]){
  await page.evaluate(({width,font})=>{const p=document.querySelector('aside');p.style.width=width+'px';p.style.fontSize=font+'px';p.scrollTop=0;},{width,font});
  assert.ok(await page.locator('aside').evaluate(p=>p.scrollWidth<=p.clientWidth),`automatic settings overflow ${width}/${font}`);
  await page.screenshot({path:`${out}/two-rows-${width}-${font}.png`});
 }
 await page.evaluate(()=>{
  window.portraitAttempts=0;window.originalPortraitLoad=Laya.loader.load;
  Laya.loader.load=function(url,complete,...rest){
   if(url==='https://web.sanguosha.com/fixture/990.png'&&++portraitAttempts===1){complete.runWith(null);return this;}
   return originalPortraitLoad.call(this,url,complete,...rest);
  };
  window.retryStrip=Check.createLampStrip(ctx);window.retryParent=new Laya.Sprite();Laya.stage.addChild(retryParent);
  retryStrip.update([{name:'谋诸葛亮',status:'owned',tip:'谋诸葛亮 已开通',url:'https://web.sanguosha.com/fixture/990.png'}],{width:248,height:140,label:'重试验证'},Laya,retryParent);
 });
 await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(()=>portraitAttempts),2,'portrait failure must retry once');
 assert.ok(await page.evaluate(()=>{const face=retryParent._children[0]._children[0]._children[0]._children[0];return face.texture&&face.width<=40&&face.height<=56;}),'retry must restore a correctly sized portrait');
 await page.evaluate(()=>{Laya.loader.load=originalPortraitLoad;retryStrip.remove();retryParent.destroy(true);});
 await page.evaluate(()=>{
  seats.push({seat:{Index:0,PlayerInfo:{ClientId:1000000001},GeneralId:9}});
  reader.update({inGame:true,modeId:148},null);
  lampProxy.event('MsgGamePlayCardNtf',{Protocol:{CardList:[1,2,3]}});
 });
 await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>reader.rows(seats[0].seat.PlayerInfo,1).length),10,'deck sync and existing general cannot hide lamps');
 await page.evaluate(()=>lampProxy.event('SmsgGameSetCharacter',{Protocol:{Infos:[{SeatID:0,CharacterID:9}]}}));
 await page.waitForTimeout(80);
 await page.evaluate(()=>{seats.pop();paintReadback();});
 assert.equal(await page.evaluate(()=>reader.rows(seats[0].seat.PlayerInfo,1)),null);
 assert.equal(await page.evaluate(()=>Laya.stage._children.filter(n=>n.name==='sgs-player-stats').flatMap(n=>n._children).filter(n=>n.name==='sgs-player-lamps').length),0,'lamps must disappear after selection');
 assert.equal(await page.evaluate(()=>Laya.stage._children.filter(n=>n.name==='sgs-player-stats').length),2,'statistics remain visible');
 await page.screenshot({path:`${out}/selection-finished.png`});
 await page.evaluate(()=>{
  const previous=ctx.game.getConfigData,characters=previous('character');
  characters.GameCharacters.character.push(...[{id:7003,name:'司马懿',country:6,exType:40},{id:7005,name:'王元姬',country:6,exType:40},{id:7007,name:'张春华',country:6,exType:40},{id:9002,name:'测试武将',GeneralEnable:'2',exType:51}]);
  ctx.game.getConfigData=name=>name==='character'?characters:previous(name);
  window.nativePoolWin=new Laya.Sprite();nativePoolWin.name='ModeGeneralPoolWindow';nativePoolWin.info={ModeID:148,Section:3};
  nativePoolWin.vo={Id:8,InFactGeneralList:[717,770,7003,7005,7007,9002],CantCloseGeneralList:[1]};nativePoolWin.generalInfoList=[{Id:717}];Laya.stage.addChild(nativePoolWin);
  disposePanel();opts.set({scheme:'custom'});window.disposePanel=Check.renderPlayerSettings(ctx,document.querySelector('aside'),opts,reader);
 });
 await page.locator('.pi-slots button').first().click();await page.getByRole('searchbox').fill('谋');
 assert.deepEqual(await page.locator('.pi-results button').allTextContents(),['谋诸葛亮','谋周瑜']);
 await page.getByRole('searchbox').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/native-ddz-search.png`});
 await page.getByRole('searchbox').fill('晋');
 assert.deepEqual(await page.locator('.pi-results button').allTextContents(),['晋司马懿','晋王元姬','晋张春华']);
 await page.screenshot({path:`${out}/jin-search.png`});
 await page.getByRole('searchbox').fill('王元姬');assert.equal(await page.locator('.pi-results button').textContent(),'晋王元姬');
 await page.getByRole('searchbox').fill('测试');assert.equal(await page.locator('.pi-results button').textContent(),'测试武将');
 await page.evaluate(()=>nativePoolWin.destroy(true));
 await page.evaluate(()=>{
  window.failedScope=new Check.ResourceScope();const proxy=new Laya.EventDispatcher();window.failureRequests=0;proxy.N=()=>failureRequests++;
  proxy.on('decodeClientSelfBuyGeneralRep',lampNative,()=>{});
  const failedCtx={...ctx,scope:failedScope,game:{...ctx.game,getServerProxy:()=>proxy}};
  window.failedReader=Check.createBattleLamps(failedCtx,()=>opts.get());failedReader.update({inGame:true,modeId:148},null);
  window.failedPortraitLoads=0;window.originalFailureLoad=Laya.loader.load;Laya.loader.load=function(...args){failedPortraitLoads++;return originalFailureLoad.apply(this,args);};
  const rows=seats.map((ui,i)=>({ui,name:`对手${i}`,second:'胜率 62.0%',roles:'地主胜率 72% · 农民胜率 56%',third:'2连胜',streakState:'win',lamps:failedReader.rows(ui.seat.PlayerInfo,ui.seat.Figure)}));
  view.update(rows,seats,'ddz');proxy.event('decodeClientSelfBuyGeneralRep',{Protocol:{errCode:1}});
 });
 await page.waitForTimeout(60);
 assert.equal(await page.evaluate(()=>failureRequests),2);
 assert.equal(await page.evaluate(()=>failedPortraitLoads),0);
 assert.equal(await page.evaluate(()=>Laya.stage._children.filter(n=>n.name==='sgs-player-stats').flatMap(n=>n._children).filter(n=>n.name==='sgs-player-lamps').length),0);
 await page.screenshot({path:`${out}/query-error-hidden.png`});
 await page.evaluate(()=>{Laya.loader.load=originalFailureLoad;failedScope.dispose();});

 await page.evaluate(()=>{disposePanel();view.clear();scope.dispose();});
 assert.equal(await page.getByRole('tooltip').count(),0);assert.equal(await page.locator('[data-player-settings]').count(),0);
 assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({geometry,layouts,errors,artwork:'Mock portraits delivered through an intercepted official-host request; no official match acceptance.'},null,2));
 console.log('Player lamps browser/native checks passed.');
}finally{await browser.close();}
