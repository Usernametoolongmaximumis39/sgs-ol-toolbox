// Read-only client adapter. Field paths checked against upstream 1.6.76 and
// 95chong 1.0.51. Never call ClassUtils.getInstance/new window constructors.
import { createConfigData } from './config-data.js';
import { createGameAssetDownloads } from './mobile-skin-download.js';
import { cardFrameName } from './card-atlas.js';
import { nativeSeat, nativeSeatId, nativeSeatOccupied, nativeSeatPosition } from './seat.js';
import { isPokerReplayActive } from '../shared/poker-replay-mode.js';
import { isNativePokerTable } from '../shared/poker-table-mode.js';
const GAME_SCENE = /(?:^|\.)(?:GameScene|TableScene|HallScene)$/;
const STARTUP_SCENE = /(?:^|\.)(?:LoginScene|CreateUserScene|CreateRoleScene|MainNullScene|LoadingScene)$/;
const read = fn => { try { return fn(); } catch { return undefined; } };
const object = value => value && (typeof value === 'object' || typeof value === 'function') ? value : null;
const alive = value => Boolean(object(value) && read(() => value.destroyed) !== true);
const children = node => Array.isArray(read(() => node._children)) ? node._children : [];
function list(value) {
  if (Array.isArray(value)) return value;
  if (!object(value)) return [];
  if (typeof value.values === 'function') return read(() => [...value.values()]) || [];
  return read(() => Object.values(value)) || [];
}
function number(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const result = Number(value);
    if (Number.isFinite(result)) return result;
  }
  return undefined;
}
function cardId(card) {
  if (typeof card === 'number' || typeof card === 'string') return number(card);
  return number(read(() => card.CardId), read(() => card.CardID), read(() => card.ID), read(() => card.Id), read(() => card.id), read(() => card.cardId), read(() => card.cardID));
}
function cardIds(cards) { return [...new Set(list(cards).map(cardId).filter(id => Number.isInteger(id) && id > 0))]; }
export function projectDeckCardMeta(value) {
  if (!value || value.unknown) return null;
  const suit = Number(value.suit), number = Number(value.number), type = Number(value.type);
  if (!(suit >= 1 && suit <= 4 && number >= 1 && number <= 13)) return null;
  return { suit, number, type: Number.isInteger(type) ? type : 0 };
}
function publicHandIds(seat, ui) {
  const shown = [], cached = [], hidden = new Set();
  // Only the client's explicit public-hand fields are observations. Do not read
  // opponents' HandCards, and do not enumerate arbitrary UI/model properties.
  for (const owner of [seat, ui]) for (const key of ['HandShowCards', 'handShowCards', 'HandShowCardIDs', 'handShowCardIDs']) {
    const values = read(() => owner[key]);
    if (!Array.isArray(values)) continue;
    const length = read(() => values.length);
    if (!Number.isInteger(length) || length < 0) continue;
    const target = key.endsWith('IDs') ? cached : shown;
    for (let i = 0; i < length && i < 2048; i++) {
      const value = read(() => values[i]);
      const card = object(read(() => value.Card)) || object(read(() => value.card)) || object(read(() => value.cardInfo)) || value;
      const id = cardId(card);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (read(() => value.IsHide) === true || read(() => value.isHide) === true
          || read(() => card.IsHide) === true || read(() => card.isHide) === true) hidden.add(id);
      else target.push(id);
    }
  }
  // Populated card UIs take precedence over an often-empty (or stale) ID cache.
  return [...new Set((shown.length ? shown : cached).filter(id => !hidden.has(id)))];
}
function sceneName(scene) {
  return String(read(() => scene.SceneName) || read(() => scene.sceneName) || read(() => scene.name)
    || (read(() => scene.constructor.name) !== 'Object' ? read(() => scene.constructor.name) : '') || '');
}
function isGameScene(scene) {
  return alive(scene) && Boolean(isNativePokerTable(scene) || read(() => scene.SelfSeatUi) || read(() => scene.selfSeatUI)
    || read(() => scene.seatContainer.seatUIs) || sceneName(scene) === 'GameScene');
}
function isReplayScene(scene) {
  // Resume means reconnect, not replay. Require explicit replay evidence.
  return Boolean(read(() => scene?.IsReplay) || read(() => scene?.isReplay) || alive(read(() => scene?.replayBar)));
}

