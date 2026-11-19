import { CONTROL_STYLES } from '../../ui/controls.js';
import { CARDS, queryCards, validateCard } from './legacy-cards.js';
export const manifest = {
  id: 'recharge', name: '旧周月卡', version: '0.1.16', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.6.72', categories: ['tools'], priority: 45000,
  icon: { paths: ['M3 6h18v14H3Z', 'M3 10h18', 'M15 15h3', 'M6 3h12'] },
  description: '查询旧周卡与旧月卡状态、设置到期提醒并打开游戏直购',
  releaseNotes: "精简旧周卡和旧月卡的查询、到期提醒与直购入口。打开游戏直购前仍需核对商品，付款由用户手动确认。",
};
export function activate(ctx) {
  const riskKey = Symbol.for('sgs.toolbox.recharge.login-risk');
  const riskSession = ctx.window[riskKey] ||= { account: '', acknowledged: false };
  function syncRiskSession() { const account = String(ctx.game.getSelf()?.ClientId || ''); if (account !== riskSession.account) { riskSession.account = account; riskSession.acknowledged = false; } }
  syncRiskSession();
  const cardState = { 2: null, 3: null }, reminders = { 2: ctx.settings?.get('remindWeek', false) === true, 3: ctx.settings?.get('remindMonth', false) === true };
  let observedAccount = '', observedProxy = null, detach = () => {}, requested = false;
  const notified = new Set();
  function observe() {
    syncRiskSession();
    const account = String(ctx.game.getSelf()?.ClientId || ''), proxy = ctx.game.getServerProxy();
    if (account !== observedAccount || proxy !== observedProxy) {
      detach(); observedAccount = account; observedProxy = proxy; requested = false; cardState[2] = cardState[3] = null;
      if (account && proxy?.on && proxy?.off) {
        const owner = {}, accept = packet => {
          if (account !== String(ctx.game.getSelf()?.ClientId || '')) return;
          const p = packet?.Protocol, rows = p?.code === 0 && Array.isArray(p.datas) ? p.datas : p?.userData ? [p.userData] : [];
          for (const row of rows) if ([2,3].includes(row?.type) && typeof row.bActive === 'boolean') {
            cardState[row.type] = row.bActive;
            const key = account + ':' + row.type;
            if (row.bActive) notified.delete(key);
            else if (reminders[row.type] && !notified.has(key)) { notified.add(key); ctx.notify(`${CARDS[row.type].name}已到期或未开通，请在工具页查看；不会自动购买。`); }
          }
        };
        proxy.on('ClientPrivilegeDataRep', owner, accept); proxy.on('ClientPrivilegeRewardNtf', owner, accept);
        detach = () => { proxy.off('ClientPrivilegeDataRep', owner, accept); proxy.off('ClientPrivilegeRewardNtf', owner, accept); };
      } else detach = () => {};
    }
    if (!requested && account && (reminders[2] || reminders[3])) {
      const raw = proxy?._events?.ClientPrivilegeInfoRep, handlers = Array.isArray(raw) ? raw : [raw];
      const welfare = handlers.map(x => x?.caller).find(x => typeof x?.SendClientPrivilegeDataReq === 'function');
      if (welfare) { requested = true; try { welfare.SendClientPrivilegeDataReq(); } catch { requested = false; } }
    }
  }
  ctx.scope.add(() => detach()); ctx.scope.interval(observe, 1000); observe();
  ctx.ui.registerPanel({ id: 'main', category: 'tools', render(container) {
    const doc = ctx.document, root = doc.createElement('div'); root.dataset.sgsRecharge = '';
    const style = doc.createElement('style'); style.textContent = CONTROL_STYLES + `
      [data-sgs-recharge]{font:12px/1.65 var(--sgs-font,sans-serif);color:var(--sgs-text);overflow-wrap:anywhere}
      [data-sgs-recharge] *{box-sizing:border-box}
      [data-sgs-recharge] p{margin:6px 0 10px}
      [data-sgs-recharge] label{display:flex;align-items:center;gap:6px;margin:8px 0;color:var(--sgs-muted)}
      [data-sgs-recharge] label input{flex-shrink:0}
      [data-sgs-recharge] button{font:inherit;appearance:none;border:1px solid var(--sgs-border);border-radius:7px;padding:6px 9px;background:var(--sgs-surface);color:var(--sgs-text);cursor:pointer}
      [data-sgs-recharge] button:hover{border-color:var(--sgs-accent)}
      [data-sgs-recharge] button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
      [data-sgs-recharge] button:disabled{opacity:.45;cursor:default}
      [data-sgs-recharge] .pay-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      [data-sgs-recharge] .pay-row button{flex:1}
      [data-sgs-recharge] .pay-primary{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 50%,var(--sgs-border));background:color-mix(in srgb,var(--sgs-accent) 9%,var(--sgs-surface));font-weight:600}
      [data-sgs-recharge] .pay-risk-box{padding:10px 12px;margin:0 0 12px;border-radius:8px;background:color-mix(in srgb,var(--sgs-danger) 7%,var(--sgs-surface));border-left:2px solid var(--sgs-danger)}
      [data-sgs-recharge] .pay-risk-box strong{color:var(--sgs-danger);font-size:12px}
      [data-sgs-recharge] .pay-risk-box p{color:var(--sgs-muted);margin:6px 0 8px}
      [data-sgs-recharge] .pay-confirm p{white-space:pre-line;margin:0 0 9px;font-variant-numeric:tabular-nums}
      [data-sgs-recharge] label{font-size:11px;letter-spacing:.02em}
      [data-sgs-recharge] .pay-confirm .pay-row{margin:0}

      [data-sgs-recharge] .pay-note{color:var(--sgs-muted)}
      [data-sgs-recharge] .pay-confirm{padding:10px;background:var(--sgs-raised);border-radius:8px;margin:10px 0}
      [data-sgs-recharge] [hidden]{display:none!important}
    `;
    root.append(style); container.append(root);
    let alive = true, busy = false, pending = null, identity = '';
    const sentCards = new Set();
    const controller = new AbortController();
    const abort = () => controller.abort(); ctx.scope.signal.addEventListener('abort', abort, { once: true });
    const add = (tag, text, host = root, cls) => { const el = doc.createElement(tag); el.textContent = text; if (cls) el.className = cls; host.append(el); return el; };
    const listeners = [];
    const listen = (el, event, fn) => { el.addEventListener(event, fn); listeners.push(() => el.removeEventListener(event, fn)); };
    const button = (host, text, fn) => { const el = add('button', text, host); el.type = 'button'; listen(el, 'click', fn); return el; };
    const riskBox = add('div', '', root, 'pay-risk-box');
    add('strong', '旧卡购买风险提示', riskBox);
    add('p', '旧卡可能无法激活、没有奖励或无法退款。付款前请在游戏收银台核对账号与金额。', riskBox);
    button(riskBox, '我已了解，本次登录不再提醒', () => { if (!riskSession.account) return; riskSession.acknowledged = true; riskBox.hidden = true; });
    function updateRisk() { syncRiskSession(); riskBox.hidden = !riskSession.account || riskSession.acknowledged; }
    updateRisk();
    const snapshot = () => String(ctx.game.getSelf()?.ClientId || '');
    function clearPending() { pending = null; confirmation.hidden = true; }
    function readIdentity() {
      const current = snapshot();
      if (current === identity) return;
      identity = current;
      clearPending();
      status.textContent = current ? '请选择旧卡查询状态。' : '请进入游戏大厅后再试。';
    }
    function updateControls() {
      root.querySelectorAll('button,input').forEach(el => { el.disabled = busy; });
    }
    const cardsRow = add('div', '', root, 'pay-row');
    for (const type of [2,3]) button(cardsRow, CARDS[type].name, async () => {
      if (busy) return;
      clearPending();
      await run(async () => {
        if (!snapshot()) throw Error('请进入游戏大厅后再试');
        const account = snapshot(), proxy = ctx.game.getServerProxy(), welfare = manager('WelfareManger');
        if (!proxy?.on || !proxy?.off || !welfare?.SendClientPrivilegeInfoReq || !welfare?.SendClientPrivilegeDataReq) throw Error('旧卡原生接口尚未就绪');
        const quote = await queryCards(proxy, welfare, controller.signal); if (!valid(account)) return;
        const card = validateCard(type, quote.info, quote.data);
        if (sentCards.has(account + ':' + type)) throw Error('本次已打开过该卡直购，请先在游戏核对订单与卡状态，避免重复购买');
        status.textContent = '';
        pending = { type, identity: account }; confirmText.textContent = `确认打开${card.name}原生直购 · 商品报价 ${card.price}（最终币种与金额以游戏收银台为准）。`; confirmation.hidden = false;
      });
    });
    const reminderLabels = {};
    for (const type of [2,3]) {
      const label = add('label', ''), input = doc.createElement('input'); input.type = 'checkbox'; input.className = 'sgs-switch'; input.setAttribute('role','switch'); input.checked = reminders[type]; input.setAttribute('aria-label', CARDS[type].name + '到期提醒'); label.append(input);
      reminderLabels[type] = add('span', CARDS[type].name + '到期提醒 · 状态未知', label);
      listen(input, 'change', () => { reminders[type] = input.checked; ctx.settings?.set(type === 2 ? 'remindWeek' : 'remindMonth', input.checked); requested = false; if (input.checked) notified.delete(snapshot() + ':' + type); observe(); });
    }
    const confirmation = add('div', '', root, 'pay-confirm'); confirmation.hidden = true;
    const confirmText = add('p', '', confirmation);
    const confirmActions = add('div', '', confirmation, 'pay-row');
    const confirmButton = button(confirmActions, '确认并继续', async () => {
      if (busy || !pending) return;
      const job = pending; clearPending();
      await run(async () => {
        if (!valid(job.identity)) throw Error('当前账号已变化，请重新核对');
        const proxy = ctx.game.getServerProxy(), welfare = manager('WelfareManger');
        const fresh = await queryCards(proxy, welfare, controller.signal); if (!valid(job.identity)) return;
        const card = validateCard(job.type, fresh.info, fresh.data);
        const raw = proxy?._events?.ClientDirectPurchaseRep;
        const buyer = (Array.isArray(raw) ? raw : [raw]).map(x => x?.caller).find(x => typeof x?.WebDirectReq === 'function');
        if (!buyer) throw Error('原生直购入口未就绪，请进入大厅');
        sentCards.add(job.identity + ':' + job.type); buyer.WebDirectReq(card.id, 1);
        status.textContent = '已调用原生直购入口；不代表购买或到账成功，请在游戏核对。';
      });
    });
    confirmButton.className = 'pay-primary';
    button(confirmActions, '取消', clearPending);
    const status = add('p', '请进入游戏大厅后再试。', root, 'pay-note'); status.setAttribute('role','status');
    const manager = name => {
      const matches = value => value && !value.destroyed && typeof value.SendClientPrivilegeInfoReq === 'function' && typeof value.SendClientPrivilegeDataReq === 'function';
      const type = ctx.game.getClass(name); if (matches(type)) return type;
      for (const key of ['instance','_instance','s_instance','Instance']) { const d = type && Object.getOwnPropertyDescriptor(type, key); if (d && 'value' in d && matches(d.value)) return d.value; }
      const proxy = ctx.game.getServerProxy();
      for (const event of ['ClientPrivilegeInfoRep','ClientPrivilegeDataRep','ClientLotteryRep']) { const raw = proxy?._events?.[event]; for (const handler of Array.isArray(raw) ? raw.slice(0,32) : [raw]) if (matches(handler?.caller)) return handler.caller; }
      return null;
    };
    const valid = account => alive && !controller.signal.aborted && account === snapshot();
    async function run(fn) {
      busy = true; updateControls(); status.textContent = '正在处理，请稍候…';
      try { await fn(); } catch (error) { if (alive && !controller.signal.aborted) status.textContent = `操作未确认：${error.message || error}。请先核对游戏与支付记录，再决定是否重试。`; }
      finally { busy = false; if (alive) updateControls(); }
    }
    readIdentity();
    const stop = ctx.scope.interval(() => { if (alive) { readIdentity(); updateRisk(); for (const type of [2,3]) reminderLabels[type].textContent = CARDS[type].name + '到期提醒 · ' + (cardState[type] === true ? '有效' : cardState[type] === false ? '已到期／未开通' : '状态未知'); } }, 1000);
    return ctx.scope.add(() => { if (!alive) return; alive = false; abort(); ctx.scope.signal.removeEventListener('abort', abort); clearInterval(stop); listeners.splice(0).forEach(fn => fn()); root.remove(); pending = null; });
  } });
}
export default { manifest, activate };
