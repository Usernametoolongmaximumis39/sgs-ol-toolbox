import test from 'node:test';
import assert from 'node:assert/strict';
import { planFreeWelfare, prepareFreeWelfare, freeShopEntries, buildFreeShopMessage } from '../src/plugins/daily-rewards/free-welfare.js';
import { awaitClaim } from '../src/plugins/daily-rewards/controller.js';
import { createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';

class Events {
  _events = {};
  on(event, caller, fn) { (this._events[event] ||= []).push({ caller, fn }); }
  off(event, caller, fn) { this._events[event] = (this._events[event] || []).filter(value => value.caller !== caller || value.fn !== fn); }
  event(event, value) { for (const listener of [...(this._events[event] || [])]) listener.fn.call(listener.caller, value); }
}
function fixture(sendName = 'L') {
  const sent = [], managers = {}, proxy = new Events();
  const bless = { FreeBlessEndTime: 0, FreeBlessItemEnough: true, IsInBlessTime: true, CanFreeBless: true };
  const goodsManager = { SendClientQifuReq(count) { sent.push(['bless', count]); bless.FreeBlessEndTime = 1760000000; bless.CanFreeBless = false; } };
  const goods = { ID: 13360001, name: '免费礼盒', yuanbao: 0, tongqian: 0, LimitNums: 1, maxBuyNum: 999, TypeID: 9 };
  const row = { goodsinfo: goods, item_id: goods.ID, CanBuy: true, IsInSellTime: () => true };
  const shop = Object.assign(new Events(), { IsDataReady: true, count: 0, countReady: true, daily: true, entries: [row], proxy,
    GetShopDataByType(type) { assert.equal(type, 4); return this.entries; },
    IsTargetSaleCountReady() { return this.countReady; }, CheckGoodsLimit() { return this.count >= goods.LimitNums; },
    IsDailyFreeGoodsCanBuy() { return this.daily; }, GetLimitGoodsBuyCount() { return this.count; },
    GetBuyMsg(id, count, discount, priceType, price) { sent.push(['build', id, count, discount, priceType, price]); return { GoodsCount: 1, BuyType: 1, UsingType: 0, IsSelfBuy: true, GoodsList: [{ ItemID: id, ItemNum: count, Discount: discount, PriceYuanBao: price, PriceTongQian: 0, pricetype: priceType === 140 ? 140 : 0 }] }; },
    SendCcGoodsHaveBuyCountReqV2(ids) { sent.push(['counts', ids]); this.countReady = true; this.event('GOODS_HAVE_BUY_COUNT'); },
  });
  proxy[sendName] = function (message) {
    if (this.useNewPB) message = message.OldProtocalToPb();
    if (this.cacheStarted) return this.addProtocolToCacheList(message, this.CACHE_TYPE_SEND);
    assert.equal(this, proxy);
    sent.push(['buy', message]); shop.count++; shop.event('SHOP_BUY_ITEM', message.GoodsList[0].ItemID);
  };
  Object.assign(managers, { BlessManager: bless, GameGoodsManager: goodsManager, GameShopManager: shop });
  const adapter = { manager: name => managers[name], proxy: () => proxy, day: () => '2026-11-14' };
  return { adapter, managers, sent, bless, goodsManager, goods, row, shop, proxy };
}
const plan = f => planFreeWelfare(f.adapter, { welfare: true });
const blessAction = f => plan(f).actions.find(item => item.workflowGroup === 'free-bless');
const shopAction = f => plan(f).actions.find(item => item.workflowGroup.startsWith('free-shop:'));

test('free welfare disabled has no native reads or requests', async () => {
  const adapter = { manager() { throw new Error('unexpected'); } };
  assert.deepEqual(planFreeWelfare(adapter, {}), { actions: [], notes: [] });
  await prepareFreeWelfare(adapter, {});
});

test('free prayer is exactly native Count=0 and confirms consumed free entitlement', async () => {
  const f = fixture(), action = blessAction(f);
  assert.equal(action.exclusionMode, 'free-draw'); assert.equal(action.key, 'welfare:free-bless:0');
  assert.equal(action.done(), false);
  const result = await awaitClaim(action, { valid: () => true, timeout: 20, poll: 1 });
  assert.equal(result.status, 'confirmed'); assert.deepEqual(f.sent, [['bless', 0]]);
  assert.equal(blessAction(f), undefined);
});

test('no first recharge, paid-only, ended event and missing server free timestamp silently skip prayer', () => {
  for (const patch of [{ FreeBlessItemEnough: false }, { CanFreeBless: false }, { IsInBlessTime: false }, { FreeBlessEndTime: -1 }, { FreeBlessEndTime: undefined }]) {
    const f = fixture(); Object.assign(f.bless, patch); assert.equal(blessAction(f), undefined); assert.deepEqual(f.sent, []);
  }
});

test('free prayer eligibility is checked again before sending and unrelated state is not confirmation', async () => {
  const f = fixture(), action = blessAction(f);
  f.bless.FreeBlessItemEnough = false; assert.equal(action.eligible(), false); assert.equal(action.send(), false); assert.deepEqual(f.sent, []);
  f.bless.FreeBlessItemEnough = true;
  f.goodsManager.SendClientQifuReq = () => { f.bless.FreeBlessEndTime++; };
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 8, poll: 1 })).status, 'unconfirmed');
});

