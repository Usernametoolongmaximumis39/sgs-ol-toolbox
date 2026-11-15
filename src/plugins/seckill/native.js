import { rowKey } from './model.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
const live = value => value && read(() => value.destroyed) !== true;
const EVENTS = ['decodeClientNewSeckillInfoRep', 'decodeClientNewSeckillStockRep'];
// Match the unique native purchase method when its exported name is obfuscated.
// Checked against z0t.tt in the cached official client; never instantiate managers.
export function purchaseMethod(object) {
  if (typeof read(() => object.ReqBuySeckillGoods) === 'function') return (goods, actId) => object.ReqBuySeckillGoods(goods, actId);
  const found = new Set();
  for (const owner of [object, read(() => Object.getPrototypeOf(object))]) {
    if (!owner) continue;
    for (const key of Object.getOwnPropertyNames(owner).slice(0, 512)) {
      const fn = Object.getOwnPropertyDescriptor(owner, key)?.value;
      if (key === 'constructor' || typeof fn !== 'function') continue;
      const text = Function.prototype.toString.call(fn);
      if (text.length < 24000 && ['newSecKill_baseID', 'newSecKill_ItemID', 'GoodsCount'].every(s => text.includes(s))) found.add(fn);
    }
  }
  return found.size === 1 ? (goods, actId) => Reflect.apply([...found][0], object, [goods, actId]) : null;
}
export function createNativeAdapter(ctx) {
  let previousAccount, awaitingInfo = false;
  function manager(name, events, guard) {
    const type = read(() => ctx.game.getClass(name));
    for (const candidate of [type, ...['instance', '_instance', 's_instance', 'Instance'].map(key => {
      const d = type && Object.getOwnPropertyDescriptor(type, key); return d && 'value' in d ? d.value : null;
    })]) if (live(candidate) && read(() => guard(candidate))) return candidate;
    const proxy = read(() => ctx.game.getServerProxy());
    for (const event of events) {
      const handlers = read(() => proxy._events[event]);
      for (const h of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
        const candidate = read(() => h.caller);
        if (live(candidate) && read(() => guard(candidate))) return candidate;
      }
    }
    return null;
  }
  const seckill = () => manager('NewSecKillManager', EVENTS, value => typeof value.SendNewSecKillInfoReq === 'function');
  function account() {
    const login = manager('LoginManager', ['error'], value => 'IsOnLine' in value || 'IsAccountLoggingOut' in value);
    const id = read(() => ctx.game.getSelf().ClientId);
    const key = read(() => login.IsAccountLoggingOut) || read(() => login.IsOnLine) === false ? ''
      : (typeof id === 'string' || typeof id === 'number') && String(id) && String(id) !== '0' ? String(id).slice(0, 128) : '';
    if (previousAccount !== undefined && previousAccount !== key) awaitingInfo = true;
    previousAccount = key;
    return key;
  }
  let configRoot, names = new Map();
  function goodsName(id) {
    const root = read(() => ctx.game.getConfigData('sys_gs_dbs_fs_goodsbaseinfo').root);
    if (root !== configRoot) {
      configRoot = root; names = new Map();
      const fields = new Map((Array.isArray(root?.abbreviation?.field) ? root.abbreviation.field : []).map(f => [f.Short, f.Long]));
      for (const row of (Array.isArray(root?.goodslist?.goods) ? root.goodslist.goods.slice(0, 200000) : [])) {
        const value = Object.fromEntries(Object.entries(row).map(([k, v]) => [fields.get(k) || k, v]));
        if (typeof value.Name === 'string' || typeof value.name === 'string') names.set(Number(value.ID), value.Name || value.name);
      }
    }
    return names.get(id) || '';
  }
  function now() {
    const timer = manager('TimerManager', ['ClientPingMsg'], value => Number.isFinite(value.LocalStaticServerTime) || value.ServerDate instanceof Date);
    const seconds = read(() => timer.LocalStaticServerTime), date = read(() => timer.ServerDate);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
  }
  function rows() {
    account(); if (awaitingInfo) return null;
    const activities = read(() => seckill().CurrentSecKills);
    if (!Array.isArray(activities)) return null;
    return activities.slice(0, 512).flatMap(activity => {
      const goods = read(() => activity.GoodsDataDic.datum);
      if (!Array.isArray(goods)) return [];
      return goods.slice(0, 128).map(g => {
        const row = { actId: read(() => activity.ActID), itemId: read(() => g.itemId), baseId: read(() => g.baseId),
          startMs: read(() => activity.BuyTime) * 1000, endMs: read(() => activity.BuyEndTime) * 1000,
          name: goodsName(read(() => g.baseId)), count: read(() => g.count), price: read(() => g.price), currency: read(() => g.price_type),
          stock: read(() => g.StockNow), stockTotal: read(() => g.StockTotal), bought: read(() => g.LimitSelfCount), limit: read(() => g.limitSumCount) };
        row.valid = [row.actId, row.itemId, row.baseId, row.count].every(n => Number.isInteger(n) && n > 0)
          && [row.startMs, row.endMs, row.price, row.stock, row.bought, row.limit].every(n => Number.isFinite(n) && n >= 0)
          && row.endMs > row.startMs && row.price >= 0 && [1, 2, 3].includes(row.currency) && Boolean(row.name);
        row.key = rowKey(row); return row;
      });
    });
  }
  return { account, now, rows,
    ready: () => Boolean(seckill()),
    async prepare() { await ctx.game.loadConfigData('sys_gs_dbs_fs_goodsbaseinfo'); },
    refresh() { const m = seckill(); if (!m) return false; m.SendNewSecKillInfoReq(); return true; },
    stock(row) { const m = seckill(); if (typeof m?.SendNewSecKillStockReq === 'function') m.SendNewSecKillStockReq(row.actId); },
    buy(row) {
      if (!account() || awaitingInfo) throw new Error('账号数据尚未同步，等待秒杀列表');
      const m = seckill(), activity = read(() => m.GetDataVoByActId(row.actId)) || read(() => m.CurrentSecKills.find(a => a.ActID === row.actId));
      const goods = read(() => activity.GoodsDataDic.getNumberKey(row.itemId)) || read(() => activity.GoodsDataDic.datum.find(g => g.itemId === row.itemId));
      const fn = purchaseMethod(m);
      if (!fn) throw new Error('未找到唯一可用的原生秒杀购买方法');
      if (!goods || goods.baseId !== row.baseId || activity.BuyTime * 1000 !== row.startMs) throw new Error('秒杀商品已变化，等待列表更新');
      if (goods.price !== row.price || goods.price_type !== row.currency || goods.count !== row.count
        || goods.StockNow <= 0 || goods.limitSumCount > 0 && goods.LimitSelfCount >= goods.limitSumCount
        || now() < row.startMs || now() >= activity.BuyEndTime * 1000) throw new Error('商品价格、库存或售卖时间已变化，等待列表更新');
      fn(goods, row.actId);
    },
    subscribe(fn) {
      let proxy, releases = [];
      const bind = () => {
        const next = read(() => ctx.game.getServerProxy()); if (next === proxy) return;
        releases.splice(0).forEach(f => f()); proxy = next;
        if (!proxy?.on || !proxy?.off) return;
        const caller = {};
        for (const event of [...EVENTS, 'DbsCBuyShopogoodsRep']) {
          const handler = message => {
            if (ctx.scope.signal.aborted) return;
            const eventAccount = account();
            if (event === 'decodeClientNewSeckillInfoRep') awaitingInfo = false;
            const p = read(() => message.Protocol) || message;
            // Copy only response identity/result, never the complete protocol/account.
            const reply = event === 'DbsCBuyShopogoodsRep' ? { baseId: read(() => p.GoodsBaseID), result: read(() => p.Result) } : null;
            ctx.scope.timeout(() => { if (account() === eventAccount) fn(reply); }, 0);
          };
          proxy.on(event, caller, handler); releases.push(() => proxy?.off(event, caller, handler));
        }
      };
      bind(); ctx.scope.interval(bind, 1000);
      return ctx.scope.add(() => { releases.splice(0).forEach(f => f()); proxy = null; });
    },
  };
}
