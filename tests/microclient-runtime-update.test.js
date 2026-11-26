import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import cache from '../microclient/runtime-cache.cjs';
import { buildMicroclientHost, buildMicroclientPreload, buildMicroclientRuntimeHost } from '../tools/build-microclient.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { version: bundledVersion } = JSON.parse(fs.readFileSync(path.join(root, 'microclient/runtime-version.json'), 'utf8'));
const [major, minor, patch] = bundledVersion.split('.').map(Number);
const nextRuntimeVersion = [major, minor, patch + 1].join('.');
const laterRuntimeVersion = [major, minor, patch + 2].join('.');
const [host, preload, runtimeHost] = await Promise.all([
  buildMicroclientHost(root),
  buildMicroclientPreload(root),
  buildMicroclientRuntimeHost(root)
]);
const hostScript = new vm.Script(host.toString('utf8'), { filename: 'payload/host.cjs' });
const preloadScript = new vm.Script(preload.toString('utf8'), { filename: 'payload/preload.cjs' });
const runtimeRequire = createRequire(import.meta.url);
const { FORMAT, hash, files } = cache;
const game = 'https://web.sanguosha.com/220/h5_2/index_110074.php';
const login = 'https://web.sanguosha.com/login/air/client/h5/index';
const partner = 'https://my.4399.com/yxsgs/wd-home';
const pay = 'https://openapi.alipay.com/gateway.do';
const script = (version, edition = 'LITE') => '// 三国杀OL工具箱 · 微端 ' + edition + ' · ' + version + '\nvoid 0;';
const cached = (version, hostSource = 'module.exports = { channelPackageId: Number, context: bootstrap };', preloadSource = 'window.active = true;') => ({
  format: FORMAT, bootstrapApi: 1, version,
  hostSource, hostSha256: hash(hostSource), preloadSource, preloadSha256: hash(preloadSource)
});
const asJSON = value => JSON.parse(JSON.stringify(value));

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgs-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const addon = path.join(dir, 'app', 'sgs-toolbox');
  fs.mkdirSync(addon, { recursive: true });
  fs.writeFileSync(path.join(addon, 'toolbox.js'), script('0.6.300', 'FULL'));
  const updateFile = path.join(dir, 'profile', 'sgs-toolbox-runtime-update.json');
  const bootFile = path.join(dir, 'profile', 'sgs-toolbox-runtime-boot.json');
  const prefsFile = path.join(dir, 'profile', 'sgs-toolbox-core-prefs.json');
  const shellURL = pathToFileURL(path.join(dir, 'app', 'index_wd.html')).href;
  const requests = [];
  const replies = new Map();
  const https = {
    get(url, receive) {
      requests.push(url);
      const request = new EventEmitter();
      request.destroy = error => { request.emit('error', error); request.emit('close'); };
      queueMicrotask(() => {
        const data = replies.get(new URL(url).pathname.split('/').pop());
        const response = new EventEmitter();
        response.statusCode = data === undefined ? 404 : 200;
        response.resume = () => {};
        receive(response);
        if (data !== undefined) response.emit('data', Buffer.from(data));
        response.emit('end');
        request.emit('close');
      });
      return request;
    }
  };
  function start() {
    let ready;
    const readiness = new Promise(r => { ready = r; });
    const app = Object.assign(new EventEmitter(), {
      getPath: () => path.dirname(updateFile),
      whenReady: () => readiness,
      relaunch: () => lifecycle.push('relaunch'),
      quit: () => lifecycle.push('quit')
    });
    const lifecycle = [], handlers = new Map();
    const ipcMain = Object.assign(new EventEmitter(), {
      handle(name, fn) {
        assert(!handlers.has(name), 'duplicate handler: ' + name);
        handlers.set(name, fn);
      },
      removeHandler: name => handlers.delete(name)
    });
    const module = { exports: {} };
    hostScript.runInNewContext({
      __dirname: addon, module, exports: module.exports, process, console, Buffer,
      require(id) { return id === 'electron' ? { app, ipcMain } : id === 'https' ? https : runtimeRequire(id); }
    });
    let id = 0;
    const events = [];
    function contents(url, type = 'webview') {
      const wc = Object.assign(new EventEmitter(), {
        id: ++id, getType: () => type, getURL: () => url, getProcessId: () => 7, isDestroyed: () => false,
        executeJavaScript: async source => {
          if (source.startsWith('window.dispatchEvent(')) vm.runInNewContext(source, {
            window: { dispatchEvent: event => events.push(event) },
            CustomEvent: function (type, options) { Object.assign(this, { type }, options); }
          });
        }
      });
      app.emit('web-contents-created', null, wc);
      wc.emit('did-start-navigation', null, url, false, true, 7, 4);
      wc.emit('did-frame-navigate', null, url, 200, '', true, 7, 4);
      wc.emit('did-finish-load');
      return wc;
    }
    return { ready, exports: module.exports, events, lifecycle, contents,
      core: (sender, request) => handlers.get('sgs-toolbox:channel-shell:v1')(sender,
        typeof request === 'string' ? { action: request } : request),
      legacy: (sender, action) => handlers.get('sgs-toolbox:update:v1')(sender, action),
      sync(name, sender) { ipcMain.emit(name, sender); return sender.returnValue; }
    };
  }
  return { updateFile, bootFile, prefsFile, requests, replies, start, shellURL, save: (entry, prev) => cache.writeCache(updateFile, entry, prev) };
}

