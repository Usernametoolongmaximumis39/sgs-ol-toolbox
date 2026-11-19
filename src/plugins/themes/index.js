import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { THEMES } from './palettes.js';

export { THEMES } from './palettes.js';
export const manifest = { id: 'themes', name: '雅色主题包', version: '0.1.5',
  releaseNotes: "适配新版工具箱界面资源，沿用现有主题配色。", apiVersion: 1, contractVersion: 1,
    minCoreVersion: '0.5.15', categories: [], icon: PLUGIN_ICONS['themes'], priority: 50000,
    description: '提供五套深色与宣纸、晴岚、桃夭三套浅色配色，在设置的主题工坊中选用' };

export function activate(ctx) {
  for (const theme of THEMES) ctx.themes.register(theme);
}

export default { manifest, activate };
