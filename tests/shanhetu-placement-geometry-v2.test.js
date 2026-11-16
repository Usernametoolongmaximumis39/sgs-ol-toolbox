import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capturePlacementGeometry, placementRectToClient, transformRect } from '../src/plugins/shanhetu/placement-geometry.js';

class Sprite {
  constructor(parent, properties = {}) {
    Object.assign(this, { parent, x: 0, y: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
      width: 0, height: 0, visible: true, rotation: 0 }, properties);
  }
  toParent(point) {
    const r = this.rotation * Math.PI / 180, x = (point.x - this.pivotX) * this.scaleX, y = (point.y - this.pivotY) * this.scaleY;
    return { x: x * Math.cos(r) - y * Math.sin(r) + this.x - (this.scrollRect?.x || 0),
      y: x * Math.sin(r) + y * Math.cos(r) + this.y - (this.scrollRect?.y || 0) };
  }
  fromParent(point) {
    const r = -this.rotation * Math.PI / 180, x = point.x - this.x + (this.scrollRect?.x || 0), y = point.y - this.y + (this.scrollRect?.y || 0);
    return { x: (x * Math.cos(r) - y * Math.sin(r)) / this.scaleX + this.pivotX,
      y: (x * Math.sin(r) + y * Math.cos(r)) / this.scaleY + this.pivotY };
  }
  localToGlobal(point) {
    let value = { ...point };
    for (let item = this; item && !item.isStage; item = item.parent) value = item.toParent(value);
    return value;
  }
  globalToLocal(point) {
    const parents = [];
    for (let item = this; item && !item.isStage; item = item.parent) parents.push(item);
    return parents.reverse().reduce((value, item) => item.fromParent(value), { ...point });
  }
}

const defaultStyle = { transform: 'none', perspective: 'none', clip: 'auto', clipPath: 'none', maskImage: 'none', overflowX: 'visible', overflowY: 'visible' };
function fixture() {
  const stage = new Sprite(null, { isStage: true, width: 2440, height: 1464,
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } });
  const layer = new Sprite(stage, { scaleX: 2, scaleY: 2, scrollRect: { x: 0, y: 0, width: 1220, height: 732 } });
  const scene = new Sprite(layer, { width: 1220, height: 732 });
  const cityView = new Sprite(scene, { x: 610, y: 366 });
  const canvas = { width: 2440, height: 1464, getBoundingClientRect: () => ({ left: 20, top: 10, width: 1220, height: 732 }) };
  const browserWindow = { innerWidth: 1280, innerHeight: 800, getComputedStyle: element => ({ ...defaultStyle, ...element.style }) };
  cityView.cityItemDic = new Map();
  return { cityView, scene, stage, canvas, window: browserWindow, layer };
}
function draw(render, x, y, width, height, properties = {}) {
  // Native fO/p$t and CO are EventDispatchers. The metadata below models
  // their renderX/Y and renderWidth/Height getters, NOT Sprite transforms.
  // Official cache: sgsGame_a.sgs, fO 1939202 and CO 2000705 character offsets.
  return { render, renderX: x, renderY: y, renderWidth: width, renderHeight: height,
    width, height, textureWidth: width, textureHeight: height, AnchorsX: 0, AnchorsY: 0, visible: true, ...properties };
}
function city(context, id, x, y) {
  const node = new Sprite(context.cityView, { CityId: id, x, y, width: 250, height: 100 });
  node.cityImg = draw(node, 0, 0, 170, 140);
  node.citynameImg = new Sprite(node, { x: 9, y: 125, width: 151, height: 20 });
  node.citynameTagTex = draw(node.citynameImg, 120, -10, 43, 38);
  node.eventtypeImg = new Sprite(context.cityView, { x: x + 70, y: y + 40, width: 32, height: 40 });
  context.cityView.cityItemDic.set(id, node);
  return node;
}

