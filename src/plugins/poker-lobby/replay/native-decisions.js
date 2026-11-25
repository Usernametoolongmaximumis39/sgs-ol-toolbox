import { ResourceScope } from '../../../core/resources.js';
import { pokerCardSprite } from './native-card-motion.js';
import { escapeNativeText, replayPopupManager } from './native-opening.js';

const WINDOW = 'SelectCardWindow';
const BUTTON_GAP_FROM_HAND = 5;
const PLAY_AREA_GAP_FROM_HAND = 134;
// The classic self seat positions the active confirmation bar here when its countdown starts.
const ACTIVE_CONFIRM_BAR_BOTTOM_OFFSET = 230;
const NATIVE_SEAT_TEXT = 4;

export function bidLabels(grab) {
  return grab ? ['抢地主', '不抢'] : ['叫地主', '不叫'];
}

export const nativeActionBarY = self => self.height - ACTIVE_CONFIRM_BAR_BOTTOM_OFFSET;

function bidResult(bid) {
  return bidLabels(bid.grab)[bid.decision ? 0 : 1];
}

function tableDecision(state, perspective, opening) {
  if (state.ended) return null;
  if (opening === 'landlord' && state.seats.some(seat => seat.id === perspective && seat.role === 1)) {
    return { message: '成为地主' };
  }
  if (state.phase === 103 && state.bidding?.seat === perspective) {
    if (state.bidding.decision !== null) return { message: bidResult(state.bidding) };
    const [positive, negative] = bidLabels(state.bidding.grab);
    return { message: '', bidding: true, options: [[positive, true, true], [negative, true, true], ['推荐', false, false]] };
  }
  const prompt = state.playPrompt;
  if (state.phase !== 202 || !prompt || state.active !== prompt.seat) return null;
  return {
    message: '轮到你出牌了',
    options: [
      ['出牌', false, !prompt.cannotBeat],
      ['不出', prompt.canPass, prompt.canPass],
      ['推荐', prompt.canRecommend, prompt.canRecommend],
    ],
  };
}

export function attachReplayPlayButtons(Laya, scope, scene) {
  const self = scene.SelfSeatUi;
  const bar = self.getButtonBar?.();
  const controls = [bar?.ButtonOk, bar?.ButtonCancel, bar?.btnReset];
  const hand = self.cardContainer;
  let previous;

  const handTop = container => container.globalToLocal(hand.localToGlobal(new Laya.Point(0, hand.NORMAL_Y))).y;
  const floor = () => handTop(scene) - PLAY_AREA_GAP_FROM_HAND;

  function reset() {
    if (!previous || bar.destroyed) return;
    bar.Reset();
    bar.visible = previous.visible;
    bar.y = previous.y;
    if (previous.message) bar.txtOptMsg?.pos(...previous.message);
    controls.forEach((button, index) => {
      Object.assign(button, previous.controls[index]);
    });
    previous = undefined;
  }

  scope.add(reset);
  function draw(state, perspective, opening) {
    const decision = tableDecision(state, perspective, opening);
    if (!decision || !bar?.parent || !controls.every(Boolean)) { reset(); return false; }
    if (!previous) {
      const message = bar.txtOptMsg;
      previous = { y: bar.y, visible: bar.visible, message: message && [message.x, message.y],
        controls: controls.map(({ label, enabled, visible, mouseEnabled }) =>
        ({ label, enabled, visible, mouseEnabled })) };
      bar.Reset();
    }
    bar.visible = true;
    bar.OperateMessage = decision.message;
    decision.options?.forEach(([label, enabled], index) => {
      const button = controls[index];
      button.label = label;
      button.enabled = enabled;
      button.visible = true;
      button.mouseEnabled = false;
    });
    // Lay out all three native slots before applying recorded visibility.
    bar.layout();
    const bottom = Math.max(...controls.map(button => button.y + button.height));
    bar.y = decision.bidding ? nativeActionBarY(self)
      : handTop(bar.parent) - BUTTON_GAP_FROM_HAND - bottom;
    const left = controls.reduce((first, button) => button.x < first.x ? button : first);
    const message = bar.txtOptMsg;
    if (message && Number.isFinite(message.contextWidth)) {
      const x = decision.options ? left.x - message.contextWidth - 12 : (bar.width - message.contextWidth) / 2;
      message.pos(Math.max(0, x), left.y + Math.max(0, (left.height - message.contextHeight) / 2));
    }
    controls.forEach((button, index) => { button.visible = decision.options?.[index][2] ?? false; });
    return true;
  }
  return { draw, floor };
}

