import { CONFIRMED_BAISHENG_HASHES } from './confirmed-mode-hashes.js';
// An index bound only; classification requires an exact SHA-256 match, never
// candidate count, chosen generals, match duration, or date alone.
export const needsModeReview = row => row.modeClassification === 'baisheng' || (row.source === 'xiaochao' && row.mode === 26
  && row.time >= 1791059866096 && row.time <= 1791088387804);
export async function reviewModeEvidence(records, accountId, { crypto = globalThis.crypto, signal } = {}) {
  const candidates = records.filter(needsModeReview);
  if (!candidates.length) return records;
  if (!crypto?.subtle) throw new Error('浏览器缺少历史模式核对能力，请在HTTPS游戏页使用');
  const matched = new Set(candidates.filter(row => row.modeClassification === 'baisheng'));
  for (let i = 0; i < candidates.length; i += 64) {
    if (signal?.aborted) throw new Error('历史模式核对已取消');
    await Promise.all(candidates.slice(i, i + 64).map(async row => {
      const identity = JSON.stringify([String(accountId), String(row.id).replace(/^xc:/, ''), row.time,
        [...new Set(row.general)].sort((a, b) => a - b), row.selected === null ? null : [...new Set(row.selected)].sort((a, b) => a - b)]);
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (CONFIRMED_BAISHENG_HASHES.has(hash)) matched.add(row);
    }));
  }
  if (signal?.aborted) throw new Error('历史模式核对已取消');
  if (!matched.size) return records;
  return records.filter(row => !matched.has(row));
}

// Native game model IDs and old collector's normalized labels are separate
// number spaces. In particular native 35 is AI and native 44 is DLZ, not DDZ/1v1.
export function nativeModeId(value) { return new Map([[132, 26], [148, 35], [149, 35], [160, 44]]).get(Number(value)) || 0; }
export function nativeModeEvidence(context) {
  let value, source;
  try {
    if (typeof context?.GetModeType === 'function') { value = context.GetModeType(); source = 'native-mode-type'; }
    else { const vo = context?.GetModeVO?.(); value = vo?.Model ?? vo?.ModeID ?? vo?.ModeId; source = 'native-mode-vo'; }
    const group = typeof context?.GetGroupID === 'function' ? context.GetGroupID() : null;
    return { mode: nativeModeId(value), rawMode: Number.isSafeInteger(Number(value)) ? Number(value) : null,
      rawGroup: Number.isSafeInteger(Number(group)) && group != null ? Number(group) : null, modeEvidence: source };
  } catch { return { mode: 0, rawMode: null, rawGroup: null, modeEvidence: 'unavailable' }; }
}
