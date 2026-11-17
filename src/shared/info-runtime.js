// Read only known native paths; this module is bundled into each information plugin.
export const read = fn => { try { return fn(); } catch { return undefined; } };
export function account(ctx) {
  const login = manager(ctx, 'LoginManager', 'error', m => 'IsOnLine' in m || 'IsAccountLoggingOut' in m);
  if (read(() => login.IsAccountLoggingOut) === true || read(() => login.IsOnLine) === false) return { id: '', nickname: '' };
  const self = read(() => ctx.game.getSelf());
  const id = read(() => self.ClientId) ?? read(() => self.clientId);
  return { id: /^(?:[1-9]\d*)$/.test(String(id)) ? String(id) : '', nickname: String(read(() => self.NickName) ?? read(() => self.nickname) ?? '') };
}
export function manager(ctx, name, event, guard) {
  const type = read(() => ctx.game.getClass(name));
  const valid = value => value && read(() => value.destroyed) !== true && read(() => guard(value));
  if (valid(type)) return type;
  for (const key of ['instance', '_instance', 'Instance', 's_instance']) {
    const descriptor = read(() => Object.getOwnPropertyDescriptor(type, key));
    if (descriptor && 'value' in descriptor && valid(descriptor.value)) return descriptor.value;
  }
  const handlers = read(() => ctx.game.getServerProxy()._events[event]);
  for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) if (valid(read(() => handler.caller))) return handler.caller;
  return null;
}
export function field(packet, key) {
  for (const node of [packet, read(() => packet.Protocol), read(() => packet.ProtoObj), read(() => packet.protoObj),
    read(() => packet.data.protoObj), read(() => packet.data.ProtoObj)]) {
    const value = read(() => node[key]); if (value !== undefined && value !== null) return value;
  }
}
// Projection happens before the client can reuse its packet. Work/storage/UI is deferred.
export function observeNative(ctx, project, consume, gap = () => {}) {
  let bound = null, releases = [], queue = [], scheduled = false, overflow = false, gapDetail = null;
  const caller = {};
  const flush = () => {
    scheduled = false;
    if (ctx.scope.signal.aborted) return;
    const batch = queue; queue = [];
    if (overflow) { overflow = false; const detail = gapDetail; gapDetail = null; gap(detail); return; }
    for (const item of batch) {
      if (item.account.id && item.account.id === account(ctx).id) { try { consume(item.type, item.data, item.account); } catch (e) { gap({ reason: 'consume', type: item.type, message: String(e?.message || e) }); } }
    }
  };
  const enqueue = (type, packet) => {
    try {
      const data = project[type](packet); if (data == null) return;
      if (queue.length >= 256) { overflow = true; gapDetail = { reason: 'overflow', type }; queue = []; }
      if (!overflow) queue.push({ type, data, account: account(ctx) });
    } catch (e) { overflow = true; gapDetail = { reason: 'projection', type, message: String(e?.message || e) }; queue = []; }
    if (!scheduled) { scheduled = true; ctx.scope.timeout(flush, 0); }
  };
  function bind() {
    const proxy = read(() => ctx.game.getServerProxy());
    if (proxy === bound) return;
    for (const release of releases) release(); releases = [];
    if (bound) { queue = []; gap({ reason: 'rebind' }); }
    bound = proxy;
    if (typeof read(() => proxy.on) !== 'function' || typeof read(() => proxy.off) !== 'function') return;
    for (const type of Object.keys(project)) {
      const handler = packet => enqueue(type, packet);
      proxy.on(type, caller, handler);
      releases.push(ctx.scope.add(() => proxy.off(type, caller, handler)));
    }
  }
  bind(); ctx.scope.interval(bind, 500);
  ctx.scope.add(() => { queue = []; for (const release of releases) release(); releases = []; bound = null; });
}
export function generalNames(config) {
  const names = {};
  for (const row of config?.GameCharacters?.character || []) {
    const id = Number(row.id ?? row.a), name = row.name ?? row.b;
    if (id > 0 && name) names[id] = String((row.name_prefix ?? row.ai ?? '') + name);
  }
  return names;
}
export function downloadJSON(ctx, filename, value) {
  const url = ctx.window.URL.createObjectURL(new ctx.window.Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = ctx.document.createElement('a'); a.href = url; a.download = filename; a.click();
  const release = ctx.scope.add(() => ctx.window.URL.revokeObjectURL(url)); ctx.scope.timeout(release, 1000);
}
