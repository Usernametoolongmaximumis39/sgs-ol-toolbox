import { cardFace, comparePokerHandCards, isWildCard } from '../replay/model.js';
import { originalRank, POKER_ZONE, RANKS, trackRemainingCards } from '../replay/remaining.js';
import { groupSkillCards, recoverSkillCards, stashSkillCards } from '../replay/skill-piles.js';
import { bidLabels } from '../replay/native-decisions.js';

function displayCard(card) {
  return cardFace(card.id, card.dynamicSuit || card.suit, card.dynamicNumber || card.number || card.rank,
    card.wild, card.wildSkill, card.virtual);
}

const isCard = card => Number.isSafeInteger(card?.id) && card.id > 0;
const handZone = position => position?.zone === POKER_ZONE.HAND;
const WILD_OPTIONS = RANKS.filter(([rank]) => rank <= 15).map(([id, label]) => ({ id, label }));
const PLAY_PHASE = 202;
const BID_PHASE = 103;
const HISTORY_LIMIT = 512;
export const LUAN_CHAO = 49;
const { DECK, HAND, BOTTOM, OUTSIDE, PLAYED, DISCARD } = POKER_ZONE;
export const GENERAL_SELECTION_PHASE_LABEL = '选将阶段';
const OPENING_LABELS = { 101: GENERAL_SELECTION_PHASE_LABEL, 102: '发牌阶段', 103: '叫地主阶段' };

