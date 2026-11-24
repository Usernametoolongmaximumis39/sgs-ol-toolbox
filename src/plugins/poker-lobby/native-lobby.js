import { ResourceScope } from '../../core/resources.js';
import { POKER_TABLE_SCENE } from '../../shared/poker-table-mode.js';
import { read } from '../../shared/safe-read.js';
import { mountPokerMatch, pokerMatchPlatform } from './native-match.js';
import { mountPokerForcedMatch } from './forced-match.js';
import { canSwitchPokerLiveTable, openPokerLiveTable } from './live/native-table.js';
import { openNativePokerPool } from './native-pool.js';
import { openPokerRankWindow, openPokerStatsWindow } from './native-windows.js';
import { bindPokerRules } from './rules.js';
import { mountPokerStreak } from './streak.js';

export const STOCK_SCENE = 'DouDiZhu2023Scene';
export const LOBBY_ART = 'https://web.sanguosha.com/220/miniGame/release/client/version/version_26/res/assets/BigBg/doudizhu_bg.png';
const ACTIVITY_MODE_TAB = 3;
const STOCK_BUTTONS = ['zgs_rank_tex', 'zgs_general_tex', 'zgs_win_info_tex'];
const STOCK_ONLY = ['pMethodPanel', 'sprBigTab', 'sprJbs', 'enterTips', 'relaxedSprite',
  'joinBtn', 'cancelBtn', 'awardBtn', 'gotoBtn', 'gotoTxt', 'lbOpenTime'];
const MATCH_UI = ['matchEffect', 'timeUI', 'punishTImeTxt'];
const MATCH_SUCCESS_HOLD_MS = 2000;
const MATCH_LOG_LIMIT = 40;
const matchSuccessTimes = new WeakMap();

const sceneName = scene => scene?.SceneName || scene?.sceneName;
const matchSuccessVisible = scene => scene.matchSuccess === true && scene.matchSucView?.visible === true
  && !scene.matchSucView.destroyed && scene.visible !== false;

function saveProperty(scope, node, key, value) {
  const previous = node[key];
  node[key] = value;
  scope.add(() => { if (!node.destroyed && node[key] === value) node[key] = previous; });
}

function nativeListener(scope, node, event, caller, handler) {
  node.on(event, caller, handler);
  scope.add(() => { if (!node.destroyed) node.off(event, caller, handler); });
}

function afterLayout(scope, scene, Laya, owner, update) {
  update();
  nativeListener(scope, Laya.stage, Laya.Event.RESIZE, owner, update);
  for (const key of ['OnStageResize', 'onAnimateInComplete']) {
    if (typeof scene[key] !== 'function') continue;
    scope.patch(scene, key, original => function (...args) {
      const result = Reflect.apply(original, this, args);
      update();
      return result;
    });
  }
}

// Neither the stock flow nor a direct request can run on this client.
function mountDisabledMatch(scope, scene) {
  const button = scene.startBtn;
  const wasGrey = button.keepGray ?? button.Gray;
  const update = () => {
    button.visible = true;
    button.enabled = button.mouseEnabled = false;
    button.Gray = true;
    if (!('label' in button)) button.WordTex = 'start_match_words';
  };
  saveProperty(scope, button, 'visible', true);
  saveProperty(scope, button, 'enabled', false);
  saveProperty(scope, button, 'mouseEnabled', false);
  if ('label' in button) saveProperty(scope, button, 'label', '暂不可用');
  scope.add(() => { if (!button.destroyed && (button.keepGray ?? button.Gray) === true) button.Gray = wasGrey; });
  update();
  if (typeof scene.UpdateBtnStatus === 'function') scope.patch(scene, 'UpdateBtnStatus', original => function (...args) {
    const result = Reflect.apply(original, this, args);
    update();
    return result;
  });
  return { match() {}, enabled: false, assigned: false, label: '开始匹配', status: '当前客户端无法发起三国斗地主匹配。' };
}

function mountArt(scope, Laya, scene) {
  if (!Laya.loader?.load || !Laya.Handler?.create || typeof scene.addChildAt !== 'function') return;
  try {
    Laya.loader.load(LOBBY_ART, Laya.Handler.create(null, texture => {
      if (scope.closed || scene.destroyed || !texture?.width || !texture?.height) return;
      const image = new Laya.Sprite();
      image.name = 'sgs-poker-lobby-art';
      image.mouseEnabled = false;
      image.zOrder = -100;
      const resize = () => {
        // The classic SceneLayer applies its own translation and scale for HiDPI and zoom.
        const width = scene.width > 0 ? scene.width : Laya.stage.width;
        const height = scene.height > 0 ? scene.height : Laya.stage.height;
        const scale = Math.max(width / texture.width, height / texture.height);
        const w = texture.width * scale, h = texture.height * scale;
        image.size(width, height);
        if (Laya.Rectangle) image.scrollRect = new Laya.Rectangle(0, 0, width, height);
        image.graphics.clear();
        image.graphics.drawTexture(texture, (width - w) / 2, (height - h) / 2, w, h);
      };
      scene.addChildAt(image, 0);
      afterLayout(scope, scene, Laya, image, resize);
      scope.add(() => { if (!image.destroyed) image.destroy(true); });
    }), null, Laya.Loader?.IMAGE || 'image');
  } catch { /* The native scene retains the loaded background. */ }
}

