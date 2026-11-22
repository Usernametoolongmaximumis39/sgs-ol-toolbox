import { readMobileSpine36 } from './mobile-spine36.js';
import { seatPortraitPanel } from './yjcm.js';
import { attachmentFrame, checkedFrame, rotatedFrame } from './spine-layout.js';
import { spineIdleRate } from './seat-idle-rate.js';
import { fitMobileSeat, measureMobileSeatFace } from './mobile-seat-framing.js';
import { limitedAtlasScale, resizeAtlasPage } from './motion-atlas.js';

const backgroundClips = ['beijing', 'background', 'play'];
const idleClips = ['daiji', 'idle', 'standby', 'play'];
const imageLimit = 8 * 1024 * 1024;
const skeletonLimit = 4 * 1024 * 1024;
const atlasLimit = 256 * 1024;
const archiveForms = new WeakMap();
// Reference portrait height when adapting the mobile composition to an OL seat.
const seatDesignHeight = 410;
const mobileWideWidth = 1534, mobileWideHeight = 750;
// Only character art is allowed to project into the space just above the seat.
const seatOverflowRatio = .28;
const minimumSeatCoverage = .84;
const maxEffectTime = 12000;
const mobileSoundName = /^effect_dynamicSkin_[1-9]\d{0,11}(?:#\d{1,3})?(?:_[A-Za-z0-9-]{1,30})?$/i;
const defaultAttackMargins = [300, 400, 650, 650];
// These attachment names identify the primary character in the corresponding
// official rig, including scenes with more than one painted figure.
const seatFraming = new Map([
  ['10403_2', { slot: 'daunwu_20' }],
  ['110_1', { slot: 'tou' }],
  ['36601_1', { slot: 'dbtou' }],
  ['52601_2', { slot: 'sftou' }],
  // Its translucent fire layer surrounds the face and has no large opaque
  // rectangle behind it. Retain the larger scene bounds in all three forms.
  ['83502_2', { slot: 'r-tou', faceWidth: .32, focusY: .37, backdropCoverage: .6 }],
  // The final form has a taller helmet already crossing the card edge.
  ['83502_2#2', { slot: 'r-tou', faceWidth: .29, backdropCoverage: .6 }],
  ['87002_1', { slot: 'r-lian' }],
  // Keep the rider and the wolf in the shot. A close-up of the rider cuts off the wolf.
  ['90001_1', { slot: 'r-tou', faceWidth: .145, focusX: .46, focusY: .35, backdropSubjects: /^(?:lang|texture\/djsd\/)/ }],
  ['3000405_2', { slot: 'caochun128' }],
]);
const isPowerOfTwo = size => (size & (size - 1)) === 0;

async function imageFromBytes(win, bytes) {
  const url = win.URL.createObjectURL(new win.Blob([bytes], { type: 'image/png' }));
  try {
    const image = new win.Image();
    image.src = url;
    await image.decode();
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0) ||
        Math.max(image.naturalWidth, image.naturalHeight) > 4096) throw new Error('移动版动画图集尺寸无效');
    return image;
  } finally {
    win.URL.revokeObjectURL(url);
  }
}

function paintedFrame(laya, actor, frame, rotation, minimumCoverage) {
  const root = new laya.Sprite();
  const scale = Math.min(1, 320 / Math.max(frame.width, frame.height));
  let sample;
  try {
    root.addChild(actor);
    actor.scale(scale, scale);
    actor.pos(-frame.x * scale, -frame.y * scale);
    actor.rotation = rotation;
    const width = Math.ceil(frame.width * scale), height = Math.ceil(frame.height * scale);
    sample = root.drawToCanvas(width, height, 0, 0);
    const context = sample.source.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, width, height);
    // Unlike the static PNG, a rotated scene can have a large transparent
    // margin on all sides of its opaque painted backdrop.
    const bounds = seatPortraitPanel(pixels, minimumCoverage);
    if (bounds) return checkedFrame(frame.x + bounds.x / scale, frame.y + bounds.y / scale, bounds.width / scale, bounds.height / scale);
  } catch {
    // Fall back to the rig or painted region if the browser cannot read pixels.
  } finally {
    actor.removeSelf();
    actor.scale(1, 1);
    actor.pos(0, 0);
    actor.rotation = 0;
    sample?.destroy();
    root.destroy(true);
  }
}

