import { read } from '../../shared/safe-read.js';
import { POKER_TABLE_SCENE } from '../../shared/poker-table-mode.js';
import { CANCEL_MATCH, mountNativeMatchTime, START_MATCH } from './native-match.js';
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
const SESSION_KEY = 'sgs-poker-probe-approved';
const TEST_NOTICE_KEY = 'matchTestNoticeShown';
const DEV_KEY = '__SGS_POKER_MATCH__';
const TEST_NOTICE = '此功能在测试中，仅用于小号。';
const CONFIRM_LABEL = '确认仅小号测试';
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

// The stock button is the only match control: one click starts, the same click cancels.
export function forcedMatchLabel({ step, prepared, preparing }, armed) {
  if (step === 'entering') return '等待入场…';
  if (step === 'entered') return '开始匹配';
  if (step === 'matching' || step === 'queued' || step === 'cancelling') return '取消匹配';
  if (step === 'seated') return prepared ? '等待开局' : preparing ? '准备中…' : '发送准备';
  // The table opens by itself once the game starts; no manual jump remains.
  if (step === 'started') return '已开局';
  if (armed) return CONFIRM_LABEL;
  if (step === 'failed') return '重试匹配';
  return '开始匹配';
}

const forcedMatchEnabled = ({ step, prepared, preparing }) => !['entering', 'cancelling', 'started'].includes(step)
  && !(step === 'seated' && (prepared || preparing));

export function forcedMatchStatus(state, armed) {
  if (state.step === 'failed') return state.error;
  if (STATUS[state.step]) return STATUS[state.step];
  if (state.step === 'seated') return state.error || (state.prepared ? '已准备，等待开局。'
    : state.preparing ? '正在等待准备确认…' : '已入座牌桌，可以发送准备。');
  if (state.step === 'started') return '已开局，正在进入牌桌。';
  if (armed) return '再次点击确认后开始匹配。';
  return '经典版尚未开放此场次，将直接向服务器请求匹配。';
}

function nativeWord(state, armed) {
  if (armed) return null;
  if (state.step === 'idle' || state.step === 'entered') return 'start_match_words';
  if (state.step === 'matching' || state.step === 'queued' || state.step === 'cancelling') return 'canel_match_words';
  return null;
}

