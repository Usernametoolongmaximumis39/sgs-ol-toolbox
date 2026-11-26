import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { field, read } from '../../shared/info-runtime.js';

const QUANYU = 3793;
const QIANGANG = 3795;
const HISTORY_BUTTON = 37937;
const ALL_EFFECTS = 126;
const ICON_SIZE = 22;
const MIN_ICON_SIZE = 14;
const ICON_GAP = 2;
const ROW_NAME = 'sgs-play-assist-quanyu';
const EFFECTS = [
  null,
  { tip: '白虹 · 伤害+1', lines: [[3,18,7,14,5,12,13,4,15,6,8,13,10,15,5,20,3,18]], text: '+1' },
  { tip: '青冥 · 目标+1', lines: [[9,3,5,3,5,7],[13,3,17,3,17,7],[5,11,5,15,9,15],[17,11,17,15,13,15],[10.5,9,11.5,9]], text: '+1' },
  { tip: '辟邪 · 无视防具', lines: [[11,3,18,6,18,11,16,15,11,19,6,15,4,11,4,6,11,3],[3,19,19,3]] },
  { tip: '紫电 · 不可响应', lines: [[5,4,17,4,19,6,19,13,17,15,10,15,6,18,6,15,3,13,3,6,5,4],[3,19,19,3]] },
  { tip: '百里 · 额外结算', lines: [[17,8,19,8,19,3],[19,8,15,4,10,3,6,5,4,8],[5,14,3,14,3,19],[3,14,7,18,12,19,16,17,18,14]], text: '2' },
  { tip: '流星 · 无次数限制', lines: [[11,11,8,8,5,7,3,9,3,13,5,15,8,14,14,8,17,7,19,9,19,13,17,15,14,14,11,11]] },
];
const validEffect = id => Number.isInteger(id) && id >= 1 && id <= 6;
const effectMask = value => Number.isInteger(value) && value >= 0 && (value & ALL_EFFECTS) === value;

function recordEffect(history, current, mask) {
  const ordered = history.filter(id => mask & (1 << id));
  for (let id = 1; id <= 6; id++) if ((mask & (1 << id)) && !ordered.includes(id)) ordered.push(id);
  return validEffect(current) ? [current, ...ordered.filter(id => id !== current)] : ordered;
}

function boundsIn(L, node, parent) {
  if (!node?.localToGlobal) return null;
  const rect = node.scrollRect ?? (node.width > 0 && node.height > 0
    ? { x: 0, y: 0, width: node.width, height: node.height } : node.getSelfBounds?.());
  if (!(rect?.width > 0 && rect.height > 0)) return null;
  const corners = [rect.x, rect.x + rect.width].flatMap(x => [rect.y, rect.y + rect.height].map(y =>
    parent.globalToLocal(node.localToGlobal(new L.Point(x, y), true), true)));
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return [left, right, top, bottom].every(Number.isFinite) && right > left && bottom > top
    ? { left, right, top, bottom } : null;
}