function readyScene(scene, Laya) {
  return sceneName(scene) === STOCK_SCENE && scene.initialized !== false && scene.visible !== false && !scene.destroyed
    && scene.topView?.nameTxt && typeof scene.startBtn?.on === 'function'
    && STOCK_BUTTONS.every(name => scene.btnList?.some(button => button.name === name))
    && typeof scene.onBtnClick === 'function' && typeof scene.startMatchHandlerCheck === 'function'
    && Laya?.stage && Laya.Event && Laya.Text;
}

function mountLobby(ctx, scene, Laya, sameSession, stop, mode, log) {
  const scope = new ResourceScope();
  scope.add(ctx.scope.add(() => scope.dispose()));
  const session = { ...ctx, scope };
  const active = () => !scope.closed && !scene.destroyed && scene.visible !== false
    && ctx.game.getScene() === scene && sameSession();
  try {
    const click = Laya.Event.CLICK;
    saveProperty(scope, scene.topView.nameTxt, 'text', '三国斗地主');
    if ('currnetModeType' in scene) saveProperty(scope, scene, 'currnetModeType', ACTIVITY_MODE_TAB);
    if (scene.sprStd) saveProperty(scope, scene.sprStd, 'visible', true);
    if (typeof scene.getTopInfo === 'function' && typeof scene.topMenu?.ShowTopInfo === 'function') {
      const restore = scope.patch(scene, 'getTopInfo', original => function (...args) {
        const path = Reflect.apply(original, this, args);
        return path.slice(0, path.lastIndexOf('\\') + 1) + '三国斗地主';
      });
      scene.topMenu.ShowTopInfo(scene.getTopInfo());
      scope.add(() => { restore(); if (!scene.destroyed) scene.topMenu?.ShowTopInfo(scene.getTopInfo()); });
    }

    const button = scene.startBtn;
    const stockMatch = scene.startMatchHandlerCheck;
    button.off(click, scene, stockMatch);
    scope.add(() => { if (!scene.destroyed && !button.destroyed) button.on(click, scene, stockMatch); });
    for (const key of ['startMatchHandlerCheck', 'startMatchHandler', 'cancelMatchHandler']) {
      if (typeof scene[key] === 'function') scope.patch(scene, key, () => () => {});
    }
    if (typeof scene.showMatchComplete === 'function') {
      scope.patch(scene, 'showMatchComplete', original => function (...args) {
        const alreadyVisible = matchSuccessVisible(scene);
        const result = Reflect.apply(original, this, args);
        if (this === scene && matchSuccessVisible(scene)) {
          const tableId = scene.rc?.TableId;
          const previous = matchSuccessTimes.get(scene.matchSucView);
          if (tableId > 0 && (!alreadyVisible || previous?.tableId !== tableId)) {
            matchSuccessTimes.set(scene.matchSucView, { tableId, shownAt: ctx.window.performance.now() });
          }
        }
        return result;
      });
    }
    const matchBound = mountPokerMatch(ctx, scope, scene, click, mode, active, log);
    // Only use the test path for a confirmed PC restriction, not for a
    // missing or incompatible native matcher.
    const forced = !matchBound && pokerMatchPlatform(scene.rc, mode) === 'remastered'
      && mountPokerForcedMatch(ctx, scope, scene, click, active, log);
    for (const key of matchBound || forced ? STOCK_ONLY : [...STOCK_ONLY, ...MATCH_UI]) {
      const node = scene[key];
      if (!node) continue;
      saveProperty(scope, node, 'alpha', 0);
      saveProperty(scope, node, 'visible', false);
      saveProperty(scope, node, 'mouseEnabled', false);
    }
    const actionsForMatch = matchBound || forced || mountDisabledMatch(scope, scene);
    log(matchBound ? '已进入经典版大厅' : forced ? '经典版未开放，直接请求匹配' : actionsForMatch.status);

    const actions = [openPokerRankWindow, openNativePokerPool, openPokerStatsWindow];
    const stockAction = scene.onBtnClick;
    STOCK_BUTTONS.forEach((name, index) => {
      const shortcut = scene.btnList.find(item => item.name === name);
      shortcut.off(click, scene, stockAction);
      scope.add(() => { if (!scene.destroyed && !shortcut.destroyed) shortcut.on(click, scene, stockAction); });
      nativeListener(scope, shortcut, click, scope, async () => {
        if (!active()) return;
        try {
          if (!await actions[index](session) && !scope.closed) ctx.notify('此入口暂未就绪，请稍后再试。');
        } catch (error) { if (!scope.closed) ctx.notify(error?.message || '无法打开三国斗地主窗口'); }
      });
    });

    bindPokerRules(session, scene, Laya);
    if (!mountPokerStreak(session, scene, Laya) && scene.winStreakView) {
      saveProperty(scope, scene.winStreakView, 'visible', false);
      saveProperty(scope, scene.winStreakView, 'mouseEnabled', false);
    }
    mountArt(scope, Laya, scene);
    scope.interval(() => { if (!sameSession() || scene.destroyed) stop(); }, 500);
    return { scope, actions: actionsForMatch, active };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}

export function createNativeLobby(ctx) {
  let pending, restoration, mounted, current, playbackOrigin, lastMatchLog;
  const accountId = () => ctx.native.account().id;
  const serverProxy = () => ctx.game.getServerProxy?.();
  const sameAccount = visit => !ctx.scope.closed && accountId() === visit.account;
  const sameSession = visit => sameAccount(visit) && serverProxy() === visit.proxy;
  const logForSession = () => lastMatchLog && sameSession(lastMatchLog)
    && lastMatchLog.proxy?.ConnId === lastMatchLog.connection ? lastMatchLog.entries : null;
  const actions = () => current?.active?.() ? current.actions : null;
  const canSwitchTable = () => actions()?.assigned === true && canSwitchPokerLiveTable(ctx);
  function stop() {
    current = null;
    mounted?.dispose();
    mounted = undefined;
  }
  ctx.scope.add(() => { playbackOrigin = lastMatchLog = undefined; stop(); });
  ctx.scope.add(ctx.game.onSceneChange?.(scene => {
    if (!current || scene === current.scene) return;
    if (sceneName(scene) === POKER_TABLE_SCENE && scene.parent && scene.parent === current.scene.parent) return;
    stop();
  }));

  function tryMount(scene, identity) {
    const Laya = ctx.window.Laya;
    if (!readyScene(scene, Laya) || !sameAccount(identity)) return false;
    const proxy = serverProxy();
    if (identity.proxy && proxy !== identity.proxy) return false;
    const visit = current = { account: identity.account, proxy, scene, mode: identity.mode };
    const connection = proxy?.ConnId;
    const entries = [];
    function log(event, result) {
      if (!sameSession(visit) || proxy?.ConnId !== connection) return;
      entries.push({ time: new Date().toISOString(), event, ...(Number.isSafeInteger(result) ? { result } : {}) });
      if (entries.length > MATCH_LOG_LIMIT) entries.shift();
    }
    try {
      const lobby = mountLobby(ctx, scene, Laya, () => sameSession(visit), stop, visit.mode, log);
      mounted = lobby.scope;
      Object.assign(visit, { actions: lobby.actions, active: lobby.active, log });
      lastMatchLog = { account: visit.account, proxy, connection, entries };
    }
    catch (error) {
      stop();
      if (ctx.core?.distribution === 'dev') ctx.window.console?.warn('三国斗地主原生大厅', error);
      ctx.notify('当前经典版大厅界面不兼容。');
    }
    return true;
  }

  function restoreAfterTable(visit, expectedScene = visit?.scene) {
    if (!visit || pending || sceneName(expectedScene) !== STOCK_SCENE) return;
    const canReturn = () => sameSession(visit) && visit.proxy.ConnId === visit.connection;
    if (!canReturn()) return;
    const Laya = ctx.window.Laya;
    const returning = new ResourceScope();
    restoration?.();
    restoration = ctx.scope.add(() => { returning.dispose(); restoration = undefined; });
    function finish() {
      if (!canReturn() || pending || expectedScene.destroyed) { restoration?.(); return; }
      if (visit.room.TableId !== 0 || visit.room.IsGameStart === true
        || ctx.game.getScene() !== expectedScene || !readyScene(expectedScene, Laya)) return;
      restoration?.();
      if (mounted && current?.scene !== expectedScene) return;
      stop();
      // The borrowed table did not run the ordinary lobby's scene exit.
      // Clear its matching animation, then restore the poker actions.
      if (expectedScene.matchEffect) {
        Laya.Tween?.clearAll?.(expectedScene.matchEffect);
        expectedScene.matchEffect.Stop?.();
        expectedScene.matchEffect.visible = false;
      }
      expectedScene.matchResultError?.();
      tryMount(expectedScene, visit);
    }
    returning.interval(finish, 35);
    returning.timeout(() => restoration?.(), 12000);
    finish();
  }

  return {
    actions,
    canSwitchTable,
    switchTable() {
      if (!canSwitchTable()) return false;
      const log = current.log;
      const opened = openPokerLiveTable(ctx, { force: true });
      log(opened ? '已切换牌桌' : '切换牌桌失败');
      if (!opened) ctx.notify('暂时无法切换牌桌。');
      return opened;
    },
    hasMatchLog: () => Boolean(logForSession()?.length),
    matchLog() {
      const entries = logForSession();
      return entries?.length ? JSON.stringify({ events: entries }, null, 2) : '';
    },

    open(mode) {
      if (pending || mounted || ctx.scope.signal.aborted) return;
      restoration?.();
      playbackOrigin = undefined;
      const account = accountId();
      const origin = ctx.game.getScene();
      if (!account || !origin) return ctx.notify('请登录经典版游戏后再进入三国斗地主。');
      if (ctx.game.isInGame() || ctx.game.isReplay?.(origin) || origin.isMatching || origin.adManager?.IsMatching || ctx.game.getClass('GameContext')?.IsAgainGame) {
        return ctx.notify('请退出当前牌局或匹配后再进入三国斗地主。');
      }
      const identity = { account, proxy: serverProxy(), mode };
      if (tryMount(origin, identity)) return;
      const dispatcher = ctx.game.getDispatcher();
      if (!ctx.window.Laya?.stage || typeof dispatcher?.SwitchScene !== 'function') return ctx.notify('经典版原生大厅暂未就绪。');
      const transition = new ResourceScope();
      pending = ctx.scope.add(() => { transition.dispose(); pending = undefined; });
      const blockCanvas = event => {
        if (event.target?.tagName !== 'CANVAS') return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      for (const event of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
        transition.listen(ctx.window, event, blockCanvas, { capture: true, passive: false });
      }
      transition.interval(() => {
        if (!sameAccount(identity) || tryMount(ctx.game.getScene(), identity)) pending?.();
      }, 35);
      transition.timeout(() => { pending?.(); ctx.notify('经典版斗地主大厅尚未加载完成。'); }, 12000);
      try { dispatcher.SwitchScene(STOCK_SCENE); }
      catch (error) { pending?.(); ctx.notify(error?.message || '无法进入经典版斗地主大厅'); }
    },

    captureTableOrigin(scene, match) {
      if (sceneName(scene) !== STOCK_SCENE || scene.rc !== match.room || !sameSession(match)) return;
      return { scene, room: match.room, proxy: match.proxy, account: match.account, connection: match.connection,
        mode: current?.scene === scene ? current.mode : undefined };
    },

    matchSuccessDeadline(visit, tableId) {
      if (!visit || !sameSession(visit) || visit.proxy.ConnId !== visit.connection || visit.room.TableId !== tableId) return 0;
      const { scene } = visit;
      if (scene.destroyed || scene.visible === false) return 0;
      // A verified start can reach the router before the lobby shows the roster.
      if (!matchSuccessVisible(scene)) {
        read(() => scene.tableInfoRep?.());
        if (matchSuccessVisible(scene)) read(() => scene.seatUserUpdate?.());
      }
      if (!matchSuccessVisible(scene)) return 0;
      const recorded = matchSuccessTimes.get(scene.matchSucView);
      const shownAt = recorded?.tableId === tableId ? recorded.shownAt : ctx.window.performance.now();
      return shownAt + MATCH_SUCCESS_HOLD_MS;
    },
    restoreAfterTable,

    captureOrigin() {
      const scene = ctx.game.getScene();
      playbackOrigin = current?.scene === scene && mounted && !mounted.closed && !scene.destroyed
        && scene.visible !== false && sameSession(current) ? current : undefined;
      return playbackOrigin;
    },

    restoreOrigin(token, expectedScene) {
      if (!token || token !== playbackOrigin) return;
      playbackOrigin = undefined;
      if (!sameAccount(token) || pending) return;
      const departing = expectedScene && ctx.game.getScene();
      const returning = new ResourceScope();
      restoration?.();
      restoration = ctx.scope.add(() => { returning.dispose(); restoration = undefined; });
      const finish = scene => {
        if (returning.closed) return;
        if (!sameAccount(token) || pending) { restoration?.(); return; }
        if (!scene || scene.destroyed || scene.visible === false || ctx.game.isReplay?.(scene)) return;
        if (expectedScene && scene !== expectedScene && (scene === token.scene || scene === departing)) return;
        if (mounted) { restoration?.(); return; }
        if (sceneName(scene) !== STOCK_SCENE || (expectedScene && scene !== expectedScene) || !sameSession(token)) {
          restoration?.();
          return;
        }
        if (tryMount(scene, token)) restoration?.();
      };
      returning.add(ctx.game.onSceneChange?.(finish));
      returning.interval(() => finish(ctx.game.getScene()), 35);
      returning.timeout(() => restoration?.(), 12000);
      finish(ctx.game.getScene());
    },
  };
}
