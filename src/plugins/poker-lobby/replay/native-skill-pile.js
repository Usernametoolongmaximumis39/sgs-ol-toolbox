import { pokerCardSprite } from './native-card-motion.js';
import { escapeNativeText, replayPopupManager } from './native-opening.js';
import { comparePokerCardsByRank } from './model.js';

const WINDOW = 'SkillBuQuWindow';
const SORTED_PILES = new Set([46, 47]); // 破军、权计
const isFaceUp = card => card && !card.hidden && card.rank > 0;

export function attachNativeSkillPile(win, scope, scene, seats, size, names) {
  const manager = replayPopupManager(scene);
  const available = Boolean(typeof manager?.GetWindow === 'function' && win.Laya.ClassUtils.getClass(WINDOW));
  let state, slots, palette;
  let active, panel, signature;

  function closed(name) {
    if (name !== WINDOW) return;
    active = panel = signature = undefined;
  }

  function close() {
    const current = panel;
    const wasOpen = Boolean(current && !current.destroyed);
    closed(WINDOW);
    if (wasOpen) current.Close(true);
    return wasOpen;
  }

  function getPile(owner, skill) {
    const seat = state?.seats.find(candidate => candidate.id === owner);
    const pile = seat?.skillPiles.find(candidate => candidate.skill === skill);
    // The display is sorted without mutating the tracked pile; unknown cards stay face down at the end.
    if (!pile?.cards.length) return null;
    const cards = SORTED_PILES.has(skill) ? pile.cards.slice().sort((a, b) => {
      if (!isFaceUp(a)) return isFaceUp(b) ? 1 : 0;
      return isFaceUp(b) ? comparePokerCardsByRank(a, b) : -1;
    }) : pile.cards;
    return { seat, cards };
  }

  function render({ seat, cards }, opening) {
    const skillName = active.skill ? names.skill(active.skill) : '技能区';
    const nativeSeat = seats[slots.indexOf(seat.id)]?.Seat;
    const general = nativeSeat?.General?.CardName || names.general(seat.general);
    const title = escapeNativeText(`${general} · ${skillName}（${cards.length}张）`);
    const next = JSON.stringify([title, ...cards.map(card => card && [card.id, card.rank, card.suit, card.wild, card.wildSkill, card.virtual])]);
    if (next === signature) return;
    signature = next;
    const target = panel;
    function addCard(card) {
      const sprite = pokerCardSprite(win.Laya, card, size, palette);
      sprite.clear = () => { if (!sprite.destroyed) sprite.destroy(true); };
      target.cardUIList.push(sprite);
      target.contentSprite.addChild(sprite);
    }
    if (opening) {
      // The stock window supplies the title, layout and close button. Its normal
      // card factory is replaced only for this invocation with replay data.
      const restore = scope.patch(target, 'createNormalCard', () => row => addCard(row.card));
      try {
        scene.ged.A(WINDOW, null, { ID: 0, OutsidePopWinTitle: () => title }, cards.map(card => ({ card })), false);
      } finally { restore(); }
    } else {
      target.removeCardUI();
      cards.forEach(addCard);
      target.Title = title;
      target.layout();
    }
  }

  function open(owner, skill) {
    if (!available || scope.closed || state?.ended) return;
    const pile = getPile(owner, skill);
    if (!pile || active?.owner === owner && active.skill === skill && panel?.parent) return;
    close();
    if (manager.GetWindowData(WINDOW)?.parent) return;
    panel = manager.GetWindow(WINDOW, false);
    if (typeof panel?.createNormalCard !== 'function' || typeof panel.removeCardUI !== 'function') {
      panel = undefined;
      return;
    }
    active = { owner, skill, perspective: slots[0] };
    render(pile, true);
  }

  function draw(next, seatOrder, colors) {
    state = next;
    slots = seatOrder;
    palette = colors;
    if (!active) return;
    if (panel.destroyed || !panel.parent) { closed(WINDOW); return; }
    const pile = getPile(active.owner, active.skill);
    if (next.ended || slots[0] !== active.perspective || !pile) close();
    else render(pile, false);
  }

  if (available) {
    const receiver = {};
    scene.ged.on('windowClosed', receiver, closed);
    scope.add(() => scene.ged.off('windowClosed', receiver, closed));
    scope.add(close);
  }
  return { available, open, draw, close };
}
