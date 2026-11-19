import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import skins from '../src/plugins/skins/index.js';
import { readCatalogue, readInventory, collectSkins, summarizeSkins, filterSkins } from '../src/plugins/skins/model.js';
import { createSkinCollection, resolveSkinRuntime } from '../src/plugins/skins/runtime.js';
import { ResourceScope } from '../src/core/resources.js';
import { createLocalSkins } from '../src/plugins/skins/local.js';
import { indexFormSkills, indexOfficialFormRules, localSkinForm, skinFormInfo } from '../src/plugins/skins/local-forms.js';
import { createFormProgress, normalizeFormRule } from '../src/plugins/skins/form-rules.js';
import { createYjcmIndex } from '../src/plugins/skins/yjcm.js';
import { buildYjcmData } from '../src/plugins/skins/yjcm-data.js';
import { yjcmBattleEvents, yjcmSkinAction } from '../src/plugins/skins/yjcm-effects.js';
import yjcmSource from './fixtures/yjcm-source.json' with { type: 'json' };

const { findYjcmSkin, findYjcmVoice, searchYjcmSkins, yjcmSkinForms, yjcmSkinVoices } = createYjcmIndex(buildYjcmData(yjcmSource));

const config = { root: { manu: { item: [
  { skinID: 10101, name: '千里单骑', skinlevel: '0,3' },
  { skinID: 10201, name: '勇冠三军', skinlevel: '0,1' },
  { skinID: 10301, name: '未知品质', skinlevel: 'new' },
] } } };

test('Yjcm indexes battle clips by the dynamic skin and exact active form', () => {
  const source = structuredClone(yjcmSource);
  source.Skills.SpellDesc.push({ SpellId: 8971, Name: '竭雨' }, { SpellId: 8972, Name: '焚天' });
  source.GeneralSkinInfoConfig.SkinSpineConf = [
    { SkinID: 8163801, AttackAnimateInfos: [
      { SkillID: '1', FileNames: 'chuchang2.skel', AnimateNames: 'gongji' },
      { SkillID: '8971|8972', FileNames: 'chuchang2.skel', AnimateNames: 'jineng', Center: 1 },
    ], DefenceAnimateInfos: [{ SkillID: '1', FileName: 'shouji', AnimateName: 'play' },
      { SkillID: '8971', FileName: 'shouji3', AnimateName: 'play' }] },
    { SkinID: 8163801, AwakeType: 7, EnterSceneAnimateInfoInGame: [{ Index: 1, FileName: 'daiji6' }],
      AttackAnimateInSeatInfos: [{ SkillID: '2|8972', FileNames: 'daiji5', AnimateNames: 'play' }] },
  ];
  const index = createYjcmIndex(buildYjcmData(source));
  const entry = index.findYjcmSkin(8163801, '谋陆逊');
  const [first, second] = index.yjcmSkinForms(entry).map(form => form.effects);
  assert.equal(entry.id, 6163801);
  assert.equal(first.resource, '8163801');
  assert.deepEqual(first.enter.clips, [{ file: 'chuchang.sk', name: 0 }]);
  assert.equal(yjcmSkinAction(first, 1).impact.file, 'shouji.sk');
  assert.equal(yjcmSkinAction(first, 42, '竭雨').placement, 'center');
  assert.equal(yjcmSkinAction(first, 42, '竭雨').impact.file, 'shouji3.sk');
  assert.equal(yjcmSkinAction(first, 42, '焚天').impact, undefined);
  assert.equal(yjcmSkinAction(first, 8971, '他技'), undefined);
  assert.equal(second.resource, '8163802');
  assert.deepEqual(second.enter, { clips: [{ file: 'daiji6.sk', name: 0 }], placement: 'seat', replace: true });
  assert.equal(yjcmSkinAction(second, 2).clips[0].file, 'daiji5.sk');
  assert.equal(yjcmSkinAction(second, 1), undefined);
});

test('Yjcm indexes the authored seat idle order and loop counts for both forms', () => {
  const source = structuredClone(yjcmSource);
  source.GeneralSkinInfoConfig.SkinConf.find(row => row.SkinID === 8163801).ShowFrame = 1;
  source.GeneralSkinInfoConfig.ClientAwakeSkin.find(row => row.SkinID === 8163801).ShowFrame = 1;
  source.GeneralSkinInfoConfig.SkinSpineConf = [{ SkinID: 8163801, SmallStandByAnimateInfos: [
    { FileName: 'daiji3', Index: 2, Count: '1' },
    { FileName: 'daiji2', Index: 1, Count: '2|4' },
    { FileName: '../wrong', Index: 3 },
  ] }];
  const index = createYjcmIndex(buildYjcmData(source));
  const [first, second] = index.yjcmSkinForms(index.findYjcmSkin(8163801, '谋陆逊')).map(form => form.motion);
  assert.deepEqual(first.seat, [{ file: 'daiji2.sk', min: 2, max: 4 }, { file: 'daiji3.sk', min: 1, max: 1 }]);
  assert.deepEqual(first.files.slice(0, 2), ['daiji2.sk', 'daiji3.sk']);
  assert.deepEqual(second.seat, [{ file: 'daiji2.sk', min: 1, max: 1 }]);
});

