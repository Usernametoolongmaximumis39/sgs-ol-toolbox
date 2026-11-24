import { createNative } from '../src/plugins/gaizhu/native.js';
import { createPluginNative } from '../src/core/plugin-native.js';
import { createSpecialWindows } from '../src/plugins/gaizhu/special-windows.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant } from '../src/plugins/gaizhu/assistant.js';
import { createBattleGuards, projectBattleGuard } from '../src/plugins/gaizhu/battle-guards.js';

function fixture(skill = 13, extra = {}) {
  const calls = [], context = { SpecifySkillId: skill, Skill: { SkillId: skill }, ...extra };
  const card = id => ({ Card: { CardId: id, FirstSkillId: id }, activated: true, setSelected(v) { this.selected = v; calls.push(['select', id, v]); }, CardUI_Click() { this.setSelected(true); } });
  const cards = [card(13), card(2)];
  const self = { seat: { Index: 0, InOwnRound: true, IsAiControl: false }, cardContainer: { cardUis: cards, activatedCardtems: cards, selectCardContext: context,
    AllSelectHandCards() { throw Error('protected inquiry must never reach generic all-select'); } },
    Pt: { btns: [{ name: 'btnOK', enabled: true }, { name: 'btnCancel', enabled: true }], Button_Click(b) { calls.push(b.name); b.enabled = false; } } };
  return { calls, self, cards, context, card, frame: { self, scene: {}, nodes: [] } };
}
const trigger = (source, target, count, spell = 8, single = true) => ({ trigger: 13, source, targets: [target], count, spell, single });

test('guards: a valid official Wuxie hint selects and confirms with or without an existing selection', () => {
  for (const select of [false, true]) {
    const f = fixture(), a = createAssistant(); f.cards[0].selected = select;
    f.self.onTrusteeshipClick = () => assert.fail('trusteeship during Wuxie');
    f.self.CurStepHelpData = { cardIds: [13], buttonName: 'btnOK' };
    a.run(f.frame, 0);
    if (!select) a.run(f.frame, 250);
    a.run(f.frame, 1500);
    assert.deepEqual(f.calls, select ? ['btnOK'] : [['select', 13, true], 'btnOK']);
    assert.equal(f.self.seat.IsAiControl, false);
  }
});
test('guards: all three native nullification skill locations are protected, missing cancel waits', () => {
  for (const location of ['specified', 'skill', 'selector']) {
    const f = fixture(location === 'specified' ? 13 : 0), g = createBattleGuards();
    if (location === 'skill') f.context.Skill.SkillId = 13;
    if (location === 'selector') f.self.spellSelector = { spell: { SkillId: 13 }, btnList: [{ data: { sendData: 255 }, enabled: true }], btnClick() { f.calls.push('selector-cancel'); } };
    assert.equal(g.run(f.frame).acted, true); assert.ok(f.calls[0].includes('cancel') || f.calls[0] === 'btnCancel');
    if (f.self.spellSelector) f.self.spellSelector.btnList[0].enabled = false; f.self.Pt.btns[1].enabled = false;
    assert.equal(g.run(f.frame).acted, false);
  }
});
test('guards: old Wuxie parity protects own original trick, preserves defense and restoring own trick', () => {
  const cases = [
    [trigger(0, 1, 0), false], [trigger(0, 1, 2), false], [trigger(0, 1, 1), true],
    [trigger(1, 0, 0), true], [trigger(1, 0, 1), false], [trigger(1, 2, 0), false],
    [trigger(255, 0, 0, 15, false), true], [trigger(1, 0, 0, 84, false), true],
    [trigger(1, 0, 0, 4, false), true], [trigger(1, 2, 0, 4, false), false],
    [trigger(1, 0, 0, 8, false), false], [trigger(0, NaN, 1), false],
  ];
  for (const [data, allowed] of cases) {
    const f = fixture(), g = createBattleGuards(); g.observe('GsCTriggerSpellNew', data);
    assert.equal(Boolean(g.run(f.frame).playWuxie), allowed, JSON.stringify(data));
  }
});
test('guards: unknown Wuxie context cancels without official guidance', () => {
  const f = fixture(), g = createBattleGuards();
  assert.equal(g.run(f.frame).acted, true);
  assert.equal(g.run(f.frame, { official: true }).officialOnly, true);
  g.observe('GsCTriggerSpellNew', trigger(1, 0, 0)); g.observe('GsCGamephaseNtf', {});
  f.self.Pt.btns[1].enabled = true;
  assert.equal(g.run(f.frame).acted, true);
});

