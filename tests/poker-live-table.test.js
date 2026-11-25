import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { POKER_REPLAY_ATTRIBUTE } from '../src/shared/poker-replay-mode.js';
import { canSwitchPokerLiveTable, installPokerLiveTable, openPokerLiveTable, isPokerLiveTableOpen } from '../src/plugins/poker-lobby/live/native-table.js';
import { createPokerTableState } from '../src/plugins/poker-lobby/live/table-state.js';
import { playPokerBattleStart } from '../src/plugins/poker-lobby/live/native-battle-start.js';

const SCENE = 'PokerTableGameScene';
const SIT = 'ClientSitdownRep';
const START = 'GsCModifyUserseatNtf';
const RECONNECT = 'CsClientReconnectinfoNtf';
const TABLE_INFO = 'ClientTableinfoRep';
const SNAPSHOT_ID = 201035;
const SNAPSHOT = 'decodeMsgGameSnap';
const eventName = type => type === SNAPSHOT_ID ? SNAPSHOT : type;
const OPTION = { low: 4, high: 12, unsigned: true };
const ROSTER = [{ SeatID: 0, ClientID: 200 }, { SeatID: 1, ClientID: 201 }, { SeatID: 2, ClientID: 202 }];
const POKER_ROOM = 217500077;
const CARD = { card_id: 10400, num: 0, suit: 0 };
const turn = { opt_seat: 0, opt_time: 60, opt_index: OPTION };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

