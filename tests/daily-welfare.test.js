import test from 'node:test';
import assert from 'node:assert/strict';
import { planWelfare, prepareWelfare, managerSpecs } from '../src/plugins/daily-rewards/welfare.js';
import { awaitClaim, createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';

class Events {
  handlers = new Map();
  on(name, caller, fn) { const entries = this.handlers.get(name) || []; entries.push({ caller, fn }); this.handlers.set(name, entries); }
  off(name, caller, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter(item => item.caller !== caller || item.fn !== fn)); }
  emit(name, ...args) { for (const { caller, fn } of [...(this.handlers.get(name) || [])]) fn.apply(caller, args); }
  get listenerCount() { return [...this.handlers.values()].reduce((sum, items) => sum + items.length, 0); }
}
export function createWelfareFixture(transportName = 'L') {
  const calls = [], proxy = new Events(), managers = {}, configs = {};
  const welfare = Object.assign(new Events(), {
    proxy, JbpUserData: { Status: 0, Count: 0, Level: 1 }, PrivilegeCardDatas: [],
    ReqJbpInfo() { calls.push('tree-info'); this.emit('UPDATE_JBP_USER_INFO'); },
    ReqJbpTreeUsing() { calls.push('tree-start'); this.JbpUserData.Status = 1; },
    ReqJbpAwd(id) { calls.push(['tree-claim', id]); managers.GameGoodsManager.count--; this.JbpUserData.Status = 2; this.emit('KANSHU_GET_AWARD'); },
    GetCardDataByType(type) { return this.PrivilegeCardDatas.find(card => card.type === type); },
    SendClientPrivilegeDataReq() { this.emit('UPDATE_PRIVILEGE_CARD_DATA'); },
    PrivilegeCardDaliyRewardInfoReq() { this.emit('PRIVILEGE_DAILY_REWARD_UPDATE'); },
    CanShowPrivilegeDaliyReward() { return false; },
    SendClientPrivilegeRewardReq(day, type) { calls.push(['card', day, type]); proxy.emit('ClientPrivilegeRewardRep', { Protocol: { type, rewardId: day, code: 0 } }); },
  });
  managers.WelfareManger = welfare;
  managers.GameGoodsManager = { count: 0, GetGoodsNumByBaseID() { return this.count; } };
  managers.BlessManager = { FreeBlessItemEnough: true };
  managers.GameShopManager = Object.assign(new Events(), {
    proxy: {
      [transportName](msg) {
        if (this.useNewPB) msg = msg.OldProtocalToPb();
        if (this.cacheStarted) return this.addProtocolToCacheList(msg, this.CACHE_TYPE_SEND);
        this.send(msg);
      },
      send(msg) { calls.push(['tree-buy', msg]); managers.GameGoodsManager.count++; },
    },
    GetBuyMsg(id, count, discount, type, price) {
      calls.push(['build', id, count, discount, type, price]);
      return { GoodsCount: 1, BuyType: 1, UsingType: 0, IsSelfBuy: true, GoodsList: [{ ItemID: id, ItemNum: count, Discount: discount, PriceYuanBao: price, PriceTongQian: 0 }] };
    },
  });
  managers.GuildManager = Object.assign(new Events(), { GuildID: 8, CanDrum: true, LeftFreeDrumTimes: 1,
    SendGuildDonate() { calls.push('free-drum'); this.LeftFreeDrumTimes--; },
    SendGuildDrumUse() { throw new Error('Paid drum must never be called'); },
  });
  managers.NewPrivilegeCardManager = Object.assign(new Events(), {
    active: new Set([51]), claimed: new Set(), IsCardActive(id) { return this.active.has(id); }, IsClaimedToday(id) { return this.claimed.has(id); },
    SendNewPrivilegeCardDataReq() { this.emit('UPDATE_NEW_PRIVILEGE_CARD_DATA'); },
    SendNewPrivilegeCardDailyRewardReq(id) { calls.push(['new-card', id]); this.emit('UPDATE_NEW_PRIVILEGE_CARD_DAILY_REWARD', id, []); },
  });
  configs['ff_jubaopen.sgs'] = { root: { award: [{ grade: 1, buyItem: 12130101 }] } };
  configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'] = { root: { abbreviation: { field: [{ Short: 'a', Long: 'ID' }, { Short: 'yb', Long: 'yuanbao' }, { Short: 'tq', Long: 'tongqian' }] }, goodslist: { goods: [{ a: 12130101, yb: 0, tq: 0 }] } } };
  configs['ff_dbs_pay_gift.sgs'] = { root: { new_card: { new_card_content: [{ ID: 51, type: 1, open: 1, reward_e: '1,1' }] } } };
  const adapter = { manager: name => managers[name], config: name => configs[name], proxy: () => proxy, account: () => 'fixture-account', day: () => '2026-11-13', loadConfig: async name => { calls.push(['config', name]); return configs[name]; } };
  return { adapter, managers, configs, calls, welfare, proxy };
}
const plan = fixture => planWelfare(fixture.adapter, { welfare: true });
const action = (fixture, key) => plan(fixture).actions.find(item => item.key === `welfare:${key}`);
const claim = (item, extra = {}) => awaitClaim(item, { valid: () => true, timeout: 50, poll: 2, ...extra });

