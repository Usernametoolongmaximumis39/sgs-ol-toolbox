import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginNative } from '../src/core/plugin-native.js';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { createNative } from '../src/plugins/ledger/native.js';
import { createController } from '../src/plugins/ledger/controller.js';
import { renderAlerts } from '../src/plugins/ledger/ui.js';
import { mountPluginUI } from '../src/ui/plugin-ui.js';
import { totals, filterRecords, createReconciler, importantItems, goodsDefinitions } from '../src/plugins/ledger/model.js';
const flush = () => new Promise(r => setTimeout(r, 15));
const goods = { root: { abbreviation: { field: [{ Short: 'a', Long: 'ID' }, { Short: 'b', Long: 'name' }] }, goodslist: { goods: [
  { a: 21223901, b: '传世玉玺' }, { a: 20260001, b: '祈福灯' }, { a: 21356801, b: '绘卷毛笔' }, { a: 21272501, b: '玉玺碎片' }, { a: 13411801, b: '如意结' }, { a: 13411901, b: '如意结' }, { a: 21337401, b: '秘钥' },
] } } };
function fixture(t, savedSettings = new Map()) {
  const dom = new JSDOM('', { url: 'https://game.test/' }), scope = new ResourceScope(), events = new Map(), db = new Map();
  const self = { ClientId: 41, NickName: '甲', YuanBao: 500, BindYuanBao: 0, FreeLimitYuanBaoNum: 0 }, gm = { selfBagFinished: true, goodsList: [{ ID: 9, BaseID: 21223901, Count: 100 }],
    GetGoodsByBaseID: () => null, GetGoodsNumByBaseID: id => id === 21223901 ? gm.goodsList[0].Count : 0 };
  const proxy = { on(k,c,f) { (events.get(k) || (events.set(k,[]),events.get(k))).push({ c,f }); },
    off(k,c,f) { events.set(k,(events.get(k)||[]).filter(r=>r.c!==c||r.f!==f)); } };
  const config = { sys_gs_dbs_fs_goodsbaseinfo: goods, ff_qifu_new: { root: { Common: [{ Id: 1, exgoodsid: 13411801 }, { Id: 2, exgoodsid: 13411901 }] } },
    ff_tiangong: { root: { Common: [{ Id: 4, Name: '周年龙珠', Itemid: '21277001,1' }] } } };
  const ctx = { settings: { get: (k, fallback) => structuredClone(savedSettings.has(k) ? savedSettings.get(k) : fallback), set: (k, v) => savedSettings.set(k, structuredClone(v)) }, window: dom.window, scope, reportError() {}, game: { getSelf: () => self, getClass: name => ({ GameGoodsManager: gm,
    NewBlessManager: { IsInDrawTime: () => true, GetInfoById() {} } })[name], getServerProxy: () => proxy,
    getConfigData: n => config[n], loadConfigData: async n => config[n] } };
  ctx.native = createPluginNative(ctx);
  const store = { async list(id) { await flush(); return [...db.values()].filter(r=>r.account===id).map(r=>structuredClone(r)); }, async put(row) { db.set(row.id, structuredClone(row)); } };
  const controller = createController(ctx, { store });
  t.after(()=>{scope.dispose();dom.window.close();});
  const emit = async (type, data) => { for (const r of [...(events.get(type)||[])]) r.f.call(r.c, { Protocol: data }); await flush(); };
  return { controller, emit, scope, self, gm, events, db, ctx, store };
}
test('gross income and consumption survive net zero, duplicate same-name IDs and exact filtering', () => {
  const records = [{at:10,kind:'goods',session:'x',items:[{id:1,name:'如意结',delta:100},{id:2,name:'如意结',delta:5}]}, {at:20,kind:'goods',session:'x',items:[{id:1,name:'如意结',delta:-100}]}];
  assert.deepEqual(totals(records).get(1),{income:100,expense:100}); assert.equal(totals(records).get(2).income,5);
  assert.equal(filterRecords(records,{from:15,item:'1'}).length,1); assert.equal(filterRecords(records,{session:'other'}).length,0);
  const defs=goodsDefinitions(goods); assert.equal(importantItems(defs,new Set()).filter(r=>r.name==='如意结').length,0);
  assert.equal(importantItems(defs,new Set([13411801,13411901])).filter(r=>r.name==='如意结').length,2);
});
test('hint/instance reconciliation supports both orders and retains repeated real same-stream transactions', () => {
  const r=createReconciler();const item=delta=>[{id:1,delta}];
  assert.equal(r.accept('hint',item(100),10,'a').items[0].delta,100); assert.equal(r.accept('instance',item(100),20,'b').items.length,0);
  assert.equal(r.accept('hint',item(100),30,'c').items[0].delta,100);
  r.reset();r.accept('instance',item(-100),10,'a');const hint=r.accept('hint',item(-100),20,'b');
  assert.deepEqual(hint.changes,[{recordId:'a',id:1,delta:-100}]);assert.equal(hint.items[0].delta,-100);
  assert.equal(r.accept('instance',item(-100),9000,'c').items[0].delta,-100);
});
test('background warnings render without constructing a ledger view', t => {
  const settings = new Map([
    ['balance:41', { 100016: { count: 10500, at: Date.now(), basis: 'all-yuanbao' } }],
  ]);
  const { controller, ctx } = fixture(t, settings);
  ctx.document = ctx.window.document;
  ctx.themes = { subscribe: () => () => {} };
  ctx.ui = mountPluginUI(ctx, () => ctx);
  t.mock.method(controller, 'view', () => assert.fail('Warning rendering must not read ledger history'));

  renderAlerts(ctx, controller);
  const alert = ctx.document.querySelector('[role="alertdialog"]');
  assert.equal(alert.hidden, false);
  assert.match(alert.textContent, /元宝较上次在线减少 10000/);
  controller.dismissAlerts();
  assert.equal(alert.hidden, true);
});
test('controller baseline, gross currency, instance zero/delete and two-order deduplication', async t => {
  const f=fixture(t),c=f.controller; await c.load();await flush();assert.equal(c.view().records.length,0);
  await f.emit('DbsCUpdatauserYaunbaoNtf',{ChangeYB:100});await f.emit('DbsCUpdatauserYaunbaoNtf',{ChangeYB:-100});
  assert.deepEqual(totals(c.view().records).get(100016),{income:100,expense:100});
  await f.emit('DbsCcUpdategoodsAttribNtf',{GoodsID:9,Count:0});
  await f.emit('DbsCcUserGoodshintNtf',{Type:8,GoodsList:[{GoodsBaseID:21223901,ChangeCount:-100}]});
  assert.deepEqual(totals(c.view().records).get(21223901),{income:0,expense:100});
  await f.emit('DbsCcUserGoodshintNtf',{Type:8,GoodsList:[{GoodsBaseID:21223901,ChangeCount:30}]});
  await f.emit('DbsCcUpdategoodsAttribNtf',{GoodsID:9,Count:30});
  assert.equal(totals(c.view().records).get(21223901).income,30);
  await f.emit('DbsCcUserDelgoodsNtf',{Result:2,DelList:[{PropID:9}]});assert.equal(totals(c.view().records).get(21223901).expense,100);
  await f.emit('DbsCcUserDelgoodsNtf',{Result:1,DelList:[{PropID:9}]});assert.equal(totals(c.view().records).get(21223901).expense,130);
});
test('ledger tracks the main jade seal ID and ignores same-name historical exchanges', async t => {
  const now = Date.now();
  const exchanges = [{ id: 1620301, name: '传世玉玺', delta: 3 }, { id: 1630701, name: '物品 1630701', delta: 1 }];
  const seal = { id: 21223901, name: '传世玉玺', delta: 2 };
  const shards = { id: 21272501, name: '玉玺碎片', delta: 4 };
  const settings = new Map([['balance:41', { 1620301: { count: 0, at: now }, 1630701: { count: 0, at: now } }]]);
  const f = fixture(t, settings), c = f.controller;
  const base = { account: '41', session: c.view().session.id, at: now };
  f.db.set('exchange', { ...base, id: 'exchange', kind: 'goods', items: [exchanges[0]] });
  f.db.set('mixed', { ...base, id: 'mixed', kind: 'goods', items: [exchanges[1], seal, shards] });
  f.db.set('prayer', { ...base, id: 'prayer', kind: 'prayer', items: [], rewards: [seal, exchanges[0]],
    prayer: { secId: 4, times: 1, matched: true, name: '周年龙珠' } });

  const hint = (type, items) => f.emit('DbsCcUserGoodshintNtf', {
    Type: type, GoodsList: items.map(({ id, delta }) => ({ GoodsBaseID: id, ChangeCount: delta })),
  });
  await hint(2010, exchanges);
  assert.equal(f.db.size, 3);
  assert.ok(exchanges.every(({ id }) => !(id in settings.get('balance:41'))));

  const load = f.ctx.game.loadConfigData;
  f.ctx.game.loadConfigData = async name => name === 'sys_gs_dbs_fs_goodsbaseinfo' ? { root: {
    ...goods.root, goodslist: { goods: [...goods.root.goodslist.goods, ...exchanges.map(({ id }) => ({ a: id, b: '传世玉玺' }))] },
  } } : load(name);
  await c.load();
  const view = c.view();
  assert.deepEqual(view.items.filter(item => item.name === seal.name).map(item => item.ID), [seal.id]);
  assert.deepEqual(view.records.map(row => row.id), ['mixed', 'prayer']);
  assert.deepEqual(view.records[0].items, [seal, shards]);
  assert.deepEqual(view.records[1].rewards, [seal]);
  assert.deepEqual(f.db.get('mixed').items, [exchanges[1], seal, shards]);

  await f.emit('DbsCcUserGoodslistRep', { GoodsList: [{ ID: 31, BaseID: 1620301, Count: 2 }] });
  await f.emit('DbsCcUpdategoodsAttribNtf', { GoodsID: 31, Count: 1 });
  await f.emit('DbsCcUserDelgoodsNtf', { Result: 1, DelList: [{ PropID: 31 }] });
  assert.equal(f.db.size, 3);
  await hint(8, [seal, ...exchanges, shards]);
  assert.deepEqual([...f.db.values()].at(-1).items, [seal, shards]);
  assert.equal(c.view().items.find(row => row.ID === seal.id).income, 4);
});
test('protobuf prayer success, failed response, rewards first/last, and ambiguous batches remain explicit', async t => {
  const f=fixture(t),c=f.controller;await c.load();
  const hint=()=>f.emit('DbsCcUserGoodshintNtf',{Type:2010,GoodsList:[{GoodsBaseID:21223901,ChangeCount:2}]});
  const reply=(result=0)=>f.emit('decodeClientSecretExploreRep',{Data:{ProtoObj:{secId:4,times:50,result}}});
  await hint();await reply();assert.equal(c.view().prayers[0].times,50);assert.equal(c.view().prayers[0].rewards.get(21223901).delta,2);
  await reply();await hint();assert.equal(c.view().prayers[0].times,100);assert.equal(c.view().prayers[0].rewards.get(21223901).delta,4);
  await reply(7);assert.equal(c.view().prayers[0].times,100);
  await reply();await reply();await hint();assert.equal(c.view().prayers[0].pending,2);assert.equal(c.view().unmatched.length,1);
});
test('account isolation, queued old-account messages, persistence load race and listener disposal', async t => {
  const f=fixture(t),c=f.controller;await f.emit('DbsCUpdatauserYaunbaoNtf',{ChangeYB:100});assert.equal(c.view().records.length,1);
  f.self.ClientId=42;assert.equal(c.view().records.length,0);assert.equal(c.view().items[0].count,null);assert.equal(c.view().items.find(i=>i.ID===21223901).count,null);await flush();
  await f.emit('DbsCUpdatauserYaunbaoNtf',{ChangeYB:7});assert.equal(totals(c.view().records).get(100016).income,7);
  f.self.ClientId=41;c.view();await flush();assert.equal(totals(c.view().records).get(100016).income,100);
  f.scope.dispose();assert.ok([...f.events.values()].every(a=>a.length===0));
});

