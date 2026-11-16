import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRedeemBackend } from '../tools/redeem-client.mjs';
import { createMarketServer } from '../tools/market-server.mjs';
import { createCodeSources } from '../src/plugins/daily-rewards/code-sources.js';

test('bridge persists installation identity and forwards only explicit hashed-account successes', async t => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'redeem-test-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [];
  const transport = async value => { calls.push(value); return value.op === 'register' ? { ok: true, token: 'a'.repeat(64) } : value.op === 'list' ? { ok: true, codes: ['已确认口令'] } : { ok: true, accepted: false }; };
  const backend = await createRedeemBackend({ stateDir, transport });
  assert.equal(await backend.list(), '已确认口令');
  await assert.rejects(backend.share({ code: 'AB123456' }), /confirmed_account/);
  await backend.share({ code: 'AB123456', account: 'b'.repeat(64), confirmed: true, coreEdition: 'dev', sourceIp: '47.79.85.253' });
  assert.equal(calls.at(-1).coreEdition, 'dev');
  assert.equal(calls.at(-1).sourceIp, undefined);
  const reloaded = await createRedeemBackend({ stateDir, transport });
  await reloaded.share({ code: 'AB123456', account: 'b'.repeat(64), confirmed: true });
  assert.equal(calls.filter(x => x.op === 'register').length, 1);
  assert.equal(calls.at(-1).client, calls.at(-2).client);
});

test('community report derives dev edition from the running core', async () => {
  const requests = [];
  const win = { fetch: async (url, options) => {
    requests.push({ url, options });
    return options.method === 'GET'
      ? new Response('', { headers: { 'content-type': 'text/plain', 'x-redeem-protocol': 'two-confirmations-v1' } })
      : new Response('{}');
  } };
  win.location = { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:17321' };
  const core = { distribution: 'dev' };
  const source = createCodeSources(win, { core });
  await source.readServer(source.defaultUrl);
  await source.shareCode(source.defaultUrl, '成功口令', { account: 'account' });
  assert.equal(JSON.parse(requests.at(-1).options.body).coreEdition, 'dev');
  core.distribution = 'full';
  await source.shareCode(source.defaultUrl, '成功口令', { account: 'account' });
  assert.equal(JSON.parse(requests.at(-1).options.body).coreEdition, 'full');
});

test('browser negotiates community backend; sends hashed account without private clipboard text', async t => {
  const reports = [];
  const market = await createMarketServer({ port: 0, rewardBackend: { list: async () => '', share: async data => { reports.push(data); return { ok: true, accepted: false }; } } });
  t.after(() => market.close());
  const sources = createCodeSources({ fetch: (url, opts) => fetch(url, { ...opts, headers: { ...opts.headers, Origin: 'https://web.sanguosha.com' } }) });
  assert.equal(await sources.readServer(market.url), '');
  assert.equal(sources.communityConfirmations, true);
  await sources.shareCode(market.url, 'AB123456', { account: 'private-test-account' });
  assert.equal(reports.length, 1);
  assert.deepEqual(Object.keys(reports[0]).sort(), ['account', 'code', 'confirmed']);
  assert.match(reports[0].account, /^[a-f0-9]{64}$/);
  assert.equal(reports[0].confirmed, true);
  assert.equal(await sources.shareCode(market.url, 'AB123456'), false);
});
