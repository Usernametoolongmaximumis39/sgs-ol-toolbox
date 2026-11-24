// The borrowed classic table still creates its chat view in replay. Keep the
// message list and trace available, with compose and table interactions closed.
export function attachReadOnlyPokerInteractions(Laya, scope, scene) {
  if (scope.closed || !scene.replayBar) return () => {};
  const click = Laya.Event.CLICK;
  const hidden = new WeakSet();
  const methods = new WeakMap();
  const detached = new WeakSet();

  function hide(node) {
    if (!node || node.destroyed) return;
    if (!hidden.has(node)) {
      hidden.add(node);
      const visible = node.visible;
      const mouseEnabled = node.mouseEnabled;
      scope.add(() => {
        if (node.destroyed) return;
        if (node.visible === false) node.visible = visible;
        if (node.mouseEnabled === false) node.mouseEnabled = mouseEnabled;
      });
    }
    node.visible = false;
    node.mouseEnabled = false;
  }

  function block(owner, method, node, event = click) {
    if (!owner || owner.destroyed) return;
    let blocked = methods.get(owner);
    if (!blocked) methods.set(owner, blocked = new Map());
    if (!blocked.has(method)) {
      const original = owner[method];
      if (typeof original !== 'function') return;
      blocked.set(method, original);
      scope.patch(owner, method, () => () => {});
    }
    const original = blocked.get(method);
    if (!node || node.destroyed || detached.has(node) || typeof node.on !== 'function' || typeof node.off !== 'function') return;
    const handlers = (node.eventDispatcher || node)._events?.[event];
    const entry = (Array.isArray(handlers) ? handlers : [handlers])
      .find(handler => handler?.caller === owner && handler.method === original);
    if (!entry) return;
    const args = entry.args;
    detached.add(node);
    node.off(event, owner, original);
    scope.add(() => {
      if (!node.destroyed && !owner.destroyed) node.on(event, owner, original, args);
    });
  }

  function refresh() {
    if (scope.closed || scene.destroyed) return;
    const chat = scene.chatViewUI;
    if (chat) {
      hide(chat.bottomButtonBar);
      hide(chat.faceListUI);
      hide(chat.bigFaceUI);
      hide(chat.fastViewUI);
      block(chat, 'sendHandler', chat.sendBtn);
      block(chat, 'buyRescriptItem', chat.rescriptBtn);
      block(chat, 'showBigFaceUI', chat.superFaceBtn);
      block(chat, 'selectBigFaceItem', chat.bigFaceUI, 'CHAT_BIGFACE');
      block(chat, 'sendQuickChat', chat.fastViewUI, 'CHAT_QUICK_CHAT');
    }
    const toolbar = scene.gameToolbar;
    if (toolbar) {
      const trustee = toolbar.trusteeshipBtn || toolbar.btn_trusteeship;
      hide(trustee);
      hide(toolbar.interactPropBtn);
      block(toolbar, 'onTrusteeshipClick', trustee);
      block(toolbar, 'onInteractPropClick', toolbar.interactPropBtn);
    }
    const self = scene.SelfSeatUi;
    hide(self?.chatBtn);
    hide(self?.propBtnIn);
    block(self, 'showChatHandler', self?.chatBtn);
    block(self, 'onInteractPropClick', self?.propBtnIn);
    const cancel = self?.cancelTrusteeShip;
    hide(cancel?.cancelBtn);
    // The classic cancel button invokes j() directly. The named method goes
    // through the same callback for keyboard or queued native operations.
    block(cancel, 'j', cancel?.cancelBtn);
    block(cancel, 'CancelTruset');
    block(self, 'onTrusteeshipClick');
  }

  refresh();
  return refresh;
}
