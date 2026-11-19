import assert from 'node:assert/strict';
import test from 'node:test';
import { createLobbyEntry, isLobbyEntry } from '../src/plugins/gaizhu/lobby.js';
import { createNationRun, isNationGame, isNationRoom } from '../src/plugins/gaizhu/nation.js';
import { createNative } from '../src/plugins/gaizhu/native.js';

const identity = { ModeID: 74, RuleTypeID: 1, Section: 4 };
const nation = { ModeID: 28, RuleTypeID: 5, Section: 4 };
const oldFriend = { ...nation, Section: 11 };
const training = { ModeID: 160, RuleTypeID: 37, Section: 3 };
const roomSeat = info => ({ WaitInfo: { ClientId: 42, IsReady: true, ...info } });
const button = fn => ({ visible: true, onClick: fn });

function setup() {
  const operations = [];
  const state = { mode: { ModeID: 84, RuleTypeID: 7, Section: 4 }, window: null, self: { ClientId: 42 }, scene: null };
  const ctx = {
    scope: { signal: new AbortController().signal },
    game: {
      getSelf: () => state.self, getScene: () => state.scene, getServerProxy: () => ({}),
      getClass: name => name === 'GameContext' ? { GetModeVO: () => state.mode, GetGroupID: () => state.mode.Section } : null,
      getDispatcher: () => ({ SwitchScene: name => operations.push(['switch', name]) }),
    },
  };
  const native = {
    matching(regex) { return state.window && regex.test(state.window.name) ? [state.window] : []; },
    openAi() { operations.push(['ai']); return true; },
    confirmAi() { operations.push(['ai-confirm']); return true; },
  };
  function frame(name, scene, extras = {}) { state.scene = scene; return { name, scene, game: false, ...extras }; }
  function hall(view) {
    const scene = { roomListView: view, gotoUI(mode, section) {
      operations.push(['mode', mode, section]);
      state.mode = mode === 74 ? identity : nation;
      Object.assign(view, { modeId: state.mode.ModeID, groupId: state.mode.Section });
    } };
    return frame('HallScene', scene);
  }
  function room(password, rc = {}, seats = [roomSeat()]) {
    return frame('TableScene', { startUI: { rc: { MasterIsSelf: true, TableSetting: { TableID: 106, Password: password }, ...rc } },
      seatListView: { seatList: seats } });
  }
  return { ctx, native, state, operations, frame, hall, room };
}

test('identity lobby submits one native military-practice creation and validates the corresponding owned room', () => {
  const { ctx, native, state, operations, hall, room } = setup();
  const win = { name: 'CreateTableWindow', isCreate: true, curModeVo: identity, passwordInput: {}, cardBuildBox: { selected: true },
    dianJiangBox: { selected: true }, showMoreHandler() { this.modeBox = { _labels: ['随机身份', '自选身份'] }; },
    sureBtn: button(() => operations.push(['create', win.modeBox.selectedIndex, win.passwordInput.text])) };
  const lobby = hall({ modeId: 84, groupId: 4, createRoomBtn: button(() => { state.window = win; operations.push(['open']); }) });
  const entry = createLobbyEntry(ctx, native, 'identity');
  entry.step(lobby); entry.step(lobby); entry.step(lobby); entry.step(lobby);
  assert.deepEqual(operations, [['mode', 74, 4], ['open'], ['create', 1, entry.password]]);
  assert.match(entry.password, /^\d{4}$/);
  assert.equal(win.cardBuildBox.selected, false);
  assert.equal(win.dianJiangBox.selected, false);
  assert.throws(() => entry.step(room('0000')), /与本次建房请求不符/, 'unrelated user-created room cannot acknowledge a request');
  assert.throws(() => entry.step(room(entry.password, { MasterIsSelf: false })), /与本次建房请求不符/);
  assert.equal(entry.step(room(entry.password, {}, [roomSeat({ ClientId: 47 })])), undefined);
  const target = room(entry.password);
  assert.deepEqual(entry.step(target), { ready: true, roomNumber: '106', scene: target.scene });
  entry.cancel();
  assert.equal(entry.step(target), undefined);
});

test('mode menu uses the registered native scene manager to choose the room-list mode', () => {
  const { ctx, native, operations, frame } = setup();
  const sceneManager = { SwitchSceneByModeId(mode, section) { operations.push(['mode', mode, section]); } };
  ctx.game.getDispatcher = () => ({ _events: { SWITCH_SCENE: { caller: sceneManager } },
    SwitchScene: name => operations.push(['switch', name]) });
  const initial = frame('ModeScene', {});
  const identityEntry = createLobbyEntry(ctx, native, 'identity');
  identityEntry.step(initial); identityEntry.step(initial);
  assert.deepEqual(operations, [['mode', 74, 4], ['switch', 'HallScene']]);
  const countryEntry = createLobbyEntry(ctx, native, 'nation');
  countryEntry.step(initial);
  assert.deepEqual(operations.slice(2), [['mode', 28, 4], ['switch', 'HallScene']]);
});

