import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';
const market = await createMarketServer({ port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('test-results/skill-pile', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(market.url + '/dev/index.html');
  const overlay = page.locator('[data-sgs-cards-overlay]');
  await overlay.locator('.sgs-card-hud-actions').waitFor();
  // Finish the demo's delayed opening deal before injecting another sequence.
  await page.waitForFunction(() => document.querySelector('#event-log')?.textContent.includes('MsgGamePlayCardNtf'));
  const emit = payload => page.evaluate(payload => window.__SGS_DEMO_EMIT__(payload), payload);
  await emit({ ClassName: 'GsCRoleOptTargetNtf', SpellID: 3543, Type: 28, Params: [3,2,1] });
  const bottom = overlay.locator('.sgs-card-hud-actions button').nth(1);
  await page.waitForFunction(() => document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelectorAll('.sgs-card-hud-actions button')[1].textContent.includes('3'));
  await bottom.click();
  const shown = () => overlay.locator('.sgs-card-hud-list [data-card-id]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.cardId)));
  assert.deepEqual(await shown(), [1,2,3]);
  assert.equal(await overlay.locator('.sgs-card-hud-caption').textContent(), '牌堆底 · 最底在右');
  await page.screenshot({ path: 'test-results/skill-pile/siqi-bottom.png' });
  await emit({ ClassName: 'GsCRoleOptTargetNtf', Protocol: { spell_id: 3483, opt_type: 28, params: [3,2,4,5,6,8,9] } });
  const top = overlay.locator('.sgs-card-hud-actions button').first();
  await page.waitForFunction(() => document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-hud-actions button').textContent.includes('3'));
  await top.click();
  assert.deepEqual(await shown(), [4,5,6]);
  await page.screenshot({ path: 'test-results/skill-pile/jieli-top.png' });
  await emit({ ClassName: 'PubGsCMoveCard', FromZone: 1, FromPosition: 65280, ToZone: 5, ToID: 0, CardIDs: [], CardCount: 1, MoveType: 1 });
  await page.waitForFunction(() => document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-hud-actions button').textContent.includes('2'));
  assert.deepEqual(await shown(), [5,6]);
  assert.deepEqual(errors, []);
  console.log('Siqi bottom / Jieli top: projected native and PB packets, ordered HUD cards, draw consumption passed; screenshots in test-results/skill-pile.');
} finally { await browser.close(); await market.close(); }
