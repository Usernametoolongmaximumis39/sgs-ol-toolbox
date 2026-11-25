import { label } from './board.js';
import { POKER_CARD_NODE, pokerCardSprite } from './native-card-motion.js';
import { drawPokerBack } from './poker-assets.js';
import { isFaceUpSkillCard, publicSkillPileName } from './skill-piles.js';

function back(Laya, parent, width, height) {
  const sprite = new Laya.Sprite();
  sprite.size(width, height);
  sprite.mouseEnabled = false;
  if (!drawPokerBack(Laya, sprite.graphics, 0, 0, width, height)) {
    sprite.graphics.drawRect(0, 0, width, height, '#493829', '#cfad6a', 2);
    sprite.graphics.drawRect(5, 5, width - 10, height - 10, '#34291f', '#795c37', 1);
  }
  parent.addChild(sprite);
  return sprite;
}

export function attachTransfers(Laya, scope, scene, seats, handLayer, bottomLayer, size, { live = false } = {}) {
  const deck = live ? null : scene.addChild(new Laya.Sprite());
  if (deck) {
    deck.name = 'sgs-toolbox-poker-deck';
    deck.pos(24, 39);
    back(Laya, deck, 39, 55).pos(4, 4);
    back(Laya, deck, 39, 55);
    label(Laya, deck, '牌堆', 0, 62, 43, 20, { size: 13, color: '#f5e3ba', align: 'center' });
  }
  const layer = new Laya.Sprite();
  layer.name = 'sgs-toolbox-poker-transfers';
  (scene.animationContainer || scene).addChild(layer);
  const discardLabel = label(Laya, layer, '', 0, 0, 1, 22, { size: 14, color: '#ffe19b', align: 'center', bold: true });
  discardLabel.name = 'sgs-poker-discard-status';
  discardLabel.stroke = 2;
  discardLabel.strokeColor = '#17120e';
  discardLabel.visible = false;
  const active = new Set();
  const discardSpots = new Map();
  let discardReadyAt = 0;
  const at = (sprite, x = 0, y = 0) => sprite.localToGlobal(new Laya.Point(x, y));
  const cardById = (root, id) => id > 0 && root?._children?.find(node => node.pokerCardId === id
    && (node.name === POKER_CARD_NODE || live && !node.pokerChoiceCard));
  const slot = (id, slots) => seats[slots.indexOf(id)];
  const pending = id => id > 0 && [...active].some(flight => flight.arriving === id);

  function finish(flight) {
    if (!active.delete(flight)) return;
    flight.update.recover();
    if (!flight.sprite.destroyed) flight.sprite.destroy(true);
    const card = cardById(handLayer, flight.arriving);
    if (card && !pending(flight.arriving)) card.visible = true;
  }
  function clear() {
    for (const flight of active) {
      flight.tween.clear();
      finish(flight);
    }
    Laya.timer.clear(discardLabel, hideDiscard);
    hideDiscard();
    discardSpots.clear();
    discardReadyAt = 0;
  }
  scope.add(() => {
    clear();
    if (!layer.destroyed) layer.destroy(true);
    if (deck && !deck.destroyed) deck.destroy(true);
  });

  function handLocations() {
    return new Map((handLayer._children || []).filter(card => !card.pokerChoiceCard).map(card => [card.pokerCardId, at(card)]));
  }

  function hideDiscard() { discardLabel.visible = false; }

  function fly(sprite, start, end, arriving, duration, delay, render) {
    const from = layer.globalToLocal(start, true);
    const to = layer.globalToLocal(end, true);
    const travel = { progress: 0 };
    const flight = { sprite, arriving };
    active.add(flight);
    flight.update = Laya.Handler.create(null, () => render(travel.progress, from, to), null, false);
    flight.update.run();
    flight.tween = Laya.Tween.to(travel, { progress: 1 }, duration, Laya.Ease.sineOut,
      Laya.Handler.create(null, () => finish(flight)), delay);
    flight.tween.update = flight.update;
  }

  function show(action, slots, { previousHand, previousPlays, area, palette, speed }) {
    const target = slot(action.seat, slots);
    const source = slot(action.from, slots);
    if (!target || action.origin === 'hand' && !source) return;
    for (let i = 0; i < Math.min(action.count, 54) && active.size < 108; i++) {
      const id = action.cards[i]?.id || 0;
      const nativePoint = seat => scene.GetCardsPoint([id], seat.Seat)[0];
      const bottom = cardById(bottomLayer, id);
      let start;
      let wait = 0;
      switch (action.origin) {
        case 'deck': start = deck ? at(deck) : scene.GetCardsPoint([id], null)[0]; break;
        case 'bottom': start = bottom ? at(bottom) : scene.GetCardsPoint([id], null)[0]; break;
        case 'hand': start = (action.from === slots[0] && previousHand?.get(id)) || nativePoint(source); break;
        case 'played': {
          const played = previousPlays?.get(action.from);
          start = played?.cards.find(card => card.id === id)?.point || played?.origin || nativePoint(source || target);
          break;
        }
        case 'discard': {
          const spot = discardSpots.get(id);
          discardSpots.delete(id);
          start = spot?.point || (area ? at(scene, area.x + area.width / 2, area.y + 22) : nativePoint(target));
          wait = Math.max(0, (spot?.readyAt ?? discardReadyAt) - Date.now());
          break;
        }
        default: start = nativePoint(source || target);
      }
      const card = action.type === 'gain' && action.seat === slots[0] && id > 0 ? cardById(handLayer, id) : null;
      const end = card ? at(card) : nativePoint(target);
      const face = action.cards[i];
      const publicStash = action.type === 'stash' && publicSkillPileName(face?.areaSkill || action.skill) && isFaceUpSkillCard(face);
      const sprite = publicStash || (live && (action.origin === 'discard' || action.origin === 'bottom') && id)
        ? layer.addChild(pokerCardSprite(Laya, face, size, palette))
        : back(Laya, layer, size.width, size.height);
      sprite.transferOrigin = action.origin;
      sprite.transferFrom = action.from;
      sprite.transferTo = action.seat;
      if (card) card.visible = false;
      fly(sprite, start, end, card ? id : 0, 550 / Math.sqrt(speed), wait + Math.min(165, 12 * i) / speed, (p, from, to) => {
        sprite.visible = !wait || p > 0;
        sprite.pos(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p - 76 * p * (1 - p));
        const scale = .43 + (card ? .57 : .16) * p;
        sprite.scale(scale, scale);
        sprite.alpha = card ? 1 : 1 - p * .85;
      });
    }
  }

  function showDiscard(action, slots, { previousHand, previousPlays, area, palette, speed }) {
    const source = slot(action.seat, slots);
    if (!source || !area) return;
    const fromTable = action.type === 'clear-play';
    const previous = previousPlays?.get(action.seat);
    const drawn = previous?.cards || [];
    const points = new Map(drawn.map(card => [card.id, card]));
    const scale = Math.min(area.scale, .72, area.width / (size.width + 18));
    const duration = (fromTable ? 480 : 970) / Math.sqrt(speed);
    const count = Math.min(action.count, 54);
    const span = Math.min(count - 1, 5) * 4;
    const x = area.x + (area.width - size.width * scale - span) / 2;
    const y = area.y + 22;
    if (!fromTable) {
      const name = source.Seat.General?.CardName || source.Seat.PlayerInfo.Nickname;
      const p = layer.globalToLocal(at(scene, area.x, y + size.height * scale + 3));
      discardLabel.pos(p.x, p.y);
      discardLabel.width = area.width;
      discardLabel.text = `${name}弃置`;
      discardLabel.visible = true;
      Laya.timer.once(duration, discardLabel, hideDiscard);
    }
    for (let i = 0; i < count && active.size < 108; i++) {
      const card = action.cards[i];
      const id = card?.id || 0;
      const old = fromTable ? (id ? points.get(id) : drawn[i])?.point ?? previous?.origin
        : action.seat === slots[0] ? previousHand?.get(id) : null;
      const start = old || scene.GetCardsPoint([id], source.Seat)[0];
      const end = at(scene, x + Math.min(i, 5) * 4, y);
      const delay = Math.min(60, 8 * i) / speed;
      if (live) {
        const readyAt = Date.now() + duration + delay;
        discardReadyAt = Math.max(discardReadyAt, readyAt);
        if (id) {
          if (discardSpots.size >= 108) discardSpots.delete(discardSpots.keys().next().value);
          discardSpots.set(id, { point: end, readyAt });
        }
      }
      const sprite = id ? pokerCardSprite(Laya, card, size, palette) : back(Laya, layer, size.width, size.height);
      if (id) layer.addChild(sprite);
      sprite.transferOrigin = action.type;
      sprite.transferFrom = action.seat;
      const fromScale = fromTable && previous ? previous.scale : action.seat === slots[0] ? 1 : .85;
      fly(sprite, start, end, 0, duration, delay, (progress, from, to) => {
        const p = Math.min(1, progress / .78);
        sprite.pos(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p - 50 * p * (1 - p));
        const currentScale = fromScale + (scale - fromScale) * p;
        sprite.scale(currentScale, currentScale);
        sprite.alpha = Math.min(1, (1 - progress) / .12);
      });
    }
  }

  return { clear, show, showDiscard, pending, handLocations };
}
