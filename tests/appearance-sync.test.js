import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeSyncMatches, mergeSyncMatches } from '../src/plugins/appearances/match-sync.js';
import { mergeHistory } from '../src/plugins/appearances/history.js';

const gameId = '18446744073709551615', endedAt = Math.floor(Date.now() / 1000) * 1000;
const match = { gameId, mode: 26, rawMode: 132, rawGroup: 3, endedAt, duration: 141, result: 0, general: [5], position: 4, figure: null };
const confirmed = { ...match, id: 'local', modeEvidence: 'official-history', source: 'official-history', time: endedAt - 150000 };

test('appearance sync: exports only confirmed projections and waits for official verification of a restored match', async () => {
  const restored = { ...confirmed, syncUnverified: true };
  const other = [restored, { ...confirmed, gameId: undefined }, { ...confirmed, source: 'local-sync' },
    { ...confirmed, modeEvidence: 'native-settlement' }, { ...confirmed, gameId: '18446744073709551616' }];
  const transport = async (_account, rows) => rows;
  const frame = { id: 'local', mode: 26, time: confirmed.time, general: [3, 5], selected: [5], source: 'toolbox' };
  assert.deepEqual(await exchangeSyncMatches(transport, '41', [frame], other), []);
  assert.deepEqual(await exchangeSyncMatches(transport, '41', [], [...other, confirmed]), [match]);
  assert.deepEqual(await exchangeSyncMatches(transport, '41', [{ ...frame, selected: [3] }], [confirmed]), [match]);
  const rows = [{ ...match, label: 13203, ended: endedAt / 1000 + 28800 }];
  const verified = mergeHistory([], [restored], { mode: 26, rows });
  assert.equal(verified.matches.length, 1);
  assert.equal(verified.matches[0].id, confirmed.id);
  const joined = { ...match, frame: { time: confirmed.time, general: [3, 5] } };
  assert.deepEqual(await exchangeSyncMatches(transport, '41', [frame], verified.matches), [joined]);
  assert.deepEqual(mergeSyncMatches([frame], [], [joined]), { addedMatches: [], addedFrames: [], skipped: 1 });
  const received = mergeSyncMatches([], [], [match]);
  assert.equal(received.addedMatches[0].id, `official:${gameId}`);
  const backfilled = mergeSyncMatches([], received.addedMatches, [joined]);
  assert.equal(backfilled.addedMatches.length, 0);
  assert.ok([...received.addedMatches, ...backfilled.addedFrames].every(row => !Object.hasOwn(row, 'isAiMatch')));
  assert.deepEqual(backfilled.addedFrames.map(({ id, general, selected }) => ({ id, general, selected })),
    [{ id: received.addedMatches[0].id, general: [3, 5], selected: [5] }]);
  assert.deepEqual(mergeSyncMatches(backfilled.addedFrames, received.addedMatches, [joined]), { addedMatches: [], addedFrames: [], skipped: 0 });
});
