import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const fixtures = process.env.SGS_YJCM_EFFECT_FIXTURES || 'test-results/yjcm-skin-effects-source';
const output = process.env.SGS_YJCM_EFFECT_OUTPUT || 'test-results/yjcm-skin-effects';
const source = JSON.parse(await readFile(path.join(fixtures, 'source.json'), 'utf8'));
const bundle = await build({ stdin: { contents: `
  export { ResourceScope } from './src/core/resources.js';
  export { createLocalSkins } from './src/plugins/skins/local.js';
  export { buildYjcmData } from './src/plugins/skins/yjcm-data.js';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'SkinEffectsCheck' });
const staticArt = await readFile(path.join(fixtures, 'static-6123201.png'));
const danceArt = await readFile(path.join(fixtures, 'static-6133801.png'));
const dynamicArt = new Map((await readdir(fixtures)).filter(file => /^\d+-[\w-]+\.(?:sk|skel|atlas|png)$/.test(file))
  .map(file => [file.replace('-', '/'), file]));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference' });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://effects-test.invalid/', route => route.fulfill({
    contentType: 'text/html', body: '<html><body style="margin:0"></body></html>',
  }));
  let missingDodge = false, missingSecondIdle = false;
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/runtime/')[1];
    requests.push(name);
    assert.equal(route.request().headers().cookie, undefined);
    const headers = { 'access-control-allow-origin': '*' };
    const file = dynamicArt.get(name.replace('general/big/dynamic/', '')) ??
      (/^game\/changeSkinEffect\/bianshen_mouluxun1\.(skel|atlas|png)$/.test(name) ? path.basename(name) : null);
    if (name.startsWith('general/seat/static/') || name.startsWith('general/window/')) {
      await route.fulfill({ headers, contentType: 'image/png', body: name.endsWith('/6133801.png') ? danceArt : staticArt });
    } else if (file && !(missingDodge && file.includes('daiji5')) && !(missingSecondIdle && file === '8123201-daiji3.sk')) {
      await route.fulfill({ headers, path: path.join(fixtures, file) }).catch(() => {});
    } else await route.fulfill({ headers, status: 404 }).catch(() => {});
  });
  await page.goto('https://effects-test.invalid/');
  await page.addScriptTag({ path: engine });
  for (const file of ['laya.ani.min.js', 'spine-core-4.0.min.js', 'laya.spine.min.js']) {
    await page.addScriptTag({ path: path.join(path.dirname(engine), file) });
  }
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(async source => {
    Laya.init(1200, 800, Laya.WebGL);
    Laya.stage.bgColor = '#242822';
    const scene = Laya.stage.addChild(new Laya.Sprite());
    const record = [];
    function seat(index, id, name, x, y) {
      const general = { CardName: name, CardId: id, SkinId: 10101 };
      const model = Object.assign(new Laya.EventDispatcher(), {
        General: general, GeneralId: id, SkinID: 10101, Index: index, IsSelf: index === 0, IsFaceUp: () => true,
        GetGeneralBySkillIdOnlyId: skill => [421, 420, 3714].includes(skill) ? general : null,
        OnChangeOriSkinBySkill() {},
      });
      const avatar = scene.addChild(new Laya.Sprite()).pos(x, y).size(146, 172);
      avatar.generalCard = general;
      avatar.skinItemID = 10101;
      avatar.SetSkin = () => {};
      avatar.skinTex = avatar.addChild(new Laya.Sprite());
      avatar.skinTex.graphics.drawRect(0, 0, 146, 172, '#535f4c', '#988974', 1);
      const ui = { seat: model, seatAvatar: avatar,
        useCardAniPlay(card, type) { record.push(['card', card, type]); },
        onUseSkill(event) { record.push(['skill', event.Skill.ID]); } };
      model.on('USE_CARD', ui, ui.useCardAniPlay);
      model.on('USE_SKILL', ui, ui.onUseSkill);
      return ui;
    }
    const self = seat(0, 101, '滕芳兰', 765, 420);
    const enemy = seat(1, 102, '目标座位', 318, 332);
    const scope = new SkinEffectsCheck.ResourceScope();
    const settings = new Map([['crossServer', true]]);
    const context = { ShowGameSkinEffects: true };
    const legacy = SkinEffectsCheck.buildYjcmData(source);
    delete legacy.effects;
    delete legacy.effectSchema;
    delete legacy.motionSchema;
    for (const forms of Object.values(legacy.motion)) for (const motion of forms) {
      if (!motion?.seat) continue;
      motion.files = motion.files.filter(file => !motion.seat.slice(1).some(clip => clip.file === file));
      delete motion.seat;
    }
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('sgs-toolbox-yjcm-index-v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('catalogue');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('catalogue', 'readwrite');
        tx.objectStore('catalogue').put({ savedAt: Date.now(), version: source.version, data: legacy }, 'latest');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    let refreshIndex;
    const waitForRefresh = new Promise(resolve => { refreshIndex = resolve; });
    const game = { getScene: () => scene, getSelfSeatUI: () => self, getSeatUIs: () => [self, enemy], isInGame: () => true,
      getSelf: () => ({ ClientId: 1001 }), getClass: name => name === 'GameContext' ? context : null,
      async loadConfigData(name, options) {
        if (name !== 'yjcm-skins') return null;
        await waitForRefresh;
        return options.knownVersion === source.version ? { unchanged: true, version: source.version } : source;
      },
      getConfigData: name => name === 'character' ? { GameCharacters: { character: [{ a: 101, j: 3714 }] } }
        : name === 'cha_spell' ? { GameSpells: { spell: [{ a: 3714, c: '隽谋' }] } } : null,
      getCardMeta: card => ({ name: card === 75 ? '杀' : '闪' }) };
    const local = SkinEffectsCheck.createLocalSkins({ scope, window, document, game, settings });
    await local.yjcm.warm();
    const layer = kind => scene.getChildByName('sgs-yjcm-' + kind);
    const inSeat = () => self.seatAvatar.getChildByName('sgs-local-skin-portrait');
    window.skinEffects = { scope, self, enemy, context, layer, inSeat, settings, record,
      idle: () => inSeat()?.getChildByName('sgs-yjcm-idle'),
      refreshIndex,
      async apply(id, name, rule, cached = false) {
        const target = local.ownPortraitTarget(101);
        const catalogue = cached ? local.yjcm.cached : await local.yjcm.load();
        const entry = catalogue.findYjcmSkin(id, name);
        if (!entry || (!cached && !entry.effects)) throw Error('找不到官配皮肤');
        await local.applyYjcm(target, entry, {}, scope.signal, rule, undefined, catalogue);
      },
      reset() { local.reset(local.ownPortraitTarget(101)); },
      skill(id, name, card) { self.seat.event('USE_SKILL', { Skill: { ID: id, SkillName: name }, CardID: card, DestSeatIDs: [1] }); },
      card(id, type) { self.seat.event('USE_CARD', [id, type]); },
    };
  }, source);
  const playing = (kind, name) => page.waitForFunction(([kind, name]) => {
    const layer = skinEffects.layer(kind);
    return layer?.numChildren && (!name || Array.from({ length: layer.numChildren }, (_, i) => layer.getChildAt(i))
      .some(actor => actor._currAniName === name));
  }, [kind, name], { timeout: 9000 });
  const ended = kind => page.waitForFunction(kind => !skinEffects.layer(kind), kind, { timeout: 10000 });
  const shot = async (kind, name, filename = kind, delay = 260) => {
    await playing(kind, name);
    if (kind !== 'transition') assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), false);
    await page.waitForTimeout(delay);
    await page.screenshot({ path: path.join(output, filename + '.png') });
    await ended(kind);
  };
  const quiet = async kind => {
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(kind => Boolean(skinEffects.layer(kind)), kind), false, kind);
  };
  await page.evaluate(() => skinEffects.apply(6133801, '乐貂蝉', undefined, true));
  await page.waitForFunction(() => skinEffects.idle());
  const cachedIdle = await page.evaluateHandle(() => skinEffects.idle());
  await page.evaluate(() => skinEffects.refreshIndex());
  await page.waitForFunction(actor => skinEffects.idle() && skinEffects.idle() !== actor, cachedIdle);
  assert.equal(await cachedIdle.evaluate(actor => actor.destroyed), true, 'refresh upgrades a portrait already loaded from the cache');
  const firstIdle = await page.evaluateHandle(() => skinEffects.idle());
  const placement = actor => [actor.x, actor.y, actor.scaleX, actor.scaleY];
  const firstPlacement = await firstIdle.evaluate(placement);
  const idleRegion = { x: 760, y: 401, width: 156, height: 196 };
  const basePose = await page.screenshot({ path: path.join(output, 'jinnian-primary-idle.png'), clip: idleRegion });
  await firstIdle.evaluate(actor => {
    window.completedIdles = 0;
    actor.player.on(Laya.Event.COMPLETE, window, () => { window.completedIdles++; });
    actor.playbackRate(12);
  });
  await page.waitForFunction(actor => skinEffects.idle() && skinEffects.idle() !== actor, firstIdle, { timeout: 6000 });
  const secondIdle = await page.evaluateHandle(() => skinEffects.idle());
  const primaryLoops = await page.evaluate(() => completedIdles);
  assert.ok(primaryLoops >= 2 && primaryLoops <= 4, 'native loop count before the second idle');
  assert.deepEqual(await secondIdle.evaluate(placement), firstPlacement, 'the alternate idle preserves the seat framing');
  await page.waitForFunction(() => skinEffects.idle()?.player.currentPlayTime >= 1050);
  const alternatePose = await page.screenshot({ path: path.join(output, 'jinnian-alternate-idle.png'), clip: idleRegion });
  assert.notDeepEqual(alternatePose, basePose, 'the two authored idle clips show different poses');
  await secondIdle.evaluate(actor => actor.playbackRate(12));
  await page.waitForFunction(actor => skinEffects.idle() === actor, firstIdle, { timeout: 6000 });
  await page.evaluate(() => skinEffects.reset());
  assert.equal(await firstIdle.evaluate(actor => actor.destroyed), true);
  assert.equal(await secondIdle.evaluate(actor => actor.destroyed), true);

  await page.evaluate(() => skinEffects.apply(6123201, '滕芳兰'));
  await shot('enter', null, 'enter', 660);
  await page.waitForFunction(() => skinEffects.idle());
  await page.evaluate(() => skinEffects.card(75, 2));
  await quiet('attack');
  await page.evaluate(() => { skinEffects.skill(1, '杀', 75); skinEffects.card(75, 1); });
  await playing('attack', 'gongji');
  assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), false);
  await page.waitForFunction(() => {
    const layer = skinEffects.layer('attack');
    return layer && Array.from({ length: layer.numChildren }, (_, index) => layer.getChildAt(index)).some(actor => actor.rotation !== 0);
  });
  await page.screenshot({ path: path.join(output, 'attack.png') });
  await page.waitForFunction(() => {
    const layer = skinEffects.layer('attack');
    return layer && Array.from({ length: layer.numChildren }, (_, index) => layer.getChildAt(index))
      .some(actor => actor.x < 464 && actor.rotation === 0);
  });
  await page.waitForTimeout(130);
  await page.screenshot({ path: path.join(output, 'hit.png') });
  await ended('attack');
  assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), true);
  await page.evaluate(() => skinEffects.skill(420, '无关技能'));
  await quiet('skill');
  await page.evaluate(() => skinEffects.skill(421, '落宠'));
  await shot('skill', 'jineng');
  assert.equal(requests.filter(url => url.endsWith('/8123201/chuchang2.skel')).length, 1);
  await page.evaluate(() => skinEffects.card(76, 2));
  await shot('dodge');
  assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), true);

  await page.evaluate(() => { skinEffects.context.ShowGameSkinEffects = false; skinEffects.card(75, 1); });
  await quiet('attack');
  await page.evaluate(() => { skinEffects.context.ShowGameSkinEffects = true; skinEffects.card(75, 1); });
  await playing('attack');
  await page.evaluate(() => skinEffects.reset());
  assert.deepEqual(await page.evaluate(() => [Boolean(skinEffects.layer('attack')), Boolean(skinEffects.inSeat()),
    skinEffects.self.seatAvatar.skinTex.visible, skinEffects.record.filter(row => row[0] === 'card').length]), [false, false, true, 5]);

  missingDodge = true;
  missingSecondIdle = true;
  const missingIdle = page.waitForResponse(response => response.url().endsWith('/8123201/daiji3.sk') && response.status() === 404);
  await page.evaluate(() => skinEffects.apply(6123201, '滕芳兰'));
  await missingIdle;
  await ended('enter');
  assert.ok(await page.evaluate(() => skinEffects.idle()?.player.playDuration < 5000), 'the primary idle remains when the second file is unavailable');
  const failure = page.waitForResponse(response => response.url().endsWith('/8123201/daiji5.sk') && response.status() === 404);
  await page.evaluate(() => skinEffects.card(76, 2));
  await failure;
  assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), true);

  await page.evaluate(() => skinEffects.apply(6163801, '谋陆逊', {
    mode: 'custom', rules: [{ kind: 'once', times: 1, skills: [3714] }, { kind: 'none' }],
  }));
  await shot('enter', null, 'seat-entry');
  await page.evaluate(() => skinEffects.self.seat.OnChangeOriSkinBySkill(101, 3714));
  await shot('transition');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => skinEffects.card(75, 1));
  await quiet('attack');
  await page.evaluate(() => skinEffects.scope.dispose());
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, source: source.version,
    refreshedLegacyIndex: true, carousel: { skin: 8133801, primaryLoops, placement: firstPlacement }, requests, errors }, null, 2));
  console.log('Yjcm skin effects checks passed: ' + path.resolve(output));
} finally {
  await browser.close();
}