test('guards: an unusable Wuxie hint gives way to protected cancellation', () => {
  const f = fixture(), assistant = createAssistant();
  f.self.CurStepHelpData = { cardIds: [99], buttonName: 'btnOK' };
  assistant.run(f.frame, 0);
  assistant.run(f.frame, 999);
  assert.deepEqual(f.calls, []);
  assistant.run(f.frame, 1000);
  assert.deepEqual(f.calls, ['btnCancel']);
});

test('guards: local defense uses a physical Wuxie on self-targeted Snatch and Indulgence', () => {
  for (const spell of [4, 15]) {
    const f = fixture(), a = createAssistant();
    f.self.cardContainer.activatedCardtems.reverse();
    a.observe('GsCTriggerSpellNew', trigger(1, 0, 0, spell, false));
    for (const now of [0, 1000, 2000]) a.run(f.frame, now);
    assert.deepEqual(f.calls, [['select', 13, true], 'btnOK']);
  }
});
test('guards: packet projection copies only bounded relevant fields, then native packet reuse cannot change them', () => {
  const p = { Protocol: { SrcSpellID: 8, SrcSpell: { TargetCountMax: 1 }, FirstTriggerParam: { SpellId: 13, SeatId: 0, Targets: [1], Datas: [0] } } };
  const d = projectBattleGuard(p); p.Protocol.FirstTriggerParam.Targets[0] = 2; p.Protocol.FirstTriggerParam.Datas[0] = 3;
  assert.deepEqual(d.targets, [1]); assert.equal(d.count, 0); assert.equal(d.single, true);
  assert.equal(projectBattleGuard({ CardIDs: Array(129).fill(1) }).cards.length, 0);
  const incomplete = projectBattleGuard({ FirstTriggerParam: { SpellId: 13, SeatId: null, Targets: [null], Datas: [null] } });
  assert.ok([incomplete.source, incomplete.targets[0], incomplete.count].every(Number.isNaN));
});

test('Ice Sword keeps damage unless a confirmed unboosted normal Slash can strip key armor and the last card', () => {
  for (const [boost, hp, hand, armor, observed, expected] of [
    [0, 4, 1, 16, true, 'btnOK'],
    [1, 4, 1, 16, true, 'btnCancel'],
    [0, 1, 1, 16, true, 'btnCancel'],
    [0, 2, 1, 16, true, 'btnCancel'],
    [0, 4, 0, 16, true, 'btnCancel'],
    [0, 4, 2, 16, true, 'btnCancel'],
    [0, 4, 1, 89, true, 'btnCancel'],
    [0, 4, 1, 16, false, 'btnCancel'],
  ]) {
    const f = fixture(0), guards = createBattleGuards();
    f.self.seat.LastAskSkill = { ID: 201 };
    f.frame.scene.seatContainer = { seatUIs: [{ Seat: {
      Index: 2, Hp: hp, HandCardCount: hand, EquipCardCount: 1, EquipCards: [{ FirstSkillId: armor }],
    } }] };
    guards.recordPlay(0, 1, boost, [2]);
    if (observed) guards.observe('GsCTriggerSpellNew', projectBattleGuard({ Protocol: {
      SrcSpellID: 1, SrcSpellCasterSeat: 0, FirstTriggerParam: { SpellId: 201, SeatId: 0, Targets: [2] },
    } }));
    assert.equal(guards.run(f.frame, { official: true }).acted, true);
    assert.deepEqual(f.calls, [expected]);
  }
});

test('Ice Sword declines both the assistant hint and the local default, including a mixed native trigger menu', () => {
  for (const hinted of [false, true]) {
    const f = fixture(0);
    f.self.Pt.txtOptMsg = { _innerHTML: '是否发动<font color="gold">寒冰剑</font>' };
    if (hinted) f.self.CurStepHelpData = { target: f.self.Pt.btns[0] };
    const a = createAssistant();
    a.run(f.frame, 0);
    a.run(f.frame, 2000);
    assert.deepEqual(f.calls, ['btnCancel']);
  }

  const f = fixture(0), a = createAssistant();
  const ice = { enabled: true, data: { callBackParams: [{ FirstTriggerParam: { SpellId: 201 } }] } };
  const other = { enabled: true, data: { label: '其他技能' } };
  f.self.spellSelector = { btnList: [ice, other], btnClick(button) {
    f.calls.push(button);
    this.visible = false;
    f.self.Pt.visible = false;
  } };
  f.self.CurStepHelpData = { target: ice };
  a.run(f.frame, 0);
  a.run(f.frame, 1000);
  assert.deepEqual(f.calls, [other]);
});

