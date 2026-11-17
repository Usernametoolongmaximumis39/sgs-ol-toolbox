// Native ToolTip controls use roll-over/out, which a stationary touch does not
// reliably generate. Invoke only their tooltip handlers after touch release.
const read = fn => { try { return fn(); } catch { return undefined; } };
export function installTouchPreview(win, scope) {
  // Touch-capable PCs still use the desktop game's hover/click behavior.
  // iPadOS desktop mode identifies itself as a Mac with multiple touch points.
  const nav = win.navigator;
  const mobile = /Android|iPhone|iPad|iPod/i.test(nav?.userAgent || '')
    || (/Mac/i.test(nav?.platform || '') && nav?.maxTouchPoints > 1);
  if (!mobile) return;
  let stage, unbind = () => {}, down, pending, active, hold, expanded;
  const patched = new WeakSet();
  const close = () => { if (active) read(() => active.hide.call(active.node)); active = null;
    if (expanded) read(() => expanded.outHandler({ stopPropagation() {} })); expanded = null;
  };
  const cancel = () => { down = null; clearTimeout(hold); clearTimeout(pending); close(); };
  const point = e => {
    const native = e.nativeEvent?.changedTouches?.[0] || e.nativeEvent;
    return { x: native?.clientX ?? e.stageX, y: native?.clientY ?? e.stageY };
  };
  const parentOf = node => node.parentContainer || node.parent || node.render;
  const friendRow = target => {
    for (let node = target, i = 0; node && i < 24; node = parentOf(node), i++) {
      if (node.data?.FriendNickname && typeof node.itemCliCk === 'function' && typeof node.overHandler === 'function' && typeof node.SetOutState === 'function') return node;
    }
  };
  const guardFriend = row => {
    for (const node of [row, row.bg, row.overBg]) {
      if (!node?.event || patched.has(node)) continue;
      patched.add(node);
      scope.patch(node, 'event', original => function(type, e, ...args) {
        // These exact surfaces own the native menu click. Buttons inside the
        // expanded row keep their own invite/follow handlers.
        if (type === 'click' && (isTouch(e || {}) || down?.row === row)) return;
        if (type === 'mouseout' && expanded === row) return;
        return original.call(this, type, e, ...args);
      });
    }
  };
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
  const isTouch = e => {
    const native = e.nativeEvent;
    if (native?.pointerType) return native.pointerType === 'touch';
    return Boolean(native?.changedTouches?.length || native?.touches?.length);
  };
  const bind = () => {
    const next = win.Laya?.stage;
    if (next === stage) return;
    unbind(); cancel(); stage = next;
    if (!stage?.on || !stage?.off) return;
    const owner = {}, bound = stage, events = [];
    const listen = (type, fn) => { bound.on(type, owner, fn); events.push([type, fn]); };
    listen('mousedown', e => {
      const hitRow = friendRow(e.target);
      const action = hitRow && ![hitRow, hitRow.bg, hitRow.overBg].includes(e.target);
      if (isTouch(e) && action && expanded === hitRow) { down = null; clearTimeout(hold); clearTimeout(pending); return; }
      cancel();
      if (isTouch(e) && !(e.nativeEvent?.touches?.length > 1)) {
        const row = friendRow(e.target);
        // Do not reinterpret the native invite/follow buttons as row gestures.
        const surface = row && [row, row.bg, row.overBg].includes(e.target);
        down = { ...point(e), target: tooltip(e.target, e), row: surface ? row : null, moved: false };
        if (surface) {
          guardFriend(row);
          const start = down;
          hold = setTimeout(() => {
            if (down !== start || start.moved || row.destroyed || !parentOf(row) || row.data !== start.data) return;
            start.held = true; close(); read(() => row.itemCliCk(e));
          }, 500);
          start.data = row.data;
        }
      }
    });
    listen('mousemove', e => { if (down) { const p = point(e); if (Math.hypot(p.x - down.x, p.y - down.y) > 12) { down.moved = true; clearTimeout(hold); } } });
    listen('mouseup', e => {
      const start = down; down = null;
      clearTimeout(hold);
      if (start?.held) return;
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
        if (start.row) {
          if (start.row.data !== start.data) return;
          expanded = start.row;
          read(() => expanded.overHandler({ stopPropagation() {} }));
        }
        active = target; read(() => target.show.call(target.node, event));
      }, 0);
    });
    unbind = () => { for (const [type, fn] of events) bound.off(type, owner, fn); };
  };
  scope.listen(win.document, 'touchcancel', cancel, true);
  scope.listen(win.document, 'pointerdown', e => { if (e.pointerType !== 'touch') cancel(); }, true);
  scope.listen(win, 'blur', cancel);
  scope.interval(bind, 400); bind();
  scope.add(() => { unbind(); cancel(); });
}
