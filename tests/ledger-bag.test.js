import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { couponAmounts, filterBag, enhanceBagView, findBagViews, createBagEnhancements } from '../src/plugins/ledger/bag.js';
const config = { sgs_config: { couponsys: { GRmb: { seting: [{ AID: 1, AVV: '7000-2000' }, { AID: 2, AVV: '1000-500' }] } } } };
const goods = (id, name = '抵价券', coupon = true) => ({ ID: id, BaseID: 1000 + id, Count: 1,
  baseInfo: { name, TypeID: coupon ? 98 : 1, usedeffect: 'GType-2;GRmb-1;UTime-1', sortindex: id } });
class Node {
  constructor(text = '') { this.text = text; this._children = []; this.events = {}; this.graphics = { clear() {}, drawLine() {}, drawCircle() {} }; this.visible = true; }
  size(width, height) { Object.assign(this, { width, height }); }
  pos(x, y) { Object.assign(this, { x, y }); }
  get textWidth() { return this.text.length * (this.fontSize || 11) / 2; }
  addChild(node) { node.parent = this; this._children.push(node); }
  on(type, caller, method) { (this.events[type] ||= []).push({ caller, method }); }
  off(type, caller, method) { this.events[type] = (this.events[type] || []).filter(h => h.caller !== caller || h.method !== method); }
  event(type, payload) { for (const h of [...(this.events[type] || [])]) h.method.call(h.caller, payload); }
  destroy() { this.destroyed = true; if (this.parent) this.parent._children = this.parent._children.filter(n => n !== this); this.parent = null; }
}
function fixture(rows = Array.from({ length: 7 }, (_, i) => goods(i + 1, i % 2 ? '普通道具' : '抵价券', i % 2 === 0))) {
  const scope = new ResourceScope(), stage = new Node(), owner = new Node(), themes = new Set(); stage.addChild(owner);
  owner.bagDatas = rows; owner.curPage = 1; owner.xNum = 2; owner.yNum = 1; owner.topSp = new Node(); owner.addChild(owner.topSp);
  owner.bags = Array.from({ length: 2 }, (_, i) => ({ width: 71, _x: i * 81, _y: 0, updateItem(row) { this.data = row; this.baseData = row?.baseInfo; this.id = row?.ID; }, Move(x, y) { this._x = x; this._y = y; } }));
  owner.updatePageIdx = function () { this.allPage = Math.max(1, Math.ceil(this.bagDatas.length / 2)); this.curPage = Math.min(this.allPage, Math.max(1, this.curPage)); };
  owner.showBags = function (rows) { this.bagDatas = rows || []; this.bagDatas.sort((a, b) => b.baseInfo.sortindex - a.baseInfo.sortindex); this.bags.forEach((slot, i) => slot.updateItem(this.bagDatas[(this.curPage - 1) * 2 + i])); };
  owner.updateRadioBtnData = function (rows) { this.curPage = 1; this.showBags(rows); this.updatePageIdx(); };
  owner.onAddBagItem = function (rows) { this.bagDatas.push(...rows); this.showBags(this.bagDatas); this.updatePageIdx(); };
  owner.onUpdateBagItem = function (row) { const i = this.bagDatas.findIndex(r => r.ID === row.ID); if (i >= 0) this.bagDatas[i] = row; };
  owner.onDelBagItem = function (id) { this.bagDatas.splice(this.bagDatas.findIndex(r => r.ID === id), 1); this.showBags(this.bagDatas); this.updatePageIdx(); };
  owner.showBags(rows);
  const gm = { _events: { add: [{ caller: owner, method: owner.onAddBagItem }], del: [{ caller: owner, method: owner.onDelBagItem }] } };
  const palette = { accent: '#dfb96c', text: '#ffffff', muted: '#aaaaaa', bg: '#222222' };
  const ctx = { scope, window: { Laya: { Sprite: Node, Text: Node, TextInput: Node, Event: { INPUT: 'input', KEY_DOWN: 'keydown', CLICK: 'click', FOCUS: 'focus', BLUR: 'blur', MOUSE_OVER: 'mouseover', MOUSE_OUT: 'mouseout' }, stage } },
    game: { getClass: () => gm, getServerProxy: () => null, getConfigData: () => config },
    ui: { nativeTheme: { palette, surface() {}, watch(fn) { themes.add(fn); fn(); return () => themes.delete(fn); } } } };
  return { ctx, scope, stage, owner, themes, gm };
}
test('coupon annotations use the official GRmb AID/AVV and never infer amounts from names', () => {
  assert.equal(couponAmounts(goods(1).baseInfo, config), '7000-2000');
  for (const base of [{ name: '7000减2000抵价券' }, { ...goods(1).baseInfo, TypeID: 1 }, { ...goods(1).baseInfo, usedeffect: 'GRmb-99' }]) assert.equal(couponAmounts(base, config), '');
  for (const avv of ['7000-', '0-1', '7000-0', '7e3-2000', '7000-2000-extra', '9007199254740992-1']) {
    assert.equal(couponAmounts(goods(1).baseInfo, { sgs_config: { couponsys: { GRmb: { seting: [{ AID: 1, AVV: avv }] } } } }), '');
  }
});
test('name search trims whitespace and ignores Latin case, including ItemName', () => {
  const rows = [goods(1, 'ABC道具'), { baseInfo: { ItemName: '周年抵价券' } }, {}];
  assert.deepEqual(filterBag(rows, ' aBc '), [rows[0]]); assert.deepEqual(filterBag(rows, '抵价券'), [rows[1]]); assert.equal(filterBag(rows, ''), rows);
});
test('search paginates filtered slots while retaining the complete native inventory', () => {
  const f = fixture(); const original = f.owner.showBags; const e = enhanceBagView(f.ctx, f.owner, () => config);
  e.input.text = '抵价券'; e.input.event('input');
  assert.equal(f.owner.bagDatas.length, 7); assert.equal(f.owner.allPage, 2);
  assert.deepEqual(f.owner.bags.map(s => s.data.ID), [7, 5]);
  f.owner.curPage++; f.owner.updatePageIdx(); f.owner.showBags(f.owner.bagDatas); assert.deepEqual(f.owner.bags.map(s => s.data.ID), [3, 1]);
  e.input.text = '无结果'; e.input.event('input'); assert.equal(f.owner.allPage, 1); assert.ok(f.owner.bags.every(s => !s.data));
  e.input.event('keydown', { keyCode: 27 }); assert.equal(f.owner.bagDatas.length, 7); assert.equal(f.owner.allPage, 4);
  e.dispose(); assert.equal(f.owner.showBags, original); assert.equal(f.themes.size, 0); f.scope.dispose();
});
test('native manager event identities, additions, deletions and category changes retain the active search', () => {
  const f = fixture(); const handler = f.gm._events.add[0].method; const e = enhanceBagView(f.ctx, f.owner, () => config);
  e.input.text = '抵价券'; e.input.event('input');
  assert.equal(f.owner.onAddBagItem, handler); assert.equal(f.gm._events.add[0].method, handler);
  f.gm._events.add[0].method.call(f.owner, [goods(8)]); e.refresh(); assert.equal(f.owner.bags[0].data.ID, 8); assert.equal(f.owner.bagDatas.length, 8);
  f.gm._events.del[0].method.call(f.owner, 8); e.refresh(); assert.equal(f.owner.bags[0].data.ID, 7);
  f.owner.updateRadioBtnData([goods(21, '普通道具', false)]); assert.ok(f.owner.bags.every(s => !s.data));
  e.button.event('click'); assert.equal(f.owner.bags[0].data.ID, 21);
  e.dispose(); assert.equal(f.gm._events.add[0].method, handler); f.scope.dispose();
});
test('reused slots remove coupon text, follow movement and leave native mouse targets intact', () => {
  const f = fixture(), e = enhanceBagView(f.ctx, f.owner, () => config), slot = f.owner.bags[0], badge = f.owner.topSp._children[0];
  assert.equal(badge.text, '7000-2000'); assert.equal(badge.mouseEnabled, false);
  slot.Move(110, 40); assert.equal(badge.y, 41); assert.equal(badge.x + badge.width, 181);
  slot.leftTimeBg = { visible: true }; e.refresh(); assert.equal(badge.y, 55);
  slot.updateItem(goods(99, '普通', false)); assert.equal(badge.visible, false);
  slot.updateItem(null); assert.equal(badge.visible, false);
  e.dispose(); assert.equal(f.owner.topSp._children.length, 0); f.scope.dispose();
});

