// Correlation state is reducer-owned and JSON serializable. No protocol is sent.
const TOP = 0xff00, BOTTOM = 0, UNKNOWN = 0xff02;
const TEMP_SKILLS = new Set([987, 988, 3483, 3208, 3776, 3903, 7011]);
const idsOf = values => Array.isArray(values) && values.length <= 2000 && values.every(v => Number.isInteger(v) && v > 0 && v < 65535) && new Set(values).size === values.length ? values.slice() : [];
const seat = value => Number.isInteger(value) && value >= 0 && value < 255;
function memory(state) {
  state.pending ||= {};
  const epoch = `${state.sessionId}:${state.turn}`;
  let m = state.pending.legacy;
  if (!m || m.epoch !== epoch) state.pending.legacy = m = { epoch, session: state.sessionId, jianzhi: {}, colors: {}, judgments: {}, zuolian: {}, temp: {}, yanxi: {}, qie: {}, qi: m?.session === state.sessionId ? m.qi : {}, qiReady: m?.session === state.sessionId && m.qiReady, qiIds: m?.session === state.sessionId ? m.qiIds : undefined, moveIndex: 0 };
  return m;
}
const exact = (state, id, key) => state.cards[id]?.locations?.length === 1 && state.cards[id].locations[0] === key;
const members = (state, key) => Object.values(state.cards).filter(c => exact(state, c.id, key)).map(c => c.id);
const suit = (state, id) => Number(state.cardMeta?.[id]?.suit ?? state.cardMeta?.[id]?.color);
function present(state, values, key) { return values.length > 0 && values.every(id => exact(state, id, key)); }
function applyQiOwners(state, m, h) {
  if (!m.qiReady) return;
  for (const [owner, values] of Object.entries(m.qi)) for (const id of values) {
    const c = state.cards[id];
    if (c && (!m.qiIds?.length || m.qiIds.includes(id)) && exact(state, id, h.zoneKey(5, Number(owner)))) {
      c.qiOwner = Number(owner);
      if (!c.tags.includes('炁')) c.tags.push('炁');
    }
  }
}
function traceUpdate(trace, values) {
  if (!trace || !trace.valid || !Array.isArray(values)) return;
  if (values.length === 1) { trace.closed = true; return; }
  const [from, to, logical] = values;
  const size = trace.original.length;
  if (values.length !== 3 || !values.every(Number.isInteger) || from < 0 || to < 0 || from >= size * 2 || to >= size * 2 || logical < 0) { trace.valid = false; return; }
  const id = trace.logical[from];
  if ([987, 988].includes(trace.skill)) {
    // GuanXu exchanges one external hand slot with one pile slot. It does
    // not reorder the logical list like a GuanXing drag operation.
    let selected, destination;
    if (!id && to < size) {
      selected = trace.original.find(card => trace.grid[card] === to) ||
        (trace.displaced?.length === 1 ? trace.displaced[0] : undefined);
      destination = from;
    } else if (id && trace.grid[id] < size && to >= size) {
      selected = id; destination = to;
    }
    if (selected) {
      for (const previous of trace.displaced || []) if (previous !== selected)
        trace.grid[previous] = trace.original.indexOf(previous);
      trace.displaced = [selected]; trace.grid[selected] = destination;
    }
    trace.seen = true; return;
  }
  // An external hand card is not known merely because its slot is known.
  if (!id) {
    const displaced = trace.original.find(card => trace.grid[card] === to);
    if (displaced) { trace.grid[displaced] = from; trace.displaced = [displaced]; }
    trace.seen = true; return;
  }
  const old = trace.grid[id], swapped = trace.original.find(card => trace.grid[card] === to);
  if (swapped) trace.grid[swapped] = old;
  else if ((old < size) !== (to < size)) {
    for (const other of trace.original) if (other !== id && (trace.grid[other] < size) === (old < size) && trace.grid[other] > old)
      trace.grid[other]--;
  }
  trace.grid[id] = to;
  trace.logical.splice(from, 1); trace.logical.splice(logical % size, 0, id);
  trace.seen = true;
}

