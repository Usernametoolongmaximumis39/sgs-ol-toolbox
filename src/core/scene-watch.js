const SCENE_EVENTS = ['SWITCH_SCENE', 'HIDE_WINDOW'];

// Align periodic core reads and share only a synchronous view of the scene.
// Explicit reads outside a poll still see native state immediately.
export function createSceneWatch({ game, scope }) {
  const started = performance.now(), watchers = new Set();
  let dispatcher = null, releaseDispatcher, signalPending = false, timer, scheduledAt;

  function schedule() {
    if (scope.closed) return;
    let next = Infinity;
    for (const watcher of watchers) next = Math.min(next, watcher.due);
    if (next === scheduledAt) return;
    clearTimeout(timer);
    scheduledAt = next;
    if (Number.isFinite(next)) timer = setTimeout(() => {
      scheduledAt = undefined;
      run();
      schedule();
    }, Math.max(1, Math.ceil(started + next - performance.now())));
  }

  function watch(callback, interval, onSignal = false) {
    const elapsed = performance.now() - started;
    const watcher = { callback, interval, onSignal, due: (Math.floor(elapsed / interval) + 1) * interval };
    watchers.add(watcher);
    schedule();
    return () => { watchers.delete(watcher); schedule(); };
  }

  function run(signaled = false) {
    if (scope.closed) return;
    const elapsed = performance.now() - started;
    const due = [...watchers].filter(watcher => elapsed >= watcher.due || (signaled && watcher.onSignal));
    if (!due.length) return;
    game.withSceneCycle(() => {
      for (const watcher of due) {
        if (scope.closed || !watchers.has(watcher)) continue;
        if (elapsed >= watcher.due) watcher.due = (Math.floor(elapsed / watcher.interval) + 1) * watcher.interval;
        try { watcher.callback(); } catch { /* A subscriber cannot interrupt the rest of the poll. */ }
      }
    });
  }

  function syncDispatcher() {
    game.getScene();
    const next = game.getDispatcher();
    if (dispatcher === next) return;
    releaseDispatcher?.();
    dispatcher = next;
    releaseDispatcher = null;
    if (typeof next?.on !== 'function' || typeof next.off !== 'function') return;
    const caller = {};
    const signal = () => {
      if (scope.closed || next !== dispatcher || signalPending) return;
      signalPending = true;
      // The dispatcher may notify before mounting the new scene or window.
      queueMicrotask(() => { signalPending = false; run(true); schedule(); });
    };
    const subscribed = [];
    for (const event of SCENE_EVENTS) {
      try { next.on(event, caller, signal); subscribed.push(event); } catch { /* Poll when events are unavailable. */ }
    }
    releaseDispatcher = () => {
      for (const event of subscribed) {
        try { next.off(event, caller, signal); } catch { /* The client may already have disposed the dispatcher. */ }
      }
    };
  }

  watch(syncDispatcher, 500, true);
  scope.add(() => { clearTimeout(timer); watchers.clear(); dispatcher = null; releaseDispatcher?.(); });
  return { watch };
}
