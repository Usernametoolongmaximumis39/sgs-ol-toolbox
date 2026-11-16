import test from 'node:test';
import assert from 'node:assert/strict';
import { createGaiZhu } from '../src/plugins/gaizhu/runtime.js';
import { PluginManager } from '../src/core/plugins.js';
import { SessionJournal } from '../src/core/session.js';

async function fixture(t) {
  let now = 100000, accountId = '41';
  const controllers = [], scopes = [], settingsWrites = [], notices = [];
  const candidateName = '候选完整详情'.repeat(150);
  const select = { name: 'SelectGeneralWindow', generalUis: [
    { GeneralID: 2, GeneralName: candidateName, sureBtnClick() { assert.fail('host must not pick a different general'); } },
  ] };
  const scene = { name: 'GameScene', SelfSeatUi: {}, _children: [select] };
  const proxy = { _events: {} }, journal = new SessionJournal();
  journal.push('toolbox:snapshot', {});
  const settings = { namespace: () => ({ get: (key, fallback) => fallback, set: (...args) => settingsWrites.push(args) }) };
  const manager = new PluginManager({ journal, settings,
    store: { list: async () => [], put: async () => {} },
    context: { now: () => now, window: { Laya: { stage: { _children: [scene] } } }, document: {},
      notify: text => notices.push(text), game: {
        getSelf: () => ({ ClientId: accountId, NickName: `账号${accountId}` }),
        getClass: () => null, getServerProxy: () => proxy, getScene: () => scene, getSnapshot: () => ({}),
        getConfigData: key => key === 'character'
          ? { GameCharacters: { character: [{ id: 1, name: '黄盖' }, { id: 2, name: candidateName }] } }
          : { AchievementAll: { Achievement: [{ Id: 20, characterId: 2, flags: 2048, CriteriaEntry: [{ Id: 200, count: 100 }] }] } },
      },
    },
  });
  manager.registerBuiltin({ manifest: { id: 'test.gaizhu-recovery', name: '盖主恢复回归', version: '1.0.0', apiVersion: 1, categories: [] },
    activate(ctx) { scopes.push(ctx.scope); controllers.push(createGaiZhu(ctx)); },
  });
  await manager.init(); t.after(() => manager.dispose());
  return { manager, controllers, scopes, settingsWrites, notices, candidateName,
    get current() { return controllers.at(-1); },
    get state() { return manager.slots.get('test.gaizhu-recovery').state; },
    setAccount(id) { accountId = id; this.current.tick(); },
    async failAndRecover() {
      this.current.setOptions({ role: 'host' });
      now += 20000; this.current.tick();
      const before = this.current.snapshot();
      await manager.tail;
      return before;
    },
  };
}

test('gaizhu: real PluginManager recovery retains complete stopped error and management reminder without restarting the run', async t => {
  const f = await fixture(t), before = await f.failAndRecover();
  const after = f.current.snapshot();
  assert.equal(f.controllers.length, 2); assert.equal(f.scopes[0].closed, true);
  assert.equal(before.role, 'off'); assert.equal(after.role, 'off');
  assert.match(after.status, /已停止.*错误详情/);
  assert.equal(after.error, before.error); assert.ok(after.error.includes(f.candidateName));
  assert.deepEqual(after.log, before.log); assert.ok(after.log.length <= 40);
  assert.equal(f.manager.list()[0].error, before.error);
  assert.equal(f.state.gaizhuStoppedError.accountId, '41');
  assert.equal('role' in f.state.gaizhuStoppedError, false);
  assert.equal(f.notices.length, 1); assert.deepEqual(f.settingsWrites, []);
  f.current.tick(); assert.equal(f.controllers.length, 2); assert.equal(f.current.snapshot().role, 'off');
});

test('gaizhu: explicit start clears recovered diagnostics and management reminder, while off and preference changes preserve them', async t => {
  const f = await fixture(t), before = await f.failAndRecover();
  f.current.setOptions({ role: 'off' });
  f.current.setOptions({ wait: true });
  assert.equal(f.current.snapshot().error, before.error);
  assert.equal(f.manager.list()[0].error, before.error);
  f.current.setOptions({ role: 'host' });
  assert.equal(f.current.snapshot().role, 'host'); assert.equal(f.current.snapshot().error, '');
  assert.equal(f.state.gaizhuStoppedError, undefined); assert.equal(f.manager.list()[0].error, '');
  assert.equal(f.current.snapshot().log.some(line => line === before.error), false);
  assert.equal(f.settingsWrites.length, 1); // Only the explicit wait preference was saved.
});

test('gaizhu: switching accounts clears stopped diagnostics and does not resurrect them on switching back', async t => {
  const f = await fixture(t); await f.failAndRecover();
  f.setAccount('42');
  assert.equal(f.current.snapshot().account, '42'); assert.equal(f.current.snapshot().role, 'off');
  assert.equal(f.current.snapshot().error, ''); assert.deepEqual(f.current.snapshot().log, []);
  assert.equal(f.state.gaizhuStoppedError, undefined); assert.equal(f.manager.list()[0].error, '');
  f.setAccount('41');
  assert.equal(f.current.snapshot().error, ''); assert.equal(f.current.snapshot().role, 'off');
  assert.deepEqual(f.settingsWrites, []);
});
