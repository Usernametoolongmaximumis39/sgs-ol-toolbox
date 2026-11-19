import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import skins from '../src/plugins/skins/index.js';
import { readCatalogue, readInventory, collectSkins, summarizeSkins, filterSkins } from '../src/plugins/skins/model.js';
import { createSkinCollection, resolveSkinRuntime } from '../src/plugins/skins/runtime.js';
import { ResourceScope } from '../src/core/resources.js';
import { createLocalSkins } from '../src/plugins/skins/local.js';

const config = { root: { manu: { item: [
  { skinID: 10101, name: '千里单骑', skinlevel: '0,3' },
  { skinID: 10201, name: '勇冠三军', skinlevel: '0,1' },
  { skinID: 10301, name: '未知品质', skinlevel: 'new' },
] } } };
function harness() {
  const dom = new JSDOM('<main></main>', { url: 'https://web.sanguosha.com' });
  const scope = new ResourceScope(), values = new Map();
  const source = { self: { ClientId: 1001 }, goods: { selfBagFinished: true }, config,
    inventory: new Map([[10101, [{ ID: 11, Count: 1, IsUpgrade: 1, IsForever: true }, { ID: 12, Count: 2, IsUpgrade: 0, IsForever: false }]]]), reads: 0, loads: 0 };
  source.skin = { GetSkinListBySkinID(id) { source.reads++; return source.inventory.get(id) || []; } };
  const proxy = { _events: { ClientSkinFromRep: { caller: source.skin }, DbsCcMovegoodsRep: [{ caller: source.goods }] } };
  let panel, cleanup;
  const game = { getSelf: () => source.self, getClass: () => null, getServerProxy: () => proxy,
    getConfigData: () => source.config, loadConfigData: async () => { source.loads++; return config; } };
  const settings = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) };
  const ctx = { window: dom.window, document: dom.window.document, scope, game, settings,
    ui: { nativeTheme: { watch(fn) { fn({text:'#eee',surface:'#222',border:'#555',accent:'#ca8'}); return scope.add(() => {}); } }, registerPanel(spec) { panel = spec; const off = () => { cleanup?.(); }; scope.add(off); return off; } } };
  return { ctx, source, proxy, scope, game, settings, dom,
    render() { cleanup = panel.render(dom.window.document.querySelector('main')); return dom.window.document.querySelector('main'); },
    unmount() { cleanup?.(); cleanup = null; }, close() { scope.dispose(); dom.window.close(); } };
}

test('skin catalogue preserves unknown quality and drops duplicate/invalid IDs without inventing missing inventory', () => {
  assert.equal(readCatalogue(null).ready, false);
  assert.equal(readCatalogue({ root: { manu: { item: [] } } }).ready, false);
  const result = readCatalogue({ root: { manu: { item: [...config.root.manu.item, { skinID: 10101 }, { skinID: -1 }] } } });
  assert.equal(result.excluded, 2);
  assert.equal(result.rows[0].qualityName, '传说');
  assert.equal(result.rows[2].quality, null);
});

test('skin ownership sums distinct inventory stacks, retains temporary and upgrade states, treats malformed counts as unknown', () => {
  const entry = { ID: 1, Count: 2, IsUpgrade: 0, IsForever: true };
  assert.deepEqual(readInventory([entry, entry, { ID: 2, Count: 1, IsUpgrade: 1, IsForever: false }]), { count: 3, owned: true, upgrade: true, temporary: true });
  assert.equal(readInventory([{ Count: 0 }]).owned, false);
  assert.equal(readInventory([{ Count: 1 }]).upgrade, null);
  assert.equal(readInventory([{ Count: 1 }, { Count: -1 }]).owned, null);
  assert.equal(readInventory(undefined).owned, null);
  assert.equal(readInventory([]).owned, false);
});

test('skin filters preserve unknown rows and quantity summary rather than treating errors as unowned', () => {
  const rows = collectSkins(readCatalogue(config).rows, id => {
    if (id === 10101) return [{ Count: 2, IsUpgrade: 1 }];
    if (id === 10301) throw Error('inventory unavailable');
    return [];
  });
  assert.deepEqual(summarizeSkins(rows), { total: 3, owned: 1, missing: 1, unknown: 1, quantity: 2, upgraded: 1 });
  assert.deepEqual(filterSkins(rows, { ownership: 'missing' }).map(row => row.skinId), [10201]);
  assert.equal(filterSkins(rows, { query: '千里', quality: '3' }).length, 1);
  assert.equal(filterSkins(rows, { ownership: 'unknown' })[0].skinId, 10301);
  assert.equal(filterSkins(rows, { sort: 'quality' })[0].skinId, 10101);
});

