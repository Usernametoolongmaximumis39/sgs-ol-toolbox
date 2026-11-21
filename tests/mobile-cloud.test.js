import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { createMobileCloud, openMobileZip } from '../src/plugins/skins/mobile-cloud.js';
import { loadMobileEffectSpec } from '../src/plugins/skins/mobile-effects.js';
import { createMobileCatalogue } from '../src/plugins/skins/mobile-skins.js';

const endpoint = 'https://waym.sanguosha.cn/update/cloud.php';
const origin = 'https://mres.sanguosha.cn/update_cloud/public/';
const encoder = new TextEncoder();
const hash = bytes => createHash('md5').update(bytes).digest('hex');
const portrait = 'ui/face/skin/10403.png';
const recording = 'audio/skill/SKILL_10403_jilei_1.mp3';

function resource(path, sample) {
  const bytes = typeof sample === 'string' ? encoder.encode(sample) : sample;
  const md5 = hash(bytes);
  const file = path.replace(/[^/]+(\.[a-z0-9]+)$/, md5 + '$1');
  return { line: `["${path}"] = {file="${file}",code="${md5}",size=${bytes.length}},`, url: origin + file, bytes };
}

function source(version, resources, replacement) {
  const dictionary = `return {\nversion = "${version}",\ndic = {\n${resources.map(value => value.line).join('\n')}\n}\n}\n`;
  const archive = zipSync({ cloud: encoder.encode(replacement ?? dictionary) });
  const metadata = encoder.encode(JSON.stringify({ cloud: { version, md5: hash(archive), url: origin } }));
  return { version, archive, metadata };
}

test('mobile catalogue coalesces a cold open, reads official roles without executing Lua and downloads listed media on demand', async t => {
  const files = [resource(portrait, 'portrait'), resource('ui/icon/skin/10403.png', 'head'),
    resource('ui/bface/skin/10403_1.jpg', 'preview'), resource('ui/bface/skin/horSkin/10403_1_horizon.jpg', 'landscape'),
    resource('ui/face/skin/dynamicSkin/10403_2.zip', 'motion'), resource(recording, 'voice'),
    resource('audio/dead/dieskin_10403.mp3', 'death'), resource('ui/face/skin/10403#1.png', 'another form')];
  const sample = source('461009', files);
  const calls = [];
  const cloud = createMobileCloud(globalThis, async (url, options) => {
    calls.push({ url, ...options });
    if (url === endpoint) return sample.metadata.buffer;
    if (url === origin + 'cloud_461009.zip') return sample.archive.buffer;
    return files.find(file => file.url === url)?.bytes.buffer;
  });
  t.after(() => cloud.dispose());
  assert.equal(calls.length, 0);
  const [first, second] = await Promise.all([cloud.getIndex(), cloud.getIndex()]);
  assert.equal(first, second);
  assert.equal(first.version, sample.version);
  assert.equal(first.md5, hash(sample.archive));
  assert.equal(first.resources.size, files.length);
  assert.equal(first.skins.get('10403').portrait, portrait);
  assert.deepEqual(first.skins.get('10403').voices.get('jilei'), [recording]);
  assert.equal(first.skins.get('10403#1').portrait, 'ui/face/skin/10403#1.png');
  assert.deepEqual(first.skins.get('10403').motions, ['ui/face/skin/dynamicSkin/10403_2.zip']);
  assert.equal(calls.length, 2);
  assert.equal(await cloud.getIndex(), first);
  assert.equal(calls.length, 3);
  await assert.rejects(cloud.downloadResource(portrait, { limit: 1 }), /上限/);
  await assert.rejects(cloud.downloadResource('../unpublished'), /缺少/);
  assert.equal(calls.length, 3);
  assert.deepEqual(new Uint8Array(await cloud.downloadResource(portrait)), files[0].bytes);
  assert.equal(calls.at(-1).limit, files[0].bytes.length);
});

