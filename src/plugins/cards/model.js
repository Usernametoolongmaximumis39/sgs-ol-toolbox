import { legacyReveal } from './legacy-reveals.js';
import { legacyEvent, legacyBeforeMove, legacyAfterMove } from './legacy-moves.js';
import { reduceSkillHints } from './skill-hints.js';
import { cardFieldNames, cardPacketWrappers } from '../../shared/card-packet-fields.js';
/** Card observations are public client facts. Unknown transfers retain possibilities. */
export const REFERENCE = Object.freeze({
  version: '1.6.76',
  sha256: 'D59D7D8C4C9CE8B4FE10D45BE0EDCA652E82B5BEA101861E9665785B36A115D6',
});
export const POSITION = Object.freeze({ bottom: 0, top: 0xff00, unknown: 0xff02 });
export const ZONE_NAMES = Object.freeze({ 0: '游戏外', 1: '牌堆', 2: '弃牌', 3: '处理区', 4: '武将标记', 5: '手牌', 6: '装备', 7: '判定', 8: '技能弹窗', 9: '洗牌', 10: '交换临时区', 11: '弃牌临时区', 12: '回收区' });
const GLOBAL_ZONES = new Set([0, 1, 2, 3, 8, 9, 12]);
const START_TOP_SKILLS = new Set([0xc88, 0x1b63, 0x3db, 0x3dc, 0xf3f]);
// Their packets require correlated, multi-step interpretation in the reference.
// Explicit identities remain usable; hidden identities must never be invented.
export const CONSERVATIVE_SKILLS = Object.freeze([0xe44, 0xe45, 0xe92, 0xe93, 0xd9b, 0xda0, 0xdd7, 0x30c, 0x1b68, 0x1b69, 0xe4b]);
const CONSERVATIVE = new Set(CONSERVATIVE_SKILLS);
// Official client SkillId.ZUIFENG / OPT_SKILL_FLAG1. See docs/醉锋明牌协议核查.md.
// Other skills also use Params for choices; they are not card observations.
const ZUIFENG = 4025, OPT_SKILL_FLAG1 = 28;
const QIANGZHI_PO = 3876, OPT_SEL_CARD_HAND = 3;
const SIQI = 3543, JIELI = 3483;
export const YUSHI = 3751;
const orderedSiqiMove = data => Number(data.SpellID) === SIQI &&
  (Number(data.ToZone) === 1 && Number(data.ToPosition) === POSITION.bottom && Number(data.CardCount) === 1 ||
   Number(data.FromZone) === 1 && Number(data.FromPosition) === POSITION.bottom);
export const CARD_JOURNAL_EVENTS = Object.freeze([
  'toolbox:snapshot', 'toolbox:gap', 'MsgGamePlayCardNtf', 'PubGsCMoveCard',
  'PubGsCUseCard', 'PubGsCUseSpell', 'MsgGameTurnNtf', 'GsCGamephaseNtf',
  'MsgGameRoundNtf', 'MsgReconnectGame', 'MsgReconnectGameHand',
  'decodeClientGetCardInfoResp', 'decodeGameDealPileTopCardList',
  'ClientHappyGetFriendHandcardRep', 'SmsgGameSetCharacter', 'GsCGuoZhanSetCharacter',
  'GsCRoleOptTargetNtf', 'CGsRoleSpellOptRep', 'SmsgGamePlayerDead',
  'MsgGameOver', 'ClientLeavetableRep', 'ClientLoginRep',
  'GsCUpdateRoleDataExNtf', 'MsgClientOperateInGameNtf',
]);
const EVENT_TYPES = new Set(CARD_JOURNAL_EVENTS);
const int = value => value === null || value === undefined || value === '' || typeof value === 'boolean'
  ? null : Number.isInteger(Number(value)) ? Number(value) : null;
const list = values => values && typeof values === 'object' && Number.isInteger(values.length) && values.length >= 0 && values.length <= 10000
  ? Array.from(values) : [];
export const cardIds = values => [...new Set(list(values).map(value => int(value?.CardId ?? value?.CardID ?? value?.cardId ?? value?.cardID ?? value?.id ?? value)).filter(value => value > 0))];
const validSeat = value => int(value) !== null && Number(value) >= 0 && Number(value) < 255;
const clone = value => JSON.parse(JSON.stringify(value));

export function initialState() {
  return { schemaVersion: 1, sessionId: null, lastSeq: 0, active: false,
    historyComplete: false, seenHistoryComplete: false, connected: true, selfSeatId: null, currentSeatId: null,
    turn: 0, phase: null, mode: { id: null, sceneName: '', flags: [] },
    seats: {}, cards: {}, cardMeta: {}, zones: {}, deckIds: [], deckStartSeq: 0, deckRemaining: null, deckCycleCompleted: false, recentBySeat: {}, recentCurrent: null,
    discardTurn: [], skillUses: { complete: false, counts: {} }, yushiUses: { round: null, counts: null },
    pending: {}, limitations: [], moves: [], lastEvent: null };
}

export function zoneKey(kind, seat = 255, param = 0) {
  kind = int(kind) ?? 0;
  if (kind === 9) kind = 1;
  if (GLOBAL_ZONES.has(kind)) seat = 255;
  return `${kind}:${int(seat) ?? 255}${kind === 4 || kind === 8 || kind === 10 ? ':' + (int(param) ?? 0) : ''}`;
}

function zone(state, key) {
  if (!state.zones[key]) {
    const [kind, seatId, param = 0] = key.split(':').map(Number);
    state.zones[key] = { key, kind, seatId, param, count: 0, top: [], bottom: [], order: [] };
    if (kind === 5) state.zones[key].countExact = state.historyComplete;
  }
  return state.zones[key];
}

