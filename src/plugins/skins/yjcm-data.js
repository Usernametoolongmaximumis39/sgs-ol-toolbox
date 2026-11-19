import { DEATH_VOICE, withDerivedSkills } from './cross-voice.js';
import { verifiedVoices } from './yjcm-verified-voices.js';
import { YJCM_EFFECT_SCHEMA, yjcmClipFile, yjcmFormEffects, yjcmSkillName } from './yjcm-effect-data.js';

const generalRoot = 'res/assets/runtime/general/';
const voiceRoot = 'res/assets/runtime/voice/skin/';
const directories = ['seat/static', 'big/static', 'maxBig'];
const component = /^[A-Za-z0-9_-]+$/;
const fullName = general => (general.NamePrefix ?? []).join('') + general.GeneralName;
const dynamicGrades = new Map([[7, 5], [8, 6], [10, 9]]);
export const YJCM_MOTION_SCHEMA = 1;
export const YJCM_VOICE_SCHEMA = 1;

function relatedSkins(skins, itemRows) {
  const byId = new Map(skins.map(skin => [skin.SkinID, skin]));
  const items = new Map(itemRows.filter(item => item.ItemType === 5 && !item.IsLimit).map(item => [item.ItemID, item]));
  const links = new Map();
  for (const item of items.values()) {
    const linked = items.get(item.RelationSkinItemID);
    if (!linked || !byId.has(item.SkinID) || !byId.has(linked.SkinID)) continue;
    links.set(item.SkinID, linked.SkinID);
    links.set(linked.SkinID, item.SkinID);
  }
  return links;
}

function skinAssets(skins, awakeSkins, links, listed) {
  const base = new Map(), alternate = new Map(), heads = new Map();
  const byId = new Map(skins.map(skin => [skin.SkinID, skin]));
  for (const form of [...skins, ...awakeSkins].sort((a, b) => a.SkinID - b.SkinID || (a.AwakeType ?? 0) - (b.AwakeType ?? 0))) {
    const id = form.SkinID, awake = form.AwakeType || 0;
    const skin = byId.get(id), related = links.get(id);
    if (!skin) continue;
    const ownStatic = !related || !dynamicGrades.has(skin.SkinGradeType);
    const candidates = [ownStatic && form.Resource, ownStatic && form.Resource, form.BigResource];
    for (const target of [id, related]) {
      if (!target) continue;
      const linked = Number(target !== id);
      if (!awake && ownStatic && component.test(form.Resource ?? '')) {
        const stem = String(form.Resource);
        const priority = 2 * Number(!listed.has(generalRoot + 'head/' + stem + '.png')) + linked;
        if (!heads.has(target) || priority < heads.get(target).priority) heads.set(target, { priority, stem });
      }
      const table = awake ? alternate : base;
      const key = awake ? target + ':' + awake : target;
      candidates.forEach((value, kind) => {
        if (!value || !component.test(value)) return;
        if (!table.has(key)) table.set(key, []);
        const stem = String(value);
        const path = generalRoot + directories[kind] + '/' + stem + '.png';
        const priority = kind + 3 * linked + 6 * Number(!listed.has(path));
        table.get(key).push({ priority, asset: [kind, stem] });
      });
    }
  }
  const ordered = rows => {
    const result = new Map();
    for (const { asset, priority } of rows.sort((a, b) => a.priority - b.priority)) {
      const key = asset.join('/');
      if (!result.has(key)) result.set(key, asset);
      if (result.size === 3) break;
    }
    return [...result.values()];
  };
  return {
    base: new Map([...base].map(([id, rows]) => [id, ordered(rows)])),
    alternate: new Map([...alternate].map(([id, rows]) => [id, ordered(rows)])),
    heads,
  };
}

