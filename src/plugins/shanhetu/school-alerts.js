import { CHOICE_WINDOWS, mounted, nativeWindow } from './native-windows.js';

const cards = list => Array.isArray(list) && list.length <= 128 ? list : [];
const bought = card => Boolean(card.Data?.IsBuyed);
const stockOrder = (a, b) => Number(bought(a)) - Number(bought(b)) || a.Id - b.Id;
const matchKey = (match, id) => `${match.school}/${id}`;
const TACTICS = 2;
const DOT_RADIUS = 5;
const STAR = [0, -8, 2.5, -2.6, 8, -2.5, 3.8, 1.4, 5, 7, 0, 4.2, -5, 7, -3.8, 1.4, -8, -2.5, -2.5, -2.6];

function newOffers(offers, match, announced) {
  const fresh = [];
  for (const { id, type, name } of offers) {
    for (const target of match(id, type)) {
      const key = matchKey(target, id);
      if (announced.has(key)) continue;
      announced.add(key);
      fresh.push(`${target.name}套装的${name}`);
    }
  }
  return fresh.join('、');
}

export function createSchoolAlerts(ctx) {
  let shopKey = '';
  const shopAnnounced = new Set();
  let choice = null, choiceKey = '', choiceMessage = null, choiceAnnounced = new Set();
  let paintedShop = null, dismissNotice = null, shopNotice = false;
  const dots = new Map();
  const badges = new Map();
  const theme = ctx.ui.nativeTheme;

  function paintChoice(targets) {
    const { Sprite, Text } = ctx.window?.Laya || {};
    const palette = theme.palette;
    const light = ctx.themes?.current?.tokens?.scheme === 'light';
    const keep = new Set();
    const canDraw = typeof Sprite === 'function' && typeof Text === 'function';
    for (const card of canDraw ? targets : []) {
      const bounds = card.width > 0 && card.height > 0 ? null : card.getSelfBounds?.();
      const width = bounds?.width ?? card.width, height = bounds?.height ?? card.height;
      if (!Number.isFinite(width) || width < 96 || !Number.isFinite(height) || height < 100
        || typeof card.addChild !== 'function') continue;
      let entry = badges.get(card);
      if (!entry || entry.badge.destroyed || entry.badge.parent !== card) {
        if (entry && !entry.badge.destroyed) entry.badge.destroy(true);
        const badge = new Sprite();
        badge.name = 'sgs-sh-follow-choice';
        badge.zOrder = 101;
        badge.mouseEnabled = false;
        const label = badge.addChild(new Text());
        label.mouseEnabled = false;
        label.bold = true;
        label.valign = 'middle';
        label.text = '已关注';
        card.addChild(badge);
        badges.set(card, entry = { badge, label });
      }
      keep.add(card);
      const { badge, label } = entry;
      const fontSize = Math.max(14, Math.min(22, Math.round(width * .08)));
      const badgeWidth = fontSize * 3 + 44, badgeHeight = fontSize + 13;
      badge.pos((bounds?.x ?? 0) + width - badgeWidth - Math.round(width * .05),
        (bounds?.y ?? 0) + Math.round(height * .12));
      if (entry.palette === palette && label.fontSize === fontSize) continue;
      entry.palette = palette;
      badge.graphics.clear();
      badge.graphics.drawRect(0, 0, badgeWidth, badgeHeight, light ? palette.accent : palette.bg, palette.accent, 1);
      badge.graphics.drawPoly(17, badgeHeight / 2, STAR, light ? palette.bg : palette.highlight);
      label.pos(31, 0);
      label.height = badgeHeight;
      label.fontSize = fontSize;
      label.color = light ? palette.bg : palette.text;
    }
    for (const [card, { badge }] of badges) {
      if (keep.has(card)) continue;
      if (!badge.destroyed) badge.destroy(true);
      badges.delete(card);
    }
  }

  function paintDots(targets) {
    for (const [button, dot] of dots) {
      if (targets.has(button) && !dot.destroyed) continue;
      if (!dot.destroyed) dot.destroy();
      dots.delete(button);
    }
    const Sprite = ctx.window?.Laya?.Sprite;
    if (typeof Sprite !== 'function') return;
    for (const [button, flatParent] of targets) {
      const width = flatParent ? button.renderWidth ?? button.width : button.width;
      const parent = flatParent || button;
      if (!Number.isFinite(width) || width < DOT_RADIUS * 2 || typeof parent.addChild !== 'function') continue;
      let dot = dots.get(button);
      if (!dot) {
        dot = new Sprite();
        dot.name = 'sgs-sh-follow-dot';
        dot.mouseEnabled = false;
        dot.zOrder = 101;
        dot.graphics.drawCircle(0, 0, DOT_RADIUS, '#e7433a', '#fff1cd', 1);
        dots.set(button, dot);
      }
      if (dot.parent !== parent) parent.addChild(dot);
      // The map's flat button is drawn into its owner, unlike shop buttons.
      const x = flatParent ? button.renderX ?? button.x : 0;
      const y = flatParent ? button.renderY ?? button.y : 0;
      dot.pos(x + width - DOT_RADIUS, y + DOT_RADIUS);
    }
  }

  function arrange(win, rows, resetScroll) {
    const list = win.itemList;
    if (!rows.some((row, index) => row !== list[index])) return;
    list.splice(0, list.length, ...rows);
    win.layout();
    const panel = win.panel;
    panel.UpdateDrawContent();
    if (panel.hScrollBar) {
      panel.hScrollBar.max = Math.max(0, panel.contentWidth - panel.width);
      if (resetScroll) panel.hScrollBar.value = 0;
    }
  }

  function clearShop() {
    const win = paintedShop;
    paintedShop = null;
    if (win && !win.destroyed && win.curValue === TACTICS && win.panel && !win.panel.destroyed) {
      const list = cards(win.itemList);
      if (list.every(Boolean)) arrange(win, [...list].sort(stockOrder), false);
    }
  }

  function paintShop(win, followedGoods, targets) {
    if (!win || win.curValue !== TACTICS || typeof win.layout !== 'function'
      || typeof win.panel?.UpdateDrawContent !== 'function') { clearShop(); return; }
    const list = cards(win.itemList).filter(Boolean);
    const isMatch = card => !bought(card) && followedGoods.has(String(card.Id));
    if (list.length !== win.itemList?.length || !list.some(isMatch)) { clearShop(); return; }
    if (paintedShop !== win) clearShop();
    paintedShop = win;
    arrange(win, [...list].sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)) || stockOrder(a, b)), true);
    for (const card of list) {
      const button = card.tongqianBtn;
      if (isMatch(card) && button?.parent === card && !button.destroyed && button.visible !== false && card.visible !== false) {
        targets.set(button, null);
      }
    }
  }

  function update({ identity, shop, goods, refresh, match, tactics, onMap, left, shopWindow }) {
    const stage = ctx.window?.Laya?.stage;
    const followedGoods = new Set();
    const messages = [];
    if (shop && identity && match && onMap) {
      const key = JSON.stringify([identity, shop.id, shop.open === true, refresh, goods.map(good => [good.id, good.type])]);
      if (shopKey !== key || shopWindow.opened) { shopKey = key; shopAnnounced.clear(); }
      const available = goods.filter(good => good.type === TACTICS && good.bought === false);
      for (const good of available) if (match(good.id, good.type).length) followedGoods.add(String(good.id));
      const names = newOffers(available, match, shopAnnounced);
      if (names) messages.push(`商店有关注的${names}`);
    }
    if (!followedGoods.size) {
      shopAnnounced.clear();
      if (shopNotice) {
        dismissNotice?.();
        dismissNotice = null;
        shopNotice = false;
      }
    }
    const targets = new Map();
    const shopWin = followedGoods.size ? shopWindow.win : null;
    if (followedGoods.size) {
      const entrance = left?.shopBtn;
      if (entrance && !entrance.destroyed && entrance.visible !== false && mounted(left, stage)) {
        targets.set(entrance, entrance.parent === left ? null : left);
      }
      const tab = shopWin?.tabGroup?.GetButtonByValue?.(TACTICS);
      if (mounted(tab, stage)) targets.set(tab, null);
    }
    paintShop(shopWin, followedGoods, targets);
    paintDots(targets);
    const hasShopMessage = messages.length > 0;
    let win = null, offers = [];
    if (stage && match) {
      for (const name of CHOICE_WINDOWS) {
        win = nativeWindow(ctx.game, stage, name);
        if (!win) continue;
        const items = mounted(win.selectPanel, stage) ? win.SelectItemList : win.ShowItemList;
        offers = cards(items).filter(card => mounted(card, stage) && card.Data && Number(card.Type) === TACTICS)
          .map(card => ({ card, id: card.Id, type: card.Type, name: tactics.get(String(card.Id))?.name }));
        break;
      }
    }
    const key = JSON.stringify([identity, offers.map(offer => offer.id)]);
    if (choice !== win || choiceMessage !== win?.msg || choiceKey !== key) {
      choice = win; choiceMessage = win?.msg; choiceKey = key; choiceAnnounced = new Set();
    }
    paintChoice(new Set(offers.filter(offer => match(offer.id, offer.type).length).map(offer => offer.card)));
    if (match && offers.length) {
      const names = newOffers(offers.filter(offer => offer.name), match, choiceAnnounced);
      if (names) messages.push(`出现了关注的${names}，请注意选择`);
    }
    if (messages.length) {
      dismissNotice = ctx.notify?.(messages.join('。'), { position: 'top' });
      shopNotice = hasShopMessage && messages.length === 1;
    }
    return followedGoods;
  }

  ctx.scope.add(theme.watch(() => paintChoice(new Set(badges.keys()))));
  ctx.scope.add(() => { dismissNotice?.(); clearShop(); paintDots(new Map()); paintChoice(new Set()); });
  return { update };
}
