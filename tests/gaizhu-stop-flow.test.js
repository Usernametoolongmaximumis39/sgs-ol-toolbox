import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ResourceScope } from '../src/core/resources.js';
import { createPluginNative } from '../src/core/plugin-native.js';
import { createGaiZhu } from '../src/plugins/gaizhu/runtime.js';
import { attachRoomSettings, RoomSettingsWindow } from './fixtures/gaizhu-room.js';

const ids = [171114, 171115, 171116];

function setup(t, autoMode = 'identity') {
  const scope = new ResourceScope(), handlers = new Map(), requests = [], stored = new Map();
  t.after(() => scope.dispose());
  let now = 100000, clientId = 41, scene, proxy;
  const room = {
    name: 'TableScene',
    _children: [],
    seatListView: { seatList: [{ waitInfo: { clientId, isMaster: true } }, { waitInfo: { clientId: 101, isAi: true } }] },
    startUI: { startBtn: { visible: true, onClick() { requests.push('start'); } } },
  };
  attachRoomSettings(room);
  const game = {
    name: 'GameScene', _children: [],
    SelfSeatUi: { seat: { IsAiControl: false }, buttonBar: { visible: false, btns: [] } },
  };
  const baseProxy = {
    on(event, caller, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
    },
    off(event, caller, fn) { handlers.get(event)?.delete(fn); },
  };
  proxy = baseProxy;
  const classes = {
    CreateTableWindow: RoomSettingsWindow,
    GameContext: { GetModeVO: () => autoMode === 'training' ? { ModeID: 160, Section: 3 } : { ModeID: 74, RuleTypeID: 1 } },
    TimerManager: { LocalServerTime: 1794952800 },
    WelfareManger: {
      CurPubCommonVo: { Round: 7, NewDayQuestId1: ids[0], NewDayQuestId2: ids[1], NewWeekQuestId: ids[2] },
      ReqJgqyInfo() { requests.push('tavern-info'); },
    },
    ActivityQuestManager: {
      GetServerTaskDataByTaskID() { return null; },
      UpTaskState(tasks) { requests.push(['tavern-progress', ...tasks]); },
    },
  };
  const window = { Laya: { stage: { _children: [] } } };
  const ctx = {
    now: () => now, scope, window, document: { querySelector: () => null },
    settings: { get: (key, fallback) => stored.get(key) ?? fallback, set: (key, value) => stored.set(key, value) },
    game: {
      getSelf: () => ({ ClientId: clientId, NickName: '演练' }),
      getClass: name => classes[name],
      getServerProxy: () => proxy,
      getScene: () => scene,
      getSnapshot: () => ({ isReplay: false }),
      getConfigData: () => null,
    },
  };
  function place(next) {
    scene = next;
    window.Laya.stage._children = [next];
  }
  place(autoMode === 'training' ? game : room);
  ctx.native = createPluginNative(ctx);
  const controller = createGaiZhu(ctx);
  function emit(type, packet = {}) {
    for (const fn of [...(handlers.get(type) ?? [])]) fn(packet);
  }
  const data = (type, value) => emit(type, { Protocol: { Data: { ProtoObj: value } } });
  return {
    controller, room, game, requests, stored, place, emit,
    start(settings) { controller.setOptions({ autoMode, role: 'auto', ...settings }); },
    tick(ms = 250) { now += ms; controller.tick(); },
    syncTavern(claimed = 0) {
      data('decodeClientTavernInfoRep', { tavern_info: { round_id: 7 } });
      this.tick();
      data('decodeUserQuestInfoRep', { info: ids.map((id, index) => ({ quest_id: id, rewarded: index < claimed, complete_cnt: 0 })) });
      this.tick();
    },
    claim(id) { data('decodeUserQuestOpRep', { quest_id: id, op_type: 1, result: 0 }); },
    changeAccount() { clientId++; },
    reconnect() { proxy = { ...baseProxy }; },
  };
}

test('gaizhu: an already claimed tavern startup leaves no gameplay or room request', t => {
  const f = setup(t);
  f.start({ stopMode: 'tavern' });
  assert.deepEqual(f.requests, ['tavern-info']);
  assert.match(f.controller.snapshot().stopStatus, /待同步/);
  f.syncTavern(3);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().status, /已领齐/);
  f.tick(60000);
  assert.deepEqual(f.requests, ['tavern-info', ['tavern-progress', ...ids]]);
});

test('gaizhu: a final tavern claim during training settlement prevents any request for another round', async t => {
  const f = setup(t, 'training');
  f.start({ stopMode: 'tavern' });
  f.syncTavern(2);
  assert.equal(f.controller.snapshot().role, 'auto');
  f.emit('MsgGameOver');
  await delay(10);
  assert.equal(f.controller.snapshot().rounds, 1);
  const result = { name: 'RogueLike1v1ZhanJiWindow',
    onClickAgain() { f.requests.push('again'); },
    onClickClose() { f.requests.push('close-result'); },
  };
  f.game._children = [result];
  f.claim(ids[2]);
  f.tick(1500);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().status, /已领齐/);
  f.tick(90000);
  assert.equal(f.requests.filter(request => request === 'close-result').length, 1);
  assert.equal(f.requests.includes('again'), false);
});

test('gaizhu: timed cutoff during a live round allows accounting and never starts again', async t => {
  const f = setup(t);
  f.start({ stopMode: 'timed', stopHours: 0.001 });
  assert.equal(f.controller.snapshot().deadline, 103600);
  assert.ok(f.requests.includes('start'));
  f.place(f.game);
  f.tick(1000);
  f.tick(2600);
  assert.equal(f.controller.snapshot().role, 'auto');
  assert.equal(f.controller.snapshot().stopAfterRound, true);
  const starts = f.requests.filter(request => request === 'start').length;
  f.game._children = [{ text: '点击空白处继续', onClick() { f.requests.push('close-result'); f.place(f.room); } }];
  f.emit('MsgGameOver');
  await delay(10);
  assert.equal(f.controller.snapshot().rounds, 1);
  f.tick(5000);
  f.tick(5000);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().status, /定时已到/);
  assert.equal(f.requests.filter(request => request === 'close-result').length, 1);
  assert.equal(f.requests.filter(request => request === 'start').length, starts);
  assert.equal(f.controller.snapshot().deadline, 0);
});

test('gaizhu: a pending tavern startup cannot survive an account change or a disconnected proxy', t => {
  for (const interrupt of ['changeAccount', 'reconnect']) {
    const f = setup(t);
    f.start({ stopMode: 'tavern' });
    f[interrupt]();
    f.tick();
    f.syncTavern(0);
    assert.equal(f.controller.snapshot().role, 'off');
    assert.deepEqual(f.requests, ['tavern-info']);
    const saved = f.stored.get('account:41:options-v1');
    assert.equal(saved.stopMode, 'tavern');
    assert.equal(saved.deadline, undefined);
    assert.equal(saved.role, undefined);
  }
});