function nationWindow(fixture) {
  const { state, operations } = fixture;
  let registered;
  const manager = {
    off(type, owner, fn) { if (type === 'PAGE_JOIN_SUCCESS' && registered === fn) registered = null; },
    on(type, owner, fn) { if (type === 'PAGE_JOIN_SUCCESS') registered = fn; },
  };
  const win = { name: 'CreatOFRoomWindow', modeVO: oldFriend, manager,
    sureCreate() {
      if (state.mode.Section === oldFriend.Section) { manager.off('PAGE_JOIN_SUCCESS', this, this.onEnterPage); operations.push(['create-nation']); }
      else { this.isSendEnter = true; manager.on('PAGE_JOIN_SUCCESS', this, this.onEnterPage); operations.push(['enter-old-friend']); }
    },
    onEnterPage() { this.isSendEnter = false; this.sureCreate(); },
  };
  return { win, get joined() { return registered; } };
}

test('nation lobby uses the current old-friend control and submits after a matching native page reply', () => {
  const fixture = setup();
  const { ctx, native, state, operations, hall, room } = fixture;
  const existing = nationWindow(fixture);
  const lobby = hall({ modeId: 84, groupId: 4, createOFRoomBtn: button(() => { state.window = existing.win; }) });
  const entry = createLobbyEntry(ctx, native, 'nation');
  entry.step(lobby); entry.step(lobby); entry.step(lobby);
  assert.deepEqual(operations, [['mode', 28, 4], ['enter-old-friend']]);
  const { joined } = existing;
  state.mode = oldFriend;
  joined();
  assert.deepEqual(operations.at(-1), ['create-nation']);
  assert.equal(existing.joined, null);
  const target = room('');
  assert.deepEqual(entry.step(target), { ready: true, roomNumber: '106', scene: target.scene });
});

test('cancel, account change and a wrong old-friend page stop delayed native creation', () => {
  for (const outcome of ['cancelled', 'account changed', 'wrong page']) {
    const fixture = setup();
    const { ctx, native, state, operations, hall } = fixture;
    const existing = nationWindow(fixture);
    const lobby = hall({ modeId: 84, groupId: 4, createOFRoomBtn: button(() => { state.window = existing.win; }) });
    const entry = createLobbyEntry(ctx, native, 'nation');
    entry.step(lobby); entry.step(lobby); entry.step(lobby);
    const { joined } = existing;
    if (outcome !== 'wrong page') state.mode = oldFriend;
    if (outcome === 'cancelled') entry.cancel();
    if (outcome === 'account changed') state.self.ClientId = 66;
    joined();
    assert.equal(existing.joined, null);
    assert.equal(existing.win.isSendEnter, false);
    assert.equal(operations.some(op => op[0] === 'create-nation'), false, outcome);
  }
});

test('training lobby uses the robot control only and awaits native solo training mode', () => {
  const { ctx, native, state, operations, hall, frame } = setup();
  const entry = createLobbyEntry(ctx, native, 'training');
  const lobby = hall({});
  entry.step(lobby); entry.step(lobby);
  const next = frame('RogueLike1v1Scene', { btnList: [
    { name: 'match', ...button(() => operations.push(['match'])) },
    { name: 'zgs_robot_tex', ...button(() => operations.push(['robot'])) },
  ] });
  assert.equal(isLobbyEntry(next, 'identity'), false);
  assert.equal(isLobbyEntry(next, 'nation'), false);
  assert.equal(isLobbyEntry(next, 'training'), true);
  entry.step(next); entry.step(next);
  const battle = frame('RogueLike1v1GameScene', {}, { game: true });
  state.mode = { ...training, Section: 2 };
  assert.equal(entry.step(battle), undefined);
  state.mode = training;
  assert.deepEqual(entry.step(battle), { ready: true });
  assert.deepEqual(operations, [['switch', 'RogueLike1v1Scene'], ['robot']]);
});

test('lobby stop clears its deferred native match-reminder callback', () => {
  const { ctx, native, operations, frame } = setup();
  const gate = { CheckAddRoom(callback) { this.stillAddRoomCallBack = callback; }, stillAddRoomCallBackParams: {} };
  ctx.game.getServerProxy = () => ({ _events: { ClientMyMatchIdRep: { caller: gate } } });
  const entry = createLobbyEntry(ctx, native, 'training');
  const trainingLobby = frame('RogueLike1v1Scene', { btnList: [{ name: 'zgs_robot_tex',
    ...button(() => gate.CheckAddRoom(() => operations.push(['robot']))) }] });
  entry.step(trainingLobby);
  const late = gate.stillAddRoomCallBack;
  assert.equal(typeof late, 'function');
  entry.cancel();
  assert.equal(gate.stillAddRoomCallBack, null);
  late();
  assert.deepEqual(operations, []);
});

