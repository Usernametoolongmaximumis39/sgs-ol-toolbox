import { account, manager, observeNative, read, generalNames, field } from '../../shared/info-runtime.js';
import { cleanOptions, definitions, projectAchievements, evaluate, chooseGeneral, bannedGeneral, durationOf } from './model.js';
import { projectBattleGuard } from './battle-guards.js';
import { createAssistant, TRAINING_SHOP_IDS } from './assistant.js';
import { inspectHostRoom, isIdentityPractice, roomMode } from './room-settings.js';
import { disableCompletedGenerals } from './shield.js';
import { createNative, usable, press, label, nodeName, selfButtonBar } from './native.js';
import { createLobbyEntry, isLobbyEntry, isTrainingGame } from './lobby.js';
import { createNationRun, isNationGame, isNationRoom } from './nation.js';
import { createStopPolicy } from './stop-policy.js';

const AI_RETRY_MS = 1200;
const AI_ATTEMPT_LIMIT = 12;
const ENTRY_TIMEOUT_MS = 25000;
const SEAT_RETRY_MS = 2500;
const SEAT_TIMEOUT_MS = 10000;
const RESULT_TIMEOUT_MS = 15000;
const TRAINING_RECOMMENDATION_WAIT_MS = 300;

const roomNumberOf = scene => {
  const id = String(read(() => scene.startUI.rc.TableSetting.TableID) ?? read(() => scene.startUI.rc.TableId) ?? '');
  return /^[1-9]\d*$/.test(id) ? id : '';
};
const sameRoom = (room, scene) => room.number ? room.number === roomNumberOf(scene) : room.scene === scene;
const sameCompanion = (a, b) => Boolean(a && b && a.id === b.id && a.seat === b.seat);
const roomSeats = scene => {
  const entries = read(() => scene.seatListView.seatList);
  return Array.isArray(entries) ? entries.slice(0, 16) : [];
};
const waitInfo = ui => read(() => ui.WaitInfo) || read(() => ui.waitInfo);
const playerId = info => String(read(() => info.ClientId) ?? read(() => info.clientId) ?? '');
const firstRebelSeat = scene => read(() => scene.startUI.rc.TableSetting.DoubleNeiJian) ? 5 : 4;