function documentRoot(context, { rootStyle = {}, bodyStyle = {}, bodyHeight = 0, bodyWidth = 1280 } = {}) {
  const root = { tagName: 'HTML', style: rootStyle, parentElement: null, offsetWidth: 1280, offsetHeight: bodyHeight,
    clientLeft: 0, clientTop: 0, clientWidth: 1280, clientHeight: 800,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: bodyHeight }) };
  const body = { tagName: 'BODY', style: { overflowX: 'hidden', overflowY: 'hidden', ...bodyStyle }, parentElement: root,
    offsetWidth: bodyWidth, offsetHeight: bodyHeight, clientLeft: 0, clientTop: 0, clientWidth: bodyWidth, clientHeight: bodyHeight,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: bodyWidth, height: bodyHeight }) };
  const document = { documentElement: root, body };
  context.canvas.parentElement = body;
  context.canvas.ownerDocument = document;
  context.window.document = document;
  return { root, body };
}

test('centered native map uses explicit scene/ancestor clip, independently of child extents', () => {
  const context = fixture();
  city(context, 7, -500, -250);
  context.cityView.getBounds = () => { throw new Error('must never measure a child union'); };
  context.cityView.width = 99999;
  context.cityView.height = 99999;
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.deepEqual(result.viewport, { x: -610, y: -366, w: 1220, h: 732 });
  assert.deepEqual(result.nodes[0].anchor, { x: -500, y: -250, w: 170, h: 145 });
  assert.ok(result.nodes[0].regions.some(r => r.x === -371 && r.y === -135 && r.w === 43 && r.h === 38));
});

test('DPR, game-layer scale and stage render transform agree with fixed CSS coordinates', () => {
  const context = fixture();
  context.stage.transform = { a: 1.5, b: 0, c: 0, d: 1.5, tx: 0, ty: 0 };
  context.canvas.width = 3660;
  context.canvas.height = 2196;
  const output = placementRectToClient({ x: -610, y: -366, w: 100, h: 50 }, context);
  assert.deepEqual(output, { x: 20, y: 10, w: 100, h: 50 });
  assert.deepEqual(capturePlacementGeometry(context).viewport, { x: -610, y: -366, w: 1220, h: 732 });
});

test('actual browser clipping and ancestor scroll offsets reduce the safe viewport', () => {
  const context = fixture();
  context.canvas.getBoundingClientRect = () => ({ left: -100, top: -50, width: 1220, height: 732 });
  context.window.innerWidth = 900;
  context.window.innerHeight = 600;
  context.layer.scrollRect = { x: 20, y: 10, width: 1000, height: 650 };
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  // Laya subtracts scrollRect.x/y after applying the node's transform.
  assert.deepEqual(result.viewport, { x: -500, y: -311, w: 900, h: 600 });
  assert.deepEqual(placementRectToClient(result.viewport, context), { x: 0, y: 0, w: 900, h: 600 });
});

test('CSS clipping ancestor uses its client padding box rather than full border bounds', () => {
  const context = fixture();
  context.canvas.parentElement = { style: { overflowX: 'hidden', overflowY: 'hidden' }, offsetWidth: 510, offsetHeight: 310,
    clientLeft: 5, clientTop: 5, clientWidth: 500, clientHeight: 300,
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 510, height: 310 }) };
  const output = capturePlacementGeometry(context);
  assert.equal(output.ready, true);
  assert.deepEqual(placementRectToClient(output.viewport, context), { x: 105, y: 105, w: 500, h: 300 });
});

test('official Laya zero-height BODY propagates overflow to viewport instead of clipping the canvas away', () => {
  const context = fixture();
  documentRoot(context);
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready');
  assert.equal(result.diagnostics.overflowSource, 'body-viewport');
  assert.deepEqual(result.viewport, { x: -610, y: -366, w: 1220, h: 732 });
  assert.deepEqual(placementRectToClient(result.viewport, context), { x: 20, y: 10, w: 1220, h: 732 });
});