test('only active blessing activities with unexpired knots enter the balance list', t => {
  const f=fixture(t);let drawing=true;const knots=[{ID:31,BaseID:13411801,Count:2,Expirydate:Math.floor(Date.now()/1000)+86400},{ID:32,BaseID:13411901,Count:3}];
  const gm={selfBagFinished:true,goodsList:knots,GetGoodsNumByBaseID:id=>knots.find(r=>r.BaseID===id)?.Count||0,GetGoodsByBaseID:id=>knots.find(r=>r.BaseID===id)};
  const fmt=at=>new Date(at+8*3600000).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T',' ');
  const end=Math.floor(Date.now()/1000)*1000+3600000, duration3=fmt(end-7200000)+','+fmt(end);
  let first=false;
  const original=f.ctx.game.getClass;f.ctx.game.getClass=name=>name==='GameGoodsManager'?gm:name==='NewBlessManager'?{IsInDrawTime:id=>drawing&&(first||id===2),GetInfoById:()=>({duration3})}:original(name);
  const n=createNative(f.ctx,()=>{},()=>{}),config=f.ctx.game.getConfigData('ff_qifu_new'),defs=goodsDefinitions(goods);
  assert.deepEqual([...n.knots(config).active],[13411901]);
  assert.equal(n.knots(config).expires.get(13411901),end+1000);
  first=true;assert.deepEqual([...n.knots(config).active].sort(),[13411801,13411901]);
  drawing=false;assert.equal(n.knots(config,defs).active.size,0);
  drawing=true;knots[0].Expirydate=1;assert.deepEqual([...n.knots(config,defs).active],[13411901]);
});

