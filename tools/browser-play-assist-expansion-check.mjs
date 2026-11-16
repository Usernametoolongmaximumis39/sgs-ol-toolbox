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
    self.skillItems=[414,401].map(id=>({Skill:{SkillId:id,Name:id===414?'破军':'落英'},seat:self.seat}));
    self.Pt={btns:[],Show(){},Update(){}};self.spellSelector={visible:false,Show(){}};
    window.scene={SelfSeatUi:self,seatContainer:{seatUIs:[]}};
    window.runtime=Expansion.createRuntime({window,scope,settings:{get:(k,d)=>d,set(){}},game:{getScene:()=>scene,getSnapshot:()=>({inGame:true}),getClass:()=>null,getServerProxy:()=>proxy,getCardMeta:()=>({name:window.convertedMaterial?'闪':'杀',suit:2,cardClass:window.convertedMaterial?'Shan':'Sha'})},ui:{},reportError:e=>{window.failure=String(e.stack);}},()=>({skillLock:true}));
    runtime.toggle(414);runtime.toggle(401);
    function card(n,type){return {CanBeSelected:true,Selected:false,Card:{CardId:n,FirstSkill:{Type:type}},setSelected(v){this.Selected=v;}};}
    window.po=new PoJun();po.name='SelectCardWindow';po.Skill={ID:414,SelectCardCountWhenResponse:4,SelectCardCountMinResponse:1};
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
  await writeFile(resolve(output,'expansion-native-report.json'),JSON.stringify({checks:['shipped Ags autoSelect / addSelectCardNormalUi / confirmClick / PoJun.SelectCardComplete','4 HP priority and exact count','single HP armour priority','shipped Mgs sureBtnHandler 全部获得','window reuse revision','native seatClickHandler -> SELECTE -> onSelectSeat -> self -> draw','native qzt.pbToOldProtocol spellID + no-seat turn -> own red Sha 龙吟 confirm','native hjt.pbToOldProtocol red 闪 conversion + native 龙吟 trigger -> confirm','cleanup'],errors},null,2));
  console.log('PASS native 破军 and 落英 window replay');
}finally{await browser.close();}



