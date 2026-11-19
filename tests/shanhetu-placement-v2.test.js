import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCards, validatePlacement, findDrawerRect, comparePlacementResults } from '../src/plugins/shanhetu/placement.js';

const node = (id, x, y, w = 40, h = 40, regions = []) => ({ id, anchor: { x, y, w, h }, regions });
const snapshot = overrides => ({ viewport: { x: 0, y: 0, w: 800, h: 600 }, nodes: [],
  controls: [], cards: [], previous: [], ...overrides });
const touching = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x
  && a.y < b.y + b.h && a.y + a.h > b.y;
const rectangleDistance = (a, b) => Math.hypot(Math.max(a.x - b.x - b.w, b.x - a.x - a.w, 0),
  Math.max(a.y - b.y - b.h, b.y - a.y - a.h, 0));

function assertInvariants(s, result) {
  assert.equal(result.placements.length + result.overflow.length, s.cards.length);
  assert.equal(new Set([...result.placements, ...result.overflow].map(x => String(x.id))).size, s.cards.length);
  for (const p of result.placements) {
    assert(p.x >= s.viewport.x + 8 - 1e-6 && p.y >= s.viewport.y + 8 - 1e-6);
    assert(p.x + p.w <= s.viewport.x + s.viewport.w - 8 + 1e-6);
    assert(p.y + p.h <= s.viewport.y + s.viewport.h - 8 + 1e-6);
    const card = s.cards.find(c => String(c.id) === String(p.id));
    assert([card, ...(card.alternatives || [])].some(size => p.w === size.w && p.h === size.h),
      'the whole card must match one of its explicitly measured sizes');
    const own = s.nodes.find(n => String(n.id) === String(p.id));
    for (const n of s.nodes) {
      for (const r of [n.anchor, ...n.regions]) if (touching(p, r)) {
        assert.equal(n, own, 'cards may cover only their own explicitly centred node');
        const a = own.anchor, dx = Math.abs(p.x + p.w / 2 - a.x - a.w / 2), dy = Math.abs(p.y + p.h / 2 - a.y - a.h / 2);
        assert(dx <= a.w / 4 + 1e-6 && dy <= a.h / 4 + 1e-6);
        const area = Math.max(0, Math.min(p.x + p.w, a.x + a.w) - Math.max(p.x, a.x))
          * Math.max(0, Math.min(p.y + p.h, a.y + a.h) - Math.max(p.y, a.y));
        assert(area >= Math.min(p.w * p.h, a.w * a.h) / 2 - 1e-6);
      }
      if (n !== own) assert(rectangleDistance(p, own.anchor) < rectangleDistance(p, n.anchor));
    }
    if (s.drawer) assert.equal(touching(p, s.drawer), false);
    assert(Math.hypot(p.line.toX - p.line.fromX, p.line.toY - p.line.fromY) <= p.w + 1e-6);
    const validation = validatePlacement(s, p, result.placements.filter(other => other !== p));
    assert.equal(validation.valid, true, validation.reasons.join(', '));
  }
}

test('upper map nodes prefer a centred card over consuming the title band; lower nodes retain overhead preference', () => {
  for (const y of [190, 390]) {
    const s = snapshot({ nodes: [node('one', 380, y)], cards: [{ id: 'one', w: 180, h: 100 }],
      controls: [{ x: 0, y: 40, w: 800, h: 100 }] });
    const result = placeCards(s); assertInvariants(s, result); assert.equal(result.placements.length, 1);
    if (y === 190) assert.equal(result.diagnostics.preference.aboveCount, 0);
    else assert.equal(result.diagnostics.preference.aboveCount, 1);
    if (y === 190) assert(result.placements[0].y >= 140, 'card should leave the title band clear when the centred option fits');
  }
});

test('old counterexample: right-edge cards cannot use a 24px overflow allowance', () => {
  const s = snapshot({ nodes: [node('edge', 742, 260)], cards: [{ id: 'edge', w: 180, h: 100 }] });
  const result = placeCards(s);
  assert.equal(result.placements.length, 1);
  assertInvariants(s, result);
  const outside = { id: 'edge', x: 628, y: 148, w: 180, h: 100,
    line: { fromX: 762, fromY: 260, toX: 762, toY: 248 } };
  assert(validatePlacement(s, outside).reasons.includes('outside-viewport'));
});

