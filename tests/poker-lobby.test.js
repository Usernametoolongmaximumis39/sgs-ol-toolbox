import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { createNativeLobby, STOCK_SCENE } from '../src/plugins/poker-lobby/native-lobby.js';
import { installPokerGeneralDetails } from '../src/plugins/poker-lobby/general-detail.js';
import { pokerSkillsFor } from '../src/plugins/poker-lobby/poker-skills.js';
import { formatPokerRules } from '../src/plugins/poker-lobby/rules.js';

class NativeNode {
  constructor(name = '') {
    Object.assign(this, { name, visible: true, mouseEnabled: true, alpha: 1, enabled: true, Gray: false, width: 150, height: 36 });
    this.handlers = [];
  }
  on(type, caller, handler) { this.handlers.push({ type, caller, handler }); }
  off(type, caller, handler) { this.handlers = this.handlers.filter(x => x.type !== type || x.caller !== caller || x.handler !== handler); }
  event(type) { for (const x of this.handlers.filter(x => x.type === type)) x.handler.call(x.caller, this); }
  pos(x, y) { Object.assign(this, { x, y }); }
  size(width, height) { Object.assign(this, { width, height }); }
  destroy() { this.destroyed = true; }
}

// `label` models the stock button that can show text; without it the plugin
// cannot ask for confirmation on the canvas and keeps the button disabled.
function fixture({ matching = false, forbidden = false, label = false, session = false } = {}) {
  const scope = new ResourceScope();
  const calls = [];
  const stock = {
    SceneName: STOCK_SCENE,
    currnetModeType: 1,
    topView: { nameTxt: { text: '斗地主' } },
    startBtn: new NativeNode(), pMethodPanel: new NativeNode(),
    btnList: ['zgs_rank_tex', 'zgs_general_tex', 'zgs_win_info_tex'].map(name => new NativeNode(name)),
    onBtnClick(node) { calls.push(['ordinary', node.name]); },
    startMatchHandlerCheck() { this.startMatchHandler(); },
    startMatchHandler() { calls.push(['match']); },
    UpdateBtnStatus() { Object.assign(this.startBtn, { enabled: true, visible: false, WordTex: 'ordinary_word' }); },
    addChild(node) { this.notice = node; },
  };
  if (label) Object.assign(stock.startBtn, { label: '', labelSize: 17 });
  for (const button of stock.btnList) button.on('click', stock, stock.onBtnClick);
  stock.startBtn.on('click', stock, stock.startMatchHandlerCheck);
  const listeners = new Map();
  const requests = [];
  const proxy = matching ? {
    ConnId: 5, ConnectedSucess1: true,
    AddEventListener(id, owner, handler) { listeners.set(id, { owner, handler }); },
    RemoveEventListener(id, owner, handler) {
      assert.deepEqual(listeners.get(id), { owner, handler });
      listeners.delete(id);
    },
  } : undefined;
  const mode = { ModeID: 175, Section: 2, NoSupportPC: forbidden, GetOpenState: () => 0, IsOpenTime: true };
  if (matching) {
    stock.rc = Object.assign(new NativeNode(), {
      proxy, TableId: 0, CanSendEnterPage: true, IsGameStart: false,
      IsForbidInPC: () => forbidden,
      Ft(...args) { requests.push(['ready', ...args]); },
    });
    stock.adManager = {
      proxy, IsMatching: false,
      SendEnterPage(op, model, section) {
        this.TypeID = model;
        this.Section = section;
        requests.push(['enter', op, model, section]);
      },
      Bt(...args) { requests.push(['queue', ...args]); },
    };
    stock.matchEffect = new NativeNode();
    stock.MatchTime = stock.timeUI = new NativeNode();
    stock.UpdateBtnStatus = function () {
      const waiting = this.adManager.IsMatching;
      this.matchEffect.visible = this.MatchTime.visible = waiting;
      this.startBtn.WordTex = waiting ? 'canel_match_words' : 'start_match_words';
    };
    stock.BackBtnClickHandler = () => false;
  }
  let scene = stock, account = '11', sceneChanged;
  const window = { Laya: { stage: new NativeNode(), Event: { CLICK: 'click', RESIZE: 'resize' }, Text: NativeNode },
    ...(session ? { sessionStorage: { value: null, getItem() { return this.value; }, setItem(key, value) { this.value = value; } } } : {}) };
  const ctx = {
    scope, window,
    game: {
      getScene: () => scene, isInGame: () => false,
      getServerProxy: () => proxy,
      getClass: name => name === 'RankWindow' || name === 'GoToU3dWindow' ? class NativeWindow {} : null,
      getDispatcher: () => ({ ShowWindowAfterCloseOther: (...args) => calls.push(args) }),
      onSceneChange(fn) { sceneChanged = fn; return () => { sceneChanged = null; }; },
    },
    native: { account: () => ({ id: account }) },
    ui: { nativeTheme: { bind: () => () => {} } },
    notify: text => calls.push(['notice', text]),
  };
  return { calls, scope, stock, window, lobby: createNativeLobby(ctx), requests, mode, listeners, proxy,
    reply(Id, data) {
      if (Id === 20546) {
        if (data.opType === 1) stock.adManager.IsMatching = data.result === 1;
        if (data.opType === 2 && data.result === 1000) stock.adManager.IsMatching = false;
        stock.UpdateBtnStatus();
      }
      listeners.get(Id)?.handler({ Protocol: { Id, ...data } });
    },
    setAccount(value) { account = value; },
    leave() { scene = { SceneName: 'HallScene' }; sceneChanged(scene); } };
}

