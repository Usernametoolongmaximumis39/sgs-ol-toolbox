import { MICROCLIENT } from './distribution.js';
import { STARGAZING_REPORT } from '../shared/stargazing-source.js';

const MiB = 1024 * 1024;
const cloudRoot = 'https://mres.sanguosha.cn';
const cloudPrefix = '/update_cloud/public/';
const pictures = /^ui\/(?:face|sface|bface|icon)\/(?:skin|char)(?:\/(?:horSkin|horChar))?\/[a-f0-9]{32}\.(?:png|jpe?g)$/i;
const sounds = /^audio\/(?:skill|dead|effect|victory)\/[a-f0-9]{32}\.mp3$/i;
const motion = /^ui\/face\/skin\/dynamicSkin\/[a-f0-9]{32}\.zip$/i;
const configZips = /^\/\/config\/clients_[1-9]\d?\.\d{1,2}\.\d{1,2}_formal_\d{12}_[a-z0-9]{4,16}\/config(_list|[1-9]\d{0,2})\.zip$/;
const pcDownload = /^\/pcgame\/81002\/[1-9]\d?\.\d{1,2}\.\d{1,2}\/(gameInfo\.json|game_\d{8,16}_\d{6,12}\.zip)$/;
const configParams = { subv: '0', l: '0', ct: 'windows', dm: 'PC', sv: 'Windows', vc: '1', pkg: 'com.bf.sgs.hdexp',
  area: '0', is_gzip: '0', HWthirdAc: '0', astc: '0', config_list_inc: '1', is_xxtea: '1' };
const installerArchiveLimit = 0xffffffff; // Only the byte ranges needed to inspect a ZIP32 archive.
const installerRangeLimit = 24 * MiB;
const installerSuffixLimit = 65557;

