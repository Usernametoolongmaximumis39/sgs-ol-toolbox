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
  version: '0.3.55',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.228',
  description: '打开三国斗地主大厅、实战牌桌和历史录像。',
  releaseNotes: '移除「前往重制版」。经典版未开放时，可在大厅的原生按钮上确认后尝试在线匹配，并用同一个按钮取消或准备。此功能仍在测试，仅用于小号；是否能入场由游戏服务器决定，参与对局可能消耗欢乐豆。',
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
