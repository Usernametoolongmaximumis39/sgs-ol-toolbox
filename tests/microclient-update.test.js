import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
const host = fs.readFileSync('microclient/host.cjs', 'utf8');
const source = v => '// 三国杀OL工具箱 · 微端 LITE · ' + v + '\nvoid 0;';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function fixture(existingDirectory) {
  const dir = existingDirectory || fs.mkdtempSync(path.join(os.tmpdir(), 'sgs-update-')), handlers = {}, requests = [];
  let created;
  let remote = source('1.0.1'), broken = false, offline = false, failWrite = false;
  const baseline = source('1.0.0');
  const disk = Object.create(fs);
  disk.readFileSync = (file, ...args) => file.endsWith('toolbox.js') ? baseline : fs.readFileSync(file, ...args);
  disk.renameSync = (...args) => { if (failWrite) throw Error('disk denied'); fs.renameSync(...args); };
  const https = { get(url, callback) {
    requests.push(url);
    const req = new EventEmitter();
    req.destroy = error => { req.emit('error', error); req.emit('close'); };
    queueMicrotask(() => {
      if (offline || !url.includes('tools.3gs.xyz')) {
        req.destroy(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }));
        return;
      }
      const response = new EventEmitter(); response.statusCode = 200;
      const data = url.endsWith('update.json') ? JSON.stringify({ format: 'sgs-toolbox-script-v1', hostApi: 1, version: '1.0.1', bytes: Buffer.byteLength(remote), sha256: broken ? '0'.repeat(64) : sha(remote) }) : remote;
      callback(response); response.emit('data', Buffer.from(data)); response.emit('end');
      req.emit('close');
    });
    return req;
  } };
  vm.runInNewContext(host, { URL, Buffer, setTimeout, clearTimeout, __dirname: dir, require(id) {
    if (id === 'electron') return { app: { once() {}, on: (name, fn) => { if (name === 'web-contents-created') created = fn; }, getPath: () => dir }, ipcMain: { on: (n, f) => handlers[n] = f, handle: (n, f) => handlers[n] = f } };
    return ({ fs: disk, path, crypto, https, vm })[id];
  } });
  const event = (url = 'https://web.sanguosha.com/220/h5_2/index.php', parent = null) => ({ senderFrame: { url, parent } });
  const contents = new EventEmitter(); contents.id = 1; contents.getURL = () => event().senderFrame.url; contents.getProcessId = () => 7;
  created(null, contents); contents.emit('did-start-navigation', null, contents.getURL(), false, true, 7, 4);
  return { dir, requests, legacy: { sender: contents, frameId: 4 }, call: (a, e = event()) => handlers['sgs-toolbox:update:v1'](e, a), read() { const e = event(); handlers['sgs-toolbox:source:v1'](e); return e.returnValue; }, set(options) { if ('broken' in options) broken = options.broken; if ('offline' in options) offline = options.offline; if ('failWrite' in options) failWrite = options.failWrite; if ('remote' in options) remote = options.remote; }, event, cleanup() { fs.rmSync(dir, { recursive: true, force: true }); } };
}
test('script updates use fallback, persist verified code, survive offline restart and rollback', async () => {
  const f = fixture();
  try {
    const sentinel = path.join(f.dir, 'settings'); fs.writeFileSync(sentinel, 'disabled plugins / rollback state');
    assert.equal((await f.call('check')).newer, true); assert.equal(f.read(), source('1.0.0'));
    assert.deepEqual(f.requests.map(url => new URL(url).hostname), [
      'chk-sgstools-hangzhou.oss-cn-hangzhou.aliyuncs.com', 'raw.githubusercontent.com', 'tools.3gs.xyz'
    ]);
    assert.equal((await f.call('install')).pending, true); assert.equal(f.read(), source('1.0.1'));
    const restarted = fixture(f.dir); restarted.set({ offline: true }); assert.equal(restarted.read(), source('1.0.1'));
    assert.equal((await f.call('check')).newer, false);
    f.set({ offline: true }); await assert.rejects(f.call('check'), /更新失败.*tools\.3gs\.xyz（连接超时）/); assert.equal(f.read(), source('1.0.1'));
    assert.equal((await f.call('rollback')).version, '1.0.0'); assert.equal(f.read(), source('1.0.0'));
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'disabled plugins / rollback state');
    assert(f.requests.every(url => url.startsWith('https://')));
  } finally { f.cleanup(); }
});
test('bad downloads and write failures preserve the working script; frame and operation checks fail closed', async () => {
  const f = fixture();
  try {
    for (const e of [f.event('https://evil.example/'), f.event(undefined, {})]) await assert.rejects(f.call('install', e), /仅允许/);
    await assert.rejects(f.call('https://evil.example/'), /未知更新操作/); assert.equal(f.requests.length, 0);
    await assert.rejects(f.call('check', { ...f.legacy, frameId: 8 }), /仅允许/);
    assert.equal((await f.call('check', f.legacy)).newer, true);
    const firstCheck = f.call('check'); await assert.rejects(f.call('check'), /正在更新/); await firstCheck;
    f.set({ broken: true }); await assert.rejects(f.call('install'), /校验失败/); assert.equal(f.read(), source('1.0.0'));
    f.set({ broken: false, failWrite: true }); await assert.rejects(f.call('install'), /disk denied/); assert.equal(f.read(), source('1.0.0'));
    f.set({ failWrite: false, remote: source('1.0.1') + '\n! invalid javascript @' }); await assert.rejects(f.call('install')); assert.equal(f.read(), source('1.0.0'));
    f.set({ remote: source('1.0.1') }); await f.call('install');
    const file = path.join(f.dir, 'sgs-toolbox-script-update.json'); const data = JSON.parse(fs.readFileSync(file)); data.current.source += 'tamper'; fs.writeFileSync(file, JSON.stringify(data)); assert.equal(f.read(), source('1.0.0'));
  } finally { f.cleanup(); }
});