test('mobile catalogue rebuilds on digest and version changes and keeps checksum failures retryable', async t => {
  const oldFile = resource(portrait, 'one'), newFile = resource(portrait, 'two');
  let sample = source('461009', [oldFile]);
  let corrupt = false;
  const cloud = createMobileCloud(globalThis, async url => {
    if (url === endpoint) return sample.metadata.buffer;
    if (url === oldFile.url) return oldFile.bytes.buffer;
    if (url === newFile.url) return newFile.bytes.buffer;
    return corrupt ? encoder.encode('corrupted').buffer : sample.archive.buffer;
  });
  t.after(() => cloud.dispose());
  const previous = await cloud.getIndex();
  sample = source('461009', [newFile]);
  corrupt = true;
  await assert.rejects(cloud.getIndex(), /校验失败/);
  corrupt = false;
  const changed = await cloud.getIndex();
  assert.notEqual(changed.md5, previous.md5);
  assert.equal(changed.version, previous.version);
  assert.deepEqual(new Uint8Array(await cloud.downloadResource(portrait, { index: previous })), oldFile.bytes);
  assert.deepEqual(new Uint8Array(await cloud.downloadResource(portrait)), newFile.bytes);
  await assert.rejects(cloud.downloadResource(portrait, { index: { ...previous } }), /快照/);
  sample = source('461010', [newFile]);
  assert.equal((await cloud.getIndex()).version, '461010');
  sample = source('461011', [], 'function doSomething() end');
  await assert.rejects(cloud.getIndex(), /格式无效/);
  sample = source('461012', [{ line: resource(portrait, 'image').line.replace('ui/face/skin/', '../') }]);
  await assert.rejects(cloud.getIndex(), /路径/);
});

test('mobile catalogue finds official character originals independently of skin IDs', async t => {
  const portrait = resource('ui/face/char/668.png', 'portrait of Mou Zhuge Liang');
  const art = resource('ui/bface/char/668_1.jpg', 'full art of Mou Zhuge Liang');
  const head = resource('ui/icon/char/668.png', 'icon of Mou Zhuge Liang');
  const files = [portrait, art, head, resource('ui/face/char/669.png', 'unverified figure'),
    resource('ui/face/skin/668.png', 'unrelated skin with same bare ID')];
  const sample = source('461009', files);
  const requests = [];
  const mobile = createMobileCatalogue({
    window: globalThis,
    scope: { signal: new AbortController().signal, add: cleanup => t.after(cleanup) },
    game: { downloadMobileSkinAsset: async url => {
      requests.push(url);
      if (url === endpoint) return sample.metadata.buffer;
      if (url === origin + 'cloud_461009.zip') return sample.archive.buffer;
      return files.find(file => file.url === url)?.bytes.buffer;
    } },
  });
  const catalogue = await mobile.load();
  const entry = catalogue.findSkin('cloud-char-668');
  assert.deepEqual(catalogue.searchSkins('谋诸葛亮').all, [entry]);
  assert.deepEqual(catalogue.searchSkins('谋·诸葛亮').all, [entry]);
  assert.deepEqual(catalogue.searchSkins('原画').all, [entry]);
  assert.equal(entry.name, '经典形象');
  assert.equal(entry.art, 'ui/bface/char/668_1.jpg');
  assert.equal(entry.portrait, 'ui/face/char/668.png');
  assert.equal(entry.head, 'ui/icon/char/668.png');
  assert.equal(entry.nativePortrait, true);
  assert.equal(catalogue.findSkin('cloud-char-669'), undefined);
  assert.equal(catalogue.findSkin('cloud-668').portrait, 'ui/face/skin/668.png');
  assert.deepEqual(requests, [endpoint, origin + 'cloud_461009.zip']);
  assert.deepEqual(new Uint8Array(await entry.download(entry.art)), art.bytes);
  assert.equal(requests.at(-1), art.url);
  assert.equal(await mobile.resolveSkin(entry.id, entry.general), entry);
});

