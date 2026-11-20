import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { bundleCore } from './distribution-build.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';
import { STARGAZING_REPORT } from '../src/shared/stargazing-source.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'test-results/stargazing');
const packages = await Promise.all(['stargazing', 'themes'].map(async id => makePluginPackage(await bundlePlugin(id, { root }))));
const { code } = await bundleCore({ root, edition: 'dev', packages });
const report = {
  updatedAt: '2026/11/20 20:30:00',
  sections: [
    { kind: 'table', title: '11月21日 · 如意结兑换', columns: ['时间', '说明', '奖励'], rows: [
      { 时间: '11月21日–11月28日', 说明: '消耗如意结 800 个####活动期间限兑换 1 次', 奖励: '谋诸葛亮' },
      ...Array.from({ length: 25 }, (_, i) => ({ 时间: '11月21日–11月28日', 说明: `消耗如意结 ${80 + i} 个`, 奖励: '皇甫嵩' })),
    ] },
    { kind: 'table', title: '限购礼包与周年庆活动期间的额外兑换奖励', columns: ['时间', '名称', '说明', '价格', '限购'], rows: [
      { 时间: '11月24日–12月13日', 名称: '周年臻礼', 说明: '活动期间首次登录领取，完成任务可额外获得臻礼抽奖券', 价格: '免费', 限购: '1 次' },
    ] },
  ],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const gamePage = 'https://web.sanguosha.com/220/h5_2/index.php';
  await page.route('**/*', route => route.request().url() === gamePage
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#393127"></body>' })
    : route.abort());
  await page.goto(gamePage);
  await page.evaluate(() => { window.Laya = { stage: {} }; });
  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'sgs-stargazing-check' });
  async function isolate(expression) {
    const value = await cdp.send('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true });
    assert.equal(value.exceptionDetails, undefined);
    return value.result.value;
  }
  await isolate(`
    globalThis.calls = [];
    globalThis.responseMode = 'success';
    globalThis.GM_xmlhttpRequest = options => {
      const call = { url: options.url, method: options.method, anonymous: options.anonymous, redirect: options.redirect, range: options.headers?.Range, aborted: false };
      calls.push(call);
      const timer = setTimeout(() => {
        if (responseMode === 'error') return options.onerror();
        const bytes = new TextEncoder().encode(${JSON.stringify(JSON.stringify(report))});
        options.onload({ status: 200, finalUrl: options.url, response: bytes.buffer });
      }, responseMode === 'slow' ? 1400 : 200);
      return { abort() { call.aborted = true; clearTimeout(timer); options.onabort(); } };
    };
    ${code}
  `);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.list().some(plugin => plugin.id === 'stargazing' && plugin.active));
  await page.getByRole('tab', { name: '工具' }).click();
  const trigger = page.getByRole('button', { name: '打开观星' });
  assert.equal(await isolate('calls.length'), 0, 'install and tools panel do not make requests');
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: '自助观星' });
  const search = dialog.getByRole('searchbox');
  const category = dialog.getByRole('combobox', { name: '选择栏目' });
  const refresh = dialog.getByRole('button', { name: '刷新观星报告' });
  assert.equal(await dialog.getByRole('link', { name: 'gx.95chong.cn' }).getAttribute('href'), 'https://gx.95chong.cn/');
  assert.match(await dialog.locator('footer').innerText(), /代码自动推演，可能会被调整，仅供参考/);
  await dialog.getByText('更新于 2026/11/20 20:30:00').waitFor();
  assert.equal(await dialog.getByRole('table').count(), 2);
  await search.fill('诸葛亮 800');
  assert.equal(await dialog.getByRole('table').count(), 1);
  assert.equal(await dialog.getByRole('row').count(), 2);
  await category.selectOption('1');
  assert.equal(await dialog.getByText('没有符合关键词的条目').count(), 1);
  await search.fill('');
  assert.equal(await dialog.getByRole('table').count(), 1);
  await isolate("responseMode = 'error'");
  await refresh.click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('status').innerText(), /显示上次读取的报告/);
  assert.equal(await dialog.getByRole('table').count(), 1);
  await isolate("responseMode = 'success'");
  await refresh.click();
  await dialog.getByText('更新于 2026/11/20 20:30:00').waitFor();
  assert.equal(await category.inputValue(), '1');
  await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].shell.render());
  assert.equal(await category.inputValue(), '1', 'the open dialog survives a sidebar redraw');
  await category.selectOption('-1');

  const layouts = [];
  for (const [name, width, height, hudWidth, size, theme] of [
    ['desktop-dark', 1280, 850, 280, 0, 'core.black-gold'],
    ['desktop-light', 1280, 850, 420, 2, 'themes.ricepaper'],
    ['ipad-portrait', 768, 1024, 248, -2, 'themes.ricepaper'],
    ['ipad-split', 375, 540, 280, -1, 'core.black-gold'],
    ['narrow-low', 300, 310, 248, 2, 'core.black-gold'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ hudWidth, size, theme }) => {
      const core = window[Symbol.for('sgs.ol.toolbox.core')];
      core.themes.select(theme);
      const host = document.querySelector('[data-sgs-toolbox="core"]');
      host.style.width = hudWidth + 'px';
      host.style.setProperty('--sgs-font-offset', size + 'px');
    }, { hudWidth, size, theme });
    const layout = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const content = element.querySelector('.content');
      const footer = element.querySelector('footer');
      const hud = element.getRootNode().host.getRootNode().host;
      return {
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
        contentHeight: content.clientHeight, contentWidth: content.clientWidth, scrollWidth: content.scrollWidth,
        footerBottom: footer.getBoundingClientRect().bottom, font: getComputedStyle(element).fontSize,
        bg: getComputedStyle(element).backgroundColor, scrolls: content.scrollHeight > content.clientHeight,
        hudWidth: hud.clientWidth, innerWidth: hud.shadowRoot.querySelector('.shell').clientWidth,
      };
    });
    assert.ok(layout.x >= 0 && layout.y >= 0 && layout.right <= width && layout.bottom <= height, name);
    assert.ok(layout.contentHeight > 40 && layout.scrolls && layout.scrollWidth <= layout.contentWidth, name);
    assert.ok(layout.footerBottom <= layout.bottom && layout.bottom - layout.footerBottom <= 2, name);
    assert.equal(layout.font, `${13 + size}px`, name);
    assert.ok(Math.abs(layout.hudWidth - hudWidth) <= 2 && layout.innerWidth <= hudWidth, name);
    layouts.push({ name, ...layout });
    await page.screenshot({ path: resolve(output, name + '.png') });
  }
  assert.notEqual(layouts[0].bg, layouts[1].bg, 'open dialog follows live theme changes');
  await isolate("responseMode = 'slow'");
  await refresh.click();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await trigger.evaluate(button => button.getRootNode().activeElement === button), true);
  assert.equal(await isolate('calls.at(-1).aborted'), true, 'Escape cancels the request');
  await trigger.click();
  await dialog.waitFor();
  await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('stargazing'));
  assert.equal(await dialog.count(), 0);
  await page.waitForTimeout(40);
  const calls = await isolate('calls');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.url === STARGAZING_REPORT && call.method === 'GET' && call.anonymous && call.redirect === 'error' && !call.range));
  assert.equal(calls.at(-1).aborted, true, 'disable cancels the request');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ layouts, calls }, null, 2));
  console.log('自助观星 Chromium 演练通过：' + output);
} finally {
  await browser.close();
}