function note(state, code, detail, seq, severity = 'partial') {
  if (state.limitations.some(item => item.code === code && item.detail === detail)) return;
  state.limitations.push({ code, detail, seq, severity });
  if (state.limitations.length > 40) state.limitations.shift();
}

function card(state, id) {
  return state.cards[id] ||= { id, locations: ['?'], tags: [], lastSeq: 0, seen: false };
}

export function wasSeen(state, id) {
  const item = state.cards[id];
  if (typeof item?.seen === 'boolean') return item.seen;
  // Older installed packages did not retain an observation flag. Recover
  // confirmed facts, while the table explicitly marks that history partial.
  return Boolean(item?.tags?.length || item?.locations?.length === 1 && !['?', zoneKey(1)].includes(item.locations[0]) ||
    Object.values(state.recentBySeat).includes(id) || state.discardTurn.includes(id) ||
    state.zones[zoneKey(1)]?.top?.includes(id) || state.zones[zoneKey(1)]?.bottom?.includes(id));
}

function locate(state, id, key, seq, tag, observed = true) {
  const seen = wasSeen(state, id);
  const item = card(state, id);
  item.seen = seen || observed;
  item.locations = [key];
  item.lastSeq = seq;
  if (tag && !item.tags.includes(tag)) item.tags = [...item.tags, tag].slice(-5);
}

function forget(state, reason, seq) {
  state.skillUses = { complete: false, counts: {} };
  state.yushiUses = { round: state.yushiUses?.round ?? null, counts: null };
  state.historyComplete = false;
  state.seenHistoryComplete = false;
  for (const item of Object.values(state.cards)) item.locations = ['?'];
  state.zones = {};
  state.pending = {};
  state.discardTurn = [];
  state.recentBySeat = {};
  state.recentCurrent = null;
  state.deckRemaining = null;
  state.deckCycleCompleted = false;
  note(state, 'history-gap', reason, seq);
}

function flags(state) {
  const result = [];
  if (state.deckIds.includes(0x47e) || /GuoZhan|CountryWar/.test(state.mode.sceneName)) result.push('guozhan');
  if (state.deckIds.includes(0x32cd) || /Ddz|DouDiZhu/.test(state.mode.sceneName)) result.push('ddz');
  if (state.deckIds.includes(0x4e84) || /RogueLikeGame|ShanHe/.test(state.mode.sceneName)) result.push('shanhetu');
  if (state.mode.sceneName === 'RogueLike1v1Scene') result.push('single-rider');
  if (state.mode.sceneName === 'SWJGScene') result.push('swjg');
  state.mode.flags = result;
}

function reveal(state, ids, key, seq, count, authoritative = false) {
  const target = zone(state, key);
  if (authoritative && count === ids.length) {
    for (const item of Object.values(state.cards)) {
      if (item.locations.includes(key) && !ids.includes(item.id)) {
        item.locations = item.locations.filter(location => location !== key);
        if (!item.locations.length) item.locations = ['?'];
      }
    }
    target.order = ids.slice();
  }
  for (const id of ids) locate(state, id, key, seq);
  if (Number.isInteger(count) && count >= ids.length) {
    target.count = count;
    if (target.kind === 5) target.countExact = true;
  } else if (ids.length > target.count) {
    target.count = ids.length;
    if (target.kind === 5) target.countExact = false;
  }
  target.order = [...new Set([...target.order, ...ids])];
}

function snapshot(state, data, seq) {
  state.cardMeta ||= {};
  for (const [id, value] of Object.entries(data.cardMeta || {}).slice(0, 2048)) {
    if (!state.deckIds.includes(Number(id)) || !value || typeof value !== 'object') continue;
    if (Number.isInteger(value.suit) && value.suit >= 1 && value.suit <= 4 && Number.isInteger(value.number) && value.number >= 1 && value.number <= 13)
      state.cardMeta[id] = { suit: value.suit, number: value.number, type: Number.isInteger(value.type) ? value.type : 0 };
  }
  if (typeof data.inGame === 'boolean') state.active = data.inGame;
  if (validSeat(data.selfSeatId)) state.selfSeatId = Number(data.selfSeatId);
  state.mode.id = data.modeId ?? state.mode.id;
  state.mode.sceneName = data.sceneName || state.mode.sceneName;
  if (int(data.deckRemaining) !== null && Number(data.deckRemaining) >= 0) state.deckRemaining = Number(data.deckRemaining);
  const emptySeats = new Set(list(data.emptySeatIds).filter(validSeat).map(Number));
  for (const seatId of emptySeats) {
    if (!validSeat(seatId)) continue;
    delete state.seats[seatId];
    const keys = new Set(Object.values(state.zones).filter(value => value.seatId === seatId).map(value => value.key));
    for (const key of keys) delete state.zones[key];
    for (const item of Object.values(state.cards)) {
      if (item.locations.some(key => keys.has(key))) item.locations = [...new Set(item.locations.map(key => keys.has(key) ? '?' : key))];
    }
  }
  for (const source of data.seats || []) {
    const seatId = int(source.seatId ?? source.index ?? source.Index);
    if (!validSeat(seatId)) continue;
    state.seats[seatId] = { ...state.seats[seatId], seatId,
      viewId: source.viewId ?? source.fixedViewId ?? state.seats[seatId]?.viewId,
      position: source.position === undefined ? state.seats[seatId]?.position : int(source.position) > 0 && int(source.position) <= 255 ? int(source.position) : null,
      name: String(source.name ?? source.nickname ?? ''),
      dead: typeof source.dead === 'boolean' ? source.dead : state.seats[seatId]?.dead };
    const visible = source.knownHandCardIds ?? source.handShowCardIDs ?? source.HandShowCardIDs ?? [];
    const own = seatId === state.selfSeatId ? source.handCardIds ?? source.handCards : undefined;
    const count = int(source.handCount);
    // The public count can reach zero before the shown card cache clears.
    const ids = count === 0 && own == null ? [] : cardIds(own ?? visible);
    reveal(state, ids, zoneKey(5, seatId), seq, count, count === 0 || Array.isArray(own));
  }
  if (validSeat(state.selfSeatId) && data.handCardIds) {
    const ids = cardIds(data.handCardIds);
    reveal(state, ids, zoneKey(5, state.selfSeatId), seq, ids.length, true);
  }
  flags(state);
}