test('tree daily red refresh runs once only after the requested reward is confirmed', async () => {
  const f = createWelfareFixture();
  f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1;
  const updates = [];
  f.welfare.SaveKanShuPhpData = () => updates.push('save');
  f.welfare.event = name => updates.push(name);
  const item = action(f, 'tree:claim');
  assert.equal(item.done(), false);
  assert.deepEqual(updates, []);
  assert.equal((await claim(item)).status, 'confirmed');
  item.done();
  assert.deepEqual(updates, ['save', 'KANSHU_DALIY_TIME_UPDATE']);
});

test('anonymous reward reply and stopped scope cannot clear tree daily red', async () => {
  for (const stopped of [false, true]) {
    const f = createWelfareFixture();
    f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1;
    let updates = 0;
    f.welfare.SaveKanShuPhpData = () => updates++;
    f.welfare.event = () => updates++;
    f.welfare.ReqJbpAwd = () => f.welfare.emit('KANSHU_GET_AWARD');
    const item = action(f, 'tree:claim');
    assert.equal((await claim(item)).status, 'unconfirmed');
    if (stopped) {
      f.adapter.valid = () => false;
      f.managers.GameGoodsManager.count = 0; f.welfare.JbpUserData.Status = 2;
      item.done();
    }
    assert.equal(updates, 0);
  }
});

test('welfare is standalone and disabled selection has no actions', () => {
  const f = createWelfareFixture();
  assert.deepEqual(planWelfare(f.adapter, { welfare: false }), { actions: [], notes: [] });
  for (const [name, spec] of Object.entries(managerSpecs)) assert.equal(spec.guard(f.managers[name]), true, name);
});
test('tree full free flow confirms each step and uses the explicit-zero native builder', async () => {
  const f = createWelfareFixture();
  for (const step of ['start', 'item', 'claim']) assert.equal((await claim(action(f, `tree:${step}`))).status, 'confirmed');
  assert.equal(f.welfare.JbpUserData.Status, 2);
  assert.deepEqual(f.calls.find(call => call[0] === 'build'), ['build', 12130101, 1, 100, 2, 0]);
  assert.equal(f.calls.filter(call => call === 'tree-info').length, 1);
  assert.equal(f.welfare.listenerCount, 0);
});
test('tree checks free qualification and both configured prices again before sending', () => {
  for (const change of [f => { f.managers.BlessManager.FreeBlessItemEnough = false; }, f => { f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].yb = 10; }, f => { delete f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].tq; }]) {
    const f = createWelfareFixture(); f.welfare.JbpUserData.Status = 1;
    const item = action(f, 'tree:item'); assert.ok(item); change(f);
    assert.equal(item.send(), false); assert.equal(f.calls.length, 0); assert.equal(action(f, 'tree:item'), undefined);
  }
});
test('tree never sends a changed native message or alternate payment', () => {
  for (const mutate of [m => { m.BuyType = 2; }, m => { m.GoodsList[0].PriceYuanBao = 1; }, m => { m.GoodsList[0].Bless = 1; }, m => { m.GoodsList[0].PriceGlory = 1; }, m => { m.GoodsList[0].ItemNum = 2; }, m => { m.UsingType = 25; }, m => { delete m.GoodsList[0].PriceTongQian; }]) {
    const f = createWelfareFixture(); f.welfare.JbpUserData.Status = 1;
    const original = f.managers.GameShopManager.GetBuyMsg;
    f.managers.GameShopManager.GetBuyMsg = function (...args) { const msg = original.apply(this, args); mutate(msg); return msg; };
    assert.equal(action(f, 'tree:item').send(), false);
    assert.equal(f.calls.some(call => call[0] === 'tree-buy'), false);
  }
});

