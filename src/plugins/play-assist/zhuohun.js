import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { field, read } from '../../shared/info-runtime.js';
import { mixNativeColors } from '../../ui/native-theme.js';

const ZHUOHUN = 3870;
const hpLimit = (max, band) => Math.floor(band * max / 3);
const colorOf = (hp, max) => hp <= hpLimit(max, 1) ? 1 : hp <= hpLimit(max, 2) ? 2 : 3;
const validHp = (hp, max) => Number.isFinite(hp) && Number.isFinite(max) && max > 0;
const thresholds = [
  { name: 'yellow', color: '#ffe4a3', band: 2 },
  { name: 'red', color: '#ffbab5', band: 1 },
];
const TAG_HEIGHT = 16;
const TAG_FONT = 14;
const TAG_BACKGROUND = '#1c1619';

function setHealth(record, hp, max, changed = true) {
  const color = colorOf(hp, max);
  if (changed && record.color !== color) record.seen |= 1 << color;
  Object.assign(record, { hp, max, color });
}

function screenScale(stage) {
  const m = stage?._canvasTransform;
  if (!m) return 1;
  return Math.min(stage.clientScaleX * Math.hypot(m.a, m.b), stage.clientScaleY * Math.hypot(m.c, m.d)) || 1;
}

function createMarks(L, bar, theme) {
  const root = new L.Sprite();
  root.name = 'sgs-play-assist-zhuohun';
  root.mouseEnabled = false;
  root.mouseThrough = true;
  bar.render.addChild(root);
  const labels = thresholds.map(({ name, color }) => {
    const label = new L.Text();
    Object.assign(label, { name, color, bgColor: TAG_BACKGROUND, font: 'Arial', fontSize: TAG_FONT,
      bold: true, align: 'center', valign: 'middle', mouseEnabled: false });
    root.addChild(label);
    return label;
  });
  const offTheme = theme?.watch?.(palette => {
    const background = mixNativeColors(TAG_BACKGROUND, palette.bg, .12);
    for (const label of labels) label.bgColor = background;
  }, { target: root });
  return { root, bar, render: bar.render, update(record, viewportScale) {
    const bg = bar.gradeHpBg, compact = bar.bloodText?.visible === true;
    const parentScale = Math.min(this.render.globalScaleX || 1, this.render.globalScaleY || 1);
    const scale = Math.max(Math.min(bg.renderScaleX, bg.renderScaleY), 1 / (parentScale * viewportScale));
    root.pos(bg.renderX, bg.renderY);
    root.scale(scale, scale);
    const width = 26 + (String(hpLimit(record.max, 2)).length - 1) * 8;
    const positions = [];
    for (let i = 0; i < labels.length; i++) {
      const { band } = thresholds[i], label = labels[i];
      const limit = hpLimit(record.max, band), pip = bar.bloodArr[limit - 1];
      label.visible = limit > 0 && (compact || !!pip?.height);
      if (!label.visible) continue;
      // The native renderer orders individual pips from bottom to top.
      const y = compact ? bg.height * bg.renderScaleY * (0.42 + 0.22 * i)
        : pip.renderY - bg.renderY + pip.height * pip.renderScaleY / 2;
      const state = record.seen & (1 << band) ? '✓' : record.complete ? '' : '?';
      label.size(width, TAG_HEIGHT);
      label.text = `${limit}${state}`;
      positions.push({ label, y: y / scale });
    }
    // A squeezed stock bar may have less room between pips than a legible tag.
    if (positions.length === 2) {
      const [top, bottom] = positions;
      const spread = Math.max(0, TAG_HEIGHT + 1 - (bottom.y - top.y)) / 2;
      top.y -= spread;
      bottom.y += spread;
    }
    for (const { label, y } of positions) label.pos(-width - 2, y - TAG_HEIGHT / 2);
  }, dispose() { offTheme?.(); if (!root.destroyed) root.destroy(true); } };
}