test('大厅复用普通斗地主控件，排行走原生分类 51，匹配和限免关闭', () => {
  const { lobby, stock, calls, scope } = fixture();
  try {
    const [rank] = stock.btnList;
    lobby.open();
    assert.equal(stock.topView.nameTxt.text, '三国斗地主');
    assert.equal(stock.currnetModeType, 3);
    assert.equal(stock.pMethodPanel.visible, false);
    assert.equal(stock.notice, undefined);
    assert.equal(lobby.actions().status, '当前客户端无法发起三国斗地主匹配。');
    assert.equal(lobby.actions().enabled, false);
    stock.startBtn.event('click');
    lobby.actions().match();
    stock.startMatchHandlerCheck();
    stock.UpdateBtnStatus();
    assert.equal(stock.startBtn.enabled, false);
    assert.equal(stock.startBtn.visible, true);
    assert.equal(stock.startBtn.WordTex, 'start_match_words');
    assert.deepEqual(calls, []);
    rank.event('click');
    assert.deepEqual(calls, [['RankWindow', null, 51]]);
  } finally { scope.dispose(); }
});

test('离开场景恢复普通斗地主原生行为，未登录不会改动大厅', () => {
  const ui = fixture();
  try {
    ui.setAccount('');
    ui.lobby.open();
    assert.match(ui.calls[0][1], /请登录/);
    assert.equal(ui.stock.topView.nameTxt.text, '斗地主');
    assert.equal(ui.stock.currnetModeType, 1);
    ui.setAccount('11');
    ui.lobby.open();
    ui.leave();
    assert.equal(ui.stock.topView.nameTxt.text, '斗地主');
    assert.equal(ui.stock.pMethodPanel.visible, true);
    assert.equal(ui.stock.notice, undefined);
    ui.stock.startBtn.event('click');
    ui.stock.btnList[0].event('click');
    assert.deepEqual(ui.calls.slice(1), [['match'], ['ordinary', 'zgs_rank_tex']]);
  } finally { ui.scope.dispose(); }
});

