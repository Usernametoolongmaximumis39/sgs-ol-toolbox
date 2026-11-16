import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { compareVersions, findPluginUpdates } from '../src/market/updates.js';
import { createShell } from '../src/ui/shell.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { compilePackage, packageDigest, PACKAGE_FORMAT } from '../src/core/packages.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const entry = (version, id = 'cards') => ({ id, name: '卡牌', version, description: '', packageUrl: `/packages/${id}/${version}.json`, sha256: 'a'.repeat(64) });

test('version precedence uses numeric components and standard prerelease ordering', () => {
  const ordered = ['0.1.9', '0.1.10-alpha', '0.1.10-alpha.2', '0.1.10-alpha.10', '0.1.10-beta', '0.1.10', '0.2.0', '1.0.0'];
  for (let i = 1; i < ordered.length; i++) {
    assert.equal(compareVersions(ordered[i - 1], ordered[i]), -1);
    assert.equal(compareVersions(ordered[i], ordered[i - 1]), 1);
  }
  assert.equal(compareVersions('1.0.0+one', '1.0.0+two'), 0);
  assert.equal(compareVersions('99999999999999999999.0.0', '99999999999999999998.0.0'), 1);
  assert.throws(() => compareVersions('bad', '1.0.0'), /无效/);
});

test('detects latest stable release per installed ID without suggesting demo packages or downgrades', () => {
  const installed = [entry('0.1.9'), entry('2.0.0', 'ahead'), entry('1.0.0', 'same'), entry('1.0.0', 'missing'), entry('1.0.0', 'preview-only')];
  const entries = [entry('0.1.10'), entry('0.1.8'), entry('0.1.11-local'), entry('1.0.0', 'ahead'), entry('1.0.0', 'same'), entry('2.0.0-beta', 'preview-only'), entry('9.0.0', 'uninstalled')];
  const results = findPluginUpdates(installed, entries);
  assert.deepEqual(results.map(result => result.status), ['update', 'newer', 'current', 'unavailable', 'unavailable']);
  assert.equal(results[0].entry.version, '0.1.10');
  assert.equal(findPluginUpdates([entry('1.0.0-rc.1')], [entry('1.0.0')])[0].status, 'update');
  assert.deepEqual(findPluginUpdates([], entries), []);
});

async function makePackage(version, releaseNotes) {
  const manifest = { id: 'cards', name: '卡牌', version, apiVersion: 1, categories: ['game'], ...(releaseNotes === undefined ? {} : { releaseNotes }) };
  const code = `return { manifest: ${JSON.stringify(manifest)}, activate() {} };`;
  return { format: PACKAGE_FORMAT, manifest, code, sha256: await packageDigest(manifest, code) };
}

async function harness(t, releaseNotes) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1/' });
  const scope = new ResourceScope(), settings = new Settings(dom.window.localStorage);
  let manager;
  t.after(() => {
    try { manager?.dispose(); }
    finally { try { scope.dispose(); } finally { dom.window.close(); } }
  });
  const shell = createShell({ window: dom.window, document: dom.window.document, scope, settings });
  const store = { records: new Map(), async list() { return []; }, async put(record) { this.records.set(record.id, record); } };
  manager = new PluginManager({ journal: new SessionJournal(), store, settings, context: { ui: shell }, onChange: shell.render });
  manager.registerBuiltin(compilePackage(await makePackage('0.1.9')));
  await manager.init();
  const pkg = await makePackage('0.1.10', releaseNotes);
  let catalogCalls = 0, packageCalls = 0;
  const client = {
    baseUrl: 'http://127.0.0.1:17321',
    async getCatalog() { catalogCalls++; return { plugins: [entry('0.1.8'), entry('0.1.11-local'), { ...entry(pkg.manifest.version), ...(releaseNotes === undefined ? {} : { releaseNotes }), sha256: pkg.sha256 }] }; },
    async getPackage() { packageCalls++; return pkg; },
  };
  let currentClient = client;
  shell.setHandlers({ manager, market: () => currentClient });
  const click = text => { const button = [...shell.shadow.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(button, `missing button: ${text}`); button.click(); };
  const openMarket = shell.shadow.querySelector('button[data-open-market][aria-label="打开插件市场"]');
  assert.ok(openMarket, 'missing accessible plugin-market entry'); openMarket.click();
  return { shell, manager, store, client, pkg, click, setClient(value) { currentClient = value; shell.render(); }, calls: () => ({ catalogCalls, packageCalls }) };
}

