import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { createPokerTransport } from '../src/plugins/poker-lobby/live/transport.js';
import { createPokerTableState } from '../src/plugins/poker-lobby/live/table-state.js';

const SELF = 1;
const OWN_CARD = 10301;
const OTHER_CARD = 20401;
const token = (low, high = 5) => ({ low, high, unsigned: false });

function fixture(seats, options) {
  const listeners = new Map();
  const requests = [];
  const events = [];
  const timers = [];
  const scope = new ResourceScope();
  scope.timeout = (callback, delay) => { timers.push({ callback, delay }); };
  const identity = { account: '78', now: 53, replay: false };
  const room = { TableId: 217500001, IsGameStart: true, GetTableSeatInfoByUserId: () => ({ ClientId: 78, SeatID: SELF }) };
  const proxy = {
    ConnId: 3,
    ConnectedSucess1: true,
    AddEventListener(id, owner, callback) { listeners.set(id, { owner, callback }); },
    RemoveEventListener(id, owner, callback) {
      assert.deepEqual(listeners.get(id), { owner, callback });
      listeners.delete(id);
    },
    M(id, data) { requests.push({ id, data }); },
  };
  const ctx = {
    native: { account: () => ({ id: identity.account }) },
    window: { performance: { now: () => identity.now } },
    game: { getServerProxy: () => proxy, isReplay: () => identity.replay, getClass: () => identity.gameContext },
  };
  const match = { proxy, account: identity.account, connection: 3, tableId: room.TableId, room, selfSeat: SELF, seats };
  const transport = createPokerTransport(ctx, scope, match, (type, data) => events.push({ type, data }), options);
  const receive = (id, data, properties = {}) => {
    const event = { Protocol: { Id: id, Data: { ProtoObj: data }, ...properties } };
    listeners.get(id)?.callback(event);
    return event;
  };
  const deal = () => receive(201005, {
    from_zone_info: { zone_type: 101 }, to_zone_info: { zone_type: 201, seat_id: SELF }, card_ids: [{ card_id: OWN_CARD }], card_num: 1,
  });
  const turn = (index, properties) => receive(201001, { opt_seat: SELF, opt_index: index, opt_time: 8, ...properties });
  assert.ok(transport);
  return { deal, events, identity, listeners, proxy, receive, requests, room, scope, timers, transport, turn };
}

test('native poker trustee waits for an own-seat state update and blocks competing actions until then', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  f.deal();
  f.turn(token(91));
  assert.equal(f.transport.toggleTrustee(), true);
  assert.deepEqual(f.requests, [{ id: 201036, data: { open_trust: true } }]);
  assert.equal(f.transport.toggleTrustee(), false);
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201026, { state_list: [{ seat: 2, is_trust: 1 }] });
  assert.equal(f.transport.toggleTrustee(), false);
  f.receive(201026, { state_list: [{ seat: SELF, is_trust: 1 }] });
  assert.equal(f.transport.play([OWN_CARD]), false);
  assert.deepEqual(f.events.at(-1), { type: 'trustee', data: { seat: SELF, enabled: true, changed: true, pending: false } });
  assert.equal(f.transport.toggleTrustee(), true);
  assert.deepEqual(f.requests.at(-1), { id: 201036, data: { open_trust: false } });
  f.receive(201026, { state_list: [{ seat: SELF, is_trust: 0 }] });
  assert.equal(f.transport.play([OWN_CARD]), true);
  f.receive(201022, {});
  assert.equal(f.transport.toggleTrustee(), false);
  f.scope.dispose();
});

test('a snapshot restores public piles and trustee state without exposing other opposing pile identities', () => {
  const f = fixture([{ id: SELF }, { id: 2 }]);
  f.receive(201035, {
    base_data: { table_id: f.room.TableId, model_id: 175, sec_id: 2, phase: 202 },
    zone_data: [
      { from_zone_info: { seat_id: SELF, zone_type: 203 }, spell_id: 47, is_all: true,
        card_ids: [{ card_id: OWN_CARD }], card_num: 1 },
      { from_zone_info: { seat_id: 2, zone_type: 203 }, is_all: true, card_num: 4, card_ids: [
        { card_id: OTHER_CARD, spell_area_id: 46 }, { card_id: 21501, spell_area_id: 47 }, { spell_area_id: 47 },
        { card_id: 21400, spell_area_id: 3 },
      ] },
    ],
    player_state: { state_list: [{ seat: SELF, is_trust: 1 }] },
  });
  const state = createPokerTableState({ selfSeat: SELF, seats: [{ id: SELF }, { id: 2 }] });
  for (const { type, data } of f.events) state.receive(type, data);
  const piles = state.view().seats.map(seat => seat.skillPiles.map(({ skill, cards }) => [skill, cards.map(card => card?.id)]));
  assert.deepEqual(piles, [[[47, [OWN_CARD]]], [[46, [OTHER_CARD]], [47, [21501, undefined]], [3, [undefined]]]]);
  assert.equal(f.transport.toggleTrustee(), true);
  assert.deepEqual(f.requests.at(-1), { id: 201036, data: { open_trust: false } });
  f.scope.dispose();
});

