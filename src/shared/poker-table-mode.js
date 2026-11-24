export const POKER_TABLE_SCENE = 'PokerTableGameScene';

export function isNativePokerTable(scene) {
  return Boolean(scene && !scene.destroyed
    && (scene.SceneName || scene.sceneName || scene.name) === POKER_TABLE_SCENE);
}
