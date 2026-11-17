import { getNativeTheme } from '../../ui/native-theme.js';

// Render inside the existing hand container. HTML cannot sit between the
// game's canvas layers: native sprites inherit game scale and window occlusion.
function dragBounds(window, container, width, height) {
  const laya = window.Laya ?? window.laya, stage = laya?.stage;
  const hand = container.HandCardRect, rowY = container.NORMAL_Y;
  const handWidth = Number.isFinite(hand.width) && hand.width > 0 ? hand.width :
    Number.isFinite(container.width) && container.width > hand.x ? container.width - hand.x : 320;
  if (!Number.isFinite(stage?.width) || !Number.isFinite(stage?.height) || stage.width <= 0 || stage.height <= 0) return null;
  const rendered = laya.Render?.canvas, canvas = rendered?.source ?? rendered ?? window.document.querySelector('canvas');
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.left + rect.width), bottom = Math.min(window.innerHeight, rect.top + rect.height);
  if (right <= left || bottom <= top) return null;
  const first = container.globalToLocal(new laya.Point((left - rect.left) * stage.width / rect.width, (top - rect.top) * stage.height / rect.height), true);
  const last = container.globalToLocal(new laya.Point((right - rect.left) * stage.width / rect.width, (bottom - rect.top) * stage.height / rect.height), true);
  if (![first.x, first.y, last.x, last.y].every(Number.isFinite)) return null;
  // Stay over the actual hand row, within a shallow band above its cards.
  const bounds = { left: Math.max(hand.x, Math.min(first.x, last.x) + 4),
    right: Math.min(hand.x + handWidth - width, Math.max(first.x, last.x) - width - 4),
    top: Math.max(rowY - 72, Math.min(first.y, last.y) + 4),
    bottom: Math.min(rowY - height - 8, Math.max(first.y, last.y) - height - 4) };
  return bounds.right >= bounds.left && bounds.bottom >= bounds.top ? bounds : null;
}

