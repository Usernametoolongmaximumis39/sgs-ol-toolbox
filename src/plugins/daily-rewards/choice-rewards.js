import { read } from '../../shared/safe-read.js';
// TaskRewardSelectWindow uses TaskSelectReward[].Id, not item ID or index.
const positive = n => Number.isSafeInteger(n) && n > 0;
const ownershipTypes = new Set([25, 36, 11, 12, 13, 14, 124, 172]);

export function planChoiceRewards(adapter, { rows, nativeMethod, taskSkipReason }) {
  const result = [], seen = new Set();
  const ordinary = read(() => adapter.manager('TaskManager'));
  for (const kind of ['ActivityQuestManager', 'TaskManager']) {
    const manager = read(() => adapter.manager(kind));
    if (!manager) continue;
    const modern = kind === 'ActivityQuestManager';
    const owner = ordinary || manager;
    const request = nativeMethod(owner, 'RequestTaskAward', ordinary ? ['TaskRewardSelectWindow'] : ['quest_id:', 'reward_idx:', 'CLIENT_QUEST_OP_REQ']);
    for (const task of rows(manager.allTasks)) {
      if (task?.IsNewQusetType === true && read(() => task.baseVo.HaveSelectReward) === false) continue;
      const id = Number(read(() => task.id ?? task._id)), before = Number(read(() => task.completeTimes ?? 0));
      if (!positive(id) || seen.has(id) || !Number.isSafeInteger(before) || before < 0) continue;
      const current = () => read(() => manager.GetServerTaskDataByTaskID(id));
      const options = () => {
        const list = read(() => current().baseVo.TaskSelectReward);
        if (!Array.isArray(list) || !list.length || list.length > 64) return [];
        const ids = new Set();
        const values = list.map(v => ({ id: Number(v.Id), item: Number(v.ItemID), count: Number(v.ItemNum) }));
        if (values.some(v => !positive(v.id) || !positive(v.item) || !positive(v.count) || ids.has(v.id) || !ids.add(v.id))) return [];
        return values;
      };
      if (read(() => task.CanAward) !== true || read(() => task.HasAward) === true || !options().length) continue;
      seen.add(id);
      const base = task.baseVo;
      const fingerprint = JSON.stringify([id, before, options()]);
      const key = modern ? `quest:${id}:${before}` : `task:${id}`;
      const safe = () => read(() => {
        const value = current();
        if (!request || adapter.manager(kind) !== manager || manager.destroyed ||
            (ordinary && adapter.manager('TaskManager') !== ordinary) || owner.destroyed || !value ||
            (modern && value.HasServerData !== true) || value.IsFromServer === false ||
            Number(value.completeTimes ?? 0) !== before || taskSkipReason(value, { allowSelection: true })) return false;
        const prev = Number(value.baseVo.prevTask);
        return (!prev || manager.GetServerTaskDataByTaskID(prev)?.HasAward === true || ordinary?.GetServerTaskDataByTaskID(prev)?.HasAward === true) &&
          JSON.stringify([id, before, options()]) === fingerprint;
      }) === true;
      const describe = v => {
        const goods = read(() => adapter.goods(v.item));
        const type = Number(goods?.TypeID ?? goods?.type);
        let reason = !goods || !Number.isInteger(type) ? '物品资料未就绪，请刷新列表' : '';
        // Raw config cannot establish native ownership. Do not bypass the
        // native general prohibition or skin/show duplicate confirmations.
        if (!reason && ownershipTypes.has(type)) reason = '需在游戏原生选奖窗口核对拥有状态';
        return { ...v, name: String(goods?.name ?? goods?.Name ?? `物品 ${v.item}`),
          description: String(goods?.description ?? goods?.desc ?? goods?.Desc ?? ''), reason };
      };
      const label = String(base.name || base._name || `任务 ${id}`);
      result.push({ key, fingerprint, label, description: String(base.desc || base._desc || ''),
        reason: !request ? '原生领奖入口尚未就绪' : taskSkipReason(task, { allowSelection: true }) || (!safe() ? '任务资格或前置条件尚未就绪' : ''),
        options: options().map(describe),
        action(optionId) {
          const selected = options().find(v => v.id === optionId);
          if (!selected || describe(selected).reason || !safe()) return null;
          const eligible = () => safe() && !describe(selected).reason;
          const proxy = adapter.proxy?.();
          const packet = e => modern ? e?.Protocol?.Data?.ProtoObj : e?.Protocol;
          const matches = e => modern ? Number(packet(e)?.quest_id) === id && packet(e)?.op_type === 1 : Number(packet(e)?.TaskID) === id;
          return { key, label: `${label} · ${describe(selected).name} ×${selected.count}`, category: 'tasks', manager,
            workflowGroup: modern ? `quest:${id}` : key, eligible,
            done: () => adapter.manager(kind) === manager && read(() => current()?.HasAward === true || Number(current()?.completeTimes) > before) === true,
            send: () => eligible() ? request(id, optionId, 0) : false,
            confirmations: modern && proxy ? [{ manager: proxy, event: 'decodeUserQuestOpRep', accept: e => matches(e) && packet(e)?.result === 0 }] : [],
            rejections: proxy ? [{ manager: proxy, event: modern ? 'decodeUserQuestOpRep' : 'SmsgTaskFailed',
              accept: e => matches(e) && Number.isInteger(modern ? packet(e)?.result : packet(e)?.ErrorCode) && (modern ? packet(e).result > 0 : true),
              text: e => `领取失败（游戏错误码 ${modern ? packet(e).result : packet(e).ErrorCode}），请在游戏内核对` }] : [],
          };
        },
      });
    }
  }
  return result;
}
