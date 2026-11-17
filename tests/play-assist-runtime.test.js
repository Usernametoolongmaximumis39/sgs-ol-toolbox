import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { EXTRA_IDS, pojunCards, miuyanCard, longyinCard } from '../src/plugins/play-assist/strategies.js';
import { createRuntime, SKILL_IDS, supported } from '../src/plugins/play-assist/runtime.js';
import { quandaoCounts } from '../src/plugins/play-assist/quandao.js';

test('权道 counts native Sha including elemental variants and excludes delayed tricks', () => {
  const sha = name => ({FirstSkillId:1, FirstSkill:{Name:name}});
  const trick = delayed => ({FirstSkillId:delayed ? 11 : 8, FirstSkill:{IsJinNang:true,IsJudgeSkill:delayed}});
  assert.equal(quandaoCounts([sha('杀'),sha('火杀'),sha('雷杀'),sha('冰杀'),trick(false),trick(true),{FirstSkillId:2,FirstSkill:{}}]),'4/1');
  assert.equal(quandaoCounts([]),'0/0');
  assert.equal(quandaoCounts(undefined),null);
  assert.equal(quandaoCounts([{}]),null);
});

test('权道 display updates independently, restores on disable, reuse and disposal', t => {
  const f=fixture(t,{quandaoCount:true});
  f.item.Skill={SkillId:3184,Name:'权道'};f.item.label='权道';
  f.self.seat.HandCards=[{FirstSkillId:1,FirstSkill:{}},{FirstSkillId:8,FirstSkill:{IsJinNang:true,IsJudgeSkill:false}}];
  f.runtime.tick();assert.equal(f.item.label,'1/1');
  f.self.seat.HandCards=[];f.runtime.tick();assert.equal(f.item.label,'0/0');
  f.settings.quandaoCount=false;f.runtime.tick();assert.equal(f.item.label,'权道');
  f.settings.quandaoCount=true;f.runtime.tick();f.item.Skill={SkillId:3140};f.item.label='旧权道';f.runtime.tick();assert.equal(f.item.label,'旧权道');
  f.item.Skill={SkillId:3184};f.item.label='权道';f.runtime.tick();assert.equal(f.item.label,'0/0');
  f.runtime.dispose();assert.equal(f.item.label,'权道');
});
class Native {
  constructor() { this._events = {}; this.visible = true; }
  on(type,caller,method,args) { (this._events[type] ||= []).push({caller,method,args}); }
  off(type,caller,method) { this._events[type] = (this._events[type] || []).filter(h => { if (h.caller !== caller || h.method !== method) return true; h.method = null; h.args = null; h.caller = null; return false; }); }
  event(type,arg) { for (const h of [...(this._events[type] || [])]) h.method?.call(h.caller,arg); }
}
function fixture(t, options={}) {
  const scope = new ResourceScope(), settings = {...options}, saved = {}, proxy = new Native(); let calls = 0, skillCalls = 0;
  const item = new Native(); Object.assign(item,{Skill:{SkillId:62,Name:'苦肉'},seat:{HasSkill:()=>false},activated:false});
  item.on('click',item,function(){ skillCalls++; this.autoReset ||= {Value:true}; if(options.nativeBar && this.activated) { this.Selected=true; self.cardContainer.selectCardContext={message:"是否发动苦肉"}; self.Pt?.Show(); } });
  const ok = {_enabled:true,name:'btnOK',onClick(){calls++;}}, cancel = {_enabled:true,name:'btnCancel',onClick(){calls++;}};
  const self = {seat:{Index:0,Hp:3},skillItems:[item],buttonBar:{visible:true,btns:[ok,cancel],Show(){},Update(){}},cardContainer:{cardUis:[],selectCardContext:{}},spellSelector:{visible:false,Show(){}}};
  if (options.nativeBar) { self.Pt=self.buttonBar; delete self.buttonBar; }
  let scene = {SelfSeatUi:self,seatContainer:{seatUIs:[]}};
  const gc = {CanOperationInGame:()=>true,IsViewerOrReplay:()=>false};
  const ctx = {scope,window:{},ui:{},settings:{get:(k,f)=>saved[k]??f,set:(k,v)=>saved[k]=v},game:{getScene:()=>scene,getSnapshot:()=>({inGame:true}),getClass:()=>gc,getServerProxy:()=>proxy,getCardMeta:()=>({suit:3,type:2})},reportError:e=>{throw e;}};
  const runtime = createRuntime(ctx,()=>settings); t.after(()=>{runtime.dispose();scope.dispose();});
  return {runtime,self,item,settings,saved,gc,proxy,ctx,get calls(){return calls;},get skillCalls(){return skillCalls;},setScene:s=>scene=s};
}
const flush = () => new Promise(r=>setTimeout(r,15));
test('狂骨 chooses recovery below two HP, including dying, and reevaluates every prompt', async t => {
  const f = fixture(t,{skillLock:true});
  f.item.Skill = {SkillId:295}; f.runtime.tick(); f.runtime.toggle(295);
  const chosen = [];
  Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:295},
    btnList:[1,2].map(sendData => ({_enabled:true,data:{sendData}})),
    btnClick(btn){chosen.push(btn.data.sendData);}});
  for (const hp of [-2,0,1,2,3,'1','2',undefined,null,'',NaN]) {
    f.self.seat.Hp = hp;
    const before = chosen.length;
    f.self.spellSelector.Show(); f.runtime.tick(); await flush();
    const known = hp != null && hp !== '' && Number.isFinite(Number(hp));
    assert.equal(chosen.length,before + Number(known),`HP ${hp}`);
    if (known) assert.equal(chosen.at(-1),Number(hp)<2?1:2);
    f.runtime.tick(); await flush();
    assert.equal(chosen.length,before + Number(known),'same prompt submits once');
  }
});
test('baseline whitelist and conditional judgement support',()=>{
  assert.equal(SKILL_IDS.length,23+EXTRA_IDS.length); assert.equal(supported({Skill:{SkillId:48},seat:{HasSkill:()=>false}}),false);
  assert.equal(supported({Skill:{SkillId:48},seat:{HasSkill:id=>id===45}}),true);
});
test('auto confirm requires explicit selections and submits once per Show',async t=>{
  const f=fixture(t,{autoConfirm:true}); f.self.cardContainer.selectCardContext={message:'请选择牌',SelectCountMin:1,SelectCountMax:1};
  f.runtime.tick(); await flush(); assert.equal(f.calls,0);
  f.self.cardContainer.cardUis=[{selected:true}];f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.self.buttonBar.Show();await flush();assert.equal(f.calls,2);
});
test('skip peach preserves self and unknown target; viewer and game over block actions',async t=>{
  const f=fixture(t,{skipTao:true}); f.self.cardContainer.selectCardContext={SpecifySkillId:3};
  f.runtime.tick();await flush();assert.equal(f.calls,0);
  f.gc.NextSpellTargets=[0];f.runtime.tick();await flush();assert.equal(f.calls,0);
  f.gc.NextSpellTargets=[1];f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.gc.IsViewer=true;f.self.buttonBar.Show();f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.gc.IsViewer=false;f.runtime.tick();f.proxy.event('MsgGameOver');await flush();assert.equal(f.calls,1);
});
test('remember toggle and handler recovery preserve native click and rapid descriptor',async t=>{
  const f=fixture(t,{skillLock:true,remember:true,rapid:true});
  assert.equal(f.runtime.toggle(62,true),true); assert.deepEqual(f.saved.rememberedSkillIds,[62]);
  f.item.event('click');assert.equal(f.skillCalls,1);assert.equal(f.item.autoReset.Value,false);
  f.settings.remember=false;f.runtime.tick();assert.deepEqual(f.saved.rememberedSkillIds,[62],'obsolete setting has no effect');
  f.settings.rapid=false;f.runtime.tick();assert.equal(f.item.autoReset.Value,true);
  f.runtime.dispose();f.item.event('click');assert.equal(f.skillCalls,2);
});
test('long press cancels on mouseout, activates at 500ms and suppresses release click',async t=>{
  const f=fixture(t,{skillLock:true});f.gc.IsRoguelike1v1=true;
  f.item.event('mousedown');f.item.event('mouseout');await new Promise(r=>setTimeout(r,520));assert.equal(f.runtime.getSkills()[0].locked,false);
  f.item.event('mousedown');await new Promise(r=>setTimeout(r,520));assert.equal(f.runtime.getSkills()[0].locked,true);
  f.item.event('mouseup');f.item.event('click');assert.equal(f.skillCalls,0);
  f.item.event('mousedown');f.item.event('mouseup');f.item.event('click');assert.equal(f.runtime.getSkills()[0].locked,false);assert.equal(f.skillCalls,0);
});
test('ordinary wuxie and assist skip once; shanhe requires the current source trigger',async t=>{
  const f=fixture(t,{skipWuxie:true,skipAssist:true});f.self.cardContainer.selectCardContext={SpecifySkillId:13};
  f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.gc.IsRoguelike1v1=true;f.self.buttonBar.Show();await flush();assert.equal(f.calls,1);
  f.proxy.event('MsgGameTurnNtf',{SeatID:0});f.proxy.event('GsCGamephaseNtf',{Round:4});f.proxy.event('PubGsCUseCard',{SeatID:0,CardID:7,SpellID:8});
  f.runtime.tick();await flush();assert.equal(f.calls,1,'last card alone is insufficient');
  f.proxy.event('GsCTriggerSpellNew',{SrcSpellID:8,FirstTriggerParam:{SpellId:13,SeatId:1}});f.runtime.tick();await flush();assert.equal(f.calls,1);
  f.proxy.event('GsCTriggerSpellNew',{SrcSpellID:8,FirstTriggerParam:{SpellId:13,SeatId:0}});f.runtime.tick();await flush();assert.equal(f.calls,2);
  f.self.cardContainer.selectCardContext={};f.self.buttonBar.btns[0].label='助战';f.self.buttonBar.Show();await flush();assert.equal(f.calls,3);
});
test('fire attack conversion selects the legal card; selector cancellation submits once',async t=>{
  const f=fixture(t,{fireAttack:true,skipWuxie:true});const convert = new Native();Object.assign(convert,{Skill:{SkillId:3744},activated:true,Selected:false});
  const card={activated:false,selected:false,setSelected(v){this.selected=v;}};convert.on('click',convert,()=>{convert.Selected=!convert.Selected;card.activated=convert.Selected;});
  f.self.skillItems.push(convert);f.self.seat.HasSkill=id=>id===3744;f.self.seat.LastAttackByTheSkill={ID:83};f.self.cardContainer.cardUis=[card];f.self.cardContainer.selectCardContext={message:'弃置红色的手牌，对目标造成伤害'};
  f.runtime.tick();await flush();assert.equal(card.selected,true);assert.equal(f.calls,1);
  let clicks=0;Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:13},btnList:[{_enabled:true,data:{sendData:255}}],btnClick(){clicks++;}});
  f.runtime.tick();await flush();f.runtime.tick();await flush();assert.equal(clicks,1);f.self.spellSelector.Show();await flush();assert.equal(clicks,2);
});
test('制衡, 同花色, 鬼才 and 250 keep their specific selection rules',async t=>{
  const f=fixture(t,{skillLock:true});const setSkill=id=>{f.item.Skill={SkillId:id,Name:String(id)};f.item.seat.HasSkill=()=>true;f.runtime.tick();f.runtime.toggle(id);f.self.buttonBar.Show();};
  let all=0;f.self.cardContainer.AllSelectHandCards=()=>all++;f.self.cardContainer.cardUis=[{activated:true,setSelected(v){this.selected=v;}}];setSkill(101);f.self.cardContainer.selectCardContext={Skill:{SkillId:101}};f.runtime.tick();await flush();assert.equal(all,0);assert.equal(f.self.cardContainer.cardUis[0].selected,true);assert.equal(f.calls,1);
  setSkill(102);f.self.cardContainer.selectCardContext={Skill:{SkillId:102}};f.self.cardContainer.cardUis=[1,1,2].map(suit=>({activated:true,Card:{FlowerOnSeat:suit},setSelected(v){this.selected=v;}}));f.runtime.tick();await flush();assert.equal(f.self.cardContainer.cardUis.filter(c=>c.selected).length,2);assert.equal(f.calls,2);
  setSkill(48);f.self.cardContainer.selectCardContext={Skill:{SkillId:48},message:'鬼才'};f.runtime.tick();await flush();assert.equal(f.calls,2);f.proxy.event('PubGsCMoveCard',{ToZone:3,ToID:255,CardIDs:[9]});f.runtime.tick();await flush();assert.equal(f.calls,3);
  setSkill(250);let chosen='';Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:250},btnList:['摸一张牌','令其摸两张牌'].map(label=>({_enabled:true,data:{label}})),btnClick(b){chosen=b.data.label;}});
  f.runtime.tick();await flush();assert.equal(chosen,'');f.proxy.event('MsgGameTurnNtf',{SeatID:0});f.runtime.tick();await flush();assert.equal(chosen,'令其摸两张牌');
});
test('new scene preserves only remembered locks; round passed cancels pending operations',async t=>{
  const f=fixture(t,{skillLock:true,remember:true,autoConfirm:true});f.runtime.toggle(62,true);
  const next={SelfSeatUi:{...f.self,seat:{...f.self.seat}},seatContainer:{seatUIs:[]}};f.setScene(next);f.runtime.tick();assert.equal(f.runtime.getSkills()[0].locked,true);
  f.runtime.toggle(62);f.runtime.toggle(62);f.runtime.tick();f.setScene({...next});f.runtime.tick();assert.equal(f.runtime.getSkills()[0].locked,false);
  next.SelfSeatUi.cardContainer={cardUis:[{selected:true}],selectCardContext:{message:'选择牌',SelectCountMax:1}};f.runtime.tick();f.proxy.event('MsgGameRoundNtf',{isPassed:true});await flush();assert.equal(f.calls,0);assert.deepEqual(f.runtime.getSkills(),[]);
});
test('pause retains local locks and unsupported skills have no long-press listeners',t=>{
  const f=fixture(t,{skillLock:true});f.runtime.toggle(62);f.gc.CanOperationInGame=()=>false;f.runtime.tick();assert.equal(f.runtime.getSkills()[0].locked,true);
  const other=new Native();other.Skill={SkillId:99999};f.self.skillItems.push(other);f.gc.CanOperationInGame=()=>true;f.runtime.tick();assert.equal(other._events.mousedown,undefined);
});

