import { rows } from './model.js';

export const scoreItemLabels = { tactics: '战法', skills: '技能', cards: '卡牌', equipment: '装备' };
export const ROGUE_REBIRTH_SKILL = 3324;

// The author's corrected coefficients, in tenths. Integer arithmetic keeps both floors exact.
const difficultyBase = [10, 20, 40, 80, 120];
const difficultyStep = [1, 2, 4, 8, 10];
// Battle bases and the boss completion bonus follow the player's tested
// three-chapter route. The settlement table has no season key.
const normalBattleBase = [30, 24, 30];
const bossCompletion = [1500, 1500, 4370];
const swiftMarchTactics = [2024, 2142];
const clearedChapterMonthLimits = [4, 6];
const uint = value => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 0xffffffff ? number : null;
};
const itemIds = value => Array.isArray(value) && value.length <= 2048 ? value.map(uint) : null;
const forSeason = (row, season) => String(row.seasonID ?? '').split(/[;,]/).some(id => Number(id) === season);
const findChapter = (config, season, id) => config.chapters.find(row => uint(row.uniqueID) === id && forSeason(row, season));

export function scoreConfig(config) {
  const items = new Map();
  for (const [table, type] of [['Tactics', 'tactics'], ['Spell', 'skills'], ['Card', 'cards']]) {
    for (const row of rows(config, table)) {
      const id = uint(row[table === 'Tactics' ? 'plot' : 'id']);
      const price = uint(row.money);
      if (id > 0) items.set(id, { type: type === 'cards' && Number(row.isequip) > 0 ? 'equipment' : type,
        // Sets and other special entries use 9999; the estimation model gives them no reliable price.
        price: price === 9999 ? null : price });
    }
  }
  const mutations = new Map(rows(config, 'seed').map(row => {
    const percent = String(row.desc1 ?? '').match(/战绩分\s*[+＋]\s*(\d+)\s*%/);
    const bonus = uint(percent?.[1]);
    return [uint(row.seed), bonus <= 100 ? bonus : null];
  }));
  return {
    items, mutations, normal: rows(config, 'DifficultySelection'), desperate: rows(config, 'EXDifficultySelection'),
    chapters: rows(config, 'Chapter'), chapterTiming: rows(config, 'ChapterCS'),
    fights: new Map(rows(config, 'Fight').map(row => [uint(row.fightID), row])),
  };
}

export function readScoreRun(data) {
  const game = data?.gameData, seasonData = data?.seasonData;
  const season = uint(seasonData?.seasonId), difficulty = uint(seasonData?.difficulty);
  if (!(season > 0 && difficulty > 0 && uint(game?.myGeneral?.uGeneralId) > 0)) return null;
  const chapter = data.chapterData, record = chapter?.record;
  const log = uint(seasonData.uniqueLogId) || String(seasonData.lastEnterTime ?? '');
  const clearedChapters = Array.isArray(game.passChapter) ? game.passChapter.length : 0;
  const skillUses = game.myGeneral.spellUseInfo;
  const rebirthUses = Array.isArray(skillUses)
    ? uint(skillUses.find(row => uint(row?.uSpellId) === ROGUE_REBIRTH_SKILL)?.uTimes) : null;
  return {
    season, difficulty, battle: uint(record?.fightScore),
    key: JSON.stringify([season, difficulty, uint(seasonData.roundId), log]),
    fightCount: Array.isArray(record?.fights) ? record.fights.length : record ? 0 : null,
    clearedChapters,
    months: chapter && !clearedChapters ? uint(chapter.accday ?? 0) : uint(chapter?.accday),
    chapterMonth: uint(chapter?.day),
    rebirthUsed: rebirthUses === null && uint(game.dyingCnt) > 0 ? null : rebirthUses > 0,
    remakes: uint(game.remakeCnt) ?? 0,
    recordedItems: itemIds(record?.items), heldItems: itemIds(game.itemId === undefined ? [] : game.itemId),
    mutation: game.seedData ? uint(game.seedData.seedId ?? 0) : null,
  };
}

export function readScoreBattle(data, nativeFightId) {
  const chapter = data?.chapterData, event = chapter?.curEventData;
  const id = uint(nativeFightId) || (uint(event?.eventType) === 3 ? uint(event.eventId) : null);
  const location = uint(chapter?.curLocation);
  if (!(id > 0 && location > 0) || uint(event?.eventType) === 4) return null;
  const node = Array.isArray(chapter.locations) && chapter.locations.find(row => uint(row?.location) === location);
  // The game also uses this scene for fights triggered by an encounter.
  if (uint(node?.event) !== id) return null;
  return { id, location, chapterId: uint(chapter.chapterId), day: uint(chapter.day) };
}

