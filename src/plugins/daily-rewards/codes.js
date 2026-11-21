import { read } from '../../shared/safe-read.js';
// Native GiftManager.SendGetGift is the ordinary GiftExchangeWindow request.
// No remote code lists, window creation or inter-plugin dependencies.
const MAX_TEXT = 16000;
const MAX_CODES = 100;
const SUCCESS = new Set([1, 2, 16]);
const FAILURE = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18]);
const EVENT = 'ClientPickupgiftbagRep';

export const managerSpecs = {
  GiftManager: {
    events: [EVENT],
    guard: value => typeof value?.SendGetGift === 'function',
  },
};

export function parseCodes(text) {
  const result = { codes: [], invalid: 0, duplicates: 0, overflow: 0, tooLong: false };
  if (typeof text !== 'string') return result;
  // Never turn a truncated pasted token into a different code.
  if (text.length > MAX_TEXT) return { ...result, tooLong: true };
  const seen = new Set();
  const content = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => !line.trimStart().startsWith('#')).join('\n');
  for (const code of content.split(/[\s,;，；]+/u).filter(Boolean)) {
    // Native entry fields allow up to 40 characters; wire CDKey has 64 bytes.
    if ([...code].length > 40 || new TextEncoder().encode(code).length > 64 || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(code)) {
      result.invalid++; continue;
    }
    if (seen.has(code)) { result.duplicates++; continue; }
    seen.add(code);
    if (result.codes.length >= MAX_CODES) { result.overflow++; continue; }
    result.codes.push(code);
  }
  return result;
}

export const CLIPBOARD_PARSER_VERSION = 3;
// Recognize whole short phrases only; never extract tokens from prose or status.
function shortClipboardPhrase(code) {
  if (!/^[\p{Script=Han}A-Za-z0-9]{4,14}$/u.test(code)) return false;
  const han = (code.match(/\p{Script=Han}/gu) || []).length;
  const ascii = (code.match(/[A-Za-z0-9]/g) || []).length;
  const status = /已确认|未确认|已领取|未领取|领取成功|领取失败|兑换成功|兑换失败|未收到|已跳过|已忽略|已开启|已关闭|已停止|等待|正在|本轮|剪贴板|服务器|自动领取|读取|新增|成功上报/;
  return !status.test(code) && han <= 8 && ascii <= 6 && (han >= 4 || (han >= 3 && ascii > 0));
}

export function parseClipboardCodes(text, known = new Set()) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return { text: '', reason: '剪贴板不是可识别的兑换码列表，已忽略' };
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
  const codes = []; let skipped = 0;
  for (const line of lines) {
    const marked = /^\s*(?:兑换码|礼包码|激活码|CDKEY)\s*[:：]\s*(\S+)\s*$/i.exec(line);
    const tokens = marked ? [marked[1]] : line.trim().split(/[\s,;，；]+/u);
    const accepted = [];
    for (const code of tokens) {
      const valid = /^[\p{Script=Han}A-Za-z0-9!！_-]{3,40}$/u.test(code) && new TextEncoder().encode(code).length <= 64;
      const serial = /^[A-Za-z0-9_-]{6,40}$/.test(code) && /[A-Za-z]/.test(code) && /\d/.test(code);
      if (!valid || (!marked && !serial && !known.has(code) && !shortClipboardPhrase(code)) ||
          (!marked && line.trim() !== code && !serial && !known.has(code))) break;
      accepted.push(code);
    }
    // Never extract a plausible token from a prose line, but keep independent lines.
    if (accepted.length !== tokens.length) { skipped++; continue; }
    codes.push(...accepted);
  }
  if (codes.length > MAX_CODES) return { text: '', reason: '剪贴板兑换码过多，已忽略' };
  return { text: [...new Set(codes)].join('\n'), skipped,
    reason: skipped ? `已跳过 ${skipped} 行无法识别的内容；中文口令请每行一个，特殊口令可标注“兑换码：口令”` : '' };
}

export function codeAttemptLabel(key) {
  if (!key.startsWith('code:')) return null;
  try { return `兑换码 · ${decodeURIComponent(key.slice(5))}`; }
  catch { return '兑换码 · 历史标识无法解码'; }
}

// Fail closed for opaque keys, including all mixed ASCII digit/letter serials.
// The service must additionally check its manually verified universal-code list.
export function shareableCode(code) {
  return typeof code === 'string' && parseCodes(code).codes.length === 1 &&
    /^[\p{Script=Han}A-Za-z0-9！!_-]{4,40}$/u.test(code) && /\p{Script=Han}/u.test(code) &&
    !/[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*|[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*/u.test(code);
}

// Candidates remain private until the remote service has two independent reports.
export function reportableCode(code) {
  return typeof code === 'string' && /^[\p{Script=Han}A-Za-z0-9！!_-]{3,40}$/u.test(code) && new TextEncoder().encode(code).length <= 64;
}

function replyMatches(message, code) {
  const protocol = read(() => message.Protocol);
  // Old server replies lacking an echoed key cannot confirm this request.
  // Type/mid separate ordinary exchange from mail and other gift flows.
  return protocol && protocol.CDKey === code && protocol.Type === 0 &&
    (protocol.mid === '0' || protocol.mid === 0) && Number.isInteger(protocol.Result)
    ? protocol : null;
}

export function planCodes(adapter, selected = {}) {
  const actions = [], notes = [];
  if (!selected.codes) return { actions, notes };
  const parsed = parseCodes(selected.codeText);
  const note = text => notes.push({ category: 'codes', text });
  if (parsed.tooLong) note('兑换码文本超过 16000 字符，请分批填写；本轮未发送');
  if (parsed.invalid) note(`${parsed.invalid} 个兑换码格式或长度无效，已跳过`);
  if (parsed.duplicates) note(`已合并 ${parsed.duplicates} 个重复兑换码（区分大小写）`);
  if (parsed.overflow) note(`每次最多处理 ${MAX_CODES} 个不同兑换码，超出部分已跳过`);
  if (!parsed.codes.length) {
    if (!parsed.tooLong && !parsed.invalid) note('未填写兑换码');
    return { actions, notes };
  }
  const manager = read(() => adapter.manager('GiftManager'));
  const proxy = read(() => adapter.proxy());
  const ready = () => manager && manager.destroyed !== true &&
    read(() => adapter.manager('GiftManager')) === manager &&
    typeof manager.SendGetGift === 'function' && proxy && proxy.destroyed !== true &&
    read(() => adapter.proxy()) === proxy && typeof proxy.on === 'function' && typeof proxy.off === 'function';
  if (!ready()) {
    note('等待游戏兑换码接口及服务器回包监听就绪');
    return { actions, notes };
  }
  for (const code of parsed.codes) {
    actions.push({
      key: `code:${encodeURIComponent(code)}`, category: 'codes', label: '兑换码', code,
      manager, permanent: true,
      eligible: () => Boolean(ready()),
      done: () => false,
      send: () => { if (!ready()) return false; return manager.SendGetGift(0, code, 0); },
      confirmations: [{ manager: proxy, event: EVENT, accept: message => SUCCESS.has(replyMatches(message, code)?.Result) }],
      rejections: [{ manager: proxy, event: EVENT, accept: message => FAILURE.has(replyMatches(message, code)?.Result),
        text: message => `兑换未成功（游戏结果码 ${replyMatches(message, code)?.Result}），不再自动尝试` }],
    });
  }
  return { actions, notes };
}
