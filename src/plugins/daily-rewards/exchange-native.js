import { LANDLORD_BEAN, exchangeEligible } from './exchange.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
export const managerSpecs = {
  ActivityGameDataManager: { events: ['ClientFightLordGoodsLimitInfoRep', 'ClientExchangeFightLordGoodsRep'],
    guard: value => typeof value.ReqDdzShopListGeneralPoolList === 'function' && typeof value.GetDdzHasBuyCountByItemID === 'function' },
  GameGoodsManager: { events: ['ClientUserDataCounterNtf', 'DbsCcMovegoodsRep'], guard: value => typeof value.GetGoodsNumByFourID === 'function' },
};
export function createExchangeAdapter(ctx, native) {
  let readyDay = '', requested = '', boundManager, releases = [], notify = () => {};
  let configLoading = false, configAttempt = 0;
  const manager = () => native.manager('ActivityGameDataManager');
  const currency = () => {
    const config = native.config('hd_fight_lord_config.sgs')?.Root?.par?.[0];
    return Number(config?.VicBean) === 1 ? Number(config.BeanChange) : 0;
  };
  function snapshot() {
    const m = manager(), goods = native.manager('GameGoodsManager'), date = read(() => native.manager('TimerManager').ServerDate);
    return { ready: readyDay === native.day() && !!m?.IsDdzShopListGeneralPoolListReady
        && !!date && !(date.getDay() === 1 && date.getHours() === 0 && date.getMinutes() < 10),
      currency: currency(), balance: read(() => goods.GetGoodsNumByFourID(Math.floor(LANDLORD_BEAN / 100))),
      rows: (Array.isArray(m?.DdzShopSortList) ? m.DdzShopSortList : []).slice(0, 1024).map(row => {
        const meta = native.goods?.(row.ItemID), owned = read(() => m.isGoodsOwned(row));
        const permanentBackground = Number(meta?.TypeID) === 172 && Number(meta?.period) === 315360000;
        const backgroundOwned = permanentBackground ? read(() => goods.HasForeverGoods(row.ItemID)) : false;
        return {
        id: row.ItemID, price: row.Price, limit: row.MaxBuyCount, period: row.MaxBuyType,
        bought: read(() => m.GetDdzHasBuyCountByItemID(row.ItemID)), name: meta?.name || meta?.Name || row.name || row.Name || `商品 ${row.ItemID}`,
        owned: !meta || typeof owned !== 'boolean' || typeof backgroundOwned !== 'boolean' ? undefined : owned || backgroundOwned,
        unlocked: Number.isFinite(m.DdzZgsWinCtn) && m.DdzZgsWinCtn >= row.winCount,
      }; }) };
  }
  function bind(callback) {
    notify = callback;
    const m = manager(), proxy = ctx.game.getServerProxy?.(), account = native.account();
    if (boundManager?.m === m && boundManager?.proxy === proxy && boundManager?.account === account) return;
    releases.splice(0).forEach(fn => fn()); boundManager = { m, proxy, account }; readyDay = ''; requested = '';
    if (!proxy?.on || !proxy?.off) return;
    const caller = {};
    for (const event of ['ClientFightLordGoodsLimitInfoRep', 'ClientExchangeFightLordGoodsRep']) {
      const handler = message => {
        if (ctx.scope.signal.aborted || native.account() !== account) return;
        const p = message?.Protocol || message;
        if (event === 'ClientFightLordGoodsLimitInfoRep' && p?.Type === 0) readyDay = native.day();
        // Native listeners update counts first; defer observation to the next task.
        ctx.scope.timeout(() => {
          if (native.account() === account) notify(event === 'ClientExchangeFightLordGoodsRep' ? { id: p?.ItemID, result: p?.Result } : null);
        }, 0);
      };
      proxy.on(event, caller, handler); releases.push(() => proxy.off(event, caller, handler));
    }
  }
  ctx.scope.add(() => releases.splice(0).forEach(fn => fn()));
  return { account: native.account, day: native.day, snapshot, bind,
    invalidate() { readyDay = ''; requested = ''; },
    refresh() {
      if ((!native.config('hd_fight_lord_config.sgs') || !native.config('sys_gs_dbs_fs_goodsbaseinfo.sgs')) && !configLoading && Date.now() - configAttempt > 15000) {
        configLoading = true; configAttempt = Date.now();
        Promise.allSettled(['hd_fight_lord_config', 'sys_gs_dbs_fs_goodsbaseinfo'].map(name => Promise.resolve().then(() => ctx.game.loadConfigData?.(name)))).finally(() => { configLoading = false; });
      }
      const token = `${native.account()}:${native.day()}`;
      if (requested === token || !native.account() || !native.day() || !manager()) return;
      requested = token; manager().ReqDdzShopListGeneralPoolList();
    },
    buy(attempt) {
      const current = snapshot(), row = current.rows.find(item => item.id === attempt.id);
      if (!current.ready || current.currency !== LANDLORD_BEAN || !exchangeEligible(row)
        || row.price !== attempt.price || row.bought !== attempt.bought || row.limit !== attempt.limit
        || current.balance !== attempt.balance || native.day() !== attempt.day
        || attempt.count !== Math.min(row.limit - row.bought, Math.floor(current.balance / row.price))) throw new Error('兑换条件已变化');
      manager().DdzExchange(attempt.id, attempt.price, attempt.count);
    },
  };
}

// Existing shop instances only: neither instantiate nor open a game window.
export function findExchangeViews(stage) {
  const queue = stage ? [stage] : [], found = [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    if ('ddzShopList' in node && Array.isArray(node.itemList) && typeof node.updateList === 'function'
      && node.itemList.some(item => item?.limitInfo && item?.goodsinfo)) found.push(node);
    if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return found;
}
