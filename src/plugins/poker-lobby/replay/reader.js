export const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_EVENTS = 20000;
const decodeText = bytes => new TextDecoder().decode(bytes);
const SERVER_TAG = 'SanGuoShaServer';

export class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = 0;
  }
  get remaining() { return this.bytes.length - this.position; }
  take(size) {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.remaining) throw new Error('录像数据在读取完成前结束');
    const offset = this.position;
    this.position += size;
    return this.bytes.subarray(offset, this.position);
  }
  uint32() {
    const offset = this.position;
    this.take(4);
    return this.view.getUint32(offset, true);
  }
  uint16() {
    const offset = this.position;
    this.take(2);
    return this.view.getUint16(offset, true);
  }
  varint() {
    let result = 0n;
    for (let shift = 0n; shift <= 63n; shift += 7n) {
      const byte = this.take(1)[0];
      if (shift === 63n && byte > 1) break;
      result |= BigInt(byte & 127) << shift;
      if (byte < 128) return result;
    }
    throw new Error('录像中的可变长整数无效');
  }
  string() { return decodeText(this.take(Number(this.varint()))); }
}

export function fields(bytes) {
  const result = new Map();
  const reader = new Reader(bytes);
  while (reader.remaining) {
    const tag = Number(reader.varint());
    const field = tag >>> 3;
    const wire = tag & 7;
    if (tag > 0xffffffff || !field) throw new Error('录像消息字段编号无效');
    let value;
    switch (wire) {
      case 0: value = reader.varint(); break;
      case 1: reader.take(8); continue;
      case 2: value = reader.take(Number(reader.varint())); break;
      case 5: reader.take(4); continue;
      default: throw new Error('录像消息含有未知编码');
    }
    if (!result.has(field)) result.set(field, []);
    result.get(field).push(value);
  }
  return result;
}

export function number(message, field, fallback = 0) {
  const value = message?.get(field)?.at(-1);
  return typeof value === 'bigint' ? Number(BigInt.asUintN(32, value)) : fallback;
}

export function signed(message, field) {
  return number(message, field) | 0;
}

export function messages(message, field) {
  return (message?.get(field) || []).filter(value => value instanceof Uint8Array).map(fields);
}

export function numbers(message, field) {
  const result = [];
  for (const value of message.get(field) || []) {
    if (typeof value === 'bigint') result.push(Number(BigInt.asUintN(32, value)));
    else {
      const reader = new Reader(value);
      while (reader.remaining) result.push(Number(BigInt.asUintN(32, reader.varint())));
    }
  }
  return result;
}

function string(message, field) {
  const value = message.get(field)?.at(-1);
  return value instanceof Uint8Array ? decodeText(value) : '';
}