test('skin runtime resolves existing event callers and never calls singleton factories/getters', () => {
  const h = harness();
  let factories = 0;
  class Trap { static get instance() { factories++; throw Error('instantiate'); } static I() { factories++; } }
  h.game.getClass = () => Trap;
  try {
    assert.equal(resolveSkinRuntime(h.game).ready, true);
    assert.equal(factories, 0);
    h.source.goods.selfBagFinished = false;
    assert.match(resolveSkinRuntime(h.game).message, /尚未加载完成/);
    h.source.self = null;
    assert.equal(resolveSkinRuntime(h.game).accountId, null);
  } finally { h.close(); }
});

test('skin collection does not read incomplete bags or publish a false zero-owned result', async () => {
  const h = harness();
  try {
    const collection = createSkinCollection(h.ctx);
    h.source.goods.selfBagFinished = false;
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'waiting');
    assert.equal(h.source.reads, 0);
    assert.deepEqual(collection.getSnapshot().rows, []);
    h.source.goods.selfBagFinished = true;
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'ready');
    assert.equal(collection.getSnapshot().rows[0].count, 3);
    h.source.self = { ClientId: 2002 };
    collection.checkIdentity();
    assert.deepEqual(collection.getSnapshot().rows, []);
    assert.equal(collection.getSnapshot().accountId, '2002');
  } finally { h.close(); }
});

test('skin late config response cannot publish prior-account inventory or act after uninstall', async () => {
  const h = harness();
  let finish;
  h.source.config = null;
  h.game.loadConfigData = () => new Promise(resolve => { finish = resolve; });
  try {
    const collection = createSkinCollection(h.ctx), pending = collection.refresh();
    h.source.self = { ClientId: 2002 };
    finish(config); await pending;
    assert.equal(collection.getSnapshot().status, 'waiting');
    assert.equal(h.source.reads, 0);
    const second = collection.refresh();
    h.scope.dispose(); finish(config); await second;
    assert.equal(collection.getSnapshot().status, 'stopped');
    assert.equal(h.source.reads, 0);
  } finally { h.close(); }
});

test('skin config failure is shown without stale totals and repeated refresh recovers', async () => {
  const h = harness();
  try {
    const collection = createSkinCollection(h.ctx);
    await collection.refresh();
    h.source.config = null;
    h.game.loadConfigData = async () => { throw Error('配置格式错误'); };
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'error');
    assert.deepEqual(collection.getSnapshot().rows, []);
    h.source.config = config;
    await collection.refresh();
    assert.equal(collection.getSnapshot().rows.length, 3);
  } finally { h.close(); }
});

test('skin tools panel has independent persisted switches and does not read inventory on mount', () => {
  const h = harness();
  try {
    skins.activate(h.ctx);
    assert.deepEqual(skins.manifest.categories, ['tools']);
    const switches = () => [...h.dom.window.document.querySelectorAll('[role=switch]')];
    h.render();
    assert.deepEqual(switches().map(input => input.checked), [true, true, true, false, false, false, false]);
    switches()[1].click();
    switches()[0].click();
    assert.deepEqual(switches().slice(0, 3).map(input => [input.checked, input.disabled]), [[false, false], [false, true], [true, true]]);
    h.unmount(); h.render();
    switches()[0].click();
    assert.deepEqual(switches().slice(0, 3).map(input => input.checked), [true, false, true]);
    assert.equal(h.source.loads, 0);
    assert.equal(h.source.reads, 0);
    h.scope.dispose();
  } finally { h.close(); }
});