class Node {
  visible = true;
  children = [];
  get _children() { return this.children; }
  get disabled() { return this.enabled === false; }
  x = 0;
  y = 0;
  graphics = { clear() {}, drawRect() {}, drawLine() {} };
  events = new Map();
  addChild(node) { this.children.push(node); node.parent = this; return node; }
  addDrawChild(node) { return this.addChild(node); }
  removeDrawChild(node) { node.destroy(); }
  size(width, height) { this.width = width; this.height = height; return this; }
  pos(x, y) { this.x = x; this.y = y; return this; }
  scale() { return this; }
  localToGlobal({ x, y }) { return { x: x + this.x, y: y + this.y }; }
  globalToLocal({ x, y }) { return { x: x - this.x, y: y - this.y }; }
  InitSkin() {}
  on(type, _, handler) { this.events.set(type, handler); }
  off(type) { this.events.delete(type); }
  destroyChildren() { for (const child of [...this.children]) child.destroy(); }
  destroy() {
    this.destroyChildren();
    this.destroyed = true;
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
  find(name) {
    return this.name === name ? this : this.children.map(node => node.find(name)).find(Boolean);
  }
  click() {
    const handler = this.events.get('click');
    if (handler) handler();
    else if (this.parent) {
      const point = this.parent.localToGlobal({ x: this.x + this.width / 2, y: this.y + this.height / 2 });
      this.parent.events.get('click')?.({ stageX: point.x, stageY: point.y });
    }
  }
}

class SeatModel {
  get IsFull() { return Boolean(this.PlayerInfo); }
  SetFigure(figure) { this.Figure = figure; }
  DrawGeneralCard(id) { this.GeneralId = id; }
}

class PokerSeatModel extends SeatModel {
  DealPoker() {}
}

class Seat extends Node {
  ScaledWidth = 150;
  ScaledHeight = 150;
  DisplayLocation = 'Top';
  SetHpVisible() {}
  General_CardChanged() {}
  otherTopManager = { optTipsTxt: this.addChild(new Node()) };
  UpdateOptTips(_type, _id, text) { this.otherTopManager.optTipsTxt.text = text; }
}

class NativeClassicTable extends Node {
  ResNames = ['game', 'zgsgame'];
  get SelfSeatUi() { return this.seatContainer?.SelfSeatUi; }
  OnStageResize() { this.size(920, 650); }
  createRightView() {}
  createSeatUIContainer() {
    const container = this.seatContainer = this.addChild(new Node().size(710, 650));
    container.seatDict = { addNumberKey() {} };
    container.LayoutSeats = () => {};
    const self = container.SelfSeatUi = container.addChild(new Seat().pos(0, 501));
    container.seatUIs = [self];
    container.createTableSeatUI = () => container.addChild(new Seat().pos(120 + 210 * container.seatUIs.length, 30));
    self.selfHeight = 149;
    self.cardContainer = self.addChild(new Node().size(650, 140));
    Object.assign(self.cardContainer, { NORMAL_Y: 510, cardUiSize: { width: 90, height: 126 },
      handCardRect: { x: 15, width: 620 }, computeHandCard: () => ({ gap: -44 }) });
    const bar = self.addChild(new Node().size(660, 80));
    bar.ButtonOk = bar.addChild(new Node().size(90, 32).pos(220, 40));
    bar.ButtonCancel = bar.addChild(new Node().size(90, 32).pos(350, 40));
    bar.txtOptMsg = bar.addChild(new Node());
    Object.defineProperty(bar, 'OperateMessage', { set(text) { this.txtOptMsg.text = text; } });
    bar.Reset = bar.initBtnLabel = () => {};
    bar.layout = () => { bar.ButtonOk.y = bar.ButtonCancel.y = 40; };
    self.getButtonBar = () => bar;
  }
}

function fixture({ nativePoker = false, hasGameContext = false, withRouter = true, activate = true, classic = true } = {}) {
  const scope = new ResourceScope();
  const layer = new Node();
  const origin = new Node();
  layer.name = 'SceneLayer';
  layer.addChild(origin);
  const requests = [];
  const leaves = [];
  const nativeRoutes = [];
  const nativeWarnings = [], rosterRequests = [];
  const notices = [];
  const stages = new Node();
  stages.size(920, 650);
  const router = { CurrentScene: origin, SwitchScene(name) { nativeRoutes.push(name); } };
  const dispatcher = { _events: withRouter ? { SWITCH_SCENE: { caller: router } } : {} };
  let mode = 175;
  let section = 2;
  let viewer = false;
  let forbidden = false;
  let warning = 'PC端未开启该模式，无法进入游戏';
  let account = '200';
  const gameContext = {
    IsLayaClassic: classic,
    GetModeType: () => mode,
    GetGroupID: () => section,
    get IsViewer() { return viewer; },
    IsViewerOrReplay: () => viewer || replay,
    get SelfSeatIndex() { return memberships.get(account)?.SeatID; },
    get SelfSeat() {
      const member = memberships.get(account);
      return member && { PlayerInfo: { ClientId: member.ClientId } };
    },
  };
  const memberships = new Map(ROSTER.map(row => [String(row.ClientID), { ClientId: row.ClientID, SeatID: row.SeatID }]));
  const listeners = new Map();
  const proxy = {
    ConnId: 9,
    ConnectedSucess1: true,
    _events: {},
    event(type, packet) {
      if (type === SIT && packet.Protocol.Result === 1) {
        room.TableId = packet.Protocol.TableID;
        mode = packet.Protocol.RealModel;
        section = packet.Protocol.GroupID;
      }
      if (type === START) room.ServerProxy_StartGame(packet);
      if (type === RECONNECT) room.ServerProxy_ReconnectionInfo(packet);
      if (type === TABLE_INFO) room.clientTableInfoRep(packet);
      for (const listener of listeners.get(type) || []) listener(packet);
    },
    M(type, data) { requests.push({ type, data }); },
    AddEventListener(type, _, listener) {
      const name = eventName(type);
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    RemoveEventListener(type, _, listener) { listeners.get(eventName(type)).delete(listener); },
  };
  const roomEvents = new Map();
  const seatModels = [];
  const room = {
    proxy, TableId: 0, IsGameStart: false, TabbleSeatInfos: { datum: [] },
    on(type, _, callback) { roomEvents.set(type, callback); },
    off(type, _, callback) { if (roomEvents.get(type) === callback) roomEvents.delete(type); },
    SendLeaveTable() { leaves.push(this.TableId); },
    GetTableSeatInfoByUserId(id) { return memberships.get(String(id)); },
    IsForbidInPC: () => forbidden,
    Ged: { ShowConfirmBtnLabel(_label, message) { nativeWarnings.push([mode, section, message]); } },
    checkIsForbidInPC() {
      if (forbidden) this.Ged.ShowConfirmBtnLabel('确定', warning, this, () => {});
      return forbidden;
    },
    createPlayerSeat(rows) {
      const Model = mode === 175 ? PokerSeatModel : SeatModel;
      for (const row of rows) {
        const model = seatModels[row.SeatID] ??= new Model();
        model.PlayerInfo = { ClientId: row.ClientID, Nickname: `玩家${row.SeatID}` };
      }
      return seatModels;
    },
    ServerProxy_ReconnectionInfo({ Protocol }) {
      mode = Protocol.TypeID;
      section = Protocol.GroupID;
      if (this.checkIsForbidInPC()) return;
      this.TableId = Protocol.TableID;
      this.IsReconnected = true;
      rosterRequests.push(this.TableId);
    },
    clientTableInfoRep({ Protocol }) {
      this.IsReconnected = false;
      if (Protocol.Result !== 1 || !Array.isArray(Protocol.Infos)) return;
      for (const row of Protocol.Infos) {
        for (const [id, old] of memberships) {
          if (old.SeatID === row.SeatID) memberships.delete(id);
        }
        memberships.set(String(row.ClientId), row);
      }
      // The real Classic handler consumes the native roster.
      this.TabbleSeatInfos.datum = [...memberships.values()].map(row => ({
        ...row, SeatPlayerInfo: { Nickname: row.SeatPlayerInfo?.Nickname || `玩家${row.SeatID}` },
      }));
      Protocol.Infos.length = 0;
      Protocol.Infos = null;
    },
    ServerProxy_StartGame({ Protocol }) {
      if (Protocol.IsGameStart) {
        this.IsGameStart = true;
        this.createPlayerSeat(Protocol.Infos);
        router.SwitchScene(mode === 175 ? SCENE : 'DouDiZhu2023GameScene');
      }
    },
  };
  for (const name of [START, RECONNECT, TABLE_INFO]) proxy._events[name] = { caller: room };
  const nativeSwitch = router.SwitchScene;
  const nativeEvent = proxy.event;
  const { window: dom } = new JSDOM();
  const { document } = dom;
  scope.add(() => dom.close());
  let replay = false;
  const ctx = {
    scope,
    document,
    window: {
      document, innerWidth: dom.innerWidth, innerHeight: dom.innerHeight,
      RES: { IsGroupLoaded: () => true, LoadGroup() {} },
      Laya: { Sprite: Node, Text: Node, Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        timer: { clear() {}, clearAll() {} }, stage: stages, Event: { CLICK: 'click', MOUSE_MOVE: 'mousemove' } },
    },
    ui: { nativeTheme: { palette: {}, surface() {}, watch() {} } },
    notify: message => notices.push(message),
    native: { account: () => ({ id: account, nickname: '我' }) },
    game: {
      getScene: () => origin,
      getDispatcher: () => dispatcher,
      getServerProxy: () => proxy,
      getClass: name => name === SCENE && nativePoker ? Node : name === 'GameContext' && hasGameContext ? gameContext
        : name === 'DouDiZhu2023GameScene' ? NativeClassicTable : null,
      isReplay: () => replay,
    },
  };
  if (activate) installPokerLiveTable(ctx);
  return {
    ctx, proxy, room, router, layer, origin, requests, nativeRoutes, nativeEvent, nativeSwitch, notices, leaves, seatModels,
    nativeWarnings, rosterRequests,
    activate: () => installPokerLiveTable(ctx),
    setAccount: next => { account = next; }, setReplay: next => {
      replay = next;
      document.documentElement.toggleAttribute(POKER_REPLAY_ATTRIBUTE, next);
    },
    setViewer: next => { viewer = next; }, setForbidden: next => { forbidden = next; },
    setWarning: next => { warning = next; },
    setMode(model, group = 2) { mode = model; section = group; },
    setSeat(id, seat) { memberships.set(String(id), { ClientId: Number(id), SeatID: seat }); },
    sit(RealModel = 175, GroupID = 2, Result = 1, TableID = 77) {
      proxy.event(SIT, { Protocol: { Id: 20504, Result, RealModel, GroupID, TableID } });
    },
    start(Infos = ROSTER) { proxy.event(START, { Protocol: { Id: 21208, IsGameStart: true, Infos } }); },
    reconnect({ TypeID = 175, GroupID = 2, TableID = 77 } = {}) {
      proxy.event(RECONNECT, { Protocol: { Id: 21114, TypeID, GroupID, TableID } });
    },
    tableInfo({ Result = 1, Type = 3, roster = ROSTER } = {}) {
      const Infos = roster.map(row => ({ ClientId: row.ClientID, SeatID: row.SeatID }));
      const Protocol = { Id: 20508, Type, Result, Count: Infos.length, Infos };
      proxy.event(TABLE_INFO, { Protocol });
      return Protocol;
    },
    signal(Id, ProtoObj) { proxy.event(eventName(Id), { Protocol: { Id, Data: { ProtoObj } } }); },
    leftTable() {
      room.TableId = 0;
      roomEvents.get('LEAVE_TABLE_EVENT')?.();
    },
    node: name => layer.find(name),
    listenerCount: () => [...listeners.values()].reduce((total, values) => total + values.size, 0),
  };
}

test('a confirmed poker start creates one scene and manual controls use the current native option', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.router.SwitchScene(SCENE);
  assert.equal(f.node(SCENE), undefined);
  f.sit();
  assert.equal(f.node(SCENE), undefined);
  f.proxy.CacheStarted = true;
  f.proxy.StopCache = () => {
    f.proxy.CacheStarted = false;
    f.signal(201000, {});
    f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true, card_ids: [CARD], card_num: 1 });
  };
  f.start();
  const table = f.node(SCENE);
  assert.ok(table, f.notices.join('\n'));
  assert.ok(table instanceof NativeClassicTable);
  assert.equal(f.origin.visible, false);
  assert.deepEqual(f.nativeRoutes, [SCENE]);
  f.start();
  assert.equal(f.node(SCENE), table);
  const play = f.node('poker-live-play');
  play.click();
  assert.deepEqual(f.requests, []);
  await tick();
  assert.equal(f.proxy.CacheStarted, false);
  f.signal(201001, { ...turn, opt_seat: 1, opt_index: { ...OPTION, low: 3 } });
  await tick();
  f.node('poker-live-card-10400').click();
  assert.equal(play.disabled, true);
  f.signal(201001, turn);
  await tick();
  f.node('poker-live-card-10400').click();
  assert.equal(play.disabled, false);
  play.click();
  play.click();
  assert.deepEqual(f.requests, [{ type: 201002, data: { opt_index: OPTION, putCards: [{ card_id: 10400, spell_num: 0, spell_suit: 0 }] } }]);
  assert.equal(play.disabled, true);
  assert.ok(f.node('poker-live-card-10400'));
  f.signal(201003, { req_msg: { opt_index: OPTION }, result_id: 3, error_msg: '请重新选择' });
  await tick();
  assert.equal(play.disabled, false);
  f.signal(201001, { ...turn, opt_index: { ...OPTION, low: 5 }, predecessor_cards: [{ card_id: 10300 }] });
  await tick();
  const pass = f.node('poker-live-pass');
  assert.equal(pass.disabled, false);
  pass.click();
  assert.equal(f.requests[1].type, 201023);
  f.signal(201004, { seat_id: 0, cards: [], card_num: 0 });
  f.signal(201005, { from_zone_info: { seat_id: 0, zone_type: 201 }, to_zone_info: { seat_id: 0, zone_type: 204 }, card_ids: [CARD], card_num: 1 });
  await tick();
  assert.equal(play.disabled, true);
  assert.equal(f.node('poker-live-card-10400'), undefined);
  f.router.SwitchScene('ModeScene');
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.equal(f.listenerCount(), 0);
});