async function expand(bytes, format, limit) {
  let stream;
  try { stream = new DecompressionStream(format); }
  catch { throw new Error('当前浏览器不支持这份录像使用的压缩格式'); }
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('录像解压后超过读取上限');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

// The official .sip export wraps exactly one server recording in a ZIP.
function isZip(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

export function isReplayCandidate(bytes) {
  return isZip(bytes) || decodeText(bytes.subarray(0, 48)).includes(SERVER_TAG);
}

async function unwrap(bytes) {
  const reader = new Reader(bytes);
  const { view } = reader;
  if (!isZip(bytes)) return bytes;
  let end = bytes.length - 22;
  const lowerBound = Math.max(0, bytes.length - 65557);
  while (end >= lowerBound) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    end--;
  }
  if (end < lowerBound || view.getUint32(end + 4, true) || view.getUint16(end + 8, true) !== 1
      || view.getUint16(end + 10, true) !== 1) throw new Error('请选择只包含一局录像的官方 .sip 文件');
  const entry = view.getUint32(end + 16, true);
  const directorySize = view.getUint32(end + 12, true);
  if (directorySize < 46 || entry + directorySize !== end || view.getUint32(entry, true) !== 0x02014b50) {
    throw new Error('录像压缩包目录无效');
  }
  const flags = view.getUint16(entry + 8, true);
  const method = view.getUint16(entry + 10, true);
  const packed = view.getUint32(entry + 20, true);
  const size = view.getUint32(entry + 24, true);
  const nameLength = view.getUint16(entry + 28, true);
  const local = view.getUint32(entry + 42, true);
  const name = decodeText(bytes.subarray(entry + 46, entry + 46 + nameLength));
  if ((flags & 1) || size > MAX_FILE_BYTES || 46 + nameLength > directorySize || !/\.sgs$/i.test(name)
      || local + 30 > entry || view.getUint32(local, true) !== 0x04034b50
      || view.getUint16(local + 8, true) !== method) throw new Error('不支持这份录像压缩包的条目格式');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  if (start > entry || start + packed > entry) throw new Error('录像压缩包中的文件范围无效');
  const raw = bytes.subarray(start, start + packed);
  const payload = method === 0 ? raw : method === 8 ? await expand(raw, 'deflate-raw', size) : null;
  if (!payload || payload.length !== size) throw new Error('录像解压后的长度与目录不符');
  return payload;
}

const BATTLE_EVENTS = new Set([
  201000, 201001, 201004, 201005, 201006, 201013, 201014, 201017, 201019, 201020, 201021,
  201025, 201028, 201029, 201030, 201032, 201033, 201034, 201035, 201037, 201071, 108023,
]);
const DECISION_REQUESTS = new Set([201023, 201027, 201031]);

function readServerHeader(data) {
  const version = data.string();
  if (!/^\d+\.\d+\.\d+$/.test(version) || data.string() !== SERVER_TAG) return null;
  const formatVersion = Number(version.replace(/\./g, ''));
  if (formatVersion < 3310) throw new Error(`暂不支持这份录像的版本 ${version}`);
  data.take(8);
  const durationSeconds = data.uint32();
  for (let i = 0; i < 4; i++) data.string();
  data.take(8);
  const mode = data.uint32();
  const section = data.uint32();
  data.take(4);
  data.string();
  return { version, durationSeconds, mode, section };
}

export async function readReplay(bytes, signal, { passthrough = false } = {}) {
  if (!bytes?.length || bytes.length > MAX_FILE_BYTES) {
    if (passthrough) return null;
    throw new Error('录像文件大小须在 12 MB 以内');
  }
  let data, info;
  try {
    data = new Reader(await unwrap(bytes));
    info = readServerHeader(data);
  } catch (error) {
    if (passthrough) return null;
    throw error;
  }
  if (!info) {
    if (passthrough) return null;
    throw new Error('请选择重制版导出的三国斗地主多视角录像');
  }
  const { version, durationSeconds, mode, section } = info;
  if (mode !== 175) {
    if (passthrough) return null;
    throw new Error('这份录像不属于扑克牌三国斗地主模式');
  }
  const headerSize = data.uint32();
  if (headerSize > MAX_EVENT_BYTES) throw new Error('录像头信息超过读取上限');
  const header = fields(data.take(headerSize));
  if (number(header, 3) !== 47 || number(header, 4) !== mode || number(header, 5) !== section) {
    throw new Error('这份录像不属于扑克牌三国斗地主模式');
  }
  const seatClientIds = new Map();
  const seats = messages(header, 50).map(row => {
    const id = number(row, 1);
    // The native replay header calls this field uid and matches it to ClientId.
    const uid = row.get(2)?.at(-1);
    if (typeof uid === 'bigint' && uid > 0n && uid <= 0xffffffffn) seatClientIds.set(id, String(uid));
    return { id, name: string(row, 3).slice(0, 64) };
  });
  seats.sort((a, b) => a.id - b.id);
  if (seats.length !== 3 || new Set(seats.map(seat => seat.id)).size !== 3 || seats.some(seat => seat.id > 8)) {
    throw new Error('录像没有包含三个可用座位');
  }
  const events = [];
  let previous = 0;
  let frameCount = 0;
  while (data.remaining) {
    if (signal?.aborted) throw new Error('录像读取已取消');
    const time = data.uint32();
    if (!data.remaining) break; // Some recordings end with a timestamp only.
    if (time < previous || ++frameCount > MAX_EVENTS) throw new Error('录像时间顺序或消息数量无效');
    previous = time;
    const direction = data.uint32();
    const mask = data.uint32();
    const kind = data.uint32();
    data.take(4);
    const frameVersion = data.uint32();
    const protobuf = frameVersion > 2217 && kind > 100000 ? data.uint32() : 0;
    if (frameVersion > 2217 && frameVersion < 3310 && kind > 100000) data.take(8);
    const compressed = frameVersion >= 3310 && data.uint16() > 0;
    const size = data.uint32();
    if (size > MAX_EVENT_BYTES) throw new Error('录像单条消息超过读取上限');
    const payload = data.take(size);
    const request = direction === 2 && DECISION_REQUESTS.has(kind);
    if (!request && (direction !== 1 || !BATTLE_EVENTS.has(kind))) continue;
    if (protobuf !== 1) throw new Error('录像包含暂不支持的牌局消息编码');
    const bytes = compressed ? await expand(payload, 'deflate', MAX_EVENT_BYTES) : payload;
    events.push({ time, kind, mask, body: fields(bytes), ...(request ? { request } : {}) });
  }
  if (!events.some(event => event.kind === 201005 || event.kind === 201035)) throw new Error('录像缺少可回放的牌局记录');
  return { version, seats, seatClientIds, events, frameCount, duration: Math.max(durationSeconds * 1000, previous) };
}