test('nation automates an owned room, confirms ordinary robots before start and resets for the next round', () => {
  const { ctx, native, state, operations, room } = setup();
  state.mode = oldFriend;
  const entry = createNationRun(ctx, native);
  const empty = {};
  const target = room('', {}, [roomSeat(), empty]);
  target.scene.startUI.startBtn = button(() => { operations.push(['start']); });
  assert.equal(isNationRoom(ctx), true);
  assert.equal(isNationGame(ctx, target), false);
  entry.room(target, 0); entry.room(target, 20); entry.room(target, 30);
  empty.WaitInfo = { ClientId: 4000100000 };
  entry.room(target, 50); entry.room(target, 150);
  assert.deepEqual(operations, [['ai'], ['ai-confirm'], ['start']]);
  entry.reset('room');
  entry.room(target, 200);
  assert.deepEqual(operations.at(-1), ['start']);
  state.mode = { ...identity, ModeID: 22 };
  assert.equal(isNationRoom(ctx), false);
  entry.room(target, 2500);
  assert.equal(operations.length, 4);
});

test('nation selects a legal main/deputy pair via native controls and advances battle through the assistant', () => {
  const { ctx, native, state, frame, operations } = setup();
  state.mode = oldFriend;
  const entry = createNationRun(ctx, native);
  const picks = [{ id: 1, country: 1 }, { id: 2, country: 2 }, { id: 3, country: 1 }];
  const active = frame('GameScene', {}, { game: true, self: {} });
  state.window = { name: 'SelectCountryWarGeneralWindow', zhuGeneralCardUI: {}, fuGeneralCardUI: {}, confirmBtn: {},
    generalUis: picks.map(({ id, country }) => ({ CanSelect: true, Card: { CardId: id, Country: country } })),
    onClickGeneralCard(card) {
      const slot = this.zhuGeneralCardUI.Card ? this.fuGeneralCardUI : this.zhuGeneralCardUI;
      slot.Card = card.Card;
      operations.push(['select', card.Card.CardId]);
    },
    confirmBtnEvent() { operations.push(['confirm-pair']); },
  };
  entry.game(active, 0); entry.game(active, 200); entry.game(active, 1000); entry.game(active, 1100); entry.game(active, 3000);
  assert.deepEqual(operations, [['select', 1], ['select', 3], ['confirm-pair']]);
  state.window = null;
  const decision = { run(frameArg, at) { operations.push(['assistant', frameArg.self, at]); return true; }, mode: () => 'ai', reason: () => '' };
  assert.equal(entry.game(active, 3200, decision), '国战：正在执行小杀助手提示');
  assert.deepEqual(operations.at(-1), ['assistant', active.self, 3200]);
});

test('nation settlement processes each native window once without creating or starting a room', () => {
  const { ctx, native, state, operations } = setup();
  const entry = createNationRun(ctx, native);
  const gameResult = {};
  state.window = { name: 'GameResultWindow', gameResult, laterClose() { operations.push(['result']); } };
  assert.equal(entry.settlement(), true);
  assert.equal(entry.settlement(), false);
  state.window = { name: 'GameMvpWindow', gameResult, laterClose() { operations.push(['mvp']); } };
  assert.equal(entry.settlement(), true);
  assert.equal(entry.settlement(), false);
  state.window = null;
  assert.equal(entry.settlement(), false);
  assert.deepEqual(operations, [['result'], ['mvp']]);
});

test('graceful stop processes mounted settlement UI and disables fallback canvas clicks', () => {
  const { ctx, state, frame, operations } = setup();
  const win = { name: 'GameResultWindow', gameResult: {}, laterClose() { operations.push(['result']); } };
  const canvas = { getBoundingClientRect: () => ({ width: 100, height: 200, left: 0, top: 0 }),
    dispatchEvent: e => operations.push(['canvas', e.type]) };
  ctx.document = { querySelector: () => canvas };
  ctx.window = { MouseEvent: Event };
  const native = createNative(ctx);
  frame('GameScene', { _children: [win] }, { game: true });
  native.frame();
  assert.equal(native.continueResult({ allowCanvas: false }), true);
  state.scene._children = [{ label: '点击继续下一局', onClick() { operations.push(['next']); } }];
  native.frame();
  assert.equal(native.continueResult({ allowCanvas: false }), false);
  assert.deepEqual(operations, [['result']]);
});
