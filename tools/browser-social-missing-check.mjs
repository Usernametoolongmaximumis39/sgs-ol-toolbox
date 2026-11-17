import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/social/missing';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export {renderHistory} from './src/plugins/social/index.js';export {ResourceScope} from './src/core/resources.js';export {mountPluginUI} from './src/ui/plugin-ui.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'Check'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:600,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<main style="box-sizing:border-box;padding:12px;max-height:280px;overflow:auto"></main>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  window.scope=new Check.ResourceScope();const ctx={scope,window,document};ctx.ui=Check.mountPluginUI(ctx,()=>ctx);
  Check.renderHistory(ctx,document.querySelector('main'),{getRecord:()=>({accountId:'1234567890',pins:[],changes:[],friends:{'0000000123':{name:'好友<甲>与很长的名字'.repeat(3),missingAt:1}}})});
 });
 for(const theme of ['dark','light'])for(const width of [248,280,420]){
  await page.evaluate(({theme,width})=>{const dark=theme==='dark',main=document.querySelector('main');main.style.width=width+'px';main.style.cssText+=`;--sgs-text:${dark?'#eee4ce':'#342c20'};--sgs-muted:${dark?'#b6ab91':'#655c4c'};--sgs-accent:${dark?'#d7b76c':'#7a591a'};--sgs-border:#746646;--sgs-raised:${dark?'#302d23':'#f1e9d8'};background:${dark?'#20211b':'#faf5ea'}`}, {theme,width});
  assert.match(await page.locator('main').textContent(),/ID：0000000123 · 可能你将其删除了或者被删除/);
  assert.equal(await page.locator('main img').count(),0);
  assert.ok(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:`${out}/${width}-${theme}.png`});
 }
 await page.locator('button').first().focus();assert.equal(await page.locator('button').first().evaluate(e=>e===document.activeElement),true);
 await page.evaluate(()=>scope.dispose());assert.equal(await page.locator('.sgs-social').count(),0);assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,widths:[248,280,420],themes:['dark','light'],limitations:['模拟好友数据，未连接官服']},null,2));
}finally{await browser.close()}
