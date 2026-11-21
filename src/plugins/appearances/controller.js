import { read, field, generalNames } from '../../shared/info-runtime.js';
import { BACKUP_RESTORED, SYNC_HISTORY_UPDATED } from '../../shared/sync-paths.js';
import { modeId, ids, capture } from './model.js';
import { nativeModeEvidence, needsModeReview, reviewModeEvidence } from './mode-evidence.js';
import { eligibleMode, nativeSide, projectSettlement, rankedPosition } from './battle.js';
import { sideOf, knownSides } from './groups.js';
import { RANKED_DETAIL_EVENT, RANKED_HISTORY_TAB, projectHistory, projectRankedDetail, mergeHistory } from './history.js';
import { exchangeSyncMatches, mergeSyncMatches } from './match-sync.js';
export const RECORD_LIMIT = 10000;
export const BACKUP_FORMAT = 'sgs-toolbox-appearances-v1';
export function createController(ctx) {
  let who = { id: '' }, records = [], matches = [], startedAt = null, gaps = 0, draft = null, active = null;
  let error = '', names = {}, loading = false, storageBlocked = false, saveFailed = false, reviewing = false, reviewFailed = false, epoch = 0;
  let discardedBaisheng = 0, tableEvidence = null, inTraining = false, restoring = false, pending = null, lastSaved = null;
  let joinedSeat = null, firstSeat = null, opening = null;
  let captureNotice = '', captureDetail = '', historyRequest = null, historyStatus = '', historyAccount = '', historyLastAt = 0;
  let rankedHistory = null;
  const transport = ctx.devAppearanceSync;
  const canSyncMatches = typeof transport === 'function' && typeof transport.available === 'function';
  const bindingKey = () => canSyncMatches && transport.available(who.id) ? transport.cacheKey?.(who.id) ?? who.id : null;
  let matchBinding = null;
  let syncRequested = false, syncWork = null, syncStatus = '';
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
      // Drop the retired flag while keeping other fields from version 1 backups.
      const { isAiMatch, ...current } = row;
      seen.add(row.id); return { ...current, mode: modeId(row.mode), general, ...(battle ? {} : { selected }) };
    });
  }
  function sync() {
    const next = ctx.native.account(); if (next.id === who.id) return;
    resetMatchSync();
    captureNotice = captureDetail = '';
    historyRequest = rankedHistory = null; historyStatus = ''; historyAccount = ''; historyLastAt = 0;
    who = next; draft = active = pending = lastSaved = null; tableEvidence = null; inTraining = false; epoch++;
    joinedSeat = firstSeat = opening = null;
    error = ''; loading = storageBlocked = saveFailed = reviewing = reviewFailed = restoring = false;
    namesReady = false; nameAttempts = 0; nextNamesAt = 0; namesError = '';
    records = []; matches = []; startedAt = null; gaps = discardedBaisheng = 0;
    const stored = who.id ? ctx.storage.get(`account:${who.id}:records-v1`, null) : null;
    if (stored) try {
      if (stored.schema !== 1) throw new Error('本机记录版本不支持，未覆盖原数据');
      records = validateRows(stored.records); matches = validateRows(stored.matches || [], true);
      startedAt = stored.startedAt; gaps = stored.gaps || 0; discardedBaisheng = stored.discardedBaisheng || 0;
      const cleaned=knownSides(records,matches);
      const changed = JSON.stringify(cleaned) !== JSON.stringify({ records: stored.records, matches: stored.matches || [] });
      records=cleaned.records;matches=cleaned.matches;
      if(changed && !save())pending=cleaned;
    } catch (e) { records = []; matches = []; storageBlocked = true; error = String(e.message); }
    if (!storageBlocked && records.some(needsModeReview)) void repair(who.id, epoch);
    matchBinding = bindingKey();
    syncRequested = Boolean(who.id && matchBinding);
    notify();
  }
  function save(nextRecords = records, nextMatches = matches) {
    if (!who.id || ctx.scope.signal.aborted || storageBlocked) return false;
    try { ctx.storage.set(`account:${who.id}:records-v1`, { schema: 1, startedAt: startedAt || Date.now(), gaps, discardedBaisheng, records: nextRecords, matches: nextMatches }); saveFailed = false; return true; }
    catch (e) { saveFailed = true; fail(e); return false; }
  }
  function resetMatchSync() {
    syncWork?.abort();
    syncWork = null;
    syncRequested = false;
    syncStatus = '';
  }
  function checkMatchBinding() {
    const next = bindingKey();
    if (next === matchBinding) return;
    resetMatchSync();
    matchBinding = next;
    syncRequested = Boolean(next);
    notify();
  }
  async function syncMatches() {
    if (!syncRequested || syncWork || !who.id || active || draft || storageBlocked || saveFailed
      || restoring || reviewing || ctx.scope.signal.aborted) return;
    const binding = bindingKey();
    if (!binding) return;
    const request = new AbortController(), expected = who.id;
    syncWork = request;
    syncRequested = false;
    syncStatus = '正在同步已核实记录…';
    notify();
    const timer = setTimeout(() => request.abort(), 15000);
    const cancelTimer = ctx.scope.add(() => clearTimeout(timer));
    const current = () => syncWork === request && !ctx.scope.signal.aborted && ctx.native.account().id === expected && bindingKey() === binding;
    try {
      const incoming = await exchangeSyncMatches(transport, expected, records, matches, request.signal, names);
      if (!current()) return;
      if (active || draft || storageBlocked || saveFailed || restoring || reviewing) {
        syncRequested = true;
        syncStatus = '将在赛后或本机记录可用时同步';
        return;
      }
      const { addedMatches, addedFrames, skipped } = mergeSyncMatches(records, matches, incoming);
      if (addedMatches.length || addedFrames.length) {
        const nextRecords = [...records, ...addedFrames], nextMatches = [...matches, ...addedMatches];
        if (!save(nextRecords, nextMatches)) { syncStatus = '同步记录保存失败'; return; }
        records = nextRecords;
        matches = nextMatches;
      }
      syncStatus = `云同步完成 · 新增 ${addedMatches.length} 局${addedFrames.length ? ` · 补齐 ${addedFrames.length} 条出框` : ''}${skipped ? ` · ${skipped} 局暂未合并` : ''}`;
    } catch {
      if (current()) syncStatus = '云同步失败，请重试';
    } finally {
      cancelTimer();
      if (syncWork === request) { syncWork = null; notify(); }
    }
  }
  function requestMatchSync() {
    if (!canSyncMatches || !who.id) return;
    checkMatchBinding();
    if (!matchBinding) return;
    syncRequested = true;
    if (!syncWork && (active || draft || storageBlocked || saveFailed || restoring || reviewing)) {
      syncStatus = '将在赛后或本机记录可用时同步';
      notify();
    }
    void syncMatches();
  }
  async function repair(expected, generation) {
    reviewing = true; reviewFailed = false; const original = records;
    try {
      const checked = await reviewModeEvidence(original, expected, { crypto: ctx.window.crypto?.subtle ? ctx.window.crypto : globalThis.crypto, signal: ctx.scope.signal });
      if (ctx.scope.signal.aborted || ctx.native.account().id !== expected || generation !== epoch) return;
      const retained = new Set(checked), removed = new Set(original.filter(r => !retained.has(r)));
      if (removed.size) { records = records.filter(r => !removed.has(r)); discardedBaisheng = Math.max(discardedBaisheng, removed.size); save(); }
    } catch (e) { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected && generation === epoch) { reviewFailed = true; fail(e); } }
    finally { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected && generation === epoch) { reviewing = false; notify(); } }
  }
  const mode = () => {
    const evidence = nativeModeEvidence(read(() => ctx.game.getClass('GameContext')));
    const room = ctx.native.manager('RoomControler', 'ClientTrainingRep', v => 'isTrainingGame' in v);
    const training = read(() => room.isTrainingGame) === true;
    return { ...evidence, training, mode: training ? 0 : eligibleMode(evidence.rawMode, evidence.rawGroup) };
  };
  const canObserve = evidence => !evidence.training && (evidence.mode || evidence.rawMode == null && evidence.rawGroup == null);
  const viewer = () => read(() => ctx.game.getClass('GameContext').IsViewerOrReplay()) === true
    || read(() => ctx.game.getSnapshot().isReplay) === true || read(() => ctx.game.getScene().IsViewer) === true;
  const validSeat = value => Number.isInteger(value) && value >= 0 && value < 8 ? value : null;
  function projectSeat() {
    const context = read(() => ctx.game.getClass('GameContext'));
    const account = ctx.native.account().id;
    const seat = account && read(() => context.GetSeatByUserId(Number(account)));
    const accountSeat = validSeat(read(() => seat.Index));
    const selfSeat = accountSeat ?? validSeat(read(() => ctx.game.getSnapshot().selfSeatId));
    return { accountSeat, selfSeat, side: nativeSide(ctx, selfSeat) };
  }
  // A match start can move the player away from the seat assigned on table entry.
  const observedSeat = data => opening ? opening.seat : data.accountSeat ?? joinedSeat ?? data.selfSeat;
  const observedSide = (data, selfSeat, gameMode) => {
    // The native first-role packet identifies the starting seat. In a two-seat
    // single-rider game the other participant is second; never add one to SeatID.
    if (gameMode === 44 && firstSeat !== null && selfSeat !== null)
      return { ...data.side, position: firstSeat === selfSeat ? 1 : 2 };
    const side = data.selfSeat === selfSeat ? data.side : nativeSide(ctx, selfSeat);
    const position = gameMode === 26 ? rankedPosition(selfSeat, firstSeat, opening?.seats) : null;
    return position === null ? side : { ...side, position };
  };
  const reset = () => { draft = active = null; };
  function gap(detail = {}) {
    sync();
    if (['ClientGameRecordInfoRep', RANKED_DETAIL_EVENT].includes(detail?.type)) {
      historyRequest = null; historyStatus = `官方战绩${detail.reason === 'projection' ? '读取' : '合并'}失败：${detail.message || '未知异常'}（${detail.type}）；请稍后刷新`; notify(); return;
    }
    const affected = Boolean(draft || active);
    // Scene/hall proxy replacement is normal when no unfinished game is tracked.
    if (!affected && detail?.reason === 'rebind') return;
    reset(); firstSeat = opening = null; gaps++;
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
  function updateSavedFrame(fields) {
    const frame = records.find(row => row.id === active.frameId);
    if (!frame) return;
    const updated = { ...frame, ...fields };
    if (JSON.stringify(frame) === JSON.stringify(updated)) return;
    const next = records.map(row => row === frame ? updated : row);
    if (save(next)) { records = next; notify(); }
    else pending = { records: next, matches };
  }
  function settle(data) {
    if (!active || storageBlocked || viewer()) { reset(); firstSeat = opening = null; return; }
    const game = { ...active }; let unsaved = draft;
    if (!game.mode) {
      game.mode = eligibleMode(data.rawMode, data.rawGroup);
      game.rawMode = data.rawMode; game.rawGroup = data.rawGroup; game.modeEvidence = 'native-settlement';
      if (game.mode === 44 && firstSeat !== null && game.selfSeat !== null) game.position = firstSeat === game.selfSeat ? 1 : 2;
      if (unsaved) unsaved = { ...unsaved, mode: game.mode, rawMode: game.rawMode, rawGroup: game.rawGroup,
        modeEvidence: game.modeEvidence, position: game.position ?? null };
    }
    if (game.mode === 26 && game.position == null) {
      game.position = rankedPosition(game.selfSeat, firstSeat, opening?.seats ?? game.rankSeats);
      if (unsaved) unsaved = { ...unsaved, position: game.position };
    }
    const selfSeat = observedSeat(data);
    reset(); firstSeat = opening = null; lastSaved = null;
    if (!game.mode) return;
    if (selfSeat !== game.selfSeat || selfSeat === null) return;
    if (data.rawMode != null && data.rawMode !== game.rawMode) return;
    if (data.rawGroup != null && data.rawGroup !== game.rawGroup) return;
    if (data.gameModel != null && !({ 26: [7, 14], 35: [33], 44: [37] })[game.mode]?.includes(data.gameModel)) return;
    const ownRows = data.players.filter(p => p.seat === selfSeat);
    const own = ownRows.length === 1 ? ownRows[0] : null;
    if (own?.userId != null && String(own.userId) !== who.id
      || data.players.some(p => p.seat !== selfSeat && String(p.userId) === who.id)) return;
    const sourceRecords = unsaved?.general.length && records.length < RECORD_LIMIT
      ? [...records, { ...unsaved, id: game.id, source: 'toolbox' }] : records;
    const frameId = game.frameId || (unsaved ? game.id : null);
    const nextRecords = sourceRecords
      .map(r => r.id === frameId ? { ...r, seat:game.selfSeat, position:game.position ?? null,
        figure: own?.figure ?? game.figure ?? null,
        ...(game.selected?.every(id => r.general.includes(id)) ? { selected: game.selected } : {}) } : r)
      .filter(r=>sideOf(r)!=='unknown');
    if (!game.selected?.length) return;
    if (matches.length >= RECORD_LIMIT) { error = '本机战绩已达10000条，已暂停追加，请先导出备份。'; notify(); return; }
    const result = [0, 1, 255].includes(own?.result) ? own.result : null;
    const savedFrame = records.find(r => r.id === game.frameId);
    const match = { id: savedFrame?.id ?? game.id, mode: game.mode, rawMode: game.rawMode, rawGroup: game.rawGroup, modeEvidence: game.modeEvidence,
      time: savedFrame?.time ?? game.time, endedAt: Date.now(), general: game.selected, seat: game.selfSeat, position:game.position ?? null, figure: own?.figure ?? game.figure ?? null,
      result, duration: data.duration };
    const nextMatches = sideOf(match)==='unknown'||matches.some(m => m.id === match.id) ? matches : [...matches, match];
    if (save(nextRecords, nextMatches)) { records = nextRecords; matches = nextMatches; pending = null; }
    else pending = { records: nextRecords, matches: nextMatches };
    notify();
  }
  function refreshHistory() {
    sync();
    if (!who.id || storageBlocked || saveFailed || restoring || reviewing || ctx.scope.signal.aborted) return;
    if (historyRequest || Date.now() - historyLastAt < 10000) return;
    const mgr = ctx.native.manager('UserInfoManger', 'ClientGameRecordInfoRep', m => typeof m.SendClientGameRecordInfoReq === 'function');
    if (!mgr) { historyLastAt = Date.now(); historyStatus = '战绩查询暂不可用，请稍后刷新'; notify(); return; }
    const uuid = read(() => ctx.game.getSelf().Uuid) || Number(who.id);
    const request = { account: who.id, uuid: String(uuid), modes: new Set([26,35,44]), added: 0 };
    historyRequest = request; historyLastAt = Date.now(); historyStatus = '正在补收官方七日战绩…'; notify();
    for (const [index, mode] of [26,35,44].entries()) ctx.scope.timeout(() => {
      if (ctx.scope.signal.aborted || historyRequest !== request || ctx.native.account().id !== request.account) return;
      try {
        if (mode === 26 && typeof mgr.SendGetLastModeHighScore === 'function')
          mgr.SendGetLastModeHighScore(Number(uuid), 100, RANKED_HISTORY_TAB, false);
        else mgr.SendClientGameRecordInfoReq(Number(uuid), mode, null, 100);
      }
      catch (e) { historyRequest = null; historyStatus = `战绩查询失败：${e?.message || e}`; notify(); }
    }, index * 400);
    ctx.scope.timeout(() => {
      if (historyRequest !== request || ctx.native.account().id !== request.account) return;
      historyRequest = null; historyStatus = `部分战绩查询超时（${[...request.modes].map(m => ({26:'排位',35:'斗地主',44:'单骑'})[m]).join('、')}），已补收 ${request.added} 局，请稍后刷新`; notify();
    }, 15000);
  }
  function acceptHistory(data) {
    const request = historyRequest;
    const requested = request?.account === who.id && data.account === request.uuid
      && (data.tab === 0 || data.rankedHistory) && request.modes.has(data.mode);
    const ownRanked = data.mode === 26 && data.account === String(read(() => ctx.game.getSelf().Uuid) || who.id)
      && (requested || data.rankedHistory);
    if (!requested && !ownRanked) return;
    if (storageBlocked || saveFailed || restoring || reviewing) {
      if (requested) { historyRequest = null; historyStatus = '本机记录忙或保存异常，请处理后刷新'; notify(); }
      return;
    }
    if (ownRanked && data.rows.length) rankedHistory = data;
    const added = saveHistory(data);
    if (added === null) return;
    if (!requested) {
      if (added) { historyStatus = `已补收 ${added} 局战绩`; notify(); }
      return;
    }
    request.added += added; request.modes.delete(data.mode);
    if (!request.modes.size) {
      historyRequest = null;
      historyStatus = request.added ? `已补收 ${request.added} 局战绩` : '战绩核对完成，本次没有新增';
    }
    notify();
  }
  function saveHistory(data) {
    const merged = mergeHistory(records, matches, data);
    if (merged.matches === matches) return 0;
    if (!save(merged.records, merged.matches)) {
      historyRequest = null; historyStatus = '补收战绩保存失败，请稍后重新刷新'; notify(); return null;
    }
    records = merged.records; matches = merged.matches;
    requestMatchSync();
    return merged.added;
  }
  function acceptRankedDetail(data) {
    if (!rankedHistory || storageBlocked || saveFailed || restoring || reviewing) return;
    const own = data.roster.filter(row => row.account === who.id);
    if (own.length !== 1 || !rankedHistory.rows.some(row => row.gameId === data.id)) return;
    const rows = rankedHistory.rows.map(row => row.gameId === data.id ? { ...row, seat: own[0].seat, roster: data.roster } : row);
    const added = saveHistory({ ...rankedHistory, rows });
    if (added) {
      if (historyRequest) historyRequest.added += added;
      historyStatus = `已补收 ${added} 局战绩`; notify();
    }
  }
  function accept(type, data) {
    sync(); if (!who.id) return;
    if (type === 'ClientGameRecordInfoRep') { acceptHistory(data); return; }
    if (type === RANKED_DETAIL_EVENT) { acceptRankedDetail(data); return; }
    if (type === 'SmsgGameSetCharacter') refreshHistory();
    if (type === 'ClientEnterpageRep') { reset(); tableEvidence = null; joinedSeat = firstSeat = opening = null; inTraining = false; lastSaved = null; return; }
    if (type === 'ClientTrainingRep') { if (data.result === 1) { reset(); tableEvidence = null; joinedSeat = firstSeat = opening = null; inTraining = true; } return; }
    if (type === 'ClientSitdownRep') { if (data.result === 1) { reset(); inTraining = data.viewer === true;
      joinedSeat = data.viewer === true ? null : validSeat(data.seat); firstSeat = opening = null;
      tableEvidence = { mode: eligibleMode(data.rawMode, data.rawGroup), rawMode: data.rawMode, rawGroup: data.rawGroup, modeEvidence: 'native-table-join' }; } return; }
    if (viewer() || data.viewer) { reset(); firstSeat = opening = null; return; }
    if (type === 'MsgGameOver') { settle(data); return; }
    if (['ClientLeavetableRep', 'MsgReconnectGame', 'ClientLoginRep'].includes(type)) { reset(); tableEvidence = null; joinedSeat = firstSeat = opening = null; inTraining = false; lastSaved = null; return; }
    if (type === 'GsCModifyUserseatNtf') {
      reset(); firstSeat = lastSaved = null;
      const own = data.infos.filter(row => row.account === who.id);
      const seats = data.infos.map(row => row.seat);
      const validRoster = !seats.includes(null) && new Set(seats).size === seats.length;
      opening = { seats, seat: validRoster && own.length === 1 ? own[0].seat : null };
      return;
    }
    if (saveFailed || storageBlocked || restoring) return;
    if (type === 'MsgGameDealCharacter' || type === 'MsgGameDealCharacterPaiwei') {
      const evidence = tableEvidence || data.mode;
      if (data.type === 1 || data.type === 9 && evidence.mode === 26) {
        reset(); captureNotice = captureDetail = '';
        if (!inTraining && canObserve(evidence)) {
          const selfSeat = observedSeat(data);
          if (opening && selfSeat === null) return;
          active = { ...evidence, id: `${data.time}-${ctx.window.crypto?.randomUUID?.() || records.length}`, time: data.time, selfSeat,
            selected: null, perSeatCandidates: Boolean(data.candidates) };
          const side = observedSide(data, selfSeat, evidence.mode);
          active.position = side?.position ?? null; active.figure = side?.figure ?? null;
          const general = data.candidates ? data.candidates[selfSeat] ?? [] : data.general;
          draft = { ...capture(null, { type: 'frame', mode: evidence.mode, general, time: data.time }), ...evidence,
            seat: selfSeat, position: active.position, figure: active.figure };
        }
      } else if (data.type === 3 && draft) draft = capture(draft, { type: 'change', general: data.general });
      notify();
    } else if (type === 'SmsgGameSetCharacter') {
      const selfSeat = observedSeat(data);
      if (selfSeat === null) { if (draft) error = '无法确认自己的座位，已舍弃当前出框与战绩。'; reset(); notify(); return; }
      const selected = data.infos.filter(r => r.seat === selfSeat).map(r => r.id); if (!selected.length) return;
      // A per-seat candidate list only belongs to the seat it was dealt to.
      if (active?.perSeatCandidates && active.selfSeat !== selfSeat) {
        draft = null;
        active.frameId = null;
        active.position = active.figure = null;
      }
      const evidence = tableEvidence || data.mode;
      if (!active && !inTraining && canObserve(evidence)) active = { ...evidence, id: `${data.time}-${ctx.window.crypto?.randomUUID?.() || matches.length}`, time: data.time, selfSeat };
      if (!active) return;
      const rankSeats = data.infos.map(r => r.seat);
      if (rankedPosition(selfSeat, selfSeat, rankSeats) !== null) active.rankSeats = rankSeats;
      active.selected = ids(selected); active.selfSeat = selfSeat;
      const side = observedSide(data, selfSeat, active.mode);
      active.position=side?.position ?? active.position ?? null;active.figure=side?.figure ?? active.figure ?? null;
      if(draft)draft={...draft,seat:selfSeat,position:active.position,figure:active.figure};
      if (draft?.general.length) { draft = capture(draft, { type: 'select', selected }); if (!draft) { error = '选中武将不在候选中，已舍弃当前对局。'; active = null; notify(); return; } commit(); }
      else if (active.frameId) {
        const frame = records.find(row => row.id === active.frameId);
        if (frame && active.selected.every(id => frame.general.includes(id)))
          updateSavedFrame({ selected: active.selected, position: active.position, figure: active.figure });
      }
    } else if (type === 'MsgEnterGameStageNtf' || type === 'GsCFirstPhaseRole') {
      if (type === 'GsCFirstPhaseRole') firstSeat = validSeat(data.firstSeat);
      const selfSeat = observedSeat(data), side = observedSide(data, selfSeat, active?.mode);
      if(active && selfSeat===active.selfSeat){
        active.position = side?.position ?? active.position ?? null;active.figure = side?.figure ?? active.figure ?? null;
        if(draft)draft={...draft,seat:active.selfSeat,position:active.position,figure:active.figure};
        else if(active.frameId)updateSavedFrame({position:active.position,figure:active.figure});
      }
      commit();notify();
    }
  }
  sync(); names = generalNames(read(() => ctx.game.getConfigData('character')));
  ctx.native.observe({
    ClientGameRecordInfoRep: projectHistory,
    [RANKED_DETAIL_EVENT]: projectRankedDetail,
    ClientEnterpageRep: () => ({}), ClientTrainingRep: p => ({ result: field(p, 'Result') }),
    ClientSitdownRep: p => ({ result: field(p, 'Result'), rawMode: field(p, 'TypeID'), rawGroup: field(p, 'GroupID'), viewer: field(p, 'IsViewer'), seat: field(p, 'SeatID') }),
    GsCModifyUserseatNtf: p => {
      if (field(p, 'IsGameStart') !== true) return null;
      const infos = field(p, 'Infos');
      if (!Array.isArray(infos) || infos.length > 8) throw new Error('开局座位名单格式无效');
      return { infos: infos.map(r => ({ seat: validSeat(r.SeatID), account: String(r.ClientID) })) };
    },
    MsgGameDealCharacter: p => { const type = Number(field(p, 'Type')); return [1, 3, 9].includes(type) ? { type, general: ids(field(p, 'Datas')), time: Date.now(), mode: mode(), ...projectSeat(), viewer: viewer() } : null; },
    MsgGameDealCharacterPaiwei: p => {
      const table = field(p, 'randomHt');
      const candidates = [0, 1, 2, 3].map(seat => ids(read(() => table.get(seat).Datas) ?? []));
      return { type: 1, candidates, time: Date.now(), mode: mode(), ...projectSeat(), viewer: viewer() };
    },
    GsCFirstPhaseRole: p => ({ ...projectSeat(), firstSeat: field(p, 'SeatID') }),
    SmsgGameSetCharacter: p => { const infos = field(p, 'Infos'); if (!Array.isArray(infos) || infos.length > 32) throw new Error('选将确认格式无效');
      return { ...projectSeat(), infos: infos.map(r => ({ seat: r.SeatID, id: r.CharacterID })), mode: mode(), time: Date.now(), viewer: viewer() }; },
    MsgEnterGameStageNtf: projectSeat,
    MsgGameOver: p => { const seat = projectSeat(); return { ...projectSettlement(p, seat.selfSeat), accountSeat: seat.accountSeat, viewer: viewer() }; },
    ClientLeavetableRep: () => ({}), MsgReconnectGame: () => ({}), ClientLoginRep: () => ({}),
  }, accept, gap);
  async function refreshNames() {
    sync(); if (!who.id || loading || ctx.scope.signal.aborted) return;
    const expected = who.id, generation = epoch;
    nameAttempts++; nextNamesAt = Date.now() + 30000; loading = true; notify();
    try {
      const config = await ctx.game.loadConfigData('character');
      if (!ctx.scope.signal.aborted && ctx.native.account().id === expected && epoch === generation) {
        const next = generalNames(config);
        if (!Object.keys(next).length) throw new Error('武将名称配置为空');
        names = next; namesReady = true; namesError = '';
        if (matches.some(row => row.source === 'official-history' && !row.syncUnverified)) requestMatchSync();
      }
    } catch (e) { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected && epoch === generation) { namesError = String(e?.stack || e); notify(); } }
    finally { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected && epoch === generation) { loading = false; notify(); } }
  }
  const initialize = () => {
    sync();
    checkMatchBinding();
    if (syncRequested) void syncMatches();
    if (who.id && historyAccount !== who.id) { refreshHistory(); if (historyRequest) historyAccount = who.id; }
    if (who.id && !namesReady && !loading && nameAttempts < 3 && Date.now() >= nextNamesAt) void refreshNames();
  };
  ctx.scope.timeout(initialize, 0); ctx.scope.interval(initialize, 500);
  if (transport?.localBackup) {
    ctx.scope.interval(requestMatchSync, 60000);
    ctx.scope.listen(ctx.window, BACKUP_RESTORED, requestMatchSync);
    ctx.scope.listen(ctx.window, SYNC_HISTORY_UPDATED, event => {
      if (event.detail?.includes('matches')) requestMatchSync();
    });
  }
  ctx.scope.add(() => { listeners.clear(); reset(); resetMatchSync(); pending = null; epoch++; });
  return {
    view() { sync(); return { who, records, matches, startedAt, gaps, draft, error: error || namesError, captureNotice, captureDetail, canRetrySave: saveFailed || Boolean(pending) || reviewFailed, historyStatus, historyLoading: Boolean(historyRequest), names, loading, storageBlocked, discardedBaisheng, reviewing: reviewing || reviewFailed, restoring, canSyncMatches, syncBound: Boolean(bindingKey()), syncStatus, syncLoading: Boolean(syncWork) }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refreshNames, refreshHistory,
    syncVerifiedMatches() { sync(); requestMatchSync(); },
    dismissCaptureNotice() { captureNotice = captureDetail = ''; notify(); },
    async restore(file) { sync(); if (!who.id || restoring || reviewing || storageBlocked) return; const expected = who.id; restoring = true; notify();
      try {
        if (file.size > 32 * 1024 * 1024) throw new Error('备份超过32MiB上限');
        const value = JSON.parse(await file.text());
        if (ctx.scope.signal.aborted || ctx.native.account().id !== expected) return;
        if (value.format !== BACKUP_FORMAT || value.schema !== 1 || String(value.accountId) !== expected) throw new Error('只接受当前账号的出框与胜率统计工具箱备份');
        const incoming = validateRows(value.records), battles = validateRows(value.matches || [], true);
        const merge = (old, added, battle = false) => { const map = new Map(old.map(r => [r.id, r])); for (const r of added) {
          const current = map.get(r.id);
          if (current) {
            const contents = row => JSON.stringify(row, (key, value) => key === 'syncUnverified' ? undefined : value);
            if (contents(current) !== contents(r)) throw new Error('备份存在同ID内容冲突，未导入');
          } else map.set(r.id, battle && r.source === 'official-history' ? { ...r, syncUnverified: true } : r);
        }
          if (map.size > RECORD_LIMIT) throw new Error('恢复后超过10000条上限，未导入'); return [...map.values()]; };
        const cleaned=knownSides(merge(records, incoming),merge(matches, battles, true));
        const next=cleaned.records,nextMatches=cleaned.matches;
        if (save(next, nextMatches)) { records = next; matches = nextMatches; error = ''; if (records.some(needsModeReview)) await repair(expected, epoch); }
      } catch (e) { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected) fail(e); }
      finally { if (!ctx.scope.signal.aborted && ctx.native.account().id === expected) { restoring = false; notify(); } }
    },
    clear() { sync(); if (!who.id || reviewing || restoring) return;
      historyRequest = rankedHistory = null; historyStatus = '';
      const before = { blocked: storageBlocked, startedAt, gaps }; storageBlocked = false; startedAt = Date.now(); gaps = 0;
      if (save([], [])) { records = []; matches = []; reset(); resetMatchSync(); pending = null; lastSaved = null; error = ''; }
      else { storageBlocked = before.blocked; startedAt = before.startedAt; gaps = before.gaps; } notify(); },
    retry() { sync(); if (reviewFailed) { error = ''; void repair(who.id, epoch); return; }
      if (pending) { if (save(pending.records, pending.matches)) { records = pending.records; matches = pending.matches; pending = null; error = ''; } }
      else if (save()) { error = ''; commit(); } notify(); },
  };
}
