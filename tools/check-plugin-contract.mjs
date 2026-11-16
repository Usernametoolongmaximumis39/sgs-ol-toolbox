import { resolve } from 'node:path';
import { bundlePluginEntry } from './plugin-packages.mjs';
import { validateRepositoryPlugins } from './plugin-validation.mjs';

const root = resolve(import.meta.dirname, '..');
const entries = process.argv.slice(2);
const bundles = entries.length
  ? await Promise.all(entries.map(entry => bundlePluginEntry(resolve(root, entry), { root })))
  : await validateRepositoryPlugins({ root }).then(({ bundles, template }) => [...bundles, template]);
const ids = new Set();
for (const plugin of bundles) {
  if (ids.has(plugin.manifest.id)) throw new Error(`插件 ID 重复：${plugin.manifest.id}`);
  ids.add(plugin.manifest.id);
  console.log(`${plugin.manifest.id} ${plugin.manifest.version} · ${plugin.manifest.categories.join('/') || '后台'} · ${plugin.manifest.priority}`);
}
console.log(`已校验 ${bundles.length} 个插件入口的开发约定 v1${entries.length ? '（指定入口，未做仓库全量核对）' : '：目录、验收索引、依赖图、导入边界、加载冒烟与包一致性'}。`);
