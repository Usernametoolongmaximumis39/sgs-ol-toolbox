import { read } from './native-model.js';

const windowPortraitWidth = 280;
const windowPortraitHeight = 366;
const windowPortraitVisibleRatio = 5 / 6;
const portraitMargin = 8;

function visibleCanvas(win, laya, stage) {
  const rendered = laya.Render?.canvas;
  const canvas = rendered?.source ?? rendered ?? win.document?.getElementById('layaCanvas');
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect) return { left: 0, top: 0, right: stage.width, bottom: stage.height };
  if (!(rect.width > 0 && rect.height > 0)) return;
  const viewport = win.visualViewport;
  const clipLeft = Math.max(rect.left, viewport?.offsetLeft ?? 0);
  const clipTop = Math.max(rect.top, viewport?.offsetTop ?? 0);
  const clipRight = Math.min(rect.right, win.innerWidth, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? win.innerWidth));
  const clipBottom = Math.min(rect.bottom, win.innerHeight, (viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight));
  if (!(clipLeft < clipRight && clipTop < clipBottom)) return;

  // Undo the browser CSS scale and Laya's backing-store transform in order.
  const degree = ((stage.canvasDegree ?? 0) % 360 + 360) % 360;
  const toStage = (x, y) => {
    const u = (x - rect.left) / rect.width, v = (y - rect.top) / rect.height;
    const [a, b] = degree === 90 ? [v, 1 - u] : degree === 270 ? [1 - v, u] : degree === 180 ? [1 - u, 1 - v] : [u, v];
    if (typeof stage.fromParentPoint === 'function' && canvas.width > 0 && canvas.height > 0) {
      return stage.fromParentPoint(new laya.Point(a * canvas.width, b * canvas.height));
    }
    return { x: a * stage.width, y: b * stage.height };
  };
  const first = toStage(clipLeft, clipTop), last = toStage(clipRight, clipBottom);
  return {
    left: Math.max(0, Math.min(first.x, last.x)),
    top: Math.max(0, Math.min(first.y, last.y)),
    right: Math.min(stage.width, Math.max(first.x, last.x)),
    bottom: Math.min(stage.height, Math.max(first.y, last.y)),
  };
}

function windowPortraitPlacement(win, tip, texture, nativeX) {
  const laya = win.Laya ?? win.laya, stage = laya?.stage, panel = tip.contentContainer;
  if (!(stage?.width > 0 && stage?.height > 0 && panel?.height > 0)) return;
  const viewport = visibleCanvas(win, laya, stage);
  if (!viewport || !(viewport.right > viewport.left && viewport.bottom > viewport.top)) return;
  const a = tip.globalToLocal(new laya.Point(viewport.left, viewport.top), true);
  const b = tip.globalToLocal(new laya.Point(viewport.right, viewport.bottom), true);
  const screenWidth = Math.abs(b.x - a.x), screenHeight = Math.abs(b.y - a.y);
  const left = Math.min(a.x, b.x) + portraitMargin;
  const right = Math.max(a.x, b.x) - portraitMargin;
  const top = Math.min(a.y, b.y) + portraitMargin, bottom = Math.max(a.y, b.y) - portraitMargin;
  const width = Math.min(windowPortraitWidth, screenWidth * .34, right - left, (panel.x - left) / windowPortraitVisibleRatio);
  const height = Math.min(windowPortraitHeight, screenHeight * .62, bottom - top);
  const scale = Math.min(width / texture.width, height / texture.height);
  if (!(scale > 0 && Number.isFinite(scale))) return;
  const drawWidth = texture.width * scale, drawHeight = texture.height * scale;
  const centerY = panel.y + panel.height / 2;
  // OL's original left edge leaves much of a wider illustration under the skill panel.
  // Keep the main part of the illustration to the left and let its right edge overlap.
  const panelAnchor = panel.x - drawWidth * windowPortraitVisibleRatio;
  return { scale, width: drawWidth, height: drawHeight, x: Math.max(left, Math.min(right - drawWidth, nativeX, panelAnchor)),
    y: Math.max(top, Math.min(bottom - drawHeight, centerY - drawHeight / 2)) };
}

