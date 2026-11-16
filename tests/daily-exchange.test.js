import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangeController, LANDLORD_BEAN } from '../src/plugins/daily-rewards/exchange.js';
import { createExchangeAdapter } from '../src/plugins/daily-rewards/exchange-native.js';
function fixture() {
  let clock = 0, owner = '41', day = '2026-11-16', enabled = true;
  const store = new Map(), sent = [], row = { id: 1001, price: 2500, bought: 0, limit: 7, period: 1, owned: false, unlocked: true, name: '祈福灯' };
  const state = { ready: true, currency: LANDLORD_BEAN, balance: 6000, rows: [row] };
  const settings = { get: (k, d) => structuredClone(store.get(k) ?? d), set: (k, v) => store.set(k, structuredClone(v)) };
  const adapter = { account: () => owner, day: () => day, snapshot: () => state, invalidate() {}, buy: attempt => sent.push(attempt) };
  const make = () => createExchangeController({ adapter, settings, now: () => clock, enabled: () => enabled });
  const controller = make();
  return { controller, make, state, row, sent, store, advance(ms = 5000) { clock += ms; controller.tick(); }, account(v) { owner = v; }, day(v) { day = v; }, enable(v) { enabled = v; } };
}
test('6000 beans buys two, then waits durably for landlord balance changes', () => {
  const f = fixture(); f.controller.toggle(1001, true);
  f.advance(4999); assert.equal(f.sent.length, 0);
  f.advance(1); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].count, 2);
  f.row.bought = 2; f.state.balance = 1000; f.controller.reply(1001, 0); f.advance(60000);
  assert.equal(f.sent.length, 1);
  const reloaded = f.make(); reloaded.tick(); reloaded.tick(); assert.equal(f.sent.length, 1);
  f.state.happyBeans = 999999; reloaded.tick(); assert.equal(f.sent.length, 1);
  f.state.balance = 3500; f.controller.tick(); f.advance(); assert.equal(f.sent.length, 2); assert.equal(f.sent[1].count, 1);
});
test('cancel, disable, account change and price change cancel the current countdown', () => {
  for (const action of [f => f.controller.toggle(1001, false), f => f.enable(false), f => f.account('42')]) {
    const f = fixture(); f.controller.toggle(1001, true); action(f); f.advance(); assert.equal(f.sent.length, 0);
  }
  const f = fixture(); f.controller.toggle(1001, true); f.row.price = 3000; f.advance(); assert.equal(f.sent.length, 0);
  f.advance(); assert.equal(f.sent[0].price, 3000);
});
test('new login/day uses remembered choices, fresh counts, and a new countdown', () => {
  const f = fixture(); f.controller.toggle(1001, true); f.advance(); f.row.bought = 2; f.state.balance = 1000; f.controller.reply(1001, 0);
  f.day('2026-11-17'); f.row.bought = 0; f.state.balance = 6000; const login = f.make(); login.tick();
  assert.equal(login.selected(1001), true); assert.equal(f.sent.length, 1); f.advance(); login.tick(); assert.equal(f.sent.length, 2);
});
test('unknown result remains locked across reload; failure waits for balance change', () => {
  const f = fixture(); f.controller.toggle(1001, true); f.advance(); const reload = f.make(); reload.tick(); f.advance(60000); reload.tick();
  assert.equal(f.sent.length, 1); f.controller.reply(1001, 7); f.advance(60000); assert.equal(f.sent.length, 1);
  f.state.balance = 6500; f.controller.tick(); f.advance(); assert.equal(f.sent.length, 2);
});
test('wrong currency, unknown ownership, unlimited or locked goods never purchase', () => {
  for (const change of [f => f.state.currency = 9020101, f => f.row.owned = undefined, f => f.row.limit = 0, f => f.row.unlocked = false, f => f.state.ready = false]) {
    const f = fixture(); change(f); f.controller.toggle(1001, true); f.advance(60000); assert.equal(f.sent.length, 0);
  }
});
test('native adapter reads only landlord bean four-ID and validates latest purchase', () => {
  const listeners = new Map(), calls = [], date = new Date(2026, 10, 17, 12);
  const row = { ItemID: 1, Price: 2500, MaxBuyCount: 7, MaxBuyType: 1, winCount: 0 };
  const m = { IsDdzShopListGeneralPoolListReady: true, DdzShopSortList: [row], DdzZgsWinCtn: 0,
    GetDdzHasBuyCountByItemID: () => 0, isGoodsOwned: () => false, DdzExchange: (...args) => calls.push(args) };
  const native = { account: () => '41', day: () => '2026-11-17', goods: () => ({ name: '祈福灯', TypeID: 1 }), config: () => ({ Root: { par: [{ VicBean: 1, BeanChange: LANDLORD_BEAN }] } }),
    manager: name => ({ ActivityGameDataManager: m, TimerManager: { ServerDate: date }, GameGoodsManager: { GetGoodsNumByFourID(id) { assert.equal(id, 90302); return 6000; } } })[name] };
  const adapter = createExchangeAdapter({ game: { getServerProxy: () => ({ on: (e, c, f) => listeners.set(e, f), off() {} }) }, scope: { signal: {}, add() {}, timeout: fn => fn() } }, native);
  adapter.bind(() => {}); listeners.get('ClientFightLordGoodsLimitInfoRep')({ Protocol: { Type: 0 } });
  assert.equal(adapter.snapshot().ready, true);
  const attempt = { ...adapter.snapshot().rows[0], count: 2, balance: 6000, day: native.day() };
  adapter.buy(attempt); assert.deepEqual(calls, [[1, 2500, 2]]);
  row.Price = 3000; assert.throws(() => adapter.buy(attempt));
});
