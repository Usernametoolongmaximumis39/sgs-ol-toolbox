
export const generalIds = values => [...new Set(values.map(Number)
  .filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);

export function nativeSchemes(ctx) {
  const native = ctx.native.manager('GameShieldGeneralManager', 'decodeUserFreeGeneralInfoRep', value =>
    typeof value.GetAllShieldGeneralSCheme === 'function' &&
    typeof value.GetShieldGeneralState === 'function' &&
    typeof value.SendClientShieldGeneralBatchReq === 'function');
  const maps = native?.ShieldGeneralDic?._maps;
  if (!maps || typeof maps !== 'object') return { native: null, schemes: [] };
  const ids = generalIds(Object.keys(maps));
  const schemes = (native.GetAllShieldGeneralSCheme() || []).flatMap(row => {
    const id = Number(row?.scheme_id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    return [{ id, name: String(row.scheme_node?.scheme_name || `方案 ${id}`),
      ids: ids.filter(general => native.GetShieldGeneralState(general, id)) }];
  });
  return { native, schemes };
}

export function schemeChanges(target, ids) {
  const current = new Set(target.ids);
  const next = new Set(ids);
  return { close: ids.filter(id => !current.has(id)), open: target.ids.filter(id => !next.has(id)) };
}

export function applyScheme(native, target, ids) {
  const { close, open } = schemeChanges(target, ids);
  if (!close.length && !open.length) return false;
  if (native.ShieldGeneralBatchState) throw new Error('游戏正在处理另一项禁将操作，请稍后再试。');
  native.SendClientShieldGeneralBatchReq(target.id, close, open);
  return true;
}
