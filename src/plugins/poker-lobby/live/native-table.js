import { ResourceScope } from '../../../core/resources.js';
import { findNativeListenerOwner } from '../../../shared/native-manager.js';
import { isPokerReplayActive } from '../../../shared/poker-replay-mode.js';
import { POKER_TABLE_SCENE } from '../../../shared/poker-table-mode.js';
import { read } from '../../../shared/safe-read.js';
import { isPokerTableId, POKER_MODE as MODE, POKER_SECTION as SECTION } from '../poker-room.js';
import { pokerDisplayNames } from '../poker-presentation.js';
import { pokerSkill } from '../poker-skills.js';
import { openClassicPokerScene } from './classic-scene.js';
import { createPokerTableState } from './table-state.js';
import { mountPokerTableView } from './table-view.js';
import { createPokerTransport } from './transport.js';

const SIT = 'ClientSitdownRep';
const START = 'GsCModifyUserseatNtf';
const RECONNECT = 'CsClientReconnectinfoNtf';
const TABLE_INFO = 'ClientTableinfoRep';
const SNAPSHOT = 'decodeMsgGameSnap';
const SETTLEMENT_WAIT_MS = 6000;
const LEAVE_WAIT_MS = 5000;
const liveOpeners = new WeakMap();
const ACTIONS = { play: 'play', pass: 'pass', general: 'selectGeneral', 'general-preview': 'preselectGeneral', bid: 'bid',
  skill: 'activateSkill', 'skill-choice': 'submitSkillChoice' };

function getRouter(game) {
  return findNativeListenerOwner(game.getDispatcher(), ['SWITCH_SCENE'], caller =>
    typeof caller?.SwitchScene === 'function' && 'CurrentScene' in caller);
}

function getRoom(proxy) {
  return findNativeListenerOwner(proxy, [START], caller =>
    typeof caller?.ServerProxy_StartGame === 'function' && caller.proxy === proxy);
}

function getSession(ctx, proxy) {
  const account = ctx.native.account();
  return account.id && proxy?.ConnectedSucess1 === true
    ? { account: account.id, nickname: account.nickname, proxy, connection: proxy.ConnId }
    : null;
}

function sameSession(ctx, match) {
  return !ctx.scope.closed && ctx.native.account().id === match.account
    && ctx.game.getServerProxy() === match.proxy && match.proxy.ConnectedSucess1 === true
    && match.proxy.ConnId === match.connection;
}

function compatibleMode(mode, section) {
  return (mode == null || mode <= 0 || mode === MODE) && (section == null || section < 0 || section === SECTION);
}

function verifyTable(ctx, room, proxy, ticket, allowRoomId) {
  const tableId = room?.TableId;
  if (!Number.isSafeInteger(tableId) || tableId <= 0) return null;
  const session = getSession(ctx, proxy);
  if (!session) return null;
  const gameContext = ctx.game.getClass?.('GameContext');
  if (gameContext?.IsViewer || gameContext?.IsViewerOrReplay?.()) return null;
  const mode = gameContext?.GetModeType?.(), section = gameContext?.GetGroupID?.();
  if (!compatibleMode(mode, section)) return null;
  const seated = ticket?.tableId === tableId && sameSession(ctx, ticket) ? ticket : null;
  if (seated && (seated.viewer || !compatibleMode(seated.mode, seated.section))) return null;
  if (!(mode === MODE && section === SECTION) && !(seated?.mode === MODE && seated.section === SECTION)
    && !(allowRoomId && isPokerTableId(tableId))) {
    return null;
  }
  return { ...session, tableId };
}

