import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const out = 'test-results/recharge-tm'; await mkdir(out, { recursive: true });
const extension = process.env.SGS_TAMPERMONKEY_EXTENSION || process.env.LOCALAPPDATA + '/Google/Chrome/User Data/Default/Extensions/dhdgffkkebhmkfjojejmpbldmpobfkfo/5.5.1_0';
const context = await chromium.launchPersistentContext(out + '/profile', { channel: 'chromium', headless: true, args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
try {
 const settings = await context.newPage();
 await settings.goto('chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo');
 const toggle = settings.locator('#allow-user-scripts cr-toggle');
 await toggle.waitFor(); if (!await toggle.evaluate(e => e.checked)) await toggle.click();
 await settings.goto('chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html');
 await settings.getByText('实用工具', { exact: true }).click();
 const pending = context.waitForEvent('page');
 await settings.locator('input[type=file]').setInputFiles('release/dev/toolbox.user.js');
 const ask = await pending; await ask.waitForLoadState();
 await ask.locator('input[type=button].install').first().click();
 await settings.waitForTimeout(1500);
 const page = await context.newPage(), errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.route('https://web.sanguosha.com/tm-recharge-check', r => r.fulfill({ contentType: 'text/html', body: '<body></body>' }));
 await page.goto('https://web.sanguosha.com/tm-recharge-check');
 await page.waitForFunction(() => !!window[Symbol.for('sgs.ol.toolbox.core')]?.manager, null, { timeout: 20000 });
 const core = await page.evaluate(() => {
   const api = window[Symbol.for('sgs.ol.toolbox.core')];
   return { version: api.version, hasResolver: typeof api.manager.context.payments.resolveAlipayCashier === 'function', plugins: api.manager.slots.size, managerErrors: api.manager.errors.length, failedPlugins: [...api.manager.slots.values()].filter(slot=>slot.error).length };
 });
 assert.equal(core.version, process.env.SGS_EXPECT_CORE || '0.6.74'); assert.equal(core.hasResolver, true);
 assert.equal(core.managerErrors, 0); assert.equal(core.failedPlugins, 0);
 // Reuse the user's already-created order from the original attached screenshot;
 // no order POST, QR address logging, payment or user-profile mutation.
 let live = null;
 if (process.env.SGS_RECHARGE_QR_SCREENSHOT) {
   const gateway = execFileSync('python', ['-c', 'import sys,zxingcpp;from PIL import Image;print(zxingcpp.read_barcodes(Image.open(sys.argv[1]))[0].text)', process.env.SGS_RECHARGE_QR_SCREENSHOT], { encoding: 'utf8' }).trim();
   live = await page.evaluate(async url => {
     // Reproduce the game/other-script XML parser override observed through the
     // missing Document.querySelector failure, before exercising actual GM I/O.
     window.DOMParser = class { parseFromString() { return { gameXMLParser: true }; } };
     try {
       const api = window[Symbol.for('sgs.ol.toolbox.core')];
       const final = await api.manager.context.payments.resolveAlipayCashier(url, new AbortController().signal);
       return { passed: true, finalHost: new URL(final).hostname, frames: document.querySelectorAll('iframe').length };
     } catch (e) { return { passed: false, error: e.message }; }
   }, gateway);
   assert.equal(live.passed, true, JSON.stringify(live)); assert.equal(live.finalHost, 'qr.alipay.com'); assert.equal(live.frames, 0);
 }
 await writeFile(out + '/report.json', JSON.stringify({ passed: true, tampermonkey: JSON.parse(await readFile(extension + '/manifest.json', 'utf8')).version, core, live, errors, profile: 'isolated regression profile; user browser untouched', injection: 'actual installed userscript, no addInitScript or addScriptTag' }, null, 2));
 console.log('Actual Tampermonkey userscript check passed:', JSON.stringify({ core, live }));
} finally { await context.close(); }
