import { LEGACY_CARD_STYLES } from './card-style-ids.js';
import { ResourceScope } from './resources.js';
import { validateCardAtlas, loadCardAtlas, cardFrameName } from './card-atlas.js';
import { LOCAL_BACK_PREFIX, LOCAL_BACK_WIDTH, LOCAL_BACK_HEIGHT, localCardBack, localCardBackTransaction, readLocalCardBack } from './card-back-local.js';
import { isLocalCardImageUrl, localImageTransaction, readLocalCardImage } from './local-images.js';

export const LOCAL_FACE_STYLE = Object.freeze({ id: 'local-card-face', name: '自定义卡面', localFace: true });
export const LOCAL_FACE_BACKGROUND_STYLE = Object.freeze({ id: 'local-card-face-background', localFaceBackground: true });
const LOCAL_FACE_WIDTH = 405, LOCAL_FACE_HEIGHT = 570;
const FACE_BACKGROUND_RECORD = '$background';
const localFaceKey = card => `${LOCAL_FACE_STYLE.id}.${card}`;

const COLOR = /^#[0-9a-f]{6}$/i;
const hasOwn = Object.prototype.hasOwnProperty;
const own = (node, key) => node && (hasOwn.call(node, key) ? Object.getOwnPropertyDescriptor(node, key)?.value : undefined);
const CARD_LISTS = ['_children','cardUis','cardUIs','cardUiList','cardUIList','virtualCardUis','tempHandCardUis','additionalCardUis','muniuCardUis','stateCardUis','pileCardUis','regionCardUIs','seatUIs'];
const CARD_NODES = ['cardContainer','seatContainer','SelfSeatUi','selfSeatUI','desktopCardContainer','discardCardContainer','cardUi','cardUI'];
const isCardUI = node => node && !node.destroyed && node.bmpFace && typeof node.SetCardFace === 'function'
  && typeof node.getCardFaceBaseTexture === 'function' && typeof node.updateNewCardFace === 'function';
const NO_BOOK_FACES = Object.freeze([]);

function flatCardForBitmap(bitmap, event) {
  // NormalCardUi.Draw inserts the individual flat bitmaps, not the CardUi.
  // addCardEvent attaches the face's native mouse handler with the UI as caller.
  const handlers = own(bitmap, '_events')?.[event];
  for (const handler of Array.isArray(handlers) ? handlers : [handlers]) {
    const ui = handler?.caller;
    if (ui?.bmpFace === bitmap && isCardUI(ui)) return ui;
  }
  return null;
}