test('zero-height HTML root also clips at the actual viewport rather than its border box', () => {
  const context = fixture();
  documentRoot(context, { rootStyle: { overflowX: 'hidden', overflowY: 'hidden' }, bodyStyle: { overflowX: 'visible', overflowY: 'visible' } });
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.diagnostics.overflowSource, 'root-viewport');
  assert.deepEqual(result.viewport, { x: -610, y: -366, w: 1220, h: 732 });
});

test('BODY remains a real clipping box when HTML has nonvisible overflow', () => {
  const context = fixture();
  documentRoot(context, { rootStyle: { overflowX: 'hidden', overflowY: 'hidden' }, bodyWidth: 600, bodyHeight: 400 });
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.diagnostics.overflowSource, 'root-viewport');
  assert.deepEqual(placementRectToClient(result.viewport, context), { x: 20, y: 10, w: 580, h: 390 });
});

test('containment disables BODY propagation and ordinary zero-height clips stay closed', () => {
  for (const options of [{ rootStyle: { contain: 'paint' } }, { bodyStyle: { contain: 'layout' } },
    { rootStyle: { overflowX: 'hidden', overflowY: 'hidden' } }]) {
    const context = fixture();
    documentRoot(context, options);
    const result = capturePlacementGeometry(context);
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'clip-empty');
    assert.equal(result.diagnostics.detail, 'empty-css-ancestor');
  }
  const context = fixture(), { body } = documentRoot(context);
  context.canvas.parentElement = { ...body, tagName: 'DIV', parentElement: body };
  assert.equal(capturePlacementGeometry(context).reason, 'clip-empty');
});

test('failure diagnostics distinguish mapping, scene size, clipping and transforms without native references', () => {
  for (const [alter, expected] of [
    [c => { c.canvas.width = 0; }, 'invalid-client-mapping'],
    [c => { c.scene.height = 0; }, 'empty-scene-viewport'],
    [c => { c.canvas.getBoundingClientRect = () => ({ left: 2000, top: 0, width: 1220, height: 732 }); }, 'clip-empty'],
    [c => { c.layer.rotation = 20; }, 'transform-unsupported'],
  ]) {
    const context = fixture(); alter(context);
    const result = capturePlacementGeometry(context);
    assert.equal(result.reason, expected);
    assert.doesNotThrow(() => JSON.stringify(result.diagnostics));
    assert.equal(JSON.stringify(result.diagnostics).includes('parent'), false);
  }
  const context = fixture();
  context.window.getComputedStyle = () => { throw new TypeError('computed style unavailable'); };
  const result = capturePlacementGeometry(context);
  assert.equal(result.reason, 'geometry-exception');
  assert.deepEqual(result.diagnostics.exception, { phase: 'client-mapping', name: 'TypeError', message: 'computed style unavailable' });
});

test('stage-level scroll clip also applies to viewport and CSS conversion', () => {
  const context = fixture();
  context.stage.scrollRect = { x: 200, y: 100, width: 1000, height: 700 };
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.deepEqual(result.viewport, { x: -510, y: -316, w: 500, h: 350 });
  assert.deepEqual(placementRectToClient(result.viewport, context), { x: 20, y: 10, w: 500, h: 350 });
});

test('uncertain transforms, masks, detached scene and clipped-out canvas fail closed', () => {
  for (const alter of [
    c => { c.layer.rotation = 12; }, c => { c.layer.mask = {}; },
    c => { c.scene.parent = null; }, c => { c.canvas.style = { transform: 'matrix(0,1,-1,0,0,0)' }; },
    c => { c.canvas.getBoundingClientRect = () => ({ left: 2000, top: 0, width: 1220, height: 732 }); },
  ]) {
    const context = fixture(); alter(context);
    assert.equal(capturePlacementGeometry(context).ready, false);
  }
});

