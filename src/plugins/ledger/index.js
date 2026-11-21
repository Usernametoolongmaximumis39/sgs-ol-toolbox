import { LEDGER_ICON } from '../../ui/plugin-icons.js';
import { createController } from './controller.js';
import { renderPanel, renderAlerts } from './ui.js';
import { createBagEnhancements } from './bag.js';
export const manifest = { id: 'ledger', name: '账本', version: '0.3.23', apiVersion: 1, contractVersion: 1,
  releaseNotes: "优化背包搜索和实时刷新。绑定云同步后，可向所绑定的服务器同步账号资料、余额与流水；未绑定时继续保存在本机。", minCoreVersion: '0.6.185', categories: ['info'], icon: LEDGER_ICON, priority: 30000,
  description: '重要物品余额、登录收支与祈愿记录，背包道具搜索和抵价券满减角标' };
export function activate(ctx) { const controller = createController(ctx); renderAlerts(ctx, controller); controller.load();
  createBagEnhancements(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render: container => renderPanel(ctx, container, controller) }); }
export default { manifest, activate };
