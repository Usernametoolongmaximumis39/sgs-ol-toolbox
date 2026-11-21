import { LEDGER_SETTLE_MS, LEDGER_SYNC_BATCH, LEDGER_SYNC_BYTES, LEDGER_SYNC_INTERVAL,
  projectLedgerBalance, projectLedgerEvent, validLedgerVersion } from './sync-model.js';

const EMPTY = { version: null, balances: [], events: [] };

export function createLedgerSync(ctx, account, notify, cache) {
  const transport = ctx.devLedgerSync;
  if (!transport) return null;
  const pending = new Map();
  let request = null, nextAt = 0, previousBalances = '', status = '', error = '';
  let downloaded = EMPTY, balancesById = new Map();
  function restore(snapshot) {
    if (!validLedgerVersion(snapshot?.version) || !Array.isArray(snapshot.balances) || !Array.isArray(snapshot.events)) return;
    downloaded = snapshot;
    balancesById = new Map(snapshot.balances.map(row => [row.id, row]));
  }
  function reset() {
    request?.abort();
    request = null;
    pending.clear();
    restore(EMPTY);
    nextAt = 0; previousBalances = ''; status = ''; error = '';
  }
  ctx.scope.add(reset);
  const due = () => !request && Date.now() >= nextAt;
  function readCloud(expected) {
    if (!transport.readHistory || !expected || !transport.available(expected)) return;
    const key = transport.cacheKey?.(expected);
    return transport.readHistory(expected).then(snapshot => {
      if (ctx.scope.signal.aborted || account() !== expected || transport.cacheKey?.(expected) !== key) return;
      restore({ ...snapshot, balances: snapshot.balances.filter(row => !row.review).map(projectLedgerBalance).filter(Boolean),
        events: snapshot.events.map(projectLedgerEvent).filter(Boolean) });
      notify();
    });
  }

  function queue(row, historical = false) {
    if (historical && pending.has(row.id)) return;
    const event = projectLedgerEvent(row);
    if (!event) return;
    const settle = !transport.localBackup || row.source === 'DbsCcUpdategoodsAttribNtf' || row.source === 'DbsCcUserDelgoodsNtf';
    const urgent = transport.localBackup && !historical;
    const readyAt = (historical ? row.at : Date.now()) + (settle && !row.reconciled ? LEDGER_SETTLE_MS : 0);
    pending.set(event.id, { event, readyAt, urgent });
    if (urgent) nextAt = Math.min(nextAt, readyAt);
  }

  async function run(expected, balances, manual = false, metadata = {}) {
    if (request || !expected || ctx.scope.signal.aborted || account() !== expected || !manual && !due()) return;
    const now = Date.now(), serialized = JSON.stringify(balances);
    const ready = [...pending.values()].filter(row => manual || row.readyAt <= now);
    const cacheAccount = transport.cacheKey ? transport.cacheKey(expected) : expected;

    nextAt = now + LEDGER_SYNC_INTERVAL;
    const active = request = new AbortController();
    const current = () => request === active && !ctx.scope.signal.aborted && account() === expected
      && (!transport.cacheKey || transport.cacheKey(expected) === cacheAccount);
    status = '正在同步账本…'; error = ''; notify();
    let conflicts = 0, offset = 0;
    async function exchange(data) {
      const timer = setTimeout(() => active.abort(), 15000);
      const cancelTimer = ctx.scope.add(() => clearTimeout(timer));
      try { return await transport.exchange(expected, data, active.signal); }
      finally { cancelTimer(); }
    }
    try {
      const encoder = new TextEncoder();
      let reply;
      do {
        if (!current()) return;
        const batch = [];
        let bytes = encoder.encode(serialized).length + encoder.encode(JSON.stringify(metadata)).length + 512;
        while (offset < ready.length && batch.length < LEDGER_SYNC_BATCH) {
          const row = ready[offset];
          const size = encoder.encode(JSON.stringify(row.event)).length + 1;
          if (bytes + size > LEDGER_SYNC_BYTES) {
            if (!batch.length) throw new Error('单条流水超过同步大小上限');
            break;
          }
          batch.push(row);
          bytes += size; offset++;
        }
        reply = await exchange({ balances: previousBalances === serialized ? [] : balances,
          events: batch.map(row => row.event),
          ...(offset === ready.length ? { ...metadata, ...(!transport.readHistory && { pull: { version: downloaded.version, offset: 0 } }) } : {}) });
        if (!current()) return;
        conflicts += reply.conflicts;
        for (const row of batch) if (pending.get(row.event.id) === row) pending.delete(row.event.id);
        previousBalances = serialized;
      } while (offset < ready.length);
      if (transport.readHistory) {
        await readCloud(expected);
        if (current()) finish(conflicts);
        return;
      }
      const version = reply.download?.version;
      if (!validLedgerVersion(version)) throw new Error('本机服务未返回下载回执，请更新同步服务');
      let page = reply.download, cursor = 0;
      const newEvents = version === downloaded.version ? null : new Map();
      for (;;) {
        if (page?.version !== version || page.offset !== cursor || !Array.isArray(page.balances)
          || (newEvents ? !Array.isArray(page.events) || page.events.length > LEDGER_SYNC_BATCH : page.events !== null || page.next !== null))
          throw new Error('下载期间流水有变化或回执无效，请重新同步');
        for (const row of page.events ?? []) {
          const event = projectLedgerEvent(row);
          if (!event || row.review || newEvents.has(event.id)) throw new Error('下载流水格式无效');
          newEvents.set(event.id, event);
        }
        if (page.next === null) break;
        if (!page.events.length || page.next !== cursor + page.events.length) throw new Error('下载分页无效');
        cursor = page.next;
        const continuation = await exchange({ balances: [], events: [], pull: { version, offset: cursor } });
        if (!current()) return;
        page = continuation.download;
      }
      const observed = page.balances.map(row => {
        const value = projectLedgerBalance(row);
        return value && !row.review ? value : null;
      }).filter(Boolean);
      if (newEvents || JSON.stringify(observed) !== JSON.stringify(downloaded.balances)) {
        const snapshot = { version, balances: observed, events: newEvents ? [...newEvents.values()] : downloaded.events };
        if (cacheAccount) await cache?.put(cacheAccount, snapshot);
        if (!current()) return;
        restore(snapshot);
      }
      finish(conflicts);
    } catch (reason) {
      if (current()) {
        status = '账本同步失败'; error = String(reason?.message || reason);
      }
    } finally {
      if (request === active) {
        request = null;
        if (!ctx.scope.signal.aborted && account() === expected) notify();
      }
    }
  }

  function finish(conflicts) {
    status = conflicts ? `账本已同步 · ${conflicts} 条冲突待核对` : '账本已同步';
    if (transport.localBackup) for (const row of pending.values()) if (row.urgent) nextAt = Math.min(nextAt, row.readyAt);
  }

  return { queue, reset, restore, run, due, readCloud, requestLogin: () => { nextAt = 0; },
    events: () => downloaded.events, balance: id => {
      const row = balancesById.get(id);
      return row?.name === '如意结' && !(row.expiresAt > Date.now()) ? undefined : row;
    },
    view: () => ({ status, error, busy: Boolean(request) }) };
}
