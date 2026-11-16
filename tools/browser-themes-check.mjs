import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { THEMES } from '../src/plugins/themes/palettes.js';
import { createMarketServer } from './market-server.mjs';

const output = path.resolve('test-results/themes');
await mkdir(output, { recursive: true });
const expectedCoreVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const catalog = JSON.parse(await readFile('release/market/catalog.json', 'utf8'));
const release = catalog.plugins.find(item => item.id === 'themes');
assert.ok(release, 'Build the theme plugin before this browser check.');
const packagePath = path.resolve(`release/market/packages/themes/${release.version}.json`);
const market = await createMarketServer({ port: 0 });
let browser;
const errors = [], checks = [], captures = [];
const ids = ['core.black-gold', ...THEMES.map(theme => theme.id)];
try {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser, 'Chrome, Edge or Playwright Chromium is required.');
  const context = await browser.newContext({ viewport: { width: 1100, height: 1050 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const host = page.locator('[data-sgs-toolbox="core"]');
  const api = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  const current = () => api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.current.id);
  const saved = () => api(() => window[Symbol.for('sgs.ol.toolbox.core')].settings.get('theme'));
  const toolsTab = () => host.locator('[data-category=tools]').click();
  const marketTab = async () => {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '插件市场', exact: true }).click();
  };
  const settingsTab = async () => {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '外观', exact: true }).click();
  };
  const position = () => host.evaluate(node => { node.style.top = '20px'; node.style.left = '30px'; node.style.right = 'auto'; });
  const choose = async id => {
    await host.locator(`[data-theme-id="${id}"]`).click();
    assert.equal(await current(), id);
    assert.equal(await host.locator('[data-theme-id][aria-pressed=true]').count(), 1);
    assert.equal(await host.locator(`[data-theme-id="${id}"]`).getAttribute('aria-pressed'), 'true');
  };
  const shot = async name => {
    await host.locator('.content').evaluate(node => { node.scrollTop = 0; });
    await page.mouse.move(900, 900); await page.waitForTimeout(250);
    const file = path.join(output, `${name}.png`);
    await host.screenshot({ path: file }); captures.push(file); return file;
  };
  const importFile = async () => {
    await marketTab();
    const picker = page.waitForEvent('filechooser');
    await host.getByRole('button', { name: '导入插件包', exact: true }).click();
    await (await picker).setFiles(packagePath);
    await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().some(item => item.id === 'themes' && item.active));
  };

  await page.goto(`${market.url}/dev/round2.html?plugin=themes`); await ready(); await position();
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].version), expectedCoreVersion, 'release must match current source version');
  assert.deepEqual(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().map(item => item.id)), ['themes']);
  assert.equal(await current(), 'core.black-gold', 'install must preserve the default');
  await marketTab();
  await host.locator('[data-plugin-id=themes]').getByRole('button', { name: '卸载', exact: true }).click();
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().length === 0);
  await importFile(); await settingsTab();
  for (const themeId of ['core.black-gold', 'themes.paper']) {
    // Use the registry's light palette ID rather than assuming its local name.
    await choose(themeId === 'themes.paper' ? THEMES.find(theme => theme.tokens.scheme === 'light').id : themeId);
    const before = await current();
    for (const width of [248, 280, 420]) {
      await host.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
      await host.getByRole('button', { name: '收起主题工坊', exact: true }).click();
      assert.equal(await host.locator('#core-theme-workshop').isVisible(), false);
      assert.equal(await current(), before);
      await shot(`fold-${themeId.split('.').pop()}-${width}`);
      await toolsTab(); await settingsTab();
      assert.equal(await host.locator('#core-theme-workshop').isVisible(), false);
      const toggle = host.getByRole('button', { name: '展开主题工坊', exact: true });
      await toggle.focus(); await page.keyboard.press('Enter');
      assert.equal(await host.locator('#core-theme-workshop').isVisible(), true);
    }
  }
  await host.getByRole('button', { name: '收起主题工坊', exact: true }).click();
  await page.reload(); await ready(); await position(); await settingsTab();
  assert.equal(await host.locator('#core-theme-workshop').isVisible(), false);
  await host.getByRole('button', { name: '展开主题工坊', exact: true }).click();
  await choose('core.black-gold');
  checks.push('主题工坊：三宽度浅深色折叠、键盘展开、切页与刷新保持状态且不改变配色');
  assert.equal(await host.locator('[data-theme-id]').count(), ids.length);
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].source), '插件市场 / 文件');
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.list().length), ids.length);
  checks.push('独立发布包经真实文件选择器导入；仅安装 themes；未改变默认主题');

  for (const width of [248, 280, 420]) {
    await host.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
    for (const id of ids) {
      await choose(id);
      assert.equal(await host.locator('.content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `${id}: no overflow at ${width}px`);
      assert.equal(await host.locator('[data-theme-id]').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), true, `${id}: cards fit at ${width}px`);
    }
    await shot(`gallery-${width}`);
  }
  await host.evaluate(node => { node.style.width = '280px'; });
  for (const id of ids) {
    await choose(id);
    const scheme = THEMES.find(theme => theme.id === id)?.tokens.scheme || 'dark';
    assert.equal(await host.evaluate(node => getComputedStyle(node).colorScheme), scheme);
    await shot(`theme-${id.split('.').pop()}`);
    if (scheme === 'light') {
      await host.locator(`[data-theme-id="${id}"]`).scrollIntoViewIfNeeded();
      const file = path.join(output, `light-cards-${id.split('.').pop()}.png`);
      await host.screenshot({ path: file }); captures.push(file);
      await marketTab(); await shot(`light-market-${id.split('.').pop()}`); await settingsTab();
    }
  }
  checks.push('三套浅色主题使用 light 色系；设置、插件运行状态和原生表单随配色更新，切回深色不残留');
  const silverPreview = await host.locator('[data-theme-id="themes.silver"] .theme-preview').evaluate(node => getComputedStyle(node).backgroundImage);
  await choose('themes.jade');
  assert.equal(await host.locator('[data-theme-id="themes.silver"] .theme-preview').evaluate(node => getComputedStyle(node).backgroundImage), silverPreview, 'previews keep their own palette');
  await host.evaluate(node => { node.style.width = '248px'; });
  const longCard = host.locator('[data-theme-id="themes.jade"]');
  const originals = await longCard.evaluate(node => {
    const name = node.querySelector('.theme-name'), description = node.querySelector('.theme-description');
    const original = { name: name.textContent, description: description.textContent, title: node.title };
    name.textContent = '青瓷主题标题超长时仍然可读'; description.textContent = '这是一段较长的主题说明，用来确认窄面板不会被内容撑宽。';
    node.title = `${name.textContent} · ${description.textContent}`; return original;
  });
  assert.equal(await longCard.evaluate(node => node.scrollWidth <= node.clientWidth), true);
  assert.equal(await longCard.locator('.theme-name,.theme-description').evaluateAll(nodes => nodes.every(node => node.scrollWidth > node.clientWidth && getComputedStyle(node).textOverflow === 'ellipsis')), true);
  await shot('long-text-248');
  await longCard.evaluate((node, original) => { node.querySelector('.theme-name').textContent = original.name; node.querySelector('.theme-description').textContent = original.description; node.title = original.title; }, originals);
  await host.evaluate(node => { node.style.width = '280px'; });
  await host.locator('[data-theme-id="themes.blue"]').focus(); await page.keyboard.press('Space');
  assert.equal(await current(), 'themes.blue');
  await host.locator('[data-theme-id="themes.violet"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await current(), 'themes.violet');
  checks.push('九主题在 248/280/420px 无横向溢出；预览独立配色；Enter/Space 切换与单一选中态');

  await settingsTab();
  assert.equal(await host.locator('[data-theme-id="themes.violet"]').getAttribute('aria-pressed'), 'true');
  await choose('themes.jade');
  await host.locator('.management-tabs').getByRole('button', { name: '设置', exact: true }).click();
  const jadeSwitch = await host.locator('input.sgs-switch').first().evaluate(node => getComputedStyle(node).backgroundImage);
  await shot('settings-jade');
  await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.select('themes.blue'));
  await settingsTab();
  assert.equal(await host.locator('[data-theme-id="themes.blue"]').getAttribute('aria-pressed'), 'true', 'settings follows API selection');
  await host.locator('.management-tabs').getByRole('button', { name: '设置', exact: true }).click();
  const blueSwitch = await host.locator('input.sgs-switch').first().evaluate(node => getComputedStyle(node).backgroundImage);
  assert.notEqual(blueSwitch, jadeSwitch, 'shared switches follow palette');
  assert.equal(await host.locator('input[type=checkbox]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).appearance === 'none' && node.getAttribute('role') === 'switch')), true);
  await shot('settings-blue');
  for (const category of ['game', 'automation', 'tools', 'info']) {
    await host.locator(`[data-category=${category}]`).click();
    assert.equal(await host.locator('[data-plugin-group=themes]').count(), 0);
    assert.equal(await host.locator('[data-theme-workshop]').count(), 0);
  }
  await settingsTab();
  assert.equal(await host.locator('[data-plugin-group=themes]').count(), 0);

  checks.push('主题工坊仅在核心设置出现，主题包无分类面板；设置随 API 同步，公共滑轨配色跟随');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await host.locator('[data-theme-id]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transitionDuration.split(',').every(value => parseFloat(value) === 0))), true);
  await page.setViewportSize({ width: 900, height: 420 }); await position();
  await choose('themes.silver');
  assert.equal(await host.locator('.content').evaluate(node => node.scrollHeight > node.clientHeight), true);
  assert.equal(await host.locator('[data-theme-id="themes.silver"]').isVisible(), true);
  await shot('low-height');
  await page.setViewportSize({ width: 1100, height: 1050 }); await position();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('减少动画偏好生效；低高度内容可滚动且最末主题可操作');

  const compactBackgrounds = new Set();
  for (const id of ids) {
    await choose(id); await host.getByRole('button', { name: '折叠面板', exact: true }).click();
    const base = await host.locator('.shell').evaluate(node => getComputedStyle(node).backgroundImage);
    compactBackgrounds.add(base);
    for (const [backdrop, color] of [['dark', '#111614'], ['light', '#ece9e1']]) {
      await page.evaluate(color => { document.body.style.background = color; document.documentElement.style.background = color; }, color);
      const file = path.join(output, `compact-${id.split('.').pop()}-${backdrop}.png`);
      await page.screenshot({ path: file, clip: { x: 14, y: 4, width: 190, height: 74 } }); captures.push(file);
    }
    const positions = [];
    for (const value of [0, 1, 12, 999, Infinity, null]) {
      positions.push(await page.evaluate(value => {
        const shell = window[Symbol.for('sgs.ol.toolbox.core')].shell;
        shell.setRemainingSlash(value === 'infinity' ? Infinity : value);
        const root = shell.host.shadowRoot, button = root.querySelector('[data-expand]').getBoundingClientRect();
        return [button.x, button.y, button.width, button.height];
      }, value === Infinity ? 'infinity' : value));
    }
    assert.ok(positions.every(rect => JSON.stringify(rect) === JSON.stringify(positions[0])), 'compact actions do not jump with counts');
    await host.getByRole('button', { name: '放大面板', exact: true }).click();
  }
  assert.equal(compactBackgrounds.size, ids.length, 'every collapsed theme uses its own palette');
  checks.push('九套收起栏浅/深背景截图；0/多位数/无限/未知时按钮位置稳定');

  await choose('themes.violet');
  await marketTab();
  await host.locator('[data-plugin-id=themes]').getByRole('button', { name: '停用', exact: true }).click();
  await page.waitForFunction(() => !window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].active);
  assert.equal(await current(), 'core.black-gold'); assert.equal(await saved(), 'themes.violet');
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.list().length), 1);
  await page.reload(); await ready(); await position();
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].enabled), false);
  assert.equal(await current(), 'core.black-gold');
  await marketTab();
  await host.locator('[data-plugin-id=themes]').getByRole('button', { name: '启用', exact: true }).click();
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.current.id === 'themes.violet');
  await host.locator('[data-plugin-id=themes]').getByRole('button', { name: '重载', exact: true }).click();
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].active);
  assert.equal(await current(), 'themes.violet');
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.list().length), ids.length);
  await settingsTab(); assert.equal(await host.locator('[data-theme-id]').count(), ids.length);
  await page.reload(); await ready(); await position();
  assert.equal(await current(), 'themes.violet', 'selected theme survives page reload');
  await marketTab();
  await host.locator('[data-plugin-id=themes]').getByRole('button', { name: '卸载', exact: true }).click();
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().length === 0);
  assert.equal(await current(), 'core.black-gold');
  await settingsTab(); assert.equal(await host.locator('[data-theme-id]').count(), 1);
  assert.equal(await host.locator('[data-theme-workshop]').count(), 1, 'core workshop survives uninstall');
  await page.reload(); await ready(); assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().length), 0);
  await importFile(); assert.equal(await current(), 'themes.violet');
  await settingsTab(); assert.equal(await host.locator('[data-theme-id="themes.violet"]').getAttribute('aria-pressed'), 'true');
  checks.push('停用/卸载撤销主题并回退玄金；停用与卸载跨刷新保留；启用/重载/重装恢复原选择且无重复注册');
  await api(() => {
    const registry = window[Symbol.for('sgs.ol.toolbox.core')].themes;
    window.removeDemoTheme = registry.register({ id: 'developer.preview', name: '开发者主题', description: '独立注册，无需主题包加载器', tokens: { accent: '#abcdef' } }, 'developer');
  });
  assert.equal(await host.locator('[data-theme-id]').count(), ids.length + 1);
  await choose('developer.preview'); await shot('developer-theme');
  await api(() => window.removeDemoTheme());
  assert.equal(await current(), 'core.black-gold');
  assert.equal(await host.locator('[data-theme-id]').count(), ids.length);
  checks.push('第三方主题经内核注册接口即时出现在设置，支持选择、撤销和回退');


  // Exercise the same palette across the combined toolbox and the separate card HUD shadow root.
  await page.goto(`${market.url}/dev/index.html`); await ready(); await position();
  assert.equal(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].version), expectedCoreVersion);
  assert.ok(await api(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().filter(item => item.active).length >= 5));
  // Keep the toolbox clear of the fixture's native game controls.
  await host.evaluate(node => { node.style.left = '700px'; });
  await page.getByRole('button', { name: '新开一局', exact: true }).click();
  await position();
  const cardOverlay = page.locator('[data-sgs-toolbox=cards]');
  await cardOverlay.locator('.sgs-card-hud-actions').waitFor({ state: 'visible' });
  const goldHud = await cardOverlay.locator('.sgs-card-hud-actions').evaluate(node => getComputedStyle(node).backgroundImage);
  await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.select('themes.blue'));
  await page.waitForFunction(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], overlay = document.querySelector('[data-sgs-toolbox=cards]');
    return getComputedStyle(overlay).getPropertyValue('--sgs-accent').trim() === api.themes.current.tokens.accent;
  });
  const blueHud = await cardOverlay.locator('.sgs-card-hud-actions').evaluate(node => getComputedStyle(node).backgroundImage);
  assert.notEqual(blueHud, goldHud, 'card HUD uses the selected palette');
  assert.equal(await cardOverlay.locator('.sgs-card-hud').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  const hudFile = path.join(output, 'combined-blue-card-hud.png');
  await cardOverlay.locator('.sgs-card-hud').screenshot({ path: hudFile }); captures.push(hudFile);
  for (const category of ['game', 'automation', 'tools']) {
    await host.locator(`[data-category=${category}]`).click();
    if (category === 'game') {
      await host.locator('.sgs-card-query-section>summary').click();
      await host.locator('.sgs-card-settings>summary').click();
    }
    if (category === 'automation') assert.equal(await host.locator('[data-reward-option=excludeCoupon]').isDisabled(), true, 'combined demo has no signed-in account');
    if (category === 'tools') await host.locator('[data-effects-level]').fill('3');
    for (const width of [248, 280, 420]) {
      await host.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
      assert.equal(await host.locator('.content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `combined ${category} fits ${width}px`);
    }
    await host.evaluate(node => { node.style.width = '280px'; });
    const roots = { game: '.sgs-cards', automation: '[data-daily-rewards]', tools: '.sgs-effects' };
    const accent = await api(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.current.tokens.accent);
    assert.equal(await host.locator(roots[category]).first().evaluate(node => getComputedStyle(node).getPropertyValue('--sgs-accent').trim()), accent);
    assert.equal(await host.locator('input[type=checkbox]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).appearance === 'none')), true);
    await shot(`combined-blue-${category}`);
  }
  checks.push('综合演练：霁蓝下牌局/自动/工具在三宽度无横溢，公共控件与独立卡牌 HUD 跟随主题');
  for (const theme of THEMES.filter(theme => theme.tokens.scheme === 'light')) {
    await api(id => window[Symbol.for('sgs.ol.toolbox.core')].themes.select(id), theme.id);
    for (const category of ['game', 'automation', 'tools', 'info']) {
      await host.locator(`[data-category=${category}]`).click();
      for (const width of [248, 280, 420]) {
        await host.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
        assert.equal(await host.locator('.content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `${theme.id} ${category} fits ${width}px`);
      }
      await host.evaluate(node => { node.style.width = '280px'; });
      await shot(`combined-${theme.id.split('.').pop()}-${category}`);
    }
    assert.equal(await cardOverlay.evaluate(node => getComputedStyle(node).getPropertyValue('--sgs-bg').trim()), theme.tokens.bg);
  }
  checks.push('浅色综合演练：宣纸/晴岚/桃夭的牌局/自动/工具/信息三宽度检查及独立卡牌 HUD 同步');


  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ coreVersion: expectedCoreVersion, pluginVersion: release.version, checks, pageErrors: errors, screenshots: captures }, null, 2));
  console.log(`PASS: ${checks.length} theme browser checks; ${captures.length} screenshots; no page errors.\n${checks.join('\n')}`);
  await context.close();
} finally { await browser?.close(); await market.close(); }