test('十常侍 variants share their official skin family and keep each resource and saved ID', async t => {
  const members = Array.from({ length: 10 }, (_, index) => `${731 + index}01`);
  const groups = ['7300101', '7300102', '7300103', '7300104'];
  const originals = [730, ...Array.from({ length: 10 }, (_, index) => 731 + index), 752,
    ...Array.from({ length: 10 }, (_, index) => 741 + index)];
  const files = [
    ...['73001', ...members, '38701', '87002'].map(id => `ui/face/skin/${id}.png`),
    ...groups.map(id => `ui/bface/skin/horSkin/${id}_1_horizon.jpg`),
    ...[...groups, ...members].map(id => `ui/face/skin/dynamicSkin/${id}_1.zip`),
    ...[387, ...originals].map(id => `ui/face/char/${id}.png`),
    'audio/skill/SKILL_73101_taoluan_1.mp3',
  ].map(path => resource(path, path));
  const sample = source('461009', files);
  const mobile = createMobileCatalogue({
    window: globalThis,
    scope: { signal: new AbortController().signal, add: cleanup => t.after(cleanup) },
    game: { downloadMobileSkinAsset: async url => url === endpoint ? sample.metadata.buffer : sample.archive.buffer },
  });
  const catalogue = await mobile.load();
  const outfit = catalogue.findSkin('cloud-73001');
  const classic = catalogue.findSkin('cloud-char-730');
  const member = await mobile.resolveSkin('cloud-73101', '张让');
  assert.deepEqual(catalogue.searchSkins('十常侍').all, [classic, outfit]);
  assert.deepEqual(catalogue.searchSkins('朝华同袍').all, [outfit]);
  assert.deepEqual(catalogue.searchSkins('赵忠').all, [outfit, classic]);
  assert.deepEqual(catalogue.searchSkins('张让').all.map(entry => entry.id),
    ['cloud-char-387', 'cloud-73001', 'cloud-38701', 'cloud-char-730']);
  assert.equal(outfit.name, '朝华同袍');
  assert.equal(outfit.isDynamic, true);
  assert.equal(outfit.mobileMotion, undefined);
  assert.equal(catalogue.skinForms(outfit), catalogue.skinForms(member));
  assert.deepEqual(catalogue.skinForms(member).map(form => form.number), ['73001', ...groups, ...members]);
  assert.deepEqual(catalogue.skinForms(classic).map(form => form.number), originals.map(id => `char-${id}`));
  assert.equal(catalogue.skinForms(outfit)[1].formButtonLabel, '张让、赵忠');
  assert.equal(catalogue.skinForms(outfit)[1].art, 'ui/bface/skin/horSkin/7300101_1_horizon.jpg');
  assert.equal(member.formButtonLabel, '张让');
  assert.equal(member.portrait, 'ui/face/skin/73101.png');
  assert.equal(member.mobileMotion, 'ui/face/skin/dynamicSkin/73101_1.zip');
  assert.equal(member.mobileForm, '');
  const [voice] = catalogue.skinVoices(member);
  assert.deepEqual(catalogue.skinVoices(outfit, 6), [voice]);
  assert.deepEqual(catalogue.findVoice(`cloud-73101:${voice.id}:张让`).urls, ['audio/skill/SKILL_73101_taoluan_1.mp3']);
  assert.deepEqual(catalogue.searchSkins('').all.slice(0, 2), [catalogue.findSkin('cloud-87002'), outfit]);
});

test('mobile legacy gallery orders the general filters while preserving the search results', async () => {
  const names = ['诸葛亮', '界・诸葛亮', '星诸葛亮', '谋诸葛亮', '势·诸葛亮', '魔诸葛亮',
    '神诸葛亮', '标诸葛亮', '谋诸葛亮', 'SP诸葛亮'];
  const rows = names.map((general, index) => ({
    id: index + 1, general, name: `皮肤 ${index + 1}`,
    inner_banner: `https://sjwx-oss.sanguosha.cn/skins/big/skin-${index + 1}.jpg`,
  }));
  const mobile = createMobileCatalogue({
    window: {
      AbortController, setTimeout, clearTimeout,
      fetch: async url => ({
        ok: true,
        json: async () => ({ code: 0, data: { lists: {
          data: new URL(url).searchParams.get('type') === '1' ? rows : [],
          last_page: 1,
        } } }),
      }),
    },
    scope: { signal: new AbortController().signal, add() {} },
    game: {},
  });
  await mobile.resolveSkin(1, '诸葛亮');
  const { all, categories } = mobile.legacy.searchSkins('诸葛亮');
  assert.deepEqual([...categories.keys()], [
    '魔诸葛亮', '势·诸葛亮', '谋诸葛亮', '星诸葛亮', 'SP诸葛亮', '界・诸葛亮', '神诸葛亮', '诸葛亮', '标诸葛亮',
  ]);
  assert.deepEqual(all.map(entry => entry.general), names);
  assert.deepEqual(categories.get('谋诸葛亮').map(entry => entry.id), [4, 9]);
});

