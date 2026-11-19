import { compareVersions } from './updates.js';
import { planDependencies } from './dependencies.js';

// Maintainer-owned identities; catalog claims cannot add official plugins.
export const officialPluginIds = Object.freeze(['social', 'player-info', 'native-cards', 'yjcm-cards', 'dafeiyu-cards', 'backgrounds', 'gold-cards', 'shanhetu', 'shanhetu-beta', 'cards', 'play-assist', 'daily-rewards', 'seckill', 'gaizhu', 'effects', 'skins', 'wish-progress', 'themes', 'baisheng', 'appearances', 'ledger', 'recharge']);

export function planOfficialPlugins(installed, catalog) {
  const latest = new Map();
  for (const entry of catalog) {
    if (!officialPluginIds.includes(entry.id) || !/^\d+\.\d+\.\d+$/.test(entry.version)) continue;
    if (!latest.has(entry.id) || compareVersions(entry.version, latest.get(entry.id).version) > 0) latest.set(entry.id, entry);
  }
  const result = new Map(), existing = new Set(installed.map(item => item.id));
  for (const id of officialPluginIds) {
    if (existing.has(id)) continue;
    const entry = latest.get(id);
    if (!entry) throw new Error('市场缺少官方插件：' + id);
    for (const item of [...planDependencies(entry, installed, [...latest.values()]), entry]) result.set(item.id, item);
  }
  return [...result.values()];
}
