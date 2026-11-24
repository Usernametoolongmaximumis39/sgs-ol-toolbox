import { ResourceScope } from '../../../core/resources.js';
import { pokerDisplayNames } from '../poker-presentation.js';
import { markPokerReplay } from '../../../shared/poker-replay-mode.js';
import { buildTimeline, pointIndex } from './model.js';
import { NATIVE_SCENE, nativeTableRecording } from './native-recording.js';
import { attachNativeCards } from './native-table-view.js';

function nativeReplayPort({ window: win, game }) {
  if (!win.Laya?.ClassUtils?.getClass?.(NATIVE_SCENE)) return null;
  const origin = game.getScene();
  if (!origin?.SceneName || origin.initialized === false || game.isReplay(origin)) return null;
  const dispatcher = game.getDispatcher();
  const listeners = Object.values(dispatcher?._events || {}).flat().map(listener => listener?.caller).filter(Boolean);
  const router = listeners.find(caller => 'CurrentScene' in caller && typeof caller.SwitchScene === 'function');
  const managers = new Set(listeners.flatMap(caller => caller.constructor?.managerList || []));
  const replay = [...managers].find(manager => typeof manager.ReadyReplay === 'function'
    && typeof manager.ReplayRecord === 'function' && typeof manager.StopReplay === 'function'
    && typeof manager.ClearReplay === 'function');
  if (!router || !replay || replay.IsReplaying || replay.Recording) return null;
  const soundSettings = [...managers].find(manager => typeof manager.SoundSets?.GeneralVol === 'number')?.SoundSets;
  return { router, replay, origin, soundSettings };
}

function conceal(scope, element) {
  if (!element) return;
  const value = element.style.getPropertyValue('visibility');
  const priority = element.style.getPropertyPriority('visibility');
  element.style.setProperty('visibility', 'hidden', 'important');
  scope.add(() => {
    if (element.style.getPropertyValue('visibility') === 'hidden' && element.style.getPropertyPriority('visibility') === 'important') {
      element.style.setProperty('visibility', value, priority);
    }
  });
}

function scopedProperty(scope, target, key, get, set) {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, get, set });
  scope.add(() => {
    if (Object.getOwnPropertyDescriptor(target, key)?.get !== get) return;
    if (previous) Object.defineProperty(target, key, previous);
    else delete target[key];
  });
}

function replaceClick(scope, dispatcher, event, receiver, original, handler) {
  dispatcher.off(event, receiver, original);
  dispatcher.on(event, receiver, handler);
  scope.add(() => {
    if (dispatcher.destroyed) return;
    dispatcher.off(event, receiver, handler);
    dispatcher.on(event, receiver, original);
  });
}

