// The client keeps newer activity/login rewards in a second quest manager.
// Discover its existing proxy caller; never create one or accept a new quest.
const read = fn => { try { return fn(); } catch { return undefined; } };
const passiveConditions = new Set([1, 2, 3, 4, 6, 7]);
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
    const before = Number(read(() => current()?.completeTimes));
    if (!Number.isSafeInteger(before) || before < 0) continue;
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
      const reason = taskSkipReason(value);
      if (!reason) return true;
      if (reason !== '多次奖励需手动处理') return false;
      const originalConditions = value.TaskConditions || value.taskConditions;
      const conditions = rows(originalConditions, 64);
      // Native REQ_GET_YB_NUM=60 / REQ_GET_YB_ONE_NUM=61 describe
      // completed recharge progress, not a claim-time payment.
      const allowed = new Set([...passiveConditions, 60, 61]);
      if (!Array.isArray(originalConditions) || originalConditions.length > 64 || !conditions.length || !conditions.every(condition => allowed.has(Number(condition?.reqType ?? condition?._reqType)))) return false;
      // Only remove the multi-reward restriction. Native fields are getters;
      // inherited read-only facades preserve every other existing skip rule.
      const base = Object.create(value.baseVo);
      Object.defineProperties(base, { maxComplete: { value: 1 }, _maxComplete: { value: 1 } });
      const single = Object.create(value);
      Object.defineProperties(single, { baseVo: { value: base }, CanRewardCount: { value: 1 }, CanAward: { value: value.CanAward }, HasAward: { value: value.HasAward }, TaskCompeleMax: { value: value.TaskCompeleMax } });
      return !taskSkipReason(single);
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
      send: () => eligible() ? request(id, 0, nativeSingle(current()) ? 0 : 1) : false,
      confirmations: proxy ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => matches(event)?.result === 0 }] : [],
      rejections: proxy ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: event => { const result = matches(event)?.result; return Number.isInteger(result) && result > 0; } }] : [],
    });
  }
  return { actions, notes: [] };
}
