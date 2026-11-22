import { read } from './native-model.js';
import { isAwakeningSkill } from './local-forms.js';

export const NATIVE_VOICE = 'native';
export const DEATH_VOICE = -1;
export const isBindableVoice = ({ kind }) => kind !== 'card' && kind !== 'victory';
export const isAutomaticSkillVoice = voice => voice.id !== DEATH_VOICE && voice.kind !== 'unidentified' && isBindableVoice(voice);
const nameKey = name => typeof name === 'string' ? name.normalize('NFKC').trim() : '';
export const voiceClipKey = (voice, url) => voice.clipKeys?.get(url) ?? url;

function voiceClips(voices) {
  return new Map(voices.flatMap(voice => voice.urls.map(url => [voiceClipKey(voice, url), url])));
}

function skillNames(skills) {
  return new Set((skills ?? []).map(skill => nameKey(skill.name)).filter(Boolean));
}

export function unmatchedSkillClips(skills, voices) {
  const names = skillNames(skills);
  const eligible = voices.filter(isAutomaticSkillVoice);
  const reserved = voiceClips(eligible.filter(voice => names.has(nameKey(voice.name))));
  return new Map([...voiceClips(eligible)].filter(([clip]) => !reserved.has(clip)));
}

function skillVoicesByName(voices) {
  const byName = new Map();
  for (const voice of voices) {
    if (!isAutomaticSkillVoice(voice)) continue;
    const name = nameKey(voice.name);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(voice.id);
  }
  return byName;
}

export function normalizeMobileVoiceOptions(options) {
  return { card: options?.card !== false, victory: options?.victory !== false };
}

export function skinVoiceFormKey(entry, form) {
  return entry.source === 'mobile' ? String(entry.number ?? entry.id) : String(form);
}

export function voiceBindingsForForm(config, entry, form) {
  return config?.byForm ? config.byForm[skinVoiceFormKey(entry, form)] ?? {} : config ?? {};
}

export function updateVoiceBindingsForForms(config, forms, changes) {
  if (forms.length === 1 && !config?.byForm) return changes.get(0) ?? config ?? {};
  const byForm = { ...config?.byForm };
  forms.forEach((entry, index) => {
    const form = index + 1;
    byForm[skinVoiceFormKey(entry, form)] = changes.get(index) ?? voiceBindingsForForm(config, entry, form);
  });
  return { byForm };
}

export function withDerivedSkills(baseIds, getDerivedSkills) {
  const ids = new Set(baseIds);
  // A Set visits appended IDs in order and prevents cycles and duplicates.
  for (const id of ids) {
    const derived = getDerivedSkills(id);
    if (derived == null) continue;
    for (const value of Array.isArray(derived) ? derived : String(derived).split(',')) {
      const skill = Number(value);
      if (Number.isSafeInteger(skill) && skill > 0) ids.add(skill);
    }
  }
  return ids;
}

export function configuredCardSkills(ctx, id, { includeDerived = false, includeDetails = false } = {}) {
  const characters = ctx.game.getConfigData?.('character');
  const row = characters?.GameCharacters?.character?.find(row => Number(row.id ?? row.a) === id);
  if (!row) return null;
  const config = ctx.game.getConfigData?.('cha_spell');
  const spells = config?.GameSpells?.spell;
  if (!Array.isArray(spells)) return null;
  const byId = new Map(spells.map(spell => [Number(spell.id ?? spell.a), spell]));
  const fields = ['j', 'k', 'l', 'm', 'n', 'o'];
  const baseIds = new Set(fields.map((field, i) => Number(row['spellId' + (i + 1)] ?? row[field]))
    .filter(id => Number.isSafeInteger(id) && id > 0));
  const derivedField = config.abbreviation?.field?.find(field => field.Long === 'DeriveSkills')?.Short ?? 'm';
  const typeField = includeDetails ? config.abbreviation?.field?.find(field => field.Long === 'type')?.Short ?? 'b' : null;
  const ids = includeDerived ? withDerivedSkills(baseIds, skill => {
    const spell = byId.get(skill);
    return spell?.DeriveSkills ?? spell?.[derivedField];
  }) : baseIds;
  return [...ids].flatMap(id => {
    const spell = byId.get(id), name = spell?.name ?? spell?.c;
    if (!name) return [];
    const skill = { id, name };
    if (includeDetails) {
      skill.derived = !baseIds.has(id);
      const types = String(spell.type ?? spell[typeField] ?? '').split(',').map(Number);
      skill.awakening = isAwakeningSkill(types);
      // The client uses server skill type 13 for conversion skills.
      skill.conversion = types.includes(13);
    }
    return [skill];
  });
}

