import { nativeSeat } from '../core/seat.js';

export const CARD_MINIATURE_STYLES = `
.sgs-card-chip.sgs-card-mini{position:relative;display:inline-grid;grid-template-rows:1fr 1fr;align-items:stretch;gap:0;flex:0 0 auto;width:40px;height:58px;padding:0;border:1px solid #988568;border-radius:4px;background:linear-gradient(135deg,#fff9e9,#e4d5b9);color:#252018;box-shadow:0 1px 3px #0005;line-height:1.1;white-space:nowrap;overflow:hidden;vertical-align:middle}
.sgs-card-mini .sgs-card-suit{display:flex;align-items:center;justify-content:center;min-width:0;border-bottom:1px solid #aa906845;font:700 16px/1 Georgia,"Microsoft YaHei",serif;color:#252018;letter-spacing:0}
.sgs-card-mini .sgs-card-name{display:flex;align-items:center;justify-content:center;min-width:0;max-width:none;writing-mode:horizontal-tb;font:700 16px/1 "Microsoft YaHei",sans-serif;letter-spacing:0;overflow:hidden;text-overflow:clip}
.sgs-card-mini.is-possible{border-style:dashed;background:#d1d3d5;color:#555b63;filter:grayscale(1);grid-template-rows:minmax(0,1fr) minmax(0,1fr) auto}.sgs-card-mini.is-possible .sgs-card-suit,.sgs-card-mini.is-possible .sgs-card-name{font-size:14px}.sgs-card-certainty{display:block;text-align:center;font-size:10px;line-height:11px;padding-bottom:1px;color:inherit}.sgs-card-mini.is-red .sgs-card-suit{color:#b72a24}
`;

export const CARD_SUITS = { 1: '♥', 2: '♦', 3: '♠', 4: '♣' };
const POKER_SUITS = [0, 3, 1, 4, 2];

export function colorCardRank(label, suit, fourColors) {
  if (!fourColors) return;
  if (suit === 2) label.style.color = '#89bdf5';
  if (suit === 4) label.style.color = '#8ac8a7';
}

export function createCardMiniature(document, { id, suit, rank, name, description, possible, compact, fourColors }) {
  const chip = document.createElement('span');
  chip.className = 'sgs-card-chip sgs-card-mini';
  if (possible) chip.classList.add('is-possible');
  if (compact) chip.classList.add('is-compact');
  if (suit === 1 || suit === 2) chip.classList.add('is-red');
  chip.dataset.cardId = String(id);
  chip.title = description;
  chip.setAttribute('aria-label', description);
  const rankLabel = document.createElement('span');
  rankLabel.className = 'sgs-card-suit';
  rankLabel.textContent = rank;
  colorCardRank(rankLabel, suit, fourColors);
  const nameLabel = document.createElement('span');
  nameLabel.className = 'sgs-card-name';
  nameLabel.textContent = name;
  chip.append(rankLabel, nameLabel);
  return chip;
}

export function pokerRevealedHand({ document, settings }, ui, seatId, cards) {
  if (!cards?.length) return null;
  const fourColors = settings.get('fourColors', false);
  const labels = settings.get('labels', true);
  const name = nativeSeat(ui)?.General?.CardName || `${seatId + 1}号座`;
  return {
    count: cards.length,
    label: `${name}已知手牌，${cards.length} 张`,
    signature: JSON.stringify([fourColors, labels, cards]),
    render: () => cards.map(({ id, suit, face, source }) => {
      const displaySuit = POKER_SUITS[suit];
      const rank = `${CARD_SUITS[displaySuit] || ''}${face}`;
      const chip = createCardMiniature(document, { id, suit: displaySuit, rank, name: source,
        description: `${rank} · ${source}`, compact: true, fourColors });
      chip.classList.toggle('has-only-rank', !labels);
      return chip;
    }),
  };
}
