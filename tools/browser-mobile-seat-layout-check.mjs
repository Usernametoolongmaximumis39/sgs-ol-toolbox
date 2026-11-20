import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { zipSync, strToU8 } from 'fflate';
import { buildMobileConfigData } from '../src/plugins/skins/mobile-config-data.js';

const cloud = process.env.SGS_MOBILE_CLOUD_FIXTURES ?? '.tmp/mobile-skin-research';
const portraits = process.env.SGS_MOBILE_PORTRAIT_FIXTURES ?? '.tmp/mobile-static-seat-fixtures';
const maChao = process.env.SGS_MOBILE_MA_CHAO_FIXTURES ?? '.tmp/ma-chao-motion';
const config = process.env.SGS_MOBILE_CONFIG_FIXTURES ?? '.tmp/mobile-installed-config/official';
const engine = process.env.SGS_LAYA_CORE ?? path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const baseline = process.env.SGS_MOBILE_SEAT_BASELINE;
const output = path.resolve(process.env.SGS_MOBILE_SEAT_OUTPUT ?? `test-results/mobile-seat-layout/${baseline ? 'before' : 'after'}`);
const requested = process.env.SGS_MOBILE_SEAT_ONLY?.split(',');
const newSkinId = '999901';
const cases = [
  ['90001', '90001_1'],
  ['91401'], ['91401#1'], ['91401#2'], ['char-668'], ['83501'], ['80601'],
  ['10403', '10403_2'], ['83502', '83502_2'], ['83502#1', '83502_2'], ['83502#2', '83502_2'], ['87002', '87002_1'],
  ['30305', '30305_1'],
  ...(requested?.includes('81702') ? [['81702', '81702_1']] : []),
].filter(([id]) => !requested || requested.includes(id));
// Character and background bone counts distinguish the official form rigs.
const sharedFormCases = [
  ['17306', 1, [[198, 460]]], ['22002', 1, [[124, 550]]], ['3000408', 1, [[68, 732]]],
  ['30011', 2, [[9, 1312]]], ['55204', 2, [[12, 886]]], ['58003', 2, [[19, 708]]],
  ['58809', 1, [[30, 681]]], ['78302', 2, [[13, 672]]], ['80602', 1, [[195, 413]]],
  ['85101', 1, [[3, 19], [3, 18], [3, 27]]],
  [newSkinId, 1, [[198, 460]]],
].filter(([id]) => requested?.includes(id));
assert.ok(cases.length || sharedFormCases.length, 'Select at least one known seat fixture');
const layouts = {
  single: [146, 172, 0, null, 1, 1],
  main: [74, 172, 2, [0, 0, 74, 172], 1, 1],
  deputy: [74, 172, 3, [36, 0, 74, 172], 1, 1],
  inset: [146, 172, 0, [6, 12, 134, 155], 1, 1],
  compact: [116, 184, 0, null, .83, 1.08],
};
// Bounds are in the 146 × 172 portrait's logical pixels. The third Wei Yan
// form already reaches the top and needs its taller helmet accounted for.
const compactFraming = {
  90001: { phase: .342, maxHeadroom: 28, minFaceWidth: 20 },
  83502: { phase: .5, maxHeadroom: 22, minFaceWidth: 44 },
  '83502#1': { phase: .5, maxHeadroom: 35, minFaceWidth: 44 },
  '83502#2': { phase: .5, maxHeadroom: 8, minFaceWidth: 40 },
};
const screenshot = { x: 0, y: 0, width: 242, height: 276 };
const origin = 'https://mobile-seat-fixture.test/';
const headers = { 'Access-Control-Allow-Origin': '*' };
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

const configFiles = ['2--skin.lua', '2--chrCfg.lua', '5--SpellData.lua', '6--SoundCfg.lua', '1--Cards.lua', '1--key_card.lua'];
const [metadataBytes, dictionary, configInventory, configTables] = await Promise.all([
  readFile(path.join(cloud, 'waym.txt')),
  readFile(path.join(cloud, 'cloud'), 'utf8'),
  readFile(path.join(config, '..', 'official-config-zip-inventory.json'), 'utf8'),
  Promise.all(configFiles.map(async file => [file.split('--')[1], await readFile(path.join(config, 'config' + file), 'utf8')])),
]);
const { version, md5: indexDigest, url } = JSON.parse(metadataBytes).cloud;
const index = await readFile(path.join(cloud, `cloud_${version}.zip`));
assert.equal(md5(index), indexDigest, 'official resource index checksum');
const resources = new Map([...dictionary.matchAll(/^\s*\["([^"]+)"\]\s*=\s*\{file="([^"]+)",code="([\da-f]{32})",size=(\d+)\},\s*$/gm)]
  .map(([, key, file, digest, size]) => [key, { url: url + file.split('/').map(encodeURIComponent).join('/'), digest, size: Number(size) }]));