export async function loadCardSkills(ctx, id, options) {
  const cached = configuredCardSkills(ctx, id, options);
  if (cached) return cached;
  await Promise.allSettled(['character', 'cha_spell'].map(name => ctx.game.loadConfigData?.(name)));
  return ctx.scope.signal.aborted ? null : configuredCardSkills(ctx, id, options);
}

export function bindVoicesInOrder(skills, voices, current = {}) {
  const bindings = {};
  const byName = skillVoicesByName(voices);
  const names = skillNames(skills);
  const unmatched = [];
  for (const { id, name } of skills) {
    if (current[id] === NATIVE_VOICE) continue;
    const matches = byName.get(nameKey(name));
    if (matches) bindings[id] = matches;
    else unmatched.push(id);
  }
  const unused = unmatchedSkillClips(skills, voices);
  const pool = voices.filter(voice => {
    if (!isAutomaticSkillVoice(voice) || names.has(nameKey(voice.name))) return false;
    const clips = voice.urls.map(url => voiceClipKey(voice, url));
    if (!clips.some(clip => unused.has(clip))) return false;
    for (const clip of clips) unused.delete(clip);
    return true;
  });
  if (unmatched.length && pool.length) {
    for (let i = 0; i < Math.max(unmatched.length, pool.length); i++) {
      const id = unmatched[i % unmatched.length];
      (bindings[id] ??= []).push(pool[i % pool.length].id);
    }
  }
  if (current[DEATH_VOICE] !== NATIVE_VOICE && voices.some(voice => voice.id === DEATH_VOICE)) bindings[DEATH_VOICE] = [DEATH_VOICE];
  return bindings;
}

export function remapVoiceBindings(bindings, voices) {
  const ids = new Map(voices.flatMap(({ id, aliases = [] }) => aliases.map(alias => [alias, id])));
  return Object.fromEntries(Object.entries(bindings ?? {}).flatMap(([skill, selected]) => {
    if (selected === NATIVE_VOICE) return [[skill, selected]];
    if (Array.isArray(selected)) return [[skill, [...new Set(selected.map(id => ids.get(id) ?? id))]]];
    return [];
  }));
}

export function resolveVoiceBindings(skills, voices, bindings) {
  const selected = remapVoiceBindings(bindings, voices);
  const byName = skillVoicesByName(voices);
  for (const { id, name } of skills ?? []) {
    const matches = byName.get(nameKey(name));
    if (selected[id] === undefined && matches) selected[id] = matches;
  }
  if (selected[DEATH_VOICE] === undefined && voices.some(voice => voice.id === DEATH_VOICE)) selected[DEATH_VOICE] = [DEATH_VOICE];
  return selected;
}

export function createCrossVoice(skills, voices, bindings, playback = {}, resolveReference = () => undefined,
  { randomForUnbound = true, card = false, victory = false } = {}) {
  const sounds = new Map(voices.map(voice => [voice.id, voice]));
  const skillVoices = voices.filter(isAutomaticSkillVoice);
  const skillClips = voiceClips(skillVoices);
  const unmatchedClips = unmatchedSkillClips(skills, voices);
  const deathClips = voiceClips(voices.filter(voice => voice.id === DEATH_VOICE));
  const selectedVoices = resolveVoiceBindings(skills, voices, bindings);
  const choicesBySkill = new Map([...skills.map(skill => skill.id), DEATH_VOICE].flatMap(id => {
    const selected = selectedVoices[id];
    if (selected === NATIVE_VOICE) return [];
    const death = id === DEATH_VOICE;
    const bound = voiceClips((selected ?? []).flatMap(reference => {
      const voice = typeof reference === 'string' ? resolveReference(reference) : sounds.get(reference);
      return voice && isBindableVoice(voice) && (voice.id === DEATH_VOICE) === death ? [voice] : [];
    }));
    const fallback = death ? deathClips :
      selected?.length === 0 ? skillClips : randomForUnbound ? unmatchedClips : undefined;
    return [[id, [...(bound.size ? bound : fallback ?? [])]]];
  }));
  const cardSounds = new Map(), victoryVoices = [];
  for (const voice of voices) {
    if (card && voice.kind === 'card') {
      const name = nameKey(voice.name);
      if (!name) continue;
      if (!cardSounds.has(name)) cardSounds.set(name, []);
      cardSounds.get(name).push(voice);
    }
    if (victory && voice.kind === 'victory') victoryVoices.push(voice);
  }
  const cardChoices = new Map([...cardSounds].map(([name, group]) => [name, [...voiceClips(group)]]));
  const victoryChoices = [...voiceClips(victoryVoices)];
  function pick(choices, key, repeatSingle = false) {
    if (!choices?.length) return;
    const candidates = repeatSingle && choices.length === 1 ? choices : choices.filter(([clip]) => clip !== playback[key]);
    if (!candidates.length) {
      // Native playback supplies the intervening line when the replacement has no alternative.
      delete playback[key];
      return;
    }
    const [clip, url] = candidates[Math.floor(Math.random() * candidates.length)];
    playback[key] = clip;
    return url;
  }
  return {
    replaces(id) {
      return Boolean(choicesBySkill.get(id)?.length);
    },
    next(id) {
      return pick(choicesBySkill.get(id), 'last');
    },
    card: name => pick(cardChoices.get(nameKey(name)), 'lastCard', true),
    victory: victory ? () => pick(victoryChoices, 'lastVictory', true) : undefined,
  };
}