test('unverified, ordinary, replay and already native starts leave the scene switch with the game', t => {
  for (const { nativePoker, prepare, infos } of [
    { prepare: f => f.sit(148) },
    { prepare: f => f.sit(175, 3) },
    { prepare: f => f.sit(175, 2, 4) },
    { prepare: f => { f.sit(); f.setReplay(true); } },
    { prepare: f => { f.sit(); f.setAccount('900'); } },
    { prepare: f => f.sit(), infos: [ROSTER[1], ROSTER[2], { SeatID: 3, ClientID: 303 }] },
    { prepare: f => f.sit(), nativePoker: true },
  ]) {
    const f = fixture({ nativePoker });
    t.after(() => f.ctx.scope.dispose());
    prepare(f);
    f.start(infos);
    assert.equal(f.node(SCENE), undefined);
    assert.equal(f.origin.visible, true);
    assert.equal(f.nativeRoutes.length, 1);
    assert.equal(f.listenerCount(), 0);
    assert.deepEqual(f.requests, []);
  }
});

test('a verified current poker room can reattach and disabling restores the native methods and scene', t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.room.TableId = 77;
  f.start();
  assert.ok(f.node(SCENE), f.notices.join('\n'));
  f.ctx.scope.dispose();
  assert.equal(f.router.SwitchScene, f.nativeSwitch);
  assert.equal(f.proxy.event, f.nativeEvent);
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.equal(f.listenerCount(), 0);
});

test('the classic start opens after split room replies without a sit-down acknowledgement or GameContext', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.room.TableId = 217000077;
  assert.equal(openPokerLiveTable(f.ctx, { force: true }), false);
  f.room.TableId = POKER_ROOM;
  for (const seat of ROSTER) f.tableInfo({ Type: 1, roster: [seat] });
  assert.equal(f.node(SCENE), undefined);
  assert.equal(openPokerLiveTable(f.ctx, { force: true }), false);
  f.proxy.CacheStarted = true;
  f.proxy.StopCache = () => {
    f.proxy.CacheStarted = false;
    f.signal(201000, {});
    f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true, card_ids: [CARD], card_num: 1 });
  };
  f.start();
  assert.ok(f.node(SCENE) instanceof NativeClassicTable, f.notices.join('\n'));
  assert.equal(f.origin.visible, false);
  assert.deepEqual(f.nativeRoutes, []);
  await tick();
  assert.equal(f.proxy.CacheStarted, false);
  await tick();
  assert.ok(f.node('poker-live-card-10400'));
  assert.deepEqual(f.requests, []);
});

test('manual entry uses the started native room id and verified roster when no ticket was observed', t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.tableInfo({ Type: 1 });
  f.room.IsGameStart = true;
  for (const wrong of [217000077, 317500077]) {
    f.room.TableId = wrong;
    assert.equal(canSwitchPokerLiveTable(f.ctx), false);
    assert.equal(openPokerLiveTable(f.ctx, { force: true }), false);
  }
  f.room.TableId = POKER_ROOM;
  assert.equal(canSwitchPokerLiveTable(f.ctx), true);
  assert.equal(openPokerLiveTable(f.ctx, { force: true }), true);
  assert.equal(canSwitchPokerLiveTable(f.ctx), false);
  assert.ok(f.node(SCENE) instanceof NativeClassicTable);
  assert.deepEqual(f.requests, []);
});

test('a recognised room id cannot supersede an explicit different mode or the missing self seat', t => {
  for (const prepare of [
    f => { f.sit(175, 3, 1, POKER_ROOM); },
    f => { f.room.TableId = POKER_ROOM; f.setAccount('900'); },
    f => { f.room.TableId = POKER_ROOM; f.setReplay(true); },
  ]) {
    const f = fixture();
    t.after(() => f.ctx.scope.dispose());
    prepare(f);
    f.start();
    assert.equal(f.node(SCENE), undefined);
    assert.equal(openPokerLiveTable(f.ctx, { force: true }), false);
    assert.equal(f.origin.visible, true);
    assert.deepEqual(f.requests, []);
  }
});

test('a new native connection discards old turn controls and waits for its own prompt after synchronization', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  f.signal(201000, {});
  f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true,
    card_ids: [CARD], card_num: 1 });
  f.signal(201001, turn);
  await tick();
  f.node('poker-live-card-10400').click();
  const oldPlay = f.node('poker-live-play');
  assert.equal(oldPlay.disabled, false);
  const oldTable = f.node(SCENE);
  f.proxy.ConnId++;
  f.start();
  assert.equal(oldTable.destroyed, true);
  assert.notEqual(f.node(SCENE), oldTable);
  oldPlay.click();
  assert.deepEqual(f.requests, []);
  const own = { card_id: 10900 };
  const snapshot = { base_data: { table_id: 77, model_id: 175, sec_id: 2, phase: 202, cur_player_seat: 0 },
    zone_data: [
      { from_zone_info: { zone_type: 201, seat_id: 0 }, is_all: true, card_num: 1, card_ids: [own] },
      { from_zone_info: { zone_type: 201, seat_id: 1 }, is_all: true, card_num: 1, card_ids: [CARD] },
    ] };
  f.signal(201035, snapshot);
  await tick();
  assert.ok(f.node('poker-live-card-10900'));
  assert.equal(f.node('poker-live-card-10400'), undefined);
  assert.equal(f.node('poker-live-play').disabled, true);
  const resumedOption = { ...OPTION, low: 11 };
  f.signal(201001, { ...turn, opt_index: resumedOption });
  await tick();
  f.node('poker-live-card-10900').click();
  f.node('poker-live-play').click();
  assert.deepEqual(f.requests, [{ type: 201002, data: { opt_index: resumedOption,
    putCards: [{ card_id: 10900, spell_num: 0, spell_suit: 0 }] } }]);
});

const restoredCard = { card_id: 10900 };
const resumedOption = { ...OPTION, low: 11 };

function reconnectSnapshot(base = {}) {
  return {
    base_data: { table_id: 77, model_id: 175, sec_id: 2, phase: 202, cur_player_seat: 0, ...base },
    zone_data: [
      { from_zone_info: { zone_type: 201, seat_id: 0 }, is_all: true, card_num: 1, card_ids: [restoredCard] },
      { from_zone_info: { zone_type: 201, seat_id: 1 }, is_all: true, card_num: 1, card_ids: [CARD] },
    ],
  };
}

async function attachBeforeDisconnect(f) {
  f.sit();
  f.start();
  f.signal(201000, {});
  f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true,
    card_ids: [CARD], card_num: 1 });
  f.signal(201001, turn);
  await tick();
  f.node('poker-live-card-10400').click();
  const table = f.node(SCENE);
  const play = f.node('poker-live-play');
  assert.equal(play.disabled, false);
  f.proxy.ConnId++;
  play.click();
  assert.deepEqual(f.requests, []);
  return table;
}

async function assertRestoredTable(f, oldTable) {
  await tick();
  const table = f.node(SCENE);
  assert.ok(table && table !== oldTable && oldTable.destroyed, f.notices.join('\n'));
  assert.ok(f.node('poker-live-card-10900'));
  assert.equal(f.node('poker-live-card-10400'), undefined);
  const play = f.node('poker-live-play');
  const pass = f.node('poker-live-pass');
  f.node('poker-live-card-10900').click();
  play.click();
  pass.click();
  assert.equal(play.disabled, true);
  assert.equal(pass.disabled, true);
  assert.deepEqual(f.requests, []);
  f.signal(201001, { ...turn, opt_index: resumedOption });
  await tick();
  f.node('poker-live-card-10900').click();
  f.node('poker-live-play').click();
  assert.deepEqual(f.requests, [{ type: 201002, data: { opt_index: resumedOption,
    putCards: [{ card_id: 10900, spell_num: 0, spell_suit: 0 }] } }]);
  return table;
}

test('a live snapshot restores the previously attached room after a connection change without another start', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  const oldTable = await attachBeforeDisconnect(f);
  const originalListeners = f.listenerCount();
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  const restored = await assertRestoredTable(f, oldTable);
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  await tick();
  assert.equal(f.node(SCENE), restored);
  assert.equal(f.listenerCount(), originalListeners);
  assert.deepEqual(f.nativeRoutes, []);
});

