import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOptions, definitions, evaluate, chooseGeneral, bannedGeneral } from '../src/plugins/gaizhu/model.js';
import { projectAchievementReply } from '../src/core/native-achievements.js';

function projectAchievements(packet) {
  const data = projectAchievementReply(packet);
  if (!data?.forAutomation) return null;
  if (data.automationError) throw new Error(data.automationError);
  return data.snapshot;
}

const definition = (id, characterId, flags = 2048, criteria = [{ Id: id + 1000, count: 100 }]) => ({ Id: id, characterId, flags, CriteriaEntry: criteria });
const source = rows => ({ AchievementAll: { Achievement: rows } });
const reply = changes => ({ requestType: 0, NickName: '账号甲', Achs: [], ...changes });
const candidate = (id, changes = {}) => ({ id, name: `候选${id}`, owned: true, progress: 1, required: 100, completed: false, skillCompleted: false, ...changes });

test('gaizhu model: old preferences keep their values and only valid account options persist', () => {
  const defaults = { pick: 'off', wait: false, autoMode: 'identity', stopMode: 'manual', stopHours: 1 };
  for (const cancelWuxie of [true, false]) assert.deepEqual(cleanOptions({ cancelWuxie }), defaults);
  assert.deepEqual(cleanOptions(), defaults);
  assert.deepEqual(cleanOptions(null), defaults);
  assert.deepEqual(cleanOptions({ pick: 'order', wait: true, role: 'host', deadline: 999, roomNumber: 333, awaitingConfirmation: true }),
    { ...defaults, pick: 'order', wait: true });
  assert.deepEqual(cleanOptions({ pick: 'invalid', wait: 1, autoMode: 'match', stopMode: 'timer', stopHours: -1 }), defaults);
  assert.deepEqual(cleanOptions({ pick: 'random', autoMode: 'training', stopMode: 'timed', stopHours: '0.25' }),
    { ...defaults, pick: 'random', autoMode: 'training', stopMode: 'timed', stopHours: 0.25 });
});

test('gaizhu model: parses official direct/XML attributes and multiple progress criteria', () => {
  const defs = definitions(source([
    definition(10, 1, 2048, [{ Id: 100, count: 40 }, { _attributes: { Id: '101', count: '60' } }]),
    { _attributes: { Id: '20', characterId: '2', flags: '2048' }, criteriaEntry: { _attributes: { id: '200', count: '100' } } },
    definition(30, 1, 1024),
  ]));
  assert.deepEqual(defs[0], { id: 10, characterId: 1, flags: 2048, criteria: [{ id: 100, count: 40 }, { id: 101, count: 60 }] });
  const snapshot = projectAchievements(reply({ Achs: [
    { id: 100, type: 2, detailInfo: 30 }, { ProtoObj: { id: 101, type: 2, detailInfo: 55 } },
    { protoObj: { id: 30, type: 1, detailInfo: 1700000000 } }, { id: 20, type: 1, detailInfo: 1700000001 },
  ] }));
  const rows = evaluate(defs, snapshot, { 1: '刘备', 2: '关羽' }, () => true);
  assert.deepEqual(rows[0], { id: 1, name: '刘备', progress: 85, required: 100, completed: false, skillCompleted: true, owned: true });
  assert.equal(rows[1].completed, true);
  assert.equal(rows[1].progress, 0);
  assert.equal(rows[1].required, 100);
});

test('gaizhu model: accepts only full reply fields and preserves exact nickname for run matching', () => {
  const valid = projectAchievements({ ProtoObj: reply({ NickName: ' 账号甲 ' }) });
  assert.equal(valid.nickname, ' 账号甲 ');
  for (const changes of [
    { requestType: 1 }, { requestType: undefined }, { requestType: false }, { requestType: '' },
    { NickName: 123 }, { NickName: undefined }, { Achs: {} }, { Achs: undefined },
  ]) assert.equal(projectAchievements(reply(changes)), null);
  assert.equal(projectAchievements(null), null);
});

test('gaizhu model: missing snapshot remains unknown and cannot select a general', () => {
  const rows = evaluate(definitions(source(definition(10, 1))), null, { 1: '刘备' }, () => true);
  assert.equal(rows[0].completed, null);
  assert.equal(rows[0].progress, null);
  assert.equal(rows[0].skillCompleted, null);
  assert.equal(chooseGeneral(rows), null);
});

test('gaizhu model: unknown and unowned generals are excluded instead of assumed owned', () => {
  const snapshot = projectAchievements(reply());
  const defs = definitions(source([definition(10, 1), definition(20, 2)]));
  const unknown = evaluate(defs, snapshot, { 1: '刘备', 2: '关羽' });
  assert.ok(unknown.every(row => row.owned === null));
  assert.equal(chooseGeneral(unknown), null);
  assert.equal(chooseGeneral([candidate(1, { owned: false }), candidate(2, { owned: null })]), null);
  assert.equal(chooseGeneral([candidate(1, { owned: false }), candidate(2)]).id, 2);
});

