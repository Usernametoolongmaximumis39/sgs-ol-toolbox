import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketConnection, PublicMarketClient, LOCAL_MARKET_URL, GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL } from '../src/core/market-connection.js';
import { packageDigest } from '../src/core/packages.js';

const manifest = { id: 'example', name: '示例', version: '1.0.0', apiVersion: 1, categories: [] };
const code = 'return {};';
const sha256 = await packageDigest(manifest, code);
const pkg = { format: 'sgs-toolbox-plugin-v1', manifest, code, sha256 };
const entry = { ...manifest, description: '示例', packageUrl: 'packages/example/1.0.0.json', sha256 };
const catalog = { schemaVersion: 1, core: { version: '0.6.0' }, plugins: [entry] };
const json = value => new Response(JSON.stringify(value));

test('dev only requests local even when it is unavailable, with no startup probe or remote fallback', async () => {
  const calls = []; let localUp = false;
  const connection = createMarketConnection({ get: (_, fallback) => fallback }, async url => {
    calls.push(url); if (!localUp) throw Error('offline');
    return json(url.endsWith('/catalog.json') ? catalog : pkg);
  }, undefined, { development: true });
  await connection.start(); assert.equal(calls.length, 0);
  await assert.rejects(connection.get().getCatalog(), /无法读取/);
  assert.deepEqual(calls, [LOCAL_MARKET_URL + '/catalog.json']);
  localUp = true; await connection.get().getCatalog();
  assert.deepEqual(await connection.get().getPackage(entry), pkg);
  assert(calls.every(url => url.startsWith(LOCAL_MARKET_URL + '/')));
});

test('dev replaces saved built-in remote markets with local to avoid published versions', () => {
  for (const remote of [GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL]) {
    const writes = [];
    const connection = createMarketConnection({ get: (key, fallback) => key === 'marketUrl' ? remote : fallback, set: (...args) => writes.push(args) }, () => assert.fail('no probe'), undefined, { development: true });
    assert.equal(connection.get().baseUrl, LOCAL_MARKET_URL);
    assert.deepEqual(writes, [['marketUrl', LOCAL_MARKET_URL]]);
  }
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

test('GitHub failure selects Hangzhou for the rest of the session', async () => {
  let githubUp = true; const calls = [];
  const client = new PublicMarketClient(async (url, options) => {
    calls.push(url); assert.equal(options.credentials, 'omit');
    if (url.startsWith(GITHUB_MARKET_URL) && !githubUp) throw new TypeError('unreachable');
    return json(catalog);
  });
  assert.deepEqual(await client.getCatalog(), catalog);
  assert.deepEqual(calls, [GITHUB_MARKET_URL + '/catalog.json']);
  githubUp = false; await client.getCatalog();
  assert.equal(client.baseUrl, HANGZHOU_MARKET_URL);
  githubUp = true; await client.getCatalog();
  assert.equal(client.baseUrl, HANGZHOU_MARKET_URL);
  assert.deepEqual(calls.slice(-3), [GITHUB_MARKET_URL + '/catalog.json', HANGZHOU_MARKET_URL + '/catalog.json', HANGZHOU_MARKET_URL + '/catalog.json']);
});

test('invalid catalog and stalled GitHub both fall back within the bounded timeout', async () => {
  for (const stalled of [false, true]) {
    const client = new PublicMarketClient(url => url.startsWith(GITHUB_MARKET_URL)
      ? stalled ? new Promise(() => {}) : Promise.resolve(json({ schemaVersion: 9 }))
      : Promise.resolve(json(catalog)), { timeoutMs: 15 });
    assert.deepEqual(await client.getCatalog(), catalog);
    assert.equal(client.baseUrl, HANGZHOU_MARKET_URL);
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
    assert.equal(client.baseUrl, HANGZHOU_MARKET_URL);
    assert.equal(calls.at(-1), HANGZHOU_MARKET_URL + '/' + entry.packageUrl);
  }
});

test('foreign URLs and mismatched mirror packages never bypass URL, identity or digest validation', async () => {
  let calls = 0;
  const client = new PublicMarketClient(async () => { calls++; return json({ ...pkg, sha256: 'f'.repeat(64) }); });
  await assert.rejects(client.getPackage({ ...entry, packageUrl: 'https://attacker.example/packages/example/1.0.0.json' }), /发布目录/);
  assert.equal(calls, 0);
  await assert.rejects(client.getPackage(entry), /服务器 1：[\s\S]*服务器 2：[\s\S]*服务器 3：/);
  assert.equal(calls, 3);
});

test('both offline mirrors preserve a retryable error with each failure detail', async () => {
  let unavailable = true;
  const client = new PublicMarketClient(async () => { if (unavailable) throw new TypeError('offline'); return json(catalog); });
  await assert.rejects(client.getCatalog(), /服务器 1：[\s\S]*服务器 2：[\s\S]*服务器 3：/);
  unavailable = false;
  assert.deepEqual(await client.getCatalog(), catalog);
});


test('startup probes once, aborts slow GitHub and skips it for catalog and package requests', async () => {
  const calls = []; let aborted = false;
  const client = new PublicMarketClient((url, options) => {
    calls.push(url);
    if (url.startsWith(GITHUB_MARKET_URL)) {
      options.signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    }
    return Promise.resolve(json(url.endsWith('/catalog.json') ? catalog : pkg));
  }, { probeTimeoutMs: 15 });
  const first = client.start(); await Promise.all([first, client.start(), client.getCatalog()]);
  assert.equal(aborted, true);
  assert.deepEqual(await client.getPackage(entry), pkg);
  await client.getCatalog();
  assert.equal(calls.filter(url => url.startsWith(GITHUB_MARKET_URL)).length, 1);
  assert.equal(client.baseUrl, HANGZHOU_MARKET_URL);
});

test('healthy startup retains GitHub, while a new session probes again after a failed one', async () => {
  let healthy = false; const calls = [];
  const fetchImpl = async url => { calls.push(url); if (!healthy && url.startsWith(GITHUB_MARKET_URL)) throw Error('offline'); return json(catalog); };
  const first = createMarketConnection({}, fetchImpl); await first.start(); await first.get().getCatalog();
  assert.equal(first.get().baseUrl, HANGZHOU_MARKET_URL);
  healthy = true;
  const next = createMarketConnection({}, fetchImpl); await next.start(); await next.get().getCatalog();
  assert.equal(next.get().baseUrl, GITHUB_MARKET_URL);
});

test('Hangzhou failure falls back to Hong Kong and keeps the advertised package hash', async () => {
  const calls = [];
  const client = new PublicMarketClient(async url => {
    calls.push(url);
    if (url.startsWith(GITHUB_MARKET_URL)) throw Error('offline');
    if (url.startsWith(HANGZHOU_MARKET_URL)) return url.endsWith('/catalog.json') ? json({ schemaVersion: 9 }) : json({ ...pkg, code: 'tampered' });
    return json(url.endsWith('/catalog.json') ? catalog : pkg);
  });
  await client.start(); await client.getCatalog();
  assert.deepEqual(await client.getPackage(entry), pkg);
  assert.equal(client.baseUrl, OSS_MARKET_URL);
  assert.deepEqual(calls.slice(-2), [HANGZHOU_MARKET_URL, OSS_MARKET_URL].map(url => url + '/' + entry.packageUrl));
});
