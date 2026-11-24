import test from 'node:test';
import assert from 'node:assert/strict';
import { createPokerSkillActions } from '../src/plugins/poker-lobby/live/skill-actions.js';
import { cardFace } from '../src/plugins/poker-lobby/replay/model.js';

const firstIndex = { high: 8, low: 9 };
const nextIndex = { high: 10, low: 9 };

function fixture(profile = () => ({})) {
  const sent = [];
  const seen = [];
  const hand = [10401, 20501, 30901, 41101].map(id => cardFace(id));
  let option;
  const skills = createPokerSkillActions({
    send(id, body, action) { sent.push({ id, body, action }); return true; },
    publish(type, data) { seen.push({ type, data }); },
    getSelfSeat: () => 0,
    getHand: () => hand,
    getSeats: () => [0, 1, 2].map(id => ({ id })),
    getSkill: profile,
    getCurrentOption: () => option,
  });
  function accept(id, data) {
    skills.accept(id, { Id: id, Data: { ProtoObj: data } });
  }
  function offer(kind, index, data = {}) {
    option = { kind, optionKey: `${index.high}:${index.low}` };
    accept(kind === 'play' ? 201001 : 201030, { opt_index: index, ...data });
    return option.optionKey;
  }
  return {
    ...skills, accept, offer, sent, hand,
    assign(...ids) { accept(201013, { notify_generals: [{ seat_id: 0, generals: [{ id: 8014, skills: ids }] }] }); },
    last(type) { return seen.findLast(event => event.type === type)?.data; },
  };
}

test('an assigned card-and-target skill uses the current own turn and authoritative use limit', () => {
  const f = fixture(id => ({ Name: id === 1 ? '仁德' : '', TimeLimitGame: 1, NeedHasDealCardRight: true }));
  f.assign(1);
  assert.equal(f.activateSkill(1), false);
  const optionKey = f.offer('play', firstIndex);
  assert.deepEqual(f.last('skill-state').skills, [{ id: 1, name: '仁德', enabled: true, remaining: 1 }]);
  assert.equal(f.activateSkill(1), true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), [41101, 30901]);
  assert.deepEqual(f.last('skill-options').targets, [1, 2]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [10401], targetSeats: [1] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [41101], targetSeats: [0] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [41101], targetSeats: [1] }), true);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [41101], targetSeats: [1] }), false);
  assert.deepEqual(f.sent, [{ id: 201027, action: 'skill-choice',
    body: { spell_id: 1, spell_effect: 0, cards: [41101], targets: [1], putCards: [] } }]);
  f.accept(201029, { seat: 0, spell_id: 1, is_use: true, cnt: 1 });
  assert.equal(f.last('skill-options').skill, null);
  assert.equal(f.last('skill-state').skills[0].remaining, 0);
  assert.equal(f.activateSkill(1), false);
});

test('强易 separates target and card steps even when the own seat appears only in the seat list', () => {
  const f = fixture();
  const targetKey = f.offer('skill', firstIndex, { opt_seat: 2, opt_seat_list: [0], opt_type: 3, spell_id: 100, options: [1] });
  assert.deepEqual(f.last('skill-options').targets, [1, 2]);
  assert.equal(f.last('skill-options').giveFromHand, undefined);
  assert.equal(f.submitSkillChoice({ optionKey: targetKey, targetSeats: [1] }), true);
  const cardKey = f.offer('skill', nextIndex, { opt_type: 3, spell_id: 100, options: [2] });
  assert.equal(f.last('skill-options').kind, 'cards');
  assert.equal(f.last('skill-options').giveFromHand, true);
  assert.equal(f.last('skill-options').canCancel, false);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), f.hand.map(card => card.id));
  assert.equal(f.submitSkillChoice({ optionKey: targetKey, cardIds: [10401] }), false);
  const [removed] = f.hand.splice(1, 1);
  assert.equal(f.submitSkillChoice({ optionKey: cardKey, cardIds: [removed.id] }), false);
  assert.equal(f.submitSkillChoice({ optionKey: cardKey, cardIds: [10401] }), true);
  assert.deepEqual(f.sent, [
    { id: 201031, action: 'skill-choice', body: { opt_type: 1, options: [1], spell_id: 100 } },
    { id: 201031, action: 'skill-choice', body: { opt_type: 2, options: [10401], spell_id: 100 } },
  ]);
});