function recent(state, seatId, ids, observed = true) {
  if (!validSeat(seatId) || !ids.length) return;
  if (observed) for (const id of ids) card(state, id).seen = true;
  state.recentBySeat[seatId] = ids.at(-1);
  if (Number(seatId) === state.currentSeatId) state.recentCurrent = ids.at(-1);
}

function startTurn(state, seatId, turn) {
  state.skillUses = { complete: true, counts: {} };
  if (validSeat(seatId)) state.currentSeatId = Number(seatId);
  state.turn = Number.isFinite(Number(turn)) ? Number(turn) : state.turn + 1;
  state.discardTurn = [];
  state.recentCurrent = null;
  for (const key of Object.keys(state.pending)) if (key.startsWith('legacyExchange:') || key.startsWith('legacyCandidates:') || key === 'legacyYingshi') delete state.pending[key];
}

function removeOrder(source, ids, count, position) {
  const set = new Set(ids);
  source.order = source.order.filter(id => !set.has(id));
  if (source.kind !== 1) return;
  if (position === POSITION.top) {
    source.top = source.top.slice(count);
    source.bottom = source.bottom.filter(id => !set.has(id));
  } else if (position === POSITION.bottom) {
    source.bottom = source.bottom.slice(count);
    source.top = source.top.filter(id => !set.has(id));
  } else {
    // An unknown position can invalidate any remembered prefix.
    source.top = [];
    source.bottom = [];
  }
}

function addOrder(target, ids, count, position) {
  target.order = [...target.order.filter(id => !ids.includes(id)), ...ids];
  if (target.kind !== 1) return;
  const entries = Array.from({ length: count }, (_, index) => ids[index] ?? null);
  if (position === POSITION.top) target.top = [...entries, ...target.top.filter(id => !ids.includes(id))];
  else if (position === POSITION.bottom) target.bottom = [...entries, ...target.bottom.filter(id => !ids.includes(id))];
  else { target.top = []; target.bottom = []; }
  // Prefixes cannot outlive the number of cards remaining in the pile.
  target.top = target.top.slice(0, target.count);
  target.bottom = target.bottom.slice(0, target.count);
}

function inferIds(state, payload, source, supplied, count, position, wholeZone) {
  const skill = Number(payload.SpellID) || 0;
  let correlated = null;
  const consume = key => { const value = state.pending[key]; delete state.pending[key]; return value; };
  if ([0x122, 0xbf9].includes(skill) && Number(payload.MoveType) === 15 &&
      (source.kind === 5 || skill === 0x122 && source.kind === 6) && Number(payload.ToZone) === 4 &&
      Number(payload.ToZoneParam) === skill && validSeat(payload.FromID) && Number(payload.ToID) === Number(payload.FromID)) {
    correlated = consume(`known:${skill}:${payload.FromID}`);
  }
  if ([0xc55, 0xd6a].includes(skill) && source.kind === 2 && Number(payload.ToZone) === 5) {
    correlated = consume(`gain:${skill}:${payload.ToID}`);
  }
  if ([0xea6, 0xea9].includes(skill) && source.kind === 2 && Number(payload.ToZone) === 1 &&
      Number(payload.ToPosition) === POSITION.top && Number(payload.MoveType) === 15) {
    correlated = consume(`return:${skill}:${payload.SrcSeatID}`);
  }
  if (source.kind === 5 && !(Number(payload.ToZone) === 5 && Number(payload.ToID) === Number(payload.FromID))) {
    const shown = consume(`zexing:${payload.FromID}`);
    if (skill === 0xf0e && Number(payload.MoveType) === 18 && Number(payload.ToZone) === 5 && count === 1 && shown?.turn === state.turn) correlated = [shown.id];
  }
  if (supplied.length === count) return supplied;
  if (CONSERVATIVE.has(skill) && !orderedSiqiMove(payload)) return [];
  if (correlated?.length === count) return correlated;
  if (skill === 0xdb7 && source.kind === 2 && Number(payload.ToZone) === 5 && state.pending.gainedDiscard?.length === count) {
    const ids = state.pending.gainedDiscard;
    delete state.pending.gainedDiscard;
    return ids;
  }
  if (source.kind === 1) {
    const ordered = position === POSITION.top ? source.top : position === POSITION.bottom ? source.bottom : [];
    const prefix = ordered.slice(0, count);
    if (prefix.length === count && prefix.every(id => id > 0)) return prefix;
  }
  // Skill-window and exchange zones have no semantic order; never turn their
  // object insertion order into an ordered placement elsewhere.
  if (wholeZone && (count === 1 || source.kind !== 8 && source.kind !== 10)) {
    const known = Object.values(state.cards).filter(item => item.locations.length === 1 && item.locations[0] === source.key).map(item => item.id);
    if (known.length === count) return known;
  }
  return [];
}

