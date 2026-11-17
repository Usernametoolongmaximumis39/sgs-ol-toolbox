import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
import { createGameAdapter } from '../src/core/game.js';
import { createShell } from '../src/ui/shell.js';
import { DEFAULT_SCREENSHOT_SHORTCUT, matchesShortcut, shortcutFromEvent, hideNativeOverlays, captureNative, createScreenshotController } from '../src/core/screenshot.js';

test('remaining slash uses native state including zero, extra uses and unlimited; no stale lobby values', () => {
  let targets = [1, 3], disabled = false, unlimited = false;
  const seat = { GetSeatState: id => { assert.equal(id, 1); return { Targets: targets }; }, shaInfo: { get Disabled() { return disabled; }, get NoLimit() { return unlimited; } } };
  const demo = { scene: { SceneName: 'GameScene', SelfSeatUi: { Seat: seat } } };
  const game = createGameAdapter({ __SGS_TOOLBOX_DEMO__: demo });
  assert.equal(game.getRemainingSlash(), 2);
  targets = [3, 3]; assert.equal(game.getRemainingSlash(), 0);
  targets = [0, 1, 0, 0, 9999]; assert.equal(game.getRemainingSlash(), Infinity);
  disabled = true; assert.equal(game.getRemainingSlash(), 0);
  disabled = false; targets = []; assert.equal(game.getRemainingSlash(), 1);
  unlimited = true; assert.equal(game.getRemainingSlash(), Infinity);
  demo.scene = { SceneName: 'HallScene' }; assert.equal(game.getRemainingSlash(), null);
  demo.scene = { SceneName: 'GameScene' }; assert.equal(game.getRemainingSlash(), null);
});

test('native capture restores hidden additions on renderer failure; hall skin controls stay intact', () => {
  const sort = { name: 'sgs-toolbox-hand-sort', visible: true }, timer = { name: 'sgs-toolbox-countdown', visible: false }, skin = { name: 'sgs-toolbox-skin-controls', visible: true };
  const stage = { width: 20, height: 10, _children: [sort, timer, skin], drawToCanvas() { assert.equal(sort.visible, false); assert.equal(skin.visible, true); throw new Error('render failed'); } };
  const restore = hideNativeOverlays(stage); restore(); assert.equal(sort.visible, true); assert.equal(timer.visible, false);
  assert.throws(() => captureNative({ Laya: { stage }, document: { createElement: () => ({ getContext: () => ({}) }) } }, {}, true), /render failed/);
  assert.equal(sort.visible, true); assert.equal(timer.visible, false); assert.equal(skin.visible, true);
});

test('compact shell remembers collapse, preserves expanded width and records/clears shortcuts', async () => {
  const dom = new JSDOM('<body/>', { url: 'https://example.com' }), win = dom.window;
  const scope = new ResourceScope(), settings = new Settings(win.localStorage);
  const shell = createShell({ window: win, document: win.document, settings, scope });
  let shots = 0; shell.setHandlers({ screenshot: () => shots++ });
  shell.shadow.querySelector('[data-collapse]').click(); assert.equal(settings.get('collapsed'), true);
  shell.setRemainingSlash(0); assert.equal(shell.shadow.querySelector('[data-slash]').textContent, '0');
  shell.shadow.querySelector('[data-screenshot]').click(); assert.equal(shots, 1);
  shell.shadow.querySelector('[data-expand]').click(); assert.equal(shell.host.hasAttribute('data-collapsed'), false);
  shell.shadow.querySelector('[data-category="manage"]').click();
  [...shell.shadow.querySelectorAll('.tabs button')].find(n => n.textContent === '设置').click();
  await new Promise(resolve => setTimeout(resolve));
  const input = shell.shadow.querySelector('[aria-label="截图快捷键"]');
  input.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'KeyP', key: 'p', altKey: true, bubbles: true }));
  assert.equal(settings.get('screenshotShortcut').code, 'KeyP');
  assert.equal(settings.get('screenshotShortcut').alt, true);
  [...shell.shadow.querySelectorAll('button')].find(n => n.textContent === '清除快捷键').click();
  assert.equal(settings.get('screenshotShortcut'), null);
  scope.dispose(); win.close();
});

test('shortcut ignores typing/repeats/composition, exact modifiers and is removed on disposal', async () => {
  const dom = new JSDOM('<input/>', { url: 'https://example.com' }), win = dom.window;
  const scope = new ResourceScope(), settings = new Settings(win.localStorage); let notices = 0;
  createScreenshotController({ window: win, game: {}, settings, scope, notify: () => notices++ });
  const event = extra => new win.KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
  assert.equal(matchesShortcut(event(), DEFAULT_SCREENSHOT_SHORTCUT), true);
  assert.equal(matchesShortcut(event({ altKey: true }), DEFAULT_SCREENSHOT_SHORTCUT), false);
  assert.equal(shortcutFromEvent(new win.KeyboardEvent('keydown', { code: 'ShiftLeft' })), null);
  win.document.querySelector('input').dispatchEvent(event());
  win.document.dispatchEvent(event({ repeat: true })); win.document.dispatchEvent(event({ isComposing: true }));
  assert.equal(notices, 0);
  win.document.dispatchEvent(event()); assert.equal(notices, 1);
  scope.dispose(); win.document.dispatchEvent(event()); assert.equal(notices, 1); win.close();
});
