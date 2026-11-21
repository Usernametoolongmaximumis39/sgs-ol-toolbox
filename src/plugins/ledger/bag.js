import { read } from '../../shared/info-runtime.js';
import { cachedNativeWindow, isMountedWindowNode } from '../../shared/window-cache.js';

const COUPONS = 'gn_dbs_coupon_cfg';
const BADGES_PER_FRAME = 12;
const PROFILE_WINDOW = 'UserInfoWindow';
const visible = node => {
  if (!node?.parent || node.destroyed) return false;
  for (let n = node; n; n = n.parent) if (n.visible === false || n.destroyed) return false;
  return true;
};
const isBagView = node => Array.isArray(node?.bags) && node.topSp && typeof node.showBags === 'function'
  && typeof node.updatePageIdx === 'function' && typeof node.updateRadioBtnData === 'function';

export function findBagViews(stage) {
  const queue = stage ? [stage] : [], found = [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    // BagView is a tab of the profile window, outside the native scene layer.
    if (node.name === 'SceneLayer' || node.layerOrder === 2 || node.LayerOrder === 2) continue;
    if (isBagView(node) && visible(node)) found.push(node);
    const children = node._children;
    if (Array.isArray(children)) for (let j = 0; j < children.length && queue.length < 4000; j++) queue.push(children[j]);
  }
  return found;
}

function findCurrentBag(ctx, stage) {
  if (!stage) return [];
  const dispatcher = read(() => ctx.game.getDispatcher());
  const profile = cachedNativeWindow(dispatcher, PROFILE_WINDOW);
  if (profile === undefined) return findBagViews(stage);
  if (!isMountedWindowNode(stage, profile)) return [];
  // The view stack can keep a requested tab and the displayed tab separately while resources load.
  const stack = profile.viewStack;
  if (!stack || !('displayedChild' in stack)) return findBagViews(stage);
  const bag = stack.displayedChild;
  return isBagView(bag) && isMountedWindowNode(stage, bag) ? [bag] : [];
}
export function filterBag(rows, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  return term ? rows.filter(row => String(row?.baseInfo?.ItemName || row?.baseInfo?.name || '').toLocaleLowerCase().includes(term)) : rows;
}
export function couponAmounts(base, config) {
  if (Number(base?.TypeID) !== 98) return '';
  const effect = String(base.usedeffect || '').split(';').map(s => s.trim()).find(s => /^GRmb-\d+$/.test(s));
  if (!effect) return '';
  const rows = config?.sgs_config?.couponsys?.GRmb?.seting;
  if (!Array.isArray(rows)) return '';
  const id = Number(effect.slice(5)), row = rows.find(r => Number(r?.AID) === id);
  const values = String(row?.AVV || '').split('-');
  if (values.length !== 2 || !values.every(v => /^\d+$/.test(v))) return '';
  const [threshold, discount] = values.map(Number);
  return Number.isSafeInteger(threshold) && Number.isSafeInteger(discount) && threshold >= discount && discount > 0 ? `${threshold}-${discount}` : '';
}

// RemainingTime is a clock-based getter. Only compare actual inventory data.
const inventoryFields = [
  row => row?.ID, row => row?.BaseID, row => row?.Count, row => row?.BitMark, row => row?.Expirydate,
  (_, base) => base?.ItemName, (_, base) => base?.name, (_, base) => base?.sortindex,
];
function inventoryChanged(rows, saved) {
  let offset = 0;
  for (const row of rows) {
    const base = row?.baseInfo;
    for (const readField of inventoryFields) if (!Object.is(readField(row, base), saved[offset++])) return true;
  }
  return false;
}

