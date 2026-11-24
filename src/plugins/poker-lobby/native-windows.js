import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';
import { readPokerStats } from './stats.js';
import { createPokerGeneralViewClass } from './native-general-stats.js';

const POKER_RANK_WINDOW = 51;
export const POKER_STATS_WINDOW = 'SGSToolboxPokerStatsWindow';
const POKER_OVERVIEW = 'SGSToolboxPokerStatsOverview';
const POKER_GENERALS = 'SGSToolboxPokerStatsGenerals';
const registrations = new WeakMap();

function dispatcherFor(ctx) {
  const dispatcher = read(() => ctx.game.getDispatcher());
  return typeof dispatcher?.ShowWindowAfterCloseOther === 'function' ? dispatcher : null;
}

export function openPokerRankWindow(ctx) {
  const dispatcher = dispatcherFor(ctx);
  if (!dispatcher || ctx.scope.closed || !ctx.native.account().id
    || typeof read(() => ctx.game.getClass('RankWindow')) !== 'function') return false;
  dispatcher.ShowWindowAfterCloseOther('RankWindow', null, POKER_RANK_WINDOW);
  return true;
}

function updateStatsView(view, result) {
  const stats = new Map(result.stats);
  const text = name => String(stats.get(name) ?? '—');
  const percentage = text('近百场胜率');
  if (percentage.endsWith('%')) view.setHundredWins(Number.parseFloat(percentage) / 100);
  view.hundredWinsValue.text = percentage;
  view.lordWinsValue.text = text('地主胜率');
  view.farmerWinsValue.text = text('农民胜率');
  view.legendLordValue.text = text('枭雄次数');
  view.totalSessionValue.text = text('总对局');
  view.weekMaxValue.text = text('本周最高排名');
  view.totalCountValue.text = text('赢得欢乐豆总数');
  const streak = text('最高连胜');
  view.maxStreakValue.visible = /^\d+$/.test(streak);
  if (!view.maxStreakValue.visible) return;
  view.maxStreakValue.text = streak;
  const width = 40 * streak.length + view.maxStreakValue.Gap * (streak.length - 1);
  view.maxStreakValue.size(width, 54);
  view.maxStreakValue.x = 278 + ((146 - width) >> 1);
}

function registerPokerStatsWindow(ctx) {
  const classes = (ctx.window.Laya ?? ctx.window.laya)?.ClassUtils;
  const registry = classes?._classMap;
  if (!registry || typeof classes.regClass !== 'function') return false;
  if (registrations.get(ctx) === registry[POKER_STATS_WINDOW] && registry[POKER_STATS_WINDOW]) return true;
  if ([POKER_STATS_WINDOW, POKER_OVERVIEW, POKER_GENERALS].some(name => registry[name])) return false;

  const NativeWindow = read(() => ctx.game.getClass('UserInfoDDZWindow'));
  const NativeStats = read(() => ctx.game.getClass('UserInfoDDZView2025'));
  const PokerGeneralView = createPokerGeneralViewClass(ctx);
  if (typeof NativeWindow !== 'function' || typeof NativeStats !== 'function' || !PokerGeneralView) return false;
  const WindowFrame = Object.getPrototypeOf(NativeWindow.prototype);
  const ViewFrame = Object.getPrototypeOf(NativeStats.prototype);
  if (typeof WindowFrame.enterWindow !== 'function' || typeof WindowFrame.destroy !== 'function'
    || typeof NativeWindow.prototype.createTabBtn !== 'function' || typeof NativeWindow.prototype.updateViewStack !== 'function'
    || typeof ViewFrame.Init !== 'function' || typeof ViewFrame.destroy !== 'function'
    || typeof NativeStats.prototype.initUI !== 'function' || typeof NativeStats.prototype.setHundredWins !== 'function') return false;
  let current;

  class PokerStatsView extends NativeStats {
    Init() {
      ViewFrame.Init.call(this);
      this.initUI();
      updateStatsView(this, {});
      this.UpdateInfo();
    }

    UpdateInfo() {
      if (this.request || ctx.scope.closed) return;
      const request = this.request = new ResourceScope();
      const account = ctx.native.account().id;
      const active = () => !request.closed && !ctx.scope.closed && !this.destroyed && ctx.native.account().id === account;
      readPokerStats(ctx, request.signal).then(result => {
        if (!active()) return;
        updateStatsView(this, result);
        if (!result.stats?.length && result.message) ctx.notify(result.message);
      }).catch(() => {
        if (active()) ctx.notify('读取三国斗地主战绩失败。');
      });
    }

    destroy(...args) {
      this.request?.dispose();
      return ViewFrame.destroy.apply(this, args);
    }
  }

  class PokerStatsWindow extends NativeWindow {
    constructor() {
      super();
      current = this;
    }

    enterWindow(user) {
      if (ctx.scope.closed || !user) return this.Close(true);
      WindowFrame.enterWindow.call(this);
      if (this.statsScope) return;
      const request = this.statsScope = new ResourceScope();
      const account = ctx.native.account().id;
      const proxy = ctx.game.getServerProxy();
      request.interval(() => {
        if (account !== ctx.native.account().id || proxy !== ctx.game.getServerProxy()) this.Close(true);
      }, 350);
      this.userData = user;
      this.isRogue = false;
      // In classic, this option selects just the stock overview and general tabs.
      this.modeType = 3;
      this.createTabBtn();
    }

    updateViewStack() {
      super.updateViewStack();
      const stack = this.viewStack;
      const children = [...stack.childList];
      const args = [...stack.childInitDataList];
      children[this.PAGE_COMPOSITE] = POKER_OVERVIEW;
      children[this.PAGE_GENERAL] = POKER_GENERALS;
      args[this.PAGE_COMPOSITE] = args[this.PAGE_GENERAL] = [5, this.userData];
      stack.childList = children;
      stack.childInitDataList = args;
    }

    destroy(...args) {
      this.statsScope?.dispose();
      this.viewStack?.Clear();
      if (current === this) current = null;
      return WindowFrame.destroy.apply(this, args);
    }
  }

  const types = [[POKER_STATS_WINDOW, PokerStatsWindow], [POKER_OVERVIEW, PokerStatsView], [POKER_GENERALS, PokerGeneralView]];
  ctx.scope.add(() => {
    try { if (current && !current.destroyed) current.Close(true); }
    finally {
      for (const [name, type] of types) if (registry[name] === type) delete registry[name];
      registrations.delete(ctx);
    }
  });
  for (const [name, type] of types) classes.regClass(name, type);
  if (!types.every(([name, type]) => registry[name] === type)) return false;
  registrations.set(ctx, PokerStatsWindow);
  return true;
}

export function openPokerStatsWindow(ctx) {
  const dispatcher = dispatcherFor(ctx);
  const user = read(() => ctx.game.getSelf());
  if (!dispatcher || !user || !ctx.native.account().id || ctx.scope.closed || !registerPokerStatsWindow(ctx)) return false;
  dispatcher.ShowWindowAfterCloseOther(POKER_STATS_WINDOW, null, user);
  return true;
}