test('late image never uses placeholder city dimensions and returns native pending object', () => {
  const context = fixture(), node = city(context, 9, 0, 0);
  node.cityImg.textureWidth = 0;
  let result = capturePlacementGeometry(context);
  assert.equal(result.ready, false);
  assert.deepEqual(result.pending, [node.cityImg]);
  assert.equal(result.diagnostics.pendingDetails[0].field, 'cities[9].cityImg');
  assert.equal(result.diagnostics.pendingDetails[0].reason, 'image-not-loaded');
  assert.deepEqual(result.nodes, []);
  node.cityImg.textureWidth = 170;
  result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.nodes[0].id, 9);
});

test('native dictionary keys never substitute for CityId and order cannot change association', () => {
  const context = fixture();
  const second = city(context, 92, 200, 100), first = city(context, 11, -250, -100);
  context.cityView.cityItemDic = { forEach: callback => { callback(999, second); callback(123, first); } };
  const result = capturePlacementGeometry(context);
  assert.deepEqual(result.nodes.map(n => n.id), [11, 92]);
  assert.equal(result.nodes[0].anchor.x, -250);
  second.CityId = 11;
  assert.equal(capturePlacementGeometry(context).ready, false);
});

test('real controls are protected, while transparent 1000×800 layers and Spine bounds are ignored', () => {
  const context = fixture(), node = city(context, 5, 0, 0);
  const bottom = new Sprite(context.scene, { y: 732 });
  context.scene.bottomView = bottom;
  bottom.seatBaseSprite = new Sprite(bottom, { width: 1000, height: 800 });
  bottom.selfSeatUi = new Sprite(bottom, { x: 1050, y: -180, width: 150, height: 175 });
  bottom.zhanfaItemSpr = new Sprite(bottom, { x: 700, y: -130 });
  bottom.zhanfaItemTex = draw(bottom.zhanfaItemSpr, 0, 0, 111, 108);
  bottom.skillItemSpr = new Sprite(bottom, { x: 1040, y: -132, width: 1000, height: 800 });
  bottom.skillItemList = [new Sprite(bottom.skillItemSpr, { x: -117, width: 117, height: 36 })];
  node.eventEffect = new Sprite(context.cityView, { width: 8000, height: 8000 });
  const result = capturePlacementGeometry(context);
  assert.equal(result.controls.length, 3);
  assert.ok(result.controls.some(r => r.x === 440 && r.y === 186 && r.w === 150 && r.h === 175));
  assert.ok(result.controls.every(r => r.w < 200 && r.h < 200));
  node.eventEffect.width = 12000;
  bottom.seatBaseSprite.width = 2000;
  assert.equal(capturePlacementGeometry(context).signature, result.signature);
});

test('draw object anchors and nested sprite transforms use their actual render owner', () => {
  const context = fixture(), node = city(context, 4, -100, -80);
  node.scaleX = 1.25; node.scaleY = 1.25;
  node.cityImg = draw(node, 0, 0, 170, 140, { AnchorsX: 0.5, AnchorsY: 0.5 });
  const result = capturePlacementGeometry(context);
  assert.deepEqual(result.nodes[0].regions[0], { x: -206.25, y: -167.5, w: 212.5, h: 175 });
});

test('hidden names cannot make an event icon or award badge become the city anchor', () => {
  const context = fixture(), node = city(context, 4, -100, -80);
  node.citynameImg.visible = false;
  node.eventtypeImg.x = 500;
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.deepEqual(result.nodes[0].anchor, { x: -100, y: -80, w: 170, h: 140 });
  assert.ok(result.nodes[0].regions.some(r => r.x === 500));
});

