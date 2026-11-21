import { read } from '../../shared/info-runtime.js';

export function disableCompletedGenerals(ctx, mode, rows) {
  const completed = new Set(rows.filter(row => row.completed === true && row.owned === true).map(row => row.id));
  if (!completed.size) return 0;
  const shield = ctx.native.manager('GameShieldGeneralManager', 'decodeUserFreeGeneralInfoRep', mgr =>
    ['GetNewGeneralPoolComplianceByModeIdAndSection', 'GetShieldGeneralGameModelNodeByIndex', 'GetShieldGeneralState',
      'InShieldCloseGeneral', 'SendClientShieldGeneralBatchReq'].every(method => typeof mgr[method] === 'function'));
  if (!shield) return 0;
  const section = Number(mode.Section ?? read(() => ctx.game.getClass('GameContext').GetGroupID()));
  if (!Number.isInteger(section) || section < 0) return 0;

  // The native compliance method passes the mode's pool into this helper.
  // Read that configuration without invoking the compliance result or changing bindings.
  const { pool, all } = shield.GetNewGeneralPoolComplianceByModeIdAndSection.call({
    GetNewGeneralPoolCompliance: (pool, all) => ({ pool, all }),
  }, Number(mode.ModeID), section) || {};
  const poolIds = all ? pool?.InFactAllGeneralList : pool?.InFactGeneralList;
  if (!Array.isArray(poolIds) || pool.OnlyShowInfo) return 0;
  const scheme = shield.GetShieldGeneralGameModelNodeByIndex(pool.Id);
  const schemeId = Number(scheme?.scheme_id ?? scheme?.schemeId);
  const minOpen = Number(pool.MinGOpen), maxLimitedClosed = Number(pool.CanCloseBfAllCnt);
  if (!Number.isSafeInteger(schemeId) || schemeId <= 0 || !Number.isInteger(minOpen) || minOpen < 0
    || !Number.isInteger(maxLimitedClosed) || maxLimitedClosed < 0) return 0;

  const generals = ctx.native.manager('GameGeneralManager', 'ClientGeneralFromRep', mgr => typeof mgr.HasGeneral === 'function');
  if (!generals) return 0;
  const protectedIds = new Set((pool.CantCloseGeneralList || []).map(Number));
  const limited = new Set((pool.BfGListInShowPool || []).map(Number));
  const owned = [...new Set([...poolIds.map(Number), ...protectedIds])].filter(id => generals.HasGeneral(id));
  const closed = owned.filter(id => !protectedIds.has(id) && shield.GetShieldGeneralState(id, schemeId));
  const closedSet = new Set(closed);
  let remaining = owned.length - closed.length - minOpen;
  let limitedRemaining = maxLimitedClosed - closed.filter(id => limited.has(id) && shield.InShieldCloseGeneral(id)).length;
  const ids = [];
  for (const id of owned) {
    if (remaining <= 0) break;
    if (!completed.has(id) || protectedIds.has(id) || closedSet.has(id) || !shield.InShieldCloseGeneral(id)) continue;
    if (limited.has(id) && limitedRemaining <= 0) continue;
    ids.push(id);
    remaining--;
    if (limited.has(id)) limitedRemaining--;
  }
  if (ids.length) {
    shield.ShieldGeneralBatchState = 0;
    shield.SendClientShieldGeneralBatchReq(schemeId, ids, []);
  }
  return ids.length;
}
