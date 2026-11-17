import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';
const out = 'test-results/recharge-native'; await mkdir(out, { recursive: true });
const source = await readFile('test-results/reference/client-static/sgsGame_a.js', 'utf8');
const start = source.indexOf('class Hos '), end = source.indexOf('class ', start + 10), body = source.slice(start, end);
const flatStart=source.indexOf('class EO '),flatEnd=source.indexOf('class ',flatStart+8),flat=source.slice(flatStart,flatEnd);
const flatMethods=['renderX','renderY','renderScaleX','renderScaleY'].map(name=>{const start=flat.indexOf('get '+name+'(){'),end=flat.indexOf('}',start);assert.ok(start>=0);return flat.slice(start,end+1);}).join('');
const method = body.slice(body.indexOf('onOKClick(){'), body.indexOf('onPaySuccess(){'));
assert.ok(method.includes('PaySDK.RechargePay') && method.includes('showQRView'));
const bundle = await build({ stdin: { contents: `export {installAlipayCashierBridge,resolveAlipayCashier} from './src/shared/alipay-cashier.js';export {qrData} from './src/plugins/recharge/encoding.js';export {installNativeRecharge} from './src/plugins/recharge/native-recharge.js';export {ResourceScope} from './src/core/resources.js';`, resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'Check', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://web.sanguosha.com/**', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }));
  await page.addInitScript({content:bundle.outputFiles[0].text+';window.Check=Check;Check.installAlipayCashierBridge(window);'});
  await page.route('https://openapi.alipay.com/gateway.do*', r=>r.fulfill({contentType:'text/html',body:'<input id="J_qrCode" value="https://qr.alipay.com/finalfixture">'}));
  await page.goto('https://web.sanguosha.com/220/h5_2/index.php');
  await page.addScriptTag({ path: resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(({method,flatMethods}) => {
    Laya.init(900, 900); window.calls = []; window.originalCalls = 0; window.enabled = false; window.self = { ClientId: 1234567890, Nickname: '演练账号' };
    localStorage.setItem('LastUserName', 'fixture-account');
    const onOKClick = new Function('V2t', 'QJt', 'return ({' + method + '}).onOKClick')({ IsPcWebUseSDK: true }, { I: () => ({ PaySDK: { RechargePay() { originalCalls++; } } }) });
    window.RechargeWindow = class extends Laya.Sprite {};
    RechargeWindow.prototype.onOKClick = onOKClick;
    window.owner = new RechargeWindow(); owner.isOfficial = true; owner.rmb = 6; owner.items = [{ RMB: 6 }, { RMB: 1228 }]; owner.isZfb = true;
    owner.pos(10,120);owner.size(879,565);owner.graphics.drawRect(0,0,879,565,'#f2e4be');owner.contentSprite=new Laya.Sprite();owner.addChild(owner.contentSprite);const FlatButton=new Function('Laya','return class extends Laya.EventDispatcher {'+flatMethods+'}')(Laya);owner.okBtn = new FlatButton();Object.assign(owner.okBtn,{x:619,y:443,width:176,height:54,_scaleX:1,_scaleY:1,render:owner.contentSprite,visible:true});owner.contentSprite.graphics.drawRect(619,443,176,54,'#9e281a');const title=new Laya.Text();title.text='立即充值';title.fontSize=22;title.color='#fff1c9';title.pos(659,456);owner.contentSprite.addChild(title); owner.okBtn.on('click', owner, owner.onOKClick); Laya.stage.addChild(owner);
    window.click = () => owner.okBtn.event('click');
    window.scope = new Check.ResourceScope();
    window.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ code: 0, data: { code_url: url.includes('wechat') ? 'data:image/png;base64,aGVsbG8=' : 'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay' } }) }; };
    window.integration = Check.installNativeRecharge({ window, document, scope, notify: text => { (window.notifications ||= []).push(text); }, payments: {resolveAlipayCashier: (url,signal) => window.resolveFinal ? window.resolveFinal(url,signal) : Check.resolveAlipayCashier(window,url,signal)}, game: { getSelf: () => self, getClass: () => RechargeWindow } }, () => enabled, value=>{enabled=value;});
  }, {method,flatMethods});
  assert.equal(await page.evaluate(()=>typeof owner.okBtn.localToGlobal),'undefined');
  await page.evaluate(()=>{const decoy=document.createElement('canvas');decoy.style.display='none';document.body.prepend(decoy);integration.refresh();});
  await page.evaluate(() => click()); assert.equal(await page.evaluate(() => originalCalls), 1);
  const entry=page.locator('[data-sgs-recharge-entry]');
  assert.equal(await entry.getByRole('textbox',{name:'自定义元宝数量'}).isDisabled(),true);
  await entry.getByRole('switch',{name:'启用95折'}).check();
  const geometry=await entry.evaluate(el=>el.getBoundingClientRect().toJSON());
  const buttonX=await page.evaluate(()=>owner.okBtn.render.localToGlobal(new Laya.Point(owner.okBtn.renderX,owner.okBtn.renderY)).x);assert.ok(geometry.right<buttonX);
  assert.equal(await entry.getByRole('textbox',{name:'自定义元宝数量'}).isDisabled(),false);
  await page.waitForTimeout(200);
  await page.screenshot({path:out+'/entry-left-of-recharge.png'});
  for(const offset of [-2,-1,0,2])for(const scale of [.75,1,1.2]){
    await page.evaluate(({offset,scale})=>{let core=document.querySelector('[data-sgs-toolbox=core]');if(!core){core=document.createElement('div');core.dataset.sgsToolbox='core';document.body.append(core);}core.style.setProperty('--sgs-font-offset',offset+'px');owner.scale(scale,scale);integration.refresh();},{offset,scale});
    assert.ok(await entry.evaluate(el=>el.scrollWidth<=el.clientWidth));
    const g=await entry.boundingBox();const x=await page.evaluate(()=>owner.okBtn.render.localToGlobal(new Laya.Point(owner.okBtn.renderX,owner.okBtn.renderY)).x);assert.ok(g.x+g.width<x);
  }
  await page.evaluate(()=>{owner.scale(1,1);document.querySelector('[data-sgs-toolbox=core]').style.setProperty('--sgs-font-offset','0px');integration.refresh();});
  await page.evaluate(() => click());
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  assert.equal(await page.evaluate(() => calls.length), 0);
  for (const size of [11, 12, 14, 16]) for (const width of [248, 280, 420]) {
    await dialog.evaluate((el, { size, width }) => { el.style.width = width + 'px'; el.style.fontSize = size + 'px'; }, { size, width });
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  }
  await dialog.screenshot({ path: out + '/cashier.png' });
  await page.getByRole('button', { name: '微信支付', exact: true }).click();
  await page.getByRole('button', { name: '确认并生成95折二维码' }).click();
  await page.getByAltText('微信付款二维码').waitFor();
  const call = await page.evaluate(() => calls[0]); assert.ok(call.url.endsWith('/wechat/qrcode/order/create')); assert.equal(call.body.user_id, '1234567890'); assert.equal(call.body.yb, 600);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => { owner.rmb = 1228; click(); });
  await page.getByRole('button', { name: '确认并生成95折二维码' }).click();
  await page.getByAltText('支付宝最终付款二维码').waitFor();
  assert.equal(await page.getByAltText('支付宝最终付款二维码').getAttribute('src'),await page.evaluate(()=>Check.qrData('https://qr.alipay.com/finalfixture')));
  await dialog.screenshot({path:out+'/alipay-final.png'});
  assert.equal(await page.evaluate(() => calls[1].body.yb), 122800); assert.ok((await page.evaluate(() => calls[1].url)).endsWith('/alipay/qrcode/order/create'));
  await page.keyboard.press('Escape');
  await entry.getByRole('textbox',{name:'自定义元宝数量'}).fill('12345');
  await page.evaluate(()=>click());
  assert.ok((await dialog.innerText()).includes('12345 元宝 · 原价 123.45 元'));
  await page.getByRole('button',{name:'确认并生成95折二维码'}).click();await page.getByAltText('支付宝最终付款二维码').waitFor();
  assert.equal(await page.evaluate(()=>calls.at(-1).body.yb),12345);
  await page.keyboard.press('Escape');
  await entry.getByRole('textbox',{name:'自定义元宝数量'}).fill('0');
  assert.equal(await entry.getByRole('textbox',{name:'自定义元宝数量'}).getAttribute('aria-invalid'),'true');
  const beforeInvalid=await page.evaluate(()=>calls.length);await page.evaluate(()=>click());assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>calls.length),beforeInvalid);assert.ok((await page.evaluate(()=>notifications.at(-1))).includes('整数'));
  await entry.getByRole('textbox',{name:'自定义元宝数量'}).fill('');
  const ordersBeforeRetry = await page.evaluate(()=>calls.length);
  await page.evaluate(() => { window.parseAttempts=0;window.resolveFinal=async()=>{if(++parseAttempts===1)throw Error('模拟解析超时');return 'https://qr.alipay.com/retryfixture';};click();});
  await page.getByRole('button',{name:'确认并生成95折二维码'}).click();
  await page.getByRole('button',{name:'重试解析当前订单'}).waitFor();
  await dialog.screenshot({path:out+'/parse-retry.png'});
  assert.equal(await page.evaluate(()=>calls.length),ordersBeforeRetry+1);
  await page.getByRole('button',{name:'重试解析当前订单'}).click();
  await page.getByAltText('支付宝最终付款二维码').waitFor();
  assert.equal(await page.evaluate(()=>calls.length),ordersBeforeRetry+1);
  assert.equal(await page.evaluate(()=>parseAttempts),2);
  assert.equal(await page.getByAltText('支付宝最终付款二维码').getAttribute('src'),await page.evaluate(()=>Check.qrData('https://qr.alipay.com/retryfixture')));
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.resolveFinal=null;});
  await page.evaluate(() => { owner.isOfficial = false; click(); owner.isOfficial = true; owner.rmb = 99; click(); });
  assert.equal(await page.evaluate(() => originalCalls), 3); assert.equal(await dialog.count(), 0);
  await page.evaluate(() => { owner.rmb = 6; click(); self = { ClientId: 9876543210 }; integration.refresh(); }); assert.equal(await dialog.count(), 0);
  await page.evaluate(() => { click(); enabled = false; integration.refresh(); }); assert.equal(await dialog.count(), 0);
  await page.evaluate(() => {
    enabled = true;
    window.resolveOrder = null;
    window.fetch = () => new Promise(resolve => { resolveOrder = resolve; });
    click();
  });
  await page.getByRole('button', { name: '确认并生成95折二维码' }).click();
  await page.evaluate(() => {
    self = { ClientId: 1234567890 }; integration.refresh();
    resolveOrder({ ok: true, json: async () => ({ code: 0, data: { code_url: 'https://qr.alipay.com/stale' } }) });
  });
  await page.waitForTimeout(50); assert.equal(await dialog.count(), 0);
  await page.evaluate(() => {
    // Separate direct-purchase controls, even with the same amount, are untouched.
    window.directBuys = [];
    for (const name of ['月卡', '军典']) {
      const button = new Laya.Sprite(); button.on('click', { rmb: 6 }, () => directBuys.push(name)); Laya.stage.addChild(button); button.event('click');
    }
  });
  assert.deepEqual(await page.evaluate(() => directBuys), ['月卡', '军典']); assert.equal(await dialog.count(), 0);
  await entry.getByRole('textbox',{name:'自定义元宝数量'}).fill('12345');await entry.getByRole('switch',{name:'启用95折'}).uncheck();await page.evaluate(()=>click());assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>originalCalls),4);
  await page.evaluate(() => { scope.dispose(); click(); }); assert.equal(await page.evaluate(() => originalCalls), 5);assert.equal(await entry.count(),0);
  assert.deepEqual(errors, []);
  await writeFile(out + '/report.json', JSON.stringify({ passed: true, checks: ['real Laya click handler bound before install', 'original native onOKClick replay', 'default off', 'both channels', 'current ID and selected gear', 'unknown gear and non-official passthrough', 'account switch and disable close cashier', 'disposal restores original handler', 'four font sizes at 248/280/420px'], limitations: ['Official payment and settlement not exercised', 'Cashier is a toolbox replacement window; SDK cashier DOM is not modified'] }, null, 2));
  console.log('Native recharge browser checks passed.');
} finally { await browser.close(); }
