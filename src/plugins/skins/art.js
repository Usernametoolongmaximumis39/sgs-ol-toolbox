import ordinaryBadge from './assets/ordinary-badge.js';

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
export const loadOrdinaryBadge = (laya, apply) => load(laya, ordinaryBadge, apply);
