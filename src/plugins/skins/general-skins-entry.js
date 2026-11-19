import { textNode } from './controls.js';

function isVisible(view, stage) {
  for (let node = view; node; node = node.parent) {
    if (node.destroyed || node.visible === false) return false;
    if (node === stage) return true;
  }
  return false;
}

function skinList(view) {
  const title = view?.skinTitle;
  const name = view?.generalInfo?.ItemNameSimpleNoColor;
  const id = Number(view?.generalId);
  if (!title || !view.titltTxt || !view.panel || typeof view.showSkins !== 'function' ||
      !Number.isSafeInteger(id) || id <= 0 || !name) return null;
  // This title draws the background, the general's name, then the owned count.
  const label = title.textureList?.find(node => node !== view.titltTxt && node.text === name);
  return label ? { title, label, id, name } : null;
}

function findSkinList(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const view = queue[i];
    if (!view || view.destroyed || view.visible === false) continue;
    const list = skinList(view);
    if (list) return { view, ...list };
    if (Array.isArray(view._children)) queue.push(...view._children);
  }
  return null;
}

export function createGeneralSkinsEntry(ctx, openYjcm) {
  const theme = ctx.ui.nativeTheme;
  let entry;
  function attach(laya, list) {
    const { stage } = laya, { view, title, label, id, name } = list;
    const button = new laya.Sprite();
    button.name = 'sgs-yjcm-general-skins';
    button.size(102, 24);
    button.mouseEnabled = true;
    button.zOrder = 40;
    const caption = textNode(laya, '一将成名皮肤', 0, 0, button.width, button.height, theme.palette.text, 12);
    button.addChild(caption);
    title.addChild(button);
    let hovered = false, closePicker;
    function active() {
      return !ctx.scope.signal.aborted && isVisible(view, stage) && view.skinTitle === title &&
        Number(view.generalId) === id && view.generalInfo?.ItemNameSimpleNoColor === name;
    }
    function paint() {
      const focused = stage.focus === button;
      theme.surface(button, { hover: hovered, selected: focused });
      caption.color = hovered || focused ? theme.palette.accent : theme.palette.text;
    }
    function update() {
      const card = view.baseSkinItems?.[0];
      const cardLeft = card && card.parent === title.parent ? card.x - title.x : NaN;
      const nameLeft = label.x - button.width - 9;
      button.pos(Math.round(Number.isFinite(cardLeft) ? Math.min(cardLeft, nameLeft) : nameLeft),
        Math.round((title.height - button.height) / 2));
      button.visible = button.x >= 0;
    }
    function choose() {
      if (!active() || !button.visible) return;
      stage.focus = button;
      paint();
      closePicker = openYjcm({ general: { id, name, isSelf: true }, initialQuery: view.generalInfo.showName || name });
    }
    button.on('click', button, event => { event?.stopPropagation?.(); choose(); });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    const offTheme = theme.watch(paint);
    const offKeys = ctx.scope.listen(ctx.window, 'keydown', event => {
      if (!active() || !button.visible || !isVisible(title, stage) || event.defaultPrevented ||
          event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
      if (event.key === 'Tab' && !event.shiftKey && !stage.focus) {
        event.preventDefault(); stage.focus = button; paint();
      } else if (stage.focus === button && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); choose();
      } else if (stage.focus === button && event.key === 'Tab') {
        stage.focus = null; paint();
      }
    });
    paint();
    update();
    return { active, update, dispose() {
      closePicker?.();
      offTheme();
      offKeys();
      if (stage.focus === button) stage.focus = null;
      if (!button.destroyed) button.destroy(true);
    } };
  }
  function check() {
    if (entry?.active()) { entry.update(); return; }
    entry?.dispose();
    entry = null;
    if (ctx.scope.signal.aborted || !theme?.surface) return;
    const laya = ctx.window.Laya ?? ctx.window.laya;
    if (!laya?.Sprite || !laya.Text) return;
    const list = findSkinList(laya.stage);
    if (list) entry = attach(laya, list);
  }
  ctx.scope.interval(check, 350);
  ctx.scope.add(() => entry?.dispose());
  check();
}
