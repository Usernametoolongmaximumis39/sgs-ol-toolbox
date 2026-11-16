import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMarketServer } from '../tools/market-server.mjs';
import { MarketClient, MarketError } from '../src/market/client.js';

const digest = 'a'.repeat(64);
const entry = { id: 'cards', name: '卡牌', version: '0.1.0', description: '测试包',
  packageUrl: '/packages/cards/0.1.0.json', sha256: digest };
const pkg = { format: 'sgs-toolbox-plugin-v1', manifest: {
  id: 'cards', name: '卡牌', version: '0.1.0', apiVersion: 1, categories: ['game'],
}, code: '(() => ({ activate() {} }))()', sha256: digest };
const catalog = { schemaVersion: 1, plugins: [entry] };

test('market release notes reject malformed values and catalog/package mismatch, keeping legacy packages valid', async () => {
  const notes = '修复重复请求。\n保留用户停用设置。';
  const packet = { ...pkg, manifest: { ...pkg.manifest, releaseNotes: notes } };
  const make = value => new MarketClient({ baseUrl: 'https://example.test', fetchImpl: async () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }) });
  assert.equal((await make(packet).getPackage({ ...entry, releaseNotes: notes })).manifest.releaseNotes, notes);
  await assert.rejects(make(packet).getPackage({ ...entry, releaseNotes: '伪造说明' }), { code: 'RELEASE_NOTES_MISMATCH' });
  assert.equal((await make(pkg).getPackage(entry)).manifest.releaseNotes, undefined);
  for (const releaseNotes of [null, '', 'a'.repeat(2001), 7, 'bad\u0000text']) {
    await assert.rejects(make({ ...catalog, plugins: [{ ...entry, releaseNotes }] }).getCatalog(), { code: 'BAD_SCHEMA' });
    await assert.rejects(make({ ...packet, manifest: { ...packet.manifest, releaseNotes } }).getPackage(entry), { code: 'BAD_SCHEMA' });
  }
});

async function fixture(t) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'sgs-market-test-'));
  await mkdir(path.join(rootDir, 'packages/cards'), { recursive: true });
  await mkdir(path.join(rootDir, 'dev'), { recursive: true });
  await writeFile(path.join(rootDir, 'catalog.json'), JSON.stringify(catalog));
  await writeFile(path.join(rootDir, 'packages/cards/0.1.0.json'), JSON.stringify(pkg));
  await writeFile(path.join(rootDir, 'dev/index.html'), '<!doctype html><title>本地测试</title>');
  await writeFile(path.join(rootDir, 'dev/app.js'), 'window.marketTest = true;');
  await writeFile(path.join(rootDir, 'dev/private.txt'), 'not served');
  await writeFile(path.join(rootDir, 'toolbox.user.js'), '// ==UserScript==\n// @name 三国杀OL工具箱\n// ==/UserScript==');
  const codesFile = path.join(rootDir, 'reward-codes.txt');
  await writeFile(codesFile, '# 测试列表\nONE\nTWO\n', 'utf8');
  const running = await createMarketServer({ rootDir, port: 0, codesFile });
  t.after(async () => { await running.close(); await rm(rootDir, { recursive: true, force: true }); });
  return { ...running, rootDir, codesFile, client: new MarketClient({ baseUrl: running.url }) };
}

