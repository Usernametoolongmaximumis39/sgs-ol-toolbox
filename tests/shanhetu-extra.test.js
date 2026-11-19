import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConfig, buildView, nodePreview } from '../src/plugins/shanhetu/model.js';
import { projectSnapshot } from '../src/plugins/shanhetu/native.js';
import { labelLines, optionTokens } from '../src/plugins/shanhetu/presentation.js';
import { endingConfig, endingTendency, readEndingRun } from '../src/plugins/shanhetu-beta/model.js';
import { createBossMonthTracker, estimateBattlePoints, estimateLoss, estimateScore, readScoreBattle, readScoreRun, scoreConfig } from '../src/plugins/shanhetu-beta/score.js';
import { optionImpact } from '../src/shared/shanhe-impact.js';
import { fixtureConfig, fixtureData, fixtureDesperateScore } from './fixtures/shanhetu.js';
import { schoolMatcher } from '../src/plugins/shanhetu/school-progress.js';

test('score preview uses unique historical and held items, their base prices and both floors', () => {
  const { hd_roguelike } = fixtureConfig(), { Root } = hd_roguelike, data = fixtureData();
  Root.DifficultySelection.push({ seasonID: '6', difID: 17, bdif: 4, sdif: 2, sdifname: '噩梦2' });
  Root.seed = [{ seed: 5026, desc1: '通关宝箱+3,战绩分+20%' }];
  Root.Card.push({ id: 4002, isequip: 3, money: 100 });
  data.seasonData.difficulty = 17;
  data.gameData.seedData.seedId = 5026;
  data.chapterData.record = { fightScore: 951, items: [2100, 3001, 4001, 4002, 3001] };
  const score = estimateScore(scoreConfig(hd_roguelike), readScoreRun(data));
  assert.deepEqual(Object.fromEntries(Object.entries(score.parts).map(([type, part]) => [type, part.points])),
    { tactics: 500, skills: 100, cards: 50, equipment: 100 });
  assert.deepEqual([score.battle, score.items, score.rate, score.mutation, score.scaled, score.total, score.partial],
    [951, 750, 88, 20, 14968, 17961, false]);
});

test('score preview uses the corrected inferno rate and keeps missing amounts distinct from zero', () => {
  const { hd_roguelike } = fixtureConfig(), { Root } = hd_roguelike, data = fixtureData();
  Root.DifficultySelection.push({ seasonID: '6', difID: 25, bdif: 5, sdif: 5, sdifname: '炼狱5' });
  Root.Tactics.push({ plot: 999, money: 9999 });
  data.seasonData.difficulty = 25;
  data.gameData.itemId = [2101, 999, 888];
  data.chapterData.record = { fightScore: 0 };
  const config = scoreConfig(hd_roguelike), current = () => estimateScore(config, readScoreRun(data));
  let score = current();
  assert.deepEqual([score.rate, score.battle, score.total, score.unknownItems, score.partial], [160, 0, 0, 2, true]);
  assert.deepEqual(score.parts.tactics.prices, { 0: 1 });
  data.gameData.seedData.seedId = 65000;
  assert.equal(current().total, null);
  data.seasonData.difficulty = 103;
  delete data.chapterData.record;
  assert.deepEqual([current().rate, current().battle, current().total, current().desperate], [10, null, null, true]);
  data.gameData.myGeneral = null;
  assert.equal(readScoreRun(data), null);
});

test('score preview reproduces the author’s 68,289-point mid-tier example', () => {
  const { hd_roguelike } = fixtureConfig(), { Root } = hd_roguelike, data = fixtureData();
  Root.DifficultySelection.push({ seasonID: '6', difID: 8, bdif: 2, sdif: 3, sdifname: '中等3' });
  Root.Tactics = Array.from({ length: 19 }, (_, i) => ({ plot: 2110 + i, money: 300 }));
  const ids = Root.Tactics.map(row => row.plot);
  Root.Spell = [1000, 1000, 600, 600].map((money, i) => ({ id: 3010 + i, money }));
  Root.Card = [300, 300, 300, 400, 100].map((money, i) => ({ id: 4010 + i, money, isequip: Number(i > 2) }));
  data.seasonData.difficulty = 8;
  data.gameData.itemId = [];
  data.chapterData.record = { fightScore: 18154, items: [...ids, ...Root.Spell.map(row => row.id), ...Root.Card.map(row => row.id)] };
  const score = estimateScore(scoreConfig(hd_roguelike), readScoreRun(data));
  assert.deepEqual([score.items, score.rate, score.total], [10300, 24, 68289]);
});

