import { read } from '../../shared/safe-read.js';
// Exclusions apply to the entire claim: mixed rewards cannot be split safely.
export const rewardExclusions = [
  ['excludeRecruit', '免费招募令'], ['excludeCoupon', '抵价券'],
  ['excludeTrial', '体验卡'], ['excludeBeans', '欢乐豆'],
];
// Native VJt.JunDianScoreId / NewJunDianScoreId are pass points. They
// need not have a goods-base row; do not treat them as an unknown item bundle.
const pointNames = new Map([[11981101, '军典积分'], [11987201, '节钺积分']]);
export function rewardItems(value) {
  if (value == null) return [];
  if (typeof value === 'string') return value.split(/[;|]/).filter(Boolean).map(item => ({ ItemID: Number(item.split(',')[0]), ItemNum: Number(item.split(',')[1] || 1) }));
  if (Array.isArray(value)) return value.flatMap(item => Array.isArray(item) ? [{ ItemID: item[0], ItemNum: item[1] }] : rewardItems(item));
  if (typeof value !== 'object') return [];
  for (const key of ['TaskRewardItem', 'taskRewardItem', 'ItemList', 'Itemlist', 'items', 'goods', 'Goods', 'rewards', 'reward', 'award', 'item']) {
    if (value[key] !== undefined && value[key] !== value) return rewardItems(value[key]);
  }
  return [value];
}
export function excludedReward(adapter, selected, rewards) {
  for (const item of rewardItems(rewards)) {
    const id = Number(item.ItemID ?? item.itemID ?? item.itemId ?? item.ID ?? item.id ?? item.goodsId ?? item.GoodsID ?? item.BaseID);
    const goods = read(() => adapter.goods?.(id));
    const name = String(goods?.name ?? goods?.Name ?? goods?.baseInfo?.name ?? item.ItemName ?? item.itemName ?? item.name ?? item.Name ?? pointNames.get(id) ?? '');
    const type = Number(goods?.TypeID ?? goods?.type ?? item.TypeID);
    const period = Number(goods?.period ?? item.period);
    if (!goods && !name && ![9020101, 9030101].includes(id)) return '奖励明细未就绪';
    if (selected.excludeRecruit && /免费招募令/.test(name)) return '免费招募令';
    if (selected.excludeCoupon && /抵价券/.test(name)) return '抵价券';
    if (selected.excludeBeans && ([9020101, 9030101].includes(id) || /欢乐豆/.test(name))) return '欢乐豆';
    if (selected.excludeTrial && (/体验卡|试用卡/.test(name) || [149, 161, 162].includes(type) || (type === 25 && period > 0 && period < 315360000))) return '体验卡';
  }
  return '';
}