test('Yjcm battle effects use confirmed card types and the skill owner in a split seat', async () => {
  const general = {}, deputy = {}, calls = [];
  const seat = { GetGeneralBySkillIdOnlyId: id => id === 88 ? deputy : null };
  const choices = [general, deputy].map((owner, i) => ({
    target: { general: owner, deputy: Boolean(i) },
    playYjcmEffect(...args) { calls.push([i, ...args]); return true; },
  }));
  const ctx = { game: { getCardMeta: card => ({ name: card === 66 ? '火杀' : '闪' }) } };
  const events = yjcmBattleEvents(ctx, seat, () => choices.slice().reverse());
  events.skillEffect({ Skill: { ID: 88, SkillName: '隽谋' }, DestSeatIDs: [3] });
  events.skillEffect({ Skill: { ID: 99, SkillName: '未知' } });
  events.cardEffect([66, 2]);
  events.skillEffect({ Skill: { ID: 1 }, CardID: 66, DestSeatIDs: [2] });
  events.cardEffect([66, 1]);
  events.skillEffect({ Skill: { ID: 1 }, CardID: 66, DestSeatIDs: [4] });
  await Promise.resolve();
  events.cardEffect([66, 1]);
  events.cardEffect([2, 2]);
  assert.deepEqual(calls, [[1, 'skill', 88, '隽谋', [3]], [0, 'attack', 1, '', [2]],
    [0, 'attack', 1, '', undefined], [0, 'dodge', 2, '', undefined]]);
});

test('Yjcm static catalogue searches owning generals and their aliases without duplicating shared skins', () => {
  assert.deepEqual(searchYjcmSkins('   '), { all: [], categories: new Map() });
  assert.deepEqual(searchYjcmSkins('青梅煮酒').all, []);
  assert.deepEqual(searchYjcmSkins('２００１０２').all, []);
  const { all: liuBei } = searchYjcmSkins('刘备');
  const skin = liuBei.find(entry => entry.id === 200102);
  assert.equal(skin.general, '刘备');
  assert.equal(skin.head, '200102');
  assert.deepEqual(skin.assets, [[0, '200102'], [1, '200102']]);
  assert.equal(liuBei.filter(entry => entry.id === skin.id).length, 1);
  const { all: jieCao, categories: jieCaoCategories } = searchYjcmSkins('界曹操');
  assert.deepEqual([...jieCaoCategories.keys()], ['曹操']);
  assert.deepEqual(jieCao, searchYjcmSkins('曹操').categories.get('曹操'));
  const { all: zhuge, categories } = searchYjcmSkins('诸葛亮');
  assert.ok(!zhuge.some(entry => entry.general === '小约翰可汗' || entry.id === 1131607));
  assert.deepEqual([...categories.keys()], ['武诸葛亮', '谋诸葛亮', '神诸葛亮', '有诸葛亮', '诸葛亮']);
  assert.deepEqual(categories.get('武诸葛亮').map(entry => entry.id), [523001, 123001]);
  assert.ok(searchYjcmSkins('小约翰可汗').all.some(entry => entry.id === 1131607));
  const { all: cao } = searchYjcmSkins('曹操');
  assert.equal(cao[0].general, '威曹操');
  assert.equal(cao.at(-1).general, '曹操');
  assert.equal(cao.length, new Set(cao.map(entry => entry.id)).size);
});

test('Yjcm general filters order official prefixes before other variants and standard names', () => {
  const prefixes = ['', '有', '新', '爻', '忍', '烈', '食', 'SP', '星', '神', '乐', '谋', '威', '武'];
  const index = createYjcmIndex({
    skins: prefixes.map((_, i) => [i + 1, '经典形象']),
    generals: prefixes.map((prefix, i) => [prefix + '诸葛亮', prefix && prefix !== '神' ? '诸葛亮' : '', [i + 1]]),
    alternateSkinAssets: {}, voiceFiles: ['clip.mp3'], voiceNames: ['台词'], voiceSkins: {},
  });
  const expected = ['武', '威', '谋', '乐', '神', '星', 'SP', '食', '烈', '忍', '爻', '新', '有', ''].map(prefix => prefix + '诸葛亮');
  assert.deepEqual([...index.searchYjcmSkins('诸葛').categories.keys()], expected);
});

