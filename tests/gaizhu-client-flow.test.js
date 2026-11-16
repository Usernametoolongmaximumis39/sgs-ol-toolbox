import { RoomSettingsWindow, attachRoomSettings } from './fixtures/gaizhu-room.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAdapter } from '../src/core/game.js';
import { ResourceScope } from '../src/core/resources.js';
import { createGaiZhu } from '../src/plugins/gaizhu/runtime.js';

test('gaizhu: core adapter drives native room, AI confirmation, selection, mulligan and Kurou without opening point cards', t => {
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const calls = [], errors = [], slots = [0, 0, 0, 0], pointListeners = new Set();
  let now = 100000, constructed = 0;
  class UserData { static self = { ClientId: 41, NickName: '离线房主' }; }
  class FlatButton {
    mouseEnabled = false;
    enabled = true;
    visible = true;
    constructor(action) { this.action = action; }
    onClick() { if (this.enabled) this.action(); }
  }
  class RoomScene {
    get SceneName() { return 'TableScene'; }
    visible = true;
    _children = [];
    seatListView = { seatList: [{ waitInfo: { clientId: 41, isMaster: true } }, {}] };
  }
  class GameScene {
    get SceneName() { return 'GameScene'; }
    get SelfSeatUi() { return this.ownSeat; }
    visible = true;
    _children = [];
  }
  // Client skills inherit a generic onClick, but use onMouse for activation.
  class SkillBase { onClick() { calls.push('wrong-inherited-skill-click'); } }
  class KurouSkill extends SkillBase {
    Skill = { Name: '苦肉' };
    activated = true;
    Selected = false;
    visible = true;
    mouseEnabled = false;
    onMouse(event) {
      assert.equal(event.type, 'click');
      assert.ok(calls.includes('decline'), 'mulligan must be rejected before Kurou');
      calls.push('kurou');
    }
  }
  const room = new RoomScene(), battle = new GameScene();
  battle.ownSeat = { skillItems: [new KurouSkill()], seat: { Index: 0, IsAiControl: false }, Pt: { visible: false, btns: [] } };
  const sceneLayer = { layerOrder: 2, _children: [room] };
  const windowLayer = { name: 'WindowLayer', _children: [] };
  const proxy = { _events: {}, on() {}, off() {} };
  room.proxy = battle.proxy = proxy;

  class ShouQiKaAskWindow {
    visible = false;
    mouseEnabled = false;
    constructor() {
      this.cancleBtn = new FlatButton(() => this.CloseWin());
      this.cancleBtn.label = '取消';
      this.sureBtn = new FlatButton(() => calls.push('spent-mulligan'));
      this.sureBtn.label = '使用';
    }
    CloseWin() { calls.push('decline'); this.visible = false; }
  }
  const mulligan = new ShouQiKaAskWindow();
  const select = {
    name: 'SelectGeneralWindow', visible: false, mouseEnabled: false,
    generalUis: [{ GeneralID: 1, GeneralName: '黄盖', visible: true,
      sureBtnClick() {
        calls.push('select');
        select.visible = false;
        mulligan.visible = true;
      } }],
  };
  const pointWindow = { name: 'DianJiangWindow', visible: false,
    sendDianJiang() { assert.fail('submission must not require a point-card window'); } };
  const pointManager = {
    figureId: 0, allSame: 0, HaveDianJiang: false,
    clearFigureState() { slots.fill(0); },
    updateAllFigureState(id) { slots[this.figureId] = id; },
    getfigureState(slot) { return slots[slot]; },
    canDianJiang() { return slots.some(id => id > 0); },
    saveFigureConfiger() {},
    on(name, caller, fn) { if (name === 'UPDATE_OTHER_DJ') pointListeners.add(fn); },
    off(name, caller, fn) { pointListeners.delete(fn); },
    event(name) {
      if (name === 'DJ_TAP_FIGURE_CHANGE') { pointWindow.visible = true; calls.push('opened-point-cards'); }
    },
    sendDianJiang() {
      assert.deepEqual(slots, [1, 0, 0, 0], 'lord slot must be written before native submission');
      calls.push('point'); this.HaveDianJiang = true;
      for (const fn of pointListeners) fn({ SzNickName: UserData.self.NickName, List: [{ GeneralID: 1, Figure: 1 }] });
    },
  };
  room.dianjiangView = {
    manger: pointManager,
    onOpenDJClick() {
      assert.equal(pointManager.canDianJiang(), true);
      pointManager.sendDianJiang();
    },
  };

  const aiConfirm = {
    name: 'ConfirmWindow', visible: false, mouseEnabled: false,
    confirmData: { content: '请选择小杀类型', clickClose: true, buttonArr: [] },
    RemoveFromParent() { this.visible = false; room.addAiBtn.enabled = true; },
  };
  room.addNormalAi = function (type) {
    assert.equal(this, room, 'confirmation must retain its native owner');
    assert.equal(type, 1, 'confirmation must retain its native argument');
    assert.equal(room.seatListView.seatList[1].waitInfo, undefined, 'opening the prompt must not fill a seat');
    calls.push('ai');
    room.seatListView.seatList[1].waitInfo = { clientId: 900, ready: true };
    room.startUI.startBtn.enabled = true;
  };
  aiConfirm.confirmData.buttonArr.push(
    { label: '小杀（高级）', callBack() { assert.fail('must not select advanced AI'); }, callBackParams: [2], thisObject: room },
    { label: '小杀（普通）', callBack: room.addNormalAi, callBackParams: [1], thisObject: room },
  );
  // Client S$t inherits gO.onClick: it targets a drawn texture, not the
  // sprite button's dispatcher. Passing { type: 'click' } silently does nothing;
  // calling it without an event throws, allowing GAME.pressButton's fallback.
  class SpriteBase {
    onClick(event) {
      const target = event.currentTarget;
      if (this === target) {
        const texture = target.getTextureByPosition(event.stageX, event.stageY);
        if (texture) texture.event('click', texture);
      }
    }
  }
  class AddAiButton extends SpriteBase {
    IsSpriteButton = true;
    visible = true;
    enabled = true;
    onMouse(event) {
      assert.equal(event.type, 'click'); calls.push('ai-prompt');
      aiConfirm.visible = true;
      this.enabled = false; // The confirmation must remain actionable over a covered button.
    }
  }
  room.addAiBtn = new AddAiButton();
  assert.equal(Object.hasOwn(room.addAiBtn, 'onClick'), false);
  assert.throws(() => room.addAiBtn.onClick(), TypeError);
  room.addAiBtn.onClick({ type: 'click' });
  assert.equal(aiConfirm.visible, false, 'the inherited click must not open the AI prompt');
  room.startUI = { startBtn: new FlatButton(() => {
    assert.ok(room.seatListView.seatList[1].waitInfo, 'start must follow confirmed AI insertion');
    calls.push('start');
    sceneLayer._children = [battle];
    select.visible = true;
  }) };
  room.startUI.startBtn.enabled = false;
  attachRoomSettings(room);
  windowLayer._children = [pointWindow, aiConfirm, select, mulligan];
  const windows = new Map(windowLayer._children.map(w => [w.name || w.constructor.name, w]));
  const classes = { CreateTableWindow: RoomSettingsWindow, UserData, WindowManager: { WindowInstanceDict: windows, proxy } };
  const win = {
    clearTimeout,
    CtrUtil: { AllDatas: {
      'character.sgs': { GameCharacters: { character: [{ id: 1, name: '黄盖' }] } },
      'gn_gs_ahievement.sgs': { AchievementAll: { Achievement: [{ Id: 20, characterId: 1, flags: 2048, CriteriaEntry: [{ Id: 200, count: 100 }] }] } },
    } },
    Laya: { stage: { _children: [sceneLayer, windowLayer] }, ClassUtils: {
      getClass: name => classes[name],
      getInstance() { constructed++; throw new Error('do not construct native client windows'); },
    } },
  };
  const game = createGameAdapter(win, scope);
  const controller = createGaiZhu({ scope, window: win, document: { querySelector: () => null }, game,
    now: () => now, settings: { get: (key, fallback) => fallback, set() {} }, reportError: error => { if (error) errors.push(error); } });
  assert.equal(game.getScene(), room);
  assert.equal(Object.hasOwn(room, 'SceneName'), false);
  assert.equal(Object.hasOwn(battle, 'SelfSeatUi'), false);
  assert.equal(win.__SGS_TOOLBOX_DEMO__, undefined);
  controller.setOptions({ role: 'host' });
  for (let i = 0; i < 24 && !calls.includes('kurou'); i++) { now += 250; controller.tick(); }
  assert.deepEqual(errors, []);
  assert.equal(controller.snapshot().role, 'host');
  assert.deepEqual(calls, ['point', 'ai-prompt', 'ai', 'start', 'select', 'decline', 'kurou']);
  assert.equal(pointWindow.visible, false);
  assert.equal(game.getScene(), battle);
  assert.equal(game.getSelfSeatUI(), battle.ownSeat);
  assert.equal(constructed, 0);
  controller.setOptions({ role: 'off' });
  const stoppedCalls = [...calls]; now += 2000; controller.tick();
  assert.deepEqual(calls, stoppedCalls, 'stopping must prevent the next skill action');
});