test('cached reconnect waits for a successful native roster before draining the snapshot', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  const oldTable = await attachBeforeDisconnect(f);
  f.proxy.CacheStarted = true;
  let drains = 0;
  f.proxy.StopCache = () => {
    f.proxy.CacheStarted = false;
    drains++;
    f.signal(SNAPSHOT_ID, reconnectSnapshot());
  };
  f.tableInfo();
  await tick();
  assert.equal(drains, 0, 'a roster before native reconnect proof must not release cached game packets');
  f.reconnect();
  f.tableInfo({ Result: 4 });
  await tick();
  assert.equal(drains, 0, 'failed room lookup must leave the cache alone');
  f.reconnect();
  f.tableInfo({ Type: 1 });
  await tick();
  assert.equal(drains, 0, 'ordinary table-info responses are not reconnect proof');
  f.reconnect();
  assert.equal(f.room.GetTableSeatInfoByUserId('200').SeatID, 0);
  assert.equal(f.tableInfo({ roster: [] }).Infos, null);
  await tick();
  assert.equal(drains, 0, 'a successful reply without the own row must not trust cached membership');
  f.reconnect();
  f.tableInfo({ roster: [
    { SeatID: 0, ClientID: 201 }, { SeatID: 1, ClientID: 200 }, ROSTER[2],
  ] });
  await tick();
  assert.equal(drains, 0, 'native roster must validate the previously attached account and seat');
  f.reconnect();
  assert.equal(f.tableInfo().Infos, null, 'the original room callback must still consume table info');
  await tick();
  assert.equal(drains, 1);
  await assertRestoredTable(f, oldTable);
});

test('cold login takes over on the native start without waiting for the lobby or polling', { timeout: 2000 }, async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.origin.SceneName = 'LoginScene';
  f.setMode(0, 0);
  const drained = new Promise(resolve => {
    f.proxy.CacheStarted = true;
    f.proxy.StopCache = () => {
      f.proxy.CacheStarted = false;
      f.signal(SNAPSHOT_ID, reconnectSnapshot());
      resolve();
    };
  });
  f.reconnect();
  f.tableInfo();
  assert.equal(f.node(SCENE), undefined, 'roster alone does not prove that the game started');
  f.start();
  assert.ok(f.node(SCENE), f.notices.join('\n'));
  assert.deepEqual(f.nativeRoutes, []);
  f.signal(201001, turn);
  await drained;
  await tick();
  assert.ok(f.node('poker-live-card-10900'));
  f.node('poker-live-card-10900').click();
  f.node('poker-live-play').click();
  assert.deepEqual(f.requests, []);
  assert.equal(f.node('poker-live-play').disabled, true);
  f.signal(201001, { ...turn, opt_index: resumedOption });
  await tick();
  f.node('poker-live-card-10900').click();
  f.node('poker-live-play').click();
  assert.deepEqual(f.requests, [{ type: 201002, data: { opt_index: resumedOption,
    putCards: [{ card_id: 10900, spell_num: 0, spell_suit: 0 }] } }]);
});

test('cold recovery without another start requires the current reconnect roster and rejects old commands', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.origin.SceneName = 'LoginScene';
  f.reconnect();
  f.room.IsGameStart = true;
  f.tableInfo({ Type: 1 });
  f.tableInfo({ roster: ROSTER.slice(1) });
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  assert.equal(f.node(SCENE), undefined, 'old membership cannot fill in a missing own row');
  f.tableInfo();
  const table = f.node(SCENE);
  assert.ok(table);
  f.signal(SNAPSHOT_ID, reconnectSnapshot({ table_id: 78 }));
  f.signal(201001, turn);
  await tick();
  assert.equal(f.node('poker-live-card-10900'), undefined);
  assert.equal(f.node('poker-live-play').disabled, true);
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  await tick();
  assert.ok(f.node('poker-live-card-10900'));
  assert.equal(f.node(SCENE), table);
  assert.deepEqual(f.requests, []);
});

test('the Classic PC-only warning is skipped for verified poker reconnects in either roster/start order', async t => {
  for (const startFirst of [false, true]) {
    const f = fixture({ hasGameContext: !startFirst });
    t.after(() => f.ctx.scope.dispose());
    f.origin.SceneName = 'LoginScene';
    f.setMode(0, 0);
    f.setForbidden(true);
    const nativeCheck = f.room.checkIsForbidInPC;
    const show = f.room.Ged.ShowConfirmBtnLabel;
    f.reconnect();
    assert.equal(f.room.checkIsForbidInPC, nativeCheck);
    assert.equal(f.room.Ged.ShowConfirmBtnLabel, show);
    assert.equal(f.room.IsForbidInPC(), true, 'the mode config does not change');
    assert.deepEqual(f.nativeWarnings, []);
    assert.deepEqual(f.rosterRequests, [77], 'the native handler still requests the roster');
    if (startFirst) f.start();
    assert.equal(f.node(SCENE), undefined, 'START alone cannot open an unsupported table');
    f.tableInfo();
    if (!startFirst) f.start();
    assert.ok(f.node(SCENE));
    assert.deepEqual(f.nativeRoutes, []);
    f.signal(SNAPSHOT_ID, reconnectSnapshot());
    await tick();
    assert.ok(f.node('poker-live-card-10900'));
    assert.equal(f.node('poker-live-play').disabled, true);
    assert.deepEqual(f.requests, []);
    assert.equal(f.room.checkIsForbidInPC(), true, 'normal calls keep the stock behavior');
  }
});

test('the local warning exception never turns a failed roster or a different seat into a reconnect', async t => {
  for (const reply of [{ Result: 4 }, { roster: ROSTER.slice(1) }, {
    roster: [{ SeatID: 0, ClientID: 201 }, { SeatID: 1, ClientID: 200 }, ROSTER[2]],
  }]) {
    for (const startFirst of [false, true]) {
      const f = fixture({ hasGameContext: true });
      t.after(() => f.ctx.scope.dispose());
      f.setForbidden(true);
      f.reconnect();
      if (startFirst) f.start();
      f.tableInfo(reply);
      if (!startFirst) f.start();
      f.signal(SNAPSHOT_ID, reconnectSnapshot());
      assert.equal(f.node(SCENE), undefined);
      assert.deepEqual(f.rosterRequests, [77]);
      assert.deepEqual(f.requests, []);
    }
  }
});

test('unrelated room, viewer, replay and clients without a usable PC table retain the native warning', t => {
  const cases = [
    [{}, f => f.reconnect({ TypeID: 148 })],
    [{}, f => f.reconnect({ GroupID: 3 })],
    [{}, f => { f.setViewer(true); f.reconnect(); }],
    [{}, f => { f.setReplay(true); f.reconnect(); }],
    [{}, f => { f.setAccount(''); f.reconnect(); }],
    [{}, f => { f.ctx.window.RES = null; f.reconnect(); }],
    [{ hasGameContext: false }, f => { f.setWarning('移动端未开启该模式，无法进入游戏'); f.reconnect(); }],
    [{}, f => { f.setWarning('当前牌桌不可重连'); f.reconnect(); }],
    [{ classic: false }, f => f.reconnect()],
    [{ nativePoker: true }, f => f.reconnect()],
  ];
  for (const [opts, attempt] of cases) {
    const f = fixture({ hasGameContext: true, ...opts });
    t.after(() => f.ctx.scope.dispose());
    f.setForbidden(true);
    attempt(f);
    assert.equal(f.nativeWarnings.length, 1);
    assert.deepEqual(f.rosterRequests, []);
    assert.equal(f.node(SCENE), undefined);
  }
});

test('leaving a cold-reconnected table returns through the native hall route', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.origin.SceneName = 'LoginScene';
  f.router.constructor = { JumpSceneBySmallModeType: () => f.router.SwitchScene('ModeScene') };
  f.reconnect();
  f.tableInfo();
  f.start();
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  f.signal(108023, { gamemodel: 47, label_model: 175, table_id: 77, game_results: [{ figure: 1, param1: 960 }] });
  await tick();
  assert.deepEqual(f.nativeRoutes, []);
  f.node('poker-live-leave').click();
  assert.deepEqual(f.leaves, [77]);
  f.leftTable();
  await tick();
  assert.equal(f.node(SCENE), undefined);
  assert.deepEqual(f.nativeRoutes, ['ModeScene']);
});