export function createGameAdapter(win, scope, mobileSkinPort, { watchScene = true } = {}) {
  const configs = scope ? createConfigData(win, scope) : null;
  let selfClass = null, selfSearchAt = -Infinity;
  let current = null, stage = null, dispatcher = null, dispatcherOwner = null;
  let providers = new Set();
  let definitionTables = new WeakMap();
  let deckDefinitions = null;
  let sceneCycle = null;
  const listeners = new Set();

  function walk(predicate, root = read(() => win.Laya.stage)) {
    const limit = 4000;
    const queue = root ? [root] : [], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (!alive(item) || seen.has(item)) continue;
      seen.add(item);
      if (read(() => predicate(item))) return item;
      const nodes = children(item);
      for (let j = 0; j < nodes.length && queue.length < limit; j++) queue.push(nodes[j]);
    }
    return null;
  }

  function getDispatcher() {
    if (sceneCycle && 'dispatcher' in sceneCycle) return sceneCycle.dispatcher;
    if (!alive(dispatcher) || !alive(dispatcherOwner)) {
      dispatcher = dispatcherOwner = null;
      walk(node => {
        // Read ged on existing UI objects, never a fabricated PopUpWindow.
        const candidate = read(() => node.ged);
        if (alive(candidate) && object(read(() => candidate._events))) {
          dispatcher = candidate; dispatcherOwner = node; return true;
        }
        if (read(() => node._events.SWITCH_SCENE) || read(() => node._events.HIDE_WINDOW)) {
          dispatcher = dispatcherOwner = node; return true;
        }
        return false;
      });
    }
    if (sceneCycle) sceneCycle.dispatcher = dispatcher;
    return dispatcher;
  }

  function eventCallerFrom(target, event, predicate) {
    const handlers = read(() => target._events[event]);
    for (const entry of Array.isArray(handlers) ? handlers : [handlers]) {
      const candidate = read(() => entry.caller);
      if (alive(candidate) && read(() => predicate(candidate))) return candidate;
    }
    return null;
  }

  function eventCaller(event, predicate) {
    return eventCallerFrom(getDispatcher(), event, predicate);
  }

  function stageScene() {
    if (sceneCycle && 'rendered' in sceneCycle) return sceneCycle.rendered;
    const layer = walk(node => node.name === 'SceneLayer' || node.layerOrder === 2);
    const scene = layer && (children(layer).filter(node => node !== layer && alive(node) && read(() => node.visible) !== false).at(-1) || null);
    if (sceneCycle) sceneCycle.rendered = scene;
    return scene;
  }

  function canReserveViewport() {
    const scene = stageScene();
    // SceneData and the scene name may exist before the native scene is mounted.
    // The startup and login scenes must complete using the native viewport.
    const name = read(() => scene.SceneName) || read(() => scene.sceneName);
    return typeof name === 'string' && name.length > 0 && !STARTUP_SCENE.test(name)
      && read(() => scene.initialized) !== false;
  }

  function getScene() {
    if (sceneCycle && 'scene' in sceneCycle) return sceneCycle.scene;
    const nextStage = read(() => win.Laya.stage) || null;
    if (stage !== nextStage) { stage = nextStage; dispatcher = dispatcherOwner = null; providers = new Set(); deckDefinitions = null; }
    const demo = read(() => win.__SGS_TOOLBOX_DEMO__.scene);
    const manager = demo ? null : eventCaller('SWITCH_SCENE', value => 'CurrentScene' in value);
    const managerScene = read(() => manager.CurrentScene);
    // The visible scene layer wins during transitions, including return to hall.
    const rendered = demo ? null : stageScene();
    const next = alive(demo) ? demo : rendered
      || (alive(managerScene) && read(() => managerScene.visible) !== false ? managerScene : null)
      || walk(node => read(() => node.visible) !== false && (GAME_SCENE.test(sceneName(node)) || isGameScene(node)));
    if (sceneCycle) sceneCycle.scene = next || null;
    if (next !== current) {
      current = next || null; providers = new Set(); dispatcher = dispatcherOwner = null; deckDefinitions = null;
      if (sceneCycle) delete sceneCycle.dispatcher;
      for (const fn of [...listeners]) { try { fn(current); } catch { /* Subscriber isolation. */ } }
    }
    return current;
  }

  function withSceneCycle(run) {
    if (sceneCycle) return run();
    sceneCycle = {};
    try { return run(); } finally { sceneCycle = null; }
  }

  const selfUI = scene => read(() => scene.SelfSeatUi) || read(() => scene.selfSeatUI) || null;
  const seats = scene => list(read(() => scene.seatContainer.seatUIs) || read(() => scene.seatUIs)).filter(ui => alive(ui) && nativeSeatOccupied(ui));
  const handUIs = ui => list(read(() => ui.cardContainer.cardUis) || read(() => ui.cardUis) || children(read(() => ui.cardContainer))).filter(alive);
  const model = ui => read(() => ui.Card) || read(() => ui.card) || read(() => ui.cardInfo) || read(() => ui.dataSource);
  const seatData = nativeSeat, seatId = nativeSeatId;

  function getClass(name) {
    if (typeof name !== 'string' || !name) return null;
    return object(read(() => win.Laya.ClassUtils.getClass(name))) || object(read(() => win[name]));
  }

  function getSelf() {
    const demo = read(() => win.__SGS_TOOLBOX_DEMO__.self);
    if (demo) return demo;
    const nativeClass = selfClass || getClass('UserData');
    const stored = nativeClass && read(() => Object.getOwnPropertyDescriptor(nativeClass, 'self'));
    if (stored && 'value' in stored) return object(stored.value);
    if (Date.now() - selfSearchAt < 1000) return null;
    selfSearchAt = Date.now();
    // Hall user UI / currency UI store NNt.Self in data or userData. Recover
    // its constructor, then read ONLY its stored static self, never another user.
    const inspectUserNode = node => {
      for (const key of ['userData', 'data']) {
        const descriptor = read(() => Object.getOwnPropertyDescriptor(node, key));
        const value = descriptor && 'value' in descriptor ? descriptor.value : null;
        if (!object(value) || !number(read(() => value.ClientId))) continue;
        const ctor = read(() => value.constructor), own = read(() => Object.getOwnPropertyDescriptor(ctor, 'self'));
        if (own && 'value' in own && object(own.value) && number(read(() => own.value.ClientId))) { selfClass = ctor; return true; }
      }
      return false;
    };
    // The current client's flat money UI is drawn by addDrawChild rather than
    // added to _children, so starting in a game needs this exact native path.
    if (!inspectUserNode(read(() => getScene().topMenu.moneyMenuUI))) walk(inspectUserNode);
    return selfClass ? object(read(() => Object.getOwnPropertyDescriptor(selfClass, 'self').value)) : null;
  }

  function getServerProxy() {
    const scene = getScene();
    const direct = read(() => scene.proxy) || read(() => scene.serverProxy);
    if (alive(direct)) return direct;
    // Existing HIDE_WINDOW caller is the WindowManager, which owns proxy.
    const manager = eventCaller('HIDE_WINDOW', value => object(value.proxy));
    return object(read(() => manager.proxy)) || existingSingleton('ServerProxy');
  }

  function existingSingleton(name) {
    const registered = getClass(name);
    if (!alive(registered)) return null;
    if (typeof registered !== 'function' && typeof read(() => registered.event) === 'function') return registered;
    // Inspect only already-stored singleton values. Calling Instance getters or
    // GetInstance can create managers/windows and is not an observation.
    for (const key of ['instance', 'Instance', 'I', '_instance', 's_instance']) {
      const descriptor = read(() => Object.getOwnPropertyDescriptor(registered, key));
      const candidate = descriptor && 'value' in descriptor ? descriptor.value : null;
      if (alive(candidate) && typeof read(() => candidate.event) === 'function') return candidate;
    }
    return null;
  }

  function getActivityManager(proxy = getServerProxy()) {
    // The client registers its existing ActivityManager as the caller for this
    // ServerProxy event (also used by the inspected 95chong message source).
    return eventCallerFrom(proxy, 'ClientJDInfoNtf', value => typeof value.event === 'function')
      || existingSingleton('ActivityManager');
  }

  function getMessageTargets() {
    const targets = [], seen = new Set(), proxy = getServerProxy();
    for (const [name, target] of [['ServerProxy', proxy], ['ActivityManager', getActivityManager(proxy)]]) {
      if (!alive(target) || typeof read(() => target.event) !== 'function' || seen.has(target)) continue;
      seen.add(target); targets.push({ name, target });
    }
    return targets;
  }

  function registerProviders(card) {
    let proto = object(card);
    const seen = new Set();
    for (let i = 0; proto && i < 8 && !seen.has(proto); i++) {
      seen.add(proto);
      const ctor = read(() => proto.constructor);
      if (typeof ctor === 'function' && typeof read(() => ctor.GetInstance) === 'function') providers.add(ctor);
      proto = read(() => Object.getPrototypeOf(proto));
    }
  }

  function* cardDefinitions() {
    // These are public card definitions, NOT the cards included in this game.
    // Never use the complete config table to initialize a session's deck.
    const containers = [read(() => win.CtrUtil.AllDatas), read(() => win.CtrUtil.allDatas),
      read(() => win.SystemContext.AllDatas), read(() => win.SystemContext.allDatas),
      read(() => win.__SGS_TOOLBOX_DEMO__.configs)];
    const tables = containers.map(data => read(() => data['sys_playcard.sgs']) || read(() => data.sys_playcard));
    tables.push(configs?.getConfigData('sys_playcard'));
    for (const config of tables) {
      const rows = read(() => config.GamePlayCards.card);
      if (!Array.isArray(rows)) continue;
      let index = definitionTables.get(rows);
      if (!index || index.length !== rows.length) {
        const abbreviations = new Map(list(read(() => config.abbreviation)).map(item => [read(() => item.Short), read(() => item.Long)]));
        const records = new Map();
        for (const row of rows) {
          if (!object(row)) continue;
          const record = {};
          for (const [key, value] of Object.entries(row)) record[abbreviations.get(key) || key] = value;
          const rowId = cardId(record);
          if (Number.isInteger(rowId) && rowId > 0) records.set(rowId, record);
        }
        index = { length: rows.length, records }; definitionTables.set(rows, index);
      }
      yield index;
    }
  }

  function getCardDefinition(id, definitions = cardDefinitions()) {
    for (const { records } of definitions) {
      const card = records.get(id);
      if (card) return card;
    }
    return null;
  }

  function getCardFaceCatalog() {
    for (const index of cardDefinitions()) {
      if (!index.faces) {
        const faces = new Map();
        for (const { res, name } of index.records.values()) {
          if (!cardFrameName(res) || typeof name !== 'string' || !name.trim() || faces.has(res)) continue;
          const label = name === '杀' ? ({ HuoSha: '火杀', LeiSha: '雷杀', BingSha: '冰杀' }[res] || name) : name;
          faces.set(res, Object.freeze({ res, label }));
        }
        index.faces = Object.freeze([...faces.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')));
      }
      if (index.faces.length) return index.faces;
    }
    return null;
  }

  async function loadCardFaceCatalog() {
    const existing = getCardFaceCatalog();
    if (existing) return existing;
    if (!configs) throw new Error('配置读取不可用');
    await configs.loadConfigData('sys_playcard');
    const catalog = getCardFaceCatalog();
    if (!catalog) throw new Error('游戏牌表中没有可换图的牌');
    return catalog;
  }

  function* ownCardModels(scene) {
    // Self hand models seed the definition provider; never read opponents'
    // hidden HandCards to obtain knowledge about their current hand.
    for (const item of handUIs(selfUI(scene))) {
      const observed = model(item);
      if (!observed) continue;
      registerProviders(observed);
      yield observed;
    }
  }

  function getProviderCard(id) {
    for (const provider of providers) {
      const candidate = read(() => provider.GetInstance(id));
      if (!object(candidate)) continue;
      const candidateId = cardId(candidate);
      if (candidateId === undefined || candidateId === id) return candidate;
    }
    return null;
  }

  function getCardName(card, definition) {
    return read(() => card?.CardName) || read(() => card?.cardName) || read(() => card?.Name) || read(() => card?.name)
      || read(() => definition?.CardName) || read(() => definition?.Name) || read(() => definition?.name);
  }

  function getCardProperties(card, definition) {
    return {
      suit: number(read(() => card?.FlowerOnSeat), read(() => card?.CardFlower), read(() => card?.Flower), read(() => card?.suit),
        read(() => definition?.color), read(() => definition?.CardSuit), read(() => definition?.suit)),
      number: number(read(() => card?.CardNumber), read(() => card?.Number), read(() => card?.number),
        read(() => definition?.number), read(() => definition?.CardNumber), read(() => definition?.Number)),
      type: number(read(() => card?.CardType), read(() => card?.Type), read(() => card?.type),
        read(() => definition?.type), read(() => definition?.CardType), read(() => definition?.Type)),
    };
  }

  function getCardMeta(id) {
    id = number(id);
    if (!Number.isInteger(id) || id <= 0) return { id, name: '未知牌', unknown: true };
    const scene = getScene(), demo = read(() => win.__SGS_TOOLBOX_DEMO__?.cards?.[id]);
    if (demo) return { ...demo, id };
    let card;
    for (const observed of ownCardModels(scene)) if (cardId(observed) === id) card = observed;
    card ||= getProviderCard(id);
    const definition = getCardDefinition(id);
    if (!card && !definition) return { id, name: `牌 #${id}`, unknown: true };
    const name = getCardName(card, definition);
    const cardClass = read(() => definition?.cardClass) || read(() => card?.cardInfo?.cardClass) || read(() => card?.cardClass)
      || read(() => card?.cardInfo?.Class) || read(() => card?.className) || read(() => card?.ClassName)
      || read(() => definition?.Class) || read(() => definition?.class) || read(() => definition?.className);
    const firstSkillId = number(read(() => card?.FirstSkillId));
    return {
      id, name: typeof name === 'string' && name ? name : `牌 #${id}`,
      ...getCardProperties(card, definition),
      unknown: !(typeof name === 'string' && name),
      ...(typeof cardClass === 'string' && cardClass ? { cardClass } : {}),
      ...(firstSkillId > 0 ? { firstSkillId } : {}),
    };
  }

  function getDeckCardMeta(ids, scene) {
    const demo = read(() => win.__SGS_TOOLBOX_DEMO__?.cards), ownCards = new Map();
    for (const card of ownCardModels(scene)) ownCards.set(cardId(card), card);
    const definitions = [...new Set(cardDefinitions())];
    // Public table indexes are replaced if a new table arrives. Live card
    // models can change even when the scene, deck and table stay the same.
    const stable = !demo && !providers.size && !ownCards.size && Object.isFrozen(ids);
    if (stable && deckDefinitions?.ids === ids && deckDefinitions.definitions.length === definitions.length
      && definitions.every((index, i) => index === deckDefinitions.definitions[i])) return deckDefinitions.metadata;
    const metadata = {};
    for (const id of ids) {
      const value = read(() => {
        const fixture = read(() => demo?.[id]);
        if (fixture) return projectDeckCardMeta(fixture);
        const card = ownCards.get(id) || getProviderCard(id), definition = getCardDefinition(id, definitions);
        const name = getCardName(card, definition);
        return typeof name === 'string' && name ? projectDeckCardMeta(getCardProperties(card, definition)) : null;
      });
      if (value) metadata[id] = stable ? Object.freeze(value) : value;
    }
    deckDefinitions = stable ? { ids, definitions, metadata: Object.freeze(metadata) } : null;
    return metadata;
  }

  function getCountdown() {
    const scene = getScene(), ui = selfUI(scene);
    const timer = read(() => ui.countdownTimer) || read(() => scene.countdownTimer);
    const value = alive(timer) ? number(read(() => timer.RemainValue)) : undefined;
    return value === undefined ? null : Math.max(0, value);
  }

  function getRemainingSlash() {
    const scene = getScene();
    if (!isGameScene(scene) || isNativePokerTable(scene)) return null;
    const seat = seatData(selfUI(scene));
    if (!seat || read(() => seat.IsDead) === true) return null;
    // Official DATA_CANNOT_USE_SHA (1): [used, limit, ..., ..., unlimited].
    // Same fields used by updateShaCnt / shaInfo.RefreshCount; no skill activation calls.
    const targets = read(() => seat.GetSeatState(1).Targets);
    const info = read(() => seat.shaInfo);
    if (read(() => info.Disabled) === true) return 0;
    if (read(() => info.NoLimit) === true || read(() => targets[4]) === 9999) return Infinity;
    if (targets && typeof targets.length === 'number') {
      const used = Number(targets[0] || 0), limit = Number(targets[1] || 1);
      return Number.isFinite(used) && Number.isFinite(limit) ? Math.max(0, limit - used) : null;
    }
    if (read(() => seat.ShaNoLimit) === true) return Infinity;
    const count = number(read(() => info.Count), read(() => seat.ShaCount));
    return count === undefined ? null : Math.max(0, count);
  }

  function getSnapshot(deckIds) {
    const scene = getScene(), self = selfUI(scene), selfSeatId = seatId(self);
    const selfSeat = read(() => self.cardContainer.seat) || seatData(self);
    const ownModels = read(() => selfSeat.HandCards) ?? read(() => selfSeat.handCards);
    const handCardIds = Array.isArray(ownModels) ? cardIds(ownModels) : cardIds(handUIs(self).map(model));
    const mode = read(() => getClass('GameContext').GetModeVO());
    const countdown = read(() => self.countdownTimer) || read(() => scene.countdownTimer);
    const remaining = alive(countdown) ? number(read(() => countdown.RemainValue)) : undefined;
    const snapshot = {
      sceneName: sceneName(scene), inGame: isGameScene(scene),
      modeId: number(read(() => scene.ModeID), read(() => scene.modeId), read(() => mode.ModeID), read(() => mode.Id), read(() => mode.id)),
      selfSeatId, handCardIds,
      emptySeatIds: list(read(() => scene.seatContainer.seatUIs) || read(() => scene.seatUIs))
        .filter(ui => alive(ui) && !nativeSeatOccupied(ui)).map(seatId).filter(id => id !== undefined),
      isReplay: isReplayScene(scene),
      ...(isNativePokerTable(scene) && { pokerTable: true }),
      ...(isPokerReplayActive(win.document) && { pokerReplay: true }),
      countdownRemaining: remaining === undefined ? null : Math.max(0, remaining),
      seats: seats(scene).map(ui => {
        const seat = seatData(ui), id = seatId(ui);
        const result = {
          seatId: id,
          position: nativeSeatPosition(ui) ?? null,
          viewId: number(read(() => seat.fixedViewId), read(() => seat.FixedViewId), read(() => ui.fixedViewId), read(() => ui.viewId), read(() => ui.actualSeatID)),
          handCount: number(read(() => seat.HandCardCount), read(() => seat.HandCount), id === selfSeatId ? read(() => ownModels.length) : undefined),
          dead: read(() => seat.IsDead) ?? read(() => seat.isDead),
          knownHandCardIds: publicHandIds(seat, ui),
        };
        if (id !== undefined && id === selfSeatId) result.handCardIds = handCardIds.slice();
        return result;
      }).filter(item => item.seatId !== undefined),
    };
    if (Array.isArray(deckIds) && deckIds.length) snapshot.cardMeta = getDeckCardMeta(deckIds, scene);
    return snapshot;
  }

  if (watchScene) scope?.interval(() => { getScene(); }, 500);
  scope?.add(() => { listeners.clear(); providers.clear(); definitionTables = new WeakMap(); deckDefinitions = null; dispatcher = dispatcherOwner = current = stage = null; });
  return {
    getScene, getRenderedScene: stageScene, withSceneCycle, getDispatcher, getSelfSeatUI: () => selfUI(getScene()), getSeatUIs: () => seats(getScene()),
    getCardMeta, getCardFaceCatalog, loadCardFaceCatalog, getSnapshot, getClass, getServerProxy, getActivityManager, getMessageTargets, getCountdown, getSelf,
    getRemainingSlash, isInGame: () => isGameScene(getScene()), isReplay: (scene = getScene()) => isReplayScene(scene), canReserveViewport,
    getConfigData: name => configs?.getConfigData(name) || null,
    loadConfigData: (name, options) => configs ? configs.loadConfigData(name, options) : Promise.reject(new Error('配置读取不可用')),
    ...createGameAssetDownloads(win, scope, mobileSkinPort),
    supportsMobileSkinConfig: true,
    onSceneChange(fn) {
      if (typeof fn !== 'function') throw new TypeError('Scene subscriber must be a function');
      listeners.add(fn); return () => listeners.delete(fn);
    },
  };
}
