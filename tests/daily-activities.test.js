import test from 'node:test';
import assert from 'node:assert/strict';
import { managerSpecs, planActivities, prepareActivities } from '../src/plugins/daily-rewards/activities.js';
import { awaitClaim } from '../src/plugins/daily-rewards/controller.js';
import { planRewards } from '../src/plugins/daily-rewards/native.js';

const dict = map => ({ _maps: map, getNumberKey(id) { return this._maps[id]; }, get(id) { return this._maps[id]; } });
test('DDZ earned weekly chests remain claimable in the hall regardless of current mode', () => {
  const sent = [], data = { ddz2023WeeklyWinAward: [] };
  const manager = {
    DdzData: data, IsDDZ2023HisWeekWinCtnReceived: true, DDZ2023HisWeekWinCtn: 4,
    DDZ2023WinAwardGetState: () => 0,
    SendDDZ2023StreakWinAwardReq: id => sent.push(id),
  };
  // Exact weekly IDs and thresholds from the saved official configuration.
  const configs = { 'hd_fight_lord_config.sgs': { WinningStreak: [3, 5, 7, 9].map((RequireSuccess, i) => ({ Id: i + 1, RequireSuccess, goodslist: '9020101,300;100301,30;' })) } };
  const f = fixture({ ActivityGameDataManager: manager }, configs);
  f.adapter.goods = id => ({ name: id === 100301 ? '手气卡' : '欢乐豆' });
  const plan = () => planRewards(f.adapter, { activities: true, excludeBeans: false });
  const action = plan().actions.find(a => a.key === 'ddz-streak:1');
  assert.ok(action); assert.equal(action.done(), false);
  assert.equal(plan().actions.filter(a => a.key.startsWith('ddz-streak:')).length, 1);
  action.send(); assert.deepEqual(sent, [1]);
  manager.DDZ2023HisWeekWinCtn = 2;
  assert.equal(action.eligible(), false); action.send(); assert.deepEqual(sent, [1]);
  manager.DDZ2023HisWeekWinCtn = 9;
  assert.equal(plan().actions.filter(a => a.key.startsWith('ddz-streak:')).length, 4);
  data.ddz2023WeeklyWinAward.push(1);
  assert.equal(action.done(), true); action.send(); assert.deepEqual(sent, [1]);
  assert.equal(plan().actions.some(a => a.key === 'ddz-streak:1'), false);
  manager.IsDDZ2023HisWeekWinCtnReceived = false;
  assert.equal(plan().actions.some(a => a.key.startsWith('ddz-streak:')), false);
  manager.IsDDZ2023HisWeekWinCtnReceived = true; delete data.ddz2023WeeklyWinAward;
  assert.equal(plan().actions.some(a => a.key.startsWith('ddz-streak:')), false);
});
test('DDZ streak chests require entitlement, correlate success, and honor mixed bean exclusions', async () => {
  const sent = [], states = { 1: 1, 2: 0, 3: 2 }, manager = {
    DDZ2023WinAwardGetState: id => states[id], SendDDZ2023StreakWinAwardReq: id => sent.push(id),
  };
  const configs = { 'hd_fight_lord_config.sgs': { WinningStreak: [1, 2, 3].map(Id => ({ Id, RequireSuccess: Id * 2 + 1, goodslist: '9020101,300;5,30' })) } };
  const f = fixture({ ActivityGameDataManager: manager }, configs);
  f.adapter.goods = id => ({ name: id === 5 ? '手气卡' : '欢乐豆' });
  const plan = selected => planRewards(f.adapter, { activities: true, ...selected });
  const action = plan({ excludeBeans: false }).actions.find(a => a.key === 'ddz-streak:1');
  assert.ok(action); action.send(); assert.deepEqual(sent, [1]); assert.equal(action.done(), false);
  const accept = action.confirmations[0].accept;
  assert.equal(accept({ Protocol: { rewardId: 1, result: 1 } }), true);
  for (const Protocol of [{ rewardId: 2, result: 1 }, { rewardId: 1, result: 0 }, { rewardId: 1, result: 3 }, { rewardId: 1, result: 1, errCode: 9 }]) assert.equal(accept({ Protocol }), false);
  assert.equal(action.rejections[0].accept({ Protocol: { rewardId: 1, result: 4 } }), true);
  assert.equal(plan({ excludeBeans: true }).actions.some(a => a.key.startsWith('ddz-streak:')), false);
  states[1] = 2; assert.equal(action.done(), true); assert.equal(action.eligible(), false); action.send(); assert.deepEqual(sent, [1]);
  const loads = []; f.adapter.loadConfig = async name => loads.push(name); delete configs['hd_fight_lord_config.sgs'];
  await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, ['hd_fight_lord_config']);
  assert.equal(plan({}).actions.some(a => a.key.startsWith('ddz-streak:')), false);
});
test('shared streak chest selects earned entry and rechecks route without duplicate requests', async () => {
  const sent = [], manager = {
    DdzData: { ddz2023WeeklyWinAward: [] }, IsDDZ2023HisWeekWinCtnReceived: true,
    DDZ2023HisWeekWinCtn: 0, DDZ2023WinAwardGetState: () => 1,
    Roguelike1v1Data: { rogue1v1WeeklyWinAward: [] }, rogue1v1HisWeekWinCtn: 4,
    SendDDZ2023StreakWinAwardReq: id => sent.push(['ddz', id]),
    Sendrogue1v1StreakWinAwardReq: payload => sent.push(['rogue', payload]),
  };
  const configs = { 'hd_fight_lord_config.sgs': { WinningStreak: [{ Id: 1, RequireSuccess: 3, goodslist: '9020101,300;100301,30;' }] } };
  const f = fixture({ ActivityGameDataManager: manager }, configs);
  f.adapter.goods = id => ({ name: id === 100301 ? '手气卡' : '欢乐豆' });
  const plan = (excludeBeans = false) => planRewards(f.adapter, { activities: true, excludeBeans }).actions.filter(a => a.key === 'ddz-streak:1');
  const [action] = plan(); assert.match(action.label, /单骑无双/);
  assert.equal(action.confirmations.length, 0); assert.equal(action.done(), false);
  action.send(); assert.deepEqual(sent, [['rogue', { id: 1 }]]);
  manager.rogue1v1HisWeekWinCtn = 0;
  assert.equal(action.send(), false); assert.equal(plan().length, 0);
  manager.rogue1v1HisWeekWinCtn = 4; manager.DDZ2023HisWeekWinCtn = 4;
  assert.equal(action.send(), false); assert.equal(plan().length, 1);
  assert.match(plan()[0].label, /斗地主/);
  plan()[0].send(); assert.deepEqual(sent[1], ['ddz', 1]);
  assert.equal(plan(true).length, 0);
  manager.Roguelike1v1Data.rogue1v1WeeklyWinAward.push(1);
  assert.equal(action.done(), true); assert.equal(plan().length, 0);
  manager.Roguelike1v1Data.rogue1v1WeeklyWinAward = [];
  manager.DdzData.ddz2023WeeklyWinAward.push(1); assert.equal(plan().length, 0);
  manager.DdzData.ddz2023WeeklyWinAward = []; manager.DDZ2023HisWeekWinCtn = 0;
  delete manager.Roguelike1v1Data.rogue1v1WeeklyWinAward; assert.equal(plan().length, 0);
  delete manager.SendDDZ2023StreakWinAwardReq;
  manager.Roguelike1v1Data.rogue1v1WeeklyWinAward = [];
  assert.equal(plan().length, 1);
  const loads = []; delete configs['hd_fight_lord_config.sgs']; f.adapter.loadConfig = async name => loads.push(name);
  await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, ['hd_fight_lord_config']);
});
function fixture(managers = {}, configs = {}) {
  const sent = [], proxy = {}, adapter = { manager: name => managers[name], config: name => configs[name], day: () => '2026-11-13', self: () => ({}), proxy: () => proxy };
  return { sent, adapter, plan: () => planActivities(adapter, { activities: true }) };
}
test('disabled activities do not inspect or mutate native state', async () => {
  const adapter = { manager() { throw Error('unexpected'); } };
  assert.deepEqual(planActivities(adapter, {}), { actions: [], notes: [] });
  await prepareActivities(adapter, {});
});
test('prepare only loads collection config when manager needs it and is cancellable', async () => {
  const f = fixture(); const loads = []; f.adapter.loadConfig = async name => loads.push(name);
  await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, []);
  f.adapter.manager = () => ({ LampRewardReq() {} });
  await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, ['cha_dbs_general_series']);
  f.adapter.signal = { aborted: true }; await prepareActivities(f.adapter, { activities: true }); assert.equal(loads.length, 1);
});
test('old festival uses native entitlement and correlated response, never buys activation', () => {
  const data = { awardData: [], AwardCanGet: day => day <= 2 && !data.awardData.includes(day), AwardHadGet: day => data.awardData.includes(day) };
  let open = true; const calls = [];
  const manager = { FestivalSignConfigDic: dict({ 17: { id: 17, awards: [{ days: 1 }, { days: 2 }, { days: 3 }] } }), GetFestivalSignData: () => data, FestivalSignNeedShow: () => open,
    SendClientFestivalSignGetRewardReq: (...args) => calls.push(args) };
  const f = fixture({ ActivityManager: manager }), actions = f.plan().actions;
  assert.equal(actions.length, 2); assert.deepEqual(calls, []);
  actions[0].send(); assert.deepEqual(calls, [[17, 1]]);
  const accept = actions[0].confirmations[0].accept;
  assert.equal(accept({ Protocol: { result: 0, xId: 17, days: 2 } }), false);
  assert.equal(accept({ Protocol: { result: 1, xId: 17, days: 1 } }), false);
  assert.equal(accept({ Protocol: { result: 0, xId: 17, days: 1 } }), true);
  data.awardData.push(1); assert.equal(actions[0].done(), true);
  open = false; assert.equal(actions[1].eligible(), false); assert.equal(f.plan().actions.length, 0);
});
test('new festival and accumulated login only send eligible unclaimed dates/days', () => {
  const date = { date: 20261113, stat: false }, acc = { day: 3, stat: false }, calls = [];
  const manager = { NewFestivalSignDataDic: dict({ 71: { id: 71, awards: [date] } }), GetNewFestivalSignData(id) { return this.NewFestivalSignDataDic.get(id); },
    NewFestivalSignNeedShow: () => true, GetFesSignAwdState: value => value.stat ? 1 : 2, SendNewClientFestivalSignGetRewardReq: (...args) => calls.push(args),
    AccumlateSignConfigDic: dict({ 85: { id: 85, awards: [acc] } }), AccumlateSignNeedShow: () => true, GetAccumlateAwdState: (_, value) => value.stat ? 1 : 2,
    SendNewClientAccumlateSignGetRewardReq: (...args) => calls.push(args) };
  const f = fixture({ ActivityManager: manager }), actions = f.plan().actions;
  assert.equal(actions.length, 2); actions.forEach(action => action.send()); assert.deepEqual(calls, [[71, 20261113], [85, 3]]);
  date.stat = acc.stat = true; assert.equal(actions.every(action => action.done()), true); assert.equal(f.plan().actions.length, 0);
});
test('late config replacement is read again for accumulated reward status', () => {
  const manager = { AccumlateSignConfigDic: dict({ 85: { id: 85, awards: [{ day: 3, stat: false }] } }), AccumlateSignNeedShow: () => true,
    GetAccumlateAwdState: (_, value) => value.stat ? 1 : 2, SendNewClientAccumlateSignGetRewardReq() {} };
  const f = fixture({ ActivityManager: manager }), action = f.plan().actions[0];
  manager.AccumlateSignConfigDic._maps[85] = { id: 85, awards: [{ day: 3, stat: true }] }; assert.equal(action.done(), true);
});
test('all earned military reward endpoints preserve native flags and require actual awarded IDs', () => {
  const calls = [], manager = { HasJDRewardRed: true, JDHaveRewardList: [], JDHaveRewardList_bp: [], ReqDrawAllJDRwd: () => calls.push('jd'),
    HasNewJDRewardRed: true, NewJDHaveRewardList: [], NewJDHaveRewardList_bp: [], ReqDrawAllNewJDRwd: () => calls.push('new'),
    HasDDZTLLRewardRed: true, DDZBattleRewardList: [], DDZBattleAwardBpList: [], SendDDZTLLAwardReq: (...args) => calls.push(args) };
  const actions = fixture({ ActivityManager: manager }).plan().actions;
  assert.equal(actions.length, 3); actions.forEach(action => action.send()); assert.deepEqual(calls, ['jd', 'new', [0, false, true]]);
  manager.HasJDRewardRed = false; assert.equal(actions[0].done(), false); manager.JDHaveRewardList.push(6); assert.equal(actions[0].done(), true);
  manager.NewJDHaveRewardList_bp.push(7); assert.equal(actions[1].done(), true); manager.DDZBattleRewardList.push(8); assert.equal(actions[2].done(), true);
});
function passFixture() {
  const calls = [], pass = { VO: { ID: 2, IsInOpenTime: true, RewardList: [{ ID: 4, Point: 10, ItemInfo: {}, FFItemInfo: {} }, { ID: 5, Point: 100, ItemInfo: {} }] },
    CurPoints: 20, IsFF: false, awardsLow: [], awardsHigh: [], HasGetReward(id, high) { return (high ? this.awardsHigh : this.awardsLow)[id]; } };
  const manager = { PassdataDic: dict({ 2: pass }), GetPassData: () => pass, SendSetOutRewardReq: (...args) => calls.push(args) };
  return { ...fixture({ NewFuLiManager: manager }), calls, pass };
}
test('military pass handles sparse native award arrays without buying high entitlement', () => {
  const f = passFixture(); let actions = f.plan().actions; assert.equal(actions.length, 1); actions[0].send(); assert.deepEqual(f.calls, [[2, 4, false]]);
  f.pass.IsFF = true; actions = f.plan().actions; assert.equal(actions.length, 2);
  f.pass.awardsLow[4] = true; assert.equal(actions[0].done(), true); assert.equal(actions[1].done(), false);
  f.pass.awardsHigh[4] = true; assert.equal(f.plan().actions.length, 0);
});
test('expired pass and changed point balance disable queued reward', () => {
  const f = passFixture(), action = f.plan().actions[0]; f.pass.CurPoints = 0; assert.equal(action.eligible(), false);
  f.pass.CurPoints = 20; f.pass.VO.IsInOpenTime = false; assert.equal(action.eligible(), false); assert.equal(f.plan().actions.length, 0);
});
test('officer daily and weekly require timestamp change and entitlement removal', () => {
  const calls = [], manager = { DataInited: true, DayRewardTime: 0, WeekRewardTime: 0, CanGetOfficerDayReward() { return !this.DayRewardTime; }, CanGetOfficerWeekReward() { return !this.WeekRewardTime; },
    sendGetDayReward: () => calls.push('day'), sendGetWeekReward: () => calls.push('week') };
  const actions = fixture({ OfficerManager: manager }).plan().actions; assert.equal(actions.length, 2); actions.forEach(action => action.send()); assert.deepEqual(calls, ['day', 'week']);
  manager.DayRewardTime = 123; assert.equal(actions[0].done(), true); assert.equal(actions[1].done(), false);
});
test('atlas missing state is not success; all lamp series are excluded', () => {
  const calls = [], rewarded = [], manager = { atlasGeneralDict: dict({ 123: true, 124: false }), GetCurryAtlasGeneralState(id) { return this.atlasGeneralDict.get(id); },
    GeneralAtlasRewardReq: id => calls.push(['atlas', id]), LampRewardCanAward: id => id === 5, LampHasReward: id => rewarded.includes(id), LampRewardReq: id => calls.push(['lamp', id]) };
  const f = fixture({ GameGeneralManager: manager }, { 'cha_dbs_general_series.sgs': { root: { Collection: [{ seriesList: '5,5,6,81,invalid' }] } } });
  const actions = f.plan().actions; assert.equal(actions.length, 1); actions.forEach(action => action.send()); assert.deepEqual(calls, [['atlas', 123]]);
  delete manager.atlasGeneralDict._maps[123]; assert.equal(actions[0].done(), false); manager.atlasGeneralDict._maps[123] = false; assert.equal(actions[0].done(), true);
  rewarded.push(5); assert.equal(f.plan().actions.some(action => action.key.startsWith('lamp:')), false);
});
function freeRecruitFixture(freeId = 8123456) {
  const calls = [], bindings = new Map();
  const proxy = {
    on(event, caller, fn) { const rows = bindings.get(event) || []; rows.push({ caller, fn }); bindings.set(event, rows); },
    off(event, caller, fn) { bindings.set(event, (bindings.get(event) || []).filter(item => item.caller !== caller || item.fn !== fn)); },
    emit(event, packet) { for (const item of [...(bindings.get(event) || [])]) item.fn.call(item.caller, packet); },
  };
  const manager = { FreeOpenGeneralPackTime: 100, CanFreeOpenGeneral: () => true, reservePool: { Value: false }, SendClientUseGeneralDrawCardReq: (...args) => calls.push(args) };
  const configs = { 'ff_general_chest_info_config.sgs': { root: { Common: [{ freeGeneralDropId: freeId }] } } };
  const f = fixture({ GameGeneralManager: manager }, configs);
  f.adapter.self = () => ({ ClientId: 41 }); f.adapter.proxy = () => proxy;
  const action = () => f.plan().actions.find(item => item.key === 'free-general-pack');
  return { ...f, calls, proxy, manager, configs, action, freeId };
}
test('free general pack reads configured drop ID, only sends DrawType 3 and confirms exact counter', () => {
  const f = freeRecruitFixture(), action = f.action();
  action.send(); assert.deepEqual(f.calls, [[8123456, 3]], 'uses the current free drop instead of a hardcoded goods ID');
  assert.equal(action.done(), false); f.manager.reservePool.Value = true; assert.equal(action.eligible(), false);
  f.manager.reservePool.Value = false;
  f.configs['ff_general_chest_info_config.sgs'].root.Common[0].freeGeneralDropId = 8123499;
  assert.equal(action.eligible(), false, 'replaced free configuration invalidates the old action');
  f.manager.FreeOpenGeneralPackTime = 200; assert.equal(action.done(), true);
});