// Patch only this mounted view and its own slots. bagDatas stays complete for
// the client's incremental inventory updates; only drawing/paging is filtered.
export function enhanceBagView(ctx, owner, getConfig) {
  const L = ctx.window.Laya ?? ctx.window.laya, theme = ctx.ui.nativeTheme;
  const releases = [], slots = new Map(), pendingBadges = new Set();
  const canDeferBadges = typeof ctx.window.requestAnimationFrame === 'function';
  let releaseFrame = null;
  let disposed = false, query = '', showing = false, hover = false;
  let palette = theme.palette, resultCount = 0, lastRows, lastLength, lastInventory = [];
  const originalShow = owner.showBags, originalPage = owner.updatePageIdx;
  const patch = (target, key, factory, collection = releases) => collection.push(ctx.scope.patch(target, key, old => {
    const changed = factory(old);
    return function (...args) { return (disposed ? old : changed).apply(this, args); };
  }));
  const listen = (node, type, fn) => { node.on(type, owner, fn); releases.push(() => node.off(type, owner, fn)); };
  const root = new L.Sprite(); root.name = 'sgs-toolbox-bag-search'; root.size(184, 26); root.pos(520, 28); root.zOrder = 110;
  root.mouseEnabled = true; owner.addChild(root);
  const input = new L.TextInput(''); input.name = 'bag-search-input'; input.size(148, 24); input.pos(7, 1);
  Object.assign(input, { prompt: '搜索道具', font: 'Microsoft YaHei', fontSize: 12, padding: '3,2,3,2', maxChars: 80, bgColor: null }); root.addChild(input);
  const button = new L.Sprite(); button.name = 'bag-search-button'; button.size(28, 26); button.pos(156, 0); button.mouseEnabled = true; root.addChild(button);
  const icon = new L.Sprite(); icon.mouseEnabled = false; button.addChild(icon);
  const status = new L.Text(); status.name = 'bag-search-status'; status.pos(0, 29); status.size(184, 19);
  Object.assign(status, { font: 'Microsoft YaHei', fontSize: 11, align: 'right', valign: 'middle', mouseEnabled: false, visible: false }); root.addChild(status);
  const empty = new L.Text(); empty.name = 'bag-search-empty'; empty.pos(200, 225); empty.size(400, 32);
  Object.assign(empty, { text: '没有符合搜索条件的道具', font: 'Microsoft YaHei', fontSize: 14, align: 'center', valign: 'middle', mouseEnabled: false, visible: false }); owner.addChild(empty);
  function paint() {
    const p = palette;
    theme.surface(root, { width: 184, height: 26, kind: 'panel' });
    input.color = p.text; input.promptColor = p.muted;
    status.color = p.muted; status.bgColor = p.bg; empty.color = p.muted; empty.bgColor = p.bg;
    theme.surface(button, { width: 28, height: 26, kind: 'button', hover, selected: Boolean(input.focus) });
    const g = icon.graphics; g.clear();
    if (query) { g.drawLine(10, 9, 18, 17, p.accent, 1.5); g.drawLine(18, 9, 10, 17, p.accent, 1.5); button.ToolTip = '清空搜索（Esc）'; }
    else { g.drawCircle(12, 11, 4, null, p.accent, 1.5); g.drawLine(15, 14, 19, 18, p.accent, 1.5); button.ToolTip = '搜索道具（Enter）'; }
  }
  function updateStatus() {
    const searching = Boolean(query);
    status.visible = hover || searching;
    status.text = hover ? (searching ? '清空搜索 · Esc' : '搜索道具 · Ctrl+F') : (searching ? `找到 ${resultCount} 项` : '');
    empty.visible = searching && resultCount === 0;
  }
  function page() {
    if (!query) return originalPage.call(owner);
    const full = owner.bagDatas;
    try { owner.bagDatas = filterBag(Array.isArray(full) ? full : [], query); return originalPage.call(owner); }
    finally { owner.bagDatas = full; }
  }
  function draw(rows = owner.bagDatas) {
    const full = Array.isArray(rows) ? rows : [];
    const filtered = filterBag(full, query);
    owner.bagDatas = filtered;
    let result;
    showing = true;
    try {
      originalPage.call(owner);
      result = originalShow.call(owner, filtered);
    }
    finally { owner.bagDatas = full; showing = false; }
    rememberInventory();
    resultCount = filtered.length;
    updateStatus();
    syncSlots();
    return result;
  }
  function apply() {
    const wasSearching = Boolean(query);
    query = input.text.trim(); owner.curPage = 1; draw();
    if (wasSearching !== Boolean(query)) paint();
  }
  function clear() { input.text = ''; apply(); }
  patch(owner, 'showBags', () => function (rows) { return draw(Array.isArray(rows) ? rows : []); });
  patch(owner, 'updatePageIdx', () => function () { return page(); });
  function rememberInventory() {
    lastRows = owner.bagDatas;
    lastLength = lastRows?.length;
    lastInventory = [];
    if (!query || !Array.isArray(lastRows)) return;
    for (const row of lastRows) {
      const base = row?.baseInfo;
      for (const readField of inventoryFields) lastInventory.push(readField(row, base));
    }
  }
  // Native handlers already update unfiltered slots. While searching, check
  // for incremental changes that bypass showBags, such as native deletions.
  function refresh() {
    if (owner.bagDatas !== lastRows || owner.bagDatas?.length !== lastLength
      || (query && Array.isArray(lastRows) && inventoryChanged(lastRows, lastInventory))) draw();
    else syncSlots();
  }
  listen(input, L.Event.INPUT, apply);
  listen(input, L.Event.KEY_DOWN, event => { if (event.keyCode === 13) apply(); if (event.keyCode === 27) { clear(); input.focus = false; } });
  if (ctx.document) releases.push(ctx.scope.listen(ctx.document, 'keydown', event => {
    const tag = event.target?.tagName;
    if ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'f' && visible(owner)
      && (!tag || tag === 'BODY' || tag === 'CANVAS')) { event.preventDefault(); input.focus = true; }
  }));
  let inputElement, inputLabel;
  const restoreLabel = () => {
    if (inputElement?.getAttribute('aria-label') === '搜索背包道具') {
      if (inputLabel === null) inputElement.removeAttribute('aria-label'); else inputElement.setAttribute('aria-label', inputLabel);
    }
    inputElement = null;
  };
  listen(input, L.Event.FOCUS, () => {
    restoreLabel(); inputElement = L.Input?.inputElement;
    if (inputElement?.getAttribute) { inputLabel = inputElement.getAttribute('aria-label'); inputElement.setAttribute('aria-label', '搜索背包道具'); }
    paint();
  });
  listen(input, L.Event.BLUR, () => { restoreLabel(); paint(); });
  releases.push(restoreLabel);
  listen(button, L.Event.CLICK, () => { if (query) clear(); else apply(); input.focus = true; });
  listen(button, L.Event.MOUSE_OVER, () => { hover = true; updateStatus(); paint(); });
  listen(button, L.Event.MOUSE_OUT, () => { hover = false; updateStatus(); paint(); });
  function updateSlot(slot, state, create = true, config = getConfig()) {
    const text = slot.visible !== false ? couponAmounts(slot.BaseData || slot.baseData, config) : '';
    if (!text) {
      if (state.badge?.visible) state.badge.visible = false;
      pendingBadges.delete(slot);
      return false;
    }
    const created = !state.badge;
    if (created && !create) { pendingBadges.add(slot); return false; }
    if (created) {
      const badge = new L.Text(); badge.name = 'sgs-toolbox-coupon-amount'; badge.zOrder = 110;
      Object.assign(badge, { font: 'Arial', bold: true, align: 'center', valign: 'middle', mouseEnabled: false });
      owner.topSp.addChild(badge); state.badge = badge; pendingBadges.delete(slot);
    }
    const { badge } = state;
    if (!badge.visible) badge.visible = true;
    if (badge.color !== palette.accent) badge.color = palette.accent;
    if (badge.bgColor !== palette.bg) badge.bgColor = palette.bg;

    const count = slot.countTxt;
    const countX = count?.text ? count.x : null;
    const countY = count?.text ? count.y : null;
    const layout = [text, slot.width, slot.height, slot._x, slot._y, countX, countY];
    if (state.layout && layout.every((value, i) => value === state.layout[i])) return false;
    state.layout = layout;
    const inset = 2;
    const height = 13;
    const padding = 4;
    const frameWidth = slot.width - 2 * inset;
    const countLeft = countX === null ? slot.width : countX - slot._x;
    const besideCount = Math.min(frameWidth, countLeft - inset - 2);
    badge.text = text;
    badge.fontSize = 10;
    while (badge.textWidth + padding > besideCount && badge.fontSize > 8) badge.fontSize--;

    let y = slot.height - inset - height;
    if (countY !== null && badge.textWidth + padding > besideCount) {
      // Keep long amounts inside the slot and clear of the native quantity.
      y = Math.max(inset, Math.min(y, countY - slot._y - height - 2));
    }
    while (badge.textWidth + padding > frameWidth && badge.fontSize > 7) badge.fontSize--;
    badge.size(Math.min(frameWidth, Math.ceil(badge.textWidth) + padding), height);
    badge.pos(slot._x + inset, slot._y + y);
    return created;
  }
  function scheduleBadges() {
    if (!pendingBadges.size || releaseFrame) return;
    const id = ctx.window.requestAnimationFrame(() => {
      releaseFrame?.(); releaseFrame = null;
      if (disposed || !visible(owner)) { pendingBadges.clear(); return; }
      const config = getConfig();
      let remaining = BADGES_PER_FRAME;
      for (const slot of pendingBadges) {
        pendingBadges.delete(slot);
        const state = slots.get(slot);
        if (state && owner.bags.includes(slot) && updateSlot(slot, state, true, config) && --remaining === 0) break;
      }
      scheduleBadges();
    });
    releaseFrame = ctx.scope.add(() => ctx.window.cancelAnimationFrame?.(id));
  }
  function clearSlot(slot, state) {
    pendingBadges.delete(slot); slots.delete(slot);
    for (const off of state.releases.reverse()) off();
    state.badge?.destroy(true);
  }
  function syncSlots() {
    for (const [slot, state] of slots) if (!owner.bags.includes(slot)) clearSlot(slot, state);
    const config = getConfig();
    let remaining = canDeferBadges ? BADGES_PER_FRAME : Infinity;
    for (const slot of owner.bags) {
      if (!slot || typeof slot.updateItem !== 'function') continue;
      let state = slots.get(slot);
      if (!state) {
        state = { badge: null, layout: null, releases: [] };
        slots.set(slot, state);
        for (const key of ['updateItem', 'Move', 'initData', 'Clear']) if (typeof slot[key] === 'function') patch(slot, key, old => function (...args) {
          const result = old.apply(this, args);
          if (!showing && slots.get(slot) === state && !state.badge?.destroyed) updateSlot(slot, state);
          return result;
        }, state.releases);
      }
      if (updateSlot(slot, state, remaining > 0, config)) remaining--;
    }
    scheduleBadges();
  }
  const offTheme = theme.watch(() => { palette = theme.palette; paint(); syncSlots(); }, { target: root });
  releases.push(offTheme);
  const destroy = () => release(); listen(owner, L.Event.DESTROY || 'destroy', destroy);
  let release = ctx.scope.add(() => {
    if (disposed) return; disposed = true;
    releaseFrame?.(); releaseFrame = null;
    for (const off of releases.reverse()) off();
    input.focus = false; root.destroy(true); empty.destroy(true);
    for (const [slot, state] of slots) clearSlot(slot, state);
    if (query && !owner.destroyed && owner.parent) { originalPage.call(owner); originalShow.call(owner, owner.bagDatas); }
  });
  // The native view has already drawn its current page when we attach.
  rememberInventory();
  return { dispose: release, refresh, input, button };
}

