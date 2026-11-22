import { ResourceScope } from './resources.js';
import { createBackgroundMotion, createSkinBackgroundMotion } from './background-motion.js';
import { localBackgroundImage, readLocalBackground } from './background-local.js';
import { nativeSeat } from './seat.js';
import { supportsSkinBackgroundAttack } from '../shared/skin-detail.js';

const skinQualitySetting = 'backgrounds:skinQuality';

function fitBackground(width, height, viewportWidth, viewportHeight, scaleFor) {
  if (![width, height, viewportWidth, viewportHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = scaleFor(viewportWidth / width, viewportHeight / height);
  return { width, height, scale, x: (viewportWidth - width * scale) / 2, y: (viewportHeight - height * scale) / 2 };
}

export function containBackground(width, height, viewportWidth, viewportHeight) {
  return fitBackground(width, height, viewportWidth, viewportHeight, Math.min);
}

function findBackgroundLayer(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed) continue;
    if (node.bgSprite && typeof node.updateBgSize === 'function' && typeof node.bgLoadComplete === 'function'
      && typeof node.SetBgLiveEffect === 'function') return node;
    if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return null;
}

function backgroundViewport(layer, win) {
  // The native layer's clipping rectangle already uses unscaled game units.
  const viewport = layer.scrollRect;
  if (viewport?.width > 0 && viewport.height > 0) return viewport;
  const { gameWidth: width, gameHeight: height } = win.SystemContext || {};
  return { width, height };
}

export function backgroundSpec(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160) throw new Error('背景名称无效');
  const url = String(value.url || '');
  if (url.length > 4096 || !/^(https?:\/\/|res\/)/.test(url)) throw new Error('背景须为游戏资源路径或 HTTP(S) 图片');
  if (/^https?:/.test(url)) { const parsed = new URL(url); if (parsed.username || parsed.password) throw new Error('背景地址不能包含凭据'); }
  const result = { name: value.name.trim(), url };
  if (value.dynamic === null) result.dynamic = null;
  if (value.dynamic != null) {
    const d = value.dynamic;
    if (!['bone', 'spine', 'video'].includes(d.kind)) throw new Error('动态背景类型无效');
    const dynamicUrl = backgroundSpec({ name: '动态资源', url: d.url }).url;
    if (![d.width, d.height].every(n => Number.isFinite(n) && n > 0 && n <= 16384)) throw new Error('动态背景尺寸无效');
    if (d.parts != null && (!Array.isArray(d.parts) || d.parts.length > 16 || d.parts.some(p => !/^[\w-]{1,80}$/.test(p)) || new Set(d.parts).size !== d.parts.length || d.parts.includes('beijing'))) throw new Error('动态背景分层无效');
    result.dynamic = Object.freeze({ kind: d.kind, url: dynamicUrl.replace(/\/$/, ''), width: d.width, height: d.height, modern: d.modern === true, parts: Object.freeze([...(d.parts || [])]),
      ...(typeof d.attack === 'boolean' ? { attack: d.attack } : {}) });
  }
  result.animated = value.animated !== false;
  result.attackEffects = value.attackEffects !== false;
  return Object.freeze(result);
}

const ATTACK_SKILL = new Map([[1, 'slash'], [11111, 'slash'], [11112, 'slash'], [11114, 'slash'], [8, 'attack'], [9, 'attack'], [10, 'attack']]);
const ATTACK_CARDS = new Map([
  ['杀', 'slash'], ['火杀', 'slash'], ['雷杀', 'slash'], ['冰杀', 'slash'],
  ['火焰杀', 'slash'], ['雷电杀', 'slash'], ['冰霜杀', 'slash'],
  ['决斗', 'attack'], ['南蛮入侵', 'attack'], ['万箭齐发', 'attack'],
]);

