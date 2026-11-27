/**
 * Pure map-card placement. Every rectangle is in the same overlay coordinate
 * system. Native display-tree measurement belongs to the caller.
 */
const EPS = 1e-7;
const MARGIN = 8;
const NODE_GAP = 8;
const CARD_GAP = 8;
const PREFERRED_GAP = 12;
const MAX_CANDIDATES = 48;
const MAX_CARD_SIZES = 7;
const BEAM_WIDTH = 64;
const MAX_EXPANSIONS = 30000;
// Layout preferences, not safety limits: UI coverage above this fraction is
// increasingly costly, but never makes an otherwise safe card illegal.
const UI_COVERAGE_BUDGET = 0.35;
const ABOVE_MAX_GAP = 32;
const REFLOW_COST_PER_PIXEL = 0.1;

const finite = Number.isFinite;
const idKey = id => typeof id === 'string' && id.length > 0
  ? id : typeof id === 'number' && finite(id) ? String(id) : null;
const compareKey = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const validRect = r => !!r && finite(r.x) && finite(r.y) && finite(r.w) && finite(r.h)
  && finite(r.x + r.w) && finite(r.y + r.h) && r.w > 0 && r.h > 0;
const rect = r => ({ x: r.x, y: r.y, w: r.w, h: r.h });
const cardSize = ({ w, h, carousel, detailFit }) => ({ w, h,
  ...(carousel ? { carousel: true, detailFit: detailFit || 0 } : {}) });
const right = r => r.x + r.w;
const bottom = r => r.y + r.h;
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inflate = (r, n) => ({ x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 });
const inside = (a, b) => a.x >= b.x - EPS && a.y >= b.y - EPS
  && right(a) <= right(b) + EPS && bottom(a) <= bottom(b) + EPS;
const overlap = (a, b) => a.x < right(b) - EPS && right(a) > b.x + EPS
  && a.y < bottom(b) - EPS && bottom(a) > b.y + EPS;
const distance = (a, b) => {
  const dx = Math.max(a.x - right(b), b.x - right(a), 0);
  const dy = Math.max(a.y - bottom(b), b.y - bottom(a), 0);
  return dx && dy ? Math.hypot(dx, dy) : dx + dy;
};
const fartherThan = (a, b, limit) => {
  const dx = Math.max(a.x - right(b), b.x - right(a), 0);
  const dy = Math.max(a.y - bottom(b), b.y - bottom(a), 0);
  return dx > limit || dy > limit || (dx && dy && Math.hypot(dx, dy) > limit);
};
const lineLength = l => Math.hypot(l.toX - l.fromX, l.toY - l.fromY);
const validLine = l => !!l && finite(l.fromX) && finite(l.fromY) && finite(l.toX) && finite(l.toY);
const pointInside = (x, y, r) => x >= r.x - EPS && x <= right(r) + EPS
  && y >= r.y - EPS && y <= bottom(r) + EPS;
const sameLine = (a, b) => validLine(a) && validLine(b)
  && ['fromX', 'fromY', 'toX', 'toY'].every(k => Math.abs(a[k] - b[k]) <= EPS);

function bounds(regions) {
  const x = Math.min(...regions.map(r => r.x));
  const y = Math.min(...regions.map(r => r.y));
  return { x, y, w: Math.max(...regions.map(right)) - x, h: Math.max(...regions.map(bottom)) - y };
}

// Choose the shortest connector, resolving overlapping axis intervals at the
// owner's centre. This makes the line reproducible and impossible to spoof.
function connector(anchor, card) {
  const c = centre(anchor);
  const axis = (a0, a1, b0, b1, preferred) => {
    if (a1 < b0) return [a1, b0];
    if (b1 < a0) return [a0, b1];
    const p = Math.max(Math.max(a0, b0), Math.min(Math.min(a1, b1), preferred));
    return [p, p];
  };
  const [fromX, toX] = axis(anchor.x, right(anchor), card.x, right(card), c.x);
  const [fromY, toY] = axis(anchor.y, bottom(anchor), card.y, bottom(card), c.y);
  return { fromX, fromY, toX, toY };
}

// Liang–Barsky clipping. Contact with an obstacle edge also makes a line
// ambiguous, so this deliberately treats touching as an intersection.
function lineHitsRect(l, r) {
  const rRight = right(r), rBottom = bottom(r);
  if (Math.max(l.fromX, l.toX) < r.x - EPS || Math.min(l.fromX, l.toX) > rRight + EPS
    || Math.max(l.fromY, l.toY) < r.y - EPS || Math.min(l.fromY, l.toY) > rBottom + EPS) return false;
  let lo = 0;
  let hi = 1;
  const dx = l.toX - l.fromX;
  const dy = l.toY - l.fromY;
  if (Math.abs(dx) <= EPS) {
    if (l.fromX - r.x < -EPS || rRight - l.fromX < -EPS) return false;
  } else {
    const left = (l.fromX - r.x) / -dx, rightEdge = (rRight - l.fromX) / dx;
    lo = Math.max(lo, dx > 0 ? left : rightEdge);
    hi = Math.min(hi, dx > 0 ? rightEdge : left);
    if (lo > hi + EPS) return false;
  }
  if (Math.abs(dy) <= EPS) {
    if (l.fromY - r.y < -EPS || rBottom - l.fromY < -EPS) return false;
  } else {
    const top = (l.fromY - r.y) / -dy, bottomEdge = (rBottom - l.fromY) / dy;
    lo = Math.max(lo, dy > 0 ? top : bottomEdge);
    hi = Math.min(hi, dy > 0 ? bottomEdge : top);
  }
  return !(lo > hi + EPS);
}

