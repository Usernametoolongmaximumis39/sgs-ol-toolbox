import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { capturePokerLiveInteractions } from '../src/plugins/poker-lobby/live/native-interactions.js';
import { attachReadOnlyPokerInteractions } from '../src/plugins/poker-lobby/replay/native-interactions.js';
import { POKER_REPLAY_ATTRIBUTE } from '../src/shared/poker-replay-mode.js';

class Button {
  visible = true;
  enabled = true;
  mouseEnabled = true;
  _events = {};

  on(type, caller, method, args) {
    (this._events[type] ||= []).push({ caller, method, args });
  }

  off(type, caller, method) {
    this._events[type] = this._events[type]?.filter(entry => entry.caller !== caller || entry.method !== method);
  }

  emit(type, ...data) {
    for (const { caller, method, args } of this._events[type] || []) method.apply(caller, [...(args || []), ...data]);
  }
}

function liveFixture() {
  const calls = [];
  class PokerTableGameScene {}
  const scene = new PokerTableGameScene();
  scene.SceneName = 'PokerTableGameScene';
  scene.Manager = {
    selfSeatIndex: 2,
    SendClientTrustReq() { assert.fail('use the native menu, not its request method'); },
  };
  const self = scene.SelfSeatUi = {
    Seat: { IsSelf: true, Index: 2, IsAiControl: false, PlayerInfo: { ClientId: 55 } },
    chatBtn: new Button(),
    propBtnIn: new Button(),
    showChatHandler() { assert.equal(this, self); calls.push('chat'); },
    onInteractPropClick() { assert.equal(this, self); calls.push('items'); },
    onTrusteeshipClick() { assert.fail('the seat method is not the poker toolbar route'); },
  };
  const menu = scene.gameToolbar = {
    btn_trusteeship: new Button(),
    onTrusteeshipClick() { assert.equal(this, menu); calls.push('trustee'); },
  };
  const current = { scene, account: '55', proxy: { ConnId: 1 }, replay: false, time: 0 };
  const attributes = new Set();
  const ctx = {
    document: { documentElement: { hasAttribute: name => attributes.has(name) } },
    game: {
      getScene: () => current.scene,
      getClass: name => name === scene.SceneName ? PokerTableGameScene : null,
      getServerProxy: () => current.proxy,
      isReplay: () => current.replay,
    },
    native: { account: () => ({ id: current.account }) },
    window: { performance: { now: () => current.time } },
    scope: new ResourceScope(),
  };
  return { ctx, current, calls, scene, self, menu, attributes };
}

test('native live interactions use official controls and wait for trustee acknowledgment', () => {
  const { ctx, current, calls, scene, self, menu } = liveFixture();
  const port = capturePokerLiveInteractions(ctx, scene);
  assert.deepEqual(port.status(), { chat: true, items: true, trustee: false, trusteeAvailable: true });
  menu.btn_trusteeship.visible = false;
  assert.equal(port.setTrustee(true), false);
  menu.btn_trusteeship.visible = true;
  assert.equal(port.openChat(), true);
  assert.equal(port.openItems(), true);
  self.propBtnIn.enabled = false;
  assert.equal(port.openItems(), false);
  assert.equal(port.setTrustee(false), false);
  assert.equal(port.setTrustee(true), true);
  assert.equal(port.status().trustee, false);
  assert.equal(port.status().trusteeAvailable, false);
  assert.equal(port.setTrustee(true), false);
  current.time = 2500;
  assert.equal(port.setTrustee(true), true);
  self.Seat.IsAiControl = true;
  assert.equal(port.status().trustee, true);
  assert.equal(port.setTrustee(false), true);
  assert.deepEqual(calls, ['chat', 'items', 'trustee', 'trustee', 'trustee']);
  ctx.scope.dispose();
});

