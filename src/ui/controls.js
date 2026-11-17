import { createIcon } from './icons.js';
// Core presentation shared through ctx.ui; plugins need not bundle these helpers.
export const CONTROL_STYLES = `
input.sgs-switch[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;display:inline-block;flex:0 0 30px;width:30px;height:18px;min-width:30px;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 65%,transparent);border-radius:12px;background:linear-gradient(color-mix(in srgb,var(--sgs-bg,#201e1a) 80%,#000),var(--sgs-surface,#2c2922));box-shadow:inset 0 1px 3px #0006;vertical-align:middle;cursor:pointer;transition:background .16s,border-color .16s}
input.sgs-switch[type=checkbox]::before{content:'';position:absolute;top:3px;left:3px;width:10px;height:10px;border-radius:50%;background:linear-gradient(color-mix(in srgb,var(--sgs-muted,#b7aa8c) 85%,var(--sgs-text,#eee3cc)),color-mix(in srgb,var(--sgs-muted,#b7aa8c) 65%,var(--sgs-bg,#201e1a)));box-shadow:0 1px 2px #0008;transition:transform .16s,background .16s}
input.sgs-switch[type=checkbox]:checked{background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 35%,var(--sgs-surface,#2c2922)),color-mix(in srgb,var(--sgs-accent,#dbba70) 17%,var(--sgs-surface,#2c2922)));border-color:color-mix(in srgb,var(--sgs-accent,#dbba70) 65%,transparent)}
input.sgs-switch[type=checkbox]:checked::before{transform:translateX(12px);background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 45%,var(--sgs-text,#eee3cc)),var(--sgs-accent,#dbba70))}
input.sgs-switch[type=checkbox]:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}input.sgs-switch:disabled{opacity:.4;cursor:not-allowed}
select.sgs-select,input.sgs-input{box-sizing:border-box;min-width:0;max-width:100%;height:32px;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 65%,transparent);border-radius:7px;background-color:var(--sgs-bg,#201e1a);box-shadow:inset 0 1px 3px #0003;color:var(--sgs-text,#eee3cc);font:12px/1.4 var(--sgs-font,sans-serif)}
select.sgs-select{appearance:none;-webkit-appearance:none;padding:5px 27px 5px 9px;background-image:linear-gradient(45deg,transparent 50%,var(--sgs-muted,#b7aa8c) 50%),linear-gradient(135deg,var(--sgs-muted,#b7aa8c) 50%,transparent 50%);background-repeat:no-repeat;background-size:4px 4px;background-position:right 13px center,right 9px center;cursor:pointer;text-overflow:ellipsis}
select.sgs-select option{background:var(--sgs-bg,#201e1a);color:var(--sgs-text,#eee3cc)}input.sgs-input{padding:5px 9px}
select.sgs-select:focus-visible,input.sgs-input:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:1px;border-color:var(--sgs-accent,#dbba70)}
.sgs-fold>summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;user-select:none;padding:10px 0;color:var(--sgs-muted,#b7aa8c);font-size:12px}.sgs-fold>summary::-webkit-details-marker{display:none}.sgs-fold>summary::after{content:'';width:5px;height:5px;margin-left:auto;margin-right:3px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .16s}.sgs-fold[open]>summary{color:var(--sgs-accent,#dbba70)}.sgs-fold[open]>summary::after{transform:rotate(225deg)}.sgs-fold>summary:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.sgs-segments{display:flex;gap:2px;padding:3px;border-radius:8px;background:#0002;box-shadow:inset 0 1px 3px #0003}.sgs-segments>button{flex:1;min-width:0;border:0;border-radius:5px;background:transparent;box-shadow:none;color:var(--sgs-muted,#b7aa8c);padding:4px 6px;font-size:11px}.sgs-segments>button.is-active,.sgs-segments>button[aria-pressed=true]{color:var(--sgs-accent,#dbba70);background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 18%,transparent),color-mix(in srgb,var(--sgs-accent,#dbba70) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent,#dbba70) 14%,transparent),0 1px 3px #0003}
.sgs-line-icon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
@media(prefers-reduced-motion:reduce){input.sgs-switch[type=checkbox],input.sgs-switch[type=checkbox]::before,.sgs-fold>summary::after{transition:none}}
`;
export function controlIcon(doc, name) { return createIcon(doc, name); }
export function styleSwitch(input) { input.classList.add('sgs-switch'); input.setAttribute('role', 'switch'); return input; }

// Explicit opt-in: only explanatory copy belongs here; statuses and errors stay visible.
export function helpTip(doc, text, label = '说明') {
  const wrap = doc.createElement('span'), button = doc.createElement('button'), tip = doc.createElement('span');
  wrap.className = 'sgs-help-tip';
  wrap.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;margin:0;line-height:1';
  button.dataset.helpTip = ''; button.type = 'button'; button.setAttribute('aria-label', label); button.title = text;
  button.style.cssText = 'box-sizing:border-box;display:inline-grid;place-items:center;flex:none;width:24px;height:24px;min-width:24px;min-height:24px;margin:0;padding:3px;border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);cursor:help;border-radius:50%';
  const icon = controlIcon(doc, 'info'); icon.style.margin = '0'; button.append(icon);
  tip.textContent = text; tip.setAttribute('popover', 'manual'); tip.setAttribute('role', 'tooltip');
  tip.style.cssText = 'position:fixed;inset:auto;margin:0;padding:10px 12px;max-width:min(300px,calc(100vw - 24px));width:max-content;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--sgs-font,sans-serif);color:var(--sgs-text);background:var(--sgs-raised);border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 6px 24px #0004';
  const hide = () => { if (tip.matches(':popover-open')) tip.hidePopover(); };
  const show = () => {
    if (!tip.showPopover) return;
    tip.showPopover(); const box = button.getBoundingClientRect(), bounds = tip.getBoundingClientRect(), win = doc.defaultView;
    tip.style.left = Math.max(12, Math.min(box.left, win.innerWidth - bounds.width - 12)) + 'px';
    tip.style.top = Math.max(12, box.bottom + bounds.height + 8 < win.innerHeight ? box.bottom + 6 : box.top - bounds.height - 6) + 'px';
  };
  button.addEventListener('mouseenter', show); wrap.addEventListener('mouseleave', hide);
  button.addEventListener('focus', show); button.addEventListener('blur', hide);
  button.addEventListener('click', show); button.addEventListener('keydown', event => { if (event.key === 'Escape') { hide(); event.stopPropagation(); } });
  wrap.append(button, tip); return wrap;
}
