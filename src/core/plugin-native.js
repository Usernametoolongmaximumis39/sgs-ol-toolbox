import { findNativeListenerOwner } from '../shared/native-manager.js';
import { read } from '../shared/safe-read.js';
import { ResourceScope } from './resources.js';
import { createAchievementQueries } from './native-achievements.js';

const achievementsByGame = new WeakMap();

export function readNativeAccount(ctx) {
  const login = manager(ctx, 'LoginManager', 'error', m => 'IsOnLine' in m || 'IsAccountLoggingOut' in m);
  const online = read(() => login.IsOnLine);
  if (read(() => login.IsAccountLoggingOut) === true || online === false) return { id: '', nickname: '' };
  const self = read(() => ctx.game.getSelf());
  const id = read(() => self.ClientId) ?? read(() => self.clientId);
  const selfId = /^(?:[1-9]\d*)$/.test(String(id)) ? String(id) : '';
  const nickname = selfId ? String(read(() => self.NickName) || read(() => self.Nickname) || read(() => self.nickname) || '') : '';
  if (selfId && nickname) return { id: selfId, nickname };
  // Classic may not expose a user model until after reconnect. Never use a
  // nickname from a different account or from a connection that has ended.
  const account = online === true && read(() => ctx.game.getLoginAccount?.());
  if (account?.id && (!selfId || selfId === account.id)) return { ...account };
  return { id: selfId, nickname: '' };
}
function manager(ctx, name, event, guard) {
  const type = read(() => ctx.game.getClass(name));
  const valid = value => value && read(() => value.destroyed) !== true && read(() => guard(value));
  if (valid(type)) return type;
  for (const key of ['instance', '_instance', 'Instance', 's_instance']) {
    const descriptor = read(() => Object.getOwnPropertyDescriptor(type, key));
    if (descriptor && 'value' in descriptor && valid(descriptor.value)) return descriptor.value;
  }
  return findNativeListenerOwner(read(() => ctx.game.getServerProxy()), [event], valid);
}

// Projection happens before the client can reuse its packet. Work/storage/UI is deferred.
function observeNative(ctx, project, consume, gap = () => {}, { scope = ctx.scope } = {}, onBound) {
  if (ctx.scope.signal.aborted || scope.signal.aborted) return () => {};
  const observation = new ResourceScope();
  const stop = ctx.scope.add(() => observation.dispose());
  if (scope !== ctx.scope) observation.add(scope.add(stop));
  let bound = null, releases = [], queue = [], scheduled = false, overflow = false, gapDetail = null;
  const caller = {};
  const flush = () => {
    scheduled = false;
    if (observation.signal.aborted) return;
    const batch = queue; queue = [];
    if (overflow) { overflow = false; const detail = gapDetail; gapDetail = null; gap(detail); return; }
    for (const item of batch) {
      if (observation.closed) break;
      if (item.account.id && item.account.id === readNativeAccount(ctx).id) { try { consume(item.type, item.data, item.account); } catch (e) { gap({ reason: 'consume', type: item.type, message: String(e?.message || e) }); } }
    }
  };
  const enqueue = (type, packet, proxy) => {
    if (observation.closed) return;
    try {
      const projectPacket = project[type];
      const data = onBound ? projectPacket(packet, proxy) : projectPacket(packet);
      if (data == null) return;
      if (queue.length >= 256) { overflow = true; gapDetail = { reason: 'overflow', type }; queue = []; }
      if (!overflow) queue.push({ type, data, account: readNativeAccount(ctx) });
    } catch (e) { overflow = true; gapDetail = { reason: 'projection', type, message: String(e?.message || e) }; queue = []; }
    if (!scheduled) { scheduled = true; observation.timeout(flush, 0); }
  };
  function bind() {
    const proxy = read(() => ctx.game.getServerProxy());
    if (proxy === bound) return;
    for (const release of releases) release(); releases = [];
    onBound?.(null);
    if (bound) { queue = []; gap({ reason: 'rebind' }); }
    if (observation.closed) return;
    bound = proxy;
    if (typeof read(() => proxy.on) !== 'function' || typeof read(() => proxy.off) !== 'function') return;
    for (const type of Object.keys(project)) {
      const handler = packet => enqueue(type, packet, proxy);
      proxy.on(type, caller, handler);
      releases.push(observation.add(() => proxy.off(type, caller, handler)));
    }
    onBound?.(proxy);
  }
  observation.add(() => { queue = []; for (const release of releases) release(); releases = []; bound = null; });
  try { bind(); observation.interval(bind, 500); }
  catch (error) { stop(); throw error; }
  return stop;
}

export function createPluginNative(ctx) {
  return {
    account: () => readNativeAccount(ctx),
    manager: (name, event, guard) => manager(ctx, name, event, guard),
    observe: (project, consume, gap, options) => observeNative(ctx, project, consume, gap, options),
    get achievements() {
      let service = achievementsByGame.get(ctx.game);
      if (!service) {
        const root = { game: ctx.game, scope: new ResourceScope() };
        const native = createPluginNative(root);
        service = createAchievementQueries({ account: native.account, manager: native.manager,
          getServerProxy: () => root.game.getServerProxy(),
          observe: (project, consume, gap, onBound) => observeNative(root, project, consume, gap, undefined, onBound),
        }, ctx.now ?? Date.now);
        achievementsByGame.set(ctx.game, service);
      }
      return {
        ready: service.ready,
        query: () => ctx.scope.closed ? null : service.query(),
        subscribe: (receive, gap = () => {}, { strict = false } = {}) => service.subscribe(ctx.scope, receive, gap, strict),
      };
    },
  };
}
