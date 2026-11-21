
function visible(node, stage) {
  const seen = new Set();
  for (let current = node; current; current = current.parent) {
    if (seen.has(current) || seen.size >= 64 || current.destroyed || current.visible === false || current._visible === false || current.alpha === 0 || current.scaleX === 0 || current.scaleY === 0) return false;
    if (current === stage) return true;
    seen.add(current);
  }
  return false;
}

export function createCountdowns(ctx) {
  const labels = new Map(), { window } = ctx, theme = ctx.ui.nativeTheme;
  let releaseTheme = null;
  function paint(palette = theme.palette) {
    for (const [timer, label] of labels) if (!label.destroyed) {
      label.strokeColor = palette.bg;
      label.color = Number(timer.RemainValue) <= 5 ? palette.danger : palette.text;
    }
  }
  function clear() {
    releaseTheme?.(); releaseTheme = null;
    for (const label of labels.values()) if (!label.destroyed) label.destroy(true);
    labels.clear();
  }
  return {
    clear, dispose: clear,
    update(seats, enabled) {
      if (!enabled) { clear(); return; }
      const timers = new Set(), laya = window.Laya ?? window.laya;
      for (const owner of seats) {
        const timer = owner?.countdownTimer ?? owner?.otherTopManager?.countdownTimer;
        if (timer) timers.add(timer);
      }
      // Native fight/selection windows are children of WindowLayer (order 4).
      // Skip the scene layer (2): seats above already cover its game timers.
      const queue = [...(laya?.stage?._children || [])], visited = new Set();
      for (let i = 0; i < queue.length && i < 512; i++) {
        const owner = queue[i];
        if (!owner || visited.has(owner) || !visible(owner, laya.stage) || owner.layerOrder === 2 || owner.LayerOrder === 2) continue;
        visited.add(owner);
        if (owner.countdownTimer?.parent) timers.add(owner.countdownTimer);
        if (Array.isArray(owner._children)) queue.push(...owner._children);
      }
      const active = new Set();
      for (const timer of timers) {
        // Rqi.Stop() clears countTween but leaves RemainValue unchanged.
        // A positive cached number alone does not mean a countdown is running.
        if (!visible(timer, laya?.stage) || !timer.countTween || !Number.isFinite(timer.width) || timer.width <= 0 || !Number.isFinite(timer.height) || timer.height <= 0) continue;
        const remaining = Number(timer.RemainValue);
        if (!Number.isFinite(remaining) || remaining <= 0) continue;
        const text = String(Math.ceil(remaining));
        if (timer.parent && typeof timer.addChild === 'function' && typeof laya?.Text === 'function') {
          let label = labels.get(timer);
          if (!label || label.destroyed) {
            label = new laya.Text(); label.name = 'sgs-toolbox-countdown'; label.font = 'Microsoft YaHei';
            label.fontSize = 13; label.bold = true; label.stroke = 2;
            label.align = 'center'; label.valign = 'middle'; label.mouseEnabled = false; label.zOrder = 100;
            label.size(40, 20); timer.addChild(label); labels.set(timer, label);
          }
          if (label.parent !== timer) timer.addChild(label);
          label.visible = true;
          label.text = text;
          label.pos((Number(timer.width) - 40) / 2 || 0, (Number(timer.height) - 20) / 2 || 0);
          active.add(timer);
        }
      }
      for (const [timer, label] of labels) if (!active.has(timer)) {
        if (!label.destroyed) label.destroy(true); labels.delete(timer);
      }
      if (labels.size && !releaseTheme) releaseTheme = theme.watch(paint);
      else if (!labels.size) { releaseTheme?.(); releaseTheme = null; }
      paint();
    },
  };
}
