import { DYNAMIC_GROUPS, dynamicFilterCount, emptyDynamicFilters, read } from './native-model.js';
import { badgePlacement, BADGE_WIDTH, BADGE_HEIGHT } from './badge.js';
import { TIERS, paintClassicTab, loadOrdinaryBadge } from './art.js';
import { getNativeTheme, DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';

export function textNode(laya, text, x, y, width, height = 24, color = DEFAULT_NATIVE_PALETTE.text, size = 12) {
  const node = new laya.Text();
  Object.assign(node, { text, x, y, width, height, color, fontSize: size, font: 'Microsoft YaHei', valign: 'middle', align: 'center', mouseEnabled: false });
  return node;
}
export function sectionTitle(laya, title, width = 790, palette = DEFAULT_NATIVE_PALETTE) {
  const root = new laya.Sprite(), cx = width / 2;
  root.size(width, 46); root.mouseEnabled = false;
  const label = textNode(laya, title, cx - 46, 9, 92, 28, palette.accent, 18);
  label.font = 'KaiTi'; label.bold = true; root.addChild(label);
  root.paintTheme = colors => {
    root.graphics.clear();
    for (const [x1, x2] of [[25, cx - 61], [cx + 61, width - 25]]) {
      root.graphics.drawLine(x1, 23, x2, 23, colors.borderSoft, 1);
      root.graphics.drawLine(x1, 24, x2, 24, colors.shadow, 1);
    }
    label.color = colors.accent; label.bgColor = colors.bg;
  };
  root.paintTheme(palette);
  return root;
}
export function qualityTitle(laya, title, quality, width = 790, palette = DEFAULT_NATIVE_PALETTE) {
  const tier = TIERS[quality] || TIERS[2], root = new laya.Sprite();
  root.size(width, 46); root.mouseEnabled = false;
  const cx = width / 2, g = root.graphics;
  for (const side of [-1, 1]) {
    const gap = quality < 0 ? 61 : 49;
    const start = side < 0 ? 25 : cx + gap, end = side < 0 ? cx - gap : width - 25;
    g.drawLine(start, 23, end, 23, palette.borderSoft, 1); g.drawLine(start, 24, end, 24, palette.shadow, 1);
  }
  const art = new laya.Sprite(); art.name = 'quality-badge-art'; art.pos(cx - BADGE_WIDTH / 2, 6); art.size(BADGE_WIDTH, BADGE_HEIGHT); art.mouseEnabled = false; root.addChild(art);
  // Compact text is only a loading/empty-list fallback, never a larger frame.
  const label = textNode(laya, title, cx - 46, 9, 92, 28, tier.text, quality < 0 ? 18 : 16);
  label.font = 'KaiTi'; label.bold = true; label.stroke = 1; label.strokeColor = palette.shadow; root.addChild(label);
  const apply = (texture, native) => {
    if (root.destroyed || !(texture?.width > 8 && texture?.height > 8) || typeof texture.getIsReady === 'function' && !texture.getIsReady()) return false;
    const placement = badgePlacement(texture); if (!placement) return false;
    const d = placement.draw; art.graphics.clear(); art.graphics.drawTexture(texture, d.x, d.y, d.width, d.height); label.visible = false;
    root.badgeVisibleBounds = placement.visible;
    if (native) root.nativeQualityTexture = texture;
    else root.ordinaryQualityTexture = texture;
    return true;
  };
  root.setNativeTexture = texture => quality > 0 && apply(texture, true);
  if (quality === 0) loadOrdinaryBadge(laya, texture => apply(texture, false));
  return root;
}

export function createSkinControls(ctx, owner, state, changed, markAllRead) {
  const laya = ctx.window.Laya ?? ctx.window.laya, theme = getNativeTheme(ctx);
  const root = new laya.Sprite(); root.name = 'sgs-toolbox-skin-controls'; root.zOrder = 40;
  root.mouseEnabled = true; root.mouseThrough = true; owner.addChild(root);
  // The game's window remains dark. Give our light-theme captions and summary their own backing.
  const footer = new laya.Sprite(); footer.name = 'skin-footer-surface'; footer.pos(324, 485); footer.size(514, 53); footer.mouseEnabled = false; root.addChild(footer);
  const buttons = [], popups = [], themedLabels = [];
  const caption = (text, x, y, width, height, role = 'muted', size = 11) => {
    const label = textNode(laya, text, x, y, width, height, theme.palette[role], size);
    themedLabels.push({ label, role }); return label;
  };
  const button = (name, title, x, y, width, action, selected = () => false, parent = root, options = {}) => {
    const height = options.height || 27, node = new laya.Sprite();
    node.name = name; node.size(width, height); node.pos(x, y); node.mouseEnabled = true;
    const label = textNode(laya, title, options.kind === 'option' ? 15 : 0, 0, width - (options.kind === 'option' ? 30 : 0), height, theme.palette.muted, 12);
    if (options.kind === 'option') label.align = 'left';
    node.addChild(label); parent.addChild(node);
    const marker = new laya.Sprite(); node.addChild(marker); marker.mouseEnabled = false;
    const item = { node, label, marker, width, height, selected, hover: false, options }; buttons.push(item);
    node.on('click', root, event => { event?.stopPropagation?.(); action(); paint(); });
    node.on('mouseover', root, () => { item.hover = true; paint(); });
    node.on('mouseout', root, () => { item.hover = false; paint(); });
    return node;
  };
  const popup = (x, y, width, height) => {
    const p = new laya.Sprite(); p.pos(x, y); p.size(width, height); p.visible = false; p.mouseEnabled = true; p.zOrder = 100;
    root.addChild(p); popups.push(p); return p;
  };
  const closeMenus = () => popups.forEach(p => { p.visible = false; });
  const grouping = popup(714, 44, 118, 77);
  button('skin-group-country', '按势力划分', 7, 7, 104, () => { state.group = 'country'; closeMenus(); changed(); }, () => state.group === 'country', grouping, { kind: 'option', height: 29 });
  button('skin-group-quality', '按品质划分', 7, 40, 104, () => { state.group = 'quality'; closeMenus(); changed(); }, () => state.group === 'quality', grouping, { kind: 'option', height: 29 });
  const groupBtn = button('skin-group', '', 724, 11, 108, () => { const next = !grouping.visible; closeMenus(); grouping.visible = next; });
  const groupArrow = new laya.Sprite(); groupBtn.addChild(groupArrow);
  const categoryNav = new laya.Sprite(); categoryNav.name = 'skin-category-tabs'; categoryNav.pos(30, 4); categoryNav.size(404, 38); root.addChild(categoryNav);
  const tabs = [];
  const tab = (name, title, index, mode, action, selected, count = () => 0) => {
    const node = new laya.Sprite(); node.name = name; node.size(69, 38); node.pos(index * 67, 0); node.mouseEnabled = true; categoryNav.addChild(node);
    const label = textNode(laya, title, 4, 6, 61, 31, theme.palette.muted, title.length === 1 ? 25 : 20);
    label.font = 'KaiTi'; label.bold = true; label.stroke = 1; label.strokeColor = theme.palette.shadow; node.addChild(label);
    const mark = new laya.Sprite(); mark.mouseEnabled = false; node.addChild(mark);
    const number = textNode(laya, '', 54, 0, 13, 13, '#ffedc6', 8); node.addChild(number);
    const item = { node, label, mark, number, mode, selected, count, hover: false }; tabs.push(item);
    node.on('click', root, event => { event?.stopPropagation?.(); closeMenus(); action(); changed(); });
    node.on('mouseover', root, () => { item.hover = true; paint(); }); node.on('mouseout', root, () => { item.hover = false; paint(); });
  };
  tab('skin-quality-new', '新品', 0, null, () => { owner.tabGroup.SelectedValue = owner.NEW_TYPE_VALUE; }, () => owner.tabGroup.SelectedValue === owner.NEW_TYPE_VALUE,
    () => read(() => owner.gsm.SkinNewRedNode) ? -1 : 0);
  for (const [i, title, value] of [[1, '魏', 1], [2, '蜀', 2], [3, '吴', 3], [4, '群', 4]]) {
    tab(`skin-country-${value}`, title, i, 'country', () => { owner.tabGroup.SelectedValue = value; }, () => owner.tabGroup.SelectedValue === value,
      () => read(() => owner.gsm.GetNewSkinNumInCountry(value)) || 0);
  }
  ['普通', '稀有', '史诗', '传说', '限定'].forEach((title, i) => {
    tab(`skin-quality-${i}`, title, i + 1, 'quality', () => { state.quality = i; owner.tabGroup.SelectedValue = state.lastCountry; },
      () => owner.tabGroup.SelectedValue !== owner.NEW_TYPE_VALUE && state.quality === i);
  });
  const searchBtn = button('skin-search', '', 686, 11, 29, () => {
    state.searchOpen = !state.searchOpen; owner.searchView.visible = state.searchOpen;
    if (state.searchOpen && owner.searchView.searchInput) owner.searchView.searchInput.focus = true;
    closeMenus();
  }, () => state.searchOpen || Boolean(state.query));
  const searchIcon = new laya.Sprite(); searchIcon.mouseEnabled = false; searchBtn.addChild(searchIcon);
  // One inset rail, with two independently selectable ownership segments.
  const craftMenu = popup(330, 380, 184, 101);
  [['all', '全部制作方式'], ['yes', '可朱砂制作'], ['no', '不可朱砂制作']].forEach(([key, title], i) => button('skin-craft-' + key, title, 7, 7 + i * 29, 170, () => { state.craft = key; closeMenus(); changed(); }, () => state.craft === key, craftMenu, { kind: 'option' }));
  const craftBtn = button('skin-craft', '制作', 325, 491, 38, () => { const next = !craftMenu.visible; closeMenus(); craftMenu.visible = next; }, () => state.craft !== 'all');
  const readBtn = button('skin-read-all', '一键已读', 440, 11, 90, () => markAllRead?.());

  const rail = new laya.Sprite(); rail.pos(362, 489); rail.size(150, 30); rail.mouseEnabled = false;
  root.addChild(rail);
  button('skin-missing', '未拥有', 365, 492, 70, () => { state.missing = !state.missing; changed(); }, () => state.missing, root, { height: 24, segment: true });
  button('skin-owned', '已拥有', 439, 492, 70, () => { state.owned = !state.owned; changed(); }, () => state.owned, root, { height: 24, segment: true });
  root.addChild(caption('动态', 548, 491, 34, 25));
  const menuHeight = 62 + DYNAMIC_GROUPS.reduce((height, group) => height + 27 + Math.ceil(group.options.length / 2) * 26, 0);
  const dynamicMenu = popup(546, 484 - menuHeight, 286, menuHeight);
  const menuTitle = caption('动态筛选', 16, 7, 130, 22, 'accent', 13); menuTitle.align = 'left'; dynamicMenu.addChild(menuTitle);
  const dynamicBtn = button('skin-dynamic', '', 590, 490, 242, () => { const next = !dynamicMenu.visible; closeMenus(); dynamicMenu.visible = next; }, () => dynamicFilterCount(state.dynamic) > 0);
  const dynamicArrow = new laya.Sprite(); dynamicBtn.addChild(dynamicArrow);
  button('skin-dynamic-all', '重置', 219, 7, 53, () => { state.dynamic = emptyDynamicFilters(); changed(); }, () => !dynamicFilterCount(state.dynamic), dynamicMenu, { kind: 'tab', height: 23 });
  let menuY = 36;
  for (const group of DYNAMIC_GROUPS) {
    const title = caption(group.title, 16, menuY, 100, 18); title.align = 'left'; dynamicMenu.addChild(title);
    button(`skin-dynamic-clear-${group.id}`, '不限', 228, menuY - 1, 42, () => { state.dynamic[group.id] = []; changed(); }, () => !state.dynamic[group.id].length, dynamicMenu, { kind: 'tab', height: 20 });
    group.options.forEach(([key, label], i) => button(`skin-dynamic-${group.id}-${key}`, label, 9 + i % 2 * 135, menuY + 21 + Math.floor(i / 2) * 26, 130, () => {
      const selected = state.dynamic[group.id];
      state.dynamic[group.id] = selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key]; changed();
    }, () => state.dynamic[group.id].includes(key), dynamicMenu, { kind: 'option', height: 25 }));
    menuY += 27 + Math.ceil(group.options.length / 2) * 26;
  }
  const rule = caption('同组满足任一项 · 不同组同时满足', 16, menuHeight - 26, 254, 18, 'muted', 10); dynamicMenu.addChild(rule);
  const stats = caption('', 330, 520, 350, 14, 'muted', 10.5); stats.name = 'skin-summary'; stats.align = 'left'; root.addChild(stats);
  const backgroundBtn = button('skin-background-only', '可作为牌局背景', 684, 518, 148, () => {
    state.backgroundOnly = !state.backgroundOnly; changed();
  }, () => state.backgroundOnly, root, { height: 21, segment: true });
  function paint() {
    if (root.destroyed) return;
    backgroundBtn.visible = ctx.backgrounds?.isInstalled?.() === true;
    stats.width = backgroundBtn.visible ? 350 : 502;
    readBtn.visible = owner.tabGroup.SelectedValue === owner.NEW_TYPE_VALUE && !state.searchOpen;
    const craft = buttons.find(b => b.node === craftBtn); craft.label.text = state.craft === 'yes' ? '可制' : state.craft === 'no' ? '不可制' : '制作';
    const palette = theme.palette;
    footer.visible = ctx.themes?.current?.tokens.scheme === 'light';
    if (footer.visible) theme.surface(footer, { width: footer.width, height: footer.height, kind: 'panel' });
    for (const { label, role } of themedLabels) label.color = palette[role];
    for (const popup of popups) theme.surface(popup, { width: popup.width, height: popup.height, kind: 'panel' });
    theme.surface(rail, { width: 150, height: 30, kind: 'panel' });
    searchIcon.graphics.clear();
    searchIcon.graphics.drawCircle(12, 11, 4, null, palette.accent, 1.3);
    searchIcon.graphics.drawLine(15, 14, 19, 18, palette.accent, 1.6);
    for (const item of buttons) {
      const selected = item.selected(), { options } = item;
      theme.surface(item.node, { width: item.width, height: item.height, kind: options.segment ? 'segment' : options.kind || 'button', selected, hover: item.hover });
      item.label.color = selected ? palette.accent : item.hover ? palette.text : palette.muted;
      const g = item.marker.graphics; g.clear();
      if (options.kind === 'option' && selected) {
        g.drawLines(item.width - 21, item.height / 2 - 1, [0, 0, 3, 3, 9, -3], palette.accent, 1.3);
      }
    }
    const group = buttons.find(b => b.node === groupBtn); group.label.text = `${state.group === 'country' ? '势力' : '品质'}分类`; group.label.width = 89;
    theme.chevron(groupArrow, 92, 12, grouping.visible);
    tabs.forEach(item => {
      item.node.visible = !item.mode || item.mode === state.group;
      if (!item.node.visible) return;
      const active = item.selected(); paintClassicTab(laya, item.node, 69, 38, active, item.hover, palette);
      item.label.color = active ? palette.accent : item.hover ? palette.text : palette.muted;
      item.label.strokeColor = palette.shadow;
      item.label.y = active || item.hover ? 2 : 6;
      const count = item.count(), g = item.mark.graphics; g.clear(); item.number.visible = count > 0;
      if (count) { g.drawCircle(60, 7, count > 0 ? 7 : 3.5, '#7c2420', palette.border, 0.8); item.number.text = count > 99 ? '99' : String(count); }
    });
    const names = DYNAMIC_GROUPS.flatMap(group => group.options.filter(([key]) => state.dynamic[group.id].includes(key)).map(([, label]) => label));
    const dynamic = buttons.find(b => b.node === dynamicBtn);
    dynamic.label.text = names.length > 2 ? `已选 ${names.length} 项动态条件` : names.length ? names.join(' / ') : '全部动态状态'; dynamic.label.width = 224;
    theme.chevron(dynamicArrow, 226, 12, dynamicMenu.visible);
  }
  const outside = event => {
    for (let p = event?.target; p; p = p.parent) if (p === root) return;
    closeMenus(); paint();
  };
  laya.stage?.on('mousedown', root, outside);
  const offTheme = theme.watch(paint, { target: root });
  return { root, paint, closeMenus, stats, dispose() { offTheme(); laya.stage?.off('mousedown', root, outside); root.destroy(true); } };
}