test('opposing 权计 and 破军 retain public pile faces across moves without disclosing unrelated cards', () => {
  const seats = [{ id: SELF }, { id: 2 }];
  const state = createPokerTableState({ selfSeat: SELF, seats });
  const f = fixture(seats, { knowsHandCard: state.knowsHandCard });
  const pile = { seat_id: 2, zone_type: 203 };
  const hand = { seat_id: 2, zone_type: 201 };
  const move = (from, to, spell_id, card_ids) => {
    f.receive(201005, { from_zone_info: from, to_zone_info: to, spell_id, card_ids, card_num: card_ids.length });
    const event = f.events.findLast(({ type }) => type === 'move');
    state.receive(event.type, event.data);
    return event.data.cards.map(card => card.id);
  };
  const stash = move({ zone_type: 101 }, pile, 47, [{ card_id: 21501 }, { card_id: 41301 }]);
  const take = move(pile, hand, 47, [{ card_id: 41301 }]);
  const swap = move(hand, pile, 47, [{ card_id: OTHER_CARD, spell_area_id: 47 }]);
  const sealed = move(hand, pile, 46, [{ card_id: 21400 }, { card_id: 51300, spell_area_id: 46 }]);
  const returned = move(pile, hand, 46, [{ card_id: 21400 }]);
  const privatePile = move(hand, pile, 3, [{ card_id: 10600, spell_area_id: 3 }]);
  assert.deepEqual([stash, take, swap, sealed, returned, privatePile],
    [[21501, 41301], [41301], [OTHER_CARD], [21400, 51300], [21400], []]);
  const view = state.view();
  const opponent = view.seats[1];
  assert.deepEqual(opponent.skillPiles.map(({ skill, cards }) => [skill, cards.map(card => card?.id)]),
    [[47, [21501, OTHER_CARD]], [46, [51300]], [3, [undefined]]]);
  assert.deepEqual(view.history.filter(action => action.type === 'stash').map(action => action.skill), [47, 47, 46, 3]);
  const visible = () => state.view().seats[1].visibleHand.map(card => [card.id, card.source]).sort(([a], [b]) => a - b);
  assert.deepEqual(visible(), [[21400, '破军'], [41301, '权计']]);
  move(pile, hand, 3, [{ card_id: 10600 }]);
  move(pile, hand, 47, [{}]);
  assert.deepEqual(visible(), [[21400, '破军'], [41301, '权计']]);
  move(hand, pile, 47, [{ card_id: 41301 }]);
  assert.deepEqual(visible(), [[21400, '破军']]);
  move(hand, { zone_type: 103 }, 0, [{}]);
  assert.deepEqual(visible(), []);
  f.scope.dispose();
});

test('manual play sends native card data only for the current own option and hand', () => {
  const f = fixture();
  f.deal();
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.turn(token(100), { opt_seat: 2 });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.turn(token(101));
  assert.equal(f.events.at(-1).data.optionKey, '5:101');
  assert.equal(f.transport.play([OTHER_CARD]), false);
  assert.equal(f.transport.pass(), false);
  assert.equal(f.transport.play([OWN_CARD]), true);
  assert.equal(f.transport.play([OWN_CARD]), false);
  assert.deepEqual(f.requests, [{ id: 201002, data: { opt_index: token(101), putCards: [{ card_id: OWN_CARD, spell_num: 0, spell_suit: 0 }] } }]);
  f.receive(201003, { result_id: 2, req_msg: { opt_index: token(100) } });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201003, { result_id: 2, req_msg: { opt_index: token(101) }, error_msg: '不能出牌' });
  assert.deepEqual(f.events.at(-1), {
    type: 'ack', data: { action: 'play', optionKey: '5:101', accepted: false, code: 2, message: '不能出牌' },
  });
  assert.equal(f.transport.play([OWN_CARD]), true);
  f.receive(201003, { req_msg: { opt_index: token(101) } });
  f.turn(token(101));
  assert.equal(f.transport.play([OWN_CARD]), false);
});

test('pass uses the native cancel packet and cannot use expired or replaced prompts', () => {
  const f = fixture();
  const predecessor = { predecessor_cards: [{ card_id: OTHER_CARD }] };
  f.turn(token(7, 9), predecessor);
  assert.equal(f.transport.pass(), true);
  assert.deepEqual(f.requests, [{ id: 201023, data: { opt_index: token(7, 9) } }]);
  f.turn(token(8, 9), predecessor);
  f.identity.now += 8000;
  assert.equal(f.transport.pass(), false);
  assert.equal(f.timers[1].delay, 8000);
  f.timers[0].callback();
  assert.equal(f.events.at(-1).type, 'turn');
  f.timers[1].callback();
  assert.deepEqual(f.events.at(-1), { type: 'prompt-expired', data: { optionKey: '9:8' } });
  f.turn(token(9, 9), predecessor);
  f.receive(201030, {});
  assert.equal(f.transport.pass(), false);
  f.turn(token(10, 9), predecessor);
  f.receive(201022, {});
  assert.equal(f.transport.pass(), false);
  assert.equal(f.events.at(-1).type, 'end');
});

test('only an authoritative snapshot for this table can reset the local hand', () => {
  const f = fixture();
  const data = {
    base_data: { table_id: f.room.TableId, model_id: 175, sec_id: 2, phase: 202, cur_player_seat: SELF },
    zone_data: [
      { from_zone_info: { zone_type: 201, seat_id: SELF }, card_num: 1, is_all: true, card_ids: [{ card_id: OWN_CARD }] },
      { from_zone_info: { zone_type: 201, seat_id: 2 }, card_num: 1, is_all: true, card_ids: [{ card_id: OTHER_CARD }] },
    ],
  };
  f.receive(201035, { ...data, base_data: { ...data.base_data, table_id: 42 } });
  assert.equal(f.events.length, 0);
  f.receive(201035, data);
  const snapshot = f.events.at(-1);
  assert.equal(snapshot.type, 'sync');
  assert.deepEqual(snapshot.data.hand.map(card => card.id), [OWN_CARD]);
  assert.deepEqual(snapshot.data.counts, { [SELF]: 1, 2: 1 });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.turn(token(1));
  assert.equal(f.transport.play([OWN_CARD]), true);
});

