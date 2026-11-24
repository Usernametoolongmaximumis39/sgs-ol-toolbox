export const POKER_MODE = 175;
export const POKER_SECTION = 2;

export function isPokerTableId(tableId) {
  // The native room label subtracts (section * 1000 + mode) * 100000.
  return Number.isSafeInteger(tableId)
    && Math.floor(tableId / 100000) === POKER_SECTION * 1000 + POKER_MODE;
}