export function attachReplayBidTips(scope, seats) {
  let active;

  function clear() {
    if (!active) return;
    const { manager, previous } = active;
    if (manager.destroyed) { active = undefined; return; }
    if (manager.optTipsTxt) {
      manager.optTipsTxt.innerHTML = previous.message;
      manager.optTipsTxt.visible = previous.textVisible;
    }
    if (manager.optTipsTex) manager.optTipsTex.visible = previous.backgroundVisible;
    if (manager.roundTexture) manager.roundTexture.visible = previous.roundVisible;
    manager.originText = previous.origin;
    active = undefined;
  }

  scope.add(clear);
  return (state, slots, opening) => {
    const bid = state.phase === 103 && state.bidding;
    const landlord = opening === 'landlord' && state.seats.find(seat => seat.role === 1);
    const seat = landlord ? landlord.id : bid?.seat;
    const index = slots.indexOf(seat);
    if (index <= 0) { clear(); return; }
    const text = landlord ? '成为地主' : bid.decision === null ? '正在叫地主' : bidResult(bid);
    const seatUi = seats[index];
    const manager = seatUi?.otherTopManager;
    if (!manager || typeof seatUi.UpdateOptTips !== 'function') { clear(); return; }

    if (active?.manager !== manager) {
      clear();
      active = { manager, previous: {
        message: manager.optTipsTxt?.innerHTML || '',
        textVisible: Boolean(manager.optTipsTxt?.visible),
        backgroundVisible: Boolean(manager.optTipsTex?.visible),
        roundVisible: Boolean(manager.roundTexture?.visible),
        origin: manager.originText,
      } };
    }
    if (active.text !== text || !manager.optTipsTxt?.visible) {
      seatUi.UpdateOptTips(NATIVE_SEAT_TEXT, 0, text);
      active.text = text;
    }
  };
}