// The seat's native playback still owns muting, volume and skill sound timing.
function withValues(overrides, play) {
  const descriptors = overrides.map(([owner, key]) => Object.getOwnPropertyDescriptor(owner, key));
  if (overrides.some(([owner], index) => descriptors[index] ? !descriptors[index].configurable : !Object.isExtensible(owner))) return play();
  const restore = [];
  try {
    for (const [index, [owner, key, value]] of overrides.entries()) {
      const descriptor = descriptors[index];
      Object.defineProperty(owner, key, { configurable: true, writable: true, enumerable: descriptor?.enumerable, value });
      restore.push(() => {
        if (Object.getOwnPropertyDescriptor(owner, key)?.value !== value) return;
        if (descriptor) Object.defineProperty(owner, key, descriptor);
        else delete owner[key];
      });
    }
    return play();
  } finally {
    for (const reset of restore.reverse()) reset();
  }
}

export function playCrossVoice(seat, findChoice, play, [skill, , event], damage = false) {
  const soundMethod = damage ? 'GetHurtSoundUrl' : 'GetSoundUrl';
  const nativeSound = skill?.[soundMethod];
  if (typeof nativeSound !== 'function' || skill.IsGeneral === false || seat.HuaShenCard) return play();
  const id = Number(skill.ID);
  const whoseSkill = seat.GetSkillFromWhichGeneral;
  const owner = read(() => seat.GetGeneralBySkillIdOnlyId(id)) ?? read(() => whoseSkill.call(seat, id));
  if (!owner || (Number(event?.GeneralID) > 0 && Number(event.GeneralID) !== Number(owner.CardId))) return play();
  const choice = findChoice(owner);
  if (!choice?.voice.replaces(id)) return play();
  if (damage) {
    return withValues([[skill, soundMethod, function (...args) {
      const original = Reflect.apply(nativeSound, this, args);
      return original ? choice.voice.next(id) ?? original : original;
    }]], play);
  }
  const url = choice.voice.next(id);
  if (!url) return play();
  const overrides = [[skill, soundMethod, () => url]];
  if (typeof whoseSkill === 'function') overrides.push([seat, 'GetSkillFromWhichGeneral', skillId =>
    Number(skillId) === id ? null : whoseSkill.call(seat, skillId)]);
  return withValues(overrides, play);
}

export function playCrossCard(seat, findSound, play, [skill, source, event]) {
  if (source !== 'card' || skill?.IsGeneral !== false || typeof skill.GetSoundUrl !== 'function') return play();
  const name = read(() => skill.SkillName) || read(() => skill.Name);
  const url = name && findSound(name, event);
  if (!url) return play();
  const overrides = [[skill, 'GetSoundUrl', () => url]];
  const whoseSkill = seat.GetSkillFromWhichGeneral;
  if (typeof whoseSkill === 'function') overrides.push([seat, 'GetSkillFromWhichGeneral', skillId =>
    Number(skillId) === Number(skill.ID) ? null : whoseSkill.call(seat, skillId)]);
  return withValues(overrides, play);
}

export function playCrossDeath(seat, findChoice, play, [general]) {
  const url = findChoice(general)?.voice.next(DEATH_VOICE);
  if (!url) return play();
  // The self-seat branch can replace DeadSoundUrl with a server-selected voice.
  // Keep the native player and volume, using the supplied URL for this call.
  return withValues([[general, 'DeadSoundUrl', url], [seat, 'IsSelf', false]], play);
}
