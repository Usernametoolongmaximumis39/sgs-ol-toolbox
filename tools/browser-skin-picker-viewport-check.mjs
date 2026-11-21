import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, devices, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'test-results/skin-picker-viewport');
const bundle = await build({
  stdin: { resolveDir: root, contents: `
    import { ResourceScope } from './src/core/resources.js';
    import { installMicroCompatibility } from './src/core/micro-compatibility.js';
    import { createYjcmPicker } from './src/plugins/skins/yjcm-picker.js';
    import { createFormPicker } from './src/plugins/skins/form-picker.js';
    import { mountPluginUI } from './src/ui/plugin-ui.js';
    import { createPluginNative } from './src/core/plugin-native.js';
    import { ThemeRegistry } from './src/core/themes.js';
    import { THEMES } from './src/plugins/themes/palettes.js';
    export function open(kind, offset, shortList, light) {
      document.body.innerHTML = '<button data-sgs-toolbox="core">打开皮肤</button><div class="game-fixture"></div>';
      const trigger = document.body.firstElementChild;
      const game = trigger.nextElementSibling;
      document.body.style.overflow = shortList ? 'hidden' : '';
      if (shortList) game.style.height = 'calc(100vh + 480px)';
      window.scrollTo(0, 0);
      trigger.style.setProperty('--sgs-font-offset', offset + 'px');
      const scope = new ResourceScope();
      installMicroCompatibility(window, scope);
      const scrollIntoView = Element.prototype.scrollIntoView;
      let outerScrollRequests = 0;
      Element.prototype.scrollIntoView = function (...args) {
        if (this.getRootNode().host?.dataset.sgsToolbox === 'skin-picker') outerScrollRequests++;
        return scrollIntoView.apply(this, args);
      };
      scope.add(() => { Element.prototype.scrollIntoView = scrollIntoView; });
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
      const art = canvas.toDataURL();
      const imageBytes = Uint8Array.from(atob(art.split(',')[1]), char => char.charCodeAt(0));
      const entries = Array.from({ length: shortList ? 2 : 120 }, (_, index) => ({
        id: 83502 - index, general: '势魏延', name: index === 0 ? '狂志吞天' : '皮肤 ' + index,
        source: kind, effects: { actions: [{ id: 0, key: 'special', name: '特殊演出' }] },
        assets: [[2, 'fixture-viewport']], art: 'fixture.png', download: async () => imageBytes,
      }));
      scope.patch(window, 'fetch', fetch => (url, options) => String(url).endsWith('/fixture-viewport.png')
        ? fetch(art, options) : fetch(url, options));
      const forms = shortList ? [entries[0], { ...entries[0], mobileForm: 2 }, { ...entries[0], mobileForm: 3 }] : null;
      const catalogue = { searchSkins: () => ({ all: entries, categories: new Map() }),
        findSkin: (id, general) => entries.find(entry => entry.id === id && entry.general === general),
        skinForms: entry => forms && entry === entries[0] ? forms : [entry], skinVoices: () => [],
        skinTransitions: () => [{ from: 1, to: 2 }, { from: 1, to: 3 }] };
      let finish;
      const load = () => new Promise(resolve => { finish = () => resolve(catalogue); });
      const settings = new Map();
      const themes = new ThemeRegistry(settings);
      const paper = THEMES.find(theme => theme.id === 'themes.ricepaper');
      themes.register(paper, 'themes');
      if (light) themes.select(paper.id);
      const config = {
        character: { GameCharacters: { character: [{ id: 101, spellId1: 10 }] } },
        cha_spell: { GameSpells: { spell: [{ id: 10, name: '威谋' }] } },
      };
      const ctx = { document, window, scope, settings, themes, backgrounds: { canSelectSkinImage: () => true },
        game: { getSelf: () => ({ ClientId: 41 }), getConfigData: name => config[name] } };
      ctx.ui = mountPluginUI(ctx, () => ctx);
      ctx.native = createPluginNative(ctx);
      const local = { portraitBinding: () => shortList ? { id: 83502, general: '势魏延' } : undefined, mobile: { load }, yjcm: { load } };
      trigger.focus();
      createYjcmPicker(ctx, local, createFormPicker(ctx))({ trigger, general: { id: 101, name: '势魏延' } }, kind);
      const dialog = document.querySelector('[data-sgs-toolbox="skin-picker"]').shadowRoot.querySelector('dialog');
      const body = dialog.querySelector('.body');
      let ruleHost, rules;
      const readSwitches = () => [...rules.querySelectorAll('[role=switch]')].map(input => {
        const track = getComputedStyle(input);
        const thumb = getComputedStyle(input, '::before');
        return { checked: input.checked, label: input.nextElementSibling.textContent, track: track.backgroundColor,
          thumb: thumb.backgroundColor, transform: thumb.transform };
      });
      const read = () => {
        const { top, bottom, left, right, height } = dialog.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const apply = dialog.querySelector('.footer button').getBoundingClientRect();
        const select = dialog.querySelector('.effect-preview-choice');
        const preview = select.getBoundingClientRect();
        const background = dialog.querySelector('.skin-background button');
        const action = background.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(background);
        return { viewport: [innerWidth, innerHeight], top, bottom, left, right, height,
          pageScroll: window.scrollY, gameTop: game.getBoundingClientRect().top, outerScrollRequests,
          footerVisible: apply.top >= 0 && apply.bottom <= innerHeight,
          bodyScroll: body.scrollTop, bodyOverflows: body.scrollHeight > body.clientHeight,
          bodyFitsWidth: body.scrollWidth <= body.clientWidth + 1,
          backgroundFits: action.height >= 36 && action.right <= bodyRect.right && range.getClientRects().length === 1,
          previewVisible: Boolean(select.value) && preview.top >= bodyRect.top - 1 && preview.bottom <= bodyRect.bottom + 1 };
      };
      window.fixture = {
        read, finish() { finish(); },
        select() {
          dialog.querySelector('.result').click();
          const effect = dialog.querySelector('.skin-effects');
          if (!effect.open) effect.querySelector('summary').click();
        },
        scroll() {
          body.scrollTop += dialog.querySelector('.effect-preview-choice').getBoundingClientRect().top -
            body.getBoundingClientRect().top;
        },
        openRules() {
          dialog.querySelector('.rules').click();
          ruleHost = document.querySelector('[data-sgs-skin-form-rules]');
          rules = ruleHost.shadowRoot.querySelector('dialog');
          rules.querySelector('[data-mode=custom]').click();
          return readSwitches();
        },
        readRules() {
          const { top, bottom, left, right } = rules.getBoundingClientRect();
          const active = rules.querySelector('[data-mode=custom]');
          const body = rules.querySelector('.body');
          const footer = rules.querySelector('.submit').getBoundingClientRect();
          return { viewport: [innerWidth, innerHeight], top, bottom, left, right,
            modeHighlight: getComputedStyle(active).backgroundImage,
            footerVisible: footer.top >= top && footer.bottom <= bottom,
            bodyFitsWidth: body.scrollWidth <= body.clientWidth + 1,
            switches: readSwitches() };
        },
        scrollRules() {
          const body = rules.querySelector('.body');
          body.scrollTop = body.scrollHeight;
          const last = [...body.querySelectorAll('[role=switch]')].at(-1).getBoundingClientRect();
          const view = body.getBoundingClientRect();
          return { scrollTop: body.scrollTop, lastVisible: last.top >= view.top - 1 && last.bottom <= view.bottom + 1 };
        },
        routeUsesKeyboard() {
          const route = rules.querySelector('[role=switch]');
          return rules.getRootNode().activeElement === route && !route.checked;
        },
        closeRules() {
          rules.querySelector('.close').click();
          return !ruleHost.isConnected && dialog.getRootNode().activeElement === dialog.querySelector('.rules');
        },
        close() {
          dialog.querySelector('.close').click();
          scope.dispose();
          return !dialog.isConnected && document.activeElement === trigger;
        },
      };
      return read();
    }
  ` },
  bundle: true, write: false, format: 'iife', globalName: 'SkinPickerCheck', target: 'chrome85',
});
const source = bundle.outputFiles[0].text;
const html = 'data:text/html,<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:%234c4132">';
const sizes = [
  [660, 1004, 0, 'mobile', false, true],
  [660, 360, 2, 'mobile', false, false],
  [320, 720, -1, 'cross', false, true],
  [1024, 500, -2, 'mobile', false, false],
  [873, 968, 0, 'mobile', true, true],
  [600, 430, 2, 'mobile', true, false],
];
const runtime = process.env.SGS_SKIN_PICKER_MICRO_RUNTIME && resolve(process.env.SGS_SKIN_PICKER_MICRO_RUNTIME);
const ipad = process.env.SGS_SKIN_PICKER_IPAD === '1';
await mkdir(output, { recursive: true });

