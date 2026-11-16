import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const host = fs.readFileSync('microclient/host.cjs', 'utf8');

test('microclient main window uses half physical display with a 1400x820 floor, once only', () => {
  for (const [physicalWidth, physicalHeight, scale, expected] of [
    [3840, 2160, 1, [1920, 1080]],
    [3840, 2160, 1.5, [1280, 720]],
    [3840, 2160, 2, [960, 540]],
    [1920, 1080, 1, [1400, 820]],
    [2560, 1440, 1, [1400, 820]],
    [5120, 1440, 1, [2560, 820]],
  ]) {
    const app = new EventEmitter(), calls = [];
    const bounds = { x: -2560, y: 0, width: 1400, height: 820 };
    const electron = { app, ipcMain: { on() {}, handle() {} }, screen: {
      getDisplayMatching(value) {
        assert.equal(value, bounds);
        return { size: { width: physicalWidth / scale, height: physicalHeight / scale }, scaleFactor: scale };
      }
    } };
    vm.runInNewContext(host, { URL, Buffer, __dirname: '.', require(id) {
      if (id === 'electron') return electron;
      if (id === 'fs') return { readFileSync: () => '// fixture' };
      return require(id);
    } });
    app.emit('browser-window-created', {}, { getBounds: () => bounds, setSize: (...size) => calls.push(size), center: () => calls.push('center') });
    assert.deepEqual(calls, [expected, 'center']);
    app.emit('browser-window-created', {}, { getBounds() { throw Error('popup must not be resized'); } });
    assert.equal(calls.length, 2);
  }
});
