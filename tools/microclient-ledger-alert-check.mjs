import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'test-results/microclient-ledger-alert');
const runtime = resolve(root, 'test-results/microclient-ui-hotfix/runtime');
const main = resolve(runtime, 'resources/app/main.cjs');
await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { resolveDir: root, contents: `
import { renderAlerts } from './src/plugins/ledger/ui.js';
import { ResourceScope } from './src/core/resources.js';
import { mountPluginUI } from './src/ui/plugin-ui.js';
import { BLACK_GOLD } from './src/core/themes.js';
import { installMicroAPIs } from './src/core/micro-compatibility.js';
export function run() {
 installMicroAPIs(window);
 const scope=new ResourceScope(), listeners=new Set();
 let alerts=['元宝较上次在线减少 2000，上次 205199 → 本次 203199，已达到阈值 2000，请立即检查账号与物品使用情况。'];
 const ctx={window,document,scope,ui:{},themes:{current:BLACK_GOLD,subscribe:()=>()=>{}}};
 Object.assign(ctx.ui,mountPluginUI(ctx,()=>ctx));
 const controller={getAlerts:()=>alerts,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},dismissAlerts(){alerts=[];for(const fn of listeners)fn()}};
 renderAlerts(ctx,controller);return {scope};
}` }, bundle: true, write: false, format: 'iife', globalName: 'Check', target: 'chrome85' });
await writeFile(resolve(out, 'bundle.js'), bundle.outputFiles[0].text);
await writeFile(resolve(out, 'driver.cjs'), `
const {app,BrowserWindow}=require('electron'),fs=require('fs');const out=${JSON.stringify(out)};
app.setPath('userData',out+'/profile');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:900,height:600,webPreferences:{backgroundThrottling:false}});try{
await w.loadURL('data:text/html,<body style="margin:0;background:%2326382c">');
await w.webContents.executeJavaScript(fs.readFileSync(out+'/bundle.js','utf8'));
const init=await w.webContents.executeJavaScript('(()=>{try{window.fixture=Check.run();return null}catch(e){return e.stack}})()');if(init)throw Error(init);
const checks=[];
for(const width of [320,525,1200]) {
 w.setContentSize(width,440);
 await new Promise(r=>setTimeout(r,100));
 const r=await w.webContents.executeJavaScript('(()=>{const n=document.querySelector(".sgs-ledger-alert"),r=n.getBoundingClientRect();return {width:innerWidth,x:r.x,right:r.right,height:r.height,top:r.top,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth}})()');
 if(r.x<15||r.right>r.width-15||Math.abs((r.x+r.right)/2-r.width/2)>1||r.scrollWidth>r.clientWidth+1||r.top<0||r.top+r.height>440)throw Error(JSON.stringify(r));
 fs.writeFileSync(out+'/alert-'+width+'.png',(await w.webContents.capturePage()).toPNG());checks.push(r);
}
await w.webContents.executeJavaScript('document.querySelector(".sgs-ledger-alert button").click();if(!document.querySelector(".sgs-ledger-alert").hidden)throw Error("dismiss failed");fixture.scope.dispose();if(document.querySelector(".sgs-ledger-alert"))throw Error("cleanup failed")');
fs.writeFileSync(out+'/report.json',JSON.stringify({passed:true,chrome:process.versions.chrome,checks,dismiss:true,cleanup:true},null,2));app.exit(0);
}catch(e){fs.writeFileSync(out+'/error.txt',e.stack);app.exit(1);}});
`);
const previous = await readFile(main);
try {
  await writeFile(main, `require(${JSON.stringify(resolve(out, 'driver.cjs'))});`);
  const result = spawnSync(resolve(runtime, 'SGSOL.exe'), [], { cwd: out, windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, await readFile(resolve(out, 'error.txt'), 'utf8').catch(() => String(result.status)));
  console.log(await readFile(resolve(out, 'report.json'), 'utf8'));
} finally { await writeFile(main, previous); }
