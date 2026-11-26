import { THEMES_FLOW_ICON } from '../../ui/plugin-icons.js';
import { FLOW_THEMES } from './palettes.js';

export const manifest = {
  id: 'themes-flow',
  name: '流彩主题包',
  version: '0.1.1',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.302',
  categories: [],
  icon: THEMES_FLOW_ICON,
  priority: 50050,
  description: '五深三浅共八套渐变与暗纹主题',
  releaseNotes: '首次发布：提供千里青绿、赤壁流霞、星汉极光、云锦织金、墨韵烟波、朝霞云绡、天青烟雨与金笺素绫共八套非纯色渐变与纹理主题。',
};

export function activate(ctx) {
  for (const theme of FLOW_THEMES) ctx.themes.register(theme);
}

export default { manifest, activate };