test('concealed supplied cards expose opaque IDs and send only the chosen offered ID', () => {
  const f = fixture(() => ({ WatchCardWindowHideCardColorAndNumber: true }));
  const optionKey = f.offer('skill', firstIndex, {
    opt_type: 2, spell_id: 45, data_cards: [{ card_id: 21401 }, { card_id: 20601 }, { card_id: 40801 }],
  });
  assert.deepEqual(f.last('skill-options').cards, [1, 2, 3].map(id => ({ id, hidden: true, face: '暗牌' })));
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [21401] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [2] }), true);
  assert.deepEqual(f.sent, [{ id: 201031, action: 'skill-choice', body: { options: [20601] } }]);
});

test('missing native visibility metadata keeps own cards visible and masks foreign options', () => {
  const f = fixture();
  f.offer('skill', firstIndex, { opt_type: 2, spell_id: 45, data_cards: [{ card_id: 10401 }, { card_id: 40801 }] });
  const [own, foreign] = f.last('skill-options').cards;
  assert.equal(own.id, 10401);
  assert.equal(own.hidden, undefined);
  assert.deepEqual(foreign, { id: 1, hidden: true, face: '暗牌' });
});

test('观星 shows the offered jokers and only sends a copy of a selectable card', () => {
  const f = fixture(() => ({ Name: '观星', WatchCardWindowHideCardColorAndNumber: false }));
  const optionKey = f.offer('skill', firstIndex, {
    opt_type: 2, spell_id: 3, data_cards: [{ card_id: 21401 }, { card_id: 51700 }, { card_id: 40801 }],
  });
  const { cards, copyCard } = f.last('skill-options');
  assert.equal(copyCard, true);
  assert.deepEqual(cards.map(card => [card.id, Boolean(card.disabled)]), [[21401, false], [51700, true], [40801, false]]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [51700] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [40801] }), true);
  assert.deepEqual(f.sent, [{ id: 201031, action: 'skill-choice', body: { options: [40801] } }]);
});

test('权计 sends exactly one hand card followed by one card from the confirmed own pile', () => {
  const f = fixture();
  f.assign(47);
  f.accept(201005, {
    spell_id: 47,
    to_zone_info: { seat_id: 0, zone_type: 203 },
    card_ids: [{ card_id: 21101 }, { card_id: 41301 }],
  });
  const optionKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(47), true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.choiceGroup), ['手牌', '手牌', '手牌', '手牌', '权', '权']);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [10401, 21101, 41301] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [21101, 41301] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [21101, 10401] }), true);
  assert.deepEqual(f.sent[0].body.cards, [10401, 21101]);
});

test('奇谋 follows a supported predecessor shape and accepts the recorded weaker triple-with-single', () => {
  const f = fixture();
  const combination = [40500, 10900, 30900, 40900];
  f.hand.splice(0, f.hand.length, ...[...combination, 20900, 10600].map(id => cardFace(id)));
  f.assign(24);
  const bomb = [11400, 21400, 31400, 41400].map(card_id => ({ card_id }));
  f.offer('play', firstIndex, { predecessor_cards: bomb, predecessor_typ: 9000 });
  assert.equal(f.activateSkill(24), false);
  const predecessor = [11400, 21400, 31400, 10400].map(card_id => ({ card_id }));
  const optionKey = f.offer('play', nextIndex, { predecessor_cards: predecessor, predecessor_typ: 31 });
  assert.equal(f.activateSkill(24), true);
  assert.equal(f.last('skill-options').min, 4);
  assert.equal(f.last('skill-options').max, 4);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [40500, 10900] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [10900, 20900, 30900, 40900] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [40500, 10600, 10900, 30900] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: combination }), true);
  assert.deepEqual(f.sent[0].body.putCards, combination.map(card_id => ({ card_id, wild_num: 0 })));
});

