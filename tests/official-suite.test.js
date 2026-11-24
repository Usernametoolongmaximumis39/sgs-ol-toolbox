import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officialPluginIds, planOfficialPlugins } from '../src/market/official.js';
import { fullBundledPackages, pluginReleases } from '../tools/plugin-packages.mjs';
import microclientFull from '../microclient/bundled-plugins.json' with { type: 'json' };
const catalog = () => officialPluginIds.map(id => ({ id, name: id, version: '1.0.0', ...(id === 'gaizhu' ? { dependencies: ['baisheng'] } : {}) }));
test('official suite matches maintainer release identities and orders prerequisites', () => {
  assert.deepEqual([...officialPluginIds].sort(), pluginReleases.filter(p => !p.localOnly).map(p => p.id).sort());
  const plan = planOfficialPlugins([], [...catalog(), { id: 'community.example', version: '2.0.0' }]);
  assert.equal(plan.length, officialPluginIds.length);
  assert.ok(plan.some(p => p.id === 'stargazing'));
  assert.ok(plan.findIndex(p => p.id === 'baisheng') < plan.findIndex(p => p.id === 'gaizhu'));
  assert.ok(!plan.some(p => p.id === 'community.example'));
});
test('suite preserves installed versions and refuses disabled prerequisites / incomplete catalog', () => {
  assert.equal(planOfficialPlugins(officialPluginIds.map(id => ({ id, version: '0.1.0', enabled: false })), catalog()).length, 0);
  assert.throws(() => planOfficialPlugins([{ id: 'baisheng', enabled: false }], catalog()), /未正常运行/);
  assert.throws(() => planOfficialPlugins([], catalog().filter(p => p.id !== 'social')), /市场缺少/);
  assert.equal(planOfficialPlugins([{ id: 'social', version: '0.0.1' }], catalog()).some(p => p.id === 'social'), false);
});
test('Shanhe Beta and Poker Lobby are available in the official suite without being bundled in Full', () => {
  const entries = catalog();
  assert.ok(planOfficialPlugins([], entries).some(entry => entry.id === 'shanhetu-beta'));
  assert.ok(planOfficialPlugins([], entries).some(entry => entry.id === 'poker-lobby'));
  const bundled = fullBundledPackages(entries.map(manifest => ({ manifest }))).map(pkg => pkg.manifest.id);
  assert.ok(bundled.includes('shanhetu'));
  assert.ok(!bundled.includes('shanhetu-beta'));
  assert.ok(!bundled.includes('poker-lobby'));
});

test('Full browser and microclient both include stargazing', () => {
  const bundled = fullBundledPackages(catalog().map(manifest => ({ manifest })));
  assert.ok(bundled.some(pkg => pkg.manifest.id === 'stargazing'));
  assert.ok(microclientFull.includes('stargazing'));
  assert.deepEqual(bundled.map(pkg => pkg.manifest.id), microclientFull);
  assert.deepEqual([...microclientFull].sort(), officialPluginIds.filter(id => !['shanhetu-beta', 'poker-lobby'].includes(id)).sort());
  assert.throws(() => fullBundledPackages(catalog().filter(m => m.id !== 'baisheng').map(manifest => ({ manifest }))), /缺少随附插件/);
  assert.throws(() => fullBundledPackages(catalog().map(manifest => ({ manifest: manifest.id === 'gaizhu'
    ? { ...manifest, dependencies: ['shanhetu-beta'] } : manifest }))), /缺少显式随附的前置插件/);
});
