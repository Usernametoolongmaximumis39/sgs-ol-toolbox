import { read } from '../../shared/safe-read.js';
import { configuredDailyFreeGift, DAILY_FREE_GIFT_ID, DAILY_FREE_GIFT_LABEL, dailyFreeGiftPriceIsZero, readDailyFreeGiftCount } from './daily-free-gift.js';
import { purchaseSender } from './native-method.js';
// Free native welfare rights only. Static evidence: docs/rewards-welfare-evidence.md.
// No windows/managers are constructed and no paid draw count is used.
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const valid = adapter => !adapter.signal?.aborted && adapter.valid?.() !== false;
const flag = (owner, name) => read(() => typeof owner?.[name] === 'function' ? owner[name]() : owner?.[name]) === true;

export const managerSpecs = {
  Shop_json: { events: [], guard: value => typeof value.GetTargetSaleConfigs === 'function' && typeof value.GetTargetSaleGoods === 'function' },
  BlessManager: { events: ['ClientQifuRankRep', 'ClientUserDataCounterNtf', 21471], guard: value => 'CanFreeBless' in value && 'FreeBlessEndTime' in value },
  NewBlessManager: { events: ['decodeClientQiFuNewInfoResp', 'decodeClientQiFuNewData', 170138, 170144], guard: value => typeof value.CanFreeBless === 'function' && typeof value.sendQifuDrawReq === 'function' && typeof value.GetChangeInfoById === 'function' },
  GameGoodsManager: { events: ['ClientUserDataCounterNtf', 'DbsCcMovegoodsRep'], guard: value => typeof value.SendClientQifuReq === 'function' },
  GameShopManager: { events: ['CcGoodsPriceRep', 'DbsCBuyShopogoodsRep', 'decodeCcGoodsHaveBuyCountRepV2', 20803, 100149], guard: value => typeof value.GetBuyMsg === 'function' && typeof value.CheckGoodsLimit === 'function' },
};

function rows(value, limit = 2048) {
  if (Array.isArray(value)) return value.slice(0, limit);
  return [];
}
const itemId = item => Number(read(() => item.goodsinfo.ID));
const inSellTime = item => read(() => item.IsInSellTime()) === true;

// PAGE_ITEM=4 is the native item page. Target sale views explicitly subscribe
// GOODS_HAVE_BUY_COUNT and own originList/dataList. Read those exact callers,
// rather than walking display objects or manufacturing Shop_json instances.
export function freeShopEntries(adapter) {
  const shop = adapter.manager('GameShopManager');
  if (!shop || shop.destroyed === true) return [];
  const entries = rows(read(() => shop.GetShopDataByType?.(4))).filter(item => itemId(item) !== DAILY_FREE_GIFT_ID);
  // Target-sale goods live outside PAGE_ITEM. Read the existing native config
  // singleton, so free gifts remain discoverable before their sale page opens.
  const sales = read(() => adapter.manager('Shop_json'));
  if (sales?.destroyed !== true) entries.push(...rows(read(() => sales?.GetTargetSaleConfigs?.())));
  const handlers = read(() => shop._events?.GOODS_HAVE_BUY_COUNT);
  for (const handler of (Array.isArray(handlers) ? handlers : [handlers]).slice(0, 32)) {
    const caller = read(() => handler?.caller);
    const targetPage = positive(caller?.pageType) && positive(caller?.chapter);
    const activityPage = positive(caller?.barId) && positive(caller?.taskVO?.id) && Number(caller?.taskVO?.activitytype) === 8 && read(() => caller.taskVO.IsInTime) === true;
    if (!caller || caller.destroyed === true || (!targetPage && !activityPage) ||
      !Array.isArray(caller.originList) || !Array.isArray(caller.dataList) ||
      (typeof caller.updateItems !== 'function' && typeof caller.updateList !== 'function')) continue;
    entries.push(...rows(caller.originList));
  }
  const dailyEntries = entries.filter(item => itemId(item) === DAILY_FREE_GIFT_ID);
  const dailyGift = dailyEntries.find(inSellTime) || dailyEntries[0] || configuredDailyFreeGift(adapter)[0];
  if (!dailyEntries.length && dailyGift) entries.push(dailyGift);
  const seen = new Set();
  return entries.filter(item => {
    const id = itemId(item);
    if (!positive(id) || seen.has(id) || (id === DAILY_FREE_GIFT_ID && item !== dailyGift)) return false;
    seen.add(id); return true;
  });
}