test('free recruit reads the shipped top-level Common table without requiring a synthetic root wrapper', () => {
  const calls = [], manager = { FreeOpenGeneralPackTime: 0, CanFreeOpenGeneral: () => false, SendClientUseGeneralDrawCardReq: (...args) => calls.push(args) };
  const f = fixture({ GameGeneralManager: manager }, { 'ff_general_chest_info_config.sgs': { Common: [{ freeGeneralDropId: 8199999 }] } });
  const action = f.plan().actions.find(item => item.key === 'free-general-pack'); assert.ok(action); action.send(); assert.deepEqual(calls, [[8199999, 3]]);
});
test('free general preparation waits for its configuration and respects the recruitment exclusion', async () => {
  const f = freeRecruitFixture(), loads = [];
  delete f.configs['ff_general_chest_info_config.sgs'];
  assert.equal(f.action(), undefined);
  assert.ok(f.plan().notes.some(note => note.text.includes('免费招募配置尚未就绪')));
  f.adapter.loadConfig = async name => loads.push(name);
  await prepareActivities(f.adapter, { activities: true });
  assert.deepEqual(loads, ['ff_general_chest_info_config']);
  loads.length = 0;
  await prepareActivities(f.adapter, { activities: true, excludeRecruit: true });
  assert.deepEqual(loads, []);
});
test('free recruit replies require matching free drop, current account, success and native effect type', () => {
  const f = freeRecruitFixture(), accept = f.action().confirmations[0].accept;
  const good = { GoodsBaseID: f.freeId, UserClientID: 41, Type: 1, Result: 1 };
  assert.equal(accept({ Protocol: good }), true);
  assert.equal(accept({ Protocol: { ...good, Type: 2 } }), true);
  for (const changed of [
    { GoodsBaseID: f.freeId + 1 }, { UserClientID: 42 }, { UserClientID: undefined },
    { Type: 0 }, { Type: 3 }, { Type: undefined }, { Result: 0 }, { Result: 2 }, { Result: 9 }, { Result: '1' },
  ]) assert.equal(accept({ Protocol: { ...good, ...changed } }), false, JSON.stringify(changed));
  assert.equal(accept({ GoodsBaseID: f.freeId, UserClientID: 41, Type: 1, Result: 1 }), false);
});
test('free recruit confirms its reply before the separate free counter notification arrives', async () => {
  const f = freeRecruitFixture();
  f.manager.SendClientUseGeneralDrawCardReq = (GoodsBaseID, DrawType) => {
    f.calls.push([GoodsBaseID, DrawType]);
    f.proxy.emit('CcUserUsingGoodsRep', { Protocol: { GoodsBaseID: GoodsBaseID + 1, UserClientID: 41, Type: 1, Result: 1 } });
    queueMicrotask(() => f.proxy.emit('CcUserUsingGoodsRep', { Protocol: { GoodsBaseID, UserClientID: 41, Type: 2, Result: 1 } }));
  };
  const result = await awaitClaim(f.action(), { valid: () => true, timeout: 30, poll: 2 });
  assert.equal(result.status, 'confirmed');
  assert.equal(f.manager.FreeOpenGeneralPackTime, 100, 'counter packet can legitimately be later than the success reply');
  assert.deepEqual(f.calls, [[8123456, 3]]);
});
test('free recruit can still confirm from a later native counter update without a correlated reply', async () => {
  const f = freeRecruitFixture();
  f.manager.SendClientUseGeneralDrawCardReq = (...args) => { f.calls.push(args); setTimeout(() => { f.manager.FreeOpenGeneralPackTime = 200; }, 4); };
  assert.equal((await awaitClaim(f.action(), { valid: () => true, timeout: 30, poll: 2 })).status, 'confirmed');
});
test('free recruitment follows the native zero-counter first-use branch', () => {
  const f = freeRecruitFixture(); f.manager.FreeOpenGeneralPackTime = 0; f.manager.CanFreeOpenGeneral = () => false;
  const action = f.action();
  assert.ok(action, 'native free UI treats counter zero as free before its date-based getter becomes true');
  action.send(); assert.deepEqual(f.calls, [[8123456, 3]]);
});
test('rank level reward validates current season and exact server correlation', () => {
  const calls = [], manager = { NewParWeiOriData: { curCycData: { roundId: 12, curRecord: { curLevel: { level: 3 } } }, curAwardInfo: { levelAwardState: [1] } },
    CurSessionVoById: { CycID: 12, LvAwardList: [{ Level: 1, Itemlist: [1] }, { Level: 2, Itemlist: [1] }, { Level: 3, TaskId: 5, Itemlist: [1] }, { Level: 4, Itemlist: [1] }] }, RequestLevelAward: (...args) => calls.push(args) };
  const f = fixture({ TianTiManager: manager }), actions = f.plan().actions; assert.equal(actions.length, 1); actions[0].send(); assert.deepEqual(calls, [[2, 12]]);
  const accept = actions[0].confirmations[0].accept;
  assert.equal(accept({ result: 1, cycId: 11, level: 2 }), false); assert.equal(accept({ result: 0, cycId: 12, level: 2 }), false); assert.equal(accept({ result: 1, cycId: 12, level: 2 }), true);
  manager.NewParWeiOriData.curCycData.roundId = 13; assert.equal(actions[0].eligible(), false); assert.equal(f.plan().actions.length, 0);
});
test('invite coins require real raw success with matching id and reject UI success-looking events', () => {
  const calls = [], manager = { InviteLoginCfg: { roundId: 12 }, InviteLoginInfo: { assistList: [{ id: 2, type: 3, state: false, count: 4 }, { id: 3, type: 3, state: true, count: 5 }] }, SendReqInviteLoginGetCoin: (...args) => calls.push(args) };
  const actions = fixture({ ActivityManager: manager }).plan().actions; assert.equal(actions.length, 1); actions[0].send(); assert.deepEqual(calls, [[3, 12]]);
  const accept = actions[0].confirmations[0].accept, event = data => ({ Protocol: { Data: { ProtoObj: data } } });
  assert.equal(accept(3), false); assert.equal(accept(event({ result: 2, id: 3 })), false); assert.equal(accept(event({ result: 0, id: 2 })), false); assert.equal(accept(event({ result: 0, id: 3 })), true);
  assert.equal(accept({ Protocol: { errCode: 1, Data: { ProtoObj: { result: 0, id: 3 } } } }), false); assert.equal(actions[0].done(), false);
});
test('low beans defer to native entitlement and completed counter increases', () => {
  let calls = 0; const manager = { CanGetDdzFreeBean: true, DdzFreeBeanCount: 0, SendClientGetWeekFreeBeanReq: () => calls++ };
  const f = fixture({ ActivityGameDataManager: manager }), action = f.plan().actions[0]; action.send(); assert.equal(calls, 1);
  manager.CanGetDdzFreeBean = false; assert.equal(action.eligible(), false); assert.equal(action.done(), false);
  manager.DdzFreeBeanCount = 1; assert.equal(action.done(), true); assert.equal(f.plan().actions.length, 0);
});
test('tavern only claims completed safe task and never accepts, chooses or purchases', () => {
  const calls = [], task = { CanAward: true, CanRewardCount: 1, baseVo: { name: '酒馆福利', maxComplete: 1 } }, manager = { GetServerTaskDataByTaskID: id => id === 161114 ? task : null, RequestTaskAward: (...args) => calls.push(args) };
  const f = fixture({ TaskManager: manager }), action = f.plan().actions[0]; action.send(); assert.deepEqual(calls, [[161114, 0, 0]]);
  task.HaveSelectReward = true; assert.equal(action.eligible(), false); task.HaveSelectReward = false; task.baseVo.desc = '消耗铜钱'; assert.equal(f.plan().actions.length, 0);
  task.HasAward = true; assert.equal(action.done(), true);
});
test('an unavailable activity group does not prevent independent officer claim', () => {
  const activity = { get FestivalSignConfigDic() { throw Error('not ready'); }, SendClientFestivalSignGetRewardReq() {} };
  const officer = { DayRewardTime: 0, CanGetOfficerDayReward: () => true, sendGetDayReward() {} };
  const result = fixture({ ActivityManager: activity, OfficerManager: officer }).plan(); assert.equal(result.actions.length, 1); assert.ok(result.notes.some(note => note.text.includes('节日签到')));
});
test('manager discovery uses verified official event names', () => {
  assert.ok(managerSpecs.NewFuLiManager.events.includes('decodeSetOutGiftInfoResp'));
  assert.ok(managerSpecs.OfficerManager.events.includes('decodeUserOfficerGetDayRewardRep'));
  assert.equal(managerSpecs.GameGeneralManager.guard({ CanFreeOpenGeneral() {} }), true);
});

