import { cleanConfig, keywords, matches, blocked, roundStart } from './model.js';

export function createController({ adapter, settings, scope, reportError = () => {}, notify = () => {} }) {
  let account = '', config = cleanConfig(), records = {}, list = [], listKnown = false, status = '等待账号登录', error = '', manual = '', pauseUntil = 0;
  let refreshAt = 0, supplementAt = 0, round = 0, signature = '', nextBuyAt = 0, prepared = false, preparing = false, generation = 0, disposed = false;
  let lastTick = -Infinity, prepareRetryAt = 0;
  const stockChecks = new Map();
  const subscribers = new Set();
  const alive = () => !disposed && !scope.signal.aborted;
  const emit = () => subscribers.forEach(fn => fn());
  function fail(e) { error = String(e?.stack || e); reportError(error); status = '发生错误，请展开详情'; }
  function clearError() { if (error) { error = ''; reportError(''); } }
  const save = () => settings.set(`account:${account}`, { v: 1, config, records, round, nextBuyAt, pauseUntil });
  function syncAccount() {
    const id = adapter.account();
    if (id === account) return;
    account = id; generation++; config = cleanConfig(); records = {}; list = []; listKnown = false; manual = ''; pauseUntil = 0;
    refreshAt = supplementAt = round = nextBuyAt = prepareRetryAt = 0; stockChecks.clear(); signature = ''; prepared = preparing = false; clearError();
    if (id) {
      const saved = settings.get(`account:${id}`, {});
      config = cleanConfig(saved.config);
      round = Number(saved.round) || 0;
      nextBuyAt = Number(saved.nextBuyAt) || 0; pauseUntil = Number(saved.pauseUntil) || 0;
      // Plain JSON only, bounded to the newest product identities. Unknown data never authorizes a purchase.
      const entries = Object.entries(saved.records || {}).slice(-512).filter(([key, r]) => /^\d+\|\d+\|\d+\|\d+$/.test(key) && r && typeof r === 'object');
      records = Object.fromEntries(entries.map(([key, r]) => [key, { done: r.done === true, attempts: Math.max(0, Math.min(9, Number(r.attempts) || 0)),
        nextAt: Number(r.nextAt) || 0, pending: r.pending && Number.isFinite(r.pending.bought) && Number.isFinite(r.pending.at) ? { bought: r.pending.bought, at: r.pending.at } : null }]));
    }
  }
  function prepare() {
    if (prepared || preparing || adapter.now() < prepareRetryAt) return;
    preparing = true; const token = generation;
    Promise.resolve().then(() => { if (alive() && generation === token) return adapter.prepare(); }).then(() => {
      if (!alive() || generation !== token) return;
      prepared = true; preparing = false; clearError(); tick();
    }).catch(e => { if (alive() && generation === token) { preparing = false; prepareRetryAt = adapter.now() + 30000; fail(e); emit(); } });
  }
  function complete(row, record, now) {
    record.done = true; record.pending = null; record.nextAt = 0;
    nextBuyAt = now + 3000; if (manual === row.key) manual = '';
    status = `已抢到：${row.name}`; save(); notify(`秒杀购买成功：${row.name}`);
  }
  function response(reply) {
    if (!alive()) return;
    try {
      syncAccount();
      if (!account || !config.enabled || !reply) return;
      const now = adapter.now(); list = adapter.rows() || [];
      const candidates = list.filter(row => row.baseId === reply.baseId && records[row.key]?.pending && now - records[row.key].pending.at <= 15000);
      if (candidates.length !== 1 || !Number.isInteger(reply.result)) return;
      const row = candidates[0], record = records[row.key];
      if (reply.result === 1) complete(row, record, now);
      else {
        record.pending = null;
        record.nextAt = now + (record.attempts % 3 === 0 ? 30000 : 300);
        status = `${row.name}：购买失败（返回码 ${reply.result}）`; save();
      }
      emit();
    } catch (e) { fail(e); emit(); }
  }
  function stateFor(row, now) {
    const r = records[row.key];
    if (r?.done) return '本场已抢到';
    if (r?.pending) return now - r.pending.at < 1200 ? '等待购买结果' : '结果未确认，等待库存核实';
    const reason = blocked(row, now); if (reason) return reason;
    if (r?.attempts >= 9) return '已试满 3×3 次';
    if (r?.nextAt > now) return `${Math.ceil((r.nextAt - now) / 1000)} 秒后重试`;
    if (row.startMs > now) return `${new Date(row.startMs).toLocaleTimeString('zh-CN', { hour12: false })} 开抢`;
    return '可购买';
  }
  function tick() {
    if (!alive()) return;
    try {
      syncAccount();
      if (!account) { status = '等待账号登录'; emit(); return; }
      const now = adapter.now();
      const nativeRows = adapter.rows(); listKnown = Array.isArray(nativeRows); list = nativeRows || [];
      if (!config.enabled) { status = '自动购买已关闭'; emit(); return; }
      const kws = keywords(config);
      if (!kws.length && !manual) { status = '请选择物品或添加关键词'; emit(); return; }
      if (!adapter.ready()) { status = '等待游戏秒杀管理器'; emit(); return; }
      if (!prepared) { status = preparing ? '正在读取物品名称' : '准备商品数据'; prepare(); emit(); return; }
      const currentRound = roundStart(now);
      if (round !== currentRound) {
        const first = !round; round = currentRound; refreshAt = 0; if (!first) supplementAt = now + 10000;
        // Carry confirmed purchases and uncertain requests across round boundaries.
        for (const r of Object.values(records)) if (!r.done && !r.pending) { r.attempts = 0; r.nextAt = 0; }
      }
      if (now >= refreshAt || supplementAt && now >= supplementAt) {
        if (adapter.refresh()) { refreshAt = now + 600000; if (supplementAt && now >= supplementAt) supplementAt = 0; }
        else refreshAt = now + 3000;
      }
      const sig = list.map(row => `${row.key}:${row.name}:${row.count}:${row.price}:${row.currency}`).join(';');
      if (signature && sig !== signature) for (const r of Object.values(records)) if (!r.done && !r.pending) { r.attempts = 0; r.nextAt = 0; }
      signature = sig;
      // A native personal purchase count increase is also authoritative evidence.
      for (const row of list) {
        const r = records[row.key]; if (r?.pending && row.valid && row.bought > r.pending.bought) complete(row, r, now);
      }
      const pending = list.filter(row => records[row.key]?.pending);
      // Missing/expired rows still own their unresolved debit. A future activity
      // with the same base item cannot consume it or trigger a second purchase.
      const pendingBaseIds = new Set(Object.entries(records).filter(([, r]) => r.pending).map(([key]) => Number(key.split('|')[2])));
      for (const row of pending) if (now - records[row.key].pending.at >= 1200 && now >= (stockChecks.get(row.key) || 0)) {
        stockChecks.set(row.key, now + 30000); adapter.stock(row);
      }
      if (pending.some(row => now - records[row.key].pending.at < 1200)) { status = '等待购买结果'; emit(); return; }
      if (now < pauseUntil) { status = `已手动取消，${Math.ceil((pauseUntil - now) / 60000)} 分钟后恢复`; emit(); return; }
      if (now < nextBuyAt) { status = `已抢到一件，${Math.ceil((nextBuyAt - now) / 1000)} 秒后继续`; emit(); return; }
      const hits = list.filter(row => row.key === manual || kws.some(kw => matches(row, kw)));
      const candidates = hits.filter(row => !blocked(row, now) && !records[row.key]?.done && !records[row.key]?.pending
        && (records[row.key]?.attempts || 0) < 9 && (records[row.key]?.nextAt || 0) <= now
        && !pendingBaseIds.has(row.baseId));
      candidates.sort((a, b) => Number(b.key === manual) - Number(a.key === manual) || Number(a.startMs > now) - Number(b.startMs > now) || a.startMs - b.startMs || a.key.localeCompare(b.key));
      const row = candidates[0];
      if (!row) { status = !listKnown ? '等待商品列表同步' : !list.length ? '秒杀列表暂无商品' : pendingBaseIds.size ? '购买结果未确认，等待库存核实' : hits.length ? '当前目标已完成或暂不可购买' : `列表 ${list.length} 项未命中所选关键词`; emit(); return; }
      if (row.startMs > now) { status = `等待开抢：${row.name}`; emit(); return; }
      if (!records[row.key]) {
        const keys = Object.keys(records);
        for (const key of keys) if (Object.keys(records).length >= 512 && !records[key].pending) delete records[key];
        if (Object.keys(records).length >= 512) { status = '未确认购买记录较多，请先核实'; emit(); return; }
      }
      const r = records[row.key] ||= { attempts: 0, nextAt: 0, done: false, pending: null };
      r.attempts++; r.pending = { bought: row.bought, at: now };
      // Persist BEFORE sending. Reload/disable must not blindly repeat an unconfirmed debit.
      save(); adapter.stock(row); adapter.buy(row);
      status = `正在购买：${row.name}（第 ${r.attempts} / 9 次）`; clearError();
      emit();
    } catch (e) { fail(e); emit(); }
  }
  adapter.subscribe(response);
  scope.interval(() => { const now = Date.now(); if (now - lastTick < 250) return; lastTick = now; tick(); }, 300);
  scope.add(() => { disposed = true; generation++; subscribers.clear(); });
  tick();
  return {
    tick,
    snapshot: () => ({ account, config: cleanConfig(config), status, error, manual, listKnown, rows: list.map(row => ({ ...row, state: stateFor(row, adapter.now()), selected: row.key === manual || keywords(config).some(kw => matches(row, kw)) })) }),
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    options(changes) {
      try { syncAccount(); if (!account || !alive()) return; config = cleanConfig({ ...config, ...changes }); if (!config.enabled) manual = ''; pauseUntil = 0; save(); clearError(); tick(); }
      catch (e) { fail(e); emit(); }
    },
    manual(key) {
      try { syncAccount(); if (!account || !alive()) return;
        if (manual === key) { manual = ''; pauseUntil = adapter.now() + 600000; }
        else { manual = key; pauseUntil = 0; } save(); tick();
      } catch (e) { fail(e); emit(); }
    },
    refresh() {
      try { syncAccount(); if (!account || !alive()) return; prepareRetryAt = 0; prepare(); if (adapter.refresh()) { refreshAt = adapter.now() + 600000; clearError(); tick(); } }
      catch (e) { fail(e); emit(); }
    },
  };
}
