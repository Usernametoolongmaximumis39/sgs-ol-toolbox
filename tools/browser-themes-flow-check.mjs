import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { FLOW_THEMES } from '../src/plugins/themes-flow/palettes.js';
import { createMarketServer } from './market-server.mjs';

const output = path.resolve('test-results/themes-flow');
await mkdir(output, { recursive: true });
const expectedCoreVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const market = await createMarketServer({ port: 0 });
let browser;
const errors = [], checks = [], captures = [];
const flowIds = FLOW_THEMES.map(theme => theme.id);

try {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser, 'Chrome, Edge or Playwright Chromium is required.');
  const context = await browser.newContext({ viewport: { width: 1180, height: 1050 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));

  const host = page.locator('[data-sgs-toolbox="core"]');
  const api = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager && !window[Symbol.for('sgs.ol.toolbox.core')].manager.initializing);
  const current = () => api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.current.id);
  const position = () => host.evaluate(node => { node.style.top = '20px'; node.style.left = '30px'; node.style.right = 'auto'; });
  const appearanceTab = async () => {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '外观', exact: true }).click();
  };
  const choose = async id => {
    const card = host.locator(`[data-theme-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    assert.equal(await current(), id);
    assert.equal(await card.getAttribute('aria-pressed'), 'true');
  };
  const shot = async (name, { scrollTop = 0 } = {}) => {
    if (scrollTop !== null) await host.locator('.content').evaluate((node, y) => { node.scrollTop = y; }, scrollTop);
    await page.mouse.move(1050, 950);
    await page.waitForTimeout(200);
    const file = path.join(output, `${name}.png`);
    await host.screenshot({ path: file });
    captures.push(file);
    return file;
  };

  await page.goto(`${market.url}/dev/index.html`);
  await ready();
  await position();
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].version), expectedCoreVersion);
  assert.ok(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().some(p => p.id === 'themes-flow' && p.active)), 'themes-flow must be active in dev');

  await appearanceTab();
  const totalCount = await host.locator('[data-theme-id]').count();
  assert.equal(totalCount, 9 + FLOW_THEMES.length, 'core 9 + 8 non-solid themes');
  assert.equal(await host.locator('[data-theme-id][data-theme-textured]').count(), FLOW_THEMES.length);
  checks.push(`主题工坊共展示 ${totalCount} 套主题，流彩主题包 8 套非纯色主题全部带独立纹理预览`);

  // Check widths 248 / 280 / 420 across all 8 themes and capture gallery views.
  for (const width of [248, 280, 420]) {
    await host.evaluate((node, w) => { node.style.width = `${w}px`; }, width);
    for (const id of flowIds) {
      await choose(id);
      const textured = await host.evaluate(node => node.hasAttribute('data-theme-textured'));
      const shellBg = await host.locator('.shell').evaluate(node => getComputedStyle(node).backgroundImage);
      assert.equal(textured, true, `${id}: data-theme-textured must be set`);
      assert.notEqual(shellBg, 'none', `${id}: shell must render non-solid gradient/pattern`);
      assert.equal(await host.locator('.content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `${id}: no content overflow at ${width}px`);
      assert.equal(await host.locator('[data-theme-id]').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), true, `${id}: theme cards fit at ${width}px`);
    }
    await host.locator('[data-theme-id="themes-flow.qinglv"]').scrollIntoViewIfNeeded();
    await shot(`gallery-${width}`, { scrollTop: null });
  }
  checks.push('全部 8 套非纯色主题在 248/280/420px 下无横向溢出，主面板与卡片渐变均实际渲染');

  // Check four font sizes at 280px width on a textured theme.
  await host.evaluate(node => { node.style.width = '280px'; });
  await choose('themes-flow.jinduan');
  if (!await host.locator('#core-font-settings').isVisible()) {
    await host.getByRole('button', { name: '展开界面字号', exact: true }).click();
  }
  for (const size of ['tiny', 'small', 'standard', 'large']) {
    await host.locator(`[data-font-size="${size}"]`).click();
    assert.equal(await host.locator('.content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `font ${size}: no overflow`);
  }
  await host.locator('[data-font-size="standard"]').click();
  if (!await host.locator('#core-theme-workshop').isVisible()) {
    await host.getByRole('button', { name: '展开主题工坊', exact: true }).click();
  }
  checks.push('四档字号（特小/小/标准/大）下非纯色主题面板无横向溢出');

  // Capture expanded theme views for all 8 non-solid themes + verify colorScheme.
  await host.evaluate(node => { node.style.width = '280px'; });
  for (const theme of FLOW_THEMES) {
    await choose(theme.id);
    const expectedScheme = theme.tokens.scheme || 'dark';
    assert.equal(await host.evaluate(node => getComputedStyle(node).colorScheme), expectedScheme);
    await host.locator(`[data-theme-id="${theme.id}"]`).scrollIntoViewIfNeeded();
    await shot(`theme-${theme.id.split('.').pop()}`, { scrollTop: null });
  }
  checks.push('8 套非纯色主题浅/深色系准确切换，已生成完整主题工坊截图');

  // Capture representative views across tabs (market / settings / game) for dark and light non-solid themes.
  for (const [id, tag] of [['themes-flow.qinglv', 'qinglv'], ['themes-flow.jinduan', 'jinduan'], ['themes-flow.yanzhi', 'yanzhi'], ['themes-flow.jinjian', 'jinjian']]) {
    await api(target => window[Symbol.for('sgs.ol.toolbox.core')].themes.select(target), id);
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '插件市场', exact: true }).click();
    await shot(`market-${tag}`);
    await host.getByRole('button', { name: '设置', exact: true }).click();
    await shot(`settings-${tag}`);
    await host.locator('[data-category=game]').click();
    await shot(`game-${tag}`);
  }
  checks.push('代表性深浅非纯色主题在插件市场、设置和牌局页正常渲染');

  // Capture collapsed HUD bars across all 8 themes on dark and light page backdrops.
  await appearanceTab();
  const compactImages = new Set();
  for (const theme of FLOW_THEMES) {
    await choose(theme.id);
    await host.getByRole('button', { name: '折叠面板', exact: true }).click();
    const bgImg = await host.locator('.shell').evaluate(node => getComputedStyle(node, '::after').backgroundImage);
    assert.notEqual(bgImg, 'none');
    compactImages.add(bgImg);
    const backdrop = theme.tokens.scheme === 'light' ? ['light', '#ece9e1'] : ['dark', '#111614'];
    await page.evaluate(color => { document.body.style.background = color; document.documentElement.style.background = color; }, backdrop[1]);
    const file = path.join(output, `compact-${theme.id.split('.').pop()}-${backdrop[0]}.png`);
    await page.screenshot({ path: file, clip: { x: 14, y: 4, width: 190, height: 74 } });
    captures.push(file);
    await host.getByRole('button', { name: '放大面板', exact: true }).click();
  }
  assert.equal(compactImages.size, FLOW_THEMES.length, 'each non-solid theme has a distinct compact bar texture');
  checks.push('全部 8 套非纯色收起栏渲染各自独立渐变/暗纹');

  // Disable plugin -> clean fallback to core.black-gold with zero texture residue -> re-enable restores preference.
  await choose('themes-flow.xinghan');
  await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('themes-flow'));
  assert.equal(await current(), 'core.black-gold');
  assert.equal(await host.evaluate(node => node.hasAttribute('data-theme-textured')), false);
  assert.equal(await host.locator('.shell').evaluate(node => getComputedStyle(node).backgroundImage), 'none');
  await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.enable('themes-flow'));
  assert.equal(await current(), 'themes-flow.xinghan');
  assert.equal(await host.evaluate(node => node.hasAttribute('data-theme-textured')), true);
  checks.push('停用流彩主题包后自动回退玄金且无渐变残留，重新启用自动恢复原非纯色选择');

  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ coreVersion: expectedCoreVersion, checks, pageErrors: errors, screenshots: captures }, null, 2));
  console.log(`PASS: ${checks.length} flow theme browser checks; ${captures.length} screenshots; no page errors.\n${checks.join('\n')}`);
  await context.close();
} finally {
  await browser?.close();
  await market.close();
}
