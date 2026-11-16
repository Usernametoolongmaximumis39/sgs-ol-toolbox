import test from 'node:test';
import assert from 'node:assert/strict';
import { planActivityQuests } from '../src/plugins/daily-rewards/quest-rewards.js';
import { rows, nativeMethod, taskSkipReason, createNativeAdapter, planRewards } from '../src/plugins/daily-rewards/native.js';

const helpers = { rows, nativeMethod, taskSkipReason };
function alternativeFixture() {
  const f = fixture({ condition: 19 });
  f.data.delete(f.task.id); f.task.id = 55613; f.data.set(f.task.id, f.task);
  f.task.IsNewQusetType = true;
  Object.assign(f.task.baseVo, { name: '实力提升', desc: '开启1个招募令或1个皮肤包', reqConditionCount: 1 });
  f.task.TaskConditions = [{ reqType: 19, MaxCount: 1 }, { reqType: 19, MaxCount: 1 }];
  f.task.progress = [1, 0];
  Object.defineProperties(f.task, {
    CanAward: { configurable: true, get() {
      return !this.HasAward && this.TaskConditions.filter((c, i) => this.progress[i] >= c.MaxCount).length >= this.baseVo.reqConditionCount;
    } },
    CanRewardCount: { configurable: true, get() {
      return Math.min(this.baseVo.maxComplete - this.completeTimes,
        ...this.TaskConditions.map((c, i) => Math.floor(this.progress[i] / c.MaxCount)));
    } },
  });
  return f;
}

test('55613 alternative progress can be claimable with zero batch count; use native single count zero', () => {
  for (const progress of [[1, 0], [0, 1]]) {
    const f = alternativeFixture(); f.task.progress = progress;
    assert.equal(f.task.CanAward, true); assert.equal(f.task.CanRewardCount, 0);
    const action = f.plan().actions[0]; assert.ok(action);
    assert.equal(action.key, 'quest:55613:0'); assert.deepEqual(f.sent, []);
    action.send(); assert.deepEqual(f.sent, [['ordinary', 55613, 0, 0]]);
    assert.equal(action.done(), true); assert.equal(action.send(), false);
    assert.equal(f.plan().actions.length, 0);
  }
});

test('zero-count single claims retain all safety gates and recheck progress before sending', () => {
  for (const change of [
    f => { f.task.progress = [0, 0]; },
    f => { f.task.HasServerData = false; },
    f => { f.task.IsFromServer = false; },
    f => { f.task.IsNewQusetType = false; },
    f => { f.task.baseVo.maxComplete = 3; },
    f => { f.task.baseVo.HaveSelectReward = true; },
    f => { f.task.IsBuyTask = true; },
    f => { f.task.HasExpired = true; },
    f => { f.task.TaskConditions[1].reqType = 30; },
    f => { f.task.baseVo.desc = '消耗道具兑换'; },
  ]) {
    const f = alternativeFixture(); const action = f.plan().actions[0];
    change(f); assert.equal(f.plan().actions.length, 0);
    assert.equal(action.eligible(), false); assert.equal(action.send(), false); assert.deepEqual(f.sent, []);
  }
});

test('zero-count quest fallback sends native count zero and waits for authoritative confirmation', () => {
  const f = alternativeFixture(); delete f.managers.TaskManager;
  f.manager.RequestTaskAward = (...args) => f.sent.push(args);
  const action = f.plan().actions[0]; action.send();
  assert.deepEqual(f.sent, [[55613, 0, 0]]); assert.equal(action.done(), false);
  const accept = action.confirmations[0].accept;
  assert.equal(accept({ Protocol: { Data: { ProtoObj: { quest_id: 55613, op_type: 1, result: 0 } } } }), true);
  assert.equal(accept({ Protocol: { Data: { ProtoObj: { quest_id: 55600, op_type: 1, result: 0 } } } }), false);
});

