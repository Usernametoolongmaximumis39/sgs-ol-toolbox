import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { readPokerGeneralPage } from '../src/plugins/poker-lobby/general-stats.js';
import { createNativeLobby, STOCK_SCENE } from '../src/plugins/poker-lobby/native-lobby.js';
import { openPokerRankWindow, openPokerStatsWindow, POKER_STATS_WINDOW } from '../src/plugins/poker-lobby/native-windows.js';
import { installPokerHistory, POKER_HISTORY_TAB } from '../src/plugins/poker-lobby/native-history.js';
import { bindPokerPoolPreview } from '../src/plugins/poker-lobby/native-pool.js';

class NativeNode {
  Init() {}
  size(width, height) { this.width = width; this.height = height; }
  addClick() {}
  addMouseMoveEvent() {}
  destroy() { this.destroyed = true; }
}

class WindowFrame extends NativeNode {
  enterWindow() {}
  Close() { this.destroy(); }
}

test('uses poker skills in the native pool tooltip and releases the pooled item bindings', () => {
  const ordinarySkill = { Name: '铁骑' };
  const pokerSkill = { Name: '好施', GetSkillSimpleDescribe: () => '扑克规则' };
  const ordinaryCard = { Skills: [ordinarySkill] };
  const GeneralCard = class { static GetInstance() { return ordinaryCard; } };
  const stockLookup = GeneralCard.GetInstance;
  const scope = new ResourceScope();
  const button = {
    set ToolTip(value) { this.toolTip = value; if (!value) this.cleared = true; },
    get ToolTip() { return this.toolTip; },
  };
  let shouldThrow = false, available = true;
  const item = {
    generalInfo: { Id: 33, ItemID: 8033 },
    refreshData() { if (this.topSp) this.topSp.ToolTip = this.showGeneralTipHandler.bind(this, this.generalInfo); },
    showGeneralTipHandler(info) {
      if (shouldThrow) throw new Error('native tooltip error');
      assert.equal(GeneralCard.GetInstance(1), ordinaryCard);
      assert.equal(GeneralCard.GetInstance(info.ItemID, true), ordinaryCard);
      const skills = GeneralCard.GetInstance(info.ItemID).Skills;
      return { skills, nativeOwnedText: '已开通', nativeGrade: 3 };
    },
  };
  const stockRefresh = item.refreshData;
  const release = bindPokerPoolPreview(scope, item, GeneralCard, info => available && info.Id === 33 ? [pokerSkill] : []);
  const assertTip = skills => assert.deepEqual(button.ToolTip(), { skills, nativeOwnedText: '已开通', nativeGrade: 3 });
  item.topSp = button;
  item.refreshData();
  assertTip([pokerSkill]);
  item.refreshData();
  assertTip([pokerSkill]);
  available = false;
  assertTip([]);
  shouldThrow = true;
  assert.throws(() => button.ToolTip(), /native tooltip error/);
  assert.equal(GeneralCard.GetInstance, stockLookup);
  assert.deepEqual(ordinaryCard.Skills, [ordinarySkill]);

  shouldThrow = false;
  release();
  assert.equal(item.refreshData, stockRefresh);
  assert.equal(button.cleared, true);
  assertTip([ordinarySkill]);
  item.refreshData();
  assertTip([ordinarySkill]);
  assert.deepEqual(scope.dispose(), []);
});

class NativeWindow extends WindowFrame {
  PAGE_COMPOSITE = 0;
  PAGE_GENERAL = 2;
  Init() { this.usedStockFrame = true; }
  enterWindow() { assert.fail('would query stock highlight mode'); }

  updateViewStack() {
    const map = this.classMap, views = new Map();
    this.viewStack = {
      childList: ['UserInfoDDZView2025', 'UserInfoStatsView2025', 'UserInfoDDZGenWinView2025', 'DDZHighlightChr'],
      childInitDataList: [[this.modeType, this.userData], this.userData, [this.modeType, this.userData], this.userData],
      select(index) {
        if (!views.has(index)) {
          const view = new map[this.childList[index]](this.childInitDataList[index]);
          view.Init();
          views.set(index, view);
        }
        return views.get(index);
      },
      Clear() { for (const view of views.values()) view.destroy(); views.clear(); },
    };
  }
  createTabBtn() {
    assert.equal(this.modeType, 3);
    this.updateViewStack();
    this.tabs = [this.PAGE_COMPOSITE, this.PAGE_GENERAL];
    this.overview = this.viewStack.select(this.PAGE_COMPOSITE);
  }
  destroy() { assert.fail('would reset ordinary landlord state'); }
}

