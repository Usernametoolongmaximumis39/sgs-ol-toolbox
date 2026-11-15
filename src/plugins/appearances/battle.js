import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { read, field } from '../../shared/info-runtime.js';

export function nativeSide(ctx, selfSeat) {
  if (!Number.isInteger(selfSeat) || selfSeat<0) return {position:null,figure:null};
  const context=read(()=>ctx.game.getClass('GameContext'));
  const ui=read(()=>ctx.game.getSeatUIs())?.find(ui=>nativeSeatId(ui)===selfSeat)
    ?? read(()=>ctx.game.getSelfSeatUI());
  const seat=read(()=>context.GetSeat(selfSeat)) ?? (nativeSeatId(ui)===selfSeat ? nativeSeat(ui) : null);
  const position=read(()=>seat.FixedViewId),figure=read(()=>seat.Figure);
  return {position:Number.isInteger(position)&&position>=1&&position<=4?position:null,
    figure:figure===1||figure===3?figure:null};
}

// Exact native Model/Section pairs from sys_ss_gamelabel_config.
export function eligibleMode(rawMode, rawGroup) {
  const key = `${rawMode}/${rawGroup}`;
  return new Map([['132/3', 26], ['148/3', 35], ['149/3', 35], ['160/2', 44], ['160/3', 44], ['160/4', 44]]).get(key) || 0;
}
export function retainedScope(row) {
  // Earlier local rows have only normalized mode labels. Preserve them without
  // inventing native evidence; if native evidence exists it must pass too.
  if (row.rawMode == null || row.rawGroup == null) return true;
  return eligibleMode(row.rawMode, row.rawGroup) === row.mode;
}
export function robotStatus(players) {
  if (!players.length) return null;
  const states = players.map(p => {
    const flags = ['IsRobot', 'isRobot', 'IsProtectRobot', 'IsProtectNickRobot', 'isProjectRobot'].map(k => read(() => p[k]));
    if (flags.some(v => v === true)) return true;
    return flags.some(v => v === false) ? false : null;
  });
  return states.includes(true) ? true : states.every(v => v === false) ? false : null;
}
export function nativeRobots(ctx) {
  const context = read(() => ctx.game.getClass('GameContext'));
  // A single-rider table has two seats. No nickname or ID-range heuristics.
  const seats = [0, 1].map(i => read(() => context.GetSeat(i)));
  if (seats.some(s => !s || !read(() => s.PlayerInfo))) return null;
  return robotStatus(seats.flatMap(s => [s, read(() => s.PlayerInfo)]));
}
export function projectSettlement(packet, selfSeat) {
  const players = field(packet, 'Players');
  if (!Array.isArray(players) || players.length > 8) throw new Error('结算玩家列表格式无效');
  const rows = players.map(p => ({ seat: p.SeatID, result: p.Result, figure: p.Figure, userId: p.userId,
    isRobot: p.isRobot, isProjectRobot: p.isProjectRobot }));
  const own = rows.filter(p => p.seat === selfSeat);
  const rawTime = field(packet, 'time');
  return { selfSeat, players: rows, own: own.length === 1 ? own[0] : null,
    rawMode: field(packet, 'ModeType'), rawGroup: field(packet, 'GoupID'), gameModel: field(packet, 'GameModel'),
    duration: Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : null };
}
export const resultName = result => result === 0 ? '胜利' : result === 1 ? '失败' : result === 255 ? '平局' : '结果未知';
export function winSummary(matches) {
  const wins = matches.filter(r => r.result === 0).length, losses = matches.filter(r => r.result === 1).length;
  const draws = matches.filter(r => r.result === 255).length;
  const durations = matches.filter(r => Number.isFinite(r.duration));
  return { played: matches.length, wins, losses, draws, unknown: matches.length - wins - losses - draws,
    rate: wins + losses ? wins / (wins + losses) : null,
    duration: durations.length ? durations.reduce((sum, r) => sum + r.duration, 0) / durations.length : null };
}
export function winStatistics(matches, names = {}, { search = '', min = 0, sort = 'played' } = {}) {
  const groups = new Map();
  for (const row of matches) for (const id of new Set(row.general)) { const a = groups.get(id) || []; a.push(row); groups.set(id, a); }
  return [...groups].map(([id, rows]) => ({ id, name: names[id] || `武将 #${id}`, ...winSummary(rows) }))
    .filter(row => row.played >= min && (!search || row.name.includes(search)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh') : (b[sort] ?? -1) - (a[sort] ?? -1) || b.played - a.played || a.id - b.id);
}
