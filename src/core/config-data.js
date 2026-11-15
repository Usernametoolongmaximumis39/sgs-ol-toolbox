// Public game configuration only. No account requests, singleton construction,
// upstream-script globals, or recursive inspection of native packets.
const ALLOWED = new Set(['gn_zonghe', 'cha_gs_dbs_fs_skininfo', 'ff_jubaopen', 'ff_dbs_pay_gift', 'sys_gs_dbs_fs_goodsbaseinfo', 'cha_dbs_general_series', 'ff_task_daily', 'mod_new_ttrank_config', 'ff_general_chest_info_config', 'gn_dbs_giftbag', 'hd_roguelike', 'cha_spell', 'sys_playcard', 'character', 'gn_gs_ahievement', 'ff_qifu_new', 'ff_tiangong', 'h5_officer']);
ALLOWED.add('sys_h5_shop');
ALLOWED.add('gn_dbs_coupon_cfg');
const ARCHIVE_LIMIT = 64 * 1024 * 1024, ENTRY_LIMIT = 16 * 1024 * 1024;
const read = fn => { try { return fn(); } catch { return undefined; } };
const normalize = name => String(name).replace(/\.sgs$/, '');
const cancelled = () => new Error('配置读取已取消');

async function boundedStream(stream, limit) {
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('配置文件超过读取上限');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function inflate(bytes, format, win) {
  const Decompressor = win.DecompressionStream || globalThis.DecompressionStream;
  if (!Decompressor) throw new Error('浏览器缺少配置解压支持');
  const BlobType = win.Blob || globalThis.Blob;
  return boundedStream(new BlobType([bytes]).stream().pipeThrough(new Decompressor(format)), ENTRY_LIMIT);
}

export async function readZipEntry(bytes, filename, win = globalThis) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('官方配置包 ZIP 格式不支持');
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true);
  const directoryEnd = cursor + directorySize;
  if (count > 4096 || directoryEnd > end) throw new Error('官方配置包目录无效');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('官方配置包目录损坏');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const packed = view.getUint32(cursor + 20, true), unpacked = view.getUint32(cursor + 24, true);
    const nameSize = view.getUint16(cursor + 28, true), extraSize = view.getUint16(cursor + 30, true), commentSize = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > directoryEnd) throw new Error('官方配置包目录越界');
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    if (name === filename) {
      const offset = view.getUint32(cursor + 42, true);
      if ((flags & 1) || packed > ENTRY_LIMIT || unpacked > ENTRY_LIMIT || offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error('配置条目格式或大小不支持');
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (start + packed > bytes.length) throw new Error('配置条目越界');
      const compressed = bytes.subarray(start, start + packed);
      const output = method === 0 ? compressed.slice() : method === 8 ? await inflate(compressed, 'deflate-raw', win) : null;
      if (!output || output.length !== unpacked) throw new Error('配置条目解压失败');
      return output;
    }
    cursor = next;
  }
  throw new Error(`官方配置包缺少 ${filename}`);
}

export function createConfigData(win, scope) {
  const cache = new Map(), pending = new Map(); let archivePromise;
  function validate(name) {
    name = normalize(name);
    if (!ALLOWED.has(name)) throw new Error(`尚未声明的配置表：${name}`);
    return name;
  }
  function getConfigData(name) {
    name = validate(name);
    // Existing public config containers and the isolated local fixture are optional.
    for (const container of [read(() => win.CtrUtil.AllDatas), read(() => win.SystemContext.AllDatas),
      read(() => win.__SGS_TOOLBOX_DEMO__.configs)]) {
      const data = read(() => container[`${name}.sgs`]) || read(() => container[name]);
      if (data && typeof data === 'object') return data;
    }
    return cache.get(name) || null;
  }
  function archiveUrl() {
    const origin = read(() => win.location.origin);
    if (origin !== 'https://web.sanguosha.com' && origin !== 'http://web.sanguosha.com') throw new Error('等待游戏配置数据就绪');
    const entries = read(() => win.performance.getEntriesByType('resource')) || [];
    for (const entry of entries.slice(-2048).reverse()) {
      try {
        const url = new URL(entry.name);
        if (url.protocol === 'https:' && url.hostname === 'web.sanguosha.com' && /\/Config_w\.sgs$/.test(url.pathname) && !url.username && !url.password) return url.href;
      } catch {}
    }
    const version = read(() => win.resourceVersion);
    if (!['string', 'number'].includes(typeof version) || !String(version).trim()) throw new Error('等待客户端资源版本就绪，请稍后刷新');
    return `https://web.sanguosha.com/220/h5_2/res/config/Config_w.sgs?v=${encodeURIComponent(String(version))}`;
  }
  async function archive() {
    if (!archivePromise) {
      archivePromise = (async () => {
        const controller = new AbortController();
        const cleanup = scope.add(() => controller.abort());
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await win.fetch(archiveUrl(), { signal: controller.signal, credentials: 'omit', redirect: 'error' });
          if (!response.ok) throw new Error(`官方配置读取失败（${response.status}）`);
          if (Number(response.headers.get('content-length')) > ARCHIVE_LIMIT) throw new Error('官方配置包超过读取上限');
          if (!response.body) throw new Error('官方配置包响应为空');
          return await boundedStream(response.body, ARCHIVE_LIMIT);
        } finally { clearTimeout(timer); cleanup(); }
      })().catch(error => { archivePromise = null; throw error; });
    }
    return archivePromise;
  }
  async function loadConfigData(name) {
    name = validate(name);
    if (scope.closed) throw cancelled();
    const existing = getConfigData(name); if (existing) return existing;
    if (!pending.has(name)) pending.set(name, (async () => {
      // CtrUtil is a native global lexical class on some official client builds.
      // Read its already-initialized decryptor only; never call Init/CreateInstance.
      const ctrClass = read(() => win.CtrUtil) || read(() => typeof CtrUtil !== 'undefined' ? CtrUtil : null);
      const decryptor = read(() => ctrClass.Ctr);
      if (typeof read(() => decryptor.Ofb_Dec) !== 'function') throw new Error('等待游戏配置解码器就绪');
      const packed = await archive();
      if (scope.closed) throw cancelled();
      const encrypted = await readZipEntry(packed, `${name}.sgs`, win);
      if (scope.closed) throw cancelled();
      const decrypted = decryptor.Ofb_Dec(encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength));
      const bytes = decrypted instanceof ArrayBuffer ? new Uint8Array(decrypted)
        : ArrayBuffer.isView(decrypted) ? new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength)
          : Array.isArray(decrypted) && decrypted.length <= ENTRY_LIMIT && decrypted.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
            ? Uint8Array.from(decrypted) : null;
      if (!bytes || bytes.byteLength > ENTRY_LIMIT) throw new Error('游戏配置解码结果无效');
      const plain = await inflate(bytes, 'gzip', win);
      if (scope.closed) throw cancelled();
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('游戏配置内容无效');
      cache.set(name, data); return data;
    })().finally(() => pending.delete(name)));
    return pending.get(name);
  }
  scope.add(() => { cache.clear(); pending.clear(); archivePromise = null; });
  return { getConfigData, loadConfigData };
}