test('三国斗地主等待原生入场回复，并用同一个原生按钮开始和取消匹配', t => {
  const f = fixture({ matching: true });
  t.after(() => f.scope.dispose());
  const { stock, requests } = f;
  assert.equal(stock.startBtn.enabled, true);
  f.lobby.open(f.mode);
  assert.equal(stock.notice, undefined);
  assert.equal(f.lobby.actions().label, '开始匹配');
  f.lobby.actions().match();
  stock.startBtn.event('click');
  assert.deepEqual(requests, [['enter', 2, 175, 2]]);
  assert.equal(f.lobby.actions().enabled, false);
  assert.equal(stock.matchEffect.visible, false);
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 3 });
  assert.equal(requests.length, 1);
  f.reply(20402, { Result: 7, LabelModel: 175, SectionKind: 2, why: 'PRIVATE-FIXTURE' });
  assert.equal(requests.length, 1);
  assert.equal(stock.startBtn.enabled, true);
  const { events } = JSON.parse(f.lobby.matchLog());
  assert.deepEqual(events.map(({ event, result }) => [event, result]),
    [['已进入经典版大厅', undefined], ['进入初级场', undefined], ['入场结果', 7]]);
  assert.ok(!f.lobby.matchLog().includes('PRIVATE-FIXTURE'));

  stock.startBtn.event('click');
  f.reply(20402, { Result: 2, LabelModel: 175, SectionKind: 2 });
  assert.deepEqual(requests.slice(1), [['enter', 2, 175, 2], ['queue', 1, 175, 0, 2]]);
  assert.equal(stock.startBtn.enabled, false);
  assert.equal(stock.BackBtnClickHandler(), true);
  f.reply(20546, { model: 148, opType: 1, result: 1 });
  assert.equal(stock.matchEffect.visible, false);
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  assert.equal(stock.MatchTime.visible, true);
  assert.equal(stock.startBtn.WordTex, 'canel_match_words');
  assert.equal(f.lobby.actions().label, '取消匹配');
  f.lobby.actions().match();
  stock.startBtn.event('click');
  assert.deepEqual(requests.at(-1), ['queue', 2, 175, 0, 2]);
  assert.equal(requests.length, 4);
  f.reply(20546, { model: 175, opType: 2, result: 1000 });
  assert.equal(stock.MatchTime.visible, false);
  assert.equal(stock.startBtn.enabled, true);

  stock.startBtn.event('click');
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  stock.startBtn.event('click');
  f.reply(20546, { model: 175, opType: 2, result: 1001 });
  stock.startBtn.event('click');
  assert.equal(requests.length, 7);
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 72 });
  stock.adManager.IsMatching = false;
  stock.matchSuccess = true;
  stock.rc.event('LEAVE_TABLE_EVENT');
  assert.equal(stock.matchSuccess, false);
  assert.equal(stock.startBtn.enabled, true);
  f.leave();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.lobby.actions(), null);
  assert.equal(f.lobby.hasMatchLog(), true);
  f.setAccount('22');
  assert.equal(f.lobby.matchLog(), '');
});

test('经典版限制入场且按钮无法显示确认时，匹配按钮禁用且无原生请求', t => {
  const f = fixture({ matching: true, forbidden: true });
  t.after(() => f.scope.dispose());
  f.lobby.open(f.mode);
  assert.equal(f.stock.notice, undefined);
  assert.equal(f.stock.startBtn.enabled, false);
  assert.equal(f.stock.startBtn.WordTex, 'start_match_words');
  assert.equal(f.lobby.actions().enabled, false);
  assert.equal(f.lobby.actions().status, '当前客户端无法发起三国斗地主匹配。');
  f.stock.startBtn.event('click');
  f.lobby.actions().match();
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.calls, []);
  assert.equal(f.listeners.size, 0);
});