test('mobile catalogue displays current skill names using the owning general and original cloud code', async t => {
  const rows = {
    87002: ['huitian', 'shenpei', 'tiantao', 'xingzhen'],
    3801: ['tianyi'],
    22002: ['tianyi', 'huishi', 'wuzhong'],
    5102: ['jixi'],
    '5102#1': [],
    5199: ['jixi'],
  };
  const files = Object.entries(rows).flatMap(([skin, codes]) => [
    resource(`ui/face/skin/${skin}.png`, skin),
    ...codes.map(code => resource(`audio/skill/SKILL_${skin}_${code}_1.mp3`, skin + ':' + code)),
  ]);
  const sample = source('461009', files);
  const mobile = createMobileCatalogue({
    window: globalThis,
    scope: { signal: new AbortController().signal, add: cleanup => t.after(cleanup) },
    game: { downloadMobileSkinAsset: async url => url === endpoint ? sample.metadata.buffer : sample.archive.buffer },
  });
  const catalogue = await mobile.load();
  const voices = skin => catalogue.skinVoices(catalogue.findSkin('cloud-' + skin));
  assert.deepEqual(voices(87002).map(voice => voice.name), ['回天', '神霈', '天涛', '星魂']);
  assert.deepEqual(voices(87002)[3].urls, ['audio/skill/SKILL_87002_xingzhen_1.mp3']);
  assert.equal(voices(3801)[0].name, '天义');
  assert.deepEqual(voices(22002).map(({ name, kind }) => [name, kind]),
    [['天翊', undefined], ['huishi', 'unidentified'], ['无中生有', 'card']]);
  assert.equal(voices(5102)[0].name, '急袭');
  assert.equal(voices('5102#1')[0].name, '急袭');
  assert.equal(voices(5199)[0].kind, 'unidentified');
});

