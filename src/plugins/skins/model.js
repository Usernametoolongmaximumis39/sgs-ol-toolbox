export const QUALITY_NAMES = ['普通', '稀有', '史诗', '传说', '限定'];
const safe = fn => { try { return fn(); } catch { return undefined; } };
const positiveInteger = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// The collection catalogue uses the same official root.manu.item table as
// the original skin collection tool. It does not use skin-preview overrides.
export function readCatalogue(config) {
  const items = safe(() => config.root.manu.item);
  if (!Array.isArray(items) || !items.length) return { rows: [], ready: false, excluded: 0 };
  if (items.length > 30000) return { rows: [], ready: false, excluded: items.length };
  const rows = [], seen = new Set();
  let excluded = 0;
  for (const item of items) {
    const skinId = positiveInteger(safe(() => item.skinID));
    if (!skinId || seen.has(skinId)) { excluded++; continue; }
    seen.add(skinId);
    const rawQuality = safe(() => item.skinlevel);
    const qualityParts = typeof rawQuality === 'string' ? rawQuality.split(',') : [];
    const quality = qualityParts.length === 2 && qualityParts[0] === '0' && /^[0-4]$/.test(qualityParts[1]) ? Number(qualityParts[1]) : null;
    const name = safe(() => item.name);
    rows.push({ skinId, name: typeof name === 'string' && name.trim() ? name.trim() : `皮肤 #${skinId}`,
      quality, qualityName: QUALITY_NAMES[quality] ?? '品质未知', generalId: Math.floor(skinId / 100) });
  }
  return { rows, ready: rows.length > 0, excluded };
}

export function readInventory(entries) {
  const unknown = { count: null, owned: null, upgrade: null, temporary: null };
  if (!Array.isArray(entries) || entries.length > 1000) return unknown;
  if (!entries.length) return { count: 0, owned: false, upgrade: null, temporary: false };
  let count = 0, upgraded = false, allUpgradeKnown = true, anyTemporary = false, anyPermanent = false;
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return unknown;
    const id = safe(() => entry.ID);
    if (id !== undefined && id !== null) {
      if (seen.has(String(id))) continue;
      seen.add(String(id));
    }
    const rawCount = safe(() => entry.Count);
    if (rawCount === undefined || rawCount === null || rawCount === '') return unknown;
    const n = Number(rawCount);
    if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(count + n)) return unknown;
    count += n;
    if (!n) continue;
    const state = safe(() => entry.IsUpgrade);
    if (state === true || (typeof state === 'number' && Number.isFinite(state) && state > 0)) upgraded = true;
    else if (state !== false && state !== 0) allUpgradeKnown = false;
    const forever = safe(() => entry.IsForever) ?? safe(() => entry.baseInfo.isForeverProp);
    if (forever === true) anyPermanent = true;
    if (forever === false) anyTemporary = true;
  }
  return { count, owned: count > 0, upgrade: count ? (upgraded ? true : allUpgradeKnown ? false : null) : null,
    temporary: count ? (anyTemporary ? true : anyPermanent ? false : null) : false };
}

export function collectSkins(catalogue, getInventory) {
  return catalogue.map(skin => {
    const entries = safe(() => getInventory(skin.skinId));
    return { ...skin, ...readInventory(entries) };
  });
}

export function summarizeSkins(rows) {
  return rows.reduce((summary, skin) => {
    summary.total++;
    if (skin.owned === true) summary.owned++;
    else if (skin.owned === false) summary.missing++;
    else summary.unknown++;
    if (skin.count !== null) summary.quantity += skin.count;
    if (skin.upgrade === true) summary.upgraded++;
    return summary;
  }, { total: 0, owned: 0, missing: 0, unknown: 0, quantity: 0, upgraded: 0 });
}

export function filterSkins(rows, { query = '', ownership = 'all', quality = 'all', sort = 'id' } = {}) {
  const term = String(query).trim().toLocaleLowerCase();
  const filtered = rows.filter(row => (!term || `${row.name} ${row.skinId} ${row.generalId}`.toLocaleLowerCase().includes(term))
    && (ownership === 'all' || (ownership === 'owned' && row.owned === true) || (ownership === 'missing' && row.owned === false)
      || (ownership === 'unknown' && row.owned === null) || (ownership === 'upgraded' && row.upgrade === true))
    && (quality === 'all' || (quality === 'unknown' ? row.quality === null : row.quality === Number(quality))));
  const compare = sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'zh-CN')
    : sort === 'quality' ? (a, b) => (b.quality ?? -1) - (a.quality ?? -1)
      : sort === 'count' ? (a, b) => (b.count ?? -1) - (a.count ?? -1) : () => 0;
  return filtered.sort((a, b) => compare(a, b) || a.skinId - b.skinId);
}