test('local skin selection and automatic animation are independent and preserve the native seat model', () => {
  const h = harness(), calls = [];
  function seatUI(index, isSelf) {
    const General = { SkinId: 0, IsDynamic: false, DySkinType: 1, CardName: isSelf ? '张辽' : '曹操' };
    return { seat: { Index: index, General, IsSelf: isSelf, IsFull: true, GeneralId: 101,
      SetGeneralSkin() { assert.fail('seat model must be untouched'); } },
    seatAvatar: { generalCard: General, skinItemID: 0, SetSkin(id) {
      calls.push([index, id, this.generalCard.IsDynamic]);
      this.generalCard.JueXingState = 2;
      this.skinItemID = id;
      this.skeleton = this.generalCard.IsDynamic ? {} : null;
    } } };
  }
  const mine = seatUI(0, true), opponent = seatUI(1, false);
  mine.seat.General.SkinId = mine.seatAvatar.skinItemID = 10101;
  opponent.seat.General2Id = 102; opponent.seat.General2 = { CardName: '未亮武将' };
  opponent.seat.IsFaceUp = index => index === 0;
  const scene = {};
  h.game.getSeatUIs = () => [mine, opponent];
  h.game.getSelfSeatUI = () => mine;
  h.game.getScene = () => scene;
  h.game.isInGame = () => true;
  h.source.skin.GetOnlineSKinList = () => [
    { skinID: 10101, skinname: '已有皮肤', SeatAnimateUrl: 'res/owned.sk' },
    { skinID: 10102, skinname: '未有皮肤', SeatAnimateUrl: 'res/unowned.sk' },
  ];
  try {
    const local = createLocalSkins(h.ctx);
    const [self, other] = local.refresh();
    assert.equal(local.refresh().length, 2);
    assert.deepEqual(local.options(self), []);
    h.settings.set('unlockDynamic', true);
    local.refresh(); local.refresh();
    assert.deepEqual(calls, [[0, 10101, true]]);
    assert.equal(h.source.reads, 0);
    assert.equal(local.has(self), false);
    assert.deepEqual(local.options(self), []);
    assert.throws(() => local.select(self, 10102), /不可用/);
    mine.seatAvatar.SetSkin(10101);
    delete self.general.JueXingState;
    local.refresh();
    assert.deepEqual(calls.slice(-2), [[0, 10101, false], [0, 10101, true]]);
    h.settings.set('unlockSkin', true);
    assert.deepEqual(local.options(self).map(x => [x.id, x.owned]), [[0, true], [10101, true], [10102, false]]);
    h.source.goods.selfBagFinished = false;
    assert.equal(local.options(self)[2].owned, null);
    h.source.goods.selfBagFinished = true;
    assert.equal(local.select(self, 10102).owned, false);
    assert.equal(self.avatar.skinItemID, 10102);
    assert.ok(self.avatar.skeleton);
    assert.equal(self.avatar.generalCard, self.general);
    assert.equal(self.general.IsDynamic, false);
    assert.equal(self.general.SkinId, 10101);
    assert.equal(self.general.JueXingState, undefined);
    assert.equal(other.avatar.skinItemID, 0);
    h.settings.set('unlockDynamic', false); local.refresh();
    assert.equal(self.avatar.skinItemID, 10102);
    assert.equal(self.avatar.skeleton, null);
    h.settings.set('unlockDynamic', true); local.refresh();
    assert.ok(self.avatar.skeleton);
    h.settings.set('unlockSkin', false); local.refresh();
    assert.equal(self.avatar.skinItemID, 10101);
    assert.ok(self.avatar.skeleton);
    mine.seat.General.SkinId = 10102;
    mine.seatAvatar.SetSkin(10102);
    local.refresh();
    assert.deepEqual(calls.slice(-2), [[0, 10102, false], [0, 10102, true]]);
    assert.equal(self.general.IsDynamic, false);
    h.settings.set('otherPlayers', true);
    local.select(other, 10102);
    assert.ok(other.avatar.skeleton);
    other.general.SkinId = 10103; other.avatar.skinItemID = 10103;
    h.scope.dispose();
    assert.deepEqual(calls.slice(-2), [[1, 10102, true], [0, 10102, false]]);
    assert.equal(self.avatar.skeleton, null);
    assert.equal(other.avatar.skinItemID, 10103);
  } finally { h.close(); }
});

test('skin batched collection stops immediately after scope is disposed', async () => {
  const h = harness();
  h.source.config = { root: { manu: { item: Array.from({ length: 500 }, (_, index) => ({ skinID: 50001 + index, name: '皮肤', skinlevel: '0,1' })) } } };
  try {
    const collection = createSkinCollection(h.ctx), pending = collection.refresh();
    assert.equal(h.source.reads, 160);
    h.scope.dispose(); await pending;
    assert.equal(h.source.reads, 160);
    assert.equal(collection.getSnapshot().status, 'stopped');
  } finally { h.close(); }
});
