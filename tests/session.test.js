import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';

// Contract fixtures reconstructed from the observed userscript event adapter.
// These are synthetic packets, not captures of an authenticated game session.
function harness(t, targets = []) {
  const journal = new SessionJournal(), scope = new ResourceScope(), calls = [];
  const win = { console: { log(...args) { calls.push(args); return 'console-result'; } } };
  let current = targets;
  const bridge = installMessageBridge(win, journal, scope, () => {}, { getTargets: () => current });
  t.after(() => scope.dispose());
  return { journal, scope, win, bridge, calls, replaceTargets(value) { current = value; bridge.check(); } };
}

test('native dispatch records packets with prototype getters when console logging is silent', async t => {
  let nativeThis, nativeArgs;
  const target = { event(...args) { nativeThis = this; nativeArgs = args; return 'native-result'; } };
  const { journal, bridge, calls } = harness(t, [{ name: 'ServerProxy', target }]);
  const cards = new Uint32Array([10001, 10002]);
  class StartPacket {
    get ClassName() { return 'MsgGamePlayCardNtf'; }
    get CardList() { return cards; }
    get IsResume() { return false; }
    get UnrelatedBrokenGetter() { throw new Error('unused field'); }
  }
  const packet = new StartPacket(), receiver = {};
  Object.defineProperty(packet, 'SeatID', { value: 2, enumerable: false });
  assert.equal(target.event.call(receiver, 'MsgGamePlayCardNtf', packet, 'extra'), 'native-result');
  assert.equal(nativeThis, receiver); assert.deepEqual(nativeArgs, ['MsgGamePlayCardNtf', packet, 'extra']);
  cards[0] = 777;
  await bridge.flush();
  assert.equal(calls.length, 0); assert.equal(journal.events.length, 1); assert.equal(journal.incomplete, false);
  assert.deepEqual(journal.events[0].payload.CardList, [10001, 10002]);
  assert.equal(journal.events[0].payload.SeatID, 2);
  assert.deepEqual(journal.events[0].payload.CardList, [10001, 10002]);
  assert.equal(bridge.getStatus().native, 1);
  assert.deepEqual(bridge.getStatus().targets, ['ServerProxy']);
});

test('native event names identify classless payloads and unwrap Laya single-argument arrays', async t => {
  const originalArgs = [], target = { event(...args) { originalArgs.push(args); } };
  const { journal, bridge } = harness(t, [{ name: 'ActivityManager', target }]);
  const payload = { Protocol: { FromZone: 5, ToZone: 2, CardIDs: [10001] } }, args = [payload];
  target.event('PubGsCMoveCard', args);
  await bridge.flush();
  assert.equal(journal.events[0].type, 'PubGsCMoveCard');
  assert.deepEqual(journal.events[0].payload, payload.Protocol);
  assert.equal(originalArgs[0][1], args);
  target.event('not-a-protocol', { ClassName: 'decodeClientGetCardInfoResp', ProtoObj: { seatId: 2, cardList: [10002] } });
  await bridge.flush();
  assert.equal(journal.events[1].type, 'decodeClientGetCardInfoResp');
  assert.deepEqual(journal.events[1].payload, { SeatID: 2, CardIDs: [10002] });
});

test('console finds the protocol argument before trailing diagnostic values', async t => {
  const { win, journal, bridge } = harness(t);
  const packet = { ClassName: 'PubGsCMoveCard', CardIDs: [10001] };
  assert.equal(win.console.log('recv', packet, 'elapsed', 0), 'console-result');
  await bridge.flush();
  assert.equal(journal.events.length, 1);
  win.console.log('send', packet, 'elapsed', 0);
  await bridge.flush();
  assert.equal(journal.events.length, 1);
});