test('native dictionaries keep numeric IDs when datum is also populated', () => {
  const manager = { atlasGeneralDict: { ...dict({ 654: true }), datum: [true] }, GetCurryAtlasGeneralState: () => true, GeneralAtlasRewardReq() {} };
  const actions = fixture({ GameGeneralManager: manager }).plan().actions;
  assert.equal(actions[0].key, 'atlas:654');
});
test('military task milestones use exact configured thresholds and claimed IDs', () => {
  const calls = [], manager = { JdTaskRewardNum: 12, jdTaskRewardList: [1], HasRewardQuest(id) { return this.jdTaskRewardList.includes(id); }, SendGetJdCalcQuestRewardReq: id => calls.push(id) };
  const f = fixture({ TaskManager: manager }, { 'ff_task_daily.sgs': { root: { cumulativeQuest: [
    { id: 1, rewardneed: 5, rewardnum: '10,1' }, { id: 2, rewardneed: 10, rewardnum: '10,2' }, { id: 3, rewardneed: 20, rewardnum: '10,3' }, { id: 4, rewardneed: 2, rewardnum: '' },
  ] } } });
  const actions = f.plan().actions; assert.equal(actions.length, 1); actions[0].send(); assert.deepEqual(calls, [2]);
  manager.JdTaskRewardNum = 0; assert.equal(actions[0].eligible(), false); assert.equal(actions[0].done(), false);
  manager.jdTaskRewardList.push(2); assert.equal(actions[0].done(), true);
});
function historyFixture(rewards = [{ Level: 5, TaskId: 0, Itemlist: [[10, 1]] }, { Level: 10, TaskId: 0, Itemlist: [[10, 2]] }]) {
  const calls = [], histories = dict({ 10: { maxLevel: { level: 12 } }, 11: { maxLevel: { level: 7 } } }); histories.keys = ['10', '11'];
  const manager = { NewTTrankData: { ttrankType: 7 }, NewParWeiOriData: { curCycData: { roundId: 12 }, historyDataDic: histories, historyAwardDic: dict({ 10: { seasonAwardState: false }, 11: { seasonAwardState: false } }) },
    CurRankTypeVo: { GetSessionInfo: round => round === 11 ? { SessionAwardList: rewards } : null }, RequestSeasonAward: id => calls.push(id) };
  const f = fixture({ TianTiManager: manager }); return { ...f, manager, calls };
}
test('historical season settles only latest native history and confirms the distinct season protocol', () => {
  const f = historyFixture(), actions = f.plan().actions; assert.equal(actions.length, 1); actions[0].send(); assert.deepEqual(f.calls, [11]);
  const rule = actions[0].confirmations[0]; assert.equal(rule.event, 'ClientTTSeasonAwardRep');
  assert.equal(rule.accept({ Protocol: { result: 1, cycId: 11 } }), true);
  assert.equal(rule.accept({ Protocol: { result: 0, cycId: 11 } }), false);
  assert.equal(rule.accept({ Protocol: { result: 1, cycId: 10 } }), false);
  delete f.manager.NewParWeiOriData.historyAwardDic._maps[11]; assert.equal(actions[0].done(), false); assert.equal(actions[0].eligible(), false);
  f.manager.NewParWeiOriData.historyAwardDic._maps[11] = { seasonAwardState: true }; assert.equal(actions[0].done(), true); assert.equal(f.plan().actions.length, 0);
});
test('historical settlement requires configured threshold, complete status, and stable latest season', () => {
  const f = historyFixture(), action = f.plan().actions[0];
  f.manager.NewParWeiOriData.historyDataDic._maps[11].maxLevel.level = 2; assert.equal(f.plan().actions.length, 0); assert.equal(action.eligible(), false);
  f.manager.NewParWeiOriData.historyDataDic._maps[11].maxLevel.level = 7;
  f.manager.NewParWeiOriData.historyDataDic.keys.push('12'); assert.equal(action.eligible(), false);
});
test('historical task-based rewards use server CanAward and reject choice/consumption', () => {
  const f = historyFixture([{ Level: 10, TaskId: 900, Itemlist: [] }, { Level: 5, TaskId: 901, Itemlist: [] }]);
  delete f.manager.NewParWeiOriData.historyAwardDic;
  const task = { CanAward: true, CanRewardCount: 1, baseVo: { maxComplete: 1 } }, calls = [];
  const tasks = { GetServerTaskDataByTaskID: id => id === 901 ? task : { CanAward: false }, RequestTaskAward: (...args) => calls.push(args) };
  f.adapter.manager = name => name === 'TianTiManager' ? f.manager : name === 'TaskManager' ? tasks : null;
  const actions = f.plan().actions; assert.equal(actions.length, 1); assert.equal(actions[0].key, 'task:901'); actions[0].send(); assert.deepEqual(calls, [[901, 0, 1]]);
  task.HaveSelectReward = true; assert.equal(actions[0].eligible(), false); assert.equal(f.plan().actions.length, 0);
  task.HaveSelectReward = false; task.HasAward = true; assert.equal(actions[0].done(), true); assert.equal(f.plan().actions.length, 0);
});
test('historical config fallback selects exact rank type and season without creating classes', () => {
  const f = historyFixture(); delete f.manager.CurRankTypeVo;
  f.adapter.config = name => name === 'mod_new_ttrank_config.sgs' ? { root: { TTRankCfg: [
    { rankType: 8, RankItem: [{ cycId: 11, cycRewardQuest1: '1:20,2' }] },
    { rankType: 7, RankItem: [{ cycId: 10, cycRewardQuest1: '1:20,2' }, { cycId: 11, cycRewardQuest1: '5:20,1|10:20,2' }] },
  ] } } : null;
  assert.equal(f.plan().actions.length, 1); f.plan().actions[0].send(); assert.deepEqual(f.calls, [11]);
  f.manager.NewTTrankData.ttrankType = 9; assert.equal(f.plan().actions.length, 0); assert.ok(f.plan().notes.some(note => note.text.includes('rankType')));
});
test('new preparation loads only applicable configs and avoids rank config with native parsed rewards', async () => {
  const f = historyFixture(), loads = []; f.adapter.loadConfig = async name => loads.push(name);
  const tasks = { SendGetJdCalcQuestRewardReq() {} }; f.adapter.manager = name => name === 'TianTiManager' ? f.manager : name === 'TaskManager' ? tasks : null;
  await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, ['ff_task_daily']);
  delete f.manager.CurRankTypeVo; loads.length = 0; await prepareActivities(f.adapter, { activities: true }); assert.deepEqual(loads, ['ff_task_daily', 'mod_new_ttrank_config']);
});