test('tree refuses a changed, unknown or ambiguous purchase transport', () => {
  for (const change of [
    shop => { shop.proxy = { L: shop.proxy.G }; },
    shop => { shop.proxy.G = () => assert.fail('unknown sender'); },
    shop => { shop.proxy.L = function L() {
      return this.addProtocolToCacheList(this.OldProtocalToPb(), this.CACHE_TYPE_SEND);
    }; },
  ]) {
    const f = createWelfareFixture('G'); f.welfare.JbpUserData.Status = 1;
    const shop = f.managers.GameShopManager, build = shop.GetBuyMsg;
    const item = action(f, 'tree:item'); assert.ok(item);
    shop.GetBuyMsg = function (...args) {
      const message = build.apply(this, args);
      change(this);
      return message;
    };
    assert.equal(item.send(), false);
    assert.equal(f.managers.GameGoodsManager.count, 0);
  }
});
test('anonymous tree award refreshes once and does not claim success without matching state', async () => {
  const f = createWelfareFixture(); f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1;
  f.welfare.ReqJbpAwd = () => { f.welfare.emit('KANSHU_GET_AWARD'); f.welfare.emit('KANSHU_GET_AWARD'); };
  assert.equal((await claim(action(f, 'tree:claim'))).status, 'unconfirmed');
  assert.equal(f.calls.filter(call => call === 'tree-info').length, 1); assert.equal(f.welfare.listenerCount, 0);
});
test('stop removes tree listeners and prevents later info request', async () => {
  const f = createWelfareFixture(), aborter = new AbortController();
  f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1;
  f.welfare.ReqJbpAwd = () => aborter.abort();
  assert.equal((await claim(action(f, 'tree:claim'), { signal: aborter.signal })).status, 'interrupted');
  f.welfare.emit('KANSHU_GET_AWARD'); assert.equal(f.calls.length, 0); assert.equal(f.welfare.listenerCount, 0);
});
test('free drum requires native CanDrum and remaining times; no paid method', async () => {
  const f = createWelfareFixture();
  assert.equal((await claim(action(f, 'drum:8:1'))).status, 'confirmed');
  assert.equal(action(f, 'drum:8:1'), undefined); assert.deepEqual(f.calls, ['free-drum']);
  f.managers.GuildManager.LeftFreeDrumTimes = 1; f.managers.GuildManager.CanDrum = false;
  assert.equal(action(f, 'drum:8:1'), undefined);
});
test('monthly card matches exact type/reward and rejects unrelated event', async () => {
  const f = createWelfareFixture(); f.welfare.PrivilegeCardDatas.push({ type: 3, bActive: true, bReward: true, rewardDays: 7, days: 30, AddAwardsCanAwardList: () => [false, true] });
  const item = action(f, 'card:3:7');
  assert.equal(item.confirmations[0].accept({ Protocol: { type: 3, rewardId: 7, code: 0 } }), false);
  f.welfare.SendClientPrivilegeRewardReq = () => { f.proxy.emit('ClientPrivilegeRewardRep', { Protocol: { type: 2, rewardId: 7, code: 0 } }); };
  assert.equal((await claim(item)).status, 'unconfirmed');
  const extra = action(f, 'card:3:32'); assert.ok(extra);
  f.welfare.SendClientPrivilegeRewardReq = (day, type) => f.proxy.emit('ClientPrivilegeRewardRep', { Protocol: { type, rewardId: day, code: 0 } });
  assert.equal((await claim(extra)).status, 'confirmed');
});
test('new card event must match ID and native success is sufficient without data mutation', async () => {
  const f = createWelfareFixture(); const item = action(f, 'new-card:51');
  assert.equal((await claim(item)).status, 'confirmed'); assert.equal(f.managers.NewPrivilegeCardManager.claimed.size, 0);
  f.managers.NewPrivilegeCardManager.SendNewPrivilegeCardDailyRewardReq = function () { this.emit('UPDATE_NEW_PRIVILEGE_CARD_DAILY_REWARD', 99, []); };
  assert.equal((await claim(action(f, 'new-card:51'))).status, 'unconfirmed');
});
test('daily silver requires matching eligibility state after anonymous response', async () => {
  const f = createWelfareFixture(); let eligible = true;
  f.welfare.CanShowPrivilegeDaliyReward = type => type === 3 && eligible;
  f.welfare.PrivilegeCardDaliyRewardReq = () => f.proxy.emit('decodeClientGetWeekAndMonthSilverResp', { Protocol: { Data: { ProtoObj: { result: 0 } } } });
  f.welfare.PrivilegeCardDaliyRewardInfoReq = () => { eligible = false; };
  assert.equal((await claim(action(f, 'silver:3'))).status, 'confirmed');
});
test('prepare loads only relevant tables; failed one does not prevent other refreshes', async () => {
  const f = createWelfareFixture();
  f.adapter.loadConfig = async file => { f.calls.push(['config', file]); if (file.includes('jubaopen')) throw new Error('offline'); };
  await prepareWelfare(f.adapter, { welfare: true });
  assert.equal(f.calls.filter(call => call[0] === 'config').length, 3); assert.ok(f.calls.includes('tree-info'));
  f.calls.length = 0; f.adapter.manager = () => null;
  await prepareWelfare(f.adapter, { welfare: true }); assert.deepEqual(f.calls, []);
});
test('prepare checks cancellation after config load and sends no read request', async () => {
  const f = createWelfareFixture(), aborter = new AbortController(); f.adapter.signal = aborter.signal;
  f.adapter.loadConfig = async () => { aborter.abort(); };
  await prepareWelfare(f.adapter, { welfare: true }); assert.deepEqual(f.calls, []);
});
test('existing tree claim returning to status zero cannot start again, including after reload', async t => {
  const f = createWelfareFixture(), store = new Map();
  const settings = new Settings({ getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }, 'welfare-integration:');
  f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1;
  f.welfare.ReqJbpAwd = function (id) { f.calls.push(['tree-claim', id]); f.managers.GameGoodsManager.count--; this.JbpUserData.Status = 0; this.emit('KANSHU_GET_AWARD'); };
  const makeController = () => {
    const scope = new ResourceScope(); t.after(() => scope.dispose());
    return createRewardsController({ adapter: f.adapter, settings, scope, timeout: 50, poll: 2 });
  };
  const controller = makeController();
  controller.options({ excludeRecruit: false, excludeCoupon: false, excludeTrial: false, automatic: true, welfare: true, sign: false, mail: false, tasks: false, activities: false, codes: false });
  await controller.run();
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'tree-claim').length, 1);
  assert.equal(f.calls.includes('tree-start'), false);
  await controller.run(); await makeController().run();
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'tree-claim').length, 1);
  assert.equal(f.calls.includes('tree-start'), false);
});

