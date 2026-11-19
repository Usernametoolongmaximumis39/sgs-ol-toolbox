import { SHANHE_BATTLE_SCENE, SHANHE_MAP_SCENES } from '../shared/shanhe-scenes.js';
export { SHANHE_MAP_SCENES };
export function gameViewForScene(scene) {
  const name = scene?.SceneName || scene?.sceneName || scene?.name;
  if (name === SHANHE_BATTLE_SCENE) return 'shanhe-battle';
  return SHANHE_MAP_SCENES.has(name) ? 'shanhe' : 'battle';
}
export function selectGamePanels(panels, view) {
  if (view === 'shanhe-battle') return panels;
  const selected = view === 'shanhe' && panels.some(panel => panel.gameView === 'shanhe') ? 'shanhe' : 'battle';
  return panels.filter(panel => !panel.gameView || panel.gameView === selected);
}
