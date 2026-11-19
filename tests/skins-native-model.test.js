import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSkinState, matchesSkin, skinTotals, readCrystalCatalogue, readDynamicMaterials, emptyDynamicFilters } from '../src/plugins/skins/native-model.js';
import { bindVoicesInOrder, configuredCardSkills, createCrossVoice, DEATH_VOICE, NATIVE_VOICE, remapVoiceBindings, resolveVoiceBindings, withDerivedSkills } from '../src/plugins/skins/cross-voice.js';
import { createYjcmIndex, yjcmVoiceReference } from '../src/plugins/skins/yjcm.js';
import { buildYjcmData } from '../src/plugins/skins/yjcm-data.js';
import yjcmSource from './fixtures/yjcm-source.json' with { type: 'json' };

const { findYjcmSkin, findYjcmVoice, hasYjcmVoices, searchYjcmSkins, yjcmSkillVoices, yjcmSkinVoices } = createYjcmIndex(buildYjcmData(yjcmSource));

test('Jie Zhong Hui can bind and play the official derived skill Pai Yi', () => {
  const tables = {
    character: { GameCharacters: { character: [{ a: 758, j: 3913, k: 3914 }] } },
    cha_spell: { abbreviation: { field: [{ Long: 'DeriveSkills', Short: 'm' }] }, GameSpells: { spell: [
      { a: 3913, c: '权计' }, { a: 3914, c: '自立', m: '3915' }, { a: 3915, c: '排异' }, { a: 440, c: '排异' },
    ] } },
  };
  const ctx = { game: { getConfigData: name => tables[name] } };
  assert.deepEqual(configuredCardSkills(ctx, 758).map(skill => skill.id), [3913, 3914]);
  const skills = configuredCardSkills(ctx, 758, { includeDerived: true });
  assert.deepEqual(skills.map(skill => skill.id), [3913, 3914, 3915]);

  const skin = findYjcmSkin(193201, '界钟会');
  const voices = yjcmSkinVoices(skin);
  assert.deepEqual(voices.map(voice => voice.name), ['权计', '自立', '排异', '阵亡']);
  const paiYi = voices.find(voice => voice.name === '排异');
  assert.deepEqual([paiYi.id, paiYi.aliases], [440, [1449]]);
  assert.deepEqual(paiYi.urls.map(url => url.split('/').at(-1)), ['ZhongHui_PaiYi_01.mp3', 'ZhongHui_PaiYi_02.mp3']);
  assert.equal(findYjcmVoice(yjcmVoiceReference(skin, 1449)).id, 440);
  const playback = createCrossVoice(skills, voices, {});
  assert.deepEqual([playback.next(3915), playback.next(3915)].sort(), [...paiYi.urls].sort());
  assert.equal(playback.replaces(440), false);
  assert.equal(createCrossVoice(skills, voices, { 3915: NATIVE_VOICE }).replaces(3915), false);
});

test('derived skill traversal preserves card order and handles repeated and circular links', () => {
  const links = new Map([[1, '3,2,3,0'], [2, [4]], [3, [1, 5]], [4, '5,bad'], [5, '3']]);
  assert.deepEqual([...withDerivedSkills([1, 2], id => links.get(id))], [1, 2, 3, 4, 5]);
});

test('cross-server skill bindings follow card order and wrap on the shorter list', () => {
  const skills = [{ id: 101 }, { id: 102 }];
  const wuLuxun = yjcmSkillVoices(findYjcmSkin(523101, '武陆逊'));
  assert.deepEqual(wuLuxun.map(({ name }) => name), ['雄幕', '彰才', '儒贤']);
  assert.deepEqual(bindVoicesInOrder(skills, wuLuxun), { 101: [523, 525], 102: [524] });
  assert.deepEqual(bindVoicesInOrder([...skills, { id: 103 }], wuLuxun.slice(0, 2)),
    { 101: [523], 102: [524], 103: [523] });
});

test('unbound skills draw from all clips without immediate repeats and acquired skills keep native voice', () => {
  const skills = [{ id: 101 }, { id: 102 }];
  const voices = [{ id: 201, urls: ['one'] }, { id: 202, urls: ['two'] }];
  const playback = {};
  const voice = createCrossVoice(skills, voices, { 101: [201] }, playback);
  assert.equal(voice.next(101), 'one');
  assert.equal(voice.next(103), undefined);
  assert.equal(voice.next(102), 'two');
  assert.equal(createCrossVoice(skills, voices, {}, playback).next(102), 'one');
});

