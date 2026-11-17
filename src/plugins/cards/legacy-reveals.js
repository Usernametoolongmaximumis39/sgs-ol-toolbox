/** Native _qi/y1t card observations, not generic interpretation of choice data.
 * Evidence: client-static/sgsGame_a.js classes listed beside each branch;
 * legacy nW/nZ supplies the comparison inventory, never the validation rules.
 */
const seat = value => Number.isInteger(value) && value >= 0 && value < 255;
const ids = values => Array.isArray(values) && values.length > 0 && values.length <= 200 &&
  values.every(id => Number.isInteger(id) && id > 0 && id < 0xffff) && new Set(values).size === values.length;
const count = value => Number.isInteger(value) && value >= 0 && value <= 200;
const TARGET_TYPES = new Map([
  [4, 1], [5, 1], [921, 28], [372, 29], [811, 29], [357, 28],
  [3119, 28], [501, 3], [3437, 29], [851, 28], [361, 29],
]);
const ZERO_PARAM = new Set([851, 361]);

function countedGroups(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const [pileCount, handCount] = values;
  if (!count(pileCount) || !count(handCount) || values.length !== 2 + pileCount + handCount) return null;
  const pile = values.slice(2, 2 + pileCount), hand = values.slice(2 + pileCount);
  if (pile.length && !ids(pile) || hand.length && !ids(hand) || new Set([...pile, ...hand]).size !== pile.length + hand.length) return null;
  return { pile, hand, pileCount, handCount };
}

