import { RoomSettingsWindow, attachRoomSettings } from './fixtures/gaizhu-room.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGaiZhu } from '../src/plugins/gaizhu/runtime.js';
import { createNative, usable, walkNative } from '../src/plugins/gaizhu/native.js';
import { ResourceScope } from '../src/core/resources.js';
import { createPluginNative } from '../src/core/plugin-native.js';

const flush = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };
function fixture(t, stored = new Map()) {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  // Exercise the production event observer, while driving the business clock
  // manually so retry/guard boundaries do not require wall-clock sleeps.
  let now = 100000, id = '41', nickname = '演练', scans = 0, countdown = 30;
  const calls = [], errors = [], handlers = new Map(), slots = [0, 0, 0, 0], djHandlers = new Set();
  let master = true;
  // Native FlatButton listens through its background; the container itself
  // has mouseEnabled=false while its public onClick is callable.
  const click = (type, fn = () => {}) => ({ visible: true, mouseEnabled: false, enabled: true, onClick() { calls.push(type); fn(); } });
  const window = { clearTimeout, Laya: { stage: { _children: [] } } };
  const room = { name: 'TableScene', _children: [], seatListView: { seatList: [{ waitInfo: { clientId: id, isMaster: true, ready: false } }, {}] },
    addAiBtn: click('ai', () => room.seatListView.seatList[1].waitInfo = { clientId: 900 }),
    startUI: { startBtn: click('start'), readyBtn: click('ready', () => room.seatListView.seatList[0].waitInfo.ready = true) } };
  const mgr = { HaveDianJiang: false, figureId: 0, clearFigureState() { calls.push('clear-slot'); slots.fill(0); }, updateAllFigureState(g) { slots[this.figureId] = g; }, getfigureState: slot => slots[slot],
    canDianJiang: () => slots.some(id => id > 0), saveFigureConfiger() {}, on(event, caller, fn) { djHandlers.add(fn); }, off(event, caller, fn) { djHandlers.delete(fn); },
    event(event, payload) {
      if (event === 'DJ_TAP_FIGURE_CHANGE') { calls.push('open-point'); pointWindow.visible = true; }
      if (event === 'UPDATE_OTHER_DJ') for (const fn of djHandlers) fn(payload);
    }, sendDianJiang() {
    calls.push(['point', mgr.figureId, slots[mgr.figureId]]);
    this.HaveDianJiang = true;
    mgr.event('UPDATE_OTHER_DJ', { SzNickName: nickname, List: [{ GeneralID: slots[mgr.figureId], Figure: mgr.figureId + 1 }] });
  } };
  const pointWindow = { name: 'DianJiangWindow', visible: false, generalUis: [], sendDianJiang() { throw new Error('Point window must not be used for submission'); } };
  pointWindow.generalUis = [1, 2, 3].map(g => ({ GeneralID: g, GeneralName: ['','黄盖','曹操','刘备'][g], sureBtnClick() { calls.push(['point-card', g]); } }));
  room.dianjiangView = { manger: mgr, onOpenDJClick() { if (mgr.canDianJiang()) mgr.sendDianJiang(); } };
  const skill = { Skill: { Name: '苦肉' }, activated: true, Selected: false, onMouse() { calls.push('kurou'); } };
  const game = { name: 'GameScene', _children: [], SelfSeatUi: { seat: { IsAiControl: false }, skillItems: [skill],
    onTrusteeshipClick() { calls.push('trustee'); this.seat.IsAiControl = !this.seat.IsAiControl; }, buttonBar: { visible: false, btns: [] } } };
  let scene = room;
  const achManager = { sendGetAchInfo(nick, type) { calls.push(['query', nick, type]); } }, gm = { HasGeneral: () => true };
  const proxy = { _events: { ClientDbsGetuserachinfoRep: { caller: achManager }, ClientGeneralFromRep: { caller: gm } },
    on(type, caller, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    off(type, caller, fn) { handlers.get(type)?.delete(fn); } };
  const ach = { AchievementAll: { Achievement: [
    { Id: 20, characterId: 2, flags: 2048, CriteriaEntry: [{ Id: 200, count: 100 }] },
    { Id: 30, characterId: 3, flags: 2048, CriteriaEntry: [{ Id: 300, count: 100 }] },
  ] } }, chars = { GameCharacters: { character: [{ id: 1, name: '黄盖' }, { id: 2, name: '曹操' }, { id: 3, name: '刘备' }] } };
  const ctx = { scope, window, document: { querySelector: () => null }, now: () => now, reportError: e => errors.push(e),
    settings: { get: (key, fallback) => structuredClone(stored.get(key) || fallback), set: (key, value) => stored.set(key, structuredClone(value)) },
    game: { getSelf: () => ({ ClientId: id, NickName: nickname }), getClass: name => name === 'CreateTableWindow' ? RoomSettingsWindow : null, getServerProxy: () => proxy,
      getScene: () => { scans++; return scene; }, getSnapshot: () => ({ isReplay: false }), getCountdown: () => countdown,
      getConfigData: key => key === 'character' ? chars : ach, loadConfigData: async key => key === 'character' ? chars : ach } };
  function mount() { window.Laya.stage._children = [scene, pointWindow]; }
  attachRoomSettings(room);
  ctx.native = createPluginNative(ctx);
  mount(); const controller = createGaiZhu(ctx);
  return { controller, ctx, scope, room, game, skill, calls, errors, mgr, pointWindow, slots, stored, handlers, djHandlers,
    get scans() { return scans; }, setCountdown(value) { countdown = value; },
    advance(ms = 250) { now += ms; mount(); controller.tick(); },
    scene(value) { scene = value; mount(); },
    account(value) { id = value; nickname = '账号' + value; room.seatListView.seatList[0].waitInfo.clientId = value; },
    rebel() { master = false; room.seatListView.seatList[0].waitInfo.isMaster = false; },
    emit(type, value) { for (const fn of handlers.get(type) || []) fn(value); },
    async reply(progress = 99) { this.emit('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: nickname, Achs: [{ id: 200, type: 2, detailInfo: progress }, { id: 300, type: 2, detailInfo: 1 }] }); await flush(); },
  };
}

test('gaizhu: room check runs once per manual start, preserves 01 and never repeats between rounds', t => {
  const f = fixture(t); let checks = 0;
  Object.defineProperty(f.room.startUI.rc, 'MasterIsSelf', { get() { checks++; return true; } });
  f.controller.setOptions({ role: 'host' });
  assert.equal(checks, 1); assert.equal(f.controller.snapshot().roomPassword, '01');
  f.advance(); f.scene(f.game); f.advance(); f.scene(f.room); f.advance(); f.advance();
  assert.equal(checks, 1);
  f.controller.setOptions({ role: 'off' }); f.controller.setOptions({ role: 'host' });
  assert.equal(checks, 2);
});

test('gaizhu: invalid mode or nonmaster fails before point, AI, start and config work', t => {
  for (const invalid of ['mode', 'master', 'unknown']) {
    const f = fixture(t);
    if (invalid === 'mode') f.ctx.game.getClass = () => class extends RoomSettingsWindow { get curModeVo() { return { ModeID: 1, RuleTypeID: 1 }; } };
    if (invalid === 'master') f.room.startUI.rc.MasterIsSelf = false;
    if (invalid === 'unknown') f.ctx.game.getClass = () => null;
    f.controller.setOptions({ role: 'host' }); f.advance();
    assert.equal(f.controller.snapshot().role, 'off'); assert.ok(f.controller.snapshot().error);
    assert.equal(f.controller.snapshot().retryRole, undefined);
    assert.deepEqual(f.calls, []);
  }
});

test('gaizhu: room correction submits once and blocks gameplay until server confirmation', t => {
  const f = fixture(t), rc = f.room.startUI.rc, events = new Map(); let sent;
  rc.TableSetting = { ...rc.TableSetting, Password: '1', RandMode: 1, BuildHandCard: true, CanDianJiang: false, Other: 'preserve' };
  rc.on = (name, caller, fn) => events.set(name, fn); rc.off = name => events.delete(name);
  f.ctx.game.getServerProxy().L = packet => { assert.equal(sent, undefined); sent = packet; };
  f.controller.setOptions({ role: 'host' }); f.advance(); f.advance();
  assert.deepEqual(f.calls, []); assert.ok(sent);
  assert.match(sent.ModifyRule.Password, /^\d{1,4}$/); assert.notEqual(sent.ModifyRule.Password, '1');
  assert.equal(sent.ModifyRule.RandMode, 5); assert.equal(sent.ModifyRule.BuildHandCard, false);
  assert.equal(sent.ModifyRule.CanDianJiang, true); assert.equal(sent.ModifyRule.Other, 'preserve');
  assert.equal(rc.TableSetting.Password, '1', 'local state is not a server acknowledgement');
  events.get('MODIFY_TABLE_EVENT')(); f.advance();
  assert.ok(f.calls.some(call => Array.isArray(call) && call[0] === 'point')); assert.equal(events.size, 0);
});

test('gaizhu: failed room correction stops and requires an explicit restart after three seconds', t => {
  for (const role of ['host', 'auto']) {
    const f = fixture(t), rule = f.room.startUI.rc.TableSetting;
    rule.Password = ''; rule.CanDianJiang = false;
    f.controller.setOptions({ role });
    const stopped = f.controller.snapshot();
    assert.equal(stopped.role, 'off'); assert.equal(stopped.retryRole, role); assert.equal(stopped.retrySeconds, 3);
    assert.match(stopped.status, /密码.*自选身份.*允许点将.*手牌构筑/);
    assert.match(stopped.error, /提交接口不可用/);
    assert.deepEqual(f.errors.filter(Boolean), [], 'room settings notice does not trigger plugin recovery');
    f.advance(2999);
    f.controller.setOptions({ role, force: true });
    assert.equal(f.controller.snapshot().role, 'off');
    f.advance(1);
    assert.equal(f.controller.snapshot().retrySeconds, 0);
    assert.deepEqual(f.calls, [], 'cooldown expiry never starts gameplay');

    if (role === 'auto') rule.Password = '0042';
    f.controller.setOptions({ role, force: true }); f.advance();
    const started = f.controller.snapshot();
    assert.equal(started.role, role); assert.equal(started.retryRole, undefined);
    assert.equal(started.roomPassword, role === 'auto' ? '0042' : '');
    assert.match(started.log.join('\n'), /强制开始/);
    assert.equal(rule.CanDianJiang, false);
    f.controller.setOptions({ role: 'off' });
    f.controller.setOptions({ role });
    assert.equal(f.controller.snapshot().retrySeconds, 3, 'force permission is consumed by one start');
  }
});

test('gaizhu: room retry cannot be carried to a different room, owner or account', t => {
  for (const change of ['scene', 'room-id', 'master', 'account']) {
    const f = fixture(t), rc = f.room.startUI.rc;
    rc.TableSetting.Password = '';
    f.controller.setOptions({ role: 'host' });
    f.advance(3000);
    if (change === 'scene') f.scene({ ...f.room });
    if (change === 'room-id') rc.TableSetting.TableID++;
    if (change === 'master') rc.MasterIsSelf = false;
    if (change === 'account') f.account('42');
    f.controller.setOptions({ role: 'host', force: true });
    assert.equal(f.controller.snapshot().retryRole, undefined);
    assert.equal(f.controller.snapshot().role, 'off');
    assert.deepEqual(f.calls, []);
  }
});

test('gaizhu: an exception during room correction releases listeners and offers a manual restart', t => {
  for (const failure of ['listen', 'submit']) {
    const f = fixture(t), rc = f.room.startUI.rc, events = new Map();
    rc.TableSetting.Password = '';
    rc.on = (name, caller, fn) => {
      events.set(name, fn);
      if (failure === 'listen' && name === 'REFRESH_RULE_UI') throw new Error('绑定房间事件失败');
    };
    rc.off = name => events.delete(name);
    f.ctx.game.getServerProxy().L = () => { throw new Error('提交房间设置失败'); };
    f.controller.setOptions({ role: 'host' });
    assert.equal(f.controller.snapshot().role, 'off');
    assert.equal(f.controller.snapshot().retryRole, 'host');
    assert.match(f.controller.snapshot().error, /失败/);
    assert.equal(events.size, 0);
    assert.deepEqual(f.calls, []);
  }
});

test('gaizhu: stopping settings releases confirmation listeners and never performs gameplay', t => {
  for (const outcome of ['stop', 'dispose']) {
    const f = fixture(t), rc = f.room.startUI.rc, events = new Map();
    rc.TableSetting.Password = '';
    rc.on = (name, caller, fn) => events.set(name, fn); rc.off = name => events.delete(name);
    f.ctx.game.getServerProxy().L = () => {};
    f.controller.setOptions({ role: 'host' });
    assert.equal(f.controller.snapshot().roomPassword, '', 'unconfirmed password must not claim success');
    const late = events.get('MODIFY_TABLE_EVENT');
    if (outcome === 'stop') f.controller.setOptions({ role: 'off' });
    if (outcome === 'reject') events.get('REFRESH_RULE_UI')();
    if (outcome === 'dispose') f.scope.dispose();
    late(); f.advance();
    assert.equal(events.size, 0); assert.equal(f.controller.snapshot().role, 'off'); assert.deepEqual(f.calls, []);
  }
});

test('gaizhu: rejected settings wait five seconds and retry the same password, at most three submissions', t => {
  for (const outcome of ['success', 'reject', 'stop', 'changed-room', 'changed-master', 'timeout']) {
    const f = fixture(t), rc = f.room.startUI.rc, events = new Map(), packets = [];
    rc.TableSetting.Password = '1';
    rc.on = (name, caller, fn) => events.set(name, fn); rc.off = name => events.delete(name);
    f.ctx.game.getServerProxy().L = p => packets.push(p);
    f.controller.setOptions({ role: 'host' });
    events.get('REFRESH_RULE_UI')(); events.get('REFRESH_RULE_UI')();
    f.advance(4999); assert.equal(packets.length, 1); assert.deepEqual(f.calls, []);
    assert.match(f.controller.snapshot().status, /等待5秒/);
    if (outcome === 'stop') f.controller.setOptions({ role: 'off' });
    if (outcome === 'changed-room') f.scene({ ...f.room });
    if (outcome === 'changed-master') rc.MasterIsSelf = false;
    f.advance(1);
    if (['stop', 'changed-room', 'changed-master'].includes(outcome)) {
      assert.equal(packets.length, 1); assert.equal(f.controller.snapshot().role, 'off');
    } else {
      assert.equal(packets.length, 2);
      assert.equal(packets[0].ModifyRule.Password, packets[1].ModifyRule.Password);
      assert.deepEqual(f.calls, []);
      if (outcome === 'success') {
        events.get('MODIFY_TABLE_EVENT')(); f.advance();
        assert.ok(f.calls.some(call => Array.isArray(call) && call[0] === 'point'));
      } else if (outcome === 'timeout') {
        f.advance(6000); assert.match(f.controller.snapshot().error, /超时/);
        assert.equal(f.controller.snapshot().retryRole, 'host');
      } else {
        events.get('REFRESH_RULE_UI')(); f.advance(5000); assert.equal(packets.length, 3);
        events.get('REFRESH_RULE_UI')(); f.advance(10000);
        assert.equal(packets.length, 3); assert.match(f.controller.snapshot().error, /连续3次/);
        assert.equal(f.controller.snapshot().retryRole, 'host');
      }
    }
    assert.equal(events.size, 0);
  }
});

test('gaizhu: starting during a game does not inspect room settings', t => {
  const f = fixture(t); f.scene(f.game);
  f.ctx.game.getClass = name => { assert.notEqual(name, 'CreateTableWindow'); return null; };
  f.controller.setOptions({ role: 'host' }); f.advance();
  assert.equal(f.controller.snapshot().error, '');
});

test('gaizhu: install and preference edits remain off; account preferences isolate; reload never runs', t => {
  const f = fixture(t); f.advance(); f.controller.setOptions({ pick: 'order', wait: true });
  assert.equal(f.controller.snapshot().role, 'off'); assert.equal(f.scans, 0); assert.deepEqual(f.calls, []);
  f.account('42'); f.advance(); assert.equal(f.controller.snapshot().pick, 'off');
  f.account('41'); f.advance(); assert.equal(f.controller.snapshot().pick, 'order');
  const g = fixture(t, f.stored); assert.equal(g.controller.snapshot().role, 'off'); assert.equal(g.controller.snapshot().wait, true);
});
test('gaizhu: host writes lord slot0, selects Huang Gai, fills AI then starts', t => {
  const f = fixture(t); f.controller.setOptions({ role: 'host' });
  for (let i = 0; i < 12; i++) f.advance(500);
  assert.ok(f.calls.some(x => Array.isArray(x) && x[0] === 'point' && x[1] === 0 && x[2] === 1));
  assert.ok(f.calls.indexOf('ai') > f.calls.findIndex(x => Array.isArray(x) && x[0] === 'point'));
  assert.ok(f.calls.indexOf('start') > f.calls.indexOf('ai'));
  assert.equal(f.calls.includes('open-point'), false, 'identity-page event must not open the point-card window');
  const win = { name: 'SelectGeneralWindow', visible: true, generalUis: [{ GeneralID: 1, GeneralName: '黄盖', sureBtnClick() { f.calls.push('selected-yellow'); } }] };
  f.room._children.push(win); f.advance(); assert.ok(f.calls.includes('selected-yellow'));
});
test('gaizhu: host uses only active Kurou, gap600ms, wait-one-minute burns until3seconds /45seconds', t => {
  const f = fixture(t); f.scene(f.game); f.controller.setOptions({ role: 'host', wait: true });
  assert.equal(f.calls.includes('kurou'), false); assert.match(f.controller.snapshot().status, /烧条/);
  f.setCountdown(3); f.advance(250); assert.equal(f.calls.filter(x => x === 'kurou').length, 1);
  f.advance(599); assert.equal(f.calls.filter(x => x === 'kurou').length, 1);
  f.advance(1); assert.equal(f.calls.filter(x => x === 'kurou').length, 2);
  f.setCountdown(30); f.advance(45000); assert.equal(f.calls.filter(x => x === 'kurou').length, 3);
  f.skill.activated = false; f.advance(1000); assert.equal(f.calls.filter(x => x === 'kurou').length, 3);
});
test('gaizhu: two-stage selection gets one bounded confirmation; stop invalidates pending selection', t => {
  const f = fixture(t); let chosen = 0;
  const win = { name: 'SelectGeneralWindow', visible: true, generalUis: [{ GeneralID: 1, GeneralName: '黄盖', sureBtnClick() { if (++chosen === 2) win.visible = false; } }] };
  f.room._children.push(win); f.controller.setOptions({ role: 'host' }); assert.equal(chosen, 1);
  f.advance(249); assert.equal(chosen, 1); f.advance(1); assert.equal(chosen, 2); f.advance(1000); assert.equal(chosen, 2);
  f.controller.setOptions({ role: 'off' }); win.visible = true; chosen = 0; f.controller.setOptions({ role: 'host' }); assert.equal(chosen, 1);
  f.controller.setOptions({ role: 'off' }); f.advance(1000); assert.equal(chosen, 1);
});
test('gaizhu: mulligan is declined before skill/selection; guarded inherited trustee disabled; unknown button never used', t => {
  const f = fixture(t); f.scene(f.game); f.game.SelfSeatUi.seat.IsAiControl = true;
  const prompt = { name: 'ShouQiKaAskWindow', visible: true, _children: [{ label: '使用', onClick() { f.calls.push('SPEND'); } }] };
  f.game._children.push(prompt); f.controller.setOptions({ role: 'host' }); f.advance();
  assert.equal(f.calls.includes('SPEND'), false); assert.equal(f.calls.includes('kurou'), false); assert.ok(f.calls.includes('trustee'));
  prompt._children.push({ label: '不使用', onClick() { f.calls.push('decline'); prompt.visible = false; } }); f.advance(); assert.ok(f.calls.includes('decline'));
  f.advance(); assert.ok(f.calls.includes('kurou'));
});
test('gaizhu: rebel off prepares once and never points; trustee waits20 seconds then confirms state', t => {
  const f = fixture(t); f.rebel(); f.controller.setOptions({ role: 'rebel' }); f.advance();
  assert.equal(f.calls.filter(x => x === 'ready').length, 1); assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'point'), false);
  f.scene(f.game); f.advance(); f.advance(19999); assert.equal(f.calls.includes('trustee'), false);
  f.advance(1); assert.equal(f.calls.filter(x => x === 'trustee').length, 1); f.advance(3000); assert.equal(f.calls.filter(x => x === 'trustee').length, 1);
});
test('gaizhu: paired rebel asks to switch modules when the account is host or enters training', t => {
  const host = fixture(t);
  host.controller.setOptions({ role: 'rebel', pick: 'order' });
  assert.equal(host.controller.snapshot().role, 'off');
  assert.match(host.controller.snapshot().status, /房主.*自动挂机.*身份/);
  assert.deepEqual(host.calls, []);

  const training = fixture(t), original = training.ctx.game.getClass;
  training.ctx.game.getClass = name => name === 'GameContext' ? { GetModeVO: () => ({ ModeID: 160, Section: 3 }) } : original(name);
  training.scene(training.game);
  training.controller.setOptions({ role: 'rebel' });
  assert.equal(training.controller.snapshot().role, 'off');
  assert.match(training.controller.snapshot().status, /单骑.*自动挂机.*单骑/);
  assert.deepEqual(training.calls, []);
});
test('gaizhu: anonymous mulligan bar extends guard and explicit rebel cancel remains available', t => {
  const f = fixture(t); f.rebel(); f.scene(f.game); f.controller.setOptions({ role: 'rebel' });
  f.advance(19999); const bar = f.game.SelfSeatUi.buttonBar;
  bar.visible = true; bar.txtOptMsg = { _innerHTML: '是否使用手气卡更换手牌？' };
  bar.btns = [{ label: '使用', onClick() { f.calls.push('SPEND'); } }, { label: '不使用', onClick() { f.calls.push('anonymous-decline'); bar.visible = false; bar.txtOptMsg = null; } }];
  f.advance(1); assert.ok(f.calls.includes('anonymous-decline')); f.advance(19999);
  assert.equal(f.calls.includes('trustee'), false); assert.equal(f.calls.includes('SPEND'), false);
  f.advance(1); assert.ok(f.calls.includes('trustee'));
  bar.visible = true; bar.btns = [{ name: 'btnCancel', label: '取消', onClick() { f.calls.push('response-cancel'); bar.visible = false; } }];
  f.advance(); assert.ok(f.calls.includes('response-cancel'));
});
test('gaizhu: anonymous mulligan confirmation callbacks keep their native owner', t => {
  const f = fixture(t); f.scene(f.game);
  const prompt = { name: 'Prompt', confirmData: { content: '是否使用手气卡？', clickClose: true, buttonArr: [] }, RemoveFromParent() { this.visible = false; f.calls.push('native-close'); } };
  prompt.confirmData.buttonArr.push({ label: '不使用', callBack() { assert.equal(this, prompt); f.calls.push('native-decline'); } });
  f.game._children.push(prompt); f.controller.setOptions({ role: 'host' }); assert.ok(f.calls.includes('native-decline'));
  assert.ok(f.calls.includes('native-close'));
});
test('gaizhu: rebel order waits own full reply then uses slot2; wrong nick ignored; fresh settlement queries', async t => {
  const f = fixture(t); f.rebel(); f.controller.setOptions({ role: 'rebel', pick: 'order' });
  f.emit('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: 'other', Achs: [] }); await flush(); f.advance();
  assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'point'), false);
  await f.reply(); for (let i = 0; i < 8; i++) f.advance(500);
  assert.ok(f.calls.some(x => Array.isArray(x) && x[0] === 'point' && x[1] === 2 && x[2] === 2));
  f.scene(f.game); f.advance(); f.emit('MsgGameOver', {}); await flush(); assert.equal(f.controller.snapshot().rounds, 1);
  f.scene(f.room); f.advance(2000); assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'query').length, 2);
  await f.reply(100); for (let i = 0; i < 7; i++) f.advance(500);
  assert.ok(f.calls.some(x => Array.isArray(x) && x[0] === 'point' && x[2] === 3));
});
test('gaizhu: result is acted on only after gameover and bounded; stop removes pending point listeners', async t => {
  const f = fixture(t); f.scene(f.game); f.game._children.push({ text: '点击空白处继续', onClick() { f.calls.push('continue'); } });
  f.controller.setOptions({ role: 'rebel' }); f.advance(5000); assert.equal(f.calls.includes('continue'), false);
  f.emit('MsgGameOver', {}); await flush(); f.advance(1199); assert.equal(f.calls.includes('continue'), false);
  f.advance(1); assert.equal(f.calls.filter(x => x === 'continue').length, 1);
  f.controller.setOptions({ role: 'off' }); const total = f.calls.length; f.advance(9000); assert.equal(f.calls.length, total);
  f.scene(f.room); f.controller.setOptions({ role: 'host' }); assert.ok(f.djHandlers.size > 0);
  f.controller.setOptions({ role: 'off' }); assert.equal(f.djHandlers.size, 0);
});
test('gaizhu: account changes and disposal invalidate pending configuration and business actions', async t => {
  const f = fixture(t); let resolve; f.ctx.game.getConfigData = () => null;
  f.ctx.game.loadConfigData = () => new Promise(r => { resolve = r; }); f.controller.setOptions({ role: 'host' });
  f.account('42'); f.advance(); const total = f.calls.length; resolve({}); await flush(); f.advance(100000);
  assert.equal(f.controller.snapshot().role, 'off'); assert.equal(f.calls.length, total);
  f.scope.dispose(); assert.equal([...f.handlers.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
});

test('gaizhu: reconnecting on the same proxy cancels pending work before another heartbeat', async t => {
  for (const how of ['connection id', 'socket close event']) {
    const f = fixture(t), proxy = f.ctx.game.getServerProxy();
    proxy.ConnId = 1; proxy.ConnectedSucess1 = true;
    f.controller.setOptions({ role: 'host' });
    if (how === 'connection id') proxy.ConnId = 2;
    else { f.emit('close', {}); await flush(); }
    const calls = f.calls.length;
    f.advance(1500);
    assert.equal(f.controller.snapshot().role, 'off');
    assert.match(f.controller.snapshot().status, /连接已断开/);
    assert.equal(f.djHandlers.size, 0);
    assert.equal(f.calls.length, calls);
  }
});
test('gaizhu: native hidden ancestors and disabled controls cannot be selected; bounded walks do not read arbitrary getters', () => {
  assert.equal(usable({ parent: { visible: false } }), false); assert.equal(usable({ _enabled: false }), false);
  const root = { _children: [] }; Object.defineProperty(root, 'trap', { get() { throw new Error('no generic getter reads'); } });
  for (let i = 0; i < 3000; i++) root._children.push({}); assert.ok(walkNative([root]).length <= 512);
});

test('gaizhu: a full native walk queue keeps child priority without expanding unreachable collections', () => {
  const visible = {}, destroyed = { destroyed: true }, next = {};
  let unusedReads = 0;
  const root = {
    _children: [visible, visible, destroyed],
    btns: [next],
    get buttonArr() { unusedReads++; return [{}]; },
  };
  assert.deepEqual(walkNative([root], 5), [root, visible, next]);
  assert.equal(unusedReads, 0);
});

test('gaizhu: the replay guard stops before native actions on current and older cores', t => {
  for (const currentCore of [true, false]) {
    const f = fixture(t);
    let snapshotReads = 0;
    f.ctx.game.getSnapshot = () => { snapshotReads++; return { isReplay: true }; };
    if (currentCore) f.ctx.game.isReplay = scene => { assert.equal(scene, f.room); return true; };
    f.controller.setOptions({ role: 'host' });
    assert.equal(f.controller.snapshot().role, 'off');
    assert.match(f.controller.snapshot().error, /回放场景/);
    assert.deepEqual(f.calls, []);
    assert.equal(snapshotReads, currentCore ? 0 : 1);
  }
});

test('gaizhu: errors retain complete stack and no further actions occur', t => {
  const f = fixture(t); f.mgr.clearFigureState = () => { throw new Error('fixture complete diagnostic ' + 'detail '.repeat(100)); };
  f.controller.setOptions({ role: 'host' }); assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().error, /detail detail/); assert.ok(f.controller.snapshot().error.length > 600);
  const total = f.calls.length; f.advance(10000); assert.equal(f.calls.length, total);
});
test('gaizhu: unknown confirmation and sent-without-ack never fabricate server confirmation', t => {
  const f = fixture(t); f.mgr.sendDianJiang = () => f.calls.push('sent-without-ack');
  f.room._children.push({ confirmData: { content: '其它付费功能确认', buttonArr: [{ label: '确定', onClick() { f.calls.push('UNKNOWN-OK'); } }] } });
  f.controller.setOptions({ role: 'host' }); for (let i = 0; i < 10; i++) f.advance(500);
  assert.equal(f.calls.includes('UNKNOWN-OK'), false);
  assert.match(f.controller.snapshot().status, /等待服务器确认/);
  assert.equal(f.calls.includes('ai'), false);
  assert.equal(f.calls.includes('start'), false);
  assert.equal(f.controller.snapshot().log.some(s => s.includes('服务器已确认')), false);
});
test('gaizhu: rebel submits through native view without using a point window', async t => {
  const f = fixture(t); f.rebel(); f.pointWindow.visible = false;
  f.controller.setOptions({ role: 'rebel', pick: 'order' }); await f.reply();
  for (let i = 0; i < 9; i++) f.advance(500);
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'point').length, 1);
  assert.ok(f.calls.some(x => Array.isArray(x) && x[0] === 'point' && x[1] === 2 && x[2] === 2));
  assert.equal(f.calls.includes('open-point'), false);
  assert.equal(f.pointWindow.visible, false);
});

