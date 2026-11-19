import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { BLACK_GOLD } from '../src/core/themes.js';
import { THEMES } from '../src/plugins/themes/palettes.js';
import { bundleCore } from './distribution-build.mjs';

const out = resolve('test-results/shanhetu-extra');
await mkdir(out, { recursive: true });
const fixture = await build({
  entryPoints: ['tests/fixtures/shanhetu-browser.js'], bundle: true, write: false, format: 'iife', globalName: 'ShanheCheck',
});
const laya = process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js');
const catalog = JSON.parse(await readFile('release/market/catalog.json', 'utf8'));
const entry = catalog.plugins.find(plugin => plugin.id === 'shanhetu-beta');
const pkg = JSON.parse(await readFile(resolve('release/market', entry.packageUrl), 'utf8'));
const mainEntry = catalog.plugins.find(plugin => plugin.id === 'shanhetu');
const mainPackage = JSON.parse(await readFile(resolve('release/market', mainEntry.packageUrl), 'utf8'));
const assistEntry = catalog.plugins.find(plugin => plugin.id === 'play-assist');
const assistPackage = JSON.parse(await readFile(resolve('release/market', assistEntry.packageUrl), 'utf8'));
const coldBundle = await bundleCore({ root: resolve('.'), edition: 'dev', packages: [mainPackage, pkg] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [], unexpected = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:') && !req.url().startsWith('data:')) unexpected.push(req.url()); });
const host = page.locator('[data-sgs-toolbox=core]');
try {
  const cold = await browser.newPage();
  try {
    const coldErrors = [];
    cold.on('pageerror', error => coldErrors.push(error.stack || error.message));
    await cold.route('**/shanhe-cold', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await cold.goto('http://127.0.0.1:17321/shanhe-cold');
    await cold.addScriptTag({ path: laya });
    assert.equal(await cold.evaluate(() => Boolean(Laya.stage)), false);
    await cold.addScriptTag({ content: coldBundle.code });
    await cold.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
    const states = await cold.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.list()
      .filter(plugin => ['shanhetu', 'shanhetu-beta'].includes(plugin.id))
      .map(({ id, active, error }) => ({ id, active, error })));
    assert.deepEqual(states, [
      { id: 'shanhetu', active: true, error: '' },
      { id: 'shanhetu-beta', active: true, error: '' },
    ]);
    await cold.addScriptTag({ content: fixture.outputFiles[0].text });
    await cold.evaluate(() => {
      ShanheCheck.setup();
      const { demo, manager } = shanheFixture;
      demo.configs.hd_roguelike.Root.ending = [
        { ID: 601, SeasonList: '6', endingName: '从龙之功', need_Tro: '1,1', special: '1,1' },
      ];
      demo.configs.hd_roguelike.Root.DifficultySelection.push({ seasonID: '5', difID: 1, bdif: 1, sdif: 1, sdifname: '普通1' });
      demo.configs.hd_roguelike.Root.EXDifficultySelection.push({ seasonID: '5', difID: 121, bdif: 5, sdif: 6, sdifname: '绝境1' });
      const root = demo.configs.hd_roguelike.Root;
      root.Chapter[0].seasonID = '5;6';
      root.Chapter.push({ seasonID: '5', chapter: 3, uniqueID: 10, chaptername: '洛阳', bosslocation: 103 });
      root.ChapterCS = [{ seasonID: '5', chapter: 3, apptime: 7 }];
      const tactics = [200, 200, 300, 500, 500, 500, 500, 500, 700, 700, 700].map((money, i) => ({ plot: 2600 + i, money }));
      const skills = [300, 1000].map((money, i) => ({ id: 3400 + i, money }));
      const cards = [150, 200, 200, 250, 200].map((money, i) => ({ id: 4800 + i, money, isequip: i === 4 ? 1 : 0 }));
      root.Tactics.push(...tactics);
      root.Spell.push(...skills);
      root.Card.push(...cards);
      shanheFixture.luoyangItems = [...tactics.map(item => item.plot), ...skills.map(item => item.id), ...cards.map(item => item.id)];
      manager.AllDatas.chapterData.record = { fightScore: 1000, items: [2100] };
      manager.AllDatas.chapterData.curEventData = { eventType: 3, eventId: 2001 };
      manager.AllDatas.gameData.itemId = [2100];
      manager.AllDatas.gameData.attrInfo = { tro: 1 };
      window[Symbol.for('sgs.ol.toolbox.core')].game.getScene();
    });
    const coldGroup = cold.locator('[data-plugin-group=shanhetu]');
    await coldGroup.getByText('魏延', { exact: false }).first().waitFor();
    await cold.evaluate(pkg => window[Symbol.for('sgs.ol.toolbox.core')].manager.install(pkg), assistPackage);
    const assist = cold.locator('[data-plugin-group=play-assist]');
    const extension = coldGroup.getByRole('button', { name: '拓展', exact: true });
    const score = coldGroup.locator('.shb-score');
    const ending = coldGroup.locator('.shb-panel details').filter({ hasText: '从龙之功' });
    await extension.press('Enter');
    await score.getByText('约 7,280', { exact: true }).waitFor();
    assert.equal(await assist.count(), 0);
    await score.locator('summary').press('Enter');
    await coldGroup.getByText('结局倾向', { exact: true }).press('Enter');
    await ending.locator('summary').press('Enter');
    await ending.getByText('1/2', { exact: true }).waitFor();

    await cold.evaluate(() => shanheFixture.switchScene('RogueLikeGameScene'));
    await assist.waitFor();
    assert.equal(await extension.getAttribute('aria-pressed'), 'true');
    await ending.getByText('1/2', { exact: true }).waitFor();
    await score.getByText('约 9,094', { exact: true }).waitFor();
    await score.getByText('含本场胜利预估 +324', { exact: true }).waitFor();
    await score.scrollIntoViewIfNeeded();
    await cold.screenshot({ path: resolve(out, 'extension-battle.png') });
    await cold.evaluate(() => { shanheFixture.demo.scene.GameRound = 5; });
    await score.getByText('约 7,448', { exact: true }).waitFor();
    for (const error_code of [4, 2, 0, 0]) {
      await cold.evaluate(error_code => shanheFixture.proxy.event('decodeRogueLikeRestartGameRep',
        { Protocol: { Data: { ProtoObj: { error_code } } } }), error_code);
      await score.getByText(error_code ? '约 7,448' : '约 7,280', { exact: true }).waitFor();
    }
    await score.scrollIntoViewIfNeeded();
    await cold.screenshot({ path: resolve(out, 'extension-battle-restart.png') });
    await cold.evaluate(() => {
      shanheFixture.demo.scene.GameRound = 1;
      shanheFixture.proxy.event('MsgGamePlayCardNtf');
    });
    await score.getByText('约 9,094', { exact: true }).waitFor();
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.chapterData.record.fightScore = 1300;
      manager.AllDatas.gameData.itemId.push(3001);
      manager.AllDatas.gameData.attrInfo.tro = 3;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('约 9,520', { exact: true }).waitFor();
    assert.equal(await score.getByText('含本场胜利预估', { exact: false }).count(), 0);
    assert.equal(await score.evaluate(node => node.open), true);
    assert.equal(await ending.locator('.shb-progress').textContent(), '1/2');

    await cold.evaluate(() => shanheFixture.switchScene('RogueSmallMapScene'));
    await score.getByText('约 9,520', { exact: true }).waitFor();
    await ending.getByText('3/2', { exact: true }).waitFor();
    assert.equal(await assist.count(), 0);
    await cold.evaluate(() => {
      shanheFixture.manager.AllDatas.chapterData.curEventData = { eventType: 3, eventId: 2001 };
      shanheFixture.switchScene('RogueLikeGameScene');
      shanheFixture.switchScene('RogueSmallMapScene');
    });
    await score.getByText('约 11,334', { exact: true }).waitFor();
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.chapterData.record.fightScore = 1400;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('约 10,080', { exact: true }).waitFor();
    await cold.screenshot({ path: resolve(out, 'extension-after-battle.png') });

    await cold.evaluate(() => shanheFixture.switchScene('RogueLikeGameScene'));
    await score.getByText('约 11,894', { exact: true }).waitFor();
    await cold.evaluate(() => {
      shanheFixture.proxy.event('decodeRogueLikeRestartGameRep', { Protocol: { Data: { ProtoObj: { error_code: 4 } } } });
      shanheFixture.switchScene('RogueSmallMapScene');
    });
    await score.getByText('约 11,894', { exact: true }).waitFor();
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.gameData.remakeCnt = 1;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('约 10,080', { exact: true }).waitFor();

    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      Object.assign(manager.AllDatas.seasonData, { seasonId: 5, difficulty: 121 });
      delete manager.AllDatas.gameData.itemId;
      manager.AllDatas.chapterData.record = { fightScore: 0 };
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    const loss = score.locator('.shb-score-loss');
    await score.getByText('已知 0', { exact: true }).waitFor();
    await score.getByText('⌊⌊(0 + 0) × 1⌋ × (1 + 0%)⌋ = 0', { exact: true }).waitFor();
    assert.equal(await loss.locator('dd').textContent(), '500');

    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.seasonData.difficulty = 1;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('普通1', { exact: true }).waitFor();
    await score.getByText('已知 0', { exact: true }).waitFor();
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.gameData.itemId = [2091];
      manager.AllDatas.chapterData.record = { fightScore: 324, items: [2091] };
      manager.AllDatas.chapterData.accday = 1;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('约 524', { exact: true }).waitFor();
    await score.getByText('⌊⌊(324 + 200) × 1⌋ × (1 + 0%)⌋ = 524', { exact: true }).waitFor();
    await loss.getByText('累计 1 月 · max(500, 150 × 1 − 100)', { exact: true }).waitFor();
    assert.equal(await loss.locator('dd').textContent(), '500');
    await score.scrollIntoViewIfNeeded();
    await cold.screenshot({ path: resolve(out, 'score-normal-one-separate.png') });

    await cold.evaluate(() => {
      const fixture = shanheFixture, { manager } = fixture;
      manager.AllDatas.gameData.itemId = [];
      manager.AllDatas.chapterData.record = { fightScore: 0, items: [] };
      manager.AllDatas.chapterData.curEventData = { eventType: 3, eventId: 2001 };
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
      fixture.switchScene('RogueLikeGameScene');
      fixture.rebirthUses = 0;
      const scene = fixture.demo.scene;
      scene.GameRound = 5;
      scene.SelfSeatUi = { Seat: { GetSkillBuffInfo: id => id === 3324 ? [fixture.rebirthUses] : null } };
    });
    await score.getByText('约 30', { exact: true }).waitFor();
    await cold.evaluate(() => { shanheFixture.rebirthUses = 1; });
    await score.getByText('约 0', { exact: true }).waitFor();
    await score.getByText('在乘难度系数前扣除', { exact: true }).waitFor();
    await cold.evaluate(() => shanheFixture.proxy.event('decodeRogueLikeRestartGameRep', { Protocol: { Data: { ProtoObj: { error_code: 0 } } } }));
    await score.getByText('在乘难度系数前扣除', { exact: true }).waitFor({ state: 'detached' });
    await cold.evaluate(() => {
      shanheFixture.rebirthUses = 0;
      shanheFixture.proxy.event('MsgGamePlayCardNtf');
    });
    await score.getByText('约 30', { exact: true }).waitFor();
    await cold.evaluate(() => { shanheFixture.rebirthUses = 1; });
    await score.getByText('约 0', { exact: true }).waitFor();
    await cold.evaluate(() => shanheFixture.switchScene('RogueSmallMapScene'));
    await score.getByText('含本场胜利预估 +30', { exact: true }).waitFor();
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.chapterData.record.fightScore = 30;
      manager.AllDatas.gameData.dyingCnt = 1;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('游戏下发的战斗小计', { exact: true }).waitFor();
    await score.getByText('约 0', { exact: true }).waitFor();
    await score.getByText('在乘难度系数前扣除', { exact: true }).waitFor();
    await score.getByText('max(0, ⌊⌊(30 + 0 − 500) × 1⌋ × (1 + 0%)⌋) = 0', { exact: true }).waitFor();
    assert.equal(await loss.locator('dd').textContent(), '500');
    await score.scrollIntoViewIfNeeded();
    await cold.screenshot({ path: resolve(out, 'score-rebirth-separate.png') });
    await cold.evaluate(() => {
      const { manager } = shanheFixture;
      manager.AllDatas.seasonData.uniqueLogId++;
      manager.AllDatas.chapterData.record = { fightScore: 0, items: [] };
      manager.AllDatas.gameData.dyingCnt = 0;
      manager.event('CLIENT_ROGUE_ALL_DATA_REP');
    });
    await score.getByText('约 0', { exact: true }).waitFor();
    await score.getByText('在乘难度系数前扣除', { exact: true }).waitFor({ state: 'detached' });

    for (const mode of ['direct', 'adventure', 'retained-fight', 'mid-month']) {
      await cold.evaluate(mode => {
        const fixture = shanheFixture, { manager } = fixture;
        fixture.switchScene('RogueSmallMapScene');
        const { chapterData, gameData, seasonData } = manager.AllDatas;
        seasonData.uniqueLogId++;
        gameData.passChapter = [1, 2];
        gameData.itemId = fixture.luoyangItems;
        Object.assign(chapterData, {
          chapterId: 10, day: mode === 'mid-month' ? 7 : 6, accday: 16, curLocation: 101,
          curEventData: null, record: { fightScore: mode === 'retained-fight' ? 9822 : 10146, items: fixture.luoyangItems },
        });
        manager.event('CLIENT_ROGUE_ALL_DATA_REP');
        Object.assign(chapterData, { day: 7, accday: 17 });
        manager.event('CLIENT_ROGUE_ALL_DATA_REP');
        if (mode === 'adventure') {
          const event = { eventId: 1001, eventType: 2 };
          chapterData.curLocation = 102;
          manager.event('CLIENT_ROGUE_EVENT_SELECT_NTF', event);
          gameData.money += 140;
          manager.event('CLIENT_ROGUE_EVENT_SELECT_REP', { ...event, result: 0, selectData: [{ id: 10013 }] });
        }
        if (mode === 'retained-fight') {
          chapterData.curEventData = { eventType: 3, eventId: 2001 };
          fixture.switchScene('RogueLikeGameScene');
          chapterData.record.fightScore = 10146;
          manager.event('CLIENT_ROGUE_ALL_DATA_REP');
          fixture.switchScene('RogueSmallMapScene');
        }
        chapterData.curLocation = 103;
        chapterData.curEventData = { eventType: 3, eventId: 2002 };
        fixture.switchScene('RogueLikeGameScene');
      }, mode);
      await score.getByText(mode === 'direct' ? '约 24,912' : '约 23,412', { exact: true }).waitFor();
      await score.getByText(mode === 'direct' ? '含本场胜利预估 +7,166' : '含本场胜利预估 +5,666', { exact: true }).waitFor();
      if (mode === 'direct') {
        assert.equal(await score.getByText(/首领月加成/).count(), 0);
      } else {
        const bonus = score.locator('dt').filter({ hasText: '首领月加成' });
        await bonus.getByText(mode === 'mid-month' ? '暂不计入预估' : '首领出现后已完成其他关卡或奇遇').waitFor();
        assert.equal(await score.locator('dt:has-text("首领月加成") + dd').textContent(), mode === 'mid-month' ? '待确认' : '0');
        if (mode === 'adventure') {
          const coldHost = cold.locator('[data-sgs-toolbox=core]');
          for (const width of [248, 280, 420]) {
            for (const offset of [-2, -1, 0, 2]) {
              await coldHost.evaluate((node, { width, offset }) => {
                node.style.width = `${width}px`;
                node.shadowRoot.querySelector('.shell').style.width = '100%';
                node.style.setProperty('--sgs-font-offset', `${offset}px`);
              }, { width, offset });
              assert.ok(await bonus.evaluate(label => {
                const value = label.nextElementSibling;
                const details = label.closest('details');
                return details.scrollWidth <= details.clientWidth + 1 && label.scrollWidth <= label.clientWidth + 1
                  && value.scrollWidth <= value.clientWidth + 1 && label.getBoundingClientRect().right <= value.getBoundingClientRect().left;
              }), `${width}px, ${offset}px`);
            }
          }
          await coldHost.evaluate(node => {
            node.style.removeProperty('width');
            node.style.removeProperty('--sgs-font-offset');
            node.shadowRoot.querySelector('.shell').style.removeProperty('width');
          });
        }
      }
      await score.scrollIntoViewIfNeeded();
      await cold.screenshot({ path: resolve(out, `score-boss-month-${mode}.png`) });
    }
    console.log('通过：洛阳首领月直接开打、先从奇遇拿钱、先打保留关卡及中途接入的加成判定。');

    await cold.evaluate(() => {
      shanheFixture.switchScene('RogueLikeGameScene');
      shanheFixture.demo.self = { ClientId: 42 };
    });
    await score.getByText('等待官方配置和征程数据').waitFor();
    assert.equal(await score.locator('.shb-score-total').textContent(), '');
    await cold.evaluate(() => shanheFixture.switchScene('GameScene'));
    assert.equal(await extension.count(), 0);
    await assist.waitFor();
    assert.deepEqual(await cold.evaluate(() => shanheFixture.requests), []);
    assert.deepEqual(coldErrors, []);
    console.log('通过：Laya 延迟初始化、进战预计胜分、第 5 轮更新、失败／等待回执保留、重开回执／次数确认撤回、重新进战恢复、正常结算接管及换号清空。');
  } finally {
    await cold.close();
  }
  await page.route('**/shanhe-extra', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('http://127.0.0.1:17321/shanhe-extra');
  await page.addScriptTag({ path: laya });
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  await page.evaluate(() => {
    ShanheCheck.setup();
    const { demo, manager } = shanheFixture, data = manager.AllDatas;
    demo.scene.size(1200, 850);
    for (const id of [101, 102, 103, 104, 105]) {
      const city = demo.scene.cityView.GetCityItemById(id);
      city.CityId = id;
      Object.assign(city.cityImg, { textureWidth: city.width, textureHeight: city.height });
    }
    data.seasonData.seasonId = 5;
    data.gameData.attrInfo = { rep: 0, tro: 16, wis: 2 };
    const root = demo.configs.hd_roguelike.Root;
    root.Chapter[0].seasonID = '5';
    root.DifficultySelection[1].seasonID = '5';
    root.Card.push({ id: 4002, cardid: 2, isequip: 2, money: 200, level: 2 });
    data.chapterData.record = { fightScore: 1000, items: [2100, 3001, 4001, 4002, 3001] };
    root.Adventure.push({ ID: 1484, chapname: '知己难逢', effect1: 148401, effect2: 148402, effect3: 148403 });
    root.Other.push({ reward: 997003, rewardname: '曹昂' }, { reward: 997103, rewardname: '曹昂' });
    root.Choose.push({ effectID: 148401, type: 1, getitem: 997003, getnum: 1 },
      { effectID: 148402, type: 1, getitem: 997103, getnum: 1, lostitem: 1000, lostnum: 400 },
      { effectID: 148403, type: 1, getitem: 1000, getnum: 200 });
    data.chapterData.locations[1].event = 1484;
    root.ending = [
      { ID: 500, SeasonList: '5;6', endingName: '折戟沉沙', special: '1,2', priority: -1 },
      { ID: 503, SeasonList: '5', endingName: '从龙之功', need_Rep: '2,0', need_Tro: '1,15', special: '1,1;11,15' },
      { ID: 504, SeasonList: '5', endingName: '居功至伟', need_Mar: '1,60', special: '1,1;4,4000' },
      { ID: 505, SeasonList: '5', endingName: '待满足的结局', need_Wis: '1,25', special: '1,1' },
      { ID: 506, SeasonList: '5', endingName: '另一难度的结局', special: '1,1;11,16' },
    ];
    root.school = [{ school: 1, name: '资源流', needxiyou: 2, needchuanshuo: 1 }];
    root.Tactics[0].school = '1'; root.Tactics[1].school = '1'; root.Tactics[3].school = '1';
    root.Tactics.push({ plot: 2103, plotname: '以逸待劳', level: 4, school: '1' });
    class Adventure extends Laya.Sprite {}
    Laya.ClassUtils.regClass('RogueAdventureSelectWindow', Adventure);
    const win = shanheFixture.adventure = new Adventure();
    win.pos(105, 130);
    win.showItemList = [126701, 999999].map((id, index) => {
      const card = new Laya.Sprite(); card.id = id; card.size(210, 300); card.pos(index * 225, 0);
      card.graphics.drawRect(0, 0, 210, 300, '#262c27', '#a89163', 1);
      const name = new Laya.Text();
      name.text = index === 0 ? '已有实测的奇遇选项' : '未收录选项';
      name.color = '#f0dfac'; name.fontSize = 18; name.pos(19, 27); card.addChild(name);
      const cost = new Laya.Text(); cost.text = '免费'; cost.color = '#f0dfac'; cost.fontSize = 15; cost.pos(90, 245);
      card.addChild(cost); card.effectValue = cost;
      card.mouseEnabled = true;
      card.on('click', card, () => { shanheFixture.optionClicks = (shanheFixture.optionClicks || 0) + 1; });
      win.addChild(card); return card;
    });
    Laya.stage.addChild(win);
  });
  await page.addScriptTag({ path: resolve('release/market/dev/app.js') });
  await page.waitForFunction(() => window[Symbol.for('sgs.ol.toolbox.core')]?.manager);
  await host.evaluate(node => Object.assign(node.style, { left: '760px', top: '18px', right: 'auto' }));
  const mainGroup = host.locator('[data-plugin-group=shanhetu]');
  const mapCard = page.locator('section[aria-label="山河图地图节点信息"] p').filter({ hasText: '知己难逢' });
  const encounter = mainGroup.locator('.sh-node').filter({ hasText: '知己难逢' });
  const settings = mainGroup.locator('.sh-options').filter({ has: page.getByText('显示设置', { exact: true }) });
  const impactSwitch = settings.getByRole('switch', { name: '数值变化标注' });
  const nativeLabel = () => shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact');
  const labels = () => page.evaluate(() => shanheFixture.adventure.showItemList.map(card => card.getChildByName('sgs-shanhe-option-impact')?.text || null));

  await encounter.waitFor();
  await mapCard.waitFor({ state: 'attached', timeout: 10000 });
  await settings.locator('summary').click();
  assert.equal(await impactSwitch.isChecked(), false);
  assert.equal(await encounter.locator('.sh-impact').count(), 0);
  assert.doesNotMatch(await mapCard.textContent(), /智谋|商才/);
  assert.deepEqual(await labels(), [null, null]);
  assert.doesNotMatch(await settings.textContent(), /等待进入山河对局|已触发官方背景重选/);
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'integrated-settings-default.png') });
  await impactSwitch.press('Space');
  assert.equal(await impactSwitch.isChecked(), true);
  await page.waitForFunction(nativeLabel);
  assert.deepEqual(await labels(), ['战功 +5', null]);
  await page.mouse.click(190, 359);
  assert.equal(await page.evaluate(() => shanheFixture.optionClicks), 1);
  await page.evaluate(() => { shanheFixture.adventure.visible = false; });

  await page.evaluate(pkg => window[Symbol.for('sgs.ol.toolbox.core')].manager.install(pkg), pkg);
  assert.deepEqual(pkg.manifest.dependencies, ['shanhetu']);
  assert.equal(await host.locator('[data-plugin-group=shanhetu-beta]').count(), 0);
  await assert.rejects(page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('shanhetu')), /依赖此插件/);
  const tabs = mainGroup.getByRole('group', { name: '山河内容' });
  const extension = tabs.getByRole('button', { name: '拓展', exact: true });
  const module = mainGroup.locator('[data-panel-id="shanhetu-beta:main"]');
  assert.deepEqual(await tabs.locator('button').allTextContents(), ['拓展', '地图', '商店', '概况']);
  await extension.press('Enter');
  assert.equal(await extension.getAttribute('aria-pressed'), 'true');
  assert.equal(await encounter.count(), 0);
  assert.equal(await module.locator('.shb-score').count(), 1);
  await module.getByText('约 10,360', { exact: true }).waitFor();
  await mainGroup.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'extension-overview.png') });
  await mainGroup.getByText('结局倾向', { exact: true }).click();
  const endings = mainGroup.locator('.shb-panel details');
  assert.match(await endings.last().locator('summary').textContent(), /折戟沉沙战败完成/);
  const waitsForClear = endings.filter({ hasText: '从龙之功' }).locator('summary');
  assert.match(await waitsForClear.textContent(), /等待通关/);
  assert.equal(await waitsForClear.locator('.shb-status svg').count(), 1);
  const wrongDifficulty = endings.filter({ hasText: '另一难度的结局' }).locator('summary');
  assert.match(await wrongDifficulty.textContent(), /难度错误/);
  assert.equal(await wrongDifficulty.locator('.shb-status svg').count(), 1);
  await waitsForClear.click();
  await host.getByText('战功 > 15', { exact: true }).waitFor();
  await host.getByText('16/16', { exact: true }).waitFor();
  await endings.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'ending-tendency.png') });
  const score = mainGroup.locator('.shb-score'), scoreSummary = score.locator('summary');
  await scoreSummary.getByText('约 10,360', { exact: true }).waitFor();
  await scoreSummary.press('Enter');
  await score.getByText('⌊⌊(1,000 + 850) × 5.6⌋ × (1 + 0%)⌋ = 10,360', { exact: true }).waitFor();
  assert.deepEqual(await score.locator('dl').first().locator('dd').allTextContents(), ['1,000', '500', '100', '50', '200', '850', '×5.6', '+0%']);
  await page.evaluate(() => {
    const { manager } = shanheFixture;
    manager.AllDatas.chapterData.record.fightScore = 1294;
    manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  });
  await scoreSummary.getByText('约 12,006', { exact: true }).waitFor();
  assert.equal(await score.evaluate(node => node.open), true);
  await tabs.getByRole('button', { name: '概况', exact: true }).click();
  await module.waitFor({ state: 'hidden' });
  await extension.click();
  assert.equal(await score.evaluate(node => node.open), true);
  assert.equal(await waitsForClear.evaluate(node => node.parentElement.open), true);
  await tabs.getByRole('button', { name: '概况', exact: true }).click();
  await host.getByText('流派进度', { exact: true }).waitFor();
  await host.getByText('稀有 2/2', { exact: true }).waitFor();
  await host.getByText('传说 0/1', { exact: true }).waitFor();

  const school = host.locator('.sh-school').filter({ hasText: '资源流' });
  const follow = school.getByRole('button', { name: '关注资源流套装', exact: true });
  const cancelFollow = school.getByRole('button', { name: '取消关注资源流套装', exact: true });
  assert.equal(await school.locator('summary').count(), 0);
  await follow.waitFor();
  await page.evaluate(() => {
    const fixture = shanheFixture;
    const tip = fixture.suitTip = new Laya.Sprite();
    tip.size(420, 246);
    tip.pos(150, 180);
    tip.graphics.drawRect(0, 0, 420, 246, '#302b23', '#af9673', 1);
    tip.ShowToolTipZhanfa = () => {};
    tip.showExtendSuit2 = () => {};
    const label = (text, x, y, width, color = '#dfc59a') => {
      const child = tip.addChild(new Laya.Text());
      child.size(width, 16);
      child.pos(x, y);
      child.text = text;
      child.fontSize = 16;
      child.color = color;
      return child;
    };
    label('破釜沉舟', 110, 24, 260, '#ef985a').fontSize = 23;
    label('回合开始时，你可以选择获得临时增益。', 110, 62, 300);
    label('战法：无获得上限，单独结算触发', 12, 97, 398);
    const title = fixture.suitTitle = label('', 0, 127, 420);
    title.align = 'center';
    let html = '';
    Object.defineProperty(title, 'innerHTML', {
      get: () => html,
      set: value => { html = value; title.text = value.replace(/<[^>]+>/g, ''); },
    });
    title.innerHTML = "资源流套装<font color='#907f6c'>(未激活)</font>";
    label('效果：拥有套装后，获得额外资源。', 12, 156, 398);
    label('集齐以下战法激活：', 12, 182, 398);
    for (let i = 0; i < 3; i++) tip.graphics.drawCircle(34 + i * 52, 221, 19, '#50412c', '#af9673', 2);
    Laya.stage.addChild(tip);
    fixture.tipManager = { currentStaticTip: tip, ShowStaticTip() {} };
    fixture.gameWindows = new Map();
    const ged = fixture.demo.scene.ged = Object.assign(new Laya.EventDispatcher(), fixture.demo.scene.ged);
    ged.on('TIPS_OUT_EVENT', fixture.tipManager, () => {});
    ged.on('OPEN_WINDOW', { WindowInstanceDict: fixture.gameWindows }, event => {
      const win = fixture.gameWindows.get(event.WindowName);
      if (win) { win.renderGoods?.(); Laya.stage.addChild(win); }
    });
  });
  const nativeFollowHost = page.locator('[data-sgs-shanhe-school-follow]');
  const nativeFollow = nativeFollowHost.getByRole('button', { name: '关注资源流套装', exact: true });
  const nativeCancel = nativeFollowHost.getByRole('button', { name: '取消关注资源流套装', exact: true });
  await nativeFollow.waitFor();
  assert.equal(await page.evaluate(() => shanheFixture.suitTitle.innerHTML), '资源流套装');
  await nativeFollow.click();
  await nativeCancel.waitFor();
  await cancelFollow.waitFor();
  await page.screenshot({ path: resolve(out, 'follow-native-tooltip.png') });
  await cancelFollow.press('Enter');
  await nativeFollow.waitFor();
  await page.evaluate(() => shanheFixture.suitTip.scale(.5, .5));
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-sgs-shanhe-school-follow]').shadowRoot.querySelector('button');
    const { left, top, width } = button.getBoundingClientRect();
    return left >= 150 && left + width <= 360 && top < 235;
  });
  await nativeFollow.press('Space');
  await cancelFollow.waitFor();
  await page.evaluate(() => { shanheFixture.suitTip.removeSelf(); });
  await nativeFollowHost.waitFor({ state: 'detached' });
  assert.match(await page.evaluate(() => shanheFixture.suitTitle.innerHTML), /未激活/);
  await page.evaluate(() => {
    const fixture = shanheFixture;
    const detail = fixture.suitWindow = new Laya.Sprite();
    detail.pos(122, 155); detail.size(600, 288);
    detail.graphics.drawRect(0, 0, 600, 288, '#302b23', '#af9673', 1);
    detail.schoolVo = { SchoolID: 1 };
    detail.contentSprite = detail.addChild(new Laya.Sprite());
    const title = detail.contentSprite.addChild(new Laya.Text());
    title.text = '资源流套装'; title.color = '#dfc59a'; title.fontSize = 22; title.pos(245, 25);
    detail.itemPanel = detail.contentSprite.addChild(new Laya.Sprite());
    detail.itemPanel.pos(29, 60); detail.itemPanel.size(542, 200);
    fixture.gameWindows.set('RogueZhanfaSuitWindow', detail);
    Laya.stage.addChild(detail);
  });
  await nativeCancel.click();
  await follow.waitFor();
  await nativeFollow.click();
  await cancelFollow.waitFor();
  await page.evaluate(() => shanheFixture.suitWindow.destroy(true));
  await nativeFollowHost.waitFor({ state: 'detached' });
  const shopToast = host.getByText('商店有关注的资源流套装的破釜沉舟', { exact: true });
  await shopToast.waitFor();
  await page.evaluate(() => {
    const fixture = shanheFixture;
    const shell = document.querySelector('[data-sgs-toolbox=core]').shadowRoot;
    fixture.toasts = [];
    new MutationObserver(records => {
      for (const row of records) for (const node of row.addedNodes) {
        if (node.matches?.('.toast')) fixture.toasts.push(node.textContent);
      }
    }).observe(shell, { childList: true });
    const dotName = 'sgs-sh-follow-dot';
    // The map button is a flat control drawn into leftView in the client.
    const left = fixture.demo.scene.leftView = fixture.demo.scene.addChild(new Laya.Sprite());
    const entrance = left.shopBtn = { x: 55, y: 100, width: 100, visible: true };
    left.graphics.drawRect(entrance.x, entrance.y, entrance.width, 35, '#78482d', '#dab67f', 1);
    const entranceLabel = left.addChild(new Laya.Text());
    entranceLabel.text = '商店'; entranceLabel.pos(84, 107); entranceLabel.fontSize = 19; entranceLabel.color = '#f7e1b7';
    const item = (id, shop, type = 2) => {
      const card = new Laya.Sprite();
      card.size(185, 228);
      card.Id = id;
      card.Type = type;
      card.Data = shop ? { goodId: id, goodType: type, IsBuyed: false } : { id, type };
      card.graphics.drawRect(0, 0, 185, 228, '#d8c4a1', '#a1814b', 2);
      const title = new Laya.Text();
      title.text = ({ 2100: '步步为营', 2101: '破釜沉舟', 2103: '以逸待劳' })[id] || '未关注战法';
      title.fontSize = 21; title.color = '#4e351e'; title.pos(35, 96);
      card.addChild(title);
      const ribbon = card.suggestImg = new Laya.Sprite();
      ribbon.pos(10, 10); ribbon.graphics.drawPoly(0, 0, [0, 0, 30, 0, 30, 51, 15, 61, 0, 51], '#ac371d', '#e2a858', 1);
      const label = new Laya.Text();
      label.text = '推\n荐'; label.fontSize = 18; label.color = '#ffe0a4'; label.pos(6, 7);
      ribbon.addChild(label); card.addChild(ribbon);
      ribbon.visible = false;
      card.ShowSuggest = () => { ribbon.visible = true; };
      if (shop) {
        const button = card.tongqianBtn = card.addChild(new Laya.Sprite());
        button.size(100, 32); button.pos(42, 236);
        button.graphics.drawRect(0, 0, 100, 32, '#7f3a25', '#dabe83', 1);
        const price = button.addChild(new Laya.Text());
        price.text = '300'; price.fontSize = 20; price.color = '#f7e1b7'; price.pos(35, 5);
        button.on('click', button, () => { fixture.buyClicks = (fixture.buyClicks || 0) + 1; });
      }
      return card;
    };
    class Shop extends Laya.Sprite {
      layout() { this.itemList.forEach((card, index) => card.pos(index * 200, 0)); }
    }
    const shop = fixture.followShop = new Shop();
    const panel = shop.panel = new Laya.Sprite();
    panel.width = 400; panel.contentWidth = 400; panel.UpdateDrawContent = () => {}; panel.hScrollBar = { value: 60 };
    shop.addChild(panel); shop.curValue = 2;
    shop.pos(108, 168);
    const makeTabs = () => {
      shop.tabGroup?.destroy(true);
      const tabs = shop.tabGroup = shop.addChild(new Laya.Sprite());
      tabs.pos(-90, 44);
      const buttons = [2, 3].map((type, i) => {
        const btn = tabs.addChild(new Laya.Sprite());
        btn.size(78, 32); btn.pos(0, i * 40);
        btn.graphics.drawRect(0, 0, 78, 32, '#68472c', '#dabe83', 1);
        const label = btn.addChild(new Laya.Text());
        label.text = type === 2 ? '战法' : '技能'; label.pos(18, 4); label.fontSize = 19; label.color = '#f7e1b7';
        return btn;
      });
      tabs.GetButtonByValue = type => buttons[type - 2];
      tabs.on('TAP_CLICKED', shop, type => { shop.curValue = type; shop.renderGoods(); });
    };
    makeTabs();
    shop.renderGoods = () => {
      panel.destroyChildren();
      const { itemId, itemType } = fixture.manager.AllDatas.shopData;
      shop.itemList = itemId.filter((_, index) => itemType[index] === shop.curValue)
        .map(id => panel.addChild(item(id, true, shop.curValue)));
      if (shop.curValue === 2) shop.itemList.find(card => card.Id === 2100)?.ShowSuggest();
      panel.hScrollBar.value = 60;
      shop.layout();
    };
    shop.refreshBtn = shop.addChild(new Laya.Sprite());
    fixture.refreshClicks = 0;
    shop.refreshBtn.on('click', shop, () => fixture.refreshClicks++);
    fixture.manager.on('CLIENT_ROGUE_GET_SHOPINFO_REP', shop, () => { makeTabs(); shop.renderGoods(); });
    const award = fixture.followAward = new Laya.Sprite();
    award.panel = award.addChild(new Laya.Sprite()); award.panel.pos(167, 299);
    award.graphics.drawRect(0, 0, 1200, 850, 'rgba(13,16,15,.78)');
    const awardTitle = award.addChild(new Laya.Text());
    awardTitle.text = '战法选择'; awardTitle.fontSize = 32; awardTitle.color = '#ffe0a4'; awardTitle.pos(391, 238);
    fixture.choiceClicks = [];
    award.ShowItemList = [2100, 2101, 2103].map((id, i) => {
      const card = award.panel.addChild(item(id, false));
      card.pos(i * 200, 0);
      card.on('click', card, () => fixture.choiceClicks.push(id));
      return card;
    });
    award.ShowItemList[1].ShowSuggest();
    award.msg = { eventId: 9000 };
    fixture.gameWindows.set('RogueJiShiWindow', shop);
    fixture.gameWindows.set('RogueAwardSelectWindow', award);
    const dot = node => node.getChildByName(dotName);
    fixture.followDots = () => ({
      entrance: Boolean(dot(left)),
      tactics: Boolean(dot(shop.tabGroup.GetButtonByValue(2))),
      skills: Boolean(dot(shop.tabGroup.GetButtonByValue(3))),
      offers: shop.itemList.filter(card => dot(card.tongqianBtn)).map(card => card.Id),
    });
    fixture.shopSynced = () => {
      const [first, second] = shop.itemList;
      const button = first.tongqianBtn;
      const red = dot(button);
      return first.Id === 2101 && !first.suggestImg.visible && second.suggestImg.visible
        && first.x === 0 && panel.hScrollBar.value === 0
        && red?.x === button.width - 5 && red.y === 5 && !red.mouseEnabled
        && dot(left)?.x === entrance.x + entrance.width - 5;
    };
  });
  const dots = () => page.evaluate(() => shanheFixture.followDots());
  const marked = { entrance: true, tactics: true, skills: false, offers: [2101] };
  const openShop = () => page.evaluate(async () => {
    const fixture = shanheFixture;
    fixture.demo.scene.ged.event('OPEN_WINDOW', { WindowName: 'RogueJiShiWindow' });
    await Promise.resolve();
    return fixture.shopSynced();
  });
  assert.equal(await openShop(), true, 'opening syncs the native cards before the next frame');
  assert.deepEqual(await dots(), marked);
  await page.evaluate(async () => {
    shanheFixture.followShop.tabGroup.event('TAP_CLICKED', [3]);
    await Promise.resolve();
  });
  assert.deepEqual(await dots(), { ...marked, offers: [] }, 'the tactic category stays marked while viewing skills');
  await page.evaluate(async () => {
    shanheFixture.followShop.tabGroup.event('TAP_CLICKED', [2]);
    await Promise.resolve();
  });
  assert.deepEqual(await dots(), marked);
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), 1);
  assert.ok(await shopToast.evaluate(node => {
    const { top, left, right } = node.getBoundingClientRect();
    return top >= 0 && top < 70 && left >= 0 && right <= innerWidth
      && getComputedStyle(node).pointerEvents === 'none';
  }));
  await page.evaluate(async () => {
    const fixture = shanheFixture;
    fixture.followShop.removeSelf();
    fixture.demo.scene.ged.event('windowClosed', 'RogueJiShiWindow');
    await Promise.resolve();
  });
  assert.deepEqual(await dots(), { ...marked, tactics: false, offers: [] }, 'only the map indicator remains when the shop closes');
  assert.equal(await openShop(), true, 'reopening the same window syncs again');
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), 2);
  await page.evaluate(() => shanheFixture.demo.scene.ged.event('OPENED_WINDOW', 'RogueJiShiWindow'));
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), 2, 'an already synced window does not announce twice');
  await host.getByRole('button', { name: '商店', exact: true }).click();
  const followedRow = host.locator('.sh-good').filter({ hasText: '破釜沉舟' });
  assert.equal(await followedRow.locator('.sh-good-name').textContent(), '破釜沉舟★');
  assert.equal(await followedRow.getByRole('img', { name: '关注' }).count(), 1);
  assert.doesNotMatch(await followedRow.textContent(), /推荐/);
  await page.mouse.click(243, 409);
  assert.equal(await page.evaluate(() => shanheFixture.buyClicks), 1, 'the red dot leaves the purchase button clickable');
  await page.screenshot({ path: resolve(out, 'follow-shop.png') });
  await page.evaluate(() => {
    const { manager } = shanheFixture;
    manager.AllDatas.shopData.bShow = true;
    manager.AllDatas.chapterData.day++;
    manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  });
  await page.waitForFunction(() => shanheFixture.toasts.length === 3);
  assert.deepEqual(await page.evaluate(async () => {
    const fixture = shanheFixture;
    fixture.followShop.renderGoods();
    fixture.followShop.refreshBtn.event('click');
    await Promise.resolve();
    return [fixture.refreshClicks, fixture.shopSynced()];
  }), [1, true], 'the refresh click syncs currently displayed goods without issuing another request');
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), 3);
  assert.equal(await page.evaluate(async () => {
    const { manager } = shanheFixture;
    manager.event('CLIENT_ROGUE_GET_SHOPINFO_REP', [102063]);
    manager.event('CLIENT_ROGUE_ALL_DATA_REP', [{ orgId: 102063 }]);
    await Promise.resolve();
    return shanheFixture.shopSynced();
  }), true, 'the reply syncs cards rebuilt by native listeners in the same turn');
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), 4);
  assert.deepEqual(await dots(), marked);
  assert.deepEqual(await page.evaluate(async () => {
    const { manager } = shanheFixture;
    // Buy replies first update the processed stock, before the window or raw data changes.
    manager.ShopData = { goodList: { 2: [{ goodId: 2101, goodType: 2, isBuyed: true }] } };
    manager.event('CLIENT_ROGUE_BUY_SHOPITEM_REP');
    await Promise.resolve();
    return shanheFixture.followDots();
  }), { entrance: false, tactics: false, skills: false, offers: [] });
  assert.equal(await followedRow.locator('.sh-good-star').count(), 0);
  assert.match(await followedRow.textContent(), /已购/);
  await page.evaluate(() => {
    const { manager } = shanheFixture;
    delete manager.ShopData;
    manager.AllDatas.shopData.itemId[3] = 2102;
    manager.event('CLIENT_ROGUE_GET_SHOPINFO_REP', [102063]);
  });
  assert.equal(await shopToast.count(), 0, 'the previous notice is dismissed if refresh removes the match');
  await page.evaluate(() => {
    const { manager } = shanheFixture;
    manager.AllDatas.shopData.itemId[3] = 2101;
    manager.AllDatas.chapterData.chapterId++;
    manager.event('CLIENT_ROGUE_GET_SHOPINFO_REP');
    manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  });
  await page.waitForFunction(() => shanheFixture.toasts.length === 5);
  assert.deepEqual(await dots(), marked);
  assert.equal(await followedRow.locator('.sh-good-star').count(), 1);
  assert.deepEqual(await page.evaluate(async () => {
    const fixture = shanheFixture;
    fixture.demo.scene.ged.event('OPEN_WINDOW', { WindowName: 'RogueAwardSelectWindow' });
    await Promise.resolve();
    return fixture.followAward.ShowItemList.map(card => {
      const badge = card.getChildByName('sgs-sh-follow-choice');
      return [card.Id, badge?.getChildAt(0).text ?? null, card.suggestImg.visible];
    });
  }), [[2100, null, false], [2101, '已关注', true], [2103, '已关注', false]]);
  const choiceToast = host.getByText('出现了关注的资源流套装的破釜沉舟、资源流套装的以逸待劳，请注意选择', { exact: true });
  await choiceToast.waitFor();
  assert.equal(await choiceToast.getAttribute('data-position'), 'top');
  const expectedToastCount = await page.evaluate(() => shanheFixture.toasts.length);
  await page.evaluate(() => shanheFixture.manager.event('CLIENT_ROGUE_ALL_DATA_REP'));
  assert.equal(await page.evaluate(() => shanheFixture.toasts.length), expectedToastCount, 'the badge stays visible without repeating the toast');
  const badgePosition = await page.evaluate(() => {
    const card = shanheFixture.followAward.ShowItemList[1];
    const badge = card.getChildByName('sgs-sh-follow-choice');
    return card.localToGlobal(new Laya.Point(badge.x + 10, badge.y + 14));
  });
  await page.mouse.click(badgePosition.x, badgePosition.y);
  assert.deepEqual(await page.evaluate(() => shanheFixture.choiceClicks), [2101]);
  await choiceToast.waitFor({ state: 'detached', timeout: 8000 });
  assert.equal(await page.evaluate(() => shanheFixture.followAward.ShowItemList
    .filter(card => card.getChildByName('sgs-sh-follow-choice')).length), 2);
  await page.screenshot({ path: resolve(out, 'follow-selection.png') });
  const lightPalette = THEMES.find(theme => theme.tokens.scheme === 'light').tokens;
  assert.equal(await page.evaluate(tokens => {
    const fixture = shanheFixture;
    const { themes } = window[Symbol.for('sgs.ol.toolbox.core')];
    fixture.restoreTheme = themes.register({ id: 'core.shanhe-demo-light', tokens });
    themes.select('core.shanhe-demo-light');
    return fixture.followAward.ShowItemList[1].getChildByName('sgs-sh-follow-choice').getChildAt(0).color;
  }, lightPalette), lightPalette.bg);
  await page.screenshot({ path: resolve(out, 'follow-selection-light.png') });
  assert.ok(await page.evaluate(async () => {
    const fixture = shanheFixture;
    window[Symbol.for('sgs.ol.toolbox.core')].themes.select('core.black-gold');
    fixture.restoreTheme();
    fixture.followAward.removeSelf();
    fixture.demo.scene.ged.event('windowClosed', 'RogueAwardSelectWindow');
    await Promise.resolve();
    return fixture.followAward.ShowItemList.every(card => !card.getChildByName('sgs-sh-follow-choice'));
  }), 'closing clears badges even when the window is reused');
  assert.deepEqual(await page.evaluate(async () => {
    const fixture = shanheFixture, award = fixture.followAward, ged = fixture.demo.scene.ged;
    award.selectPanel = award.panel;
    award.SelectItemList = [award.ShowItemList[2]];
    fixture.gameWindows.delete('RogueAwardSelectWindow');
    fixture.gameWindows.set('RogueCampSelectWindow', award);
    ged.event('OPEN_WINDOW', { WindowName: 'RogueCampSelectWindow' });
    await Promise.resolve();
    const badgeIds = award.ShowItemList.filter(card => card.getChildByName('sgs-sh-follow-choice')).map(card => card.Id);
    award.removeSelf();
    ged.event('windowClosed', 'RogueCampSelectWindow');
    return badgeIds;
  }), [2103], 'the camp selection uses its mounted selection list');
  await host.getByRole('button', { name: '概况', exact: true }).click();
  await school.getByRole('button', { name: '取消关注资源流套装', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'follow-settings.png') });
  await school.getByRole('button', { name: '取消关注资源流套装', exact: true }).press('Enter');
  await page.waitForFunction(() => {
    const shop = shanheFixture.followShop;
    const { entrance, tactics, skills, offers } = shanheFixture.followDots();
    return shop.itemList[0].Id === 2100 && shop.itemList[0].suggestImg.visible
      && !entrance && !tactics && !skills && offers.length === 0;
  });
  await page.evaluate(() => {
    shanheFixture.followShop.destroy(true);
    shanheFixture.manager.AllDatas.chapterData.chapterId--;
    shanheFixture.manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  });
  await host.getByRole('button', { name: '地图', exact: true }).click();
  const deltas = ['（声望 −1 · 智谋 +10）', '（声望 −1 · 智谋 +10）', '（商才 +10）'];
  await encounter.locator('summary .sh-impact').last().waitFor();
  assert.deepEqual(await encounter.locator('summary .sh-impact').allTextContents(), deltas);
  await mapCard.filter({ hasText: '商才 +10' }).waitFor({ state: 'attached', timeout: 10000 });
  assert.match(await mapCard.textContent(), /② 铜钱400 → 曹昂（声望 −1 · 智谋 \+10）\s+③ 铜钱200（商才 \+10）/);

  const theme = tokens => host.evaluate((node, palette) => {
    for (const [key, value] of Object.entries(palette)) node.style.setProperty('--sgs-' + key, value);
  }, tokens);
  for (const [name, width, palette, height] of [['dark-248', 248, BLACK_GOLD.tokens, 800], ['light-420', 420, THEMES.find(p => p.tokens.scheme === 'light').tokens, 800], ['dark-280-low', 280, BLACK_GOLD.tokens, 555]]) {
    await page.setViewportSize({ width: 1200, height });
    await host.evaluate((node, value) => {
      node.style.width = value + 'px';
      node.shadowRoot.querySelector('.shell').style.width = '100%';
    }, width);
    await theme(palette);
    for (const offset of [-2, -1, 0, 2]) {
      await host.evaluate((node, value) => node.style.setProperty('--sgs-font-offset', value + 'px'), offset);
      await extension.click();
      for (const selector of ['.shb-panel', '.shb-score', '.sh-root']) {
        const layout = await host.locator(selector).evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth }));
        assert.ok(layout.width > 0 && layout.scroll <= layout.width + 1, JSON.stringify({ name, selector, layout }));
      }
      assert.ok(await score.evaluate(node => {
        const rect = node.getBoundingClientRect(), host = node.getRootNode().host.getBoundingClientRect();
        const title = node.querySelector('.shb-score-title').getBoundingClientRect();
        const total = node.querySelector('.shb-score-total').getBoundingClientRect();
        return rect.width > 0 && rect.left >= host.left && rect.right <= host.right && total.left >= title.right
          && total.top < title.bottom && total.bottom > title.top;
      }));
      assert.ok(await tabs.locator('button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth + 1
        && button.getBoundingClientRect().top === buttons[0].getBoundingClientRect().top)));
      assert.ok(await host.locator('.shb-status').evaluateAll(states => states.every(state =>
        state.getBoundingClientRect().right <= state.parentElement.getBoundingClientRect().right
        && (!state.querySelector('svg') || state.querySelector('svg').getBoundingClientRect().height <= state.clientHeight))));
      if (offset === 2) {
        await tabs.evaluate(node => node.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: resolve(out, 'extension-' + name + '.png') });
        if (height < 600) {
          await score.locator('.shb-score-formula').scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(out, 'extension-formula-' + name + '.png') });
        }
      }
      await tabs.getByRole('button', { name: '地图', exact: true }).click();
      assert.ok(await encounter.locator('summary .sh-impact').evaluateAll(rows => rows.every(row =>
        row.scrollWidth <= row.clientWidth + 1 && row.getBoundingClientRect().right <= row.closest('summary').getBoundingClientRect().right)));
      assert.ok(await settings.locator('label').evaluateAll(rows => rows.every(row =>
        row.scrollWidth <= row.clientWidth + 1 && row.querySelector('span').getBoundingClientRect().right <= row.querySelector('input').getBoundingClientRect().left)));
      await host.getByRole('button', { name: '概况', exact: true }).click();
      assert.ok(await follow.evaluate(button => {
        const bounds = button.getBoundingClientRect(), row = button.closest('.sh-school').getBoundingClientRect();
        return bounds.x >= row.x && bounds.right <= row.right && bounds.height >= 34 && button.scrollWidth <= button.clientWidth + 1
          && button.previousElementSibling.getBoundingClientRect().right <= bounds.left;
      }));
      if (offset === 2) {
        await follow.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(out, 'follow-' + name + '.png') });
      }
      await follow.press('Enter');
      await host.getByRole('button', { name: '商店', exact: true }).click();
      assert.ok(await followedRow.locator('.sh-good-name').evaluate(title => {
        const [name, star] = [...title.children].map(child => child.getBoundingClientRect());
        const row = title.closest('summary').getBoundingClientRect();
        return star.left >= name.right && star.top < name.bottom && star.bottom > name.top
          && star.right <= row.right && title.scrollWidth <= title.clientWidth + 1;
      }));
      if (offset === 2) {
        await followedRow.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(out, 'follow-star-' + name + '.png') });
      }
      await host.getByRole('button', { name: '概况', exact: true }).click();
      await cancelFollow.press('Enter');
      await host.getByRole('button', { name: '地图', exact: true }).click();
    }
    await encounter.locator('summary').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, 'map-' + name + '.png') });
    await settings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, 'integrated-settings-' + name + '.png') });
  }
  await encounter.locator('summary').click();
  assert.deepEqual(await encounter.locator('.sh-body .sh-impact').allTextContents(), deltas);
  await host.getByRole('button', { name: '概况', exact: true }).click();
  await page.evaluate(() => { shanheFixture.adventure.visible = true; });
  await page.evaluate(() => {
    const { manager } = shanheFixture;
    manager.AllDatas.gameData.itemId.push(2101);
    manager.AllDatas.gameData.attrInfo.tro = 15;
    manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  });
  await host.getByText('资源流 · 已达成', { exact: true }).waitFor();
  await extension.click();
  await host.locator('.shb-panel summary[data-status=progress]').filter({ hasText: '从龙之功' }).waitFor();
  await waitsForClear.getByText('2/3', { exact: true }).waitFor();
  await page.evaluate(() => { shanheFixture.manager.AllDatas.seasonData.seasonId = 6; });
  await page.waitForFunction(() => !shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await page.evaluate(() => { shanheFixture.manager.AllDatas.seasonData.seasonId = 5; });
  await page.waitForFunction(() => shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await page.evaluate(() => { shanheFixture.adventure.removeSelf(); });
  await page.waitForFunction(() => !shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await page.evaluate(() => { Laya.stage.addChild(shanheFixture.adventure); });
  await page.waitForFunction(() => shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await page.evaluate(() => { shanheFixture.demo.self = { ClientId: 42 }; });
  await page.waitForFunction(() => !shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await host.locator('.shb-panel').getByText('等待官方结局配置和本局数据').waitFor();
  await score.getByText('等待官方配置和征程数据').waitFor();
  assert.equal(await score.locator('.shb-score-total').textContent(), '');
  await page.evaluate(() => { shanheFixture.manager.event('CLIENT_ROGUE_ALL_DATA_REP'); });
  await page.waitForFunction(() => shanheFixture.adventure.showItemList[0].getChildByName('sgs-shanhe-option-impact'));
  await page.evaluate(() => window[Symbol.for('sgs.ol.toolbox.core')].manager.disable('shanhetu-beta'));
  assert.equal(await host.locator('.shb-panel').count(), 0);
  assert.equal(await score.count(), 0);
  assert.deepEqual(await tabs.locator('button').allTextContents(), ['地图', '商店', '概况']);
  assert.equal(await tabs.getByRole('button', { name: '地图', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await labels(), ['战功 +5', null]);
  if (!await impactSwitch.isVisible()) await settings.locator('summary').click();
  await impactSwitch.uncheck();
  assert.deepEqual(await labels(), [null, null]);
  await host.getByRole('button', { name: '地图', exact: true }).click();
  assert.equal(await encounter.locator('.sh-impact').count(), 0);
  await mapCard.filter({ hasNotText: '商才 +10' }).waitFor({ state: 'attached' });
  assert.deepEqual(await page.evaluate(() => shanheFixture.requests), []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log('通过：拓展页签排序、键盘进入、切换保留、停用回到地图、分数和结局动态同步，以及 248／280／420px 四档字号渲染。');
  console.log('通过：套装关注、商店三级红点与面板星标、购买回执和刷新即时同步，以及原有顶部提示、结局与战法选择提醒回归。');
} finally {
  await browser.close();
}
