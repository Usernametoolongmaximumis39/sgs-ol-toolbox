import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { chromium } from 'playwright';
import { createMarketServer } from './market-server.mjs';
import { bundlePlugin, makePluginPackage } from './plugin-packages.mjs';

const output = resolve('test-results/gaizhu-browser'); await mkdir(output, { recursive: true });
const server = await createMarketServer({ port: 0 }), errors = [], checks = [], screenshots = [];
let browser;
let demoPage;
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
  const page = demoPage = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(12000);
  await page.clock.install();
  await page.goto(`${server.url}/dev/gaizhu.html`);
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  const host = page.locator('[data-sgs-toolbox="core"]'), root = host.locator('[data-gaizhu]');
  await host.locator('[data-category=automation]').click(); await root.waitFor();
  const requestCount = type => page.evaluate(type => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === type).length, type);
  const hasRequest = (type, value) => page.waitForFunction(({ type, value }) => window.__SGS_TOOLBOX_DEMO__.requests.some(r => r[0] === type && (value === undefined || r[1] === value)), { type, value });
  const panelButton = name => root.getByRole('button', { name, exact: true });
  const waitCount = (type, after) => page.waitForFunction(({ type, after }) =>
    window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === type).length > after, { type, after });
  const setFont = async font => {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '外观', exact: true }).click();
    await host.locator(`[data-font-size=${font}]`).click();
    await host.locator('[data-category=automation]').click();
  };
  const widths = [248, 280, 420], fonts = ['tiny', 'small', 'standard', 'large'];
  const applyLayout = (width) => host.evaluate((node, width) => {
    node.style.width = width + 'px'; node.style.top = '12px'; node.style.left = '24px'; node.style.right = 'auto';
    node.shadowRoot.querySelector('.shell').style.width = '100%';
  }, width);
  const assertLayout = async (width, label) => {
    const sizes = await root.evaluate(panel => {
      const bounds = panel.getBoundingClientRect(), shell = panel.closest('.shell'), outer = shell.getRootNode().host;
      const tooWide = [...panel.querySelectorAll('button')].filter(button => {
        if (!button.getClientRects().length) return false;
        const range = panel.ownerDocument.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect(), buttonBounds = button.getBoundingClientRect();
        return buttonBounds.width < 26 || buttonBounds.height < 26 || text.left < buttonBounds.left - 1 || text.right > buttonBounds.right + 1;
      }).map(button => button.textContent);
      return { outer: outer.getBoundingClientRect().width, inner: shell.getBoundingClientRect().width,
        bounds: [bounds.left, bounds.right], shellBounds: [shell.getBoundingClientRect().left, shell.getBoundingClientRect().right],
        panel: panel.clientWidth, scroll: panel.scrollWidth, fontSize: getComputedStyle(panel).fontSize, tooWide };
    });
    assert.ok(Math.abs(sizes.outer - width) < 2 && Math.abs(sizes.inner - width) < 2 &&
      sizes.scroll <= sizes.panel + 1 && sizes.bounds[0] >= sizes.shellBounds[0] && sizes.bounds[1] <= sizes.shellBounds[1] &&
      !sizes.tooWide.length, `${label} ${width}px ${JSON.stringify(sizes)}`);
    return sizes.fontSize;
  };
  const themes = {
    dark: { id: 'core.black-gold', scheme: 'dark', backdrop: '#172025' },
    light: { id: 'core.gaizhu-light-fixture', scheme: 'light', backdrop: '#e9e4da' },
  };
  await page.evaluate(() => {
    const api = window[Symbol.for('sgs.ol.toolbox.core')];
    api.themes.register({ id: 'core.gaizhu-light-fixture', name: '浅色演练', tokens: {
      bg: '#f4f0e6', surface: '#fffcf4', raised: '#e8dfcc', text: '#302b24', muted: '#706658',
      accent: '#8c6528', border: '#c6b897', danger: '#a83338', scheme: 'light',
    } });
  });
  const setTheme = t => page.evaluate(theme => {
    window[Symbol.for('sgs.ol.toolbox.core')].themes.select(theme.id);
    document.body.style.background = theme.backdrop;
  }, t);
  const saveScreenshot = async name => {
    const path = resolve(output, name + '.png');
    await host.screenshot({ path, animations: 'disabled' });
    screenshots.push(path);
  };
  const roleLabel = { host: '盖主小号', rebel: '反贼大号', auto: '自动挂机' };
  async function captureStates(states) {
    const measuredFonts = new Set();
    for (const [theme, tokens] of Object.entries(themes)) {
      await setTheme(tokens);
      for (const font of fonts) {
        await setFont(font);
        for (const state of states) {
          if (state === 'confirm') await panelButton('确认并开始速刷').waitFor();
          else {
            await panelButton(roleLabel[state]).click();
            if (state === 'auto') await panelButton('酒馆三项领齐').click();
          }
          for (const width of widths) {
            await applyLayout(width);
            measuredFonts.add(await assertLayout(width, `${state}/${theme}/${font}`));
            await saveScreenshot(`${state}-${theme}-${font}-${width}`);
          }
        }
      }
    }
    assert.equal(measuredFonts.size, fonts.length, 'all four font sizes must affect plugin layout');
    await page.setViewportSize({ width: 900, height: 360 });
    await applyLayout(248);
    for (const [theme, tokens] of Object.entries(themes)) {
      await setTheme(tokens);
      for (const state of states) {
        if (state !== 'confirm') await panelButton(roleLabel[state]).click();
        const action = state === 'confirm' ? panelButton('确认并开始速刷')
          : panelButton(state === 'auto' ? '开始挂机' : '开始速刷');
        await action.scrollIntoViewIfNeeded();
        await assertLayout(248, `${state}/${theme}/low`);
        await saveScreenshot(`${state}-${theme}-low`);
      }
    }
    await page.setViewportSize({ width: 1120, height: 920 });
    await setTheme(themes.dark);
    await setFont('standard');
  }
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
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, classes = window.Laya.ClassUtils, getClass = classes.getClass;
    d.room('host');
    const room = d.scene, view = room.seatListView;
    view.seatList = Array.from({ length: 8 }, (_, SeatId) => ({ SeatId, SeatStatus: 0,
      WaitInfo: SeatId === 5 ? { clientId: d.self.ClientId, isMaster: true } : null }));
    view.showBtns = function (seat) {
      this.currentSeat = seat;
      this.addAiBtn = { visible: true }; this.addAiMBtn = { visible: true }; this.addAiSBtn = { visible: true };
    };
    view.addAiHandler = function (type, seat) {
      if (seat !== this.currentSeat || seat.WaitInfo) throw new Error('unexpected solo seat');
      d.requests.push(['solo-ai', seat.SeatId, type]);
      if (seat.SeatId === 0 && !this.missedFirstSeat) { this.missedFirstSeat = true; return; }
      seat.WaitInfo = { clientId: 900 + seat.SeatId, ready: true };
    };
    room.startUI.startBtn.onClick = () => {
      if (view.seatList.some(seat => !seat.WaitInfo)) throw new Error('solo start before filling seats');
      d.requests.push(['solo-start']); d.selection();
      const win = getClass('WindowManager').WindowInstanceDict._maps.SelectGeneralWindow;
      for (const card of win.generalUis) card.generalInfo = { itemId: card.GeneralId, quality: ({ 2: 2, 3: 4, 5: 8 })[card.GeneralId] ?? 0 };
    };
    const achievement = getClass('AchievementManager'), query = achievement.sendGetAchInfo;
    achievement.sendGetAchInfo = (NickName, requestType) => d.proxy.event('ClientDbsGetuserachinfoRep', { NickName, requestType, Achs: [
      { id: 102, type: 2, detailInfo: 99 }, { id: 103, type: 2, detailInfo: 1 }, { id: 1005, type: 1, detailInfo: 10 },
    ] });
    const shield = {
      GetNewGeneralPoolComplianceByModeIdAndSection() {
        return this.GetNewGeneralPoolCompliance({ Id: 1, InFactGeneralList: [1, 2, 3, 4, 5], MinGOpen: 1, CanCloseBfAllCnt: 0 }, false);
      },
      GetShieldGeneralGameModelNodeByIndex: () => ({ scheme_id: 12 }),
      GetShieldGeneralState: () => false, InShieldCloseGeneral: () => true,
      SendClientShieldGeneralBatchReq(scheme, close, open) { d.requests.push(['solo-ban', scheme, close, open]); throw new Error('synthetic rejection'); },
    };
    classes.getClass = name => name === 'GameShieldGeneralManager' ? shield : getClass(name);
    d.finishSoloFixture = () => { classes.getClass = getClass; achievement.sendGetAchInfo = query; delete d.finishSoloFixture; };
  });
  await panelButton('自动挂机').click();
  await panelButton('身份').click();
  await root.getByRole('button', { name: '不点将', exact: true }).click();
  await root.getByText(/写入游戏禁将方案/).waitFor();
  await host.evaluate(node => { node.style.width = '248px'; });
  const soloFile = resolve(output, 'solo-off-248.png'); await host.screenshot({ path: soloFile }); screenshots.push(soloFile);
  await panelButton('开始挂机').click();
  await page.clock.runFor(10000);
  await hasRequest('solo-start'); await hasRequest('select', 3);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'solo-ai')),
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 3], [6, 3], [7, 3], [0, 1]].map(([seat, type]) => ['solo-ai', seat, type]));
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'solo-ban')), [['solo-ban', 12, [5], []]]);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    Object.assign(self.seat, { Figure: 3, InOwnRound: true });
    self.cardContainer = { cardUis: [{ selected: true, Card: { FirstSkillId: 1 } }] };
    const ok = { name: 'btnOK', enabled: false, onClick() { d.requests.push(['solo-attack']); this.enabled = false; } };
    self.buttonBar.visible = true;
    self.buttonBar.btns = [ok];
    d.scene.seatContainer = { seatUIs: [3, 1].map(Figure => ({
      activated: true, seat: { Figure },
      seatClickHandler() {
        this.seat.Selected = true; d.requests.push(['solo-attack-target', Figure]); ok.enabled = true;
      },
    })) };
  });
  await page.clock.fastForward(1500);
  await hasRequest('solo-attack');
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'solo-attack-target')),
    [['solo-attack-target', 1]]);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    const [ally, lord] = d.scene.seatContainer.seatUIs.map(ui => ui.seat);
    Object.assign(self.seat, { Index: 0, InOwnRound: false });
    Object.assign(ally, { Index: 1 });
    Object.assign(lord, { Index: 2 });
    d.soloRescuePrompt = (target, hinted) => {
      const dying = target === 'lord' ? lord : ally;
      dying.IsAskingTao = true;
      const finish = result => {
        d.requests.push([result, target]);
        dying.IsAskingTao = false; self.buttonBar.visible = false;
        self.CurStepHelpData = null; self.cardContainer = null;
      };
      const ok = { name: 'btnOK', enabled: false, onClick: () => finish('solo-rescue-play') };
      const cancel = { name: 'btnCancel', enabled: true, onClick: () => finish('solo-rescue-cancel') };
      const card = { activated: true, Card: { CardId: 42, FirstSkillId: 3 },
        CardUI_Click() { this.setSelected(true); },
        setSelected(value) { this.selected = value; ok.enabled = value; d.requests.push(['solo-rescue-card', target]); },
      };
      self.cardContainer = { selectCardContext: { SpecifySkillId: 3 }, cardUis: [card] };
      Object.assign(self.buttonBar, { visible: true, btns: [ok, cancel] });
      self.CurStepHelpData = hinted ? { cardIds: [42] } : null;
    };
    d.soloRescuePrompt('lord', true);
  });
  await page.clock.runFor(1250);
  await hasRequest('solo-rescue-cancel', 'lord');
  assert.equal(await requestCount('solo-rescue-card'), 0);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.soloRescuePrompt('ally', false);
    delete d.soloRescuePrompt;
  });
  await page.clock.runFor(1500);
  await hasRequest('solo-rescue-play', 'ally');
  assert.equal(await requestCount('solo-rescue-cancel'), 1);
  checks.push('identity skips the dying enemy before its Peach hint and uses the local fallback to rescue a confirmed ally');
  await panelButton('停止挂机').click();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.finishSoloFixture());
  await root.getByRole('button', { name: '按序点将', exact: true }).click();
  checks.push('identity auto without point cards retries missed robot, selects the highest-quality unfinished general, tolerates failed ban and attacks the lord in target-only local fallback');

  // Single-rider AI can also start from an existing game.
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.trainingBattle();
    d.scene.requestAiHelp = () => d.requests.push(['assistant-request']);
    const self = d.scene.SelfSeatUi;
    self.Ai = self.buttonBar;
    delete self.buttonBar;
    self.getButtonBar = function () { return this.Ai; };
    self.Ai.visible = true;
    self.Ai.btns[0].onClick = () => { d.requests.push(['cancel']); self.Ai.visible = false; };
    self.CurStepHelpData = { buttonName: 'btnCancel' };
  });
  await panelButton('单骑').click();
  assert.equal(await root.getByRole('switch', { name: '取消无懈', exact: true, includeHidden: true }).count(), 0);
  const pointBeforeTraining = await requestCount('point');
  await panelButton('开始挂机').click();
  await hasRequest('cancel');
  await page.evaluate(() => {
    const d=window.__SGS_TOOLBOX_DEMO__;
    const win={name:'SelectSkinWindow',generalID:2,selectView:{usingSkinID:9,itemList:[]},Close(){d.requests.push(['skin-close']);this.visible=false;}};
    d.scene._children=[win];
  });
  await page.clock.fastForward(500); await hasRequest('skin-close');
  assert.equal(await requestCount('skin-close'),1);
  await page.evaluate(() => { window.__SGS_TOOLBOX_DEMO__.scene._children=[]; });
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, scene = d.scene, self = scene.SelfSeatUi;
    const original = self.Ai.btns;
    const target = { Seat: { Index: 1, Hp: 4, HandCardCount: 1, EquipCardCount: 1,
      EquipCards: [{ FirstSkillId: 16 }], IsAskingTao: true }, Activated: false,
    seatClickHandler() { this.Seat.Selected = true; ok.enabled = true; } };
    scene.seatContainer = { seatUIs: [target] };
    Object.assign(self.seat, { Index: 0, InOwnRound: true, LastAskSkill: { ID: 3 }, GetStateValue: () => 0 });
    const peach = { Activated: true, Card: { CardId: 20, FirstSkillId: 3 },
      CardUI_Click() { d.requests.push(['enemy-peach']); } };
    self.cardContainer = { cardUis: [peach] };
    self.CurStepHelpData = { target: peach };
    self.Ai.btns = [{ name: 'btnCancel', enabled: true, onClick() {
      d.requests.push(['enemy-peach-declined']);
      this.enabled = false;
    } }];
    self.Ai.visible = true;

    const slash = { Card: { CardId: 21, FirstSkillId: 1 }, Activated: true,
      CardUI_Click() { hand.CardUI_Click({ CardUi: this }); } };
    const wine = { Card: { CardId: 22, FirstSkillId: 82 }, Activated: true };
    const ok = { name: 'btnOK', enabled: false, onClick() {
      if (wine.Selected) { d.requests.push(['wine-play']); return; }
      if (!slash.Selected || !target.Seat.Selected) throw Error('Slash confirmed without a native target');
      d.requests.push(['slash-play']);
      self.cardContainer = {};
      self.SelectSeatContext = null;
      self.seat.InActiveState = false;
      self.seat.LastAskSkill = { ID: 201 };
      d.proxy.event('GsCTriggerSpellNew', { SrcSpellID: 1, SrcSpellCasterSeat: 0,
        FirstTriggerParam: { SpellId: 201, SeatId: 0, Targets: [1] } });
      self.Ai.btns = [
        { name: 'btnOK', enabled: true, onClick() { d.requests.push(['ice-sword-use']); } },
        { name: 'btnCancel', enabled: true, onClick() {
          d.requests.push(['ice-sword-declined']);
          this.enabled = false;
          self.Ai.btns = original;
          self.Ai.visible = false;
          self.seat.LastAskSkill = null;
          self.CurStepHelpData = null;
        } },
      ];
      self.CurStepHelpData = { target: self.Ai.btns[0] };
    } };
    const hand = { cardUis: [slash, wine], CardUI_Click({ CardUi }) {
      select(CardUi.Selected ? null : CardUi);
    } };
    function select(ui) {
      slash.Selected = ui === slash;
      wine.Selected = ui === wine;
      target.Activated = ui === slash;
      target.Seat.Selected = false;
      hand.SelectContext.CardSelector.FirstSelectedCard = ui?.Card;
      self.SelectSeatContext = ui === slash ? { Card: slash.Card, get SelectedTargetSeatIDs() {
        return target.Seat.Selected ? [1] : [];
      } } : null;
      ok.enabled = ui === wine;
    }
    function nextPlay() {
      hand.SelectContext = { Purpose: 'deal', Message: '出牌阶段，请选择一张卡牌', CardSelector: {} };
      select(null);
    }
    d.beginWineSlash = () => {
      target.Seat.IsAskingTao = false;
      Object.assign(self.seat, { InActiveState: true, LastAskSkill: null });
      self.cardContainer = hand;
      nextPlay();
      self.CurStepHelpData = { cardIds: [21], seatIds: [1], buttonName: 'btnOK' };
      self.Ai.btns = [ok];
    };
    d.acknowledgeWine = () => {
      hand.cardUis = [slash];
      nextPlay();
    };
  });
  await hasRequest('enemy-peach-declined');
  assert.equal(await requestCount('enemy-peach'), 0);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.beginWineSlash());
  await hasRequest('wine-play');
  await page.clock.fastForward(1250);
  assert.equal(await requestCount('wine-play'), 1);
  assert.equal(await requestCount('slash-play'), 0);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.acknowledgeWine());
  await hasRequest('slash-play');
  await hasRequest('ice-sword-declined');
  assert.equal(await requestCount('ice-sword-use'), 0);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.map(([type]) => type)
    .filter(type => ['enemy-peach-declined', 'wine-play', 'slash-play', 'ice-sword-declined'].includes(type))),
  ['enemy-peach-declined', 'wine-play', 'slash-play', 'ice-sword-declined']);
  checks.push('training declines an enemy Peach hint, confirms Wine before Slash with a delayed native update, and keeps the damage instead of using Ice Sword');
  const wuxieCancelBefore = await requestCount('cancel');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    self.Ai.visible = true;
    const card = { activated: true, Card: { CardId: 13, FirstSkillId: 13 },
      CardUI_Click() { this.selected = true; d.requests.push(['wuxie-card']); } };
    self.Ai.btns.push({ name: 'btnOK', enabled: true, onClick() { d.requests.push(['wuxie-confirm']); this.enabled = false; } });
    self.cardContainer = { selectCardContext: { SpecifySkillId: 13, Skill: { SkillId: 13 } }, cardUis: [card],
      AllSelectHandCards() { throw Error('must not all-select during Wuxie'); } };
    self.CurStepHelpData = { cardIds: [13], buttonName: 'btnOK' };
  });
  await page.clock.fastForward(1250);
  await hasRequest('wuxie-card');
  await hasRequest('wuxie-confirm');
  assert.equal(await requestCount('cancel'), wuxieCancelBefore);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    const previous = self.Ai.btns;
    const ok = { name: 'btnOK', enabled: false, onClick() {
      d.requests.push(['wooden-ox-confirm']);
      self.CurStepHelpData = null;
      self.cardContainer = {};
      self.Ai.btns = previous;
      self.Ai.visible = false;
    } };
    const protocol = { _className_: 'GsCUseSpell', SpellID: 700, CardIDs: [42] };
    const cost = { Card: { CardId: 42 }, activated: false, CardUI_Click() {
      this.selected = true;
      ok.enabled = true;
      d.requests.push(['wooden-ox-cost']);
      self.CurStepHelpData = { protocol, buttonName: 'btnOK' };
    } };
    const treasure = { Card: { CardId: 70, FirstSkillId: 700, Equipped: true }, activated: true, CardUI_Click() {
      this.selected = true;
      cost.activated = true;
      self.cardContainer.selectCardContext = { Skill: { ID: 700 }, SelectCountMin: 1, SelectCountMax: 1 };
      d.requests.push(['wooden-ox-skill']);
      self.CurStepHelpData = { protocol, cardUis: [cost], cardIds: [42], target: cost };
    } };
    self.Ai.btns = [ok];
    self.Ai.visible = true;
    self.cardContainer = { cardUis: [cost], equipCardUis: [treasure] };
    self.CurStepHelpData = { protocol, skillId: 700, cardUis: [treasure], target: treasure };
  });
  await page.clock.fastForward(1250);
  await hasRequest('wooden-ox-confirm');
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests
    .map(([type]) => type).filter(type => type.startsWith('wooden-ox-'))),
  ['wooden-ox-skill', 'wooden-ox-cost', 'wooden-ox-confirm']);
  checks.push('training AI follows the equipped Wooden Ox hint, selects its hand-card cost, and confirms once');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    const previous = self.Ai.btns;
    const card = { CardId: 42, FirstSkillId: 85 };
    self.cardContainer = { SelectContext: { CardSelector: { FirstSelectedCard: card }, SelectedCardIds: [42] },
      cardUis: [{ Card: card, Selected: true }] };
    self.SelectSeatContext = { SelectedTargetSeatIDs: [self.seat.SeatId] };
    self.CurStepHelpData = null;
    self.Ai.btns = [
      { name: 'btnOK', enabled: true, onClick() { d.requests.push(['iron-chain-use']); } },
      { name: 'btnReset', enabled: true, onClick() {
        d.requests.push(['iron-chain-recast']);
        self.cardContainer = {};
        self.SelectSeatContext = null;
        self.Ai.btns = previous;
        self.Ai.visible = false;
      } },
    ];
    self.Ai.visible = true;
  });
  await page.clock.fastForward(1500);
  await hasRequest('iron-chain-recast');
  assert.equal(await requestCount('iron-chain-use'), 0);
  assert.equal(await requestCount('iron-chain-recast'), 1);
  checks.push('training fallback uses native Iron Chain recast when normal confirm and a selected target are both present');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    const card = { CanBeSelected: true };
    d.scene._children = [{ name: 'SelectCardWindow', handCardUis: [card], selectCardUis: [],
      Skill: { SelectCardCountWhenResponse: 3, SelectCardCountMinResponse: 1 }, confirm_btn: { enabled: false },
      onTouchCard({ target }) {
        this.selectCardUis.push(target); this.confirm_btn.enabled = true;
        d.requests.push(['popup-pick']);
      },
      confirmClick() { d.requests.push(['popup-confirm']); this.visible = false; },
    }];
  });
  await page.clock.fastForward(3500);
  await hasRequest('popup-confirm');
  assert.equal(await requestCount('popup-pick'), 1);
  assert.equal(await requestCount('popup-confirm'), 1);
  await page.evaluate(() => { window.__SGS_TOOLBOX_DEMO__.scene._children = []; });
  checks.push('training lets the native card popup confirm after the legal minimum when no further cards are available');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    const equipment = type => ({ Card: { FirstSkill: { Type: type } }, CanBeSelected: true });
    d.scene._children = [{ name: 'SelectCardWindow', Skill: { ID: 5 },
      equipCardUis: [equipment(3), equipment(4), equipment(6), equipment(7)],
      handCardUis: [{ CanBeSelected: true }],
      onTouchCard({ target }) {
        d.requests.push(['dismantle-pick', target.Card?.FirstSkill.Type]);
        this.visible = false;
      },
    }];
    d.promptTaoyuan = hp => {
      const previous = self.Ai.btns;
      const finish = name => {
        d.requests.push([name, self.seat.Hp]);
        self.seat.InActiveState = false;
        self.cardContainer = {};
        self.CurStepHelpData = null;
        self.Ai.btns = previous;
        self.Ai.visible = false;
      };
      const selector = {};
      const ok = { name: 'btnOK', enabled: false, onClick() { finish('taoyuan-play'); } };
      const end = { name: 'btnDiscard', enabled: true, onClick() { finish('taoyuan-end'); } };
      const card = { Card: { CardId: 31, FirstSkillId: 12 }, Activated: true,
        CardUI_Click() { container.CardUI_Click({ CardUi: this }); } };
      const container = { cardUis: [card], SelectContext: { Purpose: 'deal', Message: '出牌阶段，请选择一张卡牌', CardSelector: selector },
        CardUI_Click({ CardUi }) {
          CardUi.Selected = !CardUi.Selected;
          selector.FirstSelectedCard = CardUi.Selected ? CardUi.Card : null;
          ok.enabled = CardUi.Selected;
        } };
      Object.assign(self.seat, { Hp: hp, MaxHp: 4, InActiveState: true });
      self.cardContainer = container;
      self.CurStepHelpData = { cardIds: [31], buttonName: 'btnOK' };
      self.Ai.btns = [ok, end];
      self.Ai.visible = true;
    };
  });
  await page.clock.fastForward(3500);
  await hasRequest('dismantle-pick', 6);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.promptTaoyuan(4));
  await page.clock.fastForward(1500);
  await hasRequest('taoyuan-end', 4);
  assert.equal(await requestCount('taoyuan-play'), 0);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.promptTaoyuan(3));
  await hasRequest('taoyuan-play', 3);
  checks.push('training uses the defensive mount in a Dismantlement popup and only follows a Taoyuan hint when wounded');
  const cancelsBeforeTimeout = await requestCount('cancel');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__, self = d.scene.SelfSeatUi;
    self.CurStepHelpData = null;
    self.cardContainer = { selectCardContext: { message: '是否发动应援，选择一名角色，使其获得一张锦囊牌或取消' } };
    self.Ai.visible = true;
  });
  await page.clock.fastForward(1500);
  await page.waitForFunction(count => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'cancel').length > count, cancelsBeforeTimeout);
  assert.equal(await requestCount('cancel'), cancelsBeforeTimeout + 1, 'missing AI strategy cancels optional Yingyuan once');
  assert.equal(await requestCount('mulligan-use'), 0);
  assert.equal(await panelButton('按序点将').count(), 0);
  assert.equal(await requestCount('point'), pointBeforeTraining);
  await host.evaluate(node => { node.style.width = '248px'; }, null);
  const trainingFile = resolve(output, 'training-248.png'); await host.screenshot({ path: trainingFile }); screenshots.push(trainingFile);
  const trainingEntries = await requestCount('training-entry');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.scene._children = [{ name: 'RogueLike1v1ZhanJiWindow', onClickAgain() {
      d.requests.push(['training-again']);
      d.trainingLobby();
      setTimeout(() => {
        d.trainingBattle();
        const self = d.scene.SelfSeatUi;
        self.buttonBar.visible = true;
        self.buttonBar.btns[0].onClick = () => { d.requests.push(['training-next-action']); self.buttonBar.visible = false; };
        self.CurStepHelpData = { buttonName: 'btnCancel' };
      }, 500);
    } }];
  });
  await page.clock.fastForward(2000); await hasRequest('training-again');
  await page.clock.fastForward(2000); await hasRequest('training-next-action');
  assert.equal(await requestCount('training-again'), 1);
  assert.equal(await requestCount('training-entry'), trainingEntries, 'native Again already submitted the next entry');
  await root.getByText('已完成 1 局', { exact: true }).waitFor();
  await page.evaluate(() => { window.__SGS_TOOLBOX_DEMO__.proxy.event('MsgGameOver', {}); });
  await root.getByText('已完成 2 局', { exact: true }).waitFor();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.trainingLobby());
  await page.clock.fastForward(1000); await waitCount('training-entry', trainingEntries);
  await page.clock.fastForward(1000);
  assert.equal(await requestCount('training-entry'), trainingEntries + 1, 'a dismissed result re-enters training once');
  await panelButton('停止挂机').click();
  checks.push('training from an existing game has no point or Wuxie-cancel controls; assistant confirms Wuxie, closes native skin, handles Yingyuan and continues through both native Again and an already dismissed result');

  const readPairedCounts = () => Promise.all(['point', 'ai', 'start'].map(requestCount));
  const beforeCreate = await readPairedCounts();
  await panelButton('盖主小号').click();
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.room('host', { number: 407424727 });
    d.hall();
  });
  await panelButton('创建盖主房').click();
  await panelButton('确认并开始速刷').waitFor();
  assert.equal(await panelButton('确认并开始速刷').isDisabled(), true);
  assert.equal(await root.locator('.gz-room-line b').textContent(), '24728');
  assert.match(await root.locator('[data-room-password]').textContent(), /密码 \d{1,4}/);
  await page.clock.fastForward(1500);
  assert.deepEqual(await readPairedCounts(), beforeCreate);
  await applyLayout(280); await saveScreenshot('confirm-waiting');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.setCompanion(true));
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-sgs-toolbox="core"]').shadowRoot.querySelector('[data-gaizhu]');
    const confirm = [...panel.querySelectorAll('button')].find(node => node.textContent === '确认并开始速刷');
    return !confirm.hidden && !confirm.disabled;
  });
  await captureStates(['confirm']);
  assert.deepEqual(await readPairedCounts(), beforeCreate);
  const selectedBeforeConfirm = await requestCount('select');
  await panelButton('确认并开始速刷').focus(); await page.keyboard.press('Enter');
  await waitCount('start', beforeCreate[2]);
  await waitCount('select', selectedBeforeConfirm);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.setCompanion(false);
    d.settle();
  });
  await panelButton('停止速刷').waitFor();
  await root.getByRole('status').filter({ hasText: /同伴.*离席|等待.*同伴/ }).waitFor();
  await page.clock.fastForward(2500);
  assert.equal(await requestCount('start'), beforeCreate[2] + 1);
  await panelButton('停止速刷').click();
  checks.push('password identity-room creation shows the final five room digits and password; no point, fill or start before keyboard confirmation; continuation waits when the confirmed companion leaves');

  const createBeforeLate = await requestCount('create-room');
  const lateCounts = await readPairedCounts();
  const beforePairedSit = await requestCount('sit');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.deferCreation(true); d.hall();
  });
  await panelButton('创建盖主房').click();
  await waitCount('create-room', createBeforeLate);
  await panelButton('停止速刷').click();
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.releaseCreation(); d.deferCreation(false); d.setCompanion(true);
  });
  await page.clock.fastForward(1500);
  assert.deepEqual(await readPairedCounts(), lateCounts);
  assert.equal(await requestCount('sit'), beforePairedSit);
  assert.equal(await panelButton('确认并开始速刷').count(), 0);

  await panelButton('自动挂机').click();
  await panelButton('身份').click(); await panelButton('手动停止').click();
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.deferSeatChange(true); d.hall();
  });
  const preIdentity = await requestCount('create-room');
  const beforeIdentityActions = await readPairedCounts();
  await panelButton('开始挂机').click();
  await waitCount('create-room', preIdentity);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'hall-mode').at(-1)), ['hall-mode', 74, 4]);
  await hasRequest('sit', 7);
  await root.getByRole('status').filter({ hasText: '等待换到反贼座位' }).waitFor();
  await page.clock.fastForward(500);
  assert.equal(await requestCount('sit'), beforePairedSit + 1);
  assert.deepEqual(await readPairedCounts(), beforeIdentityActions);
  assert.equal(await panelButton('确认并开始速刷').count(), 0);
  await saveScreenshot('identity-waiting-for-rebel-seat');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.releaseSeatChange(); d.deferSeatChange(false);
  });
  await hasRequest('sit-confirm', 7);
  await waitCount('start', beforeIdentityActions[2]);
  await panelButton('停止挂机').click();
  checks.push('identity auto-created room requests the eighth seat, waits for the native seat update before pointing, filling or starting, then starts from the rebel seat');

  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.deferCreation(true); d.deferSeatChange(true); d.hall();
  });
  const beforeTimeoutCreate = await requestCount('create-room');
  const beforeTimeoutSit = await requestCount('sit');
  const beforeTimeoutActions = await readPairedCounts();
  await panelButton('开始挂机').click();
  await waitCount('create-room', beforeTimeoutCreate);
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.releaseCreation(); d.deferCreation(false);
    const seats = d.scene.seatListView.seatList;
    seats[7].SeatStatus = 1;
    seats[6].waitInfo = { clientId: 99 };
  });
  await waitCount('sit', beforeTimeoutSit);
  await page.clock.fastForward(3500);
  await waitCount('sit', beforeTimeoutSit + 1);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'sit').slice(-2)),
    [['sit', 5], ['sit', 5]]);
  await page.clock.fastForward(10000);
  await panelButton('开始挂机').waitFor();
  await root.getByRole('status').filter({ hasText: '等待反贼座位确认超时' }).waitFor();
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.releaseSeatChange(); d.deferSeatChange(false);
  });
  await page.clock.fastForward(1500);
  assert.deepEqual(await readPairedCounts(), beforeTimeoutActions);
  assert.equal(await requestCount('sit'), beforeTimeoutSit + 2);
  checks.push('identity skips a closed seat and an occupied seat, retries after silence, then stops on timeout without starting after a late acknowledgement');

  await panelButton('国战').click();
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.hall());
  const preNation = await requestCount('create-room');
  const beforeNationStart = await requestCount('nation-start');
  const beforeNationCancel = await requestCount('cancel');
  await panelButton('开始挂机').click();
  await waitCount('create-room', preNation);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'hall-mode').at(-1)), ['hall-mode', 28, 4]);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'create-room').at(-1)), ['create-room', 'nation', '']);
  await waitCount('nation-start', beforeNationStart);
  await hasRequest('nation-select');
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'nation-select').at(-1)), ['nation-select', 2, 3]);
  await waitCount('cancel', beforeNationCancel);
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.settle());
  await waitCount('nation-start', beforeNationStart + 1);
  await panelButton('停止挂机').click();

  await panelButton('单骑').click(); await panelButton('定时').click();
  const hoursInput = root.getByRole('spinbutton', { name: '挂机时长（小时）' });
  await hoursInput.fill('0.002'); await hoursInput.press('Tab');
  await setTheme(themes.light);
  await applyLayout(248); await assertLayout(248, 'timed training'); await saveScreenshot('training-timed-248');
  await setTheme(themes.dark);
  const preTraining = await requestCount('training-entry');
  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.hall());
  await panelButton('开始挂机').click();
  await waitCount('training-entry', preTraining);
  assert.deepEqual(await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.requests.filter(r => r[0] === 'switch-scene').at(-1)), ['switch-scene', 'RogueLike1v1Scene']);
  await page.clock.fastForward(8500);
  assert.equal(await panelButton('停止挂机').count(), 1);
  const againBeforeTime = await requestCount('training-again');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.proxy.event('MsgGameOver', {});
    d.scene._children = [{ name: 'RogueLike1v1ZhanJiWindow', onClickAgain() { d.requests.push(['training-again']); },
      onClickClose() { d.requests.push(['training-close']); } }];
  });
  await hasRequest('training-close');
  await panelButton('开始挂机').waitFor();
  await page.clock.fastForward(2500);
  assert.equal(await requestCount('training-again'), againBeforeTime);
  checks.push('late room reply leaves automation stopped; native lobby entries for identity, nation and single-rider AI; nation fills seats, selects a same-country pair, advances a prompt and starts again after settlement; fractional timer finishes training settlement with zero next-game requests');

  await page.evaluate(() => window.__SGS_TOOLBOX_DEMO__.room('rebel'));
  await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.reload('gaizhu'));
  await panelButton('自动挂机').click();
  await panelButton('身份').click();
  await captureStates(['host', 'rebel', 'auto']);
  await panelButton('盖主小号').click();
  assert.equal(await root.getByRole('switch', { name: '等1分钟', exact: true }).evaluate(node => getComputedStyle(node).appearance), 'none');
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

  const beforeForce = await requestCount('point');
  const beforeSettings = await requestCount('room-settings');
  await page.evaluate(() => {
    const d = window.__SGS_TOOLBOX_DEMO__;
    d.room('host');
    d.scene.startUI.rc.TableSetting.Password = '';
    d.scene.startUI.rc.TableSetting.CanDianJiang = false;
  });
  await host.evaluate(h => {
    h.style.width = '248px';
    h.shadowRoot.querySelector('.shell').style.width = '100%';
  });
  await root.getByRole('button', { name: '开始速刷', exact: true }).click();
  const warning = root.getByRole('status').filter({ hasText: /密码.*自选身份.*允许点将/ });
  await warning.waitFor();
  assert.equal(await root.getByRole('button', { name: /^强制开始（[123]秒）$/ }).isDisabled(), true);
  const forceCooldownFile = resolve(output, 'force-cooldown-248.png');
  await host.screenshot({ path: forceCooldownFile }); screenshots.push(forceCooldownFile);
  await page.clock.fastForward(3100);
  const forceButton = root.getByRole('button', { name: '强制开始', exact: true });
  await forceButton.waitFor();
  assert.equal(await requestCount('point'), beforeForce);
  for (const font of ['tiny', 'small', 'standard', 'large']) {
    await host.locator('[data-category=manage]').click();
    await host.getByRole('button', { name: '外观', exact: true }).click();
    await host.locator(`[data-font-size=${font}]`).click();
    await host.locator('[data-category=automation]').click();
    for (const width of [248, 280, 420]) {
      await host.evaluate((h, width) => {
        h.style.width = width + 'px';
        h.shadowRoot.querySelector('.shell').style.width = '100%';
      }, width);
      const layoutFits = await forceButton.evaluate(button => {
        const panel = button.closest('[data-gaizhu]');
        const shell = panel.closest('.shell');
        const outer = shell.getRootNode().host.getBoundingClientRect();
        const bounds = shell.getBoundingClientRect(), text = button.lastElementChild;
        return { outer: outer.width, shell: bounds.width, scroll: panel.scrollWidth, panel: panel.clientWidth,
          label: text.offsetHeight, line: parseFloat(getComputedStyle(text).lineHeight) };
      });
      assert.ok(Math.abs(layoutFits.outer - width) < 2 && Math.abs(layoutFits.shell - width) < 2
        && layoutFits.scroll <= layoutFits.panel + 1 && layoutFits.label <= layoutFits.line + 1,
      `force warning and action fit ${font} at ${width}px: ${JSON.stringify(layoutFits)}`);
    }
  }
  await applyLayout(248);
  await setTheme(themes.dark);
  const forceReadyFile = resolve(output, 'force-ready-248.png');
  await host.screenshot({ path: forceReadyFile }); screenshots.push(forceReadyFile);
  await forceButton.focus(); await page.keyboard.press('Enter');
  await root.getByRole('button', { name: '停止速刷', exact: true }).waitFor();
  assert.equal(await requestCount('point'), beforeForce + 1);
  assert.equal(await requestCount('room-settings'), beforeSettings);
  await root.getByRole('button', { name: '停止速刷', exact: true }).click();
  checks.push('room settings failure stops and shows the manual checklist; disabled three-second cooldown; keyboard force start submits no room patch; action fits four fonts and 248/280/420px');

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
  checks.push('screenshots for three modules and confirmation at dark/light themes, four font sizes, widths 248/280/420, low height; install/disable/enable/reload/upgrade/rollback; account preferences and account-switch stop; retained selection error and management reminder; uninstall releases listeners');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ environment: 'offline Chromium synthetic game fixture; not official live gameplay', checks, screenshots, errors }, null, 2));
  console.log(JSON.stringify({ checks, screenshots, errors }, null, 2));
} catch (e) {
  const state = await demoPage?.evaluate(() => ({
    scene: window.__SGS_TOOLBOX_DEMO__?.scene?.SceneName,
    requests: window.__SGS_TOOLBOX_DEMO__?.requests.slice(-20),
    panel: document.querySelector('[data-sgs-toolbox="core"]')?.shadowRoot.querySelector('[data-gaizhu]')?.innerText,
  })).catch(() => null);
  console.error('Browser checks failed', JSON.stringify({ errors, state }, null, 2));
  throw e;
}
finally { await browser?.close(); await server.close(); }