test('later wrappers retain ownership and become transparent after enhancement disposal', () => {
  const f = fixture(), e = enhanceBagView(f.ctx, f.owner, () => config), wrapped = f.owner.showBags;
  const later = function (...args) { return wrapped.apply(this, args); }; f.owner.showBags = later;
  e.dispose(); assert.equal(f.owner.showBags, later);
  f.owner.showBags([goods(101)]); assert.equal(f.owner.bags[0].data.ID, 101); f.scope.dispose();
});

test('late coupon configuration after disposal cannot recreate annotations or listeners', async () => {
  const f = fixture(); let resolve;
  f.ctx.game.getConfigData = () => null; f.ctx.game.loadConfigData = () => new Promise(r => resolve = r);
  createBagEnhancements(f.ctx); assert.ok(f.owner.topSp._children.every(n => !n.visible));
  f.scope.dispose(); resolve(config); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.owner.topSp._children.length, 0); assert.equal(f.themes.size, 0);
});
test('closing/reopening and disposing enhancements release all owned nodes and wrappers', () => {
  const f = fixture(), original = f.owner.showBags; const runtime = createBagEnhancements(f.ctx);
  assert.equal(findBagViews(f.stage).length, 1); assert.notEqual(f.owner.showBags, original);
  f.owner.visible = false; runtime.tick(); assert.equal(f.owner.showBags, original); assert.equal(f.themes.size, 0);
  f.owner.visible = true; runtime.tick(); assert.notEqual(f.owner.showBags, original);
  f.scope.dispose(); assert.equal(f.owner.showBags, original); assert.equal(f.owner.topSp._children.length, 0); assert.equal(f.themes.size, 0);
});

test('inventory refresh detects consumption, new items and replacement while preserving native listeners', () => {
  const f = fixture(), original = f.owner.onUpdateBagItem, e = enhanceBagView(f.ctx, f.owner, () => config);
  f.owner.bagDatas[0].Count = 2; e.refresh(); assert.equal(f.owner.bags[0].data.Count, 2);
  f.owner.bagDatas.splice(0, 1); e.refresh(); assert.equal(f.owner.bags[0].data.ID, 6);
  f.owner.bagDatas.push(goods(99)); e.refresh(); assert.equal(f.owner.bags[0].data.ID, 99);
  e.input.text = '抵价券'; e.input.event('input');
  f.owner.bagDatas = [goods(100, '普通道具', false)]; e.refresh(); assert.ok(f.owner.bags.every(s => !s.data));
  f.owner.bagDatas.push(goods(101)); e.refresh(); assert.equal(f.owner.bags[0].data.ID, 101);
  assert.equal(f.owner.onUpdateBagItem, original); e.dispose(); f.scope.dispose();
});
