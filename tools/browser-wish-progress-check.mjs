import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const bundle = await build({stdin:{contents:`
 export { activate as activateLedger } from './src/plugins/ledger/index.js';
 export { ResourceScope } from './src/core/resources.js';
 export { ThemeRegistry } from './src/core/themes.js';
 export { THEMES } from './src/core/theme-palettes.js';
 export { createNativeTheme } from './src/ui/native-theme.js';
 export { createPluginNative } from './src/core/plugin-native.js';
 export { mountPluginUI } from './src/ui/plugin-ui.js';
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'Check'});
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
const page = await browser.newPage({viewport:{width:336,height:300}});
const url = 'http://wish-progress.test/';
await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#373127"></body>' }));
await page.goto(url);
await page.addScriptTag({path:'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js'});
await page.addScriptTag({content:bundle.outputFiles[0].text});
const results = await page.evaluate(() => {
 Laya.init(336,300); Laya.stage.bgColor = '#373127';
 const scope=new Check.ResourceScope(); const managers=[], windows=[];
 const settings = new Map();
 const themes = new Check.ThemeRegistry({get:(key, fallback)=>settings.get(key) ?? fallback, set:(key, value)=>settings.set(key, value)});
 for (const theme of Check.THEMES) themes.register(theme, 'themes');
 for (const [i,kind] of ['General','Skin'].entries()) {
  const m={ratio:7175,GetSelectVoByRound(){return {SplitNum:13}},};
  m['GetCurUp'+kind+'DataByRound']=()=>({ratio:m.ratio,wish_item:2});
  for(const key of ['OnSendDrawUp'+kind+'Req','onServer'+kind+'WishPoolDataResp','onServerDraw'+kind+'WishResp','OnSendClientChange'+kind+'WishReq'])m[key]=()=>{};
  managers.push(m);
  const v=new Laya.Sprite(); v.pos(24,20+i*140);v.vo={RoundID:1};v.updateProgress=()=>{};v['update'+kind+'Item']=()=>{};
  v.proBar=new Laya.Sprite();v.proBar.size(10,110);
  v.proBar.graphics.drawRect(0,0,10,110,'#66542e');
  v.proBar.graphics.drawRect(0,31,10,79,'#d2cc59');
  const label=new Laya.Text();label.text='original';label.font='Times New Roman';label.fontSize=22;
  v.proBar.label=label;v.proBar.addChild(label);v.addChild(v.proBar);Laya.stage.addChild(v);windows.push(v);
 }
 const proxy={_events:{known:managers.map(caller=>({caller,method:caller.onServerGeneralWishPoolDataResp??caller.onServerSkinWishPoolDataResp}))}};
 const nativeTheme = Check.createNativeTheme({themes, scope, window});
 const registered = [];
 const ctx={window,document,scope,themes,settings:{get:(_, fallback)=>fallback, set(){}},
  game:{getSelf:()=>({ClientId:1}),getClass:()=>null,getServerProxy:()=>proxy, loadConfigData:async()=>undefined},
  reportError(error){if(error) throw Error(error)}};
 ctx.native=Check.createPluginNative(ctx);
 ctx.ui={...Check.mountPluginUI(ctx,()=>ctx),nativeTheme,registerPanel(spec){registered.push(spec.id);}};
 Check.activateLedger(ctx);
 if (registered.join() !== 'main') throw Error('Unexpected ledger panel registration');
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
 window.wishCheck={scope,windows,themes}; return {initial,changed,negative,reset};
});
assert.deepEqual(results.initial,['9.327/13','71.75%']);assert.deepEqual(results.changed,['9.350/13（+0.022）','71.92%（+0.170%）']);assert.match(results.negative,/（-0.130）/);assert.doesNotMatch(results.reset,/（/);
await mkdir('test-results/wish-progress',{recursive:true});
for (const [theme, name, color, strokeColor] of [
 ['core.black-gold', 'native', '#eee3cc', '#2c2922'],
 ['themes.ricepaper', 'native-light', '#f3eee2', '#342e25'],
]) {
 const labels = await page.evaluate(theme => {
  wishCheck.themes.select(theme);
  return wishCheck.windows.map(({proBar:{label}}) => ({
   font:label.font, bold:label.bold, stroke:label.stroke, color:label.color, strokeColor:label.strokeColor,
   fits:label.textWidth <= label.width && label.textHeight <= label.height,
  }));
 }, theme);
 for (const label of labels) assert.deepEqual(label, {font:'Arial', bold:true, stroke:2, color, strokeColor, fits:true});
 await page.screenshot({path:`test-results/wish-progress/${name}.png`});
}
assert.deepEqual(await page.evaluate(()=>{
 wishCheck.scope.dispose();
 return wishCheck.windows.map(({proBar:{label}})=>[label.text,label.font,label.bold]);
}), Array.from({length:2},()=>['original','Times New Roman',false]));
console.log('Ledger default Laya wish progress: light/dark typography, single/five draw, response orders, negative delta, change reset, disposal passed');
} finally { await browser.close(); }
