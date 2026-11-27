import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceSync } from '../src/core/sync-preferences.js';
import { mergePreferenceUpload } from '../src/shared/sync-preferences.js';
import { GENERAL_POOL_LIMIT } from '../src/shared/general-pool-storage.js';
import { Settings } from '../src/core/storage.js';
import { BACKUP_READ_PATH, PREFERENCES_SYNC_PATH, SYNC_CHANGES_PATH } from '../src/shared/sync-paths.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

test('public backup merges local collections, acknowledges cloud values and uploads the union', async () => {
  const records = new Map();
  const settings = new Settings({ get length() { return records.size; }, key: i => [...records.keys()][i],
    getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) });
  const id = number => String(number).padStart(10, '0');
  const pool = key => ({ id: key, name: key, ids: [1] });
  const rename = at => ({ id: id(1), from: '旧名', to: '新名', at });
  const lamps = (name, at, ids, names) => ({ name, at, ids, names });
  const keys = { generalPools: 'general-pools:schemes:41', friends: 'social:friends:0000000041', friendLamps: 'social:lamps:0000000041' };
  const remote = {
    generalPools: [pool('remote'), { ...pool('shared'), name: '云端方案' }],
    friends: { version: 1, pins: [id(2)], friends: { [id(1)]: { name: '旧名', seenAt: 1 }, [id(2)]: { name: '云端好友', seenAt: 2 } },
      changes: [rename(1), rename(3)] },
    friendLamps: { version: 1, friends: { [id(1)]: lamps('新名', 3, [2, 3], { 2: '云端灯名', 3: '灯三' }) } },
  };
  settings.set(keys.generalPools, [pool('local'), pool('shared')]);
  settings.set(keys.friends, { version: 1, pins: [id(1), id(2)], friends: { [id(1)]: { name: '新名', seenAt: 3 } },
    changes: [rename(2), rename(3)] });
  settings.set(keys.friendLamps, { version: 1, friends: { [id(1)]: lamps('旧名', 1, [1, 2], { 1: '灯一', 2: '旧灯名' }),
    [id(3)]: lamps('本机好友', 2, [], {}) } });

  let saved, tick, uploaded;
  const cursor = { epoch: 'A'.repeat(43), seq: 0 };
  const sync = createPreferenceSync({ settings, gameAccountKey: async id => id,
    scope: { add() {}, interval(callback) { tick = callback; }, timeout() {} },
    cache: { get: () => saved, put: (_, value) => { saved = structuredClone(value); } },
    onRestored() {}, onDownloaded() {},
    sync: { status: () => ({ accountId: '41', bindingIdentity: 'device', connected: true, public: true }),
      cacheKey: () => 'vault', async exchange(_account, path, body) {
        if (path === BACKUP_READ_PATH) {
          settings.set(keys.generalPools, [...settings.get(keys.generalPools), pool('during-download')]);
          return { cursor, snapshot: { matches: [], ledger: { events: [], balances: [] }, preferences: remote } };
        }
        assert.equal(path, PREFERENCES_SYNC_PATH);
        uploaded = body.values;
        return { ok: true };
      },
    },
  });

  tick();
  await settle();
  assert.equal(sync.error, '');
  assert.deepEqual(saved.acknowledged, remote);
  const merged = Object.fromEntries(Object.entries(keys).map(([group, key]) => [group, settings.get(key)]));
  assert.deepEqual(merged.generalPools, [...remote.generalPools, pool('local'), pool('during-download')]);
  assert.deepEqual(merged.friends, { version: 1, pins: [id(2), id(1)],
    friends: { ...remote.friends.friends, [id(1)]: { name: '新名', seenAt: 3 } }, changes: [rename(3), rename(2), rename(1)] });
  assert.deepEqual(merged.friendLamps, { version: 1, friends: {
    [id(1)]: lamps('新名', 3, [1, 2, 3], { 1: '灯一', 2: '云端灯名', 3: '灯三' }),
    [id(3)]: lamps('本机好友', 2, [], {}),
  } });
  tick();
  await settle();
  for (const group of Object.keys(keys)) assert.deepEqual(uploaded[group], merged[group]);
  const final = mergePreferenceUpload(remote, uploaded, { unionCollections: true, patch: true, preservePins: true });
  for (const group of Object.keys(keys)) assert.deepEqual(final[group], merged[group]);
});

test('public preference uploads cap pools and keep the newest 200 unique rename records', () => {
  const oldPools = Array.from({ length: GENERAL_POOL_LIMIT }, (_, id) => ({ id: String(id), name: '旧方案', ids: [1] }));
  const oldFriends = { version: 1, friends: {}, pins: [],
    changes: Array.from({ length: 200 }, (_, at) => ({ id: '0000000041', from: '旧名', to: '新名', at })) };
  const values = { generalPools: [{ ...oldPools[0], name: '更新方案' }, { ...oldPools[0], id: 'new' }],
    friends: { ...oldFriends, changes: [{ ...oldFriends.changes[0], at: 200 }, oldFriends.changes.at(-1)] } };
  const merged = mergePreferenceUpload({ generalPools: oldPools, friends: oldFriends }, values, { unionCollections: true });
  assert.equal(merged.generalPools.length, GENERAL_POOL_LIMIT);
  assert.deepEqual(merged.generalPools.slice(0, 2), values.generalPools);
  assert.deepEqual(merged.friends.changes.map(row => row.at), Array.from({ length: 200 }, (_, index) => 200 - index));
});

