import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';

const output = resolve('test-results/gaizhu-browser'); await mkdir(output, { recursive: true });
const server = await createMarketServer({ port: 0 }), errors = [], checks = [], screenshots = [];
let browser;
try {
  for (const channel of ['chrome', 'msedge', undefined]) { try { browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); break; } catch {} }
  assert.ok(browser, 'Chromium browser available');
  const context = await browser.newContext({ viewport: { width: 1120, height: 920 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), base = resolve('release/market'), file = resolve(base, '.' + decodeURIComponent(url.pathname)), rel = relative(base, file);
    if (url.origin !== server.url || rel.startsWith('..') || !['.html', '.js', '.json', '.css', '.svg'].includes(extname(file))) return route.abort();
    try { await route.fulfill({ body: await readFile(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' })[extname(file)] }); }
    catch { await route.fulfill({ status: 404, body: 'not found' }); }
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(12000);
  await page.clock.install();
  await page.goto(`${server.url}/dev/gaizhu.html`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  const host = page.locator('[data-sgs-toolbox="core"]'), root = host.locator('[data-gaizhu]');
  await host.locator('[data-category=automation]').click(); await root.waitFor();
  const requestCount = type => page.evaluate(type => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === type).length, type);
  const hasRequest = (type, value) => page.waitForFunction(({ type, value }) => window.__SGS_TOOLBOX_DEMO__.requests.some(r => r[0] === type && (value === undefined || r[1] === value)), { type, value });
  assert.deepEqual(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list().map(p => p.id)), ['gaizhu', 'baisheng']);
  assert.equal(await requestCount('point'), 0);
  await root.getByRole('button', { name: '反贼大号', exact: true }).focus(); await page.keyboard.press('Enter');
  await root.getByRole('button', { name: '按序点将', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await requestCount('point'), 0);
  await root.getByRole('button', { name: '盖主小号', exact: true }).click();
  await root.getByRole('switch', { name: '等1分钟' }).focus(); await page.keyboard.press('Space');
  // A synthetic server rejects the first write during its settings cooldown.
  await page.evaluate(() => {
    const demo = window.__SGS_TOOLBOX_DEMO__, rc = demo.scene.startUI.rc, handlers = new Map();
    rc.TableSetting.BuildHandCard = true;
    rc.on = (type, caller, fn) => handlers.set(type, fn);
    rc.off = type => handlers.delete(type);
    let attempts = 0;
    demo.proxy.L = packet => {
      demo.requests.push(['room-settings', ++attempts, packet.ModifyRule.Password]);
      handlers.get(attempts === 1 ? 'REFRESH_RULE_UI' : 'MODIFY_TABLE_EVENT')?.();
    };
  });
  await root.getByRole('button', { name: '开始速刷', exact: true }).click();
  await root.getByText('房间设置被拒绝 · 等待5秒后重试', { exact: true }).waitFor();
  assert.equal(await requestCount('room-settings'), 1); assert.equal(await requestCount('point'), 0);
  const cooldownFile = resolve(output, 'settings-cooldown.png'); await host.screenshot({ path: cooldownFile }); screenshots.push(cooldownFile);
  await page.clock.fastForward(6000);
  assert.equal(await requestCount('room-settings'), 2);
  await hasRequest('start'); await hasRequest('select', 1);
  assert.ok(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.some(r => r[0] === 'point' && r[1] === 0 && r[2] === 1)));
  assert.equal(await requestCount('ai'), 1);
  assert.equal(await requestCount('ai-confirm'), 1, 'normal AI requires the native confirmation callback');
  assert.equal(await requestCount('open-dianjiang'), 0, 'slot submission must not trigger the point-card selection window');
  assert.ok(await page.evaluate(() => {
    const rows = window.__SGS_TOOLBOX_DEMO__.requests;
    return rows.findIndex(r => r[0] === 'point') < rows.findIndex(r => r[0] === 'ai')
      && rows.findIndex(r => r[0] === 'ai') < rows.findIndex(r => r[0] === 'ai-confirm')
      && rows.findIndex(r => r[0] === 'ai-confirm') < rows.findIndex(r => r[0] === 'start');
  }), 'host submits the slot, confirms AI, then starts');
  assert.equal(await page.evaluate(() => {
    const win = window.Laya.ClassUtils.getClass('WindowManager').WindowInstanceDict._maps.SelectGeneralWindow;
    return Boolean(win && win.visible && !win.parent);
  }), true, 'selection keeps a detached visible cache to exercise native window discovery');
  await root.locator('[data-room-password]').filter({ hasText: '01' }).waitFor();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await root.getByRole('button', { name: '复制密码', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '01');
  for (const width of [248, 280, 420]) {
    await host.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
    assert.equal(await root.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
    const file = resolve(output, 'password-' + width + '.png'); await host.screenshot({ path: file }); screenshots.push(file);
  }
  assert.equal(await requestCount('kurou'), 0, 'wait mode burns countdown above three seconds');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.countdown(3)); await hasRequest('kurou');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.mulligan()); await hasRequest('mulligan-close');
  assert.equal(await requestCount('mulligan-use'), 0);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.countdown(10));
  const beforeWait = await requestCount('kurou');
  await page.clock.fastForward(46000); await page.waitForTimeout(350);
  assert.ok(await requestCount('kurou') > beforeWait, '45 second limit releases burning delay');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.settle());
  await page.clock.fastForward(2000); await hasRequest('settle');
  await root.getByText('已完成 1 局', { exact: true }).waitFor();
  await page.waitForFunction(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'point' && r[1] === 0 && r[2] === 1).length >= 2);
  await root.getByRole('button', { name: '停止速刷', exact: true }).click();
  const stopped = await requestCount('kurou'); await page.clock.fastForward(3000); assert.equal(await requestCount('kurou'), stopped);
  checks.push('isolated default-off plugin; keyboard role/pick/switch; host slot 0 Huang Gai submitted without opening a point-card window; native enabled button containers with mouseEnabled=false; explicit normal-AI callback before start; detached visible selection cache does not block Kurou; 45s/3s delay, native cancleBtn mulligan refusal, settlement, next-round point reissue, stop');

  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.room('rebel'));
  await root.getByRole('button', { name: '反贼大号', exact: true }).click();
  await root.getByRole('button', { name: '按序点将', exact: true }).click();
  await root.getByRole('button', { name: '开始速刷', exact: true }).click(); await hasRequest('ready');
  assert.ok(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.some(r => r[0] === 'point' && r[1] === 2 && r[2] === 2)), 'ordered pick prioritizes completed skill achievement');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.selection()); await hasRequest('select', 2);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.mulligan());
  await page.waitForTimeout(400); assert.equal(await requestCount('mulligan-use'), 0);
  assert.equal(await requestCount('trustee'), 0);
  await page.clock.fastForward(21000); await hasRequest('trustee', true);
  assert.equal(await requestCount('open-dianjiang'), 0, 'rebel slot submission also leaves point-card selection closed');
  checks.push('rebel slot 2 ordered unfinished achievement selection; ready once; no trustee during opening guard; no mulligan resource use');

  await root.getByRole('button', { name: '停止速刷', exact: true }).click();
  // The same rebel entry accepts training, while all point preferences remain stored.
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, c = window.Laya.ClassUtils.getClass('GameContext');
    c.GetModeVO = () => ({ ModeID: 160, Section: 3 }); c.GetGroupID = () => 3;
    d.battle();
    d.scene.requestAiHelp = () => d.requests.push(['assistant-request']);
    d.scene.SelfSeatUi.buttonBar.visible = true;
    d.scene.SelfSeatUi.CurStepHelpData = { buttonName: 'btnCancel' };
  });
  assert.equal(await root.getByRole('switch', { name: '取消无懈', exact: true }).isChecked(), true);
  const pointBeforeTraining = await requestCount('point');
  await root.getByRole('button', { name: '开始速刷', exact: true }).click();
  await hasRequest('cancel');
  await page.evaluate(() => {
    const d=window.__SGS_TOOLBOX_DEMO__;
    const win={name:'SelectSkinWindow',generalID:2,selectView:{usingSkinID:9,itemList:[]},Close(){d.requests.push(['skin-close']);this.visible=false;}};
    d.scene._children=[win];
  });
  await page.clock.fastForward(500); await hasRequest('skin-close');
  assert.equal(await requestCount('skin-close'),1);
  await page.evaluate(() => { window.__SGS_TOOLBOX_DEMO__.scene._children=[]; });
  const wuxieCancelBefore = await requestCount('cancel');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    self.buttonBar.visible = true;
    self.cardContainer = { selectCardContext: { SpecifySkillId: 13, Skill: { SkillId: 13 } }, cardUis: [{ activated: true, Card: { CardId: 13 }, setSelected() { throw Error('must not select Wuxie'); } }],
      AllSelectHandCards() { throw Error('must not all-select during Wuxie'); } };
    self.CurStepHelpData = { cardIds: [13], buttonName: 'btnOK' };
  });
  await page.clock.fastForward(1250);
  await page.waitForFunction(count => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'cancel').length > count, wuxieCancelBefore);
  assert.equal(await requestCount('cancel'), wuxieCancelBefore + 1);
  const wuxieFile = resolve(output, 'wuxie-guard-248.png');
  await host.evaluate(node => { node.style.width = '248px'; }); await host.screenshot({ path: wuxieFile }); screenshots.push(wuxieFile);
  await root.getByRole('switch', { name: '取消无懈', exact: true }).click();
  assert.equal(await root.getByRole('switch', { name: '取消无懈', exact: true }).isChecked(), false);
  await root.getByRole('switch', { name: '取消无懈', exact: true }).click();
  const cancelsBeforeTimeout = await requestCount('cancel');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    self.CurStepHelpData = null;
    self.cardContainer = { selectCardContext: { message: '是否发动应援，选择一名角色，使其获得一张锦囊牌或取消' } };
    self.buttonBar.visible = true;
    self.buttonBar.btns[0].onClick = () => { d.requests.push(['cancel']); self.buttonBar.visible = false; };
  });
  await page.clock.fastForward(1500);
  await page.waitForFunction(count => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'cancel').length > count, cancelsBeforeTimeout);
  assert.equal(await requestCount('cancel'), cancelsBeforeTimeout + 1, 'missing AI strategy cancels optional Yingyuan once');
  assert.equal(await requestCount('mulligan-use'), 0);
  await root.getByText('单骑人机不支持点将 · 设置暂不生效', { exact: true }).waitFor();
  assert.equal(await root.getByRole('button', { name: '按序点将', exact: true }).isDisabled(), true);
  assert.equal(await requestCount('point'), pointBeforeTraining);
  await host.evaluate(node => { node.style.width = '248px'; }, null);
  const trainingFile = resolve(output, 'training-248.png'); await host.screenshot({ path: trainingFile }); screenshots.push(trainingFile);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.proxy.event('MsgGameOver', {});
    d.scene._children = [{ name: 'RogueLike1v1ZhanJiWindow', onClickAgain() { d.requests.push(['training-again']); } }];
  });
  await page.clock.fastForward(2000); await hasRequest('training-again');
  await page.clock.fastForward(2000); assert.equal(await requestCount('training-again'), 1);
  await root.getByRole('button', { name: '停止速刷', exact: true }).click();
  await page.evaluate(() => {
    const c = window.Laya.ClassUtils.getClass('GameContext'); c.GetModeVO = () => ({ ModeID: 1 }); delete c.GetGroupID;
    window.__SGS_TOOLBOX_DEMO__.room('rebel');
  });
  checks.push('training uses rebel entry; point setting remains disabled and sends no point request; executes explicit assistant hint; skin selection retains current skin through native Close; cancel-Wuxie switch overrides AI and blocks all-select; missing AI strategy cancels Yingyuan after waiting; requests next training game once; training UI screenshot at 248px');

  const themes = {
    dark: { bg: '#201e1a', surface: '#2c2922', raised: '#393329', text: '#eee3cc', muted: '#b7aa8c', accent: '#dbba70', border: '#665b42', danger: '#e57575', scheme: 'dark' },
    light: { bg: '#f4f0e6', surface: '#fffcf4', raised: '#e8dfcc', text: '#302b24', muted: '#706658', accent: '#8c6528', border: '#c6b897', danger: '#a83338', scheme: 'light' },
  };
  for (const [theme, tokens] of Object.entries(themes)) for (const width of [248, 280, 420]) {
    await host.evaluate((node, { width, tokens }) => { node.style.width = width + 'px'; node.style.top = '16px'; node.style.left = '24px'; node.style.right = 'auto'; for (const [key, value] of Object.entries(tokens)) node.style.setProperty('--sgs-' + key, value); }, { width, tokens });
    await page.evaluate(theme => { document.body.style.background = theme === 'light' ? '#e9e4da' : '#172025'; }, theme);
    await page.waitForTimeout(100);
    assert.equal(await root.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, `${theme} ${width}px overflow`);
    const file = resolve(output, `${theme}-${width}.png`); await host.screenshot({ path: file }); screenshots.push(file);
  }
  await root.getByRole('button', { name: '盖主小号', exact: true }).click();
  assert.equal(await root.getByRole('switch', { name: '等1分钟', exact: true }).evaluate(node => getComputedStyle(node).appearance), 'none');
  for (const [theme, tokens] of Object.entries(themes)) {
    await host.evaluate((node, tokens) => { node.style.width = '280px'; for (const [key, value] of Object.entries(tokens)) node.style.setProperty('--sgs-' + key, value); }, tokens);
    const file = resolve(output, `${theme}-host-280.png`); await host.screenshot({ path: file }); screenshots.push(file);
  }
  const pkg = await makePluginPackage(await bundlePlugin('gaizhu'));
  const upgrade = await makePluginPackage(await bundlePlugin('gaizhu'), '0.1.5-local');
  await page.evaluate(async ({ pkg, upgrade }) => { const m = window[Symbol.for('sgs.ol.toolbox.core')].manager;
    await m.install(pkg); await m.disable('gaizhu'); await m.enable('gaizhu'); await m.reload('gaizhu'); await m.install(upgrade); await m.rollback('gaizhu'); }, { pkg, upgrade });
  assert.equal(await root.getByRole('button', { name: '开始速刷', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()[0].version), pkg.manifest.version);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.proxy._events.MsgGameOver?.length), 1);
  assert.equal(await root.getByRole('switch', { name: '等1分钟', exact: true }).isChecked(), true, 'account preference retained');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.room('host'));
  await root.getByRole('button', { name: '开始速刷', exact: true }).click();
  await root.getByRole('button', { name: '停止速刷', exact: true }).waitFor();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.switchAccount());
  await root.getByRole('button', { name: '开始速刷', exact: true }).waitFor();
  assert.equal(await root.getByRole('switch', { name: '等1分钟', exact: true }).isChecked(), false, 'new account defaults');
  // A host selection without Huang Gai must stop and preserve actionable details.
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.selection(true));
  await root.getByRole('button', { name: '开始速刷', exact: true }).click();
  await root.getByRole('button', { name: '停止速刷', exact: true }).waitFor();
  await root.getByText('等待选择黄盖', { exact: true }).waitFor();
  await page.waitForTimeout(400); await page.clock.fastForward(21000);
  await root.getByRole('button', { name: '开始速刷', exact: true }).waitFor();
  await root.locator('.gz-error').filter({ hasText: '仍未找到黄盖' }).waitFor();
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()
    .some(plugin => plugin.id === 'gaizhu' && /仍未找到黄盖/.test(plugin.error || '')));
  await page.clock.fastForward(1000);
  assert.equal(await root.getByRole('button', { name: '开始速刷', exact: true }).count(), 1, 'automatic recovery preserves the stopped state');
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.proxy._events.MsgGameOver?.length), 1, 'automatic recovery does not duplicate native listeners');
  await root.locator('.gz-error summary').click();
  assert.match(await root.locator('.gz-error pre').textContent(), /仍未找到黄盖/);
  const errorFile = resolve(output, 'selection-error.png'); await host.screenshot({ path: errorFile }); screenshots.push(errorFile);
  await page.setViewportSize({ width: 900, height: 340 });
  const lowFile = resolve(output, 'low-height.png'); await host.screenshot({ path: lowFile }); screenshots.push(lowFile);
  await page.evaluate(async () => { await window[Symbol.for('sgs.ol.toolbox.core')].manager.uninstall('gaizhu'); });
  assert.equal(await root.count(), 0);
  assert.equal(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.proxy._events.MsgGameOver?.length), 0);
  checks.push('ten screenshots: dark/light 248/280/420, host switch, full selection error and low-height scrolling; install/disable/enable/reload/upgrade/rollback; per-account preferences; account switch stops; missing Huang Gai stops and retains full error plus management reminder after automatic recovery; uninstall removes listeners');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ environment: 'offline Chromium synthetic game fixture; not official live gameplay', checks, screenshots, errors }, null, 2));
  console.log(JSON.stringify({ checks, screenshots, errors }, null, 2));
} catch (e) { console.error('Browser checks failed; page errors:', errors); throw e; }
finally { await browser?.close(); await server.close(); }
