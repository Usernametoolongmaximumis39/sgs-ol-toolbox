import { POKER_MODE, POKER_SECTION } from '../poker-room.js';

export function withClassicPokerContext(win, scene, run, opening = false) {
  const context = win.GameContext || win.Laya?.ClassUtils?.getClass?.('GameContext');
  const self = scene.SelfSeatUi?.Seat;
  if (!context || !self) return run();
  const seats = [];
  for (const ui of scene.seatContainer.seatUIs) seats[ui.Seat.Index] = ui.Seat;
  // Legacy windows read static room fields synchronously while they draw or
  // submit an action. The actual room and the router continue to own them.
  const fields = {
    mode_type: POKER_MODE,
    groupID: POKER_SECTION,
    selfSeatIndex: self.Index,
    seatCount: scene.seatContainer.seatUIs.length,
    seats,
    ...(opening && { IsDouDuZhu2023: true }),
  };
  const restore = [];
  try {
    for (const [key, value] of Object.entries(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(context, key);
      if (descriptor?.configurable === false) continue;
      Object.defineProperty(context, key, { configurable: true, writable: true, value });
      restore.push([key, descriptor]);
    }
    return run();
  } finally {
    for (const [key, descriptor] of restore.reverse()) {
      if (descriptor) Object.defineProperty(context, key, descriptor);
      else delete context[key];
    }
  }
}
