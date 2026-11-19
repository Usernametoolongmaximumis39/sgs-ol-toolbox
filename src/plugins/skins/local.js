import { read } from './native-model.js';
import { readInventory } from './model.js';
import { resolveSkinManager, resolveSkinRuntime } from './runtime.js';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const portraitLayers = ['skinTex', 'skinBigSps', 'spineSkeleon', 'skeleton', 'skeletonBg', 'skeletonTop', 'tempStaticSkin'];
const setting = (ctx, key) => ctx.settings.get(key, false) === true;

function currentSkin(target) {
  const { general } = target;
  return { id: Number(general.SkinId ?? general.SkinItemId) || 0, dynamic: general.IsDynamic === true,
    form: Number(general.DySkinType) || 1 };
}

function sameSkin(left, right) {
  return left.id === right.id && left.dynamic === right.dynamic && left.form === right.form;
}

function animationLayer(avatar) {
  return avatar.skinBigSps || avatar.spineSkeleon || avatar.skeleton;
}

export function createLocalSkins(ctx) {
  const choices = new Map(), imports = new Map(), pending = new Map();
  let scene, lastAutoDynamic;
  let failedAnimations = new WeakMap();
  function targets() {
    if (!ctx.game.isInGame?.()) return [];
    const self = ctx.game.getSelfSeatUI?.();
    return (ctx.game.getSeatUIs?.() || []).flatMap((ui, index) => {
      const seat = ui.Seat ?? ui.seat;
      if (!seat || seat.IsFull === false || seat.IsNameless || seat.destroyed) return [];
      const isSelf = seat.IsSelf === true || ui === self;
      const results = [];
      for (const deputy of [false, true]) {
        const general = deputy ? seat.General2 : seat.General;
        const id = Number(deputy ? seat.General2Id : seat.GeneralId);
        // A face-down general has no public name or skin selection.
        if (!general || general.IsShibing || !Number.isSafeInteger(id) || id <= 0 || id === 65535) continue;
        if (typeof seat.IsFaceUp === 'function' && seat.IsFaceUp(deputy ? 1 : 0) !== true) continue;
        const avatar = deputy ? ui.seatAvatarFu ?? ui.fuSeatUI?.seatAvatar : ui.seatAvatar;
        if (!avatar || avatar.destroyed || avatar.generalCard !== general || typeof avatar.SetSkin !== 'function') continue;
        const key = (seat.Index ?? index) + ':' + Number(deputy);
        const name = general.CardName || general.Name || general.GeneralName || general.generalName || `武将 ${id}`;
        const label = `${isSelf ? '自己' : `${seat.FixedViewId || index + 1} 号位`} · ${deputy ? '副将 · ' : ''}${name}`;
        results.push({ key, seat, general, id, label, isSelf, avatar, x: ui.seatX });
      }
      return results;
    });
  }

  function allows(target) {
    return setting(ctx, target.isSelf ? 'unlockSkin' : 'otherPlayers');
  }
  function catalogue(manager, target) {
    const items = read(() => manager.GetOnlineSKinList(target.id));
    return Array.isArray(items) ? items : [];
  }
  function supportsDynamic(target, id) {
    const skinId = id || read(() => target.avatar.defaultDynamicSkinId());
    if (!skinId) return false;
    const current = target.avatar.skinBaseVO;
    if (Number(current?.skinID) === skinId) return Boolean(read(() => current.SeatAnimateUrl));
    const manager = resolveSkinManager(ctx.game);
    const vo = read(() => manager.GetGeneralSkinBySkinID(skinId)) ??
      catalogue(manager, target).find(entry => Number(entry?.skinID) === skinId);
    return Boolean(read(() => vo.SeatAnimateUrl));
  }
  function options(target) {
    if (!allows(target)) return [];
    const runtime = target.isSelf ? resolveSkinRuntime(ctx.game) : null;
    const manager = runtime?.skinManager ?? resolveSkinManager(ctx.game);
    const results = new Map([[0, { id: 0, name: '经典形象', owned: true, dynamic: supportsDynamic(target, 0) }]]);
    for (const vo of catalogue(manager, target)) {
      const id = Number(vo?.skinID);
      if (!Number.isSafeInteger(id) || id <= 0 || results.has(id)) continue;
      const owned = runtime?.ready ? readInventory(read(() => manager.GetSkinListBySkinID(id))).owned : null;
      results.set(id, { id, name: vo.skinname || `皮肤 ${id}`, owned, dynamic: Boolean(read(() => vo.SeatAnimateUrl)) });
    }
    return [...results.values()];
  }
  function matchesTarget(left, right) {
    return left && right && left.seat === right.seat && left.general === right.general &&
      left.id === right.id && left.isSelf === right.isSelf && left.avatar === right.avatar;
  }
  function drawSkin(target, skin) {
    const { avatar, general, x } = target;
    // This avatar method reads and writes the awakening form on generalCard.
    // Give only the renderer a temporary view, never change the seat's model.
    avatar.generalCard = Object.create(general, {
      IsDynamic: { value: skin.dynamic },
      JueXingState: { value: skin.form, writable: true },
    });
    try { avatar.SetSkin(skin.id, x ?? avatar.x, '', 0, skin.form, false, false); }
    finally { avatar.generalCard = general; }
  }
  function animationChanged(target, choice) {
    return choice.animation && (animationLayer(target.avatar) !== choice.animation || choice.animation.destroyed);
  }
  function applySkin(target, original, applied, option = null) {
    const previous = choices.get(target.key);
    try {
      drawSkin(target, applied);
      if (target.avatar.skinItemID !== applied.id) throw new Error('当前模式未应用这款本地皮肤。');
    } catch (error) {
      if (previous && !previous.portrait) {
        read(() => drawSkin(target, previous.applied));
        previous.animation = previous.applied.dynamic ? animationLayer(target.avatar) : null;
      } else read(() => drawSkin(target, original));
      throw error;
    }
    previous?.portrait?.dispose();
    imports.delete(target.key);
    choices.set(target.key, { target, original, applied, option, animation: applied.dynamic ? animationLayer(target.avatar) : null });
  }
  function syncAnimation(target, original, applied, option) {
    const failed = failedAnimations.get(target.avatar);
    if (matchesTarget(failed?.target, target) && sameSkin(failed.original, original) && sameSkin(failed.applied, applied)) return;
    try { applySkin(target, original, applied, option); }
    catch (error) {
      failedAnimations.set(target.avatar, { target, original, applied });
      ctx.window.console?.warn('皮肤管理：本地动态切换失败', error);
    }
  }
  function selectedSkin(original, option, autoDynamic) {
    const same = original.id === option.id;
    return { id: option.id, form: same ? original.form : 1,
      dynamic: (same && original.dynamic) || (autoDynamic && option.dynamic) };
  }
  function restore(key, activeTarget) {
    imports.delete(key);
    const choice = choices.get(key);
    if (!choice) return;
    choices.delete(key);
    if (choice.portrait) choice.portrait.dispose();
    else if (matchesTarget(choice.target, activeTarget) && activeTarget.avatar.skinItemID === choice.applied.id &&
        (choice.option || !animationChanged(activeTarget, choice))) {
      drawSkin(activeTarget, currentSkin(activeTarget));
    }
  }
  function refresh() {
    const nextScene = ctx.game.getScene?.();
    const current = targets();
    const byKey = new Map(current.map(target => [target.key, target]));
    const sameScene = scene === nextScene;
    scene = nextScene;
    if (!sameScene || !ctx.game.isInGame?.() || !setting(ctx, 'unlockSkin')) pending.clear();
    const autoDynamic = setting(ctx, 'unlockDynamic');
    if (autoDynamic !== lastAutoDynamic || !sameScene) failedAnimations = new WeakMap();
    lastAutoDynamic = autoDynamic;
    for (const [key, choice] of choices) {
      const target = sameScene ? byKey.get(key) : null;
      if (!matchesTarget(choice.target, target)) {
        restore(key, target);
        continue;
      }
      if (choice.portrait) {
        if (setting(ctx, 'crossServer') && (target.isSelf || setting(ctx, 'otherPlayers'))) choice.portrait.refresh();
        else restore(key, target);
        continue;
      }
      if (!sameSkin(currentSkin(target), choice.original) || target.avatar.skinItemID !== choice.applied.id ||
          (choice.option ? !allows(target) : !autoDynamic)) {
        restore(key, target);
        continue;
      }
      if (choice.option) {
        const applied = selectedSkin(choice.original, choice.option, autoDynamic);
        if (!sameSkin(choice.applied, applied) || animationChanged(target, choice)) syncAnimation(target, choice.original, applied, choice.option);
      } else if (animationChanged(target, choice)) choices.delete(key);
    }
    for (const target of current) {
      if (!target.isSelf || choices.has(target.key)) continue;
      const original = currentSkin(target);
      if (target.avatar.skinItemID !== original.id) continue;
      const option = pending.get(target.id);
      if (option) {
        pending.delete(target.id);
        try { applySkin(target, original, selectedSkin(original, option, autoDynamic), option); }
        catch (error) { ctx.notify?.(error.message); }
        continue;
      }
      if (!autoDynamic || original.dynamic) continue;
      if (!supportsDynamic(target, original.id)) continue;
      syncAnimation(target, original, { ...original, dynamic: true });
    }
    return current;
  }
  function liveTarget(target) {
    const current = refresh().find(entry => matchesTarget(entry, target));
    if (!current) throw new Error('座位或武将已变化，请重新选择。');
    return current;
  }
  function select(target, id) {
    target = liveTarget(target);
    const option = options(target).find(entry => entry.id === id);
    if (!option) throw new Error('当前皮肤选项不可用。');
    const original = currentSkin(target);
    applySkin(target, original, selectedSkin(original, option, setting(ctx, 'unlockDynamic')), option);
    return option;
  }
  function selectNative(generalId, option, waitForSeat) {
    const current = refresh();
    if (!scene || !ctx.game.isInGame?.() || !setting(ctx, 'unlockSkin')) throw new Error('当前牌局的本地换肤未启用。');
    const target = current.find(entry => entry.isSelf && entry.id === generalId);
    if (!target) {
      if (!waitForSeat) throw new Error('当前武将无法本地换肤。');
      pending.set(generalId, option);
      return;
    }
    const original = currentSkin(target);
    applySkin(target, original, selectedSkin(original, option, setting(ctx, 'unlockDynamic')), option);
  }
  function clearNative(generalId) {
    pending.delete(generalId);
    for (const target of refresh()) {
      if (target.isSelf && target.id === generalId && choices.get(target.key)?.option) restore(target.key, target);
    }
  }
  function hasOwnGeneral(generalId) {
    return targets().some(target => target.isSelf && target.id === generalId);
  }
  async function importPortrait(target, file) {
    target = liveTarget(target);
    if (!setting(ctx, 'crossServer') || (!target.isSelf && !setting(ctx, 'otherPlayers'))) throw new Error('当前座位的外服换肤未启用。');
    if (!imageTypes.has(file?.type) || !file.size || file.size > 12 * 1024 * 1024) throw new Error('请选择 12 MB 以内的 PNG、JPEG 或 WebP 图片。');
    const { window: win, scope } = ctx;
    const laya = win.Laya ?? win.laya, avatar = target.avatar;
    if (!avatar?.skinTex || !laya?.Texture2D || !laya?.Texture || !laya?.Sprite) throw new Error('当前座位不支持外服立绘。');
    const url = win.URL.createObjectURL(file), image = new win.Image();
    const release = scope.add(() => win.URL.revokeObjectURL(url));
    const request = { scene };
    imports.set(target.key, request);
    try {
      await new Promise((resolve, reject) => {
        const abort = () => finish(reject, new Error('已取消图片载入。'));
        function finish(done, value) {
          scope.signal.removeEventListener('abort', abort);
          image.onload = image.onerror = null;
          done(value);
        }
        scope.signal.addEventListener('abort', abort, { once: true });
        image.onload = () => finish(resolve);
        image.onerror = () => finish(reject, new Error('无法打开这张图片。'));
        image.src = url;
      });
      if (scope.signal.aborted || imports.get(target.key) !== request) return;
      target = liveTarget(target);
      if (imports.get(target.key) !== request || scene !== request.scene) return;
      if (!setting(ctx, 'crossServer') || (!target.isSelf && !setting(ctx, 'otherPlayers'))) return;
      if (Math.max(image.naturalWidth, image.naturalHeight) > 4096) throw new Error('图片长边不能超过 4096 像素。');
      const portrait = createPortrait(laya, avatar, image);
      restore(target.key, target);
      try { portrait.refresh(); }
      catch (error) { portrait.dispose(); throw error; }
      choices.set(target.key, { target, portrait });
      return true;
    } finally {
      if (imports.get(target.key) === request) imports.delete(target.key);
      release();
    }
  }
  ctx.scope.interval(() => { if (choices.size || pending.size || setting(ctx, 'unlockDynamic')) refresh(); }, 300);
  ctx.scope.add(() => {
    imports.clear(); pending.clear();
    const current = scene === ctx.game.getScene?.() ? targets() : [];
    for (const key of choices.keys()) restore(key, current.find(target => target.key === key));
  });
  function has(target) {
    const choice = choices.get(target.key);
    return Boolean((choice?.option || choice?.portrait) && matchesTarget(choice.target, target));
  }
  return { refresh, allows, options, select, selectNative, clearNative, hasOwnGeneral, importPortrait, has,
    reset(target) { target = liveTarget(target); if (has(target)) restore(target.key, target); } };
}

