import { qrData } from './encoding.js';
import { PAY_BASE, CARDS, isOfficialServer, buildPayload, paymentResult, queryCards, validateCard } from './payment.js';
export const manifest = {
  id: 'recharge', name: '95折充值与旧卡', version: '0.1.6', apiVersion: 1, contractVersion: 1,
  releaseNotes: "统一充值与旧卡界面的提示和操作外观，保留每次订单的账号核对与风险确认。付款仍须人工操作，不保证折扣、到账或旧卡激活。", minCoreVersion: '0.6.37', categories: ['tools'], priority: 45000,
  icon: { paths: ['M3 6h18v14H3Z', 'M3 10h18', 'M15 15h3', 'M6 3h12'] },
  description: '官服微信／支付宝充值及旧周月卡原生直购入口，操作前请阅读风险',
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
    const style = doc.createElement('style'); style.textContent = `
      [data-sgs-recharge]{font:12px/1.65 var(--sgs-font,sans-serif);color:var(--sgs-text);overflow-wrap:anywhere}
      [data-sgs-recharge] *{box-sizing:border-box}
      [data-sgs-recharge] p{margin:6px 0 10px}
      [data-sgs-recharge] label{display:block;margin:8px 0;color:var(--sgs-muted)}
      [data-sgs-recharge] input.sgs-input{display:block;width:100%;margin-top:3px}
      [data-sgs-recharge] button{font:inherit;appearance:none;border:1px solid var(--sgs-border);border-radius:7px;padding:6px 9px;background:var(--sgs-surface);color:var(--sgs-text);cursor:pointer}
      [data-sgs-recharge] button:hover{border-color:var(--sgs-accent)}
      [data-sgs-recharge] button:focus-visible,[data-sgs-recharge] a:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
      [data-sgs-recharge] button:disabled{opacity:.45;cursor:default}
      [data-sgs-recharge] .pay-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      [data-sgs-recharge] .pay-row button{flex:1}
      [data-sgs-recharge] .pay-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
      [data-sgs-recharge] .pay-presets button{padding:6px 2px;white-space:nowrap;font-variant-numeric:tabular-nums}
      [data-sgs-recharge] .pay-presets button[aria-pressed=true]{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 65%,transparent);background:color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-surface))}
      [data-sgs-recharge] .pay-primary{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 50%,var(--sgs-border));background:color-mix(in srgb,var(--sgs-accent) 9%,var(--sgs-surface));font-weight:600}
      [data-sgs-recharge] .pay-secondary{border-color:transparent;background:transparent;padding:4px 0;color:var(--sgs-muted)}
      [data-sgs-recharge] .pay-risk-box{padding:10px 12px;margin:0 0 12px;border-radius:8px;background:color-mix(in srgb,var(--sgs-danger) 7%,var(--sgs-surface));border-left:2px solid var(--sgs-danger)}
      [data-sgs-recharge] .pay-risk-box strong{color:var(--sgs-danger);font-size:12px}
      [data-sgs-recharge] .pay-risk-box p{color:var(--sgs-muted);margin:6px 0 8px}
      [data-sgs-recharge] .pay-confirm p{white-space:pre-line;margin:0 0 9px;font-variant-numeric:tabular-nums}
      [data-sgs-recharge] label{font-size:11px;letter-spacing:.02em}
      [data-sgs-recharge] .pay-confirm .pay-row{margin:0}
      [data-sgs-recharge] h4{padding-top:10px;border-top:1px solid var(--sgs-border)}

      [data-sgs-recharge] .pay-risk{border-left:2px solid var(--sgs-danger);padding:5px 0 5px 10px;color:var(--sgs-danger)}
      [data-sgs-recharge] .pay-note{color:var(--sgs-muted)}
      [data-sgs-recharge] h4{font-size:13px;margin:18px 0 6px}
      [data-sgs-recharge] img{display:block;width:100%;max-width:280px;margin:8px auto;background:white;padding:8px;border-radius:8px}
      [data-sgs-recharge] a{color:var(--sgs-accent)}
      [data-sgs-recharge] .pay-cashier{position:relative;overflow:hidden;width:100%;max-width:280px;aspect-ratio:1;margin:8px auto;background:white;border-radius:8px}
      [data-sgs-recharge] .pay-cashier iframe{position:absolute;border:0;background:white;transform-origin:0 0}
      [data-sgs-recharge] .pay-cashier-viewport{position:absolute;overflow:hidden;background:white}
      [data-sgs-recharge] .pay-confirm{padding:10px;background:var(--sgs-raised);border-radius:8px;margin:10px 0}
      [data-sgs-recharge] [hidden]{display:none!important}
    `;
    root.append(style); container.append(root);
    let alive = true, busy = false, pending = null, result = null, identity = '', sentCards = new Set(), releaseResult = () => {};
    const controller = new AbortController();
    const abort = () => controller.abort(); ctx.scope.signal.addEventListener('abort', abort, { once: true });
    const add = (tag, text, host = root, cls) => { const el = doc.createElement(tag); el.textContent = text; if (cls) el.className = cls; host.append(el); return el; };
    const listeners = [];
    const listen = (el, event, fn) => { el.addEventListener(event, fn); listeners.push(() => el.removeEventListener(event, fn)); };
    const button = (host, text, fn) => { const el = add('button', text, host); el.type = 'button'; listen(el, 'click', fn); return el; };
    const official = () => isOfficialServer(ctx.window);
    if (!official()) add('p', '当前服务器不是官服，95折充值已被禁用', root, 'pay-risk');
    const payArea = add('div', '', root); payArea.hidden = !official();
    const riskBox = add('div', '', root, 'pay-risk-box'); root.insertBefore(riskBox, payArea);
    add('strong', '充值与旧卡风险提示', riskBox);
    add('p', '历史通道及旧卡可能失效，存在不到账、无法激活、无奖励或无法退款的风险。请核对账号与收款金额，建议先小额验证；工具不保证补偿。', riskBox);
    button(riskBox, '我已了解，本次登录不再提醒', () => { if (!riskSession.account) return; riskSession.acknowledged = true; riskBox.hidden = true; });
    function updateRisk() { syncRiskSession(); riskBox.hidden = !riskSession.account || riskSession.acknowledged; }
    updateRisk();
    const paymentInfo = add('details', '', payArea, 'sgs-fold'); add('summary', '支付通道说明', paymentInfo);
    add('p', '仅限官服。向 ol-payment.sanguosha.com 发送账号、玩家ID、昵称、元宝数及设备ID，不发送密码。折扣与实付以收银台为准，出码不代表付款或到账。', paymentInfo, 'pay-note');
    const rechargeControls = [];
    const fields = {};
    for (const [key, title, value] of [['account','登录账号',''],['userId','玩家ID',''],['nickname','昵称',''],['yb','元宝数量','3000']]) {
      const label = add('label', title, payArea), input = doc.createElement('input'); input.className = 'sgs-input'; input.value = value; input.autocomplete = 'off'; input.setAttribute('aria-label', title); if (['userId','yb'].includes(key)) input.inputMode = 'numeric'; label.append(input); fields[key] = input; rechargeControls.push(input);
      listen(input, 'input', () => { clearPending(); clearResult(); updatePresets(); });
    }
    function clearPending() { pending = null; confirmation.hidden = true; }
    function clearResult() { releaseResult(); releaseResult = () => {}; result = null; output.replaceChildren(); }
    const presets = add('div', '', payArea, 'pay-row pay-presets');
    const presetButtons = [];
    function updatePresets() { for (const el of presetButtons) el.setAttribute('aria-pressed', String(el.textContent === fields.yb.value.trim())); }
    for (const value of [1,600,3000,6000,12800,32800,64800]) { const el = button(presets, String(value), () => { fields.yb.value = String(value); clearPending(); clearResult(); updatePresets(); }); presetButtons.push(el); rechargeControls.push(el); }
    updatePresets();
    const refreshIdentity = button(payArea, '重新读取账号', () => { clearPending(); clearResult(); readIdentity(true); }); refreshIdentity.className = 'pay-secondary'; rechargeControls.push(refreshIdentity);
    const actions = add('div', '', payArea, 'pay-row');
    const form = () => Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,v.value.trim()]));
    const snapshot = () => String(ctx.game.getSelf()?.ClientId || '');
    function readIdentity(force = false) {
      const self = ctx.game.getSelf(); const current = snapshot();
      if (current !== identity) { identity = current; clearPending(); clearResult(); fields.account.value = ''; fields.userId.value = ''; fields.nickname.value = ''; }
      if (!force) return;
      for (const key of ['LastUserName','SGS_LASTLOGIN_ACCOUNT','SGS_LASTLOGIN_ACCOUNT1']) { const name = ctx.window.localStorage.getItem(key); if (name) { fields.account.value = name; break; } }
      fields.userId.value = current; fields.nickname.value = String(self?.NickName || self?.Nickname || '');
      status.textContent = official() ? (current ? '已读取，请手动核对账号与玩家ID。' : '当前账号尚未就绪，请进入大厅后重试。') : '';
    }
    const queuePayment = kind => {
      if (busy) return; clearPending(); clearResult();
      try { if (!official()) throw Error('仅支持官服页面'); const values = form(); buildPayload(values); pending = { kind, values, identity: snapshot() }; confirmation.hidden = false; confirmText.textContent = `核对本次充值\n${values.yb} 元宝 · ${kind === 'wechat' ? '微信' : '支付宝'}\n账号  ${values.account}\n玩家ID  ${values.userId}\n昵称  ${values.nickname || '未填写'}`; }
      catch (error) { status.textContent = error.message; }
    };
    rechargeControls.push(button(actions, '微信出码', () => queuePayment('wechat')), button(actions, '支付宝出码', () => queuePayment('alipay')));
    function updateControls() { root.querySelectorAll('button,input').forEach(el => el.disabled = busy || (!official() && rechargeControls.includes(el))); }
    updateControls();
    const resultAnchor = add('div', '', root);
    add('h4', '旧周月卡');
    const cardsRow = add('div', '', root, 'pay-row');
    for (const type of [2,3]) button(cardsRow, CARDS[type].name, async () => {
      if (busy) return; clearPending(); clearResult();
      await run(async () => {
        if (!snapshot()) throw Error('请进入游戏大厅后再试');
        const account = snapshot(), proxy = ctx.game.getServerProxy(), welfare = manager('WelfareManger');
        if (!proxy?.on || !proxy?.off || !welfare?.SendClientPrivilegeInfoReq || !welfare?.SendClientPrivilegeDataReq) throw Error('旧卡原生接口尚未就绪');
        const quote = await queryCards(proxy, welfare, controller.signal); if (!valid(account)) return;
        const card = validateCard(type, quote.info, quote.data);
        if (sentCards.has(account + ':' + type)) throw Error('本次已打开过该卡直购，请先在游戏核对订单与卡状态，避免重复购买');
        pending = { type, identity: account }; confirmText.textContent = `确认打开${card.name}原生直购 · 价格字段 ${card.price}（最终币种与金额以游戏收银台为准）。`; confirmation.hidden = false;
      });
    });
    const reminderLabels = {};
    for (const type of [2,3]) {
      const label = add('label', ''), input = doc.createElement('input'); input.type = 'checkbox'; input.className = 'sgs-switch'; input.setAttribute('role','switch'); input.checked = reminders[type]; input.setAttribute('aria-label', CARDS[type].name + '到期提醒'); label.append(input);
      reminderLabels[type] = add('span', ' ' + CARDS[type].name + '到期提醒 · 状态未知', label);
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
        if (job.type) {
          const proxy = ctx.game.getServerProxy(), welfare = manager('WelfareManger');
          const fresh = await queryCards(proxy, welfare, controller.signal); if (!valid(job.identity)) return;
          const card = validateCard(job.type, fresh.info, fresh.data);
          const raw = proxy?._events?.ClientDirectPurchaseRep;
          const buyer = (Array.isArray(raw) ? raw : [raw]).map(x => x?.caller).find(x => typeof x?.WebDirectReq === 'function');
          if (!buyer) throw Error('原生直购入口未就绪，请进入大厅');
          sentCards.add(job.identity + ':' + job.type); buyer.WebDirectReq(card.id, 1);
          status.textContent = '已调用原生直购入口；不代表购买或到账成功，请在游戏核对。'; return;
        }
        if (!official()) throw Error('非官服95折充值已禁用');
        if (JSON.stringify(job.values) !== JSON.stringify(form())) throw Error('表单已变化，请重新核对');
        let udid = ''; try { udid = ctx.window.SgsCensus?.GetDeviceID?.() || ''; } catch {}
        const timeout = setTimeout(() => request.abort(), 15000), request = new AbortController();
        const cancel = () => request.abort(); controller.signal.addEventListener('abort', cancel, { once: true });
        try {
          const response = await ctx.window.fetch(PAY_BASE + job.kind + '/qrcode/order/create', { method: 'POST', credentials: 'omit', signal: request.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload({ ...job.values, udid })) });
          if (!response.ok) throw Error('HTTP ' + response.status);
          const responseData = await response.json(); if (!valid(job.identity)) return;
          result = paymentResult(job.kind, responseData);
          if (result.url && new URL(result.url).hostname !== 'qr.alipay.com') {
            const wrap = add('div', '', output, 'pay-cashier'), viewport = add('div', '', wrap, 'pay-cashier-viewport'), frame = doc.createElement('iframe');
            frame.title = '支付宝最终付款码'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); frame.setAttribute('scrolling', 'no'); frame.referrerPolicy = 'no-referrer';
            const resize = () => {
              const size = wrap.clientWidth || 230, padding = Math.max(14, Math.round(size * .06)), edge = size - padding * 2, scale = edge / 170;
              viewport.style.inset = padding + 'px';
              frame.style.width = Math.ceil((size + 80) / scale) + 'px'; frame.style.height = Math.ceil((size + 260) / scale) + 'px';
              // Current cashier renders its QR at the page origin. Legacy (8,4)
              // subtraction cuts into the first modules and shifts the code up/left.
              // Keep the source origin intact inside a separate, centered viewport;
              // its outer white margin cannot be painted over by the iframe.
              frame.style.transform = `scale(${scale})`; frame.style.left = '0px'; frame.style.top = '0px';
            };
            frame.src = result.url; viewport.append(frame); resize();
            const observer = new ctx.window.ResizeObserver(resize); observer.observe(wrap); releaseResult = () => { observer.disconnect(); frame.remove(); };
            add('p', '支付宝最终付款码；如空白或无法加载，请打开收银台。', output, 'pay-note');
            const backup = add('details', '', output, 'sgs-fold'); add('summary', '备用跳转码（需再跳转一次）', backup);
            const image = doc.createElement('img'); image.alt = '支付宝备用跳转二维码'; image.src = qrData(result.url); backup.append(image);
          } else {
            const image = doc.createElement('img'); image.alt = job.kind === 'wechat' ? '微信付款二维码' : '支付宝最终付款二维码'; image.src = result.image || qrData(result.url); output.append(image);
          }
          if (result.url) { const link = add('a', '打开支付宝收银台', output); link.href = result.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
          add('p', `订单 ${result.order || '未提供订单号'} · ${job.values.account} / ${job.values.userId} · ${job.values.yb}元宝。二维码已生成，付款及到账状态未知。`, output);
          status.textContent = '请核对收银台金额和收款方后付款；如结果不明，请勿重复支付。';
        } finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', cancel); }
      });
    });
    confirmButton.className = 'pay-primary';
    button(confirmActions, '取消', clearPending);
    const status = add('p', '手动出码或查询旧卡，不会自动付款。', root, 'pay-note'); status.setAttribute('role','status');
    const output = add('div', '', root);
    resultAnchor.append(confirmation, status, output);
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
    readIdentity(true);
    const stop = ctx.scope.interval(() => { if (alive) { readIdentity(); updateRisk(); for (const type of [2,3]) reminderLabels[type].textContent = ' ' + CARDS[type].name + '到期提醒 · ' + (cardState[type] === true ? '有效' : cardState[type] === false ? '已到期／未开通' : '状态未知'); } }, 1000);
    return ctx.scope.add(() => { if (!alive) return; alive = false; abort(); releaseResult(); ctx.scope.signal.removeEventListener('abort', abort); clearInterval(stop); listeners.splice(0).forEach(fn => fn()); root.remove(); pending = null; result = null; });
  } });
}
export default { manifest, activate };
