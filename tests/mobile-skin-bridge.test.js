import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { buildMicroclientHost } from '../tools/build-microclient.mjs';
import { createGameAssetDownloads, createMobileSkinDownload, mobileSkinRequest } from '../src/core/mobile-skin-download.js';
import { STARGAZING_REPORT } from '../src/shared/stargazing-source.js';

const base = 'https://download.sanguosha.cn/pcgame/81002/4.6.1/';
const archive = base + 'game_10100001_110001.zip';
const configZip = 'https://mres.sanguosha.cn//config/clients_4.6.1_formal_202611191750_i7dt/config2.zip';
const configSelector = 'https://waym.sanguosha.cn/config/?' + new URLSearchParams({
  c: 'A'.repeat(16), v: 'B'.repeat(22) + '==', subv: '0', l: '0', ct: 'windows', dm: 'PC', sv: 'Windows', vc: '1',
  pkg: 'com.bf.sgs.hdexp', area: '0', is_gzip: '0', HWthirdAc: '0', astc: '0', config_list_inc: '1', is_xxtea: '1', key_v: '20261023741',
});

test('mobile configuration bridge only accepts public selectors, exact CDN paths and bounded installer ranges', () => {
  const MiB = 1024 * 1024;
  assert.equal(mobileSkinRequest(configSelector).limit, 128 * 1024);
  assert.equal(mobileSkinRequest(configZip).limit, 4 * MiB);
  assert.equal(mobileSkinRequest(configZip.replace('config2.zip', 'config_list.zip')).limit, 256 * 1024);
  assert.equal(mobileSkinRequest(base + 'gameInfo.json').limit, 16 * 1024);
  assert.throws(() => mobileSkinRequest(configSelector + '&ct=windows'), /地址无效/);
  assert.throws(() => mobileSkinRequest(configSelector + '&pid=1'), /地址无效/);
  assert.throws(() => mobileSkinRequest(configSelector.replace('area=0', 'area=10')), /地址无效/);
  assert.throws(() => mobileSkinRequest(configSelector.replace('sv=Windows', 'sv=Android')), /地址无效/);
  assert.throws(() => mobileSkinRequest(configZip + '?a=1'), /地址无效/);
  assert.throws(() => mobileSkinRequest(configZip.replace('_formal_', '_test_')), /允许范围/);
  assert.throws(() => mobileSkinRequest(base.replace('/81002/', '/81003/') + 'gameInfo.json'), /允许范围/);
  assert.throws(() => mobileSkinRequest(base + 'other.zip'), /允许范围/);
  assert.throws(() => mobileSkinRequest(configZip, 100, { start: 0, end: 1 }), /不支持分段/);
  assert.throws(() => mobileSkinRequest(archive), /有限区间/);
  assert.throws(() => mobileSkinRequest(archive, Infinity, { suffix: 1 }), /上限无效/);
  assert.throws(() => mobileSkinRequest(archive, 1, { start: 0, end: 1 }), /有限区间/);
  assert.throws(() => mobileSkinRequest(archive, 100, { start: 3, end: 2 }), /有限区间/);
  assert.throws(() => mobileSkinRequest(archive, undefined, { start: 0, end: 24 * MiB }), /有限区间/);
  assert.throws(() => mobileSkinRequest(archive, undefined, { suffix: 65558 }), /有限区间/);
  assert.throws(() => mobileSkinRequest(archive, undefined, { suffix: 1, start: 0, end: 0 }), /有限区间/);
  assert.deepEqual(mobileSkinRequest(archive, undefined, { suffix: 65557 }).headers, { Range: 'bytes=-65557' });
  assert.deepEqual(mobileSkinRequest(archive, 2, { start: 3, end: 4 }).headers, { Range: 'bytes=3-4' });
});

test('page fetch rejects invalid installer ranges and checks body bytes', async () => {
  let response;
  const fetch = async (url, options) => {
    assert.equal(url, archive);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Range: 'bytes=-3' });
    return response;
  };
  const download = createMobileSkinDownload({ fetch, setTimeout, clearTimeout });
  const range = { suffix: 3 };
  const bytes = new Uint8Array([1, 2, 3]);
  const correct = { 'content-range': 'bytes 197-199/200', 'content-length': '3' };
  response = new Response(bytes, { status: 206, headers: correct });
  assert.deepEqual([...new Uint8Array(await download(archive, { range }))], [...bytes]);
  response = new Response(bytes);
  await assert.rejects(download(archive, { range }), /未返回指定分段/);
  response = new Response(bytes, { status: 206, headers: { 'content-range': 'bytes 0-2/200' } });
  await assert.rejects(download(archive, { range }), /范围或长度无效/);
  response = new Response(bytes, { status: 206, headers: { ...correct, 'content-encoding': 'gzip' } });
  await assert.rejects(download(archive, { range }), /范围或长度无效/);
  response = new Response(bytes.subarray(0, 2), { status: 206, headers: correct });
  await assert.rejects(download(archive, { range }), /长度不符/);
  response = new Response(new Uint8Array(4), { status: 206, headers: correct });
  await assert.rejects(download(archive, { range }), /下载上限/);
});

