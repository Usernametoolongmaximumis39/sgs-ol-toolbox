import { findNativeListenerOwner } from '../../../shared/native-manager.js';
import { attachOpening, attachSkillTips, escapeNativeText, replayPopupManager } from '../replay/native-opening.js';
import { pokerCardSprite } from '../replay/native-card-motion.js';
import { attachNativeCardChoice, attachReplayBidTips, bidLabels, nativeActionBarY } from '../replay/native-decisions.js';
import { attachHistory } from '../replay/native-history.js';
import { attachNativePlayAudio, attachPokerSceneAudio, nativePokerSoundSettings } from '../replay/native-play-audio.js';
import { attachPlayAreas } from '../replay/native-plays.js';
import { attachTransfers } from '../replay/native-transfers.js';
import { attachSeatPresentation } from '../replay/native-seats.js';
import { attachNativeSkills, handSkillMarks, markHandCard } from '../replay/native-skills.js';
import { PUBLIC_GAIN_MARKS } from '../replay/skill-states.js';
import { attachNativeSkillPile } from '../replay/native-skill-pile.js';
import { attachPokerTableInfo } from '../replay/native-table-info.js';
import { playType } from '../replay/model.js';
import { pokerSkillsFor } from '../poker-skills.js';
import { attachPokerKeyboard } from './table-keyboard.js';
import { withClassicPokerContext } from './classic-context.js';
import { attachNativePokerCountdown, startNativePokerCountdown } from './native-countdown.js';
import { attachClassicPokerInteractions } from './native-interactions.js';
import { attachClassicPokerProfiles } from './native-profile.js';
import { attachClassicPokerSettlement } from './native-settlement.js';
import { attachPokerTrusteeOverlay } from './native-trustee.js';
import { attachPokerQuickChat } from './native-chat.js';
import { attachPokerQuickProps } from './native-quick-props.js';
import { attachPokerSkins } from './native-skins.js';
import { attachPokerCardDisplay } from './table-card-display.js';
import { GENERAL_SELECTION_PHASE_LABEL } from './table-state.js';

const CARD_RISE = 12;
const FIGURE_TEXTURE = { 1: 'figure_fightlord_1', 3: 'figure_fightlord_3' };
const EMPTY_INFO = { bottom: [], score: null, rate: null, remaining: null };

function choice(key, title, invoke, enabled = true, selected = false) {
  return { key: `poker-live-${key}`, title, invoke, enabled, selected };
}

