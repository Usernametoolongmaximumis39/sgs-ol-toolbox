import { readMobileConfigTable } from './mobile-config-lua.js';

const skinKey = /^(?:0|[1-9]\d{0,11})(?:#[1-9]\d{0,2})?$/;
const basename = /^[\w #!+@().-]{1,180}$/;
const isId = value => Number.isSafeInteger(value) && value >= 0;
const asName = value => typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f]/.test(value)
  ? value.trim() : '';
const entries = value => value instanceof Map ? value : [];
const values = value => value instanceof Map ? value.values() : [];

function putItem(map, key, item) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}

function namesByGeneral(config) {
  const generals = new Map(), provisionalGenerals = new Set();
  for (const row of values(config.get('items'))) {
    if (!(row instanceof Map)) continue;
    const id = row.get('id'), name = asName(row.get('name'));
    if (!isId(id) || !id || !name) continue;
    generals.set(id, name);
    if (asName(row.get('selldes')) === '即将上线') provisionalGenerals.add(id);
  }
  return { generals, provisionalGenerals };
}

function projectMotion(row) {
  const version = row.get('motionPicver');
  if (!isId(version) || !version) return undefined;
  const scale = row.get('scale');
  const offsetX = row.get('offsetX'), offsetY = row.get('offsetY'), rotation = row.get('rotation');
  const motion = { version };
  if (Number.isFinite(scale) && scale > 0 && scale <= 4) motion.scale = scale;
  if (Number.isFinite(offsetX) && Math.abs(offsetX) <= 4000) motion.offsetX = offsetX;
  if (Number.isFinite(offsetY) && Math.abs(offsetY) <= 4000) motion.offsetY = offsetY;
  if (Number.isFinite(rotation) && Math.abs(rotation) <= 360) motion.rotation = rotation;
  const range = row.get('minShowRange');
  if (typeof range === 'string' && /^\d{1,4}(?:,\d{1,4}){3}$/.test(range)) {
    motion.attackMargins = range.split(',').map(Number);
  }
  return motion;
}

function projectSkins(config, generals) {
  const skins = new Map(), forms = [];
  for (const [key, row] of config) {
    const id = String(key);
    if (!skinKey.test(id) || id === '0' || !(row instanceof Map) || String(row.get('skinid')) !== id) continue;
    const officialTitle = asName(row.get('name'));
    if (!officialTitle) continue;
    const [base, form] = id.split('#');
    const motion = projectMotion(row);
    if (form) {
      forms.push([base, id, officialTitle, motion]);
      continue;
    }
    const generalId = row.get('chrid');
    if (!isId(generalId) || !generalId) continue;
    const [shortTitle, owner] = officialTitle.split('*');
    const title = shortTitle.trim() || officialTitle;
    const general = generals.get(generalId) ?? asName(owner);
    const generalIds = [...new Set([generalId, ...values(row.get('chrList'))])].filter(id => isId(id) && id);
    skins.set(id, { title, officialTitle, generalId, general, generalIds,
      ...(row.get('grade') === 0 ? { classic: true } : {}), ...(motion ? { motion } : {}) });
  }
  for (const [base, id, formName, motion] of forms) {
    const skin = skins.get(base);
    if (skin) {
      const { motion: _baseMotion, ...family } = skin;
      skins.set(id, { ...family, formName, ...(motion ? { motion } : {}) });
    }
  }
  return skins;
}

function spellsById(config) {
  const spells = new Map();
  for (const row of config.values()) {
    if (!(row instanceof Map)) continue;
    const id = row.get('id'), name = asName(row.get('Name')), attribute = row.get('Attribute');
    if (isId(id) && id) spells.set(id, { name, attribute: isId(attribute) ? attribute : 0 });
  }
  return spells;
}

function cardNamesById(config, keyCards, spells) {
  const cards = new Map(), subtypes = new Map();
  for (const row of values(keyCards.get('type'))) {
    if (!(row instanceof Map)) continue;
    const id = row.get('spellId'), name = asName(row.get('keycardName'));
    if (isId(id) && id) cards.set(id, spells.get(id)?.name || name);
  }
  for (const row of config.values()) {
    if (!(row instanceof Map)) continue;
    const id = row.get('SpellId'), subtype = row.get('SubType'), name = asName(row.get('Name'));
    if (!isId(id) || !id) continue;
    const base = spells.get(id)?.name || cards.get(id) || name;
    cards.set(id, base);
    if (!isId(subtype) || !subtype || !name || name === base) continue;
    const key = `${id}:${subtype}`;
    if (!subtypes.has(key)) subtypes.set(key, new Set());
    subtypes.get(key).add(name);
  }
  return { cards, subtypes };
}

