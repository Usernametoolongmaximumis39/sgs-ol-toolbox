import test from 'node:test';
import assert from 'node:assert/strict';
import { reflowLabelPositions, inside, overlaps, labelDistance } from '../src/plugins/shanhetu/label-layout.js';

function assertCompleteSafe(plan, cards, viewport, hard) {
  assert.equal(plan.size, cards.length, 'every card in the known feasible layout must be shown');
  for (const card of cards) {
    const p = plan.get(card.id);
    assert.ok(p && inside(p, viewport), `card ${card.id} stays wholly within the visible frame`);
    assert.deepEqual({ w: p.w, h: p.h }, card.variants[p.variant], 'every displayed card keeps its complete measured content');
    assert.ok(hard.every(o => !overlaps(p, o)), `card ${card.id} avoids every protected object`);
    assert.ok([...plan].every(([id, other]) => id === card.id || !overlaps(p, other)), `card ${card.id} has space from the other cards`);
  }
}

test('a safe nearest slot just outside the preferred radius does not make the card disappear', () => {
  const viewport = { x: 0, y: 0, w: 1000, h: 700 };
  const cards = [{ id: 1, anchor: { x: 400, y: 300, w: 100, h: 80 }, variants: [{ w: 204, h: 100 }] }];
  const hard = [{ x: 0, y: 0, w: 660, h: 700 }];
  // The right-hand safe strip starts at 668 after the 8-unit clearance. Its
  // nearest possible distance is 168, just outside the former 160 hard cap.
  const plan = reflowLabelPositions(cards, viewport, [], hard);
  assertCompleteSafe(plan, cards, viewport, hard);
  assert.ok(Math.abs(labelDistance(plan.get(1), cards[0].anchor) - 168) < 1e-6,
    'use the nearest feasible strip, not an arbitrarily distant fallback');
});

test('quality pruning cannot discard a feasible complete nearby arrangement', () => {
  const viewport = { x: 0, y: 0, w: 650, h: 500 };
  const cards = [
    { id: 0, anchor: { x: 82, y: 299, w: 50, h: 40 }, variants: [{ w: 180, h: 160 }] },
    { id: 1, anchor: { x: 47, y: 336, w: 50, h: 40 }, variants: [{ w: 160, h: 180 }] },
    { id: 2, anchor: { x: 64, y: 74, w: 50, h: 40 }, variants: [{ w: 160, h: 180 }] },
  ];
  const hard = cards.map(c => c.anchor);
  // Known full witness: 0=(29.375,131), 1=(140,320), 2=(245,26.6667).
  // All three positions existed in 0.1.31's candidate pool. Its beam retained
  // only two cards because it pruned a more expensive intermediate placement.
  const plan = reflowLabelPositions(cards, viewport, [], hard);
  assertCompleteSafe(plan, cards, viewport, hard);
  for (const card of cards) assert.ok(labelDistance(plan.get(card.id), card.anchor) <= 160,
    'a complete nearby solution exists, so no card needs to be sent farther away');
  assert.deepEqual(reflowLabelPositions([...cards].reverse(), viewport, [], hard), plan,
    'packet iteration order does not change which city loses its card');
});

test('compressed candidate pools cannot hide a feasible nearby arrangement', () => {
  const viewport = { x: 0, y: 0, w: 650, h: 500 };
  const cards = [
    { id: 0, anchor: { x: 471, y: 260, w: 50, h: 40 }, variants: [{ w: 180, h: 160 }] },
    { id: 1, anchor: { x: 167, y: 379, w: 50, h: 40 }, variants: [{ w: 180, h: 180 }] },
    { id: 2, anchor: { x: 114, y: 233, w: 50, h: 40 }, variants: [{ w: 180, h: 140 }] },
    { id: 3, anchor: { x: 45, y: 102, w: 50, h: 40 }, variants: [{ w: 200, h: 180 }] },
  ];
  const hard = cards.map(c => c.anchor);
  // The old per-cell cap deleted all full solutions. A known raw-candidate
  // witness is 0=(440.625,308), 1=(225,240), 2=(323.125,90), 3=(103,26.6667).
  const plan = reflowLabelPositions(cards, viewport, [], hard);
  assertCompleteSafe(plan, cards, viewport, hard);
  for (const card of cards) assert.ok(labelDistance(plan.get(card.id), card.anchor) <= 160,
    'search omitted nearby slots before widening the allowed distance');
});

test('inactive scenery stays uncovered when a complete nearby arrangement can avoid it', () => {
  const viewport = { x: 0, y: 0, w: 1000, h: 700 };
  const anchor = { x: 440, y: 300, w: 120, h: 90 }, head = { x: 472, y: 224, w: 56, h: 76 };
  const cards = [{ id: 1, anchor, variants: [{ w: 204, h: 140 }] }];
  const controls = [{ x: 0, y: 0, w: 1000, h: 90 }];
  const scenery = { x: 200, y: 300, w: 220, h: 160 };
  const buildings = [anchor, head, scenery], protectedBuildings = [anchor, head];
  const plan = reflowLabelPositions(cards, viewport, controls, buildings, new Map(), protectedBuildings);
  assertCompleteSafe(plan, cards, viewport, [...controls, ...protectedBuildings]);
  assert.ok(!overlaps(plan.get(1), scenery), 'do not cover inactive artwork merely for a better score');
  assert.ok(labelDistance(plan.get(1), anchor) <= 160);
});

test('only inactive scenery relaxes when it would suppress an otherwise safe nearby card', () => {
  const viewport = { x: 0, y: 0, w: 1000, h: 700 };
  const anchor = { x: 440, y: 300, w: 120, h: 90 }, head = { x: 472, y: 224, w: 56, h: 76 };
  const cards = [{ id: 1, anchor, variants: [{ w: 204, h: 140 }] }];
  const controls = [{ x: 0, y: 0, w: 1000, h: 90 }];
  // Four inactive shapes leave no 204-wide full-card slot between them. The
  // active city, its head and the real top control must remain protected.
  const scenery = [{ x: 0, y: 90, w: 1000, h: 110 }, { x: 0, y: 200, w: 420, h: 500 },
    { x: 580, y: 200, w: 420, h: 500 }, { x: 420, y: 410, w: 160, h: 290 }];
  const buildings = [anchor, head, ...scenery], protectedBuildings = [anchor, head];
  const plan = reflowLabelPositions(cards, viewport, controls, buildings, new Map(), protectedBuildings);
  assertCompleteSafe(plan, cards, viewport, [...controls, ...protectedBuildings]);
  assert.ok(scenery.some(o => overlaps(plan.get(1), o)), 'the unavailable inactive-art-only layout must not hide the card');
  assert.ok(labelDistance(plan.get(1), anchor) <= 160, 'use nearby inactive scenery before sending the card farther away');
  assert.deepEqual(reflowLabelPositions(cards, viewport, controls, buildings, plan, protectedBuildings), plan,
    'the full safe arrangement remains stable after a normal selection update');
  const newlyActive = reflowLabelPositions(cards, viewport, controls, buildings, plan, buildings);
  assert.equal(newlyActive.size, 0, 'when those shapes become active, the old overlapping cached placement must be rejected');
});
