import { buildPayload, isOfficialServer, PAY_BASE, paymentResult } from './payment.js';
import { qrData } from './encoding.js';
import { resolveAlipayCashier } from '../../shared/alipay-cashier.js';
import { createRechargeControls } from './native-controls.js';

// The registered RechargeWindow owns only the yuanbao gear list. Its month-card
// button opens a different window and never calls this handler.
export function installNativeRecharge(ctx, enabled, setEnabled = value => ctx.settings?.set('replaceNativeRecharge', value)) {
  const patched = new WeakSet();
  let close = () => {}, active = null, stopped = false;
  const account = () => String(ctx.game.getSelf()?.ClientId || '');
  const controls = createRechargeControls(ctx, enabled, setEnabled, () => close());
  function open(owner) {
    close();
    const self = ctx.game.getSelf(), id = account();
    let login = '';
    for (const key of ['LastUserName', 'SGS_LASTLOGIN_ACCOUNT', 'SGS_LASTLOGIN_ACCOUNT1']) {
      login = ctx.window.localStorage.getItem(key) || ''; if (login) break;
    }
    const custom = controls.amount(owner), selectedRmb = owner.rmb;
    const values = { account: login, userId: id, nickname: String(self?.NickName || self?.Nickname || ''), yb: custom || String(Math.round(owner.rmb * 100)) };
    try { buildPayload(values); } catch (error) { ctx.notify('无法替换充值出码：' + error.message); return; }
    const doc = ctx.document, overlay = doc.createElement('div'), dialog = doc.createElement('section');
    overlay.dataset.sgsRechargeCashier = ''; overlay.append(dialog); doc.body.append(overlay);
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '95折元宝直充'); dialog.tabIndex = -1;
    const style = doc.createElement('style'); style.textContent = `
      [data-sgs-recharge-cashier]{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483646;display:grid;place-items:center;padding:16px;background:#0009;color:var(--sgs-text,#eee3cc);font:14px/1.65 sans-serif}
      [data-sgs-recharge-cashier] *{box-sizing:border-box}
      [data-sgs-recharge-cashier] section{width:360px;max-width:100%;max-height:90vh;overflow:auto;background:var(--sgs-bg,#24221e);border:1px solid var(--sgs-border,#665b42);border-radius:14px;padding:20px;box-shadow:0 16px 60px #0008}
      [data-sgs-recharge-cashier] h3{margin:0 0 12px;font-size:18px;color:var(--sgs-accent,#dbba70)}
      [data-sgs-recharge-cashier] p{margin:8px 0;overflow-wrap:anywhere;white-space:pre-line}
      [data-sgs-recharge-cashier] .channels{display:flex;gap:8px;margin:16px 0}
      [data-sgs-recharge-cashier] button{font:inherit;border:1px solid var(--sgs-border,#665b42);border-radius:8px;background:var(--sgs-surface,#302d26);color:var(--sgs-text,#eee3cc);padding:9px 14px;cursor:pointer;min-height:40px}
      [data-sgs-recharge-cashier] .channels button{flex:1;white-space:nowrap}
      [data-sgs-recharge-cashier] button[aria-pressed=true]{border-color:var(--sgs-accent,#dbba70);color:var(--sgs-accent,#dbba70);background:#413927}
      [data-sgs-recharge-cashier] button:focus-visible,[data-sgs-recharge-cashier] a:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:2px}
      [data-sgs-recharge-cashier] button:disabled{opacity:.45;cursor:default}
      [data-sgs-recharge-cashier] img{display:block;width:100%;max-width:280px;margin:12px auto;background:white;padding:10px;border-radius:8px}
      [data-sgs-recharge-cashier] .cashier-frame{position:relative;overflow:hidden;margin:12px auto;background:white;border-radius:8px;max-width:280px}
      [data-sgs-recharge-cashier] .cashier-frame iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:white}
      [data-sgs-recharge-cashier] a{color:var(--sgs-accent,#dbba70)}
      [data-sgs-recharge-cashier] .note{font-size:12px;color:var(--sgs-muted,#b7aa8c)}
    `; overlay.append(style);
    const add = (tag, text, parent = dialog) => { const el = doc.createElement(tag); el.textContent = text; parent.append(el); return el; };
    add('h3', '95折元宝直充');
    add('p', `${values.yb} 元宝 · 原价 ${Number(values.yb) / 100} 元\n玩家ID ${id}\n账号 ${login}`);
    add('p', '仅替换本次元宝直充。历史通道可能失效，存在不到账、无奖励或无法退款风险；折扣与实付以收银台为准。').className = 'note';
    add('p', '出码将向 ol-payment.sanguosha.com 发送当前账号、玩家ID、昵称、元宝数和设备ID，不发送密码。付款需手动完成。').className = 'note';
    const channels = add('div', ''); channels.className = 'channels';
    let kind = owner.isZfb === false ? 'wechat' : 'alipay', busy = false, live = true;
    const buttons = [];
    for (const [key, name] of [['alipay', '支付宝'], ['wechat', '微信支付']]) {
      const button = add('button', name, channels); button.type = 'button'; buttons.push([button, key]);
      button.onclick = () => { kind = key; for (const [el, value] of buttons) el.setAttribute('aria-pressed', String(value === kind)); };
      button.setAttribute('aria-pressed', String(key === kind));
    }
    const submit = add('button', '确认并生成95折二维码'); submit.type = 'button';
    const status = add('p', '请核对当前账号、金额并选择支付渠道。'); status.setAttribute('role', 'status'); status.className = 'note';
    const output = add('div', '');
    const dismiss = add('button', '关闭'); dismiss.type = 'button';
    let request = null, cachedResult = null, releaseFrame = () => {};
    const applyTheme = value => { for (const [key, color] of Object.entries(value?.tokens || {})) overlay.style.setProperty('--sgs-' + key, color); };
    applyTheme(ctx.themes?.current);
    const releaseTheme = ctx.themes?.subscribe?.(applyTheme) || (() => {});
    const previousFocus = doc.activeElement;
    close = () => { if (!live) return; live = false; request?.abort(); releaseFrame(); releaseTheme(); overlay.remove(); doc.removeEventListener('keydown', keydown, true); active = null; previousFocus?.focus?.(); };
    dismiss.onclick = close;
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled),a[href]')];
        const index = items.indexOf(doc.activeElement), next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
        event.preventDefault(); items[next]?.focus();
      }
    }
    doc.addEventListener('keydown', keydown, true); dialog.focus(); active = { owner, id, rmb: owner.rmb };
    const valid = () => live && !stopped && !ctx.scope.signal.aborted && enabled() && account() === id && isOfficialServer(ctx.window) && !owner.destroyed && owner.parent && owner.visible !== false && owner.rmb === selectedRmb && controls.amount(owner) === custom;
    submit.onclick = async () => {
      if (busy || !valid()) return;
      busy = true; submit.disabled = true; buttons.forEach(([el]) => el.disabled = true); output.replaceChildren();
      status.textContent = '正在生成二维码…'; request = new AbortController();
      const timer = setTimeout(() => request.abort(), 15000);
      try {
        let udid = ''; try { udid = ctx.window.SgsCensus?.GetDeviceID?.() || ''; } catch {}
        if (!cachedResult) {
          const response = await ctx.window.fetch(PAY_BASE + kind + '/qrcode/order/create', { method: 'POST', credentials: 'omit', signal: request.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload({ ...values, udid })) });
          if (!valid()) return;
          if (!response.ok) throw Error('HTTP ' + response.status);
          const data = await response.json(); if (!valid()) return;
          cachedResult = paymentResult(kind, data);
        }
        const result = { ...cachedResult };
        clearTimeout(timer);
        if (result.url && new URL(result.url).hostname === 'openapi.alipay.com') {
          status.textContent = '正在解析支付宝最终付款码…';
          result.url = await (ctx.payments?.resolveAlipayCashier ? ctx.payments.resolveAlipayCashier(result.url, request.signal) : resolveAlipayCashier(ctx.window, result.url, request.signal));
          if (!valid()) return;
        }
        let imageHost = output;
        if (result.url && new URL(result.url).hostname !== 'qr.alipay.com') {
          const wrap = add('div', '', output); wrap.className = 'cashier-frame';
          const viewport = add('div', '', wrap); viewport.style.cssText = 'position:absolute;overflow:hidden;background:white';
          const frame = add('iframe', '', viewport); frame.title = '支付宝最终付款码'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); frame.setAttribute('scrolling', 'no'); frame.referrerPolicy = 'no-referrer';
          const resize = () => {
            const size = wrap.clientWidth || 230, padding = Math.max(14, Math.round(size * .06)), scale = (size - padding * 2) / 170;
            wrap.style.height = size + 'px'; for (const side of ['top', 'right', 'bottom', 'left']) viewport.style[side] = padding + 'px';
            frame.style.width = Math.ceil((size + 80) / scale) + 'px'; frame.style.height = Math.ceil((size + 260) / scale) + 'px'; frame.style.transform = `scale(${scale})`;
          };
          frame.src = result.url; resize(); const observer = new ctx.window.ResizeObserver(resize); observer.observe(wrap); releaseFrame = () => observer.disconnect();
          imageHost = add('details', '', output); add('summary', '备用跳转码', imageHost);
        }
        const image = add('img', '', imageHost); image.alt = kind === 'wechat' ? '微信付款二维码' : '支付宝最终付款二维码'; image.src = result.image || qrData(result.url);
        if (result.url) { const link = add('a', '打开支付宝收银台', output); link.href = result.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        status.textContent = '请核对实付金额和收款方；出码不代表付款或到账。';
        submit.hidden = true;
      } catch (error) {
        if (valid()) {
          status.textContent = '出码未确认：' + error.message + (cachedResult ? '。可重试解析当前订单，不会重新下单。' : '。请先核对订单，避免重复支付。');
          if (cachedResult?.url) {
            submit.textContent = '重试解析当前订单'; submit.disabled = false;
            const link = add('a', '打开当前订单收银台', output); link.href = cachedResult.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          }
        }
      }
      finally { clearTimeout(timer); busy = false; /* Keep the order/channel locked until the cashier is closed. */ }
    };
  }
  const intercept = original => function (...args) {
    if (!enabled() || !isOfficialServer(ctx.window) || this.isOfficial !== true || this.isQR || this.destroyed || this.visible === false) return Reflect.apply(original, this, args);
    // Confirm the selected value comes from this window's actual direct-charge
    // gear list, rather than accepting a number from a generic purchase window.
    const custom = controls.amount(this);
    if (custom && !/^[1-9]\d{0,6}$/.test(custom)) { ctx.notify('自定义元宝数量须为1–9999999的整数'); return; }
    if (!custom && (!Number.isFinite(this.rmb) || this.rmb <= 0 || !this.items?.some(item => item.RMB === this.rmb))) return Reflect.apply(original, this, args);
    return open(this);
  };
  function scan() {
    if (active && (!enabled() || account() !== active.id || active.owner.destroyed || !active.owner.parent || active.owner.visible === false || active.owner.rmb !== active.rmb || !isOfficialServer(ctx.window))) close();
    const Type = ctx.game.getClass('RechargeWindow');
    if (typeof Type !== 'function' || typeof Type.prototype.onOKClick !== 'function') { controls.refresh([]); return; }
    if (!patched.has(Type.prototype)) { patched.add(Type.prototype); ctx.scope.patch(Type.prototype, 'onOKClick', intercept); }
    const queue = [ctx.window.Laya?.stage], seen = new Set(), owners = [];
    for (let i = 0; i < queue.length && i < 4000; i++) {
      const node = queue[i]; if (!node || seen.has(node) || node.destroyed) continue; seen.add(node);
      if (node instanceof Type) {
        owners.push(node);
        const raw = node.okBtn?._events?.click;
        for (const handler of Array.isArray(raw) ? raw : [raw]) {
          if (handler?.caller !== node || typeof handler.method !== 'function' || patched.has(handler)) continue;
          patched.add(handler); ctx.scope.patch(handler, 'method', intercept);
        }
      }
      if (Array.isArray(node._children)) queue.push(...node._children);
    }
    controls.refresh(isOfficialServer(ctx.window) ? owners : []);
  }
  scan(); ctx.scope.interval(scan, 250);
  ctx.scope.add(() => { stopped = true; close(); });
  return { refresh: scan };
}
