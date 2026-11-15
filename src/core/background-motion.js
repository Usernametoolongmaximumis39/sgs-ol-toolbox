// Use the client's own effect factories on an isolated receiver. The classes
// are closure-private; no window construction, class-name lookup or shared
// weather/skill effect is needed, including after refreshing inside a battle.
function nativeEffect(layer, spine) {
  const method = spine ? layer.SetBgLiveEffect : layer.wt;
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

export function createBackgroundMotion({ window, layer, spec, size, scope, ready, fail }) {
  const laya = window.Laya, root = new laya.Sprite(), players = [];
  let loaded = false, failed = false, visible = false, playing = null;
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
    layout(fit) { if (scope.closed || !fit) return; root.pos(fit.x, fit.y); root.scale(fit.scale, fit.scale); },
    show(value) {
      if (scope.closed) return;
      visible = value && !failed; root.visible = visible && loaded;
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
    let count = 0;
    for (const part of parts) {
      const effect = nativeEffect(layer, spec.kind === 'spine');
      scope.add(() => effect.destroy());
      root.addChild(effect); effect.mouseEnabled = effect.mouseChildren = false;
      if (spec.kind === 'bone') effect.size(size.width, size.height);
      effect.pos(size.width / 2, size.height / 2);
      effect.AutoReleaseRes = true;
      const onStart = () => { if (++count === parts.length) { complete(); result.show(visible); } };
      effect.once(laya.Event?.START || 'start', effect, onStart);
      effect.once(laya.Event?.ERROR || 'error', effect, error);
      const animation = spec.modern && part !== 'beijing' ? 'DaiJi' : spec.modern ? 0 : 'play';
      effect.InitEffect(`${spec.url}/${part}.${spec.kind === 'spine' ? 'json' : 'sk'}`, animation, true, false);
      effect.playEffect();
      players.push({ pause() { effect.stop(); }, resume() { effect.playEffect(); } });
    }
  }
  return result;
}
