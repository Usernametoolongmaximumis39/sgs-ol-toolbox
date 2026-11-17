import { field, read } from '../../shared/info-runtime.js';
import { eligibleMode } from './battle.js';
import { ids } from './model.js';
import { sideOf } from './groups.js';

export function gameId(value) {
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value)) return value;
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  if (value && Number.isInteger(value.high) && Number.isInteger(value.low)) {
    const id = (BigInt(value.high >>> 0) << 32n) + BigInt(value.low >>> 0);
    return id > 0n ? String(id) : null;
  }
  return null;
}
// Copy both native binary and protobuf response forms before packet reuse.
export function projectHistory(packet) {
  const raw = field(packet, 'RecordItems') ?? field(packet, 'all_record');
  const header = { account: String(field(packet, 'Uuid') ?? field(packet, 'query_uid') ?? ''),
    mode: field(packet, 'RecordId') ?? field(packet, 'id'), tab: field(packet, 'Tab') ?? 0 };
  if (!Array.isArray(raw) || raw.length > 100) return { ...header, rows: [], issues: ['战绩列表格式无效（需要不超过100条的数组）'] };
  const rows = [], issues = [];
  raw.forEach((r, index) => {
    try {
      if (!r || typeof r !== 'object') throw new Error('空记录或记录格式无效');
      const generals = r.UsedGenerals ?? r.used_general;
      if (generals == null) throw new Error('缺少已用武将列表');
      rows.push({ gameId: gameId(r.GameId ?? r.game_id),
        label: r.Label ?? r.label_mode, figure: r.Figure ?? r.figure,
        result: r.GameResult ?? r.game_result, duration: r.GameTime ?? r.game_time,
        ended: r.GameOverTime ?? r.game_over_time, general: ids(generals),
        seat: r.RealSeatId ?? r.real_seat_id, position: read(() => r.FixedViewId) });
    } catch (e) {
      // Some official entries have no generals. One such entry must not reject the whole response.
      if (issues.length < 3) issues.push(`第${index + 1}条：${e?.message || e}`);
    }
  });
  return { ...header, rows, issues };
}
const sameGeneral = (a, b) => JSON.stringify([...a].sort((x,y)=>x-y)) === JSON.stringify([...b].sort((x,y)=>x-y));
export function mergeHistory(records, matches, data, now = Date.now()) {
  const next = [...matches]; let added = 0, skipped = 0;
  for (const r of data.rows) {
    const rawMode = Math.floor(r.label / 100), rawGroup = r.label % 100, mode = eligibleMode(rawMode, rawGroup);
    // The official seven-day timestamp uses the game's UTC+8 clock, as in the legacy reader.
    const endedAt = (r.ended - 28800) * 1000;
    if (!mode || mode !== data.mode || !r.gameId || !r.general.length || ![0,1,255].includes(r.result)
      || !Number.isFinite(r.duration) || r.duration < 0 || !Number.isFinite(endedAt)
      || endedAt > now + 300000 || endedAt < now - 8 * 86400000) { skipped++; continue; }
    if (next.some(m => m.gameId === r.gameId)) continue;
    const time = endedAt - r.duration * 1000;
    const compatible = row => row.mode === mode && sameGeneral(row.selected ?? row.general ?? [], r.general);
    // Match only a unique local opening close to the official start. Never use seat ID as play order.
    const frames = records.filter(f => compatible(f) && f.time >= time - 120000 && f.time <= time + 30000);
    const live = next.filter(m => compatible(m) && (frames.length === 1 && m.id === frames[0].id
      || Math.abs(m.endedAt - endedAt) <= 15000 && m.duration === r.duration));
    if (!frames.length && !live.length) { skipped++; continue; }
    if (live.length > 1 || frames.length > 1) { skipped++; continue; }
    const peer = live[0] ?? frames[0];
    const row = { id: peer?.id ?? `official:${r.gameId}`, mode, rawMode, rawGroup,
      modeEvidence: 'official-history', gameId: r.gameId, time: peer?.time ?? time, endedAt,
      general: r.general, result: r.result, duration: r.duration, figure: r.figure,
      position: peer?.position ?? r.position ?? null, seat: peer?.seat ?? r.seat ?? null,
      isAiMatch: peer?.isAiMatch ?? null, source: 'official-history' };
    if (sideOf(row) === 'unknown') { skipped++; continue; }
    if (live.length) next[next.indexOf(live[0])] = row;
    else if (next.length < 10000) { next.push(row); added++; }
    else skipped++;
  }
  return { matches: next, added, skipped };
}
