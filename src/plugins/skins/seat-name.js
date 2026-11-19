import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';
import { createBattleCollapse } from './battle-collapse.js';

function visibleOnStage(node, stage) {
  for (; node; node = node.parent) {
    if (node.destroyed || node.visible === false || node.alpha === 0) return false;
    if (node === stage) return true;
  }
  return false;
}

function attach(ctx, laya, host, bar, ui) {
  const { stage } = laya;
  const button = new laya.Sprite();
  const topLeft = new laya.Point(), bottomRight = new laya.Point();
  const hidden = new Map();
  const collapse = createBattleCollapse();
  let focused = false, focusVisible = false, palette = DEFAULT_NATIVE_PALETTE;
  button.name = 'sgs-seat-name-toggle';
  button.mouseEnabled = true;
  button.zOrder = 40;
  host.addChild(button);

  function bounds(part) {
    if (!part || part.destroyed || part.visible === false || part.renderVisible === false) return;
    // Native faction textures are draw commands whose coordinates belong to their render sprite.
    const source = part.render?.localToGlobal ? part.render : part;
    if (!source.localToGlobal) return;
    const drawn = source !== part;
    const width = drawn ? part.renderWidth : part.width;
    const height = drawn ? part.renderHeight : part.height;
    const x = drawn ? part.renderX - width * (part.AnchorsX || 0) : 0;
    const y = drawn ? part.renderY - height * (part.AnchorsY || 0) : 0;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
    host.globalToLocal(source.localToGlobal(topLeft.setTo(x, y)));
    host.globalToLocal(source.localToGlobal(bottomRight.setTo(x + width, y + height)));
    return {
      left: Math.min(topLeft.x, bottomRight.x), right: Math.max(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y), bottom: Math.max(topLeft.y, bottomRight.y),
    };
  }

  function setHiddenParts(hide = []) {
    for (const [part, alpha] of hidden) if (!hide.includes(part)) {
      if (!part.destroyed && part.alpha === 0) part.alpha = alpha;
      hidden.delete(part);
    }
    for (const part of hide) if (part && !part.destroyed && part.alpha > 0) {
      hidden.set(part, part.alpha);
      part.alpha = 0;
    }
  }

  function paintFocus() {
    focused = focusVisible && stage.focus === button;
    button.graphics.clear();
    if (focused && button.visible) {
      button.graphics.drawRect(0, 0, button.width, button.height, null, palette.highlight, 1);
    }
  }

  function focusByKey() {
    focusVisible = true;
    stage.focus = button;
    paintFocus();
  }

  function refresh() {
    const collapsed = collapse.collapsed();
    const body = bounds(bar.countryBg);
    const dual = bar.doubleSideUI;
    const parts = bar.isDoubeSideGen && dual?.visible !== false
      ? [dual?.firstCountryName, dual?.secondCountryName] : [bar.countryName];
    const marks = parts.filter(part => part?.alpha > 0).map(bounds).filter(Boolean);
    const compact = marks.reduce((outer, mark) => outer ? {
      left: Math.min(outer.left, mark.left), right: Math.max(outer.right, mark.right),
      top: Math.min(outer.top, mark.top), bottom: Math.max(outer.bottom, mark.bottom),
    } : mark, null);
    button.visible = Boolean(body && compact && bar.visible !== false && bar.generalNameTxt?.visible !== false &&
      body.right - body.left > body.bottom - body.top && visibleOnStage(host, stage));
    const frame = ui.otherTopManager?.selfCover ?? ui.topManager?.selfCover;
    setHiddenParts(button.visible && collapsed ? [bar.countryBg, bar.generalNameTxt, frame] : []);
    if (!button.visible) {
      if (stage.focus === button) stage.focus = null;
      if (focused) paintFocus();
      return;
    }
    const hit = collapsed ? compact : body;
    const width = hit.right - hit.left, height = hit.bottom - hit.top;
    if (button.x !== hit.left || button.y !== hit.top) button.pos(hit.left, hit.top);
    if (button.width !== width || button.height !== height) {
      button.size(width, height);
      paintFocus();
    } else if (focused !== (focusVisible && stage.focus === button)) paintFocus();
  }

  function toggle(byKey = false) {
    if (!button.visible || !visibleOnStage(button, stage)) return;
    collapse.toggle();
    focusVisible = byKey;
    stage.focus = button;
    refresh();
  }

  button.on(laya.Event?.CLICK ?? 'click', button, event => {
    event?.stopPropagation?.();
    toggle();
  });
  const unwatch = ctx.ui?.nativeTheme?.watch(colors => { palette = colors; paintFocus(); }, { target: button });
  return { button, update(token) { collapse.setAutomatic(token); refresh(); }, toggle, focusByKey, paintFocus, dispose() {
    setHiddenParts();
    unwatch?.();
    if (stage.focus === button) stage.focus = null;
    if (!button.destroyed) button.destroy();
  } };
}

export function createSeatNameToggle(ctx) {
  const { window: win, scope } = ctx;
  let binding;
  const clear = () => { binding?.toggle.dispose(); binding = null; };

  scope.listen(win, 'keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const toggle = binding?.toggle, stage = binding?.laya.stage;
    if (!stage || !visibleOnStage(toggle.button, stage)) return;
    const focused = stage.focus === toggle.button;
    if (focused && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) toggle.toggle(true);
    } else if (event.key === 'Tab' && !stage.focus) {
      event.preventDefault();
      event.stopPropagation();
      toggle.focusByKey();
    } else if (focused && (event.key === 'Tab' || event.key === 'Escape')) {
      stage.focus = null;
      toggle.paintFocus();
    }
  }, true);
  scope.add(clear);

  return function update(ui, scene, automatic) {
    const laya = win.Laya ?? win.laya, bar = ui?.countryUI;
    const host = bar?.textSprite ?? bar?.generalNameTxt?.parent;
    // The country-war layout uses a different strip for primary and secondary positions.
    if (scope.signal.aborted || !laya?.stage || !laya.Point || !laya.Sprite || !bar?.countryBg ||
        !bar.generalNameTxt || bar.generalFuNameTxt || !host?.addChild || host.destroyed) {
      clear();
      return;
    }
    if (!binding || binding.ui !== ui || binding.scene !== scene || binding.bar !== bar || binding.host !== host ||
        binding.laya !== laya || binding.toggle.button.destroyed) {
      clear();
      binding = { ui, scene, bar, host, laya, toggle: attach(ctx, laya, host, bar, ui) };
    }
    binding.toggle.update(automatic);
  };
}