test('free shop uses native runtime goods and explicit all-zero request, with exact success association', async () => {
  const f = fixture(), action = shopAction(f);
  assert.equal(action.key, 'welfare:free-shop:13360001:0'); assert.equal(action.rewards[0].ItemID, 13360001);
  assert.equal(action.confirmations[0].accept(999), false);
  assert.equal(action.confirmations[1].accept({ Protocol: { Result: 1, GoodsBaseID: 999 } }), false);
  assert.equal(action.confirmations[1].accept({ Protocol: { Result: 2, GoodsBaseID: 13360001 } }), false);
  assert.equal(action.confirmations[1].accept({ Protocol: { Result: 1, GoodsBaseID: 13360001 } }), true);
  const result = await awaitClaim(action, { valid: () => true, timeout: 20, poll: 1 });
  assert.equal(result.status, 'confirmed'); assert.deepEqual(f.sent[0], ['build', 13360001, 1, 100, 2, 0]);
  assert.equal(f.sent[1][0], 'buy'); assert.equal(shopAction(f), undefined);
});

test('nonzero or alternative cost, unready counts, sold out, expired, locked and already claimed shop items skip', () => {
  for (const mutate of [f => { f.goods.yuanbao = 1; }, f => { f.goods.tongqian = 1; }, f => { delete f.goods.yuanbao; }, f => { f.goods.lotteryPrice = 1; }, f => { f.shop.countReady = false; }, f => { f.shop.count = 1; }, f => { f.row.IsInSellTime = () => false; }, f => { f.row.CanBuy = false; }, f => { f.shop.daily = false; }, f => { f.shop.IsDataReady = false; }]) {
    const f = fixture(); mutate(f); assert.equal(shopAction(f), undefined); assert.deepEqual(f.sent, []);
  }
});

test('shop verifies live eligibility and rejects a changed native request without sending', () => {
  const f = fixture(), action = shopAction(f); f.goods.yuanbao = 1;
  assert.equal(action.send(), false); assert.deepEqual(f.sent, []);
  f.goods.yuanbao = 0; const builder = f.shop.GetBuyMsg;
  for (const mutate of [m => { m.CouponAGoodsID = 1; }, m => { m.UsingType = 2; }, m => { m.GoodsList[0].Bless = 1; }, m => { m.GoodsList[0].PriceYuanBao = 1; }, m => { m.GoodsList[0].exchangeCount = 1; }]) {
    f.shop.GetBuyMsg = (...args) => { const message = builder.apply(f.shop, args); mutate(message); return message; };
    assert.equal(buildFreeShopMessage(f.shop, 13360001), null);
  }
  assert.equal(f.sent.some(item => item[0] === 'buy'), false);
});

test('already opened target sale exact event callers expose originList without walking UI trees', () => {
  const f = fixture(); f.shop.entries = [];
  f.shop._events.GOODS_HAVE_BUY_COUNT = [{ caller: { pageType: 2, chapter: 9, originList: [f.row], dataList: [f.row], updateItems() {} } }];
  assert.equal(freeShopEntries(f.adapter).length, 1); assert.ok(shopAction(f));
  f.shop._events.GOODS_HAVE_BUY_COUNT[0].caller.destroyed = true; assert.equal(freeShopEntries(f.adapter).length, 0);
  f.shop._events.GOODS_HAVE_BUY_COUNT = [{ caller: { originList: [f.row], dataList: [f.row] } }]; assert.equal(freeShopEntries(f.adapter).length, 0);
});

