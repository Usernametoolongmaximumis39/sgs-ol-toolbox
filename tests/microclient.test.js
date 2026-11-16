import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { bundleCore } from '../tools/distribution-build.mjs';
import { buildMicroclient } from '../tools/build-microclient.mjs';
import { installMicroAPIs, legacyMicroCSS } from '../src/core/micro-compatibility.js';

const root = resolve(import.meta.dirname, '..'), sha = data => createHash('sha256').update(data).digest('hex');
const OFFICIAL_MAIN_TEXT = 'const package = require("./package.json");\r\nglobal.PackageId = package.packageId;\r\n';
const SHELL_HTML = '<!doctype html>\r\n<html><head><meta charset="utf-8"></head><body><div id="eBottomDiv"></div></body></html>\r\n';
const FRAME_TEXT = 'const { ipcRenderer, remote } = require("electron");\r\n';
test('BAT launchers execute complete UTF-8 lines and preserve installer failure', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sgs bat launcher '));
  try {
    await writeFile(join(directory, 'installer.ps1'), 'param([string]$Action)\nWrite-Output "REACHED:$Action"\nWrite-Output $env:SGS_TOOLBOX_RESOURCES\nexit 23\n');
    for (const [name, action] of [['install.bat', 'Manage'], ['uninstall.bat', 'Uninstall'], ['restore.bat', 'Restore']]) {
      const source = await readFile(join(root, 'microclient', name));
      assert(!/(?<!\r)\n/.test(source.toString()), 'CMD launchers require CRLF even before packaging');
      await writeFile(join(directory, name), source);
      const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `""${join(directory, name)}" "C:\\fixture resources""`], { input: '\n', encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 15000 });
      assert.equal(result.status, 23, result.stdout + result.stderr);
      assert.equal(result.stderr, '');
      assert(result.stdout.includes(`REACHED:${action}`));
      assert(result.stdout.includes('C:\\fixture resources'));
      if (action === 'Manage') assert(result.stdout.includes('Residual scripts block installation.'));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('microclient excludes dev, browser compatibility implementation and lite plugin implementations', async () => {
  await assert.rejects(bundleCore({ root, edition: 'dev', packages: [], microclient: true }), /full\/lite/);
  await assert.rejects(buildMicroclient({ editions: ['dev'] }), /full\/lite/);
  const { code, inputs } = await bundleCore({ root, edition: 'lite', packages: [], microclient: true });
  assert(!inputs.some(p => p.includes('src/plugins/') || p.endsWith('compat/profiles.js')));
  assert(!code.includes('sgstoolbox:refresh-reentry:v1'));
  assert(!code.includes('userscriptDashboardAddress'));
  assert(code.includes('__SGS_TOOLBOX_SCRIPT_UPDATE__'));
  assert(!code.includes('sgs-toolbox-microclient-lite.zip'));
});
test('old Chromium receives the APIs used by unchanged market packages', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' }), w = dom.window;
  delete w.Object.hasOwn; delete w.Array.prototype.at;
  installMicroAPIs(w);
  assert.equal(w.Object.hasOwn({ x: 1 }, 'x'), true);
  assert.equal(w.Array.prototype.at.call([3, 5], -1), 5);
  assert.equal(w.Array.prototype.at.call([3], -2), undefined);
  const original = w.eval('({a:[1], d:new Date(2), m:new Map([[1,{n:2}]])})'); original.self = original;
  const clone = w.structuredClone(original);
  assert.notEqual(clone, original); assert.equal(clone.self, clone); assert.equal(clone.m.get(1).n, 2);
  const tip = w.document.createElement('span'); tip.showPopover(); assert(tip.matches(':popover-open')); tip.hidePopover(); assert(!tip.matches(':popover-open'));
  dom.window.close();
});
test('old Chromium color mixing preserves weights, transparency, focus and inset', () => {
  const css = legacyMicroCSS('a:focus-visible{color:color-mix(in srgb,var(--sgs-accent,#fff) 25%,transparent);inset:0 2px;overflow:clip}', () => '#fff', s => s === 'transparent' ? [0,0,0,0] : [255,255,255,255]);
  assert.match(css, /rgba\(255,255,255,0.25\)/); assert.match(css, /a:focus\{/); assert.match(css, /top:0;right:2px;bottom:0;left:2px/); assert.match(css, /overflow:hidden/);
});
test('microclient preload and source IPC accept only top-level official OL game pages', async () => {
  const handlers = {}, host = await readFile(join(root, 'microclient/host.cjs'), 'utf8'), preload = await readFile(join(root, 'microclient/preload.cjs'), 'utf8');
  vm.runInNewContext(host, { URL, __dirname: '/payload', require(id) {
    if (id === 'electron') return { app: { once() {}, on() {} }, ipcMain: { handle() {}, on: (name, fn) => handlers[name] = fn } };
    if (id === 'fs') return { readFileSync: () => 'TOOLBOX' }; if (id === 'path') return { join: (...parts) => parts.join('/') }; if (['crypto', 'https'].includes(id)) return {}; throw Error(id);
  } });
  for (const [url, frameId, expected] of [['https://web.sanguosha.com/220/h5_2/index_110074.php', 0, 'TOOLBOX'], ['https://web.sanguosha.com/login/index.html', 0, ''], ['https://evil.example/220/h5_2/index.php', 0, ''], ['https://web.sanguosha.com/220/h5_2/index.php', 2, '']]) {
    const event = { sender: { getURL: () => url }, senderFrame: { url, parent: frameId ? {} : null }, frameId }; handlers['sgs-toolbox:source:v1'](event); assert.equal(event.returnValue, expected);
    const calls = [], window = { location: { href: url } }; window.top = window.self = window;
    if (frameId) window.top = {};
    vm.runInNewContext(preload, { window, console, require: () => ({ ipcRenderer: { sendSync: () => 'TOOLBOX' }, webFrame: { executeJavaScript: async code => { calls.push(code); } } }) });
    assert.equal(calls.length, expected ? 1 : 0);
  }
});

test('microclient channel config selects only declared channels and persists shell changes', async () => {
  const handlers = {}, module = { exports: {} }, userData = await mkdtemp(join(tmpdir(), 'sgs-channel-')), files = new Map();
  const host = await readFile(join(root, 'microclient/host.cjs'), 'utf8');
  const fsMock = {
    readFileSync(file) {
      if (file.endsWith('toolbox.js')) return 'TOOLBOX';
      if (file.endsWith('sgs-toolbox-channel.json')) { if (!files.has(file)) { const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error; } return files.get(file); }
      if (file.endsWith('package.json')) return JSON.stringify({ packageId: 3, LoginURL: ['https://web.sanguosha.com/login/air/client/h5/index', 'https://web.sanguosha.com/login/air/client/h5/index', 'https://my.4399.com/yxsgs/wd-home'] });
      throw new Error('unexpected read: ' + file);
    },
    mkdirSync() {}, writeFileSync(file, data) { files.set(file, data); },
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); }, unlinkSync() {}
  };
  vm.runInNewContext(host, (() => {
    const sandbox = {
      URL, Buffer, console, __dirname: '/payload', module, exports: module.exports,
      require(id) {
        if (id === 'electron') return { app: { once() {}, on() {}, getPath: () => userData }, ipcMain: { handle(name, fn) { handlers[name] = fn; }, on() {} } };
        if (id === 'fs') return fsMock;
        if (id === 'path') return { join, dirname };
        return {};
      }
    };
    sandbox.global = sandbox;
    return sandbox;
  })());
  const config = join(userData, 'sgs-toolbox-channel.json');
  assert.equal(module.exports.channelPackageId(3), 3);
  files.set(config, JSON.stringify({ packageId: 1 }));
  assert.equal(module.exports.channelPackageId(3), 1);
  files.set(config, JSON.stringify({ packageId: 9 }));
  assert.equal(module.exports.channelPackageId(3), 3);
  files.set(config, JSON.stringify({ packageId: 3 }));
  const shellEvent = { senderFrame: { url: 'file:///C:/SGSOL/resources/app/index_wd.html' } };
  const get = handlers['sgs-toolbox:channel-shell:v1'](shellEvent, { action: 'get' });
  assert.equal(get.selected, 3);
  assert.equal(get.channels.map(channel => channel.id).join(','), '1,3');
  const set = handlers['sgs-toolbox:channel-shell:v1'](shellEvent, { action: 'set', packageId: 1 });
  assert.equal(set.selected, 1);
  assert.equal(JSON.parse(files.get(config)).packageId, 1);
  assert.throws(() => handlers['sgs-toolbox:channel-shell:v1'](shellEvent, { action: 'set', packageId: 9 }), /不包含/);
  assert.throws(() => handlers['sgs-toolbox:channel-shell:v1']({ senderFrame: { url: 'file:///C:/evil/index.html' } }, { action: 'get' }), /仅允许/);
});