function nativeCardResourceName(path) {
  return typeof path === 'string' ? /(?:^|\/)(card(?:Face|Back)_\d{1,5})(?:\.png)?(?:\?[^#]*)?$/.exec(path)?.[1] : undefined;
}

function cardBookFaces(node, listType, detailType) {
  if (typeof detailType === 'function' && node instanceof detailType) {
    const ui = own(own(node, 'cardFace'), 'cardUi');
    return isCardUI(ui) ? [ui] : NO_BOOK_FACES;
  }
  if (typeof listType !== 'function' || !(node instanceof listType)) return NO_BOOK_FACES;
  const panel = own(node, 'panel'), count = panel?.numChildren;
  if (!Number.isInteger(count) || count < 1 || typeof panel.getChildAt !== 'function') return NO_BOOK_FACES;
  const result = [];
  for (let i = 0; i < Math.min(count, 2048); i++) {
    const ui = own(own(panel.getChildAt(i), 'cardFace'), 'cardUi');
    if (isCardUI(ui)) result.push(ui);
  }
  return result;
}

// The official loader stores atlas subtextures separately from bitmap resources.
// Borrow only; neither resize nor destroy a game-owned texture.
export function findNativeCardTexture(L, name) {
  if (!/^card(?:Face|Back)_\d{1,5}$/.test(name)) return null;
  const valid = t => t?.bitmap && !t.destroyed && !t.bitmap.destroyed && t.width > 0 && t.height > 0;
  const direct = L?.loader?.getRes?.(name);
  if (valid(direct)) return direct;
  for (const cache of [L?.Loader?.textureMap, L?.Loader?.loadedMap, L?.Loader?._loadedMap]) {
    if (!cache) continue;
    const keys = Object.keys(cache), count = Math.min(keys.length, 60000);
    for (let i = 0; i < count; i++) {
      const key = keys[i];
      if (!key.includes(name) || nativeCardResourceName(key) !== name) continue;
      const entry = cache[key], texture = entry?.bitmap ? entry : L?.loader?.getRes?.(key);
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
  constructor({ window: win, document: doc, game, settings, scope, sceneWatch }) {
    Object.assign(this, { win, doc, game, settings, scope });
    this.styles = new Map(); this.listeners = new Set(); this.textures = new Map(); this.bindings = new Map();
    this.nativeResources = new Map(); this.nativeAttempts = new Map(); this.previews = new WeakMap();
    this.factories = new Map(); this.pools = new Map();
    this.insertions = new Map();
    this.selfModels = new WeakSet(); this.selfIds = new Set(); this.selfHand = null; this.bookFaces = new WeakSet();
    this.scene = null;
    this.atlases = new Map(); this.images = new Map(); this.previewAtlasId = '';
    this.localBacks = new Map(); this.localFaces = new Map(); this.localFaceCatalog = null;
    this.localFaceCatalogPending = null; this.localFaceCatalogError = '';
    this.localFaceBackground = null;
    this.status = '跟随游戏原始外观'; this.closed = false;
    const refreshNative = () => this.refreshNative();
    if (sceneWatch) scope.add(sceneWatch.watch(refreshNative, 400));
    else scope.interval(refreshNative, 400);
    if (game.onSceneChange) scope.add(game.onSceneChange(() => this.queueRefresh()));
    scope.add(() => { this.closed = true; this.restore(); this.clearTextures(); this.nativeResources.clear(); this.nativeAttempts.clear(); this.localBacks.clear(); this.localFaces.clear(); this.localFaceBackground = null; this.listeners.clear(); });
    this.localBacksReady = win.indexedDB ? this.loadLocalBacks() : Promise.resolve();
    this.localFacesReady = win.indexedDB ? this.loadLocalFaces() : Promise.resolve();
  }
  register(style, owner) {
    if (this.closed) return () => {};
    if (!style?.id?.startsWith(owner + '.') || !/^[a-z][a-z0-9.-]{0,63}$/.test(style.id) || this.styles.has(style.id)) throw new Error('卡牌样式 ID 无效或已注册');
    if (style.id.startsWith(LOCAL_BACK_PREFIX) || style.id.startsWith(LOCAL_FACE_STYLE.id + '.')) throw new Error('此 ID 保留给本地卡牌外观');
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
  listLocalBacks() { return [...this.localBacks.values()]; }
  async loadLocalBacks() {
    try {
      const rows = await localCardBackTransaction(this.win, 'readonly', store => store.getAll());
      if (this.closed) return;
      for (const row of rows) {
        const style = localCardBack(row);
        if (style) this.localBacks.set(style.id, style);
      }
    } catch (error) {
      if (!this.closed) this.localBackError = '读取本地卡背失败：' + error.message;
    }
    if (!this.closed) { this.refreshNative(); this.emit(); }
  }
  async importLocalBack(file) {
    const image = await readLocalCardBack(this.win, file);
    await this.localBacksReady;
    if (this.closed) return;
    const id = await localCardBackTransaction(this.win, 'readwrite', store => store.add(image));
    if (this.closed) return;
    const style = localCardBack({ id, ...image });
    this.localBacks.set(style.id, style);
    try { this.selectSide('back', style.id); }
    catch (error) {
      this.emit();
      throw new Error('图片已保存，选用失败：' + error.message);
    }
  }
  async deleteLocalBack(id) {
    if (this.closed || !this.localBacks.has(id)) return;
    const key = Number(id.slice(LOCAL_BACK_PREFIX.length));
    await localCardBackTransaction(this.win, 'readwrite', store => store.delete(key));
    if (this.closed) return;
    this.localBacks.delete(id);
    try {
      if (this.selection.back === id) this.settings.set('cardBackStyle', '');
    } finally {
      this.restore(); this.clearTextures(id); this.refreshNative(); this.emit();
    }
  }
  localFaceTransaction(mode, operation) {
    return localImageTransaction(this.win, 'sgs-toolbox-card-faces', mode, operation, 'card');
  }
  async loadLocalFaces() {
    try {
      const rows = await this.localFaceTransaction('readonly', store => store.getAll());
      if (this.closed) return;
      for (const row of rows) {
        if (typeof row.name !== 'string' || !isLocalCardImageUrl(row.url)) continue;
        if (row.card === FACE_BACKGROUND_RECORD) this.localFaceBackground = Object.freeze(row);
        else if (cardFrameName(row.card) && typeof row.label === 'string') {
          this.localFaces.set(row.card, Object.freeze(row));
        }
      }
    } catch (error) {
      if (!this.closed) this.localFaceError = '读取本地卡面失败：' + error.message;
    }
    if (!this.closed) { this.refreshNative(); this.emit(); }
  }
  listLocalFaces() { return [...this.localFaces.values()]; }
  loadLocalFaceCatalog() {
    if (this.closed || this.localFaceCatalog || this.localFaceCatalogPending) return;
    const existing = this.game.getCardFaceCatalog?.();
    if (existing) {
      this.localFaceCatalog = existing;
      this.localFaceCatalogError = '';
      this.emit();
      return;
    }
    if (!this.game.loadCardFaceCatalog) return;
    this.localFaceCatalogError = '';
    this.localFaceCatalogPending = this.game.loadCardFaceCatalog().then(catalog => {
      if (!this.closed && !this.localFaceCatalog) this.localFaceCatalog = catalog;
    }, error => {
      if (!this.closed && !this.localFaceCatalog) this.localFaceCatalogError = '读取游戏牌表失败：' + error.message;
    }).finally(() => {
      this.localFaceCatalogPending = null;
      if (!this.closed) this.emit();
    });
    this.emit();
  }
  async importLocalFace(card, file) {
    const label = this.localFaceCatalog?.find(item => item.res === card)?.label || this.localFaces.get(card)?.label;
    if (!label) throw new Error('请选择牌名');
    const image = await readLocalCardImage(this.win, file, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT);
    await this.localFacesReady;
    if (this.closed) return;
    const row = Object.freeze({ card, label, ...image });
    await this.localFaceTransaction('readwrite', store => store.put(row));
    if (this.closed) return;
    this.localFaces.set(card, row);
    this.refreshLocalImage(localFaceKey(card));
  }
  async deleteLocalFace(card) {
    if (this.closed || !this.localFaces.has(card)) return;
    await this.localFaceTransaction('readwrite', store => store.delete(card));
    if (this.closed) return;
    this.localFaces.delete(card);
    this.refreshLocalImage(localFaceKey(card));
  }
  async importLocalFaceBackground(file) {
    const image = await readLocalCardImage(this.win, file, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT);
    await this.localFacesReady;
    if (this.closed) return;
    const row = Object.freeze({ card: FACE_BACKGROUND_RECORD, ...image });
    await this.localFaceTransaction('readwrite', store => store.put(row));
    if (this.closed) return;
    this.localFaceBackground = row;
    this.refreshLocalImage(LOCAL_FACE_BACKGROUND_STYLE.id);
  }
  async deleteLocalFaceBackground() {
    if (this.closed || !this.localFaceBackground) return;
    await this.localFaceTransaction('readwrite', store => store.delete(FACE_BACKGROUND_RECORD));
    if (this.closed) return;
    this.localFaceBackground = null;
    this.refreshLocalImage(LOCAL_FACE_BACKGROUND_STYLE.id);
  }
  refreshLocalImage(key) {
    // Apply fallback while retiring the old texture, without unhooking the card.
    const previous = [];
    for (const [textureKey, texture] of this.textures) {
      if (!textureKey.startsWith(key + ':')) continue;
      this.textures.delete(textureKey);
      previous.push(texture);
    }
    this.clearTextures(key);
    this.refreshNative();
    for (const texture of previous) texture.destroy(true);
    this.emit();
  }
  resolveStyleId(id) {
    const mergedId = LEGACY_CARD_STYLES.get(id);
    if (!mergedId || this.styles.has(id) || !this.styles.has(mergedId)) return id;
    const inactive = this.settings.get('inactiveLegacyCardPacks', []);
    return Array.isArray(inactive) && inactive.includes(id.split('.')[0]) ? id : mergedId;
  }
  get current() { return this.resolveStyleId(this.settings.get('cardStyle', '')); }
  get selection() {
    return {
      face: this.resolveStyleId(this.settings.get('cardFaceStyle', this.current)),
      back: this.resolveStyleId(this.settings.get('cardBackStyle', this.current)),
      scope: this.settings.get('cardStyleScope', 'all'),
    };
  }
  styleFor(side, id = this.selection[side]) {
    if (side === 'face' && id === LOCAL_FACE_STYLE.id) return LOCAL_FACE_STYLE;
    if (side === 'face' && id === LOCAL_FACE_BACKGROUND_STYLE.id) return LOCAL_FACE_BACKGROUND_STYLE;
    return (side === 'back' ? this.localBacks.get(id) : null) || this.styles.get(this.resolveStyleId(id));
  }
  selectSide(side, id) {
    if (!['face', 'back'].includes(side)) throw new Error('无效卡牌面');
    const style = this.styleFor(side, id);
    if (id && !style) throw new Error('卡牌样式尚未启用');
    if (side === 'back' && style?.atlas && !style.atlas.backImage) throw new Error('此套装仅提供卡面');
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
    id = this.resolveStyleId(id);
    if (id && !this.styles.has(id)) throw new Error('卡牌样式尚未启用');
    this.settings.set('cardStyle', id); this.settings.set('cardFaceStyle', id);
    if (!this.styles.get(id)?.atlas || this.styles.get(id).atlas.backImage) this.settings.set('cardBackStyle', id);
    this.restore(); this.refreshNative(); this.emit();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.warn('[卡牌样式]',e); } } }
  setStatus(value) { if (this.status !== value) { this.status = value; this.emit(); } }
  queueRefresh(emit = false) {
    if (this.closed) return;
    this.refreshNeedsEmit ||= emit;
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      const notify = this.refreshNeedsEmit;
      this.refreshQueued = false;
      this.refreshNeedsEmit = false;
      if (this.closed) return;
      this.refreshNative();
      if (notify && !this.closed) this.emit();
    });
  }
  clearTextures(id) {
    for (const [key, image] of this.images) if (!id || key === id) { image.onload = image.onerror = null; image.src = ''; this.images.delete(key); }
    for (const [key, entry] of this.atlases) if (!id || key === id) {
      entry.controller.abort(); entry.data?.dispose(); this.atlases.delete(key);
    }
    for (const [key, texture] of this.textures) if (!id || key === id || key.startsWith(id + ':')) { texture.destroy(true); this.textures.delete(key); }
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
  previewCardAtlas(id, { retry = false } = {}) {
    if (this.closed) return null;
    const style = this.styles.get(id);
    const next = style?.atlas ? id : '';
    const previous = this.previewAtlasId;
    this.previewAtlasId = next;
    if (previous && previous !== next && previous !== this.selection.face && previous !== this.selection.back) this.clearTextures(previous);
    if (!next) return null;
    const entry = this.atlases.get(next);
    if (retry && entry?.error) this.clearTextures(next);
    return this.ensureAtlas(style);
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
      const bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height, this.win.Laya.TextureFormat?.R8G8B8A8 ?? 1, false); bitmap.loadImageSource(canvas, true);
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
    if (style.localFace || style.localFaceBackground) return null;
    if (style.localBackImage || style.atlas) {
      if (back) {
        const src = style.localBackImage || style.atlas.backImage;
        if (!src) return null;
        const image = this.doc.createElement('img'); image.src = src;
        image.alt = ''; image.width = 135; image.height = 190; return image;
      }
      if (style.localBackImage) return null;
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
  imageFor(id, url) {
    let image = this.images.get(id);
    if (!image) {
      image = new this.win.Image();
      this.images.set(id, image);
      const update = () => {
        if (!this.closed && this.images.get(id) === image) this.queueRefresh(true);
      };
      image.onload = image.onerror = update;
      image.src = url;
    }
    return image;
  }
  imageTexture(key, image, width, height, size) {
    if (!image.complete || image.naturalWidth !== width || image.naturalHeight !== height) return null;
    if (!this.textures.has(key)) {
      const bitmap = new this.win.Laya.Texture2D(width, height, this.win.Laya.TextureFormat?.R8G8B8A8 ?? 1, false);
      bitmap.loadImageSource(image, true);
      const texture = new this.win.Laya.Texture(bitmap);
      texture.width = texture.sourceWidth = size.width || 93;
      texture.height = texture.sourceHeight = size.height || 130;
      this.textures.set(key, texture);
    }
    return this.textures.get(key);
  }
  localFaceTexture(ui, size) {
    if (ui.isNewCardUI !== true && ui.IsYiCard) return null;
    const card = ui.theCard?.ResName, local = this.localFaces.get(card);
    if (!local) return null;
    return this.localFaceImageTexture(localFaceKey(card), local.url, size);
  }
  localFaceImageTexture(id, url, size) {
    const image = this.imageFor(id, url);
    return this.imageTexture(`${id}:${size.width || 93}x${size.height || 130}`, image, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT, size);
  }
  texture(style, back, immediate = false) {
    if (style.localBackImage || style.atlas) {
      if (!back || (!style.localBackImage && !style.atlas.backImage)) return null;
      const image = this.imageFor(style.id, style.localBackImage || style.atlas.backImage);
      const width = style.localBackImage ? LOCAL_BACK_WIDTH : 405;
      const height = style.localBackImage ? LOCAL_BACK_HEIGHT : 570;
      return this.imageTexture(style.id + ':back', image, width, height, {});
    }
    if (style.native) return this.nativeTexture(style.native[back ? 'back' : 'face'], immediate);
    const key = style.id + ':' + back;
    if (!this.textures.has(key)) {
      const canvas = drawCardStyle(this.doc, back ? style.back : style.face, back);
      // Non-power-of-two cards must not allocate a mip chain on Chromium 85's
      // WebGL path. Disabling it after allocation leaves an incomplete texture.
      const bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height, this.win.Laya.TextureFormat?.R8G8B8A8 ?? 1, false);
      bitmap.loadImageSource(canvas, true);
      const texture = new this.win.Laya.Texture(bitmap); texture.width = 93; texture.height = 130;
      this.textures.set(key, texture);
    }
    return this.textures.get(key);
  }
  restore() {
    for (const local of [...this.factories.values(), ...this.pools.values(), ...this.insertions.values()]) local.dispose();
    this.factories.clear(); this.pools.clear(); this.insertions.clear();
    this.nativeLoaderScope?.dispose();
    this.nativeLoaderScope = null;
    this.nativeLoader = null;
    for (const b of this.bindings.values()) b.release(); this.bindings.clear();
    this.bookFaces = new WeakSet();
  }
  bindCard(ui, immediate = false) {
    if (this.closed || !['face','back'].some(side => this.styleFor(side)) || !isCardUI(ui)) return;
    if (!this.bindings.has(ui)) {
      const local = new ResourceScope(), binding = { original: ui.bmpFace.texture, applied: null, layers: new Map() };
      const flush = node => { if (node?.render && typeof node.update === 'function') node.update(); };
      binding.restoreLayers = () => {
        for (const [node, visible] of binding.layers) if (!node.destroyed && node.visible === false) { node.visible = visible; flush(node); }
        binding.layers.clear();
      };
      binding.apply = force => {
        const card = ui.theCard, style = this.styleFor(card?.IsEmpty ? 'back' : 'face');
        const bookPreview = style?.atlas && !card?.IsEmpty && this.bookFaces.has(ui);
        const eligible = style && card && (this.selection.scope === 'all' || this.isSelfCard(ui) || bookPreview) && !ui.isPokerCardFace && !ui.dontUpdateCard
           && (card.IsEmpty || ui.isNewCardUI === true || style.atlas || style.localFace);
        if (ui.bmpFace.texture !== binding.applied) binding.original = ui.bmpFace.texture;
        // Native fO.texture adopts the incoming texture's dimensions while
        // auto-sized. Preserve the current UI/native dimensions, including
        // mobile/skill-window sizes; never resize a shared official texture.
        const dimension = (...values) => values.find(value => Number.isFinite(value) && value > 0 && value <= 4096);
        const size = { width: dimension(ui.width, binding.original?.width, ui.bmpFace.width),
          height: dimension(ui.height, binding.original?.height, ui.bmpFace.height) };
        let texture = null;
        if (eligible && !binding.special) {
          if (style.localFace) texture = this.localFaceTexture(ui, size);
          else if (style.localFaceBackground) {
            const image = this.localFaceBackground;
            if (image) texture = this.localFaceImageTexture(style.id, image.url, size);
          } else if (style.atlas && !card.IsEmpty) texture = this.atlasTexture(style, ui, size);
          else texture = this.texture(style, Boolean(card.IsEmpty), force);
        }
        binding.reason = !style ? '跟随游戏' : !eligible ? '范围或原生显示限制' : binding.special ? '原生指定特殊卡图'
          : texture ? '' : ui.isNewCardUI !== true && ui.IsYiCard ? '异牌专用卡图'
          : style.atlas?.replaceCards && !style.atlas.replaceCards.includes(card?.ResName)
            && this.atlases.get(style.id)?.data?.frames.has(cardFrameName(card?.ResName)) ? '与默认卡面相同，保留原生'
          : style.atlas ? `无同名卡图：${String(card?.ResName || '空资源名').slice(0,96)}` : '资源未就绪';
        if (!texture) { if (ui.bmpFace.texture === binding.applied) ui.bmpFace.texture = binding.original; binding.applied = null; binding.restoreLayers(); return; }
        if (style.atlas || style.localFace) for (const key of ['bmpFace2','bmpName','bmpNameBg','bmpNormalName','bmpCardType','bmpSmallDesc']) {
          const node = ui[key]; if (!node) continue;
          if (!binding.layers.has(node)) binding.layers.set(node, node.visible);
          if (node.visible !== false) { node.visible = false; flush(node); }
        }
        binding.applied = texture;
        const dirty = ui.bmpFace.texture !== texture || ui.bmpFace.invalidateUpdateFlag === true;
        ui.bmpFace.texture = texture; if (dirty) flush(ui.bmpFace);
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
    if (binding.inNative || binding.inApply) return;
    binding.inApply = true;
    try { binding.apply(immediate); binding.error = ''; }
    catch (error) { binding.error = error.message; binding.reason = '纹理应用失败：' + error.message; this.setStatus('卡牌外观未应用：' + error.message); }
    finally { binding.inApply = false; }
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
      registry.bookFaces.delete(card);
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
    this.scanCards([root], ui => this.captureCard(ui));
  }
  watchInsertions(node) {
    if (this.insertions.has(node) || !Object.isExtensible(node)) return;
    const children = ['addChild', 'addChildAt'].filter(key => typeof node[key] === 'function');
    const draws = ['addDrawChild', 'addDrawChildAt'].filter(key => typeof node[key] === 'function');
    if (!children.length && !draws.length) return;
    const local = new ResourceScope(), registry = this;
    this.insertions.set(node, local);
    const patch = (key, wrap) => {
      try { local.patch(node, key, wrap); }
      catch { /* Read-only display methods are covered by discovery. */ }
    };
    for (const key of children) patch(key, original => function (child, ...args) {
      const result = original.call(this, child, ...args);
      if (!child || child === this || child.destroyed) return result;
      try {
        if (this === registry.win.Laya.stage || this.name === 'SceneLayer' || this.layerOrder === 2 || this === registry.scene) {
          registry.syncScene();
          registry.queueRefresh();
        }
        registry.captureBranch(child);
      } catch (error) { registry.setStatus('卡牌外观未应用：' + error.message); }
      return result;
    });
    const mouseDown = this.win.Laya.Event?.MOUSE_DOWN || 'mousedown';
    for (const key of draws) patch(key, original => function (child, ...args) {
      const ui = flatCardForBitmap(child, mouseDown);
      if (ui) {
        if (this === registry.selfHand) registry.rememberSelf(ui.theCard);
        registry.captureCard(ui);
      }
      return original.call(this, child, ...args);
    });
  }
  scanCards(queue, onCard) {
    // Only display children and the known flat-card containers; never walk models/getters.
    const seen = new Set();
    const listType = this.game.getClass?.('CardsBookWindow'), detailType = this.game.getClass?.('CardBookDetailWindow');
    for (let i = 0; i < queue.length && i < 6000; i++) {
      const node = queue[i]; if (!node || typeof node !== 'object' || seen.has(node) || node.destroyed) continue; seen.add(node);
      if (isCardUI(node)) { onCard(node); continue; }
      this.watchInsertions(node);
      this.hookFactory(node);
      for (const ui of cardBookFaces(node, listType, detailType)) {
        this.bookFaces.add(ui);
        queue.push(ui);
      }
      for (const key of CARD_LISTS) {
        const cards = own(node, key);
        if (!Array.isArray(cards)) continue;
        for (let j = 0, count = Math.min(cards.length, 2048); j < count; j++) queue.push(cards[j]);
      }
      for (const key of CARD_NODES) { const value = own(node,key); if (value) queue.push(value); }
    }
    return seen;
  }
  syncScene() {
    const scene = this.game.getScene?.();
    if (scene !== this.scene) {
      this.scene = scene; this.selfModels = new WeakSet(); this.selfIds.clear(); this.bookFaces = new WeakSet();
    }
    const seat = this.game.getSelfSeatUI?.();
    this.selfHand = seat?.cardContainer;
    for (const ui of this.selfHand?.cardUis || this.selfHand?.cardUIs || this.selfHand?.cardUiList || []) this.rememberSelf(ui.theCard);
    return seat;
  }
  discover(seat) {
    const found = new Set();
    this.bookFaces = new WeakSet();
    const seen = this.scanCards([this.win.Laya?.stage, this.scene, seat], ui => found.add(ui));
    for (const ui of this.bindings.keys()) {
      const parent = own(ui, 'drawParent');
      if (!ui.destroyed && seen.has(parent) && own(ui.bmpFace, 'render') === parent) found.add(ui);
    }
    for (const hooks of [this.factories, this.insertions]) for (const [owner, local] of hooks) {
      if (!seen.has(owner)) { local.dispose(); hooks.delete(owner); }
    }
    return found;
  }
  watchNativeResources(face, back) {
    const loader = face || back ? this.win.Laya?.Loader : null;
    if (this.nativeLoader === loader) return;
    this.nativeLoaderScope?.dispose();
    this.nativeLoader = loader;
    if (!loader) return;
    const local = this.nativeLoaderScope = new ResourceScope(), registry = this;
    for (const key of ['cacheTexture', 'cacheRes']) {
      if (typeof loader[key] !== 'function') continue;
      local.patch(loader, key, original => function (path, ...args) {
        const result = original.call(this, path, ...args);
        const name = nativeCardResourceName(path);
        if (name && (name === registry.styleFor('face')?.native?.face || name === registry.styleFor('back')?.native?.back)) {
          registry.nativeAttempts.delete(name);
          registry.queueRefresh();
        }
        return result;
      });
    }
  }
  refreshNative() {
    if (this.closed) return;
    const { face, back: backId } = this.selection;
    const customFaceSelected = face === LOCAL_FACE_STYLE.id;
    const backgroundId = LOCAL_FACE_BACKGROUND_STYLE.id;
    const background = face === backgroundId ? this.localFaceBackground : null;
    for (const id of this.images.keys()) {
      if (id === backId || (background && id === backgroundId) || (customFaceSelected && id.startsWith(LOCAL_FACE_STYLE.id + '.'))) continue;
      this.clearTextures(id);
    }
    if (customFaceSelected && this.listeners.size) {
      const catalog = this.game.getCardFaceCatalog?.();
      if (catalog && catalog !== this.localFaceCatalog) {
        this.localFaceCatalog = catalog;
        this.localFaceCatalogError = '';
        this.emit();
      }
    }
    const selectedAtlas = this.styles.get(face);
    for (const id of this.atlases.keys()) {
      if (id !== selectedAtlas?.id && id !== backId && id !== this.previewAtlasId) this.clearTextures(id);
    }
    if (selectedAtlas?.atlas) this.ensureAtlas(selectedAtlas);
    if (this.listeners.size) {
      const before = [...this.nativeResources.values()];
      for (const item of this.styles.values()) if (item.native) for (const name of Object.values(item.native)) this.nativeTexture(name);
      const after = [...this.nativeResources.values()];
      if (before.length !== after.length || after.some((t, i) => t !== before[i])) this.emit();
    }
    const back = this.styleFor('back');
    const backSource = back?.localBackImage || back?.atlas?.backImage;
    const backImage = backSource ? this.imageFor(back.id, backSource) : null;
    const faceImage = background ? this.imageFor(backgroundId, background.url) : null;
    if (customFaceSelected) for (const [card, row] of this.localFaces) this.imageFor(localFaceKey(card), row.url);
    const style = back || selectedAtlas || faceImage || (customFaceSelected && this.localFaces.size);
    if (!style) { this.restore(); this.setStatus(this.current ? '所选套装已停用，当前跟随游戏' : '跟随游戏原始外观'); return; }
    if (!this.win.Laya?.Texture2D || !this.win.Laya?.Texture) { this.setStatus('等待游戏原生渲染器'); return; }
    try {
      this.watchNativeResources(selectedAtlas?.native?.face, back?.native?.back);
      const found = this.discover(this.syncScene());
      for (const [ui,binding] of this.bindings) if (!found.has(ui)) { binding.release(); this.bindings.delete(ui); }
      for (const ui of found) {
        this.bindCard(ui);
      }
      const waiting = [selectedAtlas?.native?.face, back?.native?.back].some(name => name && !this.nativeTexture(name));
      const localStatus = backImage && (!backImage.complete ? '正在加载自定义卡背' :
        backImage.naturalWidth !== (back.localBackImage ? LOCAL_BACK_WIDTH : LOCAL_FACE_WIDTH)
        || backImage.naturalHeight !== (back.localBackImage ? LOCAL_BACK_HEIGHT : LOCAL_FACE_HEIGHT) ? '自定义卡背加载失败，当前跟随游戏卡背' : '');
      const backgroundStatus = faceImage && (!faceImage.complete ? '正在加载卡面底图' :
        faceImage.naturalWidth !== LOCAL_FACE_WIDTH || faceImage.naturalHeight !== LOCAL_FACE_HEIGHT ? '卡面底图加载失败，当前跟随游戏卡面' : '');
      const atlas = this.atlases.get(selectedAtlas?.id);
      const prefix = atlas?.error ? '完整卡面加载失败，已保留游戏外观：' + atlas.error : atlas?.loading ? '正在加载完整卡面，当前保留游戏外观' : null;
      const faces = atlas?.data ? [...this.bindings].filter(([ui]) => !ui.theCard?.IsEmpty) : [];
      const applied = faces.filter(([ui,b]) => b.applied && !b.reason && !b.error && ui.bmpFace.texture === b.applied).length;
      const fallback = [...new Set(faces.filter(([,b]) => b.reason).map(([,b]) => b.reason))];
      const detail = atlas?.data ? ` · 完整卡面 R3 已替换 ${applied}/${faces.length}${fallback.length ? ' · 回退：' + fallback.join('；') : ''}` : '';
      this.setStatus(prefix || backgroundStatus || localStatus || (waiting ? '等待官方卡面／卡背资源加载，已就绪的面独立应用' : found.size ? `已接入 ${found.size} 张原生卡牌 · 仅本机显示${detail}` : '套装已就绪，等待原生卡牌出现'));
    } catch (error) { this.restore(); this.setStatus('卡牌外观未应用：' + error.message); }
  }
}