test('gaizhu: point submission leaves an existing user window alone', t => {
  const f = fixture(t);
  f.pointWindow.visible = true;
  f.pointWindow.Remove = force => { assert.equal(force, true); f.calls.push('native-remove'); f.slots.fill(0); };
  f.controller.setOptions({ role: 'host' });
  for (let i = 0; i < 12; i++) f.advance(500);
  assert.equal(f.calls.filter(x => x === 'native-remove').length, 0);
  assert.equal(f.slots[0], 1);
  assert.equal(f.pointWindow.visible, true);
});

test('gaizhu: detached cached windows cannot send; hidden mounted windows can', () => {
  const stale = { sendDianJiang() {} }, live = { visible: false, sendDianJiang() {} };
  const wm = { WindowInstanceDict: { stale } }, stage = { _children: [live] };
  const ctx = { window: { Laya: { stage } }, game: {
    getScene: () => ({}), getClass: () => null,
    getServerProxy: () => ({ _events: { HIDE_WINDOW: { caller: wm } } }),
  } };
  ctx.native = createPluginNative(ctx);
  const native = createNative(ctx);
  native.frame(); assert.equal(native.djWindow(), live);
  stage._children = []; native.frame(); assert.equal(native.djWindow(), undefined);
});

test('gaizhu: stop releases direct-submit listener and ignores a late confirmation', t => {
  const f = fixture(t);
  f.mgr.sendDianJiang = () => f.calls.push('direct-submit');
  f.controller.setOptions({ role: 'host' });
  assert.equal(f.djHandlers.size, 1);
  f.controller.setOptions({ role: 'off' });
  assert.equal(f.djHandlers.size, 0);
  const total = f.calls.length;
  f.mgr.event('UPDATE_OTHER_DJ', { List: [{ GeneralID: 1, Figure: 1 }] }); f.advance(2000);
  assert.equal(f.calls.length, total);
  assert.equal(f.controller.snapshot().role, 'off');
});