function fixture({ maximum = 1, condition = 6 } = {}) {
  const sent = [], data = new Map(), proxy = {};
  const task = {
    id: 7001, IsFromServer: true, HasServerData: true, completeTimes: 0,
    baseVo: { name: '登录游戏', maxComplete: maximum, TaskRewardItem: [{ ItemID: 123, ItemNum: 1 }] },
    TaskConditions: [{ reqType: condition }],
    get CanAward() { return !this.HasAward; },
    get CanRewardCount() { return this.baseVo.maxComplete - this.completeTimes; },
    get HasAward() { return this.completeTimes >= this.baseVo.maxComplete; },
    get TaskCompeleMax() { return this.completeTimes >= this.baseVo.maxComplete; },
  };
  data.set(task.id, task);
  const manager = {
    allTasks: [task], getTaskListFromServer() {}, UpTaskState() {}, GetServerTaskDataByTaskID: id => data.get(id),
    RequestTaskAward(...args) { sent.push(['new', ...args]); task.completeTimes++; },
  };
  const ordinary = { GetServerTaskDataByTaskID: () => undefined, RequestTaskAward(...args) { sent.push(['ordinary', ...args]); task.completeTimes++; } };
  const managers = { ActivityQuestManager: manager, TaskManager: ordinary };
  const adapter = { manager: name => managers[name], proxy: () => proxy };
  return { task, manager, ordinary, managers, adapter, sent, data, plan: () => planActivityQuests(adapter, { tasks: true }, helpers) };
}

test('new quest manager is discovered from its protocol caller without creating managers', () => {
  const f = fixture(), adapter = createNativeAdapter({ window: {}, game: { getClass: () => null, getServerProxy: () => ({ _events: { decodeUserQuestInfoRep: [{ caller: f.manager }] } }) } });
  assert.equal(adapter.manager('ActivityQuestManager'), f.manager);
});

test('real native numeric dictionary datum getter exposes server quests despite an empty object-key bucket', () => {
  const f = fixture();
  f.manager.allTasks = { _maps: { 7001: f.task }, _objDatum: [], get datum() { return [...Object.values(this._maps), ...this._objDatum]; } };
  assert.equal(f.plan().actions.length, 1);
});

test('existing server activity quest uses ordinary native route and preserves reward metadata', () => {
  const f = fixture(), action = f.plan().actions[0];
  assert.equal(action.key, 'quest:7001:0'); assert.equal(action.workflowGroup, 'quest:7001');
  assert.deepEqual(action.rewards(), [{ ItemID: 123, ItemNum: 1 }]); assert.deepEqual(f.sent, []);
  assert.equal(action.eligible(), true); assert.equal(action.done(), false); action.send();
  assert.deepEqual(f.sent, [['ordinary', 7001, 0, 1]]); assert.equal(action.done(), true); assert.equal(action.eligible(), false);
  assert.equal(action.send(), false); assert.equal(f.plan().actions.length, 0);
});

test('passive repeat rewards claim exactly one per ordinal and confirm counter growth before max completion', () => {
  const f = fixture({ maximum: 3 }), keys = [];
  for (let i = 0; i < 3; i++) {
    const action = f.plan().actions[0]; assert.ok(action, `missing ordinal ${i}`); keys.push(action.key);
    assert.equal(action.eligible(), true); action.send(); assert.equal(action.done(), true);
    if (i < 2) assert.equal(f.task.HasAward, false);
  }
  assert.deepEqual(keys, ['quest:7001:0', 'quest:7001:1', 'quest:7001:2']);
  assert.deepEqual(f.sent, Array.from({ length: 3 }, () => ['ordinary', 7001, 0, 1]));
  assert.equal(f.plan().actions.length, 0);
  for (const condition of [1, 2, 3, 4, 6, 7]) assert.equal(fixture({ maximum: 2, condition }).plan().actions.length, 1);
});

