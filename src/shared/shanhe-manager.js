const read = fn => { try { return fn(); } catch { return undefined; } };

export function shanheManager(game) {
  const valid = value => value && value.destroyed !== true
    && typeof read(() => value.RogueLikeDataReq) === 'function' && ('allDatas' in value || 'AllDatas' in value);
  const proxy = read(() => game.getServerProxy());
  for (const type of [102007, 'decodeRogueLikeDataSync']) {
    const handlers = read(() => proxy._events[type]);
    for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
      const caller = read(() => handler.caller);
      if (valid(caller)) return caller;
    }
  }
  const cls = read(() => game.getClass('RogueLikePveManager'));
  if (valid(cls)) return cls;
  for (const key of ['instance', '_instance', 'Instance']) {
    const descriptor = cls && Object.getOwnPropertyDescriptor(cls, key);
    if (descriptor && 'value' in descriptor && valid(descriptor.value)) return descriptor.value;
  }
  return null;
}
