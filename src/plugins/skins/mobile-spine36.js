// Read pre-string-table Spine 3.6.38 exports and feed the equivalent data to
// the game's existing Spine 4 JSON loader. The old and current files use
// different binary layouts and Bezier coordinates.
const transforms = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'];
const blends = ['normal', 'additive', 'multiply', 'screen'];
const positions = ['fixed', 'percent'];
const spacings = ['length', 'fixed', 'percent'];
const rotations = ['tangent', 'chain', 'chainScale'];
const hex = (value, digits) => (value >>> 0).toString(16).padStart(digits, '0').slice(-digits);
const colorChannels = (value, count) => Array.from({ length: count }, (_, i) => parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255);
const map = () => Object.create(null);
const invalid = () => { throw new Error('移动版骨骼格式不支持或数据不完整'); };

function list(count, value) {
  return Array.from({ length: count }, (_, i) => value(i));
}

function item(values, index) {
  return values[index] ?? invalid();
}

class Spine36Reader {
  constructor(bytes) {
    if (!(bytes.byteLength > 0 && bytes.byteLength <= 4 * 1024 * 1024)) invalid();
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = 0;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }
  byte() { return this.view.getUint8(this.position++); }
  bool() {
    const flag = this.byte();
    if (flag > 1) invalid();
    return flag === 1;
  }
  short() {
    const value = this.view.getUint16(this.position);
    this.position += 2;
    return value;
  }
  int() {
    const value = this.view.getUint32(this.position);
    this.position += 4;
    return value;
  }
  float() {
    const value = this.view.getFloat32(this.position);
    this.position += 4;
    if (!Number.isFinite(value) || Math.abs(value) > 1e8) invalid();
    return value;
  }
  varint() {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const octet = this.byte();
      if (shift === 28 && octet > 0x0f) invalid();
      value |= (octet & 0x7f) << shift;
      if (!(octet & 0x80)) return value >>> 0;
    }
    return invalid();
  }
  signed() {
    const value = this.varint();
    return (value >>> 1) ^ -(value & 1);
  }
  count(limit = 4096) {
    const count = this.varint();
    if (count > limit || count > this.bytes.length - this.position) invalid();
    return count;
  }
  string() {
    const size = this.varint();
    if (!size) return null;
    if (size > 4096 || this.position + size - 1 > this.bytes.length) invalid();
    const start = this.position;
    this.position += size - 1;
    return this.decoder.decode(this.bytes.subarray(start, this.position));
  }
  name() {
    const name = this.string();
    if (!name) invalid();
    return name;
  }
  floats(count) {
    if (count * 4 > this.bytes.length - this.position) invalid();
    return list(count, () => this.float());
  }
  vertices(count, boneCount) {
    if (!this.bool()) return this.floats(count * 2);
    const vertices = [];
    for (let i = 0; i < count; i++) {
      const weights = this.count(32);
      if (!weights) invalid();
      vertices.push(weights);
      for (let j = 0; j < weights; j++) {
        const bone = this.varint();
        if (bone >= boneCount) invalid();
        vertices.push(bone, ...this.floats(3));
      }
    }
    return vertices;
  }
}

function readAttachment(reader, key, boneCount, slots, extra) {
  const name = reader.string() || key;
  const type = reader.byte();
  if (type === 0) {
    const path = reader.string() || name;
    const [rotation, x, y, scaleX, scaleY, width, height] = reader.floats(7);
    return { name, type: 'region', path, rotation, x, y, scaleX, scaleY, width, height, color: hex(reader.int(), 8) };
  }
  if (type === 2 || type === 3) {
    const path = reader.string() || name;
    const color = hex(reader.int(), 8);
    if (type === 3) {
      const skin = reader.string() || 'default';
      const parent = reader.name();
      const deform = reader.bool();
      if (extra) reader.floats(2);
      return { name, type: 'linkedmesh', path, color, skin, parent, deform };
    }
    const count = reader.count();
    const uvs = reader.floats(count * 2);
    const triangles = list(reader.count(65535), () => {
      const index = reader.short();
      return index < count ? index : invalid();
    });
    const vertices = reader.vertices(count, boneCount);
    const hull = reader.count();
    if (extra) {
      list(reader.count(65535), () => reader.short());
      reader.floats(2);
    }
    return { name, type: 'mesh', path, color, uvs, triangles, vertices, hull };
  }
  const types = { 1: 'boundingbox', 4: 'path', 5: 'point', 6: 'clipping' };
  const attachment = { name, type: types[type] ?? invalid() };
  if (type === 4) Object.assign(attachment, { closed: reader.bool(), constantSpeed: reader.bool() });
  if (type === 6) attachment.end = item(slots, reader.varint()).name;
  if (type === 5) {
    const [rotation, x, y] = reader.floats(3);
    Object.assign(attachment, { rotation, x, y });
  } else {
    const vertexCount = reader.count();
    Object.assign(attachment, { vertexCount, vertices: reader.vertices(vertexCount, boneCount) });
    if (type === 4) attachment.lengths = reader.floats(Math.floor(vertexCount / 3));
  }
  if (extra) attachment.color = hex(reader.int(), 8);
  return attachment;
}

