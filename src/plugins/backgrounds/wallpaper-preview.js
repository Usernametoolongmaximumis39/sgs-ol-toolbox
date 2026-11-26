import { ResourceScope } from '../../core/resources.js';
import { isNativeNodeMounted } from '../../shared/native-tree.js';
import { cachedNativeWindow, watchNativeWindowEvents } from '../../shared/window-cache.js';
import { selectOfficialWallpaper, wallpaperModelSpec, wrapWallpaperClick } from './official-wallpaper.js';

const windowName = 'BgPreviewWin';

function isPreview(node) {
  return Boolean(node?.botBtn && node.imgInUse && typeof node.getBtnSt === 'function' && typeof node.updateBg === 'function'
    && typeof node.updateUI === 'function' && typeof node.updateSkinBtn === 'function' && typeof node.clickBotBtn === 'function'
    && Number.isInteger(node.constructor.BTN_ST_USE));
}

function findPreview(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    if (isPreview(node)) return node;
    if (Array.isArray(node._children)) {
      for (const child of node._children) {
        if (queue.length >= 4000) break;
        queue.push(child);
      }
    }
  }
  return null;
}

function attachPreview(ctx, laya, owner, animated) {
  const scope = new ResourceScope(), button = owner.botBtn;
  const { backgrounds } = ctx;
  const mounted = () => owner.botBtn === button && !button.destroyed && isNativeNodeMounted(owner, laya.stage, 64, true);
  let localButton;

  function action() {
    if (!mounted() || !owner.crtData || String(owner.crtData.ID) !== String(owner.crtBgId)) return null;
    const current = backgrounds.current;
    if (owner.imgInUse.visible) return current?.officialWallpaper ? { label: '恢复此背景' } : null;
    if (owner.btnSt === owner.constructor.BTN_ST_USE) return null;
    const spec = wallpaperModelSpec(owner.crtData);
    if (!spec) return null;
    if (current?.officialWallpaper && current.url === spec.url) return { label: '取消本地使用' };
    return { label: '仅本地使用', spec };
  }

  function restore() {
    if (localButton && !button.destroyed && button.label === localButton.label) {
      button.label = localButton.previousLabel;
      if (button.visible === true) button.visible = localButton.previousVisible;
    }
    localButton = null;
  }
  function render() {
    const next = action();
    if (localButton && button.label === localButton.label && button.visible && next?.label === localButton.label) return;
    restore();
    if (!next) return;
    localButton = { label: next.label, previousLabel: button.label, previousVisible: button.visible };
    button.label = next.label;
    button.visible = true;
  }

  const original = owner.clickBotBtn;
  const wrapped = function (...args) {
    if (!mounted()) return;
    const next = action();
    try {
      if (localButton || next) {
        if (!next || !localButton || button.label !== next.label) { render(); return; }
        if (next.spec) selectOfficialWallpaper(ctx, next.spec, animated);
        else backgrounds.select(null);
        return;
      }
      if (owner.btnSt === owner.constructor.BTN_ST_USE && backgrounds.current?.officialWallpaper) backgrounds.select(null);
      return Reflect.apply(original, owner, args);
    } catch (error) { ctx.notify('本地背景切换失败：' + (error?.message || error)); }
  };

  if (!wrapWallpaperClick(scope, button, laya.Event.CLICK, owner, original, wrapped)) return null;
  scope.add(restore);
  try {
    for (const method of ['updateUI', 'updateSkinBtn']) scope.patch(owner, method, original => function (...args) {
      restore();
      const result = Reflect.apply(original, this, args);
      render();
      return result;
    });
    scope.add(backgrounds.subscribe(render));
    render();
    return { mounted, dispose: () => scope.dispose() };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}

export function createWallpaperPreview(ctx, animated) {
  const { scope, game, window: win, document: doc } = ctx;
  const bindWindows = watchNativeWindowEvents(scope, [windowName], schedule);
  let attachment, queued = false;
  function detach() { attachment?.dispose(); attachment = null; }
  function refresh(searchStage = false) {
    if (attachment?.mounted()) return;
    detach();
    const laya = win.Laya ?? win.laya, stage = laya?.stage;
    if (!stage) return;
    const dispatcher = game?.getDispatcher?.();
    bindWindows(dispatcher);
    const cached = cachedNativeWindow(dispatcher, windowName);
    const owner = isPreview(cached) && isNativeNodeMounted(cached, stage, 64, true) ? cached : searchStage ? findPreview(stage) : null;
    if (owner) {
      try { attachment = attachPreview(ctx, laya, owner, animated); }
      catch (error) { ctx.notify('背景预览接入失败：' + (error?.message || error)); }
    }
  }
  function schedule() {
    if (queued || scope.closed) return;
    queued = true;
    scope.timeout(() => { queued = false; refresh(true); }, 0);
  }
  scope.listen(doc, 'pointerup', schedule, { capture: true, passive: true });
  scope.add(game?.onSceneChange?.(() => { detach(); schedule(); }));
  scope.interval(refresh, 800);
  scope.add(detach);
  refresh(true);
}
