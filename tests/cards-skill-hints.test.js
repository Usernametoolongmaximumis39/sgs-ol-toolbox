import test from 'node:test';
import assert from 'node:assert/strict';
import { skillHints, reduceSkillHints, SKILL_HINT_GROUPS } from '../src/plugins/cards/skill-hints.js';

const meta = {
  1: { name: '杀', number: 1, suit: 1, type: 1 },
  2: { name: '闪', number: 2, suit: 2, type: 1 },
  3: { name: '桃', number: 3, suit: 3, type: 1 },
  4: { name: '无中生有', number: 4, suit: 4, type: 2 },
  5: { name: '乐不思蜀', number: 5, suit: 1, type: 2 },
  6: { name: '杀', number: 6, suit: 3, type: 1 },
  7: { name: '闪', number: 7, suit: 4, type: 1 },
  8: { name: '杀', number: 8, suit: 2, type: 1 },
  9: { name: '杀', number: 9, suit: 1, type: 1 },
  10: { name: '杀', number: 10, suit: 3, type: 1 },
};
const getMeta = id => meta[id] || {};
const state = () => ({ active: true, sessionId: 'a', deckStartSeq: 1, turn: 1, selfSeatId: 0, currentSeatId: 0, historyComplete: true, seenHistoryComplete: true, cards: {}, zones: {}, deckIds: [1,2,3,4,5,6,7,8,9,10] });
const options = { getMeta, selfHand: [1,2,3,7], skills: Object.values(SKILL_HINT_GROUPS).flatMap(x => [...x.ids, ...x.names]) };
const row = (s, id, extra = {}) => skillHints(s, { ...options, ...extra }).find(r => r.id === id);
function event(s, type, data, seq = 1) { reduceSkillHints(s, data, seq, type); }

test('hand-only calculations use own cards, exclude delay tricks and include equipment only for Shuangxiong', () => {
  const s = state();
  assert.deepEqual(row(s, 'quandao', { selfHand: [1,4,5] }).counts, { slash: 1, trick: 1 });
  assert.deepEqual(row(s, 'xiasheng').counts, { red: 2, black: 2, unknown: 0 });
  assert.deepEqual(row(s, 'shuangxiong', { selfEquipment: [9] }).counts, { red: 3, black: 2, unknown: 0 });
  s.cards[99] = { id: 99, locations: ['5:1'] };
  assert.equal(row(s, 'xiasheng', { selfHand: undefined }).counts.unknown, 0);
});

test('Ziyuan returns an actual unique-card subset summing to 13 and never uses a card twice', () => {
  const s = state(), result = row(s, 'mizhu');
  assert.equal(result.cardIds.reduce((sum,id) => sum + meta[id].number, 0), 13);
  assert.equal(new Set(result.cardIds).size, result.cardIds.length);
  assert.match(row(s, 'mizhu', { selfHand: [7] }).text, /没有/);
});

test('Yanjiao partitions identities into disjoint equal groups, maximizing used count', () => {
  const s = state();
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 945, Param: 0, Type: 28, Params: [1,2,3,6] });
  const p = row(s, 'yanjiao').partition;
  assert.equal(p.left.reduce((n,id) => n + meta[id].number, 0), p.right.reduce((n,id) => n + meta[id].number, 0));
  assert.equal(new Set([...p.left,...p.right]).size, 4);
});

test('Chengxiang respects sum <= 13 and the 2024 sum-13 priority', () => {
  const s = state();
  event(s, 'PubGsCMoveCard', { SpellID: 3492, ToZone: 8, MoveType: 6, CardIDs: [1,2,3,10], CardCount: 4 });
  const r = row(s, 'chengxiang');
  assert.equal(r.cardIds.reduce((n,id) => n + meta[id].number, 0), 13);
  assert.equal(new Set(r.cardIds).size, r.cardIds.length);
});

test('Yicheng calculates real exchange candidates with more points and same card count', () => {
  const s = state();
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 3440, Param: 0, Type: 28, SeatID: 0, Params: [1,2] });
  const r = row(s, 'yicheng', { selfHand: [7,8] });
  assert.ok(r.exchanges.length);
  for (const x of r.exchanges) {
    assert.equal(x.from.length, x.to.length);
    assert.ok(x.from.reduce((n,id) => n+meta[id].number,0) > x.to.reduce((n,id) => n+meta[id].number,0));
  }
});

