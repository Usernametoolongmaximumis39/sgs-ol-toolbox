import { field } from '../../shared/info-runtime.js';
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
export function projectAchievements(packet) {
  const rows = field(packet, 'Achs'), nickname = field(packet, 'NickName'), requestType = num(field(packet, 'requestType'));
  if (requestType !== 0 || typeof nickname !== 'string' || !Array.isArray(rows) || rows.length > 20000) return null;
  const finish = {}, progress = {};
  for (const raw of rows) {
    const row = raw?.ProtoObj || raw?.protoObj || raw;
    const id = num(row?.id ?? row?.ID), type = num(row?.type ?? row?.Type), value = num(row?.detailInfo ?? row?.DetailInfo);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(type)) throw new Error('战功条目格式无效');
    // TYPE_UNLOCK/DELETE/USING records need not carry detailInfo in the native protocol.
    if (!(type & 3)) continue;
    if (!Number.isFinite(value) || value < 0) throw new Error('战功进度或完成时间无效');
    if ((type & 1) && value > 0) finish[id] = Math.max(finish[id] || 0, value);
    else if (type & 2) progress[id] = Math.max(progress[id] || 0, value);
  }
  return { nickname, finish, progress, at: Date.now() };
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