function readSkin(reader, name, bones, slots, extra) {
  const attachments = map();
  for (let n = reader.count(); n > 0; n--) {
    const slot = item(slots, reader.varint()).name;
    const entries = attachments[slot] = map();
    for (let count = reader.count(); count > 0; count--) {
      const key = reader.name();
      entries[key] = readAttachment(reader, key, bones.length, slots, extra);
    }
  }
  return { name, attachments };
}

function bezierValues(points, first, next, from, to) {
  return points.flatMap((weight, i) => {
    const [cx1, cy1, cx2, cy2] = weight;
    const dt = next - first, dv = to[i] - from[i];
    return [first + cx1 * dt, from[i] + cy1 * dv, first + cx2 * dt, from[i] + cy2 * dv];
  });
}

function readFrames(reader, count, properties, read, curves = true, channels = key => properties.map(name => key[name])) {
  const values = [], easing = [];
  for (let i = 0; i < count; i++) {
    const time = reader.float();
    if (time < 0 || (i && time < values[i - 1].time) || time > 600) invalid();
    values.push({ time, ...read() });
    if (curves && i + 1 < count) {
      const curve = reader.byte();
      if (curve > 2) invalid();
      easing.push(curve === 2 ? reader.floats(4) : curve);
    }
  }
  for (const [i, curve] of easing.entries()) {
    if (curve === 1) values[i].curve = 'stepped';
    else if (curve) {
      const [start, end] = [values[i], values[i + 1]];
      const from = channels(start, 0), to = channels(end, 1);
      start.curve = bezierValues(from.map(() => curve), start.time, end.time, from, to);
    }
  }
  return values;
}

function readAnimation(reader, { bones, slots, ik, transform, path, skins, eventNames }) {
  const animation = { slots: map(), bones: map(), ik: map(), transform: map(), path: map(), deform: map() };
  const floats = names => Object.fromEntries(names.map(name => [name, reader.float()]));
  for (let n = reader.count(); n > 0; n--) {
    const timelines = animation.slots[item(slots, reader.varint()).name] = map();
    for (let count = reader.count(3); count > 0; count--) {
      const type = reader.byte(), frames = reader.count(10000);
      if (type === 0) timelines.attachment = readFrames(reader, frames, [], () => ({ name: reader.string() }), false);
      else if (type === 1) timelines.rgba = readFrames(reader, frames, [], () => ({ color: hex(reader.int(), 8) }),
        true, key => colorChannels(key.color, 4));
      else if (type === 2) timelines.rgba2 = readFrames(reader, frames, [], () => ({ light: hex(reader.int(), 8), dark: hex(reader.int(), 6) }),
        true, key => [...colorChannels(key.light, 4), ...colorChannels(key.dark, 3)]);
      else invalid();
    }
  }
  for (let n = reader.count(); n > 0; n--) {
    const timelines = animation.bones[item(bones, reader.varint()).name] = map();
    for (let count = reader.count(4); count > 0; count--) {
      const type = reader.byte(), frames = reader.count(10000);
      const name = item(['rotate', 'translate', 'scale', 'shear'], type);
      const fields = type === 0 ? ['value'] : ['x', 'y'];
      timelines[name] = readFrames(reader, frames, fields, () => floats(fields));
    }
  }
  for (let n = reader.count(); n > 0; n--) {
    const name = item(ik, reader.varint()).name, frames = reader.count(10000);
    animation.ik[name] = readFrames(reader, frames, ['mix', 'softness'],
      () => ({ mix: reader.float(), softness: 0, bendPositive: reader.byte() === 1 }));
  }
  for (let n = reader.count(); n > 0; n--) {
    const name = item(transform, reader.varint()).name, frames = reader.count(10000);
    animation.transform[name] = readFrames(reader, frames, ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'], () => {
      const [mixRotate, mixX, mixScaleX, mixShearY] = reader.floats(4);
      return { mixRotate, mixX, mixY: mixX, mixScaleX, mixScaleY: mixScaleX, mixShearY };
    });
  }
  for (let n = reader.count(); n > 0; n--) {
    const timelines = animation.path[item(path, reader.varint()).name] = map();
    for (let count = reader.count(3); count > 0; count--) {
      const type = reader.byte(), frames = reader.count(10000);
      if (type <= 1) timelines[type === 0 ? 'position' : 'spacing'] = readFrames(reader, frames, ['value'], () => floats(['value']));
      else if (type === 2) timelines.mix = readFrames(reader, frames, ['mixRotate', 'mixX', 'mixY'], () => {
        const [mixRotate, mixX] = reader.floats(2);
        return { mixRotate, mixX, mixY: mixX };
      });
      else invalid();
    }
  }
  for (let n = reader.count(); n > 0; n--) {
    const skin = item(skins, reader.varint());
    const skinTimeline = animation.deform[skin.name] = map();
    for (let slotCount = reader.count(); slotCount > 0; slotCount--) {
      const slot = item(slots, reader.varint()).name;
      const attachments = skinTimeline[slot] = map();
      for (let count = reader.count(); count > 0; count--) {
        const attachment = reader.name();
        if (!Object.hasOwn(skin.attachments[slot] ?? {}, attachment)) invalid();
        const frames = reader.count(10000);
        // Deform curves interpolate the blend from zero to one.
        attachments[attachment] = readFrames(reader, frames, [], () => {
          const count = reader.count(16384);
          return count ? { offset: reader.varint(), vertices: reader.floats(count) } : {};
        }, true, (_key, position) => [position]);
      }
    }
  }
  const drawOrder = list(reader.count(10000), () => {
    const time = reader.float();
    let previous = -1;
    const destinations = new Set();
    const offsets = list(reader.count(slots.length), () => {
      const index = reader.varint(), offset = reader.varint() | 0, destination = index + offset;
      if (index <= previous || destination < 0 || destination >= slots.length || destinations.has(destination)) invalid();
      previous = index;
      destinations.add(destination);
      return { slot: item(slots, index).name, offset };
    });
    return { time, offsets };
  });
  const events = list(reader.count(10000), () => {
    const time = reader.float(), name = item(eventNames, reader.varint()), int = reader.signed(), float = reader.float();
    return reader.bool() ? { time, name, int, float, string: reader.string() ?? '' } : { time, name, int, float };
  });
  if (drawOrder.length) animation.drawOrder = drawOrder;
  if (events.length) animation.events = events;
  return animation;
}

