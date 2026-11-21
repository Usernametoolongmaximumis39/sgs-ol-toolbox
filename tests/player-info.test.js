import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyRobot, profileViews, reduce, initialState } from '../src/plugins/player-info/index.js';
import { inferIdentities, createIdentityHints, roomController, roomMode } from '../src/plugins/player-info/identity.js';
import { ResourceScope } from '../src/core/resources.js';
import { createPluginNative } from '../src/core/plugin-native.js';
test('legacy strict ID boundary and unknown values', () => {
  for (const id of [4000000001, '4294967295']) assert.equal(legacyRobot(id), true);
  for (const id of [1, 3999999999, 4000000000]) assert.equal(legacyRobot(id), false);
  for (const id of [null, undefined, '', ' ', true, NaN, Infinity, -1, 1.2, 'robot']) assert.equal(legacyRobot(id), null);
});
test('only visible existing profile views outside scene layer', () => {
  const stage = { _children: [] }, layer = { parent: stage, _children: [] };
  const view = { parent: layer, name: 'UserInfoView', userData: { ClientId: 4000000001 } };
  stage._children.push(layer); layer._children.push(view);
  assert.deepEqual(profileViews(stage), [view]);
  layer.visible = false; assert.deepEqual(profileViews(stage), []);
  layer.visible = true; layer.layerOrder = 2; assert.deepEqual(profileViews(stage), []);
});
test('session follows journal for consecutive matches', () => {
  assert.deepEqual(reduce(initialState(), { sessionId: 2 }), { sessionId: 2, identityBlocked: false });
});
function fixture() {
  const roster = Array.from({ length: 8 }, (_, i) => ({ SeatPlayerInfo: { ClientId: i + 100 } }));
  const seats = [7, 0, 3, 2, 4, 1, 6, 5].map(i => ({ seat: { playerInfo: { ClientId: i + 100 }, Figure: 0 },
    figureManager: { Figure: 0, SetFigure(n) { this.Figure = n; } } }));
  const rc = { TableSetting: { IsChooseFigure: true }, TabbleSeatInfos: { datum: roster } };
  return { rc, roster, seats, modeId: 73, setting: rc.TableSetting };
}
test('identity matches account to room order, independent of game seat order', () => {
  const f = fixture(); assert.deepEqual(inferIdentities(f).map(r => r.role), [3, 1, 4, 2, 3, 2, 3, 3]);
  f.seats[0].seat.Figure = 2; f.seats[1].figureManager.Figure = 1;
  assert.equal(inferIdentities(f).length, 6);
});
test('identity uses native waiting-seat positions and RandMode when the rule getter is absent', () => {
  const f = fixture();
  f.setting = { RandMode: 5, DoubleNeiJian: true };
  f.roster = [7, 5, 1, 0, 6, 4, 2, 3].map(SeatID => ({ SeatID, ClientId: SeatID + 100 }));
  assert.deepEqual(inferIdentities(f).map(row => row.role), [3, 1, 4, 2, 4, 2, 3, 3]);
  f.roster[1].SeatID = 7;
  assert.deepEqual(inferIdentities(f), []);
});
test('identity refuses other modes, incomplete, duplicate, stale, reconnect and non-custom rooms', () => {
  for (const change of [f => f.modeId = 26, f => f.setting.IsChooseFigure = false, f => f.blocked = true,
    f => f.roster.pop(), f => f.seats.pop(), f => f.roster[1] = f.roster[0],
    f => f.seats[1].seat.playerInfo.ClientId = 999, f => f.seats[1].seat.IsFull = false]) {
    const f = fixture(); change(f); assert.deepEqual(inferIdentities(f), []);
  }
});
test('closed-over controller is found via existing native proxy handler and mode via table ID', () => {
  const { rc } = fixture();
  const ctx = { game: { getClass: () => null, getServerProxy: () => ({ _events: { 20508: { caller: rc } } }) } };
  ctx.native = createPluginNative(ctx);
  assert.equal(roomController(ctx), rc); assert.equal(roomMode(307400001), 74);
});
test('production protocol names recover controller at opening-hand stage without ClassUtils', () => {
  for (const event of ['ClientTableinfoRep', 'GsCModifyUserseatNtf']) {
    const f = fixture(), scope = new ResourceScope();
    const proxy = { _events: { [event]: { caller: f.rc } } };
    const ctx = { scope, game: { getClass: () => null, getServerProxy: () => proxy, getSeatUIs: () => f.seats } };
    ctx.native = createPluginNative(ctx);
    assert.equal(roomController(ctx), f.rc);
    createIdentityHints(ctx).update({ inGame: true, modeId: 74 }, false);
    assert.deepEqual(f.seats.map(ui => ui.figureManager.Figure), [3, 1, 4, 2, 3, 2, 3, 3]);
    scope.dispose();
  }
});
test('native fill persists, respects confirmed updates and restores only owned changes', () => {
  const f = fixture(), scope = new ResourceScope();
  const ctx = { scope, game: { getClass: () => f.rc, getSeatUIs: () => f.seats } };
  ctx.native = createPluginNative(ctx);
  const runtime = createIdentityHints(ctx), snapshot = { inGame: true, modeId: 73 };
  const original = f.seats[0].figureManager.SetFigure;
  runtime.update(snapshot, false); runtime.update(snapshot, false);
  assert.deepEqual(f.seats.map(s => s.figureManager.Figure), [3, 1, 4, 2, 3, 2, 3, 3]);
  f.seats[0].figureManager.SetFigure(4); runtime.update(snapshot, false);
  scope.dispose(); assert.equal(f.seats[0].figureManager.Figure, 4);
  assert.equal(f.seats[1].figureManager.Figure, 0);
  assert.equal(f.seats[0].figureManager.SetFigure, original);
});
test('native opening refresh restores an unknown icon and preserves an official identity', () => {
  const f = fixture(), scope = new ResourceScope();
  const ctx = { scope, game: { getClass: () => f.rc, getSeatUIs: () => f.seats } };
  ctx.native = createPluginNative(ctx);
  const runtime = createIdentityHints(ctx), snapshot = { inGame: true, modeId: 73 };
  const reset = f.seats[0].figureManager, revealed = f.seats[1].figureManager;
  runtime.update(snapshot, false);
  reset.SetFigure(0);
  f.seats[1].seat.Figure = 2;
  revealed.SetFigure(2);
  runtime.update(snapshot, false);
  assert.equal(reset.Figure, 3);
  assert.equal(revealed.Figure, 2);
  scope.dispose();
  assert.equal(reset.Figure, 0);
  assert.equal(revealed.Figure, 2);
});
test('reconnect and gap block identity until new journal session', () => {
  for (const event of [{ type: 'MsgReconnectGame' }, { type: 'toolbox:gap' }, { type: 'MsgGamePlayCardNtf', payload: { IsResume: true } }]) {
    const state = reduce(initialState(), event); assert.equal(state.identityBlocked, true);
    assert.equal(reduce(state, { type: 'toolbox:snapshot' }).identityBlocked, true);
  }
});
