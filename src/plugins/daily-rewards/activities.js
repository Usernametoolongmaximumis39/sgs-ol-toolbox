// Reconstructed from static client evidence; only already-owned reward rights.
// This module does not import another plugin or execute the old userscript.
import { planMilitaryRewards } from './military-rewards.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const has = (list, id) => Array.isArray(list) && list.some(value => Number(value) === Number(id));
const method = (object, name) => typeof read(() => object[name]) === 'function';
const tavernTaskIds = Object.freeze([161114, 161115, 161116]);
const tavernSlots = [
  ['NewDayQuestId1', 'NewDayQuestReward1', '对局30分钟'],
  ['NewDayQuestId2', 'NewDayQuestReward2', '胜利对局30分钟'],
  ['NewWeekQuestId', 'NewWeekQuestReward', '本周胜利对局90分钟'],
];
function tavernConfig(adapter) { return read(() => adapter.manager('WelfareManger')?.CurPubCommonVo); }
export function currentTavernTaskIds(adapter) {
  const config = tavernConfig(adapter);
  // An existing current configuration is authoritative, including disabled IDs.
  return config ? [...new Set(tavernSlots.map(([field]) => Number(config[field])).filter(positive))] : [...tavernTaskIds];
}

// The server does not necessarily push tavern progress until it is requested.
// Query only these known tasks; do not accept tasks or manufacture completion.
async function refreshTavernProgress(adapter, manager) {
  const quests = adapter.manager('ActivityQuestManager');
  if (!method(manager, 'reqTaskProgressByIds') && !method(quests, 'UpTaskState')) return;
  const valid = () => !adapter.signal?.aborted && adapter.valid?.() !== false;
  if (!valid()) return;
  await new Promise((resolve, reject) => {
    let timer;
    const finish = () => { clearTimeout(timer); adapter.signal?.removeEventListener?.('abort', finish); resolve(); };
    adapter.signal?.addEventListener?.('abort', finish, { once: true });
    timer = setTimeout(finish, 800);
    try {
      const ids = currentTavernTaskIds(adapter);
      const modern = ids.filter(id => quests?.GetServerTaskDataByTaskID?.(id) || !manager?.GetServerTaskDataByTaskID?.(id));
      const legacy = ids.filter(id => !modern.includes(id));
      if (valid() && modern.length && method(quests, 'UpTaskState')) quests.UpTaskState(modern);
      if (valid() && method(manager, 'reqTaskProgressByIds')) {
        const oldIds = method(quests, 'UpTaskState') ? legacy : ids;
        if (oldIds.length) manager.reqTaskProgressByIds(oldIds);
      }
      if (!valid() || !ids.length) finish();
    }
    catch (error) { clearTimeout(timer); adapter.signal?.removeEventListener?.('abort', finish); reject(error); }
  });
}
const freeGeneralId = adapter => {
  const config = read(() => adapter.config('ff_general_chest_info_config.sgs'));
  return Number((config?.root || config)?.Common?.[0]?.freeGeneralDropId);
};
function entries(value) {
  if (Array.isArray(value)) return value.slice(0, 2048).map((item, index) => [String(index), item]);
  const map = read(() => value._maps);
  if (map && typeof map === 'object') return Object.entries(map).slice(0, 2048);
  for (const key of ['datum', '_objDatum']) if (Array.isArray(read(() => value[key]))) return entries(value[key]);
  return [];
}
const rows = value => entries(value).map(([, item]) => item);
const idOf = (value, fallback) => Number(value?.id ?? value?.ID ?? fallback);
const lookup = (dictionary, id) => read(() => dictionary.getNumberKey(id)) ?? read(() => dictionary.get(id)) ?? read(() => dictionary._maps[id]);
const protocol = event => {
  const p = event?.Protocol ?? event;
  if (!p || p.errCode) return null;
  return p.Data?.ProtoObj ?? p;
};
function taskRequest(manager) {
  if (method(manager, 'RequestTaskAward')) return (...args) => manager.RequestTaskAward(...args);
  const owner = manager && Object.getPrototypeOf(manager), found = Object.getOwnPropertyNames(owner ?? {}).slice(0, 512).flatMap(key => {
    if (key === 'constructor') return [];
    const fn = Object.getOwnPropertyDescriptor(owner, key)?.value;
    return typeof fn === 'function' && Function.prototype.toString.call(fn).includes('TaskRewardSelectWindow') ? [fn] : [];
  });
  return found.length === 1 ? (...args) => Reflect.apply(found[0], manager, args) : null;
}
function safeTask(item, tavern = false) {
  const base = item?.baseVo;
  const description = [base?.name, base?.Name, base?._name, base?.desc, base?.Desc, base?._desc].filter(value => typeof value === 'string').join(' ');
  return !!base && item.CanAward === true && item.HasAward !== true && item.HasExpired !== true && item.hasExpired !== true && (item.TaskCompeleMax !== true || (tavern && base.IsRepect === true)) && base.EffectClientTime !== false && base.IsEffectServerTimeStart !== false && !item.HaveSelectReward && !base.HaveSelectReward && !base.haveSelectReward && !rows(base.taskSelectReward).length && !rows(item.taskSelectReward).length && !item.IsBuyTask && !base.IsBuyTask && (tavern || (Number(item.CanRewardCount ?? 1) <= 1 && Number(base.maxComplete ?? base._maxComplete ?? 1) <= 1)) && !/兑换|兑取|换取|消耗|扣除|购买|合成|盲盒/.test(description) && !rows(item.TaskConditions ?? item.taskConditions).some(value => Number(value?.reqType ?? value?._reqType) === 30);
}
function latestHistory(manager) {
  const history = manager?.NewParWeiOriData?.historyDataDic;
  const keys = Array.isArray(history?.keys) ? history.keys : entries(history).map(([key]) => key);
  return Number(keys[keys.length - 1]);
}
function seasonRewards(adapter, manager, round) {
  const native = read(() => manager.CurRankTypeVo.GetSessionInfo(round)?.SessionAwardList);
  if (Array.isArray(native)) return native;
  const type = Number(manager.NewTTrankData?.ttrankType);
  if (!positive(type)) return null;
  const config = rows(adapter.config('mod_new_ttrank_config.sgs')?.root?.TTRankCfg).find(item => Number(item?.rankType) === type);
  const season = rows(config?.RankItem).find(item => Number(item?.cycId) === round);
  if (!season) return null;
  if (season.cycRewardQuest) return String(season.cycRewardQuest).split(';').slice(0, 128).map(item => {
    const [Level, TaskId] = item.split(',').map(Number); return { Level, TaskId, Itemlist: [] };
  });
  if (season.cycRewardQuest1) return String(season.cycRewardQuest1).split('|').slice(0, 128).map(item => {
    const [level, items] = item.split(':'); return { Level: Number(level), TaskId: 0, Itemlist: String(items ?? '').split(';').map(item => item.split(',').map(Number)).filter(item => positive(item[0]) && positive(item[1])) };
  });
  return null;
}

