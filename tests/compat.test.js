import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCompatibility } from '../src/compat/index.js';
import { OFFICIAL_ROOTS } from '../src/compat/profiles.js';

function fixture(t, html = '', options = {}) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: 'https://web.sanguosha.com/' });
  const controller = createCompatibility({ window: dom.window, ...options });
  controller.setEnabled(true);
  t.after(() => { controller.stop(); dom.window.close(); });
  return { controller, window: dom.window, document: dom.window.document };
}

const flushed = window => new Promise(resolve => window.setTimeout(resolve, 0));

test('all verified official HUD roots are hidden and restored with original priority', t => {
  const { controller, document } = fixture(t);
  for (const selector of OFFICIAL_ROOTS) {
    const [id, className] = selector.slice(1).split('.');
    const el = document.createElement('aside');
    el.id = id; el.className = className;
    el.style.setProperty('display', 'flex', 'important');
    document.body.append(el);
  }
  controller.start();
  assert.equal(controller.getStatus().hiddenCount, OFFICIAL_ROOTS.length);
  controller.stop();
  for (const el of document.querySelectorAll('aside')) {
    assert.equal(el.style.display, 'flex');
    assert.equal(el.style.getPropertyPriority('display'), 'important');
  }
});

test('id alone, account-field id, generic iframe id and native game nodes are not roots', t => {
  const { controller, document } = fixture(t, '<div id="qVRsCBvCr"></div><div id="GMHCcZ6JV"></div><div id="createIframe"></div><div id="bgDiv"><canvas></canvas></div>');
  controller.start();
  assert.equal(controller.getStatus().hiddenCount, 0);
  assert.equal(controller.hideElement(document.querySelector('#bgDiv')), false);
  assert.equal(controller.hideElement(document.querySelector('canvas')), false);
  assert.equal(controller.hideElement(document.body), false);
});

test('toolbox descendants and ancestors are protected even with a legacy id', t => {
  const { controller, document } = fixture(t, '<div id="xiaochao-app"><div data-sgs-toolbox><div id="xc95Panel"></div></div></div>');
  controller.start();
  assert.equal(controller.getStatus().hiddenCount, 0);
  assert.equal(controller.hideElement(document.querySelector('#xc95Panel')), false);
  assert.equal(controller.hideElement(document.querySelector('#xiaochao-app')), false);
});

test('late loading, remount and upstream display rewrites are observed and reversible', async t => {
  const { controller, document, window } = fixture(t);
  controller.start();
  const el = document.createElement('div');
  el.id = 'xiaochao-app'; el.style.display = 'grid';
  document.body.append(el);
  await flushed(window);
  assert.equal(el.style.display, 'none');
  el.style.display = 'flex';
  await flushed(window);
  assert.equal(el.style.display, 'none');
  controller.setEnabled(false);
  assert.equal(el.style.display, 'flex');
  controller.setEnabled(true);
  el.remove();
  const replacement = document.createElement('div'); replacement.id = 'xiaochao-app';
  document.body.append(replacement);
  await flushed(window);
  assert.equal(replacement.style.display, 'none');
  assert.equal(controller.getStatus().hiddenCount, 1);
  controller.stop();
  assert.equal(replacement.style.display, '');
  replacement.style.display = 'block';
  await flushed(window);
  assert.equal(replacement.style.display, 'block');
});

test('hide policy never calls upstream teardown; explicit policy sends EXIT once per callback', t => {
  const { controller, window } = fixture(t);
  const received = [];
  const one = value => received.push(value);
  const two = value => received.push(value + '2');
  window.SGSMODULE = [one, null];
  window.VIiR0YfvE4s = [two];
  controller.start();
  assert.deepEqual(received, []);
  controller.setTakeoverPolicy('exit-known');
  controller.scan();
  assert.deepEqual(received, ['EXIT', 'EXIT2']);
  assert.equal(controller.getStatus().exitCalls.length, 2);
  assert.equal(controller.getStatus().backgroundMayContinue, true);
  assert.equal(controller.getStatus().restartRequired, true);
  assert.equal(window.SGSMODULE[0], one);
  window.SGSMODULE.push(value => received.push(value + '3'));
  controller.scan();
  assert.deepEqual(received, ['EXIT', 'EXIT2', 'EXIT3']);
});

test('one failing official cleanup does not prevent other handlers and is not retried', t => {
  const { controller, window } = fixture(t, '', { takeover: 'exit-known' });
  let failed = 0; let good = 0;
  window.VIiR0YfvE4s = [() => { failed++; throw new Error('failure'); }, () => { good++; }];
  controller.start(); controller.scan();
  assert.equal(failed, 1); assert.equal(good, 1);
  assert.equal(controller.getStatus().exitCalls[0].failed, 1);
  assert.match(controller.getStatus().exitCalls[0].error, /failure/);
});

