import { getNativeTheme } from '../../ui/native-theme.js';

// Plot IDs and trigger/reset groups verified against Xiaochao 1.6.75.
export const ROUND_TACTICS = [2033, 2034, 2035, 2036, 2037, 2038, 2048, 2049, 2050, 2196, 2197, 2300, 2301];
export const TURN_TACTICS = [2100, 2101, 2108, 2109, 2110, 2312, 2313, 2317, 2319, 2320, 2321, 2322];
const cycles = { 2143: ['drawn', 6], 2104: ['drawn', 9], 2042: ['slash', 3], 2043: ['slash', 3], 2044: ['slash', 3] };
const uses = [2079, 2080, 2081], draws = [2082, 2083, 2084];
const dragons = [2104, 2143];
const valid = n => Number.isSafeInteger(n) && n >= 0;
const seatID = n => valid(n) && n < 255;
const events = new Set(['MsgGamePlayCardNtf', 'toolbox:snapshot', 'toolbox:gap', 'MsgReconnectGame', 'MsgReconnectGameHand',
  'MsgGameTurnNtf', 'GsCGamephaseNtf', 'PubGsCMoveCard', 'PubGsCUseCard', 'MsgNtfUseCardType', 'decodeRogueLikeItemEffectNtf',
  'GsCRoleOptTargetNtf', 'MsgGameOver', 'ClientLeavetableRep', 'ClientLoginRep']);
export function initialState() {
  return { sessionId: null, lastSeq: 0, active: false, started: false, complete: false, turnKnown: false, roundKnown: false,
    selfSeatId: null, currentSeatId: null, phase: null, round: null, seats: {} };
}
const blankSeat = () => ({ drawn: 0, slash: 0, used: 0, draws: 0, triggers: {}, tactics: null, tacticsKnown: false, dragons: {} });
// Native OPT_ROGUE1V1_EX_SKILLS=64: [skillCount, ...skills, plotCount, ...plots].
function tacticList(params) {
  if (!Array.isArray(params) || !valid(params[0]) || params[0] > 128) return null;
  const start = params[0] + 2, count = params[start - 1];
  if (!valid(count) || count > 128 || params.length !== start + count) return null;
  const ids = params.slice(start);
  return ids.every(id => valid(id) && id > 0) ? [...new Set(ids)] : null;
}
export function reduce(previous, event) {
  if (!events.has(event?.type) || event.payload?.isSend) return previous;
  const changed = previous.sessionId !== event.sessionId;
  if (!changed && event.seq <= previous.lastSeq) return previous;
  let s = changed ? initialState() : JSON.parse(JSON.stringify(previous));
  s.sessionId = event.sessionId; s.lastSeq = event.seq;
  const d = event.payload || {}, get = id => s.seats[id] ||= blankSeat();
  const forget = () => {
    s.complete = s.turnKnown = s.roundKnown = false;
    for (const seat of Object.values(s.seats)) {
      seat.tacticsKnown = false;
      for (const counter of Object.values(seat.dragons)) counter.complete = false;
    }
  };
  switch (event.type) {
    case 'MsgGamePlayCardNtf':
      s = { ...initialState(), sessionId: event.sessionId, lastSeq: event.seq, active: true,
        complete: Array.isArray(d.CardList) && d.CardList.length > 0 && !d.IsResume };
      s.turnKnown = s.roundKnown = s.complete; break;
    case 'toolbox:snapshot':
      if (seatID(d.selfSeatId)) s.selfSeatId = d.selfSeatId;
      if (d.inGame === true) s.active = true;
      if (d.inGame === false) s.active = false;
      break;
    case 'toolbox:gap': case 'MsgReconnectGame': case 'MsgReconnectGameHand': forget(); break;
    case 'GsCRoleOptTargetNtf': {
      if (d.Type !== 64 || !seatID(d.SeatID)) break;
      const ids = tacticList(d.Params), seat = get(d.SeatID);
      if (!ids) { s.complete = false; seat.tacticsKnown = false; for (const counter of Object.values(seat.dragons)) counter.complete = false; break; }
      const next = {};
      for (const id of dragons) if (ids.includes(id)) {
        // An unchanged ownership snapshot is not a new acquisition. On late
        // attach/resume a first snapshot cannot reconstruct prior progress.
        next[id] = seat.dragons[id] || { drawn: 0, complete: seat.tacticsKnown || s.complete };
      }
      seat.dragons = next; seat.tactics = ids; seat.tacticsKnown = true;
      break;
    }
    case 'MsgGameTurnNtf':
      if (valid(d.TurnCnt) && d.TurnCnt > 0 && d.TurnCnt !== s.round) {
        s.started = true; s.round = d.TurnCnt; s.roundKnown = true;
        for (const seat of Object.values(s.seats)) for (const id of ROUND_TACTICS) delete seat.triggers[id];
      } break;
    case 'GsCGamephaseNtf':
      if (d.Round === 0 && seatID(d.SeatID) && (s.phase !== 0 || s.currentSeatId !== d.SeatID)) {
        s.started = true; s.turnKnown = true;
        for (const seat of Object.values(s.seats)) {
          seat.used = seat.draws = 0;
          for (const id of TURN_TACTICS) delete seat.triggers[id];
        }
      }
      if (seatID(d.SeatID)) s.currentSeatId = d.SeatID;
      s.phase = d.Round; break;
    case 'PubGsCMoveCard':
      // Initial dealing, obtaining/transferring cards and pile rearrangement
      // are not draws: old client uses exactly 1 -> 5, MoveType 1.
      if (s.started && d.FromZone === 1 && d.ToZone === 5 && d.MoveType === 1 && seatID(d.ToID)) {
        const n = d.CardCount ?? d.CardIDs?.length;
        if (!valid(n)) { forget(); break; }
        const seat = get(d.ToID); seat.drawn += n; if (n > 0) seat.draws++;
        for (const counter of Object.values(seat.dragons)) counter.drawn += n;
      } break;
    case 'PubGsCUseCard': case 'MsgNtfUseCardType': {
      const id = event.type === 'PubGsCUseCard' ? d.SeatID : d.CastSeatID;
      if (d.useType === 1 && seatID(id)) {
        const seat = get(id); seat.used++;
        if (d.SpellID === 1) seat.slash++;
        else if (!valid(d.SpellID)) s.complete = false;
      } break;
    }
    case 'decodeRogueLikeItemEffectNtf': {
      const id = d.ItemParams?.[0] ?? 0;
      if (!d.error_id && seatID(id) && [...ROUND_TACTICS, ...TURN_TACTICS].includes(d.ItemID)) {
        const seat = get(id); seat.triggers[d.ItemID] = (seat.triggers[d.ItemID] || 0) + 1;
      } break;
    }
    case 'MsgGameOver': case 'ClientLeavetableRep': case 'ClientLoginRep':
      s = { ...initialState(), sessionId: event.sessionId, lastSeq: event.seq }; break;
  }
  return s;
}
export function tacticCount(state, seatId, plotId, requireOwnership = false) {
  const seat = state.seats?.[seatId] || blankSeat(), cycle = cycles[plotId];
  if (dragons.includes(plotId) && (seat.tactics !== null || requireOwnership)) {
    const counter = seat.dragons[plotId];
    return { text: `${counter?.complete ? counter.drawn % cycle[1] : '?'}/${cycle[1]}` };
  }
  if (cycle) return { text: `${state.complete ? seat[cycle[0]] % cycle[1] : '?'}/${cycle[1]}` };
  if (uses.includes(plotId) || draws.includes(plotId)) return { text: state.turnKnown ? String(seat[uses.includes(plotId) ? 'used' : 'draws']) : '?' };
  if (ROUND_TACTICS.includes(plotId) || TURN_TACTICS.includes(plotId)) {
    return { text: (ROUND_TACTICS.includes(plotId) ? state.roundKnown : state.turnKnown) ? String(seat.triggers[plotId] || 0) : '?' };
  }
  return null;
}