test('guards: forced discard selects exact count and preserves Peach/Shan/Wuxie before unlisted cards', () => {
  const f = fixture(0, { message: '需要弃置 2 张卡牌', SelectCountMax: 2 }), g = createBattleGuards();
  f.self.cardContainer.cardUis = [3,2,13,82,1,99,100].map(f.card);
  f.self.cardContainer.activatedCardtems = f.self.cardContainer.cardUis;
  assert.equal(g.run(f.frame).acted, true);
  assert.deepEqual(f.self.cardContainer.cardUis.filter(c => c.selected).map(c => c.Card.CardId), [99,100]);
  assert.equal(f.calls.at(-1), 'btnOK'); g.run(f.frame); assert.equal(f.calls.filter(c => c === 'btnOK').length, 1);
});
test('guards: insufficient legal discard and disabled confirmation never send a partial choice', () => {
  const f = fixture(0, { message: '需要弃置 3 张卡牌', SelectCountMax: 3 }), g = createBattleGuards();
  assert.equal(g.run(f.frame).acted, false); assert.deepEqual(f.calls, []);
});
test('guards: one-card skill chooses exactly one equipment before hand cards and never selects all', () => {
  const f = fixture(3572, { SelectCountMin: 1, SelectCountMax: 1 }), equip = f.card(99), g = createBattleGuards();
  f.self.cardContainer.equipCardUis = [equip]; f.cards.forEach(c => { c.selected = true; });
  g.run(f.frame);
  assert.equal(equip.selected, true); assert.ok(f.cards.every(c => !c.selected)); assert.equal(f.calls.at(-1), 'btnOK');
});
test('guards: virtual-card branch chooses only native virtual Sha and waits if unavailable', () => {
  const f = fixture(3824), g = createBattleGuards(), sha = f.card(7), other = f.card(8);
  sha.Card.IsVirtualCard = true; other.selected = true;
  f.self.cardContainer.IsShowedVirtual = true; f.self.cardContainer.virtualCardUis = [other, sha];
  g.run(f.frame); assert.equal(sha.selected, true); assert.equal(other.selected, false); assert.equal(f.calls.at(-1), 'btnOK');
});
test('guards: judgement color follows captured cards and new effect resets the choice', () => {
  const f = fixture(0), picked = [], g = createBattleGuards({ getCardMeta: id => ({ suit: id }) });
  f.self.spellSelector = { spell: { SkillId: 3571 }, btnList: [1,2].map(n => ({ enabled: true, data: { callBackParams: [n] } })), btnClick(b) { picked.push(b.data.callBackParams[0]); } };
  g.observe('PubGsCMoveCard', { skill:3571, from:3, to:8, move:6, owner:0, cardCount:3, cards:[1,3,4] });
  g.run(f.frame); g.run(f.frame); assert.deepEqual(picked,[2]);
  g.observe('PubGsCUseSpell',{skill:3571,effect:1,seat:0}); g.run(f.frame); assert.deepEqual(picked,[2,1]);
});
test('guards: Jinlan uses official option index and exact native handler args once', () => {
  const f = fixture(0), g = createBattleGuards(), picked = [], opts = [0,1].map(n => ({name:'JinLan2025Option_'+n}));
  const win = { name:'JinLan2025Window', contentSprite:{_children:opts}, onOptionMouseDown(data,option) { picked.push([data,option]); this.isPlayingSelectClose=true; } };
  opts[1]._events={mousedown:{caller:win,method:win.onOptionMouseDown,args:['native-data']}};
  f.self.CurStepHelpData={optionIndex:1}; f.frame.nodes=[win];g.run(f.frame);g.run(f.frame);
  assert.deepEqual(picked,[['native-data',opts[1]]]);
});
test('guards: the assistant waits for native trusteeship to turn off before handling a prompt', () => {
  const f = fixture(13), a = createAssistant();
  f.self.seat.IsAiControl = true;
  f.self.onTrusteeshipClick = () => assert.fail('the run controller owns the switch');
  f.self.CurStepHelpData = { cardIds: [13], buttonName: 'btnOK' };
  for (const now of [0, 1000, 4000]) assert.equal(a.run(f.frame, now), false);
  assert.deepEqual(f.calls, []);
  f.self.seat.IsAiControl = false;
  a.run(f.frame, 4250);
  a.run(f.frame, 4500);
  assert.deepEqual(f.calls, [['select', 13, true], 'btnOK']);
});


