import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAdapter } from '../src/core/game.js';
import { createSceneWatch } from '../src/core/scene-watch.js';
import { ResourceScope } from '../src/core/resources.js';
import { readFileSync } from 'node:fs';
import { initialState, reduce, metadata, deckComposition, queryCards } from '../src/plugins/cards/model.js';

function setup(scene, classes = {}) {
  let poll, constructed = 0;
  const cleanups = [];
  const layer = { name: 'SceneLayer', layerOrder: 2, _children: scene ? [scene] : [] };
  const win = { Laya: { stage: { _children: [layer] }, ClassUtils: { getClass: name => classes[name], getInstance() { constructed++; throw new Error('must never instantiate client windows'); } } } };
  const game = createGameAdapter(win, { interval(fn) { poll = fn; }, add(fn) { cleanups.push(fn); } });
  return { game, win, layer, poll: () => poll(), constructed: () => constructed, dispose: () => cleanups.forEach(fn => fn()) };
}

test('Classic can resolve the login account before entering the hall, but not from a replay or viewer', () => {
  const player = { ClientId: 200 };
  let observed = false, reads = 0;
  const context = { IsViewerOrReplay: () => observed, get CurrentPlayer() { reads++; return player; } };
  const scene = { SceneName: 'LoginScene' };
  const { game } = setup(scene, { GameContext: context });
  assert.equal(game.getSelf(), player);
  observed = true;
  assert.equal(game.getSelf(), null);
  observed = false;
  scene.replayBar = {};
  assert.equal(game.getSelf(), null);
  assert.equal(reads, 1);
});

test('real abbreviated physical slash definitions keep elemental cards out of ordinary slash counts and queries', () => {
  // Four rows retained from the cached official sys_playcard.sgs table.
  const config = JSON.parse(readFileSync(new URL('./fixtures/physical-slash-config.json', import.meta.url), 'utf8'));
  const ids = config.GamePlayCards.card.map(row => row.a);
  const { game, win } = setup({ SceneName: 'GameScene', SelfSeatUi: { cardContainer: { cardUis: [] } } });
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': config } };
  let state = reduce(initialState(), { seq: 1, type: 'MsgGamePlayCardNtf', payload: { CardList: ids } });
  state = reduce(state, { seq: 2, type: 'PubGsCUseCard', payload: { SeatID: 1, CardID: ids[1] } });
  const meta = id => metadata(game, id);
  assert.deepEqual(ids.map(id => meta(id).name), ['杀', '火杀', '雷杀', '冰杀']);
  const rows = Object.fromEntries(deckComposition(state, 'name', meta).rows.map(row => [row.key, row]));
  assert.equal(rows['杀'].total, 4); assert.equal(rows['杀'].unseen, 3);
  assert.equal(rows['普通杀'].total, 1); assert.equal(rows['普通杀'].unseen, 1);
  assert.equal(rows['火杀'].unseen, 0);
  assert.equal(rows['普通杀'].total, rows['杀'].total - rows['火杀'].total - rows['雷杀'].total - rows['冰杀'].total);
  for (const [i, name] of ['普通杀', '火杀', '雷杀', '冰杀'].entries()) {
    assert.deepEqual(queryCards(state, { name, exactName: true }, meta), [ids[i]]);
  }
  assert.deepEqual(queryCards(state, { name: '杀', exactName: true }, meta), ids);
});

test('card face catalog uses exact resource keys and labels elemental slashes separately', () => {
  const { game, win } = setup(null);
  assert.equal(game.getCardFaceCatalog(), null);
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': {
    abbreviation: [{ Short: 'a', Long: 'id' }, { Short: 'b', Long: 'name' }, { Short: 'p', Long: 'res' }],
    GamePlayCards: { card: [
      { a: 1, b: '杀', p: 'Sha' }, { a: 2, b: '杀', p: 'Sha' }, { a: 3, b: '杀', p: 'HuoSha' },
      { a: 4, b: '测试', p: '../invalid' },
    ] },
  } } };
  const catalog = game.getCardFaceCatalog();
  assert.deepEqual(Object.fromEntries(catalog.map(({ res, label }) => [res, label])), { Sha: '杀', HuoSha: '火杀' });
  assert.equal(game.getCardFaceCatalog(), catalog);
});

