import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officialPluginIds, planOfficialPlugins } from '../src/market/official.js';
import { pluginReleases } from '../tools/plugin-packages.mjs';
const catalog = () => officialPluginIds.map(id => ({ id, name: id, version: '1.0.0', ...(id === 'gaizhu' ? { dependencies: ['baisheng'] } : {}) }));
test('official suite matches maintainer release identities and orders prerequisites', () => {
  assert.deepEqual([...officialPluginIds].sort(), pluginReleases.filter(p => !p.localOnly).map(p => p.id).sort());
  const plan = planOfficialPlugins([], [...catalog(), { id: 'community.example', version: '2.0.0' }]);
  assert.equal(plan.length, officialPluginIds.length);
  assert.ok(plan.findIndex(p => p.id === 'baisheng') < plan.findIndex(p => p.id === 'gaizhu'));
  assert.ok(!plan.some(p => p.id === 'community.example'));
});
test('suite preserves installed versions and refuses disabled prerequisites / incomplete catalog', () => {
  assert.equal(planOfficialPlugins(officialPluginIds.map(id => ({ id, version: '0.1.0', enabled: false })), catalog()).length, 0);
  assert.throws(() => planOfficialPlugins([{ id: 'baisheng', enabled: false }], catalog()), /未正常运行/);
  assert.throws(() => planOfficialPlugins([], catalog().filter(p => p.id !== 'social')), /市场缺少/);
  assert.equal(planOfficialPlugins([{ id: 'social', version: '0.0.1' }], catalog()).some(p => p.id === 'social'), false);
});