test('latest update notes render as text before update, survive installation and show legacy fallback', async t => {
  const notes = '修复重复请求。\n<img src=x onerror="alert(1)">';
  const h = await harness(t, notes);
  h.click('检测插件更新'); await tick();
  const notice = h.shell.shadow.querySelector('.plugin-update .plugin-release-notes');
  assert.equal(notice.open, true);
  assert.match(notice.querySelector('summary').textContent, /0.1.10/);
  assert.equal(notice.querySelector('.plugin-release-notes-text').textContent, notes);
  assert.equal(notice.querySelector('img'), null);
  assert.ok([...h.shell.shadow.querySelectorAll('[data-catalog-key]')].some(card => card.textContent.includes('作者未提供此版本的更新内容')));
  h.click('更新至 0.1.10'); await tick(); await h.manager.tail; await tick();
  const installed = h.shell.shadow.querySelector('[data-plugin-id="cards"] .plugin-release-notes');
  assert.equal(installed.querySelector('.plugin-release-notes-text').textContent, notes);
  assert.equal(h.manager.list()[0].releaseNotes, notes);
});

test('checking only reads catalog; explicit update retains disabled state and rollback, in the plugin market', async t => {
  const h = await harness(t);
  await h.manager.disable('cards');
  h.click('检测插件更新'); await tick();
  assert.deepEqual(h.calls(), { catalogCalls: 1, packageCalls: 0 });
  assert.match(h.shell.shadow.textContent, /1 个插件可更新/);
  assert.match(h.shell.shadow.textContent, /0.1.9 → 0.1.10/);
  h.click('插件市场');
  assert.match(h.shell.shadow.textContent, /更新至 0.1.10/);
  h.click('更新至 0.1.10'); await tick(); await h.manager.tail; await tick();
  assert.equal(h.manager.list()[0].version, '0.1.10');
  assert.equal(h.manager.list()[0].enabled, false);
  assert.equal(h.manager.list()[0].hasPrevious, true);
  assert.match(h.shell.shadow.textContent, /已是市场最新正式版/);
  assert.doesNotMatch(h.shell.shadow.textContent, /更新至 0.1.11-local/);
  h.click('插件市场');
  assert.equal(h.calls().catalogCalls, 1, 'catalog survives manager onChange and tab switches');
  const catalog = [...h.shell.shadow.querySelectorAll('[data-catalog-key]')];
  assert.equal(catalog.length, 3);
  assert.ok(catalog.every(card => card.textContent.includes('已安装')));
  assert.equal(catalog.filter(card => card.querySelector('button:not([data-help-tip])').disabled).length, 1);
  h.click('回退'); await tick(); await h.manager.tail;
  assert.equal(h.manager.list()[0].version, '0.1.9');
  assert.match(h.shell.shadow.textContent, /发现更新：0.1.9 → 0.1.10/);
});

test('catalog failure clears previous success and allows a retry', async t => {
  const h = await harness(t);
  h.click('检测插件更新'); await tick();
  const original = h.client.getCatalog;
  h.client.getCatalog = async () => { throw new Error('市场已离线'); };
  h.click('检测插件更新'); await tick();
  assert.match(h.shell.shadow.textContent, /检测失败：市场已离线/);
  assert.doesNotMatch(h.shell.shadow.textContent, /发现更新|上次检测/);
  h.client.getCatalog = original;
  h.click('检测插件更新'); await tick();
  assert.match(h.shell.shadow.textContent, /1 个插件可更新/);
});

test('market switch ignores an old in-flight catalog, deduplicates checks, and clears cached results', async t => {
  const h = await harness(t); let release;
  h.client.getCatalog = () => new Promise(resolve => { release = resolve; });
  h.click('检测插件更新'); h.click('插件市场');
  assert.equal([...h.shell.shadow.querySelectorAll('button')].find(b => b.textContent === '正在检测更新…').disabled, true);
  h.setClient({ baseUrl: 'http://127.0.0.1:17322', async getCatalog() { return { plugins: [] }; } });
  h.click('检测插件更新'); await tick();
  release({ plugins: [entry('9.0.0')] }); await tick();
  assert.doesNotMatch(h.shell.shadow.textContent, /9.0.0|发现更新/);
  assert.match(h.shell.shadow.textContent, /市场暂无此插件的正式版/);
});