export function createZhuohunDisplay(ctx) {
  const records = new Map(), displays = new Map();
  let turn = null;
  function hide() {
    for (const display of displays.values()) display.dispose();
    displays.clear();
  }
  function clear() { hide(); records.clear(); turn = null; }
  function sample(ui, complete = false) {
    const seatId = nativeSeatId(ui), seat = nativeSeat(ui);
    const hp = seat?.Hp, max = seat?.MaxHp;
    if (seatId === undefined || !validHp(hp, max)) return;
    const before = records.get(seatId);
    if (before?.seat !== seat) {
      const record = { seat, hp, max, color: colorOf(hp, max), seen: 0, complete, modelHp: hp, modelMax: max };
      records.set(seatId, record);
      return record;
    }
    // An HP notification can precede the model change. Repeated readings of
    // the same model values must not undo the notification's newer sample.
    if (before.modelHp !== hp || before.modelMax !== max) {
      before.modelHp = hp;
      before.modelMax = max;
      setHealth(before, hp, max);
    }
    return before;
  }
  function ownsSkill(self) {
    return read(() => nativeSeat(self).HasSkill(ZHUOHUN)) === true
      || self.skillItems?.some(item => Number(item.Skill?.SkillId) === ZHUOHUN);
  }
  function ownTurn(self) {
    return turn ? turn.seatId === nativeSeatId(self) : nativeSeat(self)?.IsOutOfRound === false;
  }
  return { hide, clear,
    startTurn(seats, seatId, count, resumed = false) {
      if (!Number.isInteger(seatId) || seatId < 0 || seatId >= 255) return;
      if (turn?.seatId === seatId && (count == null ? !turn.phaseSeen : turn.count == null || turn.count === count)) {
        turn.phaseSeen ||= count == null; turn.count ??= count;
        if (resumed) for (const record of records.values()) record.complete = false;
        return;
      }
      turn = { seatId, count, phaseSeen: count == null };
      records.clear();
      for (const ui of seats) sample(ui, !resumed);
    },
    observe(packet, self, seats) {
      if (!ownTurn(self) || !ownsSkill(self) || field(packet, 'isSend')) return;
      const seatId = field(packet, 'SeatID'), value = field(packet, 'HP'), isMax = field(packet, 'isMaxHp') === true;
      const ui = seats.find(candidate => nativeSeatId(candidate) === seatId);
      if (!ui || !Number.isFinite(value)) return;
      const seat = nativeSeat(ui), prior = records.get(seatId);
      const record = prior?.seat === seat ? prior : sample(ui);
      if (!record) return;
      const hp = isMax ? record.hp : value, max = isMax ? value : record.max;
      if (validHp(hp, max)) setHealth(record, hp, max, field(packet, 'isSync') !== true);
    },
    update(self, seats, enabled) {
      const L = ctx.window.Laya;
      if (!enabled || !L?.Sprite || !L?.Text || !ownsSkill(self) || !ownTurn(self)
        || nativeSeat(self)?.IsOutOfRound === true) { hide(); return; }
      const viewportScale = screenScale(L.stage);
      const displayed = new Set();
      for (const ui of seats) {
        const seat = nativeSeat(ui), bar = ui.hpbarManager;
        if (!seat || ui.destroyed || seat.IsDead || seat.IsFull === false || seat.IsNameless) continue;
        const record = sample(ui), bg = bar?.gradeHpBg, render = bar?.render;
        if (!record || record.max < 2 || bar?.MaxValue !== record.max || bar.visible === false
          || !render?.addChild || render.destroyed || !bg?.visible || bg.renderVisible === false
          || !Number.isFinite(bg.renderX) || !Number.isFinite(bg.renderY)
          || !(bg.renderScaleX > 0 && bg.renderScaleY > 0) || !bar.bloodArr?.length) continue;
        let display = displays.get(ui);
        if (display?.bar !== bar || display.render !== render || display.root.destroyed) {
          display?.dispose();
          display = createMarks(L, bar, ctx.ui.nativeTheme);
          displays.set(ui, display);
        }
        display.update(record, viewportScale);
        displayed.add(ui);
      }
      for (const [ui, display] of displays) if (!displayed.has(ui)) { display.dispose(); displays.delete(ui); }
    },
  };
}
