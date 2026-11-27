import { SHANHE_BATTLE_SCENE } from './shanhe-scenes.js';

// Inspect attached display objects only; never instantiate a game window.
export function singleRiderShopVisible(window, game, scene, modeId) {
  const sceneName = scene?.SceneName || scene?.sceneName || scene?.name;
  const nativeModeId = scene?.ModeID ?? scene?.modeId;
  if (Number(nativeModeId) !== 44 && Number(modeId) !== 44 &&
    (sceneName === 'GameScene' || sceneName === SHANHE_BATTLE_SCENE)) return false;
  const stage = (window.Laya ?? window.laya)?.stage;
  let Type;
  try { Type = game?.getClass?.('RogueLike1v1GameShopWindow'); } catch {}
  const queue = [...(stage?._children || [])], seen = new Set();
  for (let i = 0; i < queue.length && i < 512; i++) {
    const node = queue[i];
    if (!node || seen.has(node) || node.destroyed || node.visible === false || node._visible === false || node.alpha === 0) continue;
    seen.add(node);
    if (typeof Type === 'function' && node instanceof Type
      || node.name === 'RogueLike1v1GameShopWindow' || node.ClassName === 'RogueLike1v1GameShopWindow') return true;
    if (Array.isArray(node._children)) queue.push(...node._children.slice(0, 512 - queue.length));
  }
  return false;
}
