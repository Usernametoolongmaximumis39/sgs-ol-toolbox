import { isWildCard } from './model.js';

const PREFIX = 'activityCards/poker_';
const SUITS = ['', 'spade', 'heart', 'club', 'diamond'];

function texture(Laya, name) {
  const image = Laya.loader?.getRes?.(`${PREFIX}${name}.png`);
  return image?.bitmap && !image.destroyed && !image.bitmap.destroyed && image.width > 0 && image.height > 0
    ? image : null;
}

export function drawPokerBack(Laya, graphics, x, y, width, height) {
  const back = Laya.loader?.getRes?.('cards/cardBack_0.png') || Laya.loader?.getRes?.('cardsNew/cardBack_0.png');
  if (!back?.bitmap || back.destroyed || typeof graphics.drawTexture !== 'function') return false;
  graphics.drawTexture(back, x, y, width, height);
  return true;
}

// This atlas belongs to the classic client's preload group. Use its live
// texture objects, without changing their sizes or removing them from Laya.
export function drawPokerArtwork(Laya, graphics, card, x, y, width, height) {
  const background = texture(Laya, 'card_bg');
  if (!background || typeof graphics.drawTexture !== 'function') return null;
  const suit = SUITS[card.suit];
  if (!suit) {
    if (card.rank !== 16 && card.rank !== 17) return null;
    const joker = texture(Laya, card.rank === 17 ? 'joker_big' : 'joker_small');
    graphics.drawTexture(background, x, y, width, height);
    if (!joker) return 'background';
    drawPart(joker, .27, .28, .46);
    return 'face';
  }
  const color = card.red ? 'red' : 'black';
  const rank = (isWildCard(card) && texture(Laya, `oringe_${card.face}`)) || texture(Laya, `${color}_${card.face}`);
  const small = texture(Laya, suit);
  const large = texture(Laya, `${suit}_big`);
  if (!rank || !small || !large) return null;
  graphics.drawTexture(background, x, y, width, height);
  drawPart(rank, .05, .025, .42);
  drawPart(small, .075, .21, .35);
  drawPart(large, .215, .39, .57);
  return 'face';

  function drawPart(image, left, top, scale) {
    const partWidth = width * scale;
    graphics.drawTexture(image, x + width * left, y + height * top, partWidth, partWidth * image.height / image.width);
  }
}
