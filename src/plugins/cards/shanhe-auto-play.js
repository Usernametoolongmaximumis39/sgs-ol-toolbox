import { read } from '../../shared/info-runtime.js';
import { SHANHE_BATTLE_SCENE } from '../../shared/shanhe-scenes.js';

const DUEL = 8;
const TRICKS = [DUEL, 9, 10];
const SLASH = [1, 11111, 11112, 11114]; // 普通杀、火杀、雷杀、冰杀
const ALL_CARDS = [...TRICKS, ...SLASH];
const YIN_YANG_TACTIC = 2190;
const YIN_YANG_SKILL = 13178;
const DEAL_PROMPT = '出牌阶段，请选择一张卡牌';
const isAccountId = id => /^[1-9]\d*$/.test(String(id));
const sceneName = scene => scene && !scene.destroyed ? scene.SceneName || scene.sceneName || scene.name || '' : '';

function visible(node) {
  if (!node) return false;
  for (let parent = node; parent; parent = parent.parent) {
    if (parent.destroyed || parent.visible === false || parent.alpha === 0) return false;
  }
  return true;
}

function cardSkill(card) {
  if (!(Number(card?.CardId) > 0) || card.IsVirtualCard || card.Equipped) return 0;
  const skill = Number(card.FirstSkillId ?? card.FirstSkill?.ID);
  const base = Number(card.FirstIndexSkillID ?? skill);
  return base === skill || (SLASH.includes(base) && SLASH.includes(skill)) ? skill : 0;
}

function button(bar, name) {
  return bar.getButton?.(name) ?? bar.btns?.find(item => item?.name === name);
}

function enabled(node) {
  return (node?.enabled ?? node?._enabled) === true && node.disabled !== true;
}

function ordinaryPlay(self, hand, selection, bar) {
  if (!visible(hand) || !visible(bar) || (hand.AreChoosingCard ?? hand.areChoosingCard) !== true ||
      selection?.Purpose !== 'deal' || Number(selection.SpecifySkillId ?? 0) !== 0 ||
      Number(selection.Skill?.ID ?? selection.Skill?.SkillId ?? 0) !== 0) return false;
  // The original prompt survives target selection. The native End button
  // stays enabled during ordinary play even when temporarily hidden.
  const prompt = String(selection.Message ?? selection.message ?? '').replace(/<[^>]*>|\s/g, '');
  const ordinaryPrompt = prompt === DEAL_PROMPT;
  const end = button(bar, 'btnDiscard');
  const callback = selection.SelectResultCallback ?? selection.selectResultCallback;
  const ownPlay = typeof self.PlayCard_Result === 'function' && callback === self.PlayCard_Result;
  return ownPlay || (ordinaryPrompt && enabled(end) && Number(selection.CardSelector?.SelectCountMax) === 1);
}

function yinYangEquipped(self, seat) {
  const ids = read(() => seat.GetAllZhanfaIds());
  const items = read(() => self.zhanFaItems);
  const hasIds = Array.isArray(ids), hasItems = Array.isArray(items);
  if ((hasIds && ids.some(id => Number(id) === YIN_YANG_TACTIC)) ||
      (hasItems && items.some(item => item && !item.destroyed &&
        (Number(item.PlotID) === YIN_YANG_TACTIC || Number(item.SkillId) === YIN_YANG_SKILL))) ||
      read(() => seat.HasSkill(YIN_YANG_SKILL)) === true) return true;
  // The icon list may still be empty while the seat UI is being built.
  return hasIds && ids.every(id => Number(id) > 0) ? false : null;
}

function viewing(scene) {
  return scene?.IsViewer || scene?.IsReplay || scene?.isReplay || (scene?.replayBar && !scene.replayBar.destroyed);
}