function createPortrait(laya, avatar, image) {
  const bitmap = new laya.Texture2D(image.naturalWidth, image.naturalHeight);
  let texture, sprite;
  const hidden = new Map();
  function dispose() {
    for (const [node, visible] of hidden) if (!node.destroyed) node.visible = visible;
    hidden.clear();
    sprite?.destroy(true);
    texture?.destroy();
    bitmap.destroy();
  }
  try {
    bitmap.loadImageSource(image);
    texture = new laya.Texture(bitmap);
    sprite = new laya.Sprite();
    sprite.name = 'sgs-local-skin-portrait';
    sprite.mouseEnabled = false;
    const width = avatar.width, height = avatar.height;
    if (!(width > 0 && height > 0)) throw new Error('当前座位立绘区域不可用。');
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale, imageHeight = image.naturalHeight * scale;
    sprite.graphics.drawTexture(texture, (avatar.scrollRect?.x || 0) + (width - imageWidth) / 2,
      (height - imageHeight) / 2, imageWidth, imageHeight);
    sprite.zOrder = 1000;
    avatar.addChild(sprite);
  } catch (error) { dispose(); throw error; }
  return { dispose, refresh() {
    for (const key of portraitLayers) {
      const node = avatar[key];
      if (!node || node.destroyed) continue;
      if (!hidden.has(node) || node.visible !== false) hidden.set(node, node.visible);
      node.visible = false;
    }
  } };
}
