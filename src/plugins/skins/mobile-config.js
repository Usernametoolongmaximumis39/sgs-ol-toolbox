import { mobileMd5, openMobileZip } from './mobile-cloud.js';
import { loadMobileConfigBootstrap } from './mobile-config-bootstrap.js';
import { buildMobileConfigData } from './mobile-config-data.js';

const configUrl = 'https://waym.sanguosha.cn/config/';
const configHost = 'https://mres.sanguosha.cn';
const configFiles = ['skin.lua', 'chrCfg.lua', 'SpellData.lua', 'SoundCfg.lua', 'Cards.lua', 'key_card.lua'];
const manifestName = 'config_list.zip';
const configLimit = 4 * 1024 * 1024;
const manifestLimit = 256 * 1024;
const metadataLimit = 128 * 1024;
const projectionVersion = 4;
const delta = 0x9e3779b9;
const zipName = /^config(?:_list|[1-9]\d{0,2})\.zip$/;
const hashPattern = /^[0-9a-f]{32}$/;

const decodeText = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

function mix(key, sum, y, z, position, round) {
  return ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (key[(position & 3) ^ round] ^ z));
}

function keyWords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [0, 4, 8, 12].map(offset => view.getUint32(offset, true));
}

function wordsToBytes(words, length) {
  const bytes = new Uint8Array(words.length * 4), view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setUint32(index * 4, word, true));
  return bytes.subarray(0, length);
}

function encodeReleaseField(win, text, key) {
  const salt = win.crypto.getRandomValues(new Uint16Array(1))[0] % 1000 + 1;
  const bytes = new TextEncoder().encode(`${text}_${salt}`);
  const words = new Uint32Array(Math.ceil(bytes.length / 4) + 1);
  bytes.forEach((byte, index) => { words[index >> 2] |= byte << ((index & 3) * 8); });
  const last = words.length - 1;
  words[last] = bytes.length;
  let sum = 0, z = words[last];
  for (let rounds = 6 + Math.floor(52 / words.length); rounds > 0; rounds--) {
    sum = (sum + delta) >>> 0;
    const round = sum >>> 2 & 3;
    for (let index = 0; index <= last; index++) {
      z = words[index] = (words[index] + mix(key, sum, words[index === last ? 0 : index + 1], z, index, round)) >>> 0;
    }
  }
  return win.btoa(String.fromCharCode(...wordsToBytes(words)));
}

function decodeConfigZip(buffer, key) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 40 || bytes.length % 4 || !hashPattern.test(decodeText(bytes.subarray(0, 32)))) {
    throw new Error('移动版官方配置分包格式无效');
  }
  const view = new DataView(buffer, 32);
  const words = Uint32Array.from({ length: view.byteLength / 4 }, (_, index) => view.getUint32(index * 4, true));
  const last = words.length - 1;
  let sum = Math.imul(6 + Math.floor(52 / words.length), delta) >>> 0, y = words[0];
  while (sum !== 0) {
    const round = sum >>> 2 & 3;
    for (let index = last; index >= 0; index--) {
      y = words[index] = (words[index] - mix(key, sum, y, words[index === 0 ? last : index - 1], index, round)) >>> 0;
    }
    sum = (sum - delta) >>> 0;
  }
  const length = words[last];
  if (length < last * 4 - 3 || length > last * 4 || words[0] !== 0x04034b50) {
    throw new Error('移动版官方配置分包无法解包');
  }
  return wordsToBytes(words, length);
}

function metadataUrl(win, { channel, clientVersion, keyVersion }, key) {
  // These two encoded values select a public distribution. Only the channel
  // and client version from the publisher's package enter the request.
  const params = new URLSearchParams({ c: encodeReleaseField(win, channel, key), v: encodeReleaseField(win, clientVersion, key),
    subv: '0', l: '0', ct: 'windows', dm: 'PC', sv: 'Windows', vc: '1', pkg: 'com.bf.sgs.hdexp',
    area: '0', is_gzip: '0', HWthirdAc: '0', astc: '0', config_list_inc: '1', is_xxtea: '1', key_v: keyVersion });
  return configUrl + '?' + params;
}

function readDescriptors(metadata) {
  const district = metadata?.zips?.[10];
  if (!Array.isArray(district?.config) || district.config.length < 2 || district.config.length > 64) {
    throw new Error('移动版官方配置目录暂不可用');
  }
  const descriptors = new Map();
  for (const { name, url, md5, filemd5 } of district.config) {
    const path = new URL(url);
    if (typeof name !== 'string' || !zipName.test(name) || descriptors.has(name) ||
        typeof md5 !== 'string' || !hashPattern.test(md5) || md5 !== filemd5 || path.origin !== configHost ||
        !/^\/\/config\/clients_[1-9]\d?\.\d{1,2}\.\d{1,2}_formal_\d{12}_[a-z0-9]{4,16}\/config(?:_list|[1-9]\d{0,2})\.zip$/.test(path.pathname) ||
        path.pathname.split('/').pop() !== name || path.search || path.hash || path.username || path.password) {
      throw new Error('移动版官方配置目录条目无效');
    }
    descriptors.set(name, { url: path.href, md5 });
  }
  if (!descriptors.has(manifestName)) throw new Error('移动版官方配置清单缺失');
  return descriptors;
}

