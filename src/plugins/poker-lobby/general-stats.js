import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';

const POKER_GENERAL_MODEL = 47;
const REPLY_EVENT = 'decodeClientStatGeneralRankRep';
const QUERY_TIMEOUT = 6500;
export const GENERAL_PAGE_SIZE = 9;

const isPokerGeneral = id => Number.isSafeInteger(id) && id >= 8000 && id < 9000;
const count = value => Number.isSafeInteger(value) && value >= 0;
const active = new WeakSet();

function projectPage(data, page, rankDesc) {
  const total = read(() => data.general_cnt) ?? 0;
  const items = read(() => data.items) ?? [];
  if (!data || !count(total) || total > 1000 || Boolean(read(() => data.rankdesc)) !== rankDesc
    || !Array.isArray(items) || items.length > GENERAL_PAGE_SIZE || (total > 0 && !items.length)) return null;
  const rows = [], ids = new Set();
  for (const item of items) {
    const id = read(() => item.general_id);
    const games = read(() => item.game_count) ?? 0;
    const wins = read(() => item.win_count) ?? 0;
    if (!isPokerGeneral(id) || ids.has(id) || !count(games) || !count(wins) || wins > games) return null;
    ids.add(id);
    const rank = read(() => item.rank_id);
    rows.push({ rank: count(rank) && rank > 0 ? rank : (page - 1) * GENERAL_PAGE_SIZE + rows.length + 1, id, games, wins });
  }
  if (rows.length > Math.max(0, total - (page - 1) * GENERAL_PAGE_SIZE)) return null;
  return { page, total, rows };
}

export function readPokerGeneralPage(ctx, page, signal, { rankDesc = false, sortType = 0, figure = 0 } = {}) {
  if (signal.aborted) return Promise.resolve({});
  const account = ctx.native.account().id;
  const self = ctx.game.getSelf();
  const uuid = read(() => self.Uuid);
  const nickname = read(() => self.Nickname);
  const proxy = ctx.game.getServerProxy();
  const manager = ctx.native.manager('UserInfoManger', REPLY_EVENT, value => typeof value?.getGeneralRankReq === 'function');
  if (!account || !uuid || typeof nickname !== 'string' || !nickname || !manager
    || typeof proxy?.on !== 'function' || typeof proxy?.off !== 'function') {
    return Promise.resolve({ message: '武将累计战绩暂不可用。' });
  }
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * GENERAL_PAGE_SIZE >= 1000
    || typeof rankDesc !== 'boolean' || ![0, 1, 2].includes(sortType) || ![0, 1, 3].includes(figure)) {
    return Promise.resolve({ message: '武将战绩查询参数无效。' });
  }
  if (active.has(manager)) return Promise.resolve({ message: '仍在读取武将战绩，请稍后再试。' });
  active.add(manager);
  return new Promise(resolve => {
    const scope = new ResourceScope();
    const caller = {};
    const current = () => ctx.native.account().id === account && ctx.game.getServerProxy() === proxy
      && read(() => ctx.game.getSelf().Uuid) === uuid && read(() => ctx.game.getSelf().Nickname) === nickname;
    function finish(result) {
      if (scope.closed) return;
      scope.dispose();
      active.delete(manager);
      resolve(!signal.aborted && current() ? result : {});
    }
    function receive(packet) {
      if (!current()) return finish({});
      const result = projectPage(read(() => packet.Protocol.Data.ProtoObj), page, rankDesc);
      if (result) finish(result);
    }
    scope.listen(signal, 'abort', () => finish({}), { once: true });
    scope.timeout(() => finish({ message: '暂未收到三国斗地主武将累计战绩。' }), QUERY_TIMEOUT);
    try {
      const send = manager.getGeneralRankReq;
      // The reply has no request identity. Discard an overlapping request rather than attributing its rows to this page.
      scope.patch(manager, 'getGeneralRankReq', original => function (...args) {
        finish({ message: '游戏同时查询了武将战绩，请重试。' });
        return Reflect.apply(original, this, args);
      });
      proxy.on(REPLY_EVENT, caller, receive);
      scope.add(() => proxy.off(REPLY_EVENT, caller, receive));
      send.call(manager, rankDesc, sortType, (page - 1) * GENERAL_PAGE_SIZE + 1, GENERAL_PAGE_SIZE, nickname, POKER_GENERAL_MODEL, figure, 0);
    } catch {
      finish({ message: '读取三国斗地主武将累计战绩失败。' });
    }
  });
}