test('tavern preparation fetches missing server progress before planning claims', async () => {
  const calls = []; let task;
  const manager = {
    reqTaskProgressByIds(ids) { calls.push(ids); setTimeout(() => { task = { CanAward: true, CanRewardCount: 1, baseVo: { maxComplete: 1 } }; }, 10); },
    GetServerTaskDataByTaskID: id => id === 161114 ? task : null,
    RequestTaskAward: (...args) => calls.push(args),
  };
  const f = fixture({ TaskManager: manager });
  assert.equal(f.plan().actions.length, 0);
  assert.ok(f.plan().notes.some(note => note.text.includes('161114')));
  assert.deepEqual(calls, []);
  await prepareActivities(f.adapter, { activities: true });
  assert.deepEqual(calls, [[161114, 161115, 161116]]);
  const action = f.plan().actions[0];
  assert.equal(action.key, 'tavern-task:161114');
  action.send(); assert.deepEqual(calls[1], [161114, 0, 0]);
});

test('tavern progress preparation respects cancellation and invalid account', async () => {
  let calls = 0; const abort = new AbortController();
  const f = fixture({ TaskManager: { reqTaskProgressByIds() { calls++; abort.abort(); } } });
  f.adapter.signal = abort.signal;
  await prepareActivities(f.adapter, { activities: true });
  assert.equal(calls, 1);
  await prepareActivities(f.adapter, { activities: true }); assert.equal(calls, 1);
  f.adapter.signal = new AbortController().signal; f.adapter.valid = () => false;
  await prepareActivities(f.adapter, { activities: true }); assert.equal(calls, 1);
});

test('tavern query failure remains visible to preparation caller', async () => {
  const f = fixture({ TaskManager: { reqTaskProgressByIds() { throw Error('query failed'); } } });
  await assert.rejects(prepareActivities(f.adapter, { activities: true }), /query failed/);
});