test('native private dispatcher: long press, automatic selection and confirmation, unlock and restore',async t=>{
  const f=fixture(t,{skillLock:true});
  const item=new Native(), dispatcher=new Native(); let casts=0, decoration=0;
  item.eventDispatcher=dispatcher; item.Skill={SkillId:62,Name:'苦肉'};item.seat=f.self.seat;item.activated=true;
  item.onClick=()=>decoration++;
  item.onMouse=function(e){if(e.type==='click'&&!this.activated)return;this.eventDispatcher.event(e.type,e);};
  // Outer Laya listeners and private business listeners are intentionally separate.
  Native.prototype.on.call(item,'click',item,item.onMouse);
  item.on=(...args)=>dispatcher.on(...args);item.off=(...args)=>dispatcher.off(...args);
  item.on('click',item,item.onClick);
  function skillClick(){casts++;item.Selected=true;f.self.cardContainer.selectCardContext={message:'是否发动苦肉'};f.self.buttonBar.Show();}
  item.on('click',item,skillClick);
  f.self.skillItems=[item];f.runtime.tick();
  f.gc.IsRoguelike1v1=true;item.onMouse({type:'mousedown'});await new Promise(r=>setTimeout(r,540));
  await flush();await flush();
  assert.equal(f.runtime.getSkills()[0].locked,true);
  assert.equal(casts,1,'automatic click reaches business handler exactly once');
  assert.equal(f.calls,1,'selected native prompt is confirmed even with autoConfirm off');
  item.onMouse({type:'mouseup'});item.onMouse({type:'click'});
  assert.equal(casts,1,'release click suppressed after automatic cast');
  item.onMouse({type:'mousedown'});item.onMouse({type:'mouseup'});item.onMouse({type:'click'});
  assert.equal(casts,1);assert.equal(f.runtime.getSkills()[0].locked,false);
  f.runtime.dispose();item.onMouse({type:'click'});assert.equal(casts,2);
  assert.ok(decoration>=3,'unrelated native listener remains installed');
  assert.equal(dispatcher._events.click.filter(h=>h.method===skillClick).length,1);
});

