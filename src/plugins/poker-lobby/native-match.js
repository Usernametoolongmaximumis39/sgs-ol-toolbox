import { read } from '../../shared/safe-read.js';
import { bindMatchButton, confirmPokerMatch, createMatchCancelDelay } from './match-button.js';

const MODE = 175;
const SECTION = 2;
const ENTER_PAGE = 2;
export const START_MATCH = 1;
export const CANCEL_MATCH = 2;
const ENTER_REPLY = 20402;
const MATCH_REPLY = 20546;
const SIT_REPLY = 20504;
const MATCH_STATUS = {
  idle: '可以在大厅开始匹配。',
  entering: '正在进入初级场…',
  starting: '正在提交匹配…',
  matching: '正在匹配…',
  cancelling: '正在取消匹配…',
  joining: '正在进入牌桌…',
};

// Both clients encode this as ClientCmodelMkTblReq.
export function requestPokerMatch(send, operation) {
  send(operation, MODE, 0, SECTION);
}

export function pokerMatchPlatform(room, mode) {
  return read(() => {
    if (mode?.NoSupportPC === true) return 'remastered';
    const forbidden = room?.IsForbidInPC?.(MODE, SECTION, false);
    if (forbidden === true) return 'remastered';
    if (forbidden === false && mode?.ModeID === MODE && mode.Section === SECTION) return 'classic';
    return null;
  });
}

export function mountNativeMatchTime(ctx, scope, scene) {
  const clock = scene.MatchTime;
  const timer = ctx.window.Laya?.timer;
  if (!timer || typeof clock?.SetTime !== 'function' || typeof clock.timerHandler !== 'function') return () => {};

  const now = () => ctx.window.performance.now();
  let startedAt = null;
  scope.patch(clock, 'timerHandler', original => function (...args) {
    if (this === clock && startedAt !== null) this.time = Math.floor((now() - startedAt) / 1000) - 1;
    return Reflect.apply(original, this, args);
  });

  function stop() {
    if (startedAt === null) return;
    startedAt = null;
    timer.clear(clock, clock.timerHandler);
    if (!clock.destroyed) clock.visible = false;
  }
  scope.add(stop);

  return waiting => {
    if (!waiting) { stop(); return; }
    if (clock.destroyed) return;
    if (startedAt === null) {
      startedAt = now();
      clock.SetTime(60);
    }
    clock.timerHandler();
    clock.visible = true;
  };
}

