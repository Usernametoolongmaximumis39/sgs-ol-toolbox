import { MICROCLIENT } from './distribution.js';

export function createPrivateHttpTransport(win, port) {
  if (!port && !MICROCLIENT) return undefined;
  const source = port || win;
  const origin = win.location.origin;
  const send = port ? data => port.postMessage(data)
    : data => win.postMessage({ type: 'sgs-toolbox-private-sync-http', ...data }, origin);
  let nextId = 0;
  return (request, signal) => new Promise((resolve, reject) => {
    const id = port ? 'sync:' + ++nextId : Array.from(win.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    function finish() {
      source.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
    }
    function receive(event) {
      const { data } = event;
      if (data?.id !== id) return;
      if (!port && (event.source !== win || event.origin !== origin || data.type !== 'sgs-toolbox-private-sync-http-result')) return;
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.reply);
    }
    function abort() {
      finish();
      try { send({ id, cancel: true }); } catch { /* transport already closed */ }
      reject(new Error('私有同步请求已取消'));
    }
    if (signal.aborted) return reject(new Error('私有同步请求已取消'));
    source.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    try { send({ id, ...request }); }
    catch (error) { finish(); reject(error); }
  });
}