test('bootstrap loads an updated host and preload, clears readiness marker, and prefers a matching or newer installer', async t => {
  const f = fixture(t);
  const bundled = f.start();
  const shell = bundled.contents(f.shellURL, 'window');
  const status = await bundled.core({ sender: shell, frameId: 4 }, 'core:status');
  assert.equal(status.runtime.version, bundledVersion);
  assert.equal(status.runtime.source, 'bundled');
  assert.equal(bundled.exports.channelPackageId(3), 3);
  const newer = cached(nextRuntimeVersion);
  f.save(newer);
  const updated = f.start();
  assert.equal(updated.exports.context.activeRuntimeVersion, nextRuntimeVersion);
  assert.equal(updated.exports.context.activePreloadSource, newer.preloadSource);
  assert.equal(updated.exports.context.activeRuntimeSource, 'updated');
  assert.equal(updated.exports.context.runtimeUpdateFile(), f.updateFile);
  assert.equal(JSON.parse(fs.readFileSync(f.bootFile)).failures, 1);
  updated.ready();
  await Promise.resolve();
  assert.equal(JSON.parse(fs.readFileSync(f.bootFile)).failures, 0);

  for (const version of [bundledVersion, '0.0.0']) {
    f.save(cached(version));
    assert.equal(f.start().exports.context, undefined);
  }
});

test('invalid cache entries are ignored and syntactically invalid sources are removed', async t => {
  const f = fixture(t);
  const entry = cached(nextRuntimeVersion);
  for (const corrupt of [
    { ...entry, hostSha256: '0'.repeat(64) }, { ...entry, preloadSource: 'void 1' },
    { ...entry, bootstrapApi: 2 }, { ...entry, version: nextRuntimeVersion + '-beta' },
    cached(nextRuntimeVersion, '// ' + 'a'.repeat(files.host.limit))
  ]) {
    f.save(corrupt);
    assert.equal(f.start().exports.context, undefined);
  }
  for (const corrupt of [cached(laterRuntimeVersion, '!!!'), cached(laterRuntimeVersion, entry.hostSource, 'return )')]) {
    f.save(corrupt);
    const boot = f.start();
    const state = await boot.core({ sender: boot.contents(f.shellURL, 'window'), frameId: 4 }, 'core:status');
    assert.equal(state.runtime.recoveredFrom.version, corrupt.version);
    assert.equal(fs.existsSync(f.updateFile), false);
  }
});

