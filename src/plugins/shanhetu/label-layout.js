// Whole-map placement, based on the old cheat sheet's obstacle-edge candidates
// and comparison of complete layouts. Safety is a filter, never a score that
// can lose to proximity. Complete nearby layouts are tried before any distance
// expansion; balance cannot discard a card or send it across the map.
const GAP = 8;
export const PREFERRED_LABEL_DISTANCE = 160;
export const overlaps = (a, b, gap = GAP) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
export const inside = (p, r) => p.x >= r.x && p.y >= r.y && p.x + p.w <= r.x + r.w && p.y + p.h <= r.y + r.h;
export const labelDistance = (a, b) => Math.hypot(Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w), Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));
const validRect = r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const compareId = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;

export function labelConnection(anchor, card) {
  const start = centre(anchor);
  return { start, end: { x: Math.max(card.x, Math.min(start.x, card.x + card.w)), y: Math.max(card.y, Math.min(start.y, card.y + card.h)) } };
}
function crossesLine(a, b, rect) {
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, rect.x, rect.x + rect.w], [a.y, b.y - a.y, rect.y, rect.y + rect.h]]) {
    if (Math.abs(delta) < .001) { if (start <= min || start >= max) return false; continue; }
    const t1 = (min - start) / delta, t2 = (max - start) / delta;
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
    if (lo >= hi) return false;
  }
  return hi > 0 && lo < 1;
}
export function connectionCrossings(anchor, card, obstacles) {
  const { start, end } = labelConnection(anchor, card);
  return obstacles.filter(o => !overlaps(o, anchor, 0) && crossesLine(start, end, o)).length;
}

function candidates(card, viewport, hard, decoration, placed = [], radius = PREFERRED_LABEL_DISTANCE, dense = false) {
  const points = [], a = card.anchor, ac = centre(a);
  const occupied = [...hard, ...placed];
  card.variants.forEach(({ w, h }, variant) => {
    if (!(w > 0 && h > 0 && w <= viewport.w && h <= viewport.h)) return;
    const maxX = viewport.x + viewport.w - w, maxY = viewport.y + viewport.h - h;
    const xs = new Set([viewport.x, maxX, ac.x - w / 2, a.x - w - GAP, a.x + a.w + GAP]);
    const ys = new Set([viewport.y, maxY, ac.y - h / 2, a.y - h - GAP, a.y + a.h + GAP]);
    // Exact obstacle edges preserve narrow slots; evenly spaced samples expose
    // open space on every side instead of filling a left/top enumeration first.
    for (const o of [...occupied, ...decoration]) {
      xs.add(o.x - w - GAP); xs.add(o.x + o.w + GAP);
      ys.add(o.y - h - GAP); ys.add(o.y + o.h + GAP);
    }
    for (let i = 0; i <= 16; i++) xs.add(viewport.x + (maxX - viewport.x) * i / 16);
    for (let i = 0; i <= 12; i++) ys.add(viewport.y + (maxY - viewport.y) * i / 12);
    const axis = (values, min, max) => [...values].filter(n => Number.isFinite(n) && n >= min && n <= max).sort((x, y) => x - y);
    for (const x of axis(xs, viewport.x, maxX)) for (const y of axis(ys, viewport.y, maxY)) {
      const p = { x, y, w, h, variant };
      const distance = labelDistance(p, a);
      if (!inside(p, viewport) || distance > radius || occupied.some(o => overlaps(p, o))) continue;
      p.distance = distance;
      const edge = Math.min(x - viewport.x, y - viewport.y, maxX - x, maxY - y);
      const line = labelConnection(a, p), leader = Math.hypot(line.start.x - line.end.x, line.start.y - line.end.y);
      p.cost = distance * 2 + distance * distance / 80 + leader * .15 + connectionCrossings(a, p, hard) * 90
        + decoration.reduce((sum, o) => sum + area(p, o), 0) * .02
        + Math.max(0, 18 - edge) * .8 + variant * 8;
      points.push(p);
    }
  });
  points.sort((a, b) => a.cost - b.cost || a.variant - b.variant || a.y - b.y || a.x - b.x);
  if (dense) return points;
  const cells = new Map(), selected = [];
  for (const p of points) {
    const c = centre(p), key = `${p.variant}:${Math.min(5, Math.floor((c.x - viewport.x) / viewport.w * 6))}:${Math.min(3, Math.floor((c.y - viewport.y) / viewport.h * 4))}`;
    const bucket = cells.get(key) || [];
    if (bucket.length >= 3 || bucket.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 20)) continue;
    bucket.push(p); cells.set(key, bucket); selected.push(p);
  }
  return selected;
}

