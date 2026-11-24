import { ResourceScope } from '../../../core/resources.js';
import { replayPopupManager } from '../replay/native-opening.js';
import { withClassicPokerContext } from './classic-context.js';

const SKINS = 'ChangeSkinWindow';

export function attachPokerSkins(ctx, scope, scene, input) {
  const { window: win } = ctx;
  const owner = scene.SelfSeatUi.otherTopManager;
  const manager = replayPopupManager(scene);
  const getSkins = () => ctx.native.manager?.('GeneralSkinManager', 'ClientGeneralSkinRep',
    candidate => typeof candidate?.GetSelfUsingSkinID === 'function');
  const event = win.Laya.Event.CLICK;
  let button, general, available, panel, windowScope;
  const context = run => withClassicPokerContext(win, scene, run);

  function release() {
    windowScope?.dispose();
    windowScope = panel = undefined;
  }

  function close() {
    if (panel && !panel.destroyed) panel.Close();
    release();
  }

  function open(id) {
    if (!id || !available || !input.canUseTableActions() || panel || manager?.GetWindowData(SKINS)?.parent
        || !win.Laya.ClassUtils?.getClass?.(SKINS)) return;
    const popup = manager?.GetWindow(SKINS, false);
    if (typeof popup?.enterWindow !== 'function') return;
    panel = popup;
    windowScope = new ResourceScope();
    windowScope.timeout(() => { if (!popup.parent) close(); }, 6000);
    windowScope.patch(popup, 'enterWindow', original => function (...args) {
      if (!available || !input.canUseTableActions()) { close(); return; }
      context(() => original.apply(this, args));
      const view = this.selectView;
      if (panel === this && typeof view?.closeSelectSure === 'function') {
        windowScope.patch(view, 'closeSelectSure', stock => function (...args) {
          if (input.canUseTableActions()) context(() => stock.apply(this, args));
        });
      }
    });
    context(() => scene.ged.A(SKINS, id));
  }

  const openSeatSkin = () => { if (button?.visible) open(owner.seat?.GeneralId); };
  const closed = name => { if (name === SKINS) release(); };
  scene.ged?.on?.('windowClosed', scope, closed);
  scope.add(() => {
    scene.ged?.off?.('windowClosed', scope, closed);
    close();
    button?.off(event, scope, openSeatSkin);
  });

  return {
    open,
    hasSkin: id => getSkins()?.HasCanUseGeneralSkin?.(id),
    saved(id) {
      const skins = getSkins();
      const skin = skins?.GetSelfUsingSkinID(id) || 0;
      const dynamic = skin > 0 && skins.GetSkinListBySkinID?.(skin)?.some(item => item.IsUpgrade > 0 && item.IsUseStatic <= 0);
      return { id: skin, dynamic: Boolean(dynamic), type: 1 };
    },
    draw(state) {
      const allowed = !state.decision || state.decision.kind === 'bid' || state.decision.kind === 'general';
      available = !state.ended && allowed && input.canUseTableActions();
      const id = owner?.seat?.GeneralId;
      if (available && id && general !== id) {
        general = id;
        if (owner.skinBtn) owner.skinBtn.visible = false;
        context(() => owner.OnSomeTextureOver?.());
      }
      if (owner?.skinBtn && owner.skinBtn !== button) {
        button?.off(event, scope, openSeatSkin);
        button = owner.skinBtn;
        button.off(event, owner, owner.onSKinClick);
        button.on(event, scope, openSeatSkin);
        button.name = 'poker-live-skins';
        button.ToolTip = '换肤';
      }
      if (!available && panel) close();
      return available && id && button?.visible
        ? { node: button, parent: owner, key: button.name, title: '换肤', invoke: openSeatSkin } : null;
    },
  };
}
