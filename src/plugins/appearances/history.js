import { field, read } from '../../shared/info-runtime.js';
import { eligibleMode, rankedPosition, retainedScope } from './battle.js';
import { ids } from './model.js';
import { sideOf } from './groups.js';

export const RANKED_HISTORY_TAB = 1;
const GAME_HISTORY_ID = 9999;
export const RANKED_DETAIL_EVENT = 'decodeClientGameOverRecordResp';

export function gameId(value) {
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value)) return value;
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  if (value && Number.isInteger(value.high) && Number.isInteger(value.low)) {
    const id = (BigInt(value.high >>> 0) << 32n) + BigInt(value.low >>> 0);
    return id > 0n ? String(id) : null;
  }
  return null;
}
function projectRankedRoster(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  try {
    const rows = raw.map(player => ({ seat: player.real_seatid ?? 0,
      general: ids(player.general_id.filter(id => id !== 0)) }));
    return [0, 1, 2, 3].every(seat => rows.some(player => player.seat === seat && player.general.length)) ? rows : null;
  } catch { return null; }
}
// Copy both native binary and protobuf response forms before packet reuse.
export function projectHistory(packet) {
  const raw = field(packet, 'RecordItems') ?? field(packet, 'all_record');
  const id = field(packet, 'RecordId') ?? field(packet, 'id');
  const tab = field(packet, 'Tab') ?? field(packet, 'tab') ?? 0;
  const rankedHistory = id === GAME_HISTORY_ID && [0, RANKED_HISTORY_TAB].includes(tab);
  const limit = rankedHistory ? 200 : 100;
  const header = { account: String(field(packet, 'Uuid') ?? field(packet, 'query_uid') ?? ''),
    mode: rankedHistory ? 26 : id, tab, rankedHistory };
  if (!Array.isArray(raw) || raw.length > limit) return { ...header, rows: [], issues: [`战绩列表格式无效（需要不超过${limit}条的数组）`] };
  const rows = [], issues = [];
  raw.forEach((r, index) => {
    try {
      if (!r || typeof r !== 'object') throw new Error('空记录或记录格式无效');
      const generals = r.UsedGenerals ?? r.used_general;
      if (generals == null) throw new Error('缺少已用武将列表');
      const label = r.Label ?? r.label_mode;
      if (rankedHistory && label !== 13203) return;
      rows.push({ gameId: gameId(r.GameId ?? r.game_id),
        label, figure: r.Figure ?? r.figure,
        result: r.GameResult ?? r.game_result, duration: r.GameTime ?? r.game_time,
        ended: r.GameOverTime ?? r.game_over_time, general: ids(generals),
        seat: r.RealSeatId ?? r.real_seat_id, position: read(() => r.FixedViewId),
        roster: label === 13203 ? projectRankedRoster(r.allUsedGeneral ?? r.all_used_general) : null });
    } catch (e) {
      // Some official entries have no generals. One such entry must not reject the whole response.
      if (issues.length < 3) issues.push(`第${index + 1}条：${e?.message || e}`);
    }
  });
  return { ...header, rows, issues };
}
// The stock history window retrieves these details when the player clicks 战绩.
// The seven-day binary list itself has no complete seat roster.
export function projectRankedDetail(packet) {
  const body = read(() => packet.Protocol.Data.ProtoObj) ?? read(() => packet.Protocol.ProtoObj)
    ?? field(packet, 'ProtoObj') ?? read(() => packet.Protocol) ?? packet;
  const id = gameId(body?.gameid), info = body?.info?.info, players = body?.info?.player_list;
  if (!id || body.res || !info || ![7, 14].includes(info.gamemodel)
    || (info.label_model != null && info.label_model !== 132) || (info.section != null && info.section !== 3)
    || !Array.isArray(players) || players.length !== 4) return null;
  const roster = projectRankedRoster(players.map(player => ({ real_seatid: player?.seatid, general_id: player?.general_id })));
  if (!roster) return null;
  return { id, roster: roster.map((row, index) => ({ ...row, account: String(players[index].uid ?? '') })) };
}
const sameGeneral = (a, b) => JSON.stringify([...a].sort((x,y)=>x-y)) === JSON.stringify([...b].sort((x,y)=>x-y));
function repairRankedFrame(frame, official) {
  if (frame.source !== 'toolbox' || frame.mode !== 26 || !retainedScope(frame)
    || sideOf(frame) === 'unknown' || !official.roster || !official.general.every(id => frame.general.includes(id))) return null;
  const own = official.roster.find(p => p.seat === official.seat);
  const recorded = official.roster.find(p => p.seat === frame.seat);
  if (!own || !recorded || !sameGeneral(own.general, official.general)) return null;
  if (frame.selected === null ? recorded !== own : recorded === own || !sameGeneral(recorded.general, frame.selected)) return null;
  // Recover the first seat from the recorded one-based position and the
  // complete official roster, then locate our seat within that same order.
  const firstSeat = (frame.seat + 5 - frame.position) % 4;
  const position = rankedPosition(own.seat, firstSeat, official.roster.map(p => p.seat));
  return position === null ? null : { ...frame, seat: own.seat, position, selected: official.general };
}
export function mergeHistory(records, matches, data, now = Date.now()) {
  const next = [...matches], repaired = new Map(); let added = 0, skipped = 0, changed = false;
  const matchesById = new Map(matches.map(match => [match.id, match]));
  const valid = [];
  for (const r of data.rows) {
    const rawMode = Math.floor(r.label / 100), rawGroup = r.label % 100, mode = eligibleMode(rawMode, rawGroup);
    // The official seven-day timestamp uses the game's UTC+8 clock, as in the legacy reader.
    const endedAt = (r.ended - 28800) * 1000;
    if (!mode || mode !== data.mode || !r.gameId || !r.general.length || ![0,1,255].includes(r.result)
      || !Number.isFinite(r.duration) || r.duration < 0 || !Number.isFinite(endedAt)
      || endedAt > now + 300000 || endedAt < now - 8 * 86400000) { skipped++; continue; }
    valid.push({ r, mode, rawMode, rawGroup, endedAt, time: endedAt - r.duration * 1000 });
  }
  const near = (frame, time) => frame.time >= time - 120000 && frame.time <= time + 30000;
  for (const { r, mode, rawMode, rawGroup, endedAt, time } of valid) {
    const verifiedIndex = next.findIndex(m => m.gameId === r.gameId);
    if (verifiedIndex >= 0) {
      const existing = next[verifiedIndex];
      if (existing.syncUnverified && existing.mode === mode && existing.endedAt === endedAt
        && existing.duration === r.duration && existing.result === r.result && sameGeneral(existing.general, r.general)) {
        const { syncUnverified, ...confirmed } = existing;
        next[verifiedIndex] = confirmed;
        changed = true;
      }
      continue;
    }
    const compatible = row => row.mode === mode && sameGeneral(row.selected ?? row.general ?? [], r.general);
    // Match only a unique local opening close to the official start. Never use seat ID as play order.
    const frames = records.filter(f => near(f, time) && !matchesById.get(f.id)?.gameId && compatible(f));
    const live = next.filter(m => !m.gameId && compatible(m) && (frames.length === 1 && m.id === frames[0].id
      || Math.abs(m.endedAt - endedAt) <= 15000 && m.duration === r.duration));
    let correction = null;
    if (mode === 26 && r.roster) {
      const corrections = records.filter(f => {
        const match = matchesById.get(f.id);
        return near(f, time) && !match?.gameId && match?.result == null;
      })
        .map(f => repairRankedFrame(f, r)).filter(Boolean);
      // The official roster must identify both selections, and the match must
      // be unique in both directions before editing an existing local frame.
      if (corrections.length) {
        const candidate = corrections[0];
        const original = records.find(f => f.id === candidate.id);
        if (corrections.length !== 1 || frames.length || live.length || valid.some(other => other.r.gameId !== r.gameId
          && other.mode === 26 && near(original, other.time)
          && (sameGeneral(original.selected ?? [], other.r.general) || repairRankedFrame(original, other.r)))) {
          skipped++; continue;
        }
        correction = candidate;
        const incomplete = matchesById.get(correction.id);
        if (incomplete) live.push(incomplete);
      }
    }
    if (!correction && !frames.length && !live.length) { skipped++; continue; }
    if (live.length > 1 || frames.length > 1) { skipped++; continue; }
    const peer = correction ?? live[0] ?? frames[0];
    const row = { id: peer?.id ?? `official:${r.gameId}`, mode, rawMode, rawGroup,
      modeEvidence: 'official-history', gameId: r.gameId, time: peer?.time ?? time, endedAt,
      general: r.general, result: r.result, duration: r.duration, figure: r.figure,
      position: peer?.position ?? r.position ?? null, seat: peer?.seat ?? r.seat ?? null,
      source: 'official-history' };
    if (sideOf(row) === 'unknown') { skipped++; continue; }
    if (live.length) {
      if (live[0].result == null) added++;
      next[next.indexOf(live[0])] = row;
    }
    else if (next.length < 10000) { next.push(row); added++; }
    else { skipped++; continue; }
    changed = true;
    matchesById.set(row.id, row);
    if (correction) repaired.set(correction.id, correction);
  }
  return { records: repaired.size ? records.map(frame => repaired.get(frame.id) ?? frame) : records, matches: changed ? next : matches, added, skipped };
}
