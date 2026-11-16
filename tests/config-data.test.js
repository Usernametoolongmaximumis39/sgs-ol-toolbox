import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync } from 'node:zlib';
import { createConfigData, readZipEntry } from '../src/core/config-data.js';
import { createGameAdapter } from '../src/core/game.js';
import { ResourceScope } from '../src/core/resources.js';

function zip(entries, compress = false) {
  const files = [], directory = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const raw = Buffer.from(value), data = compress ? deflateRawSync(raw) : raw, filename = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(compress ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8); end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...files, ...directory, end]));
}
test('ZIP reader extracts only an exact entry and rejects malformed or oversized data', async () => {
  for (const compress of [false, true]) {
    const bytes = zip({ 'a.sgs': 'one', 'b.sgs': '二' }, compress);
    assert.equal(new TextDecoder().decode(await readZipEntry(bytes, 'b.sgs')), '二');
    await assert.rejects(readZipEntry(bytes, 'missing.sgs'), /缺少/);
  }
  await assert.rejects(readZipEntry(new Uint8Array([1, 2, 3]), 'a'), /格式/);
  const bytes = zip({ 'a.sgs': 'one' });
  const directoryOffset = new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
  new DataView(bytes.buffer).setUint32(directoryOffset + 24, 30 * 1024 * 1024, true);
  await assert.rejects(readZipEntry(bytes, 'a.sgs'), /大小/);
});
test('config service is lazy, shares one archive, keeps tables independent, and never sends credentials', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const data = { root: { bigprize: [{ month: 11 }] } }, skins = { root: { manu: { item: [] } } };
  const bytes = zip({ 'gn_zonghe.sgs': gzipSync(JSON.stringify(data)), 'cha_gs_dbs_fs_skininfo.sgs': gzipSync(JSON.stringify(skins)) });
  const requests = [];
  const service = createConfigData({ location: { origin: 'https://web.sanguosha.com' }, resourceVersion: 'test/version',
    CtrUtil: { Ctr: { Ofb_Dec: buffer => Array.from(new Uint8Array(buffer)) } }, async fetch(url, options) {
      requests.push({ url, options }); return new Response(bytes);
    } }, scope);
  assert.equal(requests.length, 0); assert.equal(service.getConfigData('gn_zonghe'), null);
  const results = await Promise.all([service.loadConfigData('gn_zonghe'), service.loadConfigData('cha_gs_dbs_fs_skininfo'), service.loadConfigData('gn_zonghe')]);
  assert.deepEqual(results, [data, skins, data]); assert.equal(requests.length, 1);
  assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.redirect, 'error');
  assert.match(requests[0].url, /test%2Fversion$/);
  await assert.rejects(service.loadConfigData('../accounts'), /尚未声明/);
  assert.deepEqual(service.getConfigData('gn_zonghe.sgs'), data);
});