test('twelve decoded draw replies are attributed to their dragon ball and paired with each reward', async t => {
 const f=fixture(t);await f.controller.load();
 for(let i=0;i<12;i++) {
  await f.emit('decodeClientSecretExploreRep',{Data:{ProtoObj:{secId:4,times:1,result:0}}});
  await f.emit('DbsCcUserGoodshintNtf',{Type:2010,GoodsList:[{GoodsBaseID:21223901,ChangeCount:1}]});
 }
 const v=f.controller.view();assert.equal(v.prayers.length,1);assert.equal(v.prayers[0].times,12);
 assert.equal(v.prayers[0].name,'周年龙珠');assert.equal(v.prayers[0].itemId,21277001);
 assert.equal(v.unmatched.length,0);assert.equal(totals(v.records).get(21223901).income,12);
});

test('login warning compares last online balance once, persists latest and isolates accounts', async t => {
 const settings = new Map([['balance:41', {'100016': {count: 700, at: Date.now(), basis: 'all-yuanbao'}, '21223901': {count: 120, at: Date.now()}, '21272501': {count: 0, at: Date.now()}}], ['threshold:41:100016', 200], ['threshold:41:21223901', 21]]);
 const f=fixture(t,settings),c=f.controller;
 assert.equal(c.view().alerts.length,1); assert.equal(c.view().items[0].comparison.delta,-200);
 assert.equal(settings.get('balance:41')['100016'].count,500);
 c.dismissAlerts();c.view();assert.equal(c.view().alerts.length,0);
 assert.equal(c.setThreshold(21223901,20),true);assert.equal(c.view().alerts.length,1);
 c.dismissAlerts();c.setThreshold(21223901,1);assert.equal(c.view().alerts.length,0);
 assert.equal(c.setThreshold(21223901,-1),false);assert.equal(c.setThreshold(21223901,1.55),false);
 f.self.YuanBao=450;c.view();assert.equal(settings.get('balance:41')['100016'].count,450);
 await f.emit('ClientLoginRep',{userID:41});assert.equal(c.view().items[0].count,null);
 f.self.YuanBao=250;await f.emit('DbsCcUserGoodslistRep',{GoodsList:[]});
 assert.equal(c.view().items[0].count,null);
 await new Promise(resolve=>setTimeout(resolve,2100));
 assert.equal(c.view().items[0].comparison.delta,-200);assert.equal(c.view().alerts.length,1);
 f.self.ClientId=42;assert.equal(c.view().alerts.length,0);assert.equal(c.view().items[0].comparison,null);
});

