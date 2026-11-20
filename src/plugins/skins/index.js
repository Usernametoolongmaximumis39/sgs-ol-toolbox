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
  manifest: { id: 'skins', name: '皮肤管理', version: '0.4.87', apiVersion: 1, contractVersion: 1,
    releaseNotes: "新增移动版皮肤入口，可按需联网加载静态原画、动皮、语音和部分特效。支持手动切换可用的多形态皮肤，以及选择支持的登场、技能特效和胜利配音。调整局内动皮和头像布局，修复势周瑜水火形态共用原画的显示问题。外服及导入皮肤只在自己这边显示或播放。资源加载和演出受来源及设备支持限制。",
    minCoreVersion: '0.6.159', categories: ['tools'], icon: PLUGIN_ICONS.skins, priority: 30000,
    description: '整理皮肤收藏、下载原图和在本地切换牌局皮肤' },
  activate(ctx) {
    const native = createNativeSkins(ctx), refreshDownload = createSkinDownload(ctx), local = createLocalSkins(ctx);
    const openForms = createFormPicker(ctx);
    const openYjcm = createYjcmPicker(ctx, local, openForms);
    const openMobile = options => openYjcm(options, 'mobile');
    createGeneralSkinsEntry(ctx, openYjcm, openMobile);
    const refreshSelector = createMatchSkinSelector(ctx, local, openYjcm, openForms, openMobile);
    ctx.ui.registerPanel({ id: 'main', category: 'tools', render(container) {
      return renderSkinPanel(ctx, local, () => { native.check(); refreshDownload(); local.refresh(); refreshSelector(); }, container, openYjcm, openForms, openMobile);
    } });
  },
};
