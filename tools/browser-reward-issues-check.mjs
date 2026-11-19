import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';

const market = await createMarketServer({ port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
await mkdir('test-results/reward-issues', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    try { await route.fulfill({ body: await readFile(new URL('../release/market' + url.pathname, import.meta.url)), contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.json') ? 'application/json' : 'text/javascript' }); }
    catch { await route.abort(); }
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${market.url}/dev/round2.html?plugin=daily-rewards`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.list().some(p => p.active));
  await page.evaluate(async () => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], demo = window.__SGS_TOOLBOX_DEMO__;
    // Real incident shape, without account or login data. Keep automation off.
    demo.task.baseVo = { _name: '回归登录-第四天', _rewardItem: { ReturnReward: {} } };
    api.settings.namespace('daily-rewards').set('account:41:attempts', { day: '2026-11-13', items: {
      'task:101': { status: 'unconfirmed', at: 1 },
      'task:other': { status: 'rejected', label: '长名称任务'.repeat(20), text: '任务领取失败（游戏错误码 23），请在游戏内核对。'.repeat(10) },
    } });
    api.settings.namespace('daily-rewards').set('account:41:permanent-attempts', {
      ['code:' + encodeURIComponent('已确认')]: { status: 'rejected' },
      ['code:' + encodeURIComponent('主播赴战局')]: { status: 'rejected', text: '兑换未成功（游戏结果码 7）' },
    });
    demo.tasks.allTasks.push({ id: 102, CanAward: true, HasAward: false, TaskCompeleMax: true, baseVo: { name: '开启1个招募令或1个皮肤包' } });
    const originalLookup = demo.tasks.GetServerTaskDataByTaskID.bind(demo.tasks);
    demo.tasks.GetServerTaskDataByTaskID = id => id === 102 ? demo.tasks.allTasks.find(t => t.id === 102) : originalLookup(id);
    // Exercise the release UI, where the development-only log is absent.
    delete demo.onlyPlugin;
    await api.manager.reload('daily-rewards');
  });
  const host = page.locator('[data-sgs-toolbox="core"]');
  await host.locator('[data-category=automation]').click();
  for (const selector of ['[data-rewards-attention]', '[data-rewards-code-history]', '[data-reward-choices]', '[data-rewards-log]']) assert.equal(await host.locator(selector).count(), 0);
  assert.doesNotMatch(await host.innerText(), /待选奖励|领取详情|兑换码历史|错误码 23/);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent.length), 0);
  await page.evaluate(async()=>{const api=window[Symbol.for('sgs.ol.toolbox.core')],demo=window.__SGS_TOOLBOX_DEMO__;demo.task.baseVo={name:'每日活跃奖励（未确认任务显示检查）'};await api.manager.reload('daily-rewards');});
  const pending=host.locator('[data-rewards-unconfirmed]');
  await pending.waitFor();assert.match(await pending.innerText(),/每日活跃奖励.*任务 101/);
  await page.evaluate(async()=>{const api=window[Symbol.for('sgs.ol.toolbox.core')],settings=api.settings.namespace('daily-rewards');const ledger=settings.get('account:41:attempts');ledger.items['activity:weekly:3']={status:'unconfirmed',label:'每周活动奖励',at:3};ledger.items['unknown:9']={status:'unconfirmed',at:4};settings.set('account:41:attempts',ledger);await api.manager.reload('daily-rewards');});
  assert.match(await pending.innerText(),/每周活动奖励/);assert.doesNotMatch(await pending.innerText(),/activity:weekly:3|unknown:9|记录：/);assert.match(await pending.innerText(),/未命名领奖项目/);
  const tier = 'activity:new-jd:tier:4:1:0';
  await page.evaluate(async key => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], settings = api.settings.namespace('daily-rewards');
    const demo = window.__SGS_TOOLBOX_DEMO__;
    const classes = window.Laya.ClassUtils, getClass = classes.getClass.bind(classes);
    const activity = { GetFestivalSignData() {}, NewJDHaveRewardList: [] };
    classes.getClass = name => name === 'ActivityManager' ? activity : getClass(name);
    demo.configs['ff_task_daily.sgs'] = { root: { newbp: [{ id: 4, reward: 201, stime: '20261111T000001', etime: '20270203T235959' }] } };
    settings.set('account:41:attempts', { day: '2026-11-13', items: {
      [key]: { status: 'unconfirmed', label: '节钺令第 1 档免费奖励', text: '暂未确认领取，通常尚未满足领取条件；不会自动重发' },
    } });
    settings.set('account:41:options', { schemaVersion: 2, automatic: true, sign: false, mail: false, tasks: false, welfare: false, activities: false, codes: false });
    await api.manager.reload('daily-rewards');
  }, tier);
  const status = host.locator('[data-rewards-status]');
  await status.filter({ hasText: '另有 1 项待核对（未重发）。以游戏内领取记录为准。' }).waitFor();
  assert.equal(await pending.innerText(), '待核对 · 节钺令第 1 档免费奖励');
  for (const background of ['#eee', '#181818']) for (const width of [248, 280, 420]) {
    await page.evaluate(color => { document.body.style.background = color; }, background);
    await host.evaluate((node, width) => { node.style.width = width + 'px'; node.style.top = '10px'; node.style.left = '20px'; node.style.maxHeight = '480px'; }, width);
    for (const offset of [-2, -1, 2, 0]) {
      await host.evaluate((node, offset) => node.style.setProperty('--sgs-font-offset', offset + 'px'), offset);
      for (const line of [status, pending]) assert.ok(await line.evaluate(node => node.clientWidth > 0 && node.scrollWidth <= node.clientWidth));
    }
    await host.screenshot({ path: 'test-results/reward-issues/' + (background === '#eee' ? 'light' : 'dark') + '-' + width + '.png' });
  }
  await page.evaluate(async () => {
    window.Laya.ClassUtils.getClass('ActivityManager').NewJDHaveRewardList.push(1);
    await window[Symbol.for('sgs.ol.toolbox.core')].manager.reload('daily-rewards');
  });
  await status.filter({ hasText: '本轮完成，已确认领取 0 项' }).waitFor();
  assert.equal(await pending.isHidden(), true);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent.length), 0);
  await page.evaluate(async () => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], demo = window.__SGS_TOOLBOX_DEMO__;
    const activity = window.Laya.ClassUtils.getClass('ActivityManager'), serverFree = [13, 14];
    demo.rewardWindows = [];
    demo.jieyueReplies = 0;
    const dispatcher = demo.scene.ged = {
      _events: {},
      A(name, ...args) { this.event('OPEN_WINDOW', { WindowName: name, Data: args }); },
      event(event, data) {
        if (event === 'OPEN_WINDOW') demo.rewardWindows.push(data.WindowName);
      },
    };
    demo.goods.GetGoodsNumByBaseID = id => id === 11987201 ? 4200 : 0;
    demo.configs['ff_task_daily.sgs'].root.newdailyreward = [
      { teamid: 201, id: 13, point: 3600, item: '100011,200' },
      { teamid: 201, id: 14, point: 3900, item: '9020101,100' },
      { teamid: 201, id: 15, point: 4200, item: '8100201,1' },
    ];
    Object.assign(activity, { HasNewJDRewardRed: true, NewJDHaveRewardList: [], hadBuyNewJD: false,
      SendGetNewJDInfoReq() { demo.sent.push('查询'); this.NewJDHaveRewardList = [...serverFree]; },
      SendGetNewJDRewardReq(id, high, all) {
        demo.sent.push([id, high, all]);
        serverFree.push(id);
        setTimeout(() => {
          dispatcher.A('OldbackOneClickDrawAwdWin', [], true, 2046);
          demo.jieyueReplies++;
        }, 30);
      },
    });
    const settings = api.settings.namespace('daily-rewards');
    settings.set('account:41:attempts', { day: '2026-11-13', items: {
      'activity:new-jd:tier:4:13:0': { status: 'unconfirmed', label: '节钺令第 13 档免费奖励' },
    } });
    settings.set('account:41:options', { ...settings.get('account:41:options'), activities: true,
      excludeRecruit: false, excludeCoupon: false, excludeTrial: false });
    await api.manager.reload('daily-rewards');
  });
  await status.filter({ hasText: '正在领取：节钺令第 15 档免费奖励' }).waitFor();
  assert.equal(await pending.isHidden(), true);
  await status.filter({ hasText: '本轮完成，已确认领取 1 项' }).waitFor({ timeout: 12000 }).catch(async error => {
    console.error('节钺令演练状态', await status.innerText(), await pending.innerText(), await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent));
    throw error;
  });
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.sent), ['查询', [15, false, false], '查询']);
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.jieyueReplies === 1);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.rewardWindows), []);
  await host.screenshot({ path: 'test-results/reward-issues/jieyue-sync.png' });
  await page.evaluate(() => {
    window.__SGS_TOOLBOX_DEMO__.scene.ged.A('NewCodexBuyPopWindow');
    window.Laya.ClassUtils.getClass('ActivityManager').SendGetNewJDRewardReq(16, false, false);
  });
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.jieyueReplies === 2);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.rewardWindows), ['NewCodexBuyPopWindow', 'OldbackOneClickDrawAwdWin']);
  await page.evaluate(async () => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], demo = window.__SGS_TOOLBOX_DEMO__;
    const settings = api.settings.namespace('daily-rewards');
    const task = {
      id: 7003, IsNewQusetType: true, HasServerData: true, IsFromServer: true, completeTimes: 163,
      condition_data: [{ condition_id: 0, condition_cnt: 1 }], TaskConditions: [{ reqType: 128, MaxCount: 1 }],
      baseVo: { name: '拥有1个5阶武将', maxComplete: 607, CanOneReceive: false, HaveSelectReward: false, TaskRewardItem: [{ ItemID: 123, ItemNum: 4 }] },
      get CanRewardCount() { return this.condition_data[0].condition_cnt; },
      get CanAward() { return this.CanRewardCount > 0; },
    };
    const classes = window.Laya.ClassUtils, getClass = classes.getClass.bind(classes);
    const quests = { allTasks: [task], GetServerTaskDataByTaskID: id => id === task.id ? task : undefined,
      getTaskListFromServer() { demo.scene.proxy.event('decodeUserQuestInfoRep'); }, UpTaskState() {} };
    classes.getClass = name => name === 'ActivityQuestManager' ? quests : getClass(name);
    demo.tasks.allTasks = [];
    demo.ranked.NewPWDailyRewardId = 2;
    demo.tasks.RequestTaskAward = (id, choice, count) => {
      demo.sent.push([id, choice, count]);
      task.completeTimes++;
      setTimeout(() => { task.condition_data = [{ condition_id: 0, condition_cnt: 0 }]; }, 200);
    };
    demo.sent.length = 0;
    demo.refineTask = task;
    settings.set('account:41:attempts', { day: '2026-11-13', items: {} });
    settings.set('account:41:options', { ...settings.get('account:41:options'), tasks: true, activities: false });
    await api.manager.reload('daily-rewards');
  });
  await status.filter({ hasText: '本轮完成，已确认领取 1 项' }).waitFor();
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.refineTask.CanRewardCount === 0);
  assert.deepEqual(await page.evaluate(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], demo = window.__SGS_TOOLBOX_DEMO__;
    return [demo.sent, demo.refineTask.completeTimes, api.settings.namespace('daily-rewards').get('account:41:attempts').items['quest:7003:163'].status];
  }), [[[7003, 0, 0]], 164, 'confirmed']);
  await host.screenshot({ path: 'test-results/reward-issues/five-star-main-quest.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: tier 15 and the five-star main quest each claimed once; only the automatic Jieyue claim promotion was suppressed; six UI renders checked.');
} finally { await browser.close(); await market.close(); }
