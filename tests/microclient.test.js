import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { bundleCore } from '../tools/distribution-build.mjs';
import { buildMicroclient } from '../tools/build-microclient.mjs';
import { installMicroAPIs, legacyMicroCSS } from '../src/core/micro-compatibility.js';

const root = resolve(import.meta.dirname, '..'), sha = data => createHash('sha256').update(data).digest('hex');
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
    if (id === 'electron') return { app: { on() {} }, ipcMain: { handle() {}, on: (name, fn) => handlers[name] = fn } };
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
test('Windows installer blocks residual/modified scripts, requires cleanup and supports transactional full/lite/restore', { skip: process.platform !== 'win32', timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sgs-micro-install-')), resources = join(directory, 'SGSOL/resources'), pkg = join(directory, 'package');
  const archive = asar({ 'main.js': 'OFFICIAL_MAIN', 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD' });
  try {
    await mkdir(resources, { recursive: true }); await mkdir(join(pkg, 'payload'), { recursive: true });
    await writeFile(join(directory, 'SGSOL/SGSOL.exe'), 'test fixture only'); await writeFile(join(resources, 'app.asar'), archive);
    await writeFile(join(directory, 'user-data-sentinel'), 'plugins/settings/disabled/rollback remain');
    await writeFile(join(pkg, 'installer.ps1'), '\ufeff' + await readFile(join(root, 'microclient/installer.ps1'), 'utf8'));
    await writeFile(join(pkg, 'official-windows.json'), JSON.stringify({ sha256: sha(archive), resources: [], files: Object.entries({ 'main.js': 'OFFICIAL_MAIN', 'package.json': '{"name":"SGSOL","version":"1.1.6"}', 'script/electron_renderer.js': 'OFFICIAL_PRELOAD' }).map(([path, data]) => ({path,sha256:sha(data)})) }));
    const payload = [];
    for (const name of ['host.cjs', 'preload.cjs']) { const data = await readFile(join(root, 'microclient', name)); await writeFile(join(pkg, 'payload', name), data); payload.push({ path: name, sha256: sha(data) }); }
    await writeFile(join(pkg, 'payload/toolbox.js'), 'void 0;'); payload.push({ path: 'toolbox.js', sha256: sha('void 0;') });
    await writeFile(join(pkg, 'approved-payloads.json'), JSON.stringify([{ toolboxSha256: sha('void 0;'), hostSha256: payload.find(f=>f.path==='host.cjs').sha256, preloadSha256: payload.find(f=>f.path==='preload.cjs').sha256 }]));
    const manifest = edition => writeFile(join(pkg, 'payload.json'), JSON.stringify({ format: 'sgs-toolbox-microclient-v1', edition, version: '1.0.0', files: payload }));
    await manifest('full');
    const run = (action, input = '') => spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pkg, 'installer.ps1'), '-Resources', resources, '-Action', action], { input, encoding: 'utf8', timeout: 45000, windowsHide: true });
    const pass = (action, input) => { const result = run(action, input); assert.equal(result.status, 0, result.stdout + result.stderr); return result; };
    const fail = (action, input) => { const result = run(action, input); assert.equal(result.status, 1, result.stdout + result.stderr); return result; };
    pass('Audit'); pass('Uninstall'); pass('Manage', '0\n'); fail('Manage', 'invalid\n'); fail('Install', 'NO\n'); assert.equal(sha(await readFile(join(resources, 'app.asar'))), sha(archive));
    for (const name of ['app/main.js', 'xc-ext/xc-ext.js', 'nested/unknown.js', 'app.asar.bak', 'app.zip']) {
      const file = join(resources, name); await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, 'unknown'); fail('Install', 'CLEAN\n');
      await rm(name.includes('/') ? resolve(file, '..') : file, { recursive: true, force: true });
    }
    pass('Install', 'CLEAN\n');
    assert.equal(JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8')).edition, 'full');
    assert.match(await readFile(join(resources, 'app/main.js'), 'utf8'), /host\.cjs/);
    assert.equal(sha(await readFile(join(resources, 'sgs-toolbox-official.asar'))), sha(archive));
    pass('Audit');
    const savedState = await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8'), forged = JSON.parse(savedState);
    await writeFile(join(resources, 'app/forged-script.js'), 'unknown'); forged.files.push({path:'forged-script.js',sha256:sha('unknown')});
    await writeFile(join(resources, 'app/sgs-toolbox-install.json'), JSON.stringify(forged)); fail('Install', 'CLEAN\n');
    await rm(join(resources, 'app/forged-script.js')); await writeFile(join(resources, 'app/sgs-toolbox-install.json'), savedState);
    await writeFile(join(resources, 'app/unknown.js'), 'unknown'); fail('Install', 'CLEAN\n'); fail('Restore'); fail('Uninstall'); await rm(join(resources, 'app/unknown.js'));
    const main = await readFile(join(resources, 'app/main.js')); await writeFile(join(resources, 'app/main.js'), 'tampered'); fail('Install', 'CLEAN\n'); await writeFile(join(resources, 'app/main.js'), main);
    await manifest('lite'); pass('Install', 'CLEAN\n');
    assert.equal(JSON.parse(await readFile(join(resources, 'app/sgs-toolbox-install.json'), 'utf8')).edition, 'lite');
    assert.equal(await readFile(join(directory, 'user-data-sentinel'), 'utf8'), 'plugins/settings/disabled/rollback remain');
    await writeFile(join(pkg, 'payload/toolbox.js'), 'tampered payload'); fail('Install', 'CLEAN\n'); await writeFile(join(pkg, 'payload/toolbox.js'), 'void 0;');
    pass('Manage', '2\n'); pass('Uninstall'); assert.equal(sha(await readFile(join(resources, 'app.asar'))), sha(archive)); assert(!((await readdir(resources)).includes('app')));
    await writeFile(join(resources, 'app.asar'), 'modified official'); fail('Install', 'CLEAN\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