function readStart(ctx, ticket, data, proxy) {
  if (data?.Id !== 21208 || data.IsGameStart !== true || !Array.isArray(data.Infos) || data.Infos.length !== 3) return null;
  const room = getRoom(proxy);
  // Classic can already have the real room and start notification even when
  // the standalone sit-down acknowledgement was absent from this session.
  const identity = verifyTable(ctx, room, proxy, ticket, true);
  if (!identity) return null;
  const players = data.Infos.map(row => ({ id: row.SeatID, clientId: row.ClientID }));
  if (players.some(row => !Number.isInteger(row.id) || row.id < 0 || row.id > 7
    || !Number.isSafeInteger(row.clientId) || row.clientId <= 0)
    || new Set(players.map(row => row.id)).size !== 3 || new Set(players.map(row => row.clientId)).size !== 3) return null;
  const own = players.find(row => String(row.clientId) === identity.account);
  if (!own || read(() => room.GetTableSeatInfoByUserId(own.clientId)?.IsViewer) === true) return null;
  const seats = players.map(({ id, clientId }) => {
    const info = read(() => room.GetTableSeatInfoByUserId(clientId)?.SeatPlayerInfo);
    return { id, clientId, name: String(info?.Nickname || (id === own.id && identity.nickname) || `${id + 1}号座`).slice(0, 64) };
  });
  return { ...identity, room, selfSeat: own.id, seats };
}

