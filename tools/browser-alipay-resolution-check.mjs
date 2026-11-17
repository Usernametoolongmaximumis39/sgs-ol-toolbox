import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'test-results/recharge-resolution'; await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export * from './src/shared/alipay-cashier.js';export {qrData} from './src/plugins/recharge/encoding.js';`, resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'Check', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage();
 await page.addInitScript({ content: bundle.outputFiles[0].text + ';window.Check=Check;Check.installAlipayCashierBridge(window);' });
 await page.route('https://web.sanguosha.com/**', r => r.fulfill({ contentType: 'text/html', body: '<body></body>' }));
 await page.route('https://openapi.alipay.com/gateway.do*', r => r.fulfill({ contentType: 'text/html', body: '<script>location.replace("https://excashier.alipay.com/standard/auth.htm?fixture=1")</script>' }));
 await page.route('https://excashier.alipay.com/standard/auth.htm*', r => r.fulfill({ contentType: 'text/html', body: '<input id="J_qrCode" type="hidden" value="https://qr.alipay.com/finalfixture">' }));
 await page.goto('https://web.sanguosha.com/test');
 const privileged = await page.evaluate(async () => {
   const NativeDOMParser = window.DOMParser;
   window.DOMParser = class { parseFromString() { return { gameXMLParser: true }; } };
   let options;
   const request = value => { options = value; queueMicrotask(() => value.onload({ status: 200, finalUrl: 'https://excashier.alipay.com/standard/auth.htm', responseText: '<input id="J_qrCode" value="https://qr.alipay.com/privilegedfixture"><script>window.badCashierScript=true</script>' })); return { abort() {} }; };
   const url = await Check.resolveAlipayCashier(window, 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay', new AbortController().signal, request);
   window.DOMParser = NativeDOMParser;
   return { url, method: options.method, anonymous: options.anonymous, frames: document.querySelectorAll('iframe').length, scriptExecuted: !!window.badCashierScript };
 });
 assert.deepEqual(privileged, { url: 'https://qr.alipay.com/privilegedfixture', method: 'GET', anonymous: true, frames: 0, scriptExecuted: false });
 assert.equal(await page.evaluate(async () => {
   try { await Check.resolveAlipayCashier(window, 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay', new AbortController().signal, options => { queueMicrotask(() => options.onload({status:200,finalUrl:'https://evil.example/',responseText:'<input id="J_qrCode" value="https://qr.alipay.com/forged">'})); return {abort(){}}; }); return false; } catch { return true; }
 }), true);
 assert.deepEqual(await page.evaluate(async () => {
   let aborted = false; const controller = new AbortController();
   const promise = Check.resolveAlipayCashier(window, 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay', controller.signal, () => ({abort(){aborted=true;}})).catch(e=>e.message);
   controller.abort(); return { message: await promise, aborted };
 }), { message: '解析已取消', aborted: true });
 const result = await page.evaluate(async () => {
   const controller = new AbortController();
   const url = await Check.resolveAlipayCashier(window, 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay', controller.signal);
   const image = document.createElement('img'); image.alt = '支付宝最终付款二维码'; image.src = Check.qrData(url); document.body.append(image);
   return { url, frames: document.querySelectorAll('iframe').length };
 });
 assert.equal(result.url, 'https://qr.alipay.com/finalfixture'); assert.equal(result.frames, 0);
 await page.screenshot({ path: out + '/final-qr.png' });
 // Verify the actual gateway HTML from the user's screenshot, without executing
 // its scripts, displaying its order, or making another payment request.
 let captured = false;
 try {
   const html = await readFile('test-results/recharge-native/user-cashier.html', 'utf8');
   assert.equal(await page.evaluate(html => new URL(Check.readAlipayCashier(new DOMParser().parseFromString(html, 'text/html'))).hostname, html), 'qr.alipay.com'); captured = true;
 } catch (error) { if (error.code !== 'ENOENT') throw error; }
 assert.equal(await page.evaluate(async () => { const c = new AbortController(); const p = Check.resolveAlipayCashier(window, 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay', c.signal).catch(e => e.message); c.abort(); return await p; }), '解析已取消');
 assert.equal(await page.locator('iframe').count(), 0);
 assert.equal(await page.evaluate(async () => { try { await Check.resolveAlipayCashier(window, 'https://evil.example/gateway.do', new AbortController().signal); return false; } catch { return true; } }), true);
 await writeFile(out + '/report.json', JSON.stringify({ passed: true, capturedGatewayParsed: captured, checks: ['cross-origin sandboxed iframe handshake', 'final QR extracted rather than gateway encoded', 'source/origin/nonce matching', 'abort removes frame', 'reject unknown domain'] }, null, 2));
 console.log('Alipay resolution browser checks passed.');
} finally { await browser.close(); }
