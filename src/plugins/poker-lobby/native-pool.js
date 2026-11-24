import { read } from '../../shared/safe-read.js';
import { ResourceScope } from '../../core/resources.js';
import { installPokerGeneralDetails } from './general-detail.js';
import { pokerSkillsFor, withPokerGeneralCard } from './poker-skills.js';

const MODE = 175;
const SECTION = 2;
const CONFIG = 'sys_ss_gamelabel_config';
const WINDOW = 'SgsToolboxPokerPoolWindow';
const windows = new WeakMap();

function configuredPokerIds(config) {
  const pools = config?.Root?.TongYongJinJiang;
  if (!Array.isArray(pools)) return null;
  const pool = pools.find(row => row?.gamemodel === `${MODE},${SECTION}`);
  if (Number(pool?.id) !== 10015 || typeof pool.GeneralList !== 'string') return null;
  return new Set(pool.GeneralList.split(',').map(Number).filter(id => Number.isSafeInteger(id) && id > 0));
}

export function bindPokerPoolPreview(scope, item, GeneralCard, skillsFor) {
  if (typeof item?.refreshData !== 'function') return;
  let button, restoreTip, wrappedTip;

  function bindTip() {
    restoreTip?.();
    wrappedTip = undefined;
    button = item.topSp;
    if (typeof button?.toolTip !== 'function') return;
    restoreTip = scope.patch(button, 'toolTip', original => function (...args) {
      const itemId = Number(item.generalInfo?.ItemID);
      if (!Number.isSafeInteger(itemId) || itemId <= 0 || typeof GeneralCard?.GetInstance !== 'function') return;
      const skills = read(() => skillsFor(item.generalInfo)) || [];
      // The stock pool tooltip reads Skills from this lookup while building its native content.
      return withPokerGeneralCard(scope, GeneralCard, itemId, skills, () => Reflect.apply(original, this, args));
    });
    wrappedTip = button.toolTip;
  }

  const restoreRefresh = scope.patch(item, 'refreshData', original => function (...args) {
    const result = Reflect.apply(original, this, args);
    bindTip();
    return result;
  });
  bindTip();
  return scope.add(() => {
    const owned = wrappedTip && button.toolTip === wrappedTip;
    restoreRefresh();
    restoreTip?.();
    if (owned && !button.destroyed) {
      const nativeTip = button.ToolTip;
      button.ToolTip = null;
      button.ToolTip = nativeTip;
    }
  });
}

export async function openNativePokerPool(ctx, scope = ctx.scope) {
  const { signal } = scope;
  if (signal.aborted) return false;
  if (windows.has(ctx)) return true;
  const account = ctx.native.account().id;
  const NativeWindow = ctx.game.getClass('ModeGeneralPoolWindow');
  if (!account || typeof NativeWindow !== 'function' || !['LoadRes', 'Show', 'Close', 'enterWindow', 'updateItems']
    .every(key => typeof NativeWindow.prototype[key] === 'function')) return false;

  const config = ctx.game.getConfigData(CONFIG) || await ctx.game.loadConfigData(CONFIG, { signal });
  if (signal.aborted || account !== ctx.native.account().id) return false;
  if (windows.has(ctx)) return true;
  const ids = configuredPokerIds(config);
  if (!ids?.size) return false;

  let dispose;
  const details = new ResourceScope();
  const itemBindings = [];
  const GeneralCard = ctx.game.getClass('GeneralCard');
  const skillsFor = info => pokerSkillsFor(ctx, info);
  const bindDetail = installPokerGeneralDetails(ctx, details, skillsFor);
  const clearBindings = () => { for (const release of itemBindings.splice(0)) release(); };
  class PokerPoolWindow extends NativeWindow {
    enterWindow(mode, section) {
      if (signal.aborted || account !== ctx.native.account().id) {
        this.Close(true);
        return;
      }
      super.enterWindow(mode, section);
      if (this.parent && this.vo?.OnlyShowInfo && Number(this.vo.Id) === 10015) this.Title = '三国斗地主将池';
      else if (!this.destroyed) this.Close(true);
    }

    // The legacy info-only window still tries to bind an account scheme while
    // building the hidden scheme tabs. The Poker window has no editable scheme.
    createLeftTabButtonGroup() {}
    updateJDInfo() {}
    updatePlayerInfo() {}

    initGeneralInfo() {
      super.initGeneralInfo();
      this.freeIdList2 = null;
      this.isAllFree = false;
    }

    updateFreeGeneralList2() {}

    updateBanPoolPlan(rebuild = true) {
      if (rebuild && this.tabGroup) this.updateList(this.tabGroup.SelectedValue);
    }

    updateItems(tab, generals, mode, section, infoOnly, y, canClose, gap, showTitle) {
      if (!infoOnly || Number(mode) !== MODE || Number(section) !== SECTION) return y;
      // Native all-tab adds the surrounding lobby's current promotional generals.
      const list = generals?.filter(info => ids.has(Number(info?.Id)));
      const start = this.pannel?.numChildren || 0;
      const bottom = super.updateItems(tab, list, mode, section, true, y, canClose, gap, showTitle, [], false);
      for (let index = start; index < this.pannel?.numChildren; index += 1) {
        const item = this.pannel.getChildAt(index);
        if (!ids.has(Number(item?.generalInfo?.Id))) continue;
        const preview = bindPokerPoolPreview(details, item, GeneralCard, skillsFor);
        const click = bindDetail(item);
        if (preview) itemBindings.push(preview);
        if (click) itemBindings.push(click);
      }
      return bottom;
    }

    clearItems() { clearBindings(); return super.clearItems(); }

    destroy(...args) {
      details.dispose();
      try { super.destroy(...args); }
      finally { dispose?.(); }
    }
  }

  const popup = new PokerPoolWindow();
  popup.name = WINDOW;
  windows.set(ctx, popup);
  dispose = scope.add(() => {
    details.dispose();
    if (windows.get(ctx) === popup) windows.delete(ctx);
    if (!popup.destroyed) read(() => popup.Close(true));
  });
  try {
    popup.LoadRes();
    popup.Show(MODE, SECTION);
    return !popup.destroyed;
  } catch (error) {
    dispose();
    throw error;
  }
}
