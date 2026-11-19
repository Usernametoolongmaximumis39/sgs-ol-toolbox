const grades = ['普通', '稀有', '史诗', '传说'];
const requirements = ['needputong', 'needxiyou', 'needshishi', 'needchuanshuo'];

function tacticSchools(tactic) {
  return new Set(String(tactic?.school ?? '').split(',').map(Number)
    .filter(id => Number.isSafeInteger(id) && id > 0 && id < 100));
}

export function schoolProgress(schools, tactics, inventory, season) {
  if (!schools.length || !Array.isArray(inventory) || !(Number(season) > 0)) return null;
  const counts = new Map();
  for (const id of inventory) {
    const tactic = tactics.get(String(id));
    const level = Number(tactic?.level);
    if (!Number.isInteger(level) || level < 1 || level > 4) continue;
    for (const school of tacticSchools(tactic)) {
      const row = counts.get(school) || [0, 0, 0, 0];
      row[level - 1]++;
      counts.set(school, row);
    }
  }
  return schools.flatMap(school => {
    const seasons = String(school.seasonID ?? school.SeasonList ?? '').split(/[;,]/).filter(Boolean).map(Number);
    if (seasons.length && !seasons.includes(Number(season))) return [];
    const id = Number(school.school);
    if (!(id > 0 && id < 100) || !school.name) return [];
    const owned = counts.get(id);
    const tiers = requirements.map((key, index) => ({
      grade: grades[index], need: Number(school[key] ?? 0), count: owned?.[index] ?? 0,
    })).filter(tier => Number.isSafeInteger(tier.need) && tier.need > 0);
    if (!tiers.length) return [];
    const done = tiers.reduce((sum, tier) => sum + Math.min(tier.count, tier.need), 0);
    const total = tiers.reduce((sum, tier) => sum + tier.need, 0);
    return [{ id, name: school.name, tiers, done, total, met: done === total }];
  }).sort((a, b) => Number(b.met) - Number(a.met) || b.done / b.total - a.done / a.total || a.id - b.id);
}

export function schoolMatcher(tactics, schools, followed) {
  const missing = new Map((schools || []).filter(school => followed.has(school.id) && !school.met)
    .map(school => [school.id, {
      name: school.name, grades: new Set(school.tiers.filter(tier => tier.count < tier.need).map(tier => tier.grade)),
    }]));
  if (!missing.size) return null;
  return (id, type) => {
    if (Number(type) !== 2) return [];
    const tactic = tactics.get(String(id));
    const grade = grades[Number(tactic?.level) - 1];
    return [...tacticSchools(tactic)].flatMap(school => {
      const target = missing.get(school);
      return target?.grades.has(grade) ? [{ school, name: target.name }] : [];
    });
  };
}
