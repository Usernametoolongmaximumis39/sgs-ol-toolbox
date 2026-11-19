import { textNode } from './controls.js';
import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';

const diameter = 38;

function isVisible(node, stage) {
  for (; node; node = node.parent) {
    if (node.destroyed || node.visible === false) return false;
    if (node === stage) return true;
  }
  return false;
}

export function createSeatFormButton(ctx) {
  const { window: win, scope } = ctx;
  const active = new Map();
  const hidden = new Map();

  function attach(laya, parent, marker, choice) {
    const { stage } = laya;
    const forms = choice.formControl;
    const button = new laya.Sprite();
    button.name = choice.portrait ? 'sgs-yjcm-seat-form' : 'sgs-local-seat-form';
    button.size(diameter, diameter);
    button.zOrder = 40;
    button.mouseEnabled = true;
    const caption = textNode(laya, '形态', 4, 5, 30, 12, undefined, 9);
    const number = textNode(laya, '', 5, 16, 28, 14, undefined, 13);
    number.name = 'sgs-yjcm-form-number';
    number.bold = true;
    button.addChild(caption);
    button.addChild(number);
    parent.addChild(button);
    let hovered = false, request, palette = DEFAULT_NATIVE_PALETTE;
    let painted;

    function paint() {
      const focus = stage.focus === button, hot = hovered || focus;
      const g = button.graphics;
      g.clear();
      g.drawCircle(19, 19, 18, palette.raised, palette.shadow, 2);
      g.drawCircle(19, 19, 16, hot ? palette.selected : palette.surface, hot ? palette.highlight : palette.border, focus ? 2 : 1);
      if (!request) {
        g.drawLines(0, 0, [9, 18, 6, 22, 9, 26], palette.accent, 1.3);
        g.drawLines(0, 0, [29, 18, 32, 22, 29, 26], palette.accent, 1.3);
      }
      caption.text = request ? '载入' : '形态';
      caption.color = palette.muted;
      number.color = palette.text;
      number.text = `${painted = forms.current}/${forms.count}`;
    }

    function available() {
      return button.visible && marker.visible !== false && !scope.signal.aborted && isVisible(button, stage);
    }

    async function change() {
      if (request || !available()) return;
      stage.focus = button;
      const pending = request = new win.AbortController();
      paint();
      try {
        await forms.advance(pending.signal);
      } catch (error) {
        if (!pending.signal.aborted) ctx.notify?.(error.message.split('\n', 1)[0]);
      } finally {
        request = null;
        if (!button.destroyed) paint();
      }
    }

    function refresh(offset) {
      const { renderX, renderY, renderWidth, renderHeight } = marker;
      button.visible = marker.visible !== false && (marker.alpha > 0 || hidden.has(marker)) &&
        [renderX, renderY, renderWidth, renderHeight].every(Number.isFinite) && renderWidth > 0 && renderHeight > 0;
      if (!button.visible) return;
      button.pos(Math.round(renderX + (renderWidth - diameter) / 2 + offset * (diameter + 3)), Math.round(renderY + (renderHeight - diameter) / 2));
      if (painted !== forms.current) paint();
    }

    button.on('click', button, event => {
      event?.stopPropagation?.();
      if (!available()) return;
      const focused = win.document?.activeElement;
      (focused?.shadowRoot?.activeElement ?? focused)?.blur?.();
      void change();
    });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    const unwatch = ctx.ui?.nativeTheme?.watch(colors => { palette = colors; paint(); });
    paint();
    return { parent, marker, forms, button, paint, change, available, refresh, dispose() {
      request?.abort();
      unwatch?.();
      if (stage.focus === button) stage.focus = null;
      if (!button.destroyed) button.destroy(true);
    } };
  }

  scope.listen(win, 'keydown', event => {
    if (event.defaultPrevented || event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const stage = (win.Laya ?? win.laya)?.stage;
    const buttons = [...active.values()].filter(entry => entry.available());
    if (!stage || !buttons.length) return;
    const index = buttons.findIndex(entry => entry.button === stage.focus);
    const current = buttons[index];
    if (current && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) void current.change();
    } else if (event.key === 'Tab' && (current || !stage.focus)) {
      const next = buttons[index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : index + (event.shiftKey ? -1 : 1)];
      stage.focus = next?.button ?? null;
      current?.paint();
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        next.paint();
      }
    } else if (current && event.key === 'Escape') {
      stage.focus = null;
      current.paint();
    }
  }, true);

  function update(choices = []) {
    const laya = win.Laya ?? win.laya;
    const kept = new Set(), offsets = new Map();
    if (!scope.signal.aborted && laya?.Sprite && laya.Text && laya.stage) for (const choice of choices) {
      const manager = choice.target.ui.otherTopManager;
      const marker = manager?.seatIndex, parent = manager?.render, forms = choice.formControl;
      if (!marker || marker.destroyed || typeof marker.alpha !== 'number' || !parent?.addChild || parent.destroyed) continue;
      let entry = active.get(choice);
      if (!entry || entry.marker !== marker || entry.parent !== parent || entry.forms !== forms || entry.button.destroyed) {
        entry?.dispose();
        entry = attach(laya, parent, marker, choice);
        active.set(choice, entry);
      }
      const offset = offsets.get(marker) ?? 0;
      entry.refresh(offset);
      offsets.set(marker, offset + 1);
      kept.add(choice);
    }
    for (const [choice, entry] of active) if (!kept.has(choice)) {
      entry.dispose();
      active.delete(choice);
    }
    const shown = new Set([...active.values()].filter(entry => entry.button.visible).map(entry => entry.marker));
    for (const marker of shown) if (marker.alpha > 0) {
      hidden.set(marker, marker.alpha);
      marker.alpha = 0;
    }
    for (const [marker, alpha] of hidden) if (!shown.has(marker)) {
      if (!marker.destroyed && marker.alpha === 0) marker.alpha = alpha;
      hidden.delete(marker);
    }
  }
  scope.add(() => update());
  return update;
}