test('Jizhan and Hezhong label counts as unseen cards and never claim live pile probability', () => {
  const s = state();
  s.cards[10] = { seen: true }; s.seenHistoryComplete = false;
  event(s, 'PubGsCMoveCard', { SpellID: 3033, FromZone: 1, ToZone: 8, CardIDs: [6], CardCount: 1 });
  event(s, 'PubGsCMoveCard', { SpellID: 3329, FromID: 0, CardIDs: [6], CardCount: 1 }, 2);
  for (const key of ['jizhan', 'hezhong']) {
    const r = row(s, key); assert.deepEqual(r.counts, { greater: 3, less: 5, equal: 1 });
    assert.match(r.text, /记录不完整/); assert.match(r.text, /不是实时牌堆概率/);
  }
});

test('Guhuo only reports unseen card names without declaring truth or reading another hand', () => {
  const s = state(); s.cards[1] = { seen: true, locations: ['5:2'] };
  const r = row(s, 'guhuo'); assert.equal(r.counts['杀'], 4); assert.equal(r.counts['乐不思蜀'], undefined); assert.match(r.text, /不能据此判断/);
});

test('Yanxi separates confirmed membership from unknown and does not promote ambiguous ownership', () => {
  const s = state(); s.cards[1] = { locations: ['5:1'] }; s.cards[2] = { locations: ['1:255'] }; s.cards[3] = { locations: ['5:1','1:255'] }; s.zones['1:255'] = { top: [2] };
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 7017, SrcSeatID: 0, Param: 1, Type: 28, Params: [1,2,3] });
  const r = row(s, 'yanxi'); assert.match(r.text, /杀：已知手牌/); assert.match(r.text, /闪：已知牌堆牌/); assert.match(r.text, /桃：归属未知/);
});

test('forging, Jiaoyu and Luanji retain observed data, reject outgoing and clear at gap or identity change', () => {
  const s = state();
  event(s, 'PubGsCUseSpell', { SpellID: 2143, SeatID: 0, CardIDs: [1,4] });
  assert.deepEqual(row(s, 'luanji', { skills: [2143] }).usedSuits, [1,4]);
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 11003, SrcSeatID: 2, Param: 0, Type: 28, Params: [1,2] }, 2);
  assert.deepEqual(row(s, 'duanzao').cardIds, [1,2]);
  event(s, 'PubGsCMoveCard', { SpellID: 3571, SrcSeatID: 0, FromZone: 3, ToZone: 8, MoveType: 6, CardCount: 2, CardIDs: [1,4] }, 3);
  assert.deepEqual(row(s, 'jiaoyu').counts, { red: 1, black: 1, unknown: 0 });
  event(s, 'toolbox:gap', {}); assert.equal(row(s, 'duanzao'), undefined);
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 11003, SrcSeatID: 2, Param: 0, Type: 28, Params: [1,2], isSend: true });
  assert.equal(row(s, 'duanzao'), undefined);
  s.active = false; assert.deepEqual(skillHints(s, options), []);
});

test('bounded solver handles 32 cards and refuses invalid metadata without mutating inputs', () => {
  const s = state(), ids = Array.from({length:32}, (_,i) => i+1), before = structuredClone(s);
  const result = skillHints(s, { getMeta: id => ({ name:'杀', number:id%13+1,suit:1,type:1 }), selfHand: ids, skills:['资援'] });
  assert.equal(result[0].cardIds.reduce((sum,id) => sum+id%13+1,0),13);
  assert.deepEqual(s,before);
  assert.equal(row(s, 'mizhu', { selfHand: [99] }), undefined);
});

test('response windows work for nonowners, ignore malformed packets, and clear after card movement', () => {
  const s = state();
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 945, Param: 0, Type: 28, Params: [1,2,3] });
  assert.ok(row(s, 'yanjiao', { skills: [] }));
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 945, Param: 0, Type: 28, Params: [1,1,3] }, 2);
  assert.equal(row(s, 'yanjiao', { skills: [] }), undefined);
  event(s, 'GsCRoleOptTargetNtf', { SpellID: 945, Param: 0, Type: 28, Params: [1,2,3] }, 3);
  event(s, 'PubGsCMoveCard', { SpellID: 945, FromZone: 8, ToZone: 5, CardCount: 1, CardIDs: [1] }, 4);
  assert.equal(row(s, 'yanjiao', { skills: [] }), undefined);
});

test('partial own-hand snapshots are labelled as known cards, not full-hand conclusions', () => {
  const s = state(); s.zones['5:0'] = { count: 9 };
  assert.match(row(s, 'mizhu', { selfHand: [7] }).text, /已知手牌/);
  assert.match(row(s, 'xiasheng').text, /已知手牌/);
});
