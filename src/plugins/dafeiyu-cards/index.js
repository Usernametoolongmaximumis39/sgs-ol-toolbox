import { resource } from './resources.js';
import { replaceCards } from './coverage.js';

export const manifest = {
  id: 'dafeiyu-cards', name: '大肥鱼卡面', version: '0.3.1',
  apiVersion: 1, contractVersion: 1, minCoreVersion: '0.6.0', categories: [],
  icon: { paths: ['M3 5h13v16H3Z', 'M7 2h14v16h-2', 'M5 12c3-5 6-5 8 0-2 5-5 5-8 0Z', 'M13 12l2-2v4Z', 'M8 11v.1'] },
  priority: 50096,
  description: '三倍高清大肥鱼卡面，共 52 种，含军争卡组与 8 张衍生装备及吕玲绮四件装备精修；图片按需加载',
};

export function activate(ctx) {
  ctx.cardStyles.register({
    id: 'dafeiyu-cards.beta', name: '大肥鱼卡面',
    atlas: { ...resource, replaceCards },
  });
}

export default { manifest, activate };
