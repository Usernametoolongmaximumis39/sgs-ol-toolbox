import tacticIcon from './assets/tactic-icon.js';
import moneyIcon from './assets/money-icon.js';
import equipmentIcon from './assets/equipment-icon.js';
export function rewardIconData(name) {
  return /^rogue_event_zhanfa[012]$/.test(name || '') ? tacticIcon
    : /^rogue_event_equip[012]$/.test(name || '') ? equipmentIcon
    : name === 'rogue_money_icon' ? moneyIcon : null;
}
// Reuse already loaded official atlas textures. No requests or atlas ownership.
export function nativeRewardTexture(L, name) {
  if (!name) return null;
  const direct = L?.loader?.getRes?.(name);
  if (direct?.bitmap && direct.width > 0) return direct;
  // This client stores bitmap data in loadedMap and atlas Texture objects in
  // textureMap. Older Laya builds keep Texture objects directly in loadedMap.
  for (const cache of [L?.Loader?.textureMap, L?.Loader?.loadedMap, L?.Loader?._loadedMap]) {
    if (!cache) continue;
    for (const key of Object.keys(cache).slice(0, 60000)) {
      if (key.split('?')[0].split('/').at(-1) !== name + '.png') continue;
      const texture = cache[key]?.bitmap ? cache[key] : L?.loader?.getRes?.(key);
      if (texture?.bitmap && texture.width > 0 && !texture.destroyed) return texture;
    }
  }
  return null;
}

// Use the simple official closed book, without a selection-number badge.
// Cards retain their fan silhouette. Acquisition mode remains explicit in text.
export function createRewardTextureResolver(ctx) {
  const assets = new Map(); let disposed = false;
  ctx.scope.add(() => {
    disposed = true;
    for (const entry of assets.values()) {
      if (entry.pending) entry.pending.onload = entry.pending.onerror = null;
      entry.owned?.destroy(true);
    }
    assets.clear();
  });
  return (L, name) => {
    if (disposed) return null;
    const data = rewardIconData(name);
    if (!data) return nativeRewardTexture(L, name);
    const key = name === 'rogue_money_icon' ? name : name.replace(/[012]$/, '0');
    const cached = nativeRewardTexture(L, key);
    if (cached) return cached;
    let entry = assets.get(key);
    if (!entry) { entry = {}; assets.set(key,entry); }
    if (entry.owned) return entry.owned;
    if (!entry.pending && L?.Texture2D && L?.Texture && ctx.window.Image) {
      const img = entry.pending = new ctx.window.Image();
      img.onload = () => {
        img.onload = img.onerror = null;
        if (disposed) return;
        let bitmap;
        try { bitmap = new L.Texture2D(img.naturalWidth, img.naturalHeight); bitmap.loadImageSource(img,true); entry.owned = new L.Texture(bitmap); }
        catch { bitmap?.destroy(); }
      };
      img.onerror = () => { img.onload = img.onerror = null; };
      img.src = data;
    }
    return null;
  };
}