function openTable(ctx, origin, match, onLeave, onFailure, fromSnapshot, notBefore) {
  const scope = new ResourceScope();
  const fail = error => {
    if (scope.closed) return;
    scope.dispose();
    onFailure(match, error);
  };

  try {
    const names = pokerDisplayNames(ctx.game, match.seats, id => pokerSkill(ctx, id));
    const state = createPokerTableState(match, names);
    let scene, transport, view, settlement, renderQueued = false;
    let waitingForResult = false, canLeaveWithoutResult = false, serverEnded = false;
    let surrendered = false;
    let started = match.room.IsGameStart === true, closedAt;
    const roomLeft = () => match.room.TableId === 0;
    const waitForClosedResult = () => {
      if (!roomLeft() || !started || state.leaving) return false;
      closedAt ??= Date.now();
      return Date.now() - closedAt < SETTLEMENT_WAIT_MS;
    };
    const active = () => !scope.closed && !scene?.destroyed && sameSession(ctx, match)
      && (match.room.TableId === match.tableId || roomLeft() && (settlement || surrendered || waitForClosedResult()));
    const canLeave = () => active() && (settlement || canLeaveWithoutResult)
      && (roomLeft() || typeof match.room.SendLeaveTable === 'function');
    const canAct = () => active() && !state.leaving;
    const canEscape = () => canAct() && !serverEnded && !surrendered && !transport?.isLandlord()
      && match.room.TableId === match.tableId
      && match.room.IsGameStart === true && typeof match.room.SendLeaveTable === 'function'
      && typeof scene?.leaveGameHandler2 === 'function' && typeof scene.leaveGameHandler === 'function';
    const render = () => {
      if (active() && view) {
        const snapshot = state.view();
        try { view.render({ ...snapshot, settlement, playEntrySound: started && !fromSnapshot && !snapshot.ended,
          canLeave: !snapshot.leaving && canLeave() }); }
        catch (error) { fail(error); }
      }
    };
    const schedule = () => {
      if (renderQueued) return;
      renderQueued = true;
      scope.timeout(() => { renderQueued = false; render(); }, 0);
    };
    void names.loadSkills(scope.signal)?.then(() => { if (active()) schedule(); });
    function submit(kind, value) {
      if (!active() || !transport || match.room.IsGameStart !== true) return false;
      const action = state.begin(kind, value);
      if (!action) { render(); return false; }
      let sent = false;
      try { sent = transport[ACTIONS[action.kind]]?.(action.ids ?? action.value, action.wildRanks) === true; }
      catch { /* Keep the hand selected if native transport became unavailable. */ }
      finally {
        if (!sent) state.sendFailed(action);
        render();
      }
      return sent;
    }
    function leave({ escape = false } = {}) {
      if (escape ? !canEscape() : !canLeave()) return;
      if (!state.beginLeave({ escape, afterResultTimeout: canLeaveWithoutResult })) return;
      if (roomLeft()) { onLeave(); return; }
      try {
        match.room.SetChangeTableValue?.(false);
        if (escape) match.room.SendLeaveTable(1, true);
        else match.room.SendLeaveTable();
      } catch { /* Keep the table open until the room closes or the attempt times out. */ }
      if (scope.closed) return;
      if (roomLeft()) { onLeave(); return; }
      scope.timeout(() => {
        if (!active()) return;
        if (!escape) {
          // Settled tables can use the stock no-reply cleanup after a timeout.
          if (!roomLeft()) read(() => match.room.clientLeavetableRep?.());
          if (!scope.closed && match.room.TableId === match.tableId && (settlement || serverEnded)) {
            read(() => match.room.ForceResetRoomState?.());
          }
        }
        if (scope.closed) return;
        if (roomLeft()) { onLeave(); return; }
        state.leaveFailed();
        render();
      }, LEAVE_WAIT_MS);
      render();
    }
    function waitForResult() {
      if (waitingForResult || settlement) return;
      waitingForResult = true;
      scope.timeout(() => {
        if (settlement || !active()) return;
        if (!serverEnded && !surrendered && match.room.IsGameStart === true) {
          waitingForResult = false;
          return;
        }
        if (surrendered) {
          // The server confirmed the surrender. Present the defeat even if it
          // did not send the separate reward packet before the room closed.
          const own = { seat_id: match.selfSeat, figure: 1, result: 1 };
          settlement = { raw: { gamemodel: 47, label_model: MODE, section: SECTION, table_id: match.tableId,
            playercnt: 1, game_results: [own] }, beans: null };
          state.receive('end', { settled: true, player: { seat: match.selfSeat, result: 1, role: 1 } });
          schedule();
          return;
        }
        if (!serverEnded) state.receive('end');
        canLeaveWithoutResult = true;
        leave();
      }, SETTLEMENT_WAIT_MS);
    }
    function leaveCompleted() {
      if (roomLeft()) {
        if (state.leaving) return true;
        return settlement ? Boolean(view && !renderQueued && !view.hasSettlementWindow())
          : !surrendered && !waitForClosedResult();
      }
      if (match.room.TableId !== match.tableId) return false;
      closedAt = undefined;
      if (match.room.IsGameStart === true) started = true;
      else if (started) waitForResult();
      return false;
    }
    if (typeof match.room.on === 'function' && typeof match.room.off === 'function') {
      const leaveEvent = match.room.constructor?.LEAVE_TABLE_EVENT || 'LEAVE_TABLE_EVENT';
      const left = () => {
        if (!roomLeft() || !sameSession(ctx, match)) return;
        if (leaveCompleted()) onLeave();
        else schedule();
      };
      match.room.on(leaveEvent, scope, left);
      scope.add(() => match.room.off(leaveEvent, scope, left));
    }
    transport = createPokerTransport(ctx, scope, match, (type, data) => {
      if (!active()) return;
      if (type === 'start') started = true;
      if (type === 'surrender' && data.accepted) {
        surrendered = true;
        waitForResult();
      }
      if (type === 'end') {
        serverEnded = true;
        if (data.settled) settlement ??= data.settlement;
        else waitForResult();
      }
      state.receive(type, data);
      schedule();
    }, { acceptsLateResult: waitForClosedResult, knowsHandCard: state.knowsHandCard });
    if (!transport) state.receive('unavailable');
    scene = openClassicPokerScene(ctx, scope, origin, match, active, mounted => {
      scene = mounted;
      view = mountPokerTableView(ctx, scope, mounted, names, {
        toggleCard: id => { if (active() && state.toggleCard(id)) render(); },
        play: () => submit('play'),
        pass: () => submit('pass'),
        hint: () => { if (canAct() && transport?.requestHint()) render(); },
        isTableSpeaker: name => active() && match.seats.filter(seat => seat.name === name).length === 1,
        choose: id => submit('choose', id),
        toggleChoiceCard: id => { if (active() && state.toggleChoiceCard(id)) render(); },
        giveCard: id => submit('give-card', id),
        confirmChoice: () => submit('confirm'),
        cancelChoice: () => submit('cancel'),
        activateSkill: id => submit('skill', id),
        getCountdown: () => transport?.countdown(),
        tableId: match.tableId,
        canSwapGeneral: id => canAct() && transport?.canSwapGeneral(id) === true,
        canUseTableActions: () => canAct() && transport?.canUseTableActions() === true,
        canSurrender: () => canAct() && transport?.canSurrender() === true,
        surrender: () => { if (canAct() && transport?.surrender()) render(); },
        isCurrentTable: () => canAct() && match.room.TableId === match.tableId,
        toggleTrustee: () => { if (canAct() && transport?.toggleTrustee()) render(); },
        canEscape,
        escape: () => leave({ escape: true }),
        leave,
      });
      render();
      read(() => mounted.ged.HideGameStartLoading?.());
    }, fail, notBefore);
    if (scope.closed) return null;
    // The native game scene normally releases incoming game packets on AnimateIn.
    // Subscribe first and let the native start event finish before draining them.
    if (!fromSnapshot && match.proxy.CacheStarted === true) scope.timeout(() => {
      if (active() && match.proxy.CacheStarted === true) match.proxy.StopCache?.();
    }, 0);
    return { match, origin, active, visible: () => active() && Boolean(scene?.parent && view),
      leaveCompleted,
      close: () => scope.dispose() };
  } catch (error) {
    fail(error);
    return null;
  }
}

