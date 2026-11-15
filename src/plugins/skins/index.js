import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createNativeSkins } from './native.js';
export default {
 manifest: { id:'skins', name:'皮肤收集', version:'0.4.7', apiVersion:1, contractVersion:1, minCoreVersion:'0.5.101', categories:[], icon: PLUGIN_ICONS['skins'], priority:30000, description:'筛选、查找皮肤，查看收藏与动态状态' },
 activate(ctx) { createNativeSkins(ctx); },
};
