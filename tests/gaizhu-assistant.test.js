import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant } from '../src/plugins/gaizhu/assistant.js';

test('assistant waits without inventing a play, throttles requests and follows card/seat/confirm steps', () => {
  const calls = [], assistant = createAssistant();
  const seat = { seat: { index: 0 }, activated: false, seatClickHandler() { this.seat.Selected = true; calls.push('seat'); } };
  const card = { Card: { CardId: 7 }, activated: true, CardUI_Click() { this.selected = true; seat.activated = true; calls.push('card'); } };
  const self = { cardContainer: { cardUis: [card] }, Pt: { btns: [{ name: 'btnOK', onClick() { calls.push('confirm'); } }] } };
  const frame = { self, scene: { requestAiHelp() { calls.push('request'); }, seatContainer: { seatUIs: [seat] } } };
  assistant.run(frame, 0); assistant.run(frame, 250); assistant.run(frame, 1500);
  assert.deepEqual(calls, ['request', 'request']);
  self.CurStepHelpData = { cardIds: [7], seatIds: [0] };
  assistant.run(frame, 1750); assistant.run(frame, 2000); assistant.run(frame, 2250); assistant.run(frame, 2500);
  assert.deepEqual(calls, ['request', 'request', 'card', 'seat', 'confirm']);
  self.CurStepHelpData = { cardIds: [999], buttonName: 'btnOK' };
  assistant.run(frame, 3000); assert.equal(calls.length, 5);
});

test('assistant respects disabled hints and selects only the hinted selector option', () => {
  const calls = [], assistant = createAssistant(), button = { name: 'opt', enabled: false };
  const self = { spellSelector: { btnList: [button], btnClick(b) { calls.push(b); } }, CurStepHelpData: { optionIndex: 0 } };
  const frame = { self, scene: {} };
  assistant.run(frame, 0); assert.equal(calls.length, 0);
  button.enabled = true; assistant.run(frame, 250); assistant.run(frame, 500);
  assert.deepEqual(calls, [button]);
});

test('assistant follows the equipped Wooden Ox hint before selecting its hand-card cost', () => {
  const calls = [], assistant = createAssistant();
  const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
  const protocol = { _className_: 'GsCUseSpell', SpellID: 700, CardIDs: [42] };
  const cost = { Card: { CardId: 42 }, Activated: false, CardUI_Click() {
    this.Selected = true; ok.enabled = true; calls.push('cost');
  } };
  const ox = { Card: { CardId: 70, FirstSkillId: 700, Equipped: true }, Activated: true, CardUI_Click() {
    this.Selected = true; cost.Activated = true; calls.push('ox');
    self.CurStepHelpData = { protocol, cardIds: [42], cardUis: [cost], target: cost };
  } };
  const self = {
    skillItems: [], cardContainer: { cardUis: [cost], equipCardUis: [ox] }, Pt: { btns: [ok] },
    CurStepHelpData: { protocol, skillId: 700, target: ox, cardUis: [ox] },
  };
  const frame = { self, scene: {} };
  assistant.run(frame, 0); assistant.run(frame, 250); assistant.run(frame, 500); assistant.run(frame, 750);
  assert.deepEqual(calls, ['ox', 'cost', 'confirm']);
});

test('local fallback selects a hand card even when the Wooden Ox equipment is already selected', () => {
  const calls = [], assistant = createAssistant();
  const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
  const ox = { Card: { FirstSkillId: 700, Equipped: true }, Selected: true, Activated: true };
  const cost = { Card: { CardId: 42 }, Activated: true, setSelected(value) {
    this.Selected = value; ok.enabled = value; calls.push('cost');
  } };
  const frame = { self: { cardContainer: {
    selectCardContext: { Skill: { ID: 700 }, SelectCountMin: 1, SelectCountMax: 1 },
    equipCardUis: [ox], activatedSkillEquip: ox, cardUis: [cost], activatedCardtems: [ox, cost],
  }, Pt: { btns: [ok] } }, scene: {} };
  assistant.run(frame, 0); assistant.run(frame, 1000);
  assert.deepEqual(calls, ['cost', 'confirm']);
});