test('login partial wallet cannot trigger a warning or overwrite the saved balance', async t => {
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const settings=new Map([['balance:41',{'100016':{count:205199,at:now,basis:'all-yuanbao'}}]]);
 const f=fixture(t,settings),c=f.controller;
 f.self.YuanBao=196847;f.self.BindYuanBao=8352;c.view();
 await f.emit('ClientLoginRep',{userID:41});
 f.self.YuanBao=0;await f.emit('DbsCcUserGoodslistRep',{GoodsList:[]});
 assert.equal(c.view().items[0].count,null);assert.equal(c.view().alerts.length,0);
 assert.equal(settings.get('balance:41')[100016].count,205199);
 now+=1000;await f.emit('DbsCUpdatauserYaunbaoNtf',{ChangeYB:0});
 assert.equal(c.view().items[0].count,null);
 f.self.YuanBao=196847;now+=1000;c.view();now+=2001;
 assert.equal(c.view().items[0].count,205199);assert.equal(c.view().items[0].comparison.delta,0);
 assert.equal(c.view().alerts.length,0);assert.equal(c.view().items[0].expense,0);
});
test('unknown quantity preserves prior balance; fresh install establishes baseline without warning', t => {
 const f=fixture(t);assert.equal(f.controller.view().alerts.length,0);assert.equal(f.controller.view().items[0].comparison,null);
 f.gm.selfBagFinished=false;f.controller.view();assert.equal(f.ctx.settings.get('balance:41',{})['21223901'].count,100);
});