function distribution(viewport, hard, rows) {
  const regions = [0, 1, 2, 3].map(i => ({ x: viewport.x + (i % 2) * viewport.w / 2,
    y: viewport.y + Math.floor(i / 2) * viewport.h / 2, w: viewport.w / 2, h: viewport.h / 2 }));
  const capacity = [0, 0, 0, 0], sites = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
    const p = { x: viewport.x + (x + .5) * viewport.w / 8, y: viewport.y + (y + .5) * viewport.h / 6, w: .01, h: .01 };
    // Only nearby usable card regions count as space to distribute into. The
    // opposite end of a large chapter is irrelevant when all nodes are here.
    if (!hard.some(o => overlaps(p, o)) && rows.some(row => row.options.some(option => labelDistance(p, option) <= 48))) {
      capacity[(x >= 4 ? 1 : 0) + (y >= 3 ? 2 : 0)]++; sites.push(p);
    }
  }
  const total = capacity.reduce((a, b) => a + b, 0);
  return { regions, sites, viewport, target: capacity.map(n => total ? n / total : .25) };
}

function score(items, field) {
  if (!items.length) return 0;
  let total = 0, cost = 0, farthest = 0;
  const mass = [0, 0, 0, 0];
  for (let i = 0; i < items.length; i++) {
    const { card, pos } = items[i];
    farthest = Math.max(farthest, labelDistance(card.anchor, pos));
    total += pos.w * pos.h; cost += pos.cost;
    field.regions.forEach((r, k) => { mass[k] += area(pos, r); });
    const line = labelConnection(card.anchor, pos);
    for (let j = 0; j < i; j++) {
      const other = items[j], otherLine = labelConnection(other.card.anchor, other.pos);
      cost += Math.max(0, 64 - labelDistance(pos, other.pos)) * .4;
      if (crossesLine(line.start, line.end, other.pos)) cost += 140;
      if (crossesLine(otherLine.start, otherLine.end, pos)) cost += 140;
    }
  }
  const delta = mass.map((m, i) => m / total - field.target[i]);
  // Half/quadrant counts alone can be gamed by lining cards along the middle.
  // Penalize broad empty patches too, using visible free-space sample points.
  let emptySpace = 0;
  for (const site of field.sites) {
    let nearest = Infinity;
    for (const { pos } of items) {
      const dx = Math.max(0, pos.x - site.x, site.x - pos.x - pos.w) / field.viewport.w;
      const dy = Math.max(0, pos.y - site.y, site.y - pos.y - pos.h) / field.viewport.h;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    emptySpace += nearest;
  }
  // Compare the entire visible layout. Capacity weighting allows a genuinely
  // blocked half to stay empty, without forcing every card toward the centre.
  const horizontal = delta[0] + delta[2], vertical = delta[0] + delta[1];
  // Penalize the worst separation separately: averaging costs alone can
  // sacrifice one node to make the other cards appear more evenly spread.
  return cost / items.length + farthest * 1.25 + 140 * (horizontal ** 2 + vertical ** 2)
    + 50 * delta.reduce((sum, n) => sum + n * n, 0)
    + 180 * emptySpace / Math.max(1, field.sites.length);
}
const position = p => ({ x: p.x, y: p.y, w: p.w, h: p.h, variant: p.variant });
const toPlan = items => new Map([...items].sort((a, b) => compareId(a.card, b.card)).map(({ card, pos }) => [card.id, position(pos)]));

// Feasibility search is separate from visual scoring. A less attractive prefix
// can be the only way to fit every card, so beam pruning is not evidence of an
// impossible layout. Forward checking starts with the most constrained card.
function completeSearch(rows, radius = Infinity) {
  let work = 0;
  function visit(remaining, items) {
    if (!remaining.length) return items;
    if (remaining.some(row => !row.options.length) || work > 3000000) return null;
    const ordered = [...remaining].sort((a, b) => a.options.length - b.options.length || compareId(a.card, b.card));
    const [next, ...rest] = ordered;
    for (const pos of next.options) {
      const available = [];
      for (const row of rest) {
        const options = [];
        for (const other of row.options) {
          if (++work > 3000000) return null;
          if (!overlaps(pos, other)) options.push(other);
        }
        if (!options.length) break;
        available.push({ card: row.card, options });
      }
      if (available.length !== rest.length) continue;
      const found = visit(available, [...items, { card: next.card, pos }]);
      if (found) return found;
    }
    return null;
  }
  return visit(rows.map(row => ({ card: row.card, options: row.options.filter(p => p.distance <= radius) })), []);
}

function closestComplete(rows) {
  let best = completeSearch(rows);
  if (!best) return null;
  let radius = Math.max(0, ...best.map(item => item.pos.distance));
  const thresholds = [...new Set(rows.flatMap(row => row.options.map(p => p.distance).filter(d => d <= radius)))].sort((a, b) => a - b);
  let lo = 0, hi = thresholds.length - 1;
  // Search actual candidate distances, not arbitrary larger radius constants.
  // If the bounded search runs out, retain the complete witnessed plan.
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2), found = completeSearch(rows, thresholds[mid]);
    if (found) { best = found; hi = mid; } else lo = mid + 1;
  }
  return best;
}

