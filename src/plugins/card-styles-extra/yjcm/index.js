import { resources } from './resources.js';
import { previews } from './previews.js';
import { replaceCards } from './differences.js';
export function registerYjcmCardStyles(ctx) {
  for (const [id, name] of [['miao', '喵喵杯'], ['zhuzhuxia', '猪猪侠']]) {
    ctx.cardStyles.register({ id: 'card-styles-extra.' + id, name, atlas: { ...resources[id], previewImage: previews[id], replaceCards: replaceCards[id] } });
  }
}
