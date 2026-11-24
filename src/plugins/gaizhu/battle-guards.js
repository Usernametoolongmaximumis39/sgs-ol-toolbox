import { field, read } from '../../shared/info-runtime.js';
import { usable, selfButtonBar, press, walkNative, clickSkill, label } from './native.js';

const list = v => Array.isArray(v) ? v : [];
const enabled = v => usable(v) && (v._enabled ?? v.enabled) === true;
const chosen = v => Boolean(v?.selected || v?.Selected || v?.Card?.Selected);
const cardId = v => v?.Card?.CardId;
const spellId = spell => Number(spell?.SkillId ?? spell?.ID);
const skillId = v => spellId(v?.Skill);
const legal = v => usable(v) && (v.activated ?? v.Activated ?? v.Skill?.Activated) === true;
const TAO = 3;
export const ICE_SWORD = 201;
const DEFENSIVE_ARMOR = new Set([16, 88, 200]); // 八卦阵、藤甲、仁王盾
const SILVER_LION = 89;
const RESCUE_PROMPT = /求桃|濒死.{0,50}(?:桃|自救)|桃(?:或者|或)酒.{0,20}(?:回复|恢复).*体力/;
const seatOf = ui => ui?.seat ?? ui?.Seat;
const seatIndex = seat => Number(seat?.Index ?? seat?.index ?? NaN);
const figure = seat => Number(seat?.Figure ?? seat?.figure);
const buttonData = button => button?.data ?? button?.Data;
const choiceText = button => label(buttonData(button)) || label(button);

function canRescue(frame, index, training) {
  const self = seatOf(frame.self);
  if (!self) return false;
  const seats = [...new Set([self, ...list(frame.scene.seatContainer?.seatUIs).map(seatOf)])].filter(Boolean);
  const asking = seats.filter(seat => seat.IsAskingTao === true);
  const next = Number.isInteger(index) && index >= 0 && index < 255
    ? seats.find(seat => seatIndex(seat) === index) : null;
  // The seat flag also works when GameContext is private to the native client.
  // Conflicting targets do not authorize an automatic rescue.
  const dying = next ?? (asking.length === 1 ? asking[0] : null);
  if (!dying || (asking.length > 0 && !asking.includes(dying))) return false;
  if (dying === self) return true;
  if (training) return false;
  const mine = figure(self), target = figure(dying);
  return mine === 3 ? target === 3 : [1, 2].includes(mine) && [1, 2].includes(target);
}

// Copy protocol scalars before the client reuses packet objects. No native
// protocol, skill instance or account object is retained in the event queue.
export function projectBattleGuard(packet) {
  const trigger = field(packet, 'FirstTriggerParam') || field(packet, 'TriggerSpellData')?.[0];
  const targets = list(trigger?.Targets);
  return { trigger: Number(trigger?.SpellId), source: Number(trigger?.SeatId ?? NaN), spell: Number(field(packet, 'SrcSpellID')),
    caster: Number(field(packet, 'SrcSpellCasterSeat') ?? NaN),
    targets: targets.length <= 16 ? targets.map(target => Number(target ?? NaN)) : [], count: Number(trigger?.Datas?.[0] ?? NaN),
    single: Number(read(() => field(packet, 'SrcSpell').TargetCountMax)) === 1,
    seat: Number(field(packet, 'SeatID')), effect: Number(field(packet, 'EffectIndex')),
    skill: Number(field(packet, 'SpellID')), from: Number(field(packet, 'FromZone')), to: Number(field(packet, 'ToZone')),
    move: Number(field(packet, 'MoveType')), owner: Number(field(packet, 'SrcSeatID')), cardCount: Number(field(packet, 'CardCount')),
    cards: list(field(packet, 'CardIDs')).length <= 128 ? list(field(packet, 'CardIDs')).map(Number) : [] };
}