async function replay(evaluate, resize, capture, pressSpace) {
  const rows = [];
  for (const [width, height, offset, kind, shortList, light] of sizes) {
    await resize(width, height);
    const initial = await evaluate(`SkinPickerCheck.open(...${JSON.stringify([kind, offset, shortList, light])})`);
    await evaluate('fixture.finish()');
    const listed = await evaluate('fixture.read()');
    await evaluate('fixture.select()');
    for (let attempt = 0; attempt < 40 && !(await evaluate('fixture.read()')).backgroundFits; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const selected = await evaluate('fixture.read()');
    if (width === 660 || shortList) await capture(`selected-${height}.png`);
    await evaluate('fixture.scroll()');
    const scrolled = await evaluate('fixture.read()');
    if (width === 660 && height === 360) await capture('scrolled-360.png');
    let ruleAppearance;
    if (shortList) {
      const immediate = await evaluate('fixture.openRules()');
      await new Promise(resolve => setTimeout(resolve, 350));
      const settled = await evaluate('fixture.readRules()');
      await capture(`rules-${width}.png`);
      const scrolled = await evaluate('fixture.scrollRules()');
      if (height < 500) await capture(`rules-scrolled-${height}.png`);
      if (pressSpace) await pressSpace();
      ruleAppearance = { immediate, settled, scrolled, keyboard: pressSpace ? await evaluate('fixture.routeUsesKeyboard()') : null,
        closed: await evaluate('fixture.closeRules()') };
    }
    await resize(width, 330);
    await evaluate('fixture.scroll()');
    const resized = await evaluate('fixture.read()');
    rows.push({ kind, offset, initial, listed, selected, scrolled, resized, ruleAppearance, closed: await evaluate('fixture.close()') });
  }
  return rows;
}

let result;
if (runtime) {
  // The caller supplies a disposable copy with a dedicated test app, excluding the installed app/profile.
  const app = resolve(output, 'runtime/resources/app');
  assert.equal(runtime, resolve(output, 'runtime/SGSOL.exe'), 'Use only the dedicated test runtime');
  const manifest = JSON.parse(await readFile(resolve(app, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'skin-picker-viewport');
  await writeFile(resolve(output, 'bundle.js'), source);
  await writeFile(resolve(app, 'main.cjs'), `
    const { app, BrowserWindow } = require('electron');
    const { readFileSync, writeFileSync } = require('fs');
    const { resolve } = require('path');
    const output = ${JSON.stringify(output)};
    app.setPath('userData', resolve(output, 'profile'));
    app.disableHardwareAcceleration();
    app.whenReady().then(async () => {
      try {
        const window = new BrowserWindow({ show: false, frame: false, useContentSize: true, width: 660, height: 1004,
          webPreferences: { offscreen: true, backgroundThrottling: false } });
        const messages = [];
        window.webContents.on('console-message', (_event, level, message) => { if (level === 3) messages.push(message); });
        const evaluate = code => window.webContents.executeJavaScript(code).catch(error => {
          throw new Error(code.slice(0, 80) + ': ' + (messages.join(' | ') || error.message));
        });
        await window.loadURL(${JSON.stringify(html)});
        await evaluate(readFileSync(resolve(output, 'bundle.js'), 'utf8'));
        const sizes = ${JSON.stringify(sizes)};
        const report = await (${replay.toString()})(evaluate, async (width, height) => {
          window.setContentSize(width, height);
          await new Promise(resolve => setTimeout(resolve, 80));
        }, async name => {
          await new Promise(resolve => setTimeout(resolve, 80));
          writeFileSync(resolve(output, 'micro-' + name), (await window.webContents.capturePage()).toPNG());
        });
        writeFileSync(resolve(output, 'micro-report.json'), JSON.stringify({ engine: process.versions.chrome, report }, null, 2));
        app.exit(0);
      } catch (error) {
        writeFileSync(resolve(output, 'micro-error.txt'), error.stack);
        app.exit(1);
      }
    });
  `);
  const child = spawnSync(runtime, [], { cwd: output, windowsHide: true, timeout: 45_000 });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, await readFile(resolve(output, 'micro-error.txt'), 'utf8').catch(() => String(child.error)));
  result = JSON.parse(await readFile(resolve(output, 'micro-report.json'), 'utf8'));
  assert.match(result.engine, /^85\./);
} else {
  const browser = ipad ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(ipad ? devices['iPad (gen 7)'] : {});
    await page.goto(html);
    await page.addScriptTag({ content: source });
    const report = await replay(code => page.evaluate(code), (width, height) => page.setViewportSize({ width, height }),
      name => page.screenshot({ path: resolve(output, ipad ? 'ipad-' + name : name) }),
      () => page.locator('[data-sgs-skin-form-rules]').getByRole('switch').first().press('Space'));
    result = { engine: browser.version(), report };
    await writeFile(resolve(output, ipad ? 'ipad-report.json' : 'browser-report.json'), JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}

const luminance = color => color.match(/\d+/g).map(channel => Number(channel) / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
};
for (const [index, { initial, listed, selected, scrolled, resized, ruleAppearance, closed }] of result.report.entries()) {
  const [width, height] = sizes[index];
  assert.deepEqual(initial.viewport, [width, height]);
  assert.deepEqual(resized.viewport, [width, 330]);
  assert.ok(listed.top < initial.top, 'The dialog must grow upward as the results load');
  for (const state of [initial, listed, selected, scrolled, resized]) {
    assert.equal(state.outerScrollRequests, 0, 'The picker must scroll only its own content: ' + JSON.stringify(state));
    assert.equal(state.pageScroll, 0, 'The picker must not scroll the game page: ' + JSON.stringify(state));
    assert.equal(state.gameTop, initial.gameTop, 'The game must stay in place');
  }
  for (const state of [initial, listed, selected, resized]) {
    const [width, height] = state.viewport;
    assert.ok(state.left >= 11 && state.right <= width - 11 && state.top >= 11 &&
      state.bottom <= height - 11 && state.footerVisible && state.bodyFitsWidth, JSON.stringify(state));
  }
  assert.ok(selected.backgroundFits && resized.backgroundFits, 'The background action must fit on one line');
  for (const state of [scrolled, resized]) {
    if (state.bodyOverflows) assert.ok(state.bodyScroll > 0, 'The dialog body must scroll');
    assert.ok(state.previewVisible, 'The effect control must be reachable: ' + JSON.stringify(state));
  }
  if (ruleAppearance) {
    const { immediate, settled, keyboard, closed } = ruleAppearance;
    for (const switches of [immediate, settled.switches]) {
      assert.deepEqual(switches.map(item => item.checked), [true, true, false, false, false, false]);
      const [enabled, , disabled] = switches;
      assert.equal(enabled.label + ' / ' + disabled.label, '已启用 / 已关闭');
      for (const item of [enabled, disabled]) {
        assert.match(item.track, /^rgb\(/, JSON.stringify(item));
        assert.match(item.thumb, /^rgb\(/, JSON.stringify(item));
        assert.ok(contrast(item.track, item.thumb) >= 3, JSON.stringify(item));
      }
      assert.notEqual(enabled.track, disabled.track);
    }
    assert.notEqual(settled.switches[0].transform, settled.switches[2].transform, 'The thumb must move to show the state');
    assert.notEqual(settled.modeHighlight, 'none', 'The active mode must have a visible highlight');
    assert.ok(settled.top >= 9 && settled.bottom <= height - 9 && settled.left >= 9 && settled.right <= width - 9 &&
      settled.footerVisible && settled.bodyFitsWidth,
      JSON.stringify(settled));
    assert.ok(ruleAppearance.scrolled.lastVisible, 'The last route must be reachable');
    if (height < 500) assert.ok(ruleAppearance.scrolled.scrollTop > 0, 'The rules must scroll in a short window');
    assert.ok(keyboard ?? true, 'Space must toggle the focused rule');
    assert.ok(closed, 'Closing the rules must return focus to the picker');
  }
  assert.ok(closed, 'Closing must restore focus to the entry point');
}
console.log(`Skin picker viewport passed on ${ipad ? 'iPad WebKit' : 'Chromium'} ${result.engine}`);