export function createPokerTableState({ selfSeat, seats }, names = {}) {
  const players = new Map(seats.map(({ id, name }) => [id, {
    id, name, count: null, visibleHand: [], skillIds: [], skillUses: {}, skillStates: [], skillPiles: [],
  }]));
  const hand = new Map();
  const played = new Map();
  const selected = new Set();
  const choiceCards = new Set();
  const choiceOptions = new Set();
  const wildRanks = new Map();
  const skills = new Map();
  const openingSkins = new Map();
  let turn, pending, notice, landlord, activeSeat = null, completeHand = false, ended = false, unavailable = false;
  let settled = false, leaving = false, leaveError = false;
  let decision;
  let reveal = null;
  let phase = null, bidding = null, history = [], trustee = false, trusteePending = false, surrenderNotice;
  let remaining = trackRemainingCards(), bottom = [], score = null, baseRate = null, multiplier = null;
  let leadingSeat = null;
  let hintPending = false;
  const available = () => !ended && !leaving && !unavailable && !pending && !trustee && !trusteePending && !surrenderNotice;
  const ours = () => available() && !decision && turn?.seat === selfSeat && turn.actionable === true;
  const canPass = () => ours() && turn.canPass === true;
  const canPlay = () => ours() && completeHand && selected.size > 0
    && [...selected].every(id => hand.has(id));
  const generalName = id => names.general?.(id) || `武将 ${id}`;
  const skillName = id => names.skill?.(id) || `技能 ${id}`;

  function append(action) {
    if (history.length >= HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT / 2);
    history.push(action);
  }

  function clearPlayed() {
    played.clear();
    leadingSeat = null;
  }

  function recordBottom(cards) {
    const disclosed = new Map(bottom.map(card => [card.id, card]));
    for (const card of cards) {
      if (disclosed.size === 3) break;
      if (isCard(card) && !card.virtual && !disclosed.has(card.id)) disclosed.set(card.id, displayCard(card));
    }
    if (disclosed.size > bottom.length) bottom = [...disclosed.values()];
  }

  function resetTurn() {
    turn = null;
    hintPending = false;
    if (pending?.kind === 'play' || pending?.kind === 'pass' || pending?.kind === 'skill') pending = null;
    selected.clear();
    wildRanks.clear();
    if (decision?.kind === 'wild') setDecision(null);
  }

  function setDecision(value) {
    if (value && value.kind === decision?.kind && value.optionKey != null && value.optionKey === decision.optionKey) return;
    if (decision && pending?.kind === decision.kind) pending = null;
    decision = value;
    choiceCards.clear();
    choiceOptions.clear();
  }

  function readyPlay() {
    const cards = [...selected].map(id => hand.get(id));
    if (!cards.length || !completeHand || cards.some(card => !card) || !turn?.actionable) return null;
    const wild = cards.filter(isWildCard);
    const unresolved = wild.length < cards.length && wild.find(card => !wildRanks.has(card.id));
    if (unresolved) {
      setDecision({ kind: 'wild', title: `选择${unresolved.symbol}${unresolved.face}的点数`, options: WILD_OPTIONS,
        cardId: unresolved.id, canCancel: true });
      return null;
    }
    setDecision(null);
    pending = { kind: 'play', optionKey: turn.optionKey, ids: [...selected], wildRanks: new Map(wildRanks) };
    return pending;
  }

  function skillDecision(data) {
    const targetChoices = Array.isArray(data.targets) && data.targets.length > 0;
    const options = targetChoices ? data.targets.map(value => {
      const id = value?.id ?? value?.seat ?? value;
      return { id, label: players.get(id)?.name };
    }).filter(row => row.label) : (data.choices || []).map(value => {
      const id = value?.id ?? value;
      return { id, label: value?.label || `选项 ${id}`, ...(value?.enabled === false && { enabled: false }) };
    });
    const cards = (data.cards || []).filter(isCard).map(card => {
      const face = card.hidden ? { id: card.id, hidden: true } : displayCard(card);
      return { ...face, ...(card.choiceGroup && { choiceGroup: card.choiceGroup }), ...(card.disabled && { disabled: true }) };
    });
    const min = Number.isSafeInteger(data.min) ? data.min : 1;
    const max = Number.isSafeInteger(data.max) ? data.max : Math.max(min, 1);
    const targetMin = data.targetMin ?? (cards.length ? 0 : min);
    const targetMax = data.targetMax ?? (cards.length ? Math.max(1, targetMin) : max);
    const name = data.title || data.name || skillName(data.skill);
    const cardPrompt = min === max ? `请选择 ${min} 张手牌` : `请选择 ${min} 至 ${max} 张手牌`;
    const prompt = data.prompt || (data.fromHand ? `${cardPrompt}${targetChoices ? '和目标' : ''}`
      : targetChoices && (cards.length ? '请选择牌和目标' : '请选择目标'));
    const title = data.askToTrigger ? `是否发动【${name}】？` : prompt ? `${name} · ${prompt}` : name;
    return { ...data, title, kind: 'skill-choice', mode: data.kind, options,
      targetChoices, cards, min, max, targetMin, targetMax };
  }

  function canConfirmChoice() {
    if (!available()) return false;
    if (decision?.kind === 'general') return choiceOptions.size === 1;
    if (decision?.kind !== 'skill-choice' || decision.mode === 'unsupported' || decision.giveFromHand) return false;
    if (decision.options.length && !decision.targetChoices) return false;
    const hasRequiredGroups = !decision.requiredGroups || decision.requiredGroups.every(group =>
      decision.cards.some(card => card.choiceGroup === group && choiceCards.has(card.id)));
    return hasRequiredGroups && (!decision.cards.length || choiceCards.size >= decision.min && choiceCards.size <= decision.max)
      && (!decision.targetChoices || choiceOptions.size >= decision.targetMin && choiceOptions.size <= decision.targetMax);
  }

  const skillSelection = value => ({ ...value, index: decision.index, optionKey: decision.optionKey });

  function revealHand({ seat, cards, full, skill, source, remembered = false }) {
    const player = players.get(seat);
    if (!player) return;
    const previous = new Map(player.visibleHand.map(card => [card.id, card]));
    const origin = source || skill;
    const updates = new Map(cards.filter(card => isCard(card) && !card.virtual && !card.hidden).map(card => {
      const known = previous.get(card.id);
      const knownOnlyFromObservation = remembered && (!known || known.remembered);
      const stronglyRevealed = known?.source === LUAN_CHAO;
      const face = stronglyRevealed && origin && origin !== LUAN_CHAO ? known : card;
      return [card.id, { ...displayCard(face), position: card.position ?? known?.position,
        source: stronglyRevealed ? LUAN_CHAO : origin || known?.source || '公开',
        ...(knownOnlyFromObservation && { remembered: true }) }];
    }));
    const added = [...updates.values()].filter(card => !previous.has(card.id));
    // Partial refreshes carry only the newly exposed cards or their new positions.
    for (const [id, card] of previous) {
      if (!updates.has(id) && (!full || updates.size || card.remembered)) updates.set(id, card);
    }
    player.visibleHand = [...updates.values()].sort((a, b) => (a.position ?? 54) - (b.position ?? 54));
    if (skill === LUAN_CHAO && added.length) append({ type: 'visible-hand', seat, cards: added });
  }

  function removeVisibleHand(player, ids, uncertain = false) {
    if (!player?.visibleHand.length) return;
    const cards = player.visibleHand.filter(card => !ids.has(card.id) && !(uncertain && card.remembered));
    if (cards.length !== player.visibleHand.length) player.visibleHand = cards;
  }

  function move({ from, to, cards = [], count, realCount = count, removedPlayedIds, removedVisibleIds,
    confirmedDepartures, toVisible, skill = 0 }) {
    const amount = Number.isSafeInteger(count) && count > 0 ? count : cards.length;
    if (!amount) return;
    const source = players.get(from?.seat), target = players.get(to?.seat);
    const zone = from?.zone, destination = to?.zone;
    const changed = cards.filter(card => isCard(card) && !card.virtual);
    if (zone === HAND && (source !== target || destination !== HAND)) {
      const removed = new Set([...(removedVisibleIds || []), ...changed.map(card => card.id)]);
      // A concealed departure without complete identities might have taken any observed face.
      const uncertain = !confirmedDepartures && removed.size < (Number.isSafeInteger(realCount) ? realCount : amount);
      removeVisibleHand(source, removed, uncertain);
    } else if (zone === HAND && removedVisibleIds) removeVisibleHand(source, new Set(removedVisibleIds));
    if (zone === BOTTOM && landlord != null) recordBottom(cards);
    if (destination === HAND && target) {
      if (zone === BOTTOM && target.id === landlord) {
        const awarded = amount === 3 && bottom.length === 3 ? bottom : changed;
        if (awarded.length) revealHand({ seat: target.id, cards: awarded, source: '底牌', remembered: true });
      } else if (target.id !== selfSeat && (zone === HAND && source?.id === selfSeat || zone === DISCARD) && changed.length) {
        revealHand({ seat: target.id, cards: changed, source: skill || (zone === DISCARD ? '弃牌' : '转移'), remembered: true });
      }
      if (toVisible) revealHand({ seat: target.id, cards: toVisible, skill: skill === LUAN_CHAO ? skill : 0 });
    }
    const tracked = new Map(changed.map(card => [card.id, card]));
    for (const card of played.get(from?.seat)?.cards || []) {
      if (!card.virtual && removedPlayedIds?.includes(card.id) && !tracked.has(card.id)) tracked.set(card.id, card);
    }
    // Skill piles are reconciled using their current visible contents below.
    remaining.move(zone, destination === OUTSIDE ? 0 : destination, [...tracked.values()], realCount ?? amount);
    if (zone === OUTSIDE && source) source.skillPiles = recoverSkillCards(source.skillPiles, cards, amount, skill);
    if (destination === OUTSIDE && target) {
      target.skillPiles = stashSkillCards(target.skillPiles, groupSkillCards(cards, amount, skill));
      const origin = zone === HAND ? 'hand' : zone === PLAYED ? 'played' : !zone || zone === DECK ? 'deck' : null;
      append({ type: 'stash', origin, from: source?.id, seat: target.id, cards, count: amount });
    }
    if (destination === HAND && target) {
      const created = !zone && skill && cards.length === amount && cards.every(card => card.id && !originalRank(card.id));
      const origin = created ? 'skill' : !zone || zone === DECK ? 'deck' : zone === BOTTOM ? 'bottom'
        : zone === HAND && source && source !== target ? 'hand' : zone === DISCARD ? 'discard'
          : zone === PLAYED ? 'played' : zone === OUTSIDE ? 'outside' : null;
      if (origin) append({ type: 'gain', origin, from: source?.id, seat: target.id, cards, count: amount, skill });
    }
    if (destination === DISCARD && source) {
      if (zone === HAND || zone === OUTSIDE) append({ type: 'discard', seat: source.id, cards, count: amount });
      if (zone === PLAYED && played.has(source.id)) {
        append({ type: 'clear-play', origin: 'played', seat: source.id, cards, count: amount });
      }
    }
    if (from?.zone === POKER_ZONE.PLAYED) {
      const action = played.get(from.seat);
      if (action && !action.pass) {
        const left = Math.max(0, action.count - amount);
        if (!left) {
          played.delete(from.seat);
          if (leadingSeat === from.seat) leadingSeat = null;
        }
        else {
          const removed = new Set(removedPlayedIds ?? cards.filter(isCard).map(card => card.id));
          const kept = action.cards.filter(card => !removed.has(card.id));
          // A move can withhold the identity of some cards. In that case keep
          // the remaining count and hide any now-ambiguous card faces.
          played.set(from.seat, { ...action, count: left, cards: kept.length <= left ? kept : [] });
        }
      }
    }
    const changeHand = (position, direction, units) => {
      if (!handZone(position)) return;
      const seat = players.get(position.seat);
      if (seat?.count != null) seat.count = Math.max(0, seat.count + units * direction);
      if (seat?.count === 0 && (from?.seat !== to?.seat || to?.zone !== HAND)) seat.visibleHand = [];
      if (position.seat !== selfSeat) return;
      if (changed.length !== units || new Set(changed.map(card => card.id)).size !== units) completeHand = false;
      for (const card of changed) {
        if (direction > 0) hand.set(card.id, displayCard(card));
        else if (!hand.delete(card.id)) completeHand = false;
      }
    };
    changeHand(from, -1, Number.isSafeInteger(realCount) ? realCount : amount);
    changeHand(to, 1, amount);
    const countNow = players.get(selfSeat).count;
    if (countNow === 0) { hand.clear(); completeHand = true; }
    else if (countNow !== null && countNow !== hand.size) completeHand = false;
    for (const id of selected) {
      if (hand.has(id)) continue;
      selected.delete(id);
      wildRanks.delete(id);
      if (decision?.kind === 'wild') setDecision(null);
    }
  }

  function receive(type, data = {}) {
    switch (type) {
      case 'unavailable':
        unavailable = true;
        activeSeat = null;
        reveal = null;
        resetTurn();
        setDecision(null);
        break;
      case 'start':
        ended = settled = leaving = leaveError = false;
        trustee = trusteePending = false;
        surrenderNotice = undefined;
        activeSeat = null;
        notice = landlord = null;
        phase = bidding = null;
        history = [];
        reveal = null;
        resetTurn();
        setDecision(null);
        skills.clear();
        openingSkins.clear();
        hand.clear();
        clearPlayed();
        remaining = trackRemainingCards();
        bottom = [];
        score = data.baseScore ?? null;
        baseRate = data.multiplier ?? null;
        multiplier = null;
        completeHand = true;
        for (const seat of players.values()) {
          seat.count = 0;
          seat.result = seat.beans = seat.role = null;
          seat.general = seat.generalId = undefined;
          seat.skin = 0;
          seat.skinDynamic = false;
          seat.skinType = 1;
          seat.visibleHand = [];
          seat.skillIds = seat.skillStates = seat.skillPiles = [];
          seat.skillUses = {};
        }
        break;
      case 'sync': {
        resetTurn();
        setDecision(null);
        reveal = null;
        skills.clear();
        clearPlayed();
        hand.clear();
        // A reconnect may have missed both plays and cards returning to hand.
        // Rebuild the bound from the zones the server has disclosed now.
        remaining = trackRemainingCards();
        remaining.move(0, DISCARD, (data.discarded || []).map(id => ({ id })), 0);
        if (data.rate != null) baseRate = data.rate;
        if (data.bottom) recordBottom(data.bottom);
        for (const entry of data.tableCards || []) {
          if (!players.has(entry.seat)) continue;
          const cards = entry.cards.map(displayCard);
          remaining.play(cards);
          played.set(entry.seat, { ...entry, type: 'play', cards });
        }
        phase = data.phase;
        bidding = null;
        for (const seat of players.values()) {
          const count = data.counts?.[seat.id];
          seat.count = Number.isSafeInteger(count) && count >= 0 ? count : null;
          seat.skillPiles = [];
          seat.visibleHand = [];
        }
        for (const row of data.visibleHands || []) revealHand(row);
        for (const card of data.hand || []) if (isCard(card) && !card.virtual) hand.set(card.id, displayCard(card));
        completeHand = Array.isArray(data.hand) && data.hand.length === hand.size
          && (players.get(selfSeat).count ?? hand.size) === hand.size;
        landlord = data.landlord;
        activeSeat = data.phase === PLAY_PHASE && players.has(data.seat) ? data.seat : null;
        notice = '牌局已同步';
        break;
      }
      case 'hand': {
        hand.clear();
        for (const card of data.cards) if (isCard(card) && !card.virtual) hand.set(card.id, displayCard(card));
        if (typeof data.complete === 'boolean') {
          completeHand = data.complete && data.cards.length === hand.size;
          players.get(selfSeat).count = data.count;
        }
        for (const id of selected) {
          if (hand.has(id)) continue;
          selected.delete(id);
          wildRanks.delete(id);
          if (decision?.kind === 'wild') setDecision(null);
        }
        break;
      }
      case 'move':
        move(data);
        break;
      case 'hint-pending':
        if (ours() && turn.optionKey === data.optionKey) hintPending = true;
        break;
      case 'hint': {
        if (!ours() || turn.optionKey !== data.optionKey || data.waited && !hintPending) break;
        hintPending = false;
        const { choice } = data;
        if (!completeHand || !choice?.ids.every(id => hand.has(id))) {
          notice = '暂无出牌提示';
          break;
        }
        selected.clear();
        wildRanks.clear();
        for (const id of choice.ids) selected.add(id);
        for (const [id, rank] of choice.wildRanks) if (isWildCard(hand.get(id))) wildRanks.set(id, rank);
        notice = null;
        break;
      }
      case 'visible-hand':
        revealHand(data);
        break;
      case 'bottom':
        recordBottom(data.cards);
        break;
      case 'base-rate':
        baseRate = data.rate;
        break;
      case 'multiplier': {
        const previous = multiplier ?? baseRate;
        if (data.score != null) score = data.score;
        if (data.rate != null) {
          multiplier = data.rate;
          if (multiplier !== previous) append({ type: 'multiplier', rate: multiplier, reason: data.reason });
        }
        break;
      }
      case 'turn': {
        if (!players.has(data.seat) || ended) break;
        reveal = null;
        activeSeat = data.seat;
        if (turn?.seat === data.seat && turn?.optionKey === data.optionKey) {
          turn = { ...turn, ...data };
          break;
        }
        if (!data.canPass) clearPlayed();
        else if (played.get(data.seat)?.pass) played.delete(data.seat);
        resetTurn();
        setDecision(null);
        notice = null;
        turn = data;
        break;
      }
      case 'played': {
        if (!players.has(data.seat)) break;
        if (reveal?.seat === data.seat) reveal = null;
        const cards = data.hidden && data.seat !== selfSeat ? [] : (data.cards || []).filter(isCard).map(displayCard);
        const count = Number.isSafeInteger(data.count) ? data.count : cards.length;
        const pass = data.pass === true || !data.hidden && count === 0;
        const action = { type: pass ? 'pass' : 'play', seat: data.seat, cards, count,
          ...(data.cardType != null && { combination: data.cardType }),
          ...(data.hidden === true && { hidden: true }),
          pass };
        played.set(data.seat, action);
        if (!pass) {
          leadingSeat = data.seat;
          remaining.play(cards);
          removeVisibleHand(players.get(data.seat), new Set(cards.map(card => card.id)), cards.length < count);
        }
        append(action);
        resetTurn();
        activeSeat = null;
        break;
      }
      case 'ack':
        if (pending?.kind !== data.action || (data.optionKey != null && pending.optionKey !== data.optionKey)) break;
        if (!data.accepted) {
          pending = null;
          notice = data.message || '服务器未接受本次操作';
        } else if (['general', 'bid', 'skill', 'skill-choice'].includes(pending.kind)) {
          const closed = pending.kind === decision?.kind;
          if (closed && pending.kind === 'skill-choice' && pending.value?.cardIds?.length) {
            const chosen = decision.cards.filter(card => !card.hidden && pending.value.cardIds.includes(card.id));
            if (chosen.length) append({ type: 'skill-choice', seat: selfSeat, skill: decision.skill, cards: chosen });
          }
          pending = null;
          if (closed) setDecision(null);
          notice = turn?.actionable ? null : '已确认，等待牌局继续';
        }
        break;
      case 'phase':
        phase = data.phase;
        if (phase === 201 || phase === 280) clearPlayed();
        if (phase !== BID_PHASE) bidding = null;
        if (reveal && (data.phase !== PLAY_PHASE || data.seat === reveal.seat)) reveal = null;
        activeSeat = data.phase === PLAY_PHASE && players.has(data.seat) ? data.seat : null;
        if (data.phase !== PLAY_PHASE || data.seat !== selfSeat) resetTurn();
        if (decision?.kind === 'general' && data.phase !== 101 || decision?.kind === 'bid' && data.phase !== 103) setDecision(null);
        if (OPENING_LABELS[data.phase]) notice = OPENING_LABELS[data.phase];
        else if (activeSeat != null && !turn) notice = null;
        break;
      case 'general-options': {
        if (data.seat !== selfSeat || ended) break;
        reveal = null;
        resetTurn();
        notice = OPENING_LABELS[101];
        const options = (data.candidates || []).map(candidate => {
          const id = candidate.id ?? candidate;
          return { id, label: generalName(id), canSwap: candidate.canSwap !== false, skills: candidate.skills };
        });
        if (data.actionable && options.length) {
          if (decision?.kind === 'general' && (data.replacement || decision.optionKey === data.optionKey)) {
            if (data.replacement && !data.awaitingConfirmation && pending?.kind === 'general') pending = null;
            decision = { ...decision, options, optionKey: data.optionKey };
            for (const id of choiceOptions) if (!options.some(option => option.id === id)) choiceOptions.delete(id);
          } else setDecision({ kind: 'general', title: '选择武将', options, optionKey: data.optionKey,
            draftKey: data.optionKey });
        }
        break;
      }
      case 'bid-turn': {
        if (ended || !players.has(data.seat)) break;
        reveal = null;
        resetTurn();
        activeSeat = data.seat;
        phase = BID_PHASE;
        bidding = { seat: data.seat, grab: data.grab, decision: null };
        if (data.seat !== selfSeat || !data.actionable) {
          setDecision(null);
          notice = data.grab ? '等待其他玩家抢地主' : '等待其他玩家叫地主';
          break;
        }
        const [call, decline] = bidLabels(data.grab);
        setDecision({ kind: 'bid', title: call, optionKey: data.optionKey, options: [
          { id: 1, label: call }, { id: 0, label: decline },
        ] });
        notice = call;
        break;
      }
      case 'general':
        if (players.has(data.seat) && data.general > 0) {
          const seat = players.get(data.seat);
          const changed = seat.generalId !== data.general;
          if (!data.snapshot && changed) {
            append({ type: 'general', seat: seat.id, general: data.general });
          }
          seat.general = generalName(data.general);
          seat.generalId = data.general;
          const preferred = seat.id === selfSeat && openingSkins.get(data.general);
          if (preferred) openingSkins.delete(data.general);
          if (changed || preferred || data.skin != null) {
            const skin = preferred || data;
            seat.skin = skin.skin;
            seat.skinDynamic = skin.skinDynamic === true;
            seat.skinType = skin.skinType || 1;
          }
        }
        if (data.seat === selfSeat && decision?.kind === 'general') setDecision(null);
        break;
      case 'skin': {
        const seat = players.get(data.seat);
        if (seat?.generalId !== data.general) {
          if (data.seat === selfSeat && phase < 201) {
            if (openingSkins.size >= 16) openingSkins.delete(openingSkins.keys().next().value);
            openingSkins.set(data.general, data);
          }
          break;
        }
        seat.skin = data.skin;
        seat.skinDynamic = data.skinDynamic;
        seat.skinType = data.skinType;
        break;
      }
      case 'bid': {
        if (!players.has(data.seat)) break;
        const grab = bidding?.seat === data.seat ? bidding.grab : data.grabTimes > 1;
        bidding = { seat: data.seat, grab, decision: data.bid };
        append({ type: 'bid', seat: data.seat, grab, bid: data.bid });
        if (data.seat === selfSeat && decision?.kind === 'bid') setDecision(null);
        break;
      }
      case 'skill-details': {
        const seat = players.get(data.seat);
        if (seat) Object.assign(seat, { skillIds: data.skills, skillUses: data.uses, skillStates: data.marks });
        break;
      }
      case 'skill-pile': {
        const seat = players.get(data.seat);
        if (!seat) break;
        const groups = groupSkillCards(data.cards, data.count, data.skill);
        const replaced = new Set(groups.map(pile => pile.skill));
        if (data.skill) replaced.add(data.skill);
        seat.skillPiles = [...seat.skillPiles.filter(pile => !replaced.has(pile.skill)), ...groups];
        break;
      }
      case 'skill-used': {
        const seat = players.get(data.seat);
        if (seat && !ended) append({ ...data, type: 'skill', general: seat.generalId, skin: seat.skin });
        break;
      }
      case 'trustee':
        if (data.changed) append({ type: 'trustee', seat: data.seat, enabled: data.enabled });
        if (data.seat === selfSeat) {
          trustee = data.enabled;
          trusteePending = data.pending;
        }
        break;
      case 'skill-state':
        if (data.seat !== selfSeat) break;
        skills.clear();
        for (const skill of data.skills || []) skills.set(skill.id, skill);
        break;
      case 'skill-options':
        if (data.seat !== selfSeat || ended) break;
        if (data.skill == null && decision?.kind !== 'skill-choice') break;
        if (data.local) {
          if (pending?.kind === 'skill') pending = null;
        } else resetTurn();
        setDecision(data.skill == null ? null : skillDecision(data));
        notice = decision ? decision.reason || decision.title : data.local ? null : '等待下一步牌局操作';
        break;
      case 'action-closed':
        resetTurn();
        setDecision(null);
        activeSeat = null;
        reveal = null;
        notice = '等待下一步牌局操作';
        break;
      case 'reveal':
        if (!ended && players.has(data.seat)) reveal = data;
        break;
      case 'reveal-ended':
        if (reveal === data) reveal = null;
        break;
      case 'prompt-expired': {
        const expiredDecision = decision?.optionKey != null && decision.optionKey === data.optionKey;
        const expiredTurn = turn?.optionKey != null && turn.optionKey === data.optionKey;
        if (expiredDecision) setDecision(null);
        if (expiredTurn) resetTurn();
        if (expiredDecision || expiredTurn) notice = expiredDecision ? '操作时间已到' : '出牌时间已到';
        break;
      }
      case 'landlord':
        if (players.has(data.seat)) {
          if (landlord !== data.seat) append({ type: 'landlord', seat: data.seat });
          landlord = data.seat;
          bidding = null;
          if (decision?.kind === 'bid') setDecision(null);
        }
        break;
      case 'surrender':
        surrenderNotice = data.waiting ? data.message : undefined;
        if (data.accepted) {
          resetTurn();
          setDecision(null);
          reveal = null;
        }
        if (!ended && !data.waiting) notice = data.message;
        break;
      case 'end':
        resetTurn();
        setDecision(null);
        reveal = null;
        skills.clear();
        ended = true;
        surrenderNotice = undefined;
        activeSeat = null;
        notice = null;
        if (data.settled) {
          if (!settled) append({ type: 'result', text: '牌局结束' });
          settled = true;
          const result = data.player;
          if (result?.seat === selfSeat) Object.assign(players.get(selfSeat), {
            result: result.result, beans: result.beans, role: result.role,
          });
        }
        break;
    }
    if (decision?.fromHand) {
      for (const id of choiceCards) if (!hand.has(id)) choiceCards.delete(id);
    }
  }

  function view() {
    const orderedHand = [...hand.values()].sort(comparePokerHandCards);
    const visiblePiles = [...players.values()].flatMap(seat => seat.skillPiles.flatMap(pile => pile.cards)).filter(Boolean);
    const counts = phase != null || score != null || hand.size || played.size
      ? remaining.counts([...orderedHand, ...visiblePiles]) : null;
    let status = '等待牌局同步';
    if (unavailable) status = '牌局操作暂不可用';
    else if (leaving) status = '正在退出牌桌';
    else if (leaveError) status = '退出失败，请重试';
    else if (ended) status = settled ? '本局已结算' : '等待结算';
    else if (surrenderNotice) status = surrenderNotice;
    else if (trusteePending) status = '等待托管确认';
    else if (trustee) status = '托管中';
    else if (pending) status = '等待服务器确认';
    else if (notice) status = notice;
    else if (activeSeat != null) {
      if (activeSeat !== selfSeat) status = '等待其他玩家';
      else if (!turn?.actionable) status = '等待出牌指令';
      else if (!completeHand) status = '等待手牌同步';
      else status = '轮到你出牌';
    }
    return { hand: orderedHand, selected: new Set(selected), selfSeat, turnSeat: activeSeat, phase, bidding, history,
      seats: [...players.values()].map(seat => ({ ...seat,
        role: seat.role ?? (landlord == null ? null : seat.id === landlord ? 1 : 3) })),
      played: [...played.values()], lastPlay: played.get(leadingSeat) ?? null,
      bottom, score, rate: multiplier ?? baseRate, remaining: counts, reveal, challenge: turn?.challenge, status,
      canPlay: canPlay(), canPass: canPass(), canHint: ours() && completeHand && hand.size > 0 && !hintPending,
      hintPending, pending: Boolean(pending || surrenderNotice || leaving),
      ended, settled, leaving, trustee, trusteePending,
      decision: !trustee && !trusteePending && decision ? { kind: decision.kind, mode: decision.mode, skill: decision.skill,
        key: decision.optionKey, draftKey: decision.draftKey, title: decision.title, options: decision.options,
        cards: decision.cards?.length ? decision.cards : undefined,
        selected: new Set(choiceCards), selectedOptions: new Set(choiceOptions),
        targetChoices: decision.targetChoices, copyCard: decision.copyCard, fromHand: decision.fromHand,
        giveFromHand: decision.giveFromHand,
        offersCancel: decision.canCancel === true,
        min: decision.min, max: decision.max,
        canConfirm: decision.kind === 'general' || decision.kind === 'skill-choice'
          && !decision.giveFromHand && decision.mode !== 'unsupported' && (!decision.options.length || decision.targetChoices)
          ? canConfirmChoice() : undefined,
        canCancel: decision.canCancel === true && available() } : decision && null,
      skills: [...skills.values()].map(skill => ({ ...skill, label: skill.label || skill.name || skillName(skill.id),
        enabled: skill.enabled === true && available() && !decision })),
    };
  }

  return {
    receive,
    view,
    get leaving() { return leaving; },
    knowsHandCard(seat, id) { return players.get(seat)?.visibleHand.some(card => card.id === id) === true; },
    beginLeave({ afterResultTimeout = false, escape = false } = {}) {
      const allowed = escape ? !ended : settled || ended && afterResultTimeout;
      if (!allowed || leaving || unavailable) return false;
      leaving = true;
      leaveError = false;
      return true;
    },
    leaveFailed() {
      leaving = false;
      leaveError = true;
    },
    toggleCard(id) {
      if (!hand.has(id) || !available() || decision) return false;
      hintPending = false;
      if (!selected.delete(id)) selected.add(id);
      wildRanks.clear();
      if (turn) notice = null;
      return true;
    },
    toggleChoiceCard(id) {
      if (!available() || decision?.kind !== 'skill-choice' || decision.mode === 'unsupported' || decision.giveFromHand
        || !decision.cards.length) return false;
      const choice = decision.cards.find(card => card.id === id);
      if (!choice || choice.disabled || decision.fromHand && !hand.has(id)) return false;
      if (choiceCards.delete(id)) return true;
      if (decision.requiredGroups?.includes(choice.choiceGroup)) {
        for (const card of decision.cards) if (card.choiceGroup === choice.choiceGroup) choiceCards.delete(card.id);
      }
      if (decision.max === 1) choiceCards.clear();
      if (choiceCards.size < decision.max) choiceCards.add(id);
      return true;
    },
    begin(kind, id) {
      if (!available()) return null;
      if (kind === 'play' && canPlay()) return readyPlay();
      if (kind === 'pass' && canPass()) pending = { kind, optionKey: turn.optionKey, ids: [] };
      if (kind === 'skill' && !decision && skills.get(id)?.enabled === true) {
        pending = { kind, optionKey: skills.get(id).optionKey ?? turn?.optionKey, value: id };
      }
      if (kind === 'give-card' && decision?.kind === 'skill-choice' && decision.giveFromHand && hand.has(id)
          && decision.cards.some(card => card.id === id && !card.disabled)) {
        choiceCards.clear();
        choiceCards.add(id);
        pending = { kind: decision.kind, optionKey: decision.optionKey, value: skillSelection({ cardIds: [id] }) };
      }
      if (kind === 'choose' && decision?.options.some(option => option.id === id && option.enabled !== false)) {
        if (decision.kind === 'wild') {
          wildRanks.set(decision.cardId, id);
          return readyPlay();
        } else if (decision.kind === 'general') {
          if (choiceOptions.has(id)) return null;
          choiceOptions.clear();
          choiceOptions.add(id);
          return { kind: 'general-preview', value: id };
        } else if (decision.kind === 'skill-choice') {
          if (decision.targetChoices) {
            if (choiceOptions.delete(id)) return null;
            if (decision.targetMax === 1) choiceOptions.clear();
            if (choiceOptions.size < decision.targetMax) choiceOptions.add(id);
            return null;
          }
          pending = { kind: decision.kind, optionKey: decision.optionKey, value: skillSelection({ option: id }) };
        } else {
          pending = { kind: 'bid', optionKey: decision.optionKey, value: Boolean(id) };
        }
      }
      if (kind === 'confirm' && canConfirmChoice()) {
        const value = decision.kind === 'general' ? choiceOptions.values().next().value
          : skillSelection({ cardIds: [...choiceCards], targetSeats: [...choiceOptions] });
        pending = { kind: decision.kind, optionKey: decision.optionKey, value };
      }
      if (kind === 'cancel' && decision?.kind === 'skill-choice' && decision.canCancel) {
        pending = { kind: 'skill-choice', optionKey: decision.optionKey, value: skillSelection({ cancel: true }) };
      }
      if (kind === 'cancel' && decision?.kind === 'wild') {
        wildRanks.clear();
        setDecision(null);
      }
      return pending ?? null;
    },
    sendFailed(action) {
      if (pending !== action) return;
      pending = null;
      notice = '本次操作暂未发送';
    },
  };
}