function move(state, data, seq) {
  const count = int(data.CardCount);
  if (count === null || count < 0 || count > 2000) {
    note(state, 'invalid-move', '移牌数量无效，已忽略该事件', seq);
    return;
  }
  if (!count || Number(data.MoveType) === 0 || Number(data.ToZone) === 11) return;
  if (int(data.FromZone) === null || int(data.ToZone) === null) {
    forget(state, '移牌缺少牌区，需重新确认明牌', seq);
    return;
  }
  const from = zoneKey(data.FromZone, data.FromID, data.FromZoneParam);
  const to = zoneKey(data.ToZone, data.ToID, data.ToZoneParam);
  const source = zone(state, from), target = zone(state, to);
  if (state.deckRemaining !== null && from !== to) {
    if (source.kind === 1) state.deckRemaining = Math.max(0, state.deckRemaining - count);
    if (target.kind === 1) state.deckRemaining += count;
  }
  const skill = Number(data.SpellID) || 0;
  let position = int(data.FromPosition) ?? POSITION.unknown;
  let destination = int(data.ToPosition) ?? POSITION.unknown;
  let supplied = cardIds(data.CardIDs);
  const legacy = legacyBeforeMove(state, data, seq, legacyHelpers);
  if (legacy.position !== undefined) position = legacy.position;
  if (legacy.destination !== undefined) destination = legacy.destination;
  if (legacy.hiddenCreation) supplied = [];
  if (skill === 0x2c9 && Number(data.MoveType) === 0x15 && Array.isArray(data.CardIDs) && count === data.CardIDs.length - 2) {
    const raw = data.CardIDs.slice(1);
    raw.splice(Number(data.CardIDs[0]), 1);
    supplied = cardIds(raw);
  }
  if (supplied.length && supplied.length !== count) {
    note(state, 'partial-card-ids', '移牌数量与公开牌号不一致，按未知移动记录', seq);
    supplied = [];
  }
  if (source.kind === 1 && position === POSITION.unknown) {
    if (START_TOP_SKILLS.has(skill) || Number(data.MoveType) === 13 && count === 1 || skill === 0x31b && target.kind === 4 && count === 1) position = POSITION.top;
    if (skill === 0xec0 && target.kind === 10 && count === 3 || skill === 0xc1d && target.kind === 5 && count === 1) position = POSITION.bottom;
    if ([0x1b68, 0x1b69].includes(skill) && !state.mode.flags.includes('guozhan') && target.kind === 5 && count === 1) position = POSITION.top;
  }
  if (CONSERVATIVE.has(skill) && !supplied.length && !legacy.ids?.length && !orderedSiqiMove(data)) {
    note(state, `skill:${skill}`, `技能 ${skill} 的隐藏移牌仅保留可能归属`, seq);
    source.top = []; source.bottom = [];
    destination = POSITION.unknown;
  }
  if (target.kind === 1 && destination === POSITION.top && supplied.some(id => id === 0x1130 || id === 0x1131)) destination = POSITION.unknown;
  if (from === to && !(source.kind === 1 && position !== destination)) {
    if (skill === 0xf0e && source.kind === 5 && Number(data.MoveType) === 21) {
      delete state.pending[`zexing:${data.FromID}`];
      if (count === 1 && supplied.length === 1) state.pending[`zexing:${data.FromID}`] = { id: supplied[0], turn: state.turn };
    }
    if (supplied.length && !legacy.suppressReveal) reveal(state, supplied, from, seq);
    if (Number(data.MoveType) === 24 && source.kind === 5 && supplied.length === count) {
      for (const item of Object.values(state.cards)) {
        if (item.locations.includes(from) && !supplied.includes(item.id)) item.locations = ['?'];
      }
      source.count = count;
      source.countExact = true;
    }
    legacyAfterMove(state, data, seq, legacy.suppressReveal ? [] : supplied, legacyHelpers);
    return;
  }
  if (Number(data.ToZone) === 9 && source.kind === 2) {
    for (const item of Object.values(state.cards)) {
      if (item.locations.includes(from)) item.locations = [...new Set(item.locations.map(key => key === from ? to : key))];
    }
    target.count += source.count;
    source.count = 0; source.order = [];
    target.top = []; target.bottom = []; target.order = [];
    state.discardTurn = [];
    state.pending = {};
    return;
  }
  const previousCount = source.count;
  const wholeZone = previousCount === count && (source.kind !== 5 || (source.countExact ?? state.historyComplete));
  const ids = legacy.hiddenCreation ? [] : supplied.length === count ? supplied : legacy.ids?.length === count ? legacy.ids : inferIds(state, data, source, supplied, count, position, wholeZone);
  if (previousCount < count && source.kind !== 0 && source.kind !== 12) {
    if (source.kind === 5) source.countExact = false;
    state.historyComplete = false;
    state.deckRemaining = null;
    note(state, 'zone-underflow', '记录开始较晚或有缺失事件，部分牌区不完整', seq);
  }
  if (ids.length !== count) {
    for (const item of Object.values(state.cards)) {
      if (!item.locations.includes(from)) continue;
      const locations = wholeZone ? item.locations.filter(key => key !== from) : item.locations;
      item.locations = [...new Set([...locations, to])];
      item.lastSeq = seq;
    }
  } else {
    const tag = source.kind === 1 ? '摸牌' : source.kind === 2 ? '弃牌获得' : source.kind === 5 && source.seatId !== target.seatId ? `来自${seatLabel(state, source.seatId)}` : ZONE_NAMES[source.kind];
    for (const id of ids) locate(state, id, to, seq, target.kind === 5 ? tag : null, supplied.includes(id));
  }
  source.count = Math.max(0, source.count - count);
  if (source.kind === 1 && state.historyComplete && previousCount > 0 && source.count === 0) state.deckCycleCompleted = true;
  target.count += count;
  removeOrder(source, ids, count, position);
  addOrder(target, ids, count, destination);
  // A complete departure also eliminates cards whose identities were only possible here.
  if (source.kind === 5 && wholeZone) reveal(state, [], from, seq, 0, true);
  legacyAfterMove(state, data, seq, ids, legacyHelpers);
  if (source.kind === 2) state.discardTurn = state.discardTurn.filter(id => !ids.includes(id));
  if (target.kind === 2) state.discardTurn = [...state.discardTurn.filter(id => !ids.includes(id)), ...ids];
  if (Number(data.MoveType) === 2 && [5, 6].includes(source.kind)) recent(state, source.seatId, ids, false);
  state.moves.push({ seq, from, to, count, ids, skill });
  if (state.moves.length > 40) state.moves.shift();
}