test('old counterexample: no candidate means overflow, never forced placement or cropped text', () => {
  const s = snapshot({ nodes: [node('blocked', 380, 280)], cards: [{ id: 'blocked', w: 260, h: 720 }] });
  const result = placeCards(s);
  assert.deepEqual(result.placements, []);
  assert.deepEqual(result.overflow, [{ id: 'blocked', reason: 'no-legal-candidate' }]);
});

test('old counterexample: a visible neighbour without an event still owns its head area', () => {
  const s = snapshot({ nodes: [node('own', 180, 300), node('ordinary', 300, 300, 40, 40,
    [{ x: 280, y: 276, w: 80, h: 20 }])], cards: [{ id: 'own', w: 160, h: 80 }] });
  const wrongHead = { id: 'own', x: 260, y: 180, w: 160, h: 80,
    line: { fromX: 220, fromY: 300, toX: 260, toY: 260 } };
  const validation = validatePlacement(s, wrongHead);
  assert.equal(validation.valid, false);
  assert(validation.reasons.includes('ambiguous-owner:ordinary'));
  assertInvariants(s, placeCards(s));
});

test('all ID orderings produce the same placements and overflow', () => {
  const s = snapshot({ nodes: [node('west', 160, 260), node('east', 590, 260), node('middle', 380, 420)],
    cards: [{ id: 'east', w: 140, h: 90 }, { id: 'middle', w: 180, h: 110 }, { id: 'west', w: 160, h: 80 }] });
  const first = placeCards(s);
  assert.equal(first.placements.length, 3);
  const shuffled = placeCards({ ...s, nodes: [...s.nodes].reverse(), cards: [...s.cards].reverse() });
  assert.deepEqual(shuffled.placements, first.placements);
  assert.deepEqual(shuffled.overflow, first.overflow);
  assertInvariants(s, first);
});

test('the previous valid layout remains stable on an unchanged snapshot', () => {
  const s = snapshot({ nodes: [node(1, 120, 260), node(2, 560, 260)],
    cards: [{ id: 1, w: 180, h: 110 }, { id: 2, w: 180, h: 110 }] });
  const first = placeCards(s);
  const second = placeCards({ ...s, previous: first.placements });
  const third = placeCards({ ...s, previous: second.placements });
  assert.equal(first.placements.length, 2);
  assert.deepEqual(second.placements, first.placements);
  assert.deepEqual(third.placements, first.placements);
});

test('duplicate IDs, nonfinite geometry, and mismatched nodes conservatively reject the snapshot', () => {
  const base = snapshot({ nodes: [node('a', 200, 200)], cards: [{ id: 'a', w: 120, h: 80 }] });
  for (const s of [
    { ...base, nodes: [...base.nodes, node('a', 400, 200)] },
    { ...base, nodes: [node(1, 200, 200), node('1', 400, 200)], cards: [{ id: 1, w: 120, h: 80 }] },
    { ...base, cards: [...base.cards, ...base.cards] },
    { ...base, controls: [{ x: NaN, y: 0, w: 20, h: 20 }] },
    { ...base, nodes: [node('a', Infinity, 200)] },
    { ...base, nodes: [node('a', 200, 200, 40, 40, [{ x: 0, y: 0, w: -1, h: 20 }])] },
    { ...base, cards: [{ id: 'missing', w: 120, h: 80 }] },
  ]) {
    const result = placeCards(s);
    assert.deepEqual(result.placements, []);
    assert(result.diagnostics.errors.length > 0);
    assert(result.overflow.every(o => o.reason === 'invalid-snapshot'));
  }
});

test('independent validator rejects changed size, wrong connectors and equidistant ownership', () => {
  const s = snapshot({ nodes: [node('a', 200, 300)], cards: [{ id: 'a', w: 160, h: 80 }] });
  const p = placeCards(s).placements[0];
  assert(validatePlacement(s, { ...p, w: 80 }).reasons.includes('changed-card-size'));
  assert(validatePlacement(s, { ...p, line: { fromX: 0, fromY: 0, toX: 1, toY: 1 } })
    .reasons.includes('invalid-owner-connector'));
  const tied = snapshot({ nodes: [node('a', 200, 300), node('b', 320, 300)],
    cards: [{ id: 'a', w: 160, h: 80 }] });
  const aboveBoth = { id: 'a', x: 200, y: 180, w: 160, h: 80,
    line: { fromX: 220, fromY: 300, toX: 220, toY: 260 } };
  assert(validatePlacement(tied, aboveBoth).reasons.includes('ambiguous-owner:b'));
});

