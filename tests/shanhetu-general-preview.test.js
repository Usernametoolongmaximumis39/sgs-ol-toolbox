import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { generalChangeIds, generalChangeText } from '../src/plugins/shanhetu/general-preview.js';
import { setupGeneralPreview } from './fixtures/shanhetu-general-preview.js';
import { legacyPreview } from './fixtures/shanhetu-general-preview-native.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { Settings } from '../src/core/storage.js';

class Events {
  constructor() { this._events = {}; }
  on(type, caller, method) { (this._events[type] ||= []).push({ caller, method }); }
  off(type, caller, method) { this._events[type] = this._events[type]?.filter(h => h.caller !== caller || h.method !== method); }
  event(type, data) { for (const h of [...(this._events[type] || [])]) h.method.call(h.caller, data); }
}
const pool = ids => ({ general_list: [7, 8], general_change: ids, change_index: [] });
function fixture(t, options) {
  const dom = new JSDOM('<!doctype html><body></body>'), f = setupGeneralPreview(dom.window, Events, options);
  t.after(() => { f.scope.dispose(); dom.window.close(); }); return f;
}

test('matches old sm output order, duplicates and unknowns without changing the client array', () => {
  const names = { 1: '曹操', 2: '谋刘备' }, input = pool([1, 999, 2, 1]); let message;
  const sm = Function('p', 'xx', 'xH', legacyPreview + '; return sm;')(() => {}, { generalDict: names }, (...args) => { message = args; });
  sm(input);
  assert.equal(generalChangeText(generalChangeIds(input), names).replace('可换将为：', ''), message[0].replace('小抄提示：可换将为', ''));
  assert.equal(message[2], 10000); assert.deepEqual(input.general_change, [1, 999, 2, 1]);
  for (const invalid of [null, {}, [0], [-1], [1.5], ['1'], Array(513).fill(1)]) assert.equal(generalChangeIds({ general_change: invalid }), null);
});

test('native open and update show the remaining queue for both pools; other windows do nothing', t => {
  const f = fixture(t); f.dispatcher._('OtherWindow', pool([1])); assert.equal(f.host(), null);
  for (const diff of [0, 1]) {
    f.open(pool([1, 2, 3]), diff); assert.equal(f.text(), '可换将为：孙权, 谋刘备, 曹操');
    const view = f.windows.get('RogueSelectGeneralWindow'); assert.equal(view.canChange, true); assert.equal(view.CanSwap(0), true);
    f.update(pool([1, 2])); assert.equal(f.text(), '可换将为：谋刘备, 曹操'); assert.equal(view.updates > 1, true);
    f.update(pool([])); assert.equal(f.host(), null); assert.equal(view.canChange, false);
  }
});

test('late activation recovers only the visible native window and selected difficulty pool', t => {
  const f = fixture(t, { start: false }); f.open(pool([1, 3]), 1); assert.equal(f.host(), null);
  f.start(); assert.equal(f.text(), '可换将为：孙权, 曹操');
  const host = f.host(); f.preview.refresh(); assert.equal(f.host(), host);
  f.windows.get('RogueSelectGeneralWindow').Close(); f.preview.refresh(); assert.equal(f.host(), null);
});

test('close, hide, account switch, leaving and disposal remove the notice and listeners', t => {
  const f = fixture(t), base = f.dispatcher._events.OPEN_WINDOW.length;
  for (const method of ['CloseWindow', 'HideWindow']) { f.open(pool([1])); f.dispatcher[method]('RogueSelectGeneralWindow'); assert.equal(f.host(), null); }
  f.open(pool([1])); f.account(2); assert.equal(f.host(), null); f.preview.refresh(); assert.equal(f.host(), null);
  f.open(pool([2])); assert.match(f.text(), /谋刘备/);
  f.scene('GameScene'); assert.equal(f.host(), null); f.scene('RogueLikeBigMapScene');
  f.open(pool([3])); f.scope.dispose(); assert.equal(f.host(), null); assert.equal(f.dispatcher._events.OPEN_WINDOW.length, base - 1);
  f.dispatcher._('RogueSelectGeneralWindow', pool([1])); assert.equal(f.host(), null); assert.equal(f.themeListeners, 0);
});

test('late character names update the current notice; stale load after disposal does not recreate it', async t => {
  const f = fixture(t, { cachedNames: false }); f.open(pool([1, 999])); assert.equal(f.text(), '可换将为：Unknown (999), Unknown (1)');
  await Promise.resolve(); f.update(pool([2])); f.resolveNames(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.text(), '可换将为：谋刘备'); f.scope.dispose(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.host(), null);
});

test('immediate disable cancels a name load that has not started', async t => {
  const f = fixture(t, { cachedNames: false }); let loads = 0;
  f.ctx.game.loadConfigData = async () => { loads++; return f.character; };
  f.open(pool([1])); f.scope.dispose(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 0); assert.equal(f.host(), null);
});

test('dismissal does not repeat on refresh; reopening repeats and only one notice exists', t => {
  const f = fixture(t); f.open(pool([1])); f.host().shadowRoot.querySelector('button').click();
  f.preview.refresh(); assert.equal(f.host(), null); f.open(pool([1])); assert.ok(f.host());
  f.update(pool([1, 2])); assert.equal(f.ctx.document.querySelectorAll('[data-sgs-shanhe-general-preview]').length, 1);
  f.replaceDispatcher(new Events()); assert.equal(f.host(), null);
});

test('standalone package disable, enable, reload, update, rollback and uninstall release preview ownership', async t => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test/' });
  const f = setupGeneralPreview(dom.window, Events, { start: false });
  // Exercise the real package lifecycle; no map model/config is needed here.
  f.ctx.game.getScene = () => ({ SceneName: 'HallScene' });
  const manager = new PluginManager({ journal: new SessionJournal(), settings: new Settings(dom.window.localStorage),
    store: { async list() { return []; }, async put() {} },
    context: { ...f.ctx, ui: { registerPanel: () => () => {} } } });
  t.after(() => { manager.dispose(); f.scope.dispose(); dom.window.close(); });
  const bundle = await bundlePlugin('shanhetu'), pkg = await makePluginPackage(bundle);
  await manager.init(); await manager.install(pkg);
  const show = () => { f.open(pool([1, 2])); assert.equal(f.text(), '可换将为：谋刘备, 曹操'); assert.equal(f.dispatcher._events.OPEN_WINDOW.length, 2); };
  show(); await manager.disable('shanhetu'); assert.equal(f.host(), null); assert.equal(f.dispatcher._events.OPEN_WINDOW.length, 1);
  await manager.enable('shanhetu'); show(); await manager.reload('shanhetu'); assert.equal(f.host(), null); show();
  await manager.install(await makePluginPackage(bundle, '9.9.9-local')); assert.equal(f.host(), null); show();
  await manager.rollback('shanhetu'); assert.equal(f.host(), null); show();
  await manager.uninstall('shanhetu'); assert.equal(f.host(), null); assert.equal(f.dispatcher._events.OPEN_WINDOW.length, 1);
});
