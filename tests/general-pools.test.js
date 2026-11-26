import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginNative } from '../src/core/plugin-native.js';
import { applyScheme, nativeSchemes } from '../src/plugins/player-info/general-pools/native.js';
import { filterGenerals } from '../src/plugins/player-info/general-pools/search.js';

test('reads full native ban snapshots including IDs outside the visible pool', () => {
  const native = {
    ShieldGeneralDic: { _maps: { 15: {}, 99: {}, 40: {} } },
    GetAllShieldGeneralSCheme: () => [{ scheme_id: 2, scheme_node: { scheme_name: '身份' } }],
    GetShieldGeneralState: (id, scheme) => scheme === 2 && id !== 40,
    SendClientShieldGeneralBatchReq() {},
  };
  const ctx = { game: { getClass: () => native } };
  ctx.native = createPluginNative(ctx);
  assert.deepEqual(nativeSchemes(ctx).schemes,
    [{ id: 2, name: '身份', ids: [15, 99] }]);
});

test('submits only changed bans and avoids overwriting an in-progress batch', () => {
  const calls = [];
  const native = { SendClientShieldGeneralBatchReq: (...args) => calls.push(args) };
  const target = { id: 3, ids: [4, 7] };
  assert.equal(applyScheme(native, target, [4, 7]), false);
  assert.equal(applyScheme(native, target, [4, 9]), true);
  assert.deepEqual(calls, [[3, [9], [7]]]);
  native.ShieldGeneralBatchState = 3;
  assert.throws(() => applyScheme(native, target, []), /正在处理/);
  assert.equal(calls.length, 1);
});

test('search uses native aliases and name fields without mutating the native list', () => {
  const rows = [{ ItemName: '界赵云' }, { specifyName: '神·', GeneralName: '赵云' }, { Name: 'Test' }];
  assert.deepEqual(filterGenerals(rows, '赵云'), rows.slice(0, 2));
  assert.deepEqual(filterGenerals(rows, 'test'), rows.slice(2));
  assert.equal(filterGenerals(rows, ''), rows);
});
