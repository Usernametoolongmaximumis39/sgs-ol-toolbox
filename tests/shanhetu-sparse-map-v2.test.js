import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCards, validatePlacement } from '../src/plugins/shanhetu/placement.js';

const city = (id, x, y, w, h) => ({ id, anchor: { x, y, w, h }, regions: [] });

function corridorSnapshot(extraControls = []) {
  return {
    viewport: { x: 0, y: 0, w: 1389, h: 795 },
    // A reduced counterexample: one event city, three passive cities and one
    // control. The empty corridor above 5027 has legal interior positions,
    // although positions aligned with either neighbouring edge are ambiguous.
    nodes: [city(5027, 867, 513, 140, 100), city(5003, 740, 260, 133, 67),
      city(5004, 600, 567, 140, 73), city(5005, 1147, 353, 147, 100)],
    controls: [{ x: 1060, y: 611, w: 140, h: 69 }, ...extraControls],
    cards: [{ id: 5027, w: 220, h: 190 }], previous: [],
  };
}

const witness = { id: 5027, x: 900, y: 300, w: 220, h: 190,
  line: { fromX: 937, fromY: 513, toX: 937, toY: 490 } };

test('a proven legal corridor interior must not be missed by edge-only candidates', t => {
  const snapshot = corridorSnapshot();
  assert.deepEqual(validatePlacement(snapshot, witness), { valid: true, reasons: [] },
    'independent witness satisfies every unchanged hard constraint');
  const result = placeCards(snapshot);
  assert.equal(result.placements.length, 1, 'do not send a demonstrably placeable full card to overflow');
  assert.deepEqual(result.overflow, []);
  assert.equal(validatePlacement(snapshot, result.placements[0]).valid, true);
  assert(result.diagnostics.candidateCounts[0].legal > 0);
  assert(result.diagnostics.candidateCounts[0].rejectedReasons['ambiguous-owner'] > 0,
    'ambiguous positions remain rejected, rather than weakening ownership');
  t.diagnostic(JSON.stringify(result.diagnostics.candidateCounts));
});

test('unrelated edge coordinates cannot evict the needed corridor midpoint from the 32-axis budget', t => {
  // Small controls at the very top generate more than 32 nearby x boundaries,
  // but do not obstruct the witness or any of its connecting line.
  const controls = Array.from({ length: 60 }, (_, index) => ({ x: 720 + index * 2.5, y: 8, w: 1, h: 1 }));
  const snapshot = corridorSnapshot(controls);
  assert.equal(validatePlacement(snapshot, witness).valid, true);
  const result = placeCards(snapshot);
  assert.equal(result.placements.length, 1);
  assert.deepEqual(result.overflow, []);
  assert.equal(validatePlacement(snapshot, result.placements[0]).valid, true);
  t.diagnostic(JSON.stringify(result.diagnostics.candidateCounts));
});

function screenshotApproximation() {
  // Screen-space city bounds estimated from the supplied 2083×1193 image,
  // divided by an approximate 1.5 display scale. This is a geometric regression,
  // not a claim to reproduce the official runtime snapshot. Card sizes below
  // were separately measured using actual Laya text and the full three contents.
  const r = (x, y, w, h) => ({ x: x / 1.5, y: y / 1.5, w: w / 1.5, h: h / 1.5 });
  const nodes = [[5026, 70, 740, 210, 150], [5028, 790, 500, 220, 150], [5027, 1300, 770, 210, 150],
    [5021, 340, 300, 200, 140], [5022, 1110, 390, 200, 100], [5023, 1720, 530, 220, 150],
    [5024, 180, 490, 200, 110], [5025, 900, 850, 210, 110]]
    .map(([id, ...values]) => ({ id, anchor: r(...values), regions: [] }));
  const controls = [[570, 25, 940, 110], [0, 285, 90, 100], [1072, 1030, 1010, 163],
    [1840, 950, 243, 243], [1590, 916, 210, 103], [870, 380, 80, 100], [535, 750, 270, 200]].map(values => r(...values));
  return { viewport: r(0, 0, 2083, 1193), nodes, controls, previous: [],
    cards: [{ id: 5026, w: 220, h: 148 }, { id: 5027, w: 220, h: 147 }, { id: 5028, w: 220, h: 111 }] };
}

test('three short full cards on the sparse screenshot approximation remain near their exact owners', t => {
  const snapshot = screenshotApproximation(), result = placeCards(snapshot);
  assert.equal(result.placements.length, 3);
  assert.deepEqual(result.overflow, []);
  for (const p of result.placements) assert.equal(validatePlacement(snapshot, p, result.placements.filter(q => q !== p)).valid, true);
  const reverse = placeCards({ ...snapshot, nodes: [...snapshot.nodes].reverse(), cards: [...snapshot.cards].reverse() });
  assert.deepEqual(reverse.placements, result.placements);
  t.diagnostic(JSON.stringify(result.diagnostics.candidateCounts));
});