test('old microclient without DecompressionStream reads compressed ZIP and gzip tables with bounds', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const goods = { root: { items: [{ ID: 100016, name: '将印' }] } };
  const achievements = { root: { achievement: [{ ID: 719, name: '百胜' }] } };
  const characters = { GameCharacters: { character: [{ id: 719, name: '测试武将' }] } };
  const archive = zip(Object.fromEntries(Object.entries({ sys_gs_dbs_fs_goodsbaseinfo: goods, gn_gs_ahievement: achievements, character: characters }).map(([name, value]) => [`${name}.sgs`, gzipSync(JSON.stringify(value))])), true);
  let calls = 0;
  const win = { DecompressionStream: undefined, location: { origin: 'https://web.sanguosha.com' }, resourceVersion: 'legacy',
    CtrUtil: { Ctr: { Ofb_Dec: value => value } }, fetch: async () => { calls++; return new Response(archive); } };
  const service = createConfigData(win, scope);
  assert.deepEqual(await Promise.all(['sys_gs_dbs_fs_goodsbaseinfo', 'gn_gs_ahievement', 'character'].map(name => service.loadConfigData(name))), [goods, achievements, characters]);
  assert.equal(calls, 1);
  class GzipOnly {
    constructor(format) { if (format === 'deflate-raw') throw new TypeError('unsupported format'); return new DecompressionStream(format); }
  }
  const partial = createConfigData({ ...win, DecompressionStream: GzipOnly }, scope);
  assert.deepEqual(await partial.loadConfigData('character'), characters);
  const bomb = zip({ 'big.sgs': Buffer.alloc(16 * 1024 * 1024 + 1) }, true);
  // A lying directory must not bypass the streaming output bound.
  const directory = new DataView(bomb.buffer).getUint32(bomb.length - 6, true);
  new DataView(bomb.buffer).setUint32(directory + 24, 1, true);
  await assert.rejects(readZipEntry(bomb, 'big.sgs', win), /超过读取上限/);
  const broken = zip({ 'character.sgs': 'not gzip' }, true);
  const retry = createConfigData({ ...win, fetch: async () => new Response(broken) }, scope);
  await assert.rejects(retry.loadConfigData('character'));
});
test('config failures remain retryable, local fixture needs no decoder, disposal stops pending results', async () => {
  const scope = new ResourceScope(); let calls = 0;
  const service = createConfigData({ location: { origin: 'https://web.sanguosha.com' }, resourceVersion: '1',
    CtrUtil: { Ctr: { Ofb_Dec: value => value } }, fetch: async () => { calls++; throw new Error('offline'); } }, scope);
  await assert.rejects(service.loadConfigData('gn_zonghe'), /offline/);
  await assert.rejects(service.loadConfigData('gn_zonghe'), /offline/); assert.equal(calls, 2);
  scope.dispose(); await assert.rejects(service.loadConfigData('gn_zonghe'), /取消/);
  const localScope = new ResourceScope();
  const local = createConfigData({ __SGS_TOOLBOX_DEMO__: { configs: { gn_zonghe: { root: {} } } } }, localScope);
  assert.deepEqual(await local.loadConfigData('gn_zonghe'), { root: {} }); localScope.dispose();
});
test('self discovery returns the stored current user rather than the viewed opponent, and clears on logout', () => {
  class UserData { static self = { ClientId: 5 }; constructor(id) { this.ClientId = id; } }
  let getterReads = 0;
  const scope = new ResourceScope();
  const malicious = {}; Object.defineProperty(malicious, 'data', { get() { getterReads++; throw new Error('not observed'); } });
  const adapter = createGameAdapter({ Laya: { stage: { _children: [malicious, { userData: new UserData(99) }] } } }, scope);
  assert.equal(adapter.getSelf().ClientId, 5); assert.equal(getterReads, 0);
  UserData.self = { ClientId: 7 }; assert.equal(adapter.getSelf().ClientId, 7);
  UserData.self = null; assert.equal(adapter.getSelf(), null); scope.dispose();
});
test('self discovery works when first loaded in a game whose flat money UI is outside the child tree', () => {
  class UserData { static self = null; constructor(id) { this.ClientId = id; } }
  UserData.self = new UserData(12);
  const scope = new ResourceScope();
  const scene = { SceneName: 'GameScene', topMenu: { moneyMenuUI: { data: UserData.self } } };
  const adapter = createGameAdapter({ __SGS_TOOLBOX_DEMO__: { scene }, Laya: { stage: { _children: [] } } }, scope);
  assert.equal(adapter.getSelf().ClientId, 12); scope.dispose();
});

test('officer salary table is available through the real core config whitelist', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const data = { root: { officer: [{ ID: 4, dayReward: '9020101,100', weekReward: '10,100' }] } };
  const bytes = zip({ 'h5_officer.sgs': gzipSync(JSON.stringify(data)) });
  const service = createConfigData({ location: { origin: 'https://web.sanguosha.com' }, resourceVersion: 'fixture',
    CtrUtil: { Ctr: { Ofb_Dec: buffer => Array.from(new Uint8Array(buffer)) } }, fetch: async () => new Response(bytes) }, scope);
  assert.equal(service.getConfigData('h5_officer'), null);
  assert.deepEqual(await service.loadConfigData('h5_officer.sgs'), data);
  assert.deepEqual(service.getConfigData('h5_officer'), data);
});

test('coupon amounts table is available through the real core config whitelist', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const data = { sgs_config: { couponsys: { GRmb: { seting: [{ AID: 1, AVV: '7000-2000' }] } } } };
  const service = createConfigData({ __SGS_TOOLBOX_DEMO__: { configs: { gn_dbs_coupon_cfg: data } } }, scope);
  assert.deepEqual(await service.loadConfigData('gn_dbs_coupon_cfg'), data);
});

test('landlord shop currency config loads through the core whitelist', async t => {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const data = { Root: { par: [{ VicBean: 1, BeanChange: 9030201 }] } };
  const bytes = zip({ 'hd_fight_lord_config.sgs': gzipSync(JSON.stringify(data)) });
  const service = createConfigData({ location: { origin: 'https://web.sanguosha.com' }, resourceVersion: 'fixture',
    CtrUtil: { Ctr: { Ofb_Dec: buffer => Array.from(new Uint8Array(buffer)) } }, fetch: async () => new Response(bytes) }, scope);
  assert.deepEqual(await service.loadConfigData('hd_fight_lord_config'), data);
});
