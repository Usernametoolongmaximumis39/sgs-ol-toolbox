import { backImage } from './back.js';
import { resource } from './resources.js';
import { localCards, localResource } from './local-resources.js';
import { replaceCards } from './coverage.js';

const coveredCards = [...replaceCards, ...localCards.map(card => card.name)];

export function registerDafeiyuCardStyles(ctx) {
  const local = ctx.core?.distribution === 'dev';
  ctx.cardStyles.register({
    id: 'card-styles-extra.dafeiyu', name: '大肥鱼卡面', backName: '大肥鱼卡背 · 鲸浪藏锋',
    atlas: {
      ...resource,
      ...(local ? localResource : {}),
      replaceCards: coveredCards,
      backImage,
    },
  });
}
