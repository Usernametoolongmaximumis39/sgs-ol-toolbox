import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';
const output = resolve('test-results/seckill-browser'); await mkdir(output, { recursive: true });
const server = await createMarketServer({ port: 0 }), errors = [], checks = [], screenshots = [];
let browser;
try {
  for (const channel of ['chrome', 'msedge', undefined]) { try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {} }
  assert.ok(browser, 'Chromium browser available');
  const context = await browser.newContext({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), base = resolve('release/market'), file = resolve(base, '.' + decodeURIComponent(url.pathname)), rel = relative(base, file);
    if (url.origin !== server.url || rel.startsWith('..') || !['.html', '.js', '.json', '.css', '.svg'].includes(extname(file))) return route.abort();
    try { await route.fulfill({ body: await readFile(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' })[extname(file)] }); }
    catch { await route.fulfill({ status: 404, body: 'not found' }); }
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${server.url}/dev/seckill.html`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  const host = page.locator('[data-sgs-toolbox="core"]'), root = host.locator('[data-seckill]');
  await host.locator('[data-category=automation]').click(); await root.waitFor();
  assert.deepEqual(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().map(p => p.id)), ['seckill']);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.length), 0);
  assert.equal(await root.getByRole('switch').isChecked(), false);
  await root.getByRole('button', { name: '绘卷毛笔：仅 3 支装', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await root.getByRole('button', { name: '绘卷毛笔：仅 3 支装', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.length), 0);
  await root.getByRole('switch').focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.requests.some(r => r[0] === 'buy'));
  const details = root.locator('details').first(); await details.locator('summary').click();
  await root.getByText('本场已抢到', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'buy').length), 1);
  await root.getByRole('textbox', { name: '自定义秒杀关键词' }).fill('超长自定义关键词用于窄面板换行检查龙珠'); await root.getByRole('button', { name: '添加关键词', exact: true }).click();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.rename());
  await root.getByRole('button', { name: '刷新秒杀列表', exact: true }).click();
  const themes = {
    dark: { bg: '#201e1a', surface: '#2c2922', raised: '#393329', text: '#eee3cc', muted: '#b7aa8c', accent: '#dbba70', border: '#665b42', danger: '#e57575', scheme: 'dark' },
    light: { bg: '#f4f0e6', surface: '#fffcf4', raised: '#e8dfcc', text: '#302b24', muted: '#706658', accent: '#8c6528', border: '#c6b897', danger: '#a83338', scheme: 'light' },
  };
  for (const [theme, tokens] of Object.entries(themes)) for (const width of [248, 280, 420]) {
    await host.evaluate((node, { width, tokens }) => { node.style.width = width + 'px'; node.style.top = '16px'; node.style.left = '24px'; node.style.right = 'auto';
      for (const [key, value] of Object.entries(tokens)) node.style.setProperty('--sgs-' + key, value); }, { width, tokens });
    await page.evaluate(theme => { document.body.style.background = theme === 'light' ? '#e9e4da' : '#172025'; }, theme);
    await page.waitForTimeout(120);
    assert.equal(await root.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, `${theme} ${width}px overflow`);
    assert.equal(await root.getByRole('switch').evaluate(node => getComputedStyle(node).appearance), 'none');
    const file = resolve(output, `${theme}-${width}.png`); await host.screenshot({ path: file }); screenshots.push(file);
  }
  checks.push('isolated plugin, default-off, keyboard selection/power, confirmed purchase, custom keyword, six themed width screenshots');
  // Unknown result remains pending across core reload and ordinary panel collapse.
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.result('unknown'));
  await root.getByRole('button', { name: '功勋：不限数量', exact: true }).click();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.advance(3100));
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'buy').length === 2);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.advance(1300));
  await root.getByText('结果未确认，等待库存核实', { exact: false }).first().waitFor();
  const count = await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'buy').length);
  const bundle = await bundlePlugin('seckill'), pkg = await makePluginPackage(bundle), upgrade = await makePluginPackage(bundle, bundle.manifest.version + '-local');
  await page.evaluate(async ({ pkg, upgrade }) => { const m = window[Symbol.for('sgs.ol.toolbox.core')].manager;
    await m.install(pkg); await m.disable('seckill'); await m.enable('seckill'); await m.reload('seckill'); await m.install(upgrade); await m.rollback('seckill'); }, { pkg, upgrade });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'buy').length), count);
  assert.equal(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].version), bundle.manifest.version);
  const subscriptions = await page.evaluate(() => Object.fromEntries(Object.entries(window.__SGS_TOOLBOX_DEMO__.proxy._events).map(([k, v]) => [k, v.length])));
  assert.equal(subscriptions.DbsCBuyShopogoodsRep, 1);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.switchAccount(42)); await page.waitForTimeout(400);
  assert.equal(await root.getByRole('switch').isChecked(), false); assert.equal(await root.getByRole('button', { name: '删除关键词 超长自定义关键词用于窄面板换行检查龙珠' }).count(), 0);
  await page.setViewportSize({ width: 900, height: 340 });
  const lowFile = resolve(output, 'low-height.png'); await host.screenshot({ path: lowFile }); screenshots.push(lowFile);
  await page.evaluate(async () => { const api = window[Symbol.for('sgs.ol.toolbox.core')]; await api.manager.uninstall('seckill'); });
  assert.equal(await root.count(), 0);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.proxy._events.DbsCBuyShopogoodsRep.length), 0);
  checks.push('pending debit survives install/disable/enable/reload/upgrade/rollback; subscriptions do not accumulate; account defaults off; uninstall cleans listeners');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ environment: 'offline Chrome synthetic game fixture; not official live gameplay', checks, screenshots, errors }, null, 2));
  console.log(JSON.stringify({ checks, screenshots, errors }, null, 2));
} catch (e) { console.error('Browser checks failed; page errors:', errors); throw e; }
finally { await browser?.close(); await server.close(); }
