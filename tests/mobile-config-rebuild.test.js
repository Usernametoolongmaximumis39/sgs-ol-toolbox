import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileConfig } from '../src/plugins/skins/mobile-config.js';
import { mobileCatalogueVoices, mobileVoiceId } from '../src/plugins/skins/mobile-catalogue-voices.js';
import { mobileBootstrapFixture } from './fixtures/mobile-config-bootstrap.js';
import { makeMobileConfigRelease } from './fixtures/mobile-config-release.js';

const metadataUrl = 'https://waym.sanguosha.cn/config/';
const manifest = 'config_list.zip';
const usedArchives = [manifest, 'config1.zip', 'config2.zip', 'config5.zip', 'config6.zip'];
const encoder = new TextEncoder();

function harness(t) {
  const state = { release: makeMobileConfigRelease(), metadataOffline: false };
  const requests = [], writes = [], cache = new Map(), controller = new AbortController();
  t.after(() => controller.abort());
  let bootstraps = 0;

  async function reply(url, { signal }) {
    if (signal.aborted) throw new Error('fixture request was cancelled');
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.origin + parsed.pathname === metadataUrl) {
      if (state.metadataOffline) throw new Error('fixture metadata was unavailable');
      return encoder.encode(JSON.stringify(state.release.metadata)).buffer;
    }
    const wrapped = state.release.archives.get(url);
    if (!wrapped) throw new Error('unexpected fixture file request');
    return wrapped.buffer;
  }
  function create() {
    return createMobileConfig(globalThis, reply, {
      signal: controller.signal,
      readCache: async key => structuredClone(cache.get(key)),
      writeCache: async (key, value) => {
        writes.push(key);
        cache.set(key, structuredClone(value));
      },
      bootstrap: async () => {
        bootstraps++;
        return {
          channel: '81002', clientVersion: '4.6.1.5', keyVersion: mobileBootstrapFixture.keyVersion,
          archiveMd5: mobileBootstrapFixture.digest, secretKey: encoder.encode(mobileBootstrapFixture.keyText),
        };
      },
    });
  }
  return {
    create, state, writes, cache, requests, get bootstraps() { return bootstraps; },
    takeArchives() {
      return requests.splice(0).filter(url => url.origin === 'https://mres.sanguosha.cn')
        .map(url => url.pathname.split('/').at(-1)).sort();
    },
  };
}

test('cold official data loads only selected shards and reuses validated data for identical digests', async t => {
  const fixture = harness(t), config = fixture.create();
  const pending = config.load();
  assert.equal(config.load(), pending);
  const first = await pending;
  assert.equal(first.status, 'official');
  assert.equal(first.data.skins.get('87001').title, '神姜维');
  assert.equal(first.data.skins.get('87002').title, '剑引天霖');
  assert.equal(fixture.bootstraps, 1);
  const query = fixture.requests[0].searchParams;
  assert.equal(query.get('key_v'), mobileBootstrapFixture.keyVersion);
  assert.equal(query.get('config_list_inc'), '1');
  assert.equal(query.get('is_xxtea'), '1');
  assert.ok(query.get('c') && query.get('v'));
  assert.deepEqual(fixture.takeArchives(), usedArchives.slice().sort());
  assert.deepEqual(fixture.writes, ['config-bootstrap-v1', 'config-data-v1']);

  fixture.state.release = makeMobileConfigRelease({ date: '202611201000' });
  const same = await config.load();
  assert.equal(same.status, 'official');
  assert.equal(same.data, first.data);
  assert.deepEqual(fixture.takeArchives(), []);
  assert.equal(fixture.writes.filter(key => key === 'config-data-v1').length, 1);

  fixture.state.release = makeMobileConfigRelease({ title: '官方新标题', date: '202611201100' });
  const updated = await config.load();
  assert.equal(updated.status, 'official');
  assert.notEqual(updated.data, first.data);
  assert.equal(updated.data.skins.get('87001').title, '官方新标题');
  assert.deepEqual(fixture.takeArchives(), usedArchives.slice().sort());
  assert.equal(fixture.writes.filter(key => key === 'config-data-v1').length, 2);
  assert.equal(fixture.bootstraps, 1);
});

