import { nativeAnchor } from '../../../shared/card-reveals.js';
import { read } from '../../../shared/safe-read.js';
import { DIRECTIONS } from './routes.js';

const CAIFENG = 4023;
const MAP_SKILLS = [4021, 4022];
const PEIXIU_SKILLS = [...MAP_SKILLS, CAIFENG];
export const isPeixiuSkill = id => PEIXIU_SKILLS.includes(Number(id));
const items = value => Array.isArray(value) ? value : [];
const cardId = card => Number(card?.CardId);
const skillId = skill => Number(skill?.SkillId ?? skill?.ID);
export const cardSuit = ui => Number(ui.Card?.FlowerOnSeat ?? ui.Card?.CardFlower);
export const isSelected = ui => (ui.Card?.Selected ?? ui.Selected ?? ui.selected) === true;
const isShown = node => !!node && !node.destroyed && node.visible !== false && node._visible !== false;
export const isSelectable = ui => isShown(ui) && (ui.Activated ?? ui.activated) === true && typeof ui.CardUI_Click === 'function';

export function caifengContext(hand) {
  const context = hand?.SelectContext ?? hand?.selectCardContext;
  return (hand?.AreChoosingCard ?? hand?.areChoosingCard) === true && skillId(context?.Skill) === CAIFENG ? context : null;
}

export function gameCanvas(window) {
  const rendered = window.Laya?.Render?.canvas;
  const canvas = rendered?.source ?? rendered;
  return typeof canvas?.getBoundingClientRect === 'function' ? canvas : window.document.getElementById('layaCanvas');
}

function children(node) { return items(node?._children); }

function layer(stage, name, order) {
  return children(stage).find(node => node.name === name || (node.layerOrder ?? node.LayerOrder) === order);
}

function blocksTable(node, stage) {
  return isShown(node) && node.alpha !== 0 && (node.IsModal === true || node.IsFullScreenWindow === true
    || (node.mouseEnabled === true && !node.mouseThrough && node.width >= stage.width * .9 && node.height >= stage.height * .9));
}

export function readBattle(ctx, scene) {
  const stage = ctx.window.Laya?.stage;
  if (!stage) return null;
  if (scene === undefined) scene = read(() => ctx.game.getScene());
  const self = scene?.SelfSeatUi ?? scene?.selfSeatUI, seat = self?.seat;
  const hand = self?.cardContainer ?? self?.CardContainer;
  if (!isShown(scene) || scene.IsViewer || scene.isNormalOver || seat?.IsSelf !== true || seat.IsDead
    || !hand || hand.destroyed || read(() => ctx.game.isReplay(scene))) return null;
  const caifeng = caifengContext(hand);
  if (!caifeng && !items(self.skillItems).some(item => isPeixiuSkill(skillId(item?.Skill)))
    && !PEIXIU_SKILLS.some(id => read(() => seat.HasSkill(id, false, true)) === true)) return null;
  const gameContext = read(() => ctx.game.getClass('GameContext'));
  if (read(() => gameContext.IsViewerOrReplay()) === true) return null;
  const modal = [layer(stage, 'WindowLayer', 4), layer(stage, 'PromptLayer', 6)]
    .some(root => isShown(root) && root.alpha !== 0 && children(root).some(node => blocksTable(node, stage)));
  // Classic advances CurrentRoundPlayerSeat. CurrentRoundSeatID is also
  // exposed, but the poker player uses it and it can be stale here.
  const roundSeat = read(() => gameContext.CurrentRoundPlayerSeat);
  const ownTurn = !!caifeng || seat.InDealRound === true || (hand.SelectContext ?? hand.selectCardContext)?.Purpose === 'deal'
    || (roundSeat ? roundSeat === seat : (seat.InOwnRound2 ?? seat.InOwnRound) === true);
  return { stage, scene, self, seat, hand, modal, ownTurn };
}

export function openMap({ stage, seat, ownTurn, modal }) {
  if (modal || !ownTurn) return null;
  const background = layer(stage, 'BackgroundLayer', 1);
  const shown = map => map?.parent && isShown(map) && map.mapState && !map.isShowingBigMap
    && !map.isScrollDisappearPlaying && isShown(map.boardLayer) && map.boardLayer.alpha !== 0
    && (!map.pendingMapState || map.pendingMapState.mapId === map.mapState.mapId);
  const mounted = background?.getChildByName?.('PeiXiuMapBackground');
  if (isShown(background) && shown(mounted)) return mounted;
  // The native map is also attached to the player's map skills. This covers
  // the background being mounted through an intermediate container.
  for (const id of MAP_SKILLS) {
    const map = read(() => seat.GetGeneralSkill(id).SpecialBackground);
    if (shown(map) && map.displayedInStage !== false && nativeParentsShown(map.parent, stage)) return map;
  }
  return null;
}

function nativeParentsShown(node, stage) {
  for (let depth = 0; node && depth < 32; depth++, node = node.parent) {
    if (!isShown(node) || node.alpha === 0) return false;
    if (node === stage) return true;
  }
  return false;
}

