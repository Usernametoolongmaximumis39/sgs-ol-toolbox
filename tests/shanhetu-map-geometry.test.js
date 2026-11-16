import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMapGeometry } from '../src/plugins/shanhetu/map-geometry.js';

function fixture() {
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  const sprite = (parent, x, y, width, height, extra = {}) => ({
    parent, x, y, width, height, scaleX: 1, scaleY: 1,
    localToGlobal(p) {
      const q = { x: this.x + p.x * this.scaleX, y: this.y + p.y * this.scaleY };
      return this.parent?.localToGlobal ? this.parent.localToGlobal(q) : q;
    },
    globalToLocal(p) {
      const q = this.parent?.globalToLocal ? this.parent.globalToLocal(p) : p;
      return { x: (q.x - this.x) / this.scaleX, y: (q.y - this.y) / this.scaleY };
    }, ...extra,
  });
  const stage = sprite(null, 0, 0, 1200, 850);
  const scene = sprite(stage, 0, 0, 1200, 850);
  const cityView = scene.cityView = sprite(scene, 50, 80, 1100, 700);
  const cities = new Map();
  cityView.GetCityItemById = id => cities.get(id);
  cityView.cityItemDic = { forEach(fn) { cities.forEach((value, key) => fn(key, value)); } };
  const makeCity = (id, x, y, extra = {}) => {
    const city = sprite(cityView, x, y, 120, 80, { HasEvent: true, ...extra });
    city.cityImg = { render: city, renderX: 0, renderY: 0, renderWidth: 120, renderHeight: 80 };
    cities.set(id, city); return city;
  };
  const ctx = { window: { Laya: { stage, Point } } };
  return { ctx, scene, cityView, cities, sprite, makeCity };
}
const has = (rects, expected) => rects.some(r => JSON.stringify(r) === JSON.stringify(expected));

test('native dictionary protects active cities without cards and camp nodes, using fixed artwork geometry', () => {
  const f = fixture();
  const first = f.makeCity(101, 100, 160);
  // Animated child bounds must never expand or move fixed building footprints.
  first.getSelfBounds = () => ({ x: -1000, y: -1000, width: 3000, height: 3000 });
  f.makeCity(102, 480, 300);
  f.makeCity(103, 700, 400);
  const g = collectMapGeometry(f.ctx, f.scene, [{ id: 101, type: 'fight' }, { id: 102, type: 'camp' }]);
  assert.equal(g.anchors.length, 1);
  assert.equal(g.anchors[0].node.id, 101);
  for (const r of [{ x: 100, y: 160, w: 120, h: 80 }, { x: 480, y: 300, w: 120, h: 80 }, { x: 700, y: 400, w: 120, h: 80 }]) {
    assert.ok(has(g.protectedBuildings, r));
  }
  assert.equal(g.protectedBuildings.length, 3, 'no fabricated 64px head where the native client has none');
});

test('real player marker landing space is protected at every reachable city and stable during movement', () => {
  const f = fixture();
  const a = f.makeCity(101, 100, 160), b = f.makeCity(102, 480, 300);
  const inactive = f.makeCity(103, 700, 400, { HasEvent: false });
  a.PosXCenter = 160; b.PosXCenter = 540; inactive.PosXCenter = 760;
  f.cityView.playerPoint = f.sprite(f.cityView, 132, 84, 56, 76);
  const nodes = [{ id: 101, type: 'fight' }, { id: 102, type: 'camp' }];
  const before = collectMapGeometry(f.ctx, f.scene, nodes);
  assert.ok(has(before.protectedBuildings, { x: 132, y: 84, w: 56, h: 76 }));
  assert.ok(has(before.protectedBuildings, { x: 512, y: 224, w: 56, h: 76 }));
  assert.ok(!has(before.protectedBuildings, { x: 732, y: 324, w: 56, h: 76 }));
  assert.ok(has(before.buildings, { x: 700, y: 400, w: 120, h: 80 }), 'inactive artwork remains a layout preference');
  assert.ok(!has(before.protectedBuildings, { x: 700, y: 400, w: 120, h: 80 }), 'a verified inactive city is not a hard wall');
  f.cityView.playerPoint.x = 360; f.cityView.playerPoint.y = 200;
  f.cityView.cityItemDic = new Map([...f.cities].reverse());
  assert.deepEqual(collectMapGeometry(f.ctx, f.scene, [...nodes].reverse()), before);
  f.cityView.playerPoint.visible = false; f.cityView.playerPoint.alpha = 0;
  assert.deepEqual(collectMapGeometry(f.ctx, f.scene, nodes), before, 'transient marker visibility never removes reserved landing space');
});

