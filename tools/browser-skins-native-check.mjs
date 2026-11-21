import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { zipSync, strToU8 } from 'fflate';
import { nativeWallpaperFixture } from './native-wallpaper-fixture.mjs';
import { makeMobileBootstrapLibrary, mobileBootstrapFixture } from '../tests/fixtures/mobile-config-bootstrap.js';
import { makeMobileConfigRelease } from '../tests/fixtures/mobile-config-release.js';

const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const clientPath = process.env.SGS_CLIENT_SOURCE || path.join(process.env.TEMP, 'sgs-client/game/sgsGame_a.sgs');
const skinAtlasFixture = process.env.SGS_SKIN_ATLAS_FIXTURE;
const skinAssets = skinAtlasFixture ? JSON.parse(await readFile(skinAtlasFixture, 'utf8')) : null;
const officialSeatDir = process.env.SGS_YJCM_SEAT_FIXTURES;
const officialPreviewDir = process.env.SGS_YJCM_PREVIEW_FIXTURES;
const officialFormDir = process.env.SGS_YJCM_FORM_FIXTURES;
const officialMotionDir = process.env.SGS_YJCM_MOTION_FIXTURES;
const mobileMotionZip = process.env.SGS_MOBILE_MOTION_FIXTURE && await readFile(process.env.SGS_MOBILE_MOTION_FIXTURE);
const client = await readFile(clientPath, 'utf8');
const extract = name => { const start = client.indexOf(`class ${name} extends`), end = client.indexOf('class ', start + 10); assert.ok(start >= 0 && end > start); return client.slice(start, end); };
const cii = extract('cii'), newPage = extract('_ii'), panelClass = extract('lk');
const { nativeMethod } = await nativeWallpaperFixture(clientPath);
const seatSkin = nativeMethod('Kjt', 'SetSkin');
const staticSkin = ['loadSkinComplete', 'playEffect', 'clearEffect', 'clearTempStaticSkin'].map(name => nativeMethod('Kjt', name));
const seatAudio = ['PlaySkillSound', 'PlaySkillHurtSound', 'PlayDeadSound', 'GetSkinStyleByGeneralID'].map(name => nativeMethod('Xas', name));
const mvpAudio = ['showMvpEgg', 'playRandomSound'].map(name => nativeMethod('O_s', name));
const seatSkillOwner = ['GetGeneralBySkillIdOnlyId', 'GetGeneralBySkillId', 'GetSkillFromWhichGeneral'].map(name => nativeMethod('Xas', name));
const seatFormTrigger = nativeMethod('Xas', 'OnChangeOriSkinBySkill');
const skillAudio = ['GetSoundUrl', 'SoundSkinID', 'getSkillSoundUrl'].map(name => nativeMethod('iZt', name));
const skinEffects = ['useCardAniPlay', 'playGeneralSpEffect', 'aniEventNew'].map(name => nativeMethod('zzt', name));
const roundEffects = ['playSkinRoundEffect', 'showSkinEffect', 'skinInWindowLoaded', 'clearSkinRoundEffect',
  'changeRoundEffctSkin', 'changeRoundPlayCompelte', 'addRoundEffectList'].map(name => nativeMethod('zzt', name));
const debutEffects = ['General_GradationChanged', 'RePlayDebutEffect', 'PlayDebutEffect', 'playRoundStart']
  .map(name => nativeMethod('zzt', name));
