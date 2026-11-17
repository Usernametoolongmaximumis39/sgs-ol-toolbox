import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsController, awaitClaim } from '../src/plugins/daily-rewards/controller.js';
import { createNativeAdapter, planRewards } from '../src/plugins/daily-rewards/native.js';
import { ResourceScope } from '../src/core/resources.js';
class Events {
  _events = {};
  on(event, caller, fn) { (this._events[event] ||= []).push({ caller, fn }); }
  off(event, caller, fn) { this._events[event] = (this._events[event] || []).filter(item => item.caller !== caller || item.fn !== fn); }
  event(event, value) { for (const item of [...(this._events[event] || [])]) item.fn.call(item.caller, value); }
}
function fixture(t, { type = 2, read = 0, token = 'mail-key' } = {}) {
  const trace = [], scope = new ResourceScope(); t.after(() => scope.dispose());
  const mail = { mid: '1011', read, Geted: false, hasAttachMent: true, AttachmentType: type,
    attachment: { getStringKey: key => ({ id: [42], ctn: [1], key: [token] })[key] } };
  const proxy = new Events(), storage = new Map();
  const manager = Object.assign(new Events(), { proxy, systemMailList: [mail], friendMailList: [],
    ReadMail(id) { trace.push(['read', id]); const current = this.systemMailList.find(item => item.mid === id); current.read = 1; this.event('READ_MAIL_SUCCESS', current); },
    SendClientDbsGetgmawardReq(key, id, sender) { trace.push(['item', key, id, sender]); proxy.event('DbsClientGetgmawardRep', { Protocol: { mid: id, result: 0 } }); },
    DeleteMail() { throw Error('must not delete'); } });
  const gift = { proxy, SendMySingleGift(id, key, mid) { trace.push(['gift', id, key, mid]); proxy.event('ClientPickupgiftbagRep', { Protocol: { GiftID: id, mid, Result: 1 } }); } };
  const classes = { MailManager: manager, GiftManager: gift, TimerManager: { ServerDate: new Date(2026, 10, 14) } };
  const adapter = createNativeAdapter({ window: {}, game: { getClass: name => classes[name], getSelf: () => ({ ClientId: 41 }), getServerProxy: () => proxy } });
  const settings = { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, structuredClone(value)) };
  const make = () => createRewardsController({ adapter, settings, scope, timeout: 14, poll: 1 });
  const controller = make(); controller.options({ excludeRecruit: false, excludeCoupon: false, excludeTrial: false, automatic: true, sign: false, tasks: false, welfare: false, activities: false, codes: false });
  return { mail, proxy, manager, gift, adapter, controller, trace, storage, make, scope };
}
test('unread mail awaits native reading before claiming; reading is not counted as a reward', async t => {
  const f = fixture(t); await f.controller.run();
  assert.deepEqual(f.trace, [['read', '1011'], ['item', 'mail-key', '1011', '']]);
  assert.equal(f.controller.snapshot().confirmed, 1);
  assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].status, 'confirmed');
  await f.controller.run(); assert.equal(f.trace.length, 2);
});
test('raw item responses correlate mid and recognize success or already claimed without model mutation', async t => {
  for (const result of [0, 2]) {
    const f = fixture(t, { read: 1 });
    f.manager.SendClientDbsGetgmawardReq = (key, mid) => {
      f.proxy.event('DbsClientGetgmawardRep', { Protocol: { mid: 'other', result: 0 } });
      f.proxy.event('DbsClientGetgmawardRep', { Protocol: { mid, result } });
    };
    await f.controller.run(); assert.equal(f.controller.snapshot().confirmed, 1); assert.equal(f.mail.Geted, false);
  }
});
test('gift mail has a different success contract: result15 is already claimed; exact gift and mid required', async t => {
  const f = fixture(t, { type: 1, read: 1 }); const action = planRewards(f.adapter, { mail: true }).actions[0];
  const accept = action.confirmations[0].accept;
  assert.equal(accept({ Protocol: { mid: '1011', GiftID: 99, Result: 1 } }), false);
  assert.equal(accept({ Protocol: { mid: 'other', GiftID: 42, Result: 1 } }), false);
  assert.equal(accept({ Protocol: { mid: '1011', GiftID: 42, Result: 16 } }), false);
  f.gift.SendMySingleGift = (id, key, mid) => f.proxy.event('ClientPickupgiftbagRep', { Protocol: { mid, GiftID: id, Result: 15 } });
  await f.controller.run(); assert.equal(f.controller.snapshot().confirmed, 1);
});
test('explicit rejection displays its numeric reason and is not left as an unexplained timeout', async t => {
  const f = fixture(t, { read: 1 });
  f.manager.SendClientDbsGetgmawardReq = (key, mid) => f.proxy.event('DbsClientGetgmawardRep', { Protocol: { mid, result: 3 } });
  await f.controller.run(); assert.equal(f.controller.snapshot().confirmed, 0);
  assert.match(f.controller.snapshot().status, /1 项失败.*错误码 3/);
  assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].status, 'rejected');
});
test('legacy keyed pending mail is repaired once only after fresh matching read confirmation', async t => {
  const f = fixture(t);
  f.storage.set('account:41:attempts', { day: '2026-11-14', items: { 'mail:1011': { status: 'unconfirmed', at: 10 } } });
  await f.controller.run(); assert.equal(f.controller.snapshot().confirmed, 1);
  assert.deepEqual(f.trace.map(item => item[0]), ['read', 'item']);
  const records = f.storage.get('account:41:attempts').items;
  assert.equal(records['mail-legacy:1011:10'].priorStatus, 'unconfirmed'); assert.equal(records['mail-legacy:1011:10'].status, 'superseded');
  assert.equal(records['mail:1011'].flowVersion, 3); await f.make().run(); assert.equal(f.trace.length, 2);
});
test('a repair timeout persists the new version and never retries again across hot reloads', async t => {
  const f = fixture(t);
  f.storage.set('account:41:attempts', { day: '2026-11-14', items: { 'mail:1011': { status: 'pending', at: 10 } } });
  f.manager.SendClientDbsGetgmawardReq = (...args) => f.trace.push(['item', ...args]);
  await f.controller.run(); assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].status, 'unconfirmed');
  await f.make().run(); assert.deepEqual(f.trace.map(item => item[0]), ['read', 'item']);
});
test('old pending mails already reported received by the native model settle without another send', async t => {
  const f = fixture(t, { read: 1 }); f.mail.Geted = true;
  f.storage.set('account:41:attempts', { day: '2026-11-14', items: { 'mail:1011': { status: 'unconfirmed', at: 10 } } });
  await f.controller.run(); assert.deepEqual(f.trace, []);
  assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].status, 'confirmed'); assert.doesNotMatch(f.controller.snapshot().status, /暂未确认领取/);
});
test('keyless gift legacy intent cannot be repaired by inventing a new redemption', async t => {
  const f = fixture(t, { type: 1, read: 1, token: '' });
  f.storage.set('account:41:attempts', { day: '2026-11-14', items: { 'mail:1011': { status: 'unconfirmed', at: 10 } } });
  await f.controller.run(); assert.deepEqual(f.trace, []); assert.match(f.controller.snapshot().status, /暂未确认领取/);
});
test('one uncertain ReadMail blocks other reads from overwriting the native global readMailID', async t => {
  const f = fixture(t); f.manager.systemMailList.push({ ...f.mail, mid: '1012' });
  f.manager.ReadMail = id => { f.trace.push(['read', id]); f.manager.readMailID = id; };
  await f.controller.run(); assert.deepEqual(f.trace, [['read', '1011']]); assert.equal(f.manager.readMailID, '1011');
});
test('disposal while reading prevents any later attachment request', async t => {
  const f = fixture(t); f.manager.ReadMail = id => { f.trace.push(['read', id]); queueMicrotask(() => f.scope.dispose()); };
  await f.controller.run(); assert.deepEqual(f.trace, [['read', '1011']]);
});