test('bottom cards become public after the landlord and the broadcast carries the displayed multiplier', () => {
  const f = fixture();
  const ids = [10300, 20400, 51700];
  const cards = ids.map(card_id => ({ card_id }));
  const bottom = { from_zone_info: { zone_type: 104 }, is_all: true, card_ids: cards, card_num: 3 };
  const moved = { ...bottom, to_zone_info: { zone_type: 201, seat_id: 2 } };
  f.receive(201025, bottom);
  f.receive(201005, moved);
  assert.deepEqual(f.events.filter(event => event.type === 'bottom'), []);
  assert.deepEqual(f.events.at(-1).data.cards, []);
  f.receive(201019, { identities: [{ seat_id: 2, identity_type: 1 }] });
  f.receive(201025, bottom);
  assert.deepEqual(f.events.at(-1).data.cards.map(card => card.id), ids);
  f.receive(201005, moved);
  assert.deepEqual(f.events.at(-1).data.cards.map(card => card.id), ids);
  f.receive(201020, { base_score: 200, current_multiplier: 7 * 2048 + 1025, change_reason: 4 });
  assert.deepEqual(f.events.at(-1), { type: 'multiplier', data: { score: 200, rate: 1025, reason: 4 } });
});

test('only server-designated visible hand cards leave the transport, including hidden moves and reconnect', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  const other = { seat_id: 2, zone_type: 201 };
  const privateFace = { card_id: 30400 };
  const exposed = { position_index: 2, card: { card_id: 20500 } };
  const body = { from_zone_info: other, is_all: true, card_num: 3, card_ids: [privateFace] };
  f.receive(201025, body);
  assert.equal(f.events.some(event => event.type === 'visible-hand' || event.type === 'hand'), false);
  f.receive(201025, { ...body, is_all: false, spell_id: 49, visible_hand_cards: [exposed] });
  const { type, data } = f.events.at(-1);
  assert.equal(type, 'visible-hand');
  assert.deepEqual(data.cards.map(card => [card.id, card.position]), [[20500, 2]]);
  f.receive(201005, { from_zone_info: other, to_zone_info: { zone_type: 201, seat_id: 0 }, card_num: 1,
    card_ids: [privateFace], from_visible_hand_cards: [exposed] });
  assert.deepEqual(f.events.at(-1).data.cards, []);
  assert.deepEqual(f.events.at(-1).data.removedVisibleIds, [20500]);
  f.receive(201035, { base_data: { table_id: f.room.TableId, model_id: 175, sec_id: 2, phase: 202 },
    zone_data: [{ ...body, visible_hand_cards: [exposed] }] });
  const snapshot = f.events.findLast(event => event.type === 'sync')?.data;
  assert.equal(snapshot.hand, null);
  assert.deepEqual(snapshot.visibleHands.map(row => [row.seat, ...row.cards.map(card => card.id)]), [[2, 20500]]);
});

test('private moves can remove already-observed cards without disclosing any other moved faces', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }], {
    knowsHandCard: (seat, id) => seat === 2 && id === OTHER_CARD,
  });
  f.receive(201005, {
    from_zone_info: { seat_id: 2, zone_type: 201 }, to_zone_info: { seat_id: 0, zone_type: 201 },
    card_num: 2, card_ids: [{ card_id: OTHER_CARD }, { card_id: 30501 }],
  });
  const move = f.events.find(event => event.type === 'move')?.data;
  assert.deepEqual(move?.cards, []);
  assert.deepEqual(move.removedVisibleIds, [OTHER_CARD]);
  assert.equal(move.confirmedDepartures, true);
});

test('native hint is scoped to the current option and cycles only cards still in the own hand', () => {
  const f = fixture();
  f.receive(201025, { from_zone_info: { seat_id: SELF, zone_type: 201 }, is_all: true, card_num: 2,
    card_ids: [{ card_id: OWN_CARD }, { card_id: 30500 }] });
  const index = token(17);
  f.turn(index);
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.requests, [{ id: 201069, data: { opt_index: index } }]);
  const reqs = [{ putCards: [{ card_id: OTHER_CARD }] }, { putCards: [{ card_id: OWN_CARD }] }, { putCards: [{ card_id: 30500 }] }];
  f.receive(201071, { opt_index: token(18), success: true, reqs });
  f.receive(201071, { opt_index: index, table_id: 1, success: true, reqs });
  assert.equal(f.events.at(-1).type, 'hint-pending');
  f.receive(201071, { opt_index: index, success: true, reqs });
  assert.deepEqual(f.events.at(-1).data.choice.ids, [OWN_CARD]);
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.events.at(-1).data.choice.ids, [30500]);
  assert.equal(f.requests.length, 1);
});

test('native hint caches the server push until clicked and invalidates it when a card changes', () => {
  const f = fixture();
  const hand = { from_zone_info: { seat_id: SELF, zone_type: 201 } };
  f.receive(201025, { ...hand, is_all: true, card_num: 2, card_ids: [{ card_id: OWN_CARD }, { card_id: 30500 }] });
  const index = token(17);
  f.turn(index);
  const reply = { opt_index: index, success: true, reqs: [
    { putCards: [{ card_id: OWN_CARD, wild_num: 7 }] }, { putCards: [{ card_id: 30500 }] },
  ] };
  f.receive(201071, { ...reply, reqs: [], seat_id: 2 });
  f.receive(201071, { ...reply, reqs: [], opt_index: token(16) });
  f.receive(201071, reply);
  assert.equal(f.events.at(-1).type, 'turn');
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.events.at(-1), { type: 'hint', data: { optionKey: '5:17',
    choice: { ids: [OWN_CARD], wildRanks: new Map([[OWN_CARD, 7]]) }, waited: false } });
  f.receive(201071, reply);
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.events.at(-1).data.choice.ids, [30500]);
  assert.deepEqual(f.requests, []);

  f.receive(201025, { ...hand, spell_id: 42, card_ids: [{ card_id: OWN_CARD, num: 10 }] });
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.requests, [{ id: 201069, data: { opt_index: index } }]);

  const next = token(18);
  f.turn(next);
  f.receive(201071, { opt_index: next, success: true });
  assert.equal(f.transport.requestHint(), true);
  assert.deepEqual(f.events.at(-1), { type: 'hint', data: { optionKey: '5:18', choice: undefined, waited: false } });
  assert.equal(f.requests.length, 1);
});

