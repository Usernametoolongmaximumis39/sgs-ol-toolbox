import http from 'node:http';
import { readFile, realpath, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCodes, shareableCode } from '../src/plugins/daily-rewards/codes.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.ico', 'image/x-icon'],
]);

function within(root, value) {
  const relative = path.relative(root, value);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sendJson(response, status, value, head = false) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  response.end(head ? undefined : body);
}

function decodeRoute(rawUrl) {
  if (!rawUrl?.startsWith('/') || rawUrl.startsWith('//')) return null;
  let rawPath = rawUrl.split('?')[0];
  try { rawPath = decodeURIComponent(rawPath); } catch { return null; }
  if (rawPath.includes('\\') || rawPath.includes('\0') || rawPath.includes('%')
    || rawPath.split('/').some((part) => part === '.' || part === '..')) return null;
  return rawPath;
}

/** Loopback market with an optional, same-origin administration handler. */
export async function createMarketServer({ rootDir = path.resolve('release/market'), port = 17321,
  host = '127.0.0.1', codesFile = path.resolve(import.meta.dirname, '../data/reward-codes.txt'),
  sharedCodesFile = path.join(path.dirname(codesFile), 'shared-reward-codes.txt'), rewardBackend = null,
  adminHandler = null } = {}) {
  if (host !== '127.0.0.1') throw new Error('本地插件市场只能监听 127.0.0.1。');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口必须为 0–65535 的整数。');
  const root = path.resolve(rootDir);
  let baseUrl;
  let shareQueue = Promise.resolve();
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Vary', 'Origin');
    const head = request.method === 'HEAD';
    try {
      if (request.headers.host !== new URL(baseUrl).host) {
        sendJson(response, 403, { error: 'invalid_host' }, head); return;
      }
      const origin = request.headers.origin;
      const route = decodeRoute(request.url);
      if (route === null) { sendJson(response, 400, { error: 'invalid_path' }, head); return; }
      if (adminHandler && (route === '/admin' || route.startsWith('/admin/') || route.startsWith('/api/admin/'))) {
        const fetchSite = request.headers['sec-fetch-site'];
        if ((origin !== undefined && origin !== baseUrl) || (fetchSite && !['none', 'same-origin'].includes(fetchSite))) {
          sendJson(response, 403, { error: 'admin_origin_not_allowed' }, head); return;
        }
        await adminHandler(request, response, route, baseUrl); return;
      }
      const allowedOrigin = origin === 'https://web.sanguosha.com' || origin === baseUrl;
      if (origin && !allowedOrigin) {
        sendJson(response, 403, { error: 'origin_not_allowed' }, head); return;
      }
      if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', origin);
      const sharing = route === '/reward-codes/share';
      if (request.method === 'OPTIONS') {
        if (!allowedOrigin || !(sharing ? ['POST'] : ['GET', 'HEAD']).includes(request.headers['access-control-request-method'])) {
          sendJson(response, 403, { error: 'preflight_not_allowed' }); return;
        }
        const requestedHeaders = String(request.headers['access-control-request-headers'] || '')
          .toLowerCase().split(',').map((item) => item.trim()).filter(Boolean);
        if (requestedHeaders.some((item) => !['content-type'].includes(item))) {
          sendJson(response, 403, { error: 'headers_not_allowed' }); return;
        }
        response.setHeader('Access-Control-Allow-Methods', sharing ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS');
        if (requestedHeaders.length) response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (request.headers['access-control-request-private-network'] === 'true') {
          response.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        response.writeHead(204); response.end(); return;
      }
      if (sharing && request.method === 'POST') {
        if (!allowedOrigin || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
          sendJson(response, 403, { error: 'share_origin_or_type' }); return;
        }
        const chunks = []; let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 1024) { sendJson(response, 413, { error: 'share_too_large' }); return; }
          chunks.push(chunk);
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { sendJson(response, 400, { error: 'invalid_json' }); return; }
        if (rewardBackend) {
          if (typeof data?.code !== 'string' || !/^[\p{Script=Han}A-Za-z0-9！!_-]{3,40}$/u.test(data.code) || Buffer.byteLength(data.code) > 64 ||
            !/^[a-f0-9]{64}$/.test(data.account || '') || data.confirmed !== true) {
            sendJson(response, 400, { error: 'invalid_confirmation' }); return;
          }
          try { sendJson(response, 200, await rewardBackend.share(data)); }
          catch { sendJson(response, 502, { error: 'remote_unavailable' }); }
          return;
        }
        if (!shareableCode(data?.code)) { sendJson(response, 400, { error: 'not_universal_code' }); return; }
        // Text shape alone cannot establish reuse rights. Only the operator's
        // curated universal-code catalog can authorize publication.
        const current = await readFile(codesFile);
        if (current.length > 64000 || !parseCodes(current.toString('utf8')).codes.includes(data.code)) {
          sendJson(response, 400, { error: 'unverified_code' }); return;
        }
        const write = shareQueue.catch(() => {}).then(async () => {
          const existing = await readFile(sharedCodesFile, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
          if (parseCodes(existing).codes.includes(data.code)) return;
          if (Buffer.byteLength(existing) + Buffer.byteLength(data.code) + 1 > 16000) throw new Error('share_limit');
          await appendFile(sharedCodesFile, data.code + '\n', 'utf8');
        });
        shareQueue = write;
        await write; sendJson(response, 200, { ok: true }); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD, OPTIONS');
        sendJson(response, 405, { error: 'method_not_allowed' }, head); return;
      }
      if (route === '/health') {
        sendJson(response, 200, { ok: true, service: 'sgs-toolbox-market', schemaVersion: 1 }, head); return;
      }
      if (route === '/reward-codes.txt') {
        try {
          const details = rewardBackend ? null : await stat(codesFile);
          if (details && !details.isFile()) { sendJson(response, 404, { error: 'codes_file_not_found' }, head); return; }
          if (details?.size > 64000) { sendJson(response, 413, { error: 'codes_file_too_large' }, head); return; }
          const body = rewardBackend ? Buffer.from(await rewardBackend.list(), 'utf8') : await readFile(codesFile);
          if (body.length > 64000) { sendJson(response, 413, { error: 'codes_file_too_large' }, head); return; }
          const revision = createHash('sha256').update(body).digest('hex');
          response.setHeader('ETag', `"${revision}"`);
          response.setHeader('Access-Control-Expose-Headers', rewardBackend ? 'ETag, X-Redeem-Protocol' : 'ETag');
          if (rewardBackend) response.setHeader('X-Redeem-Protocol', 'two-confirmations-v1');
          if (new URL(request.url, baseUrl).searchParams.get('since') === revision) {
            response.writeHead(304); response.end(); return;
          }
          response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
          response.end(head ? undefined : body);
        } catch (error) {
          if (['ENOENT', 'ENOTDIR'].includes(error.code)) sendJson(response, 404, { error: 'codes_file_not_found' }, head);
          else throw error;
        }
        return;
      }
      if (route === '/' || route === '/dev') {
        response.writeHead(302, { Location: '/dev/' }); response.end(); return;
      }
      let relative;
      let type = 'application/json; charset=utf-8';
      if (route === '/catalog.json') relative = 'catalog.json';
      else if (route === '/toolbox.svg') {
        relative = 'toolbox.svg';
        type = 'image/svg+xml';
      }
      else if (route === '/toolbox.user.js') {
        relative = 'toolbox.user.js';
        type = 'application/javascript; charset=utf-8';
      }
      else if (/^\/packages\/[a-z][a-z0-9._-]{0,95}\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\.json$/.test(route)) {
        relative = route.slice(1);
      } else if (/^\/card-art\/dafeiyu\/\d+\.\d+\.\d+\/(?:card\.atlas|cards(?:[1-3])?\.png)$/.test(route)) {
        relative = route.slice(1);
        type = route.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8';
      } else if (route.startsWith('/dev/')) {
        relative = route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1);
        type = MIME.get(path.extname(relative).toLowerCase());
        if (!type) { sendJson(response, 404, { error: 'not_found' }, head); return; }
      } else { sendJson(response, 404, { error: 'not_found' }, head); return; }
      const filePath = path.resolve(root, relative);
      if (!within(root, filePath)) { sendJson(response, 403, { error: 'invalid_path' }, head); return; }
      let resolvedRoot, resolvedFile, details;
      try {
        [resolvedRoot, resolvedFile] = await Promise.all([realpath(root), realpath(filePath)]);
        details = await stat(resolvedFile);
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) {
          sendJson(response, 404, { error: 'not_found' }, head); return;
        }
        throw error;
      }
      if (!within(resolvedRoot, resolvedFile)) { sendJson(response, 403, { error: 'invalid_path' }, head); return; }
      if (!details.isFile()) { sendJson(response, 404, { error: 'not_found' }, head); return; }
      if (details.size > MAX_BYTES) { sendJson(response, 413, { error: 'file_too_large' }, head); return; }
      const body = await readFile(resolvedFile);
      if (body.length > MAX_BYTES) { sendJson(response, 413, { error: 'file_too_large' }, head); return; }
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
      response.end(head ? undefined : body);
    } catch {
      if (!response.headersSent) sendJson(response, 500, { error: 'internal_error' }, head);
      else response.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  baseUrl = `http://${host}:${server.address().port}`;
  return {
    server,
    url: baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }),
  };
}

export function marketOptions(args) {
  const options = { rootDir: path.resolve('release/market'), port: 17321 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) options.rootDir = path.resolve(args[++i]);
    else if (args[i] === '--port' && args[i + 1]) options.port = Number(args[++i]);
    else if (args[i] === '--codes-file' && args[i + 1]) options.codesFile = path.resolve(args[++i]);
    else throw new Error('用法：node tools/market-server.mjs [--root release/market] [--port 17321] [--codes-file data/reward-codes.txt]');
  }
  return options;
}

export async function startMarket(options) {
  const running = await createMarketServer(options);
  console.log(`小抄本地插件市场：${running.url}/dev/`);
  console.log(`目录：${running.url}/catalog.json`);
  console.log(`兑换码：${running.url}/reward-codes.txt`);
  if (options.adminHandler) console.log(`本地服务管理：${running.url}/admin/`);
  const stop = () => running.close().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await startMarket(marketOptions(process.argv.slice(2)));
}
