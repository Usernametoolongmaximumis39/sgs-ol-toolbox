const styles = `
  :host{position:fixed;inset:0;z-index:2147482950;pointer-events:none}
  [hidden]{display:none !important}
  .tab-key,.pane{position:absolute;box-sizing:border-box;transform-origin:0 0}
  .tab-key{appearance:none;padding:0;border:0;background:none;pointer-events:none}
  .tab-key:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:-2px;border-radius:4px}
  .pane{pointer-events:auto;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;
    scrollbar-color:var(--sgs-border) transparent;padding:10px;border-radius:4px;
    background:color-mix(in srgb,var(--sgs-bg) 93%,transparent);color:var(--sgs-text);
    font:calc(13px + var(--sgs-font-offset,0px))/1.4 var(--sgs-font,"Microsoft YaHei",sans-serif)}
  .pane button{appearance:none;font:inherit;color:inherit;cursor:pointer}
  .pane button:focus-visible,.error summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:-2px}
  .pane button:disabled{cursor:default;opacity:.45}
  .sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .sources button{box-sizing:border-box;display:flex;justify-content:center;align-items:center;gap:5px;min-height:34px;
    padding:4px;white-space:nowrap;border:1px solid var(--sgs-border-soft);border-radius:6px;
    background:linear-gradient(var(--sgs-raised),var(--sgs-surface))}
  .sources button:not(:disabled):hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}
  .sources .upload{border-color:var(--sgs-border);color:var(--sgs-accent)}
  .upload svg{width:14px;height:14px;flex:none}
  .heading{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;margin:10px 0 6px;white-space:nowrap}
  .heading strong{font-weight:600}
  .heading button{flex:none;min-height:30px;padding:2px 4px;border:0;border-radius:4px;background:transparent;color:var(--sgs-muted)}
  .heading button:not(:disabled):hover{color:var(--sgs-accent)}
  .history{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,96px),1fr));gap:7px}
  .history-card{display:block;min-width:0;padding:0;overflow:hidden;text-align:left;border:1px solid var(--sgs-border-soft);
    border-radius:6px;background:var(--sgs-surface)}
  .history-card:hover,.history-card[aria-pressed=true]{border-color:var(--sgs-accent)}
  .preview{position:relative;aspect-ratio:16/9;background:var(--sgs-raised)}
  .preview>img{display:block;width:100%;height:100%;object-fit:cover}
  .selected{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:4px;background:var(--sgs-bg);
    color:var(--sgs-accent);font-size:.88em;white-space:nowrap}
  .copy{display:grid;gap:1px;padding:4px 6px 5px}
  .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .source,.status{color:var(--sgs-muted);font-size:.9em}
  .status{margin:6px 0;overflow-wrap:anywhere}
  .error{margin:6px 0;color:var(--sgs-danger);overflow-wrap:anywhere}
  .error summary{padding:3px 0;cursor:pointer}
  .error p{margin:3px 0}
  @media(max-width:640px){.pane{padding:6px}.sources button,.heading button{gap:3px}.upload svg{width:12px;height:12px}}
`;