test('Yjcm search merges standard and Jie categories while keeping separate versions distinct', () => {
  const { all, categories } = searchYjcmSkins('陆逊');
  assert.deepEqual(all.slice(0, 4).map(entry => entry.id), [523101, 123101, 521002, 521001]);
  assert.ok(all.findIndex(entry => entry.id === 101401) < all.findIndex(entry => entry.id === 1204491));
  assert.equal([...categories.keys()][0], '武陆逊');
  assert.equal([...categories.keys()].at(-1), '陆逊');
  assert.deepEqual(categories.get('武陆逊').map(entry => entry.id), [523101, 123101]);
  assert.deepEqual(categories.get('谋陆逊').map(entry => entry.id), [6163801, 1163801]);
  const paired = categories.get('谋陆逊')[0];
  assert.equal(paired.dynamicId, 8163801);
  assert.equal(findYjcmSkin(8163801, '谋陆逊'), paired);
  assert.deepEqual(yjcmSkinForms(paired).map(form => form.motion.resource), ['8163801', '8163802']);
  assert.equal(categories.has('界陆逊'), false);
  assert.equal(categories.get('陆逊').find(entry => entry.id === 101401).general, '陆逊');
  assert.deepEqual(all.filter(entry => entry.id === 101401).map(entry => entry.general), ['陆逊']);
  assert.ok(searchYjcmSkins('钟会').categories.get('钟会').some(entry => entry.id === 1207031));
  assert.equal(findYjcmSkin(101401, '界陆逊'), findYjcmSkin(101401, '陆逊'));
  assert.deepEqual([...searchYjcmSkins('界SP黄月英').categories.keys()], ['SP黄月英']);
});

test('Yjcm search hides trial entries and retains the same skin when shared by a regular general', () => {
  assert.deepEqual(searchYjcmSkins('体验').all, []);
  const { all, categories } = searchYjcmSkins('陆逊');
  assert.equal(categories.has('谋陆逊·体验'), false);
  assert.equal(all.some(entry => entry.id === 15300201), false);
  assert.equal(searchYjcmSkins('神刘备').all.find(entry => entry.id === 120901).general, '神刘备');
  assert.equal(findYjcmSkin(15300201, '谋陆逊·体验').id, 15300201);
});

test('Yjcm catalogue exposes verified unlisted skill and death clips for newer generals', () => {
  const entries = searchYjcmSkins('乐曹植').categories.get('乐曹植');
  assert.equal(entries.length, 4);
  for (const entry of entries) {
    const voices = yjcmSkinVoices(entry);
    assert.deepEqual(voices.map(({ name, urls }) => [name, urls.length]),
      [['赋乐', 2], ['文澜', 2], ['阵亡', 1]]);
  }
  const classic = findYjcmSkin(1134101, '乐曹植');
  assert.ok(yjcmSkinVoices(classic)[0].urls[0].endsWith('/yuecaozhi01/YueCaoZhi_FuYue_01.mp3'));
  for (const [id, name] of [[1191401, '王越'], [1233101, '傅干'], [1220801, '威曹彰'], [1255101, '王元姬']]) {
    assert.equal(yjcmSkinVoices(findYjcmSkin(id, name)).at(-1).name, '阵亡');
  }
});

test('Yjcm alternate portraits preserve the skin ID and separate same-skill and death clips by form', () => {
  for (const [id, first, second, baseVoice, alternateVoice] of [
    [1163801, '1163801', '1163802', 'mouluxun01', 'mouluxun02'],
    [6163801, '6163801', '6163802', 'mouluxun03', 'mouluxun04'],
  ]) {
    const skin = findYjcmSkin(id, '谋陆逊');
    const forms = yjcmSkinForms(skin);
    assert.deepEqual(forms.map(form => form.id), [id, id]);
    assert.ok(forms[0].assets.some(([kind, stem]) => kind === 0 && stem === first));
    assert.ok(forms[1].assets.some(([kind, stem]) => kind === 0 && stem === second));
    for (const [form, folder] of [[1, baseVoice], [2, alternateVoice]]) {
      const groups = yjcmSkinVoices(skin, form);
      assert.deepEqual(groups.map(group => group.id), [3714, 3715, -1]);
      for (const group of groups) {
        assert.ok(group.urls.length && group.urls.every(url => url.includes('/' + folder + '/')));
        assert.deepEqual(findYjcmVoice(`${id}:${group.id}:谋陆逊`, form).urls, group.urls);
      }
    }
  }
  const single = findYjcmSkin(523101, '武陆逊');
  assert.deepEqual(yjcmSkinForms(single), [single]);
  assert.deepEqual(yjcmSkinVoices(single, 2), yjcmSkinVoices(single));
});