// Port of the extension 2.6.8 state machines. A single, cancellable heartbeat
// owns all business actions; opening/collapsing the panel never starts a run.
export function createGaiZhu(ctx) {
  const native = createNative(ctx), listeners = new Set();
  const policy = createStopPolicy(ctx);
  let who = { id: '', nickname: '' }, role = 'off', options = cleanOptions(), error = '', status = '已停止';
  let settingsJob = null;
  let roomCheck = null, roomPassword = '', settingsRelease = null;
  let roomRetry = null;
  let seq = 0, phaseSeq = 0, round = {}, rounds = 0, log = [], general = null;
  let run = null, inLobby = false;
  let defs = [], names = {}, progress = null, pendingAch = null, configLoading = false, lastQuery = -Infinity;
  let startBan = null;
  const newAssistant = () => createAssistant({ getCardMeta: id => read(() => ctx.game.getCardMeta(id)), getSkill: id => read(() => ctx.game.getClass('Skill').GetInstance(id)), canOperate: () => read(() => ctx.game.getClass('GameContext').CanOperationInGame()) });
  let solo = false, training = false, assistant = newAssistant();
  let djRelease = null, stopped = false, configSeq = 0, synced = false;
  const now = () => typeof ctx.now === 'function' ? ctx.now() : Date.now();
  const connected = () => {
    const proxy = read(() => ctx.game.getServerProxy());
    return proxy === run?.proxy && read(() => proxy.ConnId) === run?.connectionId && read(() => proxy.ConnectedSucess1) !== false;
  };
  const alive = token => !stopped && !ctx.scope.signal.aborted && role !== 'off' && token === seq && connected() && account(ctx).id === who.id;
  function notify() { if (stopped || ctx.scope.signal.aborted) return; for (const fn of [...listeners]) fn(); }
  function note(text) { log = [...log.slice(-39), text]; }
  function state(text) { if (status === text) return; status = text; notify(); }
  function cancelRun() {
    seq++;
    read(() => run?.entry?.cancel());
    run = null;
    policy.reset();
    settingsRelease?.(); settingsRelease = null; settingsJob = null; roomCheck = null; roomPassword = '';
    djRelease?.(); djRelease = null; pendingAch = null; startBan = null;
    solo = false; training = false; assistant = newAssistant(); round = {}; general = null;
    configLoading = false; configSeq++;
  }
  function stopClean(message) {
    role = 'off'; roomRetry = null; cancelRun();
    status = message; note(message); notify();
  }
  function updateLobby(scene) {
    const next = isLobbyEntry({ scene, name: nodeName(scene) }, 'identity');
    if (inLobby !== next) { inLobby = next; notify(); }
  }
  // PluginManager's automatic recovery keeps slot.state but rebuilds this
  // controller. Preserve only the stopped diagnostic, never a running role.
  const sessionState = () => ctx.getState?.();
  function clearStoppedError() {
    const session = sessionState();
    if (session && typeof session === 'object') delete session.gaizhuStoppedError;
  }
  function rememberStoppedError() {
    const session = sessionState();
    if (session && typeof session === 'object' && who.id) {
      session.gaizhuStoppedError = { accountId: who.id, error, log: log.slice(-40) };
    }
  }
  function fail(value) {
    roomRetry = null;
    error = String(value?.stack || value); role = 'off'; cancelRun(); status = '已停止 · 查看错误详情'; note(error);
    rememberStoppedError();
    ctx.reportError?.(error); notify();
  }
  function stopForRoomSettings(value, scene, rc) {
    roomRetry = { scene, rc, tableId: read(() => rc.TableSetting.TableID), role, paired: run?.paired,
      autoMode: options.autoMode, readyAt: now() + 3000, seconds: 3 };
    error = String(value?.stack || value);
    role = 'off'; cancelRun();
    status = '房间设置未能自动修正，已停止。请检查密码（1–4 位数字且不是 1）、自选身份、允许点将，并关闭手牌构筑。';
    note(error); notify();
  }
  function updateRoomRetry() {
    if (!roomRetry) return;
    const { scene, rc, tableId, readyAt, seconds } = roomRetry;
    if (read(() => ctx.game.getScene()) !== scene || read(() => scene.startUI.rc) !== rc
      || read(() => rc.MasterIsSelf) !== true || read(() => rc.TableSetting.TableID) !== tableId) {
      roomRetry = null; state('已离开原房间或不再是房主 · 已停止'); return;
    }
    roomRetry.seconds = Math.max(0, Math.ceil((readyAt - now()) / 1000));
    if (seconds !== roomRetry.seconds) notify();
  }
  function sync() {
    const next = account(ctx);
    if (synced && next.id === who.id && next.nickname === who.nickname) return;
    const saved = sessionState()?.gaizhuStoppedError;
    if ((synced && next.id !== who.id) || (saved && saved.accountId !== next.id)) clearStoppedError();
    const restore = (!synced || next.id === who.id) && next.id && saved?.accountId === next.id && typeof saved.error === 'string' && saved.error;
    synced = true;
    roomRetry = null;
    const changed = Boolean(who.id); cancelRun(); who = next; role = 'off'; rounds = 0; log = []; progress = null;
    error = ''; options = cleanOptions(); status = changed ? '账号已切换 · 已停止' : '已停止';
    if (who.id) {
      try { options = cleanOptions(ctx.settings.get(`account:${who.id}:options-v1`, {})); }
      catch (e) { error = String(e?.stack || e); }
    }
    if (restore && !error) {
      error = saved.error; status = '已停止 · 查看错误详情';
      log = Array.isArray(saved.log) ? saved.log.filter(item => typeof item === 'string').slice(-40) : [error];
    }
    ctx.reportError?.(error); notify();
  }
  function configs() {
    const ach = ctx.game.getConfigData('gn_gs_ahievement'), character = ctx.game.getConfigData('character');
    if (ach) defs = definitions(ach);
    if (character) names = generalNames(character);
    return Boolean(defs.length && Object.keys(names).length);
  }
  function loadConfigs() {
    if (configs() || configLoading || typeof ctx.game.loadConfigData !== 'function') return;
    const token = seq, request = ++configSeq; configLoading = true;
    Promise.all([ctx.game.loadConfigData('gn_gs_ahievement'), ctx.game.loadConfigData('character')]).then(([ach, character]) => {
      if (!alive(token) || request !== configSeq) return;
      defs = definitions(ach); names = generalNames(character); configLoading = false; notify();
    }).catch(e => { if (alive(token) && request === configSeq) fail(e); });
  }
  function queryAchievements() {
    if (pendingAch || now() - lastQuery < 1000 || !who.nickname) return;
    const mgr = manager(ctx, 'AchievementManager', 'ClientDbsGetuserachinfoRep', m => typeof m.sendGetAchInfo === 'function');
    if (!mgr) { state('等待战功查询接口'); return; }
    lastQuery = now(); pendingAch = { seq, at: now(), nickname: who.nickname };
    mgr.sendGetAchInfo(who.nickname, 0); state('正在查询百胜战功');
  }
  function rows() {
    const gm = manager(ctx, 'GameGeneralManager', 'ClientGeneralFromRep', m => typeof m.HasGeneral === 'function');
    return evaluate(defs, progress, names, id => gm ? read(() => gm.HasGeneral(id)) ?? null : null);
  }
  function tryStartBan(scene) {
    if (!startBan) return;
    if (scene !== startBan.scene || now() >= startBan.until) { startBan = null; return; }
    if (!progress || !defs.some(def => def.flags === 2048)) return;
    const { mode } = startBan;
    startBan = null;
    try {
      const count = disableCompletedGenerals(ctx, mode, rows());
      if (count) note(`已请求禁用 ${count} 名已满百胜武将`);
    } catch (error) {
      note(`禁将请求失败，继续速刷：${String(error?.message || error)}`);
    }
  }
  function resetPhase(phase) {
    if (phase === 'game') assistant = newAssistant();
    const played = general;
    djRelease?.(); djRelease = null;
    round = { phase, serial: ++phaseSeq, entered: now(), dj: null, djDone: false, djContextAt: null,
      aiTries: 0, aiAt: -Infinity, aiConfirm: false, startTries: 0, startAt: -Infinity,
      ready: false, skillAt: -Infinity, skillCount: 0, cancelCount: 0, selectWindow: null, selectAt: 0, selected: false,
      guardUntil: phase === 'game' ? now() + 20000 : 0, trusteeAt: -Infinity, trusteeTries: 0, offTries: 0,
      overAt: null, overTries: 0, overClick: -Infinity, waitAt: null, delayDone: false, waitWarned: false,
      achNeeded: role === 'rebel' || solo, achRequested: false, achFailures: 0, played };
    if (phase === 'room' && (role === 'rebel' || solo)) progress = null;
    run.nation?.reset(phase);
    note(phase === 'room' ? '已进入房间，开始下一轮' : '进入对局，守备期间拒绝手气卡');
  }
  function ownRoomSeat(scene) {
    return roomSeats(scene).map(waitInfo).find(info => playerId(info) === who.id) || null;
  }
  function roomOwner(scene, self = ownRoomSeat(scene)) {
    return (self?.isMaster ?? self?.IsMaster ?? read(() => scene.startUI.rc.MasterIsSelf)) === true;
  }
  function roomCompanion(scene) {
    const others = [];
    for (const [index, ui] of roomSeats(scene).entries()) {
      const info = waitInfo(ui), id = playerId(info);
      // The player's own getter can report false for anthropomorphic robots;
      // native IDs above 4e9 are reserved for robots in the waiting room.
      if (id === who.id || !/^[1-9]\d*$/.test(id) || Number(id) > 4e9) continue;
      const player = read(() => info.SeatPlayerInfo);
      const robot = read(() => player.IsRobot) ?? read(() => info.IsRobot);
      if (robot === true || read(() => player.IsAnthropomorphicRobot) === true) continue;
      if (robot !== false) return null;
      const seat = Number(read(() => info.SeatID) ?? read(() => info.seatID) ?? read(() => ui.SeatId) ?? read(() => ui.seatId) ?? index);
      const name = String(read(() => player.NickName) ?? read(() => info.NickName) ?? read(() => info.nickName) ?? read(() => info.nickname) ?? '');
      if (Number.isInteger(seat) && seat >= 0) others.push({ id, seat, name });
    }
    return others.length === 1 ? others[0] : null;
  }
  function checkPair(scene) {
    const paired = run.paired;
    if (read(() => scene.startUI.rc.MasterIsSelf) !== true || !sameRoom(run.room, scene)
      || read(() => scene.startUI.rc.TableSetting.Password) !== paired.password) {
      stopClean('房号、房主或密码已变化 · 已停止'); return false;
    }
    const next = ownRoomSeat(scene) ? roomCompanion(scene) : null;
    const previous = paired.candidate;
    paired.candidate = next;
    if (next?.id !== previous?.id || next?.seat !== previous?.seat || next?.name !== previous?.name) notify();
    if (!paired.confirmed) {
      state(next ? '同伴已入席 · 请确认并开始速刷' : '房间已创建 · 等待一名真人同伴入席'); return false;
    }
    if (!sameCompanion(paired.confirmed, next)) { state('确认的同伴已离席 · 暂停开下一局'); return false; }
    return true;
  }
  function confirm() {
    sync();
    if (role !== 'host' || !run?.paired || run.paired.confirmed || !alive(seq)) return;
    const scene = read(() => ctx.game.getScene());
    const paired = run.paired, candidate = paired.candidate;
    checkPair(scene);
    if (run?.paired !== paired || !sameCompanion(candidate, paired.candidate)) return;
    paired.confirmed = candidate;
    note('已确认房号和真人同伴'); state('已确认同伴，正在启动'); tick();
  }
  function refuseMulligan() {
    const prompt = native.mulligan();
    if (!prompt) return false;
    round.guardUntil = Math.max(round.guardUntil || 0, now() + 20000);
    if (round.mlWindow !== prompt.win) { round.mlWindow = prompt.win; round.mlTries = 0; round.mlAt = -Infinity; }
    if (now() - round.mlAt < 250) return true;
    if (round.mlTries >= 3) { state('手气卡提示无法关闭 · 暂缓托管'); return true; }
    round.mlAt = now(); round.mlTries++;
    const declined = prompt.close?.() || prompt.declineNow?.();
    if (!declined) { state('未识别手气卡拒绝按钮 · 暂缓托管'); return true; }
    note('已拒绝手气卡'); state('拒绝手气卡'); return true;
  }
  function cancelPrompt(self) {
    if (cancelBar(self)) return true;
    const selector = read(() => self.spellSelector);
    if (selector?.visible && usable(selector)) {
      const choice = (Array.isArray(selector.btnList) ? selector.btnList : []).find(b => {
        const data = b.data || b.Data || {};
        return usable(b) && (Number(data.sendData) === 255 || Number(data.sendData) === 0 && !data.callBack);
      });
      if (choice && typeof selector.btnClick === 'function') {
        selector.btnClick(choice); state('已取消当前询问'); return true;
      }
    }
    return false;
  }
  function cancelBar(self) {
    const bar = selfButtonBar(self); if (!usable(bar)) return false;
    const btn = [...(Array.isArray(bar.btns) ? bar.btns : []), read(() => bar.ButtonCancel), bar.btnCancel, bar.cancelBtn, bar.cancleBtn].find(b => usable(b)
      && (b.name === 'btnCancel' || /^(取消|不使用|不用|否|放弃|跳过)$/.test(label(b).replace(/\s+/g, '')))
      && !/使用|更换|替换/.test(label(b).replace(/不使用/, '')));
    if (!btn) return false;
    // Official Xzt.Button_Click accepts the FlatButton instance, checks game
    // operation, disables the button and calls ApplyButton(btn.name).
    // Avoid FlatButton.onClick's independent autoReset/selected guards.
    if (typeof bar.Button_Click === 'function') bar.Button_Click(btn);
    else if (!press(btn)) return false;
    round.cancelCount++; state('已取消当前询问'); return true;
  }
  function dyingPrompt(self) {
    const bar = selfButtonBar(self);
    if (!usable(bar)) return false;
    const text = [label(read(() => bar.txtOptMsg)), read(() => self.cardContainer.selectCardContext.message),
      read(() => self.cardContainer.selectCardContext.Message)].filter(Boolean).join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    return /求桃|濒死|(?:桃或酒|桃或者酒).*回[复復]/.test(text);
  }
  function selectGeneral() {
    const win = native.selectWindow();
    if (!win) { round.selectWindow = null; return false; }
    if (round.selectWindow !== win) {
      round.selectWindow = win; round.selectAt = now(); round.selected = false; round.trainingCandidatesAt = null;
    }
    if (round.selected) {
      const retry = round.selectRetry;
      if (retry && now() - retry.at >= 250) {
        // Native cards can use one click to highlight and a second to submit.
        // Retry once only while this exact window/card/run is still alive.
        round.selectRetry = null;
        if (usable(win) && usable(retry.card.ui)
          && native.cards(win, names).some(card => card.ui === retry.card.ui && card.id === retry.card.id)) native.choose(win, retry.card);
      }
      state('已选将，等待进入对局'); return true;
    }
    const cards = native.cards(win, names), elapsed = now() - round.selectAt;
    let card;
    if (role === 'host') {
      card = cards.find(c => c.name === '黄盖' || (names[c.id] === '黄盖'));
      if (!card && elapsed >= 20000) { fail('选将等待20秒仍未找到黄盖，已停止。候选：' + cards.map(c => `${c.name || '未知'}#${c.id || '?'}`).join('、')); return true; }
    } else if (training) {
      const pool = cards.filter(c => c.ui.CanSelect !== false);
      if (pool.length) {
        round.trainingCandidatesAt ??= now();
        if (now() - round.trainingCandidatesAt < TRAINING_RECOMMENDATION_WAIT_MS) {
          state('等待单骑推荐武将'); return true;
        }
      } else round.trainingCandidatesAt = null;
      card = pool.find(c => c.ui.winRateBg?.visible === true && c.ui.winRateTf?.visible === true)
        || pool.reduce((best, c) => !best || c.quality > best.quality ? c : best, null);
    } else if (options.pick !== 'off') {
      card = cards.find(c => c.id === general?.id);
      if (!card && elapsed >= 5000) card = cards.find(c => !bannedGeneral(c.id, c.name || names[c.id]));
      if (!card && elapsed >= 20000) { state('选将列表无可用目标，等待游戏处理'); return true; }
    } else if (solo) {
      if (!progress || !defs.some(def => def.flags === 2048)) {
        if (!progress) queryAchievements();
        state('选将框等待百胜数据'); return true;
      }
      const unfinished = new Set(rows().filter(row => row.completed === false).map(row => row.id));
      card = cards.filter(c => c.ui.CanSelect !== false && unfinished.has(c.id) && !bannedGeneral(c.id, c.name || names[c.id]))
        .reduce((best, c) => !best || c.quality > best.quality ? c : best, null);
      if (!card) { state('选将框没有可确认的未完成百胜武将'); return true; }
    } else {
      if (!progress) queryAchievements();
      if (!progress && elapsed < 3000) { state('选将框等待百胜数据'); return true; }
      const pool = cards.filter(c => !bannedGeneral(c.id, c.name || names[c.id]));
      const evaluated = rows().filter(r => pool.some(c => c.id === r.id));
      // Cards actually offered by the game are available for this selection,
      // even when ownership manager is absent (off mode spends no point card).
      const picked = chooseGeneral(evaluated.map(r => ({ ...r, owned: true })), { pick: 'order' });
      card = pool.find(c => c.id === picked?.id) || pool[Math.floor(Math.random() * pool.length)];
    }
    if (card && native.choose(win, card)) {
      general = { id: card.id, name: card.name || names[card.id] || '未知武将' }; round.selected = true;
      if (typeof card.ui.sureBtnClick === 'function' && typeof win.SetMineSelectId !== 'function') round.selectRetry = { at: now(), card };
      round.guardUntil = Math.max(round.guardUntil || 0, now() + 10000); note(`已选将：${general.name}`); state('已选将，等待进入对局');
    } else state(role === 'host' ? '等待选择黄盖' : '等待可用选将卡片');
    return true;
  }
  function beginDj(id, slot) {
    const context = native.dj();
    if (!context) {
      if (round.djContextAt == null) round.djContextAt = now();
      if (now() - round.djContextAt >= 6000) finishDj(false, '房间点将接口等待超时');
      else state('等待房间点将接口');
      return;
    }
    const { mgr, view } = context;
    // Extension 2.6.8 writes before canDianJiang. The client checks whether a
    // figure slot is populated here, not whether this account has permission.
    // DJ_TAP_FIGURE_CHANGE opens DianJiangWindow in the client: do not emit it
    // to submit an already selected general.
    if (!native.writeDj(mgr, id, slot, false)) { finishDj(false, '点将槽写入后校验失败'); return; }
    if (typeof mgr.canDianJiang === 'function' && !mgr.canDianJiang()) { finishDj(false, '目标点将槽尚不可提交'); return; }
    if (typeof view.onOpenDJClick !== 'function') { finishDj(false, '点将提交接口未就绪'); return; }
    const job = { mgr, view, id, slot, at: now(), confirmed: false };
    round.dj = job;
    if (typeof mgr.on === 'function' && typeof mgr.off === 'function') {
      const event = mgr.constructor?.UPDATE_OTHER_DJ || 'UPDATE_OTHER_DJ', token = seq;
      const accept = packet => {
        if (!alive(token) || round.dj !== job) return;
        const nick = field(packet, 'SzNickName') ?? field(packet, 'szNickname');
        if (nick && nick !== who.nickname) return;
        const data = field(packet, 'List') ?? field(packet, 'list') ?? field(packet, 'data');
        if (Array.isArray(data) && data.slice(0, 16).some(row => Number(row.GeneralID ?? row.generalID ?? row.generalId) === id && Number(row.Figure ?? row.figure) === slot + 1)) job.confirmed = true;
      };
      mgr.on(event, job, accept); djRelease = ctx.scope.add(() => mgr.off(event, job, accept));
    }
    // Despite its name, this native view method calls manager.sendDianJiang();
    // it does not open a window. No point-card UI is needed for this request.
    view.onOpenDJClick();
    state(`正在点将：${general?.name || names[id] || id}`);
  }
  function finishDj(ok, detail = '') {
    djRelease?.(); djRelease = null; round.dj = null;
    if (ok) { round.djDone = true; if (detail) note(detail); }
    else fail(detail || (role === 'host' ? '主公黄盖点将失败' : '反贼点将失败'));
  }
  function stepDj() {
    const job = round.dj; if (!job) return false;
    if (role === 'host' && !job.confirmed) {
      if (now() - job.at >= 6000) finishDj(false, '主公黄盖点将未收到服务器确认，已阻止添加人机和开始');
      else state('等待服务器确认主公点将黄盖');
      return true;
    }
    if (job.confirmed || now() - job.at >= 1500) {
      if (native.slot(job.mgr, job.slot) !== job.id) finishDj(false, '点将提交后目标槽发生变化');
      else finishDj(true, job.confirmed ? '服务器已确认本局点将'
        : '已调用点将提交，未收到服务器确认；开局继续核对选将列表');
    }
    return true;
  }
  function checkHostSettings(scene) {
    if (roomCheck === 'done') return true;
    if (roomCheck === 'pending') {
      const job = settingsJob;
      if (job?.retryAt && now() >= job.retryAt) {
        if (scene !== job.scene || read(() => job.rc.MasterIsSelf) !== true) { fail('等待房间设置重试期间房间或房主已变化，已停止'); return false; }
        job.send();
      } else if (job && !job.retryAt && now() >= job.deadline) stopForRoomSettings('房间设置修改等待服务器确认超时，已停止', scene, job.rc);
      return false;
    }
    const force = roomCheck === 'force';
    const result = inspectHostRoom(ctx, scene, force);
    if (result.error) {
      if (result.rc) stopForRoomSettings(result.error, scene, result.rc);
      else fail(result.error);
      return false;
    }
    if (!result.submit) {
      roomPassword = result.password; roomCheck = 'done';
      note(force ? '已手动强制开始 · 本次跳过房间设置修正' : '房间设置检查通过（本次启动仅检查一次）');
      notify(); return true;
    }
    roomCheck = 'pending';
    const token = seq, caller = {}, rc = result.rc;
    const complete = () => {
      if (!alive(token) || roomCheck !== 'pending') return;
      roomPassword = result.password; roomCheck = 'done'; settingsRelease?.(); settingsRelease = null;
      note('服务器已确认房间设置；本次连刷不再复查'); state('房间设置已确认');
    };
    const job = { scene, rc, attempts: 0, retryAt: 0, deadline: 0, send() {
      job.attempts++; job.retryAt = 0; job.deadline = now() + 6000;
      state(job.attempts === 1 ? '正在修正房间设置，等待服务器确认' : '正在重试房间设置 · 第' + job.attempts + '次');
      try { result.submit(); }
      catch (e) { if (alive(token) && roomCheck === 'pending') stopForRoomSettings(e, scene, rc); else throw e; }
    } };
    settingsJob = job;
    const rejected = () => {
      if (!alive(token) || roomCheck !== 'pending' || job.retryAt) return;
      if (job.attempts >= 3) { stopForRoomSettings('房间设置修改连续3次被拒绝，已停止', scene, rc); return; }
      job.retryAt = now() + 5000;
      note('房间设置被拒绝，等待5秒后重试'); state('房间设置被拒绝 · 等待5秒后重试');
    };
    settingsRelease = ctx.scope.add(() => {
      settingsJob = null;
      read(() => rc.off('MODIFY_TABLE_EVENT', caller, complete));
      read(() => rc.off('REFRESH_RULE_UI', caller, rejected));
    });
    try {
      rc.on('MODIFY_TABLE_EVENT', caller, complete);
      rc.on('REFRESH_RULE_UI', caller, rejected);
    } catch (e) { stopForRoomSettings(e, scene, rc); return false; }
    job.send();
    return false;
  }
  function roomHost(scene, single = false) {
    if (!checkHostSettings(scene)) return;
    if (round.dj) { stepDj(); return; }
    if (!single && !round.djDone) {
      // HaveDianJiang is this account's submitted/locked state. It is not a
      // room permission switch and must not be toggled before writing slots.
      const id = Number(Object.keys(names).find(id => names[id] === '黄盖'));
      if (id > 0) { general = { id, name: '黄盖' }; beginDj(id, 0); }
      else if (now() - round.entered >= 6000) fail('黄盖ID读取超时，已阻止添加人机和开始');
      else state('等待读取黄盖ID，暂不添加人机和开始');
      return;
    }
    const huanggaiId = Number(Object.keys(names).find(id => names[id] === '黄盖'));
    if (!single && (!(huanggaiId > 0) || native.slot(native.dj()?.mgr, 0) !== huanggaiId)) {
      fail('主公点将槽为空、不可读或不是黄盖，已阻止添加人机和开始'); return;
    }
    const view = read(() => scene.seatListView), entries = read(() => view.seatList);
    const seats = Array.isArray(entries) ? entries.slice(0, 16) : [];
    const perSeat = single && typeof read(() => view.showBtns) === 'function' && typeof read(() => view.addAiHandler) === 'function';
    if (perSeat ? fillSoloSeats(scene, view, seats) : fillRoomAi(scene, seats, single)) return;
    const start = read(() => scene.startUI.startBtn); if (!usable(start)) { state('等待其他玩家准备'); return; }
    if (now() - round.startAt < 2000) return;
    if (round.startTries >= 10) { fail('连续10次开始仍未进入对局，请检查反贼是否准备'); return; }
    round.startTries++; round.startAt = now(); press(start); state(`已请求开始 · 第${round.startTries}次`);
  }
  function fillSoloSeats(scene, view, seats) {
    const tableId = read(() => scene.startUI.rc.TableSetting.TableID);
    if (round.soloAi?.scene !== scene || round.soloAi.view !== view || round.soloAi.tableId !== tableId) {
      round.soloAi = { scene, view, tableId, attempts: new Map() };
    }
    const job = round.soloAi, empty = [];
    for (const [index, seat] of seats.entries()) {
      if (!seat) continue;
      const id = Number(seat.SeatId ?? seat.seatId ?? index);
      if (seat.waitInfo || seat.WaitInfo) job.attempts.delete(id);
      else if (Number(seat.SeatStatus ?? seat.seatStatus ?? 0) === 0) empty.push({ id, seat, tries: job.attempts.get(id) || 0 });
    }
    if (!empty.length) return false;
    if (now() - round.aiAt < AI_RETRY_MS) return true;
    // Fill seats that have had fewer attempts first so a failed seat cannot block the rest.
    const { id, seat, tries } = empty.reduce((first, next) => first.tries <= next.tries ? first : next);
    if (tries >= AI_ATTEMPT_LIMIT) {
      const positions = empty.map(({ id }) => `${id + 1}号位`).join('、');
      fail(`${positions}添加小杀重试后仍未入座，已停止。请检查房间后重新开始。`);
      return true;
    }
    round.aiAt = now(); job.attempts.set(id, tries + 1);
    const firstRebel = firstRebelSeat(scene);
    let tier;
    try { tier = native.seatAi(view, seat, id >= firstRebel && id < 8); }
    catch (error) { note(`${id + 1}号位添加小杀失败：${String(error?.message || error)}`); }
    if (tier) {
      note(`${tries ? '已重试' : '已请求'}在 ${id + 1} 号位添加${tier}`);
      state(tries ? `${id + 1}号位已重试 · 等待小杀入座` : `等待${tier}入座`);
    } else state(`${id + 1}号位未能添加小杀 · 等待重试`);
    return true;
  }
  function fillRoomAi(scene, seats, single) {
    const empty = seats.filter(seat => !(seat?.waitInfo || seat?.WaitInfo)).length;
    if (single) {
      if (empty < round.aiEmpty) round.aiTries = 0;
      round.aiEmpty = empty;
    }
    if (!empty) { round.aiConfirm = false; return false; }
    const coolingDown = now() - round.aiAt < AI_RETRY_MS;
    if (single && !round.aiConfirm) {
      if (coolingDown) return true;
      if (round.aiTries >= AI_ATTEMPT_LIMIT) {
        fail('添加普通小杀重试后仍有空位，已停止。请检查房间后重新开始。');
        return true;
      }
    }
    try {
      // The confirmation must be reachable even when the prompt disables the add button.
      if (native.confirmAi()) {
        if (single && !round.aiConfirm) round.aiTries++;
        round.aiConfirm = false; round.aiAt = now();
        note('已选择普通小杀，等待座位更新'); state('等待普通小杀入座');
      } else if (!coolingDown) {
        if (round.aiConfirm) {
          round.aiAt = now(); round.aiConfirm = false;
          state('未找到普通小杀选项，等待重试添加');
        } else if (round.aiTries < AI_ATTEMPT_LIMIT && (single || usable(scene.addAiBtn))) {
          round.aiAt = now(); round.aiConfirm = native.openAi();
          if (round.aiConfirm || single) round.aiTries++;
          state(round.aiConfirm ? '正在补齐普通小杀' : '暂时无法添加普通小杀 · 等待重试');
        } else state('等待添加普通小杀，暂不开始');
      }
    } catch (error) {
      if (!single) throw error;
      if (!round.aiConfirm) round.aiTries++;
      round.aiConfirm = false; round.aiAt = now();
      note(`添加普通小杀失败：${String(error?.message || error)}`);
      state('添加普通小杀失败 · 等待重试');
    }
    return true;
  }
  function prepareRebel() {
    if (round.dj) { stepDj(); return false; }
    if (options.pick !== 'off' && !round.djDone) {
      if (!progress) { queryAchievements(); return false; }
      const source = rows();
      if (!source.length) { fail('未找到可核对的百胜战功定义'); return false; }
      if (!source.some(r => r.owned === true)) { state('等待当前账号武将归属数据'); return false; }
      const currentId = options.pick === 'random' ? native.slot(native.dj()?.mgr, 2) : general?.id;
      if (options.pick === 'random' && !Number.isFinite(currentId)) {
        if (round.slotWaitAt == null) round.slotWaitAt = now();
        if (now() - round.slotWaitAt < 3000) { state('等待读取反贼点将槽，暂不覆盖已有选择'); return false; }
        note('反贼点将槽等待3秒仍不可读，使用当前未完成候选');
      }
      const chosen = chooseGeneral(source, { pick: options.pick, currentId });
      if (!chosen) { fail('没有已拥有且百胜未完成的可点武将（已排除黄盖）'); return false; }
      general = chosen; beginDj(chosen.id, 2); return false;
    }
    if (options.pick === 'off' && !progress) queryAchievements();
    return true;
  }
  function roomSingle(scene) {
    if (!roomOwner(scene)) { fail('身份自动挂机须由等待房间的房主启动'); return; }
    if (checkHostSettings(scene) && prepareRebel()) roomHost(scene, true);
  }
  function seatNewIdentityHost(scene) {
    const job = run.rebelSeat;
    const view = read(() => scene.seatListView), seats = roomSeats(scene);
    const self = seats.find(seat => playerId(waitInfo(seat)) === who.id);
    const seatId = seat => Number(read(() => seat.SeatId ?? seat.seatId));
    const first = firstRebelSeat(scene);
    const isRebel = seat => {
      const id = seatId(seat);
      return Number.isInteger(id) && id >= first && id < 8;
    };
    if (isRebel(self)) {
      run.rebelSeat = null;
      note(`已确认反贼座位：${seatId(self) + 1} 号位`);
      return true;
    }
    const time = now();
    if (time >= job.deadline) {
      stopClean('等待反贼座位确认超时 · 已停止挂机'); return false;
    }
    state('等待换到反贼座位');
    if (!self || !roomOwner(scene, waitInfo(self)) || time < job.retryAt) return false;
    const target = seats.filter(seat => isRebel(seat) && !waitInfo(seat) && read(() => seat.SeatStatus ?? seat.seatStatus) === 0)
      .sort((left, right) => seatId(right) - seatId(left))[0];
    if (!target) return false;
    if (typeof view.showBtns !== 'function' || typeof view.sitHandler !== 'function') throw new Error('原生换座入口不可用，已停止挂机');
    job.retryAt = time + SEAT_RETRY_MS;
    view.showBtns(target);
    view.sitHandler();
    return false;
  }
  function roomRebel(scene) {
    const self = ownRoomSeat(scene);
    if (!self) { state('等待当前账号入席'); return; }
    if (!prepareRebel()) return;
    if (self?.ready || self?.IsReady || self?.Ready) { round.ready = true; state('已准备，等待房主开始'); return; }
    if (round.ready) { state('已请求准备，等待房主开始'); return; }
    const ready = read(() => scene.startUI.readyBtn);
    if (usable(ready) && press(ready)) { round.ready = true; note('已点击准备'); state('已请求准备，等待房主开始'); }
    else state('等待准备按钮');
  }
  function guardTrustee(self, mulligan = false) {
    const seat = read(() => self.seat) || read(() => self.Seat) || read(() => self.cardContainer.seat);
    const on = read(() => seat.IsAiControl);
    const guarded = (mulligan || !training) && now() < (round.guardUntil || 0);
    if (guarded || (solo || training || run.nation) && !assistant.isTrustee()) {
      if (on === true && round.offTries < 3 && now() - round.trusteeAt >= 1200 && typeof read(() => self.onTrusteeshipClick) === 'function') {
        round.offTries++; round.trusteeAt = now(); self.onTrusteeshipClick(); note('手气卡守备：已请求关闭托管');
      }
      return guarded;
    }
    if (solo || training || role !== 'rebel' || on === true || round.trusteeTries >= 5) return false;
    if (typeof read(() => self.onTrusteeshipClick) !== 'function') { state('托管接口未就绪，继续等待'); return false; }
    if (now() - round.trusteeAt >= 3000) { round.trusteeAt = now(); round.trusteeTries++; self.onTrusteeshipClick(); state('已请求开启托管'); }
    return false;
  }
  function gameStep(frame) {
    const guarded = guardTrustee(frame.self);
    if (solo || training) {
      const acted = assistant.run(frame, now(), { allowTrustee: !guarded, identity: solo, preferIronChainRecast: training });
      state(assistant.reason() || (assistant.mode() === 'trustee' ? '小杀助手未推进 · 托管兜底中' : assistant.mode() === 'local' ? '小杀助手未推进 · 本地处理询问' : acted ? '正在执行小杀助手提示' : '等待小杀助手提示')); return;
    }
    if (role === 'rebel') {
      if (cancelPrompt(frame.self)) return;
      if (guarded) state('手气卡守备中 · 暂缓托管'); else if (!read(() => frame.self.seat.IsAiControl)) state('等待托管确认'); else state('托管中，等待结算'); return;
    }
    if (cancelPrompt(frame.self)) return;
    const items = read(() => frame.self.skillItems);
    const skill = (Array.isArray(items) ? items : []).find(item => usable(item) && read(() => item.Skill.Name) === '苦肉' && item.activated && !item.Selected);
    if (!skill || read(() => frame.self.spellSelector.visible)) { state('等待苦肉可发动或当前询问结束'); return; }
    if (options.wait && !round.delayDone) {
      let remaining = ctx.game.getCountdown?.();
      if (remaining == null) {
        const timer = frame.nodes.find(n => usable(n) && Number.isFinite(read(() => n.RemainValue)));
        remaining = read(() => timer.RemainValue);
      }
      if (Number.isFinite(remaining) && remaining > 0) {
        if (round.waitAt == null) round.waitAt = now();
        if (now() - round.waitAt >= 45000) round.delayDone = true;
        else if (remaining > 3) { state(`烧条中 · 剩余${Math.ceil(remaining)}秒`); return; }
      } else if (!round.waitWarned) { round.waitWarned = true; note('未读取到出牌倒计时，本局直接苦肉'); }
    }
    if (round.skillCount >= 40) { fail('本局苦肉已达到40次上限，请检查游戏状态'); return; }
    if (now() - round.skillAt < 600) return;
    if (native.clickSkill(skill)) { round.skillAt = now(); round.skillCount++; state(`已发动苦肉 · 第${round.skillCount}次`); }
  }
  function trainingSkin() {
    const win = native.matching(/^SelectSkinWindow$/)[0];
    if (!win) { round.skinJob = null; return false; }
    const view = read(() => win.selectView);
    if (!view || win.loading || win.isShowWait || win.closeing || win.isClosing) { state('等待皮肤窗口就绪'); return true; }
    const token = read(() => view.itemList);
    if (round.skinJob?.win !== win || round.skinJob?.view !== view || round.skinJob?.token !== token || round.skinJob?.general !== win.generalID) {
      round.skinJob = { win, view, token, general: win.generalID, at: -Infinity, tries: 0 };
    }
    const job = round.skinJob;
    if (now() - job.at < 1200) return true;
    if (job.tries >= 3) { fail('单骑皮肤窗口连续处理3次仍未关闭，请检查窗口后重新启动'); return true; }
    job.at = now(); job.tries++;
    // Native SelectSkinWindow.Close also finishes pending general selection;
    // merely hiding/removing the window would leave the game waiting.
    const current = read(() => view.usingSkinID);
    if (typeof win.Close === 'function' && Number.isInteger(current) && current >= 0 && job.tries === 1) {
      win.Close(); state('单骑人机：已请求保留当前皮肤并关闭选择'); return true;
    }
    const first = (Array.isArray(token) ? token : []).find(item => usable(item) && read(() => item.HasSkin) === true);
    if (first && typeof view.itemClick === 'function') {
      view.itemClick({ currentTarget: first }); state('单骑人机：已请求选择第一个可用皮肤'); return true;
    }
    if (typeof win.Close === 'function') { win.Close(); state('单骑人机：已请求跳过皮肤选择'); return true; }
    state('等待皮肤选择原生接口'); return true;
  }
  function trainingWindows() {
    if (trainingSkin()) return true;
    const bidding = native.matching(/^SayRogueLike1V1Window$/)[0];
    if (bidding) {
      const first = read(() => bidding.btnList[1]);
      if (usable(first) && round.firstHandButton !== first) { round.firstHandButton = first; press(first); state('单骑人机：已选择先手'); }
      return true;
    }
    const shop = native.matching(/^RogueLike1v1GameShopWindow$/)[0];
    if (shop) {
      if (round.shopWindow !== shop) { round.shopWindow = shop; round.shopAt = now(); round.shopBought = new Set(); }
      if (now() - round.shopAt < 1000) return true;
      const select = read(() => shop.selectView.ShowItemList);
      const items = Array.isArray(select) && select.length ? [select[select.length - 1]] : read(() => shop.ShopView.ShowItemList) || [];
      for (const item of items.slice(0, 64)) {
        if (round.shopBought.has(item) || typeof item?.Requestbuy !== 'function') continue;
        if (!(select?.length || Number(item.hufuNum) === 0 || TRAINING_SHOP_IDS.has(Number(item.Id)))) continue;
        if (read(() => item.lbPriceUnEnough.visible) === true) continue;
        round.shopBought.add(item); item.Requestbuy(); state('单骑人机：已按原选购规则请求购买'); return true;
      }
      if (now() - round.shopAt >= 3000 && typeof shop.LeftHide === 'function') shop.LeftHide();
      return true;
    }
    round.shopWindow = null;
    return false;
  }
  function stepEntry(frame) {
    const mode = role === 'host' ? 'identity' : options.autoMode;
    if (!run.entry) {
      if (run.room || run.battle || (role !== 'auto' && !run.createRoom) || !isLobbyEntry(frame, mode)) return false;
      const token = seq;
      run.entry = createLobbyEntry(ctx, native, mode, () => alive(token) && !policy.update().due && !policy.snapshot().waiting);
      run.entryAt = now();
      state(mode === 'training' ? '正在进入单骑人机训练' : '正在创建房间');
    }
    if (now() - run.entryAt >= ENTRY_TIMEOUT_MS) throw new Error('等待游戏确认进入目标房间或训练模式超时');
    const entry = run.entry, token = seq;
    const result = entry.step(frame);
    if (!result?.ready || !alive(token) || run.entry !== entry) return true;
    const password = entry.password;
    entry.cancel(); run.entry = null;
    if (mode === 'training') return false;
    run.room = { scene: frame.scene, number: String(result.roomNumber ?? roomNumberOf(frame.scene)) };
    if (role === 'host') {
      if (!run.room.number || !password) throw new Error('无法确认新建房间的房号与密码');
      run.paired = { password, candidate: null, confirmed: null };
      roomPassword = password;
      checkPair(frame.scene);
    } else if (solo) {
      run.rebelSeat = { deadline: now() + SEAT_TIMEOUT_MS, retryAt: -Infinity };
    }
    return true;
  }
  function stopDecision(returnedToRoom) {
    const before = policy.snapshot();
    const settled = (round.overAt != null || returnedToRoom) && !round.stopChecked;
    if (settled) round.stopChecked = true;
    const decision = role === 'auto' ? policy.update({ settled }) : before;
    if (decision.stopStatus !== before.stopStatus || decision.due !== before.due || decision.waiting !== before.waiting) notify();
    return decision;
  }
  function finishByPolicy(decision) {
    stopClean(`${decision.stopStatus} · 已停止`);
  }
  function markRoundOver() {
    if (round.phase !== 'game' || round.overAt != null) return;
    round.overAt = now(); rounds++; note(`本次第${rounds}局结束`); state('对局结束，等待结算');
  }
  function settleTraining(frame, decision, result) {
    const lobby = !frame.game && frame.name === 'RogueLike1v1Scene';
    if (round.againAt != null) {
      // The native Again handler exits to the training lobby and schedules
      // its own entry request. Wait for the next battle without clicking there.
      if (lobby) round.againReturned = true;
      if (now() - round.againAt >= RESULT_TIMEOUT_MS) {
        stopClean('等待单骑人机下一局超时 · 已停止');
      }
      return;
    }
    if (decision.due) {
      if (typeof result?.onClickClose === 'function' && !result.loading && !result.isClosing && !result.closeing) {
        result.onClickClose(); finishByPolicy(decision); return;
      }
      if (frame.scene && !frame.game && !result) { finishByPolicy(decision); return; }
    } else if (decision.waiting) {
      state('对局已结束 · 等待酒馆状态同步'); return;
    } else if (result) {
      if (!result.loading && !result.isClosing && !result.closeing && (!result.againBtn || usable(result.againBtn))
        && typeof result.onClickAgain === 'function') {
        round.againAt = now(); result.onClickAgain(); state('单骑人机：已请求下一把'); return;
      }
    } else if (lobby) {
      // The result may already have been dismissed by the effects plugin.
      // The confirmed training lobby provides the regular robot entry point.
      run.battle = null;
      stepEntry(frame); return;
    } else if (frame.scene && !frame.game) {
      stopClean('已离开单骑人机训练 · 已停止'); return;
    }
    if (now() - round.overAt >= RESULT_TIMEOUT_MS) {
      stopClean(decision.due ? `${decision.stopStatus} · 已停止，结算窗口待确认` : '等待单骑人机结算超时 · 已停止');
      return;
    }
    // The native client can fall back to the standard result window when
    // single-rider result data is delayed. Use its regular Continue action.
    if (!result && frame.game && now() - round.overAt >= 1200 && now() - round.overClick >= 1500) {
      round.overClick = now(); native.continueResult({ allowCanvas: false });
    }
  }
  function settle(frame, decision) {
    if (!frame.game) return;
    state(decision.due ? `${decision.stopStatus} · 正在处理结算` : '对局结束，正在返回房间');
    if (now() - round.overAt >= 1200 && now() - round.overClick >= 1500 && round.overTries < 20) {
      round.overClick = now(); round.overTries++;
      const processed = run.nation ? run.nation.settlement() : native.continueResult({ allowCanvas: !decision.due });
      const resultExit = processed && decision.due ? read(() => ctx.game.getScene()) : null;
      if (resultExit && resultExit !== frame.scene) { finishByPolicy(decision); return; }
    }
    if (decision.due && now() - round.overAt >= RESULT_TIMEOUT_MS) stopClean(`${decision.stopStatus} · 已停止，结算窗口待确认`);
  }
  function chooseStartupBan(scene) {
    if (run.banChecked || options.pick !== 'off' || (role !== 'rebel' && !solo)) return;
    run.banChecked = true;
    const mode = roomMode(ctx);
    if (isIdentityPractice(mode)) startBan = { scene, mode, until: now() + 8000 };
  }
  function tick() {
    if (stopped || ctx.scope.signal.aborted) return;
    try {
      sync();
      if (role === 'off') {
        updateRoomRetry();
        if (listeners.size) updateLobby(read(() => ctx.game.getScene()));
        return;
      }
      if (!who.id) { fail('当前账号尚未登录'); return; }
      if (!connected()) { stopClean('游戏连接已断开 · 已停止'); return; }
      if (read(() => ctx.game.getSnapshot().isReplay) === true) { fail('回放场景不能运行盖主速刷'); return; }
      const frame = native.frame();
      updateLobby(frame.scene);
      const trainingGame = isTrainingGame(ctx, frame);
      const trainingResult = training ? native.matching(/^RogueLike1v1ZhanJiWindow$/).find(win => !win.isShare) : null;
      if (training && trainingGame && round.againAt != null && !trainingResult
        && (run.battle !== frame.scene || round.againReturned || native.selectWindow())) {
        run.battle = frame.scene;
        resetPhase('game');
      }
      if (trainingResult && (!frame.game || frame.scene === run.battle)) markRoundOver();
      const table = !frame.game && (frame.name === 'TableScene' || Boolean(read(() => frame.scene.seatListView)));
      const returnedToRoom = Boolean(table && run.battle && (!run.room || sameRoom(run.room, frame.scene)));
      const decision = stopDecision(returnedToRoom);
      if (training && round.overAt != null && !run.entry && (!frame.game || frame.scene === run.battle)) {
        settleTraining(frame, decision, trainingResult); return;
      }
      if (!frame.scene) {
        if (decision.due && !run.battle) finishByPolicy(decision);
        return;
      }
      if (decision.due && (!run.admitted || (!frame.game && (!run.battle || round.overAt == null)))) { finishByPolicy(decision); return; }
      if (!run.admitted) {
        if (decision.waiting) { state('启动前查询酒馆任务 · 待同步'); return; }
        run.admitted = true;
      }
      const trainingScene = frame.name === 'RogueLike1v1Scene' || frame.name === 'RogueLike1v1GameScene';
      if (role === 'rebel' && (trainingGame || trainingScene)) {
        stopClean('当前处于单骑，请切换到「自动挂机」的单骑方式'); return;
      }
      if (role === 'rebel' && table && roomOwner(frame.scene)) {
        stopClean('当前账号是房主，请切换到「自动挂机」的身份方式'); return;
      }
      if (training && frame.game && !trainingGame) { fail('已离开单骑人机训练模式，已停止'); return; }
      if (!training && (trainingGame || trainingScene) && !run.entry) { stopClean('当前处于单骑，请选择对应的自动挂机方式'); return; }
      if (run.entry && trainingGame && (decision.due || decision.waiting)) {
        // The native training request can enter the game while the tavern is
        // rechecking. It is already in flight and must finish the active game.
        run.entry.cancel(); run.entry = null;
      }
      if (decision.due && run.entry) { finishByPolicy(decision); return; }
      if (run.entry || (!run.room && !run.battle && (role === 'auto' || run.createRoom) && isLobbyEntry(frame, role === 'host' ? 'identity' : options.autoMode))) {
        if (decision.waiting) { state('等待酒馆任务同步后进入所选模式'); return; }
        if (stepEntry(frame)) return;
      }
      if (run.createRoom && !run.paired) { stopClean('请从大厅创建盖主房'); return; }
      if (run.paired && !run.paired.confirmed && !table) { stopClean('确认前已离开新建房间 · 已停止'); return; }
      if (settingsJob && (frame.game || frame.scene !== settingsJob.scene)) { fail('等待房间设置期间已离开原等待房间，已停止'); return; }
      if (training && !frame.game) {
        stopClean('已离开单骑人机训练 · 已停止'); return;
      }
      if (!frame.game && !table) {
        if (decision.due && round.overAt != null) finishByPolicy(decision);
        else stopClean(run.room || run.battle ? '已离开当前房间 · 已停止' : '请在对应的游戏房间启动');
        return;
      }
      if (table) {
        if (run.room && !sameRoom(run.room, frame.scene)) { stopClean('已离开原房间 · 已停止'); return; }
        const correctRoom = run.nation ? isNationRoom(ctx) : isIdentityPractice(roomMode(ctx));
        if (!correctRoom && (role !== 'host' || run.paired)) { stopClean(run.nation ? '请选择国战房间后启动' : '请选择身份演武房间后启动'); return; }
        run.room ??= { scene: frame.scene, number: roomNumberOf(frame.scene) };
        run.battle = null;
        if (decision.due) { finishByPolicy(decision); return; }
        if (decision.waiting) { state('酒馆状态待同步 · 暂停开下一局'); return; }
        if (run.rebelSeat && !seatNewIdentityHost(frame.scene)) return;
        if (run.paired && !checkPair(frame.scene)) return;
        if (round.phase !== 'room') resetPhase('room');
        chooseStartupBan(frame.scene);
        if (run.nation) { state(run.nation.room(frame, now()) || '等待国战房间就绪'); return; }
      } else {
        if (run.rebelSeat) { stopClean('反贼座位确认前已进入对局 · 已停止'); return; }
        if (run.nation && !isNationGame(ctx, frame)) { stopClean('已离开国战对局 · 已停止'); return; }
        if ((solo || role === 'rebel' || run.paired) && !isIdentityPractice(roomMode(ctx))) { stopClean('已离开身份演武对局 · 已停止'); return; }
        if (run.battle && run.battle !== frame.scene) {
          stopClean('已离开当前对局 · 已停止'); return;
        }
        if (!run.battle || round.phase !== 'game') resetPhase('game');
        run.battle = frame.scene;
        if (trainingResult) {
          markRoundOver(); settleTraining(frame, stopDecision(false), trainingResult); return;
        }
        if (round.overAt != null) { settle(frame, decision); return; }
        if (run.nation) {
          if (refuseMulligan()) { guardTrustee(frame.self); return; }
          const guarded = guardTrustee(frame.self);
          state(run.nation.game(frame, now(), assistant, { allowTrustee: !guarded }) || '等待国战出牌');
          return;
        }
      }
      if (!frame.game && role === 'host' && !checkHostSettings(frame.scene)) return;
      loadConfigs();
      tryStartBan(frame.scene);
      if (pendingAch && now() - pendingAch.at >= 8000) {
        pendingAch = null; round.achFailures = (round.achFailures || 0) + 1;
        if ((role === 'rebel' || solo) && options.pick !== 'off' && round.achFailures >= 5) { fail('百胜战功查询连续5次超时'); return; }
        note('百胜战功请求超时，等待重试');
      }
      if (round.phase !== 'game' && round.phase !== 'room') { state('等待进入已配置的房间'); return; }
      // A cached selection/mulligan window must not starve the active dying
      // response shown on the self-seat button bar.
      if (frame.game && role === 'host' && dyingPrompt(frame.self)) {
        if (!cancelBar(frame.self)) state('濒死求桃：等待可用取消按钮');
        return;
      }
      if (refuseMulligan()) { if (frame.game) guardTrustee(frame.self, true); return; }
      if (training && trainingSkin()) return;
      if (selectGeneral()) return;
      if (training && trainingWindows()) return;
      if (frame.game) { gameStep(frame); return; }
      if (round.phase === 'room') {
        if (role === 'host') roomHost(frame.scene);
        else if (solo) roomSingle(frame.scene);
        else if (role === 'rebel') roomRebel(frame.scene);
      }
    } catch (e) { fail(e); }
  }
  function setOptions(value = {}) {
    if (stopped || ctx.scope.signal.aborted) return;
    sync();
    try {
      if (Object.hasOwn(value, 'stopHours') && !durationOf(value.stopHours)) throw new Error('请输入有效的正数小时');
      const next = cleanOptions({ ...options, ...value });
      if (Object.keys(next).some(key => next[key] !== options[key])) {
        if (role !== 'off' && ['pick', 'autoMode', 'stopMode', 'stopHours'].some(key => next[key] !== options[key])) throw new Error('请先停止再更换运行设置');
        if (who.id) ctx.settings.set(`account:${who.id}:options-v1`, next);
        options = next;
      }
      if ('role' in value) {
        if (!['off', 'host', 'rebel', 'auto'].includes(value.role)) throw new Error('无效的运行角色');
        if (value.role !== role) {
          updateRoomRetry();
          const retry = roomRetry?.role === value.role && roomRetry.autoMode === options.autoMode ? roomRetry : null;
          if ((value.force && !retry) || retry?.seconds) return;
          roomRetry = null;
          cancelRun(); role = value.role; error = ''; rounds = 0; log = []; status = role === 'off' ? '已停止' : '正在启动';
          solo = role === 'auto' && options.autoMode === 'identity';
          training = role === 'auto' && options.autoMode === 'training';
          if (role !== 'off') clearStoppedError();
          if (role !== 'off' && !who.id) { fail('登录当前账号后才能开始'); return; }
          if (role !== 'off') {
            const proxy = read(() => ctx.game.getServerProxy());
            run = { createRoom: role === 'host' && value.create === true, proxy, connectionId: read(() => proxy.ConnId) };
            if (retry) {
              roomCheck = 'force';
              run.room = { scene: retry.scene, number: roomNumberOf(retry.scene) };
              run.paired = retry.paired;
              roomPassword = retry.paired?.password || '';
            }
            if (role === 'auto') {
              policy.start({ mode: options.stopMode, hours: options.stopHours, account: who.id });
              if (options.autoMode === 'nation') run.nation = createNationRun(ctx, native);
            }
          }
          const module = { host: '盖主（小号）', rebel: '反贼（大号）', auto: '自动挂机' }[role];
          note(role === 'off' ? '已停止速刷' : `开始运行：${module}`); ctx.reportError?.('');
        }
      }
      notify(); tick();
    } catch (e) { fail(e); }
  }
  const projectGuardEvent = packet => ({ ...projectBattleGuard(packet), run: seq });
  const projectAchievementReply = packet => {
    const data = projectAchievements(packet);
    return data && { ...data, run: seq, requestAt: pendingAch?.at };
  };
  const projectDisconnect = () => ({ run: seq });
  observeNative(ctx, { ClientDbsGetuserachinfoRep: projectAchievementReply,
    MsgGameOver: () => ({ run: seq, phase: round.serial }), GsCTriggerSpellNew: projectGuardEvent, GsCGamephaseNtf: projectGuardEvent,
    MsgGameTurnNtf: projectGuardEvent, PubGsCMoveCard: projectGuardEvent, PubGsCUseSpell: projectGuardEvent,
    close: projectDisconnect, error: projectDisconnect }, (type, data, sender) => {
    if (type === 'close' || type === 'error') {
      if (role !== 'off' && data.run === seq && sender.id === who.id) stopClean('游戏连接已断开 · 已停止');
      return;
    }
    if (role === 'off' || sender.id !== who.id || !alive(data.run)) return;
    if (type === 'ClientDbsGetuserachinfoRep') {
      if (!pendingAch || pendingAch.seq !== seq || pendingAch.at !== data.requestAt || data.nickname !== who.nickname || pendingAch.nickname !== who.nickname) return;
      progress = data; pendingAch = null; round.achFailures = 0; note('已收到当前账号百胜快照');
      notify();
    } else if (type !== 'MsgGameOver') assistant.observe(type, data);
    else if (round.serial === data.phase) markRoundOver();
  }, () => { if (role !== 'off') fail('原生消息连接发生变化或消息有缺口，已停止，请重新核对当前房间后启动'); });
  sync(); ctx.scope.interval(tick, 250);
  ctx.scope.add(() => { stopped = true; role = 'off'; cancelRun(); listeners.clear(); });
  return {
    snapshot() {
      sync();
      const stop = policy.snapshot(), paired = run?.paired;
      return { account: who.id, nickname: who.nickname, role, ...options, status, error,
        roomNumber: run?.room?.number || '', roomPassword, inLobby, awaitingConfirmation: Boolean(paired && !paired.confirmed),
        canConfirm: Boolean(paired?.candidate && !paired.confirmed), companionName: paired?.candidate?.name || '',
        phase: run?.entry ? 'lobby' : paired && !paired.confirmed ? 'confirm' : round.overAt != null ? 'settling' : round.phase,
        stopStatus: stop.stopStatus, deadline: stop.deadline, stopAfterRound: Boolean(stop.due && run?.battle),
        retryRole: roomRetry?.role, retrySeconds: roomRetry?.seconds, solo, training, generalName: general?.name || '', rounds, log: [...log] };
    },
    setOptions, confirm,
    subscribe(fn) { updateLobby(read(() => ctx.game.getScene())); listeners.add(fn); return () => listeners.delete(fn); },
    tick,
  };
}