test('partial IPC registration, synchronous exceptions and two unready boots recover safely', async t => {
  const f = fixture(t);
  const throws = cached(laterRuntimeVersion, 'require("electron").ipcMain.handle("sgs-toolbox:channel-shell:v1", () => {}); throw Error("startup sentinel")');
  const prev = cached(nextRuntimeVersion);
  f.save(throws, prev);
  const recovered = f.start();
  assert.equal(recovered.exports.context.activeRuntimeVersion, nextRuntimeVersion);
  assert.equal(recovered.exports.context.recoveredFrom.reason, 'startup sentinel');
  assert.equal(JSON.parse(fs.readFileSync(f.updateFile)).current.version, nextRuntimeVersion);
  recovered.ready();
  await Promise.resolve();

  f.save(throws);
  const fallback = f.start();
  const state = await fallback.core({ sender: fallback.contents(f.shellURL, 'window'), frameId: 4 }, 'core:status');
  assert.equal(state.runtime.recoveredFrom.version, laterRuntimeVersion);
  assert.equal(fs.existsSync(f.updateFile), false);

  f.save(prev);
  for (let attempt = 0; attempt < 2; attempt++) assert.equal(f.start().exports.context.activeRuntimeVersion, nextRuntimeVersion);
  const boot = f.start();
  const status = await boot.core({ sender: boot.contents(f.shellURL, 'window'), frameId: 4 }, 'core:status');
  assert.match(status.runtime.recoveredFrom.reason, /连续两次/);
  assert.equal(fs.existsSync(f.updateFile), false);
});

test('preload and shell IPC are restricted by page, window type, process and frame', async t => {
  const f = fixture(t);
  const boot = f.start();
  const source = (sender, extra = {}) => asJSON(boot.sync('sgs-toolbox:preload:v1', { sender, frameId: 4, ...extra }));
  for (const url of [game, login, partner]) {
    const guest = boot.contents(url);
    assert.equal(source(guest).mode, 'code');
    assert.match(source(guest).source, /__SGS_TOOLBOX_MICRO_PRELOAD__/);
    for (const extra of [{ frameId: 3 }, { processId: 8 }, { senderFrame: { url, parent: {} } }]) {
      assert.deepEqual(source(guest, extra), { mode: 'skip' });
    }
    assert.throws(() => boot.core({ sender: guest, frameId: 4 }, 'core:status'), /仅允许/);
  }
  for (const url of [pay, 'https://third-party.example/', f.shellURL]) assert.deepEqual(source(boot.contents(url)), { mode: 'skip' });
  const shell = boot.contents(f.shellURL, 'window');
  assert.equal((await boot.core({ sender: shell, frameId: 4 }, 'core:status')).script.edition, 'full');
  assert.throws(() => boot.core({ sender: shell, frameId: 3 }, 'core:status'), /仅允许/);
  assert.throws(() => boot.core({ sender: shell, senderFrame: { url: f.shellURL, parent: {} } }, 'core:status'), /仅允许/);
  assert.throws(() => boot.core({ sender: boot.contents(f.shellURL), frameId: 4 }, 'core:status'), /仅允许/);
  assert.throws(() => boot.core({ sender: boot.contents('file:///wrong/index_wd.html', 'window'), frameId: 4 }, 'core:status'), /仅允许/);
  assert.equal(f.requests.length, 0);
});

test('preload bootstrap runs active code once and falls back with older or faulty IPC', () => {
  function start(reply, top = true) {
    const window = { location: { href: game } };
    window.self = window;
    window.top = top ? window : {};
    let rendered = 0;
    const require = () => ({
      ipcRenderer: { sendSync(channel) {
        if (channel === 'sgs-toolbox:source:v1') return script('0.6.300');
        assert.equal(channel, 'sgs-toolbox:preload:v1');
        if (reply instanceof Error) throw reply;
        return reply;
      } },
      webFrame: { executeJavaScript: async () => { rendered++; } }
    });
    const context = vm.createContext({ window, location: window.location, require, console, URL });
    for (let i = 0; i < 2; i++) preloadScript.runInContext(context);
    return { window, rendered };
  }
  const active = { mode: 'code', source: 'window.count = (window.count || 0) + 1;' };
  assert.equal(start(active).window.count, 1);
  assert.equal(start(active, false).window.count, undefined);
  assert.equal(start({ mode: 'skip' }).rendered, 0);
  for (const reply of [null, new Error('missing handler'), { mode: 'code', source: '' }]) assert.equal(start(reply).rendered, 1);
});