test('channel switch utility writes and removes the override config', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sgs-channel-tool-')), config = join(directory, 'sgs-toolbox-channel.json'), script = join(root, 'microclient/switch-channel.ps1');
  const run = (...args) => spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ConfigPath', config, ...args], { input: '', encoding: 'utf8', timeout: 30000, windowsHide: true });
  try {
    let result = run('-PackageId', '1');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(await readFile(config, 'utf8')).packageId, 1);
    result = run('-PackageId', '3');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(await readFile(config, 'utf8')).packageId, 3);
    assert.match(run('-Status').stdout, /4399/);
    result = run('-Default');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(config), false);
    assert.notEqual(run('-PackageId', '9').status, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function asar(files) {
  const header = { files: {} }; let offset = 0; const blobs = [];
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/'); let node = header;
    for (const key of parts.slice(0, -1)) node = node.files[key] ??= { files: {} };
    const data = Buffer.from(text); node.files[parts.at(-1)] = { size: data.length, offset: String(offset) }; offset += data.length; blobs.push(data);
  }
  const json = Buffer.from(JSON.stringify(header)), padded = Math.ceil((json.length + 4) / 4) * 4;
  const prefix = Buffer.alloc(16); prefix.writeUInt32LE(4); prefix.writeUInt32LE(padded + 4, 4); prefix.writeUInt32LE(padded, 8); prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, Buffer.alloc(padded - 4 - json.length), ...blobs]);
}
test('Windows installer blocks residual/modified scripts and supports transactional full/lite/restore', { skip: process.platform !== 'win32', timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sgs-micro-install-')), resources = join(directory, 'SGSOL/resources'), pkg = join(directory, 'package');
  const archive = asar({ 'main.js': OFFICIAL_MAIN_TEXT, 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD', 'script/electron_frame.js': FRAME_TEXT, 'index_wd.html': SHELL_HTML });
  try {
    await mkdir(resources, { recursive: true }); await mkdir(join(pkg, 'payload'), { recursive: true });
    await writeFile(join(directory, 'SGSOL/SGSOL.exe'), 'test fixture only'); await writeFile(join(resources, 'app.asar'), archive);
    await writeFile(join(directory, 'user-data-sentinel'), 'plugins/settings/disabled/rollback remain');
    await writeFile(join(pkg, 'installer.ps1'), '\ufeff' + await readFile(join(root, 'microclient/installer.ps1'), 'utf8'));
    for (const name of ['switch-channel.bat', 'switch-channel.ps1']) await cp(join(root, 'microclient', name), join(pkg, name));
    await writeFile(join(pkg, 'official-windows.json'), JSON.stringify({ format: 'sgs-toolbox-official-windows-v2', variants: [
      { channel: 'official', version: '1.1.6', platform: 'win32', sha256: sha(archive), resources: [], files: Object.entries({ 'main.js': OFFICIAL_MAIN_TEXT, 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD', 'script/electron_frame.js': FRAME_TEXT, 'index_wd.html': SHELL_HTML }).map(([path, data]) => ({path,sha256:sha(data)})) },
      { channel: 'other', version: '0.0.0', platform: 'win32', sha256: 'a'.repeat(64), resources: [], files: [] }
    ] }));
    const payload = [];
    for (const name of ['host.cjs', 'preload.cjs']) { const data = await readFile(join(root, 'microclient', name)); await writeFile(join(pkg, 'payload', name), data); payload.push({ path: name, sha256: sha(data) }); }
    await writeFile(join(pkg, 'payload/toolbox.js'), 'void 0;'); payload.push({ path: 'toolbox.js', sha256: sha('void 0;') });
    await writeFile(join(pkg, 'approved-payloads.json'), JSON.stringify([{ toolboxSha256: sha('void 0;'), hostSha256: payload.find(f=>f.path==='host.cjs').sha256, preloadSha256: payload.find(f=>f.path==='preload.cjs').sha256 }]));
    const manifest = edition => writeFile(join(pkg, 'payload.json'), JSON.stringify({ format: 'sgs-toolbox-microclient-v1', edition, version: '1.0.0', files: payload }));
    await manifest('full');
    const run = (action, input = '') => spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pkg, 'installer.ps1'), '-Resources', resources, '-Action', action], { input, encoding: 'utf8', timeout: 45000, windowsHide: true });
    // Windows PowerShell restores ProgramFiles at startup. Apply the fixture's
    // default-directory isolation inside that process before invoking the installer.
    await writeFile(join(pkg, 'isolated-installer.ps1'), "$env:ProgramFiles = $env:SGS_TEST_NO_DEFAULT\n${env:ProgramFiles(x86)} = $env:SGS_TEST_NO_DEFAULT\n$env:LOCALAPPDATA = $env:SGS_TEST_NO_DEFAULT\n& (Join-Path $PSScriptRoot 'installer.ps1') @args\nexit $LASTEXITCODE\n");
    const spawnInstall = (args, options = {}) => spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pkg, options.env ? 'isolated-installer.ps1' : 'installer.ps1'), ...args], { input: '', encoding: 'utf8', timeout: 45000, windowsHide: true, ...options });
    const pass = (action, input) => { const result = run(action, input); assert.equal(result.status, 0, result.stdout + result.stderr); return result; };
    const fail = (action, input) => { const result = run(action, input); assert.equal(result.status, 1, result.stdout + result.stderr); return result; };
    pass('Audit'); pass('Uninstall'); pass('Manage', '0\n'); fail('Manage', 'invalid\n');
    for (const name of ['app/main.js', 'xc-ext/xc-ext.js', 'nested/unknown.js', 'app.asar.bak', 'app.zip']) {
      const file = join(resources, name); await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, 'unknown'); fail('Install', '\n');
      await rm(name.includes('/') ? resolve(file, '..') : file, { recursive: true, force: true });
    }
    pass('Install', '');
    assert.equal(JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8')).edition, 'full');
    assert.match(await readFile(join(resources, 'app/main.js'), 'utf8'), /host\.cjs/);
    assert.match(await readFile(join(resources, 'app/main.js'), 'utf8'), /channelPackageId\(global\.PackageId\)/);
    assert.match(await readFile(join(resources, 'app/index_wd.html'), 'utf8'), /__SGS_TOOLBOX_CHANNEL__/);
    assert.match(await readFile(join(resources, 'app/script/electron_frame.js'), 'utf8'), /__SGS_TOOLBOX_CHANNEL__/);
    assert.equal(existsSync(join(directory, 'SGSOL/switch-channel.bat')), true);
    assert.equal(existsSync(join(directory, 'SGSOL/switch-channel.ps1')), true);
    assert.equal(sha(await readFile(join(resources, 'sgs-toolbox-official.asar'))), sha(archive));
    pass('Audit');
    const noDefault = join(directory, 'no-default'), isolate = { ...process.env, SGS_TEST_NO_DEFAULT: noDefault, ProgramFiles: noDefault, 'ProgramFiles(x86)': noDefault, LOCALAPPDATA: noDefault, SGS_TOOLBOX_RESOURCES: '' };
    const rootAudit = spawnInstall(['-Resources', join(directory, 'SGSOL'), '-Action', 'Audit']);
    assert.equal(rootAudit.status, 0, rootAudit.stdout + rootAudit.stderr);
    const cwdAudit = spawnInstall(['-Action', 'Audit'], { cwd: resources, env: isolate });
    assert.equal(cwdAudit.status, 0, cwdAudit.stdout + cwdAudit.stderr);
    await mkdir(join(directory, 'prompt-cwd'));
    const promptAudit = spawnInstall(['-Action', 'Audit'], { cwd: join(directory, 'prompt-cwd'), env: isolate, input: 'not-a-client\n' + join(directory, 'SGSOL') + '\n' });
    assert.equal(promptAudit.status, 0, promptAudit.stdout + promptAudit.stderr);
    const savedState = await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8'), forged = JSON.parse(savedState);
    await writeFile(join(resources, 'app/forged-script.js'), 'unknown'); forged.files.push({path:'forged-script.js',sha256:sha('unknown')});
    await writeFile(join(resources, 'app/sgs-toolbox-install.json'), JSON.stringify(forged)); fail('Install', '\n');
    await rm(join(resources, 'app/forged-script.js')); await writeFile(join(resources, 'app/sgs-toolbox-install.json'), savedState);
    await writeFile(join(resources, 'app/unknown.js'), 'unknown'); fail('Install', '\n'); fail('Restore'); fail('Uninstall'); await rm(join(resources, 'app/unknown.js'));
    const main = await readFile(join(resources, 'app/main.js')); await writeFile(join(resources, 'app/main.js'), 'tampered'); fail('Install', '\n'); await writeFile(join(resources, 'app/main.js'), main);
    await manifest('lite'); pass('Install');
    assert.equal(JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8')).edition, 'lite');
    assert.equal(await readFile(join(directory, 'user-data-sentinel'), 'utf8'), 'plugins/settings/disabled/rollback remain');
    await writeFile(join(pkg, 'payload/toolbox.js'), 'tampered payload'); fail('Install', '\n'); await writeFile(join(pkg, 'payload/toolbox.js'), 'void 0;');
    pass('Manage', '2\n'); pass('Uninstall'); assert.equal(sha(await readFile(join(resources, 'app.asar'))), sha(archive)); assert(!((await readdir(resources)).includes('app')));
    await writeFile(join(resources, 'app.asar'), 'modified official'); fail('Install', '\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('installer offers a y-confirmed force path when verification fails and keeps the verified flow', { skip: process.platform !== 'win32', timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sgs-micro-force-')), resources = join(directory, 'SGSOL/resources'), pkg = join(directory, 'package');
  const archive = asar({ 'main.js': OFFICIAL_MAIN_TEXT, 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD', 'script/electron_frame.js': FRAME_TEXT, 'index_wd.html': SHELL_HTML });
  const files = Object.entries({ 'main.js': OFFICIAL_MAIN_TEXT, 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD', 'script/electron_frame.js': FRAME_TEXT, 'index_wd.html': SHELL_HTML }).map(([path, data]) => ({ path, sha256: sha(data) }));
  const payload = [];
  try {
    await mkdir(resources, { recursive: true }); await mkdir(join(pkg, 'payload'), { recursive: true }); await mkdir(join(resources, 'xc-ext'), { recursive: true });
    await writeFile(join(directory, 'SGSOL/SGSOL.exe'), 'test fixture only'); await writeFile(join(resources, 'app.asar'), archive);
    await writeFile(join(resources, 'xc-ext/xc-ext.js'), 'residual old script');
    await writeFile(join(pkg, 'installer.ps1'), '\ufeff' + (await readFile(join(root, 'microclient/installer.ps1'), 'utf8')).replace(/^\ufeff/, ''));
    await writeFile(join(pkg, 'official-windows.json'), JSON.stringify({ format: 'sgs-toolbox-official-windows-v2', variants: [{ channel: 'official', version: '1.1.6', platform: 'win32', sha256: '0'.repeat(64), resources: [], files }] }));
    for (const name of ['host.cjs', 'preload.cjs']) { const data = await readFile(join(root, 'microclient', name)); await writeFile(join(pkg, 'payload', name), data); payload.push({ path: name, sha256: sha(data) }); }
    await writeFile(join(pkg, 'payload/toolbox.js'), 'void 0;'); payload.push({ path: 'toolbox.js', sha256: sha('void 0;') });
    await writeFile(join(pkg, 'approved-payloads.json'), JSON.stringify([{ toolboxSha256: sha('void 0;'), hostSha256: payload.find(f => f.path === 'host.cjs').sha256, preloadSha256: payload.find(f => f.path === 'preload.cjs').sha256 }]));
    const writeManifest = (bogus) => writeFile(join(pkg, 'payload.json'), JSON.stringify({ format: 'sgs-toolbox-microclient-v1', edition: 'lite', version: '0.0.0-test', files: bogus ? [{ path: 'toolbox.js', sha256: 'f'.repeat(64) }] : payload }));
    await writeManifest(true);
    const run = (input, action = 'Install') => spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pkg, 'installer.ps1'), '-Resources', resources, '-Action', action], { input, encoding: 'utf8', timeout: 60000, windowsHide: true });
    const pass = (input, action = 'Install') => { const result = run(input, action); assert.equal(result.status, 0, result.stdout + result.stderr); return result; };
    const fail = (input, action = 'Install') => { const result = run(input, action); assert.equal(result.status, 1, result.stdout + result.stderr); return result; };

    // Bogus official/payload hashes and a residual script fail verification; the prompt hides the specific mismatch and without y nothing changes.
    const cancelled = fail('\n');
    assert(!cancelled.stdout.includes('SHA-256'));
    assert.equal(sha(await readFile(join(resources, 'app.asar'))), sha(archive)); assert(!(await readdir(resources)).includes('app'));
    // y accepts the risk and installs through the forced path without any further confirmation.
    const forced = pass('y\n');
    assert(!forced.stdout.includes('CLEAN'));
    assert.equal(JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8')).forced, true);
    assert.match(await readFile(join(resources, 'app/main.js'), 'utf8'), /host\.cjs/);
    assert.match(await readFile(join(resources, 'app/main.js'), 'utf8'), /channelPackageId\(global\.PackageId\)/);
    assert.equal(await readFile(join(resources, 'xc-ext/xc-ext.js'), 'utf8'), 'residual old script');
    assert.equal(sha(await readFile(join(resources, 'sgs-toolbox-official.asar'))), sha(archive));

    // Once verification passes again, installation proceeds without any confirmation input and drops the forced marker.
    await rm(join(resources, 'xc-ext'), { recursive: true, force: true });
    await writeFile(join(pkg, 'official-windows.json'), JSON.stringify({ format: 'sgs-toolbox-official-windows-v2', variants: [
      { channel: 'other', version: '0.0.0', platform: 'win32', sha256: 'b'.repeat(64), resources: [], files: [] },
      { channel: 'official', version: '1.1.6', platform: 'win32', sha256: sha(archive), resources: [], files }
    ] }));
    await writeManifest(false);
    pass('');
    assert(!('forced' in JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8'))));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

