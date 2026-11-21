import season5 from './shanhe-impact-season-5.json' with { type: 'json' };
import { attributes } from './shanhe-attributes.js';

export { attributes };
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
