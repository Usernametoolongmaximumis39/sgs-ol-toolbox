import { isObservedMessage, projectMessage } from './protocol.js';
import { cardPacketWrappers } from '../shared/card-packet-fields.js';
const WRAPPERS = new Set(cardPacketWrappers);
const HISTORY_LIMIT = 2048;
function packetBody(payload) {
  const queue = [payload], seen = new Set(), body = {};
  for (let i = 0; i < queue.length && i < 32; i++) {
    const source = queue[i];
    if (!source || typeof source !== 'object' || seen.has(source)) continue;
    seen.add(source);
    for (const [key, value] of Object.entries(source)) {
      if (WRAPPERS.has(key) && value && typeof value === 'object') queue.push(value);
      else if (!(key in body) || body[key] == null || (Array.isArray(body[key]) && !body[key].length)) body[key] = value;
    }
  }
  return body;
}
function packetSignature(type, payload) {
  // The projector constructs top-level and list-record keys in schema order.
  // Include every projected value, including array order and individual card IDs.
  return type + ':' + JSON.stringify(payload);
}
function copy(value, depth = 0, seen = new WeakSet(), budget = { remaining: 8192 }) {
  if (--budget.remaining < 0) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value !== 'object' || depth > 8 || seen.has(value)) return undefined;
  seen.add(value);
  // Journal inputs are already projected plain data. No native getter discovery
  // is permitted here. The global budget also bounds shared object graphs.
  const result = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value).slice(0, 4096)) {
    if (budget.remaining <= 0) break;
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const item = copy(descriptor.value, depth + 1, seen, budget); if (item !== undefined) result[key] = item;
  }
  seen.delete(value); return result;
}
export class SessionJournal {
  #history = [];
  #head = 0;
  #omitted = 0;
  #limit;
  constructor({ historyLimit = HISTORY_LIMIT } = {}) {
    this.#limit = Number.isInteger(historyLimit) && historyLimit > 0 ? Math.min(historyLimit, HISTORY_LIMIT) : HISTORY_LIMIT;
    this.sessionId = 1; this.seq = 0; this.listeners = new Set(); this.incomplete = true;
  }
  get events() {
    if (!this.#head) return this.#history.slice();
    return this.#history.slice(this.#head).concat(this.#history.slice(0, this.#head));
  }
  *replayAfter(cursor) {
    const history = this.#history, head = this.#head, length = history.length;
    const first = history[head];
    if (!first || cursor >= this.seq) return;
    if (this.#omitted && cursor < first.seq - 1) {
      // This warning belongs only to a consumer rebuilding from incomplete history.
      yield { seq: first.seq - 1, sessionId: first.sessionId, at: first.at, type: 'toolbox:gap',
        payload: { reason: '本局较早事件已超出重放上限，无法完整重建', replayOnly: true } };
    }
    const start = Math.max(0, cursor - first.seq + 1);
    for (let i = start; i < length; i++) yield history[(head + i) % length];
  }
  push(type, payload, at = Date.now()) {
    payload = copy(payload);
    if (type === 'MsgGamePlayCardNtf') {
      const body = packetBody(payload), lists = [body.CardList, body.cardList, body.card_list];
      const deck = lists.find(value => value?.length > 0) ?? lists.find(value => value != null);
      if (deck && typeof deck === 'object' && Number.isInteger(deck.length) && deck.length >= 0 && deck.length <= 10000) {
        this.sessionId++; this.#history = []; this.#head = this.#omitted = 0;
        this.incomplete = !deck.length || !!(body.IsResume ?? body.isResume);
      }
    }
    if (/Reconnect/.test(type) || type === 'toolbox:gap') this.incomplete = true;
    const event = { seq: ++this.seq, sessionId: this.sessionId, type, payload, at };
    if (this.#history.length < this.#limit) this.#history.push(event);
    else {
      this.#history[this.#head] = event;
      this.#head = (this.#head + 1) % this.#limit;
      this.#omitted++;
    }
    for (const fn of this.listeners) { try { fn(event); } catch { /* Consumers cannot break the game. */ } }
    return event;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  snapshot() { return { sessionId: this.sessionId, seq: this.seq, incomplete: this.incomplete, omittedEvents: this.#omitted, events: this.events }; }
}
export function installMessageBridge(win, journal, scope, onStatus = () => {}, {
  getTargets = () => [], observeType = () => {}, observeStartupDispatch, sceneWatch,
} = {}) {
  let activeWrapper, restoreCurrent, depth = 0, consoleError = '', nativeErrors = [];
  let loginIdentity, loginEpoch = 0;
  const native = new Map(), restores = [], stats = { received: 0, console: 0, native: 0, lastType: '', lastAt: null };
  const duplicates = new Map(); let expiryTimer;
  const pending = [], waiters = []; let drainTimer, draining = false;
  stats.dropped = 0; stats.rejected = 0;
  function schedule() { if (!drainTimer && !scope.closed) drainTimer = setTimeout(drain, 0); }
  function drain() {
    drainTimer = null; if (scope.closed) return;
    draining = true;
    const started = performance.now(); let count = 0;
    // Yield a task between batches so input, layout and login handlers progress.
    while (pending.length && count++ < 16 && performance.now() - started < 4) {
      const event = pending.shift();
      try { journal.push(event.type, event.payload, event.at); } catch { stats.rejected++; }
    }
    draining = false;
    if (pending.length) schedule(); else for (const resolve of waiters.splice(0)) resolve();
  }
  function queue(type, payload, at = Date.now()) {
    if (pending.length >= 512) {
      stats.dropped += pending.length + 1; pending.length = 0;
      pending.push({ type: 'toolbox:gap', payload: { reason: '消息突发超过处理上限，已停止追补该批记录' }, at });
    } else pending.push({ type, payload, at });
    schedule();
  }
  function receive(type, data, source) {
    if (scope.closed) return;
    const observed = isObservedMessage(type);
    try { observeType(type, source, observed); } catch { /* Diagnostics cannot affect delivery. */ }
    if (!observed) return;
    let payload;
    try { payload = projectMessage(type, data); }
    catch { stats.rejected++; queue('toolbox:gap', { reason: '卡牌消息字段超出支持范围，已跳过该条记录' }); return; }
    if (payload?.isSend) return;
    const signature = packetSignature(type, payload);
    let entry = duplicates.get(signature);
    if (!entry) {
      if (duplicates.size >= 2048) {
        duplicates.clear(); queue('toolbox:gap', { reason: '短时间消息过多，去重窗口已重建' });
      }
      duplicates.set(signature, entry = { sources: new Map(), max: 0 });
    }
    const count = (entry.sources.get(source) || 0) + 1; entry.sources.set(source, count);
    if (count <= entry.max) return;
    entry.max = count;
    // Match echoes across sources during one task, including Promise forwarding.
    // Another delivery from the SAME source always creates another observation.
    if (!expiryTimer) expiryTimer = setTimeout(() => { duplicates.clear(); expiryTimer = null; }, 0);
    stats.received++; stats[source === 'console' ? 'console' : 'native']++; stats.lastType = type; stats.lastAt = Date.now();
    queue(type, payload, stats.lastAt);
  }
  const installConsole = () => {
    if (scope.closed) return;
    if (win.console.log === activeWrapper) return;
    const original = win.console.log, descriptor = Object.getOwnPropertyDescriptor(win.console, 'log');
    const wrapper = function (...args) {
      if (scope.closed) return Reflect.apply(original, this, args);
      const outer = depth++ === 0;
      try {
        if (outer) { try {
          const prefix = args.filter(x => typeof x === 'string').join(' ');
          if (!/\bsend\b|发送/i.test(prefix)) for (let i = args.length - 1; i >= 0; i--) {
            const data = args[i], type = data?.ClassName || data?.className;
            if (typeof type === 'string') { receive(type, data, 'console'); if (isObservedMessage(type)) break; }
          }
        } catch { try { onStatus('消息格式无法解析'); } catch {} } }
        return Reflect.apply(original, this, args);
      } finally { depth--; }
    };
    try {
      if (!descriptor || descriptor.configurable) Object.defineProperty(win.console, 'log', { value: wrapper, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? true });
      else if ('value' in descriptor && descriptor.writable) win.console.log = wrapper;
      if (win.console.log !== wrapper) throw new Error('日志入口被不可配置的旧脚本锁定');
      activeWrapper = wrapper; consoleError = '';
      restoreCurrent = () => { if (win.console.log === wrapper) { if (descriptor) Object.defineProperty(win.console, 'log', descriptor); else delete win.console.log; } };
    } catch (error) { consoleError = `日志接入失败：${error.message}`; try { onStatus(consoleError); } catch {} }
  };
  function readLoginReply(proxy, packet) {
    try {
      const data = packet?.Protocol;
      if (data?.Id !== 20202 || data.FromSocket2) return;
      const id = data.UserID, connection = proxy.ConnId;
      if ((data.Result !== 1 && data.Result !== 2) || !Number.isSafeInteger(id) || id <= 0
        || !Number.isSafeInteger(connection)) return null;
      const name = data.Nickname;
      const nickname = typeof name === 'string' && name.length <= 128 && name.trim() ? name : '';
      return { proxy, connection, account: Object.freeze({ id: String(id), nickname }) };
    } catch { /* A malformed reply cannot identify the current account. */ }
  }
  function loginConnectionMatches(identity, proxy) {
    try {
      return !scope.closed && identity && identity.proxy === proxy && proxy.ConnectedSucess1 === true
        && proxy.ConnId === identity.connection;
    } catch { return false; }
  }
  const getLoginAccount = proxy => loginConnectionMatches(loginIdentity, proxy) ? loginIdentity.account : null;
  function installNative() {
    if (scope.closed) return;
    nativeErrors = [];
    let targets; try { targets = getTargets() || []; } catch { targets = []; }
    const live = new Set();
    for (const { name, target } of targets) {
      if (!target || typeof target.event !== 'function' || live.has(target)) continue;
      live.add(target);
      if (native.get(target)?.wrapper === target.event) continue;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(target, 'event'), original = target.event;
        const entry = { name, wrapper: null, active: true };
        const wrapper = function (...args) {
          if (scope.closed || !entry.active) return Reflect.apply(original, this, args);
          const [eventName, data] = args;
          let packet;
          try {
            packet = Array.isArray(data) && data.length === 1 && typeof data[0] === 'object' ? data[0] : data;
            // For named unrelated events do not even inspect their payload.
            const type = isObservedMessage(eventName) || /^(?:Msg|PubGs|Smsg|GsC|CGs|decode|Client)/.test(eventName) ? eventName : packet?.ClassName || packet?.className;
            receive(type, packet, `native:${name}`);
          } catch { /* Observing cannot interrupt native dispatch. */ }
          if (name !== 'ServerProxy') return Reflect.apply(original, this, args);
          const login = this === target && eventName === 'ClientLoginRep' ? readLoginReply(target, packet) : undefined;
          if (this === target && (login !== undefined || eventName === 'ClientLogoutRep' || eventName === 'close')) {
            loginEpoch++;
            loginIdentity = undefined;
          }
          const epoch = loginEpoch;
          const startup = observeStartupDispatch && (eventName === 'ClientLoginRep' || eventName === 'ClientUserbaseinfoRep');
          if (!login && !startup) return Reflect.apply(original, this, args);
          let result;
          try { result = Reflect.apply(original, this, args); }
          catch (error) {
            if (startup) try { observeStartupDispatch(eventName, 'threw', error); } catch {}
            throw error;
          }
          // Keep only the acknowledged identity, never the login packet or credentials.
          if (login && epoch === loginEpoch && loginConnectionMatches(login, target)) loginIdentity = login;
          if (startup) try { observeStartupDispatch(eventName, 'returned', packet); } catch {}
          return result;
        };
        if (!descriptor || descriptor.configurable) Object.defineProperty(target, 'event', { value: wrapper, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? true });
        else if ('value' in descriptor && descriptor.writable) target.event = wrapper;
        if (target.event !== wrapper) throw new Error('事件入口不可写');
        entry.wrapper = wrapper; native.get(target)?.release();
        const release = () => {
          entry.active = false;
          if (target.event === wrapper) { if (descriptor) Object.defineProperty(target, 'event', descriptor); else delete target.event; }
        };
        entry.release = release; native.set(target, entry); restores.push(release);
      } catch (error) { nativeErrors.push(`${name}: ${error.message}`); }
    }
    for (const [target, entry] of native) if (!live.has(target)) { entry.release(); native.delete(target); }
  }
  const check = () => { installConsole(); installNative(); };
  check();
  if (sceneWatch) scope.add(sceneWatch.watch(check, 500, true));
  else scope.interval(check, 500);
  scope.add(() => { clearTimeout(expiryTimer); clearTimeout(drainTimer); loginIdentity = undefined; pending.length = 0; for (const resolve of waiters.splice(0)) resolve(); duplicates.clear(); for (const release of restores.reverse()) release(); restoreCurrent?.(); native.clear(); });
  return { check, getLoginAccount, get error() { return native.size ? '' : [consoleError, ...nativeErrors].filter(Boolean).join('；'); },
    flush: () => scope.closed || (!pending.length && !draining) ? Promise.resolve() : new Promise(resolve => { waiters.push(resolve); schedule(); }),
    getStatus: () => ({ ...stats, pending: pending.length, targets: [...native.values()].map(entry => entry.name), errors: [consoleError, ...nativeErrors].filter(Boolean) }) };
}
