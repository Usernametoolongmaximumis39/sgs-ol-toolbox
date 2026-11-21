import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { confirmedBaishengHashes } from '../src/plugins/appearances/confirmed-mode-hashes.js';
import { nativeModeEvidence, nativeModeId, reviewModeEvidence } from '../src/plugins/appearances/mode-evidence.js';
import { modeId } from '../src/plugins/appearances/model.js';
test('native model IDs are not old normalized labels, and lobby labels do not override an unsupported real mode', () => {
  assert.equal(nativeModeId(132), 26); assert.equal(nativeModeId(148), 35); assert.equal(nativeModeId(149), 35); assert.equal(nativeModeId(160), 44);
  for (const value of [26, 35, 44, 5, 133, 147]) assert.equal(nativeModeId(value), 0);
  for (const value of [26, 35, 44]) assert.equal(modeId(value), value);
  for (const value of [132, 148, 149, 160]) assert.equal(modeId(String(value)), nativeModeId(value));
  assert.equal(nativeModeEvidence({ GetModeType: () => 5, GetModeVO: () => ({ Model: 132 }) }).mode, 0);
  assert.equal(nativeModeEvidence({ GetModeType: () => 132, GetModeVO: () => ({ Model: 26 }) }).mode, 26);
  assert.equal(nativeModeEvidence({}).mode, 0);
});
test('the compact evidence table preserves all 839 confirmed hashes', () => {
  const hashes = [...confirmedBaishengHashes()];
  assert.equal(hashes.length, 839);
  assert.equal(createHash('sha256').update(hashes.join('')).digest('hex'), '59343ed2ef556e7e3a04df3466b3231aa99e31aaf0e42ccbda5fd2201a1fa1c1');
});
test('records are never removed just because they have eight candidates, a short interval, or the confirmed date', async () => {
  const row = { source: 'xiaochao', id: 'xc:unrelated-record', mode: 26, time: 1791075017589, general: [1,2,3,4,5,6,7,8], selected: [1] };
  const records = [row]; assert.equal(await reviewModeEvidence(records, 41), records);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(reviewModeEvidence(records, 41, { signal: controller.signal }), /取消/);
});