export const managerSpecs = {
  WelfareManger: { events: ['decodeClientTavernInfoRep', 180004], guard: value => method(value, 'ReqJgqyInfo') && method(value, 'JgqyHasRedNew') },
  ActivityManager: { events: ['ClientFestivalSignDataNtf', 'decodeFestivalSignConfigDataRep', 'decodeClientInviteLoginInfoRep', 'decodeClientNewJDInfoNtf', 29297, 120010, 170299], guard: value => method(value, 'GetFestivalSignData') || method(value, 'SendDDZTLLAwardReq') },
  NewFuLiManager: { events: ['decodeSetOutGiftInfoResp', 'decodeSetOutGiftRewardResp', 200018, 200020], guard: value => method(value, 'GetPassData') && method(value, 'SendSetOutRewardReq') },
  OfficerManager: { events: ['ClientOfficerGetWeekRewardRep', 'decodeUserOfficerGetDayRewardRep', 23969, 190082, 23973, 23975], guard: value => method(value, 'CanGetOfficerWeekReward') },
  GameGeneralManager: { events: ['ClientUserDataCounterNtf', 'decodeClientGeneralAtlasResp', 'decodeClientGeneralAtlasLightResp', 195002, 195006], guard: value => method(value, 'LampRewardReq') || method(value, 'CanFreeOpenGeneral') },
  TianTiManager: { events: ['ClientTTLevelAwardRep', 'ClientTTSeasonAwardRep'], guard: value => method(value, 'RequestLevelAward') },
  TaskManager: { events: ['decodeClientGetJdCalcQuestAwardRep', 'decodeClientJdCalcQuestAwardInfoNtf', 170036, 170037], guard: value => method(value, 'HasRewardQuest') && method(value, 'SendGetJdCalcQuestRewardReq') },
  ActivityGameDataManager: { events: ['ClientGetWeekFreeBeanRep', 'decodeClientGetWeekFreeBeanRep', 23934, 200084], guard: value => method(value, 'SendClientGetWeekFreeBeanReq') },
};

