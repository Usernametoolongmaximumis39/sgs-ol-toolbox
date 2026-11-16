import test from 'node:test';
import assert from 'node:assert/strict';
import { createNative, clickSkill, press, usable } from '../src/plugins/gaizhu/native.js';

function fixture(children = [], cached = {}) {
  const stage = { _children: children };
  const scene = { name: 'GameScene', SelfSeatUi: {}, _children: [] };
  const wm = { WindowInstanceDict: { _maps: cached } };
  const native = createNative({ window: { Laya: { stage } }, game: {
    getScene: () => scene, getClass: name => name === 'WindowManager' ? wm : null,
    getServerProxy: () => null,
  } });
  native.frame();
  return { native, scene, stage, refresh: () => native.frame() };
}

test('gaizhu native: FlatButton dispatches onClick with mouseEnabled false while disabled controls remain blocked', () => {
  let clicks = 0;
  // Cached client $jt: outer mouseEnabled is inherited false; its background
  // receives mouse input, and onClick dispatches when enabled.
  const button = { mouseEnabled: false, enabled: true, background: { mouseEnabled: true },
    onClick() { assert.equal(arguments.length, 0); clicks++; },
    onMouse() { assert.fail('FlatButton onClick must stay first'); } };
  assert.equal(usable(button), true);
  assert.equal(press(button), true);
  for (const flag of ['disabled', 'enabled', '_enabled']) {
    const blocked = { ...button, [flag]: flag === 'disabled' };
    assert.equal(press(blocked), false);
  }
  assert.equal(clicks, 1);
});

test('gaizhu native: sprite button inherited onClick falls back to its onMouse without invented hit-test coordinates', () => {
  const calls = [];
  // Cached gO.onClick begins by reading event.currentTarget. S$t inherits it
  // and supplies onMouse for dispatching its own click listener.
  class Container {
    onClick(event) {
      calls.push(['onClick', arguments.length]);
      const target = event.currentTarget;
      if (this === target) assert.fail('press must not invent currentTarget/stage coordinates');
    }
  }
  class SpriteButton extends Container {
    _enabled = true;
    onMouse(event) { calls.push(['onMouse', event]); }
  }
  const button = new SpriteButton();
  assert.equal(press(button), true);
  assert.deepEqual(calls, [['onClick', 0], ['onMouse', { type: 'click' }]]);
});

test('gaizhu native: failed native routes fall back once to event and retain complete errors when all routes fail', () => {
  const calls = [];
  const button = { name: 'native-control',
    onClick() { calls.push('click'); throw new Error('click route failed'); },
    onMouse() { calls.push('mouse'); throw new Error('mouse route failed'); },
    event(type, name) { calls.push([type, name]); },
  };
  assert.equal(press(button), true);
  assert.deepEqual(calls, ['click', 'mouse', ['click', 'native-control']]);
  button.event = () => { throw new Error('event route failed'); };
  assert.throws(() => press(button), error => error instanceof AggregateError && error.errors.length === 3
    && ['click route failed', 'mouse route failed', 'event route failed'].every(message => error.message.includes(message)));
  assert.equal(press({}), false);
});

test('gaizhu native: active skill uses onMouse before inherited onClick and accepts native truthy activation', () => {
  const calls = [];
  const skill = { activated: 1, Selected: false, enabled: true, mouseEnabled: false,
    onClick() { calls.push('inherited-click'); }, onMouse(event) { calls.push(event.type); } };
  assert.equal(clickSkill(skill), true);
  assert.deepEqual(calls, ['click']);
  for (const state of [{ activated: false }, { Selected: true }, { enabled: false }, { visible: false }, { destroyed: true }]) {
    assert.equal(clickSkill({ ...skill, ...state }), false);
  }
  assert.deepEqual(calls, ['click']);
});

test('gaizhu native: named hand-card window closes despite mouse-disabled container and child labels', () => {
  let closed = 0, used = 0;
  const win = { name: 'ShouQiKaAskWindow', visible: true, mouseEnabled: false,
    _children: [{ label: '使用', onClick() { used++; } }], CloseWin() { closed++; this.visible = false; } };
  const f = fixture([win]);
  const prompt = f.native.mulligan();
  assert.equal(prompt.win, win);
  assert.equal(prompt.declineNow, null);
  assert.equal(prompt.close(), true);
  assert.equal(closed, 1);
  assert.equal(used, 0);
  f.refresh(); assert.equal(f.native.mulligan(), null);
});

test('gaizhu native: official cancleBtn spelling is reached without guessing the use button', () => {
  let cancelled = 0, used = 0;
  const win = { name: 'ShouQiKaAskWindow', visible: true, mouseEnabled: false,
    useBtn: { label: '使用', onClick() { used++; } },
    cancleBtn: { label: '取消', enabled: true, mouseEnabled: false, onClick() { cancelled++; } } };
  const f = fixture([win]);
  assert.equal(f.native.mulligan().declineNow(), true);
  assert.equal(cancelled, 1); assert.equal(used, 0);
});

