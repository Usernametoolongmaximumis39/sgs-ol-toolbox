import { read } from '../../shared/safe-read.js';
// Audited official daily gift: item 11578201, currently sale row 545.
// Config fallback is deliberately limited to this unconditional, once/day gift.
// Native price and server limit checks remain mandatory; no window is created.
export const DAILY_FREE_GIFT_ID = 11578201;
export const DAILY_FREE_GIFT_KEY = `welfare:free-shop:${DAILY_FREE_GIFT_ID}:0`;
export const DAILY_FREE_GIFT_LABEL = '特惠礼包免费礼盒';
const saleFields = new Set(['id', 'item_id', 'time1', 'time2', 'sorting']);

export function dailyFreeGiftPriceIsZero(shop) {
  return [1, 2].every(type => {
    const price = read(() => shop.GetItemPrice(DAILY_FREE_GIFT_ID, type));
    return Array.isArray(price) && price.length === 2 && price[0] === type && price[1] === 0;
  });
}

function dailyCount(reply) {
  const { baseid, count } = reply || {};
  if (!Array.isArray(baseid) || !Array.isArray(count) || baseid.length !== count.length) return null;
  const index = baseid.indexOf(DAILY_FREE_GIFT_ID);
  if (index < 0 || baseid.lastIndexOf(DAILY_FREE_GIFT_ID) !== index) return null;
  return count[index] === 0 || count[index] === 1 ? count[index] : null;
}

export async function readDailyFreeGiftCount(adapter, shop) {
  const proxy = shop.proxy;
  const current = () => !!proxy && !adapter.signal?.aborted && adapter.valid?.() !== false &&
    shop.destroyed !== true && adapter.manager('GameShopManager') === shop && shop.proxy === proxy;
  if (!current() || typeof shop.SendCcGoodsHaveBuyCountReqV2 !== 'function' ||
      typeof shop.on !== 'function' || typeof shop.off !== 'function') return null;
  // The native getter defaults to zero even when the server never sent this ID.
  // GOODS_HAVE_BUY_COUNT carries the actual response, after the manager updates.
  return new Promise(resolve => {
    const caller = {};
    const finish = count => {
      clearTimeout(timer);
      adapter.signal?.removeEventListener('abort', cancel);
      read(() => shop.off('GOODS_HAVE_BUY_COUNT', caller, onCount));
      resolve(count === null ? null : { count, current });
    };
    const cancel = () => finish(null);
    const onCount = reply => {
      if (!current()) return cancel();
      const count = dailyCount(reply);
      if (count !== null) finish(count);
    };
    const timer = setTimeout(cancel, 8000);
    try {
      shop.on('GOODS_HAVE_BUY_COUNT', caller, onCount);
      adapter.signal?.addEventListener('abort', cancel, { once: true });
      if (current()) shop.SendCcGoodsHaveBuyCountReqV2([DAILY_FREE_GIFT_ID]);
      else cancel();
    } catch { cancel(); }
  });
}

function timestamp(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!m) return NaN;
  const n = m.slice(1).map(Number), d = new Date(n[0], n[1] - 1, n[2], n[3], n[4], n[5]);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].every((v, i) => v === n[i]) ? d.getTime() : NaN;
}
export function configuredDailyFreeGift(adapter) {
  const goods = read(() => adapter.goods?.(DAILY_FREE_GIFT_ID));
  if (!goods || goods.name !== '免费礼盒' || Number(goods.pricetype) !== 140 || goods.maxBuyCount !== '1;1' ||
      Number(goods.TypeID) !== 43 || goods.maxBuyNum !== undefined || goods.SellTime || goods.selltime ||
      !['yuanbao', 'tongqian', 'lotteryPrice', 'glory', 'gouyu', 'mentor', 'Bless', 'exchangeCount', 'ConsumeItemCount'].every(k => goods[k] === undefined || Number(goods[k]) === 0)) return [];
  const now = () => read(() => adapter.manager('TimerManager').ServerDate.getTime());
  const expiry = goods.expirytime ? timestamp(goods.expirytime) : Infinity;
  const sales = read(() => adapter.config?.('sys_h5_shop.sgs')?.root?.discount_shop);
  if (!Array.isArray(sales)) return [];
  return sales.slice(0, 4096).filter(sale => Number(sale?.item_id) === DAILY_FREE_GIFT_ID &&
    Number.isSafeInteger(Number(sale.id)) && Number(sale.id) > 0 && Object.keys(sale).every(k => saleFields.has(k)))
    .map(sale => {
      const begin = timestamp(sale.time1), end = timestamp(sale.time2);
      const available = () => {
        const time = now();
        return Number.isFinite(time) && time >= begin && time <= end && time <= expiry;
      };
      // These defaults are from the audited native goods getters. Missing raw
      // currency fields are accepted ONLY after both native prices equal zero.
      return { ID: Number(sale.id), item_id: DAILY_FREE_GIFT_ID,
        goodsinfo: { ...goods, ID: DAILY_FREE_GIFT_ID, yuanbao: 0, tongqian: 0, LimitNums: 1 },
        IsInSellTime: available, get CanBuy() { return available(); } };
    }).filter(item => item.IsInSellTime());
}
