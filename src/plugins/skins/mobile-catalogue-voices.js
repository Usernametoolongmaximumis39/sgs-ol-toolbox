import { DEATH_VOICE, isAutomaticSkillVoice, voiceClipKey } from './cross-voice.js';
import { mobileCloudVoice } from './mobile-voice.js';
import { mobileFormVoiceRefs } from './mobile-form-voices.js';

export function mobileVoiceId(code) {
  let hash = 2166136261;
  for (const character of code) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return (hash >>> 0) + 1;
}

const publishedKinds = new Set(['skill', 'card', 'unidentified', 'victory']);
const clipOrder = new Intl.Collator('en', { numeric: true });

export function mobileCatalogueVoices(row, original, official, resources) {
  function published(skin) {
    const { refs, splitSpells } = mobileFormVoiceRefs(skin);
    const seen = new Set();
    const officialRefs = (official?.skinVoices.get(skin.id) ?? [])
      .filter(ref => ref.kind !== 'skill' || !splitSpells?.has(ref.spellId));
    return [...officialRefs, ...refs].filter(ref => {
      // Paths can legitimately represent distinct spell IDs.
      const id = [ref.kind, ref.spellId, ref.subtype, ref.path].join(':');
      if (!resources.has(ref.path) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  const own = published(row), base = original ? published(original) : [];
  const hasOwnSkills = row.voices.size || own.some(ref => publishedKinds.has(ref.kind) && ref.kind !== 'victory');
  const raw = hasOwnSkills ? row.voices : original?.voices ?? row.voices;
  const scopeId = hasOwnSkills ? row.id : original?.id ?? row.id;
  const skillRefs = hasOwnSkills ? own : base;
  const victory = own.filter(ref => ref.kind === 'victory');
  const refs = [...skillRefs.filter(ref => ref.kind !== 'victory'), ...(victory.length ? victory : base.filter(ref => ref.kind === 'victory'))];
  const rawCodes = new Map();
  for (const [code, paths] of raw) for (const path of paths) rawCodes.set(path, code);
  const officialGroups = new Map();
  for (const { kind, name, spellId, subtype, path } of refs) {
    if (!publishedKinds.has(kind)) continue;
    const fallback = rawCodes.get(path) ?? path.split('/').pop().replace(/\.mp3$/i, '');
    const label = name || fallback;
    const key = [kind, spellId, subtype].join(':');
    if (!officialGroups.has(key)) officialGroups.set(key, { name: label, kind, paths: new Set() });
    officialGroups.get(key).paths.add(path);
  }
  const usedPaths = new Set(), aliasOwners = new Map();
  const groups = [...officialGroups].sort(([, a], [, b]) => b.paths.size - a.paths.size);
  for (const [key, voice] of groups) {
    for (const path of voice.paths) {
      usedPaths.add(path);
      const code = rawCodes.get(path);
      if (code && !aliasOwners.has(code)) aliasOwners.set(code, key);
    }
  }

  const voices = [];
  for (const [key, group] of officialGroups) {
    const ids = [...new Set([...group.paths].map(path => rawCodes.get(path))
      .filter(code => aliasOwners.get(code) === key).map(mobileVoiceId))];
    const id = ids[0] ?? 0x100000000 + mobileVoiceId(key);
    voices.push({ id, kind: group.kind, name: group.name, urls: [...group.paths].sort(clipOrder.compare), aliases: ids.slice(1) });
  }
  for (const [code, paths] of raw) {
    // Keep each historical short-code ID attached to one published group.
    // Remaining candidates with no official relation keep the offline rules.
    const urls = paths.filter(path => !usedPaths.has(path));
    if (!urls.length) continue;
    const id = (aliasOwners.has(code) ? 0x200000000 : 0) + mobileVoiceId(code);
    voices.push({ id, ...mobileCloudVoice(code, scopeId), urls });
  }
  const ownDeaths = own.filter(ref => ref.kind === 'death').map(ref => ref.path);
  const baseDeaths = base.filter(ref => ref.kind === 'death').map(ref => ref.path);
  const deaths = [...new Set([...ownDeaths, ...row.death])];
  if (!deaths.length && original) deaths.push(...new Set([...baseDeaths, ...original.death]));
  if (deaths.length) voices.push({ id: DEATH_VOICE, name: '阵亡', urls: deaths.sort(clipOrder.compare) });
  const sharedSkills = new Map();
  return voices.filter(voice => {
    const clipKeys = new Map(voice.urls.flatMap(path => {
      const digest = resources.get(path)?.md5;
      return digest ? [[path, digest]] : [];
    }));
    if (clipKeys.size) voice.clipKeys = clipKeys;
    const clips = new Map(voice.urls.map(path => [voiceClipKey(voice, path), path]));
    voice.urls = [...clips.values()];
    if (!isAutomaticSkillVoice(voice)) return true;
    // The mobile tables can assign one recording to multiple IDs of the same skill.
    const key = JSON.stringify([voice.name, [...clips.keys()].sort()]);
    const existing = sharedSkills.get(key);
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases ?? []), voice.id, ...(voice.aliases ?? [])])];
      return false;
    }
    sharedSkills.set(key, voice);
    return true;
  });
}
