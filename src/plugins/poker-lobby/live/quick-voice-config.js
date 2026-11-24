const ids = (value, separator) => String(value ?? '').split(separator).map(Number).filter(Number.isSafeInteger);

export function pokerQuickVoiceConfig(source) {
  const config = source?.root ?? source;
  if (!Array.isArray(config?.heromusic) || !config.heromusic.length) return null;
  const aliases = config.abbreviation?.field ?? config.abbreviation;
  const fields = new Map((Array.isArray(aliases) ? aliases : [])
    .filter(row => row?.Long && row.Short).map(row => [row.Long, row.Short]));
  const get = (row, key) => row?.[key] ?? row?.[fields.get(key)];
  const byGeneral = new Map();
  for (const row of config.heromusic) {
    for (const general of ids(get(row, 'CardID'), ',')) {
      if (general <= 0) continue;
      if (!byGeneral.has(general)) byGeneral.set(general, []);
      byGeneral.get(general).push(row);
    }
  }

  return {
    skillLines(general, skill, skin, style, defaultSkin) {
      const rows = (byGeneral.get(general) ?? []).filter(row => ids(get(row, 'skillID'), ',').includes(skill));
      const find = (skinId, skinStyle) => rows.find(row =>
        (Number(get(row, 'SkinStyle')) || 0) === skinStyle
        && ids(get(row, 'skinID') ?? '-1', ';').includes(skinId));
      const worn = skin > 0 && (find(skin, style) || find(skin, 0));
      const row = worn || find(defaultSkin, 0) || find(-1, 0);
      if (!row) return [];
      const voiceSkin = worn ? skin : 0;
      const voiceStyle = worn ? Number(get(row, 'SkinStyle')) || 0 : 0;
      const numbers = [1, 2, 3, 4, 5, 6];
      const clips = numbers.map(index => get(row, `resources${index}`)).filter(Boolean);
      const words = numbers.map(index => get(row, `ResourcesWord${index}`)).filter(Boolean);
      return words.flatMap((word, index) => typeof word === 'string' && clips[index] ? [{
        id: `${general}_${voiceSkin}_${skill}_${voiceStyle};${index}`,
        word: word.replaceAll('|', ''),
      }] : []);
    },
  };
}
