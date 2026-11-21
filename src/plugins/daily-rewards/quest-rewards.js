import { read } from '../../shared/safe-read.js';
// The client keeps newer activity/login rewards in a second quest manager.
// Discover its existing proxy caller; never create one or accept a new quest.
// Recharge progress is already completed and requires no payment at claim time.
const repeatableConditions = new Set([1, 2, 3, 4, 6, 7, 60, 61]);
// REQ_GET_REFINE_STONE is the main quest for owning five-star generals.
const refineStoneCondition = 128;
const conditionType = condition => Number(condition?.reqType ?? condition?._reqType);
const refineClaimProgress = new WeakMap();
function isRefineQuest(task) {
  const conditions = task?.TaskConditions || task?.taskConditions;
  return task?.IsNewQusetType === true && Array.isArray(conditions) && conditions.length === 1 &&
    conditionType(conditions[0]) === refineStoneCondition;
}
export const managerSpecs = {
  ActivityQuestManager: {
    events: ['decodeUserQuestInfoRep', 'decodeUserQuestOpRep', 'decodeUserQuestDelNtf', 107009, 107014, 107010],
    guard: value => typeof value?.getTaskListFromServer === 'function' && typeof value?.UpTaskState === 'function' && typeof value?.GetServerTaskDataByTaskID === 'function',
  },
};

// Daily login quests can remain absent/stale until the native daily page asks
// for the server list. Refresh the existing manager without accepting quests.
export async function prepareActivityQuests(adapter, selected) {
  if (!selected.tasks || adapter.signal?.aborted || adapter.valid?.() === false) return;
  const manager = adapter.manager('ActivityQuestManager'), proxy = adapter.proxy?.();
  if (typeof manager?.getTaskListFromServer !== 'function') return;
  await new Promise((resolve, reject) => {
    const caller = {}; let timer;
    const finish = () => {
      clearTimeout(timer);
      for (const event of ['decodeUserQuestInfoRep', 107009]) proxy?.off?.(event, caller, finish);
      adapter.signal?.removeEventListener('abort', finish);
      resolve();
    };
    for (const event of ['decodeUserQuestInfoRep', 107009]) proxy?.on?.(event, caller, finish);
    adapter.signal?.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, 800);
    if (adapter.signal?.aborted || adapter.valid?.() === false) return finish();
    try { manager.getTaskListFromServer(); }
    catch { finish(); }
  });
}

export function planActivityQuests(adapter, selected, { rows, nativeMethod, taskSkipReason, reservedIds = [] }) {
  if (!selected.tasks) return { actions: [], notes: [] };
  const manager = read(() => adapter.manager('ActivityQuestManager'));
  if (!manager) return { actions: [], notes: [] };
  // The ordinary task entry routes new quests to their manager and refreshes
  // special-condition state. Its unique native signature is already audited.
  const ordinary = read(() => adapter.manager('TaskManager'));
  const ordinaryRequest = nativeMethod(ordinary, 'RequestTaskAward', ['TaskRewardSelectWindow']);
  const request = ordinaryRequest ||
    nativeMethod(manager, 'RequestTaskAward', ['quest_id:', 'reward_idx:', 'CLIENT_QUEST_OP_REQ']);
  if (!request) return { actions: [], notes: [{ category: 'tasks', text: '活动任务已就绪，原生领奖入口尚未匹配' }] };
  const live = () => read(() => adapter.manager('ActivityQuestManager')) === manager && manager.destroyed !== true &&
    (!ordinaryRequest || (read(() => adapter.manager('TaskManager')) === ordinary && ordinary.destroyed !== true));
  const actions = [], seen = new Set(reservedIds);
  for (const task of rows(manager.allTasks)) {
    const id = Number(read(() => task?.id ?? task?._id ?? task?.baseVo?.id));
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const current = () => read(() => manager.GetServerTaskDataByTaskID(id));
    const initial = current();
    const before = Number(read(() => initial?.completeTimes));
    if (!Number.isSafeInteger(before) || before < 0) continue;
    const refineQuest = read(() => isRefineQuest(initial)) === true;
    // LW.CanAward honors alternative conditions, while CanRewardCount returns
    // zero as soon as ANY condition is unfinished. The daily UI uses J(id)
    // (count=0) for a single claim. Keep repeat/batch tasks on their old gate.
    const nativeSingle = value => value?.IsNewQusetType === true &&
      Number(value.baseVo?.maxComplete ?? value.baseVo?._maxComplete) === 1 &&
      Number(value.completeTimes) === 0 && value.CanRewardCount === 0;
    const safe = () => read(() => {
      const value = current(), available = Number(value?.CanRewardCount);
      if (!live() || !value || value.HasServerData !== true || value.IsFromServer === false ||
          !Number.isSafeInteger(available) || (available < 1 && !nativeSingle(value))) return false;
      if (refineQuest) {
        // The native success handler increments completeTimes before its
        // quest-info request replaces condition_data with the remaining progress.
        const progress = value.condition_data;
        return isRefineQuest(value) && available > 0 && Array.isArray(progress) && progress.length > 0 &&
          refineClaimProgress.get(value) !== progress && !taskSkipReason(value, { allowRepeat: true });
      }
      const reason = taskSkipReason(value);
      if (!reason) return true;
      if (reason !== '多次奖励需手动处理') return false;
      const originalConditions = value.TaskConditions || value.taskConditions;
      const conditions = rows(originalConditions, 64);
      if (!Array.isArray(originalConditions) || originalConditions.length > 64 || !conditions.length ||
          !conditions.every(condition => repeatableConditions.has(conditionType(condition)))) return false;
      return !taskSkipReason(value, { allowRepeat: true });
    }) === true;
    if (!safe()) continue;
    const eligible = () => read(() => {
      if (!safe() || Number(current()?.completeTimes) !== before) return false;
      const prev = Number(current()?.baseVo?.prevTask);
      return !prev || manager.GetServerTaskDataByTaskID(prev)?.HasAward === true || adapter.manager('TaskManager')?.GetServerTaskDataByTaskID(prev)?.HasAward === true;
    }) === true;
    const proxy = read(() => adapter.proxy?.());
    const matches = event => {
      const packet = event?.Protocol?.Data?.ProtoObj;
      return packet && Number(packet.quest_id) === id && packet.op_type === 1 ? packet : null;
    };
    const name = read(() => current()?.baseVo?.name ?? current()?.baseVo?._name);
    actions.push({ key: `quest:${id}:${before}`, category: 'tasks', workflowGroup: `quest:${id}`, label: typeof name === 'string' && name.trim() ? `${name.trim().slice(0, 120)}（任务 ${id}）` : `活动任务 ${id}`, manager,
      rewards: () => current()?.baseVo?.TaskRewardItem ?? current()?.baseVo?.taskRewardItem ?? current()?.TaskRewardItem,
      eligible,
      done: () => live() && read(() => current()?.HasAward === true || Number(current()?.completeTimes) > before) === true,
      send: () => {
        if (!eligible()) return false;
        const value = current();
        if (refineQuest) {
          refineClaimProgress.set(value, value.condition_data);
          return request(id, 0, value.baseVo.CanOneReceive ? 1 : 0);
        }
        return request(id, 0, nativeSingle(value) ? 0 : 1);
      },
      confirmations: proxy ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => matches(event)?.result === 0 }] : [],
      rejections: proxy ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => { const result = matches(event)?.result; return Number.isInteger(result) && result > 0; } }] : [],
    });
  }
  return { actions, notes: [] };
}
