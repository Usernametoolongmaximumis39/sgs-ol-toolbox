import { read } from '../../shared/safe-read.js';
import { cachedNativeWindow, isMountedWindowNode } from '../../shared/window-cache.js';

const wardrobeName = 'SgxWindow';
const emojiViewName = 'EmojiSetView';

export function openEmojiGallery(ctx) {
  if (!ctx.native.account().id) throw new Error('请先登录游戏。');
  const dispatcher = ctx.game.getDispatcher();
  if (!ctx.game.getClass(wardrobeName) || !ctx.game.getClass(emojiViewName)
    || typeof dispatcher?.ShowWindowAfterCloseOther !== 'function') {
    throw new Error('游戏的表情页尚未就绪，请回到大厅后重试。');
  }
  dispatcher.ShowWindowAfterCloseOther(wardrobeName, null, 1);
}

function activeGalleryFace(ctx) {
  const laya = ctx.window.Laya ?? ctx.window.laya;
  const stage = laya?.stage;
  if (!stage) return null;
  const wardrobe = cachedNativeWindow(ctx.game.getDispatcher(), wardrobeName);
  if (!isMountedWindowNode(stage, wardrobe)) return null;

  const stack = wardrobe.viewStack;
  const view = stack && ('displayedChild' in stack ? stack.displayedChild : stack.selectedChild);
  const EmojiView = ctx.game.getClass(emojiViewName);
  if (typeof EmojiView !== 'function' || !(view instanceof EmojiView) || !isMountedWindowNode(stage, view)) return null;

  // Use the same thumbnail field as the selected native card.
  const classic = view.crtEmojiData;
  const face = classic ?? view.faceDataList?.find(face => face.EmojiID === view.currectSelId);
  if (!face) return null;
  const source = read(() => classic ? face.FaceUrl : face.U3dFaceStaticUrl);
  const formatted = source && (read(() => laya.URL.formatURL(source)) || source);
  const url = formatted && read(() => new URL(formatted, ctx.document.baseURI));
  const image = url && ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  return { face, image };
}

function available(face) {
  const id = Number(face?.EmojiID);
  return Number.isSafeInteger(id) && id > 0 && face.CanShow === true && Boolean(face.Data);
}

function describeChoices(choices) {
  if (!choices) return [];
  const names = new Map();
  const rows = Array.from(choices, ([id, { face, image }]) => {
    // FaceName is the pack or category, such as “限时”. Tp labels each card.
    const name = String(face.Tp ?? '').trim() || `表情 ${id}`;
    const group = String(face.FaceName ?? '').trim();
    let groups = names.get(name);
    if (!groups) names.set(name, groups = new Map());
    groups.set(group, (groups.get(group) ?? 0) + 1);
    return { id, name, group, image, available: available(face) };
  });
  return rows.map(({ id, name, group, image, available }) => {
    const groups = names.get(name);
    if (groups.size > 1 || groups.get(group) > 1) {
      const suffix = group && groups.get(group) === 1 ? group : id;
      name += ` · ${suffix}`;
    }
    return { id, name, image, available };
  });
}

export function createLocalEmoji(ctx) {
  const selections = new Map();
  const account = () => ctx.native?.account?.().id;
  const playbackSeat = () => {
    if (ctx.game.isReplay?.() || read(() => ctx.game.getClass('GameContext').IsViewerOrReplay()) === true) return null;
    const seat = ctx.game.getSelfSeatUI?.();
    if (!seat || seat.destroyed || seat.IsSelf === false || seat.Seat?.IsSelf !== true) return null;
    const renderer = seat.otherTopManager;
    return !renderer?.destroyed && typeof renderer?.ShowBigFace === 'function' ? seat : null;
  };

  return {
    list() {
      return describeChoices(selections.size ? selections.get(account()) : null);
    },
    add() {
      const accountId = account();
      if (!accountId) throw new Error('请先登录游戏。');
      const entry = activeGalleryFace(ctx);
      if (!entry) throw new Error('请先在游戏的表情页点选一个表情。');
      if (!available(entry.face)) throw new Error('这个表情当前不可预览，请重新选择。');
      let choices = selections.get(accountId);
      if (!choices) {
        choices = new Map();
        selections.set(accountId, choices);
      }
      choices.set(Number(entry.face.EmojiID), entry);
    },
    play(id) {
      const face = selections.get(account())?.get(id)?.face;
      if (!face) throw new Error('请先加入要播放的表情。');
      if (!available(face)) throw new Error('这个表情当前不可播放。');
      const seat = playbackSeat();
      if (!seat) throw new Error('进入自己的牌局后可播放本地表情。');
      // Invoke the local seat renderer with the catalog ID. There is no chat event.
      seat.otherTopManager.ShowBigFace(id, seat.SpeechBubbleLocation);
    },
    remove(id) {
      const accountId = account();
      const choices = selections.get(accountId);
      if (choices?.delete(id) && !choices.size) selections.delete(accountId);
    },
  };
}
