import { read } from './native-model.js';

export const FORM_RULE_TYPES = [
  ['none', '仅手动'],
  ['hp', '体力达到条件'],
  ['every', '每 N 次发动技能'],
  ['once', '第 N 次发动技能'],
  ['any', '发动任一技能'],
  ['all', '发动全部技能'],
];
export const FORM_HP_COMPARE = [
  ['lt', '低于'], ['lte', '不高于'], ['gt', '高于'], ['gte', '不少于'],
];

export function normalizeFormRule(input) {
  if (input?.mode === 'manual') return { mode: 'manual' };
  if (input?.mode !== 'custom' || !Array.isArray(input.rules) || input.rules.length !== 2) return null;
  const rules = [];
  for (const rule of input.rules) {
    if (rule?.kind === 'none') rules.push({ kind: 'none' });
    else if (rule?.kind === 'hp' && FORM_HP_COMPARE.some(([id]) => id === rule.compare) &&
        Number.isInteger(rule.hp) && rule.hp >= 0 && rule.hp <= 999) {
      rules.push({ kind: 'hp', compare: rule.compare, hp: rule.hp });
    } else if (['once', 'every', 'any', 'all'].includes(rule?.kind)) {
      const combination = rule.kind === 'any' || rule.kind === 'all';
      if (!Array.isArray(rule.skills) || rule.skills.length !== (combination ? 2 : 1) ||
          new Set(rule.skills).size !== rule.skills.length || rule.skills.some(id => !Number.isSafeInteger(id) || id <= 0)) return null;
      const times = combination ? 1 : rule.times;
      if (!Number.isInteger(times) || times < 1 || times > 999) return null;
      rules.push({ kind: rule.kind, skills: [...rule.skills], times });
    } else return null;
  }
  return { mode: 'custom', rules };
}

function hpMatches(rule, hp) {
  if (!Number.isFinite(hp)) return false;
  switch (rule.compare) {
    case 'lt': return hp < rule.hp;
    case 'lte': return hp <= rule.hp;
    case 'gt': return hp > rule.hp;
    case 'gte': return hp >= rule.hp;
    default: return false;
  }
}

// Track the actual form separately from the native form the client would pick.
// Entry snapshots discard conditions already satisfied by a manual switch.
export function createFormProgress({ form = 1, count = 2, config, target, getSkillCount, getCardSkillIds, official }) {
  let current = form, lastOfficial = form, entryCounts, activeHp;
  const hp = () => read(() => target.seat.Hp);
  const rule = () => config?.rules?.[current - 1];
  function enter(next) {
    current = next;
    entryCounts = rule()?.skills?.map(getSkillCount);
    activeHp = rule()?.kind === 'hp' && hpMatches(rule(), hp());
  }
  enter(form);
  const progress = {
    get current() { return current; },
    count,
    update({ skill, initial = false } = {}) {
      if (!config && official) {
        const next = official(lastOfficial);
        if (next !== lastOfficial) {
          current = official.repeat?.() ? current % count + 1 : next;
          lastOfficial = next;
        }
        return current;
      }
      const condition = rule();
      if (!condition) return current;
      let met = false;
      if (condition.kind === 'hp') {
        const matches = hpMatches(condition, hp());
        met = matches && (initial || !activeHp);
        activeHp = matches;
      } else if (condition.skills?.includes(skill)) {
        const cardSkills = getCardSkillIds();
        // Saved rules from earlier versions can reference another general.
        if (!cardSkills || !condition.skills.every(id => cardSkills.has(id))) return current;
        const counts = condition.skills.map((id, i) => getSkillCount(id) - entryCounts[i]);
        if (condition.kind === 'once') met = getSkillCount(skill) === condition.times;
        else if (condition.kind === 'all') met = counts.every(value => value > 0);
        else met = counts.some(value => value >= condition.times);
      }
      if (met) enter(current % count + 1);
      return current;
    },
    setForm: enter,
    advance() { enter(current % count + 1); return current; },
  };
  return progress;
}
