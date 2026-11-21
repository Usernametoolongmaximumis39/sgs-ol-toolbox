import { read } from './safe-read.js';

export function findNativeListenerOwner(proxy, events, accepts) {
  for (const event of events) {
    const handlers = read(() => proxy._events[event]);
    for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
      const caller = read(() => handler.caller);
      if (accepts(caller)) return caller;
    }
  }
  return null;
}