test('every unconditional skill reaches its native activation and confirmation path',async t=>{
  for(const id of SKILL_IDS.filter(id=>![3750,3753,...EXTRA_IDS].includes(id))){
    const f=fixture(t,{skillLock:true});f.item.Skill={SkillId:id,Name:'技能'+id};f.item.activated=true;
    f.item.on('click',f.item,()=>{f.item.Selected=true;f.self.cardContainer.selectCardContext={message:'是否发动技能'+id};f.self.buttonBar.Show();});
    f.runtime.tick();assert.equal(f.runtime.toggle(id),true);await flush();await flush();
    const expected = [484,3876].includes(id) ? 0 : 1;
    assert.equal(f.skillCalls,expected,'activation '+id);assert.equal(f.calls,expected,'confirmation '+id);
    f.runtime.dispose();
  }
});

test('closure-local GameContext does not block 苦肉 / 极奢 or native rapid throttle',async t=>{
  const {nativeMethods}=await import('./fixtures/play-assist-native-methods.js');
  for(const id of [62,769]){
    const f=fixture(t,{skillLock:true,rapid:true});f.ctx.game.getClass=()=>null;
    const item=new Native();let selections=0,blocked=0;
    Object.assign(item,{Skill:{SkillId:id,Name:id===62?'苦肉':'极奢'},seat:f.self.seat,activated:true});
    item.skill={ID:id,OnOpenWindowOrUseSkill:()=>false};item.G=function(v){this.selected=v;this.Selected=v;selections++;f.self.cardContainer.selectCardContext={message:'是否发动'+item.Skill.Name};f.self.buttonBar.Show();};
    const methods=nativeMethods({timer:{once(){},clear(){}}},{CanOperationInGame:()=>true,IsCountryWar:false},{DIANZAN:-1},{I:()=>({ShowTextPrompt(){blocked++;}})},{Click_Tips:'节流'},{});
    item.on('click',item,methods.M);f.self.skillItems=[item];f.runtime.tick();
    assert.equal(f.runtime.toggle(id),true);await flush();await flush();
    assert.equal(selections,1);assert.equal(f.calls,1);
    // The actual native handler constructs its throttle on first click.
    assert.equal(item.autoReset.Value,false);
    f.runtime.toggle(id);item.event('click');item.event('click');
    assert.equal(selections,3);assert.equal(blocked,0);
    f.settings.rapid=false;f.runtime.tick();item.autoReset.Value=false;
    item.event('click');item.event('click');assert.equal(blocked,1,'native throttle restored');
    f.runtime.dispose();
  }
});
test('missing GameContext still respects replay, scene viewer, death and trusteeship',async t=>{
  const f=fixture(t,{skillLock:true,rapid:true});f.ctx.game.getClass=()=>null;
  f.ctx.game.getSnapshot=()=>({inGame:true,isReplay:true});assert.equal(f.runtime.toggle(62),false);
  f.ctx.game.getSnapshot=()=>({inGame:true});f.self.seat.IsAiControl=true;assert.equal(f.runtime.toggle(62),false);
  f.self.seat.IsAiControl=false;f.self.seat.IsDead=true;assert.equal(f.runtime.toggle(62),false);
  f.self.seat.IsDead=false;f.ctx.game.getScene().IsViewer=true;assert.equal(f.runtime.toggle(62),false);
});

 test('official Pt without legacy alias: long press, repeated activation, unlock and rapid restore',async t=>{
  const f=fixture(t,{skillLock:true,rapid:true,nativeBar:true});f.ctx.game.getClass=()=>null;
  f.item.activated=true;
  f.ctx.game.getScene().SceneName='RogueLikeGameScene';f.runtime.tick();f.item.event('mousedown');await new Promise(r=>setTimeout(r,540));await flush();await flush();
  assert.equal(f.runtime.getSkills()[0].locked,true);assert.equal(f.skillCalls,1);assert.equal(f.calls,1);
  f.item.event('mouseup');f.item.event('click');assert.equal(f.skillCalls,1);
  f.item.Selected=false;f.runtime.tick();await flush();await flush();
  assert.equal(f.skillCalls,2);assert.equal(f.calls,2);assert.equal(f.item.autoReset.Value,false);
  f.item.event('mousedown');f.item.event('mouseup');f.item.event('click');
  assert.equal(f.runtime.getSkills()[0].locked,false);assert.equal(f.skillCalls,2);
  f.settings.rapid=false;f.runtime.tick();assert.equal(f.item.autoReset.Value,true);
});
test('skill bindings survive absent bar and adopt a newly created Pt',async t=>{
  const f=fixture(t,{skillLock:true,rapid:true,nativeBar:true});const bar=f.self.Pt;delete f.self.Pt;
  f.runtime.tick();assert.equal(f.runtime.toggle(62),true);
  f.self.Pt=bar;f.item.activated=true;
  f.runtime.tick();await flush();await flush();assert.equal(f.calls,1);
});

