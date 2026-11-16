import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/social/lamps';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export {createLampBanner} from './src/plugins/social/lamps.js';export {ResourceScope} from './src/core/resources.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'LampCheck'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1150,height:780}});
 await page.setContent('<body style="margin:0;background:#1c2022"><canvas id="layaCanvas" width="1100" height="740" style="margin:20px"></canvas></body>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{window.scope=new LampCheck.ResourceScope();window.banner=LampCheck.createLampBanner({scope,window,document});banner.show('好友【长名字】',['谋周瑜','界曹操','神郭嘉']);banner.show('另一位好友',['谋诸葛亮']);});
 const box=page.locator('[data-social-lamps]');assert.match(await box.textContent(),/氪了\[3\]个武将：谋周瑜、界曹操、神郭嘉/);
 const rect=await box.boundingBox();assert.equal(rect.y,32);
 await page.waitForTimeout(1200);assert.equal(await box.locator('button').count(),2);
 await page.screenshot({path:out+'/upper-dark.png'});
 await box.locator('button').first().focus();await page.keyboard.press('Enter');assert.equal(await box.locator('button').count(),1);
 await page.setViewportSize({width:280,height:450});await page.waitForTimeout(600);const narrow=await box.boundingBox();assert.ok(narrow.x>=8&&narrow.x+narrow.width<=280);
 await page.screenshot({path:out+'/narrow.png'});
 await box.locator('button').click();assert.equal(await box.count(),0);
 await page.evaluate(()=>{banner.show('<好友>',['谋周瑜'.repeat(60)]);scope.dispose()});assert.equal(await box.count(),0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,checks:['top canvas alignment','prefixes and multi-friend messages','no auto-close','keyboard close','280px bounds','scope cleanup']},null,2));
}finally{await browser.close()}
