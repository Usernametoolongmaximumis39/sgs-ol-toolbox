import ordinaryBadge from './assets/ordinary-badge.js';
import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';

export const TIERS = [
  { color: '#e2e7ed', text: '#f5f6f2', shade: '#434a51', grade: [0.95, 0.98, 1.03] },
  { color: '#b899e3', text: '#f3e6ff', shade: '#493458', grade: [0.91, 0.64, 1.22] },
  { color: '#d8b267', text: '#fff0c6', shade: '#62471f', grade: [1.13, 0.86, 0.43] },
  { color: '#ed9b4c', text: '#fff3dc', shade: '#743017', grade: [1.30, 0.66, 0.23] },
  { color: '#e58c96', text: '#ffe9da', shade: '#62252f', grade: [1.18, 0.43, 0.47] },
];
const caches = new WeakMap();
function load(laya, uri, apply) {
  let cache = caches.get(laya); if (!cache) caches.set(laya, cache = new Map());
  let entry = cache.get(uri);
  if (entry?.texture) { apply(entry.texture); return; }
  if (entry) { entry.waiters.push(apply); return; }
  entry = { texture: null, waiters: [apply] }; cache.set(uri, entry);
  laya.loader.load(uri, laya.Handler.create(null, texture => {
    entry.texture = texture;
    for (const callback of entry.waiters.splice(0)) if (texture) callback(texture);
  }), null, laya.Loader.IMAGE);
}
const svg = (w, h, content) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`);
export const loadOrdinaryBadge = (laya, apply) => load(laya, ordinaryBadge, apply);

function paintArtwork(laya, node, key, uri, width, height) {
  if (node._skinSurfaceKey === key) return;
  node._skinSurfaceKey = key;
  load(laya, uri, texture => {
    if (node.destroyed || node._skinSurfaceKey !== key) return;
    node.graphics.clear(); node.graphics.drawTexture(texture, 0, 0, width, height);
  });
}

// The category-tab silhouette is specific to skin management. Its materials
// come from the same native palette as the shared buttons and popup surfaces.
export function paintClassicTab(laya, node, width, height, selected, hover, palette = DEFAULT_NATIVE_PALETTE) {
  const active = selected || hover, y = active ? 1 : 6, h = height - y - 1;
  const p = palette;
  const content = `<defs><linearGradient id="metal" x2="0" y2="1"><stop stop-color="${active ? p.highlight : p.border}"/><stop offset=".2" stop-color="${p.border}"/><stop offset=".55" stop-color="${p.borderSoft}"/><stop offset="1" stop-color="${p.shadow}"/></linearGradient><linearGradient id="base" x2="0" y2="1"><stop stop-color="${active ? p.selected : p.raised}"/><stop offset=".52" stop-color="${active ? p.hover : p.surface}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient><radialGradient id="glow" cx=".5" cy=".4" r=".65"><stop stop-color="${p.accent}" stop-opacity=".22"/><stop offset=".6" stop-color="${p.accent}" stop-opacity=".08"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient></defs>`
    + `<rect x=".5" y="${y}" width="${width - 1}" height="${h}" fill="${p.shadow}" stroke="${p.shadow}"/><rect x="2" y="${y + 1}" width="${width - 4}" height="${h - 1}" fill="url(#metal)"/><rect x="4" y="${y + 3}" width="${width - 8}" height="${h - 4}" fill="url(#base)" stroke="${p.shadow}" stroke-width="1"/>`
    + (active ? `<rect x="5" y="${y + 4}" width="${width - 10}" height="${h - 6}" fill="url(#glow)"/><path d="M6 ${y + 4}H${width - 6}" stroke="${p.accent}" stroke-opacity=".65"/>` : '')
    + `<path d="M2 ${y + 6}V${y + 1}H8M${width - 8} ${y + 1}H${width - 2}V${y + 6}" fill="none" stroke="${p.highlight}" stroke-opacity=".65"/>`;
  const colors = [p.highlight, p.border, p.borderSoft, p.shadow, p.selected, p.raised, p.hover, p.surface, p.bg, p.accent].join(':');
  paintArtwork(laya, node, `classic:${width}:${height}:${selected}:${hover}:${colors}`, svg(width, height, content), width, height);
}
