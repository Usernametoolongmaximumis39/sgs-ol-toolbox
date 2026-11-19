import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { plain, buildConfig, buildView, enemyStats, fightPreview, generalList, nodePreview, reward, shopPreview } from '../src/plugins/shanhetu/model.js';
import { projectSnapshot, createNativeAdapter } from '../src/plugins/shanhetu/native.js';
import { activate } from '../src/plugins/shanhetu/index.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import { createShell } from '../src/ui/shell.js';
import { gameViewForScene, selectGamePanels } from '../src/core/game-view.js';
import { fixtureConfig, fixtureData, Emitter } from './fixtures/shanhetu.js';
const config = () => buildConfig(fixtureConfig());

test('official rich descriptions decode spaces and entities without exposing markup',()=>{
  assert.equal(plain('&nbsp;&nbsp;最近诸侯<br/>诸侯联军再次举州村庄。|&amp;nbsp;义军们都不敢藏军相助。'),'最近诸侯\n诸侯联军再次举州村庄。\n义军们都不敢藏军相助。');
  assert.equal(plain('<font color="#ff0">&#x5c71;&#27827;</font>&#160;&quot;战法&quot; &amp; 技能'),'山河 "战法" & 技能');
  assert.equal(plain('&#0;&#x110000;&#xD800;<script>bad()</script>正文'),'正文');
  const files=fixtureConfig();files.hd_roguelike.Root.Tactics[0].plotdesc='&nbsp;摸牌阶段，&lt;font color="red"&gt;额外摸一张牌&lt;/font&gt;。';
  assert.equal(buildConfig(files).items.get('2100').desc,'摸牌阶段，额外摸一张牌。');
});
test('official abbreviations, server node IDs and adventure options join without guessing unknown events', () => {
  const c = config(), s = projectSnapshot(fixtureData());
  const v = buildView(c, s);
  assert.equal(v.nodes[0].fight.generals[0].name, '魏延');
  assert.equal(v.nodes[0].fight.generals[1].stage, 2);
  assert.equal(v.nodes[1].options[0].lost, '铜钱 × 100');
  assert.equal(v.nodes[1].options[0].gain, '随机稀有战法');
  assert.equal(v.nodes[1].options[1].battle.generals[0].skills[0].name, '龙胆');
  assert.equal(v.nodes[3].type, 'unknown'); assert.equal(v.nodes[3].name, '事件尚未下发');
  assert.match(nodePreview(c, { location: 104, event: 99999 }, s).name, /未知事件/);
  assert.equal(nodePreview(c, { location: 104, event: 1002 }, s).options[0].note, '进入营地');
});
test('enemy growth includes fallback month row, appearance age, fractional rounding, chapter and seed', () => {
  const c = config(), s = projectSnapshot(fixtureData()), row = c.groups.get('2001')[0], fight = c.fights.get('2001'), location = s.chapterData.locations[0];
  const result = enemyStats(row, fight, location, c, s, 1);
  assert.equal(result.hp, 12); // 4 + floor((1 + 1 + 3 + 1 + .1) * 1) + 2
  assert.equal(result.draw, 4); assert.equal(result.exshatimes, 2);
  s.gameData.seedData.seedItem.push({ type: 1, attrType: 1, goal: 1, value: 2, sub: true });
  assert.equal(enemyStats(row, fight, location, c, s, 1).hp, 10);
  s.seasonData.difficulty = 999; assert.equal(enemyStats(row, fight, location, c, s, 1), null);
});
test('difficulty and chapter equipment/skills obey additions, removals and desperate thresholds', () => {
  const row = { getspell: '1;2', getspell_PT: '_1;3', getspell_KN: '4', getspell_2: '5', getspell_JJ1: '103,_2,6;104,7' };
  assert.deepEqual(generalList(row, 'getspell', 3, 103, 2), [3, 4, 5, 6]);
  assert.deepEqual(generalList(row, 'getspell', 1, 1, 1), [2, 3]);
});
test('stage cycles are bounded, hidden and later-chapter generals are omitted', () => {
  const c = config(), s = projectSnapshot(fixtureData());
  c.groups.get('2003')[0].JumpStage = '2001;1';
  c.groups.get('2001').push({ generalID: 99, hide: 1 }, { generalID: 100, startChapter: 3 });
  assert.equal(fightPreview(c, 2001, s.chapterData.locations[0], s).generals.length, 2);
  c.groups.get('2001')[0].inStage = 0;
  assert.equal(fightPreview(c, 2001, s.chapterData.locations[0], s).generals.length, 1);
});

