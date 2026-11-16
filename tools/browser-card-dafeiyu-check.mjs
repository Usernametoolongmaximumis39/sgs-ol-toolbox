import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resource } from '../src/plugins/dafeiyu-cards/resources.js';
import { cards as coverage } from '../src/plugins/dafeiyu-cards/coverage.js';
import { parseCardFrames, validateCardAtlas } from '../src/core/card-atlas.js';

const assetVersion = new URL(resource.index.url).pathname.split('/').at(-2);
const assetRoot = new URL('../release/card-art/dafeiyu/' + assetVersion + '/', import.meta.url);
const descriptor = validateCardAtlas(resource), assetBytes = new Map(), dimensions = [];
for (const spec of [descriptor.index, ...descriptor.pages]) {
  const name = new URL(spec.url).pathname.split('/').at(-1), bytes = await readFile(new URL(name, assetRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256, name + ' integrity');
  assetBytes.set(spec.url, bytes);
  for (const url of spec.fallbackUrls || []) assetBytes.set(url, bytes);
  if (spec !== descriptor.index) dimensions.push({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}
const index = JSON.parse(assetBytes.get(descriptor.index.url));
const frames = parseCardFrames(index, dimensions, descriptor);
assert.equal(descriptor.pixelRatio, 3);
assert.equal(descriptor.pages.length, 3);
assert([...frames.values()].every(frame => frame.w === 405 && frame.h === 570));
assert.deepEqual([...frames.keys()].sort(), coverage.map(card => card.name + '_png.png').sort(), 'all and only 52 requested exact frames');
const artManifest = JSON.parse(await readFile(new URL('manifest.json', assetRoot), 'utf8'));
assert.deepEqual(artManifest.cards.map(card => card.name).sort(), coverage.map(card => card.name).sort(), 'source manifest coverage');
assert.equal(new Set(artManifest.cards.map(card => card.sourceSha256)).size, 52, 'all 52 cards use distinct original illustrations');
const previous = JSON.parse(await readFile(new URL('../release/card-art/dafeiyu/0.2.0/manifest.json', import.meta.url), 'utf8'));
const changedSources = artManifest.cards.filter(card => card.sourceSha256 !== previous.cards.find(old => old.name === card.name)?.sourceSha256).map(card => card.name).sort();
assert.deepEqual(changedSources, ['HongMianBaiHuaPao', 'LingLongShiManDai', 'ShuFaZiJinGuan', 'WuShuangFangTianJi'].sort(), 'only the four completed Lv Lingqi illustrations change; the other 48 source images are retained');
for (const card of artManifest.cards) {
  const bytes = await readFile(new URL('../' + card.sourceFile, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), card.sourceSha256, card.name + ' source integrity');
}
const source = await readFile(process.env.SGS_CLIENT_SOURCE || 'C:/Users/Admin/AppData/Local/Temp/sgs-client/game/sgsGame_a.sgs', 'utf8');
const start = source.indexOf('class qqi extends '), end = source.indexOf('class Qqi extends ', start), native = source.slice(start, end);
const methods = native.slice(native.indexOf('SetCardFace(t){'), native.indexOf('UpdateCardFaceRes('));
assert(methods.includes('updateNewCardFace(t=null)'), 'known native card methods must be present');
const bundle = await build({ stdin: { contents: `
  export { CardStyleRegistry } from './src/core/card-styles.js';
  export { ResourceScope } from './src/core/resources.js';
  export { Settings } from './src/core/storage.js';
  export { createShell } from './src/ui/shell.js';
  export { ThemeRegistry, BLACK_GOLD } from './src/core/themes.js';
  export { default as plugin } from './src/plugins/dafeiyu-cards/index.js';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'DafeiyuCheck' });
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1460, height: 1280 } }), errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
let corrupt = false, delayed = false;
try {
  await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#253143"></body>' }));
  const serveArt = async route => {
    const url = route.request().url(); requests.push(url);
    assert(assetBytes.has(url), 'only declared assets can be fetched');
    if (delayed) await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ headers: { 'access-control-allow-origin': '*' },
      contentType: url.endsWith('.png') ? 'image/png' : 'application/json', body: corrupt ? 'corrupt' : assetBytes.get(url) });
  };
  for (const url of [resource.index.url, ...(resource.index.fallbackUrls || [])]) await page.route(new URL('./', url).href + '**', serveArt);
  await page.goto('http://localhost/');
  await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || 'C:/Users/Admin/AppData/Local/Temp/sgsres/game/laya.core.min.js' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(({ methods, coverage }) => {
    Laya.init(1460, 1280); Laya.stage.bgColor = '#253143';
    const { CardStyleRegistry, ResourceScope, Settings, createShell, ThemeRegistry } = DafeiyuCheck;
    const scope = new ResourceScope(), settings = new Settings(localStorage, 'dafeiyu-test:');
    const canvas = document.createElement('canvas'); canvas.width = 93; canvas.height = 130;
    const c = canvas.getContext('2d'); c.fillStyle = '#ddd0b0'; c.fillRect(0, 0, 93, 130);
    const bitmap = new Laya.Texture2D(93, 130); bitmap.loadImageSource(canvas); const original = new Laya.Texture(bitmap);
    window.JH = { I: () => ({ GetBarDataById: () => null }) }; window.vCt = { Bottom_CardFace: 0 };
    window.ZK = { I: () => ({ GetCardFaceVOByIdAndType: () => true }) }; window.Ki = { BACK: 1, FACE: 2 };
    window.xk = { NORMAL_SIZE: { width: 93, height: 130 } }; window.xmt = { BASIC: 1, JINNANG: 2, EQUIP: 3 };
    window.qqi = { SMALL_DESC_PREFIX: 'small_desc' }; window.wKi = { GetEmptyTextrue: () => null };
    window.mNt = { GetRes: name => /^card|_png$/.test(name) ? original : null };
    const Native = new Function('return class Native {' + methods + '}')();
    const cards = [];
    function add(name, label = name) {
      const position = cards.length, x = 22 + position % 8 * 120, y = 65 + Math.floor(position / 8) * 163;
      const ui = { isNewCardUI: true, theCard: { IsEmpty: false, ResName: name, CardBaseType: 1 }, measure() {}, layout() {},
        SetCardFace: Native.prototype.SetCardFace, getCardFaceBaseTexture: Native.prototype.getCardFaceBaseTexture,
        updateNewCardFace: Native.prototype.updateNewCardFace };
      for (const key of ['bmpFace', 'bmpFace2', 'bmpName', 'bmpNameBg', 'bmpNormalName', 'bmpCardType', 'bmpSmallDesc', 'bmpFlower', 'bmpNumber']) ui[key] = new Laya.Sprite();
      ui.bmpFace.pos(x, y); Laya.stage.addChild(ui.bmpFace); ui.SetCardFace(null); cards.push(ui);
      const text = new Laya.Text(); text.text = label; text.fontSize = 12; text.color = '#f5e9cd'; text.width = 112;
      text.wordWrap = true; text.pos(x, y + 134); Laya.stage.addChild(text);
      ui.fixtureLabel = text;
      return ui;
    }
    const title = new Laya.Text(); title.text = '大肥鱼卡面-Lite · 52 张完整卡面 / 原生 Laya 方法受控回放';
    title.fontSize = 21; title.color = '#f5e9cd'; title.pos(22, 20); Laya.stage.addChild(title);
    for (const card of coverage) add(card.name, card.label);
    add('GuoZhanSha', '国战专用：保留原图'); add('Limited2026Unknown', '限时未知：保留原图'); add('Activity2026Unknown', '活动未知：保留原图');
    const hand = { cardUis: cards, createNormalCardUi(card) { return add(card.ResName); } }, self = { cardContainer: hand };
    const registry = new CardStyleRegistry({ window, document, game: { getSelfSeatUI: () => self }, settings, scope });
    let releases = [];
    const enable = () => DafeiyuCheck.plugin.activate({ cardStyles: { register: style => releases.push(registry.register(style, 'dafeiyu-cards')) } });
    const disable = () => { for (const release of releases) release(); releases = []; };
    enable();
    const shell = createShell({ window, document, scope, settings });
    const themes = new ThemeRegistry(settings, tokens => shell.applyTheme(tokens));
    shell.setHandlers({ cardStyles: registry, themes, manager: { list: () => [] }, market: () => null });
    window.check = { registry, original, cards, hand, scope, shell, enable, disable };
  }, { methods, coverage });
  const host = page.locator('[data-sgs-toolbox="core"]');
  await host.locator('[data-category="manage"]').click();
  await host.getByRole('button', { name: '外观', exact: true }).click();
  await host.locator('.card-style-workshop').waitFor();
  await host.locator('.card-style-workshop .plugin-toggle').click();
  assert.equal(requests.length, 0, 'installing and opening settings do not download images');
  const option = host.locator('[data-card-side="face"][data-card-style="dafeiyu-cards.beta"]');
  assert.equal(await option.getAttribute('aria-pressed'), 'false');
  assert(!(await option.textContent()).includes('选用后加载预览'));
  await option.locator('img').evaluate(async image => { await image.decode(); if (!image.naturalWidth) throw Error('preview missing'); });
  assert.equal(await host.locator('[data-card-side="back"][data-card-style="dafeiyu-cards.beta"]').count(), 1);
  await option.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/dafeiyu-before-download.png' });
  delayed = true;
  await option.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => check.registry.status.includes('正在加载完整卡面'));
  await page.evaluate(() => { if (check.cards.some(ui => ui.bmpFace.texture !== check.original)) throw Error('unverified art applied before download'); });
  await page.waitForFunction(() => check.registry.atlases.get('dafeiyu-cards.beta')?.data);
  delayed = false;
  assert(!(await host.locator('.card-style-workshop').textContent()).includes('查看官方图集来源'), 'custom art must not be described as official');
  await page.evaluate(() => {
    const { cards, registry, original } = check;
    if (!registry.status.includes('已替换 52/55')) throw Error('applied count must describe actual coverage: ' + registry.status);
    for (const ui of cards.slice(0, 52)) {
      if (ui.bmpFace.texture === original) throw Error('missing art: ' + ui.theCard.ResName);
      if (ui.bmpFace.texture.bitmap.width !== 405 || ui.bmpFace.texture.bitmap.height !== 570) throw Error('HD bitmap was downsampled: ' + ui.theCard.ResName);
      ui.IsYiCard = true; ui.isSkillChangeStatus = true; ui.SetCardFace(null);
      if (ui.bmpFace.texture === original) throw Error('native refresh lost art: ' + ui.theCard.ResName);
    }
    for (const ui of cards.slice(52)) if (ui.bmpFace.texture !== original) throw Error('unknown card replaced');
    const first = cards[0]; first.isNewCardUI = false; first.IsYiCard = false; first.SetCardFace(null);
    if (first.bmpFace.texture === original) throw Error('own-hand full-image rendering failed');
    first.isNewCardUI = true; first.SetCardFace(null);
    const extra = check.hand.createNormalCardUi({ ResName: 'MuNiuLiuMa' });
    if (extra.bmpFace.texture === original) throw Error('new card creation flashed native art');
    extra.theCard.ResName = 'ActivityMissing'; extra.SetCardFace(null);
    extra.fixtureLabel.text = '复用回退：保留原图';
    // This synthetic card uses native BASIC layout, whose bmpName is normally hidden.
    if (extra.bmpFace.texture !== original || extra.bmpName.visible !== false) throw Error('pooled card retained prior art/layer state');
    registry.selectScope('self');
    const opponent = { ...cards[52], theCard: { ResName: 'Sha', IsEmpty: false }, bmpFace: { texture: original } };
    registry.captureCard(opponent); if (opponent.bmpFace.texture !== original) throw Error('opponent replaced in self scope');
    registry.selectScope('all');
  });
  for (const width of [248, 280, 420]) for (const light of [false, true]) {
    await page.evaluate(({ width, light }) => {
      check.shell.host.style.width = width + 'px';
      check.shell.applyTheme({ ...DafeiyuCheck.BLACK_GOLD.tokens, ...(light ? { bg: '#f6f0e4', surface: '#fffaf0', raised: '#ebe2cf', text: '#312a20', muted: '#746957', accent: '#826121', border: '#c7b89b', scheme: 'light' } : {}) });
      check.shell.host.shadowRoot.querySelector('[data-card-style="dafeiyu-cards.beta"]').scrollIntoView({ block: 'center' });
    }, { width, light });
    await page.waitForTimeout(220);
    await page.screenshot({ path: `test-results/dafeiyu-${width}-${light ? 'light' : 'dark'}.png` });
    assert.equal(await page.evaluate(() => { const content = check.shell.host.shadowRoot.querySelector('.content'); return content.scrollWidth > content.clientWidth; }), false);
  }
  await page.setViewportSize({ width: 1120, height: 620 });
  await host.locator('.card-style-workshop [role="status"]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => {
    const content = check.shell.host.shadowRoot.querySelector('.content');
    return content.scrollWidth <= content.clientWidth && content.scrollTop > 0;
  }), true, 'low-height settings must remain scrollable without horizontal overflow');
  await page.screenshot({ path: 'test-results/dafeiyu-low-height.png' });
  await page.setViewportSize({ width: 1460, height: 1280 });
  await page.evaluate(() => { check.disable(); if (check.cards[0].bmpFace.texture !== check.original) throw Error('disable did not restore native art'); check.enable(); });
  await page.waitForFunction(() => check.registry.atlases.get('dafeiyu-cards.beta')?.data);
  await page.evaluate(() => {
    check.registry.selectSide('back', 'dafeiyu-cards.beta');
    check.cards[0].theCard.IsEmpty = true; check.cards[0].SetCardFace();
  });
  await page.waitForFunction(() => check.registry.backImages.get('dafeiyu-cards.beta')?.complete && check.cards[0].bmpFace.texture !== check.original);
  await page.evaluate(() => {
    const texture = check.cards[0].bmpFace.texture;
    if (texture.bitmap.width !== 405 || texture.bitmap.height !== 570) throw Error('back HD pixels lost');
  });
  assert.equal(await host.locator('[data-card-side="back"][data-card-style="dafeiyu-cards.beta"]').innerText(), '大肥鱼卡背 · 鲸浪藏锋');
  assert.equal(await option.innerText(), '大肥鱼卡面');
  await page.screenshot({path:'test-results/dafeiyu-back.png'});
  await page.evaluate(() => {
    check.registry.selectSide('back', '');
    if(check.cards[0].bmpFace.texture !== check.original || check.registry.backImages.size) throw Error('back selection cleanup failed');
    check.cards[0].theCard.IsEmpty = false; check.cards[0].SetCardFace();
  });
  corrupt = true;
  await page.evaluate(() => { check.registry.selectSide('face', ''); check.registry.selectSide('face', 'dafeiyu-cards.beta'); });
  await page.waitForFunction(() => check.registry.atlases.get('dafeiyu-cards.beta')?.error);
  await page.evaluate(() => { if (check.cards.some(ui => ui.bmpFace.texture !== check.original)) throw Error('integrity failure did not restore native art'); });
  await host.locator('.card-style-workshop [role="status"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/dafeiyu-load-error.png' });
  assert.equal(await page.evaluate(() => { const content = check.shell.host.shadowRoot.querySelector('.content'); return content.scrollWidth > content.clientWidth; }), false, 'complete error detail must wrap');
  corrupt = false;
  await host.getByRole('button', { name: '重新加载卡面' }).click();
  await page.waitForFunction(() => check.registry.atlases.get('dafeiyu-cards.beta')?.data);
  delayed = true;
  await page.evaluate(() => { check.registry.selectSide('face', ''); check.registry.selectSide('face', 'dafeiyu-cards.beta'); check.registry.selectSide('face', ''); });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    if (check.cards.some(ui => ui.bmpFace.texture !== check.original) || check.registry.atlases.size) throw Error('late download revived unselected style');
    check.scope.dispose();
  });
  assert.deepEqual(errors, []);
  await writeFile('test-results/dafeiyu-cards-check.json', JSON.stringify({ frameCount: frames.size, requests,
    checks: 'Actual 52-card artwork, pinned hashes and exact atlas coverage; official Laya engine and original native methods; deferred loading, truthful loading state, 52 replacements and unknown fallback; pooled reuse, own-hand rendering, scope, disable/enable, hash failure/retry/cancellation; 248/280/420px dark/light and low-height scrolling screenshots.',
    limitations: 'Controlled native-method replay using local release assets via exact loopback route interception. No logged-in official match and no proof of public deployment availability.' }, null, 2));
  console.log('Dafeiyu card browser check passed: 52 exact frames, six layout screenshots.');
} finally { await browser.close(); }
