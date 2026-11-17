import test from 'node:test';
import assert from 'node:assert/strict';
import { planChoiceRewards } from '../src/plugins/daily-rewards/choice-rewards.js';
import { rows, nativeMethod, taskSkipReason } from '../src/plugins/daily-rewards/native.js';
import { createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';
const helpers = { rows, nativeMethod, taskSkipReason };
function fixture(t, modern = false) {
  const sent = [], map = new Map(), scope = new ResourceScope(); t.after(() => scope.dispose());
  const task = { id: 42, completeTimes: 0, IsFromServer: true, HasServerData: true, CanAward: true, HasAward: false,
    baseVo: { name: '任选奖励', maxComplete: 1, HaveSelectReward: true, TaskSelectReward: [{ Id: 7, ItemID: 100, ItemNum: 3 }, { Id: 91, ItemID: 101, ItemNum: 5 }] } };
  const manager = { allTasks: [task], GetServerTaskDataByTaskID: id => id === 42 ? task : null };
  const ordinary = { RequestTaskAward: (...args) => { sent.push(args); task.HasAward = true; task.CanAward = false; } };
  if (!modern) Object.assign(manager, ordinary);
  let account = 'a', day = 'today';
  const adapter = { account: () => account, day: () => day, goods: id => ({ name: `奖励${id}`, type: 1, desc: '物品说明' }),
    manager: name => name === 'TaskManager' ? (modern ? ordinary : manager) : name === 'ActivityQuestManager' && modern ? manager : null };
  const settings = new Settings({ getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }, 'test:');
  const controller = createRewardsController({ adapter, settings, scope, timeout: 15, poll: 1 });
  const plan = () => planChoiceRewards(adapter, helpers);
  const click = () => { const state = controller.snapshot(), c = state.choices[0]; return { account: state.account, day: state.date, key: c.key, fingerprint: c.fingerprint, optionId: 91 }; };
  return { sent, task, manager, ordinary, adapter, settings, scope, controller, plan, click, setAccount: v => account = v, setDay: v => day = v };
}
test('native option Id is used for old and new tasks with count zero; never auto choose', async t => {
  for (const modern of [false, true]) {
    const f = fixture(t, modern);
    assert.match(taskSkipReason(f.task), /需要选择/);
    assert.deepEqual(f.sent, []); assert.equal(f.controller.snapshot().config.automatic, false);
    const click = f.click(); assert.equal(await f.controller.claimChoice(click), true);
    assert.deepEqual(f.sent, [[42, 91, 0]]); assert.equal(f.controller.snapshot().choices.length, 0);
    await f.controller.claimChoice(click); assert.equal(f.sent.length, 1);
  }
});
test('stale account, day, reward schema and invented option IDs send nothing', async t => {
  for (const change of [f => f.setAccount('b'), f => f.setDay('tomorrow'), f => f.task.baseVo.TaskSelectReward[1].ItemNum++, f => f.task.HasAward = true]) {
    const f = fixture(t); const click = f.click(); change(f);
    assert.equal(await f.controller.claimChoice(click), false); assert.deepEqual(f.sent, []);
  }
  const f = fixture(t); assert.equal(await f.controller.claimChoice({ ...f.click(), optionId: 1 }), false); assert.deepEqual(f.sent, []);
});
test('choice approval removes only selection gate; consumption, return, expiry and repeat remain blocked', t => {
  for (const change of [f => f.task.HasExpired = true, f => f.task.IsBuyTask = true,
    f => f.task.baseVo.maxComplete = 3, f => f.task.baseVo._rewardItem = { ReturnReward: {} },
    f => f.task.TaskConditions = [{ reqType: 30 }], f => f.task.baseVo.prevTask = 9]) {
    const f = fixture(t); change(f); assert.equal(f.plan()[0].action(91), null); assert.deepEqual(f.sent, []);
  }
});
test('malformed/duplicate option IDs and missing or ownership-sensitive goods cannot be sent', t => {
  for (const mutate of [f => f.task.baseVo.TaskSelectReward[1].Id = 7, f => f.task.baseVo.TaskSelectReward[1].ItemNum = -1]) {
    const f = fixture(t); mutate(f); assert.equal(f.plan().length, 0);
  }
  for (const goods of [null, { type: 25 }, { type: 36 }, { type: 124 }]) {
    const f = fixture(t); f.adapter.goods = () => goods; assert.equal(f.plan()[0].action(91), null);
  }
});
test('timeout survives reload and blocks changed selection and double-clicks', async t => {
  const f = fixture(t); f.manager.RequestTaskAward = (...args) => f.sent.push(args);
  const click = f.click(), first = f.controller.claimChoice(click);
  assert.equal(await f.controller.claimChoice({ ...click, optionId: 7 }), false);
  assert.equal(await first, false); assert.equal(f.sent.length, 1);
  assert.match(f.controller.snapshot().choices[0].reason, /通常尚未满足领取条件/);
  const again = createRewardsController({ adapter: f.adapter, settings: f.settings, scope: f.scope });
  assert.equal(await again.claimChoice(click), false); assert.equal(f.sent.length, 1);
});
test('persistence failure and disposed scope cannot send', async t => {
  const f = fixture(t), click = f.click(); f.settings.set = () => { throw Error('disk'); };
  assert.equal(await f.controller.claimChoice(click), false); assert.deepEqual(f.sent, []);
  f.scope.dispose(); assert.equal(await f.controller.claimChoice(click), false);
});
test('modern response requires exact task and operation, result zero', t => {
  const f = fixture(t, true); f.adapter.proxy = () => ({});
  const action = f.plan()[0].action(91), yes = action.confirmations[0].accept;
  const p = (quest_id, op_type, result) => ({ Protocol: { Data: { ProtoObj: { quest_id, op_type, result } } } });
  assert.equal(yes(p(42,1,0)), true);
  for (const packet of [p(43,1,0),p(42,0,0),p(42,1,203),p(42,1,undefined)]) assert.equal(yes(packet), false);
});