test('Desperate 1 battle and item scores exclude the separate defeat estimate', () => {
  const { samples, ...Root } = fixtureDesperateScore();
  Root.EXDifficultySelection.push({ seasonID: '5', difID: 102, sdif: 7 }, { seasonID: '6', difID: 101, sdif: 6 });
  const config = scoreConfig({ Root }), data = fixtureData();
  data.gameData.myGeneral.orgSpell = [295, 296, 3324];
  data.seasonData.seasonId = 5;
  const current = () => estimateScore(config, readScoreRun(data));
  for (const difficulty of [101, 111, 121]) {
    data.seasonData.difficulty = difficulty;
    for (const { items, battle, itemScore } of samples) {
      data.gameData.itemId = items;
      data.chapterData.record = { fightScore: battle };
      const estimate = current();
      assert.deepEqual([estimate.battle, estimate.items, estimate.rate, estimate.total, estimate.loss.points],
        [battle, itemScore, 10, battle + itemScore, 500]);
    }
  }
  delete data.gameData.itemId;
  data.chapterData.record = { fightScore: 0 };
  data.seasonData.difficulty = 102;
  assert.equal(current().total, 0);
  Object.assign(data.seasonData, { seasonId: 6, difficulty: 101 });
  assert.equal(current().total, 0);
});

test('Normal 1 shows independent battle-and-item and defeat estimates', () => {
  const { hd_roguelike } = fixtureConfig(), { Root } = hd_roguelike, data = fixtureData();
  Root.DifficultySelection.push({ seasonID: '5', difID: 1, bdif: 1, sdif: 1, sdifname: '普通1' });
  Root.DifficultySelection.push({ seasonID: '5', difID: 2, bdif: 1, sdif: 2, sdifname: '普通2' });
  Root.Tactics.push({ plot: 2228, plotname: '奋进', money: 200 });
  Root.Chapter.push({ seasonID: '5', uniqueID: 53, chapter: 3, bosslocation: 103 });
  const config = scoreConfig(hd_roguelike), chapter = data.chapterData;
  const current = projection => estimateScore(config, readScoreRun(data), projection);
  Object.assign(data.seasonData, { seasonId: 5, difficulty: 1 });
  delete data.gameData.itemId;
  chapter.record = { fightScore: 0 };
  assert.equal(current().total, 0);
  assert.equal(current().loss.points, 500);
  data.gameData.itemId = [2228];
  chapter.record = { fightScore: 324, items: [2228] };
  const afterWin = current();
  assert.deepEqual([afterWin.battle, afterWin.items, afterWin.rate, afterWin.total, afterWin.loss.points], [324, 200, 10, 524, 500]);
  chapter.accday = 5;
  assert.deepEqual([current().total, current().loss.points], [524, 650]);

  Object.assign(chapter, { chapterId: 53, curLocation: 103, curEventData: { eventType: 3, eventId: 2002 } });
  const finalBoss = estimateBattlePoints(config, readScoreRun(data), readScoreBattle(data), 5);
  assert.equal(finalBoss, 4490);
  assert.equal(current(finalBoss).total, 5014);
  data.gameData.passChapter = [51, 52, 53];
  chapter.record.fightScore += finalBoss;
  assert.equal(current().total, 5014);
  assert.equal(current().loss, null);

  data.gameData.passChapter = [];
  chapter.record.fightScore = 324;
  data.seasonData.difficulty = 2;
  assert.equal(current().total, 576);
  Object.assign(data.seasonData, { seasonId: 6, difficulty: 1 });
  assert.equal(current().total, 524);
});

test('Rebirth costs 500 before the difficulty multiplier when the fight is finished', () => {
  const { hd_roguelike } = fixtureConfig(), data = fixtureData();
  hd_roguelike.Root.DifficultySelection.push({ seasonID: '5', difID: 1, bdif: 1, sdif: 1 });
  const config = scoreConfig(hd_roguelike), game = data.gameData;
  Object.assign(data.seasonData, { seasonId: 5, difficulty: 1 });
  game.itemId = [];
  data.chapterData.record = { fightScore: 30, items: [] };
  const current = () => estimateScore(config, readScoreRun(data));
  assert.equal(current().total, 30);

  game.dyingCnt = 1;
  assert.deepEqual([current().rebirthPenalty, current().total], [null, null]);
  const rebirth = { uSpellId: 3324, uTimes: 0 };
  game.myGeneral.spellUseInfo = [{ uSpellId: 37, uTimes: 1 }, rebirth];
  assert.equal(current().total, 30);
  rebirth.uTimes = 1;
  assert.deepEqual([current().rebirthPenalty, current().total, current().loss.points], [500, 0, 500]);
  Object.assign(data.seasonData, { seasonId: 6, difficulty: 15 });
  data.chapterData.record.fightScore = 1000;
  assert.equal(current().total, 2800);
});

