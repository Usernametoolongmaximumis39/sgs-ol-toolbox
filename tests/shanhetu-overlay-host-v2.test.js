import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlacementOverlay, placementOverlaySignature } from '../src/plugins/shanhetu/overlay-host.js';

class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) { Object.assign(this, { a, b, c, d, tx, ty }); }
}
class Rectangle {
  constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
}
class Sprite {
  static created = [];
  constructor() {
    Object.assign(this, { x: 0, y: 0, pivotX: 0, pivotY: 0, scaleX: 1, scaleY: 1, rotation: 0,
      width: 0, height: 0, parent: null, children: [], mouseEnabled: true, destroyed: false });
    Sprite.created.push(this);
  }
  pos(x, y) { this.x = x; this.y = y; return this; }
  size(width, height) { this.width = width; this.height = height; return this; }
  addChild(child) { child.parent = this; this.children.push(child); return child; }
  set transform(matrix) {
    // Native Sprite.set_transform copies tx/ty into x/y and stores only the
    // linear part in its own matrix (official Laya 374821 / 374953).
    this.x = matrix.tx; this.y = matrix.ty;
    this.matrix = new Matrix(matrix.a, matrix.b, matrix.c, matrix.d);
  }
  linear() {
    if (this.matrix) return this.matrix;
    const angle = this.rotation * Math.PI / 180;
    return new Matrix(Math.cos(angle) * this.scaleX, Math.sin(angle) * this.scaleX,
      -Math.sin(angle) * this.scaleY, Math.cos(angle) * this.scaleY);
  }
  toParent(point) {
    const m = this.linear(), x = point.x - this.pivotX, y = point.y - this.pivotY;
    return { x: m.a * x + m.c * y + this.x - (this.scrollRect?.x || 0),
      y: m.b * x + m.d * y + this.y - (this.scrollRect?.y || 0) };
  }
  fromParent(point) {
    const m = this.linear(), det = m.a * m.d - m.b * m.c;
    const x = point.x - this.x + (this.scrollRect?.x || 0), y = point.y - this.y + (this.scrollRect?.y || 0);
    return { x: (m.d * x - m.c * y) / det + this.pivotX, y: (m.a * y - m.b * x) / det + this.pivotY };
  }
  localToGlobal(point) {
    let value = { ...point };
    for (let item = this; item && !item.isStage; item = item.parent) value = item.toParent(value);
    return value;
  }
  globalToLocal(point) {
    const chain = [];
    for (let item = this; item && !item.isStage; item = item.parent) chain.push(item);
    return chain.reverse().reduce((value, item) => item.fromParent(value), { ...point });
  }
  destroy(children) {
    if (this.destroyed) return;
    this.destroyed = true;
    if (children) for (const child of [...this.children]) child.destroy(true);
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}
const L = { Sprite, Matrix, Rectangle };
function fixture() {
  const stage = new Sprite(); stage.isStage = true;
  const scene = stage.addChild(new Sprite()); scene.pos(30, 45); scene.scaleX = 1.2; scene.scaleY = 1.4;
  const parent = scene.addChild(new Sprite()); parent.pos(80, 35); parent.scaleX = 1.5; parent.scaleY = .8;
  parent.pivotX = 4; parent.pivotY = 7; parent.scrollRect = new Rectangle(6, 9, 900, 700);
  const host = parent.addChild(new Sprite()); host.pos(300, 200); host.pivotX = 11; host.pivotY = 13;
  host.scaleX = .75; host.scaleY = 1.25;
  const viewport = { x: -180, y: -120, w: 500, h: 400 };
  return { host, scene, parent, stage, viewport };
}
function close(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-7, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-7, `${actual.y} != ${expected.y}`);
}