test('replay, viewer, synthetic tables and replaced live visits have no action port', () => {
  const f = liveFixture();
  const { ctx, current, calls, scene, attributes } = f;
  const fake = current.scene = { ...scene };
  assert.equal(capturePokerLiveInteractions(ctx, fake), null);
  current.scene = scene;
  current.replay = true;
  assert.equal(capturePokerLiveInteractions(ctx, scene), null);
  current.replay = false;
  scene.IsViewer = true;
  assert.equal(capturePokerLiveInteractions(ctx, scene), null);
  scene.IsViewer = false;
  f.self.Seat.PlayerInfo.ClientId = 56;
  assert.equal(capturePokerLiveInteractions(ctx, scene), null);
  f.self.Seat.PlayerInfo.ClientId = 55;
  attributes.add(POKER_REPLAY_ATTRIBUTE);
  assert.equal(capturePokerLiveInteractions(ctx, scene), null);
  attributes.clear();
  for (const [key, value] of [['account', '56'], ['proxy', { ConnId: 1 }], ['scene', fake]]) {
    const old = current[key];
    const port = capturePokerLiveInteractions(ctx, scene);
    current[key] = value;
    assert.equal(port.openChat(), false);
    current[key] = old;
    assert.equal(port.openItems(), false, 'a stale port never revives');
  }
  const port = capturePokerLiveInteractions(ctx, scene);
  ctx.scope.dispose();
  assert.equal(port.setTrustee(true), false);
  assert.deepEqual(calls, []);
});

function addAction(owner, field, method, fn, event = 'click', args) {
  const button = owner[field] = new Button();
  owner[method] = fn;
  button.on(event, owner, fn, args);
  return button;
}

test('classic replay leaves history visible and blocks native action paths until cleanup', () => {
  const calls = [];
  const chat = { bottomButtonBar: new Button(), messageList: new Button() };
  const toolbar = {};
  const self = { onTrusteeshipClick() { calls.push('seat trustee'); } };
  const send = addAction(chat, 'sendBtn', 'sendHandler', subject => calls.push(subject), 'click', ['send click']);
  const purchase = addAction(chat, 'rescriptBtn', 'buyRescriptItem', () => calls.push('purchase'));
  const items = addAction(toolbar, 'interactPropBtn', 'onInteractPropClick', () => calls.push('items'));
  const trust = addAction(toolbar, 'trusteeshipBtn', 'onTrusteeshipClick', () => calls.push('menu trustee'));
  const trace = {};
  const scope = new ResourceScope();
  const scene = { replayBar: {}, chatViewUI: chat, gameToolbar: toolbar, SelfSeatUi: self, rightView: { traceArea: trace } };
  const refresh = attachReadOnlyPokerInteractions({ Event: { CLICK: 'click' } }, scope, scene);
  const fast = addAction(chat, 'fastViewUI', 'sendQuickChat', () => calls.push('quick chat'), 'CHAT_QUICK_CHAT');
  const directItems = addAction(self, 'propBtnIn', 'onInteractPropClick', () => calls.push('direct items'));
  const directChat = addAction(self, 'chatBtn', 'showChatHandler', () => calls.push('direct chat'));
  const cancel = self.cancelTrusteeShip = {};
  const cancelBtn = addAction(cancel, 'cancelBtn', 'j', () => calls.push('cancel trustee'));
  cancel.CancelTruset = function () { this.j(); };
  refresh();
  refresh();

  send.emit('click');
  chat.sendHandler('enter');
  purchase.emit('click');
  items.emit('click');
  trust.emit('click');
  self.onTrusteeshipClick();
  fast.emit('CHAT_QUICK_CHAT');
  directItems.emit('click');
  directChat.emit('click');
  cancelBtn.emit('click');
  cancel.CancelTruset();
  assert.deepEqual(calls, []);
  for (const node of [chat.bottomButtonBar, items, trust, fast, cancelBtn, directItems, directChat]) assert.equal(node.visible, false);
  assert.equal(chat.messageList.visible, true);
  assert.equal(scene.rightView.traceArea, trace);

  assert.deepEqual(scope.dispose(), []);
  send.emit('click');
  chat.sendHandler('enter');
  purchase.emit('click');
  fast.emit('CHAT_QUICK_CHAT');
  cancelBtn.emit('click');
  items.emit('click');
  assert.deepEqual(calls, ['send click', 'enter', 'purchase', 'quick chat', 'cancel trustee', 'items']);
  for (const node of [chat.bottomButtonBar, items, trust, fast, cancelBtn, directItems, directChat]) assert.equal(node.visible, true);
});
