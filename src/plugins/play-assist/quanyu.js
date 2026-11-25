import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { field, read } from '../../shared/info-runtime.js';

const QUANYU = 3793;
const HISTORY_BUTTON = 37937;
const ALL_EFFECTS = 126;
const ICON_SIZE = 22;
const ICON_GAP = 2;
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

function buttonLayout(L, avatar, button, count) {
  const { parent, x, y, width, height } = button;
  const size = Math.floor(Math.min(ICON_SIZE, width, height));
  if (!(size >= 14) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const offsets = [[0, 0]];
  if (count === 1) return { size, offsets };
  const step = size + ICON_GAP;
  const columns = Math.floor((width + ICON_GAP) / step);
  const clip = avatar?.scrollRect;
  const portraitY = localY => parent.globalToLocal(
    avatar.localToGlobal(new L.Point(clip?.x ?? 0, localY), true), true).y;
  const top = read(() => portraitY(clip?.y ?? 0)) ?? 0;
  const bottom = read(() => portraitY((clip?.y ?? 0) + (clip?.height ?? avatar.height))) ?? parent.height;
  const down = Math.max(0, Math.min(12, Math.floor((bottom - y - size) / step))) || 0;
  const up = Math.max(0, Math.min(12, Math.floor((y - top) / step))) || 0;
  const preferDown = down >= Math.ceil(count / columns) - 1 || down >= up;
  const rowOffsets = [0, ...Array.from({ length: preferDown ? down : up }, (_, index) => (index + 1) * (preferDown ? 1 : -1)),
    ...Array.from({ length: preferDown ? up : down }, (_, index) => (index + 1) * (preferDown ? -1 : 1))];
  const siblings = (parent._children || []).filter(node => node && node !== button
    && node.visible && !node.destroyed && node.alpha !== 0 && node.SeatState);
  for (const row of rowOffsets) for (let col = row === 0 ? 1 : 0; col < columns; col++) {
    const dx = col * step, dy = row * step;
    // Place history around other native markers without changing their slots.
    if (siblings.some(node => x + dx < node.x + node.width && x + dx + size > node.x
      && y + dy < node.y + node.height && y + dy + size > node.y)) continue;
    offsets.push([dx, dy]);
    if (offsets.length === count) return { size, offsets };
  }
  return { size, offsets };
}

function createRow(ctx, L, button, dispatcher) {
  const parent = button.parent;
  const theme = ctx.ui.nativeTheme, root = new L.Sprite();
  root.name = 'sgs-play-assist-quanyu'; root.zOrder = 999; root.mouseThrough = true;
  parent.addChild(root);
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
  let layout = [], size = ICON_SIZE, offsets = [], active = 0, signature = '';
  for (const { icon } of icons) icon.on('click', root, event => {
    if (!button?.parent || typeof button.SeatState?.ClickCallback !== 'function') return;
    event?.stopPropagation?.();
    hideTip();
    button.SeatState.ClickCallback();
  });
  function paint(p = theme?.palette) {
    if (!p || root.destroyed) return;
    const unit = size / 22;
    for (let i = 0; i < icons.length; i++) {
      const id = i + 1, effect = EFFECTS[id], { icon, text } = icons[i], index = layout.indexOf(id);
      icon.visible = index >= 0 && index < offsets.length;
      if (!icon.visible) continue;
      icon.name = `sgs-quanyu-${id}`;
      icon.size(size, size);
      icon.pos(...offsets[index]);
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
  let alpha = button.alpha, mouseEnabled = button.mouseEnabled;
  return {
    button, parent,
    update(ordered, current, placement) {
      const next = `${current}:${ordered}:${placement.size}:${placement.offsets}`;
      if (signature !== next) {
        hideTip();
        signature = next; size = placement.size; offsets = placement.offsets;
        active = current; layout = ordered;
        paint();
      }
      root.pos(button.x, button.y);
      if (button.alpha !== 0) alpha = button.alpha;
      if (button.mouseEnabled !== false) mouseEnabled = button.mouseEnabled;
      button.alpha = 0; button.mouseEnabled = false;
    },
    dispose() {
      hideTip(); releaseTheme?.();
      if (!button.destroyed) {
        if (button.alpha === 0) button.alpha = alpha;
        if (button.mouseEnabled === false) button.mouseEnabled = mouseEnabled;
      }
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
    update(scene, seats) {
      const L = ctx.window.Laya;
      if (!L?.Sprite || !L?.Text || !ctx.ui.nativeTheme?.palette) { hide(); return; }
      const displayed = new Set();
      for (const ui of seats) {
        const seat = nativeSeat(ui), seatId = nativeSeatId(ui);
        const mask = read(() => seat.GetSkillBuffInfo(QUANYU)[0]);
        if (!effectMask(mask) || !mask || seatId === undefined || ui.destroyed) continue;
        const markers = ui.stateContainer?._children || [];
        // 37937 is the on-card button. 3793 is the distinct round side mark.
        const button = markers.find(node => node?.visible && !node.destroyed && node.SeatState?.ID === HISTORY_BUTTON);
        if (!button?.parent || button.parent.destroyed || button.parent.visible === false) continue;
        const current = read(() => seat.GetSeatState(QUANYU).Value);
        if (!validEffect(current) || !(mask & (1 << current))) continue;
        const ordered = recordEffect(history.get(seatId) || [], current, mask);
        history.set(seatId, ordered);
        const avatar = ui.seatAvatar ?? ui.SeatAvatar;
        const placement = buttonLayout(L, avatar, button, ordered.length);
        if (!placement) continue;
        let row = rows.get(ui);
        if (row?.button !== button || row.parent !== button.parent) {
          row?.dispose();
          row = createRow(ctx, L, button, scene.ged || read(() => ctx.game.getDispatcher()));
          rows.set(ui, row);
        }
        row.update(ordered, current, placement);
        displayed.add(ui);
      }
      for (const [ui, row] of rows) if (!displayed.has(ui)) { row.dispose(); rows.delete(ui); }
    },
  };
}
