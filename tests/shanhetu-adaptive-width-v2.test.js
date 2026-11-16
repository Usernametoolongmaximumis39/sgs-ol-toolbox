import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCards, validatePlacement, comparePlacementResults } from '../src/plugins/shanhetu/placement.js';

const coordinates = [[-379, 181], [47, 144], [350, 54], [-475, 86],
  [-74, -118], [-532, -66], [152, -83], [-131, 71]];
// Official city PNG outer dimensions, preserving the whole image rectangle.
const imageSizes = [[118, 87], [115, 87], [116, 87], [129, 87],
  [121, 87], [130, 87], [123, 87], [139, 90]];
const widths = [160, 170, 190, 220, 250, 280, 320];
// Actual Laya measurements of the screenshot's complete content at the same
// font and font size. These are not area-ratio or estimated text heights.
const measuredHeights = {
  5026: [202, 166, 148, 148, 148, 148, 130],
  5027: [183, 165, 147, 147, 147, 147, 129],
  5028: [147, 129, 111, 111, 111, 111, 93],
};

function officialSnapshot({ w = 1220, h = 732, originalApproximation = false, alternatives = false } = {}) {
  const direction = w / 1220;
  const nodes = coordinates.map(([x, y], index) => {
    const [iw, ih] = originalApproximation ? [116, 90] : imageSizes[index];
    return { id: 5021 + index,
      anchor: { x: x * direction, y: -y * direction, w: iw * direction, h: ih * direction }, regions: [] };
  });
  // Native control positions remain the explicit fixture model, not a claim
  // that this is a live account snapshot. Their full rectangles are protected.
  const controls = [
    { x: -w / 2 + 150, y: -h / 2 + 8, w: w - 300, h: 30 },
    { x: -w / 2 + 125, y: -h / 2 + 37, w: 79, h: 35 },
    { x: -w / 2 + 12, y: -h / 2 + 170, w: 76, h: 32 },
    { x: w / 2 - 130, y: h / 2 - 170, w: 130, h: 170 },
    { x: w / 2 - 470, y: h / 2 - 122, w: 325, h: 122 },
    { x: w / 2 - 280, y: h / 2 - 192, w: 122, h: 62 },
    { x: w / 2 - 585, y: h / 2 - 122, w: 106, h: 122 },
  ];
  const cards = [5026, 5027, 5028].map(id => ({ id, w: 220, h: measuredHeights[id][3],
    ...(alternatives ? { alternatives: widths.flatMap((width, index) => width === 220 ? []
      : [{ w: width, h: measuredHeights[id][index] }]) } : {}) }));
  return { viewport: { x: -w / 2, y: -h / 2, w, h }, nodes, controls, cards, previous: [] };
}

function checkAll(snapshot, result) {
  assert.deepEqual(result.overflow, []);
  assert.equal(result.placements.length, snapshot.cards.length);
  assert.equal(result.diagnostics.verified, true);
  for (const p of result.placements)
    assert.deepEqual(validatePlacement(snapshot, p, result.placements.filter(other => other !== p)), { valid: true, reasons: [] });
}

test('a measured full 170×165 card improves the screenshot corridor to the preferred above position', () => {
  const fixed = officialSnapshot({ originalApproximation: true });
  const before = placeCards(fixed);
  assert(!before.diagnostics.preferredAboveIds.includes(5027));
  const snapshot = officialSnapshot({ originalApproximation: true, alternatives: true });
  const witness = { id: 5027, x: 171.5, y: -90, w: 170, h: 165,
    line: { fromX: 210, fromY: 83, toX: 210, toY: 75 } };
  assert.deepEqual(validatePlacement(snapshot, witness, before.placements.filter(p => p.id !== 5027)), { valid: true, reasons: [] });
  const result = placeCards(snapshot);
  checkAll(snapshot, result);
  assert(result.diagnostics.preferredAboveIds.includes(5027));
  assert(result.diagnostics.preference.aboveCount > before.diagnostics.preference.aboveCount);
  assert(comparePlacementResults(result, before) < 0, 'the renderer can adopt an above improvement without requiring overflow');
});

for (const [w, h] of [[1220, 732], [1299, 739]]) {
  test(`official image bounds and native direction at ${w}×${h} admit all three complete cards`, () => {
    const fixed = officialSnapshot({ w, h });
    const before = placeCards(fixed);
    assert(!before.diagnostics.preferredAboveIds.includes(5027));
    const snapshot = officialSnapshot({ w, h, alternatives: true });
    const result = placeCards(snapshot);
    checkAll(snapshot, result);
    const card = result.placements.find(p => p.id === 5027);
    assert(widths.some((width, index) => card.w === width && card.h === measuredHeights[5027][index]));
    assert(result.diagnostics.preferredAboveIds.includes(5027));
    assert(comparePlacementResults(result, before) < 0);
    assert(Math.abs(Math.hypot(card.line.toX - card.line.fromX, card.line.toY - card.line.fromY) - 8) < 1e-7);
    const reordered = { ...snapshot, nodes: [...snapshot.nodes].reverse(), cards: [...snapshot.cards].reverse()
      .map(c => ({ ...c, alternatives: [...c.alternatives].reverse() })) };
    assert.deepEqual(placeCards(reordered).placements, result.placements);
    assert.deepEqual(placeCards({ ...snapshot, previous: result.placements }).placements, result.placements);
  });
}