export function createBackgroundPane(ctx, scope, { animated, attackEffects, uploadIcon, selectTab, closeNative, isCurrent }) {
  const { window: win, document: doc, backgrounds } = ctx;
  const host = doc.createElement('div');
  host.dataset.sgsBackgroundHistory = '';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const element = (tag, cls, text) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const button = (label, cls) => {
    const node = element('button', cls, label);
    node.type = 'button';
    return node;
  };
  const style = element('style', '', styles);
  const tabKey = button('', 'tab-key');
  tabKey.setAttribute('aria-label', '自定义背景');
  tabKey.setAttribute('aria-controls', 'sgs-background-history-pane');
  const pane = element('section', 'pane');
  pane.id = 'sgs-background-history-pane';
  pane.setAttribute('aria-label', '自定义背景');
  pane.hidden = true;
  const sources = element('div', 'sources');
  sources.setAttribute('role', 'group');
  sources.setAttribute('aria-label', '选择背景来源');
  const upload = button('上传图片', 'upload');
  upload.setAttribute('aria-label', '选择本地图片');
  upload.title = '图片仅保存在此设备。支持 PNG、JPG、WebP、BMP，最大 20 MB。';
  upload.prepend(ctx.ui.icon(uploadIcon));
  const file = element('input');
  file.type = 'file';
  file.accept = '.png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp,image/bmp';
  file.hidden = true;
  const reset = button('恢复游戏背景');
  const heading = element('div', 'heading');
  heading.append(element('strong', '', '使用历史'), reset);
  const status = element('p', 'status');
  status.setAttribute('role', 'status');
  const error = element('details', 'error');
  const errorText = element('p');
  error.append(element('summary', '', '查看错误详情'), errorText);
  error.hidden = true;
  const grid = element('div', 'history');
  pane.append(sources, heading, status, error, grid, file);
  shadow.append(style, tabKey, pane);
  (doc.body || doc.documentElement).append(host);
  scope.add(() => host.remove());
  scope.add(ctx.ui.mountStyles(shadow));
  scope.add(ctx.ui.nativeTheme.watch(palette => {
    for (const [key, value] of Object.entries(palette)) {
      host.style.setProperty('--sgs-' + (key === 'borderSoft' ? 'border-soft' : key), value);
    }
  }));
  const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
  let generation = 0, busy = null, closePicker, problem = '', listError = '', listing = false, readAgain = false, rows = null;
  const cards = new Map();
  const current = () => !scope.closed && !pane.hidden && isCurrent();

  function update() {
    const failure = problem || listError || backgrounds.historyError;
    errorText.textContent = failure || '';
    error.hidden = !failure;
    reset.disabled = !backgrounds.current || busy !== null;
    upload.disabled = busy !== null;
    const state = busy?.label || (listError ? '' : rows === null ? '正在读取历史…' : rows.length ? '' : '选择背景后，预览会保存在这里。');
    if (status.textContent !== state) status.textContent = state;
    status.hidden = !state;
    const selectedId = backgrounds.currentHistoryId;
    for (const [id, { control, selected }] of cards) {
      const applied = id === selectedId;
      control.setAttribute('aria-pressed', String(applied));
      selected.hidden = !applied;
    }
  }

  function makeCard(entry) {
    const control = button('', 'history-card');
    control.dataset.historyId = entry.id;
    control.title = entry.name;
    const preview = element('div', 'preview');
    const selected = element('span', 'selected', '使用中');
    const copy = element('span', 'copy');
    const img = element('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    if (entry.preview) img.src = entry.preview;
    else if (entry.url) {
      const laya = win.Laya ?? win.laya;
      let url = entry.url;
      try { url = laya?.URL?.formatURL?.(url) || url; } catch { /* Keep the saved artwork address. */ }
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (current() && control.isConnected && img.crossOrigin) void backgrounds.cacheHistoryPreview(entry.id, img);
      };
      img.onerror = () => {
        if (img.crossOrigin && current()) { img.removeAttribute('crossorigin'); img.src = url; }
        else img.hidden = true;
      };
      img.src = url;
    } else img.hidden = true;
    preview.append(img, selected);
    copy.append(element('span', 'name', entry.name), element('span', 'source', entry.source));
    control.append(preview, copy);
    return { control, selected, entry };
  }

  async function readHistory() {
    if (!current()) return;
    if (listing) { readAgain = true; return; }
    const opened = generation;
    listing = true;
    const stillOpen = () => opened === generation && current();
    try {
      const entries = await backgrounds.listHistory();
      if (!stillOpen()) return;
      listError = '';
      const sameEntry = (a, b) => a.id === b.id && a.name === b.name && a.preview === b.preview;
      const sameOrder = rows?.length === entries.length && entries.every((entry, i) => sameEntry(rows[i], entry));
      if (!sameOrder) {
        const focusedId = shadow.activeElement?.dataset.historyId;
        const next = entries.map(entry => {
          let card = cards.get(entry.id);
          if (!card || !sameEntry(card.entry, entry)) {
            card = makeCard(entry);
            cards.set(entry.id, card);
          }
          return card.control;
        });
        grid.replaceChildren(...next);
        if (focusedId) cards.get(focusedId)?.control.focus({ preventScroll: true });
      }
      rows = entries;
    } catch (failure) {
      if (stillOpen()) listError = failure?.message || String(failure);
    } finally {
      if (opened === generation) {
        listing = false;
        if (stillOpen()) {
          update();
          if (readAgain) { readAgain = false; void readHistory(); }
        }
      }
    }
  }

  async function run(label, operation) {
    if (!current() || busy) return;
    const job = busy = { label };
    const opened = generation;
    const valid = () => busy === job && opened === generation && current();
    problem = '';
    update();
    try { await operation(valid); }
    catch (failure) { if (valid()) problem = failure?.message || String(failure); }
    finally {
      if (busy === job) { busy = null; update(); void readHistory(); }
    }
  }

  for (const [source, label] of [['native', '本服皮肤'], ['cross', '一将成名'], ['mobile', '移动版皮肤']]) {
    const entry = button(label);
    sources.append(entry);
    scope.listen(entry, 'click', () => {
      if (!current()) return;
      problem = '';
      try {
        if (backgrounds.skinShortcutEnabled?.() === false) throw new Error('请在「皮肤管理」启用「一键牌局背景」。');
        closePicker?.();
        closePicker = ctx.skinWindows.open(source, entry);
        if (source === 'native') closeNative();
      } catch (failure) { problem = failure?.message || String(failure); }
      update();
    });
  }
  sources.append(upload);
  scope.listen(tabKey, 'click', selectTab);
  scope.listen(shadow, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeNative();
  });
  scope.listen(upload, 'click', () => { if (current()) file.click(); });
  scope.listen(file, 'change', () => {
    const picked = file.files?.[0];
    file.value = '';
    if (picked) void run('正在保存图片…', valid => backgrounds.selectLocal(picked, valid));
  });
  scope.listen(reset, 'click', () => void run('正在恢复…', () => backgrounds.select(null)));
  scope.listen(grid, 'click', event => {
    const id = event.target.closest('button[data-history-id]')?.dataset.historyId;
    if (id) void run('正在切换背景…', valid => backgrounds.restoreHistory(id, { animated: animated(), attackEffects: attackEffects(), isCurrent: valid }));
  });
  const positions = new WeakMap();
  const position = (node, { left, top, width, height, rotation }) => {
    const rect = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;transform:rotate(${rotation}rad)`;
    if (positions.get(node) !== rect) { node.style.cssText = rect; positions.set(node, rect); }
  };
  function setOpen(open) {
    tabKey.setAttribute('aria-expanded', String(open));
    if (pane.hidden === !open) return;
    pane.hidden = !open;
    generation++;
    if (open) {
      update();
      void readHistory();
    } else {
      closePicker?.(); closePicker = null;
      busy = null; listing = false; readAgain = false; problem = listError = ''; rows = null;
      error.open = false;
      cards.clear();
      grid.replaceChildren();
      pane.scrollTop = 0;
    }
  }
  scope.add(() => setOpen(false));
  return {
    refresh() { update(); void readHistory(); },
    layout(tabRect, paneRect) {
      host.hidden = !tabRect;
      if (tabRect) position(tabKey, tabRect);
      if (paneRect) position(pane, paneRect);
      if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
      setOpen(Boolean(paneRect));
    },
  };
}