test('95chong verified lifecycle is disposed with its receiver; arbitrary dispose globals are untouched', t => {
  const { controller, window } = fixture(t, '<div id="xiaochao-app"></div>', { takeover: 'exit-known' });
  let calls = 0;
  const lifecycle = { disposed: false, register() {}, listen() {}, dispose() { assert.equal(this, lifecycle); calls++; this.disposed = true; } };
  window.__XIAOCHAO_ENGINEERING__ = { lifecycle };
  window.__XIAOCHAO_STARTUP__ = { entry: 'preboot-v2' };
  window.dispose = () => assert.fail('unrelated global must not be called');
  controller.start(); controller.scan();
  assert.equal(calls, 1);
  assert.equal(controller.getStatus().exitCalls[0].source, 'fork95');
  assert.equal(controller.getStatus().hiddenUi, true);
});

test('unknown fork needs fixed overlay, branding, version and multiple feature buttons', t => {
  const buttons = '<button>卡牌</button><button>配置</button><button>工具</button><button>百胜战功</button>';
  const { controller, document } = fixture(t, `<aside id="unknown" style="position:fixed;z-index:9999">小抄 v9.9.9${buttons}</aside><aside id="chat" style="position:fixed;z-index:9999">小抄很好用${buttons}</aside><section id="normal">小抄 v9.9.9${buttons}</section>`);
  controller.start();
  assert.equal(document.querySelector('#unknown').style.display, 'none');
  assert.equal(document.querySelector('#chat').style.display, '');
  assert.equal(document.querySelector('#normal').style.display, '');
  assert.equal(controller.getStatus().hiddenCount, 1);
});

test('manual hide is reversible and an explicit restore is not immediately undone', t => {
  const { controller, document } = fixture(t, '<aside id="custom" style="display:inline-block;color:red"></aside><div id="xiaochao-app"></div>');
  controller.start();
  const custom = document.querySelector('#custom');
  assert.equal(controller.hideElement(custom), true);
  assert.equal(custom.style.display, 'none');
  assert.equal(controller.restoreElement(custom), true);
  assert.equal(custom.style.display, 'inline-block');
  const old = document.querySelector('#xiaochao-app');
  controller.restoreElement(old); controller.scan();
  assert.equal(old.style.display, '');
  assert.equal(custom.style.color, 'red');
});

test('stop restores only display it owns and start is idempotent', t => {
  let reports = 0;
  const { controller, document } = fixture(t, '<div id="xiaochao-app" style="display:grid"></div>', { onStatus() { reports++; } });
  reports = 0;
  controller.start(); controller.start(); controller.scan();
  assert.equal(reports, 1);
  const el = document.querySelector('#xiaochao-app');
  el.style.display = 'flex'; // Third party changed it before observer delivery.
  controller.stop();
  assert.equal(el.style.display, 'flex');
  assert.equal(controller.getStatus().running, false);
});

test('passive detection never hides or exits with saved exit policy', t => {
 const { controller, window, document } = fixture(t, '<div id="xiaochao-app" style="display:grid"></div>', { takeover: 'exit-known' });
 controller.setEnabled(false); window.SGSMODULE = [() => assert.fail('must not exit')]; controller.start(); controller.scan();
 assert.equal(document.querySelector('#xiaochao-app').style.display, 'grid'); assert.ok(controller.getStatus().sources.length); assert.equal(controller.getStatus().exitCalled, false);
});

test('disabling takeover stops background detection and retains startup, manual and policy scans', async t => {
  const { controller, window, document } = fixture(t, '<div id="xiaochao-app" style="display:grid"></div>');
  let scans = 0;
  const query = document.querySelectorAll.bind(document);
  document.querySelectorAll = selector => {
    if (selector === 'div,aside,section') scans++;
    return query(selector);
  };
  const intervals = new Set();
  window.setInterval = callback => { intervals.add(callback); return callback; };
  window.clearInterval = callback => { intervals.delete(callback); };
  const Observer = window.MutationObserver;
  const observers = new Set();
  window.MutationObserver = class extends Observer {
    observe(...args) { observers.add(this); return super.observe(...args); }
    disconnect() { observers.delete(this); return super.disconnect(); }
  };

  controller.setEnabled(false);
  assert.deepEqual(controller.start().sources.map(source => source.id), ['fork95']);
  assert.equal(scans, 1);
  assert.equal(intervals.size, 0);
  assert.equal(observers.size, 0);
  const latePanel = document.createElement('div');
  latePanel.id = 'xc95Panel';
  document.body.append(latePanel);
  await flushed(window);
  assert.equal(scans, 1);
  assert.deepEqual(controller.getStatus().sources.map(source => source.id), ['fork95']);
  assert.deepEqual(controller.scan().sources.map(source => source.id), ['fork95', 'extension']);
  assert.equal(scans, 2);
  assert.equal(latePanel.style.display, '');

  let exits = 0;
  window.SGSMODULE = [() => exits++];
  controller.setTakeoverPolicy('exit-known');
  assert.equal(scans, 3);
  assert.equal(exits, 0);
  controller.setEnabled(true);
  assert.equal(scans, 4);
  assert.equal(exits, 1);
  assert.equal(intervals.size, 1);
  assert.equal(observers.size, 1);
  assert.equal(latePanel.style.display, 'none');

  controller.setEnabled(false);
  assert.equal(latePanel.style.display, '');
  await flushed(window);
  assert.equal(scans, 4);
  assert.equal(intervals.size, 0);
  assert.equal(observers.size, 0);
});