function measureBackdrop(laya, spine, actor, rotation, minimumCoverage) {
  const skeleton = actor.skeleton;
  const position = new spine.Vector2(), size = new spine.Vector2();
  skeleton.getBounds(position, size);
  const rig = checkedFrame(position.x, -position.y - size.y, size.x, size.y);
  const rotatedRig = rig && rotatedFrame(rig, rotation);
  const artwork = rotatedRig && paintedFrame(laya, actor, rotatedRig, rotation, minimumCoverage);
  if (artwork) return artwork;
  let plate, area = 0;
  // Particle and glow attachments may extend far outside the painted backdrop.
  // The backdrop itself can be a deformed mesh or a rectangular image.
  for (const slot of skeleton.drawOrder) {
    const frame = attachmentFrame(spine, slot);
    if (frame && frame.width * frame.height > area) {
      plate = frame;
      area = plate.width * plate.height;
    }
  }
  if (!plate) return rotatedRig;
  const rotatedPlate = rotatedFrame(plate, rotation);
  return rotation ? paintedFrame(laya, actor, rotatedPlate, rotation, minimumCoverage) ?? rotatedPlate : rotatedPlate;
}

function seatPaintCoverage(actor, width, height, centerOnly) {
  const visible = actor.visible;
  let sample;
  try {
    actor.visible = true;
    sample = actor.drawToCanvas(width, height, 0, 0);
    const left = centerOnly ? Math.floor(width * .18) : 0;
    const top = centerOnly ? Math.floor(height * .12) : 0;
    const columns = centerOnly ? Math.ceil(width * .64) : width;
    const rows = centerOnly ? Math.ceil(height * .60) : height;
    const pixels = sample.source.getContext('2d', { willReadFrequently: true }).getImageData(left, top, columns, rows).data;
    let covered = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) covered++;
    return covered / (columns * rows);
  } catch {
    // Some clients cannot read back the Spine canvas.
  } finally {
    actor.visible = visible;
    sample?.destroy();
  }
}

function backdropCoverage(frame, placement, width, height) {
  const { x, y, scale } = placement;
  const halfWidth = width / (2 * scale), halfHeight = height / (2 * scale);
  const overlapX = Math.min(x + halfWidth, frame.x + frame.width) - Math.max(x - halfWidth, frame.x);
  const overlapY = Math.min(y + halfHeight, frame.y + frame.height) - Math.max(y - halfHeight, frame.y);
  return Math.max(0, overlapX) * Math.max(0, overlapY) * scale * scale / (width * height);
}

function createBackdropOverflow(laya, source, textures, subjects) {
  if (!subjects || !laya.GraphicsSpine || !laya.SpineSkeletonRenderer) return;
  const { skeleton } = source;
  const slots = new Set(skeleton.slots.filter(slot => subjects.test(slot.data.name)));
  if (!slots.size) return;
  const sprite = new laya.Sprite();
  sprite.graphics = new laya.GraphicsSpine();
  const renderer = new laya.SpineSkeletonRenderer(false);
  const pose = { color: skeleton.color, drawOrder: [] };
  return { render(context) {
    if (!source.visible) return;
    pose.drawOrder.length = 0;
    for (const slot of skeleton.drawOrder) if (slots.has(slot)) pose.drawOrder.push(slot);
    sprite.graphics.clear();
    renderer.draw(pose, -1, -1, sprite, textures);
    sprite.pos(source.x, source.y);
    sprite.scale(source.scaleX, source.scaleY);
    sprite.rotation = source.rotation;
    sprite.render(context, 0, 0);
  }, dispose() { sprite.destroy(true); } };
}

