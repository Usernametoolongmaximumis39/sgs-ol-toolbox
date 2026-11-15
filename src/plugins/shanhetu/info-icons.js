import tactic from './assets/tactic-icon.js';
import money from './assets/money-icon.js';
import equipment from './assets/equipment-icon.js';
import { hpJade, handCards, armorShield, skillCards } from './assets/info-icon-data.js';

// Official game art keeps its original colours. The three code-native glyphs
// use a dark rim and pale gold stroke so they remain readable on either theme.
const glyph = paths => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#30291e" stroke-width="3.8">${paths}</g><g stroke="#e6c783" stroke-width="1.8">${paths}</g></g></svg>`);
const icon = (label, data) => Object.freeze({ label, data });
const icons = Object.freeze({
  stat_hp: icon('体力', hpJade),
  stat_card: icon('手牌', handCards),
  stat_draw: icon('摸牌', glyph('<path d="M4 8H3v12h13v-4M8 4h12v11H8zM14 2v8m-3-3 3 3 3-3"/>')),
  stat_sha: icon('出杀次数', glyph('<path d="m5 20 4-4m-3-3 5 5M9 14l9-11 3 0 0 3-10 10M12 12l6-6"/>')),
  stat_armor: icon('护甲', armorShield),
  equipment: icon('防具', equipment),
  warning: icon('注意', glyph('<path d="M12 3 2 21h20L12 3zM12 9v5m0 3v.2"/>')),
  rogue_money_icon: icon('铜钱', money),
  rogue_event_zhanfa0: icon('战法', tactic),
  rogue_event_skill0: icon('技能', skillCards),
  rogue_event_card0: icon('手牌', handCards),
  rogue_event_equip0: icon('装备', equipment),
});

/** Shared by HTML and Laya; no downloads or native-loader cache traversal. */
export function infoIcon(name) {
  if (typeof name !== 'string') return null;
  const key = name.replace(/^(rogue_event_(?:zhanfa|skill|card|equip))[12]$/, (_, prefix) => prefix + '0');
  return Object.hasOwn(icons, key) ? icons[key] : null;
}