const skinConfig = buildMobileConfigData(new Map(configTables));
const sampleSkins = new Set([...cases, ...sharedFormCases].map(([id]) => id.split('#')[0]));
const digests = Object.entries(JSON.parse(configInventory).official).map(([name, value]) => [name, value.md5]);
const routes = new Map([
  ['https://waym.sanguosha.cn/update/cloud.php', metadataBytes],
  [url + `cloud_${version}.zip`, index],
]);
if (sampleSkins.has(newSkinId)) {
  // Model a newly indexed skin using the original, checksum-verified rig files.
  const originalKeys = ['ui/face/skin/17306.png', 'ui/face/skin/17306#1.png', 'ui/face/skin/dynamicSkin/17306_1.zip'];
  const aliases = originalKeys.map(key => {
    const resource = resources.get(key), alias = key.replace('17306', newSkinId);
    resources.set(alias, resource);
    return `["${alias}"] = {file="${resource.url.slice(url.length)}",code="${resource.digest}",size=${resource.size}},`;
  });
  const fixtureDictionary = dictionary.replace(/\r?\n(\s*\}\s*\}\s*)$/, (_, end) => `\n${aliases.join('\n')}\n${end}`);
  const fixtureZip = Buffer.from(zipSync({ cloud: strToU8(fixtureDictionary) }));
  routes.set(url + `cloud_${version}.zip`, fixtureZip);
  routes.set('https://waym.sanguosha.cn/update/cloud.php',
    Buffer.from(JSON.stringify({ cloud: { version, url, md5: md5(fixtureZip) } })));
}
const verifiedAssets = [];
const fixturePaths = new Map(cases.flatMap(([id, motion]) => {
  const png = (id === '91401#2' ? '91401#1' : id.replace(/^char-/, '')) + '.png';
  const isMaChao = id === '30305' || id === '90001';
  const source = isMaChao ? maChao : id === '87002' ? cloud : portraits;
  const portrait = id.startsWith('83502#') ? path.join(cloud, `${id.replace('#', '-')}-portrait.png`) : path.join(source, png);
  return [
    [`ui/face/${id.startsWith('char-') ? 'char' : 'skin'}/${png}`, portrait],
    ...(motion ? [[`ui/face/skin/dynamicSkin/${motion}.zip`, path.join(isMaChao ? maChao : cloud, motion + '.zip')]] : []),
  ];
}));
if (sampleSkins.has('81702')) {
  for (const form of ['#1', '#2', '#3', '#4']) {
    const file = `81702${form}.png`;
    fixturePaths.set(`ui/face/skin/${file}`, path.join(portraits, file));
  }
}
for (const [id, version, forms] of sharedFormCases) {
  const source = id === newSkinId ? '17306' : id;
  const archive = `${id}_${version}.zip`;
  fixturePaths.set(`ui/face/skin/dynamicSkin/${archive}`, path.join(cloud, `${source}_${version}.zip`));
  for (let index = 0; index <= forms.length; index++) {
    const suffix = (index ? `#${index}` : '') + '.png';
    fixturePaths.set(`ui/face/skin/${id}${suffix}`, path.join(portraits, source + suffix));
  }
}
await Promise.all([...fixturePaths].map(async ([key, filename]) => {
  const resource = resources.get(key);
  assert.ok(resource, key);
  const bytes = await readFile(filename);
  assert.equal(bytes.length, resource.size, key);
  assert.equal(md5(bytes), resource.digest, key);
  routes.set(resource.url, bytes);
  verifiedAssets.push({ key, md5: resource.digest });
}));

