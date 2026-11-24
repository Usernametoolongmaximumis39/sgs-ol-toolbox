import { ResourceScope } from '../../core/resources.js';
import { isNativeNodeMounted } from '../../shared/native-tree.js';
import { createBackgroundPane } from './native-pane.js';

const customTab = 3;

function findWallpaperToolbar(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    if (typeof node.onClickSkin === 'function' && typeof node.stageclickHandler === 'function') return node;
    if (Array.isArray(node._children)) {
      for (const child of node._children) {
        if (queue.length >= 4000) break;
        queue.push(child);
      }
    }
  }
  return null;
}

function wallpaperIn(toolbar) {
  const owner = toolbar?.wallPaperUI;
  if (owner && owner.parent === toolbar && !owner.destroyed && owner.visible !== false && owner.bg &&
    Array.isArray(owner.wallPaperItems) && typeof owner.SettingAllModePaper === 'function' &&
    typeof owner.initList === 'function' && typeof owner.onResetTabPos === 'function' &&
    typeof owner.tabGroup?.InitUi === 'function' && typeof owner.tabGroup?.GetButtonByValue === 'function') return owner;
  return null;
}

function clientProjection(laya, doc) {
  const stage = laya.stage;
  const rendered = laya.Render?.canvas;
  const canvas = rendered?.source ?? rendered ?? doc.getElementById('layaCanvas');
  const rect = canvas?.getBoundingClientRect?.();
  if (!laya.Point || !rect?.width || !rect.height || !stage.width || !stage.height) return null;
  const point = (node, x, y) => {
    const position = node.localToGlobal(new laya.Point(x, y), true);
    let u = position.x / stage.width, v = position.y / stage.height;
    if (typeof stage.toParentPoint === 'function' && canvas.width > 0 && canvas.height > 0) {
      const scaled = stage.toParentPoint(position);
      u = scaled.x / canvas.width;
      v = scaled.y / canvas.height;
    }
    const rotation = ((stage.canvasDegree ?? 0) % 360 + 360) % 360;
    if (rotation === 90) [u, v] = [1 - v, u];
    else if (rotation === 270) [u, v] = [v, 1 - u];
    else if (rotation === 180) [u, v] = [1 - u, 1 - v];
    return { x: rect.left + u * rect.width, y: rect.top + v * rect.height };
  };
  return (node, x, y, w, h) => {
    const a = point(node, x, y), b = point(node, x + w, y), c = point(node, x, y + h);
    return { left: a.x, top: a.y, width: Math.hypot(b.x - a.x, b.y - a.y),
      height: Math.hypot(c.x - a.x, c.y - a.y), rotation: Math.atan2(b.y - a.y, b.x - a.x) };
  };
}

