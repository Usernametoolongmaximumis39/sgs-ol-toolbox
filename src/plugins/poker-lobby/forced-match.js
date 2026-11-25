import { read } from '../../shared/safe-read.js';
import { POKER_TABLE_SCENE } from '../../shared/poker-table-mode.js';
import { CANCEL_MATCH, mountNativeMatchTime, START_MATCH } from './native-match.js';
import { bindMatchButton, confirmPokerMatch, createMatchCancelDelay } from './match-button.js';
import { isPokerTableId, POKER_MODE as MODE, POKER_SECTION as SECTION } from './poker-room.js';

const ENTER_PAGE = 2;
const ENTER_REPLY = 20402;
const MATCH_REPLY = 20546;
const SIT_REPLY = 20504;
const READY_REPLY = 21204;
const GAME_START = 21208;
const ENTER_TIMEOUT = 10000;
const MATCH_TIMEOUT = 12000;
const CANCEL_TIMEOUT = 10000;
const READY_TIMEOUT = 8000;
const DEV_KEY = '__SGS_POKER_MATCH__';
const STATUS = {
  entering: '正在进入初级场…', entered: '已入场，可以开始匹配。', matching: '正在提交匹配…',
  queued: '正在匹配，等待分配牌桌…', cancelling: '正在取消匹配…',
};

const ENTER_RESULTS = {
  1: '成功', 2: '无分页', 3: '参数错误', 4: '仅一人', 5: '当前分页', 6: '未知错误', 7: '对局中',
  24: '模式限制', 26: '模式关闭', 27: '条件不足', 28: '武将池限制',
};
const MATCH_RESULTS = {
  1: '成功', 2: '无此模式', 3: '已在其他牌桌', 4: '失败', 5: '条件不足', 12: '活动未配置',
  14: '体力不足', 19: '逃跑惩罚', 24: '不在同一公会', 25: '公会时间不足', 26: '禁赛惩罚',
  27: '禁止匹配', 28: '不允许匹配', 29: '队伍不匹配', 30: '排位惩罚', 72: '斗地主未结束',
  1000: '离开成功', 1001: '离开失败（已入桌）', 1002: '队伍不允许',
};

const resultName = (table, code) => table[code] || `结果 ${code}`;

