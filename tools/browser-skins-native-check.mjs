import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { nativeWallpaperFixture } from './native-wallpaper-fixture.mjs';

const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const clientPath = process.env.SGS_CLIENT_SOURCE || path.join(process.env.TEMP, 'sgs-client/game/sgsGame_a.sgs');
const skinAtlasFixture = process.env.SGS_SKIN_ATLAS_FIXTURE;
const skinAssets = skinAtlasFixture ? JSON.parse(await readFile(skinAtlasFixture, 'utf8')) : null;
const client = await readFile(clientPath, 'utf8');
const extract = name => { const start = client.indexOf(`class ${name} extends`), end = client.indexOf('class ', start + 10); assert.ok(start >= 0 && end > start); return client.slice(start, end); };
const cii = extract('cii'), newPage = extract('_ii'), panelClass = extract('lk');
const { nativeMethod } = await nativeWallpaperFixture(clientPath);
const seatSkin = nativeMethod('Kjt', 'SetSkin');
const selectorMethods = ['itemClick', 'closeSelectSure', 'destroy'].map(name => nativeMethod('XPt', name));
const selectGeneralClose = nativeMethod('r_s', 'Close');
const bundle = await build({ stdin: { contents: `export { ResourceScope } from './src/core/resources.js'; export { createNativeTheme } from './src/ui/native-theme.js'; export { enhanceSkinWindow, createNativeSkins } from './src/plugins/skins/native.js'; export { createLocalSkins } from './src/plugins/skins/local.js'; export { createMatchSkinSelector } from './src/plugins/skins/match-selector.js'; export { setupSkinFixture, createSkinFixtureOwner, provideSkinChromeTextures } from './tests/fixtures/skins-native-browser.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'NativeSkinCheck' });
const output = path.resolve('test-results/skins'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<html><body style="margin:0;background:#151513"></body></html>');
  await page.addScriptTag({ path: engine }); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(async assets => {
    NativeSkinCheck.setupSkinFixture();
    if (assets) await NativeSkinCheck.provideSkinChromeTextures(assets);
  }, skinAssets);
  await page.addScriptTag({ content: `window.CapturedSkinPage=(${cii});window.CapturedNewSkinPage=(${newPage});window.CapturedSkinPanel=(${panelClass});window.capturedSetSkin=({${seatSkin}}).SetSkin;` });
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
  await page.evaluate(() => { skinFixture.controllerContext = skinFixture.ctx; skinFixture.controller = NativeSkinCheck.createNativeSkins(skinFixture.ctx); });
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
    const general = { CardName: '演练武将', SkinId: 10101, IsDynamic: false, JueXingState: 2 };
    const avatar = new Laya.Sprite(); avatar.size(130, 180); avatar.pos(1020, 620);
    avatar.generalCard = general; avatar.SetSkin = window.capturedSetSkin;
    const original = { skinID: 10101, SeatAnimateUrl: 'res/current.sk', ResType: 2 };
    const animated = { skinID: 10102, SeatAnimateUrl: 'res/fixture.sk', ResType: 2 };
    window.ZJt.I = () => ({ GetGeneralSkinBySkinID: id => id === 10102 ? animated : original });
    window.kCt = { ResType_Spine: 3, ResType_Spine_AllBig: 4 };
    window.Kjt = { AVATAR_MAX_WIDTH: 130 }; window.hi = { top: 1 };
    window.E$t = class extends Laya.Sprite { InitEffect(url) { this.url = url; } playEffect() { this.played = true; } };
    Object.assign(avatar, { skinItemID: 10101, clearMaskTween() {}, clearTempStaticSkin() {}, clearEffect() {}, getXline: () => 0,
      removeSkeleton() { this.skeleton?.destroy(); this.skeleton = null; }, loadStatic(vo) { this.drawnSkin = vo.skinID; } });
    avatar.skinTex = new Laya.Sprite();
    avatar.skinTex.graphics.drawRect(0, 0, 130, 180, '#766840');
    avatar.addChild(avatar.skinTex); Laya.stage.addChild(avatar);
    const ui = { seat: { General: general, GeneralId: 101, IsSelf: true }, seatAvatar: avatar };
    const scene = {}, scope = new NativeSkinCheck.ResourceScope();
    const { settings } = skinFixture.ctx; settings.set('crossServer', true);
    settings.set('unlockDynamic', true);
    const manager = { GetOnlineSKinList: () => [original, animated], GetSkinListBySkinID: () => [] };
    const game = { getScene: () => scene, getSeatUIs: () => [ui], isInGame: () => true, getClass: () => manager };
    const local = NativeSkinCheck.createLocalSkins({ window, scope, game, settings });
    const canvas = document.createElement('canvas'); canvas.width = 130; canvas.height = 180;
    const art = canvas.getContext('2d'); art.fillStyle = '#31675c'; art.fillRect(0, 0, 130, 180);
    art.fillStyle = '#b9d2ad'; art.fillRect(25, 55, 80, 70);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const [target] = local.refresh();
    const automatic = avatar.drawnSkin === 10101 && avatar.skeleton?.played && avatar.skeleton.url === 'res/current.sk';
    settings.set('unlockSkin', true);
    local.select(target, 10102);
    const dynamic = avatar.drawnSkin === 10102 && avatar.skeleton?.played && general.JueXingState === 2 && general.SkinId === 10101 && !general.IsDynamic;
    settings.set('unlockDynamic', false); local.refresh();
    const staticOverride = avatar.drawnSkin === 10102 && avatar.skeleton === null;
    local.reset(target);
    const restored = avatar.drawnSkin === 10101 && avatar.skeleton === null;
    const result = await local.importPortrait(target, new File([blob], 'fixture.png', { type: 'image/png' }));
    window.localPortraitFixture = { avatar, local, target, scope };
    return [automatic, dynamic, staticOverride, restored, result, avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-portrait')), general.SkinId];
  }), [true, true, true, true, true, false, true, 10101]);
  await page.screenshot({ path: path.join(output, 'local-portrait.png') });
  assert.deepEqual(await page.evaluate(() => {
    const { avatar, scope } = window.localPortraitFixture; scope.dispose();
    return [avatar.skinTex.visible, Boolean(avatar.getChildByName('sgs-local-skin-portrait'))];
  }), [true, false]);
  await page.addScriptTag({ content: `window.capturedSelector={${selectorMethods.join(',')}};window.capturedSelectGeneral={${selectGeneralClose}};` });
  await page.evaluate(() => {
    const { avatar, target } = localPortraitFixture;
    const { seat } = target, ui = { seat, seatAvatar: avatar };
    const scope = new NativeSkinCheck.ResourceScope();
    const settings = skinFixture.ctx.settings;
    const calls = [], notices = [];
    let scene = {}, draft = true;
    const game = { getScene: () => scene, getSeatUIs: () => draft ? [] : [ui], isInGame: () => true };
    const nativeTheme = NativeSkinCheck.createNativeTheme({ scope, window });
    const ctx = { window, scope, settings, game, ui: { nativeTheme }, notify: message => notices.push(message) };
    const local = NativeSkinCheck.createLocalSkins(ctx);
    settings.set('unlockSkin', false);
    settings.set('unlockDynamic', true);
    const check = NativeSkinCheck.createMatchSkinSelector(ctx, local);
    window.V2t = { get SelfSeat() { return draft ? {} : seat; }, GetModeType: () => 0, ChecHasShareSkin: () => false };
    window.Us = { IsGuildMatch: () => false, IsTZGJ: () => false, IsLuanDou: () => false };
    window.iA = { SET: 0 };
    window.M$t = { I: () => ({ SendMsgSelectCharacterReq: id => calls.push(['general', id]) }) };
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
        list: [{ skinID: 10101 }, { skinID: 10102, SeatAnimateUrl: 'res/fixture.sk' }],
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
    }
    window.matchSelectorFixture = { scope, settings, calls, notices, avatar, check, open,
      reveal() { draft = false; local.refresh(); },
      action() { return this.owner.selectView.pannelContent.getChildByName('sgs-local-skin-10102'); } };
    open('SelectSkinWindow');
  });
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
  await page.evaluate(() => { matchSelectorFixture.open('ChangeSkinWindow'); matchSelectorFixture.scope.dispose(); });
  assert.deepEqual(await page.evaluate(() => [Boolean(matchSelectorFixture.action()), matchSelectorFixture.avatar.skinItemID]), [false, 10101]);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, clientPath, skinAtlasFixture, checks: ['captured formData/selectGenerals/initItems', 'native canvas clicks and keyboard navigation', 'faction search keeps selection', 'quality tabs and original exclusion', 'multi-select dynamic', 'new/recent/discount ordering', 'new ownership gray', 'unique filtered totals', 'incomplete bag/account switch', 'advanced option and unload restoration', 'captured avatar SetSkin automatically animates the current skin, keeps a selected skin when disabling animation, and preserves general data', 'local file texture and restoration'], screenshots: ['quality.png', 'new.png', 'local-portrait.png'], errors }, null, 2));
  await writeFile(path.join(output, 'match-selector-result.json'), JSON.stringify({ passed: true,
    checks: ['native select and change windows', 'card and keyboard activation', 'draft-to-seat handoff',
      'native compose and owned clicks', 'local-only skin selection', 'scope cleanup'], screenshot: 'match-selector-local.png' }, null, 2));
  console.log('Native skin UI checks passed: ' + output);
} finally { await browser.close(); }
