import { textNode } from './controls.js';
import { read } from './native-model.js';
import { createNativeCatalogueButton } from './native-catalogue-button.js';
import { isNativeNodeMounted as isVisible } from '../../shared/native-tree.js';

const windows = new Set(['SelectSkinWindow', 'ChangeSkinWindow']);

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

function attachSelector(ctx, local, laya, owner, openYjcm, openForms, openMobile) {
  const view = owner.selectView, content = view.pannelContent, stage = laya.stage;
  const scene = ctx.game.getScene();
  const selectingGeneral = owner._className_ === 'SelectSkinWindow';
  const visible = () => !ctx.scope.signal.aborted && ctx.game.isInGame?.() && scene === ctx.game.getScene() &&
    owner.selectView === view && view.pannelContent === content && isVisible(owner, stage);
  const nativeEnabled = () => ctx.settings.get('unlockSkin', false) === true;
  const crossEnabled = () => (openYjcm || openMobile) && !selectingGeneral && ctx.settings.get('crossServer', false) === true;
  const enabled = () => visible() && (nativeEnabled() || crossEnabled());
  const generalId = () => Number(view.realGeneralID);
  const portraitTarget = () => local.ownPortraitTarget(Number(owner.generalID) || generalId());
  const actions = new Map();
  const theme = ctx.ui.nativeTheme;
  const crossActions = [];
  let closeCatalogue;
  let palette = theme.palette;
  function layoutCatalogueActions(panel) {
    if (!crossActions.length) for (const [open, name, text, width] of [
      [openYjcm, 'sgs-yjcm-skin-selector', '一将成名皮肤', openMobile ? 96 : 112],
      [openMobile, '__sgsSkinToolMobileEntry', '移动版皮肤', 86],
    ]) {
      if (!open) continue;
      crossActions.push(createNativeCatalogueButton(laya, owner, theme, { name, text, width, height: 30, fontSize: 13 }, () => {
        const target = visible() && crossEnabled() && portraitTarget();
        if (!target) return;
        for (const action of crossActions) action.paint();
        closeCatalogue?.();
        closeCatalogue = open({ target, onApply() {
          if (!visible()) return;
          view.clickCheck = false;
          owner.Close();
        } });
      }));
    }
    let left = Math.max(10, panel.x);
    for (const { button } of crossActions) {
      button.pos(left, Math.max(6, Math.floor((panel.y - button.height) / 2)));
      left += button.width + 6;
    }
  }
  function removeCatalogueActions() {
    closeCatalogue?.();
    closeCatalogue = null;
    for (const action of crossActions.splice(0)) action.dispose();
  }
  function show(card, option) {
    const button = new laya.Sprite(), badge = new laya.Sprite();
    const width = Math.min(card.width - 12, 130), height = 24;
    const label = textNode(laya, option.forms?.count === 2 ? '形态规则' : '未开通 · 本地使用', 0, 0, width, height);
    button.name = 'sgs-local-skin-' + option.id;
    // Leave the existing composition control below the portrait reachable.
    const left = (card.width - width) / 2, top = card.height - 30 - height - 4;
    button.size(option.owned ? width : card.width, option.owned ? height : card.height - 30);
    button.pos(card.x + (option.owned ? left : 0), card.y + (option.owned ? top : 0));
    button.mouseEnabled = true;
    button.zOrder = 40;
    badge.size(width, height);
    if (!option.owned) badge.pos(left, top);
    badge.mouseEnabled = false;
    badge.addChild(label);
    button.addChild(badge);
    content.addChild(button);
    let hovered = false, closeRules;
    function paint() {
      const focused = stage.focus === button;
      theme.surface(badge, { hover: hovered, selected: focused });
      label.color = focused || hovered ? palette.accent : palette.text;
    }
    function available() {
      return visible() && nativeEnabled() && view.itemList.includes(card) && card.HasSkin === option.owned &&
        Number(card.SkinID) === option.id && Number(owner.generalID) === generalId();
    }
    function apply(config) {
      if (!available()) throw new Error('皮肤选项已变化，请重新选择。');
      local.selectNative(generalId(), option, selectingGeneral, config);
      // The native close path still confirms the chosen general. This local
      // rendering choice must never enter the native skin submission path.
      view.clickCheck = false;
      owner.Close();
      ctx.notify?.(option.owned ? '已应用本地皮肤规则。' : '已选用未开通皮肤，仅自己可见。');
    }
    function choose() {
      if (!available()) return;
      if (option.forms?.count === 2 && openForms) {
        closeRules = openForms({ generalId: generalId(), name: option.name, official: option.forms.text,
          value: local.formRule(generalId(), 'native', option.id), onApply: apply });
        return;
      }
      try { apply(); }
      catch (error) { ctx.notify?.(error.message); }
    }
    button.on('click', button, event => { event?.stopPropagation?.(); choose(); });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    paint();
    return { button, paint, choose, option, close() { closeRules?.(); } };
  }
  function remove(card, action) {
    action.close();
    if (stage.focus === action.button) stage.focus = null;
    if (!action.button.destroyed) action.button.destroy(true);
    actions.delete(card);
  }
  const unwatch = theme.watch(colors => {
    palette = colors;
    for (const action of actions.values()) action.paint();
    for (const action of crossActions) action.paint();
  });
  const unpatch = ctx.scope.patch(view, 'closeSelectSure', original => function (...args) {
    if (scene === ctx.game.getScene()) {
      try { local.clearNative(Number(owner.generalID) || generalId()); }
      catch (error) { ctx.notify?.(error.message); }
    }
    return Reflect.apply(original, this, args);
  });
  const offKeys = ctx.scope.listen(ctx.window, 'keydown', event => {
    if (!enabled() || event.defaultPrevented || event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const items = [...actions.values(), ...crossActions];
    const index = items.findIndex(action => stage.focus === action.button);
    if (index >= 0 && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); items[index].choose();
    } else if (event.key === 'Tab' && items.length) {
      const next = items[index < 0 ? (event.shiftKey ? items.length - 1 : 0) : index + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        stage.focus = next.button;
        const panel = view.pannel, bar = panel?.vScrollBar;
        if (next.option && bar && (next.button.y < bar.value || next.button.y + next.button.height > bar.value + panel.height)) bar.value = next.button.y;
        next.paint();
      } else stage.focus = null;
      items[index]?.paint();
    }
  });
  return { enabled, check() {
    const panel = view.pannel;
    if (crossEnabled() && panel?.y >= 36 && portraitTarget()) layoutCatalogueActions(panel);
    else removeCatalogueActions();
    const canChoose = nativeEnabled() && (selectingGeneral || local.hasOwnGeneral(generalId()));
    if (!Array.isArray(view.list)) return;
    const cards = new Map();
    if (canChoose) for (const card of view.itemList) {
      const id = Number(card.SkinID);
      if (!(id > 0) || (card.HasSkin !== false && !openForms)) continue;
      const vo = view.list.find(entry => Number(entry?.skinID) === id);
      const forms = vo && local.officialForms(vo);
      if (!vo || (card.HasSkin !== false && (card.HasSkin !== true || forms?.count !== 2))) continue;
      cards.set(card, { id, name: vo.skinname || `皮肤 ${id}`, owned: card.HasSkin,
        dynamic: Boolean(read(() => vo.SeatAnimateUrl)), forms });
    }
    for (const [card, action] of actions) {
      const option = cards.get(card);
      if (!option || option.id !== action.option.id || option.owned !== action.option.owned) remove(card, action);
    }
    for (const [card, option] of cards) {
      if (actions.has(card)) continue;
      if (card.width > 20 && card.height > 60) actions.set(card, show(card, option));
    }
  }, dispose() {
    offKeys(); unpatch(); unwatch();
    removeCatalogueActions();
    for (const [card, action] of actions) remove(card, action);
  } };
}

export function createMatchSkinSelector(ctx, local, openYjcm, openForms, openMobile) {
  let attached;
  function check() {
    if (attached && !attached.enabled()) { attached.dispose(); attached = null; }
    if (!attached && !ctx.scope.signal.aborted && ctx.game.isInGame?.() &&
        (ctx.settings.get('unlockSkin', false) === true || ((openYjcm || openMobile) && ctx.settings.get('crossServer', false) === true))) {
      const laya = ctx.window.Laya ?? ctx.window.laya;
      if (!laya?.Sprite || !laya.Text || !ctx.ui.nativeTheme?.surface) return;
      const owner = findSelector(laya.stage);
      if (owner && typeof owner.selectView.closeSelectSure === 'function' &&
          (owner._className_ === 'ChangeSkinWindow' || ctx.settings.get('unlockSkin', false) === true)) {
        attached = attachSelector(ctx, local, laya, owner, openYjcm, openForms, openMobile);
      }
    }
    attached?.check();
  }
  ctx.scope.interval(check, 180);
  ctx.scope.add(() => { attached?.dispose(); attached = null; });
  check();
  return check;
}
