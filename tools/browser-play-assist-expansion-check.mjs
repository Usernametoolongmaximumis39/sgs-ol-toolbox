import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const output=resolve('test-results/play-assist');await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:"export {createRuntime} from './src/plugins/play-assist/runtime.js';export {ResourceScope} from './src/core/resources.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'Expansion'});
const [pojun,luoying]=await Promise.all(['Ags','Mgs'].map(name=>readFile(resolve(`test-results/reference/play-assist-expansion/${name}.js`),'utf8')));
const skills=await readFile(resolve('test-results/reference/play-assist-expansion/skills.js'),'utf8');
const start=skills.indexOf('SelectCardComplete(t){');
const complete=skills.slice(start,skills.indexOf('PutCardRecord(t)',start));
assert.ok(complete.includes('SendMoveCard'));
const targetMethods=await readFile(resolve('test-results/reference/huaiyuan-target/methods.js'),'utf8');
const useCardSource=await readFile(resolve('test-results/reference/longyin-source/use-card.js'),'utf8');
const useSpellSource=await readFile(resolve('test-results/reference/longyin-source/use-spell.js'),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:800,height:500}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({path:process.env.SGS_LAYA_CORE||resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(({pojun,luoying,complete})=>{
    Laya.init(800,500);Laya.stage.bgColor='#172322';
    window.scope=new Expansion.ResourceScope();window.sent=[];window.proxy=new Laya.EventDispatcher();
    const Xmt={LUOYING:401},V2t={SelfSeatIndex:0,CanOperationInGame:()=>true};
    const C1t={SendMoveCard:(...args)=>sent.push(args),GetMoveCardMsg:(...args)=>args};
    class Base extends Laya.Sprite {Close(){this.visible=false;}enterWindow(){this.visible=true;}}
    const PoJun=new Function('l_s','Xmt','V2t','C1t',`${pojun};return Ags;`)(Base,Xmt,V2t,C1t);
    const LuoYing=new Function('l_s','Xmt','V2t','C1t',`${luoying};return Mgs;`)(Base,Xmt,V2t,C1t);
    const self=new Laya.Sprite();Laya.stage.addChild(self);
    self.seat={Index:0,Hp:3,EquipCardCount:1};self.cardContainer={cardUis:[],selectCardContext:{}};
    self.skillItems=[3389,401].map(id=>({Skill:{SkillId:id,Name:id===3389?'破军':'落英'},seat:self.seat}));
    self.Pt={btns:[],Show(){},Update(){}};self.spellSelector={visible:false,Show(){}};
    window.scene={SelfSeatUi:self,seatContainer:{seatUIs:[]}};
    window.runtime=Expansion.createRuntime({window,scope,settings:{get:(k,d)=>d,set(){}},game:{getScene:()=>scene,getSnapshot:()=>({inGame:true}),getClass:()=>null,getServerProxy:()=>proxy,getCardMeta:()=>({name:window.convertedMaterial?'闪':'杀',suit:2,cardClass:window.convertedMaterial?'Shan':'Sha'})},ui:{},reportError:e=>{window.failure=String(e.stack);}},()=>({skillLock:true}));
    runtime.toggle(3389,true);runtime.toggle(401);
    function card(n,type){return {CanBeSelected:true,Selected:false,Card:{CardId:n,FirstSkill:{Type:type}},setSelected(v){this.Selected=v;}};}
    window.po=new PoJun();po.name='SelectCardWindow';po.Skill={ID:3389,SelectCardCountWhenResponse:4,SelectCardCountMinResponse:1};
    po.TargetSeat={Index:1,Hp:4};po.handCardUis=[card(1,0),card(2,0)];
    po.equipCardUis=[card(30,3),card(40,4),card(50,5),card(70,7)];po.confirm_btn={enabled:true};
    po.Close=Base.prototype.Close;po.enterWindow=Base.prototype.enterWindow;po.Skill.SelectCardComplete=new Function('C1t','V2t',`return ({${complete}}).SelectCardComplete;`)(C1t,V2t);po.manager={ClientGsPreSelectMsg(){}};po.autoSelect();Laya.stage.addChild(po);
    window.lo=new LuoYing();lo.name='LuoYingSelectCardWindow';lo.visible=false;lo.cardIds=[101,102,103];lo.btn1={name:'0',enabled:true};Laya.stage.addChild(lo);
    runtime.tick();
  },{pojun,luoying,complete});
  await page.waitForFunction(()=>sent.length===1);
  assert.deepEqual(await page.evaluate(()=>sent[0][0]),[40,70,30,1],'native preview replaced in strategy order');
  await page.evaluate(()=>{runtime.tick();lo.visible=true;runtime.tick();});
  await page.waitForFunction(()=>sent.length===2);
  assert.deepEqual(await page.evaluate(()=>sent[1][0]),[101,102,103],'native 全部获得 uses every card');
  await page.evaluate(()=>{po.enterWindow();po.TargetSeat.Hp=1;po.Skill.SelectCardCountWhenResponse=1;runtime.tick();});
  await page.waitForFunction(()=>sent.length===3);
  assert.deepEqual(await page.evaluate(()=>sent[2][0]),[40],'one HP uses native single-card response');
  await page.evaluate(async ()=>{
    const self=scene.SelfSeatUi;
    self.skillItems[0].Skill={SkillId:414,Name:'破军'};
    window.scene={...scene};
    po.Skill.ID=414;po.enterWindow();runtime.tick();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(()=>po.visible),true,'remembered 界破军 leaves the native 标破军 window open');
  assert.equal(await page.evaluate(()=>sent.length),3,'remembered 界破军 sends no 标破军 response');
  await page.evaluate(()=>runtime.toggle(414));
  await page.waitForFunction(()=>sent.length===4);
  assert.deepEqual(await page.evaluate(()=>sent[3][0]),[40],'explicitly enabled 标破军 still uses its native window');
  await page.evaluate(async ()=>{
    runtime.toggle(414);po.enterWindow();runtime.tick();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(()=>po.visible),true,'unlocking 标破军 leaves the next window manual');
  assert.equal(await page.evaluate(()=>sent.length),4);
  await page.evaluate(()=>{
    const self=scene.SelfSeatUi;self.skillItems.push({Skill:{SkillId:3796,Name:'武娘'},seat:self.seat});
    runtime.tick();runtime.toggle(3796);window.wuniangCards=[];
    po.Skill={ID:3796,SelectCardCountWhenResponse:1,SelectCardComplete:ids=>wuniangCards.push(ids)};
    po.enterWindow();runtime.tick();
  });
  await page.waitForFunction(()=>wuniangCards.length===1);
  assert.deepEqual(await page.evaluate(()=>wuniangCards),[[40]],'武娘 prefers armour over weapon and hands');
  await page.evaluate(()=>runtime.tick());
  assert.equal(await page.evaluate(()=>wuniangCards.length),1,'武娘 window submits once');
  await page.evaluate(()=>{po.equipCardUis=po.equipCardUis.filter(c=>c.Card.CardId!==40);po.enterWindow();runtime.tick();});
  await page.waitForFunction(()=>wuniangCards.length===2);
  assert.deepEqual(await page.evaluate(()=>wuniangCards[1]),[30],'武娘 takes other equipment before hands');
  await page.evaluate(()=>{po.equipCardUis=[];po.enterWindow();runtime.tick();});
  await page.waitForFunction(()=>wuniangCards.length===3);
  assert.deepEqual(await page.evaluate(()=>wuniangCards[2]),[1],'武娘 falls back to hands without equipment');
  await page.evaluate(targetMethods=>{
    const methods=new Function('V2t','qk',targetMethods+';return nativeMethods;')({CanOperationInGame:()=>true},{SELECT_SEAT:'SELECTE'});
    const self=scene.SelfSeatUi;self.Seat=self.seat;self.Activated=true;self.activated=true;self.AutoSelectProtect=false;
    self.seatClickHandler=methods.seatClickHandler;
    const controller={seatUIs:[self],onSelectSeat:methods.onSelectSeat};
    self.on('SELECTE',controller,controller.onSelectSeat);scene.seatContainer=controller;
    self.skillItems.push({Skill:{SkillId:3081,Name:'怀远'},seat:self.seat});
    let targetClicks=0;window.huaiyuanDraw=0;
    self.seat.G=function(v){this.Selected=v;targetClicks++;Object.assign(self.spellSelector,{visible:true,spell:{ID:3081},btnList:[{_enabled:true,data:{sendData:3,label:'【摸1张牌】'}}],btnClick(){window.huaiyuanDraw++;}});self.spellSelector.Show();};
    controller.selectContext={Skill:{ID:3081}};runtime.tick();runtime.toggle(3081);runtime.tick();
    window.targetClicks=()=>targetClicks;
  },targetMethods);
  await page.waitForFunction(()=>huaiyuanDraw===1);
  assert.equal(await page.evaluate(()=>scene.SelfSeatUi.Seat.Selected),true,'native seat event selected self');
  assert.equal(await page.evaluate(()=>targetClicks()),1,'self selection occurs once before draw');
  await page.evaluate(useCardSource=>{
    const Packet=new Function('Tj','eNt',useCardSource+';return qzt;')(class {},{PUB_GS_C_USE_CARD:1});
    const packet=new Packet();packet.pbToOldProtocol({srcSeatId:0,cardId:99,spellId:1,destCnt:1,paramCnt:0,data:[1]});
    const self=scene.SelfSeatUi;self.spellSelector.visible=false;self.seat.Selected=false;scene.seatContainer.selectContext=null;
    self.seat.InOwnRound=true;self.skillItems.push({Skill:{SkillId:21003,Name:'龙吟'},seat:self.seat});window.longyinConfirmed=0;
    self.Pt.btns=[{name:'btnOK',_enabled:true,onClick(){window.longyinConfirmed++;}}];
    runtime.tick();runtime.toggle(21003);
    proxy.event('MsgGameTurnNtf',{Protocol:{TurnCnt:1}});proxy.event('PubGsCUseCard',{Protocol:packet});
    self.cardContainer.selectCardContext={Skill:{SkillId:21003},message:'是否发动龙吟'};self.Pt.Show();runtime.tick();
  },useCardSource);
  await page.waitForFunction(()=>longyinConfirmed===1);
  await page.evaluate(useSpellSource=>{
    const nativeSkill={IsThis:n=>n===1};
    class Protocol {constructor(){this.printIgnorList=[];this.printJsonIgnorList=[];}}
    const Packet=new Function('Tj','eNt','V2t','fKt',useSpellSource+';return hjt;')(Protocol,{PUB_GS_C_USE_SPELL:1},{GetSeat:()=>({GetGeneralSkill:()=>nativeSkill})},{});
    const packet=new Packet();packet.pbToOldProtocol({srcSeatId:0,spellId:99999,useCardCount:1,destCount:1,datas:[1,99]});
    window.convertedMaterial=true;
    proxy.event('PubGsCUseSpell',{Protocol:packet});
    proxy.event('GsCTriggerSpellNew',{Protocol:{SrcSpellID:99999,SrcSpellCasterSeat:0,FirstTriggerParam:{SpellId:21003,SeatId:0}}});
    scene.SelfSeatUi.Pt.Show();runtime.tick();
  },useSpellSource);
  await page.waitForFunction(()=>longyinConfirmed===2);
  await page.evaluate(()=>{runtime.tick();runtime.dispose();scope.dispose();});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'expansion-native-report.json'),JSON.stringify({checks:['shipped Ags autoSelect / addSelectCardNormalUi / confirmClick / PoJun.SelectCardComplete','4 HP priority and exact count','single HP armour priority','remembered 界破军 leaves 标破军 manual in the next match','independent 标破军 lock and unlock on a reused native window','shipped Mgs sureBtnHandler 全部获得','window reuse revision','native seatClickHandler -> SELECTE -> onSelectSeat -> self -> draw','native qzt.pbToOldProtocol spellID + no-seat turn -> own red Sha 龙吟 confirm','native hjt.pbToOldProtocol red 闪 conversion + native 龙吟 trigger -> confirm','cleanup'],errors},null,2));
  console.log('PASS native 破军 and 落英 window replay');
}finally{await browser.close();}



