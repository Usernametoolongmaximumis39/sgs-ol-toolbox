import { createNativeCatalogueButton } from './native-catalogue-button.js';

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

export function createGeneralSkinsEntry(ctx, openYjcm, openMobile) {
  const theme = ctx.ui.nativeTheme;
  let entry;
  function attach(laya, list) {
    const { stage } = laya, { view, title, label, id, name } = list;
    let closePicker;
    function active() {
      return !ctx.scope.signal.aborted && isVisible(view, stage) && view.skinTitle === title &&
        Number(view.generalId) === id && view.generalInfo?.ItemNameSimpleNoColor === name;
    }
    const entries = [];
    for (const [open, buttonName, text, width] of [
      [openYjcm, 'sgs-yjcm-general-skins', '一将成名皮肤', openMobile ? 86 : 102],
      [openMobile, '__sgsSkinToolMobileGeneralEntry', '移动版皮肤', 76],
    ]) {
      if (!open) continue;
      const action = createNativeCatalogueButton(laya, title, theme, { name: buttonName, text, width, height: 24, fontSize: 12 }, () => {
        if (!active()) return;
        paint();
        closePicker?.();
        closePicker = open({ general: { id, name, isSelf: true }, initialQuery: view.generalInfo.showName || name });
      });
      entries.push(action);
    }
    function update() {
      const gap = 6;
      const totalWidth = entries.reduce((width, { button }) => width + button.width, 0) + gap * (entries.length - 1);
      const card = view.baseSkinItems?.[0];
      // The title's local coordinates inherit the native window's scale.
      const cardLeft = card && card.parent === title.parent ? card.x - title.x : NaN;
      const nameLeft = label.x - totalWidth - 9;
      let left = Math.round(Number.isFinite(cardLeft) ? Math.min(cardLeft, nameLeft) : nameLeft);
      const visible = left >= 0;
      for (const { button } of entries) {
        button.pos(left, Math.round((title.height - button.height) / 2));
        button.visible = visible;
        if (!visible && stage.focus === button) stage.focus = null;
        left += button.width + gap;
      }
    }
    const paint = () => entries.forEach(action => action.paint());
    const offTheme = theme.watch(paint);
    const offKeys = ctx.scope.listen(ctx.window, 'keydown', event => {
      if (!active() || !entries[0]?.button.visible || !isVisible(title, stage) || event.defaultPrevented ||
          event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
      const index = entries.findIndex(({ button }) => stage.focus === button);
      if (index >= 0 && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        entries[index].choose();
      } else if (event.key === 'Tab' && (index >= 0 || (!stage.focus && !event.shiftKey))) {
        const next = entries[index + (event.shiftKey ? -1 : 1)];
        if (next) event.preventDefault();
        stage.focus = next?.button ?? null;
        paint();
      }
    });
    paint();
    update();
    return { active, update, dispose() {
      closePicker?.();
      offTheme();
      offKeys();
      for (const action of entries) action.dispose();
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