test('经典版限制入场时，原匹配按钮确认后直接发起匹配，不再打开重制版指引', t => {
  const f = fixture({ matching: true, forbidden: true, label: true });
  t.after(() => f.scope.dispose());
  const { stock } = f;
  f.lobby.open(f.mode);
  assert.equal(stock.notice, undefined);
  // 空闲和已入场时沿用原生「开始匹配」字样。
  assert.equal(stock.startBtn.label, '');
  assert.equal(stock.startBtn.WordTex, 'start_match_words');
  assert.equal(f.lobby.actions().label, '开始匹配');
  assert.equal(f.lobby.actions().status, '经典版尚未开放此场次，将直接向服务器请求匹配。');
  assert.equal(f.lobby.actions().enabled, true);
  assert.equal(f.lobby.actions().assigned, false);

  // 首次点击只提示并要求在同一个按钮上确认，不发请求。
  stock.startBtn.event('click');
  assert.equal(stock.startBtn.label, '确认仅小号测试');
  assert.equal(f.lobby.actions().label, '确认仅小号测试');
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.calls, [['notice', '此功能在测试中，仅用于小号。']]);

  // 确认即本次点击：入场确认一到就发出匹配，不再等待第二次点击。
  stock.startBtn.event('click');
  assert.equal(stock.startBtn.label, '等待入场…');
  assert.equal(f.lobby.actions().enabled, false);
  assert.deepEqual(f.requests, [['enter', 2, 175, 2]]);
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  assert.deepEqual(f.requests, [['enter', 2, 175, 2], ['queue', 1, 175, 0, 2]]);
  assert.equal(stock.startBtn.label, '');
  assert.equal(stock.startBtn.WordTex, 'canel_match_words');
  assert.equal(f.lobby.actions().label, '取消匹配');
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  assert.equal(f.lobby.actions().status, '正在匹配，等待分配牌桌…');

  // 同一个按钮取消匹配。
  stock.startBtn.event('click');
  f.lobby.actions().match();
  assert.deepEqual(f.requests.at(-1), ['queue', 2, 175, 0, 2]);
  assert.equal(f.requests.length, 3);
  f.reply(20546, { model: 175, opType: 2, result: 1000 });
  assert.equal(stock.startBtn.WordTex, 'start_match_words');
  assert.equal(f.lobby.actions().label, '开始匹配');
  assert.equal(f.lobby.actions().status, '已入场，可以开始匹配。');

  // 入座后发送准备，开局后按钮停用并等待自动进入牌桌。
  stock.startBtn.event('click');
  assert.deepEqual(f.requests.at(-1), ['queue', 1, 175, 0, 2]);
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 72 });
  stock.rc.TableId = 72;
  assert.equal(stock.startBtn.label, '发送准备');
  assert.equal(f.lobby.actions().assigned, true);
  stock.startBtn.event('click');
  assert.equal(stock.startBtn.label, '准备中…');
  assert.equal(f.lobby.actions().enabled, false);
  f.lobby.actions().match();
  assert.deepEqual(f.requests.at(-1), ['ready', true]);
  assert.equal(f.requests.length, 5);
  f.reply(21204, { Result: 1 });
  assert.equal(stock.startBtn.label, '等待开局');
  f.reply(21208, { IsGameStart: true, Infos: [{ ClientID: 11 }, {}, {}] });
  assert.equal(stock.startBtn.label, '已开局');
  assert.equal(stock.startBtn.enabled, false);
  assert.equal(f.lobby.actions().enabled, false);
  assert.equal(f.lobby.actions().status, '已开局，正在进入牌桌。');
  stock.startBtn.event('click');
  assert.equal(f.requests.length, 5);

  const { events } = JSON.parse(f.lobby.matchLog());
  assert.deepEqual(events.map(({ event, result }) => [event, result]), [
    ['经典版未开放，直接请求匹配', undefined], ['进入初级场', undefined], ['入场结果', 1], ['开始匹配', undefined],
    ['匹配结果', 1], ['取消匹配', undefined], ['取消匹配结果', 1000], ['开始匹配', undefined], ['匹配结果', 1],
    ['已分配牌桌', undefined], ['发送准备', undefined], ['准备结果', 1], ['已开局', undefined],
  ]);

  // 重制版指引窗口虽然存在，整个过程都没有被打开。
  assert.deepEqual(f.calls, [['notice', '此功能在测试中，仅用于小号。']]);
  f.leave();
  assert.equal(stock.startBtn.label, '');
  assert.equal(f.lobby.actions(), null);
  stock.startBtn.event('click');
  assert.deepEqual(f.calls.at(-1), ['match']);
});

