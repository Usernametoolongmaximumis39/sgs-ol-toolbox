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
  manifest: { id: 'skins', name: '皮肤管理', version: '0.4.109', apiVersion: 1, contractVersion: 1,
    releaseNotes: "减少未打开皮肤窗口时的后台检查，保留武将详情的皮肤入口与已有设置。素材按需联网加载，外服及导入皮肤仅自己可见或可听。",
    minCoreVersion: '0.6.206', categories: ['tools'], icon: SKINS_ICON, priority: 30000,
    description: '皮肤收藏、原图下载与本地换肤' },
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
