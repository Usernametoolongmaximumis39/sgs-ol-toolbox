import test from 'node:test';
import assert from 'node:assert/strict';
import { planActivities, prepareActivities } from '../src/plugins/daily-rewards/activities.js';
import { createNativeAdapter, planRewards } from '../src/plugins/daily-rewards/native.js';
import { createRewardsController, awaitClaim } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';

function fixture() {
  const calls = [], tasks = [171114, 171115, 171116].map(id => ({ id, CanAward: true, HasAward: false,
    completeTimes: 0, CanRewardCount: 2, baseVo: { maxComplete: 99, IsRepect: true, name: '酒馆对局任务' } }));
  tasks[2].CanAward = false; tasks[2].HasAward = true;
  const config = { Round: 7, NewDayQuestId1: tasks[0].id, NewDayQuestId2: tasks[1].id, NewWeekQuestId: tasks[2].id,
    NewDayQuestReward1: 1, NewDayQuestReward2: 2, NewWeekQuestReward: 3, SaveWineGood: 900 };
  const welfare = { CurPubCommonVo: config, ReqJgqyInfo() {}, JgqyHasRedNew() {},
    ReqJgqyGetStoreWine() { throw Error('paid storage must not be called'); } };
  const manager = { allTasks: tasks, GetServerTaskDataByTaskID: id => tasks.find(task => task.id === id),
    RequestTaskAward(id, select, count) { calls.push([id, select, count]); const task = this.GetServerTaskDataByTaskID(id); task.completeTimes++; task.CanAward = false; } };
  const adapter = { account: () => 'test', day: () => '2026-11-14', config: () => null, proxy: () => ({}),
    goods: id => id === 900 ? { name: '酒馆碎片' } : null,
    manager: name => name === 'TaskManager' ? manager : name === 'WelfareManger' ? welfare : null };
  return { adapter, manager, welfare, config, tasks, calls, plan: () => planActivities(adapter, { activities: true }) };
}

test('current tavern IDs and repeatable tasks reproduce two ready cups and one claimed cup', async () => {
  const f = fixture(), actions = f.plan().actions;
  assert.deepEqual(actions.map(a => a.key), ['tavern-task:171114', 'tavern-task:171115']);
  assert.deepEqual(actions.map(a => a.rewards()), [[{ ItemID: 900, ItemNum: 1 }], [{ ItemID: 900, ItemNum: 2 }]]);
  for (const action of actions) assert.equal((await awaitClaim(action, { valid: () => true, timeout: 30, poll: 1 })).status, 'confirmed');
  assert.deepEqual(f.calls, [[171114, 0, 0], [171115, 0, 0]]);
  assert.equal(f.tasks[0].HasAward, false); // Native repeat tasks reset rather than becoming HASAWARD.
});

test('tavern preparation queries current configured IDs, never stale fallback IDs', async () => {
  const f = fixture(), abort = new AbortController(); f.adapter.signal = abort.signal;
  f.manager.reqTaskProgressByIds = ids => { f.calls.push(ids); abort.abort(); };
  await prepareActivities(f.adapter, { activities: true });
  assert.deepEqual(f.calls, [[171114, 171115, 171116]]);
});

test('ordinary task planner cannot duplicate configured tavern tasks; exclusions use native cup rewards', () => {
  const f = fixture(); f.tasks[0].baseVo.maxComplete = 1; f.tasks[0].CanRewardCount = 1;
  const plan = planRewards(f.adapter, { tasks: true, activities: true, excludeCoupon: true });
  assert.deepEqual(plan.actions.map(a => a.key), ['tavern-task:171114', 'tavern-task:171115']);
  assert.equal(planRewards(f.adapter, { tasks: true, activities: false }).actions.length, 0);
  f.adapter.goods = () => ({ name: '抵价券' });
  assert.equal(plan.actions[0].eligible(), false);
  assert.equal(plan.actions[0].send(), false);
});

test('tavern checks native eligibility, selections, costs and round again before sending', () => {
  for (const mutate of [t => { t.CanAward = false; }, t => { t.HasExpired = true; }, t => { t.IsBuyTask = true; },
    t => { t.baseVo.taskSelectReward = [{ id: 1 }]; }, t => { t.TaskConditions = [{ reqType: 30 }]; }]) {
    const f = fixture(), action = f.plan().actions[0]; mutate(f.tasks[0]);
    assert.equal(action.eligible(), false); assert.equal(action.send(), false); assert.equal(f.calls.length, 0);
  }
  const f = fixture(), action = f.plan().actions[0]; f.config.Round++;
  assert.equal(action.eligible(), false); assert.equal(action.done(), false); assert.equal(action.send(), false);
});

test('repeat flag permits native CanAward even at max; other capped tasks stay blocked', () => {
  const f = fixture(); f.tasks[0].TaskCompeleMax = true;
  assert.ok(f.plan().actions.some(a => a.key === 'tavern-task:171114'));
  f.tasks[0].baseVo.IsRepect = false;
  assert.ok(!f.plan().actions.some(a => a.key === 'tavern-task:171114'));
});