function harness() {
  const dom = new JSDOM('<main></main>', { url: 'https://web.sanguosha.com' });
  const scope = new ResourceScope(), values = new Map();
  const source = { self: { ClientId: 1001 }, goods: { selfBagFinished: true }, config,
    inventory: new Map([[10101, [{ ID: 11, Count: 1, IsUpgrade: 1, IsForever: true }, { ID: 12, Count: 2, IsUpgrade: 0, IsForever: false }]]]), reads: 0, loads: 0 };
  source.skin = { GetSkinListBySkinID(id) { source.reads++; return source.inventory.get(id) || []; } };
  const proxy = { _events: { ClientSkinFromRep: { caller: source.skin }, DbsCcMovegoodsRep: [{ caller: source.goods }] } };
  let panel, cleanup;
  const game = { getSelf: () => source.self, getClass: () => null, getServerProxy: () => proxy,
    getConfigData: () => source.config, loadConfigData: async () => { source.loads++; return config; } };
  const settings = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) };
  const ctx = { window: dom.window, document: dom.window.document, scope, game, settings,
    ui: { nativeTheme: { watch(fn) { fn({text:'#eee',surface:'#222',border:'#555',accent:'#ca8'}); return scope.add(() => {}); } }, registerPanel(spec) { panel = spec; const off = () => { cleanup?.(); }; scope.add(off); return off; } } };
  return { ctx, source, proxy, scope, game, settings, dom,
    render() { cleanup = panel.render(dom.window.document.querySelector('main')); return dom.window.document.querySelector('main'); },
    unmount() { cleanup?.(); cleanup = null; }, close() { scope.dispose(); dom.window.close(); } };
}

test('saved Jie skin bindings can be reopened from the merged category', async () => {
  const h = harness();
  const target = { id: 101, isSelf: true };
  try {
    h.game.loadConfigData = async name => name === 'yjcm-skins' ? yjcmSource : config;
    const local = createLocalSkins(h.ctx);
    await local.yjcm.load();
    const bindings = { 38: [720] };
    h.settings.set('localSkin.1001.101', { kind: 'cross', id: 101801, general: '界夏侯惇', bindings });
    assert.deepEqual(local.bindings(target, findYjcmSkin(101801, '夏侯惇')), bindings);
    assert.equal(local.bindings(target, findYjcmSkin(107701, '夏侯惇')), undefined);
  } finally { h.close(); }
});

test('skin catalogue preserves unknown quality and drops duplicate/invalid IDs without inventing missing inventory', () => {
  assert.equal(readCatalogue(null).ready, false);
  assert.equal(readCatalogue({ root: { manu: { item: [] } } }).ready, false);
  const result = readCatalogue({ root: { manu: { item: [...config.root.manu.item, { skinID: 10101 }, { skinID: -1 }] } } });
  assert.equal(result.excluded, 2);
  assert.equal(result.rows[0].qualityName, '传说');
  assert.equal(result.rows[2].quality, null);
});

test('skin ownership sums distinct inventory stacks, retains temporary and upgrade states, treats malformed counts as unknown', () => {
  const entry = { ID: 1, Count: 2, IsUpgrade: 0, IsForever: true };
  assert.deepEqual(readInventory([entry, entry, { ID: 2, Count: 1, IsUpgrade: 1, IsForever: false }]), { count: 3, owned: true, upgrade: true, temporary: true });
  assert.equal(readInventory([{ Count: 0 }]).owned, false);
  assert.equal(readInventory([{ Count: 1 }]).upgrade, null);
  assert.equal(readInventory([{ Count: 1 }, { Count: -1 }]).owned, null);
  assert.equal(readInventory(undefined).owned, null);
  assert.equal(readInventory([]).owned, false);
});

test('skin filters preserve unknown rows and quantity summary rather than treating errors as unowned', () => {
  const rows = collectSkins(readCatalogue(config).rows, id => {
    if (id === 10101) return [{ Count: 2, IsUpgrade: 1 }];
    if (id === 10301) throw Error('inventory unavailable');
    return [];
  });
  assert.deepEqual(summarizeSkins(rows), { total: 3, owned: 1, missing: 1, unknown: 1, quantity: 2, upgraded: 1 });
  assert.deepEqual(filterSkins(rows, { ownership: 'missing' }).map(row => row.skinId), [10201]);
  assert.equal(filterSkins(rows, { query: '千里', quality: '3' }).length, 1);
  assert.equal(filterSkins(rows, { ownership: 'unknown' })[0].skinId, 10301);
  assert.equal(filterSkins(rows, { sort: 'quality' })[0].skinId, 10101);
});

test('skin runtime resolves existing event callers and never calls singleton factories/getters', () => {
  const h = harness();
  let factories = 0;
  class Trap { static get instance() { factories++; throw Error('instantiate'); } static I() { factories++; } }
  h.game.getClass = () => Trap;
  try {
    assert.equal(resolveSkinRuntime(h.game).ready, true);
    assert.equal(factories, 0);
    h.source.goods.selfBagFinished = false;
    assert.match(resolveSkinRuntime(h.game).message, /尚未加载完成/);
    h.source.self = null;
    assert.equal(resolveSkinRuntime(h.game).accountId, null);
  } finally { h.close(); }
});

