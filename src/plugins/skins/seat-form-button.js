import { textNode } from './controls.js';
import { controlIcon } from '../../ui/controls.js';
import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';
import { formLabel } from './form-label.js';

const diameter = 38;
const chooserStyles = `
dialog{box-sizing:border-box;width:min(300px,calc(100vw - 20px));max-width:none;max-height:calc(100vh - 20px);padding:0;border:1px solid var(--sgs-border,#665b42);border-radius:10px;background:var(--sgs-surface,#201e1a);color:var(--sgs-text,#eee3cc);box-shadow:0 18px 60px #0008;font:calc(13px + var(--sgs-font-offset,0px))/1.4 var(--sgs-font,sans-serif)}
dialog::backdrop{background:#0006}
header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-bottom:1px solid var(--sgs-border,#665b42)}
h2{margin:0;font-size:1.15em}
button{min-height:35px;padding:4px 10px;border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-raised,#29251f);color:inherit;font:inherit;cursor:pointer}
button:hover,button:focus-visible{border-color:var(--sgs-accent,#dbba70);color:var(--sgs-accent,#dbba70)}
button:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.close{display:grid;place-items:center;width:35px;padding:0;background:transparent;border-color:transparent}
.close svg{width:15px;height:15px}
.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,7em),1fr));gap:8px;padding:12px}
`;

function isVisible(node, stage) {
  for (; node; node = node.parent) {
    if (node.destroyed || node.visible === false || node.alpha === 0) return false;
    if (node === stage) return true;
  }
  return false;
}