function linesIntersect(a, b) {
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const on = (x, y, l) => x >= Math.min(l.fromX, l.toX) - EPS
    && x <= Math.max(l.fromX, l.toX) + EPS
    && y >= Math.min(l.fromY, l.toY) - EPS && y <= Math.max(l.fromY, l.toY) + EPS;
  const aa = cross(a.fromX, a.fromY, a.toX, a.toY, b.fromX, b.fromY);
  const ab = cross(a.fromX, a.fromY, a.toX, a.toY, b.toX, b.toY);
  const ba = cross(b.fromX, b.fromY, b.toX, b.toY, a.fromX, a.fromY);
  const bb = cross(b.fromX, b.fromY, b.toX, b.toY, a.toX, a.toY);
  if (((aa > EPS && ab < -EPS) || (aa < -EPS && ab > EPS))
    && ((ba > EPS && bb < -EPS) || (ba < -EPS && bb > EPS))) return true;
  return (Math.abs(aa) <= EPS && on(b.fromX, b.fromY, a))
    || (Math.abs(ab) <= EPS && on(b.toX, b.toY, a))
    || (Math.abs(ba) <= EPS && on(a.fromX, a.fromY, b))
    || (Math.abs(bb) <= EPS && on(a.toX, a.toY, b));
}

function prepare(snapshot) {
  const errors = [];
  if (!snapshot || !validRect(snapshot.viewport)) errors.push('invalid-viewport');
  const arrays = {};
  for (const name of ['nodes', 'cards', 'controls', 'previous', 'occupied']) {
    const value = snapshot?.[name] ?? [];
    arrays[name] = Array.isArray(value) ? value : [];
    if (!Array.isArray(value)) errors.push(`invalid-${name}`);
  }
  const nodes = new Map();
  const cards = new Map();
  const cardSizes = new Map();
  const previous = new Map();
  for (const [name, records, map] of [['node', arrays.nodes, nodes], ['card', arrays.cards, cards],
    ['previous', arrays.previous, previous]]) {
    for (const record of records) {
      const key = idKey(record?.id);
      if (key === null) errors.push(`invalid-${name}-id`);
      else if (map.has(key)) errors.push(`duplicate-${name}-id:${key}`);
      else map.set(key, record);
      if (name === 'node') {
        if (!validRect(record?.anchor) || (record.regions !== undefined && !Array.isArray(record.regions))
          || (record.regions || []).some(r => !validRect(r))) errors.push(`invalid-node-geometry:${key}`);
      } else if (name === 'card') {
        if (record?.alternatives !== undefined && !Array.isArray(record.alternatives))
          errors.push(`invalid-card-alternatives:${key}`);
        const values = [record, ...(Array.isArray(record?.alternatives) ? record.alternatives : [])];
        if (values.some(size => !size || !finite(size.w) || !finite(size.h) || size.w <= 0 || size.h <= 0))
          errors.push(`invalid-card-geometry:${key}`);
        else {
          const sizes = [...new Map(values.map(size => [`${size.w},${size.h}`, cardSize(size)])).values()];
          if (sizes.length > MAX_CARD_SIZES) errors.push(`too-many-card-sizes:${key}`);
          cardSizes.set(key, sizes);
        }
      } else if (!validRect(record)) errors.push(`invalid-previous-geometry:${key}`);
    }
  }
  for (const r of arrays.controls) if (!validRect(r)) errors.push('invalid-control-geometry');
  for (const p of arrays.occupied) if (!validRect(p) || !validLine(p.line)) errors.push('invalid-occupied-placement');
  if (snapshot?.shop != null && !validRect(snapshot.shop)) errors.push('invalid-shop-geometry');
  if (snapshot?.drawer !== undefined && snapshot.drawer !== null && !validRect(snapshot.drawer))
    errors.push('invalid-drawer-geometry');
  for (const key of cards.keys()) if (!nodes.has(key)) errors.push(`missing-node:${key}`);
  if (errors.length) return { errors, rawCards: arrays.cards };
  const orderedNodes = [...nodes.entries()].sort(([a], [b]) => compareKey(a, b)).map(([key, n]) => {
    const regions = [n.anchor, ...(n.regions || [])].map(rect);
    return { key, id: n.id, anchor: rect(n.anchor), regions, area: bounds(regions), centre: centre(n.anchor),
      protectedRegions: [...new Map(regions.map(r => [`${r.x},${r.y},${r.w},${r.h}`, inflate(r, NODE_GAP)])).values()] };
  });
  const controls = arrays.controls.map(rect);
  const shop = snapshot.shop ? rect(snapshot.shop) : null;
  const drawer = snapshot.drawer ? rect(snapshot.drawer) : null;
  return {
    errors, rawCards: arrays.cards, nodes: orderedNodes,
    nodeMap: new Map(orderedNodes.map(n => [n.key, n])), cards, cardSizes, previous,
    viewport: rect(snapshot.viewport), safe: inflate(snapshot.viewport, -MARGIN), controls, shop,
    drawer, protectedDrawer: drawer ? inflate(drawer, CARD_GAP) : null, occupied: arrays.occupied,
    candidateObstacles: [...orderedNodes.flatMap(n => n.regions), ...controls, ...arrays.occupied, ...[shop, drawer].filter(Boolean)],
  };
}