test('native UI can be crossed, while other cards and the drawer remain hard obstacles', () => {
  const s = snapshot({ nodes: [node('a', 200, 300), node('b', 500, 300)],
    controls: [{ x: 195, y: 270, w: 50, h: 10 }],
    cards: [{ id: 'a', w: 160, h: 80 }, { id: 'b', w: 160, h: 80 }] });
  const p = { id: 'a', x: 140, y: 170, w: 160, h: 80,
    line: { fromX: 220, fromY: 300, toX: 220, toY: 250 } };
  assert.equal(validatePlacement(s, p).valid, true, 'native UI is a soft placement cost');
  assert(validatePlacement({ ...s, drawer: s.controls[0] }, p).reasons.includes('line-crosses-drawer'));
  const clear = { ...s, controls: [] };
  const other = { id: 'b', x: 210, y: 268, w: 40, h: 10,
    line: { fromX: 500, fromY: 310, toX: 250, toY: 278 } };
  assert(validatePlacement(clear, p, [other]).reasons.includes('line-crosses-card'));
});

test('nearby centred above cards remain preferred even when native UI occupies that band', () => {
  const s = snapshot({ nodes: [node('a', 380, 300)], cards: [{ id: 'a', w: 160, h: 80 }],
    controls: [{ x: 200, y: 100, w: 400, h: 200 }] });
  const result = placeCards(s), p = result.placements[0];
  assert.deepEqual(result.diagnostics.preferredAboveIds, ['a']);
  assert.equal(p.x + p.w / 2, 400);
  assert.equal(p.y + p.h, 292);
  assert(result.diagnostics.preference.uiOverlapArea > 0, 'UI overlap is represented instead of secretly rejected');
  assert(result.diagnostics.preference.uiCost > 0);
  assertInvariants(s, result);
  const repeated = placeCards({ ...s, controls: [...s.controls, ...s.controls] });
  assert.deepEqual(repeated.placements, result.placements, 'duplicate native UI rectangles do not inflate coverage cost');
  assert.equal(repeated.diagnostics.preference.uiCost, result.diagnostics.preference.uiCost);
});

test('a nearby card gives the shop priority over its usual position above the node', () => {
  const shop = { x: 20, y: 160, w: 90, h: 50 };
  const s = snapshot({ nodes: [node('a', 110, 260)], cards: [{ id: 'a', w: 200, h: 100 }],
    controls: [shop] });
  const usual = placeCards(s);
  assert.deepEqual(usual.diagnostics.preferredAboveIds, ['a']);
  assert(touching(usual.placements[0], shop));

  const protectedShop = { ...s, shop, previous: usual.placements };
  const result = placeCards(protectedShop);
  assert.equal(result.placements.length, 1);
  assert.equal(touching(result.placements[0], shop), false);
  assert.deepEqual(result.diagnostics.shopOverlapIds, []);
  assertInvariants(protectedShop, result);
});

test('a narrow map minimizes unavoidable shop overlap and can reflow to clear it', () => {
  const shop = { x: 0, y: 0, w: 64, h: 500 };
  const card = { id: 'a', w: 200, h: 80 };
  const s = snapshot({ viewport: { x: 0, y: 0, w: 256, h: 500 },
    nodes: [node('a', 100, 300)], cards: [card], controls: [shop], shop });
  const fallback = placeCards(s);
  assert.equal(fallback.placements.length, 1);
  assert.equal(fallback.diagnostics.preference.shopOverlapArea, 16 * card.h);
  assert.deepEqual(fallback.diagnostics.shopOverlapIds, ['a']);
  assertInvariants(s, fallback);

  const flexible = { ...s, cards: [{ ...card, alternatives: [{ w: 160, h: 100 }] }] };
  const result = placeCards(flexible);
  assert.equal(result.placements[0].w, 160);
  assert.equal(result.diagnostics.preference.shopOverlapArea, 0);
  assert(comparePlacementResults(result, fallback) < 0);
  assertInvariants(flexible, result);
});

