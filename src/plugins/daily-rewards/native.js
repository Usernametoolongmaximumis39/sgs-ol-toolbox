import { isReturnTask } from './return-tasks.js';
import { managerSpecs as welfareSpecs, planWelfare, prepareWelfare } from './welfare.js';
import { managerSpecs as activitySpecs, planActivities, prepareActivities, currentTavernTaskIds } from './activities.js';
import { managerSpecs as codeSpecs, planCodes } from './codes.js';
import { excludedReward, rewardExclusions } from './exclusions.js';
import { managerSpecs as questSpecs, planActivityQuests, prepareActivityQuests } from './quest-rewards.js';
import { managerSpecs as flipSpecs, planFreeFlip } from './free-flip.js';
import { managerSpecs as freeWelfareSpecs, planFreeWelfare, prepareFreeWelfare } from './free-welfare.js';
import { planMailClaims, confirmedMailAttempt } from './mail-claims.js';
import { createMilitaryPopupGuard } from './military-popup.js';
import { confirmedJieyueAttempt } from './military-rewards.js';
import { managerSpecs as exchangeSpecs } from './exchange-native.js';
import { nativeMethod } from './native-method.js';
export { nativeMethod } from './native-method.js';
// Read only existing client objects. Never instantiate managers or load Xiaochao.
const read = fn => { try { return fn(); } catch { return undefined; } };
const live = object => object && object.destroyed !== true;
const events = {
  LoginManager: ['error'], MailManager: ['decodeClientGetMailNtf', 'DbsClientGetgmawardRep', 20343],
  TaskManager: ['SmsgTaskFailed'], GiftManager: ['ClientPickupgiftbagRep'],
  TimerManager: ['ClientPingMsg'], TianTiManager: ['ClientTTLevelAwardRep'],
};
const guards = {
  LoginManager: value => 'signDataInit' in value,
  MailManager: value => Array.isArray(value.systemMailList),
  TaskManager: value => typeof value.GetServerTaskDataByTaskID === 'function',
  GiftManager: value => typeof value.SendMySingleGift === 'function',
  TimerManager: value => read(() => value.ServerDate) instanceof Date,
  TianTiManager: value => typeof value.reqDailyReward === 'function',
};
for (const specs of [welfareSpecs, activitySpecs, codeSpecs, questSpecs, flipSpecs, freeWelfareSpecs, exchangeSpecs]) for (const [name, spec] of Object.entries(specs)) {
  events[name] = [...new Set([...(events[name] || []), ...(spec.events || [])])];
  const previous = guards[name];
  guards[name] = value => Boolean(read(() => previous?.(value)) || read(() => spec.guard(value)));
}
export function rows(value, limit = 2048) {
  if (Array.isArray(value)) return value.slice(0, limit);
  const found = [];
  const map = read(() => value._maps);
  if (map && typeof map === 'object') found.push(...Object.keys(map).slice(0, limit).flatMap(key => Array.isArray(map[key]) ? map[key].slice(0, limit) : [map[key]]));
  for (const key of ['datum', '_objDatum']) {
    const list = read(() => value[key]);
    if (Array.isArray(list)) found.push(...list.slice(0, limit));
  }
  return [...new Set(found)].filter(item => item !== undefined && item !== null).slice(0, limit);
}
export function createNativeAdapter(ctx) {
  let goodsRoot, goodsIndex = new Map();
  function manager(name) {
    const validate = value => live(value) && typeof value === 'object' && read(() => guards[name](value));
    const type = read(() => ctx.game.getClass(name));
    if (validate(type)) return type;
    for (const key of ['instance', '_instance', 's_instance', 'Instance']) {
      const d = type && Object.getOwnPropertyDescriptor(type, key);
      if (d && 'value' in d && validate(d.value)) return d.value;
    }
    const proxy = read(() => ctx.game.getServerProxy());
    for (const event of events[name] || []) {
      const entry = read(() => proxy._events[event]);
      for (const handler of Array.isArray(entry) ? entry.slice(0, 32) : [entry]) if (validate(read(() => handler.caller))) return handler.caller;
    }
    return null;
  }
  function account() {
    const login = manager('LoginManager');
    if (read(() => login.IsAccountLoggingOut) || read(() => login.IsOnLine) === false) return '';
    const self = read(() => ctx.game.getSelf?.()) || read(() => ctx.game.getClass('UserData').Self);
    const value = read(() => self.ClientId) || read(() => login.LoginUserName);
    return typeof value === 'number' || typeof value === 'string' ? String(value).slice(0, 128) : '';
  }
  function day() {
    const date = read(() => manager('TimerManager').ServerDate);
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function config(file) {
    const shared = read(() => ctx.game.getConfigData?.(file.replace(/\.sgs$/, '')));
    if (shared) return shared;
    for (const owner of [ctx.window.CtrUtil, ctx.window.SystemContext]) for (const key of ['AllDatas', 'allDatas']) {
      const value = read(() => owner[key][file]);
      if (value) return value;
    }
    return null;
  }
  function signRows() {
    const direct = read(() => config('gn_zonghe.sgs').root.bigprize);
    if (Array.isArray(direct) && direct.length) return direct.slice(0, 400);
    // The already-open daily sign view owns the parsed monthly reward list.
    const login = manager('LoginManager'), SignView = read(() => ctx.game.getClass('DailySignNewView'));
    for (const key of ['GET_LOGIN_REWARD', 'GET_LOGIN_REWARD_NEW', 'LOGIN_SIGN_DATA_UPDATE']) {
      const handlers = read(() => login._events[key]);
      for (const entry of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
        const view = read(() => entry.caller);
        if (live(view) && typeof SignView === 'function' && view instanceof SignView && Array.isArray(view.rewardList)) return view.rewardList.slice(0, 40);
      }
    }
    return [];
  }
  const sendMilitaryQuietly = createMilitaryPopupGuard(ctx, account);
  const adapter = { manager, account, day, config, signRows, sendMilitaryQuietly,
    confirmedAttempt: actionKey => {
      const task = /^task:(\d+)$/.exec(actionKey);
      if (task) return read(() => manager('TaskManager').GetServerTaskDataByTaskID(Number(task[1])).HasAward) === true;
      return confirmedJieyueAttempt(adapter, actionKey) || confirmedMailAttempt(adapter, actionKey);
    },
    describeAttempt(actionKey) {
      const match = /^task:(\d+)$/.exec(actionKey);
      if (!match) return null;
      const task = read(() => manager('TaskManager').GetServerTaskDataByTaskID(Number(match[1])));
      return { label: taskLabel(task, match[1]), reason: task ? taskSkipReason(task) : '', excluded: isReturnTask(task) };
    },
    goods(id) {
      const root = config('sys_gs_dbs_fs_goodsbaseinfo.sgs')?.root;
      if (goodsRoot !== root) {
        goodsRoot = root; goodsIndex = new Map();
        const fields = new Map(rows(root?.abbreviation?.field).map(field => [field.Short, field.Long]));
        for (const row of (Array.isArray(root?.goodslist?.goods) ? root.goodslist.goods.slice(0, 200000) : [])) {
          const expanded = Object.fromEntries(Object.entries(row).map(([key, value]) => [fields.get(key) || key, value]));
          goodsIndex.set(Number(expanded.ID), expanded);
        }
      }
      return goodsIndex.get(id) || null;
    },
    class: name => read(() => ctx.game.getClass(name)),
    proxy: () => read(() => ctx.game.getServerProxy()),
    signal: ctx.scope?.signal,
    loadConfig: name => ctx.game.loadConfigData?.(name.replace(/\.sgs$/, '')),
    self: () => read(() => ctx.game.getSelf?.()) || read(() => ctx.game.getClass('UserData').Self),
    async prepare(selected, context = {}) {
      const preparation = { ...adapter, signal: context.signal || adapter.signal, valid: context.valid || (() => !adapter.signal?.aborted) };
      const results = await Promise.allSettled([
        rewardExclusions.some(([key]) => selected[key]) ? adapter.loadConfig('sys_gs_dbs_fs_goodsbaseinfo') : null,
        selected.mail && rewardExclusions.some(([key]) => selected[key]) && [...rows(manager('MailManager')?.systemMailList), ...rows(manager('MailManager')?.friendMailList)].some(mail => Number(mail?.AttachmentType) === 1) ? adapter.loadConfig('gn_dbs_giftbag') : null,
        selected.tasks && rewardExclusions.some(([key]) => selected[key]) && manager('TianTiManager') ? adapter.loadConfig('mod_new_ttrank_config') : null,
        selected.sign && !signRows().length ? adapter.loadConfig('gn_zonghe') : null,
        prepareWelfare(preparation, selected), prepareActivities(preparation, selected), prepareFreeWelfare(preparation, selected), prepareActivityQuests(preparation, selected),
      ]);
      if (results.some(result => result.status === 'rejected')) throw new Error('部分奖励配置未就绪');
    },
  };
  return adapter;
}

const has = (list, item) => Array.isArray(list) && list.some(value => Number(value) === Number(item));
const idOf = task => Number(task?._id ?? task?.id ?? task?.taskId ?? task?.baseVo?._id ?? task?.baseVo?.id);
const taskLabel = (task, id) => {
  const base = task?.baseVo, name = base?.name || base?.Name || base?._name;
  return typeof name === 'string' && name.trim() ? `${name.trim().slice(0, 120)}（任务 ${id}）` : `任务 ${id}`;
};
export function taskSkipReason(task, { allowSelection = false, allowRepeat = false } = {}) {
  const base = task?.baseVo;
  if (!base || task.CanAward !== true || task.HasAward === true) return '尚不可领取';
  if (task.HasExpired === true || task.hasExpired === true || base.IsEffectServerTimeStart === false || base.EffectClientTime === false) return '已过期或尚未开始';
  if (isReturnTask(task)) return '回归任务已排除，请在游戏内手动领取';
  // Modern G1t.TaskSelectReward enumerates ALL ordinary rewards as selectable
  // view rows even when SelectRewards=0. Its explicit native boolean, rather
  // than the presence of those rows, determines whether a choice is required.
  const ordinaryModernRewards = task.IsNewQusetType === true && base.HaveSelectReward === false;
  if (!allowSelection && (task.HaveSelectReward || base.HaveSelectReward || base.haveSelectReward ||
      (!ordinaryModernRewards && (rows(base.TaskSelectReward).length || rows(base.taskSelectReward).length || rows(task.taskSelectReward).length)))) return '需要选择奖励，请在待选奖励中选择';
  if (task.IsBuyTask || base.IsBuyTask) return '购买任务';
  const description = [base.name, base.Name, base.desc, base.Desc, base._name, base._desc].filter(value => typeof value === 'string').join(' ');
  const conditions = rows(task.TaskConditions || task.taskConditions, 64);
  // Completed cumulative silver spending is progress, not a claim-time cost.
  // Remove only that specific phrase; additional cost wording and reqType 30
  // still block the claim, including when they accompany a cumulative title.
  const claimDescription = description.replace(/累计消耗\s*\d+\s*银两/g, '');
  if (/兑换|兑取|换取|消耗|扣除|合成|盲盒/.test(claimDescription) || conditions.some(item => Number(item?.reqType ?? item?._reqType) === 30)) return '兑换或消耗任务';
  if (!allowRepeat && (Number(task.CanRewardCount) > 1 || Number(base.maxComplete ?? base._maxComplete) > 1)) return '多次奖励需手动处理';
  if (task.TaskCompeleMax === true) return '任务次数已满';
  if ([97, 98, 126, 127, 161114, 161115, 161116].includes(idOf(task))) return '特殊任务需手动处理';
  return '';
}

export function planRewards(adapter, selected = {}) {
  const actions = [], notes = [], cycle = adapter.day();
  const note = (category, text) => notes.push({ category, text });
  if (selected.sign) {
    const manager = adapter.manager('LoginManager'), request = nativeMethod(manager, 'RequestLoginPrize', ['.bigdays=', '.reqtype=']);
    if (!manager?.signDataInit || !request || !Array.isArray(manager.CheckInfo) || !Array.isArray(manager.SubCheckGetInfo)) note('sign', '签到数据或领取接口尚未就绪');
    else {
      // CheckInfo.length is the client's signed-day count, not the date of month.
      for (let day = 1; day <= Math.min(manager.CheckInfo.length, 31); day++) if (!has(manager.SubCheckGetInfo, day)) actions.push({
        key: `sign:${day}:1`, category: 'sign', label: `签到第 ${day} 天`, manager,
        rewards: () => adapter.signRows().find(row => Number(row.month ?? row.Month) === Number(cycle.split('-')[1]) && Number(row.loginday ?? row.LoginDay) === day)?.goods ?? adapter.signRows().find(row => Number(row.Month) === Number(cycle.split('-')[1]) && Number(row.LoginDay) === day)?.Goods,
        eligible: () => manager.signDataInit && manager.CheckInfo.length >= day && !has(manager.SubCheckGetInfo, day),
        done: () => has(manager.SubCheckGetInfo, day), send: () => request(day, 1),
      });
      const self = adapter.self(), month = Number(cycle.split('-')[1]), config = adapter.signRows().filter(row => Number(row.month ?? row.Month) === month);
      if (!config.length) note('sign', '额外及累计签到配置未就绪；打开游戏签到页后再执行');
      for (const row of config) {
        const day = Number(row.loginday ?? row.LoginDay);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        const vip = Number(row.doubleVipLevel ?? row.DoubleVipLevel), officer = Number(row.officer ?? row.Officer);
        const extra = () => (vip > 0 && Number(self?.VipActiveLevel) >= vip) || (officer > 0 && Number(self?.OfficerLevel) >= officer);
        if (day <= manager.CheckInfo.length && extra() && Array.isArray(manager.VipPrizeGetInfo) && !has(manager.VipPrizeGetInfo, day)) actions.push({
          key: `sign:${day}:2`, category: 'sign', label: `签到第 ${day} 天额外奖励`, manager,
          rewards: () => row.goods ?? row.Goods,
          eligible: () => manager.signDataInit && day <= manager.CheckInfo.length && extra() && has(manager.SubCheckGetInfo, day) && !has(manager.VipPrizeGetInfo, day),
          done: () => has(manager.VipPrizeGetInfo, day), send: () => request(day, 2),
        });
        if ((row.totalRewards || row.TotalGoods) && day <= Number(manager.TotalSignNum) && Array.isArray(manager.AddupprizeDays) && !has(manager.AddupprizeDays, day)) actions.push({
          key: `sign:${day}:5`, category: 'sign', label: `累计签到 ${day} 天`, manager,
          rewards: () => row.totalRewards ?? row.TotalGoods,
          eligible: () => manager.signDataInit && day <= Number(manager.TotalSignNum) && !has(manager.AddupprizeDays, day),
          done: () => has(manager.AddupprizeDays, day), send: () => request(day, 5),
        });
      }
    }
  }
  const mail = planMailClaims(adapter, selected, rows); actions.push(...mail.actions); notes.push(...mail.notes);
  if (selected.tasks) {
    const manager = adapter.manager('TaskManager'), request = nativeMethod(manager, 'RequestTaskAward', ['TaskRewardSelectWindow']);
    if (!manager || !request) note('tasks', '任务数据或领奖接口尚未就绪');
    else {
      const all = [...rows(manager.allTasks), ...rows(manager.dailyTasks), ...rows(manager.taskLocalConditionDict), ...rows(manager.typeTaskDict)];
      const seen = new Set(currentTavernTaskIds(adapter));
      for (const task of all) {
        const id = idOf(task);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
        seen.add(id);
        const current = () => manager.GetServerTaskDataByTaskID?.(id);
        const initial = current();
        if (!initial) continue;
        const reason = taskSkipReason(initial);
        if (reason) {
          if (initial.CanAward === true && initial.HasAward !== true) note('tasks', `${taskLabel(initial, id)}：${reason}`);
          continue;
        }
        const proxy = read(() => manager.proxy) || adapter.proxy?.();
        const failure = event => {
          const p = event?.Protocol;
          return Number(p?.TaskID) === id && Number.isInteger(p?.ErrorCode) ? p : null;
        };
        actions.push({ key: `task:${id}`, category: 'tasks', label: taskLabel(initial, id), manager,
          rejections: proxy ? [{ manager: proxy, event: 'SmsgTaskFailed', accept: event => !!failure(event),
            text: event => `任务领取失败（游戏错误码 ${failure(event)?.ErrorCode}），请在游戏内核对` }] : [],
          rewards: () => current()?.baseVo?.TaskRewardItem ?? current()?.baseVo?.taskRewardItem ?? current()?.TaskRewardItem,
          eligible: () => { const item = current(); const prev = Number(item?.baseVo?.prevTask); return !!item && !taskSkipReason(item) && (!prev || manager.GetServerTaskDataByTaskID(prev)?.HasAward === true); },
          done: () => current()?.HasAward === true,
          send: () => request(id, 0, Math.max(0, Math.min(1, Number(current()?.CanRewardCount) || 0))),
        });
      }
    }
    const ranked = adapter.manager('TianTiManager');
    if (ranked?.CanGetDailyReward === true && typeof ranked.reqDailyReward === 'function') {
      const before = Number(ranked.NewPWDailyRewardId);
      if (Number.isInteger(before) && before >= 0 && before < 2) actions.push({
        key: `ranked:${before + 1}`, category: 'tasks', label: before === 0 ? '排位每日首胜奖励' : '排位每日三胜奖励', manager: ranked,
        rewards: () => rows(adapter.config('mod_new_ttrank_config.sgs')?.root?.onethreeWin).find(row => Number(row.id) === before + 1)?.rewards,
        eligible: () => ranked.CanGetDailyReward === true && Number(ranked.NewPWDailyRewardId) === before,
        done: () => Number(ranked.NewPWDailyRewardId) > before, send: () => ranked.reqDailyReward(),
      });
    }
  }
  for (const [category, plan] of [['welfare', planWelfare], ['welfare', planFreeWelfare], ['activities', planActivities], ['activities', planFreeFlip], ['codes', planCodes]]) {
    try { const extra = plan(adapter, selected); actions.push(...extra.actions); notes.push(...extra.notes); }
    catch { note(category, '数据读取异常，请稍后重新检查'); }
  }
  const quests = planActivityQuests(adapter, selected, { rows, nativeMethod, taskSkipReason, reservedIds: currentTavernTaskIds(adapter) });
  actions.push(...quests.actions); notes.push(...quests.notes);
  const exclusionsEnabled = rewardExclusions.some(([key]) => selected[key]);
  const allowed = action => {
    if (!exclusionsEnabled || action.category === 'codes' || action.exclusionMode === 'free-draw') return true;
    if (action.key === 'free-general-pack') return !selected.excludeRecruit;
    if ((action.key.startsWith('free-beans:') || action.key.startsWith('activity:ddz-tll:') || action.key === 'officer:day') && selected.excludeBeans) return false;
    const rewards = read(() => typeof action.rewards === 'function' ? action.rewards() : action.rewards);
    const reason = rewards == null ? '奖励明细未就绪' : excludedReward(adapter, selected, rewards);
    if (reason) note(action.category, `${action.label}：已跳过（${reason}）`);
    return !reason;
  };
  return { actions: [...new Map(actions.filter(allowed).map(action => [action.key, {
    ...action, eligible: () => allowed(action) && action.eligible(),
    send: () => allowed(action) ? (adapter.sendMilitaryQuietly ? adapter.sendMilitaryQuietly(action.key, action.manager, action.send) : action.send()) : false,
  }])).values()].slice(0, 200), notes };
}
