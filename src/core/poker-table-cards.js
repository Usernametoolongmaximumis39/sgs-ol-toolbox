import { isNativePokerTable } from '../shared/poker-table-mode.js';

const TABLE_CARD_SETTINGS = new Set(['reveals', 'countdown', 'fourColors', 'labels', 'revealColumns', 'revealOpacity']);

export function createPokerTableCards(settings) {
  const tables = new WeakMap();
  return {
    getSetting(key, fallback) {
      return TABLE_CARD_SETTINGS.has(key) ? settings.get(key, fallback) : fallback;
    },
    open(scene) {
      if (!isNativePokerTable(scene)) return null;
      const table = { hands: Object.freeze([]) };
      tables.set(scene, table);
      return {
        update(hands) {
          if (tables.get(scene) !== table) return;
          table.hands = Object.freeze(hands.map(({ seat, cards }) => Object.freeze({ seat,
            cards: Object.freeze(cards.map(({ id, suit, face, source }) => Object.freeze({ id, suit, face, source }))),
          })));
        },
        close() { if (tables.get(scene) === table) tables.delete(scene); },
      };
    },
    read(scene) { return isNativePokerTable(scene) ? tables.get(scene)?.hands ?? null : null; },
  };
}
