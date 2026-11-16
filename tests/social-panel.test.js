import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { renderHistory } from '../src/plugins/social/index.js';

test('social history renders full names safely and clears account data and resources', t => {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope();
  t.after(() => { scope.dispose(); dom.window.close(); });
  let data = { accountId: '1234567890', pins: ['2345678901'], friends: { '2345678901': { name: '新名字' } }, changes: [{ id: '2345678901', from: '<img onerror=alert(1)>', to: '新名字'.repeat(40), at: 1 }] };
  const parent = dom.window.document.querySelector('main');
  const ctx = { scope, document: dom.window.document, window: dom.window }; ctx.ui = mountPluginUI(ctx, () => ctx);
  const stop = renderHistory(ctx, parent, { getRecord: () => data });
  assert.equal(parent.querySelectorAll('img').length, 0);
  assert.equal(parent.querySelector('[data-social-chat-status]'), null);
  assert.equal(parent.querySelector('[data-social-chat-export]'), null);
  assert.equal(parent.querySelector('[data-social-status]').textContent, '');
  assert.doesNotMatch(parent.textContent, /原生官阶服务|图片加载中|导出聊天诊断|已记录/);
  assert.equal(parent.querySelector('strong').textContent, data.changes[0].from + ' → ' + data.changes[0].to);
  assert.match(parent.querySelector('small').textContent, /2345678901/);
  stop(); stop(); assert.equal(parent.children.length, 0);
  data = { accountId: null, friends: {}, pins: [], changes: [] };
  renderHistory(ctx, parent, { getRecord: () => data });
  assert.equal(parent.querySelector('button').disabled, true);
  assert.doesNotMatch(parent.textContent, /2345678901/);
  scope.dispose(); assert.equal(parent.children.length, 0); assert.equal(scope.cleanups.length, 0);
});
