import { RoomSettingsWindow, attachRoomSettings } from './fixtures/gaizhu-room.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGaiZhu } from '../src/plugins/gaizhu/runtime.js';
import { createNative, usable, walkNative } from '../src/plugins/gaizhu/native.js';
import { ResourceScope } from '../src/core/resources.js';

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
      } else {
        events.get('REFRESH_RULE_UI')(); f.advance(5000); assert.equal(packets.length, 3);
        events.get('REFRESH_RULE_UI')(); f.advance(10000);
        assert.equal(packets.length, 3); assert.match(f.controller.snapshot().error, /连续3次/);
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
test('gaizhu: native hidden ancestors and disabled controls cannot be selected; bounded walks do not read arbitrary getters', () => {
  assert.equal(usable({ parent: { visible: false } }), false); assert.equal(usable({ _enabled: false }), false);
  const root = { _children: [] }; Object.defineProperty(root, 'trap', { get() { throw new Error('no generic getter reads'); } });
  for (let i = 0; i < 3000; i++) root._children.push({}); assert.ok(walkNative([root]).length <= 512);
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
  const native = createNative({ window: { Laya: { stage } }, game: {
    getScene: () => ({}), getClass: () => null,
    getServerProxy: () => ({ _events: { HIDE_WINDOW: { caller: wm } } }),
  } });
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

test('gaizhu: official Pt takes precedence over stale legacy alias and handles hand-card refusal', t => {
  const f = fixture(t); f.scene(f.game);
  const self = f.game.SelfSeatUi;
  self.buttonBar = { visible: true, btns: [], txtOptMsg: { _innerHTML: '旧文本' } };
  self.Pt = { visible: true, txtOptMsg: { _innerHTML: '是否更换手牌？' },
    btns: [{ label: '不使用', onClick() { f.calls.push('pt-decline'); self.Pt.visible = false; } },
      { label: '使用', onClick() { assert.fail('must not use mulligan'); } }] };
  f.controller.setOptions({ role: 'host' });
  assert.ok(f.calls.includes('pt-decline')); assert.equal(f.calls.includes('kurou'), false);
});
