import { read } from '../../../shared/safe-read.js';
import { cardFace, comparePokerHandCards } from '../replay/model.js';
import { POKER_ZONE } from '../replay/remaining.js';
import { KU_ROU, KU_ROU_CARDS, SEAT_MARKS } from '../replay/skill-states.js';

const USE = 201027;
const CHOOSE = 201031;
const CANCEL = 201023;
const CARD_LIMIT = 54;
const MOVE_DRAW = 4;
export const GUAN_XING = 3;
const LIAN_YING = 13;
const WU_SHUANG = 21;
const QI_MOU = 24;
const SHUANG_XIONG = 34;
const QIANG_YI = 100;
const STRAIGHT_LENGTH = 5;
const LOWEST_STRAIGHT_RANK = 3;
const HIGHEST_STRAIGHT_RANK = 14;
const QI_MOU_GROUPS = new Map([[1, [1, 1]], [2, [2, 2]], [30, [3, 3]], [31, [4, 3]], [32, [5, 3]]]);
const TRIGGER_CARD_COUNTS = new Map([[2, [1, 1]], [15, [1, 2]], [16, [1, 3]], [26, [1, 1]], [33, [1, 1]]]);
const TRIGGER_TARGETS = new Set([12, 44, 45]);
const TRIGGER_CONFIRM = new Set([4, 17, 23, 27, 39, 46]);
const CARD_CHOICES = new Map([[GUAN_XING, 1], [11, 2], [17, 1], [45, 1]]);
const REGULAR = new Map([
  [1, { cards: [1, 1], targets: true }],
  [GUAN_XING, { targets: true }],
  [5, { put: true, cards: [1, CARD_LIMIT] }],
  [7, { cards: [1, 1] }],
  [8, { cards: [1, 1], targets: true }],
  [10, {}],
  [LIAN_YING, { put: true, cards: [STRAIGHT_LENGTH - 1, STRAIGHT_LENGTH - 1] }],
  [18, { put: true, cards: [1, CARD_LIMIT] }],
  [20, {}],
  [WU_SHUANG, { put: true, cards: [1, 1] }],
  [22, { targets: true }],
  [QI_MOU, { put: true, predecessor: true }],
  [25, { types: true }],
  [29, { put: true, predecessor: true }],
  [SHUANG_XIONG, { put: true, cards: [2, 2] }],
  [37, {}],
  [38, { targets: true }],
  [42, { cards: [1, 1], position: true }],
  [44, { targets: true }],
  [47, { cards: [1, 1], exchange: true }],
]);

const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
const seatValue = value => Number.isInteger(value) && value >= 0 && value < 8;
const items = (value, limit = CARD_LIMIT) => Array.isArray(value) ? value.slice(0, limit) : [];
const ints = (value, predicate, limit) => [...new Set(items(value, limit).filter(predicate))];
const keyFor = value => value && (value.high | 0) === value.high && (value.low | 0) === value.low
  ? `${value.high}:${value.low}` : null;
const faces = value => items(value).filter(card => positive(card?.card_id)).map(card => cardFace(
  card.card_id, card.suit, card.num, card.wild_num, card.wild_spell_id, card.is_virtual === true,
));
const confirmAction = { id: 1, label: '确定' };

function selection(values, offered, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max || new Set(values).size !== values.length
    || !values.every(value => offered.includes(value))) return null;
  return values;
}

function usageLimit(skill) {
  const limit = read(() => skill.TimeLimitGame);
  return positive(limit) && limit < 255 ? limit : null;
}

function skillBody(skill, cards = [], targets = [], putCards = [], effect = 0) {
  return { spell_id: skill, spell_effect: effect, cards, targets, putCards };
}

function consecutiveStart(ranks) {
  if (ranks.length !== STRAIGHT_LENGTH) return null;
  const sorted = ranks.slice().sort((first, second) => first - second);
  if (sorted[0] < LOWEST_STRAIGHT_RANK || sorted.at(-1) > HIGHEST_STRAIGHT_RANK
    || !sorted.every((rank, index) => rank === sorted[0] + index)) return null;
  return sorted[0];
}