// Classic offers no PC entry for this mode. The lobby asks the server directly
// through the stock activity manager senders and follows the same replies.
export function createPokerForcedMatchSession({ scope, proxy, manager, room, account, onChange, isCurrent = () => !scope.closed, log = () => {} }) {
  let step = 'idle', table = 0, error = '', prepared = false, preparing = false, timer, startAfterEnter = false;
  const state = () => ({ step, table, error, prepared, preparing, account });
  const changed = () => { try { onChange?.(state()); } catch { /* Repaint errors must not stop the match. */ } };
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = undefined; } };
  const fail = message => { clearTimer(); step = 'failed'; error = message; changed(); };
  const schedule = (fn, ms) => {
    clearTimer();
    timer = scope.timeout(() => { timer = undefined; fn(); }, ms);
  };
  const sync = ({ tableId, gameStart } = {}) => {
    if (!isCurrent() || !['seated', 'matching', 'queued', 'cancelling'].includes(step)
      || !(isPokerTableId(tableId) || table > 0 && tableId === table)) return false;
    const next = gameStart === true ? 'started' : 'seated';
    if (table === tableId && step === next) return false;
    if (table !== tableId) prepared = false;
    preparing = false;
    clearTimer();
    table = tableId;
    step = next;
    error = '';
    log(gameStart === true ? '已开局' : '已分配牌桌');
    changed();
    return true;
  };

  // One click queues as soon as this connection confirms the entry, matching
  // the stock lobby. Diagnostics can still enter and start separately.
  function enter({ autoStart = false } = {}) {
    if (!isCurrent() || !['idle', 'failed'].includes(step)) return false;
    step = 'entering'; table = 0; error = ''; prepared = false;
    startAfterEnter = autoStart === true;
    log('进入初级场');
    changed();
    schedule(() => { if (step === 'entering') { log('入场无回包'); fail(`入场无回包（${ENTER_TIMEOUT / 1000} 秒）`); } }, ENTER_TIMEOUT);
    try { manager.SendEnterPage(ENTER_PAGE, MODE, SECTION); }
    catch (cause) { log('入场请求发送失败'); fail(`入场请求发送失败：${cause?.message || cause}`); return false; }
    return true;
  }

  function start() {
    if (!isCurrent() || step !== 'entered') return false;
    step = 'matching'; error = '';
    log('开始匹配');
    changed();
    schedule(() => { if (step === 'matching') { log('匹配无回包'); fail(`匹配无回包（${MATCH_TIMEOUT / 1000} 秒）`); } }, MATCH_TIMEOUT);
    try { manager.Bt(START_MATCH, MODE, 0, SECTION); }
    catch (cause) { log('匹配请求发送失败'); fail(`匹配请求发送失败：${cause?.message || cause}`); return false; }
    return true;
  }

  function cancel() {
    if (!isCurrent() || !['matching', 'queued'].includes(step)) return false;
    step = 'cancelling'; error = ''; prepared = false;
    log('取消匹配');
    changed();
    schedule(() => { if (step === 'cancelling') { log('取消无回包'); fail(`取消无回包（${CANCEL_TIMEOUT / 1000} 秒）`); } }, CANCEL_TIMEOUT);
    try { manager.Bt(CANCEL_MATCH, MODE, 0, SECTION); }
    catch (cause) { log('匹配请求发送失败'); fail(`匹配请求发送失败：${cause?.message || cause}`); return false; }
    return true;
  }

  function ready() {
    if (!isCurrent() || step !== 'seated' || prepared || preparing) return false;
    const send = typeof room?.Ft === 'function' ? room.Ft.bind(room)
      : typeof room?.Zt === 'function' ? room.Zt.bind(room) : null;
    if (!send) { log('无法发送准备'); return false; }
    const retry = message => { clearTimer(); preparing = false; error = message; changed(); };
    preparing = true;
    error = '';
    log('发送准备');
    changed();
    schedule(() => { log('准备无回包'); retry('未收到准备确认，可以重试。'); }, READY_TIMEOUT);
    try { send(true); }
    catch (cause) { retry(`准备请求发送失败：${cause?.message || cause}`); return false; }
    return true;
  }

  const caller = {};
  const receive = (id, handler) => {
    const listener = event => read(() => {
      const data = event?.Protocol;
      if (isCurrent() && data?.Id === id) handler(data);
    });
    proxy.AddEventListener(id, caller, listener);
    scope.add(() => proxy.RemoveEventListener(id, caller, listener));
  };
  receive(ENTER_REPLY, data => {
    if (data.LabelModel !== MODE || data.SectionKind !== SECTION) return;
    if (step !== 'entering') return;
    clearTimer();
    log('入场结果', data.Result);
    if (data.Result === 1 || data.Result === 2) {
      step = 'entered'; error = '';
      if (startAfterEnter) { start(); return; }
    } else { step = 'failed'; error = data.why || `入场失败：${resultName(ENTER_RESULTS, data.Result)}`; }
    changed();
  });
  receive(MATCH_REPLY, data => {
    if (data.model !== MODE) return;
    if (step === 'matching' && data.opType === START_MATCH) {
      clearTimer();
      log('匹配结果', data.result);
      if (data.result === 1) { step = 'queued'; error = ''; }
      else { step = 'failed'; error = `匹配失败：${resultName(MATCH_RESULTS, data.result)}`; }
    } else if (step === 'cancelling' && data.opType === CANCEL_MATCH) {
      log('取消匹配结果', data.result);
      // The native queue can assign a table before cancellation reaches the server.
      if (data.result === 1 || data.result === 1001) { step = 'queued'; error = ''; }
      else { clearTimer(); step = 'entered'; error = ''; }
    } else return;
    changed();
  });
  receive(SIT_REPLY, data => {
    if (data.RealModel !== MODE || data.GroupID !== SECTION) return;
    if (data.Result === 1 && data.IsViewer !== true && Number.isSafeInteger(data.TableID) && data.TableID > 0
      && ['matching', 'queued', 'cancelling', 'seated'].includes(step) && (step !== 'seated' || data.TableID !== table)) {
      clearTimer(); table = data.TableID; step = 'seated'; error = ''; prepared = preparing = false;
      log('已分配牌桌');
    }
    changed();
  });
  receive(READY_REPLY, data => {
    if (step !== 'seated' || !preparing) return;
    log('准备结果', data.Result);
    clearTimer();
    preparing = false;
    prepared = data.Result === 1;
    error = prepared ? '' : `准备未确认（结果 ${data.Result}）。`;
    changed();
  });
  receive(GAME_START, data => {
    const currentTable = room?.TableId ?? table;
    const own = Array.isArray(data.Infos) && data.Infos.some(row => String(row?.ClientID) === account);
    if (data.IsGameStart === true && (own || step === 'seated' && currentTable === table)) {
      sync({ tableId: currentTable, gameStart: true });
      return;
    }
    changed();
  });
  scope.add(() => clearTimer());

  return { get state() { return state(); }, enter, start, cancel, ready, sync };
}