test('defeat estimates use cumulative months and cap completed chapters with Swift March', () => {
  const data = fixtureData();
  for (const [chapter, months, day, swift, counted, points] of [
    [1, 3, 3, false, 3, 500], [2, 8, 4, false, 8, 1100], [3, 12, 2, false, 12, 1340],
    [2, 14, 8, true, 12, 1700], [3, 22, 8, true, 18, 2060], [3, 14, 0, true, 10, 1100],
  ]) {
    Object.assign(data.chapterData, { accday: months, day });
    data.gameData.passChapter = [61, 62].slice(0, chapter - 1);
    data.gameData.itemId = swift ? [2142] : [];
    const loss = estimateLoss(readScoreRun(data));
    assert.deepEqual([loss.months, loss.points], [counted, points]);
  }
});

test('a projected victory uses the current round, battle type and confirmed boss month bonus', () => {
  const { hd_roguelike } = fixtureConfig(), data = fixtureData(), chapter = data.chapterData;
  hd_roguelike.Root.ChapterCS = [{ seasonID: '6', chapter: 1, apptime: 4 }];
  const config = scoreConfig(hd_roguelike);
  chapter.record = { fightScore: 1000, items: [2100] };
  data.gameData.itemId = [2100];
  chapter.curEventData = { eventType: 3, eventId: 2001 };
  const run = readScoreRun(data);
  assert.equal(estimateBattlePoints(config, run, readScoreBattle(data), 4), 324);
  const projected = estimateScore(config, run, estimateBattlePoints(config, run, readScoreBattle(data), 5));
  assert.deepEqual([projected.battle, projected.projectedBattle, projected.total], [1030, 30, 7448]);
  assert.equal(estimateScore(config, run).total, 7280);

  chapter.locations[0].event = 2002;
  assert.equal(estimateBattlePoints(config, run, readScoreBattle(data, 2002), 1), 648);
  chapter.curLocation = 103;
  chapter.day = 4;
  assert.equal(estimateBattlePoints(config, run, readScoreBattle(data, 2002), 4), 2796);
  assert.equal(estimateBattlePoints(config, run, readScoreBattle(data, 2002), 4, 'eligible'), 4296);
  chapter.day = 5;
  assert.equal(estimateBattlePoints(config, run, readScoreBattle(data, 2002), 5), 1620);
  chapter.curLocation = 102;
  assert.equal(readScoreBattle(data, 2002), null, 'encounter fight does not match its map node');
  chapter.curLocation = 103;
  chapter.curEventData = { eventType: 4, eventId: 2002 };
  assert.equal(readScoreBattle(data, 2002), null, 'a reward screen does not start a new preview');
});