test('same-name defaults apply to restored skins and preserve explicit bindings and random choices', () => {
  const skills = [{ id: 715, name: '谦逊' }, { id: 716, name: '连营' }, { id: 59, name: '其他技能' }];
  const voices = [{ id: 58, name: '谦逊', urls: ['modesty'] }, { id: 59, name: '连营', urls: ['alliance'] }];
  assert.deepEqual(resolveVoiceBindings(skills, voices), { 715: [58], 716: [59] });
  assert.deepEqual(resolveVoiceBindings(skills, voices, { 715: [59], 716: [] }), { 715: [59], 716: [] });
  assert.equal(createCrossVoice(skills, voices, {}).next(715), 'modesty');
  const voice = createCrossVoice(skills, voices, { 715: [59], 716: [] });
  assert.equal(voice.next(715), 'alliance');
  assert.equal(voice.next(716), 'modesty');
});

test('keeping a skill native survives restoration and cannot be replaced by one-click binding', () => {
  const skills = [{ id: 715, name: '谦逊' }, { id: 716, name: '连营' }];
  const voices = [{ id: 58, name: '谦逊', urls: ['modesty'] }, { id: 59, name: '连营', urls: ['alliance'] }];
  const saved = { 715: NATIVE_VOICE };
  assert.deepEqual(resolveVoiceBindings(skills, voices, saved), { 715: NATIVE_VOICE, 716: [59] });
  assert.deepEqual(bindVoicesInOrder(skills, voices, saved), { 716: [59] });
  const playback = createCrossVoice(skills, voices, saved);
  assert.equal(playback.replaces(715), false);
  assert.equal(playback.next(715), undefined);
  assert.equal(playback.next(716), 'alliance');
});

test('mixed skins use their scoped sources and keep death out of random skill speech', () => {
  const art = findYjcmSkin(523101, '武陆逊'), second = findYjcmSkin(123101, '武陆逊');
  const skills = [{ id: 101, name: '雄幕' }, { id: 102, name: '彰才' }, { id: 103 }];
  const bindings = { 102: [yjcmVoiceReference(second, 524)], [DEATH_VOICE]: [yjcmVoiceReference(second, DEATH_VOICE)] };
  const voices = yjcmSkinVoices(art);
  const voice = createCrossVoice(skills, voices, bindings, {}, findYjcmVoice);
  assert.match(voice.next(101), /wuluxun02\/WuLuXun_XiongMu_/);
  assert.match(voice.next(102), /wuluxun01\/WuLuXun_ZhangCai_/);
  assert.match(voice.next(DEATH_VOICE), /wuluxun01\/WuLuXun_Dead/);
  assert.ok(Array.from({ length: 20 }, () => voice.next(103)).every(url => !url.includes('_Dead')));
  assert.equal(createCrossVoice(skills, voices, { [DEATH_VOICE]: NATIVE_VOICE }).next(DEATH_VOICE), undefined);
  const noVoiceArt = createCrossVoice(skills, [], bindings, {}, findYjcmVoice);
  assert.match(noVoiceArt.next(102), /wuluxun01\/WuLuXun_ZhangCai_/);
});

test('skins without any voice are last in the combined results and in each owning-general category', () => {
  const result = searchYjcmSkins('界马超');
  for (const entries of [result.all, ...result.categories.values()]) {
    const voiced = entries.map(hasYjcmVoices);
    assert.deepEqual(voiced, voiced.slice().sort((a, b) => Number(b) - Number(a)));
  }
  assert.ok(result.all.some(entry => entry.id === 1955101 && !hasYjcmVoices(entry)));
});

test('merged standard and Jie voices keep both sets of skills and clips and accept legacy bindings', () => {
  const xiahoudun = yjcmSkillVoices(findYjcmSkin(101801, '夏侯惇'));
  assert.deepEqual(xiahoudun.map(({ name, urls }) => [name, urls.length]), [['刚烈', 2], ['清俭', 2]]);
  assert.deepEqual(remapVoiceBindings({ 101: [49, 720] }, xiahoudun), { 101: [49] });
  const playback = createCrossVoice([{ id: 101 }], xiahoudun, { 101: [720] });
  const played = [playback.next(101), playback.next(101)];
  assert.deepEqual(played.sort(), [...xiahoudun[0].urls].sort());
  const luxun = yjcmSkillVoices(findYjcmSkin(301401, '陆逊'));
  assert.deepEqual(new Set(luxun.map(({ name }) => name)), new Set(['谦逊', '连营', '度势']));
  const liru = yjcmSkillVoices(findYjcmSkin(532001, '李儒'));
  assert.deepEqual(liru.map(({ name, urls }) => [name, urls.length]), [['灭计', 4], ['绝策', 4], ['焚城', 2]]);
});

