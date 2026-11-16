// Account-owned opt-ins and a durable send journal. Never infer success from a send.
export const LANDLORD_BEAN = 9030201;
export const EXCHANGE_DELAY = 5000;
const natural = n => Number.isSafeInteger(n) && n >= 0;
export const exchangeEligible = row => !!row && Number.isSafeInteger(row.id) && row.id > 0
  && [1, 2, 3].includes(row.period) && natural(row.limit) && row.limit > 0
  && natural(row.price) && row.price > 0 && natural(row.bought) && row.bought < row.limit
  && row.owned === false && row.unlocked === true;

export function createExchangeController({ adapter, settings, now = () => Date.now(), enabled = () => true }) {
  let owner = '', day = '', data = {}, countdown = null, status = '在商店商品右上角选择自动兑换', stopped = false;
  const key = () => `account:${owner}:shop-exchange`;
  const save = () => settings.set(key(), data);
  function sync() {
    const next = adapter.account(), nextDay = adapter.day();
    if (owner !== next) {
      owner = next; data = owner ? settings.get(key(), {}) : {};
      data = { selected: [], wait: {}, journal: {}, ...data };
      countdown = null; day = ''; adapter.invalidate();
    }
    if (day !== nextDay) { day = nextDay; countdown = null; adapter.invalidate(); }
    return !!owner && !!day;
  }
  function selected(id) { return sync() && data.selected.includes(id); }
  function toggle(id, value) {
    if (!sync()) return;
    data.selected = data.selected.filter(item => item !== id);
    if (value) data.selected.push(id);
    // Deselecting never erases an unresolved purchase journal.
    delete data.wait[id]; save(); countdown = null;
    adapter.invalidate(); tick();
  }
  function tick() {
    if (stopped || !sync()) { countdown = null; return; }
    if (!enabled()) { countdown = null; status = '自动领取已关闭，自动兑换已暂停'; return; }
    if (!data.selected.length) { countdown = null; status = '在商店商品右上角选择自动兑换'; return; }
    const snapshot = adapter.snapshot();
    if (!snapshot?.ready || snapshot.currency !== LANDLORD_BEAN || !natural(snapshot.balance)) {
      countdown = null; status = '等待地主豆商店及限购数据'; return;
    }
    const { balance, rows } = snapshot;
    // A sent request blocks all subsequent purchases until both limit and balance settle.
    for (const [id, attempt] of Object.entries(data.journal)) {
      const row = rows.find(item => String(item.id) === id);
      if (row && row.bought >= attempt.bought + attempt.count && balance !== attempt.balance) {
        delete data.journal[id]; save();
      } else if (attempt.day !== day) {
        // Fresh daily limit data permits a new day, never a same-day blind resend.
        delete data.journal[id]; save();
      } else {
        countdown = null; status = '等待兑换结果与余额同步，暂不重复购买'; return;
      }
    }
    let candidate;
    for (const id of data.selected) {
      const row = rows.find(item => item.id === id);
      if (!exchangeEligible(row)) continue;
      const wait = data.wait[id];
      if (wait && wait.balance === balance) continue;
      if (wait) { delete data.wait[id]; save(); }
      const count = Math.min(row.limit - row.bought, Math.floor(balance / row.price));
      if (!count) { data.wait[id] = { balance }; save(); continue; }
      candidate = { ...row, count, balance, day }; break;
    }
    if (!candidate) { countdown = null; status = '已兑换至限购上限，或等待地主豆余额变化'; return; }
    const fingerprint = row => JSON.stringify([row.id, row.price, row.bought, row.limit, row.period, row.count, row.balance, row.day]);
    if (!countdown || fingerprint(countdown) !== fingerprint(candidate)) {
      countdown = { ...candidate, until: now() + EXCHANGE_DELAY };
    }
    const seconds = Math.max(0, Math.ceil((countdown.until - now()) / 1000));
    status = `${candidate.name || '所选商品'} ×${candidate.count} · ${seconds} 秒后兑换（消耗 ${candidate.count * candidate.price} 地主豆）`;
    if (seconds) return;
    // Re-read at expiry; adapter.buy also checks identity, currency, price and count.
    const attempt = { ...candidate };
    countdown = null; data.journal[attempt.id] = attempt; save();
    try { adapter.buy(attempt); status = '已提交兑换，等待游戏确认'; }
    catch { status = '兑换未确认，等待商店重新同步'; }
  }
  function reply(id, result) {
    if (!sync() || !Number.isInteger(result) || !data.journal[id]) return;
    if (result !== 0) {
      const balance = adapter.snapshot()?.balance;
      data.wait[id] = { balance: natural(balance) ? balance : data.journal[id].balance };
      delete data.journal[id]; save(); status = '兑换失败，等待地主豆余额变化';
    }
    tick();
  }
  return { tick, toggle, selected, reply,
    view() { sync(); return { status, countdown: countdown ? { ...countdown, seconds: Math.max(0, Math.ceil((countdown.until - now()) / 1000)) } : null }; },
    stop() { stopped = true; countdown = null; },
  };
}