function attach(ctx, laya, owner, options) {
  const toolbar = owner.parent, stage = laya.stage, tabs = owner.tabGroup;
  const template = tabs.BtnList?.find(button => button.value === 0)?.WholeData;
  if (!template || tabs.GetButtonByValue(customTab)) return null;
  const originalWidth = tabs.btnWidth;
  const count = tabs.BtnList.filter(button => button.visible).length + 1;
  const width = Math.floor((owner.width - 2 * tabs.x - (count - 1) * tabs.gap) / count);
  if (!(width > 0)) return null;
  const scope = new ResourceScope();
  const toggles = new Map();
  let tab, pane, lastNativeTab = tabs.SelectedValue;
  function restoreToggles() {
    for (const [node, visible] of toggles) if (!node.destroyed && node.visible === false) node.visible = visible;
    toggles.clear();
  }
  scope.add(() => {
    restoreToggles();
    if (owner.destroyed || tabs.destroyed) return;
    const inserted = tab ?? tabs.GetButtonByValue(customTab);
    if (tabs.SelectedValue === customTab) tabs.SelectedValue = lastNativeTab;
    const index = tabs.BtnList.indexOf(inserted);
    if (index >= 0) tabs.BtnList.splice(index, 1);
    if (inserted && !inserted.destroyed) inserted.destroy(true);
    if (tabs.btnWidth === width) tabs.BtnWidth = originalWidth;
    tabs.layout();
  });
  const visible = () => isNativeNodeMounted(owner, stage, 64, true);
  const current = () => visible() && tabs.SelectedValue === customTab;
  const closeNative = () => {
    if (visible() && toolbar.wallPaperUI === owner) {
      if (typeof toolbar.stageclickHandler === 'function') toolbar.stageclickHandler({ target: stage });
      else owner.visible = false;
    }
    layout();
  };
  function layout() {
    const project = visible() && clientProjection(laya, ctx.document);
    if (!project) { pane.layout(null, null); return; }
    const tabRect = () => project(tab, 0, 0, tab.width, tab.height);
    if (!current()) { pane.layout(tabRect(), null); return; }
    const top = owner.localToGlobal(new laya.Point(0, 0), true).y;
    const scale = owner.localToGlobal(new laya.Point(0, 1), true).y - top;
    const height = Math.floor(Math.min(owner.panelHeight + 30, (stage.height - top) / (scale || 1) - tabs.height - 4));
    if (height > 0 && height !== owner.height) {
      owner.height = owner.bg.height = height;
      owner.onResetTabPos();
    }
    pane.layout(tabRect(), height > 14 ? project(owner, 5, 6, owner.width - 10, height - 13) : null);
  }

  try {
    tabs.BtnWidth = width;
    tabs.InitUi([{ ...template, label: '自定义背景', value: customTab }]);
    tab = tabs.GetButtonByValue(customTab);
    if (!tab) { scope.dispose(); return null; }
    tab.name = 'ChangeBgSkinBtn';
    pane = createBackgroundPane(ctx, scope, { ...options, closeNative, isCurrent: current,
      selectTab: () => { if (visible() && tabs.SelectedValue !== customTab) tabs.SelectedValue = customTab; } });
    scope.add(ctx.backgrounds.subscribe(() => { if (current()) pane.refresh(); }));
    scope.patch(owner, 'initList', original => function (...args) {
      if (tabs.SelectedValue !== customTab) {
        lastNativeTab = tabs.SelectedValue;
        restoreToggles();
        const result = Reflect.apply(original, this, args);
        layout();
        return result;
      }
      for (const node of [owner.allmodeSelectBox, owner.modeSelectTxt]) {
        if (node && !toggles.has(node)) { toggles.set(node, node.visible); node.visible = false; }
      }
      for (const node of [...owner.wallPaperItems, owner.panel, owner.livePanel, owner.noSkinWallSpr, owner.loadMoreBg, owner.loadMoreTxt]) {
        if (node) node.visible = false;
      }
      layout();
    });
    layout();
    return { owner, stage, visible, layout, dispose: () => scope.dispose() };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}

export function createNativeWallpaper(ctx, options) {
  const { window: win, document: doc, scope } = ctx;
  // Only look through the stage after an interaction or a scene transition.
  // Once attached, layout checks only the detected popup and its ancestors.
  let attachment, toolbar, frame = null;
  function detach() { attachment?.dispose(); attachment = null; }
  function maintain() {
    if (!attachment) return;
    const { owner, stage } = attachment;
    if ((win.Laya ?? win.laya)?.stage !== stage || owner.destroyed || owner.parent?.wallPaperUI !== owner) detach();
    else attachment.layout();
  }
  function discover() {
    frame = null;
    if (scope.closed) return;
    maintain();
    if (attachment?.visible()) return;
    const laya = win.Laya ?? win.laya;
    if (!isNativeNodeMounted(toolbar, laya?.stage, 64, true)) toolbar = findWallpaperToolbar(laya?.stage);
    const owner = wallpaperIn(toolbar);
    if (!owner || attachment?.owner === owner) return;
    detach();
    try { attachment = attach(ctx, laya, owner, options); }
    catch (error) { ctx.notify('自定义背景菜单接入失败：' + (error?.message || error)); }
  }
  function schedule() {
    if (!scope.closed && frame === null && win.requestAnimationFrame && (win.Laya ?? win.laya)?.stage) {
      frame = win.requestAnimationFrame(discover);
    }
  }
  scope.listen(doc, 'pointerup', schedule, { capture: true, passive: true });
  scope.listen(doc, 'click', schedule, { capture: true, passive: true });
  scope.add(ctx.game?.onSceneChange?.(() => { detach(); toolbar = null; schedule(); }));
  scope.interval(maintain, 120);
  scope.add(() => { if (frame !== null) win.cancelAnimationFrame(frame); detach(); });
  discover();
}
