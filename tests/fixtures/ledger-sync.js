export const now = Date.now() - 30000;
export const balance = { id: 100016, name: '元宝', count: 0, at: now, basis: 'all-yuanbao' };
export const item = { id: 21223901, name: '传世玉玺', delta: 1 };
export const hint = { id: 'hint-one', session: 'session-one', at: now, kind: 'goods', source: 'DbsCcUserGoodshintNtf', type: 8, items: [item] };
export const instance = { ...hint, id: 'instance-one', source: 'DbsCcUpdategoodsAttribNtf', type: null };
export const removed = { ...instance, items: [], reconciled: true };
export const prayer = { ...hint, id: 'prayer-one', kind: 'prayer', source: 'decodeClientSecretExploreRep', items: [],
  prayer: { secId: 4, itemId: 21277001, times: 50, name: '周年龙珠', matched: true }, rewards: [item] };
