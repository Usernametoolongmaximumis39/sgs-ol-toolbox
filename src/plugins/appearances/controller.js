import { account, read, field, observeNative, generalNames, manager } from '../../shared/info-runtime.js';
import { modeId, ids, capture } from './model.js';
import { nativeModeEvidence, needsModeReview, reviewModeEvidence } from './mode-evidence.js';
import { eligibleMode, nativeRobots, nativeSide, projectSettlement, robotStatus, rankedPosition } from './battle.js';
import { sideOf, knownSides } from './groups.js';
import { projectHistory, mergeHistory } from './history.js';
export const RECORD_LIMIT = 10000;
export const BACKUP_FORMAT = 'sgs-toolbox-appearances-v1';
export function createController(ctx) {
  let who = { id: '' }, records = [], matches = [], startedAt = null, gaps = 0, draft = null, active = null;
  let error = '', names = {}, loading = false, storageBlocked = false, saveFailed = false, reviewing = false, reviewFailed = false, epoch = 0;
  let discardedBaisheng = 0, tableEvidence = null, inTraining = false, restoring = false, pending = null, lastSaved = null;
  let joinedSeat = null, firstSeat = null;
  let captureNotice = '', captureDetail = '', historyRequest = null, historyStatus = '', historyAccount = '', historyLastAt = 0;
  let namesError = '';
  const listeners = new Set(), notify = () => { ctx.reportError?.(error || namesError); for (const fn of [...listeners]) fn(); };
  let namesReady = false, nameAttempts = 0, nextNamesAt = 0;
  const fail = e => { error = String(e?.stack || e); notify(); };
  function validateRows(rows, battle = false) {
    if (!Array.isArray(rows) || rows.length > RECORD_LIMIT) throw new Error('本机记录格式或数量不支持，未覆盖原数据');
    const seen = new Set();
    return rows.map(row => {
      const general = ids(row.general), selected = battle ? undefined : row.selected === null ? null : ids(row.selected);
      if (typeof row.id !== 'string' || !row.id || seen.has(row.id) || !modeId(row.mode) || !general.length || !Number.isFinite(row.time)
        || selected?.some(id => !general.includes(id)) || (battle && ![0, 1, 255, null].includes(row.result))) throw new Error('本机记录格式无效，未覆盖原数据');
      seen.add(row.id); return { ...row, mode: modeId(row.mode), general, ...(battle ? {} : { selected }) };
    });
  }
  function sync() {
    const next = account(ctx); if (next.id === who.id) return;
    captureNotice = captureDetail = '';
    historyRequest = null; historyStatus = ''; historyAccount = ''; historyLastAt = 0;
    who = next; draft = active = pending = lastSaved = null; tableEvidence = null; inTraining = false; epoch++;
    joinedSeat = firstSeat = null;
    error = ''; loading = storageBlocked = saveFailed = reviewing = reviewFailed = restoring = false;
    namesReady = false; nameAttempts = 0; nextNamesAt = 0; namesError = '';
    records = []; matches = []; startedAt = null; gaps = discardedBaisheng = 0;
    const stored = who.id ? ctx.storage.get(`account:${who.id}:records-v1`, null) : null;
    if (stored) try {
      if (stored.schema !== 1) throw new Error('本机记录版本不支持，未覆盖原数据');
      records = validateRows(stored.records); matches = validateRows(stored.matches || [], true);
      startedAt = stored.startedAt; gaps = stored.gaps || 0; discardedBaisheng = stored.discardedBaisheng || 0;
      const cleaned=knownSides(records,matches);
      const changed=JSON.stringify(cleaned)!==JSON.stringify({records,matches});
      records=cleaned.records;matches=cleaned.matches;
      if(changed && !save())pending=cleaned;
    } catch (e) { records = []; matches = []; storageBlocked = true; error = String(e.message); }
    if (!storageBlocked && records.some(needsModeReview)) void repair(who.id, epoch);
    notify();
  }
  function save(nextRecords = records, nextMatches = matches) {
    if (!who.id || ctx.scope.signal.aborted || storageBlocked) return false;
    try { ctx.storage.set(`account:${who.id}:records-v1`, { schema: 1, startedAt: startedAt || Date.now(), gaps, discardedBaisheng, records: nextRecords, matches: nextMatches }); saveFailed = false; return true; }
    catch (e) { saveFailed = true; fail(e); return false; }
  }
  async function repair(expected, generation) {
    reviewing = true; reviewFailed = false; const original = records;
    try {
      const checked = await reviewModeEvidence(original, expected, { crypto: ctx.window.crypto?.subtle ? ctx.window.crypto : globalThis.crypto, signal: ctx.scope.signal });
      if (ctx.scope.signal.aborted || account(ctx).id !== expected || generation !== epoch) return;
      const retained = new Set(checked), removed = new Set(original.filter(r => !retained.has(r)));
      if (removed.size) { records = records.filter(r => !removed.has(r)); discardedBaisheng = Math.max(discardedBaisheng, removed.size); save(); }
    } catch (e) { if (!ctx.scope.signal.aborted && account(ctx).id === expected && generation === epoch) { reviewFailed = true; fail(e); } }
    finally { if (!ctx.scope.signal.aborted && account(ctx).id === expected && generation === epoch) { reviewing = false; notify(); } }
  }
  const mode = () => {
    const evidence = nativeModeEvidence(read(() => ctx.game.getClass('GameContext')));
    const room = manager(ctx, 'RoomControler', 'ClientTrainingRep', v => 'isTrainingGame' in v);
    const training = read(() => room.isTrainingGame) === true;
    return { ...evidence, training, mode: training ? 0 : eligibleMode(evidence.rawMode, evidence.rawGroup) };
  };
  const canObserve = evidence => !evidence.training && (evidence.mode || evidence.rawMode == null && evidence.rawGroup == null);
  const viewer = () => read(() => ctx.game.getClass('GameContext').IsViewerOrReplay()) === true
    || read(() => ctx.game.getSnapshot().isReplay) === true || read(() => ctx.game.getScene().IsViewer) === true;
  const seatId = () => { const v = read(() => ctx.game.getSnapshot().selfSeatId); return Number.isSafeInteger(v) && v >= 0 && v < 8 ? v : null; };
  const validSeat = value => Number.isInteger(value) && value >= 0 && value < 8 ? value : null;
  const observedSeat = data => joinedSeat ?? data.selfSeat;
  const observedSide = (data, selfSeat, gameMode) => {
    // The native first-role packet identifies the starting seat. In a two-seat
    // single-rider game the other participant is second; never add one to SeatID.
    if (gameMode === 44 && firstSeat !== null && selfSeat !== null)
      return { ...data.side, position: firstSeat === selfSeat ? 1 : 2 };
    return data.selfSeat === selfSeat ? data.side : nativeSide(ctx, selfSeat);
  };
  const reset = () => { draft = active = null; };
  function gap(detail = {}) {
    sync();
    if (detail?.type === 'ClientGameRecordInfoRep') {
      historyRequest = null; historyStatus = `官方战绩${detail.reason === 'projection' ? '读取' : '合并'}失败：${detail.message || '未知异常'}（${detail.type}）；请稍后刷新`; notify(); return;
    }
    const affected = Boolean(draft || active);
    // Scene/hall proxy replacement is normal when no unfinished game is tracked.
    if (!affected && detail?.reason === 'rebind') return;
    reset(); firstSeat = null; gaps++;
    captureNotice = affected ? '采集中断：本局未完成部分已停止采集；已保存记录保留，可刷新补收战绩。'
      : '曾有消息未能处理；已保存记录保留。';
    captureDetail = [({rebind:'游戏连接切换',projection:'消息读取失败',consume:'消息处理失败',overflow:'消息队列超限'})[detail?.reason] || '采集消息缺口', detail?.type, detail?.message].filter(Boolean).join(' · ');
    if (who.id) save(); notify();
  }
  function commit() {
    if (!draft?.mode || !draft.general.length || storageBlocked || !who.id) return;
    if (sideOf(draft)==='unknown') return;
    if (records.length >= RECORD_LIMIT) { error = '本机出框已达10000条，已暂停追加，请先导出备份。'; notify(); return; }
    const fingerprint = JSON.stringify([draft.mode, draft.general, draft.selected, draft.position, draft.figure]);
    if (lastSaved?.fingerprint === fingerprint && draft.time - lastSaved.time < 15000) { if (active) active.frameId = lastSaved.id; draft = null; return; }
    const record = { ...draft, id: active?.id || `${draft.time}-${ctx.window.crypto?.randomUUID?.() || records.length}`, source: 'toolbox' };
    if (save([...records, record])) { records = [...records, record]; startedAt ||= record.time; lastSaved = { fingerprint, time: record.time, id: record.id }; if (active) active.frameId = record.id; draft = null; notify(); }
  }
  function settle(data) {
    if (!active || storageBlocked || viewer()) { reset(); firstSeat = null; return; }
    const game = { ...active }; let unsaved = draft;
    if (!game.mode) {
      game.mode = eligibleMode(data.rawMode, data.rawGroup);
      game.rawMode = data.rawMode; game.rawGroup = data.rawGroup; game.modeEvidence = 'native-settlement';
      if (game.mode === 44 && firstSeat !== null && game.selfSeat !== null) game.position = firstSeat === game.selfSeat ? 1 : 2;
      if (unsaved) unsaved = { ...unsaved, mode: game.mode, rawMode: game.rawMode, rawGroup: game.rawGroup,
        modeEvidence: game.modeEvidence, position: game.position ?? null };
    }
    if (game.mode === 26 && game.position == null) {
      game.position = rankedPosition(game.selfSeat, firstSeat, game.rankSeats);
      if (unsaved) unsaved = { ...unsaved, position: game.position };
    }
    reset(); firstSeat = null; lastSaved = null;
    if (!game.mode) return;
    const selfSeat = observedSeat(data);
    if (selfSeat !== game.selfSeat || selfSeat === null) return;
    if (data.rawMode != null && data.rawMode !== game.rawMode) return;
    if (data.rawGroup != null && data.rawGroup !== game.rawGroup) return;
    if (data.gameModel != null && !({ 26: [7, 14], 35: [33], 44: [37] })[game.mode]?.includes(data.gameModel)) return;
    const ownRows = data.players.filter(p => p.seat === selfSeat);
    const own = ownRows.length === 1 ? ownRows[0] : null;
    if (own?.userId != null && String(own.userId) !== who.id) return;
    const ai = data.players.length >= 2 ? robotStatus(data.players.map(p => ({ isRobot: p.isRobot, isProjectRobot: p.isProjectRobot }))) : null;
    const isAiMatch = game.isAiMatch === true || ai === true ? true : ai ?? game.isAiMatch;
    const sourceRecords = unsaved && records.length < RECORD_LIMIT
      ? [...records, { ...unsaved, id: game.id, source: 'toolbox' }] : records;
    const frameId = game.frameId || (unsaved ? game.id : null);
    const nextRecords = sourceRecords
      .map(r => r.id === frameId ? { ...r, isAiMatch, seat:game.selfSeat, position:game.position ?? null, figure: own?.figure ?? game.figure ?? null } : r)
      .filter(r=>sideOf(r)!=='unknown');
    if (!game.selected?.length) return;
    if (matches.length >= RECORD_LIMIT) { error = '本机战绩已达10000条，已暂停追加，请先导出备份。'; notify(); return; }
    const result = [0, 1, 255].includes(own?.result) ? own.result : null;
    const match = { id: game.id, mode: game.mode, rawMode: game.rawMode, rawGroup: game.rawGroup, modeEvidence: game.modeEvidence,
      time: game.time, endedAt: Date.now(), general: game.selected, seat: game.selfSeat, position:game.position ?? null, figure: own?.figure ?? game.figure ?? null,
      result, duration: data.duration, isAiMatch };
    const nextMatches = sideOf(match)==='unknown'||matches.some(m => m.id === match.id) ? matches : [...matches, match];
    if (save(nextRecords, nextMatches)) { records = nextRecords; matches = nextMatches; }
    else pending = { records: nextRecords, matches: nextMatches };
    notify();
  }
  function refreshHistory() {
    sync();
    if (!who.id || storageBlocked || saveFailed || restoring || reviewing || ctx.scope.signal.aborted) return;
    if (historyRequest || Date.now() - historyLastAt < 10000) return;
    const mgr = manager(ctx, 'UserInfoManger', 'ClientGameRecordInfoRep', m => typeof m.SendClientGameRecordInfoReq === 'function');
    if (!mgr) { historyLastAt = Date.now(); historyStatus = '战绩查询暂不可用，请稍后刷新'; notify(); return; }
    const uuid = read(() => ctx.game.getSelf().Uuid) || Number(who.id);
    const request = { account: who.id, uuid: String(uuid), modes: new Set([26,35,44]), added: 0, skipped: 0, issues: [] };
    historyRequest = request; historyLastAt = Date.now(); historyStatus = '正在补收官方七日战绩…'; notify();
    for (const [index, mode] of [26,35,44].entries()) ctx.scope.timeout(() => {
      if (ctx.scope.signal.aborted || historyRequest !== request || account(ctx).id !== request.account) return;
      try { mgr.SendClientGameRecordInfoReq(Number(uuid), mode, null, 100); }
      catch (e) { historyRequest = null; historyStatus = `战绩查询失败：${e?.message || e}`; notify(); }
    }, index * 400);
    ctx.scope.timeout(() => {
      if (historyRequest !== request || account(ctx).id !== request.account) return;
      historyRequest = null; historyStatus = `部分战绩查询超时（${[...request.modes].map(m => ({26:'排位',35:'斗地主',44:'单骑'})[m]).join('、')}），已补收 ${request.added} 局，请稍后刷新`; notify();
    }, 15000);
  }
  function acceptHistory(data) {
    const request = historyRequest;
    if (!request || request.account !== who.id || data.account !== request.uuid || data.tab !== 0 || !request.modes.has(data.mode)) return;
    if (storageBlocked || saveFailed || restoring || reviewing) { historyRequest = null; historyStatus = '本机记录忙或保存异常，请处理后刷新'; notify(); return; }
    request.issues.push(...(data.issues || []).map(message => `${({26:'排位',35:'斗地主',44:'单骑'})[data.mode]}：${message}`));
    const merged = mergeHistory(records, matches, data);
    if (!save(records, merged.matches)) { historyRequest = null; historyStatus = '补收战绩保存失败，请稍后重新刷新'; notify(); return; }
    matches = merged.matches; request.added += merged.added; request.skipped += merged.skipped; request.modes.delete(data.mode);
    if (!request.modes.size) {
      historyRequest = null;
      historyStatus = request.added ? `已补收 ${request.added} 局战绩` : '战绩核对完成，本次没有新增';
    }
    notify();
  }
  function accept(type, data) {
    sync(); if (!who.id) return;
    if (type === 'ClientGameRecordInfoRep') { acceptHistory(data); return; }
    if (type === 'SmsgGameSetCharacter') refreshHistory();
    if (type === 'ClientEnterpageRep') { reset(); tableEvidence = null; joinedSeat = firstSeat = null; inTraining = false; lastSaved = null; return; }
    if (type === 'ClientTrainingRep') { if (data.result === 1) { reset(); tableEvidence = null; joinedSeat = firstSeat = null; inTraining = true; } return; }
    if (type === 'ClientSitdownRep') { if (data.result === 1) { reset(); inTraining = data.viewer === true;
      joinedSeat = data.viewer === true ? null : validSeat(data.seat); firstSeat = null;
      tableEvidence = { mode: eligibleMode(data.rawMode, data.rawGroup), rawMode: data.rawMode, rawGroup: data.rawGroup, modeEvidence: 'native-table-join' }; } return; }
    if (viewer() || data.viewer) { reset(); firstSeat = null; return; }
    if (type === 'MsgGameOver') { settle(data); return; }
    if (['ClientLeavetableRep', 'MsgReconnectGame', 'ClientLoginRep'].includes(type)) { reset(); tableEvidence = null; joinedSeat = firstSeat = null; inTraining = false; lastSaved = null; return; }
    if (saveFailed || storageBlocked || restoring) return;
    if (type === 'MsgGameDealCharacter' || type === 'MsgGameDealCharacterPaiwei') {
      const evidence = tableEvidence || data.mode;
      if (data.type === 1 || data.type === 9 && evidence.mode === 26) {
        reset(); captureNotice = captureDetail = '';
        if (!inTraining && canObserve(evidence)) {
          active = { ...evidence, id: `${data.time}-${ctx.window.crypto?.randomUUID?.() || records.length}`, time: data.time, selfSeat: observedSeat(data), selected: null, isAiMatch: data.isAiMatch };
          const selfSeat = active.selfSeat, side = observedSide(data, selfSeat, evidence.mode);
          active.position = side?.position ?? null; active.figure = side?.figure ?? null;
          draft = { ...capture(null, { type: 'frame', mode: evidence.mode, general: data.general, time: data.time }), ...evidence,
            seat: selfSeat, position: active.position, figure: active.figure, isAiMatch: data.isAiMatch };
        }
      } else if (data.type === 3 && draft) draft = capture(draft, { type: 'change', general: data.general });
      notify();
    } else if (type === 'SmsgGameSetCharacter') {
      const selfSeat = observedSeat(data);
      if (selfSeat === null) { if (draft) error = '无法确认自己的座位，已舍弃当前出框与战绩。'; reset(); notify(); return; }
      const selected = data.infos.filter(r => r.seat === selfSeat).map(r => r.id); if (!selected.length) return;
      const evidence = tableEvidence || data.mode;
      if (!active && !inTraining && canObserve(evidence)) active = { ...evidence, id: `${data.time}-${ctx.window.crypto?.randomUUID?.() || matches.length}`, time: data.time, selfSeat, isAiMatch: data.isAiMatch };
      if (!active) return;
      const rankSeats = data.infos.map(r => r.seat);
      if (rankedPosition(selfSeat, selfSeat, rankSeats) !== null) active.rankSeats = rankSeats;
      active.selected = ids(selected); active.selfSeat = selfSeat;
      const side = observedSide(data, selfSeat, active.mode);
      active.position=side?.position ?? active.position ?? null;active.figure=side?.figure ?? active.figure ?? null;
      if(draft)draft={...draft,seat:selfSeat,position:active.position,figure:active.figure};
      if (draft) { draft = capture(draft, { type: 'select', selected }); if (!draft) { error = '选中武将不在候选中，已舍弃当前对局。'; active = null; notify(); return; } commit(); }
    } else if (type === 'MsgEnterGameStageNtf' || type === 'GsCFirstPhaseRole') {
      if (type === 'GsCFirstPhaseRole') firstSeat = validSeat(data.firstSeat);
      const selfSeat = observedSeat(data), side = observedSide(data, selfSeat, active?.mode);
      if(active && selfSeat===active.selfSeat){
        active.position = side?.position ?? active.position ?? null;active.figure = side?.figure ?? active.figure ?? null;
        if(draft)draft={...draft,seat:active.selfSeat,position:active.position,figure:active.figure};
        else if(active.frameId){
          const next=records.map(r=>r.id===active.frameId?{...r,position:active.position,figure:active.figure}:r);
          if(JSON.stringify(next)!==JSON.stringify(records)&&save(next))records=next;
        }
      }
      commit();notify();
    }
  }
  sync(); names = generalNames(read(() => ctx.game.getConfigData('character')));
  observeNative(ctx, {
    ClientGameRecordInfoRep: projectHistory,
    ClientEnterpageRep: () => ({}), ClientTrainingRep: p => ({ result: field(p, 'Result') }),
    ClientSitdownRep: p => ({ result: field(p, 'Result'), rawMode: field(p, 'TypeID'), rawGroup: field(p, 'GroupID'), viewer: field(p, 'IsViewer'), seat: field(p, 'SeatID') }),
    MsgGameDealCharacter: p => { const type = Number(field(p, 'Type')); return [1, 3, 9].includes(type) ? { type, general: ids(field(p, 'Datas')), time: Date.now(), mode: mode(), selfSeat: seatId(), side: nativeSide(ctx, joinedSeat ?? seatId()), isAiMatch: nativeRobots(ctx), viewer: viewer() } : null; },
    MsgGameDealCharacterPaiwei: p => {
      const selfSeat = seatId(), candidates = read(() => field(p, 'randomHt').get(selfSeat));
      return { type: 1, general: ids(read(() => candidates.Datas)), time: Date.now(), mode: mode(), selfSeat, side: nativeSide(ctx, joinedSeat ?? selfSeat), isAiMatch: nativeRobots(ctx), viewer: viewer() };
    },
    GsCFirstPhaseRole: p => { const selfSeat = seatId(); return { selfSeat, firstSeat: field(p, 'SeatID'), side: nativeSide(ctx, selfSeat) }; },
    SmsgGameSetCharacter: p => { const infos = field(p, 'Infos'); if (!Array.isArray(infos) || infos.length > 32) throw new Error('选将确认格式无效');
      const selfSeat=seatId();return { selfSeat, side:nativeSide(ctx,selfSeat), infos: infos.map(r => ({ seat: r.SeatID, id: r.CharacterID })), mode: mode(), time: Date.now(), isAiMatch: nativeRobots(ctx), viewer: viewer() }; },
    MsgEnterGameStageNtf: () => {const selfSeat=seatId();return {selfSeat,side:nativeSide(ctx,selfSeat)};}, MsgGameOver: p => ({ ...projectSettlement(p, seatId()), viewer: viewer() }),
    ClientLeavetableRep: () => ({}), MsgReconnectGame: () => ({}), ClientLoginRep: () => ({}),
  }, accept, gap);
  async function refreshNames() {
    sync(); if (!who.id || loading || ctx.scope.signal.aborted) return;
    const expected = who.id, generation = epoch;
    nameAttempts++; nextNamesAt = Date.now() + 30000; loading = true; notify();
    try {
      const config = await ctx.game.loadConfigData('character');
      if (!ctx.scope.signal.aborted && account(ctx).id === expected && epoch === generation) {
        const next = generalNames(config);
        if (!Object.keys(next).length) throw new Error('武将名称配置为空');
        names = next; namesReady = true; namesError = '';
      }
    } catch (e) { if (!ctx.scope.signal.aborted && account(ctx).id === expected && epoch === generation) { namesError = String(e?.stack || e); notify(); } }
    finally { if (!ctx.scope.signal.aborted && account(ctx).id === expected && epoch === generation) { loading = false; notify(); } }
  }
  const initialize = () => {
    sync();
    if (who.id && historyAccount !== who.id) { refreshHistory(); if (historyRequest) historyAccount = who.id; }
    if (who.id && !namesReady && !loading && nameAttempts < 3 && Date.now() >= nextNamesAt) void refreshNames();
  };
  ctx.scope.timeout(initialize, 0); ctx.scope.interval(initialize, 500);
  ctx.scope.add(() => { listeners.clear(); reset(); pending = null; epoch++; });
  return {
    view() { sync(); return { who, records, matches, startedAt, gaps, draft, error: error || namesError, captureNotice, captureDetail, canRetrySave: saveFailed || Boolean(pending) || reviewFailed, historyStatus, historyLoading: Boolean(historyRequest), names, loading, storageBlocked, discardedBaisheng, reviewing: reviewing || reviewFailed, restoring }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refreshNames, refreshHistory,
    dismissCaptureNotice() { captureNotice = captureDetail = ''; notify(); },
    async restore(file) { sync(); if (!who.id || restoring || reviewing || storageBlocked) return; const expected = who.id; restoring = true; notify();
      try {
        if (file.size > 32 * 1024 * 1024) throw new Error('备份超过32MiB上限');
        const value = JSON.parse(await file.text());
        if (ctx.scope.signal.aborted || account(ctx).id !== expected) return;
        if (value.format !== BACKUP_FORMAT || value.schema !== 1 || String(value.accountId) !== expected) throw new Error('只接受当前账号的出框与胜率统计工具箱备份');
        const incoming = validateRows(value.records), battles = validateRows(value.matches || [], true);
        const merge = (old, added) => { const map = new Map(old.map(r => [r.id, r])); for (const r of added) {
          if (map.has(r.id) && JSON.stringify(map.get(r.id)) !== JSON.stringify(r)) throw new Error('备份存在同ID内容冲突，未导入'); map.set(r.id, r); }
          if (map.size > RECORD_LIMIT) throw new Error('恢复后超过10000条上限，未导入'); return [...map.values()]; };
        const cleaned=knownSides(merge(records, incoming),merge(matches, battles));
        const next=cleaned.records,nextMatches=cleaned.matches;
        if (save(next, nextMatches)) { records = next; matches = nextMatches; error = ''; if (records.some(needsModeReview)) await repair(expected, epoch); }
      } catch (e) { if (!ctx.scope.signal.aborted && account(ctx).id === expected) fail(e); }
      finally { if (!ctx.scope.signal.aborted && account(ctx).id === expected) { restoring = false; notify(); } }
    },
    clear() { sync(); if (!who.id || reviewing || restoring) return;
      historyRequest = null; historyStatus = '';
      const before = { blocked: storageBlocked, startedAt, gaps }; storageBlocked = false; startedAt = Date.now(); gaps = 0;
      if (save([], [])) { records = []; matches = []; reset(); pending = null; lastSaved = null; error = ''; }
      else { storageBlocked = before.blocked; startedAt = before.startedAt; gaps = before.gaps; } notify(); },
    retry() { sync(); if (reviewFailed) { error = ''; void repair(who.id, epoch); return; }
      if (pending) { if (save(pending.records, pending.matches)) { records = pending.records; matches = pending.matches; pending = null; error = ''; } }
      else if (save()) { error = ''; commit(); } notify(); },
  };
}
