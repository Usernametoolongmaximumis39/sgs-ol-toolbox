import { readYjcmImage, seatPortraitPanel } from './yjcm.js';
import { yjcmClipFile } from './yjcm-effect-data.js';
import { spineIdleRate } from './seat-idle-rate.js';
import { limitedAtlasScale, resizeAtlasPage } from './motion-atlas.js';

const runtime = 'https://web.sanguosha.com/x/pc/res/assets/runtime/';
const motionRoot = runtime + 'general/big/dynamic/';
const formRoot = runtime + 'game/changeSkinEffect/';
const idleNames = ['play', 'daiji', 'idle', 'standby'];
const backgroundIdleNames = ['daiji', 'idle', 'standby', 'beijing', 'play'];
// 春宵彩翼. Align the two authored idle layers to the 1600 × 900 original.
const backgroundFrames = new Map([['8123801', { x: -547, y: -318, width: 1126, height: 633.375 }]]);
// Framed seat assets draw around the center of the 229 × 270 native avatar.
const seatFrame = { x: -95, y: -115, width: 190, height: 249, overhang: 20 };

async function readAsset(win, url, signal, limit) {
  const response = await win.fetch(url, { credentials: 'omit', redirect: 'error', signal });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('动画资源不可用');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > limit) throw new Error('动画资源大小无效');
  return bytes;
}

async function loadTemplate(win, laya, url, isSpine, signal, lowQuality = false) {
  const controller = new win.AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = win.setTimeout(abort, 8000);
  const image = path => readYjcmImage(win, path, controller.signal, value => value, 'low');
  const data = (path, limit) => readAsset(win, path, controller.signal, limit);
  const textures = [];
  let template;
  function texture(value, Type, scale = 1) {
    if (!value || controller.signal.aborted) throw new Error('动画图集不可用');
    const source = resizeAtlasPage(win.document, value, scale);
    const width = source.naturalWidth ?? source.width, height = source.naturalHeight ?? source.height;
    const bitmap = new laya.Texture2D(width, height, undefined, source === value ? undefined : false);
    const record = { bitmap };
    textures.push(record);
    bitmap.loadImageSource(source, true);
    const result = record.texture = new Type(bitmap);
    if (source !== value) {
      // Spine's mesh offsets are in the original atlas coordinate system.
      const original = { width: value.naturalWidth, height: value.naturalHeight };
      result.getImage = () => original;
    }
    return result;
  }
  function dispose() {
    template?.destroy();
    for (const record of textures) {
      if (record.texture && !record.texture.destroyed) record.texture.destroy();
      if (!record.bitmap.destroyed) record.bitmap.destroy();
    }
  }
  const stem = url.slice(0, url.lastIndexOf('.'));
  try {
    const skeletonLimit = 8 * 1024 * 1024;
    if (isSpine) {
      const { TextureAtlas, AtlasAttachmentLoader, SkeletonBinary } = win.spine;
      const [bytes, atlasBytes] = await Promise.all([data(url, skeletonLimit), data(stem + '.atlas', 1024 * 1024)]);
      // OL's binary loader appends .txt to the atlas name. The foreign
      // assets use .atlas directly, so feed the same parser the real files.
      const atlas = new TextureAtlas(new TextDecoder().decode(atlasBytes));
      if (!atlas.pages.length || atlas.pages.length > 8 || atlas.pages.some(page => !/^[A-Za-z0-9_-]+\.png$/.test(page.name))) {
        throw new Error('动画图集无效');
      }
      const directory = url.slice(0, url.lastIndexOf('/') + 1);
      const images = await Promise.all(atlas.pages.map(page => image(directory + page.name)));
      const scale = lowQuality ? limitedAtlasScale(images.reduce((sum, value) =>
        sum + (value?.naturalWidth || 0) * (value?.naturalHeight || 0), 0)) : 1;
      template = new laya.SpineTemplet(laya.SpineVersion.v4_0);
      for (const [index, page] of atlas.pages.entries()) {
        const pageTexture = texture(images[index], laya.SpineGLTexture, scale);
        page.setTexture(pageTexture);
        template._textureDic[page.name] = pageTexture;
      }
      template.skeletonData = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
    } else {
      const [bytes, art] = await Promise.all([data(url, skeletonLimit), image(stem + '.png')]);
      template = new laya.Templet();
      template.parseData(texture(art, laya.Texture), bytes);
      if (template.isParseFail) throw new Error('动画读取失败');
    }
    return { template, dispose };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    win.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    abort();
  }
}

