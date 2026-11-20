import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const fixtures = process.env.SGS_YJCM_EFFECT_FIXTURES || 'test-results/yjcm-skin-effects-source';
const complexFixtures = process.env.SGS_YJCM_COMPLEX_EFFECT_FIXTURES;
const output = process.env.SGS_YJCM_EFFECT_OUTPUT || 'test-results/yjcm-skin-effects';
const source = JSON.parse(await readFile(path.join(fixtures, 'source.json'), 'utf8'));
const bundle = await build({ stdin: { contents: `
  export { ResourceScope } from './src/core/resources.js';
  export { BLACK_GOLD } from './src/core/themes.js';
  export { createLocalSkins } from './src/plugins/skins/local.js';
  export { createYjcmPicker } from './src/plugins/skins/yjcm-picker.js';
  export { buildYjcmData } from './src/plugins/skins/yjcm-data.js';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'SkinEffectsCheck' });
const staticArt = await readFile(path.join(fixtures, 'static-6123201.png'));
const danceArt = await readFile(path.join(fixtures, 'static-6133801.png'));
const dynamicArt = new Map((await readdir(fixtures)).filter(file => /^\d+-[\w-]+\.(?:sk|skel|atlas|png)$/.test(file))
  .map(file => [file.replace('-', '/'), file]));
const complexAssets = new Map();
if (complexFixtures) {
  for (const file of await readdir(complexFixtures)) {
    if (/^(820701|860401)-[\w-]+\.(?:sk|skel|atlas|png)$/.test(file)) {
      complexAssets.set('general/big/dynamic/' + file.replace('-', '/'), file);
    } else if (/^static-(620701|660401)\.png$/.test(file)) {
      complexAssets.set('general/seat/static/' + file.slice('static-'.length), file);
    } else if (/^620701_[12]\.mp3$/.test(file)) {
      complexAssets.set('voice/skinSpellEffect/' + file, file);
    }
  }
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference' });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://effects-test.invalid/', route => route.fulfill({
    contentType: 'text/html', body: '<html><body style="margin:0"></body></html>',
  }));
  let missingDodge = false, missingSecondIdle = false, firstIdleGate, slowCompanions = false;
  const soundPath = 'voice/skinSpellEffect/test_skin_cue.mp3';
  await page.route('https://web.sanguosha.com/x/pc/res/assets/runtime/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/runtime/')[1];
    requests.push(name);
    if (name === 'general/big/dynamic/8123201/daiji2.sk' && firstIdleGate) await firstIdleGate;
    assert.equal(route.request().headers().cookie, undefined);
    const headers = { 'access-control-allow-origin': '*' };
    const file = dynamicArt.get(name.replace('general/big/dynamic/', '')) ??
      (/^game\/changeSkinEffect\/bianshen_mouluxun1\.(skel|atlas|png)$/.test(name) ? path.basename(name) : null);
    if (slowCompanions && /^8123201-shouji2?\.sk$/.test(file)) await new Promise(resolve => setTimeout(resolve, 1200));
    if (name === soundPath) {
      // The test records media playback without asserting that these bytes decode.
      await route.fulfill({ headers, contentType: 'audio/mpeg', body: Buffer.from([0, 1, 2]) });
    } else if (complexAssets.has(name)) {
      const officialFile = complexAssets.get(name);
      await route.fulfill({ headers, path: path.join(complexFixtures, officialFile),
        contentType: officialFile.endsWith('.mp3') ? 'audio/mpeg' : undefined }).catch(() => {});
    } else if (name.startsWith('general/seat/static/') || name.startsWith('general/window/')) {
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
    class SeatAvatar extends Laya.Sprite {
      static AVATAR_MAX_WIDTH = 146;
    }
    function seat(index, id, name, x, y) {
      const general = { CardName: name, CardId: id, SkinId: 10101 };
      const model = Object.assign(new Laya.EventDispatcher(), {
        General: general, GeneralId: id, SkinID: 10101, Index: index, IsSelf: index === 0, IsFaceUp: () => true,
        GetGeneralBySkillIdOnlyId: skill => [421, 420, 3714, 317, 3126, 3127].includes(skill) ? general : null,
        OnChangeOriSkinBySkill() {},
      });
      const avatar = scene.addChild(new SeatAvatar()).pos(x, y).size(146, 172);
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
    let officialAudio = false;
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.src.startsWith('blob:')) return nativePlay.call(this);
      if (officialAudio) {
        this.addEventListener('playing', () => {
          const cue = { volume: this.volume, duration: this.duration };
          record.push(['officialSound', cue]);
          this.addEventListener('pause', () => { cue.playedSeconds = this.currentTime; }, { once: true });
        }, { once: true });
        return nativePlay.call(this);
      }
      record.push(['effectSound', this.volume]);
      return Promise.resolve();
    };
    Laya.LocalStorage.setItem('mainVol', '80');
    Laya.LocalStorage.setItem('otherVol', '35');
    source.GeneralSkinInfoConfig.SkinSpineConf.find(row => row.SkinID === 8123201).AttackAnimateInfos
      .find(row => row.AnimateNames === 'jineng|jineng' || row.AnimateNames === 'jineng').SoundName = 'test_skin_cue';
    const legacy = SkinEffectsCheck.buildYjcmData(source);
    legacy.effectSchema = 2;
    for (const forms of Object.values(legacy.effects)) for (const spec of forms) {
      if (!spec) continue;
      if (spec.enter) delete spec.enter.clipToSeat;
      for (const action of spec.actions) delete action.sound;
    }
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
    let accountId = 1001;
    const game = { getScene: () => scene, getSelfSeatUI: () => self, getSeatUIs: () => [self, enemy], isInGame: () => true,
      getSelf: () => ({ ClientId: accountId }), getClass: name => name === 'GameContext' ? context : null,
      async loadConfigData(name, options) {
        if (name !== 'yjcm-skins') return null;
        await waitForRefresh;
        return options.knownVersion === source.version ? { unchanged: true, version: source.version } : source;
      },
      getConfigData: name => name === 'character' ? { GameCharacters: { character: [{ a: 101, j: 3714, k: 421 }] } }
        : name === 'cha_spell' ? { GameSpells: { spell: [{ a: 3714, c: '隽谋' }, { a: 421, c: '落宠' }] } } : null,
      getCardMeta: card => ({ name: card === 75 ? '杀' : '闪' }) };
    const themeListeners = new Set();
    const dark = SkinEffectsCheck.BLACK_GOLD;
    const light = { tokens: { ...dark.tokens, bg: '#f7f1e6', surface: '#fffaf1', raised: '#efe4d0', text: '#342819',
      muted: '#675742', accent: '#884f1c', border: '#c5ad8e', scheme: 'light' } };
    const themes = { current: dark, subscribe(listener) { themeListeners.add(listener); return () => themeListeners.delete(listener); } };
    const ctx = { scope, window, document, game, settings, themes };
    const local = SkinEffectsCheck.createLocalSkins(ctx);
    const openPicker = SkinEffectsCheck.createYjcmPicker(ctx, local);
    await local.yjcm.warm();
    if (!local.yjcm.cached.findYjcmSkin(6123201, '滕芳兰').effects.enter || !local.yjcm.needsRefresh) {
      throw Error('旧索引应先保留可用特效，再刷新新增配置');
    }
    const layer = kind => scene.getChildByName('sgs-yjcm-' + kind);
    const inSeat = () => self.seatAvatar.getChildByName('sgs-local-skin-portrait');
    window.skinEffects = { scope, self, enemy, context, layer, inSeat, settings, record,
      setLightTheme(value) {
        themes.current = value ? light : dark;
        for (const listener of themeListeners) listener(themes.current);
      },
      openPicker(inMatch) {
        const subject = { id: 101, name: '滕芳兰', isSelf: true };
        return openPicker(inMatch ? { target: local.ownPortraitTarget(101), initialQuery: subject.name } : { general: subject });
      },
      effectBindings(general, skin, user = accountId) {
        const previous = accountId;
        accountId = user;
        try { return local.effectBindings({ id: general }, { id: skin }); }
        finally { accountId = previous; }
      },
      idle: () => inSeat()?.getChildByName('sgs-yjcm-idle'),
      refreshIndex,
      enableOfficialAudio() {
        officialAudio = true;
        Laya.LocalStorage.setItem('otherClose', '0');
      },
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
  const framing = {};
  async function checkFrame(kind, expected, name = kind) {
    await playing(kind);
    const actual = framing[name] = await page.evaluate(kind => {
      const actor = skinEffects.layer(kind).getChildAt(0);
      return [actor.x, actor.y, actor.scaleX, actor.scaleY];
    }, kind);
    for (const [i, value] of actual.entries()) {
      assert.ok(Math.abs(value - expected[i]) < .001, `${kind} transform component ${i}: expected ${expected[i]}, got ${value}`);
    }
  }
  async function checkSeatCrop(kind) {
    const viewport = await page.evaluate(kind => {
      const layer = skinEffects.layer(kind);
      const clip = layer.scrollRect;
      return clip && [layer.x, layer.y, clip.x, clip.y, clip.width, clip.height];
    }, kind);
    assert.deepEqual(viewport, [765, 420, 765, 420, 73, 172]);
  }
  const seatScaleX = 146 / 190, seatScaleY = 172 / 249;
  const entryScale = .9, avatarScale = 172 / 270;
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

  let releaseFirstIdle;
  firstIdleGate = new Promise(resolve => { releaseFirstIdle = resolve; });
  await page.evaluate(() => skinEffects.apply(6123201, '滕芳兰'));
  await checkFrame('enter', [765 + 73 - 120 * avatarScale, 420 + 86 - 100 * avatarScale,
    seatScaleX * entryScale, seatScaleY * entryScale], 'nearEntry');
  assert.equal(await page.evaluate(() => Boolean(skinEffects.idle())), false, 'cold entry does not depend on the idle download');
  releaseFirstIdle();
  firstIdleGate = null;
  await shot('enter', null, 'enter', 660);
  await page.waitForFunction(() => skinEffects.idle());
  assert.deepEqual((await page.evaluate(() => [skinEffects.idle().scaleX, skinEffects.idle().scaleY])).map(value => value.toFixed(3)),
    framing.nearEntry.slice(2).map(value => (value / entryScale).toFixed(3)), 'the authored entrance scale is relative to the idle frame');
  await page.evaluate(() => skinEffects.card(75, 2));
  await quiet('attack');
  slowCompanions = true;
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
  slowCompanions = false;
  assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), true);
  await page.evaluate(() => skinEffects.skill(420, '无关技能'));
  await quiet('skill');
  await page.evaluate(() => skinEffects.skill(421, '落宠'));
  await shot('skill', 'jineng');
  assert.deepEqual(await page.evaluate(() => skinEffects.record.filter(row => row[0] === 'effectSound')), [['effectSound', .35]]);
  await page.evaluate(() => { Laya.LocalStorage.setItem('otherClose', '1'); skinEffects.skill(421, '落宠'); });
  await playing('skill', 'jineng');
  await ended('skill');
  assert.equal(requests.filter(url => url === soundPath).length, 1, 'the native effects mute prevents the sound request');
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

  const luXunRule = {
    mode: 'custom', rules: [{ kind: 'once', times: 1, skills: [3714] }, { kind: 'none' }],
  };
  await page.evaluate(rule => skinEffects.apply(6163801, '谋陆逊', rule), luXunRule);
  await checkFrame('enter', [765 + 73, 420 + 115 * seatScaleY, seatScaleX, seatScaleY], 'seatEntry');
  await shot('enter', null, 'seat-entry');
  await page.evaluate(async rule => {
    skinEffects.reset();
    const avatar = skinEffects.self.seatAvatar;
    avatar.size(73, 172);
    avatar.scrollRect = new Laya.Rectangle(36, 0, 73, 172);
    await skinEffects.apply(6163801, '谋陆逊', rule);
  }, luXunRule);
  const narrowFrame = [765 + 73 - 36, 420 + 115 * seatScaleY, seatScaleX, seatScaleY];
  await checkFrame('enter', narrowFrame, 'narrowSeatEntry');
  await checkSeatCrop('enter');
  await shot('enter', null, 'narrow-seat-entry');
  await page.evaluate(() => skinEffects.self.seat.OnChangeOriSkinBySkill(101, 3714));
  await checkFrame('transition', narrowFrame);
  await checkSeatCrop('transition');
  await shot('transition');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => skinEffects.card(75, 1));
  await quiet('attack');

  const officialCases = [];
  if (complexFixtures) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.click(16, 16);
    await page.evaluate(() => {
      skinEffects.reset();
      const avatar = skinEffects.self.seatAvatar;
      avatar.size(146, 172);
      avatar.scrollRect = null;
      skinEffects.enableOfficialAudio();
    });
    const playWithBackground = (kind, name) => page.waitForFunction(([kind, name]) => {
      const layer = skinEffects.layer(kind);
      return layer?.numChildren >= 2 && layer.getChildAt(0).player &&
        Array.from({ length: layer.numChildren }, (_, index) => layer.getChildAt(index)).some(actor => actor._currAniName === name);
    }, [kind, name], { timeout: 9000 });
    const targetEffect = (kind, projectile) => page.waitForFunction(([kind, projectile]) => {
      const layer = skinEffects.layer(kind);
      return layer && Array.from({ length: layer.numChildren }, (_, index) => layer.getChildAt(index))
        .some(actor => actor.x < 464 && (actor.rotation !== 0) === projectile);
    }, [kind, projectile], { timeout: 9000 });
    const soundCount = count => page.waitForFunction(count => skinEffects.record.filter(row => row[0] === 'officialSound').length === count,
      count, { timeout: 9000 });
    const officialSoundPaths = () => requests.filter(url => url.startsWith('voice/skinSpellEffect/620701_'));

    await page.evaluate(() => skinEffects.apply(620701, '神赵云'));
    await shot('enter', null, 'official-zhaoyun-entry');
    await page.waitForFunction(() => skinEffects.idle());
    await page.evaluate(() => { skinEffects.skill(1, '杀', 75); skinEffects.card(75, 1); });
    await playWithBackground('attack', 'gongji');
    await soundCount(1);
    await targetEffect('attack', true);
    await page.screenshot({ path: path.join(output, 'official-zhaoyun-projectile.png') });
    await targetEffect('attack', false);
    await page.screenshot({ path: path.join(output, 'official-zhaoyun-impact.png') });
    await ended('attack');
    assert.deepEqual(officialSoundPaths(), ['voice/skinSpellEffect/620701_1.mp3']);

    await page.evaluate(() => skinEffects.skill(317, '龙魂'));
    await playWithBackground('skill', 'jineng');
    await soundCount(2);
    await shot('skill', 'jineng', 'official-zhaoyun-longhun');
    assert.deepEqual(officialSoundPaths(), ['voice/skinSpellEffect/620701_1.mp3', 'voice/skinSpellEffect/620701_2.mp3']);
    await page.waitForFunction(() => skinEffects.record.filter(row => row[0] === 'officialSound')
      .every(([, cue]) => cue.playedSeconds > 0));
    const audio = await page.evaluate(() => skinEffects.record.filter(row => row[0] === 'officialSound').map(([, cue]) => cue));
    assert.equal(audio.length, 2);
    for (const clip of audio) {
      assert.equal(clip.volume, .35);
      assert.ok(Number.isFinite(clip.duration) && clip.duration > 0, 'Chromium decoded and started the official effect audio');
      assert.ok(clip.playedSeconds >= clip.duration - .12, 'The visual effect finishing does not cut off the sound early');
    }
    assert.notEqual(audio[0].duration, audio[1].duration);
    officialCases.push({ skin: 620701, general: '神赵云', name: '龙腾虎跃', audio });

    await page.evaluate(() => { skinEffects.reset(); return skinEffects.apply(660401, '梁兴'); });
    await shot('enter', null, 'official-liangxing-entry');
    const impactPath = 'general/big/dynamic/860401/shouji.sk';
    await page.evaluate(() => skinEffects.skill(3127, '追袭'));
    await playWithBackground('skill', 'jineng');
    await shot('skill', 'jineng', 'official-liangxing-zhuixi');
    assert.ok(!requests.includes(impactPath), 'Pursuit shares the skill animation without requesting the dedicated target impact');
    await page.evaluate(() => skinEffects.skill(3126, '掳掠'));
    await playWithBackground('skill', 'jineng');
    await targetEffect('skill', false);
    await page.screenshot({ path: path.join(output, 'official-liangxing-impact.png') });
    await ended('skill');
    assert.ok(requests.includes(impactPath));
    assert.equal(await page.evaluate(() => skinEffects.inSeat().visible), true);
    officialCases.push({ skin: 660401, general: '梁兴', name: '骁勇金衔', impact: '掳掠', noImpact: '追袭' });
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    skinEffects.reset();
    skinEffects.settings.set('effectBindings.1001.101.6123201', { 1: { 1: null, 2: null, 3714: 'enter' } });
    skinEffects.openPicker(false);
  });
  const picker = page.locator('[data-sgs-yjcm-skins]');
  const results = picker.locator('.results');
  const chooseArt = () => results.getByRole('button', { name: /皓露沁兰/ }).click();
  const effectSection = picker.locator('.skin-effects');
  const openEffects = async () => {
    if (await effectSection.getAttribute('open') === null) await effectSection.locator('summary').first().click();
  };
  const selectedSkin = picker.locator('.result[aria-pressed=true]');
  const canvas = picker.locator('canvas.effect-preview-canvas');
  const preview = picker.locator('.effect-preview-choice');
  const binding = picker.getByRole('combobox', { name: '隽谋', exact: true });
  const secondBinding = picker.getByRole('combobox', { name: '落宠', exact: true });
  const chooseOption = async (field, name) => {
    const option = field.locator('option').filter({ hasText: name }).first();
    const value = await option.getAttribute('value');
    assert.ok(value, `Missing effect option ${name}`);
    await field.selectOption(value);
    return value;
  };
  await chooseArt();
  await openEffects();
  await binding.locator('option:checked').waitFor({ state: 'attached' });
  const previewLabels = await preview.locator('option').allTextContents();
  for (const label of ['入场', '攻击', '闪避', '落宠']) assert.ok(previewLabels.includes(label), label);
  await picker.getByText('出杀自动播放攻击，用闪自动播放闪避', { exact: true }).waitFor();
  assert.deepEqual(await effectSection.locator('.effect-field > span').allTextContents(), ['隽谋', '落宠']);
  const skillEffectLabels = await binding.locator('option').allTextContents();
  assert.ok(skillEffectLabels.includes('落宠'));
  assert.ok(skillEffectLabels.every(label => !/入场|攻击|闪避|形态切换/.test(label)));
  assert.match(await secondBinding.locator('option:checked').textContent(), /自动.*落宠/);
  assert.match(await binding.locator('option:checked').textContent(), /自动.*无匹配/);
  const selectedSkillEffect = await chooseOption(binding, '落宠');
  const secondSkillEffect = selectedSkillEffect;
  await secondBinding.selectOption(secondSkillEffect);
  await effectSection.getByText('已绑定 2 项', { exact: true }).waitFor();
  assert.equal(await binding.inputValue(), selectedSkillEffect);
  await binding.selectOption('auto');
  assert.equal(await secondBinding.inputValue(), secondSkillEffect, 'clearing one row preserves the other skill');
  await binding.selectOption(selectedSkillEffect);
  const savedEffectBindings = { 1: { 3714: selectedSkillEffect, 421: secondSkillEffect } };
  await chooseOption(preview, '攻击');
  await picker.getByRole('button', { name: '播放动效' }).press('Enter');
  await canvas.locator('xpath=self::*[@data-playing]').waitFor();
  assert.equal(await page.evaluate(() => Boolean(skinEffects.layer('skill'))), false, 'preview is drawn in the panel');
  const previewFrame = previous => {
    const element = document.querySelector('[data-sgs-yjcm-skins]').shadowRoot.querySelector('.effect-preview-canvas[data-playing]');
    if (!element) return '';
    const { width, height } = element;
    const pixels = element.getContext('2d').getImageData(0, 0, width, height).data;
    const opaque = pixels.reduce((count, value, i) => count + Number(i % 4 === 3 && value > 0), 0);
    if (opaque <= 200) return '';
    const frame = element.toDataURL();
    return frame === previous ? '' : frame;
  };
  const firstPreview = await (await page.waitForFunction(previewFrame)).jsonValue();
  await page.waitForFunction(previewFrame, firstPreview);
  await picker.locator('.skin-effects').screenshot({ path: path.join(output, 'panel-effect-preview.png') });
  await preview.selectOption({ index: 0 });
  await canvas.locator('xpath=self::*[@data-playing]').waitFor({ state: 'detached' });
  await picker.getByRole('button', { name: '关闭', exact: true }).click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => skinEffects.effectBindings(101, 6123201)), {},
    'closing with a draft leaves the applied effect settings untouched');
  await page.evaluate(() => skinEffects.openPicker(false));
  await binding.waitFor();
  assert.equal(await binding.inputValue(), selectedSkillEffect);
  assert.equal(await secondBinding.inputValue(), secondSkillEffect);
  await picker.getByRole('button', { name: '下次使用' }).click();
  await picker.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => skinEffects.effectBindings(101, 6123201)), savedEffectBindings);
  assert.deepEqual(await page.evaluate(() => [skinEffects.effectBindings(101, 6123201, 1002),
    skinEffects.effectBindings(102, 6123201), skinEffects.effectBindings(101, 6133801)]), [{}, {}, {}]);

  await page.evaluate(() => skinEffects.openPicker(true));
  await binding.waitFor();
  assert.match(await selectedSkin.textContent(), /皓露沁兰/);
  assert.notEqual(await effectSection.getAttribute('open'), null);
  assert.equal(await binding.inputValue(), selectedSkillEffect);
  assert.equal(await secondBinding.inputValue(), secondSkillEffect);
  const panelLayouts = [];
  for (const width of [248, 280, 420]) {
    await page.setViewportSize({ width: width + 24, height: 475 });
    for (const font of [-2, -1, 0, 2]) {
      const layout = await picker.evaluate((host, { width, font }) => {
        host.style.setProperty('--sgs-font-offset', font + 'px');
        const dialog = host.shadowRoot.querySelector('dialog');
        const section = host.shadowRoot.querySelector('.skin-effects');
        const body = dialog.querySelector('.body');
        const rect = dialog.getBoundingClientRect();
        return { insideViewport: rect.left >= 0 && rect.right <= innerWidth && Math.abs(rect.width - width) < 1,
          sectionFits: section.scrollWidth <= section.clientWidth && [...section.querySelectorAll('.effect-field select')].every(select => {
            const field = select.closest('label').getBoundingClientRect(), control = select.getBoundingClientRect();
            return control.width >= 48 && control.height >= 36 && control.right <= field.right + 1;
          }),
          scrollable: body.scrollHeight > body.clientHeight };
      }, { width, font });
      assert.deepEqual(layout, { insideViewport: true, sectionFits: true, scrollable: true }, `${width}px, font offset ${font}`);
      panelLayouts.push({ width, font });
    }
    await secondBinding.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `panel-${width}.png`) });
  }
  await page.evaluate(() => skinEffects.setLightTheme(true));
  assert.equal(await picker.locator('.skin-effects').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 250, 241)');
  await page.screenshot({ path: path.join(output, 'panel-light-420.png') });
  await page.setViewportSize({ width: 1200, height: 800 });
  await picker.getByRole('button', { name: '使用皮肤' }).click();
  await picker.waitFor({ state: 'detached' });
  await shot('enter', null, 'bound-skin-entry');
  await page.evaluate(() => { skinEffects.skill(1, '杀', 75); skinEffects.card(75, 1); });
  await shot('attack', 'gongji', 'automatic-attack');
  missingDodge = false;
  await page.evaluate(() => skinEffects.card(76, 2));
  await shot('dodge', null, 'automatic-dodge');
  await page.evaluate(() => skinEffects.skill(3714, '隽谋'));
  await shot('skill', 'jineng', 'custom-bound-skill');
  await page.evaluate(() => skinEffects.skill(421, '落宠'));
  await shot('skill', 'jineng', 'second-bound-skill');

  await page.evaluate(() => skinEffects.openPicker(false));
  await picker.getByRole('searchbox').fill('谋陆逊');
  await results.getByRole('button', { name: /竭雨焚天/ }).click();
  await openEffects();
  await binding.locator('option:checked').waitFor({ state: 'attached' });
  assert.ok((await preview.locator('option').allTextContents()).includes('形态切换'));
  assert.ok(!(await binding.locator('option').allTextContents()).some(label => label.includes('形态切换')));
  const otherDraftEffect = await chooseOption(binding, '不播放');
  await picker.getByRole('button', { name: '关闭', exact: true }).click();

  await page.setViewportSize({ width: 272, height: 450 });
  await page.evaluate(() => skinEffects.openPicker(false));
  const editTitle = picker.getByRole('heading', { name: '皓露沁兰', exact: true });
  const resumeDraft = picker.getByRole('button', { name: '继续未完成配置' });
  await editTitle.waitFor();
  assert.match(await selectedSkin.textContent(), /皓露沁兰/, 'the bound skin opens ahead of a draft for a different skin');
  assert.equal(await editTitle.evaluate(title => {
    const selection = title.closest('.selection');
    const body = selection.closest('.body').getBoundingClientRect();
    const rect = title.getBoundingClientRect();
    return selection.getRootNode().activeElement === selection && rect.top >= body.top && rect.bottom <= body.bottom;
  }), true, 'the editor starts at the bound skin and has keyboard focus');
  assert.equal(await resumeDraft.evaluate(button => button.scrollWidth <= button.clientWidth), true);
  await page.screenshot({ path: path.join(output, 'bound-skin-settings-248.png') });
  await resumeDraft.press('Enter');
  await picker.getByRole('heading', { name: '竭雨焚天', exact: true }).waitFor();
  assert.equal(await binding.inputValue(), otherDraftEffect);
  assert.equal(await page.evaluate(() => skinEffects.settings.get('localSkin.1001.101').id), 6123201);
  await picker.getByRole('button', { name: '关闭', exact: true }).click();

  await page.evaluate(() => skinEffects.scope.dispose());
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, source: source.version,
    refreshedLegacyIndex: true, delayedCompanions: true, mockedEffectSound: true,
    carousel: { skin: 8133801, primaryLoops, placement: firstPlacement }, framing, officialCases,
    panel: { previewLabels, skillEffectLabels, savedEffectBindings, panelLayouts, animatedPixels: true,
      openBoundSkin: true, resumeAnotherDraft: true }, requests, errors }, null, 2));
  console.log('Yjcm skin effects checks passed: ' + path.resolve(output));
} finally {
  await browser.close();
}