function publishScript(replies, version = '0.6.301') {
  const remote = script(version);
  replies.set('update.json', JSON.stringify({
    format: 'sgs-toolbox-script-v1', hostApi: 1, version, bytes: Buffer.byteLength(remote), sha256: hash(remote)
  }));
  replies.set('toolbox.js', remote);
  return remote;
}

function publishRuntime(replies, entry, alter = () => {}) {
  const item = name => ({ file: files[name].file, bytes: Buffer.byteLength(entry[name + 'Source']), sha256: entry[name + 'Sha256'] });
  const manifest = { format: FORMAT, bootstrapApi: entry.bootstrapApi, version: entry.version, host: item('host'), preload: item('preload') };
  alter(manifest);
  replies.set('runtime-update.json', JSON.stringify(manifest));
  replies.set('runtime-host.cjs', entry.hostSource);
  replies.set('runtime-preload.cjs', entry.preloadSource);
}

test('titlebar script and runtime operations share state with in-game updates and survive a missing runtime manifest', async t => {
  const f = fixture(t);
  const boot = f.start();
  const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
  const guest = { sender: boot.contents(game), frameId: 4 };
  const core = action => boot.core(shell, 'core:' + action);
  const remote = publishScript(f.replies);
  const absent = await core('check');
  assert.equal(absent.runtime.check.unavailable, true);
  assert.equal(absent.script.newer, true);
  const legacy = await boot.legacy(guest, 'install');
  assert.deepEqual(asJSON(legacy), { version: '0.6.301', pending: true, rollback: true });
  assert.equal(boot.events.at(-1).type, 'sgs-toolbox-core-state');
  const legacyState = boot.events.at(-1).detail;
  assert.equal(legacyState.script.pending, '0.6.301');
  assert.deepEqual(asJSON(legacyState.lastUpdate), {
    auto: false, scriptVersion: '0.6.301', runtimeVersion: null, revision: legacyState.revision
  });
  assert.equal((await core('rollback-script')).script.pending, null);
  assert.deepEqual(asJSON((await core('status')).lastUpdate), asJSON(legacyState.lastUpdate));
  const manual = await core('update-script');
  assert.equal(manual.script.pending, '0.6.301');
  assert.equal(manual.lastUpdate.auto, false);
  assert.ok(manual.lastUpdate.revision > legacyState.lastUpdate.revision);
  assert.equal(boot.sync('sgs-toolbox:source:v1', guest), remote);
  assert.equal(boot.events.at(-1).detail.script.pending, null);
  assert.equal((await core('rollback-script')).script.pending, '0.6.300');

  const entry = cached(nextRuntimeVersion, 'throw Error("evaluated too early");');
  publishRuntime(f.replies, { ...entry, bootstrapApi: 2 });
  assert.equal((await core('check')).runtime.check.unsupportedBootstrap, true);
  publishRuntime(f.replies, entry, manifest => { manifest.preload.file = '../x.cjs'; });
  assert.match((await core('check')).runtime.error, /清单无效/);
  publishRuntime(f.replies, entry, manifest => { manifest.host.sha256 = '0'.repeat(64); });
  assert.match((await core('update-runtime')).runtime.error, /校验失败/);
  publishRuntime(f.replies, cached(nextRuntimeVersion, '!!!'));
  assert.ok((await core('update-runtime')).runtime.error);
  assert.equal(fs.existsSync(f.updateFile), false);

  publishRuntime(f.replies, entry);
  assert.equal((await core('check')).runtime.newer, true);
  assert.equal((await core('update-runtime')).runtime.pending, nextRuntimeVersion);
  assert.equal(JSON.parse(fs.readFileSync(f.updateFile)).current.hostSha256, entry.hostSha256);
  assert.equal((await core('rollback-runtime')).runtime.pending, null);
  assert.equal(fs.existsSync(f.updateFile), false);

  // Open a new game document after the script rollback, then exercise both operations together.
  boot.sync('sgs-toolbox:source:v1', guest);
  assert.equal((await core('check')).script.newer, true);
  const all = await core('update-all');
  assert.equal(all.script.pending, '0.6.301');
  assert.equal(all.runtime.pending, nextRuntimeVersion);
  assert.deepEqual(asJSON(all.lastUpdate), {
    auto: false, scriptVersion: '0.6.301', runtimeVersion: nextRuntimeVersion, revision: all.revision
  });
  await core('relaunch');
  assert.deepEqual(boot.lifecycle, ['relaunch', 'quit']);
});

