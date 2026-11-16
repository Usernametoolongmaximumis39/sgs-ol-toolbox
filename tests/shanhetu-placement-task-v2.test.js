import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createPlacementTask, placeCards, validatePlacement } from '../src/plugins/shanhetu/placement.js';

function fixture() {
  return { viewport: { x: 0, y: 0, w: 1200, h: 800 }, previous: [],
    controls: [{ x: 370, y: 100, w: 60, h: 80 }],
    nodes: Array.from({ length: 4 }, (_, i) => ({ id: i, anchor: {
      x: 120 + i % 2 * 560, y: 250 + Math.floor(i / 2) * 330, w: 90, h: 70 }, regions: [] })),
    cards: Array.from({ length: 4 }, (_, id) => ({ id, w: 220, h: 130,
      alternatives: [{ w: 170, h: 170 }, { w: 280, h: 112 }] })) };
}

function drain(task, budgetMs) {
  let progress, steps = 0, maximumStepMs = 0;
  do {
    const start = performance.now(); progress = task.step(budgetMs);
    maximumStepMs = Math.max(maximumStepMs, performance.now() - start);
    assert(++steps < 20000, 'finite work must finish without a recursive polling loop');
    assert.equal(progress.cancelled, false);
    if (!progress.done) assert.equal(progress.result, null, 'no partially verified layout may escape');
  } while (!progress.done);
  return { result: progress.result, steps, maximumStepMs };
}

test('cooperative budgets preserve every candidate diagnostic, layout preference and final placement', t => {
  const snapshot = fixture(), expected = placeCards(snapshot);
  for (const budgetMs of [0, 0.25, 4]) {
    const observed = drain(createPlacementTask(snapshot), budgetMs);
    assert.deepEqual(observed.result, expected);
    assert(observed.steps > 1, 'search genuinely pauses before it finishes');
    for (const p of observed.result.placements) assert.equal(validatePlacement(snapshot, p,
      observed.result.placements.filter(other => other !== p)).valid, true);
    t.diagnostic(JSON.stringify({ budgetMs, steps: observed.steps, maximumStepMs: observed.maximumStepMs }));
  }
});

test('cancelling before or during candidate search closes the task and never publishes stale results', () => {
  for (const stepsBeforeCancel of [0, 1, 8]) {
    const task = createPlacementTask(fixture());
    for (let i = 0; i < stepsBeforeCancel; i++) assert.equal(task.step(0).done, false);
    task.cancel(); task.cancel();
    for (let i = 0; i < 3; i++) assert.deepEqual(task.step(4), { done: true, cancelled: true, result: null });
  }
  const replacement = fixture(); replacement.nodes[0].anchor.x += 20;
  assert.deepEqual(drain(createPlacementTask(replacement), 4).result, placeCards(replacement));
});

test('an in-flight task owns a geometry and measured-size snapshot independent of caller mutations', () => {
  const snapshot = fixture(), expected = placeCards(snapshot), task = createPlacementTask(snapshot);
  assert.equal(task.step(0).done, false);
  snapshot.viewport.w = 1; snapshot.nodes[0].anchor.x = Infinity;
  snapshot.nodes[1].regions.push({ x: 0, y: 0, w: 1200, h: 800 });
  snapshot.cards[0].alternatives[0].h = 1; snapshot.cards.pop();
  snapshot.controls.push({ x: 0, y: 0, w: 1200, h: 800 });
  assert.deepEqual(drain(task, 4).result, expected);
});

test('completed and invalid tasks have stable terminal states and cancellation drops their result', () => {
  const snapshot = { ...fixture(), viewport: { x: 0, y: 0, w: -1, h: 800 } };
  const task = createPlacementTask(snapshot), terminal = task.step(0);
  assert.equal(terminal.done, true); assert.equal(terminal.cancelled, false);
  assert.deepEqual(terminal.result, placeCards(snapshot));
  assert.deepEqual(task.step(4), terminal);
  task.cancel(); assert.deepEqual(task.step(4), { done: true, cancelled: true, result: null });
});
