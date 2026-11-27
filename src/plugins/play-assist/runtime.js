import { createQuandaoDisplay } from './quandao.js';
import { read, field } from '../../shared/info-runtime.js';
import { isNativePokerTable } from '../../shared/poker-table-mode.js';
import { SHANHE_BATTLE_SCENE } from '../../shared/shanhe-scenes.js';
import { EXTRA_IDS, skillKind } from './strategies.js';
import { createExtended, redShaOwnTurn } from './extended.js';
import { createTianshuDisplay } from './tianshu.js';
import { createQuanyuDisplay } from './quanyu.js';
import { createZhuohunDisplay } from './zhuohun.js';
import { createPeixiuDisplay } from './peixiu/index.js';
import { isPeixiuSkill } from './peixiu/native.js';

// Static baseline: 小抄 1.6.75 uO/uE. Conditional judgement skills need 洛神 / 界洛神.
export const SKILL_IDS = Object.freeze([62,769,726,3295,3310,792,3750,3753,295,250,784,445,49,716,101,3269,273,97,3260,102,891,484,3876,...EXTRA_IDS]);
const isWuxie = ui => Number(ui?.Card?.FirstSkillId ?? ui?.Card?.FirstSkill?.ID) === 13;
const QIANGZHI_IDS = [484,3876];
const QIANFU_IDS = [3750,3753];
const SKILL_REPEAT_MS = 510;
export const CONDITIONAL_SKILL_IDS = Object.freeze([48,719,79,883]);
export function supported(item) {
  const id = Number(item?.Skill?.SkillId);
  return SKILL_IDS.includes(id) || CONDITIONAL_SKILL_IDS.includes(id) &&
    Boolean(read(() => item.seat.HasSkill(45)) || read(() => item.seat.HasSkill(875)));
}
const visible = node => {
  if (!node || node.destroyed) return false;
  for (let p = node, i = 0; p && i < 32; p = p.parent, i++) if (p.visible === false || p.destroyed) return false;
  return true;
};
// The accessory fields change between client builds; the native accessor is stable.
const buttonBar = self => read(() => self.getButtonBar()) ||
  [read(() => self.Ai), read(() => self.Pt), read(() => self.buttonBar)]
  .find(bar => Array.isArray(read(() => bar.btns))) || null;
const enabled = node => visible(node) && node._enabled === true && node.disabled !== true;
const list = value => Array.isArray(value) ? value.slice(0, 128) : [];
const seatUIs = (scene, self) => [...new Set([...list(scene.seatContainer?.seatUIs), self].filter(Boolean))];
// Sprite buttons register business handlers on their private dispatcher. The
// Sprite's own click handler is onMouse, not HandleSkillClick.
function nativeClick(node, type = 'click') {
  if (typeof node?.onMouse === 'function') { node.onMouse({type}); return true; }
  if (type === 'click' && typeof node?.onClick === 'function') { node.onClick(); return true; }
  if (typeof node?.event === 'function') { node.event(type, type === 'click' ? node.name : node); return true; }
  return false;
}