function spell(state, data, seq) {
  const skill = Number(data.SpellID), ids = cardIds(data.CardIDs);
  const seat = int(data.SeatID), effect = int(data.EffectIndex);
  if (validSeat(seat) && skill === 0xc12 && effect === 1) {
    state.skillUses ||= { complete: false, counts: {} };
    const key = `${skill}:${seat}`;
    state.skillUses.counts[key] = (state.skillUses.counts[key] || 0) + 1;
  }
  const yushiCounts = state.yushiUses?.counts;
  if (validSeat(seat) && skill === YUSHI && effect === 2 && yushiCounts) {
    yushiCounts[seat] = (yushiCounts[seat] ?? 0) + 1;
  }
  recent(state, data.SeatID, ids);
  const count = int(data.CardCount ?? data.card_count) ?? ids.length;
  if (validSeat(seat)) {
    if ([0x122, 0xbf9].includes(skill) && Number(data.EffectIndex) === 1) {
      delete state.pending[`known:${skill}:${seat}`];
      if (ids.length && ids.length === count) state.pending[`known:${skill}:${seat}`] = ids;
    }
    if (skill === 0xc55 && ids.length && ids.length === count) state.pending[`gain:${skill}:${seat}`] = ids;
    if (skill === 0xd6a && [1, 2].includes(Number(data.EffectIndex)) && count === 1 && ids.length === 1) state.pending[`gain:${skill}:${seat}`] = ids;
    if ([0xea6, 0xea9].includes(skill)) {
      delete state.pending[`return:${skill}:${seat}`];
      if (Number(data.EffectIndex) === 2 && Array.isArray(data.DestSeatIDs) && !data.DestSeatIDs.length && ids.length) state.pending[`return:${skill}:${seat}`] = ids;
    }
  }
  if (skill === 0xdb7 && Number(data.SrcSeatID) === state.selfSeatId && ids.length) state.pending.gainedDiscard = ids;
  if (CONSERVATIVE.has(skill)) note(state, `skill:${skill}`, `技能 ${skill} 的隐藏移牌仅保留可能归属`, seq);
}

function revealSkillHand(state, data, seq) {
  const skill = int(data.SpellID), type = int(data.Type);
  // QiangZhiPo enables ShowHands in SelectCardWindow; its hand-selection
  // request carries the complete target hand in Params (unlike base QiangZhi).
  if (!(skill === ZUIFENG && type === OPT_SKILL_FLAG1 ||
        skill === QIANGZHI_PO && type === OPT_SEL_CARD_HAND) || !validSeat(data.TargetSeatID)) return;
  const values = list(data.Params);
  // A missing, masked or invalid list must not erase prior observations. Native
  // SelectCardWindow consumes each Params entry as one complete hand card ID.
  if (!values.length || values.length !== data.Params.length || values.some(id => int(id) === null || int(id) <= 0)) return;
  const ids = cardIds(values);
  if (ids.length !== values.length) return;
  reveal(state, ids, zoneKey(5, Number(data.TargetSeatID)), seq, ids.length, true);
}

function revealZhitianTop(state, data, seq) {
  // Native ZhiTian2.DealCardZoneCards consumes Datas in pile order for
  // OPT_DEALCARD_ZONE_CARDS (30) / OPT_LOOKTOP_RESULT (50), not type 73 tips.
  if (int(data.SpellID) !== 0xea0 || ![30, 50].includes(int(data.Type))) return;
  const values = data.Datas;
  if (!Array.isArray(values) || !values.length || values.length > 7 ||
      values.some(id => !Number.isInteger(id) || id <= 0 || id >= 0xffff) || new Set(values).size !== values.length) return;
  const target = zone(state, zoneKey(1));
  for (const id of values) locate(state, id, target.key, seq);
  target.top = values.slice();
  target.bottom = target.bottom.filter(id => !values.includes(id));
  target.count = Math.max(target.count, values.length);
}