test('the native action bar receives stable regular and reserve deadlines', () => {
  const f = fixture();
  f.turn(token(10), { opt_time: 2, backup_time: 2, predecessor_cards: [{ card_id: OTHER_CARD }] });
  const clock = f.transport.countdown();
  assert.deepEqual(clock, { kind: 'play', seat: SELF, startsAt: 53, regularUntil: 2053, expiresAt: 4053 });
  f.identity.now += 1400;
  assert.equal(f.transport.countdown(), clock);
  f.identity.now += 600;
  assert.equal(f.transport.countdown(), clock);
  f.identity.now += 2000;
  assert.equal(f.transport.countdown(), null);
  assert.equal(f.transport.pass(), false);
  f.timers[0].callback();
  assert.equal(f.events.at(-1).type, 'prompt-expired');
});

test('a timed opponent offer has a seat countdown and never enables a local response', () => {
  const f = fixture();
  f.receive(201014, { opt_seat: 2, opt_index: token(11), opt_time: 3 });
  const clock = f.transport.countdown();
  assert.deepEqual(clock, { kind: 'bid', seat: 2, startsAt: 53, regularUntil: 3053, expiresAt: 3053 });
  f.receive(201021, { phase: 103, cur_seat_id: 2 });
  assert.equal(f.transport.countdown(), clock);
  assert.equal(f.transport.bid(true), false);
  f.receive(201017, { seat_id: 2, grab: 0 });
  assert.equal(f.transport.countdown(), null);
  assert.deepEqual(f.requests, []);
});

test('突袭 show-card notice projects only supplied faces and leaves no cancellable option', () => {
  const f = fixture();
  const index = token(11);
  const data = { opt_seat: 2, opt_index: index, opt_time: 1,
    spell_id: 17, opt_type: 6, data_cards: [{ card_id: OTHER_CARD }, {}] };
  f.receive(201030, data);
  f.receive(201030, data);
  const reveals = f.events.filter(event => event.type === 'reveal');
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].data.seat, 2);
  assert.equal(reveals[0].data.cards[0].id, OTHER_CARD);
  assert.deepEqual(reveals[0].data.cards[1], { id: -2, hidden: true });
  assert.equal(f.transport.submitSkillChoice({ index, optionKey: '5:11', cancel: true }), false);
  assert.equal(f.transport.countdown(), null);
  assert.deepEqual(f.requests, []);
  assert.equal(f.timers[0].delay, 1700);
  f.timers[0].callback();
  assert.deepEqual(f.events.at(-1), { type: 'reveal-ended', data: reveals[0].data });
});

test('突袭 marks shown and gained hand cards until they leave or can no longer be tracked', () => {
  const seats = [{ id: 0 }, { id: SELF }, { id: 2 }];
  const state = createPokerTableState({ selfSeat: SELF, seats });
  const f = fixture(seats, { knowsHandCard: state.knowsHandCard });
  const send = (id, data) => {
    f.receive(id, data);
    for (const event of f.events.splice(0)) state.receive(event.type, event.data);
  };
  const shown = 21300, gained = 31300, ownGain = 41300;
  const hand = seat_id => ({ seat_id, zone_type: 201 });
  const played = seat_id => ({ seat_id, zone_type: 204 });
  const marks = id => state.view().seats.find(seat => seat.id === id).visibleHand
    .map(card => [card.id, card.source]).sort(([a], [b]) => a - b);
  send(201030, { opt_seat: 2, opt_index: token(11), spell_id: 17, opt_type: 6,
    data_cards: [{ card_id: shown }, {}, { card_id: 40300, is_virtual: true }] });
  assert.deepEqual(marks(2), [[shown, 17]]);
  assert.equal(state.view().reveal.seat, 2);
  f.timers[0].callback();
  for (const event of f.events.splice(0)) state.receive(event.type, event.data);
  assert.equal(state.view().reveal, null);
  assert.deepEqual(marks(2), [[shown, 17]]);

  send(201005, { from_zone_info: played(0), to_zone_info: hand(2), spell_id: 17,
    card_num: 1, card_ids: [{ card_id: gained }] });
  assert.deepEqual(marks(2), [[shown, 17], [gained, 17]]);
  assert.deepEqual(state.view().history.at(-1).cards.map(card => card.id), [gained]);
  send(201005, { from_zone_info: played(2), to_zone_info: hand(SELF), spell_id: 17, card_num: 1,
    to_visible_hand_cards: [{ position_index: 3, card: { card_id: ownGain } }] });
  assert.deepEqual(marks(SELF), [[ownGain, 17]]);
  assert.deepEqual(state.view().hand.map(card => card.id), [ownGain]);

  send(201005, { from_zone_info: hand(2), to_zone_info: played(2), card_num: 1, card_ids: [{ card_id: shown }] });
  assert.deepEqual(marks(2), [[gained, 17]]);
  send(201005, { from_zone_info: hand(2), to_zone_info: hand(0), card_num: 1 });
  assert.deepEqual(marks(2), []);
  assert.deepEqual(marks(0), []);
  assert.deepEqual(f.requests, []);
});

test('明牌加倍 requires the confirmed landlord and respects native bean eligibility', () => {
  const f = fixture();
  const show = (index, fields = {}) => f.receive(201030, {
    opt_seat: SELF, opt_time: 10, opt_index: index, opt_type: 6, options: [0, 1], ...fields,
  });
  const choose = (index, option) => f.transport.submitSkillChoice({ index, optionKey: `${index.high}:${index.low}`, option });
  const roles = seat => ({ identities: [{ seat_id: seat, identity_type: 1 }] });
  show(token(1));
  f.receive(201019, roles(2));
  show(token(2));
  f.receive(201019, roles(SELF));
  show(token(3), { opt_seat: 2, opt_seat_list: [SELF] });
  assert.equal(f.events.some(event => event.type === 'skill-options'), false);
  assert.equal(choose(token(3), 1), false);

  show(token(4), { params: [0, 1000] });
  const blocked = f.events.findLast(event => event.type === 'skill-options').data;
  assert.equal(blocked.reason, '欢乐豆不足 1000');
  assert.equal(blocked.choices.find(option => option.id === 1).enabled, false);
  assert.equal(choose(token(4), 1), false);
  assert.deepEqual(f.requests, []);
  assert.equal(choose(token(4), 0), true);
  assert.equal(choose(token(4), 0), false);

  f.receive(201035, {
    base_data: { table_id: f.room.TableId, model_id: 175, sec_id: 2, phase: 103 },
    role_data: roles(SELF),
  });
  show(token(5), { params: [1] });
  assert.equal(choose(token(5), 1), true);
  assert.deepEqual(f.requests, [
    { id: 201031, data: { opt_type: 6, options: [0], opt_index: token(4) } },
    { id: 201031, data: { opt_type: 6, options: [1], opt_index: token(5) } },
  ]);
});

