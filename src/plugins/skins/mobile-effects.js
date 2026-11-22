import { openMobileZip } from './mobile-cloud.js';
import { createMobileMotion, readMobileMotionEffects } from './mobile-dynamic.js';
import { read } from './native-model.js';

const sources = new WeakMap();
const descriptions = new WeakMap();
const audioLimit = 4 * 1024 * 1024;

function openMotionArchive(win, entry, signal) {
  if (signal.aborted) return Promise.resolve();
  let source = sources.get(entry.download);
  if (!source) sources.set(entry.download, source = { pending: new Map(), recent: null });
  const path = entry.mobileMotion;
  if (source.recent?.path === path) return Promise.resolve(source.recent.archive);
  let load = source.pending.get(path);
  if (!load || load.controller.signal.aborted) {
    const controller = new win.AbortController();
    load = { controller, users: 0 };
    const current = load;
    current.ready = entry.download(path, { signal: controller.signal }).then(buffer => {
      if (controller.signal.aborted) return;
      const archive = openMobileZip(win, buffer);
      // The same immutable package is used by the preview, seat and alternate forms.
      source.recent = { path, archive };
      return archive;
    }).finally(() => {
      if (source.pending.get(path) === current) source.pending.delete(path);
    });
    source.pending.set(path, load);
  }
  load.users++;
  let abort;
  return new Promise((resolve, reject) => {
    abort = () => resolve();
    signal.addEventListener('abort', abort, { once: true });
    load.ready.then(resolve, reject);
  }).finally(() => {
    signal.removeEventListener('abort', abort);
    if (--load.users === 0 && source.pending.get(path) === load) load.controller.abort();
  });
}

export async function loadMobileEffectSpec(win, entry, signal) {
  if (!entry.mobileMotion || !entry.download || signal.aborted) return;
  if (descriptions.has(entry)) return descriptions.get(entry);
  const archive = await openMotionArchive(win, entry, signal);
  if (!archive || signal.aborted) return;
  const effects = await readMobileMotionEffects(archive, entry.mobileForm);
  if (!signal.aborted) {
    descriptions.set(entry, effects);
    return effects;
  }
}

function effectAudio(win, entry, lifetime, volume) {
  const request = new win.AbortController();
  const playing = new Set();
  function dispose() {
    request.abort();
    lifetime.removeEventListener('abort', dispose);
    for (const release of [...playing]) release();
  }
  lifetime.addEventListener('abort', dispose, { once: true });
  return { dispose, play(path) {
    if (request.signal.aborted || !win.Audio || !(volume() > 0)) return;
    void entry.download(path, { signal: request.signal, limit: audioLimit }).then(bytes => {
      const gain = Math.min(1, volume());
      if (request.signal.aborted || !bytes?.byteLength || !(gain > 0)) return;
      const audio = new win.Audio();
      const url = win.URL.createObjectURL(new win.Blob([bytes], { type: 'audio/mpeg' }));
      const release = () => {
        if (!playing.delete(release)) return;
        audio.pause();
        win.URL.revokeObjectURL(url);
      };
      playing.add(release);
      audio.addEventListener('ended', release, { once: true });
      audio.addEventListener('error', release, { once: true });
      audio.volume = gain;
      audio.src = url;
      void audio.play().catch(release);
    }).catch(() => {});
  } };
}