test('Luoyang boss month adds 1500 only with an observed arrival and no intervening completed action', () => {
  const { hd_roguelike } = fixtureConfig(), data = fixtureData();
  const root = hd_roguelike.Root, chapter = data.chapterData;
  root.Chapter.push({ seasonID: '5', chapter: 3, uniqueID: 10, bosslocation: 5108 });
  root.ChapterCS = [{ seasonID: '5', chapter: 3, apptime: 7 }];
  root.Fight.push({ fightID: 22671, iselite: 1 });
  Object.assign(chapter, { chapterId: 10, day: 6 });
  Object.assign(data.seasonData, { seasonId: 5, difficulty: 1 });
  const run = readScoreRun(data), config = scoreConfig(hd_roguelike);
  const boss = { id: 22671, chapterId: 10, day: 7, location: 5108 };
  const laterBoss = { ...boss, day: 8 };
  const quest = { eventType: 2, eventId: 701 };
  const start = (firstDay = 6) => {
    const tracker = createBossMonthTracker();
    tracker.observe(config, run, { ...chapter, day: firstDay }, true);
    return tracker;
  };
  const arrive = tracker => tracker.observe(config, run, { ...chapter, day: 7 }, true);
  const project = tracker => estimateBattlePoints(config, run, boss, 1, tracker.statusFor(run, boss));

  const direct = start();
  direct.openAdventure(quest);
  arrive(direct);
  direct.finishAdventure(quest); // A delayed reply from the previous month.
  direct.openAdventure({ ...quest, eventId: 702 });
  direct.finishAdventure({ ...quest, eventId: 702, result: 15 });
  assert.equal(project(direct), 7166);
  assert.equal(direct.statusFor(run, laterBoss), null);
  assert.equal(direct.statusFor({ ...run, key: 'new-run' }, boss), null);

  const paid = start();
  arrive(paid);
  paid.openAdventure(quest);
  paid.finishAdventure({ ...quest, selectData: [{ id: 2051 }] });
  assert.equal(paid.statusFor(run, boss), 'missed');
  assert.equal(10146 + project(paid) + 7600, 23412);

  const synced = start();
  arrive(synced);
  synced.observe(config, run, { ...chapter, day: 7, curEventData: quest }, true);
  assert.equal(project(synced), 7166);
  synced.observe(config, run, { ...chapter, day: 7, curEventData: { ...quest, isSelect: true } }, true);
  assert.equal(project(synced), 5666);

  const retained = start();
  arrive(retained);
  retained.finishBattle(run, { ...boss, day: 6, location: 5106 });
  assert.equal(project(retained), 7166);
  retained.finishBattle(run, { ...boss, location: 5106 });
  assert.equal(project(retained), 5666);

  const midMonth = start(7);
  assert.equal(midMonth.statusFor(run, boss), 'unknown');
  assert.equal(project(midMonth), 5666);
  const noOpening = start();
  arrive(noOpening);
  noOpening.finishAdventure(quest);
  assert.equal(noOpening.statusFor(run, boss), 'unknown');
  assert.equal(project(noOpening), 5666);
});

test('school thresholds use official quality counts for the current run', () => {
  const files = fixtureConfig(), config = files.hd_roguelike.Root, data = fixtureData();
  config.school = [{ school: 2, name: '过牌流', needxiyou: 2, needchuanshuo: 1 }];
  config.Tactics[0].school = '2';
  config.Tactics[1].school = '2';
  config.Tactics[3].school = '2';
  const built = buildConfig(files);
  const current = () => buildView(built, projectSnapshot(data)).schools;
  assert.deepEqual(current()[0].tiers, [{ grade: '稀有', need: 2, count: 2 }, { grade: '传说', need: 1, count: 0 }]);
  data.gameData.itemId.push(2101, 3001);
  assert.equal(current()[0].met, true);
  data.gameData.itemId.splice(1, 1);
  assert.equal(current()[0].met, false);
  data.gameData.itemId = [];
  assert.equal(current()[0].done, 0);
  delete data.gameData.itemId;
  assert.equal(current(), null);
});

test('followed suits match a missing quality in every configured school, including compound memberships', () => {
  const files = fixtureConfig(), root = files.hd_roguelike.Root, data = fixtureData();
  root.school = [
    { school: 1, name: '资源流', needxiyou: 1, needchuanshuo: 1 },
    { school: 2, name: '队友流', needxiyou: 2, needchuanshuo: 1 },
    { school: 3, name: '其他赛季', seasonID: '5', needchuanshuo: 1 },
  ];
  root.Tactics[0].school = '1,2';
  root.Tactics[1].school = '2';
  root.Tactics[2].school = '1,2';
  root.Tactics[3].school = '1,2,3';
  const config = buildConfig(files), followed = new Set([1, 2, 3]);
  const matcher = () => schoolMatcher(config.tactics, buildView(config, projectSnapshot(data)).schools, followed);
  assert.deepEqual(matcher()(2101, 2), [{ school: 1, name: '资源流' }, { school: 2, name: '队友流' }]);
  assert.deepEqual(matcher()(2101, 3), []);
  assert.deepEqual(matcher()(2145, 2), []);
  assert.deepEqual(matcher()(2100, 2), []);
  data.gameData.itemId.push(2101);
  assert.equal(matcher(), null);
  delete data.gameData.itemId;
  assert.equal(matcher(), null);
});