export function openPokerLiveTable(ctx, { force = false } = {}) {
  return liveOpeners.get(ctx)?.open(force) === true;
}

export function canSwitchPokerLiveTable(ctx) {
  return liveOpeners.get(ctx)?.canSwitch() === true;
}

export function isPokerLiveTableOpen(ctx) {
  return liveOpeners.get(ctx)?.isOpen() === true;
}

export function installPokerLiveTable(ctx, lobby) {
  const { game, scope } = ctx;
  let proxy, router, proxyRelease, routerRelease, ticket, starting, table, binding = false;
  let room, roomRelease, previousMatch, reconnect, failedMatch, pokerSeats;

  function closeTable() {
    const previous = table;
    table = null;
    previous?.close();
  }

  function clearPokerSeats() {
    const seats = pokerSeats?.models;
    pokerSeats = null;
    // The classic factory reuses the shared seat array across modes. The borrowed
    // scene skips stock teardown, which normally discards this array.
    if (seats?.every(seat => typeof seat?.DealPoker === 'function')) seats.length = 0;
  }

  function forgetTable() {
    previousMatch = reconnect = failedMatch = null;
    closeTable();
    clearPokerSeats();
  }

  function roomHasClosed() {
    const match = table?.match;
    return match?.room.TableId === 0 && sameSession(ctx, match);
  }

  function resumeSession() {
    if (!previousMatch) return null;
    const session = getSession(ctx, proxy);
    return session?.account === previousMatch.account
      && (session.proxy !== previousMatch.proxy || session.connection !== previousMatch.connection) ? session : null;
  }

  function readResume() {
    const session = resumeSession();
    if (!session) return null;
    const room = getRoom(proxy);
    const current = game.getClass?.('GameContext');
    if (!room || room.TableId !== previousMatch.tableId || room.IsGameStart !== true
      || room.IsForbidInPC?.(MODE, SECTION, false) === true
      || current?.GetModeType?.() !== MODE || current?.GetGroupID?.() !== SECTION
      || current.IsViewer || current.IsViewerOrReplay?.()) return null;
    const self = room.GetTableSeatInfoByUserId(session.account);
    if (String(self?.ClientId) !== session.account || self?.SeatID !== previousMatch.selfSeat || self?.IsViewer) return null;
    return { ...previousMatch, ...session, room };
  }

  function getOrigin() {
    const origin = router?.CurrentScene || game.getScene?.();
    const layer = origin?.parent;
    if (!ctx.window.Laya?.Sprite || !layer?.addChild || (layer.name !== 'SceneLayer' && layer.layerOrder !== 2)
      || origin.destroyed || game.isReplay?.(origin) || isPokerReplayActive(ctx.document)
      || origin.SelfSeatUi || game.getClass?.(POKER_TABLE_SCENE)) return null;
    return origin;
  }

  function buildLiveMatch(requireStarted = true) {
    const currentProxy = game.getServerProxy?.();
    const room = currentProxy && getRoom(currentProxy);
    if (!room || (requireStarted && room.IsGameStart !== true)
      || typeof room.GetTableSeatInfoByUserId !== 'function') return null;
    const session = verifyTable(ctx, room, currentProxy, ticket, room.IsGameStart === true);
    if (!session) return null;
    const self = read(() => room.GetTableSeatInfoByUserId(session.account));
    if (String(self?.ClientId) !== session.account || self.IsViewer || !Number.isInteger(self.SeatID)) return null;
    const rows = read(() => room.TabbleSeatInfos?.datum) || [];
    const seats = rows.filter(row => row && !row.IsViewer && Number.isInteger(row.SeatID)
      && row.SeatID >= 0 && row.SeatID <= 7 && Number.isSafeInteger(Number(row.ClientId)) && Number(row.ClientId) > 0)
      .map(row => ({ id: row.SeatID, clientId: Number(row.ClientId),
        name: String(row.SeatPlayerInfo?.Nickname || `${row.SeatID + 1}号座`).slice(0, 64) }));
    if (seats.length !== 3 || new Set(seats.map(row => row.id)).size !== 3
      || new Set(seats.map(row => row.clientId)).size !== 3
      || !seats.some(row => row.id === self.SeatID && String(row.clientId) === session.account)) return null;
    return { ...session, room, selfSeat: self.SeatID, seats };
  }

  function autoAttach(force = false) {
    if (table?.active()) return true;
    if (force) failedMatch = null;
    const match = read(() => buildLiveMatch(!force));
    return match ? attach(match, false, force) : false;
  }

  function attach(match, fromSnapshot = false, force = false) {
    if (!match || !sameSession(ctx, match) || match.room.TableId !== match.tableId) return false;
    if (failedMatch?.tableId === match.tableId && sameSession(ctx, failedMatch)) return false;
    if (!force && match.room.IsGameStart !== true) return false;
    const origin = getOrigin();
    if (!origin) return false;
    if (table?.match.tableId === match.tableId && table.active()
      && table.match.selfSeat === match.selfSeat && table.match.seats.every(seat =>
        match.seats.some(other => other.id === seat.id && other.clientId === seat.clientId))) return true;
    closeTable();
    const visit = lobby?.captureTableOrigin(origin, match);
    const notBefore = fromSnapshot || force ? 0 : lobby?.matchSuccessDeadline(visit, match.tableId);
    const left = () => {
      forgetTable();
      lobby?.restoreAfterTable(visit);
    };
    table = openTable(ctx, origin, match, left, (failed, error) => {
      failedMatch = failed;
      if (ctx.core?.distribution === 'dev') ctx.window.console?.warn('三国斗地主原生牌桌', error);
      ctx.notify(`三国斗地主牌桌创建失败：${error?.message || String(error)}`);
    }, fromSnapshot, notBefore);
    if (!table) return false;
    table.lobbyVisit = visit;
    previousMatch = match;
    reconnect = null;
    return true;
  }

  function bind() {
    if (previousMatch && previousMatch.account !== ctx.native.account().id) forgetTable();
    if (table && (!table.active() || table.leaveCompleted())) {
      const left = roomHasClosed();
      const visit = left && table.lobbyVisit;
      if (left) forgetTable();
      else closeTable();
      if (visit) lobby.restoreAfterTable(visit);
    }
    const nextProxy = game.getServerProxy?.();
    if (nextProxy !== proxy) {
      proxyRelease?.();
      closeTable();
      proxy = nextProxy;
      ticket = starting = reconnect = null;
      if (typeof proxy?.event === 'function' && !game.getClass?.(POKER_TABLE_SCENE)) {
        proxyRelease = scope.patch(proxy, 'event', original => function (type, packet, ...rest) {
          if (this !== proxy) return original.call(this, type, packet, ...rest);
          const data = packet?.Protocol;
          if (type === SIT && data?.Result === 1) {
            forgetTable();
            const session = getSession(ctx, proxy);
            ticket = session && Number.isSafeInteger(data.TableID) && data.TableID > 0
              ? { ...session, tableId: data.TableID, mode: data.RealModel, section: data.GroupID, viewer: data.IsViewer === true }
              : null;
          }
          if (type === START) {
            const previous = starting;
            starting = read(() => readStart(ctx, ticket, data, proxy));
            try { return original.call(this, type, packet, ...rest); }
            finally { starting = previous; }
          }
          if (type === RECONNECT && data?.Id === 21114) {
            reconnect = data.TypeID === MODE && data.GroupID === SECTION
              && data.TableID === previousMatch?.tableId ? read(resumeSession) : null;
          }
          if (type === SNAPSHOT && data?.Id === 201035) read(() => {
            const base = (data.Data?.ProtoObj ?? data.ProtoObj)?.base_data;
            if (base && previousMatch && base.table_id === previousMatch.tableId && base.model_id === MODE && base.sec_id === SECTION) {
              // Subscribe before native dispatch so the newly mounted transport receives this snapshot.
              attach(readResume(), true);
            }
          });
          const tableInfo = type === TABLE_INFO && data?.Id === 20508 && data.Type === 3 && reconnect;
          // The native room consumes Infos and retains earlier seats absent from this reply.
          const tableInfoOk = tableInfo && data.Result === 1 && Array.isArray(data.Infos) && read(() =>
            data.Infos.some(row => String(row?.ClientId) === tableInfo.account
              && row.SeatID === previousMatch?.selfSeat && !row.IsViewer));
          if (tableInfo) reconnect = null;
          const result = original.call(this, type, packet, ...rest);
          // Reconnect room info bypasses the cache. Validate the native roster after the reply
          // has been processed, then let the native proxy drain its queued snapshot.
          if (tableInfoOk) scope.timeout(() => read(() => {
            if (!table?.active() && sameSession(ctx, tableInfo) && readResume() && getOrigin()
              && proxy.CacheStarted === true) proxy.StopCache?.();
          }), 0);
          return result;
        });
      }
    }

    const nextRoom = proxy && read(() => getRoom(proxy));
    if (nextRoom !== room) {
      roomRelease?.();
      room = nextRoom;
      if (typeof room?.createPlayerSeat === 'function' && !game.getClass?.(POKER_TABLE_SCENE)) {
        roomRelease = scope.patch(room, 'createPlayerSeat', original => function (...args) {
          if (pokerSeats) {
            const mode = read(() => game.getClass?.('GameContext')?.GetModeType?.());
            if (this !== pokerSeats.room || this.TableId !== pokerSeats.tableId || (mode > 0 && mode !== MODE)) {
              clearPokerSeats();
            }
          }
          const models = original.apply(this, args);
          if (starting?.room === this) starting.seatModels = models;
          if (Array.isArray(models) && typeof models[0]?.DealPoker === 'function') {
            pokerSeats = { room: this, tableId: this.TableId, models };
          }
          return models;
        });
      }
    }

    const nextRouter = getRouter(game);
    if (nextRouter === router) return;
    routerRelease?.();
    router = nextRouter;
    if (!router || game.getClass?.(POKER_TABLE_SCENE)) return;
    routerRelease = scope.patch(router, 'SwitchScene', original => function (name, ...args) {
      if (this !== router) return original.call(this, name, ...args);
      if (name !== POKER_TABLE_SCENE) {
        const origin = table?.origin;
        if (origin && origin === router.CurrentScene && name === origin.SceneName && !args[1]) {
          if (!roomHasClosed()) return original.call(this, name, ...args);
          if (table.active() && !table.leaveCompleted()) return;
        }
        const visit = table?.lobbyVisit;
        forgetTable();
        const result = original.call(this, name, ...args);
        if (visit && name === visit.scene.SceneName) {
          const expected = [router.NextScene, router.CurrentScene].find(scene => scene?.SceneName === name && !scene.destroyed);
          lobby.restoreAfterTable(visit, expected);
        }
        return result;
      }
      if (!attach(starting)) return original.call(this, name, ...args);
    });
  }

  scope.add(forgetTable);
  const liveApi = {
    open: autoAttach,
    canSwitch: () => !table?.active() && Boolean(read(() => getOrigin() && buildLiveMatch(false))),
    isOpen: () => table?.visible() === true,
  };
  liveOpeners.set(ctx, liveApi);
  scope.add(() => { if (liveOpeners.get(ctx) === liveApi) liveOpeners.delete(ctx); });
  if (ctx.core?.distribution === 'dev') {
    const switchGlobal = () => autoAttach(true);
    try { ctx.window.__SGS_POKER_LIVE_SWITCH__ = switchGlobal; } catch { /* Ignore a locked window. */ }
    scope.add(() => {
      try { if (ctx.window.__SGS_POKER_LIVE_SWITCH__ === switchGlobal) delete ctx.window.__SGS_POKER_LIVE_SWITCH__; } catch { /* Ignore. */ }
    });
  }
  const refresh = () => {
    if (scope.closed || binding) return;
    binding = true;
    try { read(bind); autoAttach(); }
    finally { binding = false; }
  };
  scope.add(game.onSceneChange?.(refresh));
  scope.interval(refresh, 500);
  refresh();
}
