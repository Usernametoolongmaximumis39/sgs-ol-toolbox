import { cardBox, cardSuit, isSelectable, isSelected, nativeBox } from './native.js';
import { DIRECTIONS } from './routes.js';

const POSITION_GAP = 8;
const OBSTACLE_GAP = 4;
const BUTTON_GAP = 6;
const SUIT_RIGHT = .30;
const SUIT_CENTER_Y = .775;
const SUITS = [3, 1, 4, 2].map(id => DIRECTIONS[id - 1]);
const SCROLL_SLOTS = ['juanzhou_zhong', 'juanzhou_zuo', 'juanzhou_you'];

const styles = `
  :host{position:fixed;inset:0;z-index:2147482800;pointer-events:none;
    color:var(--sgs-text,#eee3cc);font-family:var(--sgs-font,"Microsoft YaHei",sans-serif)}
  [hidden]{display:none!important}
  .routes,.suits,.lock{position:absolute;box-sizing:border-box}
  .routes{color:var(--sgs-text,#eee3cc);background:var(--sgs-surface,#252721);
    border-radius:6px;padding:5px 10px;font-size:calc(14px + var(--sgs-font-offset,0px));line-height:1.35}
  .routes ol{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:0;padding:0;list-style:none}
  .routes[data-horizontal] ol{flex-flow:row wrap;justify-content:center;column-gap:24px}
  .routes li{display:flex;flex-wrap:wrap;gap:2px 4px;max-width:100%}
  .move{font:700 calc(24px + var(--sgs-font-offset,0px)) / 1 "Segoe UI Symbol","Microsoft YaHei",sans-serif}
  .red{color:var(--sgs-danger,#f58980)}
  .routes p{margin:0}
  .routes ol+p{margin-top:5px}
  .suits{display:flex;gap:${BUTTON_GAP}px;pointer-events:none}
  .suits button{width:var(--suit-size);height:var(--suit-size);display:grid;place-items:center;
    padding:0;border:1px solid var(--sgs-border,#685535);border-radius:6px;
    pointer-events:auto;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-touch-callout:none;
    background:var(--sgs-surface,#252721);color:var(--sgs-text,#eee3cc);
    font:600 min(22px,calc(var(--suit-size) * .64)) / 1 "Segoe UI Symbol","Microsoft YaHei",sans-serif;
    box-shadow:0 2px 5px rgba(0,0,0,.32)}
  .suits button.red{color:var(--sgs-danger,#f58980)}
  .suits button:hover,.suits button:focus-visible{border-color:var(--sgs-accent,#d7b66d)}
  .suits button:focus-visible{outline:2px solid var(--sgs-accent,#d7b66d);outline-offset:2px}
  .suits button[aria-pressed=true],.suits button[aria-pressed=mixed]{background:var(--sgs-selected,#4b422d)}
  .suits button[aria-pressed=true]{border-color:var(--sgs-accent,#d7b66d);
    box-shadow:inset 0 -2px var(--sgs-accent,#d7b66d),0 2px 5px rgba(0,0,0,.32)}
  .suits button[aria-pressed=mixed]{border-style:dashed;border-color:var(--sgs-accent,#d7b66d)}
  .suits button:disabled{opacity:.48;cursor:default}
  .lock{display:grid;place-items:center;width:16px;height:16px;border-radius:4px;
    background:var(--sgs-surface,#252721);color:var(--sgs-accent,#d7b66d);
    border:1px solid currentColor;font-size:10px;line-height:1}
`;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const width = box => box.right - box.left;
const height = box => box.bottom - box.top;
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function scrollParts(window, effect) {
  if (!effect?.visible || !effect.parent) return [];
  // The other spine slots also paint the desk. Only the paper and the two
  // rollers reserve space for the open map.
  const textures = new Set(SCROLL_SLOTS.map(name => effect.getSlotByName?.(name)?.currTexture).filter(Boolean));
  const parts = [];
  for (const draw of effect.graphics?.cmds || []) {
    if (!textures.has(draw.texture) || draw.alpha === 0) continue;
    const { x, y, matrix, vertices } = draw;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    function include(px, py) {
      const tx = matrix ? matrix.a * px + matrix.c * py + matrix.tx : px;
      const ty = matrix ? matrix.b * px + matrix.d * py + matrix.ty : py;
      left = Math.min(left, tx); top = Math.min(top, ty);
      right = Math.max(right, tx); bottom = Math.max(bottom, ty);
    }
    if (vertices?.length) {
      for (let i = 0; i + 1 < vertices.length; i += 2) include(vertices[i] + x, vertices[i + 1] + y);
    } else if (draw.width > 0 && draw.height > 0) {
      include(x, y); include(x + draw.width, y);
      include(x, y + draw.height); include(x + draw.width, y + draw.height);
    }
    const bounds = nativeBox(window, effect, left, top, right - left, bottom - top);
    if (bounds) parts.push(bounds);
  }
  if (parts.length) return parts;
  const bounds = effect.getSelfBounds?.();
  const fallback = bounds && nativeBox(window, effect, bounds.x, bounds.y, bounds.width, bounds.height);
  return fallback ? [fallback] : [];
}