test('preparation refreshes only missing free-item counts and removes bounded listeners', async () => {
  const f = fixture(); await prepareFreeWelfare(f.adapter, { welfare: true }); assert.deepEqual(f.sent, []);
  f.shop.countReady = false; await prepareFreeWelfare(f.adapter, { welfare: true });
  assert.deepEqual(f.sent, [['counts', [13360001]]]); assert.equal(f.shop._events.GOODS_HAVE_BUY_COUNT.length, 0);
  f.sent.length = 0; await prepareFreeWelfare(f.adapter, { welfare: true }); assert.deepEqual(f.sent, []);
  const control = new AbortController(); control.abort(); f.adapter.signal = control.signal; f.shop.countReady = false;
  await prepareFreeWelfare(f.adapter, { welfare: true }); assert.deepEqual(f.sent, []);
});

test('new per-round prayer uses its distinct native count=1 only with free eligibility and exact round state', async () => {
  const f = fixture(), data = { 17: { roundId: 17, lastFreeTime: 0 }, 18: { roundId: 18, lastFreeTime: 0 } };
  const manager = { InfoIds: [17, 18], FreeBlessItemEnough: true, GetChangeInfoById: id => data[id], IsInDrawTime: () => true,
    CanFreeBless: id => data[id].lastFreeTime === 0,
    sendQifuDrawReq(id, count) { f.sent.push(['new-bless', id, count]); data[id].lastFreeTime = 1760000000; } };
  f.managers.NewBlessManager = manager;
  const actions = plan(f).actions.filter(action => action.key.startsWith('welfare:free-bless-round:'));
  assert.equal(actions.length, 2); assert.equal(actions[0].done(), false);
  data[18].lastFreeTime = 123; assert.equal(actions[0].done(), false, 'another round cannot confirm this request');
  assert.equal((await awaitClaim(actions[0], { valid: () => true, timeout: 20, poll: 1 })).status, 'confirmed');
  assert.deepEqual(f.sent, [['new-bless', 17, 1]]);
  data[17].lastFreeTime = 0; manager.FreeBlessItemEnough = false;
  assert.equal(plan(f).actions.filter(action => action.key.startsWith('welfare:free-bless-round:')).length, 0);
  assert.equal(actions[0].send(), false);
});

test('target sale view numeric-string location and native object return rewards remain readable', () => {
  const f = fixture(); f.shop.entries = [];
  const returned = { ItemID: 77, ItemNum: 2 };
  Object.defineProperty(f.goods, 'ReturnGoodsArr', { get: () => [returned] });
  f.shop._events.GOODS_HAVE_BUY_COUNT = [{ caller: { pageType: '2', chapter: '9', originList: [f.row], dataList: [], updateList() {} } }];
  const action = shopAction(f); assert.ok(action); assert.equal(action.rewards[1], returned);
  for (const patch of [{ pageType: 0 }, { pageType: undefined }, { pageType: 2, chapter: 0 }, { chapter: undefined }]) {
    Object.assign(f.shop._events.GOODS_HAVE_BUY_COUNT[0].caller, patch); assert.equal(freeShopEntries(f.adapter).length, 0);
  }
});

test('alternative-currency products are not treated as zero-cost gifts and in-flight count refresh cancels cleanly', async () => {
  const f = fixture(); f.goods.pricetype = 110; assert.equal(shopAction(f), undefined);
  f.goods.pricetype = 0; f.shop.countReady = false;
  const control = new AbortController(); f.adapter.signal = control.signal;
  let requested; const started = new Promise(resolve => { requested = resolve; });
  f.shop.SendCcGoodsHaveBuyCountReqV2 = ids => { f.sent.push(['counts', ids]); requested(); };
  const pending = prepareFreeWelfare(f.adapter, { welfare: true }); await started; control.abort(); await pending;
  assert.equal(f.shop._events.GOODS_HAVE_BUY_COUNT.length, 0); assert.equal(f.sent.length, 1); assert.equal(shopAction(f), undefined);
});

