import { verifyPackage } from './packages.js';
import { MERGED_SHANHETU_PACKAGES, REPLACED_SHANHETU_BETA_PACKAGES, REPLACED_SHANHETU_PACKAGES, REPLACED_THEME_PACKAGES } from './version.js';
import { CONSOLIDATED_PACKAGE_DIGESTS } from './consolidated-package-digests.js';

const CARD_STYLES = 'card-styles-extra';
const groups = [
  { target: 'shanhetu', sources: ['shanhetu-beta'], preference: 'showExtra', mergedDigests: MERGED_SHANHETU_PACKAGES },
  { target: 'player-info', sources: ['general-pools'], preference: 'generalPools' },
  { target: 'ledger', sources: ['wish-progress'] },
  { target: CARD_STYLES, sources: ['native-cards', 'gold-cards', 'yjcm-cards', 'dafeiyu-cards'] },
  { target: 'core', sources: ['themes'] },
];
const knownDigests = {
  ...CONSOLIDATED_PACKAGE_DIGESTS,
  shanhetu: [...CONSOLIDATED_PACKAGE_DIGESTS.shanhetu, ...REPLACED_SHANHETU_PACKAGES],
  'shanhetu-beta': [...CONSOLIDATED_PACKAGE_DIGESTS['shanhetu-beta'], ...REPLACED_SHANHETU_BETA_PACKAGES],
  themes: [...CONSOLIDATED_PACKAGE_DIGESTS.themes, ...REPLACED_THEME_PACKAGES],
};

function savedPackage(record) {
  return record?.active || (record?.previous?.builtin ? null : record?.previous);
}

async function verifiedPackage(id, pkg, digests) {
  if (pkg?.manifest?.id !== id || !digests.includes(pkg.sha256)) return false;
  return Boolean(await verifyPackage(pkg).catch(() => null));
}

export async function reconcileConsolidatedPlugins(records, builtins, store, settings, targetDigests) {
  const changes = [];
  for (const { target, sources, preference, mergedDigests = [] } of groups) {
    const bundled = builtins.get(target)?.bundledPackage;
    const installed = records.get(target);
    const active = savedPackage(installed);
    const applied = installed?.appliedBuiltinMigrations || [];
    const knownPrevious = active && await verifiedPackage(target, active, knownDigests[target] || []);
    const previousMerged = active && await verifiedPackage(target, active, mergedDigests);
    const mergedInstalled = previousMerged || (active && await verifiedPackage(target, active, [targetDigests[target]]));
    const legacy = [];
    for (const id of sources) {
      const row = records.get(id);
      if (await verifiedPackage(id, savedPackage(row), knownDigests[id])) legacy.push(row);
    }
    const upgrade = bundled && (knownPrevious || previousMerged) && active.sha256 !== bundled.sha256
      && !installed.uninstalled && !applied.includes(active.sha256);
    const mergedReady = target === 'core' || mergedInstalled || upgrade || (bundled && !active);
    if (!mergedReady) {
      // Rolling the receiving plugin back makes its previously archived companion usable again.
      if (knownPrevious && !installed.uninstalled) for (const row of legacy) {
        if (row.mergedInto !== target) continue;
        const restored = { ...row, uninstalled: false };
        delete restored.mergedInto;
        changes.push(restored);
      }
      continue;
    }
    if (upgrade) changes.push({ ...installed, active: bundled, previous: active,
      appliedBuiltinMigrations: [...applied, active.sha256] });

    const retiring = legacy.filter(row => !row.uninstalled);
    const explicitlyOff = sources.map(id => records.get(id))
      .filter(row => row && (row.uninstalled ? !row.mergedInto : retiring.includes(row) && row.enabled === false));
    if (preference && explicitlyOff.length) {
      const options = settings.namespace(target);
      if (options.get(preference) === undefined) options.set(preference, false);
    }
    if (target === CARD_STYLES && explicitlyOff.length) {
      const value = settings.get('inactiveLegacyCardPacks', []);
      const inactive = new Set(Array.isArray(value) ? value : []);
      for (const row of explicitlyOff) inactive.add(row.id);
      if (!Array.isArray(value) || inactive.size !== value.length) settings.set('inactiveLegacyCardPacks', [...inactive]);
      if (!installed && bundled && !legacy.some(row => !row.uninstalled && row.enabled !== false)) {
        changes.push({ id: target, enabled: false, uninstalled: false, active: bundled, previous: null });
      }
    }
    for (const row of retiring) changes.push({ ...row, uninstalled: true, mergedInto: target });
  }
  if (!changes.length) return;
  await store.putMany(changes);
  for (const row of changes) records.set(row.id, row);
}