export function createSortControls(ctx, { sort, lock }) {
  const { window, scope, settings } = ctx, theme = getNativeTheme(ctx);
  let root = null, container = null, buttons = [], dragging = null, timer = null;
  let locked = null, suppressUntil = 0, hint = null;
  let releaseStageEvents = null, releaseTheme = null;
  let offset = settings.get('nativeSortOffset', { x: 0, y: 0 });
  if (!Number.isFinite(offset?.x) || !Number.isFinite(offset?.y)) offset = { x: 0, y: 0 };
  const readPoint = () => {
    const laya = window.Laya ?? window.laya;
    try { return container.globalToLocal(new laya.Point(laya.stage.mouseX, laya.stage.mouseY), true); } catch { return null; }
  };
  function place() {
    const bounds = dragBounds(window, container, root.width, root.height);
    if (!bounds) { root.visible = false; return false; }
    const base = { x: container.HandCardRect.x + 70, y: container.NORMAL_Y - 48 };
    const x = Math.max(bounds.left, Math.min(bounds.right, base.x + offset.x));
    const y = Math.max(bounds.top, Math.min(bounds.bottom, base.y + offset.y));
    offset = { x: x - base.x, y: y - base.y };
    root.pos(x, y);
    return true;
  }
  function endDrag(save = true) {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (dragging?.started) {
      if (save) settings.set('nativeSortOffset', { ...offset });
      else offset = dragging.offset;
      suppressUntil = Date.now() + 200;
    }
    dragging = null;
  }
  function moveDrag() {
    if (!dragging) return;
    const point = readPoint(); if (!point) { endDrag(false); return; }
    const dx = point.x - dragging.point.x, dy = point.y - dragging.point.y;
    if (!dragging.started) { if (Math.hypot(dx, dy) > 6) endDrag(); return; }
    offset = { x: dragging.offset.x + dx, y: dragging.offset.y + dy };
    place();
  }
  function finishDrag() { moveDrag(); endDrag(); }
  function rounded(graphics, x, y, width, height, fill, stroke = null) {
    if (!graphics.drawPath) { graphics.drawRect(x, y, width, height, fill, stroke, 1); return; }
    const r = 5;
    graphics.drawPath(x, y, [['moveTo', r, 0], ['lineTo', width - r, 0], ['arcTo', width, 0, width, r, r],
      ['lineTo', width, height - r], ['arcTo', width, height, width - r, height, r], ['lineTo', r, height],
      ['arcTo', 0, height, 0, height - r, r], ['lineTo', 0, r], ['arcTo', 0, 0, r, 0, r], ['closePath']],
    { fillStyle: fill }, stroke ? { strokeStyle: stroke, lineWidth: 1 } : null);
  }
  function paint() {
    if (!root || root.destroyed) return;
    const palette = theme.palette;
    root.graphics.clear();
    rounded(root.graphics, 0.5, 0.5, 135, 23, palette.bg, palette.border);
    root.graphics.drawRect(7, 1, 122, 1, palette.highlight);
    for (const x of [28, 64, 100]) root.graphics.drawRect(x, 8, 1, 8, palette.borderSoft);
    for (const item of buttons) {
      const spacing = settings.get('handGroupSpacing', true) !== false;
      const selected = item.mode === 'spacing' ? spacing : item.mode === locked;
      item.sprite.graphics.clear();
      if (selected || item.hover) rounded(item.sprite.graphics, 2, 2, item.width - 4, 20, selected ? palette.selected : palette.hover);
      if (selected) item.sprite.graphics.drawRect(9, 21, item.width - 18, 1, palette.accent);
      if (item.mode === 'spacing') {
        const g = item.sprite.graphics, color = item.hover ? palette.text : palette.muted;
        const left = spacing ? 6 : 9, right = spacing ? 19 : 16;
        g.drawRect(left, 7, 3, 10, null, color, 1);
        g.drawRect(right, 7, 3, 10, null, color, 1);
        item.sprite.toolTip = spacing ? '组间留空 · 点击收窄' : '不留空 · 点击放宽';
        item.sprite.accessibilityLabel = item.sprite.toolTip;
        if (hint) { hint.text = item.sprite.toolTip; hint.visible = item.hover; hint.color = palette.text; hint.bgColor = palette.bg; }
      }
      item.label.color = selected ? palette.accent : item.hover ? palette.text : palette.muted;
    }
  }
  function create() {
    const laya = window.Laya ?? window.laya;
    if (typeof laya?.Sprite !== 'function' || typeof laya?.Text !== 'function') return false;
    releaseStageEvents?.(); releaseStageEvents = null;
    releaseTheme?.(); releaseTheme = null;
    root = new laya.Sprite(); root.name = 'sgs-toolbox-hand-sort'; root.size(136, 24);
    root.mouseEnabled = true;
    buttons = [];
    for (const [index, mode, title, width] of [[-1, 'spacing', '', 28], [0, 'type', '类型', 36], [1, 'suit', '花色', 36], [2, 'number', '点数', 36]]) {
      const sprite = new laya.Sprite(), label = new laya.Text();
      sprite.name = mode; sprite.size(width, 24); sprite.pos(index < 0 ? 0 : 28 + index * 36, 0); sprite.mouseEnabled = true;
      label.text = title; label.font = 'Microsoft YaHei'; label.fontSize = 12; label.bold = false;
      label.width = width; label.height = 24; label.align = 'center'; label.valign = 'middle'; label.mouseEnabled = false;
      sprite.addChild(label); root.addChild(sprite);
      const item = { mode, sprite, label, width, hover: false }; buttons.push(item);
      sprite.on('mouseover', root, () => { item.hover = true; paint(); });
      sprite.on('mouseout', root, () => { item.hover = false; paint(); });
      sprite.on('click', root, event => { event?.stopPropagation?.(); if (Date.now() < suppressUntil) return;
        if (mode === 'spacing') { laya.stage.focus = sprite; settings.set('handGroupSpacing', settings.get('handGroupSpacing', true) === false); container?.invalidateLayoutHandCard?.(); paint(); }
        else sort(mode); });
      sprite.on('doubleclick', root, event => { event?.stopPropagation?.(); if (mode !== 'spacing' && Date.now() >= suppressUntil) lock(mode); });
    }
    hint = new laya.Text(); hint.font = 'Microsoft YaHei'; hint.fontSize = 12; hint.height = 22; hint.width = 176; hint.align = 'center'; hint.valign = 'middle'; hint.pos(0, -26); hint.mouseEnabled = false; hint.visible = false; root.addChild(hint);
    root.on('mousedown', root, event => {
      event?.stopPropagation?.();
      if (event?.nativeEvent?.button > 0) return;
      const point = readPoint(); if (!point) return;
      endDrag(); dragging = { point, offset: { ...offset }, started: false };
      timer = window.setTimeout(() => { timer = null; if (dragging) dragging.started = true; }, 300);
    });
    root.on('mouseup', root, event => { event?.stopPropagation?.(); finishDrag(); });
    const stage = laya.stage;
    const move = () => moveDrag();
    const up = () => finishDrag();
    stage.on('mousemove', root, move); stage.on('mouseup', root, up);
    const owner = root;
    releaseStageEvents = scope.add(() => { stage.off('mousemove', owner, move); stage.off('mouseup', owner, up); });
    releaseTheme = theme.watch(paint, { target: root });
    return true;
  }
  scope.listen(window, 'pointerup', () => {
    // Laya processes DOM input on its next frame. Ending synchronously here
    // would discard the final queued mouse move before the native mouseup.
    const pending = dragging;
    if (pending) scope.timeout(() => { if (dragging === pending) finishDrag(); }, 50);
  });
  scope.listen(window, 'blur', () => endDrag());
  scope.listen(window, 'keydown', event => {
    const laya = window.Laya ?? window.laya, button = buttons.find(item => item.mode === 'spacing');
    if (!root?.visible || !button || laya?.stage?.focus !== button.sprite || !['Enter', ' '].includes(event.key) || event.repeat) return;
    event.preventDefault(); button.sprite.event('click', { stopPropagation() {} });
  });
  return {
    update(nextContainer, mode) {
      if (!nextContainer?.parent || typeof nextContainer.addChild !== 'function') return false;
      try {
        if ((!root || root.destroyed) && !create()) return false;
        container = nextContainer;
        if (root.parent !== container) container.addChild(root);
        locked = mode; root.visible = true;
        if (!place()) return false;
        paint();
        return true;
      } catch { releaseStageEvents?.(); releaseStageEvents = null; releaseTheme?.(); releaseTheme = null; root?.destroy?.(true); root = null; buttons = []; return false; }
    },
    hide() { endDrag(false); if (root && !root.destroyed) root.visible = false; },
    dispose() { endDrag(false); releaseStageEvents?.(); releaseStageEvents = null; releaseTheme?.(); releaseTheme = null; root?.destroy?.(true); root = null; buttons = []; },
  };
}
