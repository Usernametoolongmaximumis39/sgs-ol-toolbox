import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant } from '../src/plugins/gaizhu/assistant.js';

test('assistant waits without inventing a play, throttles requests and follows card/seat/confirm steps', () => {
  const calls = [], assistant = createAssistant();
  const card = { Card: { CardId: 7 }, activated: true, CardUI_Click() { this.selected = true; calls.push('card'); } };
  const seat = { seat: { index: 0 }, activated: true, seatClickHandler() { this.seat.Selected = true; calls.push('seat'); } };
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