function idleMotion(form, skin, spine, listed) {
  const resource = String(form.Resource ?? '');
  if (!component.test(resource)) return;
  const configured = (spine?.SmallStandByAnimateInfos ?? []).slice().sort((a, b) => a.Index - b.Index);
  let seat;
  if (form.ShowFrame) {
    const seen = new Set();
    seat = configured.flatMap(row => {
      const file = component.test(row.FileName ?? '') ? row.FileName + '.sk' : row.FileName;
      if (!yjcmClipFile.test(file) || seen.has(file)) return [];
      seen.add(file);
      const counts = String(row.Count ?? '1').split('|', 2).map(Number);
      const [min, max = min] = counts.every(n => Number.isSafeInteger(n) && n > 0) ? counts : [1];
      return [{ file, min, max: Math.max(min, max) }];
    });
    if (!seat.length) seat.push({ file: 'daiji2.sk', min: 1, max: 1 });
  }
  const parts = form.ManyPeopleResource ?? skin.ManyPeopleResource ?? [];
  const primary = parts.find(name => name === 'daiji') ?? parts[0] ?? 'daiji';
  // The version manifest lists changed files only. Prefer its confirmed paths
  // and retain the native default path for assets omitted from the manifest.
  const oldSeatName = configured.find(row => row.Index === 1)?.FileName;
  const seatFiles = seat?.map(clip => clip.file) ?? [component.test(oldSeatName ?? '') ? oldSeatName + '.sk' : 'daiji2.sk'];
  const root = generalRoot + 'big/dynamic/' + resource + '/';
  const binary = primary + '.skel';
  const names = [...seatFiles, ...(skin.DynamicStandbySkel || listed.has(root + binary) ? [binary] : []),
    primary + '.sk', 'daiji.sk'];
  return { resource, files: [...new Set(names)].filter(name => yjcmClipFile.test(name)), seat };
}

function buildVoices(dialogs, characters, spellRows, displayNames, eligibleSkins, awakeTypes, listed) {
  const spells = new Map(spellRows.map(row => [row.SpellId, row]));
  const cards = new Map(characters.map(card => [card.CharacterId, {
    name: card.Name,
    skills: withDerivedSkills(card.Spell ?? [], id => spells.get(id)?.DeriveSkill).add(DEATH_VOICE),
  }]));
  const verified = new Set();
  for (const line of verifiedVoices.split('\n')) {
    const [folder, ...clips] = line.split(' ');
    for (const clip of clips) verified.add(folder + '/' + clip);
  }
  const extensions = ['mp3', 'wav', 'ogg'];
  const paths = new Map();
  function clipPath(stem) {
    if (!paths.has(stem)) {
      const ext = extensions.find(ext => listed.has(voiceRoot + stem + '.' + ext) || (ext === 'mp3' && verified.has(stem)));
      paths.set(stem, ext ? stem + '.' + ext : null);
    }
    return paths.get(stem);
  }
  const bySkin = new Map();
  for (const row of dialogs) {
    const { SkinID: skin, GeneralID, SkillID: skill, SkillPath: folder, AwakeType: awake = 0 } = row;
    if (!eligibleSkins.has(skin) || (skill !== DEATH_VOICE && !spells.has(skill)) || !component.test(folder ?? '')) continue;
    if (awake && awake !== awakeTypes.get(skin)) continue;
    const files = [...(row.Effect1 ?? []), ...(row.Effect2 ?? [])].filter(file => component.test(file))
      .map(file => clipPath(folder + '/' + file)).filter(Boolean);
    if (!files.length) continue;
    for (const id of GeneralID ?? []) {
      const card = cards.get(id);
      if (!card?.skills.has(skill)) continue;
      if (!bySkin.has(skin)) bySkin.set(skin, new Map());
      const byGeneral = bySkin.get(skin);
      if (!byGeneral.has(id)) byGeneral.set(id, new Map());
      const bySkill = byGeneral.get(id);
      if (!bySkill.has(skill)) bySkill.set(skill, [new Set()]);
      const forms = bySkill.get(skill);
      const clips = (forms[Number(Boolean(awake))] ??= new Set());
      for (const file of files) clips.add(file);
    }
  }
  const namesUsed = new Map(), filesUsed = new Map();
  function index(values, value) {
    if (!values.has(value)) values.set(value, values.size);
    return values.get(value);
  }
  const voiceSkins = {};
  for (const [skin, groups] of bySkin) {
    voiceSkins[skin] = [...groups].map(([id, skills]) => {
      const card = cards.get(id);
      const rows = [...card.skills].flatMap(skill => {
        const forms = skills.get(skill);
        if (!forms) return [];
        const name = skill === DEATH_VOICE ? '阵亡' : spells.get(skill).Name;
        return [[skill, index(namesUsed, name), ...forms.map(clips => [...clips].map(file => index(filesUsed, file)))]];
      });
      return [displayNames.get(id) ?? card.name, rows];
    });
  }
  return { voiceNames: [...namesUsed.keys()], voiceFiles: [...filesUsed.keys()], voiceSkins };
}

