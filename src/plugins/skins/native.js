import { resolveSkinRuntime } from './runtime.js';
import { read, nativeSkinState, matchesSkin, skinTotals, emptyDynamicFilters, readCrystalCatalogue, readDynamicMaterials } from './native-model.js';
import { createSkinControls, sectionTitle, textNode } from './controls.js';
import { skinWindowInk } from './game-chrome.js';

const alive = node => node && !read(() => node.destroyed);
// lk.virtualDraw requires this interface on EVERY direct content child,
// including our ordinary Laya text and vector title nodes.
function virtualNode(node) {
  node.Drawed = true;
  node.Draw = function () { this.Drawed = true; };
  node.ClearDraw = function () { this.Drawed = false; };
  return node;
}
const visible = node => {
  for (let p = node, i = 0; p && i++ < 24; p = p.parent) if (p.visible === false || p.destroyed) return false;
  return Boolean(node?.parent);
};
export function findSkinWindow(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!alive(node)) continue;
    if (typeof node.formData === 'function' && typeof node.selectGenerals === 'function'
      && typeof node.onCreateGeneralSkinPanelItem === 'function' && node.skinPanel && node.ownRadioBtn && node.typeRadioBtn && node.tabGroup && visible(node)) return node;
    if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return null;
}

export function openNativeSkinWindow(ctx) {
  const stage = (ctx.window.Laya ?? ctx.window.laya)?.stage;
  if (findSkinWindow(stage)) return;
  if (!ctx.native.account().id) throw new Error('请登录本服后再打开皮肤管理。');
  const dispatcher = ctx.game.getDispatcher?.();
  if (typeof dispatcher?.ShowWindowAfterCloseOther !== 'function' || typeof ctx.game.getClass?.('SkinWindow') !== 'function') {
    throw new Error('本服皮肤管理暂不可用，请在游戏大厅重试。');
  }
  // The lobby opens SkinWindow on its skin tab (Ti.SKIN = 2).
  dispatcher.ShowWindowAfterCloseOther('SkinWindow', null, 2);
}