test('skin collection does not read incomplete bags or publish a false zero-owned result', async () => {
  const h = harness();
  try {
    const collection = createSkinCollection(h.ctx);
    h.source.goods.selfBagFinished = false;
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'waiting');
    assert.equal(h.source.reads, 0);
    assert.deepEqual(collection.getSnapshot().rows, []);
    h.source.goods.selfBagFinished = true;
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'ready');
    assert.equal(collection.getSnapshot().rows[0].count, 3);
    h.source.self = { ClientId: 2002 };
    collection.checkIdentity();
    assert.deepEqual(collection.getSnapshot().rows, []);
    assert.equal(collection.getSnapshot().accountId, '2002');
  } finally { h.close(); }
});

test('skin late config response cannot publish prior-account inventory or act after uninstall', async () => {
  const h = harness();
  let finish;
  h.source.config = null;
  h.game.loadConfigData = () => new Promise(resolve => { finish = resolve; });
  try {
    const collection = createSkinCollection(h.ctx), pending = collection.refresh();
    h.source.self = { ClientId: 2002 };
    finish(config); await pending;
    assert.equal(collection.getSnapshot().status, 'waiting');
    assert.equal(h.source.reads, 0);
    const second = collection.refresh();
    h.scope.dispose(); finish(config); await second;
    assert.equal(collection.getSnapshot().status, 'stopped');
    assert.equal(h.source.reads, 0);
  } finally { h.close(); }
});

test('skin config failure is shown without stale totals and repeated refresh recovers', async () => {
  const h = harness();
  try {
    const collection = createSkinCollection(h.ctx);
    await collection.refresh();
    h.source.config = null;
    h.game.loadConfigData = async () => { throw Error('配置格式错误'); };
    await collection.refresh();
    assert.equal(collection.getSnapshot().status, 'error');
    assert.deepEqual(collection.getSnapshot().rows, []);
    h.source.config = config;
    await collection.refresh();
    assert.equal(collection.getSnapshot().rows.length, 3);
  } finally { h.close(); }
});

test('skin tools panel has independent persisted switches and does not read inventory on mount', () => {
  const h = harness();
  try {
    skins.activate(h.ctx);
    assert.deepEqual(skins.manifest.categories, ['tools']);
    const switches = () => [...h.dom.window.document.querySelectorAll('[role=switch]')];
    h.render();
    assert.deepEqual(switches().map(input => input.checked), [true, true, true, false, false, false, false, true]);
    const [crossServer, optimize] = switches().slice(-2);
    assert.equal(optimize.disabled, true);
    crossServer.click();
    assert.equal(optimize.disabled, false);
    optimize.click();
    crossServer.click();
    crossServer.click();
    assert.deepEqual([optimize.disabled, optimize.checked, h.settings.get('yjcmDynamicOptimization')], [false, false, false]);
    switches()[1].click();
    switches()[0].click();
    assert.deepEqual(switches().slice(0, 3).map(input => [input.checked, input.disabled]), [[false, false], [false, true], [true, true]]);
    h.unmount(); h.render();
    switches()[0].click();
    assert.deepEqual(switches().slice(0, 3).map(input => input.checked), [true, false, true]);
    assert.equal(h.source.loads, 0);
    assert.equal(h.source.reads, 0);
    h.scope.dispose();
  } finally { h.close(); }
});

