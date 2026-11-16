import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname } from 'node:path';
import { createMarketServer } from './market-server.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';
const output = new URL('../test-results/info-plugins/', import.meta.url); await mkdir(output, { recursive: true });
const server = await createMarketServer({ port: 0 }), checks = [], screenshots = [], errors = [];
let browser;
try {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser);
  const context = await browser.newContext({ viewport: { width: 1150, height: 1050 }, deviceScaleFactor: 1 });
  // Serve our generated fixture files directly through interception, so this
  // controlled render works with network-restricted Chrome and stays offline.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), base = resolve('release/market');
    const file = resolve(base, '.' + decodeURIComponent(url.pathname)), rel = relative(base, file);
    if (url.origin !== server.url || rel.startsWith('..') || !['.html', '.js', '.json', '.css', '.svg'].includes(extname(file))) return route.abort();
    try { await route.fulfill({ body: await readFile(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] }); }
    catch { await route.fulfill({ status: 404, body: 'not found' }); }
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  for (const id of ['baisheng', 'appearances']) {
    const baseVersion = (await bundlePlugin(id)).manifest.version;
    await page.goto(`${server.url}/dev/info.html?plugin=${id}`);
    await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
    const host = page.locator('[data-sgs-toolbox="core"]'), root = host.locator('.sgs-info');
    await host.locator('[data-category=info]').click(); await root.waitFor();
    assert.deepEqual(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().map(row => row.id)), [id]);
    if (id === 'baisheng') {
      await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.requests.length === 1);
      await root.getByText('83 / 100', { exact: true }).waitFor();
      await root.getByRole('button', { name: '刷新战功', exact: true }).click();
      await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.requests.length === 2);
      await root.getByText('83 / 100', { exact: true }).waitFor();
      assert.ok((await root.innerText()).includes('技能战功：已完成'));
      await root.getByText('技能战功：未完成', { exact: true }).waitFor();
      await root.getByText('一局游戏中使用技能完成对应条件并获胜；较长的技能战功说明会自动换行，完整展示。', { exact: true }).waitFor();
      assert.equal(await root.locator('.row details').count(), 0);
      await root.getByRole('button', { name: '未完成', exact: true }).click(); assert.equal(await root.locator('.row').count(), 2);
      // Download via the real button with active filters: export must still include all rows.
      await root.getByRole('searchbox', { name: '搜索武将或战功' }).fill('刘备');
      const downloadEvent = page.waitForEvent('download');
      await root.getByRole('button', { name: '导出', exact: true }).click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), '百胜战功-41.json');
      const report = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.equal(report.格式版本, 2);
      assert.equal(report.账号.ID, '41');
      assert.equal(report.武将列表.length, 5);
      assert.equal(report.完成汇总.全部武将.总数, 5);
      assert.equal(report.完成汇总.已拥有武将.总数, 4);
      assert.ok(report.武将列表.some(row => row.百胜战功.进度 === '83 / 100'));
      assert.match(report.快照时间, /UTC[+-]\d\d:\d\d$/);
      assert.ok(report.原始快照.progress);
      await writeFile(new URL('baisheng-export-example.json', output), JSON.stringify(report, null, 2));
      await root.getByRole('searchbox', { name: '搜索武将或战功' }).fill('');
      await root.getByRole('button', { name: '全部', exact: true }).click();
      await root.getByRole('button', { name: '全部武将', exact: true }).click();
    } else {
      await page.evaluate(() => { const d = window.__SGS_TOOLBOX_DEMO__; d.round(); d.round([2, 3, 4], 2); });
      await root.getByText('2 条出框 · 2 条战绩已保存', { exact: true }).waitFor();
      await root.getByRole('button', { name: '斗地主', exact: true }).click();
      assert.equal(await root.getByRole('button', { name: '全部', exact: true }).count(), 0);
      await root.getByText('刘备', { exact: true }).waitFor();
      await root.getByRole('button', { name: '刷新', exact: true }).click();
      await root.getByText('刘备', { exact: true }).waitFor();
      await root.getByText('筛选与排序', { exact: true }).click();
      assert.equal(await root.getByText('兼容旧小抄数据', { exact: true }).count(), 0);
      assert.equal(await root.locator('.stat strong').innerText(), '50.0%');
      await root.getByRole('button', { name: '斗地主', exact: true }).click();
      await root.getByRole('button', { name: '地主', exact: true }).click();
      assert.equal(await root.locator('.stat strong').innerText(), '100.0%');
      await root.getByRole('button', { name: '农民', exact: true }).click();
      assert.equal(await root.locator('.stat strong').innerText(), '0.0%');
      await root.getByRole('button', { name: '不限', exact: true }).click();
    }
    for (const width of [248, 280, 420]) {
      await host.evaluate((node, width) => { node.style.top = '18px'; node.style.left = '28px'; node.style.right = 'auto'; node.style.width = width + 'px'; }, width);
      const overflow = await root.evaluate(node => node.scrollWidth > node.clientWidth + 1); assert.equal(overflow, false, `${id} ${width}px overflow`);
      if (id === 'appearances') {
        const bounds = await root.locator('.bar').evaluate(bar => ({ width: bar.getBoundingClientRect().width,
          children: [...bar.children].map(node => ({width:node.getBoundingClientRect().width,top:node.getBoundingClientRect().top})) }));
        assert.ok(Math.abs(bounds.children[0].width - bounds.children[1].width) < 1);
        assert.ok(Math.abs(bounds.children[2].width - bounds.width) < 1);
        assert.ok(bounds.children[2].top > bounds.children[0].top);
      }
      const path = fileURLToPath(new URL(`${id}-${width}-dark.png`, output));
      await host.screenshot({ path, animations: 'disabled' }); screenshots.push(path);
    }
    if (id === 'appearances') {
      await root.getByText('筛选与排序', { exact: true }).click();
      for (const width of [248, 280, 420]) {
        await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
        const path = fileURLToPath(new URL(`appearances-combined-${width}.png`, output));
        await host.screenshot({ path, animations: 'disabled' }); screenshots.push(path);
      }
    }
    // A light palette verifies the HTML follows tokens without mutating business settings.
    await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.register({ id: 'qa.light', name: '浅色演练', tokens: {
      bg: '#f8f5ed', surface: '#efeadf', raised: '#fffaf0', text: '#30291c', muted: '#6b6150', accent: '#88620e', border: '#c0b49b', danger: '#ad2f27', radius: '9px', font: 'sans-serif', motion: '0s' } }, 'qa'));
    await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].themes.select('qa.light'));
    await host.evaluate(node => { node.style.width = '280px'; });
    const light = fileURLToPath(new URL(`${id}-280-light.png`, output)); await host.screenshot({ path: light, animations: 'disabled' }); screenshots.push(light);
    await page.setViewportSize({ width: 1150, height: 440 });
    const low = fileURLToPath(new URL(`${id}-low-height.png`, output)); await host.screenshot({ path: low, animations: 'disabled' }); screenshots.push(low);
    await page.setViewportSize({ width: 1150, height: 1050 });
    // Keyboard segment activation, filtering and history.
    if (id === 'appearances') {
      const history = root.getByRole('button', { name: '对局历史', exact: true }); await history.focus(); await page.keyboard.press('Enter');
      await root.getByText('选中：刘备', { exact: true }).waitFor();
      await root.getByText(/^胜利 · 240秒(?: · 地主)?$/).waitFor();
      for (const width of [248, 280, 420]) {
        await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
        const path = fileURLToPath(new URL(`appearances-history-${width}.png`, output));
        await host.screenshot({ path, animations: 'disabled' }); screenshots.push(path);
      }
      await host.evaluate(node => { node.style.width = '280px'; });
      await root.getByRole('searchbox', { name: '搜索武将' }).fill('谋诸葛亮'); assert.equal(await root.locator('.row').count(), 1);
      await root.getByRole('searchbox', { name: '搜索武将' }).fill('');
    }
    // Repeated tab mounts release panel listeners; native protocol listeners belong to plugin scope.
    const listenerCount = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__SGS_TOOLBOX_DEMO__.scene.proxy._events).map(([key, rows]) => [key, rows.length])));
    const listeners = await listenerCount();
    for (let i = 0; i < 4; i++) { await host.locator('[data-category=tools]').click(); await host.locator('[data-category=info]').click(); }
    assert.deepEqual(await listenerCount(), listeners);
    await page.getByRole('button', { name: '切换演练账号', exact: true }).click();
    await page.waitForFunction(({ node, id }) => id === 'appearances' ? node.querySelectorAll('.row').length === 0 : node.innerText.includes('进度未知'), { node: await root.elementHandle(), id });
    assert.doesNotMatch(await root.innerText(), /账号 42|演练账号乙/);
    assert.equal(await root.locator('.row').count(), id === 'appearances' ? 0 : 4); // unknown achievements remain explicit
    if (id === 'baisheng') assert.ok((await root.innerText()).includes('进度未知'));
    await page.getByRole('button', { name: '切换演练账号', exact: true }).click();
    if (id === 'baisheng') await root.getByText('83 / 100', { exact: true }).waitFor();
    else await root.getByText('2 条出框 · 2 条战绩已保存', { exact: true }).waitFor();
    assert.doesNotMatch(await root.innerText(), /账号 41|演练账号甲/);
    await page.reload(); await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
    await page.locator('[data-category=info]').click();
    if (id === 'baisheng') await root.getByText('83 / 100', { exact: true }).waitFor();
    else await root.getByText('2 条出框 · 2 条战绩已保存', { exact: true }).waitFor();
    if (id === 'appearances') {
      // A malformed projected packet explicitly exercises the gap/error path.
      await page.evaluate(() => { const d = window.__SGS_TOOLBOX_DEMO__; d.emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] }); d.emit('SmsgGameSetCharacter', { Infos: null }); });
      await page.waitForFunction(() => { const slot = window[Symbol.for('sgs.ol.toolbox.core')].manager.slots.get('appearances'); return slot.restartUsed && !slot.recovering; });
      assert.equal(await host.locator('[data-category=manage] .nav-alert.is-error').count(), 0, 'first recoverable error is cleared by the core restart');
      await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.emit('SmsgGameSetCharacter', { Infos: null }));
      await host.locator('[data-category=manage] .nav-alert.is-error').waitFor({ timeout: 5000 }).catch(async error => {
        console.error(await page.evaluate(() => ({ plugins: window[Symbol.for('sgs.ol.toolbox.core')].manager.list(), panels: document.querySelector('[data-sgs-toolbox]').shadowRoot.querySelector('.content').innerText, events: Object.keys(window.__SGS_TOOLBOX_DEMO__.scene.proxy._events) })));
        throw error;
      });
      await root.getByText('记录异常 · 查看详情', { exact: true }).click();
      assert.ok((await root.innerText()).includes('消息记录有缺口'));
      await root.getByRole('button', { name: '重试保存', exact: true }).click();
      assert.equal(await host.locator('[data-category=manage] .nav-alert.is-error').count(), 0);
    }
    if(id==='appearances'){
      await page.evaluate(()=>{const d=window.__SGS_TOOLBOX_DEMO__;
        d.mode=132;for(const position of [1,2,3,4])d.round([1,2],position===1||position===4?1:2,{seat:0,position});
        d.mode=160;d.round([1,2],1,{seat:1,position:1});d.round([1,2],2,{seat:0,position:2});
      });
      await root.getByText(/^8 条出框 · 8 条战绩已保存/).waitFor();
      await root.getByRole('button',{name:'排位',exact:true}).click();
      assert.equal(await root.locator('.row').count(),2);
      assert.equal(await root.locator('.stat strong').innerText(),'50.0%');
      assert.ok((await root.innerText()).includes('排位赛 · 合计'));
      await root.getByText('先手：1、4号位 · 后手：2、3号位',{exact:true}).waitFor();
      await root.getByRole('button',{name:'先手',exact:true}).click();
      assert.equal(await root.locator('.stat strong').innerText(),'100.0%');
      assert.equal(await root.locator('.row').count(),2);
      for(const width of [248,280,420]){
        await host.evaluate((node,width)=>{node.style.width=width+'px';},width);
        assert.equal(await root.evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
        const path=fileURLToPath(new URL('appearances-rank-'+width+'.png',output));
        await host.screenshot({path,animations:'disabled'});screenshots.push(path);
      }
      await root.getByRole('button',{name:'后手',exact:true}).click();
      assert.equal(await root.locator('.stat strong').innerText(),'0.0%');
      await root.getByRole('button',{name:'单骑',exact:true}).click();
      assert.equal(await root.getByRole('button',{name:'不限',exact:true}).getAttribute('aria-pressed'),'true');
      await root.getByRole('button',{name:'先手',exact:true}).click();
      assert.equal(await root.locator('.stat strong').innerText(),'100.0%');
      const second=root.getByRole('button',{name:'后手',exact:true});await second.focus();await page.keyboard.press('Enter');
      assert.equal(await root.locator('.stat strong').innerText(),'0.0%');
      assert.equal(await root.getByRole('button',{name:'未知',exact:true}).count(),0);
      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__, scene = d.scene;
        d.savedSeats = { self: scene.SelfSeatUi, seats: scene.seatContainer.seatUIs, getClass: Laya.ClassUtils.getClass };
        Laya.ClassUtils.getClass = name => name === 'GameContext' ? undefined : d.savedSeats.getClass(name);
        scene.SelfSeatUi = null; scene.seatContainer.seatUIs = [];
        d.emit('ClientSitdownRep', { Result: 1, TypeID: 160, GroupID: 2, SeatID: 1, IsViewer: false });
        d.emit('GsCFirstPhaseRole', { SeatID: 0 });
        d.emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
        d.emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 1, CharacterID: 1 }] });
        d.emit('MsgGameOver', { ModeType: 160, GoupID: 2, GameModel: 37, time: 200,
          Players: [{ SeatID: 0, userId: 99, Result: 1, isRobot: true }, { SeatID: 1, userId: 41, Result: 0, isRobot: false }] });
      });
      await root.getByText(/^9 条出框 · 9 条战绩已保存/).waitFor();
      assert.equal(await root.locator('.stat strong').innerText(), '50.0%');
      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__;
        d.scene.SelfSeatUi = d.savedSeats.self; d.scene.seatContainer.seatUIs = d.savedSeats.seats;
        Laya.ClassUtils.getClass = d.savedSeats.getClass; delete d.savedSeats;
      });
      checks.push('appearances: single-rider matchmaking bot counts in HUD, table seat and early first-role record own win while scene seats and GameContext are unavailable');
      checks.push('appearances: independent DDZ roles, rank 1/4 vs 2/3, single first/second, filter reset, no unknown option and keyboard');
      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__, original = Laya.ClassUtils.getClass;
        Laya.ClassUtils.getClass = name => name === 'GameContext' ? undefined : original(name);
        d.emit('ClientEnterpageRep', { Result: 1 });
        d.emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
        d.emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 1 }] });
        d.emit('GsCFirstPhaseRole', { SeatID: 1 });
        d.emit('MsgGameOver', { ModeType: 160, GoupID: 2, GameModel: 37, time: 142,
          Players: [{ SeatID: 0, Result: 0, isRobot: false }, { SeatID: 1, Result: 1, isRobot: false }] });
        Laya.ClassUtils.getClass = original;
      });
      await root.getByText(/^10 条出框 · 10 条战绩已保存/).waitFor();
      checks.push('appearances: missing selection mode and no table join resolved from exact settlement mode and first-role');
      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__, original = Laya.ClassUtils.getClass;
        Laya.ClassUtils.getClass = name => name === 'GameContext' ? undefined : original(name);
        d.emit('ClientEnterpageRep', { Result: 1 });
        d.emit('GsCFirstPhaseRole', { SeatID: 3 });
        d.emit('MsgGameDealCharacter', { Type: 1, Datas: [1, 2] });
        d.emit('SmsgGameSetCharacter', { Infos: [{SeatID:0,CharacterID:1},{SeatID:1,CharacterID:2},{SeatID:2,CharacterID:3},{SeatID:3,CharacterID:4}] });
        d.emit('MsgGameOver', { ModeType: 132, GoupID: 3, GameModel: 7, time: 387,
          Players: [{SeatID:0,Result:1},{SeatID:1,Result:1},{SeatID:2,Result:0},{SeatID:3,Result:0}] });
        Laya.ClassUtils.getClass = original;
      });
      await root.getByText(/^11 条出框 · 11 条战绩已保存/).waitFor();
      await root.getByRole('button', {name:'排位',exact:true}).click();
      await root.getByRole('button', {name:'后手',exact:true}).click();
      assert.equal(await root.locator('.stat strong').innerText(), '0.0%');
      checks.push('appearances: observed ranked model 7, complete opening roster and first seat produce position 2 and loss');
    }
    if (id === 'appearances') {
      await page.evaluate(() => { window.open = () => { throw new Error('external popup forbidden'); }; });
      await root.getByRole('button', { name: '查看详情', exact: true }).click();
      const detailHost = page.locator('[data-sgs-toolbox="appearance-details"]');
      const detail = detailHost.getByRole('dialog', {name: '出框与胜率统计详情'});
      await detail.locator('[data-appearance-details]').waitFor();
      assert.equal(context.pages().length, 1);
      await root.getByRole('button', { name: '查看详情', exact: true }).evaluate(n => n.click());
      assert.equal(await detailHost.count(), 1);
      assert.equal(await detail.getByRole('button',{name:'全部',exact:true}).count(),0);
      await detail.getByText('统计口径与数据记录',{exact:true}).click();
      await detail.getByRole('button',{name:'恢复工具箱备份',exact:true}).waitFor();
      const backupEvent = page.waitForEvent('download');
      await detail.getByRole('button',{name:'导出',exact:true}).click();
      const backup = await backupEvent;
      await detail.locator('input[type=file]').setInputFiles(await backup.path());
      await detail.getByText(/^11 条出框 · 11 条战绩已保存/).waitFor();
      for (const name of ['胜率','胜场数','出场数','出框数']) {
        await detail.getByRole('button',{name,exact:true}).click();
        assert.equal(await detail.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');
      }
      await detail.getByRole('button',{name:'从低到高',exact:true}).click();
      await page.screenshot({path:fileURLToPath(new URL('appearances-details.png',output)),animations:'disabled'});
      await detail.getByRole('searchbox',{name:'搜索武将'}).fill('没有这个武将');
      await detail.getByText('没有符合筛选的记录',{exact:true}).waitFor();
      await detail.getByRole('searchbox',{name:'搜索武将'}).fill('');
      for (const width of [248, 280, 420]) {
        await page.setViewportSize({width, height: 650});
        const r = await detail.evaluate(n => { const r=n.getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth,overflow:n.scrollWidth>n.clientWidth}; });
        assert.ok(r.left>=0 && r.right<=r.width && !r.overflow);
        await page.screenshot({path:fileURLToPath(new URL('appearances-details-'+width+'.png',output)),animations:'disabled'});
      }
      await page.setViewportSize({width:1150,height:1050});
      await detail.getByRole('button',{name:'关闭统计详情'}).click();
      assert.equal(await detailHost.count(),0);
      await root.getByRole('button', {name:'查看详情',exact:true}).click();
      await page.keyboard.press('Escape'); assert.equal(await detailHost.count(),0);
      await root.getByRole('button', {name:'查看详情',exact:true}).click();
      await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('appearances'));
      assert.equal(await detailHost.count(),0);
      await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.enable('appearances'));
      checks.push('appearances: built-in detail, JSON import entry, no external popup, sorts, search, 248/280/420px, close, Escape and disable cleanup');
    }
    const [major, minor, patch] = baseVersion.split('.').map(Number);
    const upgrade = await makePluginPackage(await bundlePlugin(id), `${major}.${minor}.${patch + 1}-local`);
    await page.evaluate(async ({ id, upgrade }) => { const m = window[Symbol.for('sgs.ol.toolbox.core')].manager; await m.disable(id); await m.enable(id); await m.reload(id); await m.install(upgrade); await m.rollback(id); }, { id, upgrade });
    assert.equal(await page.evaluate(id => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().find(row => row.id === id).version, id), baseVersion);
    await page.evaluate(id => window[Symbol.for('sgs.ol.toolbox.core')].manager.uninstall(id), id); assert.equal(await root.count(), 0);
    checks.push(`${id}: isolated render, 248/280/420, light/dark, low height, keyboard/filter, account, persistence, resource cleanup and package lifecycle`);
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify({ checks, screenshots, errors }, null, 2));
  console.log(JSON.stringify({ checks, screenshots: screenshots.length, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