test('native falsy visibility hides the name background, its draw children and controls', () => {
  for (const hidden of ['', 0, null, false, undefined]) {
    const context = fixture(), node = city(context, 4, -100, -80);
    node.citynameImg.visible = hidden;
    context.scene.leftView = new Sprite(context.scene, { shopBtn: { visible: hidden } });
    const result = capturePlacementGeometry(context);
    assert.equal(result.ready, true);
    assert.deepEqual(result.nodes[0].anchor, { x: -100, y: -80, w: 170, h: 140 });
    assert.equal(result.nodes[0].regions.length, 2);
    assert.deepEqual(result.controls, []);
  }
  const context = fixture();
  context.scene.leftView = new Sprite(context.scene, { shopBtn: { x: 0, y: 0, width: 20, height: 20 } });
  assert.equal(capturePlacementGeometry(context).controls.length, 1, 'absence of a visibility contract is distinct from an explicit falsy value');
  context.scene.leftView.shopBtn.renderVisible = undefined;
  assert.equal(capturePlacementGeometry(context).controls.length, 0);
});

const officialLaya = 'C:/Users/Admin/Documents/ChatGPT/小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js';
test('official Laya visibility setter preserves the empty string assigned by city names', { skip: !existsSync(officialLaya) }, () => {
  const source = readFileSync(officialLaya, 'utf8');
  const setter = source.match(/function set_visible\(value\)\{if\(this\._visible!==value\)\{this\._visible=value;this\.parentRepaint\(SpriteConst\.REPAINT_ALL\);\}\}/)?.[0];
  assert.ok(setter, 'official Sprite.set_visible contract changed');
  const setVisible = new Function('SpriteConst', `return (${setter})`)({ REPAINT_ALL: 1 });
  const context = fixture(), node = city(context, 4, -100, -80);
  const name = node.citynameImg;
  name.parentRepaint = () => {};
  Object.defineProperty(name, 'visible', { get() { return this._visible; }, set(value) { setVisible.call(this, value); } });
  for (const hidden of ['', undefined]) {
    name.visible = true;
    name.visible = hidden;
    assert.equal(name.visible, hidden);
    const result = capturePlacementGeometry(context);
    assert.equal(result.ready, true);
    assert.equal(result.nodes[0].regions.length, 2);
  }
});

test('ShowBossIcon can expose an empty static Sprite while the actual event uses Spine', () => {
  const context = fixture(), node = city(context, 4, -100, -80);
  node.eventtypeImg = new Sprite(context.cityView, { visible: true, texture: null, numChildren: 0, _graphics: null });
  Object.defineProperty(node.eventtypeImg, 'graphics', { get() { throw new Error('must not allocate graphics'); } });
  node.eventEffect = new Sprite(context.cityView, { width: 4000, height: 4000, visible: true });
  let result = capturePlacementGeometry(context);
  assert.equal(result.ready, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.pending, []);
  assert.equal(result.nodes[0].regions.length, 3);
  node.eventtypeImg._graphics = { _one: null, _cmds: [] };
  assert.equal(capturePlacementGeometry(context).ready, true);
  // Unknown drawn content, children, or a texture must still resolve real
  // geometry. This exception belongs only to the empty static event marker.
  for (const properties of [{ _graphics: { _one: {} } }, { _graphics: { _cmds: [{}] } }, { numChildren: 1 }, { texture: {} }]) {
    Object.assign(node.eventtypeImg, { _graphics: null, numChildren: 0, texture: null }, properties);
    result = capturePlacementGeometry(context);
    assert.equal(result.ready, false);
    assert.deepEqual(result.pending, [node.eventtypeImg]);
    assert.equal(result.diagnostics.pendingDetails[0].field, 'cities[4].eventtypeImg');
  }
});

