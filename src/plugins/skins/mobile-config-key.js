import { Decompress } from './vendor/fzstd.js';

const eccPrefix = Uint8Array.of(0x45, 0x43, 0x43, 0x32, 1, 2, 1, 1, 1);
const keyModule = 'app.secret_file';
const outputLimit = 64 * 1024 * 1024;
const keyModuleLimit = 4 * 1024;
const invalidLibrary = () => new Error('移动版引导库格式无效');
const invalidModule = () => new Error('移动版引导参数格式无效');

export function matchesAscii(bytes, offset, length, name) {
  if (length !== name.length) return false;
  for (let i = 0; i < length; i++) {
    if (bytes[offset + i] !== name.charCodeAt(i)) return false;
  }
  return true;
}

function findKeyModule(bytes) {
  if (bytes.length < 51 || !eccPrefix.every((byte, index) => bytes[index] === byte)) throw invalidLibrary();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const outputSize = view.getUint32(9, true), payloadOffset = view.getUint32(25, true) + 33;
  const count = view.getUint32(43, true), end = payloadOffset - 4;
  if (view.getUint32(13, true) || !outputSize || outputSize > outputLimit ||
      end < 47 || payloadOffset >= bytes.length || !count || count > 30000) throw invalidLibrary();
  let cursor = 47, module;
  for (let i = 0; i < count; i++) {
    if (cursor + 10 > end) throw invalidLibrary();
    const nameLength = view.getUint16(cursor, true), nameOffset = cursor + 2;
    const recordOffset = nameOffset + nameLength;
    if (!nameLength || nameLength > 2048 || recordOffset + 8 > end) throw invalidLibrary();
    const offset = view.getUint32(recordOffset, true), size = view.getUint32(recordOffset + 4, true);
    if (!size || offset + size > outputSize) throw invalidLibrary();
    if (matchesAscii(bytes, nameOffset, nameLength, keyModule)) {
      if (module || size > keyModuleLimit) throw invalidLibrary();
      module = { offset, size };
    }
    cursor = recordOffset + 8;
  }
  if (!module || cursor !== end) throw invalidLibrary();
  return { ...module, outputSize, payloadOffset };
}

function validateFrame(bytes, outputSize) {
  if (bytes.length < 8) throw invalidLibrary();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const descriptor = bytes[4], singleSegment = Boolean(descriptor & 32), flag = descriptor >>> 6;
  if (view.getUint32(0, true) !== 0xfd2fb528 || (descriptor & 27) || (!singleSegment && !flag)) throw invalidLibrary();
  let cursor = 5;
  if (!singleSegment) {
    const window = bytes[cursor++], base = 2 ** (10 + (window >>> 3));
    if (base * (1 + (window & 7) / 8) > outputLimit) throw invalidLibrary();
  }
  const sizeBytes = flag ? 2 ** flag : 1;
  if (cursor + sizeBytes > bytes.length) throw invalidLibrary();
  let size = 0;
  for (let i = 0; i < sizeBytes; i++) size += bytes[cursor++] * (256 ** i);
  if (size + (flag === 1 ? 256 : 0) !== outputSize) throw invalidLibrary();
  let last = false;
  while (!last) {
    if (cursor + 3 > bytes.length) throw invalidLibrary();
    const header = bytes[cursor] | (bytes[cursor + 1] << 8) | (bytes[cursor + 2] << 16);
    const type = (header >>> 1) & 3, blockSize = header >>> 3;
    if (type === 3 || blockSize > 131072) throw invalidLibrary();
    cursor += 3 + (type === 1 ? 1 : blockSize);
    last = Boolean(header & 1);
  }
  if (cursor + (descriptor & 4 ? 4 : 0) !== bytes.length) throw invalidLibrary();
}

function readKeyModule(bytes) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  if (bytes[0] !== 27 || !matchesAscii(bytes, 1, 2, 'LJ') || bytes[3] !== 2) throw invalidModule();
  let cursor = 4, limit = bytes.length;
  function skip(length) {
    if (cursor + length > limit) throw invalidModule();
    const offset = cursor;
    cursor += length;
    return offset;
  }
  function integer() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = bytes[skip(1)];
      value += (byte & 127) * (2 ** (i * 7));
      if (byte < 128 && value <= 0xffffffff) return value;
    }
    throw invalidModule();
  }
  function text(length) {
    if (length < 0 || length > 128) throw invalidModule();
    const offset = skip(length);
    return decoder.decode(bytes.subarray(offset, cursor));
  }
  const flags = integer(), stripped = Boolean(flags & 2);
  if (flags & ~14 || (!stripped && text(integer()) !== '@app/secret_file.lua')) throw invalidModule();
  const prototypeSize = integer();
  if (!prototypeSize || cursor + prototypeSize !== bytes.length - 1 || bytes[bytes.length - 1] !== 0) throw invalidModule();
  limit--;
  const header = skip(4);
  const constants = integer(), numbers = integer(), instructions = integer();
  const debugSize = stripped ? 0 : integer();
  if (debugSize) { integer(); integer(); }
  if (bytes[header + 1] || bytes[header + 3] || constants !== 1 || numbers || !instructions) throw invalidModule();
  skip(instructions * 4);
  // One LuaJIT table constant with two string fields. No bytecode is executed.
  if (integer() !== 1 || integer() !== 0 || integer() !== 2) throw invalidModule();
  const fields = new Map();
  for (let i = 0; i < 2; i++) {
    const key = text(integer() - 5), value = text(integer() - 5);
    if (fields.has(key)) throw invalidModule();
    fields.set(key, value);
  }
  const secretKey = new TextEncoder().encode(fields.get('secret_key'));
  const keyVersion = fields.get('secret_version');
  if (secretKey.length !== 16 || !/^\d{11}$/.test(keyVersion ?? '') || cursor + debugSize !== limit) throw invalidModule();
  return { secretKey, keyVersion };
}

export async function readMobileConfigKey(win, library, checkActive) {
  const { offset, size, outputSize, payloadOffset } = findKeyModule(library);
  const frame = library.subarray(payloadOffset);
  for (let i = 0; i < frame.length; i++) frame[i] ^= 0x7a;
  validateFrame(frame, outputSize);
  let written = 0;
  const result = new Uint8Array(size);
  const stream = new Decompress(chunk => {
    const end = written + chunk.length;
    if (end > outputSize) throw invalidLibrary();
    const from = Math.max(written, offset), to = Math.min(end, offset + size);
    if (from < to) result.set(chunk.subarray(from - written, to - written), from - offset);
    written = end;
  });
  const step = 256 * 1024;
  for (let i = 0; i < frame.length; i += step) {
    checkActive();
    try { stream.push(frame.subarray(i, i + step), i + step >= frame.length); }
    catch { throw invalidLibrary(); }
    if ((i / step + 1) % 8 === 0) await new Promise(resolve => win.setTimeout(resolve, 0));
  }
  checkActive();
  if (written !== outputSize) throw invalidLibrary();
  return readKeyModule(result);
}