test('a plugin enabled while Classic is fetching the reconnect roster still receives the first snapshot', async t => {
  const f = fixture({ hasGameContext: true, activate: false });
  t.after(() => f.ctx.scope.dispose());
  f.reconnect();
  f.room.IsGameStart = true;
  f.activate();
  assert.equal(f.node(SCENE), undefined);
  f.tableInfo();
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  await tick();
  assert.ok(f.node('poker-live-card-10900'));
  assert.deepEqual(f.requests, []);
});

test('a cold reconnect roster cannot be inherited by a different connection or account', async t => {
  for (const change of [f => { f.proxy.ConnId++; }, f => f.setAccount('201')]) {
    const f = fixture({ hasGameContext: true });
    t.after(() => f.ctx.scope.dispose());
    f.reconnect();
    change(f);
    f.room.IsGameStart = true;
    f.tableInfo();
    f.signal(SNAPSHOT_ID, reconnectSnapshot());
    assert.equal(f.node(SCENE), undefined);
  }
});

test('a snapshot cannot reattach a different account, seat, table, mode, viewer, or stopped native game', async t => {
  const cases = [
    ['different account', f => f.setAccount('201')],
    ['different seat', f => f.setSeat('200', 1)],
    ['different room', f => { f.room.TableId = 78; }],
    ['different snapshot table', () => {}, { table_id: 78 }],
    ['different current mode', f => f.setMode(148)],
    ['different current group', f => f.setMode(175, 3)],
    ['different snapshot mode', () => {}, { model_id: 148 }],
    ['different snapshot group', () => {}, { sec_id: 3 }],
    ['viewer', f => f.setViewer(true)],
    ['replay', f => f.setReplay(true)],
    ['client mode forbidden', f => f.setForbidden(true)],
    ['stopped native game', f => { f.room.IsGameStart = false; }],
  ];
  for (const [description, prepare, base] of cases) {
    await t.test(description, async sub => {
      const f = fixture({ hasGameContext: true });
      sub.after(() => f.ctx.scope.dispose());
      const oldTable = await attachBeforeDisconnect(f);
      prepare(f);
      f.signal(SNAPSHOT_ID, reconnectSnapshot(base));
      f.signal(201001, { ...turn, opt_index: resumedOption });
      await tick();
      const current = f.node(SCENE);
      assert.ok(!current || current === oldTable);
      assert.equal(f.node('poker-live-card-10900'), undefined);
      f.node('poker-live-play')?.click();
      assert.deepEqual(f.requests, []);
    });
  }
});

test('snapshot without a previously attached table does not adopt an unrelated poker room', async t => {
  const f = fixture({ hasGameContext: true });
  t.after(() => f.ctx.scope.dispose());
  f.room.TableId = 77;
  f.room.IsGameStart = true;
  f.signal(SNAPSHOT_ID, reconnectSnapshot());
  await tick();
  assert.equal(f.node(SCENE), undefined);
  assert.deepEqual(f.requests, []);
});

test('the live table reserves the general draft for the stock window and connects bidding and skills', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  assert.ok(f.node(SCENE), f.notices.join('\n'));
  f.signal(201000, {});
  f.signal(201021, { phase: 101 });
  f.signal(201006, { ...turn, general_ids: [1001, 1002] });
  await tick();
  assert.equal(f.node('poker-live-option-1001'), undefined);
  assert.equal(f.node('poker-live-option-1002'), undefined);
  assert.equal(f.node('poker-live-choice-confirm'), undefined);
  assert.deepEqual(f.requests, []);
  f.signal(201013, { notify_generals: [{ seat_id: 0, generals: [{ id: 1002, skills: [1] }] }] });
  f.signal(201021, { phase: 103 });
  const bidOption = { ...OPTION, low: 8 };
  f.signal(201014, { ...turn, opt_index: bidOption });
  await tick();
  f.node('poker-live-option-1').click();
  assert.deepEqual(f.requests.at(-1), { type: 201015, data: { opt_index: bidOption, grab: 1 } });
  f.signal(201017, { seat_id: 0, grab: 1 });
  f.signal(201019, { identities: [{ seat_id: 0, identity_type: 1 }] });
  const giftCard = { card_id: 10600 };
  f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true,
    card_ids: [CARD, { card_id: 10500, wild_spell_id: 18 }, giftCard], card_num: 3 });
  f.signal(201021, { phase: 202, cur_seat_id: 0 });
  const playOption = { ...OPTION, low: 9 };
  f.signal(201001, { ...turn, opt_index: playOption });
  await tick();
  assert.ok(f.node('poker-live-skill-1'), f.notices.join('\n'));
  f.node('poker-live-skill-1').click();
  assert.equal(f.requests.length, 1);
  assert.equal(f.node('poker-live-choice-card-10600'), undefined);
  f.node('poker-live-card-10600').click();
  assert.equal(f.node('poker-live-choice-confirm').disabled, true);
  f.node('poker-live-option-1').click();
  f.node('poker-live-choice-confirm').click();
  assert.deepEqual(f.requests.at(-1), { type: 201027, data: { opt_index: playOption, spell_id: 1,
    spell_effect: 0, cards: [10600], targets: [1], putCards: [] } });
  f.signal(201028, { req_msg: { opt_index: playOption, spell_id: 1 } });
  f.signal(201005, { from_zone_info: { seat_id: 0, zone_type: 201 }, to_zone_info: { seat_id: 1, zone_type: 201 },
    card_ids: [giftCard], card_num: 1 });
  await tick();
  assert.equal(f.node('poker-live-card-10600'), undefined);
  f.node('poker-live-card-10400').click();
  f.node('poker-live-card-10500').click();
  f.node('poker-live-play').click();
  assert.equal(f.requests.length, 2);
  // Point choices may be paginated. The first page contains A and 2.
  f.node('poker-live-option-14').click();
  assert.deepEqual(f.requests.at(-1), { type: 201002, data: { opt_index: playOption,
    putCards: [{ card_id: 10400, spell_num: 0, spell_suit: 0 }, { card_id: 10500, spell_num: 0, spell_suit: 0, wild_num: 14 }] } });
});

test('a delayed reply for a different skill cannot close the current selection on the same play option', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  f.signal(201000, {});
  f.signal(201013, { notify_generals: [{ seat_id: 0, generals: [{ id: 1001, skills: [1, 8] }] }] });
  f.signal(201025, { from_zone_info: { seat_id: 0, zone_type: 201 }, is_all: true,
    card_ids: [{ card_id: 10500 }, { card_id: 10600 }], card_num: 2 });
  f.signal(201001, turn);
  await tick();

  const chooseSkill = (spell, card) => {
    f.node(`poker-live-skill-${spell}`).click();
    f.node(`poker-live-card-${card}`).click();
    f.node('poker-live-option-1').click();
    f.node('poker-live-choice-confirm').click();
  };
  const reply = (spell, result = {}) => f.signal(201028, { req_msg: { opt_index: OPTION, spell_id: spell }, ...result });
  chooseSkill(1, 10600);
  reply(1);
  await tick();
  chooseSkill(8, 10500);
  const selected = f.node('poker-live-card-10500');
  const secondRequest = f.requests.at(-1);
  assert.equal(secondRequest.data.spell_id, 8);
  assert.equal(f.node('poker-live-choice-confirm').disabled, true);

  reply(1);
  await tick();
  assert.ok(f.node('poker-live-card-10500'));
  assert.equal(f.node('poker-live-choice-confirm').disabled, true);
  reply(8, { result_id: 5, error_msg: '请选择另一名角色' });
  await tick();
  assert.equal(f.node('poker-live-status').text, '请选择另一名角色');
  assert.equal(f.node('poker-live-card-10500')?.y, selected.y);
  assert.equal(f.node('poker-live-choice-confirm').disabled, false);
  f.node('poker-live-choice-confirm').click();
  assert.deepEqual(f.requests, [
    { type: 201027, data: { opt_index: OPTION, spell_id: 1, spell_effect: 0, cards: [10600], targets: [1], putCards: [] } },
    secondRequest, secondRequest,
  ]);
});

