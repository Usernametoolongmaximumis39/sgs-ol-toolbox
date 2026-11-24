import { read } from '../../shared/safe-read.js';

const POKER_ACTIVITY = 32;
const SHARED_AWARDS_ACTIVITY = 18;
const POKER_DATA = 'UPDATE_POKER_DDZ_BASE_DATA_EVENT';
const SHARED_DATA = 'UPDATE_DDZ_BASE_DATA_EVENT';
const AWARD_UPDATE = 'DDZ2023_STREAK_WIN_AWARD_UPDATE';
const ACTIVITY_REPLY = 'ClientActivitysetDataRep';
const AWARD_REPLY = 'ClientDDZ2023StreakWinAwardRep';
const WINS = [3, 5, 7, 9];

const natural = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function readStreak(data) {
  if (!data || typeof data !== 'object') return null;
  const current = natural(read(() => data.weekly_streak_win) ?? 0);
  const best = natural(read(() => data.weekly_max_streak_win) ?? 0);
  return current !== null && best !== null && current <= best ? { current, best } : null;
}

function progress(count) {
  if (count == null || count < WINS[0]) return 0;
  const next = WINS.findIndex(wins => count < wins);
  if (next < 0) return 1;
  return (next - 1 + (count - WINS[next - 1]) / (WINS[next] - WINS[next - 1])) / (WINS.length - 1);
}