test('scene overlay preserves city coordinates across nested scale, pivot, scroll and centered origin', () => {
  const context = fixture(), before = { x: context.host.x, y: context.host.y, parent: context.host.parent };
  const originalChildren = [...context.scene.children];
  const { root, content } = createPlacementOverlay(L, context);
  assert.equal(root.parent, null, 'construction must not attach itself');
  assert.deepEqual(context.scene.children, originalChildren);
  assert.equal(content.parent, root);
  assert.equal(root.mouseEnabled, false);
  assert.equal(content.mouseEnabled, false);
  assert.equal(root.scrollRect.x, 0);
  assert.equal(root.scrollRect.y, 0);
  context.scene.addChild(root);
  for (const [x, y] of [[-180, -120], [320, -120], [320, 280], [-180, 280], [0, 0], [23, -51]]) {
    close(content.localToGlobal({ x, y }), context.host.localToGlobal({ x, y }));
  }
  close(root.localToGlobal({ x: 0, y: 0 }), context.host.localToGlobal({ x: -180, y: -120 }));
  close(root.localToGlobal({ x: root.width, y: root.height }), context.host.localToGlobal({ x: 320, y: 280 }));
  assert.deepEqual({ x: context.host.x, y: context.host.y, parent: context.host.parent }, before);
});

test('zero-origin wrapper clip does not translate a negative city viewport', () => {
  const scene = new Sprite(), host = scene.addChild(new Sprite()); host.pos(610, 366);
  const { root, content } = createPlacementOverlay(L, { host, scene, viewport: { x: -610, y: -366, w: 1220, h: 732 } });
  scene.addChild(root);
  assert.deepEqual([root.x, root.y, root.width, root.height], [0, 0, 1220, 732]);
  assert.deepEqual([content.x, content.y], [610, 366]);
  close(content.localToGlobal({ x: -610, y: -366 }), { x: 0, y: 0 });
});

test('mirrored axis-aligned transforms still preserve corners and a positive clip', () => {
  const context = fixture(); context.host.scaleX = -1;
  const { root, content } = createPlacementOverlay(L, context); context.scene.addChild(root);
  assert.ok(root.width > 0 && root.height > 0);
  for (const point of [{ x: -180, y: -120 }, { x: 320, y: 280 }]) close(content.localToGlobal(point), context.host.localToGlobal(point));
});

test('relative-transform signature changes even when scene/host counter-motion preserves global map points', () => {
  const scene = new Sprite(), host = scene.addChild(new Sprite()); host.pos(610, 366);
  const context = { scene, host, viewport: { x: -610, y: -366, w: 1220, h: 732 } };
  const before = placementOverlaySignature(context), global = host.localToGlobal({ x: 0, y: 0 });
  scene.x += 20; host.x -= 20;
  close(host.localToGlobal({ x: 0, y: 0 }), global);
  assert.notEqual(placementOverlaySignature(context), before);
});

test('unsupported, singular, detached and nonfinite transforms throw before allocating overlay nodes', () => {
  for (const change of [c => { c.host.rotation = 12; }, c => { c.host.scaleX = 0; },
    c => { c.host.parent = null; }, c => { c.viewport.w = 0; }, c => { c.host.x = Infinity; }]) {
    const context = fixture(); change(context); const before = Sprite.created.length;
    assert.throws(() => createPlacementOverlay(L, context));
    assert.equal(Sprite.created.length, before);
  }
});

test('destroying the root releases all overlay descendants and leaves native nodes attached', () => {
  const context = fixture(), { root, content } = createPlacementOverlay(L, context);
  const card = content.addChild(new Sprite()), text = card.addChild(new Sprite());
  context.scene.addChild(root); root.destroy(true);
  for (const node of [root, content, card, text]) assert.equal(node.destroyed, true);
  assert.equal(context.host.destroyed, false);
  assert.equal(context.host.parent, context.parent);
  assert.equal(context.scene.children.includes(root), false);
});

test('construction failures destroy both allocated nodes without attaching to scene', () => {
  const context = fixture(), before = Sprite.created.length;
  class BrokenMatrix { constructor() { throw new Error('matrix construction failed'); } }
  assert.throws(() => createPlacementOverlay({ ...L, Matrix: BrokenMatrix }, context), /matrix construction failed/);
  assert.equal(Sprite.created.length, before + 2);
  for (const node of Sprite.created.slice(before)) assert.equal(node.destroyed, true);
  assert.deepEqual(context.scene.children, [context.parent]);
});
