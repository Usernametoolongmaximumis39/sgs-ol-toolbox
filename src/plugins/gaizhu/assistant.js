import { createSpecialWindows } from './special-windows.js';
import { createBattleGuards, ICE_SWORD } from './battle-guards.js';
import { read } from '../../shared/info-runtime.js';
import { shown, usable, selfButtonBar, clickSkill, press } from './native.js';

const list = value => Array.isArray(value) ? value : [];
const same = (a, b) => a != null && b != null && String(a) === String(b);
const selected = ui => Boolean(ui?.selected || ui?.Selected || ui?.Skill?.Selected || ui?.Card?.Selected || (ui?.seat ?? ui?.Seat)?.Selected);
const active = ui => usable(ui) && (ui.activated ?? ui.Activated ?? ui.Skill?.Activated) !== false;
const selectable = ui => usable(ui) && (ui.activated ?? ui.Activated) === true && !selected(ui);
const enabled = button => usable(button) && (button._enabled ?? button.enabled) === true;
const figure = seat => Number(seat?.Figure ?? seat?.figure);
const SHUNQIAN = 4;
const GUOCHAI = 5;
const TAOYUAN = 12;
const ARMOUR = 4;
const DEF_HORSE = 6;
const TREASURE = 7;
const IRON_CHAIN = 85;
const WOODEN_OX = 700;
const WINE = 82;
const WINE_STATE = 6;
const SLASH_SKILLS = new Set([1, 11111, 11112, 11114]);
const cardChoices = container => [...new Set([
  ...list(container?.activatedCardtems), ...list(container?.cardUis), ...list(container?.muniuCardUis),
])];
const cardContext = container => container?.selectCardContext ?? container?.SelectContext;
const seatOf = ui => ui?.seat ?? ui?.Seat;
const seatIndex = ui => Number(seatOf(ui)?.Index ?? seatOf(ui)?.index ?? NaN);
const targetContext = self => self.SelectSeatContext ?? self.selectSeatContext;
const cardSkill = card => Number(card?.FirstSkillId ?? card?.FirstSkill?.ID);
const wineBoost = self => Number(read(() => seatOf(self).GetStateValue(WINE_STATE)) ?? NaN);
const handCards = container => cardChoices(container).filter(ui => ui && ui !== container?.activatedSkillEquip);
const currentCard = (context, cards) => context?.CardSelector?.FirstSelectedCard ?? cards.find(selected)?.Card;
const playTargets = (frame, card) => {
  if (targetContext(frame.self)?.Card !== card) return null;
  return list(frame.scene.seatContainer?.seatUIs).filter(ui => {
    const seat = seatOf(ui);
    return seat && seat !== seatOf(frame.self) && seat.IsSelf !== true && seat.IsDead !== true
      && Number.isInteger(seatIndex(ui)) && usable(ui) && (selectable(ui) || selected(ui));
  });
};
const cardCount = (context, cards) => context?.CardSelector?.SelectedCount
  ?? Math.max(list(context?.SelectedCardIds).length, cards.filter(selected).length);
const hostileSpells = new Set([1, SHUNQIAN, GUOCHAI, 8, 15, 83, 84]); // 杀、顺手、过拆、决斗、乐、火攻、兵粮

function canPlayCard(seat, card) {
  if (cardSkill(card) !== TAOYUAN) return true;
  const hp = Number(seat?.Hp ?? NaN), maxHp = Number(seat?.MaxHp ?? NaN);
  return Number.isFinite(hp) && Number.isFinite(maxHp) && hp > 0 && hp < maxHp;
}

function fallbackPopupCard(win, chosen) {
  const legal = ui => usable(ui) && ui.CanBeSelected && !chosen.includes(ui);
  const equipment = list(win.equipCardUis).filter(legal);
  const skill = Number(win.Skill?.ID ?? win.Skill?.SkillId);
  if (skill === SHUNQIAN || skill === GUOCHAI) {
    const type = ui => Number(ui.Card?.FirstSkill?.Type ?? ui.Card?.Type);
    const preferred = equipment.find(ui => type(ui) === DEF_HORSE)
      ?? equipment.find(ui => type(ui) === ARMOUR || type(ui) === TREASURE);
    if (preferred) return preferred;
  }
  return equipment[0] ?? list(win.handCardUis).find(legal)
    ?? list(win.judgeCardUis).find(legal) ?? list(win.regionCardUis).find(legal);
}

