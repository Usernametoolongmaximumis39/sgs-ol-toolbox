import { md5Hex } from './encoding.js';
export const PAY_BASE = 'https://ol-payment.sanguosha.com/v1/';
export function isOfficialServer(win) {
  try {
    const allowed = value => new URL(value).hostname === 'web.sanguosha.com';
    if (!allowed(win.location.href)) return false;
    // Partner portals embed the official game host in a cross-origin frame.
    if (win.top && win.top !== win && !allowed(win.top.location.href)) return false;
    if (Array.from(win.location.ancestorOrigins || []).some(origin => !allowed(origin))) return false;
    const params = new URL(win.location.href).searchParams;
    if (params.has('logout_url') || params.has('cmFlag')) return false;
    const client = params.get('client');
    return !client || ['1100', '110074', '210000'].includes(client);
  } catch { return false; }
}
export const CARDS = Object.freeze({ 2: { id: 12981201, price: 1200, name: '旧周卡' }, 3: { id: 12981501, price: 2800, name: '旧月卡' } });
export function buildPayload(form, timestamp = Math.floor(Date.now() / 1000)) {
  if (!form.account?.trim() || !/^\d{6,12}$/.test(form.userId)) throw Error('请核对登录账号与6–12位玩家ID');
  if (!/^\d+$/.test(String(form.yb)) || !Number.isSafeInteger(Number(form.yb)) || Number(form.yb) < 1 || Number(form.yb) > 9999999) throw Error('元宝数量须为1–9999999的整数');
  const p = { account: form.account.trim(), yb: Number(form.yb), server_id: 1100, channel: '210000', nickname: form.nickname || '', user_id: form.userId };
  if (form.udid) p.udid = form.udid;
  Object.assign(p, { device_model: 'NoDeviceName', osType: 12, user_level: 200, timestamp });
  p.sign = md5Hex(Object.keys(p).sort().map(k => k + '=' + p[k]).join('') + 'IqCUMcHyvGTtw4ThpEky5jtjEl8PG0V5');
  return p;
}
export function paymentResult(kind, response) {
  if (response?.code !== 0) throw Error(String(response?.msg || response?.message || '支付接口返回异常'));
  const code = response.data?.code_url;
  if (typeof code !== 'string' || !code || code.length > 1000000) throw Error('接口未返回有效付款码');
  if (kind === 'wechat') {
    const data = code.startsWith('data:') ? code : 'data:image/png;base64,' + code;
    if (!/^data:image\/(png|jpeg|gif);base64,[a-z\d+/=\r\n]+$/i.test(data)) throw Error('微信付款码格式异常');
    return { image: data, order: String(response.data.order_id || '') };
  }
  const url = new URL(code);
  if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)(alipay\.com|sanguosha\.com)$/.test(url.hostname)) throw Error('收银台地址不在允许的支付域名中');
  return { url: url.href, order: String(response.data.order_id || '') };
}
export function validateCard(type, info, data) {
  const expected = CARDS[type], quote = info?.cards?.find(c => c.cardType === Number(type)), state = data?.datas?.find(c => c.type === Number(type));
  if (!expected || data?.code !== 0 || !quote || !state || quote.cardId !== expected.id || quote.payType !== 1 || quote.priceNum !== expected.price) throw Error('旧卡商品或报价暂不可用，已阻止购买');
  if (state.bActive !== false && state.bActive !== 0) throw Error('旧卡尚未到期或状态未知，已阻止重复购买');
  return expected;
}
export function queryCards(proxy, welfare, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error('查询已取消'));
    const caller = {}; let info, data, timer;
    const finish = error => { clearTimeout(timer); proxy.off('ClientPrivilegeInfoRep', caller, onInfo); proxy.off('ClientPrivilegeDataRep', caller, onData); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve({ info, data }); };
    const check = () => { if (info && data) finish(); };
    const onInfo = packet => { info = packet?.Protocol; check(); };
    const onData = packet => { data = packet?.Protocol; check(); };
    const cancel = () => finish(Error('查询已取消'));
    proxy.on('ClientPrivilegeInfoRep', caller, onInfo); proxy.on('ClientPrivilegeDataRep', caller, onData);
    signal.addEventListener('abort', cancel, { once: true }); timer = setTimeout(() => finish(Error('旧卡状态查询超时，请稍后重试')), 10000);
    try { welfare.SendClientPrivilegeInfoReq(); welfare.SendClientPrivilegeDataReq(); } catch (error) { finish(error); }
  });
}
