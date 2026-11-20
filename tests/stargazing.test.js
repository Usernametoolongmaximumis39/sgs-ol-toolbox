import assert from 'node:assert/strict';
import test from 'node:test';
import { findEntries, normalizeReport } from '../src/plugins/stargazing/report.js';
import { createGameAssetDownloads, mobileSkinRequest, toolboxDownloadRequest } from '../src/core/mobile-skin-download.js';
import { STARGAZING_REPORT } from '../src/shared/stargazing-source.js';

test('观星报表按来源栏目与字段顺序显示，并筛选跨字段关键词', () => {
  const report = normalizeReport({
    updatedAt: '2026/11/20 20:00:00',
    sections: [
      { kind: 'table', title: '兑换', columns: ['时间', '说明', '奖励', '编号'], rows: [
        { 奖励: '皇甫嵩', 说明: '限购####消耗如意结', 时间: '11月21日', 编号: 0 },
        { 奖励: '传世玉玺', 说明: '消耗同心结' },
      ] },
      { kind: 'skins', title: '皮肤', items: [
        { name: '谋诸葛亮', full: 'https://gx.95chong.cn/new.png' },
        { name: '<script>原样显示</script>', full: 'javascript:alert(1)' },
      ] },
    ],
  });
  assert.equal(report.updatedAt, '2026/11/20 20:00:00');
  assert.deepEqual(report.sections[0].rows, [
    ['11月21日', '限购\n消耗如意结', '皇甫嵩', '0'],
    ['', '消耗同心结', '传世玉玺', ''],
  ]);
  assert.equal(report.sections[1].items[0].url, 'https://gx.95chong.cn/new.png');
  assert.deepEqual(report.sections[1].items[1], { name: '<script>原样显示</script>', url: '' });
  assert.deepEqual(findEntries(report.sections, -1, '  兑换  皇甫嵩 ')[0].rows, report.sections[0].rows.slice(0, 1));
  assert.equal(findEntries(report.sections, -1, '诸葛亮')[0].title, '皮肤');
  assert.deepEqual(findEntries(report.sections, 0, '诸葛亮'), []);
  assert.deepEqual(findEntries(report.sections, 1, '').map(section => section.title), ['皮肤']);
  assert.deepEqual(normalizeReport({ sections: [] }), { updatedAt: '', sections: [] });
  for (const sections of [null, [{ kind: 'unknown', title: '栏' }], [{ kind: 'table', title: '栏', columns: ['说明'], rows: [[]] }]]) {
    assert.throws(() => normalizeReport({ sections }), /报表格式有变化/);
  }
});

test('跨域通道只允许固定站点和完整报表，且保留移动版皮肤的独立边界', () => {
  assert.equal(toolboxDownloadRequest(STARGAZING_REPORT).limit, 1024 * 1024);
  for (const value of [STARGAZING_REPORT + '?id=1', STARGAZING_REPORT + '#anchor', STARGAZING_REPORT + '/', STARGAZING_REPORT.replace('https:', 'http:')]) {
    assert.throws(() => toolboxDownloadRequest(value));
  }
  assert.throws(() => toolboxDownloadRequest(STARGAZING_REPORT, 2 * 1024 * 1024), /完整报告/);
  assert.throws(() => toolboxDownloadRequest(STARGAZING_REPORT, undefined, { suffix: 3 }), /完整报告/);
  assert.throws(() => mobileSkinRequest(STARGAZING_REPORT), /允许范围/);
});

test('观星读取回退仅发送匿名 GET，检查状态、大小和 JSON', async () => {
  let response = new Response('{"sections":[]}');
  const win = { setTimeout, clearTimeout, async fetch(url, options) {
    assert.equal(url, STARGAZING_REPORT);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
    return response;
  } };
  const { readStargazingReport } = createGameAssetDownloads(win);
  assert.deepEqual(await readStargazingReport(), { sections: [] });
  response = new Response('Unavailable', { status: 503 });
  await assert.rejects(readStargazingReport(), /HTTP 503/);
  response = new Response('x'.repeat(1024 * 1024 + 1));
  await assert.rejects(readStargazingReport(), /超过下载上限/);
  response = new Response('<html>');
  await assert.rejects(readStargazingReport(), /无法读取的报表/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readStargazingReport({ signal: controller.signal }), /已取消/);
});
