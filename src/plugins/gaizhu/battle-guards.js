import { field, read } from '../../shared/info-runtime.js';
import { usable, selfButtonBar, press, walkNative, clickSkill } from './native.js';

const list = v => Array.isArray(v) ? v : [];
const enabled = v => usable(v) && (v._enabled ?? v.enabled) === true;
const chosen = v => Boolean(v?.selected || v?.Card?.Selected);
const cardId = v => v?.Card?.CardId;
const skillId = v => Number(v?.Skill?.SkillId ?? v?.Skill?.ID);
const legal = v => usable(v) && (v.activated ?? v.Activated ?? v.Skill?.Activated) === true;

// Copy protocol scalars before the client reuses packet objects. No native
// protocol, skill instance or account object is retained in the event queue.
export function projectBattleGuard(packet) {
  const trigger = field(packet, 'FirstTriggerParam') || field(packet, 'TriggerSpellData')?.[0];
  const targets = list(trigger?.Targets);
  return { trigger: Number(trigger?.SpellId), source: Number(trigger?.SeatId), spell: Number(field(packet, 'SrcSpellID')),
    targets: targets.length <= 16 ? targets.map(Number) : [], count: Number(trigger?.Datas?.[0]),
    single: Number(read(() => field(packet, 'SrcSpell').TargetCountMax)) === 1,
    seat: Number(field(packet, 'SeatID')), effect: Number(field(packet, 'EffectIndex')),
    skill: Number(field(packet, 'SpellID')), from: Number(field(packet, 'FromZone')), to: Number(field(packet, 'ToZone')),
    move: Number(field(packet, 'MoveType')), owner: Number(field(packet, 'SrcSeatID')), cardCount: Number(field(packet, 'CardCount')),
    cards: list(field(packet, 'CardIDs')).length <= 128 ? list(field(packet, 'CardIDs')).map(Number) : [] };
}

export function createBattleGuards({ getCardMeta = () => null } = {}) {
  let nullification = null;
  const judgments = new Map(), colorChoices = new Map(), done = new WeakSet(), tries = new WeakMap();
  function observe(type, data) {
    if (type === 'GsCTriggerSpellNew') nullification = data.trigger === 13 ? data : null;
    if (type === 'GsCGamephaseNtf' || type === 'MsgGameTurnNtf') nullification = null;
    if (type === 'PubGsCUseSpell' && data.skill === 3571 && data.effect === 1) { judgments.delete(data.seat); colorChoices.delete(data.seat); }
    if (type === 'PubGsCMoveCard' && data.skill === 3571 && data.from === 3 && data.to === 8 && data.move === 6
      && Number.isInteger(data.owner) && data.owner >= 0 && data.owner < 255 && data.cards.length === data.cardCount) {
      judgments.set(data.owner, [...new Set([...(judgments.get(data.owner) || []), ...data.cards])].slice(-128));
    }
  }
  function allowsNullification(self) {
    const d = nullification, mine = Number(self.seat?.Index ?? self.seat?.index);
    if (!d || !Number.isInteger(mine) || !Number.isInteger(d.source) || d.source < 0 || d.source >= 255
      || !Number.isInteger(d.count) || d.count < 0 || d.targets.length !== 1) return false;
    const even = d.count % 2 === 0, target = d.targets[0];
    if (!Number.isInteger(target) || target < 0 || target >= 255) return false;
    return even && target === mine && [15, 84].includes(d.spell)
      || even && d.single && d.source !== mine && target === mine
      || !even && d.single && d.source === mine;
  }
  function run(frame, { cancelWuxie = true, official = false } = {}) {
    const self = frame.self, container = self?.cardContainer, context = container?.selectCardContext;
    if (!self) return null;
    const bar = selfButtonBar(self), selector = usable(self.spellSelector) ? self.spellSelector : null;
    const buttons = usable(bar) ? list(bar.btns) : [];
    const click = b => {
      if (!enabled(b)) return false;
      if (typeof bar?.Button_Click === 'function') bar.Button_Click(b); else if (!press(b)) return false;
      return true;
    };
    const ok = () => click(buttons.find(b => b.name === 'btnOK'));
    const cancel = () => {
      const b = list(selector?.btnList).find(b => enabled(b) && (b.name === 'btnCancel' || Number(b.data?.sendData) === 255
        || Number(b.data?.sendData) === 0 && !b.data?.callBack));
      if (b && typeof selector.btnClick === 'function') { selector.btnClick(b); return true; }
      return click(buttons.find(b => b.name === 'btnCancel'));
    };
    const ids = [Number(context?.SpecifySkillId), skillId(context), Number(selector?.spell?.SkillId)];
    if (ids.includes(13)) {
      // Both supported automation modes are outside Shanhetu. This is the
      // legacy cancelWuxie switch's non-Shanhetu rule, before any auto-confirm.
      if (cancelWuxie || !official && !allowsNullification(self)) return { acted: cancel(), reason: '已拦截非必要无懈询问' };
      if (official) return { officialOnly: true, reason: '按小杀助手处理无懈询问' };
      // An allowed defensive/counter-counter trick can follow the normal AI
      // or local path. Missing source/count/target evidence never grants it.
      return null;
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
  return { run, observe };
}
