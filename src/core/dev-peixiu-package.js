import { compareVersions } from '../market/updates.js';
import { verifyPackage } from './packages.js';

const ASSIST = 'play-assist';
const LEGACY = 'peixiu';
const OLD_ASSIST = new Set([
  'b55e22854e2b43a042ad2c85978fa4eff8b069be2215225cb77938e728e7f96e',
  'c9e216221b36a84a00cd14464cff7bf6399376d61c8aac786b0baa61b1e020fd',
]);
const OLD_PEIXIU = new Set([
  'ba71733110a58afe068a1dc1bf47a5120f1e84ceafef37b896bb78f060e2ab18',
  'a5e09f8b60e70919eadada26ce94a6bc528d795df5f35b5a53803ba950a672d4',
]);

export async function reconcilePeixiuPackage(records, builtins, store, settings) {
  const bundled = builtins.get(ASSIST)?.bundledPackage;
  if (!bundled || compareVersions(bundled.manifest.version, '0.2.31') < 0) return;
  const assist = records.get(ASSIST), standalone = records.get(LEGACY);
  const applied = assist?.appliedBuiltinMigrations || [];
  const active = assist?.active;
  const upgrade = active?.manifest?.id === ASSIST && OLD_ASSIST.has(active.sha256) && !applied.includes(active.sha256)
    && compareVersions(bundled.manifest.version, active.manifest.version) > 0;
  if (assist?.uninstalled || (active && !upgrade && active.sha256 !== bundled.sha256)) return;
  const legacy = standalone?.active || (!standalone?.previous?.builtin ? standalone?.previous : null);
  const archive = !standalone?.uninstalled && legacy?.manifest?.id === LEGACY && OLD_PEIXIU.has(legacy.sha256);
  const updates = [];
  if (upgrade) {
    await verifyPackage(active);
    updates.push({ ...assist, active: bundled, previous: active, appliedBuiltinMigrations: [...applied, active.sha256] });
  }
  if (archive) {
    await verifyPackage(legacy);
    if (standalone.enabled === false && settings.get('peixiuAssist') === undefined) settings.set('peixiuAssist', false);
    updates.push({ ...standalone, uninstalled: true, mergedInto: ASSIST });
  }
  if (!updates.length) return;
  await store.putMany(updates);
  for (const record of updates) records.set(record.id, record);
}