test('the live table displays confirmed settlement and only then offers native exit', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  assert.equal(f.node('poker-live-leave'), undefined);
  f.signal(201022, {});
  await tick();
  assert.equal(f.node('poker-live-leave').disabled, true);
  f.node('poker-live-leave').click();
  assert.deepEqual(f.leaves, []);
  f.signal(108023, { gamemodel: 47, label_model: 175, game_results: [
    { figure: 1, param1: 960 },
    { seat_id: 1, figure: 3, result: 1, param1: -400 },
    { seat_id: 2, figure: 3, result: 1, param1: -400 },
  ] });
  await tick();
  for (const seat of [0, 1, 2]) assert.equal(f.node(`poker-live-seat-result-${seat}`), undefined);
  const leave = f.node('poker-live-leave');
  assert.equal(leave.disabled, false);
  leave.click();
  leave.click();
  assert.deepEqual(f.leaves, [77]);
  assert.ok(f.node(SCENE));
  f.leftTable();
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.equal(f.listenerCount(), 0);
  assert.equal(f.seatModels.length, 0);
  f.sit(148, 2, 1, 78);
  f.start();
  assert.deepEqual(f.seatModels.map(seat => seat.constructor), ROSTER.map(() => SeatModel));
  assert.deepEqual(f.nativeRoutes, ['DouDiZhu2023GameScene']);
});

test('a settled departure uses the native no-reply path when the leave response is missing', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.room.clientLeavetableRep = () => f.leftTable();
  f.sit();
  f.start();
  f.signal(108023, { gamemodel: 47, label_model: 175, game_results: [{ figure: 1, param1: 960 }] });
  t.mock.timers.tick(1);
  f.node('poker-live-leave').click();
  assert.deepEqual(f.leaves, [77]);
  assert.ok(f.node(SCENE));
  t.mock.timers.tick(5000);
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.deepEqual(f.leaves, [77]);
});

test('a settled round exits even when the result window cannot open', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.room.clientLeavetableRep = () => { throw new Error('native leave UI unavailable'); };
  f.room.ForceResetRoomState = () => f.leftTable();
  f.sit();
  f.start();
  f.signal(108023, { gamemodel: 47, label_model: 175, game_results: [{ figure: 1, result: 1, param1: -400 }] });
  t.mock.timers.tick(1);
  assert.ok(f.node(SCENE));
  t.mock.timers.tick(6001);
  assert.deepEqual(f.leaves, [77]);
  t.mock.timers.tick(5000);
  assert.equal(f.origin.visible, true);
  assert.equal(f.node(SCENE), undefined);
});

test('a transient native game-stop does not make a live table leave', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  f.room.IsGameStart = false;
  t.mock.timers.tick(500);
  f.room.IsGameStart = true;
  t.mock.timers.tick(6000);
  assert.deepEqual(f.leaves, []);
  assert.equal(f.node('poker-live-leave'), undefined);
  assert.ok(f.node(SCENE));
});

test('a native factory for a different table releases classic poker models even without a leave reply', t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  const pokerSeat = f.seatModels[0];
  assert.ok(pokerSeat instanceof PokerSeatModel);
  f.start();
  assert.equal(f.seatModels[0], pokerSeat);

  f.room.TableId = 78;
  f.setMode(148);
  f.start();
  assert.equal(f.node(SCENE), undefined);
  assert.deepEqual(f.seatModels.map(seat => seat.constructor), ROSTER.map(() => SeatModel));
  assert.deepEqual(f.nativeRoutes, ['DouDiZhu2023GameScene']);
});

test('a missing result only permits fallback exit after the game has ended', () => {
  const state = createPokerTableState({
    selfSeat: 0, seats: [0, 1, 2].map(id => ({ id, name: String(id) })),
  });
  const afterResultTimeout = { afterResultTimeout: true };
  assert.equal(state.beginLeave(afterResultTimeout), false);
  state.receive('end');
  assert.equal(state.beginLeave({ escape: true }), false);
  assert.equal(state.beginLeave(), false);
  assert.equal(state.beginLeave(afterResultTimeout), true);
  assert.equal(state.beginLeave(afterResultTimeout), false);
});

test('confirmed early escape suspends hand actions while the room is still open', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0, name: '我' }, { id: 1, name: '对手' }] });
  state.receive('hand', { cards: [{ id: 10500 }] });
  assert.equal(state.beginLeave({ escape: true }), true);
  assert.equal(state.beginLeave({ escape: true }), false);
  assert.equal(state.view().pending, true);
  assert.equal(state.toggleCard(10500), false);
  state.leaveFailed();
  assert.equal(state.toggleCard(10500), true);
});

test('live rank bounds follow public plays, recovery, and confirmed skill piles', () => {
  const state = createPokerTableState({
    selfSeat: 0, seats: [0, 1, 2].map(id => ({ id, name: String(id) })),
  });
  state.receive('start', { baseScore: 200, multiplier: 1 });
  state.receive('hand', { cards: [{ id: 10300 }], complete: true, count: 1 });
  assert.equal(state.view().remaining[3], 3);
  state.receive('played', { seat: 1, count: 1, cards: [{ id: 20300 }] });
  assert.equal(state.view().lastPlay.cards[0].id, 20300);
  assert.equal(state.view().remaining[3], 2);
  state.receive('move', { from: { zone: 204, seat: 1 }, to: { zone: 103 }, cards: [{ id: 20300 }], count: 1 });
  assert.equal(state.view().lastPlay, null);
  assert.equal(state.view().remaining[3], 2);
  state.receive('played', { seat: 2, count: 1, hidden: true, cards: [{ id: 30300 }] });
  assert.equal(state.view().remaining[3], 2);
  state.receive('move', { from: { zone: 103 }, to: { zone: 201, seat: 1 }, cards: [], count: 1 });
  assert.equal(state.view().remaining[3], 3);
  state.receive('skill-pile', { seat: 0, skill: 13, count: 1, cards: [{ id: 40300 }] });
  assert.equal(state.view().remaining[3], 2);
  state.receive('skill-pile', { seat: 0, skill: 13, count: 0, cards: [] });
  assert.equal(state.view().remaining[3], 3);
  state.receive('multiplier', { score: 300, rate: 6, reason: 4 });
  state.receive('base-rate', { rate: 2 });
  assert.equal(state.view().rate, 6);
  assert.equal(state.view().score, 300);
  assert.deepEqual(state.view().history.at(-1), { type: 'multiplier', rate: 6, reason: 4 });
});

test('the native rank animation releases its icon holds on stop or teardown and ignores late loading', async () => {
  for (const closeDuringLoad of [false, true]) {
    const scope = new ResourceScope();
    const seat = { Index: 1, PlayerInfo: { OfficerLevel: 38 } };
    const ui = { Seat: seat };
    const images = new Map(), released = [];
    const GameContext = { mode_type: 148 };
    const win = { GameContext, RES: {
      AddRuntimeImageRes() {},
      GetResByUrlPromise: url => new Promise(resolve => images.set(url, resolve)),
      ClearRuntimeImageRes: url => released.push(url),
    } };
    let stop;
    const scene = {
      SelfSeatUi: ui, seatContainer: { seatUIs: [ui] },
      GetEffectOfficerIconResBySID: (rank, big) => `${rank}/${big}`,
      onKaiZhanComplete() { assert.fail('the native callback must not clear our icon holds again'); },
      playKaiZhanOfficerRes(fallback) {
        assert.equal(fallback, true);
        assert.equal(GameContext.seats[1], seat);
        assert.equal(this.kaizhanUrl, '38/true');
        assert.equal(this.kaizhanUrl2, '38/false');
        stop = this.onKaiZhanComplete.bind(this);
      },
    };
    playPokerBattleStart(win, scope, scene, () => true);
    if (closeDuringLoad) scope.dispose();
    for (const resolve of images.values()) resolve({});
    await tick();
    assert.equal(typeof stop, closeDuringLoad ? 'undefined' : 'function');
    assert.equal(GameContext.mode_type, 148);
    stop?.();
    scope.dispose();
    stop?.();
    assert.deepEqual(released, ['38/true', '38/false']);
  }
});