const cancelLabel = ({ step }) => ['entering', 'matching', 'queued', 'cancelling'].includes(step);
const matchVisible = ({ step }) => step !== 'seated' && step !== 'started';

// The toolbox can still offer preparation after the stock match button disappears.
export function forcedMatchLabel(state) {
  if (cancelLabel(state)) return '取消匹配';
  if (state.step === 'seated') return state.prepared ? '等待开局' : state.preparing ? '准备中…' : '发送准备';
  return '开始匹配';
}

export function forcedMatchStatus(state) {
  if (state.step === 'failed') return state.error;
  if (STATUS[state.step]) return STATUS[state.step];
  if (state.step === 'seated') return state.error || (state.prepared ? '已准备，等待开局。'
    : state.preparing ? '正在等待准备确认…' : '已入座牌桌，可以发送准备。');
  if (state.step === 'started') return '已开局，正在进入牌桌。';
  return '经典版尚未开放此场次，将直接向服务器请求匹配。';
}

// Keep the stock button for starting/cancelling; the toolbox handles first-use confirmation.
export function mountPokerForcedMatch(ctx, scope, scene, click, active, log = () => {}) {
  const proxy = ctx.game.getServerProxy?.();
  const manager = scene.adManager;
  const room = scene.rc;
  const stock = scene.startBtn;
  const account = String(ctx.native?.account?.().id || '');
  if (!account || !manager || manager.proxy !== proxy || typeof manager.SendEnterPage !== 'function'
      || typeof manager.Bt !== 'function' || typeof proxy?.AddEventListener !== 'function'
      || typeof proxy.RemoveEventListener !== 'function' || room?.proxy !== proxy || typeof stock?.on !== 'function'
      || typeof stock.off !== 'function') return false;

  const connection = proxy.ConnId;
  const isCurrent = () => active() && proxy.ConnId === connection && proxy.ConnectedSucess1 === true
    && proxy.IsOffline !== true;
  const caller = {};
  const paintButton = bindMatchButton(scope, scene);
  const showMatchTime = mountNativeMatchTime(ctx, scope, scene);
  const cancelDelay = createMatchCancelDelay(scope, () => { if (active()) applyNative(session.state); });
  const enabled = ({ step, prepared, preparing, table }) => isCurrent() && (
    !scene.matchSuccess && ['idle', 'failed', 'entered'].includes(step)
      || step === 'queued' && !cancelDelay.locked && !scene.matchSuccess
      || step === 'seated' && room.TableId === table && !prepared && !preparing
  );
  let connected = isCurrent();

  const session = createPokerForcedMatchSession({
    scope, proxy, manager, room, account, isCurrent,
    onChange(state) {
      if (!isCurrent()) return;
      applyNative(state);
    },
    log,
  });

  function act() {
    const state = session.state;
    if (!enabled(state)) return;
    if (state.step === 'idle' || state.step === 'failed' || state.step === 'entered') {
      if (!confirmPokerMatch(ctx) || !enabled(session.state) || session.state.step !== state.step) return;
      cancelDelay.start();
      if (state.step === 'entered') session.start();
      else session.enter({ autoStart: true });
    } else if (state.step === 'queued') session.cancel();
    else if (state.step === 'seated') session.ready();
  }

  function stockClick(event) {
    event?.stopPropagation?.();
    if (matchVisible(session.state)) act();
  }

  function applyNative(state) {
    const queued = isCurrent() && (state.step === 'queued' || state.step === 'cancelling');
    showMatchTime(queued);
    const effect = scene.matchEffect;
    // The activity manager starts its animation before our start-reply listener.
    if (!queued && state.step !== 'matching' && effect?.visible) {
      ctx.window.Laya?.Tween?.clearAll?.(effect);
      effect.Stop?.();
      effect.visible = false;
    }
    const visible = matchVisible(state) && !scene.matchSuccess;
    paintButton({ cancel: cancelLabel(state), visible, enabled: visible && enabled(state) });
  }

  stock.on(click, caller, stockClick);
  for (const key of ['UpdateBtnStatus', 'tableInfoRep']) {
    if (typeof scene[key] !== 'function') continue;
    scope.patch(scene, key, original => function (...args) {
      const result = Reflect.apply(original, this, args);
      if (this === scene && active()) applyNative(session.state);
      return result;
    });
  }
  scope.interval(() => {
    if (!active()) return;
    const next = isCurrent();
    if (next !== connected) {
      connected = next;
      applyNative(session.state);
    }
    if (!next) return;
    const seat = read(() => room.GetTableSeatInfoByUserId(account));
    if (String(seat?.ClientId) === account && !seat.IsViewer) {
      session.sync({ tableId: room.TableId, gameStart: room.IsGameStart === true });
    }
  }, 500);
  scope.add(() => { if (!stock.destroyed) stock.off(click, caller, stockClick); });

  if (ctx.core?.distribution === 'dev') {
    const handle = {
      account,
      get state() { return session.state; },
      get action() { return forcedMatchLabel(session.state); },
      get enabled() { return enabled(session.state); },
      diagnose: () => {
        const gameContext = ctx.game.getClass?.('GameContext');
        const current = ctx.game.getScene?.();
        return {
          scene: current?.SceneName || current?.sceneName || '',
          tableId: Number.isSafeInteger(room?.TableId) ? room.TableId : null,
          gameStart: room?.IsGameStart === true,
          mode: gameContext?.GetModeType?.() ?? null,
          group: gameContext?.GetGroupID?.() ?? null,
          nativeTable: Boolean(ctx.game.getClass?.(POKER_TABLE_SCENE)),
        };
      },
    };
    try { ctx.window[DEV_KEY] = handle; } catch { /* Ignore a locked window. */ }
    scope.add(() => {
      try { if (ctx.window[DEV_KEY] === handle) delete ctx.window[DEV_KEY]; } catch { /* Ignore. */ }
    });
  }

  applyNative(session.state);
  return {
    match: act,
    get enabled() { return enabled(session.state); },
    get showAction() { return session.state.step !== 'started'; },
    get assigned() {
      const { step, table } = session.state;
      return isCurrent() && ['seated', 'started'].includes(step) && table > 0 && table === room.TableId;
    },
    get label() { return forcedMatchLabel(session.state); },
    get status() { return isCurrent() ? forcedMatchStatus(session.state) : '连接不可用，请重新进入大厅。'; },
  };
}