test('packaged microclient transfers official mobile skin bytes and cancels main-process requests', async () => {
  const root = resolve(import.meta.dirname, '..');
  const [host, preload] = await Promise.all([buildMicroclientHost(root), readFile(resolve(root, 'microclient/preload.cjs'), 'utf8')]);
  const handlers = new Map();
  const requests = [];
  let slow, nextStatus = 200, rangeHeader = 'bytes 8-10/32';
  const https = { get(url, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    requests.push({ url, headers: options?.headers });
    const req = new EventEmitter();
    req.destroy = error => { req.emit('error', error); req.emit('close'); };
    if (slow) { slow = req; return req; }
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = nextStatus;
      const data = Buffer.from(url === STARGAZING_REPORT ? '{"sections":[]}' : [6, 0, 255]);
      response.headers = { 'content-length': String(data.length), 'content-range': rangeHeader, location: 'https://unrelated.invalid/redirect' };
      response.resume = () => {};
      callback(response);
      response.emit('data', data);
      response.emit('end');
      req.emit('close');
    });
    return req;
  } };
  vm.runInNewContext(host.toString(), { URL, Buffer, setTimeout, clearTimeout, __dirname: '/payload', require(id) {
    if (id === 'electron') return { app: { once() {}, on() {} }, ipcMain: {
      handle(name, fn) { handlers.set(name, fn); }, on(name, fn) { handlers.set(name, fn); },
    } };
    if (id === 'fs') return { readFileSync: () => 'void 0;' };
    if (id === 'path') return { join: (...parts) => parts.join('/') };
    if (id === 'crypto') return {};
    if (id === 'https') return https;
    throw new Error(id);
  } });

  const location = new URL('https://web.sanguosha.com/220/h5_2/index_110074.php');
  const active = { senderFrame: { url: location.href, parent: null }, sender: {} };
  const events = new EventEmitter();
  const win = { location, setTimeout, clearTimeout,
    addEventListener: (type, handler) => events.on(type, handler),
    removeEventListener: (type, handler) => events.off(type, handler),
    postMessage(data, origin) { queueMicrotask(() => events.emit('message', { source: win, origin, data })); },
  };
  win.top = win.self = win;
  const pageRealm = vm.createContext({ window: win, location, crypto: webcrypto });
  vm.runInNewContext(preload, { window: win, console, require: () => ({ webFrame: {
    executeJavaScript: async code => vm.runInContext(code, pageRealm),
  }, ipcRenderer: {
    sendSync: () => 'void 0;',
    invoke: async (name, ...args) => handlers.get(name)(active, ...args),
    send: (name, ...args) => handlers.get(name)(active, ...args),
  } }) });

  const invoke = (event, url) => handlers.get('sgs-toolbox:mobile-skin:v1')(event, { id: 'a'.repeat(32), url, limit: 128 });
  const url = 'https://waym.sanguosha.cn/update/cloud.php';
  await assert.rejects(invoke({ senderFrame: { ...active.senderFrame, parent: {} } }, url), /官方游戏主页面/);
  await assert.rejects(invoke(active, 'https://not-sanguosha.example/file.zip'), /允许范围/);
  await assert.rejects(invoke(active, STARGAZING_REPORT + '?id=1'), /地址无效/);

  const download = createMobileSkinDownload(win);
  assert.deepEqual([...new Uint8Array(await download(url))], [6, 0, 255]);
  await assert.rejects(download(url, { limit: 2 }), /文件过大/);
  nextStatus = 302;
  await assert.rejects(download(url), /服务器返回 302/);
  nextStatus = 200;
  const slice = { start: 8, end: 10 };
  await assert.rejects(download(archive), /有限区间/);
  await assert.rejects(download(archive, { range: slice }), /未返回指定分段/);
  nextStatus = 206;
  assert.deepEqual([...new Uint8Array(await download(archive, { range: slice }))], [6, 0, 255]);
  rangeHeader = 'bytes 7-9/32';
  await assert.rejects(download(archive, { range: slice }), /范围或长度无效/);
  nextStatus = 200;
  assert.deepEqual([...new Uint8Array(await download(configSelector))], [6, 0, 255]);
  const { readStargazingReport } = createGameAssetDownloads(win);
  assert.deepEqual(await readStargazingReport(), { sections: [] });
  assert.equal(requests.at(-1).headers, undefined);
  nextStatus = 302;
  await assert.rejects(readStargazingReport(), /观星数据服务器返回 302/);
  nextStatus = 200;
  const controller = new AbortController();
  slow = true;
  const pending = download(url, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(slow instanceof EventEmitter);
  const cancelled = new Promise(resolve => slow.once('close', resolve));
  controller.abort();
  await assert.rejects(pending, /已取消/);
  await cancelled;
  assert.deepEqual(requests.map(call => call.url), [url, url, url, archive, archive, archive, configSelector, STARGAZING_REPORT, STARGAZING_REPORT, url]);
  const ranges = requests.filter(call => call.url === archive);
  for (const request of ranges) {
    assert.equal(request.headers.Range, 'bytes=8-10');
    assert.equal(request.headers['Accept-Encoding'], 'identity');
  }
});
