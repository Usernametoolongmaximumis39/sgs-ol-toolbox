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

export function watchNativeWindowEvents(scope, names, changed) {
  const caller = {};
  const events = ['OPEN_WINDOW', 'OPENED_WINDOW', 'UPDATE_WINDOW', 'HIDE_WINDOW', 'CLOSE_WINDOW', 'windowClosed'];
  let current = null;
  const subscribed = [];
  function onWindow(packet) {
    const name = typeof packet === 'string' ? packet : read(() => packet.WindowName);
    if (names.includes(name)) changed();
  }
  function bind(dispatcher) {
    if (current === dispatcher) return;
    for (const type of subscribed.splice(0)) {
      try { current.off(type, caller, onWindow); } catch { /* Dispatcher may be disposed. */ }
    }
    current = dispatcher;
    if (scope.signal.aborted || typeof dispatcher?.on !== 'function' || typeof dispatcher.off !== 'function') return;
    for (const type of events) {
      try { dispatcher.on(type, caller, onWindow); subscribed.push(type); } catch { /* Fallback polling remains available. */ }
    }
  }
  scope.add(() => bind(null));
  return bind;
}
