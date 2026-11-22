import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { attachSessionSnapshots } from '../src/core/snapshots.js';
import { createMarketConnection } from '../src/core/market-connection.js';
import { initialState, reduce } from '../src/plugins/cards/model.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('a rejected settlement does not block the next snapshot request', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  let attempts = 0;
  const snapshots = attachSessionSnapshots({
    journal, scope,
    settled: async () => { if (++attempts === 1) throw new Error('settlement failed'); },
    game: {
      getSnapshot: () => ({ inGame: false }),
      onSceneChange: () => () => {},
    },
  });
  await tick();
  assert.equal(journal.events.length, 0);
  snapshots.request();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(journal.events.at(-1)?.type, 'toolbox:snapshot');
});

test('a scene request coalesced into a rejected settlement is retried', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  let reject, attempts = 0;
  const snapshots = attachSessionSnapshots({
    journal, scope,
    settled: () => ++attempts === 1 ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(),
    game: {
      getSnapshot: () => ({ inGame: false }),
      onSceneChange: () => () => {},
    },
  });
  await tick();
  snapshots.request();
  reject(new Error('settlement failed'));
  await tick();
  assert.equal(attempts, 2);
  assert.equal(journal.events.at(-1)?.type, 'toolbox:snapshot');
});

test('replay recovery can publish an unchanged fresh snapshot without a live gap', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const snapshots = attachSessionSnapshots({ journal, scope, game: {
    getSnapshot: () => ({ inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }] }), onSceneChange: () => () => {},
  } });
  await tick();
  snapshots.request();
  await tick();
  assert.equal(journal.events.length, 1);
  snapshots.refreshForReplay();
  snapshots.refreshForReplay();
  await tick();
  assert.deepEqual(journal.events.map(event => event.type), ['toolbox:snapshot', 'toolbox:snapshot']);
});

test('delayed seat retries also wait for native observer batches to settle', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  let gate = Promise.resolve(), ready = false, release;
  attachSessionSnapshots({ journal, scope, settled: () => gate, game: {
    getSnapshot: () => ready ? { inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }], handCardIds: [20] } : { inGame: true, seats: [] },
    onSceneChange: () => () => {},
  } });
  await tick(); assert.equal(journal.events.length, 1);
  gate = new Promise(resolve => { release = resolve; }); ready = true;
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(journal.events.length, 1, 'Retry must not insert future native hand state while messages are pending');
  release(); await tick(); assert.equal(journal.events.length, 2);
});
test('native snapshots wait for every queued batch before reconciling the final hand', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const target = { event() {} };
  const bridge = installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, { getTargets: () => [{ name: 'ServerProxy', target }] });
  attachSessionSnapshots({ journal, scope, settled: bridge.flush, game: {
    getSnapshot: () => ({ inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }], handCardIds: [20] }), onSceneChange: () => () => {},
  } });
  target.event('MsgGamePlayCardNtf', { CardList: Array.from({ length: 40 }, (_, i) => i + 1) });
  for (let i = 1; i <= 20; i++) target.event('PubGsCMoveCard', { FromID: 255, FromZone: 1, ToID: 0, ToZone: 5, CardIDs: [i], CardCount: 1 });
  await bridge.flush(); await tick();
  assert.equal(journal.events.filter(event => event.type === 'PubGsCMoveCard').length, 20);
  assert.equal(journal.events.findIndex(event => event.type === 'toolbox:snapshot'), 21);
});
test('opening a new game after the scene exists restores native identity after dispatch', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope(); t.after(() => scope.dispose());
  let native = { inGame: true, selfSeatId: 0, modeId: 44, seats: [{ seatId: 0 }, { seatId: 1 }] };
  let state = initialState(), sessionId;
  journal.subscribe(event => { if (sessionId !== event.sessionId) { state = initialState(); sessionId = event.sessionId; } state = reduce(state, event); });
  attachSessionSnapshots({ journal, scope, game: { getSnapshot: () => native, onSceneChange: () => () => {} } });
  await tick(); assert.equal(state.selfSeatId, 0);
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2] });
  native = { ...native, handCardIds: [2] }; // Original client handles the packet after logging.
  await tick();
  assert.equal(state.selfSeatId, 0); assert.equal(state.mode.id, 44);
  assert.deepEqual(Object.keys(state.seats), ['0', '1']);
  assert.equal(journal.events[0].type, 'MsgGamePlayCardNtf');
  assert.equal(journal.events.at(-1).type, 'toolbox:snapshot');
});
test('late-created seats are retried and snapshot retries stop on disposal', async () => {
  const journal = new SessionJournal(), scope = new ResourceScope(); let calls = 0, ready = false;
  const game = { getSnapshot() { calls++; return ready ? { inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }] } : { inGame: true, seats: [] }; }, onSceneChange: () => () => {} };
  attachSessionSnapshots({ journal, scope, game }); await tick(); ready = true;
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(journal.events.at(-1).payload.selfSeatId, 0);
  scope.dispose(); const stoppedCalls = calls; await new Promise(resolve => setTimeout(resolve, 75)); assert.equal(calls, stoppedCalls);
});
test('stored invalid market addresses cannot break startup and input cannot poison refresh', () => {
  let saved = 'http://unsafe.example.com/dev/'; const notices = [];
  const settings = { get: () => saved, set: (key, value) => { saved = value; } };
  const connection = createMarketConnection(settings, () => {}, value => notices.push(value), { development: true });
  assert.equal(connection.get().baseUrl, 'http://127.0.0.1:17321'); assert.equal(notices.length, 1);
  assert.throws(() => connection.set('http://unsafe.example.com/dev/'));
  assert.equal(saved, 'http://127.0.0.1:17321');
  assert.equal(connection.set(' http://127.0.0.1:17322/ '), 'http://127.0.0.1:17322');
  assert.equal(createMarketConnection(settings, () => {}, undefined, { development: true }).get().baseUrl, saved);
});


test('optional market sources persist offline and HTTPS selections without requesting anything', () => {
  const values = new Map(); let requests = 0;
  const settings = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) };
  const create = () => createMarketConnection(settings, () => { requests++; }, undefined, { development: true });
  const connection = create();
  assert.equal(connection.get().baseUrl, 'http://127.0.0.1:17321');
  assert.equal(connection.set(''), ''); assert.equal(connection.get(), null);
  assert.equal(create().get(), null);
  assert.equal(connection.set('https://tools.3gs.xyz/sgs-toolbox/market/'), 'https://tools.3gs.xyz/sgs-toolbox/market');
  assert.equal(create().get().baseUrl, 'https://tools.3gs.xyz/sgs-toolbox/market');
  assert.throws(() => connection.set('http://unsafe.example.com'), { code: 'INVALID_URL' });
  assert.equal(connection.get().baseUrl, 'https://tools.3gs.xyz/sgs-toolbox/market');
  assert.equal(requests, 0);
});
