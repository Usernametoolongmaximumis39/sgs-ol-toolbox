const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
export const isRoutineReward = text => /^技能槽\s*[+＋]\s*1$/.test(String(text).trim());
export function compactReward(text) {
  return String(text || '').replace(/(?:可以)?从([一二三四五六七八九十\d]+)[个张件](.+?)中选择[一1][个张件](?:获取|获得)?/g,
    (_, count, type) => `${type}${digits[count] || count}选1`)
    .replace(/([一二三四五六七八九十\d]+)选[一1]/g, (_, n) => `${digits[n] || n}选1`)
    .replace(/随机(?:获取|获得)[一1][个张件]/g, '随机');
}
export function rewardToken(text) {
  if (text && typeof text === 'object') {
    const token = rewardToken(text.text);
    if (!token) return null;
    if (Number.isFinite(text.abandonMoney) && text.abandonMoney > 0) {
      const hint = `（可弃换${text.abandonMoney}铜钱）`;
      return {...token, abandonMoney:text.abandonMoney, labelFallback:token.fallback, fallback:token.fallback+hint, full:token.full+hint};
    }
    return token;
  }
  const full = String(text || '').trim(), short = compactReward(full);
  if (!full || isRoutineReward(full)) return null;
  const money = /^(\d+)\s*铜[钱币]$/.exec(short);
  if (money) return { icon: 'rogue_money_icon', text: money[1], fallback: '铜钱 ' + money[1], full };
  const type = /(战法|技能|手牌|卡牌|装备)/.exec(short)?.[1];
  const quality = short.match(/普通|稀有|史诗|传说/g) || [];
  const choice = /(\d+选1)/.exec(short)?.[1], mode = choice || (/自选/.test(short) ? '自选' : /随机/.test(short) ? '随机' : '');
  // Unknown wording stays literal rather than guessing the reward mechanism.
  const categoryCost = /^(?:普通|稀有|史诗|传说)?(?:战法|技能|手牌|卡牌|装备)\s*×\s*\d+$/.test(short);
  if (!type || (!mode && !categoryCost)) return { text: short, fallback: short, full };
  const key = { 战法: 'zhanfa', 技能: 'skill', 手牌: 'card', 卡牌: 'card', 装备: 'equip' }[type];
  // Native GetCityAwardTypes uses acquisition mode, NOT reward quality:
  // base/known reward=0, candidate selection=1, unresolved random=2.
  const variant = choice ? 1 : mode === '随机' ? 2 : 0;
  const suffix = /[×x]\s*\d+/.exec(short)?.[0] || '';
  return { icon: `rogue_event_${key}${variant}`, text: [quality.join('/'), mode].filter(Boolean).join('·') + suffix,
    fallback: [quality.join('/'), type, mode].filter(Boolean).join('·') + suffix, full };
}
export const rewardTokens = rewards => (rewards || []).map(rewardToken).filter(Boolean);

// Inline currency in costs, outcomes, compensation and shop prices shares the
// same original coin artwork. Keep descriptive text as a fallback/accessibility label.
export function currencyTokens(value) {
  const text = String(value ?? ''), tokens = [];
  const pattern = /铜[钱币]\s*(?:[×x]\s*)?([+-]?\d+)|([+-]?\d+)\s*铜[钱币]|铜[钱币]/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) tokens.push({text:text.slice(start,match.index)});
    const amount = match[1] ?? match[2] ?? '';
    tokens.push({icon:'rogue_money_icon',text:amount,fallback:'铜钱'+amount,full:'铜钱'+amount});
    start = match.index + match[0].length;
  }
  if (start < text.length) tokens.push({text:text.slice(start)});
  return tokens;
}