test('the same packet through console and two dispatchers is delivered only once', async t => {
  const proxy = { event() {} }, activity = { event() {} };
  const { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target: proxy }, { name: 'ActivityManager', target: activity }]);
  for (const reverse of [false, true]) {
    const packet = { ClassName: 'PubGsCMoveCard', CardIDs: [10001], ToZone: 2 };
    if (reverse) proxy.event(packet.ClassName, packet);
    win.console.log('recv', packet);
    if (!reverse) proxy.event(packet.ClassName, packet);
    activity.event(packet.ClassName, packet);
  }
  await bridge.flush();
  assert.equal(journal.events.length, 2);
});

test('identical legitimate repeated packets are retained even when the client reuses an object', async t => {
  const target = { event() {} }, { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target }]);
  const packet = { ClassName: 'PubGsCMoveCard', CardIDs: [10001] };
  win.console.log('recv', packet); win.console.log('recv', packet);
  target.event(packet.ClassName, packet); target.event(packet.ClassName, packet);
  await bridge.flush();
  assert.equal(journal.events.length, 2);
  target.event(packet.ClassName, { ...packet }); target.event(packet.ClassName, { ...packet });
  await bridge.flush();
  assert.equal(journal.events.length, 4);
});

test('different console and native objects pair by normalized body despite wrappers and key ordering', async t => {
  const proxy = { event() {} }, activity = { event() {} };
  const { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target: proxy }, { name: 'ActivityManager', target: activity }]);
  win.console.log('recv', {
    ClassName: 'PubGsCMoveCard', CardIDs: new Uint32Array([10001]), FromZone: 5, ToZone: 2, CardCount: 1,
  });
  proxy.event('PubGsCMoveCard', {
    Protocol: { CardCount: 1, ToZone: 2, FromZone: 5, CardIDs: [10001] },
  });
  activity.event('PubGsCMoveCard', {
    ProtoObj: { FromZone: 5, CardCount: 1, CardIDs: [10001], ToZone: 2 },
  });
  await bridge.flush();
  assert.equal(journal.events.length, 1);
  assert.deepEqual(journal.events[0].payload.CardIDs, [10001]);
});

test('body pairing across independent wrapper objects preserves repeated same-source deliveries', async t => {
  const target = { event() {} }, { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target }]);
  const payload = () => ({ CardIDs: [10001], FromZone: 5, ToZone: 2 });
  // Two actual deliveries with equal contents; the native route sees its own
  // packet objects after the two console copies have already been observed.
  win.console.log('recv', { ClassName: 'PubGsCMoveCard', ...payload() });
  win.console.log('recv', { ClassName: 'PubGsCMoveCard', ...payload() });
  target.event('PubGsCMoveCard', { Protocol: payload() });
  target.event('PubGsCMoveCard', { ProtoObj: payload() });
  await bridge.flush();
  assert.equal(journal.events.length, 2);
  target.event('PubGsCMoveCard', { Protocol: payload() });
  await bridge.flush();
  assert.equal(journal.events.length, 3);
});

test('console and native initial-deck copies reset the session once when their wrappers differ', async t => {
  const target = { event() {} }, { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target }]);
  const sessionId = journal.sessionId;
  win.console.log('recv', { ClassName: 'MsgGamePlayCardNtf', CardList: [10001, 10002], IsResume: false });
  target.event('MsgGamePlayCardNtf', { Protocol: { IsResume: false, CardList: [10001, 10002] } });
  await bridge.flush();
  assert.equal(journal.sessionId, sessionId + 1);
  assert.equal(journal.events.length, 1);
});

test('packet reuse after a microtask and changed content are not mistaken for old duplicates', async t => {
  const target = { event() {} }, { win, journal, bridge } = harness(t, [{ name: 'ServerProxy', target }]);
  const packet = { ClassName: 'PubGsCMoveCard', CardIDs: [10001] };
  win.console.log('recv', packet); target.event(packet.ClassName, packet);
  await Promise.resolve();
  target.event(packet.ClassName, packet);
  packet.CardIDs = [10002];
  win.console.log('recv', packet); target.event(packet.ClassName, packet);
  await bridge.flush();
  assert.deepEqual(journal.events.map(e => e.payload.CardIDs), [[10001], [10001], [10002]]);
});