test('local skin selection and automatic animation are independent and preserve the native seat model', () => {
  const h = harness(), calls = [];
  function seatUI(index, isSelf) {
    const General = { SkinId: 0, IsDynamic: false, DySkinType: 1, CardName: isSelf ? '张辽' : '曹操' };
    return { seat: { Index: index, General, IsSelf: isSelf, IsFull: true, GeneralId: 101,
      SetGeneralSkin() { assert.fail('seat model must be untouched'); } },
    seatAvatar: { generalCard: General, skinItemID: 0, SetSkin(id) {
      calls.push([index, id, this.generalCard.IsDynamic]);
      this.generalCard.JueXingState = 2;
      this.skinItemID = id;
      this.skeleton = this.generalCard.IsDynamic ? {} : null;
    } } };
  }
  const mine = seatUI(0, true), opponent = seatUI(1, false);
  mine.seat.General.SkinId = mine.seatAvatar.skinItemID = 10101;
  opponent.seat.General2Id = 102; opponent.seat.General2 = { CardName: '未亮武将' };
  opponent.seat.IsFaceUp = index => index === 0;
  const scene = {};
  h.game.getSeatUIs = () => [mine, opponent];
  h.game.getSelfSeatUI = () => mine;
  h.game.getScene = () => scene;
  h.game.isInGame = () => true;
  h.source.skin.GetOnlineSKinList = () => [
    { skinID: 10101, skinname: '已有皮肤', SeatAnimateUrl: 'res/owned.sk' },
    { skinID: 10102, skinname: '未有皮肤', SeatAnimateUrl: 'res/unowned.sk' },
  ];
  try {
    const local = createLocalSkins(h.ctx);
    const [self, other] = local.refresh();
    assert.equal(local.refresh().length, 2);
    assert.deepEqual(local.options(self), []);
    h.settings.set('unlockDynamic', true);
    local.refresh(); local.refresh();
    assert.deepEqual(calls, [[0, 10101, true]]);
    assert.equal(h.source.reads, 0);
    assert.equal(local.has(self), false);
    assert.deepEqual(local.options(self), []);
    assert.throws(() => local.select(self, 10102), /不可用/);
    mine.seatAvatar.SetSkin(10101);
    delete self.general.JueXingState;
    local.refresh();
    assert.deepEqual(calls.slice(-2), [[0, 10101, false], [0, 10101, true]]);
    h.settings.set('unlockSkin', true);
    assert.deepEqual(local.options(self).map(x => [x.id, x.owned]), [[0, true], [10101, true], [10102, false]]);
    h.source.goods.selfBagFinished = false;
    assert.equal(local.options(self)[2].owned, null);
    h.source.goods.selfBagFinished = true;
    assert.equal(local.select(self, 10102).owned, false);
    assert.equal(self.avatar.skinItemID, 10102);
    assert.ok(self.avatar.skeleton);
    assert.equal(self.avatar.generalCard, self.general);
    assert.equal(self.general.IsDynamic, false);
    assert.equal(self.general.SkinId, 10101);
    assert.equal(self.general.JueXingState, undefined);
    assert.equal(other.avatar.skinItemID, 0);
    h.settings.set('unlockDynamic', false); local.refresh();
    assert.equal(self.avatar.skinItemID, 10102);
    assert.equal(self.avatar.skeleton, null);
    h.settings.set('unlockDynamic', true); local.refresh();
    assert.ok(self.avatar.skeleton);
    h.settings.set('unlockSkin', false); local.refresh();
    assert.equal(self.avatar.skinItemID, 10101);
    assert.ok(self.avatar.skeleton);
    mine.seat.General.SkinId = 10102;
    mine.seatAvatar.SetSkin(10102);
    local.refresh();
    assert.deepEqual(calls.slice(-2), [[0, 10102, false], [0, 10102, true]]);
    assert.equal(self.general.IsDynamic, false);
    h.settings.set('otherPlayers', true);
    local.select(other, 10102);
    assert.ok(other.avatar.skeleton);
    other.general.SkinId = 10103; other.avatar.skinItemID = 10103;
    h.scope.dispose();
    assert.deepEqual(calls.slice(-2), [[1, 10102, true], [0, 10102, false]]);
    assert.equal(self.avatar.skeleton, null);
    assert.equal(other.avatar.skinItemID, 10103);
  } finally { h.close(); }
});

test('skin batched collection stops immediately after scope is disposed', async () => {
  const h = harness();
  h.source.config = { root: { manu: { item: Array.from({ length: 500 }, (_, index) => ({ skinID: 50001 + index, name: '皮肤', skinlevel: '0,1' })) } } };
  try {
    const collection = createSkinCollection(h.ctx), pending = collection.refresh();
    assert.equal(h.source.reads, 160);
    h.scope.dispose(); await pending;
    assert.equal(h.source.reads, 160);
    assert.equal(collection.getSnapshot().status, 'stopped');
  } finally { h.close(); }
});