/** Call once for each normalized incoming event, before the normal reducer. */
export function legacyEvent(state, data, seq, type, h) {
  if (data?.isSend) return;
  const m = memory(state), skill = Number(data.SpellID), who = Number(data.SeatID);
  if (type === 'GsCUpdateRoleDataExNtf') {
    if (!data.IsSpell || !seat(who)) return;
    const id = Number(data.DataID), value = data.Datas?.[0];
    if (id === 3652) {
      delete m.jianzhi[who];
      if (Number.isInteger(value) && value >= 0 && (value & ~30) === 0) m.jianzhi[who] = { mask: value, cards: null };
    } else if (id === 3653) { if (m.jianzhi[who]) m.jianzhi[who].cards = null; }
    else if (id === 3571 && [1, 2].includes(value)) m.colors[who] = value;
  }
  if (type === 'PubGsCUseSpell') {
    if (skill === 3653 && Number(data.EffectIndex) === 0 && m.jianzhi[who]) {
      m.jianzhi[who].cards = m.jianzhi[who].mask ? [] : null;
      delete m.jianzhi[who].remaining;
    }
    if (skill === 3571 && Number(data.EffectIndex) === 1 && seat(who)) m.judgments[who] = [];
    if (skill === 361 && seat(who)) {
      delete m.xiashu;
      const dest = idsOf(data.DestSeatIDs?.map(v => v + 1)).map(v => v - 1);
      if (dest.length === 1 && seat(dest[0]) && dest[0] !== who) m.xiashu = { caster: who, target: dest[0], shown: [], choice: 0 };
    }
    if ([3730, 3731].includes(skill) && seat(who) && Array.isArray(data.DestSeatIDs) && data.DestSeatIDs.length === 1 && seat(data.DestSeatIDs[0])) m.qiTransfer = { victim: data.DestSeatIDs[0], recipient: who, moveIndex: m.moveIndex };
  }
  if (type === 'CGsRoleSpellOptRep') {
    if (skill === 361 && Number(data.Type) === 22 && who === m.xiashu?.caster && [1, 2].includes(data.Datas?.[0])) m.xiashu.choice = data.Datas[0];
    const trace = Object.values(m.temp).find(t => t.actor === who && t.skill === skill);
    if (Number(data.Type) === 12) traceUpdate(trace, data.Datas);
    // The global reconnect result supplies explicit public qi identities.
    if (skill === 0 && Number(data.Type) === 72) { const qiIds = idsOf(data.Datas); m.qiReady = qiIds.length > 0; m.qiIds = qiIds; for (const id of qiIds) {
      state.cards[id] ||= { id, locations: ['?'], tags: [], seen: true, lastSeq: seq };
      if (!state.cards[id].tags.includes('炁')) state.cards[id].tags.push('炁');
    } applyQiOwners(state, m, h); }
  }
  if (type === 'MsgClientOperateInGameNtf' && Number(data.Type) === 0 && Number(data.MsgID) === 13) {
    const traces = Object.values(m.temp).filter(t => t.actor === who && t.original.some(id => !t.returned.includes(id)));
    if (traces.length === 1) traceUpdate(traces[0], data.MData);
  }
  if (type === 'GsCRoleOptTargetNtf' && [7016, 7017].includes(skill) && Number(data.SrcSeatID) === state.selfSeatId) {
    const validated = state.pending[`legacyCandidates:${skill}:${data.SrcSeatID}`];
    const values = validated?.turn === state.turn ? idsOf(validated.ids) : [], target = Number(validated?.target);
    if (values.length === 3 && seat(target)) {
      const handKey = h.zoneKey(5, target), pile = state.zones[h.zoneKey(1)];
      const knownHand = values.filter(id => exact(state, id, handKey)), knownPile = values.filter(id => pile?.top?.slice(0, 2).includes(id));
      const handCandidates = values.filter(id => !knownPile.includes(id));
      m.yanxi[skill] = { values, target, knownHand, handCandidates };
      if (handCandidates.length === 1) h.reveal(state, handCandidates, handKey, seq);
    }
  }
  if (type === 'ClientHappyGetFriendHandcardRep') {
    const target = Number(data.SeatID ?? data.seatId), values = idsOf(data.CardIDs ?? data.Cards);
    if ((data.error_id === undefined || [0, 1].includes(Number(data.error_id))) && seat(target) && values.length && state.turn <= 1 && (state.phase === null || state.phase === 0)) {
      m.qi[target] = values;
      for (const id of m.qiReady ? values.filter(id => !m.qiIds?.length || m.qiIds.includes(id)) : []) {
        h.locate(state, id, h.zoneKey(5, target), seq, '炁');
        state.cards[id].qiOwner = target;
      }
    }
  }
  if ([3730, 3731].includes(skill)) {
    m.qiReady = true;
    applyQiOwners(state, m, h);
  }
  if (type === 'SmsgGamePlayerDead') {
    const victim = Number(data.SeatID), recipient = Number(data.MurSeatID ?? data.MurderSeatID);
    if (seat(victim)) m.qiDeath = { victim, recipient: seat(recipient) ? recipient : null, moveIndex: m.moveIndex };
  }
}

