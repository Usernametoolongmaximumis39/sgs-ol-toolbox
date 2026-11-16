import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketConnection, PublicMarketClient, LOCAL_MARKET_URL, GITHUB_MARKET_URL, OSS_MARKET_URL } from '../src/core/market-connection.js';
import { packageDigest } from '../src/core/packages.js';

const manifest = { id: 'example', name: '示例', version: '1.0.0', apiVersion: 1, categories: [] };
const code = 'return {};';
const sha256 = await packageDigest(manifest, code);
const pkg = { format: 'sgs-toolbox-plugin-v1', manifest, code, sha256 };
const entry = { ...manifest, description: '示例', packageUrl: 'packages/example/1.0.0.json', sha256 };
const catalog = { schemaVersion: 1, core: { version: '0.6.0' }, plugins: [entry] };
const json = value => new Response(JSON.stringify(value));

test('dev retries local before GitHub and OSS and returns to local on refresh', async () => {
  const calls = []; let localUp = false;
  const connection = createMarketConnection({ get: (_, fallback) => fallback }, async url => {
    calls.push(url);
    if (url.startsWith(GITHUB_MARKET_URL) || (url.startsWith(LOCAL_MARKET_URL) && !localUp)) throw new Error('offline');
    return json(url.endsWith('/catalog.json') ? catalog : pkg);
  }, undefined, { development: true });
  const client = connection.get();
  assert.equal(client.baseUrl, LOCAL_MARKET_URL);
  await client.getCatalog();
  assert.deepEqual(calls, [LOCAL_MARKET_URL, GITHUB_MARKET_URL, OSS_MARKET_URL].map(url => url + '/catalog.json'));
  assert.deepEqual(await client.getPackage(entry), pkg);
  localUp = true;
  await client.getCatalog();
  assert.equal(client.baseUrl, LOCAL_MARKET_URL);
  assert.equal(connection.get(), client);
});

test('dev keeps explicit offline and custom source preferences', () => {
  for (const saved of ['', 'https://example.com/custom']) {
    const connection = createMarketConnection({ get: () => saved }, () => assert.fail('startup request'), undefined, { development: true });
    assert.equal(connection.get()?.baseUrl || '', saved);
  }
});

test('public connection ignores saved development/offline sources without overwriting them or requesting on startup', () => {
  for (const saved of ['', 'http://127.0.0.1:17321', 'https://example.com/custom']) {
    const settings = { get: () => saved, set: () => assert.fail('public build must preserve developer preferences') };
    const connection = createMarketConnection(settings, () => assert.fail('startup must stay offline'));
    assert.equal(connection.get().baseUrl, GITHUB_MARKET_URL);
    assert.throws(() => connection.set('https://example.com'), /公开版/);
    assert.equal(connection.get(), connection.get());
  }
});

test('GitHub is preferred on every catalog refresh; fallback keeps the client identity', async () => {
  let githubUp = true; const calls = [];
  const client = new PublicMarketClient(async (url, options) => {
    calls.push(url); assert.equal(options.credentials, 'omit');
    if (url.startsWith(GITHUB_MARKET_URL) && !githubUp) throw new TypeError('unreachable');
    return json(catalog);
  });
  assert.deepEqual(await client.getCatalog(), catalog);
  assert.deepEqual(calls, [GITHUB_MARKET_URL + '/catalog.json']);
  githubUp = false; await client.getCatalog();
  assert.equal(client.baseUrl, OSS_MARKET_URL);
  githubUp = true; await client.getCatalog();
  assert.equal(client.baseUrl, GITHUB_MARKET_URL);
  assert.deepEqual(calls.slice(-3), [GITHUB_MARKET_URL + '/catalog.json', OSS_MARKET_URL + '/catalog.json', GITHUB_MARKET_URL + '/catalog.json']);
});

test('invalid catalog and stalled GitHub both fall back within the bounded timeout', async () => {
  for (const stalled of [false, true]) {
    const client = new PublicMarketClient(url => url.startsWith(GITHUB_MARKET_URL)
      ? stalled ? new Promise(() => {}) : Promise.resolve(json({ schemaVersion: 9 }))
      : Promise.resolve(json(catalog)), { timeoutMs: 15 });
    assert.deepEqual(await client.getCatalog(), catalog);
    assert.equal(client.baseUrl, OSS_MARKET_URL);
  }
});

test('package transport and actual hash failure fall back to the exact advertised version', async () => {
  for (const corrupted of [false, true]) {
    const calls = [];
    const client = new PublicMarketClient(async url => {
      calls.push(url);
      if (url.endsWith('/catalog.json')) return json(catalog);
      if (url.startsWith(GITHUB_MARKET_URL)) {
        if (!corrupted) return new Response('', { status: 404 });
        return json({ ...pkg, code: 'tampered' });
      }
      return json(pkg);
    });
    await client.getCatalog();
    assert.deepEqual(await client.getPackage(entry), pkg);
    assert.equal(client.baseUrl, OSS_MARKET_URL);
    assert.equal(calls.at(-1), OSS_MARKET_URL + '/' + entry.packageUrl);
  }
});

test('foreign URLs and mismatched mirror packages never bypass URL, identity or digest validation', async () => {
  let calls = 0;
  const client = new PublicMarketClient(async () => { calls++; return json({ ...pkg, sha256: 'f'.repeat(64) }); });
  await assert.rejects(client.getPackage({ ...entry, packageUrl: 'https://attacker.example/packages/example/1.0.0.json' }), /发布目录/);
  assert.equal(calls, 0);
  await assert.rejects(client.getPackage(entry), /GitHub：[\s\S]*OSS：/);
  assert.equal(calls, 2);
});

test('both offline mirrors preserve a retryable error with each failure detail', async () => {
  let unavailable = true;
  const client = new PublicMarketClient(async () => { if (unavailable) throw new TypeError('offline'); return json(catalog); });
  await assert.rejects(client.getCatalog(), /GitHub：[\s\S]*OSS：/);
  unavailable = false;
  assert.deepEqual(await client.getCatalog(), catalog);
});
