import { textNode } from './controls.js';
import { read } from './native-model.js';

const windows = new Set(['SelectSkinWindow', 'ChangeSkinWindow']);

function isVisible(node, stage) {
  for (let parent = node; parent; parent = parent.parent) {
    if (parent.destroyed || parent.visible === false) return false;
    if (parent === stage) return true;
  }
  return false;
}

function findSelector(stage) {
  const queue = [stage];
  for (let i = 0; i < queue.length && i < 1500; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    const view = node.selectView;
    if (windows.has(node._className_) && typeof node.Close === 'function' &&
        Array.isArray(view?.itemList) && Array.isArray(view.list) && view.pannelContent) return node;
    const children = node._children;
    if (Array.isArray(children)) for (let j = children.length - 1; j >= 0; j--) queue.push(children[j]);
  }
  return null;
}

function attachSelector(ctx, local, laya, owner) {
  const view = owner.selectView, content = view.pannelContent, stage = laya.stage;
  const scene = ctx.game.getScene();
  const selectingGeneral = owner._className_ === 'SelectSkinWindow';
  const enabled = () => !ctx.scope.signal.aborted && ctx.settings.get('unlockSkin', false) === true &&
    ctx.game.isInGame?.() && scene === ctx.game.getScene() && owner.selectView === view && view.pannelContent === content && isVisible(owner, stage);
  const generalId = () => Number(view.realGeneralID);
  const actions = new Map();
  const theme = ctx.ui.nativeTheme;
  let palette = theme.palette;
  function show(card, option) {
    const button = new laya.Sprite(), badge = new laya.Sprite();
    const width = Math.min(card.width - 12, 130), height = 24;
    const label = textNode(laya, '未开通 · 本地使用', 0, 0, width, height);
    button.name = 'sgs-local-skin-' + option.id;
    // Leave the existing composition control below the portrait reachable.
    button.size(card.width, card.height - 30);
    button.pos(card.x, card.y);
    button.mouseEnabled = true;
    button.zOrder = 40;
    badge.size(width, height);
    badge.pos((card.width - width) / 2, button.height - height - 4);
    badge.mouseEnabled = false;
    badge.addChild(label);
    button.addChild(badge);
    content.addChild(button);
    let hovered = false;
    function paint() {
      const focused = stage.focus === button;
      theme.surface(badge, { hover: hovered, selected: focused });
      label.color = focused || hovered ? palette.accent : palette.text;
    }
    function choose() {
      if (!enabled() || !view.itemList.includes(card) || card.HasSkin !== false || Number(owner.generalID) !== generalId()) return;
      try { local.selectNative(generalId(), option, selectingGeneral); }
      catch (error) { ctx.notify?.(error.message); return; }
      // The native close path still confirms the chosen general. This local
      // rendering choice must never enter the native skin submission path.
      view.clickCheck = false;
      owner.Close();
      ctx.notify?.('已选用未开通皮肤，仅本局自己可见。');
    }
    button.on('click', button, event => { event?.stopPropagation?.(); choose(); });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    paint();
    return { button, paint, choose };
  }
  function remove(card, action) {
    if (stage.focus === action.button) stage.focus = null;
    if (!action.button.destroyed) action.button.destroy(true);
    actions.delete(card);
  }
  const unwatch = theme.watch(colors => { palette = colors; for (const action of actions.values()) action.paint(); });
  const unpatch = ctx.scope.patch(view, 'closeSelectSure', original => function (...args) {
    if (scene === ctx.game.getScene()) {
      try { local.clearNative(generalId()); }
      catch (error) { ctx.notify?.(error.message); }
    }
    return Reflect.apply(original, this, args);
  });
  const offKeys = ctx.scope.listen(ctx.window, 'keydown', event => {
    if (!enabled() || event.defaultPrevented || event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const items = [...actions.values()];
    const index = items.findIndex(action => stage.focus === action.button);
    if (index >= 0 && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); items[index].choose();
    } else if (event.key === 'Tab' && items.length) {
      const next = items[index < 0 ? (event.shiftKey ? items.length - 1 : 0) : index + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        stage.focus = next.button;
        const panel = view.pannel, bar = panel?.vScrollBar;
        if (bar && (next.button.y < bar.value || next.button.y + next.button.height > bar.value + panel.height)) bar.value = next.button.y;
        next.paint();
      } else stage.focus = null;
      items[index]?.paint();
    }
  });
  return { enabled, check() {
    const canChoose = selectingGeneral || local.hasOwnGeneral(generalId());
    const cards = new Set(canChoose ? view.itemList.filter(card => card.HasSkin === false && Number(card.SkinID) > 0) : []);
    for (const [card, action] of actions) if (!cards.has(card)) remove(card, action);
    if (!Array.isArray(view.list)) return;
    for (const card of cards) {
      if (actions.has(card)) continue;
      const id = Number(card.SkinID), vo = view.list.find(entry => Number(entry?.skinID) === id);
      if (vo && card.width > 20 && card.height > 60) actions.set(card, show(card, { id, dynamic: Boolean(read(() => vo.SeatAnimateUrl)) }));
    }
  }, dispose() {
    offKeys(); unpatch(); unwatch();
    for (const [card, action] of actions) remove(card, action);
  } };
}

export function createMatchSkinSelector(ctx, local) {
  let attached;
  function check() {
    if (attached && !attached.enabled()) { attached.dispose(); attached = null; }
    if (!attached && !ctx.scope.signal.aborted && ctx.settings.get('unlockSkin', false) === true && ctx.game.isInGame?.()) {
      const laya = ctx.window.Laya ?? ctx.window.laya;
      if (!laya?.Sprite || !laya.Text || !ctx.ui.nativeTheme?.surface) return;
      const owner = findSelector(laya.stage);
      if (owner && typeof owner.selectView.closeSelectSure === 'function') attached = attachSelector(ctx, local, laya, owner);
    }
    attached?.check();
  }
  ctx.scope.interval(check, 180);
  ctx.scope.add(() => { attached?.dispose(); attached = null; });
  check();
  return check;
}
