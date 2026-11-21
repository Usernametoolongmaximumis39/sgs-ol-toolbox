import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { createLedgerSync } from '../src/plugins/ledger/sync.js';
import { mergeLedgerEvent, observedLedgerEvents, projectLedgerBalance, projectLedgerEvent } from '../src/plugins/ledger/sync-model.js';
import { now, balance, item, hint, instance, removed, prayer } from './fixtures/ledger-sync.js';

test('ledger sync projects confirmed observations, preserves zero and omits incidental data', () => {
  assert.deepEqual(projectLedgerBalance(balance), balance);
  assert.equal(projectLedgerBalance({ ...balance, basis: undefined }), null);
  assert.equal(projectLedgerBalance({ ...balance, count: null }), null);
  assert.equal(projectLedgerBalance({ ...balance, id: 1620301, name: '传世玉玺' }), null);
  assert.equal(projectLedgerEvent({ ...hint, kind: 'notice' }), null);
  assert.equal(projectLedgerEvent({ ...hint, items: [{ ...item, id: 100016 }] }), null);
  const projected = projectLedgerEvent({ ...hint, account: '1234', giver: 'someone', items: [item, item, { ...item, delta: -1 }] });
  assert.deepEqual(projected.items.map(row => row.delta), [-1, 2]);
  assert.equal(projected.account, undefined);
  assert.equal(projected.giver, undefined);
  const draw = projectLedgerEvent(prayer);
  assert.equal(draw.prayer.times, 50);
  assert.equal(draw.prayer.matched, undefined);
  assert.equal(draw.rewards, undefined);
});

test('ledger sync accepts monotone corrections in either order and holds ambiguous observations for review', () => {
  const original = projectLedgerEvent({ ...instance, items: [{ ...item, delta: 7 }] });
  const partial = projectLedgerEvent({ ...instance, items: [{ ...item, delta: 4 }], reconciled: true });
  const corrected = projectLedgerEvent(removed);
  assert.deepEqual(mergeLedgerEvent(original, partial), partial);
  assert.deepEqual(mergeLedgerEvent(partial, original), partial);
  assert.deepEqual(mergeLedgerEvent(mergeLedgerEvent(corrected, original), partial), corrected);
  assert.equal(mergeLedgerEvent(original, { ...original, session: 'session-two' }), null);
  const repeated = projectLedgerEvent({ ...hint, id: 'hint-two', at: now + 200 });
  const isolated = projectLedgerEvent({ ...hint, id: 'hint-later', at: now + 30000, session: 'session-two' });
  assert.deepEqual(observedLedgerEvents([projectLedgerEvent(hint), repeated, isolated, corrected]).map(row => row.review), [false, false, false]);
  const other = projectLedgerEvent({ ...hint, id: 'hint-other', at: now - 500, session: 'session-two' });
  assert.equal(observedLedgerEvents([isolated, repeated, other, projectLedgerEvent(hint)]).filter(row => row.review).length, 3);
  const fallback = { ...partial, at: now + 3000, session: 'session-two' };
  assert.ok(observedLedgerEvents([projectLedgerEvent(hint), fallback]).every(row => row.review));
});

test('ledger sync client retries batches and discards a response after switching game accounts', async t => {
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  let who = '41', recover, failed = true;
  const sent = [];
  const sync = createLedgerSync({ scope, devLedgerSync: { async exchange(account, data, signal) {
    sent.push({ account, data, signal });
    if (failed && sent.length === 2) throw new Error('disconnected');
    if (account === '42') return new Promise(resolve => { recover = resolve; });
    return { conflicts: 0, download: { version: null, offset: 0, next: null, events: null, balances: [] } };
  } } }, () => who, () => {});
  for (let i = 0; i < 201; i++) sync.queue({ ...hint, id: `historic-${i}` }, true);
  await sync.run(who, [balance], true);
  assert.equal(sync.view().status, '账本同步失败');
  assert.deepEqual(sent.map(row => row.data.events.length), [200, 1]);
  failed = false;
  await sync.run(who, [balance], true);
  assert.deepEqual(sent.map(row => row.data.events.length), [200, 1, 1]);
  assert.equal(sync.view().status, '账本已同步');
  who = '42'; sync.reset();
  const work = sync.run(who, [balance], true);
  who = '43'; sync.reset();
  assert.ok(sent.at(-1).signal.aborted);
  recover({ conflicts: 0 });
  await work;
  assert.equal(sync.view().status, '');
});

test('ledger downloads are atomic across pages and a login request runs during the existing minute window', async t => {
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const version = '2d96e191-3919-4db9-93d0-620716459d73';
  const sent = [], saved = [];
  let interrupted = true;
  const sync = createLedgerSync({ scope, devLedgerSync: { async exchange(account, data) {
    sent.push(data);
    const { offset } = data.pull;
    return { conflicts: 0, download: offset === 0
      ? { version, offset, next: 1, events: [hint], balances: [balance] }
      : { version, offset: interrupted ? 0 : offset, next: null, events: [prayer], balances: [balance] } };
  } } }, () => '41', () => {}, { put: async (account, snapshot) => saved.push({ account, snapshot }) });
  await sync.run('41', []);
  assert.equal(sync.view().status, '账本同步失败');
  assert.deepEqual(sync.events(), []);
  assert.equal(sync.balance(balance.id), undefined);
  assert.equal(saved.length, 0);
  await sync.run('41', []);
  assert.equal(sent.length, 2);
  interrupted = false;
  sync.requestLogin();
  await sync.run('41', []);
  assert.equal(sent.length, 4);
  assert.deepEqual(sync.events().map(row => row.id), [hint.id, prayer.id]);
  assert.deepEqual(sync.balance(balance.id), balance);
  assert.equal(saved[0].snapshot.events.length, 2);
});