test('official confirm uses SpriteButton onMouse before inherited onClick',async t=>{
 const f=fixture(t,{autoConfirm:true,nativeBar:true});let sent=0;
 f.self.Pt.btns=[{name:'btnOK',_enabled:true,onClick(){throw Error('inherited click requires native event');},onMouse(e){assert.equal(e.type,'click');sent++;}}];
 f.self.cardContainer.cardUis=[{selected:true}];f.self.cardContainer.selectCardContext={message:'确定',SelectCountMax:1};
 f.runtime.tick();await flush();assert.equal(sent,1);
});


test('unknown mode requires two seconds and early release cancels locking',async t=>{
  const f=fixture(t,{skillLock:true});f.ctx.game.getClass=()=>null;
  f.item.event('mousedown');await new Promise(r=>setTimeout(r,600));
  assert.equal(f.runtime.getSkills()[0].locked,false);
  f.item.event('mouseup');await new Promise(r=>setTimeout(r,1500));
  assert.equal(f.runtime.getSkills()[0].locked,false);
  f.item.event('mousedown');await new Promise(r=>setTimeout(r,2100));
  assert.equal(f.runtime.getSkills()[0].locked,true);
  f.item.event('mouseup');f.item.event('click');assert.equal(f.skillCalls,0);
});


test('迁附 replaces 驭势 as the lockable skill',t=>{
  const f=fixture(t,{skillLock:true});
  assert.equal(supported({Skill:{SkillId:3751}}),false);
  for(const id of [3750,3753]) assert.equal(supported({Skill:{SkillId:id}}),true);
  f.item.Skill={SkillId:3751,Name:'驭势'};f.runtime.tick();
  assert.equal(f.runtime.toggle(3751),false);assert.deepEqual(f.runtime.getSkills(),[]);
});

test('迁附 selects one native-legal card, preserves targets and waits for native OK',async t=>{
  for(const id of [3750,3753]) for(const [colour,trick] of [['黑','过河拆桥'],['红','火攻']]){
    const f=fixture(t,{skillLock:true});f.item.Skill={SkillId:id,Name:'迁附'};f.runtime.tick();f.runtime.toggle(id);
    const selected=[];const illegal={activated:false,setSelected(){throw Error('illegal card');}};
    const card={activated:true,selected:false,setSelected(v){this.selected=v;selected.push(this);}};
    const extra={activated:true,selected:false,setSelected(){throw Error('second card');}};
    f.self.cardContainer.cardUis=[illegal,card,extra];
    f.self.cardContainer.selectCardContext={Skill:{SkillId:id},message:'请选择一张'+colour+'色牌，当'+trick+'使用'};
    const ok=f.self.buttonBar.btns[0];ok._enabled=false;
    f.runtime.tick();await flush();assert.equal(selected.length,1);assert.equal(f.calls,0);
    f.self.seat.Selected=false;ok._enabled=true;f.self.buttonBar.Show();await flush();
    assert.equal(f.calls,1);assert.equal(selected.length,1);assert.equal(f.self.seat.Selected,false);
    f.runtime.tick();await flush();assert.equal(f.calls,1);f.runtime.dispose();
  }
});

test('locked 迁附 cancels topdeck and 驭势 prompts, without enabling autoConfirm',async t=>{
  for(const id of [3750,3753]){
    const f=fixture(t,{skillLock:true});f.item.Skill={SkillId:id,Name:'迁附'};f.runtime.tick();f.runtime.toggle(id);
    let cancel=0,confirm=0;f.self.buttonBar.btns[0].onClick=()=>confirm++;f.self.buttonBar.btns[1].onClick=()=>cancel++;
    f.self.cardContainer.selectCardContext={Skill:{SkillId:id},message:'是否将弃置的牌置于牌堆顶'};
    f.runtime.tick();await flush();assert.equal(cancel,1);assert.equal(confirm,0);
    f.self.cardContainer.selectCardContext={Skill:{SkillId:3751},message:'请选择一名角色，对其发动驭势'};
    f.self.buttonBar.Show();await flush();assert.equal(cancel,2);assert.equal(confirm,0);
    f.runtime.toggle(id);f.self.buttonBar.Show();await flush();assert.equal(cancel,2);
  }
});

test('迁附 selector declines optional prompts and leaves unknown prompts manual',async t=>{
  const f=fixture(t,{skillLock:true});f.item.Skill={SkillId:3750,Name:'迁附'};f.runtime.tick();f.runtime.toggle(3750);
  let picked=[];Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:3750},txtOptMsg:{_innerHTML:'是否将弃置的牌置于牌堆顶'},btnList:[{_enabled:true,data:{sendData:1}},{_enabled:true,data:{sendData:255}}],btnClick:b=>picked.push(b.data.sendData)});
  f.self.spellSelector.Show();await flush();assert.deepEqual(picked,[255]);
  f.self.spellSelector.spell.SkillId=3751;f.self.spellSelector.Show();await flush();assert.deepEqual(picked,[255,255]);
  f.self.spellSelector.spell.SkillId=3750;f.self.spellSelector.txtOptMsg._innerHTML='未知询问';f.self.spellSelector.Show();await flush();assert.deepEqual(picked,[255,255]);
});


