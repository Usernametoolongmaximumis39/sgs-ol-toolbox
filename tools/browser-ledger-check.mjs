import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {chromium} from 'playwright';
import {createMarketServer} from './market-server.mjs';
import {bundlePlugin,makePluginPackage} from './plugin-packages.mjs';
const out=resolve('test-results/ledger');await mkdir(out,{recursive:true});const server=await createMarketServer({port:0});
let browser;const errors=[],checks=[];
try{
 for(const channel of ['chrome','msedge',undefined]){try{browser=await chromium.launch({...(channel?{channel}:{}),headless:true});break;}catch{}}
 assert.ok(browser);const context=await browser.newContext({viewport:{width:1200,height:1000}});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==server.url)return route.abort();
  if(url.pathname.startsWith('/res/runtime/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#c49b4e"/><path d="M20 9v22M9 20h22" stroke="#59411f" stroke-width="3"/></svg>'});
  const base=resolve('release/market'),file=resolve(base,'.'+decodeURIComponent(url.pathname));if(relative(base,file).startsWith('..'))return route.abort();
  try{await route.fulfill({body:await readFile(file),contentType:({'.js':'text/javascript','.html':'text/html','.json':'application/json'})[extname(file)]||'text/plain'});}catch{await route.fulfill({status:404,body:'not found'});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${server.url}/dev/ledger.html`);
 await page.waitForFunction(()=>window[Symbol.for('sgs.ol.toolbox.core')]?.manager);const host=page.locator('[data-sgs-toolbox="core"]');await host.locator('[data-category=info]').click();const root=host.locator('.sgs-ledger');await root.waitFor();
 await root.getByText('传世玉玺',{exact:true}).waitFor();assert.equal(await root.locator('.asset').count(),8);assert.equal(await root.locator('.asset img').count(),8);
 assert.deepEqual(await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.list().map(p=>p.id)),['ledger']);
 await page.getByRole('button',{name:'模拟收入与消耗各100',exact:true}).click();await root.locator('.asset').filter({has:page.getByText('元宝',{exact:true})}).getByText('收入 +100',{exact:true}).waitFor();
 assert.ok((await root.innerText()).includes('消耗 −100'));checks.push('净零仍分别显示收入100与消耗100；重要物品与两个同名不同ID如意结');
 await page.evaluate(()=>window.__SGS_TOOLBOX_DEMO__.draw());await root.getByText('周年龙珠 50 次',{exact:true}).waitFor();await root.getByText('获得：传世玉玺 × 2',{exact:true}).waitFor();
 for(const width of [248,280,420]){
  await host.evaluate((node,w)=>{Object.assign(node.style,{top:'15px',left:'25px',right:'auto',width:w+'px'});},width);
  assert.equal(await root.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);await host.screenshot({path:resolve(out,`panel-${width}-dark.png`),animations:'disabled'});
 }
 await root.getByRole('button',{name:'详细账本',exact:true}).focus();await root.getByRole('button',{name:'详细账本',exact:true}).press('Enter');const popup=page.locator('.sgs-ledger-detail');await popup.getByRole('heading',{name:'账本',exact:true}).waitFor();
 assert.equal(context.pages().length,1);await root.getByRole('button',{name:'详细账本',exact:true}).click();assert.equal(await popup.count(),1);
 await popup.getByRole('searchbox',{name:'物品名称或完整 ID',exact:true}).fill('100016');await popup.getByText('筛选结果 2 条 · 收入与消耗分别统计',{exact:true}).waitFor();
 await popup.getByLabel('开始时间',{exact:true}).fill('2099-01-01T00:00');await popup.getByText('没有符合筛选条件的日志',{exact:true}).waitFor();await popup.getByRole('button',{name:'清除筛选',exact:true}).click();
 await popup.getByRole('button',{name:'祈愿台',exact:true}).click();await popup.getByText('周年龙珠 50 次',{exact:true}).waitFor();await popup.getByRole('article').filter({has:page.getByText('周年龙珠 50 次',{exact:true})}).getByText('具体日志 · 物品 ID 与记录详情',{exact:true}).click();await popup.getByText(/15 秒内唯一/).waitFor();
 await page.screenshot({path:resolve(out,'details-dark.png')});
 const rect=await popup.boundingBox();assert.ok(rect.x>=0 && rect.x+rect.width<=1201);
 assert.equal(await popup.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
 await popup.getByRole('button',{name:'全部日志',exact:true}).click();await popup.getByRole('searchbox',{name:'物品名称或完整 ID',exact:true}).fill('元宝');
 const downloadEvent=page.waitForEvent('download');await popup.getByRole('button',{name:'导出筛选日志',exact:true}).click();const download=await downloadEvent;const json=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(json.records.length,2);checks.push('侧边详情按时间/物品/类型筛选、展开具体日志及导出');
 await page.evaluate(()=>{const api=window[Symbol.for('sgs.ol.toolbox.core')];api.themes.register({id:'qa.light',name:'浅色演练',tokens:{bg:'#f8f5ed',surface:'#efeadf',raised:'#fffaf0',text:'#30291c',muted:'#6b6150',accent:'#88620e',border:'#c0b49b',danger:'#ad2f27',scheme:'light',motion:'0s'}},'qa');api.themes.select('qa.light');});
 await host.evaluate(n=>n.style.width='280px');await host.screenshot({path:resolve(out,'panel-280-light.png')});await popup.screenshot({path:resolve(out,'details-light.png'),fullPage:true});
 await page.setViewportSize({width:1200,height:440});await host.screenshot({path:resolve(out,'panel-low-height.png')});await page.setViewportSize({width:1200,height:1000});
 await page.evaluate(()=>window.__SGS_TOOLBOX_DEMO__.bless.active=false);await root.locator('.asset').nth(6).waitFor({state:'detached'});checks.push('非祈福周隐藏如意结；248/280/420px、低高度与浅深主题');
 await page.evaluate(()=>window.__SGS_TOOLBOX_DEMO__.switchAccount(42));await popup.getByText('演练账号乙 · 42 · 仅保存在当前浏览器',{exact:true}).waitFor();await popup.getByText('没有符合筛选条件的日志',{exact:true}).waitFor();
 await page.evaluate(()=>window.__SGS_TOOLBOX_DEMO__.switchAccount(41));await popup.getByText('筛选结果 2 条 · 收入与消耗分别统计',{exact:true}).waitFor();checks.push('账号切换同步清理侧边详情；IndexedDB恢复历史');
 const listeners=()=>page.evaluate(()=>{const p=window.__SGS_TOOLBOX_DEMO__.scene.proxy;return Object.fromEntries(Object.entries(p._events).map(([k,v])=>[k,v.length]));});const before=await listeners();
 await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('ledger'));assert.equal(await root.count(),0);assert.equal((await listeners()).DbsCcUserGoodshintNtf,0);
 await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.enable('ledger'));await root.waitFor();
 await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.reload('ledger'));await root.waitFor();assert.deepEqual(await listeners(),before);
 const base=await bundlePlugin('ledger'),pkg=await makePluginPackage(base,`${base.manifest.version}-local-check`);await page.evaluate(pkg=>window[Symbol.for('sgs.ol.toolbox.core')].manager.install(pkg),pkg);await root.waitFor();
 await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.rollback('ledger'));assert.equal(await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].version),base.manifest.version);
 await page.reload();await page.waitForFunction(()=>window[Symbol.for('sgs.ol.toolbox.core')]?.manager);await host.locator('[data-category=info]').click();await root.waitFor();
 await root.getByRole('button',{name:'详细账本',exact:true}).click();const p2=page.locator('.sgs-ledger-detail');await p2.getByRole('searchbox',{name:'物品名称或完整 ID',exact:true}).fill('元宝');await p2.getByText('筛选结果 2 条 · 收入与消耗分别统计',{exact:true}).waitFor();
 await root.locator('.alert-settings summary').click();
 assert.equal(await root.getByRole('spinbutton').count(),5);
 assert.equal(await root.getByRole('spinbutton',{name:/如意结|玉玺碎片/}).count(),0);
 for(const [name,value] of [['元宝（100016）减少预警阈值','5000'],['传世玉玺（21223901）减少预警阈值','10'],['祈福灯（20260001）减少预警阈值','30'],['绘卷毛笔（21356801）减少预警阈值','50'],['秘钥（21337401）减少预警阈值','50']]) assert.equal(await root.getByRole('spinbutton',{name,exact:true}).inputValue(),value);
 for(const width of [248,280,420]) {await host.evaluate((n,w)=>n.style.width=w+'px',width);assert.equal(await root.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);await host.screenshot({path:resolve(out,'settings-'+width+'-dark.png')});}
 await page.evaluate(()=>{const api=window[Symbol.for('sgs.ol.toolbox.core')];api.themes.register({id:'qa.light',name:'浅色演练',tokens:{bg:'#f8f5ed',surface:'#efeadf',raised:'#fffaf0',text:'#30291c',muted:'#6b6150',accent:'#88620e',border:'#c0b49b',danger:'#ad2f27',scheme:'light',motion:'0s'}},'qa');api.themes.select('qa.light');});
 await host.screenshot({path:resolve(out,'settings-420-light.png')});
 await root.getByRole('spinbutton',{name:'传世玉玺（21223901）减少预警阈值',exact:true}).fill('0.1');await root.getByRole('spinbutton',{name:'传世玉玺（21223901）减少预警阈值',exact:true}).press('Tab');
 await root.locator('.setting-status').getByText('5 项启用',{exact:true}).waitFor();
 checks.push('预警设置五项（含祈福灯），无如意结及碎片独立阈值；小数输入与启用状态');
 await root.getByRole('spinbutton',{name:'元宝（100016）减少预警阈值',exact:true}).fill('2000');
 await root.getByRole('spinbutton',{name:'元宝（100016）减少预警阈值',exact:true}).press('Tab');
 await page.evaluate(()=>{const d=window.__SGS_TOOLBOX_DEMO__;d.emit('ClientLoginRep',{userID:41});});
 await page.waitForTimeout(100);
 await page.evaluate(()=>{const d=window.__SGS_TOOLBOX_DEMO__;d.self.YuanBao-=2000;d.emit('DbsCcUserGoodslistRep',{GoodsList:d.gm.goodsList});});
 const alert=page.getByRole('alertdialog',{name:'重要物品减少预警',exact:true});await alert.waitFor();await alert.getByText(/较上次在线减少 2000/).waitFor();
 await alert.screenshot({path:resolve(out,'login-warning.png')});
 await alert.getByRole('button',{name:'知道了，立即检查',exact:true}).click();await alert.waitFor({state:'hidden'});
 await page.waitForTimeout(1200);assert.equal(await alert.isVisible(),false);checks.push('阈值2000恰好触发跨登录提醒，关闭后不重复弹出');
 await page.evaluate(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.uninstall('ledger'));assert.equal((await listeners()).DbsCcUserGoodshintNtf,0);checks.push('停用/启用/热重载/升级/回退/刷新/卸载；监听不累积，历史不丢');
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'browser-report.json'),JSON.stringify({checks,errors,environment:'离线模拟浏览器，物品图标为布局占位，非官服实局'},null,2));console.log(checks.join('\n'));
}catch(error){console.error(error);throw error;}finally{await browser?.close();await server.close();}
