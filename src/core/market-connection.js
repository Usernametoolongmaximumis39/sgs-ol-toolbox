import { marketServerLabel, userErrorMessage } from './market-display.js';
import { MarketClient } from '../market/client.js';
import { verifyPackage } from './packages.js';
import { DEVELOPMENT, GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL, UPDATE_MIRROR } from './distribution.js';
export { GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL } from './distribution.js';
export const LOCAL_MARKET_URL = 'http://127.0.0.1:17321';

// Keep one client identity while falling back so in-flight UI operations stay valid.
export class PublicMarketClient {
  constructor(fetchImpl, { sources = [GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL], mirror = '', session = {}, probeTimeoutMs = 2500, ...options } = {}) {
    if (mirror) sources = [mirror, ...sources];
    this.clients = sources.map(baseUrl => new MarketClient({ ...options, baseUrl, fetchImpl }));
    this.active = this.clients[0];
    this.session = session;
    this.mirror = mirror;
    this.probeTimeoutMs = probeTimeoutMs;
    this.fetchImpl = fetchImpl;
    this.options = options;
  }
  get baseUrl() { return this.active.baseUrl; }
  start() {
    return this.session.probe ||= (async () => {
      for (const client of this.clients.filter(client => [this.mirror, GITHUB_MARKET_URL].includes(client.baseUrl))) {
        try {
          await new MarketClient({ ...this.options, baseUrl: client.baseUrl, fetchImpl: this.fetchImpl,
            timeoutMs: Math.min(this.probeTimeoutMs, this.options.timeoutMs || this.probeTimeoutMs) }).getCatalog();
          return;
        } catch { this.markUnavailable(client); }
      }
    })();
  }
  markUnavailable(client) {
    if (client.baseUrl === GITHUB_MARKET_URL) this.session.githubPoor = true;
    if (client.baseUrl === this.mirror) this.session.mirrorPoor = true;
  }
  eligible() {
    return this.clients.filter(client => !(this.session.githubPoor && client.baseUrl === GITHUB_MARKET_URL)
      && !(this.session.mirrorPoor && client.baseUrl === this.mirror));
  }
  async attempt(clients, action) {
    const failures = [];
    for (const client of clients) {
      try { const result = await action(client); this.active = client; return result; }
      catch (error) {
        this.markUnavailable(client);
        failures.push(`${marketServerLabel(client.baseUrl)}：${userErrorMessage(error)}`);
      }
    }
    throw new Error('插件市场暂时无法连接，请稍后重试。\n' + failures.join('\n'));
  }
  async getCatalog() { await this.session.probe; return this.attempt(this.eligible(), client => client.getCatalog()); }
  async health() { await this.getCatalog(); return { ok: true, service: 'sgs-toolbox-market', schemaVersion: 1 }; }
  async getPackage(entry) {
    await this.session.probe;
    // Validate before rebasing; mirrors may only serve the exact advertised package.
    const source = this.clients.find(client => {
      try { client.resolvePackageUrl(entry.packageUrl); return true; } catch { return false; }
    });
    if (!source) return Promise.reject(new Error('插件包必须来自发布目录的 packages 目录。'));
    const path = source.resolvePackageUrl(entry.packageUrl).slice(source.baseUrl.length + 1);
    const order = this.eligible();
    return this.attempt(order, async client => verifyPackage(await client.getPackage({ ...entry, packageUrl: path })));
  }
}

export function createMarketConnection(settings, fetchImpl, onError = () => {}, { development = DEVELOPMENT } = {}) {
  const session = {};
  if (!development) {
    const client = new PublicMarketClient(fetchImpl, { session, mirror: UPDATE_MIRROR && UPDATE_MIRROR + '/plugins' });
    return { get: () => client, start: () => client.start(), set() { throw new Error('公开版自动连接插件市场。'); } };
  }
  const create = baseUrl => baseUrl === '' ? null : new MarketClient({ baseUrl, fetchImpl });
  let client;
  try {
    let saved = settings.get('marketUrl', LOCAL_MARKET_URL);
    if ([GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL].includes(String(saved).replace(/\/+$/, '')) && settings.get('marketCustomUrl', '') !== saved) {
      saved = LOCAL_MARKET_URL; settings.set('marketUrl', saved);
    }
    client = create(saved);
  }
  catch (error) { client = create(LOCAL_MARKET_URL); settings.set('marketUrl', client.baseUrl); onError('保存的市场地址无效，已恢复本机默认地址。'); }
  return { get: () => client, start: () => Promise.resolve(), set(value) { const next = create(String(value).trim()); const url = next?.baseUrl || ''; settings.set('marketUrl', url); settings.set('marketCustomUrl', url); client = next; return url; } };
}