test('ending rules are selected by season and preserve unknown and settlement conditions', () => {
  const files = fixtureConfig().hd_roguelike, data = fixtureData();
  files.Root.ending = [
    { ID: 1, SeasonList: '5', endingName: '上赛季', need_Rep: '1,0' },
    { ID: 2, SeasonList: '5;6', endingName: '从龙', need_Rep: '2,0', need_Tro: '1,15', special: '1,1;11,15;4,900' },
    { ID: 3, SeasonList: '6', endingName: '隐居', need_Rep: '4,0', special: '1,2;10,1;13,2' },
    { ID: 4, SeasonList: '6', endingName: '其他', need_Ass: '1,10', special: '9,1' },
    { ID: 5, SeasonList: '5;6', endingName: '折戟沉沙', priority: -5, special: '1,2' },
    { ID: 6, SeasonList: '6', endingName: '只需通关', special: '1,1' },
  ];
  data.gameData.attrInfo = { rep: 0, tro: 15 };
  data.chapterData.record = { money: 901 };
  const config = endingConfig(files);
  const current = () => endingTendency(config, readEndingRun(data));
  assert.deepEqual(current().map(row => row.id), [2, 3, 4, 6, 5]);
  assert.deepEqual(current().map(row => row.status), ['progress', 'progress', 'progress', 'met', 'loss']);
  assert.equal(current()[0].conditions.find(row => row.text === '战功 > 15').progress, '15/16');
  assert.deepEqual([current()[0].done, current()[0].total], [3, 4]);
  data.seasonData.difficulty = 1;
  assert.equal(current()[0].status, 'difficulty');
  data.seasonData.difficulty = 15;
  data.gameData.attrInfo.tro++;
  assert.equal(current()[0].status, 'met');
  assert.equal(current()[1].conditions[0].status, 'met');
  assert.ok(current()[1].conditions.some(row => row.text === '败于士兵' && row.status === 'final'));
  assert.ok(current()[1].conditions.some(row => row.text.includes('从龙') && row.status === 'unknown'));
  data.seasonData.seasonId = 5;
  assert.equal(current().at(-1).status, 'loss');
  data.seasonData.seasonId = 999;
  assert.deepEqual(current(), []);
});

test('bundled impact facts are exact-season and exact-option matches', () => {
  assert.deepEqual(optionImpact(5, 126701), { changes: ['战功 +5'], samples: 27, consistency: 100 });
  assert.equal(optionImpact(6, 126701), null);
  assert.equal(optionImpact(5, 999999), null);
  assert.equal(optionImpact(null, 126701), null);
});

test('each adventure reward keeps the matching attribute changes in the panel and on the map', () => {
  const files = fixtureConfig(), root = files.hd_roguelike.Root;
  root.Adventure.push({ ID: 1484, chapname: '知己难逢', effect1: 148401, effect2: 148402, effect3: 148403 });
  root.Other.push({ reward: 997003, rewardname: '曹昂' }, { reward: 997103, rewardname: '曹昂' });
  root.Choose.push({ effectID: 148401, type: 1, getitem: 997003, getnum: 1 },
    { effectID: 148402, type: 1, getitem: 997103, getnum: 1, lostitem: 1000, lostnum: 400 },
    { effectID: 148403, type: 1, getitem: 1000, getnum: 200 });
  const config = buildConfig(files), snapshot = fixtureData(), location = { location: 102, event: 1484 };
  snapshot.seasonData.seasonId = 5;
  const read = () => nodePreview(config, location, snapshot);
  const expected = ['（声望 −1 · 智谋 +10）', '（声望 −1 · 智谋 +10）', '（商才 +10）'];
  const node = read();
  assert.deepEqual(node.options.map(option => optionTokens(option).at(-1).text), expected);
  assert.deepEqual(labelLines(node).map(line => line.text), [
    `① 曹昂${expected[0]}`, `② 铜钱400 → 曹昂${expected[1]}`, `③ 铜钱200${expected[2]}`,
  ]);
  assert.ok(nodePreview(config, location, snapshot, false).options.every(option => option.impact === null));
  const unrecorded = nodePreview(config, { ...location, event: 1001 }, snapshot);
  assert.deepEqual(unrecorded.options.map(option => optionTokens(option).find(token => token.impact)?.text),
    ['（属性变化待确认）', '（属性变化待确认）']);
  snapshot.seasonData.seasonId = 6;
  snapshot.gameData.attrInfo = { rep: 0, wis: 0 };
  assert.ok(read().options.every(option => optionTokens(option).at(-1).impact === 'unknown'));
  const camp = nodePreview(config, { ...location, event: 1002 }, snapshot);
  assert.ok(optionTokens(camp.options[0]).every(token => !token.impact));
});