function pairReasons(a, b) {
  const reasons = [];
  if (overlap(inflate(a, CARD_GAP / 2), inflate(b, CARD_GAP / 2))) reasons.push('card-overlap');
  if (lineHitsRect(a.line, b) || lineHitsRect(b.line, a)) reasons.push('line-crosses-card');
  if (linesIntersect(a.line, b.line)) reasons.push('line-crossing');
  return reasons;
}

function pairConflicts(a, b) {
  const half = CARD_GAP / 2;
  return (a.x - half < right(b) + half - EPS && right(a) + half > b.x - half + EPS
    && a.y - half < bottom(b) + half - EPS && bottom(a) + half > b.y - half + EPS)
    || lineHitsRect(a.line, b) || lineHitsRect(b.line, a) || linesIntersect(a.line, b.line);
}

function isSelfOverlay(anchor, p) {
  const a = centre(anchor), c = centre(p);
  if (Math.abs(a.x - c.x) > anchor.w / 4 + EPS || Math.abs(a.y - c.y) > anchor.h / 4 + EPS) return false;
  const area = Math.max(0, Math.min(right(anchor), right(p)) - Math.max(anchor.x, p.x))
    * Math.max(0, Math.min(bottom(anchor), bottom(p)) - Math.max(anchor.y, p.y));
  return area + EPS >= Math.min(anchor.w * anchor.h, p.w * p.h) * 0.5;
}