test('runtime rollback selects the previous verified cache, then the bundled version', async t => {
  const f = fixture(t);
  const first = cached(nextRuntimeVersion);
  // Cache a distinct version of the actual host, including the updater APIs.
  const second = cached(laterRuntimeVersion, runtimeHost.toString('utf8'), 'void 0;');
  f.save(second, first);
  const boot = f.start();
  const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
  const status = await boot.core(shell, 'core:status');
  assert.equal(status.runtime.version, second.version);
  assert.equal(status.runtime.source, 'updated');
  const guest = { sender: boot.contents(game), frameId: 4 };
  assert.deepEqual(asJSON(boot.sync('sgs-toolbox:preload:v1', guest)), { mode: 'code', source: second.preloadSource });
  assert.equal((await boot.core(shell, 'core:rollback-runtime')).runtime.pending, nextRuntimeVersion);
  assert.equal(JSON.parse(fs.readFileSync(f.updateFile)).current.version, nextRuntimeVersion);
  assert.equal((await boot.core(shell, 'core:rollback-runtime')).runtime.pending, bundledVersion);
  assert.equal(fs.existsSync(f.updateFile), false);
});

test('startup update preference defaults on, validates caller and type, and survives a restart', async t => {
  const f = fixture(t);
  const first = f.start();
  const shell = { sender: first.contents(f.shellURL, 'window'), frameId: 4 };
  const set = enabled => ({ action: 'core:set-auto-update', enabled });
  const status = () => first.core(shell, 'core:status');
  assert.equal((await status()).autoUpdate, true);
  assert.equal((await status()).lastUpdate, null);
  fs.mkdirSync(path.dirname(f.prefsFile), { recursive: true });
  for (const content of ['{', '{"autoUpdate":"false"}', '{"autoUpdate":null}', '{}']) {
    fs.writeFileSync(f.prefsFile, content);
    assert.equal((await status()).autoUpdate, true);
  }
  for (const value of [undefined, null, 'false', 0, {}]) {
    await assert.rejects(first.core(shell, set(value)), /布尔值/);
  }
  const guest = { sender: first.contents(game), frameId: 4 };
  for (const request of [set(false), { action: 'core:startup-sync' }]) {
    assert.throws(() => first.core(guest, request), /仅允许/);
    assert.throws(() => first.core({ ...shell, frameId: 3 }, request), /仅允许/);
  }
  assert.equal((await first.core(shell, set(false))).autoUpdate, false);
  assert.equal(first.events.at(-1).detail.autoUpdate, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.prefsFile, 'utf8')), { autoUpdate: false });
  const restarted = f.start();
  const newShell = { sender: restarted.contents(f.shellURL, 'window'), frameId: 4 };
  assert.equal((await restarted.core(newShell, 'core:status')).autoUpdate, false);
  assert.equal((await restarted.core(newShell, set(true))).autoUpdate, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.prefsFile, 'utf8')), { autoUpdate: true });
  assert.equal(f.requests.length, 0);
});

