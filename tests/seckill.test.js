import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanConfig, matches, rowKey, roundStart, blocked } from '../src/plugins/seckill/model.js';
import { createController } from '../src/plugins/seckill/controller.js';
import { createNativeAdapter, purchaseMethod } from '../src/plugins/seckill/native.js';
import { ResourceScope } from '../src/core/resources.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(t, storage = new Map()) {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  let now = Date.parse('2026-11-14T04:00:01Z'), id = '41', callback;
  let rows = [product()]; const sent = [], errors = [];
  const settings = { get: (key, fallback) => structuredClone(storage.get(key) || fallback), set: (key, value) => storage.set(key, structuredClone(value)) };
  const adapter = { account: () => id, now: () => now, rows: () => rows, ready: () => true, prepare: async () => {},
    refresh: () => { sent.push(['list']); return true; }, stock: row => sent.push(['stock', row.key]), buy: row => sent.push(['buy', row.key]), subscribe: fn => { callback = fn; } };
  const controller = createController({ adapter, settings, scope, reportError: e => errors.push(e) });
  return { controller, adapter, scope, settings, sent, storage, errors, setAccount: s => { id = s; }, setRows: r => { rows = r; }, rows: () => rows,
    advance(ms) { now += ms; controller.tick(); }, response: p => callback(p), async enable(items = { huijuanmaobi: true }) { controller.options({ enabled: true, items }); await flush(); } };
}
function product(changes = {}) {
  const row = { actId: 2, itemId: 1001, baseId: 11, startMs: Date.parse('2026-11-14T04:00:00Z'), endMs: Date.parse('2026-11-15T04:00:00Z'),
    name: '绘卷毛笔', price: 100, currency: 2, count: 3, stock: 20, stockTotal: 20, bought: 0, limit: 1, valid: true, ...changes };
  row.key = rowKey(row); return row;
}
const buys = f => f.sent.filter(r => r[0] === 'buy');