function replacePreview(win, tip, choice) {
  const head = tip.generalHead;
  const texture = choice.preview?.texture;
  if (texture) {
    const { skin, x, y, scaleX, scaleY, visible, texture: original } = head;
    const windowArt = choice.preview !== choice.portrait;
    const scale = Math.min(185 / texture.width, 326 / texture.height);
    if (!windowArt && !(scale > 0 && Number.isFinite(scale))) return;
    // Cancel the native load before assigning the local texture.
    head.skin = '';
    head.texture = texture;
    if (!windowArt) {
      head.scaleX = scaleX < 0 ? -scale : scale;
      head.scaleY = scaleY < 0 ? -scale : scale;
    }
    return {
      layout: windowArt ? () => {
        if (tip.destroyed || head.texture !== texture) return;
        const placement = windowPortraitPlacement(win, tip, texture, x);
        head.visible = visible && Boolean(placement);
        if (!placement) return;
        head.scaleX = scaleX < 0 ? -placement.scale : placement.scale;
        head.scaleY = scaleY < 0 ? -placement.scale : placement.scale;
        head.x = placement.x + (scaleX < 0 ? placement.width : 0);
        head.y = placement.y + (scaleY < 0 ? placement.height : 0);
      } : undefined,
      restore() {
        if (tip.destroyed || head.texture !== texture) return;
        if (windowArt) { head.x = x; head.y = y; head.visible = visible; }
        head.scaleX = scaleX;
        head.scaleY = scaleY;
        if (skin) head.skin = skin;
        else head.texture = original;
      },
    };
  }
  const id = choice.applied.id, originalId = tip.skinItemID;
  if (id === originalId) return;
  tip.skinItemID = id;
  tip.loadSkin();
  return { restore() {
    if (tip.destroyed || tip.skinItemID !== id) return;
    tip.skinItemID = originalId;
    tip.loadSkin();
  } };
}

function bindMask(scope, win, mask, isInScene) {
  const tips = new Map();
  let choices = [];
  function sync(tip, state) {
    const choice = isInScene() && choices.find(({ target }) => tip.playerSeat === target.seat &&
      tip.general === target.general && target.seat.IsFaceUp?.(Number(target.deputy)) !== false);
    const art = choice?.portrait ? choice.preview?.texture : choice?.applied.id;
    if (state.art !== art) {
      read(() => state.preview?.restore());
      state.art = art;
      state.preview = art === undefined ? undefined : read(() => replacePreview(win, tip, choice));
    }
    read(() => state.preview?.layout?.());
  }
  // The public ToolTip setter registers pointer listeners. The hover handler
  // reads this instance field, so the existing listeners stay intact.
  const unpatch = scope.patch(mask, 'toolTip', original => function (...args) {
    const tip = Reflect.apply(original, this, args);
    if (tip?.name !== 'GameGeneralToolTip' || tip.hideImg || !tip.generalHead ||
        typeof tip.loadSkin !== 'function' || typeof tip.destroy !== 'function') return tip;
    let state = tips.get(tip);
    if (!state) {
      const off = scope.patch(tip, 'destroy', destroy => function (...args) {
        tips.delete(tip);
        off();
        return Reflect.apply(destroy, this, args);
      });
      state = { off };
      tips.set(tip, state);
    }
    sync(tip, state);
    return tip;
  });
  return { wrapper: mask.toolTip, refresh(next) {
    choices = next;
    for (const [tip, state] of tips) sync(tip, state);
  }, dispose() {
    unpatch();
    for (const state of tips.values()) {
      read(() => state.preview?.restore());
      state.off();
    }
    tips.clear();
  } };
}

export function createSkinPreviews(scope, win, isInScene) {
  const masks = new Map();
  return function refresh(choices) {
    const active = new Map();
    for (const choice of choices) {
      const mask = choice.target.ui.otherTopManager?.overMask;
      if (typeof mask?.toolTip !== 'function') continue;
      if (!active.has(mask)) active.set(mask, []);
      active.get(mask).push(choice);
    }
    for (const [mask, binding] of masks) {
      if (active.has(mask) && mask.toolTip === binding.wrapper) continue;
      binding.dispose();
      masks.delete(mask);
    }
    for (const [mask, selected] of active) {
      if (!masks.has(mask)) masks.set(mask, bindMask(scope, win, mask, isInScene));
      masks.get(mask).refresh(selected);
    }
  };
}