test('startup sync stages both updates once across repeated shell requests without restarting', async t => {
  const f = fixture(t);
  const boot = f.start();
  const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
  const anotherShell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
  publishScript(f.replies);
  const runtime = cached(nextRuntimeVersion, runtimeHost.toString('utf8'));
  publishRuntime(f.replies, runtime);
  const [state, repeated] = await Promise.all([
    boot.core(shell, 'core:startup-sync'), boot.core(anotherShell, 'core:startup-sync')
  ]);
  assert.equal(state.busy, null);
  assert.equal(state.script.pending, '0.6.301');
  assert.equal(state.runtime.pending, nextRuntimeVersion);
  assert.deepEqual(asJSON(state.lastUpdate), {
    auto: true, scriptVersion: '0.6.301', runtimeVersion: nextRuntimeVersion, revision: state.revision
  });
  assert.deepEqual(asJSON(repeated), asJSON(state));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.updateFile, 'utf8')).current, runtime);
  const requests = f.requests.length;
  assert.equal(f.requests.filter(url => url.endsWith('/toolbox.js')).length, 1);
  assert.equal(f.requests.filter(url => url.endsWith('/runtime-host.cjs')).length, 1);
  assert.deepEqual(asJSON(await boot.core(shell, 'core:startup-sync')), asJSON(state));
  assert.equal(f.requests.length, requests);
  assert.deepEqual(boot.lifecycle, []);
});

test('startup sync still installs the script when runtime metadata is absent or needs a newer bootstrap', async t => {
  for (const bootstrapApi of [null, 2]) {
    await t.test(bootstrapApi ? 'newer bootstrap required' : 'runtime manifest 404', async t => {
      const f = fixture(t);
      const boot = f.start();
      const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
      publishScript(f.replies);
      if (bootstrapApi) publishRuntime(f.replies, { ...cached(nextRuntimeVersion), bootstrapApi });
      const state = await boot.core(shell, 'core:startup-sync');
      assert.equal(state.runtime.check[bootstrapApi ? 'unsupportedBootstrap' : 'unavailable'], true);
      assert.equal(state.runtime.pending, null);
      assert.equal(state.script.pending, '0.6.301');
      assert.deepEqual(asJSON(state.lastUpdate), {
        auto: true, scriptVersion: '0.6.301', runtimeVersion: null, revision: state.revision
      });
      assert(!f.requests.some(url => /runtime-(?:host|preload)\.cjs$/.test(url)));
      assert(!fs.existsSync(f.updateFile));
      assert.deepEqual(boot.lifecycle, []);
    });
  }
});

test('startup sync only checks if disabled before startup or before its checks finish', async t => {
  for (const duringCheck of [false, true]) {
    await t.test(duringCheck ? 'disabled during checks' : 'disabled before checks', async t => {
      const f = fixture(t);
      const boot = f.start();
      const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
      const core = request => boot.core(shell, request);
      const disable = () => core({ action: 'core:set-auto-update', enabled: false });
      publishScript(f.replies);
      publishRuntime(f.replies, cached(nextRuntimeVersion));
      if (!duringCheck) await disable();
      const startup = core('core:startup-sync');
      if (duringCheck) assert.equal((await disable()).busy, 'check');
      const state = await startup;
      assert.equal(state.autoUpdate, false);
      assert.equal(state.script.newer, true);
      assert.equal(state.runtime.newer, true);
      assert.equal(state.script.pending, null);
      assert.equal(state.runtime.pending, null);
      assert.equal(state.lastUpdate, null);
      assert(f.requests.every(url => url.endsWith('update.json')));
      assert.deepEqual(boot.lifecycle, []);
    });
  }
});

test('startup sync keeps errors available for the panel without marking a completed update', async t => {
  const f = fixture(t);
  const boot = f.start();
  const shell = { sender: boot.contents(f.shellURL, 'window'), frameId: 4 };
  const status = await boot.core(shell, 'core:startup-sync');
  assert.match(status.script.error, /404/);
  assert.equal(status.script.errorAuto, true);
  assert.equal(status.runtime.check.unavailable, true);
  assert.equal(status.lastUpdate, null);
  assert.deepEqual(boot.lifecycle, []);
});
