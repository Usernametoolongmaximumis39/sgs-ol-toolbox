export const RANKS = Object.freeze([
  [17, '大王'], [16, '小王'], [15, '2'], [14, 'A'], [13, 'K'], [12, 'Q'], [11, 'J'],
  [10, '10'], [9, '9'], [8, '8'], [7, '7'], [6, '6'], [5, '5'], [4, '4'], [3, '3'],
]);

export const POKER_ZONE = Object.freeze({ DECK: 101, DISCARD: 103, BOTTOM: 104, HAND: 201, OUTSIDE: 203, PLAYED: 204 });

export function originalRank(id) {
  if (!Number.isSafeInteger(id) || id % 100 !== 0) return 0;
  if (id === 51600 || id === 51700) return (id - 50000) / 100;
  const suit = Math.floor(id / 10000);
  const rank = (id % 10000) / 100;
  return suit >= 1 && suit <= 4 && rank >= 3 && rank <= 15 ? rank : 0;
}

export function trackRemainingCards() {
  const { DECK, DISCARD, BOTTOM, HAND, OUTSIDE, PLAYED } = POKER_ZONE;
  const outOfPlay = new Map();
  let cachedHand, cachedCounts;

  function remember(id, zone) {
    if (!originalRank(id) || (outOfPlay.get(id) || 0) === zone) return;
    if (zone) outOfPlay.set(id, zone);
    else outOfPlay.delete(id);
    cachedCounts = undefined;
  }

  return {
    play(cards) {
      for (const card of cards) if (!card.virtual) remember(card.id, PLAYED);
    },
    move(from, to, cards, count) {
      const retired = to === DISCARD || to === OUTSIDE || to === PLAYED;
      const available = to === 0 || to === DECK || to === BOTTOM || to === HAND;
      if (!retired && !available) return;
      const fromRetired = from === DISCARD || from === OUTSIDE || from === PLAYED;
      if (fromRetired && cards.length < count && (available || from !== to)) {
        // A hidden return or transfer makes the last known position uncertain.
        for (const [id, zone] of outOfPlay) if (zone === from) remember(id, 0);
      }
      for (const card of cards) if (!card.virtual) remember(card.id, retired ? to : 0);
    },
    counts(hand) {
      if (cachedCounts && cachedHand === hand) return cachedCounts;
      const excluded = new Set(outOfPlay.keys());
      for (const card of hand) if (!card.virtual && originalRank(card.id)) excluded.add(card.id);
      const counts = Object.fromEntries(RANKS.map(([rank]) => [rank, rank > 15 ? 1 : 4]));
      for (const id of excluded) counts[originalRank(id)]--;
      cachedHand = hand;
      cachedCounts = counts;
      return counts;
    },
  };
}
