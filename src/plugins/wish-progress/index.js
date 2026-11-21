import { WISH_PROGRESS_ICON } from '../../ui/plugin-icons.js';
import { createWishProgress } from './native.js';
export default {
 manifest: { id:'wish-progress', name:'心愿进度', version: '0.1.3',
  releaseNotes: "调整心愿进度显示对账号切换的处理。", apiVersion:1, contractVersion:1, minCoreVersion:'0.5.0', description:'游戏心愿窗口显示武将格数、皮肤百分比与最近一次抽取净变化', icon: WISH_PROGRESS_ICON, priority:30100, categories:[] },
 activate(ctx) { createWishProgress(ctx); },
};
