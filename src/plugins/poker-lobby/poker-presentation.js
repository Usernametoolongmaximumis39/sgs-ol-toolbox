import { generalNames } from '../../shared/info-runtime.js';

export function pokerDisplayNames(game, seats, getNativeSkill) {
  const players = new Map(seats.map(seat => [seat.id, seat.name || `${seat.id + 1}号座`]));
  const generals = generalNames(game.getConfigData?.('character'));
  const skills = new Map();

  function addSkills(data) {
    const config = data?.root || data;
    const keys = new Map((config?.abbreviation?.field || []).map(row => [row.Long, row.Short]));
    for (const row of config?.GameSpells?.spellPuKe || []) {
      const field = name => row[name] ?? row[keys.get(name)];
      const id = Number(field('id'));
      const name = field('H5_name') || field('name');
      if (id > 0 && name) skills.set(id, { name: String(name), className: field('Class') || 'PokerSkill', passive: Number(field('type')) === 2 });
    }
  }

  function skillInfo(id) {
    const existing = skills.get(id);
    if (existing) return existing;
    const skill = getNativeSkill?.(id);
    if (!skill) return null;
    const info = { name: skill.Name, className: skill.constructor };
    skills.set(id, info);
    return info;
  }

  addSkills(game.getConfigData?.('cha_spell'));
  return {
    seat: id => players.get(id) || '未知座位',
    general: id => id ? generals[id] || `武将 ${id}` : '待选将',
    skill: id => skillInfo(id)?.name || `技能 ${id}`,
    skillInfo,
    loadSkills(signal) {
      if (skills.size || !game.loadConfigData) return;
      return game.loadConfigData('cha_spell', { signal }).then(data => {
        if (!signal.aborted) addSkills(data);
      }).catch(() => {});
    },
  };
}
