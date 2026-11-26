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
  version: '0.3.71',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.272',
  description: '斗地主大厅、实战牌桌与历史录像',
  releaseNotes: '改善经典版活动场入口的文字提示和录像牌面显示。能否在线匹配仍由游戏服务器决定，参与对局可能消耗欢乐豆。部分技能移牌的明暗显示尚未完成验证。',
  icon: POKER_LOBBY_ICON,
  priority: 65535,
  categories: ['tools'],
};

export function activate(ctx) {
  const lobby = createNativeLobby(ctx);
  installPokerLiveTable(ctx, lobby);
  const replay = createPokerReplay(ctx, lobby);
  installPokerActivityEntry(ctx, lobby.open);
  installPokerHistory(ctx, replay.playBytes);
  registerPokerToolsPanel(ctx, lobby);
}

export default { manifest, activate };