function isHostilePlay(self, container, seatContainer, cards) {
  if (self.seat?.InOwnRound !== true) return false;
  const context = container?.selectCardContext;
  const skill = seatContainer?.selectContext?.Skill;
  const card = cards.find(selected)?.Card;
  const spell = Number(skill?.SkillId || skill?.ID || context?.SpecifySkillId || card?.FirstSkillId || card?.FirstSkill?.ID);
  return hostileSpells.has(spell) || /^(杀|火杀|火焰杀|雷杀|雷电杀|冰杀|冰霜杀)$/.test(card?.CardName ?? card?.Name ?? '');
}

function identityAttackTarget(targets, ownFigure) {
  if (ownFigure === 3) return targets.find(ui => figure(ui.seat ?? ui.Seat) === 1)
    || targets.find(ui => figure(ui.seat ?? ui.Seat) !== 3);
  if (ownFigure === 1 || ownFigure === 2) return targets.find(ui => figure(ui.seat ?? ui.Seat) === 3)
    || targets.find(ui => ![1, 2].includes(figure(ui.seat ?? ui.Seat)));
  return targets[0];
}

function ordinaryPlay(self, context, bar) {
  if (seatOf(self)?.InActiveState !== true || context?.Purpose !== 'deal' || !usable(bar) || usable(self.spellSelector)
    || Number(context.SpecifySkillId ?? 0) !== 0 || context.Skill || self.selectedSkillItem || context.CardSelector?.TurnCard) return false;
  return typeof self.PlayCard_Result === 'function' && context.SelectResultCallback === self.PlayCard_Result
    || String(context.Message ?? context.message ?? '').replace(/<[^>]*>|\s/g, '') === '出牌阶段，请选择一张卡牌';
}

function selectPlayCard(container, ui, value) {
  if (!usable(ui) || selected(ui) === value || value && !selectable(ui)) return false;
  if (typeof container.CardUI_Click === 'function') container.CardUI_Click({ CardUi: ui, Card: ui.Card });
  else if (typeof ui.CardUI_Click === 'function') ui.CardUI_Click(null);
  else if (typeof ui.setSelected === 'function') ui.setSelected(value);
  else return false;
  return selected(ui) === value;
}