export function mountPokerStreak(ctx, scene, Laya) {
  const { scope } = ctx;
  const view = scene.winStreakView;
  const items = view?.winStreakItems;
  if (!view?.lianShengUI?.UpdateCnt || !view.hisWinCount || !view.proBar || items?.length !== WINS.length
    || !items.every((item, index) => Number(item?.rewardData?.Id) === index + 1
      && Number(item.rewardData.RequireSuccessNum) === WINS[index] && item.bg?.on && item.bg?.off
      && typeof item.UpdateState === 'function' && typeof item.onGetReward === 'function'
      && item.canGet && item.hadGet && item.redPoint)) return false;

  const account = ctx.native.account().id;
  const proxy = ctx.game.getServerProxy();
  const isActivity = value => typeof value.SendActivitysetData === 'function'
    && typeof value.on === 'function' && typeof value.off === 'function';
  const activity = ctx.native.manager('ActivityGameDataManager', ACTIVITY_REPLY, isActivity)
    || ctx.native.manager('ActivityGameDataManager', 22807, isActivity);
  const click = Laya.Event.CLICK;
  const canSend = typeof activity?.SendDDZ2023StreakWinAwardReq === 'function' && !!proxy?.on && !!proxy?.off;
  const active = () => !scope.closed && !view.destroyed && account && ctx.native.account().id === account
    && ctx.game.getScene() === scene && ctx.game.getServerProxy() === proxy;
  const confirmed = new Set();
  const unresolved = new Set();
  let claims = null;
  let streak = null;
  let pending = null;

  function eligible(index) {
    const id = index + 1;
    return canSend && pending === null && claims !== null && !claims.has(id) && !confirmed.has(id)
      && !unresolved.has(id) && (streak?.best ?? -1) >= WINS[index];
  }

  function drawBox(item, index) {
    if (item.destroyed) return;
    const id = index + 1;
    const claimable = Boolean(eligible(index));
    item.canGet.visible = claimable;
    item.redPoint.visible = claimable;
    item.hadGet.visible = confirmed.has(id) || Boolean(claims?.has(id));
    if (item.canGetEff) item.canGetEff.visible = false;
    if (item.oldReturnDoubleTag) item.oldReturnDoubleTag.visible = false;
  }

  function draw() {
    if (!active()) return;
    view.lianShengUI.visible = Boolean(streak);
    if (streak) view.lianShengUI.UpdateCnt(streak.best);
    view.hisWinCount.innerHTML = pending ? '正在领取奖励…' : unresolved.size ? '领取结果待确认'
      : streak ? `当前连胜：${streak.current}` : '连胜数据待加载';
    view.proBar.value = progress(streak?.current);
    items.forEach(drawBox);
  }

  function bind(target, event, listener) {
    if (typeof target?.on !== 'function' || typeof target.off !== 'function') return;
    target.on(event, scope, listener);
    scope.add(() => target.off(event, scope, listener));
  }

  function takeClaims(data) {
    const ids = read(() => data.ddz2023WeeklyWinAward);
    if (!Array.isArray(ids)) return;
    claims = new Set(ids);
    for (const id of ids) unresolved.delete(id);
  }

  function request(kind) {
    if (active() && activity) read(() => activity.SendActivitysetData(kind));
  }

  function claim(index) {
    if (!active() || !eligible(index)) return;
    const id = index + 1;
    const attempt = { id };
    pending = attempt;
    draw();
    try { activity.SendDDZ2023StreakWinAwardReq(id); }
    catch (error) {
      pending = null;
      draw();
      ctx.notify(error?.message || '领取连胜奖励失败。');
      return;
    }
    scope.timeout(() => {
      if (!active() || pending !== attempt) return;
      pending = null;
      unresolved.add(id);
      draw();
      request(SHARED_AWARDS_ACTIVITY);
      ctx.notify('领取结果待确认，请查看已领取状态。');
    }, 6500);
  }

  bind(activity, POKER_DATA, () => {
    if (!active()) return;
    streak = readStreak(read(() => activity.PokerDDZData)) || streak;
    draw();
  });
  bind(activity, SHARED_DATA, () => {
    if (!active()) return;
    takeClaims(read(() => activity.ddzData));
    draw();
  });
  bind(activity, AWARD_UPDATE, id => {
    if (!active() || !Number.isInteger(id) || !WINS[id - 1]) return;
    confirmed.add(id);
    if (pending?.id === id) pending = null;
    draw();
  });
  bind(proxy, ACTIVITY_REPLY, packet => {
    if (!active()) return;
    const data = read(() => packet.Protocol);
    if (data?.msgType === POKER_ACTIVITY) streak = readStreak(data.pokerDDZData);
    if (data?.msgType === SHARED_AWARDS_ACTIVITY) takeClaims(data.DdzData);
    draw();
  });
  bind(proxy, AWARD_REPLY, packet => {
    if (!active()) return;
    const data = read(() => packet.Protocol);
    const id = data?.rewardId;
    if (!Number.isInteger(id) || !WINS[id - 1]) return;
    if (data.result === 1 || data.result === 3) confirmed.add(id);
    if (pending?.id === id) pending = null;
    draw();
  });

  const originalLabel = view.hisWinCount.innerHTML;
  const originalProgress = view.proBar.value;
  const originalBadge = view.lianShengUI.visible;
  const originalBest = natural(read(() => activity.DDZ2023HisWeekWinCtn));
  const initialTags = items.map(item => item.oldReturnDoubleTag?.visible);
  const originalTip = view.showStreakTip;
  if (typeof originalTip === 'function') view.lianShengUI.off(click, view, originalTip);

  scope.add(() => {
    if (view.destroyed) return;
    view.lianShengUI.visible = originalBadge;
    if (originalBest !== null) view.lianShengUI.UpdateCnt(originalBest);
    view.hisWinCount.innerHTML = originalLabel ?? '';
    view.proBar.value = originalProgress;
    if (typeof originalTip === 'function') view.lianShengUI.on(click, view, originalTip);
    items.forEach((item, index) => {
      if (item.oldReturnDoubleTag && initialTags[index] !== undefined) item.oldReturnDoubleTag.visible = initialTags[index];
    });
  });
  scope.patch(view, 'updateWinCtn', () => draw);
  scope.patch(view, 'updateProg', () => draw);
  if (typeof view.checkOldReturnTag === 'function') scope.patch(view, 'checkOldReturnTag', () => draw);
  items.forEach((item, index) => {
    const ownClick = () => claim(index);
    item.bg.off(click, item, item.onGetReward);
    const restore = scope.patch(item, 'UpdateState', () => () => drawBox(item, index));
    item.bg.on(click, scope, ownClick);
    scope.add(() => {
      if (item.destroyed || item.bg?.destroyed) return;
      item.bg.off(click, scope, ownClick);
      restore();
      item.UpdateState();
    });
  });

  draw();
  request(POKER_ACTIVITY);
  request(SHARED_AWARDS_ACTIVITY);
  return true;
}
