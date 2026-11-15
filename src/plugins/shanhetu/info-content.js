import { compactReward, currencyTokens } from './reward-tokens.js';

const plain = text => ({ text: String(text ?? ''), fallback: String(text ?? '') });
const normalize = token => {
  let text = String(token?.text ?? ''), fallback = String(token?.fallback ?? text), atomic = token?.atomic ?? true;
  if (/^rogue_event_(?:zhanfa|skill|card|equip)[012]$/.test(token?.icon || '') && token.full) {
    const source = compactReward(token.full).replace(/（可弃换\d+铜钱）$/, '');
    // A named or unfamiliar reward must not disappear behind a category icon.
    const remainder = source.replace(/普通|稀有|史诗|传说|战法|技能|手牌|卡牌|装备|随机|自选|或|\d+选1|[×x]\s*\d+|[\s·/、]/g, '');
    if (remainder) { text = source; fallback = source; atomic = false; }
  }
  return { ...token, text, fallback, ...(token?.icon ? { atomic } : {}) };
};
function inline(tokens) {
  return tokens.flatMap(token => {
    if (token.icon) return [normalize(token)];
    const parts = currencyTokens(token.text ?? token.fallback ?? '');
    if (!parts.length) return token.breakBefore ? [normalize(token)] : [];
    if (!parts.some(part => part.icon)) return [normalize(token)];
    return parts.map((part, index) => normalize({ ...token, ...part,
      breakBefore: index === 0 && !!token.breakBefore,
      fallback: part.fallback ?? part.text }));
  });
}

/** Presentation tokens preserve quantities, names and acquisition semantics.
 * Only an explicitly typed line replaces its category label with an icon.
 */
export function infoLineTokens(line) {
  if (line == null) return [];
  if (typeof line !== 'object') return inline([plain(line)]);
  if (line.kind === 'reward' && Array.isArray(line.tokens)) {
    return line.tokens.flatMap((token, index) => [
      ...(index ? [plain(' · ')] : []),
      normalize({ ...token, fallback: token.labelFallback ?? token.fallback }),
      ...(Number.isFinite(token.abandonMoney) && token.abandonMoney > 0
        ? inline([plain(`（可弃换${token.abandonMoney}铜钱）`)]) : []),
    ]);
  }
  if (Array.isArray(line.tokens)) return inline(line.tokens);
  if (Array.isArray(line.inlineTokens)) return inline(line.inlineTokens);
  const text = String(line.text ?? '');
  if (line.kind === 'armor') return [normalize({ icon: 'equipment', text: text.replace(/^防具\s*[·：:]?\s*/, ''), fallback: text, full: text, atomic: false })];
  if (line.kind === 'warning') return [normalize({ icon: 'warning', text: text.replace(/^注意\s*[·：:]?\s*/, ''), fallback: text, full: text, atomic: false, warning: true })];
  if (line.kind === 'name') return [plain(text)];
  return inline([plain(text)]);
}