function revealSkillPile(state, data, seq) {
  if (int(data.Type) !== OPT_SKILL_FLAG1) return;
  const values = data.Params;
  const validIds = ids => ids.length > 0 && ids.every(id => Number.isInteger(id) && id > 0 && id < 0xffff) && new Set(ids).size === ids.length;
  let ids, side;
  if (int(data.SpellID) === SIQI) {
    // SiQi.OutsideCards reads only the revealed bottom cards from Params.
    if (!Array.isArray(values) || values.length > 3 || !validIds(values)) return;
    ids = values; side = 'bottom';
  } else if (int(data.SpellID) === JIELI) {
    // GuanXuWindow.SetCardIds: [pileCount, handCount, ...pile, ...hand].
    if (!Array.isArray(values)) return;
    const [pileCount, handCount] = values;
    if (!Number.isInteger(pileCount) || pileCount < 1 || pileCount > 32 ||
        !Number.isInteger(handCount) || handCount < 0 || handCount > 200 ||
        values.length !== 2 + pileCount + handCount) return;
    ids = values.slice(2, 2 + pileCount); side = 'top';
    if (!validIds(ids)) return;
  } else return;
  const target = zone(state, zoneKey(1)), other = side === 'top' ? 'bottom' : 'top';
  for (const id of ids) locate(state, id, target.key, seq);
  target[side] = ids.slice();
  target[other] = target[other].filter(id => !ids.includes(id));
  target.count = Math.max(target.count, ids.length);
}

