import { DEATH_VOICE } from './cross-voice.js';

const runtime = 'https://web.sanguosha.com/x/pc/res/assets/runtime/';
const base = runtime + 'general/';
const directories = ['seat/static', 'big/static', 'maxBig'];
const imageLimit = 12 * 1024 * 1024;
const headLimit = 256 * 1024;
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const generalPrefixOrder = ['武', '威', '谋', '乐', '神', '星', 'sp', '食', '烈', '忍', '爻'];

function generalFilterRank(general, alias) {
  // The official catalogue includes 神 directly in the base name.
  const prefix = alias ? normalize(general.slice(0, -alias.length)) : /^神/.exec(general)?.[0];
  if (!prefix) return generalPrefixOrder.length + 1;
  const rank = generalPrefixOrder.indexOf(prefix);
  return rank < 0 ? generalPrefixOrder.length : rank;
}

export const yjcmVoiceReference = (entry, id) => entry.id + ':' + id + ':' + entry.general;

export function createYjcmIndex({ skins, generals, alternateSkinAssets, voiceFiles, voiceNames, voiceSkins, dynamicSkins = {}, motion = {}, effects = {} }) {
  if (!skins?.length || !generals?.length || !voiceFiles?.length || !voiceNames?.length || !voiceSkins || !alternateSkinAssets) {
    throw new Error('皮肤索引数据不完整');
  }
  const skinsById = new Map(skins.map(row => [row[0], row]));
  const staticIds = new Map(Object.entries(dynamicSkins).map(([still, dynamic]) => [dynamic, Number(still)]));
  const displayId = id => staticIds.get(id) ?? id;
  const generalsByName = new Map(generals.map(row => [row[0], row]));
  const listedEntries = new Map();
  let catalogue;

  function jieVariant(general) {
    const row = generalsByName.get('界' + general);
    // A prefixed row without a base-name alias can be an unresolved placeholder.
    if (row?.[1]) return row;
  }

  function standardGeneral(general) {
    if (typeof general !== 'string' || !general.startsWith('界')) return general;
    const name = general.slice(1);
    return jieVariant(name) && generalsByName.has(name) ? name : general;
  }

  function listedEntry(id, general, alias, variant) {
    const key = `${general}:${id}`;
    let entry = listedEntries.get(key);
    if (!entry) {
      const [, name, assets, head] = skinsById.get(id);
      entry = { id, general, name, assets, head, dynamicId: dynamicSkins[id], motion: motion[id]?.[0], effects: effects[id]?.[0],
        search: normalize([general, alias, variant?.[0]].join(' ')) };
      listedEntries.set(key, entry);
    }
    return entry;
  }

  function searchIndex() {
    if (catalogue) return catalogue;
    catalogue = generals.flatMap(([general, alias, ids]) => {
      if (general.startsWith('界') || general.includes('体验') || alias.includes('体验')) return [];
      const variant = jieVariant(general);
      const skinIds = [...new Set([...ids, ...(variant?.[2] ?? [])].map(displayId))].sort((a, b) => a - b);
      return skinIds.filter(id => !skinsById.get(id)[1].includes('体验'))
        .map(id => listedEntry(id, general, alias, variant));
    });
    return catalogue;
  }

  function findYjcmSkin(id, general) {
    id = displayId(id);
    const standard = standardGeneral(general);
    const row = skinsById.get(id);
    if (!row) return;
    const [, name, assets, head] = row;
    const standardRow = generalsByName.get(standard);
    const variant = standardRow && jieVariant(standard);
    const owns = ids => ids?.some(candidate => displayId(candidate) === id);
    if (standardRow && !standard.startsWith('界') && !standard.includes('体验') &&
        !standardRow[1].includes('体验') && !name.includes('体验') &&
        (owns(standardRow[2]) || owns(variant?.[2]))) {
      return listedEntry(id, standard, standardRow[1], variant);
    }
    // Previously saved selections can still refer to entries hidden from search.
    if (owns(generalsByName.get(general)?.[2])) return { id, general, name, assets, head,
      dynamicId: dynamicSkins[id], motion: motion[id]?.[0], effects: effects[id]?.[0] };
  }

  function yjcmSkinForms(entry) {
    const assets = alternateSkinAssets[entry.id] ?? alternateSkinAssets[entry.dynamicId];
    return assets ? [entry, { ...entry, assets, motion: motion[entry.id]?.[1], effects: effects[entry.id]?.[1] }] : [entry];
  }

  function voiceRows(entry, skin = entry.id) {
    const groups = voiceSkins[skin] ?? [];
    const standard = standardGeneral(entry.general);
    const variant = jieVariant(standard)?.[0];
    return [standard, variant].flatMap(name => groups.filter(([owner]) => owner === name).flatMap(([, rows]) => rows));
  }

  function yjcmSkinVoices(entry, form, skin = entry.id) {
    const voices = new Map();
    let rows = voiceRows(entry, skin);
    if (!rows.length && skin === entry.id && entry.dynamicId) rows = voiceRows(entry, entry.dynamicId);
    for (const [id, name, baseClips, alternateClips] of rows) {
      if (!voices.has(name)) voices.set(name, { id, name: voiceNames[name], urls: [], aliases: [] });
      const voice = voices.get(name);
      if (voice.id !== id && !voice.aliases.includes(id)) voice.aliases.push(id);
      const clips = alternateClips === undefined ? baseClips :
        form === 1 ? baseClips : form === 2 ? alternateClips : [...baseClips, ...alternateClips];
      for (const clip of clips) {
        const url = runtime + 'voice/skin/' + voiceFiles[clip];
        if (!voice.urls.includes(url)) voice.urls.push(url);
      }
    }
    return [...voices.values()].sort((a, b) => Number(a.id === DEATH_VOICE) - Number(b.id === DEATH_VOICE));
  }

  function yjcmSkillVoices(entry) {
    return yjcmSkinVoices(entry).filter(voice => voice.id !== DEATH_VOICE);
  }

  function findYjcmVoice(reference, form) {
    const match = /^([1-9]\d*):(-1|[1-9]\d*):(.+)$/.exec(reference);
    if (!match) return;
    const [, skin, skill, general] = match;
    const entry = findYjcmSkin(Number(skin), general);
    if (!entry) return;
    const id = Number(skill);
    const voice = yjcmSkinVoices(entry, form, Number(skin)).find(item => item.id === id || item.aliases.includes(id));
    if (voice) return { ...voice, entry };
  }

  function hasYjcmVoices(entry) {
    return voiceRows(entry).length > 0 || Boolean(entry.dynamicId && voiceRows(entry, entry.dynamicId).length);
  }

  function withVoicesFirst(entries) {
    const withVoice = [], withoutVoice = [];
    for (const entry of entries) (hasYjcmVoices(entry) ? withVoice : withoutVoice).push(entry);
    return withVoice.concat(withoutVoice);
  }

  function searchYjcmSkins(query) {
    const phrase = normalize(query);
    const categories = new Map();
    if (!phrase) return { all: [], categories };
    const words = phrase.split(/\s+/), exact = new Map(), partial = new Map(), byGeneral = new Map();
    for (const entry of searchIndex()) {
      if (!words.every(word => entry.search.includes(word))) continue;
      const results = words.includes(normalize(entry.general)) ? exact : partial;
      if (!results.has(entry.id)) results.set(entry.id, entry);
      if (!byGeneral.has(entry.general)) byGeneral.set(entry.general, new Map());
      byGeneral.get(entry.general).set(entry.id, entry);
    }
    const previouslyShown = [...exact.values(), ...[...partial.values()].filter(entry => !exact.has(entry.id))];
    const generals = [...byGeneral.keys()].reverse().sort((a, b) =>
      generalFilterRank(a, generalsByName.get(a)[1]) - generalFilterRank(b, generalsByName.get(b)[1]));
    for (const general of generals) categories.set(general, withVoicesFirst([...byGeneral.get(general).values()].reverse()));
    return { all: withVoicesFirst(previouslyShown.reverse()), categories };
  }

  return { findYjcmSkin, findYjcmVoice, hasYjcmVoices, searchYjcmSkins, yjcmSkillVoices, yjcmSkinVoices, yjcmSkinForms };
}