test('repeat relaxation never admits consumption, choice, purchase, expired, unsynced or unknown-condition tasks', () => {
  for (const change of [
    f => { f.task.HasServerData = false; }, f => { f.task.IsFromServer = false; },
    f => { f.task.baseVo.HaveSelectReward = true; }, f => { f.task.IsBuyTask = true; },
    f => { f.task.HasExpired = true; }, f => { f.task.baseVo.EffectClientTime = false; },
    f => { f.task.TaskConditions.push({ reqType: 30 }); }, f => { f.task.TaskConditions[0].reqType = 999; },
    f => { f.task.baseVo.name = '消耗道具兑换'; }, f => { f.task.id = 161114; f.manager.GetServerTaskDataByTaskID = () => f.task; },
  ]) {
    const f = fixture({ maximum: 3 }); change(f); assert.equal(f.plan().actions.length, 0);
    assert.deepEqual(f.sent, []);
  }
});

test('quest op responses require matching quest, complete operation and an explicit success or failure result', () => {
  const f = fixture(), action = f.plan().actions[0], success = action.confirmations[0].accept, failure = action.rejections[0].accept;
  const packet = data => ({ Protocol: { Data: { ProtoObj: data } } });
  assert.equal(success(packet({ quest_id: 7001, op_type: 1, result: 0 })), true);
  for (const data of [{ quest_id: 7002, op_type: 1, result: 0 }, { quest_id: 7001, op_type: 0, result: 0 }, { quest_id: 7001, op_type: 1 }, { quest_id: 7001, op_type: 1, result: 203 }]) assert.equal(success(packet(data)), false);
  assert.equal(failure(packet({ quest_id: 7001, op_type: 1, result: 203 })), true);
  assert.equal(failure(packet({ quest_id: 7001, op_type: 0, result: 203 })), false);
});

test('queued quest rechecks eligibility, predecessor and live native request owner before sending', () => {
  const f = fixture(), action = f.plan().actions[0];
  f.task.TaskConditions.push({ reqType: 30 }); assert.equal(action.eligible(), false); assert.equal(action.send(), false);
  f.task.TaskConditions.pop(); f.task.baseVo.prevTask = 88; assert.equal(action.eligible(), false);
  f.data.set(88, { HasAward: true }); assert.equal(action.eligible(), true);
  f.managers.TaskManager = {}; assert.equal(action.eligible(), false); assert.equal(action.send(), false); assert.deepEqual(f.sent, []);
});

test('unique new-manager native signature is a fallback and ambiguous signatures are refused', () => {
  const f = fixture(); delete f.managers.TaskManager; delete f.manager.RequestTaskAward;
  f.manager.proxy = { N: (...args) => f.sent.push(args) };
  f.manager.J = function (id, reward, count) { const message = { quest_id: id, op_type: 1, reward_idx: reward, count }; this.proxy.N('CLIENT_QUEST_OP_REQ', message); };
  const action = f.plan().actions[0]; assert.ok(action); action.send();
  assert.deepEqual(f.sent, [['CLIENT_QUEST_OP_REQ', { quest_id: 7001, op_type: 1, reward_idx: 0, count: 1 }]]);
  f.manager.K = function (id, reward, count) { const message = { quest_id: id, op_type: 1, reward_idx: reward, count }; this.proxy.N('CLIENT_QUEST_OP_REQ', message); };
  assert.equal(f.plan().actions.length, 0); assert.match(f.plan().notes[0].text, /入口尚未匹配/);
});

test('disabled task category and unowned quest records never request acceptance or rewards', () => {
  const f = fixture();
  assert.deepEqual(planActivityQuests(f.adapter, {}, helpers), { actions: [], notes: [] });
  f.manager.GetServerTaskDataByTaskID = () => undefined;
  f.manager.RequestAcceptTask = () => { throw new Error('must not accept'); };
  assert.equal(f.plan().actions.length, 0); assert.deepEqual(f.sent, []);
});

