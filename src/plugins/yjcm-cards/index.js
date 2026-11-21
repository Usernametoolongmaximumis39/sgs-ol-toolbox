import { resources } from './resources.js';
import { previews } from './previews.js';
import { replaceCards } from './differences.js';
export const manifest = {
  id: 'yjcm-cards', name: '一将成名卡面包', version: '0.1.3', apiVersion: 1, contractVersion: 1, releaseNotes: "更新部分一将成名「杀」的离线预览裁图。",
  minCoreVersion: '0.6.185', categories: [],
  icon: { paths: ['M8 3h12v17H8ZM4 5H2v17h13v-2', 'M14 6l3 4-3 4-3-4ZM11 17h6'] }, priority: 50095,
  description: '喵喵杯、猪猪侠逐牌卡面；来源为一将成名官方资源，缺失特殊卡图时保留游戏原生显示',
};
export function activate(ctx) {
  for (const [id, name] of [['miao', '喵喵杯'], ['zhuzhuxia', '猪猪侠']]) {
    ctx.cardStyles.register({ id: 'yjcm-cards.' + id, name, atlas: { ...resources[id], previewImage: previews[id], replaceCards: replaceCards[id] } });
  }
}
export default { manifest, activate };