test('native Seat model wins over UI layout fields; missing identity is never an array offset', () => {
  const own = { seatID: 7, Seat: { Index: 0, HandCards: [1], HandCardCount: 1, IsDead: false } };
  const target = { seatID: 1, actualSeatID: 2, Seat: { Index: 5, HandCardCount: 2, IsDead: false, HandShowCardIDs: [2, 3] } };
  const unknown = { actualSeatID: 3, fixedViewId: 4 };
  const { game } = setup({ SceneName: 'GameScene', SelfSeatUi: own, seatContainer: { seatUIs: [target, unknown, own] } });
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.selfSeatId, 0);
  assert.deepEqual(snapshot.handCardIds, [1]);
  assert.deepEqual(snapshot.seats.map(seat => seat.seatId), [5, 0]);
  assert.deepEqual(snapshot.seats[0].knownHandCardIds, [2, 3]);
  assert.equal(snapshot.seats[0].dead, false);
});

test('scene refreshes synchronously on return to hall and replacement of stage', () => {
  const old = { SceneName: 'GameScene', SelfSeatUi: {} };
  const { game, layer, win, poll } = setup(old);
  const seen = [];
  game.onSceneChange(scene => seen.push(scene));
  assert.equal(game.getScene(), old);
  const hall = { SceneName: 'HallScene' };
  layer._children = [hall];
  assert.equal(game.getScene(), hall);
  assert.equal(game.getSnapshot().inGame, false);
  const next = { SceneName: 'GameScene', SelfSeatUi: {} };
  win.Laya.stage = { _children: [{ name: 'SceneLayer', _children: [next] }] };
  poll();
  assert.deepEqual(seen, [old, hall, next]);
});

test('existing dispatcher handlers resolve scene and server proxy without creating windows', () => {
  const scene = { SceneName: 'GameScene', SelfSeatUi: {} }, proxy = { _events: {} }, manager = { CurrentScene: scene };
  const ged = { _events: { SWITCH_SCENE: { caller: manager }, HIDE_WINDOW: [{ caller: { proxy } }] } };
  const { game, win, constructed } = setup(null);
  win.Laya.stage._children.push({ ged });
  assert.equal(game.getScene(), scene);
  assert.equal(game.getServerProxy(), proxy);
  const hall = { SceneName: 'HallScene' };
  manager.CurrentScene = hall;
  assert.equal(game.getScene(), hall);
  assert.equal(constructed(), 0);
});

test('native message targets resolve registered managers and track replacement without constructing anything', () => {
  const activity = { event() {}, _events: {} };
  const proxy = { event() {}, _events: { ClientJDInfoNtf: [{ caller: { unrelated: true } }, { caller: activity }] } };
  const manager = { proxy }, ged = { _events: { HIDE_WINDOW: { caller: manager } } };
  const { game, win, constructed } = setup({ SceneName: 'HallScene' });
  win.Laya.stage._children.push({ ged });
  assert.deepEqual(game.getMessageTargets(), [{ name: 'ServerProxy', target: proxy }, { name: 'ActivityManager', target: activity }]);
  const nextActivity = { event() {}, _events: {} };
  const nextProxy = { event() {}, _events: { ClientJDInfoNtf: { caller: nextActivity } } };
  manager.proxy = nextProxy;
  assert.deepEqual(game.getMessageTargets(), [{ name: 'ServerProxy', target: nextProxy }, { name: 'ActivityManager', target: nextActivity }]);
  assert.equal(constructed(), 0);
});

test('one message-target discovery reads the current server proxy only once', () => {
  let reads = 0;
  const activity = { event() {} }, proxy = { event() {}, _events: { ClientJDInfoNtf: { caller: activity } } };
  const scene = { SceneName: 'HallScene', get proxy() { reads++; return proxy; } };
  const { game } = setup(scene);
  assert.equal(game.getMessageTargets().length, 2);
  assert.equal(reads, 1);
});