test('local skin forms parse official conditions without relying on the skin ID', () => {
  const data = { skills: indexFormSkills({ GameSpells: { spell: [
    { a: 8001, c: '新觉醒', b: '3,4,5,6,23', m: '8002', o: '觉醒技，然后你获得“<font href=\'8002\'>新所得</font>”。' },
    { a: 8003, c: '合势' }, { a: 8004, c: '引弦' }, { a: 8005, c: '解阵' },
    { a: 8006, c: '授印', b: '3,4,5,6', m: '8002', o: '觉醒技，然后令一名角色获得“<font href=\'8002\'>新所得</font>”。' },
  ] } }) };
  const option = (count, condition) => ({ id: 90001,
    forms: skinFormInfo({ IsManyStateDyskin: true, NewSkinJudge: count, ConMessage: condition }) });
  const native = { id: 0, form: 1 };
  const target = { id: 900, seat: { Hp: 4 }, general: { HasSkill: skill => skill === 8002 } };
  const readForm = (skin, uses, previous) => localSkinForm(skin, native, target, uses, data, previous);
  const wake = option(2, '发动「新觉醒」转换形态');
  assert.equal(readForm(wake), 2);
  assert.equal(localSkinForm(wake, { id: 90001, form: 1, dynamic: true }, target, null, data), 1);
  assert.equal(localSkinForm(wake, { id: 90001, form: 1, dynamic: false }, target, null, data), 2);
  assert.equal(readForm(option(2, '授印')), 1);

  const health = option(3, '小于４血切换形态三');
  assert.equal(readForm(health), 1);
  target.seat.Hp = 3;
  assert.equal(readForm(health), 3);
  target.seat.Hp = 4;
  assert.equal(readForm(health, undefined, 3), 1);
  target.seat.Hp = undefined;
  assert.equal(readForm(health, undefined, 3), 3);

  const used = (...skills) => new Map(skills.map((skill, i) => [skill, { count: 1, order: i + 1 }]));
  const combo = option(3, '发动合势／引弦切二形态<br/>发动合势&amp;引弦切三形态');
  assert.equal(readForm(combo, used(8004)), 2);
  assert.equal(readForm(combo, used(8004, 8003)), 3);
  const ordered = option(3, '发动解阵切第一形态 发动合势切第二形态 发动引弦切第三形态');
  assert.equal(readForm(ordered, used(8003, 8004)), 3);
  assert.equal(readForm(ordered, used(8004, 8003)), 2);
  assert.equal(readForm(ordered, used(8004, 8005)), 1);

  const counted = count => new Map([[8003, { count, order: count }]]);
  const exchange = option(2, '发动合势转换形态');
  assert.equal(readForm(exchange, counted(1)), 2);
  assert.equal(readForm(exchange, counted(2)), 1);
  assert.equal(readForm(option(2, '第３次发动合势切换形态'), counted(2)), 1);
  assert.equal(readForm(option(2, '第３次发动合势切换形态'), counted(4)), 2);
  assert.equal(readForm(option(2, '每三次发动合势切换形态'), counted(6)), 1);

  data.classicRows = [
    { generalID: 900, conType: 2, modeJudge: 1, imageID: 'base', Typenums: '8003,4',
      next_mode: 'changed', ConMessage: '多次发动合势切换形态' },
    { generalID: 900, conType: 2, modeJudge: 2, imageID: 'changed', ConMessage: '多次发动合势切换形态' },
  ];
  const classic = option(2, '多次发动合势转换形态');
  assert.equal(readForm(classic, counted(3)), 1);
  assert.equal(readForm(classic, counted(4)), 2);
  assert.equal(localSkinForm(classic, native, { ...target, id: 901 }, counted(4), data), 1);

  assert.equal(readForm(option(3, '发动合势切第二形态，仅在其他角色回合'), used(8003)), 1);
  assert.equal(readForm(option(2, '发动合势切第三形态'), used(8003)), 1);
  assert.equal(readForm(option(2, '体力值变化'), used(8003)), 1);
  assert.equal(readForm(option(3, '发动合势切第二形态 发动未知技能切第三形态'), used(8003)), 1);
});

test('local skin form applies a confirmed skill after the official spell table finishes loading', async () => {
  const h = harness(), scene = {};
  const general = { CardName: '新武将', SkinId: 0 };
  const seat = { General: general, GeneralId: 900, IsSelf: true, OnChangeOriSkinBySkill() {} };
  const avatar = { generalCard: general, skinItemID: 0, SetSkin(id, _x, _offset, _scale, form) {
    this.skinItemID = id;
    this.form = form;
  } };
  const ui = { seat, seatAvatar: avatar };
  Object.assign(h.game, { getScene: () => scene, getSeatUIs: () => [ui],
    isInGame: () => true, getConfigData: () => null });
  let finish;
  h.game.loadConfigData = key => key === 'cha_spell' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null);
  h.source.skin.GetOnlineSKinList = () => [{ skinID: 90001, IsManyStateDyskin: true, NewSkinJudge: 2,
    ConMessage: '每两次发动「新刻·变」切换形态' }];
  h.settings.set('unlockSkin', true);
  try {
    const local = createLocalSkins(h.ctx);
    const [target] = local.refresh();
    local.select(target, 90001);
    seat.OnChangeOriSkinBySkill(900, 8010);
    seat.OnChangeOriSkinBySkill(900, 8010);
    assert.equal(avatar.form, 1);
    await new Promise(resolve => setImmediate(resolve));
    finish({ GameSpells: { spell: [{ a: 8010, c: '新刻·变' }] } });
    await new Promise(resolve => setImmediate(resolve));
    local.refresh();
    assert.equal(avatar.form, 2);
    assert.equal(general.SkinId, 0);
  } finally { h.close(); }
});

