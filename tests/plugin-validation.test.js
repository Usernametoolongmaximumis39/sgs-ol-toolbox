import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bundlePlugin, bundlePluginEntry, makePluginPackage } from '../tools/plugin-packages.mjs';
import { validateDependencyGraph, validateInventory } from '../tools/plugin-validation.mjs';

const manifest = { id: 'sample', name: '检查样例', version: '1.0.0', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.0', categories: [], icon: 'tools', priority: 32768, description: '开发检查的失败路径' };
const entry = (prefix = '', fields = 'activate() {}') => `${prefix}\nexport default {manifest: ${JSON.stringify(manifest)}, ${fields}};`;
async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), 'sgs-plugin-validation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(path, contents) { const file = join(root, path); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, contents); }
  await put('src/plugins/sample/index.js', source);
  return { root, put, bundle: () => bundlePlugin('sample', { root }) };
}

test('plugin checks reject forbidden imports before any entry side effect runs', async t => {
  const f = await fixture(t, entry(`import '../other/index.js'; globalThis.__uncheckedPluginExecuted = true;`));
  await f.put('src/plugins/other/index.js', 'globalThis.__uncheckedPluginExecuted = true;');
  await assert.rejects(f.bundle(), /导入越界/);
  assert.equal(globalThis.__uncheckedPluginExecuted, undefined);
  await f.put('src/plugins/sample/index.js', entry(`import '../../ui/helper.js';`));
  await f.put('src/ui/helper.js', `import '../plugins/other/index.js';`);
  await assert.rejects(f.bundle(), /导入越界/, 'a shared module cannot launder a cross-plugin import');
});

test('plugin checks reject external, dynamic, require and private core dependencies', async t => {
  for (const prefix of [`import 'node:fs';`, `import('https://example.test/code.js');`, `require('./part.js');`,
    `const target = globalThis.target; import(target);`, `const target = globalThis.target; require(target);`,
    `import '../../core/private.js';`]) {
    const f = await fixture(t, entry(prefix)); await f.put('src/core/private.js', 'export const secret = 1;');
    await assert.rejects(f.bundle(), undefined, prefix);
  }
});

test('plugin load smoke rejects import-time timers, requests, dynamic code and malformed lifecycle exports', async t => {
  for (const prefix of [`setInterval(() => {}, 10);`, `fetch('https://example.test/');`, `new Function('return 1')();`, `globalThis.pluginSideEffect = true;`]) {
    const f = await fixture(t, entry(prefix)); await assert.rejects(f.bundle());
  }
  for (const fields of ['activate: 1', 'activate() {}, reduce: {}', 'activate() {}, initialState: []']) {
    const f = await fixture(t, entry('', fields)); await assert.rejects(f.bundle(), /必须是函数/);
  }
  const f = await fixture(t, entry()); const bundle = await f.bundle();
  assert.equal(bundle.manifest.id, 'sample'); assert.equal((await makePluginPackage(bundle)).manifest.version, '1.0.0');
  await assert.rejects(makePluginPackage(bundle, 'invalid-version'), /版本无效/);
  assert.equal((await bundlePluginEntry(join(f.root, 'src/plugins/sample/index.js'), { root: f.root })).manifest.id, 'sample');
  await f.put('src/plugins/sample/index.js', entry().replace('"id":"sample"', '"id":"wrong"'));
  await assert.rejects(f.bundle(), /目录与 ID 不符/);
});

test('plugin inventory catches unregistered, duplicate and undocumented plugin entries', async t => {
  const f = await fixture(t, entry());
  await f.put('docs/sample.md', '# 示例'); await f.put('tests/sample.test.js', '');
  const quality = { sample: { docs: ['docs/sample.md'], tests: ['tests/sample.test.js'], browser: [] } };
  await validateInventory(f.root, [{ id: 'sample' }], quality);
  await assert.rejects(validateInventory(f.root, [], quality), /不一致/);
  await assert.rejects(validateInventory(f.root, [{ id: 'sample' }, { id: 'sample' }], quality), /重复/);
  await assert.rejects(validateInventory(f.root, [{ id: 'sample' }], {}), /验收索引/);
  await assert.rejects(validateInventory(f.root, [{ id: 'sample' }], { sample: { ...quality.sample, tests: ['missing.test.js'] } }));
});

test('plugin graph rejects missing, duplicate, direct and transitive circular prerequisites', () => {
  assert.doesNotThrow(() => validateDependencyGraph([{ id: 'child', dependencies: ['parent'] }, { id: 'parent' }]));
  for (const modules of [[{ id: 'a', dependencies: ['missing'] }], [{ id: 'a' }, { id: 'a' }],
    [{ id: 'a', dependencies: ['a'] }], [{ id: 'a', dependencies: ['b'] }, { id: 'b', dependencies: ['a'] }]]) {
    assert.throws(() => validateDependencyGraph(modules));
  }
});
