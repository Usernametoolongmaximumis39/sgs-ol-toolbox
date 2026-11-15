import { readCatalogue, collectSkins } from './model.js';

const safe = fn => { try { return fn(); } catch { return undefined; } };
export const SKIN_CONFIG = 'cha_gs_dbs_fs_skininfo';

function existingInstance(registered, predicate) {
  if (registered && typeof registered === 'object' && safe(() => registered.destroyed) !== true && predicate(registered)) return registered;
  for (const key of ['instance', '_instance', 's_instance']) {
    const descriptor = safe(() => Object.getOwnPropertyDescriptor(registered, key));
    if (descriptor && 'value' in descriptor && safe(() => descriptor.value.destroyed) !== true && predicate(descriptor.value)) return descriptor.value;
  }
  return null;
}

function findManager(game, name, event, predicate) {
  const direct = existingInstance(safe(() => game.getClass(name)), predicate);
  if (direct) return direct;
  const raw = safe(() => game.getServerProxy()._events[event]);
  for (const entry of (Array.isArray(raw) ? raw.slice(0, 64) : [raw])) {
    const caller = safe(() => entry.caller);
    if (caller && safe(() => caller.destroyed) !== true && predicate(caller)) return caller;
  }
  return null;
}

export function resolveSkinRuntime(game) {
  const self = safe(() => game.getSelf());
  const rawId = safe(() => self.ClientId) ?? safe(() => self.clientId);
  const number = rawId === '' || rawId == null ? NaN : Number(rawId);
  const accountId = Number.isSafeInteger(number) && number > 0 ? String(number) : null;
  if (!accountId) return { accountId: null, ready: false, message: '等待登录账号数据。' };
  const skinManager = findManager(game, 'GeneralSkinManager', 'ClientSkinFromRep', value => typeof safe(() => value.GetSkinListBySkinID) === 'function');
  const goodsManager = findManager(game, 'GameGoodsManager', 'DbsCcMovegoodsRep', value => typeof safe(() => value.selfBagFinished) === 'boolean');
  if (!skinManager || !goodsManager) return { accountId, ready: false, message: '等待皮肤与背包接口；可在大厅打开背包后刷新。' };
  if (safe(() => goodsManager.selfBagFinished) !== true) return { accountId, ready: false, message: '背包尚未加载完成，暂不统计未拥有皮肤。' };
  return { accountId, skinManager, goodsManager, ready: true, message: '' };
}

function pause(scope) {
  return new Promise(resolve => {
    if (scope.signal.aborted) { resolve(false); return; }
    const finish = value => { scope.signal.removeEventListener('abort', abort); resolve(value); };
    const abort = () => finish(false);
    scope.signal.addEventListener('abort', abort, { once: true });
    scope.timeout(() => finish(true), 0);
  });
}

export function createSkinCollection(ctx) {
  let generation = 0;
  let observedRuntime = null;
  let snapshot = { status: 'waiting', message: '打开面板后读取当前账号皮肤收藏。', rows: [], accountId: null, at: null, excluded: 0 };
  const listeners = new Set();
  const publish = next => {
    snapshot = next;
    for (const fn of listeners) fn(snapshot);
  };
  const unavailable = runtime => ({ status: 'waiting', message: runtime.message, rows: [], accountId: runtime.accountId, at: null, excluded: 0 });
  const unchanged = (runtime, ticket) => {
    if (ctx.scope.signal.aborted || ticket !== generation) return false;
    const current = resolveSkinRuntime(ctx.game);
    return current.ready && current.accountId === runtime.accountId && current.skinManager === runtime.skinManager && current.goodsManager === runtime.goodsManager;
  };
  async function refresh() {
    if (ctx.scope.signal.aborted) return;
    const ticket = ++generation, runtime = resolveSkinRuntime(ctx.game);
    observedRuntime = runtime;
    if (!runtime.ready) { publish(unavailable(runtime)); return; }
    publish({ status: 'loading', message: '正在读取皮肤配置与当前背包…', rows: [], accountId: runtime.accountId, at: null, excluded: 0 });
    try {
      let config = ctx.game.getConfigData?.(SKIN_CONFIG);
      if (!config && typeof ctx.game.loadConfigData === 'function') config = await ctx.game.loadConfigData(SKIN_CONFIG);
      if (!unchanged(runtime, ticket)) { if (ticket === generation && !ctx.scope.signal.aborted) invalidate(); return; }
      const catalogue = readCatalogue(config);
      if (!catalogue.ready) {
        publish({ ...unavailable(runtime), message: '皮肤配置尚未就绪或格式不兼容，请稍后刷新。' });
        return;
      }
      const rows = [];
      // Keep a large official catalogue out of a single browser event turn.
      for (let start = 0; start < catalogue.rows.length; start += 160) {
        if (!unchanged(runtime, ticket)) { if (ticket === generation && !ctx.scope.signal.aborted) invalidate(); return; }
        rows.push(...collectSkins(catalogue.rows.slice(start, start + 160), id => runtime.skinManager.GetSkinListBySkinID(id)));
        if (start + 160 < catalogue.rows.length && !await pause(ctx.scope)) return;
      }
      if (unchanged(runtime, ticket)) publish({ status: 'ready', message: '', rows, accountId: runtime.accountId, at: Date.now(), excluded: catalogue.excluded });
      else if (ticket === generation && !ctx.scope.signal.aborted) invalidate();
    } catch (error) {
      if (ticket !== generation || ctx.scope.signal.aborted) return;
      if (!unchanged(runtime, ticket)) { invalidate(); return; }
      publish({ ...unavailable(runtime), status: 'error', message: '皮肤读取失败：' + String(error?.message || error).slice(0, 180) });
    }
  }
  function invalidate() {
    generation++;
    const runtime = resolveSkinRuntime(ctx.game);
    observedRuntime = runtime;
    publish({ ...unavailable(runtime), message: runtime.ready ? '账号或背包已变化，请刷新当前收藏。' : runtime.message });
  }
  function checkIdentity() {
    if (ctx.scope.signal.aborted || !snapshot.accountId) return;
    const runtime = resolveSkinRuntime(ctx.game);
    if (!runtime.ready || runtime.accountId !== snapshot.accountId || runtime.skinManager !== observedRuntime?.skinManager || runtime.goodsManager !== observedRuntime?.goodsManager) invalidate();
  }
  ctx.scope.add(() => { generation++; listeners.clear(); snapshot = { status: 'stopped', message: '', rows: [], accountId: null, at: null, excluded: 0 }; });
  return { refresh, checkIdentity, invalidate, getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
