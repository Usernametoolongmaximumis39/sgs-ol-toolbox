import test from 'node:test';
import assert from 'node:assert/strict';
import { startOwnedRuntime } from '../src/core/runtime-owner.js';
import { userscriptHeader } from '../tools/distribution-build.mjs';
const key = Symbol.for('sgs.ol.toolbox.core');
for (const edition of ['dev', 'full', 'lite']) test(edition + ' updates only its own edition', () => {
  const header = userscriptHeader({ edition, version: '1.0.0', toolboxSvg: '' });
  assert.match(header, new RegExp('@updateURL\\s+\\S+/' + edition + '/toolbox.meta.js'));
  assert.match(header, new RegExp('@downloadURL\\s+\\S+/' + edition + '/toolbox.user.js'));
});
test('public editions share identity; dev differs', () => {
  const field = (edition, name) => userscriptHeader({ edition, version: '1.0.0', toolboxSvg: '' }).match(new RegExp('@' + name + '\\s+([^\\n]+)'))[1];
  for (const name of ['name', 'namespace']) {
    assert.equal(field('full', name), field('lite', name));
    assert.notEqual(field('full', name), field('dev', name));
  }
});
for (const editions of [['full', 'lite', 'dev'], ['lite', 'dev', 'full'], ['dev', 'full', 'lite']]) test('dev wins concurrent startup ' + editions.join('/'), async () => {
  const win = {}, active = new Set();
  const start = edition => startOwnedRuntime(win, edition, async api => {
    active.add(edition); api.scope.add(() => active.delete(edition)); return api;
  });
  await Promise.all(editions.map(start));
  assert.equal(win[key].distribution, 'dev'); assert.deepEqual([...active], ['dev']); win[key].dispose();
});
test('dev disposes public and waits for in-flight startup', async () => {
  const win = {}, calls = []; let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const publicBoot = startOwnedRuntime(win, 'full', async api => { calls.push('public'); api.scope.add(() => calls.push('disposed')); await waiting; return api; });
  await Promise.resolve();
  const devBoot = startOwnedRuntime(win, 'dev', async api => { calls.push('dev'); return api; });
  assert.deepEqual(calls, ['public', 'disposed']);
  release(); await Promise.all([publicBoot, devBoot]); assert.deepEqual(calls, ['public', 'disposed', 'dev']);
  win[key].dispose();
});
test('failed startup releases ownership', async () => {
  const win = {}; await assert.rejects(startOwnedRuntime(win, 'lite', async () => { throw new Error('failure'); }), /failure/);
  assert.equal(win[key], undefined);
  const api = await startOwnedRuntime(win, 'lite', async api => api); assert.equal(api, win[key]); api.dispose();
});