// Binds the stock match button to the direct request. The first use in a
// browser session asks for confirmation on the button itself.
export function mountPokerForcedMatch(ctx, scope, scene, click, active, log = () => {}) {
  const proxy = ctx.game.getServerProxy?.();
  const manager = scene.adManager;
  const room = scene.rc;
  const stock = scene.startBtn;
  const account = String(ctx.native?.account?.().id || '');
  // The confirmation has to be readable on the stock button itself.
  if (!account || !manager || manager.proxy !== proxy || typeof manager.SendEnterPage !== 'function'
      || typeof manager.Bt !== 'function' || typeof proxy?.AddEventListener !== 'function'
      || typeof proxy.RemoveEventListener !== 'function' || room?.proxy !== proxy || typeof stock?.on !== 'function'
      || typeof stock.off !== 'function' || !('label' in stock)) return false;

  const connection = proxy.ConnId;
  const isCurrent = () => active() && proxy.ConnId === connection && proxy.ConnectedSucess1 === true
    && proxy.IsOffline !== true;
  const caller = {};
  const word = stock.WordTex;
  const previousStock = {
    visible: stock.visible, enabled: stock.enabled, mouseEnabled: stock.mouseEnabled,
    label: stock.label, labelSize: stock.labelSize, gray: stock.keepGray ?? stock.Gray,
    wordVisible: word && typeof word === 'object' ? word.visible : undefined,
    wordTexture: word && typeof word === 'object' ? word.texture : undefined,
  };
  const showMatchTime = mountNativeMatchTime(ctx, scope, scene);
  let armed = false, armTimer, approved = false, testNoticeShown = false;
  let connected = isCurrent();
  try { approved = ctx.window.sessionStorage?.getItem(SESSION_KEY) === '1'; } catch { approved = false; }

  const session = createPokerForcedMatchSession({
    scope, proxy, manager, room, account, isCurrent,
    onChange(state) {
      if (!isCurrent()) return;
      if (state.step !== 'idle' && state.step !== 'failed') clearArmed();
      applyNative(state);
    },
    log,
  });

  function clearArmed() {
    if (armTimer) { clearTimeout(armTimer); armTimer = undefined; }
    armed = false;
  }

  function act(event) {
    event?.stopPropagation?.();
    const state = session.state;
    if (!isCurrent() || !forcedMatchEnabled(state)) return;
    if (state.step === 'idle' || state.step === 'failed') {
      if (!testNoticeShown && read(() => ctx.settings.get(TEST_NOTICE_KEY, false)) !== true) {
        testNoticeShown = true;
        ctx.notify(TEST_NOTICE);
        read(() => ctx.settings.set(TEST_NOTICE_KEY, true));
      }
      if (!approved) {
        if (!armed) {
          armed = true;
          armTimer = scope.timeout(() => {
            clearArmed();
            if (active()) applyNative(session.state);
          }, 8000);
          applyNative(session.state);
          return;
        }
        approved = true;
        try { ctx.window.sessionStorage?.setItem(SESSION_KEY, '1'); } catch { /* Ignore. */ }
      }
      clearArmed();
      // Accepting the notice is already the click that starts this match.
      session.enter({ autoStart: true });
      return;
    }
    if (state.step === 'entered') { session.start(); return; }
    if (state.step === 'matching' || state.step === 'queued') session.cancel();
    else if (state.step === 'seated' && room.TableId === state.table) session.ready();
  }

  function applyNative(state) {
    const enabled = isCurrent() && forcedMatchEnabled(state);
    const wordTexture = nativeWord(state, armed);
    const queued = isCurrent() && (state.step === 'queued' || state.step === 'cancelling');
    showMatchTime(queued);
    const effect = scene.matchEffect;
    // The activity manager starts its animation before our start-reply listener.
    if (!queued && state.step !== 'matching' && effect?.visible) {
      ctx.window.Laya?.Tween?.clearAll?.(effect);
      effect.Stop?.();
      effect.visible = false;
    }
    stock.visible = true;
    stock.Gray = !enabled;
    stock.enabled = stock.mouseEnabled = enabled;
    if ('labelSize' in stock) stock.labelSize = 20;
    stock.label = wordTexture ? '' : forcedMatchLabel(state, armed);
    if (wordTexture) stock.WordTex = wordTexture;
    if (word && typeof word === 'object' && !word.destroyed) word.visible = Boolean(wordTexture);
  }

  stock.on(click, caller, act);
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
      clearArmed();
      applyNative(session.state);
    }
    if (!next) return;
    const seat = read(() => room.GetTableSeatInfoByUserId(account));
    if (String(seat?.ClientId) === account && !seat.IsViewer) {
      session.sync({ tableId: room.TableId, gameStart: room.IsGameStart === true });
    }
  }, 500);
  scope.add(() => {
    if (!stock.destroyed) stock.off(click, caller, act);
    if (!stock.destroyed) {
      stock.visible = previousStock.visible;
      stock.enabled = previousStock.enabled;
      stock.mouseEnabled = previousStock.mouseEnabled;
      stock.label = previousStock.label;
      if ('labelSize' in stock) stock.labelSize = previousStock.labelSize;
      if ('Gray' in stock) stock.Gray = previousStock.gray;
      if (typeof word === 'string') stock.WordTex = word;
      if (word && typeof word === 'object' && !word.destroyed) {
        word.visible = previousStock.wordVisible;
        if (previousStock.wordTexture !== undefined && word.texture !== previousStock.wordTexture) {
          word.texture = previousStock.wordTexture;
        }
      }
    }
  });

  if (ctx.core?.distribution === 'dev') {
    const handle = {
      account,
      get state() { return session.state; },
      get action() { return forcedMatchLabel(session.state, armed); },
      get enabled() { return isCurrent() && forcedMatchEnabled(session.state); },
      get approved() { return approved; },
      get armed() { return armed; },
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
    match: () => act(),
    get enabled() { return isCurrent() && forcedMatchEnabled(session.state); },
    get assigned() {
      const { step, table } = session.state;
      return isCurrent() && ['seated', 'started'].includes(step) && table > 0 && table === room.TableId;
    },
    get label() { return forcedMatchLabel(session.state, armed); },
    get status() { return isCurrent() ? forcedMatchStatus(session.state, armed) : '连接不可用，请重新进入大厅。'; },
  };
}