function canLoad(laya, win, spine) {
  return laya?.Texture2D && (spine
    ? laya.SpineTemplet && laya.SpineGLTexture && laya.SpineVersion?.v4_0 && win.spine?.SkeletonBinary
    : laya.Templet);
}

export async function loadYjcmEffectTemplate(win, resource, file, signal, shared) {
  const laya = win.Laya ?? win.laya;
  const spine = file.endsWith('.skel');
  if (signal.aborted || !yjcmClipFile.test(file) || !canLoad(laya, win, spine) ||
      (!shared && !/^[A-Za-z0-9_-]+$/.test(resource))) return;
  const url = (shared ? formRoot : motionRoot + resource + '/') + file;
  const loaded = await loadTemplate(win, laya, url, spine, signal);
  if (signal.aborted) {
    loaded.dispose();
    return;
  }
  return { ...loaded, spine };
}

export function animationBounds(actor, spine) {
  let { x, y, width, height } = actor.getSelfBounds();
  if (!(width > 1 && height > 1) && spine) {
    const position = new spine.Vector2(), size = new spine.Vector2();
    actor.skeleton.getBounds(position, size);
    x = position.x;
    y = -position.y - size.y;
    width = size.x;
    height = size.y;
  }
  if ([x, y, width, height].every(Number.isFinite) && width > 1 && height > 1) return { x, y, width, height };
}

function measureSeatPanel(laya, actor, bounds) {
  const root = new laya.Sprite();
  // Measure the painted card separately from artwork that projects above it.
  const scale = Math.min(1, 256 / Math.max(bounds.width, bounds.height));
  const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
  let sample;
  try {
    actor.scale(scale, scale);
    actor.pos(-bounds.x * scale, -bounds.y * scale);
    root.addChild(actor);
    sample = root.drawToCanvas(width, height, 0, 0);
    const pixels = sample.source.getContext('2d').getImageData(0, 0, width, height);
    const panel = seatPortraitPanel(pixels);
    if (!panel) return;
    // Leave a few pixels for the headdress to move during the idle loop.
    const overhang = panel.overhang ? Math.min(panel.y, panel.overhang + 4) / scale : 0;
    return { x: bounds.x + panel.x / scale, y: bounds.y + panel.y / scale,
      width: panel.width / scale, height: panel.height / scale, overhang };
  } catch {
    // Some runtimes cannot read back animation pixels. Keep the authored bounds.
  } finally {
    actor.removeSelf();
    actor.scale(1, 1);
    actor.pos(0, 0);
    sample?.destroy();
    root.destroy(true);
  }
}

