import { CARD_MINIATURE_STYLES, pokerRevealedHand } from '../../../shared/card-miniatures.js';
import { CARD_OVERLAY_STYLES, SEAT_REVEAL_STYLES, createSeatReveals } from '../../../shared/card-reveals.js';
import { createCountdowns } from '../../../shared/card-countdowns.js';
import { comparePokerCardsByRank } from '../replay/model.js';
import { LUAN_CHAO } from './table-state.js';

export function attachPokerCardDisplay(ctx, scope, scene, seats, names, opening, isCurrentTable) {
  const { document } = ctx;
  const settings = { get: (key, fallback) => ctx.pokerTableCards?.getSetting?.(key, fallback) ?? fallback };
  const host = document.createElement('div');
  host.dataset.sgsPokerCards = 'true';
  const shadow = host.attachShadow({ mode: 'open' });
  const styles = document.createElement('style');
  styles.textContent = CARD_OVERLAY_STYLES + CARD_MINIATURE_STYLES + SEAT_REVEAL_STYLES
    + '.sgs-cards *{box-sizing:border-box}';
  const overlay = document.createElement('div');
  overlay.className = 'sgs-cards sgs-cards-overlay';
  scope.add(ctx.ui.mountStyles?.(shadow));
  shadow.append(styles, overlay);
  (document.body || document.documentElement).append(host);
  const revealContext = { ...ctx, settings };
  const reveals = createSeatReveals(revealContext, overlay);
  const countdowns = createCountdowns(ctx);
  const self = scene.SelfSeatUi;
  let hands;

  function refresh() {
    if (!hands || !isCurrentTable()) {
      reveals.clear();
      countdowns.clear();
      return;
    }
    reveals.update(seats, self, (ui, id) => pokerRevealedHand(revealContext, ui, id, hands.get(id)), scene);
    countdowns.update(seats, settings.get('countdown', true), { poker: true, selectionTimer: opening.countdownTimer() });
  }

  scope.add(() => { countdowns.dispose(); reveals.dispose(); host.remove(); });
  scope.interval(refresh, 250);
  return state => {
    hands = state.ended ? null : new Map(state.seats
      .filter(seat => seat.id !== state.selfSeat && seat.visibleHand.length)
      .map(seat => [seat.id, seat.visibleHand.slice().sort(comparePokerCardsByRank).map(({ id, suit, face, source }) => ({
        id, suit, face, source: source === LUAN_CHAO ? '乱朝' : typeof source === 'number' ? names.skill(source) : source,
      }))]));
    refresh();
  };
}
