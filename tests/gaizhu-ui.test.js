import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPanel, manifest } from '../src/plugins/gaizhu/index.js';
import { ResourceScope } from '../src/core/resources.js';
import { validateManifest } from '../src/core/packages.js';

function fixture(t, state = {}) {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope(), listeners = new Set(), changes = [];
  let current = { account: '41', role: 'off', pick: 'off', wait: false, autoMode: 'identity', stopMode: 'manual',
    stopHours: 1, status: '已停止', error: '', generalName: '', rounds: 0, log: [], ...state };
  const controller = {
    snapshot: () => ({ ...current }),
    setOptions(options) { changes.push(options); current = { ...current, ...options }; for (const listener of listeners) listener(); },
    confirm() { changes.push('confirm'); },
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


test('gaizhu UI: old accounts have no cancel-wuxie control in any auto mode', t => {
  const f = fixture(t, { cancelWuxie: true });
  f.button('自动挂机').click();
  for (const name of ['身份', '国战', '单骑']) {
    f.button(name).click();
    assert.equal(f.root.querySelector('[aria-label="取消无懈"]'), null);
  }
});

test('gaizhu UI: creating a room provides a separate confirmation with an occupied seat', t => {
  const f = fixture(t, { inLobby: true });
  assert.equal(f.button('创建盖主房').disabled, false);
  assert.ok(f.button('确认并开始速刷').hidden);
  f.button('创建盖主房').click();
  assert.deepEqual(f.changes, [{ role: 'host', create: true }]);
  f.update({ inLobby: false, roomNumber: 4829, roomPassword: '0149', awaitingConfirmation: true, canConfirm: false });
  const roomNumber = f.root.querySelector('.gz-room-line b');
  assert.equal(roomNumber.textContent, '4829');
  f.update({ roomNumber: '407400149' });
  assert.equal(roomNumber.textContent, '00149');
  assert.match(f.root.querySelector('[data-room-password]').textContent, /0149/);
  assert.match(f.root.querySelector('.gz-invite').textContent, /手动邀请另一个账号/);
  assert.equal(f.root.querySelector('.gz-status').hidden, true);
  assert.equal(f.root.querySelector('.gz-companion[role=status]').hidden, false);
  assert.equal(f.button('确认并开始速刷').disabled, true);
  f.button('确认并开始速刷').click();
  assert.equal(f.changes.length, 1);
  f.update({ canConfirm: true, companionName: '同伴' });
  assert.match(f.root.querySelector('.gz-invite').textContent, /同伴 已入席/);
  f.button('确认并开始速刷').click();
  f.button('取消速刷').click();
  assert.deepEqual(f.changes, [{ role: 'host', create: true }, 'confirm', { role: 'off' }]);
});

test('gaizhu UI: auto mode and stop choices are exclusive and fractional hours can start', t => {
  const f = fixture(t);
  f.button('自动挂机').click();
  assert.equal(f.button('身份').getAttribute('aria-pressed'), 'true');
  assert.equal(f.button('手动停止').getAttribute('aria-pressed'), 'true');
  f.button('国战').click();
  assert.deepEqual(f.changes, [{ autoMode: 'nation' }]);
  assert.ok(f.button('按序点将').closest('[hidden]'));
  f.button('酒馆三项领齐').click();
  assert.equal(f.button('定时').getAttribute('aria-pressed'), 'false');
  f.button('定时').click();
  const input = f.root.querySelector('input[type="number"]');
  const event = type => new f.dom.window.Event(type, { bubbles: true });
  input.value = '-1'; input.dispatchEvent(event('input'));
  assert.equal(f.button('开始挂机').disabled, true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.value = '0.25'; input.dispatchEvent(event('input'));
  input.dispatchEvent(event('change'));
  assert.equal(f.button('开始挂机').disabled, false);
  f.button('开始挂机').click();
  assert.deepEqual(f.changes, [
    { autoMode: 'nation' }, { stopMode: 'tavern' }, { stopMode: 'timed' }, { stopHours: 0.25 }, { role: 'auto' },
  ]);
  f.update({ stopStatus: '本局结算后停止' });
  assert.equal(f.root.querySelector('.gz-stop-status').textContent, '本局结算后停止');
  assert.equal(f.button('单骑').disabled, true);
  f.button('停止挂机').click();
  assert.deepEqual(f.changes.at(-1), { role: 'off' });
});
