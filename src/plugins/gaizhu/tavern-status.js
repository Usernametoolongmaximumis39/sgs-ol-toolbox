import { account, manager, read } from '../../shared/info-runtime.js';

const SLOTS = ['NewDayQuestId1', 'NewDayQuestId2', 'NewWeekQuestId'];
const RETRY_MS = 10000;
const SETTLEMENT_WAIT_MS = 1200;
const SETTLEMENT_QUERY_INTERVAL_MS = 1500;
const positive = n => Number.isSafeInteger(n) && n > 0;
const protocol = event => event?.Protocol ?? event;
const payload = event => protocol(event)?.Data?.ProtoObj;

function calendarDay(ctx) {
  const clock = manager(ctx, 'TimerManager', 'ClientPingMsg', value => positive(value.LocalServerTime));
  const seconds = read(() => clock.LocalServerTime);
  // The client has already applied the server's time zone to LocalServerTime.
  return positive(Math.floor(seconds)) ? Math.floor(seconds / 86400) : null;
}

function taskManagers(ctx) {
  const hasTask = value => typeof value.GetServerTaskDataByTaskID === 'function';
  return {
    modern: manager(ctx, 'ActivityQuestManager', 'decodeUserQuestInfoRep',
      value => hasTask(value) && typeof value.UpTaskState === 'function')
      ?? manager(ctx, 'ActivityQuestManager', 107009, value => hasTask(value) && typeof value.UpTaskState === 'function'),
    legacy: manager(ctx, 'TaskManager', 'SmsgTaskFailed', hasTask)
      ?? manager(ctx, 'TaskManager', 22011, hasTask),
  };
}

function currentConfig(ctx) {
  const guard = value => typeof value.ReqJgqyInfo === 'function';
  const welfare = manager(ctx, 'WelfareManger', 'decodeClientTavernInfoRep', guard)
    ?? manager(ctx, 'WelfareManger', 180004, guard);
  const config = read(() => welfare.CurPubCommonVo);
  const ids = SLOTS.map(slot => Number(read(() => config[slot])));
  const round = Number(read(() => config.Round)) || null;
  return { welfare, round, ids: positive(round) && ids.every(positive) && new Set(ids).size === SLOTS.length ? ids : [] };
}