test('gaizhu: local slot change is not accepted as a successful direct submission', async t => {
  const f = fixture(t); f.rebel();
  f.mgr.sendDianJiang = () => f.slots.fill(0);
  f.controller.setOptions({ role: 'rebel', pick: 'order' }); await f.reply();
  f.advance(); f.advance(1500);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().error, /目标槽发生变化/);
  assert.equal(f.calls.includes('ready'), false);
});

test('gaizhu: AI opener bypasses silent inherited click and never starts with an unfilled seat', t => {
  const f = fixture(t);
  let opened = 0;
  f.room.addAiBtn.onClick = () => {};
  f.room.addAiBtn.onMouse = event => { assert.equal(event.type, 'click'); opened++; };
  f.controller.setOptions({ role: 'host' });
  for (let i = 0; i < 65; i++) f.advance(500);
  assert.ok(opened > 0);
  assert.equal(f.calls.includes('start'), false);
});

test('gaizhu: closes the native mulligan before any decline/use callback and cancels dying selector', t => {
  const f = fixture(t); f.scene(f.game);
  const win = { name: 'ShouQiKaAskWindow', visible: true, close() { f.calls.push('native-close'); this.visible = false; },
    cancleBtn: { label: '取消', onClick() { assert.fail('native close takes priority'); } },
    sureBtn: { label: '使用', onClick() { assert.fail('must not use mulligan'); } } };
  f.game._children.push(win);
  f.controller.setOptions({ role: 'host' });
  assert.ok(f.calls.includes('native-close'));
  const cancel = { data: { sendData: 255 } };
  f.game.SelfSeatUi.spellSelector = { visible: true, btnList: [{ data: { sendData: 1 } }, cancel],
    btnClick(btn) { assert.equal(btn, cancel); f.calls.push('dying-cancel'); this.visible = false; } };
  f.advance(); assert.ok(f.calls.includes('dying-cancel'));
});