test('an older mobile config projection stays available offline and rebuilds with unchanged resource digests', async t => {
  const fixture = harness(t);
  const first = await fixture.create().load();
  assert.equal(first.status, 'official');
  const old = fixture.cache.get('config-data-v1');
  delete old.projectionVersion;
  fixture.takeArchives();

  fixture.state.metadataOffline = true;
  const offline = await fixture.create().load();
  assert.equal(offline.status, 'cached');
  assert.deepEqual(offline.data, old.data);
  assert.deepEqual(fixture.takeArchives(), []);

  fixture.state.metadataOffline = false;
  const refreshed = await fixture.create().load();
  assert.equal(refreshed.status, 'official');
  assert.ok(fixture.cache.get('config-data-v1').projectionVersion > 0);
  assert.deepEqual(fixture.takeArchives(), usedArchives.slice().sort());
});

test('corrupt changed shards cannot replace the validated cache and a later instance can recover', async t => {
  const fixture = harness(t), config = fixture.create();
  const baseline = await config.load();
  assert.equal(baseline.status, 'official');
  fixture.takeArchives();

  const changed = makeMobileConfigRelease({ title: '恢复后显示', date: '202611201200' });
  const [url, bytes] = [...changed.archives].find(([key]) => key.endsWith('/config2.zip'));
  const brokenBytes = bytes.slice();
  brokenBytes[brokenBytes.length - 1] ^= 1;
  fixture.state.release = { ...changed, archives: new Map([...changed.archives, [url, brokenBytes]]) };
  const broken = await config.load();
  assert.equal(broken.status, 'cached');
  assert.equal(broken.data, baseline.data);
  fixture.takeArchives();
  assert.equal(fixture.writes.filter(key => key === 'config-data-v1').length, 1);
  assert.equal(fixture.cache.get('config-data-v1').data.skins.get('87001').title, '神姜维');

  fixture.state.metadataOffline = true;
  const restarted = fixture.create();
  const offline = await restarted.load();
  assert.equal(offline.status, 'cached');
  assert.deepEqual(offline.data, baseline.data);
  assert.notEqual(offline.data, baseline.data);
  assert.deepEqual(fixture.takeArchives(), []);
  assert.equal(fixture.bootstraps, 1);

  fixture.state.metadataOffline = false;
  fixture.state.release = changed;
  const recovered = await restarted.load();
  assert.equal(recovered.status, 'official');
  assert.equal(recovered.data.skins.get('87001').title, '恢复后显示');
  assert.equal(fixture.writes.filter(key => key === 'config-data-v1').length, 2);
  assert.equal(fixture.bootstraps, 1);
});

test('descriptor validation rejects packages outside the official distribution before any archive download', async t => {
  const fixture = harness(t);
  fixture.state.release.metadata.zips[10].config[0].url = 'https://unrelated.invalid/config_list.zip';
  const result = await fixture.create().load();
  assert.deepEqual(result, { status: 'fallback', data: undefined });
  assert.deepEqual(fixture.takeArchives(), []);
  assert.deepEqual(fixture.writes, []);
});

test('a rebuilt official voice group preserves old codes and merges explicit zero subtype with the default', async t => {
  const fixture = harness(t);
  const { data, status } = await fixture.create().load();
  assert.equal(status, 'official');
  const xingzhen = 'audio/skill/SKILL_87002_xingzhen_1.mp3';
  const xinghun = 'audio/skill/SKILL_87002_xinghun_2.mp3';
  const row = { id: '87002', voices: new Map([['xingzhen', [xingzhen]], ['xinghun', [xinghun]]]), death: [] };
  assert.deepEqual(mobileCatalogueVoices(row, undefined, data, new Map([[xingzhen, {}], [xinghun, {}]])), [
    { id: mobileVoiceId('xingzhen'), kind: 'skill', name: '星魂', urls: [xinghun, xingzhen], aliases: [mobileVoiceId('xinghun')] },
  ]);
});

test('identical mobile spell lines share one source while old IDs and different same-name lines remain available', () => {
  const lines = ['权计原路径', '权计副本路径', '权计不同台词'];
  const row = { id: '17306', voices: new Map(), death: [] };
  const official = { skinVoices: new Map([[row.id, lines.map((path, index) =>
    ({ name: '权计', kind: 'skill', spellId: index + 1, path }))]]) };
  const resources = new Map(lines.map((path, index) => [path, { md5: index === 2 ? 'distinct' : 'shared' }]));
  const voices = mobileCatalogueVoices(row, undefined, official, resources);
  assert.deepEqual(voices.map(voice => voice.urls), [[lines[0]], [lines[2]]]);
  assert.deepEqual(voices[0].aliases, [0x100000000 + mobileVoiceId('skill:2:')]);
});