export function mountPokerTableView(ctx, scope, scene, names, input) {
  const { window: win } = ctx;
  const { Laya } = win;
  const clockNow = () => win.performance?.now?.() ?? Date.now();
  const self = scene.SelfSeatUi;
  const hand = self.cardContainer;
  const handLayer = scene.SelfSeatUi.cardContainer.addChild(new Laya.Sprite());
  const playLayer = scene.addChild(new Laya.Sprite());
  handLayer.name = 'sgs-toolbox-poker-live-hand';
  handLayer.mouseThrough = true;
  playLayer.mouseEnabled = false;
  playLayer.name = 'sgs-toolbox-poker-live-plays';
  const seats = scene.seatContainer.seatUIs;
  const windows = replayPopupManager(scene);
  const slots = seats.map(seat => seat.Seat.Index);
  const bar = self.getButtonBar();
  const options = new Map();
  const event = Laya.Event.CLICK;
  const ok = bar.ButtonOk;
  const cancel = bar.ButtonCancel;
  const hint = bar.btnReset;
  const main = [ok, cancel, hint].filter(Boolean);
  const barHeight = bar.height;
  const messageY = bar.txtOptMsg.y;
  const handTop = parent => parent.globalToLocal(hand.localToGlobal(new Laya.Point(0, hand.NORMAL_Y))).y;
  const plays = attachPlayAreas(Laya, scope, scene, seats, handLayer, scene.stackCardContainer, playLayer, hand.cardUiSize, {
    seat: id => seats[slots.indexOf(id)].Seat.PlayerInfo.Nickname,
  });
  const info = attachPokerTableInfo(Laya, scope, scene, seats, hand.cardUiSize, 'sgs-toolbox-poker-live-bottom');
  const transfers = typeof scene.GetCardsPoint === 'function' && Laya.Tween?.to && Laya.Handler?.create
    ? attachTransfers(Laya, scope, scene, seats, handLayer, info.bottomLayer, hand.cardUiSize, { live: true }) : null;
  const skillTips = attachSkillTips(Laya, scope, scene, names);
  const skinControls = attachPokerSkins(ctx, scope, scene, input);
  const opening = attachOpening(win, scope, scene, {
    choose: input.choose, confirm: input.confirmChoice,
    skillsFor: ids => pokerSkillsFor(ctx, { Skills: ids }),
    preview: (id, ids) => skills.previewGeneral(state.selfSeat, id, ids, slots),
    withContext: run => withClassicPokerContext(win, scene, run, true),
    canSwap: input.canSwapGeneral,
    hasSkin: skinControls.hasSkin,
    openSkin: skinControls.open,
    startCountdown(timer, offer) {
      if (!startNativePokerCountdown(timer, offer, clockNow())) return null;
      return () => { if (!timer.destroyed) timer.Stop(); };
    },
    repaint: () => scope.timeout(() => { if (state) render(state); }, 0),
  });
  const cardChoice = attachNativeCardChoice(win, scope, scene, names, {
    toggle: input.toggleChoiceCard, confirm: input.confirmChoice, cancel: input.cancelChoice,
    handTop: parent => handTop(parent) - CARD_RISE,
  });
  const bids = attachReplayBidTips(scope, seats);
  const showCountdown = attachNativePokerCountdown(scope, self, seats, clockNow);
  const pileWindow = attachNativeSkillPile(win, scope, scene, seats, hand.cardUiSize, names);
  const soundSettings = nativePokerSoundSettings(scene.ged);
  const skills = attachNativeSkills(win, scope, scene, seats, names, soundSettings, pileWindow, input.activateSkill);
  const playAudio = attachNativePlayAudio(win, scope, seats, soundSettings);
  const sceneAudio = attachPokerSceneAudio(win, scope, soundSettings);
  const history = attachHistory(Laya, scope, scene.rightView?.traceArea, seats, names);
  const askSurrender = () => {
    if (!input.canSurrender() || tableExitPrompt()) return false;
    scene.ged.ShowConfirmBtnLabel?.('投降', '确认投降？本局按失败结算。', scope, input.surrender, '取消');
    return true;
  };
  const confirmation = findNativeListenerOwner(scene.ged, ['SHOW_COMFIRM_TIPS_EVENT'],
    caller => typeof caller?.HideConfirmWin === 'function');
  let escapeCallback;
  const tableExitPrompt = () => {
    const prompt = confirmation?.ConfirmWin;
    const buttons = prompt?.parent ? prompt.confirmData?.buttonArr : undefined;
    if (escapeCallback && buttons?.some(button => button.callBack === escapeCallback)) return 'escape';
    if (buttons?.some(button => button.thisObject === scope)) return 'surrender';
    return null;
  };
  const closeTableExitPrompt = () => { if (tableExitPrompt()) confirmation.HideConfirmWin(); };
  scope.add(closeTableExitPrompt);
  const tableActions = attachClassicPokerInteractions(ctx, scope, scene, { ...input, askSurrender });
  const quickChat = attachPokerQuickChat(ctx, scope, scene, input, soundSettings);
  const quickProps = attachPokerQuickProps(ctx, scope, scene, input);
  const profiles = attachClassicPokerProfiles(ctx, scope, scene, seats, input.tableId, input.isCurrentTable);
  const settlementWindow = attachClassicPokerSettlement(ctx, scope, scene, input.leave,
    () => scope.timeout(() => { if (state) render(state); }, 0));
  const layoutSeats = attachSeatPresentation(scope, scene.seatContainer, seats);
  const drawTableCards = attachPokerCardDisplay(ctx, scope, scene, seats, names, opening, input.isCurrentTable);
  const drawTrusteeOverlay = attachPokerTrusteeOverlay(win, scope, scene, input);
  const keyboard = attachPokerKeyboard(ctx, scope, scene);
  const appliedSkins = new Map();
  let state, lastStatus, lastRecord, playedEntry = false, playedResult = false;
  let targets = [];
  const targetHints = new Map();

  const portraits = seats.map(ui => {
    const owner = ui.otherTopManager;
    const mask = owner?.overMask;
    if (!mask?.on || !owner.ShowSkillTips) return null;
    const id = ui.Seat.Index;
    const key = `poker-live-target-${id}`;
    const invoke = () => {
      if (scope.closed || !state?.decision?.targetChoices || state.pending
        || !state.decision.options.some(option => option.id === id)) return;
      input.choose(id);
    };
    mask.on(event, scope, invoke);
    scope.add(() => mask.off(event, scope, invoke));
    return { id, invoke, node: ui.seatAvatar || ui, ui, owner, key, title: names.seat(id) };
  }).filter(Boolean);

  function setTargetSelected(ui, selected) {
    if (ui.destroyed || !ui.Seat || Boolean(ui.Seat.Selected) === selected) return;
    ui.Seat.Selected = selected;
    ui.Seat_SelectedChanged?.();
  }
  scope.add(() => { for (const { ui } of portraits) setTargetSelected(ui, false); });

  function drawTargets(decision) {
    const visible = new Set();
    for (const target of portraits) {
      const active = !state.pending && decision?.targetChoices && decision.options.some(option => option.id === target.id);
      const selected = Boolean(decision?.targetChoices && decision.selectedOptions.has(target.id));
      setTargetSelected(target.ui, selected);
      const hint = active ? selected ? '已选目标' : '选择目标' : '';
      if (targetHints.get(target.id) !== hint) {
        target.owner.ShowSkillTips(hint);
        targetHints.set(target.id, hint);
      }
      if (!active) continue;
      visible.add(target.id);
      targets.push(target);
    }
    return visible;
  }

  bar.Reset();
  bar.mouseEnabled = true;
  bar.txtOptMsg.name = 'poker-live-status';
  for (const button of main) {
    button.mouseEnabled = true;
    button.off(event, bar, bar.Button_Click);
  }
  // Classic draws these buttons into the bar, so Laya delivers pointer events
  // to the bar rather than to a separate display node for each button.
  const clickAction = click => {
    if (scope.closed) return;
    const point = bar.globalToLocal(new Laya.Point(click.stageX, click.stageY));
    const target = targets.find(({ node, parent }) => parent === bar && node.visible && node.enabled
      && point.x >= node.x && point.x < node.x + node.width
      && point.y >= node.y && point.y < node.y + node.height);
    if (target) {
      click.stopPropagation?.();
      keyboard.focus(target.key);
      target.invoke();
    }
  };
  bar.on(event, scope, clickAction);
  scope.add(() => bar.off(event, scope, clickAction));
  const menu = scene.topMenu;
  const defaultBack = menu?.et;
  const back = typeof defaultBack === 'function' && menu.backBtn;
  const onBack = () => {
    if (!state || tableExitPrompt()) return;
    if (state.ended) { input.leave(); return; }
    if (askSurrender() || !input.canEscape()) return;
    // The stock dialog supplies the escape warning, labels and button styles.
    const restore = scope.patch(scene, 'leaveGameHandler', () => input.escape);
    escapeCallback = scene.leaveGameHandler;
    try { scene.leaveGameHandler2(); }
    finally { restore(); }
  };
  if (back) {
    const wasEnabled = back.enabled;
    const originalName = back.name;
    back.name = 'poker-live-back';
    const restoreLayout = typeof menu.ReLayoutBtnByScene === 'function' && scope.patch(menu, 'ReLayoutBtnByScene', original => function (...args) {
      const result = Reflect.apply(original, this, args);
      // The borrowed top menu can still be laid out for the hidden origin.
      if (!back.visible && Number.isFinite(menu.btnStartX)) {
        back.visible = true;
        back.x = menu.btnStartX - back.width + 1;
        menu.btnStartX = back.x;
      }
      return result;
    });
    if (restoreLayout) menu.OnStageResize();
    back.off(event, menu, defaultBack);
    back.on(event, scope, onBack);
    scope.add(() => {
      if (restoreLayout) restoreLayout();
      if (back.destroyed) return;
      back.off(event, scope, onBack);
      back.on(event, menu, defaultBack);
      back.enabled = wasEnabled;
      back.name = originalName;
      if (restoreLayout) menu.OnStageResize();
    });
  }

  function updateStatus(draft, nativeChoice) {
    const challenge = state.challenge;
    const faces = challenge?.cards.map(card => card.face).join(' ');
    const comparison = challenge && `需压过 ${faces ? playType(challenge.cardType, challenge.count) + ' ' + faces : `${challenge.count}张`}`;
    const wildPrompt = state.decision?.kind === 'wild' && state.decision.title;
    const bid = state.bidding;
    const called = bid?.seat === state.selfSeat && bid.decision !== null && bidLabels(bid.grab)[bid.decision ? 0 : 1];
    const statusInWindow = draft && state.status === GENERAL_SELECTION_PHASE_LABEL
      || nativeChoice && state.status === state.decision?.title;
    const status = statusInWindow ? '' : state.status;
    const text = [wildPrompt || called || status, comparison].filter(Boolean).join(' · ');
    if (lastStatus !== text) {
      lastStatus = text;
      bar.OperateMessage = escapeNativeText(text);
    }
  }

  function setButton(button, action) {
    button.visible = Boolean(action);
    button.enabled = Boolean(action?.enabled) && !state.pending;
    if (!action) return;
    button.name = action.key;
    const title = action.selected ? `已选 ${action.title}` : action.title;
    button.label = title;
    if (button.enabled) targets.push({ node: button, parent: bar, key: action.key, title, invoke: action.invoke });
  }

  function drawOptions(items) {
    for (const [key, button] of options) {
      if (items.some(action => action.key === key)) continue;
      bar.removeDrawChild(button);
      options.delete(key);
    }
    const width = Math.max(70, bar.width);
    const columns = Math.max(1, Math.min(8, Math.floor(width / 117)));
    const rows = Math.ceil(items.length / columns);
    items.forEach((action, index) => {
      let button = options.get(action.key);
      if (!button) {
        button = new ok.constructor();
        button.InitSkin('selfSeatOkBtn_normal', 'selfSeatOkBtn_over', 'selfSeatOkBtn_down', 'selfSeatOkBtn_disabled');
        bar.initBtnLabel(button, action.title);
        bar.addDrawChild(button, 1);
        button.mouseEnabled = true;
        options.set(action.key, button);
      }
      setButton(button, action);
      const column = index % columns;
      const remaining = Math.min(columns, items.length - index + column);
      const span = Math.min(116, width / columns);
      button.size(span - 6, 32);
      if (button.labelWidth > button.width - 12) {
        button.label = `${Array.from(button.label).slice(0, 5).join('')}…`;
        if (button.Background) button.Background.ToolTip = action.title;
      } else if (button.Background) {
        button.Background.ToolTip = null;
      }
      button.pos(Math.floor((width - remaining * span) / 2 + column * span), Math.floor(index / columns) * 38);
    });
    return rows ? rows * 38 + 12 : 0;
  }

  function drawHand(nativeChoice) {
    handLayer.destroyChildren();
    const cardTargets = [];
    const decision = state.decision;
    const fromHand = Boolean(decision?.fromHand && decision.cards);
    const showChoices = !nativeChoice && Boolean(decision?.cards) && !fromHand && !decision.copyCard;
    const isChoice = fromHand || showChoices;
    const eligibleHand = fromHand && new Set(decision.cards.filter(card => !card.disabled).map(card => card.id));
    const cards = showChoices ? decision.cards : state.hand;
    const { x: handLeft, width } = hand.handCardRect;
    const gap = cards.length > 1 ? hand.computeHandCard(cards.length, 0, width).gap : 0;
    const size = hand.cardUiSize;
    const pitch = size.width + gap;
    const own = state.seats.find(seat => seat.id === state.selfSeat);
    const marked = handSkillMarks(own.skillStates, names.skill);
    for (const { id, source } of own.visibleHand) {
      if (!PUBLIC_GAIN_MARKS.has(source)) continue;
      const labels = marked.get(id) || new Set();
      labels.add(names.skill(source));
      marked.set(id, labels);
    }
    const selected = isChoice ? decision.selected : state.selected;
    const enabled = !state.pending && !state.ended && !state.trustee && !state.trusteePending
      && (isChoice ? decision.max > 0 : !decision);
    const selectCard = decision?.giveFromHand ? input.giveCard : isChoice ? input.toggleChoiceCard : input.toggleCard;
    cards.forEach((card, index) => {
      const node = pokerCardSprite(Laya, card, size, ctx.ui.nativeTheme.palette);
      node.pokerChoiceCard = showChoices;
      node.visible = showChoices || !transfers?.pending(node.pokerCardId);
      const disabled = showChoices && card.disabled || fromHand && !eligibleHand.has(card.id);
      if (disabled) node.alpha = fromHand ? .42 : .55;
      if (!showChoices && !card.hidden) markHandCard(Laya, node, size, marked.get(card.id));
      node.name = `poker-live-${showChoices ? 'choice-' : ''}card-${card.id}`;
      const x = Math.round(handLeft + index * pitch);
      node.pos(x, hand.NORMAL_Y - (selected.has(card.id) ? CARD_RISE : 0));
      handLayer.addChild(node);
      if (!enabled || disabled) return;
      if (fromHand && gap < 0 && index < cards.length - 1 && Laya.Rectangle) {
        const stripWidth = Math.round(handLeft + (index + 1) * pitch) - x;
        node.hitArea = new Laya.Rectangle(0, 0, stripWidth, size.height);
      }
      const select = () => selectCard(card.id);
      node.mouseEnabled = true;
      node.on(event, scope, () => { keyboard.focus(node.name); select(); });
      cardTargets.push({ node, key: node.name, title: card.hidden ? '暗牌' : `${card.symbol || ''}${card.face}`, invoke: select });
    });
    return cardTargets;
  }

  function render(snapshot) {
    if (scope.closed || scene.destroyed) return;
    state = snapshot;
    const canEscape = !state.ended && input.canEscape();
    if (state.ended || !canEscape && tableExitPrompt() === 'escape') closeTableExitPrompt();
    if (!state.history.length && lastRecord) {
      transfers?.clear();
      skillTips.clear();
    }
    const added = state.history.slice(state.history.indexOf(lastRecord) + 1);
    lastRecord = state.history.at(-1);
    const movements = added.filter(action => action.type === 'stash' || action.type === 'discard' || action.type === 'clear-play'
      || (action.type === 'gain' && (action.skill || ['bottom', 'hand', 'discard', 'played'].includes(action.origin))));
    const previousHand = movements.length ? transfers?.handLocations() : null;
    const previousPlays = movements.some(action => action.origin === 'played') ? plays.locations() : null;
    targets = [];
    if (back) back.enabled = state.ended ? state.canLeave : canEscape || input.canSurrender();
    const { decision, bidding, phase } = state;
    const palette = ctx.ui.nativeTheme.palette;
    const countdown = input.getCountdown();
    const skillChoice = decision?.kind === 'skill-choice' ? {
      ...decision, pending: state.pending, index: `${decision.key}:${decision.skill}`,
    } : null;
    const confirmation = skillChoice?.mode === 'confirm' && skillChoice.options.length === 1 ? skillChoice.options[0] : null;
    const boardState = { phase: phase ?? 202, bidding, active: state.turnSeat, ended: state.ended,
      skillActions: state.skills, skillChoice, lastPlay: state.lastPlay, logLength: state.history.length, seats: state.seats.map(seat => {
      const revealed = state.reveal?.seat === seat.id && state.reveal;
      const played = state.played.find(action => action.seat === seat.id);
      const tableAction = revealed ? { ...revealed, type: 'play', count: revealed.cards.length, caption: '突袭' }
        : played;
      return { ...seat, general: seat.generalId, skills: seat.skillIds, tableAction };
    }) };
    const first = slots.indexOf(boardState.seats.find(seat => seat.role === 1)?.id);
    const seatNumbers = [];
    for (const [index, ui] of seats.entries()) {
      const model = ui.Seat;
      const seat = boardState.seats.find(row => row.id === model.Index);
      const number = first < 0 ? index + 1 : (index - first + seats.length) % seats.length + 1;
      seatNumbers[number - 1] = seat.id;
      if (model.FixedViewId !== number) {
        model.FixedViewId = number;
        ui.otherTopManager?.SetSeatIndex?.(number);
      }
      const roleChanged = model.Figure !== (seat.role ?? 0);
      if (roleChanged) model.SetFigure(seat.role ?? 0);
      const generalChanged = model.GeneralId !== (seat.generalId ?? 0);
      if (generalChanged) withClassicPokerContext(win, scene, () => {
        model.DrawGeneralCard(seat.generalId ?? 0, false, false);
        ui.General_CardChanged(null);
        ui.SetHpVisible(false);
      });
      const skin = seat.skin == null && seat.id === state.selfSeat && seat.generalId
        ? skinControls.saved(seat.generalId)
        : { id: seat.skin || 0, dynamic: seat.skinDynamic, type: seat.skinType };
      const previous = appliedSkins.get(seat.id);
      if (seat.generalId && (generalChanged || !previous || previous.id !== skin.id
          || previous.dynamic !== skin.dynamic || previous.type !== skin.type
          || model.SkinID >= 0 && model.SkinID !== skin.id)) {
        if (skin.id || model.SkinID > 0 || previous?.id && !generalChanged) {
          withClassicPokerContext(win, scene, () => model.SetGeneralSkin?.(seat.generalId, skin.id, skin.dynamic, skin.type));
        }
        appliedSkins.set(seat.id, skin);
      }
      if (roleChanged && FIGURE_TEXTURE[seat.role]) {
        ui.SetFigure?.(FIGURE_TEXTURE[seat.role]);
        if (ui.otherTopManager) ui.spPosLayout?.(ui.otherTopManager.x, ui.otherTopManager.y);
        if (ui.figureManager?.currentFigure) ui.figureManager.currentFigure.mouseEnabled = false;
      }
      const country = ui.countryUI;
      const countKnown = seat.count != null;
      if (countKnown) {
        model.HandCardCount = seat.count;
        country?.CardNum?.(seat.count);
      }
      if (country?.cardNumTxt) country.cardNumTxt.visible = countKnown;
      if (country?.cardNumBg) country.cardNumBg.visible = countKnown;
      if (country?.cardNumTxtMax) country.cardNumTxtMax.visible = false;
    }
    layoutSeats(boardState, slots);
    showCountdown(countdown?.seat === state.selfSeat && (state.trustee || state.trusteePending) ? null : countdown);
    info.draw(state.ended ? EMPTY_INFO : state, palette);
    bids(boardState, slots, phase === 103 && !bidding && first >= 0 ? 'landlord' : null);
    const draft = decision?.kind === 'general';
    opening.show(draft ? {
      key: decision.draftKey, candidates: decision.options.map(option => option.id),
      skills: new Map(decision.options.filter(option => option.skills).map(option => [option.id, option.skills])),
      replaceable: new Set(decision.options.filter(option => option.canSwap).map(option => option.id)),
      chosen: decision.selectedOptions.values().next().value,
      canConfirm: decision.canConfirm, pending: state.pending, countdown,
      seconds: countdown && Math.ceil((countdown.expiresAt - clockNow()) / 1000),
      text: state.pending ? state.status : '',
    } : null);
    const nativeChoice = cardChoice.draw({
      skillChoice: skillChoice?.cards?.length && !skillChoice.options.length && !skillChoice.fromHand ? skillChoice : null,
      ended: state.ended,
    }, palette);
    drawTableCards(state);
    const nativeSkills = withClassicPokerContext(win, scene, () => skills.draw(boardState, slots));
    pileWindow.draw(boardState, slots, palette);
    history(state.history, boardState, slots, seatNumbers);
    bar.visible = !settlementWindow.isReady();
    if (state.ended) {
      setButton(ok, choice('leave', '返回大厅', input.leave, state.canLeave));
      setButton(cancel, null);
    } else if (decision?.kind === 'bid') {
      setButton(ok, choice('option-1', decision.options[0].label, () => input.choose(1)));
      setButton(cancel, choice('option-0', decision.options[1].label, () => input.choose(0)));
    } else if (draft || nativeChoice || state.trustee) {
      setButton(ok, null);
      setButton(cancel, null);
    } else if (decision) {
      setButton(ok, confirmation ? choice(`option-${confirmation.id}`, confirmation.label,
        () => input.choose(confirmation.id), confirmation.enabled !== false)
        : decision.canConfirm !== undefined && choice('choice-confirm', decision.copyCard ? '复制' : '确定', input.confirmChoice, decision.canConfirm));
      setButton(cancel, decision.canCancel && choice('choice-cancel', '取消', input.cancelChoice));
    } else {
      setButton(ok, choice('play', '出牌', input.play, state.canPlay));
      setButton(cancel, choice('pass', '不出', input.pass, state.canPass));
    }
    if (hint) setButton(hint, (state.canHint || state.hintPending)
      ? choice('hint', '提示', input.hint, state.canHint) : null);
    bar.layout();
    if (ok.visible && !cancel.visible) ok.x = Math.round((bar.width - ok.width) / 2);
    const targetOptions = drawTargets(decision);
    const actionOptions = draft || nativeChoice || confirmation || decision?.kind === 'bid' ? [] : decision?.options
      .filter(option => !targetOptions.has(option.id)).map(option =>
      choice(`option-${option.id}`, option.label, () => input.choose(option.id), option.enabled !== false,
        decision.selectedOptions?.has(option.id))) || [];
    const skillOptions = decision || state.ended ? [] : state.skills.filter(skill => !nativeSkills.has(skill.id)).map(skill =>
      choice(`skill-${skill.id}`, skill.remaining == null ? skill.label : `${skill.label} · ${skill.remaining}`,
        () => input.activateSkill(skill.id), skill.enabled === true));
    const extra = drawOptions([...actionOptions, ...skillOptions]);
    bar.height = barHeight + extra;
    for (const button of main) button.y += extra;
    bar.txtOptMsg.y = messageY + extra;
    const aboveHand = handTop(bar.parent) - Math.max(ok.y + ok.height, cancel.y + cancel.height) - 5;
    const stockTop = nativeActionBarY(self) - extra;
    bar.y = Number.isFinite(stockTop) ? Math.min(stockTop, aboveHand) : aboveHand;
    updateStatus(draft, nativeChoice);
    const playFloor = handTop(scene) - Math.max(134, extra + 105);
    plays.draw(boardState, slots, playFloor, palette, {
      animate: Boolean(transfers) && !state.ended, refresh: false, actions: added, speed: 1, ownControls: true,
    });
    targets.unshift(...drawHand(nativeChoice));
    const motion = { previousHand, previousPlays, area: plays.discardArea(), palette, speed: 1 };
    for (const action of movements) {
      if (action.type === 'discard' || action.type === 'clear-play') transfers?.showDiscard(action, slots, motion);
      else transfers?.show(action, slots, motion);
    }
    for (const action of added) {
      if (action.type === 'skill') {
        if (names.skillInfo(action.skill)) skillTips.show(action, boardState, slots, seats);
        skills.playVoice(action, slots);
      } else playAudio.play(action, slots);
    }
    for (const skill of state.skills) {
      const node = nativeSkills.get(skill.id);
      if (node?.visible && node.parent?.visible && skill.enabled) {
        targets.push({ node, key: node.name, title: skill.label, invoke: () => input.activateSkill(skill.id) });
      }
    }
    targets.push(...profiles.buttons());
    targets.push(...tableActions(state));
    targets.push(...quickChat.draw(state));
    quickProps.draw(state);
    const skinButton = skinControls.draw(state);
    if (skinButton) targets.push(skinButton);
    if (back?.enabled) targets.push({ node: back, key: back.name, title: back.label, invoke: onBack });
    const trusteeButton = drawTrusteeOverlay(state);
    keyboard.update(() => {
      if (tableExitPrompt()) return [];
      for (const name of ['GameResultWindow', 'UserInfoWindow', 'ChangeSkinWindow']) {
        const panel = windows?.GetWindowData(name);
        if (panel?.parent && panel.visible) return [];
      }
      if (trusteeButton) return [trusteeButton];
      return profiles.menuButtons() ?? quickProps.buttons() ?? quickChat.buttons() ?? (draft ? opening.buttons() : nativeChoice ? cardChoice.buttons()
        : targets.filter(target => target.node.visible !== false));
    });
    if (state.playEntrySound && !playedEntry) {
      playedEntry = true;
      sceneAudio.enter();
    }
    if (state.settlement && !playedResult) {
      playedResult = true;
      playAudio.stop();
      skills.stopVoice();
      sceneAudio.finish();
    }
    settlementWindow.show(state.settlement, state.selfSeat);
  }

  scope.add(ctx.ui.nativeTheme.watch(() => { if (state) render(state); }));
  scope.patch(scene, 'OnStageResize', original => function (...args) {
    original.apply(this, args);
    if (state) render(state);
  });
  return {
    render, hasSettlementWindow: settlementWindow.isPresent,
    playBattleStartSound: () => sceneAudio.battle(Number(self.Seat?.PlayerInfo?.OfficerLevel), ctx.game.getConfigData?.('h5_officer')),
  };
}
