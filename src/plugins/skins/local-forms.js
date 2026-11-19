import { read } from './native-model.js';

const numberPattern = '(?:[0-9]{1,3}|[一二两三四五六七八九十]{1,3})';
const skillPattern = '[\\u3400-\\u9fffA-Za-z0-9·*()_-]{1,24}';
const bareSkillPattern = new RegExp('^' + skillPattern + '$', 'u');
const destination = '(?:切(?:换)?(?:到|为|至)?|转(?:换)?(?:到|为|至)?|为)\\s*(?:第\\s*)?' +
  '(?:形态\\s*(' + numberPattern + ')|(' + numberPattern + ')\\s*形态)';
const hpPattern = new RegExp('^(?:体力值?\\s*)?(小于|低于|不高于|大于|高于|不少于)\\s*(' +
  numberPattern + ')\\s*(?:血|点体力值?)(?:\\s*时)?\\s*' + destination + '$', 'u');
const stepPattern = new RegExp('(?:发动)?(' + skillPattern + '(?:[/&]' + skillPattern + ')*)\\s*' +
  destination + '(?:$|[\\s;。]+)', 'uy');
const switchPattern = new RegExp('^(?:(第|每)\\s*(' + numberPattern + ')\\s*次\\s*|(?:多次\\s*)?)发动\\s*(' +
  skillPattern + ')\\s*(?:转换|切换)形态$', 'u');
const awakeningPattern = new RegExp('^(' + skillPattern + ')觉醒前\\s*' + destination +
  '[\\s;。]+\\1觉醒后\\s*' + destination + '$', 'u');

function cleanCondition(value) {
  return typeof value === 'string' && value.length <= 700
    ? value.normalize('NFKC').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(?:font|span|b)\b[^>]*>/gi, '')
      .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/[「」『』【】“”]/g, '').trim()
    : '';
}

function readNumber(value) {
  if (/^[0-9]+$/.test(value)) return Number(value);
  const digit = char => '零一二三四五六七八九'.indexOf(char === '两' ? '二' : char);
  if (value.length === 1) return value === '十' ? 10 : digit(value);
  const match = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(value);
  return match ? (match[1] ? digit(match[1]) : 1) * 10 + (match[2] ? digit(match[2]) : 0) : NaN;
}

function parseCondition(text, count) {
  const valid = form => Number.isInteger(form) && form >= 1 && form <= count;
  const hp = hpPattern.exec(text);
  if (hp) {
    const threshold = readNumber(hp[2]), form = readNumber(hp[3] ?? hp[4]);
    if (valid(form) && form !== 1 && Number.isInteger(threshold) && threshold >= 0) return { kind: 'hp', compare: hp[1], threshold, form };
    return null;
  }
  const awakening = awakeningPattern.exec(text);
  if (awakening) {
    const before = readNumber(awakening[2] ?? awakening[3]), after = readNumber(awakening[4] ?? awakening[5]);
    return valid(before) && valid(after) && before !== after ? { kind: 'awakening', name: awakening[1], before, after } : null;
  }
  const shift = switchPattern.exec(text);
  if (shift && count === 2) {
    const times = shift[2] ? readNumber(shift[2]) : 1;
    if (!Number.isInteger(times) || times < 1) return null;
    const kind = shift[1] === '第' ? 'once' : text.startsWith('多次') ? 'classic' : 'switch';
    return { kind, name: shift[3], times };
  }
  if (count === 2 && text.includes('/') && text.split('/').every(name => bareSkillPattern.test(name))) {
    return { kind: 'switch', names: [...new Set(text.split('/'))], times: 1 };
  }

  // Match whole clauses. A recognized substring must not override a qualifier
  // whose semantics are unknown.
  const steps = [];
  stepPattern.lastIndex = 0;
  let end = 0;
  for (let match; (match = stepPattern.exec(text));) {
    const [, source, front, back] = match;
    const form = readNumber(front ?? back);
    if (!valid(form) || (source.includes('&') && source.includes('/'))) return null;
    const names = [...new Set(source.split(/[/&]/))];
    steps.push({ names, all: source.includes('&'), form });
    end = stepPattern.lastIndex;
  }
  if (steps.length && end === text.length) return { kind: 'steps', steps };
  // Older skins give only the triggering skill's name. The skill index must
  // confirm that this is a real skill before any match can change the form.
  return count === 2 && bareSkillPattern.test(text)
    ? { kind: 'switch', name: text, times: 1 } : null;
}

export function skinFormInfo(vo) {
  if (!read(() => vo.IsManyStateDyskin)) return null;
  const count = Number(read(() => vo.NewSkinJudge ?? vo.newSkinJudge));
  if (count !== 2 && count !== 3) return null;
  const text = cleanCondition(read(() => vo.ConMessage));
  return { count, text, rule: parseCondition(text, count) };
}

