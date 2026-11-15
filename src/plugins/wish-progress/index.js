import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createWishProgress } from './native.js';
export default {
 manifest: { id:'wish-progress', name:'心愿进度', version:'0.1.1', apiVersion:1, contractVersion:1, minCoreVersion:'0.5.0', description:'游戏心愿窗口显示武将格数、皮肤百分比与最近一次抽取净变化', icon: PLUGIN_ICONS['wish-progress'], priority:30100, categories:[] },
 activate(ctx) { createWishProgress(ctx); },
};
