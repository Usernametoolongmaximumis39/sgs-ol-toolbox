import { read } from '../../../shared/safe-read.js';
import { isPokerReplayActive } from '../../../shared/poker-replay-mode.js';
import { pokerSkill } from '../poker-skills.js';
import { cardFace, pokerMultiplier } from '../replay/model.js';
import { POKER_ZONE } from '../replay/remaining.js';
import { createPokerSkillActions, GUAN_XING } from './skill-actions.js';

const { BOTTOM, HAND, PLAYED, OUTSIDE, DISCARD } = POKER_ZONE;
const GENERAL_PHASE = 101;
const BID_PHASE = 103;
const PLAY_PHASE = 202;
const MOVE_DISCARD = 3;
const MAX_CARDS = 54;
const TU_XI = 17;
const REVEAL_MS = 1700;
const TRUSTEE_TIMEOUT = 2000;
const HINT_TIMEOUT = 2500;
const SURRENDER_TIMEOUT = 5000;
const PROTOCOL = {
  start: 201000,
  turn: 201001,
  play: 201002,
  playReply: 201003,
  played: 201004,
  move: 201005,
  generalOptions: 201006,
  preselectGeneral: 201007,
  selectGeneral: 201010,
  generalReply: 201011,
  generalResult: 201013,
  bidTurn: 201014,
  bid: 201015,
  bidReply: 201016,
  bidResult: 201017,
  roles: 201019,
  multiplier: 201020,
  phase: 201021,
  over: 201022,
  pass: 201023,
  passReply: 201024,
  zone: 201025,
  playerState: 201026,
  skillUse: 201027,
  skillUseReply: 201028,
  skillUsed: 201029,
  skillPrompt: 201030,
  skillChoice: 201031,
  skillChoiceReply: 201032,
  rate: 201033,
  skillData: 201034,
  snapshot: 201035,
  trust: 201036,
  roleUpdate: 201037,
  hint: 201069,
  hintReply: 201071,
  skin: 21448,
  surrender: 108042,
  surrenderReply: 108204,
  surrenderLegacyReply: 21289,
  settlement: 21228,
  settlementPb: 108023,
};

const values = (value, limit = MAX_CARDS) => Array.isArray(value) ? value.slice(0, limit) : [];
const integer = (value, fallback = 0) => Number.isSafeInteger(value) ? value : fallback;
const rate = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const seatId = (value = 0) => Number.isInteger(value) && value >= 0 && value < 8 ? value : null;
const cardId = value => Number.isInteger(value) && value > 0 && value <= 0xffffffff;

function optionIndex(value) {
  if (!Number.isInteger(value?.low) || !Number.isInteger(value?.high)
      || (value.low | 0) !== value.low || (value.high | 0) !== value.high) return null;
  return { low: value.low, high: value.high, unsigned: value.unsigned === true };
}

function optionKey(value) {
  const index = optionIndex(value);
  return index && `${index.high}:${index.low}`;
}

function cardsFrom(value) {
  return values(value).map(raw => {
    const id = integer(raw?.card_id);
    const dynamicNumber = integer(raw?.num);
    const dynamicSuit = integer(raw?.suit);
    const wild = integer(raw?.wild_num);
    const wildSkill = integer(raw?.wild_spell_id);
    const virtual = raw?.is_virtual === true;
    const face = cardFace(id, dynamicSuit, dynamicNumber, wild, wildSkill, virtual);
    return { ...face, number: face.rank, dynamicNumber, dynamicSuit, ...(raw?.spell_area_id && { areaSkill: raw.spell_area_id }) };
  });
}

function visibleHandCards(value) {
  return values(value).flatMap(row => {
    const position = integer(row?.position_index, 0);
    const face = row?.card;
    if (position < 0 || position >= MAX_CARDS || !cardId(face?.card_id) || face.is_virtual === true) return [];
    return [{ ...cardsFrom([face])[0], position }];
  });
}

function location(value) {
  return value && { seat: seatId(value.seat_id), zone: integer(value.zone_type) };
}

function landlordSeat(value) {
  const row = values(value?.identities, 8).find(entry => entry.identity_type === 1);
  return row ? seatId(row.seat_id) : null;
}

function publicCount(data, cards) {
  return Math.max(0, integer(data.card_num) || cards.length);
}

function playSignature(cards) {
  return cards.map(card => card.id).sort((left, right) => left - right).join(',');
}

function putCard(card, wildRank) {
  return { card_id: card.id, spell_num: card.dynamicNumber, spell_suit: card.dynamicSuit,
    ...(wildRank !== undefined && { wild_num: wildRank }) };
}

