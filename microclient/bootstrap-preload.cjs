; (function () {
  if (window.top !== window.self || window.__SGS_TOOLBOX_PRELOAD_BOOT__) return;
  window.__SGS_TOOLBOX_PRELOAD_BOOT__ = true;
  let reply;
  try { reply = require('electron').ipcRenderer.sendSync('sgs-toolbox:preload:v1'); } catch (_) {}
  if (reply?.mode === 'skip') return;
  const source = reply?.mode === 'code' && typeof reply.source === 'string' && reply.source.trim()
    ? reply.source : bundledPreloadSource;
  new Function('require', source)(require);
})();
