import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { LEDGER_PREVIEW_PATH, LEDGER_SYNC_PATH, SYNC_CHANGES_PATH } from '../src/shared/sync-paths.js';
import { startAppearanceSync } from './appearance-sync.mjs';
import { openGeneralCatalogue } from './general-catalogue.mjs';
import { createMarketServer } from './market-server.mjs';
import { startManagedSync } from './sync-admin/server.mjs';
import { openSyncAdmin, pairPrivateSync } from './browser-sync-fixture.mjs';

const out = resolve('test-results/ledger-sync');
await mkdir(out, { recursive: true });
const fixture = await mkdtemp(resolve(out, 'fixture-'));
const market = await createMarketServer({ port: 0 });
let syncServer, legacyServer, browser;
try {
  const imageRoot = 'https://web.sanguosha.com//220/miniGame/release/laya2/res/runtime/m/general';
  const roster = { '@type': 'ItemList', numberOfItems: 2,
    itemListElement: [[1, '刘备'], [2, '关羽']].map(([id, name]) => ({
      url: `https://www.sanguosha.com/hero/${id}`,
      item: { name, image: `${imageRoot}/big/static/${id * 100}.png` },
    })) };
  const catalogue = await openGeneralCatalogue(resolve(fixture, 'generals.json'), {
    fetcher: async () => new Response(`<script type="application/ld+json">${JSON.stringify(roster)}</script>`),
  });
  legacyServer = await startAppearanceSync({ port: 0, file: resolve(fixture, 'store.json'), catalogue });
  let base = `http://127.0.0.1:${legacyServer.address().port}`;
  const gameOrigin = 'https://web.sanguosha.com';
  const errors = [];
  const account = createHash('sha256').update('sgstoolbox-appearances-test:41').digest('hex');
  const endedAt = Date.now() - 10000;
  const post = (path, value, authorization) => fetch(base + path, { method: 'POST',
    headers: { Origin: gameOrigin, 'Content-Type': 'application/json', ...(authorization && { Authorization: authorization }) }, body: JSON.stringify(value) });
  const moreNames = Object.fromEntries(['界邓艾', '界左慈', '诸葛瞻', '界许褚', '郝昭', '蒋琬',
    '钟繇', '黄祖', '董子安', '神孙权'].map((name, index) => [10 + index, name]));
  const seed = await post('/appearances/sync', { account, names: { 9: '目录外武将', ...moreNames }, matches: [
    { gameId: '1857', mode: 26, rawMode: 132, rawGroup: 3, endedAt, duration: 120, position: 4,
      result: 0, general: [1], frame: { time: endedAt - 120000, general: [2, 1, 9, ...Object.keys(moreNames).map(Number)] } },
    { gameId: '1858', mode: 35, rawMode: 148, rawGroup: 3, endedAt: endedAt - 4000, duration: 85, figure: 3,
      result: 1, general: [2] },
  ] });
  assert.equal(seed.status, 200);
  const historic = { id: 'earlier-lamp', session: 'earlier-session', at: endedAt, kind: 'goods',
    source: 'DbsCcUserGoodshintNtf', type: 8, items: [{ id: 20260001, name: '祈福灯', delta: 7 }] };
  const expired = { id: 13412001, name: '如意结', count: 777, at: endedAt - 20000, expiresAt: endedAt - 1000 };
  assert.equal((await post('/ledger/sync', { account, balances: [expired], events: [historic] })).status, 200);
  const second = createHash('sha256').update('sgstoolbox-appearances-test:42').digest('hex');
  assert.equal((await post('/ledger/sync', { account: second, balances: [], events: [{ ...historic, items: [{ ...historic.items[0], delta: 777 }] }],
    profile: { userCode: '0000000042', name: '演练账号乙', session: { id: historic.session, at: endedAt } } })).status, 200);
  await new Promise((resolve, reject) => legacyServer.close(error => error ? reject(error) : resolve()));
  legacyServer = null;
  const managedCatalogue = await openGeneralCatalogue(resolve(fixture, 'generals.json'), {
    fetcher: async () => new Response(`<script type="application/ld+json">${JSON.stringify(roster)}</script>`),
  });
  syncServer = await startManagedSync({ dataDir: fixture, port: 0, adminPort: 0, legacy: true, catalogue: managedCatalogue,
    allowedOrigins: new Set([market.url, gameOrigin]) });
  base = syncServer.syncUrl;
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser);
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, colorScheme: 'dark' });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let rejectGameSync = false, exchanges = 0, latestExchange, defaultSyncAttempts = 0;
  // Keep this fixture isolated from running local services and their archived accounts.
  await context.route('http://127.0.0.1:17429/**', route => {
    defaultSyncAttempts++;
    return route.abort();
  });
  await context.route(base + LEDGER_SYNC_PATH, route => {
    const request = route.request();
    if (request.method() === 'POST') { exchanges++; latestExchange = request; }
    return rejectGameSync ? route.abort() : route.continue();
  });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUioAAAAASUVORK5CYII=', 'base64');
  const itemIconRoot = imageRoot.replace('/general', '/shop/GiveBuy');
  const itemIconUrls = [70, 33059, 80042, 33414, 33747, 33424, 33700].map(id => `${itemIconRoot}/${id}.png`);
  await context.route('**/res/runtime/**', route => {
    const url = route.request().url();
    return [...itemIconUrls, `${imageRoot}/skinShop/100.png`, `${imageRoot}/big/static/200.png`].includes(url)
      ? route.fulfill({ contentType: 'image/png', body: pixel }) : route.fulfill({ status: 404 });
  });
  const game = await context.newPage();
  const admin = await openSyncAdmin(context, syncServer);
  await game.clock.install();
  await game.goto(`${market.url}/dev/ledger.html?sync=managed`);
  const host = game.locator('[data-sgs-toolbox="core"]');
  await host.locator('[data-category=info]').click();
  const root = host.locator('.sgs-ledger');
  await root.getByText('在「管理 → 云同步」绑定当前账号', { exact: true }).waitFor();
  assert.ok(await root.getByRole('button', { name: '同步账本', exact: true }).isDisabled());
  await game.clock.runFor(1500);
  assert.equal(exchanges, 0);
  await pairPrivateSync(host, admin, base);
  await root.getByText('账本已同步', { exact: true }).waitFor();
  const details = game.locator('.sgs-ledger-detail');
  await root.getByRole('button', { name: '详细账本' }).click();
  await details.getByText('祈福灯 +7', { exact: true }).waitFor();
  await details.getByText(/同步记录 · 物品到账通知/).waitFor();
  await details.getByRole('button', { name: '本次登录' }).click();
  assert.equal(await details.getByText('祈福灯 +7', { exact: true }).count(), 0);
  await details.getByRole('button', { name: '关闭账本' }).click();
  await game.evaluate(() => {
    const demo = window.__SGS_TOOLBOX_DEMO__;
    demo.self.BindYuanBao += 30;
    demo.emit('DbsCUpdatauserYaunbaoNtf', { ChangeYB: 30 });
    demo.instance(0, 13); demo.hint(21223901, 3);
    demo.draw();
  });
  await root.locator('.asset').filter({ has: game.getByText('元宝', { exact: true }) }).getByText('收入 +30', { exact: true }).waitFor();
  await root.getByText('周年龙珠 50 次', { exact: true }).waitFor();
  const synced = game.waitForResponse(response => response.url().endsWith('/ledger/sync') && response.ok());
  await root.getByRole('button', { name: '同步账本' }).press('Enter');
  await synced;
  await root.getByText('账本已同步', { exact: true }).waitFor();

  const preview = await context.newPage();
  await preview.goto(syncServer.adminUrl + LEDGER_PREVIEW_PATH);
  const jade = preview.locator('.balance').filter({ has: preview.getByText('传世玉玺', { exact: true }) });
  await jade.getByText('13', { exact: true }).waitFor();
  await preview.getByText('88,918', { exact: true }).waitFor();
  await preview.getByText('元宝 +30', { exact: true }).waitFor();
  await preview.getByText('周年龙珠 · 50 次', { exact: true }).waitFor();
  assert.equal(await preview.getByText('传世玉玺 +3', { exact: true }).count(), 1);
  const accountSearch = preview.getByRole('searchbox', { name: '查询账号' });
  await preview.getByRole('option', { name: '演练账号甲 · 0000000041' }).waitFor({ state: 'attached' });
  assert.equal(await preview.locator('.balances').getByText(/如意结/).count(), 2);
  assert.equal(await preview.locator('.balances').getByText(/13412001/).count(), 0);
  await preview.waitForFunction(urls => {
    const images = [...document.querySelectorAll('.balance-icon')];
    return images.length === 8 && images.every(img => urls.includes(img.src) && img.complete && img.naturalWidth > 0)
      && new Set(images.map(img => img.src)).size === urls.length;
  }, itemIconUrls);
  for (const [width, expected] of [[1200, [4, 4]], [500, [3, 3, 2]], [340, [2, 2, 2, 2]], [1200, [4, 4]]]) {
    await preview.setViewportSize({ width, height: 850 });
    await preview.waitForFunction(expected => {
      const rows = [...document.querySelectorAll('.balance-row')];
      if (JSON.stringify(rows.map(row => row.childElementCount)) !== JSON.stringify(expected)) return false;
      return rows.every(row => Math.abs(row.lastElementChild.getBoundingClientRect().right - row.getBoundingClientRect().right) < 1);
    }, expected);
  }
  await accountSearch.fill('0000000042');
  await preview.getByText('祈福灯 +777', { exact: true }).waitFor();
  assert.equal(await preview.getByText('元宝 +30', { exact: true }).count(), 0);
  await accountSearch.fill('演练账号甲');
  await preview.getByText('元宝 +30', { exact: true }).waitFor();
  await preview.getByLabel('登录范围').selectOption('session');
  await preview.getByText(/登录于/).waitFor();
  assert.equal(await preview.getByText('祈福灯 +7', { exact: true }).count(), 0);
  await preview.getByLabel('流水类型').selectOption('prayer');
  await preview.getByText('周年龙珠 · 50 次', { exact: true }).waitFor();
  assert.equal(await preview.getByText('元宝 +30', { exact: true }).count(), 0);
  await preview.getByLabel('开始时间').fill('2099-01-01T00:00');
  await preview.getByText(/筛选结果 0 \/ /).waitFor();
  await preview.getByLabel('开始时间').fill('');
  await preview.getByText('周年龙珠 · 50 次', { exact: true }).waitFor();
  const exportEvent = preview.waitForEvent('download');
  await preview.getByRole('button', { name: '导出查询结果' }).click();
  assert.equal((await exportEvent).suggestedFilename(), '账本-0000000041.json');
  await preview.getByLabel('流水类型').selectOption('all');
  await preview.getByLabel('登录范围').selectOption('all');
  await preview.getByText('祈福灯 +7', { exact: true }).waitFor();
  await preview.screenshot({ path: resolve(out, 'preview-desktop-dark.png'), fullPage: true });

  const fresh = { ...historic, id: 'second-earlier-lamp', at: historic.at - 3000, items: [{ ...historic.items[0], delta: 11 }] };
  const authorization = await latestExchange.headerValue('authorization');
  assert.match(authorization, /^Bearer /);
  assert.equal((await post(LEDGER_SYNC_PATH, { account, balances: [], events: [fresh] }, authorization)).status, 200);
  const immediate = game.waitForResponse(response => response.url().endsWith(LEDGER_SYNC_PATH) && response.ok()
    && response.request().postDataJSON().events.some(row => row.items?.some(item => item.id === 21356801)));
  await game.evaluate(() => window.__SGS_TOOLBOX_DEMO__.hint(21356801, 12));
  await game.clock.runFor(1500);
  const pushed = await immediate;
  assert.equal(Object.hasOwn(pushed.request().postDataJSON(), 'pull'), false);
  assert.equal(Object.hasOwn(await pushed.json(), 'download'), false);
  await preview.getByRole('button', { name: '刷新预览' }).click();
  await preview.getByText('绘卷毛笔 +12', { exact: true }).waitFor();
  await root.getByRole('button', { name: '详细账本' }).click();
  assert.equal(await details.getByText('祈福灯 +11', { exact: true }).count(), 0);
  await details.getByRole('button', { name: '关闭账本' }).click();
  const relogin = game.waitForResponse(response => response.url().endsWith(SYNC_CHANGES_PATH) && response.ok());
  await game.evaluate(() => window.__SGS_TOOLBOX_DEMO__.emit('ClientLoginRep', { userID: 41 }));
  await game.clock.runFor(1300);
  assert.ok((await (await relogin).json()).records.some(([kind, id]) => kind === 'event' && id === fresh.id));
  await root.getByText('账本已同步', { exact: true }).waitFor();
  await root.getByRole('button', { name: '详细账本' }).click();
  await details.getByText('祈福灯 +11', { exact: true }).waitFor();
  await details.getByRole('button', { name: '关闭账本' }).click();
  const periodic = game.waitForResponse(response => response.url().endsWith('/ledger/sync') && response.ok());
  await game.clock.fastForward(61000);
  await periodic;
  await root.locator('.asset').filter({ has: game.getByText('元宝', { exact: true }) }).getByText('上次同步').waitFor();

  for (const font of ['tiny', 'small', 'standard', 'large']) {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '外观', exact: true }).click();
    await host.locator(`[data-font-size=${font}]`).click();
    await host.locator('[data-category=info]').click();
    for (const width of [248, 280, 420]) {
      await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
      assert.ok(await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${font} ${width}`);
      const buttons = root.locator('.ledger-sync button');
      for (const button of await buttons.all()) {
        assert.ok(await button.evaluate(node => {
          const text = document.createRange();
          text.selectNodeContents(node.lastChild);
          return node.scrollWidth <= node.clientWidth + 1 && text.getBoundingClientRect().height < 25;
        }));
      }
    }
  }
  await host.evaluate(node => { node.style.width = '248px'; });
  await root.locator('.ledger-sync').screenshot({ path: resolve(out, 'panel-248-dark.png') });
  rejectGameSync = true;
  await game.reload();
  await host.locator('[data-category=info]').click();
  await root.getByText('账本同步失败', { exact: true }).waitFor();
  await root.getByRole('button', { name: '详细账本' }).click();
  await details.getByText('祈福灯 +11', { exact: true }).waitFor();
  await game.close();
  await preview.reload();
  await preview.getByText('88,918', { exact: true }).waitFor();
  await preview.getByRole('button', { name: '战绩与出框' }).press('Enter');
  await preview.getByText(/战绩 2 局 · 出框 1 局/).waitFor();
  await preview.getByLabel('对局模式').selectOption('35');
  await preview.getByLabel('身份或先后手').selectOption('farmer');
  await preview.getByLabel('对局结果').selectOption('loss');
  await preview.getByLabel('出框记录').selectOption('without');
  await preview.getByText(/战绩 1 局 · 出框 0 局 · 0 胜 1 负/).waitFor();
  const battleExport = preview.waitForEvent('download');
  await preview.getByRole('button', { name: '导出查询结果' }).click();
  assert.equal((await battleExport).suggestedFilename(), '战绩与出框-0000000041.json');
  await preview.getByLabel('对局模式').selectOption('26');
  assert.equal(await preview.getByLabel('身份或先后手').inputValue(), 'all');
  await preview.getByText('没有匹配的记录', { exact: true }).waitFor();
  await preview.getByLabel('身份或先后手').selectOption('first');
  await preview.getByLabel('对局结果').selectOption('win');
  await preview.getByLabel('出框记录').selectOption('with');
  await preview.getByText(/战绩 1 局 · 出框 1 局 · 1 胜 0 负/).waitFor();
  const played = preview.getByRole('list', { name: '出场' });
  const candidates = preview.getByRole('list', { name: '出框' });
  await played.locator('img').scrollIntoViewIfNeeded();
  await preview.waitForFunction(() => {
    const images = [...document.querySelectorAll('.general-avatar img')];
    return images.length === 3 && images.every(img => img.complete && img.naturalWidth > 0)
      && images.some(img => img.src.endsWith('/big/static/200.png'));
  });
  assert.equal(await candidates.getByRole('listitem').count(), 13);
  assert.equal(await candidates.locator('li').filter({ hasText: '目录外武将' }).locator('img').count(), 0);
  async function expectCandidateRows(width, expected) {
    await preview.setViewportSize({ width, height: 820 });
    await preview.waitForFunction(expected => {
      const rows = new Map();
      for (const item of document.querySelectorAll('.general-list[aria-label="出框"] .general')) {
        const y = item.getBoundingClientRect().top;
        rows.set(y, (rows.get(y) ?? 0) + 1);
      }
      return JSON.stringify([...rows.values()]) === JSON.stringify(expected);
    }, expected, { timeout: 5000 });
  }
  await expectCandidateRows(1200, [13]);
  await expectCandidateRows(850, [7, 6]);
  await expectCandidateRows(1200, [13]);
  await preview.screenshot({ path: resolve(out, 'matches-desktop-dark.png'), fullPage: true });
  await preview.setViewportSize({ width: 340, height: 540 });
  await preview.emulateMedia({ colorScheme: 'light' });
  await candidates.getByText('关羽', { exact: true }).waitFor();
  await expectCandidateRows(340, [3, 3, 3, 2, 2]);
  await preview.getByRole('searchbox', { name: '搜索记录' }).fill('关羽');
  await played.getByText('刘备', { exact: true }).waitFor();
  for (const width of [248, 280, 420, 340]) {
    await preview.setViewportSize({ width, height: 540 });
    assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `preview at ${width}px`);
  }
  await preview.screenshot({ path: resolve(out, 'preview-mobile-light.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.equal(defaultSyncAttempts, 0);
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ passed: true, chrome: browser.version(),
    checks: ['native fixture capture', 'unbound accounts do not contact the default server', 'cloud pairing, login and same-account relogin',
      'immediate and 60-second upload without a download response',
      'manual sync', 'confirmed download and offline cache', 'account archive after game tab closed',
      'played and candidate avatar loading, portrait fallback and unknown placeholders', 'balanced candidate rows across desktop and mobile resizes',
      'official item icon paths and full-width balance rows across resizes', 'account code and nickname', 'login/type/date filters and export',
      'match mode, side, result, frame, filtered summary and export',
      'expired and active knots', 'four font sizes at 248/280/420 px', 'desktop dark and mobile light'] }, null, 2));
  console.log('账本同步浏览器演练通过');
} finally {
  await browser?.close();
  await syncServer?.close();
  if (legacyServer) await new Promise(resolve => legacyServer.close(resolve));
  await market.close();
}
