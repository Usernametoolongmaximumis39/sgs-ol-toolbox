import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
export { createController, RECORD_LIMIT } from './controller.js';
import { activate } from './panel.js';
export { activate };
export const manifest = { id: 'appearances', name: '出框与胜率统计', version: '0.4.19', apiVersion: 1, contractVersion: 1,
  releaseNotes: "详情改为游戏内置面板，修复微端打开详情时出现系统链接提示的问题；保留筛选、对局历史和手动导入工具箱 JSON 备份。", minCoreVersion: '0.6.37', categories: ['info'], icon: PLUGIN_ICONS['appearances'], priority: 32000,
  description: '本机统计正式排位、斗地主与单骑无双的出框、选取、胜率及对局历史' };
export default { manifest, activate };