test('candidate retention covers every measured size even when default positions fill the budget', () => {
  const snapshot = { viewport: { x: 0, y: 0, w: 1200, h: 800 },
    nodes: [{ id: 'a', anchor: { x: 550, y: 350, w: 80, h: 60 }, regions: [] }], controls: [], previous: [],
    cards: [{ id: 'a', w: 220, h: 120, alternatives: widths.filter(w => w !== 220).map(w => ({ w, h: 120 })) }] };
  const result = placeCards(snapshot);
  checkAll(snapshot, result);
  assert.equal(result.placements[0].w, 220, 'default width remains preferred when all content already fits');
  const counts = result.diagnostics.candidateCounts[0];
  assert(counts.legal > 48, 'the test actually exercises candidate pruning');
  assert.equal(counts.sizes.length, 7);
  assert(counts.sizes.every(size => size.legal > 0 && size.retained > 0), 'no measured width loses all representatives');
  assert(counts.retained <= 77, 'the seven-size/category/direction retention budget remains bounded');
});

test('a negligible UI coverage reduction does not justify a narrower and taller rewrap', () => {
  const snapshot = { viewport: { x: 0, y: 0, w: 800, h: 600 },
    nodes: [{ id: 'a', anchor: { x: 380, y: 300, w: 40, h: 40 }, regions: [] }], previous: [],
    controls: [{ x: 370, y: 270, w: 60, h: 30 }],
    cards: [{ id: 'a', w: 190, h: 120, alternatives: [{ w: 160, h: 156 }] }] };
  const narrowOnly = placeCards({ ...snapshot, cards: [{ id: 'a', w: 160, h: 156 }] });
  const defaultOnly = placeCards({ ...snapshot, cards: [{ id: 'a', w: 190, h: 120 }] });
  assert.equal(narrowOnly.diagnostics.preference.uiOverlapArea, defaultOnly.diagnostics.preference.uiOverlapArea);
  const uiSaving = defaultOnly.diagnostics.preference.uiCost - narrowOnly.diagnostics.preference.uiCost;
  assert(uiSaving > 0 && uiSaving < 0.3, 'same UI pixels previously favoured the taller narrow card by a tiny ratio difference');
  const result = placeCards(snapshot);
  checkAll(snapshot, result);
  assert.equal(result.diagnostics.preference.aboveCount, 1);
  assert.equal(result.placements[0].w, 190);
  assert.equal(result.placements[0].h, 120);
  assert.equal(result.diagnostics.preference.reflowCost, 0);
  assert.deepEqual(placeCards({ ...snapshot, previous: result.placements }).placements, result.placements);
});

test('reflow cost never prevents a narrow complete card required by a protected city corridor', () => {
  const snapshot = { viewport: { x: 0, y: 0, w: 600, h: 400 }, controls: [], previous: [],
    nodes: [
      { id: 'own', anchor: { x: 260, y: 320, w: 80, h: 40 }, regions: [] },
      { id: 'left', anchor: { x: 0, y: 0, w: 210, h: 400 }, regions: [] },
      { id: 'right', anchor: { x: 400, y: 0, w: 200, h: 400 }, regions: [] },
    ], cards: [{ id: 'own', w: 220, h: 147 }] };
  assert.equal(placeCards(snapshot).placements.length, 0);
  snapshot.cards[0].alternatives = [{ w: 170, h: 165 }];
  const result = placeCards(snapshot);
  checkAll(snapshot, result);
  assert.equal(result.diagnostics.preference.aboveCount, 1);
  assert.equal(result.placements[0].w, 170);
  assert.equal(result.placements[0].h, 165);
  assert(result.diagnostics.preference.reflowCost > 0, 'the soft penalty is paid instead of rejecting a complete card');
});

test('only exact measured size pairs are accepted and connector length follows the selected width', () => {
  const snapshot = { viewport: { x: 0, y: 0, w: 800, h: 600 },
    nodes: [{ id: 'a', anchor: { x: 100, y: 100, w: 40, h: 40 }, regions: [] }], controls: [], previous: [],
    cards: [{ id: 'a', w: 220, h: 100, alternatives: [{ w: 240, h: 80 }, { w: 120, h: 140 }] }] };
  const wide = { id: 'a', x: 370, y: 100, w: 240, h: 80,
    line: { fromX: 140, fromY: 120, toX: 370, toY: 120 } };
  assert.equal(validatePlacement(snapshot, wide).valid, true, '230px line is within the selected 240px width');
  assert(validatePlacement(snapshot, { ...wide, w: 120, h: 140 }).reasons.includes('connector-too-long'));
  assert(validatePlacement(snapshot, { ...wide, h: 100 }).reasons.includes('changed-card-size'), 'mixing two measured pairs is not allowed');
  assert(validatePlacement(snapshot, { ...wide, h: 79 }).reasons.includes('changed-card-size'), 'cropped heights remain forbidden');
  for (const alternatives of [null, {}, [{ w: 170, h: NaN }], [{ w: 0, h: 100 }],
    Array.from({ length: 7 }, (_, i) => ({ w: 100 + i, h: 90 }))]) {
    const rejected = placeCards({ ...snapshot, cards: [{ ...snapshot.cards[0], alternatives }] });
    assert.equal(rejected.placements.length, 0);
    assert(rejected.diagnostics.errors.length > 0, 'invalid or unbounded size lists fail conservatively');
  }
});
