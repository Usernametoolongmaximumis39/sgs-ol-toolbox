import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const bundle = await build({stdin:{contents:"export { createWishProgress } from './src/plugins/wish-progress/native.js'; export { ResourceScope } from './src/core/resources.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'Check'});
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
const page = await browser.newPage({viewport:{width:900,height:400}});
await page.setContent('<body style="margin:0;background:#181818"></body>');
await page.addScriptTag({path:'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js'});
await page.addScriptTag({content:bundle.outputFiles[0].text});
const results = await page.evaluate(() => {
 Laya.init(900,400); const scope=new Check.ResourceScope(); const managers=[], windows=[];
 for (const [i,kind] of ['General','Skin'].entries()) {
  const m={ratio:7175,GetSelectVoByRound(){return {SplitNum:13}},};
  m['GetCurUp'+kind+'DataByRound']=()=>({ratio:m.ratio,wish_item:2});
  for(const key of ['OnSendDrawUp'+kind+'Req','onServer'+kind+'WishPoolDataResp','onServerDraw'+kind+'WishResp','OnSendClientChange'+kind+'WishReq'])m[key]=()=>{};
  managers.push(m);
  const v=new Laya.Sprite(); v.pos(30,50+i*150);v.vo={RoundID:1};v.updateProgress=()=>{};v['update'+kind+'Item']=()=>{};
  v.proBar=new Laya.Sprite();v.proBar.size(760,50);v.proBar.graphics.drawRect(0,0,760,50,'#34312b');
  const label=new Laya.Text();label.text='original';label.fontSize=22;v.proBar.label=label;v.proBar.addChild(label);v.addChild(v.proBar);Laya.stage.addChild(v);windows.push(v);
 }
 const proxy={_events:{known:managers.map(caller=>({caller,method:caller.onServerGeneralWishPoolDataResp??caller.onServerSkinWishPoolDataResp}))}};
 const ctx={window,scope,game:{getSelf:()=>({ClientId:1}),getClass:()=>null,getServerProxy:()=>proxy},ui:{nativeTheme:{bind(node){node.color='#f7e6bd';return ()=>{}}}},reportError(e){throw e}};
 Check.createWishProgress(ctx);
 const texts=()=>windows.map(v=>v.proBar.label.text);const initial=texts();
 const body=ProtoObj=>({Protocol:{Data:{ProtoObj}}});
 for(const [i,k] of ['General','Skin'].entries()) {
 const m=managers[i];m['OnSendDrawUp'+k+'Req'](1,5);m.ratio+=17;
 m['onServer'+k+'WishPoolDataResp'](body({list:[{round:1}]}));m['onServerDraw'+k+'WishResp'](body({result:0}));
 }
 const changed=texts();
 // Opposite response order, zero and negative changes.
 const m=managers[0];m.OnSendDrawUpGeneralReq(1,1);m.onServerDrawGeneralWishResp(body({result:0}));m.ratio-=100;m.onServerGeneralWishPoolDataResp(body({list:[{round:1}]}));const negative=texts()[0];
 m.OnSendClientChangeGeneralWishReq();windows[0].updateProgress();const reset=texts()[0];
 window.wishCheck={scope,windows}; return {initial,changed,negative,reset};
});
assert.deepEqual(results.initial,['9.327/13','71.75%']);assert.deepEqual(results.changed,['9.350/13（+0.022）','71.92%（+0.170%）']);assert.match(results.negative,/（-0.130）/);assert.doesNotMatch(results.reset,/（/);
await mkdir('test-results/wish-progress',{recursive:true}); await page.screenshot({path:'test-results/wish-progress/native.png'});
assert.deepEqual(await page.evaluate(()=>{wishCheck.scope.dispose();return wishCheck.windows.map(v=>v.proBar.label.text)}),['original','original']);
console.log('Laya wish progress: single/five draw, response orders, negative delta, change reset, disposal passed');
} finally { await browser.close(); }