test('local fallback skips the optional Wooden Ox transfer or resolves its legal target', () => {
  for (const canCancel of [true, false]) {
    const calls = [], assistant = createAssistant();
    const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
    const cancel = { name: 'btnCancel', enabled: canCancel, onClick() { calls.push('cancel'); } };
    const target = { Activated: true, seatClickHandler() { calls.push('target'); ok.enabled = true; } };
    const frame = { self: { cardContainer: { selectCardContext: { Skill: { ID: 700 }, SelectCountMin: 0, SelectCountMax: 0 } },
      Pt: { btns: [ok, cancel] } }, scene: { seatContainer: { seatUIs: [target] } } };
    assistant.run(frame, 0); assistant.run(frame, 1000);
    assert.deepEqual(calls, canCancel ? ['cancel'] : ['target', 'confirm']);
  }
});

test('assistant can play a legally available card stored in the Wooden Ox with or without a hint', () => {
  for (const official of [true, false]) {
    const calls = [], assistant = createAssistant();
    const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
    const blocked = { Card: { CardId: 41 }, Activated: false, setSelected() { assert.fail('illegal stored card'); } };
    const stored = { Card: { CardId: 42 }, Activated: true, CardUI_Click() { this.setSelected(true); },
      setSelected(value) { this.Selected = value; ok.enabled = value; calls.push('stored'); } };
    const self = { cardContainer: { cardUis: [], muniuCardUis: [blocked, stored] }, Pt: { btns: [ok] } };
    if (official) self.CurStepHelpData = { cardIds: [42] };
    const frame = { self, scene: {} };
    assistant.run(frame, 0); assistant.run(frame, 1000);
    assert.deepEqual(calls, ['stored', 'confirm']);
  }
});

test('training fallback prefers the native Iron Chain recast, even with a target already selected', () => {
  for (const { skillId = 85, prefer = true, recastEnabled = true, alreadySelected = true, hint, expected } of [
    { expected: ['btnReset'] },
    { alreadySelected: false, expected: ['select-card', 'btnReset'] },
    { recastEnabled: false, expected: ['btnOK'] },
    { skillId: 4, expected: ['btnOK'] },
    { prefer: false, expected: ['btnOK'] },
    { hint: { buttonName: 'btnOK' }, expected: ['btnOK'] },
  ]) {
    const actions = [], assistant = createAssistant();
    const ok = { name: 'btnOK', enabled: true };
    const recast = { name: 'btnReset', enabled: recastEnabled };
    const bar = { btns: [ok, recast], Button_Click(button) { actions.push(button.name); } };
    const selector = { FirstSelectedCard: null };
    const card = { Activated: true, Selected: alreadySelected, Card: { FirstSkillId: skillId }, setSelected(value) {
      this.Selected = value;
      selector.FirstSelectedCard = this.Card;
      self.Pt = bar;
      actions.push('select-card');
    } };
    if (alreadySelected) selector.FirstSelectedCard = card.Card;
    const self = { cardContainer: { SelectContext: { CardSelector: selector }, cardUis: [card] },
      Pt: alreadySelected ? bar : { btns: [] }, CurStepHelpData: hint };
    const ownSeat = { Seat: { Index: 0, Selected: true }, Activated: true,
      seatClickHandler() { assert.fail('recast needs no change to the selected target'); } };
    const frame = { self, scene: { seatContainer: { seatUIs: [ownSeat] } } };
    const options = { preferIronChainRecast: prefer };
    assistant.run(frame, 0, options);
    assistant.run(frame, 1000, options);
    assert.deepEqual(actions, expected);
  }
});

test('a native card click that never advances the hint gives way to the local fallback', () => {
  const calls = [], assistant = createAssistant();
  const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); this.enabled = false; } };
  const card = { Card: { CardId: 8 }, activated: true, CardUI_Click() { calls.push('hint'); },
    setSelected(value) { this.selected = value; ok.enabled = value; calls.push('fallback'); } };
  const frame = { self: { cardContainer: { activatedCardtems: [card] }, CurStepHelpData: { cardIds: [8] },
    Pt: { btns: [ok] } }, scene: {} };
  assistant.run(frame, 0); assistant.run(frame, 500); assistant.run(frame, 1000);
  assert.deepEqual(calls, ['hint', 'hint', 'hint', 'fallback', 'confirm']);
});

