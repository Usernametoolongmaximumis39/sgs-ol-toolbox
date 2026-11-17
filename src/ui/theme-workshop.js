import { controlIcon, helpTip } from './controls.js';
import { BLACK_GOLD } from '../core/themes.js';
import { ResourceScope } from '../core/resources.js';

const STYLES = `
.sgs-themes{font:12px/1.5 var(--sgs-font,sans-serif);color:var(--sgs-text);min-width:0}
.sgs-themes .theme-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px}
.sgs-themes h4{margin:0;font-size:13px;color:var(--sgs-accent)}
.sgs-themes .theme-count{font-size:10px;color:var(--sgs-muted);white-space:nowrap}
.sgs-themes .theme-intro{margin:0 0 13px;font-size:11px;color:var(--sgs-muted);line-height:1.65}
.sgs-themes .theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sgs-themes button.theme-card{position:relative;display:block;min-width:0;width:100%;padding:0;overflow:hidden;text-align:left;border:1px solid color-mix(in srgb,var(--sgs-border) 55%,transparent);border-radius:8px;background:var(--sgs-surface);box-shadow:0 2px 7px #0002;color:var(--sgs-text);cursor:pointer;transition:border-color .16s,background .16s}
.sgs-themes button.theme-card:hover{border-color:var(--sgs-accent);background:var(--sgs-raised)}
.sgs-themes button.theme-card[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 0 -2px var(--sgs-accent),0 2px 7px #0002}
.sgs-themes button.theme-card:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.sgs-themes button.theme-card:disabled{cursor:default;opacity:1}
.sgs-themes .theme-preview{display:flex;align-items:center;justify-content:center;height:56px;padding:10px 7px;background:linear-gradient(145deg,var(--preview-surface),var(--preview-bg));border-bottom:1px solid color-mix(in srgb,var(--preview-border) 50%,transparent);color:var(--preview-text)}
.sgs-themes .theme-mini{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;max-width:126px;height:30px;padding:0 7px;border:1px solid color-mix(in srgb,var(--preview-border) 65%,transparent);border-radius:7px;background:linear-gradient(155deg,var(--preview-raised),var(--preview-bg));box-shadow:0 2px 5px #0004,inset 0 1px color-mix(in srgb,var(--preview-accent) 12%,transparent)}
.sgs-themes .theme-mini-seal{font:17px/1 'KaiTi','STKaiti',serif;color:var(--preview-accent)}
.sgs-themes .theme-mini-number{font:600 18px/1 Georgia,serif;color:var(--preview-text)}
.sgs-themes .theme-mini-separator{width:1px;height:13px;background:var(--preview-border);margin-left:auto}
.sgs-themes .theme-mini .sgs-line-icon{width:13px;height:13px;color:var(--preview-muted)}
.sgs-themes .theme-meta{display:block;padding:8px 8px 9px;min-width:0}
.sgs-themes .theme-title-row{display:flex;align-items:center;justify-content:space-between;gap:3px;min-width:0}
.sgs-themes .theme-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-card-state{font-size:9px;color:var(--sgs-muted);white-space:nowrap;flex:none}
.sgs-themes [aria-pressed=true] .theme-card-state{color:var(--sgs-accent)}
.sgs-themes .theme-description{display:block;margin-top:3px;font-size:10px;color:var(--sgs-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-status{display:flex;align-items:center;gap:5px;margin:11px 0 0;font-size:11px;color:var(--sgs-accent);overflow-wrap:anywhere}
.sgs-themes .theme-status-row{display:flex;align-items:center;gap:5px;margin-top:11px}.sgs-themes .theme-status-row .theme-status{margin:0;min-width:0}
.sgs-themes .theme-footnote{margin:5px 0 0;font-size:10px;line-height:1.7;color:var(--sgs-muted)}
@media(prefers-reduced-motion:reduce){.sgs-themes button.theme-card{transition:none}}
`;

// The core owns the gallery; every registered theme is discovered through its public registry.
export function mountThemeWorkshop(container, { document: doc, themes, notify }) {
  const scope = new ResourceScope(), root = doc.createElement('section');
  root.className = 'sgs-themes'; root.dataset.themeWorkshop = '';
  const el = (tag, cls, text) => { const node = doc.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const style = el('style'); style.textContent = STYLES;
  const heading = el('div', 'theme-heading'), count = el('span', 'theme-count');
  const title = el('div', 'theme-heading'); title.style.marginBottom = '0';
  title.append(el('h4', '', '选择配色'));
  heading.append(title, count);
  const intro = helpTip(doc, '选择一套配色，即刻换装。');
  const grid = el('div', 'theme-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '工具箱主题');
  const status = el('p', 'theme-status'); status.dataset.themeStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const footnote = helpTip(doc, '配色自动保存。主题包停用后暂回玄金，重新启用后恢复选择。');
  title.append(intro);
  const statusRow = el('div', 'theme-status-row'); statusRow.append(status, footnote);
  root.append(style, heading, grid, statusRow); container.append(root);
  let signature, cards = new Map(), cardScope;
  const update = () => {
    if (scope.closed) return;
    const palette = themes?.list() || [BLACK_GOLD], current = themes?.current;
    const next = JSON.stringify(palette);
    if (signature !== next) {
      signature = next; cardScope?.dispose(); cardScope = new ResourceScope(); cards = new Map(); grid.replaceChildren();
      count.textContent = `${palette.length} 套配色`;
      for (const theme of palette) {
        const description = theme.description || (theme.id === BLACK_GOLD.id ? '沉静玄色，经典鎏金' : '扩展主题');
        const button = el('button', 'theme-card'); button.type = 'button'; button.dataset.themeId = theme.id;
        button.setAttribute('aria-label', `使用${theme.name}主题`); button.title = `${theme.name} · ${description}`;
        button.setAttribute('aria-pressed', 'false'); button.disabled = !themes;
        const preview = el('span', 'theme-preview'); preview.setAttribute('aria-hidden', 'true');
        for (const [key, value] of Object.entries({ ...BLACK_GOLD.tokens, ...theme.tokens })) preview.style.setProperty('--preview-' + key, value);
        const mini = el('span', 'theme-mini');
        mini.append(el('span', 'theme-mini-seal', '杀'), el('span', 'theme-mini-number', '3'), el('span', 'theme-mini-separator'), controlIcon(doc, 'camera'));
        preview.append(mini);
        const meta = el('span', 'theme-meta'), title = el('span', 'theme-title-row'), state = el('span', 'theme-card-state');
        title.append(el('span', 'theme-name', theme.name), state); meta.append(title, el('span', 'theme-description', description)); button.append(preview, meta);
        cardScope.listen(button, 'click', () => {
          try { themes.select(theme.id); }
          catch (error) { notify(`主题切换失败：${error?.message || String(error)}`); }
        });
        cards.set(theme.id, { button, state }); grid.append(button);
      }
    }
    for (const [id, { button, state }] of cards) {
      const active = current?.id === id;
      button.setAttribute('aria-pressed', String(active)); state.textContent = active ? '使用中' : '切换';
    }
    const selected = palette.find(theme => theme.id === current?.id);
    status.textContent = `当前 · ${selected?.name || BLACK_GOLD.name}`;
  };
  update();
  if (themes) scope.add(themes.subscribe(update));
  scope.add(() => { cardScope?.dispose(); root.remove(); });
  return () => scope.dispose();
}
