import { read } from '../../../shared/info-runtime.js';
import { findNativeListenerOwner } from '../../../shared/native-manager.js';
import { isPokerReplayActive } from '../../../shared/poker-replay-mode.js';
import { isNativePokerTable, POKER_TABLE_SCENE } from '../../../shared/poker-table-mode.js';
import { ResourceScope } from '../../../core/resources.js';
import { replayPopupManager } from '../replay/native-opening.js';
import { withClassicPokerContext } from './classic-context.js';
import { POKER_MODE, POKER_SECTION } from '../poker-room.js';

const TRUSTEE_RETRY_MS = 2000;
const PROP_WINDOW = 'InteractPropWindow2';
const PROP_REPLY = 20039;
const PROP_BROADCAST = 20649;

function usable(button) {
  return button?.visible === true && !button.destroyed
    && button.enabled !== false && button._enabled !== false && button.disabled !== true;
}

function readMatch(ctx, scene) {
  const { document, game, native, scope } = ctx;
  if (scope.closed || !isNativePokerTable(scene) || scene.initialized === false
    || scene.visible === false || scene.IsViewer === true || scene.gameToolbar?.isReplay === true || isPokerReplayActive(document)
    || game.getScene() !== scene || game.isReplay(scene) !== false) return null;

  const Table = game.getClass(POKER_TABLE_SCENE);
  if (typeof Table !== 'function' || !(scene instanceof Table)) return null;
  const self = scene.SelfSeatUi;
  const seat = self?.Seat;
  const manager = scene.Manager;
  if (seat?.IsSelf !== true || !manager || manager.isGameOver
    || manager.selfSeatIndex !== seat.Index || typeof manager.SendClientTrustReq !== 'function') return null;

  const proxy = game.getServerProxy();
  const account = native.account().id;
  if (!account || String(seat.PlayerInfo?.ClientId) !== account || !proxy || proxy.ConnectedSucess1 === false) return null;
  return { account, proxy, connection: proxy.ConnId, manager, seat, self, toolbar: scene.gameToolbar };
}

// Capture only an official native live table. Call the action methods from
// deliberate UI actions. The native controls retain their own availability,
// target selection, inventory, confirmation and request handling.
export function capturePokerLiveInteractions(ctx, scene) {
  const match = read(() => readMatch(ctx, scene));
  if (!match) return null;
  let pending, ended = false;

  function current() {
    if (ended) return null;
    const next = read(() => readMatch(ctx, scene));
    ended = !next || next.account !== match.account || next.proxy !== match.proxy
      || next.connection !== match.connection || next.manager !== match.manager
      || next.seat !== match.seat || next.self !== match.self;
    return ended ? null : next;
  }

  const now = () => ctx.window.performance.now();
  function trusteeState(next) {
    const ai = read(() => next.seat.IsAiControl);
    const state = typeof ai === 'boolean' ? ai : null;
    if (pending && (state === pending.desired || now() >= pending.until)) pending = undefined;
    return state;
  }

  function open(buttonKey, method) {
    const self = current()?.self;
    if (!usable(self?.[buttonKey]) || typeof self[method] !== 'function') return false;
    self[method]();
    return true;
  }

  return {
    status() {
      const next = current();
      if (!next) return null;
      const { self, toolbar } = next;
      const trustee = trusteeState(next);
      return {
        chat: usable(self.chatBtn) && typeof self.showChatHandler === 'function',
        items: usable(self.propBtnIn) && typeof self.onInteractPropClick === 'function',
        trustee,
        trusteeAvailable: trustee !== null && !pending && usable(toolbar?.btn_trusteeship)
          && typeof toolbar.onTrusteeshipClick === 'function',
      };
    },
    openChat: () => open('chatBtn', 'showChatHandler'),
    openItems: () => open('propBtnIn', 'onInteractPropClick'),
    setTrustee(desired) {
      const next = current();
      if (!next || typeof desired !== 'boolean') return false;
      const { toolbar } = next;
      const state = trusteeState(next);
      if (state === null || state === desired || pending || !usable(toolbar?.btn_trusteeship)
        || typeof toolbar.onTrusteeshipClick !== 'function') return false;
      toolbar.onTrusteeshipClick();
      pending = { desired, until: now() + TRUSTEE_RETRY_MS };
      return true;
    },
  };
}

