import { read } from '../../shared/info-runtime.js';
import { getNativeTheme } from '../../ui/native-theme.js';

const COUPONS = 'gn_dbs_coupon_cfg';
const visible = node => {
  if (!node?.parent || node.destroyed) return false;
  for (let n = node; n; n = n.parent) if (n.visible === false || n.destroyed) return false;
  return true;
};
export function findBagViews(stage) {
  const queue = stage ? [stage] : [], found = [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    // BagView is a tab of the profile window, outside the native scene layer.
    if (node.name === 'SceneLayer' || node.layerOrder === 2 || node.LayerOrder === 2) continue;
    if (Array.isArray(node.bags) && node.topSp && typeof node.showBags === 'function'
      && typeof node.updatePageIdx === 'function' && typeof node.updateRadioBtnData === 'function' && visible(node)) found.push(node);
    const children = node._children;
    if (Array.isArray(children)) queue.push(...children);
  }
  return found;
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

// Patch only this mounted view and its own slots. bagDatas stays complete for
// the client's incremental inventory updates; only drawing/paging is filtered.
export function enhanceBagView(ctx, owner, getConfig) {
  const L = ctx.window.Laya ?? ctx.window.laya, theme = getNativeTheme(ctx);
  const releases = [], slots = new Map();
  let disposed = false, query = '', showing = false, hover = false;
  const originalShow = owner.showBags, originalPage = owner.updatePageIdx;
  const patch = (target, key, factory) => releases.push(ctx.scope.patch(target, key, old => {
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
  Object.assign(status, { font: 'Microsoft YaHei', fontSize: 11, align: 'right', valign: 'middle', mouseEnabled: false }); root.addChild(status);
  const empty = new L.Text(); empty.name = 'bag-search-empty'; empty.pos(200, 225); empty.size(400, 32);
  Object.assign(empty, { text: '没有符合搜索条件的道具', font: 'Microsoft YaHei', fontSize: 14, align: 'center', valign: 'middle', mouseEnabled: false }); owner.addChild(empty);
  function paint() {
    const p = theme.palette;
    theme.surface(root, { width: 184, height: 26, kind: 'panel' });
    input.color = p.text; input.promptColor = p.muted;
    status.color = p.muted; status.bgColor = p.bg; empty.color = p.muted; empty.bgColor = p.bg;
    theme.surface(button, { width: 28, height: 26, kind: 'button', hover, selected: Boolean(input.focus) });
    const g = icon.graphics; g.clear();
    if (query) { g.drawLine(10, 9, 18, 17, p.accent, 1.5); g.drawLine(18, 9, 10, 17, p.accent, 1.5); button.ToolTip = '清空搜索（Esc）'; }
    else { g.drawCircle(12, 11, 4, null, p.accent, 1.5); g.drawLine(15, 14, 19, 18, p.accent, 1.5); button.ToolTip = '搜索道具（Enter）'; }
  }
  function page() {
    const full = owner.bagDatas;
    try { owner.bagDatas = filterBag(Array.isArray(full) ? full : [], query); return originalPage.call(owner); }
    finally { owner.bagDatas = full; }
  }
  function draw(rows = owner.bagDatas) {
    const full = Array.isArray(rows) ? rows : [];
    owner.bagDatas = full; page();
    showing = true;
    try { originalShow.call(owner, filterBag(full, query)); }
    finally { owner.bagDatas = full; showing = false; }
    const count = filterBag(full, query).length;
    status.visible = Boolean(query); status.text = `找到 ${count} 项`; empty.visible = Boolean(query) && count === 0;
    syncSlots(); paint();
  }
  function apply() { query = input.text.trim(); owner.curPage = 1; draw(); }
  function clear() { input.text = ''; apply(); }
  patch(owner, 'showBags', () => function (rows) { return draw(Array.isArray(rows) ? rows : []); });
  patch(owner, 'updatePageIdx', () => function () { return page(); });
  // Native on/off requires the exact same callback identity. Leave both the
  // view handlers and pooled manager handlers untouched across close/reopen.
  let lastInventory = '';
  function inventoryKey() {
    return JSON.stringify((owner.bagDatas || []).map(row => [row?.ID, row?.BaseID,
      row?.Count, row?.BitMark, row?.Expirydate, row?.RemainingTime,
      row?.baseInfo?.ItemName, row?.baseInfo?.name, row?.baseInfo?.sortindex]));
  }
  function refresh() {
    const next = inventoryKey();
    if (next !== lastInventory) { draw(); lastInventory = inventoryKey(); }
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
  listen(button, L.Event.MOUSE_OVER, () => { hover = true; status.visible = true; status.text = query ? '清空搜索 · Esc' : '搜索道具 · Ctrl+F'; paint(); });
  listen(button, L.Event.MOUSE_OUT, () => { hover = false; status.visible = Boolean(query); status.text = `找到 ${filterBag(owner.bagDatas || [], query).length} 项`; paint(); });
  function updateSlot(slot, badge) {
    const text = couponAmounts(slot.BaseData || slot.baseData, getConfig());
    badge.visible = Boolean(text) && slot.visible !== false;
    if (!text) return;

    const inset = 2;
    const height = 13;
    const padding = 4;
    const frameWidth = slot.width - 2 * inset;
    const count = slot.countTxt;
    const countLeft = count?.text ? count.x - slot._x : slot.width;
    const besideCount = Math.min(frameWidth, countLeft - inset - 2);
    badge.text = text;
    badge.fontSize = 10;
    while (badge.textWidth + padding > besideCount && badge.fontSize > 8) badge.fontSize--;

    let y = slot.height - inset - height;
    if (count?.text && badge.textWidth + padding > besideCount) {
      // Keep long amounts inside the slot and clear of the native quantity.
      y = Math.max(inset, Math.min(y, count.y - slot._y - height - 2));
    }
    while (badge.textWidth + padding > frameWidth && badge.fontSize > 7) badge.fontSize--;
    badge.size(Math.min(frameWidth, Math.ceil(badge.textWidth) + padding), height);
    badge.pos(slot._x + inset, slot._y + y);
    badge.color = theme.palette.accent; badge.bgColor = theme.palette.bg;
  }
  function syncSlots() {
    for (const [slot, badge] of slots) if (!owner.bags.includes(slot)) { badge.destroy(true); slots.delete(slot); }
    for (const slot of owner.bags) {
      if (!slot || typeof slot.updateItem !== 'function') continue;
      let badge = slots.get(slot);
      if (!badge) {
        badge = new L.Text(); badge.name = 'sgs-toolbox-coupon-amount'; badge.zOrder = 110;
        Object.assign(badge, { font: 'Arial', bold: true, align: 'center', valign: 'middle', mouseEnabled: false }); owner.topSp.addChild(badge);
        slots.set(slot, badge);
        for (const key of ['updateItem', 'Move', 'initData', 'Clear']) if (typeof slot[key] === 'function') patch(slot, key, old => function (...args) {
          const result = old.apply(this, args); if (!showing && !badge.destroyed) updateSlot(slot, badge); return result;
        });
      }
      updateSlot(slot, badge);
    }
  }
  const offTheme = theme.watch(() => { paint(); for (const [slot, badge] of slots) updateSlot(slot, badge); }, { target: root });
  releases.push(offTheme);
  const destroy = () => release(); listen(owner, L.Event.DESTROY || 'destroy', destroy);
  let release = ctx.scope.add(() => {
    if (disposed) return; disposed = true;
    for (const off of releases.reverse()) off();
    input.focus = false; root.destroy(true); empty.destroy(true);
    for (const badge of slots.values()) badge.destroy(true);
    slots.clear();
    if (!owner.destroyed && owner.parent) { originalPage.call(owner); originalShow.call(owner, owner.bagDatas); }
  });
  draw(); lastInventory = inventoryKey();
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
    const found = findBagViews((ctx.window.Laya ?? ctx.window.laya)?.stage);
    for (const [view, enhancement] of views) if (!found.includes(view)) { enhancement.dispose(); views.delete(view); }
    if (found.length) void load();
    for (const view of found) {
      if (!views.has(view)) views.set(view, enhanceBagView(ctx, view, getConfig));
      views.get(view).refresh();
    }
  }
  tick(); ctx.scope.interval(tick, 500);
  ctx.scope.add(() => { for (const view of views.values()) view.dispose(); views.clear(); config = null; });
  return { tick };
}