export function mountPokerMatch(ctx, scope, scene, click, mode, active, log = () => {}) {
  const proxy = ctx.game.getServerProxy?.();
  const room = scene.rc;
  const manager = scene.adManager;
  const button = scene.startBtn;
  const supported = () => pokerMatchPlatform(room, mode) === 'classic';
  if (!supported() || !proxy || manager?.proxy !== proxy || room?.proxy !== proxy
      || typeof manager.SendEnterPage !== 'function' || typeof manager.Bt !== 'function'
      || typeof mode.GetOpenState !== 'function' || typeof scene.UpdateBtnStatus !== 'function'
      || !scene.matchEffect || !scene.MatchTime
      || typeof proxy.AddEventListener !== 'function' || typeof proxy.RemoveEventListener !== 'function') return false;

  const showMatchTime = mountNativeMatchTime(ctx, scope, scene);
  const paintButton = bindMatchButton(scope, scene);
  const cancelDelay = createMatchCancelDelay(scope, refresh);
  const canCancel = () => phase === 'matching' && !cancelDelay.locked && waitable() && !scene.matchSuccess;
  const sendMatch = manager.Bt.bind(manager);
  let phase = 'idle';
  let connection;
  let table;
  let shownTable;
  const caller = {};
  const connected = () => active() && proxy.ConnectedSucess1 === true && proxy.IsOffline !== true
    && ctx.game.getServerProxy() === proxy;
  const waitable = () => connected() && proxy.ConnId === connection;
  const ready = () => connected() && supported() && room.CanSendEnterPage === true && room.TableId === 0
    && room.IsGameStart !== true && scene.tmManager?.CanStart !== false
    && !ctx.game.isInGame?.() && !ctx.game.isReplay?.(scene);
  const restoreNative = () => !scene.destroyed && ctx.game.getScene() === scene;
  const stockMatchState = scene.matchStateChange;
  const rebindMatchState = typeof stockMatchState === 'function' && typeof manager.on === 'function'
    && typeof manager.off === 'function';
  if (rebindMatchState) {
    manager.off('MATCH_STATE_CHANGE', scene, stockMatchState);
    scope.add(() => {
      if (restoreNative() && scene.matchStateChange === stockMatchState) manager.on('MATCH_STATE_CHANGE', scene, stockMatchState);
    });
  }

  function refresh() {
    if (!active()) { showMatchTime(false); return; }
    scene.UpdateBtnStatus();
    showMatchTime(phase === 'matching' || phase === 'cancelling');
  }

  function setPhase(next) {
    phase = next;
    refresh();
  }

  const canStart = () => phase === 'idle' && !manager.IsMatching && ready() && !scene.matchSuccess;
  const cancelLabel = () => ['entering', 'starting', 'matching', 'cancelling'].includes(phase);
  scope.patch(scene, 'UpdateBtnStatus', original => function (...args) {
    if (this !== scene || !active()) return Reflect.apply(original, this, args);
    const waiting = phase === 'matching' || phase === 'cancelling';
    // The activity manager's shared flag changes before the mode-specific reply
    // reaches the lobby. Only animate the phase verified for this request.
    const result = phase === 'joining' || manager.IsMatching === waiting
      ? Reflect.apply(original, this, args) : undefined;
    paintButton({ cancel: cancelLabel(), enabled: canStart() || canCancel(), visible: phase !== 'joining' && !scene.matchSuccess });
    return result;
  });
  if (typeof scene.BackBtnClickHandler === 'function') {
    scope.patch(scene, 'BackBtnClickHandler', original => function (...args) {
      if (this === scene && active() && phase !== 'idle' && phase !== 'entering') return true;
      return Reflect.apply(original, this, args);
    });
  }

  function send(op) {
    setPhase(op === START_MATCH ? 'starting' : 'cancelling');
    log(op === START_MATCH ? '开始匹配' : '取消匹配');
    try { requestPokerMatch(sendMatch, op); }
    catch {
      log('匹配请求发送失败');
      setPhase(op === START_MATCH ? 'idle' : 'matching');
      ctx.notify('匹配请求发送失败。');
    }
  }

  function act() {
    if (canCancel()) {
      send(CANCEL_MATCH);
      return;
    }
    if (!canStart()) return;
    if (mode.GetOpenState() !== 0 || mode.IsOpenTime !== true) {
      ctx.notify('三国斗地主当前未开放匹配。');
      return;
    }
    if (Number.isFinite(scene.coinOwnCnt) && scene.coinOwnCnt <= 0) {
      ctx.notify('欢乐豆不足。');
      return;
    }
    if (!confirmPokerMatch(ctx) || !canStart()) return;
    connection = proxy.ConnId;
    cancelDelay.start();
    setPhase('entering');
    log('进入初级场');
    try { manager.SendEnterPage(ENTER_PAGE, MODE, SECTION); }
    catch {
      log('入场请求发送失败');
      setPhase('idle');
      ctx.notify('无法请求进入三国斗地主初级场。');
    }
  }

  function receive(id, handle) {
    const listener = event => read(() => {
      const data = event?.Protocol;
      if (waitable() && data?.Id === id) handle(data);
    });
    proxy.AddEventListener(id, caller, listener);
    scope.add(() => proxy.RemoveEventListener(id, caller, listener));
  }
  receive(ENTER_REPLY, data => {
    if (phase !== 'entering' || data.LabelModel !== MODE || data.SectionKind !== SECTION) return;
    log('入场结果', data.Result);
    if (data.Result !== 1 && data.Result !== 2) {
      setPhase('idle');
      ctx.notify(data.why || '服务器未允许进入三国斗地主初级场。');
      return;
    }
    if (!ready() || manager.IsMatching || manager.TypeID !== MODE || manager.Section !== SECTION
      || mode.GetOpenState() !== 0 || mode.IsOpenTime !== true || scene.hasReputationPunish
      || scene.tmManager?.CheckHasPunishLeftTime?.(MODE, scene.ttManager?.CurrentTTType ?? 0) === true) {
      setPhase('idle');
      return;
    }
    send(START_MATCH);
  });
  receive(MATCH_REPLY, data => {
    if (data.model !== MODE) return;
    if (phase === 'starting' && data.opType === START_MATCH) phase = data.result === 1 ? 'matching' : 'idle';
    else if (phase === 'cancelling' && data.opType === CANCEL_MATCH) {
      // The native queue can assign a table before cancellation reaches the server.
      if (data.result === 1 || data.result === 1001) {
        log('取消匹配结果', data.result);
        setPhase('joining');
        return;
      }
      phase = 'idle';
    } else return;
    log(data.opType === START_MATCH ? '匹配结果' : '取消匹配结果', data.result);
    if (rebindMatchState) stockMatchState.call(scene, data.result, data.param);
    refresh();
  });
  receive(SIT_REPLY, data => {
    if (phase === 'idle' || phase === 'entering' || data.Result !== 1 || data.IsViewer === true
      || data.RealModel !== MODE || data.GroupID !== SECTION
      || !Number.isSafeInteger(data.TableID) || data.TableID <= 0) return;
    if (table) return;
    table = data.TableID;
    log('已分配牌桌');
    setPhase('joining');
  });

  const leave = () => {
    if (phase !== 'joining' || !table || room.IsGameStart) return;
    table = shownTable = null;
    scene.matchSuccess = false;
    if (scene.matchSucView) scene.matchSucView.visible = false;
    scene.setOtherUIVisible?.(true);
    setPhase('idle');
  };
  if (typeof room.on === 'function' && typeof room.off === 'function') {
    const stockTableInfo = scene.tableInfoRep;
    if (typeof stockTableInfo === 'function') {
      const event = room.constructor?.TABLE_INFO_REP_EVENT || 'TABLE_INFO_REP_EVENT';
      const showPregame = (...args) => {
        if (!waitable() || phase !== 'joining' || !table || table !== room.TableId || table === shownTable) return;
        const self = room.GetTableSeatInfoByUserId?.(ctx.native.account().id);
        if (String(self?.ClientId) !== ctx.native.account().id || self.IsViewer) return;
        shownTable = table;
        stockTableInfo.apply(scene, args);
      };
      room.off(event, scene, stockTableInfo);
      room.on(event, caller, showPregame);
      scope.add(() => {
        room.off(event, caller, showPregame);
        if (restoreNative() && scene.tableInfoRep === stockTableInfo) room.on(event, scene, stockTableInfo);
      });
    }
    const event = room.constructor?.LEAVE_TABLE_EVENT || 'LEAVE_TABLE_EVENT';
    room.on(event, caller, leave);
    scope.add(() => room.off(event, caller, leave));
  }

  button.on(click, caller, act);
  scope.add(() => { if (!button.destroyed) button.off(click, caller, act); });
  scope.interval(() => {
    if (phase !== 'idle' && (phase !== 'joining' || !table) && !waitable()) setPhase('idle');
    else if (phase === 'idle' && active() && button.enabled !== canStart()) refresh();
  }, 500);
  refresh();
  return {
    match: act,
    get enabled() { return active() && button.enabled === true; },
    get showAction() { return phase !== 'joining' && !scene.matchSuccess; },
    get assigned() { return waitable() && phase === 'joining' && table > 0 && table === room.TableId; },
    get label() { return cancelLabel() ? '取消匹配' : '开始匹配'; },
    get status() {
      if (phase !== 'idle') return MATCH_STATUS[phase];
      if (!ready() || manager.IsMatching || scene.matchSuccess) return '当前无法开始匹配。';
      return mode.GetOpenState() === 0 && mode.IsOpenTime === true ? MATCH_STATUS.idle : '当前时段未开放匹配。';
    },
  };
}
