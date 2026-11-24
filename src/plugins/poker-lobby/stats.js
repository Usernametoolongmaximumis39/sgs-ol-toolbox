import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';

const POKER_MODE = 175;
const SECTION = 2;
const POKER_ACTIVITY = 32;
const POKER_RECORD_TAB = 17;
const STATS_TIMEOUT = 6500;
const POKER_DATA_EVENT = 'UPDATE_POKER_DDZ_BASE_DATA_EVENT';

const natural = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const percentage = value => typeof value === 'string' && /^\d+(?:\.\d+)?%$/.test(value) ? value : null;

function baseStats(data) {
  const rank = natural(read(() => data.weekly_max_rank));
  return [
    ['总对局', natural(read(() => data.game_times))],
    ['最高连胜', natural(read(() => data.max_streak_win))],
    ['枭雄次数', natural(read(() => data.streak_glory_cnt))],
    ['本周最高排名', rank === 0 ? '未上榜' : rank],
    ['赢得欢乐豆总数', natural(read(() => data.total_win_bean))],
  ];
}

function rateStats(data) {
  const games = natural(read(() => data.RecordItems.length) ?? read(() => data.TotalCount));
  const wins = natural(read(() => data.WinCount));
  return [
    ['近百场胜率', games > 0 && wins !== null && wins <= games ? `${(100 * wins / games).toFixed(1)}%` : games === 0 ? '暂无对局' : null],
    ['地主胜率', read(() => data.DiZhuCount) === 0 ? '暂无对局' : percentage(read(() => data.DiZhuWinRate))],
    ['农民胜率', read(() => data.NongMinCount) === 0 ? '暂无对局' : percentage(read(() => data.NongMinWinRate))],
  ];
}

export async function readPokerStats(ctx, signal) {
  if (signal.aborted) return {};
  const account = ctx.native.account().id;
  const uuid = Number(ctx.game.getSelf()?.Uuid);
  const proxy = ctx.game.getServerProxy();
  const activity = ctx.native.manager('ActivityManager', 'ClientActivitysetDataRep', candidate =>
    typeof candidate.SendActivitysetData === 'function' && typeof candidate.on === 'function' && typeof candidate.off === 'function');
  const records = ctx.native.manager('UserInfoManger', 'ClientGameRecordInfoRep', candidate =>
    typeof candidate.SendClientGameRecordInfoReqByTab === 'function' && typeof candidate.GetWinRateInfoByUuId === 'function');
  const tab = read(() => records.GetTabByModeIdAndSectionId(POKER_MODE, SECTION)) || POKER_RECORD_TAB;
  const canReadRates = records && Number.isSafeInteger(uuid) && uuid > 0 && Number.isSafeInteger(tab) && tab > 0
    && typeof proxy?.on === 'function' && typeof proxy?.off === 'function';
  if (!account || (!activity && !canReadRates)) return { message: '三国斗地主光辉战绩暂不可用。' };
  return new Promise(resolve => {
    const scope = new ResourceScope();
    const caller = {};
    const current = () => ctx.native.account().id === account && ctx.game.getServerProxy() === proxy;
    let base = null, rates = null;
    let waitingForBase = Boolean(activity), waitingForRates = Boolean(canReadRates);
    function finish() {
      if (scope.closed) return;
      scope.dispose();
      if (signal.aborted || !current()) return resolve({});
      const stats = [...(base || baseStats()), ...(rates || rateStats())];
      const message = base && rates ? '' : (base || rates ? '部分三国斗地主战绩暂未返回。' : '暂未收到三国斗地主战绩。');
      resolve({ stats: base || rates ? stats : [], message });
    }
    function checkDone() {
      if (!waitingForBase && !waitingForRates) finish();
    }
    function acceptBase(data) {
      if (!waitingForBase || !current()) return;
      if (!data || typeof data !== 'object') return;
      base = baseStats(data);
      waitingForBase = false;
      checkDone();
    }
    const receiveBase = () => acceptBase(read(() => activity.PokerDDZData));
    function receiveActivityReply(packet) {
      const data = read(() => packet.Protocol);
      if (data?.msgType === POKER_ACTIVITY) acceptBase(data.pokerDDZData);
    }
    function receiveRates(packet) {
      if (!waitingForRates || !current() || Number(ctx.game.getSelf()?.Uuid) !== uuid) return;
      const data = read(() => packet.Protocol);
      if (Number(data?.Uuid) !== uuid || data.Tab !== tab || data.RecordId !== 0) return;
      // The native record manager calculates the role counters before its cache becomes readable.
      const record = read(() => records.GetWinRateInfoByUuId(uuid, tab));
      if (!record) return;
      rates = rateStats(record);
      waitingForRates = false;
      checkDone();
    }
    const bind = (target, event, callback) => {
      target.on(event, caller, callback);
      scope.add(() => target.off(event, caller, callback));
    };
    scope.listen(signal, 'abort', finish, { once: true });
    scope.timeout(finish, STATS_TIMEOUT);
    if (waitingForBase) {
      try {
        bind(activity, POKER_DATA_EVENT, receiveBase);
        if (typeof proxy?.on === 'function' && typeof proxy?.off === 'function') {
          bind(proxy, 'ClientActivitysetDataRep', receiveActivityReply);
        }
        activity.SendActivitysetData(POKER_ACTIVITY);
      } catch { waitingForBase = false; }
    }
    if (waitingForRates) {
      try {
        const known = records.GetWinRateInfoByUuId(uuid, tab);
        if (known && read(() => records.CanGetRecordInfo(uuid, tab)) === false) {
          rates = rateStats(known);
          waitingForRates = false;
        } else {
          bind(proxy, 'ClientGameRecordInfoRep', receiveRates);
          records.SendClientGameRecordInfoReqByTab(uuid, tab, false, 100);
        }
      } catch { waitingForRates = false; }
    }
    checkDone();
  });
}
