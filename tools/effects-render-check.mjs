import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';
import { PACKAGE_FORMAT, packageDigest } from '../src/core/packages.js';
import { THEMES } from '../src/plugins/themes/palettes.js';

const output = path.resolve('test-results'); await mkdir(output, { recursive: true });
const market = await createMarketServer({ port: 0 });
let browser;
const results = [];
try {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {}
  }
  assert.ok(browser, '需要 Edge、Chrome 或 Playwright Chromium');
  const catalog = JSON.parse(await readFile('release/market/catalog.json', 'utf8'));
  const currentVersion = catalog.plugins.find(item => item.id === 'effects').version;
  const current = JSON.parse(await readFile(`release/market/packages/effects/${currentVersion}.json`, 'utf8'));
  const cases = [];
  // Local parallel builds may replace a same-version development package.
  // Recover the unchanged historical implementation from its versioned core,
  // extracting only our effects modules; never execute the old core bootstrap.
  try {
    const source = await readFile('release/三国杀OL工具箱-0.2.4.user.js', 'utf8');
    const start = source.indexOf('// src/plugins/effects/extended.js');
    const endText = 'var effects_default = { manifest, activate: activate2 };';
    const end = source.indexOf(endText, start);
    assert.ok(start >= 0 && end > start);
    const code = source.slice(start, end + endText.length) + '\nreturn effects_default;';
    const manifest = { ...current.manifest, version: '0.2.0' };
    const pkg = { format: PACKAGE_FORMAT, manifest, code, sha256: await packageDigest(manifest, code) };
    cases.push({ version: '0.2.0-from-core-0.2.4', legacy: true, pkg });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  cases.push({ version: currentVersion, legacy: false, pkg: current });
  for (const { version, legacy, pkg } of cases) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${market.url}/dev/round2.html?plugin=effects`);
    await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.list().some(item => item.id === 'effects' && item.active));
    await page.evaluate(async pkg => {
      const manager = window[Symbol.for('sgs.ol.toolbox.core')].manager;
      await manager.uninstall('effects'); await manager.install(pkg);
    }, pkg);
    const host = page.locator('[data-sgs-toolbox="core"]');
    let compactUI = null;
    if (!legacy) {
      const panel = host.locator('.sgs-effects'), widths = [];
      assert.equal(await panel.locator('[data-effect]').count(), 18);
      assert.equal(await panel.locator('input[type=checkbox]').count(), 0);
      assert.equal(await panel.locator('fieldset').count(), 2);
      assert.equal(await panel.locator('.effects-detail-grid').isVisible(), false);
      assert.equal(await panel.locator('[data-effect=ads] .effects-option-state-text').textContent(), '未屏蔽');
      assert.match(await panel.locator('[data-effect=ads]').getAttribute('aria-label'), /未屏蔽，点击屏蔽/);
      const slider = panel.getByRole('slider', { name: '对局特效屏蔽程度' });
      await slider.focus(); await slider.press('End');
      assert.equal(await panel.locator('.effects-detail-grid [aria-pressed=true]').count(), 12);
      assert.equal(await panel.locator('[data-effect=ads]').getAttribute('aria-pressed'), 'false');
      await slider.press('Home');
      assert.equal(await panel.locator('.effects-detail-grid [aria-pressed=true]').count(), 0);
      await slider.press('ArrowRight');
      assert.equal(await panel.locator('.effects-detail-grid [aria-pressed=true]').count(), 1);
      assert.equal(await panel.locator('[data-effect=tianshu]').getAttribute('aria-pressed'), 'true');
      assert.equal(await panel.locator('[data-effect=selection]').getAttribute('aria-pressed'), 'false');
      await slider.press('ArrowRight');
      assert.equal(await panel.locator('[data-effect=selection]').getAttribute('aria-pressed'), 'false');
      await slider.press('ArrowRight');
      assert.equal(await panel.locator('[data-effect=selection]').getAttribute('aria-pressed'), 'true');
      await slider.press('Home');
      assert.equal(await panel.locator('small, p:visible').count(), 0);
      for (const width of [248, 280, 420]) {
        await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
        assert.equal(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), true);
        const grid = panel.locator('fieldset').nth(1).locator('.effects-grid');
        assert.equal(await grid.locator('[data-effect]').count(), 6);
        assert.equal(await grid.locator('[data-effect]').evaluateAll(nodes => new Set(nodes.map(node => node.getBoundingClientRect().top)).size), 2);
        await panel.screenshot({ path: path.join(output, `effects-state-${width}.png`) });
        const height = (await panel.boundingBox()).height; assert.ok(height < 280, `compact height ${height}`);
        widths.push({ width, height });
        await panel.getByRole('button', { name: '对局特效详情' }).click();
        assert.equal(await panel.locator('.effects-detail-grid').isVisible(), true);
        assert.equal(await panel.locator('.effects-option').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), true);
        await panel.getByRole('button', { name: '对局特效详情' }).click();
      }
      await host.evaluate(node => { node.style.width = '280px'; });
      const before = (await panel.boundingBox()).height;
      await panel.getByRole('button', { name: '对局特效详情' }).click();
      await panel.locator('[data-effect=sha]').focus(); await panel.locator('[data-effect=sha]').press('Space');
      assert.equal(await panel.locator('[data-effect=sha]').getAttribute('aria-pressed'), 'true');
      assert.equal(await panel.locator('[data-effects-level-text]').textContent(), '自定义 · 1/12');
      await panel.getByRole('button', { name: '对局特效详情' }).click();
      await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight');
      await panel.locator('[data-effect=ads]').click();
      assert.equal(await panel.locator('[data-effect=ads] .effects-option-state-text').textContent(), '已屏蔽');
      assert.match(await panel.locator('[data-effect=ads]').getAttribute('aria-label'), /已屏蔽，点击恢复显示/);
      await panel.screenshot({ path: path.join(output, 'effects-compact-preview.png') });
      await panel.getByRole('button', { name: '对局特效详情' }).click();
      for (const button of await panel.locator('[data-effect]').all()) if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
      await panel.screenshot({ path: path.join(output, 'effects-expanded-preview.png') });
      await panel.getByRole('button', { name: '对局特效详情' }).click();
      const active = (await panel.boundingBox()).height; assert.equal(active, before);
      await panel.getByRole('button', { name: '全部恢复', exact: true }).click();
      assert.equal(await panel.locator('[data-effect][aria-pressed=true]').count(), 0);
      // A historical per-member setting must remain visibly partial after reload.
      await page.evaluate(async () => {
        const core = window[Symbol.for('sgs.ol.toolbox.core')];
        await core.manager.disable('effects');
        core.settings.namespace('effects').set('notice', true);
        await core.manager.enable('effects');
      });
      await page.reload();
      await panel.waitFor();
      assert.equal(await panel.locator('[data-effect=ads]').getAttribute('aria-pressed'), 'mixed');
      assert.equal(await panel.locator('[data-effect=ads] .effects-option-state-text').textContent(), '部分屏蔽');
      for (const scheme of ['dark', 'light']) {
        await page.evaluate(({ scheme, theme }) => {
          const core = window[Symbol.for('sgs.ol.toolbox.core')];
          if (scheme === 'light') {
            core.themes.register(theme, 'themes'); core.themes.select(theme.id);
          } else core.themes.select('core.black-gold');
        }, { scheme, theme: THEMES.find(theme => theme.tokens.scheme === 'light') });
        await page.waitForTimeout(250); // Let the theme's finite color transitions settle before visual QA.
        for (const width of [248, 280, 420]) {
          await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
          assert.equal(await panel.locator('.effects-option').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), true);
          await panel.screenshot({ path: path.join(output, `effects-partial-${scheme}-${width}.png`) });
        }
      }
      await host.evaluate(node => { node.style.width = '280px'; });
      await page.setViewportSize({ width: 1280, height: 480 });
      await panel.locator('[data-effect=ads]').focus(); await panel.locator('[data-effect=ads]').press('Enter');
      assert.equal(await panel.locator('[data-effect=ads] .effects-option-state-text').textContent(), '已屏蔽');
      await panel.locator('[data-effect=ads]').press('Space');
      assert.equal(await panel.locator('[data-effect=ads] .effects-option-state-text').textContent(), '未屏蔽');
      await host.screenshot({ path: path.join(output, 'effects-low-height.png') });
      await page.setViewportSize({ width: 1280, height: 960 });
      compactUI = { widths, before, active };
    }
    await page.evaluate(async () => {
      const { NativeDraw, NativeDictionary, nativeToolbar } = await import('/dev/effects-native-fixtures.js');
      const canvas = document.createElement('canvas'); canvas.width = 550; canvas.height = 80;
      canvas.id = 'native-render-check'; canvas.style.cssText = 'background:#12171b;border:1px solid #dfbf78;display:block;margin-top:16px';
      document.querySelector('#demo-controls').after(canvas);
      const graphics = canvas.getContext('2d'), nodes = [];
      const paint = () => {
        graphics.clearRect(0, 0, canvas.width, canvas.height);
        for (const node of nodes) if (!node.destroyed && node.renderedVisible) {
          graphics.globalAlpha = node.renderedAlpha; graphics.fillStyle = node.color;
          graphics.fillRect(node.at, 12, 80, 48);
        }
        graphics.globalAlpha = 1;
      };
      const draw = (at, color) => { const node = new NativeDraw(paint); node.at = at; node.color = color; nodes.push(node); paint(); return node; };
      const charge = draw(10, '#3fa8ff'), shop = draw(120, '#42c780');
      const download = draw(450, '#bc8aff');
      const notice = {
        marqueeUIList: new NativeDictionary(), marqueeUIActList: new NativeDictionary(), nativeShows: 0, completed: 0,
        ShowMarquee(id) { this.nativeShows++; const node = draw(230, '#f9ba4d'); this.marqueeUIList.add(id, node); return node; },
        addChild(node) { return node; },
        intActDataMarquee(id) { const node = draw(340, '#ff776b'); this.marqueeUIActList.add(id, node); this.addChild(node); return node; },
        ShowNextActMarquee(id) { this.completed++; return this.intActDataMarquee(id); },
        HideAllMarquee() { throw new Error('queue must not be destroyed'); },
      };
      const normal = notice.ShowMarquee(1), activity = notice.intActDataMarquee('act');
      const demo = window.__SGS_TOOLBOX_DEMO__;
      demo.scene.hallToolbar = nativeToolbar(charge, shop);
      demo.scene.hallleftDownBtn = { downloadBtn: download, showDownloadWin() {},
        recommendPos() { this.downloadBtn.visible = true; }, showLimitBtn() { this.downloadBtn.visible = true; this.recommendPos(); } };
      demo.scene.ged = { _events: { CHAT_MARQUEE_ADD: { caller: notice } } };
      window.nativeRenderCheck = { charge, shop, download, normal, activity, notice, savedActivityListener: notice.intActDataMarquee,
        sample() {
          return { charge: graphics.getImageData(30, 30, 1, 1).data[3], shop: graphics.getImageData(140, 30, 1, 1).data[3], download: graphics.getImageData(470, 30, 1, 1).data[3],
            normal: graphics.getImageData(250, 30, 1, 1).data[3], activity: graphics.getImageData(360, 30, 1, 1).data[3],
            chargeVisible: charge.visible, chargeBacking: charge._visible, chargeRendered: charge.renderedVisible,
            width: demo.scene.hallToolbar.width, right: demo.scene.hallToolbar.x + demo.scene.hallToolbar.width };
        } };
    });
    const panelHeight = (await host.locator('.sgs-effects').boundingBox()).height;
    const before = await page.evaluate(() => window.nativeRenderCheck.sample());
    assert.ok(before.charge > 0 && before.normal > 0 && before.activity > 0);
    await page.locator('#native-render-check').screenshot({ path: path.join(output, `effects-render-${version}-before.png`) });
    if (legacy) { await host.locator('[data-effect=recharge]').check(); await host.locator('[data-effect=notice]').check(); }
    else await host.locator('[data-effect=ads]').click();
    const blocked = await page.evaluate(() => window.nativeRenderCheck.sample());
    await page.locator('#native-render-check').screenshot({ path: path.join(output, `effects-render-${version}-blocked.png`) });
    if (legacy) {
      assert.equal(blocked.chargeVisible, false);
      assert.ok(blocked.charge > 0, '旧包应复现按钮已不可见但缓存像素仍在');
      assert.ok(blocked.normal > 0 && blocked.activity > 0, '旧包应复现弹幕字典漏读');
    } else {
      assert.equal(blocked.charge, before.charge); assert.equal(blocked.chargeBacking, true); assert.equal(blocked.chargeRendered, true);
      assert.equal(blocked.normal, 0); assert.equal(blocked.activity, 0); assert.equal(blocked.shop, before.shop);
      assert.equal(blocked.download, 0);
      await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.scene.hallleftDownBtn.showLimitBtn());
      assert.equal(await page.evaluate(() => window.nativeRenderCheck.sample().download), 0);
      assert.equal(blocked.width, before.width); assert.equal(blocked.right, before.right);
      const next = await page.evaluate(() => {
        const f = window.nativeRenderCheck;
        const normal = f.notice.ShowMarquee(2), activity = f.notice.ShowNextActMarquee('next');
        const fromSavedListener = f.savedActivityListener.call(f.notice, 'saved');
        normal.alpha = 0.35; activity.alpha = 0.7;
        return { normal: normal.renderedAlpha, activity: activity.renderedAlpha, saved: fromSavedListener.renderedAlpha, shows: f.notice.nativeShows, completed: f.notice.completed };
      });
      assert.deepEqual(next, { normal: 0, activity: 0, saved: 0, shows: 2, completed: 1 });
      await host.locator('[data-effect=ads]').click();
      const restored = await page.evaluate(() => window.nativeRenderCheck.sample());
      assert.ok(restored.charge > 0 && restored.normal > 0 && restored.activity > 0);
      assert.ok(restored.download > 0);
      assert.equal(restored.width, 210); assert.equal(restored.right, before.right);
      await host.locator('[data-effect=ads]').click();
      await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('effects'));
      assert.ok(await page.evaluate(() => { const f = window.nativeRenderCheck.sample(); return f.charge > 0 && f.normal > 0 && f.activity > 0 && f.download > 0; }));
      await page.locator('#native-render-check').screenshot({ path: path.join(output, `effects-render-${version}-restored.png`) });
    }
    await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.enable('effects'));
    // Reproduce the shared-popup-prototype failure using real browser clicks.
    await page.evaluate(async () => {
      const { windowFixture } = await import('/dev/effects-window-fixtures.js');
      const controls = document.createElement('div'), root = document.createElement('div');
      root.id = 'native-window-check'; root.style.cssText = 'border:1px solid #dfbf78;min-height:100px;padding:12px;margin-top:12px';
      document.querySelector('#demo-controls').after(controls, root);
      let fixture;
      const paint = () => {
        root.replaceChildren();
        for (const win of fixture.opened) if (win.visible && win.parent) {
          const title = document.createElement('span'); title.textContent = win.name;
          const click = document.createElement('button'); click.textContent = '操作窗口'; click.dataset.windowAction = win.name;
          click.onclick = () => win.click();
          const close = document.createElement('button'); close.textContent = '关闭窗口'; close.dataset.windowClose = win.name;
          close.onclick = () => win.Close(); root.append(title, click, close);
        }
      };
      fixture = windowFixture(paint);
      const originals = Object.fromEntries(['enterWindow', 'showHandler', 'UpdateWindow'].map(key => [key, fixture.BaseWindow.prototype[key]]));
      const getClass = window.Laya.ClassUtils.getClass;
      window.Laya.ClassUtils.getClass = name => fixture.classes[name] || getClass(name);
      const instances = {};
      for (const name of ['ShopWindow', 'BagWindow', 'MailWindow', 'AdPushWindow']) {
        const button = document.createElement('button'); button.textContent = '打开 ' + name; button.dataset.windowOpen = name;
        button.onclick = () => { const win = instances[name] = new fixture.classes[name](); win.enterWindow('payload'); paint(); };
        controls.append(button);
      }
      window.popupCheck = { fixture, instances, originals };
    });
    if (legacy) await host.locator('[data-effect=ad]').check();
    else if (await host.locator('[data-effect=ads]').getAttribute('aria-pressed') !== 'true') await host.locator('[data-effect=ads]').click();
    if (!legacy) await host.getByRole('button', { name: '重新检测', exact: true }).click();
    const sharedChanged = await page.evaluate(() => {
      const f = window.popupCheck; return Object.entries(f.originals).some(([key, fn]) => f.fixture.BaseWindow.prototype[key] !== fn);
    });
    assert.equal(sharedChanged, legacy);
    const popup = { sharedChanged, normalClicks: [] };
    for (const name of ['ShopWindow', 'BagWindow', 'MailWindow']) {
      await page.locator(`[data-window-open=${name}]`).click();
      if (legacy) {
        assert.equal(await page.locator(`[data-window-action=${name}]`).count(), 0);
        assert.ok(await page.evaluate(name => window.popupCheck.instances[name].closed > 0, name));
      } else {
        await page.locator(`[data-window-action=${name}]`).click();
        assert.equal(await page.evaluate(name => window.popupCheck.instances[name].clicks, name), 1);
        popup.normalClicks.push(name);
        await page.locator(`[data-window-close=${name}]`).click();
        assert.equal(await page.evaluate(() => window.popupCheck.fixture.opened.size), 0);
      }
    }
    await page.locator('[data-window-open=AdPushWindow]').click();
    const ad = await page.evaluate(() => {
      const f = window.popupCheck, win = f.instances.AdPushWindow;
      return { closed: win.closed, closedAfterInit: win.closedAfterInit, modalRemoved: win.modalBg.parent === null, opened: f.fixture.opened.size };
    });
    if (!legacy) assert.deepEqual(ad, { closed: 1, closedAfterInit: true, modalRemoved: true, opened: 0 });
    popup.ad = ad;
    assert.deepEqual(errors, []); results.push({ version, panelHeight, compactUI, legacyReproduced: legacy, before, blocked, popup, errors });
    await context.close();
  }
  await writeFile(path.join(output, 'effects-render-report.json'), JSON.stringify({ passed: true, scope: '原生结构合成画布，不是真实账号实局', results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally { await browser?.close(); await market.close(); }
