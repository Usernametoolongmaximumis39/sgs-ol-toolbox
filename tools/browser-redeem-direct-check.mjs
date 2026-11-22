import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const out = 'test-results/redeem-direct';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--host-resolver-rules=MAP redeem.3gs.xyz 122.51.94.75', '--no-proxy-server'] });
try {
  const page = await browser.newPage();
  await page.route('https://web.sanguosha.com/__redeem_probe', route => route.fulfill({ contentType: 'text/html', body: '<title>Redeem HTTPS probe</title>' }));
  await page.route('https://web.sanguosha.com/code-sources.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readFile('src/plugins/daily-rewards/code-sources.js', 'utf8') }));
  await page.route('https://web.sanguosha.com/codes.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readFile('src/plugins/daily-rewards/codes.js', 'utf8') }));
  await page.route('https://web.sanguosha.com/shared/safe-read.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readFile('src/shared/safe-read.js', 'utf8') }));
  // Public list is live. Registration/report writes are simulated to avoid fake production successes.
  const reports = [];
  await page.route('https://redeem.3gs.xyz/register', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://web.sanguosha.com' }, body: JSON.stringify({ ok: true, token: 'a'.repeat(64) }) }));
  await page.route('https://redeem.3gs.xyz/reward-codes/share', route => {
    reports.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://web.sanguosha.com' }, body: '{"ok":true,"accepted":true}' });
  });
  await page.goto('https://web.sanguosha.com/__redeem_probe');
  const result = await page.evaluate(async () => {
    const { createCodeSources } = await import('/code-sources.js');
    const source = createCodeSources(window, { core: { distribution: 'dev' } });
    const text = await source.readServer(source.defaultUrl);
    const preflight = await fetch(source.defaultUrl + '/health', { method: 'OPTIONS' });
    const shared = await source.shareCode(source.defaultUrl, '演练成功口令', { account: 'synthetic-account' });
    return { url: source.defaultUrl, textLength: text.length, community: source.communityConfirmations, preflight: preflight.status, shared };
  });
  assert.equal(result.url, 'https://redeem.3gs.xyz');
  assert.equal(result.community, true);
  assert.equal(result.preflight, 204);
  assert.equal(result.shared, true);
  assert.equal(reports.length, 1);
  assert.match(reports[0].account, /^[a-f0-9]{64}$/);
  await writeFile(out + '/browser.json', JSON.stringify({ ...result, live: 'Trusted HTTPS list and CORS; simulated registration and success report; no production report written' }, null, 2));
  console.log('PASS: Chrome trusted HTTPS + cross-origin list, simulated direct success with persistent browser identity');
} finally { await browser.close(); }
