import { readReplay } from './reader.js';
import { connectNativeReplay } from './native-entry.js';
import { openNativeReplay } from './native-table.js';
import { defaultReplayPerspective } from './perspective.js';

export function createPokerReplay(ctx, { captureOrigin, restoreOrigin } = {}) {
  const { game, scope } = ctx;
  let playback;
  let importId = 0;
  const account = () => ctx.native?.account?.()?.id;

  async function enqueue(readBytes, { fallback, beforePlay, onReturn } = {}) {
    if (scope.closed) return false;
    const id = ++importId;
    const scene = game.getScene();
    const owner = account();
    const proxy = game.getServerProxy?.();
    const sameSession = () => account() === owner && game.getServerProxy?.() === proxy;
    const current = () => !scope.signal.aborted && id === importId;
    try {
      const bytes = await readBytes();
      if (!current()) return false;
      const record = await readReplay(bytes, scope.signal, { passthrough: Boolean(fallback) });
      if (!current()) return false;
      if (!sameSession() || game.getScene() !== scene) throw new Error('游戏界面已切换，请重新选择录像');
      if (!record) return fallback?.();
      if (playback || game.isInGame() || scene?.isMatching || scene?.adManager?.IsMatching || game.getClass?.('GameContext')?.IsAgainGame) {
        throw new Error('请退出当前牌局或匹配后再打开录像');
      }
      const origin = captureOrigin?.();
      const session = {};
      const onClose = ({ returned, expectedScene } = {}) => {
        if (playback !== session) return;
        playback = undefined;
        if (scope.closed || !sameSession()) return;
        if (returned) {
          if (origin) restoreOrigin?.(origin, expectedScene);
          onReturn?.(expectedScene);
        }
      };
      const onFailure = error => {
        if (!current() || !sameSession()) return;
        ctx.notify(error.message || String(error));
      };
      playback = session;
      let opened = false;
      try {
        const perspective = defaultReplayPerspective(record, owner);
        opened = Boolean(openNativeReplay(ctx, record, { beforePlay, onClose, onFailure, sameSession, perspective }));
        return opened;
      } finally {
        if (!opened && playback === session) playback = undefined;
      }
    } catch (error) {
      if (current()) ctx.notify(error.message || String(error));
      return false;
    }
  }
  connectNativeReplay(ctx, (readBytes, _name, fallback) => enqueue(readBytes, { fallback }));
  return { playBytes: enqueue };
}
