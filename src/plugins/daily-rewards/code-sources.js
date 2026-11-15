import { parseCodes, shareableCode, reportableCode } from './codes.js';

export const DEFAULT_CODE_SERVER = 'http://127.0.0.1:17321';
export function codeServerUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('请输入 http://127.0.0.1:端口 格式的服务地址'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || !['/', '/reward-codes.txt'].includes(url.pathname)) {
    throw new Error('兑换码服务地址须为 http://127.0.0.1:端口，不支持其他主机或路径');
  }
  return url.origin;
}

export function mergeCodeText(current, incoming) {
  if (typeof incoming !== 'string') throw new Error('没有读取到文本');
  const parsed = parseCodes(incoming);
  if (parsed.tooLong) throw new Error('读取文本超过 16000 字符，请分批处理');
  if (parsed.overflow) throw new Error('读取到超过 100 个兑换码，请分批处理');
  if (current.length > 16000) throw new Error('现有兑换码文本过长，请先整理');
  const previous = parseCodes(current);
  if (previous.overflow) throw new Error('现有兑换码超过 100 个，请先分批处理');
  const codes = [...new Set([...previous.codes, ...parsed.codes])];
  if (codes.length > 100) throw new Error('合并后超过 100 个兑换码，请先兑换或清理当前列表');
  return { text: codes.join('\n'), count: parsed.codes.length, added: codes.length - previous.codes.length, invalid: parsed.invalid };
}

export function createCodeSources(win, { core } = {}) {
  const sessionKey = Symbol.for('sgs.ol.toolbox.daily-rewards.server-session');
  const serverSession = win[sessionKey] ||= { checked: false, text: '', url: '', promise: null };
  let clipboardDenied = false;
  const cacheKey = baseUrl => 'sgstoolbox:reward-codes-cache:' + codeServerUrl(baseUrl);
  function cached(baseUrl) {
    try {
      const value = JSON.parse(win.localStorage?.getItem(cacheKey(baseUrl)) || 'null');
      if (typeof value?.text === 'string' && value.text.length <= 16000 && /^"[a-f0-9]{64}"$/.test(value.etag)) return value;
    } catch { /* A missing public-code cache must not prevent startup. */ }
    return null;
  }
  return {
    get communityConfirmations() { return serverSession.communityConfirmations === true; },
    serverSession,
    resumeClipboard() { clipboardDenied = false; },
    canReadClipboard() { return !clipboardDenied && win.document?.visibilityState !== 'hidden' && (typeof win.document?.hasFocus !== 'function' || win.document.hasFocus()); },
    defaultUrl: win.location?.hostname === '127.0.0.1' && win.location?.protocol === 'http:' ? win.location.origin : DEFAULT_CODE_SERVER,
    async readServer(baseUrl, { signal } = {}) {
      const previous = cached(baseUrl);
      // Query validation avoids an extra CORS preflight for If-None-Match.
      const url = codeServerUrl(baseUrl) + '/reward-codes.txt' + (previous ? '?since=' + previous.etag.slice(1, -1) : '');
      const aborter = new AbortController();
      const abort = () => aborter.abort();
      if (signal?.aborted) throw new Error('读取已取消');
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 6000);
      try {
        const response = await win.fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: aborter.signal });
        serverSession.communityConfirmations = response.headers.get('x-redeem-protocol') === 'two-confirmations-v1';
        if (response.status === 304 && previous) return previous.text;
        if (!response.ok) throw new Error(`兑换码文件读取失败（HTTP ${response.status}）`);
        if (!/^text\/plain(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('服务端返回的不是纯文本兑换码文件');
        if (Number(response.headers.get('content-length')) > 64000) throw new Error('兑换码文件超过 64 KB');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('浏览器不支持读取兑换码文件');
        const chunks = []; let length = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 64000) throw new Error('兑换码文件超过 64 KB');
            chunks.push(value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        if (aborter.signal.aborted) throw new Error('读取已取消或超时');
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new Error('兑换码文件需要保存为 UTF-8 文本'); }
        const etag = response.headers.get('etag');
        if (text.length <= 16000 && /^"[a-f0-9]{64}"$/.test(etag || '')) {
          try { win.localStorage?.setItem(cacheKey(baseUrl), JSON.stringify({ text, etag })); } catch { /* Optional cache. */ }
        }
        return text;
      } catch (error) {
        if (signal?.aborted) throw new Error('读取已取消');
        if (aborter.signal.aborted) throw new Error('连接本机兑换码服务超时');
        if (error instanceof TypeError) throw new Error('无法连接兑换码服务，请确认服务已启动并授予浏览器网络访问权限');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    },
    readClipboard() {
      if (typeof win.navigator?.clipboard?.readText !== 'function') { clipboardDenied = true; return Promise.reject(new Error('浏览器不支持读取剪贴板，可在游戏兑换入口粘贴')); }
      return win.navigator.clipboard.readText().catch(() => { clipboardDenied = true; throw new Error('剪贴板读取未获允许，允许后重新开启剪贴板选项'); });
    },
    async shareCode(baseUrl, code, { signal, account } = {}) {
      if (!(serverSession.communityConfirmations ? reportableCode(code) : shareableCode(code)) || signal?.aborted) return false;
      let report = { code };
      if (serverSession.communityConfirmations) {
        if (!account) return false;
        const accountHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('redeem.3gs.xyz:v1:' + account)))].map(value => value.toString(16).padStart(2, '0')).join('');
        if (signal?.aborted) return false;
        report = { code, account: accountHash, confirmed: true };
        const edition = core?.distribution;
        if (['dev', 'full', 'lite'].includes(edition)) report.coreEdition = edition;
      }
      const control = new AbortController(), abort = () => control.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 6000);
      try {
        const response = await win.fetch(codeServerUrl(baseUrl) + '/reward-codes/share', {
          method: 'POST', credentials: 'omit', redirect: 'error', signal: control.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report),
        });
        if (!response.ok) throw new Error('通用兑换码共享失败');
        return true;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    },
  };
}