test('already-read uncertain keyed item mail v2 refreshes read acknowledgement then repairs exactly once', async t => {
 const f=fixture(t,{read:1});
 f.storage.set('account:41:attempts',{day:'2026-11-14',items:{'mail:1011':{status:'unconfirmed',at:10,flowVersion:2}}});
 await f.controller.run();assert.deepEqual(f.trace.map(v=>v[0]),['read','item']);assert.equal(f.controller.snapshot().confirmed,1);
 assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].flowVersion,3);
 await f.make().run();assert.equal(f.trace.length,2);
});
test('repair of already-read mail awaits exact fresh read ACK, not the old read flag', async t => {
 const f=fixture(t,{read:1});f.manager.ReadMail=id=>{f.trace.push(['read',id]);f.manager.event('READ_MAIL_SUCCESS',{mid:'other'});};
 f.storage.set('account:41:attempts',{day:'2026-11-14',items:{'mail:1011':{status:'unconfirmed',at:10,flowVersion:2}}});
 await f.controller.run();assert.deepEqual(f.trace,[['read','1011']]);
});
test('v2 gift mail is never repaired by repeating potentially repeatable gift redemption', async t => {
 const f=fixture(t,{read:1,type:1});f.storage.set('account:41:attempts',{day:'2026-11-14',items:{'mail:1011':{status:'unconfirmed',at:10,flowVersion:2}}});
 await f.controller.run();assert.deepEqual(f.trace,[]);
});
test('v3 repair timeout stays protected across reloads', async t => {
 const f=fixture(t,{read:1});f.manager.SendClientDbsGetgmawardReq=(...args)=>f.trace.push(['item',...args]);
 f.storage.set('account:41:attempts',{day:'2026-11-14',items:{'mail:1011':{status:'unconfirmed',at:10,flowVersion:2}}});
 await f.controller.run();await f.make().run();assert.deepEqual(f.trace.map(v=>v[0]),['read','item']);assert.equal(f.storage.get('account:41:attempts').items['mail:1011'].flowVersion,3);
});
