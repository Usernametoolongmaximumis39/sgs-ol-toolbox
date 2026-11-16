import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pluginReleases, bundlePlugin, bundlePluginEntry, makePluginPackage } from './plugin-packages.mjs';
import { verifyPackage, compilePackage } from '../src/core/packages.js';
import { pluginQuality } from './plugin-quality.mjs';

export function validateDependencyGraph(manifests) {
  const modules = new Map();
  for (const manifest of manifests) {
    if (modules.has(manifest.id)) throw new Error('插件 ID 重复：' + manifest.id);
    modules.set(manifest.id, manifest);
  }
  const done = new Set();
  function visit(id, path = []) {
    if (path.includes(id)) throw new Error('前置插件循环依赖：' + [...path, id].join(' → '));
    if (done.has(id)) return;
    if (!modules.has(id)) throw new Error('发布清单缺少前置插件：' + id);
    for (const dependency of modules.get(id).dependencies || []) visit(dependency, [...path, id]);
    done.add(id);
  }
  for (const id of modules.keys()) visit(id);
}

export async function validateInventory(root, releases = pluginReleases, quality = pluginQuality) {
  const dirs = (await readdir(resolve(root, 'src/plugins'), { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort();
  const ids = releases.map(row => row.id);
  if (new Set(ids).size !== ids.length) throw new Error('发布清单插件 ID 重复');
  if (JSON.stringify([...ids].sort()) !== JSON.stringify(dirs)) throw new Error('插件源码目录与发布清单不一致：' + JSON.stringify({ dirs, ids }));
  if (JSON.stringify(Object.keys(quality).sort()) !== JSON.stringify(dirs)) throw new Error('插件验收索引必须覆盖全部插件且无残留');
  for (const id of dirs) {
    const row = quality[id];
    if (!row || !['docs', 'tests', 'browser'].every(key => Array.isArray(row[key]) && row[key].every(file => typeof file === 'string' && file.length))
      || !row.docs.length || !row.tests.length) throw new Error(id + ' 缺少文档、测试或浏览器验收索引');
    for (const file of [`src/plugins/${id}/index.js`, ...row.docs, ...row.tests, ...row.browser]) {
      const local = relative(root, resolve(root, file));
      if (local.startsWith('..') || isAbsolute(local) || !(await stat(resolve(root, file))).isFile()) throw new Error(id + ' 验收路径无效：' + file);
    }
  }
}

export async function validateRepositoryPlugins({ root = resolve(import.meta.dirname, '..') } = {}) {
  await validateInventory(root);
  const bundles = [];
  for (const { id } of pluginReleases) bundles.push(await bundlePlugin(id, { root }));
  const template = await bundlePluginEntry(resolve(root, 'examples/plugin-template/index.js'), { root });
  validateDependencyGraph([...bundles.map(bundle => bundle.manifest), template.manifest]);
  // Exercise the exact package format, digest, size limit and manifest/code agreement.
  for (const bundle of [...bundles, template]) compilePackage(await verifyPackage(await makePluginPackage(bundle)));
  return { bundles, template };
}