test('target-sale config exposes free gift alongside paid goods without an open sale window', async () => {
  const f = fixture(); f.shop.entries = [];
  const paid = { ...f.row, goodsinfo: { ...f.goods, ID: 88, yuanbao: 7000 } };
  f.managers.Shop_json = { GetTargetSaleConfigs: () => [paid, f.row], GetTargetSaleGoods() {} };
  const action = shopAction(f); assert.ok(action);
  assert.equal(plan(f).actions.filter(a => a.workflowGroup.startsWith('free-shop:')).length, 1);
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 20, poll: 1 })).status, 'confirmed');
  assert.equal(f.sent.filter(a => a[0] === 'buy').length, 1);
  assert.equal(f.sent.find(a => a[0] === 'buy')[1].GoodsList[0].PriceYuanBao, 0);
});

test('zero-silver purchase route builds a direct free message without opening a purchase dialog', () => {
  const f = fixture();
  f.shop.GetBuyMsg = (id, count, discount, currency, price) => {
    assert.equal(currency, 2, 'native silver currency'); assert.equal(price, 0);
    return { GoodsCount: 1, BuyType: 1, UsingType: 0, IsSelfBuy: true,
      GoodsList: [{ ItemID: id, ItemNum: count, Discount: 100,
        PriceTongQian: currency === 2 ? price : 0, PriceYuanBao: currency === 2 ? 0 : price }] };
  };
  const action = shopAction(f); assert.ok(action); action.send();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0][0], 'buy');
  assert.equal(f.sent[0][1].GoodsList[0].PriceTongQian, 0);
  assert.equal(f.sent[0][1].GoodsList[0].PriceYuanBao, 0);
});

// Values observed in official configuration and live native objects on 2026-11-15.
function officialGiftFixture(sendName) {
  const f = fixture(sendName); f.shop.entries = []; f.bless.CanFreeBless = false;
  Object.assign(f.goods, { ID: 11578201, name: '免费礼盒', TypeID: 43, pricetype: 140, maxBuyCount: '1;1', expirytime: '20261231T235959' });
  delete f.goods.maxBuyNum;
  // Native CheckGoodsLimit compares total count directly with maxBuyNum:
  // an absent maximum must stay undefined, since replacing it with 0 is sold out.
  f.shop.CheckGoodsLimit = goods => !!(goods.LimitNums && goods.LimitNums <= f.shop.count) || 0 >= goods.maxBuyNum;
  const sale = { id: 545, item_id: 11578201, time1: '20260418T000003', time2: '20280425T235959', sorting: 28 };
  const timer = { ServerDate: new Date(2026, 10, 15, 12) }; f.managers.TimerManager = timer;
  f.adapter.goods = id => id === 11578201 ? f.goods : null;
  f.adapter.config = name => name === 'sys_h5_shop.sgs' ? { root: { discount_shop: [sale] } } : null;
  f.shop.GetItemPrice = (id, type) => { assert.equal(id, 11578201); return [type, 0]; };
  return { ...f, sale, timer };
}

test('official type-140 daily gift is found with no open view or registered Shop_json class', async () => {
  const f = officialGiftFixture(); delete f.goods.tongqian;
  const action = shopAction(f); assert.ok(action); assert.equal(action.key, 'welfare:free-shop:11578201:0');
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 20, poll: 1 })).status, 'confirmed');
  assert.deepEqual(f.sent[0], ['build', 11578201, 1, 100, 140, 0]);
  assert.equal(f.sent[1][1].GoodsList[0].pricetype, 140);
  assert.equal(shopAction(f), undefined);
});

test('client 2026111702 free gift uses the new native transport, with only one confirmed zero-cost purchase', async () => {
  const f = officialGiftFixture('G');
  f.proxy.L = () => assert.fail('must not use an unrelated minified method');
  f.shop.countReady = false;
  assert.equal(shopAction(f), undefined);
  await prepareFreeWelfare(f.adapter, { welfare: true });
  const action = shopAction(f);
  assert.ok(action);
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 20, poll: 1 })).status, 'confirmed');
  assert.deepEqual(f.sent[0], ['counts', [11578201]]);
  assert.deepEqual(f.sent[1], ['build', 11578201, 1, 100, 140, 0]);
  assert.equal(f.sent[2][1].GoodsList[0].pricetype, 140);
  assert.equal(action.send(), false);
  assert.equal(shopAction(f), undefined);
  assert.equal(f.sent.length, 3);
});