test('static reward codes are UTF-8, live reread, bounded and read-only', async t => {
  const { url, codesFile } = await fixture(t);
  let response = await fetch(url + '/reward-codes.txt', { headers: { Origin: 'https://web.sanguosha.com' } });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/plain; charset=utf-8/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '# 测试列表\nONE\nTWO\n');
  await writeFile(codesFile, 'UPDATED', 'utf8');
  assert.equal(await (await fetch(url + '/reward-codes.txt')).text(), 'UPDATED');
  assert.equal((await fetch(url + '/reward-codes.txt', { method: 'POST', body: 'CHANGE' })).status, 405);
  assert.equal((await fetch(url + '/reward-codes.txt', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal(await (await fetch(url + '/reward-codes.txt', { method: 'HEAD' })).text(), '');
  await writeFile(codesFile, 'X'.repeat(64001));
  assert.equal((await fetch(url + '/reward-codes.txt')).status, 413);
  await rm(codesFile);
  assert.equal((await fetch(url + '/reward-codes.txt')).status, 404);
});

test('startup conditional GET returns no body when unchanged and new content when file changes', async t => {
  const { url, codesFile } = await fixture(t);
  const first = await fetch(url + '/reward-codes.txt', { headers: { Origin: 'https://web.sanguosha.com' } });
  const etag = first.headers.get('etag'); assert.match(etag, /^"[a-f0-9]{64}"$/); await first.text();
  assert.equal(first.headers.get('access-control-expose-headers'), 'ETag');
  const repeated = await fetch(url + '/reward-codes.txt?since=' + etag.slice(1, -1));
  assert.equal(repeated.status, 304); assert.equal(await repeated.text(), '');
  await writeFile(codesFile, 'ONE\nTWO\nNEW\n');
  const changed = await fetch(url + '/reward-codes.txt?since=' + etag.slice(1, -1));
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.get('etag'), etag); assert.match(await changed.text(), /NEW/);
});

test('share route rejects serials, unverified phrases and foreign origins, then deduplicates approved codes', async t => {
  const { url, codesFile, rootDir } = await fixture(t);
  await writeFile(codesFile, '三国杀周年快乐\nABC123XYZ\n');
  const post = (code, origin = 'https://web.sanguosha.com') => fetch(url + '/reward-codes/share', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal((await post('ABC123XYZ')).status, 400);
  assert.equal((await post('未经核验的口令')).status, 400);
  assert.equal((await post('三国杀周年快乐', 'https://example.com')).status, 403);
  const preflight = await fetch(url + '/reward-codes/share', { method: 'OPTIONS', headers: { Origin: url, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.deepEqual(await Promise.all(Array.from({ length: 3 }, async () => (await post('三国杀周年快乐')).status)), [200, 200, 200]);
  assert.equal(await readFile(path.join(rootDir, 'shared-reward-codes.txt'), 'utf8'), '三国杀周年快乐\n');
  assert.equal(await readFile(codesFile, 'utf8'), '三国杀周年快乐\nABC123XYZ\n');
});

function rawGet(url, route, headers = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: parsed.hostname, port: parsed.port, path: route, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('real loopback HTTP service serves health, catalog, package and dev assets', async (t) => {
  const { client, url } = await fixture(t);
  assert.equal((await client.health()).service, 'sgs-toolbox-market');
  assert.deepEqual(await client.getCatalog(), catalog);
  assert.deepEqual(await client.getPackage(entry), pkg);
  const page = await fetch(`${url}/dev/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /本地测试/);
  assert.equal((await fetch(`${url}/dev/app.js`)).status, 200);
  const installer = await fetch(`${url}/toolbox.user.js`);
  assert.equal(installer.status, 200);
  assert.match(installer.headers.get('content-type'), /application\/javascript/);
  assert.match(await installer.text(), /==UserScript==/);
  assert.equal((await fetch(`${url}/dev/private.txt`)).status, 404);
  assert.equal((await fetch(`${url}/missing`)).status, 404);
  const head = await fetch(`${url}/catalog.json`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('CORS admits the official game and same local origin, rejects other origins', async (t) => {
  const { url } = await fixture(t);
  for (const origin of ['https://web.sanguosha.com', url]) {
    const response = await fetch(`${url}/catalog.json`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const origin of ['https://example.com', 'null', 'http://127.0.0.1:9999']) {
    const response = await fetch(`${url}/catalog.json`, { headers: { Origin: origin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('HD card art serves only the bounded atlas page names and keeps private files restricted', async t => {
  const { url, rootDir } = await fixture(t);
  const directory = path.join(rootDir, 'card-art/dafeiyu/0.3.0');
  await mkdir(directory, { recursive: true });
  for (const file of ['card.atlas', 'cards.png', 'cards1.png', 'cards2.png', 'cards3.png', 'cards4.png', 'manifest.json', 'source.png']) {
    await writeFile(path.join(directory, file), file);
  }
  for (const file of ['card.atlas', 'cards.png', 'cards1.png', 'cards2.png', 'cards3.png']) {
    const response = await fetch(`${url}/card-art/dafeiyu/0.3.0/${file}`, { headers: { Origin: 'https://web.sanguosha.com' } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), file);
    assert.match(response.headers.get('content-type'), file.endsWith('.png') ? /image\/png/ : /application\/json/);
  }
  for (const file of ['cards4.png', 'manifest.json', 'source.png']) {
    assert.equal((await fetch(`${url}/card-art/dafeiyu/0.3.0/${file}`)).status, 404);
  }
});

test('preflight supports authorized GET and private-network request only', async (t) => {
  const { url } = await fixture(t);
  const request = (origin, method = 'GET', extra = {}) => fetch(`${url}/catalog.json`, {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method,
      'Access-Control-Request-Private-Network': 'true', ...extra },
  });
  const good = await request('https://web.sanguosha.com');
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('access-control-allow-private-network'), 'true');
  assert.equal((await request('https://example.com')).status, 403);
  assert.equal((await request('https://web.sanguosha.com', 'POST')).status, 403);
  assert.equal((await request('https://web.sanguosha.com', 'GET', {
    'Access-Control-Request-Headers': 'Authorization',
  })).status, 403);
});

test('only loopback binding, expected Host and read methods are allowed', async (t) => {
  await assert.rejects(createMarketServer({ host: '0.0.0.0', port: 0 }), /127\.0\.0\.1/);
  const { url } = await fixture(t);
  const request = await fetch(`${url}/catalog.json`, { method: 'POST', body: '{}' });
  assert.equal(request.status, 405);
  assert.equal(request.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal((await rawGet(url, '/health', { Host: 'attacker.example' })).status, 403);
});

test('raw and encoded path traversal never exposes files', async (t) => {
  const { url } = await fixture(t);
  for (const route of ['/dev/../catalog.json', '/dev/%2e%2e/catalog.json',
    '/dev/%252e%252e/catalog.json', '/dev/%2e%2e%5ccatalog.json', '/dev/%00index.html',
    '//other.example/health', '/dev/%ZZ']) {
    const response = await rawGet(url, route);
    assert.equal(response.status, 400, route);
    assert.equal(response.body.includes('测试包'), false);
  }
});

test('missing and corrupt local catalog errors retain actionable codes', async (t) => {
  const { rootDir, client } = await fixture(t);
  await writeFile(path.join(rootDir, 'catalog.json'), '<html>wrong page</html>');
  await assert.rejects(client.getCatalog(), (error) => error instanceof MarketError && error.code === 'BAD_JSON');
  await rm(path.join(rootDir, 'catalog.json'));
  await assert.rejects(client.getCatalog(), (error) => error.code === 'HTTP_ERROR' && error.status === 404);
});

test('catalog rejects duplicates, malformed items and foreign package URLs', async () => {
  const request = (value) => new MarketClient({ fetchImpl: async () => new Response(JSON.stringify(value)) });
  await assert.rejects(request({ ...catalog, plugins: [entry, entry] }).getCatalog(), { code: 'BAD_SCHEMA' });
  await assert.rejects(request({ ...catalog, plugins: [{ ...entry, sha256: 'bad' }] }).getCatalog(), { code: 'BAD_SCHEMA' });
  await assert.rejects(request({ ...catalog, plugins: [{ ...entry,
    packageUrl: 'http://example.com/plugin.json' }] }).getCatalog(), { code: 'ORIGIN_MISMATCH' });
  assert.throws(() => new MarketClient({ baseUrl: 'http://localhost:17321' }), { code: 'INVALID_URL' });
  assert.equal(new MarketClient({ baseUrl: 'https://example.com/repo/market/' }).baseUrl, 'https://example.com/repo/market');
});

test('package identity and advertised digest must match the selected catalog entry', async () => {
  const request = (value) => new MarketClient({ fetchImpl: async () => new Response(JSON.stringify(value)) });
  await assert.rejects(request({ ...pkg, manifest: { ...pkg.manifest, id: 'other' } }).getPackage(entry), { code: 'PACKAGE_ID_MISMATCH' });
  await assert.rejects(request({ ...pkg, sha256: 'b'.repeat(64) }).getPackage(entry), { code: 'CATALOG_DIGEST_MISMATCH' });
  await assert.rejects(request({ ...pkg, code: '' }).getPackage(entry), { code: 'BAD_SCHEMA' });
  await assert.rejects(request({ ...pkg, manifest: { ...pkg.manifest, apiVersion: 0 } }).getPackage(entry), { code: 'BAD_SCHEMA' });
});

test('timeouts cover stalled fetch and response body; network failures are explicit', async () => {
  const stalled = new MarketClient({ timeoutMs: 15, fetchImpl: () => new Promise(() => {}) });
  await assert.rejects(stalled.health(), { code: 'TIMEOUT' });
  const bodyStalled = new MarketClient({ timeoutMs: 15, fetchImpl: async () => ({ ok: true,
    headers: new Headers(), text: () => new Promise(() => {}) }) });
  await assert.rejects(bodyStalled.health(), { code: 'TIMEOUT' });
  const failed = new MarketClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(failed.health(), { code: 'NETWORK_ERROR' });
});

test('response size and health schema are validated', async () => {
  const oversized = new MarketClient({ maxBytes: 10, fetchImpl: async () => new Response(JSON.stringify(catalog)) });
  await assert.rejects(oversized.getCatalog(), { code: 'RESPONSE_TOO_LARGE' });
  const headerOversized = new MarketClient({ maxBytes: 10, fetchImpl: async () => new Response('{}', {
    headers: { 'Content-Length': '999' },
  }) });
  await assert.rejects(headerOversized.getCatalog(), { code: 'RESPONSE_TOO_LARGE' });
  const wrongService = new MarketClient({ fetchImpl: async () => new Response(JSON.stringify({ ok: true })) });
  await assert.rejects(wrongService.health(), { code: 'BAD_SCHEMA' });
});


test('HTTPS static subdirectory needs only catalog and package files, with no loopback fetch option', async () => {
  const baseUrl = 'https://assets.example.com/repo/market';
  const staticEntry = { ...entry, packageUrl: 'packages/cards/0.1.0.json' };
  const requests = [];
  const client = new MarketClient({ baseUrl: baseUrl + '/', fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.targetAddressSpace, undefined);
    assert.equal(options.credentials, 'omit');
    const value = url === baseUrl + '/catalog.json' ? { schemaVersion: 1, plugins: [staticEntry] }
      : url === baseUrl + '/packages/cards/0.1.0.json' ? pkg : null;
    assert.ok(value, url);
    return new Response(JSON.stringify(value));
  } });
  await client.health();
  const result = await client.getCatalog();
  assert.deepEqual(await client.getPackage(result.plugins[0]), pkg);
  assert.equal(requests.some(url => url.endsWith('/health')), false);
  for (const value of ['/packages/cards/0.1.0.json', '../packages/cards/0.1.0.json',
    'https://other.example.com/repo/market/packages/cards/0.1.0.json',
    'packages/cards/%2f0.1.0.json', 'packages/cards/0.1.0.json?redirect=1']) {
    assert.throws(() => client.resolvePackageUrl(value), { code: 'ORIGIN_MISMATCH' });
  }
  assert.throws(() => new MarketClient({ baseUrl: 'http://assets.example.com/market' }), { code: 'INVALID_URL' });
});
