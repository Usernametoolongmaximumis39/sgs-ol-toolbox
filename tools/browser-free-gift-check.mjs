import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';

const out = 'test-results/free-gift';
await mkdir(out, { recursive: true });
const market = await createMarketServer({ port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const key = 'welfare:free-shop:11578201:0';
const id = 11578201;
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 820 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === market.url ? route.continue() : route.abort());
  await page.goto(`${market.url}/dev/round2.html?plugin=daily-rewards`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.list().some(item => item.id === 'daily-rewards' && item.active));
  const pkg = await page.evaluate(async () => {
    const { plugins } = await (await fetch('/catalog.json')).json();
    return (await fetch('/' + plugins.find(item => item.id === 'daily-rewards').packageUrl)).json();
  });
  await page.evaluate(async ({ key, id, pkg }) => {
    const demo = window.__SGS_TOOLBOX_DEMO__, api = window[Symbol.for('sgs.ol.toolbox.core')];
    const timer = Laya.ClassUtils.getClass('TimerManager'), proxy = demo.scene.proxy;
    const settings = api.settings.namespace('daily-rewards'), optionsKey = 'account:41:options';
    const gift = demo.freeGift = { serverCount: 0, requests: [] };
    demo.configs['sys_h5_shop.sgs'] = { root: { discount_shop: [
      { id: 545, item_id: id, time1: '20260418T000003', time2: '20280425T235959', sorting: 28 },
    ] } };
    demo.configs['sys_gs_dbs_fs_goodsbaseinfo.sgs'] = { root: { goodslist: { goods: [
      { ID: id, name: '免费礼盒', TypeID: 43, pricetype: 140, yuanbao: 0, maxBuyCount: '1;1', expirytime: '20261231T235959' },
    ] } } };
    const shop = Object.assign(Object.create(Object.getPrototypeOf(demo.mail)), {
      _events: {}, proxy, IsDataReady: true, countReady: false, count: 0,
      GetShopDataByType: () => [],
      IsDailyFreeGoodsCanBuy: () => false,
      IsTargetSaleCountReady() { return this.countReady; },
      GetLimitGoodsBuyCount() { return this.count; },
      CheckGoodsLimit() { return this.count >= 1; },
      GetItemPrice: (_, type) => [type, 0],
      GetBuyMsg(itemId, amount, discount, priceType, price) {
        return { GoodsCount: 1, BuyType: 1, IsSelfBuy: true, UsingType: 0, GoodsList: [
          { ItemID: itemId, ItemNum: amount, Discount: discount, PriceYuanBao: price, PriceTongQian: 0, pricetype: priceType },
        ] };
      },
      SendCcGoodsHaveBuyCountReqV2(ids) {
        gift.requests.push(['count', ids]);
        this.event('GOODS_HAVE_BUY_COUNT', { baseid: [id + 1], count: [1] });
        if (!gift.holdCount) gift.reply();
      },
    });
    gift.reply = () => {
      shop.countReady = true;
      shop.count = gift.serverCount;
      shop.event('GOODS_HAVE_BUY_COUNT', { baseid: [id], count: [gift.serverCount] });
    };
    proxy.on('decodeCcGoodsHaveBuyCountRepV2', shop, () => {});
    proxy.G = function (message) {
      if (this.useNewPB) message = message.OldProtocalToPb();
      if (this.cacheStarted) return this.addProtocolToCacheList(message, this.CACHE_TYPE_SEND);
      gift.requests.push(['claim', message.GoodsList[0]]);
      gift.serverCount++;
      // Older success replies can omit GoodsBaseID. The closed page never
      // refreshes this count unless the installed plugin asks for it.
      this.event('DbsCBuyShopogoodsRep', { Protocol: { Result: 1 } });
    };
    gift.startDay = async (date, serverCount, entry, holdCount) => {
      timer.ServerDate = new Date(2026, 10, date, 12);
      gift.serverCount = serverCount; gift.holdCount = holdCount; gift.requests.length = 0;
      shop.countReady = false; shop.count = 0;
      settings.set('account:41:attempts', { day: `2026-11-${date}`, items: entry ? { [key]: entry } : {} });
      await api.manager.reload('daily-rewards');
    };
    gift.attempt = () => settings.get('account:41:attempts', {}).items?.[key];
    gift.reload = () => api.manager.reload('daily-rewards');
    timer.ServerDate = new Date(2026, 10, 23, 12);
    settings.set(optionsKey, { schemaVersion: 2, automatic: true, sign: false, mail: false, tasks: false, welfare: true, activities: false, codes: false });
    await api.manager.uninstall('daily-rewards');
    await api.manager.install(pkg);
  }, { key, id, pkg });

  const host = page.locator('[data-sgs-toolbox="core"]');
  const status = host.locator('[data-rewards-status]');
  const pending = host.locator('[data-rewards-unconfirmed]');
  const waitConfirmed = count => status.filter({ hasText: `本轮完成，已确认领取 ${count} 项` }).waitFor();
  const readGift = () => page.evaluate(() => {
    const gift = window.__SGS_TOOLBOX_DEMO__.freeGift;
    return { attempt: gift.attempt(), requests: gift.requests, serverCount: gift.serverCount };
  });
  const zeroCost = { ItemID: id, ItemNum: 1, Discount: 100, PriceYuanBao: 0, PriceTongQian: 0, pricetype: 140 };
  const freshClaim = [['count', [id]], ['claim', zeroCost], ['count', [id]]];

  await waitConfirmed(1);
  const first = await readGift();
  assert.equal(first.attempt.status, 'confirmed');
  assert.equal(first.serverCount, 1);
  assert.deepEqual(first.requests, freshClaim);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.freeGift.reload());
  await waitConfirmed(0);
  assert.deepEqual((await readGift()).requests, first.requests);

  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.freeGift.startDay(24, 1, { status: 'pending', at: 1, flowVersion: 2 }, true));
  await pending.getByText('待核对 · 特惠礼包免费礼盒').waitFor();
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.freeGift.requests.length === 1);
  for (const background of ['#eee', '#181818']) for (const width of [248, 280, 420]) {
    await page.evaluate(color => { document.body.style.background = color; }, background);
    await host.evaluate((node, size) => { node.style.width = size + 'px'; node.style.top = '10px'; node.style.left = '20px'; }, width);
    for (const offset of [-2, -1, 0, 2]) {
      await host.evaluate((node, size) => node.style.setProperty('--sgs-font-offset', size + 'px'), offset);
      assert.ok(await pending.evaluate(node => node.clientWidth > 0 && node.scrollWidth <= node.clientWidth));
    }
    await host.screenshot({ path: `${out}/pending-${background === '#eee' ? 'light' : 'dark'}-${width}.png` });
  }
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.freeGift.reply());
  await waitConfirmed(1);
  assert.equal(await pending.isHidden(), true);
  const restored = await readGift();
  assert.equal(restored.attempt.status, 'confirmed');
  assert.deepEqual(restored.requests, [['count', [id]]]);

  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.freeGift.startDay(25, 0, { status: 'unconfirmed', at: 1, flowVersion: 2 }, false));
  await waitConfirmed(1);
  const recovered = await readGift();
  assert.equal(recovered.attempt.status, 'confirmed');
  assert.equal(recovered.attempt.attempts, 2);
  assert.deepEqual(recovered.requests, freshClaim);
  await host.screenshot({ path: `${out}/reconciled.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser.json`, JSON.stringify({ version: pkg.manifest.version, sha256: pkg.sha256, first, restored, recovered }, null, 2));
  console.log('PASS: closed special offer, missing purchase ID, current count, legacy pending, bounded recovery, reload, and rollover.');
} finally {
  await browser.close();
  await market.close();
}
