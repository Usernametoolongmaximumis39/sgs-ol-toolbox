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
  version: '0.3.54',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.228',
  description: '打开三国斗地主大厅、实战牌桌和历史录像。',
  releaseNotes: '在经典版活动场打开三国斗地主大厅，在工具栏开始匹配、切换牌桌或复制日志，也可在历史战绩播放录像。匹配须满足游戏开放条件。',
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
