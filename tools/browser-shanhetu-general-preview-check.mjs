import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BLACK_GOLD } from '../src/core/themes.js';

const output = path.resolve('test-results/shanhetu-general-preview');
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { contents: `export { setupGeneralPreview } from './tests/fixtures/shanhetu-general-preview.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'PreviewCheck' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [], screenshots = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!DOCTYPE html><body style="margin:0;background:#26382c"></body>');
  await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    Laya.init(900, 600); Laya.stage.bgColor = '#26382c';
    const background = new Laya.Sprite(); background.pos(115, 60); background.size(670, 410);
    background.graphics.drawRect(0, 0, 670, 410, '#242927', '#766747', 1); Laya.stage.addChild(background);
    const title = new Laya.Text(); Object.assign(title, { text: '选择武将', font: 'Microsoft YaHei', fontSize: 24, color: '#dec58c', x: 275, y: 20 }); background.addChild(title);
    for (const [index, name] of ['曹操', '谋刘备', '孙权'].entries()) {
      const card = new Laya.Sprite(); card.pos(90 + index * 175, 100); card.graphics.drawRect(0, 0, 140, 200, '#343a32', '#665b42', 1);
      const label = new Laya.Text(); Object.assign(label, { text: name, color: '#eee3cc', fontSize: 20, x: 25, y: 155 }); card.addChild(label); background.addChild(card);
    }
    window.fixture = PreviewCheck.setupGeneralPreview(window, Laya.EventDispatcher);
    fixture.open({ general_list: [7, 8], general_change: [1, 2, 3], change_index: [] });
  });
  const notice = page.locator('[data-sgs-shanhe-general-preview]');
  await notice.waitFor(); assert.equal(await notice.locator('p').textContent(), '可换将为：孙权, 谋刘备, 曹操');
  assert.equal(await notice.locator('.preview').evaluate(node => node.getBoundingClientRect().top), 22);
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); screenshots.push(file); };
  await shot('native-open-dark');
  // Reproduce host-page CSS outranking shadow :host geometry, and reserve the
  // fixed toolbox sidebar without centring the notice over it.
  await page.addStyleTag({ content: 'div{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;display:block!important}' });
  await page.evaluate(() => { const s=document.createElement('aside');s.dataset.sgsToolbox='core';s.dataset.edgeFixed='';s.style.cssText='position:fixed;left:620px;top:0;width:280px;height:600px';document.body.append(s); });
  await page.waitForTimeout(300);
  const protectedBox=await notice.locator('.preview').boundingBox();
  assert.equal(protectedBox.y,22); assert.equal(protectedBox.x+protectedBox.width/2,310); assert(protectedBox.x>=16 && protectedBox.x+protectedBox.width<=604);
  await shot('game-css-fixed-sidebar');
  await page.evaluate(() => document.querySelector('[data-sgs-toolbox="core"]').remove());
  checks.push('game-page important div rules cannot displace host; preview centres within game beside fixed sidebar');
  await page.evaluate(() => fixture.update({ general_list: [7, 8], general_change: [1, 2], change_index: [0] }));
  assert.equal(await notice.locator('p').textContent(), '可换将为：谋刘备, 曹操');
  assert.deepEqual(await page.evaluate(() => { const view = fixture.windows.get('RogueSelectGeneralWindow'); return [view.CanSwap(0), view.CanSwap(1)]; }), [false, true]);
  checks.push('actual cached dispatcher open/update methods, Laya EventDispatcher, reverse queue and native swap restrictions');
  await notice.getByRole('button', { name: '关闭换将卡预判' }).focus(); await page.keyboard.press('Enter');
  assert.equal(await notice.count(), 0); await page.evaluate(() => fixture.preview.refresh()); assert.equal(await notice.count(), 0);
  await page.evaluate(() => fixture.open({ general_list: [7], general_change: [1, 2, 3], change_index: [] }, 1));
  checks.push('keyboard dismiss, no repeat on refresh, reopen and desperate pool');
  const light = { ...BLACK_GOLD.tokens, bg: '#eee9df', surface: '#faf7f0', raised: '#e6dfd0', text: '#302b23', muted: '#706451', accent: '#866127', border: '#c5b99f', scheme: 'light' };
  for (const [scheme, tokens] of [['dark', BLACK_GOLD.tokens], ['light', light]]) {
    await page.evaluate(tokens => { fixture.theme(tokens); fixture.character.GameCharacters.character[0].b = '很长的武将名称用于检查换行与完整显示'; fixture.open({ general_list: [7], general_change: [1, 999, 2, 3, 1, 2], change_index: [] }); }, tokens);
    for (const width of [248, 280, 420]) {
      await page.setViewportSize({ width, height: width === 280 ? 180 : 430 });
      const geometry = await notice.locator('.preview').evaluate(node => {
        const r = node.getBoundingClientRect(), text = node.querySelector('p');
        return { x: r.left, top: r.top, right: r.right, bottom: r.bottom, scrollWidth: node.scrollWidth, width: node.clientWidth, content: text.textContent, scrollable: text.scrollHeight >= text.clientHeight };
      });
      assert.ok(geometry.x >= 0 && geometry.right <= width && geometry.bottom <= (width === 280 ? 180 : 430));
      assert.equal(geometry.top, 22);
      assert.ok(geometry.scrollWidth <= geometry.width); assert.match(geometry.content, /Unknown \(999\)/);
      await shot(`${scheme}-${width}`);
    }
  }
  checks.push('top-centred at 22px for 248/280/420px and normal viewport, low-height scroll, full long names and unknown IDs, live dark/light themes');
  await page.setViewportSize({ width: 900, height: 600 });
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T00:00:01Z'));
  await page.evaluate(() => fixture.open({ general_list: [7], general_change: [1], change_index: [] }));
  await page.clock.fastForward(9999); assert.equal(await notice.count(), 1);
  await page.clock.fastForward(1); assert.equal(await notice.count(), 0);
  await page.evaluate(() => fixture.preview.refresh()); assert.equal(await notice.count(), 0);
  checks.push('same 10000ms lifetime as old sm, no timer-driven repeat');
  await page.evaluate(() => { fixture.open({ general_list: [7], general_change: [1], change_index: [] }); fixture.account(2); });
  assert.equal(await notice.count(), 0);
  await page.evaluate(() => { fixture.open({ general_list: [7], general_change: [3], change_index: [] }); fixture.scope.dispose(); });
  assert.equal(await notice.count(), 0); assert.equal(await page.evaluate(() => fixture.themeListeners), 0);
  await page.clock.fastForward(20000); assert.equal(await notice.count(), 0); assert.deepEqual(errors, []);
  checks.push('account switch/disposal remove UI, timers, native and theme listeners');
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ checks, screenshots, errors, limitation: 'Chrome with actual Laya engine and extracted cached native methods; synthetic window/resources, no official-server gameplay.' }, null, 2));
  console.log(JSON.stringify({ checks, screenshots: screenshots.length, errors }));
} finally { await browser.close(); }