async function fetchPng(win, url, signal, limit, priority = 'auto') {
  const response = await win.fetch(url, { credentials: 'omit', redirect: 'error', signal, priority });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('图片超过大小限制');
  const blob = await response.blob();
  if (!blob.size || blob.size > limit || blob.type !== 'image/png') throw new Error('官方地址未返回可用的 PNG');
  return blob;
}

export function loadYjcmHead(win, stem, signal) {
  return fetchPng(win, base + 'head/' + stem + '.png', signal, headLimit);
}

export async function readYjcmImage(win, url, signal, inspect, priority) {
  if (signal.aborted) return;
  const controller = new win.AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = win.setTimeout(abort, 8000);
  let objectUrl;
  try {
    const blob = await fetchPng(win, url, controller.signal, imageLimit, priority);
    if (signal.aborted) return;
    objectUrl = win.URL.createObjectURL(blob);
    const image = new win.Image();
    image.src = objectUrl;
    await image.decode();
    if (signal.aborted) return;
    if (controller.signal.aborted) throw new Error('请求超时');
    if (Math.max(image.naturalWidth, image.naturalHeight) > 4096) throw new Error('图片长边超过 4096 像素');
    return inspect(image, blob);
  } catch (error) {
    if (!signal.aborted) throw controller.signal.aborted ? new Error('请求超时') : error;
  } finally {
    if (objectUrl) win.URL.revokeObjectURL(objectUrl);
    win.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export async function loadYjcmWindow(win, entry, signal) {
  // The native tooltip uses the static skin resource, also used for the
  // seat and big images. Linked skins can have an unrelated catalogue ID.
  const asset = entry.assets.find(([kind]) => kind === 0 || kind === 1);
  if (asset) return readYjcmImage(win, base + 'window/' + asset[1] + '.png', signal, image => image);
}

export async function loadYjcmPreview(win, entry, signal) {
  const windowArt = await loadYjcmWindow(win, entry, signal).catch(() => undefined);
  if (windowArt || signal.aborted) return windowArt;
  for (const [kind, stem] of [...entry.assets].sort(([a], [b]) => Number(a === 0) - Number(b === 0))) {
    const image = await readYjcmImage(win, base + directories[kind] + '/' + stem + '.png', signal, image => image)
      .catch(() => undefined);
    if (image || signal.aborted) return image;
  }
}

function portraitPixels(document, image, maxSize) {
  const { naturalWidth, naturalHeight } = image;
  const scale = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  const width = canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  const height = canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function seatPortraitPanel({ width, height, data }) {
  const heights = new Uint16Array(width + 1);
  let best, bestArea = 0;

  // The seat PNG includes an overhang for the headdress. The game paints
  // that above its card face, where the PNG is deliberately transparent.
  // Find the painted rectangular panel to fit inside the OL avatar.
  for (let y = 0; y < height; y++) {
    const stack = [];
    for (let x = 0; x <= width; x++) {
      if (x < width) heights[x] = data[(y * width + x) * 4 + 3] >= 250 ? heights[x] + 1 : 0;
      while (stack.length && heights[stack.at(-1)] > heights[x]) {
        const panelHeight = heights[stack.pop()];
        const left = stack.length ? stack.at(-1) + 1 : 0;
        const panelWidth = x - left;
        const area = panelWidth * panelHeight;
        if (panelWidth >= width * .6 && panelHeight >= height * .6 && area > bestArea) {
          best = { left, top: y + 1 - panelHeight, right: x, bottom: y + 1 };
          bestArea = area;
        }
      }
      stack.push(x);
    }
  }
  if (!best) return null;
  const panelWidth = best.right - best.left;
  let top = 0;
  for (; top < best.top; top++) {
    let occupied = 0;
    for (let x = best.left; x < best.right; x++) {
      if (data[(top * width + x) * 4 + 3] >= 128) occupied++;
    }
    if (occupied >= panelWidth * .06) break;
  }
  const overhang = best.top - top;
  return { x: best.left, y: best.top, width: panelWidth, height: best.bottom - best.top,
    overhang: overhang >= height * .02 && overhang <= height * .18 ? overhang : 0 };
}

function sourceBounds(image, sample, { x, y, width, height }) {
  const scaleX = image.naturalWidth / sample.width, scaleY = image.naturalHeight / sample.height;
  const left = Math.ceil(x * scaleX), top = Math.ceil(y * scaleY);
  return { x: left, y: top, width: Math.floor((x + width) * scaleX) - left,
    height: Math.floor((y + height) * scaleY) - top };
}

function matchSeatCrop(seat, panel, original) {
  const samples = [];
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 5; column++) {
      const u = (column + .5) / 5, v = (row + .5) / 6;
      const i = (Math.floor(panel.y + v * panel.height) * seat.width + Math.floor(panel.x + u * panel.width)) * 4;
      samples.push({ u, v, red: seat.data[i], green: seat.data[i + 1], blue: seat.data[i + 2] });
    }
  }
  const ratio = panel.height / panel.width;
  const overhang = panel.overhang / panel.width;
  const maxWidth = Math.min(original.width, original.height / (ratio + overhang));
  let best, lowestError = Infinity;
  function compare(x, y, width) {
    const height = width * ratio;
    if (x < 0 || x + width > original.width || y < width * overhang || y + height > original.height) return;
    let error = 0;
    for (const { u, v, red, green, blue } of samples) {
      const i = (Math.floor(y + v * height) * original.width + Math.floor(x + u * width)) * 4;
      const data = original.data;
      if (data[i + 3] < 250) return;
      error += Math.abs(data[i] - red) + Math.abs(data[i + 1] - green) + Math.abs(data[i + 2] - blue);
      if (error >= lowestError) return;
    }
    best = { x, y, width, height };
    lowestError = error;
  }
  // The seat asset is a scaled crop of the full illustration. Match its
  // painted panel first, then extend that same crop upward into the original.
  for (let width = 16; width <= maxWidth; width += 2) {
    for (let y = Math.ceil(width * overhang); y + width * ratio <= original.height; y += 2) {
      for (let x = 0; x + width <= original.width; x += 2) compare(x, y, width);
    }
  }
  if (!best) return null;
  const candidate = best;
  for (let width = candidate.width - 2; width <= candidate.width + 2; width += .5) {
    for (let y = candidate.y - 2; y <= candidate.y + 2; y += .5) {
      for (let x = candidate.x - 2; x <= candidate.x + 2; x += .5) compare(x, y, width);
    }
  }
  if (lowestError > samples.length * 3 * 23) return null;
  const header = best.width * overhang;
  return { ...best, y: best.y - header, height: best.height + header };
}

export async function loadYjcmPortrait(win, entry, signal) {
  const failures = [];
  let seat, fallback;
  const assets = [...entry.assets].sort(([a], [b]) => Number(b === 0) - Number(a === 0));
  const first = assets[0];
  const paired = first?.[0] === 0 ? assets.find(([kind, stem]) => kind !== 0 && stem === first[1]) : null;
  const urlFor = ([kind, stem]) => base + directories[kind] + '/' + stem + '.png';
  const read = (asset, readSignal, priority) => readYjcmImage(win, urlFor(asset), readSignal,
    (image, blob) => ({ image, blob }), priority);
  let prefetch;
  const controller = paired ? new win.AbortController() : null;
  const cancel = () => controller?.abort();
  if (paired) signal.addEventListener('abort', cancel, { once: true });
  try {
    for (const asset of assets) {
      if (signal.aborted) return;
      const [kind, stem] = asset;
      if (seat && (kind === 0 || stem !== seat.stem)) continue;
      try {
        const loading = asset === paired ? prefetch : read(asset, signal);
        // The seat crop and its matching full illustration can be downloaded together.
        if (asset === first && paired) {
          prefetch = read(paired, controller.signal, 'low').then(art => ({ art }), error => ({ error }));
        }
        let artwork = await loading;
        if (asset === paired) {
          if (artwork.error) throw artwork.error;
          artwork = artwork.art;
        }
        if (!artwork || signal.aborted) return;
        const { image, blob } = artwork;
        if (kind === 0) {
          const pixels = portraitPixels(win.document, image, 512);
          const panel = seatPortraitPanel(pixels);
          if (!panel) throw new Error('局内头像没有可完整显示的卡面');
          const cropped = { image, blob, seatBounds: sourceBounds(image, pixels, panel) };
          if (!panel.overhang || !assets.some(([type, name]) => type !== 0 && name === stem)) return cropped;
          seat = { stem, pixels, panel, artwork: cropped };
          continue;
        }
        if (!seat) return artwork;
        const pixels = portraitPixels(win.document, image, 128);
        const crop = matchSeatCrop(seat.pixels, seat.panel, pixels);
        if (crop) return { image, blob, seatBounds: sourceBounds(image, pixels, crop) };
        fallback ??= artwork;
      } catch (error) {
        failures.push(urlFor(asset) + ' · ' + error.message);
      }
    }
  } finally {
    if (paired) signal.removeEventListener('abort', cancel);
    cancel();
  }
  if (signal.aborted) return;
  if (fallback || seat) return fallback ?? seat.artwork;
  throw new Error('这款皮肤的官方图片暂时无法加载。\n' + failures.join('\n'));
}