export function mapBoxes(window, map) {
  // The native root includes empty rows and columns in its 5×5 grid.
  const cells = (map.boardCellSlots || []).map(node => nativeBox(window, node)).filter(Boolean);
  const root = nativeBox(window, map.boardRoot);
  const panel = nativeBox(window, map.panel);
  const board = cells.length ? {
    left: Math.min(...cells.map(box => box.left)), right: Math.max(...cells.map(box => box.right)),
    top: Math.min(...cells.map(box => box.top)), bottom: Math.max(...cells.map(box => box.bottom)),
  } : root ?? panel;
  const city = nativeBox(window, map.cityNameRoot);
  const boxes = [
    ...[panel, root, city].filter(Boolean),
    ...scrollParts(window, map.scrollEffect),
  ];
  const stage = nativeBox(window, map, 0, 0, map.getTableViewportWidth?.() ?? map.width, map.height);
  if (!boxes.length || !stage) return null;
  return {
    parts: boxes, board, city,
    table: { left: Math.max(stage.left, 0), top: Math.max(stage.top, 0),
      right: Math.min(stage.right, window.innerWidth), bottom: Math.min(stage.bottom, window.innerHeight) },
  };
}

function placeRoutes(routes, board, table, viewportHeight, obstacles) {
  const area = {
    left: Math.ceil(table.left + POSITION_GAP), right: Math.floor(table.right - POSITION_GAP),
    top: Math.ceil(table.top + POSITION_GAP), bottom: Math.floor(table.bottom - POSITION_GAP),
  };
  const bands = [
    { ...area, bottom: Math.min(area.bottom, Math.floor(board.top - POSITION_GAP)), edge: 'above' },
    { ...area, top: Math.max(area.top, Math.ceil(board.bottom + POSITION_GAP)), edge: 'below' },
  ];
  const sides = [
    { ...area, left: Math.max(area.left, Math.ceil(board.right + POSITION_GAP)), edge: 'right' },
    { ...area, right: Math.min(area.right, Math.floor(board.left - POSITION_GAP)), edge: 'left' },
  ];
  // The game can be letterboxed in portrait. Use the empty space at the
  // canvas edge when the tabletop itself has no room for the complete list.
  const gutters = [
    { ...area, top: POSITION_GAP, bottom: Math.floor(table.top - POSITION_GAP), edge: 'above' },
    { ...area, top: Math.ceil(table.bottom + POSITION_GAP), bottom: viewportHeight - POSITION_GAP, edge: 'below' },
  ];
  for (const [horizontal, regions] of [[true, bands], [false, [...bands, ...sides]], [true, gutters]]) {
    routes.toggleAttribute('data-horizontal', horizontal);
    routes.style.width = 'max-content';
    const natural = routes.offsetWidth + 2;
    let shifted = null;
    for (const region of regions) {
      const panelWidth = Math.min(natural, width(region));
      if (panelWidth < 90) continue;
      setPixel(routes, 'width', panelWidth);
      const panelHeight = routes.offsetHeight;
      if (panelHeight > height(region)) continue;
      const { edge } = region;
      const centerX = Math.round((board.left + board.right - panelWidth) / 2);
      const centerY = Math.round((board.top + board.bottom - panelHeight) / 2);
      const left = edge === 'right' ? region.left : edge === 'left' ? region.right - panelWidth
        : clamp(centerX, region.left, region.right - panelWidth);
      const top = edge === 'below' ? region.top : edge === 'above' ? region.bottom - panelHeight
        : clamp(centerY, region.top, region.bottom - panelHeight);
      const clear = x => !obstacles.some(box => overlaps({ left: x, top, right: x + panelWidth, bottom: top + panelHeight }, box));
      if (clear(left)) return { left, top };
      if (!horizontal || shifted) continue;
      const next = obstacles.flatMap(box => [box.left - panelWidth, box.right])
        .filter(x => x >= region.left && x + panelWidth <= region.right
          && x + panelWidth / 2 >= board.left && x + panelWidth / 2 <= board.right && clear(x))
        .sort((a, b) => Math.abs(a - left) - Math.abs(b - left))[0];
      if (next !== undefined) shifted = { left: next, top };
    }
    if (shifted) return shifted;
  }
  return null;
}

