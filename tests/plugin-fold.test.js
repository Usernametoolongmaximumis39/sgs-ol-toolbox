import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createShell } from '../src/ui/shell.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';

test('opening a group closes its peers without disposing panels or changing another page', t => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test' });
  const scope = new ResourceScope(), settings = new Settings(dom.window.localStorage);
  const shell = createShell({ window: dom.window, document: dom.window.document, settings, scope });
  t.after(() => { scope.dispose(); dom.window.close(); });
  let disposals = 0;
  for (const [id, pluginId, category] of [['a', 'one', 'game'], ['b', 'one', 'game'], ['c', 'two', 'game'], ['d', 'one', 'tools']]) {
    shell.registerPanel({ id, pluginId, pluginName: pluginId, category, render(node) {
      node.textContent = id; return () => { disposals++; };
    } });
  }
  const groups = shell.shadow.querySelectorAll('.plugin-group');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].querySelector('.plugin-body').children.length, 2);
  const before = disposals;
  groups[0].querySelector('button').click();
  assert.equal(groups[0].querySelector('.plugin-body').hidden, true);
  assert.equal(groups[1].querySelector('.plugin-body').hidden, false);
  assert.equal(disposals, before);
  groups[0].querySelector('button').click();
  assert.equal(groups[0].querySelector('.plugin-body').hidden, false);
  assert.equal(groups[1].querySelector('.plugin-body').hidden, true);
  assert.equal(disposals, before);
  shell.shadow.querySelector('[data-category=tools]').click();
  assert.equal(shell.shadow.querySelector('.plugin-body').hidden, false);
  shell.shadow.querySelector('.plugin-toggle').click();
  shell.shadow.querySelector('[data-category=game]').click();
  assert.equal(shell.shadow.querySelector('.plugin-body').hidden, false);
  assert.equal(shell.shadow.querySelector('[data-plugin-group=two] .plugin-body').hidden, true);
});
