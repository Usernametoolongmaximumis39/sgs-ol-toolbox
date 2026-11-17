const MESSAGE = 'sgs-toolbox-alipay-final-qr-v1';
export function finalAlipayURL(value) {
  const url = new URL(value);
  if (url.origin !== 'https://qr.alipay.com' || url.username || url.password || !/^\/[a-z\d]+$/i.test(url.pathname)) throw Error('支付宝最终付款码地址异常');
  return url.href;
}
export function readAlipayCashier(doc) {
  if (typeof doc?.querySelector !== 'function') throw Error('支付宝收银台文档不可读取');
  const input = doc.querySelector('input#J_qrCode');
  if (!input?.value) throw Error('收银台尚未提供最终付款码');
  return finalAlipayURL(input.value);
}
// Runs only on the gateway frame matched by userscript metadata. The game
// parent requests one QR value; no account, order parameters or HTML are sent.
export function installAlipayCashierBridge(win) {
  if (!(win.location.origin === 'https://openapi.alipay.com' && win.location.pathname === '/gateway.do')
    && !(win.location.origin === 'https://excashier.alipay.com' && win.location.pathname === '/standard/auth.htm')) return false;
  if (win.parent === win) return true;
  let observer = null, timer = null;
  const release = () => { observer?.disconnect(); observer = null; win.clearTimeout(timer); };
  win.addEventListener('message', event => {
    if (event.source !== win.parent || event.origin !== 'https://web.sanguosha.com' || event.data?.type !== MESSAGE || typeof event.data.nonce !== 'string' || event.data.nonce.length > 100) return;
    release();
    const send = () => {
      try { const url = readAlipayCashier(win.document); win.parent.postMessage({ type: MESSAGE, nonce: event.data.nonce, url }, event.origin); release(); } catch {}
    };
    observer = new win.MutationObserver(send); observer.observe(win.document, { childList: true, subtree: true, attributes: true });
    timer = win.setTimeout(release, 15000); send();
  });
  win.addEventListener('pagehide', release, { once: true });
  return true;
}
export function resolveAlipayCashier(win, value, signal, request = null) {
  const url = new URL(value);
  if (url.hostname === 'qr.alipay.com') return Promise.resolve(finalAlipayURL(value));
  if (url.origin !== 'https://openapi.alipay.com' || url.pathname !== '/gateway.do' || url.username || url.password || url.searchParams.get('method') !== 'alipay.trade.page.pay') return Promise.reject(Error('不是可解析的支付宝收银台地址'));
  if (request) return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error('解析已取消'));
    let handle = null, done = false;
    const finish = (error, result) => { if (done) return; done = true; win.clearTimeout(timer); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(result); };
    const cancel = () => { finish(Error('解析已取消')); handle?.abort(); };
    const timer = win.setTimeout(() => { finish(Error('支付宝付款码解析超时，可重试解析同一订单')); handle?.abort(); }, 15000);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      handle = request({ method: 'GET', url: url.href, anonymous: true, timeout: 15000, responseType: 'text',
        onload(response) {
          if (done) return;
          try {
            if (response.status !== 200) throw Error('支付宝收银台 HTTP ' + response.status);
            const final = new URL(response.finalUrl || url.href);
            if (!((final.origin === 'https://openapi.alipay.com' && final.pathname === '/gateway.do') || (final.origin === 'https://excashier.alipay.com' && final.pathname === '/standard/auth.htm'))) throw Error('支付宝收银台跳转地址异常');
            if (typeof response.responseText !== 'string' || response.responseText.length > 2 * 1024 * 1024) throw Error('支付宝收银台内容异常');
            // The game or another userscript may replace window.DOMParser with
            // an XML parser returning plain objects. A native template parses
            // inert HTML without consulting that global or executing scripts.
            const template = win.document.createElement('template');
            template.innerHTML = response.responseText;
            finish(null, readAlipayCashier(template.content));
          } catch (error) { finish(error); }
        },
        onerror: () => finish(Error('无法读取支付宝收银台，可重试解析同一订单')),
        ontimeout: () => finish(Error('支付宝付款码解析超时，可重试解析同一订单')),
        onabort: () => finish(Error('解析已取消')),
      });
      if (done && signal.aborted) handle?.abort();
    } catch (error) { finish(error); }
  });
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error('解析已取消'));
    const frame = win.document.createElement('iframe'), nonce = win.crypto.randomUUID?.() || String(Date.now()) + ':' + Math.random();
    frame.title = '解析支付宝付款码'; frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;visibility:hidden';
    frame.referrerPolicy = 'no-referrer'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; win.clearTimeout(timer); win.removeEventListener('message', receive); signal.removeEventListener('abort', cancel); frame.remove(); error ? reject(error) : resolve(result); };
    const cancel = () => finish(Error('解析已取消'));
    const receive = event => {
      if (event.source !== frame.contentWindow || !['https://openapi.alipay.com', 'https://excashier.alipay.com'].includes(event.origin) || event.data?.type !== MESSAGE || event.data.nonce !== nonce) return;
      try { finish(null, finalAlipayURL(event.data.url)); } catch (error) { finish(error); }
    };
    const timer = win.setTimeout(() => finish(Error('支付宝付款码解析超时，请更新核心后重试解析')), 15000);
    win.addEventListener('message', receive); signal.addEventListener('abort', cancel, { once: true });
    frame.onload = () => {
      // The official microclient permits reading its cashier frame. Browsers
      // use the narrowly matched userscript bridge without disabling CORS.
      try { const result = readAlipayCashier(frame.contentDocument); finish(null, result); return; } catch {}
      frame.contentWindow?.postMessage({ type: MESSAGE, nonce }, url.origin);
      frame.contentWindow?.postMessage({ type: MESSAGE, nonce }, 'https://excashier.alipay.com');
    };
    frame.src = url.href; win.document.body.append(frame);
  });
}