export function readMobileSpine36(bytes) {
  const reader = new Spine36Reader(bytes);
  const hash = reader.string();
  if (reader.string() !== '3.6.38') invalid();
  const [width, height] = reader.floats(2);
  const extra = reader.bool();
  if (extra) {
    reader.float();
    reader.string();
  }
  const bones = [];
  for (let n = reader.count(); n > 0; n--) {
    const name = reader.name(), parent = bones.length ? item(bones, reader.varint()).name : undefined;
    const [rotation, x, y, scaleX, scaleY, shearX, shearY, length] = reader.floats(8);
    const transform = item(transforms, reader.varint());
    if (extra) reader.int();
    bones.push({ name, parent, rotation, x, y, scaleX, scaleY, shearX, shearY, length, transform });
  }
  if (!bones.length) invalid();
  const slots = list(reader.count(), () => {
    const name = reader.name(), bone = item(bones, reader.varint()).name;
    const color = hex(reader.int(), 8), tint = reader.int();
    const dark = tint === 0xffffffff ? undefined : hex(tint, 6);
    const attachment = reader.string() ?? undefined;
    return { name, bone, color, dark, attachment, blend: item(blends, reader.varint()) };
  });
  const boneNames = () => list(reader.count(), () => item(bones, reader.varint()).name);
  const ik = list(reader.count(), () => {
    const name = reader.name(), order = reader.varint(), members = boneNames(), target = item(bones, reader.varint()).name;
    const mix = reader.float(), bendPositive = reader.byte() === 1;
    return { name, order, bones: members, target, mix, bendPositive };
  });
  const transform = list(reader.count(), () => {
    const name = reader.name(), order = reader.varint(), members = boneNames(), target = item(bones, reader.varint()).name;
    const local = reader.bool(), relative = reader.bool();
    const [rotation, x, y, scaleX, scaleY, shearY, mixRotate, mixX, mixScaleX, mixShearY] = reader.floats(10);
    return { name, order, bones: members, target, local, relative, rotation, x, y, scaleX, scaleY, shearY,
      mixRotate, mixX, mixY: mixX, mixScaleX, mixScaleY: mixScaleX, mixShearY };
  });
  const path = list(reader.count(), () => {
    const name = reader.name(), order = reader.varint(), members = boneNames(), target = item(slots, reader.varint()).name;
    const positionMode = item(positions, reader.varint()), spacingMode = item(spacings, reader.varint());
    const rotateMode = item(rotations, reader.varint());
    const [rotation, position, spacing, mixRotate, mixX] = reader.floats(5);
    return { name, order, bones: members, target, positionMode, spacingMode, rotateMode, rotation, position, spacing,
      mixRotate, mixX, mixY: mixX };
  });
  const defaultSkin = readSkin(reader, 'default', bones, slots, extra);
  const skins = [defaultSkin, ...list(reader.count(), () => readSkin(reader, reader.name(), bones, slots, extra))];
  const events = map(), eventNames = [];
  for (let n = reader.count(); n > 0; n--) {
    const name = reader.name();
    eventNames.push(name);
    events[name] = { int: reader.signed(), float: reader.float(), string: reader.string() ?? '' };
  }
  const animations = map();
  for (let n = reader.count(256); n > 0; n--) {
    const name = reader.name();
    animations[name] = readAnimation(reader, { bones, slots, ik, transform, path, skins, eventNames });
  }
  if (reader.position !== bytes.byteLength) invalid();
  return { skeleton: { hash, spine: '4.0', width, height }, bones, slots, ik, transform, path, skins, events, animations };
}