export function attachNativeCardChoice(win, scope, scene, names, live) {
  const { Laya } = win;
  const manager = replayPopupManager(scene);
  const available = typeof manager?.GetWindow === 'function' && Laya.ClassUtils.getClass(WINDOW);
  let current, popup, popupScope, dismissed;
  const nodesById = new Map();

  function placeAboveHand(panel) {
    if (!live?.handTop || !panel.parent || !panel.height) return;
    const parent = panel.parent;
    const bottom = parent.globalToLocal(panel.localToGlobal(new Laya.Point(0, panel.height))).y;
    const floor = live.handTop(parent) - 8;
    if (bottom > floor) panel.y -= bottom - floor;
  }

  function close(remember = false) {
    const panel = popup;
    const wasOpen = Boolean(panel?.parent && !panel.destroyed);
    if (remember && wasOpen) dismissed = current.index;
    current = popup = undefined;
    nodesById.clear();
    const resources = popupScope;
    popupScope = undefined;
    if (!panel?.destroyed) panel?.Close();
    resources?.dispose();
    return wasOpen;
  }

  function open(choice, palette) {
    if (!available || manager.GetWindowData(WINDOW)?.parent) return;
    const panel = manager.GetWindow(WINDOW, false);
    if (typeof panel?.createCardUis !== 'function' || typeof panel.CreatconfirmBtn !== 'function') return;
    popupScope = new ResourceScope();
    popup = panel;
    const useTimer = panel.useTimer;
    panel.useTimer = false;
    popupScope.add(() => { if (!panel.destroyed) panel.useTimer = useTimer; });
    const candidates = choice.cards;
    // SelectCardWindow already supports separate card areas with native row sizing.
    const exchange = choice.skill === 47 && choice.requiredGroups?.includes('权');
    const topRow = exchange ? candidates.filter(card => card.choiceGroup === '权') : candidates;
    const bottomRow = exchange ? candidates.filter(card => card.choiceGroup === '手牌') : null;
    const selected = new Set(choice.selected.map(card => card.id));
    const description = choice.copyCard ? '请选择一张牌复制'
      : choice.min === choice.max ? `请选择 ${choice.min} 张牌` : `请选择 ${choice.min} 至 ${choice.max} 张牌`;
    const title = escapeNativeText(exchange ? choice.title : `${names.skill(choice.skill)} · ${description}`);
    if (exchange && typeof panel.UpdateTxtView === 'function') {
      const renamed = new Set();
      popupScope.patch(panel, 'UpdateTxtView', original => function (...args) {
        const result = Reflect.apply(original, this, args);
        for (const [label, text] of [[panel.handCardTxt, '权计牌'], [panel.equipCardTxt, '手牌']]) {
          if (typeof label?.SetTitle !== 'function' || !label.titleText) continue;
          if (!renamed.has(label)) {
            const previous = label.titleText.text;
            renamed.add(label);
            popupScope.add(() => { if (!label.destroyed && label.titleText?.text === text) label.SetTitle(previous); });
          }
          label.SetTitle(text);
        }
        return result;
      });
    }
    popupScope.patch(panel, 'getSkillDesc', () => () => '');
    popupScope.patch(panel, 'autoSelect', () => () => {});
    popupScope.patch(panel, 'updateCardTag', () => () => {});
    popupScope.patch(panel, 'onTouchCard', () => () => {});
    popupScope.patch(panel, 'confirmClick', () => () => { if (current?.canConfirm) live?.confirm(); });
    popupScope.patch(panel, 'cancelClick', () => () => { if (current?.canCancel) live?.cancel(); });
    if (live) for (const name of ['layout', 'onAnimateInComplete']) {
      if (typeof panel[name] !== 'function') continue;
      popupScope.patch(panel, name, original => function (...args) {
        const result = Reflect.apply(original, this, args);
        placeAboveHand(this);
        return result;
      });
    }
    popupScope.patch(panel, 'createCardUis', original => function (cards, nodes, ...options) {
      if (cards !== topRow && cards !== bottomRow) return Reflect.apply(original, this, [cards, nodes, ...options]);
      for (const card of cards) {
        // The native window lays out the original poker faces recorded in the prompt.
        const node = pokerCardSprite(Laya, card, { width: 93, height: 130 }, palette);
        node.Selected = selected.has(card.id);
        if (card.disabled || choice.skill === 3 && card.baseRank >= 16) node.alpha = .55;
        if (live) {
          node.name = `poker-live-choice-card-${card.id}`;
          if (!card.disabled) node.on(Laya.Event.CLICK, popupScope, () => { if (!current?.pending) live.toggle(card.id); });
          nodesById.set(card.id, node);
        }
        node.Run = (x, y) => node.pos(x, y - (node.Selected ? 8 : 0));
        panel.addChild(node);
        nodes.push(node);
      }
    });
    popupScope.patch(panel, 'clearCardUis', original => function (cards) {
      if (cards?.length && cards.every(card => card.pokerCardId !== undefined)) {
        for (const card of cards.splice(0)) card.destroy(true);
      } else Reflect.apply(original, this, [cards]);
    });
    popupScope.patch(panel, 'enterWindow', original => function (data) {
      Reflect.apply(original, this, [data]);
      panel.Title = title;
      for (const node of [panel.confirm_btn, panel.cancel_btn]) if (node) node.mouseEnabled = Boolean(live);
      if (choice.copyCard) {
        const confirm = panel.confirm_btn;
        const originalLabel = confirm.label;
        confirm.label = '复制';
        popupScope.add(() => {
          if (!confirm.destroyed && confirm.label === '复制') confirm.label = originalLabel;
        });
      }
      panel.confirm_btn.enabled = selected.size >= choice.min;
      if (panel.countdownTimer) panel.countdownTimer.visible = false;
      if (live) updateLive();
    });
    scene.ged.A(WINDOW, {
      TargetSeat: scene.SelfSeatUi.Seat,
      CardType: 0,
      customCards: topRow,
      ...(bottomRow && { customEquipCards: bottomRow }),
      Skill: {
        ID: choice.skill,
        SelectCardWindowServer: true,
        SelectCardCountWhenResponse: Math.max(2, choice.max),
        SelectCardWindowNeedCancel: choice.offersCancel ?? choice.canCancel,
      },
    });
  }

  function updateLive() {
    if (!popup?.parent || !popup.confirm_btn) return;
    placeAboveHand(popup);
    const selected = current.selected instanceof Set ? current.selected : new Set();
    for (const { id, disabled } of current.cards) {
      const node = nodesById.get(id);
      if (!node) continue;
      const active = selected.has(id);
      if (node.Selected !== active) {
        node.y += active ? -8 : 8;
        node.Selected = active;
      }
      node.mouseEnabled = !current.pending && !disabled;
    }
    popup.confirm_btn.name = 'poker-live-card-choice-confirm';
    popup.confirm_btn.enabled = current.canConfirm;
    if (popup.cancel_btn) {
      popup.cancel_btn.name = 'poker-live-card-choice-cancel';
      popup.cancel_btn.enabled = current.canCancel;
    }
  }

  function draw(state, palette) {
    const choice = state.ended ? null : state.skillChoice;
    if (!choice) {
      dismissed = undefined;
      close();
      return false;
    }
    if (live && current?.index === choice.index && popup && !popup.destroyed) {
      current = choice;
      updateLive();
      return true;
    }
    if (choice.index === dismissed || choice === current && popup && !popup.destroyed) return Boolean(popup);
    close();
    current = choice;
    open(live ? { ...choice, selected: choice.cards.filter(card => choice.selected.has(card.id)) } : choice, palette);
    if (live) updateLive();
    return Boolean(popup);
  }

  scope.add(close);
  return { draw, close: () => close(true), buttons() {
    if (!live || !popup?.parent || !current || current.pending) return [];
    const targets = current.cards.flatMap(card => {
      const node = nodesById.get(card.id);
      return node && !card.disabled ? [{ node, key: node.name, title: card.hidden ? '暗牌' : `${card.symbol || ''}${card.face}`,
        invoke: () => live.toggle(card.id) }] : [];
    });
    if (popup.confirm_btn?.enabled) targets.push({ node: popup.confirm_btn, key: popup.confirm_btn.name,
      title: current.copyCard ? '复制' : '确定', invoke: live.confirm });
    if (popup.cancel_btn?.enabled) targets.push({ node: popup.cancel_btn, key: popup.cancel_btn.name, title: '取消', invoke: live.cancel });
    return targets;
  } };
}
