import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { createMarketServer } from './market-server.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';
import { startManagedSync } from './sync-admin/server.mjs';
import { openSyncAdmin, pairPrivateSync } from './browser-sync-fixture.mjs';
import { BACKUP_COOLDOWN, BACKUP_READ_PATH, MATCH_SYNC_PATH } from '../src/shared/sync-paths.js';
const output = new URL('../test-results/info-plugins/', import.meta.url); await mkdir(output, { recursive: true });
const server = await createMarketServer({ port: 0 }), checks = [], screenshots = [], errors = [];
let browser;
let syncServer;
const syncUploads = [];
try {
  const syncDir = await mkdtemp(fileURLToPath(new URL('sync-fixture-', output)));
  let serverTime = Date.now();
  syncServer = await startManagedSync({ dataDir: syncDir, port: 0, adminPort: 0, now: () => serverTime, allowedOrigins: new Set([server.url]) });
  const matchSyncUrl = syncServer.syncUrl + MATCH_SYNC_PATH;
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser);
  const context = await browser.newContext({ viewport: { width: 1150, height: 1050 }, deviceScaleFactor: 1 });
  // Use the real local market and the isolated sync server, without external traffic.
  let defaultSyncAttempts = 0;
  const routeFixture = async route => {
    const url = new URL(route.request().url());
    if (url.origin === syncServer.adminUrl || url.origin === syncServer.syncUrl) {
      if (url.href === matchSyncUrl && route.request().method() === 'POST') {
        assert.match(await route.request().headerValue('authorization'), /^Bearer /);
        syncUploads.push(route.request().postDataJSON());
      }
      return route.continue();
    }
    if (url.origin === server.url) return route.continue();
    if (url.port === '17429' && url.pathname === MATCH_SYNC_PATH) defaultSyncAttempts++;
    return route.abort();
  };
  await context.route('**/*', routeFixture);
  const admin = await openSyncAdmin(context, syncServer);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  for (const id of ['baisheng', 'appearances']) {
    const baseVersion = (await bundlePlugin(id)).manifest.version;
    await page.goto(`${server.url}/dev/info.html?plugin=${id}${id === 'appearances' ? '&sync=managed' : ''}`);
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
      await root.getByText('在「管理 → 云同步」绑定当前账号', { exact: true }).waitFor();
      assert.ok(await root.getByRole('button', { name: '同步出框与战绩', exact: true }).isDisabled());
      assert.equal(syncUploads.length, 0);
      const firstBackup = page.waitForResponse(response => response.url().endsWith(BACKUP_READ_PATH) && response.ok());
      await pairPrivateSync(host, admin, syncServer.syncUrl);
      await admin.close();
      await root.getByText('云同步完成 · 新增 0 局', { exact: true }).waitFor();
      assert.deepEqual((await (await firstBackup).json()).snapshot.matches, []);
      assert.equal(syncUploads.length, 0, 'binding downloads the backup without uploading an empty match list');
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
      await root.getByRole('button', { name: '斗地主', exact: true }).click();
      const history = root.getByRole('button', { name: '对局历史', exact: true });
      await history.press('Enter');
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
    if (id === 'baisheng') await page.evaluate(() => {
      const manager = window.Laya.ClassUtils.getClass('AchievementManager'), send = manager.sendGetAchInfo;
      manager.sendGetAchInfo = function (nickname, type) {
        if (nickname !== '演练账号乙') send.call(this, nickname, type);
      };
    });
    await page.getByRole('button', { name: '切换演练账号', exact: true }).click();
    if (id === 'appearances') await root.locator('.row').first().waitFor({ state: 'hidden' });
    else await root.getByText('进度未知', { exact: true }).first().waitFor();
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
      await root.getByText('曾有消息未能处理；已保存记录保留。',{exact:true}).waitFor();
      assert.equal(await host.locator('[data-category=manage] .nav-alert.is-error').count(),0,'capture notices must not trigger plugin error recovery');
      assert.equal(await root.locator('details.error').isVisible(),false);
      await root.getByText('曾有消息未能处理；已保存记录保留。',{exact:true}).click();
      await root.getByText(/消息读取失败 · SmsgGameSetCharacter/).waitFor();
      await root.getByRole('button',{name:'知道了',exact:true}).click();
      assert.equal(await root.getByText('曾有消息未能处理；已保存记录保留。',{exact:true}).isVisible(),false);
      await root.getByText(/^2 条出框 · 2 条战绩已保存/).waitFor();
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
      assert.doesNotMatch(await root.innerText(), /人机身份未知/);
      await root.getByRole('button', { name: '对局历史', exact: true }).click();
      await root.getByText('胜利 · 200秒', { exact: true }).waitFor();
      assert.doesNotMatch(await root.innerText(), /人机身份未知/);
      const singleHistoryPath = fileURLToPath(new URL('appearances-single-rider-history.png', output));
      await host.screenshot({ path: singleHistoryPath, animations: 'disabled' }); screenshots.push(singleHistoryPath);
      await root.getByRole('button', { name: '统计总览', exact: true }).click();
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
      const backupPath = await backup.path();
      const exported = JSON.parse(await readFile(backupPath, 'utf8'));
      assert.ok([...exported.records, ...exported.matches].every(row => !Object.hasOwn(row, 'isAiMatch')));
      await detail.locator('input[type=file]').setInputFiles(backupPath);
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
      await page.evaluate(() => {
        const d=window.__SGS_TOOLBOX_DEMO__, realNow=Date.now;
        Date.now=()=>realNow()+20000;
        const seat=d.scene.SelfSeatUi.seat; seat.SeatID=0; seat.FixedViewId=1; seat.Figure=3;
        d.mode=148; d.group=3; d.replay=false;
        window.UserInfoManger={SendClientGameRecordInfoReq(uuid,mode){setTimeout(()=>d.emit('ClientGameRecordInfoRep',{
          Uuid:uuid,Tab:0,RecordId:mode,RecordItems:mode===35?[null,{GameId:'111',Label:14803},{GameId:'888888888',Label:14803,Figure:3,GameResult:0,
          GameTime:0,GameOverTime:Math.floor(Date.now()/1000)+28800,UsedGenerals:[5]}]:[]}),20);}};
        d.emit('ClientSitdownRep',{Result:1,TypeID:148,GroupID:3,SeatID:0});
        d.emit('MsgGameDealCharacter',{Type:1,Datas:[5]});
        d.emit('SmsgGameSetCharacter',{Infos:[{SeatID:0,CharacterID:5}]});
        d.emit('ClientLeavetableRep');
      });
      await root.getByText('已补收 1 局战绩',{exact:true}).waitFor();
      assert.doesNotMatch(await root.innerText(), /记录缺口|未关联本机开局|部分条目未处理|缺少已用武将列表/);
      await page.evaluate(() => {
        const d=window.__SGS_TOOLBOX_DEMO__;
        d.emit('MsgGameDealCharacter',{Type:1,Datas:[5]});
        setTimeout(()=>d.emit('MsgGameDealCharacter',{Type:3,Datas:Array(257).fill(2)}),30);
      });
      await root.getByText(/采集中断：本局未完成部分/).waitFor();
      assert.equal(await root.locator('details.error').isVisible(),false);
      for(const offset of [-2,-1,0,2]) for(const width of [248,280,420]) {
        await host.evaluate((node,{offset,width})=>{node.style.width=width+'px';node.style.setProperty('--sgs-font-offset',offset+'px');}, {offset,width});
        const bounds=await root.evaluate(n=>({outer:n.getRootNode().host.getBoundingClientRect().width,inner:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth+1}));
        assert.ok(!bounds.overflow && bounds.inner<=bounds.outer);
        const path=fileURLToPath(new URL(`appearances-backfill-${width}-${offset}.png`,output));
        await host.screenshot({path,animations:'disabled'}); screenshots.push(path);
      }
      await root.getByText(/采集中断：本局未完成部分/).click();
      await root.getByRole('button',{name:'知道了',exact:true}).click();
      assert.equal(await root.getByText(/采集中断：本局未完成部分/).isVisible(),false);
      checks.push('appearances: next-opening official history completes a locally captured early-exit game; status at three widths and four font sizes');

      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__;
        d.mode = 132;
        d.emit('ClientSitdownRep', { Result: 1, TypeID: 132, GroupID: 3, SeatID: 0 });
        d.emit('GsCModifyUserseatNtf', { IsGameStart: true, Infos: [
          { SeatID: 0, ClientID: 90 }, { SeatID: 1, ClientID: 91 }, { SeatID: 2, ClientID: 92 }, { SeatID: 3, ClientID: 41 },
        ] });
        d.emit('MsgGameDealCharacterPaiwei', { randomHt: new Map([[0, { Datas: [2, 4] }], [3, { Datas: [2, 3] }]]) });
        d.emit('GsCFirstPhaseRole', { SeatID: 0 });
        d.emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 2 }, { SeatID: 3, CharacterID: 3 }] });
        d.emit('MsgGameOver', { ModeType: 132, GoupID: 3, GameModel: 7, time: 141, Players: [
          { SeatID: 1, Result: 1 }, { SeatID: 0, userId: 90, Result: 0 }, { SeatID: 3, userId: 41, Result: 0 }, { SeatID: 2, Result: 1 },
        ] });
      });
      await root.getByRole('button', { name: '排位', exact: true }).click();
      await root.getByRole('button', { name: '不限', exact: true }).click();
      await root.getByRole('button', { name: '对局历史', exact: true }).click();
      const ownRanked = root.locator('.row').filter({ hasText: '选中：界赵云' });
      await ownRanked.getByText('胜利 · 141秒', { exact: true }).waitFor();
      assert.match(await ownRanked.innerText(), /先手（1、4）[\s\S]*出框：关羽、界赵云/);
      const rankedPath = fileURLToPath(new URL('appearances-ranked-seat.png', output));
      await ownRanked.screenshot({ path: rankedPath, animations: 'disabled' }); screenshots.push(rankedPath);
      checks.push('appearances: ranked opening reassigns own seat, and history shows the actual candidates, selection and win on one row');

      await page.evaluate(() => {
        const d = window.__SGS_TOOLBOX_DEMO__, seat = d.scene.SelfSeatUi.seat;
        seat.SeatID = 0; seat.FixedViewId = 1;
        d.emit('ClientSitdownRep', { Result: 1, TypeID: 132, GroupID: 3, SeatID: 0 });
        d.emit('MsgGameDealCharacter', { Type: 1, Datas: [2, 4, 5] });
        d.emit('SmsgGameSetCharacter', { Infos: [{ SeatID: 0, CharacterID: 4 }] });
        d.emit('ClientLeavetableRep');
        d.emit('ClientGameRecordInfoRep', { Uuid: 41, Tab: 1, RecordId: 9999, RecordItems: [
          { GameId: '987654321', Label: 13203, GameTime: 141, GameResult: 0,
            GameOverTime: Math.floor(Date.now() / 1000) + 28800 + 141, UsedGenerals: [5] },
        ] });
      });
      const oldRanked = root.locator('.row').filter({ hasText: '出框：关羽、谋诸葛亮、用于窄面板演练的超长武将名称' });
      await oldRanked.getByText('选中：谋诸葛亮', { exact: true }).waitFor();
      await oldRanked.getByText('结果未知', { exact: true }).waitFor();
      assert.ok(syncUploads.every(upload => upload.matches.every(row => row.gameId && row.gameId !== '987654321' && !row.id)));
      const uploadResponse = page.waitForResponse(response => response.url() === matchSyncUrl && response.ok()
        && JSON.parse(response.request().postData()).matches.some(row => row.gameId === '987654321'));
      await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.emit('decodeClientGameOverRecordResp', { Data: { ProtoObj: {
        gameid: '987654321', info: { info: { gamemodel: 7 }, player_list: [
          { seatid: 0, uid: 90, general_id: [4] }, { seatid: 1, uid: 91, general_id: [1] },
          { seatid: 2, uid: 92, general_id: [2] }, { seatid: 3, uid: 41, general_id: [5] },
        ] },
      } } }));
      await oldRanked.getByText('选中：用于窄面板演练的超长武将名称', { exact: true }).waitFor();
      await oldRanked.getByText('胜利 · 141秒', { exact: true }).waitFor();
      await uploadResponse;
      const uploaded = syncUploads.at(-1).matches.find(row => row.gameId === '987654321');
      assert.ok(uploaded);
      assert.deepEqual(uploaded, { gameId: '987654321', mode: 26, rawMode: 132, rawGroup: 3, endedAt: uploaded.endedAt,
        general: [5], result: 0, duration: 141, position: 4, figure: null,
        frame: { time: uploaded.frame?.time, general: [2, 4, 5] } });
      const repairedRanked = fileURLToPath(new URL('appearances-ranked-history-repaired.png', output));
      await oldRanked.screenshot({ path: repairedRanked, animations: 'disabled' }); screenshots.push(repairedRanked);
      checks.push('appearances: official ranked history plus the same game detail repairs an old teammate selection and unknown result in place');

      // A second tab of the paired installation downloads into an empty local record store.
      const recordKey = 'sgstoolbox:demo:appearances:appearances:account:41:records-v1';
      const savedRecords = await page.evaluate(key => {
        const stored = localStorage.getItem(key);
        localStorage.removeItem(key);
        return stored;
      }, recordKey);
      assert.ok(savedRecords);
      serverTime += BACKUP_COOLDOWN;
      const uploadsBeforeRestore = syncUploads.length;
      const other = await context.newPage(); other.on('pageerror', e => errors.push(e.message));
      await other.goto(`${server.url}/dev/info.html?plugin=appearances&sync=managed`);
      const otherHost = other.locator('[data-sgs-toolbox="core"]'), otherRoot = otherHost.locator('.sgs-info');
      await otherHost.locator('[data-category=info]').click();
      await otherRoot.getByText(/云同步完成 · 新增 [1-9]\d* 局 · 补齐 [1-9]\d* 条出框/).waitFor();
      assert.equal(syncUploads.length, uploadsBeforeRestore);
      await otherRoot.getByRole('button', { name: '对局历史', exact: true }).click();
      const received = otherRoot.locator('.row').filter({ hasText: '胜利 · 141秒' });
      await received.getByText('出框：关羽、谋诸葛亮、用于窄面板演练的超长武将名称', { exact: true }).waitFor();
      await received.getByText('选中：用于窄面板演练的超长武将名称', { exact: true }).waitFor();
      await otherRoot.getByRole('button', { name: '同步出框与战绩', exact: true }).click();
      await otherRoot.getByText('云同步完成 · 新增 0 局', { exact: true }).waitFor();
      assert.equal(syncUploads.length, uploadsBeforeRestore);
      assert.equal(await received.count(), 1);
      for (const width of [248, 280, 420]) {
        await otherHost.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
        assert.equal(await otherRoot.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
        const path = fileURLToPath(new URL(`appearances-sync-${width}.png`, output));
        await otherHost.screenshot({ path, animations: 'disabled' }); screenshots.push(path);
      }
      await other.close();
      await page.evaluate(({ key, stored }) => localStorage.setItem(key, stored), { key: recordKey, stored: savedRecords });
      checks.push('appearances: unbound account makes no request, pairing starts automatic sync, verified repair uploads, paired tab restores an empty store, manual retry is idempotent');

    }
    const [major, minor, patch] = baseVersion.split('.').map(Number);
    const upgrade = await makePluginPackage(await bundlePlugin(id), `${major}.${minor}.${patch + 1}-local`);
    await page.evaluate(async ({ id, upgrade }) => { const m = window[Symbol.for('sgs.ol.toolbox.core')].manager; await m.disable(id); await m.enable(id); await m.reload(id); await m.install(upgrade); await m.rollback(id); }, { id, upgrade });
    assert.equal(await page.evaluate(id => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().find(row => row.id === id).version, id), baseVersion);
    await page.evaluate(id => window[Symbol.for('sgs.ol.toolbox.core')].manager.uninstall(id), id); assert.equal(await root.count(), 0);
    checks.push(`${id}: isolated render, 248/280/420, light/dark, low height, keyboard/filter, account, persistence, resource cleanup and package lifecycle`);
  }
  assert.deepEqual(errors, []);
  assert.equal(defaultSyncAttempts, 0);
  await writeFile(new URL('report.json', output), JSON.stringify({ checks, screenshots, errors }, null, 2));
  console.log(JSON.stringify({ checks, screenshots: screenshots.length, errors }, null, 2));
} finally { await browser?.close(); await syncServer?.close(); await server.close(); }
