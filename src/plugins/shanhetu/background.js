import { ResourceScope } from '../../core/resources.js';

// Replay the scene handler registered by the official SELECT_WALLPAPER action
// after entry has settled. The official setter skips an already selected ID.
export function createBackgroundPreference(ctx) {
  let entry = null, error = '';
  const listeners = new Set();
  const enabled = () => ctx.settings.get('keepBattleBackground', true) === true;
  const scene = () => ctx.game.getScene?.();
  const account = () => ctx.game.getSelf?.()?.ClientId ?? null;
  const name = current => current && (current.SceneName || current.sceneName || current.name);
  function publishError(value = '') { if (error !== value) { error = value; for (const fn of listeners) fn(); } }
  function cancelJob(current) { current.job?.dispose(); current.job = null; }
  function clearEntry() { if (entry) { entry.scope.dispose(); entry = null; } publishError(); }
  function valid(current) {
    return !ctx.scope.signal.aborted && !current.scope.closed && enabled()
      && entry === current && scene() === current.scene && !current.scene.destroyed && account() === current.account;
  }
  function handler(current, event) {
    const entries = current.dispatcher._events?.[event];
    return (Array.isArray(entries) ? entries : [entries]).find(value => value?.caller === current.scene && typeof value.method === 'function');
  }
  function ready(current) { return handler(current, 'SELECT_WALLPAPER') && handler(current, 'BACKGROUND_USEDID_GOT'); }
  function apply(current) {
    if (!valid(current) || !current.needed) return;
    if (current.scene.currentWeatherWallPaper > 0) return;
    const official = ready(current) && handler(current, 'SELECT_WALLPAPER');
    if (!official) return;
    // This is the exact callback captured by the native button's selection event.
    // It reads the native saved selection, then uses normal native ID loading.
    // Do not call the Rogue scene's wallpaper hook, which forces the chapter ID.
    current.needed = false; current.applying = true;
    try {
      Reflect.apply(official.method, official.caller, []);
      if (valid(current)) publishError();
    } catch (error) {
      if (valid(current)) publishError(error?.stack || String(error));
    } finally { current.applying = false; }
  }
  function schedule(current, delay = 1000) {
    if (!valid(current) || !current.needed) return;
    cancelJob(current);
    if (current.scene.currentWeatherWallPaper > 0 || !ready(current)) return;
    const job = new ResourceScope(); current.job = job;
    job.timeout(() => {
      if (current.job !== job) return;
      current.job = null; job.dispose(); apply(current);
    }, delay);
  }
  function attach(currentScene, dispatcher) {
    const local = new ResourceScope();
    const current = { scene: currentScene, dispatcher, account: account(), scope: local, job: null,
      needed: true, applying: false, fight: null };
    entry = current;
    local.add(() => cancelJob(current));
    const listen = (event, fn) => {
      dispatcher.on(event, current, fn);
      local.add(() => dispatcher.off(event, current, fn));
    };
    listen('BACKGROUND_LOAD_COMPLETE', () => {
      if (!current.applying && valid(current) && current.needed) schedule(current, 150);
    });
    listen('BACKGROUND_USEDID_GOT', (...args) => {
      // Rogue's forced background event has one scalar argument. Native saved
      // selection uses [id, ""], including when the selected image is ID 24.
      if (args.length !== 1 || !['number', 'string'].includes(typeof args[0]) || Number(args[0]) !== 24 || current.applying || !valid(current)) return;
      current.needed = true; schedule(current);
    });
    listen('UPDATE_ROGUE_INFO', data => {
      if (!valid(current) || !(Number(data?.fight_id) > 0)) return;
      const fight = String(data.round_id ?? '') + ':' + String(data.fight_id);
      if (current.fight === fight) return;
      current.fight = fight; current.needed = true; schedule(current);
    });
    listen('SELECT_WALLPAPER', () => {
      if (!valid(current)) return;
      current.needed = false; cancelJob(current); publishError();
    });
    return current;
  }
  function refresh() {
    if (ctx.scope.signal.aborted) return;
    if (!enabled()) { clearEntry(); return; }
    const current = scene();
    if (name(current) !== 'RogueLikeGameScene' || current.destroyed) {
      clearEntry(); return;
    }
    const dispatcher = ctx.game.getDispatcher?.();
    if (!dispatcher?.on || !dispatcher?.off) { clearEntry(); return; }
    if (!entry || entry.scene !== current || entry.dispatcher !== dispatcher || entry.account !== account()) {
      clearEntry(); attach(current, dispatcher);
    }
    if (entry.needed && !entry.job) schedule(entry);
  }
  ctx.scope.add(() => { listeners.clear(); clearEntry(); });
  refresh();
  return { refresh, get error() { return error; }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