test('graphics anchors, negative scaling and real marker dimensions are projected into map coordinates', () => {
  const f = fixture(), city = f.makeCity(101, 500, 300, { scaleX: -1, scaleY: 1.5 });
  Object.assign(city.cityImg, { renderX: 10, renderY: 20, AnchorsX: .5, AnchorsY: .5 });
  city.citynameImg = f.sprite(city, 0, 100, 151, 20);
  city.eventtypeImg = f.sprite(f.cityView, 440, 210, 40, 40);
  f.cityView.playerPoint = f.sprite(f.cityView, 0, 0, 56, 76, { scaleX: 1.5, scaleY: 2 });
  const g = collectMapGeometry(f.ctx, f.scene, [{ id: 101, type: 'fight' }]);
  assert.deepEqual(g.anchors[0], { node: { id: 101, type: 'fight' }, x: 430, y: 270, w: 120, h: 120 });
  assert.ok(has(g.protectedBuildings, { x: 349, y: 450, w: 151, h: 30 }));
  assert.ok(has(g.protectedBuildings, { x: 440, y: 210, w: 40, h: 40 }));
  assert.ok(g.protectedBuildings.some(r => r.w === 84 && r.h === 152));
});

test('hidden geometry is excluded and open raid controls are protected', () => {
  const f = fixture();
  f.makeCity(101, 100, 160, { visible: false });
  const city = f.makeCity(102, 500, 300);
  city.citynameImg = f.sprite(city, 0, 100, 151, 20, { visible: false });
  f.cityView.raidItem = f.sprite(f.cityView, 700, 200, 160, 100, { open: true });
  let g = collectMapGeometry(f.ctx, f.scene, [{ id: 101, type: 'fight' }, { id: 102, type: 'fight' }]);
  assert.equal(g.anchors.length, 1); assert.equal(g.protectedBuildings.length, 1);
  assert.ok(has(g.controls, { x: 700, y: 200, w: 160, h: 100 }));
  f.cityView.raidItem.open = false;
  g = collectMapGeometry(f.ctx, f.scene, []);
  assert.equal(g.controls.length, 0);
});

test('obstacle collection overflow suppresses placement rather than exposing unexamined active cities', () => {
  const f = fixture();
  for (let id = 0; id < 257; id++) f.makeCity(id, id, 100);
  assert.equal(collectMapGeometry(f.ctx, f.scene, []).viewport, null);
});

test('active artwork not ready or an interrupted dictionary cannot be mistaken for empty map space', () => {
  const f = fixture();
  const a = f.makeCity(101, 100, 160), b = f.makeCity(102, 480, 300);
  a.cityImg.renderWidth = 0;
  assert.equal(collectMapGeometry(f.ctx, f.scene, [{ id: 102, type: 'fight' }]).viewport, null);
  a.HasEvent = false;
  assert.notEqual(collectMapGeometry(f.ctx, f.scene, [{ id: 102, type: 'fight' }]).viewport, null);
  f.cityView.cityItemDic = { forEach(fn) { fn(102, b); throw Error('texture refresh interrupted enumeration'); } };
  assert.equal(collectMapGeometry(f.ctx, f.scene, [{ id: 102, type: 'fight' }]).viewport, null);
});
