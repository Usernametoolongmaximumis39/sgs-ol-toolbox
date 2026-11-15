import { readInventory, QUALITY_NAMES } from './model.js';

export { QUALITY_NAMES };
export const DYNAMIC_GROUPS = [
  { id: 'type', title: '动态类型', options: [['none', '无动态'], ['unlock', '需解锁动态'], ['innate', '自带动态']] },
  { id: 'ownership', title: '动态拥有', options: [['missing', '未拥有动态'], ['owned', '已有动态']] },
  { id: 'method', title: '解锁方式', options: [['cinnabar', '可朱砂升级'], ['crystalOnly', '仅水晶升级']] },
  { id: 'materials', title: '水晶准备', options: [['crystalReady', '已有水晶'], ['crystalMissing', '缺少水晶']] },
];
export const read = fn => { try { return fn(); } catch { return undefined; } };
export const emptyDynamicFilters = () => Object.fromEntries(DYNAMIC_GROUPS.map(group => [group.id, []]));
export const dynamicFilterCount = filters => DYNAMIC_GROUPS.reduce((n, group) => n + (filters?.[group.id]?.length || 0), 0);

// Public type-124 goods metadata is independent of account inventory. A skin can
// support BOTH cinnabar and its matching crystal even when no crystal is owned.
const crystalCatalogues = new WeakMap();
export function readCrystalCatalogue(config) {
  if (!config || typeof config !== 'object') return { ready: false, skinIds: new Set() };
  if (crystalCatalogues.has(config)) return crystalCatalogues.get(config);
  const root = config.root || config, rows = read(() => root.goodslist.goods), fields = read(() => root.abbreviation.field);
  const result = { ready: false, skinIds: new Set() };
  if (!Array.isArray(rows) || !rows.length || rows.length > 200000) return result;
  const aliases = new Map(Array.isArray(fields) ? fields.map(field => [field.Long, field.Short]) : []);
  const field = (row, key) => read(() => row[key]) ?? read(() => row[aliases.get(key)]);
  result.ready = true;
  for (const row of rows) {
    if (Number(field(row, 'TypeID') ?? read(() => row.typeID)) !== 124) continue;
    const effect = field(row, 'usedeffect');
    const skinId = Number(read(() => row.firstUsedEffect) ?? (typeof effect === 'string' ? effect.split(';')[0].split(',')[0] : effect));
    if (Number(field(row, 'ID')) > 0 && Number.isSafeInteger(skinId) && skinId > 0) result.skinIds.add(skinId);
    else result.ready = false;
  }
  crystalCatalogues.set(config, result); return result;
}

export function readDynamicMaterials(runtime) {
  const result = { crystalCounts: new Map(), crystalsKnown: false };
  if (!runtime?.ready) return result;
  const entries = read(() => runtime.goodsManager.GetGoodsListByType(124));
  if (!Array.isArray(entries) || entries.length > 20000) return result;
  result.crystalsKnown = true;
  const seen = new Set();
  for (const item of entries) {
    const skinId = Number(read(() => item.baseInfo.firstUsedEffect)), count = read(() => item.Count), id = read(() => item.ID);
    if (!Number.isSafeInteger(skinId) || skinId <= 0 || !Number.isSafeInteger(count) || count < 0) { result.crystalsKnown = false; continue; }
    if (id != null) { if (seen.has(String(id))) continue; seen.add(String(id)); }
    result.crystalCounts.set(skinId, (result.crystalCounts.get(skinId) || 0) + count);
  }
  return result;
}