test('迁附 multi-trigger prompt uses native callback Cancel rather than activating topdeck',async t=>{
  for(const field of ['FirstTriggerParam','TriggerSpellData']){
    const f=fixture(t,{skillLock:true,autoConfirm:true});f.item.Skill={SkillId:3750,Name:'迁附'};f.runtime.tick();f.runtime.toggle(3750);
    let cast=0,cancelled=0;
    const trigger=field==='FirstTriggerParam'?{FirstTriggerParam:{SpellId:3750}}:{TriggerSpellData:[{SpellId:3750}]};
    const activate={_enabled:true,data:{label:'迁附',callBack:()=>cast++,callBackParams:[trigger,{},true]}};
    const cancel={_enabled:true,data:{label:'取消',callBack:()=>cancelled++,callBackParams:[null,{},false]}};
    Object.assign(f.self.spellSelector,{visible:true,spell:null,btnList:[activate,cancel],btnClick:b=>b.data.callBack()});
    f.self.spellSelector.Show();await flush();assert.equal(cast,0);assert.equal(cancelled,1);
    f.runtime.tick();await flush();assert.equal(cancelled,1);f.runtime.dispose();
  }
});

test('迁附 default ask and current bar topdeck text override stale conversion context',async t=>{
  for(const text of ['是否发动<font color="#ffff00">迁附</font>','是否将弃置的牌置于牌堆顶']){
    const f=fixture(t,{skillLock:true,autoConfirm:true,fireAttack:true});f.item.Skill={SkillId:3750,Name:'迁附'};f.runtime.tick();f.runtime.toggle(3750);
    let ok=0,cancel=0;f.self.buttonBar.btns[0].onClick=()=>ok++;f.self.buttonBar.btns[1].onClick=()=>cancel++;
    f.self.cardContainer.cardUis=[{selected:true}];
    f.self.cardContainer.selectCardContext={Skill:{SkillId:3750},message:'请选择一张黑色牌，当过河拆桥使用'};
    f.self.buttonBar.txtOptMsg={_innerHTML:text};f.self.buttonBar.Show();await flush();
    assert.equal(ok,0);assert.equal(cancel,1);
  }
});


test('missing or disabled Cancel never falls through to topdeck confirmation',async t=>{
  for(const selector of [false,true]){
    const f=fixture(t,{skillLock:true,autoConfirm:true});f.item.Skill={SkillId:3750,Name:'迁附'};f.runtime.tick();f.runtime.toggle(3750);
    f.self.cardContainer.selectCardContext={message:'是否发动迁附'};f.self.cardContainer.cardUis=[{selected:true}];
    let ok=0;f.self.buttonBar.btns[0].onClick=()=>ok++;f.self.buttonBar.btns[1]._enabled=false;
    if(selector) Object.assign(f.self.spellSelector,{visible:true,spell:null,btnList:[{_enabled:true,data:{callBackParams:[{FirstTriggerParam:{SpellId:3750}}],callBack(){}}}],btnClick(){ok++;}});
    f.runtime.tick();await flush();assert.equal(ok,0);
  }
});


function card({suit=1,skill=1,type=0,available=true,equipped=false}={}) {
  return {activated:available,selected:false,Card:{FlowerOnSeat:suit,FirstSkillId:skill,Type:type,Equipped:equipped},setSelected(v){this.selected=v;}};
}
function arm(t,id,options={}) {
  const f=fixture(t,{skillLock:true,autoConfirm:true,...options});f.item.Skill={SkillId:id,Name:'技能'+id};f.runtime.tick();f.runtime.toggle(id);
  let ok=0,cancel=0;f.self.buttonBar.btns[0].onClick=()=>ok++;f.self.buttonBar.btns[1].onClick=()=>cancel++;
  return {...f,get ok(){return ok;},get cancel(){return cancel;},context(message,extra={}){f.self.cardContainer.selectCardContext={Skill:{SkillId:id},message,...extra};f.self.buttonBar.Show();f.runtime.tick();}};
}
function selfTarget(f) {
 const target={Activated:true,seat:{Index:0,Selected:false},seatClickHandler(){this.seat.Selected=true;}};
 f.ctx.game.getScene().seatContainer.seatUIs=[target];return target;
}

