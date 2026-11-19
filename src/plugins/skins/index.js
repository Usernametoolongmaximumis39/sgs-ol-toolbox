import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createSkinDownload } from './download.js';
import { createNativeSkins } from './native.js';
import { createLocalSkins } from './local.js';
import { createMatchSkinSelector } from './match-selector.js';
import { renderSkinPanel } from './panel.js';
import { createYjcmPicker } from './yjcm-picker.js';
import { createGeneralSkinsEntry } from './general-skins-entry.js';
import { createFormPicker } from './form-picker.js';
export default {
  manifest: { id: 'skins', name: '皮肤管理', version: '0.4.56', apiVersion: 1, contractVersion: 1,
    releaseNotes: "可为本局武将选择一将成名服皮肤，并按需联网加载立绘、配音与部分动皮演出。皮肤与配音仅本机可见或可听。支持切换已应用皮肤的形态、收起本方武将名条及聊天输入行，亦可在一将成名动皮播放时自动收起。首次打开外服皮肤列表需要联网建立索引。",
    minCoreVersion: '0.6.146', categories: ['tools'], icon: PLUGIN_ICONS.skins, priority: 30000,
    description: '整理皮肤收藏、下载原图和在本地切换牌局皮肤' },
  activate(ctx) {
    const native = createNativeSkins(ctx), refreshDownload = createSkinDownload(ctx), local = createLocalSkins(ctx);
    const openForms = createFormPicker(ctx);
    const openYjcm = createYjcmPicker(ctx, local, openForms);
    createGeneralSkinsEntry(ctx, openYjcm);
    const refreshSelector = createMatchSkinSelector(ctx, local, openYjcm, openForms);
    ctx.ui.registerPanel({ id: 'main', category: 'tools', render(container) {
      return renderSkinPanel(ctx, local, () => { native.check(); refreshDownload(); local.refresh(); refreshSelector(); }, container, openYjcm, openForms);
    } });
  },
};
