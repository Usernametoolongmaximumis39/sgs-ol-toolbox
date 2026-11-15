import { ResourceScope } from './resources.js';
import { createBackgroundMotion } from './background-motion.js';

export function containBackground(width, height, viewportWidth, viewportHeight) {
  if (![width, height, viewportWidth, viewportHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(viewportWidth / width, viewportHeight / height);
  return { width, height, scale, x: (viewportWidth - width * scale) / 2, y: (viewportHeight - height * scale) / 2 };
}

function findBackgroundLayer(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed) continue;
    if (node.bgSprite && typeof node.updateBgSize === 'function' && typeof node.bgLoadComplete === 'function' && typeof node.O === 'function') return node;
    if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return null;
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
    result.dynamic = Object.freeze({ kind: d.kind, url: dynamicUrl.replace(/\/$/, ''), width: d.width, height: d.height, modern: d.modern === true, parts: Object.freeze([...(d.parts || [])]) });
  }
  result.animated = value.animated !== false;
  return Object.freeze(result);
}

// Only the current battle instance is wrapped. Native weather, URL-based skill
// backgrounds and SpecialBackground children (notably Pei Xiu) keep ownership.
export class BackgroundRegistry {
  constructor({ window, game, settings, scope }) {
    Object.assign(this, { window, game, settings, scope });
    this.providers = new Set(); this.listeners = new Set(); this.binding = null;
    this.ready = null; this.loading = null; this.failed = null; this.ticket = 0;
    this.status = '跟随游戏背景';
    scope.interval(() => this.refresh(), 500);
    scope.add(() => { this.detach(true); this.ticket++; this.listeners.clear(); });
  }
  get current() { return this.settings.get('battleBackground', null); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(); } catch { /* subscriber isolation */ } } }
  state(text) { if (this.status !== text) { this.status = text; this.emit(); } }
  register(owner) {
    if (this.providers.has(owner)) throw new Error('背景提供方已注册');
    this.providers.add(owner); this.refresh();
    let active = true;
    return () => { if (!active) return; active = false; this.providers.delete(owner); this.retryAt = 0; this.loadAttempts = 0; this.refresh(); };
  }
  select(owner, spec) {
    if (!this.providers.has(owner)) throw new Error('背景提供方未启用');
    this.yieldedScene = this.binding?.yielded ? this.binding.scene : this.yieldedScene;
    this.settings.set('battleBackground', spec ? { ...backgroundSpec(spec), owner } : null);
    this.ticket++; this.ready = this.loading = this.failed = null;
    this.retryAt = 0; this.loadAttempts = 0;
    this.detach(true); this.refresh(); this.emit();
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
    const choice = this.current;
    if (!choice || !this.providers.has(choice.owner)) {
      this.ticket++; this.ready = this.loading = null; this.detach(true);
      this.state(choice ? '背景插件已停用，跟随游戏背景' : '跟随游戏背景'); return;
    }
    try { backgroundSpec(choice); }
    catch (error) { this.detach(true); this.state('背景配置无效：' + error.message); return; }
    const scene = this.game.getScene();
    if (this.binding?.scene !== scene) this.detach(false);
    if (this.binding && (this.binding.layer.destroyed || this.binding.stage !== this.window.Laya?.stage)) this.detach(false);
    if (!this.game.isInGame() || !['SetWallPaperById', 'SetWallPaperByUrl', 'OnNormalWallPaperChange', 'onWallPaperChange'].every(k => typeof scene?.[k] === 'function')) {
      this.detach(false); this.state('已保存，等待进入牌局'); return;
    }
    const laya = this.window.Laya;
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
        laya.loader.load(choice.url, laya.Handler.create(null, texture => {
          if (ticket !== this.ticket || this.scope.closed) return;
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
    if (!this.binding) {
      const layer = findBackgroundLayer(laya?.stage);
      const context = this.window.SystemContext;
      if (!layer || !laya.Sprite || !laya.Rectangle || !(context?.gameWidth > 0 && context?.gameHeight > 0)) {
        this.state('等待游戏背景层与布局就绪'); return;
      }
      const local = new ResourceScope(), b = { scene, layer, stage: laya.stage, scope: local, applied: false, yielded: this.yieldedScene === scene, writing: false };
      this.binding = b;
      const registry = this;
      const originalById = scene.SetWallPaperById;
      const eligible = () => !scene.currentWeatherWallPaper && !b.yielded;
      b.syncMotion = () => {
        const visible = eligible() && layer.bg?.skin === choice.url;
        b.motion?.show(visible);
      };
      if (layer) {
        const fill = new laya.Sprite();
        local.add(() => fill.destroy(true));
        fill.name = 'sgs-background-edge-fill'; fill.mouseEnabled = false; fill.mouseChildren = false;
        fill.zOrder = (layer.bgSprite.zOrder || 0) - 1;
        layer.addChildAt(fill, Math.max(0, layer.getChildIndex(layer.bgSprite)));
        const soften = new laya.Sprite(); soften.mouseEnabled = false; fill.addChild(soften);
        if (laya.BlurFilter) soften.filters = [new laya.BlurFilter(18)];
        b.hideFill = () => { fill.visible = false; b.motion?.show(false); };
        let fillKey = '';
        local.patch(layer, 'updateBgSize', original => function (...args) {
          const result = Reflect.apply(original, this, args);
          fill.visible = eligible() && this.bg?.skin === choice.url;
          b.syncMotion();
          if (!fill.visible) return result;
          const size = registry.imageSize;
          // Preserve the entire illustration; cover cropping can remove the head.
          // Native game coordinates already
          // exclude the root's gameScale. Stage dimensions would scale twice.
          const context = registry.window.SystemContext;
          const fit = containBackground(size?.width, size?.height, context?.gameWidth, context?.gameHeight);
          if (!fit) { fill.visible = false; return result; }
          const w = context.gameWidth, h = context.gameHeight;
          const key = `${w}:${h}`;
          if (key !== fillKey) {
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
          if (b.motion) b.motion.layout(containBackground(choice.dynamic.width, choice.dynamic.height, w, h));
          return result;
        });
      }
      if (typeof scene.OnWeatherWallPaperChange === 'function') local.patch(scene, 'OnWeatherWallPaperChange', original => function (...args) {
        b.hideFill?.(); return Reflect.apply(original, this, args);
      });
      const apply = () => {
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
      if (choice.dynamic && choice.animated !== false) {
        const motionScope = new ResourceScope(); local.add(() => motionScope.dispose());
        const fail = message => {
          if (local.closed) return;
          b.motionError = message; motionScope.dispose(); b.motion = null;
          this.refresh();
        };
        try {
          b.motion = createBackgroundMotion({ window: this.window, layer, spec: choice.dynamic, size: choice.dynamic, scope: motionScope,
            ready: () => { if (!local.closed) this.refresh(); }, fail });
          if (motionScope.closed) b.motion = null;
          layer.updateBgSize();
        } catch (error) { fail(error?.stack || String(error)); }
      }
    }
    if (scene.currentWeatherWallPaper || this.binding.yielded) this.binding.hideFill?.();
    else this.binding.syncMotion();
    const b = this.binding;
    this.state(scene.currentWeatherWallPaper || b.yielded ? '技能背景优先'
      : b.motionError ? '动态背景失败，已显示静态原画：' + b.motionError
      : b.motion ? (b.motion.loaded ? '动态牌局背景已启用' : '正在加载动态背景，暂显静态原画')
      : '静态牌局背景已启用');
  }
}
