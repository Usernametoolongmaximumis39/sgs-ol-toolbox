import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const output = resolve('test-results/play-assist'); await mkdir(output, {recursive:true});
const bundle = await build({stdin:{contents:"export {createRuntime} from './src/plugins/play-assist/runtime.js';export {ResourceScope} from './src/core/resources.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'AssistNative'});
// Replay the shipped SkillItem onMouse method, with real Laya dispatchers.
const nativeSource = await readFile(resolve('test-results/reference/play-assist-skill-item.js'),'utf8');
const mouseMethod = nativeSource.slice(nativeSource.indexOf('onMouse(t){'),nativeSource.indexOf('set visible(t){'));
assert.ok(mouseMethod.startsWith('onMouse(t){') && mouseMethod.includes('eventDispatcher.event'));
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:800,height:500}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({path:process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate((mouseMethod)=>{
    Laya.init(800,500); Laya.stage.bgColor='#172322';
    window.scope=new AssistNative.ResourceScope();window.values=new Map();window.config={skillLock:true,remember:true};window.clicks=0;
    const self=new Laya.Sprite(); Laya.stage.addChild(self);
    const seat={Index:0,Hp:3,IsDead:false,HasSkill:()=>false};self.seat=seat;
    window.item=new Laya.Sprite();item.pos(330,220);item.size(110,36);item.graphics.drawRect(0,0,110,36,'#39352b','#887346',1);self.addChild(item);
    const name=new Laya.Text();name.text='苦肉';name.fontSize=17;name.color='#eee3cc';name.pos(35,8);item.addChild(name);
    item.Skill={SkillId:62,Name:'苦肉'};item.seat=seat;item.activated=false;item.visible=true;
    item.eventDispatcher=new Laya.EventDispatcher();
    item.onMouse=new Function('Laya','dO','return ({'+mouseMethod+'}).onMouse')(Laya,{up:0,over:1,down:2});
    item.setStateChanged=()=>{};item.enabled=true;item.selectedEnabled=true;
    for(const event of ['click','mousedown','mouseup','mouseout']) item.on(event,item,item.onMouse);
    item.on=(...args)=>item.eventDispatcher.on(...args);
    item.off=(...args)=>item.eventDispatcher.off(...args);
    item.onClick=()=>{};
    item.on('click',item,item.onClick);
    item.on('click',item,function(){window.clicks++;if(item.activated){item.Selected=true;self.cardContainer.selectCardContext={message:'是否发动苦肉'};self.getButtonBar().Show();}});
    window.confirmations=0;
    self.skillItems=[item];self.Ai={visible:true,btns:[{name:'btnOK',_enabled:true,onClick(){window.confirmations++;}}],Show(){},Update(){}};self.cardContainer={cardUis:[]};
    self.getButtonBar=function(){return this.Ai;};
    window.scene={SceneName:'RogueLikeGameScene',SelfSeatUi:self,seatContainer:{seatUIs:[]}};
    window.palette={accent:'#c8ab6a',bg:'#172322'};
    window.runtime=AssistNative.createRuntime({window,document,scope,settings:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)},game:{getScene:()=>scene,getSnapshot:()=>({inGame:true}),getClass:()=>null},ui:{nativeTheme:{palette,watch:fn=>{fn();return()=>{}}}},notify:()=>{}},()=>config);
    runtime.tick();
  },mouseMethod);
  await page.mouse.move(380,238);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.equal(await page.evaluate(()=>runtime.getSkills()[0].locked),true);
  assert.equal(await page.evaluate(()=>clicks),0,'long press suppresses native click');
  await page.screenshot({path:resolve(output,'native-long-press.png')});
  await page.mouse.click(380,238);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>runtime.getSkills()[0].locked),false);
  assert.equal(await page.evaluate(()=>clicks),0,'unlock does not cast skill');
  await page.mouse.click(380,238);assert.equal(await page.evaluate(()=>clicks),1);
  await page.evaluate(()=>{item.activated=true;runtime.toggle(62);runtime.tick();});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>clicks),2,'native automatic skill selection');
  assert.equal(await page.evaluate(()=>confirmations),1,'native selection followed by confirmation');
  // Native minimum size is 58 x 26. Add the upper sibling AFTER the lower
  // button, so the old y=-13 label is covered just as in stacked skill rows.
  await page.evaluate(()=>{
    const self=scene.SelfSeatUi;self.pos(60,80);self.scale(2,2);
    item.pos(140,100);item.size(58,26);item.activated=false;
    const name=item.getChildAt(0);name.fontSize=13;name.pos(24,6);
    window.layoutSkills=[item];
    function skill(id,text,x,y){
      const sprite=new Laya.Sprite();sprite.pos(x,y);sprite.size(58,26);
      sprite.Skill={SkillId:id,Name:text};sprite.seat=self.seat;sprite.activated=false;
      const label=new Laya.Text();label.text=text;label.font='Microsoft YaHei';label.fontSize=13;label.pos(24,6);sprite.addChild(label);
      self.addChild(sprite);layoutSkills.push(sprite);return sprite;
    }
    const upper=skill(769,'极奢',140,74),left=skill(101,'制衡',80,100);
    self.skillItems=[item,upper,left];runtime.tick();runtime.toggle(769);runtime.toggle(101);
    window.renderSkills=light=>{
      Laya.stage.bgColor=light?'#e6e2d8':'#172322';
      Object.assign(palette,light?{accent:'#876722',bg:'#f8f6f0'}:{accent:'#c8ab6a',bg:'#172322'});
      for(const sprite of layoutSkills){
        sprite.graphics.clear();sprite.graphics.drawRect(0,0,sprite.width,sprite.height,light?'#ece7dc':'#39352b',light?'#a89775':'#887346',1);
        sprite.getChildAt(0).color=light?'#302b23':'#eee3cc';
      }
      runtime.tick();
    };
    renderSkills(false);
  });
  async function checkBadges(){
    const badges=await page.evaluate(()=>layoutSkills.map(sprite=>{
      const badge=sprite.getChildByName('sgs-play-assist-lock');
      return {x:badge.x,y:badge.y,width:badge.width,height:badge.height,buttonWidth:sprite.width,buttonHeight:sprite.height,visible:badge.visible,mouseEnabled:badge.mouseEnabled,text:badge.text};
    }));
    for(const badge of badges){
      assert.equal(badge.visible,true);assert.equal(badge.text,'自\n动');assert.equal(badge.mouseEnabled,false);
      assert.ok(badge.x>=0&&badge.y>=0&&badge.x+badge.width<=badge.buttonWidth&&badge.y+badge.height<=badge.buttonHeight,'badge stays inside its own skill button');
      assert.ok(badge.x>=badge.buttonWidth-8,'badge stays in native label right padding');
    }
    return badges;
  }
  const compactBadges=await checkBadges();
  await page.waitForTimeout(60);await page.screenshot({path:resolve(output,'native-stacked-dark.png')});
  await page.evaluate(()=>renderSkills(true));
  await page.waitForTimeout(60);await page.screenshot({path:resolve(output,'native-stacked-light.png')});
  // Native layout can resize/reuse skill buttons after they have been bound.
  await page.evaluate(()=>{
    item.size(110,32);item.Skill={SkillId:726,Name:'长技能名称'};item.getChildAt(0).text='长技能名称';
    item.pos(180,115);runtime.tick();runtime.toggle(726);renderSkills(false);
  });
  await checkBadges();
  assert.equal(await page.evaluate(()=>Array.from({length:item.numChildren},(_,i)=>item.getChildAt(i)).filter(n=>n.name==='sgs-play-assist-lock').length),1,'skill reuse leaves one badge');
  await page.waitForTimeout(60);await page.screenshot({path:resolve(output,'native-resized-long-name.png')});
  await page.evaluate(()=>{config.skillLock=false;runtime.tick();});
  assert.equal(await page.evaluate(()=>layoutSkills.every(s=>!s.getChildByName('sgs-play-assist-lock').visible)),true,'disabled setting hides every badge');
  await page.evaluate(()=>{config.skillLock=true;runtime.tick();});
  await checkBadges();
  // Clicking directly on the badge must still reach the original skill button.
  const badgePoint=await page.evaluate(()=>{
    const badge=item.getChildByName('sgs-play-assist-lock');
    return item.localToGlobal(new Laya.Point(badge.x+badge.width/2,badge.y+badge.height/2));
  });
  await page.mouse.click(badgePoint.x,badgePoint.y);
  assert.equal(await page.evaluate(()=>runtime.getSkills().find(s=>s.id===726).locked),false,'badge does not intercept unlock click');
  const qianfuPoint=await page.evaluate(()=>{
    item.Skill={SkillId:3750,Name:'迁附'};item.getChildAt(0).text='迁附';runtime.tick();
    return item.localToGlobal(new Laya.Point(50,16));
  });
  await page.mouse.move(qianfuPoint.x,qianfuPoint.y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.equal(await page.evaluate(()=>runtime.getSkills().find(s=>s.id===3750).locked),true,'迁附 owns long-press auto lock');
  assert.equal(await page.evaluate(()=>runtime.getSkills().some(s=>s.id===3751)),false,'驭势 has no auto lock entry');
  await page.screenshot({path:resolve(output,'native-qianfu-lock.png')});
  await page.mouse.down({button:'right'});await page.waitForTimeout(650);await page.mouse.up({button:'right'});
  assert.equal(await page.evaluate(()=>runtime.getSkills().find(s=>s.id===3750).remembered),true,'real Sprite right hold saves existing temporary lock');
  assert.deepEqual(await page.evaluate(()=>values.get('rememberedSkillIds')),[3750]);
  await page.screenshot({path:resolve(output,'native-remembered.png')});
  await page.mouse.click(qianfuPoint.x,qianfuPoint.y);
  assert.equal(await page.evaluate(()=>runtime.getSkills().find(s=>s.id===3750).locked),false);
  assert.deepEqual(await page.evaluate(()=>values.get('rememberedSkillIds')),[],'left click cancels saved lock');

  await page.evaluate(()=>{
    item.Skill={SkillId:3184,Name:'权道'};
    Object.defineProperty(item,'label',{configurable:true,get:()=>item.getChildAt(0).text,set:v=>{item.getChildAt(0).text=v;}});
    item.label='权道';config.quandaoCount=true;
    scene.SelfSeatUi.seat.HandCards=[...Array.from({length:3},()=>({FirstSkillId:1,FirstSkill:{}})),...Array.from({length:5},()=>({FirstSkillId:8,FirstSkill:{IsJinNang:true,IsJudgeSkill:false}})),{FirstSkillId:11,FirstSkill:{IsJinNang:true,IsJudgeSkill:true}}];
    runtime.tick();
  });
  assert.equal(await page.evaluate(()=>item.label),'3/5');
  await page.screenshot({path:resolve(output,'native-quandao-count.png')});
  await page.evaluate(()=>{config.quandaoCount=false;runtime.tick();});
  assert.equal(await page.evaluate(()=>item.label),'权道');
  await page.evaluate(()=>{runtime.dispose();scope.dispose();});
  assert.equal(await page.evaluate(()=>layoutSkills.every(s=>s.getChildByName('sgs-play-assist-lock')===null)),true);
  await page.mouse.click(450,330);assert.equal(await page.evaluate(()=>clicks),3,'original handler restored');

  const wuxieChecks = await page.evaluate(async () => {
    const scope = new AssistNative.ResourceScope(), proxy = new Laya.EventDispatcher();
    const self = new Laya.Sprite(), bar = new Laya.Sprite(), cancel = new Laya.Sprite();
    Laya.stage.addChild(self); self.addChild(bar); bar.addChild(cancel);
    self.seat = {Index:0}; self.Ai = bar;
    self.cardContainer = {cardUis:[], selectCardContext:{SpecifySkillId:13}};
    cancel.name = 'btnCancel'; cancel._enabled = true;
    bar.btns = [cancel]; bar.Show = () => { bar.visible = true; }; bar.Update = () => {};
    let cancellations = 0;
    cancel.on('click', bar, () => { cancellations++; bar.visible = false; });
    bar.Button_Click = btn => btn.event('click');
    let scene = {SceneName:'RogueLikeGameScene', SelfSeatUi:self};
    const assist = AssistNative.createRuntime({window, document, scope, ui:{}, settings:{get:(_key, fallback)=>fallback},
      game:{getScene:()=>scene, getSnapshot:()=>({inGame:true}), getClass:()=>null, getServerProxy:()=>proxy}}, () => ({skipWuxie:true}));
    const phase = (seat, round) => proxy.event('GsCGamephaseNtf', {Protocol:{SeatID:seat, Round:round}});
    async function inquiry(count) {
      bar.Show();
      proxy.event('GsCTriggerSpellNew', {Protocol:{TriggerSeatId:255, SrcSpellID:8, SrcSpellCasterSeat:0,
        TriggerSpellData:[{SpellId:13, SeatId:0, Datas:[count]}]}});
      await new Promise(resolve => setTimeout(resolve, 30));
      return {cancellations, visible:bar.visible};
    }
    try {
      phase(0, 2);
      const first = await inquiry(0), counter = await inquiry(1);
      phase(1, 4);
      const opponent = await inquiry(0);
      scene = {SceneName:'GameScene', SelfSeatUi:self};
      assist.tick();
      phase(0, 4);
      const ordinary = await inquiry(0);
      return {first, counter, opponent, ordinary};
    } finally { scope.dispose(); self.destroy(true); }
  });
  assert.deepEqual(wuxieChecks, {
    first:{cancellations:1, visible:false}, counter:{cancellations:1, visible:true}, opponent:{cancellations:1, visible:true},
    ordinary:{cancellations:1, visible:true},
  });
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'native-report.json'),JSON.stringify({checks:['long press / release suppression / unlock / native confirmation','58x26 stacked rows / adjacent skills / multiple locks','badge inside button / dark and light themes','resize / skill reuse / setting toggle','badge click passes through / cleanup restores handler','迁附 native long press owns lock / 驭势 absent','山河图 initial Wuxie cancels via Ai; counters, opponent turns and ordinary battles stay manual'],compactBadges,wuxieChecks,errors},null,2));
  console.log('PASS Laya long press / stacked badges / resize / unlock / cleanup / 山河图无懈');
}finally{await browser.close();}
