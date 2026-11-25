import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { createPokerForcedMatchSession, forcedMatchLabel, forcedMatchStatus } from '../src/plugins/poker-lobby/forced-match.js';

function matchFixture() {
  const scope = new ResourceScope();
  const listeners = new Map();
  const calls = [];
  const logs = [];
  const proxy = {
    AddEventListener(id, owner, handler) { listeners.set(id, { owner, handler }); },
    RemoveEventListener(id, owner, handler) {
      assert.deepEqual(listeners.get(id), { owner, handler });
      listeners.delete(id);
    },
  };
  const manager = {
    SendEnterPage(...args) { calls.push(['enter', ...args]); },
    Bt(...args) { calls.push(['queue', ...args]); },
  };
  const room = { Ft(...args) { calls.push(['ready', ...args]); } };
  const match = createPokerForcedMatchSession({ scope, proxy, manager, room, account: '99', onChange: () => {},
    log: (event, result) => logs.push(result === undefined ? [event] : [event, result]) });
  const reply = (id, data) => listeners.get(id).handler({ Protocol: { Id: id, ...data } });
  return { scope, listeners, calls, logs, match, reply, room, manager };
}

test('直接匹配按原生协议发送入场、匹配和取消，并记录各步结果', t => {
  const f = matchFixture();
  t.after(() => f.scope.dispose());
  assert.equal(f.match.state.step, 'idle');
  assert.equal(f.match.enter(), true);
  assert.deepEqual(f.calls, [['enter', 2, 175, 2]]);
  assert.equal(f.match.state.step, 'entering');
  assert.equal(f.match.enter(), false);

  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  assert.equal(f.match.state.step, 'entered');
  assert.equal(f.match.start(), true);
  assert.deepEqual(f.calls.at(-1), ['queue', 1, 175, 0, 2]);
  assert.equal(f.match.state.step, 'matching');

  f.reply(20546, { model: 148, opType: 1, result: 1 });
  assert.equal(f.match.state.step, 'matching');
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  assert.equal(f.match.state.step, 'queued');

  assert.equal(f.match.cancel(), true);
  assert.deepEqual(f.calls.at(-1), ['queue', 2, 175, 0, 2]);
  f.reply(20546, { model: 175, opType: 2, result: 1001 });
  assert.equal(f.match.state.step, 'queued');
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 72 });
  assert.equal(f.match.state.step, 'seated');
  assert.equal(f.match.state.table, 72);

  assert.deepEqual(f.logs, [['进入初级场'], ['入场结果', 1], ['开始匹配'], ['匹配结果', 1],
    ['取消匹配'], ['取消匹配结果', 1001], ['已分配牌桌']]);
  f.scope.dispose();
  assert.equal(f.listeners.size, 0);
});

test('确认后入场成功即自动发起匹配，入场被拒时不发送匹配', t => {
  const f = matchFixture();
  t.after(() => f.scope.dispose());
  assert.equal(f.match.enter({ autoStart: true }), true);
  assert.deepEqual(f.calls, [['enter', 2, 175, 2]]);
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  assert.equal(f.match.state.step, 'matching');
  assert.deepEqual(f.calls, [['enter', 2, 175, 2], ['queue', 1, 175, 0, 2]]);
  assert.equal(f.match.start(), false);
  assert.deepEqual(f.logs, [['进入初级场'], ['入场结果', 1], ['开始匹配']]);

  // 取消成功后停在已入场，下一次点击才重新匹配。
  assert.equal(f.match.cancel(), true);
  f.reply(20546, { model: 175, opType: 2, result: 1000 });
  assert.equal(f.match.state.step, 'entered');
  assert.deepEqual(f.calls.at(-1), ['queue', 2, 175, 0, 2]);

  f.match.start();
  f.reply(20546, { model: 175, opType: 1, result: 27 });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.match.enter({ autoStart: true }), true);
  f.reply(20402, { Result: 26, LabelModel: 175, SectionKind: 2, why: '经典版未开放' });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.match.state.error, '经典版未开放');
  assert.deepEqual(f.calls.slice(-2), [['queue', 1, 175, 0, 2], ['enter', 2, 175, 2]]);

  // 无分页回复同样视为入场成功。
  assert.equal(f.match.enter({ autoStart: true }), true);
  f.reply(20402, { Result: 2, LabelModel: 175, SectionKind: 2 });
  assert.equal(f.match.state.step, 'matching');
  assert.deepEqual(f.calls.at(-1), ['queue', 1, 175, 0, 2]);

  // 自动发起时匹配请求发送失败，保留失败原因。
  f.reply(20546, { model: 175, opType: 1, result: 27 });
  assert.equal(f.match.state.step, 'failed');
  f.manager.Bt = () => { throw new Error('offline'); };
  assert.equal(f.match.enter({ autoStart: true }), true);
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.match.state.error, '匹配请求发送失败：offline');
  assert.equal(f.logs.at(-1)[0], '匹配请求发送失败');
});

