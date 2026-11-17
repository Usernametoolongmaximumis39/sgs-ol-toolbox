import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createController } from './controller.js';
import { renderPanel, renderAlerts } from './ui.js';
import { createBagEnhancements } from './bag.js';
export const manifest = { id: 'ledger', name: '账本', version: '0.3.7', apiVersion: 1, contractVersion: 1,
  releaseNotes: "随公共界面资源更新，账本统计、登录余额判断与物品提醒方式保持不变。", minCoreVersion: '0.6.37', categories: ['info'], icon: PLUGIN_ICONS['ledger'], priority: 30000,
  description: '重要物品余额、登录收支与祈愿记录，背包道具搜索和抵价券满减角标' };
export function activate(ctx) { const controller = createController(ctx); renderAlerts(ctx, controller); controller.load();
  createBagEnhancements(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render: container => renderPanel(ctx, container, controller) }); }
export default { manifest, activate };
