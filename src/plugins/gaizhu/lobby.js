import { account, manager, read } from '../../shared/info-runtime.js';
import { press, usable } from './native.js';
import { isIdentityPractice, roomMode } from './room-settings.js';
import { isNationRoom } from './nation.js';

const HALL = 'HallScene';
const TRAINING = 'RogueLike1v1Scene';
const MODE_ENTRIES = ['ModeScene', 'ActivityModeScene'];
const PAGE_JOINED = 'PAGE_JOIN_SUCCESS';
const MILITARY_PRACTICE = 74;
const COUNTRY = 28;
const ROOM_LIST_SECTION = 4;
const COUNTRY_FRIEND_SECTION = 11;
const RIDER = 160;

export function isLobbyEntry(frame, mode) {
  return !frame.game && (frame.name === HALL || MODE_ENTRIES.includes(frame.name)
    || frame.name === TRAINING && mode === 'training');
}

export function isTrainingGame(ctx, frame) {
  const context = read(() => ctx.game.getClass('GameContext'));
  const mode = read(() => context.GetModeVO()) || roomMode(ctx);
  return frame.game && Number(mode?.ModeID) === RIDER && Number(read(() => context.GetGroupID()) ?? mode?.Section) === 3;
}

function isMilitaryPractice(mode) {
  return isIdentityPractice(mode) && Number(mode.Section) === ROOM_LIST_SECTION;
}

function isCountryFriendMode(ctx, mode) {
  return Number(mode?.ModeID) === COUNTRY && Number(mode.Section) === COUNTRY_FRIEND_SECTION && isNationRoom(ctx, mode);
}

function enterFromModeScene(ctx, mode, section) {
  const dispatcher = read(() => ctx.game.getDispatcher());
  const handlers = read(() => dispatcher._events.SWITCH_SCENE);
  const registered = read(() => ctx.game.getClass('SceneManager'));
  const nativeManager = [registered, ...(Array.isArray(handlers) ? handlers : [handlers]).map(handler => handler?.caller)]
    .find(value => typeof value?.SwitchSceneByModeId === 'function');
  if (!nativeManager || typeof dispatcher?.SwitchScene !== 'function') return false;
  // For these two room-list modes the native helper sets the requested mode/group
  // without switching. The dispatcher then enters the HallScene in that section.
  nativeManager.SwitchSceneByModeId(mode, section);
  dispatcher.SwitchScene(HALL);
  return true;
}

function roomSeat(scene, id) {
  const seats = read(() => scene.seatListView.seatList);
  return Array.isArray(seats) && seats.some(seat => {
    const wait = seat?.WaitInfo || seat?.waitInfo;
    return String(wait?.ClientId ?? wait?.clientId ?? '') === id;
  });
}

