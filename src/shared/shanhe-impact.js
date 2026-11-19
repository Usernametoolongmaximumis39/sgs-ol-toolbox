import season5 from './shanhe-impact-season-5.json' with { type: 'json' };

export const attributes = Object.freeze({
  rep: '声望', tro: '战功', wis: '智谋', mar: '商才', loy: '忠诚', ass: '权谋', cha: '魅力',
});
const impactBySeason = new Map([[season5.season, season5]]);

export function hasOptionImpactData(season) {
  return impactBySeason.has(Number(season));
}

export function optionImpact(season, option) {
  const table = impactBySeason.get(Number(season)), id = Number(option);
  if (!table || !Number.isSafeInteger(id) || id <= 0) return null;
  const row = table.options[id];
  if (!row) return null;
  const changes = row.delta.flatMap((value, index) => value
    ? [`${attributes[table.attributes[index]]} ${value > 0 ? '+' : '−'}${Math.abs(value)}`] : []);
  return changes.length ? { changes, samples: row.samples, consistency: row.consistency } : null;
}