test('tree paid tool is always included, capped at 200, matches current tree price and rejects changed messages', () => {
  const setup = () => {
    const f = createWelfareFixture(); f.welfare.JbpUserData.Status = 1;
    f.configs['ff_jubaopen.sgs'].root.award[0].needMoney = 200;
    f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].yb = 200;
    f.adapter.self = () => ({ TotalYuanBao: 500 });
    return f;
  };
  const paid = f => planWelfare(f.adapter, { welfare: true }).actions.find(x => x.key === 'welfare:tree:item');
  const f = setup(); assert.ok(action(f, 'tree:item'));
  const item = paid(f); assert.ok(item); item.send();
  assert.equal(f.calls.find(x => x[0] === 'tree-buy')[1].GoodsList[0].PriceYuanBao, 200);
  for (const mutate of [
    f => { f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].yb = 201; },
    f => { f.configs['ff_jubaopen.sgs'].root.award[0].needMoney = 100; },
    f => { f.adapter.self = () => ({ TotalYuanBao: 199 }); },
    f => { f.managers.BlessManager.FreeBlessItemEnough = false; },
    f => { f.welfare.JbpUserData.HasTriggerEvent = true; },
  ]) {
    const f = setup(), item = paid(f); mutate(f); assert.equal(item.send(), false);
    assert.equal(f.calls.some(x => x[0] === 'tree-buy'), false);
  }
  const changed = setup(), original = changed.managers.GameShopManager.GetBuyMsg;
  changed.managers.GameShopManager.GetBuyMsg = function (...args) { const m = original.apply(this, args); m.GoodsList[0].PriceYuanBao = 201; return m; };
  assert.equal(paid(changed).send(), false); assert.equal(changed.calls.some(x => x[0] === 'tree-buy'), false);
});

