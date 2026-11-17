import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHandTypes, handTypeKey, groupedHandLayout } from '../src/plugins/cards/hand-order.js';
import { sortHand } from '../src/plugins/cards/native.js';

const names = ['杀', '火杀', '闪', '桃', '酒', '新基本牌', '顺手牵羊', '过河拆桥', '无中生有', '铁索连环', '决斗', '南蛮入侵', '万箭齐发', '火攻', '无懈可击', '五谷丰登', '桃园结义', '借刀杀人', '乐不思蜀', '兵粮寸断', '闪电', '新锦囊', '装备甲', '装备乙'];
const cards = names.map((CardName, i) => ({ CardId: i + 1, CardName, CardBaseType: i >= 22 ? 8 : i >= 6 ? 4 : 2 }));
test('requested ten groups and within-group card priorities, including native attribute Sha', () => {
  const shuffled = cards.slice().reverse();
  shuffled.sort((a, b) => compareHandTypes(a, b) || a.CardId - b.CardId);
  assert.deepEqual(shuffled.map(c => c.CardName), names);
  assert.deepEqual(handTypeKey({ CardName: '杀', FirstIndexSkillID: 1, SubType: 7 }), [0, 1]);
  assert.deepEqual(handTypeKey({ CardName: '杀', FirstIndexSkillID: 1, SubType: 0 }), [0, 0]);
  assert.deepEqual(handTypeKey({ CardName: '新锦囊', IsJinNangCard: true }), [8, 0]);
});
test('native sort sees final order before sync and restores comparator even on errors', () => {
  const equipmentOrder = (a, b) => b.CardId - a.CardId;
  const seat = { HandCards: cards.slice().reverse(), SortHandCardsCompare: equipmentOrder };
  let synced;
  const hand = { seat, cardUis: seat.HandCards.map(Card => ({ Card, Selected: Card.CardId === 4 })),
    SortNormalCards() {
      seat.HandCards.sort(seat.SortHandCardsCompare);
      this.cardUis.sort((a, b) => seat.SortHandCardsCompare(a.Card, b.Card));
      synced = this.cardUis.map(ui => ui.Card.CardName);
    } };
  assert.equal(sortHand({ getSelfSeatUI: () => ({ cardContainer: hand }) }, 'type'), true);
  assert.deepEqual(synced, [...names.slice(0, -2), '装备乙', '装备甲']);
  assert.equal(seat.SortHandCardsCompare, equipmentOrder);
  assert.equal(hand.cardUis.find(ui => ui.Card.CardId === 4).Selected, true);
  hand.SortNormalCards = () => { throw new Error('native failure'); };
  assert.throws(() => sortHand({ getSelfSeatUI: () => ({ cardContainer: hand }) }, 'type'), /native failure/);
  assert.equal(seat.SortHandCardsCompare, equipmentOrder);
});
test('quarter-card gaps shrink continuously before cards overlap and never overflow', () => {
  const hand = ['杀', '杀', '闪', '桃'].map(CardName => ({ Card: { CardName } }));
  const roomy = groupedHandLayout(hand, 'type', 600, 100, 1);
  assert.equal(roomy.gap, 25);
  assert.deepEqual(roomy.positions, [0, 101, 227, 353]);
  assert.equal(groupedHandLayout(hand, 'type', 423, 100, 1).gap, 10);
  assert.equal(groupedHandLayout(hand, 'type', 403, 100, 1).gap, 0);
  for (let width = 100; width <= 600; width++) {
    const layout = groupedHandLayout(hand, 'type', width, 100, 1);
    assert.ok(layout.width <= width + 1e-8);
    assert.ok(layout.positions.every((x, i) => !i || x >= layout.positions[i - 1]));
  }
  assert.equal(groupedHandLayout(hand, 'type', 350, 100, 1).overlapping, true);
  hand[1].RollOvered = true;
  const hover = groupedHandLayout(hand, 'type', 350, 100, 1);
  assert.equal(hover.positions[2] - hover.positions[1], 101);
  assert.ok(hover.width <= 350);
});
test('suit and number gaps separate only unequal values', () => {
  const hand = [1, 1, 2].map(n => ({ Card: { FlowerOnSeat: n, CardNumber: n } }));
  for (const mode of ['suit', 'number']) assert.deepEqual(groupedHandLayout(hand, mode, 400, 100, 1).positions, [0, 101, 227]);
  assert.equal(groupedHandLayout([], 'type', 500, 100), null);
  assert.equal(groupedHandLayout(hand, 'type', 50, 100), null);
});