export function ownedCards(hand) {
  const handCards = items(hand.CardUis ?? hand.cardUis);
  const equips = items(hand.EquipCardUis ?? hand.equipCardUis);
  const result = [];
  for (const [list, inHand] of [[handCards, true], [equips, false]]) {
    for (const ui of list) {
      const card = ui?.Card, id = cardId(card);
      if (ui && !ui.destroyed && Number.isInteger(id) && id > 0 && !card.IsVirtualCard) result.push({ ui, card, id, inHand });
    }
  }
  return result;
}

export function setSelection(ui, selected) {
  if (isSelectable(ui) && isSelected(ui) !== selected) ui.CardUI_Click(null);
}

export function selectSuit(hand, context, locks, suit, inverse) {
  if (!context || caifengContext(hand) !== context) return;
  const cards = ownedCards(hand).filter(({ ui }) => isSelectable(ui));
  const matching = cards.filter(entry => {
    const color = cardSuit(entry.ui);
    return !locks.has(entry.id) && DIRECTIONS[color - 1]?.suit === color && (color === suit) !== inverse;
  });
  if (!matching.length) return;
  if (inverse) {
    const wanted = new Set(matching);
    for (const entry of cards) {
      if (caifengContext(hand) !== context) return;
      if (entry.ui.Card === entry.card && !wanted.has(entry)) setSelection(entry.ui, false);
    }
  }
  const selected = inverse || matching.some(({ ui }) => !isSelected(ui));
  for (const entry of matching) {
    if (caifengContext(hand) !== context) return;
    if (entry.ui.Card === entry.card) setSelection(entry.ui, selected);
  }
}

export function actionBar(self) {
  const bar = read(() => self.getButtonBar()) ?? self.buttonBar;
  return isShown(bar) && bar.parent ? bar : null;
}

export function confirmButton(bar) {
  if (!bar) return null;
  const button = bar.getButton?.('btnOK') ?? items(bar.btns).find(node => node.name === 'btnOK');
  return isShown(button) ? { bar, button } : null;
}

export function nativeBox(window, node, x = 0, y = 0, width = node?.width, height = node?.height) {
  if (!(width > 0 && height > 0)) return null;
  const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
    .map(([px, py]) => nativeAnchor(window, node, px, py));
  if (corners.some(point => !point)) return null;
  return {
    left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
    top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)),
  };
}

function flatBox(window, node) {
  if (!node?.render || node.renderVisible === false) return null;
  const { render, renderX, renderY, renderWidth, renderHeight } = node;
  return [renderX, renderY, renderWidth, renderHeight].every(Number.isFinite)
    ? nativeBox(window, render, renderX, renderY, renderWidth, renderHeight) : null;
}

export function barButtonBox(window, bar, button) {
  if (!isShown(button)) return null;
  // Classic buttons are flattened into the native action bar graphics.
  return flatBox(window, button) ?? nativeBox(window, bar, button.x, button.y, button.width, button.height);
}

export function cardBox(window, ui) {
  if (!isShown(ui)) return null;
  return flatBox(window, ui.bmpFace) ?? (ui.parent ? nativeBox(window, ui) : null);
}

export function routeObstacles(window, { scene, self }, bar, cards) {
  const seats = new Set([self, ...items(scene.seatContainer?.seatUIs ?? scene.seatUIs)]);
  const portraits = [...seats].map(ui => {
    const avatar = ui?.seatAvatar ?? ui?.SeatAvatar;
    if (!avatar?.parent || avatar.alpha === 0 || avatar.displayedInStage === false) return null;
    const clip = avatar.scrollRect;
    return nativeBox(window, avatar, clip?.x, clip?.y, clip?.width, clip?.height);
  });
  const controls = [bar, self.spellSelector].filter(node => isShown(node) && node.parent && node.alpha !== 0).flatMap(node => {
    const prompt = node.txtOptMsg;
    return [
      nativeBox(window, prompt, 0, 0, prompt?.contextWidth, prompt?.contextHeight),
      ...items(node.btns).map(button => barButtonBox(window, node, button)),
    ];
  });
  return [...portraits, ...controls, nativeBox(window, self.countdownTimer),
    ...cards.map(({ ui }) => cardBox(window, ui))].filter(Boolean);
}

export function cardAt(window, { hand, stage }, canvas, x, y) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || !(stage.width > 0 && stage.height > 0)) return null;
  const cards = ownedCards(hand).filter(({ ui }) => isShown(ui));
  if (typeof hand.getTextureByPosition === 'function') {
    const face = hand.getTextureByPosition((x - rect.left) * stage.width / rect.width, (y - rect.top) * stage.height / rect.height);
    return face ? cards.find(({ ui }) => ui.bmpFace === face) : null;
  }
  // Non-flat card displays are ordinary Laya nodes, sorted by draw order.
  return cards.reverse().find(({ ui }) => {
    const box = cardBox(window, ui);
    return box && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  });
}