export function createLobbyEntry(ctx, native, mode, isActive = () => true) {
  const id = account(ctx).id;
  const password = mode === 'identity' ? String(1000 + Math.floor(Math.random() * 9000)) : '';
  const releases = [];
  const windowName = mode === 'nation' ? 'CreatOFRoomWindow' : 'CreateTableWindow';
  const matchesWindow = new RegExp(`^${windowName}$`);
  let cancelled = false, opened = false, submitted = false, navigated = false, origin = null;
  let nationCreateIssued = false, nativeError = null;
  const alive = () => !cancelled && isActive() && !ctx.scope.signal.aborted && Boolean(id)
    && account(ctx).id === id && read(() => ctx.game.getServerProxy().ConnectedSucess1) !== false;
  const register = release => releases.push(ctx.scope.add?.(release) || release);

  function guardedAction(action) {
    const gate = manager(ctx, 'LocalMatchManager', 'ClientMyMatchIdRep', value => typeof value.CheckAddRoom === 'function');
    const previous = read(() => gate.stillAddRoomCallBack);
    if (typeof previous === 'function') throw new Error('原生赛事提示仍待处理，请先处理后再启动');
    try { return action(); }
    finally {
      const callback = read(() => gate.stillAddRoomCallBack);
      if (typeof callback === 'function') {
        // CheckAddRoom can defer create/enter behind the native match reminder.
        const guarded = (...args) => { if (alive() && ctx.game.getScene() === origin) callback.apply(gate, args); };
        gate.stillAddRoomCallBack = guarded;
        register(() => {
          if (gate.stillAddRoomCallBack !== guarded) return;
          gate.stillAddRoomCallBack = null;
          gate.stillAddRoomCallBackParams = null;
        });
      }
    }
  }

  function submitNation(win) {
    if (!isCountryFriendMode(ctx, win.modeVO) || typeof win.sureCreate !== 'function') return false;
    const lobbyMode = roomMode(ctx);
    if (!lobbyMode) return false;
    if (isCountryFriendMode(ctx, lobbyMode)) {
      guardedAction(() => win.sureCreate());
      nationCreateIssued = true;
      return true;
    }
    const roomListManager = win.manager;
    const original = win.onEnterPage;
    if (win.isSendEnter || typeof original !== 'function' || typeof roomListManager?.off !== 'function') return false;
    const descriptor = Object.getOwnPropertyDescriptor(win, 'onEnterPage');
    if (descriptor && 'writable' in descriptor && !descriptor.writable) return false;
    let pendingPage = true;
    function release() {
      if (!pendingPage) return;
      pendingPage = false;
      read(() => roomListManager.off(PAGE_JOINED, win, joined));
      if (win.onEnterPage !== joined) return;
      if (descriptor) Object.defineProperty(win, 'onEnterPage', descriptor);
      else delete win.onEnterPage;
      win.isSendEnter = false;
    }
    function joined(...args) {
      try {
        const current = roomMode(ctx);
        if (!alive() || ctx.game.getScene() !== origin || !usable(win)) return;
        if (!isCountryFriendMode(ctx, current)) {
          nativeError = new Error('国战老友列表回包与本次建房请求不符');
          return;
        }
        guardedAction(() => original.apply(win, args));
        nationCreateIssued = true;
      } catch (error) {
        nativeError = error;
      } finally { release(); }
    }
    win.onEnterPage = joined;
    register(release);
    win.sureCreate();
    return true;
  }

  function submitIdentity(win) {
    if (win.isCreate !== true || !isMilitaryPractice(win.curModeVo) || !usable(win.passwordInput) || !usable(win.sureBtn)) return false;
    if (!usable(win.modeBox) && typeof win.showMoreHandler === 'function') win.showMoreHandler();
    const labels = win.modeBox?._labels;
    const figure = Array.isArray(labels) ? labels.findIndex(item => String(item).trim() === '自选身份') : -1;
    if (figure < 0 || !usable(win.modeBox)) throw new Error('军争演武建房未显示自选身份选项');
    win.modeBox.selectedIndex = figure;
    win.passwordInput.text = password;
    if (usable(win.dianJiangBox)) win.dianJiangBox.selected = false;
    if (usable(win.cardBuildBox)) win.cardBuildBox.selected = false;
    return guardedAction(() => press(win.sureBtn));
  }

  function step(frame) {
    if (!alive()) return;
    if (nativeError) throw nativeError;
    if (mode === 'training') {
      if (submitted && frame.name === 'RogueLike1v1GameScene' && isTrainingGame(ctx, frame)) return { ready: true };
      if (submitted && frame.name && frame.scene !== origin && frame.name !== 'RogueLike1v1GameScene') {
        throw new Error('已离开单骑人机入口');
      }
      if (!submitted && frame.name === TRAINING) {
        const button = read(() => frame.scene.btnList.find(item => item?.name === 'zgs_robot_tex'));
        if (!usable(button)) return;
        origin = frame.scene;
        const click = typeof frame.scene.onBtnClick === 'function' ? () => { frame.scene.onBtnClick(button); return true; } : () => press(button);
        submitted = guardedAction(click);
      } else if (!navigated && (frame.name === HALL || MODE_ENTRIES.includes(frame.name))) {
        const dispatcher = read(() => ctx.game.getDispatcher());
        if (typeof dispatcher?.SwitchScene !== 'function') throw new Error('当前大厅无法打开单骑无双入口');
        navigated = true;
        dispatcher.SwitchScene(TRAINING);
      } else if (frame.name && !isLobbyEntry(frame, mode) && frame.name !== 'RogueLike1v1GameScene') {
        throw new Error('已离开单骑人机入口');
      }
      return;
    }

    if (submitted && !frame.game && frame.scene !== origin && !isLobbyEntry(frame, mode)) {
      const rc = read(() => frame.scene.startUI.rc);
      const rule = read(() => rc.TableSetting);
      const current = roomMode(ctx);
      const roomNumber = String(rule?.TableID || rc?.TableId || '');
      const expected = mode === 'identity' ? isMilitaryPractice(current) && rule?.Password === password
        : nationCreateIssued && isCountryFriendMode(ctx, current);
      if (/^[1-9]\d*$/.test(roomNumber) && current?.ModeID && roomSeat(frame.scene, id)) {
        if (rc?.MasterIsSelf === false || !expected) throw new Error('当前房间与本次建房请求不符');
        if (rc?.MasterIsSelf === true) return { ready: true, roomNumber, scene: frame.scene };
      }
      if (rc || frame.name === 'TableScene' || !frame.name) return;
    }
    if (frame.name && !isLobbyEntry(frame, mode)) {
      throw new Error('已离开当前建房入口');
    }
    if (submitted && frame.name && frame.scene !== origin) throw new Error('已离开当前建房入口');
    if (submitted || !frame.name) return;
    const identity = mode === 'identity';
    const modeId = identity ? MILITARY_PRACTICE : COUNTRY;
    if (MODE_ENTRIES.includes(frame.name) && !navigated) {
      navigated = true;
      if (!enterFromModeScene(ctx, modeId, ROOM_LIST_SECTION)) throw new Error('当前大厅无法切换到对应房间列表');
      return;
    }
    if (frame.name !== HALL) return;
    const view = read(() => frame.scene.roomListView);
    if (!view) return;
    if (Number(view.modeId) !== modeId || Number(view.groupId) !== ROOM_LIST_SECTION) {
      if (opened) throw new Error('已离开当前建房列表');
      if (origin !== frame.scene) {
        if (typeof frame.scene.gotoUI !== 'function') throw new Error('当前大厅无法切换到对应房间列表');
        origin = frame.scene;
        frame.scene.gotoUI(modeId, ROOM_LIST_SECTION);
      }
      return;
    }
    const win = native.matching(matchesWindow)[0];
    if (opened) {
      if (frame.scene === origin && win) submitted = identity ? submitIdentity(win) : submitNation(win);
      return;
    }
    if (win) throw new Error('请先关闭原生建房窗口，再启动自动建房');
    const button = identity ? [view.createRoomSBtn, view.createRoomBtn].find(usable) : view.createOFRoomBtn;
    if (!usable(button)) return;
    const open = identity ? view.onCreateRoomClickCheck : view.onShowOfWindow;
    origin = frame.scene;
    if (typeof open === 'function') { opened = true; open.call(view); }
    else opened = press(button);
  }

  return { password, step, cancel() {
    cancelled = true;
    for (const release of releases.splice(0)) release();
  } };
}