async function loadLayer(win, laya, archive, stem, backdrop, signal, rotation, minimumCoverage, backgroundQuality) {
  const [skeletonBytes, atlasBytes] = await Promise.all([
    archive.read(stem + '.skel', { limit: skeletonLimit }),
    archive.read(stem + '.atlas', { limit: atlasLimit }),
  ]);
  if (signal.aborted) return;
  const atlas = new win.spine.TextureAtlas(new TextDecoder('utf-8', { fatal: true }).decode(atlasBytes));
  if (!atlas.pages.length || atlas.pages.length > 16 || atlas.pages.some(page => !/^[\w#-]+\.png$/i.test(page.name) ||
      !(page.width > 0 && page.height > 0 && page.width <= 4096 && page.height <= 4096))) {
    throw new Error('移动版动画图集路径无效');
  }
  const data = readMobileSpine36(skeletonBytes);
  const clips = backdrop ? backgroundClips : idleClips;
  const names = Object.keys(data.animations);
  const clip = clips.map(clip => names.find(name => name.toLowerCase() === clip)).find(Boolean);
  if (!clip) throw new Error(backdrop ? '移动版动态皮肤没有背景循环' : '移动版动态皮肤没有待机循环');
  const directory = stem.slice(0, stem.lastIndexOf('/') + 1);
  const template = new laya.SpineTemplet(laya.SpineVersion.v4_0), bitmaps = [], textures = [];
  let actor;
  function dispose() {
    if (actor && !actor.destroyed) {
      actor.paused();
      actor.destroy(true);
    }
    template.destroy();
    for (const texture of textures) if (!texture.destroyed) texture.destroy();
    for (const bitmap of bitmaps) if (!bitmap.destroyed) bitmap.destroy();
  }
  try {
    const pixels = atlas.pages.reduce((sum, page) => sum + page.width * page.height, 0);
    const scale = backgroundQuality === 'high' ? 1 : limitedAtlasScale(pixels);
    for (const page of atlas.pages) {
      const image = await imageFromBytes(win, await archive.read(directory + page.name, { limit: imageLimit }));
      if (signal.aborted) { dispose(); return; }
      if (image.naturalWidth !== page.width || image.naturalHeight !== page.height) throw new Error('移动版动画图集图片尺寸与索引不符');
      const source = resizeAtlasPage(win.document, image, scale);
      // Older Laya allocates mip levels before loadImageSource can disable them
      // for NPOT pages, which makes Chromium 85 reject the texture on D3D11.
      const mipmap = isPowerOfTwo(source.width) && isPowerOfTwo(source.height);
      const bitmap = new laya.Texture2D(source.width, source.height, undefined, mipmap);
      bitmaps.push(bitmap);
      bitmap.loadImageSource(source, true);
      const texture = new laya.SpineGLTexture(bitmap);
      // Spine computes mesh UVs from the original atlas page size and offsets.
      // A smaller GPU upload still covers the same normalized texture space.
      if (source !== image) {
        const atlasSize = { width: page.width, height: page.height };
        texture.getImage = () => atlasSize;
      }
      textures.push(texture);
      page.setTexture(texture);
      template._textureDic[page.name] = texture;
    }
    template.skeletonData = new win.spine.SkeletonJson(new win.spine.AtlasAttachmentLoader(atlas)).readSkeletonData(data);
    const duration = template.skeletonData.findAnimation(clip)?.duration;
    if (!(Number.isFinite(duration) && (duration > 0 || (backdrop && duration === 0)))) throw new Error('移动版动画循环无效');
    actor = template.buildArmature();
    actor.forceUpdate = true;
    actor.play(clip, duration > 0, true, 0, 0, true, false);
    // Building one layer can finish well before the other layer's atlas.
    actor.paused();
    const measureSeatBackdrop = backdrop && !backgroundQuality;
    const frame = measureSeatBackdrop ? measureBackdrop(laya, win.spine, actor, rotation, minimumCoverage) : undefined;
    if (measureSeatBackdrop && !frame) throw new Error('移动版动画画幅不可用');
    return { actor, template, duration, frame, idle: clip, data, textures: template._textureDic, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

function archiveLayer(archive, name, form) {
  const matches = archive.names.filter(path => path.split('/').at(-1).toLowerCase() === name + form + '.skel');
  if (matches.length !== 1) return;
  const stem = matches[0].slice(0, -5);
  if (archive.names.includes(stem + '.atlas')) return stem;
}

function effectLayers(archive, form) {
  if (form && (typeof form !== 'string' || !/^#\d+$/.test(form))) throw new Error('移动版动画形态编号无效');
  let forms = archiveForms.get(archive);
  if (!forms) archiveForms.set(archive, forms = new Map());
  if (!forms.has(form)) {
    const character = archiveLayer(archive, 'xingxiang', form), background = archiveLayer(archive, 'beijing', form);
    forms.set(form, character && background ? { character, background } : null);
  }
  return forms.get(form);
}

function hasTimedFrames(timeline) {
  if (!timeline || typeof timeline !== 'object') return false;
  if (timeline.time > 0) return true;
  return Object.values(timeline).some(hasTimedFrames);
}

function mobileEffectSpec(character, background) {
  const names = data => new Map(Object.keys(data.animations).map(name => [name.toLowerCase(), name]));
  const characterNames = names(character), backgroundNames = names(background);
  function plan(key, name, id) {
    const language = { enter: 'chuchang', attack: 'gongji', special: 'teshu' };
    const type = language[key];
    const candidates = key === 'attack' ? [type, 'gongji_1', 'gongji_2', 'gongji_3'] : [type];
    const clip = candidates.map(name => characterNames.get(name)).find(name => name && hasTimedFrames(character.animations[name]));
    if (!clip) return;
    const paired = backgroundNames.get(clip.toLowerCase()) ?? backgroundNames.get(type);
    const sounds = new Map();
    for (const [data, animation] of [[character, clip], [background, paired]]) {
      for (const event of data.animations[animation]?.events ?? []) {
        if (event.name.toLowerCase() !== 'playaudio' || !(event.time >= 0) || event.time > maxEffectTime / 1000) continue;
        const file = event.string ?? data.events[event.name]?.string;
        if (mobileSoundName.test(file) && !sounds.has(file) && sounds.size < 4) sounds.set(file, event.time);
      }
    }
    return { key: 'mobile:' + key, id, name, character: clip, background: paired,
      bindable: key === 'special', sounds: [...sounds].map(([file, time]) => ({ path: 'audio/effect/' + file + '.mp3', time })) };
  }
  const enter = plan('enter', '入场');
  const actions = [plan('attack', '攻击', 1), plan('special', '特殊演出')].filter(Boolean);
  return { enter, actions };
}

export async function readMobileMotionEffects(archive, form = '') {
  const formLayers = effectLayers(archive, form);
  if (!formLayers) return { actions: [] };
  const { character, background } = formLayers;
  const layers = await Promise.all([character, background].map(async stem =>
    readMobileSpine36(await archive.read(stem + '.skel', { limit: skeletonLimit }))));
  return mobileEffectSpec(...layers);
}

function mountAttack(laya, viewport, character, layout) {
  const { host, x, y, width, height, origin } = viewport;
  if (host.destroyed || !checkedFrame(x, y, width, height) || ![origin.x, origin.y].every(Number.isFinite)) return;
  const scale = Math.min(width / mobileWideWidth, height / mobileWideHeight);
  const margins = layout?.attackMargins;
  const [top, bottom, left, right] = Array.isArray(margins) && margins.length === 4 &&
    margins.every(value => Number.isFinite(value) && value >= 0) ? margins : defaultAttackMargins;
  const clamp = (value, span, before, after) => {
    const unit = Math.min(scale, span / Math.max(1, before + after));
    return Math.max(before * unit, Math.min(value, span - after * unit));
  };
  const homeX = origin.x - x, homeY = origin.y - y;
  const layer = new laya.Sprite();
  let actor;
  try {
    layer.name = 'sgs-mobile-attack';
    layer.mouseEnabled = false;
    layer.zOrder = 100;
    layer.pos(x, y);
    layer.scrollRect = new laya.Rectangle(0, 0, width, height);
    // The attack rig shares the seat's decoded atlas and has its own pose.
    actor = layer.addChild(character.template.buildArmature());
    actor.name = 'sgs-mobile-attack-actor';
    actor.mouseEnabled = false;
    actor.forceUpdate = true;
    const attackScale = scale * (layout?.scale ?? .65);
    actor.scale(attackScale, attackScale);
    actor.pos(clamp(homeX, width, left, right), clamp(homeY, height, top, bottom));
    host.addChild(layer);
  } catch {
    layer.destroy(true);
    return;
  }
  const source = character.actor, visible = source.visible;
  source.visible = false;
  function reveal() {
    if (!layer.destroyed) layer.visible = false;
    if (!source.destroyed) source.visible = visible;
  }
  const cue = ({ name }) => {
    if (name === 'ZheZhao') reveal();
    if (name === 'GuiWei' && layer.visible) laya.Tween?.to?.(actor, { x: homeX, y: homeY }, 250);
  };
  actor.on(laya.Event.LABEL, layer, cue);
  return { actor, dispose() {
    reveal();
    laya.Tween?.clearAll?.(actor);
    if (!layer.destroyed) layer.destroy(true);
  } };
}

export async function createMobileMotion(win, archive, signal, form = '', layout, backgroundQuality) {
  const laya = win.Laya ?? win.laya, spine = win.spine;
  if (signal.aborted || !laya?.SpineTemplet || !laya.SpineVersion?.v4_0 || !laya.SpineGLTexture ||
      !spine?.SkeletonJson || !spine.RegionAttachment || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const formLayers = effectLayers(archive, form);
  if (!formLayers) return;
  const { character, background } = formLayers;
  const rig = character.split('/').at(-2);
  const framing = seatFraming.get(rig + form) ?? seatFraming.get(rig);
  if (!(layout?.scale > 0) || ![layout.scale, layout.offsetX, layout.offsetY, layout.rotation].every(Number.isFinite)) layout = undefined;
  const rotation = layout?.rotation ?? 0;
  const layers = [];
  let actor, effect, backdropOverflow, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    effect?.finish(false);
    backdropOverflow?.dispose();
    for (const layer of layers.splice(0)) layer.dispose();
    actor?.destroy(true);
  }
  try {
    // Await both jobs so a successful sibling can still release its resources.
    const results = await Promise.allSettled([
      loadLayer(win, laya, archive, background, true, signal, rotation, framing?.backdropCoverage ?? .2, backgroundQuality),
      loadLayer(win, laya, archive, character, false, signal, rotation, undefined, backgroundQuality),
    ]);
    for (const result of results) if (result.status === 'fulfilled' && result.value) layers.push(result.value);
    if (signal.aborted) { dispose(); return; }
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    if (layers.length !== 2) throw new Error('移动版动画层不可用');
    actor = new laya.Sprite();
    actor.name = 'sgs-mobile-idle';
    actor.mouseEnabled = false;
    for (const layer of layers) {
      actor.addChild(layer.actor);
      if (layer.duration && !backgroundQuality) {
        layer.actor.timeKeeper?.update();
        layer.actor.resume();
      }
    }
    signal.addEventListener('abort', dispose, { once: true });
    function setPlaying(value) {
      for (const layer of layers) if (layer.duration) {
        if (value) { layer.actor.timeKeeper?.update(); layer.actor.resume(); }
        else layer.actor.paused();
      }
    }
    if (backgroundQuality) {
      const authored = layout && { x: -layout.offsetX / layout.scale, y: layout.offsetY / layout.scale,
        scale: layout.scale * 172 / seatDesignHeight };
      const face = measureMobileSeatFace(spine, layers[1].actor, rotation, framing?.slot, authored, 146, 172);
      const subject = face && checkedFrame(face.left, face.top, face.right - face.left, face.bottom - face.top);
      const preferredFrame = { x: -mobileWideWidth / 2, y: -mobileWideHeight / 2,
        width: mobileWideWidth, height: mobileWideHeight };
      return { actor, dispose, setPlaying, rotation, subject, preferredFrame };
    }
    backdropOverflow = createBackdropOverflow(laya, layers[0].actor, layers[0].textures, framing?.backdropSubjects);
    const effects = mobileEffectSpec(layers[1].data, layers[0].data);
    for (const layer of layers) delete layer.data;
    const plans = [effects.enter, ...effects.actions].filter(Boolean);
    const setCharacterRate = spineIdleRate(layers[1].actor);
    let smoothIdle = false;
    function syncIdleRate() { if (!disposed) setCharacterRate?.(smoothIdle && !effect); }
    function playEffect(candidate, { kind, viewport, onFinish, onSound } = {}) {
      if (disposed) return false;
      const plan = plans.find(plan => plan.key === candidate?.key);
      const priority = { enter: 0, attack: 1, transition: 2, skill: 3 }[kind] ?? 1;
      if (!plan) return false;
      if (effect && effect.priority >= priority) return false;
      const [background, character] = layers;
      const tracks = [[background, plan.background], [character, plan.character]].flatMap(([layer, name]) => {
        const duration = name && layer.template.skeletonData.findAnimation(name)?.duration;
        return Number.isFinite(duration) && duration > 0 ? [{ layer, name, duration }] : [];
      });
      const characterTrack = tracks.find(({ layer }) => layer === character);
      if (!characterTrack) return false;
      effect?.finish(false);
      const attack = viewport && plan.key === 'mobile:attack' ? mountAttack(laya, viewport, character, layout) : undefined;
      for (const track of tracks) track.actor = track === characterTrack && attack ? attack.actor : track.layer.actor;
      const timers = [];
      const run = effect = { priority, finish };
      syncIdleRate();
      let unfinished = tracks.length;
      function finish(completed = true) {
        if (effect !== run) return;
        effect = null;
        for (const { actor } of tracks) if (!actor.destroyed) actor.off(laya.Event.STOPPED, run, stopped);
        for (const timer of timers) win.clearTimeout(timer);
        attack?.dispose();
        try {
          if (!disposed) for (const { layer, actor } of tracks) {
            if (actor !== layer.actor || actor.destroyed) continue;
            actor.play(layer.idle, layer.duration > 0, true, 0, 0, true, false);
            if (!layer.duration) actor.paused();
          }
        } finally {
          if (smoothIdle && !disposed) queueMicrotask(syncIdleRate);
          onFinish?.(completed);
        }
      }
      const stopped = () => { if (--unfinished === 0) queueMicrotask(() => finish()); };
      try {
        for (const { actor, name } of tracks) {
          actor.play(name, false, true, 0, 0, true, false);
          actor.once(laya.Event.STOPPED, run, stopped);
        }
        const duration = Math.max(...tracks.map(track => track.duration));
        timers.push(win.setTimeout(finish, Math.min(maxEffectTime, duration * 1000 + 150)));
        for (const { path, time } of plan.sounds) if (onSound) {
          timers.push(win.setTimeout(() => { if (effect === run) onSound(path); }, time * 1000));
        }
        return true;
      } catch {
        finish(false);
        return false;
      }
    }
    function positionLayers(x, y, scale) {
      for (const { actor: child } of layers) {
        child.rotation = rotation;
        child.scale(scale, scale);
        child.pos(x, y);
      }
    }
    let face, seatPlacement, seatSize;
    function sampleSeat(placement, width, height, characterOnly = false) {
      const factor = Math.min(1, 96 / Math.max(width, height));
      const sampleWidth = Math.max(1, Math.round(width * factor));
      const sampleHeight = Math.max(1, Math.round(height * factor));
      const sampleScale = placement.scale * factor;
      positionLayers(sampleWidth / 2 - placement.x * sampleScale,
        sampleHeight / 2 - placement.y * sampleScale, sampleScale);
      const backdrop = layers[0].actor, visible = backdrop.visible;
      try {
        if (characterOnly) backdrop.visible = false;
        return seatPaintCoverage(actor, sampleWidth, sampleHeight, characterOnly);
      } finally {
        backdrop.visible = visible;
      }
    }
    function planSeat(width, height) {
      const { frame } = layers[0];
      const authored = layout && { x: -layout.offsetX / layout.scale, y: layout.offsetY / layout.scale,
        scale: layout.scale * height / seatDesignHeight };
      face ??= measureMobileSeatFace(spine, layers[1].actor, rotation, framing?.slot, authored, width, height) ?? false;
      const baseScale = Math.max(width / frame.width, height / frame.height, authored?.scale ?? 0);
      const { focusX = .47, focusY = .40 } = framing ?? {};
      let scale = baseScale;
      // Keep the authored focus and zoom for the existing composition overrides.
      if (face && framing) {
        const targetWidth = Math.min(width, height * 146 / 172);
        const faceScale = (framing.faceWidth ?? .21) * targetWidth / face.width;
        const frameScale = Math.max(
          focusX * width / Math.max(1, face.x - frame.x),
          (1 - focusX) * width / Math.max(1, frame.x + frame.width - face.x),
          focusY * height / Math.max(1, face.y - frame.y),
          (1 - focusY) * height / Math.max(1, frame.y + frame.height - face.y),
        );
        scale = Math.max(baseScale, faceScale, Math.min(frameScale, Math.max(baseScale * 1.35, faceScale)));
      }
      const useFaceFocus = face && framing;
      const preferred = {
        x: useFaceFocus ? face.x + (.5 - focusX) * width / scale : authored?.x ?? frame.x + frame.width / 2,
        y: useFaceFocus ? face.y + (.5 - focusY) * height / scale : authored?.y ?? frame.y + frame.height / 2,
        scale,
      };
      if (useFaceFocus) return fitMobileSeat(frame, width, height, preferred);
      const placement = fitMobileSeat(frame, width, height, preferred, face, authored);
      // The frame estimate can exclude usable pixels from either skeleton.
      // Inspect their composite only when the camera had to leave that frame.
      if (!placement.verifyCoverage || effect || backdropCoverage(frame, placement, width, height) >= minimumSeatCoverage) {
        return placement;
      }
      const coverage = sampleSeat(placement, width, height);
      if (coverage === undefined || coverage >= minimumSeatCoverage) return placement;
      // In a rig with unfamiliar slot names, retain a full frame if the
      // character layer has substantial coverage in the middle of that frame.
      if (!face) {
        const covered = fitMobileSeat(frame, width, height, preferred);
        if (sampleSeat(covered, width, height, true) >= .22) return covered;
      }
    }
    function fit(x, y, width, height) {
      // Both skeletons share the same origin in the mobile client. Keep their
      // authored registration and adapt the viewport to OL's portrait clip.
      const size = width + '/' + height;
      if (seatSize !== size) {
        seatPlacement = planSeat(width, height);
        seatSize = size;
      }
      if (!seatPlacement) return;
      const { x: centerX, y: centerY, scale } = seatPlacement;
      positionLayers(x + width / 2 - centerX * scale, y + height / 2 - centerY * scale, scale);
      return height * seatOverflowRatio;
    }
    return { actor, dispose, effects, playEffect, fit, stopEffect: () => effect?.finish(false),
      setSmoothIdle: setCharacterRate && (smooth => { smoothIdle = smooth; syncIdleRate(); }),
      setPlaying,
      renderOverhang(context) {
        // Keep in-seat effects out of the narrow idle overhang.
        if (effect || disposed) return;
        backdropOverflow?.render(context);
        layers[1].actor.render(context, 0, 0);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