function buttonLayout(L, avatar, parent, anchor, count, markers) {
  const portrait = boundsIn(L, avatar, parent) ?? boundsIn(L, parent, parent);
  if (!portrait || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
  const { left, right } = portrait;
  const gap = ICON_GAP, top = portrait.top + gap, bottom = portrait.bottom - gap;
  const obstacles = markers.map(node => boundsIn(L, node, parent)).filter(rect => rect
    && rect.left < right + gap && rect.right > left - gap && rect.top < bottom + gap && rect.bottom > top - gap);
  const maxSize = Math.floor(Math.min(ICON_SIZE, anchor.height, bottom - top, (right - left - (count - 1) * gap) / count));
  for (let size = maxSize; size >= MIN_ICON_SIZE; size--) {
    const width = count * size + (count - 1) * gap;
    const startX = Math.max(left, Math.min(anchor.x, right - width));
    const startY = Math.max(top, Math.min(anchor.y, bottom - size));
    let nearest = null, distance = Infinity;
    const lanes = [startY, ...obstacles.flatMap(rect => [rect.top - size - gap, rect.bottom + gap])];
    for (const y of lanes) {
      if (y < top || y + size > bottom || Math.abs(y - startY) >= distance) continue;
      const inLane = obstacles.filter(rect => y < rect.bottom + gap && y + size > rect.top - gap);
      const starts = [startX, ...inLane.flatMap(rect => [rect.left - width - gap, rect.right + gap])];
      for (const x of starts) {
        if (x < left || x + width > right || inLane.some(rect => x < rect.right + gap && x + width > rect.left - gap)) continue;
        const offset = Math.abs(x - startX) + Math.abs(y - startY);
        if (offset < distance) { distance = offset; nearest = { x, y, size }; }
      }
    }
    if (nearest) return nearest;
  }
  return null;
}

function isChoosingQuanyu(self) {
  const selector = self?.spellSelector;
  if (!selector?.visible || selector.destroyed) return false;
  const matches = skill => skill?.ID === QUANYU || skill?.ID === QIANGANG;
  return matches(selector.spell) || selector.btnList?.some(button => matches(button.Data?.thisObject));
}

function createRow(ctx, L, parent, seat, dispatcher) {
  const theme = ctx.ui.nativeTheme, root = new L.Sprite();
  root.name = ROW_NAME; root.zOrder = 999; root.mouseThrough = true;
  parent.addChild(root);
  let button, alpha, mouseEnabled;
  const restoreButton = () => {
    if (!button || button.destroyed) return;
    if (button.alpha === 0) button.alpha = alpha;
    if (button.mouseEnabled === false) button.mouseEnabled = mouseEnabled;
  };
  let hit;
  const hideTip = () => {
    if (hit) dispatcher?.event?.('TIPS_OUT_EVENT', { target: hit });
    hit = null;
  };
  const icons = EFFECTS.slice(1).map(({ tip }) => {
    const icon = new L.Sprite(), text = new L.Text();
    icon.ToolTip = tip;
    icon.mouseEnabled = true;
    icon.addChild(text); root.addChild(icon);
    icon.on('mouseover', root, () => {
      hideTip(); hit = icon;
      if (!dispatcher?.event) return;
      const event = Object.assign(L.Pool?.getItem?.('TipsEvent') || {}, {
        target: icon, stageX: L.stage.mouseX, stageY: L.stage.mouseY,
        offsetX: 0, offsetY: 0, pos: 'bottom', space: 7, follow: false,
        width: 0, reverse: false, MouseIn: false, IsNeedCheckBtnMode: true, fromClick: true,
      });
      dispatcher.event('TIPS_OVER_EVENT', event);
    });
    icon.on('mouseout', root, hideTip);
    Object.assign(text, { bold: true, align: 'center', valign: 'middle', mouseEnabled: false });
    return { icon, text };
  });
  let layout = [], size = ICON_SIZE, active = 0, signature = '';
  for (const { icon } of icons) icon.on('click', root, event => {
    if (!root.mouseEnabled || !button?.visible || button.parent !== parent || button.destroyed
      || typeof button.SeatState?.ClickCallback !== 'function') return;
    event?.stopPropagation?.();
    hideTip();
    button.SeatState.ClickCallback();
  });
  function paint(p = theme?.palette) {
    if (!p || root.destroyed) return;
    const unit = size / 22;
    for (let i = 0; i < icons.length; i++) {
      const id = i + 1, effect = EFFECTS[id], { icon, text } = icons[i], index = layout.indexOf(id);
      icon.visible = index >= 0;
      if (!icon.visible) continue;
      icon.name = `sgs-quanyu-${id}`;
      icon.size(size, size);
      icon.pos(index * (size + ICON_GAP), 0);
      const current = id === active, ink = current ? p.text : p.muted;
      icon.graphics.clear();
      icon.graphics.drawRect(0.5, 0.5, size - 1, size - 1, current ? p.raised : p.surface, ink, current ? 1.6 : 0.8);
      const shrink = effect.text === '+1' ? 0.76 : 1;
      for (const line of effect.lines) {
        const points = line.map((value, j) => (value * shrink + (j % 2 ? 1 : 0)) * unit);
        icon.graphics.drawLines(0, 0, points, ink, Math.max(1.25, unit * 1.45));
      }
      text.text = effect.text || '';
      text.color = ink; text.fontSize = Math.round((effect.text === '2' ? 9 : 10) * unit);
      text.size((effect.text === '+1' ? 14 : 11) * unit, 11 * unit);
      text.pos((effect.text === '+1' ? 6 : 5.5) * unit, (effect.text === '+1' ? 10 : 5.5) * unit);
    }
  }
  const releaseTheme = theme?.watch(paint, { target: root });
  return {
    parent, seat, anchor: null, mask: 0,
    update(ordered, current, placement, nextButton, interactive) {
      // Native selection can briefly detach and reuse the history button.
      if (!nextButton && button && !button.parent && !button.destroyed) nextButton = button;
      if (button !== nextButton) {
        restoreButton();
        button = nextButton;
        alpha = button?.alpha; mouseEnabled = button?.mouseEnabled;
      }
      if (button) {
        if (button.alpha !== 0) alpha = button.alpha;
        if (button.mouseEnabled !== false) mouseEnabled = button.mouseEnabled;
        button.alpha = 0; button.mouseEnabled = false;
      }
      root.visible = Boolean(placement);
      root.mouseEnabled = Boolean(placement && interactive && button?.visible);
      if (!root.mouseEnabled) hideTip();
      if (!placement) return;
      if (root.x !== placement.x || root.y !== placement.y) hideTip();
      root.pos(placement.x, placement.y);
      const next = `${current}:${ordered}:${placement.size}`;
      if (signature !== next) {
        hideTip();
        signature = next; size = placement.size;
        active = current; layout = ordered;
        paint();
      }
    },
    dispose() {
      hideTip(); releaseTheme?.();
      restoreButton();
      if (!root.destroyed) root.destroy(true);
    },
  };
}

export function createQuanyuDisplay(ctx) {
  const rows = new Map(), history = new Map();
  function hide() { for (const row of rows.values()) row.dispose(); rows.clear(); }
  function clear() { hide(); history.clear(); }
  return { hide, clear,
    observe(packet) {
      if (field(packet, 'IsSpell') || field(packet, 'isSend')) return;
      const data = field(packet, 'Datas'), kind = field(packet, 'DataID'), seatId = field(packet, 'SeatID');
      if (data?.[0] !== QUANYU || !Number.isInteger(seatId) || seatId < 0 || seatId >= 255) return;
      if (kind === 9) history.delete(seatId);
      if (kind === 8 && validEffect(data[2]) && effectMask(data[3])) {
        history.set(seatId, recordEffect(history.get(seatId) || [], data[2], data[3]));
      }
    },
    update(scene, seats, canOperate) {
      const L = ctx.window.Laya;
      if (!L?.Sprite || !L?.Text || !L?.Point || !ctx.ui.nativeTheme?.palette) { hide(); return; }
      const choosing = isChoosingQuanyu(scene.SelfSeatUi);
      let markers;
      const displayed = new Set();
      for (const ui of seats) {
        const seat = nativeSeat(ui), seatId = nativeSeatId(ui), parent = ui.stateContainer;
        if (seatId === undefined || ui.destroyed || !parent?.visible || parent.destroyed) continue;
        let row = rows.get(ui);
        if (row && (row.seat !== seat || row.parent !== parent)) {
          row.dispose(); rows.delete(ui); row = null;
        }
        const previous = history.get(seatId);
        const mask = read(() => seat.GetSkillBuffInfo(QUANYU)[0]) ?? (choosing && previous ? row?.mask : undefined);
        if (!effectMask(mask) || !mask) continue;
        // 37937 is the on-card button. 3793 is the distinct round side mark.
        const button = parent._children?.find(node => node && !node.destroyed && node.SeatState?.ID === HISTORY_BUTTON
          && (node.visible || choosing));
        const anchor = button ? { x: button.x, y: button.y, height: button.height } : choosing ? row?.anchor : null;
        if (!anchor) continue;
        let current = read(() => seat.GetSeatState(QUANYU).Value);
        if (choosing && (!validEffect(current) || !(mask & (1 << current)))) current = previous?.[0];
        if (!validEffect(current) || !(mask & (1 << current))) continue;
        const ordered = recordEffect(previous || [], current, mask);
        history.set(seatId, ordered);
        const avatar = ui.seatAvatar ?? ui.SeatAvatar;
        markers ??= seats.flatMap(other => {
          const container = other.stateContainer;
          return container?.visible && !container.destroyed ? container._children || [] : [];
        }).filter(node => node?.visible && !node.destroyed && node.alpha !== 0 && node.name !== ROW_NAME);
        const placement = buttonLayout(L, avatar, parent, anchor, ordered.length, markers.filter(node => node !== button));
        if (!placement && !choosing) continue;
        if (!row) {
          row = createRow(ctx, L, parent, seat, scene.ged || read(() => ctx.game.getDispatcher()));
          rows.set(ui, row);
        }
        row.anchor = anchor; row.mask = mask;
        row.update(ordered, current, placement, button, canOperate && !choosing);
        displayed.add(ui);
      }
      for (const [ui, row] of rows) if (!displayed.has(ui)) { row.dispose(); rows.delete(ui); }
    },
  };
}