export function legacyReveal(state, data, seq, api) {
  if (!data || data.isSend) return false;
  const { reveal, zone, locate, zoneKey } = api;
  const eventType = api.eventType || state.lastEvent;
  const skill = data.SpellID, type = data.Type, target = data.TargetSeatID ?? data.targetSeatID;
  const params = data.Params, datas = data.Datas;
  const hand = (values, owner, complete = false) => {
    if (!seat(owner) || !ids(values)) return false;
    reveal(state, values, zoneKey(5, owner), seq, complete ? values.length : undefined, complete);
    return true;
  };
  const pile = (values, side) => {
    if (!ids(values)) return false;
    const key = zoneKey(1), record = zone(state, key);
    for (const id of values) locate(state, id, key, seq);
    record.order = [...new Set([...record.order, ...values])];
    if (side) {
      record[side] = values.slice();
      const other = side === 'top' ? 'bottom' : 'top';
      record[other] = record[other].filter(id => !values.includes(id));
    }
    record.count = Math.max(record.count, values.length);
    return true;
  };

  if (eventType === 'GsCRoleOptTargetNtf') {
    // SelectCardWindow (ShowHands), PoXiCardWindow, WeiKuiWindow and the
    // skill-specific WatchCardWindow responders each consume these ID lists.
    if (TARGET_TYPES.get(skill) === type && (!ZERO_PARAM.has(skill) || data.Param === 0)) {
      return hand(params, target);
    }
    // WangXi3.SpecialCardIDs are the operating player's newly drawn choices,
    // not the recipient's hand. The legacy target-hand attribution is wrong.
    if (skill === 3310 && type === 28 && data.Param === 0) return hand(params, data.SeatID);
    // HuiSheng's source chooses arbitrary hand AND equipped cards. Preserve a
    // known equipment location, and retain hand/equipment ambiguity otherwise.
    if (skill === 774 && type === 30 && data.Param === 0 && seat(data.SrcSeatID) && ids(params)) {
      const keys = [zoneKey(5, data.SrcSeatID), zoneKey(6, data.SrcSeatID)];
      for (const id of params) {
        const previous = state.cards[id];
        const locations = previous?.locations?.length === 1 && keys.includes(previous.locations[0]) ? previous.locations.slice() : keys.slice();
        state.cards[id] = { ...(previous || { id, tags: [] }), locations, lastSeq: seq, seen: true };
      }
      return true;
    }
    // ZeXing's second flag exposes a target hand; its move correlation remains
    // owned by the reducer and must not be confused with arbitrary flag data.
    if (skill === 3854 && type === 29) return hand(params, target);
    if (skill === 943 && type === 28 && data.Param === 0 && params?.length === 1) return pile(params, 'top');
    // SanWen: the first count covers the caster's newly revealed cards. The
    // suffix is used in a prompt and is deliberately not attributed to hand.
    if (skill === 898 && type === 28 && data.Param === 0 && Array.isArray(params) &&
        count(params[0]) && params[0] > 0 && params.length > params[0] && params.length <= 401) {
      return hand(params.slice(1, 1 + params[0]), data.SrcSeatID);
    }
    // GuanXuWindow / TianHou2025Window: [pileCount, handCount, ...pile, ...hand].
    if (([987, 988].includes(skill) && type === 29 || [3483, 3903].includes(skill) && type === 28) &&
        ([987, 988, 3483].includes(skill) ? data.Param === 1 : data.Param === 0)) {
      const groups = countedGroups(params);
      if (!groups) return false;
      if (groups.hand.length && !seat(target)) return false;
      // All unmasked identities received locally are observations. Record both
      // halves; do not infer ownership from masked zeros or an incomplete list.
      if (groups.pile.length) pile(groups.pile, 'top');
      if (groups.hand.length) hand(groups.hand, target, true);
      state.pending ||= {};
      state.pending[`legacyExchange:${skill}:${data.SrcSeatID}`] = {
        skill, turn: state.turn, target, pile: groups.pile, hand: groups.hand, seq,
      };
      return true;
    }
    // GuanGu virtual-card data starts with a control value, followed by exact
    // [cardId, skillId, property] triples. Only the first entry of each triple
    // is a card ID; neither skill IDs nor properties are observations.
    if (skill === 3266 && type === 29 && data.Param === 0 && data.SrcSeatID === state.selfSeatId &&
        Array.isArray(params) && params.length >= 4 && (params.length - 1) % 3 === 0 &&
        params.length <= 13 && Number.isInteger(params[0])) {
      const values = params.filter((_, index) => index % 3 === 1);
      if (target === 255) return pile(values);
      return hand(values, target);
    }
    // XiongZhi/QuanBian explicitly reveal pile candidates but do not establish
    // the order of the remaining pile. Never turn the display list into top.
    if ([7010, 7011].includes(skill) && type === 28 && target === 255 && ids(params)) {
      state.pending ||= {};
      state.pending.legacyYingshi = { turn: state.turn, remaining: params.length * 2, seq };
      return data.SrcSeatID === state.selfSeatId ? pile(params) : true;
    }
    // YanXi's three cards comprise exactly one target hand card and two pile
    // cards. Keep unresolved candidates as a union, rather than guessing that
    // the first displayed card belongs to the hand.
    if ([7016, 7017].includes(skill) && type === 28 && data.SrcSeatID === state.selfSeatId &&
        seat(data.Param) && params?.length === 3 && ids(params)) {
      const handKey = zoneKey(5, data.Param), pileKey = zoneKey(1);
      const at = (id, key) => state.cards[id]?.locations?.length === 1 && state.cards[id].locations[0] === key && state.cards[id].seen;
      let knownHand = params.filter(id => at(id, handKey)), knownPile = params.filter(id => at(id, pileKey));
      if (knownPile.length === 2) knownHand = params.filter(id => !knownPile.includes(id));
      if (knownHand.length === 1) knownPile = params.filter(id => !knownHand.includes(id));
      const resolved = knownHand.length === 1 && knownPile.length === 2;
      for (const id of params) {
        const previous = state.cards[id];
        const locations = resolved ? [knownHand.includes(id) ? handKey : pileKey] : [handKey, pileKey];
        state.cards[id] = { ...(previous || { id, tags: [] }), locations, lastSeq: seq, seen: true };
      }
      state.pending ||= {};
      state.pending[`legacyCandidates:${skill}:${data.SrcSeatID}`] = {
        skill, target: data.Param, turn: state.turn, seq, ids: params.slice(),
        hand: resolved ? knownHand : [], pile: resolved ? knownPile : [],
      };
      return true;
    }
    return false;
  }
  if (eventType !== 'CGsRoleSpellOptRep') return false;
  // OPT_HAND_CARDS is a generic incoming public hand reveal result.
  if (type === 48) return hand(datas, data.SeatID);
  // GameManager handles this before skill dispatch and stores exactly these
  // cards in HandShowCards (OPT_JIEWU_SEAT_CARDS = 61).
  if (skill === 3659 && type === 61) return hand(datas, data.SeatID);
  if (skill === 3868 && [30, 50].includes(type)) return pile(datas, 'top');
  if (skill === 3336 && [30, 50].includes(type) && ids(datas)) return pile(datas.slice().reverse(), 'bottom');
  if (skill === 7009 && [30, 50].includes(type) && ids(datas)) {
    state.pending ||= {};
    const pending = state.pending.legacyYingshi;
    if (!pending || pending.turn !== state.turn) return pile(datas, 'top');
    pending.remaining -= 1;
    if (pending.remaining <= 0) { delete state.pending.legacyYingshi; return pile(datas, 'top'); }
    return true;
  }
  return false;
}