test('message target fallback reads stored singleton values without invoking lazy singleton getters', () => {
  let getterCalls = 0;
  class ServerProxy { static get Instance() { getterCalls++; throw new Error('would instantiate'); } }
  class ActivityManager { static get Instance() { getterCalls++; throw new Error('would instantiate'); } }
  const { game, constructed } = setup(null, { ServerProxy, ActivityManager });
  assert.deepEqual(game.getMessageTargets(), []);
  const proxy = { event() {} }, activity = { event() {} };
  ServerProxy.instance = proxy; ActivityManager._instance = activity;
  assert.deepEqual(game.getMessageTargets(), [{ name: 'ServerProxy', target: proxy }, { name: 'ActivityManager', target: activity }]);
  activity.destroyed = true;
  assert.deepEqual(game.getMessageTargets(), [{ name: 'ServerProxy', target: proxy }]);
  assert.equal(getterCalls, 0); assert.equal(constructed(), 0);
});

test('shared or malformed message targets are skipped and deduplicated', () => {
  const proxy = { event() {}, _events: {} };
  proxy._events.ClientJDInfoNtf = { caller: proxy };
  const { game } = setup({ SceneName: 'GameScene', proxy });
  assert.deepEqual(game.getMessageTargets(), [{ name: 'ServerProxy', target: proxy }]);
  proxy.event = null;
  assert.deepEqual(game.getMessageTargets(), []);
});

test('snapshot reads actual card paths, separates seat from layout and excludes hidden opponent cards', () => {
  const own = { seatID: 0, actualSeatID: 3, seat: { index: 0, fixedViewId: 4, HandCardCount: 2 }, cardContainer: { seat: { HandCards: [11, { CardId: 12 }] }, cardUis: [] }, countdownTimer: { RemainValue: 8.25 } };
  const opponent = { seatID: 2, actualSeatID: 1, seat: { index: 2, FixedViewId: 5, HandCount: 3, HandCards: [91, 92, 93], HandShowCards: [{ CardId: 21 }, 22] } };
  const scene = { SceneName: 'GameScene', SelfSeatUi: own, seatContainer: { seatUIs: [own, opponent] }, IsResume: true };
  const { game } = setup(scene, { GameContext: { GetModeVO: () => ({ Id: 44 }) } });
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.selfSeatId, 0);
  assert.deepEqual(snapshot.handCardIds, [11, 12]);
  assert.deepEqual(snapshot.seats[0].handCardIds, [11, 12]);
  assert.deepEqual(snapshot.seats[1].knownHandCardIds, [21, 22]);
  assert.equal(snapshot.seats[1].handCardIds, undefined);
  assert.equal(snapshot.seats[1].seatId, 2);
  assert.equal(snapshot.seats[1].viewId, 5);
  assert.equal(snapshot.isReplay, false);
  assert.equal(game.isReplay(), false);
  assert.equal(snapshot.modeId, 44);
  assert.equal(snapshot.countdownRemaining, 8.25);
  assert.equal(game.getCountdown(), 8.25);
  scene.replayBar = {};
  assert.equal(game.getSnapshot().isReplay, true);
  assert.equal(game.isReplay(scene), true);
  scene.replayBar.destroyed = true;
  assert.equal(game.isReplay(scene), false);
});

test('native poker is a live table with no ordinary slash count', () => {
  const seat = { Index: 0, GetSeatState: () => ({ Targets: [0, 1] }) };
  const self = { Seat: seat, cardContainer: { seat } };
  const { game, layer } = setup({ sceneName: 'PokerTableGameScene', SelfSeatUi: self });
  const poker = game.getSnapshot();
  assert.equal(poker.inGame, true);
  assert.equal(poker.isReplay, false);
  assert.equal(poker.pokerTable, true);
  assert.equal(game.getRemainingSlash(), null);

  layer._children = [{ sceneName: 'PokerTableGameScene' }];
  assert.equal(game.getSnapshot().inGame, true);
  assert.equal(game.getSnapshot().pokerTable, true);

  layer._children = [{ SceneName: 'DouDiZhu2023GameScene', SelfSeatUi: self }];
  assert.equal(game.getSnapshot().pokerTable, undefined);
  assert.equal(game.getRemainingSlash(), 1);
});

