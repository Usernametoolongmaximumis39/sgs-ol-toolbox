import { messages, number, numbers, signed } from './reader.js';
import { originalRank, POKER_ZONE, trackRemainingCards } from './remaining.js';
import { SEAT_MARKS } from './skill-states.js';
import { groupSkillCards, recoverSkillCards, stashSkillCards } from './skill-piles.js';

const { DECK, HAND, BOTTOM, OUTSIDE, PLAYED, DISCARD } = POKER_ZONE;
// The 21 high bits encode the bomb multiplier, the low 11 encode the displayed rate.
export const pokerMultiplier = packed => packed & 0x7ff;
const SUIT_SYMBOLS = ['', '♠', '♥', '♣', '♦'];
const FACES = ['?', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
const TRIGGER_CARD_LIMITS = new Map([[15, 2], [16, 3], [26, 1]]);
const OPTION_CARD_COUNTS = new Map([[3, 1], [11, 2], [17, 1], [45, 1]]);

export function cardFace(id, suitOverride = 0, rankOverride = 0, wild = 0, wildSkill = 0, virtual = false) {
  const baseSuit = Math.floor(id / 10000);
  const baseRank = Math.floor(id % 10000 / 100);
  const suit = suitOverride || baseSuit;
  const rank = rankOverride || wild || baseRank;
  return { id, suit, rank, wild, wildSkill, baseSuit, baseRank, virtual, symbol: SUIT_SYMBOLS[suit] || '', face: FACES[rank] || '?',
    red: suit === 2 || suit === 4 || rank === 17 };
}

export function comparePokerCardsByRank(first, second) {
  return second.rank - first.rank || first.suit - second.suit || second.id - first.id;
}

// Position-dependent skills use this same order as the live hand.
export function comparePokerHandCards(first, second) {
  return Number(Boolean(second.wildSkill)) - Number(Boolean(first.wildSkill)) || comparePokerCardsByRank(first, second);
}

export function isWildCard(card) {
  return Boolean(card?.wild || card?.wildSkill);
}

export function cardDetail(card) {
  if (!card?.id) return '';
  const name = card.symbol + card.face;
  const changed = card.suit !== card.baseSuit || card.rank !== card.baseRank;
  const origin = (SUIT_SYMBOLS[card.baseSuit] || '') + (FACES[card.baseRank] || '?');
  if (isWildCard(card)) return name + (changed ? `（癞·原${origin}）` : '（癞）');
  if (card.virtual) return name + '（虚）';
  return name + (changed ? `（原${origin}）` : '');
}

function readCards(body, field) {
  return messages(body, field).map(value => {
    const card = cardFace(number(value, 1), number(value, 2), number(value, 3), number(value, 6), number(value, 7), Boolean(number(value, 5)));
    const areaSkill = number(value, 8);
    return areaSkill ? { ...card, areaSkill } : card;
  });
}

function optionIndex(body) {
  const value = body?.get(1)?.at(-1);
  return typeof value === 'bigint' ? value.toString() : null;
}

function recordedCardChoice(body) {
  const type = number(body, 11);
  const canCancel = type === 1;
  const skill = canCancel ? number(messages(body, 32)[0], 1) : number(body, 22);
  const max = canCancel ? TRIGGER_CARD_LIMITS.get(skill) : type === 2 && OPTION_CARD_COUNTS.get(skill);
  const index = optionIndex(body);
  if (!max || index === null) return null;
  const cards = readCards(body, 33).filter(card => card.id).slice(0, 54);
  const min = canCancel ? 1 : max;
  if (cards.length < min || skill === 26 && cards.length < 2
      || new Set(cards.map(card => card.id)).size !== cards.length) return null;
  return { index, skill, min, max: Math.min(max, cards.length), canCancel, cards, selected: [] };
}

function matchCardChoice(choice, ids) {
  if (ids.length < choice.min || ids.length > choice.max) return null;
  const selected = choice.cards.filter(card => ids.includes(card.id) && (choice.skill !== 3 || card.baseRank < 16));
  return selected.length === ids.length ? selected : null;
}

export function playType(code, count = 0) {
  if (code === 9999) return '王炸';
  if (code >= 9000) return '炸弹';
  if (code >= 4200) return '四带两对';
  if (code >= 4100) return '四带二';
  if (code >= 3200) return '飞机带对子';
  if (code >= 3100) return '飞机带单牌';
  if (code >= 3000) return '飞机';
  if (code >= 2000) return '连对';
  if (code >= 1000) return '顺子';
  return { 0: count ? '特殊出牌' : '过牌', 1: '单张', 2: '对子', 30: '三张', 31: '三带一', 32: '三带二' }[code] || '出牌';
}

export function recordedPlayType(action) {
  return action.hidden ? '蛊惑' : playType(action.combination, action.count);
}

function applyGeneral(state, body, append) {
  for (const row of messages(body, 1)) {
    const general = messages(row, 2)[0];
    const id = number(general, 1);
    const seat = state.seats.find(item => item.id === number(row, 1));
    if (!id || !seat) continue;
    const skills = numbers(general, 3).filter(skill => skill > 0).slice(0, 24);
    if (skills.length || seat.general !== id) seat.skills = skills;
    seat.skin = number(general, 2);
    if (seat.general === id) continue;
    seat.general = id;
    append?.({ type: 'general', seat: seat.id, general: id });
  }
}

function applySkillData(state, body, perspective) {
  for (const row of messages(body, 1)) {
    const seat = state.seats.find(item => item.id === number(row, 1));
    if (!seat) continue;
    seat.skillUses = Object.fromEntries(messages(row, 2).map(item => [number(item, 1), number(item, 2)]));
    seat.skillStates = messages(row, 3).map(item => {
      const id = number(item, 1);
      const values = numbers(item, 2);
      return {
        id, cards: seat.id === perspective ? values : [],
        ...(SEAT_MARKS.get(id)?.parameters && values.length ? { parameters: values } : {}),
      };
    });
  }
}

function applyZoneUpdate(state, body, own) {
  const location = messages(body, 1)[0];
  const zone = number(location, 2);
  if (zone === BOTTOM && state.seats.some(seat => seat.role === 1)) {
    const cards = readCards(body, 6).filter(card => card.id);
    if (cards.length) state.bottom = cards;
  }
  if (zone === OUTSIDE && number(body, 8)) {
    const seat = state.seats.find(candidate => candidate.id === number(location, 1));
    if (seat) seat.skillPiles = groupSkillCards(readCards(body, 6), number(body, 7), number(body, 5));
    return;
  }
  if (zone !== HAND || number(location, 1) !== own?.id || !own.hand.length || !number(body, 5)) return;
  const updates = new Map(readCards(body, 6).map(card => [card.id, card]));
  own.hand = own.hand.map(card => updates.get(card.id) || card);
}

function applyRoles(state, body) {
  for (const row of messages(body, 1)) {
    const seat = state.seats.find(item => item.id === number(row, 1));
    if (seat) seat.role = number(row, 2);
  }
}

function applySnapshot(state, body, perspective, audit) {
  const base = messages(body, 1)[0];
  const active = number(base, 22);
  state.active = state.seats.some(seat => seat.id === active) ? active : null;
  state.phase = number(base, 21, state.phase);
  state.rate = number(messages(body, 2)[0], 1, state.rate);
  applyGeneral(state, messages(body, 3)[0]);
  applyRoles(state, messages(body, 4)[0]);
  applySkillData(state, messages(body, 6)[0], perspective);
  const zones = messages(body, 5);
  if (zones.length) for (const seat of state.seats) seat.skillPiles = [];
  for (const row of zones) {
    const location = messages(row, 1)[0];
    const zone = number(location, 2);
    if (zone === BOTTOM && state.seats.some(seat => seat.role === 1)) {
      state.bottom = readCards(row, 6).filter(card => card.id);
    }
    const seat = state.seats.find(item => item.id === number(location, 1));
    if (seat && zone === OUTSIDE && number(row, 8)) {
      seat.skillPiles = groupSkillCards(readCards(row, 6), number(row, 7), number(row, 5));
    }
    if (!seat || zone !== HAND || !number(row, 8)) continue;
    const count = number(row, 7);
    const cards = seat.id === perspective ? readCards(row, 6).filter(card => card.id) : [];
    if (seat.count !== null) {
      audit.countChecks++;
      if (seat.count !== count) audit.countDifferences++;
    }
    if (seat.id === perspective && seat.count !== null && seat.hand.length === seat.count && cards.length === count) {
      audit.handChecks++;
      const ids = new Set(cards.map(card => card.id));
      if (seat.hand.length !== cards.length || seat.hand.some(card => !ids.has(card.id))) audit.handDifferences++;
    }
    seat.count = count;
    seat.hand = cards;
  }
}

function applyMove(state, body, perspective, append, remaining) {
  const from = messages(body, 2)[0];
  const to = messages(body, 3)[0];
  const cards = readCards(body, 6);
  const known = cards.filter(card => card.id);
  const count = number(body, 7, cards.length);
  const source = state.seats.find(seat => seat.id === number(from, 1));
  const target = state.seats.find(seat => seat.id === number(to, 1));
  const zone = number(from, 2);
  const destination = number(to, 2);
  const skill = number(body, 5);
  remaining.move(zone, destination, known, count);
  if (zone === OUTSIDE && source) source.skillPiles = recoverSkillCards(source.skillPiles, cards, count, skill);
  if (destination === OUTSIDE && target) {
    target.skillPiles = stashSkillCards(target.skillPiles, groupSkillCards(cards, count, skill));
  }
  if (zone === HAND && source) {
    const removed = destination === PLAYED ? Math.max(0, count - cards.filter(card => card.virtual).length) : count;
    if (source.count !== null) source.count = Math.max(0, source.count - removed);
    if (source.id === perspective) {
      const ids = new Set(known.map(card => card.id));
      source.hand = source.hand.filter(card => !ids.has(card.id));
      if (source.count !== null && source.hand.length > source.count) source.hand = [];
    }
  }
  if (destination === HAND && target) {
    if (target.count !== null) target.count += count;
    if (target.id === perspective) target.hand = [...target.hand, ...known];
    const created = zone === 0 && skill && known.length === count && known.every(card => !originalRank(card.id));
    const origin = created ? 'skill' : zone === 0 || zone === DECK ? 'deck' : zone === BOTTOM ? 'bottom'
      : zone === HAND && source && source !== target ? 'hand' : zone === DISCARD ? 'discard'
        : zone === PLAYED ? 'played' : zone === OUTSIDE ? 'outside' : null;
    if (origin && count > 0) append({ type: 'gain', origin, from: source?.id ?? null, seat: target.id, count, cards, skill });
  }
  if (destination === OUTSIDE && target && count > 0) {
    const origin = zone === HAND ? 'hand' : zone === DECK || zone === 0 ? 'deck' : zone === PLAYED ? 'played' : null;
    if (origin) append({ type: 'stash', origin, from: source?.id ?? null, seat: target.id, count, cards, skill });
  }
  if (zone === BOTTOM && known.length) state.bottom = known;
  if (zone === PLAYED && source?.tableAction?.type === 'play' && count > 0) {
    const play = source.tableAction;
    const ids = new Set(known.map(card => card.id));
    const remaining = ids.size ? play.cards.filter(card => !ids.has(card.id)) : play.cards.slice(count);
    const removed = ids.size ? play.cards.length - remaining.length : Math.min(play.count, count);
    if (removed) {
      source.tableAction = play.count > removed ? { ...play, count: play.count - removed, cards: remaining } : null;
      if (state.lastPlay === play) state.lastPlay = source.tableAction;
    }
  }
  if (destination === DISCARD && source && count > 0 && (zone === HAND || zone === PLAYED || zone === OUTSIDE)) {
    append({ type: zone === HAND ? 'discard' : 'clear-play', seat: source.id, count, cards });
  }
}

function applyResult(state, body, append) {
  if (number(body, 1) !== 47) return;
  for (const row of messages(body, 5)) {
    const seat = state.seats.find(item => item.id === number(row, 1));
    if (!seat) continue;
    seat.result = number(row, 4);
    seat.beans = row.has(8) ? signed(row, 8) : null;
    seat.role = number(row, 2, seat.role);
  }
  state.ended = true;
  state.active = null;
  append({ type: 'result' });
}

function copyState(state, logLength, remaining) {
  return {
    ...state, rate: state.multiplier ?? state.rate, seats: state.seats.map(seat => ({ ...seat })), logLength, remaining,
  };
}

export function buildTimeline(record, perspective) {
  const state = {
    seats: record.seats.map(seat => ({ ...seat, hand: [], count: null, general: null, skin: 0, skills: [], skillUses: {}, skillStates: [], skillPiles: [],
      role: 0, result: null, beans: null, tableAction: null })),
    active: null, bottom: [], lastPlay: null, phase: 0, score: null, rate: null, multiplier: null, ended: false, selection: null, bidding: null,
    playPrompt: null, skillChoice: null,
  };
  const remaining = trackRemainingCards();
  const own = state.seats.find(seat => seat.id === perspective);
  const initial = copyState(state, 0, null);
  const points = [];
  const log = [];
  const opening = [];
  const snapshot = () => copyState(state, log.length, state.seats.some(seat => seat.count > 0) ? remaining.counts(own?.hand || []) : null);
  const lengths = { selection: 1550, confirmed: 650, deal: 850, bid: 600, decision: 700, landlord: 900 };
  let openingCompletedAtZero = false;
  const audit = { countChecks: 0, countDifferences: 0, handChecks: 0, handDifferences: 0 };
  let time = 0;
  let submittedCards;
  const clearChoice = () => {
    state.skillChoice = null;
    submittedCards = undefined;
  };
  const append = action => {
    const entry = { ...action, time };
    log.push(entry);
    return entry;
  };
  const confirmChoice = selected => {
    if (!selected || !state.skillChoice || state.skillChoice.selected.length) return;
    state.skillChoice = { ...state.skillChoice, selected };
    append({ type: 'skill-choice', seat: perspective, skill: state.skillChoice.skill, cards: selected });
    submittedCards = undefined;
  };
  const atSeat = id => state.seats.some(seat => seat.id === id) ? id : null;
  const startAction = id => {
    const seat = state.seats.find(item => item.id === id);
    if (seat?.tableAction?.type === 'pass') seat.tableAction = null;
  };
  const stage = kind => {
    if (time !== 0) return;
    const start = opening.at(-1)?.end ?? 0;
    opening.push({ kind, time: start, end: start + lengths[kind], state: snapshot() });
  };
  for (const event of record.events) {
    if (!(event.mask & (1 << perspective))) continue;
    if (event.request && event.mask !== (1 << perspective)) continue;
    if (event.time !== time) {
      points.push({ time, state: snapshot() });
      time = event.time;
    }
    const { body } = event;
    switch (event.kind) {
      case 201000:
        state.score = number(body, 1);
        state.rate = number(body, 2);
        for (const seat of state.seats) seat.count = 0;
        break;
      case 201001: {
        const seat = atSeat(number(body, 3));
        if (state.phase === 202 && state.active !== seat) startAction(seat);
        state.active = seat;
        clearChoice();
        state.playPrompt = seat === perspective ? {
          seat, index: optionIndex(body), canPass: messages(body, 12).length > 0, canRecommend: false, cannotBeat: false,
        } : null;
        break;
      }
      case 201004: {
        const cards = readCards(body, 2);
        const count = number(body, 3, cards.length);
        const seat = state.seats.find(item => item.id === number(body, 1));
        if (!seat) break;
        state.playPrompt = null;
        clearChoice();
        const action = append({ type: count ? 'play' : 'pass', seat: seat.id, cards, count,
          hidden: Boolean(number(body, 4)), combination: number(body, 5), remaining: seat.count });
        seat.tableAction = action;
        if (count) {
          state.lastPlay = action;
          remaining.play(cards);
        }
        break;
      }
      case 201005:
        if (state.skillChoice && number(body, 5) === state.skillChoice.skill) {
          confirmChoice(matchCardChoice(state.skillChoice, readCards(body, 6).map(card => card.id)));
          clearChoice();
        }
        applyMove(state, body, perspective, append, remaining);
        break;
      case 201006: {
        if (number(body, 3) !== perspective) break;
        const listed = numbers(body, 11);
        const candidates = (listed.length ? listed : messages(body, 12).map(row => number(row, 1)))
          .filter(id => id > 0).slice(0, 16);
        if (candidates.length) {
          state.selection = { candidates, seconds: number(body, 2), chosen: null };
          stage('selection');
        }
        break;
      }
      case 201013:
        applyGeneral(state, body, append);
        if (state.selection && !state.selection.chosen) {
          const chosen = state.seats.find(seat => seat.id === perspective)?.general;
          if (chosen) {
            state.selection = { ...state.selection, chosen };
            stage('confirmed');
          }
        }
        break;
      case 201014: {
        const seat = atSeat(number(body, 3));
        state.active = seat;
        state.bidding = { seat, grab: number(body, 13) > 0, seconds: number(body, 2), decision: null };
        stage('bid');
        break;
      }
      case 201017: {
        const seat = atSeat(number(body, 1));
        if (seat === null) break;
        const decision = number(body, 2) > 0;
        const grabTimes = number(body, 3);
        const prompt = state.bidding?.seat === seat ? state.bidding : null;
        const grab = prompt?.grab ?? grabTimes > 1;
        state.bidding = { ...prompt, seat, grab, decision };
        append({ type: 'bid', seat, bid: decision, grab, grabTimes });
        stage('decision');
        break;
      }
      case 201019:
        applyRoles(state, body);
        break;
      case 201020: {
        state.score = number(body, 1, state.score);
        // The current multiplier is packed in the broadcast. Snapshot rate can
        // still be the earlier base after a bomb changes the amount shown.
        const multiplier = pokerMultiplier(number(body, 2));
        if (multiplier) state.multiplier = multiplier;
        break;
      }
      case 201021: {
        const phase = number(body, 2);
        const active = atSeat(number(body, 1));
        if (phase !== 202 || active !== state.active) {
          state.playPrompt = null;
          clearChoice();
        }
        if (state.phase === 101 && phase !== 101) state.selection = null;
        if (state.phase === 102 && phase !== 102) stage('deal');
        if (state.phase === 103 && phase !== 103) {
          state.bidding = null;
          const landlord = state.seats.find(seat => seat.role === 1);
          if (landlord) {
            append({ type: 'landlord', seat: landlord.id });
            stage('landlord');
          }
          openingCompletedAtZero = time === 0;
        }
        if (phase === 201 || phase === 280) {
          for (const seat of state.seats) seat.tableAction = null;
          state.lastPlay = null;
        } else if (phase === 202 && (state.phase !== 202 || state.active !== active)) startAction(active);
        state.phase = phase;
        state.active = active;
        break;
      }
      case 201025:
        applyZoneUpdate(state, body, own);
        break;
      case 201023:
        if (state.skillChoice?.index === optionIndex(body)) clearChoice();
        break;
      case 201027: {
        const choice = state.skillChoice;
        if (!choice?.canCancel || choice.index !== optionIndex(body) || choice.skill !== number(body, 2)) break;
        submittedCards = matchCardChoice(choice, numbers(body, 4));
        break;
      }
      case 201028: {
        const request = messages(body, 3)[0];
        if (number(body, 1) && state.skillChoice?.index === optionIndex(request)) submittedCards = undefined;
        break;
      }
      case 201029: {
        const seat = state.seats.find(item => item.id === number(body, 1));
        const skill = number(body, 2);
        if (!skill || !seat) break;
        if (body.has(7)) seat.skillUses = { ...seat.skillUses, [skill]: number(body, 7) };
        append({ type: 'skill', seat: seat.id, skill, general: seat.general, skin: seat.skin, effect: number(body, 3),
          targets: numbers(body, 5).filter(id => atSeat(id) !== null) });
        if (seat.id === perspective && state.skillChoice?.skill === skill && state.skillChoice.canCancel) confirmChoice(submittedCards);
        break;
      }
      case 201030: {
        const seat = atSeat(number(body, 3));
        if (state.phase === 202 && state.active !== seat) startAction(seat);
        state.active = seat;
        state.playPrompt = null;
        clearChoice();
        if (seat === perspective) state.skillChoice = recordedCardChoice(body);
        break;
      }
      case 201031:
        if (state.skillChoice && !state.skillChoice.canCancel && state.skillChoice.index === optionIndex(body)) {
          submittedCards = matchCardChoice(state.skillChoice, numbers(body, 2));
        }
        break;
      case 201032: {
        const request = messages(body, 3)[0];
        const choice = state.skillChoice;
        if (!choice || choice.canCancel || choice.index !== optionIndex(request)) break;
        if (!number(body, 1)) confirmChoice(submittedCards || matchCardChoice(choice, numbers(request, 2)));
        else submittedCards = undefined;
        break;
      }
      case 201033:
        state.rate = number(body, 1, state.rate);
        break;
      case 201034:
        applySkillData(state, body, perspective);
        break;
      case 201035:
        applySnapshot(state, body, perspective, audit);
        break;
      case 201037: {
        if (number(body, 2) !== 1) break;
        const seat = state.seats.find(item => item.id === number(body, 1));
        if (!seat?.general) break;
        const additions = messages(body, 21).filter(row => number(row, 1) === seat.general).map(row => number(row, 2)).filter(Boolean);
        if (additions.length) seat.skills = [...new Set([...seat.skills, ...additions])];
        break;
      }
      case 201071: {
        const prompt = state.playPrompt;
        if (!prompt?.canPass || event.mask !== (1 << perspective) || number(body, 7) !== perspective
            || prompt.index === null || prompt.index !== optionIndex(body)) break;
        const canRecommend = Boolean(number(body, 3) && messages(body, 2).some(row => messages(row, 3).length));
        state.playPrompt = { ...prompt, canRecommend, cannotBeat: !canRecommend };
        break;
      }
      case 108023:
        applyResult(state, body, append);
        if (state.ended) {
          state.playPrompt = null;
          clearChoice();
        }
        break;
    }
  }
  points.push({ time, state: snapshot() });
  return { points, initial, log, audit, opening: openingCompletedAtZero ? opening : [] };
}

export function pointIndex(points, time) {
  let first = 0;
  let limit = points.length;
  while (first < limit) {
    const middle = Math.floor((first + limit) / 2);
    if (points[middle].time <= time) first = middle + 1;
    else limit = middle;
  }
  return first - 1;
}
