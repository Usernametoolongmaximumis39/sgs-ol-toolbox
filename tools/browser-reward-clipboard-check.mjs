import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';

const codes = (await readFile(new URL('../tests/fixtures/reward-clipboard-short-codes.txt', import.meta.url), 'utf8')).trim();
const output = 'test-results/reward-clipboard';
await mkdir(output, { recursive: true });
const market = await createMarketServer({ port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== market.url) return route.abort();
    try { await route.fulfill({ body: await readFile(new URL('../release/market' + url.pathname, import.meta.url)), contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.json') ? 'application/json' : 'text/javascript' }); }
    catch { await route.abort(); }
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${market.url}/dev/round2.html?plugin=daily-rewards`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.list().some(p => p.active));
  await page.locator('[data-category=automation]').click();
  await page.evaluate(async text => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], settings = api.settings.namespace('daily-rewards');
    window.clipboardFixture = text; window.clipboardReadCount = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => { window.clipboardReadCount++; return window.clipboardFixture; } } });
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
    settings.set('account:41:last-clipboard', digest);
    settings.set('account:41:permanent-attempts', { ['code:' + encodeURIComponent('主播赴战局')]: { status: 'rejected' } });
    settings.set('account:41:options', { schemaVersion: 2, automatic: true, codes: true, clipboardCodes: true, serverCodes: false, shareCodes: false, sign: false, mail: false, tasks: false, welfare: false, activities: false });
    await api.manager.reload('daily-rewards');
  }, codes);
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.sent.length === 12);
  const expected = codes.split('\n').filter(code => code !== '主播赴战局');
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent), expected.map(code => ['兑换码', code]));
  await page.locator('[data-rewards-status]').filter({ hasText: '本轮完成，已确认领取 12 项' }).waitFor();
  await page.evaluate(async () => { await window[Symbol.for('sgs.ol.toolbox.core')].manager.reload('daily-rewards'); window.clipboardReadCount = 0; });
  await page.waitForFunction(() => window.clipboardReadCount >= 2);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent.length), 12, 'reload and identical clipboard must not resend');
  await page.evaluate(() => { window.clipboardFixture = '已确认0项\n说明：这行不是兑换码\n临战夺锋\n批量末尾口令'; window.clipboardReadCount = 0; });
  await page.waitForFunction(() => window.clipboardReadCount >= 2);
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.sent.length === 13);
  assert.deepEqual((await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent)).slice(12), [['兑换码', '批量末尾口令']], 'skip status/prose lines and already attempted keys, continue to a new final code');
  await page.evaluate(() => {
    const manager = Laya.ClassUtils.getClass('GiftManager');
    const send = manager.SendGetGift;
    manager.SendGetGift = function (...args) { window.releaseClipboardProbe = () => send.apply(this, args); };
    window.clipboardFixture = '进度展示口令';
  });
  await page.locator('[data-rewards-status]').filter({ hasText: '正在兑换 1/1：进度展示口令' }).waitFor();
  await page.locator('[data-daily-rewards]').screenshot({ path: `${output}/batch-progress.png` });
  await page.evaluate(() => window.releaseClipboardProbe());
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.sent.length === 14);
  assert.deepEqual(errors, []);
  await page.locator('[data-daily-rewards]').screenshot({ path: `${output}/short-codes.png` });
  await writeFile(`${output}/report.json`, JSON.stringify({ fixtureCodes: 13, previouslyAttempted: 1, simulatedClaims: 14, progressProbeClaims: 1, repeatedClaims: 0, skippedStatusAndProseLines: 2, validTrailingClaims: 1, realClipboardRead: false, officialGameClaims: false, errors }, null, 2));
  console.log('PASS: short phrases, parser upgrade, reload deduplication, skip invalid lines and process final valid code; no real clipboard or game access.');
} finally { await browser.close(); await market.close(); }