test('local fallback completes a partial multi-card selection using the current native availability', () => {
  const calls = [], assistant = createAssistant();
  const confirm = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
  const selected = { Activated: true, Selected: true };
  const illegal = { Activated: false, setSelected() { assert.fail('card is unavailable'); } };
  const onlyAfterSecond = { Activated: false, setSelected(value) {
    this.Selected = value; selector.SelectedCount++; confirm.enabled = true; calls.push('third');
  } };
  const next = { Activated: true, setSelected(value) {
    this.Selected = value; selector.SelectedCount++; onlyAfterSecond.Activated = true; calls.push('second');
  } };
  const selector = { SelectCountMin: 3, SelectCountMax: 4, SelectedCount: 1 };
  const frame = { self: { cardContainer: { SelectContext: { CardSelector: selector },
    activatedCardtems: [selected, illegal, next, onlyAfterSecond] }, Pt: { btns: [
    confirm, { name: 'btnCancel', enabled: true, onClick() { assert.fail('selection could be completed'); } },
  ] } }, scene: {} };
  assistant.run(frame, 0); assistant.run(frame, 1000);
  assert.deepEqual(calls, ['second', 'third', 'confirm']);
});

test('assistant popup never chooses arbitrary available cards or confirms manual choices', () => {
  const calls = [], assistant = createAssistant(), card = { CanBeSelected: true };
  const win = { name: 'SelectCardWindow', handCardUis: [card], selectCardUis: [], Skill: { SelectCardCountWhenResponse: 1 },
    onTouchCard({ target }) { this.selectCardUis = [target]; target.selected = true; calls.push('card'); }, confirmClick() { calls.push('confirm'); } };
  const frame = { self: {}, scene: {}, nodes: [win] };
  assistant.run(frame, 0); assert.deepEqual(calls, []);
  win.selectCardUis = [card]; assistant.run(frame, 250); assert.deepEqual(calls, []);
  win.selectCardUis = []; win.aiEffectCards = [card]; assistant.run(frame, 500); assistant.run(frame, 750);
  assert.deepEqual(calls, ['card', 'confirm']);
});

test('a card popup waits for the native confirm button, accepts its minimum, and can be reused', () => {
  const calls = [], assistant = createAssistant();
  const button = { enabled: false };
  const win = { name: 'SelectCardWindow', Skill: { SelectCardCountWhenResponse: 3, SelectCardCountMinResponse: 1 },
    confirm_btn: button, confirmClick() { calls.push('confirm'); } };
  const underlying = { name: 'btnCancel', enabled: true, onClick() { assert.fail('popup owns the current inquiry'); } };
  const frame = { self: { Pt: { btns: [underlying] } }, scene: {}, nodes: [win] };
  win.selectCardUis = [{ Selected: true }];
  assistant.run(frame, 0); assistant.run(frame, 1000); assistant.run(frame, 3000);
  assert.deepEqual(calls, []);
  button.enabled = true;
  assistant.run(frame, 4000); assistant.run(frame, 5000);
  assert.deepEqual(calls, ['confirm']);
  win.selectCardUis = [{ Selected: true }];
  assistant.run(frame, 6000); assistant.run(frame, 7000);
  assert.deepEqual(calls, ['confirm', 'confirm']);
});


test('legacy fallback: Yingyuan waits one second then dispatches usable Cancel through native Pt', () => {
  const calls = [], assistant = createAssistant(), context = { message: '是否发动应援，选择一名角色，使其获得一张锦囊牌或取消' };
  const ok = { name: 'btnOK', _enabled: false }, cancel = { name: 'btnCancel', _enabled: true };
  const frame = { self: { seat: { InOwnRound: false }, cardContainer: { selectCardContext: context },
    Pt: { btns: [ok, cancel], Button_Click(b) { calls.push(b.name); b._enabled = false; } } }, scene: { requestAiHelp() {} } };
  assistant.run(frame, 0); assistant.run(frame, 999); assert.deepEqual(calls, []);
  assistant.run(frame, 1000); assistant.run(frame, 1250);
  assert.deepEqual(calls, ['btnCancel']);
});

test('legacy fallback: on-time AI wins and changed prompt restarts waiting', () => {
  const calls = [], assistant = createAssistant(), cancel = { name: 'btnCancel', enabled: true, onClick() { calls.push('cancel'); } };
  const frame = { self: { cardContainer: { selectCardContext: {} }, Pt: { btns: [cancel] } }, scene: {} };
  assistant.run(frame, 0);
  frame.self.CurStepHelpData = { buttonName: 'btnCancel' }; assistant.run(frame, 900);
  assert.deepEqual(calls, ['cancel']); assert.equal(assistant.mode(), 'ai');
  frame.self.CurStepHelpData = null; frame.self.cardContainer.selectCardContext = {};
  assistant.run(frame, 1000); assistant.run(frame, 1999); assert.equal(calls.length, 1);
  assistant.run(frame, 2000); assert.equal(calls.length, 2);
});