test('gaizhu: host point failure or missing acknowledgement never fills AI or starts', t => {
  for (const mode of ['write-failed', 'cleared', 'no-ack']) {
    const f = fixture(t);
    if (mode === 'write-failed') f.mgr.updateAllFigureState = () => {};
    if (mode === 'cleared') f.mgr.sendDianJiang = () => f.slots.fill(0);
    if (mode === 'no-ack') f.mgr.sendDianJiang = () => {};
    f.controller.setOptions({ role: 'host' });
    for (let i = 0; i < 20; i++) f.advance(500);
    assert.equal(f.controller.snapshot().role, 'off', mode);
    assert.equal(f.calls.includes('ai'), false, mode);
    assert.equal(f.calls.includes('start'), false, mode);
  }
});

test('gaizhu: host rechecks lord slot after confirmation before filling AI and before starting', t => {
  for (const afterAi of [false, true]) {
    const f = fixture(t); f.controller.setOptions({ role: 'host' }); f.advance();
    if (afterAi) { f.advance(1500); assert.ok(f.calls.includes('ai')); }
    f.slots[0] = 0; f.advance(2000);
    assert.equal(f.controller.snapshot().role, 'off');
    assert.equal(f.calls.includes('start'), false);
    if (!afterAi) assert.equal(f.calls.includes('ai'), false);
  }
});

