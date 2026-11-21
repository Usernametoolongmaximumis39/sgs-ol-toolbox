import { nativeSeat } from '../../core/seat.js';
import { read } from '../../shared/info-runtime.js';

const ROLES = [1, 2, 2, 4, 3, 3, 3, 3];
const id = value => {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return null;
  const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
};
const figureManager = ui => read(() => ui.FigureManager) ?? read(() => ui.figureManager);
export function roomMode(tableId) {
  // Native TableSimpleId subtracts 100000 * (1000 * group + mode).
  const n = Number(tableId);
  return Number.isSafeInteger(n) && n >= 100000 ? Math.floor(n / 100000) % 1000 : null;
}
export function roomController(ctx) {
  const guard = value => (value.TableSetting || value.tableSetting) && (value.TabbleSeatInfos || value.tabbleSeatInfos);
  // The native singleton is often closed over and absent from ClassUtils.
  // Its already-installed proxy handlers retain the controller instance.
  for (const event of ['ClientTableinfoRep', 'GsCModifyUserseatNtf', 'ClientTableInfoRep', '20508', '21208']) {
    const found = ctx.native.manager('RoomControler', event, guard);
    if (found) return found;
  }
  return null;
}
export function inferIdentities({ modeId, setting, roster, seats, blocked = false, owned = new Set() }) {
  const chooseFigure = read(() => setting.IsChooseFigure) ?? [5, 6, 7].includes(read(() => setting.RandMode));
  if (blocked || ![73, 74].includes(modeId) || chooseFigure !== true || !Array.isArray(roster)
    || roster.length !== 8 || !Array.isArray(seats) || seats.length !== 8) return [];
  // The waiting room draws role icons by waiting-seat ID, even if the battle reorders players.
  const positions = Array.from(roster, row => read(() => row.SeatID));
  const hasPositions = positions.some(position => position != null);
  if (hasPositions && (new Set(positions).size !== 8
    || positions.some(position => !Number.isInteger(position) || position < 0 || position >= 8))) return [];
  const roomIds = Array.from(roster, row => id(read(() => row.ClientId)) ?? id(read(() => row.SeatPlayerInfo.ClientId)
    ?? read(() => row.playerInfo.ClientId) ?? read(() => row.playerInfo.clientId)));
  const seatIds = seats.map(ui => {
    const seat = nativeSeat(ui);
    return seat?.IsFull === false ? null : id(read(() => (seat.playerInfo ?? seat.PlayerInfo).ClientId)
      ?? read(() => (seat.playerInfo ?? seat.PlayerInfo).clientId));
  });
  if (roomIds.includes(null) || seatIds.includes(null) || new Set(roomIds).size !== 8
    || new Set(seatIds).size !== 8 || seatIds.some(value => !roomIds.includes(value))) return [];
  return seats.flatMap((ui, i) => {
    const seat = nativeSeat(ui), known = read(() => seat.Figure) ?? read(() => seat.figure);
    const target = figureManager(ui), shown = read(() => target.Figure);
    if (Number(known) > 0 || !owned.has(target) && Number(shown) > 0) return [];
    const roomIndex = roomIds.indexOf(seatIds[i]);
    const position = hasPositions ? positions[roomIndex] : roomIndex;
    return [{ ui, role: position === 4 && read(() => setting.DoubleNeiJian) === true ? 4 : ROLES[position] }];
  });
}
export function createIdentityHints(ctx) {
  const entries = new Map();
  function remove(ui) {
    const e = entries.get(ui); if (!e) return;
    entries.delete(ui);
    if (e.owned && !e.manager.destroyed && e.manager.Figure === e.applied) {
      e.writing = true;
      try { e.manager.SetFigure(e.before); } finally { e.writing = false; e.release(); }
    } else e.release();
  }
  function clear() { for (const ui of [...entries.keys()]) remove(ui); }
  ctx.scope.add(clear);
  return { clear, update(snapshot, blocked) {
    const rc = roomController(ctx), setting = read(() => rc.TableSetting) ?? read(() => rc.tableSetting);
    const roster = read(() => (rc.TabbleSeatInfos ?? rc.tabbleSeatInfos).datum);
    const owned = new Set([...entries.values()].filter(e => e.owned && e.manager.Figure === e.applied).map(e => e.manager));
    const rows = snapshot.inGame && !snapshot.isReplay ? inferIdentities({ modeId: snapshot.modeId ?? roomMode(read(() => rc.TableId)), setting,
      roster, seats: read(() => ctx.game.getSeatUIs()), owned,
      blocked: blocked || read(() => rc.isReconnected) === true }) : [];
    const active = new Set();
    for (const { ui, role } of rows) {
      const target = figureManager(ui);
      if (!target || target.destroyed || typeof target.SetFigure !== 'function') continue;
      let e = entries.get(ui);
      // Seat initialization can call SetFigure(0) again after the opening hint.
      if (e && (e.manager !== target || e.applied !== role || !owned.has(target))) { remove(ui); e = null; }
      active.add(ui);
      if (e) continue;
      e = { manager: target, before: target.Figure || 0, applied: role, owned: true, writing: false, release: () => {} };
      e.release = ctx.scope.patch(target, 'SetFigure', original => function (...args) {
        if (!e.writing) e.owned = false;
        return original.apply(this, args);
      });
      entries.set(ui, e); e.writing = true;
      try { target.SetFigure(role); } finally { e.writing = false; }
    }
    for (const ui of [...entries.keys()]) if (!active.has(ui)) remove(ui);
  } };
}