test('unresolved soft UI controls remain pending without hiding known city cards', () => {
  const context = fixture();
  city(context, 41, -100, -80);
  const shop = { visible: true, width: 0, height: 0 };
  context.scene.leftView = new Sprite(context.scene, { shopBtn: shop });
  context.scene.leftView.bg = new Sprite(context.scene.leftView, { width: 32, height: 44 });
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready-with-unresolved-controls');
  assert.equal(result.controlsComplete, false);
  assert.equal(result.diagnostics.cityPendingCount, 0);
  assert.equal(result.diagnostics.controlPendingCount, 1);
  assert.equal(result.diagnostics.controlCoverage, 'known-controls-only');
  assert.deepEqual(result.nodes.map(node => node.id), [41]);
  assert.deepEqual(result.controls, [{ x: -610, y: -366, w: 32, h: 44 }]);
  assert.deepEqual(result.pending, [shop]);
  assert.deepEqual(result.diagnostics.pendingDetails, [{ field: 'leftView.shopBtn', reason: 'missing-rendered-size',
    contract: 'explicit-rectangle', width: 0, height: 0, renderWidth: null, renderHeight: null, textureWidth: null, textureHeight: null }]);
  assert.doesNotThrow(() => JSON.stringify(result.diagnostics));
  Object.assign(shop, { x: 40, y: 45, width: 80, height: 30 });
  const complete = capturePlacementGeometry(context);
  assert.equal(complete.ready, true);
  assert.equal(complete.controlsComplete, true);
  assert.equal(complete.reason, 'ready');
  assert.equal(complete.controls.length, 2);
  assert.deepEqual(complete.pending, []);
  assert.notEqual(complete.signature, result.signature);
});

test('missing city geometry still blocks floating cards even when unresolved UI is soft', () => {
  const context = fixture(), node = city(context, 41, -100, -80);
  node.cityImg.textureWidth = 0;
  const unknownControl = new Sprite(context.scene, { visible: true, width: 0, height: 0 });
  context.scene.leftView = new Sprite(context.scene, { diffInfoUI: unknownControl });
  let result = capturePlacementGeometry(context);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'native-geometry-pending');
  assert.equal(result.controlsComplete, false);
  assert.equal(result.diagnostics.cityPendingCount, 1);
  assert.equal(result.diagnostics.controlPendingCount, 1);
  assert.deepEqual(result.pending, [node.cityImg, unknownControl]);
  assert.deepEqual(result.diagnostics.pendingDetails.map(item => item.field), ['cities[41].cityImg', 'leftView.diffInfoUI']);
  node.cityImg.textureWidth = 170;
  result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready-with-unresolved-controls');
  assert.deepEqual(result.pending, [unknownControl]);
  assert.deepEqual(result.nodes.map(item => item.id), [41]);
});

test('explicit native flat-button backgrounds include scale once and do not require renderWidth on the container', () => {
  const context = fixture(), left = new Sprite(context.scene);
  context.scene.leftView = left;
  const button = { IsFlatButton: true, render: left, renderX: 45, renderY: 180, visible: true,
    background: draw(left, 45, 180, 90, 75) };
  left.shopBtn = button;
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true);
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.controls, [{ x: -565, y: -186, w: 90, h: 75 }]);
  delete button.IsFlatButton;
  assert.equal(capturePlacementGeometry(context).reason, 'ready-with-unresolved-controls');
});

