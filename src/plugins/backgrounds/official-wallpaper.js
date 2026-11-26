import { ResourceScope } from '../../core/resources.js';

const configName = 'gn_WallPaper';

function assetFromThumbnail(thumbnail, folder, file) {
  if (typeof thumbnail !== 'string' || !/^[\w.-]+$/.test(file) || file === '.' || file === '..') return null;
  const match = /^(.*\bwallpaper\/)small\/[^/?#]+(?:[?#].*)?$/.exec(thumbnail);
  return match ? `${match[1]}${folder}/${file}` : null;
}

function themeSpec(row, thumbnail) {
  const source = row.fcSrc || row.Source;
  if (typeof source !== 'string') return null;
  if (/\.sk$/i.test(source)) {
    const url = assetFromThumbnail(thumbnail, 'ani', source);
    return url && { name: row.Name, url: thumbnail, wallpaperMotion: { kind: 'bone', url } };
  }
  const url = assetFromThumbnail(thumbnail, 'bg', source);
  return url && { name: row.Name, url };
}

export function wallpaperModelSpec(data, live = data?.IsLiveBg === true) {
  if (!data?.Name) return null;
  const kind = live ? 'spine' : /\.sk$/i.test(data.ActiveSource ?? data.Source ?? '') ? 'bone' : null;
  if (kind) {
    const url = data.SmallImgUrl || data.MidIconURL;
    const animation = data.ActiveAniURL || data.AniURL;
    return url && animation ? { name: data.Name, url, wallpaperMotion: { kind, url: animation } } : null;
  }
  const url = data.ActiveBgURL || data.BgURL;
  return url ? { name: data.Name, url } : null;
}

export function selectOfficialWallpaper(ctx, spec, animated) {
  if (!spec) throw new Error('找不到该背景的官方资源');
  ctx.backgrounds.select({ ...spec, animated: animated(), officialWallpaper: true });
  ctx.notify(`已在本地使用「${spec.name}」`);
}

export function wrapWallpaperClick(scope, button, type, owner, original, wrapped) {
  const entries = button._events?.[type];
  // Laya captures the handler when the native button is initialized.
  const handler = (Array.isArray(entries) ? entries : [entries])
    .find(entry => entry?.caller === owner && entry.method === original);
  if (!handler) return false;
  handler.method = wrapped;
  scope.add(() => { if (handler.caller === owner && handler.method === wrapped) handler.method = original; });
  return true;
}

// Flat theme tiles retain their ID and thumbnail. The public config supplies
// the exact full-size filename, which can differ from the thumbnail filename.
export function bindOfficialWallpaper(ctx, laya, owner, scope, { animated }, visible) {
  const bound = new Map();
  let click = 0;
  const { backgrounds, game } = ctx;

  async function select(item, tab, original, args) {
    const request = ++click;
    const currentId = backgrounds.currentHistoryId;
    const canSelect = () => !scope.closed && request === click && visible() && !item.destroyed && item.visible !== false
      && (owner.tabGroup?.SelectedValue ?? 0) === tab && backgrounds.currentHistoryId === currentId;
    if (!canSelect()) return Reflect.apply(original, item, args);
    let spec;
    if (tab === 0) {
      if (!item.tagLock?.visible && !item.vipImg?.visible) return Reflect.apply(original, item, args);
      let config;
      try { config = game.getConfigData(configName) ?? await game.loadConfigData(configName, { signal: scope.signal }); }
      catch (error) {
        if (!canSelect()) return;
        if (!item.tagLock?.visible) return Reflect.apply(original, item, args);
        ctx.notify('读取官方背景失败：' + (error?.message || error));
        return;
      }
      if (!canSelect()) return;
      const row = config?.WallPapers?.WallPaper?.find(entry => Number(entry.ID) === Number(item.Id));
      const vip = Number(game.getSelf?.()?.VipLevelIncludeTrial);
      if (!item.tagLock?.visible && !(Number(row?.Vip) > vip)) return Reflect.apply(original, item, args);
      if (row) spec = themeSpec(row, item.bg?.skin);
    } else if (tab === 1) {
      const data = item.data;
      if (data?.canUsed !== false) return Reflect.apply(original, item, args);
      spec = wallpaperModelSpec(data);
    } else {
      const data = item.data;
      if (data?.IsCanUse !== false) return Reflect.apply(original, item, args);
      spec = wallpaperModelSpec(data, true);
    }
    selectOfficialWallpaper(ctx, spec, animated);
  }

  function bindButton(item, tab, tile) {
    if (tile.button || !item.selectedBtn || typeof item.onSelectedClicked !== 'function') return;
    const type = tab === 0 ? laya.Event.MOUSE_DOWN : laya.Event.CLICK;
    const original = item.onSelectedClicked;
    const wrapped = function (...args) {
      void select(item, tab, original, args).catch(error => {
        if (!scope.closed) ctx.notify('本地背景切换失败：' + (error?.message || error));
      });
    };
    if (wrapWallpaperClick(tile.scope, item.selectedBtn, type, item, original, wrapped)) tile.button = item.selectedBtn;
  }

  scope.add(() => { for (const tile of bound.values()) tile.scope.dispose(); bound.clear(); });
  return () => {
    click++;
    const items = [owner.wallPaperItems, owner.wallPaperSkinItems, owner.wallPaperLiveItems];
    for (const [item, tile] of bound) {
      if (item.destroyed || !items[tile.tab]?.includes(item)) { tile.scope.dispose(); bound.delete(item); }
    }
    for (const [tab, nodes] of items.entries()) for (const item of nodes ?? []) {
      if (!item || item.destroyed || typeof item.useWall !== 'function') continue;
      let tile = bound.get(item);
      if (!tile) {
        tile = { tab, scope: new ResourceScope(), button: null };
        bound.set(item, tile);
        tile.scope.patch(item, 'useWall', original => function (...args) {
          if (backgrounds.current?.officialWallpaper) backgrounds.select(null);
          return Reflect.apply(original, this, args);
        });
        if (tab !== 0 && typeof item.init === 'function' && !item.selectedBtn) {
          tile.scope.patch(item, 'init', original => function (...args) {
            const result = Reflect.apply(original, this, args);
            bindButton(item, tab, tile);
            return result;
          });
        }
      }
      bindButton(item, tab, tile);
    }
  };
}
