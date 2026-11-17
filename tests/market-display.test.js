import test from 'node:test';
import assert from 'node:assert/strict';
import { marketServerLabel, userErrorMessage } from '../src/core/market-display.js';
import { PublicMarketClient, GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL } from '../src/core/market-connection.js';

test('server numbers remain stable across fallback sources', () => {
  [GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL].forEach((url, i) => assert.equal(marketServerLabel(url), `服务器 ${i + 1}`));
});
test('visible failures retain server number and HTTP status but omit hosts and IP addresses', async () => {
  const client = new PublicMarketClient(async url => { throw Error(`request ${url} failed at 192.0.2.1:443 [2001:db8::1] proxy.example.com`); });
  await assert.rejects(client.getCatalog(), error => {
    for (const number of [1, 2, 3]) assert(error.message.includes(`服务器 ${number}：`));
    assert.doesNotMatch(error.message, /https?:|githubusercontent|aliyuncs|3gs|192\.0|2001:|proxy\.example/);
    return true;
  });
  assert.equal(userErrorMessage('服务器 2：请求失败（HTTP 503）。'), '服务器 2：请求失败（HTTP 503）。');
  assert.equal(userErrorMessage('failed https://tools.3gs.xyz/other/file'), 'failed 服务器 3');
  assert.equal(userErrorMessage('failed [::1] 127.0.0.1 test.example.com'), 'failed 网络地址 网络地址 网络地址');
});
