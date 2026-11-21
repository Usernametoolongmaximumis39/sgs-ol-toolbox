import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistory, projectHistory } from '../src/plugins/appearances/history.js';
const now = Date.now(), endedAt = Math.floor(now/1000)*1000 - 60000;
const row = { gameId: '123', label: 14803, figure: 3, result: 1, duration: 300,
  ended: endedAt/1000+28800, general: [1] };
const data = rows => ({mode:35,rows});
test('history: links unique opening, enriches live settlement and rejects ambiguous openings', () => {
 const frame = {id:'local',mode:35,selected:[1],general:[1,2],time:endedAt-310000,figure:3};
 const a=mergeHistory([frame],[],data([row]),now); assert.equal(a.matches[0].id,'local');
 assert.equal(mergeHistory([frame],a.matches,data([row]),now).matches.length,1);
 const live={...frame,general:[1],endedAt:endedAt+1000,duration:300,result:1};
 assert.equal(mergeHistory([frame],[live],data([row]),now).matches.length,1);
 assert.equal(mergeHistory([frame,{...frame,id:'other'}],[],data([row]),now).matches.length,0);
});
test('history: filters excluded modes, missing side, unknown result, invalid ids and stale dates', () => {
 for(const r of [{...row,label:14804},{...row,label:13203},{...row,result:null},{...row,gameId:null},{...row,ended:1}])
   assert.equal(mergeHistory([],[],{mode:r.label===13203?26:35,rows:[r]},now).matches.length,0);
});
test('history: copies native and protobuf packets, including lossless long id', () => {
 const p=projectHistory({Protocol:{Uuid:41,Tab:0,RecordId:35,RecordItems:[{GameId:{high:1,low:2},Label:14803,UsedGenerals:[1],GameResult:0}]}});
 assert.equal(p.rows[0].gameId,'4294967298'); assert.equal(p.account,'41');
 assert.match(projectHistory({Protocol:{all_record:'bad'}}).issues[0],/战绩列表格式无效/);
});

test('history: early-exit ranked and single-rider use the persisted opening position', () => {
 for(const [mode,label,position] of [[26,13203,4],[44,16003,2]]) {
   const frame={id:`frame-${mode}`,mode,position,selected:[1],general:[1,2],time:endedAt-310000};
   const result=mergeHistory([frame],[],{mode,rows:[{...row,label}]},now);
   assert.equal(result.matches.length,1); assert.equal(result.matches[0].id,frame.id);
   assert.equal(result.matches[0].position,position); assert.equal(result.matches[0].result,1);
 }
});

test('history: does not import historical games without a locally observed opening', () => {
 assert.equal(mergeHistory([],[],data([row]),now).matches.length,0);
});

test('history: repairs the ranked teammate selection and missing result only on unique official roster evidence', () => {
  const official = { game_id: '123', label_mode: 13203, game_time: 141, game_result: 0,
    game_over_time: row.ended, used_general: [101], real_seat_id: 3, all_used_general: [
      { real_seatid: 2, general_id: [4] }, { real_seatid: 0, general_id: [102] },
      { real_seatid: 3, general_id: [101] }, { real_seatid: 1, general_id: [3] },
    ] };
  const reply = (...rows) => projectHistory({ Protocol: { query_uid: 41, id: 26, all_record: rows } });
  const frame = { id: 'ranked-misattributed', mode: 26, source: 'toolbox', rawMode: 132, rawGroup: 3,
    time: endedAt - 155000, seat: 0, position: 1, selected: [102], general: [101, 102, 103] };
  const corrected = mergeHistory([frame], [], reply(official), now);
  assert.equal(corrected.added, 1);
  assert.deepEqual(corrected.records, [{ ...frame, seat: 3, position: 4, selected: [101] }]);
  assert.equal(corrected.matches[0].id, frame.id);
  assert.deepEqual(corrected.matches[0].general, [101]);
  assert.equal(corrected.matches[0].result, 0);
  assert.equal(corrected.matches[0].duration, 141);
  assert.equal(mergeHistory(corrected.records, corrected.matches, reply(official), now).added, 0);
  assert.equal(mergeHistory(corrected.records, corrected.matches, reply({ ...official, game_id: '124' }), now).matches.length, 1);

  for (const [records, matches, response] of [
    [[frame, { ...frame, id: 'second-local-frame' }], [], reply(official)],
    [[frame], [], reply(official, { ...official, game_id: '124' })],
    [[frame], [], reply({ ...official, all_used_general: [] })],
    [[frame], [], reply({ ...official, real_seat_id: 0 })],
    [[{ ...frame, general: [102, 103] }], [], reply(official)],
    [[frame], [{ ...frame, general: [102], result: 0 }], reply(official)],
  ]) {
    assert.deepEqual(mergeHistory(records, matches, response, now).records, records);
  }
});

test('history: a null or missing-general official entry cannot discard valid rows in the same response', () => {
 const projected=projectHistory({Protocol:{query_uid:41,id:35,all_record:[null,
  {game_id:'1',label_mode:14803},
  {game_id:'123',label_mode:14803,figure:3,game_result:1,game_time:300,game_over_time:row.ended,used_general:[1]}]}});
 assert.equal(projected.rows.length,1); assert.equal(projected.issues.length,2);
 assert.match(projected.issues[1],/第2条：缺少已用武将列表/);
 const frame={id:'missed',mode:35,selected:[1],general:[1,2],figure:3,time:endedAt-310000};
 assert.equal(mergeHistory([frame],[],projected,now).added,1);
});