export function nativeSkinState(vo, runtime) {
  const compose = read(() => vo.ComfromGoodsInfo), composeCost = Number(read(() => compose.ItemNum));
  const craftable = compose && Number(read(() => compose.ItemID)) === 112101 && Number.isFinite(composeCost) && composeCost > 0 && composeCost < 999999 && read(() => vo.IsInComposeTime) === true ? true
    : !compose || read(() => vo.IsInComposeTime) === false || Number.isFinite(composeCost) ? false : null;
  const entries = runtime?.ready ? read(() => runtime.skinManager.GetSkinListBySkinID(vo.skinID)) : undefined;
  const inv = runtime?.ready ? readInventory(entries) : { owned: null, upgrade: null, count: null };
  const price = read(() => vo.UpdateInfo), rawUpdate = read(() => vo.update);
  const judge = read(() => vo.NewSkinJudge) ?? read(() => vo.newSkinJudge);
  const auto = read(() => vo.ResType) === 3 && [1, 2, 3, 100, 103].includes(judge) && Boolean(rawUpdate);
  const explicitInnate = auto || read(() => vo.IsClenitDynamic) === true || read(() => vo.IsChuChangOnlyDySkin) === true;
  const nativeCapable = read(() => vo.canUpdateDynamic());
  const builtInLevel = typeof vo.skinlevel === 'string' && vo.skinlevel.split(',')[0] === '1';
  // Missing upgrade metadata alone is not proof of an innate dynamic skin.
  const innate = explicitInnate || (builtInLevel && !price && !rawUpdate);
  const trialDynamic = Array.isArray(entries) && entries.some(item => read(() => item.Count) > 0
    && read(() => item.baseInfo.isForeverProp) === false && String(read(() => item.baseInfo.usingType)) === '1');
  const capable = innate || nativeCapable === true || Boolean(price) || inv.upgrade === true || trialDynamic ? true
    : nativeCapable === false && !rawUpdate ? false : null;
  const materials = runtime?.dynamicMaterials || readDynamicMaterials(runtime);
  const catalogue = runtime?.crystalCatalogue;
  const crystalCount = materials.crystalCounts.get(vo.skinID) ?? (materials.crystalsKnown ? 0 : null);
  const rawCost = read(() => price.ItemNum), cost = rawCost == null || rawCost === '' ? null : Number(rawCost);
  const cinnabarKnown = Boolean(price) && Number.isFinite(cost) && cost >= 0 || !price && !rawUpdate;
  const supportsCinnabar = !innate && Boolean(price) && Number.isFinite(cost) && cost >= 0 && cost < 999999;
  const sentinelCrystal = Boolean(price) && Number.isFinite(cost) && Math.abs(cost) >= 999999;
  const knownCrystal = catalogue?.skinIds?.has(vo.skinID) || crystalCount > 0;
  // Domain rule: every cinnabar-upgradable dynamic also accepts its crystal.
  // This implication does not depend on a separate product row or inventory.
  const supportsCrystal = innate || capable === false ? false : supportsCinnabar || sentinelCrystal || knownCrystal ? true : catalogue?.ready ? false : null;
  const dynamicType = innate ? 'innate' : capable === false ? 'none' : capable === null ? 'unknown'
    : supportsCinnabar || supportsCrystal === true || inv.upgrade === true ? 'unlock' : 'unknown';
  const dynamicOwned = capable !== true ? null : inv.owned === null ? null : !inv.owned ? false : innate || trialDynamic ? true : inv.upgrade;
  const pending = capable === true && dynamicOwned === false;
  return { ...inv, craftable, capable, innate, dynamicType, dynamicOwned, cinnabarKnown, supportsCinnabar, supportsCrystal, crystalCount,
    methodUnknown: capable === true && !innate && (!cinnabarKnown || !supportsCinnabar && supportsCrystal !== true),
    crystalReady: pending && supportsCrystal === true && crystalCount > 0,
    crystalMissing: pending && supportsCrystal === true && crystalCount === 0 };
}

export function hasFilters(state) {
  return Boolean(state.backgroundOnly || state.query.trim() || !state.owned || !state.missing || state.craft && state.craft !== 'all' || dynamicFilterCount(state.dynamic));
}
function matchesDynamic(group, key, status) {
  if (group === 'type') return status.dynamicType === key;
  if (group === 'ownership') return key === 'unknown' ? status.capable !== false && status.dynamicOwned === null
    : status.capable === true && status.dynamicOwned === (key === 'owned');
  if (group === 'method') return status.capable === true && !status.innate && (key === 'unknown' ? status.methodUnknown
    : key === 'cinnabar' ? status.supportsCinnabar : status.cinnabarKnown === true && !status.supportsCinnabar && status.supportsCrystal === true);
  return status[key] === true;
}
export function matchesSkin(row, status, state, search) {
  if (row.isGeneral) return state.group === 'country' && !hasFilters(state);
  if (!row.skinBaseVo) return false;
  if (state.backgroundOnly && !read(() => row.skinBaseVo.Is169 || row.skinBaseVo.IsBanner)) return false;
  if (status.owned === true && !state.owned || status.owned === false && !state.missing) return false;
  if (status.owned === null && (!state.owned || !state.missing)) return false;
  if (state.craft && state.craft !== 'all' && status.craftable !== (state.craft === 'yes')) return false;
  if (state.query.trim() && !search(row, state.query.trim())) return false;
  return DYNAMIC_GROUPS.every(group => !state.dynamic?.[group.id]?.length
    || state.dynamic[group.id].some(key => matchesDynamic(group.id, key, status)));
}
export function skinTotals(rows, status) {
  const seen = new Set(), result = { total: 0, owned: 0, dynamic: 0, dynamicOwned: 0, unknown: 0 };
  for (const row of rows) {
    const vo = row.skinBaseVo;
    if (!vo || row.isGeneral || seen.has(vo.skinID)) continue;
    seen.add(vo.skinID);
    const value = status(vo); result.total++;
    if (value.owned === true) result.owned++;
    if (value.owned === null) result.unknown++;
    if (value.capable) result.dynamic++;
    if (value.dynamicOwned === true) result.dynamicOwned++;
  }
  return result;
}