function projectVoices(config, spells, { cards, subtypes }) {
  const voices = new Map(), skinVoices = new Map();
  function register(folders, filename, metadata) {
    if (typeof filename !== 'string' || !basename.test(filename) || filename === '.' || filename === '..') return;
    const file = /\.mp3$/i.test(filename) ? filename : filename + '.mp3';
    for (const folder of folders) {
      const path = `audio/${folder}/${file}`;
      const ref = { ...metadata, path };
      putItem(voices, path, ref);
      if (ref.skinId && ref.skinId !== '0') putItem(skinVoices, ref.skinId, ref);
      else if (ref.skinId === '0' && ref.characterId > 0) putItem(skinVoices, `char-${ref.characterId}`, ref);
    }
  }

  // SoundCfg[2] contains cards and general skills in the same directory.
  // The outer keys are spell ID, skin ID (including forms), general ID and sound ID.
  for (const [spellId, bySkin] of entries(config.get(2))) {
    if (!isId(spellId)) continue;
    const spell = spells.get(spellId);
    const kind = cards.has(spellId) ? 'card' : spell?.attribute & 8 ? 'skill' : 'unidentified';
    for (const [skin, byGeneral] of entries(bySkin)) {
      const skinId = String(skin);
      if (!skinKey.test(skinId)) continue;
      for (const [characterId, bySound] of entries(byGeneral)) {
        if (!isId(characterId)) continue;
        for (const [soundId, row] of entries(bySound)) {
          if (!isId(soundId) || !(row instanceof Map) || row.get('type') !== 2 || row.get('id') !== spellId ||
              row.get('skinId') !== skin || row.get('chrid') !== characterId || row.get('soundId') !== soundId) continue;
          const subtype = row.get('subType');
          const variants = kind === 'card' ? subtypes.get(`${spellId}:${subtype}`) : undefined;
          const name = variants?.size === 1 ? variants.values().next().value : spell?.name || cards.get(spellId);
          register(['skill'], row.get('filename'), { kind, skinId, characterId, spellId, soundId,
            ...(isId(subtype) && subtype ? { subtype } : {}), ...(name ? { name } : {}) });
        }
      }
    }
  }
  for (const [type, folder, kind, name] of [[3, 'dead', 'death', '阵亡'], [4, 'victory', 'victory', '胜利']]) {
    for (const [skin, byGeneral] of entries(config.get(type))) {
      const skinId = String(skin);
      if (!skinKey.test(skinId)) continue;
      for (const [characterId, row] of entries(byGeneral)) {
        if (!isId(characterId) || !(row instanceof Map) || row.get('type') !== type ||
            row.get('skinId') !== skin || row.get('chrid') !== characterId) continue;
        register([folder], row.get('filename'), { kind, name, skinId, characterId });
      }
    }
  }
  // Type 6 references both folders by basename. The cloud catalogue only
  // accepts these associations when the exact resource path is present.
  for (const [soundId, row] of entries(config.get(6))) {
    if (!isId(soundId) || !(row instanceof Map) || row.get('type') !== 6 || row.get('soundid') !== soundId) continue;
    register(['skill', 'effect'], row.get('filename'), { kind: 'effect', name: '演出音效', soundId });
  }
  function easterEggs(table, type, parents = []) {
    if (!(table instanceof Map)) return;
    const filename = table.get('filename');
    if (typeof filename === 'string') {
      const [characterId, second, third] = parents;
      if (!isId(characterId)) return;
      const scope = type === 8 && isId(second) && isId(third) ? { spellId: second, targetCharacterId: third } :
        type === 12 && isId(second) ? { targetCharacterId: second } : {};
      register(['skill'], filename, { kind: 'easterEgg', name: '彩蛋配音', characterId, ...scope });
      return;
    }
    for (const [key, row] of table) if (isId(key)) easterEggs(row, type, [...parents, key]);
  }
  for (const type of [8, 10, 12]) easterEggs(config.get(type), type);
  return { voices, skinVoices };
}

export function buildMobileConfigData(tables) {
  const read = name => readMobileConfigTable(tables?.get(name), name);
  const { generals, provisionalGenerals } = namesByGeneral(read('chrCfg.lua'));
  const skins = projectSkins(read('skin.lua'), generals);
  const spells = spellsById(read('SpellData.lua'));
  const cards = cardNamesById(read('Cards.lua'), read('key_card.lua'), spells);
  const voiceIndex = projectVoices(read('SoundCfg.lua'), spells, cards);
  if (!generals.size || !skins.size || !spells.size || !cards.cards.size || !voiceIndex.voices.size) {
    throw new Error('移动版官方配置没有可用的皮肤、武将或语音');
  }
  return { skins, generals, provisionalGenerals, ...voiceIndex };
}