function setPixel(node, name, value) {
  const rounded = `${Math.round(value)}px`;
  if (node.style[name] !== rounded) node.style[name] = rounded;
}

function position(node, left, top) {
  setPixel(node, 'left', left);
  setPixel(node, 'top', top);
}

export function createOverlay(ctx, onSuit) {
  const { document, window, scope } = ctx;
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const host = make('div');
  host.dataset.sgsPeixiu = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const routes = make('section', 'routes'), suits = make('div', 'suits'), locks = make('div');
  routes.hidden = suits.hidden = true;
  routes.setAttribute('aria-label', '地图走法');
  suits.setAttribute('role', 'group');
  suits.setAttribute('aria-label', '采风花色快捷选牌');
  locks.setAttribute('aria-hidden', 'true');
  const buttons = new Map();
  for (const suit of SUITS) {
    const button = make('button', suit.suit <= 2 ? 'red' : '', suit.symbol);
    const label = `单击选中或取消${suit.name}，可叠加其他花色。右键、长按或 Shift+Enter 选其余花色。`;
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', 'false');
    button.dataset.suit = String(suit.suit);
    scope.listen(button, 'click', event => onSuit(suit.suit, false, event));
    scope.listen(button, 'keydown', event => {
      if (!event.shiftKey || event.key !== 'Enter' || event.repeat) return;
      event.preventDefault();
      onSuit(suit.suit, true, event);
    });
    buttons.set(button, suit.suit);
    suits.append(button);
  }
  shadow.append(make('style', '', styles), routes, suits, locks);
  (document.body || document.documentElement).append(host);
  scope.add(ctx.ui.mountStyles(shadow));
  scope.add(() => host.remove());
  scope.add(ctx.ui.nativeTheme.watch(palette => {
    for (const key of ['text', 'surface', 'border', 'accent', 'danger', 'selected']) {
      const color = palette[key];
      if (color) host.style.setProperty(`--sgs-${key}`, color);
    }
  }, { target: host }));
  const badges = new Map();
  let routeKey = '';
  let layoutKey = '';

  function updateRoutes(boxes, plan, count, battleBoxes) {
    if (!boxes?.board || !plan || !count) { routes.hidden = true; layoutKey = ''; return; }
    const { paths, covered } = plan;
    const key = [count, covered, ...paths.map(path => path.join(''))].join('|');
    if (!routes.firstChild || key !== routeKey) {
      routeKey = key;
      routes.replaceChildren();
      if (paths.length) {
        const list = make('ol');
        list.setAttribute('role', 'list');
        for (const path of paths) {
          const row = make('li');
          row.setAttribute('aria-label', path.map(step => DIRECTIONS[step - 1].name).join('、'));
          for (const step of path) {
            const move = make('span', step <= 2 ? 'move red' : 'move', DIRECTIONS[step - 1].symbol + '\uFE0E');
            move.setAttribute('aria-hidden', 'true');
            row.append(move);
          }
          list.append(row);
        }
        routes.append(list);
      }
      if (covered < count) {
        routes.append(make('p', '', covered ? `可再绘 ${covered}/${count} 城` : '当前找不到可绘路线'));
      }
    }
    const { board, table, city } = boxes;
    const suitBounds = suits.hidden ? null : suits.getBoundingClientRect();
    const obstacles = [city, ...battleBoxes, suitBounds].filter(Boolean).map(box => ({
      left: Math.floor(box.left - OBSTACLE_GAP), right: Math.ceil(box.right + OBSTACLE_GAP),
      top: Math.floor(box.top - OBSTACLE_GAP), bottom: Math.ceil(box.bottom + OBSTACLE_GAP),
    }));
    const core = document.querySelector('[data-sgs-toolbox="core"]');
    const offset = core?.style.getPropertyValue('--sgs-font-offset') || '0px';
    const layout = [key, offset, window.innerHeight, ...Object.values(board), ...Object.values(table), ...obstacles.flatMap(Object.values)].join('|');
    if (layout === layoutKey) return;
    layoutKey = layout;
    if (host.style.getPropertyValue('--sgs-font-offset') !== offset) host.style.setProperty('--sgs-font-offset', offset);
    routes.hidden = false;
    const fit = placeRoutes(routes, board, table, window.innerHeight, obstacles);
    if (fit) position(routes, fit.left, fit.top);
    else routes.hidden = true;
  }

  function updateSuits(canvas, cards, locked) {
    const rect = canvas?.getBoundingClientRect();
    if (!rect?.width || !rect.height) { suits.hidden = true; return; }
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    const tableWidth = Math.min(window.innerWidth, rect.right) - left;
    const tableBottom = Math.min(window.innerHeight, rect.bottom);
    if (tableWidth <= 0 || tableBottom <= top) { suits.hidden = true; return; }
    const size = Math.round(clamp(tableWidth * .065, 25, 39));
    const groupWidth = size * SUITS.length + BUTTON_GAP * (SUITS.length - 1);
    // These coordinates follow only the game canvas, so selection, the action bar,
    // and the scroll animation all leave the shortcuts in place.
    const anchorLeft = left + tableWidth * SUIT_RIGHT - groupWidth;
    const gutter = anchorLeft < left + POSITION_GAP && tableBottom + size + POSITION_GAP <= window.innerHeight;
    const anchorY = top + (tableBottom - top) * SUIT_CENTER_Y - size / 2;
    position(suits, Math.max(left + POSITION_GAP, anchorLeft), gutter ? tableBottom + POSITION_GAP : anchorY);
    if (suits.style.getPropertyValue('--suit-size') !== `${size}px`) suits.style.setProperty('--suit-size', `${size}px`);
    const eligible = cards.filter(entry => !locked.has(entry.id) && isSelectable(entry.ui));
    for (const [control, suit] of buttons) {
      const matching = eligible.filter(({ ui }) => cardSuit(ui) === suit);
      const selected = matching.filter(({ ui }) => isSelected(ui)).length;
      const state = selected === 0 ? 'false' : selected === matching.length ? 'true' : 'mixed';
      if (control.getAttribute('aria-pressed') !== state) control.setAttribute('aria-pressed', state);
      control.disabled = !eligible.length;
    }
    suits.hidden = false;
  }

  function updateLocks(cards, locked) {
    const drawn = new Set();
    for (const { id, ui, inHand } of cards) {
      if (!locked.has(id)) continue;
      const box = cardBox(window, ui);
      if (!box || width(box) < 12 || height(box) < 12) continue;
      let badge = badges.get(id);
      if (!badge) {
        badge = make('span', 'lock', '锁');
        locks.append(badge);
        badges.set(id, badge);
      }
      drawn.add(id);
      if (inHand) position(badge, box.left + 3, box.bottom - 18);
      else position(badge, box.right - 19, box.top + Math.max(0, (height(box) - 16) / 2));
    }
    for (const [id, badge] of badges) if (!drawn.has(id)) { badge.remove(); badges.delete(id); }
  }

  const canPick = control => !suits.hidden && buttons.has(control) && !control.disabled;
  return { updateRoutes, updateSuits, updateLocks, canPick, suitHit(event) {
    const control = event.composedPath().find(node => buttons.has(node));
    return canPick(control) ? { control, suit: buttons.get(control) } : null;
  } };
}