test('only the confirmed landlord can submit the native unilateral surrender', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  const roles = seat_id => ({ identities: [{ seat_id, identity_type: 1 }] });
  f.receive(201019, roles(2));
  assert.equal(f.transport.surrender(), false);
  f.receive(201019, roles(SELF));
  assert.equal(f.transport.canSurrender(), true);
  assert.equal(f.transport.surrender(), true);
  assert.equal(f.transport.surrender(), false);
  assert.deepEqual(f.requests, [{ id: 108042, data: { type: 0 } }]);
  f.receive(108204, { seatId: 2, result: 0 });
  assert.equal(f.events.at(-1).data.accepted, undefined);
  f.receive(108204, { seatId: SELF, result: 3 });
  assert.equal(f.events.at(-1).data.message, '当前未到可投降时间');
  assert.equal(f.transport.surrender(), true);
  f.receive(21289, undefined, { SeatId: SELF, Result: 0 });
  assert.equal(f.events.at(-1).data.accepted, true);
  for (const { callback } of f.timers) callback();
  assert.equal(f.transport.canSurrender(), false);
  assert.equal(f.events.at(-1).data.accepted, true);
  assert.deepEqual(f.requests, Array.from({ length: 2 }, () => ({ id: 108042, data: { type: 0 } })));
  assert.equal(f.events.some(event => event.type === 'end'), false);
});

test('complete hand requires an exact native count and transformed cards keep wire fields', () => {
  const f = fixture();
  const location = { zone_type: 201, seat_id: SELF };
  f.receive(201025, { from_zone_info: location, is_all: true, card_num: 2, card_ids: [{ card_id: OWN_CARD }] });
  assert.equal(f.events.findLast(event => event.type === 'hand').data.complete, false);
  assert.equal(f.events.findLast(event => event.type === 'hand').data.count, 2);
  f.turn(token(1));
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201025, { from_zone_info: location, is_all: true, card_num: 1, card_ids: [{ card_id: OWN_CARD }] });
  assert.equal(f.events.findLast(event => event.type === 'hand').data.complete, true);
  f.receive(201025, { from_zone_info: location, card_num: 1, spell_id: 16,
    card_ids: [{ card_id: OWN_CARD, num: 7, suit: 2, dynamic_spell_id: 16 }] });
  assert.equal(f.events.findLast(event => event.type === 'hand').data.complete, undefined);
  assert.equal(f.transport.play([OWN_CARD]), true);
  assert.deepEqual(f.requests.at(-1).data.putCards, [{ card_id: OWN_CARD, spell_num: 7, spell_suit: 2 }]);
});

test('the native game seat supersedes the lobby seat record when it is available', () => {
  const f = fixture();
  f.room.GetTableSeatInfoByUserId = () => ({ ClientId: 78, SeatID: 0 });
  f.identity.gameContext = { SelfSeatIndex: SELF, SelfSeat: { PlayerInfo: { ClientId: 79 } } };
  f.deal();
  f.turn(token(1));
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.identity.gameContext.SelfSeat.PlayerInfo.ClientId = 78;
  f.proxy.CacheStarted = true;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.proxy.CacheStarted = false;
  f.identity.gameContext.CanOperationInGame = () => false;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.identity.gameContext.CanOperationInGame = () => true;
  assert.equal(f.transport.play([OWN_CARD]), true);
});

test('general selection is scoped to the own candidate list and original option', () => {
  const f = fixture();
  const offer = { opt_seat: SELF, opt_index: token(11), opt_time: 25, general_ids: [2001, 3001, 4001] };
  f.receive(201006, { ...offer, opt_seat: 2 });
  assert.equal(f.transport.selectGeneral(2001), false);
  f.receive(201006, offer);
  assert.deepEqual(f.events.at(-1).data.candidates, [{ id: 2001 }, { id: 3001 }, { id: 4001 }]);
  f.receive(201021, { phase: 101 });
  f.receive(201006, { ...offer, is_replace: true, general_ids: [5001] });
  assert.equal(f.transport.selectGeneral(2001), false);
  assert.equal(f.transport.preselectGeneral(2001), false);
  assert.equal(f.transport.preselectGeneral(5001), true);
  assert.deepEqual(f.requests.at(-1), { id: 201007, data: { general_ids: [5001] } });
  assert.equal(f.transport.selectGeneral(5001), true);
  assert.equal(f.transport.selectGeneral(5001), false);
  assert.equal(f.transport.preselectGeneral(5001), false);
  assert.deepEqual(f.requests.at(-1), { id: 201010, data: { general_ids: [5001] } });
  f.receive(201011, { result_id: 8, req_msg: { general_ids: [2001] } });
  assert.equal(f.transport.selectGeneral(5001), false);
  f.receive(201011, { result_id: 8, req_msg: { general_ids: [5001] } });
  assert.equal(f.events.at(-1).data.action, 'general');
  assert.equal(f.events.at(-1).data.accepted, false);
  assert.equal(f.transport.selectGeneral(5001), true);
  f.receive(201013, { notify_generals: [{ seat_id: SELF, generals: [{ id: 5001, skills: [16] }] }] });
  assert.deepEqual(f.events.findLast(event => event.type === 'general'), { type: 'general', data: { seat: SELF, general: 5001, skills: [16] } });
  assert.equal(f.transport.selectGeneral(5001), false);
});

