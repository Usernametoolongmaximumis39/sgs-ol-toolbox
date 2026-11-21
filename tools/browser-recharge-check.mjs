import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';
const out='test-results/recharge';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:`export {activate} from './src/plugins/recharge/index.js'; export {ResourceScope} from './src/core/resources.js';
  export {mountPluginUI} from './src/ui/plugin-ui.js';`,resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Check',write:false});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:900,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://web.sanguosha.com/**',route=>route.fulfill({body:'<body></body>',contentType:'text/html'}));
 await page.goto('https://web.sanguosha.com/dev/index.html');
 await page.setContent('<body><div id="panel"></div></body>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const setup=()=>{
  const panel=document.querySelector('#panel');window.calls=[];window.buys=[];window.fixtureAccount={ClientId:1234567890,NickName:'演练账号'};
  const listeners=new Map();const buyer={WebDirectReq(id,n){buys.push([id,n]);}};
  const welfare={SendClientPrivilegeInfoReq(){queueMicrotask(()=>listeners.get('ClientPrivilegeInfoRep')?.({Protocol:{cards:[{cardType:2,cardId:12981201,payType:1,priceNum:1200},{cardType:3,cardId:12981501,payType:1,priceNum:2800}]}}));},SendClientPrivilegeDataReq(){queueMicrotask(()=>listeners.get('ClientPrivilegeDataRep')?.({Protocol:{code:0,datas:[{type:2,bActive:false},{type:3,bActive:false}]}}));}};
  const proxy={_events:{ClientPrivilegeInfoRep:{caller:welfare},ClientDirectPurchaseRep:{caller:buyer}},on(e,c,f){listeners.set(e,f);},off(e){listeners.delete(e)}};
  window.fetch=async (...args)=>{calls.push(args);throw Error('Unexpected payment request');};
  window.scope=new Check.ResourceScope();window.mount=()=>{ const ctx={window,document,scope,game:{getSelf:()=>fixtureAccount,getClass:()=>null,getServerProxy:()=>proxy}};
    ctx.ui={...Check.mountPluginUI(ctx,()=>ctx),registerPanel(spec){window.cleanup=spec.render(panel);}};Check.activate(ctx); };mount();
 }; await page.evaluate(setup);
 for (const name of ['微信出码', '支付宝出码']) assert.equal(await page.getByRole('button',{name,exact:true,includeHidden:true}).count(),0);
 await page.getByRole('button',{name:'我已了解，本次登录不再提醒',exact:true}).click();
 assert.equal(await page.locator('.pay-risk-box').isVisible(),false);
 await page.evaluate(()=>{cleanup();mount();});assert.equal(await page.locator('.pay-risk-box').isVisible(),false);
 assert.equal(await page.locator('[data-sgs-recharge]').count(),1);assert.equal(await page.evaluate(()=>calls.length),0);
 await page.getByRole('button',{name:'旧周卡',exact:true}).click();await page.locator('.pay-confirm').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>buys.length),0);
 await page.getByRole('button',{name:'确认并继续'}).click();await page.waitForFunction(()=>buys.length===1);assert.deepEqual(await page.evaluate(()=>buys[0]),[12981201,1]);
 await page.getByRole('button',{name:'旧周卡',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('本次已打开过'));
 for(const scheme of ['dark','light'])for(const width of [248,280,420]){
 await page.evaluate(({scheme,width})=>{const p=document.querySelector('#panel');p.style.cssText=`width:${width}px;padding:12px;max-height:1100px;overflow:auto;--sgs-bg:${scheme==='dark'?'#191b1a':'#f3f0e8'};--sgs-surface:${scheme==='dark'?'#252722':'#fffcf5'};--sgs-raised:${scheme==='dark'?'#30332b':'#e7e2d7'};--sgs-text:${scheme==='dark'?'#eee3cc':'#302c25'};--sgs-muted:${scheme==='dark'?'#b7aa8c':'#6b6254'};--sgs-border:#7e7052;--sgs-accent:#b28c37;--sgs-danger:${scheme==='dark'?'#f0a397':'#a73528'};background:var(--sgs-bg);`;document.body.style.background=scheme==='dark'?'#151715':'#e7e7e7';},{scheme,width});
 assert.ok(await page.locator('#panel').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:`${out}/${scheme}-${width}.png`});
 }
 await page.getByRole('button',{name:'旧月卡',exact:true}).click();await page.locator('.pay-confirm').waitFor({state:'visible'});await page.evaluate(()=>fixtureAccount={ClientId:9876543210,NickName:'另一个账号'});await page.waitForTimeout(1100);assert.equal(await page.locator('.pay-confirm').isVisible(),false);assert.equal(await page.locator('img,iframe').count(),0);assert.equal(await page.locator('.pay-risk-box').isVisible(),true);
 await page.evaluate(()=>{cleanup();mount();cleanup();scope.dispose();});assert.equal(await page.locator('[data-sgs-recharge]').count(),0);assert.deepEqual(errors,[]);
 await page.route('https://game.4399iw2.com/**',route=>route.fulfill({body:'<iframe src="https://web.sanguosha.com/partner-test" style="width:420px;height:1100px;border:0"></iframe>',contentType:'text/html'}));
 await page.route('https://web.sanguosha.com/partner-test',route=>route.fulfill({body:'<body><div id="panel"></div></body>',contentType:'text/html'}));
 assert.equal(await page.evaluate(()=>calls.length),0);
 await page.goto('https://game.4399iw2.com/game');const partner=page.frames().find(f=>f.url().includes('/partner-test'));assert.ok(partner);await partner.addScriptTag({content:bundle.outputFiles[0].text});await partner.evaluate(setup);
 await partner.getByRole('button',{name:'旧月卡',exact:true}).click();await partner.locator('.pay-confirm').waitFor({state:'visible'});
 await partner.getByRole('button',{name:'确认并继续'}).click();await partner.waitForFunction(()=>buys.length===1);assert.deepEqual(await partner.evaluate(()=>buys[0]),[12981501,1]);
 assert.equal(await partner.evaluate(()=>calls.length),0);

 await partner.evaluate(()=>scope.dispose());assert.deepEqual(errors,[]);
 await writeFile(`${out}/browser-report.json`,JSON.stringify({passed:true,errors,checks:['no checkout controls or payment requests','fresh legacy quote and native direct purchase','repeat guard','account switch','248/280/420 dark/light no overflow','remount and disposal']},null,2));console.log('Legacy card browser checks passed.');
}finally{await browser.close();}