test('seckill: defaults off; custom keywords deduplicate and cap; presets enforce quantity/price/currency', () => {
  assert.equal(cleanConfig().enabled, false); assert.deepEqual(Object.entries(cleanConfig().items).filter(([, v]) => v).map(([key]) => key), ['gongxun', 'pifubao']);
  assert.equal(cleanConfig({ items: { gongxun: false, pifubao: false } }).items.gongxun, false);
  assert.deepEqual(cleanConfig({ custom: [' 毛笔 ', '毛 笔', '', null] }).custom, ['毛 笔']);
  assert.equal(cleanConfig({ custom: Array.from({ length: 30 }, (_, i) => String(i)) }).custom.length, 20);
  for (const [name, kw, count] of [['锦鲤龙珠', '龙珠', 5], ['绘卷毛笔', '毛笔', 3], ['奇珍夺宝券', '奇珍夺宝券', 10], ['夺宝券', '夺宝券', 10]]) {
    assert.equal(matches(product({ name, count }), kw), true); assert.equal(matches(product({ name, count: 1 }), kw), false);
  }
  assert.equal(matches(product({ name: '奇珍夺宝券', count: 10 }), '夺宝券'), false);
  assert.equal(matches(product({ name: '祈福灯', count: 10, price: 6666 }), '祈福灯'), true);
  for (const changes of [{ currency: 1 }, { currency: 3 }, { count: 1 }, { price: 8888 }]) assert.equal(matches(product({ name: '祈福灯', count: 10, price: 6666, ...changes }), '祈福灯'), false);
});
test('seckill: Chinese 0/8/12/19 round boundaries independent of host timezone', () => {
  for (const hour of [0, 8, 12, 19]) { const stamp = Date.parse(`2026-11-14T${String(hour).padStart(2, '0')}:00:00+08:00`); assert.equal(roundStart(stamp + 1), stamp); assert.ok(roundStart(stamp - 1) < stamp); }
});
test('seckill: unknown, expired, zero stock and positive limit full block; zero limit means unlimited', () => {
  const now = Date.parse('2026-11-14T04:00:01Z');
  assert.equal(blocked(product({ limit: 0 }), now), '');
  for (const changes of [{ valid: false }, { stock: 0 }, { bought: 1 }, { endMs: now }]) assert.ok(blocked(product(changes), now));
});
test('seckill: install, panel-less ticks and selected-but-off never query or buy', async t => {
  const f = fixture(t); f.advance(20000); f.controller.options({ items: { huijuanmaobi: true } }); await flush(); assert.deepEqual(f.sent, []);
});
test('seckill: future targets wait; available targets beat future ones; exact native row is sent', async t => {
  const f = fixture(t), future = product({ itemId: 1002, startMs: Date.parse('2026-11-14T05:00:00Z') });
  f.setRows([future, product()]); await f.enable(); assert.deepEqual(buys(f), [['buy', product().key]]);
  f.response({ baseId: 11, result: 1 }); f.advance(3100); assert.equal(buys(f).length, 1);
  f.advance(3600000); assert.equal(buys(f).length, 2);
});
test('seckill: matching result alone confirms success; unrelated and malformed replies ignored; cooldown 3 seconds', async t => {
  const f = fixture(t); f.setRows([product(), product({ actId: 3, itemId: 1002, baseId: 12 })]); await f.enable();
  f.response({ baseId: 999, result: 1 }); f.response({ baseId: 11, result: '1' }); assert.match(f.controller.snapshot().rows[0].state, /等待/);
  f.response({ baseId: 11, result: 1 }); assert.equal(f.controller.snapshot().rows[0].state, '本场已抢到');
  f.advance(2999); assert.equal(buys(f).length, 1); f.advance(1); assert.equal(buys(f).length, 2);
});
test('seckill: explicit failures use three attempts per round, wait 30 seconds, cap nine even after reload', async t => {
  const f = fixture(t); await f.enable();
  for (let i = 1; i <= 9; i++) {
    assert.equal(buys(f).length, i); f.response({ baseId: 11, result: 0 });
    if (i < 9) { f.advance(i % 3 ? 299 : 29999); assert.equal(buys(f).length, i); f.advance(1); }
  }
  f.advance(60000); assert.equal(buys(f).length, 9); assert.equal(f.controller.snapshot().rows[0].state, '已试满 3×3 次');
  f.scope.dispose(); const g = fixture(t, f.storage); await flush(); g.advance(31000); assert.equal(buys(g).length, 0);
});
test('seckill: timeout never assumes failure or blindly repeats a debit; persisted request survives reload', async t => {
  const f = fixture(t); await f.enable(); f.advance(1201); f.advance(60000); assert.equal(buys(f).length, 1); assert.match(f.controller.snapshot().rows[0].state, /未确认/);
  f.scope.dispose(); const g = fixture(t, f.storage); await flush(); g.advance(5000); assert.equal(buys(g).length, 0);
  g.rows()[0].bought = 1; g.advance(300); assert.equal(g.controller.snapshot().rows[0].state, '本场已抢到');
});
test('seckill: same-base future activity cannot consume an earlier unconfirmed purchase', async t => {
  const f = fixture(t); f.setRows([product(), product({ actId: 3, itemId: 1002 })]); await f.enable(); f.advance(16000);
  f.response({ baseId: 11, result: 1 }); f.advance(300); assert.equal(buys(f).length, 1); assert.match(f.controller.snapshot().rows[0].state, /未确认/);
});
test('seckill: stock count increment confirms without reply; done survives row rebuild, new round and reload', async t => {
  const f = fixture(t); await f.enable(); f.setRows([product({ bought: 1, limit: 0 })]); f.advance(300); assert.equal(f.controller.snapshot().rows[0].state, '本场已抢到');
  f.advance(8 * 3600000); assert.equal(buys(f).length, 1);
  f.scope.dispose(); const g = fixture(t, f.storage); await flush(); g.advance(4000); assert.equal(buys(g).length, 0);
});
test('seckill: cross-round list refresh and 10-second supplement occur without incoming events', async t => {
  const f = fixture(t); await f.enable(); const initial = f.sent.filter(s => s[0] === 'list').length;
  f.advance(8 * 3600000); assert.equal(f.sent.filter(s => s[0] === 'list').length, initial + 1);
  f.advance(10000); assert.equal(f.sent.filter(s => s[0] === 'list').length, initial + 2);
});
test('seckill: changed product signature resets failures; unchanged stock updates do not reset attempts', async t => {
  const f = fixture(t); await f.enable(); f.response({ baseId: 11, result: 0 }); f.rows()[0].stock--; f.advance(300); assert.equal(buys(f).length, 2);
});
test('seckill: account switch defaults off and clears private UI; return restores that account only', async t => {
  const f = fixture(t); await f.enable(); f.setAccount('42'); f.advance(300); assert.equal(f.controller.snapshot().config.enabled, false);
  f.response({ baseId: 11, result: 1 }); assert.equal(buys(f).length, 1); f.setAccount('41'); f.advance(300); assert.match(f.controller.snapshot().rows[0].state, /等待/);
});
test('seckill: disabling/disposing prevents queries, writes and async preparation from triggering business requests', async t => {
  const f = fixture(t); let resolve; f.adapter.prepare = () => new Promise(r => { resolve = r; });
  f.controller.options({ enabled: true, items: { huijuanmaobi: true } }); await flush(); f.scope.dispose(); resolve(); await flush(); f.advance(100000); assert.deepEqual(f.sent, []);
});
test('seckill: manual priority precedes presets; cancellation pauses for ten minutes', async t => {
  const f = fixture(t), second = product({ actId: 3, itemId: 1002, name: '其它物品', baseId: 12 }); f.setRows([product(), second]);
  f.controller.manual(second.key); await f.enable(); assert.equal(buys(f)[0][1], second.key);
  f.controller.manual(second.key); f.response({ baseId: 12, result: 0 }); f.advance(599999); assert.equal(buys(f).length, 1); f.advance(1); assert.equal(buys(f).length, 2);
});
test('seckill: purchase exception retains complete diagnostic and does not repeat', async t => {
  const f = fixture(t); await f.enable(); f.response({ baseId: 11, result: 0 });
  f.adapter.buy = () => { throw new Error('fixture purchase error with full details'); }; f.advance(300); assert.match(f.controller.snapshot().error, /fixture purchase error with full details/);
});
test('seckill: storage failure before sending prevents purchase', async t => {
  const f = fixture(t); f.settings.set = () => { throw new Error('fixture quota failure'); }; await f.enable(); assert.deepEqual(buys(f), []); assert.match(f.controller.snapshot().error, /fixture quota failure/);
});
test('seckill: unresolved removed activity blocks same-base future purchases', async t => {
  const f = fixture(t); await f.enable(); f.setRows([product({ actId: 3, itemId: 1002 })]); f.advance(18000); assert.equal(buys(f).length, 1);
});
test('seckill: unique obfuscated native method accepted; ambiguous candidates rejected; no getter scans', () => {
  const calls = [];
  class Manager { tt(goods, id) { const p = { newSecKill_baseID: id, newSecKill_ItemID: goods.itemId, GoodsCount: 1 }; calls.push(p); } }
  const m = new Manager(); Object.defineProperty(m, 'trap', { get() { throw new Error('must not enumerate getters'); } });
  purchaseMethod(m)({ itemId: 11 }, 42); assert.deepEqual(calls[0], { newSecKill_baseID: 42, newSecKill_ItemID: 11, GoodsCount: 1 });
  m.other = function() { return { newSecKill_baseID: 1, newSecKill_ItemID: 2, GoodsCount: 1 }; }; assert.equal(purchaseMethod(m), null);
});
test('seckill: native adapter gets existing manager by event caller, expands official goods config and removes subscriptions', t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose()); let calls = 0;
  const g = { itemId: 1, baseId: 11, count: 3, price: 100, price_type: 2, StockNow: 2, StockTotal: 2, LimitSelfCount: 0, limitSumCount: 0 };
  const activity = { ActID: 2, BuyTime: 100, BuyEndTime: 200, GoodsDataDic: { datum: [g], getNumberKey: () => g } };
  const m = { CurrentSecKills: [activity], SendNewSecKillInfoReq() {}, ReqBuySeckillGoods(goods, id) { assert.equal(goods, g); assert.equal(id, 2); calls++; } };
  const proxy = { _events: { decodeClientNewSeckillInfoRep: { caller: m } }, on() { calls++; }, off() { calls--; } };
  const adapter = createNativeAdapter({ scope, game: { getSelf: () => ({ ClientId: 41 }), getClass: name => name === 'TimerManager' ? { LocalStaticServerTime: 101 } : null, getServerProxy: () => proxy,
    getConfigData: () => ({ root: { abbreviation: { field: [{ Short: 'a', Long: 'ID' }, { Short: 'b', Long: 'name' }] }, goodslist: { goods: [{ a: 11, b: '毛笔' }] } } }) } });
  assert.equal(adapter.account(), '41'); const row = adapter.rows()[0]; assert.equal(row.valid, true); assert.equal(row.name, '毛笔'); adapter.buy(row); assert.equal(calls, 1);
  const off = adapter.subscribe(() => {}); assert.equal(calls, 4); off(); assert.equal(calls, 1);
});