test('烈弓 / 伤逝 / 落英 / 破军 standard and boundary IDs confirm',async t=>{
 for(const id of [71,297,3264,419,401,414,3389]){
  const f=arm(t,id);f.context('是否发动技能'+id);await flush();assert.equal(f.ok,1,'confirm '+id);f.runtime.dispose();
 }
});
test('武圣 red, 武娘 nonbasic and 谬焰 majority black suit select one without choosing targets',async t=>{
 for(const id of [33,878,3796,3274]){
  const f=arm(t,id);const target=selfTarget(f);
  f.self.cardContainer.cardUis=[card({suit:1}),card({suit:3,type:1}),card({suit:4,type:3}),card({suit:4,type:1})];
  f.self.buttonBar.btns[0]._enabled=false;
  f.context(id===3274?'请选择一张黑色牌当火攻使用':id===3796?'请选择一张非基本牌当杀使用':'选择一张红色的手牌或者装备');await flush();
  const picked=f.self.cardContainer.cardUis.filter(c=>c.selected);assert.equal(picked.length,1);
  assert.equal(target.seat.Selected,false);assert.equal(f.ok,0);
  assert.equal(picked[0],f.self.cardContainer.cardUis[id===3274?2:id===3796?1:0]);
  f.runtime.dispose();
 }
});
test('武娘 lose HP only in 山河 with HP above two; otherwise cancels',async t=>{
 for(const [shanhe,hp,want] of [[true,3,1],[true,2,0],[false,4,0]]){
  const f=arm(t,3796);f.ctx.game.getScene().SceneName=shanhe?'RogueLikeGameScene':'GameScene';f.self.seat.Hp=hp;
  f.self.cardContainer.cardUis=[card()];f.self.cardContainer.cardUis[0].selected=true;
  f.context('是否失去1点体力重置镇南');await flush();assert.equal(f.ok,want);assert.equal(f.cancel,1-want);f.runtime.dispose();
 }
});
test('百出 chooses draw; 怀远 targets self then chooses draw; unknown 百出 choices stay manual',async t=>{
 for(const id of [3338,3081]){
  const f=arm(t,id);let sends=[];const target=selfTarget(f);
  if(id===3081){f.context('请选择一名角色');await flush();assert.equal(target.seat.Selected,true);assert.equal(f.ok,1);}
  Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:id},btnList:[{_enabled:true,data:{sendData:0,label:'回复1点体力'}},{_enabled:true,data:{sendData:id===3338?1:3,label:'摸一张牌'}}],btnClick:b=>sends.push(b.data.sendData)});
  f.self.spellSelector.Show();await flush();assert.deepEqual(sends,[id===3338?1:3]);f.runtime.dispose();
 }
});
test('应援 uses Cancel in direct and trigger callback prompts, never activates',async t=>{
 const f=arm(t,384);f.context('是否发动应援');await flush();assert.equal(f.ok,0);assert.equal(f.cancel,1);
 let yes=0,no=0;Object.assign(f.self.spellSelector,{visible:true,spell:null,btnList:[{_enabled:true,data:{callBack(){yes++;},callBackParams:[{FirstTriggerParam:{SpellId:384}}]}},{_enabled:true,data:{label:'取消',callBack(){no++;},callBackParams:[null]}}],btnClick:b=>b.data.callBack()});
 f.self.spellSelector.Show();await flush();assert.equal(yes,0);assert.equal(no,1);
});
test('卫戍 draws to self; discard stays manual even with autoConfirm enabled',async t=>{
 const f=arm(t,3084),target=selfTarget(f);f.context('请选择一名角色，令其摸1张牌');await flush();assert.equal(target.seat.Selected,true);assert.equal(f.ok,1);
 f.context('请选择一名角色，弃置其1张牌');await flush();assert.equal(f.ok,1);assert.equal(f.cancel,0);
});
test('合击 uses red Sha only; black Sha / duel / unknown cards never submit',async t=>{
 for(const cards of [[card({suit:3})],[card({skill:8})],[card({suit:1})]]){
  const f=arm(t,3586);f.self.cardContainer.cardUis=cards;f.context('请选择一张杀或决斗对目标使用');await flush();
  assert.equal(f.ok,cards[0].Card.FirstSkillId===1 && cards[0].Card.FlowerOnSeat===1?1:0);f.runtime.dispose();
 }
});
test('龙吟 requires own turn and own red Sha; discard prioritizes 闪桃酒无懈',async t=>{
 for(const id of [446,21003]) for(const [seat,suit,want] of [[0,1,1],[0,3,0],[1,1,0]]){
  const f=arm(t,id);f.ctx.game.getCardMeta=()=>({suit,type:0});
  f.proxy.event('MsgGameTurnNtf',{SeatID:seat});f.proxy.event('PubGsCUseCard',{SeatID:seat,SpellID:1,CardID:12});
  const cards=[card({skill:1}),card({skill:13}),card({skill:2})];f.self.cardContainer.cardUis=cards;
  f.context('请选择一张要弃置的牌');await flush();assert.equal(f.ok,want);assert.equal(cards[2].selected,want===1);f.runtime.dispose();
 }
});
test('覆载 selects equipped equipment and only virtual 无中生有',async t=>{
 const f=arm(t,3824);f.self.cardContainer.cardUis=[];
 const equipment=card({type:4,equipped:true}),wuzhong=card({skill:7,type:1}),jiedao=card({skill:12,type:1});
 f.self.cardContainer.equipCardUis=[equipment];f.self.cardContainer.virtualCardUis=[jiedao,wuzhong];
 f.context('请将一张装备牌当借刀或无中生有使用');await flush();assert.equal(equipment.selected,true);assert.equal(wuzhong.selected,true);assert.equal(jiedao.selected,false);assert.equal(f.ok,1);
});
test('破军 ordering covers armour, treasure, equipment equalization, hand, rest and HP cap',()=>{
 const armour=card({type:4}),treasure=card({type:7}),weapon=card({type:3}),horse=card({type:5}),hand=card();
 assert.deepEqual(pojunCards([hand],[weapon,armour,horse,treasure],4,1),[armour,treasure,weapon,hand]);
 assert.deepEqual(pojunCards([hand],[weapon,armour,horse,treasure],20,4),[armour,treasure,hand,weapon,horse]);
 assert.deepEqual(pojunCards([hand],[weapon,armour],1,0),[armour]);
 assert.equal(pojunCards([hand],[weapon],2,NaN),null);
});


test('strategy preferences preserve native illegality and random fallback only after preferred cards',()=>{
 const blocked=card({skill:2});blocked.CanBeSelected=false;
 const inactive=card({skill:3,available:false});inactive.CanBeSelected=true;
 const a=card({skill:1}),b=card({skill:8});
 assert.equal(longyinCard([blocked,inactive,a,b],()=>0.99),b);
 const spade1=card({suit:3}),spade2=card({suit:3,available:false}),club=card({suit:4});
 assert.equal(miuyanCard([spade1,spade2,club]),spade1);
});
test('locked default 应援 prompt without select context still cancels; ordinary conversion works after declines',async t=>{
 const f=arm(t,384);f.self.cardContainer.selectCardContext={message:'是否发动应援'};f.self.cardContainer.cardUis=[card()];f.self.cardContainer.cardUis[0].selected=true;
 f.runtime.tick();await flush();assert.equal(f.ok,0);assert.equal(f.cancel,1);
});
test('mixed 应援 and 烈弓 trigger list may activate only 烈弓',async t=>{
 const f=arm(t,384);const other=new Native();other.Skill={SkillId:71,Name:'烈弓'};f.self.skillItems.push(other);f.runtime.tick();f.runtime.toggle(71);
 let picked=[];Object.assign(f.self.spellSelector,{visible:true,btnList:[384,71].map(id=>({_enabled:true,data:{callBackParams:[{FirstTriggerParam:{SpellId:id}}]}})),btnClick:b=>picked.push(b.data.callBackParams[0].FirstTriggerParam.SpellId)});
 f.self.spellSelector.Show();await flush();assert.deepEqual(picked,[71]);
});


test('current native bar preserves 武娘 HP and 卫戍 discard boundaries over stale contexts',async t=>{
 for(const id of [3796,3084]){
  const f=arm(t,id);selfTarget(f);f.self.cardContainer.cardUis=[card({type:1})];f.self.cardContainer.cardUis[0].selected=true;
  f.self.buttonBar.txtOptMsg={_innerHTML:id===3796?'是否失去1点体力重置镇南':'请选择一名角色，弃置其1张牌'};
  f.context(id===3796?'请选择一张非基本牌当杀使用':'请选择一名角色，令其摸1张牌');await flush();
  assert.equal(f.ok,0);assert.equal(f.cancel,id===3796?1:0);f.runtime.dispose();
 }
});


test('怀远 selects self through seatClickHandler before choosing draw, without an onMouse method',async t=>{
 const f=arm(t,3081);let clicks=0,draws=0;
 const own={Activated:true,Seat:{Index:0,Selected:false},seatClickHandler(){clicks++;this.Seat.Selected=true;Object.assign(f.self.spellSelector,{visible:true,spell:{ID:3081},btnList:[{_enabled:true,data:{sendData:3,label:'【摸1张牌】'}}],btnClick(){draws++;}});f.self.spellSelector.Show();}};
 f.ctx.game.getScene().seatContainer.seatUIs=[own];
 f.context('请选择一名角色');await flush();await flush();
 assert.equal(own.Seat.Selected,true);assert.equal(clicks,1);assert.equal(draws,1);
 f.runtime.tick();await flush();assert.equal(clicks,1);assert.equal(draws,1);
});


