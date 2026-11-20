import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileConfigData } from '../src/plugins/skins/mobile-config-data.js';
import { readMobileConfigTable } from '../src/plugins/skins/mobile-config-lua.js';

function binding(spellId, skin, soundId, file, subtype, characterId = 0) {
  return `[${soundId}] = { id=${spellId}, skinId=${JSON.stringify(skin)}, chrid=${characterId}, soundId=${soundId},
    filename=${JSON.stringify(file)}, type=2, ${subtype ? 'subType=' + subtype + ',' : ''}
    text="不可保留的示例台词" }`;
}
const tables = () => new Map([
  ['skin.lua', `local data = {
    [87002]={skinid=87002, chrid=870, chrList={870,871}, name="剑引天霖*神姜维", motionMode="return function() end"},
    [30011]={skinid=30011, chrid=2, chrList={2,300}, name="圣垂千古*关羽"},
    ["30011#1"]={skinid="30011#1", chrid=0, name="第二形态"},
  }; return data`],
  ['chrCfg.lua', `local data = {items={{id=2,name="关羽"},{id=300,name="界关羽"},{id=870,name="神姜维"},
    {id=668,name="谋诸葛亮"},{id=669,name="谋诸葛亮",selldes="即将上线"}}}
    if app then error("客户端环境分支") end
    return data`],
  ['SpellData.lua', `local data = {
    {id=1, Name="杀", Attribute=1}, {id=8, Name="决斗", Attribute=2},
    {id=33, Name="武圣", Attribute=8}, {id=1217, Name="武圣", Attribute=8},
    {id=1506, Name="星魂", Attribute=8}, {id=878, Name="戈帛", Attribute=8},
    {id=11266, Name="慧识", Attribute=8}, {id=11268, Name="辉逝", Attribute=8},
  }; return data`],
  ['Cards.lua', `local data = {
    {id=1, SpellId=1, SubType=0, Name="杀"}, {id=2, SpellId=1, SubType=6, Name="火杀"},
  }; return data`],
  ['key_card.lua', 'local data = {type = {[1]={spellId=8, keycardName="决斗"}}}; return data'],
  ['SoundCfg.lua', `local data = {
    [2] = {
      [0] = { [30011] = { [0] = { ${binding(0, 30011, 170, 'SKILL_misc_1')} } } },
      [1] = { ["30011#1"] = { [0] = { ${binding(1, '30011#1', 180, 'SKILL_30011_huosha_1', 6)} } } },
      [8] = { [30011] = { [0] = { ${binding(8, 30011, 190, 'SKILL_30011_juedou_1')} } } },
      [33] = { ["30011#1"] = { [0] = { ${binding(33, '30011#1', 200, 'SKILL_30011#1_wusheng_1')} } } },
      [1217] = { ["30011#1"] = { [0] = {
        ${binding(1217, '30011#1', 210, 'SKILL_30011#1_wusheng_1')},
        ${binding(1217, '30011#1', 211, 'SKILL_30011#1_wusheng_3')},
      } } },
      [1506] = { [87002] = { [0] = { ${binding(1506, 87002, 15061, 'SKILL_87002_xingzhen_1')} } },
        [0] = { [0] = { ${binding(1506, 0, 15062, 'SKILL_generic_xingzhen_1')} },
          [870] = { ${binding(1506, 0, 15063, 'SKILL_870_xingzhen_1', undefined, 870)} } },
      },
      [11266] = { [22002] = { [0] = { ${binding(11266, 22002, 112661, 'SKILL_22002_huishi_1')} } } },
      [11268] = { [22002] = { [0] = { ${binding(11268, 22002, 112681, 'SKILL_22002_huisi_1')} } } },
      [878] = { [57702] = { [0] = { ${binding(878, 57702, 8781, 'SKILL_gebo_57702_1')} } } },
    },
    [3] = { [87002] = { [0] = { skinId=87002, chrid=0, filename="dieskin_87002", type=3 } } },
    [4] = { [87002] = { [0] = { skinId=87002, chrid=0, filename="victskin_87002", type=4 } } },
    [10] = { [32151] = { [0] = { filename="EasterEgg_Supreme_Show_32151" } } },
  }; return data`],
]);

test('mobile official names retain primary and additional generals as well as the exact alternate form', () => {
  const { skins, generals, provisionalGenerals } = buildMobileConfigData(tables());
  assert.deepEqual(skins.get('87002'), {
    title: '剑引天霖', officialTitle: '剑引天霖*神姜维', generalId: 870, general: '神姜维', generalIds: [870, 871],
  });
  assert.deepEqual(skins.get('30011#1'), {
    title: '圣垂千古', officialTitle: '圣垂千古*关羽', generalId: 2, general: '关羽', generalIds: [2, 300], formName: '第二形态',
  });
  assert.equal(generals.get(300), '界关羽');
  assert.deepEqual([...provisionalGenerals], [669]);
  assert.equal(skins.has('30011#2'), false);
});