function zeroCost(item) {
  const goods = read(() => item.goodsinfo);
  if (!goods || !positive(goods.ID) || goods.yuanbao === undefined || goods.tongqian === undefined || Number(goods.yuanbao) !== 0 || Number(goods.tongqian) !== 0) return false;
  if (Number(goods.pricetype) > 2 && Number(goods.pricetype) !== 140) return false; // Ni.Free=140; other currencies stay excluded
  return !['lotteryPrice', 'glory', 'gouyu', 'mentor', 'Bless', 'exchangeCount', 'ConsumeItemCount'].some(key => Number(goods[key]) > 0);
}

function dailyGiftOnSale(shop, item) {
  return itemId(item) === DAILY_FREE_GIFT_ID && !item.jumpId && zeroCost(item) &&
    Number(item.goodsinfo.TypeID) === 43 && Number(item.goodsinfo.pricetype) === 140 &&
    Number(item.goodsinfo.LimitNums) === 1 && inSellTime(item) && read(() => item.CanBuy) === true && dailyFreeGiftPriceIsZero(shop);
}

function ready(shop, item) {
  const goods = read(() => item.goodsinfo);
  return shop?.destroyed !== true && shop?.IsDataReady === true && zeroCost(item) &&
    typeof shop.IsTargetSaleCountReady === 'function' && read(() => shop.IsTargetSaleCountReady(goods)) === true &&
    typeof shop.CheckGoodsLimit === 'function' && read(() => shop.CheckGoodsLimit(goods)) === false &&
    inSellTime(item) && read(() => item.CanBuy) === true &&
    (typeof shop.IsTargetSaleGoodsRed !== 'function' || read(() => shop.IsTargetSaleGoodsRed(item)) === true) &&
    (Number(goods.ID) === DAILY_FREE_GIFT_ID ? dailyGiftOnSale(shop, item) :
      typeof shop.IsDailyFreeGoodsCanBuy !== 'function' || read(() => shop.IsDailyFreeGoodsCanBuy(goods.ID)) === true);
}

export function buildFreeShopMessage(shop, id, priceType = 2) {
  if (![2, 140].includes(priceType)) return null;
  const message = shop.GetBuyMsg(id, 1, 100, priceType, 0);
  const list = message?.GoodsList;
  if (message?.GoodsCount !== 1 || message.BuyType !== 1 || message.UsingType !== 0 || message.IsSelfBuy !== true ||
    !Array.isArray(list) || list.length !== 1) return null;
  const item = list[0];
  if (Number(item.ItemID) !== id || item.ItemNum !== 1 || item.Discount !== 100 || item.PriceYuanBao !== 0 || item.PriceTongQian !== 0) return null;
  if (message.CouponAGoodsID || message.CouponBGoodsID || message.CouponCGoodsID || message.GuildID || message.extraOperate || message.UsingAfterBuy ||
    item.PriceGlory || item.PriceGouYu || item.Bless || item.exchangeGoods || item.exchangeCount || item.ConsumeItemID || item.ConsumeItemCount || item.bsub ||
    (priceType === 140 ? item.pricetype !== 140 : item.pricetype)) return null;
  return message;
}