test('new client buys the tool and claims tree gold without opening the window, once per day', async t => {
  const f = createWelfareFixture('G'), scope = new ResourceScope(); t.after(() => scope.dispose());
  f.welfare.JbpUserData.PeachList = [{ info: [{ goodId: 100011, goodCnt: 280 }] }];
  f.configs['ff_jubaopen.sgs'].root.award[0].needMoney = 200;
  f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].yb = 200;
  let balance = 200;
  f.adapter.self = () => ({ TotalYuanBao: balance }); f.adapter.goods = id => id === 100011 ? { name: '元宝' } : null;
  const transport = f.managers.GameShopManager.proxy, send = transport.send;
  transport.L = () => assert.fail('unrelated client method');
  transport.send = message => {
    send(message);
    balance -= message.GoodsList[0].PriceYuanBao;
  };
  const original = f.welfare.ReqJbpAwd;
  f.welfare.ReqJbpAwd = function (id) { original.call(this, id); this.JbpUserData.Status = 0; balance += 280; };
  const map = new Map(), settings = { get: (k, d) => map.get(k) ?? d, set: (k, v) => map.set(k, structuredClone(v)) };
  const controller = createRewardsController({ adapter: f.adapter, settings, scope, timeout: 40, poll: 1 });
  controller.options({ automatic: true, sign: false, tasks: false, mail: false, activities: false, codes: false, welfare: true, excludeCoupon: true, excludeTrial: true });
  await controller.run();
  assert.deepEqual(f.calls.filter(x => x === 'tree-start' || ['tree-buy', 'tree-claim'].includes(x[0]))
    .map(x => Array.isArray(x) ? x[0] : x), ['tree-start', 'tree-buy', 'tree-claim']);
  assert.equal(balance, 280);
  await controller.run(); scope.dispose();
  const scope2 = new ResourceScope(); t.after(() => scope2.dispose());
  const reloaded = createRewardsController({ adapter: f.adapter, settings, scope: scope2, timeout: 40, poll: 1 });
  await reloaded.run();
  assert.equal(f.calls.filter(x => x === 'tree-start').length, 1);
  assert.equal(f.calls.filter(x => x[0] === 'tree-buy').length, 1);
  assert.equal(f.calls.filter(x => x[0] === 'tree-claim').length, 1);
});

test('tree skips locked or sub-200 accounts before cutting; pickup continues after its tool used the balance', () => {
  const f = createWelfareFixture();
  f.configs['ff_jubaopen.sgs'].root.award[0].needMoney = 200;
  f.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods[0].yb = 200;
  let balance = 199; f.adapter.self = () => ({ TotalYuanBao: balance });
  const plan = () => planWelfare(f.adapter, { welfare: true });
  assert.equal(plan().actions.some(x => x.key.startsWith('welfare:tree:')), false);
  balance = 200; assert.ok(plan().actions.find(x => x.key === 'welfare:tree:start'));
  f.managers.BlessManager.FreeBlessItemEnough = false;
  assert.equal(plan().actions.some(x => x.key.startsWith('welfare:tree:')), false);
  f.managers.BlessManager.FreeBlessItemEnough = true;
  f.welfare.JbpUserData.Status = 1; f.managers.GameGoodsManager.count = 1; balance = 0;
  assert.ok(plan().actions.find(x => x.key === 'welfare:tree:claim'));
});

test('explicit tree failures stop after three and stay stopped after reload; unknown result sends once', async t => {
  for (const explicit of [true, false]) {
    const f = createWelfareFixture(), scope = new ResourceScope(); t.after(() => scope.dispose());
    let sends = 0;
    f.welfare.ReqJbpTreeUsing = () => { sends++; if (explicit) f.proxy.emit('decodeClientChopTreeUsingRep', { Protocol: { Data: { ProtoObj: { err: 2 } } } }); };
    const map = new Map(), settings = { get: (k, d) => map.get(k) ?? d, set: (k, v) => map.set(k, structuredClone(v)) };
    const controller = createRewardsController({ adapter: f.adapter, settings, scope, timeout: 15, poll: 1 });
    controller.options({ automatic: true, sign: false, tasks: false, mail: false, activities: false, codes: false, welfare: true });
    await controller.run(); assert.equal(sends, explicit ? 3 : 1);
    await controller.run(); scope.dispose();
    const scope2 = new ResourceScope(); t.after(() => scope2.dispose());
    await createRewardsController({ adapter: f.adapter, settings, scope: scope2, timeout: 15, poll: 1 }).run();
    assert.equal(sends, explicit ? 3 : 1);
  }
});
