import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createSkinDownload } from './download.js';
import { createNativeSkins } from './native.js';
import { createLocalSkins } from './local.js';
import { createMatchSkinSelector } from './match-selector.js';
import { renderSkinPanel } from './panel.js';
export default {
  manifest: { id: 'skins', name: '皮肤管理', version: '0.4.13', apiVersion: 1, contractVersion: 1,
    releaseNotes: "新增皮肤管理整理开关、详情页下载和背景快捷操作。可为本局已亮出的武将临时切换立绘或导入静态图片，效果仅在本机显示。",
    minCoreVersion: '0.6.103', categories: ['tools'], icon: PLUGIN_ICONS.skins, priority: 30000,
    description: '整理皮肤收藏、下载原图和在本地切换牌局皮肤' },
  activate(ctx) {
    const native = createNativeSkins(ctx), refreshDownload = createSkinDownload(ctx), local = createLocalSkins(ctx);
    const refreshSelector = createMatchSkinSelector(ctx, local);
    ctx.ui.registerPanel({ id: 'main', category: 'tools', render(container) {
      return renderSkinPanel(ctx, local, () => { native.check(); refreshDownload(); local.refresh(); refreshSelector(); }, container);
    } });
  },
};