test('直接匹配被拒绝时显示原因，确认状态在同一浏览器会话内保留', t => {
  const f = fixture({ matching: true, forbidden: true, label: true, session: true });
  t.after(() => f.scope.dispose());
  const { stock } = f;
  f.lobby.open(f.mode);
  stock.startBtn.event('click');
  stock.startBtn.event('click');
  assert.equal(f.window.sessionStorage.value, '1');
  f.reply(20402, { Result: 26, LabelModel: 175, SectionKind: 2, why: 'PRIVATE-FIXTURE' });
  assert.equal(stock.startBtn.label, '重试匹配');
  assert.equal(stock.startBtn.enabled, true);
  assert.equal(f.lobby.actions().status, 'PRIVATE-FIXTURE');
  assert.ok(!f.lobby.matchLog().includes('PRIVATE-FIXTURE'));

  // 已确认过则不再二次确认；入场被拒不发匹配，放行后才发出。
  stock.startBtn.event('click');
  assert.equal(stock.startBtn.label, '等待入场…');
  f.reply(20402, { Result: 2, LabelModel: 175, SectionKind: 2 });
  assert.deepEqual(f.requests, [['enter', 2, 175, 2], ['enter', 2, 175, 2], ['queue', 1, 175, 0, 2]]);
  assert.equal(stock.startBtn.WordTex, 'canel_match_words');

  f.reply(20546, { model: 175, opType: 1, result: 27 });
  assert.equal(f.lobby.actions().status, '匹配失败：禁止匹配');
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 72 });
  assert.equal(stock.startBtn.label, '重试匹配');
  const { events } = JSON.parse(f.lobby.matchLog());
  assert.deepEqual(events.map(({ event, result }) => [event, result]).slice(-3),
    [['入场结果', 2], ['开始匹配', undefined], ['匹配结果', 27]]);

  // 超时与服务端原话只进入状态，不进入可复制的日志。
  stock.startBtn.event('click');
  f.reply(20402, { Result: 26, LabelModel: 175, SectionKind: 2, why: 'PRIVATE-FIXTURE' });
  assert.ok(!f.lobby.matchLog().includes('PRIVATE-FIXTURE'));
  assert.ok(!f.lobby.matchLog().includes('入场失败'));
});

test('原生匹配能力缺失不等于经典版受限，不应启用直接匹配', t => {
  const f = fixture({ matching: true, label: true });
  t.after(() => f.scope.dispose());
  f.stock.matchEffect = null;
  f.lobby.open(f.mode);
  assert.equal(f.stock.startBtn.label, '暂不可用');
  assert.equal(f.lobby.actions().enabled, false);
  f.stock.startBtn.event('click');
  assert.deepEqual(f.requests, []);
  assert.equal(f.listeners.size, 0);
  f.leave();
  assert.equal(f.stock.startBtn.label, '');
});

test('更换连接后旧入场回复不能触发匹配', t => {
  const f = fixture({ matching: true, forbidden: true, label: true });
  t.after(() => f.scope.dispose());
  f.lobby.open(f.mode);
  f.stock.startBtn.event('click');
  f.stock.startBtn.event('click');
  assert.deepEqual(f.requests, [['enter', 2, 175, 2]]);
  f.proxy.ConnId++;
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  f.lobby.actions().match();
  assert.equal(f.lobby.actions().enabled, false);
  assert.match(f.lobby.actions().status, /连接不可用/);
  assert.deepEqual(f.requests, [['enter', 2, 175, 2]]);
});