function watchBackgroundAttack(game, scene, scope, play) {
  const currentSeat = () => {
    const seat = nativeSeat(game.getSelfSeatUI?.());
    return seat?.IsSelf === false ? null : seat;
  };
  let seat, release;
  const trigger = (kind, useType) => {
    if (kind === 'attack' || (kind === 'slash' && Number(useType) === 1)) play();
  };
  return enabled => {
    const next = enabled ? currentSeat() : null;
    if (next === seat) return;
    release?.(); seat = next;
    if (typeof seat?.on !== 'function' || typeof seat.off !== 'function') return;
    const bound = seat;
    const isCurrent = () => !scope.closed && game.getScene() === scene && game.isInGame() && currentSeat() === bound;
    // These are the same seat events the game's portrait animator listens to.
    const card = (id, useType) => {
      if (!isCurrent()) return;
      const meta = game.getCardMeta?.(id);
      trigger(meta?.firstSkillId > 0 ? ATTACK_SKILL.get(meta.firstSkillId) : ATTACK_CARDS.get(meta?.name), useType);
    };
    const skillCard = (id, useType) => { if (isCurrent()) trigger(ATTACK_SKILL.get(Number(id)), useType); };
    release = scope.add(() => {
      bound.off('USE_CARD', scope, card);
      bound.off('USE_SKILL_CARD', scope, skillCard);
    });
    bound.on('USE_CARD', scope, card);
    bound.on('USE_SKILL_CARD', scope, skillCard);
  };
}

