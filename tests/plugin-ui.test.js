import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { mountPluginUI, acquirePluginStyles } from '../src/ui/plugin-ui.js';

test('shared controls survive another plugin stopping and release the last document and shadow reference', () => {
  const dom = new JSDOM('<main></main>'), document = dom.window.document;
  const first = new ResourceScope(), second = new ResourceScope();
  const a = { document, scope: first }, b = { document, scope: second };
  const ui = mountPluginUI(a, () => a); mountPluginUI(b, () => b);
  const shadow = document.querySelector('main').attachShadow({ mode: 'open' });
  const release = ui.mountStyles(shadow), other = acquirePluginStyles(shadow, document);
  assert.equal(document.querySelectorAll('[data-sgs-plugin-controls]').length, 1);
  assert.equal(shadow.querySelectorAll('style').length, 1);
  release(); release(); assert.equal(shadow.querySelectorAll('style').length, 1);
  first.dispose(); assert.equal(document.querySelectorAll('style').length, 1);
  second.dispose(); assert.equal(document.querySelectorAll('style').length, 0);
  other(); other(); assert.equal(shadow.querySelectorAll('style').length, 0);
  dom.window.close();
});

test('core information panel releases local listeners and theme subscription on repeated unmount', () => {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope();
  let subscriptions = 0, calls = 0;
  const ctx = { document: dom.window.document, scope, themes: { subscribe() { subscriptions++; return () => subscriptions--; } } };
  const ui = mountPluginUI(ctx, () => ctx).panel(ctx.document.querySelector('main'));
  const button = ui.button('操作', 'info', () => calls++); ui.root.append(button); button.click();
  assert.equal(calls, 1); assert.equal(subscriptions, 1);
  ui.dispose(); ui.dispose(); button.click();
  assert.equal(calls, 1); assert.equal(subscriptions, 0);
  assert.equal(ctx.document.querySelector('main').children.length, 0);
  scope.dispose(); dom.window.close();
});