await mkdir(output, { recursive: true });
const fixtureSource = baseline ? await readFile(baseline, 'utf8') : (await build({
  stdin: { resolveDir: process.cwd(), contents: `
    export { createLocalSkins } from './src/plugins/skins/local.js';
    export { ResourceScope } from './src/core/resources.js';
  ` }, bundle: true, write: false, format: 'iife', globalName: 'MobileSeatCheck',
})).outputFiles[0].text;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: screenshot });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request().url();
    if (request === origin) return route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#24211e"></body>' });
    const body = routes.get(request);
    return route.fulfill(body ? { headers, body } : { headers, status: 404, body: '' });
  });
  await page.goto(origin);
  for (const filename of [engine, ...['spine-core-4.0.min.js', 'laya.spine.min.js'].map(name => path.join(path.dirname(engine), name))]) {
    await page.addScriptTag({ path: filename });
  }
  await page.addScriptTag({ content: fixtureSource });
  await page.evaluate(async ({ skins, generals, digests, screenshot }) => {
    // Use verified publisher config data through the same IndexedDB snapshot path as the game.
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('sgs-toolbox-mobile-cloud-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('index');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('index', 'readwrite');
        tx.objectStore('index').put({ digests: new Map(digests), data: {
          skins: new Map(skins), generals: new Map(generals), voices: new Map(), skinVoices: new Map(),
        } }, 'config-data-v1');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    Laya.init(screenshot.width, screenshot.height);
    Laya.stage.bgColor = '#24211e';
    class SeatAvatar extends Laya.Sprite {
      static AVATAR_MAX_WIDTH = 146;
      SetSkin() {}
    }
    const scene = Laya.stage.addChild(new Laya.Sprite());
    const backdrop = scene.addChild(new Laya.Sprite());
    const avatar = scene.addChild(new SeatAvatar());
    avatar.pos(45, 41);
    avatar.skinTex = avatar.addChild(new Laya.Sprite());
    const chat = scene.chatViewUI = scene.addChild(new Laya.Sprite());
    chat.graphics.drawRect(99, 24, 14, 6, '#129cbe');
    const overlay = scene.addChild(new Laya.Sprite());
    const nameplate = overlay.addChild(new Laya.Sprite());
    nameplate.graphics.drawRect(106, 36, 11, 9, '#3cc693');
    chat.visible = nameplate.visible = false;
    const marker = overlay.addChild(new Laya.Sprite());
    const general = avatar.generalCard = { SkinId: 0, CardName: '局内座位' };
    const seat = Object.assign(new Laya.EventDispatcher(), { Index: 0, General: general, GeneralId: 101,
      IsFaceUp: () => true, GetGeneralBySkillIdOnlyId: () => general });
    const ui = { Seat: seat, seatAvatar: avatar, useCardAniPlay() {}, onUseSkill() {},
      otherTopManager: { render: overlay, seatIndex: marker } };
    seat.on('USE_CARD', ui, ui.useCardAniPlay);
    seat.on('USE_SKILL', ui, ui.onUseSkill);
    const context = { ShowGameSkinEffects: true };
    const scope = new MobileSeatCheck.ResourceScope();
    const values = new Map([['crossServer', true]]);
    const local = MobileSeatCheck.createLocalSkins({ window, document, scope,
      settings: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) },
      game: { getScene: () => scene, isInGame: () => true, getSeatUIs: () => [ui], getSelfSeatUI: () => ui, getSelf: () => ({ ClientId: 101 }),
        getClass: name => name === 'GameContext' ? context : null, getCardMeta: () => ({ name: '杀' }),
        supportsMobileSkinConfig: true,
        async downloadMobileSkinAsset(url, { signal }) {
          const response = await fetch(url, { signal });
          if (!response.ok) throw new Error('Unavailable fixture resource');
          return response.arrayBuffer();
        } },
    });
    const catalogue = await local.mobile.load();
    function fit([width, height, showType, clip, scaleX, scaleY]) {
      avatar.showType = showType;
      avatar.size(width, height);
      avatar.scale(scaleX, scaleY);
      avatar.scrollRect = clip ? new Laya.Rectangle(...clip) : null;
      const visibleWidth = clip?.[2] ?? width, visibleHeight = clip?.[3] ?? height;
      Object.assign(marker, { renderX: avatar.x + 6, renderY: avatar.y + visibleHeight * scaleY - 47,
        renderWidth: 42, renderHeight: 42 });
      backdrop.graphics.clear();
      backdrop.graphics.drawRect(avatar.x, avatar.y, visibleWidth * scaleX, visibleHeight * scaleY, '#ff00ff');
      return local.refresh()[0];
    }
    function state(preview = false) {
      const current = avatar.getChildByName(preview ? 'sgs-local-skin-seat-preview' : 'sgs-local-skin-portrait');
      const draw = current.graphics.cmds?.[0] ?? current.graphics._one;
      const actor = current.getChildByName('sgs-mobile-idle');
      const formButton = overlay.getChildByName('sgs-yjcm-seat-form');
      return {
        clip: [current.x, current.y, current.scrollRect.width, current.scrollRect.height],
        art: draw && [current.x + draw.x, current.y + draw.y, draw.width, draw.height, draw.texture.width, draw.texture.height],
        motion: actor && Array.from({ length: actor.numChildren }, (_, i) => {
          const node = actor.getChildAt(i);
          return [current.x + node.x, current.y + node.y, node.scaleX, node.scaleY, node.rotation];
        }),
        form: formButton && { offset: [formButton.x - marker.renderX, formButton.y - marker.renderY], markerAlpha: marker.alpha,
          label: formButton.getChildByName('sgs-yjcm-form-number').text },
        nativeVisible: avatar.skinTex.visible,
      };
    }
    function tracks(preview = false) {
      const portrait = avatar.getChildByName(preview ? 'sgs-local-skin-seat-preview' : 'sgs-local-skin-portrait');
      const actor = portrait?.getChildByName('sgs-mobile-idle');
      return actor && Array.from({ length: actor.numChildren }, (_, i) => {
        const layer = actor.getChildAt(i);
        const track = layer.state.getCurrent(0);
        return track && { name: track.animation.name, progress: track.trackTime / (track.animation.duration || 1),
          bones: layer.skeleton.bones.length };
      });
    }
    function stepIdle(progress) {
      const portrait = avatar.getChildByName('sgs-local-skin-portrait');
      const actor = portrait.getChildByName('sgs-mobile-idle');
      for (let i = 0; i < actor.numChildren; i++) {
        const layer = actor.getChildAt(i);
        const track = layer.state.getCurrent(0);
        layer.paused();
        layer.timeKeeper.maxDelta = 0;
        track.trackTime = progress * track.animation.duration;
        layer._forceFrame = true;
        layer._update();
      }
    }
    function motionSubjects(id) {
      const portrait = avatar.getChildByName('sgs-local-skin-portrait');
      const actor = portrait.getChildByName('sgs-mobile-idle');
      const character = actor.getChildAt(1);
      function project(layer, name) {
        const slot = layer.skeleton.findSlot(name);
        const attachment = slot?.getAttachment();
        if (!attachment?.computeWorldVertices || !slot.color.a || !attachment.color.a) return null;
        const mesh = attachment instanceof spine.MeshAttachment;
        if (!mesh && !(attachment instanceof spine.RegionAttachment)) return null;
        const vertices = new Float32Array(mesh ? attachment.worldVerticesLength : 8);
        if (mesh) attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
        else attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        const xs = [], ys = [];
        const radians = layer.rotation * Math.PI / 180;
        const cosine = Math.cos(radians), sine = Math.sin(radians);
        for (let i = 0; i < vertices.length; i += 2) {
          xs.push(layer.x + (vertices[i] * cosine + vertices[i + 1] * sine) * layer.scaleX);
          ys.push(layer.y + (vertices[i] * sine - vertices[i + 1] * cosine) * layer.scaleY);
        }
        return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
      }
      const headwear = character.skeleton.slots.map(slot => slot.data.name)
        .filter(name => /^r-(?:fa\d|toukui|toujiao)/.test(name))
        .map(name => project(character, name)).filter(Boolean);
      return {
        face: project(character, 'r-tou'),
        headwearTop: headwear.length ? Math.min(...headwear.map(bounds => bounds.top)) : null,
        wolfEars: id === '90001' ? ['lang-erduo1', 'lang-erduo2'].map(name => project(actor.getChildAt(0), name)) : undefined,
      };
    }
    function showMotionBackground(visible) {
      avatar.getChildByName('sgs-local-skin-portrait').getChildByName('sgs-mobile-idle').getChildAt(0).visible = visible;
    }
    function placeSeat(top) {
      avatar.y = top;
      chat.y = nameplate.y = top - 41;
    }
    function captureScene() {
      const render = scene.drawToCanvas(screenshot.width, screenshot.height, 0, 0);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = screenshot.width;
        canvas.height = screenshot.height;
        const painter = canvas.getContext('2d');
        painter.fillStyle = Laya.stage.bgColor;
        painter.fillRect(0, 0, canvas.width, canvas.height);
        painter.drawImage(render.source, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally { render.destroy(); }
    }
    async function inspect(png, shape) {
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))]));
      const surface = new OffscreenCanvas(image.width, image.height).getContext('2d', { willReadFrequently: true });
      surface.drawImage(image, 0, 0);
      image.close();
      function count(x, y, width, height, match) {
        const { data } = surface.getImageData(x, y, width, height);
        let pixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (match(data[i], data[i + 1], data[i + 2])) pixels++;
        }
        return pixels;
      }
      const left = avatar.x, top = avatar.y;
      const width = Math.floor((shape[3]?.[2] ?? shape[0]) * shape[4]);
      const foreground = (r, g, b) => r !== 36 || g !== 33 || b !== 30;
      const exposed = count(left + 6, top + 4, width - 12, 8, (r, g, b) => r >= 247 && g <= 8 && b >= 247);
      const topPixels = surface.getImageData(left, 0, width, top).data;
      let crownHash = 2166136261;
      for (const byte of topPixels) crownHash = Math.imul(crownHash ^ byte, 16777619);
      return {
        uncovered: exposed / ((width - 12) * 8),
        overflow: count(left + width + 2, top + 4, 3, 8, foreground),
        crown: count(left, 0, width, top, foreground),
        crownHash: crownHash >>> 0,
        crownOverflow: count(0, 0, left, top, foreground) +
          count(left + width + 1, 0, screenshot.width - left - width - 1, top, foreground),
        chatPixels: count(99, top - 17, 14, 6, (r, g, b) => r === 18 && g === 156 && b === 190),
        nameplatePixels: count(106, top - 5, 11, 9, (r, g, b) => r === 60 && g === 198 && b === 147),
      };
    }
    function countOverhangs(node = scene) {
      let count = Number(node.name === 'sgs-mobile-seat-overhang');
      for (let i = 0; i < node.numChildren; i++) count += countOverhangs(node.getChildAt(i));
      return count;
    }
    window.seatFixture = { avatar, local, catalogue, fit, state, scope, marker, tracks, stepIdle, motionSubjects, showMotionBackground,
      placeSeat, inspect, countOverhangs, captureScene, scene, seat, context,
      chrome: visible => { chat.visible = nameplate.visible = visible; },
      clickForm: () => overlay.getChildByName('sgs-yjcm-seat-form').event('click') };
  }, {
    screenshot, digests, generals: [...skinConfig.generals],
    skins: [...skinConfig.skins].filter(([id]) => sampleSkins.has(id.split('#')[0])),
  });
  assert.equal(await page.evaluate(() => seatFixture.catalogue.configStatus), 'cached');

  async function capture(filename, shape, readback = false) {
    let png;
    if (readback) {
      png = await page.evaluate(() => seatFixture.captureScene());
      await writeFile(path.join(output, filename), Buffer.from(png, 'base64'));
    } else {
      const rendered = await page.screenshot({ path: path.join(output, filename), clip: screenshot });
      png = rendered.toString('base64');
    }
    const pixels = await page.evaluate(({ png, shape }) => seatFixture.inspect(png, shape), { png, shape });
    return { png, pixels };
  }
  async function sampleMotionOverhang(id) {
    await page.evaluate(shape => {
      seatFixture.placeSeat(72);
      seatFixture.fit(shape);
    }, layouts.single);
    const frames = [];
    const framing = compactFraming[id];
    const positions = [0, .2, .4, .6, .8];
    if (framing) positions.push(framing.phase);
    positions.sort((a, b) => a - b);
    for (const progress of positions) {
      const subjects = await page.evaluate(({ progress, id, measureFraming }) => {
        seatFixture.stepIdle(progress);
        return measureFraming ? seatFixture.motionSubjects(id) : undefined;
      }, { progress, id, measureFraming: Boolean(framing) });
      frames.push({ progress, subjects, ...await capture(`${id}-headroom-${progress}.png`, layouts.single, true) });
    }
    const maximum = frames.reduce((best, frame) => frame.pixels.crown > best.pixels.crown ? frame : best);
    const { progress, pixels, subjects } = framing ? frames.find(frame => frame.progress === framing.phase) : maximum;
    await writeFile(path.join(output, `${id}-headroom.png`), Buffer.from(maximum.png, 'base64'));
    await page.evaluate(value => {
      seatFixture.stepIdle(value);
      seatFixture.showMotionBackground(false);
    }, progress);
    const withoutBackground = (await capture(`${id}-headroom-foreground.png`, layouts.single, true)).pixels;
    await page.evaluate(() => seatFixture.showMotionBackground(true));
    if (id !== '90001') {
      assert.equal(withoutBackground.crownHash, pixels.crownHash, id + ' keeps its painted backdrop inside the card');
    } else if (!baseline) {
      assert.notEqual(withoutBackground.crownHash, pixels.crownHash, id + ' renders the moving wolf and lightning above the card');
      assert.ok(pixels.crown > 0, id + ' restores the visible artwork at the screenshot phase');
    }

    const cropped = {}, croppedSubjects = {};
    for (const label of ['main', 'deputy', 'inset', 'compact']) {
      croppedSubjects[label] = await page.evaluate(({ shape, id, progress, measureFraming }) => {
        seatFixture.fit(shape);
        seatFixture.stepIdle(progress);
        return measureFraming ? seatFixture.motionSubjects(id) : undefined;
      }, { shape: layouts[label], id, progress, measureFraming: Boolean(framing) });
      cropped[label] = (await capture(`${id}-headroom-${label}.png`, layouts[label], true)).pixels;
      assert.equal(cropped[label].crownOverflow, 0, `${id} ${label} respects the seat edges above the card`);
      if (framing) {
        assert.ok(cropped[label].uncovered < .025, `${id} ${label} paints the top edge inside the card`);
        assert.equal(cropped[label].overflow, 0, `${id} ${label} stays inside the rendered card edge`);
      }
    }
    assert.equal(cropped.inset.crown, 0, id + ' obeys the native vertical crop');
    await page.evaluate(shape => {
      seatFixture.fit(shape);
      seatFixture.chrome(true);
    }, layouts.single);
    const chrome = (await capture(`${id}-headroom-with-chrome.png`, layouts.single, true)).pixels;
    await page.evaluate(() => {
      seatFixture.chrome(false);
      seatFixture.placeSeat(41);
    });
    assert.equal(chrome.chatPixels, 14 * 6, id + ' leaves chat controls visible');
    assert.equal(chrome.nameplatePixels, 11 * 9, id + ' leaves the nameplate visible');
    const samples = frames.map(({ progress, pixels, subjects }) => ({ progress, pixels, subjects }));
    if (!baseline && framing) {
      for (const frame of samples) {
        const top = frame.subjects.headwearTop;
        assert.ok(Number.isFinite(top) && top >= -12 && top <= framing.maxHeadroom,
          `${id} ${frame.progress} keeps the crest near the top of the card (${top})`);
      }
      assert.ok(subjects.face && subjects.face.right - subjects.face.left >= framing.minFaceWidth,
        id + ' keeps the face large enough at the reference pose');
      if (id === '90001') {
        assert.ok(subjects.wolfEars.some(ear => ear && ear.left < 130 && ear.top < 0 && ear.bottom > 0),
          id + ' retains the wolf ear across the card edge');
      }
    }
    if (!baseline && ['10403', '87002', '90001'].includes(id)) {
      const minimum = id === '90001' ? 0 : 300;
      assert.ok(maximum.pixels.crown > minimum, id + ' paints the authored foreground above the card');
      assert.ok(new Set(samples.map(frame => frame.pixels.crownHash)).size > 1, id + ' keeps the overhang animated');
      assert.ok(cropped.main.crown + cropped.deputy.crown > minimum, id + ' keeps visible foreground when the seat is split');
    }
    return { frames: samples, maximum: { progress: maximum.progress, pixels: maximum.pixels },
      reference: { progress, pixels, subjects }, withoutBackground, cropped, croppedSubjects, chrome };
  }
  function applySample(id, startingForm = id) {
    return page.evaluate(async ({ id, startingForm, layout }) => {
      const { avatar, local, catalogue, fit } = seatFixture;
      const target = fit(layout);
      const exact = catalogue.findSkin('cloud-' + id);
      const main = catalogue.findSkin('cloud-' + id.split('#')[0]);
      if (!await local.applyYjcm(target, main, {}, new AbortController().signal, undefined, undefined, catalogue, undefined, startingForm)) {
        throw new Error(`Failed to apply ${id}`);
      }
      if (avatar.skinTex.visible) throw new Error('Native art remains visible');
      return { general: exact.general, name: exact.name, motion: exact.mobileMotion, layout: exact.mobileMotionLayout,
        formCount: catalogue.skinForms(main).length };
    }, { id, startingForm, layout: layouts.single });
  }
  async function resetSample(id) {
    assert.equal(await page.evaluate(() => {
      const { local, avatar, fit, marker, countOverhangs } = seatFixture;
      local.reset(fit([146, 172, 0, null, 1, 1]));
      return avatar.skinTex.visible && !avatar.getChildByName('sgs-local-skin-portrait') && marker.alpha === 1 && !countOverhangs();
    }), true, id + ' restores its native layer');
  }
  const results = [], captures = [], sharedForms = [];
  for (const [id, motion] of cases) {
    const choiceFromFirst = id === '91401#2';
    const entry = await applySample(id, choiceFromFirst ? '91401' : id);
    if (choiceFromFirst) {
      await page.evaluate(() => seatFixture.clickForm());
      await page.getByRole('button', { name: '第三形态' }).click();
      await page.waitForFunction(() => seatFixture.state().form?.label === '3/3');
    }
    let initialTracks, midpointTracks, idleTracks;
    if (motion) {
      assert.ok(entry.motion.endsWith(`/${motion}.zip`), id + ' uses the expected motion');
      assert.ok(entry.layout?.version);
      await page.waitForFunction(() => seatFixture.tracks()?.length >= 2, null, { timeout: 30000 });
      initialTracks = await page.evaluate(() => seatFixture.tracks());
      // The production application path may briefly play the entrance animation.
      if (!/^(daiji|idle|standby|play)$/i.test(initialTracks[1].name)) {
        await page.screenshot({ path: path.join(output, `${id}-entry.png`), clip: screenshot });
      }
      if (id === '83502') {
        await page.waitForFunction(() => {
          const track = seatFixture.tracks()?.[1];
          return /^chuchang$/i.test(track?.name) && track.progress >= .44;
        }, null, { timeout: 12000 });
        midpointTracks = await page.evaluate(() => seatFixture.tracks());
        await page.screenshot({ path: path.join(output, `${id}-entry-midpoint.png`), clip: screenshot });
      }
      await page.waitForFunction(() => /^(daiji|idle|standby|play)$/i.test(seatFixture.tracks()?.[1]?.name), null, { timeout: 16000 });
      idleTracks = await page.evaluate(() => seatFixture.tracks());
    }
    const states = {};
    for (const [label, shape] of Object.entries(layouts)) {
      states[label] = await page.evaluate(shape => {
        seatFixture.fit(shape);
        return seatFixture.state();
      }, shape);
      const onMontage = ['single', 'deputy', 'compact'].includes(label);
      if (!onMontage && id !== 'char-668') continue;
      const { pixels, png } = await capture(`${id.replace('#', '-')}-${label}.png`, shape);
      states[label].pixels = pixels;
      if (!onMontage) continue;
      const name = id.startsWith('char-') ? `${entry.general} · ${entry.name}` : entry.name;
      captures.push({ id, label, name, png });
    }
    if (id === 'char-668') {
      await page.evaluate(shape => {
        seatFixture.fit(shape);
        seatFixture.chrome(true);
      }, layouts.single);
      states.chrome = (await capture('char-668-seat-with-chrome.png', layouts.single)).pixels;
      await page.evaluate(() => seatFixture.chrome(false));
    }
    if (!motion || id === '10403') {
      await page.evaluate(async ({ id, shape }) => {
        const { local, catalogue, fit } = seatFixture;
        seatFixture.previewController = new AbortController();
        await local.previewYjcm(fit(shape), catalogue.findSkin('cloud-' + id), seatFixture.previewController.signal);
      }, { id, shape: layouts.single });
      if (motion) await page.waitForFunction(() => /^(daiji|idle|standby|play)$/i.test(seatFixture.tracks(true)?.[1]?.name));
      states.preview = await page.evaluate(() => seatFixture.state(true));
      if (id === 'char-668') states.preview.pixels = (await capture('char-668-preview.png', layouts.single)).pixels;
      await page.evaluate(() => seatFixture.previewController.abort());
    }
    const motionOverhang = motion ? await sampleMotionOverhang(id) : undefined;
    const switchedForms = [];
    if (id === '81702' && !baseline) {
      const labels = ['第一形态', '第二形态', '第三形态', '第四形态', '第五形态'];
      const expectedBones = [[229, 400], [164, 363], [134, 386], [35, 573], [251, 356]];
      await page.evaluate(shape => seatFixture.fit(shape), layouts.single);
      for (const index of [1, 2, 3, 4, 0]) {
        await page.evaluate(() => seatFixture.clickForm());
        await page.getByRole('button', { name: labels[index] }).click();
        await page.waitForFunction(form => {
          const tracks = seatFixture.tracks();
          return seatFixture.state().form?.label === `${form}/5` &&
            tracks?.[0]?.name === 'BeiJing' && tracks[1]?.name === 'DaiJi' && tracks[1].progress > .01;
        }, index + 1);
        const tracks = await page.evaluate(() => seatFixture.tracks());
        assert.deepEqual(tracks.map(track => track.bones), expectedBones[index], labels[index] + ' uses its own two skeletons');
        await capture(`81702-form-${index + 1}.png`, layouts.single);
        switchedForms.push({ form: index + 1, tracks });
      }
    }
    if (choiceFromFirst && !baseline) {
      await page.evaluate(shape => {
        seatFixture.fit(shape);
        seatFixture.clickForm();
      }, layouts.single);
      await page.getByRole('button', { name: '第一形态' }).click();
      await page.waitForFunction(() => seatFixture.state().form?.label === '1/3');
    }
    await resetSample(id);
    results.push({ id, ...entry, initialTracks, midpointTracks, idleTracks, states, motionOverhang,
      ...(switchedForms.length && { switchedForms }) });
  }
  const formArt = id => results.find(sample => sample.id === id)?.states.single.pixels.crownHash;
  if (!baseline && formArt('91401#2') && formArt('91401') && formArt('91401#1')) {
    assert.equal(formArt('91401#2'), formArt('91401#1'), 'water and fire share the alternate portrait');
    assert.notEqual(formArt('91401#2'), formArt('91401'), 'water and initial forms use different portraits');
  }
  for (const [id, version, expectedBones] of sharedFormCases) {
    const { name, general, motion, formCount } = await applySample(id);
    const archive = `ui/face/skin/dynamicSkin/${id}_${version}.zip`;
    assert.equal(motion, id === '85101' ? undefined : archive, id + ' respects the initial form resources');
    const labels = ['第二形态', '第三形态', '第四形态'];
    for (const [index, expected] of expectedBones.entries()) {
      const form = index + 2;
      await page.evaluate(() => seatFixture.clickForm());
      if (formCount > 2) await page.getByRole('button', { name: labels[index], exact: true }).click();
      await page.waitForFunction(label => {
        const tracks = seatFixture.tracks();
        return seatFixture.state().form?.label === label &&
          tracks?.[0]?.name === 'BeiJing' && tracks[1]?.name === 'DaiJi' && tracks[1].progress > .01;
      }, `${form}/${formCount}`, { timeout: 30000 });
      const tracks = await page.evaluate(() => seatFixture.tracks());
      assert.deepEqual(tracks.map(track => track.bones), expected, `${id} ${labels[index]} uses its own two skeletons`);
      const filename = `${id}-form-${form}.png`;
      const { png } = await capture(filename, layouts.single);
      captures.push({ id, name: `${general} · ${name}`, label: labels[index], png });
      sharedForms.push({ id, name, general, archive, form, tracks, screenshot: filename });
    }
    await resetSample(id);
  }
  const sceneEffects = [];
  const attackCases = ['87002', '83502#2'].filter(id => cases.some(([sample]) => sample === id));
  if (!baseline && attackCases.length) {
    const stage = { width: 1180, height: 720, sidebar: 180 };
    await page.setViewportSize({ width: stage.width, height: stage.height });
    await page.evaluate(({ width, height, sidebar }) => {
      const { scene, avatar, context, seat } = seatFixture;
      Laya.stage.designWidth = width;
      Laya.stage.designHeight = height;
      Laya.stage.setScreenSize(width, height);
      context.SceneRightWidth = sidebar;
      avatar.pos(width - sidebar - 192, height - 209);
      const sidebarShape = scene.addChild(new Laya.Sprite());
      sidebarShape.graphics.drawRect(width - sidebar, 0, sidebar, height, '#353735');
      const character = () => avatar.getChildByName('sgs-local-skin-portrait')?.getChildByName('sgs-mobile-idle')?.getChildAt(1);
      const layer = () => scene.getChildByName('sgs-mobile-attack');
      const attack = () => layer()?.getChildAt(0);
      function capturePixels() {
        const frame = scene.drawToCanvas(width, height, 0, 0);
        try { return frame.source.getContext('2d').getImageData(0, 0, width, height).data; }
        finally { frame.destroy(); }
      }
      function measure() {
        const playing = layer();
        const painted = capturePixels();
        playing.visible = false;
        let board;
        try { board = capturePixels(); }
        finally { playing.visible = true; }
        let outsideSeat = 0, outsideBoard = 0;
        for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
          if (x >= avatar.x && x < avatar.x + avatar.width && y >= avatar.y && y < avatar.y + avatar.height) continue;
          const offset = (y * width + x) * 4;
          if (Math.abs(painted[offset] - board[offset]) + Math.abs(painted[offset + 1] - board[offset + 1]) +
              Math.abs(painted[offset + 2] - board[offset + 2]) + Math.abs(painted[offset + 3] - board[offset + 3]) <= 10) continue;
          if (x < width - sidebar) outsideSeat++;
          else outsideBoard++;
        }
        return { outsideSeat, outsideBoard };
      }
      window.attackFixture = { attack, layer, character, measure,
        slash: type => seat.event('USE_CARD', [75, type]),
        skill: id => seat.event('USE_SKILL', [{ Skill: { ID: id, IsGeneral: true }, DestSeatIDs: [] }]),
      };
    }, stage);
    for (const id of attackCases) {
      const shape = id.includes('#') ? layouts.deputy : layouts.single;
      await page.evaluate(async ({ id, shape }) => {
        const { local, catalogue, fit } = seatFixture;
        const entry = catalogue.findSkin('cloud-' + id.split('#')[0]);
        const form = Number(id.split('#')[1] ?? 0) + 1;
        const binding = { [form]: { 891: 'mobile:attack', 892: 'mobile:special' } };
        if (!await local.applyYjcm(fit(shape), entry, {}, new AbortController().signal, undefined, undefined, catalogue, binding, id)) {
          throw new Error('Failed to apply the mobile attack fixture');
        }
      }, { id, shape });
      await page.waitForFunction(() => seatFixture.tracks()?.[1]?.name === 'DaiJi', null, { timeout: 18000 });
      const start = await page.evaluate(() => {
        const { attack, layer, character, slash } = attackFixture;
        const { scene } = seatFixture;
        slash(2);
        const ignoredResponse = !layer();
        slash(1);
        const actor = attack();
        if (!actor) throw new Error('Playing Slash did not start the scene attack');
        slash(1);
        attackFixture.revealed = null;
        actor.on(Laya.Event.LABEL, scene, cue => {
          if (cue.name === 'ZheZhao') attackFixture.revealed = !layer().visible && character().visible;
        });
        return { ignoredResponse, sameAttack: actor === attack(), sceneChild: layer().parent === scene,
          pointerEnabled: layer().mouseEnabled || actor.mouseEnabled, characterVisible: character().visible,
          clip: [layer().scrollRect.width, layer().scrollRect.height], track: actor.state.getCurrent(0).animation.name };
      });
      assert.deepEqual(start, { ignoredResponse: true, sameAttack: true, sceneChild: true, pointerEnabled: false,
        characterVisible: false, clip: [stage.width - stage.sidebar, stage.height], track: 'GongJi' }, id);
      await page.waitForFunction(() => attackFixture.attack()?.state.getCurrent(0)?.trackTime > .8);
      const pixels = await page.evaluate(() => attackFixture.measure());
      assert.ok(pixels.outsideSeat > 500, id + ' paints the official effect beyond the seat');
      assert.equal(pixels.outsideBoard, 0, id + ' keeps the sidebar clear');
      await page.screenshot({ path: path.join(output, `mobile-attack-${id.replace('#', '-')}.png`) });
      await page.waitForFunction(() => !attackFixture.layer());
      assert.equal(await page.evaluate(() => attackFixture.revealed), true, id + ' restores the character at the authored cue');

      const lifecycle = await page.evaluate(shape => {
        const { layer, character, slash, skill } = attackFixture;
        const { local, fit, context, avatar } = seatFixture;
        slash(1);
        const interrupted = layer();
        skill(892);
        const inSeat = interrupted?.destroyed && !layer() && character().visible &&
          character().state.getCurrent(0)?.animation.name === 'TeShu';
        context.ShowGameSkinEffects = false;
        local.refresh();
        slash(1);
        const disabled = !layer() && character().visible;
        context.ShowGameSkinEffects = true;
        skill(891);
        const bound = layer();
        context.ShowGameSkinEffects = false;
        local.refresh();
        const disabledDuringAttack = bound?.destroyed && !layer() && character().visible;
        context.ShowGameSkinEffects = true;
        skill(891);
        const resetting = layer();
        local.reset(fit(shape));
        return { inSeat, disabled, disabledDuringAttack, reset: resetting?.destroyed && !layer() && avatar.skinTex.visible };
      }, shape);
      assert.deepEqual(lifecycle, { inSeat: true, disabled: true, disabledDuringAttack: true, reset: true }, id);
      sceneEffects.push({ id, start, pixels, revealed: true, lifecycle });
    }
  }
  await page.evaluate(() => seatFixture.scope.dispose());
  await page.setContent('<style>body{margin:18px;background:#24211e;color:#e7d5af;font:15px sans-serif}section{display:grid;grid-template-columns:repeat(3,242px);gap:5px;margin-bottom:16px}div{text-align:center}img{display:block}</style><main></main>');
  await page.evaluate(captures => {
    const main = document.querySelector('main');
    let previousId;
    for (const capture of captures) {
      if (capture.id !== previousId) {
        previousId = capture.id;
        const heading = document.createElement('p');
        heading.textContent = `${capture.name} #${capture.id}`;
        main.append(heading, document.createElement('section'));
      }
      const cell = document.createElement('div');
      cell.textContent = { single: '单将', deputy: '副将裁切', compact: '窄座位缩放' }[capture.label] ?? capture.label;
      const image = document.createElement('img');
      image.src = 'data:image/png;base64,' + capture.png;
      image.width = 242;
      image.height = 276;
      cell.append(image);
      main.lastElementChild.append(cell);
    }
  }, captures);
  await page.setViewportSize({ width: 780, height: 600 });
  await page.screenshot({ path: path.join(output, 'seat-layout.png'), fullPage: true });
  await writeFile(path.join(output, 'geometry.json'), JSON.stringify({ version, indexDigest, verifiedAssets, results, sceneEffects, sharedForms }, null, 2) + '\n');
  assert.deepEqual(errors, []);

  if (!baseline) for (const { id, motion, formCount, initialTracks, idleTracks, states } of results) {
    if (motion) {
      assert.deepEqual(initialTracks.map(track => track.name), ['ChuChang', 'ChuChang'], id + ' plays its entrance tracks together');
      assert.deepEqual(idleTracks.map(track => track.name), ['BeiJing', 'DaiJi'], id + ' restores idle');
      assert.ok(Math.abs(initialTracks[0].progress - initialTracks[1].progress) < .04, id + ' starts the two entrance layers in sync');
    }
    for (const [label, [width, height, , clip]] of Object.entries(layouts)) {
      assert.deepEqual(states[label].clip, clip ?? [0, 0, width, height], `${id} ${label} keeps the native clip`);
      assert.equal(states[label].nativeVisible, false);
      if (formCount > 1) assert.deepEqual(states[label].form, {
        offset: [2, 2], markerAlpha: 0, label: `${Number(id.split('#')[1] ?? 0) + 1}/${formCount}`,
      }, `${id} ${label} uses the shared native form marker anchor`);
      const art = states[label].art;
      if (art) {
        const [sourceWidth, sourceHeight] = art.slice(4);
        assert.equal(sourceWidth, 138);
        assert.equal(sourceHeight, 253);
        const top = -art[1] * sourceWidth / art[2];
        assert.ok(top >= 30 && top <= 33, `${id} ${label} aligns the authored card body beneath the headdress`);
        assert.ok(Math.abs(art[2] / art[3] - sourceWidth / sourceHeight) < .001, `${id} ${label} scales proportionally`);
        assert.ok(art[2] + .01 >= width && art[1] + art[3] + .01 >= height, `${id} ${label} covers the seat`);
      }
    }
    for (const label of ['main', 'deputy', 'inset']) {
      const key = motion ? 'motion' : 'art';
      assert.deepEqual(states[label][key], states.single[key], `${id} ${label} keeps the full portrait transform`);
    }
    if (states.preview) {
      const { pixels, ...single } = states.single;
      const { pixels: previewPixels, ...preview } = states.preview;
      assert.deepEqual(preview, single, id + ' previews at the applied position');
      if (previewPixels) assert.equal(previewPixels.crown, pixels.crown, id + ' preview draws the same headdress');
    }
    for (const label of ['single', 'deputy', 'compact']) {
      const { uncovered, overflow, crown, crownOverflow } = states[label].pixels;
      assert.ok(uncovered < .025, `${id} ${label} has no empty strip inside the rendered card body`);
      assert.equal(overflow, 0, `${id} ${label} stays inside the rendered card edge`);
      if (!motion) {
        assert.ok(crown > 100, `${id} ${label} restores the visible headdress (${crown} pixels)`);
        assert.equal(crownOverflow, 0, `${id} ${label} clips the headdress at the seat edges`);
      }
    }
    if (id === 'char-668') {
      assert.ok(states.main.pixels.crown > 100, 'main general clip retains the visible part of the crown');
      assert.equal(states.main.pixels.crownOverflow, 0, 'main general clips the crown at its seat edge');
      assert.equal(states.inset.pixels.crown, 0, 'positive vertical inset suppresses the crown overhang');
      assert.ok(states.chrome.crown > 100, 'crown stays visible beside the chat control');
      assert.equal(states.chrome.chatPixels, 14 * 6, 'chat control renders above the crown');
      assert.equal(states.chrome.nameplatePixels, 11 * 9, 'nameplate renders above the crown');
    }
  }
  console.log(`${baseline ? 'Captured' : 'Verified'} ${cases.length + sharedFormCases.length} mobile seat samples from ${version} in ${output}`);
} finally { await browser.close(); }