test('package verification failure leaves installed plugin intact and update remains retryable', async t => {
  const h = await harness(t);
  h.click('检测插件更新'); await tick();
  h.client.getPackage = async () => ({ ...h.pkg, code: h.pkg.code + 'tampered' });
  h.click('更新至 0.1.10'); await tick(); await h.manager.tail.catch(() => {}); await tick();
  assert.equal(h.manager.list()[0].version, '0.1.9');
  assert.equal(h.manager.list()[0].active, true);
  assert.match(h.shell.shadow.querySelector('.toast').textContent, /校验失败/);
  assert.ok([...h.shell.shadow.querySelectorAll('button')].find(b => b.textContent === '更新至 0.1.10' && !b.disabled));
});

test('uninstall or market switch during a package download prevents installing a stale update', async t => {
  const h = await harness(t); let release;
  h.click('检测插件更新'); await tick();
  h.client.getPackage = () => new Promise(resolve => { release = resolve; });
  h.click('更新至 0.1.10');
  await h.manager.uninstall('cards'); release(h.pkg); await tick();
  assert.equal(h.manager.list().length, 0);
  assert.match(h.shell.shadow.querySelector('.toast').textContent, /安装状态已改变/);
  await h.manager.restoreBuiltin('cards');
  h.click('更新至 0.1.10');
  h.setClient({ baseUrl: 'http://127.0.0.1:17322' }); release(h.pkg); await tick();
  assert.equal(h.manager.list()[0].version, '0.1.9');
  assert.match(h.shell.shadow.querySelector('.toast').textContent, /市场地址已改变/);
});


test('offline selection disables reads and discards an old in-flight catalog', async t => {
  const h = await harness(t);
  let resolveCatalog;
  h.client.getCatalog = () => new Promise(resolve => { resolveCatalog = resolve; });
  h.click('检测插件更新'); await tick();
  h.setClient(null);
  resolveCatalog({ plugins: [entry('0.1.10')] }); await tick();
  assert.match(h.shell.shadow.textContent, /市场连接已关闭/);
  assert.doesNotMatch(h.shell.shadow.textContent, /上次检测|发现更新/);
  const buttons = [...h.shell.shadow.querySelectorAll('button')];
  assert.equal(buttons.find(b => b.textContent === '检测插件更新').disabled, true);
  assert.equal(buttons.find(b => b.textContent === '连接 / 刷新市场').disabled, true);
  assert.equal(buttons.find(b => b.textContent === '导入插件包').disabled, false);
});


test('dependency confirmation installs prerequisites in order; cancellation does not download', async t => {
  const h = await harness(t);
  const dep = { id: 'base', name: '前置', version: '1.0.0' };
  const target = { id: 'addon', name: '扩展', version: '1.0.0', dependencies: ['base'] };
  h.client.getCatalog = async () => ({ plugins: [dep, target] });
  const calls = [];
  h.client.getPackage = async item => { calls.push(item.id); return item; };
  const installed = [];
  h.manager.list = () => installed;
  h.manager.install = async item => { installed.push({ ...item, active: true, enabled: true }); h.shell.render(); };
  h.click('检测插件更新'); await tick();
  const card = () => [...h.shell.shadow.querySelectorAll('[data-catalog-key]')].find(card => card.dataset.catalogKey.includes('addon'));
  card().querySelector('button:not([data-help-tip])').click(); await tick();
  assert.deepEqual(calls, []);
  assert.match(card().textContent, /需要先安装并启用：前置 1.0.0/);
  h.click('取消'); await tick(); assert.deepEqual(calls, []);
  card().querySelector('button:not([data-help-tip])').click(); await tick();
  h.click('安装前置并继续'); await tick(); await tick();
  assert.deepEqual(calls, ['base', 'addon']);
  assert.match(card().textContent, /已安装此版本/);
});


test('failed prerequisite stops target download and keeps the error on its card', async t => {
  const h = await harness(t);
  const dep = { id: 'base', name: '前置', version: '1.0.0' };
  const target = { id: 'addon', name: '扩展', version: '1.0.0', dependencies: ['base'] };
  h.client.getCatalog = async () => ({ plugins: [dep, target] });
  const calls = [];
  h.client.getPackage = async item => { calls.push(item.id); throw new Error('前置下载失败'); };
  h.click('检测插件更新'); await tick();
  const card = () => [...h.shell.shadow.querySelectorAll('[data-catalog-key]')].find(card => card.dataset.catalogKey.includes('addon'));
  card().querySelector('button:not([data-help-tip])').click(); await tick(); h.click('安装前置并继续'); await tick(); await tick();
  assert.deepEqual(calls, ['base']);
  assert.match(card().textContent, /前置下载失败/);
  assert.equal(card().querySelector('button:not([data-help-tip])').disabled, false);
});
