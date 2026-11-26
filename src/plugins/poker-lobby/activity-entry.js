import { ResourceScope } from '../../core/resources.js';

const CONFIG = 'sys_ss_gamelabel_config';
const POKER = 175;
const RIDER = 160;
const CARD_DESC = '技能加持，扑克对决';
const DEFAULT_OPEN_DESC = '超级加倍，好玩不累';
const PAGE_CHANGED = 'VIEW_STACK_SELECTED_PAGE_CHANGED';
const MODE_SCENES = new Set(['ModeScene', 'MatchServerScene', 'ActivityModeScene']);

const nonEmpty = value => typeof value === 'string' && value.trim() ? value : '';

function findPokerModeConfig(config) {
  const modes = config?.Root?.modes;
  for (const rows of [modes?.content, modes?.content__2]) {
    const row = Array.isArray(rows) && rows.find(item => Number(item?.Model) === POKER && Number(item.Section) === 2);
    if (row) return row;
  }
  return null;
}

export async function getPokerModeConfig(ctx, signal = ctx.scope.signal) {
  const config = ctx.game.getConfigData?.(CONFIG) || await ctx.game.loadConfigData?.(CONFIG, { signal });
  return findPokerModeConfig(config);
}

const modeId = row => Number(row?.ModeVo?.ModeID);

function layoutPages(view, page) {
  const size = view.pageItemCtn;
  if (!Number.isInteger(size) || size < 1) return page;
  const count = Math.max(1, Math.ceil(view.modeDataList.length / size));
  const current = Math.min(count, Math.max(1, Number(page) || 1));
  view.maxPage = count;
  view.curPage = current;
  if (view.pageTxt) {
    view.pageTxt.text = `${current}/${count}`;
    view.pageTxt.visible = count > 1;
  }
  if (view.leftArr) view.leftArr.visible = count > 1;
  if (view.rightArr) view.rightArr.visible = count > 1;
  return current;
}

function replaceClick(node, click, owner, stock, handler) {
  if (typeof node?.on !== 'function' || typeof node.off !== 'function' || typeof stock !== 'function') return () => {};
  node.off(click, owner, stock);
  node.on(click, owner, handler);
  return () => {
    if (node.destroyed || owner.destroyed) return;
    node.off(click, owner, handler);
    node.on(click, owner, stock);
  };
}

