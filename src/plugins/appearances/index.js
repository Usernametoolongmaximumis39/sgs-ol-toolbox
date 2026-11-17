import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
export { createController, RECORD_LIMIT } from './controller.js';
import { activate } from './panel.js';
export { activate };
export const manifest = { id: 'appearances', name: '出框与胜率统计', version: '0.4.24', apiVersion: 1, contractVersion: 1,
  releaseNotes: "支持用官方七日战绩补齐本机已采到开局的对局，避免重复统计；缺少可靠模式或身份依据时不补记，不补造历史出框与胜率。", minCoreVersion: '0.6.37', categories: ['info'], icon: PLUGIN_ICONS['appearances'], priority: 32000,
  description: '本机统计正式排位、斗地主与单骑无双的出框、选取、胜率及对局历史' };
export default { manifest, activate };
