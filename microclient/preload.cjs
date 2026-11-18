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
    const source = electron.ipcRenderer.sendSync('sgs-toolbox:source:v1');
    if (!source) throw new Error('工具箱微端脚本不可用，请重新运行安装包');
    const bridge = '(' + function () {
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