test('repeated unusable assistant hints do not postpone the current inquiry fallback', () => {
  const calls = [], assistant = createAssistant();
  const cancel = { name: 'btnCancel', enabled: true, onClick() { calls.push('cancel'); } };
  const frame = { self: { cardContainer: { selectCardContext: {} }, Pt: { btns: [cancel] } }, scene: {} };
  for (const now of [0, 250, 500, 750, 1000]) {
    frame.self.CurStepHelpData = { cardIds: [99] };
    assistant.run(frame, now);
  }
  assert.deepEqual(calls, ['cancel']);
});

test('assistant handles a target-only inquiry and prioritizes the lord for hostile identity plays', () => {
  for (const { identity, ownFigure, card, hint, expected } of [
    { identity: true, ownFigure: 3, card: 1, expected: 'lord' },
    { identity: true, ownFigure: 3, card: 4, expected: 'lord' },
    { identity: true, ownFigure: 3, card: 3, expected: 'rebel' },
    { identity: true, ownFigure: 2, card: 1, expected: 'rebel' },
    { identity: false, ownFigure: 3, card: 1, expected: 'rebel' },
    { identity: true, ownFigure: 3, card: 1, hint: true, expected: 'rebel' },
  ]) {
    const calls = [], assistant = createAssistant();
    const ok = { name: 'btnOK', enabled: false, onClick() { calls.push('confirm'); } };
    const target = (index, figure, name) => ({
      Activated: true, Seat: { Index: index, Figure: figure },
      seatClickHandler() { this.Seat.Selected = true; ok.enabled = true; calls.push(name); },
    });
    const frame = {
      self: {
        seat: { InOwnRound: true, Figure: ownFigure },
        cardContainer: { cardUis: [{ Card: { FirstSkillId: card }, selected: true }] },
        Pt: { btns: [ok] },
        ...(hint ? { CurStepHelpData: { seatIds: [1] } } : {}),
      },
      scene: { seatContainer: { seatUIs: [target(1, 3, 'rebel'), target(2, 1, 'lord')] } },
    };
    assistant.run(frame, 0, { identity });
    if (hint) assert.deepEqual(calls, [expected]);
    else assert.deepEqual(calls, []);
    assistant.run(frame, 1000, { identity });
    assert.deepEqual(calls, [expected, 'confirm']);
  }
});

test('legacy fallback: own-turn trustee starts once after local timeout and respects mulligan guard', () => {
  const calls = [], assistant = createAssistant();
  const frame = { self: { seat: { InOwnRound: true, IsAiControl: false },
    cardContainer: { activatedCardtems: [{ activated: true }] }, onTrusteeshipClick() { calls.push('trustee'); this.seat.IsAiControl = true; } }, scene: {} };
  assistant.run(frame, 0); assistant.run(frame, 1000); assistant.run(frame, 3999);
  assert.deepEqual(calls, []);
  assistant.run(frame, 4000, { allowTrustee: false }); assert.deepEqual(calls, []);
  assistant.run(frame, 4250); assistant.run(frame, 5000);
  assert.deepEqual(calls, ['trustee']); assert.equal(assistant.mode(), 'trustee');
});

test('legacy fallback: off-turn never toggles trustee, unavailable cancel is never clicked', () => {
  const assistant = createAssistant();
  const frame = { self: { seat: { InOwnRound: false }, cardContainer: { activatedCardtems: [{ activated: true }] },
    Pt: { btns: [{ name: 'btnCancel', enabled: false, onClick() { throw Error('disabled'); } }] },
    onTrusteeshipClick() { throw Error('off-turn trustee'); } }, scene: {} };
  for (const now of [0, 1000, 4000, 10000]) assistant.run(frame, now);
  assert.equal(assistant.isTrustee(), false);
});

test('legacy fallback: popup waits for official highlight then uses available card after 2.5 seconds', () => {
  const calls = [], assistant = createAssistant(), card = { Card: {}, maskAlpha: 0 };
  const frame = { self: {}, scene: {}, nodes: [{ name: 'WuGuFengDengWindow', showCardUIs: [card],
    OnSelectNormalCardUi(c) { assert.equal(c, card); calls.push('pick'); this.visible = false; } }] };
  assistant.run(frame, 0); assistant.run(frame, 1000); assistant.run(frame, 2000);
  assert.deepEqual(calls, []);
  assistant.run(frame, 3000); assert.deepEqual(calls, ['pick']);
});
