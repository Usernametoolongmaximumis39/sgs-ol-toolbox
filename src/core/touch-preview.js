// Native ToolTip controls use roll-over/out, which a stationary touch does not
// reliably generate. Invoke only their tooltip handlers after touch release.
const read = fn => { try { return fn(); } catch { return undefined; } };
export function installTouchPreview(win, scope) {
  let stage, unbind = () => {}, down, pending, active;
  const close = () => { if (active) read(() => active.hide.call(active.node)); active = null; };
  const cancel = () => { down = null; clearTimeout(pending); close(); };
  const point = e => {
    const native = e.nativeEvent?.changedTouches?.[0] || e.nativeEvent;
    return { x: native?.clientX ?? e.stageX, y: native?.clientY ?? e.stageY };
  };
  const parentOf = node => node.parentContainer || node.parent || node.render;
  const tooltip = (target, e) => {
    // The game's flat-rendered icons are not Laya Sprites. Let the native
    // renderer resolve its frontmost texture instead of guessing icon bounds.
    const texture = read(() => target.getTextureByPosition(e.stageX, e.stageY));
    for (let node = texture || target, i = 0; node && i < 24; node = parentOf(node), i++) {
      if (node.destroyed || node.visible === false || node.renderVisible === false) return null;
      if (!read(() => node.ToolTip)) continue;
      for (const [show, hide] of [['onRollOver', 'tipsRollOut'], ['rollOverHandler', 'rollOutHandler']]) {
        if (typeof node[show] === 'function' && typeof node[hide] === 'function') return { node, show: node[show], hide: node[hide] };
      }
    }
    return null;
  };
  const isTouch = e => Boolean(e.nativeEvent?.changedTouches || e.nativeEvent?.touches || e.nativeEvent?.pointerType === 'touch');
  const bind = () => {
    const next = win.Laya?.stage;
    if (next === stage) return;
    unbind(); cancel(); stage = next;
    if (!stage?.on || !stage?.off) return;
    const owner = {}, bound = stage, events = [];
    const listen = (type, fn) => { bound.on(type, owner, fn); events.push([type, fn]); };
    listen('mousedown', e => {
      cancel();
      if (isTouch(e) && !(e.nativeEvent?.touches?.length > 1)) down = { ...point(e), target: tooltip(e.target, e), moved: false };
    });
    listen('mousemove', e => { if (down) { const p = point(e); if (Math.hypot(p.x - down.x, p.y - down.y) > 12) down.moved = true; } });
    listen('mouseup', e => {
      const start = down; down = null;
      if (!start || start.moved || !start.target) return;
      const end = point(e), target = tooltip(e.target, e);
      if (Math.hypot(end.x - start.x, end.y - start.y) > 12 || target?.node !== start.target.node) return;
      const event = { stageX: e.stageX ?? bound.mouseX, stageY: e.stageY ?? bound.mouseY };
      // Wait for Laya's release roll-out and the original click action.
      pending = setTimeout(() => {
        if (scope.closed || target.node.destroyed || target.node.visible === false || !parentOf(target.node)) return;
        let parent = target.node;
        for (let i = 0; parent && parent !== bound && i < 64; i++, parent = parentOf(parent)) {
          if (parent.destroyed || parent.visible === false || parent.renderVisible === false) return;
        }
        if (parent !== bound) return;
        active = target; read(() => target.show.call(target.node, event));
      }, 0);
    });
    unbind = () => { for (const [type, fn] of events) bound.off(type, owner, fn); };
  };
  scope.listen(win.document, 'touchcancel', cancel, true);
  scope.listen(win.document, 'pointerdown', cancel, true);
  scope.listen(win, 'blur', cancel);
  scope.interval(bind, 400); bind();
  scope.add(() => { unbind(); cancel(); });
}
