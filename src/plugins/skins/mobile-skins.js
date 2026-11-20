import { DEATH_VOICE } from './cross-voice.js';
import { generalPrefixRank, readSkinImage } from './yjcm.js';
import { createMobileCloud } from './mobile-cloud.js';
import { createMobileConfig } from './mobile-config.js';
import { mobileCatalogueVoices, mobileVoiceId } from './mobile-catalogue-voices.js';
import { formLabel } from './form-label.js';
import { mobileGeneralName, mobileOwner, mobileSkinName, mobileSearchName } from './mobile-skin-names.js';
import { isMobileCardVoiceName } from './mobile-voice.js';

const catalogueRoot = 'https://share.sanguosha.cn/api/skins/';
const mediaOrigin = 'https://sjwx-oss.sanguosha.cn';
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
const voiceReference = /^((?:cloud-(?:\d+(?:#\d+)?|char-[1-9]\d{0,11})|[1-9]\d*)):(-1|[1-9]\d*):(.+)$/;
const mobilePrefixOrder = ['魔', '势', '谋', '星', 'sp', '界'];

function sortMobileCategories(categories) {
  const rank = general => {
    const prefix = /^(?:[魔势谋星界标神友]|sp|[^·・]+(?=[·・]))/.exec(normalize(general))?.[0];
    return generalPrefixRank(prefix === '标' ? '' : prefix, mobilePrefixOrder);
  };
  return new Map([...categories].sort(([left], [right]) => rank(left) - rank(right)));
}

function mediaUrl(value, extension) {
  if (typeof value !== 'string') return;
  const url = parseUrl(value);
  if (url?.origin === mediaOrigin && !url.username && !url.password && !url.search && !url.hash &&
      /^\/skins\/[a-z]+\/[\w-]+\.[a-z0-9]+$/i.test(url.pathname) && extension.test(url.pathname)) return url.href;
}

function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}

const imageUrl = value => mediaUrl(value, /\.(?:jpe?g|png|webp)$/i);
const audioUrl = value => mediaUrl(value, /\.(?:wav|mp3|ogg)$/i);
const videoUrl = value => mediaUrl(value, /\.mp4$/i);

async function loadJson(win, path, signal) {
  const controller = new win.AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) throw new Error('皮肤索引读取已取消');
  signal.addEventListener('abort', abort, { once: true });
  const timeout = win.setTimeout(abort, 8000);
  try {
    const response = await win.fetch(catalogueRoot + path, { credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`移动版皮肤读取失败（HTTP ${response.status}）`);
    const { code, data } = await response.json();
    if (code !== 0 || !data) throw new Error('移动版皮肤数据暂不可用');
    return data;
  } finally {
    win.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

function readVoices(parts) {
  if (!parts || typeof parts !== 'object') return [];
  return Object.entries(parts).flatMap(([name, clips]) => {
    if (!name.trim() || !Array.isArray(clips)) return [];
    const death = /阵亡|死亡/.test(name);
    const chosen = death && /胜利/.test(name) ? clips.slice(-1) : clips;
    const urls = [...new Set(chosen.map(clip => audioUrl(clip?.files)).filter(Boolean))];
    return urls.length ? [{ id: death ? DEATH_VOICE : mobileVoiceId(name), name: death ? '阵亡' : name, urls,
      kind: isMobileCardVoiceName(name) ? 'card' : undefined }] : [];
  });
}

function createIndex(rows, win, signal) {
  const entries = new Map(), requests = new Map();
  for (const row of rows) {
    const { id, general, name } = row ?? {};
    const art = imageUrl(row?.inner_banner);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof name !== 'string' || !name.trim() ||
        typeof general !== 'string' || !general.trim() || !art) continue;
    entries.set(id, { id, general: general.trim(), name: name.trim(), head: imageUrl(row.banner_img_thumb),
      source: 'mobile', assets: [art], art, isDynamic: /动皮|动态/.test(row.label ?? '') });
  }
  if (!entries.size) throw new Error('移动版皮肤目录没有可用条目');

  function findSkin(id, general) {
    const entry = entries.get(id);
    if (entry?.general === general) return entry;
  }
  function searchSkins(query) {
    const categories = new Map(), all = [];
    const phrase = normalize(query);
    if (!phrase) return { all, categories };
    const base = phrase.replace(/^界[·・\s]?/, '');
    for (const entry of entries.values()) {
      const general = normalize(entry.general);
      if (!general.includes(phrase) && (!base || !general.includes(base))) continue;
      all.push(entry);
      if (!categories.has(entry.general)) categories.set(entry.general, []);
      categories.get(entry.general).push(entry);
    }
    return { all, categories: sortMobileCategories(categories) };
  }
  function detail(entry) {
    if (entry.details) return Promise.resolve(entry);
    if (!requests.has(entry.id)) requests.set(entry.id, loadJson(win, entry.id + '/detail', signal).then(({ info }) => {
      if (!info || (info.id !== undefined && info.id !== entry.id)) throw new Error('移动版皮肤详情无效');
      entry.details = { portrait: imageUrl(info.avatar), voices: readVoices(info.parts),
        video: videoUrl(info.inner_win_video) ?? videoUrl(info.action1) };
      return entry;
    }).finally(() => requests.delete(entry.id)));
    return requests.get(entry.id);
  }
  function skinVoices(entry) { return entry.details?.voices ?? []; }
  function prepare(entry, bindings) {
    const sources = new Set([entry]);
    for (const refs of Object.values(bindings ?? {})) {
      if (!Array.isArray(refs)) continue;
      for (const reference of refs) {
        const match = typeof reference === 'string' && voiceReference.exec(reference);
        const source = match && findSkin(Number(match[1]), match[3]);
        if (source) sources.add(source);
      }
    }
    const requested = [...sources].filter(source => !source.details).map(detail);
    if (requested.length) return Promise.allSettled(requested);
  }
  function findVoice(reference) {
    const match = voiceReference.exec(reference);
    const entry = match && findSkin(Number(match[1]), match[3]);
    const voice = entry && skinVoices(entry).find(item => item.id === Number(match[2]));
    if (voice) return { ...voice, entry };
  }
  return { findSkin, searchSkins, skinVoices, findVoice, detail, prepare,
    skinForms: entry => [entry], hasVoices: entry => Boolean(skinVoices(entry).length) };
}

function createGalleryCatalogue(win, scope) {
  let current, pending;
  async function readPage(type, page) {
    const { lists } = await loadJson(win, `list?page=${page}&type=${type}&limit=100`, scope.signal);
    if (!Array.isArray(lists?.data) || !Number.isSafeInteger(lists.last_page) || lists.last_page > 40) {
      throw new Error('移动版皮肤目录格式无效');
    }
    return lists;
  }
  async function readCategory(type) {
    const first = await readPage(type, 1);
    const rows = [...first.data];
    for (let page = 2; page <= first.last_page; page++) rows.push(...(await readPage(type, page)).data);
    return rows;
  }
  return {
    get current() { return current; },
    load() {
      if (scope.signal.aborted) return Promise.reject(new Error('皮肤索引读取已取消'));
      if (current) return Promise.resolve(current);
      pending ??= Promise.all([1, 2, 3].map(readCategory)).then(rows => {
        if (scope.signal.aborted) throw new Error('皮肤索引读取已取消');
        return current = createIndex(rows.flat(), win, scope.signal);
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}

const headLimit = 2 * 1024 * 1024, artworkLimit = 12 * 1024 * 1024, voiceLimit = 4 * 1024 * 1024;
const skinId = id => 'cloud-' + id;
const zhouYuFormNames = { 91401: '初始形态', '91401#1': '火形态', '91401#2': '水形态' };
// Match the native selectors by resource ID, even if a cloud snapshot omits a form.
const limitedChoice = [['', '#1'], ['', '#2']];
const limitedUse = [['', '#1']];
const zhenfeng = [...limitedChoice, ['', '#3'], ['', '#4']];
const mobileTransitions = {
  5413: [['', '#2'], ['#1', '#3']],
  17306: limitedUse, 22002: limitedUse, 30011: limitedUse, 55204: limitedUse,
  78301: limitedUse, 78302: limitedUse, 80601: limitedUse, 80602: limitedUse,
  81701: zhenfeng, 81702: zhenfeng,
  83501: limitedChoice, 83502: limitedChoice, 89001: limitedUse, 91401: limitedChoice,
};
function compareSkinId(left, right) {
  const [a, aForm = 0] = left.split('#'), [b, bForm = 0] = right.split('#');
  return Number(b) - Number(a) || Number(aForm) - Number(bForm);
}

function pickMotion(row, config) {
  const version = config?.motion?.version;
  return row?.motions.find(path => path.endsWith(`_${version}.zip`)) ?? row?.motions[row.motions.length - 1];
}

function mobileSkinRows(skins) {
  const rows = new Map(skins);
  const base = rows.get('91401'), fire = rows.get('91401#1');
  if (base && !rows.has('91401#2') && fire?.portrait) {
    rows.set('91401#1', { ...fire, sharedZhouYuVoices: true });
    // Share the fire artwork while resolving water motion and skill voices by form.
    rows.set('91401#2', { ...fire, id: '91401#2', motions: [], voices: new Map(), sharedZhouYuVoices: true });
  }
  return [...rows.values()].sort((a, b) => compareSkinId(a.id, b.id));
}

function matchingCharacterArt(index, skinRows, official) {
  const matches = new Map();
  for (const row of skinRows) {
    const config = official?.skins.get(row.id);
    if (!config?.classic || row.id.includes('#') || !row.portrait) continue;
    const character = index.characters.get(String(config.generalId));
    if (character?.portrait && index.resources.get(row.portrait).md5 === index.resources.get(character.portrait).md5) {
      matches.set(row.id, character);
    }
  }
  return matches;
}

function createCloudCatalogue(index, download, legacy, { data: official, status: configStatus }) {
  const entries = new Map(), families = new Map();
  const skins = mobileSkinRows(index.skins);
  const multiFormSkins = new Set(skins.filter(row => row.id.includes('#')).map(row => row.id.split('#')[0]));
  const matchingArt = matchingCharacterArt(index, skins, official);
  const duplicates = new Set([...matchingArt.values()].map(row => Number(row.id)));
  const originals = [...index.characters.values()]
    .filter(row => row.portrait || row.standing || row.previews.length || row.landscapes.length)
    .sort((a, b) => compareSkinId(a.id, b.id))
    .map(row => ({ ...row, id: `char-${row.id}`, characterId: Number(row.id) }));
  const originalName = id => official?.generals.get(id) ?? mobileGeneralName(id);
  const provisional = id => official?.provisionalGenerals?.has(id);
  const currentNames = new Set(originals.filter(row => !provisional(row.characterId))
    .map(row => originalName(row.characterId)));
  for (const row of [...skins, ...originals]) {
    const characterId = row.characterId;
    const [base, form] = row.id.split('#');
    const original = form ? index.skins.get(base) : undefined;
    const portrait = row.portrait ?? original?.portrait;
    const characterArt = matchingArt.get(row.id);
    const art = row.previews[0] ?? row.landscapes[0] ?? characterArt?.previews[0] ?? characterArt?.landscapes[0] ??
      row.standing ?? characterArt?.standing ?? portrait ?? original?.previews[0] ?? row.head;
    const baseConfig = official?.skins.get(base);
    const exactConfig = official?.skins.get(row.id);
    const config = exactConfig ?? baseConfig;
    // A classic base can be static even when its published ZIP contains alternate rigs.
    const staticBase = !form && exactConfig?.classic && !exactConfig.motion && multiFormSkins.has(base);
    const ownMotion = staticBase ? undefined : pickMotion(row, exactConfig);
    // Use the family ZIP as a candidate. The loader checks its exact form before decoding.
    const sharedMotion = ownMotion ? undefined : pickMotion(original, baseConfig);
    const mobileMotion = ownMotion ?? sharedMotion;
    const mobileForm = sharedMotion ? '#' + form : '';
    if (!art && !mobileMotion) continue;
    const general = characterId ? originalName(characterId)
      : config?.general || mobileOwner(base);
    if (characterId && !general) continue;
    const name = characterId ? '经典形象' : config?.title || mobileSkinName(base);
    const formName = zhouYuFormNames[row.id] ?? (form ? config?.formName || formLabel(Number(form) + 1) : '');
    const title = name ? name + (form ? ` · ${formName}` : '') : `皮肤 ${row.id}`;
    const ownerAliases = config?.generalIds.map(id => official.generals.get(id)) ?? [];
    const head = row.head ?? original?.head ?? characterArt?.head ?? portrait ?? art;
    const urls = [art, portrait].filter(Boolean).map(path => index.resources.get(path).url);
    const loadVoice = (path, signal) => download(path, { signal, limit: voiceLimit });
    const voices = mobileCatalogueVoices(row, original, official, index.resources).map(voice => ({ ...voice, load: loadVoice }));
    const id = skinId(row.id);
    const classic = Boolean(characterId || (!form && config?.classic));
    const entry = { id, number: row.id, name: title, formName, general: general || '未标注武将', head, art, portrait,
      source: 'mobile', assets: urls.length ? urls : [index.resources.get(mobileMotion).url],
      nativePortrait: Boolean(portrait), download, mobileMotion, mobileForm, mobileMotionLayout: exactConfig?.motion,
      details: { voices }, searchable: normalize([general, mobileSearchName(general), ...ownerAliases,
        ...ownerAliases.map(mobileSearchName), name, config?.officialTitle, formName, row.id,
        classic ? '经典形象 原皮 原画' : ''].join(' ')),
      classic };
    entries.set(id, entry);
    // Some alternate figures share a published character's name and are still
    // marked "coming soon". Keep the stable lookup while favoring current art.
    if (characterId && (duplicates.has(characterId) ||
        (provisional(characterId) && currentNames.has(general)))) continue;
    if (!families.has(base)) families.set(base, []);
    families.get(base).push(entry);
  }
  function findSkin(id, name) {
    return entries.get(id) ?? legacy.current?.findSkin(Number(id), name);
  }
  function searchSkins(query) {
    const phrase = normalize(query);
    const equivalent = normalize(mobileSearchName(phrase));
    const all = [...families.values()].filter(forms => !phrase || forms.some(entry => entry.searchable.includes(phrase) ||
      (equivalent && equivalent !== phrase && entry.searchable.includes(equivalent)))).map(forms => forms[0]);
    const isRequestedOriginal = entry => entry.classic && normalize(mobileSearchName(entry.general)) === equivalent;
    if (phrase) all.sort((a, b) => Number(isRequestedOriginal(b)) - Number(isRequestedOriginal(a)));
    const categories = new Map();
    if (phrase) for (const entry of all) {
      if (!categories.has(entry.general)) categories.set(entry.general, []);
      categories.get(entry.general).push(entry);
    }
    return { all, categories: sortMobileCategories(categories) };
  }
  function skinForms(entry) { return entry.number ? families.get(entry.number.split('#')[0]) ?? [entry] : [entry]; }
  function skinTransitions(entry) {
    const base = entry.number?.split('#')[0];
    const transitions = mobileTransitions[base];
    if (!transitions) return [];
    const positions = new Map(skinForms(entry).map((form, index) => [form.number, index + 1]));
    // An incomplete family can shift the displayed ordinals and repoint stored rules.
    if (transitions.some(edge => edge.some(form => positions.get(base + form) !== Number(form.slice(1)) + 1))) return [];
    return transitions.map(([source, destination]) => ({ from: positions.get(base + source), to: positions.get(base + destination) }));
  }
  function skinVoices(entry, form) { return (skinForms(entry)[form - 1] ?? entry).details?.voices ?? []; }
  function findVoice(reference) {
    const match = typeof reference === 'string' && voiceReference.exec(reference);
    if (!match) return;
    const entry = findSkin(match[1], match[3]);
    const id = match && Number(match[2]);
    const voice = entry && skinVoices(entry).find(item => item.id === id || item.aliases?.includes(id));
    if (voice) return { ...voice, entry };
  }
  return { version: index.version, configStatus, findSkin, searchSkins, skinVoices, findVoice,
    prepare: (entry, bindings) => entry.download ? undefined : legacy.current?.prepare(entry, bindings),
    skinForms, skinTransitions, hasVoices: entry => skinForms(entry).some(form => skinVoices(form).length),
  };
}

export function createMobileCatalogue({ window: win, scope, game }) {
  const legacy = createGalleryCatalogue(win, scope);
  const download = (url, options) => {
    if (!game.downloadMobileSkinAsset) throw new Error('需要更新工具箱核心后读取移动版云资源。');
    return game.downloadMobileSkinAsset(url, options);
  };
  const cloud = createMobileCloud(win, download);
  const config = game.supportsMobileSkinConfig === true ? createMobileConfig(win, download, {
    signal: scope.signal, readCache: cloud.readConfigCache, writeCache: cloud.writeConfigCache,
  }) : null;
  scope.add(() => cloud.dispose());
  let current, pending, activeIndex, activeConfig;
  function load() {
    pending ??= Promise.all([cloud.getIndex({ signal: scope.signal }), config?.load() ?? {}]).then(([index, configuration]) => {
      if (activeIndex !== index || activeConfig !== configuration.data || current?.configStatus !== configuration.status) {
        current = createCloudCatalogue(index, (path, options) => cloud.downloadResource(path, { ...options, index }), legacy, configuration);
        activeIndex = index;
        activeConfig = configuration.data;
      }
      return current;
    }).finally(() => { pending = null; });
    return pending;
  }
  return {
    get current() { return current; }, load,
    async resolveSkin(id, general) {
      if (typeof id === 'string' && id.startsWith('cloud-')) {
        return (current ?? await load()).findSkin(id, general);
      }
      const old = await legacy.load();
      return old.findSkin(Number(id), general);
    },
    get legacy() { return legacy.current; },
  };
}

async function loadCloudImage(download, win, path, signal, limit) {
  if (!path || signal.aborted) return;
  const bytes = await download(path, { signal, limit });
  const type = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
  return new win.Blob([bytes], { type });
}

export async function loadMobileAudio(win, voice, path, signal) {
  const bytes = await voice.load(path, signal);
  if (!signal.aborted) return win.URL.createObjectURL(new win.Blob([bytes], { type: 'audio/mpeg' }));
}

export { loadMobileMotion } from './mobile-effects.js';

async function readCloudImage(win, entry, path, signal) {
  const blob = await loadCloudImage(entry.download, win, path, signal, artworkLimit);
  if (!blob || signal.aborted) return;
  const url = win.URL.createObjectURL(blob);
  try {
    const image = new win.Image();
    image.src = url;
    await image.decode();
    if (Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error('图片长边超过 8192 像素');
    if (!signal.aborted) return { image, blob };
  } finally { win.URL.revokeObjectURL(url); }
}

export const loadMobileHead = (win, entry, signal) => loadCloudImage(entry.download, win, entry.head, signal, headLimit);
const readImage = (win, url, signal, inspect) => readSkinImage(win, url, signal, inspect, 'auto', imageTypes, 8192);
export async function loadMobilePreview(win, entry, signal) {
  if (!entry.download) return readImage(win, entry.art, signal, image => image);
  return (await readCloudImage(win, entry, entry.art, signal))?.image;
}

export async function loadMobilePortrait(win, entry, signal) {
  if (entry.download) return readCloudImage(win, entry, entry.portrait ?? entry.art, signal);
  const read = url => readImage(win, url, signal, (image, blob) => ({ image, blob }));
  try {
    return await read(entry.art);
  } catch (error) {
    if (!entry.details?.portrait || entry.details.portrait === entry.art) throw error;
    return read(entry.details.portrait);
  }
}

export function resizeMobileArtwork(doc, image) {
  const width = image.naturalWidth ?? image.width;
  const height = image.naturalHeight ?? image.height;
  const scale = 1536 / Math.max(width, height);
  if (scale >= 1) return image;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