test('chapter list removals and desperate deletions follow native order; repeated cards remain', () => {
  const row = { carddesc: '1;1;2', getcard_2: '3', getcard_3: '_1;_3;4', carddesc_JJ1: '101,_5;103,5' };
  assert.deepEqual(generalList(row, 'carddesc', 3, 103, 3), [1, 1, 2, 4]);
});

test('rewards preserve counts, unknown IDs and specified reward distinction', () => {
  const c = config(), s = projectSnapshot(fixtureData());
  assert.equal(reward(c, '2,0', 2), '随机战法 × 2');
  assert.equal(reward(c, 101, 2), '从三个普通战法中选择一个 × 2');
  assert.equal(reward(c, 2001), '魏延');
  c.choices.get('10011').showitem = 1;
  assert.equal(nodePreview(c, s.chapterData.locations[1], s).options[0].gain, '特定稀有战法');
  assert.equal(c.items.get('3001').id, 3001);
});
test('shop distinguishes zero price, dynamic surcharge/discount, unknown data and bought updates', () => {
  const c = config(), s = projectSnapshot(fixtureData());
  let shop = shopPreview(c, s); assert.equal(shop.open, false); assert.equal(shop.goods[0].price, 240); assert.equal(shop.goods[3].price, 0);
  s.shopData.exCurMoney = 25; s.gameData.itemId.push(2145);
  assert.equal(shopPreview(c, s).goods[0].price, Math.ceil(325 * ((1 - 20 / 100) * (1 - 10 / 100)))); // Preserve native floating-point rounding (235).
  s.nativeShop = [{ id: 2100, type: 2, bought: true }]; assert.equal(shopPreview(c, s).goods[0].bought, true);
  s.shopData.itemId.push(99999); assert.equal(shopPreview(c, s).goods.at(-1).price, null);
  s.gameData = null; assert.equal(shopPreview(c, s).goods[0].price, null);
  s.shopData = null; assert.equal(shopPreview(c, s), null);
});
test('projection bounds arrays, does not enumerate arbitrary getters, and preserves absent sections', () => {
  const raw = fixtureData(); Object.defineProperty(raw, 'password', { enumerable: true, get() { throw new Error('must not inspect'); } });
  const s = projectSnapshot(raw); assert.equal(s.password, undefined); assert.equal(projectSnapshot({}).shopData, null);
  raw.chapterData.locations = Array(257).fill({ location: 1 }); assert.throws(() => projectSnapshot(raw), /长度/);
});

test('received protobuf sections default omitted starting month/money to zero, absent sections stay unknown', () => {
  const raw = fixtureData(); delete raw.chapterData.accday; delete raw.chapterData.day; delete raw.gameData.money;
  const s = projectSnapshot(raw), c = config(); c.tables.EnemyGrowth.push({ moon: 0, diffnum: 0 });
  assert.equal(s.chapterData.accday, 0); assert.equal(s.chapterData.day, 0); assert.equal(s.gameData.money, 0);
  assert.ok(buildView(c, s).nodes[0].fight.generals[0].stats);
  assert.equal(projectSnapshot({}).chapterData, null); assert.equal(projectSnapshot({}).gameData, null);
});