test('mobile form families keep exact saved IDs, split 势周瑜 voices, and recover 势魏延 original skill clips', async t => {
  const portraits = ['91401', '91401#1', '83501', '83501#1', '83501#2', '83502', '83502#1', '83502#2',
    '81701', '81701#2', '81702', '81702#1', '81702#2', '81702#3', '81702#4', '30012', '30012#1'];
  const skill = (spell, owner, clip) => `audio/skill/SKILL_${spell}_${owner}_${clip}.mp3`;
  const files = [...portraits.map(id => `ui/face/skin/${id}.png`),
    ...portraits.slice(0, 2).flatMap(id => [`ui/bface/skin/${id}_1.jpg`, `ui/icon/skin/${id}.png`]),
    ...[1, 2, 3, 4, 5, 6].map(clip => skill(1643, '914', clip)),
    skill(1646, '914', 1), 'audio/dead/dieskin_91401#1.mp3',
    skill(1396, '83501', 1), skill(1396, '83501#1', 1), 'audio/dead/die_83501.mp3',
    'ui/face/skin/dynamicSkin/83502_1.zip', 'ui/face/skin/dynamicSkin/83502_2.zip',
    'ui/face/skin/dynamicSkin/81702_1.zip',
    'ui/face/skin/dynamicSkin/91401_1.zip',
    'ui/face/skin/dynamicSkin/91401#1_1.zip',
  ].map(path => resource(path, path));
  const sample = source('461009', files);
  const mobile = createMobileCatalogue({
    window: globalThis,
    scope: { signal: new AbortController().signal, add: cleanup => t.after(cleanup) },
    game: { downloadMobileSkinAsset: async url => url === endpoint ? sample.metadata.buffer :
      url === origin + 'cloud_461009.zip' ? sample.archive.buffer : files.find(file => file.url === url)?.bytes.buffer },
  });
  const catalogue = await mobile.load();
  const get = id => catalogue.findSkin('cloud-' + id);
  const clips = (entry, name, index) => catalogue.skinVoices(entry, index).find(voice => voice.name === name)?.urls;
  const zhouYu = get('91401');
  const forms = catalogue.skinForms(zhouYu);
  assert.deepEqual(forms.map(form => [form.number, form.formName]), [
    ['91401', '初始形态'], ['91401#1', '火形态'], ['91401#2', '水形态'],
  ]);
  assert.equal(get('91401#2'), forms[2]);
  assert.equal(forms[1].mobileMotion, 'ui/face/skin/dynamicSkin/91401#1_1.zip');
  assert.equal(forms[2].mobileMotion, 'ui/face/skin/dynamicSkin/91401_1.zip');
  assert.equal(forms[2].mobileForm, '#2');
  assert.deepEqual(forms.map(({ art, portrait, head }) => [art, portrait, head]), ['91401', '91401#1', '91401#1'].map(id => [
    `ui/bface/skin/${id}_1.jpg`, `ui/face/skin/${id}.png`, `ui/icon/skin/${id}.png`,
  ]));
  assert.deepEqual(clips(zhouYu, '炽沄', 1), [1, 2].map(clip => skill(1643, '914', clip)));
  assert.deepEqual(clips(zhouYu, '炽沄', 2), [4, 6].map(clip => skill(1643, '914', clip)));
  assert.deepEqual(clips(zhouYu, '炽沄', 3), [3, 5].map(clip => skill(1643, '914', clip)));
  assert.deepEqual(clips(forms[2], '雄姿'), [skill(1646, '914', 1)]);
  assert.deepEqual(clips(forms[2], '阵亡'), ['audio/dead/dieskin_91401#1.mp3']);
  const waterVoice = catalogue.skinVoices(forms[2]).find(voice => voice.name === '炽沄');
  assert.deepEqual(catalogue.findVoice(`cloud-91401#2:${waterVoice.id}:势周瑜`).urls, waterVoice.urls);
  assert.deepEqual(catalogue.searchSkins('水形态').all, [zhouYu]);
  const branching = [{ from: 1, to: 2 }, { from: 1, to: 3 }];
  assert.deepEqual(catalogue.skinTransitions(zhouYu), branching);
  assert.deepEqual(catalogue.skinTransitions(get('83501#1')), branching);
  assert.deepEqual(catalogue.skinTransitions(get('83502')), branching);
  assert.deepEqual(catalogue.skinTransitions(get('30012')), []);
  assert.deepEqual(catalogue.skinTransitions(get('81701')), []);

  const weiYan = get('83501');
  assert.deepEqual(catalogue.skinForms(weiYan).map(form => form.number), ['83501', '83501#1', '83501#2']);
  assert.deepEqual(clips(weiYan, '壮誓', 1), [skill(1396, '83501', 1)]);
  assert.deepEqual(clips(weiYan, '阵亡', 1), ['audio/dead/die_83501.mp3']);
  const weiYanVoice = catalogue.skinVoices(weiYan).find(voice => voice.name === '壮誓');
  assert.equal(new TextDecoder().decode(await weiYanVoice.load(weiYanVoice.urls[0], new AbortController().signal)),
    skill(1396, '83501', 1));
  const dynamicForms = catalogue.skinForms(get('83502'));
  assert.deepEqual(dynamicForms.map(({ number, mobileForm }) => [number, mobileForm]), [
    ['83502', ''], ['83502#1', '#1'], ['83502#2', '#2'],
  ]);
  assert.ok(dynamicForms.every(form => form.mobileMotion === 'ui/face/skin/dynamicSkin/83502_2.zip'));
  const taiShiCi = catalogue.skinForms(get('81702'));
  assert.deepEqual(taiShiCi.map(({ mobileForm, mobileMotion }) => [mobileForm, mobileMotion]),
    ['', '#1', '#2', '#3', '#4'].map(form => [form, 'ui/face/skin/dynamicSkin/81702_1.zip']));
  assert.ok(catalogue.skinForms(get('81701')).every(form => !form.mobileMotion));
});

