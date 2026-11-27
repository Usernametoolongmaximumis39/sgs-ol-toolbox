import { cardBox, cardSuit, isSelectable, isSelected, nativeBox } from './native.js';
import { DIRECTIONS } from './routes.js';

const POSITION_GAP = 8;
const OBSTACLE_GAP = 4;
const BUTTON_GAP = 4;
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
  .routes[data-scroll]{overflow-y:auto;pointer-events:auto;overscroll-behavior:contain}
  .suits{display:flex;gap:var(--suit-gap,${BUTTON_GAP}px);pointer-events:none}
  .suits[data-vertical]{flex-direction:column}
  .suits button{flex:none;width:var(--suit-size);height:var(--suit-size);display:grid;place-items:center;
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
  const view = viewportBox(window);
  return {
    parts: boxes, board, city,
    table: { left: Math.max(stage.left, view.left), top: Math.max(stage.top, view.top),
      right: Math.min(stage.right, view.right), bottom: Math.min(stage.bottom, view.bottom) },
  };
}

const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
function viewportBox(window) {
  const view = window.visualViewport;
  if (view?.width > 0 && view.height > 0) {
    return { left: view.offsetLeft, top: view.offsetTop, right: view.offsetLeft + view.width, bottom: view.offsetTop + view.height };
  }
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

function rotateBox(box, turn) {
  if (turn === 90) return { left: -box.bottom, right: -box.top, top: box.left, bottom: box.right };
  if (turn === 270) return { left: box.top, right: box.bottom, top: -box.right, bottom: -box.left };
  if (turn === 180) return { left: -box.right, right: -box.left, top: -box.bottom, bottom: -box.top };
  return box;
}

export function placeSuits({ table, confirm, turn = 0, controls = [] }, viewport, obstacles) {
  // Position in the table's axes so "left of confirm" works after rotation.
  const orient = box => rotateBox(box, (360 - turn) % 360);
  const area = orient(table), view = orient(viewport), ok = orient(confirm);
  const intersection = {
    left: Math.max(area.left, view.left), right: Math.min(area.right, view.right),
    top: Math.max(area.top, view.top), bottom: Math.min(area.bottom, view.bottom),
  };
  const visible = width(intersection) > 0 && height(intersection) > 0 ? intersection : view;
  const pad = Math.min(POSITION_GAP, Math.floor(Math.min(width(visible), height(visible)) / 10));
  const left = Math.ceil(visible.left + pad), right = Math.floor(visible.right - pad);
  const top = Math.ceil(visible.top + pad), bottom = Math.floor(visible.bottom - pad);
  const anchorRight = Math.min(right, Math.floor(ok.left - POSITION_GAP));
  const center = (ok.top + ok.bottom) / 2;
  const occupied = [...obstacles, ...controls].map(orient).map(box => ({
    left: Math.floor(box.left - OBSTACLE_GAP), right: Math.ceil(box.right + OBSTACLE_GAP),
    top: Math.floor(box.top - OBSTACLE_GAP), bottom: Math.ceil(box.bottom + OBSTACLE_GAP),
  })).filter(box => overlaps(box, { left, right: anchorRight, top, bottom }));
  const preferredSize = Math.round(clamp(width(area) / 16, 26, 39));
  const gap = Math.min(BUTTON_GAP, Math.floor((right - left) / (2 * SUITS.length)));
  const gapWidth = gap * (SUITS.length - 1);
  const span = size => size * SUITS.length + gapWidth;
  const maxSize = edge => Math.min(preferredSize, bottom - top, Math.floor((edge - left - gapWidth) / SUITS.length));
  const centeredTop = size => clamp(Math.round(center - size / 2), top, bottom - size);
  const makeBox = (x, y, size) => ({ left: x, top: y, right: x + span(size), bottom: y + size });
  const placement = (box, size) => {
    const fit = rotateBox(box, turn);
    return { left: fit.left, top: fit.top, size, gap, vertical: turn % 180 !== 0 };
  };
  const largest = maxSize(anchorRight);
  for (let size = largest; size >= 18; size--) {
    const y = centeredTop(size);
    const xs = [anchorRight - span(size), ...occupied.map(box => box.left - span(size))].sort((a, b) => b - a);
    for (const x of xs) {
      if (x < left || x + span(size) > anchorRight) continue;
      const box = makeBox(x, y, size);
      if (!occupied.some(other => overlaps(box, other))) return placement(box, size);
    }
  }
  // Keep the shortcut on the confirm line when all collision checks fail.
  // If clipping removes the left strip, fit the row into the visible table.
  const size = largest >= 18 ? largest : Math.max(1, maxSize(right));
  const x = clamp(anchorRight - span(size), left, right - span(size));
  return placement(makeBox(x, centeredTop(size), size), size);
}

function placeRoutes(routes, board, table, viewport, obstacles) {
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
    { ...area, top: viewport.top + POSITION_GAP, bottom: Math.floor(table.top - POSITION_GAP), edge: 'above' },
    { ...area, top: Math.ceil(table.bottom + POSITION_GAP), bottom: viewport.bottom - POSITION_GAP, edge: 'below' },
  ];
  let best = null;
  routes.style.maxHeight = '';
  routes.toggleAttribute('data-scroll', false);
  for (const [horizontal, regions] of [[true, bands], [false, [...bands, ...sides]], [true, gutters]]) {
    routes.toggleAttribute('data-horizontal', horizontal);
    routes.style.width = 'max-content';
    const natural = routes.offsetWidth + 2;
    let shifted = null;
    for (const region of regions) {
      const wideRegion = width(region) >= 90;
      if (!wideRegion && width(region) < natural) continue;
      const panelWidth = Math.min(natural, width(region));
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
      const relevant = obstacles.filter(box => overlaps(box, region));
      const score = (x, y) => relevant.reduce((sum, box) => sum + overlapArea(box, {
        left: x, right: x + panelWidth, top: y, bottom: y + panelHeight,
      }), 0);
      if (wideRegion && score(left, top) === 0) return { left, top };
      const candidateX = new Set([left, region.left, region.right - panelWidth,
        ...relevant.flatMap(box => [box.left - panelWidth, box.right])]);
      const candidateY = new Set([top, region.top, region.bottom - panelHeight,
        ...relevant.flatMap(box => [box.top - panelHeight, box.bottom])]);
      for (const x of candidateX) {
        if (x < region.left || x + panelWidth > region.right) continue;
        for (const y of candidateY) {
          if (y < region.top || y + panelHeight > region.bottom) continue;
          const overlap = score(x, y);
          const distance = Math.abs(x - left) + Math.abs(y - top);
          if (!best || overlap < best.overlap || overlap === best.overlap && distance < best.distance) {
            best = { left: x, top: y, overlap, distance, horizontal, panelWidth };
          }
        }
        if (wideRegion && horizontal && x + panelWidth / 2 >= board.left && x + panelWidth / 2 <= board.right && score(x, top) === 0
            && (!shifted || Math.abs(x - left) < shifted.distance)) {
          shifted = { left: x, top, distance: Math.abs(x - left), panelWidth };
        }
      }
    }
    if (shifted) { setPixel(routes, 'width', shifted.panelWidth); return shifted; }
  }
  if (best) {
    routes.toggleAttribute('data-horizontal', best.horizontal);
    setPixel(routes, 'width', best.panelWidth);
    return best;
  }
  // Even when the grid and native UI leave no complete band, keep the
  // directions readable inside the window.
  const safe = width(area) >= 90 && height(area) > 0 ? area : {
    left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom,
  };
  if (width(safe) <= 0 || height(safe) <= 0) return null;
  routes.toggleAttribute('data-horizontal', true);
  routes.style.width = 'max-content';
  const w = Math.min(routes.offsetWidth + 2, width(safe));
  setPixel(routes, 'width', w);
  const h = Math.min(routes.offsetHeight, height(safe));
  if (routes.offsetHeight > h) {
    setPixel(routes, 'maxHeight', h);
    routes.toggleAttribute('data-scroll', true);
  }
  const left = clamp((board.left + board.right - w) / 2, safe.left, safe.right - w);
  const top = clamp(board.top - POSITION_GAP - h, safe.top, safe.bottom - h);
  const below = clamp(board.bottom + POSITION_GAP, safe.top, safe.bottom - h);
  const overlap = y => [board, ...obstacles].reduce((sum, box) => sum + overlapArea(box, {
    left, right: left + w, top: y, bottom: y + h,
  }), 0);
  return { left, top: overlap(top) <= overlap(below) ? top : below };
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
  let suitAnchorKey = '';
  let lockedSuitFit = null;

  function updateRoutes(boxes, plan, count, battleBoxes) {
    if (!boxes?.board || !count || plan?.covered !== count || !plan.paths.length) {
      routes.hidden = true; layoutKey = ''; return;
    }
    const { paths } = plan;
    const key = paths.map(path => path.join('')).join('|');
    if (!routes.firstChild || key !== routeKey) {
      routeKey = key;
      routes.replaceChildren();
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
    const { board, table, city } = boxes;
    const suitBounds = suits.hidden ? null : suits.getBoundingClientRect();
    const obstacles = [city, ...battleBoxes, suitBounds].filter(Boolean).map(box => ({
      left: Math.floor(box.left - OBSTACLE_GAP), right: Math.ceil(box.right + OBSTACLE_GAP),
      top: Math.floor(box.top - OBSTACLE_GAP), bottom: Math.ceil(box.bottom + OBSTACLE_GAP),
    }));
    const core = document.querySelector('[data-sgs-toolbox="core"]');
    const offset = core?.style.getPropertyValue('--sgs-font-offset') || '0px';
    const viewport = viewportBox(window);
    const layout = [key, offset, ...Object.values(viewport), ...Object.values(board), ...Object.values(table), ...obstacles.flatMap(Object.values)].join('|');
    if (layout === layoutKey) return;
    layoutKey = layout;
    if (host.style.getPropertyValue('--sgs-font-offset') !== offset) host.style.setProperty('--sgs-font-offset', offset);
    routes.hidden = false;
    const fit = placeRoutes(routes, board, table, viewport, obstacles);
    if (fit) position(routes, fit.left, fit.top);
    else routes.hidden = true;
  }

  function updateSuits(geometry, cards, locked, map, obstacles = []) {
    if (!geometry) { suits.hidden = true; return; }
    const viewport = viewportBox(window);
    const anchorKey = [geometry.turn, geometry.scaleKey || '', ...Object.values(geometry.table), ...Object.values(viewport)].join('|');
    if (!lockedSuitFit || suitAnchorKey !== anchorKey) {
      suitAnchorKey = anchorKey;
      lockedSuitFit = placeSuits(geometry, viewport, [map?.board, ...obstacles].filter(Boolean));
    }
    const { left, top, size, gap, vertical } = lockedSuitFit;
    suits.toggleAttribute('data-vertical', vertical);
    position(suits, left, top);
    if (suits.style.getPropertyValue('--suit-gap') !== `${gap}px`) suits.style.setProperty('--suit-gap', `${gap}px`);
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
