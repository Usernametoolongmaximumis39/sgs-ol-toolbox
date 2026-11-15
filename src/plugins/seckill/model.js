// Selection rules ported from 小抄的拓展 2.6.8 (SK_ITEMS / SK_RULES).
export const ITEMS = [
  ['huijuanmaobi', '绘卷毛笔', '毛笔', '仅 3 支装'], ['gongxun', '功勋', '功勋', '不限数量'],
  ['pifubao', '皮肤包', '皮肤包', '不限数量'], ['qizhenduobaoquan', '奇珍夺宝券', '奇珍夺宝券', '仅 10 张装'],
  ['duobaoquan', '夺宝券', '夺宝券', '仅 10 张装，不含奇珍夺宝券'], ['zhaomuling', '招募令', '招募令', '不限数量'],
  ['qifulideng', '祈福灯', '祈福灯', '仅 6666 元宝的 10 个装'], ['longzhu', '龙珠', '龙珠', '仅 5 个装，匹配各期名称'],
];
export const normalize = text => String(text ?? '').replace(/[\s\u00a0]+/g, '').toLowerCase();
export function cleanConfig(value = {}) {
  return { enabled: value.enabled === true, items: Object.fromEntries(ITEMS.map(([id]) => [id, value.items?.[id] === true])),
    custom: [...new Map((Array.isArray(value.custom) ? value.custom : []).filter(s => typeof s === 'string').map(s => s.trim().slice(0, 24)).filter(Boolean).map(s => [normalize(s), s])).values()].slice(0, 20) };
}
export function keywords(config) { return [...ITEMS.filter(([id]) => config.items[id]).map(([, , kw]) => kw), ...config.custom]; }
export function matches(row, keyword) {
  const kw = normalize(keyword), text = normalize(row.name);
  if (!kw || !text.includes(kw) || (kw === '夺宝券' && text.includes('奇珍夺宝券'))) return false;
  if (/龙珠/.test(kw) && row.count !== 5) return false;
  if (/毛笔/.test(kw) && row.count !== 3) return false;
  if (/夺宝券/.test(kw) && row.count !== 10) return false;
  if (/祈福灯/.test(kw) && (row.count !== 10 || row.price !== 6666 || row.currency !== 2)) return false;
  return true;
}
export function roundStart(now) {
  // Official rounds use China time, independent of the computer's timezone.
  const shifted = now + 8 * 3600000, date = new Date(shifted), hour = date.getUTCHours();
  const pick = [0, 8, 12, 19].filter(h => h <= hour).at(-1);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), pick) - 8 * 3600000;
}
export const rowKey = row => [row.actId, row.itemId, row.baseId, row.startMs].join('|');
export function blocked(row, now) {
  if (!row.valid) return '数据未就绪';
  if (row.endMs <= now) return '已结束';
  if (row.limit > 0 && row.bought >= row.limit) return '限购已满';
  if (row.stock <= 0) return '已售罄';
  return '';
}
export function rowLabel(row) { return `${row.price} ${['', '通用元宝', '元宝', '银两'][row.currency] || '未知货币'} · ${row.name} ×${row.count}`; }