test('uppercase Card seeds definition provider with correct receiver and scene-scoped cache', () => {
  const definitions = { 1: { CardId: 1, CardName: '杀', FlowerOnSeat: 3, CardNumber: 7, CardType: 1 }, 2: { CardId: 2, Name: '闪', FlowerOnSeat: 2, CardNumber: 2, CardType: 1 } };
  class Card { static GetInstance(id) { assert.equal(this, Card); return definitions[id]; } }
  const card = Object.assign(new Card(), definitions[1]);
  const { game, layer } = setup({ SceneName: 'GameScene', SelfSeatUi: { cardContainer: { cardUis: [{ Card: card }] } } });
  assert.deepEqual(game.getCardMeta(2), { id: 2, name: '闪', suit: 2, number: 2, type: 1, unknown: false });
  assert.equal(game.getCardMeta(1).name, '杀');
  card.FlowerOnSeat = 1;
  assert.equal(game.getCardMeta(1).suit, 1);
  layer._children = [{ SceneName: 'GameScene', SelfSeatUi: { cardContainer: { cardUis: [] } } }];
  assert.equal(game.getCardMeta(2).unknown, true);
});

test('empty hands can resolve public card metadata without treating the config as the session deck', () => {
  const { game, win } = setup({ SceneName: 'GameScene', SelfSeatUi: { cardContainer: { cardUis: [] } } });
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': { GamePlayCards: { card: [{ id: 30401, name: '过河拆桥', color: 3, number: 4, type: 2 }] } } } };
  assert.deepEqual(game.getCardMeta(30401), { id: 30401, name: '过河拆桥', suit: 3, number: 4, type: 2, unknown: false });
  assert.deepEqual(game.getSnapshot().handCardIds, []);
  assert.equal(game.getSnapshot().CardList, undefined);
  assert.equal(game.getCardMeta(999).unknown, true);
  // Asset tables may arrive after the scene, or be replaced on a client update.
  win.CtrUtil.AllDatas['sys_playcard.sgs'].GamePlayCards.card = [{ id: 30401, name: '牌面更新', color: 2, number: 4, type: 2 }];
  assert.equal(game.getCardMeta(30401).name, '牌面更新');
});

test('definition fallback decodes declared abbreviated fields and supports SystemContext assets', () => {
  const { game, win } = setup(null);
  win.SystemContext = { allDatas: { 'sys_playcard.sgs': {
    abbreviation: [{ Short: 'a', Long: 'id' }, { Short: 'b', Long: 'name' }, { Short: 'c', Long: 'color' }],
    GamePlayCards: { card: [{ a: 101, b: '杀', c: 1, number: 7, type: 1 }] },
  } } };
  assert.deepEqual(game.getCardMeta(101), { id: 101, name: '杀', suit: 1, number: 7, type: 1, unknown: false });
});

test('native card properties retain precedence over public configuration definitions', () => {
  const card = { CardId: 101, CardName: '杀', FlowerOnSeat: 4, CardNumber: 9, CardType: 1 };
  const { game, win } = setup({ SceneName: 'GameScene', SelfSeatUi: { cardContainer: { cardUis: [{ Card: card }] } } });
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': { GamePlayCards: { card: [{ id: 101, name: '原牌面', color: 1, number: 7, type: 2 }] } } } };
  assert.deepEqual(game.getCardMeta(101), { id: 101, name: '杀', suit: 4, number: 9, type: 1, unknown: false });
});