export function buildYjcmData(source) {
  const { SkinConf: skinRows, ClientAwakeSkin: awakeRows, DialogConf: dialogs, SkinSpineConf: spineRows = [] } = source.GeneralSkinInfoConfig;
  const generalRows = source.GameGeneralConfig.GeneralConf;
  const listed = new Set(Object.keys(source.versions));
  for (const { url } of source.resources.resources) listed.add('res/' + url);
  for (const [path, entries] of Object.entries(source.textures)) {
    listed.add('res/' + path);
    for (const { url } of entries) listed.add('res/' + url);
  }
  const linked = relatedSkins(skinRows, source.GameItemConfig.ItemConf);
  const { base, alternate, heads } = skinAssets(skinRows, awakeRows, linked, listed);
  const skinsById = new Map(skinRows.map(row => [row.SkinID, row]));
  const spineByForm = new Map(spineRows.map(row => [row.SkinID + ':' + (row.AwakeType || 0), row]));
  const effectSkillNames = new Map(source.Skills.SpellDesc.map(row => [row.SpellId, yjcmSkillName(row.Name)]));
  const awakeById = new Map(awakeRows.map(row => [row.SkinID, row]));
  const dynamicSkins = {}, motion = {}, effects = {};
  for (const skin of skinRows) {
    const id = skin.SkinID, grade = dynamicGrades.get(skin.SkinGradeType);
    if (!grade) continue;
    const staticSkin = skinsById.get(linked.get(id));
    const paired = staticSkin?.SkinGradeType === grade && base.has(staticSkin.SkinID) &&
      skin.RelationGeneralID?.some(owner => staticSkin.RelationGeneralID?.includes(owner));
    const displayId = paired ? staticSkin.SkinID : id;
    if (paired) dynamicSkins[displayId] = id;
    const awake = awakeById.get(id), spine = spineByForm.get(id + ':0');
    const awakeSpine = awake && spineByForm.get(id + ':' + awake.AwakeType);
    motion[displayId] = [idleMotion(skin, skin, spine, listed), awake && idleMotion(awake, skin, awakeSpine, listed)];
    const relatedStatic = paired ? staticSkin : undefined;
    effects[displayId] = [yjcmFormEffects(skin, skin, spine, effectSkillNames, awake, relatedStatic),
      awake && yjcmFormEffects(awake, skin, awakeSpine, effectSkillNames, awake, relatedStatic)];
  }
  const generalById = new Map(generalRows.map(general => [general.GeneralID, general]));
  const displayNames = new Map(generalRows.map(general => [general.GeneralID, fullName(general)]));
  const skins = [], links = new Map(), alternateSkinAssets = {};
  const awakeTypes = new Map(awakeRows.map(row => [row.SkinID, row.AwakeType]));
  for (const skin of [...skinRows].sort((a, b) => a.SkinID - b.SkinID)) {
    const id = skin.SkinID, assets = base.get(id);
    const owners = [...new Set(skin.RelationGeneralID ?? [])].filter(generalId => generalById.has(generalId));
    if (!assets || !owners.length) continue;
    const name = skin.ItemName.split('*', 1)[0];
    skins.push([id, name, assets, heads.get(id)?.stem ?? null]);
    const other = alternate.get(id + ':' + awakeTypes.get(id));
    if (other) alternateSkinAssets[id] = other;
    for (const generalId of owners) {
      if (!links.has(generalId)) links.set(generalId, []);
      links.get(generalId).push(id);
    }
  }
  const groups = new Map();
  for (const [id, skinIds] of [...links].sort(([a], [b]) => a - b)) {
    const name = displayNames.get(id), base = generalById.get(id).GeneralName;
    if (!base) continue;
    const key = name + '\n' + base;
    if (!groups.has(key)) groups.set(key, [name, name === base ? '' : base, new Set()]);
    for (const skin of skinIds) groups.get(key)[2].add(skin);
  }
  const generals = [...groups.values()].map(([name, alias, ids]) => [name, alias, [...ids].sort((a, b) => a - b)]);
  const compareName = new Intl.Collator('zh-CN').compare;
  generals.sort(([a, aliasA], [b, aliasB]) => compareName(a, b) || compareName(aliasA, aliasB));
  const voices = buildVoices(dialogs, source.GeneralCards.Character, source.Skills.SpellDesc,
    displayNames, new Set(skins.map(row => row[0])), awakeTypes, listed);
  if (!skins.length || !generals.length || !voices.voiceFiles.length) throw new Error('一将成名配置未生成可用的皮肤和语音索引');
  return { skins, generals, alternateSkinAssets, dynamicSkins, motion, motionSchema: YJCM_MOTION_SCHEMA,
    effectSchema: YJCM_EFFECT_SCHEMA, effects, voiceSchema: YJCM_VOICE_SCHEMA, ...voices };
}
