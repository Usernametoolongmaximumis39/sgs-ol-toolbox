import { createNative } from './native.js';
import { openLedgerStore } from './store.js';
import { read } from '../../shared/info-runtime.js';
import { YUANBAO, JADE_SEAL, JADE_SHARDS, canAlert, defaultThreshold, integer, goodsDefinitions, isOtherJadeSeal,
  importantItems, totals, prayerSummary, createReconciler } from './model.js';
const uid = win => win.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const noAlerts = Object.freeze([]);
export function createController(ctx, options = {}) {
  let who = { id: '', nickname: '' }, records = [], instances = new Map(), session = null, loading = false, error = '', configError = '';
  let defs = new Map(), qifu = null, prayer = null, generation = 0, loadedConfig = false;
  let trackedItems = importantItems(defs);
  function setGoods(config) {
    defs = goodsDefinitions(config);
    trackedItems = importantItems(defs);
  }
  const visibleItems = knots => trackedItems.filter(row => row.name !== '如意结' || knots.active.has(Number(row.ID)));
  let configRetry = null;
  const waitingForConfig = reason => /^等待(?:游戏配置数据就绪|客户端资源版本就绪，请稍后刷新|游戏配置解码器就绪)$/.test(String(reason?.message || reason));
  let watch = null;
  const listeners = new Set(), reconcile = createReconciler(), waiting = [], rewards = [];
  const runtimeKey = Symbol.for('sgs.toolbox.ledger.login');
  const runtime = ctx.window[runtimeKey] ||= { account: '', session: null };
  let lastAccount = runtime.account, inventoryReady = true, currencyReady = true;
  let currencyPending = false, currencySample = null, currencySampleAt = 0;
  function beginCurrencyBaseline() {
    currencyReady = false; currencyPending = true; currencySample = null; currencySampleAt = 0;
  }
  function settleCurrencyBaseline() {
    if (!currencyPending) return;
    const count = native.yuanbao(), now = Date.now();
    if (!inventoryReady || !native.inventoryComplete() || count === null) { currencySample = null; currencySampleAt = now; return; }
    if (currencySample !== count) { currencySample = count; currencySampleAt = now; return; }
    // Login populates the wallet in stages. Never persist or compare a partial
    // wallet merely because the unrelated bag response has already arrived.
    if (now - currencySampleAt >= 2000) { currencyReady = true; currencyPending = false; }
  }
  const notify = () => { if (ctx.scope.signal.aborted) return; ctx.reportError?.(error || configError); for (const fn of [...listeners]) fn(); };
  const fail = e => { if (ctx.scope.signal.aborted) return; error = String(e?.stack || e); notify(); };
  const store = options.store || openLedgerStore(ctx.window, ctx.scope, fail);
  function persist(row) { store.put(structuredClone(row)).catch(fail); }
  function add(data) {
    if (!who.id || ctx.scope.signal.aborted) return null;
    const row = { id: uid(ctx.window), account: who.id, session: session.id, at: Date.now(), items: [], ...data };
    records.push(row); persist(row); return row;
  }
  function newSession() {
    session = { id: uid(ctx.window), at: Date.now(), incomplete: false };
    runtime.account = who.id; runtime.session = session;
    reconcile.reset(); waiting.length = rewards.length = 0;
  }
  function threshold(id) {
    return ctx.settings?.get('threshold:' + who.id + ':' + id, defaultThreshold(id, defs.get(Number(id))?.name)) ?? defaultThreshold(id, defs.get(Number(id))?.name);
  }
  function checkAssets() {
    if (!who.id || !session || !ctx.settings) return;
    settleCurrencyBaseline();
    if (watch?.session !== session.id) {
      const saved = ctx.settings.get('balance:' + who.id, {});
      watch = runtime.watch?.session === session.id && runtime.watch.schema === 2 ? runtime.watch : { schema: 2, session: session.id, previous: saved, latest: { ...saved }, changes: {}, warned: {}, alerts: [] };
      runtime.watch = watch;
      // Clear outdated seasonal warnings when restoring a hot-loaded session.
      watch.alerts = watch.alerts.filter(message => !message.startsWith('如意结'));
    }
    const rows = visibleItems(native.knots(qifu, trackedItems)), now = Date.now();
    for (const row of rows) {
      const id = Number(row.ID), count = id === YUANBAO ? currencyReady ? native.yuanbao() : null : inventoryReady ? native.count(id) : null;
      if (!Number.isSafeInteger(count) || count < 0) continue;
      if (!(id in watch.changes)) {
        const old = watch.previous[id];
        watch.changes[id] = Number.isSafeInteger(old?.count) && (id !== YUANBAO || old.basis === 'all-yuanbao') ? { previous: old.count, count, delta: count - old.count, at: old.at } : null;
      }
      if (watch.latest[id]?.count !== count || now - (watch.latest[id]?.at || 0) >= 30000 || id === YUANBAO && watch.latest[id]?.basis !== 'all-yuanbao') watch.latest[id] = { count, at: now, ...(id === YUANBAO ? { basis: 'all-yuanbao' } : {}) };
    }
    const jade = watch.changes[JADE_SEAL], shards = watch.changes[JADE_SHARDS];
    const combined = jade && shards ? { previous: (jade.previous * 10 + shards.previous) / 10, count: (jade.count * 10 + shards.count) / 10, delta: (jade.delta * 10 + shards.delta) / 10, at: Math.min(jade.at || 0, shards.at || 0) } : null;
    watch.combined = combined;
    for (const row of rows) {
      const id = Number(row.ID); if (!canAlert(id, row.name)) continue;
      const change = id === JADE_SEAL ? combined : watch.changes[id], limit = threshold(id);
      const fresh = change && Number.isFinite(change.at) && now >= change.at && now - change.at <= 7 * 86400000;
      if (fresh && Number.isFinite(limit) && limit > 0 && -change.delta >= limit && !watch.warned[id]) {
        watch.warned[id] = true;
        const message = (id === JADE_SEAL ? '玉玺合计（含碎片折算）' : row.name) + '较上次在线减少 ' + (-change.delta) + '，上次 ' + change.previous + ' → 本次 ' + change.count + '，已达到阈值 ' + limit + '，请立即检查账号与物品使用情况。';
        watch.alerts = [...watch.alerts, message]; ctx.notify?.(message);
      }
    }
    for (const id of Object.keys(watch.latest)) {
      if (isOtherJadeSeal(id, defs.get(Number(id))?.name)) delete watch.latest[id];
    }
    const serialized = JSON.stringify(watch.latest);
    if (watch.serialized !== serialized) { ctx.settings.set('balance:' + who.id, watch.latest); watch.serialized = serialized; }
  }
  function seed() {
    if (!inventoryReady) { instances.clear(); return; }
    const snap = native.snapshot();
    instances = new Map(snap.instances.map(i => [i.id, i]));
  }
  function sync() {
    const next = native.account();
    if (next.id === who.id) { who = next; return; }
    who = next; watch = null; records = []; instances.clear(); waiting.length = rewards.length = 0; reconcile.reset(); error = ''; generation++;
    if (!who.id) { session = null; runtime.account = ''; runtime.session = null; notify(); return; }
    // A changed account cannot reuse the previous account's still-mounted bag
    // or currency model. Wait for its own incoming baseline/notification.
    const requireBaseline = Boolean(lastAccount && (lastAccount !== who.id || !(session || runtime.session)));
    if (requireBaseline) { inventoryReady = false; beginCurrencyBaseline(); }
    else if (!lastAccount) inventoryReady = currencyReady = true;
    if (!native.inventoryComplete()) beginCurrencyBaseline();
    lastAccount = who.id;
    if (runtime.account === who.id && runtime.session) session = runtime.session; else newSession();
    seed(); const expected = generation, id = who.id; loading = true;
    store.list(id).then(saved => {
      if (ctx.scope.signal.aborted || generation !== expected) return;
      const merged = new Map((saved || []).map(r => [r.id, r])); for (const r of records) merged.set(r.id, r);
      records = [...merged.values()].sort((a, b) => a.at - b.at); loading = false; notify();
    }).catch(e => { if (generation === expected) { loading = false; fail(e); } });
    notify();
  }
  function metadata(id) { const data = defs.get(id); return { id, name: data?.name || (id === YUANBAO ? '元宝' : `物品 ${id}`) }; }
  const canRecordItem = ({ id, name }) => !isOtherJadeSeal(id, defs.get(Number(id))?.name || name);
  function changes(source, stream, items, extra = {}) {
    if (!items.every(i => integer(i.id) && i.id > 0 && Number.isSafeInteger(i.delta))) throw new Error('物品变动字段无效，账本可能有缺口');
    const tracked = items.filter(canRecordItem);
    if (items.length && !tracked.length) return null;
    // Currency has its own authoritative ChangeYB stream.
    items = tracked.filter(i => i.delta && (source === 'DbsCUpdatauserYaunbaoNtf' || i.id !== YUANBAO));
    const id = uid(ctx.window), at = Date.now(), result = source === 'DbsCUpdatauserYaunbaoNtf' ? { items, changes: [] } : reconcile.accept(stream, items, at, id);
    for (const correction of result.changes) {
      const row = records.find(r => r.id === correction.recordId); if (!row) continue;
      let left = correction.delta;
      for (const item of row.items) if (item.id === correction.id && Math.sign(item.delta) === Math.sign(left)) {
        const amount = Math.sign(left) * Math.min(Math.abs(item.delta), Math.abs(left)); item.delta -= amount; left -= amount;
      }
      row.items = row.items.filter(i => i.delta); row.reconciled = true; persist(row);
    }
    if (!result.items.length && !extra.prayerReward) return null;
    return add({ id, at, kind: 'goods', source, ...extra, items: result.items.map(i => ({ ...metadata(i.id), delta: i.delta })) });
  }
  function gap(message = '消息有缺口，期间收入与消耗无法恢复。') {
    sync(); if (!session) return;
    session.incomplete = true; reconcile.reset(); seed();
    add({ kind: 'notice', source: '记录缺口', note: message }); notify();
  }
  function pair() {
    const now = Date.now();
    for (const queue of [waiting, rewards]) while (queue.length && now - queue[0].at > 15000) queue.shift();
    // No transaction ID exists on goods hints. Only link an unambiguous single
    // candidate on both streams, and preserve the correlation basis in the log.
    if (waiting.length !== 1 || rewards.length !== 1) return;
    const draw = waiting.shift(), reward = rewards.shift();
    draw.prayer.matched = true; draw.rewards = reward.items.filter(i => i.delta > 0).map(i => ({ ...i }));
    draw.correlation = '15 秒内唯一成功回包与唯一祈愿台奖励通知'; reward.linkedPrayer = draw.id;
    persist(draw); persist(reward);
  }
  function accept(type, data, sender) {
    sync(); if (!who.id || sender.id !== who.id) return;
    if (type === 'ClientLoginRep') {
      if (data.id !== who.id) return;
      newSession(); inventoryReady = false; beginCurrencyBaseline(); seed(); add({ kind: 'notice', source: type, note: '本次登录开始；仅统计插件观察到的变动。' });
    } else if (type === 'DbsCcUserGoodslistRep') {
      // Initial/list refresh is a baseline, never income.
      inventoryReady = true;
      for (const i of data.instances) instances.set(i.id, i);
    } else if (type === 'DbsCcUserGoodshintNtf') {
      const row = changes(type, 'hint', data.items, { type: data.type, giver: data.giver, prayerReward: data.type === 2010 });
      if (row?.prayerReward) { rewards.push(row); pair(); }
    } else if (type === 'DbsCcUpdategoodsAttribNtf') {
      if (!integer(data.id) || !integer(data.count)) throw new Error('实例数量无效');
      const old = instances.get(data.id);
      if (old) { changes(type, 'instance', [{ id: old.base, delta: data.count - old.count }]); instances.set(data.id, { ...old, count: data.count }); }
      else gap('收到未知物品实例的数量变动，无法计算该次收支；已重新读取背包基线。');
    } else if (type === 'DbsCcUserDelgoodsNtf') {
      if (data.result !== 1) return;
      const removed = [];
      let missing = false;
      for (const id of data.ids) { const old = instances.get(id); if (old) { removed.push({ id: old.base, delta: -old.count }); instances.delete(id); } else missing = true; }
      changes(type, 'instance', removed);
      if (missing) gap('移除通知包含未观察到基线的物品实例，无法还原其消耗数量。');
    } else if (type === 'DbsCUpdatauserYaunbaoNtf') {
      if (!Number.isSafeInteger(data.delta)) throw new Error('元宝变动字段无效');
      if (!currencyPending) currencyReady = true;
      changes(type, 'currency', [{ id: YUANBAO, delta: data.delta }], { type: data.why });
    } else if (type === 'decodeClientSecretExploreRep') {
      if (data.result !== 0) { add({ kind: 'notice', source: type, note: `祈愿台请求失败，错误码 ${data.result}，不计入次数。` }); }
      else if (integer(data.secId) && data.secId > 0 && integer(data.times) && data.times > 0) {
        const config = prayer?.root?.Common?.find(r => Number(r.Id) === data.secId), itemId = Number(String(config?.Itemid || '').split(',')[0]) || null;
        const row = add({ kind: 'prayer', source: type, prayer: { secId: data.secId, times: data.times, itemId,
          name: config?.Name || `龙珠（活动 ${data.secId}）`, matched: false }, rewards: [] }); waiting.push(row); pair();
      } else gap('祈愿台成功回包缺少活动或次数，未推算次数。');
    }
    checkAssets(); notify();
  }
  const native = createNative(ctx, accept, () => gap());
  const cachedGoods = read(() => ctx.game.getConfigData('sys_gs_dbs_fs_goodsbaseinfo'));
  if (cachedGoods) setGoods(cachedGoods);
  qifu = read(() => ctx.game.getConfigData('ff_qifu_new'));
  prayer = read(() => ctx.game.getConfigData('ff_tiangong'));
  let metrics = '';
  sync(); checkAssets();
  ctx.scope.interval(() => {
    sync(); checkAssets(); const knots = native.knots(qifu, trackedItems), next = JSON.stringify([who.id, currencyReady, inventoryReady, native.yuanbao(), [...knots.active], knots.known,
      visibleItems(knots).map(row => native.count(Number(row.ID)))]);
    if (metrics !== next) { metrics = next; notify(); }
  }, 1000);
  ctx.scope.add(() => { if (session) session.incomplete = true; listeners.clear(); });
  async function load(force = false) {
    if (ctx.scope.signal.aborted || loadedConfig && !force || loadingConfig) return;
    if (configRetry) { configRetry(); configRetry = null; }
    loadingConfig = true; notify();
    const files = ['sys_gs_dbs_fs_goodsbaseinfo', 'ff_qifu_new', 'ff_tiangong'];
    const results = await Promise.allSettled(files.map(file => ctx.game.loadConfigData(file)));
    if (ctx.scope.signal.aborted) return;
    const waiting = results.some(r => r.status === 'rejected' && waitingForConfig(r.reason));
    configError = results.flatMap((r, i) => r.status === 'rejected' && !waitingForConfig(r.reason) ? [`${files[i]}：${r.reason?.stack || r.reason}`] : []).join('\n');
    if (results[0].status === 'fulfilled') setGoods(results[0].value);
    if (results[1].status === 'fulfilled') qifu = results[1].value;
    if (results[2].status === 'fulfilled') prayer = results[2].value;
    loadingConfig = false; loadedConfig = !configError && !waiting; checkAssets(); notify();
    if (waiting) {
      const timer = ctx.scope.timeout(() => { configRetry = null; void load(); }, 2000);
      configRetry = () => clearTimeout(timer);
    }
  }
  let loadingConfig = false;
  return {
    setThreshold(id, value) {
      if (!who.id || !canAlert(id, defs.get(Number(id))?.name) || !(id === JADE_SEAL ? Number.isSafeInteger(Math.round(value * 10)) && Math.abs(value * 10 - Math.round(value * 10)) < 1e-8 : Number.isSafeInteger(value)) || value < 0 || id === JADE_SHARDS) return false;
      ctx.settings?.set('threshold:' + who.id + ':' + id, value); checkAssets(); notify(); return true;
    },
    getAlerts() { return watch?.alerts || noAlerts; },
    dismissAlerts() { if (watch) watch.alerts = noAlerts; notify(); },
    load, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    view({ currentOnly = false } = {}) {
      sync(); checkAssets();
      const namedItems = items => (items || []).filter(canRecordItem).map(i => ({ ...i, name: defs.get(i.id)?.name || i.name || metadata(i.id).name }));
      const hydrated = [];
      for (const row of records) {
        if (currentOnly && row.session !== session?.id) continue;
        const items = namedItems(row.items);
        if (row.kind === 'goods' && row.items?.length && !items.length) continue;
        const record = { ...row, items };
        if (row.prayer) {
          const config = prayer?.root?.Common?.find(c => Number(c.Id) === row.prayer.secId);
          record.rewards = namedItems(row.rewards);
          record.prayer = { ...row.prayer, name: config?.Name || row.prayer.name,
            itemId: Number(String(config?.Itemid || '').split(',')[0]) || row.prayer.itemId };
        }
        hydrated.push(record);
      }
      const current = currentOnly ? hydrated : hydrated.filter(r => r.session === session?.id);
      const sum = totals(current), knots = native.knots(qifu, trackedItems);
      return { who, session, records: hydrated, alerts: watch?.alerts || noAlerts, jadeComparison: watch?.combined || null,
        loading, loadingConfig, error: error || configError, knotsKnown: knots.known,
        items: visibleItems(knots).map(row => ({ ...row, count: row.ID === YUANBAO ? currencyReady ? native.yuanbao() : null : inventoryReady ? native.count(Number(row.ID)) : null,
          comparison: watch?.changes[row.ID] || null, threshold: threshold(row.ID),
          icon: native.icon(Number(row.ID), row.PicID), ...(sum.get(Number(row.ID)) || { income: 0, expense: 0 }) })),
        prayers: prayerSummary(current), unmatched: current.filter(r => r.prayerReward && !r.linkedPrayer),
      };
    },
  };
}