function lianYingCards(cards, predecessorStart) {
  const naturals = cards.filter(card => !card.wildSkill).map(card => card.rank);
  if (!naturals.length || new Set(naturals).size !== naturals.length) return null;
  let gaps;
  // The native client uses the strongest legal opening straight, or the
  // weakest straight that beats the preceding play.
  for (let start = predecessorStart === null ? LOWEST_STRAIGHT_RANK : predecessorStart + 1;
    start <= HIGHEST_STRAIGHT_RANK - STRAIGHT_LENGTH + 1; start += 1) {
    const ranks = Array.from({ length: STRAIGHT_LENGTH }, (_, index) => start + index);
    if (!naturals.every(rank => ranks.includes(rank))) continue;
    gaps = ranks.filter(rank => !naturals.includes(rank));
    if (predecessorStart !== null) break;
  }
  if (!gaps) return null;
  const ordinary = cards.map(card => ({
    card_id: card.id, wild_num: card.wildSkill ? gaps.shift() : 0, spell_num: 0, spell_suit: 0,
  }));
  return [...ordinary, { card_id: 0, wild_num: 0, spell_num: gaps[0], spell_suit: 1 }];
}

function qiMouRanks(cards, type) {
  const [count, group] = QI_MOU_GROUPS.get(type) || [];
  if (cards.length !== count || cards.some(card => card.rank < 3 || card.rank > 17)) return [];
  if (count === 1) return [{ rank: cards[0].rank, wild: 0 }];
  const natural = cards.filter(card => !card.wildSkill);
  const known = natural.length ? natural : cards;
  const wild = count - known.length;
  const counts = new Map();
  for (const card of known) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  if (count >= 4 && counts.size === 1 && known[0].rank < 16) return [];
  return [...counts].flatMap(([rank, amount]) => {
    const missing = group - amount;
    if (rank >= 16 || missing < 0 || missing > wild) return [];
    if (count - group === 2) {
      const side = known.filter(card => card.rank !== rank);
      if (side.length === 2 && side[0].rank !== side[1].rank) return [];
    }
    return [{ rank, wild: missing }];
  });
}

function qiMouCards(cards, turn) {
  const ranks = qiMouRanks(cards, turn.predecessorType);
  if (!ranks.length) return null;
  if (cards.length === 1) return [{ card_id: cards[0].id }];
  const stronger = ranks.filter(candidate => candidate.rank > turn.predecessorMainRank)
    .sort((first, second) => first.rank - second.rank)[0];
  let substitutions = stronger?.wild || 0;
  return cards.map(card => {
    const useWild = Boolean(card.wildSkill && substitutions);
    if (useWild) substitutions -= 1;
    return { card_id: card.id, wild_num: useWild ? stronger.rank : 0 };
  });
}