async function prepareOtherFreeShopCounts(adapter, shop, entries) {
  if (typeof shop.SendCcGoodsHaveBuyCountReqV2 !== 'function' || typeof shop.IsTargetSaleCountReady !== 'function' ||
      typeof shop.on !== 'function' || typeof shop.off !== 'function') return;
  const items = entries.filter(item => itemId(item) !== DAILY_FREE_GIFT_ID && zeroCost(item) && inSellTime(item) &&
    read(() => shop.IsTargetSaleCountReady(item.goodsinfo)) === false).slice(0, 100);
  const ids = items.map(itemId);
  if (!ids.length || !valid(adapter)) return;
  await new Promise(resolve => {
    const caller = {}; let timer, ended = false;
    const finish = () => { if (ended) return; ended = true; clearTimeout(timer); read(() => shop.off('GOODS_HAVE_BUY_COUNT', caller, check)); adapter.signal?.removeEventListener('abort', finish); resolve(); };
    const check = () => { if (!valid(adapter) || items.every(item => read(() => shop.IsTargetSaleCountReady(item.goodsinfo)) === true)) finish(); };
    shop.on('GOODS_HAVE_BUY_COUNT', caller, check); adapter.signal?.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, 1600);
    if (!valid(adapter)) return finish();
    try { shop.SendCcGoodsHaveBuyCountReqV2(ids); } catch { finish(); }
  });
}

export async function prepareFreeWelfare(adapter, selected = {}) {
  if (!selected.welfare || !valid(adapter)) return null;
  const shop = adapter.manager('GameShopManager');
  if (shop?.IsDataReady !== true) return null;
  // Ordinary activity sale rows are not GetTargetSaleConfigs() entries and
  // their config singleton is closed over on current clients.
  await Promise.allSettled(['sys_h5_shop.sgs', 'sys_gs_dbs_fs_goodsbaseinfo.sgs'].map(name => adapter.loadConfig?.(name)));
  if (!valid(adapter) || adapter.manager('GameShopManager') !== shop || shop.IsDataReady !== true) return null;
  const entries = freeShopEntries(adapter);
  const attempt = selected.dailyFreeGiftAttempt;
  const checkGift = attempt?.status !== 'confirmed' && (attempt || entries.some(item => dailyGiftOnSale(shop, item)));
  const [giftCount] = await Promise.all([
    checkGift ? readDailyFreeGiftCount(adapter, shop) : null,
    prepareOtherFreeShopCounts(adapter, shop, entries),
  ]);
  return giftCount;
}

