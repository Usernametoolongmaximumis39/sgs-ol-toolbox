export const SHANHE_MAP_SCENES = new Set(['RogueLikeBigMapScene', 'RogueSmallMapScene']);
export function gameViewForScene(scene) {
  return SHANHE_MAP_SCENES.has(scene?.SceneName || scene?.sceneName || scene?.name) ? 'shanhe' : 'battle';
}
export function selectGamePanels(panels, view) {
  const selected = view === 'shanhe' && panels.some(panel => panel.gameView === 'shanhe') ? 'shanhe' : 'battle';
  return panels.filter(panel => !panel.gameView || panel.gameView === selected);
}