// Only the current battle instance is wrapped. Native weather, URL-based skill
// backgrounds and SpecialBackground children (notably Pei Xiu) keep ownership.
export class BackgroundRegistry {
  constructor({ window, game, settings, scope, sceneWatch }) {
    Object.assign(this, { window, game, settings, scope });
    this.providers = new Set(); this.listeners = new Set(); this.binding = null;
    this.ready = null; this.loading = null; this.failed = null; this.ticket = 0;
    this.status = '跟随游戏背景';
    const refresh = () => this.refresh();
    if (sceneWatch) scope.add(sceneWatch.watch(refresh, 500, true));
    else scope.interval(refresh, 500);
    scope.add(() => {
      this.importing = null; this.ticket++; this.listeners.clear();
      try { this.detach(true); } finally { this.dropLocalImage(); }
    });
    if (window.addEventListener && settings.prefix) scope.listen(window, 'storage', event => {
      if (event.storageArea !== settings.storage) return;
      if (event.key === settings.prefix + 'battleBackground' || event.key === null) this.selectionChanged();
      if (event.key === settings.prefix + skinQualitySetting) { this.refresh(); this.emit(); }
    });
  }
  get current() { return this.settings.get('battleBackground', null); }
  isActive(owner) { return this.providers.has(owner); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(); } catch { /* subscriber isolation */ } } }
  state(text) { if (this.status !== text) { this.status = text; this.emit(); } }
  register(owner) {
    if (this.providers.has(owner)) throw new Error('背景提供方已注册');
    this.providers.add(owner); this.refresh(); this.emit();
    let active = true;
    return () => {
      if (!active) return;
      active = false; this.providers.delete(owner);
      if (this.importing?.owner === owner) this.importing = null;
      this.retryAt = 0; this.loadAttempts = 0; this.refresh(); this.emit();
    };
  }
  select(owner, spec) {
    if (!this.providers.has(owner)) throw new Error('背景提供方未启用');
    this.saveSelection(spec ? { ...backgroundSpec(spec), owner } : null);
  }
  registerSkinMotion(load, { quality = false } = {}) {
    this.skinMotion = load;
    this.skinQualityAvailable = quality;
    this.emit();
    return () => {
      if (this.skinMotion !== load) return;
      this.skinMotion = null;
      this.skinQualityAvailable = false;
      this.emit();
    };
  }
  setSkinQuality(owner, quality) {
    if (owner !== 'backgrounds' || !this.providers.has(owner) || !this.skinQualityAvailable || !['high', 'low'].includes(quality)) return;
    if (this.settings.get(skinQualitySetting, 'high') === quality) return;
    this.settings.set(skinQualitySetting, quality);
    this.refresh();
    this.emit();
  }
  setAnimated(owner, enabled) {
    const choice = this.current;
    if (choice?.owner !== owner || !this.providers.has(owner)) return;
    if (choice.skinMotion !== true) { if (!choice.localImageId) this.select(owner, { ...choice, animated: enabled }); return; }
    this.settings.set('battleBackground', { ...choice, animated: enabled });
    this.selectionChanged();
  }
  setAttackEffects(owner, enabled) {
    const choice = this.current;
    if (choice?.owner !== owner || !this.providers.has(owner) || !supportsSkinBackgroundAttack(choice.dynamic)) return;
    this.settings.set('battleBackground', { ...choice, attackEffects: enabled === true });
    if (!enabled) this.binding?.motion?.stopAttack();
    this.refresh(); this.emit();
  }
  async selectLocal(owner, file, { skinKey, skinMotion, animated, isCurrent = () => true } = {}) {
    if (this.scope.closed || !this.providers.has(owner)) throw new Error('背景提供方未启用');
    const pending = this.importing = { owner };
    const canSave = () => this.importing === pending && isCurrent();
    let id;
    try {
      const image = await readLocalBackground(this.window, file, Boolean(skinKey));
      if (!canSave()) return false;
      // IndexedDB stores the bytes directly for browsers without in-store Blob support.
      id = await localBackgroundImage(this.window, 'readwrite', store => store.add(image));
      if (!canSave()) return false;
      const name = file.name?.trim().slice(0, 160) || '本地图片';
      this.saveSelection({ name, localImageId: id, owner, animated: Boolean(skinMotion && animated), dynamic: null,
        ...(skinKey && { skinKey, skinMotion: Boolean(skinMotion) }) });
      id = undefined;
      return true;
    } catch (error) {
      if (canSave()) throw error;
      return false;
    } finally {
      if (this.importing === pending) this.importing = null;
      this.removeLocalImage(id);
    }
  }
  removeLocalImage(id) {
    if (Number.isSafeInteger(id) && id > 0) void localBackgroundImage(this.window, 'readwrite', store => store.delete(id)).catch(() => {});
  }
  saveSelection(choice) {
    const previousId = this.current?.localImageId;
    this.settings.set('battleBackground', choice);
    this.selectionChanged();
    this.removeLocalImage(previousId);
  }
  selectionChanged() {
    this.importing = null;
    this.yieldedScene = this.binding?.yielded ? this.binding.scene : this.yieldedScene;
    this.ticket++; this.ready = this.loading = this.failed = null;
    this.retryAt = 0; this.loadAttempts = 0;
    try { this.detach(true); } catch { /* The scene can disappear during a switch. */ }
    this.dropLocalImage(); this.refresh(); this.emit();
  }
  dropLocalImage() {
    const asset = this.localImage;
    this.localImage = null;
    if (!asset?.url) return;
    this.imageTexture = this.imageSize = null;
    try { asset.loader?.clearRes?.(asset.url); }
    catch { /* The native loader may already be tearing down. */ }
    finally { this.window.URL.revokeObjectURL(asset.objectUrl); }
  }
  localUrl(id) {
    if (this.localImage?.id !== id) {
      this.dropLocalImage();
      const asset = this.localImage = { id };
      localBackgroundImage(this.window, 'readonly', store => store.get(id)).then(image => {
        if (this.localImage !== asset) return;
        if (!image) throw new Error('本地图片已丢失，请重新选择');
        const blob = image instanceof this.window.Blob ? image : new this.window.Blob([image.bytes], { type: image.type });
        asset.objectUrl = this.window.URL.createObjectURL(blob);
        // The game sends URLs without :// through its resource path formatter.
        // An inert fragment keeps blob:null URLs local in the file-origin client.
        asset.url = asset.objectUrl.includes('://') ? asset.objectUrl : asset.objectUrl + '#://';
        this.refresh();
      }).catch(error => {
        if (this.localImage !== asset) return;
        asset.error = error?.message || String(error);
        this.refresh();
      });
    }
    if (!this.localImage.url) this.state(this.localImage.error || '正在读取本地图片');
    return this.localImage.url;
  }
  detach(restore) {
    const b = this.binding; if (!b) return;
    this.binding = null; b.scope.dispose();
    // Never ask the game to refresh a skill-owned background on disable.
    if (restore && b.applied && !b.yielded && !b.scene.currentWeatherWallPaper && !b.scene.destroyed && this.game.getScene() === b.scene) b.scene.onWallPaperChange();
  }
  refresh() {
    if (this.scope.closed) return;
    if (this.retryAt && Date.now() < this.retryAt) return;
    try { this.refreshReady(); }
    catch (error) {
      this.ticket++; this.loading = null;
      try { this.detach(false); } catch { /* release partial attachment */ }
      this.retryAt = Date.now() + 2000;
      this.state('背景接入暂未就绪，将自动重试：' + (error?.stack || error));
    }
  }
  loadFailed(url, message) {
    this.ticket++; this.loading = null; this.failed = url;
    this.loadAttempts = (this.loadAttempts || 0) + 1;
    this.retryAt = Date.now() + Math.min(30000, 2000 * 2 ** (this.loadAttempts - 1));
    this.state(message + '；稍后自动重试');
  }
  refreshReady() {
    let choice = this.current;
    if (!choice || !this.providers.has(choice.owner)) {
      this.ticket++; this.ready = this.loading = null;
      try { this.detach(true); } finally { this.dropLocalImage(); }
      this.state(choice ? '背景插件已停用，跟随游戏背景' : '跟随游戏背景'); return;
    }
    const localId = choice.localImageId;
    try {
      if (localId === undefined) backgroundSpec(choice);
      else if (!Number.isSafeInteger(localId) || localId < 1) throw new Error('本地图片编号无效');
    }
    catch (error) { this.detach(true); this.state('背景配置无效：' + error.message); return; }
    const scene = this.game.getScene();
    if (this.binding?.scene !== scene) this.detach(false);
    if (this.binding && (this.binding.layer.destroyed || this.binding.stage !== this.window.Laya?.stage)) this.detach(false);
    if (!this.game.isInGame() || !['SetWallPaperById', 'SetWallPaperByUrl', 'OnNormalWallPaperChange', 'onWallPaperChange'].every(k => typeof scene?.[k] === 'function')) {
      this.detach(false); this.state('已保存，等待进入牌局'); return;
    }
    const laya = this.window.Laya;
    if (localId !== undefined) {
      const url = this.localUrl(localId);
      if (!url) return;
      choice = { ...choice, url };
    }
    if (this.failed === choice.url) this.failed = null;
    if (this.ready !== choice.url) {
      if (this.loading === choice.url) return;
      if (!laya?.loader?.load || !laya.Handler?.create) { this.state('等待游戏图片加载器'); return; }
      const ticket = ++this.ticket; this.loading = choice.url; this.state('正在加载背景');
      this.scope.timeout(() => {
        if (ticket !== this.ticket || this.loading !== choice.url) return;
        this.loadFailed(choice.url, '背景加载超时');
      }, 20000);
      try {
        const asset = localId === undefined ? null : this.localImage;
        if (asset) asset.loader = laya.loader;
        laya.loader.load(choice.url, laya.Handler.create(null, texture => {
          if (ticket !== this.ticket || this.scope.closed) {
            if (asset && this.localImage !== asset) asset.loader.clearRes?.(choice.url);
            return;
          }
          this.loading = null;
          if (!texture) { this.loadFailed(choice.url, '背景加载失败'); return; }
          this.loadAttempts = 0; this.retryAt = 0;
          this.imageSize = { width: texture.sourceWidth || texture.width, height: texture.sourceHeight || texture.height };
          this.imageTexture = texture;
          this.ready = choice.url; this.refresh();
        }), null, laya.Loader?.IMAGE || 'image');
      } catch (error) { this.loadFailed(choice.url, '背景加载失败：' + error.message); }
      return;
    }
    if (choice.skinKey && !(this.imageSize?.width > this.imageSize?.height)) {
      this.detach(true); this.state('此皮肤没有可用的横版原画'); return;
    }
    const skinQuality = this.settings.get(skinQualitySetting) === 'low' ? 'low' : 'high';
    if (choice.skinMotion && choice.animated !== false && this.binding && this.binding.skinQuality !== skinQuality) this.detach(false);
    if (!this.binding) {
      const layer = findBackgroundLayer(laya?.stage);
      const viewport = layer && backgroundViewport(layer, this.window);
      if (!laya?.Sprite || !laya.Rectangle || !(viewport?.width > 0 && viewport.height > 0)) {
        this.state('等待游戏背景层与布局就绪'); return;
      }
      const local = new ResourceScope(), b = { scene, layer, stage: laya.stage, scope: local, skinQuality,
        applied: false, yielded: this.yieldedScene === scene, writing: false };
      this.binding = b;
      const registry = this;
      const originalById = scene.SetWallPaperById;
      const eligible = () => !scene.currentWeatherWallPaper && !b.yielded;
      let covered;
      function coverStill(next) {
        if (covered?.node !== next) {
          if (covered && !covered.node.destroyed) covered.node.visible = covered.visible;
          covered = next && { node: next, visible: next.visible };
        }
        if (next) next.visible = false;
      }
      local.add(() => coverStill());
      const showMotion = visible => {
        b.motion?.show(visible);
        coverStill(visible && choice.skinMotion && b.motion?.loaded ? layer.bg : undefined);
      };
      b.syncMotion = () => showMotion(eligible() && layer.bg?.skin === choice.url);
      if (layer) {
        const fill = new laya.Sprite();
        local.add(() => fill.destroy(true));
        fill.name = 'sgs-background-edge-fill'; fill.mouseEnabled = false; fill.mouseChildren = false;
        fill.zOrder = (layer.bgSprite.zOrder || 0) - 1;
        layer.addChildAt(fill, Math.max(0, layer.getChildIndex(layer.bgSprite)));
        const soften = new laya.Sprite(); soften.mouseEnabled = false; fill.addChild(soften);
        if (laya.BlurFilter && !choice.skinKey) soften.filters = [new laya.BlurFilter(18)];
        b.hideFill = () => { fill.visible = false; showMotion(false); };
        let fillKey = '';
        local.patch(layer, 'updateBgSize', original => function (...args) {
          const result = Reflect.apply(original, this, args);
          const customBackground = eligible() && this.bg?.skin === choice.url;
          fill.visible = customBackground && !choice.skinKey;
          if (!customBackground) { b.syncMotion(); return result; }
          const size = registry.imageSize;
          const { width: w, height: h } = backgroundViewport(this, registry.window);
          const fit = fitBackground(size?.width, size?.height, w, h, choice.skinKey ? Math.max : Math.min);
          if (!fit) { fill.visible = false; return result; }
          const key = `${w}:${h}`;
          if (fill.visible && key !== fillKey) {
            fillKey = key;
            const scale = Math.max(w / fit.width, h / fit.height);
            const dw = fit.width * scale, dh = fit.height * scale;
            fill.size(w, h); fill.scrollRect = new laya.Rectangle(0, 0, w, h);
            soften.graphics.clear();
            soften.graphics.drawTexture(registry.imageTexture, (w - dw) / 2, (h - dh) / 2, dw, dh);
            soften.graphics.drawRect(0, 0, w, h, 'rgba(0,0,0,0.28)');
          }
          this.bg.size(fit.width, fit.height);
          // Native p$t uses a numeric scale property; Laya Sprite uses a method.
          if (typeof this.bg.scale === 'function') this.bg.scale(fit.scale, fit.scale);
          else this.bg.scale = fit.scale;
          this.bg.posInteger(fit.x, fit.y);
          if (choice.skinMotion) b.motion?.layout(w, h);
          else if (b.motion) b.motion.layout(containBackground(choice.dynamic.width, choice.dynamic.height, w, h));
          b.syncMotion();
          return result;
        });
      }
      if (typeof scene.OnWeatherWallPaperChange === 'function') local.patch(scene, 'OnWeatherWallPaperChange', original => function (...args) {
        b.hideFill?.(); return Reflect.apply(original, this, args);
      });
      const apply = () => {
        if (localId !== undefined && laya.loader.getRes && !laya.loader.getRes(choice.url)) {
          // Native background changes can evict textures that were unused during a skill.
          this.detach(false); this.ready = null; this.refresh(); return;
        }
        b.writing = true;
        try { scene.SetWallPaperByUrl(choice.url); b.applied = true; layer?.updateBgSize(); }
        finally { b.writing = false; }
      };
      local.patch(scene, 'SetWallPaperByUrl', original => function (...args) {
        if (!b.writing) { b.yielded = true; registry.yieldedScene = scene; b.hideFill?.(); registry.state('技能背景优先'); }
        return Reflect.apply(original, this, args);
      });
      local.patch(scene, 'SetWallPaperById', original => function (...args) {
        if (args[1]) { b.yielded = true; registry.yieldedScene = scene; b.hideFill?.(); return Reflect.apply(original, this, args); }
        if (eligible()) { apply(); return; }
        return Reflect.apply(original, this, args);
      });
      local.patch(scene, 'OnNormalWallPaperChange', original => function (...args) {
        b.yielded = false; registry.yieldedScene = null;
        if (eligible()) { apply(); return; }
        return Reflect.apply(original, this, args);
      });
      // Laya keeps the method reference captured when the scene subscribed.
      // Retarget only that exact existing handler; never remove/re-add listeners.
      const dispatcher = this.game.getDispatcher?.();
      const event = dispatcher?.constructor?.BACKGROUND_USEDID_GOT || 'BACKGROUND_USEDID_GOT';
      const entries = dispatcher?._events?.[event];
      for (const handler of Array.isArray(entries) ? entries : [entries]) {
        if (handler?.caller === scene && handler.method === originalById) {
          // Keep identical function identity so native off(event, scene,
          // scene.SetWallPaperById) can still remove it during scene teardown.
          const redirected = scene.SetWallPaperById;
          handler.method = redirected;
          local.add(() => {
            if (handler.caller === scene && handler.method === redirected) handler.method = originalById;
          });
        }
      }
      if (!b.yielded) scene.onWallPaperChange();
      const playSkinMotion = choice.skinMotion && !this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if ((choice.dynamic || playSkinMotion) && choice.animated !== false) {
        const motionScope = new ResourceScope(); local.add(() => motionScope.dispose());
        const fail = message => {
          if (local.closed) return;
          b.motionError = message; motionScope.dispose(); b.motion = null;
          this.refresh();
        };
        try {
          const options = { window: this.window, layer, scope: motionScope,
            ready: () => { if (!local.closed) this.refresh(); }, fail };
          b.motion = choice.skinMotion ? createSkinBackgroundMotion({ ...options,
            load: signal => this.skinMotion?.(choice.skinKey, signal, { imageUrl: this.localImage?.objectUrl, quality: skinQuality }),
            imageUrl: this.localImage?.objectUrl })
            : createBackgroundMotion({ ...options, spec: choice.dynamic, size: choice.dynamic });
          if (motionScope.closed) b.motion = null;
          if (b.motion && supportsSkinBackgroundAttack(choice.dynamic)) {
            b.syncAttackSeat = watchBackgroundAttack(this.game, scene, motionScope, () => {
              if (eligible() && layer.bg?.skin === choice.url) b.motion?.playAttack?.();
            });
          }
          layer.updateBgSize();
        } catch (error) { fail(error?.stack || String(error)); }
      }
    }
    if (scene.currentWeatherWallPaper || this.binding.yielded) this.binding.hideFill?.();
    else this.binding.syncMotion();
    const b = this.binding;
    if (b.motion) b.syncAttackSeat?.(choice.attackEffects !== false);
    this.state(scene.currentWeatherWallPaper || b.yielded ? '技能背景优先'
      : b.motionError ? '动态背景失败，已显示静态原画：' + b.motionError
      : b.motion?.unsuitableSize ? '当前窗口比例不适合动态构图，已显示静态原画'
      : b.motion ? (b.motion.loaded ? '动态牌局背景已启用' : '正在加载动态背景，暂显静态原画')
      : '静态牌局背景已启用');
  }
}
