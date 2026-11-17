import { read } from '../../shared/info-runtime.js';
import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { EXTRA_IDS, EXTRA_NAMES, skillKind, model, selected, available, red, black, skillId, equip, nonBasic, select,
  miuyanCard, longyinCard, pojunCards, wuniangCard } from './strategies.js';

const list = value => Array.isArray(value) ? value.slice(0,256) : [];
const id = skill => Number(skill?.SkillId ?? skill?.ID);
const text = value => String(value || '').replace(/<[^>]*>/g,'').replace(/\s/g,'');
export const isShanhe = (scene, gc) => Boolean(gc?.IsRoguelike1v1 || gc?.IsRogueLike || /Rogue/.test(String(scene?.SceneName)));
export function redShaOwnTurn(s, source, currentSeat) {
  const ownId=nativeSeatId(s.self), ownRound=nativeSeat(s.self)?.InOwnRound;
  return ownId !== undefined && ownRound !== false &&
    (ownRound === true || currentSeat === ownId) && source?.seat === ownId &&
    source.spell === 1 && [1,2].includes(source.suit);
}

export function createExtended(ctx, api) {
  const revisions = new WeakMap();
  function cards(s) {
    const c = s.self.cardContainer;
    return [...new Set([...list(c.cardUis), ...list(c.equipCardUis), ...list(c.muniuCardUis)])];
  }
  function one(s, predicate, preferred) {
    const all = cards(s), existing = all.filter(selected);
    if (existing.length) return existing.length === 1 && predicate(existing[0]);
    const card = preferred || all.find(c => available(c) && predicate(c));
    return card && available(card) && predicate(card) && select(card);
  }
  function selfTarget(s) {
    const ownId = nativeSeatId(s.self);
    if (ownId === undefined) return false;
    const seats = [...new Set([...list(s.scene.seatContainer?.seatUIs),s.self])];
    if (seats.some(x => nativeSeat(x)?.Selected && nativeSeatId(x) !== ownId)) return false;
    const target = seats.find(x => nativeSeatId(x) === ownId && x.Activated === true) ||
      seats.find(x => nativeSeatId(x) === ownId && nativeSeat(x)?.Selected);
    if (nativeSeat(target)?.Selected) return true;
    if (!target || target.Activated !== true) return false;
    // SeatUI's native click emits SELECTE with [SeatUI,event]. onMouse is a
    // button dispatcher and is not the seat selection entry point.
    if (typeof target.seatClickHandler === 'function') target.seatClickHandler(null);
    else if (typeof target.event === 'function') target.event('SELECTE',[target,null]);
    else return false;
    return nativeSeat(target)?.Selected === true;
  }
  function decline(s) {
    if (s.self.spellSelector?.visible) api.choice(s,d =>
      typeof d.callBack === 'function' && d.callBackParams?.[0] === null && text(d.label) === '取消' ||
      !d.callBack && [0,255].includes(Number(d.sendData)));
    else api.button(s,'btnCancel');
  }
  function windowNodes(s) {
    const queue = [read(() => ctx.window.Laya.stage),s.scene], seen = new Set(), result = [];
    for (let i=0;i<queue.length && i<2048;i++) {
      const node=queue[i]; if (!node || seen.has(node) || node.destroyed || node.visible === false) continue;
      seen.add(node);
      if (['SelectCardWindow','LuoYingSelectCardWindow'].includes(node.name)) result.push(node);
      queue.push(...list(node._children));
    }
    return result;
  }
  function windows(s) {
    if (!api.hasKind('pojun') && !api.hasKind('luoying') && !api.hasKind('wuniang')) return false;
    for (const win of windowNodes(s)) {
      const kind = win.name === 'LuoYingSelectCardWindow' ? 'luoying' : skillKind(id(win.Skill));
      if (!['luoying','pojun','wuniang'].includes(kind) || !api.hasKind(kind)) continue;
      let entry = revisions.get(win);
      if (!entry) {
        entry = {revision:0,submitted:-1}; revisions.set(win,entry);
        if (typeof win.enterWindow === 'function') ctx.scope.patch(win,'enterWindow',original => function(...args) {
          entry.revision++; return original.apply(this,args);
        });
      }
      if (entry.submitted === entry.revision) return true;
      if (kind === 'wuniang') {
        // Prefer armour, then other equipment, then a legal hidden hand.
        const card = wuniangCard(list(win.handCardUis),list(win.equipCardUis));
        if (Number(win.Skill.SelectCardCountWhenResponse) !== 1 || !card ||
          model(card).CardId == null || typeof win.Skill.SelectCardComplete !== 'function' || typeof win.Close !== 'function') return true;
        entry.submitted=entry.revision;
        win.Skill.SelectCardComplete([model(card).CardId]); win.Close(); return true;
      }
      if (kind === 'luoying') {
        if (!list(win.cardIds).length || typeof win.sureBtnHandler !== 'function' || !win.btn1 || win.btn1.enabled === false) return true;
        entry.submitted=entry.revision; win.sureBtnHandler({currentTarget:win.btn1}); return true;
      }
      const target=win.TargetSeat;
      const ownCount=Number(s.self.seat?.EquipCardCount ?? s.self.seat?.EquipCards?.length);
      const wanted=pojunCards(list(win.handCardUis),list(win.equipCardUis),Number(target?.Hp),ownCount);
      if (!wanted?.length || typeof win.addSelectCardNormalUi !== 'function') return true;
      const max=Number(win.Skill.SelectCardCountWhenResponse);
      if (!Number.isFinite(max) || wanted.length>max) return true;
      // Native autoSelect starts with hands. Replace that preview through its
      // own selection methods before submitting, including the one-card case.
      if (max === 1) {
        if (typeof win.Skill.SelectCardComplete !== 'function' || typeof win.Close !== 'function') return true;
        entry.submitted=entry.revision;
        win.Skill.SelectCardComplete([model(wanted[0]).CardId]); win.Close(); return true;
      }
      if (typeof win.confirmClick !== 'function') return true;
      for (const c of list(win.selectCardUis)) win.addSelectCardNormalUi(c);
      for (const c of wanted) win.addSelectCardNormalUi(c);
      if (list(win.selectCardUis).length !== wanted.length || win.confirm_btn?.enabled === false) return true;
      entry.submitted=entry.revision; win.confirmClick(null); return true;
    }
    return false;
  }
  function run(s, context, message, source, currentSeat, gc) {
    if (windows(s)) return true;
    const selector=s.self.spellSelector, targetContext=s.scene.seatContainer?.selectContext;
    // The card context can survive into a subsequent optional prompt. Prefer
    // the current native operation bar for HP-loss and draw/discard boundaries.
    const currentMessage=s.self.Pt?.txtOptMsg?._innerHTML || s.self.buttonBar?.txtOptMsg?._innerHTML || message;
    const ids=[selector?.visible ? id(selector.spell) : 0,id(context?.Skill),Number(context?.SpecifySkillId),id(targetContext?.Skill)];
    const active=(api.hasKind('wuniang') && /^是否失去1点体力重置镇南[？?]?$/.test(text(currentMessage)) ? 3796 : 0) || ids.find(n=>EXTRA_IDS.includes(n) && api.locked(n)) ||
      EXTRA_IDS.find(n=>api.locked(n) && text(currentMessage).startsWith('是否发动'+EXTRA_NAMES[skillKind(n)]));
    if (selector?.visible) {
      const triggerId=d=>Number(d.callBackParams?.[0]?.FirstTriggerParam?.SpellId ?? d.callBackParams?.[0]?.TriggerSpellData?.[0]?.SpellId);
      const forbidden=n=>skillKind(n)==='yingyuan' || skillKind(n)==='longyin' && !redShaOwnTurn(s,source,currentSeat);
      const triggers=list(selector.btnList).map(b=>triggerId(b.data||b.Data||{}));
      if (triggers.some(n=>api.locked(n) && forbidden(n))) {
        if (!api.choice(s,d=>api.locked(triggerId(d)) && !forbidden(triggerId(d)))) decline(s);
        return true;
      }
    }
    if (!active) return false;
    const kind=skillKind(active), plain=text(currentMessage), all=cards(s);
    if (kind==='yingyuan') { decline(s); return true; }
    if (selector?.visible) {
      if (kind==='baichu') api.choice(s,d=>Number(d.sendData)===1 && /摸/.test(text(d.label)));
      else if (kind==='huaiyuan') {
        if (selfTarget(s)) api.choice(s,d=>Number(d.sendData)===3 && /摸/.test(text(d.label)));
      } else if (kind==='fuzai') api.choice(s,d=>Number(d.sendData)===7 || /无中生有/.test(text(d.label)));
      return true;
    }
    if (kind==='weishu') {
      if (/摸(?:1|一)张牌/.test(plain) && !/弃/.test(plain) && selfTarget(s)) api.button(s,'btnOK');
      return true;
    }
    if (kind==='huaiyuan') { if (selfTarget(s)) api.button(s,'btnOK'); return true; }
    if (kind==='wuniang' && /失去.*体力/.test(plain)) {
      if (isShanhe(s.scene,gc) && Number(nativeSeat(s.self)?.Hp)>2) api.button(s,'btnOK');
      else decline(s);
      return true;
    }
    if (['wusheng','wuniang','miuyan'].includes(kind)) {
      // Follow-up card acquisition/unknown prompts must remain manual.
      if (!(kind==='miuyan' ? /火攻/.test(plain) : /杀|红色.*手牌|红色.*装备/.test(plain))) return true;
      const predicate=kind==='wusheng'?red:kind==='wuniang'?nonBasic:black;
      if (one(s,predicate,kind==='miuyan'?miuyanCard(all):null)) api.button(s,'btnOK');
      return true;
    }
    if (kind==='heji') {
      if (one(s,c=>red(c) && skillId(c)===1)) api.button(s,'btnOK');
      return true;
    }
    if (kind==='longyin') {
      if (!redShaOwnTurn(s,source,currentSeat)) return true;
      if (/弃置/.test(plain)) { if (one(s,()=>true,longyinCard(all))) api.button(s,'btnOK'); }
      else if (/是否.*龙吟/.test(plain)) api.button(s,'btnOK');
      return true;
    }
    if (kind==='fuzai') {
      // Native two-step selector: equipment, then virtual 无中生有. The
      // equipment-skill-card form needs only the virtual card.
      const virtual=list(s.self.cardContainer.virtualCardUis).find(c=>available(c) && skillId(c)===7);
      const skill=context?.Skill;
      if (equip({Card:skill?.SkillCard}) || one(s,equip)) {
        if (virtual && !selected(virtual)) select(virtual);
        if (virtual && selected(virtual)) { selfTarget(s); api.button(s,'btnOK'); }
      }
      return true;
    }
    if (['liegong','shangshi','luoying','pojun'].includes(kind) && /是否|发动/.test(plain)) api.button(s,'btnOK');
    return true;
  }
  return {run};
}