test('seven day freshness, shard conversion and combined threshold', t => {
 const now=Date.now();const saved=(age)=>new Map([['balance:41',{'21223901':{count:100,at:now-age},'21272501':{count:20,at:now-age}}],['threshold:41:21223901',2]]);
 const recent=fixture(t,saved(6*86400000));assert.equal(recent.controller.view().jadeComparison.delta,-2);assert.equal(recent.controller.view().alerts.length,1);
 assert.equal(recent.controller.setThreshold(21272501,1),false);assert.equal(recent.controller.setThreshold(21223901,0.1),true);
 const stale=fixture(t,saved(7*86400000+1000));assert.equal(stale.controller.view().alerts.length,0);
});
test('yuanbao total includes bound and time-limited, unknown component stays unknown', t => {
 const f=fixture(t);f.self.BindYuanBao=120;f.self.FreeLimitYuanBaoNum=30;
 assert.equal(f.controller.view().items[0].count,650);
 f.self.YuanBao-=50;f.self.BindYuanBao+=50;assert.equal(f.controller.view().items[0].count,650);
 delete f.self.FreeLimitYuanBaoNum;assert.equal(f.controller.view().items[0].count,null);
});
test('legacy normal-yuanbao baseline is not compared as total; unchanged balances refresh last seen', t => {
 const f=fixture(t,new Map([['balance:41',{'100016':{count:1000,at:Date.now()},'21223901':{count:100,at:1}}],['threshold:41:100016',1]]));
 assert.equal(f.controller.view().alerts.length,0);assert.equal(f.controller.view().items[0].comparison,null);
 assert.ok(f.ctx.settings.get('balance:41',{})['21223901'].at>1);
});

