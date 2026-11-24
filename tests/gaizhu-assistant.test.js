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
    const options = { training: prefer };
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

test('Snatch and Dismantlement prefer legal defensive mounts, armour or treasure, other equipment, then hand cards', () => {
  const weapon = { Card: { Type: 3 }, CanBeSelected: true };
  const attackHorse = { Card: { Type: 5 }, CanBeSelected: true };
  const armour = { Card: { Type: 4 }, CanBeSelected: true };
  const treasure = { Card: { Type: 7 }, CanBeSelected: true };
  const defenseHorse = { Card: { FirstSkill: { Type: 6 } }, CanBeSelected: true };
  const hand = { CanBeSelected: true }, judge = { CanBeSelected: true };
  for (const Skill of [{ ID: 4 }, { SkillId: 5 }]) {
    for (const [equipCardUis, aiEffectCards, expected] of [
      [[weapon, armour, defenseHorse, treasure, attackHorse], [], defenseHorse],
      [[attackHorse, treasure, { ...defenseHorse, CanBeSelected: false }, armour], [], treasure],
      [[attackHorse, armour, { ...defenseHorse, visible: false }], [], armour],
      [[attackHorse, { ...armour, enabled: false }], [], attackHorse],
      [[], [], hand],
      [[defenseHorse], [hand], hand],
    ]) {
      const calls = [], assistant = createAssistant();
      const win = { name: 'SelectCardWindow', Skill, equipCardUis, aiEffectCards,
        handCardUis: [hand], judgeCardUis: [judge],
        onTouchCard({ target }) { calls.push(target); this.visible = false; } };
      const frame = { self: {}, scene: {}, nodes: [win] };
      for (const now of [0, 1000, 2000]) assistant.run(frame, now);
      assert.deepEqual(calls, aiEffectCards.length ? [hand] : []);
      for (const now of [3000, 4000]) assistant.run(frame, now);
      assert.equal(calls.length, 1);
      assert.equal(calls[0], expected);
    }
  }
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

test('identity rescue checks the dying seat before either assistant can play a Peach', () => {
  for (const { mine, target, hinted = true, expected } of [
    { mine: 3, target: 1, expected: ['btnCancel'] },
    { mine: 3, target: 2, hinted: false, expected: ['btnCancel'] },
    { mine: 1, target: 2, expected: ['hint', 'btnOK'] },
    { mine: 2, target: 3, expected: ['btnCancel'] },
    { mine: 3, target: 3, hinted: false, expected: ['local', 'btnOK'] },
    { mine: 4, target: 4, expected: ['btnCancel'] },
    { mine: 3, target: 0, expected: ['btnCancel'] },
    { mine: 3, target: 'self', expected: ['hint', 'btnOK'] },
    { mine: 3, target: null, expected: ['btnCancel'] },
  ]) {
    const calls = [], assistant = createAssistant();
    const ok = { name: 'btnOK', enabled: false };
    const cancel = { name: 'btnCancel', enabled: true };
    const card = {
      Card: { CardId: 42, FirstSkillId: 3 }, activated: true,
      CardUI_Click() { this.selected = true; ok.enabled = true; calls.push('hint'); },
      setSelected(value) { this.selected = value; ok.enabled = value; calls.push('local'); },
    };
    const self = {
      seat: { Index: 0, Figure: mine, IsAskingTao: target === 'self' },
      cardContainer: { selectCardContext: { SpecifySkillId: 3 }, cardUis: [card] },
      Pt: { btns: [ok, cancel], Button_Click(button) { calls.push(button.name); this.visible = false; } },
      ...(hinted ? { CurStepHelpData: { cardIds: [42] } } : {}),
    };
    const seatUIs = target == null || target === 'self' ? [] : [{ seat: { Index: 1, Figure: target, IsAskingTao: true } }];
    const frame = { self, scene: { seatContainer: { seatUIs } } };
    assistant.run(frame, 0, { identity: true });
    if (expected.length > 1) assistant.run(frame, 1000, { identity: true });
    assert.deepEqual(calls, expected, `own identity ${mine}, dying identity ${target}, hinted ${hinted}`);
  }
});

test('identity declines an enemy rescue even when the only control is the native skill selector', () => {
  const calls = [], assistant = createAssistant({ getPeachTarget: () => 1 });
  const heal = { name: 'skill', enabled: true, data: { sendData: 1 } };
  const cancel = { enabled: false, data: { sendData: 255 } };
  const self = {
    seat: { Index: 0, Figure: 3, InOwnRound: true },
    spellSelector: { txtOptMsg: { text: '主公濒死，需要1个桃' }, btnList: [heal, cancel], btnClick(b) { calls.push(b); } },
    CurStepHelpData: { optionIndex: 0 },
    onTrusteeshipClick() { calls.push('trustee'); },
  };
  const frame = { self, scene: { seatContainer: { seatUIs: [{ Seat: { Index: 1, Figure: 1 } }] } } };
  for (const now of [0, 1000, 5000]) assistant.run(frame, now, { identity: true });
  assert.deepEqual(calls, []);
  cancel.enabled = true;
  assistant.run(frame, 5500, { identity: true });
  assert.deepEqual(calls, [cancel]);
});

test('identity plays Peach normally on its own turn and does not hand other prompts to trusteeship', () => {
  const calls = [], assistant = createAssistant();
  const self = {
    seat: { Index: 0, Figure: 3, InOwnRound: true, IsAiControl: false },
    cardContainer: { cardUis: [{ activated: true, Card: { CardId: 42, FirstSkillId: 3 },
      CardUI_Click() { this.selected = true; calls.push('peach'); } }] },
    CurStepHelpData: { cardIds: [42] },
    onTrusteeshipClick() { calls.push('trustee'); },
  };
  const frame = { self, scene: {} };
  assistant.run(frame, 0, { identity: true });
  self.CurStepHelpData = null;
  self.cardContainer = { activatedCardtems: [{ activated: true }] };
  for (const now of [1000, 2000, 5000, 6000]) assistant.run(frame, now, { identity: true });
  assert.deepEqual(calls, ['peach']);
});

test('training skips enemy and unresolved rescue, and still uses Peach or Wine on itself', () => {
  for (const { index, asking, spell, expected } of [
    { index: 1, asking: 1, spell: 3, expected: ['btnCancel'] },
    { index: undefined, asking: undefined, spell: 3, expected: ['btnCancel'] },
    { index: 0, asking: 1, spell: 3, expected: ['btnCancel'] },
    { index: 0, asking: 0, spell: 3, expected: ['救援出牌', 'btnOK'] },
    { index: undefined, asking: 0, spell: 82, expected: ['救援出牌', 'btnOK'] },
  ]) {
    const calls = [], assistant = createAssistant({ getPeachTarget: () => index });
    const ok = { name: 'btnOK', enabled: false };
    const card = { Card: { CardId: 4, FirstSkillId: spell }, activated: true, CardUI_Click() {
      this.selected = true;
      ok.enabled = true;
      calls.push('救援出牌');
    } };
    const self = {
      seat: { Index: 0, Figure: 1, InOwnRound: true, IsAskingTao: asking === 0 },
      cardContainer: { SelectContext: { Skill: { ID: 3 } }, cardUis: [card] },
      Pt: { btns: [ok, { name: 'btnCancel', enabled: true }], Button_Click(button) {
        calls.push(button.name);
        button.enabled = false;
      } },
      CurStepHelpData: { target: card, cardIds: [4] },
    };
    const scene = { seatContainer: { seatUIs: [{ Seat: { Index: 1, Figure: 1, IsAskingTao: asking === 1 } }] } };
    for (const now of [0, 250, 1500]) assistant.run({ scene, self }, now, { training: true });
    assert.deepEqual(calls, expected, `target ${index}, asking ${asking}, card skill ${spell}`);
  }
});

function ordinaryTurn({ slashSkill = 1, reachable = true, canSlash = true, boost = 0, wineInOx = false } = {}) {
  const actions = [];
  const self = { seat: { Index: 0, Figure: 3, InOwnRound: true, InActiveState: true,
    GetStateValue(id) { assert.equal(id, 6); return boost; } }, PlayCard_Result() {} };
  const enemy = { Seat: { Index: 2, Figure: 1 }, Activated: false, seatClickHandler() {
    assert.ok(this.Activated);
    this.Seat.Selected = true;
    ok.enabled = true;
  } };
  const card = (id, type, Activated) => ({ Card: { CardId: id, FirstSkillId: type }, Activated, Selected: false,
    CardUI_Click() { container.CardUI_Click({ CardUi: this }); } });
  const slash = card(11, slashSkill, canSlash), wine = card(12, 82, true);
  const ok = { name: 'btnOK', enabled: false }, end = { name: 'btnDiscard', enabled: true };
  const container = {
    cardUis: wineInOx ? [slash] : [wine, slash],
    muniuCardUis: wineInOx ? [wine] : [],
    CardUI_Click({ CardUi: ui }) {
      assert.equal(ui.Activated, true);
      setSelection(ui.Selected ? null : ui);
    },
    AllSelectHandCards() { assert.fail('ordinary play should select just one card'); },
  };
  function startSelection() {
    container.SelectContext = { Purpose: 'deal', SelectResultCallback: self.PlayCard_Result, CardSelector: {} };
    setSelection(null);
  }
  function setSelection(ui) {
    slash.Selected = ui === slash;
    wine.Selected = ui === wine;
    container.SelectContext.CardSelector.FirstSelectedCard = ui?.Card;
    enemy.Seat.Selected = false;
    enemy.Activated = ui === slash && reachable;
    self.SelectSeatContext = ui === slash ? { Card: slash.Card, get SelectedTargetSeatIDs() {
      return enemy.Seat.Selected ? [enemy.Seat.Index] : [];
    } } : null;
    ok.enabled = ui === wine;
  }
  self.cardContainer = container;
  self.Pt = { btns: [ok, end], Button_Click(button) {
    assert.ok(button.enabled);
    if (button === end) {
      actions.push('end');
      button.enabled = false;
      return;
    }
    if (wine.Selected) {
      actions.push('wine');
      return; // Simulate an unchanged operation bar until the server reply.
    }
    assert.ok(slash.Selected && enemy.Seat.Selected);
    actions.push('slash');
    slash.Activated = false;
    startSelection();
  } };
  startSelection();
  return { actions, self, enemy, slash, wine, frame: { self, scene: { seatContainer: { seatUIs: [enemy] } } },
    rejectWine: startSelection,
    acknowledgeWine() {
      container.cardUis = container.cardUis.filter(ui => ui !== wine);
      container.muniuCardUis = [];
      boost = 1;
      startSelection();
    } };
}

test('ordinary play submits Wine before normal or elemental Slash and waits for the native reply', () => {
  for (const [hint, slashSkill, options] of [
    ['slash', 1, { identity: true }], ['wine', 11111, { training: true }], [null, 11114, {}],
  ]) {
    const f = ordinaryTurn({ slashSkill, wineInOx: hint === 'wine' }), assistant = createAssistant();
    if (hint) f.self.CurStepHelpData = { cardIds: [f[hint].Card.CardId], seatIds: [2], buttonName: 'btnOK' };
    for (const now of [0, 1000, 1250, 1500, 1750, 2000, 3500]) assistant.run(f.frame, now, options);
    assert.deepEqual(f.actions, ['wine']);
    f.acknowledgeWine();
    for (const now of [3750, 4000, 4250, 4500]) assistant.run(f.frame, now, options);
    assert.deepEqual(f.actions, ['wine', 'slash']);
  }
});

test('ordinary play saves Wine when Slash has no legal target or cannot be played anymore', () => {
  for (const canSlash of [false, true]) {
    const f = ordinaryTurn({ reachable: false, canSlash }), assistant = createAssistant();
    f.self.CurStepHelpData = { cardIds: [f.wine.Card.CardId], buttonName: 'btnOK' };
    for (const now of [0, 250, 1000, 2400, 3500, 5000]) assistant.run(f.frame, now);
    assert.deepEqual(f.actions, ['end']);
    assert.equal(f.wine.Selected, false);
  }
});

test('a fresh native play prompt after a rejected drink can still use Slash without resending Wine', () => {
  const f = ordinaryTurn(), assistant = createAssistant();
  f.self.CurStepHelpData = { cardIds: [f.slash.Card.CardId], seatIds: [2], buttonName: 'btnOK' };
  for (const now of [0, 250, 500, 750]) assistant.run(f.frame, now);
  assert.deepEqual(f.actions, ['wine']);
  f.rejectWine();
  assistant.run(f.frame, 1000);
  assert.deepEqual(f.actions, ['wine']);
  for (const now of [2750, 3000, 3250, 5000]) assistant.run(f.frame, now);
  assert.deepEqual(f.actions, ['wine', 'slash']);
});

test('confirmed normal Slash is linked to the current Ice Sword inquiry before replacing damage', () => {
  const f = ordinaryTurn(), assistant = createAssistant();
  f.self.cardContainer.cardUis = [f.slash];
  f.self.CurStepHelpData = { cardIds: [f.slash.Card.CardId], seatIds: [2], buttonName: 'btnOK' };
  for (const now of [0, 250, 500]) assistant.run(f.frame, now);
  assert.deepEqual(f.actions, ['slash']);

  Object.assign(f.enemy.Seat, { Hp: 4, HandCardCount: 1, EquipCardCount: 1, EquipCards: [{ FirstSkillId: 200 }] });
  Object.assign(f.self.seat, { InActiveState: false, LastAskSkill: { ID: 201 } });
  f.self.Pt = { btns: [
    { name: 'btnOK', enabled: true, onClick() { f.actions.push('ice-sword'); } },
    { name: 'btnCancel', enabled: true, onClick() { assert.fail('the matched opponent can be disarmed'); } },
  ] };
  assistant.observe('GsCTriggerSpellNew', { trigger: 201, caster: 0, spell: 1, targets: [2] });
  assistant.run(f.frame, 750);
  assert.deepEqual(f.actions, ['slash', 'ice-sword']);
});

test('ordinary play keeps the existing Wine boost and preserves normal Peach use in training', () => {
  const f = ordinaryTurn({ boost: 1 }), assistant = createAssistant();
  f.self.CurStepHelpData = { cardIds: [f.slash.Card.CardId], seatIds: [2], buttonName: 'btnOK' };
  for (const now of [0, 250, 500]) assistant.run(f.frame, now, { training: true });
  assert.deepEqual(f.actions, ['slash']);
  const peach = { Activated: true, Card: { CardId: 3, FirstSkillId: 3 }, CardUI_Click() {
    f.actions.push('peach');
    this.Selected = true;
  } };
  f.self.cardContainer.cardUis.push(peach);
  f.self.Pt.txtOptMsg = { text: '使用桃回复1点体力' };
  f.self.CurStepHelpData = { cardIds: [3] };
  assistant.run(f.frame, 750, { training: true });
  assert.deepEqual(f.actions, ['slash', 'peach']);
});

test('Taoyuan is skipped at full or unknown HP and remains playable when wounded', () => {
  for (const { hp, hinted, preselected, transformed, expected } of [
    { hp: 4, expected: [7] },
    { hp: 4, hinted: true, expected: [7] },
    { hp: 4, preselected: true, hinted: true, expected: [7] },
    { hp: 4, preselected: true, transformed: true, expected: [6] },
    { hp: undefined, expected: [7] },
    { hp: 3, expected: [12] },
    { hp: 3, hinted: true, expected: [12] },
  ]) {
    const played = [], assistant = createAssistant();
    const seat = { InActiveState: true, Hp: hp, MaxHp: 4 };
    const ok = { name: 'btnOK', enabled: false, onClick() {
      played.push((selector.TurnCard ?? selector.FirstSelectedCard).FirstSkillId);
      this.enabled = false;
    } };
    const selector = {};
    const makeCard = id => ({ Activated: true, Card: { CardId: id, FirstSkillId: id },
      CardUI_Click() { container.CardUI_Click({ CardUi: this }); } });
    const taoyuan = makeCard(transformed ? 6 : 12), wuzhong = makeCard(7);
    const container = { SelectContext: { Purpose: 'deal', Message: '出牌阶段，请选择一张卡牌', CardSelector: selector },
      cardUis: [taoyuan, wuzhong], CardUI_Click({ CardUi: ui }) {
        ui.Selected = !ui.Selected;
        selector.FirstSelectedCard = ui.Selected ? ui.Card : null;
        selector.TurnCard = null;
        ok.enabled = ui.Selected;
      } };
    const self = { seat, cardContainer: container, Pt: { btns: [ok] } };
    if (preselected) taoyuan.CardUI_Click();
    if (transformed) selector.TurnCard = { FirstSkillId: 12 };
    if (hinted) self.CurStepHelpData = preselected ? { buttonName: 'btnOK' } : { cardIds: [12] };
    const frame = { scene: {}, self };
    for (const now of [0, 1000, 2000, 3000, 4000]) {
      assistant.run(frame, now);
      if (played.length) break;
    }
    assert.deepEqual(played, expected);
  }
});

test('an unresolved own-turn prompt never hands the next response to native trusteeship', () => {
  for (const options of [{ identity: true }, { training: true }, {}]) {
    const assistant = createAssistant();
    const frame = { self: { seat: { InOwnRound: true, IsAiControl: false },
      cardContainer: { activatedCardtems: [{ activated: true }] }, onTrusteeshipClick() { assert.fail('trustee'); } }, scene: {} };
    for (const now of [0, 1000, 3999, 4000, 4250, 8000]) assert.equal(assistant.run(frame, now, options), false);
    assert.equal(assistant.mode(), 'local');
  }
});

test('legacy fallback: off-turn never toggles trustee, unavailable cancel is never clicked', () => {
  const assistant = createAssistant();
  const frame = { self: { seat: { InOwnRound: false }, cardContainer: { activatedCardtems: [{ activated: true }] },
    Pt: { btns: [{ name: 'btnCancel', enabled: false, onClick() { throw Error('disabled'); } }] },
    onTrusteeshipClick() { throw Error('off-turn trustee'); } }, scene: {} };
  for (const now of [0, 1000, 4000, 10000]) assert.equal(assistant.run(frame, now), false);
});

test('legacy fallback: popup waits for official highlight then uses available card after 2.5 seconds', () => {
  const calls = [], assistant = createAssistant(), card = { Card: {}, maskAlpha: 0 };
  const frame = { self: {}, scene: {}, nodes: [{ name: 'WuGuFengDengWindow', showCardUIs: [card],
    OnSelectNormalCardUi(c) { assert.equal(c, card); calls.push('pick'); this.visible = false; } }] };
  assistant.run(frame, 0); assistant.run(frame, 1000); assistant.run(frame, 2000);
  assert.deepEqual(calls, []);
  assistant.run(frame, 3000); assert.deepEqual(calls, ['pick']);
});
