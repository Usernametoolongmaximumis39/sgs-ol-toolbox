import { APPEARANCES_ICON } from '../../ui/plugin-icons.js';
export { createController, RECORD_LIMIT } from './controller.js';
import { activate } from './panel.js';
export { activate };
export const manifest = { id: 'appearances', name: '出框与胜率统计', version: '0.4.39', apiVersion: 1, contractVersion: 1,
  releaseNotes: "改进官方历史战绩补收。绑定云同步后，可向所绑定的服务器同步已核实的战绩和关联出框记录。", minCoreVersion: '0.6.185', categories: ['info'], icon: APPEARANCES_ICON, priority: 32000,
  description: '本机统计正式排位、斗地主与单骑无双的出框、选取、胜率及对局历史' };
export default { manifest, activate };