test('tavern replies correlate task ID, reject failure and do not count disappeared data as success', () => {
  const f = fixture(), action = f.plan().actions[0], accept = action.confirmations[0].accept;
  assert.equal(accept({ Protocol: { TaskID: 171114, CompleteTimes: 1 } }), true);
  for (const p of [{ TaskID: 171115, CompleteTimes: 1 }, { TaskID: 171114 }, { TaskID: 171114, CompleteTimes: 1, errCode: 2 }]) assert.equal(accept({ Protocol: p }), false);
  assert.equal(action.rejections[0].accept({ Protocol: { TaskID: 171114, ErrorCode: 5 } }), true);
  f.tasks.shift(); assert.equal(action.done(), false);
});

test('tavern discovery finds existing welfare manager through its actual protocol listener', () => {
  const f = fixture();
  const adapter = createNativeAdapter({ window: {}, game: { getClass: () => null,
    getServerProxy: () => ({ _events: { decodeClientTavernInfoRep: { caller: f.welfare } } }) } });
  assert.equal(adapter.manager('WelfareManger'), f.welfare);
});

test('controller confirms repeatable tavern tasks once and preserves ledger across reload', async t => {
  const f = fixture(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const saved = new Map(), settings = { get: (k, fallback) => saved.get(k) ?? fallback, set: (k, v) => saved.set(k, structuredClone(v)) };
  const make = () => createRewardsController({ adapter: f.adapter, settings, scope, timeout: 30, poll: 1 });
  const controller = make(); controller.options({ automatic: true, sign: false, mail: false, welfare: false, codes: false, activities: true, tasks: true });
  await controller.run(); assert.equal(f.calls.length, 2);
  f.tasks[0].CanAward = true; // Stale UI must not cause a second request after reload.
  await make().run(); assert.equal(f.calls.length, 2);
});


test('live 2026-11-14 regression: tavern exists only in modern quest manager', async () => {
  const f = fixture(), quests = { allTasks: f.tasks, GetServerTaskDataByTaskID: id => f.tasks.find(t => t.id === id), UpTaskState(ids) { f.calls.push(['modern-progress', ids]); } };
  for (const task of f.tasks) Object.assign(task, { HasServerData: true, IsFromServer: true, IsNewQusetType: true, TaskConditions: [{ reqType: 127 }] });
  f.manager.GetServerTaskDataByTaskID = () => null;
  f.manager.reqTaskProgressByIds = () => { throw Error('must not query old task protocol'); };
  f.manager.RequestTaskAward = (id, select, count) => { f.calls.push([id, select, count]); const task = quests.GetServerTaskDataByTaskID(id); task.HasAward = true; task.CanAward = false; };
  const original = f.adapter.manager; f.adapter.manager = name => name === 'ActivityQuestManager' ? quests : original(name);
  const abort = new AbortController(); f.adapter.signal = abort.signal;
  quests.UpTaskState = ids => { f.calls.push(['modern-progress', ids]); abort.abort(); };
  await prepareActivities(f.adapter, { activities: true });
  assert.deepEqual(f.calls, [['modern-progress', [171114, 171115, 171116]]]);
  f.adapter.signal = new AbortController().signal;
  const actions = planRewards(f.adapter, { tasks: true, activities: true }).actions;
  assert.deepEqual(actions.map(a => a.key), ['tavern-task:171114', 'tavern-task:171115']);
  const action = actions[0], accept = action.confirmations[0].accept;
  const event = (id, op, result) => ({ Protocol: { Data: { ProtoObj: { quest_id: id, op_type: op, result } } } });
  assert.equal(action.confirmations[0].event, 'decodeUserQuestOpRep');
  assert.equal(accept(event(171114, 1, 0)), true);
  assert.equal(accept(event(171115, 1, 0)), false);
  assert.equal(accept(event(171114, 0, 0)), false);
  assert.equal(accept(event(171114, 1, 5)), false);
  assert.equal(action.rejections[0].accept(event(171114, 1, 5)), true);
  f.tasks[0].HasServerData = false; assert.equal(action.eligible(), false);
  f.tasks[0].HasServerData = true;
  assert.equal((await awaitClaim(action, { valid: () => true, timeout: 30, poll: 1 })).status, 'confirmed');
  assert.deepEqual(f.calls.at(-1), [171114, 0, 0]);
});


test('obfuscated native award discovery excludes the class constructor source', () => {
  const f = fixture();
  class NativeTaskManager {
    GetServerTaskDataByTaskID(id) { return f.tasks.find(t => t.id === id); }
    J(id, select, count) { const selectionWindow = 'TaskRewardSelectWindow'; f.calls.push([id, select, count]); return selectionWindow; }
  }
  const manager = new NativeTaskManager(), original = f.adapter.manager;
  f.adapter.manager = name => name === 'TaskManager' ? manager : original(name);
  const action = f.plan().actions[0]; assert.ok(action); action.send();
  assert.deepEqual(f.calls, [[171114, 0, 0]]);
});