async function prepareOfficer(adapter) {
  const manager = adapter.manager('OfficerManager'), proxy = adapter.proxy?.();
  if (manager?.DataInited !== false || !method(manager, 'sendOfficerInfo')) return;
  await new Promise(resolve => {
    const caller = {}; let timer;
    const finish = () => {
      clearTimeout(timer);
      for (const event of ['ClientOfficerSimpleInfoRep', 'ClientOfficerInfoRep', 23973, 23975]) proxy?.off?.(event, caller, finish);
      adapter.signal?.removeEventListener('abort', finish);
      resolve();
    };
    for (const event of ['ClientOfficerSimpleInfoRep', 'ClientOfficerInfoRep', 23973, 23975]) proxy?.on?.(event, caller, finish);
    adapter.signal?.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, 800);
    if (adapter.signal?.aborted || adapter.valid?.() === false) return finish();
    try { manager.sendOfficerInfo(); } catch { finish(); }
  });
}

export async function prepareActivities(adapter, selected = {}) {
  if (!selected.activities || adapter.signal?.aborted || adapter.valid?.() === false) return;
  const general = adapter.manager('GameGeneralManager');
  const task = adapter.manager('TaskManager'), ranked = adapter.manager('TianTiManager'), loads = [];
  const tavernRefresh = refreshTavernProgress(adapter, task);
  const officerRefresh = prepareOfficer(adapter);
  if (method(adapter.manager('OfficerManager'), 'CanGetOfficerWeekReward') && !adapter.config('h5_officer.sgs')) loads.push('h5_officer');
  if (method(general, 'LampRewardReq') && !adapter.config('cha_dbs_general_series.sgs')) loads.push('cha_dbs_general_series');
  if (!selected.excludeRecruit && method(general, 'SendClientUseGeneralDrawCardReq') && !adapter.config('ff_general_chest_info_config.sgs')) loads.push('ff_general_chest_info_config');
  const activity = adapter.manager('ActivityManager');
  if ((method(task, 'SendGetJdCalcQuestRewardReq') || method(activity, 'SendGetJDRewardReq') || method(activity, 'SendGetNewJDRewardReq') || method(activity, 'SendDDZTLLAwardReq')) && !adapter.config('ff_task_daily.sgs')) loads.push('ff_task_daily');
  if (positive(latestHistory(ranked)) && !seasonRewards(adapter, ranked, latestHistory(ranked)) && !adapter.config('mod_new_ttrank_config.sgs')) loads.push('mod_new_ttrank_config');
  await Promise.all([...loads.map(name => adapter.loadConfig?.(name)), tavernRefresh, officerRefresh]);
}

