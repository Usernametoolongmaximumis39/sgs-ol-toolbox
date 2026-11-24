import { label, roundStatus, seatRole, seatStatus } from './board.js';
import { pokerCardSprite } from './native-card-motion.js';
import { attachHistory } from './native-history.js';
import { attachOpening, attachSkillTips } from './native-opening.js';
import { attachPlayAreas } from './native-plays.js';
import { attachSeatPresentation } from './native-seats.js';
import { attachNativeSkills, handSkillMarks, markHandCard } from './native-skills.js';
import { attachTransfers } from './native-transfers.js';
import { attachNativePlayAudio } from './native-play-audio.js';
import { attachNativeSkillPile } from './native-skill-pile.js';
import { attachReplayBidTips, attachNativeCardChoice, attachReplayPlayButtons } from './native-decisions.js';
import { attachReadOnlyPokerInteractions } from './native-interactions.js';
import { attachPokerTableInfo } from './native-table-info.js';

export const NATIVE_CARD_LAYER = 'sgs-toolbox-poker-native-cards';

export function attachNativeCards({ window: win, ui }, scope, scene, names, soundSettings) {
  const Laya = win.Laya;
  const hand = scene.SelfSeatUi.cardContainer;
  const stack = scene.stackCardContainer;
  const seatContainer = scene.seatContainer;
  const seats = [...seatContainer.seatUIs].sort((a, b) => a.Seat.Index - b.Seat.Index);
  const size = hand.cardUiSize;
  const handLayer = new Laya.Sprite();
  const tableLayer = new Laya.Sprite();
  const playedLayer = new Laya.Sprite();
  handLayer.name = NATIVE_CARD_LAYER;
  tableLayer.name = `${NATIVE_CARD_LAYER}-table`;
  playedLayer.name = `${NATIVE_CARD_LAYER}-played`;
  hand.addChild(handLayer);
  stack.addChild(tableLayer);
  stack.addChild(playedLayer);
  scope.add(() => {
    for (const layer of [handLayer, tableLayer, playedLayer]) {
      if (!layer.destroyed) layer.destroy(true);
    }
  });
  const plays = attachPlayAreas(Laya, scope, scene, seats, handLayer, stack, playedLayer, size, names);
  const info = attachPokerTableInfo(Laya, scope, scene, seats, size, `${NATIVE_CARD_LAYER}-bottom`);
  const transfers = attachTransfers(Laya, scope, scene, seats, handLayer, info.bottomLayer, size);
  const opening = attachOpening(win, scope, scene);
  const tips = attachSkillTips(Laya, scope, scene, names);
  const pileWindow = attachNativeSkillPile(win, scope, scene, seats, size, names);
  const cardChoice = attachNativeCardChoice(win, scope, scene, names);
  const playButtons = attachReplayPlayButtons(Laya, scope, scene);
  const bidTips = attachReplayBidTips(scope, seats);
  const refreshInteractions = attachReadOnlyPokerInteractions(Laya, scope, scene);
  const skills = attachNativeSkills(win, scope, scene, seats, names, soundSettings, pileWindow);
  const playAudio = attachNativePlayAudio(win, scope, seats, soundSettings);
  const stopVoice = () => { skills.stopVoice(); playAudio.stop(); };
  const arrangeSeats = attachSeatPresentation(scope, seatContainer, seats);
  const drawHistory = attachHistory(Laya, scope, scene.rightView?.traceArea, seats, names);
  const bar = scene.replayBar;
  // Leave clearance for the fixed native action row just above the hand.
  const barLift = Math.min(8, bar.y);
  bar.y -= barLift;
  const barBottomGap = scene.height - bar.y;
  const barLayout = { x: bar.x, y: bar.y, width: scene.width, height: scene.height };
  scope.add(() => {
    if (!bar.destroyed && bar.x === barLayout.x && bar.y === barLayout.y) bar.y += barLift;
  });

  function placeDefaultBar() {
    if (barLayout.width === scene.width && barLayout.height === scene.height) return;
    if (bar.x === barLayout.x && bar.y === barLayout.y) {
      barLayout.x = Math.floor((scene.width - bar.width) / 2);
      barLayout.y = Math.max(0, scene.height - barBottomGap);
      bar.pos(barLayout.x, barLayout.y);
    }
    barLayout.width = scene.width;
    barLayout.height = scene.height;
  }
  for (const key of ['spareBtn', 'spareBtnBG', 'coinInfo', 'multiInfo', 'gameRoundInfo']) {
    const control = scene[key];
    if (!control?.visible) continue;
    control.visible = false;
    scope.add(() => { if (!control.destroyed && !control.visible) control.visible = true; });
  }
  for (const seat of seats) {
    const visible = seat.isHpBarVisible;
    seat.SetHpVisible?.(false);
    scope.add(() => { if (!seat.destroyed) seat.SetHpVisible?.(visible); });
  }
  const title = scene.topMenu?.areaServerLabel;
  if (title) {
    const previous = title.text;
    title.text = '三国斗地主录像';
    scope.add(() => { if (title.text === '三国斗地主录像') title.text = previous; });
  }

  function lines(layer, text, width, y) {
    if (!text) return;
    const lineWidth = Math.min(width, Math.max(90, Array.from(text).length * 14 + 22));
    const x = (width - lineWidth) / 2;
    layer.graphics.drawRect(x, y, lineWidth, 22, '#24211ed9');
    label(Laya, layer, text, x + 6, y, lineWidth - 12, 22, { size: 13, color: '#f3e5c8', align: 'center' });
  }

  function mountHand(own, palette) {
    handLayer.destroyChildren();
    const cards = [...own.hand].sort((a, b) => b.rank - a.rank || a.suit - b.suit || a.id - b.id);
    const count = Math.min(own.count ?? cards.length, 64);
    const marked = handSkillMarks(own.skillStates, names.skill);
    const { x, width } = hand.handCardRect;
    const gap = count > 1 ? hand.computeHandCard(count, 0, width).gap : 0;
    for (let i = 0; i < count; i++) {
      const card = pokerCardSprite(Laya, cards[i], size, palette);
      markHandCard(Laya, card, size, marked.get(card.pokerCardId));
      card.pos(Math.trunc(x + i * (size.width + gap)), hand.NORMAL_Y);
      card.visible = !transfers.pending(card.pokerCardId);
      handLayer.addChild(card);
    }
  }

  function openingPanel(state) {
    if (state.phase !== 101 || !state.selection) return null;
    const { candidates, chosen, seconds } = state.selection;
    const general = seats[0].Seat.General?.CardName || names.general(chosen);
    return { candidates, chosen, seconds, text: chosen ? `已选武将 ${general}` : '' };
  }

  function draw(state, slotOrder, log, { animate = false, refresh = false, actions = [], opening: kind, speed = 1 } = {}) {
    const palette = ui.nativeTheme.palette;
    placeDefaultBar();
    refreshInteractions();
    if (refresh) { transfers.clear(); tips.clear(); stopVoice(); }
    const previousHand = actions.some(action => action.type === 'gain' || action.type === 'stash' || action.type === 'discard') ? transfers.handLocations() : null;
    const previousPlays = actions.some(action => action.type === 'clear-play' || action.origin === 'played') ? plays.locations() : null;
    const first = Math.max(0, state.seats.findIndex(seat => seat.role === 1));
    const seatNumbers = [...state.seats.slice(first), ...state.seats.slice(0, first)].map(seat => seat.id);
    for (let i = 0; i < seats.length; i++) {
      const seatUi = seats[i];
      const target = seatUi.Seat;
      const source = state.seats.find(seat => seat.id === slotOrder[i]);
      if (target.PlayerInfo.Nickname !== names.seat(source.id)) {
        target.PlayerInfo.Nickname = names.seat(source.id);
        seatUi.otherTopManager?.UpdatePlayerName?.(target.PlayerInfo);
      }
      if (target.Figure !== source.role) target.SetFigure(source.role);
      if (target.GeneralId !== (source.general || 0)) {
        // Load the portrait through the native seat. The replay supplies no HP or
        // ordinary Fight Landlord skill/skin requests.
        target.DrawGeneralCard(source.general || 0, false, false);
        seatUi.General_CardChanged(null);
      }
      const number = seatNumbers.indexOf(source.id) + 1;
      if (target.FixedViewId !== number) {
        target.FixedViewId = number;
        seatUi.otherTopManager?.SetSeatIndex?.(number);
      }
      target.HandCardCount = source.count ?? 0;
      seatUi.countryUI?.CardNum?.(source.count ?? 0);
    }
    arrangeSeats(state, slotOrder);
    pileWindow.draw(state, slotOrder, palette);
    cardChoice.draw(state, palette);
    skills.draw(state, slotOrder);
    for (const seatUi of seats) if (seatUi.countryUI?.cardNumTxtMax) seatUi.countryUI.cardNumTxtMax.visible = false;
    const ownControls = playButtons.draw(state, slotOrder[0], kind);
    bidTips(state, slotOrder, kind);
    plays.draw(state, slotOrder, playButtons.floor(), palette, { animate, refresh, actions, speed, ownControls });
    tableLayer.graphics.clear();
    tableLayer.destroyChildren();
    mountHand(state.seats.find(seat => seat.id === slotOrder[0]), palette);
    info.draw(state, palette);
    opening.show(openingPanel(state));
    drawHistory(log, state, slotOrder, seatNumbers);
    for (const action of actions) {
      if (action.type === 'gain' || action.type === 'stash') {
        transfers.show(action, slotOrder, { previousHand, previousPlays, area: plays.discardArea(), speed });
      }
      if (action.type === 'discard' || action.type === 'clear-play') {
        transfers.showDiscard(action, slotOrder, { previousHand, previousPlays, area: plays.discardArea(), palette, speed });
      }
      if (action.type === 'skill') {
        tips.show(action, state, slotOrder, seats);
        skills.playVoice(action, slotOrder);
      }
      if (action.type === 'play' || action.type === 'pass' || action.type === 'bid') playAudio.play(action, slotOrder);
    }
    if (state.ended) {
      const width = Math.max(160, stack.width);
      const top = (stack.height - size.height) / 2;
      lines(tableLayer, roundStatus(state), width, top - 26);
      state.seats.forEach((seat, index) => {
        lines(tableLayer, `${seatRole(seat)} ${names.seat(seat.id)} · ${seatStatus(seat)}`, width, top + size.height + 4 + index * 24);
      });
    }
  }

  return { draw, openingReady: opening.ready, stopVoice, closePreview: () => cardChoice.close() || pileWindow.close(),
    size: () => [scene.width, scene.height, hand.width, hand.handCardRect.width, stack.x, stack.y, stack.width, stack.height,
      scene.rightView?.x, scene.rightView?.visible, seatContainer.width, seatContainer.height, ...seats.slice(1).flatMap(seat => [seat.x, seat.y])].join('/') };
}
