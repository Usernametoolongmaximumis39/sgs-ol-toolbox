import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../src/core/plugins.js';
import { PACKAGE_FORMAT, packageDigest } from '../src/core/packages.js';
import { SessionJournal } from '../src/core/session.js';

const manifest = (id, version = '1.0.0', dependencies = []) => ({
  id, name: id, version, dependencies, apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.62', categories: [], description: '依赖更新生命周期演练', icon: 'package', priority: 32768,
});
const moduleFor = (id, dependencies = []) => ({
  manifest: manifest(id, '1.0.0', dependencies),
  initialState: () => ({ count: 0 }),
  reduce: (state, event) => ({ count: state.count + (event.type === 'increment' ? 1 : 0) }),
  activate(ctx) { return ctx.window.run(ctx, id, '1.0.0'); },
});
async function updatePackage(id = 'parent', { version = '2.0.0', dependencies = [] } = {}) {
  const m = manifest(id, version, dependencies);
  const code = `return { manifest: ${JSON.stringify(m)}, activate(ctx) { return ctx.window.run(ctx, ${JSON.stringify(id)}, ${JSON.stringify(version)}); } };`;
  return { format: PACKAGE_FORMAT, manifest: m, code, sha256: await packageDigest(m, code) };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function harness(t, modules, records = []) {
  const log = [], writes = [], notices = [], saved = new Map(records.map(r => [r.id, structuredClone(r)]));
  const resources = new Set(), failures = new Set(), listenersSeen = [];
  const env = {
    failures, gate: null, entered: null,
    async run(ctx, id, version) {
      const key = `${id}@${version}`;
      log.push(`start:${key}`);
      const resource = { key, scope: ctx.scope }; resources.add(resource);
      ctx.scope.add(() => { log.push(`stop:${key}`); resources.delete(resource); });
      ctx.subscribe((_state, event) => listenersSeen.push(`${id}:${event.seq}`));
      if (env.gate && key === env.gate.key) { env.entered.resolve(); await env.gate.promise; }
      if (failures.has(key)) throw new Error(`启动失败:${key}`);
    },
  };
  const journal = new SessionJournal();
  const store = {
    beforePut: null,
    list: async () => [...saved.values()].map(r => structuredClone(r)),
    async put(record) {
      await store.beforePut?.(record);
      writes.push(structuredClone(record)); saved.set(record.id, structuredClone(record));
    },
  };
  const manager = new PluginManager({ journal, store, settings: { namespace: () => ({}) },
    context: { window: env, notify: message => notices.push(message) } });
  for (const [id, dependencies] of modules) manager.registerBuiltin(moduleFor(id, dependencies));
  t.after(() => manager.dispose());
  await manager.init(); log.length = 0;
  return { manager, journal, store, env, log, writes, notices, saved, resources, listenersSeen };
}
const status = (h, id) => h.manager.list().find(row => row.id === id);
const count = (h, entry) => h.log.filter(item => item === entry).length;
const before = (h, a, b) => {
  assert.ok(h.log.includes(a), `missing ${a}: ${h.log}`);
  assert.ok(h.log.includes(b), `missing ${b}: ${h.log}`);
  assert.ok(h.log.indexOf(a) < h.log.indexOf(b), `${a} must precede ${b}: ${h.log}`);
};

test('updating a prerequisite pauses its diamond transitively, then resumes each dependent once in dependency order', async t => {
  const h = await harness(t, [['leaf', ['left', 'right']], ['right', ['parent']], ['left', ['parent']], ['parent'], ['unrelated']]);
  const pkg = await updatePackage();
  await h.manager.install(pkg);
  for (const id of ['left', 'right', 'leaf']) {
    assert.equal(count(h, `stop:${id}@1.0.0`), 1);
    assert.equal(count(h, `start:${id}@1.0.0`), 1);
    assert.equal(status(h, id).active, true);
    assert.equal(status(h, id).enabled, true);
  }
  for (const id of ['left', 'right']) {
    before(h, 'stop:leaf@1.0.0', `stop:${id}@1.0.0`);
    before(h, `stop:${id}@1.0.0`, 'stop:parent@1.0.0');
    before(h, 'start:parent@2.0.0', `start:${id}@1.0.0`);
    before(h, `start:${id}@1.0.0`, 'start:leaf@1.0.0');
  }
  assert.equal(h.log.some(item => item.includes('unrelated')), false);
  assert.equal(status(h, 'parent').version, '2.0.0');
  assert.deepEqual(h.saved.get('parent').previous, { builtin: true });
  assert.deepEqual(h.writes.map(record => record.id), ['parent'], 'temporary suspension does not change durable enabled preferences');
  assert.equal(h.resources.size, 5);
});

test('failed candidate activation restores the old prerequisite before restarting its dependent chain', async t => {
  const h = await harness(t, [['leaf', ['child']], ['child', ['parent']], ['parent']]);
  h.env.failures.add('parent@2.0.0');
  await assert.rejects(h.manager.install(await updatePackage()), /启动失败:parent@2\.0\.0/);
  before(h, 'stop:leaf@1.0.0', 'stop:child@1.0.0');
  before(h, 'start:parent@1.0.0', 'start:child@1.0.0');
  before(h, 'start:child@1.0.0', 'start:leaf@1.0.0');
  for (const id of ['parent', 'child', 'leaf']) assert.equal(status(h, id).active, true);
  for (const id of ['child', 'leaf']) assert.equal(count(h, `start:${id}@1.0.0`), 1);
  assert.equal(status(h, 'parent').version, '1.0.0');
  assert.equal(h.resources.size, 3);
  assert.equal(h.saved.size, 0);
});

test('failed persistence restores the prior runtime and resumes dependents without losing their state or listeners', async t => {
  const h = await harness(t, [['child', ['parent']], ['parent']]);
  h.journal.push('increment', {});
  h.store.beforePut = () => { h.journal.push('increment', {}); throw new Error('存储失败'); };
  await assert.rejects(h.manager.install(await updatePackage()), /存储失败/);
  assert.equal(status(h, 'parent').version, '1.0.0');
  assert.equal(status(h, 'child').active, true);
  assert.equal(h.manager.slots.get('child').state.count, 2);
  const event = h.journal.push('increment', {});
  assert.equal(h.manager.slots.get('child').state.count, 3);
  assert.equal(h.listenersSeen.filter(key => key === `child:${event.seq}`).length, 1);
  assert.equal(h.manager.slots.get('child').listeners.size, 1);
  assert.equal(h.resources.size, 2);
  assert.equal(h.saved.size, 0);
  before(h, 'stop:parent@2.0.0', 'start:parent@1.0.0');
  before(h, 'start:parent@1.0.0', 'start:child@1.0.0');
});

test('invalid package bytes and circular replacement dependencies never pause running plugins', async t => {
  const h = await harness(t, [['child', ['parent']], ['parent']]);
  const valid = await updatePackage();
  await assert.rejects(h.manager.install({ ...valid, sha256: '0'.repeat(64) }), /校验失败/);
  assert.deepEqual(h.log, []);
  await assert.rejects(h.manager.install(await updatePackage('parent', { dependencies: ['child'] })), /循环依赖/);
  assert.deepEqual(h.log, []);
  assert.equal(status(h, 'parent').active, true);
  assert.equal(status(h, 'child').active, true);
});

test('an originally disabled dependent stays disabled and its saved preference survives an update', async t => {
  const record = { id: 'off', enabled: false, active: null, previous: null, uninstalled: false };
  const h = await harness(t, [['off', ['parent']], ['child', ['parent']], ['parent']], [record]);
  await h.manager.install(await updatePackage());
  assert.equal(status(h, 'off').enabled, false);
  assert.equal(status(h, 'off').active, false);
  assert.equal(h.log.some(item => item.includes('off@')), false);
  assert.deepEqual(h.saved.get('off'), record);
  assert.equal(status(h, 'child').active, true);
});

test('a dependent that fails to restart exposes its error while other dependents still recover', async t => {
  const h = await harness(t, [['leaf', ['broken']], ['broken', ['parent']], ['healthy', ['parent']], ['parent']]);
  h.env.failures.add('broken@1.0.0');
  await assert.rejects(h.manager.install(await updatePackage()), /broken/);
  assert.equal(status(h, 'parent').version, '2.0.0');
  assert.equal(status(h, 'parent').active, true);
  assert.equal(h.saved.get('parent').active.manifest.version, '2.0.0');
  assert.equal(status(h, 'broken').enabled, true);
  assert.equal(status(h, 'broken').active, false);
  assert.match(status(h, 'broken').error, /启动失败:broken/);
  assert.equal(status(h, 'leaf').active, false);
  assert.match(status(h, 'leaf').error, /broken/);
  assert.equal(count(h, 'start:leaf@1.0.0'), 0, 'a failed prerequisite blocks its downstream branch');
  assert.ok(count(h, 'start:broken@1.0.0') <= 2, 'downstream recovery must not retry an already failed prerequisite again');
  assert.equal(status(h, 'healthy').active, true);
  assert.equal(count(h, 'start:healthy@1.0.0'), 1);
  assert.equal(h.resources.size, 2, 'all failed dependent scopes have been disposed');
});

test('a recovery error does not hide the original update failure or prevent healthy dependent recovery', async t => {
  const h = await harness(t, [['broken', ['parent']], ['healthy', ['parent']], ['parent']]);
  h.env.failures.add('parent@2.0.0');
  h.env.failures.add('broken@1.0.0');
  await assert.rejects(h.manager.install(await updatePackage()), error => {
    assert.match(error.message, /启动失败:parent@2\.0\.0/);
    assert.match(error.message, /broken/);
    return true;
  });
  assert.equal(status(h, 'parent').version, '1.0.0');
  assert.equal(status(h, 'parent').active, true);
  assert.equal(status(h, 'healthy').active, true);
  assert.equal(status(h, 'broken').active, false);
  assert.match(status(h, 'broken').error, /启动失败:broken/);
  assert.equal(h.saved.size, 0);
  assert.equal(h.resources.size, 2);
});

test('disposing during asynchronous prerequisite activation cannot restart the suspended dependents', async t => {
  const h = await harness(t, [['child', ['parent']], ['parent']]);
  const gate = deferred(); h.env.gate = { key: 'parent@2.0.0', promise: gate.promise }; h.env.entered = deferred();
  const updating = h.manager.install(await updatePackage());
  const rejected = assert.rejects(updating, /取消|停止/);
  await h.env.entered.promise;
  assert.equal(status(h, 'child').active, false);
  assert.equal(status(h, 'child').enabled, true);
  h.manager.dispose(); gate.resolve();
  await rejected;
  assert.equal(count(h, 'start:child@1.0.0'), 0);
  assert.equal(h.manager.list().some(item => item.active), false);
  assert.equal(h.resources.size, 0);
  assert.equal(h.saved.size, 0);
});

test('disposing in the dependency-resolution microtask prevents a dependent activation side effect', async t => {
  const h = await harness(t, [['child', ['parent']], ['parent']]);
  h.manager.onChange = () => {
    if (status(h, 'child')?.maintenance === 'restarting') queueMicrotask(() => h.manager.dispose());
  };
  await assert.rejects(h.manager.install(await updatePackage()), /取消|停止/);
  assert.equal(count(h, 'start:child@1.0.0'), 0);
  assert.equal(h.manager.list().some(item => item.active), false);
  assert.equal(h.resources.size, 0);
});
