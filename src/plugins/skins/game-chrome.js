import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';
import { read } from './native-model.js';

export const skinWindowInk = Object.freeze({ text: '#faedd9', muted: '#c7b99b', accent: '#e4d5a0', shadow: '#14110e' });

const buttonSkins = {
  button: ['win_noborder_btn_normal', 'win_noborder_btn_over'],
  segment: ['search_bg9', 'win_noborder_btn_over'],
};
const tabSkins = ['tab_select_no_normal', 'tab_select_no_over', 'tab_select_yes_normal'];
const searchSkins = ['serachbtn2_over', 'serachbtn2_up'];
const grid = [5, 5, 5, 5, 0];
const searchGrid = [8, 10, 8, 10, 0];
const comboGrid = [1, 24, 1, 15, 0];

export function createSkinGameChrome(win, owner) {
  const laya = win.Laya ?? win.laya, drawn = new WeakMap(), comboFrames = new Map();
  const textures = new Map();

  function getTexture(key) {
    if (!key) return null;
    if (!textures.has(key)) {
      const texture = read(() => win.RES?.GetRes?.(key));
      textures.set(key, texture && !texture.destroyed && texture.width > 0 && texture.height > 0
        && (typeof texture.getIsReady !== 'function' || texture.getIsReady()) ? texture : null);
    }
    return textures.get(key);
  }
  function draw(node, texture, { y = 0, height = node.height, x = 0, width = node.width, slice = null,
    fill = '', border = '' } = {}) {
    const previous = drawn.get(node);
    const style = [x, y, width, height, slice, fill, border].join('|');
    if (previous?.texture === texture && previous.style === style) return;
    drawn.set(node, { texture, style });
    const g = node.graphics;
    g.clear();
    if (texture && slice && typeof g.draw9Grid === 'function' && texture.width > slice[1] + slice[3] && texture.height > slice[0] + slice[2]) {
      g.draw9Grid(texture, x, y, width, height, slice);
    } else if (texture) {
      g.drawTexture(texture, x, y, width, height);
    } else if (fill) {
      g.drawRect(x + .5, y + .5, width - 1, height - 1, fill, border || null, 1);
    }
  }
  return {
    begin() { textures.clear(); },
    surface(node, kind, selected = false, hover = false) {
      const p = DEFAULT_NATIVE_PALETTE;
      if (kind === 'panel') {
        draw(node, getTexture('cmn_combox_openBg') || getTexture('window_content_bg2'),
          { slice: grid, fill: p.bg, border: p.borderSoft });
        return;
      }
      const skins = buttonSkins[kind];
      if (!skins) {
        draw(node, null, { fill: selected ? p.selected : hover ? p.hover : '' });
        return;
      }
      const texture = (selected || hover ? getTexture(skins[1]) : null) || getTexture(skins[0]);
      draw(node, texture, { slice: kind === 'segment' && !selected && !hover ? searchGrid : grid,
        fill: selected ? p.selected : hover ? p.hover : p.surface, border: selected ? p.accent : p.borderSoft });
    },
    dropdown(node, selected, hover) {
      const sheet = getTexture('cmn_combox_skin'), height = sheet?.height / 3;
      if (Number.isInteger(height) && height >= 12 && sheet.width > 39 && laya.Texture?.createFromTexture) {
        if (!comboFrames.has(sheet)) {
          comboFrames.set(sheet, Array.from({ length: 3 }, (_, index) =>
            laya.Texture.createFromTexture(sheet, 0, index * height, sheet.width, height)));
        }
        const frame = comboFrames.get(sheet)[selected ? 2 : hover ? 1 : 0];
        if (frame) {
          draw(node, frame, { slice: comboGrid });
          return true;
        }
      }
      const p = DEFAULT_NATIVE_PALETTE;
      draw(node, getTexture('search_bg9'), { slice: searchGrid, fill: selected ? p.selected : p.surface,
        border: selected ? p.accent : p.borderSoft });
      return false;
    },
    tab(node, value, selected, hover) {
      const skins = value == null ? null : read(() => owner.tabGroup.GetButtonByValue(value)?.skins);
      const index = selected ? 4 : hover ? 1 : 0;
      const artwork = getTexture(skins?.[index]) || getTexture(skins?.[0]);
      const texture = artwork || getTexture(tabSkins[selected ? 2 : hover ? 1 : 0]) || getTexture(tabSkins[0]);
      const y = selected || hover ? 0 : 6;
      const p = DEFAULT_NATIVE_PALETTE;
      draw(node, texture, { y, height: node.height - y, fill: selected ? p.selected : hover ? p.hover : p.surface,
        border: selected ? p.accent : p.borderSoft });
      return Boolean(artwork);
    },
    search(node, hover) {
      const skins = owner.searchView.searchBtn?.skins ?? searchSkins;
      const texture = getTexture(skins[Number(hover)]) || getTexture(skins[0]);
      if (!texture) return false;
      const scale = Math.min(1, (node.width - 4) / texture.width, (node.height - 4) / texture.height);
      const width = texture.width * scale, height = texture.height * scale;
      draw(node, texture, { x: (node.width - width) / 2, y: (node.height - height) / 2, width, height });
      return true;
    },
    dispose() {
      for (const frames of comboFrames.values()) for (const frame of frames) frame?.destroy();
      comboFrames.clear();
    },
  };
}