test('alert allowlist ignores legacy knot thresholds while retaining inventory and ledger', async t => {
 const now=Date.now(), settings=new Map([['balance:41',{'13411801':{count:100,at:now},'13411901':{count:20,at:now}}],['threshold:41:13411801',1],['threshold:41:13411901',1]]);
 const f=fixture(t,settings), c=f.controller;
 assert.equal(c.view().alerts.length,0);assert.equal(c.setThreshold(13411801,1),false);assert.equal(c.setThreshold(13411901,1),false);assert.equal(c.setThreshold(999,1),false);
 assert.equal(c.view().items.filter(row=>row.name==='如意结').length,2);
 await f.emit('DbsCcUserGoodshintNtf',{Type:8,GoodsList:[{GoodsBaseID:13411801,ChangeCount:-10}]});
 assert.equal(totals(c.view().records).get(13411801).expense,10);assert.equal(c.view().alerts.length,0);
 assert.equal(c.setThreshold(21356801,10),true);assert.equal(c.setThreshold(21337401,10),true);
});

test('five alert defaults preserve explicit zero/custom values and lamp alerts at default boundary', t => {
 const now=Date.now();const f=fixture(t,new Map([['balance:41',{'20260001':{count:30,at:now}}]]));
 const values=new Map(f.controller.view().items.map(row=>[row.name,row.threshold]));
 assert.equal(values.get('元宝'),5000);assert.equal(values.get('传世玉玺'),10);assert.equal(values.get('祈福灯'),30);assert.equal(values.get('绘卷毛笔'),50);assert.equal(values.get('秘钥'),50);
 assert.equal(f.controller.view().alerts.length,1);assert.match(f.controller.view().alerts[0],/祈福灯.*减少 30/);
 assert.equal(f.controller.setThreshold(20260001,0),true);assert.equal(f.controller.view().items.find(row=>row.name==='祈福灯').threshold,0);
 const custom=fixture(t,new Map([['threshold:41:100016',0],['threshold:41:20260001',77]]));
 assert.equal(custom.controller.view().items[0].threshold,0);assert.equal(custom.controller.view().items.find(row=>row.name==='祈福灯').threshold,77);
});

test('cold page configuration waits for native readiness and recovers without mounting information panel', async t => {
  const f = fixture(t), reports = [], timers = [];
  f.ctx.reportError = value => reports.push(value);
  f.ctx.scope.timeout = (fn, ms) => { timers.push(fn); return timers.length; };
  let ready = false, calls = 0;
  const original = f.ctx.game.loadConfigData;
  f.ctx.game.loadConfigData = async name => { calls++; if (!ready) throw new Error('等待游戏配置解码器就绪'); return original(name); };
  await f.controller.load();
  assert.equal(f.controller.view().error, ''); assert.equal(timers.length, 1);
  assert.ok(reports.every(value => !value));
  ready = true; timers.shift()(); await flush();
  assert.equal(calls, 6); assert.equal(f.controller.view().error, '');
  assert.equal(f.controller.view().items.find(i => i.ID === 21223901).name, '传世玉玺');
  await f.controller.load(); assert.equal(calls, 6);
});

test('configuration corruption is reported and disposal cancels readiness retries', async t => {
  const f = fixture(t), timers = [];
  f.ctx.scope.timeout = fn => { timers.push(fn); return timers.length; };
  f.ctx.game.loadConfigData = async () => { throw new Error('游戏配置内容无效'); };
  await f.controller.load(); assert.match(f.controller.view().error, /游戏配置内容无效/); assert.equal(timers.length, 0);
  let calls = 0;
  f.ctx.game.loadConfigData = async () => { calls++; throw new Error('等待客户端资源版本就绪，请稍后刷新'); };
  await f.controller.load(); assert.equal(timers.length, 1); assert.equal(f.controller.view().error, '');
  f.scope.dispose(); timers.shift()(); await flush(); assert.equal(calls, 3);
});
