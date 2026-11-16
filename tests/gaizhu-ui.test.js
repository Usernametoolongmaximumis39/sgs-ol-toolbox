import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPanel, manifest } from '../src/plugins/gaizhu/index.js';
import { ResourceScope } from '../src/core/resources.js';
import { validateManifest } from '../src/core/packages.js';

function fixture(t, state = {}) {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope(), listeners = new Set(), changes = [];
  let current = { account: '41', role: 'off', pick: 'off', wait: false, status: '已停止', error: '', generalName: '', rounds: 0, log: [], ...state };
  const controller = {
    snapshot: () => ({ ...current }),
    setOptions(options) { changes.push(options); current = { ...current, ...options }; for (const listener of listeners) listener(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const container = dom.window.document.querySelector('main');
  const coreScope = new ResourceScope();
  const ctx = { document: dom.window.document, scope }; ctx.ui = mountPluginUI({ ...ctx, scope: coreScope }, () => ctx);
  t.after(() => coreScope.dispose());
  const cleanup = renderPanel(ctx, controller, container);
  t.after(() => { scope.dispose(); dom.window.close(); });
  return { dom, scope, root: container.querySelector('[data-gaizhu]'), cleanup, changes, listeners,
    update(options) { current = { ...current, ...options }; for (const listener of listeners) listener(); },
    button(text) { return [...container.querySelectorAll('button')].find(node => node.textContent === text || node.getAttribute('aria-label') === text); },
  };
}

test('gaizhu UI: complete contract, local role choice never starts work', t => {
  validateManifest(manifest, { requireContract: true });
  const f = fixture(t);
  assert.equal(f.button('盖主小号').getAttribute('aria-pressed'), 'true');
  assert.equal(f.button('开始速刷').disabled, false);
  assert.deepEqual(f.changes, []);
  f.button('反贼大号').click();
  assert.deepEqual(f.changes, []);
  assert.equal(f.button('反贼大号').getAttribute('aria-pressed'), 'true');
  f.button('随机点将').click(); assert.deepEqual(f.changes, [{ pick: 'random' }]);
  assert.match(f.root.querySelector('.gz-caution').textContent, /消耗游戏点将卡/);
  f.button('开始速刷').click(); assert.deepEqual(f.changes.at(-1), { role: 'rebel' });
  assert.equal(f.button('盖主小号').disabled, true);
  assert.equal(f.button('按序点将').disabled, true);
  f.button('停止速刷').click(); assert.deepEqual(f.changes.at(-1), { role: 'off' });
});

test('gaizhu UI: account switch resets local role; logged-out controls are disabled', t => {
  const f = fixture(t); f.button('反贼大号').click(); f.update({ account: '42' });
  assert.equal(f.button('盖主小号').getAttribute('aria-pressed'), 'true');
  f.update({ account: '', status: '等待登录账号' });
  assert.equal(f.button('开始速刷').disabled, true);
  assert.ok([...f.root.querySelectorAll('button,input')].every(node => node.disabled));
  assert.deepEqual(f.changes, []);
});

test('gaizhu UI: switch keeps explicit state and errors/history retain full text', t => {
  const error = '完整错误详情'.repeat(300), name = '非常长的武将名称'.repeat(20), f = fixture(t, { error, generalName: name, log: ['开局', '等待手气卡结束'] });
  const input = f.root.querySelector('[role=switch]');
  assert.equal(input.classList.contains('sgs-switch'), true); assert.equal(input.checked, false);
  input.click(); assert.deepEqual(f.changes.at(-1), { wait: true });
  assert.equal(f.root.querySelector('.gz-wait-state').textContent, '已开启');
  assert.equal(f.root.querySelector('.gz-error pre').textContent, error);
  assert.equal(f.root.querySelector('.gz-meta span').textContent, `当前武将 · ${name}`);
  assert.equal(f.root.querySelector('.gz-error').hidden, false);
  f.update({ error: '', rounds: null }); assert.equal(f.root.querySelector('.gz-error').hidden, true);
  assert.match(f.root.querySelector('.gz-meta').textContent, /已完成 未知 局/);
});

test('gaizhu UI: remount cleanup is idempotent, releases listeners without stopping automation', t => {
  const f = fixture(t, { role: 'host' }), button = f.button('停止速刷'), count = f.scope.cleanups.length;
  assert.equal(f.listeners.size, 1); assert.ok(count > 1);
  f.cleanup(); f.cleanup();
  assert.equal(f.listeners.size, 0); assert.equal(f.root.isConnected, false);
  assert.equal(f.scope.cleanups.length, 0);
  button.click(); f.update({ status: '仍在运行' }); assert.deepEqual(f.changes, []);
});
