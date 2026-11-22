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

export const FORM_CONVERSION_RULE = ['conversion', '转换技切换阴阳'];
export const FORM_CONVERSION_DIRECTIONS = [['yang', '阳 → 阴'], ['yin', '阴 → 阳']];
export const CARD_SKILL_DETAILS = { includeDerived: true, includeDetails: true };
export const CUSTOM_FORM_RULE_LIMIT = 6;
const SEAT_CONVERSION_STATE = 251;

function conversionPhase(value) {
  return value === 1 ? 'yang' : value === 2 ? 'yin' : null;
}

export function nativeConversionSkill(target, id) {
  const skill = read(() => target.general.GetSkill(id));
  return read(() => skill.IsSwitchSkill) === true ? skill : null;
}

export function nativeConversionPhase(skill) {
  if (read(() => skill.switchValue) === 0) return null;
  const second = read(() => skill.IsSecondState);
  return second === true ? 'yin' : second === false ? 'yang' : null;
}

export function nativeConversionUpdate(seat) {
  // UPDATE_SWITCH_SKILL carries no arguments. The client writes the skill ID
  // and its phase to DATA_SWITCH before emitting the event.
  const state = read(() => seat.GetSeatState(SEAT_CONVERSION_STATE));
  const id = read(() => state.StateSkillId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const skill = read(() => seat.GetGeneralSkill(id));
  return skill ? { id, skill, phase: conversionPhase(read(() => state.Value)) } : null;
}

const cycleTransitions = count => Array.from({ length: count }, (_, i) => ({ from: i + 1, to: (i + 1) % count + 1 }));
const edgeKey = ({ from, to }) => `${from}:${to}`;

export function defaultCrossFormRules(skills, target) {
  const rules = [];
  const conversions = new Set();
  for (const { id: skill, awakening, conversion } of skills ?? []) {
    if (awakening) rules.push({ from: 1, to: 2, kind: 'awakening', skill });
    if (conversion) conversions.add(skill);
  }
  // The live card already has its innate skills before the config tables load.
  // Its current skill list can also contain temporary skills, so use the printed IDs.
  const printed = read(() => target.general.cardInfo.Skills);
  if (Array.isArray(printed)) {
    for (const id of printed) {
      if (Number.isSafeInteger(id) && id > 0 && nativeConversionSkill(target, id)) conversions.add(id);
    }
  }
  for (const skill of conversions) {
    rules.push(
      { from: 1, to: 2, kind: 'conversion', phase: 'yang', skill },
      { from: 2, to: 1, kind: 'conversion', phase: 'yin', skill },
    );
  }
  return rules;
}

function normalizeCondition(rule) {
  if (rule?.kind === 'none') return { kind: 'none' };
  if (rule?.kind === 'hp' && FORM_HP_COMPARE.some(([id]) => id === rule.compare) &&
      Number.isInteger(rule.hp) && rule.hp >= 0 && rule.hp <= 999) {
    return { kind: 'hp', compare: rule.compare, hp: rule.hp };
  }
  if (rule?.kind === 'conversion') {
    const phase = rule.phase ?? rule.from;
    if (FORM_CONVERSION_DIRECTIONS.some(([from]) => from === phase) && Number.isSafeInteger(rule.skill) && rule.skill > 0) {
      return { kind: 'conversion', from: phase, skill: rule.skill };
    }
  }
  if (['once', 'every', 'any', 'all'].includes(rule?.kind)) {
    const combination = rule.kind === 'any' || rule.kind === 'all';
    if (!Array.isArray(rule.skills) || rule.skills.length !== (combination ? 2 : 1) ||
        new Set(rule.skills).size !== rule.skills.length || rule.skills.some(id => !Number.isSafeInteger(id) || id <= 0)) return null;
    const times = combination ? 1 : rule.times;
    if (Number.isInteger(times) && times >= 1 && times <= 999) return { kind: rule.kind, skills: [...rule.skills], times };
  }
  return null;
}

export function normalizeFormRule(input, count = 2, transitions, { customTransitions = false } = {}) {
  if (input?.mode === 'manual') return { mode: 'manual' };
  if (input?.mode !== 'custom' || !Array.isArray(input.rules)) return null;
  const tagged = input.rules.some(rule => typeof rule?.from === 'number' || rule?.to !== undefined);
  if (!customTransitions && transitions === undefined) {
    if (tagged || input.rules.length !== count) return null;
    const rules = input.rules.map(normalizeCondition);
    return rules.every(Boolean) ? { mode: 'custom', rules } : null;
  }
  if (customTransitions ? input.rules.length > CUSTOM_FORM_RULE_LIMIT : !transitions.length) return null;
  const allowed = new Set((transitions ?? []).map(edgeKey));
  const saved = new Map();
  // The old ordered rules described a cycle. Restore only edges that still exist.
  if (!tagged && input.rules.length !== count && !(customTransitions && !input.rules.length)) return null;
  const legacy = !tagged && input.rules.length ? cycleTransitions(count) : null;
  for (const [i, rule] of input.rules.entries()) {
    const edge = legacy?.[i] ?? rule;
    if (!edge || !Number.isSafeInteger(edge.from) || !Number.isSafeInteger(edge.to) ||
        edge.from < 1 || edge.to < 1 || edge.from > count || edge.to > count || edge.from === edge.to) return null;
    const key = edgeKey(edge);
    if ((!customTransitions || legacy) && !allowed.has(key)) continue;
    const off = customTransitions && (rule?.enabled === false || rule?.kind === 'off');
    const condition = normalizeCondition(rule) ?? (off ? { kind: 'none' } : null);
    if (!condition || saved.has(key)) return null;
    const { from, to } = edge;
    const record = condition.kind === 'conversion'
      ? { from, to, kind: condition.kind, phase: condition.from, skill: condition.skill }
      : { from, to, ...condition };
    if (off) record.enabled = false;
    saved.set(key, record);
  }
  const rules = customTransitions && !legacy ? [...saved.values()] :
    (transitions ?? []).map(edge => saved.get(edgeKey(edge)) ?? { ...edge, kind: 'none' });
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
export function createFormProgress({ form = 1, count = 2, transitions, customTransitions = false, config, target, getSkillCount,
  getCardSkillIds, getConversionSkillIds, official, defaultRules = [] }) {
  let current = form, lastOfficial = form, activeRules;
  const settings = transitions === undefined && !customTransitions ? config :
    normalizeFormRule(config, count, transitions, { customTransitions });
  const rules = settings ? settings.rules ?? [] : defaultRules;
  const defaultEdges = transitions ?? (customTransitions ? [] : cycleTransitions(count));
  const useRuleEdges = (customTransitions && settings?.mode === 'custom') || (!settings && defaultRules.length > 0);
  const edges = useRuleEdges ? rules : defaultEdges;
  const exits = new Map();
  for (const [index, { from, to, enabled }] of edges.entries()) {
    if (enabled === false) continue;
    if (!exits.has(from)) exits.set(from, []);
    exits.get(from).push({ to, condition: rules[index] });
  }
  const conversions = new Map();
  const conversionSkills = new Set(rules.filter(rule => rule.kind === 'conversion' && rule.enabled !== false).map(rule => rule.skill));
  const hp = () => read(() => target.seat.Hp);
  const forms = Array.from({ length: count }, (_, index) => index + 1);
  const destinations = () => forms.filter(form => form !== current);
  function rebaseConversion() {
    for (const id of conversionSkills) {
      const skill = nativeConversionSkill(target, id);
      if (skill && conversions.get(id)?.skill !== skill) {
        conversions.set(id, { skill, phase: nativeConversionPhase(skill) });
      } else if (!skill) conversions.delete(id);
    }
  }
  function enter(next) {
    current = next;
    activeRules = (exits.get(next) ?? []).filter(({ condition }) => condition && condition.kind !== 'none').map(({ to, condition }) => ({
      to, condition, entryCounts: condition.skills?.map(getSkillCount),
      activeHp: condition.kind === 'hp' && hpMatches(condition, hp()),
    }));
  }
  function advance(to) {
    const reachable = destinations();
    const next = to === undefined && reachable.length === 1 ? reachable[0] : to;
    if (reachable.includes(next)) enter(next);
    return current;
  }
  enter(form);
  rebaseConversion();
  const progress = {
    get current() { return current; },
    count,
    hasConversion: conversionSkills.size > 0,
    destinations,
    advance,
    rebaseConversion,
    update({ skill, initial = false, conversion } = {}) {
      if (conversion) {
        const { id, skill: nativeSkill, phase } = conversion;
        if (!conversionSkills.has(id) || nativeConversionSkill(target, id) !== nativeSkill) return current;
        const previous = conversions.get(id);
        conversions.set(id, { skill: nativeSkill, phase });
        // Default rules already come from the card. Saved custom rules may be stale.
        if (phase && previous?.skill === nativeSkill && phase !== previous.phase &&
            (!settings || getConversionSkillIds?.()?.has(id))) {
          const route = activeRules.find(({ condition }) => condition.kind === 'conversion' && condition.skill === id &&
            previous.phase === (condition.phase ?? condition.from));
          if (route) enter(route.to);
        }
        return current;
      }
      if (!settings && official) {
        const next = official(lastOfficial);
        if (next !== lastOfficial) {
          const routes = exits.get(current) ?? [];
          if (official.repeat?.()) {
            if (routes.length === 1) enter(routes[0].to);
          } else if (transitions === undefined && !customTransitions || routes.some(({ to }) => to === next)) enter(next);
          lastOfficial = next;
        }
        return current;
      }
      const route = activeRules.find(state => {
        const { condition, entryCounts } = state;
        if (condition.kind === 'hp') {
          const matches = hpMatches(condition, hp());
          const crossed = matches && (initial || !state.activeHp);
          state.activeHp = matches;
          return crossed;
        }
        if (condition.kind === 'awakening') return condition.skill === skill;
        if (!condition.skills?.includes(skill)) return false;
        const cardSkills = getCardSkillIds();
        // Saved rules from earlier versions can reference another general.
        if (!cardSkills || !condition.skills.every(id => cardSkills.has(id))) return false;
        if (condition.kind === 'once') return getSkillCount(skill) === condition.times;
        const counts = condition.skills.map((id, i) => getSkillCount(id) - entryCounts[i]);
        return condition.kind === 'all' ? counts.every(value => value > 0) : counts.some(value => value >= condition.times);
      });
      if (route) enter(route.to);
      return current;
    },
    setForm: enter,
  };
  return progress;
}