test('gaizhu: unknown Huang Gai ID never bypasses point requirement', t => {
  const f = fixture(t); f.ctx.game.getConfigData = () => ({}); f.ctx.game.loadConfigData = async () => ({});
  f.controller.setOptions({ role: 'host' });
  for (let i = 0; i < 20; i++) f.advance(500);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.equal(f.calls.includes('ai'), false); assert.equal(f.calls.includes('start'), false);
});

test('gaizhu: Huang Gai still cancels dying request after more than twenty earlier prompts', t => {
  const f = fixture(t); f.scene(f.game);
  const bar = f.game.SelfSeatUi.buttonBar;
  let cancelled = 0;
  bar.btns = [{ name: 'btnCancel', label: '取消', onClick() { cancelled++; bar.visible = false; } }];
  f.controller.setOptions({ role: 'host' });
  for (let i = 0; i < 25; i++) { bar.visible = true; f.advance(); }
  assert.equal(cancelled, 25);
  f.game.SelfSeatUi.cardContainer = { selectCardContext: { message: '您已濒死，请使用桃或酒自救' } };
  bar.visible = true; f.advance();
  assert.equal(cancelled, 26);
  assert.equal(bar.visible, false);
});

test('gaizhu: visible selector without a cancel choice does not block dying button-bar cancellation', t => {
  const f = fixture(t); f.scene(f.game);
  f.game.SelfSeatUi.spellSelector = { visible: true, btnList: [{ data: { sendData: 1 } }],
    btnClick() { assert.fail('must not select a skill instead of cancelling dying request'); } };
  const bar = f.game.SelfSeatUi.buttonBar;
  bar.visible = true; bar.btns = [{ name: 'btnCancel', label: '取消', onClick() { f.calls.push('dying-bar-cancel'); bar.visible = false; } }];
  f.controller.setOptions({ role: 'host' });
  assert.ok(f.calls.includes('dying-bar-cancel'));
  assert.equal(f.calls.includes('kurou'), false);
});

test('gaizhu: screenshot dying prompt uses native bar dispatcher before stale windows or selector', t => {
  const f = fixture(t); f.scene(f.game);
  f.game._children.push({ name: 'SelectGeneralWindow', visible: true, generalUis: [{ GeneralID: 1, GeneralName: '黄盖', sureBtnClick() { assert.fail('stale selection must not block dying cancel'); } }] });
  f.game.SelfSeatUi.spellSelector = { visible: true, btnList: [{ data: { sendData: 255 } }], btnClick() { assert.fail('cancel the active bar first'); } };
  const bar = f.game.SelfSeatUi.buttonBar;
  const cancel = { name: 'btnCancel', label: '取 消', enabled: true,
    onClick() { assert.fail('must bypass button-local cooldown'); } };
  bar.visible = true; bar.txtOptMsg = { _innerHTML: '出<font color="gold">桃或酒</font>你可回复1点体力' }; bar.btns = [cancel];
  bar.Button_Click = function(button) {
    assert.equal(this, bar); assert.equal(button, cancel);
    button.enabled = false; this.ApplyButton(button.name);
  };
  bar.ApplyButton = name => { assert.equal(name, 'btnCancel'); f.calls.push('native-dying-cancel'); bar.visible = false; };
  f.controller.setOptions({ role: 'host' });
  assert.ok(f.calls.includes('native-dying-cancel'));
  assert.equal(f.calls.includes('kurou'), false);
  f.controller.setOptions({ role: 'off' }); cancel.enabled = true; bar.visible = true;
  const count = f.calls.length; f.advance(); assert.equal(f.calls.length, count);
});