test('crowded above-first cards are jointly arranged without any card overlap', () => {
  const s = snapshot({ nodes: [node('a', 150, 300), node('b', 330, 300), node('c', 510, 300)],
    cards: ['a', 'b', 'c'].map(id => ({ id, w: 220, h: 100 })) });
  const result = placeCards(s);
  assert.equal(result.placements.length, 3);
  assert.equal(result.diagnostics.preference.aboveCount, 3);
  for (const [index, p] of result.placements.entries()) for (const q of result.placements.slice(index + 1))
    assert.equal(touching(p, q), false, 'owning different nodes never permits card overlap');
  assertInvariants(s, result);
  assert.equal(comparePlacementResults(result, result), 0);
  assert.deepEqual(placeCards({ ...s, previous: result.placements }).placements, result.placements);
});

test('a centred self overlay is the second choice when the above band cannot fit', () => {
  const s = snapshot({ viewport: { x: 0, y: 0, w: 600, h: 400 },
    nodes: [node('a', 240, 30, 120, 100)], cards: [{ id: 'a', w: 220, h: 147 }] });
  const result = placeCards(s), p = result.placements[0];
  assert.deepEqual(result.diagnostics.preferredAboveIds, []);
  assert.deepEqual(result.diagnostics.selfOverlayIds, ['a']);
  assert.equal(result.diagnostics.preference.selfOverlayCount, 1);
  assert.equal(p.line.fromX, p.line.toX); assert.equal(p.line.fromY, p.line.toY);
  assertInvariants(s, result);
  assert.deepEqual(placeCards({ ...s, previous: result.placements }).placements, result.placements);
});

test('self overlay is geometrically restricted and never exempts another city, card or drawer', () => {
  const s = snapshot({ viewport: { x: 0, y: 0, w: 600, h: 400 },
    nodes: [node('a', 240, 30, 120, 100)], cards: [{ id: 'a', w: 220, h: 147 }] });
  const p = placeCards(s).placements[0];
  const corner = { ...p, x: 350, y: 90, mode: 'self-overlay',
    line: { fromX: 350, fromY: 90, toX: 350, toY: 90 } };
  assert(validatePlacement(s, corner).reasons.includes('node-overlap:a'), 'touching an own corner or claiming a mode is not sufficient');
  const withNeighbour = { ...s, nodes: [...s.nodes, node('passive', p.x + p.w - 20, p.y + 20, 30, 30)] };
  assert(validatePlacement(withNeighbour, p).reasons.includes('node-overlap:passive'));
  const other = { id: 'other', x: p.x + 10, y: p.y + 10, w: 80, h: 50,
    line: { fromX: 0, fromY: 0, toX: p.x + 10, toY: p.y + 10 } };
  assert(validatePlacement(s, p, [other]).reasons.includes('card-overlap'));
  assert(validatePlacement({ ...s, drawer: { x: p.x + 10, y: p.y + 10, w: 80, h: 50 } }, p)
    .reasons.includes('drawer-overlap'));
});

test('an off-canvas anchor cannot send a connector outside the real canvas', () => {
  const s = snapshot({ nodes: [node('offscreen', -80, 200)], cards: [{ id: 'offscreen', w: 120, h: 80 }] });
  const p = { id: 'offscreen', x: 20, y: 180, w: 120, h: 80,
    line: { fromX: -40, fromY: 220, toX: 20, toY: 220 } };
  assert(validatePlacement(s, p).reasons.includes('line-outside-viewport'));
  assert.deepEqual(placeCards(s).placements, []);
});

test('drawer avoids actual controls, stays in canvas, and becomes an obstacle to map cards', () => {
  const viewport = { x: 100, y: 50, w: 800, h: 600 };
  const controls = [{ x: 100, y: 570, w: 800, h: 80 }, { x: 700, y: 50, w: 200, h: 50 }];
  const drawer = findDrawerRect(viewport, controls);
  assert(drawer);
  assert.equal(drawer.x + drawer.w, 892);
  assert.equal(drawer.w, 280);
  assert(drawer.y >= 108 && drawer.y + drawer.h <= 562);
  for (const r of controls) assert.equal(touching(drawer, r), false);
  const folded = findDrawerRect(viewport, controls, { collapsed: true });
  assert.equal(folded.h, 34);
  const s = snapshot({ viewport, controls, drawer,
    nodes: [node('a', 540, 290)], cards: [{ id: 'a', w: 160, h: 100 }] });
  assertInvariants(s, placeCards(s));
});

