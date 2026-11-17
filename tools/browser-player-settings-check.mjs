import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/player-info/settings';await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export {renderPlayerSettings,createPlayerSettings} from './src/plugins/player-info/settings.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Check',write:false});
const browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
try{
const page=await browser.newPage({viewport:{width:900,height:640},hasTouch:true});
await page.setContent('<body><aside></aside></body>');await page.addScriptTag({content:bundle.outputFiles[0].text});
await page.evaluate(()=>{const ctx={document,storage:{get:()=>null,set(){}}};window.options=Check.createPlayerSettings(ctx,()=>{});window.dispose=Check.renderPlayerSettings(ctx,document.querySelector('aside'),options,{searchCatalogue:()=>new Map()});});
for(const theme of ['light','dark'])for(const width of [248,280,420])for(const size of [10,11,12,14]){
await page.evaluate(({theme,width,size})=>{const a=document.querySelector('aside');a.style.cssText=`box-sizing:border-box;width:${width}px;padding:12px;height:220px;overflow:auto;font:${size}px/1.6 sans-serif;--sgs-text:${theme==='light'?'#393327':'#eee3cc'};--sgs-muted:${theme==='light'?'#776d59':'#b7aa8c'};--sgs-accent:#aa8547;--sgs-border:#776642;--sgs-raised:${theme==='light'?'#eee8da':'#302c24'};--sgs-surface:${theme==='light'?'#f8f5ec':'#25221c'};--sgs-bg:${theme==='light'?'#f8f5ec':'#201e1a'};color:var(--sgs-text);background:var(--sgs-bg)`;},{theme,width,size});
const geometry=await page.evaluate(()=>{const a=document.querySelector('aside'),r=document.querySelector('[data-player-settings]'),title=document.querySelectorAll('.pi-toggle-title')[1],b=title.querySelector('button'),label=title.querySelector('label'),br=b.getBoundingClientRect(),lr=label.getBoundingClientRect();return {overflow:a.scrollWidth>a.clientWidth,inside:r.getBoundingClientRect().right<=a.getBoundingClientRect().right,aligned:Math.abs(br.y+br.height/2-lr.y-lr.height/2)<2,hit:br.width>=24&&br.height>=24,defaults:[...document.querySelectorAll('[role=switch]')].every(i=>i.checked)};});assert.ok(Object.values(geometry).every((v,k)=>k===0?!v:v),JSON.stringify(geometry));report.push({theme,width,size,...geometry});
if(width===248&&size===14)await page.screenshot({path:`${out}/${theme}-narrow.png`});
}
const tip=page.getByRole('button',{name:'将灯检查说明'});await tip.focus();await page.getByRole('tooltip').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'});await tip.tap();await page.getByRole('tooltip').waitFor({state:'visible'});await page.screenshot({path:`${out}/help-open.png`});await page.mouse.move(800,600);await page.evaluate(()=>document.activeElement.blur());await tip.hover();await page.getByRole('tooltip').waitFor({state:'visible'});
await page.getByRole('switch',{name:'玩家资料卡'}).uncheck();await assert.equal(await page.getByRole('switch',{name:'检查将灯'}).isDisabled(),true);
await page.evaluate(()=>dispose());assert.equal(await page.locator('[data-player-settings]').count(),0);await writeFile(`${out}/report.json`,JSON.stringify({report,interaction:'keyboard, Escape, touch, hover, dependency, cleanup passed'},null,2));console.log('48 layout combinations and help interactions passed');
}finally{await browser.close()}
