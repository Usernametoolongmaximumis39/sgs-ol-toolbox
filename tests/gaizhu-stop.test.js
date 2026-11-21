import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { createPluginNative } from '../src/core/plugin-native.js';
import { createStopPolicy } from '../src/plugins/gaizhu/stop-policy.js';

const TASK_IDS = [171114, 171115, 171116];

function fixture(t) {
  const scope = new ResourceScope();
  t.after(() => scope.dispose());
  const calls = [], events = new Map(), classes = new Map();
  let now = 100000, account = '41';
  const config = { Round: 7, NewDayQuestId1: TASK_IDS[0], NewDayQuestId2: TASK_IDS[1], NewWeekQuestId: TASK_IDS[2] };
  const clock = { LocalServerTime: 1794952800 };
  const proxy = {
    on(event, caller, handler) {
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(handler);
    },
    off(event, caller, handler) { events.get(event)?.delete(handler); },
  };
  const welfare = {
    CurPubCommonVo: config,
    ReqJgqyInfo() { calls.push('tavern-info'); },
  };
  classes.set('WelfareManger', welfare);
  classes.set('TimerManager', clock);
  classes.set('ActivityQuestManager', {
    GetServerTaskDataByTaskID() { return null; },
    UpTaskState(ids) { calls.push(['tavern-progress', ...ids]); },
    RequestTaskAward() { assert.fail('tavern status reader must never claim'); },
  });
  const ctx = {
    now: () => now, scope,
    game: { getSelf: () => ({ ClientId: account }), getClass: name => classes.get(name), getServerProxy: () => proxy },
  };
  ctx.native = createPluginNative(ctx);
  function emit(event, packet) {
    for (const fn of events.get(event) ?? []) fn(packet);
  }
  function data(event, ProtoObj) {
    emit(event, { Protocol: { Data: { ProtoObj } } });
  }
  return {
    ctx, classes, calls, config, clock, events, emit, data,
    advance(ms) { now += ms; },
    account(id) { account = id; },
    round(value = config.Round) { data('decodeClientTavernInfoRep', { tavern_info: { round_id: value } }); },
    progress(...rows) { data('decodeUserQuestInfoRep', { info: rows }); },
    claim(id, result = 0) { data('decodeUserQuestOpRep', { quest_id: id, op_type: 1, result }); },
  };
}

const quest = (id, fields = {}) => ({ quest_id: id, rewarded: false, complete_cnt: 0, ...fields });
const all = (fields = {}) => TASK_IDS.map(id => quest(id, fields));

test('gaizhu stop policy: positive fractional hours use elapsed time across ticks', t => {
  const f = fixture(t), policy = createStopPolicy(f.ctx);
  assert.equal(policy.update().due, false);
  for (const value of [0, -1, Infinity, NaN, '', true]) {
    assert.throws(() => policy.start({ mode: 'timed', hours: value }), /正数小时/);
  }
  policy.start({ mode: 'timed', hours: 0.025 });
  assert.equal(policy.snapshot().deadline, 190000);
  f.advance(89999); assert.equal(policy.update().due, false);
  f.advance(1); assert.equal(policy.update().due, true);
  assert.equal(policy.snapshot().stopStatus, '定时已到');
  policy.reset();
  assert.deepEqual(policy.snapshot(), { waiting: false, due: false, deadline: 0, stopStatus: '' });
});

test('gaizhu stop policy: current tavern round and all three task IDs are required before launch', t => {
  const f = fixture(t), policy = createStopPolicy(f.ctx);
  policy.start({ mode: 'tavern', account: '41' });
  assert.equal(policy.update().waiting, true);
  assert.deepEqual(f.calls, ['tavern-info']);
  f.round(6);
  assert.equal(policy.update().waiting, true);
  f.round();
  assert.equal(policy.update().waiting, true);
  assert.deepEqual(f.calls, ['tavern-info', ['tavern-progress', ...TASK_IDS]]);
  f.progress(quest(TASK_IDS[0], { rewarded: true }), quest(TASK_IDS[1], { complete_cnt: 1 }), quest(12, { rewarded: true }));
  assert.equal(policy.update().waiting, true);
  assert.match(policy.snapshot().stopStatus, /待同步/);
  f.advance(9999); policy.update();
  assert.equal(f.calls.length, 2);
  f.advance(1); policy.update();
  assert.equal(f.calls.length, 3);
  f.progress(quest(TASK_IDS[2], { rewarded: true }));
  assert.deepEqual(policy.update(), { waiting: false, deadline: 0, due: true, stopStatus: '酒馆三项已领齐' });
  policy.reset();
  assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
});

