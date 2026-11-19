import test from 'node:test';
import assert from 'node:assert/strict';
import { statsMode, hundredRate, ddzRoleRates, currentStreak, rankSummary, placeStats, placeStatsMarker } from '../src/plugins/player-info/stats-model.js';
import { officerTone, officerColor } from '../src/plugins/player-info/officer-style.js';
test('officer colors follow user groups including three commander ranks and separate golden protector', () => {
  for (const name of ['骁卒','校尉','郎将','偏将军']) assert.equal(officerTone(name), 'gray');
  for (const name of ['将军','上将军','国护军','骠骑将军']) assert.equal(officerTone(name), 'purple');
  assert.equal(officerTone('卫将军'), 'green'); assert.equal(officerTone('车骑将军'), 'blue');
  assert.equal(officerTone('国都护'), 'gold');
  for (const name of ['大将军','大司马']) assert.equal(officerTone(name), 'red');
  assert.equal(officerTone('官阶未知'), null);
  assert.notEqual(officerColor('大司马','#ffffff','fallback'), officerColor('大司马','#201e1a','fallback'));
  assert.equal(officerColor('官阶未知','#ffffff','fallback'), 'fallback');
});
test('only native ranked, single rider and normal DDZ modes have player statistics', () => {
  for (const n of [132, 148, 149, 160]) assert.ok(statsMode(n));
  for (const n of [26, 35, 44, 73, 74, 175, 133, undefined]) assert.equal(statsMode(n), null);
});
test('hundred rate uses combined wins over total, never average of landlord and farmer percentages', () => {
  assert.equal(hundredRate({ WinCount: 62, TotalCount: 100, DiZhuWinRate: '72%', NongMinWinRate: '56%' }), '62.0%');
  assert.equal(hundredRate({ WinCount: 0, TotalCount: 100 }), '0.0%');
  for (const d of [{}, { WinCount: 0, TotalCount: 0 }, { WinCount: 120, TotalCount: 100 }]) assert.equal(hundredRate(d), null);
});
test('streak sorts newest first and stops at changed, drawn or unknown results', () => {
  const rows = [[2, 1], [5, 0], [4, 0], [3, 255]].map(([GameOverTime, GameResult]) => ({ GameOverTime, GameResult }));
  assert.deepEqual(currentStreak(rows), { count: 2, win: true, lowerBound: false });
  assert.deepEqual(currentStreak([{ GameOverTime: 10, GameResult: 1 }]), { count: 1, win: false, lowerBound: true });
  assert.equal(currentStreak([{ GameOverTime: 10, GameResult: 255 }]), null);
  assert.equal(currentStreak([{ GameResult: 0 }]), null);
});
test('native redacted records retain result order without timestamps; mixed missing times stay unknown', () => {
  const rows = [1, 1, 1, 0].map(GameResult => ({ GameOverTime: 0, GameResult }));
  assert.equal(currentStreak(rows), null);
  assert.deepEqual(currentStreak(rows, { nativeOrder: true }), { count: 3, win: false, lowerBound: false });
  assert.equal(currentStreak([{ GameOverTime: 10, GameResult: 0 }, { GameOverTime: 0, GameResult: 0 }], { nativeOrder: true }), null);
});
test('rank uses current season, official star thresholds, and preserves unknowns', () => {
  const config = { TTRankCfg: [{ rankType: 7, RankLevelCfg: { Item: [{ Rank: 21, RankName: '枭雄' }] },
    Common: [{ xiaoxiongShow: '24,无双枭雄,21;49,无双枭雄,22;99,盖世枭雄,23' }] }] };
  const data = { curCycData: { roundId: 11, curRecord: { winCnt: 127, loseCnt: 66, maxLevel: { level: 22, star: 44 } } } };
  assert.deepEqual(rankSummary(data, config), { rate: '65.8%', name: '无双枭雄', stars: 44, season: 11 });
  assert.equal(rankSummary({}, config), null);
});
test('panels stay at portrait sides, avoid teammate hand strip and never overlap another panel', () => {
  const avatar = { x: 250, y: 90, width: 135, height: 172 }, stage = { width: 1280, height: 800 };
  const bar = { x: 200, y: 262, width: 500, height: 90 };
  const a = placeStats(avatar, [avatar, bar], stage); assert.ok(a); assert.equal(a.x, 397); assert.ok(a.y + a.height < bar.y);
  const b = placeStats(avatar, [avatar, bar, a], stage); assert.ok(b); assert.ok(b.x + b.width <= a.x || b.y >= a.y + a.height);
  assert.equal(placeStats(avatar, [{ x: 0, y: 0, width: 1280, height: 800 }], stage), null);
});
test('left and right teammates avoid actual vertical native hand strip in mirrored layouts', () => {
  const stage = { width: 1280, height: 800 };
  for (const [x, handX] of [[5, 145], [930, 866]]) {
    const avatar = { x, y: 280, width: 135, height: 172 }, bar = { x: handX, y: 340, width: 59, height: 100 };
    const p = placeStats(avatar, [avatar, bar], stage); assert.ok(p);
    assert.ok(p.x + p.width <= bar.x || p.x >= bar.x + bar.width || p.y + p.height <= bar.y || p.y >= bar.y + bar.height);
  }
});

test('collapsed stats stay at the portrait edge and mirror towards the table', () => {
  const stage = { width: 1280, height: 800 }, size = 28;
  const left = { x: 20, y: 40, width: 270, height: 172 }, right = { ...left, x: 990 };
  assert.deepEqual(placeStatsMarker(left, [left], stage, size), { x: 294, y: 44, width: 28, height: 28 });
  assert.deepEqual(placeStatsMarker(right, [right], stage, size), { x: 958, y: 44, width: 28, height: 28 });

  const tip = { x: 290, y: 40, width: 50, height: 32 };
  assert.deepEqual(placeStatsMarker(left, [left, tip], stage, size), { x: 294, y: 72, width: 28, height: 28 });
  const selection = { ...tip, height: 140 };
  assert.deepEqual(placeStatsMarker(left, [left, selection], stage, size), { x: 258, y: 8, width: 28, height: 28 });
  assert.equal(placeStatsMarker(left, [left, selection, { x: 0, y: 0, width: 320, height: 40 }], stage, size), null);
});

test('DDZ role rates preserve zero and missing percentages', () => {
 assert.equal(ddzRoleRates({DiZhuWinRate:'72%',NongMinWinRate:'56%'}), '地主胜率 72% · 农民胜率 56%');
 assert.equal(ddzRoleRates({DiZhuWinRate:'0%',NongMinWinRate:'100%'}), '地主胜率 0% · 农民胜率 100%');
 assert.equal(ddzRoleRates({DiZhuWinRate:'101%'}), '地主胜率 未知 · 农民胜率 未知');
});
