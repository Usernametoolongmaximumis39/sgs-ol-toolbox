import { createNativeLobby } from './native-lobby.js';
import { registerPokerToolsPanel } from './tools-panel.js';
import { installPokerActivityEntry } from './activity-entry.js';
import { installPokerHistory } from './native-history.js';
import { createPokerReplay } from './replay/controller.js';
import { installPokerLiveTable } from './live/native-table.js';
import { POKER_LOBBY_ICON } from '../../ui/plugin-icons.js';

export const manifest = {
  id: 'poker-lobby',
  name: '三国斗地主',
  version: '0.3.56',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.228',
  description: '打开三国斗地主大厅、实战牌桌和历史录像。',
  releaseNotes: '大厅按钮只显示开始或取消匹配，首次由工具箱询问「确认发起匹配」。排队确认后，灰色取消按钮变为蓝绿色；匹配成功会收起大厅按钮，可在工具箱准备或切换牌桌。钟会权计上排为权计牌、下排为手牌，两排和技能区的破军、权计牌均按点数从大到小排列。在线匹配由游戏服务器决定是否放行，参与对局可能消耗欢乐豆。',
  icon: POKER_LOBBY_ICON,
  priority: 65535,
  categories: ['tools'],
};

export function activate(ctx) {
  const lobby = createNativeLobby(ctx);
  const replay = createPokerReplay(ctx, lobby);
  installPokerActivityEntry(ctx, lobby.open);
  installPokerHistory(ctx, replay.playBytes);
  installPokerLiveTable(ctx, lobby);
  registerPokerToolsPanel(ctx, lobby);
}

export default { manifest, activate };