export function enhanceSkinWindow(ctx, owner) {
  const laya = ctx.window.Laya ?? ctx.window.laya;
  const required = ['showGeneralSkinNew', 'onClearPanelItems', 'clearLineBackItem', 'ShowNewView', 'changeView', 'onSearchChange', 'refreshNewSkinEntryState'];
  if (!required.every(key => typeof owner[key] === 'function') || typeof owner.searchView?.on !== 'function') throw new Error('当前皮肤管理接口不兼容');
  const releases = [], decorations = [], itemPatches = [];
  const state = { group: ctx.settings.get('nativeGroup', 'country') === 'quality' ? 'quality' : 'country',
    quality: 0, lastCountry: owner.tabGroup.SelectedValue === owner.NEW_TYPE_VALUE ? 1 : owner.tabGroup.SelectedValue,
    owned: true, missing: true, craft: 'all', backgroundOnly: false, dynamic: emptyDynamicFilters(), query: '', searchOpen: false };
  let running = false, disposed = false, runtime, controls, lastRuntime, pending = false, sourceKey = null, wasVisible = true;
  let backgroundInstalled = ctx.backgrounds?.isInstalled?.() === true;
  let crystalCatalogue = readCrystalCatalogue(null), catalogueSource = null, catalogueAttempted = false;
  const GOODS_CONFIG = 'sys_gs_dbs_fs_goodsbaseinfo';
  const original = Object.fromEntries(['formData', 'showGeneralSkinNew', 'selectGenerals', 'ShowNewView', 'changeView', 'onSearchChange', 'refreshNewSkinEntryState', '_formLvData'].map(k => [k, owner[k]]));
  const saved = [];
  const observedEffects = new WeakSet();
  const remember = (obj, keys) => { if (obj) for (const key of keys) saved.push([obj, key, obj[key]]); };
  remember(owner.searchView, ['x', 'y', 'width', 'height', 'visible', 'text']);
  remember(owner.searchView.searchInput, ['maxChars']);
  remember(owner, ['isSearch']);
  remember(owner.tabGroup, ['visible']);
  remember(owner.breakSkinSp, ['y']);
  remember(owner.gsm, ['curSkinFilterType']);
  remember(owner.searchTab, ['visible']); remember(owner.typeRadioBtn, ['visible', 'SelectedValue']); remember(owner.ownRadioBtn, ['visible', 'SelectedValue']);
  const patch = (target, key, fn) => {
    const own = Object.getOwnPropertyDescriptor(target, key), old = target[key];
    // A later plugin may wrap this layer. After disposal it must transparently
    // call the native method even when that later wrapper still references it.
    const wrapper = function (...args) { return Reflect.apply(disposed ? old : fn, this, args); };
    target[key] = wrapper;
    const undo = () => { if (target[key] === wrapper) { if (own) Object.defineProperty(target, key, own); else delete target[key]; } };
    releases.push(undo); return old;
  };
  const newPage = () => owner.tabGroup.SelectedValue === owner.NEW_TYPE_VALUE;
  const statuses = new Map();
  const status = vo => {
    if (!statuses.has(vo.skinID)) statuses.set(vo.skinID, nativeSkinState(vo, runtime));
    return statuses.get(vo.skinID);
  };
  const search = (row, query) => {
    const vo = row.skinBaseVo, term = query.toLocaleLowerCase();
    return `${vo.skinname || ''} ${vo.skinID} ${row.generalID} ${vo.painter || ''}`.toLocaleLowerCase().includes(term)
      || read(() => owner.checkSearchGeneral(row.generalID, query)) === true;
  };
  const matches = row => matchesSkin(row, row.skinBaseVo ? status(row.skinBaseVo) : {}, state, search);
  const flatten = groups => groups.flatMap(([, rows]) => rows);
  const groups = () => { const result = []; owner.allSkinShows?.forEach((key, rows) => { if (Array.isArray(rows)) result.push([key, rows]); }); return result; };
  function clearDecorations() { for (const item of decorations.splice(0)) if (alive(item)) item.destroy(true); }
  function addTitle(panel, title, y) {
    const node = virtualNode(sectionTitle(laya, title)); node.pos(25, y); panel.addChild(node); decorations.push(node); return node;
  }
  function emptyHint(panel, x, y, width, height, size = 12) {
    const node = virtualNode(textNode(laya, '暂无符合条件的皮肤', x, y, width, height, skinWindowInk.muted, size));
    node.stroke = 1; node.strokeColor = skinWindowInk.shadow;
    panel.addChild(node); decorations.push(node); return node;
  }
  function totals(rows) {
    const t = skinTotals(rows, status);
    controls.stats.text = runtime.ready ? `筛选 ${t.total} 款 · 已有 ${t.owned} 款　　动态 ${t.dynamic} 款 · 已有 ${t.dynamicOwned} 款${t.unknown ? `　· ${t.unknown} 款未知` : ''}`
      : runtime.message;
  }
  function layout() {
    owner.typeRadioBtn.visible = false; owner.ownRadioBtn.visible = false;
    owner.tabGroup.visible = false;
    if (owner.newSkinEffect) {
      if (!observedEffects.has(owner.newSkinEffect)) { observedEffects.add(owner.newSkinEffect); remember(owner.newSkinEffect, ['visible']); }
      owner.newSkinEffect.visible = false;
    }
    if (owner.searchTab) owner.searchTab.visible = false;
    owner.searchView.pos(477, 12); owner.searchView.SetActualSize?.(201, 24); owner.searchView.maxChars = 40;
    owner.searchView.visible = state.searchOpen;
    controls.root.visible = true; controls.paint();
    if (owner.breakSkinSp) owner.breakSkinSp.y = 494;
    if (owner.newView?.skinPanel) owner.newView.skinPanel.height = 436;
  }
  function sectionRows(rows, panel, y) {
    for (let i = 0; i < rows.length; i += 7) {
      owner.onCreateGeneralSkinPanelItem(25, y, rows.slice(i, i + 7)); y += 183;
    }
    return y;
  }
  function renderQuality(source) {
    owner.onClearPanelItems(); owner.clearLineBackItem(owner.lineItemUIs?.length || 0);
    const rows = source.filter(row => !row.isGeneral && read(() => row.skinBaseVo.skinlevel1()) === state.quality);
    if (rows.length) sectionRows(rows, owner.skinPanel, 8);
    else emptyHint(owner.skinPanel, 25, 16, 790, 30);
    owner.skinPanel.UpdateDrawContent();
  }
  function clearNewPanel(panel) {
    for (const undo of itemPatches.splice(0)) undo();
    const nodes = [];
    for (let i = 0; i < panel.numChildren; i++) nodes.push(panel.getChildAt(i));
    panel.removeChildren(); for (const node of nodes) node?.destroy?.(true);
  }
  const receipts = () => {
    const value = ctx.settings.get('readRecent:' + runtime.accountId, []);
    return Array.isArray(value) ? value : [];
  };
  const recentIds = () => [...new Set([...(owner.gsm?.skinNewList || []), ...(owner.gsm?.collectNewList || [])])].filter(id => !receipts().includes(id));
  function markRead(ids) {
    if (!runtime?.ready || disposed) return;
    ctx.settings.set('readRecent:' + runtime.accountId, [...new Set([...receipts(), ...ids])].slice(-30000));
    for (const id of ids) if (owner.gsm?.skinNewList?.includes(id)) owner.gsm.deleteToNew?.(id);
    scheduleRefresh();
  }
  function grayNewCard(card) {
    if (!card?.data?.skinID || typeof card.init !== 'function') return;
    const apply = () => { const value = status(card.data); if (card.generalTex) card.generalTex.Gray = value.owned === false; if (card.exTypeTet && value.capable === true) card.exTypeTet.Gray = value.dynamicOwned === false; };
    const clicked = () => markRead([card.data.skinID]);
    card.on('click', controls.root, clicked);
    itemPatches.push(() => card.off('click', controls.root, clicked));
    const own = Object.getOwnPropertyDescriptor(card, 'init'), init = card.init;
    const wrapper = function (...args) { const result = Reflect.apply(init, this, args); if (!disposed) apply(); return result; };
    card.init = wrapper;
    itemPatches.push(() => { if (!card.destroyed && card.init === wrapper) { if (own) Object.defineProperty(card, 'init', own); else delete card.init; } });
    apply();
  }
  function renderNew(allGroups) {
    Reflect.apply(original.ShowNewView, owner, []);
    const view = owner.newView, panel = view?.skinPanel;
    if (!panel || typeof view.initItems !== 'function') throw new Error('新品皮肤布局接口不兼容');
    clearNewPanel(panel);
    const all = flatten(allGroups), byId = new Map(all.filter(row => row.skinBaseVo).map(row => [row.skinBaseVo.skinID, row.skinBaseVo]));
    for (const vo of [...(view.newSkinData || []), ...(view.discountSkinData || [])]) byId.set(vo.skinID, vo);
    const unreadIds = recentIds();
    for (const id of unreadIds) if (!byId.has(id)) {
      const candidates = read(() => owner.gsm.GetGeneralSkinIncludeHide(Math.floor(id / 100), true));
      if (Array.isArray(candidates)) for (const vo of candidates) if (vo?.skinID === id) byId.set(id, vo);
    }
    const recent = unreadIds.map(id => byId.get(id)).filter(Boolean);
    const lists = [view.newSkinData || [], recent, view.discountSkinData || []];
    const rows = [], oldTitle = view.initTitle;
    view.initTitle = function (title, y) {
      if (title !== '__sgs_recent') return Reflect.apply(oldTitle, this, [title, y]);
      return addTitle(panel, '新获得', y);
    };
    const titles = view.titleStr;
    view.titleStr = [titles[0], '__sgs_recent', titles[1]];
    let y = 8;
    try {
      for (let i = 0; i < lists.length; i++) {
        const seen = new Set();
        const vos = lists[i].filter(vo => {
          if (seen.has(vo.skinID)) return false; seen.add(vo.skinID);
          const row = { isGeneral: false, generalID: vo.generalID, skinBaseVo: vo };
          if (i === 1 && status(vo).owned !== true || !matches(row)) return false;
          rows.push(row); return true;
        });
        if (!vos.length) continue;
        view.initItems(vos, i, i === 2, 123, y);
        let bottom = y;
        for (let n = 0; n < panel.numChildren; n++) { const node = panel.getChildAt(n); bottom = Math.max(bottom, node.y + node.height); }
        y = bottom + (i === 2 ? 84 : 40);
      }
    } finally { view.initTitle = oldTitle; view.titleStr = titles; }
    for (let n = 0; n < panel.numChildren; n++) grayNewCard(panel.getChildAt(n));
    if (!rows.length) emptyHint(panel, 30, 80, 760, 40, 16);
    panel.scrollTo(0); panel.UpdateDrawContent(); totals(rows);
  }
  function draw() {
    clearDecorations();
    const source = groups();
    if (newPage()) renderNew(source);
    else {
      const selected = source.map(([key, rows]) => [key, rows.filter(row => matches(row)
        && (state.group !== 'quality' || read(() => row.skinBaseVo.skinlevel1()) === state.quality))]).filter(([, rows]) => rows.length);
      const rows = flatten(selected); totals(rows);
      if (state.group === 'quality') renderQuality(rows);
      else {
        const dictionary = owner.allSkinShows;
        owner.allSkinShows = { forEach(fn) { selected.forEach(([key, value]) => fn(key, value)); } };
        try { Reflect.apply(original.showGeneralSkinNew, owner, []); } finally { owner.allSkinShows = dictionary; }
        if (!rows.length) { emptyHint(owner.skinPanel, 25, 60, 790, 40, 16); owner.skinPanel.UpdateDrawContent(); }
      }
    }
    layout();
  }
  function refresh(rebuild = true) {
    if (disposed || running || !alive(owner)) return;
    running = true;
    try {
      const config = read(() => ctx.game.getConfigData?.(GOODS_CONFIG));
      if (config && config !== catalogueSource) { catalogueSource = config; crystalCatalogue = readCrystalCatalogue(config); }
      const current = resolveSkinRuntime(ctx.game);
      runtime = { ...current, crystalCatalogue, dynamicMaterials: readDynamicMaterials(current) };
      lastRuntime = runtime; statuses.clear();
      if (runtime.ready) {
        const activeIds = new Set([...(owner.gsm?.skinNewList || []), ...(owner.gsm?.collectNewList || [])]);
        const old = receipts(), active = old.filter(id => activeIds.has(id));
        if (active.length !== old.length) ctx.settings.set('readRecent:' + runtime.accountId, active);
      }
      // Keep native generation unfiltered, then filter its actual result in place.
      // isSearch stays false so search never resets the selected country/tab.
      owner.isSearch = false;
      owner.typeRadioBtn.SelectedValue = -1;
      const allValue = owner.ownRadioBtn.childList?.[0]?.value ?? 0;
      owner.ownRadioBtn.SelectedValue = allValue;
      if (owner.gsm) owner.gsm.curSkinFilterType = allValue;
      if (!newPage() && owner.tabGroup.SelectedValue <= 0) owner.tabGroup.SelectedValue = 1;
      if (!newPage()) state.lastCountry = owner.tabGroup.SelectedValue;
      Reflect.apply(original.changeView, owner, [!newPage()]);
      if (owner.newView) owner.newView.visible = newPage();
      const key = state.group === 'quality' || newPage() ? 'all' : `country:${owner.tabGroup.SelectedValue}`;
      if (rebuild || !owner.allSkinShows || key !== sourceKey) {
        Reflect.apply(original.formData, owner, []); sourceKey = key;
      } else draw();
      layout();
    } finally { running = false; }
  }
  function changed() { ctx.settings.set('nativeGroup', state.group); refresh(false); }
  controls = createSkinControls(ctx, owner, state, changed, () => markRead(recentIds()));
  patch(owner, 'selectGenerals', function (value) {
    const all = state.group === 'quality' || newPage(), sources = [Reflect.apply(original.selectGenerals, this, [all ? 0 : value])];
    // Native ALL loops countries 1..5; its OTHER branch also includes Jin.
    if (all) sources.push(Reflect.apply(original.selectGenerals, this, [4]));
    const merged = new Map();
    for (const source of sources) source?.forEach((key, generals) => {
      const rows = merged.get(key) || []; const seen = new Set(rows.map(g => g.ItemID));
      for (const general of generals) if (general && !general.Parent && !seen.has(general.ItemID)) { rows.push(general); seen.add(general.ItemID); }
      merged.set(key, rows);
    });
    return { forEach(fn) { for (const [key, rows] of merged) fn(key, rows); } };
  });
  if (typeof original._formLvData === 'function') patch(owner, '_formLvData', function (value) {
    const result = Reflect.apply(original._formLvData, this, [value]);
    const q = owner.typeRadioBtn._childList?.[0]?.value;
    return value === -1 && Number.isInteger(q) && !result.includes(q) ? [...result, q] : result;
  });
  patch(owner, 'showGeneralSkinNew', draw);
  patch(owner, 'formData', refresh);
  patch(owner, 'ShowNewView', function () { Reflect.apply(original.ShowNewView, this, []); refresh(); });
  patch(owner, 'changeView', function (show) { Reflect.apply(original.changeView, this, [show]); layout(); });
  patch(owner, 'refreshNewSkinEntryState', function () {
    return Reflect.apply(original.refreshNewSkinEntryState, this, []) || Boolean(this.gsm?.skinNewList?.length || this.gsm?.collectNewList?.length);
  });
  // Native events retain the function reference registered before attachment.
  const event = owner.searchView.constructor.SEARCH || 'search';
  const onSearch = () => { state.query = String(owner.searchView.text || ''); refresh(false); };
  owner.searchView.off(event, owner, original.onSearchChange);
  owner.searchView.on(event, controls.root, onSearch);
  const inputEvent = owner.searchView.constructor.INPUT;
  if (inputEvent) owner.searchView.on(inputEvent, controls.root, onSearch);
  releases.push(() => {
    if (alive(owner.searchView)) {
      owner.searchView.off(event, controls.root, onSearch);
      if (inputEvent) owner.searchView.off(inputEvent, controls.root, onSearch);
      owner.searchView.on(event, owner, original.onSearchChange);
    }
  });
  const scheduleRefresh = () => {
    if (pending || disposed) return; pending = true;
    ctx.scope.timeout(() => { pending = false; if (!disposed && visible(owner)) refresh(false); }, 80);
  };
  const listen = (target, type) => {
    if (!type || typeof target?.on !== 'function') return;
    target.on(type, controls.root, scheduleRefresh);
    releases.push(() => { if (alive(target)) target.off(type, controls.root, scheduleRefresh); });
  };
  for (const key of ['NEW_SKIN_UPDATE_EVENT', 'SKIN_DYNAMIC_SUCCED', 'SKIN_COMPOSE_SUCCED', 'SKIN_DECOMPOSE_SUCCED']) listen(owner.gsm, owner.gsm?.constructor[key]);
  const gm = resolveSkinRuntime(ctx.game).goodsManager;
  listen(gm, gm?.constructor.PROP_REFRESH_NUM);
  // The new-acquisition section must also be reachable without current releases.
  owner.tabGroup.SetTabVisableByTabValue?.(owner.NEW_TYPE_VALUE, true);
  const attachment = { owner, state, refresh,
    check() {
      if (!visible(owner)) { wasVisible = false; controls.closeMenus(); return; }
      const installed = ctx.backgrounds?.isInstalled?.() === true;
      if (installed !== backgroundInstalled) {
        backgroundInstalled = installed;
        if (!installed) state.backgroundOnly = false;
        refresh(); return;
      }
      if (!wasVisible) { wasVisible = true; refresh(); return; }
      const next = resolveSkinRuntime(ctx.game);
      if (next.accountId !== lastRuntime?.accountId || next.ready !== lastRuntime?.ready || next.skinManager !== lastRuntime?.skinManager || next.goodsManager !== lastRuntime?.goodsManager) refresh();
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const undo of itemPatches.splice(0)) undo();
      for (const off of releases.splice(0).reverse()) off();
      clearDecorations(); controls.dispose();
      if (!alive(owner)) return;
      for (const [obj, key, value] of saved) if (alive(obj)) obj[key] = value;
      owner.searchView.SetActualSize?.(owner.searchView.width, owner.searchView.height);
      owner.rebuildNewView?.();
      owner.refreshNewSkinEntry?.();
      if (newPage()) { original.changeView.call(owner, false); original.ShowNewView.call(owner); }
      else { original.changeView.call(owner, true); original.formData.call(owner); }
    } };
  try { refresh(); } catch (error) { attachment.dispose(); throw error; }
  // Only opening the native skin window may request public crystal metadata.
  // A missing catalogue stays unknown; it is never read as "no crystal path".
  if (!crystalCatalogue.ready && !catalogueAttempted && typeof ctx.game.loadConfigData === 'function') {
    catalogueAttempted = true;
    Promise.resolve().then(() => disposed ? null : ctx.game.loadConfigData(GOODS_CONFIG)).then(config => {
      if (!config || disposed || ctx.scope.signal.aborted) return;
      crystalCatalogue = readCrystalCatalogue(config); catalogueSource = config; refresh(false);
    }).catch(() => {});
  }
  return attachment;
}

