import { field } from '../../shared/info-runtime.js';

const list = value => Array.isArray(value) ? value : value ? [value] : [];
const number = value => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const count = value => Number.isFinite(value) && value >= 0 ? value : 0;

// Only preferences persist. A role is deliberately absent from this schema.
export function cleanOptions(value = {}) {
  return { pick: ['off', 'random', 'order'].includes(value?.pick) ? value.pick : 'off', wait: value?.wait === true, cancelWuxie: value?.cancelWuxie !== false };
}

export function definitions(config) {
  const source = config?.AchievementAll?.Achievement;
  if (!source) throw new Error('官方战功配置缺少 AchievementAll.Achievement');
  const rows = list(source);
  if (rows.length > 20000) throw new Error('官方战功配置条目过多');
  return rows.map(raw => {
    const row = raw?._attributes || raw || {};
    const id = number(row.Id ?? row.id), characterId = number(row.characterId ?? row.CharacterId);
    const entries = list(raw?.CriteriaEntry ?? raw?.criteriaEntry);
    if (entries.length > 256) throw new Error('官方战功条件条目过多');
    const criteria = entries.map(raw => {
      const item = raw?._attributes || raw || {};
      return { id: number(item.Id ?? item.id), count: number(item.count) };
    }).filter(item => positiveId(item.id) && Number.isFinite(item.count) && item.count > 0);
    return { id, characterId, flags: number(row.flags), criteria };
  }).filter(row => positiveId(row.id) && positiveId(row.characterId));
}

// Accept only the native full achievement reply for the queried nickname.
// The controller is responsible for matching that nickname to its active run.
export function projectAchievements(packet) {
  const rows = field(packet, 'Achs'), nickname = field(packet, 'NickName');
  if (number(field(packet, 'requestType')) !== 0 || typeof nickname !== 'string' || !Array.isArray(rows) || rows.length > 20000) return null;
  const finish = {}, progress = {};
  for (const raw of rows) {
    const row = raw?.ProtoObj || raw?.protoObj || raw;
    const id = number(row?.id ?? row?.ID), type = number(row?.type ?? row?.Type);
    if (!positiveId(id) || !Number.isSafeInteger(type) || type < 0) throw new Error('战功条目格式无效');
    if (!(type & 3)) continue;
    const value = number(row?.detailInfo ?? row?.DetailInfo);
    if (!Number.isFinite(value) || value < 0) throw new Error('战功进度或完成时间无效');
    if ((type & 1) && value > 0) finish[id] = Math.max(finish[id] || 0, value);
    else if (type & 2) progress[id] = Math.max(progress[id] || 0, value);
  }
  return { nickname, finish, progress, at: Date.now() };
}

export function bannedGeneral(id, name) {
  return String(name || '').includes('黄盖');
}

export function evaluate(defs, snapshot, names = {}, owns = () => null) {
  const skill = new Set();
  if (snapshot) for (const row of defs) {
    if ((row.flags === 1024 || row.flags === 1025 || row.id === 1229) && count(snapshot.finish?.[row.id]) > 0) skill.add(row.characterId);
  }
  const result = new Map();
  for (const row of defs) {
    if (row.flags !== 2048) continue;
    const required = row.criteria.reduce((sum, item) => sum + item.count, 0);
    const progress = snapshot ? row.criteria.reduce((sum, item) => sum + count(snapshot.progress?.[item.id]), 0) : null;
    const completed = snapshot ? count(snapshot.finish?.[row.id]) > 0 || (required > 0 && progress >= required) : null;
    const owned = owns(row.characterId);
    const next = { id: row.characterId, name: String(names[row.characterId] || `武将 #${row.characterId}`), progress, required,
      completed, skillCompleted: snapshot ? skill.has(row.characterId) : null, owned: owned === true ? true : owned === false ? false : null };
    const previous = result.get(next.id);
    // Variant definitions may point at the same general. Completion from any
    // authoritative definition wins; otherwise retain its greatest progress.
    if (!previous || (!previous.completed && next.completed) || (previous.completed === next.completed && next.progress > previous.progress)) result.set(next.id, next);
  }
  return [...result.values()].sort((a, b) => a.id - b.id);
}

export function chooseGeneral(rows, { pick = 'order', currentId = 0, excludeId = 0, random = Math.random } = {}) {
  const eligible = rows.filter(row => row.owned === true && row.completed === false && positiveId(row.id) && !bannedGeneral(row.id, row.name));
  if (!eligible.length) return null;
  if (pick === 'random') {
    const current = eligible.find(row => row.id === Number(currentId));
    if (current) return current;
  }
  const alternatives = eligible.filter(row => row.id !== Number(excludeId));
  const pool = alternatives.length ? alternatives : eligible;
  if (pick === 'random') {
    const sample = Number(random());
    const fraction = Number.isFinite(sample) ? Math.min(1 - Number.EPSILON, Math.max(0, sample)) : 0;
    return pool[Math.floor(fraction * pool.length)];
  }
  return pool.slice().sort((a, b) => Number(b.skillCompleted === true) - Number(a.skillCompleted === true)
    || count(b.progress) - count(a.progress) || a.id - b.id)[0];
}
