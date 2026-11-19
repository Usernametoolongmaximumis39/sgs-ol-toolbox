import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const output = 'test-results/daily-exchange'; await mkdir(output, { recursive:true });
const bundle = await build({ stdin:{contents:`export {createExchangeController} from './src/plugins/daily-rewards/exchange.js'; export {createExchangeUI} from './src/plugins/daily-rewards/exchange-ui.js'; export {ResourceScope} from './src/core/resources.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ExchangeCheck' });
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:900,height:620}});
 await page.setContent('<body style="margin:0;background:#20272b"></body>');
 await page.addScriptTag({path:process.env.SGS_LAYA_CORE||path.join(os.homedir(),'AppData/Local/Temp/sgsres/game/laya.core.min.js')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  Laya.init(900,620); Laya.stage.bgColor='#20272b';
  const scope=new ExchangeCheck.ResourceScope(), store=new Map(), sent=[];
  let clock=0; const rows=[{id:1001,name:'祈福灯',price:2500,bought:0,limit:7,period:1,owned:false,unlocked:true},{id:1002,name:'武将体验',price:500,bought:0,limit:1,period:1,owned:false,unlocked:true}];
  const snapshot={ready:true,currency:9030201,balance:6000,rows};
  const adapter={account:()=> '41',day:()=> '2026-11-17',snapshot:()=>snapshot,invalidate(){},buy:r=>sent.push(r)};
  const controller=ExchangeCheck.createExchangeController({adapter,settings:{get:(k,d)=>store.get(k)||d,set:(k,v)=>store.set(k,v)},now:()=>clock});
  const windowLayer = Laya.stage.addChild(new Laya.Sprite());
  const shopWindow = windowLayer.addChild(new Laya.Sprite());
  const shop=new Laya.Sprite(); shop.pos(100,90); shop.size(700,420); shop.graphics.drawRect(0,0,700,420,'#252420','#6d5e40',1); shop.itemList=[]; shop.ddzShopList=rows; shop.updateList=()=>{}; shopWindow.addChild(shop);
  for(let i=0;i<rows.length;i++) {
   const row=rows[i], item=new Laya.Sprite(); item.pos(35+i*330,80); item.size(300,220); item.graphics.drawRect(0,0,300,220,'#34312a','#6e6043',1);
   item.limitInfo={ItemID:row.id,MaxBuyType:1,MaxBuyCount:row.limit}; item.goodsinfo={name:row.name};
   const text=new Laya.Text(); text.text=`${row.name}\n\n${row.price} 地主豆\n每日限购 ${row.limit} 次`;text.fontSize=20;text.leading=10;text.color='#e4d5a0';text.pos(24,54);item.addChild(text);shop.addChild(item);shop.itemList.push(item);
  }
  const ctx={document,window,scope},ui=ExchangeCheck.createExchangeUI(ctx,controller,adapter);ui.refresh();
  const mask = new Laya.Sprite();
  mask.graphics.drawRect(0, 0, 900, 620, '#000000');
  mask.alpha = .35;
  const purchase = new Laya.Sprite();
  purchase.name = 'GuildShopExchangeWindow';
  purchase.pos(230, 115);
  purchase.graphics.drawRect(0, 0, 370, 340, '#332d23', '#b59b63', 2);
  const title = purchase.addChild(new Laya.Text());
  title.text = '兑换道具';
  title.fontSize = 24;
  title.color = '#f1d797';
  title.pos(135, 24);
  window.exchangeFixture={controller,ui,scope,snapshot,sent,shop,windowLayer,mask,purchase,advance:ms=>{clock+=ms;controller.tick();ui.refresh();}};
 });
 await page.waitForTimeout(150); await page.evaluate(()=>exchangeFixture.ui.refresh());
 const button=page.getByRole('checkbox',{name:'祈福灯自动兑换'});
 await button.click(); assert.equal(await button.getAttribute('aria-checked'),'true'); assert.match(await button.textContent(),/5秒/);
 await page.screenshot({path:`${output}/countdown.png`});
 await button.press('Space'); assert.equal(await button.getAttribute('aria-checked'),'false');
 await page.evaluate(()=>exchangeFixture.advance(6000)); assert.equal(await page.evaluate(()=>exchangeFixture.sent.length),0);
 await button.click(); await page.evaluate(()=>exchangeFixture.advance(5000));
 assert.equal(await page.evaluate(()=>exchangeFixture.sent[0].count),2);
 await page.evaluate(()=>{const f=exchangeFixture;f.snapshot.rows[0].bought=2;f.snapshot.balance=1000;f.controller.reply(1001,0);f.ui.refresh();});
 await page.screenshot({path:`${output}/selected-waiting.png`});
 const buttons = page.locator('[data-shop-auto-exchange] button');
 const firstButtonBounds = await button.boundingBox();
 const clickTarget = { x: firstButtonBounds.x + firstButtonBounds.width / 2, y: firstButtonBounds.y + firstButtonBounds.height / 2 };
 await page.evaluate(() => {
   const { windowLayer, mask, purchase } = exchangeFixture;
   windowLayer.addChild(mask);
   windowLayer.addChild(purchase);
   // Attempt an activation in the frame before the HTML controls are hidden.
   document.querySelector('[data-shop-auto-exchange] button').click();
 });
 await page.waitForFunction(() => [...document.querySelectorAll('[data-shop-auto-exchange] button')].every(button => button.hidden));
 assert.equal(await buttons.count(), 2);
 assert.equal(await buttons.nth(0).isVisible(), false);
 assert.equal(await buttons.nth(1).isVisible(), false);
 assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, clickTarget), 'CANVAS');
 await page.mouse.click(clickTarget.x, clickTarget.y);
 assert.equal(await page.evaluate(() => exchangeFixture.controller.selected(1001)), true);
 await page.screenshot({path:`${output}/purchase-modal.png`});
 await page.evaluate(() => { exchangeFixture.purchase.visible = false; exchangeFixture.mask.visible = false; });
 await button.waitFor({ state: 'visible' });
 await page.evaluate(() => { exchangeFixture.purchase.visible = true; exchangeFixture.mask.visible = true; exchangeFixture.ui.refresh(); });
 await buttons.nth(0).waitFor({ state: 'hidden' });
 await page.evaluate(() => { exchangeFixture.purchase.removeSelf(); exchangeFixture.mask.removeSelf(); });
 await button.waitFor({ state: 'visible' });
 assert.equal(await button.getAttribute('aria-checked'), 'true');
 await page.screenshot({path:`${output}/purchase-closed.png`});
 await page.evaluate(()=>exchangeFixture.advance(60000));assert.equal(await page.evaluate(()=>exchangeFixture.sent.length),1);
 await page.evaluate(async ()=>{exchangeFixture.shop.visible=false;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}); assert.equal(await button.isVisible(),false);
 await page.evaluate(async ()=>{exchangeFixture.shop.visible=true;exchangeFixture.shop.alpha=.8;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}); assert.equal(await button.isVisible(),false);
 await page.evaluate(()=>{exchangeFixture.shop.alpha=1;exchangeFixture.ui.refresh();});
 await page.evaluate(()=>{exchangeFixture.shop.visible=true;exchangeFixture.ui.refresh();exchangeFixture.scope.dispose();}); assert.equal(await page.locator('[data-shop-auto-exchange]').count(),0);
 await writeFile(`${output}/report.json`,JSON.stringify({passed:true,checks:['Laya item positioning','purchase modal hides controls and receives input','controls and selection restored on close','5 second countdown','keyboard cancel','6000 buys two','insufficient balance waits','hidden window cleanup','scope cleanup']},null,2));
 console.log('Exchange Laya/browser checks passed.');
} finally {await browser.close();}