export async function loadYjcmMotion(win, motion, signal, forSeat = false, backgroundQuality) {
  const laya = win.Laya ?? win.laya;
  if (!laya || !motion || !/^[A-Za-z0-9_-]+$/.test(motion.resource)) return;
  for (const file of motion.files ?? []) {
    if (signal.aborted) return;
    if (!yjcmClipFile.test(file)) continue;
    const spine = file.endsWith('.skel');
    if (!canLoad(laya, win, spine)) continue;
    let loaded, actor;
    try {
      loaded = await loadTemplate(win, laya, motionRoot + motion.resource + '/' + file, spine, signal, backgroundQuality === 'low');
      if (signal.aborted) { loaded.dispose(); return; }
      actor = loaded.template.buildArmature(spine ? undefined : 2);
      const names = Array.from({ length: actor.getAnimNum() }, (_, i) => actor.getAniNameByIndex(i));
      // Old catalogue entries still point to the standard framed idle by file name.
      const framed = forSeat && (motion.seat?.some(clip => clip.file === file) ?? (file === 'daiji2.sk'));
      const index = framed && names.length ? 0
        : (backgroundQuality ? backgroundIdleNames : idleNames).map(name => names.findIndex(actual => actual?.toLowerCase() === name)).find(i => i >= 0);
      if (index === undefined && (names.length !== 1 || (backgroundQuality && /^(chuchang|gongji|hudong|jineng|attack|enter)/i.test(names[0])))) {
        throw new Error('未找到待机片段');
      }
      if (spine) actor.forceUpdate = true;
      const play = () => actor.play(index ?? 0, true, true, 0, 0, true, false);
      play();
      const bounds = animationBounds(actor, spine ? win.spine : null);
      if (!bounds) throw new Error('没有可用的待机动画画幅');
      const seatPanel = forSeat && !framed ? measureSeatPanel(laya, actor, bounds) : undefined;
      let setSmoothIdle;
      if (forSeat) {
        if (spine) setSmoothIdle = spineIdleRate(actor);
        else if (actor.player?.cacheFrameRate === 30) setSmoothIdle = smooth => {
          if (!actor.destroyed) actor.player.cacheFrameRate = smooth ? 60 : 30;
        };
      }
      return { actor, bounds, seatPanel, framed, file, play, setSmoothIdle,
        dispose() { actor.destroy(true); loaded.dispose(); } };
    } catch {
      actor?.destroy(true);
      loaded?.dispose();
    }
  }
}

export async function loadYjcmBackgroundMotion(win, motion, signal, quality = 'high') {
  const framed = new Set(motion.seat?.map(clip => clip.file) ?? ['daiji2.sk']);
  const files = motion.files.filter(file => !framed.has(file));
  const backdropFiles = files.some(file => file.endsWith('.skel')) ? ['beijing.skel'] : ['beijing.sk'];
  const [foreground, backdrop] = await Promise.all([
    loadYjcmMotion(win, { ...motion, files }, signal, false, quality),
    loadYjcmMotion(win, { ...motion, files: backdropFiles }, signal, false, quality),
  ]);
  if (!foreground || signal.aborted) { foreground?.dispose(); backdrop?.dispose(); return; }
  const layers = backdrop ? [backdrop, foreground] : [foreground];
  const actor = new (win.Laya ?? win.laya).Sprite();
  for (const layer of layers) { layer.actor.paused(); actor.addChild(layer.actor); }
  return { actor, authoredFrame: backdrop && backgroundFrames.get(motion.resource),
    setPlaying(value) {
      for (const layer of layers) {
        if (!value) layer.actor.paused();
        else if (typeof layer.actor.resume === 'function') layer.actor.resume();
        else layer.play();
      }
    },
    dispose() { for (const layer of layers) layer.dispose(); actor.destroy(true); },
  };
}

export async function playYjcmSeatMotion(win, spec, signal, show) {
  const first = await loadYjcmMotion(win, spec, signal, true);
  if (!first) return;
  if (signal.aborted) { first.dispose(); return; }
  const clips = spec.seat ?? [];
  const firstIndex = clips.findIndex(clip => clip.file === first.file);
  const complete = (win.Laya ?? win.laya).Event.COMPLETE;
  const loaded = new Map([[first.file, first]]), missing = new Set();
  let current, source, next, remaining, index;

  signal.addEventListener('abort', () => {
    source?.off(complete, loaded, onLoop);
    for (const animation of loaded.values()) animation.dispose();
    loaded.clear();
  }, { once: true });

  async function prepareNext() {
    for (let offset = 1; offset < clips.length; offset++) {
      const candidate = (index + offset) % clips.length;
      const { file } = clips[candidate];
      if (missing.has(file)) continue;
      if (!loaded.has(file)) {
        const animation = await loadYjcmMotion(win, { ...spec, files: [file] }, signal, true);
        if (signal.aborted) { animation?.dispose(); return; }
        if (!animation) { missing.add(file); continue; }
        animation.actor.paused();
        loaded.set(file, animation);
      }
      next = candidate;
      return;
    }
  }

  function onLoop() {
    if (--remaining > 0 || next === undefined) return;
    const candidate = next;
    next = undefined;
    // Both skeleton players emit completion from inside their frame update.
    queueMicrotask(() => { if (!signal.aborted) select(candidate); });
  }

  function select(candidate) {
    source?.off(complete, loaded, onLoop);
    if (current) {
      current.actor.paused();
      current.actor.removeSelf();
    }
    index = candidate;
    const clip = clips[index];
    current = loaded.get(clip.file);
    remaining = clip.min + Math.floor(Math.random() * (clip.max - clip.min + 1));
    source = current.actor.player ?? current.actor;
    source.on(complete, loaded, onLoop);
    current.play();
    show(current);
    if (!signal.aborted) void prepareNext();
  }

  if (firstIndex >= 0 && clips.length > 1) select(firstIndex);
  else show(first);
}

