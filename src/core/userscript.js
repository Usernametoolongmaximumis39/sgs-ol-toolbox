import { mobileSkinPartialLength, mobileSkinResponseBytes, toolboxDownloadRequest } from './mobile-skin-download.js';
import { PRIVATE_HTTP_LIMIT, PRIVATE_HTTP_TIMEOUT, privateHttpRequest } from '../shared/private-sync-http.js';

function responseHeader(raw, name) {
  if (typeof raw !== 'string') return null;
  const prefix = name + ':';
  const lines = raw.split(/\r?\n/).filter(line => line.toLowerCase().startsWith(prefix));
  return lines.length ? lines.map(line => line.slice(prefix.length).trim()).join(', ') : null;
}

function serveDownloads(port, transport, origin, ready) {
  const requests = new Map();
  port.onmessage = ({ data }) => {
    if (data?.ready === true) { ready(); return; }
    if (data?.close === true) {
      for (const cancel of requests.values()) cancel();
      port.close();
      return;
    }
    const { id } = data ?? {};
    const sync = typeof id === 'string' && /^sync:[1-9]\d{0,15}$/.test(id);
    if (!sync && (!Number.isSafeInteger(id) || id < 1)) return;
    if (data.cancel === true) { requests.get(id)?.(); return; }
    if (requests.has(id)) return;
    if (sync) {
      if (requests.size >= 24) { port.postMessage({ id, error: '同步请求过多' }); return; }
      let request;
      try { request = privateHttpRequest(data, origin); }
      catch (error) { port.postMessage({ id, error: error.message }); return; }
      let handle;
      const finish = result => {
        if (requests.delete(id)) port.postMessage({ id, ...result });
      };
      const cancel = () => { requests.delete(id); handle?.abort?.(); };
      requests.set(id, cancel);
      const onerror = () => finish({ error: '私有 HTTP 同步请求失败' });
      const onload = response => {
        const text = response.responseText;
        if ((response.finalUrl || response.responseURL) !== request.url ||
            typeof text !== 'string' || text.length > PRIVATE_HTTP_LIMIT) return onerror();
        finish({ reply: { status: response.status, text } });
      };
      try {
        handle = transport({ method: 'POST', url: request.url, data: request.body, headers: request.headers,
          anonymous: true, redirect: 'error', timeout: PRIVATE_HTTP_TIMEOUT, onload, onerror, ontimeout: onerror, onabort: onerror,
          onprogress({ loaded, total }) {
            if (loaded > PRIVATE_HTTP_LIMIT || total > PRIVATE_HTTP_LIMIT) { onerror(); cancel(); }
          } });
        if (typeof handle?.then === 'function') void handle.then(onload, onerror);
      } catch { onerror(); }
      return;
    }

    let request;
    try { request = toolboxDownloadRequest(data.url, data.limit, data.range); }
    catch (error) { port.postMessage({ id, error: error.message }); return; }
    const label = request.label || '移动版皮肤资源';
    if (requests.size >= 24) { port.postMessage({ id, error: `${label}下载请求过多，请稍后重试` }); return; }

    let transportRequest, cancelled = false;
    const finish = (error, bytes) => {
      if (!requests.delete(id)) return;
      if (error) port.postMessage({ id, error: error.message });
      else port.postMessage({ id, bytes }, [bytes]);
    };
    const cancel = error => {
      cancelled = true;
      if (error) finish(error);
      else requests.delete(id);
      transportRequest?.abort?.();
    };
    requests.set(id, cancel);
    const responseLength = result => {
      if (!request.range) {
        if (result.status !== 200) throw new Error(`${label}不可用（HTTP ${result.status}）`);
        return;
      }
      const headers = result.responseHeaders;
      return mobileSkinPartialLength(request, result.status, responseHeader(headers, 'content-range'),
        responseHeader(headers, 'content-length'), responseHeader(headers, 'content-encoding'));
    };
    const onload = result => {
      try {
        const size = responseLength(result);
        const finalUrl = result.finalUrl || result.responseURL;
        if (finalUrl !== request.url) throw new Error(`${label}地址发生跳转`);
        finish(null, mobileSkinResponseBytes(result.response, request.limit, size, label));
      } catch (error) { finish(error); }
    };
    const onerror = () => finish(new Error(`${label}下载失败`));
    try {
      transportRequest = transport({ method: 'GET', url: request.url, responseType: 'arraybuffer',
        anonymous: true, redirect: 'error', timeout: request.timeout, onload, onerror,
        ...(request.headers ? { headers: request.headers } : {}),
        onreadystatechange(result) {
          if (!request.range || result.readyState !== 2 || !result.status ||
              (result.status === 206 && !result.responseHeaders)) return;
          try { responseLength(result); } catch (error) { cancel(error); }
        },
        onprogress({ loaded, total }) {
          if (loaded > request.limit || total > request.limit) cancel(new Error(`${label}超过下载上限`));
        },
        ontimeout: () => finish(new Error(`${label}下载超时`)),
        onabort: () => finish(new Error(`${label}下载已取消`)),
      });
      if (cancelled) transportRequest?.abort?.();
      if (typeof transportRequest?.then === 'function') void transportRequest.then(onload, onerror);
    } catch { onerror(); }
  };
}

// Serialized along with the main bundle. It runs in the game page, where the
// native Laya objects, constructors and plugin evaluation share one realm.
function enterPage(token, startPage) {
  const origin = window.location.origin;
  const receive = event => {
    if (event.source !== window || event.origin !== origin || event.data?.type !== 'sgs-toolbox-skins-port' ||
        event.data.token !== token || event.ports.length !== 1) return;
    cleanup();
    const port = event.ports[0];
    port.postMessage({ ready: true });
    startPage(port);
  };
  const timeout = window.setTimeout(() => { cleanup(); startPage(); }, 5000);
  function cleanup() {
    window.clearTimeout(timeout);
    window.removeEventListener('message', receive);
  }
  window.addEventListener('message', receive);
}

export function runUserscript(startPage) {
  const gm = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
    : typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : null;
  if (!gm) { startPage(); return; }
  const { document } = window;
  const page = document.defaultView ?? window;
  const { origin } = page.location;
  const token = [...crypto.getRandomValues(new Uint32Array(4))].join('-');
  let waitForRoot;
  function inject() {
    if (!document.documentElement) return;
    waitForRoot?.disconnect();
    const { port1, port2 } = new MessageChannel();
    const close = () => { port1.close(); port2.close(); };
    const timeout = page.setTimeout(close, 5500);
    serveDownloads(port1, gm, origin, () => page.clearTimeout(timeout));
    const script = document.createElement('script');
    const nonce = document.querySelector('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.textContent = `(${enterPage})(${JSON.stringify(token)}, ${startPage});`;
    // The inline script registers its receiver synchronously. Send from the
    // DOM's WindowProxy so a userscript manager's window facade cannot break
    // the handshake by changing the identity of the reply's event.source.
    document.documentElement.append(script);
    script.remove();
    try { page.postMessage({ type: 'sgs-toolbox-skins-port', token }, origin, [port2]); }
    catch { page.clearTimeout(timeout); close(); }
  }
  if (!document.documentElement) {
    waitForRoot = new MutationObserver(inject);
    waitForRoot.observe(document, { childList: true });
  } else inject();
}