function validConfigQuery(params) {
  const keys = Array.from(params.keys());
  const selectors = ['c', 'v', 'key_v'];
  if (new Set(keys).size !== keys.length || keys.length !== Object.keys(configParams).length + selectors.length ||
      Object.entries(configParams).some(([name, value]) => params.get(name) !== value)) return false;
  return /^(?:[A-Za-z0-9+/]{16}|[A-Za-z0-9+/]{22}==)$/.test(params.get('c') ?? '') &&
    /^(?:[A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{27}=|[A-Za-z0-9+/]{32})$/.test(params.get('v') ?? '') &&
    /^\d{11}$/.test(params.get('key_v') ?? '');
}

function installerRange(range, limit) {
  if (range && typeof range === 'object') {
    const { suffix, start, end } = range, fields = Object.keys(range);
    if (fields.length === 1 && fields[0] === 'suffix' && Number.isSafeInteger(suffix) && suffix >= 1 &&
        suffix <= Math.min(limit, installerSuffixLimit)) {
      return { range: { suffix }, headers: { Range: `bytes=-${suffix}` }, limit: suffix };
    }
    if (fields.length === 2 && fields.includes('start') && fields.includes('end') &&
        Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start &&
        end < installerArchiveLimit && end - start + 1 <= limit) {
      return { range: { start, end }, headers: { Range: `bytes=${start}-${end}` }, limit: end - start + 1 };
    }
  }
  throw new Error('移动版安装包仅允许读取指定的有限区间');
}

export function mobileSkinRequest(value, requestedLimit, range) {
  let url;
  try { if (typeof value === 'string' && value.length <= 512) url = new URL(value); } catch { /* invalid request */ }
  if (!url || url.username || url.password || value.includes('#')) throw new Error('移动版皮肤资源地址无效');
  const versionHost = url.origin === 'https://waym.sanguosha.cn';
  const configMetadata = versionHost && url.pathname === '/config/';
  if (configMetadata ? !validConfigQuery(url.searchParams) : url.search) throw new Error('移动版皮肤资源地址无效');
  let max, installer = false;
  if (configMetadata) max = 128 * 1024;
  else if (versionHost && url.pathname === '/update/cloud.php') max = 16 * 1024;
  if (url.origin === cloudRoot && url.pathname.startsWith(cloudPrefix)) {
    const asset = url.pathname.slice(cloudPrefix.length);
    if (/^cloud_[1-9]\d{4,11}\.zip$/.test(asset)) max = 16 * MiB;
    else if (motion.test(asset)) max = 64 * MiB;
    else if (pictures.test(asset)) max = 12 * MiB;
    else if (sounds.test(asset)) max = 4 * MiB;
  } else if (url.origin === cloudRoot) {
    const config = configZips.exec(url.pathname);
    if (config) max = config[1] === '_list' ? 256 * 1024 : 4 * MiB;
  } else if (url.origin === 'https://download.sanguosha.cn') {
    const file = pcDownload.exec(url.pathname)?.[1];
    if (file) {
      installer = file !== 'gameInfo.json';
      max = installer ? installerRangeLimit : 16 * 1024;
    }
  }
  if (!max) throw new Error('移动版皮肤资源地址不在游卡允许范围内');
  if (requestedLimit !== undefined && (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)) {
    throw new Error('移动版皮肤资源下载上限无效');
  }
  if (!installer && range !== undefined) throw new Error('移动版皮肤资源类型不支持分段读取');
  const limit = Math.min(requestedLimit ?? max, max);
  return { url: url.href, limit, timeout: max >= 16 * MiB ? 90000 : 25000,
    ...(installer ? installerRange(range, limit) : {}) };
}

const stargazingRequest = Object.freeze({ url: STARGAZING_REPORT, limit: MiB, timeout: 25000, label: '观星数据' });

// Both privileged transports validate independently. The report uses one fixed
// public GET and is separate from the API that accepts official skin URLs.
export function toolboxDownloadRequest(url, limit, range) {
  if (url === STARGAZING_REPORT) {
    if (range !== undefined || (limit !== undefined && limit !== stargazingRequest.limit)) {
      throw new Error('观星数据只支持读取完整报告');
    }
    return stargazingRequest;
  }
  return mobileSkinRequest(url, limit, range);
}

export function mobileSkinResponseBytes(bytes, limit, expectedLength, label = '移动版皮肤资源') {
  if (Object.prototype.toString.call(bytes) !== '[object ArrayBuffer]' || !bytes.byteLength) {
    throw new Error(`${label}响应无效`);
  }
  if (bytes.byteLength > limit) throw new Error(`${label}超过下载上限`);
  if (expectedLength !== undefined && bytes.byteLength !== expectedLength) throw new Error('移动版安装包分段响应长度不符');
  return bytes;
}

export function mobileSkinPartialLength(request, status, contentRange, contentLength, contentEncoding) {
  if (status !== 206) throw new Error(`移动版安装包未返回指定分段（HTTP ${status}）`);
  const fields = /^bytes (0|[1-9]\d{0,9})-(0|[1-9]\d{0,9})\/([1-9]\d{0,9})$/i.exec(contentRange ?? '');
  const [start, end, total] = (fields?.slice(1) ?? []).map(Number);
  const { range, limit } = request;
  const length = end - start + 1;
  if (!fields || end >= total || total > installerArchiveLimit || length < 1 || length > limit ||
      (range.suffix === undefined ? (start !== range.start || end !== range.end)
        : (end !== total - 1 || length !== Math.min(total, range.suffix))) ||
      (contentLength != null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== length)) ||
      (contentEncoding != null && !/^identity$/i.test(contentEncoding))) {
    throw new Error('移动版安装包分段响应范围或长度无效');
  }
  return length;
}

async function fetchResource(win, request, signal) {
  const { url, limit, headers, label = '移动版皮肤资源' } = request;
  const overLimit = () => new Error(`${label}超过下载上限`);
  const response = await win.fetch(url, { credentials: 'omit', redirect: 'error', signal, headers,
    ...(request.label ? { cache: 'no-store', referrerPolicy: 'no-referrer' } : {}) });
  let expectedLength;
  try {
    if (request.range) {
      expectedLength = mobileSkinPartialLength(request, response.status, response.headers.get('content-range'),
        response.headers.get('content-length'), response.headers.get('content-encoding'));
    } else {
      if (!response.ok) throw new Error(`${label}不可用（HTTP ${response.status}）`);
      if (Number(response.headers.get('content-length')) > limit) throw overLimit();
    }
  } catch (error) {
    void response.body?.cancel().catch(() => {});
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) return mobileSkinResponseBytes(await response.arrayBuffer(), limit, expectedLength, label);
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > (expectedLength ?? limit)) throw overLimit();
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return mobileSkinResponseBytes(bytes.buffer, limit, expectedLength, label);
}