test('deck snapshots reuse public metadata until the opening deck, scene or definition table changes', () => {
  const { game, win, layer } = setup({ SceneName: 'GameScene' });
  const deck = Object.freeze([101, 102]);
  const beforeConfig = game.getSnapshot(deck).cardMeta;
  assert.deepEqual(beforeConfig, {});
  assert.equal(game.getSnapshot(deck).cardMeta, beforeConfig);
  const table = { card: [{ id: 101, name: '杀', color: 1, number: 7, type: 1 }] };
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': { GamePlayCards: table } } };
  const initial = game.getSnapshot(deck).cardMeta;
  assert.deepEqual(initial, { 101: { suit: 1, number: 7, type: 1 } });
  assert.equal(game.getSnapshot(deck).cardMeta, initial);
  assert.equal(game.getSnapshot().cardMeta, undefined);
  table.card.push({ id: 102, name: '闪', color: 3, number: 2, type: 1 });
  const appended = game.getSnapshot(deck).cardMeta;
  assert.deepEqual(appended[102], { suit: 3, number: 2, type: 1 });
  assert.equal(game.getSnapshot(deck).cardMeta, appended);
  assert.notEqual(game.getSnapshot(Object.freeze([101, 102])).cardMeta, appended);
  const next = game.getSnapshot(deck).cardMeta;
  layer._children = [{ SceneName: 'GameScene' }];
  assert.notEqual(game.getSnapshot(deck).cardMeta, next);
});

test('deck snapshots scan the live own hand once and re-read mutable native overrides', () => {
  const providerCard = { CardId: 102, CardName: '闪', Flower: 4, CardNumber: 4, CardType: 1 };
  class Card { static GetInstance(id) { return id === 102 ? providerCard : null; } }
  const card = Object.assign(new Card(), { CardId: 101, CardName: '杀', FlowerOnSeat: 3, CardNumber: 7, CardType: 1 });
  let handReads = 0;
  const scene = { SceneName: 'GameScene', SelfSeatUi: { cardContainer: {
    seat: { HandCards: [101] }, get cardUis() { handReads++; return [{ Card: card }]; },
  } } };
  const { game, win } = setup(scene);
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': { GamePlayCards: { card: [
    { id: 101, name: '杀', color: 1, number: 6, type: 1 },
    { id: 102, name: '闪', color: 2, number: 4, type: 1 },
    { id: 103, name: '桃', color: 2, number: 5, type: 1 },
  ] } } } };
  const deck = Object.freeze([101, 102, 103, 104]);
  assert.deepEqual(game.getSnapshot(deck).cardMeta, {
    101: { suit: 3, number: 7, type: 1 }, 102: { suit: 4, number: 4, type: 1 }, 103: { suit: 2, number: 5, type: 1 },
  });
  assert.equal(handReads, 1);
  card.FlowerOnSeat = 1;
  providerCard.CardNumber = 11;
  assert.deepEqual(game.getSnapshot(deck).cardMeta, {
    101: { suit: 1, number: 7, type: 1 }, 102: { suit: 4, number: 11, type: 1 }, 103: { suit: 2, number: 5, type: 1 },
  });
  assert.equal(handReads, 2);
});

test('public metadata carries the physical slash class even when its display name is generic', () => {
  const { game, win } = setup(null);
  win.CtrUtil = { AllDatas: { 'sys_playcard.sgs': { GamePlayCards: { card: [{ id: 101, name: '杀', class: 'BingShaNCard', color: 3, number: 7, type: 1 }] } } } };
  assert.equal(game.getCardMeta(101).cardClass,'BingShaNCard');
});

test('hand UI supplies own known ids when HandCards is absent; malformed ids remain unknown', () => {
  const self = { seat: { Index: 1 }, cardContainer: { cardUis: [{ Card: { CardId: 101 } }, { Card: { CardId: 0 } }, { Card: { CardId: '102' } }] } };
  const { game } = setup({ SceneName: 'GameScene', SelfSeatUi: self, seatUIs: [self] });
  assert.deepEqual(game.getSnapshot().handCardIds, [101, 102]);
  assert.equal(game.getCardMeta(0).unknown, true);
  assert.equal(game.getCardMeta(999).unknown, true);
  assert.equal(game.getSnapshot().countdownRemaining, null);
});

