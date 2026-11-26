import { controlIcon } from '../ui/controls.js';
export const INFO_STYLES = `
.sgs-info{min-width:0;color:var(--sgs-text);font:12px/1.65 var(--sgs-font,sans-serif)}
.sgs-info *{box-sizing:border-box}.sgs-info [hidden]{display:none!important}
.sgs-info p{margin:0 0 10px;overflow-wrap:anywhere}.sgs-info .muted{color:var(--sgs-muted);font-size:11px}
.sgs-info .bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:9px 0}.sgs-info .bar>*{min-width:0}
.sgs-info button{min-height:30px;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:7px;background:linear-gradient(var(--sgs-raised),var(--sgs-surface));color:var(--sgs-text);padding:4px 9px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.sgs-info button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}.sgs-info button:focus-visible,.sgs-info summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.sgs-info button:disabled{opacity:.45;cursor:not-allowed}.sgs-info .primary{color:var(--sgs-accent)}.sgs-info .danger{color:var(--sgs-danger)}
.sgs-info .sgs-segments{margin:8px 0}.sgs-info .sgs-segments>button{border:0;background:transparent;padding:4px;font-size:11px}.sgs-info .sgs-segments>button[aria-pressed=true]{background:color-mix(in srgb,var(--sgs-accent) 12%,transparent)}
.sgs-info input.sgs-input{width:100%}.sgs-info input[type=number]{appearance:textfield;-moz-appearance:textfield}.sgs-info input[type=number]::-webkit-inner-spin-button,.sgs-info input[type=number]::-webkit-outer-spin-button{appearance:none;margin:0}.sgs-info .filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sgs-info .filters label{color:var(--sgs-muted);font-size:11px;min-width:0}
.sgs-info .filters label.filter-full{grid-column:1/-1}.sgs-info .filters label:has(input[type=datetime-local]){grid-column:1/-1}
.sgs-info .stat{display:flex;align-items:baseline;gap:6px;margin:10px 0;font-variant-numeric:tabular-nums}.sgs-info .stat strong{font-size:25px;font-weight:600;color:var(--sgs-accent)}
.sgs-info .list{max-height:430px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.sgs-info .row{padding:10px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 60%,transparent)}
.sgs-info .row-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.sgs-info .name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sgs-info .number{font-variant-numeric:tabular-nums;flex:none;font-size:11px}
.sgs-info progress.progress{appearance:none;display:block;width:100%;height:3px;border:0;border-radius:2px;background:var(--sgs-raised);margin:7px 0;overflow:hidden}.sgs-info progress::-webkit-progress-bar{background:var(--sgs-raised)}.sgs-info progress::-webkit-progress-value{background:var(--sgs-accent)}.sgs-info progress::-moz-progress-bar{background:var(--sgs-accent)}
.sgs-info details{font-size:11px;color:var(--sgs-muted)}.sgs-info summary{cursor:pointer}.sgs-info details p{white-space:pre-wrap;margin:6px 0;overflow-wrap:anywhere}
.sgs-info .error{color:var(--sgs-danger);white-space:pre-wrap;overflow-wrap:anywhere}.sgs-info .empty{padding:20px 4px;text-align:center;color:var(--sgs-muted)}
.sgs-info .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:6px;color:var(--sgs-muted);font-size:10px}.sgs-info .metrics b{display:block;font-size:14px;color:var(--sgs-text);font-variant-numeric:tabular-nums;font-weight:500}
`;
export function panelUI(ctx, container) {
  const doc = ctx.document, cleanups = [], root = doc.createElement('section'); root.className = 'sgs-info';
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  container.append(root);
  const scheme = current => { const hex = current?.tokens?.bg || ''; const match = /^#([\da-f]{6})$/i.exec(hex);
    if (match) { const rgb = [0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16)); root.style.colorScheme = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 140 ? 'light' : 'dark'; } };
  scheme(ctx.themes?.current); if (ctx.themes?.subscribe) cleanups.push(ctx.themes.subscribe(scheme));
  const listen = (node, type, fn) => { cleanups.push(ctx.scope.listen(node, type, fn)); };
  const button = (text, icon, fn) => { const n = el('button', '', text); n.type = 'button'; if (icon) n.prepend(controlIcon(doc, icon)); listen(n, 'click', fn); return n; };
  const segments = (items, selected, change) => { const group = el('div', 'sgs-segments');
    for (const [value, label] of items) { const n = button(label, null, () => { for (const b of group.children) b.setAttribute('aria-pressed', String(b === n)); change(value); }); n.setAttribute('aria-pressed', String(value === selected)); group.append(n); } return group; };
  const input = (label, type = 'search') => { const n = el('input', 'sgs-input'); n.type = type; n.setAttribute('aria-label', label); n.placeholder = label; return n; };
  return { root, el, listen, button, segments, input, dispose: ctx.scope.add(() => { for (const off of cleanups) off(); root.remove(); }) };
}
