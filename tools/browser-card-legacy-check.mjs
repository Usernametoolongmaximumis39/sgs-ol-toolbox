import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';

const market = await createMarketServer({ port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('test-results/cards-legacy', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(market.url + '/dev/index.html');
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.slots.get('cards')?.state?.deckIds.length);
  await page.evaluate(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')], self = window.__SGS_TOOLBOX_DEMO__.scene.SelfSeatUi;
    self.seat.HasSkill = id => [4007, 3184, 291, 3269, 2143, 884].includes(id);
    api.journal.push('toolbox:snapshot', api.game.getSnapshot());
    api.themes.register({ id: 'fixture.paper', name: '纸色演练', tokens: { bg: '#f3eee4', surface: '#fffaf0', raised: '#e9dfcb', text: '#332b22', muted: '#6f6049', accent: '#866027', border: '#c7bba4', scheme: 'light' } }, 'fixture');
    document.querySelector('[data-sgs-cards-overlay]').style.visibility = 'hidden';
  });
  const host = page.locator('[data-sgs-toolbox="core"]'), hints = host.locator('[data-card-skill-hints]');
  await hints.waitFor({ state: 'visible' });
  assert.match(await hints.textContent(), /夏晟/);
  assert.match(await hints.textContent(), /资援/);
  assert.match(await hints.textContent(), /蛊惑/);
  for (const width of [248, 280, 420]) for (const light of [false, true]) {
    await host.evaluate((node, { width, light }) => {
      window[Symbol.for('sgs.ol.toolbox.core')].themes.select(light ? 'fixture.paper' : 'core.black-gold');
      node.style.width = width + 'px'; node.shadowRoot.querySelector('.shell').style.width = width + 'px';
    }, { width, light });
    await hints.scrollIntoViewIfNeeded();
    assert.ok(await hints.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `hint width ${width}`);
    await host.screenshot({ path: `test-results/cards-legacy/hints-${width}-${light ? 'light' : 'dark'}.png` });
  }
  const settings = host.locator('.sgs-card-settings'); await settings.locator('summary').click();
  const toggle = settings.locator('[data-setting="skillHints"]');
  await toggle.focus(); await page.keyboard.press('Space');
  assert.equal(await hints.isVisible(), false);
  await page.keyboard.press('Space'); assert.equal(await hints.isVisible(), true);
  await page.evaluate(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')];
    api.journal.push('GsCRoleOptTargetNtf', { SpellID: 372, Type: 29, TargetSeatID: 1, Params: [5] });
  });
  assert.deepEqual(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.slots.get('cards').state.cards[5].locations), ['5:1']);
  await page.evaluate(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')];
    api.journal.push('GsCRoleOptTargetNtf', { SpellID: 372, Type: 28, TargetSeatID: 2, Params: [5] });
  });
  assert.deepEqual(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.slots.get('cards').state.cards[5].locations), ['5:1']);
  assert.deepEqual(errors, []);
  console.log('Legacy skill hints 248/280/420 dark/light, keyboard setting, exact native reveal type passed.');
} finally { await browser.close(); await market.close(); }
