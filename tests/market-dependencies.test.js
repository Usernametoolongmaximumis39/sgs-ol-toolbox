import test from 'node:test';
import assert from 'node:assert/strict';
import { planDependencies } from '../src/market/dependencies.js';
const base = { id: 'base', name: '前置', version: '1.0.0' };
const middle = { id: 'middle', version: '1.0.0', dependencies: ['base'] };
const target = { id: 'target', dependencies: ['middle', 'base'] };
test('missing prerequisites use latest stable, deduplicate and precede dependents', () => {
  assert.deepEqual(planDependencies(target, [], [base, middle, { ...base, version: '2.0.0-beta' }]).map(x => x.id), ['base', 'middle']);
});
test('disabled, broken, missing and cyclic prerequisites stay explicit', () => {
  assert.throws(() => planDependencies(target, [{ ...base, enabled: false }], [middle]), /未正常运行/);
  assert.throws(() => planDependencies(target, [], [middle]), /暂无/);
  assert.throws(() => planDependencies(target, [], [middle, { ...base, dependencies: ['target'] }, { ...target, version: '1.0.0' }]), /循环/);
  assert.deepEqual(planDependencies(target, [{ ...base, enabled: true, active: true }], [middle]), [middle]);
});