test('scene target replacement stops observing the old instance and disposal restores descriptors', async t => {
  const oldTarget = { event() { return 'old'; } }, nextTarget = { event() { return 'next'; } };
  const oldDescriptor = Object.getOwnPropertyDescriptor(oldTarget, 'event'), nextDescriptor = Object.getOwnPropertyDescriptor(nextTarget, 'event');
  const { journal, scope, bridge, replaceTargets } = harness(t, [{ name: 'ServerProxy', target: oldTarget }]);
  const packet = { ClassName: 'PubGsCMoveCard' };
  oldTarget.event(packet.ClassName, packet);
  replaceTargets([{ name: 'ServerProxy', target: nextTarget }]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(oldTarget, 'event'), oldDescriptor);
  oldTarget.event(packet.ClassName, {}); nextTarget.event(packet.ClassName, {});
  await bridge.flush();
  assert.equal(journal.events.length, 2);
  scope.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(nextTarget, 'event'), nextDescriptor);
  nextTarget.event(packet.ClassName, {});
  await bridge.flush();
  assert.equal(journal.events.length, 2);
});

test('a later native wrapper remains intact and retained bridge wrappers become inert on disposal', async t => {
  const native = () => 'native', target = { event: native };
  const { bridge, journal, scope } = harness(t, [{ name: 'ServerProxy', target }]);
  const first = target.event;
  const thirdParty = function (...args) { return Reflect.apply(first, this, args); };
  target.event = thirdParty; bridge.check();
  assert.equal(target.event('PubGsCMoveCard', {}), 'native');
  await bridge.flush();
  assert.equal(journal.events.length, 1);
  scope.dispose();
  assert.equal(target.event, thirdParty);
  target.event('PubGsCMoveCard', {});
  await bridge.flush();
  assert.equal(journal.events.length, 1);
});

test('native errors and an unavailable console do not block game delivery or the other capture route', async t => {
  const target = { event() { throw new Error('native-handler-failure'); } };
  const journal = new SessionJournal(), scope = new ResourceScope(), win = { console: {} };
  Object.defineProperty(win.console, 'log', { get: () => () => {}, configurable: false });
  const bridge = installMessageBridge(win, journal, scope, () => {}, { getTargets: () => [{ name: 'ServerProxy', target }] });
  t.after(() => scope.dispose());
  assert.throws(() => target.event('PubGsCMoveCard', {}), /native-handler-failure/);
  await bridge.flush();
  assert.equal(journal.events.length, 1); assert.equal(bridge.error, '');
  assert.equal(bridge.getStatus().errors.length, 1);
});

test('all supported nested packet wrappers reset the journal on a new initial deck', () => {
  const wrappers = [
    body => body, body => ({ Protocol: body }), body => ({ ProtoObj: body }),
    body => ({ Data: body }), body => ({ msg: body }),
    body => ({ Data: { Protocol: body } }), body => ({ Msg: { data: { protoObj: body } } }),
  ];
  for (const wrap of wrappers) {
    const journal = new SessionJournal(); journal.push('PubGsCMoveCard', { CardIDs: [999] });
    const before = journal.sessionId;
    journal.push('MsgGamePlayCardNtf', wrap({ CardList: [10001], IsResume: false }));
    assert.equal(journal.sessionId, before + 1, JSON.stringify(wrap({ CardList: [10001] })));
    assert.equal(journal.events.length, 1);
    assert.equal(journal.incomplete, false);
  }
  const journal = new SessionJournal();
  journal.push('MsgGamePlayCardNtf', { CardList: [] }); assert.equal(journal.incomplete, true);
  journal.push('MsgGamePlayCardNtf', { CardList: [], Protocol: { card_list: [10001] } }); assert.equal(journal.incomplete, false);
});
