import { read } from './native-model.js';

export const NATIVE_VOICE = 'native';
export const DEATH_VOICE = -1;

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

export function configuredCardSkills(ctx, id, { includeDerived = false } = {}) {
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
  const ids = includeDerived ? withDerivedSkills(baseIds, skill => {
    const spell = byId.get(skill);
    return spell?.DeriveSkills ?? spell?.[derivedField];
  }) : baseIds;
  return [...ids].flatMap(id => {
    const spell = byId.get(id), name = spell?.name ?? spell?.c;
    return name ? [{ id, name }] : [];
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
  const skillVoices = voices.filter(voice => voice.id !== DEATH_VOICE);
  if (skills.length && skillVoices.length) {
    for (let i = 0; i < Math.max(skills.length, skillVoices.length); i++) {
      const { id } = skills[i % skills.length];
      if (current[id] === NATIVE_VOICE) continue;
      (bindings[id] ??= []).push(skillVoices[i % skillVoices.length].id);
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
  const nameKey = name => typeof name === 'string' ? name.normalize('NFKC').trim() : '';
  const byName = new Map(voices.filter(voice => voice.id !== DEATH_VOICE).map(voice => [nameKey(voice.name), voice.id]));
  for (const { id, name } of skills ?? []) {
    const key = nameKey(name);
    if (selected[id] === undefined && key && byName.has(key)) selected[id] = [byName.get(key)];
  }
  if (selected[DEATH_VOICE] === undefined && voices.some(voice => voice.id === DEATH_VOICE)) selected[DEATH_VOICE] = [DEATH_VOICE];
  return selected;
}

export function createCrossVoice(skills, voices, bindings, playback = {}, resolveReference = () => undefined) {
  const sounds = new Map(voices.map(voice => [voice.id, voice]));
  const skillClips = [...new Set(voices.filter(voice => voice.id !== DEATH_VOICE).flatMap(({ urls }) => urls))];
  const selectedVoices = resolveVoiceBindings(skills, voices, bindings);
  const choicesBySkill = new Map([...skills.map(skill => skill.id), DEATH_VOICE].flatMap(id => {
    const selected = selectedVoices[id] ?? [];
    if (selected === NATIVE_VOICE) return [];
    const death = id === DEATH_VOICE;
    const bound = [...new Set(selected.flatMap(reference => {
      const voice = typeof reference === 'string' ? resolveReference(reference) : sounds.get(reference);
      return voice && (voice.id === DEATH_VOICE) === death ? voice.urls : [];
    }))];
    const fallback = death ? sounds.get(DEATH_VOICE)?.urls : skillClips;
    return [[id, bound.length ? bound : fallback]];
  }));
  return {
    replaces(id) {
      return Boolean(choicesBySkill.get(id)?.length);
    },
    next(id) {
      const choices = choicesBySkill.get(id);
      if (!choices?.length) return;
      const candidates = choices.length > 1 ? choices.filter(url => url !== playback.last) : choices;
      playback.last = candidates[Math.floor(Math.random() * candidates.length)];
      return playback.last;
    },
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

export function playCrossDeath(seat, findChoice, play, [general]) {
  const url = findChoice(general)?.voice.next(DEATH_VOICE);
  if (!url) return play();
  // The self-seat branch can replace DeadSoundUrl with a server-selected voice.
  // Keep the native player and volume, using the supplied URL for this call.
  return withValues([[general, 'DeadSoundUrl', url], [seat, 'IsSelf', false]], play);
}
