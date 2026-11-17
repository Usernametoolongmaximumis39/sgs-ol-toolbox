import { createSpecialWindows } from './special-windows.js';
import { createBattleGuards } from './battle-guards.js';
import { read } from '../../shared/info-runtime.js';
import { usable, selfButtonBar, clickSkill, press } from './native.js';

const list = value => Array.isArray(value) ? value : [];
const same = (a, b) => a != null && b != null && String(a) === String(b);
const selected = ui => Boolean(ui?.selected || ui?.Selected || ui?.Skill?.Selected || ui?.Card?.Selected || ui?.seat?.Selected);
const active = ui => usable(ui) && (ui.activated ?? ui.Activated ?? ui.Skill?.Activated) !== false;

// Legacy policy: native assistant first, local handling after one second,
// then one trusteeship request after three seconds of local handling in our turn.
export function createAssistant(config = {}) {
  const guards = createBattleGuards(config), specialWindows = createSpecialWindows(config);
  let requested = -Infinity;
  const completed = new WeakSet(), chosenPopupCards = new WeakSet();
  function runOfficial(frame, now) {
    const self = frame.self, data = read(() => self.CurStepHelpData);
    // Popup windows receive their own assistant response; use only highlighted
    // native choices, never the first available card as a fallback.
    for (const win of frame.nodes || []) {
      if (!usable(win)) continue;
      const name = win.name || win.constructor?.name;
      if (name !== 'WuGuFengDengWindow' && name !== 'SelectCardWindow') continue;
      const pool = name === 'WuGuFengDengWindow' ? list(win.showCardUIs)
        : [...list(win.handCardUis), ...list(win.equipCardUis), ...list(win.judgeCardUis), ...list(win.regionCardUis)];
      const specialCard = name === 'SelectCardWindow' && Number(win.Skill?.SkillId) === 3572
        ? [...list(win.handCardUis), ...list(win.equipCardUis)].find(ui => usable(ui) && ui.CanBeSelected && !list(win.selectCardUis).includes(ui)) : null;
      const hinted = specialCard || pool.find(ui => usable(ui) && !selected(ui) && (list(win.aiEffectCards).includes(ui)
        || ui.AiHelpEffect && (!win.aiHelpEffect || ui.AiHelpEffect === win.aiHelpEffect)));
      if (hinted && name === 'WuGuFengDengWindow' && typeof win.OnSelectNormalCardUi === 'function') { win.OnSelectNormalCardUi(hinted); return true; }
      if (hinted && name === 'SelectCardWindow' && hinted.CanBeSelected && typeof win.onTouchCard === 'function') { chosenPopupCards.add(hinted); win.onTouchCard({ target: hinted }); return true; }
      if (name === 'SelectCardWindow' && list(win.selectCardUis).length >= Number(win.Skill?.SelectCardCountWhenResponse || 1)
        && list(win.selectCardUis).every(ui => chosenPopupCards.has(ui))
        && typeof win.confirmClick === 'function' && !completed.has(win)) { completed.add(win); win.confirmClick(); return true; }
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
    if (list(self.skillItems).includes(target) && !selected(target)) return clickSkill(target);
    if (choices.includes(target) && usable(target) && typeof selector.btnClick === 'function') {
      completed.add(data); selector.btnClick(target); return true;
    }
    if (buttons.includes(target) && usable(target)) {
      completed.add(data); if (typeof bar.Button_Click === 'function') bar.Button_Click(target); else target.onClick(); return true;
    }
    const skill = list(self.skillItems).find(ui => same(ui.Skill?.SkillId ?? ui.Skill?.ID, data.skillId));
    if (data.skillId && !/UseCard/i.test(data.protocol?._className_ ?? data.protocol?.className ?? '')) {
      if (!skill || !active(skill)) return false;
      if (!selected(skill)) return clickSkill(skill);
    }
    const container = self.cardContainer;
    const pool = [...list(container?.activatedCardtems), ...list(container?.cardUis), ...list(container?.equipCardUis)];
    const ids = list(data.cardIds).length ? data.cardIds : list(data.CardIDs).length ? data.CardIDs
      : list(data.protocol?.CardIDs).length ? data.protocol.CardIDs : data.protocol?.CardID != null ? [data.protocol.CardID] : [];
    const cards = ids.length ? ids.map(id => list(data.cardUis).find(ui => same(ui.Card?.CardId, id)) || pool.find(ui => same(ui.Card?.CardId, id))) : list(data.cardUis);
    if (pool.includes(target) && !cards.includes(target)) cards.push(target);
    if (cards.some(ui => !ui || !usable(ui) || !selected(ui) && !active(ui))) return false;
    const card = cards.find(ui => !selected(ui));
    if (card) { if (typeof card.CardUI_Click !== 'function') return false; card.CardUI_Click(null); return true; }
    const seatIds = list(data.completeSeatIds).length ? data.completeSeatIds : list(data.seatIds);
    const seats = list(frame.scene.seatContainer?.seatUIs);
    const targets = seatIds.map(id => seats.find(ui => same(ui.seat?.index ?? ui.seat?.Index ?? ui.Seat?.Index, id)));
    if (seats.includes(target) && !targets.includes(target)) targets.push(target);
    if (targets.some(ui => !ui || !usable(ui) || !selected(ui) && !active(ui))) return false;
    const seat = targets.find(ui => !selected(ui));
    if (seat) { if (typeof seat.seatClickHandler !== 'function') return false; seat.seatClickHandler(); return true; }
    let button = choices.find(ui => same(ui.name, data.buttonName) || same(ui.data?.sendData, data.buttonName));
    if (!button && Number.isInteger(data.optionIndex)) button = choices[data.optionIndex];
    if (button) { if (!usable(button) || typeof selector.btnClick !== 'function') return false; completed.add(data); selector.btnClick(button); return true; }
    button = buttons.find(ui => same(ui.name, data.buttonName));
    if (!button && !data.buttonName && (cards.length || targets.length)) button = buttons.find(ui => ui.name === 'btnOK');
    if (!button || !usable(button)) return false;
    completed.add(data);
    if (typeof bar.Button_Click === 'function') bar.Button_Click(button); else if (typeof button.onClick === 'function') button.onClick();
    return true;
  }
  let task = null, mode = 'ai', reason = '', trusteeOwned = false;
  function dispatch(bar, button) {
    if (!usable(button)) return false;
    if (typeof bar?.Button_Click === 'function') bar.Button_Click(button);
    else if (!press(button)) return false;
    return true;
  }
  function local(frame, now) {
    if (now - task.first >= 2500) for (const win of frame.nodes || []) {
      if (!usable(win)) continue;
      const name = win.name || win.constructor?.name;
      if (name === 'WuGuFengDengWindow' && typeof win.OnSelectNormalCardUi === 'function') {
        const card = list(win.showCardUIs).find(ui => usable(ui) && (ui.maskAlpha == null || Number(ui.maskAlpha) === 0) && !win.IsCardRemoved?.(ui.Card));
        if (card) { win.OnSelectNormalCardUi(card); return true; }
      }
      if (name === 'SelectCardWindow') {
        const chosen = list(win.selectCardUis), count = Number(win.Skill?.SelectCardCountWhenResponse || 1);
        if (chosen.length >= count && typeof win.confirmClick === 'function' && !completed.has(win)) { completed.add(win); win.confirmClick(); return true; }
        const card = [...list(win.equipCardUis), ...list(win.handCardUis), ...list(win.judgeCardUis), ...list(win.regionCardUis)]
          .find(ui => usable(ui) && ui.CanBeSelected && !chosen.includes(ui));
        if (card && typeof win.onTouchCard === 'function') { win.onTouchCard({ target: card }); return true; }
      }
    }
    const self = frame.self, bar = selfButtonBar(self), selector = self.spellSelector;
    if (usable(selector) && typeof selector.btnClick === 'function') {
      const choice = list(selector.btnList).find(b => usable(b) && (b._enabled ?? b.enabled) === true);
      if (choice) { selector.btnClick(choice); return true; }
    }
    const container = self.cardContainer, context = container?.selectCardContext;
    const buttons = usable(bar) ? list(bar.btns) : [];
    const enabled = b => usable(b) && (b._enabled ?? b.enabled) === true;
    const ok = buttons.find(b => enabled(b) && b.name === 'btnOK');
    const cancel = buttons.find(b => enabled(b) && b.name === 'btnCancel');
    if (Number(context?.Skill?.SkillId ?? context?.Skill?.ID) === 700
      && Number(context?.SelectCountMin) === 0 && Number(context?.SelectCountMax) === 0) return dispatch(bar, cancel);
    const cards = [...new Set([...list(container?.activatedCardtems), ...list(container?.cardUis)])];
    const chosen = cards.filter(selected);
    if (chosen.length || list(context?.SelectedCardIds).length) {
      if (ok) return dispatch(bar, ok);
    } else {
      // Legacy card() uses native AllSelectHandCards before its first legal
      // activated card. Do not choose disabled or unavailable cards ourselves.
      if (typeof container?.AllSelectHandCards === 'function') container.AllSelectHandCards();
      if (!cards.some(selected)) {
        const card = cards.find(c => usable(c) && c.activated === true);
        if (card && typeof card.setSelected === 'function') card.setSelected(true);
      }
    }
    if (enabled(buttons[0])) return dispatch(bar, buttons[0]);
    const seat = list(frame.scene.seatContainer?.seatUIs).find(ui => usable(ui) && ui.activated === true && !selected(ui));
    if (seat && typeof seat.seatClickHandler === 'function') seat.seatClickHandler();
    if (ok) return dispatch(bar, ok);
    // Preserve the original bar order (0,1,2,3), including a visible Cancel
    // when optional skills such as Yingyuan have no legal confirmation.
    return dispatch(bar, buttons.slice(0, 4).find(enabled));
  }
  function run(frame, now, { allowTrustee = true } = {}) {
    const self = frame.self;
    if (!self) { task = null; return false; }
    if (trusteeOwned && self.seat?.IsAiControl === true) {
      if (self.seat?.InOwnRound === false && typeof self.onTrusteeshipClick === 'function') {
        if (now - (task?.releaseAt ?? -Infinity) >= 3000 && (task?.releaseTries || 0) < 1) {
          task ||= {}; task.releaseAt = now; task.releaseTries = (task.releaseTries || 0) + 1;
          self.onTrusteeshipClick(); mode = 'local'; return true;
        }
      }
      mode = 'trustee'; return false;
    }
    if (trusteeOwned && self.seat?.IsAiControl === false && self.seat?.InOwnRound === false) trusteeOwned = false;
    if (config.canOperate?.() === false) { mode = 'ai'; reason = '等待游戏允许操作'; return false; }
    const hint = self.CurStepHelpData;
    const hasHint = hint && !completed.has(hint) && (hint.skillId || hint.target || hint.buttonName || Number.isInteger(hint.optionIndex)
      || list(hint.cardIds).length || list(hint.cardUis).length || list(hint.CardIDs).length || list(hint.seatIds).length || list(hint.completeSeatIds).length
      || list(hint.protocol?.CardIDs).length || hint.protocol?.CardID != null);
    const protection = guards.run(frame, { cancelWuxie: config.cancelWuxie?.() ?? true,
      official: Boolean(hasHint) });
    if (protection) {
      reason = protection.reason;
      if (protection.officialOnly) { mode = 'ai'; return runOfficial(frame, now); }
      mode = 'local'; return protection.acted;
    }
    const special = specialWindows.run(frame);
    if (special) { mode = 'local'; reason = special.reason; return special.acted; }
    reason = '';
    const bar = selfButtonBar(self), context = self.cardContainer?.selectCardContext;
    const selector = usable(self.spellSelector) ? self.spellSelector : null;
    const key = [context?.SpecifySkillId ?? context?.Skill?.SkillId ?? '', context?.message ?? '',
      selector?.spell?.SkillId ?? '', list(bar?.btns).filter(b => usable(bar) && usable(b) && (b._enabled ?? b.enabled) === true).map(b => b.name).join(',')].join('|');
    if (!task || task.scene !== frame.scene || task.self !== self || task.context !== context || task.key !== key || task.selector !== selector) {
      task = { scene: frame.scene, self, context, key, selector, first: now, localAt: null, lastOfficial: -Infinity, lastLocal: -Infinity, triedTrustee: false };
      mode = 'ai';
    }
    const actionable = Boolean(self.CurStepHelpData) || list(bar?.btns).some(b => usable(bar) && usable(b) && (b._enabled ?? b.enabled) === true)
      || selector && list(selector.btnList).some(b => usable(b) && (b._enabled ?? b.enabled) === true)
      || list(self.cardContainer?.activatedCardtems).some(c => usable(c) && c.activated === true)
      || (frame.nodes || []).some(win => usable(win) && ['WuGuFengDengWindow', 'SelectCardWindow'].includes(win.name || win.constructor?.name));
    if (task.help !== self.CurStepHelpData) { task.help = self.CurStepHelpData; task.helpSeen = now; }
    if (task.localAt == null) {
      if (runOfficial(frame, now)) { task.lastOfficial = now; mode = 'ai'; return true; }
      if (!actionable || now - task.first < 1000 || now - task.lastOfficial < 2000 || task.help && now - task.helpSeen < 1000) { mode = 'ai'; return false; }
      task.localAt = now;
    }
    mode = 'local';
    let acted = false;
    if (now - task.lastLocal >= 1000) { task.lastLocal = now; acted = local(frame, now); }
    if (allowTrustee && now - task.localAt >= 3000 && !task.triedTrustee && self.seat?.InOwnRound === true
      && self.seat?.IsAiControl !== true && typeof self.onTrusteeshipClick === 'function') {
      task.triedTrustee = true; trusteeOwned = true; self.onTrusteeshipClick(); mode = 'trustee'; return true;
    }
    return acted;
  }
  return { run, mode: () => mode, reason: () => reason, isTrustee: () => trusteeOwned, observe: guards.observe };

}

// Old xiaochao 1.6.75 DKgWgpKJv, used only with the native shop's own price check.
export const TRAINING_SHOP_IDS = new Set([2009,2021,2036,2037,2042,2043,2048,2049,2051,2059,2060,2069,2070,2076,2077,2078,2088,2093,2094,2095,2096,2098,2099,2100,2101,2103,2104,2120,2121,2122,2143,2150,2154,2162,2163,2164,2165,2174,2196,2197,2198,2209,2210,2226,2227,2249,2250,2251,2261,2262,2263,2287,2288,2289,2294,2295,2297,2315,2317,2319,2320,3022,3030,3048,3082,3095,3148,3176,3180,3219,3230,3292]);
