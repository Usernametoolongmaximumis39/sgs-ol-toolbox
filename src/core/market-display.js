import { GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL, UPDATE_MIRROR } from './distribution.js';

// Stable user-facing identifiers; never derive these from fallback order.
const servers = [GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL];
export function marketServerLabel(baseUrl) {
  if (UPDATE_MIRROR && baseUrl === UPDATE_MIRROR + '/plugins') return '更新镜像';
  const index = servers.indexOf(String(baseUrl).replace(/\/+$/, ''));
  return index < 0 ? '自定义服务器' : `服务器 ${index + 1}`;
}

export function userErrorMessage(error) {
  let message = String(error?.message ?? error ?? '操作失败，请重试。');
  message = message.replace(/(?:https?|wss?):\/\/[^\s<>"'，。；）)]+/gi, value => {
    try {
      const index = servers.findIndex(url => new URL(url).hostname === new URL(value).hostname);
      return index < 0 ? '网络地址' : `服务器 ${index + 1}`;
    } catch { return '网络地址'; }
  });
  for (const [index, url] of servers.entries()) {
    const host = new URL(url).hostname;
    message = message.split(url).join(`服务器 ${index + 1}`).split(host).join(`服务器 ${index + 1}`);
  }
  return message
    .replace(/(?:https?|wss?):\/\/[^\s<>"'，。；）)]+/gi, '网络地址')
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*(?::\d+)?\b/gi, '网络地址')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '网络地址')
    .replace(/\[?[a-f0-9]*:(?:[a-f0-9]*:)+[a-f0-9:.]+\]?(?::\d+)?/gi, '网络地址');
}