const selectorMethods = ['itemClick', 'closeSelectSure', 'destroy'].map(name => nativeMethod('XPt', name));
const selectGeneralClose = nativeMethod('r_s', 'Close');
const previewFactory = nativeMethod('Els', 'showGeneralTipHandler');
const previewLoadSkin = nativeMethod('tQi', 'loadSkin');
const generalSkinTitle = nativeMethod('Eei', 'initTitle');
const generalSkinCards = nativeMethod('Eei', 'showSkins');
const chatRowLayout = nativeMethod('gQt', 'layoutBottomButtonBar');
// Playwright can exercise audio playback without a connection to the official CDN.
const silentClip = Buffer.alloc(44 + 16000, 128);
silentClip.write('RIFF', 0); silentClip.writeUInt32LE(silentClip.length - 8, 4);
silentClip.write('WAVEfmt ', 8); silentClip.writeUInt32LE(16, 16);
silentClip.writeUInt16LE(1, 20); silentClip.writeUInt16LE(1, 22);
silentClip.writeUInt32LE(8000, 24); silentClip.writeUInt32LE(8000, 28);
silentClip.writeUInt16LE(1, 32); silentClip.writeUInt16LE(8, 34);
silentClip.write('data', 36); silentClip.writeUInt32LE(silentClip.length - 44, 40);
async function auditionFixture(filename) {
  const mp3 = officialPreviewDir && await readFile(path.join(officialPreviewDir, filename)).catch(() => null);
  return { headers: { 'access-control-allow-origin': '*' }, contentType: mp3 ? 'audio/mpeg' : 'audio/wav', body: mp3 || silentClip };
}
const bundle = await build({ stdin: { contents: `
  export { ResourceScope } from './src/core/resources.js';
  export { createMobileSkinDownload } from './src/core/mobile-skin-download.js';
  export { createNativeTheme } from './src/ui/native-theme.js';
  export { mountPluginUI } from './src/ui/plugin-ui.js';
  export { createPluginNative } from './src/core/plugin-native.js';
  export { enhanceSkinWindow, createNativeSkins } from './src/plugins/skins/native.js';
  export { createLocalSkins } from './src/plugins/skins/local.js';
  export { createYjcmCatalogue } from './src/plugins/skins/yjcm-catalogue.js';
  export { createPortraitCache } from './src/plugins/skins/portrait-cache.js';
  export { createMatchSkinSelector } from './src/plugins/skins/match-selector.js';
  export { createFormPicker } from './src/plugins/skins/form-picker.js';
  export { createYjcmPicker } from './src/plugins/skins/yjcm-picker.js';
  export { createGeneralSkinsEntry } from './src/plugins/skins/general-skins-entry.js';
  export { renderSkinPanel } from './src/plugins/skins/panel.js';
  export { setupSkinFixture, createSkinFixtureOwner, provideSkinChromeTextures, measureSkinButtons } from './tests/fixtures/skins-native-browser.js';
  import { createNativeTheme } from './src/ui/native-theme.js';
  import { mountPluginUI } from './src/ui/plugin-ui.js';
  import { createPluginNative } from './src/core/plugin-native.js';
  export function prepareSkinContext(ctx) {
    ctx.ui = { ...mountPluginUI(ctx, () => ctx), nativeTheme: createNativeTheme(ctx) };
    ctx.native = createPluginNative(ctx);
    return ctx;
  }
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'NativeSkinCheck' });
const output = path.resolve(process.env.SGS_SKINS_BROWSER_OUTPUT || 'test-results/skins');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const yjcmSource = JSON.parse(await readFile(new URL('../tests/fixtures/yjcm-source.json', import.meta.url), 'utf8'));
const errors = []; page.on('pageerror', error => errors.push(error.message));
function assertButtonPair([yjcm, mobile], surface) {
  assert.ok(mobile.left > yjcm.right, `${surface}: mobile follows Yjcm on the right`);
  assert.ok(Math.abs(mobile.top - yjcm.top) < 1 && Math.abs(mobile.bottom - yjcm.bottom) < 1,
    `${surface}: both buttons stay in one row with equal height`);
  assert.ok(yjcm.textFits && mobile.textFits, `${surface}: both labels fit`);
}
try {
  await page.route('https://skins-fixture.test/', route => route.fulfill({
    contentType: 'text/html', body: '<html><body style="margin:0;background:#151513"></body></html>',
  }));
  await page.goto('https://skins-fixture.test/');
  await page.addScriptTag({ path: engine }); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  if (officialMotionDir || mobileMotionZip) {
    for (const file of ['laya.ani.min.js', 'spine-core-4.0.min.js', 'laya.spine.min.js']) {
      await page.addScriptTag({ path: path.join(path.dirname(engine), file) });
    }
  }
  await page.evaluate(async assets => {
    NativeSkinCheck.setupSkinFixture();
    if (assets) await NativeSkinCheck.provideSkinChromeTextures(assets);
  }, skinAssets);
  await page.evaluate(source => { window.yjcmSourceFixture = source; }, yjcmSource);
  await page.addScriptTag({ content: `window.CapturedSkinPage=(${cii});window.CapturedNewSkinPage=(${newPage});window.CapturedSkinPanel=(${panelClass});window.capturedSetSkin=({${seatSkin}}).SetSkin;` });
  await page.addScriptTag({ content: `window.capturedStaticSkin={${staticSkin.join(',')}};` });
  await page.addScriptTag({ content: `window.capturedSeatAudio={${seatAudio.join(',')}};window.capturedMvpAudio={${mvpAudio.join(',')}};window.capturedSeatForms={${seatFormTrigger}};window.capturedSkillAudio={${skillAudio.join(',')}};window.capturedSkinEffects={${skinEffects.join(',')}};` });
  await page.addScriptTag({ content: `window.capturedSeatSkillOwner={${seatSkillOwner.join(',')}};` });
  await page.addScriptTag({ content: `window.capturedRoundEffects={${roundEffects.join(',')}};` });
  await page.addScriptTag({ content: `window.capturedDebutEffects={${debutEffects.join(',')}};` });
  await page.addScriptTag({ content: `window.capturedChatRowLayout=({${chatRowLayout}}).layoutBottomButtonBar;` });
  await page.addScriptTag({ content: `window.capturedPreviewFactory={${previewFactory}}.showGeneralTipHandler;window.capturedPreviewLoad={${previewLoadSkin}}.loadSkin;` });
  await page.evaluate(() => {
    NativeSkinCheck.createSkinFixtureOwner(); const f = skinFixture;
    f.originalForm = f.owner.formData;
    f.originalMaxChars = f.owner.searchView.searchInput.maxChars;
    f.originalBreakY = f.owner.breakSkinSp.y;
    f.enhancement = NativeSkinCheck.enhanceSkinWindow(f.ctx, f.owner);
  });
  const click = async name => {
    const point = await page.evaluate(name => {
      const root = skinFixture.owner.getChildByName('sgs-toolbox-skin-controls');
      const find = node => { if (node.name === name) return node; for (let i = 0; i < node.numChildren; i++) { const found = find(node.getChildAt(i)); if (found) return found; } };
      const node = find(root); if (!node) throw Error(name);
      const p = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2), true); return { x: p.x, y: p.y };
    }, name);
    await page.mouse.click(point.x, point.y);
  };
  const snapshot = () => page.evaluate(() => {
    const f = skinFixture, o = f.owner;
    const stats = o.getChildByName('sgs-toolbox-skin-controls').getChildByName('skin-summary')?.text;
    return { stats, selected: o.tabGroup.SelectedValue, isSearch: o.isSearch, searchVisible: o.searchView.visible, typeVisible: o.typeRadioBtn.visible,
      originals: o.panelItem.flatMap(p => p.skinVos).filter(r => r.isGeneral).length,
      ids: o.panelItem.flatMap(p => p.skinVos).filter(r => r.skinBaseVo).map(r => r.skinBaseVo.skinID),
      newIds: o.newView?.skinPanel._children.filter(n => n.data).map(n => n.data.skinID),
      gray: o.newView?.skinPanel._children.filter(n => n.data).map(n => [n.data.skinID, n.generalTex?.Gray]),
      group: f.enhancement.state.group, quality: f.enhancement.state.quality,
    };
  });
  const newTabBounds = () => page.evaluate(() => {
    const node = skinFixture.owner.getChildByName('sgs-toolbox-skin-controls').getChildByName('skin-category-tabs').getChildByName('skin-quality-new');
    const point = node.localToGlobal(new Laya.Point(0, 0), true);
    return { x: point.x, y: point.y, width: node.width, height: node.height };
  });
  assert.equal(await page.evaluate(()=>skinFixture.owner.getChildByName('sgs-toolbox-skin-controls').getChildByName('skin-background-only').visible),false);
  await page.evaluate(()=>{skinFixture.ctx.backgrounds={isInstalled:()=>true};skinFixture.skins[0].Is169=true;skinFixture.enhancement.check();});
  await click('skin-background-only');
  assert.equal(await page.evaluate(()=>skinFixture.enhancement.state.backgroundOnly),true);
  assert.equal(await page.evaluate(()=>skinFixture.owner.panelItem.flatMap(p=>p.skinVos).every(r=>r.skinBaseVo?.Is169||r.skinBaseVo?.IsBanner)),true);
  await page.screenshot({path:path.join(output,'background-filter.png')});
  await page.evaluate(()=>{skinFixture.ctx.backgrounds.isInstalled=()=>false;skinFixture.enhancement.check();});
  assert.equal(await page.evaluate(()=>skinFixture.enhancement.state.backgroundOnly),false);
  const initialNewTab = await newTabBounds();
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'country-header.png'), clip: { x: 86, y: 90, width: 1040, height: 66 } });
  await click('skin-country-2'); assert.equal((await snapshot()).selected, 2);
  assert.deepEqual(await newTabBounds(), initialNewTab);
  await click('skin-country-1');
  assert.equal((await snapshot()).typeVisible, false);
  assert.equal((await snapshot()).originals, 1);
  assert.equal((await snapshot()).searchVisible, false);
  await click('skin-search'); assert.equal((await snapshot()).searchVisible, true);
  await page.evaluate(() => { skinFixture.owner.searchView.text = '曹操'; skinFixture.owner.searchView.event('INPUT'); });
  let s = await snapshot(); assert.equal(s.selected, 1); assert.equal(s.isSearch, false); assert.equal(s.originals, 0); assert.ok(s.ids.length);
  await page.evaluate(() => { skinFixture.owner.searchView.text = ''; skinFixture.owner.searchView.event('INPUT'); });
  await click('skin-search');
  await click('skin-group');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'skin-group-country');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'skin-group-quality');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'skin-group');
  s = await snapshot(); assert.equal(s.group, 'quality'); assert.equal(s.originals, 0); assert.equal(s.quality, 0);
  assert.deepEqual(await newTabBounds(), initialNewTab, 'category switch keeps identical new-tab anchor and dimensions');
  assert.ok(s.ids.length); assert.ok(s.ids.every(id => [10101, 10202, 10303, 10404, 10106].includes(id)));
  await page.waitForTimeout(30);
  const cardPoint = await page.evaluate(() => {
    const card = skinFixture.owner.panelItem[0].getChildAt(0);
    const p = card.localToGlobal(new Laya.Point(35, 70), true); return { x: p.x, y: p.y };
  });
  await page.mouse.click(cardPoint.x, cardPoint.y);
  assert.equal(await page.evaluate(() => skinFixture.clicks), 1, 'native card click remains reachable below the controls layer');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => skinFixture.owner.panelItem[0].y), 8, 'quality cards start at the top without a duplicate heading');
  assert.equal(await page.evaluate(() => skinFixture.owner.skinPanel._children.some(node => node.ordinaryQualityTexture || node.nativeQualityTexture || node.getChildByName?.('quality-badge-art'))), false);
  await page.screenshot({ path: path.join(output, 'quality.png') });
  await page.screenshot({ path: path.join(output, 'ordinary-header.png'), clip: { x: 390, y: 156, width: 410, height: 72 } });
  await click('skin-quality-3'); s = await snapshot(); assert.equal(s.quality, 3); assert.ok(s.ids.includes(10401));
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'quality-legend.png') });
  await page.screenshot({ path: path.join(output, 'polished-header.png'), clip: { x: 86, y: 96, width: 1040, height: 130 } });
  await click('skin-quality-4'); await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'limited-header.png'), clip: { x: 86, y: 96, width: 1040, height: 130 } });
  await click('skin-quality-3');
  assert.equal(await page.evaluate(() => skinFixture.owner.panelItem[0].y), 8);
  await page.screenshot({ path: path.join(output, 'quality-no-title.png') });
  await click('skin-owned'); await click('skin-missing');
  assert.match((await snapshot()).stats, /筛选 0 款/);
  await page.evaluate(() => {
    const panel = skinFixture.owner.skinPanel;
    panel.vScrollBar.value = 500; panel.UpdateDrawContent();
    panel.vScrollBar.value = 0; panel.UpdateDrawContent(); panel.virtualDraw(null);
  });
  await click('skin-owned'); await click('skin-missing');
  await click('skin-dynamic');
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'filters.png') });
  await click('skin-dynamic-type-unlock'); await click('skin-dynamic-ownership-missing'); await click('skin-dynamic-method-crystalOnly'); await click('skin-dynamic-materials-crystalMissing');
  assert.deepEqual((await snapshot()).ids.sort(), await page.evaluate(() => [skinFixture.skins[18].skinID].sort()), 'crystal-only filter excludes the cinnabar-capable subset');
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'polished-filters.png'), clip: { x: 466, y: 250, width: 660, height: 536 } });
  await click('skin-dynamic-method-cinnabar');
  assert.equal((await snapshot()).ids.length, 2, 'methods are OR within their group');
  await click('skin-dynamic-type-innate');
  assert.deepEqual((await snapshot()).ids.sort(), await page.evaluate(() => [skinFixture.skins[13].skinID, skinFixture.skins[18].skinID].sort()), 'innate types still must satisfy other selected groups');
  await page.mouse.click(10, 10);
  await click('skin-dynamic'); await click('skin-dynamic-all'); await page.mouse.click(10, 10);
  await click('skin-quality-new');
  await page.waitForTimeout(80);
  s = await snapshot(); assert.equal(s.selected, 99);
  assert.ok(s.gray.some(([id, gray]) => id === 10101 && gray === true));
  assert.ok(s.gray.some(([id, gray]) => id === 10201 && gray === false));
  const order = await page.evaluate(() => skinFixture.owner.newView.skinPanel._children.filter(n => n.data).map(n => ({ id: n.data.skinID, y: n.y, discount: n.isDiscount })));
  assert.deepEqual(order.slice(0, 7).map(x => x.id), await page.evaluate(() => skinFixture.skins.slice(0, 7).map(s => s.skinID)));
  assert.equal(order[7].id, await page.evaluate(() => skinFixture.skins[1].skinID));
  assert.equal(order[9].discount, true);
  assert.match(s.stats, /筛选 8 款/);
  await page.evaluate(() => {
    const panel = skinFixture.owner.newView.skinPanel;
    panel.vScrollBar.value = 650; panel.UpdateDrawContent();
    panel.vScrollBar.value = 0; panel.UpdateDrawContent();
  });
  await page.screenshot({ path: path.join(output, 'new.png') });
  const skinIdsForCraft = await page.evaluate(() => skinFixture.skins.filter(s => s.ComfromGoodsInfo).map(s => s.skinID));
  await click('skin-craft'); await page.screenshot({ path: path.join(output, 'craft-filter.png') });
  await click('skin-craft-yes');
  assert.ok((await snapshot()).newIds.every(id => skinIdsForCraft.includes(id)));
  await click('skin-craft'); await click('skin-craft-all');
  await click('skin-read-all'); await page.waitForTimeout(130);
  assert.deepEqual(await page.evaluate(() => skinFixture.ctx.settings.get('readRecent:1001', [])), await page.evaluate(() => skinFixture.gsm.skinNewList));
  assert.equal(await page.evaluate(() => skinFixture.owner.newView.skinPanel._children.some(n => n.getChildAt?.(0)?.text === '新获得')), false);
  await click('skin-missing'); await page.waitForTimeout(40);
  assert.ok((await snapshot()).gray.every(([, gray]) => gray === false));
  await click('skin-missing');
  await page.evaluate(() => { skinFixture.ready = false; skinFixture.enhancement.check(); });
  assert.match((await snapshot()).stats, /尚未加载完成/);
  await page.evaluate(() => { skinFixture.ready = true; skinFixture.accountId = 2002; skinFixture.inventory.clear(); skinFixture.enhancement.check(); });
  assert.match((await snapshot()).stats, /已有 0 款/);
  await page.evaluate(() => { skinFixture.enhancement.dispose(); });
  assert.equal(await page.evaluate(() => skinFixture.owner.formData === skinFixture.originalForm), true);
  assert.equal(await page.evaluate(() => Boolean(skinFixture.owner.getChildByName('sgs-toolbox-skin-controls'))), false);
  assert.equal(await page.evaluate(() => skinFixture.owner.searchView.x), 670);
  assert.equal(await page.evaluate(() => skinFixture.owner.tabGroup.visible), true);
  assert.equal(await page.evaluate(() => skinFixture.owner.breakSkinSp.y === skinFixture.originalBreakY), true);
  assert.equal(await page.evaluate(() => skinFixture.owner.searchView.searchInput.maxChars === skinFixture.originalMaxChars), true);
  assert.deepEqual(errors, []);
  // Attach through stage discovery, close/reopen, then replace a cached window.
  await page.evaluate(() => {
    skinFixture.controllerContext = NativeSkinCheck.prepareSkinContext(skinFixture.ctx);
    skinFixture.controller = NativeSkinCheck.createNativeSkins(skinFixture.controllerContext);
  });
  assert.match(await page.evaluate(() => skinFixture.controller.getStatus()), /已接入/);
  await page.evaluate(() => { skinFixture.ctx.settings.set('advanced', false); skinFixture.controller.check(); });
  assert.equal(await page.evaluate(() => skinFixture.owner.formData === skinFixture.originalForm && skinFixture.owner.tabGroup.visible), true);
  await page.evaluate(() => { skinFixture.ctx.settings.set('advanced', true); skinFixture.controller.check(); });
  assert.match(await page.evaluate(() => skinFixture.controller.getStatus()), /已接入/);
  await page.evaluate(() => { skinFixture.owner.visible = false; skinFixture.controller.check(); skinFixture.owner.visible = true; skinFixture.controller.check(); });
  assert.equal(await page.evaluate(() => skinFixture.owner._children.filter(n => n.name === 'sgs-toolbox-skin-controls').length), 1);
  await page.evaluate(() => { skinFixture.owner.removeSelf(); NativeSkinCheck.createSkinFixtureOwner(); skinFixture.controller.check(); });
  assert.equal(await page.evaluate(() => skinFixture.owner._children.filter(n => n.name === 'sgs-toolbox-skin-controls').length), 1);
  await page.evaluate(() => {
    const enhanced = skinFixture.owner.formData;
    skinFixture.laterCalls = 0;
    skinFixture.owner.formData = function (...args) { skinFixture.laterCalls++; return enhanced.apply(this, args); };
    skinFixture.controllerContext.scope.dispose(); skinFixture.ctx.scope.dispose();
    skinFixture.owner.tabGroup.SelectedValue = 1; skinFixture.owner.formData();
  });
  assert.equal(await page.evaluate(() => skinFixture.laterCalls), 1);
  assert.equal(await page.evaluate(() => Boolean(skinFixture.owner.getChildByName('sgs-toolbox-skin-controls'))), false);
  // Public method metadata can arrive late without turning missing crystals
  // into "no crystal method", and cannot recreate UI after the attachment stops.
  await page.evaluate(() => {
    const f = skinFixture; f.owner.destroy(true); NativeSkinCheck.createSkinFixtureOwner();
    f.skins[1].UpdateInfo = undefined; f.skins[1].skinlevel = '0,1';
    f.ctx.game.getConfigData = () => null;
    f.ctx.game.loadConfigData = () => new Promise(resolve => { f.finishCatalogue = resolve; });
    f.catalogueAttachment = NativeSkinCheck.enhanceSkinWindow(f.ctx, f.owner);
    Object.assign(f.catalogueAttachment.state, { group: 'quality', quality: 1 });
    f.catalogueAttachment.state.dynamic.method = ['crystalOnly']; f.catalogueAttachment.refresh(false);
  });
  await page.waitForFunction(() => typeof skinFixture.finishCatalogue === 'function');
  const idsWithMetadata = () => page.evaluate(() => skinFixture.owner.panelItem.flatMap(p => p.skinVos).map(row => row.skinBaseVo?.skinID));
  const dualId = await page.evaluate(() => skinFixture.skins[1].skinID);
  assert.equal((await idsWithMetadata()).includes(dualId), false);
  await page.evaluate(() => skinFixture.finishCatalogue(skinFixture.crystalConfig));
  await page.waitForFunction(id => skinFixture.owner.panelItem.some(p => p.skinVos.some(row => row.skinBaseVo?.skinID === id)), dualId);
  await page.evaluate(() => {
    const f = skinFixture; f.catalogueAttachment.dispose(); f.ctx.scope.dispose(); f.owner.destroy(true); NativeSkinCheck.createSkinFixtureOwner();
    f.finishCatalogue = null; f.ctx.game.getConfigData = () => null;
    f.ctx.game.loadConfigData = () => new Promise(resolve => { f.finishCatalogue = resolve; });
    f.catalogueAttachment = NativeSkinCheck.enhanceSkinWindow(f.ctx, f.owner);
  });
  await page.waitForFunction(() => typeof skinFixture.finishCatalogue === 'function');
  await page.evaluate(() => { skinFixture.catalogueAttachment.dispose(); skinFixture.ctx.scope.dispose(); skinFixture.finishCatalogue(skinFixture.crystalConfig); });
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => Boolean(skinFixture.owner.getChildByName('sgs-toolbox-skin-controls'))), false);
  // Local file decode, GPU texture drawing and restoration on the Laya canvas.
  assert.deepEqual(await page.evaluate(async () => {
    const general = { CardId: 101, CardName: '演练武将', SkinId: 10101, IsDynamic: false, JueXingState: 2 };
    const avatar = new Laya.Sprite(); avatar.size(130, 180); avatar.pos(1020, 620);
    avatar.generalCard = general; avatar.SetSkin = window.capturedSetSkin;
    const original = { skinID: 10101, skinlevel1: () => 4, SeatAnimateUrl: 'res/current.sk', SkinUrlInTip: 'res/current-tip.png', ResType: 2, NewSkinJudge: true,
      SpellEffectData: [{ id: 9001, type: 1 }], spellEffectAnimUrl: () => 'old', GetSkinSkillGeneralUrl: () => 'old-awaken.png' };
    const animated = { skinID: 10102, skinlevel1: () => 3, SeatAnimateUrl: 'res/fixture.sk', SkinUrlInTip: 'res/local-tip.png',
      ResType: 2, NewSkinJudge: true,
      IsManyStateDyskin: true, SkinSeatUrlJueXing: () => 'res/fixture.png',
      SpellEffectData: [{ id: 9001, type: 1 }], spellEffectAnimUrl: () => 'new' };
    const aige = { ...animated, skinID: 66103, NewSkinJudge: 2, ConMessage: '发动哀歌转换形态',
      DynamicSkinBigSkeletonUrlNew: form => 'res/66103_' + form };
    const deputySkin = { skinID: 10201, skinlevel1: () => 3, ShowEffectUrl: 'res/deputy-entry.sk' };
    const skins = [original, animated, aige, deputySkin];
    window.ZJt.I = () => ({
      GetGeneralSkinBySkinID: id => skins.find(vo => vo.skinID === id),
      GetOriSkinMulModeVoBySkillContext: () => '', GetOriSkinMulModeVoByImageId: () => null,
      GetSpecialSkinById: () => null,
    });
    window.kCt = { ResType_Spine: 3, ResType_Spine_AllBig: 4 };
    window.Kjt = { AVATAR_MAX_WIDTH: 130 }; window.hi = { top: 1 };
    window.E$t = class extends Laya.Sprite {
      get EffectUrl() { return this.url; }
      InitEffect(url) { this.url = url; }
      playEffect() { this.played = true; }
    };
    Object.assign(avatar, { skinItemID: 10101, clearMaskTween() {}, clearTempStaticSkin() {}, clearEffect() {}, getXline: () => 0,
      removeSkeleton() { this.skeleton?.destroy(); this.skeleton = null; },
      loadStatic(vo) { this.drawnSkin = vo.skinID; this.drawnForm = this.generalCard.JueXingState; } });
    avatar.skinTex = new Laya.Sprite();
    avatar.skinTex.graphics.drawRect(0, 0, 130, 180, '#766840');
    avatar.addChild(avatar.skinTex); Laya.stage.addChild(avatar);
    const sound = [], effects = [];
    window.V2t = { IsInGame: true, SceneRightWidth: 0 };
    window.hZt = { I: () => ({ SoundSets: { SkinSoundOverlap: true } }) };
    window.FH = { I: () => ({ GetGeneralSkillSound: (id, skin, spell, voice, huashen, form) => [skin, form] }) };
    window.M$t = { I: () => ({ GetSeatGeneralVoiceUrl: () => '' }) };
    window.ID = { PlaySkillSound: url => sound.push(url) };
    window.Xmt = { SHA: 1 };
    window._1t = { GetInstance: () => ({ FirstSkillId: Xmt.SHA }) };
    window.KG = { NEW_SKIN_PLAY_TYPE_sha: 'attack', NEW_SKIN_PLAY_TYPE_skill: 'skill' };
    window.Kb = { ...window.Kb, SKIN_LV3: 3 };
    window.LKi = { I: () => Laya.stage };
    const roundLoads = [];
    window.mNt = { GetResByUrl(url, caller, callback, _type, quality) {
      roundLoads.push({ url, finish: texture => callback.call(caller, texture, url, quality) });
    } };
    const seat = Object.assign(new Laya.EventDispatcher(), capturedSeatAudio, capturedSeatForms, {
      General: general, GeneralId: 101, IsSelf: true,
      GetGeneralBySkillIdOnlyId: () => general, GetSkillFromWhichGeneral: () => general,
      GetSeatState: () => null, oriSkinSkillCountCacheDict: { getNumberKey: () => 0, addNumberKey() {} },
    });
    window.zf = { DATA_JUEJUE2: 1 };
    Object.defineProperties(seat, {
      SkinID: { configurable: true, get: () => general.SkinId },
      SkinItemID: { configurable: true, get: () => general.SkinId },
    });
    const skill = { ...capturedSkillAudio, ID: 9001, IsGeneral: true, SoundGeneralID: () => general.CardId,
      DealSkinSkillEffect: () => null, DealSkinSkillEffectShowAndLayer: () => null };
    const roundLayer = Laya.stage.addChild(new Laya.Sprite());
    const ui = { ...capturedSkinEffects, ...capturedRoundEffects, seat, seatAvatar: avatar, playingNewSpEffect: {},
      skinRoundEffectList: [], effectSprite: avatar, unscaledWidth: 130, unscaledHeight: 180,
      get maxSeatSkinVO() { return seat.MaxSkinVO ?? skins.find(skin => skin.skinID === seat.SkinID); },
      addRuntimeResRecord() {},
      getEffectType: () => new E$t(),
      addGameSceneEffect: effect => roundLayer.addChild(effect),
      interruptPlayingNewSpEffect() { this.playingNewSpEffect = null; effects.push(['stopped']); },
      onPlayNewSpEffect(type) {
        if (!seat.General.IsDynamic) return;
        effects.push([type, seat.SkinItemID]);
        if (seat.SkinItemID === 66103) {
          this.playingNewSpType = type;
          this.playingSkinVo = aige;
          this.playingNewSpEffect = {};
          effects.at(-1).push(seat.DySkinType);
        }
      },
      generalSpEffectStop1(_event, _skill, url) { effects.push(['second-stage', url]); },
      skinHasXDJXSkill(skill) { return skill.ID > 0; },
      skinSkillAnimStopped() { this.skinSkillGeneralUrl = this.skinSkillTxtUrl = ''; },
      loadSkinHasSkillComplete() { effects.push(['awaken']); },
      ddzGongJiImgLoaded(texture) { effects.push(['ddz', texture]); },
    };
    window.cAt = { gameWidth: 1200, gameHeight: 850 };
    const previewTextures = new Map(['res/current-tip.png', 'res/local-tip.png'].map((url, index) => {
      const source = document.createElement('canvas');
      source.width = 185; source.height = 326;
      const g = source.getContext('2d'); g.fillStyle = index ? '#426985' : '#736348';
      g.fillRect(0, 0, source.width, source.height);
      const bitmap = new Laya.Texture2D(source.width, source.height);
      bitmap.loadImageSource(source);
      const texture = new Laya.Texture(bitmap);
      texture.url = url;
      return [url, texture];
    }));
    window.tQi = class extends Laya.Sprite {
      constructor() {
        super();
        this.name = 'GameGeneralToolTip'; this.size(501, 326);
        const head = this.generalHead = new Laya.Sprite();
        Object.defineProperty(head, 'skin', {
          get: () => head.sourceUrl ?? '',
          set: url => { head.sourceUrl = url; head.texture = previewTextures.get(url) ?? null; },
        });
        this.addChild(head);
        const panel = this.contentContainer = new Laya.Sprite();
        panel.pos(118, 49); panel.size(383, 302);
        panel.graphics.drawRect(0, 0, panel.width, panel.height, 'rgba(26, 23, 19, .90)', '#766247');
        const copy = new Laya.Text(); copy.text = '演练武将 · 技能说明'; copy.pos(14, 12); copy.fontSize = 18; copy.color = '#efe5d0';
        panel.addChild(copy);
        const skills = new Laya.Text(); skills.text = '西向\n出牌阶段各限一次，你可以将牌当【杀】或【决斗】使用。\n\n哀歌\n觉醒技，一回合内第二次有角色进入濒死状态后触发。';
        skills.pos(14, 47); skills.width = 355; skills.wordWrap = true;
        skills.fontSize = 16; skills.leading = 8; skills.color = '#e4d5a0'; panel.addChild(skills);
        this.addChild(panel);
        this.loadSkin = capturedPreviewLoad;
      }
      ShowToolTip(playerSeat, general, skinItemID) {
        Object.assign(this, { playerSeat, general, skinItemID });
        this.loadSkin();
      }
    };
    const mask = new Laya.Sprite();
    mask.size(130, 180); mask.mouseEnabled = true;
    const topManager = ui.otherTopManager = { overMask: mask, seat, isZhu: true, getTipGeneral: () => seat.General };
    const originalTip = mask.toolTip = capturedPreviewFactory.bind(topManager);
    mask.on(Laya.Event.ROLL_OVER, mask, () => {
      mask.openTip = mask.toolTip();
      if (mask.openTip) Laya.stage.addChild(mask.openTip);
    });
    mask.on(Laya.Event.ROLL_OUT, mask, () => { mask.openTip?.destroy(); mask.openTip = null; });
    avatar.addChild(mask);
    avatar.canShowDyNamic = () => avatar.generalCard.IsDynamic;
    seat.on('USE_CARD', ui, ui.useCardAniPlay);
    function play() {
      seat.PlaySkillSound(skill);
      seat.event('USE_CARD', [1, 1]);
      ui.playGeneralSpEffect({}, skill);
    }
    const scene = {}, scope = new NativeSkinCheck.ResourceScope();
    scope.add(() => roundLayer.destroy(true));
    const { settings } = skinFixture.ctx; settings.set('crossServer', true);
    settings.set('unlockDynamic', true);
    const manager = { GetOnlineSKinList: () => skins, GetSkinListBySkinID: () => [] };
    const spells = { GameSpells: { spell: [
      { a: 3564, c: '西向' }, { a: 3565, c: '哀歌', b: '3,4,5,6,23' }, { a: 3566, c: '逐北' },
    ] } };
    const game = { getScene: () => scene, getSeatUIs: () => [ui], isInGame: () => true, getClass: () => manager,
      getConfigData: key => key === 'cha_spell' ? spells : null };
    const local = NativeSkinCheck.createLocalSkins(NativeSkinCheck.prepareSkinContext({ window, document, scope, game, settings }));
    const canvas = document.createElement('canvas'); canvas.width = 130; canvas.height = 180;
    const art = canvas.getContext('2d'); art.fillStyle = '#31675c'; art.fillRect(0, 0, 130, 180);
    art.fillStyle = '#b9d2ad'; art.fillRect(25, 55, 80, 70);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const [target] = local.refresh();
    const automatic = avatar.drawnSkin === 10101 && avatar.skeleton?.played && avatar.skeleton.url === 'res/current.sk';
    settings.set('unlockSkin', true);
    ui.playSkinRoundEffect();
    const previousRound = roundLoads.shift();
    local.select(target, 10102);
    previousRound.finish(previewTextures.get(original.SkinUrlInTip));
    if (roundLayer.numChildren) throw Error('使用本地原生皮肤时，晚到的旧皮肤入场特效被挂到场景');
    await Promise.resolve();
    ui.playSkinRoundEffect();
    const selectedRound = roundLoads.shift();
    if (selectedRound?.url !== animated.SkinUrlInTip) throw Error('本地原生皮肤的入场特效仍使用原皮肤');
    selectedRound.finish(previewTextures.get(animated.SkinUrlInTip));
    if (!ui.skinRoundEffect?.played || roundLayer.numChildren !== 1) throw Error('新选中的原生皮肤无法播放入场特效');
    ui.clearSkinRoundEffect();
    play();
    if (JSON.stringify(sound) !== JSON.stringify([[10102, 1]]) ||
        JSON.stringify(effects) !== JSON.stringify([['stopped'], ['attack', 10102], ['skill', 10102]])) {
      throw Error('本地皮肤的音效与特效未同时切换 ' + JSON.stringify({ sound, effects }));
    }
    const dynamic = avatar.drawnSkin === 10102 && avatar.skeleton?.played && general.JueXingState === 2 && general.SkinId === 10101 && !general.IsDynamic;
    settings.set('unlockDynamic', false); local.refresh();
    play();
    if (sound.at(-1)?.[0] !== 10102 || effects.length !== 3) throw Error('静态本地皮肤仍播放旧特效或语音');
    const staticOverride = avatar.drawnSkin === 10102 && avatar.skeleton === null;
    local.reset(target);
    play();
    if (sound.at(-1)?.[0] !== 10101 || seat.PlaySkillSound !== capturedSeatAudio.PlaySkillSound ||
        !seat.hasListener('USE_CARD')) throw Error('恢复原生皮肤后，语音或座位监听未恢复');
    const restored = avatar.drawnSkin === 10101 && avatar.skeleton === null;
    general.CardId = seat.GeneralId = 661;
    settings.set('unlockDynamic', true);
    const [spCaoCao] = local.refresh();
    local.select(spCaoCao, 66103);
    seat.OnChangeOriSkinBySkill(661, 3564); // 西向
    seat.OnChangeOriSkinBySkill(662, 3565); // 另一武将
    if (avatar.drawnForm !== 1) throw Error('英桀虎变过早切换形态');
    seat.OnChangeOriSkinBySkill(661, 3565); // 哀歌确认发动
    if (avatar.drawnForm !== 2 || JSON.stringify(effects.at(-1)) !== JSON.stringify([4, 66103, 2])) {
      throw Error('哀歌未切换为英桀虎变第二形态');
    }
    ui.aniEventNew(0, '', { name: 'Bshow' }); // local transition must not dispatch a global awakening event
    seat.OnChangeOriSkinBySkill(661, 3565);
    play();
    ui.playingNewSpEffectEvent = {};
    ui.aniEventNew(0, '', { name: 'Skill' });
    if (JSON.stringify(sound.at(-1)) !== JSON.stringify([66103, 2]) ||
        JSON.stringify(effects.slice(-3)) !== JSON.stringify([
          ['attack', 66103, 2], ['skill', 66103, 2], ['second-stage', 'res/66103_2/jineng02.json'],
        ])) throw Error('英桀虎变第二形态的语音或特效来源错误');
    if (general.SkinId !== 10101 || general.JueXingState !== 2 || general.IsDynamic) throw Error('改写了原生武将数据');
    local.reset(spCaoCao);
    local.select(spCaoCao, 66103);
    if (avatar.drawnForm !== 2 || effects.filter(([kind]) => kind === 4).length !== 1) throw Error('重新选择后丢失觉醒形态或重播转场');
    local.reset(spCaoCao);
    general.CardId = seat.GeneralId = 101;
    settings.set('unlockDynamic', false);
    const file = new File([blob], 'fixture.png', { type: 'image/png' });
    const pending = [];
    const originalZjt = window.Zjt;
    const removeSkeleton = avatar.removeSkeleton;
    window.Zjt = class extends Laya.Sprite {
      CreateSpineEffectNew() {
        this.SpineRole = { getCrtNameOrIndex: () => 'ChuChang' };
        pending.push('entry');
      }
      CreateSpineEffectNewDaiJi() {
        this.SpineRole = { getCrtNameOrIndex: () => 'DaiJi' };
        pending.push('idle');
      }
      OnAddShowEvent() {}
    };
    avatar.removeSkeleton = function () {
      removeSkeleton.call(this);
      this.skinBigSps?.destroy();
      this.skinBigSps = null;
    };
    avatar.OnCheckDySkinJuexing = () => pending.push('transition');
    avatar.onPreLoadDyRes = () => {};
    Object.assign(original, { ResType: 3, NewJudgeSkinID: () => 10101, DynamicSkinBigSkeletonUrlNew: () => 'res/10101' });
    general.IsDynamic = true;
    avatar.SetSkin(10101, avatar.x, '', 0, 1, false);
    const entrance = avatar.skinBigSps;
    const deputy = new Laya.Sprite();
    deputy.size(130, 180);
    deputy.generalCard = { CardId: 102, SkinId: 10201 };
    deputy.SetSkin = () => {};
    deputy.skinTex = deputy.addChild(new Laya.Sprite());
    seat.General2 = deputy.generalCard;
    seat.General2Id = 102;
    ui.seatAvatarFu = deputy;
    let maxSeatSkin = original;
    Object.defineProperties(seat, {
      Skin2ID: { configurable: true, get: () => seat.General2?.SkinId ?? 0 },
      MaxSkinVO: { configurable: true, get() { return maxSeatSkin; } },
    });
    seat.GetGeneralBySkillId = id => id === 9001 ? general : deputy.generalCard;
    const deputyTarget = local.refresh().find(target => target.deputy);
    await local.importPortrait(deputyTarget, file);
    seat.event('USE_CARD', [1, 1]);
    if (ui.skinHasXDJXSkill({ ID: 9002 }) || !ui.skinHasXDJXSkill(skill) || effects.at(-1)?.[0] !== 'attack' ||
        entrance.destroyed) throw Error('副将外服立绘误屏蔽主将皮肤，或未屏蔽副将专属觉醒演出');
    local.reset(deputyTarget);
    original.ShowEffectUrl = 'res/original-entry.sk';
    ui.playSkinRoundEffect();
    const playingRound = ui.spSkinRoundEffect;
    if (!playingRound?.played) throw Error('原生皮肤的自带入场特效未进入播放');
    delete original.ShowEffectUrl;
    ui.playSkinRoundEffect();
    const pendingRound = roundLoads.shift();
    if (pendingRound?.url !== original.SkinUrlInTip) throw Error('原生皮肤的入场贴图未进入异步加载');
    ui.addRoundEffectList();
    const playingRoundIndicator = ui.skinRoundEffectList[0];
    Object.assign(ui, { playingNewSpEffect: {}, needPlayChange: true,
      skinSkillGeneralUrl: 'old-awaken.png', skinSkillTxtUrl: 'old-text.png' });
    const result = await local.importPortrait(target, file);
    if (!entrance.destroyed || ui.playingNewSpEffect || ui.needPlayChange || ui.skinSkillGeneralUrl) {
      throw Error('应用外服立绘后，原皮肤的进行中入场、转场或觉醒演出未清理');
    }
    if (!playingRound.destroyed || !playingRoundIndicator?.destroyed || roundLayer.numChildren || ui.skinRoundEffectList.length) {
      throw Error('外服立绘未清理旧皮肤的场景入场特效和回合提示');
    }
    pendingRound.finish(previewTextures.get(original.SkinUrlInTip));
    if (roundLayer.numChildren) throw Error('晚到的原皮肤入场特效被挂到场景');
    await Promise.resolve();
    if (ui.skinRoundEffect) throw Error('晚到的原皮肤入场特效未清理');
    ui.playSkinRoundEffect();
    if (roundLoads.length || roundLayer.numChildren) throw Error('主将已换肤，原皮肤仍请求入场特效');
    original.ShowEffectUrl = 'res/original-entry.sk';
    capturedRoundEffects.showSkinEffect.call(ui, original.ShowEffectUrl, original.ResType);
    if (roundLayer.numChildren) throw Error('已被客户端捕获的原皮肤专属入场仍被挂到场景');
    await Promise.resolve();
    if (ui.spSkinRoundEffect) throw Error('迟到的原皮肤专属入场特效未清理');
    delete original.ShowEffectUrl;
    maxSeatSkin = deputySkin;
    ui.playSkinRoundEffect();
    if (!ui.spSkinRoundEffect?.played || ui.spSkinRoundEffect.url !== deputySkin.ShowEffectUrl || roundLoads.length) {
      throw Error('主将换肤后，原本应播放的副将入场特效被禁用');
    }
    ui.clearSkinRoundEffect();
    deputy.destroy(true);
    seat.General2 = seat.General2Id = ui.seatAvatarFu = null;
    maxSeatSkin = original;
    // The callback reference was captured before the portrait was installed.
    // This is the native static form-change branch used by older skins.
    window.gO = Laya.Sprite;
    Object.assign(avatar, { needShowChangeAni: true, maskRect: new Laya.Rectangle(),
      oldTexture: previewTextures.get('res/current-tip.png') });
    const nativeFlash = { ...capturedStaticSkin, onPlayEffectComplete() {}, onEffectComplete() { this.clearEffect(); } };
    // Install/restore the real native methods through the portrait lifecycle.
    local.reset(target);
    Object.assign(avatar, nativeFlash);
    const oldTexture = avatar.oldTexture;
    await local.importPortrait(target, file);
    capturedStaticSkin.loadSkinComplete.call(avatar, previewTextures.get('res/local-tip.png'));
    if (avatar.changSkinEffect || avatar.tempStaticSkin || avatar.skinTex.visible) throw Error('异步静态形态切换仍播放换肤火线');
    const count = effects.length;
    seat.event('USE_CARD', [1, 1]);
    ui.loadSkinHasSkillComplete();
    if (ui.playGeneralSpEffect({}, skill) !== false || ui.skinHasXDJXSkill(skill) || effects.length !== count) {
      throw Error('应用外服立绘后，仍播放原皮肤的技能或攻击特效');
    }
    ui.ddzGongJiImgLoaded('original-texture');
    if (effects.at(-1)?.[1] !== null) throw Error('通用攻击演出仍带原皮肤贴图');
    avatar.SetSkin(10101, avatar.x, '', 0, 2);
    if (pending.join() !== 'entry,idle,idle' || avatar.skinBigSps.visible || avatar.drawnForm !== 2) {
      throw Error('原皮肤形态更新仍触发入场音效或转场');
    }
    local.reset(target);
    ui.playSkinRoundEffect();
    roundLoads.shift()?.finish(previewTextures.get(original.SkinUrlInTip));
    if (!ui.skinRoundEffect?.played || !ui.skinRoundEffect.url.endsWith('/pifuchuchang2.sk')) {
      throw Error('恢复原皮肤后，原生入场特效未恢复');
    }
    ui.clearSkinRoundEffect();
    capturedStaticSkin.loadSkinComplete.call(avatar, oldTexture);
    if (!avatar.changSkinEffect?.played || avatar.changSkinEffect.url !== 'res/assets/animate/game/huanfu/huanfu1.sk') {
      throw Error('恢复原皮肤后，静态换肤动画未恢复');
    }
    avatar.clearTempStaticSkin();
    avatar.clearEffect();
    avatar.oldTexture = null;
    avatar.needShowChangeAni = false;
    avatar.SetSkin(10101, avatar.x, '', 0, 1);
    seat.event('USE_CARD', [1, 1]);
    if (pending.at(-1) !== 'transition' || effects.at(-1)?.[0] !== 'attack' || avatar.SetSkin !== capturedSetSkin ||
        !ui.skinHasXDJXSkill(skill) || !ui.playGeneralSpEffect({}, skill)) throw Error('恢复原皮肤后，原生特效未恢复');
    general.IsDynamic = false;
    avatar.SetSkin(10101, avatar.x, '', 0, 1, false, false);
    original.ResType = 2;
    window.Zjt = originalZjt;
    avatar.removeSkeleton = removeSkeleton;
    await local.importPortrait(target, file);
    window.localPortraitFixture = { avatar, local, target, scope, mask, originalTip };
    return [automatic, dynamic, staticOverride, restored, result, avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-portrait')), general.SkinId];
  }), [true, true, true, true, true, false, true, 10101]);
  await page.screenshot({ path: path.join(output, 'local-portrait.png') });
  await page.mouse.move(1030, 630);
  await page.waitForFunction(() => localPortraitFixture.mask.openTip?.generalHead.texture?.width === 130);
  assert.deepEqual(await page.evaluate(() => {
    const { mask, target } = localPortraitFixture;
    return [mask.openTip.generalHead.skin, mask.openTip.skinItemID, target.general.SkinId, mask.openTip.numChildren];
  }), ['', 10101, 10101, 2]);
  await page.screenshot({ path: path.join(output, 'local-portrait-hover.png') });
  assert.equal(await page.evaluate(() => {
    const { local, target, mask } = localPortraitFixture;
    local.reset(target);
    return mask.openTip.generalHead.skin;
  }), 'res/current-tip.png');
  await page.mouse.move(995, 605);
  await page.waitForFunction(() => !localPortraitFixture.mask.openTip);
  await page.evaluate(() => localPortraitFixture.local.select(localPortraitFixture.target, 10102));
  // Laya drops mouse moves less than 10 ms apart, even if it has processed
  // the earlier move and closed the tooltip.
  await page.waitForTimeout(20);
  await page.mouse.move(1030, 630);
  await page.waitForFunction(() => localPortraitFixture.mask.openTip?.generalHead.skin === 'res/local-tip.png');
  assert.deepEqual(await page.evaluate(() => {
    const { mask, target } = localPortraitFixture;
    return [mask.openTip.skinItemID, target.general.SkinId, target.seat.SkinID];
  }), [10102, 10101, 10101]);
  await page.screenshot({ path: path.join(output, 'local-native-skin-hover.png') });
  assert.deepEqual(await page.evaluate(() => {
    const { avatar, scope, mask, originalTip } = window.localPortraitFixture; scope.dispose();
    return [avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-portrait')), mask.openTip.generalHead.skin,
      mask.toolTip === originalTip];
  }), [true, false, 'res/current-tip.png', true]);
  await page.mouse.move(995, 605);
  await page.waitForFunction(() => !localPortraitFixture.mask.openTip);
  await page.addScriptTag({ content: `window.capturedSelector={${selectorMethods.join(',')}};window.capturedSelectGeneral={${selectGeneralClose}};` });
  const setupMatchSelectorFixture = () => page.evaluate(() => {
    const { avatar, target, mask } = localPortraitFixture;
    const scope = new NativeSkinCheck.ResourceScope();
    const { seat } = target;
    const effectSprite = avatar.addChild(new Laya.Sprite());
    const sceneLayer = Laya.stage.addChild(new Laya.Sprite());
    sceneLayer.name = 'SceneLayer';
    const roundLayer = sceneLayer.addChild(new Laya.Sprite());
    scope.add(() => sceneLayer.destroy(true));
    scope.add(() => effectSprite.destroy(true));
    const entranceSkin = { skinID: seat.SkinID, SkinUrlInTip: 'res/current-tip.png' };
    const ui = { ...capturedDebutEffects, ...capturedRoundEffects, seat, seatAvatar: avatar, effectSprite,
      skinRoundEffectList: [], maxSeatSkinVO: entranceSkin,
      addGameSceneEffect: effect => roundLayer.addChild(effect),
      unscaledWidth: avatar.width, unscaledHeight: avatar.height, lastDebutGradation: 0,
      bottomManager: { SetGrade(value) { this.grade = value; } },
      otherTopManager: { overMask: mask, SetGeneralGrade(value) { this.grade = value; } } };
    const gradeChanged = 'GENERAL_GRADATION_CHANGED';
    seat.on(gradeChanged, ui, capturedDebutEffects.General_GradationChanged);
    scope.add(() => seat.off(gradeChanged, ui, capturedDebutEffects.General_GradationChanged));
    const settings = skinFixture.ctx.settings;
    const calls = [], notices = [];
    let scene = {}, draft = true, accountId = 1001, deferSkills = false, configReady;
    const catalogue = [
      { skinID: 10101, skinname: '已开通演练皮肤' },
      { skinID: 10102, skinname: '未开通演练皮肤', SeatAnimateUrl: 'res/fixture.sk' },
    ];
    const tables = { character: { GameCharacters: { character: [{ a: 101, b: '谋陆逊', j: 31, k: 32, l: 33, m: 35 },
      { a: 102, b: '界赵云', j: 36 }, { a: 758, b: '钟会', ai: '界', j: 3913, k: 3914 }] } },
      cha_spell: { GameSpells: { spell: [{ a: 31, c: '谦逊' }, { a: 32, c: '连营' }, { a: 33, c: '牌面第三技' },
        { a: 34, c: '后来获得' }, { a: 35, c: '牌面第四技' }, { a: 36, c: '龙胆' },
        { a: 3913, c: '权计' }, { a: 3914, c: '自立', m: '3915' }, { a: 3915, c: '排异' }] } } };
    const runtimeIndex = { loads: 0, finish: null };
    class GameMvpFixture {}
    Object.assign(GameMvpFixture.prototype, capturedMvpAudio);
    const game = { getScene: () => scene, getSeatUIs: () => draft ? [] : [ui], isInGame: () => true,
      getSelfSeatUI: () => draft ? null : ui,
      getSelf: () => ({ ClientId: accountId }), getConfigData: name => deferSkills ? null : tables[name],
      supportsMobileSkinConfig: true,
      downloadMobileSkinAsset: NativeSkinCheck.createMobileSkinDownload(window, scope),
      loadConfigData: name => {
        if (name !== 'yjcm-skins') return configReady ?? Promise.resolve();
        if (++runtimeIndex.loads === 1) return Promise.reject(new Error('演练配置暂不可用'));
        if (runtimeIndex.loads > 2) return Promise.resolve(window.yjcmSourceFixture);
        return new Promise(resolve => { runtimeIndex.finish = () => resolve(window.yjcmSourceFixture); });
      },
      getClass: name => name === 'GeneralSkinManager' ? {
        GetOnlineSKinList: () => catalogue, GetSkinListBySkinID: () => [],
      } : name === 'GameMvpWindow' ? GameMvpFixture : null };
    const played = [];
    seat.PlaySkillSound = capturedSeatAudio.PlaySkillSound;
    seat.PlaySkillHurtSound = capturedSeatAudio.PlaySkillHurtSound;
    seat.PlayDeadSound = capturedSeatAudio.PlayDeadSound;
    seat.general = seat.General;
    seat.Index ??= 0;
    seat.GetGeneralBySkillIdOnlyId = () => seat.General;
    const ownerOfSkill = seat.GetSkillFromWhichGeneral;
    seat.GetSkillFromWhichGeneral = skillId => skillId === 8 ? null : ownerOfSkill.call(seat, skillId);
    scope.add(() => { seat.GetSkillFromWhichGeneral = ownerOfSkill; });
    seat.OnChangeOriSkinBySkill ??= () => {};
    const ctx = NativeSkinCheck.prepareSkinContext({ window, document, scope, settings, game, notify: message => notices.push(message) });
    const local = NativeSkinCheck.createLocalSkins(ctx);
    window.yjcmRuntimeIndexFixture = runtimeIndex;
    settings.set('unlockSkin', false);
    settings.set('crossServer', false);
    settings.set('unlockDynamic', true);
    const openForms = NativeSkinCheck.createFormPicker(ctx);
    const openYjcm = NativeSkinCheck.createYjcmPicker(ctx, local, openForms);
    const openMobile = options => openYjcm(options, 'mobile');
    const check = NativeSkinCheck.createMatchSkinSelector(ctx, local, openYjcm, openForms, openMobile);
    window.V2t = { SceneRightWidth: 0, get SelfSeat() { return draft ? {} : seat; }, GetModeType: () => 0, ChecHasShareSkin: () => false };
    window.Us = { IsGuildMatch: () => false, IsTZGJ: () => false, IsLuanDou: () => false };
    window.iA = { SET: 0 };
    window.M$t = { I: () => ({ SendMsgSelectCharacterReq: id => calls.push(['general', id]),
      GetSeatGeneralVoiceUrl: (_seat, _card, _skin, skill) => skill ? 'native:' + skill.ID : 'native:death' }) };
    window.hZt = { I: () => ({ SoundSets: { SkinSoundOverlap: false } }) };
    window.ID = { PlaySkillSound: url => played.push(url), PlayGeneralSkillSoundDelay: (_seat, _general, url) => played.push(url),
      PlayDeadSound: url => played.push(url) };
    window.JJt = { I: () => ({ SelSkinNtf: () => calls.push(['finish-select']), SendClientGeneralSkinReq: (...args) => calls.push(['skin', ...args]) }) };
    window.XPt = { CLOSE_SKIN_WINDOW: 'CLOSE_SKIN_WINDOW' };
    Object.setPrototypeOf(capturedSelector, { destroy() {} });
    const close = owner => { capturedSelector.destroy.call(owner.selectView); owner.removeSelf(); };
    Object.setPrototypeOf(capturedSelectGeneral, { Close() { close(this); } });
    function open(name) {
      const owner = new Laya.Sprite();
      Object.assign(owner, { _className_: name, generalID: 101,
        Close: name === 'SelectSkinWindow' ? capturedSelectGeneral.Close : function () { close(this); } });
      owner.pos(290, 210); owner.size(550, 360);
      owner.graphics.drawRect(0, 0, owner.width, owner.height, '#24201c', '#725e3d', 1);
      const title = new Laya.Text(); title.text = '选择皮肤'; title.fontSize = 24; title.color = '#f2cf79'; title.pos(225, 14); owner.addChild(title);
      const panel = new Laya.Panel(); panel.pos(20, 55); panel.size(510, 270); owner.addChild(panel);
      const content = new Laya.Sprite(); content.size(510, 270); panel.addChild(content);
      const view = Object.assign(new Laya.EventDispatcher(), {
        realGeneralID: 101, defaultGeneralID: 101, clientID: 1001, closeSelectSkinId: 10101,
        closeSelectSure: capturedSelector.closeSelectSure, clickCheck: false, pannel: panel, pannelContent: content, itemList: [],
        list: catalogue,
      });
      owner.selectView = view;
      view.on(XPt.CLOSE_SKIN_WINDOW, owner, owner.Close);
      for (const [index, item] of view.list.entries()) {
        const card = new Laya.Sprite(); card.size(154, 182); card.pos(index * 175, 18); card.mouseEnabled = true;
        Object.assign(card, { SkinID: item.skinID, HasSkin: index === 0, IsUsing: false, DynamicState: 0 });
        card.graphics.drawRect(0, 0, 154, 182, index ? '#3c444c' : '#485447', '#9c8c68', 1);
        const name = new Laya.Text(); name.text = index ? '未开通演练皮肤' : '已开通演练皮肤'; name.color = '#f7eac9';
        name.fontSize = 14; name.pos(25, 58); name.mouseEnabled = false; card.addChild(name);
        if (index) {
          const footer = new Laya.Text(); footer.text = '制作皮肤'; footer.color = '#f7eac9';
          footer.size(154, 26); footer.align = 'center'; footer.pos(0, 156); footer.mouseEnabled = true;
          footer.on('click', footer, event => { event.stopPropagation(); calls.push(['compose-ui']); });
          card.addChild(footer);
        }
        card.on('click', view, capturedSelector.itemClick);
        view.itemList.push(card); content.addChild(card);
      }
      Laya.stage.addChild(owner); check();
      window.matchSelectorFixture.owner = owner;
      window.matchSelectorFixture.title = title;
    }
    window.matchSelectorFixture = { scope, settings, calls, notices, avatar, mask, ui, game, local, check, open, openYjcm, openForms, played,
      mountToolbox() {
        const root = document.createElement('div');
        root.style.cssText = 'position:absolute;right:20px;top:20px;width:248px;padding:10px;background:#252119;color:#eee3cc';
        document.body.append(root);
        const off = NativeSkinCheck.renderSkinPanel(ctx, local, check, root, openYjcm, openForms, openMobile);
        scope.add(() => { off(); root.remove(); });
      },
      enableDualNative() {
        Object.assign(catalogue[0], { IsManyStateDyskin: true, NewSkinJudge: 2, ConMessage: '小于3血切换形态2' });
      },
      enableConversion() {
        const spells = tables.cha_spell.GameSpells.spell;
        spells.find(spell => spell.a === 32).m = '37';
        spells.push({ a: 37, b: '3,13', c: '演练衍生转换技' });
        const conversion = { ID: 37, IsSwitchSkill: true, switchValue: 1, get IsSecondState() { return this.switchValue === 2; } };
        const dataSwitch = { StateSkillId: 37, Value: 1 };
        seat.GetSeatState = id => id === 251 ? dataSwitch : null;
        seat.GetGeneralSkill = id => id === 37 ? conversion : null;
        seat.General.GetSkill = seat.GetGeneralSkill;
        this.changeConversion = value => {
          dataSwitch.Value = value;
          conversion.switchValue = value;
          seat.event('UPDATE_SWITCH_SKILL');
        };
      },
      confirmSkill(id) { seat.OnChangeOriSkinBySkill(101, id); },
      reveal() { draft = false; local.refresh(); },
      nextMatch(id = accountId, beforeFirstPaint = false, deferVoice = false, debutGrade = 0, deferRoundEntrance = false) {
        draft = true;
        local.refresh();
        avatar.SetSkin(avatar.generalCard.SkinId, avatar.x, '', 0, 1, false, false);
        accountId = id;
        scene = { SelfSeatUi: ui, parent: sceneLayer };
        deferSkills = deferVoice;
        configReady = deferVoice ? new Promise(resolve => { window.finishSkinSkills = () => { deferSkills = false; resolve(); }; }) : null;
        if (beforeFirstPaint) {
          const before = effectSprite.numChildren;
          let debut, lateDebut, regular;
          if (debutGrade) {
            // The native rank callback runs when the general data arrives, before the first stage render.
            seat.IsLegalOperable = true;
            seat.Gradation = debutGrade;
            ui.lastDebutGradation = 0;
            seat.event(gradeChanged);
            debut = effectSprite.getChildAt(before);
            const asset = debutGrade === 4 ? 'jinlongkuang.sk' : 'yinlongkuang.sk';
            if (!debut?.played || !debut.EffectUrl.endsWith('/' + asset)) throw Error('演练未生成原生金／银框入场特效');
            ui.playRoundStart();
            regular = effectSprite.getChildAt(before + 1);
            Laya.timer.callLater(ui, () => {
              // Stage.render invokes callLater after the Toolbox stage hook but before painting its children.
              const priorCount = effectSprite.numChildren;
              ui.lastDebutGradation = 0;
              capturedDebutEffects.PlayDebutEffect.call(ui);
              lateDebut = effectSprite.getChildAt(priorCount);
            });
          }
          draft = false;
          if (deferRoundEntrance) {
            const skinTex = avatar.skinTex;
            const ordinaryEffect = roundLayer.addChild(new Laya.Sprite());
            let lateEntrance, enteredScene, painted = false;
            avatar.skinTex = null;
            try {
              Laya.timer.callLater(ui, () => {
                // The previously bound portrait loader completes inside Stage.render.
                const url = entranceSkin.SkinUrlInTip;
                capturedRoundEffects.skinInWindowLoaded.call(ui, { url }, url, 2);
                lateEntrance = ui.skinRoundEffect;
                enteredScene = lateEntrance?.parent === roundLayer;
                if (lateEntrance) {
                  const render = lateEntrance.render;
                  lateEntrance.render = function (...args) { painted = true; return render.apply(this, args); };
                }
              });
              Laya.stage._loop();
              if (!lateEntrance?.played || !enteredScene || !lateEntrance.EffectUrl.endsWith('/pifuchuchang2.sk')) {
                throw Error('演练未在换肤立绘就绪前挂载真正的原皮肤金色入场');
              }
              if (painted || !lateEntrance.destroyed || ui.skinRoundEffect || ordinaryEffect.parent !== roundLayer) {
                throw Error('首帧仍渲染原皮肤金色入场，或误清理无关场景特效');
              }
            } finally {
              ordinaryEffect.destroy();
              avatar.skinTex = skinTex;
            }
          } else Laya.stage._loop();
          if (debut) {
            if (debut.parent || !debut.destroyed) throw Error('本地换肤首帧仍带武将等阶入场特效');
            if (!lateDebut?.played || lateDebut.parent || !lateDebut.destroyed) throw Error('本地换肤未清理绘制同帧补挂的旧入场特效');
            ui.RePlayDebutEffect();
            seat.event(gradeChanged);
            if (effectSprite.numChildren !== before + 1) throw Error('本地换肤时武将等阶入场特效仍可重播');
            if (!regular?.played || regular.parent !== effectSprite || ui.bottomManager.grade !== debutGrade ||
                ui.otherTopManager.grade !== debutGrade) throw Error('局内回合提示或武将等阶标记被误清理');
            regular.destroy(true);
          }
          if (deferRoundEntrance) Laya.stage._loop();
          return [avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-portrait'))];
        }
        this.reveal();
      },
      useSkill(id, event) { seat.PlaySkillSound({ ID: id, IsGeneral: true, GetSoundUrl: () => 'native:' + id }, undefined, event); },
      useCardVoice(name, event, source = 'card') {
        const before = played.length;
        seat.PlaySkillSound({ ID: 8, IsGeneral: false, SkillName: name, GetSoundUrl: () => 'native:card:' + name }, source, event);
        return played.splice(before).at(-1);
      },
      playMvp({ egg = true, seatId = seat.Index, generalId = seat.General.CardId } = {}) {
        const match = { MvpResult: { SeatID: seatId, GeneralId: generalId } };
        const window = Object.assign(new GameMvpFixture(), { gameResult: match, generalID: generalId });
        const stubs = {
          DM: { I: () => ({ GetMvpEgg: () => egg ? { AMusicArr: ['native:mvp-egg'] } : null }) },
          lr: { Init() {}, RandomFromSync: () => 0 },
          Ps: { I: () => ({ makeUpRootResouceToUrl: (_path, file) => file.slice(0, -4) }) },
          BNt: { I: () => ({ GetRandomGeneralSkillSoundURL: () => 'native:mvp-random' }) },
        };
        const original = Object.fromEntries(Object.keys(stubs).map(name => [name, globalThis[name]]));
        const playSound = Laya.SoundManager.playSound;
        const mvp = [];
        const before = played.length;
        Object.assign(globalThis, stubs);
        Laya.SoundManager.playSound = url => { mvp.push(url); return { stop() {} }; };
        try {
          window.showMvpEgg(generalId);
          window.playRandomSound();
          return [played.splice(before), mvp];
        } finally {
          Object.assign(globalThis, original);
          Laya.SoundManager.playSound = playSound;
        }
      },
      useDamageSkill(id, sound) { seat.PlaySkillHurtSound({ ID: id, IsGeneral: true, GetHurtSoundUrl: () => sound }); },
      useDeath() { seat.PlayDeadSound(seat.General); },
      action() { return this.owner.selectView.pannelContent.getChildByName('sgs-local-skin-10102'); } };
    open('SelectSkinWindow');
  });
  await setupMatchSelectorFixture();
  assert.equal(await page.evaluate(() => Boolean(matchSelectorFixture.action())), false);
  await page.evaluate(() => { matchSelectorFixture.settings.set('unlockSkin', true); matchSelectorFixture.check(); });
  const clickSelector = async (index, y) => {
    const point = await page.evaluate(({ index, y }) => {
      const card = matchSelectorFixture.owner.selectView.itemList[index];
      const p = card.localToGlobal(new Laya.Point(77, y), true);
      return { x: p.x, y: p.y };
    }, { index, y });
    await page.mouse.click(point.x, point.y);
  };
  await page.screenshot({ path: path.join(output, 'match-selector-local.png') });
  await clickSelector(1, 166);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.calls), [['compose-ui']]);
  await clickSelector(1, 73);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.calls), [['compose-ui'], ['general', 101], ['finish-select']]);
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.skinItemID), 10101);
  await page.evaluate(() => { matchSelectorFixture.reveal(); matchSelectorFixture.open('ChangeSkinWindow'); });
  assert.deepEqual(await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    return [avatar.skinItemID, avatar.skeleton.played, avatar.generalCard.SkinId, avatar.generalCard.IsDynamic];
  }), [10102, true, 10101, false]);
  await clickSelector(0, 73);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.calls.at(-1)), ['skin', 0, 1001, 101, 101, 10101, 0, undefined]);
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.skinItemID), 10101);
  await page.evaluate(() => matchSelectorFixture.open('ChangeSkinWindow'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'sgs-local-skin-10102');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.skinItemID), 10102);
  assert.equal(await page.evaluate(() => matchSelectorFixture.calls.filter(([type]) => type === 'skin').length), 1);
  assert.deepEqual(await page.evaluate(() => {
    const f = matchSelectorFixture, remembered = f.settings.get('localSkin.1001.101');
    f.nextMatch(1002);
    const other = f.avatar.skinItemID;
    f.nextMatch(1001);
    return [remembered, other, f.avatar.skinItemID];
  }), [{ kind: 'native', id: 10102 }, 10101, 10102]);
  const [bigArt, seatArt, sparseSeat, head, windowArt] = (await page.evaluate(() => {
    const image = document.createElement('canvas'); image.width = 172; image.height = 206;
    const g = image.getContext('2d'); g.fillStyle = '#28433e'; g.fillRect(18, 12, 136, 180);
    g.fillStyle = '#d5b865'; g.fillRect(42, 46, 82, 88);
    g.fillRect(70, 29, 40, 10);
    const big = image.toDataURL().split(',')[1];
    g.clearRect(18, 12, 136, 15);
    g.fillStyle = '#9e8655'; g.fillRect(118, 12, 20, 15);
    const seat = image.toDataURL().split(',')[1];
    g.clearRect(0, 0, 172, 206);
    g.fillRect(60, 12, 38, 180);
    const sparseSeat = image.toDataURL().split(',')[1];
    image.width = image.height = 100;
    g.fillStyle = '#28433e'; g.fillRect(0, 0, 100, 100);
    g.fillStyle = '#d5b865'; g.fillRect(30, 25, 40, 50);
    const head = image.toDataURL().split(',')[1];
    image.width = 321; image.height = 419;
    g.fillStyle = '#884a34'; g.fillRect(0, 0, image.width, image.height);
    g.clearRect(0, 0, 80, 100);
    g.fillStyle = 'rgba(224, 100, 60, .5)'; g.fillRect(28, 42, 37, 39);
    g.fillStyle = '#e7bd69'; g.fillRect(110, 55, 100, 245);
    return [big, seat, sparseSeat, head, image.toDataURL().split(',')[1]];
  })).map(uri => Buffer.from(uri, 'base64'));
  const cors = { 'access-control-allow-origin': '*' };
  const md5 = body => createHash('md5').update(body).digest('hex');
  const cloudRoot = 'https://mres.sanguosha.cn/update_cloud/public/';
  const cloudRequests = [];
  const configRequests = [];
  const mobileFilterGenerals = [
    [9761, '诸葛亮'], [9762, '界·诸葛亮'], [9763, '星诸葛亮'],
    [9764, '谋·诸葛亮'], [9765, '势诸葛亮'], [9766, '魔·诸葛亮'],
  ];
  let configRelease = makeMobileConfigRelease({ generals: mobileFilterGenerals }), configUnavailable = false;
  const installerRoot = mobileBootstrapFixture.installerRoot;
  const installerPath = installerRoot + mobileBootstrapFixture.filename;
  const installer = Buffer.from(zipSync({ [mobileBootstrapFixture.member]: makeMobileBootstrapLibrary() }));
  const rangeCors = { ...cors, 'access-control-allow-headers': 'range', 'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-expose-headers': 'content-range' };
  await page.route(installerRoot + 'gameInfo.json', route => {
    configRequests.push('installer');
    return route.fulfill({ headers: cors, json: { zip_info: { file_name: mobileBootstrapFixture.filename,
      md5: mobileBootstrapFixture.digest, size: installer.length } } });
  });
  await page.route(installerPath, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: rangeCors });
    const header = await route.request().headerValue('range');
    const range = /^bytes=(\d*)-(\d+)$/.exec(header);
    assert.ok(range, 'installer is only requested in ranges');
    const start = range[1] ? Number(range[1]) : Math.max(0, installer.length - Number(range[2]));
    const end = range[1] ? Number(range[2]) : installer.length - 1;
    configRequests.push('range');
    return route.fulfill({ status: 206, headers: { ...rangeCors,
      'content-range': `bytes ${start}-${end}/${installer.length}` }, body: installer.subarray(start, end + 1) });
  });
  await page.route('https://waym.sanguosha.cn/config/?**', route => {
    configRequests.push('metadata');
    assert.equal(new URL(route.request().url()).searchParams.get('key_v'), mobileBootstrapFixture.keyVersion);
    return configUnavailable ? route.fulfill({ status: 503, headers: cors }) : route.fulfill({ headers: cors, json: configRelease.metadata });
  });
  await page.route(url => url.origin === 'https://mres.sanguosha.cn' && /^\/{1,2}config\//.test(url.pathname), route => {
    const url = route.request().url(), archive = configRelease.archives.get(url);
    assert.ok(archive, `requested the published configuration ZIP ${url}`);
    configRequests.push('shard');
    return route.fulfill({ headers: cors, contentType: 'application/zip', body: Buffer.from(archive) });
  });
  const dict = [];
  const mobileCardClip = Buffer.from(silentClip), mobileUnidentifiedClip = Buffer.from(silentClip);
  const guanYuCardClip = Buffer.from(silentClip), victoryClip = Buffer.from(silentClip);
  mobileCardClip[mobileCardClip.length - 1] = 129;
  mobileUnidentifiedClip[mobileUnidentifiedClip.length - 1] = 130;
  guanYuCardClip[guanYuCardClip.length - 1] = 135;
  victoryClip[victoryClip.length - 1] = 139;
  const formDeaths = ['', '#1', '#2'].map((suffix, index) => {
    const clip = Buffer.from(silentClip);
    clip[clip.length - 1] = 136 + index;
    return [`audio/dead/die${suffix ? 'skin' : ''}_83501${suffix}.mp3`, clip, 'audio/mpeg'];
  });
  const formSkills = ['huwei', 'zili', 'tiaoxin'].map((skill, index) => {
    const clip = Buffer.from(silentClip);
    clip[clip.length - 1] = 140 + index;
    return [`audio/skill/SKILL_83501${index ? '#' + index : ''}_${skill}_1.mp3`, clip, 'audio/mpeg'];
  });
  const jiangWeiClips = ['huitian', 'shenpei', 'tiantao', 'xingzhen'].map((code, index) => {
    const clip = Buffer.from(silentClip);
    clip[clip.length - 1] = 131 + index;
    return [`audio/skill/SKILL_87002_${code}_1.mp3`, clip, 'audio/mpeg'];
  });
  for (const [resource, body, contentType] of [
    ['ui/bface/skin/1805_1.jpg', windowArt, 'image/jpeg'],
    ['ui/face/skin/1805.png', seatArt, 'image/png'],
    ['ui/icon/skin/1805.png', head, 'image/png'],
    ['ui/face/skin/94401.png', seatArt, 'image/png'],
    ['audio/skill/SKILL_1805_tuxi_1.mp3', silentClip, 'audio/mpeg'],
    ['audio/skill/SKILL_1805_juedou_1.mp3', mobileCardClip, 'audio/mpeg'],
    ['audio/skill/SKILL_1805_9999_1.mp3', mobileUnidentifiedClip, 'audio/mpeg'],
    ['ui/face/skin/5203.png', head, 'image/png'],
    ['ui/face/skin/87001.png', head, 'image/png'],
    ['ui/face/skin/87002.png', sparseSeat, 'image/png'],
    ['ui/face/char/577.png', seatArt, 'image/png'],
    ['ui/bface/char/577_1.jpg', windowArt, 'image/jpeg'],
    ['ui/icon/char/577.png', head, 'image/png'],
    ...mobileFilterGenerals.map(([id]) => [`ui/face/char/${id}.png`, head, 'image/png']),
    ['ui/face/skin/30011.png', seatArt, 'image/png'],
    ['ui/face/skin/30012.png', seatArt, 'image/png'],
    ['ui/face/skin/30012#1.png', bigArt, 'image/png'],
    ['ui/face/skin/83501.png', seatArt, 'image/png'],
    ['ui/face/skin/83501#1.png', bigArt, 'image/png'],
    ['ui/face/skin/83501#2.png', windowArt, 'image/png'],
    ['audio/skill/SKILL_30011_juedou_1.mp3', guanYuCardClip, 'audio/mpeg'],
    ['audio/victory/victskin_30011.mp3', victoryClip, 'audio/mpeg'],
    ['audio/skill/SKILL_83501_juedou_1.mp3', guanYuCardClip, 'audio/mpeg'],
    ...jiangWeiClips, ...formDeaths, ...formSkills,
    ...(mobileMotionZip ? [['ui/face/skin/10305.png', seatArt, 'image/png'],
      ['ui/face/skin/dynamicSkin/10305_1.zip', mobileMotionZip, 'application/zip']] : []),
  ]) {
    const parsed = path.posix.parse(resource), code = md5(body);
    const file = `${parsed.dir}/${code}${parsed.ext}`;
    dict.push(`        ["${resource}"] = {file="${file}",code="${code}",size=${body.length}},`);
    await page.route(cloudRoot + file, route => {
      cloudRequests.push(resource);
      return route.fulfill({ headers: cors, contentType, body });
    });
  }
  const cloudZip = Buffer.from(zipSync({ cloud: strToU8(`return {\n    version = "461009",\n    dic = {\n${dict.join('\n')}\n    }\n}\n`) }));
  await page.route('https://waym.sanguosha.cn/update/cloud.php', route => {
    cloudRequests.push('version');
    return route.fulfill({ headers: cors, json: { cloud: { version: '461009', md5: md5(cloudZip), url: cloudRoot } } });
  });
  await page.route(cloudRoot + 'cloud_461009.zip', route => {
    cloudRequests.push('zip');
    return route.fulfill({ headers: cors, contentType: 'application/zip', body: cloudZip });
  });
  const cachePage = await browser.newPage();
  try {
    const requests = new Map();
    const fixture = 'https://skin-cache-fixture.test/';
    let finishSharedDownload;
    const sharedDownload = new Promise(resolve => { finishSharedDownload = resolve; });
    await cachePage.route(fixture, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>cache</title>' }));
    await cachePage.route('**/big/static/cache-*.png', async route => {
      const file = new URL(route.request().url()).pathname.split('/').at(-1);
      requests.set(file, (requests.get(file) ?? 0) + 1);
      if (file === 'cache-shared.png') await sharedDownload;
      return route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: bigArt });
    });
    await cachePage.goto(fixture);
    const prepCache = async () => {
      await cachePage.addScriptTag({ content: bundle.outputFiles[0].text });
      await cachePage.evaluate(() => {
        const scope = new NativeSkinCheck.ResourceScope();
        const entry = name => ({ assets: [[1, name]] });
        window.portraitCacheFixture = { scope, older: entry('cache-fixture'), recent: entry('cache-recent'), shared: entry('cache-shared'),
          cache: NativeSkinCheck.createPortraitCache(window, scope) };
      });
    };
    await prepCache();
    assert.deepEqual(await cachePage.evaluate(async () => {
      const { cache, older, recent, scope } = portraitCacheFixture;
      await cache.load(older, scope.signal);
      await cache.load(recent, scope.signal);
      const db = await new Promise(resolve => {
        const request = indexedDB.open('sgs-toolbox-cross-portrait');
        request.onsuccess = () => resolve(request.result);
      });
      const record = await new Promise(resolve => {
        const request = db.transaction('portraits').objectStore('portraits').get('recent');
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return [record.key, record.blob.type];
    }), ['[[1,"cache-recent"]]', 'image/png']);
    await cachePage.reload();
    await prepCache();
    assert.deepEqual(await cachePage.evaluate(async () => {
      const { cache, older, recent, scope } = portraitCacheFixture;
      await cache.warm();
      return [cache.get(recent)?.image.naturalWidth, (await cache.load(older, scope.signal))?.image.naturalWidth];
    }), [172, 172]);
    assert.deepEqual([...requests], [['cache-fixture.png', 1], ['cache-recent.png', 1]],
      'the recent and older prepared portraits are decoded from disk after reloading');

    const request = cachePage.waitForRequest(value => value.url().endsWith('/cache-shared.png'));
    await cachePage.evaluate(() => {
      const f = portraitCacheFixture;
      f.first = new AbortController();
      f.firstLoad = f.cache.load(f.shared, f.first.signal);
      f.secondLoad = f.cache.load(f.shared, f.scope.signal);
    });
    await request;
    await cachePage.evaluate(() => { portraitCacheFixture.first.abort(); });
    finishSharedDownload();
    assert.deepEqual(await cachePage.evaluate(async () => {
      const { firstLoad, secondLoad } = portraitCacheFixture;
      return [(await firstLoad)?.image.naturalWidth ?? null, (await secondLoad)?.image.naturalWidth];
    }), [null, 172]);
    assert.equal(requests.get('cache-shared.png'), 1, 'canceling one consumer leaves the shared download running');
  } finally { await cachePage.close(); }
  const pictureRequests = [];
  const officialArt = new Map();
  const motionArt = officialMotionDir ? new Map(await Promise.all(['800501-daiji2.sk', '800501-daiji2.png',
    '7133801-daiji2.sk', '7133801-daiji2.png',
    '8123201-daiji2.sk', '8123201-daiji2.png'].map(async name =>
    ['big/dynamic/' + name.replace('-', '/'), await readFile(path.join(officialMotionDir, name))]))) : new Map();
  if (officialMotionDir) {
    for (const resource of ['seat/static/600501.png', 'window/600501.png', 'seat/static/500401.png']) officialArt.set(resource, seatArt);
    officialArt.set('seat/static/5133801.png', await readFile(path.join(officialMotionDir, 'static-5133801.png')));
    officialArt.set('seat/static/6123201.png', await readFile(path.join(officialMotionDir, 'static-6123201.png')));
  }
  const bindingPreview = officialSeatDir ? await readFile(path.join(officialSeatDir, 'window-523001.png')) : windowArt;
  let finishWindow, finishSlowPreview, finishColdSeat;
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/general/**', async route => {
    const url = new URL(route.request().url());
    const resource = url.pathname.split('/general/')[1];
    pictureRequests.push(resource);
    assert.equal(route.request().headers().cookie, undefined);
    const headers = { 'access-control-allow-origin': '*' };
    if (motionArt.has(resource)) await route.fulfill({ headers, contentType: resource.endsWith('.png') ? 'image/png' : 'application/octet-stream', body: motionArt.get(resource) });
    else if (url.pathname.includes('/general/head/')) await route.fulfill({ headers, contentType: 'image/png', body: head });
    else if (officialArt.has(resource)) await route.fulfill({ headers, contentType: 'image/png', body: officialArt.get(resource) });
    else if (resource === 'window/523001.png') {
      const requests = pictureRequests.filter(path => path === resource).length;
      if (requests === 2) await new Promise(resolve => { finishWindow = resolve; });
      await route.fulfill({ headers, contentType: 'image/png', body: requests === 1 ? bindingPreview : windowArt });
    }
    else if (resource === 'seat/static/523101.png') {
      if (!finishSlowPreview) {
        await new Promise(resolve => { finishSlowPreview = resolve; });
        await route.fulfill({ headers, contentType: 'image/png', body: seatArt }).catch(() => {});
      } else {
        await new Promise(resolve => { finishColdSeat = resolve; });
        await route.fulfill({ headers, contentType: 'image/png', body: seatArt });
      }
    }
    else if (resource === 'big/static/523101.png') await route.fulfill({ headers, contentType: 'image/png', body: bigArt });
    else if (url.pathname.endsWith('/seat/static/200102.png')) await route.fulfill({ headers, contentType: 'image/png', body: sparseSeat });
    else if (['big/static/200102.png', 'big/static/523001.png'].includes(resource)) await route.fulfill({ headers, contentType: 'image/png', body: bigArt });
    else if (url.pathname.endsWith('/seat/static/523001.png')) await route.fulfill({ headers, contentType: 'image/png', body: seatArt });
    else await route.fulfill({ headers, status: 404 });
  });
  await page.evaluate(() => {
    const f = matchSelectorFixture;
    f.avatar.generalCard.CardName = '曹操';
    f.settings.set('unlockSkin', false);
    f.settings.set('unlockDynamic', false);
    f.settings.set('crossServer', true);
    f.open('ChangeSkinWindow');
  });
  const crossButton = await page.evaluate(() => {
    const owner = matchSelectorFixture.owner, button = owner.getChildByName('sgs-yjcm-skin-selector');
    const point = button.localToGlobal(new Laya.Point(button.width / 2, button.height / 2), true);
    return { x: point.x, y: point.y, aboveList: button.y + button.height <= owner.selectView.pannel.y };
  });
  assert.equal(crossButton.aboveList, true);
  const mobilePicker = page.locator('[data-sgs-mobile-skins]');
  const mobileResults = mobilePicker.locator('.results');
  const selectedMobileSkin = mobileResults.locator('.result[aria-pressed=true]');
  const mobileQuery = mobilePicker.getByRole('searchbox', { name: '搜索移动版武将名、皮肤名或编号' });
  const mobileRow = mobileResults.getByRole('button', { name: /登锋陷阵.*1805/ });
  const mobileClose = mobilePicker.getByRole('button', { name: '关闭' });
  for (const [scaleX, scaleY] of [[1, 1], [.72, .72], [1.13, .85]]) {
    const pair = await page.evaluate(({ scaleX, scaleY }) => {
      const { owner, title, check } = matchSelectorFixture;
      owner.scale(scaleX, scaleY);
      check();
      const geometry = NativeSkinCheck.measureSkinButtons(owner, 'sgs-yjcm-skin-selector', '__sgsSkinToolMobileEntry', title, 'x');
      geometry.listTop = owner.selectView.pannel.localToGlobal(new Laya.Point(), true).y;
      return geometry;
    }, { scaleX, scaleY });
    assertButtonPair(pair.buttons, `match selector at ${scaleX} × ${scaleY}`);
    assert.ok(pair.buttons[1].right <= pair.boundary && pair.buttons[1].bottom <= pair.listTop,
      'match entries stay clear of the title and the skin list');
    if (scaleX < 1) {
      await page.mouse.click(pair.buttons[1].click.x, pair.buttons[1].click.y);
      await mobilePicker.getByRole('heading', { name: '移动版皮肤' }).waitFor();
      assert.equal(await mobileQuery.inputValue(), '曹操');
      await mobileClose.click();
      await mobilePicker.waitFor({ state: 'detached' });
    }
  }
  await page.evaluate(() => { matchSelectorFixture.owner.scale(1, 1); Laya.stage.focus = null; });
  await page.screenshot({ path: path.join(output, 'yjcm-native-entry.png') });
  const picker = page.locator('[data-sgs-yjcm-skins]');
  const crossResults = picker.locator('.results');
  const query = picker.getByRole('searchbox', { name: '搜索所属武将' });
  const apply = picker.getByRole('button', { name: '使用皮肤' });
  const fullPictures = () => pictureRequests.filter(request => /^(seat\/static|big\/static|maxBig)\//.test(request));
  const windowPictures = () => pictureRequests.filter(request => request.startsWith('window/'));
  const portrait = () => page.evaluate(() => Boolean(matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait')));
  const visibleSeatPreview = () => page.waitForFunction(() =>
    matchSelectorFixture.avatar.getChildByName('sgs-local-skin-seat-preview')?.visible);
  async function leaveSeat() {
    await page.waitForTimeout(20); // The Laya input handler throttles closely spaced mouse moves.
    await page.mouse.move(995, 605);
    await page.waitForFunction(() => !matchSelectorFixture.mask.openTip);
  }
  const samplePixels = (png, points) => page.evaluate(async ({ value, points }) => {
    const source = new Image(); source.src = 'data:image/png;base64,' + value; await source.decode();
    const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const g = canvas.getContext('2d'); g.drawImage(source, 0, 0);
    return points.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
  }, { value: png.toString('base64'), points });
  async function chooseSkin() {
    await query.fill('刘备');
    const row = crossResults.getByRole('button', { name: /青梅煮酒.*200102/ });
    await row.scrollIntoViewIfNeeded();
    const thumb = row.locator('img:not([hidden])');
    await thumb.waitFor();
    await thumb.evaluate(img => img.decode());
    assert.equal(await row.evaluate(node => {
      const label = node.querySelector('.name'), info = node.querySelector('small'), img = node.querySelector('img');
      const l = label.getBoundingClientRect(), i = info.getBoundingClientRect(), t = img.getBoundingClientRect();
      return getComputedStyle(label).whiteSpace === 'nowrap' && i.top < l.bottom && i.bottom > l.top && t.left >= l.right && t.width === 36;
    }), true);
    await row.click();
  }
  function assertFullImageFallback() {
    assert.deepEqual(fullPictures().slice(-2), ['seat/static/200102.png', 'big/static/200102.png']);
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'sgs-yjcm-skin-selector');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), '__sgsSkinToolMobileEntry');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => Laya.stage.focus?.name), 'sgs-yjcm-skin-selector');
  assert.equal(await page.evaluate(() => yjcmRuntimeIndexFixture.loads), 0);
  await page.keyboard.press('Enter');
  assert.equal(await query.inputValue(), '曹操');
  const retryIndex = picker.getByRole('button', { name: '重试加载' });
  await retryIndex.waitFor();
  await picker.getByText('索引加载失败详情').click();
  await picker.getByText('演练配置暂不可用').waitFor();
  await page.screenshot({ path: path.join(output, 'yjcm-index-retry.png') });
  async function checkIndexLayout() {
    for (const width of [248, 280, 420]) {
      await page.setViewportSize({ width: width + 24, height: 320 });
      for (const offset of [-2, -1, 0, 2]) {
        assert.equal(await picker.evaluate((host, { width, offset }) => {
          host.style.setProperty('--sgs-font-offset', offset + 'px');
          const dialog = host.shadowRoot.querySelector('dialog');
          const body = dialog.querySelector('.body');
          const count = dialog.querySelector('.count');
          return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
            parseFloat(getComputedStyle(dialog).fontSize) === 14 + offset &&
            [body, count].every(node => node.scrollWidth <= node.clientWidth + 1);
        }, { width, offset }), true);
      }
    }
    await picker.evaluate(host => host.style.removeProperty('--sgs-font-offset'));
    await page.setViewportSize({ width: 1200, height: 850 });
  }
  await checkIndexLayout();
  await retryIndex.click();
  await picker.getByText('正在建立皮肤和语音索引…').waitFor();
  await page.screenshot({ path: path.join(output, 'yjcm-index-loading.png') });
  await checkIndexLayout();
  assert.deepEqual(await page.evaluate(() => {
    const { avatar, local, settings } = matchSelectorFixture;
    const key = 'localSkin.1001.101';
    const previous = settings.get(key, null);
    settings.set(key, { kind: 'cross', id: 523101, general: '武陆逊' });
    const [target] = local.refresh();
    const covered = !avatar.skinTex.visible && !avatar.getChildByName('sgs-local-skin-portrait');
    const indexReady = Boolean(local.yjcm.current);
    local.reset(target);
    settings.set(key, previous);
    return [covered, indexReady, avatar.skinTex.visible];
  }), [true, false, true], 'the remembered choice covers the old art before the catalogue finishes and releases it when canceled');
  await page.evaluate(() => yjcmRuntimeIndexFixture.finish());
  assert.equal(fullPictures().length, 0, 'search only requests thumbnails');
  await picker.locator('img:not([hidden])').first().waitFor();
  assert.ok(pictureRequests.length < await picker.locator('[data-result]').count(), 'thumbnails outside the visible list are lazy');
  await query.fill('陆逊');
  const generalFilters = picker.getByRole('group', { name: '按所属武将筛选' });
  await query.fill('诸葛亮');
  assert.deepEqual(await generalFilters.getByRole('button').allTextContents(),
    ['全部', '武诸葛亮', '谋诸葛亮', '神诸葛亮', '有诸葛亮', '诸葛亮']);
  await page.screenshot({ path: path.join(output, 'yjcm-general-filter-order.png') });
  await query.fill('陆逊');
  const allGenerals = generalFilters.getByRole('button', { name: '全部', exact: true });
  const plotLuxun = generalFilters.getByRole('button', { name: '谋陆逊', exact: true });
  const resultRows = picker.locator('[data-result]');
  assert.equal(await generalFilters.getByRole('button', { name: /界陆逊|体验/ }).count(), 0);
  assert.equal(await allGenerals.getAttribute('aria-pressed'), 'true');
  assert.match(await resultRows.first().getAttribute('title'), /神秀峥嵘.*武陆逊/);
  const slowPreviewRequest = page.waitForRequest(request => request.url().endsWith('/seat/static/523101.png'));
  await resultRows.first().click();
  await slowPreviewRequest;
  assert.equal(await apply.isEnabled(), true);
  await plotLuxun.press('Enter');
  assert.equal(await plotLuxun.getAttribute('aria-pressed'), 'true');
  assert.equal(await apply.isEnabled(), true, 'filtering preserves the chosen artwork');
  assert.equal(await picker.locator('.footer p').textContent(), '立绘 · 武陆逊 · 神秀峥嵘 #523101');
  assert.equal(await query.inputValue(), '陆逊');
  assert.equal(await resultRows.count(), 2);
  assert.equal(await resultRows.filter({ hasText: '动态' }).count(), 1);
  assert.ok((await resultRows.allTextContents()).every(text => text.includes('谋陆逊 · #')));
  await allGenerals.click();
  assert.match(await resultRows.first().getAttribute('title'), /神秀峥嵘.*武陆逊/);
  await picker.locator('img:not([hidden])').first().waitFor();
  await page.screenshot({ path: path.join(output, 'yjcm-search-results.png') });
  await query.fill('界夏侯惇');
  await crossResults.getByRole('button', { name: /经典形象.*夏侯惇.*101801/ }).click();
  const mergedVoices = picker.getByRole('group', { name: '外服技能' });
  assert.equal(await mergedVoices.getByRole('button', { name: '刚烈', exact: true }).count(), 1);
  assert.equal(await mergedVoices.getByRole('button', { name: '清俭', exact: true }).count(), 1);
  finishSlowPreview();
  await picker.getByText('局内预览加载失败').waitFor();
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.skinTex.visible), true,
    'a late preview cannot replace the avatar after a different selection fails');
  await page.screenshot({ path: path.join(output, 'yjcm-merged-voices.png') });
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  const savedBeforePreview = await page.evaluate(() => matchSelectorFixture.settings.get('localSkin.1001.101', null));
  await page.mouse.click(crossButton.x, crossButton.y);
  await chooseSkin();
  await picker.getByRole('img', { name: '青梅煮酒预览' }).waitFor();
  await visibleSeatPreview();
  assert.deepEqual(await page.evaluate(() => {
    const { avatar, local, settings, useSkill, played } = matchSelectorFixture;
    useSkill(31);
    return [avatar.skinTex.visible, local.has(local.ownPortraitTarget(101)), settings.get('localSkin.1001.101', null), played.pop()];
  }), [false, false, savedBeforePreview, 'native:31'], 'preview changes the seat picture without applying it or changing voice');
  await page.screenshot({ path: path.join(output, 'yjcm-preview.png') });
  const previewImage = await page.screenshot({ clip: { x: 1016, y: 616, width: 138, height: 188 } });
  const previewPixel = await samplePixels(previewImage, [[4, 4], [133, 183]]);
  assert.ok(previewPixel.every(rgb => rgb.every((channel, index) => Math.abs(channel - [34, 56, 51][index]) <= 2)),
    'the seat is visible through the lighter backdrop');
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    return [avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-seat-preview'))];
  }), [true, false], 'closing an unconfirmed preview restores native rendering');
  await page.mouse.click(crossButton.x, crossButton.y);
  await chooseSkin();
  await visibleSeatPreview();
  await picker.getByRole('img', { name: '青梅煮酒预览' }).waitFor();
  const beforeApply = windowPictures().filter(path => path === 'window/200102.png').length;
  const missingWindow = page.waitForResponse(response => response.url().endsWith('/window/200102.png'));
  await apply.click();
  await picker.waitFor({ state: 'detached' });
  assertFullImageFallback();
  assert.equal(await portrait(), true);
  assert.equal(windowPictures().filter(path => path === 'window/200102.png').length, beforeApply + 1);
  assert.equal((await missingWindow).status(), 404);
  await page.mouse.move(1030, 630);
  await page.waitForFunction(() => matchSelectorFixture.mask.openTip?.generalHead.skin === 'res/current-tip.png');
  await leaveSeat();
  const seatImage = await page.screenshot({ path: path.join(output, 'yjcm-seat-crop.png'), clip: { x: 1016, y: 616, width: 138, height: 188 } });
  const seatPixel = await samplePixels(seatImage, [[4, 4], [133, 183], [3, 4], [134, 183]]);
  assert.deepEqual(seatPixel.slice(0, 2), [[40, 67, 62], [40, 67, 62]], 'trimmed artwork reaches both corners of the native portrait');
  assert.ok(seatPixel.slice(2).every(color => color.join() !== '40,67,62'), 'portrait pixels stay inside the seat');
  await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    avatar.size(65, 180);
    avatar.scrollRect = new Laya.Rectangle(36, 0, 65, 180);
  });
  await page.waitForFunction(() => {
    const sprite = matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait');
    return sprite.x === 36 && sprite.width === 65 && sprite.scrollRect.width === 65;
  });
  await page.evaluate(() => { const { avatar } = matchSelectorFixture; avatar.scrollRect = null; avatar.size(130, 180); });
  assert.equal(await page.evaluate(() => Boolean(matchSelectorFixture.owner.parent)), false);
  assert.equal(await page.evaluate(() => matchSelectorFixture.calls.filter(([type]) => type === 'skin').length), 1);
  await page.evaluate(() => matchSelectorFixture.mountToolbox());
  const toolboxEntry = page.getByRole('button', { name: '一将成名皮肤' });
  const mobileToolboxEntry = page.getByRole('button', { name: '移动版皮肤' });
  for (const width of [248, 280, 420]) for (const offset of [-2, -1, 0, 2]) {
    const pair = await mobileToolboxEntry.evaluate((mobile, { width, offset }) => {
      const panel = mobile.closest('[data-sgs-skin-settings]');
      const container = panel.parentElement;
      const first = panel.querySelector('.skin-yjcm');
      container.style.width = width + 'px';
      container.style.fontSize = 14 + offset + 'px';
      const bounds = [first, mobile].map(button => ({ ...button.getBoundingClientRect().toJSON(),
        textFits: button.scrollWidth <= button.clientWidth + 1 && getComputedStyle(button).whiteSpace === 'nowrap' }));
      return { bounds, panelRight: panel.getBoundingClientRect().right };
    }, { width, offset });
    assertButtonPair(pair.bounds, `${width}px toolbox panel at ${14 + offset}px text`);
    assert.ok(pair.bounds[1].right <= pair.panelRight + 1);
  }
  await mobileToolboxEntry.evaluate(mobile => {
    const { style } = mobile.closest('[data-sgs-skin-settings]').parentElement;
    style.width = '248px';
    style.fontSize = '';
  });
  await toolboxEntry.click();
  await chooseSkin();
  await visibleSeatPreview();
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait').visible), false);
  await picker.getByRole('button', { name: '关闭' }).click();
  assert.deepEqual(await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    return [avatar.skinTex.visible, avatar.getChildByName('sgs-local-skin-portrait').visible];
  }), [false, true], 'closing the preview reveals the currently applied portrait');
  await page.getByRole('button', { name: '恢复原皮肤' }).click();
  assert.equal(await portrait(), false);
  await mobileToolboxEntry.click();
  await mobileQuery.fill('94401');
  const mobileCardSwitch = mobilePicker.getByRole('switch', { name: '替换同名卡牌配音' });
  const mobileMvpSwitch = mobilePicker.getByRole('switch', { name: '替换 MVP 语音' });
  await mobileResults.getByRole('button', { name: /94401/ }).waitFor();
  assert.equal(cloudRequests.filter(name => name === 'zip').length, 1, 'the verified cloud index is reused');
  assert.equal(configRequests.filter(name => name === 'installer').length, 1, 'the install bootstrap is stored for later refreshes');
  assert.ok(configRequests.includes('range') && configRequests.includes('shard'), `official configuration requests: ${configRequests.join(', ')}`);
  assert.ok(!cloudRequests.some(name => name.startsWith('audio/')), 'browsing does not fetch voice files');
  await mobileQuery.fill('诸葛亮');
  const mobileGeneralFilters = mobilePicker.getByRole('group', { name: '按所属武将筛选' });
  const mobileFilterRows = mobilePicker.locator('[data-result]');
  const allMobileGenerals = mobileGeneralFilters.getByRole('button', { name: '全部', exact: true });
  assert.deepEqual(await mobileGeneralFilters.getByRole('button').allTextContents(),
    ['全部', '魔·诸葛亮', '势诸葛亮', '谋·诸葛亮', '星诸葛亮', '界·诸葛亮', '诸葛亮']);
  assert.equal(await mobileFilterRows.count(), mobileFilterGenerals.length);
  assert.equal(await allMobileGenerals.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(output, 'mobile-general-filter-order.png') });
  for (const width of [420, 280, 248]) {
    await page.setViewportSize({ width, height: 650 });
    for (const offset of [-2, -1, 0, 2]) {
      await mobilePicker.evaluate((host, size) => host.style.setProperty('--sgs-font-offset', `${size}px`), offset);
      assert.ok(await mobileGeneralFilters.evaluate((filters, narrow) => {
        const buttons = [...filters.children];
        const top = buttons[0].getBoundingClientRect().top;
        return (!narrow || filters.scrollWidth > filters.clientWidth) &&
          buttons.every(button => Math.abs(button.getBoundingClientRect().top - top) < 1 &&
            button.scrollWidth <= button.clientWidth + 1);
      }, width === 248), `mobile general filters stay on one line at ${width}px and font offset ${offset}px`);
    }
  }
  const jieMobileGeneral = mobileGeneralFilters.getByRole('button', { name: '界·诸葛亮', exact: true });
  await jieMobileGeneral.click();
  assert.equal(await jieMobileGeneral.getAttribute('aria-pressed'), 'true');
  assert.equal(await mobileFilterRows.count(), 1);
  assert.equal(await mobileFilterRows.locator('small').textContent(), '界·诸葛亮 · #char-9762');
  assert.equal(await mobileQuery.inputValue(), '诸葛亮');
  await page.screenshot({ path: path.join(output, 'mobile-general-filter-248.png') });
  await allMobileGenerals.press('Enter');
  assert.equal(await allMobileGenerals.getAttribute('aria-pressed'), 'true');
  assert.equal(await mobileFilterRows.count(), mobileFilterGenerals.length);
  await mobilePicker.evaluate(host => host.style.removeProperty('--sgs-font-offset'));
  await page.setViewportSize({ width: 1200, height: 850 });
  await mobileQuery.fill('87001');
  await mobileResults.getByRole('button', { name: /神姜维.*87001/ }).waitFor();
  await mobileQuery.fill('挥师北伐');
  await mobileResults.getByRole('button', { name: /挥师北伐.*5203/ }).waitFor();
  await mobileQuery.fill('张温');
  await mobileResults.getByRole('button', { name: /经典形象.*张温.*char-577/ }).click();
  await mobilePicker.getByRole('img', { name: '经典形象预览' }).waitFor();
  assert.equal(await mobileCardSwitch.isVisible(), false, 'skins without card voices hide the replacement switch');
  assert.ok(cloudRequests.includes('ui/bface/char/577_1.jpg'), 'classic artwork loads from the character catalogue');
  assert.ok(cloudRequests.includes('ui/face/char/577.png'), 'the character portrait also previews on the seat');
  await mobileQuery.fill('剑引天霖');
  await mobileResults.getByRole('button', { name: /剑引天霖.*87002/ }).click();
  await mobilePicker.getByRole('img', { name: '剑引天霖预览' }).waitFor();
  const mobileSkills = mobilePicker.getByRole('group', { name: '外服技能' });
  for (const name of ['回天', '神霈', '天涛', '星魂']) {
    assert.equal(await mobileSkills.getByRole('button', { name, exact: true }).isVisible(), true);
  }
  assert.equal(await mobilePicker.locator('.voice-unidentified').isVisible(), false);
  await mobileSkills.getByRole('button', { name: '星魂', exact: true }).click();
  await mobilePicker.locator('.voice-playback[data-playing]').filter({ hasText: '星魂' }).waitFor();
  assert.ok(cloudRequests.includes('audio/skill/SKILL_87002_xingzhen_1.mp3'));
  await page.screenshot({ path: path.join(output, 'mobile-jiangwei-skill-names.png') });
  await mobileQuery.fill('30011');
  await mobileResults.getByRole('button', { name: /#30011$/ }).click();
  const victory = mobilePicker.getByRole('button', { name: '试听胜利配音', exact: true });
  assert.equal(await victory.isVisible(), true, 'victory audio can be played without expanding a list');
  assert.ok(await mobileMvpSwitch.evaluate(input => {
    const label = input.closest('label');
    return label.previousElementSibling.matches('.voice-victory') &&
      label.getBoundingClientRect().top >= label.previousElementSibling.getBoundingClientRect().bottom;
  }));
  await victory.press('Enter');
  await mobilePicker.locator('.voice-playback[data-playing]').filter({ hasText: '胜利' }).waitFor();
  assert.equal(await victory.getAttribute('aria-pressed'), null);
  await page.screenshot({ path: path.join(output, 'mobile-official-victory-voice.png') });
  await mobileClose.click();
  configUnavailable = true;
  await mobileToolboxEntry.click();
  await mobileQuery.fill('87001');
  await mobileResults.getByRole('button', { name: /神姜维.*87001/ }).waitFor();
  await mobilePicker.getByText(/使用缓存/).waitFor();
  await mobileClose.click();
  configUnavailable = false;
  configRelease = makeMobileConfigRelease({ title: '官方刷新演练', date: '202611200901', generals: mobileFilterGenerals });
  await mobileToolboxEntry.click();
  await mobileQuery.fill('87001');
  await mobileResults.getByRole('button', { name: /官方刷新演练.*87001/ }).waitFor();
  assert.equal(configRequests.filter(name => name === 'installer').length, 1);
  await mobileQuery.fill('张辽');
  await mobileRow.click();
  await mobilePicker.getByRole('img', { name: '登锋陷阵预览' }).waitFor();
  await visibleSeatPreview();
  await mobilePicker.getByRole('button', { name: '突袭', exact: true }).click();
  await mobilePicker.locator('.voice-playback[data-playing]').waitFor();
  assert.match(await mobilePicker.locator('audio').getAttribute('src'), /^blob:/);
  assert.ok(cloudRequests.includes('audio/skill/SKILL_1805_tuxi_1.mp3'));
  const mobileCardAudio = mobilePicker.getByRole('button', { name: '决斗', exact: true });
  const cardDetails = mobilePicker.locator('.voice-card');
  assert.equal(await mobileCardSwitch.isChecked(), false);
  assert.equal(await mobileMvpSwitch.isChecked(), false);
  assert.equal(await mobileCardAudio.isVisible(), false);
  assert.equal(await cardDetails.getAttribute('open'), null);
  await cardDetails.locator('summary').focus();
  await cardDetails.locator('summary').press('Enter');
  await mobileCardAudio.click();
  await mobilePicker.locator('.voice-playback[data-playing]').filter({ hasText: '决斗' }).waitFor();
  assert.equal(await mobileCardAudio.getAttribute('aria-pressed'), null, 'card voices are outside skill bindings');
  assert.equal(await mobilePicker.getByRole('button', { name: '突袭', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok(cloudRequests.includes('audio/skill/SKILL_1805_juedou_1.mp3'));
  const unidentifiedDetails = mobilePicker.locator('.voice-unidentified');
  assert.equal(await unidentifiedDetails.getAttribute('open'), null);
  await unidentifiedDetails.locator('summary').click();
  assert.equal(await unidentifiedDetails.getByRole('button', { name: '9999', exact: true }).isVisible(), true);
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 24, height: 420 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.equal(await mobilePicker.evaluate((host, { width, offset }) => {
        host.style.setProperty('--sgs-font-offset', offset + 'px');
        const dialog = host.shadowRoot.querySelector('dialog');
        const body = dialog.querySelector('.body');
        const art = dialog.querySelector('.art');
        const image = art.querySelector('img');
        return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
          parseFloat(getComputedStyle(dialog).fontSize) === 14 + offset && body.scrollWidth <= body.clientWidth + 1 &&
          image.getBoundingClientRect().width <= art.getBoundingClientRect().width + 1 && getComputedStyle(image).objectFit === 'contain';
      }, { width, offset }), true, `mobile preview fits at ${width}px and font offset ${offset}px`);
    }
    if (width === 248) {
      await mobilePicker.locator('.body').evaluate(node => { node.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, 'mobile-skins-picker-248.png') });
      await mobileCardAudio.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'mobile-card-voice-248.png') });
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  assert.equal(await portrait(), true);
  assert.equal(await page.evaluate(() => matchSelectorFixture.settings.get('localSkin.1001.101').kind), 'mobile');
  assert.equal(await page.evaluate(() => matchSelectorFixture.calls.filter(([type]) => type === 'skin').length), 1,
    'mobile skin stays local');
  assert.equal(cloudRequests.filter(name => name === 'audio/skill/SKILL_1805_juedou_1.mp3').length, 1,
    'card voice is not preloaded with replacement disabled');
  assert.ok(!cloudRequests.includes('audio/skill/SKILL_1805_9999_1.mp3'), 'unbound unknown clips are not preloaded');
  assert.equal(await page.evaluate(() => matchSelectorFixture.useCardVoice('决斗')), 'native:card:决斗');
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp()), [['native:mvp-egg'], []]);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp({ egg: false })), [['native:mvp-random'], []]);
  assert.deepEqual(await page.evaluate(() => {
    const { avatar, local } = matchSelectorFixture;
    const original = [avatar.width, avatar.height];
    const geometry = [];
    for (const [width, height] of [original, [102, 148], [160, 160]]) {
      avatar.size(width, height);
      local.refresh();
      const sprite = avatar.getChildByName('sgs-local-skin-portrait');
      const draw = sprite.graphics.cmds?.[0] ?? sprite.graphics._one;
      geometry.push([sprite.scrollRect.width, sprite.scrollRect.height, draw.width >= width - 1 && draw.height >= height - 1,
        Math.abs(draw.width / draw.height - draw.texture.width / draw.texture.height) < .01]);
    }
    avatar.size(...original);
    local.refresh();
    return geometry;
  }), [[130, 180, true, true], [102, 148, true, true], [160, 160, true, true]],
  'mobile art scales proportionally and covers the native seat at different aspect ratios');
  await page.screenshot({ path: path.join(output, 'mobile-skins-avatar.png'), clip: { x: 1016, y: 616, width: 138, height: 188 } });
  await page.getByRole('button', { name: '恢复原皮肤' }).click();
  assert.equal(await portrait(), false);
  await mobileToolboxEntry.click();
  await mobileQuery.fill('张辽');
  await mobileRow.click();
  await mobilePicker.getByRole('button', { name: '一键绑定' }).click();
  await mobileCardSwitch.check();
  await mobileMvpSwitch.check();
  await mobilePicker.getByText('无胜利配音时静音。').waitFor();
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 24, height: 560 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.ok(await mobilePicker.locator('.voice-extras').evaluate((options, { width, offset }) => {
        options.getRootNode().host.style.setProperty('--sgs-font-offset', offset + 'px');
        const dialog = options.closest('dialog'), body = options.closest('.body');
        const texts = [...options.querySelectorAll('label > span')].map(span => span.firstChild);
        texts.push(options.querySelector('small').firstChild);
        return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
          parseFloat(getComputedStyle(dialog).fontSize) === 14 + offset &&
          body.scrollWidth <= body.clientWidth + 1 && [...options.querySelectorAll('label')].every(label => {
            const area = label.getBoundingClientRect(), text = label.querySelector('span').getBoundingClientRect();
            const toggle = label.querySelector('input').getBoundingClientRect();
            return area.height >= 36 && toggle.width >= 30 && text.right < toggle.left && toggle.right <= area.right;
          }) && texts.every(text => {
            const range = document.createRange();
            range.selectNodeContents(text);
            return range.getClientRects().length === 1;
          });
      }, { width, offset }), `mobile voice switches fit at ${width}px and font offset ${offset}px`);
    }
    if (width === 248) {
      await mobileMvpSwitch.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'mobile-voice-replacement-248.png') });
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  const enabledMobileSelection = await page.evaluate(() => matchSelectorFixture.settings.get('localSkin.1001.101'));
  assert.deepEqual(enabledMobileSelection.voiceOptions, { card: true, victory: true });
  assert.deepEqual(Object.keys(enabledMobileSelection.bindings), ['31', '32', '33', '35']);
  assert.ok(Object.values(enabledMobileSelection.bindings).every(ref => ref[0] === enabledMobileSelection.bindings['31'][0]),
    'one available mobile skill voice binds to all four target skills in order');
  await page.waitForFunction(async () => {
    const url = matchSelectorFixture.useCardVoice('决斗');
    return url?.startsWith('blob:') && new Uint8Array(await (await fetch(url)).arrayBuffer()).at(-1) === 129;
  });
  assert.equal(await page.evaluate(() => matchSelectorFixture.useCardVoice('杀')), 'native:card:杀');
  assert.equal(await page.evaluate(() => matchSelectorFixture.useCardVoice('决斗', null, 'skill')), 'native:card:决斗');
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp()), [[], []],
    'explicit MVP replacement suppresses both native paths without a victory clip');
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp({ egg: false })), [[], []]);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp({ seatId: 1 })), [['native:mvp-egg'], []]);

  await mobileToolboxEntry.click();
  await mobileQuery.fill('30011');
  await mobileResults.getByRole('button', { name: /#30011$/ }).click();
  assert.equal(await mobileCardSwitch.isChecked(), false, 'preserve independent skin options');
  assert.equal(await mobileMvpSwitch.isChecked(), false);
  await mobileCardSwitch.check();
  await mobileMvpSwitch.check();
  await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  // Read both clips through the actual runtime Blob URLs after the next match
  // re-applies the skin from its stored selection.
  await page.evaluate(() => matchSelectorFixture.nextMatch());
  await page.waitForFunction(async () => {
    const [native, [victory]] = matchSelectorFixture.playMvp();
    const card = matchSelectorFixture.useCardVoice('决斗');
    if (native.length || !victory?.startsWith('blob:') || !card?.startsWith('blob:')) return false;
    const samples = await Promise.all([victory, card].map(async source =>
      new Uint8Array(await (await fetch(source)).arrayBuffer()).at(-1)));
    return samples[0] === 139 && samples[1] === 135;
  });
  await mobileToolboxEntry.click();
  await selectedMobileSkin.waitFor();
  assert.match(await selectedMobileSkin.textContent(), /#30011/);
  assert.equal(await mobileCardSwitch.isChecked(), true, 'the card toggle restores from the stored preference');
  assert.equal(await mobileMvpSwitch.isChecked(), true);
  await mobileCardSwitch.uncheck();
  await mobileMvpSwitch.uncheck();
  await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => matchSelectorFixture.useCardVoice('决斗')), 'native:card:决斗');
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.playMvp()), [['native:mvp-egg'], []]);
  await page.getByRole('button', { name: '恢复原皮肤' }).click();
  if (mobileMotionZip) {
    await mobileToolboxEntry.click();
    await mobileQuery.fill('10305');
    await mobileResults.getByRole('button', { name: /猪年圣诞.*10305.*动态/ }).click();
    await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-seat-preview')
      ?.getChildByName('sgs-mobile-idle')?.numChildren === 2);
    await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
    await mobilePicker.waitFor({ state: 'detached' });
    await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait')
      ?.getChildByName('sgs-mobile-idle')?.numChildren === 2);
    const mobileBounds = await page.evaluate(() => {
      const { avatar, local } = matchSelectorFixture;
      const previous = [avatar.width, avatar.height, avatar.scrollRect];
      const layer = avatar.getChildByName('sgs-local-skin-portrait');
      const person = layer.getChildByName('sgs-mobile-idle').getChildAt(1);
      avatar.scrollRect = null;
      avatar.size(146, 172);
      local.refresh();
      const single = [person.scaleX, person.scaleY, person.x];
      avatar.scrollRect = new Laya.Rectangle(36, 0, 74, 172);
      local.refresh();
      const deputy = [person.scaleX, person.scaleY, person.x, layer.scrollRect.width];
      avatar.scrollRect = previous[2];
      avatar.size(previous[0], previous[1]);
      local.refresh();
      return { single, deputy };
    });
    const { single, deputy } = mobileBounds;
    assert.ok(single[0] > 0 && single[0] === single[1]);
    assert.deepEqual(deputy.slice(0, 2), single.slice(0, 2), 'deputy preserves the complete mobile rig scale');
    assert.ok(Math.abs(deputy[2] - single[2] + 36) < 1e-6 && deputy[3] === 74, 'deputy crops the intended part of the rig');
    await page.screenshot({ path: path.join(output, 'mobile-skins-dynamic.png'), clip: { x: 1016, y: 616, width: 138, height: 188 } });
    await mobileToolboxEntry.click();
    await mobilePicker.locator('.skin-effects[open]:not([hidden])').waitFor();
    assert.match(await selectedMobileSkin.textContent(), /猪年圣诞.*#10305/);
    await mobileClose.click();
    await page.getByRole('button', { name: '恢复原皮肤' }).click();
    assert.equal(await portrait(), false);
  }
  await toolboxEntry.click();
  await chooseSkin();
  await picker.getByRole('img', { name: '青梅煮酒预览' }).waitFor();
  const cachedSeatRequests = fullPictures();
  await apply.click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(fullPictures(), cachedSeatRequests, 'reapplying uses the already loaded seat portrait');
  assert.equal(await portrait(), true);
  await page.evaluate(() => { matchSelectorFixture.open('ChangeSkinWindow'); });
  await clickSelector(0, 73);
  assert.equal(await portrait(), false, 'official selection clears the local portrait');
  await toolboxEntry.click();
  await query.fill('00000000000000');
  await picker.getByText('未找到匹配的皮肤').waitFor();
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    avatar.size(146, 172);
    const nameplate = new Laya.Sprite();
    nameplate.name = 'fixture-nameplate';
    nameplate.graphics.drawRect(0, 0, 110, 18, '#9a301e');
    avatar.addChild(nameplate);
  });
  await toolboxEntry.click();
  await query.fill('武诸葛亮');
  await crossResults.getByRole('button', { name: /千古一相.*523001/ }).click();
  const chosenArt = picker.getByRole('img', { name: '千古一相预览' });
  await chosenArt.waitFor();
  const chosenArtSrc = await chosenArt.getAttribute('src');
  const artworkRequests = windowPictures();
  const externalSkills = picker.getByRole('group', { name: '外服技能' });
  const ownSkills = picker.getByRole('group', { name: '武将技能' });
  await externalSkills.getByRole('button', { name: '保留原配音', exact: true }).click();
  await ownSkills.getByRole('button', { name: /牌面第三技/ }).click();
  await picker.getByRole('button', { name: '一键绑定' }).click();
  assert.equal(await ownSkills.getByRole('button', { name: /谦逊/ }).locator('small').textContent(), '武诸葛亮 · 千古一相 #523001 · 尽瘁');
  assert.equal(await ownSkills.getByRole('button', { name: /牌面第三技/ }).locator('small').textContent(), '保留原配音');
  await externalSkills.getByRole('button', { name: '随机', exact: true }).click();
  await ownSkills.getByRole('button', { name: /连营/ }).click();
  assert.equal(await ownSkills.getByRole('button', { name: /连营/ }).locator('small').textContent(), '随机配音 · 武诸葛亮 · 千古一相 #523001');
  const [zhugeSkill, zhugeDeath] = await Promise.all(['WuZhuGeLiang_JinCui_01.mp3', 'WuZhuGeLiang_Dead.mp3'].map(auditionFixture));
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skin/wuzhugeliang01/**', route =>
    route.fulfill(route.request().url().endsWith('_Dead.mp3') ? zhugeDeath : zhugeSkill));
  await picker.getByRole('button', { name: '选配音' }).click();
  await query.fill('武诸葛');
  assert.equal(await chosenArt.getAttribute('src'), chosenArtSrc);
  await crossResults.getByRole('button', { name: /经典形象.*123001/ }).click();
  assert.equal(await chosenArt.getAttribute('src'), chosenArtSrc);
  assert.deepEqual(windowPictures(), artworkRequests, 'browsing voice sources keeps the chosen artwork and skips voice-source art requests');
  await externalSkills.getByRole('button', { name: '尽瘁', exact: true }).click();
  await ownSkills.getByRole('button', { name: /牌面第四技/ }).click();
  await externalSkills.getByRole('button', { name: '阵亡', exact: true }).click();
  await ownSkills.getByRole('button', { name: /阵亡/ }).click();
  await picker.locator('.voice-playback[data-playing]').waitFor();
  assert.match(await picker.locator('audio').getAttribute('src'), /wuzhugeliang01\/WuZhuGeLiang_Dead\.mp3$/i);
  assert.equal(await ownSkills.getByRole('button', { name: /牌面第四技/ }).locator('small').textContent(), '武诸葛亮 · 经典形象 #123001 · 尽瘁');
  assert.equal(await ownSkills.getByRole('button', { name: /阵亡/ }).locator('small').textContent(), '武诸葛亮 · 经典形象 #123001 · 阵亡');
  assert.equal(await ownSkills.getByRole('button', { name: /谦逊/ }).locator('small').textContent(), '武诸葛亮 · 千古一相 #523001 · 尽瘁');
  assert.equal(await picker.locator('.footer p').textContent(), '立绘 · 武诸葛亮 · 千古一相 #523001');
  const alignedVoiceRows = rows => rows.length === 5 && rows.slice(1).every((row, i) =>
    row.left === rows[i].left && row.width === rows[i].width && row.top >= rows[i].bottom);
  const voiceRowBounds = rows => rows.map(row => row.getBoundingClientRect().toJSON());
  const ownVoiceRows = ownSkills.locator('button');
  assert.equal(alignedVoiceRows(await ownVoiceRows.evaluateAll(voiceRowBounds)), true);
  await page.screenshot({ path: path.join(output, 'yjcm-voice-bindings.png') });
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width, height: 400 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.equal(await picker.evaluate((host, { width, offset }) => {
        host.style.setProperty('--sgs-font-offset', offset + 'px');
        const dialog = host.shadowRoot.querySelector('dialog');
        const boxes = [...dialog.querySelectorAll('.body, .selection, .voice-group, .footer')];
        const bounds = dialog.getBoundingClientRect();
        return Math.abs(bounds.width - (width - 24)) < 1 && boxes.every(box => box.scrollWidth <= box.clientWidth + 1) &&
          parseFloat(getComputedStyle(dialog).fontSize) === 14 + offset;
      }, { width, offset }), true);
      assert.equal(alignedVoiceRows(await ownVoiceRows.evaluateAll(voiceRowBounds)), true);
    }
    if (width === 248) {
      await picker.evaluate(host => {
        for (const [key, value] of Object.entries({ scheme: 'light', bg: '#f7f3e9', text: '#372d1d',
          border: '#b8a685', muted: '#665943', accent: '#825621', surface: '#eee6d5', raised: '#e5d8bd' })) {
          host.style.setProperty('--sgs-' + key, value);
        }
        host.shadowRoot.querySelector('.voice-own').scrollIntoView({ block: 'end' });
      });
      await page.screenshot({ path: path.join(output, 'yjcm-voice-narrow-light.png') });
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await apply.click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(fullPictures().slice(-2), ['seat/static/523001.png', 'big/static/523001.png']);
  assert.equal(windowPictures().at(-1), 'window/523001.png');
  await page.mouse.move(1030, 630);
  await page.waitForFunction(() => matchSelectorFixture.mask.openTip?.generalHead.skin === 'res/current-tip.png');
  finishWindow();
  await page.waitForFunction(() => matchSelectorFixture.mask.openTip?.generalHead.texture?.width === 321);
  const assertWindowPreview = () => page.evaluate(() => {
    const tip = matchSelectorFixture.mask.openTip;
    const { generalHead: head, contentContainer: panel } = tip;
    const start = tip.localToGlobal(new Laya.Point(head.x, head.y), true);
    const width = head.texture.width * head.scaleX, height = head.texture.height * head.scaleY;
    const overlap = head.x + width - panel.x;
    return head.visible && head.skin === '' && head.texture.width === 321 && head.texture.height === 419 &&
      head.scaleX === head.scaleY && width >= 279 && width <= 280.01 && height <= 366.01 &&
      overlap > 0 && overlap <= width / 6 + .01 && tip.getChildIndex(head) < tip.getChildIndex(panel) &&
      start.x >= 7.99 && start.x + width <= Laya.stage.width - 7.99 &&
      start.y >= 7.99 && start.y + height <= Laya.stage.height - 7.99;
  });
  assert.equal(await assertWindowPreview(), true, 'the skill panel overlaps only the right edge of the full-size portrait');
  const translucentPoint = await page.evaluate(() => {
    const { generalHead: head } = matchSelectorFixture.mask.openTip;
    const point = head.localToGlobal(new Laya.Point(45, 62), true);
    return [Math.round(point.x), Math.round(point.y)];
  });
  const composite = await page.screenshot();
  await page.evaluate(() => { matchSelectorFixture.mask.openTip.generalHead.alpha = 0; });
  const underlay = await page.screenshot();
  await page.evaluate(() => { matchSelectorFixture.mask.openTip.generalHead.alpha = 1; });
  const [foreground] = await samplePixels(composite, [translucentPoint]);
  const [background] = await samplePixels(underlay, [translucentPoint]);
  const expected = [224, 100, 60].map((channel, index) => Math.round((channel + background[index]) / 2));
  assert.ok(foreground.every((channel, index) => Math.abs(channel - expected[index]) <= 2),
    `translucent window art blends with the scene: ${foreground} expected ${expected}`);
  const played = await page.evaluate(() => {
    const f = matchSelectorFixture;
    const start = f.played.length;
    for (const id of [31, 32, 32, 33, 34]) f.useSkill(id);
    f.useDamageSkill(33, 'native:retained-hurt');
    f.useDamageSkill(31, '');
    f.useDamageSkill(31, 'native:hurt');
    f.useSkill(35);
    f.useDeath();
    return f.played.slice(start);
  });
  assert.match(played.at(0), /wuzhugeliang02\/WuZhuGeLiang_JinCui/i);
  assert.match(played.at(1), /^https:\/\/web\.sanguosha\.com\//);
  assert.notEqual(played.at(1), played.at(2), 'unbound consecutive playback uses distinct clips');
  assert.deepEqual(played.slice(3, 6), ['native:33', 'native:34', 'native:retained-hurt']);
  assert.equal(played.at(6), '', 'damage without a native voice trigger stays quiet');
  assert.match(played.at(7), /JinCui/i);
  assert.match(played.at(8), /wuzhugeliang01\/WuZhuGeLiang_JinCui/i);
  assert.match(played.at(9), /wuzhugeliang01\/WuZhuGeLiang_Dead/i);
  await page.screenshot({ path: path.join(output, 'yjcm-window-preview.png') });
  const desktopX = await page.evaluate(() => {
    const tip = matchSelectorFixture.mask.openTip;
    const previous = tip.x;
    tip.x = 42;
    return previous;
  });
  await page.waitForFunction(() => {
    const tip = matchSelectorFixture.mask.openTip, head = tip.generalHead;
    const start = tip.localToGlobal(new Laya.Point(head.x, head.y), true);
    const width = head.texture.width * head.scaleX;
    return head.visible && head.scaleX === head.scaleY && Math.abs(start.x - 8) < .01 &&
      Math.abs(width - 182.4) < .01;
  });
  await page.screenshot({ path: path.join(output, 'yjcm-window-preview-narrow.png') });
  await page.evaluate(() => { matchSelectorFixture.mask.openTip.x = -12; });
  await page.waitForFunction(() => {
    const tip = matchSelectorFixture.mask.openTip, head = tip.generalHead;
    const start = tip.localToGlobal(new Laya.Point(head.x, head.y), true);
    return head.visible && Math.abs(start.x - 8) < .01 && Math.abs(head.texture.width * head.scaleX - 117.6) < .01;
  });
  await page.evaluate(x => { matchSelectorFixture.mask.openTip.x = x; }, desktopX);
  await page.waitForFunction(() => matchSelectorFixture.mask.openTip.generalHead.scaleX * 321 >= 279);
  await leaveSeat();
  const alignedSeat = await page.screenshot({
    path: path.join(output, 'yjcm-seat-nameplate.png'), clip: { x: 1020, y: 620, width: 146, height: 172 },
  });
  assert.deepEqual(await samplePixels(alignedSeat, [[80, 10], [80, 65], [114, 8], [140, 8], [140, 170]]),
    [[154, 48, 30], [213, 184, 101], [40, 67, 62], [40, 67, 62], [40, 67, 62]],
    'the complete source fills the top of the seat and leaves the native nameplate in front');
  const beforeWarm = fullPictures().length;
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.nextMatch(undefined, true, false, 4)), [false, true]);
  assert.equal(fullPictures().length, beforeWarm, 'a warm remembered skin is ready at first paint without a portrait request');
  assert.equal(await page.evaluate(() => {
    matchSelectorFixture.useSkill(33);
    return matchSelectorFixture.played.at(-1);
  }), 'native:33', 'the original skin voice is retained in the next match');
  assert.match(await page.evaluate(() => {
    matchSelectorFixture.useSkill(31);
    return matchSelectorFixture.played.at(-1);
  }), /JinCui/i, 'confirmed bindings and cross-server art restore in the next match');
  assert.match(await page.evaluate(() => {
    matchSelectorFixture.useDeath();
    return matchSelectorFixture.played.at(-1);
  }), /wuzhugeliang01\/WuZhuGeLiang_Dead/i, 'death voice from the alternate skin restores in the next match');
  const savedBeforeCold = await page.evaluate(() => {
    const f = matchSelectorFixture;
    const saved = f.settings.get('localSkin.1001.101');
    f.settings.set('localSkin.1001.101', { kind: 'cross', id: 523101, general: '武陆逊' });
    return saved;
  });
  const coldRequests = Promise.all([
    page.waitForRequest(request => request.url().endsWith('/seat/static/523101.png')),
    page.waitForRequest(request => request.url().endsWith('/big/static/523101.png'), { timeout: 3000 }),
  ]);
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.nextMatch(undefined, true, true, 3, true)), [false, false]);
  await coldRequests; // The matching full artwork starts while the seat request is still held open.
  assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.skinTex.visible), false);
  finishColdSeat();
  await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait'));
  await page.evaluate(() => {
    window.finishSkinSkills();
    matchSelectorFixture.settings.set('localSkin.1001.101', { kind: 'cross', id: 123101, general: '武陆逊' });
  });
  assert.deepEqual(await page.evaluate(() => matchSelectorFixture.nextMatch(undefined, true)), [false, false]);
  await page.waitForFunction(() => matchSelectorFixture.avatar.skinTex.visible &&
    !matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait'));
  await page.evaluate(saved => {
    const f = matchSelectorFixture;
    const { ui } = f;
    const before = ui.effectSprite.numChildren;
    ui.RePlayDebutEffect();
    const debut = ui.effectSprite.getChildAt(before);
    if (!debut?.played || !debut.EffectUrl.endsWith('/yinlongkuang.sk')) throw Error('恢复原皮肤后未还原武将等阶入场特效');
    debut.destroy(true);
    f.settings.set('localSkin.1001.101', saved);
    f.nextMatch();
  }, savedBeforeCold);

  for (const id of [1163001, 1163002]) {
    for (const [directory, synthetic] of [['seat/static', seatArt], ['big/static', bigArt], ['window', windowArt]]) {
      const resource = `${directory}/${id}.png`;
      officialArt.set(resource, officialFormDir ? await readFile(path.join(officialFormDir, resource.replaceAll('/', '-'))) : synthetic);
    }
  }
  let finishAlternate;
  const alternateGate = new Promise(resolve => { finishAlternate = resolve; });
  const alternateSeatUrl = 'https://web.sanguosha.com/x/pc/res/assets/runtime/general/seat/static/1163002.png';
  await page.route(alternateSeatUrl, async route => {
    await alternateGate;
    await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'image/png',
      body: officialArt.get('seat/static/1163002.png') });
  });
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skin/mouzhouyu*/**', route =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'audio/wav', body: silentClip }));
  await page.evaluate(() => {
    const f = matchSelectorFixture, render = new Laya.Sprite(), seatIndex = new Laya.Sprite();
    render.pos(1020, 620);
    render.zOrder = 50;
    Laya.stage.addChild(render);
    seatIndex.pos(-41, 145);
    seatIndex.size(32, 32);
    seatIndex.graphics.drawCircle(16, 16, 15, '#d49445', '#4b2819', 2);
    Object.defineProperties(seatIndex, { renderX: { get() { return this.x; } }, renderY: { get() { return this.y; } },
      renderWidth: { get() { return this.width; } }, renderHeight: { get() { return this.height; } } });
    render.addChild(seatIndex);
    Object.assign(f.ui.otherTopManager, { render, seatIndex });
    f.scope.add(() => render.destroy(true));
  });
  const nativeAppearance = () => page.evaluate(() => {
    const { generalCard } = matchSelectorFixture.avatar;
    return [generalCard.SkinId, generalCard.JueXingState];
  });
  const formState = () => page.evaluate(() => {
    const { render, seatIndex } = matchSelectorFixture.ui.otherTopManager;
    const button = render.getChildByName('sgs-yjcm-seat-form');
    return [button?.getChildByName('sgs-yjcm-form-number').text ?? null, seatIndex.alpha, Boolean(button?.visible)];
  });
  const waitForSeatForm = expected => page.waitForFunction(value => matchSelectorFixture.ui.otherTopManager.render
    .getChildByName('sgs-yjcm-seat-form')?.getChildByName('sgs-yjcm-form-number').text === value, expected);
  const seatFormGeometry = () => page.evaluate(() => {
    const { render, seatIndex } = matchSelectorFixture.ui.otherTopManager;
    const button = render.getChildByName('sgs-yjcm-seat-form');
    const point = (node, x, y) => node.localToGlobal(new Laya.Point(x, y), true);
    const expected = point(render, seatIndex.renderX + seatIndex.renderWidth / 2, seatIndex.renderY + seatIndex.renderHeight / 2);
    const center = point(button, button.width / 2, button.height / 2);
    return {
      center, aligned: Math.abs(expected.x - center.x) < 1 && Math.abs(expected.y - center.y) < 1,
    };
  });
  const clickSeatForm = async () => {
    const { center, aligned } = await seatFormGeometry();
    assert.equal(aligned, true, 'the form button is centered in the native seat-marker slot');
    await page.mouse.click(center.x, center.y);
  };
  const waitForMobileDeath = expected => page.waitForFunction(async marker => {
    const fixture = matchSelectorFixture;
    const plays = fixture.played.length;
    fixture.useDeath();
    const url = fixture.played.splice(plays).at(-1);
    if (!url?.startsWith('blob:')) return false;
    const clip = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return clip.at(-1) === marker;
  }, expected);
  const appearanceBeforeForms = await nativeAppearance();
  const rules = page.locator('[data-sgs-skin-form-rules]');
  const seatFormChoices = page.locator('[data-sgs-seat-form-choices]');
  const seatChoice = name => seatFormChoices.getByRole('button', { name, exact: true });
  const seatFormInteractive = () => page.evaluate(() => {
    const button = matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form');
    return Boolean(button?.mouseEnabled || (button && Laya.stage.focus === button));
  });
  const openWeiYanForms = async () => {
    await mobileToolboxEntry.click();
    await mobileQuery.fill('83501#2');
    await mobileResults.getByRole('button', { name: /经典形象.*83501/ }).click();
  };
  const mobileForms = mobilePicker.getByRole('group', { name: '皮肤形态' });
  const mobileFormNames = ['第一形态', '第二形态', '第三形态'];
  const mobileFormButton = index => mobileForms.getByRole('button', { name: mobileFormNames[index - 1], exact: true });
  await mobileToolboxEntry.click();
  await mobileQuery.fill('30012#1');
  await mobileResults.getByRole('button', { name: /#30012$/ }).click();
  assert.equal(await mobileForms.getByRole('button').count(), 2);
  await mobileFormButton(2).click();
  assert.equal(await mobileFormButton(2).getAttribute('aria-pressed'), 'true', 'forms with unknown transitions still support previews');
  await mobilePicker.getByRole('button', { name: '形态规则' }).click();
  await rules.getByRole('button', { name: '自定义' }).click();
  const customRoute = name => rules.getByRole('switch', { name: '启用 ' + name, exact: true });
  const firstToSecond = customRoute('第一形态 → 第二形态');
  const secondToFirst = customRoute('第二形态 → 第一形态');
  assert.equal(await firstToSecond.isChecked(), false);
  assert.equal(await secondToFirst.isChecked(), false, 'unverified skins offer opt-in edges without inventing defaults');
  await secondToFirst.check();
  await rules.getByRole('button', { name: '确认规则' }).click();
  await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  await waitForSeatForm('2/2');
  await clickSeatForm();
  await waitForSeatForm('1/2');
  assert.equal(await seatFormInteractive(), true, 'manual switching remains available without a reverse rule');
  await clickSeatForm();
  await waitForSeatForm('2/2');
  await page.getByRole('button', { name: '恢复原皮肤' }).click();
  await openWeiYanForms();
  assert.equal(await mobilePicker.locator('.result').count(), 1, 'searching for a form number finds one skin family');
  assert.equal(await mobileForms.getByRole('button').count(), 3);
  assert.deepEqual(await mobileForms.getByRole('button').allTextContents(), mobileFormNames);
  for (const form of [1, 2, 3]) {
    if (form === 3) await mobileFormButton(form).press('Enter');
    else await mobileFormButton(form).click();
    await mobilePicker.locator('.art img').waitFor();
    await mobileSkills.getByRole('button', { name: '阵亡', exact: true }).click();
    await mobilePicker.locator('.voice-playback[data-playing]').filter({ hasText: '阵亡' }).waitFor();
    assert.ok(cloudRequests.includes(formDeaths[form - 1][0]), 'audition plays the selected form');
  }
  assert.equal(await mobileFormButton(3).getAttribute('aria-pressed'), 'true');
  assert.ok(cloudRequests.includes('ui/face/skin/83501#2.png'), 'the third form uses its own portrait');
  await mobilePicker.getByRole('button', { name: '一键绑定' }).click();
  await mobilePicker.getByText('已为 3 个形态绑定配音。', { exact: true }).waitFor();
  await mobileCardSwitch.check();
  await mobilePicker.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await portrait(), false, 'an unfinished draft does not apply the skin');
  await mobileToolboxEntry.click();
  await mobileFormButton(3).waitFor();
  assert.equal(await mobileQuery.inputValue(), '83501#2');
  assert.equal(await mobileFormButton(3).getAttribute('aria-pressed'), 'true');
  assert.equal(await mobileCardSwitch.isChecked(), true);
  for (const [index, name] of ['虎威', '自立', '挑衅'].entries()) {
    await mobileFormButton(index + 1).click();
    const voice = mobilePicker.getByRole('group', { name: '武将技能' }).getByRole('button', { name: /谦逊/ }).locator('small');
    assert.match(await voice.textContent(), new RegExp(name + '$'));
  }
  await mobileCardSwitch.uncheck();
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 24, height: 420 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.ok(await mobileForms.evaluate((group, { width, offset }) => {
        group.getRootNode().host.style.setProperty('--sgs-font-offset', offset + 'px');
        const dialog = group.closest('dialog'), body = group.closest('.body');
        return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
          parseFloat(getComputedStyle(dialog).fontSize) === 14 + offset &&
          body.scrollWidth <= body.clientWidth + 1 &&
          [...group.querySelectorAll('button')].every(button => button.scrollWidth <= button.clientWidth + 1);
      }, { width, offset }), `mobile form chooser fits at ${width}px and font offset ${offset}px`);
    }
    if (width === 248) {
      await mobileFormButton(3).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'mobile-forms-248.png') });
    }
    if (width === 280) {
      const light = { scheme: 'light', surface: '#faf5e8', bg: '#fffaf2', raised: '#eee7d7',
        border: '#c2b598', muted: '#625843', text: '#372e1d', accent: '#815612' };
      const previous = await mobilePicker.evaluate((host, tokens) => Object.fromEntries(Object.entries(tokens).map(([key, color]) => {
        const property = '--sgs-' + key;
        const value = host.style.getPropertyValue(property);
        host.style.setProperty(property, color);
        return [property, value];
      })), light);
      await mobilePicker.locator('.selection').evaluate(selection => selection.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(output, 'mobile-forms-280-light.png') });
      await mobilePicker.evaluate((host, tokens) => {
        for (const [property, value] of Object.entries(tokens)) host.style.setProperty(property, value);
      }, previous);
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  const weiYanRuleKey = 'formRule.1001.101.mobile.cloud-83501';
  await page.evaluate(key => matchSelectorFixture.settings.set(key, {
    mode: 'custom', rules: [
      { kind: 'every', times: 1, skills: [31] },
      { kind: 'every', times: 1, skills: [32] },
      { kind: 'every', times: 1, skills: [32] },
    ],
  }), weiYanRuleKey);
  const openWeiYanRules = () => mobilePicker.getByRole('button', { name: '形态规则' }).click();
  await openWeiYanRules();
  const formDirections = rules.locator('.directions fieldset');
  const toSecond = rules.getByRole('group', { name: '第一形态 → 第二形态', exact: true });
  const toThird = rules.getByRole('group', { name: '第一形态 → 第三形态', exact: true });
  assert.deepEqual(await formDirections.locator('legend').allTextContents(), [
    '第一形态 → 第二形态', '第一形态 → 第三形态', '第二形态 → 第一形态',
    '第二形态 → 第三形态', '第三形态 → 第一形态', '第三形态 → 第二形态',
  ]);
  assert.deepEqual(await rules.getByRole('switch').evaluateAll(inputs => inputs.map(input => input.checked)),
    [true, true, false, false, false, false]);
  await customRoute('第一形态 → 第三形态').uncheck();
  assert.equal(await toThird.getByLabel('触发条件').isVisible(), false);
  await customRoute('第一形态 → 第三形态').check();
  assert.equal(await toSecond.getByLabel('触发条件').inputValue(), 'every');
  assert.equal(await toThird.getByLabel('触发条件').inputValue(), 'none', 'the previous cycle rules do not become a new branch trigger');
  await toThird.getByLabel('触发条件').selectOption('every');
  await toThird.getByLabel('技能 1', { exact: true }).selectOption('32');
  const confirmRules = () => rules.getByRole('button', { name: '确认规则' }).click();
  const applyMobileSkin = async () => {
    await mobilePicker.getByRole('button', { name: '使用皮肤' }).click();
    await mobilePicker.waitFor({ state: 'detached' });
  };
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 20, height: 420 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.ok(await rules.getByRole('dialog').evaluate((dialog, { width, offset }) => {
        dialog.getRootNode().host.style.setProperty('--sgs-font-offset', offset + 'px');
        const labels = [...dialog.querySelectorAll('.directions legend')];
        return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
          parseFloat(getComputedStyle(dialog).fontSize) === 13 + offset &&
          dialog.scrollWidth <= dialog.clientWidth + 1 && labels.every(label => {
            const range = document.createRange();
            range.selectNodeContents(label);
            return range.getClientRects().length === 1;
          });
      }, { width, offset }), `branch rules fit at ${width}px and font offset ${offset}px`);
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.screenshot({ path: path.join(output, 'mobile-three-form-rules.png') });
  await confirmRules();
  await applyMobileSkin();
  await waitForSeatForm('3/3');
  await mobileToolboxEntry.click();
  await selectedMobileSkin.waitFor();
  assert.match(await selectedMobileSkin.textContent(), /势[·・]?魏延.*#83501/);
  assert.equal(await mobileFormButton(3).getAttribute('aria-pressed'), 'true', 'reopening restores the bound mobile skin and its saved starting form');
  await page.screenshot({ path: path.join(output, 'mobile-bound-settings.png') });
  await mobilePicker.getByRole('button', { name: '关闭', exact: true }).click();
  assert.deepEqual(await formState(), ['3/3', 0, true], 'the mobile form badge uses the native seat-marker slot');
  await waitForMobileDeath(138);
  await page.screenshot({ path: path.join(output, 'mobile-seat-form-3.png'), clip: { x: 972, y: 616, width: 200, height: 190 } });
  const nextMatch = () => page.evaluate(() => matchSelectorFixture.nextMatch());
  const confirmMobileSkill = id => page.evaluate(skill => matchSelectorFixture.confirmSkill(skill), id);
  await nextMatch();
  await waitForSeatForm('3/3');
  await confirmMobileSkill(31);
  await confirmMobileSkill(32);
  assert.deepEqual(await formState(), ['3/3', 0, true], 'the saved third form has no automatic exit');
  await clickSeatForm();
  await seatChoice('第一形态').click();
  await waitForSeatForm('1/3');
  await waitForMobileDeath(136);

  await mobileToolboxEntry.click();
  await selectedMobileSkin.waitFor();
  await mobileFormButton(1).click();
  await openWeiYanRules();
  await toSecond.locator('select[aria-label="技能 1"]').locator('option[value="31"]').waitFor({ state: 'attached' });
  assert.equal(await toSecond.getByLabel('技能 1', { exact: true }).inputValue(), '31');
  assert.equal(await toThird.getByLabel('技能 1', { exact: true }).inputValue(), '32');
  await confirmRules();
  await mobileFormButton(1).click();
  await applyMobileSkin();
  await waitForSeatForm('1/3');
  const resizeMobileSeat = clipped => page.evaluate(useClip => {
    const { avatar, local } = matchSelectorFixture;
    avatar.size(...(useClip ? [120, 148] : [130, 180]));
    avatar.scrollRect = useClip ? new Laya.Rectangle(30, 5, 70, 138) : null;
    local.refresh();
  }, clipped);
  await resizeMobileSeat(true);
  assert.ok((await seatFormGeometry()).aligned, 'the form button stays aligned with the seat marker after the portrait is cropped');
  assert.deepEqual(await page.evaluate(() => {
    const { width, height } = matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait').scrollRect;
    return [width, height];
  }), [70, 138], 'the portrait still follows its own clip');
  await resizeMobileSeat(false);
  await waitForMobileDeath(136);
  await confirmMobileSkill(31);
  await waitForSeatForm('2/3');
  await waitForMobileDeath(137);
  await confirmMobileSkill(32);
  assert.deepEqual(await formState(), ['2/3', 0, true], 'a confirmed skill cannot leave the second form');
  assert.equal(await seatFormInteractive(), true);
  await nextMatch();
  await waitForSeatForm('1/3');
  await confirmMobileSkill(32);
  await waitForSeatForm('3/3');
  await waitForMobileDeath(138);
  await nextMatch();
  await waitForSeatForm('1/3');
  assert.equal(await seatFormInteractive(), true);
  await clickSeatForm();
  await seatChoice('第二形态').waitFor();
  assert.deepEqual(await formState(), ['1/3', 0, true], 'opening the branch chooser does not switch forms');
  await page.screenshot({ path: path.join(output, 'mobile-seat-form-choices.png') });
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 20, height: 420 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.ok(await seatFormChoices.getByRole('dialog').evaluate((dialog, { width, offset }) => {
        dialog.getRootNode().host.style.setProperty('--sgs-font-offset', offset + 'px');
        return Math.abs(dialog.getBoundingClientRect().width - Math.min(width, 300)) < 1 &&
          dialog.scrollWidth <= dialog.clientWidth + 1 &&
          [...dialog.querySelectorAll('.choices button')].every(button => {
            const range = document.createRange();
            range.selectNodeContents(button);
            return range.getClientRects().length === 1;
          });
      }, { width, offset }), `seat form choices fit at ${width}px and font offset ${offset}px`);
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await seatChoice('第二形态').click();
  await seatFormChoices.waitFor({ state: 'detached' });
  await waitForSeatForm('2/3');
  assert.equal(await seatFormInteractive(), true);
  await nextMatch();
  await waitForSeatForm('1/3');
  await clickSeatForm();
  await seatChoice('第二形态').waitFor();
  await page.keyboard.press('Escape');
  await seatFormChoices.waitFor({ state: 'detached' });
  assert.deepEqual(await formState(), ['1/3', 0, true], 'escape leaves the first form active');
  await page.keyboard.press('Enter');
  await seatChoice('第二形态').waitFor();
  assert.equal(await seatChoice('第二形态').evaluate(node => node.getRootNode().activeElement === node), true);
  await page.keyboard.press('Tab');
  assert.equal(await seatChoice('第三形态').evaluate(node => node.getRootNode().activeElement === node), true);
  await page.keyboard.press('Enter');
  await seatFormChoices.waitFor({ state: 'detached' });
  await waitForSeatForm('3/3');
  assert.equal(await seatFormInteractive(), true);
  assert.deepEqual(await nativeAppearance(), appearanceBeforeForms, 'mobile form controls keep native skin data');
  await page.evaluate(() => matchSelectorFixture.local.reset(matchSelectorFixture.local.ownPortraitTarget(101)));
  assert.deepEqual(await formState(), [null, 1, false], 'reset removes the form control and keeps the seat marker');
  await page.evaluate(() => {
    const fixture = matchSelectorFixture;
    fixture.settings.set('localSkin.1001.101', { kind: 'mobile', id: 'cloud-83501#1', general: '势魏延', bindings: {} });
    fixture.nextMatch();
  });
  await waitForSeatForm('2/3');
  await waitForMobileDeath(137);
  await mobileToolboxEntry.click();
  await selectedMobileSkin.waitFor();
  assert.match(await selectedMobileSkin.textContent(), /势[·・]?魏延.*#83501/);
  assert.equal(await mobileFormButton(2).getAttribute('aria-pressed'), 'true', 'a binding stored under an old form ID opens its skin family on that form');
  await mobilePicker.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => matchSelectorFixture.local.reset(matchSelectorFixture.local.ownPortraitTarget(101)));

  await toolboxEntry.click();
  await query.fill('谋周瑜');
  await crossResults.getByRole('button', { name: /经典形象.*1163001/ }).click();
  await picker.getByRole('img', { name: '经典形象预览' }).waitFor();
  await page.evaluate(() => matchSelectorFixture.settings.set('formRule.1001.101.cross.1163001', {
    mode: 'custom', rules: [{ kind: 'none' }, { kind: 'every', times: 2, skills: [36] }],
  }));
  await picker.getByRole('button', { name: '形态规则' }).click();
  await rules.getByText('旧规则绑定了其他武将的技能，请重新选择。').waitFor();
  const reverse = rules.getByRole('group', { name: '第二形态 → 第一形态' });
  const reverseSkill = reverse.getByLabel('技能 1', { exact: true });
  assert.deepEqual(await reverseSkill.locator('option').allTextContents(), ['选择技能', '谦逊', '连营', '牌面第三技', '牌面第四技']);
  assert.equal(await reverseSkill.inputValue(), '');
  await reverseSkill.selectOption('31');
  await rules.getByRole('button', { name: '关闭', exact: true }).click();
  await picker.getByRole('button', { name: '一键绑定' }).click();
  await picker.getByText('已为 2 个形态绑定配音。', { exact: true }).waitFor();
  await picker.getByRole('group', { name: '皮肤形态' }).getByRole('button', { name: '第二形态' }).click();
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  await toolboxEntry.click();
  const secondYjcmForm = picker.getByRole('group', { name: '皮肤形态' }).getByRole('button', { name: '第二形态' });
  await secondYjcmForm.waitFor();
  assert.equal(await secondYjcmForm.getAttribute('aria-pressed'), 'true');
  assert.equal(await query.inputValue(), '谋周瑜');
  assert.match(await ownSkills.getByRole('button', { name: /谦逊/ }).locator('small').textContent(), /融火$/);
  await picker.getByRole('button', { name: '形态规则' }).click();
  await reverseSkill.locator('option[value="31"]').waitFor({ state: 'attached' });
  assert.equal(await reverseSkill.inputValue(), '31', 'an unconfirmed form-rule field survives closing both windows');
  await rules.getByRole('button', { name: '确认规则' }).click();
  await picker.getByRole('group', { name: '皮肤形态' }).getByRole('button', { name: '第一形态' }).click();
  await picker.getByRole('button', { name: '选配音' }).click();
  await crossResults.getByRole('button', { name: /江山如画.*5163001/ }).click();
  await externalSkills.getByRole('button', { name: '英谋', exact: true }).click();
  await ownSkills.getByRole('button', { name: /^谦逊 / }).click();
  await externalSkills.getByRole('button', { name: '保留原配音', exact: true }).click();
  await ownSkills.getByRole('button', { name: /^牌面第三技 / }).click();
  await apply.click();
  await picker.waitFor({ state: 'detached' });
  const formVoice = () => page.evaluate(() => {
    const f = matchSelectorFixture;
    f.useSkill(31);
    f.useSkill(32);
    f.useSkill(33);
    f.useDeath();
    return f.played.slice(-4).map(url => url.split('/').at(-2) ?? url);
  });
  assert.deepEqual(await formState(), ['1/2', 0, true]);
  assert.ok((await seatFormGeometry()).aligned, 'Yjcm and mobile use the same native seat-marker position');
  assert.deepEqual(await formVoice(), ['mouzhouyu02', 'mouzhouyu01', 'native:33', 'mouzhouyu01']);
  const formRegion = { x: 965, y: 616, width: 208, height: 189 };
  const firstForm = await page.screenshot({ path: path.join(output, 'yjcm-seat-form-1.png'), clip: formRegion });
  const nextFormRequest = page.waitForRequest(request => request.url() === alternateSeatUrl);
  await clickSeatForm();
  await nextFormRequest;
  assert.deepEqual(await formState(), ['1/2', 0, true], 'the previous form remains active while the new portrait loads');
  assert.deepEqual(await formVoice(), ['mouzhouyu02', 'mouzhouyu01', 'native:33', 'mouzhouyu01']);
  finishAlternate();
  await page.waitForFunction(() => matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form')
    ?.getChildByName('sgs-yjcm-form-number').text === '2/2');
  assert.deepEqual(await formVoice(), ['mouzhouyu04', 'mouzhouyu03', 'native:33', 'mouzhouyu03']);
  const secondForm = await page.screenshot({ path: path.join(output, 'yjcm-seat-form-2.png'), clip: formRegion });
  if (officialFormDir) {
    const points = [[71, 18], [126, 101], [187, 79]];
    assert.notDeepEqual(await samplePixels(firstForm, points), await samplePixels(secondForm, points));
  }
  const pressSeatForm = async () => {
    await page.waitForFunction(() => {
      const button = matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form');
      return button?.mouseEnabled && Laya.stage.focus === button;
    });
    await page.evaluate(() => {
      const focused = document.activeElement;
      (focused?.shadowRoot?.activeElement ?? focused)?.blur();
    });
    await page.keyboard.press('Enter');
  };
  await pressSeatForm();
  await page.waitForFunction(() => matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form')
    ?.getChildByName('sgs-yjcm-form-number').text === '1/2');
  assert.deepEqual(await formVoice(), ['mouzhouyu02', 'mouzhouyu01', 'native:33', 'mouzhouyu01']);
  assert.deepEqual(await nativeAppearance(), appearanceBeforeForms);
  assert.equal(await page.evaluate(() => matchSelectorFixture.settings.get('localSkin.1001.101').id), 1163001);
  await pressSeatForm();
  await page.waitForFunction(() => matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form')
    ?.getChildByName('sgs-yjcm-form-number').text === '2/2');
  await page.evaluate(() => matchSelectorFixture.confirmSkill(36));
  assert.deepEqual(await formState(), ['2/2', 0, true]);
  await page.evaluate(() => matchSelectorFixture.confirmSkill(31));
  assert.deepEqual(await formState(), ['2/2', 0, true]);
  await page.evaluate(() => matchSelectorFixture.confirmSkill(31));
  await page.waitForFunction(() => matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-yjcm-seat-form')
    ?.getChildByName('sgs-yjcm-form-number').text === '1/2');
  await page.evaluate(() => matchSelectorFixture.local.reset(matchSelectorFixture.local.ownPortraitTarget(101)));
  assert.deepEqual(await formState(), [null, 1, false], 'reset removes the form control');

  await page.evaluate(() => {
    const f = matchSelectorFixture;
    f.enableDualNative();
    f.settings.set('unlockSkin', true);
    f.open('ChangeSkinWindow');
  });
  await clickSelector(0, 136);
  await rules.getByText('小于3血切换形态2', { exact: true }).waitFor();
  await rules.getByRole('button', { name: '自定义' }).click();
  const forward = rules.getByRole('group', { name: '第一形态 → 第二形态' });
  await forward.getByLabel('触发条件').selectOption('every');
  await forward.getByLabel('技能 1', { exact: true }).selectOption('32');
  await reverse.getByLabel('触发条件').selectOption('hp');
  await reverse.getByLabel('体力关系').selectOption('gte');
  await reverse.getByLabel('体力阈值').fill('3');
  await page.screenshot({ path: path.join(output, 'dual-form-rules.png') });
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width, height: 480 });
    for (const offset of [-1, 0, 2, 4]) {
      await rules.evaluate((node, value) => node.style.setProperty('--sgs-font-offset', value + 'px'), offset);
      assert.equal(await rules.getByRole('dialog').evaluate(dialog =>
        dialog.scrollWidth <= dialog.clientWidth &&
        [...dialog.querySelectorAll('.sgs-segments button')].every(button => button.scrollWidth <= button.clientWidth)), true,
        `form editor fits at ${width}px and font offset ${offset}`);
    }
  }
  await page.setViewportSize({ width: 280, height: 480 });
  await rules.evaluate(node => {
    for (const [key, value] of Object.entries({ scheme: 'light', surface: '#faf5e8', bg: '#fffaf2', raised: '#eee7d7',
      border: '#c2b598', muted: '#625843', text: '#372e1d', accent: '#815612' })) node.style.setProperty('--sgs-' + key, value);
  });
  await page.screenshot({ path: path.join(output, 'dual-form-rules-narrow-light.png') });
  await page.setViewportSize({ width: 1200, height: 850 });
  await rules.getByRole('button', { name: '确认规则' }).click();
  await rules.waitFor({ state: 'detached' });
  await page.evaluate(() => matchSelectorFixture.confirmSkill(32));
  const nativeForm = () => page.evaluate(() => matchSelectorFixture.ui.otherTopManager.render.getChildByName('sgs-local-seat-form')
    ?.getChildByName('sgs-yjcm-form-number').text);
  const waitNativeForm = expected => page.waitForFunction(form => matchSelectorFixture.ui.otherTopManager.render
    .getChildByName('sgs-local-seat-form')?.getChildByName('sgs-yjcm-form-number').text === form, expected);
  await waitNativeForm('2/2');
  assert.equal(await nativeForm(), '2/2');
  await page.evaluate(() => matchSelectorFixture.local.reset(matchSelectorFixture.local.refresh().find(target => target.isSelf)));
  assert.equal(await nativeForm(), undefined);

  await page.evaluate(() => {
    const f = matchSelectorFixture;
    f.enableConversion();
    f.open('ChangeSkinWindow');
  });
  await clickSelector(0, 136);
  await rules.getByRole('button', { name: '自定义' }).click();
  await forward.getByLabel('触发条件').selectOption('conversion');
  await reverse.getByLabel('触发条件').selectOption('conversion');
  assert.equal(await forward.getByLabel('转换技', { exact: true }).inputValue(), '37');
  assert.deepEqual(await forward.getByLabel('转换技', { exact: true }).locator('option').allTextContents(),
    ['选择技能', '演练衍生转换技（衍生）']);
  assert.equal(await forward.getByLabel('阴阳变化').inputValue(), 'yang');
  assert.equal(await reverse.getByLabel('阴阳变化').inputValue(), 'yin');
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width, height: 480 });
    for (const offset of [-1, 0, 2, 4]) {
      await rules.evaluate((node, value) => node.style.setProperty('--sgs-font-offset', value + 'px'), offset);
      assert.equal(await rules.getByRole('dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth &&
        [...dialog.querySelectorAll('.directions select')].filter(select => select.offsetParent).every(select =>
          select.getBoundingClientRect().right <= dialog.getBoundingClientRect().right)), true,
      `conversion rule editor fits at ${width}px with font offset ${offset}`);
    }
  }
  await page.setViewportSize({ width: 280, height: 480 });
  await rules.evaluate(node => {
    for (const [key, value] of Object.entries({ scheme: 'light', surface: '#faf5e8', bg: '#fffaf2', raised: '#eee7d7',
      border: '#c2b598', muted: '#625843', text: '#372e1d', accent: '#815612' })) node.style.setProperty('--sgs-' + key, value);
  });
  await page.screenshot({ path: path.join(output, 'dual-form-conversion-narrow-light.png') });
  await rules.getByRole('button', { name: '确认规则' }).click();
  await rules.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1200, height: 850 });
  assert.equal(await nativeForm(), '1/2');
  await page.evaluate(() => matchSelectorFixture.changeConversion(2));
  await waitNativeForm('2/2');
  assert.equal(await nativeForm(), '2/2');
  await page.evaluate(() => matchSelectorFixture.changeConversion(2));
  assert.equal(await nativeForm(), '2/2');
  await page.evaluate(() => matchSelectorFixture.changeConversion(1));
  await waitNativeForm('1/2');
  assert.equal(await nativeForm(), '1/2');
  await page.evaluate(() => {
    const f = matchSelectorFixture;
    f.local.reset(f.local.refresh().find(target => target.isSelf));
    f.openForms({ generalId: 102, name: '普通武将演练', value: { mode: 'custom' } });
  });
  await rules.getByRole('dialog').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-sgs-skin-form-rules]').shadowRoot.querySelector('.skill-status').hidden);
  assert.equal(await forward.getByLabel('触发条件').locator('option[value=conversion]').count(), 0);
  await rules.getByRole('button', { name: '关闭' }).click();

  if (officialMotionDir) {
    await page.evaluate(() => { matchSelectorFixture.openYjcm({ initialQuery: '赵云' }); });
    const linked = crossResults.getByRole('button', { name: /武动乾坤.*赵云.*600501.*动态/ });
    assert.equal(await crossResults.getByRole('button', { name: /武动乾坤/ }).count(), 1);
    await linked.click();
    const moving = picker.getByRole('img', { name: '武动乾坤动态预览' });
    await moving.waitFor();
    const frame = await moving.evaluate(canvas => canvas.toDataURL());
    await page.waitForFunction(previous => document.querySelector('[data-sgs-yjcm-skins]').shadowRoot.querySelector('canvas')?.toDataURL() !== previous, frame);
    await page.screenshot({ path: path.join(output, 'yjcm-dynamic-picker.png') });
    await checkIndexLayout();
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { matchSelectorFixture.openYjcm({ initialQuery: '赵云' }); });
    const previousMotionRequests = pictureRequests.filter(resource => resource.startsWith('big/dynamic/')).length;
    await linked.click();
    await picker.getByRole('img', { name: '武动乾坤预览', exact: true }).waitFor();
    assert.equal(await moving.count(), 0);
    assert.equal(pictureRequests.filter(resource => resource.startsWith('big/dynamic/')).length, previousMotionRequests);
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.evaluate(() => matchSelectorFixture.open('ChangeSkinWindow'));
    await page.mouse.click(crossButton.x, crossButton.y);
    await query.fill('赵云');
    await linked.click();
    const seatMotion = () => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-seat-preview')?.getChildByName('sgs-yjcm-idle');
    await page.waitForFunction(seatMotion);
    const avatar = await page.evaluateHandle(seatMotion);
    await apply.click();
    await picker.waitFor({ state: 'detached' });
    assert.equal(await avatar.evaluate(actor => actor.destroyed), true);
    await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait')?.getChildByName('sgs-yjcm-idle'));
    await page.screenshot({ path: path.join(output, 'yjcm-dynamic-seat.png') });

    const motionSeat = () => {
      const { avatar, motionScene } = matchSelectorFixture;
      const portrait = avatar.getChildByName('sgs-local-skin-portrait');
      const actor = portrait?.getChildByName('sgs-yjcm-idle');
      const overhang = motionScene.getChildByName('sgs-yjcm-idle-overhang');
      return actor && { x: actor.x, y: actor.y, scaleX: actor.scaleX, scaleY: actor.scaleY,
        width: portrait.width, height: portrait.height, overhang: overhang?.height };
    };
    await page.evaluate(async () => {
      const fixture = matchSelectorFixture;
      const { avatar, game, ui, local, settings } = fixture;
      local.reset(local.refresh().find(target => target.isSelf));
      const parent = avatar.parent, index = parent.getChildIndex(avatar), getScene = game.getScene;
      const previousCountry = ui.countryUI, previousFrame = ui.otherTopManager.selfCover;
      const unlockDynamic = settings.get('unlockDynamic', false);
      settings.set('unlockDynamic', false);
      const scene = fixture.motionScene = parent.addChild(new Laya.Sprite());
      const seatView = scene.addChild(new Laya.Sprite());
      seatView.addChild(avatar);
      const chat = scene.chatViewUI = scene.addChild(new Laya.Sprite());
      chat.pos(1020, 597);
      chat.zOrder = 2;
      const row = chat.bottomButtonBar = chat.addChild(new Laya.Sprite());
      row.size(146, 18);
      const input = chat.chatInput = row.addChild(new Laya.Sprite());
      input.size(146, 18);
      input.graphics.drawRect(0, 0, 146, 18, '#373029', '#686053', 1);
      const emoji = chat.superFaceBtn = row.addChild(new Laya.Text());
      Object.assign(emoji, { text: '☺', color: '#f4c85a', fontSize: 16 });
      emoji.size(18, 18).pos(123, 0);
      const plate = scene.addChild(new Laya.Sprite());
      plate.pos(976, 620);
      const bar = plate.addChild(new Laya.Sprite());
      bar.size(94, 20);
      bar.graphics.drawRect(0, 0, 94, 20, '#2e854c');
      const name = plate.addChild(new Laya.Text()), glyph = plate.addChild(new Laya.Text());
      Object.assign(name, { text: '滕芳兰', color: '#f8eddb', fontSize: 17 });
      name.size(70, 20).pos(22, 0);
      Object.assign(glyph, { text: '吴', color: '#fff8e8', fontSize: 17 });
      glyph.size(20, 20);
      ui.countryUI = { countryBg: bar, countryName: glyph, generalNameTxt: name, textSprite: plate };
      const cover = ui.otherTopManager.selfCover = seatView.addChild(new Laya.Sprite());
      cover.pos(1020, 620);
      cover.graphics.drawRect(.5, .5, 145, 171, null, '#c9ba9d', 2);
      avatar.getChildByName('fixture-nameplate').visible = false;
      game.getScene = () => scene;
      fixture.restoreMotionScene = () => {
        parent.addChildAt(avatar, index);
        scene.destroy(true);
        game.getScene = getScene;
        settings.set('unlockDynamic', unlockDynamic);
        ui.countryUI = previousCountry;
        ui.otherTopManager.selfCover = previousFrame;
        avatar.getChildByName('fixture-nameplate').visible = true;
        local.refresh();
      };
      avatar.size(146, 172);
      const [target] = local.refresh();
      const entry = fixture.motionEntry = { id: 6123201, general: '滕芳兰', name: '皓露沁兰', assets: [[0, '6123201']],
        motion: { resource: '8123201', files: ['daiji2.sk'] } };
      fixture.motionPreview = new AbortController();
      await local.previewYjcm(target, entry, fixture.motionPreview.signal);
    });
    const motionChromeFolded = () => {
      const { motionScene, ui } = matchSelectorFixture;
      return ui.otherTopManager.selfCover.alpha === 0 && !motionScene.chatViewUI.chatInput.visible;
    };
    const motionChromeExpanded = () => {
      const { motionScene, ui } = matchSelectorFixture;
      return ui.otherTopManager.selfCover.alpha === 1 && motionScene.chatViewUI.chatInput.visible;
    };
    await page.waitForFunction(seatMotion);
    assert.equal(await page.evaluate(motionChromeExpanded), true, 'a preview leaves both controls expanded');
    await page.evaluate(async () => {
      const fixture = matchSelectorFixture;
      fixture.motionPreview.abort();
      const [target] = fixture.local.refresh();
      await fixture.local.applyYjcm(target, fixture.motionEntry, {}, new AbortController().signal);
    });
    await page.waitForFunction(motionSeat);
    await page.waitForFunction(motionChromeFolded);
    const fullSeat = await page.evaluate(motionSeat);
    assert.equal(fullSeat.width, 146);
    assert.ok(Math.abs(fullSeat.scaleX * 190 - fullSeat.width) < .01, 'the authored card face covers the seat width');
    assert.ok(Math.abs(fullSeat.y - 115 * fullSeat.scaleY) < .01, 'the authored top edge stays flush with the seat');
    assert.ok(Math.abs(fullSeat.y + 134 * fullSeat.scaleY - fullSeat.height) < .01, 'the bottom of the painted card stays visible');
    const motionRegion = { x: 1016, y: 596, width: 157, height: 203 };
    await page.screenshot({ path: path.join(output, 'tengfanglan-dynamic-seat.png'), clip: motionRegion });
    await page.screenshot({ path: path.join(output, 'yjcm-dynamic-optimized.png'), clip: { x: 974, y: 596, width: 194, height: 199 } });
    await page.evaluate(() => {
      const { ui, local, motionScene } = matchSelectorFixture;
      ui.countryUI.textSprite.getChildByName('sgs-seat-name-toggle').event('click');
      motionScene.getChildByName('sgs-chat-row-toggle').event('click');
      local.refresh();
    });
    assert.equal(await page.evaluate(motionChromeExpanded), true, 'manual expansion survives a refresh with the same motion');

    await page.evaluate(() => {
      const { avatar, local } = matchSelectorFixture;
      avatar.size(74, 172);
      avatar.scrollRect = new Laya.Rectangle(36, 0, 74, 172);
      local.refresh();
    });
    await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait')?.width === 74);
    const halfSeat = await page.evaluate(motionSeat);
    assert.equal(halfSeat.scaleX, fullSeat.scaleX, 'clipping a dual-general seat preserves the full portrait scale');
    assert.equal(halfSeat.scaleY, fullSeat.scaleY);
    assert.equal(halfSeat.y, fullSeat.y);
    assert.equal(halfSeat.overhang, fullSeat.overhang);
    assert.ok(Math.abs(halfSeat.x - fullSeat.x + 36) < .001, 'the crop uses the native horizontal viewport offset');
    await page.evaluate(async () => {
      const { avatar, local } = matchSelectorFixture;
      avatar.size(146, 172);
      avatar.scrollRect = matchSelectorFixture.motionNativeClip = new Laya.Rectangle(0, 0, 146, 172);
      const [target] = local.refresh();
      const entry = { id: 5133801, general: '乐貂蝉', name: '月下翩跹', assets: [[0, '5133801']],
        motion: { resource: '7133801', files: ['daiji2.sk'] } };
      await local.applyYjcm(target, entry, {}, new AbortController().signal);
    });
    await page.waitForFunction(motionSeat);
    await page.waitForFunction(motionChromeFolded);
    const yuexiaSeat = await page.evaluate(motionSeat);
    assert.ok(Math.abs(yuexiaSeat.y - 115 * yuexiaSeat.scaleY) < .01, 'the headdress does not shift the painted panel down');
    assert.ok(Math.abs(yuexiaSeat.overhang - 20 * yuexiaSeat.scaleY) < .01, 'the authored headroom extends above the seat');
    assert.ok(Math.abs(yuexiaSeat.y + 134 * yuexiaSeat.scaleY - yuexiaSeat.height) < .01);
    assert.equal(yuexiaSeat.scaleX, fullSeat.scaleX);
    assert.equal(yuexiaSeat.scaleY, fullSeat.scaleY);
    await page.evaluate(() => {
      const { local, settings } = matchSelectorFixture;
      settings.set('yjcmDynamicOptimization', false);
      local.refresh();
    });
    assert.equal(await page.evaluate(motionChromeExpanded), true, 'turning off optimization restores both controls while the animation stays active');
    await page.evaluate(() => {
      const { avatar } = matchSelectorFixture;
      avatar.getChildByName('sgs-local-skin-portrait').getChildByName('sgs-yjcm-idle').index = 0;
    });
    const topRegion = { x: 1020, y: 598, width: 146, height: 16 };
    const paintedTop = await page.screenshot({ clip: topRegion });
    const firstPose = await page.screenshot({ path: path.join(output, 'yuexia-dynamic-seat.png'), clip: motionRegion });
    await page.evaluate(() => {
      const { avatar } = matchSelectorFixture;
      avatar.getChildByName('sgs-local-skin-portrait').getChildByName('sgs-yjcm-idle').index = 45;
    });
    const laterPose = await page.screenshot({ path: path.join(output, 'yuexia-dynamic-seat-later.png'), clip: motionRegion });
    assert.notDeepEqual(laterPose, firstPose, 'a later frame of the original motion is still rendered');
    await page.evaluate(() => {
      const { avatar } = matchSelectorFixture;
      avatar.getChildByName('sgs-local-skin-portrait').getChildByName('sgs-yjcm-idle').index = 0;
    });
    await page.evaluate(() => { matchSelectorFixture.motionScene.getChildByName('sgs-yjcm-idle-overhang').visible = false; });
    assert.notDeepEqual(await page.screenshot({ clip: topRegion }), paintedTop, 'the animated headdress stays visible where it crosses the chat edge');
    assert.equal(await page.evaluate(() => matchSelectorFixture.avatar.scrollRect === matchSelectorFixture.motionNativeClip), true);
    await page.evaluate(() => {
      const { local, settings } = matchSelectorFixture;
      settings.set('yjcmDynamicOptimization', true);
      local.refresh();
    });
    await page.waitForFunction(motionChromeFolded);

    const missingMotion = page.waitForResponse(response => response.url().endsWith('/700401/daiji2.sk'));
    await page.evaluate(async () => {
      const { local } = matchSelectorFixture;
      const [target] = local.refresh();
      const entry = local.yjcm.current.findYjcmSkin(700401, '诸葛亮');
      await local.applyYjcm(target, { ...entry, motion: { resource: '700401', files: ['daiji2.sk'] } }, {}, new AbortController().signal);
    });
    assert.equal((await missingMotion).status(), 404);
    await page.waitForFunction(() => {
      const portrait = matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait');
      return portrait?.visible && !portrait.getChildByName('sgs-yjcm-idle') &&
        matchSelectorFixture.ui.otherTopManager.selfCover.alpha === 1 && matchSelectorFixture.motionScene.chatViewUI.chatInput.visible;
    });
    assert.equal(await page.evaluate(() => !matchSelectorFixture.motionScene.getChildByName('sgs-yjcm-idle-overhang')), true);
    if (mobileMotionZip) {
      await page.evaluate(async () => {
        const { local } = matchSelectorFixture;
        const target = local.refresh().find(seat => seat.isSelf);
        const catalogue = local.mobile.current;
        await local.applyYjcm(target, catalogue.findSkin('cloud-83501', '势魏延'), {}, new AbortController().signal);
      });
      assert.equal(await page.evaluate(motionChromeExpanded), true, 'in-frame mobile art does not collapse the controls');
      await page.evaluate(async () => {
        const { local } = matchSelectorFixture;
        const target = local.refresh().find(seat => seat.isSelf);
        await local.applyYjcm(target, local.mobile.current.findSkin('cloud-10305'), {}, new AbortController().signal);
      });
      await page.waitForFunction(() => matchSelectorFixture.avatar.getChildByName('sgs-local-skin-portrait')
        ?.getChildByName('sgs-mobile-idle')?.numChildren === 2);
      await page.waitForFunction(motionChromeFolded);
      await page.screenshot({ path: path.join(output, 'mobile-skin-display-optimized.png'), clip: { x: 974, y: 567, width: 194, height: 228 } });
    }
    await page.evaluate(() => {
      const fixture = matchSelectorFixture;
      fixture.local.reset(fixture.local.refresh().find(target => target.isSelf));
      fixture.restoreMotionScene();
    });
  }

  for (const [resource, image] of [['window/193201.png', windowArt], ['seat/static/193201.png', seatArt], ['big/static/193201.png', bigArt]]) {
    officialArt.set(resource, image);
  }
  const paiYiUrls = ['01', '02'].map(suffix =>
    `https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skin/zhonghui06/ZhongHui_PaiYi_${suffix}.mp3`);
  for (const url of paiYiUrls) {
    const clip = await auditionFixture(url.split('/').at(-1));
    await page.route(url, route => route.fulfill(clip));
  }
  await page.evaluate(() => {
    const f = matchSelectorFixture, { seat } = f.ui;
    const general = seat.General;
    const skills = new Set([3913, 3914]);
    const properties = { CardId: 758, CardName: '界钟会', HasSkill: id => skills.has(id), HasSkillOnlyId: id => skills.has(id) };
    const saveProperties = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
    const oldGeneral = saveProperties(general, Object.keys(properties));
    const oldSeat = saveProperties(seat, ['GeneralId', ...Object.keys(capturedSeatSkillOwner)]);
    f.local.reset(f.local.ownPortraitTarget(seat.GeneralId));
    Object.assign(general, properties);
    Object.assign(seat, capturedSeatSkillOwner, { GeneralId: 758 });
    f.settings.set('crossServer', true);
    f.nextMatch(1001);
    f.openYjcm({ target: f.local.ownPortraitTarget(758), initialQuery: '钟会' });
    f.learnPaiYi = () => skills.add(3915);
    f.restoreGeneral = () => {
      f.local.reset(f.local.ownPortraitTarget(758));
      Object.assign(general, oldGeneral);
      Object.assign(seat, oldSeat);
    };
  });
  await crossResults.getByRole('button', { name: /界限突破.*193201/ }).click();
  const paiYiSource = externalSkills.getByRole('button', { name: '排异', exact: true });
  const paiYiTarget = ownSkills.getByRole('button', { name: /^排异 / });
  assert.equal(await page.evaluate(() => matchSelectorFixture.ui.seat.GetGeneralBySkillIdOnlyId(3915)), null);
  assert.equal(await paiYiTarget.locator('small').textContent(), '钟会 · 界限突破 #193201 · 排异');
  await picker.getByRole('button', { name: '一键绑定' }).click();
  for (const name of ['权计', '自立', '排异']) {
    assert.deepEqual(await ownSkills.getByRole('button', { name: new RegExp(`^${name} `) }).locator('small span').allTextContents(),
      [`钟会 · 界限突破 #193201 · ${name}`]);
  }
  await page.screenshot({ path: path.join(output, 'same-name-voice-bindings.png') });
  await externalSkills.getByRole('button', { name: '保留原配音', exact: true }).click();
  await paiYiTarget.click();
  for (const url of paiYiUrls) {
    await paiYiSource.click();
    await picker.locator('.voice-playback[data-playing]').waitFor();
    assert.equal(await picker.locator('audio').getAttribute('src'), url);
  }
  await paiYiTarget.focus();
  await page.keyboard.press('Enter');
  assert.equal(await paiYiTarget.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(output, 'yjcm-derived-paiyi.png') });
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 24, height: 480 });
    for (const offset of [-2, -1, 0, 2]) {
      assert.equal(await picker.evaluate((host, { width, offset }) => {
        host.style.setProperty('--sgs-font-offset', offset + 'px');
        const dialog = host.shadowRoot.querySelector('dialog');
        const boxes = [...dialog.querySelectorAll('.body, .selection, .voice-group, [data-skill="3915"]')];
        return Math.abs(dialog.getBoundingClientRect().width - width) < 1 &&
          boxes.every(box => box.scrollWidth <= box.clientWidth + 1);
      }, { width, offset }), true, `derived skill fits at ${width}px and font offset ${offset}`);
    }
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await apply.click();
  await picker.waitFor({ state: 'detached' });
  const paiYiPlayback = await page.evaluate(() => {
    const f = matchSelectorFixture, start = f.played.length;
    f.useSkill(3915, { GeneralID: 758 });
    f.learnPaiYi();
    f.useSkill(3915, { GeneralID: 758 });
    f.useSkill(3915, { GeneralID: 758 });
    const bindings = f.settings.get('localSkin.1001.758').bindings;
    f.restoreGeneral();
    return { sounds: f.played.slice(start), bindings };
  });
  assert.deepEqual(paiYiPlayback.bindings, { 3913: [438], 3914: [439], 3915: [440], '-1': [-1] });
  assert.equal(paiYiPlayback.sounds[0], 'native:3915');
  assert.deepEqual(paiYiPlayback.sounds.slice(1).sort(), paiYiUrls);

  await page.evaluate(() => {
    matchSelectorFixture.settings.set('unlockSkin', true);
    matchSelectorFixture.open('ChangeSkinWindow');
  });
  await page.mouse.click(crossButton.x, crossButton.y);
  await picker.getByRole('dialog').waitFor();
  await chooseSkin();
  await visibleSeatPreview();
  await page.evaluate(() => { matchSelectorFixture.open('ChangeSkinWindow'); matchSelectorFixture.scope.dispose(); });
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => {
    const { avatar } = matchSelectorFixture;
    return [Boolean(matchSelectorFixture.action()), avatar.skinItemID, avatar.skinTex.visible,
      Boolean(avatar.getChildByName('sgs-local-skin-seat-preview'))];
  }), [false, 10101, true, false]);
  if (officialSeatDir) {
    // The PNG routes now serve official art for paths previously served by synthetic fixtures.
    await page.evaluate(() => {
      matchSelectorFixture.owner.Close();
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('sgs-toolbox-cross-portrait');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Synthetic portrait cache is still open'));
      });
    });
    await setupMatchSelectorFixture();
    await page.evaluate(() => {
      const f = matchSelectorFixture;
      f.owner.Close();
      f.settings.values.delete('localSkin.1001.101');
      f.settings.set('crossServer', true);
      f.nextMatch();
      f.mountToolbox();
    });
    for (const [id, name] of [[123001, '经典形象'], [523001, '千古一相']]) {
      for (const directory of ['seat', 'big']) {
        officialArt.set(`${directory}/static/${id}.png`, await readFile(path.join(officialSeatDir, `${directory}-static-${id}.png`)));
      }
      officialArt.set(`window/${id}.png`, await readFile(path.join(officialSeatDir, `window-${id}.png`)));
      await toolboxEntry.click();
      await query.fill('武诸葛亮');
      await picker.getByRole('button', { name: new RegExp(name + '.*' + id) }).click();
      await visibleSeatPreview();
      await page.screenshot({ path: path.join(output, `yjcm-seat-preview-official-${id}.png`) });
      await apply.click();
      await picker.waitFor({ state: 'detached' });
      assert.deepEqual(fullPictures().slice(-2), [`seat/static/${id}.png`, `big/static/${id}.png`]);
      const screenshot = await page.screenshot({ path: path.join(output, `yjcm-seat-official-${id}.png`),
        clip: { x: 1020, y: 620, width: 146, height: 172 } });
      const edge = await samplePixels(screenshot, [[114, 2], [140, 2], [140, 15]]);
      assert.ok(edge.every(rgb => rgb.some(channel => channel > 65)), 'official artwork fills the exposed card face');
      await page.mouse.move(1030, 630);
      await page.waitForFunction(() => matchSelectorFixture.mask.openTip?.generalHead.texture?.width === 321);
      assert.equal(await assertWindowPreview(), true);
      await page.screenshot({ path: path.join(output, `yjcm-window-official-${id}.png`) });
      const restoration = await page.evaluate(() => {
        const f = matchSelectorFixture, tip = f.mask.openTip, texture = tip.generalHead.texture;
        f.local.reset(f.local.ownPortraitTarget(101));
        return [tip.generalHead.skin, tip.generalHead.x, tip.generalHead.y, tip.generalHead.scaleX,
          texture.destroyed, Boolean(f.avatar.getChildByName('sgs-local-skin-portrait'))];
      });
      assert.deepEqual(restoration, ['res/current-tip.png', 0, 0, 1, true, false]);
      await leaveSeat();
    }
    await page.evaluate(() => matchSelectorFixture.scope.dispose());
  }

  officialArt.set('window/523101.png', officialPreviewDir ? await readFile(path.join(officialPreviewDir, 'window-523101.png')) : windowArt);
  const xiongmuClips = await Promise.all(['xiongmu-01.mp3', 'xiongmu-02.mp3'].map(auditionFixture));
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skin/wuluxun02/**', route =>
    route.fulfill(xiongmuClips[route.request().url().endsWith('_01.mp3') ? 0 : 1]));
  await page.addScriptTag({ content: `window.capturedGeneralSkin={${generalSkinTitle},${generalSkinCards}};` });
  const hallEntryPosition = await page.evaluate(() => {
    const { Laya: laya } = window;
    const scope = new NativeSkinCheck.ResourceScope();
    const settings = skinFixture.ctx.settings;
    settings.set('crossServer', false);
    const game = { isInGame: () => false, getSelf: () => ({ ClientId: 1001 }),
      downloadMobileSkinAsset: async (url, { signal }) => (await fetch(url, { signal })).arrayBuffer(),
      loadConfigData: () => Promise.reject(new Error('大厅演练必须沿用本机索引缓存')),
      getConfigData: name => name === 'character' ? { GameCharacters: { character: [{ a: 302, j: 940, k: 703 }] } } :
        { GameSpells: { spell: [{ a: 940, c: '龙胆' }, { a: 703, c: '涯角' }] } } };
    const ctx = NativeSkinCheck.prepareSkinContext({ window, document, scope, settings, game });
    const local = NativeSkinCheck.createLocalSkins(ctx);
    const view = Object.assign(new laya.Sprite(), { generalId: 302, generalInfo: { ItemNameSimpleNoColor: '界赵云', showName: '赵云' },
      panel: new laya.Sprite(), showSkins: capturedGeneralSkin.showSkins,
      initskinData() { this.baseSkinVos = ['经典形象', '赤胆龙心', '战场游龙', '武动乾坤']; } });
    view.panel.UpdateDrawContent = () => {};
    view.pos(330, 210); view.size(504, 430); view.addChild(view.panel);
    view.graphics.drawRect(0, 0, view.width, view.height, '#28241f', '#776450', 1);
    const prior = {};
    for (const key of ['T$t', 'fO', 'CO', 'JJt', 'AM', 'mNt', 'le', 'p7i']) prior[key] = window[key];
    window.T$t = class extends laya.Sprite {
      textureList = [];
      addDrawChild(node) { this.textureList.push(node); this.addChild(node); }
    };
    window.fO = class extends laya.Sprite {
      constructor() { super(); this.size(300, 25); this.graphics.drawRect(0, 20, 300, 1, '#725644'); }
      posInteger(x, y) { this.pos(x, y); }
    };
    window.CO = class extends laya.Text { posInteger(x, y) { this.pos(x, y); } };
    window.JJt = { I: () => ({ GetHasAllSKinByGeneralId: () => [17, 18] }) };
    window.AM = { FZLT: 'Microsoft YaHei' };
    window.mNt = { GetRes: () => null };
    window.le = { F: (_, a, b) => a + '/' + b };
    window.p7i = class extends laya.Sprite {
      constructor() { super(); this.size(90, 180); this.graphics.drawRect(0, 0, 90, 180, '#302a22', '#776450', 1); }
      updateInfo(name) {
        const label = new laya.Text();
        Object.assign(label, { text: name, color: '#e8d6ad', fontSize: 14, width: 90, y: 155, align: 'center' });
        this.addChild(label);
      }
    };
    try { capturedGeneralSkin.initTitle.call(view); view.showSkins(); } finally { Object.assign(window, prior); }
    laya.stage.addChild(view);
    const openYjcm = NativeSkinCheck.createYjcmPicker(ctx, local);
    NativeSkinCheck.createGeneralSkinsEntry(ctx, openYjcm, options => openYjcm(options, 'mobile'));
    const button = view.skinTitle.getChildByName('sgs-yjcm-general-skins');
    const title = view.skinTitle.textureList.find(node => node.text === '界赵云');
    const point = button.localToGlobal(new laya.Point(button.width / 2, button.height / 2), true);
    const firstCard = view.baseSkinItems[0].localToGlobal(new laya.Point(0, 0), true);
    window.hallSkinFixture = { view, scope, settings, openYjcm, title };
    return { x: point.x, y: point.y, cardGap: point.x - button.width / 2 - firstCard.x };
  });
  assert.ok(hallEntryPosition.cardGap <= 0);
  for (const [scaleX, scaleY] of [[1, 1], [.72, .72], [1.13, .85]]) {
    const pair = await page.evaluate(({ scaleX, scaleY }) => {
      const { view, title } = hallSkinFixture;
      view.scale(scaleX, scaleY);
      return NativeSkinCheck.measureSkinButtons(view.skinTitle, 'sgs-yjcm-general-skins', '__sgsSkinToolMobileGeneralEntry', title, 'x');
    }, { scaleX, scaleY });
    assertButtonPair(pair.buttons, `hall skin header at ${scaleX} × ${scaleY}`);
    assert.ok(pair.buttons[0].left >= pair.parent && pair.buttons[1].right <= pair.boundary - 8 * scaleX,
      'hall entries fit in the header and leave room for the general name');
  }
  await page.evaluate(() => hallSkinFixture.view.scale(1, 1));
  await page.screenshot({ path: path.join(output, 'yjcm-hall-entry.png') });
  await page.mouse.click(hallEntryPosition.x, hallEntryPosition.y);
  assert.equal(await query.inputValue(), '赵云');
  assert.equal(await picker.locator('.footer p').textContent(), '界赵云 · 局内仅自己可见');
  await page.screenshot({ path: path.join(output, 'yjcm-hall-search.png') });
  const zhaoYun = crossResults.getByRole('button', { name: /赤胆龙心.*506403/ });
  await zhaoYun.click();
  const nativeVoices = picker.getByRole('group', { name: '武将技能' });
  const longDan = nativeVoices.getByRole('button', { name: /^龙胆 / });
  const yaJiao = nativeVoices.getByRole('button', { name: /^涯角 / });
  assert.equal(await longDan.locator('small').textContent(), '赵云 · 赤胆龙心 #506403 · 龙胆');
  assert.equal(await yaJiao.locator('small').textContent(), '赵云 · 赤胆龙心 #506403 · 涯角');
  await picker.getByRole('group', { name: '外服技能' }).getByRole('button', { name: '随机', exact: true }).click();
  await longDan.click();
  assert.equal(await longDan.locator('small').textContent(), '随机配音 · 赵云 · 赤胆龙心 #506403');
  await externalSkills.getByRole('button', { name: '保留原配音', exact: true }).click();
  await yaJiao.click();
  await picker.getByRole('button', { name: '下次使用' }).click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => hallSkinFixture.settings.get('localSkin.1001.302').bindings), { 940: [], 703: 'native' });
  await page.keyboard.press('Enter');
  assert.match(await picker.locator('.result[aria-pressed=true]').textContent(), /赤胆龙心/);
  assert.equal(await longDan.locator('small').textContent(), '随机配音 · 赵云 · 赤胆龙心 #506403');
  assert.equal(await yaJiao.locator('small').textContent(), '保留原配音');
  await query.fill('武陆逊');
  const wuLuxun = crossResults.getByRole('button', { name: /神秀峥嵘.*523101/ });
  await wuLuxun.click();
  await picker.getByRole('img', { name: '神秀峥嵘预览' }).waitFor();
  const xiongmu = picker.getByRole('button', { name: '雄幕', exact: true });
  const audio = picker.locator('audio');
  for (const suffix of ['01', '02', '01']) {
    await xiongmu.click();
    await picker.locator('.voice-playback[data-playing]').waitFor();
    assert.match(await audio.getAttribute('src'), new RegExp('XiongMu_' + suffix + '\\.mp3$'));
    assert.equal(await audio.evaluate(node => node.paused), false);
  }
  await page.screenshot({ path: path.join(output, 'yjcm-hall-audition.png') });
  await longDan.click();
  await audio.evaluate(node => { window.lastHallAudio = node; });
  await picker.getByRole('button', { name: '下次使用' }).click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => {
    const f = hallSkinFixture;
    return [f.settings.get('localSkin.1001.302'), f.settings.get('crossServer'), lastHallAudio.paused, lastHallAudio.hasAttribute('src')];
  }), [{ kind: 'cross', id: 523101, general: '武陆逊', bindings: { 940: [523] } }, false, true, false]);
  await page.keyboard.press('Enter');
  assert.match(await picker.locator('.result[aria-pressed=true]').textContent(), /神秀峥嵘.*武陆逊/,
    'reopening with the keyboard opens the saved skin even when it belongs to a different general');
  await query.fill('乐曹植');
  await crossResults.getByRole('button', { name: /经典形象.*1134101/ }).click();
  for (const [label, filename] of [
    ['赋乐', 'YueCaoZhi_FuYue_01.mp3'],
    ['文澜', 'YueCaoZhi_WenLan_01.mp3'],
    ['阵亡', 'YueCaoZhi_Dead.mp3'],
  ]) {
    const url = 'https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skin/yuecaozhi01/' + filename;
    const sample = await auditionFixture(filename);
    await page.route(url, route => route.fulfill(sample));
    await externalSkills.getByRole('button', { name: label, exact: true }).click();
    await picker.locator('.voice-playback[data-playing]').waitFor();
    assert.equal(await audio.getAttribute('src'), url);
    assert.equal(await audio.evaluate(node => node.paused), false);
  }
  await page.screenshot({ path: path.join(output, 'yjcm-hall-yue-cao-zhi.png') });
  await page.evaluate(() => { hallSkinFixture.view.visible = false; });
  await picker.waitFor({ state: 'detached' });
  await page.evaluate(() => { hallSkinFixture.view.visible = true; hallSkinFixture.view.scale(.84, .78); });
  await page.waitForFunction(() => hallSkinFixture.view.skinTitle.getChildByName('__sgsSkinToolMobileGeneralEntry')?.visible);
  const hallMobile = await page.evaluate(() => {
    const button = hallSkinFixture.view.skinTitle.getChildByName('__sgsSkinToolMobileGeneralEntry');
    return button.localToGlobal(new Laya.Point(button.width / 2, button.height / 2), true);
  });
  await page.mouse.click(hallMobile.x, hallMobile.y);
  assert.equal(await mobileQuery.inputValue(), '赵云');
  await mobileQuery.fill('张辽');
  await mobileRow.click();
  await mobilePicker.getByRole('img', { name: '登锋陷阵预览' }).waitFor();
  await mobilePicker.getByRole('button', { name: '下次使用' }).click();
  await mobilePicker.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => hallSkinFixture.settings.get('localSkin.1001.302').kind), 'mobile');
  await page.mouse.click(hallMobile.x, hallMobile.y);
  await selectedMobileSkin.waitFor();
  assert.match(await selectedMobileSkin.textContent(), /登锋陷阵/);
  await page.evaluate(() => { hallSkinFixture.view.visible = false; });
  await mobilePicker.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => {
    const { view, scope } = hallSkinFixture;
    const removed = !view.skinTitle.getChildByName('sgs-yjcm-general-skins') &&
      !view.skinTitle.getChildByName('__sgsSkinToolMobileGeneralEntry');
    scope.dispose();
    return removed;
  }), true);

  const voiceIndexRefresh = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('sgs-toolbox-yjcm-index-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('catalogue', 'readwrite'), store = tx.objectStore('catalogue');
        const request = store.get('latest');
        request.onsuccess = () => {
          const record = request.result;
          record.savedAt = Date.now();
          record.version = 'previous-official-version';
          delete record.data.voiceSchema;
          record.data.voiceSkins[193201] = record.data.voiceSkins[193201].map(([general, rows]) =>
            [general, rows.filter(([skill]) => skill !== 440 && skill !== 1449)]);
          store.put(record, 'latest');
        };
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const scope = new NativeSkinCheck.ResourceScope(), loads = [];
    const index = NativeSkinCheck.createYjcmCatalogue({ scope, window, game: {
      async loadConfigData(name, { knownVersion }) {
        loads.push([name, knownVersion ?? null]);
        return window.yjcmSourceFixture;
      },
    } });
    const hasPaiYi = catalogue => catalogue.yjcmSkillVoices(catalogue.findYjcmSkin(193201, '界钟会')).some(voice => voice.name === '排异');
    try {
      await index.warm();
      const needsRefresh = index.needsRefresh;
      const before = hasPaiYi(index.cached);
      const after = hasPaiYi(await index.load());
      return { needsRefresh, before, after, loads };
    } finally { scope.dispose(); }
  });
  assert.deepEqual(voiceIndexRefresh, { needsRefresh: true, before: false, after: true, loads: [['yjcm-skins', null]] });

  await page.evaluate(async artSource => {
    const scene = new Laya.Sprite();
    scene.pos(742, 464);
    scene.graphics.drawRect(0, 0, 420, 164, '#182729', '#3e4f4c', 1);
    scene.zOrder = 80;
    Laya.stage.addChild(scene);
    if (artSource) {
      const image = new Image();
      image.src = artSource;
      await image.decode();
      const bitmap = new Laya.Texture2D(image.naturalWidth, image.naturalHeight);
      bitmap.loadImageSource(image, true);
      const texture = new Laya.Texture(bitmap);
      scene.graphics.drawTexture(texture, 264, 61, 146, 172);
    }
    const frame = scene.addChild(new Laya.Sprite());
    frame.pos(264, 61);
    frame.alpha = .8;
    frame.graphics.drawRect(1, 1, 144, 170, null, '#d9d5c6', 2);
    frame.graphics.drawRect(3, 3, 140, 166, null, '#252124', 2);
    const plate = scene.addChild(new Laya.Sprite());
    plate.pos(199, 80);
    const bar = plate.addChild(new Laya.Sprite());
    bar.size(97, 21);
    bar.graphics.drawPoly(0, 0, [0, 0, 92, 0, 97, 11, 92, 21, 0, 21], '#2e854c', '#71b881', 1);
    const glyph = plate.addChild(new Laya.Text());
    Object.assign(glyph, { text: '蜀', fontSize: 19, bold: true, color: '#f7ffdd', stroke: 2, strokeColor: '#254d38' });
    glyph.pos(3, 0); glyph.size(23, 21);
    const name = plate.addChild(new Laya.Text());
    Object.assign(name, { text: '滕芳兰', fontSize: 17, bold: true, color: '#fff4db', stroke: 2, strokeColor: '#153221' });
    name.pos(28, 1); name.size(61, 19);
    const drawPart = node => ({ render: plate, get alpha() { return node.alpha; }, set alpha(value) { node.alpha = value; },
      get visible() { return node.visible; }, get renderVisible() { return node.visible; },
      get renderX() { return node.x; }, get renderY() { return node.y; },
      get renderWidth() { return node.width; }, get renderHeight() { return node.height; } });
    const country = { render: plate, textSprite: plate, countryBg: drawPart(bar), countryName: drawPart(glyph), generalNameTxt: name };
    const ui = scene.SelfSeatUi = { countryUI: country, otherTopManager: { selfCover: frame } };
    const chat = scene.chatViewUI = scene.addChild(new Laya.Sprite());
    chat.pos(99, 6); chat.size(310, 66);
    const feed = chat.msgContainer = chat.addChild(new Laya.Text());
    Object.assign(feed, { text: '【房间】准备好了', color: '#e2d9ae', fontSize: 14 });
    feed.pos(7, 19);
    const row = chat.bottomButtonBar = chat.addChild(new Laya.Sprite());
    row.size(310, 22);
    const background = chat.bottonBg = row.addChild(new Laya.Sprite());
    background.size(310, 22);
    background.posInteger = background.pos;
    background.graphics.drawRect(0, 0, 310, 22, '#332c21', '#716047', 1);
    const input = chat.chatInput = row.addChild(new Laya.Input());
    input.size(220, 21);
    input.color = '#f2e7c0';
    input.fontSize = 13;
    input.padding = [2, 5, 2, 5];
    input.text = '待发送的消息';
    const hint = chat.tipView = row.addChild(new Laya.Sprite());
    hint.visible = false;
    const send = chat.sendBtn = row.addChild(new Laya.Text());
    Object.assign(send, { text: '发送', color: '#ffe3a3', fontSize: 14, align: 'center' });
    send.size(40, 20); send.y = 2;
    const emoji = chat.superFaceBtn = row.addChild(new Laya.Sprite());
    emoji.size(19, 19); emoji.y = 1;
    emoji.graphics.drawCircle(9, 9, 8, '#eac464', '#b78235', 1);
    emoji.graphics.drawCircle(6, 7, 1, '#352719');
    emoji.graphics.drawCircle(12, 7, 1, '#352719');
    emoji.graphics.drawLines(0, 0, [5, 11, 9, 14, 13, 11], '#352719', 1);
    const normalFace = chat.faceBtn = row.addChild(new Laya.Sprite());
    normalFace.visible = false;
    let emojiClicks = 0;
    emoji.on('click', emoji, () => { emojiClicks++; });
    chat.layoutBottomButtonBar = capturedChatRowLayout;
    chat.checkTipView = function () { this.tipView.visible = true; };
    chat.layoutBottomButtonBar();
    const nativeEmojiX = emoji.x;
    const scope = new NativeSkinCheck.ResourceScope();
    const game = { isInGame: () => true, getScene: () => scene, getSelfSeatUI: () => ui, getSeatUIs: () => [] };
    const settings = { get(_key, fallback) { return fallback; } };
    NativeSkinCheck.createLocalSkins(NativeSkinCheck.prepareSkinContext({ window, document, scope, game, settings }));
    window.battleCollapseFixture = { scope, scene, bar, name, glyph, frame, plate, chat, row, nativeEmojiX,
      get emojiClicks() { return emojiClicks; } };
  }, officialMotionDir ? 'data:image/png;base64,' + officialArt.get('seat/static/6123201.png').toString('base64') : null);
  const chromeRegion = { x: 718, y: 463, width: 447, height: 165 };
  const clickBattleControl = async control => {
    const point = await page.evaluate(key => {
      const { plate, scene, chat } = battleCollapseFixture;
      const node = key === 'name' ? plate.getChildByName('sgs-seat-name-toggle')
        : key === 'former-name' ? battleCollapseFixture.name
          : key === 'chat' ? scene.getChildByName('sgs-chat-row-toggle') : chat.superFaceBtn;
      const p = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2), true);
      return { x: p.x, y: p.y };
    }, control);
    await page.mouse.click(point.x, point.y);
  };
  await page.waitForFunction(() => battleCollapseFixture.plate.getChildByName('sgs-seat-name-toggle')?.visible &&
    battleCollapseFixture.scene.getChildByName('sgs-chat-row-toggle')?.visible);
  await page.screenshot({ path: path.join(output, 'battle-chrome-expanded.png'), clip: chromeRegion });
  await clickBattleControl('name');
  const factionFocusRing = () => page.evaluate(() => {
    const button = battleCollapseFixture.plate.getChildByName('sgs-seat-name-toggle');
    return button.graphics.getBounds().width > 0;
  });
  assert.equal(await factionFocusRing(), false, 'pointer collapse leaves only the original faction emblem');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => battleCollapseFixture.frame.alpha), .8);
  assert.equal(await factionFocusRing(), true, 'keyboard operation still shows focus when it expands the name bar');
  await page.keyboard.press('Space');
  assert.equal(await factionFocusRing(), true);
  await page.keyboard.press('Escape');
  await clickBattleControl('chat');
  const battleChrome = () => page.evaluate(() => {
    const { scene, bar, name, glyph, frame, chat, nativeEmojiX, emojiClicks } = battleCollapseFixture;
    const { chatInput, sendBtn, msgContainer, superFaceBtn, faceBtn, bottomButtonBar } = chat;
    const toggle = scene.getChildByName('sgs-chat-row-toggle');
    return { nameAlpha: name.alpha, barAlpha: bar.alpha, glyphAlpha: glyph.alpha, frameAlpha: frame.alpha, draft: chatInput.text,
      input: chatInput.visible, send: sendBtn.visible && sendBtn.alpha > 0, feed: msgContainer.visible,
      emoji: superFaceBtn.visible, normalFace: faceBtn.visible, emojiClicks,
      movedRight: superFaceBtn.x > nativeEmojiX, emojiFits: superFaceBtn.x + superFaceBtn.width <= bottomButtonBar.width,
      rightInset: toggle && chat.x + bottomButtonBar.x + bottomButtonBar.width - toggle.x - toggle.width,
      sendAtNativeX: sendBtn.x === bottomButtonBar.width - 44,
      toggleX: toggle?.x };
  });
  let battle = await battleChrome();
  assert.deepEqual([battle.nameAlpha, battle.barAlpha, battle.glyphAlpha, battle.frameAlpha], [0, 0, 1, 0]);
  assert.deepEqual([battle.input, battle.send, battle.feed, battle.emoji, battle.normalFace, battle.draft],
    [false, false, true, true, false, '待发送的消息']);
  assert.equal(battle.emojiFits, true);
  assert.equal(battle.movedRight, true);
  assert.equal(battle.rightInset, 2);
  await page.screenshot({ path: path.join(output, 'battle-chrome-collapsed.png'), clip: chromeRegion });
  await clickBattleControl('former-name');
  assert.equal((await battleChrome()).nameAlpha, 0, 'the old name bar area releases its hit target');
  await clickBattleControl('emoji');
  assert.equal((await battleChrome()).emojiClicks, 1, 'the original emoji control still receives a click');
  await page.evaluate(() => {
    const { chat } = battleCollapseFixture;
    chat.bottomButtonBar.width -= 36;
    chat.layoutBottomButtonBar();
    chat.checkTipView();
  });
  assert.equal(await page.evaluate(() => !battleCollapseFixture.chat.tipView.visible || battleCollapseFixture.chat.tipView.alpha === 0), true);
  await clickBattleControl('name');
  battle = await battleChrome();
  assert.deepEqual([battle.nameAlpha, battle.frameAlpha], [1, .8], 'the faction click restores the native name bar and frame');
  assert.equal(await factionFocusRing(), false);
  await clickBattleControl('chat');
  battle = await battleChrome();
  assert.deepEqual([battle.input, battle.send, battle.draft], [true, true, '待发送的消息']);
  assert.equal(battle.sendAtNativeX, true, 'expanding restores the native layout for the new width');
  await page.keyboard.press('Enter');
  assert.equal((await battleChrome()).input, false, 'the focused chat toggle also supports Enter');
  await clickBattleControl('name');
  assert.equal((await battleChrome()).nameAlpha, 0);
  await page.evaluate(() => { battleCollapseFixture.scope.dispose(); });
  battle = await battleChrome();
  assert.deepEqual([battle.nameAlpha, battle.barAlpha, battle.frameAlpha, battle.input, battle.send, battle.draft, battle.toggleX],
    [1, 1, .8, true, true, '待发送的消息', undefined]);
  assert.equal(await page.evaluate(() => !battleCollapseFixture.plate.getChildByName('sgs-seat-name-toggle')), true);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, clientPath, skinAtlasFixture, checks: ['captured formData/selectGenerals/initItems', 'native canvas clicks and keyboard navigation', 'faction search keeps selection', 'quality tabs and original exclusion', 'multi-select dynamic', 'new/recent/discount ordering', 'new ownership gray', 'unique filtered totals', 'incomplete bag/account switch', 'advanced option and unload restoration', 'captured avatar SetSkin automatically animates the current skin, keeps a selected skin when disabling animation, and preserves general data', 'captured skill voice, attack event and skill effects use the local skin and restore native behavior on reset', 'confirmed AiGe switches skin 66103 to form 2, plays one local transition and routes voice, attack and both skill stages to form 2', 'cross-server portrait stops in-flight entry and skill effects, skips native entry sound and form transitions, keeps generic attack rendering, isolates deputy changes, and restores native hooks on reset', 'captured scene entry clears running effects and round indicators, rejects a pending original portrait, keeps an untouched deputy entrance and restores the original entrance on reset', 'local file texture and restoration'], screenshots: ['quality.png', 'new.png', 'local-portrait.png'], errors }, null, 2));
  await writeFile(path.join(output, 'match-selector-result.json'), JSON.stringify({ passed: true, officialPreviewFixtures: Boolean(officialPreviewDir),
    officialFormFixtures: Boolean(officialFormDir),
    officialDeathAudition: zhugeDeath.contentType === 'audio/mpeg',
    checks: ['native select and change windows', 'card and keyboard activation', 'draft-to-seat handoff',
      'native compose and owned clicks', 'local-only skin selection', 'Yjcm native and Toolbox entry, trial exclusion, merged standard and Jie results and voices, inline lazy head images, official path fallback and restoration',
      'trimmed transparent margins, native seat clipping, split seat geometry and top-aligned seat artwork with restored background',
      'window art loads separately, keeps transparent edges and grows to a 280-unit portrait, fits beside skill text at narrow positions, and preserves the native tip on HTTP failure',
      'click-to-preview in the native seat before apply, cancel and late artwork handling, skill bindings, native skill audio selection and no repeated clip, acquired skills, remembered skins and account isolation',
      'cached portrait replaces the original before first paint with zero portrait network requests; cold start masks the original before the catalogue is ready, loads without voice metadata, and restores native art on failure',
      'first paint removes native gold or silver rank debuts running before the scene hook or attached by a same-frame callback, blocks their replay, keeps the grade and generic turn effect, and restores native debut after fallback',
      'a captured skin loader that attaches pifuchuchang2 during Stage.render cannot draw the old gold entrance while the avatar is still unready',
      'matching seat and full artwork download together; recent and older prepared portraits are decoded from IndexedDB after reload without re-downloading; canceling one consumer leaves a shared download running',
      'separate art and voice selection, cross-skin skill and death binding, death audition, and cross-match restore',
      'one row per skill or death binding with exact general and skin, and artwork retained across voice browsing and searches',
      'Jie Zhong Hui can audition both Pai Yi clips and bind the skill before awakening; native playback uses the binding once the general learns it; old voice indexes refresh',
      'local seat label swaps forms on click and keyboard, waits for artwork, keeps skill and death audio in the active form, and restores the native marker on reset',
      'dual-form rules use only the recipient card skills, old foreign skill bindings can be repaired, and a fresh skill count switches back after manual selection',
      'Yin and Yang switching follows the derived conversion skill only, ignores repeated snapshots, and is unavailable for a card without a conversion skill',
      'general skin tab entry aligned with first card, unprefixed default query with full recipient name, saved random and original voice choices, lobby preference and click-to-play sequencing 1/2/1',
      'the lobby and match editors reopen the bound Yjcm or mobile skin, even when it belongs to a different general or uses a saved mobile variant',
      'mobile entry to the right of Yjcm in the toolbox, hall and match, native coordinates under uniform and nonuniform scaling, and panel/picker at 248/280/420px with four font sizes',
      'mobile search, original art from the character catalogue, gallery portrait and audition, local use and reset, proportional seat cropping, and remembered lobby skin',
      'mobile general filters follow 魔/势/谋/星/界/标 order, stay in one scrollable row, and filter only the selected general',
      'mobile form search returns one skin, three uniformly named forms share previews and voice audition, and all six directed custom rules can be enabled independently',
      'mobile manual form choices support every available form by click or keyboard, including leaving a form with no automatic exit',
      'mobile form preferences preserve valid older rules and starting forms, old saved variant IDs still restore, and Yjcm and mobile share the same seat-marker position independently of portrait clipping',
      'mobile official configuration cold start with HTTP Range, official names and voice IDs, hot update and cached fallback',
      'mobile card and MVP toggles default off, persist across matches, exact card name falls back when unavailable, and MVP replacement plays or suppresses both native variants',
      'scope cleanup'],
    screenshots: ['match-selector-local.png', 'yjcm-native-entry.png', 'yjcm-search-results.png', 'yjcm-general-filter-order.png', 'yjcm-merged-voices.png', 'yjcm-preview.png', 'yjcm-seat-crop.png',
      'yjcm-seat-nameplate.png', 'yjcm-window-preview.png', 'yjcm-voice-bindings.png', 'yjcm-voice-narrow-light.png', 'yjcm-seat-form-1.png', 'yjcm-seat-form-2.png',
      'dual-form-rules.png', 'dual-form-rules-narrow-light.png', 'dual-form-conversion-narrow-light.png', 'yjcm-hall-entry.png', 'yjcm-hall-search.png', 'yjcm-hall-audition.png', 'yjcm-hall-yue-cao-zhi.png', 'yjcm-derived-paiyi.png',
      'mobile-skins-avatar.png', 'mobile-skins-picker-248.png', 'mobile-general-filter-order.png', 'mobile-general-filter-248.png',
      'mobile-jiangwei-skill-names.png', 'mobile-official-victory-voice.png', 'mobile-voice-replacement-248.png',
      'mobile-forms-248.png', 'mobile-forms-280-light.png', 'mobile-three-form-rules.png', 'mobile-bound-settings.png', 'mobile-seat-form-3.png', 'mobile-seat-form-choices.png'] }, null, 2));
  console.log('Native skin UI checks passed: ' + output);
} finally { await browser.close(); }