test('getClass never creates an instance; inactive/destroyed children and removed subscribers are skipped', () => {
  class SelectCardWindow {}
  const { game, layer, dispose, constructed } = setup(null, { SelectCardWindow });
  assert.equal(game.getClass('SelectCardWindow'), SelectCardWindow);
  assert.equal(game.getClass('Missing'), null);
  let count = 0;
  const unsubscribe = game.onSceneChange(() => count++);
  const active = { SceneName: 'GameScene', SelfSeatUi: {} };
  layer._children = [active, { SceneName: 'GameScene', visible: false }, { SceneName: 'GameScene', destroyed: true }];
  assert.equal(game.getScene(), active);
  unsubscribe(); layer._children = []; game.getScene();
  assert.equal(count, 1);
  assert.equal(constructed(), 0);
  dispose();
});

test('scene reads are shared in one synchronous poll and fresh immediately afterward', () => {
  const first = { SceneName: 'GameScene', SelfSeatUi: {} }, next = { SceneName: 'HallScene' };
  const { game, win, layer } = setup(first);
  const stage = win.Laya.stage;
  let stageReads = 0;
  Object.defineProperty(win.Laya, 'stage', { get() { stageReads++; return stage; } });
  game.withSceneCycle(() => {
    assert.equal(game.getScene(), first);
    const reads = stageReads;
    assert.equal(game.isInGame(), true);
    assert.equal(game.getSelfSeatUI(), first.SelfSeatUi);
    assert.equal(game.canReserveViewport(), true);
    assert.equal(stageReads, reads);
    layer._children = [next];
    assert.equal(game.getScene(), first);
  });
  assert.equal(game.getScene(), next);
  assert.equal(game.isInGame(), false);
});

test('scene polling coalesces native events, looks up replacement dispatchers and releases their listeners', { timeout: 2500 }, async t => {
  const { game, win, layer } = setup({ SceneName: 'GameScene' });
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const sceneWatch = createSceneWatch({ game, scope });
  function dispatcher() {
    const handlers = new Map();
    return { handlers, _events: {}, on(type, _, fn) { handlers.set(type, fn); }, off(type, _, fn) { if (handlers.get(type) === fn) handlers.delete(type); } };
  }
  const first = dispatcher(), next = dispatcher();
  const stage = win.Laya.stage;
  stage._children.unshift({ ged: first });
  const seen = [];
  sceneWatch.watch(() => { seen.push(game.getScene()?.SceneName); }, 500, true);
  await new Promise(resolve => sceneWatch.watch(resolve, 500));
  assert.deepEqual(seen, ['GameScene']);
  layer._children = [{ SceneName: 'HallScene' }];
  stage._children[0].ged = next;
  first.handlers.get('SWITCH_SCENE')();
  first.handlers.get('HIDE_WINDOW')();
  await Promise.resolve();
  assert.deepEqual(seen, ['GameScene', 'HallScene']);
  assert.equal(first.handlers.size, 0);
  assert.equal(next.handlers.size, 2);
  next.handlers.get('HIDE_WINDOW')();
  scope.dispose();
  await Promise.resolve();
  assert.equal(next.handlers.size, 0);
  assert.equal(seen.length, 2);
});

test('missing runtime, cyclic trees and throwing optional getters stay bounded', () => {
  const { game, win, layer } = setup(null);
  layer._children = [layer];
  win.Laya.stage._children.push({ get ged() { throw new Error('unavailable'); }, get SceneName() { throw new Error('unavailable'); } });
  assert.equal(game.getScene(), null);
  win.Laya = undefined;
  assert.equal(game.getScene(), null);
  assert.deepEqual(game.getSnapshot().handCardIds, []);
  assert.equal(game.getServerProxy(), null);
});

test('wide scene trees only read child indexes within the traversal budget', () => {
  const scene = { SceneName: 'GameScene' };
  const { game, win, layer } = setup(scene);
  const wide = new Array(250_000);
  wide[3998] = layer;
  let outOfBudgetReads = 0;
  Object.defineProperty(wide, 3999, { get() { outOfBudgetReads++; } });
  win.Laya.stage._children = wide;
  assert.equal(game.getScene(), scene);
  assert.equal(outOfBudgetReads, 0);
});
