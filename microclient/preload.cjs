// Appended to the original official game preload. No remote script loader.
;(function () {
  try {
    if (window.top !== window.self || window.__SGS_TOOLBOX_MICRO_PRELOAD__) return;
    if (!/^https?:\/\/web\.sanguosha\.com\/220\/h5_2\/index(?:_\d+)?\.php(?:[?#]|$)/.test(window.location.href)) return;
    window.__SGS_TOOLBOX_MICRO_PRELOAD__ = true;
    const electron = require('electron');
    if (window.addEventListener) window.addEventListener('message', async event => {
      const message = event.data;
      if (event.source !== window || !message || message.type !== 'sgs-toolbox-update-request' || typeof message.id !== 'string' || message.id.length > 100 || !['check', 'install', 'rollback'].includes(message.action)) return;
      try { window.postMessage({ type: 'sgs-toolbox-update-result', id: message.id, result: await electron.ipcRenderer.invoke('sgs-toolbox:update:v1', message.action) }, window.location.origin); }
      catch (error) {
        const detail = error.message.replace(/^Error invoking remote method 'sgs-toolbox:update:v1': (?:Error: )?/, '');
        window.postMessage({ type: 'sgs-toolbox-update-result', id: message.id, error: detail }, window.location.origin);
      }
    });
    if (window.addEventListener) window.addEventListener('message', async event => {
      const m = event.data;
      if (event.source !== window || event.origin !== window.location.origin || m?.type !== 'sgs-toolbox-alipay-request' || typeof m.id !== 'string' || m.id.length > 100 || typeof m.url !== 'string' || m.url.length > 65536) return;
      try { window.postMessage({type:'sgs-toolbox-alipay-result', id:m.id, result:await electron.ipcRenderer.invoke('sgs-toolbox:alipay:v1', m.url)}, window.location.origin); }
      catch (e) { window.postMessage({type:'sgs-toolbox-alipay-result', id:m.id, error:e.message}, window.location.origin); }
    });
    if (window.addEventListener) window.addEventListener('message', async event => {
      const message = event.data;
      if (event.source !== window || event.origin !== window.location.origin || message?.type !== 'sgs-toolbox-mobile-skin-request' ||
          typeof message.id !== 'string' || !/^[a-f0-9]{32}$/.test(message.id)) return;
      if (message.cancel === true) { electron.ipcRenderer.send('sgs-toolbox:mobile-skin-cancel:v1', message.id); return; }
      if (typeof message.url !== 'string' || message.url.length > 512 || !Number.isSafeInteger(message.limit)) return;
      const range = message.range;
      if (range !== undefined && (!range || typeof range !== 'object' || Object.keys(range).length > 2 ||
          Object.values(range).some(value => !Number.isSafeInteger(value)))) return;
      try {
        const bytes = await electron.ipcRenderer.invoke('sgs-toolbox:mobile-skin:v1', { id: message.id, url: message.url, limit: message.limit, range });
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-result', id: message.id, bytes }, window.location.origin, [bytes]);
      } catch (error) {
        const detail = error.message.replace(/^Error invoking remote method 'sgs-toolbox:mobile-skin:v1': (?:Error: )?/, '');
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-result', id: message.id, error: detail }, window.location.origin);
      }
    });
    const source = electron.ipcRenderer.sendSync('sgs-toolbox:source:v1');
    if (!source) throw new Error('工具箱微端脚本不可用，请重新运行安装包');
    const bridge = '(' + function () {
      window.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__ = ({ url, limit, range }, signal) => new Promise((resolve, reject) => {
        const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
        const finish = () => {
          window.removeEventListener('message', receive);
          signal?.removeEventListener('abort', cancel);
        };
        const cancel = () => {
          finish();
          window.postMessage({ type: 'sgs-toolbox-mobile-skin-request', id, cancel: true }, location.origin);
          reject(new Error('移动版皮肤资源下载已取消'));
        };
        const receive = event => {
          if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'sgs-toolbox-mobile-skin-result' || event.data.id !== id) return;
          finish();
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.bytes);
        };
        if (signal?.aborted) { reject(new Error('移动版皮肤资源下载已取消')); return; }
        window.addEventListener('message', receive);
        signal?.addEventListener('abort', cancel, { once: true });
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-request', id, url, limit, range }, location.origin);
      });
      window.__SGS_TOOLBOX_ALIPAY_REQUEST__ = options => {
        const id = Date.now() + ':' + Math.random(); let done = false;
        const finish = () => { done = true; clearTimeout(timer); window.removeEventListener('message', receive); };
        const receive = event => {
          if (done || event.source !== window || event.origin !== location.origin || event.data?.type !== 'sgs-toolbox-alipay-result' || event.data.id !== id) return;
          finish(); if (event.data.error) options.onerror({ message: String(event.data.error).replace(/^Error invoking remote method [^:]+: (?:Error: )?/, '') }); else options.onload(event.data.result);
        };
        const timer = setTimeout(() => { finish(); options.ontimeout(); }, 15000);
        window.addEventListener('message', receive);
        window.postMessage({type:'sgs-toolbox-alipay-request', id, url:options.url}, location.origin);
        return {abort() { if (!done) { finish(); options.onabort(); } }};
      };
      window.__SGS_TOOLBOX_SCRIPT_UPDATE__ = action => new Promise((resolve, reject) => {
        const id = Date.now() + ':' + Math.random();
        const finish = event => {
          if (event.source !== window || event.data?.type !== 'sgs-toolbox-update-result' || event.data.id !== id) return;
          clearTimeout(timer); window.removeEventListener('message', finish);
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
        };
        const timer = setTimeout(() => { window.removeEventListener('message', finish); reject(new Error('脚本更新响应超时，请重试检查更新状态')); }, 100000);
        window.addEventListener('message', finish);
        window.postMessage({ type: 'sgs-toolbox-update-request', id, action }, window.location.origin);
      });
    }.toString() + ')();\n';
    electron.webFrame.executeJavaScript(bridge + source + '\nvoid 0;').catch(error => console.error('[工具箱微端]', error));
  } catch (error) { console.error('[工具箱微端]', error); }
})();
