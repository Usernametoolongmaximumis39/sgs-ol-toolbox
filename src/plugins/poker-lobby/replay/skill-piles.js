const MAX_PILE_CARDS = 64;

export function groupSkillCards(cards, count, skill = 0) {
  const groups = new Map();
  const tagged = [...new Set(cards.map(card => card.areaSkill).filter(Boolean))];
  const inferred = skill || (tagged.length === 1 ? tagged[0] : 0);
  const total = Math.min(MAX_PILE_CARDS, Math.max(count, cards.length));
  for (let index = 0; index < total; index++) {
    const card = cards[index];
    const area = card?.areaSkill || inferred;
    const group = groups.get(area) || [];
    group.push(card?.id ? card : null);
    groups.set(area, group);
  }
  return Array.from(groups, ([skill, cards]) => ({ skill, cards }));
}

export function stashSkillCards(piles, added) {
  const grouped = new Map(piles.map(pile => [pile.skill, pile]));
  for (const { skill, cards } of added) {
    const held = [...(grouped.get(skill)?.cards || [])];
    const known = new Set(held.map(card => card?.id).filter(Boolean));
    for (const card of cards) {
      if (held.length === MAX_PILE_CARDS) break;
      if (card?.id && known.has(card.id)) continue;
      if (card?.id) known.add(card.id);
      held.push(card);
    }
    grouped.set(skill, { skill, cards: held });
  }
  return [...grouped.values()];
}

export function recoverSkillCards(piles, cards, count, skill) {
  if (!piles.length || count <= 0) return piles;
  const ids = new Set(cards.map(card => card.id).filter(Boolean));
  let unresolved = count;
  const updated = piles.map(pile => {
    const held = pile.cards.filter(card => !(card?.id && ids.has(card.id)));
    unresolved -= pile.cards.length - held.length;
    return held.length === pile.cards.length ? pile : { ...pile, cards: held };
  });
  if (unresolved <= 0) return updated.filter(pile => pile.cards.length);
  const tagged = [...new Set(cards.map(card => card.areaSkill).filter(Boolean))];
  const focus = tagged.length === 1 ? tagged[0] : skill;
  let index = focus ? updated.findIndex(pile => pile.skill === focus) : -1;
  if (index < 0 && updated.length === 1) index = 0;
  if (index >= 0) {
    const pile = updated[index];
    const left = Math.max(0, pile.cards.length - unresolved);
    const visible = pile.cards.filter(Boolean);
    // A return whose identity is missing may have removed a previously visible card.
    const known = ids.size >= count && visible.length <= left ? visible : [];
    updated[index] = { ...pile, cards: [...known, ...Array(left - known.length).fill(null)] };
    return updated.filter(pile => pile.cards.length);
  }
  // An unassigned transfer can't leave any of the prior face-up identities certain.
  const left = Math.max(0, updated.reduce((total, pile) => total + pile.cards.length, 0) - unresolved);
  return groupSkillCards([], left);
}