test('a native general replacement updates eligible cards without extending the current deadline', () => {
  const f = fixture();
  const initial = { opt_seat: SELF, opt_index: token(7), opt_time: 25, general_ids: [1001, 1002] };
  const replaced = { ...initial, is_replace: true, opt_index: token(8), general_ids: [1001, 1003] };
  f.receive(201006, replaced);
  assert.equal(f.transport.preselectGeneral(1003), false);
  f.receive(201006, initial);
  const clock = f.transport.countdown();
  assert.equal(f.transport.selectGeneral(1002), true);
  f.identity.now += 24000;
  f.receive(201006, replaced);
  assert.equal(f.timers.length, 1);
  assert.equal(f.transport.countdown(), clock);
  assert.equal(clock.expiresAt - f.identity.now, 1000);
  assert.equal(f.events.at(-1).data.optionKey, '5:8');
  assert.equal(f.events.at(-1).data.awaitingConfirmation, false);
  f.receive(201006, { ...initial, is_replace: true });
  f.receive(201006, initial);
  assert.equal(f.transport.preselectGeneral(1002), false);
  assert.equal(f.transport.preselectGeneral(1001), true);
  assert.equal(f.transport.selectGeneral(1003), true);
  f.receive(201011, { result_id: 4, req_msg: { opt_index: token(7), general_ids: [1002] } });
  assert.equal(f.transport.selectGeneral(1003), false);
  f.identity.now += 1000;
  f.timers[0].callback();
  assert.deepEqual(f.events.at(-1), { type: 'prompt-expired', data: { optionKey: '5:8' } });
  assert.equal(f.transport.preselectGeneral(1003), false);
});

test('official bid packets distinguish call, rob, decline and the current seat', () => {
  const f = fixture();
  const offer = { opt_seat: SELF, opt_index: token(21), opt_time: 20 };
  f.receive(201014, { ...offer, opt_index: token(19), opt_seat: 2 });
  assert.equal(f.transport.bid(true), false);
  f.receive(201014, offer);
  assert.equal(f.events.at(-1).data.grab, false);
  assert.equal(f.events.at(-1).data.actionable, true);
  f.receive(201021, { phase: 103 });
  assert.equal(f.transport.bid(true), true);
  assert.deepEqual(f.requests.at(-1), { id: 201015, data: { opt_index: token(21), grab: 1 } });
  f.receive(201016, { req_msg: { opt_index: token(21), grab: 1 } });
  assert.equal(f.events.at(-1).data.accepted, true);
  assert.equal(f.transport.bid(false), false);
  f.receive(201014, { ...offer, opt_index: token(22), grab_times: 1 });
  assert.equal(f.events.at(-1).data.grab, true);
  assert.equal(f.transport.bid(false), true);
  assert.deepEqual(f.requests.at(-1), { id: 201015, data: { opt_index: token(22), grab: 0 } });
  f.receive(201017, { seat_id: SELF, grab: 0, grab_times: 2 });
  assert.deepEqual(f.events.at(-1), { type: 'bid', data: { seat: SELF, bid: false, grabTimes: 2 } });
  assert.equal(f.transport.bid(false), false);
});

test('play sends verified wildcard assignments only for mixed selections and leaves all-wild ranks natural', () => {
  const f = fixture();
  const wildCard = 10501;
  f.receive(201025, { from_zone_info: { zone_type: 201, seat_id: SELF }, is_all: true, card_num: 2,
    card_ids: [{ card_id: OWN_CARD }, { card_id: wildCard, wild_spell_id: 18 }] });
  f.turn(token(1));
  assert.equal(f.transport.play([OWN_CARD, wildCard]), false);
  assert.equal(f.transport.play([OWN_CARD, wildCard], new Map([[wildCard, 16]])), false);
  assert.equal(f.transport.play([OWN_CARD], new Map([[OWN_CARD, 4]])), false);
  assert.equal(f.transport.play([OWN_CARD, wildCard], new Map([[wildCard, 3]])), true);
  assert.deepEqual(f.requests.at(-1).data.putCards, [
    { card_id: OWN_CARD, spell_num: 0, spell_suit: 0 },
    { card_id: wildCard, spell_num: 0, spell_suit: 0, wild_num: 3 },
  ]);
  f.turn(token(2));
  assert.equal(f.transport.play([wildCard], new Map([[wildCard, 3]])), false);
  assert.equal(f.transport.play([wildCard], new Map([[wildCard, 5]])), true);
  assert.deepEqual(f.requests.at(-1).data.putCards, [{ card_id: wildCard, spell_num: 0, spell_suit: 0 }]);
});

test('an active skill uses the same authoritative play option without consuming normal play on acknowledgement', () => {
  const f = fixture();
  f.deal();
  f.receive(201013, { notify_generals: [{ seat_id: SELF, generals: [{ id: 5001, skills: [10] }] }] });
  assert.equal(f.transport.activateSkill(10), false);
  f.turn(token(60));
  assert.equal(f.events.findLast(event => event.type === 'skill-state').data.skills[0].enabled, true);
  assert.equal(f.transport.activateSkill(10), true);
  assert.deepEqual(f.requests.at(-1), { id: 201027, data: { opt_index: token(60), spell_id: 10, spell_effect: 0,
    cards: [], targets: [], putCards: [] } });
  f.receive(201032, { req_msg: { opt_index: token(60) } });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201028, { req_msg: { opt_index: token(61), spell_id: 10 } });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201028, { req_msg: { opt_index: token(60), spell_id: 10 } });
  assert.deepEqual(f.events.findLast(event => event.type === 'ack').data, {
    action: 'skill', optionKey: '5:60', accepted: true, code: 0, message: '',
  });
  f.turn(token(62));
  assert.equal(f.transport.activateSkill(10), true);
  f.receive(201029, { seat: 2, spell_id: 10, is_use: true });
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.receive(201029, { seat: SELF, spell_id: 10, is_use: true, cnt: 1 });
  assert.equal(f.events.findLast(event => event.type === 'ack').data.optionKey, '5:62');
  assert.equal(f.transport.play([OWN_CARD]), true);
});