export function createBossMonthTracker() {
  let chapter = null;
  let adventure = null;

  function openAdventure(event) {
    const id = uint(event?.eventId);
    if (!chapter || uint(event?.eventType) !== 2 || !(id > 0) || adventure?.id === id) return;
    adventure = { id, day: chapter.day };
  }

  function finishAdventure(event) {
    const id = uint(event?.eventId);
    if (!chapter || uint(event?.eventType) !== 2 || !(id > 0) || uint(event.result ?? 0) !== 0) return;
    if (adventure?.id === id) {
      if (adventure.day === chapter.bossMonth) chapter.status = 'missed';
    } else if (chapter.day === chapter.bossMonth && chapter.status === 'eligible') {
      // The selection succeeded, but its opening month was not observed.
      chapter.status = 'unknown';
    }
  }

  function observe(config, run, data, onMap) {
    const id = uint(data?.chapterId), day = uint(data?.day ?? 0);
    if (!run || !(id > 0) || day === null) {
      chapter = adventure = null;
      return;
    }
    if (!chapter || chapter.key !== run.key || chapter.id !== id || day < chapter.day) {
      adventure = null;
      chapter = { key: run.key, id, day: null, bossMonth: null, bossLocation: null, status: 'unknown' };
    }
    if (config && chapter.bossMonth === null) {
      const row = findChapter(config, run.season, id);
      const timing = row && config.chapterTiming.find(entry => uint(entry.chapter) === uint(row.chapter) && forSeason(entry, run.season));
      chapter.bossMonth = uint(timing?.apptime) || 0;
      chapter.bossLocation = uint(row?.bosslocation);
    }
    if (chapter.bossMonth > 0 && day === chapter.bossMonth && chapter.day === day - 1) chapter.status = 'eligible';
    chapter.day = day;
    const event = data.curEventData;
    if (onMap && uint(event?.eventType) === 2) {
      if (event.isSelect && adventure?.id === uint(event.eventId)) finishAdventure(event);
      if (!event.isSelect) openAdventure(event);
    }
  }

  function finishBattle(run, fight) {
    if (fight && chapter?.key === run.key && chapter.id === fight.chapterId && fight.day === chapter.bossMonth
      && fight.location !== chapter.bossLocation) chapter.status = 'missed';
  }

  function statusFor(run, fight) {
    return chapter?.key === run.key && chapter.id === fight.chapterId && chapter.bossMonth > 0
      && fight.day === chapter.bossMonth && fight.location === chapter.bossLocation ? chapter.status : null;
  }

  return { observe, openAdventure, finishAdventure, finishBattle, statusFor };
}

export function estimateBattlePoints(config, run, fight, round, bossMonthStatus) {
  const chapter = findChapter(config, run.season, fight.chapterId);
  const index = uint(chapter?.chapter) - 1;
  const entry = config.fights.get(fight.id);
  if (!entry || normalBattleBase[index] === undefined) return null;
  const boss = uint(chapter.bosslocation) === fight.location;
  const base = normalBattleBase[index] * (boss ? 4 : Number(entry.iselite) === 1 ? 2 : 1);
  const points = round > 4 ? base : Math.floor(base * 108 / 10);
  if (!boss) return points;
  return points + bossCompletion[index] + (bossMonthStatus === 'eligible' ? 1500 : 0);
}

export function estimateLoss(run) {
  const chapter = run.clearedChapters + 1;
  if (run.months === null || chapter < 1 || chapter > 3) return null;
  let months = run.months;
  const swiftMarch = swiftMarchTactics.some(id => run.heldItems?.includes(id) || run.recordedItems?.includes(id));
  if (swiftMarch && chapter > 1) {
    if (run.chapterMonth === null || run.chapterMonth > months) return null;
    const limit = clearedChapterMonthLimits.slice(0, chapter - 1).reduce((sum, count) => sum + count, 0);
    months = Math.min(months, run.chapterMonth + limit);
  }
  const monthlyRate = chapter === 3 ? 120 : 150;
  const points = chapter === 3 ? months * monthlyRate - 100 : Math.max(500, months * monthlyRate - 100);
  return { points, months, chapter, monthlyRate };
}

export function estimateScore(config, run, projectedBattle = null) {
  const normal = config.normal.find(row => Number(row.difID) === run.difficulty && forSeason(row, run.season));
  const desperate = config.desperate.find(row => Number(row.difID) === run.difficulty && forSeason(row, run.season));
  const tier = uint(normal?.bdif), step = uint(normal?.sdif) ?? (run.difficulty - 1) % 5 + 1;
  const rebirthPenalty = run.rebirthUsed === null ? null : run.rebirthUsed ? 500 : 0;
  const rate = desperate ? 10 : tier >= 1 && tier <= 5 && step >= 1 && step <= 5
    ? difficultyBase[tier - 1] + difficultyStep[tier - 1] * (step - 1) : null;
  const mutation = run.mutation === 0 || (run.mutation === null && normal && tier < 4)
    ? 0 : config.mutations.get(run.mutation) ?? null;
  const parts = Object.fromEntries(Object.keys(scoreItemLabels).map(type => [type, { points: 0, prices: {} }]));
  const hasItems = !!(run.recordedItems || run.heldItems);
  let unknownItems = 0;
  for (const id of new Set([...(run.recordedItems || []), ...(run.heldItems || [])])) {
    const item = config.items.get(id);
    if (item?.price == null) { unknownItems++; continue; }
    const part = parts[item.type];
    part.points += item.price;
    part.prices[item.price] = (part.prices[item.price] || 0) + 1;
  }
  const items = hasItems ? Object.values(parts).reduce((sum, part) => sum + part.points, 0) : null;
  const battle = run.battle === null ? null : run.battle + (projectedBattle ?? 0);
  const scaled = battle !== null && items !== null && rate !== null && rebirthPenalty !== null
    ? Math.floor((battle + items - rebirthPenalty) * rate / 10) : null;
  const withMutation = scaled !== null && mutation !== null ? Math.floor(scaled * (100 + mutation) / 100) : null;
  const total = withMutation === null ? null : Math.max(0, withMutation);
  const difficulty = String((desperate || normal)?.sdifname || '');
  return { battle, projectedBattle, parts, items, rate, difficulty, mutation, scaled, total, unknownItems,
    loss: estimateLoss(run), rebirthPenalty, clamped: withMutation < 0,
    mutationPoints: withMutation === null ? null : withMutation - scaled,
    hasHistory: run.recordedItems !== null, desperate: !!desperate,
    partial: !run.recordedItems || unknownItems > 0 || !!desperate };
}
