import { registerNativeCardStyles } from './native/index.js';
import { registerGoldCardStyles } from './gold/index.js';
import { registerYjcmCardStyles } from './yjcm/index.js';
import { registerDafeiyuCardStyles } from './dafeiyu/index.js';

export const manifest = {
  id: 'card-styles-extra', name: '卡面卡背拓展', version: '0.1.2',
  apiVersion: 1, contractVersion: 1, minCoreVersion: '0.6.185', categories: [],
  icon: { paths: [
    'M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4',
    'M6 6.5h8v3.5M6 6.5v11h4',
    'M20.5 10.5a1.6 1.6 0 0 1 0 2.3l-4.7 4.7-2.3-2.3 4.7-4.7a1.6 1.6 0 0 1 2.3 0Z',
    'M13.5 15.2c-1.5.5-2.1 1.7-2.5 3.3 1.8 0 3.3-.6 4.8-1',
  ] }, priority: 50090,
  description: '经典、金色、一将及大肥鱼卡面卡背',
  releaseNotes: '首次发布：在一个插件中提供官方经典、官方大将军、金色、一将成名和大肥鱼等卡面与卡背。安装不会自动换装；部分图片在选用时联网下载，资源未加载时沿用游戏外观。',
};

export function activate(ctx) {
  registerNativeCardStyles(ctx);
  registerGoldCardStyles(ctx);
  registerYjcmCardStyles(ctx);
  registerDafeiyuCardStyles(ctx);
}

export default { manifest, activate };
