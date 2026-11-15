import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { Settings } from '../src/core/storage.js';
import { packageDigest, compilePackage } from '../src/core/packages.js';

async function packet(version = '1.0.0') {
  const manifest = { id: 'example', name: '示例', version, apiVersion: 1, categories: [] };
  const code = `return { manifest: ${JSON.stringify(manifest)}, activate(ctx) { ctx.settings.set('starts', ctx.settings.get('starts', 0) + 1); } };`;
  return { format: 'sgs-toolbox-plugin-v1', manifest, code, sha256: await packageDigest(manifest, code) };
}
function fixtures(rows = []) {
  const records = new Map(rows.map(row => [row.id, structuredClone(row)])), data = new Map();
  const settings = new Settings({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  const store = { async list() { return [...records.values()].map(row => structuredClone(row)); }, async put(row) { records.set(row.id, structuredClone(row)); } };
  const create = () => new PluginManager({ journal: new SessionJournal(), store, settings, context: { ui: {}, themes: {} } });
  return { records, settings, store, create };
}

test('full persists its bundled plugins and lite starts the same installation without a builtin', async () => {
  const f = fixtures(), pkg = await packet(), full = f.create();
  await full.registerBundled(pkg); await full.init();
  assert.equal(f.records.get('example').active.sha256, pkg.sha256);
  full.dispose();
  const lite = f.create(); await lite.init();
  assert.equal(lite.builtins.size, 0); assert.equal(lite.list()[0].active, true);
  assert.equal(lite.list()[0].version, '1.0.0');
  assert.equal(f.settings.namespace('example').get('starts'), 2);
  lite.dispose();
});

test('full to lite retains disabled state, custom package, rollback and uninstall tombstone', async () => {
  const bundled = await packet(), custom = await packet('2.0.0');
  for (const row of [
    { id: 'example', enabled: false, active: null, previous: null },
    { id: 'example', enabled: true, active: custom, previous: { builtin: true } },
    { id: 'example', enabled: false, uninstalled: true, active: null, previous: null },
  ]) {
    const f = fixtures([row]), full = f.create(); await full.registerBundled(bundled); await full.init(); full.dispose();
    const lite = f.create(); await lite.init();
    if (row.uninstalled) { assert.equal(lite.list().length, 0); assert.deepEqual(f.records.get('example'), row); }
    else if (!row.enabled) { assert.equal(lite.list()[0].enabled, false); assert.equal(lite.list()[0].active, false); }
    else {
      assert.equal(lite.list()[0].version, '2.0.0'); assert.equal(f.records.get('example').active.sha256, custom.sha256);
      await lite.rollback('example'); assert.equal(lite.list()[0].version, '1.0.0');
    }
    lite.dispose();
  }
});

test('restoring a full builtin remains portable after restarting lite', async () => {
  const f = fixtures(), pkg = await packet(), full = f.create();
  await full.registerBundled(pkg); await full.init();
  await full.uninstall('example'); await full.restoreBuiltin('example'); full.dispose();
  assert.equal(f.records.get('example').active.sha256, pkg.sha256);
  const lite = f.create(); await lite.init(); assert.equal(lite.list()[0].active, true); lite.dispose();
});

test('fresh lite has no installed plugins and bundled persistence failures remain visible', async () => {
  const f = fixtures(), lite = f.create(); await lite.init(); assert.deepEqual(lite.list(), []); lite.dispose();
  const pkg = await packet(), full = f.create(); f.store.put = async () => { throw new Error('disk full'); };
  await full.registerBundled(pkg); await full.init();
  assert.match(full.errors.join('\n'), /独立保存失败[\s\S]*disk full/);
  assert.equal(full.list()[0].active, true); full.dispose();
  const invalid = f.create(); await assert.rejects(invalid.registerBundled({ ...pkg, code: 'tampered' }), /校验失败/); invalid.dispose();
});

test('legacy builtin records still behave normally for non-bundled manager users', async () => {
  const f = fixtures(), manager = f.create(); manager.registerBuiltin(compilePackage(await packet()));
  await manager.init(); assert.equal(f.records.size, 0); manager.dispose();
});
