import { animationBounds, createEffectArmature, loadYjcmEffectTemplate } from './yjcm-motion.js';

export async function previewYjcmEffect(win, canvas, spec, plan, signal, onStart) {
  if (signal.aborted) return;
  const laya = win.Laya ?? win.laya;
  const context = canvas.getContext('2d');
  if (!context || !laya?.Sprite?.prototype.drawToCanvas) throw new Error('当前页面的游戏动画组件不可用。');
  const loads = new Map();
  const templates = new Map();
  function load(clip, shared = false) {
    if (!clip) return;
    const key = (shared ? '/' : spec.resource + '/') + clip.file;
    if (!loads.has(key)) {
      loads.set(key, loadYjcmEffectTemplate(win, spec.resource, clip.file, signal, shared).then(asset => {
        if (signal.aborted) asset?.dispose();
        else if (asset) templates.set(key, asset);
        return asset;
      }));
    }
    return loads.get(key);
  }
  const root = new laya.Sprite();
  const layer = root.addChild(new laya.Sprite());
  const { width, height } = canvas;
  const hasTarget = Boolean(plan.projectile || plan.impact);
  const scale = height / 340;
  const origin = { x: width * (hasTarget ? .23 : .5), y: height * .53, scale };
  const target = { x: width * .76, y: height * .53, scale };
  const position = plan.placement === 'center' ? { ...origin, x: width / 2, y: height / 2 }
    : plan.placement === 'near' && plan.position ? {
      x: origin.x + (hasTarget ? plan.position.x[0] * scale : 0), y: origin.y,
      scale: scale * plan.position.scale[0], mirror: plan.position.mirror,
    } : origin;
  const runs = new Set();
  let timeout, frameId, spawnFailure, disposed = false;
  let complete;
  const finished = new Promise(resolve => { complete = resolve; });

  function dispose() {
    if (disposed) return;
    disposed = true;
    win.cancelAnimationFrame(frameId);
    win.clearTimeout(timeout);
    signal.removeEventListener('abort', dispose);
    root.destroy(true);
    for (const asset of templates.values()) asset.dispose();
    templates.clear();
    complete();
  }

  function spawn(clip, asset, point, loop, onLabel, onStop) {
    if (!asset) return;
    let actor;
    try {
      const armature = createEffectArmature(asset, clip.name);
      if (!armature) return;
      const { index } = armature;
      actor = armature.actor;
      actor.pos(point.x, point.y);
      actor.scale(point.mirror ? -point.scale : point.scale, point.scale);
      if (asset.spine) actor.forceUpdate = true;
      layer.addChild(actor);
      if (onLabel) actor.once(laya.Event.LABEL, root, onLabel);
      if (!loop) {
        runs.add(actor);
        actor.once(laya.Event.STOPPED, root, () => queueMicrotask(() => {
          if (disposed || !runs.delete(actor)) return;
          actor.destroy(true);
          onStop?.();
          if (!runs.size) dispose();
        }));
      }
      actor.play(index, loop, true, 0, 0, true, false);
      return actor;
    } catch (error) {
      runs.delete(actor);
      actor?.destroy(true);
      spawnFailure ??= error;
    }
  }

  try {
    signal.addEventListener('abort', dispose, { once: true });
    const files = [...plan.clips, plan.background, plan.projectile, plan.impact];
    const assets = await Promise.allSettled(files.map((clip, index) => load(clip, index < plan.clips.length && plan.shared)));
    if (signal.aborted) return;
    const read = index => assets[index].value;
    const length = plan.clips.length;
    const companion = (clip, index, onLabel) => clip && spawn(clip, read(index), {
      x: target.x + clip.x * scale, y: target.y + clip.y * scale, scale: scale * clip.scale,
    }, false, onLabel, onLabel);
    let reacted = false, struck = false;
    const strike = () => {
      if (disposed || struck) return;
      struck = true;
      companion(plan.impact, length + 2);
    };
    const react = () => {
      if (disposed || reacted) return;
      reacted = true;
      if (!companion(plan.projectile, length + 1, strike)) strike();
    };
    const background = plan.background && spawn(plan.background, read(length), origin, true);
    let mainCount = 0;
    for (const [index, clip] of plan.clips.entries()) {
      if (spawn(clip, read(index), position, false, react, () => {
        if (--mainCount) return;
        react();
        background?.destroy(true);
      })) mainCount++;
    }
    if (!mainCount) {
      const failure = assets.slice(0, length).find(item => item.status === 'rejected');
      throw failure?.reason ?? spawnFailure ?? new Error('未找到可播放的动画片段。');
    }
    let framed = false;
    function fit() {
      // Keep the authored clip positions together and give the target's incoming effect its own space.
      let left = hasTarget ? target.x - 60 : Infinity, right = hasTarget ? target.x + 60 : -Infinity;
      let top = hasTarget ? target.y - 48 : Infinity, bottom = hasTarget ? target.y + 48 : -Infinity;
      let measured = false;
      for (let i = 0; i < layer.numChildren; i++) {
        const actor = layer.getChildAt(i);
        const bounds = animationBounds(actor, actor.skeleton && win.spine);
        if (!bounds) continue;
        const near = actor.x + bounds.x * actor.scaleX;
        const far = near + bounds.width * actor.scaleX;
        const high = actor.y + bounds.y * actor.scaleY;
        left = Math.min(left, near, far);
        right = Math.max(right, near, far);
        top = Math.min(top, high);
        bottom = Math.max(bottom, high + bounds.height * actor.scaleY);
        measured = true;
      }
      if (!measured) return;
      const zoom = Math.min(1, (width - 42) / (right - left), (height - 42) / (bottom - top));
      layer.scale(zoom, zoom);
      layer.pos((width - (left + right) * zoom) / 2, (height - (top + bottom) * zoom) / 2);
      framed = true;
    }
    function draw() {
      if (!framed) fit();
      const frame = root.drawToCanvas(width, height, 0, 0);
      try {
        context.clearRect(0, 0, width, height);
        context.drawImage(frame.source, 0, 0);
      } finally { frame.destroy(); }
    }
    let last = -Infinity, renderFailure;
    function render(time) {
      try {
        if (time - last >= 32) {
          draw();
          last = time;
        }
        frameId = win.requestAnimationFrame(render);
      } catch (error) {
        renderFailure = error;
        dispose();
      }
    }
    draw();
    onStart();
    frameId = win.requestAnimationFrame(render);
    timeout = win.setTimeout(dispose, 12000);
    await finished;
    if (renderFailure) throw renderFailure;
  } finally { dispose(); }
}
