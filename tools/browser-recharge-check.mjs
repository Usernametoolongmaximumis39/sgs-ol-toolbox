import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';
const out='test-results/recharge';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:`export {qrData} from './src/plugins/recharge/encoding.js'; export {activate} from './src/plugins/recharge/index.js'; export {ResourceScope} from './src/core/resources.js';`,resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Check',write:false});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:900,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://web.sanguosha.com/**',route=>route.fulfill({body:'<body></body>',contentType:'text/html'}));
 await page.goto('https://web.sanguosha.com/dev/index.html');
 await page.setContent('<body><div id="panel"></div></body>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const setup=()=>{
  const panel=document.querySelector('#panel');window.calls=[];window.buys=[];window.self={ClientId:1234567890,NickName:'演练账号'};localStorage.setItem('LastUserName','fixture-account');
  const listeners=new Map();const buyer={WebDirectReq(id,n){buys.push([id,n]);}};
  const welfare={SendClientPrivilegeInfoReq(){queueMicrotask(()=>listeners.get('ClientPrivilegeInfoRep')?.({Protocol:{cards:[{cardType:2,cardId:12981201,payType:1,priceNum:1200},{cardType:3,cardId:12981501,payType:1,priceNum:2800}]}}));},SendClientPrivilegeDataReq(){queueMicrotask(()=>listeners.get('ClientPrivilegeDataRep')?.({Protocol:{code:0,datas:[{type:2,bActive:false},{type:3,bActive:false}]}}));}};
  const proxy={_events:{ClientPrivilegeInfoRep:{caller:welfare},ClientDirectPurchaseRep:{caller:buyer}},on(e,c,f){listeners.set(e,f);},off(e){listeners.delete(e)}};
  window.fetch=async (url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({code:0,data:{code_url:'https://ol-payment.sanguosha.com/cashier/fixture',order_id:'mock-order'}})};};
  window.scope=new Check.ResourceScope();window.mount=()=>Check.activate({window,document,scope,game:{getSelf:()=>self,getClass:()=>null,getServerProxy:()=>proxy},ui:{registerPanel(spec){window.cleanup=spec.render(panel);}}});mount();
 }; await page.evaluate(setup);
 assert.equal(await page.getByRole('button',{name:'200',exact:true}).count(),0);
 await page.getByRole('button',{name:'我已了解，本次登录不再提醒',exact:true}).click();
 assert.equal(await page.locator('.pay-risk-box').isVisible(),false);
 await page.evaluate(()=>{cleanup();mount();});assert.equal(await page.locator('.pay-risk-box').isVisible(),false);
 assert.equal(await page.locator('[data-sgs-recharge]').count(),1);assert.equal(await page.evaluate(()=>calls.length),0);
 await page.route('https://ol-payment.sanguosha.com/cashier/fixture',async route=>{const src=await page.evaluate(()=>Check.qrData('https://qr.alipay.com/mock-final'));await route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:white"><img style="position:absolute;left:0px;top:0px;width:170px;height:170px" src="'+src+'"></body>'});});
 await page.getByRole('button',{name:'支付宝出码',exact:true}).click();assert.equal(await page.evaluate(()=>calls.length),0);
 await page.locator('#panel').evaluate(p=>p.style.cssText='box-sizing:border-box;width:280px;padding:12px;background:#24241f;--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-bg:#191b1a;--sgs-surface:#252722;--sgs-raised:#30332b;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-danger:#f0a397');
 await page.screenshot({path:out+'/confirmation-polished-280.png',fullPage:true});
 await page.getByRole('button',{name:'确认并继续'}).click();await page.locator('iframe[title="支付宝最终付款码"]').waitFor();
 assert.ok(await page.locator('.pay-cashier').evaluate(e=>e.compareDocumentPosition([...document.querySelectorAll('h4')].find(x=>x.textContent==='旧周月卡')) & Node.DOCUMENT_POSITION_FOLLOWING));
 for(const width of [248,280,420]) {
 await page.locator('#panel').evaluate((p,width)=>p.style.cssText='box-sizing:border-box;width:'+width+'px;padding:12px;background:#24241f;--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-bg:#191b1a;--sgs-surface:#252722;--sgs-raised:#30332b;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-danger:#f0a397',width);
 await page.waitForTimeout(100);
 const geometry=await page.locator('.pay-cashier').evaluate(w=>{const a=w.getBoundingClientRect(),b=w.querySelector('.pay-cashier-viewport').getBoundingClientRect(),f=w.querySelector('iframe').getBoundingClientRect();return {left:b.left-a.left,right:a.right-b.right,top:b.top-a.top,bottom:a.bottom-b.bottom,frameLeft:f.left-b.left,frameTop:f.top-b.top};});
 assert.ok(geometry.left>=14);assert.ok(Math.abs(geometry.left-geometry.right)<1);assert.ok(Math.abs(geometry.top-geometry.bottom)<1);assert.equal(geometry.frameLeft,0);assert.equal(geometry.frameTop,0);
 assert.ok(await page.locator('#panel').evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.screenshot({path:out+'/cashier-above-cards-'+width+'.png',fullPage:true});
 }
assert.equal(await page.evaluate(()=>calls.length),1);
 await page.getByRole('button',{name:'旧周卡',exact:true}).click();await page.locator('.pay-confirm').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>buys.length),0);
 await page.getByRole('button',{name:'确认并继续'}).click();await page.waitForFunction(()=>buys.length===1);assert.deepEqual(await page.evaluate(()=>buys[0]),[12981201,1]);
 await page.getByRole('button',{name:'旧周卡',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('本次已打开过'));
 for(const scheme of ['dark','light'])for(const width of [248,280,420]){
 await page.evaluate(({scheme,width})=>{const p=document.querySelector('#panel');p.style.cssText=`width:${width}px;padding:12px;max-height:1100px;overflow:auto;--sgs-bg:${scheme==='dark'?'#191b1a':'#f3f0e8'};--sgs-surface:${scheme==='dark'?'#252722':'#fffcf5'};--sgs-raised:${scheme==='dark'?'#30332b':'#e7e2d7'};--sgs-text:${scheme==='dark'?'#eee3cc':'#302c25'};--sgs-muted:${scheme==='dark'?'#b7aa8c':'#6b6254'};--sgs-border:#7e7052;--sgs-accent:#b28c37;--sgs-danger:${scheme==='dark'?'#f0a397':'#a73528'};background:var(--sgs-bg);`;document.body.style.background=scheme==='dark'?'#151715':'#e7e7e7';},{scheme,width});
 assert.ok(await page.locator('#panel').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:`${out}/${scheme}-${width}.png`});
 }
 await page.getByRole('button',{name:'支付宝出码',exact:true}).click();await page.evaluate(()=>self={ClientId:9876543210,NickName:'另一个账号'});await page.waitForTimeout(1100);assert.equal(await page.locator('.pay-confirm').isVisible(),false);assert.equal(await page.locator('img,iframe').count(),0);assert.equal(await page.locator('.pay-risk-box').isVisible(),true);
 await page.evaluate(()=>{cleanup();mount();cleanup();scope.dispose();});assert.equal(await page.locator('[data-sgs-recharge]').count(),0);assert.deepEqual(errors,[]);
 await page.route('https://game.4399iw2.com/**',route=>route.fulfill({body:'<iframe src="https://web.sanguosha.com/partner-test" style="width:420px;height:1100px;border:0"></iframe>',contentType:'text/html'}));
 await page.route('https://web.sanguosha.com/partner-test',route=>route.fulfill({body:'<body><div id="panel"></div></body>',contentType:'text/html'}));
 await page.goto('https://game.4399iw2.com/game');const partner=page.frames().find(f=>f.url().includes('/partner-test'));assert.ok(partner);await partner.addScriptTag({content:bundle.outputFiles[0].text});await partner.evaluate(setup);
 assert.ok(await partner.getByText('当前服务器不是官服，95折充值已被禁用',{exact:true}).isVisible());
 for(const name of ['微信出码','支付宝出码'])assert.equal(await partner.getByRole('button',{name,exact:true,includeHidden:true}).isDisabled(),true);
 await partner.getByRole('button',{name:'旧月卡',exact:true}).click();await partner.locator('.pay-confirm').waitFor({state:'visible'});
 await partner.getByRole('button',{name:'确认并继续'}).click();await partner.waitForFunction(()=>buys.length===1);assert.deepEqual(await partner.evaluate(()=>buys[0]),[12981501,1]);
 assert.equal(await partner.evaluate(()=>calls.length),0);assert.equal(await partner.getByRole('button',{name:'支付宝出码',exact:true,includeHidden:true}).isDisabled(),true);
 await partner.locator('#panel').evaluate(p=>p.style.cssText='width:280px;padding:12px;background:#24241f;--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-bg:#191b1a;--sgs-surface:#252722;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-danger:#f0a397');
 assert.equal(await partner.getByRole('button',{name:'支付宝出码',exact:true,includeHidden:true}).isVisible(),false);

 await page.screenshot({path:out+'/non-official-280.png'});await partner.evaluate(()=>scope.dispose());
 await writeFile(`${out}/browser-report.json`,JSON.stringify({passed:true,errors,checks:['manual-only order creation','payment signature','fresh legacy quote and native direct purchase','repeat guard','account switch','248/280/420 dark/light no overflow','remount and disposal']},null,2));console.log('Recharge browser checks passed.');
}finally{await browser.close();}