function runtime(entries = [], crystals = [], balance = 200, crystalIds = []) {
  return { ready: true, skinManager: { GetSkinListBySkinID: () => entries },
    goodsManager: { GetGoodsNumByBaseID: () => balance, GetGoodsListByType: () => crystals },
    crystalCatalogue: { ready: true, skinIds: new Set(crystalIds) } };
}
const owned = [{ Count: 1, IsUpgrade: 0, IsForever: true }];
const vo = (extra = {}) => ({ skinID: 10101, skinlevel: '0,3', canUpdateDynamic: () => false, ...extra });
const filter = dynamic => ({ group: 'country', query: '', missing: true, owned: true, dynamic: { ...emptyDynamicFilters(), ...dynamic } });
const row = skin => ({ generalID: 101, skinBaseVo: skin });
const matches = (skin, status, dynamic) => matchesSkin(row(skin), status, filter(dynamic), () => true);
const feeSkin = (fee = 150) => vo({ UpdateInfo: { ItemID: 112101, ItemNum: fee }, canUpdateDynamic: () => true });
const crystal = (id = 10101, count = 1) => ({ ID: id, Count: count, baseInfo: { firstUsedEffect: id } });

test('base-skin synthesis and dynamic unlock are independent for legendary and limited skins', () => {
  // Cross the two qualities with both base synthesis states, all dynamic types,
  // account ownership states, resource balances and crystal inventories.
  const cases = [
    { extra: {}, type: 'none', cinnabar: false, crystal: false },
    { extra: { skinlevel: '1,3', canUpdateDynamic: () => true }, type: 'innate', cinnabar: false, crystal: false },
    { extra: { ResType: 3, NewSkinJudge: 1, update: '112101,999999', UpdateInfo: { ItemNum: 999999 } }, type: 'innate', cinnabar: false, crystal: false },
    { extra: { UpdateInfo: { ItemNum: 150 } }, type: 'unlock', cinnabar: true, crystal: true },
    { extra: { UpdateInfo: { ItemNum: 999999 } }, type: 'unlock', cinnabar: false, crystal: true },
  ];
  for (const quality of [3, 4]) for (const craftable of [false, true]) for (const c of cases)
    for (const inventory of [[], owned, [{ Count: 1, IsUpgrade: 1 }]]) for (const balance of [0, 1000]) for (const water of [[], [crystal()]]) {
      // A positive upgrade record contradicts a static-only configuration; that recovery is tested separately.
      if (c.type === 'none' && inventory[0]?.IsUpgrade === 1) continue;
      const skin = vo({ ...c.extra, CanCompose: craftable, ComfromGoodsInfo: craftable ? { ItemNum: 9999 } : null,
        skinlevel1: () => quality });
      const status = nativeSkinState(skin, runtime(inventory, water, balance, c.crystal ? [10101] : []));
      assert.equal(status.dynamicType, c.type);
      assert.equal(status.supportsCinnabar, c.cinnabar);
      assert.equal(status.supportsCrystal, c.crystal);
      assert.equal(status.dynamicOwned, c.type === 'none' ? null : !!inventory.length && (c.type === 'innate' || inventory[0].IsUpgrade === 1));
      assert.equal(matches(skin, status, { type: [c.type] }), true);
    }
});

test('cinnabar unlock only means method support and never reads the account balance', () => {
  const skin = feeSkin();
  for (const inventory of [[], owned, [{ Count: 1, IsUpgrade: 1 }]]) for (const balance of [0, 200]) {
    const status = nativeSkinState(skin, runtime(inventory, [], balance));
    assert.equal(matches(skin, status, { method: ['cinnabar'] }), true);
    assert.equal(status.supportsCinnabar, true);
  }
  const free = nativeSkinState(feeSkin(0), runtime(owned, [], 0));
  assert.equal(free.supportsCinnabar, true);
  let balanceReads = 0;
  const r = runtime(owned); r.goodsManager.GetGoodsNumByBaseID = () => { balanceReads++; throw Error('dynamic filters must not read cinnabar balance'); };
  assert.equal(nativeSkinState(skin, r).supportsCinnabar, true);
  assert.equal(balanceReads, 0);
});