export function yjcmSeatTransform(x, y, width, height) {
  // Map the whole authored card to the OL seat, whose aspect ratio differs.
  const scaleX = width / seatFrame.width, scaleY = height / seatFrame.height;
  return { x: x - seatFrame.x * scaleX, y: y - seatFrame.y * scaleY, scaleX, scaleY };
}

export function fitYjcmMotion({ actor, bounds, seatPanel, framed }, x, y, width, height) {
  if (framed) {
    const transform = yjcmSeatTransform(x, y, width, height);
    actor.scale(transform.scaleX, transform.scaleY);
    actor.pos(transform.x, transform.y);
    return Math.max(seatFrame.overhang, seatFrame.y - bounds.y) * transform.scaleY;
  }
  const frame = seatPanel ?? bounds;
  const scale = (seatPanel ? Math.max : Math.min)(width / frame.width, height / frame.height);
  const top = seatPanel ? y : y + (height - frame.height * scale) / 2;
  actor.scale(scale, scale);
  actor.pos(x + (width - frame.width * scale) / 2 - frame.x * scale, top - frame.y * scale);
  return (seatPanel?.overhang ?? 0) * scale;
}

export async function previewSeatMotion(win, canvas, signal, load) {
  if (signal.aborted || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const laya = win.Laya ?? win.laya;
  const context = canvas.getContext('2d');
  if (!context || !laya?.Sprite?.prototype.drawToCanvas) return;
  const motion = await load();
  if (!motion) return;
  if (signal.aborted) { motion.dispose(); return; }
  const root = new laya.Sprite();
  let timer;
  function dispose() {
    signal.removeEventListener('abort', dispose);
    win.clearInterval(timer);
    motion.dispose();
    root.destroy(true);
    canvas.remove();
  }
  function draw() {
    let frame;
    try {
      frame = root.drawToCanvas(canvas.width, canvas.height, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(frame.source, 0, 0);
      return true;
    } catch { dispose(); return false; }
    finally { frame?.destroy(); }
  }
  signal.addEventListener('abort', dispose, { once: true });
  const heightAbove = motion.fit ? motion.fit(0, 0, canvas.width, canvas.height)
    : fitYjcmMotion(motion, 0, 0, canvas.width, canvas.height);
  if (heightAbove === undefined) { dispose(); return; }
  root.addChild(motion.actor);
  if (!draw()) return;
  timer = win.setInterval(draw, 100);
  return true;
}

export function previewYjcmMotion(win, entry, canvas, signal) {
  if (entry.motion) return previewSeatMotion(win, canvas, signal, () => loadYjcmMotion(win, entry.motion, signal));
}

export function createEffectArmature(asset, name) {
  const actor = asset.template.buildArmature(asset.spine ? undefined : 2);
  try {
    const count = actor.getAnimNum();
    const index = name === 0 ? 0 : Array.from({ length: count }, (_, i) => actor.getAniNameByIndex(i)).indexOf(name);
    if (index >= 0 && index < count) return { actor, index };
  } catch (error) {
    actor.destroy(true);
    throw error;
  }
  actor.destroy(true);
}