test('drawer can move left or narrow; no viable header produces null', () => {
  const viewport = { x: 0, y: 0, w: 400, h: 300 };
  const left = findDrawerRect(viewport, [{ x: 300, y: 0, w: 100, h: 300 }]);
  assert(left && left.x + left.w <= 292);
  const narrow = findDrawerRect({ x: 0, y: 0, w: 248, h: 180 }, []);
  assert.equal(narrow.w, 232);
  assert.equal(findDrawerRect(viewport, [{ x: 0, y: 0, w: 400, h: 300 }]), null);
  assert.equal(findDrawerRect({ x: 0, y: 0, w: 45, h: 200 }, []), null);
});

test('expanded drawer prefers readable height over a wider shallow strip', () => {
  const viewport = { x: 0, y: 0, w: 400, h: 200 };
  const controls = [{ x: 200, y: 80, w: 200, h: 120 }];
  const drawer = findDrawerRect(viewport, controls);
  assert.deepEqual(drawer, { x: 8, y: 8, w: 184, h: 184 });
  assert.equal(touching(drawer, controls[0]), false);
});

test('drawer minimums leave a real text line or offer only a usable collapsed header', () => {
  const short = findDrawerRect({ x: 0, y: 0, w: 248, h: 80 }, []);
  assert.deepEqual(short, { x: 8, y: 8, w: 232, h: 64 });
  const tooShort = { x: 0, y: 0, w: 248, h: 70 };
  assert.equal(findDrawerRect(tooShort, []), null);
  assert.deepEqual(findDrawerRect(tooShort, [], { collapsed: true }), { x: 8, y: 8, w: 232, h: 34 });
  assert.equal(findDrawerRect({ x: 0, y: 0, w: 110, h: 240 }, []), null);
  assert.equal(findDrawerRect({ x: 0, y: 0, w: 110, h: 240 }, [], { collapsed: true }), null);
  assert.equal(findDrawerRect({ x: 0, y: 0, w: 112, h: 240 }, []).w, 96);
  assert.equal(findDrawerRect({ x: 0, y: 0, w: 248, h: 49 }, [], { collapsed: true }), null);
});

test('seeded random maps preserve whole-card, ownership, obstacle and line invariants', () => {
  let seed = 0x5a17e202;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let iteration = 0; iteration < 60; iteration++) {
    const w = 320 + Math.floor(random() * 700);
    const h = 240 + Math.floor(random() * 500);
    const count = 2 + Math.floor(random() * 6);
    const nodes = Array.from({ length: count }, (_, i) => node(`node-${i}`,
      12 + random() * (w - 64), 12 + random() * (h - 64), 28 + random() * 22, 28 + random() * 22));
    const cards = nodes.map(n => ({ id: n.id, w: 100 + Math.floor(random() * 150), h: 50 + Math.floor(random() * 170) }));
    if (iteration % 5 === 0) for (const card of cards) card.alternatives = [
      { w: Math.max(80, card.w - 30), h: card.h + 25 }, { w: card.w + 30, h: Math.max(30, card.h - 15) },
    ];
    const controls = random() < 0.5 ? [{ x: 0, y: h - 40, w, h: 40 }] : [];
    const s = snapshot({ viewport: { x: 0, y: 0, w, h }, nodes, cards, controls });
    if (iteration % 3 === 0) s.drawer = findDrawerRect(s.viewport, controls, { width: 180 });
    const result = placeCards(s);
    assert.equal(result.diagnostics.verified, true);
    assertInvariants(s, result);
    const reordered = placeCards({ ...s, nodes: [...nodes].reverse(), cards: [...cards].reverse() });
    assert.deepEqual(reordered.placements, result.placements);
    assert.deepEqual(reordered.overflow, result.overflow);
  }
});
