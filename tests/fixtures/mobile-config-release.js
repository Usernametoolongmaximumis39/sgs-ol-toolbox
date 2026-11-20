import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { mobileBootstrapFixture } from './mobile-config-bootstrap.js';

const hash = bytes => createHash('md5').update(bytes).digest('hex');
const testKey = strToU8(mobileBootstrapFixture.keyText);
const delta = 0x9e3779b9;

// Synthesize the publisher's config wrapper with a test-only key. This fixture
// does not use a production bundle, network, or encrypted key material.
function configArchive(files) {
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
    { mtime: new Date(2026, 10, 20) });
  const paddedLength = Math.ceil(zip.length / 4) * 4;
  const body = new Uint8Array(paddedLength + 4);
  body.set(zip);
  const bodyView = new DataView(body.buffer);
  bodyView.setUint32(paddedLength, zip.length, true);
  const words = Array.from({ length: body.byteLength / 4 }, (_, index) => bodyView.getUint32(index * 4, true));
  const keyView = new DataView(testKey.buffer, testKey.byteOffset, testKey.byteLength);
  const key = [0, 4, 8, 12].map(offset => keyView.getUint32(offset, true));
  let sum = 0, previous = words[words.length - 1];
  for (let round = 0; round < 6 + Math.floor(52 / words.length); round++) {
    sum = (sum + delta) >>> 0;
    for (let index = 0; index < words.length; index++) {
      const next = words[(index + 1) % words.length];
      const shifts = ((previous >>> 5) ^ (next << 2)) + ((next >>> 3) ^ (previous << 4));
      const keyed = (sum ^ next) + (key[(index & 3) ^ ((sum >>> 2) & 3)] ^ previous);
      previous = (words[index] + (shifts ^ keyed)) >>> 0;
      words[index] = previous;
    }
  }
  words.forEach((word, index) => bodyView.setUint32(index * 4, word, true));
  const wrapped = new Uint8Array(32 + body.byteLength);
  wrapped.set(strToU8(hash(zip)));
  wrapped.set(body, 32);
  return wrapped;
}

const lua = members => `local data = {${members}}; return data`;

function sound(spellId, skin, clips) {
  const skinKey = typeof skin === 'string' ? JSON.stringify(skin) : skin;
  const rows = clips.map(([id, filename, subtype]) =>
    `[${id}]={id=${spellId}, skinId=${skinKey}, chrid=0, soundId=${id}, filename="${filename}", type=2,
      ${subtype === undefined ? '' : `subType=${subtype},`} text="样例台词"}`);
  return `[${spellId}]={[${skinKey}]={[0]={${rows.join(',')}}}}`;
}

const types = [
  [8, '决斗', 2], [33, '武圣', 8], [878, '戈帛', 8],
  [1506, '星魂', 8], [1507, '天涛', 8], [1508, '神霈', 8], [1509, '回天', 8],
];

export function makeMobileConfigRelease({ title = '神姜维', date = '202611200900', generals = [] } = {}) {
  const voiceData = [
    sound(8, 30011, [[801, 'SKILL_30011_juedou_1']]),
    sound(33, '30011#1', [[3301, 'SKILL_30011#1_wusheng_1']]),
    sound(878, 57702, [[8781, 'SKILL_gebo_57702_1']]),
    sound(1506, 87002, [[15061, 'SKILL_87002_xingzhen_1'], [15062, 'SKILL_87002_xinghun_2', 0]]),
    sound(1507, 87002, [[15071, 'SKILL_87002_tiantao_1']]),
    sound(1508, 87002, [[15081, 'SKILL_87002_shenpei_1']]),
    sound(1509, 87002, [[15091, 'SKILL_87002_huitian_1']]),
  ].join(',');
  const characters = [
    '{id=870,name="神姜维"}', '{id=2,name="关羽"}', '{id=300,name="界关羽"}', '{id=577,name="张温"}',
    ...generals.map(([id, name]) => `{id=${id},name=${JSON.stringify(name)}}`),
  ];
  const shards = {
    'config1.zip': {
      'Cards.lua': lua('{id=1,Name="决斗",SpellId=8,SubType=0}'),
      'key_card.lua': lua('type={[1]={spellId=8,keycardName="决斗"}}'),
    },
    'config2.zip': {
      'skin.lua': lua(`
        [87001]={skinid=87001,chrid=870,name=${JSON.stringify(title)}},
        [87002]={skinid=87002,chrid=870,name="剑引天霖*神姜维"},
        [30011]={skinid=30011,chrid=2,chrList={2,300},name="圣垂千古*关羽"},
        ["30011#1"]={skinid="30011#1",chrid=0,name="第二形态"},
        [57702]={skinid=57702,chrid=577,name="炜晔曜世*张温"}`),
      'chrCfg.lua': lua(`items={${characters.join(',')}}`),
    },
    'config5.zip': {
      'SpellData.lua': lua(types.map(([id, name, attribute]) => `{id=${id},Name="${name}",Attribute=${attribute}}`).join(',')),
    },
    'config6.zip': {
      'SoundCfg.lua': lua(`[2]={${voiceData}}, [3]={[87002]={[0]={skinId=87002,chrid=0,type=3,filename="dieskin_87002"}}},
        [4]={[30011]={[0]={skinId=30011,chrid=0,type=4,filename="victskin_30011"}}}`),
    },
    'config7.zip': { 'unused.lua': lua('unused=true') },
  };
  const config_hash = Object.fromEntries(Object.entries(shards).flatMap(([name, files]) =>
    Object.keys(files).map(file => [file, [name]])));
  const files = { 'config_list.zip': { config_list: JSON.stringify({ config_hash }) }, ...shards };
  const descriptors = [], archives = new Map();
  for (const [name, members] of Object.entries(files)) {
    const url = `https://mres.sanguosha.cn//config/clients_4.6.1_formal_${date}_fixture/${name}`;
    const archive = configArchive(members), md5 = hash(archive);
    archives.set(url, archive);
    descriptors.push({ name, url, md5, filemd5: md5 });
  }
  return { metadata: { zips: { 10: { config: descriptors } } }, archives };
}