export function planActivities(adapter, selected = {}) {
  const actions = [], notes = [];
  if (!selected.activities) return { actions, notes };
  const note = text => notes.push({ category: 'activities', text });
  const add = action => {
    if (read(action.eligible) === true) actions.push({ category: 'activities', ...action });
  };
  const group = (label, fn) => { try { fn(); } catch { note(`${label}数据未就绪`); } };
  const activity = adapter.manager('ActivityManager');

  group('节日签到', () => {
    if (!activity) return note('活动数据尚未就绪；请先打开游戏福利页');
    if (method(activity, 'SendClientFestivalSignGetRewardReq')) for (const [key, config] of entries(activity.FestivalSignConfigDic)) {
      const id = idOf(config, key);
      if (!positive(id)) continue;
      const current = () => activity.GetFestivalSignData(id);
      for (const reward of rows(config.awards)) {
        const day = Number(reward?.days);
        if (!positive(day) || day > 7) continue;
        add({ key: `festival:${id}:${day}`, label: `节日签到 ${id} 第 ${day} 天`, manager: activity,
          rewards: () => reward,
          eligible: () => activity.FestivalSignNeedShow(id) === true && current()?.AwardCanGet(day) === true,
          done: () => current()?.AwardHadGet(day) === true,
          send: () => activity.SendClientFestivalSignGetRewardReq(id, day),
          confirmations: adapter.proxy?.() ? [{ manager: adapter.proxy(), event: 'ClientFestivalSignGetRewardRep', accept: event => { const p = protocol(event); return p?.result === 0 && Number(p.xId) === id && Number(p.days) === day; } }] : [],
        });
      }
    }
    if (method(activity, 'SendNewClientFestivalSignGetRewardReq')) for (const [key, data] of entries(activity.NewFestivalSignDataDic)) {
      const id = idOf(data, key);
      if (!positive(id)) continue;
      for (const reward of rows(data.awards)) {
        const date = Number(reward?.date);
        if (!positive(date)) continue;
        const current = () => rows(activity.GetNewFestivalSignData(id)?.awards).find(item => Number(item?.date) === date);
        add({ key: `festival-new:${id}:${date}`, label: `节日日期签到 ${id} / ${date}`, manager: activity,
          rewards: () => current(),
          eligible: () => activity.NewFestivalSignNeedShow(id) === true && !!current() && activity.GetFesSignAwdState(current()) === 2,
          done: () => current()?.stat === true || current()?.stat === 1,
          send: () => activity.SendNewClientFestivalSignGetRewardReq(id, date),
        });
      }
    }
    if (method(activity, 'SendNewClientAccumlateSignGetRewardReq')) for (const [key, config] of entries(activity.AccumlateSignConfigDic)) {
      const id = idOf(config, key);
      if (!positive(id)) continue;
      for (const reward of rows(config.awards)) {
        const day = Number(reward?.day);
        if (!positive(day)) continue;
        const current = () => rows(lookup(activity.AccumlateSignConfigDic, id)?.awards).find(item => Number(item?.day) === day);
        add({ key: `accum-sign:${id}:${day}`, label: `累计登录 ${id} / ${day} 天`, manager: activity,
          rewards: () => current(),
          eligible: () => activity.AccumlateSignNeedShow(id) === true && !!current() && activity.GetAccumlateAwdState(id, current()) === 2,
          done: () => current()?.stat === true || current()?.stat === 1,
          send: () => activity.SendNewClientAccumlateSignGetRewardReq(id, day),
        });
      }
    }
  });

  group('军典与同乐乐', () => {
    const military = planMilitaryRewards(adapter, activity);
    actions.push(...military.actions); notes.push(...military.notes);
    for (const [key, label, flag, list, highList, send] of [
      ['jd', '军典', 'HasJDRewardRed', 'JDHaveRewardList', 'JDHaveRewardList_bp', 'ReqDrawAllJDRwd'],
      ['new-jd', '节钺令', 'HasNewJDRewardRed', 'NewJDHaveRewardList', 'NewJDHaveRewardList_bp', 'ReqDrawAllNewJDRwd'],
      ['ddz-tll', '斗地主同乐乐', 'HasDDZTLLRewardRed', 'DDZBattleRewardList', 'DDZBattleAwardBpList', 'SendDDZTLLAwardReq'],
    ]) {
      if (military.handled.has(key)) continue;
      if (!method(activity, send) || !Array.isArray(activity[list]) || !Array.isArray(activity[highList])) continue;
      const before = [activity[list].slice(), activity[highList].slice()];
      // Native all-reward endpoints only claim earned rights; no activation/purchase.
      // A red-dot disappearing alone is not a success acknowledgment.
      add({ key: `activity:${key}:${before.map(value => value.map(Number).sort((a, b) => a - b).join(',')).join('/')}`,
        label: `${label}可领取奖励`, manager: activity,
        eligible: () => activity[flag] === true,
        done: () => [list, highList].some((field, index) => Array.isArray(activity[field]) && activity[field].some(id => !has(before[index], id))),
        send: () => key === 'ddz-tll' ? activity[send](0, false, true) : activity[send](),
      });
    }
  });

  group('新福利军令', () => {
    const manager = adapter.manager('NewFuLiManager');
    if (!manager) return;
    for (const [key, data] of entries(manager.PassdataDic ?? manager.passDataDic)) {
      const vo = data?.VO ?? data?.vo, id = idOf(vo, key);
      if (!positive(id) || vo?.IsInOpenTime === false) continue;
      for (const reward of rows(vo?.RewardList)) for (const high of [false, true]) {
        const rewardId = Number(reward?.ID);
        if (!positive(rewardId) || !(high ? reward.FFItemInfo : reward.ItemInfo)) continue;
        const current = () => manager.GetPassData(id);
        add({ key: `pass:${id}:${rewardId}:${Number(high)}`, label: `军令 ${id} 第 ${rewardId} 档${high ? '已解锁高级' : ''}奖励`, manager,
          rewards: () => high ? reward.FFItemInfo : reward.ItemInfo,
          eligible: () => { const value = current(); return !!value && Array.isArray(high ? value.awardsHigh : value.awardsLow) && (value.VO ?? value.vo)?.IsInOpenTime === true && Number(value.CurPoints) >= Number(reward.Point) && (!high || value.IsFF === true) && !value.HasGetReward(rewardId, high); },
          done: () => current()?.HasGetReward(rewardId, high) === true,
          send: () => manager.SendSetOutRewardReq(id, rewardId, high),
        });
      }
    }
  });

  group('官阶奖励', () => {
    const manager = adapter.manager('OfficerManager');
    if (!manager || manager.DataInited === false) return;
    for (const [kind, label] of [['Day', '每日'], ['Week', '每周']]) {
      const can = `CanGetOfficer${kind}Reward`, send = `sendGet${kind}Reward`, stamp = `${kind}RewardTime`, before = Number(manager[stamp]);
      if (!method(manager, can) || !method(manager, send) || !Number.isFinite(before)) continue;
      add({ key: `officer:${kind.toLowerCase()}`, label: `官阶${label}奖励`, manager,
        rewards: () => rows(adapter.config('h5_officer.sgs')?.root?.officer)
          .find(row => Number(row.id ?? row.ID) === Number(manager.OfficerSLv))?.[kind === 'Day' ? 'dayReward' : 'weekReward'],
        eligible: () => manager.DataInited !== false && manager[can]() === true,
        done: () => Number(manager[stamp]) > before && manager[can]() === false,
        send: () => manager[send](),
        confirmations: adapter.proxy?.() ? [kind === 'Day' ? 'decodeUserOfficerGetDayRewardRep' : 'ClientOfficerGetWeekRewardRep', kind === 'Day' ? 190082 : 23969]
          .map(event => ({ manager: adapter.proxy(), event, accept: event => protocol(event)?.result === 0 })) : [],
        rejections: adapter.proxy?.() ? [kind === 'Day' ? 'decodeUserOfficerGetDayRewardRep' : 'ClientOfficerGetWeekRewardRep', kind === 'Day' ? 190082 : 23969]
          .map(event => ({ manager: adapter.proxy(), event, accept: event => Number.isInteger(protocol(event)?.result) && protocol(event).result > 0 })) : [],
      });
    }
  });

  group('武将集册及免费武将包', () => {
    const manager = adapter.manager('GameGeneralManager');
    if (!manager) return;
    if (method(manager, 'GeneralAtlasRewardReq')) for (const [key, state] of entries(manager.atlasGeneralDict)) {
      const id = Number(key);
      if (!positive(id) || state !== true) continue;
      add({ key: `atlas:${id}`, label: `武将 ${id} 集册奖励`, manager,
        eligible: () => lookup(manager.atlasGeneralDict, id) === true && manager.GetCurryAtlasGeneralState(id) === true,
        done: () => lookup(manager.atlasGeneralDict, id) === false,
        send: () => manager.GeneralAtlasRewardReq(id),
      });
    }
    const collection = adapter.config('cha_dbs_general_series.sgs')?.root?.Collection;
    if (method(manager, 'LampRewardReq')) {
      if (!Array.isArray(collection)) note('武将集灯配置尚未就绪');
      const ids = new Set(rows(collection).flatMap(item => String(item?.seriesList ?? '').split(',')).map(Number).filter(positive));
      for (const id of ids) add({ key: `lamp:${id}`, label: `武将集灯 ${id} 奖励`, manager,
        eligible: () => manager.LampRewardCanAward(id) === true && manager.LampHasReward(id) === false,
        done: () => manager.LampHasReward(id) === true, send: () => manager.LampRewardReq(id),
      });
    }
    const before = Number(manager.FreeOpenGeneralPackTime);
    const freeId = freeGeneralId(adapter);
    if (!selected.excludeRecruit && method(manager, 'CanFreeOpenGeneral') && method(manager, 'SendClientUseGeneralDrawCardReq') && Number.isFinite(before) && positive(freeId)) add({
      key: 'free-general-pack', label: '每日免费招募', manager, workflowGroup: 'free-general-pack',
      eligible: () => (manager.FreeOpenGeneralPackTime === 0 || manager.CanFreeOpenGeneral() === true) && !manager.reservePool?.Value && freeGeneralId(adapter) === freeId,
      done: () => Number(manager.FreeOpenGeneralPackTime) > before,
      send: () => manager.SendClientUseGeneralDrawCardReq(freeId, 3),
      confirmations: adapter.proxy?.() ? [{ manager: adapter.proxy(), event: 'CcUserUsingGoodsRep', accept: event => {
        const p = event?.Protocol, selfId = Number(adapter.self?.()?.ClientId);
        return selfId > 0 && p?.Result === 1 && Number(p?.GoodsBaseID) === freeId && Number(p?.UserClientID) === selfId && [1, 2].includes(p?.Type);
      } }] : [],
    });
    else if (!selected.excludeRecruit && method(manager, 'SendClientUseGeneralDrawCardReq') && !positive(freeId)) note('免费招募配置尚未就绪');
  });

  group('排位段位奖励', () => {
    const manager = adapter.manager('TianTiManager');
    if (!method(manager, 'RequestLevelAward')) return;
    const data = () => manager.NewParWeiOriData, season = manager.CurSessionVoById, round = Number(data()?.curCycData?.roundId);
    if (!positive(round) || Number(season?.CycID) !== round || !Array.isArray(data()?.curAwardInfo?.levelAwardState)) return;
    for (const reward of rows(season.LvAwardList)) {
      const level = Number(reward?.Level);
      if (!positive(level) || reward.TaskId || !reward.Itemlist?.length) continue;
      add({ key: `rank-level:${round}:${level}`, label: `排位 ${round} 赛季段位 ${level} 奖励`, manager,
        rewards: () => reward.Itemlist,
        eligible: () => Number(data()?.curCycData?.roundId) === round && Number(data()?.curCycData?.curRecord?.curLevel?.level) >= level && Array.isArray(data()?.curAwardInfo?.levelAwardState) && !has(data().curAwardInfo.levelAwardState, level),
        done: () => Number(data()?.curCycData?.roundId) === round && has(data()?.curAwardInfo?.levelAwardState, level),
        send: () => manager.RequestLevelAward(level, round),
        confirmations: [{ manager, event: 'TTLEVEL_AWARD_REP_RFRESH', accept: event => { const p = protocol(event); return p?.result === 1 && Number(p.cycId) === round && Number(p.level) === level; } }],
      });
    }
  });

  group('军典累计任务奖励', () => {
    const manager = adapter.manager('TaskManager');
    if (!method(manager, 'SendGetJdCalcQuestRewardReq') || !method(manager, 'HasRewardQuest')) return;
    const config = adapter.config('ff_task_daily.sgs')?.root?.cumulativeQuest;
    if (!Array.isArray(config)) return note('军典累计任务缺少 ff_task_daily.cumulativeQuest 配置');
    for (const reward of rows(config)) {
      const id = Number(reward?.id), need = Number(reward?.rewardneed), [goods, count] = String(reward?.rewardnum ?? '').split(',').map(Number);
      if (!positive(id) || !Number.isSafeInteger(need) || need < 0 || !positive(goods) || !positive(count)) continue;
      add({ key: `jd-task-milestone:${id}`, label: `军典累计完成 ${need} 项任务奖励`, manager,
        rewards: () => reward.rewardnum,
        eligible: () => Array.isArray(manager.jdTaskRewardList) && Number.isFinite(Number(manager.JdTaskRewardNum)) && Number(manager.JdTaskRewardNum) >= need && manager.HasRewardQuest(id) === false,
        done: () => manager.HasRewardQuest(id) === true,
        send: () => manager.SendGetJdCalcQuestRewardReq(id),
      });
    }
  });

  group('历史排位赛季结算', () => {
    const manager = adapter.manager('TianTiManager'), tasks = adapter.manager('TaskManager'), round = latestHistory(manager);
    if (!positive(round)) return;
    const currentRound = () => Number(manager.NewParWeiOriData?.curCycData?.roundId);
    if (!positive(currentRound()) || currentRound() === round) return;
    const record = () => lookup(manager.NewParWeiOriData?.historyDataDic, round);
    const award = () => lookup(manager.NewParWeiOriData?.historyAwardDic, round);
    const rewards = seasonRewards(adapter, manager, round);
    if (!rewards) return note(`历史排位 ${round} 缺少对应 rankType 的赛季奖励配置`);
    if (!positive(record()?.maxLevel?.level)) return note(`历史排位 ${round} 缺少 maxLevel`);
    const sorted = rewards.filter(item => positive(item?.Level)).slice().sort((a, b) => Number(b.Level) - Number(a.Level));
    if (!sorted.some(item => Number(item.Level) <= Number(record().maxLevel.level))) return;
    const sameSeason = () => latestHistory(manager) === round && positive(currentRound()) && currentRound() !== round;
    const request = taskRequest(tasks);
    // Native settlement UI considers the latest historical season, highest tier first.
    for (const reward of sorted) {
      const id = Number(reward.TaskId);
      if (positive(id)) {
        const current = () => tasks?.GetServerTaskDataByTaskID?.(id);
        if (current()?.HasAward === true) return;
        if (current()?.CanAward === true) {
          if (!request || !safeTask(current())) return note(`历史排位任务 ${id} 需选择奖励或原生领奖接口未就绪`);
          add({ key: `task:${id}`, label: `排位 ${round} 赛季结算任务奖励`, manager: tasks,
            rewards: () => current()?.baseVo?.TaskRewardItem ?? current()?.TaskRewardItem,
            eligible: () => sameSeason() && safeTask(current()), done: () => current()?.HasAward === true,
            send: () => request(id, 0, Math.max(0, Math.min(1, Number(current()?.CanRewardCount) || 0))),
          });
          return;
        }
      } else if (reward.Itemlist?.length) {
        if (!award() || typeof award().seasonAwardState !== 'boolean') return note(`历史排位 ${round} 缺少 seasonAwardState`);
        if (!method(manager, 'RequestSeasonAward')) return note('历史排位 RequestSeasonAward 接口未就绪');
        add({ key: `rank-season:${round}`, label: `排位 ${round} 赛季结算奖励`, manager,
          rewards: () => sorted.find(item => Number(item.Level) <= Number(record()?.maxLevel?.level))?.Itemlist,
          eligible: () => sameSeason() && award()?.seasonAwardState === false && sorted.some(item => Number(item.Level) <= Number(record()?.maxLevel?.level)),
          done: () => award()?.seasonAwardState === true,
          send: () => manager.RequestSeasonAward(round),
          confirmations: adapter.proxy?.() ? [{ manager: adapter.proxy(), event: 'ClientTTSeasonAwardRep', accept: event => { const p = protocol(event); return p?.result === 1 && Number(p.cycId) === round; } }] : [],
        });
        return;
      }
    }
    if (sorted.some(item => positive(item.TaskId) && !tasks?.GetServerTaskDataByTaskID?.(Number(item.TaskId)))) note(`历史排位 ${round} 的原生结算任务状态尚未同步`);
  });

  group('邀请助力', () => {
    if (!method(activity, 'SendReqInviteLoginGetCoin') || !adapter.proxy?.()) return;
    const round = Number(activity.InviteLoginCfg?.roundId);
    if (!positive(round)) return;
    for (const item of rows(activity.InviteLoginInfo?.assistList)) {
      const id = Number(item?.id);
      if (!positive(id)) continue;
      const current = () => rows(activity.InviteLoginInfo?.assistList).find(value => Number(value?.id) === id);
      add({ key: `invite-coin:${round}:${id}`, label: `邀请活动助力币 ${id}`, manager: activity,
        eligible: () => { const value = current(); return Number(activity.InviteLoginCfg?.roundId) === round && !!value && Number(value.count) > 0 && (Number(value.type) !== 3 || value.state === true || value.state === 1); },
        done: () => false, // Native UI emits success-looking events even when result != 0.
        send: () => activity.SendReqInviteLoginGetCoin(id, round),
        confirmations: [{ manager: adapter.proxy(), event: 'decodeClientInviteLoginGetCoinRep', accept: event => { const p = protocol(event); return p?.result === 0 && Number(p.id) === id && Number(activity.InviteLoginCfg?.roundId) === round; } }],
      });
    }
  });

  group('免费低保豆', () => {
    const manager = adapter.manager('ActivityGameDataManager');
    if (!method(manager, 'SendClientGetWeekFreeBeanReq')) return;
    const before = Number(manager.DdzFreeBeanCount);
    if (!Number.isInteger(before) || before < 0) return;
    add({ key: `free-beans:${before}`, label: '斗地主免费低保豆', manager,
      rewards: () => [{ ItemID: 9020101, ItemName: '欢乐豆' }],
      eligible: () => manager.CanGetDdzFreeBean === true && Number(manager.DdzFreeBeanCount) === before,
      done: () => Number(manager.DdzFreeBeanCount) > before,
      send: () => manager.SendClientGetWeekFreeBeanReq(),
    });
  });

  group('酒馆任务', () => {
    const manager = adapter.manager('TaskManager');
    if (!method(manager, 'GetServerTaskDataByTaskID')) return note('酒馆任务数据接口尚未就绪');
    const request = taskRequest(manager);
    if (!request) return note('酒馆任务领奖接口尚未就绪');
    const config = tavernConfig(adapter), round = config?.Round;
    for (const id of currentTavernTaskIds(adapter)) {
      const quests = adapter.manager('ActivityQuestManager');
      const modern = !!quests?.GetServerTaskDataByTaskID?.(id);
      const owner = modern ? quests : manager;
      const current = () => owner.GetServerTaskDataByTaskID(id);
      if (!current()) { note(`酒馆任务 ${id} 进度尚未同步，请稍后重试`); continue; }
      const same = () => currentTavernTaskIds(adapter).includes(id) && tavernConfig(adapter)?.Round === round;
      const safe = () => same() && adapter.manager(modern ? 'ActivityQuestManager' : 'TaskManager') === owner &&
        (!modern || (current()?.HasServerData === true && current()?.IsFromServer !== false)) && safeTask(current(), true);
      const before = Number(current()?.completeTimes);
      const slot = tavernSlots.find(([field]) => Number(config?.[field]) === id);
      if (current()?.CanAward === true && !safe()) note(`酒馆任务 ${id} 未通过领取条件检查（过期、选奖、消耗或次数状态），请在游戏内核对`);
      const proxy = adapter.proxy?.();
      const questReply = event => {
        const p = event?.Protocol, data = p?.Data?.ProtoObj;
        return same() && !p?.errCode && Number(data?.quest_id) === id && data?.op_type === 1 ? data : null;
      };
      add({ key: `tavern-task:${id}`, label: `酒馆${slot?.[2] || '已完成任务'}（${id}）`, manager, eligible: safe,
        rewards: () => {
          const items = current()?.baseVo?.TaskRewardItem ?? current()?.TaskRewardItem;
          if (rows(items).length) return items;
          const active = tavernConfig(adapter), count = Number(active?.[slot?.[1]]);
          return same() && positive(active?.SaveWineGood) && positive(count) ? [{ ItemID: Number(active.SaveWineGood), ItemNum: count }] : items;
        },
        done: () => same() && (current()?.HasAward === true || (Number.isSafeInteger(before) && before >= 0 && Number(current()?.completeTimes) > before)),
        // Native tavern clicks call J(id), whose default count is 0 (single claim).
        send: () => safe() ? request(id, 0, 0) : false,
        confirmations: proxy ? (modern ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => questReply(event)?.result === 0 }] : [{ manager: proxy, event: 'SmsgClientTaskRewardResponse', accept: event => {
          const p = event?.Protocol;
          return same() && !!p && !p.errCode && Number(p.TaskID) === id && Number.isInteger(p.CompleteTimes) && p.CompleteTimes >= 0;
        } }]) : [],
        rejections: proxy ? (modern ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => Number.isInteger(questReply(event)?.result) && questReply(event).result > 0,
          text: event => `酒馆任务领取失败（游戏错误码 ${questReply(event).result}），请在游戏内核对` }] : [{ manager: proxy, event: 'SmsgTaskFailed', accept: event => Number(event?.Protocol?.TaskID) === id && Number.isInteger(event?.Protocol?.ErrorCode),
          text: event => `酒馆任务领取失败（游戏错误码 ${event.Protocol.ErrorCode}），请在游戏内核对` }]) : [],
      });
    }
  });
  return { actions: [...new Map(actions.map(action => [action.key, action])).values()].slice(0, 200), notes };
}
