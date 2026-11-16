import test from 'node:test';
import assert from 'node:assert/strict';
import { reflowLabelPositions, inside, overlaps, labelDistance } from '../src/plugins/shanhetu/label-layout.js';

const viewport = { x: 8, y: 8, w: 1184, h: 834 };
const cardsAt = coordinates => coordinates.map(([x, y], id) => ({
  id, anchor: { x, y, w: 80, h: 60 }, variants: [{ w: 204, h: 150 }, { w: 240, h: 140 }],
}));
const protectedNodes = cards => cards.flatMap(({ anchor: a }) => [a,
  { x: a.x + a.w / 2 - 28, y: a.y - 76, w: 56, h: 76 }]);
function safePlan(plan, cards, view, hard, maximumDistance = 160) {
  assert.ok(plan instanceof Map, 'the solver returns an explicit safe plan, including an empty plan');
  for (const [id, p] of plan) {
    const card = cards.find(c => c.id === id);
    assert.ok(card, 'only requested cards may appear');
    assert.ok(inside(p, view), `card ${id} stays inside the complete visible frame`);
    assert.ok(labelDistance(p, card.anchor) <= maximumDistance, `card ${id} uses the nearest feasible range`);
    assert.deepEqual({ w: p.w, h: p.h }, card.variants[p.variant], 'contents keep their measured size');
    assert.ok(hard.every(r => !overlaps(p, r)), `card ${id} avoids nodes, heads and controls`);
    assert.ok([...plan].every(([other, r]) => other === id || !overlaps(p, r)), `card ${id} avoids other cards`);
  }
}

test('centre cluster uses both sides and both vertical halves of the open map', () => {
  const cards = cardsAt([[470, 280], [650, 280], [470, 500], [650, 500]]);
  const hard = protectedNodes(cards), plan = reflowLabelPositions(cards, viewport, [], hard);
  safePlan(plan, cards, viewport, hard); assert.equal(plan.size, cards.length);
  for (const [axis, extent, middle] of [['x', 'w', 600], ['y', 'h', 425]]) {
    const centres = [...plan.values()].map(p => p[axis] + p[extent] / 2);
    assert.ok(centres.some(c => c < middle) && centres.some(c => c > middle), `${axis} distribution uses both open halves`);
  }
});

test('mirrored crowded sides spread locally without forcing cards into the distant half', () => {
  for (const mirror of [false, true]) {
    const cards = cardsAt([[240, 230], [380, 230], [240, 490], [380, 490]]);
    if (mirror) for (const card of cards) card.anchor.x = 1200 - card.anchor.x - card.anchor.w;
    const hard = protectedNodes(cards), plan = reflowLabelPositions(cards, viewport, [], hard);
    safePlan(plan, cards, viewport, hard); assert.equal(plan.size, cards.length);
    const centres = [...plan.values()].map(p => p.y + p.h / 2);
    assert.ok(centres.some(y => y < 425) && centres.some(y => y > 425), 'nearby safe alternatives still use both local rows');
  }
});

test('top and bottom crowding does not trade locality for a distant empty half', () => {
  for (const mirror of [false, true]) {
    const cards = cardsAt([[340, 180], [700, 180], [340, 320], [700, 320]]);
    if (mirror) for (const card of cards) card.anchor.y = 850 - card.anchor.y - card.anchor.h;
    const hard = protectedNodes(cards), plan = reflowLabelPositions(cards, viewport, [], hard);
    safePlan(plan, cards, viewport, hard); assert.equal(plan.size, cards.length);
    const centres = [...plan.values()].map(p => p.x + p.w / 2);
    assert.ok(centres.some(x => x < 600) && centres.some(x => x > 600), 'safe nearby alternatives still use both local columns');
  }
});

test('an actually blocked neighbourhood expands only to the nearest complete safe range', () => {
  const cards = cardsAt([[160, 220], [320, 220], [160, 490], [320, 490]]);
  const hard = protectedNodes(cards), controls = [{ x: 8, y: 8, w: 670, h: 834 }];
  const plan = reflowLabelPositions(cards, viewport, controls, hard);
  // The two left anchors end at x=240; the obstruction ends at x=678.
  // The nearest safe card starts at x=686, so a 446 separation is unavoidable.
  safePlan(plan, cards, viewport, [...controls, ...hard], 446); assert.equal(plan.size, 4);
  assert.ok(Math.abs(Math.max(...[...plan].map(([id,p])=>labelDistance(p,cards[id].anchor))) - 446) < 1e-6);
});

