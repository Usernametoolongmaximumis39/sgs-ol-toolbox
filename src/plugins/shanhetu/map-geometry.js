import { stableControlBounds } from './stable-control-bounds.js';
import { visibleMapViewport } from './map-viewport.js';
import { mapControlRegions } from './control-regions.js';

const read = fn => { try { return fn(); } catch { return null; } };
const visible = part => part && !part.destroyed && part.visible !== false
  && part._visible !== false && part.renderVisible !== false && part.alpha !== 0;
const valid = r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
const MAX_CITIES = 256;

// Project only the client's known map components. Animated selection rings,
// speech bubbles and effects never determine a building's fixed footprint.
export function collectMapGeometry(ctx, scene, nodes = []) {
  const cityView = read(() => scene.cityView), L = ctx.window.Laya;
  const empty = { anchors: [], buildings: [], protectedBuildings: [], controls: [], viewport: null };
  if (!visible(cityView) || !L?.Point) return empty;
  const project = (part, r) => read(() => {
    if (!r || !(r.width > 0 && r.height > 0)) return null;
    const points = [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]
      .map(([x, y]) => cityView.globalToLocal(part.localToGlobal(new L.Point(x, y), true), true));
    if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  const bounds = (part, includeHidden = false, stable = false) => read(() => {
    if (!part || part.destroyed || !includeHidden && !visible(part)) return null;
    if (typeof part.localToGlobal === 'function') {
      return project(part, stable ? stableControlBounds(part) : part.getSelfBounds?.() || { x: 0, y: 0, width: part.width, height: part.height });
    }
    // p$t/fO graphics commands have no display-list transform of their own.
    // Their render geometry is expressed in their owning Sprite's space.
    const width = part.renderWidth ?? part.width, height = part.renderHeight ?? part.height;
    return project(part.render, {
      x: (part.renderX ?? part.x ?? 0) - (Number(part.AnchorsX) || 0) * width,
      y: (part.renderY ?? part.y ?? 0) - (Number(part.AnchorsY) || 0) * height,
      width, height,
    });
  });
  const artwork = city => {
    const image = city.cityImg;
    if (!image) return project(city, { x: 0, y: 0, width: city.width, height: city.height });
    if (!visible(image)) return null;
    // Fixed local dimensions exclude child animations even when the artwork
    // happens to be a Sprite in an older client or the Laya rehearsal.
    if (typeof image.localToGlobal === 'function') return project(image, { x: 0, y: 0, width: image.width, height: image.height });
    return bounds(image);
  };
  const viewport = read(() => visibleMapViewport(ctx.window, cityView, scene));
  if (!viewport) return empty;
  const cities = new Set();
  let overflow = false;
  const addCity = city => {
    if (!city || typeof city !== 'object' || cities.has(city)) return;
    if (cities.size >= MAX_CITIES) { overflow = true; return; }
    cities.add(city);
  };
  // Native SNt calls (key, value), unlike the standard Map (value, key).
  const dictionary = read(() => cityView.cityItemDic);
  if (dictionary?.forEach && !read(() => {
    dictionary.forEach((first, second) => addCity(second && typeof second === 'object' ? second : first));
    return true;
  })) return empty;
  const children = read(() => cityView._children) || [];
  for (const child of children) if (child?.name === 'RogueCityItemUI') addCity(child);
  const nodeCities = new Map();
  for (const node of nodes) {
    const city = read(() => cityView.GetCityItemById?.(node.id));
    if (city) { addCity(city); nodeCities.set(node, city); }
  }
  // A partially collected obstacle set cannot promise node avoidance.
  if (overflow) return empty;
  const shapes = new Map(), buildings = [], protectedBuildings = [];
  const seen = new Set(), protectedSeen = new Set();
  const protect = (r, hard = true) => {
    if (!valid(r)) return;
    const key = [r.x, r.y, r.w, r.h].join(':');
    if (!seen.has(key)) { seen.add(key); buildings.push(r); }
    if (hard && !protectedSeen.has(key)) { protectedSeen.add(key); protectedBuildings.push(r); }
  };
  const pointer = read(() => cityView.playerPoint);
  // Measure the real marker once, including its scale/pivot and fixed children.
  // Translate this footprint to ALL reachable cities, so current selection and
  // marker movement cannot force cards to jump to another side of the map.
  const pointerBounds = pointer?.parent === cityView ? bounds(pointer, true) : null;
  for (const city of cities) {
    if (!visible(city)) continue;
    const r = read(() => artwork(city));
    // An active city's missing/loading texture must not turn it into free
    // space. Wait for its known fixed geometry instead of ignoring the node.
    if (!valid(r)) {
      if (read(() => city.HasEvent) !== false) return empty;
      continue;
    }
    // Like the old map, only active/unknown nodes are inviolable. Explicitly
    // inactive grey scenery remains a preference, not an artificial wall that
    // can suppress a real event's card. Unknown is never treated as inactive.
    const active = read(() => city.HasEvent) !== false;
    shapes.set(city, r); protect(r, active);
    protect(bounds(read(() => city.citynameImg)), active);
    if (!active) continue;
    protect(bounds(read(() => city.eventtypeImg)));
    if (valid(pointerBounds) && pointer.width > 0 && pointer.height > 0 && city.parent === cityView) {
      const center = read(() => city.PosXCenter);
      const x = (Number.isFinite(center) ? center : r.x + r.w / 2) - pointer.width / 2;
      const y = Math.max(20 - (Number(cityView.y) || 0), city.y - pointer.height);
      protect({ ...pointerBounds, x: pointerBounds.x + x - pointer.x, y: pointerBounds.y + y - pointer.y });
    }
  }
  const anchors = [];
  for (const [node, city] of nodeCities) {
    const r = shapes.get(city);
    if (node.type !== 'camp' && r) anchors.push({ node, ...r });
  }
  // Give the planner deterministic input even if the native dictionary or
  // protocol location array changes iteration order after selecting a city.
  const order = (a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h;
  buildings.sort(order); protectedBuildings.sort(order);
  anchors.sort((a, b) => String(a.node.id).localeCompare(String(b.node.id), 'en', { numeric: true }));
  const controls = read(() => mapControlRegions(scene, part=>bounds(part,false,true))) || [];
  const raid = read(() => cityView.raidItem);
  if (visible(raid) && raid.open === true) {
    const r = bounds(raid);
    if (valid(r)) controls.push(r);
  }
  controls.sort(order);
  return { anchors, buildings, protectedBuildings, controls, viewport };
}