const parseJson = bytes => JSON.parse(decodeText(bytes));
const validBootstrap = value => value?.channel === '81002' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.clientVersion) &&
  /^\d{11}$/.test(value.keyVersion) && hashPattern.test(value.archiveMd5) && value.secretKey instanceof Uint8Array &&
  value.secretKey.byteLength === 16;
const validSnapshot = value => value?.digests instanceof Map && value.digests.has(manifestName) &&
  value.data?.skins instanceof Map && value.data.skins.size && value.data?.voices instanceof Map &&
  value.data?.skinVoices instanceof Map && value.data?.generals instanceof Map;

export function createMobileConfig(win, download, { signal, readCache, writeCache, bootstrap = loadMobileConfigBootstrap }) {
  const snapshotKey = 'config-data-v1', bootstrapKey = 'config-bootstrap-v1';
  let snapshot, release, warming, pending;

  async function bytes(url, limit, requestSignal) {
    const result = await download(url, { limit, signal: requestSignal });
    if (requestSignal.aborted) throw new Error('移动版官方配置读取已取消');
    if (Object.prototype.toString.call(result) !== '[object ArrayBuffer]' || !result.byteLength || result.byteLength > limit) {
      throw new Error('移动版官方配置响应大小无效');
    }
    return result;
  }

  async function rebuild(descriptors, key, requestSignal, packageRevision) {
    const openArchive = async (name, limit) => {
      const info = descriptors.get(name);
      const buffer = await bytes(info.url, limit, requestSignal);
      if (mobileMd5(new Uint8Array(buffer)) !== info.md5) throw new Error('移动版官方配置分包校验失败');
      return openMobileZip(win, decodeConfigZip(buffer, key));
    };
    const manifest = await openArchive(manifestName, manifestLimit);
    const { config_hash: hashes } = parseJson(await manifest.read('config_list', { limit: manifestLimit }));
    const members = new Map();
    for (const file of configFiles) {
      const index = hashes?.[file];
      if (!Array.isArray(index) || index.length !== 1 || index[0] === manifestName || !descriptors.has(index[0])) {
        throw new Error('移动版官方配置清单缺少所需数据表');
      }
      const name = index[0];
      if (!members.has(name)) members.set(name, []);
      members.get(name).push(file);
    }
    const tables = new Map();
    await Promise.all([...members].map(async ([name, files]) => {
      const archive = await openArchive(name, configLimit);
      for (const file of files) tables.set(file, decodeText(await archive.read(file)));
    }));
    if (requestSignal.aborted) throw new Error('移动版官方配置读取已取消');
    const data = buildMobileConfigData(tables);
    const digests = new Map([manifestName, ...members.keys()].map(name => [name, descriptors.get(name).md5]));
    return { data, digests, packageRevision, projectionVersion };
  }

  async function updateWith(candidate, requestSignal) {
    if (!validBootstrap(candidate)) throw new Error('移动版官方安装包配置参数无效');
    const key = keyWords(candidate.secretKey);
    const descriptors = readDescriptors(parseJson(await bytes(metadataUrl(win, candidate, key), metadataLimit, requestSignal)));
    const packageRevision = [candidate.clientVersion, candidate.keyVersion, candidate.archiveMd5].join(':');
    if (snapshot?.projectionVersion === projectionVersion && snapshot.packageRevision === packageRevision &&
        [...snapshot.digests].every(([name, digest]) => descriptors.get(name)?.md5 === digest)) return snapshot;
    return rebuild(descriptors, key, requestSignal, packageRevision);
  }

  async function refresh() {
    warming ??= Promise.all([readCache(snapshotKey).catch(() => null), readCache(bootstrapKey).catch(() => null)])
      .then(([data, seed]) => {
        if (validSnapshot(data)) snapshot = data;
        if (validBootstrap(seed)) release = seed;
      });
    await warming;
    const request = new AbortController();
    const abort = () => request.abort();
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = win.setTimeout(abort, 60000);
    try {
      const fromCache = Boolean(release);
      release ??= await bootstrap(win, download, request.signal);
      let next;
      try { next = await updateWith(release, request.signal); }
      catch (error) {
        if (!fromCache || request.signal.aborted || error?.message !== '移动版官方配置目录暂不可用') throw error;
        release = await bootstrap(win, download, request.signal);
        next = await updateWith(release, request.signal);
      }
      if (request.signal.aborted) throw new Error('移动版官方配置读取已取消');
      const writes = [writeCache(bootstrapKey, release)];
      if (snapshot !== next) {
        snapshot = next;
        writes.push(writeCache(snapshotKey, snapshot));
      }
      await Promise.allSettled(writes);
      return { data: snapshot.data, status: 'official' };
    } catch (error) {
      if (signal.aborted) throw error;
      return { data: snapshot?.data, status: snapshot ? 'cached' : 'fallback' };
    } finally {
      win.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  return { load() {
    pending ??= refresh().finally(() => { pending = null; });
    return pending;
  } };
}