test('mobile motion placement uses the official skin version and form-specific values', () => {
  const input = tables();
  input.set('skin.lua', input.get('skin.lua')
    .replace('chrid=2, chrList', 'chrid=2, motionPicver=2, scale=0.66, offsetX=-98.553, offsetY=-195.985, rotation=0, minShowRange="300,450,750,800", chrList')
    .replace('chrid=0, name="第二形态"', 'chrid=0, motionPicver=1, scale=0.66, offsetX=31.227, offsetY=-243.908, rotation=28, minShowRange="400,500", name="第二形态"'));
  const { skins } = buildMobileConfigData(input);
  assert.deepEqual(skins.get('30011').motion, {
    version: 2, scale: 0.66, offsetX: -98.553, offsetY: -195.985, rotation: 0, attackMargins: [300, 450, 750, 800],
  });
  assert.deepEqual(skins.get('30011#1').motion, { version: 1, scale: 0.66, offsetX: 31.227, offsetY: -243.908, rotation: 28 });
  assert.equal(skins.get('87002').motion, undefined);
});

test('mobile official voice metadata uses exact sound paths, spell IDs and scopes', () => {
  const { voices, skinVoices } = buildMobileConfigData(tables());
  const skill = filename => voices.get('audio/skill/' + filename + '.mp3');
  assert.deepEqual(skill('SKILL_87002_xingzhen_1')[0], {
    kind: 'skill', name: '星魂', skinId: '87002', characterId: 0, spellId: 1506, soundId: 15061,
    path: 'audio/skill/SKILL_87002_xingzhen_1.mp3',
  });
  assert.equal(skill('SKILL_22002_huishi_1')[0].name, '慧识');
  assert.equal(skill('SKILL_22002_huisi_1')[0].name, '辉逝');
  assert.equal(skill('SKILL_gebo_57702_1')[0].name, '戈帛');
  assert.equal(skill('SKILL_30011_juedou_1')[0].kind, 'card');
  assert.deepEqual(skill('SKILL_30011_huosha_1')[0], {
    kind: 'card', name: '火杀', skinId: '30011#1', characterId: 0, spellId: 1, subtype: 6, soundId: 180,
    path: 'audio/skill/SKILL_30011_huosha_1.mp3',
  });
  assert.deepEqual(skill('SKILL_30011#1_wusheng_1').map(row => row.spellId), [33, 1217]);
  assert.deepEqual(skill('SKILL_30011#1_wusheng_3').map(row => row.spellId), [1217]);
  assert.equal(skill('SKILL_misc_1')[0].kind, 'unidentified');
  assert.equal(voices.get('audio/dead/dieskin_87002.mp3')[0].name, '阵亡');
  assert.equal(voices.get('audio/victory/victskin_87002.mp3')[0].name, '胜利');
  assert.equal(skill('EasterEgg_Supreme_Show_32151')[0].kind, 'easterEgg');
  assert.equal(skinVoices.has('0'), false);
  assert.deepEqual(skinVoices.get('char-870'), skill('SKILL_870_xingzhen_1'));
  assert.equal(skinVoices.has('char-0'), false);
  assert.equal(skinVoices.get('30011#1')[0], skill('SKILL_30011_huosha_1')[0]);
  assert.ok([...voices.values()].flat().every(ref => !Object.hasOwn(ref, 'text')));
});

test('the mobile Lua parser reads bounded literal data and skips trailing Lua code', () => {
  assert.deepEqual(readMobileConfigTable(String.raw`-- client header
    local data = { [1]={"名\"称", 4, true}, ["1"]='独立键', text="完整台词" }
    error("cannot be evaluated")
  `, 'sample'), new Map([[1, new Map([[1, '名"称'], [2, 4], [3, true]])], ['1', '独立键']]));
  assert.throws(() => readMobileConfigTable('local data = (function() return {} end)()', 'sample'), /格式无效/);
  assert.throws(() => readMobileConfigTable('local data = {value = fn()}', 'sample'), /格式无效/);
  assert.throws(() => readMobileConfigTable('local data = ' + '{'.repeat(40) + '}'.repeat(40), 'sample'), /格式无效/);
  assert.throws(() => readMobileConfigTable('local data = { value=' + '"x'.padEnd(270000, 'x') + '"}', 'sample'), /格式无效/);
});

test('incomplete tables fail and unsafe or inconsistent file rows cannot create cloud paths', () => {
  const incomplete = tables();
  incomplete.delete('SpellData.lua');
  assert.throws(() => buildMobileConfigData(incomplete), /SpellData/);
  const unsafe = tables();
  unsafe.set('SoundCfg.lua', unsafe.get('SoundCfg.lua').replace('SKILL_gebo_57702_1', '../../outside')
    .replace('soundId=112681', 'soundId=112692'));
  const { voices } = buildMobileConfigData(unsafe);
  assert.ok(![...voices.keys()].some(path => path.includes('outside')));
  assert.equal(voices.has('audio/skill/SKILL_22002_huisi_1.mp3'), false);
});
