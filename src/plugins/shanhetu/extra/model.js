import { attributes } from '../../../shared/shanhe-attributes.js';

const numeric = value => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
  && Number.isFinite(Number(value)) ? Number(value) : null;

export function rows(config, name) {
  const fields = config?.root?.abbreviation;
  const names = new Map((Array.isArray(fields?.field) ? fields.field : Array.isArray(fields) ? fields : [])
    .map(field => [field.Short, field.Long]));
  const source = config?.Root?.[name];
  return (Array.isArray(source) ? source : []).map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [names.get(key) || key, value])));
}

const integerRules = new Map([
  [1, ['>', (a, b) => a > b, 1]],
  [2, ['≥', (a, b) => a >= b]],
  [4, ['<', (a, b) => a < b, -1]],
]);

function compare(label, current, target, rule, unit = '') {
  if (target == null || !rule) return { text: label, status: 'unknown' };
  const [symbol, test, thresholdOffset = 0] = rule;
  const text = `${label} ${symbol} ${target}${unit}`;
  if (current === null) return { text, status: 'unknown' };
  const met = test(current, target);
  const threshold = Number.isInteger(target) ? target + thresholdOffset : target;
  return { text, progress: `${current}/${threshold}${unit}`, status: met ? 'met' : 'miss' };
}

function attributeCondition(key, expression, attrs) {
  const [operator, target] = String(expression).split(',').map(numeric);
  const label = Object.hasOwn(attributes, key) ? attributes[key] : null;
  // The zero-reputation boundary includes zero for both ending branches.
  const rule = key === 'rep' && operator === 4 && target === 0
    ? ['≤', (a, b) => a <= b] : integerRules.get(operator);
  return compare(label || '其他属性', label ? numeric(attrs?.[key]) : null, target ?? null, rule);
}

export function endingConfig(config) {
  const endings = rows(config, 'ending').map(row => ({
    id: numeric(row.ID), name: String(row.endingName || '').trim(), priority: numeric(row.priority),
    seasons: String(row.SeasonList ?? '').split(/[;,]/).map(numeric).filter(id => id > 0),
    needs: Object.entries(row).filter(([key, value]) => key.startsWith('need_') && value != null && String(value).trim())
      .map(([key, value]) => [key.slice(5).toLowerCase(), value]),
    special: String(row.special ?? '').split(';').filter(part => part.trim()).map(part => part.split(',').map(numeric)),
  })).filter(row => row.id > 0 && row.name && row.seasons.length);
  return {
    endings,
    names: new Map(endings.map(row => [row.id, row.name])),
    chapters: rows(config, 'Chapter'),
    difficulties: [...rows(config, 'DifficultySelection'), ...rows(config, 'EXDifficultySelection')],
  };
}

function specialCondition(code, args, config, run) {
  const [value] = args;
  switch (code) {
    case 1:
      return { text: value === 1 ? '须通关' : value === 2 ? '须战败' : '结算结果条件',
        kind: value === 1 ? 'clear' : 'settlement', status: 'final' };
    case 4:
      return compare('累计获得铜钱', run.recordMoney, value, integerRules.get(1));
    case 6:
      return compare('通关用时', run.elapsedTime, value, integerRules.get(4), '秒');
    case 7:
      return compare('单次最高伤害', run.maxDamage, value, integerRules.get(1));
    case 10:
      return { text: value === 1 ? '败于士兵' : value === 2 ? '败于首领' : '战败对象条件', status: 'final' };
    case 11: {
      const difficulty = config.difficulties.find(row => Number(row.difID) === value
        && String(row.seasonID ?? '').split(/[;,]/).map(numeric).includes(run.season));
      return { ...compare(difficulty?.sdifname ? `难度 · ${difficulty.sdifname}` : '难度', run.difficulty, value,
        ['=', (a, b) => a === b]), kind: 'difficulty' };
    }
    case 12: {
      const chapter = config.chapters.find(row => Number(row.uniqueID) === value
        && String(row.seasonID ?? '').split(/[;,]/).map(numeric).includes(run.season));
      return { text: `终章 · ${chapter?.chaptername || chapter?.cityName || value}`, status: 'unknown' };
    }
    case 13:
      return { text: `前置结局 · ${args.map(id => config.names.get(id) || id).join('、')}`, status: 'unknown' };
    default:
      return { text: '其他条件待确认', status: 'unknown' };
  }
}

export function endingTendency(config, run) {
  return config.endings.filter(ending => ending.seasons.includes(run.season)).map(ending => {
    const conditions = [
      ...ending.needs.map(([key, expression]) => attributeCondition(key, expression, run.attrs)),
      ...ending.special.map(([code, ...args]) => specialCondition(code, args, config, run)),
    ];
    const loss = ending.name === '折戟沉沙';
    const requirements = conditions.filter(condition => condition.kind !== 'clear');
    const done = requirements.filter(condition => condition.status === 'met').length;
    const total = requirements.length;
    const wrongDifficulty = requirements.some(condition => condition.kind === 'difficulty' && condition.status === 'miss');
    const status = loss ? 'loss' : wrongDifficulty ? 'difficulty'
      : conditions.length && done === total ? 'met' : conditions.length ? 'progress' : 'unknown';
    return { id: ending.id, name: ending.name, priority: ending.priority ?? 0, conditions, status, done, total, loss };
  }).sort((a, b) => Number(a.loss) - Number(b.loss) || a.priority - b.priority || a.id - b.id);
}

export function readEndingRun(data) {
  const season = numeric(data?.seasonData?.seasonId);
  if (!(season > 0) || !data?.gameData) return null;
  const game = data.gameData, record = data.chapterData?.record;
  const difficulty = numeric(data.seasonData.difficulty);
  const attrs = Object.fromEntries(Object.keys(attributes).map(key => [key, numeric(game.attrInfo?.[key])]));
  return {
    season, attrs, difficulty: difficulty > 0 ? difficulty : null,
    recordMoney: numeric(record?.money), elapsedTime: numeric(record?.totalTime),
    maxDamage: numeric(game.maxDamage),
  };
}