export async function loadMobileMotion(win, entry, signal, backgroundQuality) {
  const laya = win.Laya ?? win.laya;
  if (!entry.mobileMotion || !entry.download || signal.aborted || !laya?.SpineTemplet || !win.spine?.SkeletonJson ||
      win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const archive = await openMotionArchive(win, entry, signal);
  if (!archive || signal.aborted) return;
  const motion = await createMobileMotion(win, archive, signal, entry.mobileForm, entry.mobileMotionLayout, backgroundQuality);
  if (!motion || signal.aborted) { motion?.dispose(); return; }
  if (backgroundQuality) return motion;
  descriptions.set(entry, motion.effects);
  return { ...motion, playEffect(plan, { kind, viewport, volume, onFinish } = {}) {
    const audio = typeof volume === 'function' ? effectAudio(win, entry, signal, volume) : null;
    let started = false;
    const played = motion.playEffect(plan, { kind, viewport, onFinish(completed) {
      audio?.dispose();
      if (started) onFinish?.(completed);
    }, onSound: audio?.play });
    if (!played) audio?.dispose();
    started = played;
    return played;
  } };
}

export function mobileBattleViewport(ctx, avatar) {
  const laya = ctx.window.Laya ?? ctx.window.laya;
  const host = ctx.game.getScene?.(), stage = laya?.stage;
  if (!host?.addChild || host.destroyed || !host.globalToLocal || !stage?.localToGlobal || !laya.Point || !avatar?.localToGlobal) return;
  const rightWidth = Number(read(() => ctx.game.getClass('GameContext').SceneRightWidth));
  const width = rightWidth > 0 && rightWidth < stage.width ? stage.width - rightWidth : stage.width;
  const toScene = (node, x, y) => host.globalToLocal(node.localToGlobal(new laya.Point(x, y)));
  const start = toScene(stage, 0, 0);
  const end = toScene(stage, width, stage.height);
  const clip = avatar.scrollRect;
  const origin = toScene(avatar, (clip?.x ?? 0) + (clip?.width ?? avatar.width) / 2,
    (clip?.y ?? 0) + (clip?.height ?? avatar.height) / 2);
  return { host, x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y, origin };
}

export async function previewMobileEffect(win, canvas, entry, plan, signal, onStart) {
  const laya = win.Laya ?? win.laya;
  const context = canvas.getContext('2d');
  if (!context || !laya?.Sprite?.prototype.drawToCanvas) throw new Error('当前页面的游戏动画组件不可用。');
  const motion = await loadMobileMotion(win, entry, signal);
  if (signal.aborted) return;
  if (!motion) throw new Error('当前页面无法载入移动版动效。');
  const root = new laya.Sprite();
  const { width, height } = canvas;
  const attack = plan.key === 'mobile:attack';
  const cardHeight = attack ? height * .46 : height, cardWidth = Math.min(width, cardHeight * .85);
  const x = attack ? width - cardWidth - 12 : (width - cardWidth) / 2;
  const y = attack ? height - cardHeight - 12 : 0;
  const viewport = attack ? { host: root, x: 0, y: 0, width, height, origin: { x: x + cardWidth / 2, y: y + cardHeight / 2 } } : undefined;
  const card = root.addChild(new laya.Sprite());
  card.pos(x, y);
  card.scrollRect = new laya.Rectangle(0, 0, cardWidth, cardHeight);
  card.addChild(motion.actor);
  root.scrollRect = new laya.Rectangle(0, 0, width, height);
  motion.fit(0, 0, cardWidth, cardHeight);
  let frameId, renderError, last = -Infinity;
  function draw(time) {
    if (signal.aborted) return;
    try {
      if (time - last >= 32) {
        const frame = root.drawToCanvas(width, height, 0, 0);
        try {
          context.clearRect(0, 0, width, height);
          context.drawImage(frame.source, 0, 0);
        } finally { frame.destroy(); }
        last = time;
      }
      frameId = win.requestAnimationFrame(draw);
    } catch (error) {
      renderError = error;
      motion.stopEffect();
    }
  }
  try {
    await new Promise((resolve, reject) => {
      if (!motion.playEffect(plan, { viewport, onFinish: resolve })) return reject(new Error('未找到可播放的移动版动效。'));
      onStart();
      draw(0);
    });
    if (renderError) throw renderError;
  } finally {
    win.cancelAnimationFrame(frameId);
    motion.dispose();
    root.destroy(true);
  }
}