export function attachClassicPokerInteractions(ctx, scope, scene, input) {
  const { window: win } = ctx;
  const { Laya } = win;
  const context = run => withClassicPokerContext(win, scene, run);
  const toolbar = read(() => context(() => {
    scene.addGameToolBar?.();
    return scene.gameToolbar;
  }));
  if (!toolbar?.trusteeshipBtn) return () => [];
  const manager = replayPopupManager(scene);
  const { trusteeshipBtn: trustee, interactPropBtn: props, loseBtn: surrender } = toolbar;
  const seats = scene.seatContainer.seatUIs;
  const container = scene.seatContainer;
  const router = findNativeListenerOwner(scene.ged, ['SWITCH_SCENE'], caller =>
    typeof caller?.SwitchScene === 'function' && 'lastScene' in caller);
  const portraits = scene.seatContainer.seatUIs.slice(1).map(ui => ui.otherTopManager).filter(Boolean);
  let popup, windowScope;

  // The native prop player mounts its animation on the router's current
  // scene. The classic client still has the lobby registered there.
  function playProp(goodsId, source, targets) {
    if (!router || !container.ReadyInteractProp) return;
    const origin = router.lastScene;
    try {
      router.lastScene = scene;
      context(() => container.ReadyInteractProp(goodsId, source, targets));
    } finally {
      if (router.lastScene === scene) router.lastScene = origin;
    }
  }

  scene.ged.off('TABLEGAME_INTERACT_PROP_READY', container, container.ReadyInteractProp);

  function releaseWindow() {
    windowScope?.dispose();
    windowScope = popup = undefined;
  }

  function close() {
    const panel = popup;
    if (panel && !panel.destroyed) panel.Close?.();
    releaseWindow();
  }

  function openProps() {
    if (!usable(props) || !input.canUseTableActions() || !manager || !Laya.ClassUtils.getClass(PROP_WINDOW)) return;
    if (popup?.parent) { close(); return; }
    releaseWindow();
    if (manager.GetWindowData(PROP_WINDOW)?.parent) return;
    const panel = manager.GetWindow(PROP_WINDOW, false);
    if (typeof panel?.onSelect !== 'function' || typeof panel.UpdateGoodsID !== 'function') return;
    popup = panel;
    windowScope = new ResourceScope();
    windowScope.patch(panel, 'onSelect', original => function (seat) {
      if (scope.closed || this !== popup || !this.parent || !(this.goodsId > 0) || !input.canUseTableActions()
          || !portraits.some(portrait => portrait.seat === seat)) return;
      context(() => original.call(this, seat));
    });
    windowScope.patch(panel, 'UpdateGoodsID', original => function (...args) {
      if (!scope.closed) context(() => original.apply(this, args));
    });
    context(() => toolbar.onInteractPropClick());
  }

  const click = Laya.Event.CLICK;
  trustee.name = 'poker-live-trustee';
  trustee.ToolTip = '托管';
  trustee.off(click, toolbar, toolbar.onTrusteeshipClick);
  trustee.on(click, scope, input.toggleTrustee);
  if (props) {
    props.name = 'poker-live-props';
    props.ToolTip = '互动道具';
    props.off(click, toolbar, toolbar.onInteractPropClick);
    props.on(click, scope, openProps);
  }
  if (surrender) {
    surrender.name = 'poker-live-surrender';
    surrender.ToolTip = '投降';
    surrender.off(click, toolbar, toolbar.onLoseClick);
    // The toolbar receives the click for its draw children.
    const select = event => {
      if (!usable(surrender) || !input.canSurrender()) return;
      const point = toolbar.globalToLocal(new Laya.Point(event.stageX, event.stageY));
      if (point.x < surrender.x || point.x >= surrender.x + surrender.width
        || point.y < surrender.y || point.y >= surrender.y + surrender.height) return;
      event.stopPropagation?.();
      input.askSurrender();
    };
    toolbar.on(click, scope, select);
    scope.add(() => toolbar.off(click, scope, select));
  }
  for (const button of [toolbar.openBtn, toolbar.closeBtn, toolbar.privilegeBtn]) if (button) button.visible = false;
  for (const portrait of portraits) {
    const mask = portrait.overMask;
    if (!mask || typeof portrait.sendInteractProp !== 'function') continue;
    mask.off(Laya.Event.MOUSE_DOWN, portrait, portrait.longPressSendProp);
    mask.on(Laya.Event.MOUSE_DOWN, scope, () => {
      if (popup?.parent && popup.goodsId > 0 && portrait.oldInteractMaskTex?.visible && input.canUseTableActions()) {
        context(() => portrait.sendInteractProp());
      }
    });
  }
  const proxy = ctx.game.getServerProxy();
  const replies = [
    [PROP_REPLY, ({ Protocol: data } = {}) => {
      if (!popup?.parent || data?.Id !== PROP_REPLY || data.model !== POKER_MODE || data.section !== POKER_SECTION
        || !input.canUseTableActions()) return;
      if (data.result === 0) scene.ged.event('TABLEGAME_INTERACT_PROP_SEND');
      else scene.ged.ShowProtocolError?.(data.Id, data.result);
    }],
    [PROP_BROADCAST, ({ Protocol: data } = {}) => {
      if (data?.Id !== PROP_BROADCAST || !Number.isSafeInteger(data.goodsid) || data.goodsid <= 0
        || !seats.some(ui => ui.Seat.Index === data.seatid) || !input.isCurrentTable()) return;
      const targets = Array.isArray(data.seatInfo) && data.seatInfo.length ? data.seatInfo
        : Array.isArray(data.target) ? data.target.map(seatId => ({ seatId })) : [];
      const actual = targets.filter(row => seats.some(ui => ui.Seat.Index === row?.seatId));
      if (actual.length) playProp(data.goodsid, data.seatid, actual);
    }],
  ];
  if (typeof proxy?.AddEventListener === 'function' && typeof proxy.RemoveEventListener === 'function') {
    for (const [id, listener] of replies) {
      proxy.AddEventListener(id, scope, listener);
      scope.add(() => proxy.RemoveEventListener(id, scope, listener));
    }
  }
  const closed = name => { if (name === PROP_WINDOW) releaseWindow(); };
  scene.ged.on('windowClosed', scope, closed);
  scope.add(() => {
    scene.ged.off('windowClosed', scope, closed);
    close();
  });
  toolbar.name = 'poker-live-toolbar';
  const ownedProps = props?.visible === true;
  const toolbarClip = toolbar.scrollRect?.width;
  return state => {
    const available = !state.ended && input.canUseTableActions();
    toolbar.visible = !state.ended;
    if (!available && popup) close();
    if (trustee.selected !== state.trustee) trustee.selected = state.trustee;
    trustee.enabled = available && !state.trusteePending && !state.pending;
    const label = state.trustee ? '取消托管' : '托管';
    if (trustee.ToolTip !== label) trustee.ToolTip = label;
    const buttons = [];
    if (usable(trustee)) buttons.push({ node: trustee, parent: toolbar, key: trustee.name, title: trustee.ToolTip, invoke: input.toggleTrustee });
    if (props && ownedProps) {
      props.enabled = available;
      if (usable(props)) buttons.push({ node: props, parent: toolbar, key: props.name, title: '互动道具', invoke: openProps });
    }
    if (surrender) {
      const allowed = available && input.canSurrender();
      surrender.visible = surrender.enabled = surrender.mouseEnabled = allowed;
      if (allowed) {
        const last = ownedProps ? props : trustee;
        surrender.x = last.x + last.width + toolbar.btnGap;
        buttons.push({ node: surrender, parent: toolbar, key: surrender.name, title: '投降', invoke: input.askSurrender });
      }
      if (toolbar.scrollRect && Number.isFinite(toolbarClip)) {
        const width = allowed ? Math.max(toolbarClip, surrender.x + surrender.width) : toolbarClip;
        if (toolbar.scrollRect.width !== width) {
          toolbar.scrollRect.width = width;
          toolbar.scrollRect = toolbar.scrollRect;
        }
      }
    }
    return buttons;
  };
}
