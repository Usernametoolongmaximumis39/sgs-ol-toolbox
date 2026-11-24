import { label } from './board.js';
import { comparePokerCardsByRank, recordedPlayType } from './model.js';
import { attachNativePile } from './native-card-motion.js';

const TITLE_HEIGHT = 24;
const GAP = 12;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function attachPlayAreas(Laya, scope, scene, seats, handLayer, stack, layer, size, names) {
  const at = (node, x = 0, y = 0) => node.localToGlobal(new Laya.Point(x, y));
  let discardArea;
  const regions = seats.map((_, index) => {
    const root = new Laya.Sprite();
    root.name = `sgs-poker-play-seat-${index}`;
    const cards = new Laya.Sprite();
    cards.name = 'played-cards';
    layer.addChild(root);
    root.addChild(cards);
    const caption = label(Laya, root, '', 0, 0, 1, TITLE_HEIGHT, { size: 14, align: 'center', bold: true });
    caption.name = 'play-status';
    caption.stroke = 2;
    caption.strokeColor = '#17120e';
    const pile = attachNativePile(Laya, scope, stack, cards, size);
    return { root, cards, caption, pile, play: null, passFlash: false, seatId: null };
  });

  function layout(playFloor) {
    const boardRight = (scene.rightView?.visible ? scene.rightView.x : scene.width) - GAP;
    const opponents = seats.slice(1).map((seat, i) => {
      const p = scene.globalToLocal(at(scene.seatContainer, seat.x, seat.y));
      return { index: i + 1, x: p.x, y: p.y, width: seat.ScaledWidth, height: seat.ScaledHeight, location: seat.DisplayLocation };
    }).sort((a, b) => a.x - b.x);
    const left = Math.max(GAP * 2, ...opponents.filter(seat => seat.location === 'Left').map(seat => seat.x + seat.width + GAP));
    const right = Math.min(boardRight, ...opponents.filter(seat => seat.location === 'Right').map(seat => seat.x - GAP));
    const width = Math.max(12, right - left);
    const center = Math.min(size.width + 26, width * .19);
    const column = (width - center) / 2;
    const upper = Math.max(GAP, ...opponents.filter(seat => seat.location !== 'Left' && seat.location !== 'Right')
      .map(seat => seat.y + seat.height + GAP));
    const floor = Math.max(upper + TITLE_HEIGHT * 2 + GAP + 2, Math.min(playFloor, seats[0].y) - GAP);
    const scale = Math.min(1, column / size.width, (floor - upper - TITLE_HEIGHT * 2 - GAP) / (2 * size.height));
    const height = TITLE_HEIGHT + Math.ceil(size.height * scale);
    const lower = floor - height;
    const rectangles = [{ x: left, y: lower, width, anchor: width / 2 }];
    opponents.forEach((seat, side) => {
      const x = left + side * (column + center);
      const anchor = seat.location === 'Left' ? 0 : seat.location === 'Right' ? column : seat.x + seat.width / 2 - x;
      rectangles[seat.index] = {
        x, y: clamp(seat.y, upper, lower - height - GAP), width: column, anchor,
      };
    });
    discardArea = { x: left + column, y: upper, width: center, scale };
    return { rectangles, scale, height };
  }

  function startingPoints(played, region, index) {
    const ids = Array.from({ length: Math.min(played.count, 64) }, (_, i) => played.cards[i]?.id ?? 0);
    const positions = scene.GetCardsPoint(ids, seats[index].Seat);
    const hand = new Map();
    if (index === 0) for (const node of handLayer._children || []) {
      const points = hand.get(node.pokerCardId) || [];
      points.push(at(node));
      hand.set(node.pokerCardId, points);
    }
    return ids.map((id, i) => region.cards.globalToLocal(hand.get(id)?.shift() || positions[i], true));
  }

  function updateCaption(region) {
    const { caption, name, action, leading, waiting, passFlash } = region;
    const pass = action?.type === 'pass' || (!action && passFlash);
    caption.text = action?.caption || (action?.type === 'play' ? `${name} · ${recordedPlayType(action)}${leading ? ' · 当前最大' : ''}`
      : pass ? `${name} · 不出` : waiting || '');
    caption.fontSize = pass ? 22 : action?.combination >= 9000 ? 17 : 14;
    caption.color = (leading || pass || waiting) ? '#ffe19b' : '#f0e2c9';
    caption.y = pass ? Math.max(0, (region.root.height - TITLE_HEIGHT) / 2) : 0;
  }

  function endFlash() {
    this.passFlash = false;
    if (!this.root.destroyed) updateCaption(this);
  }
  scope.add(() => { for (const region of regions) Laya.timer.clear(region, endFlash); });

  function draw(state, slots, playFloor, palette, { animate, refresh, actions, speed, ownControls }) {
    const { rectangles, scale, height } = layout(playFloor);
    const passed = new Set(actions.filter(action => action.type === 'pass').map(action => action.seat));
    layer.visible = !state.ended;
    for (const [index, region] of regions.entries()) {
      const { x, y, width, anchor } = rectangles[index];
      const seat = state.seats.find(item => item.id === slots[index]);
      const action = seat.tableAction;
      const cards = action?.type === 'play' ? action : null;
      const pos = layer.globalToLocal(scene.localToGlobal(new Laya.Point(x, y)));
      region.root.pos(pos.x, pos.y).size(width, height);
      region.seatId = seat.id;
      const rowWidth = Math.min(width, Math.max(1, cards?.count ?? 1) * (size.width + 5) * scale - 5 * scale);
      const rowX = clamp(anchor - rowWidth / 2, 0, width - rowWidth);
      region.cards.pos(rowX, TITLE_HEIGHT).scale(scale, scale);

      if (refresh || cards !== region.play || scale !== region.scale || rowWidth !== region.rowWidth) {
        const display = index > 0 && cards?.cards.length > 1
          ? { ...cards, cards: cards.cards.slice().sort(comparePokerCardsByRank) } : cards;
        const starts = stack && animate && cards && actions.includes(cards) ? startingPoints(display, region, index) : null;
        region.pile.draw(display, starts, palette, rowWidth / scale);
        region.play = cards;
        region.scale = scale;
        region.rowWidth = rowWidth;
      }
      if (refresh || action) {
        Laya.timer.clear(region, endFlash);
        region.passFlash = false;
      } else if (passed.has(seat.id)) {
        // A pass and the next lead can share one replay timestamp.
        region.passFlash = true;
        Laya.timer.once(700 / Math.sqrt(speed), region, endFlash);
      }
      const name = seats[index].Seat.General?.CardName || names.seat(seat.id);
      region.action = action;
      region.name = index === 0 ? `${name}（您）` : name;
      region.leading = cards !== null && cards === state.lastPlay;
      region.waiting = state.phase === 202 && state.active === seat.id
        ? index === 0 ? ownControls ? '' : '轮到您出牌' : `${name} · 思考出牌` : '';
      const captionWidth = Math.min(width, Math.max(rowWidth, 232));
      region.caption.x = clamp(anchor - captionWidth / 2, 0, width - captionWidth);
      region.caption.width = captionWidth;
      updateCaption(region);
    }
  }

  function locations() {
    return new Map(regions.map(region => [region.seatId, {
      origin: at(region.cards), scale: region.scale,
      cards: (region.cards._children || []).map(card => ({ id: card.pokerCardId, point: at(card) })),
    }]));
  }

  return { draw, locations, discardArea: () => discardArea };
}