test('map level without a configured place name does not expose technical node IDs', () => {
  const c = config(), s = projectSnapshot(fixtureData()); delete c.cities.get('101').cityname;
  assert.equal(nodePreview(c, s.chapterData.locations[0], s).city, '');
});
test('processed native shop updates override stale raw buy bits and current surcharge', () => {
  const s = projectSnapshot(fixtureData(), { ShopData: { goodList: { 2: [{ goodId: 2100, goodType: 2, isBuyed: true }] }, CurExMoney: { 2: 50 } } });
  assert.equal(s.nativeShop[0].bought, true); assert.equal(shopPreview(config(), s).goods[0].price, 280);
});
test('scene routing keeps both panel types in Shanhe battles and separates other scenes', () => {
  const panels = [{ id: 'cards', gameView: 'battle' }, { id: 'sh', gameView: 'shanhe' }, { id: 'other' }];
  for (const name of ['RogueLikeBigMapScene', 'RogueSmallMapScene']) assert.equal(gameViewForScene({ SceneName: name }), 'shanhe');
  assert.equal(gameViewForScene({ SceneName: 'RogueLikeGameScene' }), 'shanhe-battle');
  for (const name of ['RogueLike1v1Scene', 'HallScene', 'GameScene']) assert.equal(gameViewForScene({ SceneName: name }), 'battle');
  assert.deepEqual(selectGamePanels(panels, 'shanhe').map(p => p.id), ['sh', 'other']);
  assert.deepEqual(selectGamePanels(panels, 'shanhe-battle').map(p => p.id), ['cards', 'sh', 'other']);
  assert.deepEqual(selectGamePanels(panels, 'battle').map(p => p.id), ['cards', 'other']);
  assert.deepEqual(selectGamePanels(panels.filter(p => p.id !== 'sh'), 'shanhe').map(p => p.id), ['cards', 'other']);
});
function harness(t, data = fixtureData()) {
  const dom = new JSDOM('<main></main>', { url: 'https://web.sanguosha.com/' }), scope = new ResourceScope(), settings = new Settings(dom.window.localStorage);
  t.after(() => { scope.dispose(); dom.window.close(); });
  const manager = Object.assign(new Emitter(), { allDatas: data, get AllDatas() { return this.allDatas; }, requests: [], RogueLikeDataReq(mask) { this.requests.push(mask); } });
  // Object.assign evaluates accessors, so define the native getter explicitly.
  Object.defineProperty(manager, 'AllDatas', { get() { return this.allDatas; } });
  const proxy = new Emitter(); proxy.on(102007, manager, () => {});
  let account = 1, pulses = [], sceneListeners = [], opened = 0;
  const scene = { SceneName: 'RogueSmallMapScene', ged: { ShowWindowAfterCloseOther(name) { assert.equal(name, 'RogueJiShiWindow'); opened++; } } };
  scope.interval = fn => { pulses.push(fn); };
  const configs = fixtureConfig(); let panel, cleanup;
  const ctx = { window: dom.window, document: dom.window.document, scope, settings, game: { getScene: () => scene, getSelf: () => ({ ClientId: account }), getServerProxy: () => proxy, getClass: () => null, getConfigData: key => configs[key], onSceneChange: fn => { sceneListeners.push(fn); return () => { sceneListeners = sceneListeners.filter(x => x !== fn); }; } },
    ui: { registerPanel(spec) { panel = spec; cleanup = spec.render(dom.window.document.querySelector('main')); return () => cleanup?.(); } } };
  Object.assign(ctx.ui, mountPluginUI(ctx, () => ctx));
  scope.add(activate(ctx));
  return { dom, ctx, manager, scope, configs, scene, get opened() { return opened; }, get panel() { return panel; }, tick() { pulses.forEach(fn => fn()); }, account(id) { account = id; this.tick(); }, switch(name) { scene.SceneName = name; sceneListeners.forEach(fn => fn()); }, async ready() { await new Promise(resolve => setTimeout(resolve, 5)); } };
}
test('plugin rebuilds from existing snapshot and survives battle/return without journal coupling', async t => {
  const h = harness(t); await h.ready(); const root = h.dom.window.document.querySelector('main');
  assert.match(root.textContent, /北伐/); assert.equal(h.manager.requests.length, 0);
  h.switch('RogueLikeGameScene'); h.manager.allDatas.gameData.money = 123; h.manager.event('CLIENT_ROGUE_ALL_DATA_REP'); h.switch('RogueSmallMapScene');
  assert.equal(root.querySelector('.sh-meta .sh-coin').textContent, '123'); assert.equal(root.querySelector('.sh-meta .sh-coin img').alt, '铜钱');
  h.switch('HallScene'); assert.doesNotMatch(root.textContent, /北伐/);
  h.scope.dispose(); assert.equal(root.children.length, 0);
  assert.equal(h.manager._events.CLIENT_ROGUE_ALL_DATA_REP.length, 0);
});
test('missing shop queries once; user open waits for data then opens once and never mutates bShow', async t => {
  const data = fixtureData(), shop = data.shopData; delete data.shopData;
  const h = harness(t, data); await h.ready(); h.tick(); h.tick(); assert.deepEqual(h.manager.requests, [16]);
  const root = h.dom.window.document.querySelector('main'); root.querySelector('[data-key=shop]').click();
  // During auto-query the action is disabled. After response, opening uses native UI.
  assert.equal(root.querySelector('[data-key=open-shop]').disabled, true);
  data.shopData = shop; h.manager.event('CLIENT_ROGUE_ALL_DATA_REP'); await h.ready();
  root.querySelector('[data-key=open-shop]').click(); assert.equal(h.opened, 1); assert.equal(data.shopData.bShow, false);
});
test('late data after leaving the map never opens shop or issues another query', async t => {
  const data = fixtureData(); delete data.shopData; const h = harness(t, data); await h.ready();
  h.switch('RogueLikeGameScene'); data.shopData = fixtureData().shopData; h.manager.event('CLIENT_ROGUE_ALL_DATA_REP');
  assert.equal(h.opened, 0); assert.deepEqual(h.manager.requests, [16]);
});

