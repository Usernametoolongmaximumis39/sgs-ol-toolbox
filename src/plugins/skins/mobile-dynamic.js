import { readMobileSpine36 } from './mobile-spine36.js';
import { seatPortraitPanel } from './yjcm.js';

const backgroundClips = ['beijing', 'background', 'play'];
const idleClips = ['daiji', 'idle', 'standby', 'play'];
const imageLimit = 8 * 1024 * 1024;
const skeletonLimit = 4 * 1024 * 1024;
const atlasLimit = 256 * 1024;
const atlasPixels = 8 * 1024 * 1024;
const archiveForms = new WeakMap();
// Reference portrait height when adapting the mobile composition to an OL seat.
const seatDesignHeight = 410;
const attackDesignWidth = 1534, attackDesignHeight = 750;
// Only character art is allowed to project into the space just above the seat.
const seatOverflowRatio = .28;
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
const safeIdleSamples = [0, .2, .4, .6, .8];
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

function resizeAtlasPage(doc, image, scale) {
  if (scale >= 1) return image;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function checkedFrame(x, y, width, height) {
  if ([x, y, width, height].every(Number.isFinite) && width > 1 && height > 1) return { x, y, width, height };
}

function rotatedFrame(frame, rotation) {
  if (!rotation) return frame;
  const { x, y, width, height } = frame;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
  const xs = corners.map(([x, y]) => x * cos - y * sin);
  const ys = corners.map(([x, y]) => x * sin + y * cos);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function attachmentFrame(spine, slot, rotation = 0) {
  const attachment = slot?.getAttachment();
  if (!slot?.color.a || !attachment?.color?.a) return;
  let vertices;
  if (attachment instanceof spine.RegionAttachment) {
    vertices = new Float32Array(8);
    attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
  } else if (attachment instanceof spine.MeshAttachment) {
    vertices = new Float32Array(attachment.worldVerticesLength);
    attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
  } else return;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i] * cos + vertices[i + 1] * sin;
    const y = vertices[i] * sin - vertices[i + 1] * cos;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return checkedFrame(left, top, right - left, bottom - top);
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

function measureFace(spine, actor, slotName, rotation) {
  const track = actor.state.getCurrent(0);
  const skeleton = new spine.Skeleton(actor.skeleton.data);
  const slot = skeleton.findSlot(slotName);
  if (!slot || !track?.animation) return;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, width = 0, samples = 0;
  for (const time of safeIdleSamples) {
    skeleton.setToSetupPose();
    track.animation.apply(skeleton, -1, time * track.animation.duration, false, null, 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
    skeleton.updateWorldTransform();
    const frame = attachmentFrame(spine, slot, rotation);
    if (!frame) continue;
    left = Math.min(left, frame.x);
    top = Math.min(top, frame.y);
    right = Math.max(right, frame.x + frame.width);
    bottom = Math.max(bottom, frame.y + frame.height);
    width += frame.width;
    samples++;
  }
  if (samples) return { x: (left + right) / 2, y: (top + bottom) / 2, width: width / samples };
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

async function loadLayer(win, laya, archive, stem, background, signal, rotation, minimumCoverage) {
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
  const clips = background ? backgroundClips : idleClips;
  const names = Object.keys(data.animations);
  const clip = clips.map(clip => names.find(name => name.toLowerCase() === clip)).find(Boolean);
  if (!clip) throw new Error(background ? '移动版动态皮肤没有背景循环' : '移动版动态皮肤没有待机循环');
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
    const scale = Math.min(1, Math.sqrt(atlasPixels / pixels));
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
    if (!(Number.isFinite(duration) && (duration > 0 || (background && duration === 0)))) throw new Error('移动版动画循环无效');
    actor = template.buildArmature();
    actor.forceUpdate = true;
    actor.play(clip, duration > 0, true, 0, 0, true, false);
    // Building one layer can finish well before the other layer's atlas.
    actor.paused();
    const frame = background ? measureBackdrop(laya, win.spine, actor, rotation, minimumCoverage) : undefined;
    if (background && !frame) throw new Error('移动版动画画幅不可用');
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
  const scale = Math.min(width / attackDesignWidth, height / attackDesignHeight);
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

export async function createMobileMotion(win, archive, signal, form = '', layout) {
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
      loadLayer(win, laya, archive, background, true, signal, rotation, framing?.backdropCoverage ?? .2),
      loadLayer(win, laya, archive, character, false, signal, rotation),
    ]);
    for (const result of results) if (result.status === 'fulfilled' && result.value) layers.push(result.value);
    if (signal.aborted) { dispose(); return; }
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    if (layers.length !== 2) throw new Error('移动版动画层不可用');
    const face = framing && measureFace(spine, layers[1].actor, framing.slot, rotation);
    backdropOverflow = createBackdropOverflow(laya, layers[0].actor, layers[0].textures, framing?.backdropSubjects);
    actor = new laya.Sprite();
    actor.name = 'sgs-mobile-idle';
    actor.mouseEnabled = false;
    for (const layer of layers) {
      actor.addChild(layer.actor);
      if (layer.duration) {
        layer.actor.timeKeeper?.update();
        layer.actor.resume();
      }
    }
    signal.addEventListener('abort', dispose, { once: true });
    const effects = mobileEffectSpec(layers[1].data, layers[0].data);
    for (const layer of layers) delete layer.data;
    const plans = [effects.enter, ...effects.actions].filter(Boolean);
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
    function fit(x, y, width, height) {
      // Both skeletons share the same origin in the mobile client. Keep their
      // authored registration and adapt the viewport to OL's portrait clip.
      const { frame } = layers[0];
      const baseScale = Math.max(width / frame.width, height / frame.height, (layout?.scale ?? 0) * height / seatDesignHeight);
      const { focusX = .47, focusY = .40 } = framing ?? {};
      let scale = baseScale;
      if (face) {
        const targetWidth = Math.min(width, height * 146 / 172);
        const faceScale = (framing.faceWidth ?? .21) * targetWidth / face.width;
        const frameScale = Math.max(
          focusX * width / Math.max(1, face.x - frame.x),
          (1 - focusX) * width / Math.max(1, frame.x + frame.width - face.x),
          focusY * height / Math.max(1, face.y - frame.y),
          (1 - focusY) * height / Math.max(1, frame.y + frame.height - face.y),
        );
        // Use the opaque viewport even if a requested framing is unreachable
        // without cropping away most of the official illustration.
        scale = Math.max(baseScale, faceScale, Math.min(frameScale, Math.max(baseScale * 1.35, faceScale)));
      }
      const halfWidth = width / (2 * scale), halfHeight = height / (2 * scale);
      const centerX = face ? face.x + (1 - 2 * focusX) * halfWidth :
        layout ? -layout.offsetX / layout.scale : frame.x + frame.width / 2;
      const centerY = face ? face.y + (1 - 2 * focusY) * halfHeight :
        layout ? layout.offsetY / layout.scale : frame.y + frame.height / 2;
      const clampedX = Math.max(frame.x + halfWidth, Math.min(centerX, frame.x + frame.width - halfWidth));
      const clampedY = Math.max(frame.y + halfHeight, Math.min(centerY, frame.y + frame.height - halfHeight));
      for (const { actor: child } of layers) {
        child.rotation = rotation;
        child.scale(scale, scale);
        child.pos(x + width / 2 - clampedX * scale, y + height / 2 - clampedY * scale);
      }
      return height * seatOverflowRatio;
    }
    return { actor, dispose, effects, playEffect, fit, stopEffect: () => effect?.finish(false),
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