test('complete backups run on binding and login, respect quota and upload changes on save or the minute check', async t => {
  let time = 90000, retry = false;
  t.mock.method(Date, 'now', () => time);
  const records = new Map(), requests = [], cache = new Map(), notices = [];
  const settings = new Settings({ get length() { return records.size; }, key: index => [...records.keys()][index],
    getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) });
  let tick;
  const scope = { add() {}, interval(callback) { tick = callback; }, timeout(callback) { queueMicrotask(callback); } };
  const status = { accountId: '41', bindingIdentity: 'a', connected: true };
  const preferences = { toolbox: { compactOpacity: 60 }, friendLamps: { version: 1, friends: {} } };
  const history = { matches: [{ gameId: '42' }], ledger: { balances: [], events: [{ id: 'historic' }] } };
  const managed = { status: () => status, cacheKey: () => 'account-a', async exchange(account, path, body) {
    requests.push({ account, path, body });
    if (path === BACKUP_READ_PATH) return retry ? { retryAfter: 3500000 } : { snapshot: { ...history, preferences } };
    return { ok: true };
  } };
  const sync = createPreferenceSync({ settings, sync: managed, scope, gameAccountKey: async id => id,
    cache: { get: key => cache.get(key), put: (key, value) => cache.set(key, value) },
    onRestored: groups => notices.push(groups), onDownloaded() {},
  });
  tick();
  await settle();
  assert.deepEqual(notices, [['friendLamps', 'toolbox']]);
  assert.equal(settings.get('compactOpacity'), 60);
  assert.deepEqual(await sync.history('41'), history);
  assert.equal(requests[0].path, BACKUP_READ_PATH);
  tick();
  await settle();
  const initialCount = requests.length;
  settings.namespace('social').set('onlyPasswordFreeRooms', true);
  settings.namespace('ledger').set('threshold:41:100016', 1500);
  await settle();
  assert.equal(requests.length, initialCount + 1);
  assert.equal(requests.at(-1).path, PREFERENCES_SYNC_PATH);
  assert.deepEqual(requests.at(-1).body.values, { pluginSettings: {
    'social:onlyPasswordFreeRooms': true, 'ledger:threshold:@:100016': 1500,
  } });
  records.set('sgstoolbox:fontSize', '"small"');
  time += 59999;
  tick();
  await settle();
  assert.equal(requests.length, initialCount + 1);
  time += 1;
  tick();
  await settle();
  assert.deepEqual(requests.at(-1).body.values, { toolbox: { fontSize: 'small' } });
  retry = true;
  sync.login('41');
  await settle();
  assert.equal(requests.at(-1).path, BACKUP_READ_PATH);
  const last = requests.length;
  assert.equal(await sync.restore(() => false), '');
  assert.equal(requests.length, last);
  assert.match(await sync.restore(() => true), /每小时最多下载一次/);
  assert.equal(settings.get('fontSize'), 'small');
});

test('the client saves each applied delta page, keeps unsent preferences and resumes with the stored cursor', async t => {
  let time = 100000, failSecond = true, downloads = 0;
  t.mock.method(Date, 'now', () => time);
  const records = new Map(), reads = [], updates = [], cursor = seq => ({ epoch: 'A'.repeat(43), seq });
  const settings = new Settings({
    get length() { return records.size; }, key: i => [...records.keys()][i],
    getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value),
  });
  const status = { accountId: '41', bindingIdentity: 'same', connected: true };
  let saved, tick;
  const start = () => createPreferenceSync({ settings, gameAccountKey: async id => id,
    scope: { add() {}, interval(callback) { tick = callback; }, timeout() {} },
    cache: { get: () => saved, put: (_, value) => { saved = structuredClone(value); } },
    onRestored() {}, onDownloaded() {}, onUpdated: kinds => updates.push(kinds),
    sync: { status: () => status, cacheKey: () => '41', async exchange(_account, path, body) {
      if (path === BACKUP_READ_PATH) {
        downloads++;
        return { cursor: cursor(0), snapshot: { matches: [], ledger: { events: [], balances: [], eventVersion: null },
          preferences: { toolbox: { compactOpacity: 60, fontSize: 'standard' } } } };
      }
      assert.equal(path, SYNC_CHANGES_PATH);
      reads.push(body.after.seq);
      if (body.after.seq === 0) return { cursor: cursor(2), more: true, records: [
        ['match', '401', { endedAt: 10000 }], ['preferences', 'toolbox', { compactOpacity: 100, fontSize: 'small' }],
      ] };
      if (failSecond) throw new Error('测试断线');
      return { cursor: cursor(4), more: false, records: [
        ['event', 'earlier-event', { at: 9000 }],
        ['preferences', 'generalPools', [{ id: 'received', name: '同步方案', ids: [1] }]],
      ] };
    } },
  });
  const main = start();
  records.set('sgstoolbox:social:friends:0000000041', '{"version":0}');
  tick();
  await settle();
  settings.set('compactOpacity', 80);
  main.login('41');
  await settle();
  assert.equal(main.error, '测试断线');
  assert.deepEqual(reads, [0, 2]);
  assert.deepEqual(saved.cursor, cursor(2));
  assert.equal(settings.get('compactOpacity'), 80);
  assert.equal(settings.get('fontSize'), 'small');
  assert.equal(saved.matches[0].gameId, '401');
  failSecond = false;
  const restarted = start();
  tick();
  await settle();
  assert.deepEqual(reads, [0, 2, 2]);
  assert.equal(downloads, 1);
  assert.deepEqual(saved.cursor, cursor(4));
  assert.equal(settings.get('general-pools:schemes:41')[0].name, '同步方案');
  assert.equal((await restarted.history('41')).ledger.events[0].id, 'earlier-event');
  assert.deepEqual(updates, [['matches'], ['ledger']]);
});
