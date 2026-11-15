import { compareVersions } from './updates.js';

// Missing dependencies only: never upgrade or enable an existing installation.
export function planDependencies(target, installed, catalog) {
  const existing = new Map(installed.map(item => [item.id, item]));
  const latest = new Map();
  for (const item of catalog) {
    if (!/^\d+\.\d+\.\d+$/.test(item.version)) continue;
    if (!latest.has(item.id) || compareVersions(item.version, latest.get(item.id).version) > 0) latest.set(item.id, item);
  }
  const done = new Set(), visiting = new Set(), result = [];
  function visit(item) {
    if (visiting.has(item.id)) throw new Error('前置插件循环依赖：' + item.id);
    if (done.has(item.id)) return;
    visiting.add(item.id);
    for (const id of item.dependencies || []) {
      const current = existing.get(id);
      if (current) {
        if (!current.enabled || !current.active || current.error) throw new Error('前置插件「' + current.name + '」已安装但未正常运行，请先在已安装插件中启用或修复。');
        continue;
      }
      const dependency = latest.get(id);
      if (!dependency) throw new Error('市场暂无前置插件「' + id + '」的正式版，请刷新目录或手动导入。');
      visit(dependency);
    }
    visiting.delete(item.id); done.add(item.id);
    if (item !== target) result.push(item);
  }
  visit(target); return result;
}
