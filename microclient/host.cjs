'use strict';
const { app, ipcMain, screen } = require('electron');
// The official shell creates its main window first. Resize it once only;
// payment/login popups and subsequent user resizing retain their own sizes.
app.once('browser-window-created', function (_, window) {
  const display = screen.getDisplayMatching(window.getBounds());
  const scale = display.scaleFactor || 1;
  const width = Math.round(Math.max(1400, display.size.width * scale / 2) / scale);
  const height = Math.round(Math.max(820, display.size.height * scale / 2) / scale);
  window.setSize(width, height);
  window.center();
});
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'toolbox.js'), 'utf8');
const installedPackage = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')); } catch (_) { return {}; } })();
const CHANNELS = [{ id: 1, name: '官服' }, { id: 3, name: '4399' }];
function channelFile() {
  let base;
  try { base = app.getPath('userData'); } catch (_) { base = process.env.APPDATA ? path.join(process.env.APPDATA, 'SGSOL') : path.join(__dirname, '..'); }
  return path.join(base, 'sgs-toolbox-channel.json');
}
function readChannel() {
  try {
    const value = JSON.parse(fs.readFileSync(channelFile(), 'utf8'));
    const packageId = Number(value && value.packageId);
    return Number.isInteger(packageId) ? packageId : null;
  } catch (_) { return null; }
}
function saveChannel(packageId) {
  const file = channelFile(), temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify({ packageId }), { mode: 0o600 }); fs.renameSync(temp, file); }
  finally { try { fs.unlinkSync(temp); } catch (_) {} }
}
function channelList() {
  const login = Array.isArray(installedPackage.LoginURL) ? installedPackage.LoginURL : [];
  return CHANNELS.filter(channel => typeof login[channel.id - 1] === 'string' && login[channel.id - 1].length > 0);
}
function channelPackageId(fallback) {
  const saved = readChannel();
  if (saved !== null && channelList().some(channel => channel.id === saved)) return saved;
  const value = Number(fallback);
  return Number.isInteger(value) && value > 0 ? value : 1;
}
function channelState() {
  const channels = channelList();
  const installed = Number.isInteger(Number(installedPackage.packageId)) ? Number(installedPackage.packageId) : 1;
  const running = Number.isInteger(Number(global.PackageId)) ? Number(global.PackageId) : installed;
  const saved = readChannel();
  const selected = saved !== null && channels.some(channel => channel.id === saved) ? saved : running;
  return { running, selected, installed, channels, restartRequired: selected !== running };
}
if (typeof module !== 'undefined') module.exports = { channelPackageId };
const mainFrames = new WeakMap();
const crypto = require('crypto');
const https = require('https');
const UPDATE_SOURCES = [
  'https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/microclient/',
  'https://dl.3gs.xyz/microclient/'
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const versionOf = source => { const match = /^\/\/ 三国杀OL工具箱 · 微端 (?:LITE|FULL) · (\d+\.\d+\.\d+)\r?\n/.exec(source); return match && match[1]; };
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
function updateFile() { return path.join(app.getPath('userData'), 'sgs-toolbox-script-update.json'); }
function valid(entry) { return entry && typeof entry.source === 'string' && Buffer.byteLength(entry.source) <= 12 * 1024 * 1024 && versionOf(entry.source) === entry.version && hash(entry.source) === entry.sha256; }
function loadUpdate() {
  try { const value = JSON.parse(fs.readFileSync(updateFile(), 'utf8')); return valid(value.current) && compare(value.current.version, versionOf(code) || '0.0.0') > 0 ? value : null; }
  catch (_) { return null; }
}
function saveUpdate(value) {
  const file = updateFile(), temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, file); }
  finally { try { fs.unlinkSync(temp); } catch (_) {} }
}
function startDownload(url, limit, timeout, label = '更新', resource) {
  let request;
  const promise = new Promise((resolve, reject) => {
    const receive = response => {
      let expectedLength;
      try {
        if (resource?.range) expectedLength = MobileSkinSecurity.mobileSkinPartialLength(resource, response.statusCode,
          response.headers?.['content-range'], response.headers?.['content-length'], response.headers?.['content-encoding']);
        else if (response.statusCode !== 200) { response.resume(); reject(Object.assign(new Error(label + '服务器返回 ' + response.statusCode), { statusCode: response.statusCode })); return; }
        if (Number(response.headers?.['content-length']) > limit) throw new Error(label + '文件过大');
      } catch (error) { request.destroy(error); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > (expectedLength ?? limit)) {
          const error = new Error(label + '文件过大');
          reject(error);
          request.destroy(error);
        } else chunks.push(chunk);
      });
      response.on('end', () => {
        if (expectedLength !== undefined && size !== expectedLength) reject(new Error('移动版安装包分段响应长度不符'));
        else resolve(Buffer.concat(chunks));
      });
      response.on('aborted', () => reject(new Error(label + '下载中断')));
      response.on('error', reject);
    };
    request = resource?.headers ? https.get(url, { headers: { ...resource.headers, 'Accept-Encoding': 'identity' } }, receive) : https.get(url, receive);
    const deadline = setTimeout(() => request.destroy(new Error(label + '下载超时')), timeout);
    request.once('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
  return { promise, cancel() { request?.destroy(new Error(label + '下载已取消')); } };
}
function download(url, limit, timeout) {
  return startDownload(url, limit, timeout).promise;
}
async function updateScript(action) {
  const saved = loadUpdate(), current = saved ? saved.current : { source: code, version: versionOf(code) || '0.0.0', sha256: hash(code) };
  if (action === 'rollback') {
    if (!saved || !valid(saved.previous)) throw new Error('没有可回退的脚本');
    // Never persist an older script than the installed host baseline.
    if (compare(saved.previous.version, versionOf(code) || '0.0.0') < 0) throw new Error('旧脚本低于安装版本');
    saveUpdate({ current: saved.previous }); return { version: saved.previous.version, pending: true, rollback: false };
  }
  const errors = [];
  for (const base of UPDATE_SOURCES) {
    try {
      const manifest = JSON.parse((await download(base + 'update.json', 16384, 10000)).toString('utf8'));
      if (manifest.format !== 'sgs-toolbox-script-v1' || manifest.hostApi !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 12 * 1024 * 1024) throw new Error('脚本更新清单无效或需要新版接入层');
      const newer = compare(manifest.version, current.version) > 0;
      if (action === 'check' || !newer) return { version: manifest.version, current: current.version, newer, rollback: !!(saved && valid(saved.previous)) };
      const bytes = await download(base + 'toolbox.js', 12 * 1024 * 1024, 20000);
      const next = { version: manifest.version, sha256: manifest.sha256, source: bytes.toString('utf8') };
      if (bytes.length !== manifest.bytes || hash(bytes) !== manifest.sha256 || !valid(next) || !next.source.startsWith('// 三国杀OL工具箱 · 微端 LITE · ')) throw new Error('脚本版本或摘要校验失败');
      new (require('vm').Script)(next.source); // Parse only; never run remote code in the main process.
      saveUpdate({ current: next, previous: current });
      return { version: next.version, pending: true, rollback: true };
    } catch (error) {
      const detail = error.code === 'ETIMEDOUT' ? '连接超时' : error.message;
      errors.push(new URL(base).hostname + '（' + detail + '）');
    }
  }
  throw new Error('脚本更新失败：' + errors.join('；'));
}
function topFrameURL(event) {
  const frame = mainFrames.get(event.sender);
  if (frame?.waitForCommit) return '';
  if (event.senderFrame) return event.senderFrame.parent ? '' : event.senderFrame.url;
  const processId = event.processId ?? event.sender?.getProcessId?.();
  return frame && frame.routingId >= 0 && frame.processId >= 0 &&
    event.frameId === frame.routingId && processId === frame.processId ? frame.url : '';
}
function allowed(event) { return isGameURL(topFrameURL(event)); }

const boot = typeof bootstrap === 'undefined' ? null : bootstrap;
const runtimeTools = typeof MicroclientRuntimeUpdate === 'undefined' ? null : MicroclientRuntimeUpdate;
const runtime = boot && runtimeTools?.createRuntimeUpdater({ bootstrap: boot, sources: UPDATE_SOURCES, download });
const shellFile = typeof path.resolve === 'function' ? path.resolve(boot?.installDir || __dirname, '..', 'index_wd.html') : null;
const shells = new Set();
let runningScript = null, scriptCheck = null, scriptError = null, busy = null, revision = 0;
let scriptErrorAuto = false, runtimeErrorAuto = false, lastUpdate = null;
let coreOperationDone = null, startupSynced = null;

function corePrefsFile() { return path.join(app.getPath('userData'), 'sgs-toolbox-core-prefs.json'); }
function corePrefsIO() { return runtimeTools || require('./runtime-cache.cjs'); }
function autoUpdateEnabled() {
  try { return corePrefsIO().readJSON(corePrefsFile(), 4096)?.autoUpdate !== false; }
  catch (_) { return true; }
}

function isShell(url) {
  if (!shellFile) return false;
  try { return path.resolve(require('url').fileURLToPath(url)).toLowerCase() === shellFile.toLowerCase(); }
  catch (_) { return false; }
}

function scriptIdentity(source) {
  return {
    version: versionOf(source),
    edition: source.startsWith('// 三国杀OL工具箱 · 微端 FULL · ') ? 'full' : 'lite',
    source: source === code ? 'bundled' : 'updated'
  };
}

function coreStatus() {
  const saved = loadUpdate();
  const target = scriptIdentity(saved?.current.source || code);
  const script = runningScript || target;
  return {
    busy, revision, autoUpdate: autoUpdateEnabled(), lastUpdate,
    script: {
      ...script, pending: script.version !== target.version ? target.version : null,
      rollback: !!saved && valid(saved.previous) && compare(saved.previous.version, versionOf(code) || '0.0.0') >= 0,
      newer: !!scriptCheck && compare(scriptCheck.version, target.version || '0.0.0') > 0,
      check: scriptCheck, error: scriptError, errorAuto: scriptErrorAuto
    },
    runtime: {
      ...(runtime?.status() || {
        version: boot?.activeRuntimeVersion || '1.0.1', source: 'bundled', bootstrapApi: 1,
        pending: null, rollback: false, recoveredFrom: null, check: null, error: null, newer: false
      }),
      errorAuto: runtimeErrorAuto
    }
  };
}

function notifyCore() {
  revision++;
  if (!shells.size) return;
  const status = JSON.stringify(coreStatus());
  for (const shell of shells) {
    try {
      if (!shell.isDestroyed() && isShell(shell.getURL())) {
        shell.executeJavaScript('window.dispatchEvent(new CustomEvent("sgs-toolbox-core-state", { detail: ' + status + ' }))').catch(() => {});
      }
    } catch (_) {}
  }
}

async function runScript(action, auto) {
  scriptError = null;
  scriptErrorAuto = auto;
  try {
    const result = await updateScript(action);
    if (action !== 'rollback') scriptCheck = { version: result.version };
    return result;
  } catch (error) {
    if (action === 'check') scriptCheck = null;
    scriptError = String(error.message || error);
    throw error;
  }
}

async function runCoreOperation(action, work, auto = false) {
  if (busy) throw new Error('正在更新，请稍候');
  if (!runningScript) runningScript = scriptIdentity(loadUpdate()?.current.source || code);
  let finish;
  coreOperationDone = new Promise(resolve => { finish = resolve; });
  let scriptVersion = null, runtimeVersion = null;
  const operations = {
    async script(op) {
      const result = await runScript(op, auto);
      if (op === 'install' && result.pending) scriptVersion = result.version;
      return result;
    },
    async runtime(op) {
      runtimeErrorAuto = auto;
      const installed = await runtime?.run(op);
      if (op === 'install' && installed) runtimeVersion = installed;
    }
  };
  busy = action;
  try {
    notifyCore();
    return await work(operations);
  } finally {
    busy = null;
    coreOperationDone = null;
    finish();
    if (scriptVersion || runtimeVersion) {
      const state = coreStatus();
      if (scriptVersion !== state.script.pending) scriptVersion = null;
      if (runtimeVersion !== state.runtime.pending) runtimeVersion = null;
      if (scriptVersion || runtimeVersion) lastUpdate = { auto, scriptVersion, runtimeVersion, revision: revision + 1 };
    }
    notifyCore();
  }
}

ipcMain.handle('sgs-toolbox:update:v1', async (event, action) => {
  if (!allowed(event)) throw new Error('仅允许官方游戏主页面更新工具箱');
  if (!['check', 'install', 'rollback'].includes(action)) throw new Error('未知更新操作');
  return runCoreOperation(action, operations => operations.script(action));
});

function checkUpdates(operations) {
  return Promise.all([operations.script('check').catch(() => {}), operations.runtime('check')]);
}

async function installAvailable(operations, auto = false) {
  const status = coreStatus();
  if (auto && !status.autoUpdate) return;
  const installScript = status.script.newer && !status.script.pending;
  const installRuntime = status.runtime.newer && !status.runtime.pending && !status.runtime.check?.unsupportedBootstrap;
  if (!installScript && !installRuntime) return;
  if (auto) {
    busy = 'install';
    notifyCore();
  }
  if (installScript) await operations.script('install').catch(() => {});
  if (installRuntime && (!auto || autoUpdateEnabled())) await operations.runtime('install');
}

async function startupSync() {
  // If the user already started a manual operation, check once that operation finishes.
  while (coreOperationDone) await coreOperationDone;
  await runCoreOperation('check', async operations => {
    await checkUpdates(operations);
    await installAvailable(operations, true);
  }, true);
}

async function handleCore(request) {
  const { action } = request;
  if (action === 'core:status') return coreStatus();
  if (action === 'core:set-auto-update') {
    if (typeof request.enabled !== 'boolean') throw new Error('启动时自动更新开关必须为布尔值');
    corePrefsIO().writeJSON(corePrefsFile(), { autoUpdate: request.enabled });
    notifyCore();
    return coreStatus();
  }
  if (action === 'core:startup-sync') {
    if (!startupSynced) startupSynced = startupSync();
    await startupSynced;
    return coreStatus();
  }
  if (action === 'core:relaunch') {
    if (busy) throw new Error('正在更新，请稍候');
    const status = coreStatus();
    if (status.script.pending || status.runtime.pending) { app.relaunch(); app.quit(); }
    return status;
  }
  const operation = {
    'core:check': ['check', checkUpdates],
    'core:update-script': ['install', operations => operations.script('install').catch(() => {})],
    'core:rollback-script': ['rollback', operations => operations.script('rollback').catch(() => {})],
    'core:update-runtime': ['install', operations => operations.runtime('install')],
    'core:rollback-runtime': ['rollback', operations => operations.runtime('rollback')],
    'core:update-all': ['install', installAvailable]
  }[action];
  if (!operation) throw new Error('未知核心操作');
  await runCoreOperation(...operation);
  return coreStatus();
}
const mobileSkinJobs = new WeakMap();
ipcMain.handle('sgs-toolbox:mobile-skin:v1', async (event, message) => {
  if (!allowed(event)) throw new Error('仅允许官方游戏主页面读取移动版皮肤');
  const { id, url, limit, range } = message ?? {};
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('无效的移动版皮肤下载请求');
  // This validator is bundled before host.cjs by build-microclient.mjs.
  const request = MobileSkinSecurity.toolboxDownloadRequest(url, limit, range);
  const label = request.label || '移动版皮肤资源';
  let jobs = mobileSkinJobs.get(event.sender);
  if (!jobs) mobileSkinJobs.set(event.sender, jobs = new Map());
  if (jobs.has(id) || jobs.size >= 24) throw new Error(`${label}下载请求过多，请稍后重试`);
  const job = startDownload(request.url, request.limit, request.timeout, label, request);
  jobs.set(id, job);
  try {
    const bytes = await job.promise;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } finally { jobs.delete(id); }
});
ipcMain.on('sgs-toolbox:mobile-skin-cancel:v1', (event, id) => {
  if (allowed(event)) mobileSkinJobs.get(event.sender)?.get(id)?.cancel();
});
const privateSyncJobs = new WeakMap();
ipcMain.handle('sgs-toolbox:private-sync-http:v1', async (event, message) => {
  const page = topFrameURL(event);
  if (!isGameURL(page) || !/^[a-f0-9]{32}$/.test(message?.id ?? '')) throw new Error('无效的私有同步请求');
  const origin = new URL(page).origin;
  const { url, headers, body } = MobileSkinSecurity.privateHttpRequest(message, origin);
  const { PRIVATE_HTTP_LIMIT: limit, PRIVATE_HTTP_TIMEOUT: timeout } = MobileSkinSecurity;
  let jobs = privateSyncJobs.get(event.sender);
  if (!jobs) privateSyncJobs.set(event.sender, jobs = new Map());
  if (jobs.has(message.id) || jobs.size >= 12 || Buffer.byteLength(body) > limit) throw new Error('私有同步请求超限');
  let request, timer;
  try {
    return await new Promise((resolve, reject) => {
      request = require('http').request(url, { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } }, response => {
        const chunks = [];
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > limit) request.destroy(new Error('私有同步响应超限'));
          else chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.once('error', reject);
      jobs.set(message.id, request);
      timer = setTimeout(() => request.destroy(new Error('私有同步请求超时')), timeout);
      request.end(body);
    });
  } finally { clearTimeout(timer); jobs.delete(message.id); }
});
ipcMain.on('sgs-toolbox:private-sync-http-cancel:v1', (event, id) => {
  if (allowed(event)) privateSyncJobs.get(event.sender)?.get(id)?.destroy(new Error('私有同步请求已取消'));
});
const accounts = typeof MicroclientAccounts === 'undefined' ? null : MicroclientAccounts.register({
  app, ipcMain, channelState, shellFile: path.resolve(__dirname, '..', 'index_wd.html')
});
ipcMain.handle('sgs-toolbox:channel-shell:v1', (event, request) => {
  if (accounts && typeof request?.action === 'string' && request.action.startsWith('accounts:')) return accounts.handle(event, request);
  if (typeof request?.action === 'string' && request.action.startsWith('core:')) {
    if (!shells.has(event.sender) || !isShell(event.sender.getURL()) || !isShell(topFrameURL(event))) {
      throw new Error('仅允许微端外壳管理工具箱核心');
    }
    return handleCore(request);
  }
  const url = event.senderFrame ? event.senderFrame.url : event.sender.getURL();
  if (!/^file:/i.test(url) || !/index_wd\.html(?:[?#]|$)/i.test(url)) throw new Error('仅允许微端外壳切换游戏渠道');
  if (!request || typeof request !== 'object') throw new Error('无效的渠道请求');
  if (request.action === 'get') return channelState();
  if (request.action !== 'set') throw new Error('未知渠道操作');
  const packageId = Number(request.packageId);
  if (!Number.isInteger(packageId) || !channelList().some(channel => channel.id === packageId)) throw new Error('当前客户端不包含该游戏渠道');
  saveChannel(packageId);
  accounts?.notify(event.sender);
  return channelState();
});
const preloadAfterCommit = 'sgs-toolbox:preload-after-commit:v1';
// Older installed bootstraps can run this small loader as a preload reply.
// The real runtime and game source still require the verified main frame.
const waitForGamePreload = '(' + function (channel) {
  const { ipcRenderer } = require('electron');
  ipcRenderer.invoke(channel).then(reply => {
    if (reply?.mode === 'code') new Function('require', reply.source)(require);
  }).catch(error => console.error('[工具箱微端]', error));
}.toString() + ')(' + JSON.stringify(preloadAfterCommit) + ');';

// Electron 10 can report the old renderer's frame IDs during a cross-site
// redirect. In that case the new preload must wait for the committed IDs.
app.on('web-contents-created', function (_, contents) {
  let committedFrame, finishRedirect;
  function releasePreload() {
    finishRedirect?.();
    finishRedirect = null;
  }
  function remember(url, processId, routingId, deferPreload = false) {
    const waitForCommit = deferPreload ? mainFrames.get(contents)?.waitForCommit ||
      new Promise(resolve => { finishRedirect = resolve; }) : null;
    const frame = { url, processId, routingId, waitForCommit };
    mainFrames.set(contents, frame);
    if (!deferPreload) releasePreload();
    return frame;
  }
  contents.on('did-start-navigation', (_, url, _inPlace, mainFrame, processId, routingId) => {
    if (mainFrame) remember(url, processId, routingId);
  });
  const redirect = (_, url, _inPlace, mainFrame, processId, routingId) => {
    if (mainFrame) remember(url, processId, routingId,
      !!boot?.activePreloadSource && contents.getType?.() === 'webview' && isGameURL(url));
  };
  contents.on('will-redirect', redirect);
  contents.on('did-redirect-navigation', redirect);
  contents.on('did-frame-navigate', (_, url, _status, _text, mainFrame, processId, routingId) => {
    if (mainFrame) committedFrame = remember(url, processId, routingId);
  });
  contents.on('did-fail-provisional-load', (_, _code, _description, url, mainFrame) => {
    const frame = mainFrames.get(contents);
    if (!mainFrame || !frame?.waitForCommit || frame.url !== url) return;
    if (committedFrame && contents.getURL() === committedFrame.url) mainFrames.set(contents, committedFrame);
    else mainFrames.delete(contents);
    releasePreload();
  });
  const cancelSkinJobs = () => { for (const job of mobileSkinJobs.get(contents)?.values() ?? []) job.cancel(); };
  contents.on('did-start-navigation', (_, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) cancelSkinJobs(); });
  if (shellFile && contents.getType?.() === 'window') {
    contents.on('did-finish-load', () => {
      if (!isShell(contents.getURL())) { shells.delete(contents); return; }
      shells.add(contents);
      if (typeof MicroclientTopbar !== 'undefined') {
        contents.executeJavaScript('(' + MicroclientTopbar.mountTopbar.toString() + ')();').catch(() => {});
      }
    });
  }
  contents.once('destroyed', function () {
    cancelSkinJobs(); mainFrames.delete(contents); shells.delete(contents);
    releasePreload();
  });
});
function isGameURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname === 'web.sanguosha.com'
      && /^\/220\/h5_2\/index(?:_\d+)?\.php$/.test(url.pathname);
  } catch (_) { return false; }
}
ipcMain.on('sgs-toolbox:source:v1', event => {
  if (!allowed(event)) { event.returnValue = ''; return; }
  const source = loadUpdate()?.current.source || code;
  event.returnValue = source;
  const identity = scriptIdentity(source);
  const changed = runningScript?.version !== identity.version || runningScript?.source !== identity.source;
  runningScript = identity;
  if (changed) notifyCore();
});
ipcMain.on('sgs-toolbox:preload:v1', event => {
  if (boot?.activePreloadSource && mainFrames.get(event.sender)?.waitForCommit && !event.senderFrame?.parent) {
    event.returnValue = { mode: 'code', source: waitForGamePreload };
    return;
  }
  const url = topFrameURL(event);
  const isLogin = typeof MicroclientAccounts !== 'undefined' && MicroclientAccounts.loginChannel(url) > 0;
  event.returnValue = isGameURL(url) || isLogin
    ? (boot?.activePreloadSource ? { mode: 'code', source: boot.activePreloadSource } : null)
    : { mode: 'skip' };
});
ipcMain.handle(preloadAfterCommit, async event => {
  if (!boot?.activePreloadSource || event.senderFrame?.parent) return { mode: 'skip' };
  const { sender } = event;
  await mainFrames.get(sender)?.waitForCommit;
  if (sender.isDestroyed?.()) return { mode: 'skip' };
  const url = topFrameURL(event);
  return isGameURL(url) && url === sender.getURL()
    ? { mode: 'code', source: boot.activePreloadSource }
    : { mode: 'skip' };
});

// Read only the official cashier endpoints; never forward cookies or execute HTML.
function cashierURL(value, initial = true) {
  const u = new URL(value);
  const gateway = u.origin === 'https://openapi.alipay.com' && u.pathname === '/gateway.do';
  const cashier = u.origin === 'https://excashier.alipay.com' && u.pathname === '/standard/auth.htm';
  const assignment = u.origin === 'https://unitradeprod.alipay.com' && u.pathname === '/appAssign.htm';
  const method = u.searchParams.get('method');
  // Redirects may return to the gateway without repeating the original method.
  // Keep the initiating request strict and validate every redirect endpoint.
  if (u.username || u.password || !(gateway || cashier || assignment) || (initial && (!gateway || method !== 'alipay.trade.page.pay')) || (gateway && method && method !== 'alipay.trade.page.pay')) {
    const host = u.hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 100);
    const route = u.pathname.replace(/[^a-z0-9/_.-]/gi, '_').slice(0, 100);
    throw Error('支付宝收银台' + (initial ? '入口' : '跳转') + '地址异常（域名：' + host + '；路径：' + route + '）');
  }
  return u.href;
}
function readCashier(value, redirects = 0) {
  const url = cashierURL(value, redirects === 0);
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 4) return reject(Error('支付宝跳转次数过多'));
        try { resolve(readCashier(new URL(res.headers.location, url).href, redirects + 1)); } catch (e) { reject(e); }
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(Error('支付宝收银台 HTTP ' + res.statusCode)); return; }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) req.destroy(Error('支付宝收银台内容过大')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({status:200, finalUrl:url, responseText:Buffer.concat(chunks).toString('utf8')}));
    });
    req.setTimeout(12000, () => req.destroy(Error('支付宝收银台读取超时')));
    req.on('error', reject);
  });
}
ipcMain.handle('sgs-toolbox:alipay:v1', (event, url) => {
  if (!allowed(event)) throw Error('仅允许官方游戏主页面解析付款码');
  return readCashier(url);
});