/** Returns only identities supported by the complete local correlation chain. */
export function legacyBeforeMove(state, data, seq, h) {
  if (data?.isSend) return {};
  const m = memory(state), skill = Number(data.SpellID), from = Number(data.FromZone), to = Number(data.ToZone), count = Number(data.CardCount);
  const fromSeat = Number(data.FromID), toSeat = Number(data.ToID), actor = Number(data.SrcSeatID), move = Number(data.MoveType);
  const supplied = idsOf(data.CardIDs), fromKey = h.zoneKey(from, fromSeat, data.FromZoneParam);
  const result = {};
  m.moveIndex++;
  if (m.jieliDeferred && m.moveIndex - m.jieliDeferred.moveIndex > 1) delete m.jieliDeferred;
  if (!Number.isInteger(count) || count <= 0 || count > 2000) return result;
  const candidate = values => { if (values?.length === count && present(state, values, fromKey)) result.ids = values.slice(); };
  if (skill === 3694 && from === 0 && to === 1 && Number(data.ToPosition) === TOP + 1 && move === 19) return { ids: [], position: UNKNOWN, destination: UNKNOWN, hiddenCreation: true };
  if (from === to && fromSeat === toSeat && (skill === 7011 && move === 19 || skill === 3744 && move === 21)) return { suppressReveal: true };
  if (skill === 361 && m.xiashu && from === 5 && to === 5 && fromSeat === m.xiashu.target) {
    const x = m.xiashu;
    if (toSeat === fromSeat && move === 21 && supplied.length === count) x.shown = supplied;
    if (toSeat === x.caster && move === 18) {
      delete m.xiashu;
      if ([1, 2].includes(x.choice) && x.shown.length && present(state, x.shown, fromKey)) {
        if (x.choice === 1) candidate(x.shown);
        else {
          const all = members(state, fromKey);
          if (state.zones[fromKey]?.count === all.length) candidate(all.filter(id => !x.shown.includes(id)));
        }
      }
    }
  }
  if (skill === 3653 && from === 2 && to === 5 && [8, 15].includes(move)) {
    const x = m.jianzhi[actor];
    if (x?.cards) {
      if (x.remaining === undefined) x.remaining = x.cards.filter(id => x.mask & (1 << suit(state, id)));
      if (x.cards.every(id => [1, 2, 3, 4].includes(suit(state, id)))) {
        if (supplied.length) {
          if (supplied.every(id => x.remaining.includes(id))) x.remaining = x.remaining.filter(id => !supplied.includes(id));
          else x.cards = null;
        } else if (count === x.remaining.length) { candidate(x.remaining); x.cards = null; }
        // A proper subset has a known candidate set, not an ordered identity list.
      }
    }
  }
  if (skill === 3571 && from === 8 && to === 5 && move === 8) {
    const color = m.colors[toSeat], colors = color === 1 ? [1, 2] : color === 2 ? [3, 4] : [];
    candidate((m.judgments[toSeat] || []).filter(id => colors.includes(suit(state, id))));
    delete m.judgments[toSeat];
  }
  if (skill === 3488) {
    if (from === 5 && to === 10 && move === 11 && !supplied.length) {
      const id = m.zuolian[fromSeat]; if (id) { candidate([id]); m.zuolianStack = result.ids?.[0]; }
    } else if (from === 10 && [1, 2].includes(to) && move === 11 && !supplied.length) { candidate([m.zuolianStack]); delete m.zuolianStack; }
  }
  if (skill === 780 && from === 5 && to === 1 && fromSeat !== state.currentSeatId && Number(data.FromPosition) === UNKNOWN && count === 1) {
    const id = m.wengua?.[fromSeat]; if (id) candidate([id]);
    if (m.wengua) delete m.wengua[fromSeat];
  }
  if (skill === 3543 && from === 2 && to === 1 && !supplied.length) {
    const order = state.zones[fromKey]?.order || [];
    // Every card must have a known color: otherwise an unseen red card could intervene.
    if (state.zones[fromKey]?.count === order.length && order.every(id => [1, 2, 3, 4].includes(suit(state, id)))) candidate(order.filter(id => [1, 2].includes(suit(state, id))).reverse().slice(0, count));
  }
  if ([7016, 7017].includes(skill) && to === 5 && count === 1 && actor === state.selfSeatId) {
    const x = m.yanxi[skill];
    if (x) {
      if (supplied.length) x.values = x.values.filter(id => !supplied.includes(id));
      else if (from === 5 && fromSeat === x.target) candidate(x.handCandidates.filter(id => x.values.includes(id)));
      else if (x.values.length === 1) candidate(x.values);
      if (result.ids) x.values = x.values.filter(id => !result.ids.includes(id));
    }
  }
  if ([3730, 3731].includes(skill) && from !== 2 && to === 5 && fromSeat !== toSeat) m.qiTransfer = { victim: fromSeat, recipient: toSeat, moveIndex: m.moveIndex };
  if (m.qiReady && from === 2 && to === 5 && !supplied.length) {
    const relation = [m.qiTransfer, m.qiDeath].find(x => x && x.recipient === toSeat && m.moveIndex - x.moveIndex <= 1);
    if (relation) {
      const values = members(state, fromKey).filter(id => state.cards[id].qiOwner === relation.victim);
      candidate(values);
      delete m.qiTransfer; delete m.qiDeath;
    }
  }
  if (TEMP_SKILLS.has(skill) && [8, 10].includes(from)) {
    const trace = m.temp[`${actor}:${skill}:${from}`];
    if (trace?.valid && (trace.seen || trace.closed)) {
      const available = trace.original.filter(id => !trace.returned.includes(id) && exact(state, id, fromKey));
      const destination = Number(data.ToPosition);
      if (to === 1 && [TOP, BOTTOM].includes(destination)) {
        const selected = available.filter(id => destination === TOP ? trace.grid[id] < trace.original.length : trace.grid[id] >= trace.original.length).sort((a, b) => trace.grid[a] - trace.grid[b]);
        if (selected.length === count) candidate(destination === TOP ? selected.slice().reverse() : selected);
      } else if (to === 5 && [987, 988, 3776].includes(skill)) {
        if (skill === 3776 && available.length === count) candidate(available);
        else candidate((trace.displaced || []).filter(id => available.includes(id)));
      }
    }
    if (skill === 3208 && to === 5 && !supplied.length) {
      const order = state.zones[fromKey]?.order || [];
      if (count === 1 && order.length === state.zones[fromKey]?.count) candidate(order.slice(0, 1));
    }
  }
  if (skill === 3483) {
    const exchange = state.pending[`legacyExchange:${skill}:${actor}`];
    if (from === 1 && to === 10 && Number(data.FromPosition) === UNKNOWN && exchange?.turn === state.turn && exchange.pile?.length === count && present(state, exchange.pile, fromKey)) {
      result.position = TOP;
      if (!supplied.length) result.ids = exchange.pile.slice();
    }
    if (from === 10 && to === 1 && Number(data.FromPosition) === UNKNOWN && !supplied.length) {
      const hand = m.jieliHands?.[fromKey] || [];
      const all = members(state, fromKey);
      if (hand.length && all.length === state.zones[fromKey]?.count && all.length === count + hand.length) {
        // The server returns the deck group before identifying the swapped hand
        // group. Defer identities until that next public result disambiguates it.
        m.jieliDeferred = { source: fromKey, all, handCount: hand.length, count, actor, deck: h.zoneKey(1), destination: Number(data.ToPosition), moveIndex: m.moveIndex };
      }
    }
  }
  return result;
}

