// SoundCfg puts 势魏延's first-form skills under skin 0, general 835.
const weiYan = new Map([
  [1396, ['壮誓', [1, 2]]], [1397, ['饮战', [1, 2, 3]]],
  [1398, ['忠傲', [1, 2, 3, 4, 5]]], [1399, ['狂骨', [1, 2]]],
]);
const zhouYuSkills = new Map([[1643, '炽沄'], [1644, '焰洄'], [1645, '焚涛'], [1646, '雄姿']]);
const zhouYuForms = new Map([
  ['91401', [[1, 2], [1, 2, 3, 4, 5, 6], [1, 2]]],
  // Both 雄姿 choices share the alternate SoundCfg scope.
  // The fire/water skill groups follow the two in-game dialogue sets.
  ['91401#1', [[4, 6], [7, 11, 12], [3, 4]]],
  ['91401#2', [[3, 5], [8, 9, 10], [5, 6]]],
]);

function skillRefs(groups, owner) {
  return [...groups].flatMap(([spellId, [name, clips]]) => clips.map(clip => ({
    kind: 'skill', spellId, name, path: `audio/skill/SKILL_${spellId}_${owner}_${clip}.mp3`,
  })));
}

function outcomes(stem) {
  return [
    { kind: 'death', name: '阵亡', path: `audio/dead/die${stem}.mp3` },
    { kind: 'victory', name: '胜利', path: `audio/victory/vict${stem}.mp3` },
  ];
}

export function mobileFormVoiceRefs(row) {
  if (row.id === '83501') return { refs: [...skillRefs(weiYan, '83501'), ...outcomes('_83501')] };
  const form = row.id === '91401' || row.sharedZhouYuVoices ? zhouYuForms.get(row.id) : undefined;
  if (!form) return { refs: [] };
  const groups = [...zhouYuSkills].map(([id, name], index) => [id, [name, form[index] ?? [1, 2, 3, 4]]]);
  const refs = [...skillRefs(groups, '914'), ...outcomes(row.id === '91401' ? '_914' : 'skin_91401#1')];
  return { refs, splitSpells: row.id === '91401' ? undefined : new Set(zhouYuSkills.keys()) };
}
