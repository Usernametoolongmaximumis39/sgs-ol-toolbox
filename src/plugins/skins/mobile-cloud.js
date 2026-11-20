const versionUrl = 'https://waym.sanguosha.cn/update/cloud.php';
const resourceRoot = 'https://mres.sanguosha.cn/update_cloud/public/';
const versionLimit = 16 * 1024;
const indexLimit = 12 * 1024 * 1024;
const assetLimit = 64 * 1024 * 1024;
const versionPattern = /^\d{6,12}$/;
const digestPattern = /^[a-f\d]{32}$/;
const resourcePath = /^[\w #!+@().-]+(?:\/[\w #!+@().-]+)+$/;
const collator = new Intl.Collator('en', { numeric: true });

// Web Crypto does not implement MD5. The official manifest publishes this
// checksum for the ZIP bytes, so verify those bytes before reading the ZIP.
const md5Shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
const md5Constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

export function mobileMd5(bytes) {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bytes.length * 8, true);
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let mix, word;
      const round = i >> 4;
      if (round === 0) { mix = (b & c) | (~b & d); word = i; }
      else if (round === 1) { mix = (d & b) | (~d & c); word = (5 * i + 1) & 15; }
      else if (round === 2) { mix = b ^ c ^ d; word = (3 * i + 5) & 15; }
      else { mix = c ^ (b | ~d); word = (7 * i) & 15; }
      const next = (a + mix + md5Constants[i] + view.getUint32(offset + word * 4, true)) | 0;
      const shift = md5Shifts[round][i & 3];
      a = d; d = c; c = b;
      b = (b + ((next << shift) | (next >>> (32 - shift)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const result = new Uint8Array(16), digest = new DataView(result.buffer);
  [a0, b0, c0, d0].forEach((word, i) => digest.setUint32(i * 4, word, true));
  return Array.from(result, value => value.toString(16).padStart(2, '0')).join('');
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});

export function crc32(bytes) {
  let crc = -1;
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff];
  return (~crc) >>> 0;
}

export async function inflateMobileZipMember(win, payload, { size, checksum }, signal) {
  if (typeof win.DecompressionStream !== 'function') throw new Error('移动版资源 ZIP 解压不可用');
  const invalid = () => new Error('移动版资源 ZIP 文件校验失败');
  // ZIP method 8 is raw DEFLATE. The gzip wrapper works on engines without deflate-raw.
  const header = Uint8Array.of(31, 139, 8, 0, 0, 0, 0, 0, 0, 255);
  const footer = new DataView(new ArrayBuffer(8));
  footer.setUint32(0, checksum, true);
  footer.setUint32(4, size, true);
  const stream = new win.Blob([header, payload, footer.buffer]).stream().pipeThrough(new win.DecompressionStream('gzip'));
  const reader = stream.getReader(), result = new Uint8Array(size);
  let length = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw cancelled();
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > size) throw invalid();
      result.set(value, length);
      length += value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  if (signal?.aborted) throw cancelled();
  if (length !== size) throw invalid();
  return result;
}

export function openMobileZip(win, buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = () => new Error('移动版资源 ZIP 目录无效');
  const u16 = offset => view.getUint16(offset, true), u32 = offset => view.getUint32(offset, true);
  const decode = new TextDecoder('utf-8', { fatal: true });
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6)) throw valid();
  const count = u16(end + 10), directory = u32(end + 16);
  if (count > 4096 || count !== u16(end + 8) || directory + u32(end + 12) !== end) throw valid();
  const entries = new Map();
  let cursor = directory;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw valid();
    const nameStart = cursor + 46, nameEnd = nameStart + u16(cursor + 28);
    const next = nameEnd + u16(cursor + 30) + u16(cursor + 32);
    if (next > end || u16(cursor + 34)) throw valid();
    const name = decode.decode(bytes.subarray(nameStart, nameEnd));
    if (!name || name.startsWith('/') || /[\\:\u0000-\u001f]/.test(name) ||
        name.split('/').some(part => part === '.' || part === '..') || entries.has(name)) throw valid();
    entries.set(name, { flags: u16(cursor + 8), method: u16(cursor + 10), checksum: u32(cursor + 16),
      packed: u32(cursor + 20), size: u32(cursor + 24), offset: u32(cursor + 42) });
    cursor = next;
  }
  if (cursor !== end) throw valid();

  async function read(name, { limit = indexLimit } = {}) {
    const entry = entries.get(name);
    if (!entry) throw new Error('移动版资源 ZIP 缺少文件');
    const { flags, method, checksum, packed, size, offset } = entry;
    const bound = Math.min(assetLimit, limit);
    if (!Number.isFinite(bound) || size > bound || packed > assetLimit || flags & 1 ||
        offset + 30 > directory || u32(offset) !== 0x04034b50 || u16(offset + 8) !== method) throw valid();
    const nameEnd = offset + 30 + u16(offset + 26);
    const start = nameEnd + u16(offset + 28);
    if (start + packed > directory || decode.decode(bytes.subarray(offset + 30, nameEnd)) !== name) throw valid();
    const payload = bytes.subarray(start, start + packed);
    if (method === 0 && size === packed && crc32(payload) === checksum) return payload.slice();
    if (method !== 8) throw new Error('移动版资源 ZIP 解压不可用');
    return inflateMobileZipMember(win, payload, { size, checksum });
  }
  return { names: [...entries.keys()], read };
}