export function createGameAssetDownloads(win, scope, port) {
  const pending = new Map();
  let nextId = 0;
  if (port) {
    port.onmessage = ({ data }) => {
      const accept = pending.get(data?.id);
      if (accept) accept(data);
    };
  }

  async function download(request, signal) {
    const label = request.label || '移动版皮肤资源';
    const cancelError = () => new Error(`${label}下载已取消`);
    const timeoutError = () => new Error(`${label}下载超时`);
    const validate = bytes => mobileSkinResponseBytes(bytes, request.limit, undefined, label);
    const owner = scope?.signal;
    if (signal?.aborted || owner?.aborted) throw cancelError();
    if (port) return new Promise((resolve, reject) => {
      const id = ++nextId;
      const finish = (done, value) => {
        if (!pending.delete(id)) return;
        win.clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        owner?.removeEventListener('abort', cancel);
        done(value);
      };
      const abort = error => {
        try { port.postMessage({ id, cancel: true }); } finally { finish(reject, error); }
      };
      const cancel = () => abort(cancelError());
      const timer = win.setTimeout(() => abort(timeoutError()), request.timeout + 2000);
      pending.set(id, data => {
        if (typeof data.error === 'string') { finish(reject, new Error(data.error)); return; }
        try { finish(resolve, validate(data.bytes)); }
        catch (error) { finish(reject, error); }
      });
      signal?.addEventListener('abort', cancel, { once: true });
      owner?.addEventListener('abort', cancel, { once: true });
      try { port.postMessage({ id, url: request.url, limit: request.limit, range: request.range }); }
      catch (error) { finish(reject, error); }
    });

    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timer = win.setTimeout(cancel, request.timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    owner?.addEventListener('abort', cancel, { once: true });
    const nativeDownload = typeof win.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__ === 'function';
    try {
      if (nativeDownload) {
        return validate(await win.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__(request, controller.signal));
      }
      return await fetchResource(win, request, controller.signal);
    } catch (error) {
      if (signal?.aborted || owner?.aborted) throw cancelError();
      if (controller.signal.aborted) throw timeoutError();
      if (request.label) {
        if (nativeDownload && error?.message?.includes('不在游卡允许范围内')) throw new Error('当前微端接入层尚未支持读取观星站');
        if (!nativeDownload && error?.name === 'TypeError') throw new Error('无法连接观星站，请检查网络和用户脚本的站点访问权限');
        throw error;
      }
      if (!nativeDownload && error?.name === 'TypeError') {
        const stage = request.url.endsWith('/cloud.php') ? '读取版本' : /\/cloud_\d+\.zip$/.test(request.url) ? '下载索引' : '下载素材';
        const detail = MICROCLIENT ? '当前微端接入层缺少跨域下载通道，请用新版微端安装包升级接入层。' :
          '用户脚本跨域下载未连接。请更新并启用工具箱用户脚本，允许访问游卡资源域名，再重新进入游戏。';
        throw new Error(`移动版皮肤${stage}失败。${detail}`, { cause: error });
      }
      throw error;
    } finally {
      win.clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      owner?.removeEventListener('abort', cancel);
    }
  }
  return {
    async downloadMobileSkinAsset(value, { signal, limit, range } = {}) {
      return download(mobileSkinRequest(value, limit, range), signal);
    },
    async readStargazingReport({ signal } = {}) {
      const bytes = await download(stargazingRequest, signal);
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new Error('观星站返回了无法读取的报表'); }
    },
  };
}

export function createMobileSkinDownload(win, scope, port) {
  return createGameAssetDownloads(win, scope, port).downloadMobileSkinAsset;
}