test('timed-out shop can retry once and late reply cannot execute queued user open in battle', async t => {
  const data = fixtureData(); delete data.shopData; const h = harness(t, data); await h.ready();
  const now = Date.now(); t.mock.method(Date, 'now', () => now + 9000); h.tick();
  const root = h.dom.window.document.querySelector('main');
  assert.match(root.textContent, /未收到完整数据/);
  root.querySelector('[data-key=shop]').click(); root.querySelector('[data-key=open-shop]').click();
  assert.deepEqual(h.manager.requests, [16, 16]);
  h.switch('RogueLikeGameScene'); data.shopData = fixtureData().shopData;
  h.manager.event('CLIENT_ROGUE_ALL_DATA_REP'); await h.ready();
  assert.equal(h.opened, 0); assert.deepEqual(h.manager.requests, [16, 16]);
});
test('account switch suppresses old run until native resynchronization', async t => {
  const h = harness(t); await h.ready(); h.account(2);
  assert.match(h.dom.window.document.body.textContent, /等待新账号同步/); assert.equal(h.dom.window.document.querySelector('.sh-meta .sh-coin'), null);
  h.manager.allDatas = fixtureData(); h.manager.allDatas.gameData.money = 7; h.manager.event('CLIENT_ROGUE_ALL_DATA_REP'); await h.ready();
  assert.equal(h.dom.window.document.querySelector('.sh-meta .sh-coin').textContent, '7');
});
test('manager discovery does not invoke singleton getters or scene PveMgr getter', () => {
  let calls = 0; const cls = {}; Object.defineProperty(cls, 'Instance', { get() { calls++; throw Error('bad'); } });
  const scene = { SceneName: 'RogueSmallMapScene', get PveMgr() { calls++; throw Error('bad'); } };
  const adapter = createNativeAdapter({ game: { getScene: () => scene, getClass: () => cls, getServerProxy: () => null } });
  assert.equal(adapter.manager(), null); assert.equal(calls, 0); assert.throws(() => adapter.openShop(), /未提供/);
});
test('shell switches only the game category, preserves scroll and falls back on removal', t => {
  const dom = new JSDOM('<main></main>', { url: 'https://example.test' }), scope = new ResourceScope(); t.after(() => { scope.dispose(); dom.window.close(); });
  const shell = createShell({ window: dom.window, document: dom.window.document, settings: new Settings(dom.window.localStorage), scope });
  shell.registerPanel({ id: 'cards', category: 'game', gameView: 'battle', render(c) { c.textContent = '战斗面板'; } });
  const remove = shell.registerPanel({ id: 'sh', category: 'game', gameView: 'shanhe', render(c) { c.textContent = '山河面板'; } });
  const content = shell.shadow.querySelector('.content'); content.scrollTop = 81; shell.setGameView('shanhe'); assert.match(content.textContent, /山河面板/); assert.doesNotMatch(content.textContent, /战斗面板/);
  content.scrollTop = 24; shell.setGameView('battle'); assert.equal(content.scrollTop, 81); shell.setGameView('shanhe'); assert.equal(content.scrollTop, 24);
  shell.shadow.querySelector('[data-category=tools]').click(); shell.setGameView('battle'); assert.equal(shell.shadow.querySelector('[data-category=tools]').getAttribute('aria-selected'), 'true');
  shell.shadow.querySelector('[data-category=game]').click(); shell.setGameView('shanhe'); remove(); assert.match(content.textContent, /战斗面板/);
});