test('skill response and cancellation require the own current server option', () => {
  const f = fixture();
  f.deal();
  const prompt = { opt_seat: 2, opt_time: 10, opt_index: token(70), opt_type: 2, spell_id: 3,
    data_cards: [{ card_id: OWN_CARD }] };
  const choice = { optionKey: '5:70', cardIds: [OWN_CARD] };
  f.receive(201030, prompt);
  assert.equal(f.transport.submitSkillChoice(choice), false);
  f.receive(201030, { ...prompt, opt_index: token(71), opt_seat_list: [SELF] });
  assert.equal(f.events.findLast(event => event.type === 'skill-options').data.skill, 3);
  assert.equal(f.transport.submitSkillChoice(choice), false);
  assert.equal(f.transport.submitSkillChoice({ optionKey: '5:71', cardIds: [OTHER_CARD] }), false);
  assert.equal(f.transport.submitSkillChoice({ optionKey: '5:71', cardIds: [OWN_CARD] }), true);
  assert.deepEqual(f.requests.at(-1), { id: 201031, data: { opt_index: token(71), options: [OWN_CARD] } });
  f.receive(201028, { req_msg: { opt_index: token(71) } });
  assert.equal(f.transport.submitSkillChoice({ optionKey: '5:71', cardIds: [OWN_CARD] }), false);
  f.receive(201032, { req_msg: { opt_index: token(71) } });
  assert.equal(f.events.findLast(event => event.type === 'ack').data.action, 'skill-choice');
  f.receive(201030, { ...prompt, opt_index: token(72), opt_seat: SELF, opt_type: 1, data_use_skill: { spell_id: 16 } });
  assert.equal(f.transport.submitSkillChoice({ optionKey: '5:72', cancel: true }), true);
  assert.deepEqual(f.requests.at(-1), { id: 201023, data: { opt_index: token(72) } });
  f.receive(201024, { req_msg: { opt_index: token(72) } });
  assert.equal(f.events.findLast(event => event.type === 'ack').data.action, 'skill-choice');
});

test('settlement reads the native protobuf defaults and signed beans, including the legacy wrapper', () => {
  const f = fixture();
  const game_results = [
    { figure: 3, result: 1, param1: -400, grace: -300, game_money: 13 },
    { seat_id: 1, figure: 1, param1: 960, grace: 800, game_money: 12 },
    { seat_id: 2, figure: 3, result: 1, param1: -400, grace: -300, game_money: 11 },
  ];
  f.receive(108023, { gamemodel: 33, label_model: 175, game_results });
  f.receive(108023, { gamemodel: 47, label_model: 175, section: 3, game_results });
  f.receive(108023, { gamemodel: 47, label_model: 175, table_id: 9999, game_results });
  assert.equal(f.events.some(event => event.type === 'end'), false);
  f.receive(201022, {});
  assert.equal(f.events.at(-1).data.settled, undefined);
  const raw = { gamemodel: 47, label_model: 175, game_results };
  f.receive(108023, raw);
  const expected = {
    type: 'end', data: { settled: true, player: { seat: 1, role: 1, result: 0, beans: 960 } },
  };
  assert.deepEqual(f.events.at(-1), { ...expected, data: {
    ...expected.data, settlement: { raw: { ...raw, playercnt: 1, game_results: [game_results[1]] },
      protocol: { Id: 108023, Data: { ProtoObj: raw } }, beans: 960 },
  } });
  const legacy = { GameModel: 47, ModeType: 175, GoupID: 2,
    Players: game_results.map(row => ({ SeatID: row.seat_id ?? 0, Figure: row.figure,
      Result: row.result ?? 0, Param1: row.param1, Grace: row.grace, GameMoney: 1 })) };
  f.receive(21228, undefined, legacy);
  assert.deepEqual(f.events.at(-1), { ...expected, data: {
    ...expected.data, settlement: { raw: null, protocol: { Id: 21228, Data: { ProtoObj: undefined }, ...legacy }, beans: 960 },
  } });
});

test('triggered skills and public discards are shown without exposing a hand-to-hand transfer', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  f.receive(201029, { seat: 0, spell_id: 36, targets: [2], cnt: 1 });
  assert.deepEqual(f.events.find(event => event.type === 'skill-used')?.data, { seat: 0, skill: 36, effect: 0, targets: [2] });
  f.receive(201029, { seat: 7, spell_id: 36 });
  assert.equal(f.events.filter(event => event.type === 'skill-used').length, 1);

  const card = { card_id: OTHER_CARD };
  const hand = seat_id => ({ seat_id, zone_type: 201 });
  const discard = { seat_id: 255, zone_type: 103 };
  const move = (from, to, card_ids, move_type) => {
    f.receive(201005, { from_zone_info: from, to_zone_info: to, spell_id: 36, card_ids, move_type, card_num: card_ids.length });
    return f.events.findLast(event => event.type === 'move').data.cards.map(item => item.id);
  };
  assert.deepEqual(move(hand(0), hand(2), [card]), []);
  assert.deepEqual(move(hand(2), discard, [card], 3), [OTHER_CARD]);
  assert.deepEqual(move(discard, hand(0), [card, { card_id: OWN_CARD }]), [OTHER_CARD]);
  assert.deepEqual(move(discard, hand(2), [card]), []);
  assert.deepEqual(move(hand(2), discard, [card]), []);
});

