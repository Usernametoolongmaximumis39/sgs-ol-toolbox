const read = fn => { try { return fn(); } catch { return undefined; } };
const SHOP_WINDOW = 'RogueJiShiWindow';
export const CHOICE_WINDOWS = ['RogueAwardSelectWindow', 'RogueCampSelectWindow'];

export function mounted(node, stage) {
  for (let depth = 0; node && depth < 24; depth++, node = node.parent) {
    if (node.destroyed || node.visible === false) return false;
    if (node === stage) return true;
  }
  return false;
}

export function nativeWindow(game, stage, name) {
  const handlers = read(() => game.getDispatcher()._events.OPEN_WINDOW);
  for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
    const dict = read(() => handler.caller.WindowInstanceDict);
    const win = read(() => dict.getStringKey(name)) || read(() => dict.get(name));
    if (mounted(win, stage)) return win;
  }
  return null;
}

export function createSchoolWindowSync(ctx, sync) {
  const caller = {};
  let dispatcher = null, win = null, refreshButton = null, tabGroup = null;
  let queued = false;

  function schedule() {
    if (queued) return;
    queued = true;
    // Read after the native listeners finish mounting or rebuilding the window.
    Promise.resolve().then(() => {
      queued = false;
      if (!ctx.scope.signal.aborted) sync();
    });
  }
  const onWindow = name => { if (name === SHOP_WINDOW || CHOICE_WINDOWS.includes(name)) schedule(); };
  const onOpen = event => onWindow(event?.WindowName);
  const windowEvents = [['OPEN_WINDOW', onOpen], ['OPENED_WINDOW', onWindow], ['windowClosed', onWindow]];
  function setDispatcher(next) {
    if (dispatcher === next) return;
    for (const [event, handler] of windowEvents) {
      dispatcher?.off(event, caller, handler);
      next?.on(event, caller, handler);
    }
    dispatcher = next;
  }
  function setRefreshButton(next) {
    if (refreshButton === next) return;
    refreshButton?.off('click', caller, schedule);
    next?.on('click', caller, schedule);
    refreshButton = next;
  }
  function setTabGroup(next) {
    if (tabGroup === next) return;
    tabGroup?.off('TAP_CLICKED', caller, schedule);
    next?.on('TAP_CLICKED', caller, schedule);
    tabGroup = next;
  }
  function update(enabled) {
    const stage = enabled && ctx.window?.Laya?.stage;
    const ged = stage && ctx.game.getDispatcher?.();
    setDispatcher(typeof ged?.on === 'function' && typeof ged.off === 'function' ? ged : null);
    const candidate = stage ? nativeWindow(ctx.game, stage, SHOP_WINDOW) : null;
    const next = candidate?.panel && !candidate.panel.destroyed ? candidate : null;
    const button = next?.refreshBtn;
    setRefreshButton(typeof button?.on === 'function' && typeof button.off === 'function' ? button : null);
    const tabs = next?.tabGroup;
    setTabGroup(typeof tabs?.on === 'function' && typeof tabs.off === 'function' ? tabs : null);
    const opened = Boolean(next && next !== win);
    win = next;
    return { win, opened };
  }

  ctx.scope.add(() => { setTabGroup(null); setRefreshButton(null); setDispatcher(null); });
  return { update };
}

export function windowByClass(game, stage, name) {
  const cls = read(() => game.getClass(name));
  if (typeof cls !== 'function') return null;
  const stack = [stage];
  for (let i = 0; i < 768 && stack.length; i++) {
    const node = stack.pop();
    if (!node || node.destroyed || node.visible === false) continue;
    if (node instanceof cls) return node;
    if (Array.isArray(node._children)) stack.push(...node._children.slice(0, 256));
  }
  return null;
}