export function createNativeSkins(ctx) {
  let attachment = null, message = '等待打开游戏的皮肤管理。';
  function check() {
    if (ctx.scope.signal.aborted) return;
    try {
      if (ctx.settings.get('advanced', true) !== true) {
        const previous = attachment; attachment = null; previous?.dispose();
        message = '高级皮肤整理已关闭。';
        return;
      }
      const laya = ctx.window.Laya ?? ctx.window.laya;
      if (attachment && (!alive(attachment.owner) || !attachment.owner.parent)) { attachment.dispose(); attachment = null; }
      if (attachment && !visible(attachment.owner)) {
        const next = findSkinWindow(laya?.stage);
        if (next && next !== attachment.owner) { attachment.dispose(); attachment = null; }
      }
      if (!attachment) {
        const owner = findSkinWindow(laya?.stage);
        if (owner && visible(owner)) attachment = enhanceSkinWindow(ctx, owner);
      }
      attachment?.check();
      message = attachment ? '已接入游戏皮肤管理。' : '等待打开游戏的皮肤管理。';
    } catch (error) {
      attachment?.dispose(); attachment = null;
      message = `皮肤界面接入失败：${String(error?.message || error).slice(0, 140)}`;
    }
  }
  ctx.scope.interval(check, 700); check();
  ctx.scope.add(() => { attachment?.dispose(); attachment = null; });
  return { check, getStatus: () => message };
}