const namedPaths = [
  [/^ui\/face\/skin\/(\d+(?:#\d+)?)\.png$/, 'portrait'],
  [/^ui\/icon\/skin\/(\d+(?:#\d+)?)\.png$/, 'head'],
  [/^ui\/bface\/skin\/(\d+(?:#\d+)?)_\d+ *\.jpg$/, 'previews'],
  [/^ui\/bface\/skin\/horSkin\/(\d+(?:#\d+)?)_\d+_horizon\.jpg$/, 'landscapes'],
  [/^ui\/face\/skin\/dynamicSkin\/(\d+(?:#\d+)?)_\d+\.zip$/, 'motions'],
  [/^audio\/dead\/dieskin_(\d+(?:#\d+)?)(?:_\d+)?\.mp3$/, 'death'],
  [/^audio\/effect\/effect_dynamicSkin_(\d+(?:#\d+)?)\.mp3$/, 'effect'],
];
const characterPaths = [
  [/^ui\/face\/char\/([1-9]\d{0,11})\.png$/, 'portrait'],
  [/^ui\/icon\/char\/([1-9]\d{0,11})\.png$/, 'head'],
  [/^ui\/sface\/char\/([1-9]\d{0,11})\.png$/, 'standing'],
  [/^ui\/bface\/char\/([1-9]\d{0,11})_\d+ *\.jpg$/, 'previews'],
  [/^ui\/bface\/char\/horChar\/([1-9]\d{0,11})_\d+_horizon\.jpg$/, 'landscapes'],
];
const voicePath = /^audio\/skill\/SKILL_(\d+(?:#\d+)?)_([\w#]+?)\.mp3$/;
const catalogueEntry = /^\s*\["([^"]+)"\]\s*=\s*\{file="([^"]+)",code="([\da-f]{32})",size=(\d+)\},\s*$/;

function assetRow(table, id) {
  if (!table.has(id)) table.set(id, { id, previews: [], landscapes: [], motions: [], voices: new Map(), death: [] });
  return table.get(id);
}

function assignPath(table, patterns, path) {
  for (const [pattern, field] of patterns) {
    const id = pattern.exec(path)?.[1];
    if (!id) continue;
    const entry = assetRow(table, id);
    if (Array.isArray(entry[field])) entry[field].push(path);
    else entry[field] = path;
    break;
  }
}

function characterArt(resources) {
  const characters = new Map();
  for (const path of resources.keys()) if (path.startsWith('ui/')) assignPath(characters, characterPaths, path);
  for (const { previews, landscapes } of characters.values()) {
    previews.sort(collator.compare);
    landscapes.sort(collator.compare);
  }
  return characters;
}

function buildIndex(text, version, digest) {
  const header = /^return\s*\{\s*version\s*=\s*"(\d+)",\s*dic\s*=\s*\{\s*\r?\n/;
  const footer = /\r?\n\s*\}\s*\}\s*$/;
  const start = header.exec(text), end = footer.exec(text);
  if (start?.[1] !== version || !end) throw new Error('移动版云资源目录版本或格式无效');
  const resources = new Map(), skins = new Map();
  for (const line of text.slice(start[0].length, end.index).split('\n')) {
    const match = catalogueEntry.exec(line);
    if (!match) throw new Error('移动版云资源条目格式无效');
    const [, path, file, md5, sizeText] = match;
    const size = Number(sizeText), folder = path.slice(0, path.lastIndexOf('/') + 1), extension = /\.[a-z\d]+$/i.exec(path)?.[0];
    if (!extension || !resourcePath.test(path) || path.split('/').some(part => part === '.' || part === '..') ||
        file !== folder + md5 + extension || !Number.isSafeInteger(size) || size < 1 || resources.has(path)) {
      throw new Error('移动版云资源路径或大小无效');
    }
    const url = resourceRoot + file.split('/').map(encodeURIComponent).join('/');
    resources.set(path, { url, md5, size });
    assignPath(skins, namedPaths, path);
    const voice = voicePath.exec(path);
    if (voice) {
      const entry = assetRow(skins, voice[1]), code = voice[2].replace(/_\d+$/, '');
      if (!entry.voices.has(code)) entry.voices.set(code, []);
      entry.voices.get(code).push(path);
    }
  }
  const characters = characterArt(resources);
  if (!resources.size || (!skins.size && !characters.size)) throw new Error('移动版云资源目录为空');
  for (const entry of skins.values()) {
    for (const paths of [entry.previews, entry.landscapes, entry.motions, entry.death, ...entry.voices.values()]) paths.sort(collator.compare);
  }
  return { version, md5: digest, resources, skins, characters };
}

const cancelled = () => new Error('移动版资源读取已取消');

function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function createMobileCloud(win, download) {
  const lifetime = new AbortController();
  const dbKey = 'sgs-toolbox-mobile-cloud-v1';
  const verified = new WeakSet();
  let database, warming, pending, current;

  function openDatabase() {
    database ??= new Promise((resolve, reject) => {
      const request = win.indexedDB.open(dbKey, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('index');
      request.onsuccess = () => {
        const db = request.result;
        if (blocked || lifetime.signal.aborted) { db.close(); reject(cancelled()); }
        else { db.onversionchange = () => db.close(); resolve(db); }
      };
      request.onblocked = () => { blocked = true; reject(new Error('移动版资源缓存暂不可用')); };
      request.onerror = () => reject(request.error);
    });
    return database;
  }
  async function cache(mode, operation) {
    const db = await openDatabase();
    if (lifetime.signal.aborted) throw cancelled();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('index', mode);
      const request = operation(tx.objectStore('index'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  }
  function warm() {
    warming ??= cache('readonly', store => store.get('current')).then(record => {
      if (!lifetime.signal.aborted && versionPattern.test(record?.version) && digestPattern.test(record?.md5) &&
          record.resources instanceof Map && record.resources.size && record.skins instanceof Map) {
        if (!(record.characters instanceof Map)) record.characters = characterArt(record.resources);
        if (!record.skins.size && !record.characters.size) return;
        verified.add(record);
        current = record;
      }
    }).catch(() => {});
    return warming;
  }
  async function bytes(url, limit, signal = lifetime.signal) {
    if (lifetime.signal.aborted || signal.aborted) throw cancelled();
    const result = await download(url, { limit, signal });
    if (lifetime.signal.aborted || signal.aborted) throw cancelled();
    if (Object.prototype.toString.call(result) !== '[object ArrayBuffer]' || !result.byteLength || result.byteLength > limit) {
      throw new Error('移动版资源大小无效');
    }
    return result;
  }
  async function refresh() {
    await warm();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let metadata;
    try { metadata = JSON.parse(decoder.decode(await bytes(versionUrl, versionLimit))).cloud; }
    catch (error) {
      if (current && !lifetime.signal.aborted) return current;
      throw error;
    }
    const { version, md5: digest, url } = metadata ?? {};
    if (typeof version !== 'string' || !versionPattern.test(version) || typeof digest !== 'string' ||
        !digestPattern.test(digest) || url !== resourceRoot) throw new Error('移动版资源版本配置无效');
    if (current?.version === version && current.md5 === digest) return current;
    const archive = await bytes(resourceRoot + `cloud_${version}.zip`, indexLimit);
    if (mobileMd5(new Uint8Array(archive)) !== digest) throw new Error('移动版云资源目录校验失败，请重试');
    const dictionary = await openMobileZip(win, archive).read('cloud');
    if (lifetime.signal.aborted) throw cancelled();
    const next = buildIndex(decoder.decode(dictionary), version, digest);
    verified.add(next);
    current = next;
    await cache('readwrite', store => store.put(next, 'current')).catch(() => {});
    if (lifetime.signal.aborted) throw cancelled();
    return next;
  }
  function getIndex({ signal } = {}) {
    if (lifetime.signal.aborted || signal?.aborted) return Promise.reject(cancelled());
    pending ??= refresh().finally(() => { pending = null; });
    return waitFor(pending, signal);
  }
  async function downloadResource(path, { signal, limit = assetLimit, index } = {}) {
    const catalogue = index ?? current ?? await getIndex({ signal });
    if (!verified.has(catalogue)) throw new Error('移动版资源目录快照无效');
    const asset = catalogue.resources.get(path);
    if (!asset) throw new Error('移动版资源目录缺少文件');
    if (!Number.isFinite(limit) || asset.size > Math.min(limit, assetLimit)) throw new Error('移动版资源超过读取上限');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted || lifetime.signal.aborted) throw cancelled();
    signal?.addEventListener('abort', abort, { once: true });
    lifetime.signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await bytes(asset.url, asset.size, controller.signal);
      if (result.byteLength !== asset.size) throw new Error('移动版资源大小与目录不一致');
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
      lifetime.signal.removeEventListener('abort', abort);
    }
  }
  return { getIndex, downloadResource,
    readConfigCache: key => cache('readonly', store => store.get(key)),
    writeConfigCache: (key, value) => cache('readwrite', store => store.put(value, key)),
    dispose() {
    lifetime.abort();
    current = null;
    void database?.then(db => db.close()).catch(() => {});
  } };
}