test('Luoyang encounters keep short local connections despite a large empty far side', () => {
  const cards = [[101, 280, 250, 170, 90, 106], [102, 260, 420, 175, 130, 176], [103, 470, 345, 170, 175, 224]]
    .map(([id, x, y, w, h, height]) => ({ id, anchor: { x, y, w, h }, variants: [{ w: 204, h: height }, { w: 240, h: height }] }));
  const hard = [...protectedNodes(cards), { x: 75, y: 265, w: 180, h: 130 }, { x: 570, y: 130, w: 170, h: 95 },
    { x: 720, y: 345, w: 190, h: 175 }, { x: 935, y: 350, w: 190, h: 160 }, { x: 930, y: 120, w: 140, h: 130 }];
  const controls = [{ x: 0, y: 0, w: 1200, h: 85 }, { x: 20, y: 680, w: 250, h: 170 },
    { x: 790, y: 650, w: 270, h: 190 }, { x: 1080, y: 590, w: 120, h: 260 }, { x: 950, y: 560, w: 120, h: 80 }];
  const old = new Map([[101, { x: 970, y: 90, w: 204, h: 106, variant: 0 }]]);
  const plan = reflowLabelPositions(cards, viewport, controls, hard, old);
  safePlan(plan, cards, viewport, [...hard, ...controls]); assert.equal(plan.size, 3);
  assert.ok(labelDistance(plan.get(101), cards[0].anchor) <= 80, 'the small Li Ru card stays in an available local gap, not across the whole map');
});

test('a safe but far cached complete plan is rejected when nearby slots exist', () => {
  const cards = cardsAt([[160, 230], [160, 490]]), hard = protectedNodes(cards);
  const old = new Map(cards.map(c => [c.id, { x: 940, y: c.anchor.y, w: 204, h: 150, variant: 0 }]));
  const plan = reflowLabelPositions(cards, viewport, [], hard, old);
  safePlan(plan, cards, viewport, hard); assert.equal(plan.size, 2);
  assert.notDeepEqual(plan, old, 'a previous version cannot pin cards across the map');
});

test('active nodes without cards and their heads invalidate an unsafe cached plan', () => {
  const cards = cardsAt([[420, 250], [420, 530]]);
  const unrelated = [{ x: 680, y: 330, w: 160, h: 90 }, { x: 732, y: 254, w: 56, h: 76 }];
  const hard = [...protectedNodes(cards), ...unrelated];
  const stale = new Map([[0, { x: 690, y: 240, w: 204, h: 150, variant: 0 }]]);
  const plan = reflowLabelPositions(cards, viewport, [], hard, stale, hard);
  safePlan(plan, cards, viewport, hard); assert.equal(plan.size, cards.length);
  assert.deepEqual(reflowLabelPositions([...cards].reverse(), viewport, [], hard, plan, hard), plan,
    'packet order and current selection preserve the safe plan');
});

test('overfull view returns only complete safe cards and blocked view returns an empty map', () => {
  const view = { x: 0, y: 0, w: 460, h: 220 };
  const cards = [0, 1, 2].map(id => ({ id, anchor: { x: 170 + id * 10, y: 230, w: 20, h: 20 }, variants: [{ w: 200, h: 150 }] }));
  const plan = reflowLabelPositions(cards, view, [], []);
  safePlan(plan, cards, view, []); assert.equal(plan.size, 2, 'keep both cards that fit instead of abandoning the whole plan');
  const empty = reflowLabelPositions(cards, view, [view], []);
  safePlan(empty, cards, view, [view]); assert.equal(empty.size, 0);
});

test('translation, scale and viewport shrink retain hard bounds and deterministic ordering', () => {
  for (const scale of [.65, 1, 1.4]) for (const [dx, dy] of [[0, 0], [-600, -425]]) {
    const transform = r => ({ x: r.x * scale + dx, y: r.y * scale + dy, w: r.w * scale, h: r.h * scale });
    const cards = cardsAt([[470, 280], [650, 280], [470, 500], [650, 500]])
      .map(c => ({ ...c, anchor: transform(c.anchor), variants: c.variants.map(v => ({ w: v.w * scale, h: v.h * scale })) }));
    const hard = protectedNodes(cards), view = transform(viewport);
    const plan = reflowLabelPositions(cards, view, [], hard);
    safePlan(plan, cards, view, hard); assert.equal(plan.size, cards.length);
    assert.deepEqual(reflowLabelPositions([...cards].reverse(), view, [], hard), plan, 'input order does not decide the layout');
    const smaller = { ...view, w: view.w * .8, h: view.h * .8 };
    const resized = reflowLabelPositions(cards, smaller, [], hard, plan);
    safePlan(resized, cards, smaller, hard);
  }
});