export function createBattleGuards({ getCardMeta = () => null, getPeachTarget } = {}) {
  let nullification = null, iceInquiry = null, peachTarget, lastSlash = null;
  const judgments = new Map(), colorChoices = new Map(), done = new WeakSet(), tries = new WeakMap();
  function recordPlay(source, spell, boost, targets) {
    lastSlash = spell === 1 && boost === 0 && targets.length
      ? { source, targets: targets.map(Number) } : null;
  }
  function observe(type, data) {
    if (type === 'GsCTriggerSpellNew') {
      nullification = data.trigger === 13 ? data : null;
      iceInquiry = data.trigger === ICE_SWORD ? data : null;
      peachTarget = data.trigger === TAO && data.targets.length === 1 ? data.targets[0] : undefined;
    }
    if (type === 'GsCGamephaseNtf' || type === 'MsgGameTurnNtf') {
      nullification = null;
      iceInquiry = null;
      peachTarget = undefined;
      lastSlash = null;
    }
    if (type === 'PubGsCUseSpell' && data.skill === 3571 && data.effect === 1) { judgments.delete(data.seat); colorChoices.delete(data.seat); }
    if (type === 'PubGsCMoveCard' && data.skill === 3571 && data.from === 3 && data.to === 8 && data.move === 6
      && Number.isInteger(data.owner) && data.owner >= 0 && data.owner < 255 && data.cards.length === data.cardCount) {
      judgments.set(data.owner, [...new Set([...(judgments.get(data.owner) || []), ...data.cards])].slice(-128));
    }
  }
  function allowsNullification(self) {
    const d = nullification, mine = Number(self.seat?.Index ?? self.seat?.index);
    if (!d || !Number.isInteger(mine) || !Number.isInteger(d.count) || d.count < 0 || d.targets.length !== 1) return false;
    const even = d.count % 2 === 0, target = d.targets[0];
    if (!Number.isInteger(target) || target < 0 || target >= 255) return false;
    // The effect and its target identify these single-target defenses even
    // when a delayed trick outlives the player who used it.
    if (even && target === mine && [4, 15, 84].includes(d.spell)) return true;
    if (!d.single || !Number.isInteger(d.source) || d.source < 0 || d.source >= 255) return false;
    return even ? target === mine && d.source !== mine : d.source === mine;
  }
  function shouldUseIceSword(frame) {
    const { self, scene } = frame, mine = seatIndex(seatOf(self)), inquiry = iceInquiry;
    if (!lastSlash || !inquiry || inquiry.caster !== mine || lastSlash.source !== mine
      || inquiry.spell !== 1 || inquiry.targets.length !== 1) return false;
    const index = inquiry.targets[0];
    if (index === mine || !lastSlash.targets.includes(index)) return false;
    const target = list(scene.seatContainer?.seatUIs).map(seatOf).find(seat => seatIndex(seat) === index);
    if (!target || target.IsDead === true || !(Number(target.Hp) >= 3)
      || Number(target.HandCardCount) + Number(target.EquipCardCount) !== 2) return false;
    // Removing a key armor and the only other card is worth trading a plain
    // Slash here. Silver Lion would heal the target when discarded.
    const equipment = list(target.EquipCards).map(card => Number(card?.FirstSkillId ?? card?.FirstSkill?.ID));
    return equipment.some(id => DEFENSIVE_ARMOR.has(id)) && !equipment.includes(SILVER_LION);
  }
  function run(frame, { official = false, identity = false, training = false } = {}) {
    const self = frame.self, container = self?.cardContainer, context = container?.selectCardContext ?? container?.SelectContext;
    if (!self) return null;
    const bar = selfButtonBar(self), selector = usable(self.spellSelector) ? self.spellSelector : null;
    const buttons = usable(bar) ? list(bar.btns) : [];
    const choices = list(selector?.btnList);
    const click = b => {
      if (!enabled(b)) return false;
      if (typeof bar?.Button_Click === 'function') bar.Button_Click(b); else if (!press(b)) return false;
      return true;
    };
    const ok = () => click(buttons.find(b => b.name === 'btnOK'));
    const cancel = () => {
      const b = choices.find(b => {
        const data = buttonData(b);
        return enabled(b) && (b.name === 'btnCancel' || /^(取消|放弃)$/.test(choiceText(b)) || Number(data?.sendData) === 255
          || Number(data?.sendData) === 0 && !data?.callBack);
      });
      if (b && typeof selector.btnClick === 'function') { selector.btnClick(b); return true; }
      return click(buttons.find(b => b.name === 'btnCancel'));
    };
    const ids = [Number(context?.SpecifySkillId), skillId(context), spellId(selector?.spell)];
    const asked = spellId(seatOf(self)?.LastAskSkill);
    const messages = [selector?.txtOptMsg, bar?.txtOptMsg, { text: context?.Message ?? context?.message }]
      .map(node => label(node).replace(/[\s“”「」【】]/g, ''));
    if (identity || training) {
      if ((ids.includes(TAO) || asked === TAO || messages.some(message => RESCUE_PROMPT.test(message)))
        && !canRescue(frame, Number(peachTarget ?? getPeachTarget?.() ?? NaN), training)) {
        const acted = cancel();
        const declined = training ? '已跳过单骑非自身求桃' : '已跳过非己方或身份未明的求桃';
        return { acted, reason: acted ? declined : '求桃：等待可用取消按钮' };
      }
    }
    const iceChoice = choices.find(button => Number(buttonData(button)?.callBackParams?.[0]?.FirstTriggerParam?.SpellId) === ICE_SWORD
      || choiceText(button) === '寒冰剑');
    if (iceChoice) return shouldUseIceSword(frame) ? null : { excludedChoice: iceChoice };
    const icePrompt = ids.includes(ICE_SWORD) || asked === ICE_SWORD
      || messages.some(message => /是否.{0,24}发动寒冰剑/.test(message));
    const removingCards = (frame.nodes || []).some(win => usable(win) && !win.closeing && !win.isClosing
      && (win.name || win.constructor?.name) === 'SelectCardWindow' && skillId(win) === ICE_SWORD);
    if (icePrompt && !removingCards) {
      const useIce = shouldUseIceSword(frame);
      const confirm = choices.find(b => enabled(b) && (b.name === 'btnOK' || Number(buttonData(b)?.sendData) === 1));
      let acted;
      if (useIce && confirm && typeof selector.btnClick === 'function') { selector.btnClick(confirm); acted = true; }
      else acted = useIce ? ok() : cancel();
      return { acted, reason: acted ? (useIce ? '已发动寒冰剑拆除关键防具' : '已保留杀的伤害') : '等待寒冰剑选项' };
    }
    if (ids.includes(13)) {
      if (official) return { officialOnly: true, reason: '按小杀助手处理无懈询问' };
      if (!allowsNullification(self)) {
        const acted = cancel();
        return { acted, reason: acted ? '已拦截非必要无懈询问' : '等待无懈取消按钮' };
      }
      return { playWuxie() {
        const cards = list(container?.cardUis);
        const hand = list(container?.activatedCardtems);
        const isWuxie = ui => Number(ui?.Card?.FirstSkillId ?? ui?.Card?.FirstSkill?.ID) === 13;
        const selectedCard = [...new Set([...cards, ...hand])].find(chosen);
        if (selectedCard) return isWuxie(selectedCard) && ok();
        const card = [...hand, ...cards].find(ui => isWuxie(ui) && legal(ui));
        if (typeof card?.CardUI_Click === 'function') card.CardUI_Click(null);
        else if (typeof card?.setSelected === 'function') card.setSelected(true);
        else return false;
        return true;
      } };
    }
    // Jinlan is a dedicated option window, not a generic button bar. Keep
    // its native mouse-down handler arguments rather than clicking a label.
    const jinlan = (frame.nodes || []).find(w => usable(w) && (w.name || w.constructor?.name) === 'JinLan2025Window');
    if (jinlan) {
      if (done.has(jinlan) || jinlan.isPlayingSelectClose) return { acted: false, reason: '等待尽览选项结束' };
      const options = walkNative([jinlan.contentSprite], 256).filter(w => usable(w) && /^JinLan2025Option_/.test(w.name || '') && w.mouseEnabled !== false);
      const hint = self.CurStepHelpData, title = hint?.optionTitle ?? hint?.title ?? hint?.optionName;
      const option = options.find(o => title && o.name.endsWith('_' + title)) || options[hint?.optionIndex] || options[0];
      if (!option) return { acted: false, reason: '等待尽览选项' };
      const events = option._events?.mousedown, handler = (Array.isArray(events) ? events : [events]).find(e => e?.caller === jinlan && e.method === jinlan.onOptionMouseDown && e.args?.[0]);
      if (handler && typeof jinlan.onOptionMouseDown === 'function') jinlan.onOptionMouseDown(handler.args[0], option);
      else if (typeof option.event === 'function') option.event('mousedown');
      else return { acted: false, reason: '等待尽览原生操作接口' };
      if (jinlan.isPlayingSelectClose || jinlan.destroyed || jinlan.visible === false) done.add(jinlan);
      return { acted: true, reason: '已选择尽览选项' };
    }
    const pool = [...new Set([...list(container?.equipCardUis), ...list(container?.cardUis)])];
    const setCards = (all, selected) => {
      if (all.some(c => chosen(c) !== selected.includes(c) && typeof c.setSelected !== 'function')) return false;
      for (const c of all) if (chosen(c) !== selected.includes(c)) c.setSelected(selected.includes(c));
      return true;
    };
    if (ids.includes(3824) && container?.IsShowedVirtual && usable(bar)) {
      const cards = list(container.virtualCardUis), sha = cards.find(c => usable(c) && c.Card?.IsVirtualCard && Number(c.Card.FirstSkillId) === 7);
      if (!context || done.has(context)) return { acted: false, reason: '等待虚拟牌询问结束' };
      if (!sha || !chosen(sha) && !legal(sha)) return { acted: false, reason: '等待可用虚拟牌' };
      const changed = setCards(cards, [sha]);
      if (changed && ok()) done.add(context);
      return { acted: changed, reason: '已处理虚拟牌选择' };
    }
    if (ids.includes(3572) && Number(context?.SelectCountMin) === 1 && Number(context?.SelectCountMax) === 1 && usable(bar)) {
      if (done.has(context)) return { acted: false, reason: '等待单张选牌询问结束' };
      const card = pool.find(c => chosen(c) || legal(c));
      const changed = card && setCards(pool, [card]);
      if (changed && ok()) done.add(context);
      return { acted: Boolean(changed), reason: '已按单张限制选牌' };
    }
    if (Number(selector?.spell?.SkillId) === 3571) {
      const mine = Number(self.seat?.Index ?? self.seat?.index), cards = judgments.get(mine) || [];
      let red = 0, black = 0;
      for (const id of cards) { const suit = Number(getCardMeta(id)?.suit); if ([1,2].includes(suit)) red++; else if ([3,4].includes(suit)) black++; }
      const color = black > red ? 2 : 1;
      const button = list(selector.btnList).find(b => enabled(b) && Number(b.data?.callBackParams?.[0]) === color);
      if (button && typeof selector.btnClick === 'function' && !colorChoices.has(mine)) { colorChoices.set(mine, color); selector.btnClick(button); return { acted: true, reason: '已按判定牌颜色选择' }; }
      return { acted: false, reason: '等待判定牌颜色选项' };
    }
    const message = String(context?.message || '').replace(/<[^>]*>/g, '');
    if (Number(self.seat?.LastAttackByTheSkill?.ID) === 83 && /请选择一张卡牌用于展示|色的手牌，对/.test(message)) {
      if (done.has(context)) return { acted: false, reason: '等待火攻询问结束' };
      if (read(() => self.seat.HasSkill(3744)) && message.includes('色的手牌，对')) {
        const skill = list(self.skillItems).find(s => Number(s.Skill?.SkillId) === 3744);
        if (skill && !skill.Selected && legal(skill)) { clickSkill(skill); return { acted: true, reason: '火攻转化选牌' }; }
      }
      const card = pool.find(chosen) || pool.find(legal);
      const changed = card && setCards(pool, [card]);
      const submitted = changed && ok() || !card && cancel();
      if (submitted) done.add(context);
      return { acted: Boolean(changed || submitted), reason: '已处理火攻选牌' };
    }
    const discard = message.match(/需要弃置\s*(\d+)\s*张卡牌/);
    if (discard && context) {
      if (done.has(context) || (tries.get(context) || 0) >= 10) return { acted: false, reason: '等待弃牌询问结束' };
      const cards = [...new Set(list(container.activatedCardtems).length ? container.activatedCardtems : list(container.cardUis))].filter(c => usable(c) && (chosen(c) || legal(c)));
      const count = Number(context.SelectCountMax) > 0 ? Number(context.SelectCountMax) : Number(discard[1]);
      if (!Number.isInteger(count) || count <= 0 || cards.length < count) return { acted: false, reason: '等待足够的合法弃牌' };
      const priority = c => { const id = Number(getCardMeta(cardId(c))?.spellId ?? c.Card?.FirstSkillId), i = [3,2,13,82,1].indexOf(id); return i < 0 ? 5 : i; };
      const retained = cards.filter(chosen).slice(0, count);
      const targets = [...retained, ...cards.filter(c => !retained.includes(c)).sort((a,b) => priority(b)-priority(a)).slice(0, count-retained.length)];
      tries.set(context, (tries.get(context) || 0) + 1);
      const changed = setCards(cards, targets);
      if (changed && targets.length === count && ok()) done.add(context);
      return { acted: changed, reason: '已按数量和旧优先级弃牌' };
    }
    return null;
  }
  return { run, observe, recordPlay };
}
