import { ResourceScope } from './resources.js';

const KEY = Symbol.for('sgs.ol.toolbox.core');
// Reserve synchronously before any async boot. Dev supersedes public editions;
// duplicate public scripts and later public scripts cannot replace a live owner.
export function startOwnedRuntime(win, edition, start) {
  const previous = win[KEY];
  if (previous && (previous.distribution === 'dev' || edition !== 'dev')) return previous.ready || Promise.resolve(previous);
  previous?.dispose?.();
  const scope = new ResourceScope();
  const api = { distribution: edition, scope, dispose() {
    scope.dispose();
    if (win[KEY] === api) delete win[KEY];
  } };
  win[KEY] = api;
  api.ready = (async () => {
    // Wait for superseded async boot/cleanup before touching shared storage or game.
    try { await previous?.ready; } catch {}
    if (scope.closed) return null;
    try { return await start(api); }
    catch (error) { api.dispose(); throw error; }
  })();
  return api.ready;
}