// Follow the native assistant where possible, then resolve the current prompt locally.
export function createAssistant(config = {}) {
  const guards = createBattleGuards(config), specialWindows = createSpecialWindows(config);
  let requested = -Infinity;
  let winePlan = null;
  const wineAttempted = new WeakSet(), blockedSlashes = new WeakMap();
  const completed = new WeakSet(), confirmedPopupSelections = new WeakSet(), chosenPopupCards = new WeakMap();
  function confirmPopup(win, official = false) {
    const chosen = list(win.selectCardUis);
    const max = Number(win.Skill?.SelectCardCountWhenResponse || 1);
    const min = Math.max(1, Number(win.Skill?.SelectCardCountMinResponse ?? max));
    if (win.Skill?.SelectCardConfirmForCancel || chosen.length < min || confirmedPopupSelections.has(chosen)
      || typeof win.confirmClick !== 'function' || official && !chosen.every(ui => chosenPopupCards.get(chosen)?.has(ui))) return false;
    if (win.confirm_btn ? !usable(win.confirm_btn) : chosen.length < max) return false;
    confirmedPopupSelections.add(chosen);
    win.confirmClick();
    return true;
  }
  function choosePopupCard(win, card) {
    win.onTouchCard({ target: card });
    return selected(card) || list(win.selectCardUis).includes(card) || !usable(win) || Boolean(win.closeing || win.isClosing);
  }
  function clickHintedCard(self, data, card) {
    if (typeof card.CardUI_Click !== 'function') return false;
    const context = cardContext(self.cardContainer), targets = self.SelectSeatContext ?? self.selectSeatContext;
    card.CardUI_Click(null);
    return selected(card) || self.CurStepHelpData !== data || cardContext(self.cardContainer) !== context
      || (self.SelectSeatContext ?? self.selectSeatContext) !== targets;
  }
  function clickHintedSkill(self, data, skill) {
    const context = cardContext(self.cardContainer), targets = self.SelectSeatContext ?? self.selectSeatContext;
    return clickSkill(skill) && (selected(skill) || self.CurStepHelpData !== data
      || cardContext(self.cardContainer) !== context || (self.SelectSeatContext ?? self.selectSeatContext) !== targets);
  }
  function runOfficial(frame, now, play, excludedChoice) {
    const self = frame.self, data = read(() => self.CurStepHelpData);
    // Popup windows receive their own assistant response; use only highlighted
    // native choices, never the first available card as a fallback.
    for (const win of frame.nodes || []) {
      if (!usable(win) || win.closeing || win.isClosing) continue;
      const name = win.name || win.constructor?.name;
      if (name !== 'WuGuFengDengWindow' && name !== 'SelectCardWindow') continue;
      if (name === 'SelectCardWindow' && confirmedPopupSelections.has(win.selectCardUis)) return false;
      const pool = name === 'WuGuFengDengWindow' ? list(win.showCardUIs)
        : [...list(win.handCardUis), ...list(win.equipCardUis), ...list(win.judgeCardUis), ...list(win.regionCardUis)];
      const specialCard = name === 'SelectCardWindow' && Number(win.Skill?.SkillId) === 3572
        ? [...list(win.handCardUis), ...list(win.equipCardUis)].find(ui => usable(ui) && ui.CanBeSelected && !list(win.selectCardUis).includes(ui)) : null;
      const hinted = specialCard || pool.find(ui => usable(ui) && !selected(ui) && (list(win.aiEffectCards).includes(ui)
        || ui.AiHelpEffect && (!win.aiHelpEffect || ui.AiHelpEffect === win.aiHelpEffect)));
      if (hinted && name === 'WuGuFengDengWindow' && typeof win.OnSelectNormalCardUi === 'function') { win.OnSelectNormalCardUi(hinted); return true; }
      if (hinted && name === 'SelectCardWindow' && hinted.CanBeSelected && typeof win.onTouchCard === 'function'
        && choosePopupCard(win, hinted)) {
        const chosen = win.selectCardUis;
        if (Array.isArray(chosen)) {
          const automated = chosenPopupCards.get(chosen) || new Set();
          automated.add(hinted);
          chosenPopupCards.set(chosen, automated);
        }
        return true;
      }
      if (name === 'SelectCardWindow' && confirmPopup(win, true)) return true;
    }
    if (typeof data !== 'object' || !data || completed.has(data)) {
      if (now - requested >= 1500 && typeof frame.scene.requestAiHelp === 'function') {
        requested = now; frame.scene.requestAiHelp();
      }
      return false;
    }
    const bar = selfButtonBar(self), selector = self.spellSelector;
    const buttons = usable(bar) ? list(bar.btns) : [];
    const choices = usable(selector) ? list(selector.btnList) : [];
    const target = data.target;
    if (excludedChoice && (target === excludedChoice || Number(data.skillId) === ICE_SWORD)) return false;
    if (list(self.skillItems).includes(target) && !selected(target)) return clickHintedSkill(self, data, target);
    if (choices.includes(target) && usable(target) && typeof selector.btnClick === 'function') {
      completed.add(data); selector.btnClick(target); return true;
    }
    if (buttons.includes(target) && dispatch(bar, target, frame)) { completed.add(data); return true; }
    const container = self.cardContainer, equipped = list(container?.equipCardUis);
    // An equipment-skill hint points to the equipped card first. The protocol
    // can already contain the card IDs needed for the next step.
    const equipSkill = data.skillId && equipped.find(ui => same(ui?.Card?.FirstSkillId, data.skillId)
      && (ui === target || list(data.cardUis).includes(ui)));
    if (equipSkill && !selected(equipSkill)) return selectable(equipSkill) && clickHintedCard(self, data, equipSkill);
    const skill = list(self.skillItems).find(ui => same(ui.Skill?.SkillId ?? ui.Skill?.ID, data.skillId));
    if (data.skillId && !equipSkill && !/UseCard/i.test(data.protocol?._className_ ?? data.protocol?.className ?? '')) {
      if (!skill || !active(skill)) return false;
      if (!selected(skill)) return clickHintedSkill(self, data, skill);
    }
    const pool = [...cardChoices(container), ...equipped];
    const ids = list(data.cardIds).length ? data.cardIds : list(data.CardIDs).length ? data.CardIDs
      : list(data.protocol?.CardIDs).length ? data.protocol.CardIDs : data.protocol?.CardID != null ? [data.protocol.CardID] : [];
    const cards = ids.length ? ids.map(id => list(data.cardUis).find(ui => same(ui?.Card?.CardId, id)) || pool.find(ui => same(ui?.Card?.CardId, id)))
      : list(data.cardUis).filter(ui => ui !== equipSkill);
    if (target !== equipSkill && pool.includes(target) && !cards.includes(target)) cards.push(target);
    if (cards.some(ui => !ui || !usable(ui) || !selected(ui) && !active(ui))) return false;
    const card = cards.find(ui => !selected(ui));
    if (card) {
      if (play && !canPlayCard(seatOf(self), card.Card)) return false;
      if (play && cardSkill(card.Card) === WINE) {
        const slash = play.cards.find(ui => selectable(ui) && SLASH_SKILLS.has(cardSkill(ui.Card))
          && !blockedSlashes.get(play.context)?.has(ui.Card));
        return Boolean(slash && selectPlayCard(container, slash, true));
      }
      if (play && blockedSlashes.get(play.context)?.has(card.Card)) return false;
      return clickHintedCard(self, data, card);
    }
    const seatIds = list(data.completeSeatIds).length ? data.completeSeatIds : list(data.seatIds);
    const seats = list(frame.scene.seatContainer?.seatUIs);
    const targets = seatIds.map(id => seats.find(ui => same(ui.seat?.index ?? ui.seat?.Index ?? ui.Seat?.Index, id)));
    if (seats.includes(target) && !targets.includes(target)) targets.push(target);
    if (targets.some(ui => !ui || !usable(ui) || !selected(ui) && !active(ui))) return false;
    const seat = targets.find(ui => !selected(ui));
    if (seat) {
      if (typeof seat.seatClickHandler !== 'function') return false;
      const context = self.SelectSeatContext ?? self.selectSeatContext;
      seat.seatClickHandler();
      return selected(seat) || self.CurStepHelpData !== data || (self.SelectSeatContext ?? self.selectSeatContext) !== context;
    }
    let button = choices.find(ui => same(ui.name, data.buttonName) || same(ui.data?.sendData, data.buttonName));
    if (!button && Number.isInteger(data.optionIndex)) button = choices[data.optionIndex];
    if (button) { if (button === excludedChoice || !usable(button) || typeof selector.btnClick !== 'function') return false; completed.add(data); selector.btnClick(button); return true; }
    button = buttons.find(ui => same(ui.name, data.buttonName));
    if (!button && !data.buttonName && (cards.length || targets.length)) button = buttons.find(ui => ui.name === 'btnOK');
    if (!dispatch(bar, button, frame)) return false;
    completed.add(data);
    return true;
  }
  let task = null, mode = 'ai', reason = '';
  function dispatch(bar, button, frame) {
    if (!usable(button)) return false;
    if (frame && button.name === 'btnOK') {
      const self = frame.self, context = cardContext(self.cardContainer);
      if (context?.Purpose === 'deal') {
        const card = currentCard(context, handCards(self.cardContainer));
        if (!canPlayCard(seatOf(self), context.CardSelector?.TurnCard ?? card)) return false;
        if (ordinaryPlay(self, context, bar)) {
          guards.recordPlay(seatIndex(self), cardSkill(card), wineBoost(self),
            list(read(() => targetContext(self).SelectedTargetSeatIDs)));
        }
      }
    }
    if (typeof bar?.Button_Click === 'function') bar.Button_Click(button);
    else if (!press(button)) return false;
    return true;
  }
  function orderWineAndSlash(frame, now, play, identity) {
    const { self } = frame, container = self.cardContainer;
    const { context, cards, card, bar } = play;
    const selectedUI = cards.find(ui => ui.Card === card);
    const slash = SLASH_SKILLS.has(cardSkill(card)), drink = cardSkill(card) === WINE;
    const targets = slash ? playTargets(frame, card) : null;
    const fallback = targets && (identity ? identityAttackTarget(targets, figure(seatOf(self))) : targets[0]);
    if (winePlan?.phase === 'waiting') {
      const wineStillHeld = cards.some(ui => same(ui.Card?.CardId, winePlan.wineId));
      if (drink && same(card.CardId, winePlan.wineId)) return false;
      // A fresh play selector without either acknowledgement may mean the
      // drink was rejected. Resume ordinary play without retrying it there.
      if (wineStillHeld && !(wineBoost(self) > 0)) {
        if (context === winePlan.submitted || now - winePlan.sentAt < 2000) return false;
        wineAttempted.add(context);
        winePlan = null;
        return null;
      }
      winePlan.phase = 'slash';
      wineAttempted.add(context);
    }
    if (!winePlan) {
      if (drink) return Boolean(selectedUI && selectPlayCard(container, selectedUI, false));
      if (!slash || !selectedUI || !targets || wineAttempted.has(context) || wineBoost(self) > 0) return null;
      const wine = cards.find(ui => selectable(ui) && cardSkill(ui.Card) === WINE);
      if (!wine) return null;
      const hint = self.CurStepHelpData;
      const ids = list(hint?.completeSeatIds).length ? hint.completeSeatIds : list(hint?.seatIds);
      const preferred = targets.filter(ui => selected(ui) || ids.some(id => same(id, seatIndex(ui))) || hint?.target === ui);
      if (!preferred.length && !fallback) {
        const blocked = blockedSlashes.get(context) || new Set();
        blocked.add(card);
        blockedSlashes.set(context, blocked);
        return selectPlayCard(container, selectedUI, false);
      }
      wineAttempted.add(context);
      winePlan = { scene: frame.scene, self, slashId: card.CardId, wineId: wine.Card.CardId,
        targets: (preferred.length ? preferred : [fallback]).map(seatIndex), phase: 'wine' };
    }
    const next = cards.find(ui => same(ui.Card?.CardId, winePlan.phase === 'slash' ? winePlan.slashId : winePlan.wineId));
    if (!next || !selected(next) && !selectable(next)) {
      winePlan = null;
      return null;
    }
    if (!selected(next)) {
      const changed = selectedUI ? selectPlayCard(container, selectedUI, false) : selectPlayCard(container, next, true);
      if (!changed) winePlan = null;
      return changed;
    }
    const confirm = list(bar.btns).find(b => enabled(b) && b.name === 'btnOK');
    if (winePlan.phase === 'wine') {
      if (!drink || !confirm) return false;
      winePlan.phase = 'waiting';
      winePlan.submitted = context;
      winePlan.sentAt = now;
      return dispatch(bar, confirm, frame);
    }
    if (!slash || !targets) return false;
    const available = targets.filter(ui => selectable(ui) && typeof ui.seatClickHandler === 'function');
    const target = winePlan.targets.map(id => available.find(ui => seatIndex(ui) === id)).find(Boolean)
      || (!confirm && (identity ? identityAttackTarget(available, figure(seatOf(self))) : available[0]));
    if (target) { target.seatClickHandler(); return true; }
    if (confirm && targets.some(selected)) {
      winePlan = null;
      // This Slash followed a confirmed drink, even if its buff icon arrived late.
      return dispatch(bar, confirm);
    }
    if (!targets.length) {
      winePlan = null;
      return selectPlayCard(container, selectedUI, false);
    }
    return false;
  }
  function recastIronChain(self) {
    const bar = selfButtonBar(self);
    const recast = usable(bar) && list(bar.btns).find(button => enabled(button) && button.name === 'btnReset');
    if (!recast) return false;
    const container = self.cardContainer;
    const card = cardContext(container)?.CardSelector?.FirstSelectedCard
      ?? cardChoices(container).find(ui => ui !== container?.activatedSkillEquip && selected(ui))?.Card;
    return Number(card?.FirstSkillId ?? card?.FirstSkill?.ID) === IRON_CHAIN && dispatch(bar, recast);
  }
  function local(frame, now, identity, preferIronChainRecast, play, excludedChoice) {
    for (const win of frame.nodes || []) {
      if (!usable(win) || win.closeing || win.isClosing) continue;
      const name = win.name || win.constructor?.name;
      if (name === 'WuGuFengDengWindow' && typeof win.OnSelectNormalCardUi === 'function') {
        if (now - task.first < 2500) return false;
        const card = list(win.showCardUIs).find(ui => usable(ui) && (ui.maskAlpha == null || Number(ui.maskAlpha) === 0) && !win.IsCardRemoved?.(ui.Card));
        if (card) { win.OnSelectNormalCardUi(card); return true; }
        return false;
      }
      if (name === 'SelectCardWindow') {
        const chosen = list(win.selectCardUis);
        if (now - task.first < 2500 || confirmedPopupSelections.has(chosen)) return false;
        if (confirmPopup(win)) return true;
        if (chosen.length < Number(win.Skill?.SelectCardCountWhenResponse || 1)) {
          const card = fallbackPopupCard(win, chosen);
          if (card && typeof win.onTouchCard === 'function') return choosePopupCard(win, card);
        }
        if (usable(win.cancel_btn) && typeof win.cancelClick === 'function') { win.cancelClick(); return true; }
        if (win.Skill?.SelectCardConfirmForCancel && usable(win.confirm_btn) && typeof win.confirmClick === 'function') {
          win.confirmClick(); return true;
        }
        return false;
      }
    }
    const self = frame.self, bar = selfButtonBar(self), selector = self.spellSelector;
    if (usable(selector) && typeof selector.btnClick === 'function') {
      const choice = list(selector.btnList).find(b => b !== excludedChoice && enabled(b));
      if (choice) { selector.btnClick(choice); return true; }
      if (excludedChoice) return false;
    }
    const container = self.cardContainer, context = cardContext(container);
    const buttons = usable(bar) ? list(bar.btns) : [];
    const ok = buttons.find(b => enabled(b) && b.name === 'btnOK');
    const cancel = buttons.find(b => enabled(b) && b.name === 'btnCancel');
    const seatContext = self.SelectSeatContext ?? self.selectSeatContext;
    const oxSkill = Number(context?.Skill?.SkillId ?? context?.Skill?.ID ?? context?.SpecifySkillId) === WOODEN_OX;
    const transferringOx = Number(seatContext?.Skill?.SkillId ?? seatContext?.Skill?.ID) === WOODEN_OX
      || oxSkill && Number(context.SelectCountMin) === 0 && Number(context.SelectCountMax) === 0;
    const cards = cardChoices(container).filter(ui => ui !== container?.activatedSkillEquip);
    const minimum = Number(context?.SelectCountMin ?? context?.CardSelector?.SelectCountMin);
    if (transferringOx) {
      if (cancel || ok) return dispatch(bar, cancel || ok);
    } else if (minimum > 1 && cardCount(context, cards) < minimum) {
      const before = cardCount(context, cards);
      for (const card of cards) {
        if (!selectable(card) || typeof card.setSelected !== 'function') continue;
        card.setSelected(true);
        if (cardContext(self.cardContainer) !== context) return true;
        if (cardCount(context, cards) >= minimum) {
          const currentBar = selfButtonBar(self);
          const confirm = list(currentBar?.btns).find(b => enabled(b) && b.name === 'btnOK');
          if (confirm) dispatch(currentBar, confirm);
          return true;
        }
      }
      return cardCount(context, cards) > before || dispatch(bar, cancel);
    } else {
      const hasSelectedCard = cards.some(selected) || list(context?.SelectedCardIds).length > 0;
      if (!hasSelectedCard) {
        if (play) {
          const card = cards.find(ui => selectable(ui) && cardSkill(ui.Card) !== WINE && canPlayCard(seatOf(self), ui.Card)
            && !blockedSlashes.get(context)?.has(ui.Card));
          if (card) return selectPlayCard(container, card, true);
          return dispatch(bar, buttons.find(b => enabled(b) && b.name === 'btnDiscard'));
        }
        // Legacy card() uses native AllSelectHandCards before its first legal
        // activated card. Do not choose disabled or unavailable cards ourselves.
        if (typeof container?.AllSelectHandCards === 'function') container.AllSelectHandCards();
        if (!cards.some(selected)) {
          const card = cards.find(selectable);
          if (card && typeof card.setSelected === 'function') card.setSelected(true);
        }
      }
      // Card selection can replace the operation bar or auto-select a target.
      if (preferIronChainRecast && recastIronChain(self)) return true;
      if (hasSelectedCard && ok) return dispatch(bar, ok, frame);
      if (enabled(buttons[0])) return dispatch(bar, buttons[0], frame);
    }
    const seatContainer = frame.scene.seatContainer;
    const targets = list(seatContainer?.seatUIs).filter(ui => selectable(ui) && typeof ui.seatClickHandler === 'function');
    const hostile = identity && isHostilePlay(self, container, seatContainer, cards);
    const seat = hostile ? identityAttackTarget(targets, figure(self.seat)) : targets[0];
    if (seat) {
      seat.seatClickHandler();
      const currentBar = selfButtonBar(self);
      const confirm = list(currentBar?.btns).find(b => enabled(b) && b.name === 'btnOK');
      if (confirm) return dispatch(currentBar, confirm, frame);
      return true;
    }
    if (transferringOx) return false;
    if (hostile && targets.length) return dispatch(bar, cancel);
    // Preserve the original bar order (0,1,2,3), including a visible Cancel
    // when optional skills such as Yingyuan have no legal confirmation.
    return dispatch(bar, buttons.slice(0, 4).find(enabled), frame);
  }
  function run(frame, now, { identity = false, training = false } = {}) {
    const self = frame.self, seat = seatOf(self);
    reason = '';
    if (winePlan && (winePlan.scene !== frame.scene || winePlan.self !== self || seat?.InOwnRound === false)) winePlan = null;
    if (!self) { task = null; return false; }
    if (config.canOperate?.() === false) { mode = 'ai'; reason = '等待游戏允许操作'; return false; }
    if (seat?.IsAiControl === true) {
      mode = 'ai'; reason = '等待退出游戏托管'; return false;
    }
    const protection = guards.run(frame, { official: true, identity, training });
    const wuxie = protection?.officialOnly;
    const excludedChoice = protection?.excludedChoice;
    if (protection && !wuxie && !excludedChoice) { mode = 'local'; reason = protection.reason; return protection.acted; }
    const special = !wuxie && specialWindows.run(frame);
    if (special) { mode = 'local'; reason = special.reason; return special.acted; }
    const bar = selfButtonBar(self), context = cardContext(self.cardContainer);
    const selector = usable(self.spellSelector) ? self.spellSelector : null;
    const buttons = usable(bar) ? list(bar.btns) : [];
    const play = !wuxie && ordinaryPlay(self, context, bar)
      && !(frame.nodes || []).some(win => usable(win) && !win.closeing && !win.isClosing
        && ['WuGuFengDengWindow', 'SelectCardWindow'].includes(win.name || win.constructor?.name))
      ? { context, bar, cards: handCards(self.cardContainer) } : null;
    const turnCard = context?.Purpose === 'deal' ? context.CardSelector?.TurnCard : null;
    if (!wuxie && (play || turnCard && seat?.InActiveState === true)) {
      const cards = play?.cards ?? handCards(self.cardContainer);
      const card = currentCard(context, cards);
      if (!canPlayCard(seat, turnCard ?? card)) {
        const ui = cards.find(ui => ui.Card === card);
        mode = 'local';
        return Boolean(ui && selectPlayCard(self.cardContainer, ui, false));
      }
      if (play) play.card = card;
    }
    if (play) {
      const ordered = orderWineAndSlash(frame, now, play, identity);
      if (ordered !== null) { mode = 'local'; return ordered; }
    }
    const key = [context?.SpecifySkillId ?? context?.Skill?.SkillId ?? '', context?.message ?? '',
      selector?.spell?.SkillId ?? '', buttons.filter(shown).map(b => b.name).join(',')].join('|');
    if (!task || task.scene !== frame.scene || task.self !== self || task.context !== context || task.key !== key || task.selector !== selector) {
      task = { scene: frame.scene, self, context, key, selector, first: now, localAt: null, lastOfficial: -Infinity, lastLocal: -Infinity };
      mode = 'ai';
    }
    const hint = self.CurStepHelpData;
    const actionable = buttons.some(enabled) || list(selector?.btnList).some(enabled)
      || list(self.cardContainer?.activatedCardtems).some(selectable)
      || list(self.cardContainer?.muniuCardUis).some(selectable)
      || context && list(self.cardContainer?.cardUis).some(selectable)
      || list(self.skillItems).some(selectable)
      || list(frame.scene.seatContainer?.seatUIs).some(selectable)
      || (frame.nodes || []).some(win => usable(win) && ['WuGuFengDengWindow', 'SelectCardWindow'].includes(win.name || win.constructor?.name));
    // A late Wuxie hint can still be used once. An unchanged or unexecutable
    // hint gives the current prompt no extra time before local handling.
    if ((task.localAt == null || wuxie && hint && task.help !== hint) && runOfficial(frame, now, play, excludedChoice)) {
      task.lastOfficial = now; task.help = hint; mode = 'ai'; return true;
    }
    task.help = hint;
    if (!actionable) {
      task.first = now; task.localAt = null;
      mode = 'ai'; reason = '等待本方可操作询问'; return false;
    }
    if (now - task.lastOfficial < 2000) { mode = 'ai'; reason = '等待助手操作生效'; return false; }
    if (task.localAt == null) {
      if (now - task.first < 1000) { mode = 'ai'; return false; }
      task.localAt = now;
    }
    mode = 'local';
    let acted = false;
    if (now - task.lastLocal >= 1000) {
      task.lastLocal = now;
      if (wuxie) {
        const fallback = guards.run(frame);
        reason = fallback?.reason || '';
        acted = fallback?.playWuxie ? fallback.playWuxie() : Boolean(fallback?.acted);
      } else acted = local(frame, now, identity, training, play, excludedChoice);
    }
    return acted;
  }
  function observe(type, data) {
    if (type === 'GsCGamephaseNtf' || type === 'MsgGameTurnNtf') winePlan = null;
    guards.observe(type, data);
  }
  return { run, mode: () => mode, reason: () => reason, observe };

}

// Old xiaochao 1.6.75 DKgWgpKJv, used only with the native shop's own price check.
export const TRAINING_SHOP_IDS = new Set([2009,2021,2036,2037,2042,2043,2048,2049,2051,2059,2060,2069,2070,2076,2077,2078,2088,2093,2094,2095,2096,2098,2099,2100,2101,2103,2104,2120,2121,2122,2143,2150,2154,2162,2163,2164,2165,2174,2196,2197,2198,2209,2210,2226,2227,2249,2250,2251,2261,2262,2263,2287,2288,2289,2294,2295,2297,2315,2317,2319,2320,3022,3030,3048,3082,3095,3148,3176,3180,3219,3230,3292]);
