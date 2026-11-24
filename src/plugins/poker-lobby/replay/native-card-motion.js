import { paintCard } from './board.js';

export const POKER_CARD_NODE = 'sgs-toolbox-poker-card';

export function pokerCardSprite(Laya, card, size, palette) {
  const node = new Laya.Sprite();
  node.name = POKER_CARD_NODE;
  node.pokerCardId = card?.id ?? 0;
  node.pokerRank = card?.rank ?? 0;
  node.pokerBaseRank = card?.baseRank ?? 0;
  node.mouseEnabled = false;
  node.size(size.width, size.height);
  paintCard(Laya, node, card, 0, 0, size.width, size.height, palette);
  // Minimal display interface consumed by the client's discard-stack layout
  // and tween. There is no ordinary game card or protocol object behind it.
  node.UpdateCoordinates = function (progress) {
    this.pos(this.StartX + (this.EndX - this.StartX) * progress, this.StartY + (this.EndY - this.StartY) * progress);
  };
  return node;
}

export function attachNativePile(Laya, scope, stack, layer, size) {
  if (!stack) {
    return {
      draw(played, _starts, palette, width) {
        layer.destroyChildren();
        const count = Math.min(played?.count ?? 0, 64);
        const gap = count > 1 ? Math.min(size.width + 5, (width - size.width) / (count - 1)) : 0;
        for (let index = 0; index < count; index++) {
          const card = pokerCardSprite(Laya, played.cards[index], size, palette);
          card.pos(Math.round(index * gap), 0);
          layer.addChild(card);
        }
      },
    };
  }
  // Run the native stack's positioning and movement on graph-only poker cards.
  // The actual game's stack arrays, card IDs and motion queue stay separate.
  const motion = {
    width: 0,
    height: size.height,
    seatScale: 1,
    stackUis: [],
    clearedActionUis: [],
    motionCardInStack: { count: 0 },
    countTween: null,
    tweenPos: 0,
    clearEnterFrame: stack.clearEnterFrame,
    onEnterFrame: stack.onEnterFrame,
    onComplete: stack.onComplete,
  };
  motion.countTweenUpdate = Laya.Handler.create(motion, motion.onEnterFrame, null, false);

  function clear() {
    motion.countTween?.clear();
    motion.countTween = null;
    motion.stackUis = [];
    if (!layer.destroyed) layer.destroyChildren();
  }
  scope.add(() => { clear(); motion.countTweenUpdate.recover(); });

  function draw(played, starts, palette, width) {
    clear();
    if (!played?.count) return;
    motion.width = width;
    const count = Math.min(played.count, 64);
    motion.stackUis = Array.from({ length: count }, (_, index) => {
      const card = pokerCardSprite(Laya, played.cards[index], size, palette);
      const start = starts?.[index];
      if (start) card.pos(start.x, start.y);
      card.AddTime = index;
      layer.addChild(card);
      return card;
    });
    motion.startEnterFrame = starts ? stack.startEnterFrame : () => {
      motion.tweenPos = 1;
      motion.onEnterFrame();
    };
    stack.layoutStackCardUis.call(motion);
  }

  return { draw };
}
