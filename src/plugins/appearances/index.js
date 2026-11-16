import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
export { createController, RECORD_LIMIT } from './controller.js';
import { activate } from './panel.js';
export { activate };
export const manifest = { id: 'appearances', name: '出框与胜率统计', version: '0.4.18', apiVersion: 1, contractVersion: 1,
  releaseNotes: "新增独立详情窗口及更清晰的筛选排序，按模式和身份统计胜率；修正正式模式与人机识别，缺少身份或先后手的旧记录会被剔除。仅采集启用期间的本机记录，不上传。", minCoreVersion: '0.6.37', categories: ['info'], icon: PLUGIN_ICONS['appearances'], priority: 32000,
  description: '本机统计正式排位、斗地主与单骑无双的出框、选取、胜率及对局历史' };
export default { manifest, activate };
