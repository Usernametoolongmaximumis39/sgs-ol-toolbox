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
  const savedInTable = new Map();
  let button, general, available, panel, windowScope;
  const context = run => withClassicPokerContext(win, scene, run);

  for (const ui of scene.seatContainer.seatUIs) {
    const avatar = ui.seatAvatar;
    if (typeof avatar?.SetGeneralCard !== 'function') continue;
    scope.patch(avatar, 'SetGeneralCard', stock => function (card, skin, ...args) {
      const seat = ui.Seat;
      if (skin || !card || card !== seat?.General || !(seat.SkinID > 0)) return stock.call(this, card, skin, ...args);
      // A native general redraw can omit the second argument and repaint the
      // original portrait without changing the selected skin on the seat.
      return context(() => {
        const result = stock.call(this, card, seat.SkinID, ...args);
        if (card.IsDynamic) ui.General_SkinChanged?.(null);
        return result;
      });
    });
  }

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
      const view = this.selectView;
      if (typeof view?.initUsingSKinID === 'function') {
        windowScope.patch(view, 'initUsingSKinID', stock => function (general) {
          stock.call(this, general);
          const seat = scene.SelfSeatUi.Seat;
          if (seat?.GeneralId === general && seat.SkinID >= 0) this.usingSkinID = seat.SkinID;
        });
      }
      if (typeof view?.closeSelectSure === 'function') {
        windowScope.patch(view, 'closeSelectSure', stock => function (...args) {
          if (!input.canUseTableActions()) return;
          // The stock view calls this while destroying the popup after a click.
          // Track the actual selection before the native request, not a skin lookup.
          if (this.clickCheck) input.expectSkin?.(id, this.closeSelectSkinId);
          return context(() => stock.apply(this, args));
        });
      }
      return context(() => original.apply(this, args));
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
      // The running classic room owns the saved-default cache. A late lookup
      // can change it while the borrowed table is still displaying this round.
      if (savedInTable.has(id)) return savedInTable.get(id);
      const skins = getSkins();
      const skin = skins?.GetSelfUsingSkinID(id) || 0;
      const dynamic = skin > 0 && skins.GetSkinListBySkinID?.(skin)?.some(item => item.IsUpgrade > 0 && item.IsUseStatic <= 0);
      const saved = { id: skin, dynamic: Boolean(dynamic), type: 1 };
      if (skin > 0) savedInTable.set(id, saved);
      return saved;
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
