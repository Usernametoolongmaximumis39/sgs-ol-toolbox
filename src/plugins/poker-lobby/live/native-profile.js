import { findNativeListenerOwner } from '../../../shared/native-manager.js';

const IN_GAME_MENU = 3;

export function attachClassicPokerProfiles(ctx, scope, scene, seats, tableId, isCurrentTable) {
  const { Laya } = ctx.window;
  const host = findNativeListenerOwner(scene.ged, ['SHOW_TEXT_PROMPT', 'SHOW_COMFIRM_TIPS_EVENT'], caller =>
    typeof caller?.ShowUserOptMenu === 'function' && typeof caller.HideUserOptMenu === 'function');
  const Button = scene.topMenu?.backBtn?.constructor;
  if (!host || typeof Button?.prototype?.InitSkin !== 'function') {
    return { buttons: () => [], menuButtons: () => null };
  }
  const click = Laya.Event.CLICK;
  let openProfile;

  function currentMenu() {
    const menu = host.optMenu;
    return openProfile && menu?.parent === host && menu.useType === IN_GAME_MENU
      && menu.userId === openProfile.id && menu.tableId === tableId ? menu : null;
  }

  function closeMenu() {
    if (currentMenu()) {
      Laya.timer.clear(host, host.addStageClick);
      host.HideUserOptMenu();
    }
    openProfile = undefined;
  }

  const profiles = seats.flatMap(ui => {
    const seat = ui.Seat;
    const owner = ui.otherTopManager;
    const id = seat.PlayerInfo?.ClientId;
    const nickname = seat.PlayerInfo?.Nickname;
    const parent = owner?.textSprite;
    if (seat.IsSelf || seat.IsRobot || !Number.isSafeInteger(id) || id <= 0 || !nickname || !parent) return [];
    const title = nickname;
    const hidden = () => {
      const game = ctx.game.getClass('GameContext');
      return owner.playerNameVisible === false || game?.IsFilterUserInfo || game?.IsFilterDFMatchUserInfo;
    };
    const node = new Button();
    node.InitSkin('seat_info_icon', 'seat_info_icon', 'seat_info_icon');
    node.name = `poker-live-profile-${seat.Index}`;
    node.ToolTip = title;
    node.visible = false;
    parent.addChild(node);
    const invoke = () => {
      if (scope.closed || !node.visible || hidden() || !isCurrentTable()) return;
      host.ShowUserOptMenu(node, id, nickname, IN_GAME_MENU, 0, null, '', tableId, seat.Index);
      openProfile = { id, hidden };
    };
    node.on(click, scope, invoke);
    scope.add(() => {
      if (node.destroyed) return;
      node.ToolTip = null;
      node.destroy();
    });
    return [{ ui, node, title, key: node.name, invoke, hidden }];
  });
  scope.add(closeMenu);

  return {
    buttons() {
      if (openProfile?.hidden()) closeMenu();
      return profiles.filter(({ ui, node, hidden }) => {
        const flag = ui.figureManager?.currentFigure;
        const anchor = flag?.globalPoint;
        node.visible = Boolean(anchor && flag.visible && !hidden());
        if (!node.visible) return false;
        const point = node.parent.globalToLocal(anchor);
        node.pos(Math.round(point.x + (flag.width - node.width) / 2), Math.round(point.y + flag.height + 2));
        return true;
      });
    },
    menuButtons() {
      if (openProfile && (!isCurrentTable() || openProfile.hidden())) closeMenu();
      const menu = currentMenu();
      if (!menu) return null;
      return (menu.showBtnList || []).flatMap((node, index) => node.visible && node.mouseEnabled
        ? [{ node, parent: menu, key: `poker-live-profile-action-${index}`, title: node.label, invoke: () => node.event(click, [node]) }]
        : []);
    },
  };
}
