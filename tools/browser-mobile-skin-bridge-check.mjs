import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { bundleCore, userscriptHeader } from './distribution-build.mjs';
import { CORE_VERSION } from '../src/core/version.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'test-results/mobile-skin-bridge');
const { code } = await bundleCore({ root, edition: 'dev', packages: [] });
const metadata = userscriptHeader({ edition: 'dev', version: CORE_VERSION, toolboxSvg: '' });
assert.equal((metadata.match(/^\/\/ @connect\s+/gm) ?? []).length, 4);
assert.match(metadata, /^\/\/ @inject-into\s+content$/m);
assert.match(metadata, /^\/\/ @sandbox\s+DOM$/m);
assert.match(metadata, /^\/\/ @grant\s+GM_xmlhttpRequest$/m);
assert.match(metadata, /^\/\/ @grant\s+GM\.xmlHttpRequest$/m);
assert.match(metadata, /^\/\/ @connect\s+waym\.sanguosha\.cn$/m);
assert.match(metadata, /^\/\/ @connect\s+mres\.sanguosha\.cn$/m);
assert.match(metadata, /^\/\/ @connect\s+download\.sanguosha\.cn$/m);
assert.match(metadata, /^\/\/ @connect\s+gx\.95chong\.cn$/m);

const origin = 'https://web.sanguosha.com';
const gamePage = origin + '/220/h5_2/index.php';
const versionUrl = 'https://waym.sanguosha.cn/update/cloud.php';
const cloudZip = 'https://mres.sanguosha.cn/update_cloud/public/cloud_461009.zip';
const media = 'https://mres.sanguosha.cn/update_cloud/public/';
const portrait = media + 'ui/face/skin/' + 'a'.repeat(32) + '.png';
const clip = media + 'audio/skill/' + 'b'.repeat(32) + '.mp3';
const dynamic = media + 'ui/face/skin/dynamicSkin/' + 'c'.repeat(32) + '.zip';
const installer = 'https://download.sanguosha.cn/pcgame/81002/4.6.1/game_10100001_110001.zip';
const configZip = 'https://mres.sanguosha.cn//config/clients_4.6.1_formal_202611191750_i7dt/config2.zip';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>演练</body>' }));
  let browserNetwork = 0;
  await page.route('https://waym.sanguosha.cn/**', route => {
    browserNetwork++;
    return route.fulfill({ body: Buffer.from([8, 6, 7]), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(url => url.origin !== origin && url.origin !== 'https://waym.sanguosha.cn', route => route.abort());
  await page.goto(gamePage);
  await page.evaluate(() => { window.Laya = { stage: { fixtureMarker: 73 } }; });
  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'userscript-extension' });
  const isolate = (expression, awaitPromise = false) => cdp.send('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise });
  const shim = `
    window.calls = [];
    globalThis.GM_xmlhttpRequest = options => {
      const call = {url: options.url, method: options.method, anonymous: options.anonymous, redirect: options.redirect,
        responseType: options.responseType, range: options.headers?.Range, aborts: 0};
      window.calls.push(call);
      const isAudio = options.url.endsWith('.mp3');
      const isDynamic = options.url.includes('dynamicSkin');
      const isImage = options.url.endsWith('.png');
      const timer = setTimeout(() => {
        if (isAudio) return options.onload({status: 200, responseURL: 'https://unrelated.invalid/redirect', response: new ArrayBuffer(3)});
        if (isDynamic) return options.onprogress({ loaded: 200, total: 200 });
        const bytes = new Uint8Array(isImage ? [2,4,6] : [0,127,255]);
        const range = call.range;
        if (range === 'bytes=0-2') {
          options.onreadystatechange({readyState: 2, status: 200, responseHeaders: 'Content-Length: 100'});
          return;
        }
        const responseRange = range === 'bytes=-3' ? 'bytes 97-99/100' : 'bytes 13-15/100';
        options.onload({status: range ? 206 : 200, responseURL: options.url, response: bytes.buffer,
          responseHeaders: range ? 'Content-Range: ' + responseRange + '\\r\\nContent-Length: 3' : ''});
      }, isImage ? 1200 : 20);
      return { abort() { call.aborts++; clearTimeout(timer); options.onabort(); } };
    };
  `;
  // A userscript manager may supply a facade for the script's `window`.
  // Native MessageEvents still use the DOM's WindowProxy as their source.
  const facade = `new Proxy(window, { get(target, key) {
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } })`;
  const started = await isolate(shim + `\n((window) => {\n${metadata}${code}\n})(${facade});`);
  assert.equal(started.exceptionDetails, undefined, 'the single userscript runs in an isolated world');
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  assert.equal(await page.evaluate(() => typeof GM_xmlhttpRequest), 'undefined');
  assert.equal((await isolate("Boolean(window[Symbol.for('sgs.ol.toolbox.core')])")).result.value, false);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-sgs-toolbox="core"]').length), 1);
  async function download(url, limit, range) {
    return page.evaluate(async ({ url, limit, range }) => {
      const game = window[Symbol.for('sgs.ol.toolbox.core')].game;
      try {
        const bytes = await game.downloadMobileSkinAsset(url, { limit, range });
        return { bytes: [...new Uint8Array(bytes)], sameRealm: bytes instanceof ArrayBuffer, sawNative: window.Laya.stage.fixtureMarker };
      } catch (error) { return { error: error.message }; }
    }, { url, limit, range });
  }
  const response = { bytes: [0, 127, 255], sameRealm: true, sawNative: 73 };
  assert.deepEqual(await download(versionUrl), response);
  assert.deepEqual(await download(cloudZip), response);
  assert.deepEqual(await download(configZip), response);
  assert.deepEqual(await download(installer, 3, { suffix: 3 }), response);
  assert.match((await download(installer)).error, /有限区间/);
  assert.match((await download(installer, 3, { start: 0, end: 2 })).error, /未返回指定分段/);
  assert.match((await download(installer, 3, { start: 7, end: 9 })).error, /范围或长度无效/);
  assert.equal(browserNetwork, 0, 'page fetch is not used for extension downloads');
  assert.match((await download(versionUrl + '?query=1')).error, /无效/);
  assert.match((await download(media + 'audio/unknown/' + 'e'.repeat(32) + '.mp3')).error, /允许范围/);
  assert.match((await download(clip)).error, /允许范围|跳转/);
  assert.match((await download(dynamic, 100)).error, /上限/);

  const aborted = await page.evaluate(async url => {
    const game = window[Symbol.for('sgs.ol.toolbox.core')].game;
    const controller = new AbortController();
    const download = game.downloadMobileSkinAsset(url, { signal: controller.signal });
    setTimeout(() => controller.abort(), 40);
    try { await download; } catch (error) { return error.message; }
  }, portrait);
  assert.match(aborted, /已取消/);
  const readCalls = async () => (await isolate('window.calls')).result.value;
  const calls = await readCalls();
  assert.deepEqual(calls.map(call => call.url), [versionUrl, cloudZip, configZip, installer, installer, installer, clip, dynamic, portrait]);
  assert.ok(calls.every(call => call.method === 'GET' && call.anonymous === true && call.redirect === 'error' && call.responseType === 'arraybuffer'));
  assert.deepEqual(calls.filter(call => call.range).map(call => call.range), ['bytes=-3', 'bytes=0-2', 'bytes=7-9']);
  assert.deepEqual(calls.map(call => call.aborts), [0, 0, 0, 0, 1, 0, 0, 1, 1]);

  // With no privileged API (normal page boot), the same script and API still work via CORS.
  await page.goto(gamePage + '?fixture=native');
  await page.evaluate(() => { window.Laya = { stage: { fixtureMarker: 73 } }; });
  await page.addScriptTag({ content: code });
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  assert.deepEqual(await download(versionUrl), { ...response, bytes: [8, 6, 7] });
  assert.equal(browserNetwork, 1);
  assert.match((await download(versionUrl, 2)).error, /上限/);
  assert.match((await download(cloudZip)).error, /下载索引失败。用户脚本跨域下载未连接/);
  assert.deepEqual(errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, browser: 'Chromium',
    checks: ['one script with isolated privileged download, a wrapped window, and page-realm boot', 'transfer exact binary without page fetch',
      'fixed routes, redirect rejection, bounded response and cancellation', 'official configuration and installer range validation',
      'page fetch fallback and missing-bridge error'],
    manual: ['iPad Safari Userscripts document-start and large binary download'], calls }, null, 2));
  console.log('Mobile skin download bridge passed: ' + output);
} finally { await browser.close(); }
