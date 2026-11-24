import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { mountPokerStreak } from '../src/plugins/poker-lobby/streak.js';

class Events {
  entries = [];
  on(event, owner, handler) { this.entries.push({ event, owner, handler }); }
  off(event, owner, handler) {
    this.entries = this.entries.filter(entry => entry.event !== event || entry.owner !== owner || entry.handler !== handler);
  }
  emit(event, value) {
    for (const entry of [...this.entries]) if (entry.event === event) entry.handler.call(entry.owner, value);
  }
}

function fixture() {
  const scope = new ResourceScope();
  const calls = [];
  const activity = Object.assign(new Events(), {
    SendActivitysetData: kind => calls.push(['read', kind]),
    SendDDZ2023StreakWinAwardReq: id => calls.push(['claim', id]),
    DDZ2023HisWeekWinCtn: 9,
  });
  const proxy = new Events();
  let account = '123';
  const badge = Object.assign(new Events(), {
    visible: true,
    UpdateCnt(value) { this.count = value; },
  });
  const items = [3, 5, 7, 9].map((wins, index) => ({
    rewardData: { Id: index + 1, RequireSuccessNum: wins }, bg: new Events(),
    canGet: { visible: true }, hadGet: { visible: false }, redPoint: { visible: true }, oldReturnDoubleTag: { visible: true },
    onGetReward() { calls.push(['stock', index + 1]); },
    UpdateState() {
      this.bg.off('click', this, this.onGetReward);
      this.bg.on('click', this, this.onGetReward);
    },
  }));
  items.forEach(item => item.UpdateState());
  const stockUpdate = () => {};
  const view = { lianShengUI: badge, hisWinCount: { innerHTML: '普通状态' }, proBar: { value: 1 },
    showStreakTip: stockUpdate, winStreakItems: items, updateWinCtn: stockUpdate, updateProg: stockUpdate };
  badge.on('click', view, view.showStreakTip);
  const scene = { winStreakView: view };
  const ctx = { scope, native: { account: () => ({ id: account }), manager: () => activity },
    game: { getServerProxy: () => proxy, getScene: () => scene }, notify: () => {} };
  assert.equal(mountPokerStreak(ctx, scene, { Event: { CLICK: 'click' } }), true);
  return { scope, activity, proxy, view, badge, items, calls, stockUpdate,
    account(value) { account = value; },
    click: index => items[index].bg.emit('click'),
    reply: data => proxy.emit('ClientActivitysetDataRep', { Protocol: data }),
  };
}

test('Poker streak reuses stock boxes and only submits an eligible manual claim', t => {
  const { scope, proxy, view, badge, items, calls, account, click, reply } = fixture();
  t.after(() => scope.dispose());
  assert.deepEqual(calls, [['read', 32], ['read', 18]]);
  assert.equal(view.hisWinCount.innerHTML, '连胜数据待加载');
  assert.ok(!badge.visible);
  click(0);
  reply({ msgType: 18, DdzData: { ddz2023WeeklyHisStreakWinCnt: 9, ddz2023WeeklyWinAward: [2] } });
  assert.ok(items[1].hadGet.visible);
  assert.ok(items.every(item => !item.redPoint.visible));
  reply({ msgType: 32, pokerDDZData: { weekly_streak_win: 4, weekly_max_streak_win: 7 } });
  assert.equal(badge.count, 7);
  assert.equal(view.hisWinCount.innerHTML, '当前连胜：4');
  assert.equal(view.proBar.value, 1 / 6);
  assert.deepEqual(items.map(item => item.canGet.visible), [true, false, true, false]);
  click(3);
  click(1);
  click(0);
  click(0);
  click(2);
  assert.deepEqual(calls, [['read', 32], ['read', 18], ['claim', 1]]);
  proxy.emit('ClientDDZ2023StreakWinAwardRep', { Protocol: { rewardId: 1, result: 3 } });
  assert.ok(items[0].hadGet.visible);
  assert.ok(items[2].canGet.visible);
  account('456');
  click(2);
  assert.equal(calls.length, 3);
});

test('Poker streak distinguishes a decoded zero and restores the stock view on exit', () => {
  const { scope, proxy, activity, view, badge, items, reply, stockUpdate } = fixture();
  try {
    reply({ msgType: 32, pokerDDZData: { game_times: 1 } });
    assert.equal(badge.count, 0);
    assert.equal(view.hisWinCount.innerHTML, '当前连胜：0');
    assert.ok(badge.visible);
    reply({ msgType: 32 });
    assert.equal(view.hisWinCount.innerHTML, '连胜数据待加载');
  } finally { scope.dispose(); }
  assert.equal(proxy.entries.length, 0);
  assert.equal(activity.entries.length, 0);
  assert.equal(view.updateWinCtn, stockUpdate);
  assert.equal(view.updateProg, stockUpdate);
  assert.equal(view.hisWinCount.innerHTML, '普通状态');
  assert.equal(view.proBar.value, 1);
  assert.ok(items.every(item => item.oldReturnDoubleTag.visible && item.bg.entries[0].handler === item.onGetReward));
});