test('catalogue can discover shared motion archives without a skin registry', async t => {
  const samples = [
    ['17306', 1], ['22002', 1], ['3000408', 1], ['30011', 2], ['55204', 2],
    ['58003', 2], ['58809', 1], ['78302', 2], ['80602', 1], ['85101', 1, ['#2', '#3']],
    ['999901', 3, ['#2', '#3']],
  ];
  const paths = samples.flatMap(([id, version, extra = []]) => [
    `ui/face/skin/dynamicSkin/${id}_${version}.zip`,
    ...['', '#1', ...extra].map(form => `ui/face/skin/${id}${form}.png`),
  ]);
  const sharedPath = 'ui/face/skin/dynamicSkin/999901_3.zip';
  const dedicatedPath = 'ui/face/skin/dynamicSkin/999901#3_1.zip';
  const incomplete = zipSync(Object.fromEntries([
    'XingXiang.skel', 'XingXiang.atlas', 'BeiJing.skel', 'BeiJing.atlas',
    'XingXiang#2.skel', 'XingXiang#2.atlas', 'BeiJing#2.skel',
  ].map(name => [`999901_3/${name}`, encoder.encode('never read an incomplete rig')])));
  const shared = resource(sharedPath, incomplete);
  const files = [...paths.filter(path => path !== sharedPath).map(path => resource(path, path)), shared, resource(dedicatedPath, 'motion')];
  const sample = source('461009', files);
  let archiveReads = 0;
  const mobile = createMobileCatalogue({
    window: globalThis,
    scope: { signal: new AbortController().signal, add: cleanup => t.after(cleanup) },
    game: { downloadMobileSkinAsset: async url => {
      if (url === endpoint) return sample.metadata.buffer;
      if (url === shared.url) { archiveReads++; return shared.bytes.buffer; }
      return sample.archive.buffer;
    } },
  });
  const catalogue = await mobile.load();
  for (const [id, version, extra = []] of samples) {
    const first = catalogue.findSkin('cloud-' + id);
    const archive = `ui/face/skin/dynamicSkin/${id}_${version}.zip`;
    assert.equal(first.mobileMotion, archive, id);
    for (const form of ['#1', ...extra]) {
      const entry = catalogue.findSkin('cloud-' + id + form);
      const dedicated = id === '999901' && form === '#3';
      assert.equal(entry.mobileMotion, dedicated ? dedicatedPath : archive, entry.number);
      assert.equal(entry.mobileForm, dedicated ? '' : form, entry.number);
    }
  }
  assert.equal(archiveReads, 0);
  const signal = new AbortController().signal;
  const missing = catalogue.findSkin('cloud-999901#1');
  const partial = catalogue.findSkin('cloud-999901#2');
  assert.deepEqual(await loadMobileEffectSpec(globalThis, missing, signal), { actions: [] });
  assert.deepEqual(await loadMobileEffectSpec(globalThis, partial, signal), { actions: [] });
  assert.deepEqual(await loadMobileEffectSpec(globalThis, missing, signal), { actions: [] });
  assert.equal(archiveReads, 1, 'form checks reuse the family ZIP and never decode the initial rig');
});

test('closing one requester leaves a shared metadata read available to another', async t => {
  const sample = source('461009', [resource(portrait, 'portrait')]);
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const cloud = createMobileCloud(globalThis, async url => url === endpoint ? waiting : sample.archive.buffer);
  t.after(() => cloud.dispose());
  const controller = new AbortController();
  const stopped = cloud.getIndex({ signal: controller.signal });
  const completed = cloud.getIndex();
  controller.abort();
  await assert.rejects(stopped, /取消/);
  release(sample.metadata.buffer);
  assert.equal((await completed).skins.get('10403').portrait, portrait);
  cloud.dispose();
  await assert.rejects(cloud.getIndex(), /取消/);
});

test('mobile ZIP reads stored and deflate entries with bounds and rejects wrong checksums or paths', async () => {
  class GzipOnly {
    constructor(format) {
      assert.equal(format, 'gzip');
      return new DecompressionStream(format);
    }
  }
  const win = { Blob, DecompressionStream: GzipOnly };
  const sample = encoder.encode('武将皮肤'.repeat(128));
  for (const level of [0, 6]) {
    const archive = zipSync({ '10403_2/XingXiang.skel': sample }, { level });
    const zip = openMobileZip(win, archive.buffer);
    assert.deepEqual(zip.names, ['10403_2/XingXiang.skel']);
    assert.deepEqual(await zip.read(zip.names[0]), sample);
    await assert.rejects(zip.read(zip.names[0], { limit: 16 }), /目录无效/);
    await assert.rejects(zip.read('missing'), /缺少/);
    const view = new DataView(archive.buffer);
    const directory = view.getUint32(archive.length - 6, true);
    view.setUint32(directory + 16, 1, true);
    await assert.rejects(openMobileZip(win, archive.buffer).read(zip.names[0]));
  }
  assert.throws(() => openMobileZip(win, zipSync({ '../outside': sample }).buffer), /目录无效/);
});
