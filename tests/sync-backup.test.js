import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceSync } from '../src/core/sync-preferences.js';
import { Settings } from '../src/core/storage.js';
import { BACKUP_READ_PATH, PREFERENCES_SYNC_PATH, SYNC_CHANGES_PATH } from '../src/shared/sync-paths.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

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
