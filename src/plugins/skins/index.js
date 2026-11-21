import { SKINS_ICON } from '../../ui/plugin-icons.js';
import { createSkinDownload } from './download.js';
import { createNativeSkins, openNativeSkinWindow } from './native.js';
import { createLocalSkins } from './local.js';
import { createMatchSkinSelector } from './match-selector.js';
import { renderSkinPanel } from './panel.js';
import { createYjcmPicker } from './yjcm-picker.js';
import { createGeneralSkinsEntry } from './general-skins-entry.js';
import { createFormPicker } from './form-picker.js';
import { registerSkinBackgroundMotion } from './background-motion.js';
export default {
  manifest: { id: 'skins', name: '皮肤管理', version: '0.4.99', apiVersion: 1, contractVersion: 1,
    releaseNotes: "改进一将成名和移动版皮肤的搜索、缓存与动皮布局。支持从皮肤详情将可用横版皮肤设为牌局背景，素材按需联网加载。外服及导入皮肤仅自己可见或可听。",
    minCoreVersion: '0.6.206', categories: ['tools'], icon: SKINS_ICON, priority: 30000,
    description: '整理皮肤收藏、下载原图和在本地切换牌局皮肤' },
  activate(ctx) {
    const native = createNativeSkins(ctx), refreshDownload = createSkinDownload(ctx), local = createLocalSkins(ctx);
    registerSkinBackgroundMotion(ctx, local);
    const openForms = createFormPicker(ctx);
    const openYjcm = createYjcmPicker(ctx, local, openForms);
    const openMobile = options => openYjcm(options, 'mobile');
    ctx.skinWindows?.register((source, trigger) => {
      if (source === 'native') return openNativeSkinWindow(ctx);
      if (source === 'cross' || source === 'mobile') return openYjcm({ trigger }, source);
    });
    createGeneralSkinsEntry(ctx, openYjcm, openMobile);
    const refreshSelector = createMatchSkinSelector(ctx, local, openYjcm, openForms, openMobile);
    ctx.ui.registerPanel({ id: 'main', category: 'tools', render(container) {
      return renderSkinPanel(ctx, local, () => { native.check(); refreshDownload(); local.refresh(); refreshSelector(); }, container, openYjcm, openForms, openMobile);
    } });
  },
};