test('武将详情按扑克表解读技能编号，拒绝自动回退到普通牌表', () => {
  const registry = {};
  const scope = new ResourceScope();
  const infos = new Map([8000, 8016, 8037, 8040].map((id, index) => [id, {
    Id: id, ItemID: id, Skills: [1, 17, 38, 12].slice(index, index + 1),
  }]));
  const names = new Map([[1, '仁德'], [17, '突袭'], [38, '缔盟']]);
  class Skill {
    static GetInstance(id) { return { ID: id, Name: '普通技能' }; }
  }
  class PokerSkill extends Skill {
    static GetInstance(id) {
      if (!names.has(id)) return null;
      return Object.assign(new this(), { ID: id, Name: names.get(id), IsActive: id !== 17 });
    }
  }
  class GeneralCard {
    static GetInstance(id) { return { Skills: infos.get(id).Skills.map(id => Skill.GetInstance(id)) }; }
  }
  class GeneralInfoSkillView {
    constructor(info) { this.generalInfo = info; }
    initSkillPanel() {
      this.rows = GeneralCard.GetInstance(this.generalInfo.ItemID).Skills.map(({ ID }) => Skill.GetInstance(ID));
      assert.equal(Skill.GetInstance(9999).Name, '普通技能');
    }
  }
  class GeneralInfoWindow {
    createViewStack() { this.viewStack = { childList: ['GeneralInfoSkillView'] }; }
    UpdateWindow(id) {
      this.generalInfo = infos.get(id);
      this.createViewStack();
      this.view = new registry[this.viewStack.childList[0]](this.generalInfo);
      this.view.initSkillPanel();
    }
    playSkillSound(id) { return Skill.GetInstance(id).Name; }
    Close() { this.destroy(); }
    destroy() { this.destroyed = true; }
  }
  let detail;
  const ctx = {
    native: { account: () => ({ id: '11' }) },
    game: {
      getClass: name => ({ GeneralInfoSkillView, GeneralInfoWindow, GeneralCard, Skill, PokerSkill })[name],
      getDispatcher: () => ({ ShowWindowAfterCloseOther(name, _close, id) {
        detail = new registry[name]();
        detail.UpdateWindow(id);
      } }),
    },
    window: { Laya: { Event: { CLICK: 'click' }, ClassUtils: {
      _classMap: registry, regClass(name, ctor) { registry[name] = ctor; },
    } } },
    notify: message => assert.fail(message),
  };
  const getSkills = info => pokerSkillsFor(ctx, info);
  const bind = installPokerGeneralDetails(ctx, scope, getSkills);
  const stock = [];
  function portrait(id, drawn) {
    const item = { generalInfo: infos.get(id), onItemClick() { stock.push(id); } };
    const draw = () => {
      item.topSp = new NativeNode();
      item.topSp.on('click', item, item.onItemClick);
    };
    if (drawn) draw();
    bind(item);
    if (!drawn) draw();
    return item.topSp;
  }
  try {
    const portraits = [portrait(8000, false), portrait(8016, true), portrait(8037, false), portrait(8040, false)];
    for (const [index, [id, name]] of [...names].entries()) {
      portraits[index].event('click');
      assert.ok(detail.view instanceof GeneralInfoSkillView);
      assert.deepEqual(detail.view.rows.map(row => [row.Name, row.IsActive]), [[name, id !== 17]]);
      assert.equal(detail.playSkillSound(id), name);
      assert.equal(Skill.GetInstance(id).Name, '普通技能');
    }
    portraits[3].event('click');
    assert.deepEqual(detail.view.rows, []);
    assert.equal(detail.playSkillSound(12), undefined);
    assert.deepEqual(stock, []);
    scope.dispose();
    assert.equal(detail.destroyed, true);
    assert.deepEqual(Object.keys(registry), []);
    for (const button of portraits) button.event('click');
    assert.deepEqual(stock, [8000, 8016, 8037, 8040]);
  } finally { scope.dispose(); }
});

test('规则使用官方模式与牌型分段，比较符按文本显示', () => {
  assert.equal(formatPokerRules({ ModelBelongDesc: '模式说明&强易&欢乐豆<600|牌型说明&王炸>炸弹' }),
    '【模式说明】<br>强易<br>欢乐豆&lt;600<br><br>【牌型说明】<br>王炸&gt;炸弹');
});