test('入座后可发送准备并跟随开局通知', t => {
  const f = matchFixture();
  t.after(() => f.scope.dispose());
  f.match.enter();
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  f.match.start();
  f.reply(20546, { model: 175, opType: 1, result: 1 });
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 88 });
  assert.equal(f.match.state.step, 'seated');

  assert.equal(f.match.ready(), true);
  assert.deepEqual(f.calls.at(-1), ['ready', true]);
  assert.equal(f.match.state.prepared, false);
  f.reply(21204, { Result: 1 });
  assert.equal(f.match.state.prepared, true);
  assert.equal(forcedMatchLabel(f.match.state), '等待开局');
  f.reply(21208, { IsGameStart: true, Infos: [{}, {}, {}] });
  assert.equal(f.match.state.step, 'started');
  assert.equal(f.match.ready(), false);
  assert.equal(forcedMatchLabel(f.match.state), '开始匹配');
  assert.equal(forcedMatchStatus(f.match.state), '已开局，正在进入牌桌。');
  assert.deepEqual(f.logs.slice(-3), [['发送准备'], ['准备结果', 1], ['已开局']]);
});

test('保留服务端拒绝原因，忽略其他场次回包，原话不进入日志', t => {
  const f = matchFixture();
  t.after(() => f.scope.dispose());
  f.match.enter();
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 3 });
  assert.equal(f.match.state.step, 'entering');
  f.reply(20402, { Result: 26, LabelModel: 175, SectionKind: 2, why: '经典版未开放' });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.match.state.error, '经典版未开放');
  assert.equal(forcedMatchStatus(f.match.state), '经典版未开放');
  assert.deepEqual(f.logs, [['进入初级场'], ['入场结果', 26]]);

  assert.equal(f.match.enter(), true);
  f.reply(20402, { Result: 2, LabelModel: 175, SectionKind: 2 });
  f.match.start();
  f.reply(20546, { model: 175, opType: 1, result: 27 });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.match.state.error, '匹配失败：禁止匹配');
  f.reply(20504, { Result: 1, RealModel: 175, GroupID: 2, TableID: 73 });
  assert.equal(f.match.state.step, 'failed');
  assert.equal(f.logs.at(-1)[0], '匹配结果');
});

test('跳过旧场次桌号，并跟随本方随原生开局确认的新桌', t => {
  const f = matchFixture();
  t.after(() => f.scope.dispose());
  f.match.enter();
  f.reply(20402, { Result: 1, LabelModel: 175, SectionKind: 2 });
  f.match.start();
  f.room.TableId = 217000077;
  assert.equal(f.match.sync({ tableId: f.room.TableId, gameStart: false }), false);
  assert.equal(f.match.state.step, 'matching');
  assert.equal(f.match.state.table, 0);

  f.room.TableId = 217500081;
  f.reply(21208, { IsGameStart: true, Infos: [{ ClientID: 41 }, { ClientID: 42 }, { ClientID: 43 }] });
  assert.equal(f.match.state.step, 'matching');
  f.reply(21208, { IsGameStart: true, Infos: [{ ClientID: 99 }, { ClientID: 42 }, { ClientID: 43 }] });
  assert.equal(f.match.state.step, 'started');
  assert.equal(f.match.state.table, f.room.TableId);
  assert.deepEqual(f.calls, [['enter', 2, 175, 2], ['queue', 1, 175, 0, 2]]);
});

test('工具箱只在入座后提供准备，开局与错误详情由状态文字说明', () => {
  const label = (step, extra = {}) => forcedMatchLabel({ step, prepared: false, ...extra });
  assert.deepEqual(['idle', 'entering', 'entered', 'matching', 'queued', 'cancelling', 'seated', 'started', 'failed']
    .map(step => [step, label(step)]), [
    ['idle', '开始匹配'], ['entering', '取消匹配'], ['entered', '开始匹配'], ['matching', '取消匹配'],
    ['queued', '取消匹配'], ['cancelling', '取消匹配'], ['seated', '发送准备'], ['started', '开始匹配'], ['failed', '开始匹配'],
  ]);
  assert.equal(label('seated', { prepared: true }), '等待开局');
  assert.equal(forcedMatchStatus({ step: 'idle' }), '经典版尚未开放此场次，将直接向服务器请求匹配。');
  assert.equal(forcedMatchStatus({ step: 'seated', prepared: true }), '已准备，等待开局。');
  assert.equal(forcedMatchStatus({ step: 'cancelling' }), '正在取消匹配…');
  assert.equal(forcedMatchStatus({ step: 'failed', error: '匹配失败：禁止匹配' }), '匹配失败：禁止匹配');
});
