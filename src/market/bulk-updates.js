import { planDependencies } from './dependencies.js';
import { compareVersions, findPluginUpdates } from './updates.js';

export async function updateInstalledPlugins({ manager, client, catalog, checkCurrent, onProgress }) {
  const installed = new Map(manager.list().map(item => [item.id, item]));
  const entries = new Map(findPluginUpdates([...installed.values()], catalog)
    .filter(item => item.status === 'update').map(item => [item.id, item.entry]));
  const finished = new Map(), visiting = new Set();
  let updated = 0, processed = 0;
  async function visit(id) {
    if (visiting.has(id)) throw new Error('前置插件循环依赖：' + id);
    if (finished.has(id)) return finished.get(id);
    const entry = entries.get(id);
    visiting.add(id);
    let error;
    try {
      for (const dependency of entry?.dependencies ?? installed.get(id)?.dependencies ?? []) {
        if (await visit(dependency)) throw new Error('请先修复前置插件「' + (installed.get(dependency)?.name || dependency) + '」的更新。');
      }
      if (entry) {
        checkCurrent();
        onProgress(++processed, entries.size, entry.name);
        const checkInstall = () => {
          const list = manager.list(), current = list.find(item => item.id === id);
          if (!current || compareVersions(entry.version, current.version) <= 0) return false;
          if (current.enabled) {
            const missing = planDependencies(entry, list, catalog);
            if (missing.length) throw new Error('请在此插件的更新卡片中安装新增前置：' + missing.map(item => item.name).join('、'));
          }
          return true;
        };
        if (checkInstall()) {
          const pkg = await client.getPackage(entry);
          checkCurrent();
          if (checkInstall()) { await manager.install(pkg, { updateOnly: true }); updated++; }
        }
      }
    } catch (failure) { error = failure; }
    finally { visiting.delete(id); }
    finished.set(id, error);
    return error;
  }
  for (const id of entries.keys()) { checkCurrent(); await visit(id); }
  checkCurrent();
  return { updated, failures: [...entries].filter(([id]) => finished.get(id)).map(([id, entry]) => ({ entry, error: finished.get(id) })) };
}
