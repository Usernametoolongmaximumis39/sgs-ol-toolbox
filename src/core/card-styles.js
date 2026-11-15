import { ResourceScope } from './resources.js';
import { validateCardAtlas, loadCardAtlas, cardFrameName } from './card-atlas.js';

const COLOR = /^#[0-9a-f]{6}$/i;
const own = (node, key) => node && Object.getOwnPropertyDescriptor(node, key)?.value;
const CARD_LISTS = ['_children','cardUis','cardUIs','cardUiList','cardUIList','virtualCardUis','tempHandCardUis','additionalCardUis','muniuCardUis','stateCardUis','pileCardUis','seatUIs'];
const CARD_NODES = ['cardContainer','seatContainer','SelfSeatUi','selfSeatUI','desktopCardContainer','discardCardContainer','cardUi','cardUI'];
const isCardUI = node => node && !node.destroyed && node.bmpFace && typeof node.SetCardFace === 'function'
  && typeof node.getCardFaceBaseTexture === 'function' && typeof node.updateNewCardFace === 'function';

// The official loader stores atlas subtextures separately from bitmap resources.
// Borrow only; neither resize nor destroy a game-owned texture.
export function findNativeCardTexture(L, name) {
  if (!/^card(?:Face|Back)_\d{1,5}$/.test(name)) return null;
  const valid = t => t?.bitmap && !t.destroyed && !t.bitmap.destroyed && t.width > 0 && t.height > 0;
  const direct = L?.loader?.getRes?.(name);
  if (valid(direct)) return direct;
  for (const cache of [L?.Loader?.textureMap, L?.Loader?.loadedMap, L?.Loader?._loadedMap]) {
    for (const key of Object.keys(cache || {}).slice(0, 60000)) {
      if (key.split('?')[0].split('/').at(-1) !== name + '.png') continue;
      const texture = cache[key]?.bitmap ? cache[key] : L?.loader?.getRes?.(key);
      if (valid(texture)) return texture;
    }
  }
  return null;
}

// One core-owned drawing path serves the native texture and the settings preview.
export function drawCardStyle(doc, palette, back = false) {
  const canvas = doc.createElement('canvas'); canvas.width = 186; canvas.height = 260;
  const c = canvas.getContext('2d');
  const gradient = c.createLinearGradient(0, 0, 186, 260);
  gradient.addColorStop(0, palette.light); gradient.addColorStop(.48, palette.base); gradient.addColorStop(1, palette.light);
  c.fillStyle = gradient; c.fillRect(0, 0, 186, 260);
  c.strokeStyle = palette.edge; c.lineWidth = 3; c.strokeRect(3, 3, 180, 254);
  c.lineWidth = 1; c.strokeRect(9, 9, 168, 242);
  if (back) {
    c.fillStyle = palette.ink; c.fillRect(15, 15, 156, 230);
    c.strokeStyle = palette.base; c.globalAlpha = .25;
    for (let x = -230; x < 190; x += 16) { c.beginPath(); c.moveTo(Math.max(16,x), Math.max(16,16-x)); c.lineTo(Math.min(170,x+230), Math.min(244,244+x)); c.stroke(); }
    c.globalAlpha = 1; c.lineWidth = 2;
    c.beginPath(); c.moveTo(93, 60); c.lineTo(145, 130); c.lineTo(93, 200); c.lineTo(41, 130); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(93,130,32,0,Math.PI*2); c.stroke();
    c.fillStyle = palette.light; c.font = 'bold 35px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('杀',93,131);
  } else {
    // Light centre keeps the game's black/red ranks and original illustrations legible.
    c.fillStyle = palette.light; c.globalAlpha = .65; c.fillRect(13, 13, 160, 234); c.globalAlpha = 1;
    for (const [x,y,dx,dy] of [[15,15,1,1],[171,15,-1,1],[15,245,1,-1],[171,245,-1,-1]]) {
      c.beginPath(); c.moveTo(x,y+dy*16); c.lineTo(x,y); c.lineTo(x+dx*16,y); c.stroke();
    }
  }
  return canvas;
}