export function openNativeReplay(ctx, record, { beforePlay, onClose, onFailure, sameSession, perspective }) {
  const port = nativeReplayPort(ctx);
  if (!port) throw new Error('经典版原生录像牌桌暂未就绪，请返回大厅后重试。');
  if (beforePlay?.() === false) return false;
  const { replay, router, origin, soundSettings } = port;
  const originName = origin.SceneName;
  const originData = origin.SceneData;
  const { window: win, document: doc, game } = ctx;
  const scope = new ResourceScope();
  const originalOptimization = replay.SpeedOptimized;
  const names = pokerDisplayNames(game, record.seats);
  const seatIds = record.seats.map(seat => seat.id);
  const slotsFor = seat => {
    const offset = Math.max(0, seatIds.indexOf(seat));
    return [...seatIds.slice(offset), ...seatIds.slice(0, offset)];
  };
  let slots = slotsFor(perspective);
  const timelines = new Map();
  let time = 0;
  let openingTime = 0;
  let showOpening = true;
  let speed = 1;
  let playing = true;
  let started = false;
  let lastTick = win.performance.now();
  let lastDraw = null;
  let lastSize = null;
  let mountedScene;
  let view;

  function ownsScene() {
    if (!sameSession()) return false;
    const scene = router.CurrentScene;
    if (scene && scene !== origin && scene !== mountedScene && (mountedScene || scene.SceneName !== NATIVE_SCENE)) return false;
    const next = router.nextScene;
    return !next || next === scene || next.SceneName === NATIVE_SCENE;
  }

  const close = ctx.scope.add(() => {
    let returned = false;
    let expectedScene;
    scope.dispose();
    try {
      if (started) {
        const canReturn = ownsScene();
        replay.ClearReplay();
        replay.SpeedOptimized = originalOptimization;
        replay.ClearSceneDataBeforePlay?.();
        if (canReturn) {
          const switching = router.nextScene?.SceneName === NATIVE_SCENE;
          if (router.CurrentScene !== origin || switching || origin.destroyed) {
            router.SwitchScene(originName, originData, Boolean(origin.destroyed || switching));
          }
          returned = true;
          expectedScene = [router.nextScene, router.CurrentScene].find(scene => scene?.SceneName === originName);
        }
      }
    } catch (error) {
      onFailure(error);
    } finally {
      onClose({ returned, expectedScene });
    }
  });

  function setPlaying(value) {
    playing = value && record.duration > 0;
    if (!playing) view?.stopVoice();
    lastTick = win.performance.now();
    const bar = mountedScene?.replayBar;
    if (bar && bar.playState !== playing) {
      bar.playState = playing;
      bar.updateBtnSkin(bar.playBtn, bar.playRes);
    }
    mountedScene?.topMenu?.udpateGameTime?.();
  }

  function timeline() {
    const perspective = slots[0];
    if (!timelines.has(perspective)) timelines.set(perspective, buildTimeline(record, perspective));
    return timelines.get(perspective);
  }

  function draw(force = false, advancing = false) {
    if (!view) return;
    const { points, initial, log, opening } = timeline();
    const index = pointIndex(points, time);
    const step = showOpening ? opening.find(item => openingTime < item.end) : null;
    const state = step?.state || points[index]?.state || initial;
    const size = view.size();
    const refresh = force || lastSize !== size;
    if (refresh || lastDraw !== state) {
      const animate = advancing && !refresh;
      const actions = animate ? log.slice(lastDraw?.logLength ?? 0, state.logLength) : [];
      view.draw(state, slots, log, { animate, refresh, actions, opening: step?.kind, speed });
      lastDraw = state;
      lastSize = view.size();
    }
    mountedScene.replayBar.progressUpdate(time);
  }

  function seek(value, restartOpening = false) {
    time = Math.min(record.duration, Math.max(0, value));
    lastTick = win.performance.now();
    showOpening = restartOpening;
    openingTime = 0;
    if (time === record.duration) setPlaying(false);
    draw(true);
    mountedScene?.topMenu?.udpateGameTime?.();
  }

  function projectNativeControls() {
    scopedProperty(scope, replay, 'PlayingTimer', () => time);
    scopedProperty(scope, replay, 'TotalTime', () => record.duration / 1000);
    scopedProperty(scope, replay, 'CanJumpRecord', () => true);
    scopedProperty(scope, replay, 'PlayReplayingState', () => playing ? 1 : time >= record.duration ? 0 : 2);
    scopedProperty(scope, replay, 'Speed', () => speed, value => {
      if ([0.5, 1, 2, 4, 8].includes(value)) speed = value;
    });
    scope.patch(replay, 'Pause', () => () => setPlaying(false));
    scope.patch(replay, 'Continue', () => () => {
      if (time === record.duration) seek(0, true);
      setPlaying(true);
    });
  }

  function attachControls(scene) {
    const click = win.Laya.Event.CLICK;
    const bar = scene.replayBar;
    replaceClick(scope, bar.probar, 'slider_mousedown', bar, bar.onProgressChange,
      () => seek(record.duration * bar.probar.Value / 100));
    replaceClick(scope, bar.replayBtn, click, bar, bar.onClickReplayBtn, () => {
      bar.onClickSpeedItem(1);
      seek(0, true);
      setPlaying(true);
    });
    for (const seat of scene.seatContainer.seatUIs) {
      const menu = seat.otherTopManager;
      const original = menu?.onChangeReplayOnClick;
      if (typeof original !== 'function') continue;
      const choose = () => {
        const player = slots[seat.Seat.Index];
        if (player === undefined) return;
        slots = slotsFor(player);
        draw(true);
      };
      const existing = menu.changeReplayBtn;
      scope.patch(menu, 'onChangeReplayOnClick', () => choose);
      const wrapper = menu.onChangeReplayOnClick;
      if (existing) replaceClick(scope, existing, click, menu, original, wrapper);
      else scope.add(() => {
        const button = menu.changeReplayBtn;
        if (!button || button.destroyed) return;
        button.off(click, menu, wrapper);
        button.on(click, menu, original);
      });
    }
    bar.uniformState = false;
    replay.SpeedOptimized = false;
    bar.updateBtnSkin(bar.uniformBtn, bar.uniformRes);
  }

  function fail(error) {
    if (scope.closed) return;
    close();
    onFailure(error);
  }

  try {
    const bytes = nativeTableRecording(record);
    markPokerReplay(scope, doc);
    void names.loadSkills(scope.signal)?.then(() => { if (!scope.closed) draw(true); }).catch(fail);
    projectNativeControls();
    replay.SaveCurSceneDataBeforePlay?.();
    started = true;
    if (!replay.ReadyReplay(bytes, true, '', false)) throw new Error('经典版原生播放器未能打开牌桌');
    replay.StopReplay();
    conceal(scope, doc.querySelector('[data-sgs-toolbox="core"]'));
    const inputPanel = doc.getElementById('inputDiv');
    if (inputPanel?.contains(doc.getElementById('inputFile'))) conceal(scope, inputPanel);
    scope.listen(win, 'keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!view?.closePreview()) close();
    }, true);

    const openedAt = win.performance.now();
    scope.interval(() => {
      try {
        const now = win.performance.now();
        const scene = router.CurrentScene;
        if (!ownsScene()) {
          close();
          return;
        }
        if (!view) {
          const bar = scene?.replayBar;
          if (scene?.SceneName !== NATIVE_SCENE || !scene.initialized || !bar?.probar) {
            if (now - openedAt > 20000) fail(new Error('经典版原生牌桌加载超时'));
            return;
          }
          if (!scene.SelfSeatUi?.cardContainer || !scene.stackCardContainer || scene.seatContainer?.seatUIs?.length !== 3) {
            fail(new Error('当前经典版的原生牌桌布局无法识别'));
            return;
          }
          mountedScene = scene;
          view = attachNativeCards(ctx, scope, scene, names, soundSettings);
          scope.patch(scene, 'confirmQuitReplay', () => close);
          attachControls(scene);
          lastTick = now;
          draw(true);
        }
        if (mountedScene.destroyed || (scene && scene !== mountedScene)) {
          close();
          return;
        }
        const openingReady = view.openingReady();
        const previousTime = time;
        const previousOpening = openingTime;
        if (playing) {
          let delta = (now - lastTick) * speed;
          const openingEnd = showOpening ? timeline().opening.at(-1)?.end ?? 0 : 0;
          if (openingTime < openingEnd) {
            if (!openingReady) delta = 0;
            const elapsed = Math.min(delta, openingEnd - openingTime);
            openingTime += elapsed;
            delta -= elapsed;
          }
          if (openingTime >= openingEnd && replay.SpeedOptimized) {
            const { points } = timeline();
            const next = points[pointIndex(points, time) + 1]?.time ?? record.duration;
            time = Math.max(time, next - 1000);
          }
          time = Math.min(record.duration, time + delta);
          if (time >= record.duration) setPlaying(false);
          else if (Math.floor(time / 1000) !== Math.floor(previousTime / 1000)) mountedScene.topMenu?.udpateGameTime?.();
        }
        lastTick = now;
        draw(false, time > previousTime || openingTime > previousOpening);
      } catch (error) { fail(error); }
    }, 50);
    scope.add(ctx.ui.nativeTheme.watch(() => draw(true)));
    return true;
  } catch (error) {
    close();
    throw error;
  }
}
