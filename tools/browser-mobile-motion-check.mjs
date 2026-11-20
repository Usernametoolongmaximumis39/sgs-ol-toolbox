import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const source = process.env.SGS_MOBILE_MOTION_FIXTURES ?? '.tmp/mobile-skin-research';
const engine = process.env.SGS_LAYA_CORE ?? path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
const output = path.resolve(process.env.SGS_MOBILE_MOTION_OUTPUT ?? 'test-results/mobile-motion');
const expected = { '10305_1': [2.3333333, 2.3333333], '10403_2': [5.3333335, 2.6666667], '87002_1': [6.6666665, 6.6666665] };
const layouts = {
  '10305_1': { scale: .65, offsetX: -85, offsetY: -190, rotation: 0 },
  '10403_2': { scale: .75, offsetX: -64.992, offsetY: -192.978, rotation: 0 },
  '87002_1': { scale: .66, offsetX: -110.536, offsetY: -164.038, rotation: 0 },
};
const seatSamples = [
  ['110_1', '刘备 · 龙御天下', 'tou', { scale: .58, offsetX: 35.944, offsetY: -164.722, rotation: 0 }],
  ['36601_1', '董白 · 猪年春节', 'dbtou', { scale: .55, offsetX: -45, offsetY: -115, rotation: 0 }],
  ['52601_2', '苏飞 · 肝胆相照', 'sftou', { scale: .8, offsetX: -22.2498, offsetY: -226.8831, rotation: 0 }],
  ['87002_1', '神姜维 · 剑引天霖', 'r-lian', layouts['87002_1']],
  ['3000405_2', '曹纯 · 追亡逐北', 'caochun128', { scale: .6, offsetX: -65.987, offsetY: -182.996, rotation: 16 }],
  ['10403_2', '杨修 · 鼠年端午', 'daunwu_20', layouts['10403_2']],
];
const inputs = await Promise.all(Object.keys(expected).map(async id =>
  [id, (await readFile(path.join(source, id + '.zip'))).toString('base64'), layouts[id]]));