test('gaizhu stop policy: complete progress and claimable quests wait for explicit claims', t => {
  const f = fixture(t), policy = createStopPolicy(f.ctx);
  policy.start({ mode: 'tavern', account: '41' }); policy.update();
  f.round(); policy.update();
  f.progress(...all({ CanAward: true, condition_data: [{ condition_id: 0, condition_cnt: 99999 }] }));
  assert.match(policy.update().stopStatus, /0\/3/);
  assert.equal(policy.snapshot().due, false);
  f.claim(TASK_IDS[0], 5);
  f.data('decodeUserQuestOpRep', { quest_id: TASK_IDS[1], op_type: 0, result: 0 });
  assert.match(policy.update().stopStatus, /0\/3/);
  f.claim(TASK_IDS[0]);
  f.claim(TASK_IDS[1]);
  assert.match(policy.update({ settled: true }).stopStatus, /2\/3/);
  assert.equal(policy.snapshot().waiting, true, 'keep next round gated while settlement is read back');
  f.progress(...all());
  assert.match(policy.update({ settled: true }).stopStatus, /2\/3/, 'old progress cannot undo a confirmed claim');
  f.claim(TASK_IDS[2]);
  assert.equal(policy.update({ settled: true }).due, true);
  assert.deepEqual(f.calls.filter(x => x[0] === 'tavern-progress'), [
    ['tavern-progress', ...TASK_IDS],
  ], 'frequent claims and settlement events remain rate limited');
});

test('gaizhu stop policy: clears prior observations across dates, rounds, accounts and stopped runs', t => {
  const f = fixture(t), policy = createStopPolicy(f.ctx);
  policy.start({ mode: 'tavern', account: '41' }); policy.update();
  f.round(); policy.update();
  f.progress(quest(TASK_IDS[0], { rewarded: true }), ...TASK_IDS.slice(1).map(id => quest(id)));
  assert.match(policy.update().stopStatus, /1\/3/);
  f.clock.LocalServerTime += 86400;
  f.claim(TASK_IDS[1]);
  f.advance(10000);
  assert.equal(policy.update().waiting, true);
  f.round(); policy.update();
  f.progress(...all());
  assert.match(policy.update().stopStatus, /0\/3/);
  f.config.Round++;
  f.advance(10000);
  assert.equal(policy.update().waiting, true);
  f.round(); policy.update();
  f.account('42');
  f.progress(...all({ rewarded: true }));
  assert.equal(policy.update().due, false);
  policy.reset();
  f.progress(...all({ rewarded: true }));
  assert.equal(policy.update().due, false);
});

test('gaizhu stop policy: legacy progress and claim acknowledgements stay distinct', t => {
  const f = fixture(t), policy = createStopPolicy(f.ctx);
  f.classes.delete('ActivityQuestManager');
  f.classes.set('TaskManager', {
    GetServerTaskDataByTaskID() { return { IsFromServer: true, CanAward: true, HasAward: false }; },
    reqTaskProgressByIds(ids) { f.calls.push(['legacy-progress', ...ids]); },
  });
  policy.start({ mode: 'tavern', account: '41' }); policy.update();
  f.round(); policy.update();
  for (const TaskID of TASK_IDS) f.emit('SmsgUpdateTaskProgressToClient', { Protocol: { TaskID, Count: 9999 } });
  assert.match(policy.update().stopStatus, /0\/3/);
  f.emit('SmsgClientGetRewardedTaskDataResponse', { Protocol: { TaskDataItems: [{ taskId: TASK_IDS[0], completeTimes: 1 }] } });
  assert.match(policy.update().stopStatus, /1\/3/);
  f.emit('SmsgClientTaskRewardResponse', { Protocol: { TaskID: TASK_IDS[1], CompleteTimes: 0 } });
  f.emit('SmsgClientTaskRewardResponse', { Protocol: { TaskID: TASK_IDS[2], CompleteTimes: 1, errCode: 8 } });
  assert.match(policy.update().stopStatus, /2\/3/);
  f.emit('SmsgClientTaskRewardResponse', { Protocol: { TaskID: TASK_IDS[2], CompleteTimes: 1 } });
  assert.equal(policy.update().due, true);
});
