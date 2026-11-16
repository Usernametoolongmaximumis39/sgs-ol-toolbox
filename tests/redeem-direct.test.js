import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeSources, DEFAULT_CODE_SERVER } from '../src/plugins/daily-rewards/code-sources.js';

test('installed browser plugin registers once and reports hashed successes directly over HTTPS', async () => {
  const saved = new Map(), requests = [];
  const win = {
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url.endsWith('/register')) return Response.json({ ok: true, token: 'b'.repeat(64) });
      return Response.json({ ok: true, accepted: true });
    },
  };
  const source = createCodeSources(win, { core: { distribution: 'dev' } });
  assert.equal(source.defaultUrl, DEFAULT_CODE_SERVER);
  assert.equal(requests.length, 0, 'activation alone never registers or uploads');
  assert.equal(await source.shareCode(source.defaultUrl, 'AB123456'), false);
  await source.shareCode(source.defaultUrl, 'AB123456', { account: 'private-account' });
  await createCodeSources(win).shareCode(source.defaultUrl, '第二个成功口令', { account: 'other-account' });
  assert.equal(requests.filter(x => x.url.endsWith('/register')).length, 1);
  const reports = requests.filter(x => x.url.endsWith('/share'));
  assert.equal(reports.length, 2);
  const first = JSON.parse(reports[0].body);
  assert.match(first.account, /^[a-f0-9]{64}$/);
  assert.match(first.client, /^[a-f0-9]{64}$/);
  assert.equal(first.confirmed, true);
  assert.equal(first.coreEdition, 'dev');
  assert.equal(JSON.parse(reports[1].body).client, first.client);
  assert.ok(!JSON.stringify(requests).includes('private-account'));
  assert.ok(requests.every(x => x.url.startsWith('https://redeem.3gs.xyz/') && x.credentials === 'omit'));
  const control = new AbortController(); control.abort();
  assert.equal(await source.shareCode(source.defaultUrl, '已取消口令', { account: 'a', signal: control.signal }), false);
  assert.equal(requests.length, 3);
});

test('cancelling during first registration never submits the success report', async () => {
  const control = new AbortController(), requests = [];
  const source = createCodeSources({
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async url => {
      requests.push(url);
      control.abort();
      return Response.json({ ok: true, token: 'c'.repeat(64) });
    },
  });
  assert.equal(await source.shareCode(source.defaultUrl, '取消期间的口令', { account: 'account', signal: control.signal }), false);
  assert.deepEqual(requests, [DEFAULT_CODE_SERVER + '/register']);
});