export function createPokerSkillActions({ send, publish, getSelfSeat, getLandlord, getHand, getSeats, getSkill, getCurrentOption }) {
  const assignments = new Map();
  const usage = new Map();
  const buffs = new Map();
  const ownPiles = new Map();
  let turn = null;
  let menu = null;
  let pending = null;
  let lastState = '';
  const lastDetails = new Map();

  function effectState(seat, id) {
    return buffs.get(seat)?.get(id) || [];
  }

  function ownHand() {
    return items(getHand()).filter(card => positive(card?.id));
  }

  function actionMatches(kind, optionKey) {
    const current = getCurrentOption();
    return current?.kind === kind && current.optionKey === optionKey;
  }

  function targetSeats(id) {
    const self = getSelfSeat();
    const prior = id === GUAN_XING ? effectState(self, id) : [];
    return ints(getSeats().map(seat => seat?.id), seatValue, 8)
      .filter(seat => (seat !== self || id === 44) && !prior.includes(seat));
  }

  function regularPlan(id, native) {
    const profile = REGULAR.get(id);
    if (!profile || !turn || !actionMatches('play', turn.optionKey)) return null;
    const seat = getSelfSeat();
    if (!assignments.get(seat)?.skills.includes(id) || effectState(seat, 100022).length && !turn.predecessorCount) return null;
    const used = usage.get(seat)?.get(id) ?? 0;
    const limit = usageLimit(native);
    if (limit !== null && used >= limit) return null;
    if (read(() => native.NeedHasDealCardRight) === true && turn.predecessorCount) return null;
    const hand = ownHand();
    const targets = profile.targets ? targetSeats(id) : [];
    if (profile.targets && !targets.length) return null;
    if ((id === 1 || id === 7 || id === 8 || id === 29) && hand.length < 2) return null;
    const rankBoost = id === WU_SHUANG || id === SHUANG_XIONG;
    const increase = rankBoost ? read(() => native.SkillParam1) : null;
    const comparedType = id === WU_SHUANG ? 1 : 2;
    if (rankBoost && (!positive(increase) || (turn.predecessorCount
      && (turn.predecessorType !== comparedType || turn.predecessorMainRank === null)))) return null;
    if (id === QI_MOU && turn.predecessorMainRank === null) return null;
    if (id === LIAN_YING && turn.predecessorCount && (turn.predecessorType < 1000 || turn.predecessorType >= 2000
      || turn.predecessorStart === null)) return null;
    if (profile.predecessor && (!turn.predecessorCount || id === 29 && (turn.predecessorType >= 9000 || hand.length <= turn.predecessorCount))) return null;
    if (profile.exchange && !ownPiles.size) return null;
    const available = profile.position || id === 1 ? hand.slice().sort(comparePokerHandCards) : hand;
    let cards = [];
    if (profile.exchange) {
      cards = [...hand.map(card => ({ ...card, choiceGroup: '手牌' })),
        ...[...ownPiles.values()].map(card => ({ ...card, choiceGroup: '权' }))]
        .filter((card, index, all) => all.findIndex(candidate => candidate.id === card.id) === index);
    }
    else if (profile.position && available.length) {
      const usedPositions = effectState(seat, id);
      const middle = available.length % 2 ? available[Math.floor(available.length / 2)] : null;
      cards = [available[0], middle, available.at(-1)].filter((card, index) => card && !usedPositions[index] && card.rank < 16);
      cards = [...new Map(cards.map(card => [card.id, card])).values()];
    } else if (id === 1) cards = available.slice(0, Math.ceil(available.length / 2));
    else if (profile.cards || profile.predecessor) cards = available;
    if (rankBoost) {
      cards = cards.filter(card => card.rank >= 3 && card.rank < HIGHEST_STRAIGHT_RANK
        && Math.min(HIGHEST_STRAIGHT_RANK, card.rank + increase) > (turn.predecessorMainRank ?? 0));
      if (id === SHUANG_XIONG) {
        cards = cards.filter(card => !card.wildSkill);
        cards = cards.filter(card => cards.some(other => other.id !== card.id && other.rank === card.rank));
      }
    }
    const minimum = profile.exchange ? 2 : profile.predecessor ? turn.predecessorCount : profile.cards?.[0] || 0;
    const maximum = profile.exchange ? 2 : profile.predecessor ? minimum : Math.min(cards.length, profile.cards?.[1] || 0);
    if (cards.length < minimum) return null;
    const choices = [];
    if (profile.types) {
      if (hand.length) choices.push({ id: 1, label: '单张' });
      const ranks = hand.map(card => card.rank);
      if (new Set(ranks).size < ranks.length) choices.push({ id: 2, label: '对子' });
      if (!choices.length) return null;
    }
    return { profile, cards, choices, targets, min: minimum, max: maximum, increase,
      targetMin: profile.targets ? 1 : 0, targetMax: profile.targets ? 1 : 0, hand, seat };
  }

  function projectState() {
    const self = getSelfSeat();
    const skills = (assignments.get(self)?.skills || []).map(id => {
      const native = getSkill?.(id);
      const limit = usageLimit(native);
      const enabled = !menu && !pending && Boolean(regularPlan(id, native));
      const info = { id, enabled };
      const name = read(() => native.Name);
      if (typeof name === 'string' && name) info.name = name;
      if (limit !== null) info.remaining = Math.max(0, limit - (usage.get(self)?.get(id) ?? 0));
      return info;
    });
    const signature = JSON.stringify([self, skills]);
    if (signature !== lastState) {
      lastState = signature;
      publish('skill-state', { seat: self, skills });
    }
    for (const { id: seat } of getSeats()) {
      const details = {
        seat, skills: assignments.get(seat)?.skills ?? [], uses: Object.fromEntries(usage.get(seat) || []),
        marks: Array.from(buffs.get(seat) || [], ([id, values]) => ({ id,
          ...(SEAT_MARKS.get(id)?.parameters && { parameters: values }),
          ...(seat === self && { cards: values }),
        })),
      };
      const stamp = JSON.stringify(details);
      if (lastDetails.get(seat) === stamp) continue;
      lastDetails.set(seat, stamp);
      publish('skill-details', details);
    }
  }

  function setMenu(next) {
    if (!menu && !next) return;
    const previous = menu;
    menu = next;
    if (!next) publish('skill-options', { seat: getSelfSeat(), skill: null, local: previous.local });
    else {
      const { submit, ...publicFields } = next;
      publish('skill-options', publicFields);
    }
    projectState();
  }

  function request(id, body, action) {
    if (pending) return false;
    const optionKey = menu?.optionKey ?? turn?.optionKey;
    pending = { id, optionKey, spell: body.spell_id };
    if (!send(id, body, action)) {
      pending = null;
      return false;
    }
    projectState();
    return true;
  }

  function regularSubmit(id, plan, choice) {
    const cardIds = selection(choice.cardIds ?? [], plan.cards.map(card => card.id), plan.min, plan.max);
    const targets = selection(choice.targetSeats ?? [], plan.targets, plan.targetMin, plan.targetMax);
    if (!cardIds || !targets) return false;
    const effect = plan.profile.types ? choice.option : 0;
    if (plan.profile.types && !plan.choices.some(item => item.id === effect)) return false;
    if (plan.profile.exchange) {
      const fromHand = cardIds.filter(value => plan.hand.some(card => card.id === value));
      const fromPile = cardIds.filter(value => ownPiles.has(value));
      if (fromHand.length !== 1 || fromPile.length !== 1) return false;
      return request(USE, skillBody(id, [...fromHand, ...fromPile]), 'skill-choice');
    }
    const selected = cardIds.map(value => plan.cards.find(card => card.id === value));
    if (id === LIAN_YING || id === QI_MOU) {
      const put = id === LIAN_YING ? lianYingCards(selected, turn.predecessorStart) : qiMouCards(selected, turn);
      return Boolean(put && request(USE, skillBody(id, [], [], put), 'skill-choice'));
    }
    if (id === SHUANG_XIONG && selected[0].rank !== selected[1].rank) return false;
    const put = plan.profile.put ? selected.map(card => {
      const payload = { card_id: card.id };
      if (id === 5 || id === 18) Object.assign(payload, { wild_num: 0, spell_num: 0, spell_suit: 0 });
      if (plan.increase) {
        payload.wild_num = 0;
        payload.spell_num = Math.min(HIGHEST_STRAIGHT_RANK, card.rank + plan.increase);
      }
      return payload;
    }) : [];
    return request(USE, skillBody(id, plan.profile.put ? [] : cardIds, targets, put, effect), 'skill-choice');
  }

  function activateSkill(id) {
    if (pending || menu) return false;
    const native = getSkill?.(id);
    const plan = regularPlan(id, native);
    if (!plan) return false;
    if (!plan.min && !plan.targetMin && !plan.choices.length) return request(USE, skillBody(id), 'skill');
    setMenu({
      seat: plan.seat, skill: id, name: read(() => native.Name), optionKey: turn.optionKey, index: turn.index, local: true,
      kind: plan.min ? 'cards' : plan.targetMin ? 'targets' : 'choices', cards: plan.cards, targets: plan.targets,
      min: plan.min, max: plan.max, targetMin: plan.targetMin, targetMax: plan.targetMax, choices: plan.choices, canCancel: true,
      ...(plan.min > 0 && !plan.profile.exchange && { fromHand: true }),
      ...(plan.profile.position && { copyCard: true, prompt: '请选择一张手牌复制' }),
      ...(id === GUAN_XING && { prompt: read(() => native.ActiveTip) }),
      ...(plan.profile.exchange && { title: '权计 · 各选一张手牌和权', requiredGroups: ['手牌', '权'] }),
      submit: choice => {
        const current = regularPlan(id, native);
        return Boolean(current && regularSubmit(id, current, choice));
      },
    });
    return true;
  }

  function submitSkillChoice(choice) {
    if (!menu || pending || !choice || choice.optionKey !== menu.optionKey
      || !actionMatches(menu.local ? 'play' : 'skill', menu.optionKey)) return false;
    if (choice.cancel === true) {
      if (!menu.canCancel) return false;
      if (!menu.local) return request(CANCEL, {}, 'skill-choice');
      setMenu(null);
      return true;
    }
    return menu.submit(choice);
  }

  function offerServer(data) {
    const index = data.opt_index;
    const optionKey = keyFor(index);
    const seat = getSelfSeat();
    if (!optionKey || ((data.opt_seat ?? 0) !== seat && !items(data.opt_seat_list, 8).includes(seat))
      || !actionMatches('skill', optionKey)) return;
    const type = data.opt_type;
    const skill = type === 1 ? data.data_use_skill?.spell_id : data.spell_id;
    const effect = data.data_use_skill?.spell_effect ?? 0;
    const native = getSkill?.(skill);
    const hideFaces = read(() => native.WatchCardWindowHideCardColorAndNumber);
    const supplied = faces(data.data_cards);
    const targets = ints(data.targets, seatValue, 8);
    const options = ints(data.options, Number.isSafeInteger, 36);
    const base = { seat, index, optionKey, skill: skill || 0, name: read(() => native.Name), local: false, canCancel: type === 1, min: 0, max: 0 };
    const choose = (picked, optType, spellId) => request(CHOOSE, {
      options: picked,
      ...(optType !== undefined && { opt_type: optType }),
      ...(positive(spellId) && { spell_id: spellId }),
    }, 'skill-choice');
    const trigger = (cards, chosenTargets) => request(USE, skillBody(skill, cards, chosenTargets, [], effect), 'skill-choice');

    function publicCards(candidates) {
      const own = new Set([...ownHand().map(card => card.id), ...ownPiles.keys()]);
      const occupied = new Set(candidates.map(card => card.id));
      let nextOpaque = 1;
      return candidates.map(card => {
        if (!supplied.includes(card) || hideFaces === false || (hideFaces !== true && own.has(card.id))) return card;
        while (occupied.has(nextOpaque)) nextOpaque += 1;
        return { id: nextOpaque++, hidden: true, face: '暗牌' };
      });
    }
    function offerCards(candidates, min, max, submit, { canCancel = base.canCancel, fromHand = false } = {}) {
      const copyCard = type === 2 && skill === GUAN_XING;
      const cards = (fromHand ? candidates : publicCards(candidates)).map((card, index) =>
        copyCard && candidates[index].baseRank >= 16 ? { ...card, disabled: true } : card);
      const ids = cards.filter(card => !card.disabled).map(card => card.id);
      if (!cards.length || !copyCard && ids.length < min
        || new Set(candidates.map(card => card.id)).size !== cards.length) return false;
      const maximum = Math.min(max, ids.length);
      setMenu({ ...base, kind: 'cards', cards, min, max: maximum, canCancel,
        ...(fromHand && { fromHand }),
        ...(copyCard && { copyCard }),
        submit(choice) {
          const picked = selection(choice.cardIds, ids, min, maximum);
          if (!picked) return false;
          if (fromHand) {
            const current = ownHand().map(card => card.id);
            return picked.every(id => current.includes(id)) && Boolean(submit(picked));
          }
          return Boolean(submit(picked.map(id => candidates[cards.findIndex(card => card.id === id)].id)));
        } });
      return true;
    }
    function offerTargets(allowed, submit, canCancel = base.canCancel) {
      if (!allowed.length) return false;
      setMenu({ ...base, kind: 'targets', targets: allowed, targetMin: 1, targetMax: 1, canCancel,
        submit(choice) {
          const picked = selection(choice.targetSeats, allowed, 1, 1);
          return Boolean(picked && submit(picked));
        } });
      return true;
    }
    function offerChoices(choices, submit, canCancel = base.canCancel, kind = 'choices') {
      setMenu({ ...base, kind, choices, canCancel,
        submit(choice) {
          const option = choice.option ?? (choices.length === 1 ? choices[0].id : null);
          return choices.some(item => item.id === option && item.enabled !== false) && submit(option);
        } });
    }
    function offerTrigger(submit) {
      base.askToTrigger = true;
      offerChoices([confirmAction], submit, true, 'confirm');
    }
    if (type === 1 && TRIGGER_CARD_COUNTS.has(skill)) {
      const [min, max] = TRIGGER_CARD_COUNTS.get(skill);
      if (skill === 26 && supplied.length === 1) {
        offerTrigger(() => trigger([supplied[0].id], []));
        return;
      }
      const hand = ownHand();
      const fromHand = supplied.every(candidate => hand.some(card => card.id === candidate.id && !candidate.virtual));
      if (offerCards(supplied.length ? supplied : hand, min, max, picked => trigger(picked, []), { fromHand })) return;
    }
    if (type === 1 && TRIGGER_TARGETS.has(skill)
      && offerTargets(targets.length ? targets : targetSeats(skill), picked => trigger([], picked))) return;
    if (type === 1 && TRIGGER_CONFIRM.has(skill)) {
      offerTrigger(() => trigger([], []));
      return;
    }
    if (type === 2 && CARD_CHOICES.has(skill)) {
      const count = CARD_CHOICES.get(skill);
      if (offerCards(supplied, count, count, picked => choose(picked))) return;
    }
    if (type === 3 && skill === QIANG_YI) {
      if (options[0] === 1 && offerTargets(targets.length ? targets : targetSeats(skill), picked => choose(picked, 1, skill), false)) return;
      if (options[0] === 2) {
        base.giveFromHand = true;
        base.prompt = '请选择一张手牌交给对方';
        if (offerCards(ownHand(), 1, 1, picked => choose(picked, 2, skill), { canCancel: false, fromHand: true })) return;
      }
    }
    if (type === 3 && skill === 49 && offerTargets(targets.length ? targets : targetSeats(skill), picked => choose(picked, 1), false)) return;
    if (type === 3 && skill === 41 && offerCards(ownHand().filter(card => card.rank < 16 && !card.wild), 1, 1,
      picked => choose(picked), { canCancel: false, fromHand: true })) return;
    if (type === 3 && skill === 37) {
      const count = read(() => native.SkillParam2) || 1;
      if (offerCards(ownHand(), count, count, picked => choose(picked), { canCancel: false, fromHand: true })) return;
    }
    if (type === 3 && skill === 29) {
      offerChoices([{ id: 1, label: '质疑' }], option => choose([option]), true, 'confirm');
      return;
    }
    if (type === 6 && data.options?.length === 2 && data.options[0] === 0 && data.options[1] === 1
      && !data.data_cards?.length) {
      if (seat !== (data.opt_seat ?? 0) || seat !== getLandlord()) return;
      const canReveal = !data.params?.length || data.params[0] === 1;
      const minimum = data.params?.[1];
      base.title = base.name = '明牌加倍';
      if (!canReveal) base.reason = positive(minimum) ? `欢乐豆不足 ${minimum}` : '暂不能明牌加倍';
      offerChoices([{ id: 0, label: '不明牌' }, { id: 1, label: '明牌加倍', enabled: canReveal }],
        option => choose([option], 6), false);
      return;
    }
    setMenu({ ...base, kind: 'unsupported', canCancel: false, reason: '当前版本尚未识别此技能选项', submit: () => false });
  }

  function updateGenerals(data) {
    for (const row of items(data?.notify_generals, 8)) {
      const seat = row?.seat_id ?? 0;
      const general = items(row?.generals, 4)[0];
      if (!seatValue(seat) || !positive(general?.id)) continue;
      const prior = assignments.get(seat);
      const skills = ints(general.skills, positive, 24);
      assignments.set(seat, { general: general.id, skills: skills.length || prior?.general !== general.id ? skills : prior.skills });
    }
  }

  function updatePlayers(data) {
    for (const row of items(data?.datas, 8)) {
      const seat = row?.seat_id ?? 0;
      if (!row || !seatValue(seat)) continue;
      const counts = usage.get(seat) || new Map();
      for (const count of items(row.skillCnts, 30)) if (positive(count?.k)) counts.set(count.k, count.v ?? 0);
      usage.set(seat, counts);
      // Each reported seat gets a complete buff list, including an omitted empty list.
      const states = new Map();
      for (const buff of items(row.skillDatas, 30)) if (positive(buff?.skill)) states.set(buff.skill, items(buff.datas));
      buffs.set(seat, states);
    }
  }

  function updateDrawMarks(data) {
    const from = data.from_zone_info;
    const to = data.to_zone_info;
    const self = getSelfSeat();
    if (data.spell_id !== KU_ROU || data.move_type !== MOVE_DRAW || from && from.zone_type !== POKER_ZONE.DECK
      || to?.zone_type !== POKER_ZONE.HAND || (to.seat_id ?? 0) !== self) return;
    const cards = faces(data.card_ids).filter(card => !card.virtual).map(card => card.id);
    if (!cards.length) return;
    const states = buffs.get(self) || new Map();
    states.set(KU_ROU_CARDS, [...new Set([...(states.get(KU_ROU_CARDS) || []), ...cards])]);
    buffs.set(self, states);
  }

  function updatePile(data, snapshot = false) {
    const from = data.from_zone_info;
    const to = data.to_zone_info;
    const own = place => place?.zone_type === POKER_ZONE.OUTSIDE && (place.seat_id ?? 0) === getSelfSeat();
    const cards = faces(data.card_ids);
    if (own(from) && !snapshot) for (const card of cards) ownPiles.delete(card.id);
    const place = snapshot ? from : to;
    if (!own(place) || (data.spell_id ?? data.skill_id) !== 47) return;
    for (const card of cards) ownPiles.set(card.id, card);
  }

  function clearPrompt() {
    turn = pending = null;
    setMenu(null);
    projectState();
  }

  function accept(id, protocol) {
    if (protocol?.Id !== id) return;
    const data = protocol.Data?.ProtoObj ?? protocol.ProtoObj;
    if (!data) return;
    switch (id) {
      case 201001: {
        const optionKey = keyFor(data.opt_index);
        if (optionKey === turn?.optionKey && menu?.local) return;
        const predecessor = items(data.predecessor_cards);
        const ranks = predecessor.map(card => cardFace(card?.card_id ?? 0, card?.suit, card?.num, card?.wild_num).rank);
        const type = data.predecessor_typ || 0;
        const predecessorMainRank = qiMouRanks(ranks.map(rank => ({ rank })), type)[0]?.rank ?? null;
        turn = (data.opt_seat ?? 0) === getSelfSeat() && optionKey
          ? { optionKey, index: data.opt_index, predecessorCount: predecessor.length,
            predecessorType: type, predecessorStart: consecutiveStart(ranks), predecessorMainRank } : null;
        pending = null;
        setMenu(null);
        break;
      }
      case 201005:
        updateDrawMarks(data);
        updatePile(data);
        break;
      case 201013:
        updateGenerals(data);
        break;
      case 201025:
        if (data.is_all === true && data.spell_id === 47 && data.from_zone_info?.zone_type === POKER_ZONE.OUTSIDE
          && (data.from_zone_info.seat_id ?? 0) === getSelfSeat()) {
          ownPiles.clear();
          updatePile(data, true);
        }
        break;
      case 201024:
      case 201028:
      case 201032: {
        if (pending?.id !== ({ 201024: CANCEL, 201028: USE, 201032: CHOOSE })[id]) return;
        const key = keyFor(data.req_msg?.opt_index ?? data.opt_index);
        if (key && key !== pending.optionKey) return;
        pending = null;
        if (!data.result_id && !protocol.errCode) setMenu(null);
        break;
      }
      case 201029: {
        const seat = data.seat ?? 0;
        if (!seatValue(seat) || !positive(data.spell_id)) return;
        const counts = usage.get(seat) || new Map();
        if (Number.isSafeInteger(data.cnt)) counts.set(data.spell_id, data.cnt);
        usage.set(seat, counts);
        if (positive(data.data?.skill)) {
          const states = buffs.get(seat) || new Map();
          states.set(data.data.skill, items(data.data.datas));
          buffs.set(seat, states);
        }
        if (seat === getSelfSeat() && data.is_use === true && pending?.id === USE && pending.spell === data.spell_id) {
          pending = null;
          setMenu(null);
        }
        break;
      }
      case 201030: {
        if (menu?.optionKey === keyFor(data.opt_index) && !menu.local) return;
        turn = pending = null;
        setMenu(null);
        offerServer(data);
        break;
      }
      case 201034:
        updatePlayers(data);
        break;
      case 201035:
        updateGenerals(data.general_data);
        buffs.clear();
        updatePlayers(data.player_data);
        ownPiles.clear();
        for (const row of items(data.zone_data, 128)) updatePile(row, true);
        break;
      case 201037: {
        const current = assignments.get(data.seat_id ?? 0);
        if (current && data.typ === 1) {
          const added = items(data.skill_data, 24).filter(row => row?.k === current.general).map(row => row.v).filter(positive);
          current.skills = [...new Set([...current.skills, ...added])];
        }
        break;
      }
    }
    projectState();
  }

  return { accept, activateSkill, submitSkillChoice, clearPrompt, reset() {
    assignments.clear();
    usage.clear();
    buffs.clear();
    ownPiles.clear();
    lastDetails.clear();
    clearPrompt();
  } };
}