class NativeOverview extends NativeNode {
  Init() { assert.fail('would subscribe to ordinary landlord stats'); }
  initUI() {
    for (const name of ['hundredWinsValue', 'lordWinsValue', 'farmerWinsValue', 'legendLordValue',
      'totalSessionValue', 'weekMaxValue', 'totalCountValue', 'maxStreakValue']) this[name] = {};
    Object.assign(this.maxStreakValue, { Gap: -12, size(...dimensions) { this.dimensions = dimensions; } });
  }
  setHundredWins() {}
  destroy() { assert.fail('would access ordinary landlord manager'); }
}

class NativeGeneral extends NativeNode {
  constructor() { super(); assert.fail('would request unscoped stock initial page'); }
  initUI() { this.resultPool = {}; this.emptyTxt = { text: '暂无数据' }; this.emptyBg = {}; }
  createRadioGroup(roles, index) { this.radioBtn = { roles, SelectedValue: roles[index].value, Clear() {} }; }
  sortBtnClick(sortType) {
    if (this.sortType === sortType) this.rankDesc = !this.rankDesc;
    else { this.sortType = sortType; this.rankDesc = false; }
    this.sendResult();
  }
  updateMyResult(total, rankDesc, rows) { this.nativeRows = rows; this.allPage = Math.ceil(total / this.maxNum); this.shownSort = rankDesc; }
  clearItemUI() { this.nativeRows = []; }
  updateSotrType() {}
  onNextClick() { if (this.curPage < this.allPage) { this.curPage++; this.sendResult(); } }
}

test('reuses the stock glory window tabs, overview, general rows, filters and pager', async () => {
  const map = { RankWindow: class {}, UserInfoDDZWindow: NativeWindow, UserInfoDDZView2025: NativeOverview,
    UserInfoDDZGenWinView2025: NativeGeneral };
  const ClassUtils = { _classMap: map, regClass(name, Class) { map[name] = Class; } };
  const calls = [], listeners = new Map(), requests = [], proxyEvents = new Map();
  const user = { Uuid: 88, Nickname: '测试玩家' };
  const proxy = {
    on(event, _owner, callback) { proxyEvents.set(event, callback); },
    off(event) { proxyEvents.delete(event); },
  };
  const records = {
    getGeneralRankReq(...args) {
      requests.push(args);
      proxyEvents.get('decodeClientStatGeneralRankRep')?.({ Protocol: { Data: { ProtoObj: {
        general_cnt: 10, rankdesc: args[0], items: [{ rank_id: args[2], general_id: 8010, game_count: 25, win_count: 11 }],
      } } } });
    },
  };
  let windowInstance;
  const dispatcher = {
    ShowWindowAfterCloseOther(name, close, ...args) {
      calls.push([name, close, ...args]);
      if (name !== POKER_STATS_WINDOW) return;
      windowInstance = new map[name]();
      windowInstance.classMap = map;
      windowInstance.Init();
      windowInstance.enterWindow(...args);
    },
  };
  const activity = {
    on(event, _owner, callback) { listeners.set(event, callback); },
    off(event) { listeners.delete(event); },
    SendActivitysetData(type) {
      assert.equal(type, 32);
      this.PokerDDZData = { game_times: 23, max_streak_win: 11, streak_glory_cnt: 2, weekly_max_rank: 0, total_win_bean: 411 };
      listeners.get('UPDATE_POKER_DDZ_BASE_DATA_EVENT')();
    },
  };
  const ctx = {
    window: { Laya: { ClassUtils } },
    game: { getClass: name => map[name], getDispatcher: () => dispatcher, getServerProxy: () => proxy, getSelf: () => user },
    native: {
      account: () => ({ id: '12' }),
      manager(name, _event, guard) {
        const manager = name === 'ActivityManager' ? activity : records;
        return guard(manager) ? manager : null;
      },
    },
    notify: message => assert.fail(message),
    scope: new ResourceScope(),
  };

  try {
    assert.equal(openPokerRankWindow(ctx), true);
    assert.deepEqual(calls.at(-1), ['RankWindow', null, 51]);
    assert.equal(openPokerStatsWindow(ctx), true);
    await new Promise(setImmediate);
    assert.equal(windowInstance.usedStockFrame, true);
    assert.deepEqual(windowInstance.tabs, [0, 2]);
    const view = windowInstance.overview;
    assert.ok(view instanceof NativeOverview);
    assert.equal(view.totalSessionValue.text, '23');
    assert.equal(view.weekMaxValue.text, '未上榜');
    assert.deepEqual(view.maxStreakValue.dimensions, [68, 54]);
    assert.equal(listeners.size, 0);

    const general = windowInstance.viewStack.select(2);
    assert.ok(general instanceof NativeGeneral);
    await new Promise(setImmediate);
    assert.deepEqual(general.nativeRows, [{ rank_id: 1, general_id: 8010, game_count: 25, win_count: 11 }]);
    assert.deepEqual(general.radioBtn.roles.map(role => role.label), ['全部', '地主', '农民']);
    general.onNextClick();
    await new Promise(setImmediate);
    general.radioBtn.SelectedValue = 3;
    general.onTypeClicked();
    await new Promise(setImmediate);
    general.sortBtnClick(0);
    await new Promise(setImmediate);
    assert.deepEqual(requests, [
      [false, 0, 1, 9, '测试玩家', 47, 0, 0], [false, 0, 10, 9, '测试玩家', 47, 0, 0],
      [false, 0, 1, 9, '测试玩家', 47, 3, 0], [true, 0, 1, 9, '测试玩家', 47, 3, 0],
    ]);
  } finally {
    ctx.scope.dispose();
  }
  assert.equal(windowInstance.destroyed, true);
  assert.deepEqual(Object.keys(map).sort(), ['RankWindow', 'UserInfoDDZGenWinView2025', 'UserInfoDDZView2025', 'UserInfoDDZWindow']);
});