test('special windows: country choice requires self ownership, ignores disabled options and sends once', () => {
  const calls=[], g=createSpecialWindows({random:()=>0}), win={name:'SelectCountryNoBgWindow',selfSeat:{IsSelf:false},btnList:[{enabled:false},{enabled:true}],spellClicked(b){calls.push(b);}};
  const frame={self:{},nodes:[win]}; assert.equal(g.run(frame),null);
  win.selfSeat.IsSelf=true;g.run(frame);g.run(frame);assert.deepEqual(calls,[win.btnList[1]]);
});
test('special windows: TianShu sends once per native stage and supports another stage', () => {
  const calls=[],g=createSpecialWindows(),win={name:'TianShuWindow',seat:{IsSelf:true},type:1,selectIds:[0,7],selectItems:[{IsEmpty:true},{}],onClick(i){calls.push(i);}};
  const frame={self:{},nodes:[win]};g.run(frame);g.run(frame);win.type=2;g.run(frame);assert.deepEqual(calls,[1,1]);
});
test('special windows: HuaShen never operates another seat or display-only card list', () => {
  const calls=[],g=createSpecialWindows(),win={name:'HuaShenCardWindow',seatID:0,args:[{Time:5,SeatID:0}],generalList:[{}],skillBtns:[{enabled:true}],onCardClick(){calls.push('general');},onSkillClick(){calls.push('skill');}};
  const frame={self:{seat:{IsSelf:true,Index:1}},nodes:[win]};assert.equal(g.run(frame),null);
  frame.self.seat.Index=0;win.isOnlyShow=true;assert.equal(g.run(frame),null);
  win.isOnlyShow=false;g.run(frame);g.run(frame);assert.deepEqual(calls,['general','skill']);
});
test('special windows: ZhouXi validates known skill IDs and keeps actual native argument identity', () => {
  const calls=[],g=createSpecialWindows({getSkill:id=>id===7?{}:null,random:()=>0}),skill={};
  const win={name:'ZhouXiSkillWindow',Skill:skill,args:[{Skill:skill,Params:[-1,999,7]}],onClickSkill(id){calls.push(id);}};
  const frame={self:{},nodes:[win]};g.run(frame);g.run(frame);assert.deepEqual(calls,[7]);
});
test('special windows: MultipleChoice verifies selected list and enabled confirmation, no repeated submit', () => {
  const calls=[],g=createSpecialWindows({random:()=>0}),win={name:'MultipleChoiceWindow',seat:{IsSelf:true},btnDatas:[1,2],maxSelectNum:2,selectPreNum:1,canSelectAll:false,selectBtnList:[],confirm_btn:{enabled:true},confirmBtmClick(){calls.push('confirm');}};
  win.btnList=[0,1].map(n=>({enabled:true,onClick(){this.selected=!this.selected;win.selectBtnList=this.selected?[this]:[];calls.push(n);}}));
  const frame={self:{},nodes:[win]};g.run(frame);g.run(frame);assert.deepEqual(calls,[0,'confirm']);
});
test('guards: Fire Attack handles only native fire-attack response and never invokes all-select', () => {
  const f=fixture(0,{message:'请选择一张卡牌用于展示'}),g=createBattleGuards();f.self.seat.LastAttackByTheSkill={ID:83};
  g.run(f.frame);g.run(f.frame);assert.equal(f.calls.filter(c=>c==='btnOK').length,1);
  const unrelated=fixture(0,{message:'普通询问'});unrelated.self.seat.LastAttackByTheSkill={ID:83};assert.equal(g.run(unrelated.frame),null);
});


test('guards: detached cached special windows are excluded by native frame display membership', () => {
  const cached={name:'JinLan2025Window',visible:true,contentSprite:{_children:[]}},scene={name:'GameScene',SelfSeatUi:{},_children:[]};
  const wm={WindowInstanceDict:new Map([['JinLan2025Window',cached]])};
  const ctx={game:{getScene:()=>scene,getClass:name=>name==='WindowManager'?wm:null},window:{Laya:{stage:{_children:[scene]}}}};
  ctx.native=createPluginNative(ctx);
  const native=createNative(ctx);
  assert.ok(!native.frame().nodes.includes(cached));
});


test('guards: a late official Cancel during local Wuxie defense never becomes generic card confirmation', () => {
  const f=fixture(),a=createAssistant();
  a.observe('GsCTriggerSpellNew',trigger(1,0,0));
  f.self.cardContainer.AllSelectHandCards=()=>{};
  a.run(f.frame,0);a.run(f.frame,1000);
  f.calls.length=0;f.self.Pt.btns.forEach(b=>b.enabled=true);
  f.self.CurStepHelpData={buttonName:'btnCancel'};a.run(f.frame,2000);
  assert.deepEqual(f.calls,['btnCancel']);
});


test('guards: explicit native operation prohibition prevents cancellation and all local/AI actions', () => {
  const f=fixture(),a=createAssistant({canOperate:()=>false});
  f.self.CurStepHelpData={buttonName:'btnOK'};
  for(const now of [0,1000,8000]) a.run(f.frame,now);
  assert.deepEqual(f.calls,[]);assert.equal(a.reason(),'等待游戏允许操作');
});
