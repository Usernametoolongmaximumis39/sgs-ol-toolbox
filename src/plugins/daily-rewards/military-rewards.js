// Official ff_task_daily schema and the native per-tier claim methods.
// Read current server time/points/owned rights; never activate or buy a pass.
const read = fn => { try { return fn(); } catch { return undefined; } };
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const list = value => Array.isArray(value) ? value.slice(0, 4096) : [];
const has = (value, id) => Array.isArray(value) && value.some(item => Number(item) === id);
const rewardCache = new WeakMap();
function time(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!match) return NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime();
}
function root(adapter) { return read(() => adapter.config('ff_task_daily.sgs').root); }
function currentSeason(adapter, field) {
  const now = read(() => adapter.manager('TimerManager').ServerDate?.getTime());
  if (!Number.isFinite(now)) return null;
  return list(root(adapter)?.[field]).find(row => positive(row.id) && positive(row.reward) && time(row.stime) < now && now < time(row.etime));
}
export function confirmedJieyueAttempt(adapter, key) {
  const tier = /^activity:new-jd:tier:(\d+):(\d+):([01])$/.exec(key);
  if (!tier || Number(currentSeason(adapter, 'newbp')?.id) !== Number(tier[1])) return false;
  const activity = adapter.manager('ActivityManager');
  return has(tier[3] === '1' ? activity?.NewJDHaveRewardList_bp : activity?.NewJDHaveRewardList, Number(tier[2]));
}

// The native task page requests both lists. Each list is replaced (even when
// empty) only after its last information packet; both publish the same event.
export async function syncJieyueLists(activity, { signal, valid, timeout = 2500 }) {
  if (typeof activity?.SendGetNewJDInfoReq !== 'function') return { free: false, premium: false };
  const free = activity.NewJDHaveRewardList, premium = activity.NewJDHaveRewardList_bp;
  return new Promise(resolve => {
    const caller = {};
    const fresh = (current, previous) => Array.isArray(current) && current !== previous;
    const result = () => ({
      free: fresh(activity.NewJDHaveRewardList, free),
      premium: fresh(activity.NewJDHaveRewardList_bp, premium),
    });
    const finish = () => {
      clearTimeout(timer);
      activity.off?.('NEW_JD_INFO_SUC', caller, check);
      signal?.removeEventListener('abort', finish);
      resolve(result());
    };
    const check = () => {
      const state = result();
      if (!valid() || (state.free && (!activity.hadBuyNewJD || state.premium))) finish();
    };
    const timer = setTimeout(finish, timeout);
    signal?.addEventListener('abort', finish, { once: true });
    activity.on?.('NEW_JD_INFO_SUC', caller, check);
    if (signal?.aborted || !valid()) return finish();
    try { activity.SendGetNewJDInfoReq(); check(); } catch { finish(); }
  });
}
function rewards(adapter, field, group) {
  const config = root(adapter), source = config?.[field];
  if (!Array.isArray(source)) return [];
  let indexed = rewardCache.get(source);
  if (!indexed || indexed.abbreviation !== config.abbreviation) {
    const fields = new Map(list(config.abbreviation).map(row => [row.Short, row.Long])), groups = new Map();
    // The official old military table already exceeds 4,096 historical rows.
    for (const raw of source.slice(0, 100000)) {
      const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [fields.get(key) || key, value]));
      const id = Number(row.teamid), entries = groups.get(id) || [];
      entries.push(row); groups.set(id, entries);
    }
    indexed = { abbreviation: config.abbreviation, groups }; rewardCache.set(source, indexed);
  }
  return indexed.groups.get(group) || [];
}
function item(value) {
  if (typeof value !== 'string') return null;
  const pair = value.split(',').map(Number);
  return pair.length === 2 && positive(pair[0]) && positive(pair[1]) ? { ItemID: pair[0], ItemNum: pair[1] } : null;
}

export function planMilitaryRewards(adapter, activity) {
  const actions = [], notes = [], handled = new Set();
  for (const [kind, label, seasons, table, flag, lowList, highList, owned, send, scoreId] of [
    ['jd', '军典', 'dailytask', 'dailyreward', 'HasJDRewardRed', 'JDHaveRewardList', 'JDHaveRewardList_bp', 'hadBuyJD', 'SendGetJDRewardReq', 11981101],
    ['new-jd', '节钺令', 'newbp', 'newdailyreward', 'HasNewJDRewardRed', 'NewJDHaveRewardList', 'NewJDHaveRewardList_bp', 'hadBuyNewJD', 'SendGetNewJDRewardReq', 11987201],
    ['ddz-tll', '屯粮令', 'battletask', 'dailyreward', 'HasDDZTLLRewardRed', 'DDZBattleRewardList', 'DDZBattleAwardBpList', 'HadBuyDDZTLL', 'SendDDZTLLAwardReq', null],
  ]) {
    if (typeof activity?.[send] !== 'function') continue;
    // Older adapters without this table can retain the original native batch
    // path, where the common exclusion gate still rejects unknown contents.
    if (!Array.isArray(root(adapter)?.[seasons]) || !Array.isArray(root(adapter)?.[table])) continue;
    handled.add(kind);
    const season = currentSeason(adapter, seasons);
    if (!season) { notes.push({ category: 'activities', text: `${label}当期配置或服务器时间尚未就绪` }); continue; }
    const group = Number(season.reward), seasonId = Number(season.id);
    const sameSeason = () => { const value = currentSeason(adapter, seasons); return Number(value?.id) === seasonId && Number(value?.reward) === group; };
    const points = () => Number(read(() => kind === 'ddz-tll' ? activity.DDZBattlePoint : adapter.manager('GameGoodsManager').GetGoodsNumByBaseID(scoreId)));
    for (const row of rewards(adapter, table, group)) for (const high of [false, true]) {
      const id = Number(row.id), field = high ? highList : lowList, rewardField = high ? 'ffitem' : 'item';
      if (!positive(id) || !item(row[rewardField])) continue;
      const current = () => rewards(adapter, table, group).find(value => Number(value.id) === id);
      const eligible = () => {
        const value = current(), threshold = Number(value?.point), count = points();
        return sameSeason() && activity[flag] === true && !!item(value?.[rewardField]) && Array.isArray(activity[field]) &&
          Number.isFinite(count) && Number.isSafeInteger(threshold) && threshold >= 0 && count >= threshold &&
          (!high || activity[owned] === true) && !has(activity[field], id);
      };
      if (!read(eligible)) continue;
      actions.push({ key: `activity:${kind}:tier:${seasonId}:${id}:${Number(high)}`,
        category: 'activities', label: `${label}第 ${id} 档${high ? '豪华' : '免费'}奖励`, manager: activity,
        rewards: () => item(current()?.[rewardField]), eligible,
        done: () => sameSeason() && has(activity[field], id),
        ...(kind === 'new-jd' && typeof activity.SendGetNewJDInfoReq === 'function' ? {
          refreshClaimState: () => { if (sameSeason()) activity.SendGetNewJDInfoReq(); },
        } : {}),
        send: () => eligible() ? activity[send](id, high, false) : false,
      });
    }
  }
  return { actions, notes, handled };
}
