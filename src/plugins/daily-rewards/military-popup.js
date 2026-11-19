// Native reward types: TYPE_JUNDIAN_AWARD / TYPE_NEWJUNDIAN_AWARD.
const types = { jd: 86, 'new-jd': 2046 };
export function createMilitaryPopupGuard(ctx, account, now = Date.now) {
  const leases = new Map(), dispatchers = new WeakSet(), managers = new WeakSet();
  let sending = false;
  ctx.scope?.add(() => leases.clear());
  function prepare(activity) {
    const dispatcher = ctx.game.getDispatcher?.();
    if (typeof dispatcher?.event === 'function' && !dispatchers.has(dispatcher)) {
      dispatchers.add(dispatcher);
      // The native opener is renamed between releases; both emit OPEN_WINDOW.
      ctx.scope.patch(dispatcher, 'event', original => function (...args) {
        const [event, data] = args;
        if (event === 'OPEN_WINDOW' && data?.WindowName === 'OldbackOneClickDrawAwdWin' && data.Data?.[1] === true) {
          const lease = leases.get(Number(data.Data[2]));
          if (lease && !ctx.scope.signal.aborted && lease.owner === account() && now() < lease.until) return false;
        }
        return Reflect.apply(original, this, args);
      });
    }
    if (activity && !managers.has(activity)) {
      managers.add(activity);
      for (const [kind, method] of [['jd', 'SendGetJDRewardReq'], ['new-jd', 'SendGetNewJDRewardReq']]) {
        if (typeof activity[method] !== 'function') continue;
        ctx.scope.patch(activity, method, original => function (...args) {
          // A manual claim takes ownership while an automatic reply is pending.
          if (!sending) leases.delete(types[kind]);
          return Reflect.apply(original, this, args);
        });
      }
    }
  }
  return (key, activity, send) => {
    const kind = /^activity:(new-jd|jd):/.exec(key)?.[1];
    if (!kind || !ctx.scope?.patch) return send();
    prepare(activity);
    const type = types[kind], previous = leases.get(type);
    leases.set(type, { owner: account(), until: now() + 15000 });
    sending = true;
    try {
      const result = send();
      if (result === false) { if (previous) leases.set(type, previous); else leases.delete(type); }
      return result;
    } catch (error) {
      if (previous) leases.set(type, previous); else leases.delete(type);
      throw error;
    } finally { sending = false; }
  };
}