export function indexOfficialFormRules(config) {
  const rows = config?.generalskin?.items?.item;
  if (!Array.isArray(rows)) return null;
  const fields = new Map((config.root?.abbreviation?.field ?? []).map(row => [row.Long, row.Short]));
  const field = (row, key, short) => row[key] ?? row[fields.get(key) ?? short];
  const groups = new Map(), items = [];
  for (const row of rows) {
    if (Number(field(row, 'newSkinJudge', 'ab')) !== 2) continue;
    const { id, name, general, text } = {
      id: Number(field(row, 'skinID', 'a')), name: field(row, 'name', 'c'),
      general: Number(field(row, 'generalID', 'b')), text: cleanCondition(field(row, 'ConMessage', 'ad')),
    };
    if (id <= 0) continue;
    items.push({ id, name, text, general });
    if (name && parseCondition(text, 2)?.kind === 'hp') {
      if (!groups.has(name)) groups.set(name, new Set());
      groups.get(name).add(text);
    }
  }
  const awakenings = new Map();
  for (const row of config.generalskin.specialgeneral ?? []) {
    const text = cleanCondition(row.ConMessage);
    if (Number(row.modeJudge) === 1 && parseCondition(text, 2)?.kind === 'awakening') awakenings.set(Number(row.generalID), text);
  }
  const result = new Map();
  for (const { id, name, text, general } of items) {
    const hp = groups.get(name);
    const condition = text === '体力值变化' && hp?.size === 1 ? [...hp][0] : text || awakenings.get(general);
    if (condition) result.set(id, { count: 2, text: condition, rule: parseCondition(condition, 2) });
  }
  return result;
}

export function indexFormSkills(config) {
  const rows = config?.GameSpells?.spell;
  if (!Array.isArray(rows) || !rows.length) return null;
  const abbreviations = config.abbreviation?.field;
  const fields = new Map(Array.isArray(abbreviations) ? abbreviations.map(row => [row?.Long, row?.Short]) : []);
  const field = (row, name, fallback) => row[name] ?? row[fields.get(name) ?? fallback];
  const skills = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = Number(field(row, 'id', 'a'));
    const name = cleanCondition(field(row, 'name', 'c'));
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    const types = String(field(row, 'type', 'b') ?? '').split(',').map(Number);
    const awakening = [3, 4, 5, 6].every(type => types.includes(type));
    // A derived spell can also belong to another player. Infer an awakening
    // from the granted spell only where the description grants it to the hero.
    const granted = [];
    if (awakening) {
      const derives = String(field(row, 'DeriveSkills', 'm') ?? '').split(',').map(Number);
      const clauses = String(field(row, 'desc', 'o') ?? '').split(/[。；]/);
      for (const clause of clauses) {
        if (/(?:令|使|选择|其他角色|其)/.test(clause.split('获得')[0])) continue;
        const match = /(?:你|然后|，)[^：<>]{0,45}?获得[“「]?<font\s+href=['"](\d+)['"]/u.exec(clause);
        const skill = Number(match?.[1]);
        if (skill > 0 && derives.includes(skill)) granted.push(skill);
      }
    }
    const variants = skills.get(name) ?? [];
    variants.push({ id, awakening, granted });
    skills.set(name, variants);
  }
  return skills.size ? skills : null;
}

function matchingClassic(variants, target, forms, classicRows, skill) {
  if (!Array.isArray(classicRows)) return null;
  // Only reuse a classic rule when the selected skin describes the same
  // trigger. Sharing a general or a form count alone is insufficient.
  const sameCondition = value => cleanCondition(value).replace(/转换形态/g, '切换形态').replace(/\s/g, '');
  const rows = classicRows.filter(row => Number(row.generalID) === target.id && Number(row.conType) === 2 &&
    sameCondition(row.ConMessage) === sameCondition(forms.text));
  const steps = new Map();
  for (const row of rows) {
    const from = Number(row.modeJudge);
    if (from !== 1 && from !== 2) continue;
    if (!row.Typenums) continue;
    const match = /^(\d+),(\d+)$/.exec(row.Typenums);
    const to = Number(rows.find(other => other.imageID === row.next_mode)?.modeJudge);
    if (!match || (to !== 1 && to !== 2) || to === from || steps.has(from) ||
        !variants.some(entry => entry.id === Number(match[1])) || (skill && Number(match[1]) !== skill)) return null;
    const times = Number(match[2]);
    if (!Number.isSafeInteger(times) || times < 1 || times > 999) return null;
    steps.set(from, { skill: Number(match[1]), times });
  }
  const first = steps.get(1), reversal = steps.get(2);
  return first && (!reversal || reversal.skill === first.skill) ? { ...first, reverseAfter: reversal?.times } : null;
}

