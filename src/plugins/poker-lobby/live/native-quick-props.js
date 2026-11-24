import { ResourceScope } from '../../../core/resources.js';
import { replayPopupManager } from '../replay/native-opening.js';
import { withClassicPokerContext } from './classic-context.js';

const WINDOW = 'InteractPropWindow';
const TOOLBAR_WINDOW = 'InteractPropWindow2';

export function attachPokerQuickProps(ctx, scope, scene, input) {
  const { window: win } = ctx;
  const manager = replayPopupManager(scene);
  if (!manager || !scene.ged?.on) return { draw() {}, buttons: () => null };
  const context = run => withClassicPokerContext(win, scene, run);
  const { CLICK, MOUSE_DOWN } = win.Laya.Event;
  let available, panel, popupScope, entries = [];

  function release() {
    popupScope?.dispose();
    panel = popupScope = undefined;
    entries = [];
  }

  function close() {
    if (panel && !panel.destroyed) panel.Close?.();
    release();
  }

  function open(ui) {
    if (!available || !input.canUseTableActions() || !manager || ui.Seat.IsSelf || !ui.Seat.GeneralId
        || manager.GetWindowData(TOOLBAR_WINDOW)?.parent || !win.Laya.ClassUtils?.getClass?.(WINDOW)) return;
    if (panel) { close(); return; }
    if (manager.GetWindowData(WINDOW)?.parent) return;
    panel = manager.GetWindow(WINDOW, false);
    if (typeof panel?.enterWindow !== 'function') { release(); return; }
    popupScope = new ResourceScope();
    const previousLayer = Object.getOwnPropertyDescriptor(panel, 'ParentLayerInstance');
    Object.defineProperty(panel, 'ParentLayerInstance', { configurable: true, get: () => scene });
    const owned = panel;
    popupScope.add(() => {
      if (previousLayer) Object.defineProperty(owned, 'ParentLayerInstance', previousLayer);
      else delete owned.ParentLayerInstance;
    });
    popupScope.timeout(() => { if (panel && !entries.length) close(); }, 6000);
    popupScope.patch(panel, 'enterWindow', original => function (...args) {
      if (!available || !input.canUseTableActions()) { close(); return; }
      context(() => Reflect.apply(original, this, args));
      entries = (this.items || []).flatMap((node, index) => {
        const title = node.goods?.showName;
        if (!node.visible || !title || typeof node.OnClick !== 'function') return [];
        const send = node.OnClick;
        const invoke = () => {
          if (panel?.parent && node.visible && available && input.canUseTableActions()) context(() => send.call(node));
        };
        node.off(CLICK, node, send);
        node.off(MOUSE_DOWN, node, node.longPressSendProp);
        node.name = `poker-live-quick-prop-${index}`;
        node.ToolTip = title;
        node.on(CLICK, popupScope, invoke);
        return [{ node, key: node.name, title, invoke }];
      });
      if (!entries.length) { close(); return; }
      const { width, height } = this.panelBg;
      this.size(width, height);
      this.mouseEnabled = this.contentSprite.mouseEnabled = this.panel.mouseEnabled = true;
      this.zOrder = 1000;
      const at = scene.globalToLocal(ui.seatAvatar.localToGlobal(new win.Laya.Point(0, 0)));
      const beside = at.x + ui.ScaledWidth + 6;
      const right = scene.rightView?.visible ? scene.rightView.x : scene.width;
      const above = ui.DisplayLocation === 'Top';
      const y = Math.min(scene.height - height - 24, at.y + (above ? 64 : Math.max(0, ui.ScaledHeight - height) / 2));
      this.pos(beside + width <= right ? beside : Math.max(0, at.x - width - 6), Math.max(28, y));
    });
    context(() => scene.ged.A(WINDOW, ui));
  }

  const container = scene.seatContainer;
  const opponents = container.seatUIs.slice(1);
  for (const ui of opponents) {
    const portrait = ui.otherTopManager;
    if (typeof portrait?.onClickOverMask === 'function') portrait.overMask?.off(CLICK, portrait, portrait.onClickOverMask);
  }
  const onPortraitClick = event => {
    if (!available) return;
    let node = event.target;
    while (node && node !== container) {
      if (node.name?.startsWith('poker-live-profile-')) return;
      node = node.parent;
    }
    if (node !== container) return;
    const target = opponents.find(({ seatAvatar }) => {
      const point = seatAvatar?.globalToLocal(new win.Laya.Point(event.stageX, event.stageY));
      return seatAvatar?.visible && point && point.x >= 0 && point.x < seatAvatar.width
        && point.y >= 0 && point.y < seatAvatar.height;
    });
    if (target) {
      event.stopPropagation();
      open(target);
    }
  };
  container.on(CLICK, scope, onPortraitClick);
  scope.add(() => container.off(CLICK, scope, onPortraitClick));
  const closed = name => { if (name === WINDOW) release(); };
  scene.ged.on('windowClosed', scope, closed);
  scope.add(() => { scene.ged.off('windowClosed', scope, closed); close(); });

  return {
    draw(state) {
      available = !state.ended && !state.pending && !state.decision && state.phase >= 201
        && state.turnSeat !== state.selfSeat && input.canUseTableActions();
      if (!available && panel) close();
    },
    buttons: () => panel?.parent && panel.visible ? entries : null,
  };
}