test('opening roster refreshes preserve confirmed skins, including an intentional original skin', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0 }, { id: 1 }, { id: 2 }] });
  const general = (seat, id, properties = {}) => state.receive('general', { seat, general: id, ...properties });
  const skin = (seat, id, value, extra = {}) => state.receive('skin', { seat, general: id,
    skin: value, skinDynamic: Boolean(value), skinType: 2, ...extra });
  const view = seat => state.view().seats.find(row => row.id === seat);
  state.receive('start');
  general(0, 8014, { skin: 0 });
  assert.equal(view(0).skin, undefined); // local saved skin still applies
  skin(0, 8014, 0, { lookup: true });
  assert.equal(view(0).skin, undefined);
  skin(0, 14, 31209, { realGeneral: 8014 });
  skin(1, 8017, 502);
  general(1, 8017, { skin: 0 });
  general(2, 8003, { skin: 604, skinDynamic: true });
  state.receive('phase', { phase: 202 });
  general(0, 8014, { skin: 0 });
  general(1, 8017, { skin: 414 });
  general(2, 8003, { skin: 0 });
  skin(1, 8017, 0, { lookup: true });
  assert.deepEqual([view(0).skin, view(1).skin, view(2).skin], [31209, 502, 604]);
  assert.equal(view(0).skinDynamic, true);
  assert.equal(view(0).skinType, 2);
  skin(0, 8014, 0, { lookup: true });
  assert.equal(view(0).skin, 31209);
  skin(0, 8014, 0, { manual: true });
  skin(0, 8014, 31209, { lookup: true });
  general(0, 8014, { skin: 31209 });
  assert.equal(view(0).skin, 0);
  skin(1, 8017, 0, { lookup: false });
  assert.equal(view(1).skin, 0);
  general(0, 8017);
  assert.equal(view(0).skin, undefined);
});

test('live cards marked by 乱察 leave the reveal row on play or transfer', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0 }, { id: 1 }, { id: 2 }] });
  state.receive('start');
  state.receive('sync', { phase: 202, hand: [], counts: { 0: 0, 1: 2, 2: 0 } });
  state.receive('visible-hand', { seat: 1, skill: 49, cards: [{ id: 10300, position: 0 }, { id: 10400, position: 5 }] });
  const revealed = seat => state.view().seats.find(row => row.id === seat).visibleHand.map(card => card.id);
  assert.deepEqual(revealed(1), [10300, 10400]);
  state.receive('move', { from: { zone: 201, seat: 1 }, to: { zone: 201, seat: 2 }, count: 1,
    removedVisibleIds: [10400], toVisible: [{ id: 10400, position: 0 }] });
  assert.deepEqual(revealed(1), [10300]);
  assert.deepEqual(revealed(2), [10400]);
  state.receive('played', { seat: 1, cards: [{ id: 10300 }], count: 1 });
  assert.deepEqual(revealed(1), []);
  assert.equal(state.view().hand.length, 0);
});

test('already disclosed bottom cards follow the confirmed grant to the landlord', () => {
  for (const selfSeat of [0, 1]) {
    const state = createPokerTableState({ selfSeat, seats: [{ id: 0 }, { id: 1 }, { id: 2 }] });
    const cards = [10300, 20400, 30500].map(id => ({ id }));
    const visible = () => state.view().seats.find(row => row.id === 1).visibleHand.map(card => card.id);
    state.receive('start');
    state.receive('landlord', { seat: 1 });
    state.receive('bottom', { cards });
    assert.deepEqual(visible(), []);
    state.receive('move', { from: { zone: 104 }, to: { zone: 201, seat: 1 }, count: 3, cards: selfSeat === 1 ? cards : [] });
    assert.deepEqual(visible(), [10300, 20400, 30500]);
    state.receive('played', { seat: 1, cards: [cards[1]], count: 1 });
    assert.deepEqual(visible(), [10300, 30500]);
    assert.deepEqual(state.view().bottom.map(card => card.id), [10300, 20400, 30500]);
  }
});

test('a closed room releases its settled table if there is no result window', async t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.sit();
  f.start();
  f.origin.visible = true;
  assert.equal(f.origin.visible, false);
  f.signal(108023, { gamemodel: 47, label_model: 175, game_results: [{ figure: 1, grace: 800 }] });
  await tick();
  f.leftTable();
  await new Promise(resolve => setTimeout(resolve, 525));
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.deepEqual(f.leaves, []);
  assert.equal(f.listenerCount(), 0);
});

test('a single-target skill lets the user change targets before confirming', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [0, 1, 2].map(id => ({ id, name: String(id) })) });
  state.receive('skill-options', { seat: 0, name: '观星', skill: 3, kind: 'targets', optionKey: '1:3',
    local: true, targets: [1, 2], targetMin: 1, targetMax: 1, min: 0, max: 0, canCancel: true });
  assert.equal(state.view().status, '观星 · 请选择目标');
  assert.equal(state.view().decision.canConfirm, false);
  assert.equal(state.begin('choose', 1), null);
  assert.deepEqual([...state.view().decision.selectedOptions], [1]);
  assert.equal(state.view().decision.canConfirm, true);
  assert.equal(state.begin('choose', 2), null);
  assert.deepEqual(state.begin('confirm')?.value.targetSeats, [2]);
});

test('state rejects unknown cards and waits for explicit wildcard points in mixed plays', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0, name: '我' }, { id: 1, name: '邻座' }] });
  state.receive('start');
  state.receive('move', { to: { seat: 0, zone: 201 }, cards: [], count: 1 });
  state.receive('turn', { seat: 0, optionKey: 'first', actionable: true });
  assert.equal(state.view().canPlay, false);
  assert.equal(state.view().status, '等待手牌同步');
  state.receive('hand', { count: 2, complete: true, cards: [{ id: 10400 }, { id: 10500, wildSkill: 1 }] });
  assert.equal(state.toggleCard(777), false);
  state.toggleCard(10400);
  state.toggleCard(10500);
  assert.equal(state.view().canPlay, true);
  assert.equal(state.begin('play'), null);
  assert.equal(state.view().decision.options.length, 13);
  assert.equal(state.begin('choose', 16), null);
  const pending = state.begin('choose', 4);
  assert.deepEqual(pending.ids, [10400, 10500]);
  assert.deepEqual([...pending.wildRanks], [[10500, 4]]);
  state.receive('ack', { action: 'play', accepted: true });
  assert.equal(state.view().pending, true);
  state.receive('prompt-expired', { optionKey: 'first' });
  assert.equal(state.view().canPlay, false);
});

test('skill moves remove played cards and keep unresolved public counts without exposing hidden opponents', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0 }, { id: 1 }] });
  const cards = [{ id: 10400 }, { id: 20400 }];
  state.receive('played', { seat: 0, hidden: true, cards, count: 2 });
  assert.deepEqual(state.view().played[0].cards.map(card => card.id), [10400, 20400]);
  state.receive('played', { seat: 1, hidden: true, cards, count: 2 });
  assert.deepEqual(state.view().played[1].cards, []);
  assert.equal(state.view().played[1].count, 2);
  state.receive('move', { from: { zone: 204, seat: 0 }, to: { zone: 201, seat: 0 }, cards: [cards[0]], count: 1 });
  assert.deepEqual(state.view().played[0].cards.map(card => card.id), [20400]);
  assert.equal(state.view().played[0].count, 1);
  state.receive('move', { from: { zone: 204, seat: 0 }, to: { zone: 201, seat: 0 }, cards: [cards[1]], count: 1 });
  assert.deepEqual(state.view().played.map(action => action.seat), [1]);
  state.receive('move', { from: { zone: 204, seat: 1 }, to: { zone: 103 }, cards: [], count: 1 });
  assert.deepEqual(state.view().played[0], { type: 'play', seat: 1, cards: [], count: 1, pass: false, hidden: true });

  // Local replay 3d4623aabf3e, played frame 348 and return frame 361.
  state.receive('played', { seat: 0, cards: [41202, 11102, 21100, 41102].map(id => ({ id })), count: 4 });
  state.receive('move', { from: { zone: 204, seat: 0 }, to: { zone: 201, seat: 1 },
    cards: [], removedPlayedIds: [11102, 41202], count: 2 });
  const remaining = state.view().played.find(action => action.seat === 0);
  assert.equal(remaining.count, 2);
  assert.deepEqual(remaining.cards.map(card => card.id), [21100, 41102]);
});

