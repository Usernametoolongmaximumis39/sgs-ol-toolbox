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
const navigations = new Map();
const mainFrames = new Map();
const crypto = require('crypto');
const https = require('https');
const UPDATE_SOURCES = [
  'https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/microclient/',
  'https://tools.3gs.xyz/sgs-toolbox/microclient/'
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
function download(url, limit) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('更新服务器返回 ' + response.statusCode)); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > limit) request.destroy(new Error('更新文件过大')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.setTimeout(20000, () => request.destroy(new Error('更新下载超时')));
    request.on('error', reject);
  });
}
let updating = false;
async function updateScript(action) {
  if (!['check', 'install', 'rollback'].includes(action)) throw new Error('未知更新操作');
  if (updating) throw new Error('正在更新，请稍候');
  updating = true;
  try {
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
        const manifest = JSON.parse((await download(base + 'update.json', 16384)).toString('utf8'));
        if (manifest.format !== 'sgs-toolbox-script-v1' || manifest.hostApi !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 12 * 1024 * 1024) throw new Error('脚本更新清单无效或需要新版接入层');
        const newer = compare(manifest.version, current.version) > 0;
        if (action === 'check' || !newer) return { version: manifest.version, current: current.version, newer, rollback: !!(saved && valid(saved.previous)) };
        const bytes = await download(base + 'toolbox.js', 12 * 1024 * 1024);
        const next = { version: manifest.version, sha256: manifest.sha256, source: bytes.toString('utf8') };
        if (bytes.length !== manifest.bytes || hash(bytes) !== manifest.sha256 || !valid(next) || !next.source.startsWith('// 三国杀OL工具箱 · 微端 LITE · ')) throw new Error('脚本版本或摘要校验失败');
        new (require('vm').Script)(next.source); // Parse only; never run remote code in the main process.
        saveUpdate({ current: next, previous: current });
        return { version: next.version, pending: true, rollback: true };
      } catch (error) { errors.push(error.message); }
    }
    throw new Error('脚本更新失败：' + errors.join('；'));
  } finally { updating = false; }
}
function allowed(event) {
  const url = event.senderFrame ? event.senderFrame.url : navigations.get(event.sender.id) || event.sender.getURL();
  const frame = event.senderFrame ? null : mainFrames.get(event.sender.id);
  return isGameURL(url) && (event.senderFrame ? !event.senderFrame.parent : !!frame && event.frameId === frame.routingId && event.sender.getProcessId() === frame.processId);
}
ipcMain.handle('sgs-toolbox:update:v1', async (event, action) => {
  if (!allowed(event)) throw new Error('仅允许官方游戏主页面更新工具箱');
  return updateScript(action);
});
ipcMain.handle('sgs-toolbox:channel-shell:v1', (event, request) => {
  const url = event.senderFrame ? event.senderFrame.url : event.sender.getURL();
  if (!/^file:/i.test(url) || !/index_wd\.html(?:[?#]|$)/i.test(url)) throw new Error('仅允许微端外壳切换游戏渠道');
  if (!request || typeof request !== 'object') throw new Error('无效的渠道请求');
  if (request.action === 'get') return channelState();
  if (request.action !== 'set') throw new Error('未知渠道操作');
  const packageId = Number(request.packageId);
  if (!Number.isInteger(packageId) || !channelList().some(channel => channel.id === packageId)) throw new Error('当前客户端不包含该游戏渠道');
  saveChannel(packageId);
  return channelState();
});
// Electron 10 getURL() can still return the previous document during preload.
// Record the actual main-frame navigation before the new preload requests source.
app.on('web-contents-created', function (_, contents) {
  const id = contents.id;
  const remember = function (_, url, _inPlace, mainFrame, processId, routingId) { if (mainFrame) { navigations.set(id, url); mainFrames.set(id, { processId, routingId }); } };
  contents.on('did-start-navigation', remember);
  contents.on('will-redirect', remember);
  contents.on('did-frame-navigate', function (_, url, _status, _text, mainFrame, processId, routingId) { remember(_, url, false, mainFrame, processId, routingId); });
  contents.once('destroyed', function () { navigations.delete(id); mainFrames.delete(id); });
});
function isGameURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname === 'web.sanguosha.com'
      && /^\/220\/h5_2\/index(?:_\d+)?\.php$/.test(url.pathname);
  } catch (_) { return false; }
}
ipcMain.on('sgs-toolbox:source:v1', event => {
  // Only the official OL game guest, never a login/payment/third-party frame.
  const url = event.senderFrame ? event.senderFrame.url : navigations.get(event.sender.id) || event.sender.getURL();
  const topLevel = !event.senderFrame || !event.senderFrame.parent;
  event.returnValue = isGameURL(url) && topLevel ? (loadUpdate()?.current.source || code) : '';
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