const officialClient = process.env.SGS_CLIENT_SOURCE || 'C:/Users/Admin/AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs';
test('official $jt/EO/fO class getters reproduce shop/help buttons without Sprite-only substitutes', { skip: !existsSync(officialClient) }, () => {
  const bytes = readFileSync(officialClient);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c1f3d824d59a7c2ca9f335cbe50fcc24dd4cd75a614fadf26cf65ddd7b668473');
  const source = bytes.toString('utf8');
  const declaration = name => {
    const start = source.indexOf(`class ${name} `), body = source.indexOf('{', start);
    assert.ok(start >= 0 && body > start);
    let depth = 1, quote = '';
    for (let index = body + 1; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (char === '\\') { index++; continue; }
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unclosed official class ${name}`);
  };
  // Only the original three class declarations are evaluated. No constructor,
  // client bootstrap, network code or business methods run. Their native
  // getters execute against declared Sprite render owners and base fields.
  class NativeBase {
    get visible() { return this._visible !== false; }
    get x() { return this._x; }
    get y() { return this._y; }
    get width() { return this._width; }
    get height() { return this._height; }
  }
  const Laya = { EventDispatcher: NativeBase,
    superGetter: (Type, item, key) => Reflect.get(Object.getPrototypeOf(Type.prototype), key, item) };
  const { FlatButton, FlatImage } = new Function('Laya', 'y$t', `${declaration('fO')}\n${declaration('EO')}\n${declaration('$jt')}\nreturn {FlatButton:$jt,FlatImage:fO};`)(Laya, Base => Base);
  const context = fixture(), left = new Sprite(context.scene);
  context.scene.leftView = left;
  const button = Object.create(FlatButton.prototype);
  Object.assign(button, { IsFlatButton: true, _rx: { value: 45 }, _ry: { value: 180 }, _scaleX: 1.5, _scaleY: 1.25, render: left });
  const image = Object.create(FlatImage.prototype);
  Object.assign(image, { _rx: { value: 0 }, _ry: { value: 0 }, _rWidth: { value: 60 }, _rHeight: { value: 60 },
    _scaleX: 1, _scaleY: 1, _texture: { width: 60, height: 60 }, _anchorsX: 0, _anchorsY: 0, render: left, parentContainer: button });
  button.background = image;
  left.helpBtn = button;
  assert.equal(button.width, 60);
  assert.equal(button.renderWidth, undefined);
  assert.equal(image.renderX, 45);
  assert.equal(image.renderWidth, 90);
  const result = capturePlacementGeometry(context);
  assert.equal(result.ready, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.controls, [{ x: -565, y: -186, w: 90, h: 75 }]);

  // EmptyTexture is the official sentinel, not an arbitrary transparent
  // image. The native method proves the full nominal dimensions do not draw.
  FlatImage.EmptyTexture = { width: 1, height: 1 };
  image._texture = FlatImage.EmptyTexture;
  assert.equal(image.renderWidth, 90);
  assert.equal(image.getDrawSize(image.width, true), .01);
  assert.equal(image.getDrawSize(image.height, false), .01);
  assert.equal(capturePlacementGeometry(context).ready, true);
  assert.deepEqual(capturePlacementGeometry(context).controls, []);
  button.textField = draw(left, 50, 190, 60, 18, { text: 'Help' });
  assert.deepEqual(capturePlacementGeometry(context).controls, [{ x: -560, y: -176, w: 60, h: 18 }]);
  button.textField.text = '';

  const node = city(context, 9, -100, -80);
  node.citynameTagTex = image;
  assert.equal(capturePlacementGeometry(context).nodes[0].regions.length, 3);
  class CityImage extends FlatImage {}
  const cityImage = Object.create(CityImage.prototype);
  Object.assign(cityImage, { _rx: { value: 0 }, _ry: { value: 0 }, _rWidth: { value: 170 }, _rHeight: { value: 140 },
    _scaleX: 1, _scaleY: 1, _texture: FlatImage.EmptyTexture, _anchorsX: 0, _anchorsY: 0, render: node });
  node.cityImg = cityImage;
  let pending = capturePlacementGeometry(context);
  assert.equal(cityImage.textureWidth, 1);
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.pending, [cityImage]);
  assert.equal(pending.diagnostics.pendingDetails[0].reason, 'image-not-loaded');
  cityImage._texture = { width: 170, height: 140 };
  pending = capturePlacementGeometry(context);
  assert.equal(pending.ready, true);
  assert.deepEqual(pending.nodes[0].regions[0], { x: -100, y: -80, w: 170, h: 140 });
});

test('four-corner conversion handles pivot and nonuniform scale without reading getBounds', () => {
  const context = fixture();
  const object = new Sprite(context.cityView, { x: 20, y: 30, pivotX: 5, pivotY: 10, scaleX: 2, scaleY: 3 });
  assert.deepEqual(transformRect({ x: 0, y: 0, w: 20, h: 10 }, object, context.cityView), { x: 10, y: 0, w: 40, h: 30 });
});