test('free gift skips missing or ambiguous native senders and does not send on a replaced proxy', () => {
  const f = officialGiftFixture('G');
  const action = shopAction(f);
  assert.ok(action);
  f.proxy.L = f.proxy.G.bind(f.proxy);
  f.proxy.other = function (message) {
    if (this.useNewPB) message = message.OldProtocalToPb();
    if (this.cacheStarted) return this.addProtocolToCacheList(message, this.CACHE_TYPE_SEND);
    assert.fail('ambiguous transport');
  };
  assert.equal(action.send(), false);
  assert.equal(shopAction(f), undefined);
  delete f.proxy.other;
  f.shop.proxy = { G: f.proxy.G };
  assert.equal(action.send(), false);
  delete f.shop.proxy.G;
  assert.equal(shopAction(f), undefined);
  assert.deepEqual(f.sent, []);
});

test('native free currency marker must survive the builder; unknown currencies stay rejected', () => {
  const f = officialGiftFixture();
  assert.equal(buildFreeShopMessage(f.shop, 11578201, 140).GoodsList[0].pricetype, 140);
  const build = f.shop.GetBuyMsg; f.shop.GetBuyMsg = (...args) => { const m = build(...args); m.GoodsList[0].pricetype = 0; return m; };
  assert.equal(buildFreeShopMessage(f.shop, 11578201, 140), null);
  assert.equal(buildFreeShopMessage(f.shop, 11578201, 110), null);
});

test('config fallback refuses unknown requirements, native price changes, missing clocks and expired gifts', () => {
  for (const change of [f => { f.sale.itemUnlock = '1,1'; }, f => { f.sale.time1 = 'bad'; },
    f => { f.goods.maxBuyCount = '1;2'; }, f => { f.goods.maxBuyNum = 0; }, f => { f.goods.pricetype = 110; },
    f => { f.goods.yuanbao = 1; }, f => { f.shop.GetItemPrice = (_, type) => [type, 1]; },
    f => { f.timer.ServerDate = new Date(NaN); }, f => { f.goods.expirytime = '20260101T000000'; },
    f => { f.shop.countReady = false; }]) {
    const f = officialGiftFixture(); change(f); assert.equal(shopAction(f), undefined); assert.deepEqual(f.sent, []);
  }
  const f = officialGiftFixture(), action = shopAction(f);
  f.shop.GetItemPrice = (_, type) => [type, 1]; assert.equal(action.send(), false);
});

test('ordinary native SaleBuy view without pageType/chapter remains discoverable', () => {
  const f = fixture(); f.goods.pricetype = 140; f.shop.entries = [];
  const caller = { barId: 6015, taskVO: { id: 5097, activitytype: 8, IsInTime: true }, originList: [f.row], dataList: [f.row], updateItems() {} };
  f.shop._events.GOODS_HAVE_BUY_COUNT = [{ caller }]; assert.ok(shopAction(f));
  caller.taskVO.IsInTime = false; assert.equal(shopAction(f), undefined);
});

test('shop gift and task 85263 claim separately once per server day, including reload', async t => {
  const f = officialGiftFixture(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const values = new Map(), settings = new Settings({ getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) });
  let date = '2026-11-15', taskClaimed = false;
  f.adapter.account = () => 'test'; f.adapter.day = () => date;
  const taskManager = { allTasks: [{ id: 85263, get HasAward() { return taskClaimed; }, get CanAward() { return !taskClaimed; }, CanRewardCount: 1,
    FirstMaxCount: 0, baseVo: { name: '免费好礼', maxComplete: 1, TaskRewardItem: [{ ItemID: 11578201, ItemNum: 1 }] }, TaskConditions: [{ reqType: 60, _count: 0 }] }],
    GetServerTaskDataByTaskID() { return this.allTasks[0]; }, RequestTaskAward(id) { f.sent.push(['task', id]); taskClaimed = true; } };
  f.managers.TaskManager = taskManager;
  const make = () => createRewardsController({ adapter: f.adapter, settings, scope, timeout: 20, poll: 1 });
  let controller = make(); controller.options({ automatic: true, sign: false, mail: false, codes: false, activities: false });
  await controller.run(); await controller.run(); controller = make(); await controller.run();
  assert.equal(f.sent.filter(r => r[0] === 'task').length, 1); assert.equal(f.sent.filter(r => r[0] === 'buy').length, 1);
  date = '2026-11-16'; f.timer.ServerDate.setDate(16); f.shop.count = 0; taskClaimed = false;
  await controller.run();
  assert.equal(f.sent.filter(r => r[0] === 'task').length, 2); assert.equal(f.sent.filter(r => r[0] === 'buy').length, 2);
});
