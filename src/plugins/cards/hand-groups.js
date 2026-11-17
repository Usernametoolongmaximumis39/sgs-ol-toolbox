import { ResourceScope } from '../../core/resources.js';
import { getNativeTheme } from '../../ui/native-theme.js';
import { groupedHandLayout, HAND_GROUP_NAMES } from './hand-order.js';

const owners = new WeakMap();
export function setHandGroupingMode(container, mode) { owners.get(container)?.setMode(mode); }

export function createHandGrouping(ctx) {
  const theme = getNativeTheme(ctx);
  let container = null, resources = null, root = null, mode = null, labels = [], lastLayout = null;
  function hide() { if (root) root.visible = false; lastLayout = null; }
  function draw() {
    if (!root || !lastLayout) return;
    const { layout, start, y, cardWidth } = lastLayout;
    root.visible = mode === 'type' && layout.overlapping;
    root.graphics.clear();
    let used = 0;
    const laneEnds = [];
    const controls = container.getChildByName?.('sgs-toolbox-hand-sort');
    if (root.visible) for (let i = 0; i < layout.keys.length; i++) {
      if (i && layout.keys[i] === layout.keys[i - 1]) continue;
      let end = i + 1;
      while (end < layout.keys.length && layout.keys[end] === layout.keys[i]) end++;
      const left = start + layout.positions[i];
      const right = start + (end < layout.keys.length ? layout.positions[end] : layout.positions.at(-1) + cardWidth);
      const title = HAND_GROUP_NAMES[layout.keys[i]], width = title.length * 11 + 8;
      const x = Math.max(start, Math.min(left + 2, start + layout.width - width));
      let lane = 0;
      // Keep complete group names readable near the draggable sort bar.
      // Selection must not lift the group row into the game's action buttons.
      while (true) {
        const top = y - 19 - lane * 17;
        const touchesControls = controls?.visible && x < controls.x + controls.width && x + width > controls.x &&
          top < controls.y + controls.height + 2 && top + 16 > controls.y - 2;
        if ((laneEnds[lane] ?? -Infinity) + 3 <= x && !touchesControls) break;
        lane++;
      }
      laneEnds[lane] = x + width;
      let label = labels[used++];
      if (!label) {
        label = new (ctx.window.Laya ?? ctx.window.laya).Text();
        label.font = 'Microsoft YaHei'; label.fontSize = 11; label.mouseEnabled = false;
        label.height = 16; label.align = 'center'; label.valign = 'middle';
        root.addChild(label); labels.push(label);
      }
      label.visible = true; label.text = title; label.width = width;
      label.color = theme.palette.accent; label.bgColor = theme.palette.bg;
      label.pos(x, y - 19 - lane * 17);
      root.graphics.drawRect(left + 1, y - 2, Math.max(1, right - left - 3), 1, theme.palette.border);
    }
    for (let i = used; i < labels.length; i++) labels[i].visible = false;
  }
  function apply() {
    if (ctx.settings.get('handGroupSpacing', true) === false || !mode || !container || container.destroyed || container.dragIng || container.switchIng) { hide(); return; }
    const cards = container.cardUis, rect = container.HandCardRect ?? container.handCardRect;
    const cardWidth = Number((container.CardUiSize ?? container.cardUiSize)?.width);
    // Virtual cards use a separate native stack. Keep that interaction intact.
    if (!cards?.length || container.virtualCardUis?.length || container.virtualGeneralUis?.length ||
        !rect || !Number.isFinite(rect.width) || !(cardWidth > 0) || !cards.every(ui => Number.isFinite(ui.EndX))) { hide(); return; }
    const start = cards[0].EndX;
    let right = rect.x + rect.width;
    const additional = container.additionalCardUis;
    if (additional?.length && Number.isFinite(additional[0].EndX)) right = Math.min(right, additional[0].EndX);
    const layout = groupedHandLayout(cards, mode, right - start, cardWidth, container.MAX_HGAP ?? 2);
    if (!layout || layout.width > right - start + 0.5) { hide(); return; }
    cards.forEach((ui, i) => { ui.EndX = start + layout.positions[i]; });
    lastLayout = { layout, start, cardWidth, y: container.NORMAL_Y };
    draw();
  }
  function detach() {
    const previous = container;
    if (previous) owners.delete(previous);
    resources?.dispose(); resources = null;
    root?.destroy?.(true); root = null; labels = []; container = null; mode = null; lastLayout = null;
    if (previous && !previous.destroyed) previous.invalidateLayoutHandCard?.();
  }
  const controller = {
    setMode(value) { mode = value; container?.invalidateLayoutHandCard?.(); },
    update(next) {
      if (next === container) { draw(); return; }
      detach();
      if (!next || typeof next.layoutHandCard !== 'function' || typeof next.addChild !== 'function') return;
      const laya = ctx.window.Laya ?? ctx.window.laya;
      if (!laya?.Sprite || !laya?.Text || owners.has(next)) return;
      container = next; resources = new ResourceScope();
      root = new laya.Sprite(); root.name = 'sgs-hand-groups'; root.mouseEnabled = false; root.visible = false;
      container.addChild(root); owners.set(container, controller);
      resources.patch(container, 'layoutHandCard', original => function (...args) {
        const result = original.apply(this, args); apply(); return result;
      });
      resources.add(theme.watch(draw, { target: root }));
    },
    detach, dispose: detach,
  };
  ctx.scope.add(detach);
  return controller;
}