export function planFreeWelfare(adapter, selected = {}) {
  const actions = [], notes = [];
  if (!selected.welfare) return { actions, notes };
  const bless = adapter.manager('BlessManager'), goodsManager = adapter.manager('GameGoodsManager');
  const freeTime = Number(read(() => bless.FreeBlessEndTime));
  const freeBless = () => valid(adapter) && adapter.manager('BlessManager') === bless && adapter.manager('GameGoodsManager') === goodsManager &&
    bless?.destroyed !== true && goodsManager?.destroyed !== true && freeTime >= 0 && Number.isFinite(freeTime) &&
    Number(read(() => bless.FreeBlessEndTime)) === freeTime && flag(bless, 'FreeBlessItemEnough') && flag(bless, 'IsInBlessTime') && flag(bless, 'CanFreeBless') && typeof goodsManager?.SendClientQifuReq === 'function';
  if (freeBless()) actions.push({
    key: `welfare:free-bless:${freeTime}`, category: 'welfare', label: '免费祈福单抽', manager: bless,
    workflowGroup: 'free-bless', exclusionMode: 'free-draw',
    eligible: freeBless,
    done: () => Number(read(() => bless.FreeBlessEndTime)) > freeTime && !flag(bless, 'CanFreeBless'),
    send: () => freeBless() ? goodsManager.SendClientQifuReq(0) : false,
  });
  // New per-round prayer has a different wire contract: the native single
  // button sends count=1, while CanFreeBless(roundId) grants its free use.
  const newBless = adapter.manager('NewBlessManager');
  const ids = rows(read(() => newBless.InfoIds), 128).map(Number).filter(positive);
  for (const id of [...new Set(ids)]) {
    const current = () => read(() => newBless.GetChangeInfoById(id));
    const before = Number(current()?.lastFreeTime ?? 0);
    const eligible = () => valid(adapter) && adapter.manager('NewBlessManager') === newBless && newBless?.destroyed !== true &&
      Number.isFinite(before) && before >= 0 && !!current() && Number(current()?.lastFreeTime ?? 0) === before &&
      flag(newBless, 'FreeBlessItemEnough') && read(() => newBless.IsInDrawTime(id)) === true &&
      read(() => newBless.CanFreeBless(id)) === true && typeof newBless.sendQifuDrawReq === 'function';
    if (!eligible()) continue;
    actions.push({
      key: `welfare:free-bless-round:${id}:${before}`, category: 'welfare', label: `免费祈福单抽 ${id}`, manager: newBless,
      workflowGroup: `free-bless:${id}`, exclusionMode: 'free-draw', eligible,
      done: () => Number(current()?.lastFreeTime ?? 0) > before && read(() => newBless.CanFreeBless(id)) === false,
      send: () => eligible() ? newBless.sendQifuDrawReq(id, 1) : false,
    });
  }
  const shop = adapter.manager('GameShopManager');
  const transport = shop?.proxy;
  if (typeof shop?.GetBuyMsg !== 'function' || !purchaseSender(transport)) return { actions, notes };
  for (const item of freeShopEntries(adapter)) {
    if (!ready(shop, item)) continue;
    const goods = item.goodsinfo, id = itemId(item), before = Number(read(() => shop.GetLimitGoodsBuyCount(id)));
    if (!Number.isSafeInteger(before) || before < 0) continue;
    const dailyGift = id === DAILY_FREE_GIFT_ID;
    const giftCount = selected.dailyFreeGiftCount;
    if (dailyGift && (before !== 0 || giftCount?.count !== 0 || !giftCount.current())) continue;
    const current = () => freeShopEntries(adapter).find(entry => itemId(entry) === id);
    const sameShop = () => valid(adapter) && adapter.manager('GameShopManager') === shop && shop.proxy === transport &&
      (!dailyGift || giftCount.current());
    const eligible = () => sameShop() && (!dailyGift || transport.cacheStarted !== true) &&
      ready(shop, current()) && Number(shop.GetLimitGoodsBuyCount(id)) === before;
    const response = event => event?.Protocol;
    const proxy = adapter.proxy?.() || transport;
    if (dailyGift && !eligible()) continue;
    actions.push({
      key: `welfare:free-shop:${id}:${before}`, category: 'welfare', label: dailyGift ? DAILY_FREE_GIFT_LABEL : `免费礼盒 ${goods.name || id}`, manager: shop,
      workflowGroup: `free-shop:${id}`, rewards: [{ ItemID: id, ItemName: String(goods.name || '免费礼盒') }, ...rows(goods.ReturnGoodsArr)],
      eligible, done: () => sameShop() && Number(read(() => shop.GetLimitGoodsBuyCount(id))) > before,
      flowVersion: dailyGift ? 3 : 2,
      ...(dailyGift ? {
        skipUnsent: true,
        unconfirmedText: '未收到领取回执，工具箱会核对今日游戏限购记录。',
        refreshClaimState: () => { if (sameShop()) shop.SendCcGoodsHaveBuyCountReqV2([id]); },
      } : {}),
      send: () => {
        if (!eligible()) return false;
        const send = purchaseSender(transport);
        if (!send) return false;
        const message = read(() => buildFreeShopMessage(shop, id, Number(current()?.goodsinfo?.pricetype) === 140 ? 140 : 2));
        if (!message || !eligible()) return false;
        const result = send(message);
        return dailyGift && result === false ? undefined : result;
      },
      confirmations: [
        { manager: shop, event: 'SHOP_BUY_ITEM', accept: value => sameShop() && Number(Array.isArray(value) ? value[0] : value) === id },
        { manager: proxy, event: 'DbsCBuyShopogoodsRep', accept: event => sameShop() && Number(response(event)?.GoodsBaseID) === id && response(event)?.Result === 1 },
      ],
      rejections: [{ manager: proxy, event: 'DbsCBuyShopogoodsRep',
        accept: event => sameShop() && Number(response(event)?.GoodsBaseID) === id && Number.isInteger(response(event)?.Result) && response(event).Result > 1,
        ...(dailyGift ? { text: event => `游戏回复领取失败（错误码 ${response(event).Result}），将核对今日限购记录。` } : {}),
      }],
    });
  }
  return { actions, notes };
}