function check(ctx, p, others = []) {
  const reasons = [];
  const key = idKey(p?.id);
  const card = ctx.cards.get(key);
  const owner = ctx.nodeMap.get(key);
  if (!card || !owner) return { valid: false, reasons: ['unknown-card'] };
  if (!validRect(p) || !validLine(p.line)) return { valid: false, reasons: ['invalid-placement-geometry'] };
  if (!ctx.cardSizes.get(key).some(size => p.w === size.w && p.h === size.h)) reasons.push('changed-card-size');
  if (!validRect(ctx.safe) || !inside(p, ctx.safe)) reasons.push('outside-viewport');
  if (!sameLine(p.line, connector(owner.anchor, p))) reasons.push('invalid-owner-connector');
  if (lineLength(p.line) > p.w + EPS) reasons.push('connector-too-long');
  if (!pointInside(p.line.fromX, p.line.fromY, ctx.viewport)
    || !pointInside(p.line.toX, p.line.toY, ctx.viewport)) reasons.push('line-outside-viewport');
  const ownerDistance = distance(p, owner.anchor);
  const selfOverlay = isSelfOverlay(owner.anchor, p);
  for (const n of ctx.nodes) {
    if ((n.key !== key || !selfOverlay) && n.protectedRegions.some(r => overlap(p, r)))
      reasons.push(`node-overlap:${n.key}`);
    if (n.key !== key) {
      if (!(ownerDistance + EPS < distance(p, n.anchor))) reasons.push(`ambiguous-owner:${n.key}`);
      if (n.protectedRegions.some(r => lineHitsRect(p.line, r))) reasons.push(`line-crosses-node:${n.key}`);
    }
  }
  if (ctx.drawer) {
    const protectedRect = ctx.protectedDrawer;
    if (overlap(p, protectedRect)) reasons.push('drawer-overlap');
    if (lineHitsRect(p.line, protectedRect)) reasons.push('line-crosses-drawer');
  }
  for (const occupied of ctx.occupied) reasons.push(...pairReasons(p, occupied));
  const keys = new Set([key]);
  for (const other of others) {
    const otherKey = idKey(other?.id);
    if (otherKey === null || keys.has(otherKey)) { reasons.push('duplicate-other-id'); continue; }
    keys.add(otherKey);
    if (!validRect(other) || !validLine(other.line)) { reasons.push('invalid-other-placement'); continue; }
    reasons.push(...pairReasons(p, other));
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Independently recheck a proposed placement against a fresh geometry snapshot. */
export function validatePlacement(snapshot, placement, others = []) {
  const ctx = prepare(snapshot);
  if (ctx.errors.length) return { valid: false, reasons: ctx.errors };
  if (!Array.isArray(others)) return { valid: false, reasons: ['invalid-other-placements'] };
  return check(ctx, placement, others);
}

const CANDIDATE_REASONS = ['invalid-placement-geometry', 'outside-viewport', 'connector-too-long',
  'line-outside-viewport', 'node-overlap', 'ambiguous-owner', 'line-crosses-node', 'drawer-overlap', 'line-crosses-drawer'];

// Generated candidates already have a known measured size and the canonical
// connector. Diagnostics need each rejection category only once, so avoid
// allocating per-node error strings and recomputing a category after it fails.
// The public validator remains the independent full final check.
function candidateRejections(ctx, p, owner) {
  if (!validRect(p) || !validLine(p.line)) return 1;
  let rejected = 0;
  if (!validRect(ctx.safe) || !inside(p, ctx.safe)) rejected |= 2;
  if (lineLength(p.line) > p.w + EPS) rejected |= 4;
  if (!pointInside(p.line.fromX, p.line.fromY, ctx.viewport) || !pointInside(p.line.toX, p.line.toY, ctx.viewport)) rejected |= 8;
  const ownerDistance = distance(p, owner.anchor) + EPS, selfOverlay = isSelfOverlay(owner.anchor, p);
  for (const node of ctx.nodes) {
    if (!(rejected & 16) && (node !== owner || !selfOverlay) && node.protectedRegions.some(r => overlap(p, r))) rejected |= 16;
    if (node !== owner) {
      if (!(rejected & 32) && !fartherThan(p, node.anchor, ownerDistance)) rejected |= 32;
      if (!(rejected & 64) && node.protectedRegions.some(r => lineHitsRect(p.line, r))) rejected |= 64;
    }
    if ((rejected & 112) === 112) break;
  }
  if (ctx.protectedDrawer) {
    if (overlap(p, ctx.protectedDrawer)) rejected |= 128;
    if (lineHitsRect(p.line, ctx.protectedDrawer)) rejected |= 256;
  }
  return rejected;
}

function unionArea(regions) {
  if (!regions.length) return 0;
  if (regions.length === 1) {
    const region = regions[0];
    return (right(region) - region.x) * (bottom(region) - region.y);
  }
  const xs = [...new Set(regions.flatMap(r => [r.x, right(r)]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const intervals = regions.filter(r => r.x < xs[i] && right(r) > xs[i - 1])
      .map(r => [r.y, bottom(r)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let end = -Infinity, covered = 0;
    for (const [lo, hi] of intervals) { covered += Math.max(0, hi - Math.max(lo, end)); end = Math.max(end, hi); }
    area += (xs[i] - xs[i - 1]) * covered;
  }
  return area;
}

function preference(ctx, p) {
  const key = idKey(p.id), owner = ctx.nodeMap.get(key), card = ctx.cards.get(key), old = ctx.previous.get(key);
  const area = owner.area, ownerCentre = owner.centre, cardCentre = centre(p);
  const gap = area.y - bottom(p), offset = Math.abs(ownerCentre.x - cardCentre.x);
  // Near the map top, putting a full card overhead consumes the title/month
  // area. Keep that position legal, but let centred/side positions compete.
  const nearTop = ownerCentre.y < ctx.viewport.y + ctx.viewport.h * 0.4;
  const above = !nearTop && gap >= NODE_GAP - EPS && gap <= ABOVE_MAX_GAP + EPS
    && Math.min(right(p), right(owner.anchor)) - Math.max(p.x, owner.anchor.x) > EPS
    && offset <= Math.max(owner.anchor.w / 2, p.w / 3) + EPS;
  const selfOverlay = isSelfOverlay(owner.anchor, p);
  const shop = ctx.shop;
  const shopOverlapArea = shop && overlap(p, shop)
    ? (Math.min(right(p), right(shop)) - Math.max(p.x, shop.x))
      * (Math.min(bottom(p), bottom(shop)) - Math.max(p.y, shop.y))
    : 0;
  const intersections = ctx.controls.flatMap(r => {
    const x = Math.max(p.x, r.x), y = Math.max(p.y, r.y);
    const w = Math.min(right(p), right(r)) - x, h = Math.min(bottom(p), bottom(r)) - y;
    return w > 0 && h > 0 ? [{ x, y, w, h }] : [];
  });
  const uiOverlapArea = unionArea(intersections), coverage = uiOverlapArea / (p.w * p.h);
  const uiCost = coverage * 40 + Math.max(0, coverage - UI_COVERAGE_BUDGET) * 160
    + (ctx.controls.some(r => lineHitsRect(p.line, r)) ? 6 : 0);
  const aboveCost = above ? Math.max(0, gap - NODE_GAP) * 2 + offset * 0.5 : 0;
  const selfOverlayCost = selfOverlay ? (offset + Math.abs(ownerCentre.y - cardCentre.y)) * 0.5 : 0;
  const length = lineLength(p.line);
  const widthChange = Math.abs(p.w - card.w), reflowCost = widthChange * REFLOW_COST_PER_PIXEL;
  // A taller, narrower card can dilute the same UI overlap across a larger
  // area. A small reflow cost prevents that fractional saving from needlessly
  // worsening wrapping, without outranking card count or above/self placement.
  const carouselCount = p.carousel ? 1 : 0;
  return { shopOverlapArea, carouselCount, carouselArea: carouselCount * p.w * p.h, detailFit: p.detailFit || 0,
    carouselControlOverlap: carouselCount && uiOverlapArea > EPS ? 1 : 0,
    aboveCount: above ? 1 : 0, aboveCost, selfOverlayCount: selfOverlay ? 1 : 0, selfOverlayCost, uiCost, uiOverlapArea,
    reflowCost, cost: aboveCost + selfOverlayCost + uiCost + reflowCost + (above || selfOverlay ? 0 : length), length,
    movement: old ? Math.hypot(p.x - old.x, p.y - old.y) : 0,
    resize: p.w === card.w && p.h === card.h ? 0 : 1, widthChange };
}

const emptyPreference = () => ({ shopOverlapArea: 0, carouselCount: 0, carouselArea: 0, carouselControlOverlap: 0, detailFit: 0,
  aboveCount: 0, aboveCost: 0, selfOverlayCount: 0, selfOverlayCost: 0, uiCost: 0, uiOverlapArea: 0,
  reflowCost: 0, cost: 0, length: 0, movement: 0, resize: 0, widthChange: 0 });
// Within equally complete layouts, clear the shop before preferring overhead cards.
const preferenceOrder = (a, b) => a.shopOverlapArea - b.shopOverlapArea
  || a.carouselControlOverlap - b.carouselControlOverlap || a.carouselCount - b.carouselCount
  || b.detailFit - a.detailFit || b.carouselArea - a.carouselArea
  || b.aboveCount - a.aboveCount || b.selfOverlayCount - a.selfOverlayCount || a.cost - b.cost
  || a.length - b.length || a.movement - b.movement || a.resize - b.resize || a.widthChange - b.widthChange;
const addPreference = (a, b) => ({ shopOverlapArea: a.shopOverlapArea + b.shopOverlapArea,
  carouselCount: a.carouselCount + b.carouselCount, carouselArea: a.carouselArea + b.carouselArea,
  carouselControlOverlap: a.carouselControlOverlap + b.carouselControlOverlap, detailFit: a.detailFit + b.detailFit,
  aboveCount: a.aboveCount + b.aboveCount, aboveCost: a.aboveCost + b.aboveCost,
  selfOverlayCount: a.selfOverlayCount + b.selfOverlayCount, selfOverlayCost: a.selfOverlayCost + b.selfOverlayCost,
  uiCost: a.uiCost + b.uiCost, uiOverlapArea: a.uiOverlapArea + b.uiOverlapArea, reflowCost: a.reflowCost + b.reflowCost,
  cost: a.cost + b.cost, length: a.length + b.length, movement: a.movement + b.movement,
  resize: a.resize + b.resize, widthChange: a.widthChange + b.widthChange });
const candidateOrder = (a, b) => preferenceOrder(a, b) || a.p.y - b.p.y || a.p.x - b.p.x
  || a.p.w - b.p.w || a.p.h - b.p.h;
const category = candidate => candidate.aboveCount ? 'above' : candidate.selfOverlayCount ? 'self' : 'other';

function* makeSizeCandidates(ctx, card, key) {
  const owner = ctx.nodeMap.get(key);
  const area = owner.area;
  const c = owner.centre;
  const old = ctx.previous.get(key);
  const xs = new Set([c.x - card.w / 2, area.x, right(area) - card.w, ctx.safe.x, right(ctx.safe) - card.w]);
  const ys = new Set([c.y - card.h / 2, area.y, bottom(area) - card.h, ctx.safe.y, bottom(ctx.safe) - card.h]);
  const top = area.y - PREFERRED_GAP - card.h;
  const low = bottom(area) + PREFERRED_GAP;
  const left = area.x - PREFERRED_GAP - card.w;
  const east = right(area) + PREFERRED_GAP;
  xs.add(left).add(east);
  ys.add(top).add(low);
  for (const r of ctx.candidateObstacles) {
    xs.add(r.x - NODE_GAP - card.w).add(right(r) + NODE_GAP);
    ys.add(r.y - NODE_GAP - card.h).add(bottom(r) + NODE_GAP);
  }
  // A whole card must fit the visible canvas, and its connector cannot exceed
  // its width. Remove impossible axis coordinates before spending the budget.
  const axis = (values, minimum, maximum, target) => {
    if (minimum > maximum) return { edges: [], middles: [] };
    const ordered = [...new Set([...values, minimum, maximum])]
      .filter(value => finite(value) && value >= minimum - EPS && value <= maximum + EPS)
      .sort((a, b) => a - b);
    return {
      edges: [...ordered].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 32),
      // Interior positions matter: at both edges of a free corridor a card can
      // tie a neighbouring city, while its centre is clearly owned by this one.
      middles: ordered.slice(1).map((value, index) => (value + ordered[index]) / 2),
    };
  };
  const xMin = Math.max(ctx.safe.x, owner.anchor.x - card.w * 2);
  const xMax = Math.min(right(ctx.safe) - card.w, right(owner.anchor) + card.w);
  const yMin = Math.max(ctx.safe.y, owner.anchor.y - card.h - card.w);
  const yMax = Math.min(bottom(ctx.safe) - card.h, bottom(owner.anchor) + card.w);
  const xAxis = axis(xs, xMin, xMax, c.x - card.w / 2);
  const yAxis = axis(ys, yMin, yMax, c.y - card.h / 2);
  const local = (values, minimum, maximum) => [...new Set(values)]
    .filter(value => finite(value) && value >= minimum - EPS && value <= maximum + EPS);
  const directX = local([c.x - card.w / 2, area.x, right(area) - card.w, left, east,
    area.x - NODE_GAP - card.w, right(area) + NODE_GAP,
    c.x - card.w / 2 - owner.anchor.w / 4, c.x - card.w / 2 + owner.anchor.w / 4], xMin, xMax);
  const directY = local([c.y - card.h / 2, area.y, bottom(area) - card.h, top, low,
    area.y - NODE_GAP - card.h, bottom(area) + NODE_GAP,
    c.y - card.h / 2 - owner.anchor.h / 4, c.y - card.h / 2 + owner.anchor.h / 4], yMin, yMax);
  // A row of cards can need a modest horizontal shift that no city edge
  // describes. Sample separation from other cards' centred measured sizes;
  // cap this extra work before evaluating the unchanged hard constraints.
  const peerXs = local([...ctx.cards.keys()].filter(otherKey => otherKey !== key).flatMap(otherKey => {
    const middle = ctx.nodeMap.get(otherKey).centre.x;
    return ctx.cardSizes.get(otherKey).flatMap(size => [
      middle - size.w / 2 - CARD_GAP - card.w, middle + size.w / 2 + CARD_GAP,
    ]);
  }), xMin, xMax).sort((a, b) => Math.abs(a - (c.x - card.w / 2)) - Math.abs(b - (c.x - card.w / 2)) || a - b).slice(0, 24);
  const seen = new Set();
  const candidates = [];
  let inspected = 0;
  const rejectedReasons = {};
  const add = (x, y) => {
    if (!finite(x) || !finite(y)) return;
    const signature = `${x.toFixed(6)},${y.toFixed(6)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    inspected++;
    const p = { id: card.id, x, y, w: card.w, h: card.h };
    if (card.carousel) { p.carousel = true; p.detailFit = card.detailFit; }
    p.line = connector(owner.anchor, p);
    const rejected = candidateRejections(ctx, p, owner);
    if (rejected) {
      for (let index = 0; index < CANDIDATE_REASONS.length; index++) if (rejected & (1 << index)) {
        const reason = CANDIDATE_REASONS[index]; rejectedReasons[reason] = (rejectedReasons[reason] || 0) + 1;
      }
      return;
    }
    if (ctx.occupied.some(other => pairConflicts(p, other))) {
      rejectedReasons['occupied-placement'] = (rejectedReasons['occupied-placement'] || 0) + 1;
      return;
    }
    const pc = centre(p);
    const sector = Math.floor((Math.atan2(pc.y - c.y, pc.x - c.x) + Math.PI * 2 + Math.PI / 8) / (Math.PI / 4)) % 8;
    candidates.push({ p, sector, ...preference(ctx, p) });
  };
  // Keep the previous complete point without inserting either axis into the
  // candidate grid: repeated updates must not recursively subdivide corridors
  // or donate an old width's coordinates to another width.
  if (old && old.w === card.w && old.h === card.h) add(old.x, old.y);
  let work = 0;
  function* grid(xs, ys) {
    for (const x of xs) for (const y of ys) { add(x, y); if (++work % 32 === 0) yield; }
  }
  yield* grid(directX, directY);
  yield* grid(peerXs, directY);
  // Test every surviving interval midpoint on the owner's natural side bands.
  // These linear scans run before the 32×32 edge grid, so the edge cap cannot
  // silently discard the corridor interior. They do not expand the search area
  // or relax any placement/ownership/connector constraint.
  yield* grid(xAxis.middles, directY);
  yield* grid(directX, yAxis.middles);
  yield* grid(xAxis.edges, yAxis.edges);
  yield;
  candidates.sort(candidateOrder);
  const sectors = new Set();
  const kept = [];
  const categories = new Set();
  for (const candidate of candidates) {
    if (!categories.has(category(candidate))) { categories.add(category(candidate)); kept.push(candidate); }
  }
  for (const candidate of candidates) {
    if (!sectors.has(candidate.sector)) { sectors.add(candidate.sector); if (!kept.includes(candidate)) kept.push(candidate); }
  }
  for (const candidate of candidates) {
    if (kept.length >= MAX_CANDIDATES) break;
    if (!kept.includes(candidate)) kept.push(candidate);
  }
  kept.sort(candidateOrder);
  return { candidates: kept, inspected, validCount: candidates.length, rejectedReasons };
}

function* makeCandidates(ctx, card, key) {
  // The renderer supplies measured full cards and bounded carousel sizes.
  const sizes = ctx.cardSizes.get(key).slice().sort((a, b) => a.w - b.w || a.h - b.h);
  const candidates = [], sizeCounts = [], rejectedReasons = {};
  let inspected = 0, validCount = 0;
  for (const size of sizes) {
    const result = yield* makeSizeCandidates(ctx, { id: card.id, ...size }, key);
    inspected += result.inspected; validCount += result.validCount;
    for (const [reason, count] of Object.entries(result.rejectedReasons))
      rejectedReasons[reason] = (rejectedReasons[reason] || 0) + count;
    sizeCounts.push({ ...size, inspected: result.inspected, legal: result.validCount });
    for (const candidate of result.candidates) candidates.push({ ...candidate,
      resize: size.w === card.w && size.h === card.h ? 0 : 1,
      widthChange: Math.abs(size.w - card.w) });
  }
  candidates.sort(candidateOrder);
  const covered = new Set(), kept = [];
  for (const candidate of candidates) {
    const signature = `${candidate.p.w},${candidate.p.h},${category(candidate)}`;
    if (!covered.has(signature)) { covered.add(signature); kept.push(candidate); }
  }
  covered.clear();
  for (const candidate of candidates) {
    const signature = `${candidate.p.w},${candidate.p.h},${candidate.sector}`;
    if (!covered.has(signature)) { covered.add(signature); if (!kept.includes(candidate)) kept.push(candidate); }
  }
  // Preserve each size/category and size/direction before the usual budget.
  // Seven measured sizes need at most 77 representatives (3 categories + 8
  // directions), so self overlays cannot evict a lone above-card candidate.
  const limit = Math.max(MAX_CANDIDATES, kept.length);
  for (const candidate of candidates) {
    if (kept.length >= limit) break;
    if (!kept.includes(candidate)) kept.push(candidate);
  }
  kept.sort(candidateOrder);
  for (const size of sizeCounts)
    size.retained = kept.filter(candidate => candidate.p.w === size.w && candidate.p.h === size.h).length;
  return { candidates: kept, inspected, validCount, rejectedReasons, sizeCounts };
}

const stateOrder = (a, b) => b.placements.length - a.placements.length
  || preferenceOrder(a, b) || compareKey(a.signature, b.signature);

/** Negative means a is preferred. The renderer uses the same whole-layout rule. */
export function comparePlacementResults(a, b) {
  const signature = result => result.placements.slice().sort((p, q) => compareKey(idKey(p.id), idKey(q.id)))
    .map(p => `${idKey(p.id)}:${p.x},${p.y},${p.w},${p.h}`).join('|');
  return b.placements.length - a.placements.length
    || preferenceOrder(a.diagnostics.preference, b.diagnostics.preference)
    || compareKey(signature(a), signature(b));
}

/**
 * Bounded, deterministic search over legal whole-card candidates. Overflow is
 * an honest search result, not a claim that no mathematical arrangement exists.
 */
function* placementSteps(snapshot) {
  const ctx = prepare(snapshot);
  const diagnostics = { errors: ctx.errors, candidateCounts: [], expansions: 0,
    searchTruncated: false, verified: false, preference: emptyPreference(), shopOverlapIds: [], preferredAboveIds: [], selfOverlayIds: [] };
  if (ctx.errors.length) return { placements: [],
    overflow: ctx.rawCards.map(c => ({ id: c?.id, reason: 'invalid-snapshot' })), diagnostics };
  const entries = [];
  for (const [key, card] of [...ctx.cards.entries()].sort(([a], [b]) => compareKey(a, b))) {
    const result = yield* makeCandidates(ctx, card, key);
    diagnostics.candidateCounts.push({ id: card.id, inspected: result.inspected,
      legal: result.validCount, retained: result.candidates.length, rejectedReasons: result.rejectedReasons,
      sizes: result.sizeCounts });
    if (result.validCount > result.candidates.length) diagnostics.searchTruncated = true;
    entries.push({ key, card, candidates: result.candidates });
  }
  entries.sort((a, b) => a.candidates.length - b.candidates.length
    || b.card.w * b.card.h - a.card.w * a.card.h || compareKey(a.key, b.key));
  let states = [{ placements: [], ...emptyPreference(), signature: '' }];
  for (const [entryIndex, entry] of entries.entries()) {
    // Reserve work for later cards: exhausting the global budget on the first
    // few entries must not make every remaining card an automatic overflow.
    const stageLimit = diagnostics.expansions + Math.floor(
      (MAX_EXPANSIONS - diagnostics.expansions) / (entries.length - entryIndex),
    );
    const next = [];
    const retainBest = () => {
      next.sort(stateOrder);
      if (next.length <= BEAM_WIDTH) return;
      diagnostics.searchTruncated = true;
      next.length = BEAM_WIDTH;
    };
    for (const state of states) {
      next.push({ ...state, signature: `${state.signature}|${entry.key}:~` });
      for (const candidate of entry.candidates) {
        if (diagnostics.expansions >= stageLimit) { diagnostics.searchTruncated = true; break; }
        diagnostics.expansions++;
        if (diagnostics.expansions % 64 === 0) yield;
        if (state.placements.some(other => pairConflicts(candidate.p, other))) continue;
        next.push({ placements: [...state.placements, candidate.p], ...addPreference(state, candidate),
          signature: `${state.signature}|${entry.key}:${candidate.p.x},${candidate.p.y},${candidate.p.w},${candidate.p.h}` });
      }
      // The search order stays the same. Keep each sort short so a whole
      // stage's discarded states never accumulate in a single frame.
      if (next.length >= BEAM_WIDTH * 4) { retainBest(); yield; }
    }
    yield;
    retainBest();
    states = next;
  }
  const chosen = (states[0]?.placements || []).sort((a, b) => compareKey(idKey(a.id), idKey(b.id)));
  const placements = [];
  const failed = new Set();
  // Do not trust search bookkeeping. Recheck the completed assignment through
  // the public validator, with every other final card and connector present.
  for (const p of chosen) {
    yield;
    const verification = check(ctx, p, chosen.filter(other => other !== p));
    if (verification.valid) placements.push(p);
    else { failed.add(idKey(p.id)); diagnostics.errors.push(...verification.reasons); }
  }
  const placed = new Set(placements.map(p => idKey(p.id)));
  for (const p of placements) {
    const score = preference(ctx, p);
    diagnostics.preference = addPreference(diagnostics.preference, score);
    if (score.shopOverlapArea) diagnostics.shopOverlapIds.push(p.id);
    if (score.aboveCount) diagnostics.preferredAboveIds.push(p.id);
    if (score.selfOverlayCount) diagnostics.selfOverlayIds.push(p.id);
  }
  const overflow = entries.filter(e => !placed.has(e.key)).sort((a, b) => compareKey(a.key, b.key))
    .map(e => ({ id: e.card.id, reason: failed.has(e.key) ? 'final-verification-failed'
      : e.candidates.length ? 'no-compatible-placement' : 'no-legal-candidate' }));
  diagnostics.verified = diagnostics.errors.length === 0;
  return { placements, overflow, diagnostics };
}

/** The synchronous API drains exactly the same search as the incremental API. */
export function placeCards(snapshot) {
  const steps = placementSteps(snapshot); let progress;
  do { progress = steps.next(); } while (!progress.done);
  return progress.value;
}

function copySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const copy = value => value && typeof value === 'object' ? rect(value) : value;
  const size = value => value && typeof value === 'object' ? cardSize(value) : value;
  const array = (value, mapper) => Array.isArray(value) ? value.map(mapper) : value;
  return { viewport: copy(snapshot.viewport), controls: array(snapshot.controls, copy), shop: copy(snapshot.shop),
    previous: array(snapshot.previous, value => value && typeof value === 'object' ? { id: value.id, ...rect(value) } : value),
    occupied: array(snapshot.occupied, value => value && typeof value === 'object' ? { ...rect(value), line: value.line && { ...value.line } } : value),
    drawer: copy(snapshot.drawer),
    cards: array(snapshot.cards, card => card && typeof card === 'object'
      ? { id: card.id, ...cardSize(card), alternatives: array(card.alternatives, size) } : card),
    nodes: array(snapshot.nodes, node => node && typeof node === 'object'
      ? { id: node.id, anchor: copy(node.anchor), regions: array(node.regions, copy) } : node) };
}

/**
 * Pure cooperative task: the caller owns scheduling and scene-version checks.
 * step(4) runs small work units until its millisecond budget is reached, then
 * returns { done:false, cancelled:false, result:null }. A completed result is
 * published only after final independent validation. No timers are created.
 */
export function createPlacementTask(snapshot) {
  let iterator = placementSteps(copySnapshot(snapshot)), done = false, cancelled = false, result = null;
  snapshot = null;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  return {
    step(budgetMs = 4) {
      if (!done) {
        const budget = finite(budgetMs) && budgetMs >= 0 ? budgetMs : 4, start = now();
        try {
          do {
            const progress = iterator.next();
            if (progress.done) { result = progress.value; done = true; iterator = null; break; }
          } while (now() - start < budget);
        } catch (error) { iterator?.return(); iterator = null; done = true; throw error; }
      }
      return { done, cancelled, result };
    },
    cancel() {
      iterator?.return(); iterator = null; result = null; done = cancelled = true;
    },
  };
}

/** Find an in-canvas drawer rectangle. Map nodes deliberately do not obstruct a drawer. */
export function findDrawerRect(viewport, controls = [], { width = 280, collapsed = false } = {}) {
  if (!validRect(viewport) || !Array.isArray(controls) || controls.some(r => !validRect(r))
    || !finite(width) || width <= 0) return null;
  const safe = inflate(viewport, -MARGIN);
  const minimumHeight = collapsed ? 34 : 58;
  if (!validRect(safe) || safe.w < 96 || safe.h < minimumHeight) return null;
  const wantedWidth = Math.min(width, safe.w);
  if (wantedWidth < 96) return null;
  const obstacles = controls.map(r => inflate(r, NODE_GAP)).filter(r => overlap(r, safe));
  const edges = [...new Set([safe.x, right(safe), ...obstacles.flatMap(r => [
    Math.max(safe.x, Math.min(right(safe), r.x)), Math.max(safe.x, Math.min(right(safe), right(r))),
  ])])].sort((a, b) => a - b);
  const candidates = [];
  for (let i = 0; i < edges.length - 1; i++) for (let j = i + 1; j < edges.length; j++) {
    const w = Math.min(wantedWidth, edges[j] - edges[i]);
    if (w < 96) continue;
    const x = edges[j] - w;
    const blocks = obstacles.filter(r => x < right(r) - EPS && x + w > r.x + EPS)
      .map(r => [Math.max(safe.y, r.y), Math.min(bottom(safe), bottom(r))])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let y = safe.y;
    const add = end => {
      if (end - y < minimumHeight - EPS) return;
      candidates.push({ x, y, w, h: collapsed ? 34 : end - y });
    };
    for (const [start, end] of blocks) { add(start); y = Math.max(y, end); }
    add(bottom(safe));
  }
  // A wider sliver is not a useful details view. Prefer room for several text
  // lines, then readable one-line scrolling, before width and right docking.
  const readability = r => collapsed ? 0 : r.h >= 96 - EPS ? 1 : 0;
  candidates.sort((a, b) => readability(b) - readability(a)
    || b.w - a.w || right(b) - right(a) || b.h - a.h || a.y - b.y);
  return candidates[0] || null;
}
