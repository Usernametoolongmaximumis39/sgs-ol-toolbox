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
  for (const background of ['#eee', '#181818']) for (const width of [248, 280, 420]) {
    await page.evaluate(color => { document.body.style.background = color; }, background);
    await host.evaluate((node, width) => { node.style.width = width + 'px'; node.style.top = '10px'; node.style.left = '20px'; node.style.maxHeight = '480px'; }, width);
    await host.screenshot({ path: 'test-results/reward-issues/' + (background === '#eee' ? 'light' : 'dark') + '-' + width + '.png' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: removed sections; six browser renders; no claims sent.');
} finally { await browser.close(); await market.close(); }
