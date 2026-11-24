import { label, paintRankCounter } from './board.js';
import { pokerCardSprite } from './native-card-motion.js';
import { RANKS } from './remaining.js';

export function attachPokerTableInfo(Laya, scope, scene, seats, size, bottomName) {
  const bottomLayer = scene.addChild(new Laya.Sprite());
  const counterLayer = scene.addChild(new Laya.Sprite());
  bottomLayer.name = bottomName;
  counterLayer.name = 'sgs-toolbox-poker-remaining';
  bottomLayer.mouseEnabled = counterLayer.mouseEnabled = false;
  scope.add(() => {
    for (const layer of [bottomLayer, counterLayer]) if (!layer.destroyed) layer.destroy(true);
  });
  let previous;

  function draw({ bottom, score, rate, remaining }, palette) {
    const y = 29, gap = 12;
    const topSeats = seats.slice(1).map(seat => {
      const origin = scene.globalToLocal(scene.seatContainer.localToGlobal(new Laya.Point(seat.x, seat.y)));
      return { x: origin.x, right: origin.x + (seat.ScaledWidth || seat.width), y: origin.y };
    }).filter(seat => seat.y < y + 95);
    const tableRight = scene.rightView?.visible ? scene.rightView.x : scene.width;
    const left = { x: 77, right: Math.min(tableRight / 2, ...topSeats.map(seat => seat.x)) - gap };
    const right = { x: Math.max(tableRight / 2, ...topSeats.map(seat => seat.right)) + gap, right: tableRight - gap };
    const span = rect => rect.right - rect.x;
    const bottomBounds = span(left) >= 158 || span(left) >= span(right) ? left : right;
    const counterBounds = bottomBounds === left ? right : left;
    const anchor = span(counterBounds) >= 160 ? counterBounds : bottomBounds;
    const sameCounts = remaining === previous?.remaining || remaining && previous?.remaining
      && RANKS.every(([rank]) => remaining[rank] === previous.remaining[rank]);
    const layout = [left.right, right.x, right.right, size.width, size.height].join(':');
    if (previous?.layout === layout && previous.palette === palette && previous.bottom === bottom
        && previous.score === score && previous.rate === rate && sameCounts) return;
    previous = { layout, palette, bottom, score, rate, remaining };

    for (const layer of [bottomLayer, counterLayer]) {
      layer.graphics.clear();
      layer.destroyChildren();
    }
    const count = Math.min(bottom.length, 54);
    const width = Math.floor(Math.min(span(bottomBounds), 172));
    bottomLayer.visible = (count > 0 || score != null || rate != null) && width > 56;
    let panelHeight = 0;
    if (bottomLayer.visible) {
      const details = [score == null ? '' : `底分 ${score}`, rate == null ? '' : `×${rate}`].filter(Boolean);
      const heading = count || !details.length ? ['底牌', ...details] : details;
      const line = heading.join(' · ');
      const lines = width - 14 >= Array.from(line).length * 8 ? [line] : heading;
      const top = lines.length * 20 + 2;
      const cardWidth = Math.min(Math.round(size.width * .5), width - 16);
      const cardSize = { width: cardWidth, height: Math.round(cardWidth * size.height / size.width) };
      const pitch = count > 1 ? Math.min(cardWidth + 5, (width - cardWidth - 16) / (count - 1)) : 0;
      const start = (width - cardWidth - pitch * (count - 1)) / 2;
      panelHeight = count ? top + cardSize.height + 7 : top;
      bottomLayer.pos(bottomBounds.x, y);
      bottomLayer.graphics.drawRect(0, 0, width, panelHeight, palette.surface, palette.border, 1);
      for (const [index, text] of lines.entries()) {
        label(Laya, bottomLayer, text, 7, 1 + index * 20, width - 14, 20,
          { size: 12, color: palette.accent, align: 'center' });
      }
      for (let i = 0; i < count; i++) {
        const card = pokerCardSprite(Laya, bottom[i], cardSize, palette);
        card.pos(Math.trunc(start + i * pitch), top + 1);
        bottomLayer.addChild(card);
      }
    }
    const counterWidth = paintRankCounter(Laya, counterLayer, remaining, 0, 0, span(anchor), palette);
    counterLayer.remaining = counterWidth ? remaining : null;
    counterLayer.visible = counterWidth > 0;
    counterLayer.pos(anchor === right ? right.right - counterWidth : left.x,
      y + (anchor === bottomBounds && panelHeight ? panelHeight + 8 : 0));
  }

  return { bottomLayer, draw };
}
