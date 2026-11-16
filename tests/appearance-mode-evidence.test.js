import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeModeEvidence, nativeModeId, reviewModeEvidence } from '../src/plugins/appearances/mode-evidence.js';
test('native model IDs are not old normalized labels, and lobby labels do not override an unsupported real mode', () => {
  assert.equal(nativeModeId(132), 26); assert.equal(nativeModeId(148), 35); assert.equal(nativeModeId(160), 44);
  for (const value of [26, 35, 44, 5, 133, 147]) assert.equal(nativeModeId(value), 0);
  assert.equal(nativeModeEvidence({ GetModeType: () => 5, GetModeVO: () => ({ Model: 132 }) }).mode, 0);
  assert.equal(nativeModeEvidence({ GetModeType: () => 132, GetModeVO: () => ({ Model: 26 }) }).mode, 26);
  assert.equal(nativeModeEvidence({}).mode, 0);
});
test('records are never removed just because they have eight candidates, a short interval, or the confirmed date', async () => {
  const row = { source: 'xiaochao', id: 'xc:unrelated-record', mode: 26, time: 1791075017589, general: [1,2,3,4,5,6,7,8], selected: [1] };
  const records = [row]; assert.equal(await reviewModeEvidence(records, 41), records);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(reviewModeEvidence(records, 41, { signal: controller.signal }), /取消/);
});
