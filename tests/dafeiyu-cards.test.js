import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Settings } from '../src/core/storage.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';
import { CardStyleRegistry } from '../src/core/card-styles.js';
import { ResourceScope } from '../src/core/resources.js';
import { validateCardAtlas } from '../src/core/card-atlas.js';
import { verifyPackage } from '../src/core/packages.js';
import { bundlePlugin, makePluginPackage } from '../tools/plugin-packages.mjs';
import { registerDafeiyuCardStyles } from '../src/plugins/card-styles-extra/dafeiyu/index.js';
import { manifest } from '../src/plugins/card-styles-extra/index.js';
import { cards, replaceCards } from '../src/plugins/card-styles-extra/dafeiyu/coverage.js';
import { localCards } from '../src/plugins/card-styles-extra/dafeiyu/local-resources.js';

const expectedCards = [...replaceCards, ...localCards.map(card => card.name)];

test('dafeiyu package contains only its pinned external references and exact Lite scope', async () => {
  const styles = [];
  registerDafeiyuCardStyles({ core: { distribution: 'lite' }, cardStyles: { register: style => styles.push(style) } });
  assert.equal(styles.length, 1);
  assert.equal(manifest.name, '卡面卡背拓展');
  assert.equal(styles[0].name, '大肥鱼卡面');
  assert.equal(styles[0].id, 'card-styles-extra.dafeiyu');
  const atlas = validateCardAtlas(styles[0].atlas);
  assert.equal(atlas.pixelRatio, 3);
  assert.equal(atlas.pages.length, 4);
  assert.equal(manifest.minCoreVersion, '0.6.185');
  assert.equal(atlas.preview, 'Sha');
  assert.match(atlas.previewImage, /^data:image\/webp;base64,/);
  assert.match(atlas.backImage, /^data:image\/webp;base64,/);
  assert(atlas.previewImage.length <= 160 * 1024);
  assert.equal(new Set(atlas.replaceCards).size, 94);
  assert.deepEqual(atlas.replaceCards, expectedCards);
  assert.deepEqual(Object.fromEntries(['standard', 'maneuver', 'treasure', 'derived'].map(group => [group, cards.filter(card => card.group === group).length])),
    { standard: 32, maneuver: 11, treasure: 1, derived: 8 });
  assert.equal(cards.find(card => card.name === 'MuNiuLiuMa').kind, '宝物');
  assert.deepEqual(cards.filter(card => card.group === 'derived').map(card => [card.name, card.label, card.kind]), [
    ['HunTianYi', '浑天仪', '宝物'], ['QiongShu', '琼梳', '宝物'], ['XiShu', '犀梳', '宝物'], ['JinShu', '金梳', '宝物'],
    ['ShuFaZiJinGuan', '束发紫金冠', '宝物'], ['LingLongShiManDai', '玲珑狮蛮带', '防具'],
    ['HongMianBaiHuaPao', '红锦百花袍', '防具'], ['WuShuangFangTianJi', '无双方天戟', '武器'],
  ]);
  assert.deepEqual(cards.filter(card => card.kind === '延时锦囊').map(card => card.name).sort(), ['BingLiangCunDuan', 'LeBuSiShu', 'ShanDian']);
  for (const name of ['Sha', 'HuoSha', 'LeiSha', 'HanBingJian', 'RenWangDun', 'MuNiuLiuMa']) assert(atlas.replaceCards.includes(name));
  for (const name of ['ShanShan', 'ZZRuYiBang', 'GuoZhanSha', 'GuoZhanXianQu', 'Activity2026']) assert(!atlas.replaceCards.includes(name));
  for (const resource of [atlas.index, ...atlas.pages]) {
    assert.equal(new URL(resource.url).origin, 'https://raw.githubusercontent.com');
    assert(!new URL(resource.url).pathname.includes('/market/'), 'art is deployed separately from plugin packages');
  }
  const bundle = await bundlePlugin('card-styles-extra');
  assert(bundle.inputs.every(path => path.startsWith('src/plugins/card-styles-extra/')));
  const packet = await makePluginPackage(bundle);
  await verifyPackage(packet);
  assert(packet.code.length < 256000, 'only the small preview may be embedded');
  assert(packet.code.includes('data:image/webp;base64,'));
});