test('无双 encodes the recorded boost, excludes A and above, and cannot tie a preceding A', () => {
  const f = fixture(() => ({ SkillParam1: 8 }));
  f.hand.splice(0, f.hand.length, ...[10500, 11400, 21500, 51600].map(id => cardFace(id)));
  f.assign(21);
  const optionKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(21), true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), [10500]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [11400] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [10500] }), true);
  assert.deepEqual(f.sent[0].body.putCards, [{ card_id: 10500, wild_num: 0, spell_num: 13 }]);
  f.offer('play', nextIndex, { predecessor_cards: [{ card_id: 11400 }], predecessor_typ: 1 });
  assert.equal(f.activateSkill(21), false);
});

test('双雄 requires two natural cards of the same rank and uses the recorded pair boost', () => {
  const f = fixture(() => ({ SkillParam1: 6 }));
  f.hand.splice(0, f.hand.length,
    ...[30300, 40300, 10500, 20500, 30500, 11400, 21400].map(id => cardFace(id, 0, 0, 0, id === 30500 ? 28 : 0)));
  f.assign(34);
  const predecessor = [{ card_id: 10700 }, { card_id: 20700 }];
  const optionKey = f.offer('play', firstIndex, { predecessor_cards: predecessor, predecessor_typ: 2 });
  assert.equal(f.activateSkill(34), true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), [30300, 40300, 10500, 20500]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [30300, 20500] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [10500, 30500] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [30300, 40300] }), true);
  assert.deepEqual(f.sent[0].body.putCards,
    [30300, 40300].map(card_id => ({ card_id, wild_num: 0, spell_num: 9 })));
});

test('连营 sends four physical cards and a virtual spade for the missing rank in the recorded straight', () => {
  const f = fixture();
  const ids = [41200, 11400, 21100, 21000];
  f.hand.splice(0, f.hand.length, ...ids.map(id => cardFace(id)));
  f.assign(13);
  const optionKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(13), true);
  const menu = f.last('skill-options');
  assert.deepEqual([menu.min, menu.max], [4, 4]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: ids.slice(0, 3) }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: ids }), true);
  assert.deepEqual(f.sent[0].body.putCards, [
    ...ids.map(card_id => ({ card_id, wild_num: 0, spell_num: 0, spell_suit: 0 })),
    { card_id: 0, wild_num: 0, spell_num: 13, spell_suit: 1 },
  ]);
});

test('连营 picks the highest leading straight and the lowest straight that beats a five-card predecessor', () => {
  const f = fixture();
  const ids = [10500, 20600, 30700, 40800];
  f.hand.splice(0, f.hand.length, ...ids.map(id => cardFace(id)));
  f.assign(13);
  let optionKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(13), true);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: ids }), true);
  assert.equal(f.sent.at(-1).body.putCards.at(-1).spell_num, 9);
  const predecessor = [10300, 10400, 10500, 10600, 10700].map(card_id => ({ card_id }));
  optionKey = f.offer('play', nextIndex, { predecessor_cards: predecessor, predecessor_typ: 1005 });
  assert.equal(f.activateSkill(13), true);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: ids }), true);
  assert.equal(f.sent.at(-1).body.putCards.at(-1).spell_num, 4);
});

test('连营 cannot answer other patterns or consume duplicate ranks and uses physical wildcard ranks separately', () => {
  const f = fixture();
  const ids = [11000, 21100, 31400, 40300, 21000];
  f.hand.splice(0, f.hand.length, ...ids.map(id => cardFace(id, 0, 0, 0, id === 40300 ? 28 : 0)));
  f.assign(13);
  f.offer('play', firstIndex, { predecessor_cards: [{ card_id: 10300 }, { card_id: 20300 }], predecessor_typ: 2 });
  assert.equal(f.activateSkill(13), false);
  const optionKey = f.offer('play', nextIndex);
  assert.equal(f.activateSkill(13), true);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [11000, 21100, 31400, 21000] }), false);
  assert.equal(f.sent.length, 0);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: ids.slice(0, 4) }), true);
  assert.deepEqual(f.sent[0].body.putCards.slice(-2), [
    { card_id: 40300, wild_num: 12, spell_num: 0, spell_suit: 0 },
    { card_id: 0, wild_num: 0, spell_num: 13, spell_suit: 1 },
  ]);
});