test('live G1t login rows are ordinary rewards when native HaveSelectReward is false', () => {
  const f = fixture({ condition: 7 });
  f.task.IsNewQusetType = true;
  f.task.baseVo = { name: '今日登录', maxComplete: 1, HaveSelectReward: false,
    TaskRewardItem: [{ ItemID: 11981101, ItemNum: 15 }, { ItemID: 11987201, ItemNum: 45 }, { ItemID: 100002, ItemNum: 15 }],
    TaskSelectReward: [{ Id: 1, ItemID: 11981101, ItemNum: 15 }, { Id: 2, ItemID: 11987201, ItemNum: 45 }, { Id: 3, ItemID: 100002, ItemNum: 15 }] };
  assert.equal(taskSkipReason(f.task), '');
  const action = f.plan().actions[0]; assert.ok(action); action.send();
  assert.deepEqual(f.sent, [['ordinary', 7001, 0, 1]]);
  f.task.completeTimes = 0; f.task.baseVo.HaveSelectReward = true;
  assert.match(taskSkipReason(f.task), /需要选择/); assert.equal(f.plan().actions.length, 0);
  f.task.baseVo.HaveSelectReward = false; delete f.task.IsNewQusetType;
  assert.match(taskSkipReason(f.task), /需要选择/);
});

test('completed recharge claims two available rewards out of seven, then stops', () => {
  const f = fixture({ maximum: 7, condition: 61 });
  f.task.IsNewQusetType = true; f.task.baseVo.name = '单笔充值3000元宝';
  Object.defineProperties(f.task, {
    CanAward: { configurable: true, get() { return this.completeTimes < 2; } },
    CanRewardCount: { configurable: true, get() { return Math.max(0, 2 - this.completeTimes); } },
  });
  for (let i = 0; i < 2; i++) {
    const action = f.plan().actions[0]; assert.ok(action); action.send(); assert.equal(action.done(), true);
    assert.equal(action.send(), false);
  }
  assert.equal(f.plan().actions.length, 0);
  assert.deepEqual(f.sent, [['ordinary', 7001, 0, 1], ['ordinary', 7001, 0, 1]]);
});

test('recharge exception retains cost, selection, expiry and server gates', () => {
  for (const mutate of [
    f => { f.task.TaskConditions.push({ reqType: 30 }); },
    f => { f.task.baseVo.HaveSelectReward = true; },
    f => { f.task.HasExpired = true; },
    f => { f.task.HasServerData = false; },
    f => { f.task.baseVo.desc = '扣除道具'; },
    f => { f.task.baseVo.name = '充值兑换元宝'; },
    f => { f.task.TaskConditions[0].reqType = 999; },
  ]) {
    const f = fixture({ maximum: 7, condition: 61 });
    f.task.IsNewQusetType = true; f.task.baseVo.name = '单笔充值3000元宝';
    const action = f.plan().actions[0]; assert.ok(action); mutate(f);
    assert.equal(action.send(), false); assert.equal(f.plan().actions.length, 0); assert.deepEqual(f.sent, []);
  }
});

test('recharge mixed coupon reward stays excluded as a whole claim', () => {
  const f = fixture({ maximum: 7, condition: 61 });
  f.task.baseVo.name = '单笔充值3000元宝';
  f.adapter.day = () => '2026-11-15';
  f.adapter.goods = id => ({ name: id === 2 ? '抵价券' : '元宝' });
  assert.equal(planRewards(f.adapter, { tasks: true, excludeCoupon: true }).actions.length, 1);
  f.task.baseVo.TaskRewardItem.push({ ItemID: 2, ItemNum: 1 });
  const plan = planRewards(f.adapter, { tasks: true, excludeCoupon: true });
  assert.equal(plan.actions.length, 0); assert.ok(plan.notes.some(n => n.text.includes('抵价券')));
  assert.deepEqual(f.sent, []);
});