test('gaizhu native: a noninteractive cancel label resolves to its clickable parent', () => {
  let cancelled = 0;
  const button = { enabled: true, onClick() { cancelled++; }, _children: [] };
  button._children.push({ text: '不使用', mouseEnabled: false, parent: button });
  const win = { name: 'ShouQiKaAskWindow', _children: [button] }; button.parent = win;
  const f = fixture([win]);
  assert.equal(f.native.mulligan().decline, button);
  assert.equal(f.native.mulligan().declineNow(), true);
  assert.equal(cancelled, 1);
});

test('gaizhu native: native close precedes loose text matches and falls through only when a close method throws', () => {
  const calls = [];
  const win = { name: 'ShouQiKaAskWindow', _children: [{ label: '取消本次', onClick() { calls.push('loose'); } }],
    CloseWin() { calls.push('close-failed'); throw new Error('native method unavailable'); },
    onClickClose() { calls.push('closed'); } };
  const prompt = fixture([win]).native.mulligan();
  assert.equal(prompt.declineNow, null);
  assert.equal(prompt.close(), true);
  assert.deepEqual(calls, ['close-failed', 'closed']);
});

test('gaizhu native: confirm-data cancellation keeps callback owner/arguments and closes its prompt', () => {
  const owner = { value: 0 };
  const win = { mouseEnabled: false, confirmData: { content: '是否使用手气卡？', clickClose: true, buttonArr: [
    { label: '使用', callBack() { assert.fail('must never spend a hand-card item'); } },
    { label: '不使用', thisObject: owner, callBackParams: [7], callBack(value) { this.value = value; } },
  ] }, RemoveFromParent() { this.visible = false; } };
  const prompt = fixture([win]).native.mulligan();
  assert.equal(prompt.declineNow(), true); assert.equal(owner.value, 7); assert.equal(win.visible, false);
});

test('gaizhu native: anonymous button bar is recognized by current hand-card text without closing arbitrary bars', () => {
  let cancelled = 0, closed = 0;
  const f = fixture();
  f.scene.SelfSeatUi.buttonBar = { visible: true, mouseEnabled: false,
    txtOptMsg: { _innerHTML: '是否更换手牌？' },
    btns: [{ label: '不使用', onClick() { cancelled++; } }], CloseWin() { closed++; } };
  f.refresh();
  const prompt = f.native.mulligan();
  assert.equal(prompt.declineNow(), true); assert.equal(prompt.close, null);
  assert.equal(cancelled, 1); assert.equal(closed, 0);
});

test('gaizhu native: cached window names are a fallback, but detached visible cached windows are not active', () => {
  let closed = 0;
  const live = { parent: {}, visible: true, CloseWin() { closed++; } };
  const stale = { name: 'SelectGeneralWindow', visible: true, generalUis: [{}] };
  const f = fixture([], { ShouQiKaAskWindow: live, SelectGeneralWindow: stale });
  assert.equal(f.native.mulligan().close(), true); assert.equal(closed, 1);
  assert.equal(f.native.selectWindow(), undefined);
  live.parent = null; f.refresh(); assert.equal(f.native.mulligan(), null);
  stale.parent = {}; f.refresh(); assert.equal(f.native.selectWindow(), stale);
});

test('gaizhu native: unknown labels never become cancellation and hidden ancestors remain excluded', () => {
  let invoked = 0;
  const win = { name: 'ShouQiKaAskWindow', _children: [
    { label: '使用', onClick() { invoked++; } }, { label: '待渲染', onClick() { invoked++; } },
  ] };
  const prompt = fixture([win]).native.mulligan();
  assert.equal(prompt.declineNow, null); assert.equal(prompt.close, null); assert.equal(invoked, 0);
  assert.equal(usable({ parent: { visible: false }, onClick() {} }), false);
});

test('gaizhu native: ordinary AI confirmation accepts its configured suffix and preserves callback arguments', () => {
  const calls = [], owner = {};
  const prompt = { confirmData: { clickClose: true, buttonArr: [
    { label: '高级小杀', callBack() { assert.fail('must not choose advanced AI'); } },
    { label: '小杀（普通） 1号', thisObject: owner, callBackParams: [1], callBack(kind) { assert.equal(this, owner); calls.push(kind); } },
  ] }, RemoveFromParent() { calls.push('close'); } };
  assert.equal(fixture([prompt]).native.confirmAi(), true);
  assert.deepEqual(calls, [1, 'close']);
});

test('gaizhu native: AI confirmation never substitutes advanced, unknown or disabled ordinary choices', () => {
  for (const choice of [{ label: '小杀' }, { label: '高级小杀' }, { label: '超级小杀' },
    { label: '普通', btnGray: true }, { label: '普通小杀', enabled: false }]) {
    const prompt = { confirmData: { buttonArr: [{ ...choice, callBack() { assert.fail('ineligible AI choice'); } }] } };
    assert.equal(fixture([prompt]).native.confirmAi(), false);
  }
});