test('龙吟 accepts native turn packet without SeatID and lowercase spellID for a red Sha',async t=>{
 const f=arm(t,21003);f.self.seat.InOwnRound=true;f.ctx.game.getCardMeta=()=>({suit:2,type:0,name:'杀',cardClass:'Sha'});
 f.proxy.event('MsgGameTurnNtf',{Protocol:{TurnCnt:1}});
 f.proxy.event('PubGsCUseCard',{Protocol:{SeatID:0,CardID:99,spellID:1,useType:0}});
 f.context('是否发动龙吟');await flush();assert.equal(f.ok,1);
 f.self.cardContainer.cardUis=[card({skill:2})];f.context('请选择一张要弃置的牌');await flush();assert.equal(f.ok,2);
});
test('龙吟 uses phase seat and native zero spellID card definition, preserving black/offturn rejection',async t=>{
 for(const [suit,seat,own,want] of [[2,0,true,1],[3,0,true,0],[2,1,false,0]]){
  const f=arm(t,446);f.self.seat.InOwnRound=own;f.ctx.game.getCardMeta=()=>({suit,name:'杀',cardClass:'Sha'});
  f.proxy.event('MsgGameTurnNtf',{TurnCnt:1});f.proxy.event('GsCGamephaseNtf',{SeatID:seat,Round:4});
  f.proxy.event('PubGsCUseCard',{SeatID:seat,CardID:99,spellID:0});
  f.context('是否发动龙吟');await flush();assert.equal(f.ok,want);f.runtime.dispose();
 }
});


test('龙吟 accepts arbitrary red-card conversions through use-card and use-spell plus native trigger proof',async t=>{
 for(const mode of ['card','spell']) for(const conversion of [33,878,3796,99999]){
  const f=arm(t,21003);f.self.seat.InOwnRound=true;f.ctx.game.getCardMeta=()=>({suit:2,name:'闪',type:0});
  if(mode==='card') f.proxy.event('PubGsCUseCard',{SeatID:0,CardID:99,spellID:conversion});
  else f.proxy.event('PubGsCUseSpell',{SeatID:0,SpellID:conversion,CardIDs:[99],Spell:{IsThis:n=>n===1}});
  f.proxy.event('GsCTriggerSpellNew',{SrcSpellID:conversion,SrcSpellCasterSeat:0,FirstTriggerParam:{SpellId:21003,SeatId:0}});
  f.context('是否发动龙吟');await flush();assert.equal(f.ok,1,mode+' '+conversion);f.runtime.dispose();
 }
});
test('conversion material colour and final Sha identity are both required for 龙吟',async t=>{
 for(const [suits,trigger,expected] of [[[1,2],446,1],[[1,3],446,0],[[3,4],446,0],[[1,2],13,0]]){
  const f=arm(t,446);f.self.seat.InOwnRound=true;f.ctx.game.getCardMeta=n=>({suit:suits[n-1],name:'闪'});
  f.proxy.event('PubGsCUseSpell',{SeatID:0,SpellID:99999,CardIDs:[1,2],Spell:{IsThis:n=>n===1}});
  f.proxy.event('GsCTriggerSpellNew',{SrcSpellID:1,SrcSpellCasterSeat:0,TriggerSpellData:[{SpellId:trigger,SeatId:0}]});
  f.context('是否发动龙吟');await flush();assert.equal(f.ok,expected);f.runtime.dispose();
 }
});

for (const id of [102,891]) for (const officialPrompt of [false,true]) test(`乱击 ${id} removal targets (official=${officialPrompt}) confirm once`, async t => {
  const f=fixture(t,{skillLock:true});
  f.item.Skill={SkillId:id,Name:'乱击'};
  f.runtime.tick();f.runtime.toggle(id);
  const scene=f.ctx.game.getScene();
  scene.seatContainer.selectContext={Skill:{SkillId:officialPrompt ? 8 : id},SelectCountMin:0};
  scene.seatContainer.seatUIs=[{seat:{Selected:false}}];
  f.self.cardContainer.selectCardContext={message:officialPrompt ? '请选择一名角色，令其不成为<font color="#ffff00">万箭齐发</font>的目标' : '请选择要取消的目标',SelectCountMax:2};
  f.runtime.tick();await flush();assert.equal(f.calls,0,'zero targets stays manual');
  scene.seatContainer.seatUIs[0].seat.Selected=true;
  f.self.buttonBar.btns[0]._enabled=false;
  f.runtime.tick();await flush();assert.equal(f.calls,0,'disabled confirmation stays manual');
  f.self.buttonBar.btns[0]._enabled=true;
  f.self.buttonBar.Update();await flush();assert.equal(f.calls,1);
  f.runtime.tick();await flush();assert.equal(f.calls,1,'no duplicate submission');
  f.runtime.toggle(id);f.self.buttonBar.Show();await flush();assert.equal(f.calls,1,'unlocked skill stays manual');
});

for (const id of [97,3260,101,3269,102,891,3750,3753]) test(`conversion ${id} prefers legal Wuxie`, async t=>{
 const f=fixture(t,{skillLock:true});f.item.Skill={SkillId:id,Name:'转换'};f.runtime.tick();f.runtime.toggle(id);
 const card=(spell,suit,activated=true)=>({activated,Card:{FirstSkillId:spell,FlowerOnSeat:suit},setSelected(v){this.selected=v;}});
 const cards=[card(1,1),card(1,1),card(13,3,false),card(2,3),card(13,3)];
 f.self.cardContainer.cardUis=cards;
 f.self.cardContainer.selectCardContext={Skill:{SkillId:id},message:'请选择一张黑色牌，当过河拆桥使用'};
 f.runtime.tick();await flush();assert.equal(cards[4].selected,true);assert.equal(cards[2].selected,undefined);
 assert.equal(cards.filter(c=>c.selected).length,[102,891].includes(id)?2:1);
});

test('right hold remembers, left press cancels saved choice; short hold and mouseout do not save',async t=>{
 const f=fixture(t,{skillLock:true});f.gc.IsRoguelike1v1=true;
 f.item.event('rightmousedown');f.item.event('rightmouseup');await new Promise(r=>setTimeout(r,530));
 assert.equal(f.runtime.getSkills()[0].locked,false);
 f.item.event('rightmousedown');await new Promise(r=>setTimeout(r,530));f.item.event('rightmouseup');
 assert.equal(f.runtime.getSkills()[0].remembered,true);assert.deepEqual(f.saved.rememberedSkillIds,[62]);
 f.item.event('mousedown');f.item.event('mouseup');f.item.event('click');
 assert.equal(f.runtime.getSkills()[0].locked,false);assert.deepEqual(f.saved.rememberedSkillIds,[]);assert.equal(f.skillCalls,0);
});

