const MARGIN = 8;
const GAP = 10;
const DURATION = 320;
const FIELDS = ['x', 'y', 'scaleX', 'scaleY'];
const transform = view => ({ x: view.x, y: view.y, scaleX: view.scaleX, scaleY: view.scaleY });
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// Keep both native frames in view. The dock is a child so it inherits the
// window's stacking and visibility, with its bounds entirely left of the frame.
export function dockToLeft(ctx, laya, view, panel) {
  const stage = laya.stage;
  const win = ctx.window;
  const base = transform(view);
  let applied, goal, frame = 0, closing = false;

  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  }

  function place(next) {
    view.scale(next.scaleX, next.scaleY);
    view.pos(next.x, next.y);
    applied = transform(view);
  }

  function move(next, animate, finish) {
    stop();
    const from = transform(view);
    if (!animate || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        FIELDS.every(field => from[field] === next[field])) {
      place(next);
      finish();
      return;
    }
    const start = win.performance.now();
    function tick(now) {
      frame = 0;
      if (view.destroyed || panel.destroyed) return;
      const progress = clamp((now - start) / DURATION, 0, 1);
      if (progress === 1) {
        place(next);
        finish();
        return;
      }
      const eased = progress * progress * (3 - 2 * progress);
      const position = {};
      for (const field of FIELDS) position[field] = from[field] + (next[field] - from[field]) * eased;
      place(position);
      if (!closing) panel.alpha = eased;
      frame = win.requestAnimationFrame(tick);
    }
    frame = win.requestAnimationFrame(tick);
  }

  function capture() {
    for (const field of FIELDS) {
      if (!applied || view[field] !== applied[field]) base[field] = view[field];
    }
  }

  function restore() {
    stop();
    goal = null;
    if (view.destroyed || !applied) return;
    capture();
    view.scale(base.scaleX, base.scaleY);
    view.pos(base.x, base.y);
    applied = null;
  }

  function update(animate = false) {
    if (closing || !view.parent || view.destroyed || panel.destroyed) return;
    capture();
    const start = view.parent.globalToLocal(new laya.Point(MARGIN, MARGIN));
    const end = view.parent.globalToLocal(new laya.Point(stage.width - MARGIN, stage.height - MARGIN));
    const dockWidth = panel.width + GAP;
    const height = Math.max(view.height, panel.height);
    const factor = Math.min(1, (end.x - start.x) / ((view.width + dockWidth) * base.scaleX),
      (end.y - start.y) / (height * base.scaleY));
    if (!Number.isFinite(factor) || factor <= 0) return;

    const scaleX = base.scaleX * factor, scaleY = base.scaleY * factor;
    const left = clamp(base.x - view.pivotX * base.scaleX, start.x + dockWidth * scaleX, end.x - view.width * scaleX);
    const top = clamp(base.y - view.pivotY * base.scaleY + view.height * (base.scaleY - scaleY) / 2,
      start.y, end.y - height * scaleY);
    panel.pos(-dockWidth, Math.max(0, (view.height - panel.height) / 2));
    const next = { scaleX, scaleY, x: left + view.pivotX * scaleX, y: top + view.pivotY * scaleY };
    if (goal && FIELDS.every(field => goal[field] === next[field]) &&
        (frame || FIELDS.every(field => view[field] === next[field]))) return;
    goal = next;
    panel.mouseEnabled = false;
    if (animate) panel.alpha = 0;
    move(next, animate, () => {
      panel.alpha = 1;
      panel.mouseEnabled = true;
    });
  }

  // Let the game compute its usual center with its own scale on resize.
  const uncenter = typeof view.moveCenter === 'function'
    ? ctx.scope.patch(view, 'moveCenter', original => function (...args) {
      restore();
      try { return original.apply(this, args); } finally { if (closing) finishClose?.(); else update(); }
    })
    : null;
  let finishClose;
  const resize = () => { if (closing) finishClose?.(); else update(); };
  stage.on(laya.Event.RESIZE, panel, resize);
  update(true);
  return {
    update,
    hide(finish) {
      if (closing) return;
      closing = true;
      finishClose = finish;
      panel.visible = false;
      capture();
      move({ ...base }, true, finish);
    },
    release() {
      stage.off(laya.Event.RESIZE, panel, resize);
      uncenter?.();
      restore();
    },
  };
}
