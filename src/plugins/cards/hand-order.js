// Native CardBaseType is a bit mask (BASIC=2, JINNANG=4, EQUIP=8).
export const HAND_GROUP_NAMES = ['杀', '闪', '桃酒', '未知', '顺拆', '输出', '杂项', '兵乐', '未知', '装备'];
const groups = [
  ['杀', '普通杀', '火杀', '火焰杀', '雷杀', '雷电杀', '冰杀', '冰霜杀'], ['闪'], ['桃', '酒'], [],
  ['顺手牵羊', '过河拆桥', '无中生有', '铁索连环'],
  ['决斗', '南蛮入侵', '万箭齐发', '火攻'], ['无懈可击', '五谷丰登', '桃园结义', '借刀杀人'],
  ['乐不思蜀', '兵粮寸断', '闪电'], [], [],
];
export function handTypeKey(card = {}) {
  if (card.IsEquipCard || card.CardBaseType === 8) return [9, 0];
  const name = String(card.CardName ?? card.name ?? card.Name ?? '');
  // Attribute Sha can share the displayed name “杀”; the native subtype
  // comparator remains the tie breaker for the attribute variants.
  if (card.FirstIndexSkillID === 1 || groups[0].includes(name)) {
    const cls = String(card.ClassName ?? card.cardClass ?? '').split('.').at(-1);
    const attribute = /^(?:火|雷|冰)/.test(name) || ['HuoShaNCard', 'LeiShaNCard', 'BingShaNCard'].includes(cls) || Number(card.SubType) > 0;
    return [0, attribute ? 1 : 0];
  }
  for (let group = 1; group < groups.length; group++) {
    const rank = groups[group].indexOf(name);
    if (rank >= 0) return [group, rank];
  }
  return [card.IsJinNangCard || card.CardBaseType === 4 ? 8 : 3, 0];
}
export function compareHandTypes(a, b) {
  const left = handTypeKey(a), right = handTypeKey(b);
  return left[0] - right[0] || left[1] - right[1];
}
export function handGroup(card, mode) {
  return mode === 'type' ? handTypeKey(card)[0] : mode === 'suit' ? Number(card?.FlowerOnSeat) || 0 : Number(card?.CardNumber) || 0;
}

// Consume spare width as group gaps first, then compress cards continuously.
// A hovered card retains the native full-width reveal before the next card.
export function groupedHandLayout(cards, mode, width, cardWidth, nativeGap = 2) {
  if (!cards.length || !(width >= cardWidth) || !(cardWidth > 0)) return null;
  const keys = cards.map(ui => handGroup(ui.Card, mode));
  const breaks = keys.map((key, i) => i > 0 && key !== keys[i - 1]);
  const count = breaks.filter(Boolean).length, n = cards.length;
  const normal = Math.max(0, nativeGap);
  const spare = width - n * cardWidth - (n - 1) * normal;
  const gap = count ? Math.max(0, Math.min(cardWidth * 0.25, spare / count)) : 0;
  const hovered = cards.slice(0, -1).filter(ui => ui.RollOvered).length;
  const compressible = n - 1 - hovered;
  const step = spare >= 0 ? cardWidth + normal : compressible > 0
    ? Math.max(0, (width - cardWidth - hovered * (cardWidth + normal)) / compressible) : cardWidth + normal;
  let x = 0;
  const positions = cards.map((ui, i) => {
    if (i) x += (cards[i - 1].RollOvered ? cardWidth + normal : step) + (breaks[i] ? gap : 0);
    return x;
  });
  return { positions, keys, gap, overlapping: step < cardWidth, width: x + cardWidth };
}