export function installPokerActivityEntry(ctx, open) {
  const nativePoker = () => ctx.game.getClass('PokerDdzScene') || ctx.game.getClass('PokerTableGameScene');
  if (nativePoker()) return;
  let config;
  let stockMode = null;
  let releaseScene;
  const readConfig = () => (config ||= findPokerModeConfig(ctx.game.getConfigData?.(CONFIG)));
  const mode = {
    ModeID: POKER, Section: 2, ModeKey: '175_2',
    ResourceModeId: POKER, ResourceSectionId: 0,
    ModeTips2: CARD_DESC,
    get OpenDesc() { return nonEmpty(stockMode?.OpenDesc) || nonEmpty(readConfig()?.openDesc) || DEFAULT_OPEN_DESC; },
    get ModeTips() { return nonEmpty(readConfig()?.ModelBelongDesc) || nonEmpty(stockMode?.ModeTips); },
    GetOpenState: () => 0,
  };
  const entry = { ModeVo: mode };
  const activeView = scene => scene?.viewStack?.selectedChild ?? scene?.activityModeView ?? scene;
  const isActivityView = view => {
    const View = ctx.game.getClass('ActivityModeView');
    return typeof View === 'function' && view instanceof View && !view.destroyed && typeof view.updateItems === 'function';
  };

  function restoreCards(state) {
    for (const release of state.cards.values()) release();
    state.cards.clear();
  }

  function syncCards(view, viewScope, state) {
    const click = ctx.window.Laya?.Event?.CLICK;
    if (!click || !Array.isArray(view.items)) return;
    const shown = new Set(view.items.filter(card => card?.visible !== false && card?.data === mode));
    for (const [card, release] of state.cards) {
      if (!shown.has(card)) { release(); state.cards.delete(card); }
    }
    for (const card of shown) {
      // Preserve the stock art and click area. The old overlay explicitly links to the remake.
      card.isLock = false;
      if (card.modeBg) card.modeBg.isGray = false;
      if (card.descTxt) {
        card.descTxt.text = mode.ModeTips2;
        card.descTxt.visible = true;
      }
      if (card.timeTxt) card.timeTxt.text = mode.OpenDesc;
      for (const node of [card.lockImg, card.maskImg, card.item1, card.item2, card.gotoU3dBtn]) {
        if (node) node.visible = false;
      }
      if (state.cards.has(card)) continue;
      const active = () => !viewScope.closed && !card.destroyed && card.visible !== false
        && card.data === mode && activeView(ctx.game.getScene()) === view;
      const activate = () => { if (active() && !nativePoker()) open(state.stock?.ModeVo); };
      const showRules = async () => {
        if (!active()) return;
        try {
          config ||= await getPokerModeConfig(ctx, viewScope.signal);
          if (!active()) return;
          if (mode.ModeTips) card.onRuleClick();
          else ctx.notify('三国斗地主规则暂不可用。');
        } catch {
          if (active()) ctx.notify('三国斗地主规则暂不可用。');
        }
      };
      const restoreSurface = replaceClick(card.ModeBtn, click, card, card.onEnterMode, activate);
      const restoreRedirect = replaceClick(card.gotoU3dBtn, click, card, card.onGotoU3dClick, activate);
      const restoreRules = replaceClick(card.ruleBtn, click, card, card.onRuleClick, showRules);
      state.cards.set(card, () => { restoreRules(); restoreRedirect(); restoreSurface(); });
    }
  }

  function restoreRow(state) {
    if (!state) return false;
    restoreCards(state);
    if (stockMode && stockMode === state.stock?.ModeVo) stockMode = null;
    const index = state.rows.indexOf(entry);
    if (index < 0) return false;
    state.rows.splice(index, 1);
    if (state.stock) state.rows.splice(state.stockIndex, 0, state.stock);
    return true;
  }

  function bindView(view, sceneScope) {
    const viewScope = new ResourceScope();
    const release = sceneScope.add(() => viewScope.dispose());
    let state;
    viewScope.patch(view, 'updateItems', original => function (page, ...args) {
      const rows = this.modeDataList;
      if (!Array.isArray(rows) || !rows.some(row => modeId(row) === RIDER)) {
        const removed = restoreRow(state) && state.rows === rows;
        state = null;
        return Reflect.apply(original, this, [removed ? layoutPages(this, page) : page, ...args]);
      }
      if (state?.rows !== rows || !rows.includes(entry)) {
        restoreRow(state);
        const stockIndex = rows.findIndex(row => modeId(row) === POKER);
        const stock = stockIndex >= 0 ? rows.splice(stockIndex, 1)[0] : null;
        stockMode = stock?.ModeVo || null;
        rows.splice(rows.findIndex(row => modeId(row) === RIDER) + 1, 0, entry);
        state = { rows, stock, stockIndex, cards: new Map() };
      }
      const result = Reflect.apply(original, this, [layoutPages(this, page), ...args]);
      syncCards(this, viewScope, state);
      return result;
    });
    viewScope.add(() => {
      if (restoreRow(state) && !view.destroyed && view.modeDataList === state.rows) {
        view.updateItems(layoutPages(view, view.curPage));
      }
    });
    if (Array.isArray(view.modeDataList) && view.modeDataList.length) view.updateItems(view.curPage);
    return release;
  }

  function watchScene(scene) {
    releaseScene?.();
    releaseScene = null;
    if (nativePoker()) return;
    const name = scene?.SceneName || scene?.sceneName;
    if (!scene || (!MODE_SCENES.has(name) && !isActivityView(activeView(scene)))) return;
    const sceneScope = new ResourceScope();
    releaseScene = ctx.scope.add(() => sceneScope.dispose());
    let current, releaseView;
    const sync = () => {
      const selected = activeView(scene);
      if (selected === current) return;
      releaseView?.();
      current = selected;
      releaseView = isActivityView(selected) ? bindView(selected, sceneScope) : null;
    };
    const readStack = () => {
      const stack = scene.viewStack;
      if (typeof stack?.on !== 'function' || typeof stack.off !== 'function') return false;
      stack.on(PAGE_CHANGED, sceneScope, sync);
      sceneScope.add(() => { if (!stack.destroyed) stack.off(PAGE_CHANGED, sceneScope, sync); });
      sync();
      return true;
    };
    if (readStack()) return;
    sync();
    if (current === scene && isActivityView(current)) return;
    const timer = setInterval(() => {
      if (scene.destroyed || readStack()) stopWaiting();
      else sync();
    }, 150);
    const stopWaiting = sceneScope.add(() => clearInterval(timer));
  }

  ctx.scope.add(ctx.game.onSceneChange?.(watchScene));
  watchScene(ctx.game.getScene());
}
