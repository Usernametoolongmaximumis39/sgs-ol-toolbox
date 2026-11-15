import { MarketClient } from '../market/client.js';
import { verifyPackage } from './packages.js';
import { DEVELOPMENT, GITHUB_MARKET_URL, OSS_MARKET_URL } from './distribution.js';
export { GITHUB_MARKET_URL, OSS_MARKET_URL } from './distribution.js';
export const LOCAL_MARKET_URL = 'http://127.0.0.1:17321';

// Keep one client identity while falling back so in-flight UI operations stay valid.
export class PublicMarketClient {
  constructor(fetchImpl, { sources = [GITHUB_MARKET_URL, OSS_MARKET_URL], ...options } = {}) {
    this.clients = sources.map(baseUrl => new MarketClient({ ...options, baseUrl, fetchImpl }));
    this.active = this.clients[0];
  }
  get baseUrl() { return this.active.baseUrl; }
  async attempt(clients, action) {
    const failures = [];
    for (const client of clients) {
      try { const result = await action(client); this.active = client; return result; }
      catch (error) { failures.push(`${client.baseUrl === GITHUB_MARKET_URL ? 'GitHub' : client.baseUrl === OSS_MARKET_URL ? 'OSS' : '本地'}：${error.message}`); }
    }
    throw new Error('插件市场暂时无法连接，请稍后重试。\n' + failures.join('\n'));
  }
  getCatalog() { return this.attempt(this.clients, client => client.getCatalog()); }
  async health() { await this.getCatalog(); return { ok: true, service: 'sgs-toolbox-market', schemaVersion: 1 }; }
  getPackage(entry) {
    // Validate before rebasing; mirrors may only serve the exact advertised package.
    const source = this.clients.find(client => {
      try { client.resolvePackageUrl(entry.packageUrl); return true; } catch { return false; }
    });
    if (!source) return Promise.reject(new Error('插件包必须来自发布目录的 packages 目录。'));
    const path = source.resolvePackageUrl(entry.packageUrl).slice(source.baseUrl.length + 1);
    const order = [this.active, ...this.clients.filter(client => client !== this.active)];
    return this.attempt(order, async client => verifyPackage(await client.getPackage({ ...entry, packageUrl: path })));
  }
}

export function createMarketConnection(settings, fetchImpl, onError = () => {}, { development = DEVELOPMENT } = {}) {
  if (!development) {
    const client = new PublicMarketClient(fetchImpl);
    return { get: () => client, set() { throw new Error('公开版自动连接插件市场。'); } };
  }
  const create = baseUrl => baseUrl === '' ? null : baseUrl.replace(/\/+$/, '') === LOCAL_MARKET_URL
    ? new PublicMarketClient(fetchImpl, { sources: [LOCAL_MARKET_URL, GITHUB_MARKET_URL, OSS_MARKET_URL] })
    : new MarketClient({ baseUrl, fetchImpl });
  let client;
  try { client = create(settings.get('marketUrl', LOCAL_MARKET_URL)); }
  catch (error) { client = create(LOCAL_MARKET_URL); settings.set('marketUrl', client.baseUrl); onError('保存的市场地址无效，已恢复本机默认地址。'); }
  return { get: () => client, set(value) { const next = create(String(value).trim()); const url = next?.baseUrl || ''; settings.set('marketUrl', url); client = next; return url; } };
}