test('dual form catalogue resolves abbreviated official condition rows', () => {
  const rules = indexOfficialFormRules({ generalskin: {
    items: { item: [
      { a: 602101, c: '虎啸龙渊*曹纯', ab: 2, ad: '体力值变化' },
      { a: 42604, c: '虎啸龙渊*曹纯', ab: 2, ad: '小于3血切换形态2' },
      { a: 66101, b: 661, ab: 2 },
    ] },
    specialgeneral: [{ generalID: 661, modeJudge: 1, ConMessage: '哀歌觉醒前为1形态 哀歌觉醒后为2形态' }],
  } });
  assert.deepEqual(rules.get(602101).rule, { kind: 'hp', compare: '小于', threshold: 3, form: 2 });
  assert.equal(rules.get(66101).rule.kind, 'awakening');
  assert.deepEqual(skinFormInfo({ IsManyStateDyskin: true, NewSkinJudge: 2, ConMessage: '成略/迁附' }).rule.names, ['成略', '迁附']);
});

test('manual switching starts fresh counters and waits for a new HP threshold entry', () => {
  const target = { seat: { Hp: 3 } }, skillCounts = new Map([[81, 5]]);
  const config = normalizeFormRule({ mode: 'custom', rules: [
    { kind: 'every', times: 2, skills: [81] }, { kind: 'hp', compare: 'gte', hp: 3 },
  ] });
  const progress = createFormProgress({ config, target,
    getSkillCount: id => skillCounts.get(id) ?? 0, getCardSkillIds: () => new Set([81]) });
  const use = skill => {
    skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
    return progress.update({ skill });
  };
  assert.equal(use(81), 1);
  assert.equal(progress.advance(), 2);
  assert.equal(progress.update(), 2, 'a threshold already satisfied at the manual switch does not fire');
  target.seat.Hp = 2;
  assert.equal(progress.update(), 2);
  target.seat.Hp = 3;
  assert.equal(progress.update(), 1);
  assert.equal(use(82), 1);
  assert.equal(use(81), 1);
  assert.equal(use(81), 2);
});

test('dual forms count only the selected general card using its printed skills', () => {
  const h = harness(), scene = {};
  const makeSeat = (id, isSelf) => {
    const general = { SkinId: 0 };
    const seat = { General: general, GeneralId: id, IsSelf: isSelf, OnChangeOriSkinBySkill() {} };
    const avatar = { generalCard: general, skinItemID: 0, SetSkin(skin, _x, _offset, _scale, form) {
      this.skinItemID = skin;
      this.form = form;
    } };
    return { seat, seatAvatar: avatar };
  };
  const self = makeSeat(900, true), other = makeSeat(901, false);
  const deputy = makeSeat(902, true);
  Object.assign(self.seat, { General2: deputy.seat.General, General2Id: deputy.seat.GeneralId });
  self.seatAvatarFu = deputy.seatAvatar;
  const configs = {
    character: { GameCharacters: { character: [{ a: 900, j: 81, k: 82, l: 83 }, { a: 901, j: 81, k: 84 }, { a: 902, j: 81 }] } },
    cha_spell: { GameSpells: { spell: [81, 82, 83, 84].map(a => ({ a, c: '技能 ' + a })) } },
  };
  Object.assign(h.game, { getScene: () => scene, getSeatUIs: () => [self, other], isInGame: () => true,
    getConfigData: name => configs[name] });
  h.source.skin.GetOnlineSKinList = () => [{ skinID: 90001, IsManyStateDyskin: true, NewSkinJudge: 2 }];
  h.settings.set('unlockSkin', true);
  h.settings.set('otherPlayers', true);
  try {
    const local = createLocalSkins(h.ctx);
    const [target] = local.refresh();
    local.select(target, 90001, { mode: 'custom', rules: [
      { kind: 'all', skills: [81, 83] }, { kind: 'once', times: 2, skills: [82] },
    ] });
    other.seat.OnChangeOriSkinBySkill(901, 81);
    self.seat.OnChangeOriSkinBySkill(902, 81);
    self.seat.OnChangeOriSkinBySkill(900, 82);
    self.seat.OnChangeOriSkinBySkill(900, 83);
    assert.equal(self.seatAvatar.form, 1);
    self.seat.OnChangeOriSkinBySkill(900, 81);
    assert.equal(self.seatAvatar.form, 2);
    other.seat.OnChangeOriSkinBySkill(901, 82);
    assert.equal(self.seatAvatar.form, 2);
    self.seat.OnChangeOriSkinBySkill(900, 82);
    assert.equal(self.seatAvatar.form, 1);
    assert.equal(self.seat.General.SkinId, 0);
    assert.equal(other.seatAvatar.skinItemID, 0);
    assert.equal(local.formRule(900, 'native', 90001).rules[0].kind, 'all');

    h.settings.set('formRule.1001.900.native.90001', { mode: 'custom', rules: [
      { kind: 'any', skills: [81, 84] }, { kind: 'none' },
    ] });
    local.select(target, 90001);
    self.seat.OnChangeOriSkinBySkill(900, 84);
    self.seat.OnChangeOriSkinBySkill(900, 81);
    assert.equal(self.seatAvatar.form, 1, 'an old direction with a foreign skill stays inactive');
  } finally { h.close(); }
});