test('gaizhu: official self-seat Pt without legacy buttonBar cancels screenshot dying prompt', t => {
  const f = fixture(t); f.scene(f.game);
  const self = f.game.SelfSeatUi;
  delete self.buttonBar;
  let submitted = 0;
  const cancel = { name: 'btnCancel', label: '取 消', enabled: true, visible: true };
  self.Pt = { visible: true, btns: [cancel], txtOptMsg: { _innerHTML: '出桃或酒你可回复1点体力' },
    Button_Click(button) { assert.equal(button, cancel); submitted++; button.enabled = false; this.visible = false; } };
  f.controller.setOptions({ role: 'host' });
  assert.equal(submitted, 1);
  assert.equal(f.controller.snapshot().status, '已取消当前询问');
  assert.equal(f.calls.includes('kurou'), false);
  f.advance(); assert.ok(f.calls.includes('kurou'), 'hidden bar must not stall later play');
  f.controller.setOptions({ role: 'off' });
  self.Pt.visible = cancel.enabled = true; f.advance(); assert.equal(submitted, 1);
});

test('gaizhu: current native bar takes precedence over stale aliases and handles hand-card refusal', t => {
  const f = fixture(t); f.scene(f.game);
  const self = f.game.SelfSeatUi;
  self.buttonBar = { visible: true, btns: [], txtOptMsg: { _innerHTML: '旧文本' } };
  self.Pt = { visible: true, txtOptMsg: { _innerHTML: '是否更换手牌？' },
    btns: [{ label: '不使用', onClick() { f.calls.push('stale-decline'); } }] };
  self.Ai = { visible: true, txtOptMsg: { _innerHTML: '是否更换手牌？' },
    btns: [{ label: '不使用', onClick() { f.calls.push('native-decline'); self.Ai.visible = false; } },
      { label: '使用', onClick() { assert.fail('must not use mulligan'); } }] };
  self.getButtonBar = function () { return this.Ai; };
  f.controller.setOptions({ role: 'host' });
  assert.ok(f.calls.includes('native-decline')); assert.equal(f.calls.includes('kurou'), false);
  f.advance();
  assert.equal(f.calls.filter(call => call === 'native-decline').length, 1);
  assert.equal(f.calls.includes('stale-decline'), false, 'hiding the current bar must not reactivate a stale alias');
});


test('gaizhu: identity auto farm fills AI and starts without forcing Huang Gai; assistant receives first opportunity before fallback', t => {
  const f = fixture(t);
  f.controller.setOptions({ role: 'auto', pick: 'off' });
  f.advance(); f.advance(2000);
  assert.equal(f.controller.snapshot().solo, true);
  assert.ok(f.calls.includes('ai')); assert.ok(f.calls.includes('start'));
  assert.ok(!f.calls.some(c => Array.isArray(c) && c[0] === 'point'));
  f.scene(f.game); f.advance(30000);
  assert.ok(!f.calls.includes('trustee')); assert.ok(!f.calls.includes('kurou'));
  let hinted = 0, requests = 0;
  f.game.requestAiHelp = () => requests++;
  f.advance(1500); assert.equal(requests, 1);
  const button = { name: 'btnCancel', enabled: true, onClick() { hinted++; } };
  f.game.SelfSeatUi.Pt = { btns: [button] };
  f.game.SelfSeatUi.CurStepHelpData = { buttonName: 'btnCancel' };
  f.advance(); f.advance(); assert.equal(hinted, 1);
  f.controller.setOptions({ role: 'off' });
  f.game.SelfSeatUi.CurStepHelpData = { buttonName: 'btnCancel' };
  f.advance(); assert.equal(hinted, 1);
});

test('gaizhu: solo fills every other rebel seat with the best unlocked AI, including from seats 5–8', t => {
  for (const selfSeat of [4, 5, 6, 7]) {
    const f = fixture(t), kingUnlocked = selfSeat % 2 === 0;
    const seats = Array.from({ length: 8 }, (_, SeatId) => ({ SeatId, SeatStatus: 0,
      WaitInfo: SeatId === selfSeat ? { clientId: '41', isMaster: true } : null })).reverse();
    f.room.addAiBtn.onClick = () => assert.fail('solo seat controls must avoid bulk fill');
    f.room.seatListView = { seatList: seats,
      showBtns(seat) {
        this.currentSeat = seat;
        this.addAiBtn = { visible: true };
        this.addAiMBtn = { visible: true };
        this.addAiSBtn = { visible: kingUnlocked };
      },
      addAiHandler(tier, seat) {
        assert.equal(this.currentSeat, seat);
        assert.equal(seat.WaitInfo, null);
        f.calls.push(['seat-ai', seat.SeatId, tier]);
        seat.WaitInfo = { clientId: 900 + seat.SeatId };
      },
    };
    f.controller.setOptions({ role: 'auto' });
    for (let i = 0; i < 7; i++) f.advance(1200);
    const added = f.calls.filter(call => call[0] === 'seat-ai').sort((a, b) => a[1] - b[1]);
    assert.deepEqual(added, Array.from({ length: 8 }, (_, id) => id).filter(id => id !== selfSeat)
      .map(id => ['seat-ai', id, id < 4 ? 1 : kingUnlocked ? 3 : 2]));
    assert.equal(f.calls.at(-1), 'start');
  }
});

test('gaizhu: solo retries a failed seat independently after filling the other seats', t => {
  const f = fixture(t), view = f.room.seatListView, added = [];
  const seats = Array.from({ length: 8 }, (_, SeatId) => ({ SeatId, SeatStatus: 0,
    WaitInfo: SeatId === 5 ? { clientId: '41', isMaster: true } : null }));
  view.seatList = seats;
  view.showBtns = function (seat) {
    this.currentSeat = seat;
    this.addAiBtn = this.addAiSBtn = { visible: true };
  };
  let failures = 0;
  view.addAiHandler = (type, seat) => {
    assert.equal(seat.WaitInfo, null);
    added.push([seat.SeatId, type]);
    if (seat.SeatId === 0) {
      if (++failures === 1) throw new Error('客户端暂时无法添加');
      if (failures <= 6) return;
    }
    seat.WaitInfo = { clientId: 900 + seat.SeatId };
  };
  f.controller.setOptions({ role: 'auto', pick: 'off' });
  assert.match(f.controller.snapshot().status, /1号位.*等待重试/);
  f.advance(1199);
  assert.equal(added.length, 1, 'allow time for an entry to reach the seat list');
  f.advance(1);
  for (let i = 0; i < 10; i++) f.advance(1200);
  assert.deepEqual(added.slice(0, 7), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 3], [6, 3], [7, 3]]);
  assert.equal(f.calls.includes('start'), false);
  f.advance(1200); f.advance();
  assert.equal(added.length, 13);
  assert.ok(f.calls.includes('start'));
  assert.equal(f.controller.snapshot().error, '');
});

test('gaizhu: solo stops with the affected position when a seat never fills', t => {
  const f = fixture(t), view = f.room.seatListView;
  view.showBtns = function (seat) { this.currentSeat = seat; this.addAiBtn = { visible: true }; };
  view.addAiHandler = () => f.calls.push('seat-ai');
  f.controller.setOptions({ role: 'auto', pick: 'off' });
  for (let i = 0; i < 16; i++) f.advance(1200);
  assert.equal(f.calls.filter(call => call === 'seat-ai').length, 12);
  assert.equal(f.calls.includes('start'), false);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().error, /2号位添加小杀重试后仍未入座/);
});