export function createTavernStatus(ctx, accountId, now) {
  const proxy = read(() => ctx.game.getServerProxy());
  let disposed = false;
  const active = () => !disposed && !ctx.scope.signal.aborted && account(ctx).id === accountId && read(() => ctx.game.getServerProxy()) === proxy;
  const statuses = new Map();
  let day = null, round = null, ids = [], confirmedRound = null, queryRound = false;
  let configAt = -Infinity, progressAt = -Infinity, recheckAt = -Infinity, waitingUntil = 0;
  let requested = new Set(), settlement = false, refreshProgress = false;
  const removals = [];
  const listen = (events, fn) => {
    for (const event of events) {
      const onEvent = packet => {
        if (!active() || day === null || calendarDay(ctx) !== day || protocol(packet)?.errCode) return;
        read(() => fn(packet));
      };
      if (typeof proxy?.on === 'function' && typeof proxy?.off === 'function') {
        proxy.on(event, statuses, onEvent);
        removals.push(ctx.scope.add(() => proxy.off(event, statuses, onEvent)));
      }
    }
  };
  const record = (id, claimed) => {
    if (!requested.has(id) || confirmedRound !== round || !ids.includes(id)) return false;
    // A successful claim is sticky within the same server date and round.
    // Individual task queries can be answered out of order with pre-claim data.
    statuses.set(id, statuses.get(id) === true || claimed);
    return true;
  };
  listen(['decodeClientTavernInfoRep', 180004], packet => {
    const value = Number(payload(packet)?.tavern_info?.round_id);
    if (queryRound && positive(value)) confirmedRound = value;
  });
  listen(['decodeUserQuestInfoRep', 107009], packet => {
    const entries = payload(packet)?.info;
    if (!Array.isArray(entries)) return;
    for (const row of entries) {
      // complete_cnt is increased by the native successful reward operation.
      // condition_data describes progress and cannot be used as a claim.
      const count = row?.complete_cnt ?? 0;
      if (Number.isSafeInteger(count) && count >= 0) {
        record(Number(row?.quest_id), row?.rewarded === true || row?.rewarded === 1 || count > 0);
      }
    }
  });
  listen(['decodeUserQuestOpRep', 107014], packet => {
    const row = payload(packet);
    if (row?.op_type !== 1 || row?.result !== 0) return;
    if (record(Number(row.quest_id), true)) refreshProgress = true;
  });
  listen(['SmsgClientTaskRewardResponse', 22010], packet => {
    const row = protocol(packet);
    if (!Number.isSafeInteger(row?.CompleteTimes) || row.CompleteTimes < 0) return;
    if (record(Number(row.TaskID), true)) refreshProgress = true;
  });
  listen(['SmsgClientGetRewardedTaskDataResponse', 22016], packet => {
    const entries = protocol(packet)?.TaskDataItems;
    if (!Array.isArray(entries)) return;
    for (const row of entries) {
      const count = Number(row?.completeTimes);
      if (Number.isSafeInteger(count) && count >= 0) record(Number(row.taskId), count > 0);
    }
  });
  listen(['SmsgUpdateTaskProgressToClient', 22011], packet => {
    const id = Number(protocol(packet)?.TaskID);
    if (!requested.has(id)) return;
    const { legacy } = taskManagers(ctx);
    const task = read(() => legacy.GetServerTaskDataByTaskID(id));
    if (task?.IsFromServer === true && typeof task.HasAward === 'boolean') record(id, task.HasAward);
  });

  function update(settled) {
    const time = now();
    if (!active()) return { waiting: true, claimed: null };
    const today = calendarDay(ctx);
    const config = currentConfig(ctx);
    if (day !== today || round !== config.round || ids.join() !== config.ids.join()) {
      const dateChanged = day !== today, roundChanged = round !== config.round;
      if (dateChanged || roundChanged && confirmedRound !== config.round) queryRound = false;
      if (dateChanged) confirmedRound = null;
      day = today;
      round = config.round;
      ids = config.ids;
      statuses.clear();
      requested.clear();
      progressAt = -Infinity;
    }
    if (day === null) return { waiting: true, claimed: null };
    if ((!ids.length || confirmedRound !== round) && time - configAt >= RETRY_MS && config.welfare) {
      queryRound = true;
      configAt = time;
      read(() => config.welfare.ReqJgqyInfo());
    }
    if (settled && !settlement) {
      refreshProgress = true;
      waitingUntil = Math.max(time, recheckAt + SETTLEMENT_QUERY_INTERVAL_MS) + SETTLEMENT_WAIT_MS;
    }
    settlement = settled;
    if (ids.length && confirmedRound === round) {
      const missing = ids.some(id => !statuses.has(id));
      if ((missing && time - progressAt >= RETRY_MS)
          || (refreshProgress && time - recheckAt >= SETTLEMENT_QUERY_INTERVAL_MS)) {
        refreshProgress = false;
        recheckAt = progressAt = time;
        const { legacy, modern } = taskManagers(ctx);
        const modernIds = ids.filter(id => modern && (read(() => modern.GetServerTaskDataByTaskID(id)) || !read(() => legacy.GetServerTaskDataByTaskID(id))));
        const legacyIds = ids.filter(id => !modernIds.includes(id));
        if (modernIds.length) {
          modernIds.forEach(id => requested.add(id));
          read(() => modern.UpTaskState(modernIds));
        }
        if (legacyIds.length && typeof legacy?.reqTaskProgressByIds === 'function') {
          legacyIds.forEach(id => requested.add(id));
          read(() => legacy.reqTaskProgressByIds(legacyIds));
        }
      }
      if (ids.every(id => statuses.has(id))) {
        const claimed = ids.filter(id => statuses.get(id)).length;
        return { waiting: claimed !== SLOTS.length && time < waitingUntil, claimed };
      }
    }
    return { waiting: true, claimed: null };
  }

  return {
    update,
    dispose() {
      disposed = true;
      for (const remove of removals.splice(0)) remove();
    },
  };
}
