import { backImage } from './back.js';
import { resource } from './resources.js';
import { localCards, localResource } from './local-resources.js';
import { replaceCards } from './coverage.js';

export const manifest = {
  id: 'dafeiyu-cards', name: '大肥鱼卡面', version: '0.4.4',
  releaseNotes: '新增 42 张山河图装备卡面，可在工具箱外观页和游戏内卡牌图鉴预览。新版卡面按需从 GitHub 加载。',
  apiVersion: 1, contractVersion: 1, minCoreVersion: '0.6.9', categories: [],
  icon: { paths: ['M3 5h13v16H3Z', 'M7 2h14v16h-2', 'M5 12c3-5 6-5 8 0-2 5-5 5-8 0Z', 'M13 12l2-2v4Z', 'M8 11v.1'] },
  priority: 50096,
  description: '三倍高清大肥鱼卡面与鲸浪藏锋卡背，含军争卡组、衍生装备和山河图装备，图片按需加载',
};

const coveredCards = [...replaceCards, ...localCards.map(card => card.name)];

export function activate(ctx) {
  const local = ctx.core?.distribution === 'dev';
  ctx.cardStyles.register({
    id: 'dafeiyu-cards.beta', name: '大肥鱼卡面', backName: '大肥鱼卡背 · 鲸浪藏锋',
    atlas: {
      ...resource,
      ...(local ? localResource : {}),
      replaceCards: coveredCards,
      backImage,
    },
  });
}

export default { manifest, activate };