test('gaizhu: solo retries a failed bulk confirmation while the add button is covered', t => {
  const f = fixture(t), button = f.room.addAiBtn;
  let confirmations = 0;
  const prompt = { visible: false, parent: f.room, confirmData: { clickClose: true, buttonArr: [
    { label: '小杀（普通）', callBack() {
      f.calls.push('ai-confirm');
      if (++confirmations === 1) throw new Error('确认失败');
      f.room.seatListView.seatList[1].waitInfo = { clientId: 900 };
    } },
  ] }, RemoveFromParent() { this.visible = false; button.enabled = true; } };
  f.room._children.push(prompt);
  button.onClick = () => { f.calls.push('ai'); prompt.visible = true; button.enabled = false; };
  f.controller.setOptions({ role: 'auto', pick: 'off' });
  f.advance();
  assert.equal(f.calls.filter(call => call === 'ai-confirm').length, 1);
  assert.match(f.controller.snapshot().status, /添加普通小杀失败.*等待重试/);
  f.advance(1199);
  assert.equal(f.calls.filter(call => call === 'ai-confirm').length, 1);
  assert.equal(f.calls.includes('start'), false);
  f.advance(1); f.advance();
  assert.deepEqual(f.calls.filter(call => typeof call === 'string'), ['ai', 'ai-confirm', 'ai-confirm', 'start']);
});

test('gaizhu: deadline at the first observed game frame still finishes the admitted round', async t => {
  const f = fixture(t);
  f.controller.setOptions({ role: 'auto', stopMode: 'timed', stopHours: 0.001 });
  f.advance();
  const starts = f.calls.filter(call => call === 'start').length;
  assert.equal(starts, 1);
  f.scene(f.game);
  f.advance(3350);
  assert.equal(f.controller.snapshot().role, 'auto');
  assert.equal(f.controller.snapshot().stopAfterRound, true);
  f.game._children = [{ text: '点击空白处继续', onClick() { f.calls.push('continue'); f.scene(f.room); } }];
  f.emit('MsgGameOver', {});
  await flush();
  f.advance(1200); f.advance(3000);
  assert.equal(f.controller.snapshot().role, 'off');
  assert.equal(f.controller.snapshot().rounds, 1);
  assert.equal(f.calls.filter(call => call === 'continue').length, 1);
  assert.equal(f.calls.filter(call => call === 'start').length, starts);
});

test('gaizhu: solo without point cards selects the highest quality confirmed unfinished general', async t => {
  const f = fixture(t);
  const defs = f.ctx.game.getConfigData('gn_gs_ahievement').AchievementAll.Achievement;
  defs.push({ Id: 40, characterId: 4, flags: 2048, CriteriaEntry: [{ Id: 400, count: 100 }] },
    { Id: 50, characterId: 5, flags: 2048, CriteriaEntry: [{ Id: 500, count: 100 }] });
  f.controller.setOptions({ role: 'auto' });
  const picked = [];
  const card = (itemId, quality, CanSelect = true) => ({ generalInfo: { itemId, quality }, CanSelect,
    sureBtnClick() { picked.push(itemId); win.visible = false; } });
  const win = { name: 'SelectGeneralWindow', generalUis: [card(2, 2), card(3, 4), card(4, 8), card(5, 9, false)] };
  f.game._children.push(win); f.scene(f.game); f.advance(3500);
  assert.deepEqual(picked, []);
  f.emit('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: '演练', Achs: [
    { id: 200, type: 2, detailInfo: 99 }, { id: 300, type: 2, detailInfo: 1 }, { id: 40, type: 1, detailInfo: 10 },
  ] });
  await flush(); f.advance();
  assert.deepEqual(picked, [3]);
});

test('gaizhu: only confirmed unfinished candidates are selected in solo, paired ordering is retained', async t => {
  for (const solo of [false, true]) {
    const f = fixture(t); if (!solo) f.rebel();
    f.controller.setOptions({ role: solo ? 'auto' : 'rebel' });
    await f.reply(solo ? 100 : 99);
    let picked;
    const card = (itemId, Quality) => ({ GeneralInfo: { ItemID: itemId, Quality }, sureBtnClick() { picked = itemId; } });
    f.game._children.push({ name: 'SelectGeneralWindow', generalUis: [card(2, 1), card(solo ? 999 : 3, 9)] });
    f.scene(f.game); f.advance(3500);
    assert.equal(picked, solo ? undefined : 2);
  }
});

test('gaizhu: identity practice start sends one additive native ban batch, never gates or retries', async t => {
  for (const solo of [false, true]) {
    const f = fixture(t); if (!solo) f.rebel();
    const defs = f.ctx.game.getConfigData('gn_gs_ahievement').AchievementAll.Achievement;
    for (const id of [4, 5, 6, 7, 8, 9, 10]) defs.push({ Id: id * 10, characterId: id, flags: 2048, CriteriaEntry: [{ Id: id * 100, count: 100 }] });
    const batches = [];
    const shield = {
      GetNewGeneralPoolComplianceByModeIdAndSection(mode, section) {
        assert.deepEqual([mode, section], [74, 1]);
        return this.GetNewGeneralPoolCompliance({ Id: 1, InFactGeneralList: [7, 8, 9, 10, 2, 3, 4, 5, 6],
          CantCloseGeneralList: [7], BfGListInShowPool: [2, 6], MinGOpen: 4, CanCloseBfAllCnt: 1 }, false);
      },
      GetShieldGeneralGameModelNodeByIndex: id => id === 1 ? { scheme_id: 22 } : null,
      GetShieldGeneralState: (id, scheme) => scheme === 22 && [6, 8].includes(id),
      InShieldCloseGeneral: id => id !== 10,
      SendClientShieldGeneralBatchReq(scheme, close, open) {
        assert.equal(this.ShieldGeneralBatchState, 0);
        batches.push([scheme, close, open]);
        if (solo) throw new Error('禁将暂不可用');
      },
    };
    const getClass = f.ctx.game.getClass;
    class IdentityRoom extends RoomSettingsWindow { get curModeVo() { return { ...super.curModeVo, Section: 1 }; } }
    f.ctx.game.getClass = name => name === 'CreateTableWindow' ? IdentityRoom : name === 'GameShieldGeneralManager'
      ? { instance: shield } : name === 'GameGeneralManager' ? { HasGeneral: id => id !== 9 } : getClass(name);
    const reply = async () => {
      f.emit('ClientDbsGetuserachinfoRep', { requestType: 0, NickName: '演练', Achs: [
        ...[2, 4, 5, 6, 7, 8, 9, 10].map(id => ({ id: id * 10, type: 1, detailInfo: 10 })),
        { id: 300, type: 2, detailInfo: 100 },
      ] });
      await flush();
    };
    f.controller.setOptions({ role: solo ? 'auto' : 'rebel' }); f.advance(1200);
    assert.ok(f.calls.includes(solo ? 'start' : 'ready'), 'room proceeds before achievement reply');
    await reply(); f.advance(1500);
    assert.deepEqual(batches, [[22, [3, 4], []]]);
    assert.equal(f.controller.snapshot().role, solo ? 'auto' : 'rebel');
    assert.equal(f.controller.snapshot().error, '');
    f.scene(f.game); f.advance(); f.scene(f.room); f.advance(1500);
    await reply(); f.advance(1500);
    assert.equal(batches.length, 1, 'next rounds do not send another ban request');
  }
});

test('gaizhu: startup ban is discarded on leaving the original room while waiting for achievements', async t => {
  const f = fixture(t); f.rebel();
  let attempts = 0;
  f.ctx.game.getClass = name => {
    if (name === 'GameShieldGeneralManager') attempts++;
    return name === 'CreateTableWindow' ? RoomSettingsWindow : null;
  };
  f.controller.setOptions({ role: 'rebel' });
  f.scene(f.game); f.advance(500);
  await f.reply(100);
  f.scene(f.room); f.advance(1500); await f.reply(100);
  assert.equal(f.controller.snapshot().role, 'rebel');
  assert.equal(attempts, 0);
});