export function createSeatFormButton(ctx) {
  const { window: win, document: doc, scope } = ctx;
  const active = new Map();
  const hidden = new Map();
  let closeChoices;

  function choose(destinations, onPick, onDismiss) {
    closeChoices?.();
    const host = doc.createElement('div');
    host.dataset.sgsSeatFormChoices = '';
    const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
    if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = chooserStyles;
    const dialog = doc.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'sgs-seat-form-choice-title');
    dialog.innerHTML = '<header><h2 id="sgs-seat-form-choice-title">切换形态</h2><button class="close" type="button" aria-label="关闭" title="关闭"></button></header><div class="choices"></div>';
    const close = dialog.querySelector('.close');
    close.append(controlIcon(doc, 'close'));
    const choices = dialog.querySelector('.choices');
    const applyTheme = theme => {
      for (const [key, value] of Object.entries(theme?.tokens ?? {})) host.style.setProperty('--sgs-' + key, value);
    };
    applyTheme(ctx.themes?.current);
    const offTheme = ctx.themes?.subscribe(applyTheme);
    const release = closeChoices = scope.add(() => {
      offTheme?.();
      dialog.close();
      host.remove();
      closeChoices = null;
      onDismiss();
    });
    for (const to of destinations) {
      const action = doc.createElement('button');
      action.type = 'button';
      action.textContent = formLabel(to);
      action.addEventListener('click', () => { release(); onPick(to); });
      choices.append(action);
    }
    close.addEventListener('click', release);
    dialog.addEventListener('cancel', event => { event.preventDefault(); release(); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    shadow.append(style, dialog);
    doc.body.append(host);
    dialog.showModal();
    choices.firstElementChild.focus();
    return release;
  }

  function attach(laya, parent, marker, choice) {
    const { stage } = laya;
    const { avatar } = choice.target;
    const forms = choice.formControl;
    const first = new laya.Point(), last = new laya.Point();
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
    let hovered = false, request, menu, menuForm, palette = DEFAULT_NATIVE_PALETTE;
    let painted, paintedCount;

    function paint() {
      const count = paintedCount = forms.destinations().length;
      button.mouseEnabled = Boolean(count && !request);
      const focus = stage.focus === button, hot = count && (hovered || focus);
      const g = button.graphics;
      g.clear();
      g.drawCircle(19, 19, 18, palette.raised, palette.shadow, 2);
      g.drawCircle(19, 19, 16, hot ? palette.selected : palette.surface, hot ? palette.highlight : palette.border, focus ? 2 : 1);
      if (!request && count) {
        g.drawLines(0, 0, [9, 18, 6, 22, 9, 26], palette.accent, 1.3);
        g.drawLines(0, 0, [29, 18, 32, 22, 29, 26], palette.accent, 1.3);
      }
      caption.text = request ? '载入' : '形态';
      caption.color = palette.muted;
      number.color = palette.text;
      number.text = `${painted = forms.current}/${forms.count}`;
    }

    function available() {
      return button.visible && !scope.signal.aborted && isVisible(avatar, stage) && isVisible(button, stage) &&
        Boolean(forms.destinations().length);
    }

    async function change(to) {
      if (request || !available() || !forms.destinations().includes(to)) return;
      const pending = request = new win.AbortController();
      paint();
      try {
        await forms.advance(pending.signal, to);
      } catch (error) {
        if (!pending.signal.aborted) ctx.notify?.(error.message.split('\n', 1)[0]);
      } finally {
        request = null;
        if (!forms.destinations().length && stage.focus === button) stage.focus = null;
        if (!button.destroyed) paint();
      }
    }

    function activate() {
      if (request || !available()) return;
      const destinations = forms.destinations();
      stage.focus = button;
      if (destinations.length === 1) void change(destinations[0]);
      else {
        menuForm = forms.current;
        menu = choose(destinations, to => void change(to), () => { menu = null; });
      }
    }

    function refresh(offset) {
      let nextX, nextY;
      const seat = marker && !marker.destroyed && marker.visible !== false && (marker.alpha > 0 || hidden.has(marker)) &&
        [marker.renderX, marker.renderY, marker.renderWidth, marker.renderHeight].every(Number.isFinite) &&
        marker.renderWidth > 0 && marker.renderHeight > 0;
      if (seat) {
        nextX = marker.renderX + (marker.renderWidth - diameter) / 2 + offset * (diameter + 3);
        nextY = marker.renderY + (marker.renderHeight - diameter) / 2;
      } else {
        const { x = 0, y = 0, width = avatar.width, height = avatar.height } = avatar.scrollRect ?? {};
        if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
          parent.globalToLocal(avatar.localToGlobal(first.setTo(x, y)));
          parent.globalToLocal(avatar.localToGlobal(last.setTo(x + width, y + height)));
          if (Math.abs(last.x - first.x) >= diameter + 8 && Math.abs(last.y - first.y) >= diameter + 8) {
            nextX = Math.min(first.x, last.x) + 4;
            nextY = Math.max(first.y, last.y) - diameter - 4;
          }
        }
      }
      button.visible = Number.isFinite(nextX) && isVisible(avatar, stage) && isVisible(parent, stage);
      const count = forms.destinations().length;
      if (!button.visible || !count) {
        if (stage.focus === button) stage.focus = null;
      }
      if (!button.visible || forms.current !== menuForm || count < 2) menu?.();
      if (!button.visible) return false;
      if (button.x !== nextX || button.y !== nextY) button.pos(nextX, nextY);
      if (painted !== forms.current || paintedCount !== count) paint();
      return seat;
    }

    button.on('click', button, event => {
      event?.stopPropagation?.();
      if (!available()) return;
      const focused = win.document?.activeElement;
      (focused?.shadowRoot?.activeElement ?? focused)?.blur?.();
      activate();
    });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    const unwatch = ctx.ui?.nativeTheme?.watch(colors => { palette = colors; paint(); });
    paint();
    return { parent, marker, forms, button, paint, activate, available, refresh, dispose() {
      menu?.();
      request?.abort();
      unwatch?.();
      if (stage.focus === button) stage.focus = null;
      if (!button.destroyed) button.destroy(true);
    } };
  }

  scope.listen(win, 'keydown', event => {
    if (closeChoices || event.defaultPrevented || event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const stage = (win.Laya ?? win.laya)?.stage;
    const buttons = [...active.values()].filter(entry => entry.available());
    if (!stage || !buttons.length) return;
    const index = buttons.findIndex(entry => entry.button === stage.focus);
    const current = buttons[index];
    if (current && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) current.activate();
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
    const ordered = [...choices].sort((a, b) => Number(Boolean(a.target.deputy)) - Number(Boolean(b.target.deputy)));
    if (!scope.signal.aborted && laya?.Sprite && laya.Text && laya.Point && laya.stage) for (const choice of ordered) {
      const { avatar, ui } = choice.target;
      const manager = ui.otherTopManager;
      const parent = manager?.render ?? avatar.parent;
      const marker = manager?.render === parent ? manager?.seatIndex : undefined;
      if (!avatar.localToGlobal || !parent?.globalToLocal || parent.destroyed) continue;
      let entry = active.get(choice);
      if (!entry || entry.parent !== parent || entry.marker !== marker || entry.forms !== choice.formControl || entry.button.destroyed) {
        entry?.dispose();
        entry = attach(laya, parent, marker, choice);
        active.set(choice, entry);
      }
      const offset = offsets.get(marker) ?? 0;
      if (entry.refresh(offset)) offsets.set(marker, offset + 1);
      kept.add(choice);
    }
    for (const [choice, entry] of active) if (!kept.has(choice)) {
      entry.dispose();
      active.delete(choice);
    }
    for (const marker of offsets.keys()) if (marker.alpha > 0) {
      hidden.set(marker, marker.alpha);
      marker.alpha = 0;
    }
    for (const [marker, alpha] of hidden) if (!offsets.has(marker)) {
      if (!marker.destroyed && marker.alpha === 0) marker.alpha = alpha;
      hidden.delete(marker);
    }
  }
  scope.add(() => update());
  return update;
}
