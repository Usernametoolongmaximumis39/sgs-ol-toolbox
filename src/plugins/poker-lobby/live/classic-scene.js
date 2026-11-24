import { POKER_TABLE_SCENE } from '../../../shared/poker-table-mode.js';
import { findNativeListenerOwner } from '../../../shared/native-manager.js';
import { read } from '../../../shared/safe-read.js';
import { NATIVE_SCENE } from '../replay/native-recording.js';
import { nativePokerSoundSettings } from '../replay/native-play-audio.js';
import { withClassicPokerContext } from './classic-context.js';

const LOAD_TIMEOUT = 15000;
const DEFAULT_WALLPAPER = 24;

function initSeats(Laya, scene, match) {
  const rows = match.seats.map(({ id, clientId }) => ({ SeatID: id, ClientID: clientId }));
  const models = match.seatModels || match.room.createPlayerSeat(rows);
  const order = [...match.seats].sort((a, b) => a.id - b.id);
  const self = order.findIndex(row => row.id === match.selfSeat);
  const slots = [...order.slice(self), ...order.slice(0, self)];
  const container = scene.seatContainer;
  for (const [index, { id, clientId }] of slots.entries()) {
    const model = models[id];
    if (!model?.IsFull || String(model.PlayerInfo?.ClientId) !== String(clientId)) {
      throw new Error('原生牌桌座位尚未就绪');
    }
    // Native room seats may be reset again when a pending table starts.
    const seat = new model.constructor();
    seat.Index = id;
    seat.PlayerInfo = model.PlayerInfo;
    seat.ViewId = seat.FixedViewId = index + 1;
    Object.defineProperty(seat, 'IsSelf', { value: id === match.selfSeat });
    const ui = index === 0 ? container.SelfSeatUi : container.createTableSeatUI();
    if (index > 0) container.seatUIs.push(ui);
    container.seatDict.addNumberKey(id, ui);
    ui.Seat = seat;
    ui.SetHpVisible(false);
    // The ordinary seat can send trustee requests on pointer movement.
    if (index === 0) {
      Laya.stage.off(Laya.Event.MOUSE_MOVE, ui, ui.stageMoveHandler);
      ui.clearTimeOutStatus?.();
    }
    for (const key of ['chatBtn', 'propBtnIn', 'addFriendBtn', 'changeReplayBtn']) {
      if (ui[key]) ui[key].visible = false;
    }
  }
  container.LayoutSeats();
}

function useWallpaper(scope, scene, layer) {
  const background = layer.parent?._children?.find(child => child.layerOrder === 1 && child.Bg);
  if (!background || !scene.SetWallPaperById) return;
  const { Bg: image, isWideBg, bgRectMask } = background;
  const previous = image.skin;
  const visible = bgRectMask?.visible;
  scene.SetWallPaperById(DEFAULT_WALLPAPER);
  const mounted = image.skin;
  if (mounted === previous) return;
  scope.add(() => {
    if (image.destroyed || image.skin !== mounted) return;
    background.tt(previous, false, isWideBg);
    if (bgRectMask && background.bgRectMask === bgRectMask) bgRectMask.visible = visible;
  });
}

function hideOrigin(origin, layer) {
  const visible = origin.visible;
  const own = Object.getOwnPropertyDescriptor(origin, 'visible');
  const hidden = () => false;
  origin.visible = false;
  // The lobby still receives native room events while the borrowed table is mounted.
  if (own?.configurable || !own && Object.isExtensible(origin)) {
    Object.defineProperty(origin, 'visible', { configurable: true, get: hidden, set() {} });
  }
  return () => {
    if (Object.getOwnPropertyDescriptor(origin, 'visible')?.get === hidden) {
      if (own) Object.defineProperty(origin, 'visible', own);
      else delete origin.visible;
    }
    if (!origin.destroyed && origin.parent === layer && origin.visible === false) origin.visible = visible;
  };
}

function playTableMusic(win, scope, scene, origin) {
  const router = findNativeListenerOwner(scene.ged, ['SWITCH_SCENE'], caller =>
    typeof caller?.SwitchScene === 'function' && 'lastScene' in caller);
  if (!router || typeof scene.PlayMainBGM !== 'function') return;
  const play = () => {
    if (router.lastScene !== origin || scope.closed) return;
    router.lastScene = scene;
    try { read(() => withClassicPokerContext(win, scene, () => scene.PlayMainBGM())); }
    finally { if (router.lastScene === scene) router.lastScene = origin; }
  };
  const event = win.Laya.Event.CLICK;
  const settings = nativePokerSoundSettings(scene.ged);
  if (settings) {
    const preferences = () => [settings.BgMusicName, settings.BgClose, settings.MainClose, settings.BgVol, settings.MainVol].join('|');
    let previous = preferences();
    scope.interval(() => {
      const current = preferences();
      if (current === previous) return;
      previous = current;
      play();
    }, 250);
  }
  win.Laya.stage.once(event, scope, play);
  scene.ged.on('windowClosed', scope, play);
  scope.add(() => {
    win.Laya.stage.off(event, scope, play);
    scene.ged.off('windowClosed', scope, play);
    if (router.lastScene === origin && !origin.destroyed) read(() => origin.PlayMainBGM?.());
  });
  play();
}

