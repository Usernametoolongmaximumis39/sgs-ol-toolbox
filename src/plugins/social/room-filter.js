const LABEL = '只显示无密码房';

export function installRoomFilter(ctx) {
  let enabled = ctx.settings.get('onlyPasswordFreeRooms', false) === true;
  let mounted;

  function unmount() {
    mounted?.();
    mounted = undefined;
  }

  let currentView;
  let currentWait;
  function tick() {
    const scene = ctx.game.getScene();
    const view = scene?.SceneName === 'HallScene' ? scene.roomListView : null;
    const wait = view?.isWaitCheckBox;
    if (mounted && view === currentView && wait === currentWait && !view.destroyed && !wait.destroyed) return;
    unmount();
    if (!wait || wait.destroyed || view.destroyed || wait.parent !== view || typeof view.ReloadRoomList !== 'function') return;

    const change = ctx.window.Laya?.Event?.CHANGE;
    if (!change) return;
    const toggle = new wait.constructor(LABEL);
    toggle.selected = enabled;
    view.addChild(toggle);
    let source = view.tableDataList;
    let filtered = false;

    function layout() {
      toggle.visible = wait.visible;
      toggle.pos(wait.x + wait.width + 12, wait.y);
    }
    layout();

    const releaseReload = ctx.scope.patch(view, 'ReloadRoomList', original => function (rows, ...args) {
      source = rows;
      filtered = enabled && Array.isArray(rows);
      const visible = filtered ? rows.filter(room => !(room?.HasPass || room?.hasPass)) : rows;
      return original.call(this, visible, ...args);
    });
    const releaseResize = typeof view.OnStageResize === 'function' && ctx.scope.patch(view, 'OnStageResize', original => function (...args) {
      const result = original.apply(this, args);
      layout();
      return result;
    });
    function onChange() {
      enabled = toggle.selected === true;
      if (Array.isArray(source)) view.ReloadRoomList(source);
      ctx.settings.set('onlyPasswordFreeRooms', enabled);
    }
    toggle.on(change, view, onChange);
    currentView = view;
    currentWait = wait;
    mounted = () => {
      releaseReload();
      if (releaseResize) releaseResize();
      if (!toggle.destroyed) {
        toggle.off(change, view, onChange);
        toggle.destroy(true);
      }
      if (filtered && !view.destroyed) view.ReloadRoomList(source);
    };
    if (enabled && Array.isArray(source)) view.ReloadRoomList(source);
  }

  ctx.scope.add(unmount);
  ctx.scope.interval(tick, 400);
  tick();
}