// The native protocol classes use getters over Protocol/ProtoObj while forks
// may pass their body directly. Normalize only fields used by this reducer.
// An empty wrapper array must not mask a populated body array.
const cardFields = Object.entries(cardFieldNames);
export function normalizeCardPayload(payload = {}) {
  const queue = [payload], sources = [], seen = new Set();
  for (let index = 0; index < queue.length && index < 32; index++) {
    const value = queue[index];
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value); sources.push(value);
    for (const key of cardPacketWrappers) {
      if (value[key] && typeof value[key] === 'object') queue.push(value[key]);
    }
  }
  const result = { ...payload };
  const pick = names => {
    let empty;
    for (const source of sources) for (const name of names) {
      const value = source[name];
      if (value === undefined || value === null) continue;
      if (typeof value === 'object' && value.length === 0) { empty = value; continue; }
      return value;
    }
    return empty;
  };
  for (const [key, names] of cardFields) {
    const value = pick(names);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function reduce(previous, event) {
  if (!event || !EVENT_TYPES.has(event.type)) return previous;
  const data = event.type.startsWith('toolbox:') ? event.payload || {} : normalizeCardPayload(event.payload);
  if (data.isSend || event.type === 'toolbox:snapshot' && (data.pokerReplay || data.pokerTable)) return previous;
  const seq = Number(event.seq) || previous.lastSeq + 1;
  const changedSession = previous.sessionId !== null && event.sessionId != null && event.sessionId !== previous.sessionId;
  if (!changedSession && seq <= previous.lastSeq) return previous;
  let state = changedSession ? initialState() : clone(previous);
  state.sessionId = event.sessionId ?? state.sessionId;
  state.lastSeq = seq;
  state.lastEvent = event.type;
  if (['GsCRoleOptTargetNtf', 'CGsRoleSpellOptRep'].includes(event.type))
    legacyReveal(state, data, seq, { ...legacyHelpers, eventType: event.type });
  legacyEvent(state, data, seq, event.type, legacyHelpers);
  reduceSkillHints(state, data, seq, event.type);
  switch (event.type) {
    case 'toolbox:snapshot': snapshot(state, data, seq); break;
    case 'toolbox:gap': forget(state, String(data.reason || '事件记录存在缺口'), seq); break;
    case 'MsgGamePlayCardNtf': {
      const ids = cardIds(data.CardList);
      const before = state;
      state = { ...initialState(), sessionId: state.sessionId, lastSeq: seq, selfSeatId: state.selfSeatId,
        mode: state.mode, seats: state.seats, active: true, historyComplete: ids.length > 0, seenHistoryComplete: ids.length > 0,
        deckIds: ids, deckStartSeq: seq, deckRemaining: ids.length || null, lastEvent: event.type,
        skillUses: { complete: true, counts: {} } };
      if (ids.length && !data.IsResume) state.yushiUses = { round: 1, counts: {} };
      if (!ids.length) note(state, 'no-deck', '开局牌表缺失，牌堆总数未知', seq);
      for (const id of ids) locate(state, id, zoneKey(1), seq, null, false);
      zone(state, zoneKey(1)).count = ids.length;
      flags(state);
      if (before.mode.sceneName) state.mode.sceneName = before.mode.sceneName;
      break;
    }
    case 'PubGsCMoveCard': move(state, data, seq); state.active = true; break;
    case 'PubGsCUseCard': if (Number(data.useType ?? 1) === 1) recent(state, data.SeatID, cardIds(data.CardIDs?.length ? data.CardIDs : [data.CardID])); break;
    case 'PubGsCUseSpell': spell(state, data, seq); break;
    case 'MsgGameTurnNtf': {
      // TurnCnt feeds the native table round display. GsCGamephaseNtf only advances a player's turn.
      const round = int(data.TurnCnt);
      if (Number.isSafeInteger(round) && round > (state.yushiUses?.round ?? 0)) {
        state.yushiUses = { round, counts: data.IsResume ? null : {} };
      }
      startTurn(state, data.SeatID, data.TurnCnt);
      break;
    }
    case 'GsCGamephaseNtf':
      if (Number(data.Round) === 0 && (Number(data.SeatID) !== state.currentSeatId || state.phase !== 0)) startTurn(state, data.SeatID);
      state.phase = int(data.Round);
      if (validSeat(data.SeatID)) state.currentSeatId = Number(data.SeatID);
      break;
    case 'MsgGameRoundNtf': state.pending.roundPassed = !!data.isPassed; break;
    case 'MsgReconnectGame': forget(state, '断线重连：仅记录重新确认的明牌', seq); state.connected = true; break;
    case 'MsgReconnectGameHand': {
      const seat = data.SeatIndex ?? data.seat_id ?? data.seatId;
      const ids = cardIds(data.CardIDs ?? data.hand_cards);
      if (validSeat(seat)) reveal(state, ids, zoneKey(5, seat), seq, int(data.Count ?? data.hand_count), true);
      break;
    }
    case 'decodeClientGetCardInfoResp': {
      if (validSeat(data.SeatID)) reveal(state, cardIds(data.CardIDs ?? data.CardList), zoneKey(5, data.SeatID), seq);
      break;
    }
    case 'ClientHappyGetFriendHandcardRep':
      if ((data.error_id === undefined || [0, 1].includes(Number(data.error_id))) && validSeat(data.SeatID)) reveal(state, cardIds(data.CardIDs ?? data.CardList), zoneKey(5, data.SeatID), seq);
      break;
    case 'decodeGameDealPileTopCardList': {
      const ids = cardIds(data.list_card_id);
      if (data.IsResume && ids.length) {
        const target = zone(state, zoneKey(1));
        for (const id of ids) locate(state, id, target.key, seq);
        target.top = ids;
        target.count = Math.max(target.count, ids.length);
      }
      break;
    }
    case 'SmsgGameSetCharacter': {
      const infos = Array.isArray(data.Infos) ? data.Infos : [];
      if (state.selfSeatId === null && state.mode.flags.includes('ddz') && infos.length === 1) state.selfSeatId = int(infos[0].SeatID);
      for (const item of infos) {
        if (validSeat(item.SeatID)) state.seats[item.SeatID] = { ...state.seats[item.SeatID], seatId: Number(item.SeatID), generals: [item.CharacterID] };
      }
      break;
    }
    case 'GsCGuoZhanSetCharacter': {
      if (!validSeat(data.SeatID)) break;
      const seat = state.seats[data.SeatID] ||= { seatId: Number(data.SeatID), generals: [null, null] };
      seat.generals ||= [null, null];
      for (const item of data.GeneralData || []) if ([0, 1].includes(Number(item.index))) seat.generals[item.index] = item.cardID;
      break;
    }
    case 'GsCRoleOptTargetNtf':
      revealSkillHand(state, data, seq);
      revealSkillPile(state, data, seq);
      if (CONSERVATIVE.has(Number(data.SpellID))) note(state, `skill:${data.SpellID}`, `技能 ${data.SpellID} 的隐藏移牌仅保留可能归属`, seq);
      break;
    case 'CGsRoleSpellOptRep':
      revealZhitianTop(state, data, seq);
      if (CONSERVATIVE.has(Number(data.SpellID))) note(state, `skill:${data.SpellID}`, `技能 ${data.SpellID} 的隐藏移牌仅保留可能归属`, seq);
      break;
    case 'SmsgGamePlayerDead':
      if (validSeat(data.SeatID)) (state.seats[data.SeatID] ||= { seatId: Number(data.SeatID) }).dead = true;
      break;
    case 'MsgGameOver': state.active = false; break;
    case 'ClientLeavetableRep':
      state = { ...initialState(), sessionId: state.sessionId, lastSeq: seq, selfSeatId: state.selfSeatId }; break;
    case 'ClientLoginRep':
      if (state.pending.account && data.userID && state.pending.account !== String(data.userID)) state = { ...initialState(), sessionId: state.sessionId, lastSeq: seq };
      if (data.userID) state.pending.account = String(data.userID);
      break;
  }
  return state;
}

const legacyHelpers = { reveal, zone, locate, zoneKey, cardIds, validSeat, int };

export function cardsInZone(state, key, certainty = 'known') {
  return Object.values(state.cards).filter(item => item.locations.includes(key) &&
    (certainty === 'all' || (certainty === 'known' ? item.locations.length === 1 : item.locations.length > 1))).map(item => item.id);
}

export function seatLabel(state, seatId) {
  const seat = state.seats[seatId];
  if (seat?.name) return seat.name;
  if (Number.isInteger(seat?.position) && seat.position > 0) return `${seat.position}号位`;
  // Protocol IDs can be sparse or one-based. Never invent an action order.
  return `玩家（ID ${seatId}）`;
}

// Broad hidden-deal candidates are useful only after a fully observed pile has
// run out and only one living player's hand is still uncertain. Fully visible
// teammates can be excluded even in multiplayer modes. Observations do not need
// this gate.
export function observedHandCandidates(state, seatId) {
  if (!state.active || state.seats[seatId]?.dead) return [];
  return cardsInZone(state, zoneKey(5, seatId), 'possible').filter(id => {
    const item = state.cards[id];
    return item.seen && item.locations.every(key => key.startsWith('5:'));
  });
}

export function handCandidates(state, seatId) {
  if (!state.active || !state.historyComplete || !state.deckCycleCompleted || !validSeat(state.selfSeatId)) return [];
  const living = Object.values(state.seats).filter(seat => seat.dead !== true);
  if (!living.some(seat => seat.seatId === state.selfSeatId) || seatId === state.selfSeatId) return [];
  const uncertain = living.filter(seat => {
    const key = zoneKey(5, seat.seatId), hand = state.zones[key];
    return !hand || hand.countExact === false || cardsInZone(state, key).length !== hand.count;
  });
  if (uncertain.length !== 1 || uncertain[0].seatId !== seatId) return [];
  return cardsInZone(state, zoneKey(5, seatId), 'possible');
}

export function unknownCards(state) {
  return Object.values(state.cards).filter(item => item.locations.length !== 1 || item.locations[0] === '?').map(item => item.id);
}

function slashKind(info) {
  const type = String(info.cardClass || '').split('.').at(-1);
  if (/^(?:火杀|火焰杀)$/.test(info.name) || type === 'HuoShaNCard') return '火杀';
  if (/^(?:雷杀|雷电杀)$/.test(info.name) || type === 'LeiShaNCard') return '雷杀';
  if (/^(?:冰杀|冰霜杀)$/.test(info.name) || type === 'BingShaNCard') return '冰杀';
  return info.name === '杀' || type === 'ShaNCard' ? '普通杀' : null;
}

function addCardNames(info, id, add) {
  const kind = slashKind(info);
  if (!kind) { add(info.name, id); return; }
  add('杀', id); add(kind, id, true);
  if (info.suit === 1 || info.suit === 2) add('红杀', id, true);
  if (info.suit === 3 || info.suit === 4) add('黑杀', id, true);
}

export function queryCardNames(cards, getMeta) {
  const names = new Set();
  const addName = name => names.add(name);
  for (const { id } of cards) addCardNames(getMeta(id), id, addName);
  return [...names];
}

export function deckComposition(state, groupBy = 'name', getMeta = id => ({ name: '卡牌 ' + id })) {
  const initial = [...new Set(state.deckIds)], groups = new Map();
  const add = (key, id, subgroup = false) => {
    const row = groups.get(key) || { key, ids: [], subgroup };
    row.ids.push(id); groups.set(key, row);
  };
  for (const id of initial) {
    const info = getMeta(id);
    if (groupBy === 'suit') add(String(info.suit || 0), id);
    else if (groupBy === 'number') add(String(info.number || 0), id);
    else addCardNames(info, id, add);
  }
  const rows = [...groups.values()].map(row => {
    const seenIds = row.ids.filter(id => wasSeen(state, id));
    return { ...row, seenIds, total: row.ids.length, seen: seenIds.length, unseen: row.ids.length - seenIds.length };
  });
  const slashOrder = ['杀', '普通杀', '火杀', '雷杀', '冰杀', '红杀', '黑杀'];
  rows.sort((a, b) => {
    if (groupBy !== 'name') return Number(a.key) - Number(b.key);
    if (slashOrder.includes(a.key) && slashOrder.includes(b.key)) return slashOrder.indexOf(a.key) - slashOrder.indexOf(b.key);
    const aSlash = slashOrder.includes(a.key), bSlash = slashOrder.includes(b.key);
    return (bSlash ? groups.get('杀').ids.length : b.total) - (aSlash ? groups.get('杀').ids.length : a.total) ||
      Number(bSlash) - Number(aSlash) || String(a.key).localeCompare(String(b.key), 'zh-CN');
  });
  const seen = initial.filter(id => wasSeen(state, id)).length;
  return { available: initial.length > 0, total: initial.length, seen, unseen: initial.length - seen,
    complete: state.historyComplete && state.seenHistoryComplete === true, rows };
}

export function metadata(game, id) {
  let value;
  try { value = game?.getCardMeta?.(id); } catch { /* Missing definitions stay explicit. */ }
  value ||= {};
  const cardClass = String(value.cardClass ?? value.ClassName ?? value.className ?? '');
  let name = String(value.name ?? value.CardName ?? value.Name ?? `卡牌 ${id}`);
  if (name === '杀') name = ({ HuoShaNCard: '火杀', LeiShaNCard: '雷杀', BingShaNCard: '冰杀' }[cardClass.split('.').at(-1)] || name);
  return { id: Number(id), name,
    suit: Number(value.suit ?? value.FlowerOnSeat ?? value.CardFlower ?? value.color) || 0,
    number: Number(value.number ?? value.CardNumber ?? value.Number) || 0,
    type: value.type ?? value.CardType ?? value.Type ?? 0,
    cardClass };
}

export function sortCards(ids, mode, getMeta) {
  const fields = { suit: ['suit', 'type', 'number'], type: ['type', 'suit', 'number'], number: ['number', 'suit', 'type'] }[mode];
  if (!fields) return ids.slice();
  return ids.map((id, index) => ({ id, index, meta: getMeta(id) })).sort((a, b) => {
    for (const field of fields) {
      const left = a.meta[field], right = b.meta[field];
      const difference = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'zh-CN');
      if (difference) return difference;
    }
    return a.index - b.index;
  }).map(item => item.id);
}

function matchesQueryName(info, name, exactName) {
  if (!exactName) return info.name.includes(name);
  const kind = slashKind(info);
  if (name === '杀') return Boolean(kind);
  if (name === '红杀') return Boolean(kind) && (info.suit === 1 || info.suit === 2);
  if (name === '黑杀') return Boolean(kind) && (info.suit === 3 || info.suit === 4);
  return (kind || info.name) === name;
}

export function queryCardPreview(cards, criteria, getMeta, limit) {
  const { name, exactName, suit, number, zone } = criteria;
  const selectedSuit = Number(suit), selectedNumber = Number(number);
  const ids = [];
  let total = 0;
  for (const { id, locations } of cards) {
    if (zone && !locations.some(key => key.split(':', 1)[0] === zone)) continue;
    if (name || suit || number) {
      const info = getMeta(id);
      if ((suit && info.suit !== selectedSuit) || (number && info.number !== selectedNumber)) continue;
      if (name && !matchesQueryName(info, name, exactName)) continue;
    }
    total++;
    if (ids.length < limit) ids.push(id);
  }
  return { ids, total };
}

export function queryCards(state, criteria, getMeta) {
  return queryCardPreview(Object.values(state.cards), criteria, getMeta, Infinity).ids;
}