test('a partial played-card return reveals only the already visible removed IDs', () => {
  const f = fixture();
  f.receive(201004, { seat_id: 0, card_num: 4,
    cards: [41202, 11102, 21100, 41102].map(card_id => ({ card_id })) });
  const move = { from_zone_info: { zone_type: 204 }, to_zone_info: { seat_id: 2, zone_type: 201 },
    card_ids: [{ card_id: 11102 }, { card_id: 41202 }], card_num: 2 };
  f.receive(201005, move);
  assert.deepEqual(f.events.at(-1).data.cards, []);
  assert.deepEqual(f.events.at(-1).data.removedPlayedIds, [11102, 41202]);
  f.receive(201004, { seat_id: 0, card_num: 2, hide_put: true,
    cards: [{ card_id: OWN_CARD }, { card_id: OTHER_CARD }] });
  f.receive(201005, { ...move, card_ids: [{ card_id: OWN_CARD }], card_num: 1 });
  assert.deepEqual(f.events.at(-1).data.cards, []);
  assert.deepEqual(f.events.at(-1).data.removedPlayedIds, []);
});

test('反馈、刚烈、遗计、红颜 project public gains from played cards without an explicit visibility list', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  const move = (skill, source, extra = {}) => {
    f.receive(201005, { from_zone_info: { seat_id: source, zone_type: 204 }, to_zone_info: { seat_id: 2, zone_type: 201 },
      spell_id: skill, card_num: 2, card_ids: [{ card_id: 11102 }, { card_id: 41202 }], ...extra });
    return f.events.findLast(row => row.type === 'move').data;
  };
  for (const [skill, source] of [[15, 0], [16, 2], [18, 2], [26, 0]]) {
    const publicGain = move(skill, source);
    assert.deepEqual(publicGain.cards.map(card => card.id), [11102, 41202]);
    assert.deepEqual(publicGain.toVisible.map(card => card.id), [11102, 41202]);
    assert.equal(publicGain.visibleSkill, skill);
  }
  const explicit = move(18, 2, { to_visible_hand_cards: [{ card: { card_id: 41202 }, position_index: 4 }] });
  assert.deepEqual(explicit.toVisible.map(({ id, position }) => [id, position]), [[41202, 4], [11102, undefined]]);
  const withoutCards = move(18, 2, { card_ids: [], card_num: 0,
    to_visible_hand_cards: [{ card: { card_id: 41202 }, position_index: 4 }] });
  assert.equal(withoutCards.count, 1);
  assert.deepEqual(withoutCards.cards.map(card => card.id), [41202]);
  assert.deepEqual(move(18, 2, { card_ids: [{ card_id: 0 }, { card_id: 11102, is_virtual: true }] }).cards, []);
  assert.deepEqual(move(15, 0, { from_zone_info: { zone_type: 201 } }).cards, []);
  assert.equal(move(100, 0).toVisible, undefined);
});

test('断粮 marks only cards known to have been publicly discarded, even for the recipient', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  const hand = seat_id => ({ seat_id, zone_type: 201 });
  const discard = { seat_id: 255, zone_type: 103 };
  const card_ids = [{ card_id: OWN_CARD }, { card_id: OTHER_CARD }];
  f.receive(201005, { from_zone_info: hand(0), to_zone_info: discard, spell_id: 36,
    move_type: 3, card_num: 1, card_ids: card_ids.slice(1) });
  f.receive(201005, { from_zone_info: discard, to_zone_info: hand(SELF), spell_id: 36, card_num: 2, card_ids });
  const gain = f.events.at(-1).data;
  assert.deepEqual(gain.cards.map(card => card.id), [OWN_CARD, OTHER_CARD]);
  assert.deepEqual(gain.toVisible.map(card => card.id), [OTHER_CARD]);
  assert.equal(gain.visibleSkill, 36);
  f.receive(201005, { from_zone_info: discard, to_zone_info: hand(2), spell_id: 36, card_num: 1, card_ids: card_ids.slice(1) });
  assert.deepEqual(f.events.at(-1).data.cards, []);
  assert.equal(f.events.at(-1).data.toVisible, undefined);
});

test('only the current public 蛊惑 reveal can mark a card returned to the same hand', () => {
  const f = fixture([{ id: 0 }, { id: SELF }, { id: 2 }]);
  const played = { seat_id: 2, zone_type: 204 };
  const card_ids = [{ card_id: OTHER_CARD }];
  const conceal = () => f.receive(201004, { seat_id: 2, hide_put: true, card_num: 1, cards: card_ids });
  const reveal = opt_seat_id => f.receive(201025, { from_zone_info: played, opt_seat_id, is_all: true, card_num: 1, card_ids });
  const takeBack = (extra = {}) => {
    f.receive(201005, { from_zone_info: played, to_zone_info: { seat_id: 2, zone_type: 201 }, spell_id: 29,
      move_type: 2, card_num: 1, card_ids, ...extra });
    return f.events.at(-1).data;
  };
  conceal();
  reveal(SELF);
  assert.deepEqual(takeBack().cards, []);
  assert.equal(f.events.at(-1).data.toVisible, undefined);
  conceal();
  reveal(255);
  const gain = takeBack();
  assert.deepEqual(gain.cards.map(card => card.id), [OTHER_CARD]);
  assert.deepEqual(gain.toVisible.map(card => card.id), [OTHER_CARD]);
  assert.equal(gain.visibleSkill, 29);
  assert.deepEqual(takeBack().cards, []);
  conceal();
  reveal(255);
  conceal(); // Do not carry a reveal over to the next concealed play.
  assert.deepEqual(takeBack().cards, []);
  conceal();
  reveal(255);
  assert.deepEqual(takeBack({ card_ids: [{ card_id: OWN_CARD }] }).cards, []);
});

test('connection, account, replay, seats and scope invalidate actions', () => {
  const f = fixture();
  f.deal();
  f.turn(token(1));
  f.proxy.ConnectedSucess1 = false;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.proxy.ConnectedSucess1 = true;
  f.proxy.ConnId++;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.proxy.ConnId--;
  f.identity.account = '79';
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.identity.account = '78';
  f.identity.replay = true;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.identity.replay = false;
  f.room.IsGameStart = false;
  assert.equal(f.transport.play([OWN_CARD]), false);
  f.scope.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.transport.play([OWN_CARD]), false);
  assert.equal(f.requests.length, 0);
});
