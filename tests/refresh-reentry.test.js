import test from 'node:test';
import assert from 'node:assert/strict';
import { installRefreshReentry } from '../src/core/refresh-reentry.js';

const KEY = 'sgstoolbox:refresh-reentry:v1';
function fixture({ path = '/220/h5_2/index_110074.php', type = 'reload', search = '?token=fixture-secret', pending, disabled = false } = {}) {
  const data = new Map(pending ? [[KEY, JSON.stringify(pending)]] : []);
  const callbacks = new Map(); let tick; let clicks = 0;
  const visible = { getClientRects: () => [1], getAttribute: name => name === 'gid' ? '1100' : '0', onclick() {}, click() { clicks++; } };
  const nodes = { '#goInGameBtn': visible, '.game-item[gid="1100"]': visible };
  const win = {
    location: { hostname: 'web.sanguosha.com', pathname: path, search, replace(url) { this.target = url; } },
    performance: { getEntriesByType: () => [{ type }] },
    sessionStorage: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) },
    localStorage: { getItem: () => disabled ? 'false' : null },
    document: { querySelector: s => nodes[s], addEventListener: (s, f) => callbacks.set(s, f), removeEventListener: s => callbacks.delete(s) },
    addEventListener: (s, f) => callbacks.set(s, f), removeEventListener: s => callbacks.delete(s),
    setInterval: f => { tick = f; return 1; }, clearInterval: () => { tick = null; },
    getComputedStyle: () => ({ visibility: 'visible' }), $$sgsPassApp: { makeTicket() {} },
  };
  win.self = win.top = win;
  return { win, data, callbacks, nodes, poll: () => tick?.(), clicks: () => clicks };
}
test('reload returns through official SSO without retaining entry credentials', () => {
  const { win, data } = fixture(); assert.equal(installRefreshReentry(win), true);
  assert.equal(win.location.target, 'https://web.sanguosha.com/login/index.html');
  assert.deepEqual(Object.keys(JSON.parse(data.get(KEY))).sort(), ['at', 'version']);
  assert.ok(!data.get(KEY).includes('fixture-secret'));
});
test('normal navigation, back/forward, partner channel, iframe and opt-out do not redirect', () => {
  for (const options of [{ type: 'navigate' }, { type: 'back_forward' }, { disabled: true }, { search: '?client=110119' }, { search: '?logout_url=fixture' }, { path: '/10/index.php' }]) {
    const { win } = fixture(options); assert.equal(installRefreshReentry(win), false); assert.equal(win.location.target, undefined);
  }
  const { win } = fixture(); win.top = {}; assert.equal(installRefreshReentry(win), false);
});
test('login portal consumes fresh marker before clicking normal OL entry exactly once', () => {
  const f = fixture({ path: '/login/index.html', pending: { version: 1, at: Date.now() } });
  assert.equal(installRefreshReentry(f.win), true); f.poll(); f.poll();
  assert.equal(f.clicks(), 1); assert.equal(f.data.has(KEY), false);
});
test('maintenance, other games, dialogs and user interaction prevent automatic entry', () => {
  for (const reason of ['maintenance', 'other-game', 'dialog', 'user']) {
    const f = fixture({ path: '/login/index.html', pending: { version: 1, at: Date.now() } });
    if (reason === 'maintenance') f.nodes['.game-item[gid="1100"]'] = { ...f.nodes['#goInGameBtn'], getAttribute: () => '2' };
    if (reason === 'other-game') f.nodes['#goInGameBtn'].getAttribute = () => '100';
    if (reason === 'dialog') f.nodes['#realNameAuth'] = f.nodes['#goInGameBtn'];
    installRefreshReentry(f.win); if (reason === 'user') f.callbacks.get('pointerdown')();
    f.poll(); assert.equal(f.clicks(), 0, reason);
  }
});
test('stale marker and ordinary portal visits do not trigger automatic entry', () => {
  for (const pending of [undefined, { version: 1, at: Date.now() - 61_000 }, { version: 1, at: Date.now() + 60_000 }]) {
    const f = fixture({ path: '/login/index.html', pending }); installRefreshReentry(f.win); f.poll(); assert.equal(f.clicks(), 0); assert.equal(f.data.has(KEY), false);
  }
  const { win } = fixture({ pending: { version: 1, at: Date.now() } }); assert.equal(installRefreshReentry(win), true);
});
test('unavailable session storage leaves native startup intact', () => {
  const { win } = fixture(); win.sessionStorage.setItem = () => { throw Error('blocked'); };
  assert.equal(installRefreshReentry(win), false); assert.equal(win.location.target, undefined);
});

test('official web entry variants and leftover markers still redirect on each new reload', () => {
  for (const path of ['/220/h5_2/index.php', '/220/h5_2/index_210000.php', '/220/h5_2/index_1100.php', '/220/h5_2/index_110074.php']) {
    const f = fixture({ path, pending: { version: 1, at: Date.now() } });
    assert.equal(installRefreshReentry(f.win), true, path);
    assert.equal(f.win.location.target, 'https://web.sanguosha.com/login/index.html');
    const marker = f.data.get(KEY);
    assert.equal(installRefreshReentry(f.win), true, 'duplicate startup has the same result');
    assert.equal(f.data.get(KEY), marker, 'duplicate startup must not clear the redirect marker');
  }
});