test('requests only poker aggregate page 47 and ignores a normal rank response', async () => {
  const listeners = new Map(), calls = [], owner = { Uuid: 88, Nickname: '测试玩家' };
  let account = '12';
  const proxy = {
    on(event, _owner, callback) { listeners.set(event, callback); },
    off(event) { listeners.delete(event); },
    reply(body) { listeners.get('decodeClientStatGeneralRankRep')?.({ Protocol: { Data: { ProtoObj: body } } }); },
  };
  const manager = { getGeneralRankReq(...args) { calls.push(args); } };
  const original = manager.getGeneralRankReq;
  const ctx = {
    game: { getSelf: () => owner, getServerProxy: () => proxy },
    native: { account: () => ({ id: account }), manager: (_name, event, guard) => {
      assert.equal(event, 'decodeClientStatGeneralRankRep');
      return guard(manager) ? manager : null;
    } },
  };
  const first = readPokerGeneralPage(ctx, 2, new AbortController().signal);
  assert.deepEqual(calls.at(-1), [false, 0, 10, 9, '测试玩家', 47, 0, 0]);
  proxy.reply({ general_cnt: 10, items: [{ general_id: 15, game_count: 18, win_count: 6 }] });
  assert.equal(listeners.size, 1);
  proxy.reply({ general_cnt: 10, items: [{ general_id: 8001, game_count: 18, win_count: 6 }] });
  assert.deepEqual(await first, { page: 2, total: 10, rows: [{ rank: 10, id: 8001, games: 18, wins: 6 }] });
  assert.equal(manager.getGeneralRankReq, original);
  assert.equal(listeners.size, 0);

  const overlapping = readPokerGeneralPage(ctx, 1, new AbortController().signal);
  manager.getGeneralRankReq(false, 0, 1, 9, '测试玩家', 33, 0, 0);
  assert.match((await overlapping).message, /同时查询/);
  assert.equal(manager.getGeneralRankReq, original);
  assert.equal(listeners.size, 0);

  const stale = readPokerGeneralPage(ctx, 1, new AbortController().signal);
  account = '13';
  proxy.reply({ general_cnt: 1, items: [{ general_id: 8001, game_count: 18, win_count: 6 }] });
  assert.deepEqual(await stale, {});
  assert.equal(listeners.size, 0);
});