test('gaizhu: training ignores point modes, selects recommended general, shops and requests next game once', async t => {
  const f = fixture(t), oldClass = f.ctx.game.getClass;
  let group = 3, buys = 0, again = 0, selected = 0;
  f.ctx.game.getClass = name => name === 'GameContext' ? { GetModeVO: () => ({ ModeID: 160 }), GetGroupID: () => group } : oldClass(name);
  f.scene(f.game);
  const win = { name: 'SelectGeneralRogue1v1Window', generalUis: [
    { generalInfo: { itemId: 2, quality: 5 }, sureBtnClick() { selected = 2; } },
    { generalInfo: { itemId: 3, quality: 1 }, winRateBg: { visible: false }, winRateTf: { visible: false }, sureBtnClick() { selected = 3; } },
  ] };
  f.game._children = [win];
  f.controller.setOptions({ role: 'auto', autoMode: 'training', pick: 'order' });
  assert.equal(f.controller.snapshot().training, true);
  f.advance(299); assert.equal(selected, 0);
  win.generalUis[1].winRateBg.visible = win.generalUis[1].winRateTf.visible = true;
  f.advance(1); assert.equal(selected, 3);
  assert.ok(!f.calls.some(c => Array.isArray(c) && c[0] === 'point'));
  f.game._children = [{ name: 'RogueLike1v1GameShopWindow', ShopView: { ShowItemList: [
    { Id: 9999, hufuNum: 0, Requestbuy() { buys++; } },
    { Id: 2009, hufuNum: 1, Requestbuy() { buys++; } },
    { Id: 9998, hufuNum: 1, Requestbuy() { throw Error('not in old whitelist'); } },
    { Id: 2021, hufuNum: 1, lbPriceUnEnough: { visible: true }, Requestbuy() { throw Error('insufficient'); } },
  ] }, LeftHide() {} }];
  f.advance(); f.advance(1000); f.advance(); assert.equal(buys, 2);
  f.emit('MsgGameOver', {}); await flush();
  f.game._children = [{ name: 'RogueLike1v1ZhanJiWindow', onClickAgain() { again++; } }];
  f.advance(1500); f.advance(); assert.equal(again, 1);
  f.game._children = [win]; f.advance(); assert.equal(f.controller.snapshot().rounds, 1);
  group = 2; f.advance(); assert.equal(f.controller.snapshot().role, 'off');
  assert.match(f.controller.snapshot().error, /离开单骑人机/);
});

test('training allows own-turn fallback before twenty seconds as soon as the mulligan is closed', t => {
  const f = fixture(t), getClass = f.ctx.game.getClass;
  f.ctx.game.getClass = name => name === 'GameContext' ? { GetModeVO: () => ({ ModeID: 160, Section: 3 }) } : getClass(name);
  f.game.SelfSeatUi.seat.InOwnRound = true;
  const mulligan = { name: 'ShouQiKaAskWindow', CloseWin() { f.calls.push('decline-mulligan'); } };
  f.game._children = [mulligan];
  f.scene(f.game);
  f.controller.setOptions({ role: 'auto', autoMode: 'training' });
  f.advance(4000);
  assert.ok(f.calls.includes('decline-mulligan'));
  assert.ok(!f.calls.includes('trustee'));
  mulligan.visible = false;
  f.advance();
  f.advance(1000);
  f.advance(3000);
  assert.equal(f.calls.filter(call => call === 'trustee').length, 1);
});

test('training counts a mounted result without GameOver, then advances through the lobby to a fresh game', async t => {
  const f = fixture(t), getClass = f.ctx.game.getClass;
  f.ctx.game.getClass = name => name === 'GameContext' ? { GetModeVO: () => ({ ModeID: 160, Section: 3 }) } : getClass(name);
  const lobby = { name: 'RogueLike1v1Scene', btnList: [{ name: 'zgs_robot_tex', onClick() { assert.fail('native replay already requested'); } }] };
  f.scene(f.game);
  f.controller.setOptions({ role: 'auto', autoMode: 'training' });
  f.game._children = [{ name: 'RogueLike1v1ZhanJiWindow', isShare: true, onClickAgain() { assert.fail('share window'); } }];
  f.advance();
  assert.equal(f.controller.snapshot().rounds, 0);
  const againBtn = { enabled: false };
  f.game._children.push({ name: 'RogueLike1v1ZhanJiWindow', againBtn, onClickAgain() { f.calls.push('again'); f.scene(lobby); } });
  f.advance();
  assert.equal(f.controller.snapshot().rounds, 1);
  assert.equal(f.calls.includes('again'), false);
  againBtn.enabled = true; f.advance();
  f.emit('MsgGameOver', {}); await flush();
  f.advance(1000);
  const cancel = { name: 'btnCancel', enabled: true, onClick() { f.calls.push('next-game-action'); this.enabled = false; } };
  const next = { name: 'RogueLike1v1GameScene', _children: [], SelfSeatUi: { CurStepHelpData: { buttonName: 'btnCancel' }, Pt: { btns: [cancel] } } };
  f.scene(next); f.advance();
  assert.equal(f.controller.snapshot().phase, 'game');
  assert.equal(f.controller.snapshot().rounds, 1);
  assert.deepEqual(f.calls.filter(c => c === 'again' || c === 'next-game-action'), ['again', 'next-game-action']);
});

test('training starts from the native lobby once when the finished round result is already closed', async t => {
  const f = fixture(t), getClass = f.ctx.game.getClass;
  f.ctx.game.getClass = name => name === 'GameContext' ? { GetModeVO: () => ({ ModeID: 160, Section: 3 }) } : getClass(name);
  const next = { name: 'RogueLike1v1GameScene', _children: [], SelfSeatUi: {} };
  const lobby = { name: 'RogueLike1v1Scene', btnList: [{ name: 'zgs_robot_tex', onClick() { f.calls.push('robot'); } }] };
  f.scene(f.game);
  f.controller.setOptions({ role: 'auto', autoMode: 'training' });
  f.emit('MsgGameOver', {}); await flush();
  f.scene(lobby); f.advance(); f.advance(1000);
  assert.deepEqual(f.calls.filter(c => c === 'robot'), ['robot']);
  f.scene(next); f.advance();
  assert.equal(f.controller.snapshot().phase, 'game');
  f.emit('MsgGameOver', {}); await flush();
  assert.equal(f.controller.snapshot().rounds, 2);
});


test('training skin: preserves current skin via native Close, falls back to first owned and never runs when stopped', t => {
  for (const outcome of ['close','first','stuck','off']) {
    const f=fixture(t),old=f.ctx.game.getClass,calls=[];
    f.ctx.game.getClass=name=>name==='GameContext'?{GetModeVO:()=>({ModeID:160,Section:3})}:old(name);
    f.scene(f.game);
    const unusable={HasSkin:false},owned={HasSkin:true};
    const win={name:'SelectSkinWindow',generalID:2,selectView:{usingSkinID:outcome==='first'?undefined:9,itemList:[unusable,owned],itemClick(event){assert.equal(event.currentTarget,owned);calls.push('first');if(outcome!=='stuck') win.visible=false;}},Close(){calls.push('close');if(outcome!=='stuck')win.visible=false;}};
    f.game._children=[win];
    if(outcome==='off'){f.advance();assert.deepEqual(calls,[]);continue;}
    f.controller.setOptions({role:'auto', autoMode:'training'});
    assert.deepEqual(calls,[outcome==='first'?'first':'close']);
    f.advance(250);assert.equal(calls.length,1);
    if(outcome==='stuck'){
      f.advance(1200);f.advance(1200);f.advance(1200);
      assert.deepEqual(calls,['close','first','first']);assert.equal(f.controller.snapshot().role,'off');assert.match(f.controller.snapshot().error,/皮肤窗口连续处理3次/);
    }else{f.advance(1500);assert.equal(calls.length,1);}
  }
});