for (const shanhe of [true,false]) test(`mobile staged hold (shanhe=${shanhe}) enables then remembers`,async t=>{
 const f=fixture(t,{skillLock:true});f.gc.IsRoguelike1v1=shanhe;
 const messages=[];f.ctx.notify=m=>messages.push(m);
 f.item.event('mousedown',{nativeEvent:{touches:[{}]}});
 await new Promise(r=>setTimeout(r,shanhe?550:2050));
 assert.equal(f.runtime.getSkills()[0].locked,true);assert.equal(f.runtime.getSkills()[0].remembered,false);
 assert.match(messages[0],/继续按住可记住/);
 await new Promise(r=>setTimeout(r,shanhe?2500:3000));
 assert.equal(f.runtime.getSkills()[0].remembered,true);f.item.event('mouseup');f.item.event('click');assert.equal(f.skillCalls,0);
});

test('only explicitly remembered skills restore after reload; obsolete global memory is ignored',t=>{
 const f=fixture(t,{skillLock:true,remember:true});
 f.saved.lockedSkillIds=[62];f.runtime.dispose();
 let runtime=createRuntime(f.ctx,()=>f.settings);assert.equal(runtime.getSkills()[0].locked,false);
 runtime.toggle(62,true);runtime.dispose();
 runtime=createRuntime(f.ctx,()=>f.settings);assert.equal(runtime.getSkills()[0].remembered,true);
 runtime.toggle(62);runtime.dispose();
 runtime=createRuntime(f.ctx,()=>f.settings);assert.equal(runtime.getSkills()[0].locked,false);runtime.dispose();
});

for (const id of [484,3876]) test(`强识 ${id} keeps reveal manual and confirms only draw after enabling`, async t => {
  const f=fixture(t,{skillLock:true,autoConfirm:true});
  f.item.Skill={SkillId:id,Name:'强识'}; f.item.activated=true; f.runtime.tick();
  f.self.cardContainer.selectCardContext={Skill:{SkillId:id},message:'是否发动强识，摸一张牌'};
  await flush(); assert.equal(f.calls,0); assert.equal(f.skillCalls,0);
  f.runtime.toggle(id);
  f.self.cardContainer.selectCardContext.message='请选择一名角色，对其发动强识';
  f.self.cardContainer.cardUis=[{selected:true,activated:true,setSelected(){throw new Error('must not select hand');}}];
  f.self.buttonBar.Show(); await flush(); assert.equal(f.calls,0); assert.equal(f.skillCalls,0);
  f.self.cardContainer.selectCardContext.message='请选择一张要展示的手牌';
  f.self.buttonBar.Show(); await flush(); assert.equal(f.calls,0);
  f.self.cardContainer.selectCardContext.message='是否发动<font>强识</font>，摸一张牌';
  f.self.buttonBar.Show(); await flush(); assert.equal(f.calls,1);
  f.runtime.tick(); await flush(); assert.equal(f.calls,1);
  f.self.buttonBar.Show(); await flush(); assert.equal(f.calls,2);
  let choices=[];
  Object.assign(f.self.spellSelector,{visible:true,spell:{SkillId:id},txtOptMsg:{_innerHTML:'是否摸一张牌'},btnList:[{_enabled:true,data:{sendData:0}},{_enabled:true,data:{sendData:1}}],btnClick(b){choices.push(b.data.sendData);}});
  f.self.spellSelector.Show(); await flush(); assert.deepEqual(choices,[1]);
  f.runtime.tick(); await flush(); assert.deepEqual(choices,[1]);
  f.self.spellSelector.txtOptMsg._innerHTML='请选择展示的手牌';
  f.self.spellSelector.Show(); await flush(); assert.deepEqual(choices,[1]);
  f.runtime.toggle(id); f.self.spellSelector.txtOptMsg._innerHTML='是否摸一张牌';
  f.self.spellSelector.Show(); await flush(); assert.deepEqual(choices,[1]);
});

 test('武娘 hidden hand window submits once and ignores unavailable cards',async t=>{
 const f=arm(t,3796);let sent=[],closed=0;
 const win={name:'SelectCardWindow',visible:true,Skill:{SkillId:3796,SelectCardCountWhenResponse:1,SelectCardComplete:ids=>sent.push(ids)},handCardUis:[{CanBeSelected:false,Card:{CardId:8}},{CanBeSelected:true,Card:{CardId:9}}],Close(){closed++;this.visible=false;},enterWindow(){this.visible=true;}};
 f.ctx.game.getScene()._children=[win];f.runtime.tick();await flush();assert.deepEqual(sent,[[9]]);assert.equal(closed,1);
 f.runtime.tick();await flush();assert.equal(sent.length,1);
 win.enterWindow();f.runtime.tick();await flush();assert.equal(sent.length,2);
 });
 test('武娘 current reset prompt works without card context',async t=>{
 const f=arm(t,3796);f.self.cardContainer.selectCardContext={};f.self.buttonBar.txtOptMsg={_innerHTML:'是否失去1点体力重置镇南'};
 f.self.buttonBar.Show();await flush();assert.equal(f.cancel,1);
 });
test('武娘 takes armour before other equipment, then hands; unavailable cards are excluded',async t=>{
 const f=arm(t,3796), sent=[];
 const ui=(id,type,extra={})=>({CanBeSelected:true,Card:{CardId:id,FirstSkill:{Type:type}},...extra});
 const hand=ui(1,0), weapon=ui(2,3), armour=ui(3,4);
 const win={name:'SelectCardWindow',visible:false,Skill:{ID:3796,SelectCardCountWhenResponse:1,SelectCardComplete:ids=>sent.push(ids)},handCardUis:[hand],equipCardUis:[],Close(){this.visible=false;},enterWindow(){this.visible=true;}};
 f.ctx.game.getScene()._children=[win];f.runtime.tick();
 for(const [equipment,want] of [ [[weapon,armour],3], [[weapon],2], [[],1], [[{...armour,CanBeSelected:false},weapon],2], [[{...armour,destroyed:true},{...weapon,visible:false}],1] ]){
  win.equipCardUis=equipment;win.enterWindow();f.runtime.tick();await flush();assert.deepEqual(sent.at(-1),[want]);
  const count=sent.length;f.runtime.tick();await flush();assert.equal(sent.length,count);
 }
 hand.CanBeSelected=false;win.equipCardUis=[];win.enterWindow();f.runtime.tick();await flush();assert.equal(sent.length,5);
});