test('dafeiyu installs offline and preserves independent selections across the complete plugin lifecycle', async t => {
  const dom = new JSDOM('', { url: 'https://example.test/' }), scope = new ResourceScope();
  const settings = new Settings(dom.window.localStorage), rows = new Map();
  settings.set('cardFaceStyle', ''); settings.set('cardBackStyle', 'card-styles-extra.native-classic'); settings.set('cardStyleScope', 'self');
  dom.window.fetch = () => assert.fail('installing or enabling a card pack must not download art');
  const registry = new CardStyleRegistry({ window: dom.window, document: dom.window.document, game: {}, settings, scope });
  const manager = new PluginManager({ journal: new SessionJournal(), settings,
    store: { async list() { return [...rows.values()]; }, async put(row) { rows.set(row.id, structuredClone(row)); } },
    context: { window: dom.window, document: dom.window.document, cardStyles: registry, ui: {} },
  });
  t.after(() => { manager.dispose(); scope.dispose(); dom.window.close(); });
  await manager.init();
  const packet = await makePluginPackage(await bundlePlugin('card-styles-extra'));
  await manager.install(packet);
  assert.equal(registry.list().length, 6); assert.equal(registry.atlases.size, 0);
  assert.deepEqual(registry.selection, { face: '', back: 'card-styles-extra.native-classic', scope: 'self' });
  // Network loading is covered by atlas tests; isolate lifecycle and stored selections here.
  registry.ensureAtlas = () => ({});
  registry.selectSide('face', 'card-styles-extra.dafeiyu');
  const selection = { ...registry.selection, back: 'card-styles-extra.dafeiyu' };
  registry.selectSide('back', 'card-styles-extra.dafeiyu');
  await manager.disable('card-styles-extra');
  assert.equal(registry.list().length, 0); assert.deepEqual(registry.selection, selection);
  await manager.enable('card-styles-extra'); await manager.reload('card-styles-extra');
  assert.equal(registry.list().length, 6); assert.deepEqual(registry.selection, selection);
  await manager.install(packet); await manager.rollback('card-styles-extra');
  assert.equal(registry.list().length, 6); assert.deepEqual(registry.selection, selection);
  await manager.uninstall('card-styles-extra');
  assert.equal(registry.list().length, 0); assert.equal(registry.atlases.size, 0);
  assert.deepEqual(registry.selection, selection);
});

test('dafeiyu applies all 94 exact names, preserves suit/rank, and restores a reused card outside its scope', t => {
  const scope = new ResourceScope(), values = new Map(), original = {}, rank = {}, suit = {};
  const make = name => ({ theCard: { ResName: name, IsEmpty: false }, isNewCardUI: true,
    bmpFace: { texture: original }, bmpFace2: { visible: true }, bmpName: { visible: true }, bmpDesc: { visible: true },
    bmpNumber: { texture: rank }, bmpFlower: { texture: suit },
    getCardFaceBaseTexture() {}, updateNewCardFace() { this.bmpFace2.visible = true; },
    SetCardFace() { this.bmpFace.texture = original; this.updateNewCardFace(); },
  });
  const uis = [...expectedCards, 'ShanShan', 'GuoZhanSha', 'Activity2026'].map(make);
  const registry = new CardStyleRegistry({
    window: { Laya: { Texture2D: class { loadImageSource() {} }, Texture: class { destroy() { this.destroyed = true; } } } },
    document: {}, game: { getSelfSeatUI: () => ({ cardContainer: { cardUis: uis } }) },
    settings: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) }, scope,
  });
  t.after(() => scope.dispose());
  registry.ensureAtlas = () => ({});
  // Even if a later sheet contains an extra frame, the plugin's exact whitelist owns the scope.
  registry.atlasCanvas = () => ({});
  let unregister;
  registerDafeiyuCardStyles({ cardStyles: { register: style => { unregister = registry.register(style, 'card-styles-extra'); } } });
  registry.selectSide('face', 'card-styles-extra.dafeiyu');
  for (const ui of uis.slice(0, expectedCards.length)) {
    assert.notEqual(ui.bmpFace.texture, original, ui.theCard.ResName);
    assert.equal(ui.bmpFace2.visible, false); assert.equal(ui.bmpName.visible, false);
    assert.equal(ui.bmpNumber.texture, rank); assert.equal(ui.bmpFlower.texture, suit);
  }
  for (const ui of uis.slice(expectedCards.length)) { assert.equal(ui.bmpFace.texture, original); assert.equal(ui.bmpName.visible, true); }
  const reused = uis[0]; reused.theCard.ResName = 'Activity2026'; reused.SetCardFace();
  assert.equal(reused.bmpFace.texture, original); assert.equal(reused.bmpName.visible, true);
  reused.theCard.ResName = 'MuNiuLiuMa'; reused.SetCardFace(); assert.notEqual(reused.bmpFace.texture, original);
  unregister(); unregister();
  for (const ui of uis) { assert.equal(ui.bmpFace.texture, original); assert.equal(ui.bmpName.visible, true); }
});