test('local cancellation closes the menu without sending and verified server cancellation sends only once', () => {
  const f = fixture();
  f.assign(3);
  const playKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(3), true);
  assert.equal(f.submitSkillChoice({ optionKey: playKey, cancel: true }), true);
  assert.equal(f.last('skill-options').local, true);
  assert.equal(f.sent.length, 0);
  const skillKey = f.offer('skill', nextIndex, { opt_type: 1, data_use_skill: { spell_id: 23 } });
  assert.equal(f.last('skill-options').kind, 'confirm');
  assert.equal(f.last('skill-options').askToTrigger, true);
  assert.deepEqual(f.last('skill-options').choices, [{ id: 1, label: '确定' }]);
  assert.equal(f.submitSkillChoice({ optionKey: skillKey, cancel: true }), true);
  assert.equal(f.submitSkillChoice({ optionKey: skillKey, cancel: true }), false);
  assert.deepEqual(f.sent, [{ id: 201023, action: 'skill-choice', body: {} }]);
});

test('突袭 card selection is required and the reveal does not authorize cancellation', () => {
  const f = fixture(() => ({ WatchCardWindowHideCardColorAndNumber: false }));
  const pickKey = f.offer('skill', firstIndex, {
    opt_type: 2, spell_id: 17, data_cards: [{ card_id: 31000 }, { card_id: 41000 }],
  });
  assert.equal(f.last('skill-options').canCancel, false);
  assert.equal(f.submitSkillChoice({ optionKey: pickKey, cancel: true }), false);
  assert.equal(f.submitSkillChoice({ optionKey: pickKey, cardIds: [41000] }), true);
  const revealKey = f.offer('skill', nextIndex, {
    opt_type: 6, spell_id: 17, data_cards: [{ card_id: 20800 }, { card_id: 10900 }],
  });
  assert.equal(f.last('skill-options').canCancel, false);
  assert.equal(f.submitSkillChoice({ optionKey: pickKey, cancel: true }), false);
  assert.equal(f.submitSkillChoice({ optionKey: revealKey, cancel: true }), false);
  assert.deepEqual(f.sent, [{ id: 201031, action: 'skill-choice', body: { options: [41000] } }]);
});

test('丰姿 respects the middle position in the recorded nineteen-card hand', () => {
  const f = fixture();
  const ids = [21500, 31500, 11400, 11300, 21300, 31300, 11200, 21200, 31200, 11100,
    10700, 10600, 20600, 30600, 30500, 40500, 20300, 21502, 20302];
  f.hand.splice(0, f.hand.length, ...ids.map(id => cardFace(id)));
  f.assign(42);
  f.accept(201034, { datas: [{ seat_id: 0, skillDatas: [{ skill: 42, datas: [1, 0, 1] }] }] });
  const optionKey = f.offer('play', firstIndex);
  assert.equal(f.activateSkill(42), true);
  assert.equal(f.last('skill-options').fromHand, true);
  assert.equal(f.last('skill-options').copyCard, true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), [31200]);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [20300] }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cardIds: [31200] }), true);
  assert.deepEqual(f.sent[0].body.cards, [31200]);
  f.hand.push(cardFace(31202));
  f.offer('play', nextIndex);
  assert.equal(f.activateSkill(42), false);
});

test('丰姿 position candidates follow native wildcard, suit and copy ordering', () => {
  const f = fixture();
  const ids = [21200, 21202, 31200, 30300, 10500];
  f.hand.splice(0, f.hand.length, ...ids.map(id => cardFace(id, 0, 0, 0, id === 30300 ? 28 : 0)));
  f.assign(42);
  f.offer('play', firstIndex);
  assert.equal(f.activateSkill(42), true);
  assert.deepEqual(f.last('skill-options').cards.map(card => card.id), [30300, 21200, 10500]);
});

test('unknown skill options send nothing and cannot be retried after table cleanup', () => {
  const f = fixture();
  const optionKey = f.offer('skill', firstIndex, { opt_type: 8, spell_id: 99, options: [0, 1] });
  assert.equal(f.last('skill-options').kind, 'unsupported');
  assert.equal(f.submitSkillChoice({ optionKey, option: 1 }), false);
  assert.equal(f.submitSkillChoice({ optionKey, cancel: true }), false);
  f.reset();
  assert.equal(f.submitSkillChoice({ optionKey, option: 1 }), false);
  assert.equal(f.sent.length, 0);
});