export function createBagEnhancements(ctx) {
  const views = new Map(); let config = null, loading = false, retryAt = 0, lastError = '';
  const getConfig = () => config;
  async function load() {
    if (loading || Date.now() < retryAt || ctx.scope.signal.aborted || config) return;
    config = read(() => ctx.game.getConfigData(COUPONS)); if (config) return;
    loading = true;
    try { const next = await ctx.game.loadConfigData(COUPONS); if (!ctx.scope.signal.aborted) config = next; }
    catch (e) { retryAt = Date.now() + 5000; if (!/^等待/.test(e.message) && lastError !== e.message) { lastError = e.message; ctx.notify?.(`抵价券金额配置读取失败：${e.stack || e}`); } }
    finally { loading = false; }
  }
  function tick() {
    if (ctx.scope.signal.aborted) return;
    const found = findCurrentBag(ctx, (ctx.window.Laya ?? ctx.window.laya)?.stage);
    for (const [view, enhancement] of views) if (!found.includes(view)) { enhancement.dispose(); views.delete(view); }
    if (found.length) void load();
    for (const view of found) {
      const enhancement = views.get(view);
      if (enhancement) enhancement.refresh();
      else views.set(view, enhanceBagView(ctx, view, getConfig));
    }
  }
  tick(); ctx.scope.interval(tick, 500);
  ctx.scope.add(() => { for (const view of views.values()) view.dispose(); views.clear(); config = null; });
  return { tick };
}
