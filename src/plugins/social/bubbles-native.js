import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';

const roomChannels = new Set([3, 6, 7]);
const previewRefreshMs = 1000;
const name = value => typeof value === 'string' ? value.replace(/^\[\d+\]/, '') : '';
const layaOf = ctx => ctx.window.Laya ?? ctx.window.laya;

export function openBubbleGallery(ctx) {
  const dispatcher = ctx.game.getDispatcher?.();
  const wardrobe = ctx.game.getClass('SgxWindow')?.prototype;
  if (!wardrobe || !ctx.game.getClass('DialogueBubbleView') || typeof dispatcher?.ShowWindowAfterCloseOther !== 'function') {
    throw new Error('当前客户端的个性化窗口尚未就绪，请回大厅重试。');
  }
  // Classic accepts a fixed tab value. Remastered numbers only visible tabs.
  const tab = typeof wardrobe.selectOpenTargetView === 'function' ? 6 : 0;
  dispatcher.ShowWindowAfterCloseOther('SgxWindow', null, tab);
}

export function installNativeBubbles(ctx, current, enabled, useOfficial) {
  const { scope, game } = ctx;
  const views = new Map();
  const items = new Map();
  let galleryScope, galleryType, seatScope, seat, shown, artwork;

  function decorateItem(item, choice) {
    if (item.lockContainer) item.lockContainer.visible = false;
    if (item.timeContainer) item.timeContainer.visible = false;
    if (item.tagTex) item.tagTex.visible = Boolean(choice?.bubbleId && item.Data?.bubbleId === choice.bubbleId);
  }

  function bindItem(item) {
    const timer = layaOf(ctx)?.timer;
    const nativeUpdate = item.updateTimeText;
    if (items.has(item) || typeof timer?.clear !== 'function' ||
        typeof nativeUpdate !== 'function' || typeof item.updateView !== 'function') return;
    const release = galleryScope.patch(item, 'updateTimeText', original => function (...args) {
      const state = current();
      if (state) decorateItem(this, state.record?.choice);
      else return Reflect.apply(original, this, args);
    });
    const update = item.updateTimeText;
    items.set(item, restore => {
      timer.clear(item, update);
      release();
      if (restore && !item.destroyed && item.uiReady && item.Data) item.updateView();
    });
    // Laya schedules the function reference, so rebinding the method alone
    // leaves the previous countdown running on already initialized cards.
    if (item.uiReady && item.Data) {
      timer.clear(item, nativeUpdate);
      item.updateView();
    }
  }

  function releaseItems() {
    for (const release of items.values()) release(true);
    items.clear();
  }

  function decoratePreview(view, state) {
    const selection = view.selectData;
    const btn = view.previewText;
    if (!state || !btn || !selection) return false;
    const using = state.record?.choice?.bubbleId === selection.bubbleId;
    const available = state.ready && !state.busy && Number(view.getPreviewGoodsId(selection)) > 0;
    btn.label = using ? '本地使用中' : '本地使用';
    btn.Gray = using || !available;
    btn.enabled = available && !using;
    if (view.tipsTxt) {
      view.tipsTxt.visible = true;
      view.tipsTxt.text = '仅本机显示';
    }
    return true;
  }

  function decorate(view) {
    const state = current();
    if (!state) return;
    decoratePreview(view, state);
    for (const item of view.itemArr ?? []) {
      bindItem(item);
      decorateItem(item, state.record?.choice);
    }
  }

  function attachView(view, nativePreview) {
    const btn = view.previewText;
    const original = view.onClickAction;
    if (!btn?.on || !btn.off || typeof original !== 'function' || views.has(view)) return;
    const click = (...args) => {
      if (scope.closed || !enabled()) return Reflect.apply(original, view, args);
      const state = current();
      if (!state?.ready || state.busy || !view.selectData) return;
      const data = view.selectData;
      const bubbleId = Number(data.bubbleId), goodsId = Number(view.getPreviewGoodsId(data));
      if (Number.isSafeInteger(bubbleId) && bubbleId > 0 && Number.isSafeInteger(goodsId) && goodsId > 0) {
        useOfficial({ bubbleId, goodsId, name: data.title || data.baseInfo?.name || '游戏气泡' });
      }
    };
    const event = layaOf(ctx)?.Event?.CLICK ?? 'click';
    btn.off(event, view, original);
    btn.on(event, view, click);
    const timer = layaOf(ctx)?.timer;
    const updatePreview = view.updatePreviewState;
    const rebind = updatePreview !== nativePreview && typeof timer?.clear === 'function' && typeof timer.loop === 'function';
    // Both native galleries schedule the method reference at construction.
    // Move an already-open window's countdown to the same callback new views use.
    if (rebind) {
      timer.clear(view, nativePreview);
      timer.loop(previewRefreshMs, view, updatePreview);
    }
    views.set(view, restore => {
      if (rebind) {
        timer.clear(view, updatePreview);
        if (restore && !view.destroyed) timer.loop(previewRefreshMs, view, nativePreview);
      }
      if (btn.destroyed) return;
      btn.off(event, view, click);
      if (!view.destroyed) btn.on(event, view, original);
    });
  }

  function refreshViews() {
    for (const [view, release] of views) {
      if (view.destroyed) { release(false); views.delete(view); continue; }
      if (current()) { decorate(view); continue; }
      view.renderItems();
      view.updatePreview();
    }
  }

  function releaseGallery() {
    releaseItems();
    galleryScope?.dispose();
    for (const [view, release] of views) {
      release(true);
      if (!view.destroyed) {
        view.renderItems();
        view.updatePreview();
      }
    }
    views.clear();
  }

  function bindGallery() {
    const next = game.getClass('DialogueBubbleView')?.prototype;
    if (next === galleryType || !['renderItems', 'updatePreviewState', 'getPreviewGoodsId'].every(key => typeof next?.[key] === 'function')) return;
    releaseGallery();
    galleryType = next;
    galleryScope = new ResourceScope();
    const nativePreview = next.updatePreviewState;
    galleryScope.patch(next, 'updatePreviewState', original => function (...args) {
      attachView(this, original);
      if (!decoratePreview(this, current())) return Reflect.apply(original, this, args);
    });
    galleryScope.patch(next, 'renderItems', original => function (...args) {
      const result = Reflect.apply(original, this, args);
      attachView(this, nativePreview);
      decorate(this);
      return result;
    });
    if (typeof next.recycleItem === 'function') {
      galleryScope.patch(next, 'recycleItem', original => function (item, ...args) {
        items.get(item)?.(false);
        items.delete(item);
        return Reflect.apply(original, this, [item, ...args]);
      });
    }
    // The plugin can be enabled while the native gallery is already open.
    const stage = layaOf(ctx)?.stage;
    const queue = stage ? [stage] : [];
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      if (!node || node.destroyed) continue;
      if (next.isPrototypeOf(node)) { attachView(node, nativePreview); decorate(node); }
      const children = node._children;
      if (Array.isArray(children) && queue.length < 4000) queue.push(...children);
    }
  }

  function restoreBubble() {
    const last = shown;
    shown = null;
    if (!last || last.view.destroyed || last.view.lastGoodsId !== last.appliedId) return;
    const bg = last.view.bubbleBg;
    if (last.texture && bg?.source !== last.texture) return;
    last.view.SetBackGround(last.originalId, last.view.lastIsMe);
  }

  function releaseArtwork() {
    artwork?.texture.destroy();
    artwork?.bitmap.destroy();
    artwork = null;
  }

  function textureFor(image) {
    if (artwork?.image === image) return artwork.texture;
    releaseArtwork();
    const laya = layaOf(ctx);
    if (!laya?.Texture2D || !laya.Texture) throw new Error('当前客户端无法绘制自定义气泡。');
    const bitmap = new laya.Texture2D(image.naturalWidth, image.naturalHeight);
    try {
      bitmap.loadImageSource(image, true);
      artwork = { image, bitmap, texture: new laya.Texture(bitmap) };
      return artwork.texture;
    } catch (error) {
      bitmap.destroy();
      throw error;
    }
  }

  function bindSeat() {
    const next = game.isReplay?.() ? null : game.getSelfSeatUI?.();
    if (next === seat) return;
    seatScope?.dispose();
    restoreBubble();
    seat = next;
    if (typeof seat?.ShowChatMessage !== 'function') return;
    seatScope = new ResourceScope();
    seatScope.patch(seat, 'ShowChatMessage', original => function (message, ...args) {
      const state = current();
      const choice = state?.record?.choice;
      const sender = name(message?.SpokerMan);
      const player = this.Seat?.PlayerInfo;
      const ownMessage = sender && [state?.nickname, player?.Nickname].some(value => name(value) === sender);
      if (!choice || !ownMessage || !roomChannels.has(message.ChannelNum) || message.IsQuickChatMsg || game.isReplay?.() || game.getSelfSeatUI?.() !== this) {
        return Reflect.apply(original, this, [message, ...args]);
      }
      if (choice.custom && !state.image) return Reflect.apply(original, this, [message, ...args]);
      const originalId = message.GoodsBaseID;
      const appliedId = choice.custom ? 0 : choice.goodsId;
      // Only the seat renderer sees this copy. The chat model can also be
      // consumed by the chat list, history and sending flow.
      const display = Object.assign(Object.create(Object.getPrototypeOf(message)), message, { GoodsBaseID: appliedId });
      const result = Reflect.apply(original, this, [display, ...args]);
      const view = this.otherTopManager?.chatBubleView ?? this.chatBubleView;
      if (!view?.parent || view.lastGoodsId !== appliedId) return result;
      if (choice.custom) {
        try {
          const texture = textureFor(state.image);
          view.bubbleBg.skin = '';
          view.bubbleBg.sizeGrid = null;
          view.bubbleBg.source = texture;
          view.msgContent?.SetStroke?.(2, '#171310');
          shown = { view, texture, originalId, appliedId };
        } catch (error) {
          view.SetBackGround(originalId, view.lastIsMe);
          ctx.reportError?.(error);
        }
      } else shown = { view, originalId, appliedId };
      return result;
    });
  }

  function tick() {
    bindGallery();
    bindSeat();
    for (const [view, release] of views) if (view.destroyed) { release(false); views.delete(view); }
  }
  scope.add(() => {
    seatScope?.dispose();
    releaseGallery();
    restoreBubble();
    releaseArtwork();
  });
  return {
    tick,
    refresh() {
      // The current message returns to its native appearance. Subsequent
      // messages use the new selection, while any old GPU texture can retire.
      restoreBubble();
      releaseArtwork();
      refreshViews();
    },
    refreshViews,
  };
}
