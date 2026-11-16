import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createNativeAdapter, purchaseMethod } from '../src/plugins/seckill/native.js';
import { ResourceScope } from '../src/core/resources.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/seckill-client.json', import.meta.url)));

test('seckill: replay actual cached client activity/stock VOs and obfuscated purchase method offline', t => {
  class Dictionary {
    constructor() { this.values = new Map(); }
    get datum() { return [...this.values.values()]; }
    getNumberKey(key) { return this.values.get(key); }
    addNumberKey(key, value) { this.values.set(key, value); }
    destroy() { this.values.clear(); }
  }
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const requests = [], ctx = vm.createContext({ SNt: Dictionary, HNt: { I: () => ({ LocalStaticServerTime: 101 }) },
    IK: { I: () => ({ JumpATime: 5, JumpBTime: 1 }) },
    PU: { HasBlackListGoods: () => false, HasBlackListBar: () => false },
    Oq: class { GoodsList = []; }, EQ: class {}, z0t: { NEW_SECKILL_BUY_FORM: 2 },
  });
  vm.runInContext(`${fixture.regions.goods.source}\n${fixture.regions.activity.source}\nglobalThis.Activity=SK; globalThis.Goods=TK; globalThis.NativeManager=class { ${fixture.regions.purchase.source} };`, ctx);
  const activity = new ctx.Activity({ act_id: 21, goods: [{ item_id: 1000001, base_id: 12, count: 3, price_type: 2, price: 500, stock_total: 20, stock_bought: 2, my_buy_cnt: 0, limit_buy_cnt: 0 }],
    show_time_begin: 90, show_time_end: 300, buy_time_begin: 100, buy_time_end: 200 });
  const manager = new ctx.NativeManager(); manager.proxy = { L: p => requests.push(p) }; manager.CurrentSecKills = [activity];
  manager.GetDataVoByActId = () => activity; manager.SendNewSecKillInfoReq = () => {};
  const adapter = createNativeAdapter({ scope, game: { getClass: name => name === 'NewSecKillManager' ? manager : name === 'TimerManager' ? { LocalStaticServerTime: 101 } : null, getServerProxy: () => null, getSelf: () => ({ ClientId: 41 }),
    getConfigData: () => ({ root: { goodslist: { goods: [{ ID: 12, name: '绘卷毛笔' }] } } }) } });
  assert.equal(typeof purchaseMethod(manager), 'function');
  const row = adapter.rows()[0]; assert.equal(row.valid, true); assert.equal(row.stock, 18); assert.equal(row.limit, 0); assert.equal(row.count, 3);
  adapter.buy(row); assert.equal(requests.length, 1);
  const p = requests[0]; assert.equal(p.GoodsCount, 1); assert.equal(p.buyFrom, 2); assert.equal(p.newSecKill_baseID, 21); assert.equal(p.newSecKill_ItemID, 1000001);
  assert.equal(p.GoodsList[0].ItemID, 12); assert.equal(p.GoodsList[0].ItemNum, 3); assert.equal(p.GoodsList[0].PriceYuanBao, 500);
  activity.SetStockInfo({ item_id: 1000001, my_buy_cnt: 1, stock_bought: 3 });
  assert.equal(adapter.rows()[0].bought, 1); assert.equal(adapter.rows()[0].stock, 17);
});