test('gaizhu model: excludes Huang Gai variants and completed generals in every pick mode', () => {
  const rows = [candidate(1, { name: '黄盖' }), candidate(2, { name: '界黄盖' }), candidate(3, { name: 'SP黄盖' }),
    candidate(4, { completed: true }), candidate(5)];
  assert.equal(bannedGeneral(1, '黄盖'), true);
  assert.equal(bannedGeneral(5, '刘备'), false);
  for (const pick of ['off', 'order', 'random']) assert.equal(chooseGeneral(rows, { pick, currentId: 1, random: () => 0 }).id, 5);
  assert.equal(chooseGeneral(rows.slice(0, -1)), null);
});

test('gaizhu model: order prioritizes completed skill achievement, progress, then stable general ID', () => {
  const rows = [candidate(9, { progress: 99 }), candidate(8, { progress: 2, skillCompleted: true }),
    candidate(7, { progress: 4, skillCompleted: true }), candidate(6, { progress: 4, skillCompleted: true })];
  const original = structuredClone(rows);
  assert.equal(chooseGeneral(rows, { pick: 'order' }).id, 6);
  assert.equal(chooseGeneral(rows, { pick: 'off' }).id, 6);
  assert.deepEqual(rows, original);
  assert.equal(chooseGeneral(rows, { excludeId: 6 }).id, 7);
  assert.equal(chooseGeneral([rows[3]], { excludeId: 6 }).id, 6);
});

test('gaizhu model: skill flags 0x400/0x401 and special achievement 0x4cd affect order', () => {
  const defs = definitions(source([definition(10, 1), definition(20, 2), definition(30, 3),
    definition(11, 1, 0x400), definition(21, 2, 0x401), definition(0x4cd, 3, 0)]));
  const snapshot = projectAchievements(reply({ Achs: [11, 21, 0x4cd].map(id => ({ id, type: 1, detailInfo: 1700000000 })) }));
  const rows = evaluate(defs, snapshot, {}, () => true);
  assert.ok(rows.every(row => row.skillCompleted));
  assert.equal(chooseGeneral(rows).id, 1);
});

test('gaizhu model: random preserves current unfinished general and rotates after completion', () => {
  const rows = [candidate(1), candidate(2), candidate(3)];
  assert.equal(chooseGeneral(rows, { pick: 'random', currentId: 2, random: () => { throw new Error('current should not reroll'); } }).id, 2);
  rows[1].completed = true;
  assert.equal(chooseGeneral(rows, { pick: 'random', currentId: 2, random: () => 0 }).id, 1);
  assert.equal(chooseGeneral(rows, { pick: 'random', currentId: 2, random: () => 1 }).id, 3);
  assert.equal(chooseGeneral(rows, { pick: 'random', excludeId: 1, random: () => 0 }).id, 3);
});

test('gaizhu model: progress threshold and explicit finish both establish completion', () => {
  const defs = definitions(source([definition(10, 1), definition(20, 2)]));
  const snapshot = projectAchievements(reply({ Achs: [{ id: 1010, type: 2, detailInfo: 100 }, { id: 20, type: 1, detailInfo: 1700000000 }] }));
  assert.ok(evaluate(defs, snapshot, {}, () => true).every(row => row.completed));
});

test('gaizhu model: malformed native fields and over-limit arrays fail explicitly', () => {
  for (const row of [
    { id: 0, type: 2, detailInfo: 1 }, { id: true, type: 2, detailInfo: 1 }, { id: 1, type: NaN, detailInfo: 1 },
    { id: 1, type: -1, detailInfo: 1 }, { id: 1, type: 2, detailInfo: -1 }, { id: 1, type: 1, detailInfo: Infinity },
    { id: 1, type: 2 }, { id: 1, type: 2, detailInfo: false },
  ]) assert.throws(() => projectAchievements(reply({ Achs: [row] })), /格式无效|无效/);
  // Unrelated native TYPE_UNLOCK/DELETE/USING rows need no progress field.
  assert.deepEqual(projectAchievements(reply({ Achs: [{ id: 1, type: 4 }] })).progress, {});
  assert.equal(projectAchievements(reply({ Achs: new Array(20001) })), null);
  assert.throws(() => definitions({}), /缺少/);
  assert.throws(() => definitions(source(new Array(20001))), /过多/);
  assert.throws(() => definitions(source(definition(10, 1, 2048, new Array(257)))), /过多/);
});
