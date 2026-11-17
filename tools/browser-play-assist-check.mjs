import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const output = resolve('test-results/play-assist'); await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { contents: "export { mountPluginUI } from './src/ui/plugin-ui.js'; export {default as plugin} from './src/plugins/play-assist/index.js'; export {ResourceScope} from './src/core/resources.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'AssistCheck' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 940 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    document.body.style.cssText = 'margin:0;padding:20px;background:#102322';
    window.values = new Map(); window.scope = new AssistCheck.ResourceScope();
    window.mount = () => {
      window.disposePlugin = AssistCheck.plugin.activate({ window, document, scope, settings: { get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v) }, game:{getScene:()=>window.assistScene || null,getSnapshot:()=>({inGame:!!window.assistScene}),getClass:()=>({CanOperationInGame:()=>true,IsViewerOrReplay:()=>false})}, notify:()=>{}, ui:{...AssistCheck.mountPluginUI({window,document,scope},()=>({window,document,scope})),registerPanel:p=>{window.unmount=p.render(document.querySelector('main'));}} });
    };
    mount();
  });
  const root = page.locator('[data-play-assist]');
  const support = root.getByLabel('技能辅助支持列表');
  assert.match(await support.textContent(),/需同时拥有洛神或界洛神/);
  assert.match(await support.textContent(),/迁附 3750 \/ 3753/);
  assert.doesNotMatch(await support.textContent(),/驭势 3751/);
  for(const name of ['烈弓','破军','覆载','武圣','武娘','百出','应援','怀远','卫戍','谬焰','合击','伤逝','落英','龙吟']) assert.ok((await support.textContent()).includes(name));
  assert.doesNotMatch(await support.textContent(),/优先|控顶|自动选|弃牌|摸一张牌|失去体力/);
  assert.equal(await support.getAttribute('open'),null);
  assert.equal(await support.locator('p').first().isVisible(),false);
  await support.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await support.locator('p').first().isVisible(),true);
  await support.locator('details > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await support.locator('details').getAttribute('open'),'');
  assert.match(await support.locator('details').textContent(),/726 \/ 3295 \/ 3310/);
  await support.locator('details > summary').press('Enter');
  await support.locator(':scope > summary').press('Enter');
  assert.equal(await support.locator('p').first().isVisible(),false);
  await support.locator(':scope > summary').press('Enter');
  assert.ok((await support.innerText()).includes('强识'));
  await support.locator('details > summary').press('Enter');
  await support.locator(':scope > summary').press('Enter');
  assert.equal(await root.getByRole('switch').count(), 8);
  assert.equal(await root.getByRole('switch', {checked:true}).count(), 1);
  await page.locator('main').evaluate(n => { n.style.cssText = 'width:280px;padding:12px;background:#201e1a;--sgs-text:#eee3cc;--sgs-muted:#b7aa8c;--sgs-accent:#dbba70;--sgs-border:#665b42;--sgs-surface:#2c2922;--sgs-font:system-ui'; });
  await root.screenshot({path:resolve(output,'defaults.png')});
  await root.getByRole('switch', {name:'权道数量',exact:true}).focus(); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>values.get('quandaoCount')),true);
  assert.equal(await root.getByRole('switch', {name:'跨局记忆',exact:true}).count(),0);
  assert.equal(await root.getByRole('switch', {name:'长按技能辅助',exact:true}).isChecked(), true);
  await page.evaluate(()=>{window.assistScene={SelfSeatUi:{seat:{Index:0,Hp:3},skillItems:[{Skill:{SkillId:62,Name:'苦肉'}},{Skill:{SkillId:102,Name:'超长技能名称与完整悬停说明演练'}},{Skill:{SkillId:3750,Name:'迁附'}}],buttonBar:{btns:[]},cardContainer:{cardUis:[]}},seatContainer:{seatUIs:[]}};});
  await root.getByRole('button',{name:/苦肉/}).waitFor();
  await root.getByRole('button',{name:/苦肉/}).focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('[data-id="62"]').getAttribute('aria-pressed')==='true');
  await root.getByRole('button',{name:/迁附/}).click();
  await page.waitForFunction(()=>document.querySelector('[data-id="3750"]').getAttribute('aria-pressed')==='true');
  for (const theme of ['dark','light']) for (const width of [248,280,420]) {
    await page.evaluate(({theme,width}) => {
      const m=document.querySelector('main'); m.style.cssText=`width:${width}px;padding:12px;box-sizing:border-box;border-radius:9px;--sgs-font:system-ui;--sgs-motion:0ms;`+(theme==='dark'?'--sgs-bg:#171b1d;--sgs-surface:#22282b;--sgs-text:#ece7d8;--sgs-muted:#a6a59d;--sgs-accent:#c8ab6a;--sgs-border:#4e4a3e;':'--sgs-bg:#f8f6f0;--sgs-surface:#ebe7dc;--sgs-text:#302b23;--sgs-muted:#746b5b;--sgs-accent:#876722;--sgs-border:#cec4ad;')+'background:var(--sgs-bg)';
    }, {theme,width});
    assert.equal(await root.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
    await root.screenshot({path:resolve(output,`${theme}-${width}.png`)});
    await support.locator(':scope > summary').press('Enter');
    assert.equal(await root.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
    await root.screenshot({path:resolve(output,`qiangzhi-${theme}-${width}.png`)});
    await support.locator(':scope > summary').press('Enter');
  }
  await page.evaluate(()=>{document.querySelector('main').style.maxHeight='260px';document.querySelector('main').style.overflow='auto';});
  await root.getByRole('switch',{name:'技能连按',exact:true}).focus(); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>values.get('rapid')),true);
  await page.evaluate(()=>{unmount();disposePlugin();scope.dispose();});
  assert.equal(await root.count(),0);
  await page.evaluate(()=>{window.scope=new AssistCheck.ResourceScope();mount();});
  assert.equal(await root.getByRole('switch',{name:'权道数量',exact:true}).isChecked(),true);
  await page.evaluate(()=>{unmount();disposePlugin();scope.dispose();});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'report.json'),JSON.stringify({checks:['support list collapsed by default / keyboard expand and collapse','skillLock defaults on; other 8 switches off','keyboard','settings survive reactivation','248/280/420 dark/light','no horizontal overflow','low height keyboard scroll','cleanup'],errors},null,2));
  console.log('PASS play-assist browser UI');
} finally { await browser.close(); }