export function openClassicPokerScene(ctx, scope, origin, match, active, ready, failed, notBefore) {
  const { Laya, RES } = ctx.window;
  const Table = ctx.game.getClass(NATIVE_SCENE);
  if (!Table?.prototype?.createSeatUIContainer || !RES?.IsGroupLoaded || !RES.LoadGroup
    || typeof match.room.createPlayerSeat !== 'function') {
    throw new Error('当前客户端没有可用的原生斗地主牌桌');
  }
  const layer = origin.parent;
  let restoreOrigin;

  // Mount the native table's display components without running the ordinary
  // game's manager, scene entry, replay or network listeners.
  class PokerBoard extends Table {
    Init() {}
    hideRightPanel() {}
  }

  const scene = new PokerBoard();
  scene.name = scene.SceneName = POKER_TABLE_SCENE;
  scene.proxy = match.proxy;
  scene.mouseEnabled = true;
  scene.mouseThrough = true;
  scope.add(() => {
    scene.visible = false;
    try {
      const topMenu = scene.topMenu;
      if (!topMenu?.destroyed && topMenu?.parent === scene) {
        topMenu.removeSelf();
        if (!origin.destroyed) origin.addChild(topMenu);
      }
    } finally {
      try {
        if (!scene.destroyed) {
          // The stock teardown clears the room, replay and other global windows.
          scene.removeSelf?.();
          Laya.timer.clearAll(scene);
          Laya.Sprite.prototype.destroy.call(scene, true);
        }
      } finally { restoreOrigin?.(); }
    }
  });

  const mount = () => {
    if (!active()) return;
    if (origin.destroyed || origin.parent !== layer) {
      failed(new Error('原生牌桌入口已关闭'));
      return;
    }
    try {
      scene.createSeatUIContainer();
      initSeats(Laya, scene, match);
      if (origin.topMenu?.parent === origin) {
        scene.topMenu = origin.topMenu;
        scene.addChild(scene.topMenu);
      }
      withClassicPokerContext(ctx.window, scene, () => scene.createRightView());
      const trace = scene.rightView?.traceArea;
      // The native trace renders this table's own confirmed events.
      trace?.removeEventListener?.();
      trace?.ClearItem?.();
      scene.initialized = true;
      for (const key of ['chatViewUI', 'chatDragSprite', 'rightPanelToggleBtn']) if (scene[key]) scene[key].visible = false;
      if (scene.topMenu?.areaServerLabel) {
        const title = scene.topMenu.areaServerLabel;
        const previous = title.text;
        title.text = '三国斗地主';
        scope.add(() => { if (title.text === '三国斗地主') title.text = previous; });
      }
      layer.addChild(scene);
      scene.OnStageResize();
      useWallpaper(scope, scene, layer);
      restoreOrigin = hideOrigin(origin, layer);
      ready(scene);
      if (!scope.closed) playTableMusic(ctx.window, scope, scene, origin);
    } catch (error) { failed(error); }
  };

  const mountWhenReady = () => {
    const delay = notBefore ? Math.ceil(notBefore - ctx.window.performance.now()) : 0;
    if (delay > 0) scope.timeout(mount, delay);
    else mount();
  };
  const groups = scene.ResNames.filter(name => !RES.IsGroupLoaded(name));
  if (!groups.length) mountWhenReady();
  else {
    const events = new Set(groups);
    const removeListener = scope.add(() => {
      RES.RemoveEventListener('groupComplete', scope, loaded);
      RES.RemoveEventListener('groupLoadError', scope, loadError);
    });
    function loaded({ groupName }) {
      if (scope.closed || !events.delete(groupName) || events.size) return;
      removeListener();
      mountWhenReady();
    }
    function loadError({ groupName }) {
      if (!scope.closed && events.has(groupName)) failed(new Error(`原生牌桌资源加载失败（${groupName}）`));
    }
    RES.AddEventListener('groupComplete', scope, loaded);
    RES.AddEventListener('groupLoadError', scope, loadError);
    scope.timeout(() => { if (events.size) failed(new Error('原生牌桌资源加载超时')); }, LOAD_TIMEOUT);
    for (const name of groups) RES.LoadGroup(name);
  }
  return scene;
}