/** Call after locations/order have been updated, including same-zone reveals. */
export function legacyAfterMove(state, data, seq, ids, h) {
  if (data?.isSend) return;
  const m = memory(state), skill = Number(data.SpellID), from = Number(data.FromZone), to = Number(data.ToZone), count = Number(data.CardCount), move = Number(data.MoveType);
  const fromSeat = Number(data.FromID), toSeat = Number(data.ToID), actor = Number(data.SrcSeatID);
  const complete = ids.length === count;
  if (skill === 3653 && from === 3 && to === 2 && move === 14) {
    const x = m.jianzhi[actor];
    if (x?.cards) {
      if (!complete || ids.some(id => ![1, 2, 3, 4].includes(suit(state, id)) || x.cards.includes(id))) x.cards = null;
      else x.cards.push(...ids);
    }
  }
  if (skill === 3571 && from === 3 && to === 8 && move === 6 && seat(actor)) {
    if (complete) m.judgments[actor] = [...new Set([...(m.judgments[actor] || []), ...ids])];
    else delete m.judgments[actor];
  }
  if (skill === 3488 && from === 5 && to === 5 && move === 21 && complete && count === 1) m.zuolian[fromSeat] = ids[0];
  if (skill === 780 && from === 5 && to === 5 && fromSeat === state.currentSeatId && complete && count === 1) { m.wengua ||= {}; m.wengua[toSeat] = ids[0]; }
  if (skill === 3659 && move === 21 && complete) for (const id of ids) {
    const item = state.cards[id];
    if (item && !item.tags.includes('捷悟')) item.tags = [...item.tags, '捷悟'].slice(-5);
  }
  if (skill === 3483 && to === 10 && from === 5) {
    m.jieliHands ||= {};
    const k = h.zoneKey(to, toSeat, data.ToZoneParam);
    if (complete) m.jieliHands[k] = ids.slice();
    else delete m.jieliHands[k];
  }
  if (skill === 3483 && from === 10 && to === 5 && m.jieliDeferred) {
    const d = m.jieliDeferred;
    delete m.jieliDeferred;
    const source = h.zoneKey(from, fromSeat, data.FromZoneParam);
    if (source === d.source && actor === d.actor && complete && count === d.handCount && ids.every(id => d.all.includes(id))) {
      const returned = d.all.filter(id => !ids.includes(id));
      if (returned.length === d.count) {
        returned.forEach(id => h.locate(state, id, d.deck, seq, undefined, false));
        // Knowing the returned set does not establish its internal order.
        if (returned.length === 1 && [TOP, BOTTOM].includes(d.destination)) {
          const pile = h.zone(state, d.deck), side = d.destination === TOP ? 'top' : 'bottom';
          pile[side] = [...returned, ...(pile[side] || []).filter(id => !returned.includes(id))];
        }
      }
    }
  }
  if (TEMP_SKILLS.has(skill)) {
    if (from === 1 && [8, 10].includes(to) && complete && count > 1 && seat(actor)) {
      // Grid order is the game's display order, opposite the deck-removal order.
      const original = [3208, 7011, 987, 988, 3903].includes(skill) ? ids.slice().reverse() : ids.slice();
      m.temp[`${actor}:${skill}:${to}`] = { actor, skill, original, logical: original.slice(), grid: Object.fromEntries(original.map((id, i) => [id, i])), returned: [], valid: true, seen: false, closed: false };
    }
    if ([8, 10].includes(from)) {
      const trace = m.temp[`${actor}:${skill}:${from}`];
      if (trace) {
        if (complete) trace.returned.push(...ids.filter(id => trace.original.includes(id)));
        else trace.valid = false;
        if (trace.returned.length >= trace.original.length) delete m.temp[`${actor}:${skill}:${from}`];
      }
    }
  }
  // Any uncorrelated departure invalidates remembered one-card hand selections.
  if (from === 5 && !(to === 5 && fromSeat === toSeat)) {
    if (skill !== 3488) delete m.zuolian[fromSeat];
    if (skill !== 780 && m.wengua) delete m.wengua[fromSeat];
    if (m.xiashu && fromSeat === m.xiashu.target && skill !== 361) delete m.xiashu;
  }
}
