const list = value => Array.isArray(value) ? value : value ? [value] : [];
const num = value => value === null || value === undefined || value === '' ? NaN : Number(value);
export function validSnapshot(snapshot) {
  const map = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 20000
    && Object.entries(value).every(([key, v]) => /^[1-9]\d*$/.test(key) && typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return snapshot && typeof snapshot.nickname === 'string' && Number.isFinite(snapshot.at) && map(snapshot.finish) && map(snapshot.progress);
}
export function definitions(config, character) {
  const descriptions = new Map(list(character?.WuJiangs?.Zhangong).map(row => [num(row.id), row]));
  const source = config?.AchievementAll?.Achievement;
  if (!source) throw new Error('官方战功配置缺少 AchievementAll.Achievement');
  return list(source).map(raw => {
    const a = raw._attributes || raw, id = num(a.Id ?? a.id), desc = descriptions.get(id);
    return { id, characterId: num(a.characterId), flags: num(a.flags), name: String(desc?.name || a.name || ''), desc: String(desc?.describe || a.desc || a.describe || ''),
      criteria: list(raw.CriteriaEntry ?? raw.criteriaEntry).map(raw => { const c = raw._attributes || raw; return { id: num(c.Id ?? c.id), count: num(c.count) }; }).filter(c => c.id > 0 && c.count > 0) };
  }).filter(row => row.id > 0 && row.characterId > 0);
}
export function evaluate(defs, snapshot, names, owns = () => null) {
  const skill = new Map();
  for (const d of defs.filter(d => d.flags === 1024 || d.flags === 1025 || d.id === 1229)) {
    const previous = skill.get(d.characterId);
    skill.set(d.characterId, { desc: [previous?.desc, d.desc].filter(Boolean).join('\n'), completed: Boolean(previous?.completed || snapshot?.finish[d.id] > 0) });
  }
  return defs.filter(d => d.flags === 2048).map(d => {
    const required = d.criteria.reduce((sum, c) => sum + c.count, 0), value = snapshot ? d.criteria.reduce((sum, c) => sum + (snapshot.progress[c.id] || 0), 0) : null;
    const finishTime = snapshot?.finish[d.id] || null;
    return { ...d, name: names[d.characterId] || `武将 #${d.characterId}`, owned: owns(d.characterId), required, value,
      completed: snapshot ? Boolean(finishTime || (required > 0 && value >= required)) : null, finishTime, skill: skill.get(d.characterId) || null };
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.completed ? (a.finishTime || Infinity) - (b.finishTime || Infinity) : (b.value || 0) - (a.value || 0)) || a.characterId - b.characterId);
}