export function createTacticCounts(ctx) {
  const labels = new Map(), theme = getNativeTheme(ctx);
  let owner = null, releaseTheme = null;
  const paint = (palette = theme.palette) => {
    for (const label of labels.values()) if (!label.destroyed) { label.color = palette.accent; label.strokeColor = palette.bg; }
  };
  function clear() {
    releaseTheme?.(); releaseTheme = null;
    for (const label of labels.values()) if (!label.destroyed) label.destroy(true);
    labels.clear(); owner = null;
  }
  function update() {
    if (ctx.scope.signal.aborted) return;
    const state = ctx.getState?.(), self = ctx.game.getSelfSeatUI?.() || ctx.game.getScene?.()?.SelfSeatUi;
    if (!state?.active || !self || self.destroyed) { clear(); return; }
    if (owner !== self) clear(); owner = self;
    const id = self.seat?.Index ?? self.seat?.index ?? self.seatID ?? state.selfSeatId;
    const Text = (ctx.window.Laya || ctx.window.laya)?.Text;
    if (!seatID(id) || typeof Text !== 'function') { clear(); return; }
    // Shared battle-seat surface, deliberately no map/mode-name gate.
    const items = new Set((Array.isArray(self.zhanFaItems) ? self.zhanFaItems : []).slice(0, 128).filter(item => item && !item.destroyed));
    for (const [item, label] of labels) if (!items.has(item)) { if (!label.destroyed) label.destroy(true); labels.delete(item); }
    for (const item of items) {
      const value = tacticCount(state, id, item.PlotID, ctx.game.getScene?.()?.SceneName === 'RogueLike1v1Scene');
      let label = labels.get(item);
      if (!value) { if (label) label.visible = false; continue; }
      if (!label || label.destroyed) {
        label = new Text(); label.name = 'sgs-toolbox-tactic-count'; label.font = 'Arial'; label.fontSize = 13;
        label.bold = true; label.align = 'right'; label.stroke = 3; label.mouseEnabled = false; label.mouseThrough = true;
        label.zOrder = 100; labels.set(item, label); item.addChild(label);
      }
      label.text = value.text; label.size(Math.max(20, value.text.length * 8), 16);
      label.pos(Math.max(0, item.width - label.width - 2), 0); label.visible = true;
    }
    if (!releaseTheme && labels.size) releaseTheme = theme.watch(paint);
    paint();
  }
  ctx.subscribe?.(update); ctx.scope.interval(update, 150); ctx.scope.add(clear); update();
  return { update, clear };
}
