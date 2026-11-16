import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementExport } from '../src/plugins/baisheng/export.js';

const row = { id: 10, characterId: 1, name: '刘备', owned: true, desc: '获得一百场胜利',
  required: 100, value: 83, completed: false, finishTime: null, skill: { completed: false, desc: '一局内完成技能条件' } };
const snapshot = { nickname: '甲', at: 1794614400000, finish: { 11: 1700000000 }, progress: { 100: 83 } };
const view = { who: { id: '41', nickname: '甲' }, snapshot, rows: [row], error: '' };
const options = { now: 1794700800000, pluginVersion: '0.1.2' };

test('readable export includes summaries, dates and named achievements without mutating data', () => {
  const data = { ...view, rows: [row,
    { ...row, id: 11, characterId: 2, name: '关羽', owned: false, value: 0, completed: true, finishTime: 1700000000, skill: null },
    { ...row, id: 12, characterId: 3, name: '张飞', owned: null, value: 100, completed: true, skill: { completed: true, desc: '技能条件' } },
  ] }, before = structuredClone(data);
  const report = JSON.parse(JSON.stringify(achievementExport(data, options)));
  assert.equal(report.格式版本, 2);
  assert.deepEqual(report.账号, { ID: '41', 昵称: '甲' });
  assert.notEqual(report.导出时间, report.快照时间);
  assert.match(report.快照时间, /^2026-11-\d\d \d\d:\d\d:\d\d UTC[+-]\d\d:\d\d$/);
  assert.deepEqual(report.完成汇总.全部武将, { 总数: 3, 已完成: 2, 未完成: 1, 进度未知: 0 });
  assert.deepEqual(report.完成汇总.已拥有武将, { 总数: 1, 已完成: 0, 未完成: 1, 进度未知: 0 });
  assert.equal(report.完成汇总.未拥有武将数, 1);
  assert.equal(report.完成汇总.归属未知武将数, 1);
  assert.deepEqual(report.武将列表[0].百胜战功, { 状态: '未完成', 进度: '83 / 100', 完成时间: '尚未完成', 条件: '获得一百场胜利' });
  assert.equal(report.武将列表[1].百胜战功.进度, '已完成'); // Completed records can omit progress.
  assert.match(report.武将列表[1].百胜战功.完成时间, /^2023-11-/);
  assert.equal(report.武将列表[1].技能战功.状态, '无对应定义');
  assert.equal(report.武将列表[2].百胜战功.完成时间, '未记录');
  assert.equal(report.武将列表[2].技能战功.状态, '已完成');
  assert.deepEqual(report.原始快照, snapshot);
  assert.deepEqual(data, before);
});

test('unknown data stays explicit and full stale-snapshot warning survives export', () => {
  const report = achievementExport({ ...view, snapshot: null, rows: [{ ...row, owned: null, value: null, completed: null, desc: '', required: 0 }] }, options);
  assert.equal(report.快照时间, '未知');
  assert.equal(report.完成汇总.全部武将.进度未知, 1);
  assert.equal(report.武将列表[0].拥有状态, '未知');
  assert.equal(report.武将列表[0].百胜战功.状态, '未知（尚未查询）');
  assert.equal(report.武将列表[0].技能战功.状态, '未知（尚未查询）');
  assert.equal(report.武将列表[0].百胜战功.条件, '暂无条件说明');
  const unknownTarget = achievementExport({ ...view, rows: [{ ...row, value: 0, required: 0 }] }, options);
  assert.equal(unknownTarget.武将列表[0].百胜战功.进度, '0 / 目标未知');
  const error = '战功消息有缺口，请刷新官方进度；当前显示为上次快照。\n完整错误详情';
  assert.equal(achievementExport({ ...view, error }, options).数据提示, error);
  assert.equal(achievementExport({ ...view, rows: [] }, options).完成汇总.全部武将.总数, 0);
});
