import { account, manager, observeNative, read, generalNames, field } from '../../shared/info-runtime.js';
import { cleanOptions, definitions, projectAchievements, evaluate, chooseGeneral, bannedGeneral } from './model.js';
import { projectBattleGuard } from './battle-guards.js';
import { createAssistant, TRAINING_SHOP_IDS } from './assistant.js';
import { inspectHostRoom } from './room-settings.js';
import { createNative, usable, press, label, selfButtonBar } from './native.js';

// Port of the extension 2.6.8 state machines. A single, cancellable heartbeat
// owns all business actions; opening/collapsing the panel never starts a run.
export function createGaiZhu(ctx) {
  const native = createNative(ctx), listeners = new Set();
  let who = { id: '', nickname: '' }, role = 'off', options = cleanOptions(), error = '', status = '已停止';
  let settingsJob = null;
  let roomCheck = null, roomPassword = '', settingsRelease = null;
  let seq = 0, round = {}, rounds = 0, log = [], general = null;
  let defs = [], names = {}, progress = null, pendingAch = null, configLoading = false, lastQuery = -Infinity;
  let solo = false, training = false, assistant = createAssistant({ cancelWuxie: () => options.cancelWuxie, getCardMeta: id => read(() => ctx.game.getCardMeta(id)), getSkill: id => read(() => ctx.game.getClass('Skill').GetInstance(id)), canOperate: () => read(() => ctx.game.getClass('GameContext').CanOperationInGame()) });
  let djRelease = null, stopped = false, configSeq = 0, synced = false;
  const now = () => typeof ctx.now === 'function' ? ctx.now() : Date.now();
  const alive = token => !stopped && !ctx.scope.signal.aborted && role !== 'off' && token === seq && account(ctx).id === who.id;
  function notify() { if (stopped || ctx.scope.signal.aborted) return; for (const fn of [...listeners]) fn(); }
  function note(text) { log = [...log.slice(-39), text]; }
  function state(text) { if (status === text) return; status = text; notify(); }
  function cancelRun() { settingsJob = null; settingsRelease?.(); settingsRelease = null; roomCheck = null; roomPassword = ''; solo = false; training = false; assistant = createAssistant({ cancelWuxie: () => options.cancelWuxie, getCardMeta: id => read(() => ctx.game.getCardMeta(id)), getSkill: id => read(() => ctx.game.getClass('Skill').GetInstance(id)), canOperate: () => read(() => ctx.game.getClass('GameContext').CanOperationInGame()) }); seq++; djRelease?.(); djRelease = null; pendingAch = null; round = {}; general = null; configLoading = false; configSeq++; }
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
    error = String(value?.stack || value); role = 'off'; cancelRun(); status = '已停止 · 查看错误详情'; note(error);
    rememberStoppedError();
    ctx.reportError?.(error); notify();
  }
  function sync() {
    const next = account(ctx);
    if (synced && next.id === who.id && next.nickname === who.nickname) return;
    const saved = sessionState()?.gaizhuStoppedError;
    if ((synced && next.id !== who.id) || (saved && saved.accountId !== next.id)) clearStoppedError();
    const restore = (!synced || next.id === who.id) && next.id && saved?.accountId === next.id && typeof saved.error === 'string' && saved.error;
    synced = true;
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
  function resetPhase(phase) {
    if (phase === 'game') assistant = createAssistant({ cancelWuxie: () => options.cancelWuxie, getCardMeta: id => read(() => ctx.game.getCardMeta(id)), getSkill: id => read(() => ctx.game.getClass('Skill').GetInstance(id)), canOperate: () => read(() => ctx.game.getClass('GameContext').CanOperationInGame()) });
    const played = general;
    djRelease?.(); djRelease = null;
    round = { phase, entered: now(), dj: null, djDone: false, djContextAt: null,
      aiTries: 0, aiAt: -Infinity, aiConfirm: false, startTries: 0, startAt: -Infinity,
      ready: false, skillAt: -Infinity, skillCount: 0, cancelCount: 0, selectWindow: null, selectAt: 0, selected: false,
      guardUntil: phase === 'game' ? now() + 20000 : 0, trusteeAt: -Infinity, trusteeTries: 0, offTries: 0,
      overAt: 0, overTries: 0, overClick: -Infinity, waitAt: null, delayDone: false, waitWarned: false,
      achNeeded: role === 'rebel', achRequested: false, achFailures: 0, played };
    if (phase === 'room' && role === 'rebel') progress = null;
    note(phase === 'room' ? '已进入房间，开始下一轮' : '进入对局，守备期间拒绝手气卡');
  }
  function ownRoomSeat(scene) {
    const seats = read(() => scene.seatListView.seatList);
    return Array.isArray(seats) ? seats.slice(0, 16).map(ui => ui?.waitInfo || ui?.WaitInfo).find(info => info && String(info.clientId ?? info.ClientId) === who.id) : null;
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
    if (training && round.overAt) resetPhase('game');
    if (round.selectWindow !== win) { round.selectWindow = win; round.selectAt = now(); round.selected = false; }
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
      card = pool.find(c => c.ui.winRateBg?.visible === true && c.ui.winRateTf?.visible === true)
        || pool.reduce((best, c) => Number(c.ui.generalInfo?.quality ?? c.ui.GeneralInfo?.Quality ?? 0) > Number(best?.ui.generalInfo?.quality ?? best?.ui.GeneralInfo?.Quality ?? -1) ? c : best, null);
    } else if (options.pick !== 'off') {
      card = cards.find(c => c.id === general?.id);
      if (!card && elapsed >= 5000) card = cards.find(c => !bannedGeneral(c.id, c.name || names[c.id]));
      if (!card && elapsed >= 20000) { state('选将列表无可用目标，等待游戏处理'); return true; }
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
      } else if (job && !job.retryAt && now() >= job.deadline) fail('房间设置修改等待服务器确认超时，已停止');
      return false;
    }
    const result = inspectHostRoom(ctx, scene);
    if (result.error) { fail(result.error); return false; }
    if (!result.submit) { roomPassword = result.password; roomCheck = 'done'; note('房间设置检查通过（本次启动仅检查一次）'); notify(); return true; }
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
      result.submit();
    } };
    settingsJob = job;
    const rejected = () => {
      if (!alive(token) || roomCheck !== 'pending' || job.retryAt) return;
      if (job.attempts >= 3) { fail('房间设置修改连续3次被拒绝，已停止'); return; }
      job.retryAt = now() + 5000;
      note('房间设置被拒绝，等待5秒后重试'); state('房间设置被拒绝 · 等待5秒后重试');
    };
    rc.on('MODIFY_TABLE_EVENT', caller, complete); rc.on('REFRESH_RULE_UI', caller, rejected);
    settingsRelease = ctx.scope.add(() => { settingsJob = null; rc.off('MODIFY_TABLE_EVENT', caller, complete); rc.off('REFRESH_RULE_UI', caller, rejected); });
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
    const seats = read(() => scene.seatListView.seatList);
    const empty = Array.isArray(seats) ? seats.slice(0, 16).some(s => !(s?.waitInfo || s?.WaitInfo)) : false;
    if (!empty) round.aiConfirm = false;
    if (empty && native.confirmAi()) {
      round.aiConfirm = false; round.aiAt = now();
      note('已选择普通小杀，等待座位更新'); state('等待普通小杀入座'); return;
    }
    // The previous click opens a native confirmation, not an immediate seat
    // update. Its callback must remain reachable while the add button is
    // covered/disabled by the prompt (extension gzHostFillAi order).
    if (round.aiConfirm) {
      if (now() - round.aiAt < 1200) return;
      round.aiAt = now(); round.aiConfirm = false;
      if (native.confirmAi()) { note('已选择普通小杀，等待座位更新'); state('等待普通小杀入座'); }
      else state('未找到普通小杀选项，等待重试添加');
      return;
    }
    if (empty && usable(scene.addAiBtn) && round.aiTries < 12) {
      if (now() - round.aiAt < 1200) return;
      round.aiAt = now();
      if (native.openAi()) { round.aiConfirm = true; round.aiTries++; }
      state('正在补齐普通小杀'); return;
    }
    if (empty) { state('等待添加普通小杀，暂不开始'); return; }
    const start = read(() => scene.startUI.startBtn); if (!usable(start)) { state('等待其他玩家准备'); return; }
    if (now() - round.startAt < 2000) return;
    if (round.startTries >= 10) { fail('连续10次开始仍未进入对局，请检查反贼是否准备'); return; }
    round.startTries++; round.startAt = now(); press(start); state(`已请求开始 · 第${round.startTries}次`);
  }
  function roomRebel(scene) {
    const self = ownRoomSeat(scene);
    solo = self?.isMaster === true;
    if (solo && !checkHostSettings(scene)) return;
    if (round.dj) { stepDj(); return; }
    if (options.pick !== 'off' && !round.djDone) {
      if (!progress) { queryAchievements(); return; }
      const source = rows();
      if (!source.length) { fail('未找到可核对的百胜战功定义'); return; }
      if (!source.some(r => r.owned === true)) { state('等待当前账号武将归属数据'); return; }
      const currentId = options.pick === 'random' ? native.slot(native.dj()?.mgr, 2) : general?.id;
      if (options.pick === 'random' && !Number.isFinite(currentId)) {
        if (round.slotWaitAt == null) round.slotWaitAt = now();
        if (now() - round.slotWaitAt < 3000) { state('等待读取反贼点将槽，暂不覆盖已有选择'); return; }
        note('反贼点将槽等待3秒仍不可读，使用当前未完成候选');
      }
      const chosen = chooseGeneral(source, { pick: options.pick, currentId });
      if (!chosen) { fail('没有已拥有且百胜未完成的可点武将（已排除黄盖）'); return; }
      general = chosen; beginDj(chosen.id, 2); return;
    }
    if (options.pick === 'off' && !progress) queryAchievements();
    if (solo) { roomHost(scene, true); return; }
    if (self?.ready || self?.isMaster) { round.ready = true; state('已准备，等待房主开始'); return; }
    if (round.ready) { state('已请求准备，等待房主开始'); return; }
    const ready = read(() => scene.startUI.readyBtn);
    if (usable(ready) && press(ready)) { round.ready = true; note('已点击准备'); state('已请求准备，等待房主开始'); }
    else state('等待准备按钮');
  }
  function guardTrustee(self) {
    const seat = read(() => self.seat) || read(() => self.Seat) || read(() => self.cardContainer.seat);
    const on = read(() => seat.IsAiControl);
    const guarded = now() < (round.guardUntil || 0);
    if (guarded || (solo || training) && !assistant.isTrustee()) {
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
    if (round.overAt) {
      if (training && trainingWindows(frame)) return;
      state('对局结束，正在返回房间');
      if (now() - round.overAt >= 1200 && now() - round.overClick >= 1500 && round.overTries < 20) {
        round.overClick = now(); round.overTries++; native.continueResult();
      }
      return;
    }
    const guarded = guardTrustee(frame.self);
    if (role === 'rebel' && (solo || training)) {
      const acted = assistant.run(frame, now(), { allowTrustee: !guarded });
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
  function trainingWindows(frame) {
    if (trainingSkin()) return true;
    const bidding = native.matching(/^SayRogueLike1V1Window$/)[0];
    if (bidding) {
      const first = read(() => bidding.btnList[1]);
      if (usable(first) && round.firstHandButton !== first) { round.firstHandButton = first; press(first); state('单骑人机：已选择先手'); }
      return true;
    }
    const result = native.matching(/^RogueLike1v1ZhanJiWindow$/).find(win => !win.isShare);
    if (result && round.overAt && typeof result.onClickAgain === 'function') {
      if (round.againWindow !== result) { round.againWindow = result; result.onClickAgain(); state('单骑人机：已请求下一把'); }
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
  function isTraining(frame) {
    const context = read(() => ctx.game.getClass('GameContext'));
    const proto = read(() => ctx.game.getClass('CreateTableWindow').prototype);
    const getter = read(() => Object.getOwnPropertyDescriptor(proto, 'curModeVo').get);
    const mode = read(() => context.GetModeVO()) || read(() => getter.call({}));
    const group = read(() => context.GetGroupID()) ?? read(() => mode.Section);
    return Number(mode?.ModeID) === 160 && Number(group) === 3;
  }
  function tick() {
    if (stopped || ctx.scope.signal.aborted) return;
    try {
      sync(); if (role === 'off') return;
      if (!who.id) { fail('当前账号尚未登录'); return; }
      if (read(() => ctx.game.getSnapshot().isReplay) === true) { fail('回放场景不能运行盖主速刷'); return; }
      const frame = native.frame();
      const detectedTraining = isTraining(frame);
      if (role === 'rebel') {
        if (training && frame.game && !detectedTraining) { fail('已离开单骑人机训练模式，已停止'); return; }
        training = detectedTraining || training && !frame.game && Boolean(round.overAt);
      }
      if (role === 'rebel' && training && !frame.game) {
        if (trainingWindows(frame)) return;
        const robot = (read(() => frame.scene.btnList) || []).find(b => b.name === 'zgs_robot_tex');
        if (frame.name === 'RogueLike1v1Scene' && round.phase === 'game') resetPhase('room');
        if (frame.name === 'RogueLike1v1Scene' && usable(robot) && now() - (round.robotAt || 0) >= 3000) { round.robotAt = now(); press(robot); state('已请求单骑人机训练'); }
        return;
      }
      if (settingsJob && (frame.game || frame.scene !== settingsJob.scene)) { fail('等待房间设置期间已离开原等待房间，已停止'); return; }
      if (frame.game && round.phase !== 'game') resetPhase('game');
      else if (!frame.game && (frame.name === 'TableScene' || read(() => frame.scene.seatListView)) && round.phase !== 'room') resetPhase('room');
      if (!frame.game && !read(() => frame.scene.seatListView)) { state('等待进入房间'); return; }
      if (!frame.game && role === 'host' && !checkHostSettings(frame.scene)) return;
      loadConfigs();
      if (pendingAch && now() - pendingAch.at >= 8000) {
        pendingAch = null; round.achFailures = (round.achFailures || 0) + 1;
        if (role === 'rebel' && options.pick !== 'off' && round.achFailures >= 5) { fail('百胜战功查询连续5次超时'); return; }
        note('百胜战功请求超时，等待重试');
      }
      if (round.phase !== 'game' && round.phase !== 'room') { state('等待进入已配置的房间'); return; }
      // A cached selection/mulligan window must not starve the active dying
      // response shown on the self-seat button bar.
      if (frame.game && role === 'host' && dyingPrompt(frame.self)) {
        if (!cancelBar(frame.self)) state('濒死求桃：等待可用取消按钮');
        return;
      }
      if (refuseMulligan()) { if (frame.game) guardTrustee(frame.self); return; }
      if (training && trainingSkin()) return;
      if (selectGeneral()) return;
      if (training && trainingWindows(frame)) return;
      if (frame.game) { gameStep(frame); return; }
      if (round.phase === 'room') { if (role === 'host') roomHost(frame.scene); else roomRebel(frame.scene); }
    } catch (e) { fail(e); }
  }
  function setOptions(value = {}) {
    if (stopped || ctx.scope.signal.aborted) return;
    sync();
    try {
      const next = cleanOptions({ ...options, ...value });
      if (next.pick !== options.pick || next.wait !== options.wait || next.cancelWuxie !== options.cancelWuxie) {
        if (role !== 'off' && next.pick !== options.pick) throw new Error('请先停止再更换点将模式');
        if (who.id) ctx.settings.set(`account:${who.id}:options-v1`, next);
        options = next;
      }
      if ('role' in value) {
        if (!['off', 'host', 'rebel'].includes(value.role)) throw new Error('无效的运行角色');
        if (value.role !== role) {
          cancelRun(); role = value.role; error = ''; rounds = 0; log = []; status = role === 'off' ? '已停止' : '正在启动';
          if (role !== 'off') clearStoppedError();
          if (role !== 'off' && !who.id) { fail('登录当前账号后才能开始'); return; }
          note(role === 'off' ? '已停止速刷' : `开始运行：${role === 'host' ? '盖主（小号）' : '反贼（大号）'}`); ctx.reportError?.('');
        }
      }
      notify(); tick();
    } catch (e) { fail(e); }
  }
  const projectGuardEvent = packet => ({ ...projectBattleGuard(packet), run: seq });
  observeNative(ctx, { ClientDbsGetuserachinfoRep: projectAchievements, MsgGameOver: () => true, GsCTriggerSpellNew: projectGuardEvent, GsCGamephaseNtf: projectGuardEvent, MsgGameTurnNtf: projectGuardEvent, PubGsCMoveCard: projectGuardEvent, PubGsCUseSpell: projectGuardEvent }, (type, data, sender) => {
    if (role === 'off' || sender.id !== who.id || !alive(seq)) return;
    if (type === 'ClientDbsGetuserachinfoRep') {
      if (!pendingAch || pendingAch.seq !== seq || data.nickname !== who.nickname || pendingAch.nickname !== who.nickname) return;
      progress = data; pendingAch = null; round.achFailures = 0; note('已收到当前账号百胜快照'); notify();
    } else if (type !== 'MsgGameOver') { if (data.run === seq) assistant.observe(type, data);
    } else if (round.phase === 'game' && !round.overAt) { round.overAt = now(); rounds++; note(`本次第${rounds}局结束`); state('对局结束，等待结算'); }
  }, () => { if (role !== 'off') fail('原生消息连接发生变化或消息有缺口，已停止，请重新核对当前房间后启动'); });
  sync(); ctx.scope.interval(tick, 250);
  ctx.scope.add(() => { stopped = true; role = 'off'; cancelRun(); listeners.clear(); });
  return { snapshot() { sync(); return { account: who.id, nickname: who.nickname, role, ...options, status, error, roomPassword, solo, training, generalName: general?.name || '', rounds, log: [...log] }; },
    setOptions, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, tick };
}