test('crystal-only skins include both prepared and missing crystals, including unowned base skins', () => {
  const skin = feeSkin(999999);
  const missing = nativeSkinState(skin, runtime(owned));
  assert.equal(missing.crystalMissing, true); assert.equal(missing.crystalReady, false);
  const prepared = nativeSkinState(skin, runtime(owned, [crystal()]));
  assert.equal(prepared.dynamicOwned, false); assert.equal(prepared.crystalReady, true);
  assert.equal(prepared.crystalMissing, false);
  assert.equal(matches(skin, prepared, { ownership: ['missing'], method: ['crystalOnly'], materials: ['crystalReady'] }), true);
  const unowned = nativeSkinState(skin, runtime([], [crystal()]));
  assert.equal(unowned.crystalReady, true);
  assert.equal(matches(skin, unowned, { ownership: ['missing'], method: ['crystalOnly'] }), true);
  assert.equal(matchesSkin(row(skin), unowned, { ...filter({ method: ['crystalOnly'] }), missing: false }, () => true), false);
  const unlocked = nativeSkinState(skin, runtime([{ Count: 1, IsUpgrade: 1 }]));
  assert.equal(unlocked.dynamicOwned, true); assert.equal(unlocked.crystalMissing, false);
});

test('cinnabar implies crystal support and crystal-only filtering excludes that subset', () => {
  const skin = feeSkin();
  const status = nativeSkinState(skin, runtime(owned, [], 0, [10101]));
  assert.equal(status.supportsCinnabar, true); assert.equal(status.supportsCrystal, true);
  assert.equal(status.crystalMissing, true);
  assert.equal(matches(skin, status, { method: ['crystalOnly'] }), false);
  assert.equal(matches(skin, status, { method: ['cinnabar'] }), true);
  for (const catalogue of [{ ready: false, skinIds: new Set() }, { ready: true, skinIds: new Set() }]) {
    const r = runtime([], [], 0); r.crystalCatalogue = catalogue;
    const v = nativeSkinState(skin, r);
    assert.equal(v.supportsCinnabar, true); assert.equal(v.supportsCrystal, true);
    assert.equal(matches(skin, v, { method: ['cinnabar'] }), true);
    assert.equal(matches(skin, v, { method: ['crystalOnly'] }), false);
  }
});

test('innate skins need no unlock method or materials even with legacy sentinel prices/crystals', () => {
  for (const skin of [vo({ skinlevel: '1,3', canUpdateDynamic: () => true }), vo({ IsClenitDynamic: true }),
    vo({ IsChuChangOnlyDySkin: true }), vo({ ResType: 3, NewSkinJudge: 103, update: '112101,999999', UpdateInfo: { ItemNum: 999999 } })]) {
    const status = nativeSkinState(skin, runtime(owned, [], 0, [10101]));
    assert.equal(status.dynamicType, 'innate'); assert.equal(status.dynamicOwned, true);
    assert.equal(status.supportsCinnabar, false); assert.equal(status.supportsCrystal, false);
    assert.equal(status.crystalMissing, false);
    assert.equal(nativeSkinState(skin, runtime([])).dynamicOwned, false);
  }
});

test('a crystal product alone does not turn a static-only skin into a dynamic skin', () => {
  const skin = vo(), status = nativeSkinState(skin, runtime(owned, [crystal()], 1000, [10101]));
  assert.equal(status.capable, false); assert.equal(status.dynamicType, 'none');
  assert.equal(status.dynamicOwned, null);
  assert.equal(matches(skin, status, { ownership: ['missing'] }), false);
});

test('unknown dynamic/upgrade metadata stays unknown and is not labeled innate or missing materials', () => {
  const skin = vo({ canUpdateDynamic() { throw Error('not ready'); } });
  const status = nativeSkinState(skin, { ready: false });
  assert.equal(status.capable, null); assert.equal(status.dynamicType, 'unknown'); assert.equal(status.owned, null);
  assert.equal(matches(skin, status, { type: ['none'] }), false);
  assert.equal(matches(skin, status, { type: ['unknown'] }), true);
  const uncertain = nativeSkinState(vo({ canUpdateDynamic: () => true }), runtime(owned));
  assert.equal(uncertain.innate, false); assert.equal(uncertain.dynamicType, 'unknown');
  assert.equal(uncertain.methodUnknown, true);
  const malformed = nativeSkinState(feeSkin(999999), runtime(owned, [{ Count: undefined, baseInfo: { firstUsedEffect: 10101 } }]));
  assert.equal(malformed.crystalMissing, false); assert.equal(malformed.crystalCount, null);
});

