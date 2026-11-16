import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../src/core/plugins.js';
import { validateManifest } from '../src/core/packages.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
function setup(t, modules, records = []) {
  const log = [], saved = new Map(records.map(r => [r.id, r]));
  const manager = new PluginManager({ journal: { events: [], subscribe: () => () => {} },
    store: { list: async () => [...saved.values()], put: async r => saved.set(r.id, r) },
    settings: { namespace: () => ({}) }, context: {} });
  for (const [id, dependencies = [], fail = false] of modules) manager.registerBuiltin({
    manifest: { id, name: id, version: '1.0.0', apiVersion: 1, categories: [], minCoreVersion: '0.5.62', dependencies },
    activate(ctx) { log.push(id); if (fail) throw new Error('测试失败'); ctx.scope.add(() => log.push('stop:' + id)); }
  });
  t.after(() => manager.dispose()); return { manager, log, saved };
}
test('dependencies activate first regardless of registration order; operations protect enabled dependents', async t => {
  const {manager, log} = setup(t, [['child', ['parent']], ['parent']]); await manager.init();
  assert.deepEqual(log, ['parent', 'child']);
  for (const op of [() => manager.disable('parent'), () => manager.uninstall('parent'), () => manager.reload('parent')]) await assert.rejects(op, /请先停用/);
  assert.ok(manager.slots.get('parent').active);
  await manager.disable('child'); await manager.reload('parent'); await manager.disable('parent');
  await assert.rejects(manager.enable('child'), /已停用/);
  assert.equal(manager.slots.get('child').record.enabled, false);
  await manager.enable('parent'); await manager.enable('child'); assert.ok(manager.slots.get('child').active);
});
test('missing, disabled, failed and cyclic prerequisites cannot activate dependents', async t => {
  for (const [modules, records, reason] of [
    [[['child', ['missing']]], [], /未安装/],
    [[['child', ['parent']], ['parent']], [{id:'parent', enabled:false}], /已停用/],
    [[['child', ['parent']], ['parent', [], true]], [], /无法运行/],
    [[['child', ['parent']], ['parent', ['child']]], [], /循环依赖/]
  ]) {
    const {manager} = setup(t, modules, records); await manager.init();
    assert.equal(manager.slots.get('child').active, false); assert.match(manager.slots.get('child').error, reason);
  }
});
test('manifest rejects invalid prerequisites and requires capable core', () => {
  const m={id:'child',name:'child',version:'1.0.0',apiVersion:1,categories:[],minCoreVersion:'0.5.62'};
  for (const dependencies of ['parent', ['child'], ['parent','parent'], ['Bad'], [null]]) assert.throws(() => validateManifest({...m, dependencies}), /前置插件/);
  assert.throws(() => validateManifest({...m,dependencies:['parent'],minCoreVersion:'0.5.61'}), /0.5.62/);
});
test('gaizhu package declares baisheng and refuses installation without it', async t => {
  const pkg=await makePluginPackage(await bundlePlugin('gaizhu'));
  assert.deepEqual(pkg.manifest.dependencies, ['baisheng']);
  const {manager,saved}=setup(t,[]); await manager.init();
  await assert.rejects(manager.install(pkg), /未安装/); assert.equal(saved.size,0); assert.equal(manager.list().length,0);
});