export function createPokerTransport(ctx, scope, match, consume, { acceptsLateResult, knowsHandCard } = {}) {
  if (!match || typeof consume !== 'function' || scope.closed) return null;
  const { proxy, account, connection, tableId, selfSeat, room } = match;
  if (!proxy || typeof proxy.M !== 'function' || typeof proxy.AddEventListener !== 'function'
      || typeof proxy.RemoveEventListener !== 'function' || !account || !room
      || !Number.isSafeInteger(tableId) || tableId <= 0 || seatId(selfSeat) !== selfSeat) return null;

  let ended = false;
  let prompt = null;
  let countdown = null;
  let pending = null;
  let hint = null;
  let phase = null;
  let landlord = null;
  let observedTarget = null;
  let trustee = false;
  let pendingTrustee = null;
  let surrendering = null;
  const playerTrustees = new Map();
  const lastOptions = new Map();
  const replacedGeneralOptions = new Set();
  const visiblePlayed = new Map();
  const discarded = new Set();
  let hand = new Map();
  let expectedHandCount = null;
  const owner = {};
  const now = () => ctx.window?.performance?.now?.() ?? Date.now();
  const sameConnection = () => read(() => !scope.closed && proxy.ConnectedSucess1 === true
    && ctx.game.getServerProxy() === proxy && proxy.ConnId === connection
    && String(ctx.native.account().id) === String(account) && !isPokerReplayActive(ctx.document)
    && ctx.game.isReplay?.() !== true) === true;
  const sameTable = () => read(() => {
    if (Number(room.TableId) !== tableId || !sameConnection()) return false;
    const game = ctx.game.getClass?.('GameContext');
    return game?.IsViewerOrReplay?.() !== true && (game?.GetModeType?.() ?? 175) === 175 && (game?.GetGroupID?.() ?? 2) === 2;
  }) === true;
  if (!sameTable()) return null;

  const skillActions = createPokerSkillActions({
    send: sendSkill,
    publish(type, event) {
      if (type === 'skill-options' && event.copyCard && !event.fromHand && observedTarget !== null) {
        const cards = event.cards.filter(card => !card.hidden && !card.virtual);
        if (cards.length) emit('visible-hand', { seat: observedTarget, cards, skill: GUAN_XING, remembered: true });
        observedTarget = null;
      }
      emit(type, event);
    },
    getSelfSeat: () => selfSeat,
    getLandlord: () => landlord,
    getHand: () => [...hand.values()],
    getSeats: () => match.seats || [],
    getSkill: id => pokerSkill(ctx, id),
    getCurrentOption: () => prompt && now() < prompt.expiresAt ? { kind: prompt.kind, optionKey: prompt.key } : null,
  });
  scope.add(() => skillActions.reset());

  function ownSeatStillMatches(allowTrustee = false) {
    return read(() => {
      if (room.IsGameStart !== true || proxy.CacheStarted === true || proxy.IsOffline === true) return false;
      const game = ctx.game.getClass?.('GameContext');
      const seat = game?.SelfSeat;
      if (game?.CanOperationInGame?.() === false || (!allowTrustee && seat?.IsAiControl === true)) return false;
      const player = seat?.PlayerInfo?.ClientId;
      if (Number.isInteger(game?.SelfSeatIndex) && player != null) {
        return game.SelfSeatIndex === selfSeat && String(player) === String(account);
      }
      const self = room.GetTableSeatInfoByUserId(account);
      return String(self?.ClientId) === String(account) && Number(self?.SeatID) === selfSeat && !self.IsViewer;
    }) === true;
  }

  function canUseTableActions() {
    return !ended && !surrendering && sameTable() && ownSeatStillMatches(true);
  }

  const isLandlord = () => landlord === selfSeat;
  const canSurrender = () => isLandlord() && canUseTableActions();

  function surrender() {
    if (!canSurrender()) return false;
    const request = surrendering = {};
    emit('surrender', { waiting: true, message: '正在等待投降确认' });
    if (!send(PROTOCOL.surrender, { type: 0 })) {
      surrendering = null;
      emit('surrender', { message: '投降请求未能发送' });
      return false;
    }
    scope.timeout(() => {
      if (surrendering !== request || request.accepted) return;
      surrendering = null;
      if (sameTable() && !ended) emit('surrender', { message: '投降未获确认' });
    }, SURRENDER_TIMEOUT);
    return true;
  }

  function updateTrustees(data) {
    for (const row of values(data?.state_list, 8)) {
      if (!row) continue;
      const seat = seatId(row.seat);
      if (seat === null || !match.seats?.some(player => player.id === seat)) continue;
      const enabled = row?.is_trust === true || row?.is_trust === 1;
      const changed = (playerTrustees.get(seat) ?? false) !== enabled;
      playerTrustees.set(seat, enabled);
      if (seat === selfSeat) {
        trustee = enabled;
        if (pendingTrustee?.desired === enabled) pendingTrustee = null;
      }
      if (changed || seat === selfSeat) emit('trustee', { seat, enabled, changed, pending: pendingTrustee !== null });
    }
  }

  function clearPrompt() {
    prompt = null;
    countdown = null;
    pending = null;
    hint = null;
    skillActions.clearPrompt();
  }

  function emit(type, event) {
    read(() => consume(type, event));
  }

  function receive(id, handler) {
    const isResult = id === PROTOCOL.settlement || id === PROTOCOL.settlementPb;
    const surrenderReply = id === PROTOCOL.surrenderReply || id === PROTOCOL.surrenderLegacyReply;
    const callback = event => {
      const protocol = event?.Protocol;
      if (protocol?.Id !== id) return;
      if (!sameTable() && !((isResult || surrenderReply && surrendering)
        && room.TableId === 0 && sameConnection() && acceptsLateResult?.())) return;
      const data = protocol.Data?.ProtoObj ?? protocol.ProtoObj;
      if (isResult || surrenderReply || id === PROTOCOL.over || id === PROTOCOL.skin || (data && typeof data === 'object')) {
        read(() => handler(data, protocol));
      }
    };
    proxy.AddEventListener(id, owner, callback);
    scope.add(() => proxy.RemoveEventListener(id, owner, callback));
  }

  function receiveWithSkill(id, handler) {
    receive(id, (data, protocol) => {
      if (handler?.(data, protocol) !== false) skillActions.accept(id, protocol);
    });
  }

  function offer(kind, data, details = {}) {
    const seat = seatId(data.opt_seat);
    const index = optionIndex(data.opt_index);
    const seconds = Math.max(0, integer(data.opt_time));
    const backupSeconds = Math.max(0, integer(data.backup_time));
    const key = optionKey(index);
    if (kind === 'general' && replacedGeneralOptions.has(key)) return null;
    if (kind === 'general' && data.is_replace === true) {
      if (seat !== selfSeat || prompt?.kind !== kind || now() >= prompt.expiresAt) return null;
      if (key && key !== prompt.key) {
        replacedGeneralOptions.add(prompt.key);
        prompt.key = key;
        prompt.index = index;
        lastOptions.set(kind, key);
      }
      Object.assign(prompt, details);
      if (pending?.request === PROTOCOL.selectGeneral && !prompt.candidates.includes(pending.general)) pending = null;
      return { seat, seconds, backupSeconds, actionable: true, optionKey: prompt.key, replacement: true,
        awaitingConfirmation: pending?.request === PROTOCOL.selectGeneral };
    }
    if (key && lastOptions.get(kind) === key) return null;
    if (key) lastOptions.set(kind, key);
    clearPrompt();
    if (!ended && seat !== null && (seat !== selfSeat || index) && seconds + backupSeconds > 0) {
      const timeout = (seconds + backupSeconds) * 1000;
      const startsAt = now();
      countdown = { kind, seat, startsAt, regularUntil: startsAt + seconds * 1000, expiresAt: startsAt + timeout };
      if (seat !== selfSeat) return { seat, seconds, backupSeconds, actionable: false, optionKey: key };
      const offered = prompt = { kind, index, key, expiresAt: countdown.expiresAt, ...details };
      scope.timeout(() => {
        if (prompt !== offered) return;
        if (sameTable()) emit('prompt-expired', { optionKey: offered.key });
        clearPrompt();
      }, timeout);
    }
    return { seat, seconds, backupSeconds, actionable: Boolean(prompt), optionKey: key };
  }

  function acknowledge(request, data, protocol) {
    if (!pending || pending.request !== request) return false;
    const { action } = pending;
    const key = optionKey(data.req_msg?.opt_index);
    if (key && optionKey(pending.index) !== key) return false;
    if (action === 'general' && Array.isArray(data.req_msg?.general_ids)
        && !data.req_msg.general_ids.includes(pending.general)) return false;
    if (pending.spell != null && data.req_msg?.spell_id != null && data.req_msg.spell_id !== pending.spell) return false;
    const acknowledgedKey = optionKey(pending.index);
    const code = integer(data.result_id) || integer(protocol.errCode);
    if (code && pending.spell === GUAN_XING) observedTarget = null;
    const keepPlay = pending.kind === 'play' && (action === 'skill' || action === 'skill-choice');
    pending = null;
    if (!code && !keepPlay) {
      if (action === 'skill-choice') clearPrompt();
      else prompt = countdown = null;
    }
    emit('ack', { action, optionKey: acknowledgedKey, accepted: code === 0, code,
      message: typeof data.error_msg === 'string' ? data.error_msg : '' });
    return true;
  }

  function canDispatch(kind) {
    return !ended && !surrendering && !trustee && !pendingTrustee && sameTable() && ownSeatStillMatches()
      && !pending && prompt?.kind === kind && now() < prompt.expiresAt;
  }

  function send(id, message) {
    try {
      proxy.M(id, message);
      return true;
    } catch { return false; }
  }

  const hasCompleteHand = () => hand.size > 0 && hand.size === expectedHandCount;
  function handKey() {
    const cards = [...hand.values()].sort((a, b) => a.id - b.id);
    return JSON.stringify(cards.map(({ id, dynamicNumber, dynamicSuit, wild, wildSkill }) =>
      [id, dynamicNumber, dynamicSuit, wild, wildSkill]));
  }
  function showNextHint(current, waited = false) {
    const choice = current.choices[current.next];
    if (choice) current.next = (current.next + 1) % current.choices.length;
    emit('hint', { optionKey: current.key, choice, waited });
  }

  function requestHint() {
    if (!canDispatch('play') || !hasCompleteHand()) return false;
    const { key, index } = prompt;
    const cards = handKey();
    if (hint?.key === key && hint.cards === cards) {
      if (hint.choices) showNextHint(hint);
      return true;
    }
    const request = { key, cards, next: 0 };
    hint = request;
    emit('hint-pending', { optionKey: key });
    const timeout = () => {
      if (hint !== request || request.choices) return;
      hint = null;
      if (sameTable() && prompt?.key === key) emit('hint', { optionKey: key, waited: true });
    };
    if (!send(PROTOCOL.hint, { opt_index: index })) timeout();
    else scope.timeout(timeout, HINT_TIMEOUT);
    return true;
  }

  function dispatch(action, kind, id, payload, observedSeat = null) {
    if (!canDispatch(kind)) return false;
    const message = payload(prompt);
    if (!message) return false;
    pending = { action, kind, request: id, index: prompt.index, ...(action === 'general' && { general: message.general_ids[0] }),
      ...(id === PROTOCOL.skillUse && { spell: message.spell_id }) };
    if (observedSeat !== null) observedTarget = observedSeat;
    if (send(id, message)) return true;
    if (observedSeat !== null) observedTarget = null;
    pending = null;
    return false;
  }

  function sendSkill(id, body, action) {
    if (!body || typeof body !== 'object') return false;
    if (id === PROTOCOL.skillUse && cardId(body.spell_id)) {
      if (action === 'skill') return dispatch(action, 'play', id, ({ index }) => ({ ...body, opt_index: index }));
      if (action === 'skill-choice' && (prompt?.kind === 'play' || prompt?.kind === 'skill')) {
        const target = body.spell_id === GUAN_XING ? observationTarget(body.targets) : null;
        return dispatch(action, prompt.kind, id, ({ index }) => ({ ...body, opt_index: index }), target);
      }
    }
    if (action === 'skill-choice' && (id === PROTOCOL.skillChoice || id === PROTOCOL.pass)) {
      return dispatch(action, 'skill', id, ({ index }) => ({ ...body, opt_index: index }));
    }
    return false;
  }

  function observationTarget(targets) {
    return targets?.length === 1 && targets[0] !== selfSeat && match.seats?.some(seat => seat.id === targets[0])
      ? targets[0] : null;
  }

  receive(PROTOCOL.start, data => {
    if (ended) return;
    hand.clear();
    visiblePlayed.clear();
    discarded.clear();
    expectedHandCount = 0;
    phase = null;
    landlord = null;
    observedTarget = null;
    trustee = false;
    pendingTrustee = null;
    surrendering = null;
    playerTrustees.clear();
    lastOptions.clear();
    replacedGeneralOptions.clear();
    clearPrompt();
    skillActions.reset();
    emit('start', { baseScore: integer(data.base_score, null), multiplier: rate(data.base_multiplier) });
  });
  receive(PROTOCOL.multiplier, data => {
    if (ended) return;
    emit('multiplier', { score: integer(data.base_score, null), rate: rate(pokerMultiplier(integer(data.current_multiplier))),
      reason: integer(data.change_reason) });
  });
  receive(PROTOCOL.rate, data => {
    if (!ended && rate(data.rate) !== null) emit('base-rate', { rate: data.rate });
  });
  receive(PROTOCOL.hintReply, data => {
    if (!canDispatch('play') || optionKey(data.opt_index) !== prompt.key
        || data.table_id && data.table_id !== tableId || data.uid && String(data.uid) !== String(account)
        || data.seat_id != null && data.seat_id !== selfSeat) return;
    const { key } = prompt;
    const cards = handKey();
    const waiting = hint?.key === key && !hint.choices;
    if (waiting && (!hasCompleteHand() || hint.cards !== cards)) {
      hint = null;
      emit('hint', { optionKey: key, waited: true });
      return;
    }
    if (!hasCompleteHand() || hint?.key === key && hint.cards === cards && hint.choices) return;
    const choices = data.success === true ? values(data.reqs, 128).flatMap(request => {
      const picked = values(request?.putCards);
      const ids = picked.map(card => card?.card_id);
      if (!ids.length || new Set(ids).size !== ids.length || !ids.every(id => hand.has(id))) return [];
      return [{ ids, wildRanks: new Map(picked.filter(card => card.wild_num >= 3 && card.wild_num <= 15)
        .map(card => [card.card_id, card.wild_num])) }];
    }) : [];
    // The server usually sends this with the turn, before the user asks.
    hint = { key, cards, choices, next: 0 };
    if (waiting) showNextHint(hint, true);
  });
  receive(PROTOCOL.skin, (_data, protocol) => {
    if (ended || !Array.isArray(protocol.GeneralSkinList)) return;
    // The native game update can address a seat directly, or a player by account.
    const player = match.seats?.find(({ id, clientId }) => protocol.Type === 5
      ? protocol.ClientID === id : protocol.ClientID === clientId);
    if (!player) return;
    for (const skin of values(protocol.GeneralSkinList, 8)) {
      if (!cardId(skin?.GeneralID) || !Number.isSafeInteger(skin.SkinID) || skin.SkinID < 0) continue;
      emit('skin', { seat: player.id, general: skin.GeneralID, skin: skin.SkinID, skinDynamic: skin.IsDynamic === true,
        skinType: Math.max(1, integer(skin.SkinType)) });
    }
  });
  receiveWithSkill(PROTOCOL.turn, data => {
    if (ended) return false;
    const predecessorCards = cardsFrom(data.predecessor_cards);
    const canPass = predecessorCards.length > 0;
    const turn = offer('play', data, { canPass });
    if (!turn) return false;
    observedTarget = null;
    if (!canPass) visiblePlayed.clear();
    const predecessorSeat = seatId(data.predecessor_seat_id);
    let challenge = null;
    if (turn.actionable && canPass && predecessorSeat !== null) {
      const previous = visiblePlayed.get(predecessorSeat);
      const matches = previous?.signature === playSignature(predecessorCards);
      if (!matches || !previous.complete) {
        // Compare with cards already disclosed to this perspective. A new prompt
        // can identify a predecessor after its cards leave the table or while it is concealed.
        challenge = { seat: predecessorSeat, count: predecessorCards.length, cards: matches ? previous.publicCards : [],
          cardType: integer(data.predecessor_typ) };
      }
    }
    emit('turn', { ...turn, canPass, challenge });
  });
  receive(PROTOCOL.phase, data => {
    const next = integer(data.phase);
    const seat = seatId(data.cur_seat_id);
    const valid = (countdown?.kind === 'general' && next === GENERAL_PHASE) || (countdown?.kind === 'bid' && next === BID_PHASE)
      || (countdown?.kind === 'play' && next === PLAY_PHASE && seat === countdown.seat)
      || (countdown?.kind === 'skill' && (phase === null || phase === next));
    phase = next;
    if (!valid) clearPrompt();
    emit('phase', { seat, phase });
  });
  receiveWithSkill(PROTOCOL.move, data => {
    const from = location(data.from_zone_info);
    const to = location(data.to_zone_info);
    const fromSelf = from?.seat === selfSeat && from.zone === HAND;
    const toSelf = to?.seat === selfSeat && to.zone === HAND;
    const opponentHand = [from, to].some(place => place?.zone === HAND && place.seat !== selfSeat);
    const cards = cardsFrom(data.card_ids);
    const count = publicCount(data, cards);
    const known = cards.filter(card => cardId(card.id) && !card.virtual);
    const realCount = to?.zone === PLAYED ? Math.max(0, count - cards.filter(card => card.virtual).length) : count;
    let removedPlayedIds;
    if (from?.zone === PLAYED) {
      // Disclose only cards already visible in this perspective, even if the
      // move packet includes private cards entering an opposing hand.
      const played = visiblePlayed.get(from.seat);
      const visible = played?.remainingIds;
      removedPlayedIds = [...new Set(cards.map(card => card.id).filter(id => visible?.has(id)))];
      for (const id of removedPlayedIds) visible.delete(id);
      if (removedPlayedIds.length < count) visible?.clear();
      if (played && count > 0) played.complete = false;
    }
    if (fromSelf) {
      if (known.length === realCount) {
        for (const card of known) hand.delete(card.id);
      } else hand.clear();
      if (expectedHandCount !== null) expectedHandCount = Math.max(0, expectedHandCount - realCount);
    }
    if (toSelf) {
      for (const card of known) hand.set(card.id, card);
      if (expectedHandCount !== null) expectedHandCount += count;
    }
    // Moves onto the public discard pile can carry faces. Between hands the
    // transport still withholds every identity that involves neither own hand.
    const publicDiscard = from?.zone === HAND && to?.zone === DISCARD && data.move_type === MOVE_DISCARD;
    const publicBottom = from?.zone === BOTTOM && landlord !== null;
    const sweep = from?.zone === PLAYED && to?.zone === DISCARD;
    const shown = sweep ? cards.filter(card => removedPlayedIds.includes(card.id))
      : !opponentHand || fromSelf || toSelf || publicDiscard || publicBottom ? cards
      : from?.zone === DISCARD ? cards.filter(card => discarded.has(card.id)) : [];
    if (from?.zone === DISCARD) {
      if (known.length < count) discarded.clear();
      else for (const card of known) discarded.delete(card.id);
    }
    if (to?.zone === DISCARD) {
      for (const card of shown.filter(card => cardId(card.id) && !card.virtual)) {
        if (discarded.size >= 108) discarded.delete(discarded.values().next().value);
        discarded.add(card.id);
      }
    }
    const fromVisible = from?.zone === HAND ? visibleHandCards(data.from_visible_hand_cards) : [];
    const toVisible = to?.zone === HAND ? visibleHandCards(data.to_visible_hand_cards) : [];
    const removedVisibleIds = new Set(fromVisible.map(card => card.id));
    let confirmedDepartures = false;
    if (knowsHandCard && from?.zone === HAND && (to?.zone !== HAND || from.seat !== to.seat)) {
      // Private move faces may retire an already-known card. Never disclose
      // a new face, or its destination, merely because it is in this packet.
      for (const card of known) if (knowsHandCard(from.seat, card.id)) removedVisibleIds.add(card.id);
      confirmedDepartures = new Set(known.map(card => card.id)).size === realCount;
    }
    emit('move', { from, to, count, cards: shown, realCount, skill: integer(data.spell_id),
      ...(removedPlayedIds && { removedPlayedIds }),
      ...(removedVisibleIds.size && { removedVisibleIds: [...removedVisibleIds] }),
      ...(confirmedDepartures && { confirmedDepartures }),
      ...(toVisible.length && { toVisible }) });
  });
  function projectPile(data, snapshot = false) {
    const place = location(data.from_zone_info);
    if (place?.seat === null || place?.zone !== OUTSIDE || data.is_all !== true) return;
    const faces = cardsFrom(data.card_ids);
    const cards = snapshot && place.seat !== selfSeat ? faces.map(card => ({ id: 0, areaSkill: card.areaSkill })) : faces;
    emit('skill-pile', { seat: place.seat, skill: integer(data.spell_id), cards, count: publicCount(data, cards) });
  }

  function exposedBottom(data) {
    if (landlord === null) return [];
    return cardsFrom(data?.card_ids).filter(card => cardId(card.id) && !card.virtual).slice(0, 3);
  }

  receiveWithSkill(PROTOCOL.zone, data => {
    const place = location(data.from_zone_info);
    if (place?.zone === BOTTOM) {
      const cards = exposedBottom(data);
      if (cards.length) emit('bottom', { cards });
      return;
    }
    if (place?.zone === OUTSIDE) projectPile(data);
    if (place?.zone !== HAND || place.seat === null) return;
    const visible = visibleHandCards(data.visible_hand_cards);
    const count = publicCount(data, values(data.card_ids));
    if (visible.length || data.is_all === true && (!count || Array.isArray(data.visible_hand_cards))) {
      emit('visible-hand', { seat: place.seat, cards: visible, full: data.is_all === true, skill: integer(data.spell_id) });
    }
    if (place.seat !== selfSeat) return;
    const cards = cardsFrom(data.card_ids).filter(card => card.id && !card.virtual);
    if (data.is_all === true) {
      hand = new Map(cards.map(card => [card.id, card]));
      expectedHandCount = publicCount(data, cards);
    } else if (data.spell_id) {
      for (const card of cards) if (hand.has(card.id)) hand.set(card.id, card);
    } else return;
    emit('hand', { cards: [...hand.values()], count: expectedHandCount,
      ...(data.is_all === true && { complete: cards.length === hand.size && hand.size === expectedHandCount }) });
  });
  receive(PROTOCOL.played, data => {
    const seat = seatId(data.seat_id);
    if (seat === null) return;
    clearPrompt();
    const cards = cardsFrom(data.cards);
    const hidden = data.hide_put === true;
    const shown = hidden && seat !== selfSeat ? [] : cards;
    const count = publicCount(data, cards);
    const complete = shown.length > 0 && shown.length === count && shown.every(card => cardId(card.id) || card.virtual);
    visiblePlayed.set(seat, { publicCards: hidden ? [] : shown, complete, signature: complete ? playSignature(shown) : null,
      remainingIds: new Set(shown.map(card => card.id).filter(cardId)) });
    emit('played', { seat, cards: shown, count,
      cardType: integer(data.put_typ), score: integer(data.put_score), hidden });
  });
  receive(PROTOCOL.playReply, (data, protocol) => acknowledge(PROTOCOL.play, data, protocol));
  receiveWithSkill(PROTOCOL.passReply, (data, protocol) => acknowledge(PROTOCOL.pass, data, protocol));

  receive(PROTOCOL.generalOptions, data => {
    if (ended || seatId(data.opt_seat) !== selfSeat) return;
    const ids = values(data.general_ids, 32);
    const details = new Map(values(data.generals, 32).map(general => [general?.id, general]));
    const candidates = [...new Set((ids.length ? ids : [...details.keys()]).filter(cardId))];
    if (!candidates.length) return;
    const replaceable = new Set(candidates.filter(id => !(details.get(id)?.replaceTimes >= 1)));
    const offered = offer('general', data, { candidates, replaceable });
    if (offered) emit('general-options', { ...offered,
      candidates: candidates.map(id => {
        const skills = details.get(id)?.skills;
        return { id, ...(!replaceable.has(id) && { canSwap: false }),
          ...(Array.isArray(skills) && { skills: values(skills, 32).filter(cardId) }) };
      }) });
  });
  receive(PROTOCOL.generalReply, (data, protocol) => acknowledge(PROTOCOL.selectGeneral, data, protocol));
  function projectGenerals(data, snapshot = false) {
    for (const row of values(data?.notify_generals, 8)) {
      const seat = seatId(row?.seat_id);
      const general = row?.generals?.[0];
      if (seat === null || !cardId(general?.id)) continue;
      if (seat === selfSeat && prompt?.kind === 'general') clearPrompt();
      const hasSkin = Object.hasOwn(general, 'skin') && Number.isSafeInteger(general.skin) && general.skin >= 0;
      emit('general', { seat, general: general.id, ...(hasSkin && {
        skin: general.skin, skinDynamic: general.skin_dynamic === 1 || general.skin_dynamic === true,
      }), skills: values(general.skills, 32).filter(cardId),
        ...(snapshot && { snapshot: true }) });
    }
  }
  receiveWithSkill(PROTOCOL.generalResult, data => projectGenerals(data));
  receive(PROTOCOL.bidTurn, data => {
    if (ended) return;
    const offered = offer('bid', data);
    if (offered) emit('bid-turn', { ...offered, grab: integer(data.grab_times) > 0 });
  });
  receive(PROTOCOL.bidReply, (data, protocol) => acknowledge(PROTOCOL.bid, data, protocol));
  receive(PROTOCOL.bidResult, data => {
    const seat = seatId(data.seat_id);
    if (seat === null) return;
    if (countdown?.kind === 'bid' && countdown.seat === seat) clearPrompt();
    emit('bid', { seat, bid: integer(data.grab) > 0, grabTimes: integer(data.grab_times) });
  });
  receive(PROTOCOL.roles, data => {
    const seat = landlordSeat(data);
    if (seat !== null) {
      landlord = seat;
      if (countdown?.kind === 'bid') clearPrompt();
      emit('landlord', { seat });
    }
  });
  receiveWithSkill(PROTOCOL.skillPrompt, data => {
    if (ended) return false;
    if (data.opt_type === 6 && values(data.data_cards).length) {
      const key = optionKey(data.opt_index);
      if (key && lastOptions.get('skill') === key) return false;
      if (key) lastOptions.set('skill', key);
      lastOptions.delete('play');
      clearPrompt();
      emit('action-closed', {});
      const seat = seatId(data.opt_seat);
      if (data.spell_id !== TU_XI || seat === null) return false;
      // The native show-card notice draws these faces on the table for all recipients.
      const cards = cardsFrom(data.data_cards).map((card, index) =>
        cardId(card.id) ? card : { id: -index - 1, hidden: true });
      const reveal = { seat, cards };
      emit('reveal', reveal);
      scope.timeout(() => { if (sameTable()) emit('reveal-ended', reveal); }, REVEAL_MS);
      return false;
    }
    const includesSelf = values(data.opt_seat_list, 8).includes(selfSeat);
    const offered = offer('skill', includesSelf ? { ...data, opt_seat: selfSeat } : data);
    if (!offered) return false;
    lastOptions.delete('play');
    emit('action-closed', {});
  });
  receiveWithSkill(PROTOCOL.skillUseReply, (data, protocol) => acknowledge(PROTOCOL.skillUse, data, protocol));
  receiveWithSkill(PROTOCOL.skillUsed, data => {
    const seat = seatId(data.seat);
    // is_use is absent on many confirmed triggered and locked skills. The
    // native client plays the voice from the activation broadcast itself.
    if (!ended && seat !== null && match.seats?.some(player => player.id === seat) && cardId(data.spell_id)) {
      const targets = values(data.targets, 8).filter(id => Number.isInteger(id) && seatId(id) !== null);
      if (seat === selfSeat && data.spell_id === GUAN_XING && data.is_use !== false) {
        observedTarget = observationTarget(targets) ?? observedTarget;
      }
      emit('skill-used', { seat, skill: data.spell_id, effect: integer(data.spell_effect), targets });
    }
    if (pending?.request === PROTOCOL.skillUse && pending.spell === data.spell_id
        && seatId(data.seat) === selfSeat && data.is_use === true) {
      acknowledge(PROTOCOL.skillUse, {}, {});
    }
  });
  receiveWithSkill(PROTOCOL.skillChoiceReply, (data, protocol) => acknowledge(PROTOCOL.skillChoice, data, protocol));
  receiveWithSkill(PROTOCOL.skillData);
  receiveWithSkill(PROTOCOL.roleUpdate);
  receive(PROTOCOL.playerState, updateTrustees);

  receiveWithSkill(PROTOCOL.snapshot, data => {
    const base = data.base_data;
    if (base?.table_id !== tableId || base.model_id !== 175 || base.sec_id !== 2 || ended) return false;
    clearPrompt();
    observedTarget = null;
    lastOptions.clear();
    replacedGeneralOptions.clear();
    visiblePlayed.clear();
    discarded.clear();
    phase = integer(base.phase);
    landlord = landlordSeat(data.role_data);
    let own = null;
    let bottom = [];
    const tableCards = [];
    const visibleHands = [];
    const counts = {};
    for (const row of values(data.zone_data, 128)) {
      const place = location(row.from_zone_info);
      if (!place || row.is_all !== true) continue;
      if (place.zone === BOTTOM) bottom = exposedBottom(row);
      if (place.zone === PLAYED) {
        // The native reconnect handler draws these stack entries directly.
        const cards = cardsFrom(row.card_ids);
        const count = publicCount(row, cards);
        if (count > 0) {
          const shown = cards.filter(card => cardId(card.id));
          tableCards.push({ seat: place.seat, cards: shown, count, combination: integer(row.put_typ) });
          visiblePlayed.set(place.seat, { remainingIds: new Set(shown.map(card => card.id)) });
        }
      }
      if (place.zone === DISCARD) {
        for (const card of cardsFrom(row.card_ids)) if (cardId(card.id) && !card.virtual) discarded.add(card.id);
      }
      if (place.zone === HAND && place.seat !== null) {
        counts[place.seat] = publicCount(row, values(row.card_ids));
        if (place.seat === selfSeat) own = cardsFrom(row.card_ids).filter(card => card.id && !card.virtual);
        const cards = visibleHandCards(row.visible_hand_cards);
        if (cards.length) visibleHands.push({ seat: place.seat, cards, skill: integer(row.spell_id) });
      }
    }
    hand = new Map((own ?? []).map(card => [card.id, card]));
    expectedHandCount = counts[selfSeat] ?? null;
    emit('sync', { seat: seatId(base.cur_player_seat), phase, hand: own, counts,
      landlord, ...(rate(data.game_data?.rate) !== null && { rate: data.game_data.rate }),
      ...(bottom.length && { bottom }), ...(tableCards.length && { tableCards }),
      ...(discarded.size && { discarded: [...discarded] }), ...(visibleHands.length && { visibleHands }) });
    projectGenerals(data.general_data, true);
    for (const row of values(data.zone_data, 128)) projectPile(row, true);
    updateTrustees(data.player_state);
  });
  receive(PROTOCOL.over, () => {
    if (ended) return;
    ended = true;
    clearPrompt();
    skillActions.reset();
    emit('end', {});
  });
  function surrenderReply(data, protocol) {
    if (!surrendering || surrendering.accepted || (protocol.SeatId ?? data?.seatId ?? 0) !== selfSeat) return;
    const result = protocol.Result ?? data?.result ?? protocol.errCode ?? (data ? 0 : null);
    if (!Number.isSafeInteger(result)) return;
    if (result === 0) {
      surrendering.accepted = true;
      clearPrompt();
      emit('surrender', { accepted: true, waiting: true, message: '已投降，等待结算' });
      return;
    }
    surrendering = null;
    emit('surrender', { message: result === 3 ? '当前未到可投降时间' : '服务器未接受投降' });
  }
  receive(PROTOCOL.surrenderReply, surrenderReply);
  receive(PROTOCOL.surrenderLegacyReply, surrenderReply);
  function settle(data, protocol) {
    // Classic can dispatch the protobuf as either raw data or the native
    // MsgGameOver conversion. Both represent the authoritative result.
    const model = protocol.GameModel ?? data?.gamemodel;
    const mode = protocol.ModeType ?? data?.label_model;
    const section = protocol.GoupID ?? data?.section;
    const table = protocol.TableID ?? data?.table_id;
    if (model !== 47 || mode && mode !== 175 || section && section !== 2 || table && Number(table) !== tableId) return;
    const legacy = !Array.isArray(data?.game_results);
    const own = values(legacy ? protocol.Players : data?.game_results, 8).find(row =>
      row && seatId(legacy ? row.SeatID : row.seat_id) === selfSeat);
    if (!own) return;
    const result = integer(legacy ? own.Result : own.result ?? 0, null);
    if (result === null) return;
    const beans = integer(legacy ? own.Param1 : own.param1, null);
    ended = true;
    surrendering = null;
    clearPrompt();
    skillActions.reset();
    const player = { seat: selfSeat, result, beans, role: integer(legacy ? own.Figure : own.figure, null) };
    const raw = legacy ? null : { ...data, playercnt: 1, game_results: [own] };
    emit('end', { settled: true, player, settlement: { raw, protocol, beans } });
  }
  receive(PROTOCOL.settlement, settle);
  receive(PROTOCOL.settlementPb, settle);

  return {
    canUseTableActions,
    isLandlord,
    canSurrender,
    surrender,
    requestHint,
    toggleTrustee() {
      if (!canUseTableActions() || pendingTrustee || pending) return false;
      const request = { desired: !trustee };
      pendingTrustee = request;
      if (!send(PROTOCOL.trust, { open_trust: request.desired })) {
        if (pendingTrustee === request) pendingTrustee = null;
        return false;
      }
      if (pendingTrustee === request) emit('trustee', { seat: selfSeat, enabled: trustee, pending: true });
      scope.timeout(() => {
        if (pendingTrustee !== request) return;
        pendingTrustee = null;
        if (sameTable()) emit('trustee', { seat: selfSeat, enabled: trustee, pending: false });
      }, TRUSTEE_TIMEOUT);
      return true;
    },
    countdown() {
      return countdown && now() < countdown.expiresAt && sameTable() ? countdown : null;
    },
    play(ids, wildRanks = new Map()) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CARDS || ids.length !== new Set(ids).size) return false;
      return dispatch('play', 'play', PROTOCOL.play, ({ index }) => {
        if (expectedHandCount !== null && hand.size !== expectedHandCount) return null;
        const selected = ids.map(id => hand.get(id));
        if (selected.some(card => !card) || !(wildRanks instanceof Map)) return null;
        const wildCards = selected.filter(card => card.wildSkill || card.wild);
        if ([...wildRanks.keys()].some(id => !wildCards.some(card => card.id === id))) return null;
        const allWild = wildCards.length === selected.length;
        const assignments = new Map();
        for (const card of wildCards) {
          const rank = wildRanks.get(card.id);
          if (allWild && (rank === undefined || rank === card.baseRank || rank === card.number)) continue;
          if (allWild || !Number.isInteger(rank) || rank < 3 || rank > 15) return null;
          assignments.set(card.id, rank);
        }
        return { opt_index: index, putCards: selected.map(card => putCard(card, assignments.get(card.id))) };
      });
    },
    pass() {
      return dispatch('pass', 'play', PROTOCOL.pass, ({ index, canPass }) => canPass ? { opt_index: index } : null);
    },
    canSwapGeneral: id => canDispatch('general') && prompt.replaceable.has(id),
    preselectGeneral(id) {
      return canDispatch('general') && prompt.candidates.includes(id) && send(PROTOCOL.preselectGeneral, { general_ids: [id] });
    },
    selectGeneral(id) {
      return dispatch('general', 'general', PROTOCOL.selectGeneral, ({ candidates }) => candidates.includes(id) ? { general_ids: [id] } : null);
    },
    bid(value) {
      if (typeof value !== 'boolean') return false;
      return dispatch('bid', 'bid', PROTOCOL.bid, ({ index }) => ({ opt_index: index, grab: value ? 1 : 0 }));
    },
    activateSkill: id => skillActions.activateSkill(id),
    submitSkillChoice: choice => skillActions.submitSkillChoice(choice),
  };
}