const weiYan = (await readFile(path.join(source, '83502_2.zip'))).toString('base64');
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    export { createMobileMotion } from './src/plugins/skins/mobile-dynamic.js';
    export { openMobileZip } from './src/plugins/skins/mobile-cloud.js';
    export { readMobileSpine36 } from './src/plugins/skins/mobile-spine36.js';
    export { loadMobileMotion } from './src/plugins/skins/mobile-effects.js';
    export { createYjcmEffectPicker, EFFECT_PICKER_STYLES } from './src/plugins/skins/yjcm-effect-picker.js';
    export { normalizeYjcmEffectBindings, resolveYjcmEffect } from './src/plugins/skins/yjcm-effects.js';
    export { CONTROL_STYLES } from './src/ui/controls.js';
  ` }, bundle: true, write: false, format: 'iife', globalName: 'MobileMotionCheck',
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 350 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<body style="margin:0;background:#24211e"></body>');
  for (const file of [engine, ...['spine-core-4.0.min.js', 'laya.spine.min.js'].map(name => path.join(path.dirname(engine), name))]) {
    await page.addScriptTag({ path: file });
  }
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const states = await page.evaluate(async inputs => {
    Laya.init(1160, 350);
    Laya.stage.bgColor = '#24211e';
    const { createMobileMotion, openMobileZip, readMobileSpine36 } = MobileMotionCheck;
    const width = 146, height = 172, splitWidth = 74, cut = 36;
    const fixtures = [];
    function state(node) {
      const layers = [];
      for (let i = 0; i < node.numChildren; i++) {
        const layer = node.getChildAt(i);
        layers.push({ x: layer.x, y: layer.y, scale: [layer.scaleX, layer.scaleY], rotation: layer.rotation,
          duration: layer.skeleton.data.findAnimation(i ? 'DaiJi' : 'BeiJing').duration });
      }
      return layers;
    }
    async function verifyCharacter(archive, actor) {
      const stem = archive.names.find(name => name.endsWith('/XingXiang.skel')).slice(0, -5);
      const atlas = new spine.TextureAtlas(new TextDecoder().decode(await archive.read(stem + '.atlas')));
      const pages = atlas.pages;
      for (const page of pages) {
        const size = { width: page.width, height: page.height };
        page.setTexture({ getImage: () => size, setFilters() {}, setWraps() {} });
      }
      const data = readMobileSpine36(await archive.read(stem + '.skel'));
      const reference = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(data);
      const loaded = actor.skeleton.data;
      let meshCount = 0, uvDelta = 0;
      for (const skin of loaded.skins) {
        for (const { slotIndex, name, attachment } of skin.getAttachments()) {
          if (!(attachment instanceof spine.MeshAttachment)) continue;
          const expected = reference.findSkin(skin.name).getAttachment(slotIndex, name).uvs;
          for (const [i, value] of attachment.uvs.entries()) uvDelta = Math.max(uvDelta, Math.abs(value - expected[i]));
          meshCount++;
        }
      }
      const uploaded = Object.values(actor._templet._textureDic);
      const atlasPixels = pages.reduce((sum, { width, height }) => sum + width * height, 0);
      const uploadedPixels = uploaded.reduce((sum, { sourceWidth, sourceHeight }) => sum + sourceWidth * sourceHeight, 0);
      const mipLevels = Math.max(...uploaded.map(({ bitmap }) => bitmap.mipmapCount));
      const face = actor.skeleton.findSlot('r-lian');
      const attachment = face.getAttachment();
      const vertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(face, 0, vertices.length, vertices, 0, 2);
      const columns = Array.from(vertices).filter((_, index) => index % 2 === 0);
      const left = actor.x + Math.min(...columns) * actor.scaleX;
      const right = actor.x + Math.max(...columns) * actor.scaleX;
      return { meshCount, uvDelta, atlasPixels, uploadedPixels, mipLevels, faceWidth: right - left, faceCenter: (left + right) / 2 };
    }
    for (const [index, [id, base64, layout]] of inputs.entries()) {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const archive = openMobileZip(window, bytes.buffer);
      const controller = new AbortController();
      const delayedArchive = index === 0 ? { names: archive.names, async read(name, options) {
        if (name.endsWith('/XingXiang.png')) await new Promise(resolve => setTimeout(resolve, 300));
        return archive.read(name, options);
      } } : archive;
      const motion = await createMobileMotion(window, delayedArchive, controller.signal, '', layout);
      const trackTimes = [0, 1].map(index => motion.actor.getChildAt(index).state.getCurrent(0).trackTime);
      const parent = new Laya.Sprite();
      parent.pos(42 + index * 375, 72); parent.size(width, height);
      parent.scale(index ? 1.25 : .85, index ? 1.25 : .85);
      parent.scrollRect = new Laya.Rectangle(0, 0, width, height);
      Laya.stage.addChild(parent);
      parent.addChild(motion.actor);
      motion.fit(0, 0, width, height);
      const full = state(motion.actor);
      motion.fit(-cut, 0, width, height);
      const split = state(motion.actor);
      motion.fit(0, 0, width, height);
      const character = id === '87002_1' ? await verifyCharacter(archive, motion.actor.getChildAt(1)) : null;
      const duplicate = await createMobileMotion(window, archive, controller.signal, '', layout);
      const crop = new Laya.Sprite();
      crop.pos(225 + index * 375, 72); crop.size(splitWidth, height); crop.scale(parent.scaleX, parent.scaleY);
      crop.scrollRect = new Laya.Rectangle(0, 0, splitWidth, height);
      Laya.stage.addChild(crop);
      crop.addChild(duplicate.actor);
      duplicate.fit(-cut, 0, width, height);
      fixtures.push({ id, controller, actor: motion.actor, duplicate: duplicate.actor, parent, crop, full, split, character, trackTimes });
    }
    window.fixtures = fixtures;
    return fixtures.map(({ id, full, split, character, trackTimes }) => ({ id, full, split, character, trackTimes }));
  }, inputs);
  for (const { id, full, split, trackTimes } of states) {
    assert.equal(full.length, 2);
    assert.deepEqual({ ...full[0], duration: 0 }, { ...full[1], duration: 0 }, 'both layers retain their shared origin and scale');
    assert.ok(Math.abs(trackTimes[0] - trackTimes[1]) < .05, 'slow texture decoding must not desynchronize the layers');
    for (const [index, layer] of full.entries()) {
      assert.ok(Math.abs(layer.duration - expected[id][index]) < .0001);
      assert.equal(layer.scale[0], layer.scale[1], 'the native animation should retain its authored proportions');
      assert.deepEqual(layer.scale, split[index].scale, 'switching to a dual-general seat should preserve the full-seat scale');
      assert.ok(Math.abs(split[index].x - layer.x + 36) < 1e-6);
      assert.equal(split[index].y, layer.y);
    }
  }
  const { character } = states.find(({ id }) => id === '87002_1');
  assert.ok(character.atlasPixels > 8 * 1024 * 1024 && character.uploadedPixels <= 8 * 1024 * 1024);
  assert.equal(character.mipLevels, 1, 'the resized character pages allocate only the base texture level');
  assert.ok(character.meshCount > 0 && character.uvDelta < 1e-6, 'resized textures preserve the original mesh UVs');
  assert.ok(character.faceWidth >= 16 && character.faceCenter >= 36 && character.faceCenter <= 110,
    'the face remains readable in the full and split seat');
  await page.screenshot({ path: path.join(output, 'idle-first.png') });
  const crops = [{ x: 42, y: 72, width: 124, height: 146 }, { x: 417, y: 72, width: 182, height: 214 },
    { x: 792, y: 72, width: 182, height: 214 }];
  const capture = async () => {
    const frames = [];
    for (const clip of crops) frames.push(await page.screenshot({ clip }));
    return frames;
  };
  await page.evaluate(() => { for (const { actor } of fixtures) actor.getChildAt(0).visible = false; });
  const earlier = await capture();
  await page.waitForTimeout(420);
  const later = await capture();
  for (const [index, frame] of earlier.entries()) assert.notDeepEqual(frame, later[index], 'the character idle loop should advance in Chromium');
  await page.evaluate(() => { for (const { actor } of fixtures) actor.getChildAt(0).visible = true; });
  await page.screenshot({ path: path.join(output, 'idle-later.png') });
  const disposed = await page.evaluate(() => fixtures.every(({ controller, actor, duplicate, parent, crop }) => {
    controller.abort();
    return actor.destroyed && duplicate.destroyed && !parent.numChildren && !crop.numChildren;
  }));
  assert.equal(disposed, true);
  await page.route('https://motion-fixtures.invalid/*.zip', route =>
    route.fulfill({ path: path.join(source, new URL(route.request().url()).pathname.slice(1)),
      headers: { 'access-control-allow-origin': '*' } }));
  const seatFraming = [];
  for (const [id, title, slotName, layout] of seatSamples) {
    const sample = await page.evaluate(async ({ id, slotName, layout }) => {
      const bytes = await (await fetch('https://motion-fixtures.invalid/' + id + '.zip')).arrayBuffer();
      const archive = MobileMotionCheck.openMobileZip(window, bytes);
      const controller = new AbortController();
      const motion = await MobileMotionCheck.createMobileMotion(window, archive, controller.signal, '', layout);
      const panel = new Laya.Sprite();
      Laya.stage.addChild(panel);
      panel.addChild(motion.actor);
      const background = motion.actor.getChildAt(0), character = motion.actor.getChildAt(1);
      const facePose = new spine.Skeleton(character.skeleton.data);
      const faceSlot = facePose.findSlot(slotName);
      const idle = character.state.getCurrent(0).animation;
      const radians = layout.rotation * Math.PI / 180;
      const cosine = Math.cos(radians), sine = Math.sin(radians);
      for (const child of [background, character]) {
        child.paused();
        child.timeKeeper.maxDelta = 0;
      }
      const results = [];
      try {
        for (const [width, height, clipWidth, cut] of [[146, 172, 146, 0], [124, 196, 124, 0], [186, 160, 186, 0], [146, 172, 74, 36]]) {
          panel.scrollRect = new Laya.Rectangle(0, 0, clipWidth, height);
          motion.fit(-cut, 0, width, height);
          const transform = [background, character].map(layer => [layer.x, layer.y, layer.scaleX, layer.rotation]);
          const poses = [];
          for (const ratio of [0, .2, .4, .6, .8]) {
            for (const layer of [background, character]) {
              const track = layer.state.getCurrent(0);
              track.trackTime = ratio * track.animation.duration;
              layer._forceFrame = true;
              layer._update();
            }
            facePose.setToSetupPose();
            idle.apply(facePose, -1, ratio * idle.duration, false, null, 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
            facePose.updateWorldTransform();
            const attachment = faceSlot.getAttachment();
            const vertices = new Float32Array(attachment.worldVerticesLength ?? 8);
            if (attachment instanceof spine.MeshAttachment) {
              attachment.computeWorldVertices(faceSlot, 0, vertices.length, vertices, 0, 2);
            } else {
              attachment.computeWorldVertices(faceSlot.bone, vertices, 0, 2);
            }
            const xs = [], ys = [];
            for (let i = 0; i < vertices.length; i += 2) {
              xs.push(character.x + (vertices[i] * cosine + vertices[i + 1] * sine) * character.scaleX);
              ys.push(character.y + (vertices[i] * sine - vertices[i + 1] * cosine) * character.scaleY);
            }
            const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
            const face = { x: ((left + right) / 2 + cut) / width, y: (top + bottom) / 2 / height, width: (right - left) / width };
            character.visible = false;
            const paint = panel.drawToCanvas(clipWidth, height, 0, 0);
            const { data } = paint.source.getContext('2d').getImageData(0, 0, clipWidth, height);
            let openEdge = 0;
            for (let y = 1; y < height - 1; y++) {
              for (let x = 1; x < clipWidth - 1; x++) {
                if ((x !== 1 && y !== 1 && x !== clipWidth - 2 && y !== height - 2) || data[(y * clipWidth + x) * 4 + 3] >= 250) continue;
                openEdge++;
              }
            }
            paint.destroy();
            character.visible = true;
            poses.push({ face, openEdge });
          }
          const image = panel.drawToCanvas(clipWidth, height, 0, 0);
          results.push({ width, height, cut, clipWidth, transform, poses, image: image.source.toDataURL() });
          image.destroy();
        }
      } finally {
        controller.abort();
        panel.destroy();
      }
      return results;
    }, { id, slotName, layout });
    for (const { width, height, cut, clipWidth, transform, poses } of sample) {
      const caption = `${id} ${width}×${height}, clip ${cut}+${clipWidth}`;
      assert.deepEqual(transform[0], transform[1], `${caption} shared transform`);
      assert.equal(transform[0][3], layout.rotation, `${caption} retains authored rotation`);
      if (cut) {
        const [x, ...unchanged] = sample[0].transform[0];
        assert.ok(Math.abs(transform[0][0] - x + cut) < 1e-6, `${caption} translates the full-size scene`);
        assert.deepEqual(transform[0].slice(1), unchanged, `${caption} preserves the full-size view`);
      }
      for (const { face, openEdge } of poses) {
        assert.ok(openEdge <= 2, `${caption} exposed backdrop edge (${openEdge} pixels)`);
        assert.ok(face.x >= .40 && face.x <= .55 && face.y >= .15 && face.y <= .47 && face.width >= .14,
          `${caption} keeps the face legible (${JSON.stringify(face)})`);
        const faceX = face.x * width - cut, halfFaceWidth = face.width * width / 2;
        assert.ok(faceX >= halfFaceWidth && faceX + halfFaceWidth <= clipWidth, `${caption} fits the face inside the clip`);
      }
    }
    seatFraming.push({ id, title, viewports: sample.map(({ image, ...viewport }) => viewport) });
    await page.evaluate(({ title, sample }) => {
      let gallery = document.getElementById('seat-framing');
      if (!gallery) {
        gallery = document.createElement('div');
        gallery.id = 'seat-framing';
        gallery.style = 'position:absolute;inset:0 auto auto 0;width:1160px;background:#24211e;color:#eee3cc;display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;padding:10px;box-sizing:border-box;font:14px "Microsoft YaHei",sans-serif';
        document.body.append(gallery);
      }
      const entry = document.createElement('div');
      entry.append(title);
      const row = document.createElement('div');
      row.style = 'display:flex;align-items:flex-start;gap:6px;margin:6px 0 12px';
      for (const { image } of sample) {
        const node = document.createElement('img');
        node.src = image;
        node.alt = title;
        row.append(node);
      }
      entry.append(row);
      gallery.append(entry);
    }, { title, sample });
  }
  await page.locator('#seat-framing').screenshot({ path: path.join(output, 'seat-framing.png') });
  await page.locator('#seat-framing').evaluate(node => node.remove());
  await writeFile(path.join(output, 'seat-framing.json'), JSON.stringify(seatFraming, null, 2) + '\n');
  await page.evaluate(base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    window.weiYanArchive = MobileMotionCheck.openMobileZip(window, bytes.buffer);
    window.weiYanBytes = bytes.buffer;
  }, weiYan);
  const forms = [
    { form: '', duration: 13.333333, scale: .66, offsetX: -98.553, offsetY: -195.985, rotation: 0 },
    { form: '#1', duration: 8, scale: .66, offsetX: 31.227, offsetY: -243.908, rotation: 28 },
    { form: '#2', duration: 10, scale: .66, offsetX: 138.056, offsetY: -214.952, rotation: 0 },
  ];
  const weiYanForms = [];
  for (const [index, layout] of forms.entries()) {
    const sample = await page.evaluate(async layout => {
      const controller = new AbortController();
      const motion = await MobileMotionCheck.createMobileMotion(window, weiYanArchive, controller.signal, layout.form, layout);
      const width = 146, height = 172, splitOffset = 36;
      const parent = new Laya.Sprite();
      parent.pos(10, 10); parent.size(width, height);
      parent.scrollRect = new Laya.Rectangle(0, 0, width, height);
      Laya.stage.addChild(parent);
      parent.addChild(motion.actor);
      window.weiYanSeat = { controller, parent, actor: motion.actor };
      const layers = [motion.actor.getChildAt(0), motion.actor.getChildAt(1)];
      const frame = () => layers.map(layer => ({ x: layer.x, y: layer.y, scale: layer.scaleX, rotation: layer.rotation,
        duration: layer.state.getCurrent(0).animation.duration }));
      motion.fit(0, 0, width, height);
      const full = frame();
      motion.fit(-splitOffset, 0, width, height);
      const split = frame();
      motion.fit(0, 0, width, height);

      const character = layers[1], skeleton = character.skeleton;
      const slot = skeleton.findSlot('r-tou');
      const radians = character.rotation * Math.PI / 180;
      const cosine = Math.cos(radians), sine = Math.sin(radians);
      const track = character.state.getCurrent(0), originalTime = track.trackTime;
      const face = [.0, .2, .4, .6, .8].map(ratio => {
        track.trackTime = originalTime + ratio * track.animation.duration;
        character.state.apply(skeleton);
        skeleton.updateWorldTransform();
        const attachment = slot.getAttachment();
        const vertices = new Float32Array(attachment.worldVerticesLength ?? 8);
        if (attachment instanceof spine.MeshAttachment) attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
        else attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        const points = [];
        for (let i = 0; i < vertices.length; i += 2) {
          const x = vertices[i] * cosine + vertices[i + 1] * sine;
          const y = vertices[i] * sine - vertices[i + 1] * cosine;
          points.push({ x: character.x + character.scaleX * x, y: character.y + character.scaleY * y });
        }
        const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
        const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y));
        return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left };
      });
      track.trackTime = originalTime;
      character.state.apply(skeleton);
      skeleton.updateWorldTransform();
      return { full, split, face };
    }, layout);
    assert.deepEqual(sample.full[0], sample.full[1]);
    assert.ok(Math.abs(sample.full[0].duration - layout.duration) < .0001);
    assert.equal(sample.full[0].rotation, layout.rotation);
    assert.deepEqual(sample.split[0], sample.split[1]);
    assert.equal(sample.full[0].scale, sample.split[0].scale);
    assert.ok(Math.abs(sample.full[0].x - sample.split[0].x - 36) < 1e-6);
    assert.equal(sample.full[0].y, sample.split[0].y);
    for (const face of sample.face) {
      assert.ok(face.x >= 53 && face.x <= 89 && face.y >= 55 && face.y <= 84 && face.width >= 37,
        `the official face of ${layout.form || 'base'} stays in the upper central crop throughout the idle loop (${JSON.stringify(face)})`);
    }
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, `wei-yan-form-${index + 1}.png`), clip: { x: 10, y: 10, width: 146, height: 172 } });
    const released = await page.evaluate(() => {
      const { controller, parent, actor } = weiYanSeat;
      controller.abort();
      const released = actor.destroyed && parent.numChildren === 0;
      parent.destroy();
      return released;
    });
    assert.equal(released, true);
    weiYanForms.push({ form: layout.form, ...sample, released });
  }
  await page.evaluate(layout => {
    const { createYjcmEffectPicker, EFFECT_PICKER_STYLES, CONTROL_STYLES } = MobileMotionCheck;
    const downloads = [];
    const download = async (resource, options) => {
      downloads.push(resource);
      if (options.signal.aborted) throw new Error('cancelled fixture effect request');
      if (resource === 'official-83502_2.zip') return weiYanBytes;
      if (resource === 'audio/effect/effect_dynamicSkin_83502#2.mp3' && options.limit <= 4 * 1024 * 1024) return new ArrayBuffer(10);
      throw new Error('unexpected effect request');
    };
    const entries = ['', '#1', '#2'].map(mobileForm => ({
      source: 'mobile', mobileMotion: 'official-83502_2.zip', mobileForm, mobileMotionLayout: layout, download,
    }));
    let config;
    const picker = createYjcmEffectPicker({ document, window, canBind: true,
      listen: (node, event, fn) => node.addEventListener(event, fn), onChange(value) { config = value; },
    });
    const shell = document.body.appendChild(document.createElement('section'));
    shell.style = 'position:fixed;left:180px;top:16px;z-index:10;width:300px;max-height:100%;overflow:auto;color:#eee3cc;font:calc(14px + var(--sgs-font-offset,0px))/1.45 "Microsoft YaHei",sans-serif';
    const shadow = shell.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CONTROL_STYLES + EFFECT_PICKER_STYLES + '[hidden]{display:none!important}';
    shadow.append(style, picker.root);
    picker.setSkills([{ id: 891, name: '本局技能' }, { id: 892, name: '另一技能' }]);
    picker.show(entries, {});
    picker.setForm(3);
    window.effectFixture = { picker, entries, downloads, shell, getConfig: () => config };
  }, forms[2]);
  assert.deepEqual(await page.evaluate(() => effectFixture.downloads), []);
  const effect = page.locator('.skin-effects');
  await effect.getByText('皮肤动效', { exact: true }).click();
  const preview = effect.getByRole('combobox', { name: '预览动效' });
  await preview.locator('option').first().waitFor({ state: 'attached' });
  assert.deepEqual(await preview.locator('option').allTextContents(), ['入场', '攻击', '特殊演出']);
  await effect.getByText('出杀自动播放攻击', { exact: true }).waitFor();
  const firstBinding = effect.getByRole('combobox', { name: '本局技能', exact: true });
  const secondBinding = effect.getByRole('combobox', { name: '另一技能', exact: true });
  assert.deepEqual(await firstBinding.locator('option').allTextContents(), ['未绑定', '特殊演出']);
  const layout = await page.evaluate(() => {
    const { shell, picker } = effectFixture;
    const nodes = [picker.root, ...picker.root.querySelectorAll('.effect-preview-controls, .effect-bindings, .effect-field')];
    const result = [];
    for (const width of [248, 280, 420]) {
      shell.style.width = width + 'px';
      for (const offset of [0, 2, 4, 6]) {
        shell.style.setProperty('--sgs-font-offset', offset + 'px');
        result.push(nodes.every(node => !node.offsetWidth || node.scrollWidth <= node.clientWidth + 1));
      }
    }
    shell.style.width = '300px';
    shell.style.removeProperty('--sgs-font-offset');
    return result;
  });
  assert.ok(layout.every(Boolean), 'preview and binding controls stay within all tested widths and text sizes');
  await firstBinding.selectOption('mobile:special');
  await secondBinding.selectOption('mobile:special');
  await effect.getByText('已绑定 2 项', { exact: true }).waitFor();
  assert.equal(await firstBinding.inputValue(), 'mobile:special');
  const effectBinding = await page.evaluate(() => MobileMotionCheck.normalizeYjcmEffectBindings(effectFixture.getConfig(), 3));
  assert.deepEqual(effectBinding, { 3: { 891: 'mobile:special', 892: 'mobile:special' } });
  await preview.selectOption('mobile:attack');
  await effect.getByRole('button', { name: '播放动效' }).click();
  await effect.locator('canvas[data-playing]').waitFor();
  await page.waitForTimeout(430);
  await page.screenshot({ path: path.join(output, 'wei-yan-effect-preview.png'), clip: { x: 175, y: 11, width: 315, height: 339 } });
  await effect.getByRole('button', { name: '停止预览' }).click();
  await effect.locator('canvas[data-playing]').waitFor({ state: 'detached' });
  const mountedEffects = await page.evaluate(async () => {
    const { loadMobileMotion, resolveYjcmEffect } = MobileMotionCheck;
    const { entries, downloads, getConfig, picker, shell } = effectFixture;
    const controller = new AbortController();
    const motion = await loadMobileMotion(window, entries[2], controller.signal);
    motion.fit(0, 0, 146, 172);
    Laya.stage.addChild(motion.actor);
    const character = motion.actor.getChildAt(1);
    const background = motion.actor.getChildAt(0);
    const name = actor => actor.state.getCurrent(0).animation.name;
    const attack = resolveYjcmEffect(motion.effects, 1, '', {}).plan;
    const skill = resolveYjcmEffect(motion.effects, 891, '本局技能', getConfig(), 3).plan;
    const playedAudio = [], originalAudio = window.Audio;
    let natural;
    let completed;
    try {
      window.Audio = class extends EventTarget {
        play() { playedAudio.push([this.src.startsWith('blob:'), this.volume]); return Promise.resolve(); }
        pause() {}
      };
      completed = await new Promise(resolve => {
        if (!motion.playEffect(attack, { kind: 'attack', volume: () => .4, onFinish: resolve })) return resolve(false);
        natural = [name(character), name(background)];
      });
    } finally { window.Audio = originalAudio; }
    const ended = [name(character), name(background)];
    motion.playEffect(attack, { kind: 'attack' });
    motion.playEffect(skill, { kind: 'skill' });
    const bound = [name(character), name(background)];
    motion.stopEffect();
    const idle = [name(character), name(background)];
    controller.abort();
    picker.stop();
    shell.remove();
    return { natural, ended, completed, playedAudio, bound, idle, released: motion.actor.destroyed, downloads };
  });
  assert.deepEqual(mountedEffects, { natural: ['GongJi', 'BeiJing'], ended: ['DaiJi', 'BeiJing'], completed: true,
    playedAudio: [[true, .4]], bound: ['TeShu', 'TeShu'], idle: ['DaiJi', 'BeiJing'], released: true,
    downloads: ['official-83502_2.zip', 'audio/effect/effect_dynamicSkin_83502#2.mp3'] });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ states, weiYanForms, effectBinding, mountedEffects, disposed, errors }, null, 2));
  console.log('OL Laya mobile motion passed framing, required atlas checks, and official mobile effect preview, binding, playback and cleanup.');
} finally {
  await browser.close();
}