export function createShanheAutoPlay(ctx) {
  const { game, settings } = ctx;
  let battle = null;

  function sync(scene, self, state) {
    const seat = self?.seat;
    if (sceneName(scene) !== SHANHE_BATTLE_SCENE || !state?.active || state.pending?.roundPassed ||
        viewing(scene) || self?.destroyed || seat?.IsSelf !== true) {
      battle = null;
      return null;
    }
    const playerId = seat.PlayerInfo?.ClientId;
    const accountId = String(isAccountId(playerId) ? playerId : read(() => game.getSelf().ClientId) ?? '');
    if (battle?.scene !== scene || battle.self !== self || battle.seat !== seat ||
        battle.accountId !== accountId || battle.sessionId !== state.sessionId || battle.deckStartSeq !== state.deckStartSeq) {
      const key = isAccountId(accountId) ? `shanheAutoPlay:${accountId}` : null;
      const mode = key && settings.get(key, false) === true ? 'remembered' : 'off';
      battle = { scene, self, seat, accountId, sessionId: state.sessionId, deckStartSeq: state.deckStartSeq, key, mode, submitted: null };
    }
    return battle.mode;
  }

  function toggle(remember) {
    const scene = game.getScene();
    const self = game.getSelfSeatUI?.() ?? scene?.SelfSeatUi;
    if (!sync(scene, self, ctx.getState()) || ctx.scope.signal.aborted) return null;
    if (remember && !battle.key) {
      ctx.notify?.('当前账号尚未识别，暂时无法记住自动打牌');
      return battle.mode;
    }
    try {
      if (remember || battle.mode === 'remembered') settings.set(battle.key, remember);
    } catch (error) {
      battle.mode = 'off';
      ctx.reportError?.(error);
      return battle.mode;
    }
    battle.mode = remember ? 'remembered' : battle.mode === 'off' ? 'on' : 'off';
    return battle.mode;
  }

  function nextPlay(state) {
    const { self, seat, submitted } = battle;
    // The card journal can lag the native turn, especially across consecutive
    // actions and reconnects. Only the live self seat and selector can authorize play.
    if (state.connected === false || seat.IsDead || seat.IsAiControl || seat.InActiveState !== true ||
        self.selectedSkillItem || visible(self.spellSelector)) return null;

    const hand = self.cardContainer, selection = hand?.SelectContext ?? hand?.selectCardContext;
    const bar = self.getButtonBar?.() ?? self.Pt ?? self.buttonBar;
    if (!bar || !ordinaryPlay(self, hand, selection, bar)) return null;
    const cards = hand.cardUis, selector = selection.CardSelector;
    if (!Array.isArray(cards) || !selector || selector.TurnCard) return null;
    if (submitted) {
      // Give the native play time to complete before touching the next card.
      if (selection === submitted.selection ||
          (state.turn === submitted.turn && cards.some(ui => ui?.Card?.CardId === submitted.cardId))) return null;
    }

    const yinYang = yinYangEquipped(self, seat);
    if (yinYang === null) return null;
    const allowed = yinYang ? ALL_CARDS : SLASH;
    const selected = selector.FirstSelectedCard;
    if (!selected) {
      if (selector.SelectedCount !== 0 || self.SelectSeatContext || typeof hand.CardUI_Click !== 'function') return null;
      const usable = cards.filter(ui => ui?.Activated === true && ui.Visible !== false && !ui.destroyed && !ui.Card?.Selected);
      let next;
      if (yinYang) {
        for (const id of TRICKS) {
          next = usable.find(ui => cardSkill(ui.Card) === id);
          if (next) break;
        }
      }
      next ??= usable.find(ui => SLASH.includes(cardSkill(ui.Card)));
      return next ? { hand, next } : null;
    }

    const skill = cardSkill(selected);
    if (selector.SelectedCount !== 1 || !allowed.includes(skill) || !cards.some(ui => ui && !ui.destroyed && ui.Card === selected)) return null;
    if (skill === DUEL || SLASH.includes(skill)) {
      const target = self.SelectSeatContext;
      if (target?.Card !== selected || target.SelectComplete !== true ||
          !(target.TargetSelector?.SelectedSeatCount > 0)) return null;
    }
    const confirm = button(bar, 'btnOK');
    if (!visible(confirm) || !enabled(confirm) || typeof confirm.onClick !== 'function') return null;
    return { confirm, selection, cardId: selected.CardId };
  }

  function update({ scene, self, state }) {
    if (!battle || battle.mode === 'off' || ctx.scope.signal.aborted) return;
    const plan = nextPlay(state);
    if (!plan || ctx.playActions?.runPriority(scene, self)) return;
    if (plan.next) {
      battle.submitted = null;
      plan.hand.CardUI_Click({ CardUi: plan.next, Card: plan.next.Card });
    } else if (plan.confirm) {
      battle.submitted = { selection: plan.selection, cardId: plan.cardId, turn: state.turn };
      plan.confirm.onClick();
    }
  }

  return { sync, toggle, update };
}
