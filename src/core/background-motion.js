import { ResourceScope } from './resources.js';

const matteColor = '#242635';

async function skinMatte(window, url, scope) {
  const { document, Image, Laya: { Texture, Texture2D, TextureFormat } } = window;
  if (!url || !document || !Image || !Texture2D || !Texture) return;
  const image = new Image();
  image.src = url;
  await image.decode();
  if (scope.closed) return;
  // Retain only the palette. The original's face and edges must not show
  // through gaps in a moving or transparent rig.
  const colors = document.createElement('canvas');
  colors.width = 6;
  colors.height = 4;
  const source = colors.getContext('2d');
  source.fillStyle = matteColor;
  source.fillRect(0, 0, colors.width, colors.height);
  source.drawImage(image, 0, 0, colors.width, colors.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(colors, 0, 0, canvas.width, canvas.height);
  const bitmap = new Texture2D(canvas.width, canvas.height, TextureFormat?.R8G8B8A8 ?? 1, false);
  let texture;
  scope.add(() => { texture?.destroy(); if (!bitmap.destroyed) bitmap.destroy(); });
  bitmap.loadImageSource(canvas, true);
  texture = new Texture(bitmap);
  return texture;
}

export function createSkinBackgroundMotion({ window, layer, scope, load, ready, fail, imageUrl }) {
  const { Sprite, Rectangle } = window.Laya;
  const root = new Sprite();
  root.name = 'sgs-background-motion';
  root.mouseEnabled = root.mouseChildren = root.visible = false;
  root.zOrder = layer.bgSprite.zOrder || 0;
  let motion, matte, visible = false, width, height;
  scope.add(() => { try { motion?.dispose(); } finally { root.destroy(true); } });
  layer.addChildAt(root, Math.max(0, layer.getChildIndex(layer.bgSprite)) + 1);
  function positionMotion() {
    if (!(width > 0 && height > 0)) return;
    root.graphics.clear();
    root.graphics.drawRect(0, 0, width, height, matteColor);
    if (matte) root.graphics.drawTexture(matte, 0, 0, width, height);
    motion?.fit(0, 0, width, height);
  }
  void skinMatte(window, imageUrl, scope).then(texture => {
    if (!texture || scope.closed) return;
    matte = texture;
    positionMotion();
  }).catch(() => { /* The opaque base still covers the viewport. */ });
  const timer = setTimeout(() => fail('待机动画加载超时'), 20000);
  const cancelTimeout = scope.add(() => clearTimeout(timer));
  void Promise.resolve().then(() => load(scope.signal)).then(loaded => {
    cancelTimeout();
    if (scope.closed) { loaded?.dispose(); return; }
    if (!loaded) throw new Error('这款皮肤的待机动画暂不可用');
    motion = loaded;
    root.addChild(motion.actor);
    positionMotion();
    root.visible = visible;
    motion.setPlaying(visible);
    ready();
  }).catch(error => { if (!scope.closed) fail(error?.message || String(error)); });
  return {
    get loaded() { return Boolean(motion); },
    layout(w, h) {
      if (scope.closed || !(w > 0 && h > 0) || (width === w && height === h)) return;
      width = w; height = h;
      root.size(w, h);
      root.scrollRect = new Rectangle(0, 0, w, h);
      positionMotion();
    },
    show(value) {
      if (scope.closed || visible === value) return;
      visible = value;
      root.visible = visible && Boolean(motion);
      motion?.setPlaying(visible);
    },
  };
}

// Use the client's own effect factories on an isolated receiver. The classes
// are closure-private; no window construction, class-name lookup or shared
// weather/skill effect is needed, including after refreshing inside a battle.
function nativeEffect(layer, spine) {
  // The bone factory was renamed in the 2026111702 game script.
  const method = spine ? layer.SetBgLiveEffect : layer.Ci ?? layer.wt;
  if (typeof method !== 'function') throw new Error('游戏动画加载器尚未就绪');
  let effect, init, play;
  const host = {
    beforeStart() {}, beforeLiveStart() {}, layoutBgEffect() {}, layoutBgLiveEffect() {},
    addChild(node) {
      effect = node; init = node.InitEffect; play = node.playEffect;
      node.InitEffect = node.playEffect = () => {};
    },
  };
  try { Reflect.apply(method, host, ['sgs-background-factory', 0, '', false]); }
  catch (error) { effect?.destroy(); throw error; }
  finally {
    if (effect) {
      effect.InitEffect = init; effect.playEffect = play;
      effect.off?.('start', host, spine ? host.beforeLiveStart : host.beforeStart);
    }
  }
  return effect;
}

function stableBackgroundClip(animations) {
  const names = animations?.map(animation => animation.name).filter(Boolean) ?? [];
  // The native skin player loops the last configured segment. In the skin
  // resources, ChuChang is the entrance and DaiJi is the stable background.
  const idle = names.find(name => name.toLowerCase() === 'daiji')
    ?? names.find(name => name.toLowerCase() === 'play');
  if (idle) return idle;
  const remaining = names.filter(name => !/^(ChuChang|GongJi|HuDong|JiNeng)$/i.test(name));
  return remaining.length === 1 ? remaining[0] : undefined;
}

export function createBackgroundMotion({ window, layer, spec, size, scope, ready, fail }) {
  const laya = window.Laya, root = new laya.Sprite(), players = [];
  let loaded = false, failed = false, visible = false, playing = null, stopAttack;
  root.name = 'sgs-background-motion'; root.mouseEnabled = root.mouseChildren = false;
  root.zOrder = layer.bgSprite.zOrder || 0;
  root.size(size.width, size.height); root.scrollRect = new laya.Rectangle(0, 0, size.width, size.height);
  root.visible = false;
  scope.add(() => root.destroy(true));
  layer.addChildAt(root, Math.max(0, layer.getChildIndex(layer.bgSprite)) + 1);
  const error = value => {
    if (scope.closed || failed) return;
    failed = true; root.visible = false;
    for (const player of players) player.pause();
    fail(value?.message || String(value || '动态资源加载失败'));
  };
  const complete = () => { if (!scope.closed && !failed) { loaded = true; ready(); } };
  const result = {
    get loaded() { return loaded && !failed; },
    stopAttack() { stopAttack?.(); },
    layout(fit) { if (scope.closed || !fit) return; root.pos(fit.x, fit.y); root.scale(fit.scale, fit.scale); },
    show(value) {
      if (scope.closed) return;
      visible = value && !failed; root.visible = visible && loaded;
      if (!visible) stopAttack?.();
      if (playing === visible) return;
      playing = visible;
      for (const player of players) visible ? player.resume() : player.pause();
    },
  };
  scope.timeout(() => { if (!loaded && !failed) error('动态背景加载超时'); }, 20000);
  if (spec.kind === 'video') {
    if (!laya.VideoTexture || !laya.Texture || !window.document) throw new Error('游戏视频纹理尚未就绪');
    const video = window.document.createElement('video');
    video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    const bitmap = new laya.VideoTexture(); bitmap.video = video;
    const texture = new laya.Texture(bitmap);
    scope.add(() => {
      video.pause(); video.removeAttribute('src'); video.load();
      texture.destroy(); bitmap.destroy();
      // The bundled Laya version does not remove destroyed video textures.
      const pool = laya.VideoTexture._videoTexturePool, index = pool?.indexOf(bitmap);
      if (index >= 0) pool.splice(index, 1);
    });
    scope.listen(video, 'error', () => error('视频加载失败：' + (video.error?.message || video.error?.code || '未知错误')));
    scope.listen(video, 'loadeddata', () => {
      if (scope.closed || failed) return;
      bitmap._width = video.videoWidth; bitmap._height = video.videoHeight;
      texture.setTo(bitmap, undefined, video.videoWidth, video.videoHeight);
      root.graphics.clear(); root.graphics.drawTexture(texture, 0, 0, size.width, size.height);
      complete(); result.show(visible);
    });
    players.push({ pause() { bitmap.videoPause(); }, resume() {
      bitmap._needUpdate = true;
      const attempt = video.play(); attempt?.catch(error);
    } });
    // This client's bundled Laya exposes VideoTexture, but its renderer never
    // invokes the static update pool. Update only our playing texture.
    const frame = () => {
      if (!scope.closed && visible && loaded && !failed && video.readyState >= 2) {
        try { bitmap._updateVideoData(); root.repaint(); } catch (e) { error(e); }
      }
    };
    laya.timer.frameLoop(1, root, frame); scope.add(() => laya.timer.clear(root, frame));
    video.src = spec.url; video.load();
  } else {
    const parts = spec.kind === 'bone' ? ['beijing', ...spec.parts] : spec.modern ? ['beijing', 'daiji', 'qianjing'] : ['beijing', 'xingxiang'];
    const idle = new Map();
    let count = 0;
    for (const part of parts) {
      const effect = nativeEffect(layer, spec.kind === 'spine');
      scope.add(() => effect.destroy());
      root.addChild(effect); effect.mouseEnabled = effect.mouseChildren = false;
      if (spec.kind === 'bone') effect.size(size.width, size.height);
      effect.pos(size.width / 2, size.height / 2);
      effect.AutoReleaseRes = true;
      idle.set(part, effect);
      let started = false;
      const partReady = () => { if (++count === parts.length) { complete(); result.show(visible); } };
      const onStart = () => {
        if (scope.closed || failed) return;
        started = true;
        if (!visible) effect.stop();
        partReady();
      };
      effect.once(laya.Event?.START || 'start', effect, onStart);
      effect.once(laya.Event?.ERROR || 'error', effect, error);
      players.push({ pause() { if (started) effect.stop(); }, resume() { if (started) effect.playEffect(); } });
      const url = `${spec.url}/${part}.${spec.kind === 'spine' ? 'json' : 'sk'}`;
      const modernSpine = spec.kind === 'spine' && spec.modern;
      const loadEvent = effect.constructor.SPINE_EFFECT_LOAD_COMPLETE;
      if (modernSpine && part === 'beijing' && loadEvent) {
        // Load the template without displaying its first clip, which is often
        // the entrance. Resolve the loop before starting this player.
        effect.AutoStart = false;
        effect.once(loadEvent, effect, () => {
          if (scope.closed || failed) return;
          const animation = stableBackgroundClip(effect.templet?.skeletonData?.animations);
          if (!animation) {
            effect.visible = false;
            partReady();
            return;
          }
          effect.InitEffect(url, animation, true, false);
          effect.playEffect();
        });
      }
      effect.InitEffect(url, modernSpine ? 'DaiJi' : 'play', true, false);
      effect.playEffect();
    }
    if (spec.kind === 'spine' && spec.modern) {
      const missing = new Set();
      result.playAttack = () => {
        if (scope.closed || !result.loaded || !visible || stopAttack || missing.has('xingxiang')) return;
        const action = new ResourceScope();
        const stop = scope.add(() => {
          stopAttack = null;
          action.dispose();
        });
        stopAttack = stop;
        action.timeout(stop, 20000);
        try {
          for (const [part, idlePart] of [['xingxiang', 'daiji'], ['qianjing', 'qianjing']]) {
            if (missing.has(part)) continue;
            const underneath = idle.get(idlePart);
            const effect = nativeEffect(layer, true);
            let active = true, ended = false;
            const release = action.add(() => {
              active = false;
              underneath.visible = true;
              effect.destroy();
            });
            effect.visible = effect.mouseEnabled = effect.mouseChildren = false;
            effect.AutoReleaseRes = true;
            root.addChildAt(effect, root.getChildIndex(underneath) + 1);
            effect.pos(size.width / 2, size.height / 2);
            const finish = () => {
              ended = true;
              // Native players finish dispatching before their nodes are destroyed.
              Promise.resolve().then(part === 'xingxiang' ? stop : release).catch(stop);
            };
            effect.once(laya.Event?.START || 'start', effect, () => {
              if (!active || ended) return;
              underneath.visible = false;
              effect.visible = true;
            });
            effect.once(laya.Event?.STOPPED || 'stopped', effect, finish);
            effect.once(laya.Event?.ERROR || 'error', effect, finish);
            effect.once(effect.constructor.PLAY_NAME_LOSE || 'PLAY_NAME_LOSE', effect, () => { missing.add(part); finish(); });
            effect.InitEffect(`${spec.url}/${part}.json`, 'GongJi', false, false);
            effect.playEffect();
            if (part === 'xingxiang' && ended) break;
          }
        } catch { stop(); }
      };
    }
  }
  return result;
}