export class CardStyleRegistry {
  constructor({ window: win, document: doc, game, settings, scope }) {
    Object.assign(this, { win, doc, game, settings, scope });
    this.styles = new Map(); this.listeners = new Set(); this.textures = new Map(); this.bindings = new Map();
    this.nativeResources = new Map(); this.nativeAttempts = new Map(); this.previews = new WeakMap();
    this.factories = new Map(); this.pools = new Map();
    this.insertions = new Map();
    this.selfModels = new WeakSet(); this.selfIds = new Set(); this.selfHand = null;
    this.scene = null;
    this.atlases = new Map(); this.backImages = new Map();
    this.status = '跟随游戏原始外观'; this.closed = false;
    scope.interval(() => this.refreshNative(), 400);
    if (game.onSceneChange) scope.add(game.onSceneChange(() => this.refreshNative()));
    scope.add(() => { this.closed = true; this.restore(); this.clearTextures(); this.nativeResources.clear(); this.nativeAttempts.clear(); this.listeners.clear(); });
  }
  register(style, owner) {
    if (this.closed) return () => {};
    if (!style?.id?.startsWith(owner + '.') || !/^[a-z][a-z0-9.-]{0,63}$/.test(style.id) || this.styles.has(style.id)) throw new Error('卡牌样式 ID 无效或已注册');
    if (typeof style.name !== 'string' || !style.name.trim() || style.name.length > 48) throw new Error('卡牌样式名称无效');
    if (style.backName !== undefined && (typeof style.backName !== 'string' || !style.backName.trim() || style.backName.length > 48 || /[\r\n]/.test(style.backName))) throw new Error('卡背名称无效');
    const cleaned = { id: style.id, name: style.name, ...(style.backName === undefined ? {} : { backName: style.backName }) };
    if (style.atlas) {
      if (style.native || style.face || style.back) throw new Error('完整卡图与底纹不能混用');
      cleaned.atlas = validateCardAtlas(style.atlas);
    } else if (style.native) {
      if (style.face || style.back || !/^cardFace_\d{1,5}$/.test(style.native.face) || !/^cardBack_\d{1,5}$/.test(style.native.back)) throw new Error('原生卡牌资源名称无效');
      cleaned.native = Object.freeze({ face: style.native.face, back: style.native.back });
    } else for (const side of ['face', 'back']) {
      cleaned[side] = {};
      for (const key of ['base','light','edge','ink']) {
        if (!COLOR.test(style[side]?.[key])) throw new Error('卡牌样式颜色须为六位十六进制值');
        cleaned[side][key] = style[side][key];
      }
      Object.freeze(cleaned[side]);
    }
    this.styles.set(style.id, Object.freeze(cleaned)); this.refreshNative(); this.emit();
    let released = false;
    return () => { if (released) return; released = true; this.styles.delete(style.id); this.restore(); this.clearTextures(style.id); this.refreshNative(); this.emit(); };
  }
  list() { return [...this.styles.values()]; }
  get current() { return this.settings.get('cardStyle', ''); }
  get selection() { return { face: this.settings.get('cardFaceStyle', this.current), back: this.settings.get('cardBackStyle', this.current), scope: this.settings.get('cardStyleScope', 'all') }; }
  selectSide(side, id) {
    if (!['face', 'back'].includes(side)) throw new Error('无效卡牌面');
    if (id && !this.styles.has(id)) throw new Error('卡牌样式尚未启用');
    if (side === 'back' && this.styles.get(id)?.atlas && !this.styles.get(id).atlas.backImage) throw new Error('此套装仅提供卡面');
    this.settings.set(side === 'face' ? 'cardFaceStyle' : 'cardBackStyle', id);
    this.restore(); this.refreshNative(); this.emit();
  }
  selectScope(value) {
    if (!['self', 'all'].includes(value)) throw new Error('无效应用范围');
    this.settings.set('cardStyleScope', value); this.restore(); this.refreshNative(); this.emit();
  }
  cardId(card) { return card?.CardId ?? card?.CardID ?? card?.id; }
  rememberSelf(card) {
    if (!card || typeof card !== 'object') return;
    this.selfModels.add(card); const id = this.cardId(card);
    if (Number.isInteger(id) && id > 0) this.selfIds.add(id);
  }
  isSelfCard(ui) {
    const card = ui.theCard;
    if (this.selfHand?.cardUis?.includes(ui) || this.selfHand?.cardUIs?.includes(ui) || this.selfHand?.cardUiList?.includes(ui)) this.rememberSelf(card);
    return this.selfModels.has(card) || this.selfIds.has(this.cardId(card));
  }
  select(id) {
    if (id && !this.styles.has(id)) throw new Error('卡牌样式尚未启用');
    this.settings.set('cardStyle', id); this.settings.set('cardFaceStyle', id);
    if (!this.styles.get(id)?.atlas || this.styles.get(id).atlas.backImage) this.settings.set('cardBackStyle', id);
    this.restore(); this.refreshNative(); this.emit();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.warn('[卡牌样式]',e); } } }
  setStatus(value) { if (this.status !== value) { this.status = value; this.emit(); } }
  clearTextures(id) {
    for (const [key, image] of this.backImages) if (!id || key === id) { image.onload = image.onerror = null; image.src = ''; this.backImages.delete(key); }
    for (const [key, entry] of this.atlases) if (!id || key === id) {
      entry.controller.abort(); entry.data?.dispose(); this.atlases.delete(key);
    }
    for (const [key, texture] of this.textures) if (!id || key.startsWith(id + ':')) { texture.destroy(true); this.textures.delete(key); }
  }
  ensureAtlas(style) {
    if (this.atlases.has(style.id)) return this.atlases.get(style.id);
    const controller = new AbortController(), entry = { controller, data: null, error: '', loading: true };
    this.atlases.set(style.id, entry);
    const timer = setTimeout(() => controller.abort(), 20000);
    loadCardAtlas(this.win, style.atlas, controller.signal).then(data => {
      if (this.closed || this.atlases.get(style.id) !== entry || controller.signal.aborted) { data.dispose(); return; }
      entry.data = data;
    }).catch(error => {
      if (this.atlases.get(style.id) === entry) entry.error = controller.signal.aborted ? '卡图加载超时或已取消' : error.message;
    }).finally(() => {
      clearTimeout(timer); entry.loading = false;
      if (!this.closed && this.atlases.get(style.id) === entry) { this.refreshNative(); this.emit(); }
    });
    return entry;
  }
  retry() {
    const id = this.selection.face;
    if (!this.atlases.get(id)?.error) return;
    this.clearTextures(id); this.refreshNative(); this.emit();
  }
  atlasCanvas(style, name) {
    const data = this.atlases.get(style.id)?.data, frame = data?.frames.get(cardFrameName(name));
    if (!frame) return null;
    const canvas = this.doc.createElement('canvas'); canvas.width = frame.w; canvas.height = frame.h;
    canvas.getContext('2d').drawImage(data.pages[frame.idx], frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    return canvas;
  }
  atlasTexture(style, ui, size) {
    // Exact resource identity only. Never alias activity/Guozhan variants to a
    // similar ordinary card, and preserve native special rendering paths.
    // IsSkillChangeStatus controls native tags, not the card illustration.
    // IsYiCard only changes the native legacy-card path; the new-card path
    // still uses ResName. Neither flag is evidence that exact art is unsafe.
    if (ui.isNewCardUI !== true && ui.IsYiCard) return null;
    const name = ui.theCard?.ResName, frame = cardFrameName(name);
    if (!frame) return null;
    if (style.atlas.replaceCards && !style.atlas.replaceCards.includes(name)) return null;
    const width = size?.width || 93, height = size?.height || 130;
    const key = style.id + ':card:' + frame + ':' + width + 'x' + height;
    if (!this.textures.has(key)) {
      const canvas = this.atlasCanvas(style, name); if (!canvas) return null;
      const bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height); bitmap.loadImageSource(canvas);
      const texture = new this.win.Laya.Texture(bitmap);
      // Keep every source pixel on the GPU while preserving the native UI's
      // logical dimensions, including Graphics.drawTexture's size ratios.
      texture.width = texture.sourceWidth = width; texture.height = texture.sourceHeight = height;
      this.textures.set(key, texture);
    }
    return this.textures.get(key);
  }
  nativeTexture(name, immediate = false) {
    const cached = this.nativeResources.get(name);
    if (cached && !cached.destroyed && !cached.bitmap?.destroyed) return cached;
    this.nativeResources.delete(name);
    if (!immediate && Date.now() - (this.nativeAttempts.get(name) || 0) < 1000) return null;
    this.nativeAttempts.set(name, Date.now());
    let texture;
    try { texture = findNativeCardTexture(this.win.Laya, name); } catch { return null; }
    if (texture) this.nativeResources.set(name, texture);
    return texture;
  }
  preview(style, back) {
    if (style.atlas) {
      if (back) {
        if (!style.atlas.backImage) return null;
        const image = this.doc.createElement('img'); image.src = style.atlas.backImage;
        image.alt = ''; image.width = 135; image.height = 190; return image;
      }
      if (style.atlas.previewImage) {
        const image = this.doc.createElement('img'); image.src = style.atlas.previewImage;
        image.alt = ''; image.width = 135; image.height = 190; return image;
      }
      return this.atlasCanvas(style, style.atlas.preview);
    }
    if (!style.native) return drawCardStyle(this.doc, back ? style.back : style.face, back);
    const texture = this.nativeTexture(style.native[back ? 'back' : 'face']);
    if (!texture?.getTexturePixels) return null;
    try {
      let original = this.previews.get(texture);
      if (!original) {
        const width = Math.ceil(texture.sourceWidth || texture.width), height = Math.ceil(texture.sourceHeight || texture.height);
        if (width < 1 || height < 1 || width > 1024 || height > 1024) return null;
        const pixels = texture.getTexturePixels(0, 0, width, height);
        if (!pixels || pixels.length !== width * height * 4) return null;
        original = this.doc.createElement('canvas'); original.width = width; original.height = height;
        const c = original.getContext('2d'), data = c.createImageData(width, height); data.data.set(pixels); c.putImageData(data, 0, 0);
        this.previews.set(texture, original);
      }
      const canvas = this.doc.createElement('canvas'); canvas.width = original.width; canvas.height = original.height;
      canvas.getContext('2d').drawImage(original, 0, 0); return canvas;
    } catch { return null; }
  }
  texture(style, back, immediate = false) {
    if (style.atlas) {
      if (!back || !style.atlas.backImage) return null;
      let image = this.backImages.get(style.id);
      if (!image) {
        image = new this.win.Image(); this.backImages.set(style.id, image);
        image.onload = () => { if (!this.closed && this.backImages.get(style.id) === image) { this.refreshNative(); this.emit(); } };
        image.src = style.atlas.backImage;
      }
      if (!image.complete || image.naturalWidth !== 405 || image.naturalHeight !== 570) return null;
      const key = style.id + ':back';
      if (!this.textures.has(key)) {
        const bitmap = new this.win.Laya.Texture2D(405, 570); bitmap.loadImageSource(image);
        const texture = new this.win.Laya.Texture(bitmap);
        texture.width = texture.sourceWidth = 93; texture.height = texture.sourceHeight = 130;
        this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    if (style.native) return this.nativeTexture(style.native[back ? 'back' : 'face'], immediate);
    const key = style.id + ':' + back;
    if (!this.textures.has(key)) {
      const canvas = drawCardStyle(this.doc, back ? style.back : style.face, back);
      const bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height);
      bitmap.loadImageSource(canvas);
      const texture = new this.win.Laya.Texture(bitmap); texture.width = 93; texture.height = 130;
      this.textures.set(key, texture);
    }
    return this.textures.get(key);
  }
  restore() {
    for (const local of [...this.factories.values(), ...this.pools.values(), ...this.insertions.values()]) local.dispose();
    this.factories.clear(); this.pools.clear(); this.insertions.clear();
    for (const b of this.bindings.values()) b.release(); this.bindings.clear();
  }
  bindCard(ui, immediate = false) {
    if (this.closed || !['face','back'].some(side => this.styles.has(this.selection[side])) || !isCardUI(ui)) return;
    if (!this.bindings.has(ui)) {
      const local = new ResourceScope(), binding = { original: ui.bmpFace.texture, applied: null, layers: new Map() };
      const flush = node => { if (node?.render && typeof node.update === 'function') node.update(); };
      binding.restoreLayers = () => {
        for (const [node, visible] of binding.layers) if (!node.destroyed && node.visible === false) { node.visible = visible; flush(node); }
        binding.layers.clear();
      };
      binding.apply = force => {
        const card = ui.theCard, style = this.styles.get(this.selection[card?.IsEmpty ? 'back' : 'face']);
        const eligible = style && card && (this.selection.scope === 'all' || this.isSelfCard(ui)) && !ui.isPokerCardFace && !ui.dontUpdateCard
          && (card.IsEmpty || ui.isNewCardUI === true || style.atlas);
        if (ui.bmpFace.texture !== binding.applied) binding.original = ui.bmpFace.texture;
        // Native fO.texture adopts the incoming texture's dimensions while
        // auto-sized. Preserve the current UI/native dimensions, including
        // mobile/skill-window sizes; never resize a shared official texture.
        const dimension = (...values) => values.find(value => Number.isFinite(value) && value > 0 && value <= 4096);
        const size = { width: dimension(ui.width, binding.original?.width, ui.bmpFace.width),
          height: dimension(ui.height, binding.original?.height, ui.bmpFace.height) };
        const texture = eligible && !binding.special
          ? style.atlas && !card.IsEmpty ? this.atlasTexture(style, ui, size) : this.texture(style, Boolean(card.IsEmpty), force) : null;
        binding.reason = !style ? '跟随游戏' : !eligible ? '范围或原生显示限制' : binding.special ? '原生指定特殊卡图'
          : texture ? '' : ui.isNewCardUI !== true && ui.IsYiCard ? '异牌专用卡图'
          : style.atlas?.replaceCards && !style.atlas.replaceCards.includes(card?.ResName)
            && this.atlases.get(style.id)?.data?.frames.has(cardFrameName(card?.ResName)) ? '与默认卡面相同，保留原生'
          : style.atlas ? `无同名卡图：${String(card?.ResName || '空资源名').slice(0,96)}` : '资源未就绪';
        if (!texture) { if (ui.bmpFace.texture === binding.applied) ui.bmpFace.texture = binding.original; binding.applied = null; binding.restoreLayers(); return; }
        if (style.atlas) for (const key of ['bmpFace2','bmpName','bmpNameBg','bmpNormalName','bmpCardType','bmpSmallDesc']) {
          const node = ui[key]; if (!node) continue;
          if (!binding.layers.has(node)) binding.layers.set(node, node.visible);
          if (node.visible !== false) { node.visible = false; flush(node); }
        }
        binding.applied = texture;
        binding.inApply = true;
        try {
          const dirty = ui.bmpFace.texture !== texture || ui.bmpFace.invalidateUpdateFlag === true;
          ui.bmpFace.texture = texture; if (dirty) flush(ui.bmpFace);
        } finally { binding.inApply = false; }
      };
      const registry = this;
      // Some native state/skill refreshes assign the face directly rather than
      // calling SetCardFace. Intercept only this owned bitmap instance.
      const bitmap = ui.bmpFace, ownTexture = Object.getOwnPropertyDescriptor(bitmap, 'texture');
      let textureOwner = bitmap, descriptor = ownTexture;
      while (!descriptor && (textureOwner = Object.getPrototypeOf(textureOwner))) descriptor = Object.getOwnPropertyDescriptor(textureOwner, 'texture');
      if (descriptor?.get && descriptor?.set && ownTexture?.configurable !== false) {
        const get = function () { return descriptor.get.call(this); };
        const set = function (value) {
          let ordinary = value === binding.original || value === binding.applied;
          if (!ordinary && !binding.inNative && !binding.inApply && !binding.special && !registry.closed) {
            try { ordinary = value === ui.getCardFaceBaseTexture(ui.theCard?.Seat || null); } catch { /* Keep unknown special art native. */ }
          }
          descriptor.set.call(this, value);
          if (binding.inNative || binding.inApply || binding.special || registry.closed) return;
          binding.original = value; binding.applied = null;
          if (!ordinary) { binding.special = true; binding.restoreLayers(); return; }
          registry.applySafely(binding, true);
        };
        Object.defineProperty(bitmap, 'texture', { configurable: true, enumerable: descriptor.enumerable, get, set });
        local.add(() => {
          if (Object.getOwnPropertyDescriptor(bitmap, 'texture')?.set !== set) return;
          if (ownTexture) Object.defineProperty(bitmap, 'texture', ownTexture); else delete bitmap.texture;
        });
      }
      local.patch(ui, 'SetCardFace', original => function (...args) {
        binding.restoreLayers(); binding.special = false;
        let result; binding.inNative = true;
        try {
          if (this.bmpFace.texture === binding.applied) this.bmpFace.texture = binding.original;
          result = original.apply(this, args);
        } finally { binding.inNative = false; }
        binding.original = this.bmpFace.texture; binding.applied = null;
        registry.applySafely(binding, true); return result;
      });
      local.patch(ui, 'updateNewCardFace', original => function (...args) {
        binding.restoreLayers(); const result = original.apply(this, args);
        if (!binding.inNative) registry.applySafely(binding, true); return result;
      });
      for (const key of ['layout','SetActualSize','Draw']) if (typeof ui[key] === 'function') local.patch(ui, key, original => function (...args) {
        const result = original.apply(this, args);
        if (!binding.inNative && !binding.inApply) registry.applySafely(binding, true);
        return result;
      });
      for (const key of ['UpdateCardFaceRes','UpdateCardFaceOrBackRes','UpdatePokerCardFace','Clear']) if (typeof ui[key] === 'function') local.patch(ui, key, original => function (...args) {
        binding.restoreLayers(); binding.special = true;
        if (this.bmpFace.texture === binding.applied) this.bmpFace.texture = binding.original;
        binding.applied = null; const result = original.apply(this, args);
        binding.original = this.bmpFace.texture; return result;
      });
      binding.release = () => { local.dispose(); binding.restoreLayers(); if (!ui.destroyed && ui.bmpFace?.texture === binding.applied) ui.bmpFace.texture = binding.original; };
      this.bindings.set(ui, binding);
      // Actual NormalCardUi pool instances (Kk/Xk), not global prototypes.
      const type = ui.constructor;
      for (const key of ['pool', 'flatPool']) {
        const pool = own(type, key);
        if (pool?.T === type && typeof pool.BorrowObject === 'function') this.hookPool(pool);
      }
    }
    this.applySafely(this.bindings.get(ui), immediate);
  }
  applySafely(binding, immediate) {
    try { binding.apply(immediate); binding.error = ''; }
    catch (error) { binding.error = error.message; binding.reason = '纹理应用失败：' + error.message; this.setStatus('卡牌外观未应用：' + error.message); }
  }
  captureCard(card) {
    try { this.bindCard(card, true); }
    catch (error) { this.setStatus('卡牌外观未应用：' + error.message); }
    return card;
  }
  hookPool(pool) {
    if (this.pools.has(pool)) return;
    const local = new ResourceScope(), registry = this; this.pools.set(pool, local);
    local.patch(pool, 'BorrowObject', original => function (...args) {
      return registry.captureCard(original.apply(this, args));
    });
    if (typeof pool.returnObject === 'function') local.patch(pool, 'returnObject', original => function (card, ...args) {
      registry.bindings.get(card)?.release(); registry.bindings.delete(card);
      return original.call(this, card, ...args);
    });
  }
  hookFactory(owner) {
    if (this.factories.has(owner) || typeof owner.createNormalCardUi !== 'function') return;
    const local = new ResourceScope(), registry = this; this.factories.set(owner, local);
    // Native callers draw/insert the returned UI only after this method returns.
    local.patch(owner, 'createNormalCardUi', original => function (...args) {
      if (this === registry.selfHand) registry.rememberSelf(args[0]);
      else if (own(this, 'seat') && Array.isArray(own(this, 'cardUis'))) {
        registry.selfModels.delete(args[0]); registry.selfIds.delete(registry.cardId(args[0]));
      }
      return registry.captureCard(original.apply(this, args));
    });
    for (const key of ['PrivateUpdateCardUis','StartSelectCard','EndSelectCard','ShowVirtualCards','ShowVirtualCardInfos','ShowOutsideCard','HideHandCards','RestoreHandCards','DrawCard']) {
      if (typeof owner[key] !== 'function') continue;
      local.patch(owner, key, original => function (...args) {
        registry.captureBranch(this);
        const result = original.apply(this, args);
        registry.captureBranch(this); return result;
      });
    }
  }
  captureBranch(root) {
    const queue=[root],seen=new Set();
    for(let i=0;i<queue.length&&i<6000;i++){
      const node=queue[i];if(!node||typeof node!=='object'||seen.has(node)||node.destroyed)continue;seen.add(node);
      this.hookFactory(node);if(isCardUI(node))this.captureCard(node);
      for(const key of CARD_LISTS){const value=own(node,key);if(Array.isArray(value))queue.push(...value.slice(0,2048));}
      for(const key of CARD_NODES){const value=own(node,key);if(value)queue.push(value);}
    }
  }
  watchInsertions() {
    // Stage, current scene and the existing first two display-layer levels.
    // Patch instances only; a newly attached window is scanned before return.
    const roots=new Set([this.win.Laya?.stage,this.game.getScene?.()]);
    let level=[this.win.Laya?.stage];
    for(let depth=0;depth<2;depth++){
      const next=[];for(const parent of level){const children=own(parent,'_children');if(Array.isArray(children))for(const child of children.slice(0,64)){if(roots.size>=160)break;roots.add(child);next.push(child);}}
      level=next;
    }
    for(const [node,local]of this.insertions)if(!roots.has(node)||node.destroyed){local.dispose();this.insertions.delete(node);}
    const registry=this;
    for(const node of roots){if(!node||node.destroyed||this.insertions.has(node))continue;
      const local=new ResourceScope();this.insertions.set(node,local);
      for(const key of ['addChild','addChildAt'])if(typeof node[key]==='function')local.patch(node,key,original=>function(child,...args){
        const result=original.call(this,child,...args);registry.captureBranch(child);return result;
      });
    }
  }
  discover() {
    // Only display children and the known flat-card containers; never walk models/getters.
    const queue = [this.win.Laya?.stage, this.game.getScene?.(), this.game.getSelfSeatUI?.()], seen = new Set(), found = new Set();
    for (let i = 0; i < queue.length && i < 6000; i++) {
      const node = queue[i]; if (!node || typeof node !== 'object' || seen.has(node) || node.destroyed) continue; seen.add(node);
      this.hookFactory(node);
      if (isCardUI(node)) found.add(node);
      for (const key of CARD_LISTS) { const a = own(node,key); if (Array.isArray(a)) queue.push(...a.slice(0,2048)); }
      for (const key of CARD_NODES) { const value = own(node,key); if (value) queue.push(value); }
    }
    for (const [owner, local] of this.factories) if (!seen.has(owner)) { local.dispose(); this.factories.delete(owner); }
    return found;
  }
  refreshNative() {
    if (this.closed) return;
    for (const id of this.backImages.keys()) if (id !== this.selection.back) this.clearTextures(id);
    const selectedAtlas = this.styles.get(this.selection.face);
    for (const id of this.atlases.keys()) if (id !== selectedAtlas?.id && id !== this.selection.back) this.clearTextures(id);
    if (selectedAtlas?.atlas) this.ensureAtlas(selectedAtlas);
    if (this.listeners.size) {
      const before = [...this.nativeResources.values()];
      for (const item of this.styles.values()) if (item.native) for (const name of Object.values(item.native)) this.nativeTexture(name);
      const after = [...this.nativeResources.values()];
      if (before.length !== after.length || after.some((t, i) => t !== before[i])) this.emit();
    }
    const scene = this.game.getScene?.();
    if (scene !== this.scene) { this.scene = scene; this.selfModels = new WeakSet(); this.selfIds.clear(); }
    this.selfHand = this.game.getSelfSeatUI?.()?.cardContainer;
    for (const ui of this.selfHand?.cardUis || this.selfHand?.cardUIs || this.selfHand?.cardUiList || []) this.rememberSelf(ui.theCard);
    const style = ['face','back'].some(side => this.styles.has(this.selection[side]));
    if (!style) { this.restore(); this.setStatus(this.current ? '所选套装已停用，当前跟随游戏' : '跟随游戏原始外观'); return; }
    if (!this.win.Laya?.Texture2D || !this.win.Laya?.Texture) { this.setStatus('等待游戏原生渲染器'); return; }
    try {
      this.watchInsertions();
      const found = this.discover();
      for (const [ui,binding] of this.bindings) if (!found.has(ui)) { binding.release(); this.bindings.delete(ui); }
      for (const ui of found) {
        this.bindCard(ui);
      }
      const waiting = ['face','back'].some(side => { const selected = this.styles.get(this.selection[side]); return selected?.native && !this.texture(selected, side === 'back'); });
      const atlas = this.atlases.get(selectedAtlas?.id);
      const prefix = atlas?.error ? '完整卡面加载失败，已保留游戏外观：' + atlas.error : atlas?.loading ? '正在加载完整卡面，当前保留游戏外观' : null;
      const faces = atlas?.data ? [...this.bindings].filter(([ui]) => !ui.theCard?.IsEmpty) : [];
      const applied = faces.filter(([ui,b]) => b.applied && !b.reason && !b.error && ui.bmpFace.texture === b.applied).length;
      const fallback = [...new Set(faces.filter(([,b]) => b.reason).map(([,b]) => b.reason))];
      const detail = atlas?.data ? ` · 完整卡面 R3 已替换 ${applied}/${faces.length}${fallback.length ? ' · 回退：' + fallback.join('；') : ''}` : '';
      this.setStatus(prefix || (waiting ? '等待官方卡面／卡背资源加载，已就绪的面独立应用' : found.size ? `已接入 ${found.size} 张原生卡牌 · 仅本机显示${detail}` : '套装已就绪，等待原生卡牌出现'));
    } catch (error) { this.restore(); this.setStatus('卡牌外观未应用：' + error.message); }
  }
}