test('opening decisions follow the current native seat and can be retried after rejection', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0 }, { id: 1 }] }, {
    general: id => ({ 1: '吕布', 2: '刘备' })[id],
  });
  const first = { seat: 0, actionable: true, optionKey: 'one' };
  state.receive('general-options', { ...first, candidates: [{ id: 1 }] });
  assert.equal(state.view().decision.options[0].label, '吕布');
  assert.equal(state.view().decision.canConfirm, false);
  state.receive('general-options', { ...first, candidates: [{ id: 2 }] });
  assert.equal(state.begin('choose', 1), null);
  assert.deepEqual(state.begin('choose', 2), { kind: 'general-preview', value: 2 });
  const choice = state.begin('confirm');
  assert.deepEqual(choice, { kind: 'general', optionKey: 'one', value: 2 });
  state.receive('phase', { phase: 101 });
  assert.equal(state.begin('confirm'), null);
  state.receive('ack', { action: 'general', optionKey: 'one', accepted: false });
  assert.ok(state.begin('confirm'));
  state.receive('general', { seat: 0, general: 2 });
  assert.equal(state.view().seats[0].general, '刘备');
  assert.equal(state.view().decision, null);
  state.receive('bid-turn', { seat: 1, actionable: false });
  assert.equal(state.view().decision, null);
  state.receive('bid-turn', { ...first, grab: true, optionKey: 'two' });
  assert.deepEqual(state.view().decision.options, [{ id: 1, label: '抢地主' }, { id: 0, label: '不抢' }]);
  assert.deepEqual(state.begin('choose', 0), { kind: 'bid', optionKey: 'two', value: false });
  state.receive('landlord', { seat: 1 });
  assert.equal(state.view().seats[1].role, 1);
  assert.equal(state.view().decision, null);
});

test('a skill selection can require both a card and a target without revealing hidden faces', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0, name: '我' }, { id: 1, name: '邻座' }] });
  state.receive('skill-state', { seat: 0, skills: [{ id: 12, enabled: true }] });
  assert.equal(state.begin('skill', 12).value, 12);
  state.receive('skill-options', { seat: 0, skill: 12, local: true, optionKey: 'skill-key',
    targets: [1], targetMin: 1, targetMax: 1, cards: [{ id: 10400, hidden: true }], min: 1, max: 1, canCancel: true });
  assert.deepEqual(state.view().decision.cards, [{ id: 10400, hidden: true }]);
  assert.equal(state.view().decision.canConfirm, false);
  state.toggleChoiceCard(10400);
  assert.equal(state.view().decision.canConfirm, false);
  assert.equal(state.begin('choose', 1), null);
  assert.equal(state.view().decision.canConfirm, true);
  assert.deepEqual(state.begin('confirm').value, { index: undefined, optionKey: 'skill-key', cardIds: [10400], targetSeats: [1] });
  state.receive('ack', { action: 'skill-choice', optionKey: 'skill-key', accepted: true });
  assert.equal(state.view().decision, null);

  state.receive('skill-options', { seat: 0, skill: 47, local: true, optionKey: 'exchange',
    min: 2, max: 2, requiredGroups: ['手牌', '权'], cards: [
      { id: 10400, choiceGroup: '手牌' }, { id: 10500, choiceGroup: '手牌' }, { id: 10600, choiceGroup: '权' },
    ] });
  state.toggleChoiceCard(10400);
  state.toggleChoiceCard(10500);
  assert.deepEqual([...state.view().decision.selected], [10500]);
  assert.equal(state.view().decision.canConfirm, false);
  state.toggleChoiceCard(10600);
  assert.equal(state.view().decision.canConfirm, true);
});

test('an own-hand prompt disables cards outside the offer and drops a departed selection', () => {
  const state = createPokerTableState({ selfSeat: 0, seats: [{ id: 0, name: '我' }] });
  state.receive('hand', { cards: [{ id: 10400 }, { id: 10500 }, { id: 10600 }] });
  state.receive('skill-options', { seat: 0, name: '丰姿', skill: 42, local: true, optionKey: 'position',
    fromHand: true, copyCard: true, cards: [{ id: 10400 }, { id: 10600 }], min: 1, max: 1 });
  assert.equal(state.toggleChoiceCard(10500), false);
  assert.equal(state.toggleChoiceCard(10400), true);
  assert.equal(state.view().decision.canConfirm, true);
  state.receive('hand', { cards: [{ id: 10500 }, { id: 10600 }] });
  assert.equal(state.view().decision.canConfirm, false);
  assert.equal(state.toggleChoiceCard(10400), false);
  assert.equal(state.toggleChoiceCard(10600), true);
  assert.deepEqual(state.begin('confirm').value.cardIds, [10600]);
});


test('a started poker room opens the tool table without a scene switch', t => {
  const f = fixture({ withRouter: false });
  t.after(() => f.ctx.scope.dispose());
  f.tableInfo();
  f.sit();
  f.start();
  assert.equal(f.node(SCENE), undefined);
  assert.equal(openPokerLiveTable(f.ctx), true);
  assert.ok(f.node(SCENE), f.notices.join('\n'));
  assert.equal(f.origin.visible, false);
});

test('manual table switch opens before the game starts once the seat is known', t => {
  const f = fixture({ withRouter: false });
  t.after(() => f.ctx.scope.dispose());
  f.tableInfo();
  f.sit();
  assert.equal(f.room.IsGameStart, false);
  assert.equal(openPokerLiveTable(f.ctx), false);
  assert.equal(openPokerLiveTable(f.ctx, { force: true }), true);
  assert.ok(f.node(SCENE), f.notices.join('\n'));
  assert.equal(isPokerLiveTableOpen(f.ctx), true);
});

test('leaving while native assets load cannot replace the next scene', t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  const listeners = new Map();
  Object.assign(f.ctx.window.RES, {
    IsGroupLoaded: () => false,
    AddEventListener(type, _, listener) { listeners.set(type, listener); },
    RemoveEventListener(type, _, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  });
  f.sit();
  f.start();
  assert.equal(isPokerLiveTableOpen(f.ctx), false);
  assert.equal(openPokerLiveTable(f.ctx), true);
  assert.equal(f.origin.visible, true);
  const loaded = listeners.get('groupComplete');
  assert.equal(typeof loaded, 'function');
  f.router.SwitchScene('ModeScene');
  assert.equal(listeners.size, 0);
  loaded({ groupName: 'game' });
  loaded({ groupName: 'zgsgame' });
  assert.equal(f.node(SCENE), undefined);
  assert.equal(f.origin.visible, true);
  assert.equal(f.listenerCount(), 0);
  assert.deepEqual(f.requests, []);
});

test('a missing classic scene keeps the original view and releases poker listeners', t => {
  const f = fixture();
  t.after(() => f.ctx.scope.dispose());
  f.ctx.game.getClass = () => null;
  f.sit();
  f.start();
  assert.equal(f.origin.visible, true);
  assert.equal(f.node(SCENE), undefined);
  assert.equal(isPokerLiveTableOpen(f.ctx), false);
  assert.match(f.notices[0], /没有可用的原生斗地主牌桌/);
  assert.equal(f.listenerCount(), 0);
  assert.deepEqual(f.requests, []);
});