test('an upgraded record with no upgrade fee is not reclassified as inherent dynamic', () => {
  const status = nativeSkinState(vo(), runtime([{ Count: 1, IsUpgrade: 1 }]));
  assert.equal(status.innate, false); assert.equal(status.dynamicType, 'unlock'); assert.equal(status.dynamicOwned, true);
});

test('trial dynamic inventory counts as owned dynamic but preserves a separate innate type', () => {
  const status = nativeSkinState(feeSkin(999999), runtime([{ Count: 1, IsUpgrade: 0, baseInfo: { isForeverProp: false, usingType: '1' } }]));
  assert.equal(status.dynamicOwned, true); assert.equal(status.innate, false); assert.equal(status.crystalMissing, false);
});

test('public crystal catalogue decodes abbreviations and first use effect without inventory', () => {
  const config = { root: { abbreviation: { field: [{ Long: 'ID', Short: 'a' }, { Long: 'TypeID', Short: 'e' }, { Long: 'usedeffect', Short: 'o' }] }, goodslist: { goods: [
    { a: 7000001, e: 124, o: '10101,1;20202' }, { a: 7000002, e: 124, o: '20202' }, { a: 123, e: 43, o: '30303' },
  ] } } };
  const catalogue = readCrystalCatalogue(config);
  assert.equal(catalogue.ready, true); assert.deepEqual([...catalogue.skinIds], [10101, 20202]);
  assert.equal(readCrystalCatalogue(null).ready, false);
  const data = readDynamicMaterials(runtime(owned, [crystal(), crystal(), crystal(20202)]));
  assert.equal(data.crystalCounts.get(10101), 1); assert.equal(data.crystalCounts.get(20202), 1);
});

test('filter groups use union internally and intersection across groups, independent of static ownership', () => {
  const skin = feeSkin(999999), status = nativeSkinState(skin, runtime(owned, [crystal()]));
  assert.equal(matches(skin, status, { type: ['none', 'unlock'], ownership: ['missing'], method: ['crystalOnly'], materials: ['crystalReady'] }), true);
  assert.equal(matches(skin, status, { ownership: ['owned'], materials: ['crystalReady'] }), false);
  const original = { isGeneral: true };
  assert.equal(matchesSkin(original, {}, filter(), () => true), true);
  for (const dynamic of [{ type: ['none'] }, { ownership: ['missing'] }, { method: ['crystalOnly'] }, { materials: ['crystalReady'] }])
    assert.equal(matchesSkin(original, {}, filter(dynamic), () => true), false);
  assert.equal(matchesSkin(original, {}, { ...filter(), group: 'quality' }, () => true), false);
});

test('statistics de-duplicate skins, exclude original art and count innate owned dynamic', () => {
  const a = row(vo()), b = row(vo({ skinID: 20202 }));
  assert.deepEqual(skinTotals([a, a, { isGeneral: true }, b], skin => ({ owned: skin.skinID === 10101, capable: true, dynamicOwned: skin.skinID === 10101 })),
    { total: 2, owned: 1, dynamic: 2, dynamicOwned: 1, unknown: 0 });
});

 test('base crafting filters use the current cinnabar recipe and not upgrade price or balance', () => {
  for (const [extra, expected] of [
    [{ ComfromGoodsInfo: { ItemID: 112101, ItemNum: 500 }, IsInComposeTime: true }, true],
    [{ ComfromGoodsInfo: { ItemID: 112101, ItemNum: 500 }, IsInComposeTime: false }, false],
    [{ ComfromGoodsInfo: { ItemID: 9, ItemNum: 500 }, IsInComposeTime: true }, false],
    [{ ComfromGoodsInfo: null }, false],
  ]) {
    const skin = feeSkin(); Object.assign(skin, extra);
    const status = nativeSkinState(skin, runtime([], [], 0));
    assert.equal(status.craftable, expected);
    assert.equal(matchesSkin(row(skin), status, { ...filter({}), craft: 'yes' }, () => true), expected);
    assert.equal(matchesSkin(row(skin), status, { ...filter({}), craft: 'no' }, () => true), !expected);
  }
 });
