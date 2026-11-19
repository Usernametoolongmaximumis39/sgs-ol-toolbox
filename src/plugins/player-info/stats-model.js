export function statsMode(raw) {
  return ({ 132: { kind: 'rank', tab: 1, record: 26 }, 148: { kind: 'ddz', tab: 9, record: 35 },
    149: { kind: 'ddz', tab: 9, record: 35 }, 160: { kind: 'single', tab: 12, record: 44 } })[raw] || null;
}
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
export function hundredRate(data) {
  const total = count(data?.TotalCount), wins = count(data?.WinCount);
  return total && wins !== null && wins <= total ? (100 * wins / total).toFixed(1) + '%' : null;
}
export function ddzRoleRates(data) {
  const rate = v => typeof v === 'string' && /^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%$/.test(v) ? v : '未知';
  return '地主胜率 ' + rate(data?.DiZhuWinRate) + ' · 农民胜率 ' + rate(data?.NongMinWinRate);
}
export function currentStreak(records, { nativeOrder = false } = {}) {
  if (!Array.isArray(records) || !records.length || records.length > 100) return null;
  const rows = records.map(r => ({ at: r?.GameOverTime, result: r?.GameResult }));
  if (rows.every(r => Number.isFinite(r.at) && r.at > 0)) rows.sort((a, b) => b.at - a.at);
  else if (!nativeOrder || !rows.every(r => r.at == null || r.at === 0)) return null;
  const first = rows[0].result;
  if (first !== 0 && first !== 1) return null;
  let n = 0;
  for (const row of rows) { if (row.result !== first) break; n++; }
  // When the fetched history ends in the same run, its true length is unknown.
  return { count: n, win: first === 0, lowerBound: n === rows.length };
}
export function rankSummary(data, config) {
  const r = data?.curCycData?.curRecord;
  if (!r) return null;
  const wins = count(r.winCnt), losses = count(r.loseCnt);
  const level = r.maxLevel?.level, stars = count(r.maxLevel?.star);
  const cfg = (config?.TTRankCfg || config?.root?.TTRankCfg || []).find(c => Number(c.rankType) === 7);
  const levelRow = cfg?.RankLevelCfg?.Item?.find(c => Number(c.rank ?? c.Rank) === level);
  let name = levelRow?.rankName ?? levelRow?.RankName ?? null;
  if (level >= 21 && stars !== null) {
    const list = String(cfg?.Common?.[0]?.xiaoxiongShow || '').split(';').map(s => s.split(','));
    name = list.find(([max]) => Number(max) >= stars)?.[1] || name;
  }
  return { rate: wins !== null && losses !== null && wins + losses > 0 ? (100 * wins / (wins + losses)).toFixed(1) + '%' : null,
    name, stars, season: data.curCycData.roundId ?? null };
}
export const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const fits = (r, obstacles, stage) => r.x >= 6 && r.y >= 6 && r.x + r.width <= stage.width - 6 && r.y + r.height <= stage.height - 6
  && !obstacles.some(o => overlaps(r, o));

export function placeStatsMarker(avatar, obstacles, stage, size) {
  const gap = 4, top = Math.max(6, avatar.y + gap);
  const left = avatar.x - size - gap, right = avatar.x + avatar.width + gap;
  const towardsRight = avatar.x + avatar.width / 2 < stage.width / 2;
  const sides = towardsRight ? [right, left] : [left, right];
  for (const y of [top, top + size, top + 2 * size]) for (const x of sides) {
    const r = { x, y, width: size, height: size };
    if (fits(r, obstacles, stage)) return r;
  }
  const topLeft = avatar.x + gap, topRight = avatar.x + avatar.width - size - gap;
  for (const x of towardsRight ? [topRight, topLeft] : [topLeft, topRight]) {
    const r = { x, y: avatar.y - size - gap, width: size, height: size };
    if (fits(r, obstacles, stage)) return r;
  }
  return null;
}

export function placeStats(avatar, obstacles, stage, width = 230, height = 70) {
  const side = avatar.x + avatar.width / 2 < stage.width / 2 ? ['right', 'left'] : ['left', 'right'];
  const candidates = [];
  for (const direction of side) {
   const gaps = [12, ...obstacles.map(o => direction === 'right' ? o.x + o.width - avatar.x - avatar.width + 8 : avatar.x - o.x + 8)]
     .filter(n => n >= 12 && n <= 240).sort((a, b) => a - b);
   for (const gap of gaps) candidates.push({ direction, gap });
  }
  candidates.sort((a, b) => a.gap - b.gap || side.indexOf(a.direction) - side.indexOf(b.direction));
  for (const { direction, gap } of candidates) for (const dy of [6, 38, 70]) {
    const r = { x: direction === 'right' ? avatar.x + avatar.width + gap : avatar.x - width - gap,
      y: avatar.y + dy, width, height };
    if (fits(r, obstacles, stage)) return r;
  }
  return null;
}