function skillProgress(name, data, target, uses) {
  const variants = data.skills?.get(name);
  if (!variants) return null;
  let count = 0, order = 0, awakened = false;
  for (const spell of variants) {
    const seen = uses?.get(spell.id);
    const own = seen || read(() => target.general.HasSkill(spell.id));
    const nativeCount = own ? Number(read(() => target.seat.GetSkillUseCountInGame(spell.id))) : 0;
    const used = Math.max(seen?.count ?? 0, Number.isSafeInteger(nativeCount) ? nativeCount : 0);
    awakened ||= spell.awakening && (used > 0 || spell.granted.some(id => read(() => target.general.HasSkill(id)) === true));
    count += used;
    order = Math.max(order, seen?.order ?? 0);
  }
  return { variants, count, order, awakened };
}

export function isRepeatingSkinRule(option, target, uses, data) {
  const forms = data.rules?.get(option.id) ?? option.forms;
  const rule = forms?.rule;
  if (!rule || !['classic', 'switch'].includes(rule.kind)) return false;
  if (rule.names) return true;
  const progress = skillProgress(rule.name, data, target, uses);
  if (!progress || progress.variants.some(spell => spell.awakening)) return false;
  if (rule.kind === 'classic' || rule.times === 1) {
    const recorded = progress.variants.find(spell => uses?.has(spell.id));
    const classic = matchingClassic(progress.variants, target, forms, data.classicRows, recorded?.id);
    if (classic) return classic.reverseAfter === classic.times;
  }
  return rule.kind === 'switch';
}

export function localSkinForm(option, native, target, uses, data, previous = 1) {
  const { id, forms } = option;
  if (!forms) return id === native.id ? native.form : 1;
  const nativeForm = id === native.id && native.form >= 1 && native.form <= forms.count ? native.form : null;
  if (native.dynamic && nativeForm !== null) return nativeForm;
  const fallback = nativeForm ?? previous;
  const rule = forms.rule ?? data.rules?.get(id)?.rule;
  if (!rule) return fallback;
  if (rule.kind === 'hp') {
    const hp = read(() => target.seat.Hp);
    if (!Number.isFinite(hp)) return fallback;
    const tests = { 小于: hp < rule.threshold, 低于: hp < rule.threshold, 不高于: hp <= rule.threshold,
      大于: hp > rule.threshold, 高于: hp > rule.threshold, 不少于: hp >= rule.threshold };
    return tests[rule.compare] ? rule.form : 1;
  }
  if (rule.kind === 'steps') {
    let best;
    for (const step of rule.steps) {
      const progress = step.names.map(name => skillProgress(name, data, target, uses));
      if (progress.some(entry => !entry)) return fallback;
      const activated = progress.filter(entry => entry.count || entry.awakened);
      if (!activated.length || (step.all && activated.length !== progress.length)) continue;
      const order = Math.max(...activated.map(entry => entry.order));
      const specificity = step.all ? step.names.length : 1;
      if (!best || order > best.order || (order === best.order && specificity > best.specificity)) {
        best = { order, specificity, form: step.form };
      } else if (order === 0 && best.order === 0 && specificity === best.specificity && step.form !== best.form) {
        // A snapshot can contain multiple used skills without their order.
        best.form = fallback;
      }
    }
    return best?.form ?? fallback;
  }
  if (rule.names) {
    const skills = rule.names.map(name => skillProgress(name, data, target, uses));
    const count = skills.reduce((sum, skill) => sum + (skill?.count ?? 0), 0);
    return count ? 1 + count % 2 : fallback;
  }
  const progress = skillProgress(rule.name, data, target, uses);
  if (!progress) return fallback;
  if (rule.kind === 'awakening') return progress.awakened || progress.count ? rule.after : rule.before;
  if (rule.kind === 'once') return progress.count >= rule.times ? 2 : fallback;
  if (progress.awakened) return 2;
  if (rule.kind === 'classic' || rule.times === 1) {
    const recorded = progress.variants.find(spell => uses?.has(spell.id));
    const classic = matchingClassic(progress.variants, target, forms, data.classicRows, recorded?.id);
    if (classic) {
      if (!progress.count) return fallback;
      const count = uses?.get(classic.skill)?.count ?? progress.count;
      return classic.reverseAfter ? (count % (classic.times + classic.reverseAfter) >= classic.times ? 2 : 1) : (count >= classic.times ? 2 : 1);
    }
    if (rule.kind === 'classic') return fallback;
  }
  return progress.count ? 1 + (Math.floor(progress.count / rule.times) % 2) : fallback;
}
