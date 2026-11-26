import { LEDGER_ICON } from '../../ui/plugin-icons.js';
import { createController } from './controller.js';
import { renderPanel, renderAlerts } from './ui.js';
import { createWishProgress } from './wish-progress/native.js';
import { createBagEnhancements } from './bag.js';
export const manifest = { id: 'ledger', name: '账本', version: '0.3.25', apiVersion: 1, contractVersion: 1,
  releaseNotes: "心愿进度并入账本；打开游戏的心愿窗口时可看到当前进度和最近一次变化，不会代为抽取。绑定云同步后，账号资料、余额和流水可同步至所绑定的服务器；未绑定时留在本机。", minCoreVersion: '0.6.185', categories: ['info'], icon: LEDGER_ICON, priority: 30000,
  description: '余额收支、祈愿、背包与心愿进度' };
export function activate(ctx) { const controller = createController(ctx); renderAlerts(ctx, controller); controller.load();
  createBagEnhancements(ctx);
  createWishProgress(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render: container => renderPanel(ctx, container, controller) }); }
export default { manifest, activate };
