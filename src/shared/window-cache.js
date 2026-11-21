import { read } from './info-runtime.js';
import { isNativeNodeMounted } from './native-tree.js';

// Read the dispatcher-owned cache without calling GetWindow, which can create or reset a popup.
// Undefined means this client has no recognized cache. Null means the known cache has no entry.
export function cachedNativeWindow(dispatcher, name) {
  const handlers = read(() => dispatcher._events.OPEN_WINDOW);
  for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
    const dict = read(() => handler.caller.WindowInstanceDict);
    if (typeof dict?.getStringKey !== 'function') continue;
    try { return dict.getStringKey(name) ?? null; } catch {}
  }
}

export function isMountedWindowNode(stage, node) {
  return isNativeNodeMounted(node, stage, 64);
}