export function createRuntime(ctx, getSettings, onChange = () => {}) {
  const quandao = createQuandaoDisplay();
  const tianshu = createTianshuDisplay(ctx), quanyu = createQuanyuDisplay(ctx), zhuohun = createZhuohunDisplay(ctx);
  const peixiu = createPeixiuDisplay(ctx);
  let state = null, disposed = false, proxy = null, proxyCleanup = [], ended = false, currentSeat = null, sourceCard = null, wuxie = null, judgementFlower = null;
  const remembered = new Set(list(ctx.settings.get('rememberedSkillIds', [])).map(Number));
  let locks = new Set(remembered);
  const releases = [], tracked = fn => { const release = ctx.scope.add(fn); releases.push(release); return release; };
  const extended = createExtended(ctx, {button,choice,locked:id=>locks.has(id),hasKind:kind=>EXTRA_IDS.some(id=>locks.has(id) && skillKind(id)===kind)});
  function persist() { ctx.settings.set('rememberedSkillIds', [...remembered]); }
  function gameContext() { return read(() => ctx.game.getClass('GameContext')); }
  function alive(s = state, scene, requireOperation = true) {
    if (disposed || ctx.scope.signal.aborted || !s || s !== state || ended || !visible(s.self)
      || s.self.seat?.IsDead || s.self.seat?.IsAiControl || s.scene.IsViewer === true) return false;
    if ((scene ?? ctx.game.getScene()) !== s.scene || isNativePokerTable(s.scene)) return false;
    const gc = gameContext();
    const inGame = read(() => ctx.game.isInGame()), replay = read(() => ctx.game.isReplay(s.scene));
    const snap = typeof inGame !== 'boolean' || typeof replay !== 'boolean' ? read(() => ctx.game.getSnapshot()) : null;
    // GameContext is closure-local in production builds, not a registered
    // Laya class. Native handlers still enforce its operation restrictions.
    return (inGame ?? snap?.inGame) === true && !(replay ?? snap?.isReplay) && !snap?.pokerTable && gc?.IsViewer !== true &&
      read(() => gc.IsViewerOrReplay()) !== true && (!requireOperation || read(() => gc.CanOperationInGame()) !== false);
  }
  function notify(options) { onChange(options); }
  function toggle(id, remember = false) {
    id = Number(id);
    const options = getSettings();
    if (!options.skillLock || !alive() || !list(state.self.skillItems).some(x => supported(x) && Number(x.Skill?.SkillId) === id)) return false;
    if (remember) { locks.add(id); remembered.add(id); }
    else if (locks.has(id)) { locks.delete(id); remembered.delete(id); }
    else locks.add(id);
    state.priorityAction = null;
    persist(); paint(options); schedule(state, options); notify(options); return true;
  }
  function getSkills() {
    return list(state?.self.skillItems).filter(supported).map(item => ({id:Number(item.Skill.SkillId), name:String(item.Skill.Name || item.Skill.SkillId), locked:locks.has(Number(item.Skill.SkillId)), remembered:remembered.has(Number(item.Skill.SkillId))}));
  }
  function paint(options = getSettings()) {
    for (const [item, binding] of state?.bindings || []) if (binding.label && !binding.label.destroyed) {
      binding.label.text = remembered.has(Number(item.Skill?.SkillId)) ? '记\n住' : '自\n动';
      binding.label.visible = options.skillLock && locks.has(Number(item.Skill?.SkillId));
      binding.label.color = ctx.ui.nativeTheme?.palette?.accent || '#c8ab6a';
      binding.label.bgColor = ctx.ui.nativeTheme?.palette?.bg || '#171b1d';
      // Native skill labels reserve at least 8px on the right. Keep the status
      // in that gutter, away from the skill name and the preceding skill row.
      binding.label.x = Math.max(0, Number(item.width || 0) - binding.label.width - 1);
      binding.label.y = Math.max(1, Math.floor((Number(item.height || 0) - binding.label.height) / 2));
    }
  }
  function later(fn, ms) { return ctx.scope.timeout(() => { if (!disposed) fn(); }, ms); }
  function hasActions(options, scene, priorityOnly = false) {
    const sceneName = scene.SceneName || scene.sceneName || scene.name;
    return options.skillLock && locks.size > 0 || options.fireAttack || options.skipTao || options.skipAssist
      || options.skipWuxie && sceneName === SHANHE_BATTLE_SCENE || !priorityOnly && options.autoConfirm;
  }
  function schedule(s, options) {
    if (s.pending) return;
    if (!hasActions(options ?? getSettings(), s.scene)) return;
    s.pending = true; later(() => { s.pending = false; processActions(s); }, 0);
  }
  function bindSkill(s, item) {
    const events = (item.eventDispatcher || item)._events?.click;
    const clean = [], id = Number(item.Skill.SkillId), owner = {}, handlers = list(Array.isArray(events) ? events : [events]);
    const handler = handlers.find(h => h?.caller === item && typeof h.method === 'function' && h.method !== item.onClick && h.method !== item.onMouse);
    // Laya.off recovers pooled Handler objects and clears their fields.
    const original = handler?.method, originalArgs = handler?.args;
    let timer = null, memoryTimer = null, suppress = false, label = null;
    const cancel = () => { timer?.(); memoryTimer?.(); timer = memoryTimer = null; };
    const down = (event = {}, right = false) => {
      cancel(); suppress = false;
      if (!alive(s) || !getSettings().skillLock) return;
      const mobile = Boolean(event.nativeEvent?.touches || event.touches || ctx.window.Laya?.Browser?.onMobile);
      if (!right && locks.has(id)) { suppress = true; toggle(id); return; }
      const gc = gameContext();
      const shanhe = Boolean(gc?.IsRoguelike1v1 || gc?.IsRogueLike || /Rogue/.test(String(s.scene.SceneName)));
      const valid = () => alive(s) && Number(item.Skill?.SkillId) === id && getSettings().skillLock;
      const handle = setTimeout(() => {
        if (!valid()) return;
        if (right) toggle(id, true); else if (!locks.has(id)) toggle(id);
        suppress = true;
        ctx.notify?.(right ? `已记住 ${item.Skill.Name} 技能辅助，左键点一下取消` :
          `已启用 ${item.Skill.Name} 技能辅助` + (mobile ? '，继续按住可记住' : '，点一下取消'));
      }, shanhe ? 500 : 2000);
      timer = ctx.scope.add(() => clearTimeout(handle));
      if (mobile && !right) {
        const memoryHandle = setTimeout(() => {
          if (!valid()) return;
          toggle(id, true); suppress = true;
          ctx.notify?.(`已记住 ${item.Skill.Name} 技能辅助，点一下取消`);
        }, shanhe ? 3000 : 5000);
        memoryTimer = ctx.scope.add(() => clearTimeout(memoryHandle));
      }
    };
    const wrapped = function(...args) { if (suppress && !s.automatic) { suppress = false; return; } rapid(); const result = original.apply(this, args); rapid(); return result; };
    if (handler && typeof item.on === 'function' && typeof item.off === 'function') {
      item.off('click', item, original); item.on('click', item, wrapped, originalArgs);
      clean.push(() => { item.off('click', item, wrapped); if (!item.destroyed) item.on('click', item, original, originalArgs); });
      for (const [event, fn] of [['mousedown',down],['mouseup',cancel],['mouseout',cancel]]) {
        item.on(event, owner, fn); clean.push(() => item.off(event, owner, fn));
      }
    }
    // SkillItem.on redirects to a private dispatcher; right-button events
    // must also be registered on the Sprite that receives Laya mouse input.
    const rightDown = event => down(event, true);
    const dispatcher = ctx.window.Laya?.EventDispatcher?.prototype;
    const rightTarget = item.eventDispatcher && dispatcher ? dispatcher : item;
    const raw = rightTarget !== item;
    for (const [event, fn] of [['rightmousedown',rightDown],['rightmouseup',cancel],['mouseout',cancel]]) {
      if (raw) {
        rightTarget.on.call(item,event,owner,fn);
        clean.push(() => rightTarget.off.call(item,event,owner,fn));
      } else if (typeof item.on === 'function' && typeof item.off === 'function') {
        item.on(event,owner,fn); clean.push(() => item.off(event,owner,fn));
      }
    }
    const Laya = ctx.window.Laya;
    if (typeof Laya?.Text === 'function' && typeof item.addChild === 'function') {
      label = new Laya.Text(); label.name = 'sgs-play-assist-lock'; label.text = '自\n动';
      label.fontSize = 7; label.leading = 1; label.font = 'Microsoft YaHei'; label.mouseEnabled = false;
      label.align = 'center'; label.valign = 'middle'; label.zOrder = 1;
      label.width = 7; label.height = 17;
      item.addChild(label); clean.push(() => { if (!label.destroyed) label.destroy(true); });
    }
    let rapidRestore = null, rapidTarget = null;
    const rapid = (enabled = getSettings().rapid) => {
      const auto = item.autoReset;
      if (rapidRestore && auto !== rapidTarget) { rapidRestore(); rapidRestore = null; rapidTarget = null; }
      if (enabled && auto && !rapidRestore) {
        const own = Object.getOwnPropertyDescriptor(auto, 'Value');
        if (!own || own.configurable) {
          const descriptor = { configurable:true, get:() => false, set:() => {} };
          Object.defineProperty(auto, 'Value', descriptor);
          rapidTarget = auto;
          rapidRestore = () => { const now = Object.getOwnPropertyDescriptor(auto,'Value'); if (now?.get === descriptor.get) { if (own) Object.defineProperty(auto,'Value',own); else delete auto.Value; } };
        }
      } else if (!enabled && rapidRestore) { rapidRestore(); rapidRestore = null; rapidTarget = null; }
    };
    return {id, label, rapid, dispose:ctx.scope.add(() => { cancel(); rapidRestore?.(); clean.reverse().forEach(fn => fn()); })};
  }
  function clear() {
    quandao.clear();
    tianshu.clear(); quanyu.clear(); zhuohun.clear(); peixiu.clear();
    if (!state) return;
    for (const b of state.bindings.values()) b.dispose();
    state.barClean?.forEach(fn => fn());
    state.clean.reverse().forEach(fn => fn()); state = null;
    locks = new Set(remembered);
    notify();
  }
  function resetRound() { currentSeat = null; sourceCard = null; wuxie = null; judgementFlower = null; }
  function bind(scene, self) {
    clear(); const s = state = {scene,self,seat:self.seat,bindings:new Map(),clean:[],bar:0,selector:0,submittedBar:-1,submittedSelector:-1,lastSkill:0,pending:false};
    const patch = (target,key,fn) => { if (typeof target?.[key] === 'function') s.clean.push(ctx.scope.patch(target,key,original => function(...args) { const result = original.apply(this,args); fn(...args); schedule(s); return result; })); };
    syncBar(s);
    patch(self.spellSelector,'Show',() => s.selector++); patch(self.spellSelector,'UpdateBtnState',() => {});
    patch(self,'StartSelectSkillItem',(_trigger, skill) => { s.askedSkillId = Number(skill?.SkillId ?? skill?.ID); });
    if (ctx.ui.nativeTheme?.watch) s.clean.push(ctx.ui.nativeTheme.watch(() => paint()));
  }
  function syncBar(s) {
    const bar = buttonBar(s.self);
    if (s.barNode === bar) return;
    s.barClean?.forEach(fn => fn());
    s.barNode = bar; s.bar++; s.barClean = [];
    for (const key of ['Show','Update']) if (typeof bar?.[key] === 'function') {
      s.barClean.push(ctx.scope.patch(bar,key,original => function(...args) {
        const result = original.apply(this,args);
        if (key === 'Show') s.bar++;
        schedule(s); return result;
      }));
    }
  }
  function button(s,name) {
    const bar = buttonBar(s.self), btn = list(bar?.btns).find(b => b.name === name);
    if (!alive(s) || !visible(bar) || s.submittedBar === s.bar || !enabled(btn)) return false;
    const hasBarHandler = typeof bar.Button_Click === 'function';
    if (!hasBarHandler && !['onMouse','onClick','event'].some(key => typeof btn[key] === 'function')) return false;
    s.submittedBar = s.bar;
    if (!hasBarHandler) return nativeClick(btn);
    bar.Button_Click(btn);
    return true;
  }
  function choice(s,predicate) {
    const selector = s.self.spellSelector;
    if (!alive(s) || !visible(selector) || s.submittedSelector === s.selector) return false;
    const btn = list(selector.btnList).find(b => enabled(b) && predicate(b.data || b.Data || {},b));
    if (!btn || typeof selector.btnClick !== 'function') return false;
    s.submittedSelector = s.selector; selector.btnClick(btn); return true;
  }
  function cancel(s) { return s.self.spellSelector?.visible ? choice(s,d => Number(d.sendData) === 255 || Number(d.sendData) === 0 && !d.callBack) : button(s,'btnCancel'); }
  function chooseCard(s, predicate = () => true, preferWuxie = false) {
    const cards = list(s.self.cardContainer?.cardUis), selected = cards.find(c => c.selected && predicate(c));
    if (selected) return true;
    const pool = cards.filter(c => c.activated && !c.destroyed && predicate(c));
    const card = (preferWuxie && pool.find(isWuxie)) || pool[0];
    if (!card || typeof card.setSelected !== 'function') return false;
    card.setSelected(true); return true;
  }
  function clickSkill(s,item, rapid) {
    if (!item.activated || item.Selected || !visible(item) || !rapid && Date.now() - s.lastSkill < SKILL_REPEAT_MS || !alive(s)) return false;
    s.lastSkill = Date.now(); s.automatic = true;
    try { return nativeClick(item); }
    finally { s.automatic = false; }
  }
  function declineQianfuFollowup(s, context, options) {
    if (!options.skillLock || !QIANFU_IDS.some(id => locks.has(id))) return false;
    const self = s.self, selector = self.spellSelector;
    const plain = value => String(value || '').replace(/<[^>]*>/g,'').replace(/\s/g,'');
    const texts = [context?.message, buttonBar(self)?.txtOptMsg?._innerHTML,
      selector?.visible ? selector.txtOptMsg?._innerHTML : ''].map(plain);
    const ids = [context?.Skill?.SkillId, context?.SpecifySkillId,
      s.scene.seatContainer?.selectContext?.Skill?.SkillId,
      selector?.visible ? selector.spell?.SkillId : 0].map(Number);
    const triggerId = data => Number(data.callBackParams?.[0]?.FirstTriggerParam?.SpellId ?? data.callBackParams?.[0]?.TriggerSpellData?.[0]?.SpellId);
    const forbidden = id => QIANFU_IDS.includes(id) || id === 3751;
    const triggerPrompt = selector?.visible && list(selector.btnList).some(b => forbidden(triggerId(b.data || b.Data || {})));
    const optional = ids.includes(3751) || texts.some(t => /是否.*(?:弃置.*牌.*(?:置于|放.*)牌堆顶|发动[“「]?迁附)/.test(t));
    if (!triggerPrompt && !optional) return false;
    if (selector?.visible) {
      // Other locked skills may still be chosen from a mixed trigger list.
      if (triggerPrompt && choice(s,d => !forbidden(triggerId(d)) && locks.has(triggerId(d)))) return true;
      // Seat_TriggerSpellMulti builds Cancel with a callback whose first
      // argument is null. It has no sendData; do not invoke a skill callback.
      choice(s,d => typeof d.callBack === 'function' && Array.isArray(d.callBackParams) &&
        d.callBackParams[0] === null && plain(d.label) === '取消' ||
        !d.callBack && [0,255].includes(Number(d.sendData)));
    } else button(s,'btnCancel');
    // A missing/disabled Cancel must keep this prompt manual, never fall
    // through to conversion confirmation, generic skill activation or OK.
    return true;
  }
  function lockedAction(s, context, message, gc, options) {
    if (!options.skillLock || !locks.size) return false;
    const self = s.self, selector = self.spellSelector, cards = list(self.cardContainer?.cardUis);
    if (selector?.visible) {
      if (choice(s,d => { const id = Number(d.callBackParams?.[0]?.FirstTriggerParam?.SpellId ?? d.callBackParams?.[0]?.TriggerSpellData?.[0]?.SpellId); return !QIANGZHI_IDS.includes(id) && locks.has(id); })) return true;
      const id = Number(selector.spell?.SkillId);
      if (locks.has(id)) {
        if (id === 295) {
          const hp = self.seat?.Hp;
          if (hp == null || hp === '' || !Number.isFinite(Number(hp))) return false;
          return choice(s,d => Number(d.sendData) === (Number(hp) < 1 ? 1 : 2));
        }
        if (id === 250 && currentSeat !== null) return choice(s,d => d.label === (currentSeat === Number(self.seat?.Index) ? '令其摸两张牌' : '摸一张牌'));
        if (id === 784) return choice(s,d => d.label === (String(selector.txtOptMsg?._innerHTML).includes('(您)') ? '选项二' : '选项一'));
      }
      return false;
    }
    const targets = s.scene.seatContainer?.selectContext;
    const targetSkill = Number(targets?.Skill?.SkillId);
    const id = Number(context?.Skill?.SkillId);
    // Target removal is a separate step from selecting the conversion cards.
    // Require an explicit user target selection, even if native OK allows zero.
    const removalPrompt = /请选择一名角色[，,]令其不成为万箭齐发的目标/.test(message.replace(/\s/g,''));
    const removalSkill = [id, targetSkill].some(skill => [102,891].includes(skill) && locks.has(skill));
    if ((removalSkill && /取消/.test(message) && /目标/.test(message)) ||
        (removalPrompt && [102,891].some(skill => locks.has(skill)))) {
      const selected = list(s.scene.seatContainer?.seatUIs).filter(x => x.seat?.Selected).length;
      if (selected < Math.max(1, Number(targets?.SelectCountMin || 0))) return true;
      button(s,'btnOK');
      return true;
    }
    if (locks.has(id)) {
      if (QIANFU_IDS.includes(id)) {
        // The native selector filters by current yin/yang state, card colour,
        // equipment restrictions and target legality. Select exactly one card;
        // keep target choice manual, and confirm only when native OK is enabled.
        if (!/请选择一张(?:黑|红)色牌，当(?:过河拆桥|火攻)使用/.test(message)) return false;
        if (cards.filter(c => c.selected).length > 1) return false;
        return chooseCard(s, () => true, true) && button(s,'btnOK');
      }
      if ([102,891].includes(id)) {
        const selected = cards.filter(c => c.selected), suit = selected[0]?.Card?.FlowerOnSeat;
        if (selected.length > 2 || selected.some(c => c.Card?.FlowerOnSeat !== suit)) return false;
        const pool = cards.filter(c => c.activated && Number(c.Card?.FlowerOnSeat) > 0).sort((a,b) => Number(isWuxie(b))-Number(isWuxie(a)));
        const flower = suit ?? pool.find(c => pool.filter(x => x.Card.FlowerOnSeat === c.Card.FlowerOnSeat).length >= 2)?.Card.FlowerOnSeat;
        for (const c of pool) if (cards.filter(x => x.selected).length < 2 && !c.selected && c.Card.FlowerOnSeat === flower) c.setSelected(true);
        return cards.filter(c => c.selected && c.Card?.FlowerOnSeat === flower).length === 2 && button(s,'btnOK');
      }
      if ([101,3269,97,3260].includes(id)) return chooseCard(s, () => true, true) && button(s,'btnOK');
      if ([49,445].includes(id)) {
        if (message === '请选择一张要展示的手牌') return chooseCard(s) && button(s,'btnOK');
        if (message.includes('(您)')) return button(s,'btnCancel');
      }
      if (id === 716 && message === '请选择至多1名角色为目标，使其各摸一张牌') return button(s,'btnOK');
      if (id === 273) {
        const seats = list(s.scene.seatContainer?.seatUIs), active = seats.filter(x => x.Activated), target = seats[0]?.Activated ? seats[0] : active.length === 1 ? active[0] : null;
        if (target && !target.seat?.Selected) nativeClick(target,'SELECTE');
        return target ? button(s,'btnOK') : false;
      }
      // Judgement substitution requires the current judgement card. Never guess it from a stale hand.
      if (CONDITIONAL_SKILL_IDS.includes(id) && /鬼才|鬼道/.test(message)) {
        const judgement = judgementFlower;
        if ([3,4].includes(judgement)) return button(s,'btnCancel');
        if (![1,2].includes(judgement)) return false;
        if (!chooseCard(s,c => ![48,719].includes(id) || [3,4].includes(Number(c.Card?.FlowerOnSeat)))) return false;
        return button(s,'btnOK');
      }
    }
    for (const item of list(self.skillItems).filter(x => supported(x) && locks.has(Number(x.Skill?.SkillId)))) {
      if (QIANGZHI_IDS.includes(Number(item.Skill.SkillId))) continue;
      const kind=skillKind(Number(item.Skill.SkillId));
      if (kind==='yingyuan' || kind==='weishu' || kind==='longyin' && !redShaOwnTurn(s,sourceCard,currentSeat)) continue;
      if (Number(item.Skill.SkillId) === 62 && Number(self.seat?.Hp) <= 1) {
        const usableHeal = Number(self.seat?.Hp) === 1 && !self.seat.CannotUseCardBySeatState && list(self.seat.HandCards).some(c =>
          [3,82].includes(Number(c.FirstSkillId)) && !list(self.seat.CantUseCardIds).includes(c.CardId) &&
          read(() => self.seat.IsNotAllowByXiaHui(c)) === false && read(() => self.seat.checkOperateType(2,256,c)) === true && !(Number(c.FirstSkillId) === 3 && c.FirstSkill?.IsNotAllowTaoByFuTaiBoss));
        if (!usableHeal) continue;
      }
      if (message === '是否发动' + item.Skill.Name && button(s,'btnOK')) return true;
      if (clickSkill(s,item,options.rapid)) return true;
    }
    return false;
  }
  function processActions(s, priorityOnly = false) {
    if (!s || s !== state || disposed || ended || ctx.scope.signal.aborted) return false;
    const options = getSettings();
    if (!hasActions(options, s.scene, priorityOnly) || !alive(s)) return false;
    const hand = s.self.cardContainer;
    const context = hand?.selectCardContext ?? hand?.SelectContext;
    const { bar, selector, priorityAction } = s;
    if (priorityOnly && priorityAction && priorityAction.context === context && priorityAction.bar === bar &&
        priorityAction.selector === selector && Date.now() < priorityAction.until) return true;
    if (!run(s, context, priorityOnly, options)) return false;
    // A skill can send an action before the client replaces the ordinary prompt.
    s.priorityAction = { context, bar, selector, until: Date.now() + SKILL_REPEAT_MS };
    return true;
  }
  function run(s, context, priorityOnly, opt) {
    const self = s.self, gc = gameContext();
    const barMessage = buttonBar(self)?.txtOptMsg?._innerHTML;
    const message = String(context?.message || context?.Message || barMessage || '').replace(/<[^>]*>/g,'');
    const specify = Number(context?.SpecifySkillId), skill = Number(context?.Skill?.SkillId), selection = self.spellSelector?.visible ? Number(self.spellSelector.spell?.SkillId) : 0;
    if ([specify, skill, context?.Skill?.ID, selection].some(isPeixiuSkill)) return false;
    // Both native versions share the draw response. Keep target/show-hand
    // selection manual, including when generic auto-confirm is enabled.
    if (opt.skillLock && QIANGZHI_IDS.some(id => locks.has(id))) {
      const selector = self.spellSelector;
      const prompt = String(selector?.visible ? selector.txtOptMsg?._innerHTML || '' : message).replace(/<[^>]*>/g,'').replace(/\s/g,'');
      const involved = [specify,skill,selection,Number(s.scene.seatContainer?.selectContext?.Skill?.SkillId)].some(id => QIANGZHI_IDS.includes(id) && locks.has(id));
      if (selector?.visible && QIANGZHI_IDS.includes(selection) && locks.has(selection)) {
        if (prompt === '是否摸一张牌') choice(s,d => !d.callBack && Number(d.sendData) === 1);
        return true;
      }
      if (!selector?.visible && prompt === '是否发动强识，摸一张牌') return button(s,'btnOK');
      if (involved || /强识/.test(prompt)) return true;
    }
    if (declineQianfuFollowup(s,context,opt)) return true;
    // The card context can outlive its prompt. These skills need the current bar text first.
    if (opt.skillLock && locks.size && extended.run(s,context,barMessage || message,sourceCard,currentSeat,gc)) return true;
    if (opt.skillLock && locks.has(62) && Number(self.seat?.Hp) <= 0 && specify === 3 && Number(gc?.NextSpellTargets?.[0]) === Number(self.seat?.Index)) {
      if (!self.spellSelector?.visible && chooseCard(s,c => [3,82].includes(Number(c.Card?.FirstSkillId)))) button(s,'btnOK');
      return true;
    }
    if ([specify,skill,selection].includes(13)) {
      const sceneName = s.scene.SceneName || s.scene.sceneName || s.scene.name;
      if (!opt.skipWuxie || sceneName !== SHANHE_BATTLE_SCENE) return;
      const mine = Number(self.seat.Index), inquiry = wuxie;
      const ownTurn = currentSeat === null ? read(() => self.seat.InOwnRound2) === true : currentSeat === mine;
      if (ownTurn && inquiry && [mine, 250, 255].includes(inquiry.recipient) && cancel(s)) {
        if (wuxie === inquiry) wuxie = null;
        return true;
      }
      return;
    }
    const asking = list(s.scene.seatContainer?.seatUIs).filter(x => x.seat?.IsAskingTao);
    const target = Number(gc?.NextSpellTargets?.[0] ?? (asking.length === 1 ? asking[0].seat.Index : NaN));
    if (specify === 3 && opt.skipTao && Number.isInteger(target) && target >= 0 && target < 255 && target !== Number(self.seat?.Index)) return cancel(s);
    if (opt.skipAssist && list(buttonBar(self)?.btns).some(b => b.name === 'btnOK' && String(b.label).replace(/\s/g,'') === '助战')) return cancel(s);
    if (opt.fireAttack && Number(self.seat?.LastAttackByTheSkill?.ID) === 83 && (message.includes('请选择一张卡牌用于展示') || message.includes('色的手牌，对'))) {
      if (read(() => self.seat.HasSkill(3744)) && message.includes('色的手牌，对')) {
        const convert = list(self.skillItems).find(x => Number(x.Skill?.SkillId) === 3744);
        if (convert && !convert.Selected && convert.activated) {
          // Native skill selection is synchronous; retain its own legal-card filtering.
          s.automatic = true; try { nativeClick(convert); } finally { s.automatic = false; }
          if (!chooseCard(s) && convert.Selected) { s.automatic = true; try { nativeClick(convert); } finally { s.automatic = false; } }
        }
      }
      chooseCard(s); if (!button(s,'btnOK')) button(s,'btnCancel'); return true;
    }
    if (lockedAction(s,context,message,gc,opt)) return true;
    if (priorityOnly || !opt.autoConfirm || self.spellSelector?.visible || !message || /手气卡|更换手牌|替换现有的手牌|连环|业炎/.test(message)) return;
    const targets = s.scene.seatContainer?.selectContext;
    if (skill === 85 || Number(targets?.Skill?.SkillId) === 85 || Number(context?.SelectCountMax) > 1) return;
    const cards = list(self.cardContainer?.cardUis), seats = list(s.scene.seatContainer?.seatUIs);
    // This option confirms an explicit completed user selection, never chooses targets or optional prompts.
    const selectedCards = cards.filter(c => c.selected).length, selectedTargets = seats.filter(x => x.seat?.Selected).length;
    if (!selectedCards && !selectedTargets) return;
    if (selectedCards < Number(context?.SelectCountMin || 0) || selectedTargets < Number(targets?.SelectCountMin || 0)) return;
    button(s,'btnOK');
  }
  function observe() {
    const next = read(() => ctx.game.getServerProxy()); if (next === proxy) return;
    proxyCleanup.forEach(fn => fn()); proxyCleanup = []; proxy = next;
    resetRound();
    quanyu.clear(); zhuohun.clear();
    if (typeof proxy?.on !== 'function' || typeof proxy?.off !== 'function') return;
    const owner = {}, bind = (event,fn) => { proxy.on(event,owner,fn); const p = proxy; proxyCleanup.push(ctx.scope.add(() => p.off(event,owner,fn))); };
    bind('MsgGameOver',() => { ended = true; resetRound(); clear(); notify(); });
    bind('MsgGameRoundNtf',packet => { if (field(packet,'isPassed')) { ended = true; resetRound(); clear(); } });
    bind('ClientLeavetableRep',() => { ended = true; resetRound(); clear(); notify(); });
    bind('MsgGamePlayCardNtf',() => { if (ended) resetRound(); ended = false; });
    bind('MsgReconnectGame',() => { quanyu.clear(); zhuohun.clear(); });
    bind('MsgGameTurnNtf',packet => {
      const id = Number(field(packet,'SeatID'));
      currentSeat = Number.isInteger(id) && id >= 0 && id < 255 ? id : null;
      if (state) zhuohun.startTurn(seatUIs(state.scene, state.self), currentSeat, field(packet, 'TurnCnt'), !!field(packet, 'IsResume'));
      wuxie = null;
    });
    bind('GsCGamephaseNtf',packet => {
      const seat = Number(field(packet,'SeatID'));
      if (Number.isInteger(seat) && seat >= 0 && seat < 255) currentSeat = seat;
      if (state && field(packet, 'Round') === 0) zhuohun.startTurn(seatUIs(state.scene, state.self), seat);
      wuxie = null;
    });
    bind('GsCUpdateRoleDataExNtf', packet => { if (state) quanyu.observe(packet); });
    bind('GsCUpdateHpNtf', packet => {
      if (state) zhuohun.observe(packet, state.self, seatUIs(state.scene, state.self));
    });
    bind('GsCTriggerSpellEnq',() => { wuxie = null; });
    bind('PubGsCUseCard',packet => {
      wuxie = null;
      const id = Number(field(packet,'CardID')), meta = read(() => ctx.game.getCardMeta(id));
      const rawSpell=Number(field(packet,'spellID') ?? field(packet,'SpellID') ?? field(packet,'spellId'));
      // Native PubGsCUseCard uses lowercase spellID. A normal, unconverted
      // physical card may use zero; recover only an explicitly known Sha.
      const spell=rawSpell === 0 && (meta?.name === '杀' || meta?.cardClass === 'Sha') ? 1 : rawSpell;
      sourceCard = {seat:Number(field(packet,'SeatID')),spell,suit:Number(meta?.suit),
        castId:rawSpell,redMaterials:[1,2].includes(Number(meta?.suit)),mayBeSha:spell===1 || read(()=>field(packet,'Spell').IsThis(1))===true};
    });
    bind('PubGsCUseSpell',packet => {
      wuxie = null;
      const ids=field(packet,'CardIDs');
      if (!Array.isArray(ids) || !ids.length || ids.length>128) return;
      const metas=ids.map(id=>read(()=>ctx.game.getCardMeta(Number(id))));
      const spell=Number(field(packet,'SpellID') ?? field(packet,'spellID'));
      const native=field(packet,'Spell');
      sourceCard={seat:Number(field(packet,'SeatID')),spell,castId:spell,
        suit:metas.length===1 ? Number(metas[0]?.suit) : metas.every(m=>[1,2].includes(Number(m?.suit))) ? 1 : NaN,
        redMaterials:metas.every(m=>[1,2].includes(Number(m?.suit))),
        mayBeSha:spell===1 || read(()=>native.IsThis(1))===true};
    });
    bind('GsCTriggerSpellNew',packet => {
      const data = list(field(packet,'TriggerSpellData'));
      const first = field(packet,'FirstTriggerParam');
      const trigger = first || data[0];
      const spell = Number(field(packet,'SrcSpellID'));
      // The first parameter is the number of nullifications already played
      // against this trick. Later asks can still name the original trick.
      wuxie = Number(trigger?.SpellId) === 13 && trigger.Datas?.[0] === 0 && spell !== 13
        ? {recipient:Number(field(packet,'TriggerSeatId'))} : null;
      const triggers=[first,...data].filter(Boolean);
      // A native 龙吟 inquiry proves the resulting card is Sha. Bind that
      // proof to the source caster/skill and known red materials, rather than
      // maintaining a whitelist of conversion skills or calling a red 闪 Sha.
      if (sourceCard?.redMaterials && Number(field(packet,'SrcSpellCasterSeat'))===sourceCard.seat &&
        triggers.some(t=>[446,21003].includes(Number(t.SpellId))) &&
        (spell===sourceCard.castId || spell===1 && sourceCard.mayBeSha)) sourceCard.spell=1;
    });
    // Old journal zone 3 / owner 255 is the public judgement processing area.
    bind('PubGsCMoveCard',packet => {
      if (Number(field(packet,'FromZone')) === 3 && Number(field(packet,'FromID')) === 255) judgementFlower = null;
      if (Number(field(packet,'ToZone')) !== 3 || Number(field(packet,'ToID')) !== 255) return;
      const ids = field(packet,'CardIDs');
      const meta = Array.isArray(ids) && ids.length === 1 ? read(() => ctx.game.getCardMeta(Number(ids[0]))) : null;
      const flower = Number(meta?.suit); judgementFlower = [1,2,3,4].includes(flower) ? flower : null;
    });
    bind('ClientLoginRep',() => { clear(); resetRound(); locks = new Set(remembered); ended = true; notify(); });
  }
  function syncState() {
    observe();
    const scene = ctx.game.getScene(), self = scene?.SelfSeatUi;
    if (state && (state.scene !== scene || state.self !== self || state.seat !== self?.seat)) { clear(); ended = false; resetRound(); }
    if (isNativePokerTable(scene) || !self?.seat || !self.cardContainer) { clear(); resetRound(); return; }
    if (!state && !ended) bind(scene,self);
    if (state) syncBar(state);
    return { scene, self };
  }
  function refresh() {
    if (disposed || ctx.scope.signal.aborted) return;
    try {
      const currentState = syncState();
      if (!currentState) return;
      const { scene, self } = currentState;
      const s = state, live = alive(s, scene);
      const options = getSettings();
      // Pause/temporary operation restrictions suspend execution, not this round's configuration.
      quandao.update(self, Boolean(options.quandaoCount) && live);
      tianshu.update(scene, self, Boolean(options.tianshuAssist) && live);
      peixiu.update(scene, !ended && Boolean(options.peixiuAssist));
      const showQuanyu = options.quanyuAssist && (live || alive(s, scene, false));
      const showZhuohun = options.zhuohunAssist && live;
      if (showQuanyu || showZhuohun) {
        const seats = seatUIs(scene, self);
        if (showQuanyu) quanyu.update(scene, seats, live); else quanyu.hide();
        zhuohun.update(self, seats, showZhuohun);
      } else { quanyu.hide(); zhuohun.hide(); }
      if (!live || state !== s || ended || disposed || ctx.scope.signal.aborted) return;
      const current = new Set(list(self.skillItems).filter(item => !item.destroyed && (supported(item) || options.rapid)));
      for (const [item,b] of s.bindings) if (!current.has(item) || Number(item.Skill?.SkillId) !== b.id) { b.dispose(); s.bindings.delete(item); }
      for (const item of current) {
        if (!s.bindings.has(item)) s.bindings.set(item,bindSkill(s,item));
        s.bindings.get(item).rapid(options.rapid === true);
      }
      paint(options); schedule(s, options); notify(options);
    } catch (error) { clear(); ctx.reportError?.(error); }
  }
  function tick() {
    if (typeof ctx.game.withSceneCycle === 'function') ctx.game.withSceneCycle(refresh);
    else refresh();
  }
  function dispose() { if (disposed) return; disposed = true; clear(); proxyCleanup.forEach(fn => fn()); releases.splice(0).reverse().forEach(fn => fn()); }
  tracked(dispose);
  if (ctx.playActions) releases.push(ctx.playActions.registerPriority((scene, self) => {
    syncState();
    if (state?.scene !== scene || state?.self !== self) return false;
    return processActions(state, true);
  }));
  const interval = setInterval(tick,160); tracked(() => clearInterval(interval)); tick();
  return {getSkills,toggle,tick,dispose};
}