test('native history adds the poker tab after landlords and adapts only poker replay rows', async t => {
  const calls = [];
  const all = [{ ModeInfo: { ModeId: 148, Section: 3 }, GameId: 'normal' },
    { ModeInfo: { ModeId: 175, Section: 2 }, GameId: 'recent', GameOverTime: 10 }];
  const records = {
    GetModeRecordList: tab => tab === 0 ? all : [],
    GetWinRateInfoByUuId: (uuid, tab) => uuid === 88 && tab === 0 ? { RecordItems: all } : null,
    SendClientGameRecordInfoReq: (...args) => calls.push(args),
  };
  class VideoZhanjiView {
    constructor(Data) {
      this.Data = Data;
      this.tab = 0;
      this.parent = {};
      this.panel = { vScrollBar: { value: 0 } };
      this.initTabGroup();
      this.updateList();
    }
    initTabGroup() {
      const view = this;
      this.tabGroup = {
        btnList: [{ label: '全部', value: 0 }, { label: '斗地主', value: 9 }, { label: '赛事', value: 12 }],
        InitUi(buttons) { this.btnList.push(...buttons.map(button => ({ ...button, destroy() { this.destroyed = true; } }))); },
        set SelectedValue(value) { view.tabCliCked(value); },
      };
    }
    tabCliCked(value) {
      this.tab = value;
      calls.push(['stock tab', value]);
      this.updateList();
    }
    updateList() {
      this.itemList = records.GetModeRecordList(this.tab).map(row => ({
        recordInfo: row,
        SaveId: 'self_' + row.GameId,
        OnPlayVideo() { calls.push(['stock play', row.GameId]); },
      }));
    }
    clearData() { this.itemList = []; }
  }
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const listeners = new Set();
  const proxy = { on(_event, _owner, callback) { listeners.add(callback); },
    off(_event, _owner, callback) { listeners.delete(callback); } };
  const indexedDB = { open(name) {
    assert.equal(name, 'localVideo');
    const request = { result: {
      transaction(store, mode) {
        assert.deepEqual([store, mode], ['videoData', 'readonly']);
        const tx = { objectStore: () => ({ get(key) {
          assert.match(key, /^self_(recent|poker-one)$/);
          const get = { result: { data: Uint8Array.of(1, 7, 5).buffer } };
          queueMicrotask(() => { get.onsuccess(); tx.oncomplete(); });
          return get;
        } }) };
        return tx;
      },
      close() {},
    } };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  let account = '12', completePlayback, playbackGuard;
  const ctx = { scope, window: { indexedDB },
    game: { getClass: name => name === 'VideoZhanjiView' ? VideoZhanjiView : null, getDispatcher: () => null,
      getScene: () => null, getSelf: () => ({ Uuid: 88 }), getServerProxy: () => proxy,
      getConfigData: () => ({ Root: { winRate: [{ id: 49, modelid: '175,2' }] } }) },
    native: { account: () => ({ id: account }), manager: (_name, _event, guard) => guard(records) && records },
  };
  installPokerHistory(ctx, (readBytes, { beforePlay, onReturn }) => {
    assert.equal(typeof onReturn, 'function');
    playbackGuard = beforePlay;
    completePlayback = readBytes().then(bytes => assert.deepEqual(bytes, Uint8Array.of(1, 7, 5)));
    return completePlayback;
  });
  const ordinary = new VideoZhanjiView(1);
  assert.deepEqual(ordinary.tabGroup.btnList.map(button => button.label), ['全部', '斗地主', '赛事']);
  const view = new VideoZhanjiView(2);
  const labels = () => view.tabGroup.btnList.map(button => button.label);
  assert.deepEqual(labels(), ['全部', '斗地主', '三国斗地主', '赛事']);
  view.itemList[0].OnPlayVideo();
  assert.deepEqual(calls, [['stock play', 'normal']]);
  view.itemList[1].OnPlayVideo();
  await completePlayback;
  assert.equal(playbackGuard(), true);
  view.tabGroup.SelectedValue = POKER_HISTORY_TAB;
  assert.equal(playbackGuard(), false);
  assert.deepEqual(calls.at(-1), [88, 49, [{ ModeId: 175, Section: 2 }]]);
  assert.deepEqual(view.itemList.map(row => row.recordInfo.GameId), ['recent']);
  const qualified = { GameId: 'poker-one', Labelmodel: 175, Sectionkind: 2, GameOverTime: 30 };
  const reply = (Uuid, Tab, RecordId) => {
    for (const listener of [...listeners]) listener({ Protocol: { Uuid, Tab, RecordId,
      RecordItems: [qualified, { GameId: 'wrong-section', Labelmodel: 175, Sectionkind: 3 }, ...all] } });
  };
  reply(87, 0, 49);
  reply(88, 17, 49);
  reply(88, 0, 26);
  assert.deepEqual(view.itemList.map(row => row.recordInfo.GameId), ['recent']);
  reply(88, 0, 49);
  assert.equal(listeners.size, 0);
  assert.deepEqual(view.itemList.map(row => row.recordInfo.GameId), ['poker-one', 'recent']);
  view.itemList[0].OnPlayVideo();
  await completePlayback;
  assert.equal(playbackGuard(), true);
  account = '13';
  assert.equal(playbackGuard(), false);
  scope.dispose();
  assert.deepEqual(labels(), ['全部', '斗地主', '赛事']);
  assert.equal(view.tab, 0);
  assert.deepEqual(calls.at(-1), ['stock tab', 0]);
});

test('returns from native playback to the same lobby visit without taking over another scene', () => {
  class LobbyNode extends NativeNode {
    children = [];
    pos(x, y) { Object.assign(this, { x, y }); }
    addChild(child) { this.children.push(child); }
    on() {}
    off() {}
  }
  function stock() {
    const button = new LobbyNode();
    Object.assign(button, { x: 500, y: 600, width: 180, height: 50, enabled: true, visible: true, mouseEnabled: true });
    return Object.assign(new LobbyNode(), {
      SceneName: STOCK_SCENE, visible: true, topView: { nameTxt: { text: '斗地主' } }, startBtn: button,
      btnList: ['zgs_rank_tex', 'zgs_general_tex', 'zgs_win_info_tex'].map(name => Object.assign(new LobbyNode(), { name })),
      onBtnClick() {}, startMatchHandlerCheck() {},
    });
  }
  let scene = stock(), account = '12';
  const listeners = new Set(), proxy = {};
  const change = next => {
    scene = next;
    for (const listener of [...listeners]) listener(next);
  };
  const replay = { SceneName: 'DouDiZhuTableScene', IsReplay: true };
  const ctx = {
    window: { Laya: { stage: new LobbyNode(), Event: { CLICK: 'click', RESIZE: 'resize' }, Text: LobbyNode } },
    game: { getScene: () => scene, getServerProxy: () => proxy, getClass: () => undefined, isInGame: () => Boolean(scene.IsReplay),
      isReplay: candidate => Boolean(candidate.IsReplay), getDispatcher: () => ({ SwitchScene: () => assert.fail('unexpected scene switch') }),
      onSceneChange(callback) { listeners.add(callback); return () => listeners.delete(callback); } },
    native: { account: () => ({ id: account }) },
    ui: { nativeTheme: { bind: () => () => {} } },
    notify: message => assert.fail(message), scope: new ResourceScope(),
  };
  const lobby = createNativeLobby(ctx);
  const original = scene, returned = stock(), other = stock();
  try {
    lobby.open();
    assert.equal(original.startBtn.enabled, false);
    assert.deepEqual(original.children.map(child => child.name), ['sgs-poker-lobby-match-placeholder']);
    const visit = lobby.captureOrigin();
    assert.ok(visit);
    change(replay);
    assert.equal(original.startBtn.enabled, true);
    lobby.restoreOrigin(visit, returned);
    returned.initialized = false;
    change(returned);
    assert.equal(returned.topView.nameTxt.text, '斗地主');
    returned.initialized = true;
    change(returned);
    assert.equal(returned.topView.nameTxt.text, '三国斗地主');
    assert.equal(returned.startBtn.enabled, false);
    assert.deepEqual(returned.children.map(child => child.name), ['sgs-poker-lobby-match-placeholder']);

    const next = lobby.captureOrigin();
    change(replay);
    lobby.restoreOrigin(next, returned);
    change(other);
    change(returned);
    assert.equal(returned.topView.nameTxt.text, '斗地主');
    lobby.restoreOrigin(next, returned);
    assert.equal(returned.topView.nameTxt.text, '斗地主');

    lobby.open();
    const wrongAccount = lobby.captureOrigin();
    change(replay);
    lobby.restoreOrigin(wrongAccount, returned);
    account = '13';
    change(returned);
    assert.equal(returned.topView.nameTxt.text, '斗地主');

    lobby.open();
    const pending = lobby.captureOrigin();
    change(replay);
    lobby.restoreOrigin(pending, returned);
    ctx.scope.dispose();
    change(returned);
    assert.equal(returned.startBtn.enabled, true);
    assert.equal(listeners.size, 0);
  } finally {
    ctx.scope.dispose();
  }
});
