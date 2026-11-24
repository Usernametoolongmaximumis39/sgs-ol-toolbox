import { withClassicPokerContext } from './classic-context.js';

const ONLINE_STATE = 600;
const TRUSTEE = 2;

export function attachPokerTrusteeOverlay(win, scope, scene, input) {
  const self = scene.SelfSeatUi;
  const click = win.Laya.Event.CLICK;
  let panel, showing = false, width, height;
  const update = value => withClassicPokerContext(win, scene, () => {
    self.updateSeatState?.({ ID: ONLINE_STATE, Value: value, NeedLayout: true });
  });
  scope.add(() => {
    if (panel && !panel.destroyed) {
      panel.cancelBtn?.off(click, scope, input.toggleTrustee);
      panel.destroy(true);
    }
  });

  return state => {
    const visible = state.trustee && !state.ended;
    if (visible !== showing) {
      showing = visible;
      update(visible ? TRUSTEE : 0);
      if (visible && !panel && self.cancelTrusteeShip?.cancelBtn) {
        panel = self.cancelTrusteeShip;
        panel.name = 'poker-live-trustee-overlay';
        const { cancelBtn } = panel;
        cancelBtn.name = 'poker-live-cancel-trustee';
        cancelBtn.off(click, panel, panel.j);
        cancelBtn.on(click, scope, input.toggleTrustee);
      }
    }
    if (!visible || !panel?.parent) return null;
    if (width !== scene.width || height !== self.height) {
      width = scene.width;
      height = self.height;
      withClassicPokerContext(win, scene, () => panel.OnStageResize());
      panel.y = self.height - panel.height;
    }
    const node = panel.cancelBtn;
    node.enabled = !state.trusteePending && input.canUseTableActions();
    return node.enabled ? { node, parent: panel, key: node.name, title: '取消托管', invoke: input.toggleTrustee } : null;
  };
}
