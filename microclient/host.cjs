'use strict';
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'toolbox.js'), 'utf8');
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
