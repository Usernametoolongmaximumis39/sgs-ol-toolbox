import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceScope } from '../src/core/resources.js';
import { getPokerModeConfig, installPokerActivityEntry } from '../src/plugins/poker-lobby/activity-entry.js';

class Events {
  listeners = [];
  on(event, owner, handler) { this.listeners.push({ event, owner, handler }); }
  off(event, owner, handler) {
    this.listeners = this.listeners.filter(row => row.event !== event || row.owner !== owner || row.handler !== handler);
  }
  emit(event) {
    for (const entry of this.listeners.slice()) {
      if (entry.event === event) entry.handler.call(entry.owner);
    }
  }
}

const row = id => ({ ModeVo: { ModeID: id } });
const ids = view => view.modeDataList.map(item => item.ModeVo.ModeID);

class ActivityCard {
  ModeBtn = new Events();
  gotoU3dBtn = new Events();
  ruleBtn = new Events();
  constructor(calls) {
    this.calls = calls;
    this.ModeBtn.on('click', this, this.onEnterMode);
    this.gotoU3dBtn.on('click', this, this.onGotoU3dClick);
    this.ruleBtn.on('click', this, this.onRuleClick);
  }
  onEnterMode() { this.calls.push(['stock card', this.data.ModeID]); }
  onGotoU3dClick() { this.calls.push(['remake redirect']); }
  onRuleClick() { this.calls.push(['stock rules', this.data.ModeTips]); }
}

class ActivityModeView {
  pageItemCtn = 5;
  curPage = 1;
  pageTxt = {};
  leftArr = {};
  rightArr = {};
  constructor(calls, modes) {
    this.modeDataList = modes.map(row);
    this.items = Array.from({ length: this.pageItemCtn }, () => new ActivityCard(calls));
  }
  updateItems(page) {
    for (let index = 0; index < this.pageItemCtn; index += 1) {
      const card = this.items[index];
      const data = this.modeDataList[(page - 1) * this.pageItemCtn + index]?.ModeVo;
      card.visible = Boolean(data);
      if (!data) continue;
      card.data = data;
      card.gotoU3dBtn.visible = data.ModeID === 175;
    }
  }
}

function createFixture(modes) {
  const calls = [];
  const scope = new ResourceScope();
  const view = new ActivityModeView(calls, modes);
  const stack = new Events();
  let scene = { SceneName: 'ModeScene', viewStack: stack };
  let sceneChanged;
  const ctx = {
    scope, window: { Laya: { Event: { CLICK: 'click' } } },
    game: {
      getClass: name => name === 'ActivityModeView' ? ActivityModeView : null,
      getScene: () => scene,
      onSceneChange(listener) { sceneChanged = listener; return () => { sceneChanged = null; }; },
      getConfigData: () => ({ Root: { modes: { content: [
        { Model: 175, Section: 3, ModelBelongDesc: '其他分区' },
      ], content__2: [{ Model: 175, Section: 2, ModelBelongDesc: '官方规则' }] } } }),
    },
    notify: text => calls.push(['notice', text]),
  };
  return { ctx, calls, view, stack, changeScene(next) { scene = next; sceneChanged(next); } };
}

test('activates the original card only in the selected activity view and restores recycled slots', async () => {
  const { ctx, calls, view, stack, changeScene } = createFixture([10, 20, 30, 40, 160]);
  const original = ActivityModeView.prototype.updateItems;
  installPokerActivityEntry(ctx, () => calls.push(['poker lobby']));
  assert.deepEqual(ids(view), [10, 20, 30, 40, 160]);
  stack.selectedChild = view;
  stack.emit('VIEW_STACK_SELECTED_PAGE_CHANGED');
  assert.deepEqual(ids(view), [10, 20, 30, 40, 160, 175]);
  assert.equal(Object.hasOwn(view, 'updateItems'), true);
  assert.equal(ActivityModeView.prototype.updateItems, original);
  assert.equal(view.pageTxt.text, '1/2');

  view.updateItems(2);
  const reused = view.items[0];
  assert.equal(reused.data.ModeID, 175);
  assert.equal(reused.data.ResourceModeId, 175);
  assert.equal(reused.gotoU3dBtn.visible, false);
  reused.ModeBtn.emit('click');
  reused.gotoU3dBtn.emit('click');
  reused.ruleBtn.emit('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [['poker lobby'], ['poker lobby'], ['stock rules', '官方规则']]);
  assert.equal((await getPokerModeConfig(ctx)).Section, 2);

  view.updateItems(1);
  assert.equal(reused.data.ModeID, 10);
  reused.ModeBtn.emit('click');
  assert.deepEqual(calls.at(-1), ['stock card', 10]);

  stack.selectedChild = {};
  stack.emit('VIEW_STACK_SELECTED_PAGE_CHANGED');
  assert.deepEqual(ids(view), [10, 20, 30, 40, 160]);
  assert.equal(view.pageTxt.text, '1/1');
  assert.equal(Object.hasOwn(view, 'updateItems'), false);

  stack.selectedChild = view;
  stack.emit('VIEW_STACK_SELECTED_PAGE_CHANGED');
  assert.deepEqual(ids(view), [10, 20, 30, 40, 160, 175]);
  changeScene({ SceneName: 'HallScene' });
  assert.deepEqual(ids(view), [10, 20, 30, 40, 160]);
  assert.equal(stack.listeners.length, 0);
  ctx.scope.dispose();
});

test('moves and restores a previously available native 175 row without duplicating it', () => {
  const { ctx, calls, view, stack } = createFixture([175, 10, 160, 40]);
  stack.selectedChild = view;
  const nativePoker = view.modeDataList[0];
  installPokerActivityEntry(ctx, () => calls.push(['poker lobby']));
  assert.deepEqual(ids(view), [10, 160, 175, 40]);
  assert.notEqual(view.modeDataList[2], nativePoker);
  ctx.scope.dispose();
  assert.deepEqual(ids(view), [175, 10, 160, 40]);
  assert.equal(view.modeDataList[0], nativePoker);
  assert.equal(view.items[0].gotoU3dBtn.visible, true);
  view.items[0].ModeBtn.emit('click');
  view.items[0].gotoU3dBtn.emit('click');
  assert.deepEqual(calls, [['stock card', 175], ['remake redirect']]);
  assert.equal(stack.listeners.length, 0);
});