export function reflowLabelPositions(cards, viewport, controls, buildings, previous = new Map(), protectedBuildings = buildings, retainDistant = false) {
  if (!validRect(viewport)) return new Map();
  const ordered = [...cards].filter(c => validRect(c.anchor)).sort(compareId);
  const hard = [...controls, ...protectedBuildings].filter(validRect), decoration = buildings.filter(validRect);
  const cached = [];
  for (const card of ordered) {
    const old = previous.get(card.id), variant = old?.variant ?? (old?.compact ? 1 : 0), size = card.variants[variant];
    if (!old || !size) break;
    const pos = { x: old.x, y: old.y, w: size.w, h: size.h, variant };
    if (!validRect(pos) || !inside(pos, viewport) || !retainDistant && labelDistance(pos, card.anchor) > PREFERRED_LABEL_DISTANCE
      || [...hard, ...cached.map(x => x.pos)].some(o => overlaps(pos, o))) break;
    cached.push({ card, pos });
  }
  if (cached.length === ordered.length) return toPlan(cached);
  const allBuildings = [...new Map([...hard, ...decoration].map(r => [[r.x, r.y, r.w, r.h].join(':'), r])).values()];
  let rows, field, complete = null, selectedHard = hard;
  // Preserve even inactive artwork when a complete nearby arrangement exists.
  // Only verified inactive scenery may relax; active cities, their heads and
  // controls remain hard in every pass. Distance expands only after both the
  // compact and uncompressed nearby candidate sets have been searched.
  const passes = [
    { obstacles: allBuildings, radius: PREFERRED_LABEL_DISTANCE },
    { obstacles: hard, radius: PREFERRED_LABEL_DISTANCE },
    { obstacles: hard, radius: Infinity },
  ];
  const tried = new Set();
  for (const pass of passes) {
    const key = JSON.stringify([pass.obstacles, pass.radius]);
    if (tried.has(key)) continue;
    tried.add(key);
    for (const dense of [false, true]) {
      rows = ordered.map(card => ({ card, options: candidates(card, viewport, pass.obstacles, decoration, [], pass.radius, dense) }));
      complete = closestComplete(rows);
      if (complete) { selectedHard = pass.obstacles; break; }
    }
    if (complete) break;
  }
  field = distribution(viewport, selectedHard, rows);
  if (complete) {
    // Keep the witnessed complete plan while improving equivalent nearby slots.
    // Aesthetics must not increase the worst link or remove any card.
    const radius = Math.max(...complete.map(item => item.pos.distance));
    let best = { items: complete, score: score(complete, field) };
    for (let pass = 0; pass < 2; pass++) for (const card of ordered) {
      const rest = best.items.filter(item => item.card.id !== card.id);
      for (const pos of candidates(card, viewport, selectedHard, decoration, rest.map(item => item.pos), radius)) {
        const items = [...rest, { card, pos }], value = score(items, field);
        if (value < best.score - .01) best = { items, score: value };
      }
    }
    return toPlan(best.items);
  }
  // No complete witness was found. Only now choose a safe partial layout;
  // none of the hard geometry is removed to inflate the displayed count.
  rows = ordered.map(card => ({ card, options: candidates(card, viewport, hard, decoration, [], Infinity) }));
  field = distribution(viewport, hard, rows);
  rows.sort((a, b) => a.options.length - b.options.length || b.card.variants[0].h - a.card.variants[0].h || compareId(a.card, b.card));
  let beam = [{ items: [], score: 0 }];
  for (const row of rows) {
    const groups = new Map();
    const offer = state => {
      const count = state.items.length, group = groups.get(count) || [];
      // Retain alternatives at every cardinality: one oversized earlier card
      // must not prevent several later cards from fitting in the same space.
      if (group.length === 20 && state.score >= group[group.length - 1].score) return;
      group.push(state); group.sort((a, b) => a.score - b.score);
      if (group.length > 20) group.pop(); groups.set(count, group);
    };
    for (const state of beam) {
      offer(state);
      for (const pos of row.options) {
        if (state.items.some(item => overlaps(pos, item.pos))) continue;
        const items = [...state.items, { card: row.card, pos }];
        offer({ items, score: score(items, field) });
      }
    }
    beam = [...groups].sort(([a], [b]) => b - a).flatMap(([, states]) => states).slice(0, 120);
  }
  beam.sort((a, b) => b.items.length - a.items.length || a.score - b.score);
  let best = beam[0] || { items: [], score: 0 };
  // Like the old whole-layout refinement, revisit placements after all cards
  // are known. Include edges of the placed cards to recover exact packing gaps.
  for (let pass = 0; pass < 2; pass++) for (const row of rows) {
    const rest = best.items.filter(item => item.card.id !== row.card.id);
    const options = candidates(row.card, viewport, hard, decoration, rest.map(item => item.pos), Infinity);
    for (const pos of options) {
      const items = [...rest, { card: row.card, pos }], value = score(items, field);
      if (items.length > best.items.length || (items.length === best.items.length && value < best.score - .01)) best = { items, score: value };
    }
  }
  return toPlan(best.items);
}

// Single-card caller uses exactly the same safety and whole-viewport search.
export function chooseLabelPosition(anchor, w, h, obstacles, viewport, previous, decoration = []) {
  const plan = reflowLabelPositions([{ id: 0, anchor, variants: [{ w, h }] }], viewport, obstacles, decoration,
    previous ? new Map([[0, previous]]) : new Map(), []);
  const p = plan.get(0);
  if (!p) return null;
  const { variant, ...rect } = p; return rect;
}
