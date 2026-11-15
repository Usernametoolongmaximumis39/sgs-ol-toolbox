// Independent adapter. Paths and method signatures were checked against the
// local official sgsGame_a.sgs and the read-only Xiaochao 1.6.75 reference.
// Effect animations still run: HitTrigger, EndTrigger and STOPPED keep their
// native timing. Only the dedicated visual node is made transparent.
import { createExtendedEffects } from './extended.js';

export const OPTIONS = Object.freeze([
  ['selection', '选中特效', '选中目标时的官阶光效'],
  ['sha', '杀特效', '杀的命中动画'], ['shan', '闪特效', '闪的动画'],
  ['trick', '锦囊特效', '已识别的锦囊播放动画'], ['equip', '装备特效', '已识别的装备发动动画'],
  ['shake', '受击特效', '角色受击及场景震动'], ['heal', '回血特效', '桃与回血动画'],
  ['kill', '击杀特效', '击杀、连杀与高伤害动画'], ['skill', '武将特效', '武将技能与专用转场'],
  ['selfSkin', '己方动效', '自己皮肤的攻击、互动、技能动画'],
  ['otherSkin', '他人动效', '他人皮肤的攻击、互动、技能动画'],
  ['tianshu', '老仙动画', '其他玩家南华老仙书写天书的动画'],
  ['ad', '开屏广告', '进入游戏时的活动广告'], ['version', '版本公告', '游戏版本公告弹窗'],
  ['banner', '首页横幅', '首页轮播广告'], ['notice', '狗托弹幕', '顶部系统及活动滚动广播'],
  ['redDot', '任务红点', '任务、活动及更多菜单红点'],
  ['slogan', '势力口号', '开局自动发送的已知势力口号'],
  ['emotion', '动画表情', '其他玩家的动画表情'], ['rogue', '山河过场', '新地图开场对白与关底首领动画'],
  ['entrance', '玩家进房', '玩家进房时的入座动画'], ['result', '局后结算', '跳过局后结算与 MVP 展示'],
  ['package', '开包动画', '跳过武将、皮肤等开包结果弹窗'], ['prob', '出货动画', '跳过祈愿、抽奖等获得展示'],
  ['download', '下载入口', '隐藏左下角移动端下载入口'],
]);
export const OTHER_OPTIONS = Object.freeze([
  ['ads', '狗卡广告', '首页横幅、版本公告、下载入口、狗托弹幕与开屏广告', ['banner', 'version', 'download', 'notice', 'ad']],
  ['redDot', '任务红点', '任务、活动及更多菜单红点', ['redDot']],
  ['room', '进房特效', '势力口号与玩家进房动画', ['slogan', 'entrance']],
  ['emotion', '动画表情', '其他玩家的动画表情', ['emotion']],
  ['draw', '出货动画', '开包、祈愿、抽奖等获得展示', ['package', 'prob']],
  ['transition', '过场结算', '山河过场与局后结算、MVP展示', ['rogue', 'result']],
]);
export const OPTION_GROUPS = Object.freeze([
  { title: '对局特效', keys: ['selection', 'sha', 'shan', 'trick', 'equip', 'shake', 'heal', 'kill', 'skill', 'selfSkin', 'otherSkin', 'tianshu'] },
  { title: '其他屏蔽', keys: OTHER_OPTIONS.map(([key]) => key) },
]);
// Each level adds a complete group; manually selected combinations stay intact
// until the user moves the slider. Existing per-option settings remain canonical.
export const EFFECT_LEVELS = Object.freeze([
  { name: '无屏蔽', keys: [] },
  { name: '老仙', keys: ['tianshu'] },
  { name: '皮肤', keys: ['tianshu', 'selfSkin', 'otherSkin'] },
  { name: '选中 / 震动 / 击杀', keys: ['selection', 'tianshu', 'selfSkin', 'otherSkin', 'shake', 'kill'] },
  { name: '武将', keys: ['selection', 'tianshu', 'selfSkin', 'otherSkin', 'shake', 'kill', 'skill'] },
  { name: '全部', keys: OPTION_GROUPS[0].keys },
]);
const VISUAL_KEYS = ['sha', 'shan', 'trick', 'equip', 'heal', 'skill', 'selection'];
const TRICK_NAMES = new Set(['nanman', 'nanmanhit', 'wanjianqifa', 'wanjianqifa2', 'wanjianqifaScene', 'wanjianqifaHandCard',
  'wanjianqifaHit', 'wanjianqifaDodge', 'zjzb', 'yydl', 'chuqibuyi', 'hongyundangtou', 'younantongdang',
  'quanjiu', 'liangleichadao', 'wutianwujie', 'lgzw', 'ssyg', 'ljxs', 'xdqx', 'nswh']);
const NOTICE_EVENTS = ['CHAT_MARQUEE_ADD', 'CHAT_MARQUEE2023_ADD', 'CHAT_MARQUEE2023_ACT_ADD'];
const CONTROLLER_METHODS = ['ShowEffectByData', 'ShowEffectByDataWithJson', 'ShowMulitEffectByData'];
const read = fn => { try { return fn(); } catch { return undefined; } };
const alive = item => item && (typeof item === 'object' || typeof item === 'function') && read(() => item.destroyed) !== true;

export function classifyEffect(data, name = '') {
  let path = typeof data === 'string' ? data : read(() => data.EffectPath) || '';
  path = String(path).split(/[?#]/)[0].replace(/^.*\/animate\/game\/(?:neweffect|effect)\//, '').replace(/\.sk$/, '');
  if (/^(?:tiesuo0[1-5](?:Back|[HLB])?|jiu(?:0[12]|2)?|FX_PaiJu_card_fengyao)$/.test(name)
      || /^(?:EFF_jiu|EFF_hejiu)$/.test(path) || path === 'SkillEffect/FX_PaiJu_card_fengyao'
      || /(?:EF_Plot_tiesuo|Plot_tiesuolianhuan)/.test(path)) return '';
  if (path.startsWith('EF_Basic_Sha_')) return 'sha';
  if (path === 'EFF_shan') return 'shan';
  if (path === 'EFF_tao' || path.startsWith('OtherEffect/FX_MatchGame_huixie_')
      || /^(?:xuanhujishi|xinglinchunman|miaoshouhuichun)$/.test(path)) return 'heal';
  if (path.startsWith('EF_Equip_')) return 'equip';
  if (path.startsWith('SkillEffect/')) return 'skill';
  if (path === 'Ol_guanjiexuanze') return 'selection';
  if (TRICK_NAMES.has(name) || /^(?:EF_Plot_|Plot_|EF_NanManRuQin|EFF_NanManRuQing)/.test(path)) return 'trick';
  return '';
}

// Native dictionaries use _objDatum/datum/_maps; inspect only these fields.
function items(value, limit = 128) {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, limit);
  if (value instanceof Map) { const result = []; for (const item of value.values()) { result.push(item); if (result.length >= limit) break; } return result; }
  // SNt always has _objDatum, even when all entries use numeric/string keys
  // in _maps. An empty object-key array must not hide the other namespace.
  const result = [], seen = new Set();
  const add = item => { if (result.length < limit && !seen.has(item)) { seen.add(item); result.push(item); } };
  const map = read(() => value._maps);
  if (map && typeof map === 'object') {
    for (const key in map) { if (Object.hasOwn(map, key)) add(read(() => map[key])); if (result.length >= limit) break; }
  }
  const objects = read(() => value._objDatum);
  if (Array.isArray(objects)) for (let index = 0; index < objects.length && result.length < limit; index++) add(read(() => objects[index]));
  // Avoid the native datum getter's unbounded concatenation when backing
  // fields exist. Retain support for wrappers exposing only datum.
  if (!map && !Array.isArray(objects)) {
    const datum = read(() => value.datum);
    if (Array.isArray(datum)) for (let index = 0; index < datum.length && result.length < limit; index++) add(read(() => datum[index]));
  }
  return result;
}
function propertyOwner(target, key) {
  for (let node = target, depth = 0; node && depth < 12; node = Object.getPrototypeOf(node), depth++) {
    if (Object.hasOwn(node, key)) return node;
  }
  return null;
}

export function createEffectController(ctx, changed = () => {}) {
  const flags = Object.fromEntries(OPTIONS.map(([key]) => [key, ctx.settings.get(key, false) === true]));
  const patches = new Map(), masks = new Map(), counts = Object.fromEntries(OPTIONS.map(([key]) => [key, 0]));
  let closed = false, checking = false, warning = '', available = new Set(), currentScene = null;
  const enabled = key => !closed && flags[key] === true;
  const warn = error => { warning = String(error?.message || error).slice(0, 180); };
  function nativeWrite(node, record, value) {
    if (!record.descriptor?.set) return;
    record.writing = true;
    try { Reflect.apply(record.descriptor.set, node, [value]); }
    finally { record.writing = false; }
  }

  function unmask(node) {
    const record = masks.get(node); if (!record) return;
    masks.delete(node); record.active = false;
    try {
      const now = Object.getOwnPropertyDescriptor(node, record.property);
      if (now?.get !== record.get || now?.set !== record.set) {
        // A later owner can wrap our accessor. Leave that descriptor intact;
        // turn our layer inert and restore the native rendering value.
        if (alive(node)) nativeWrite(node, record, record.requested);
        return;
      }
      if (record.own) Object.defineProperty(node, record.property, 'value' in record.own ? { ...record.own, value: record.requested } : record.own);
      else delete node[record.property];
      if (alive(node)) {
        if (record.descriptor?.set) nativeWrite(node, record, record.requested);
        else if (!record.own) node[record.property] = record.requested;
      }
    } catch (error) { warn(error); }
  }
  function mask(node, category, property = 'alpha', blocked = 0) {
    if (!alive(node)) return;
    const existing = masks.get(node);
    if (existing && (existing.category !== category || existing.property !== property)) unmask(node);
    if (!enabled(category)) { unmask(node); return; }
    if (masks.has(node)) return;
    if (masks.size >= 256) { warning = '同时显示的特效超过处理上限，部分特效保持原样。'; return; }
    const own = Object.getOwnPropertyDescriptor(node, property), owner = propertyOwner(node, property);
    const descriptor = owner && Object.getOwnPropertyDescriptor(owner, property);
    if (own?.configurable === false || descriptor && 'value' in descriptor && descriptor.writable === false
        || descriptor?.get && !descriptor.set) return;
    const value = read(() => node[property]);
    if (typeof value !== typeof blocked || typeof value === 'number' && !Number.isFinite(value)) return;
    const record = { own, descriptor, requested: value, active: true, category, property };
    record.get = function () {
      // Native draw nodes compare this.visible inside their setter before
      // invalidating cached graphics. Expose actual backing state for that
      // comparison so the native setter performs its render/update work.
      if (record.writing && descriptor?.get) return Reflect.apply(descriptor.get, this, []);
      return record.active && enabled(record.category) ? blocked : record.requested;
    };
    record.set = function (next) {
      record.requested = next;
      nativeWrite(this, record, record.active && enabled(record.category) ? blocked : next);
    };
    try {
      Object.defineProperty(node, property, { configurable: true, enumerable: own?.enumerable ?? true, get: record.get, set: record.set });
      masks.set(node, record); node[property] = value; counts[category]++;
    } catch (error) { unmask(node); warn(error); }
  }
  function releasePatch(record) {
    record.active = false;
    try {
      if (record.target[record.key] === record.wrapper) {
        if (record.own) Object.defineProperty(record.target, record.key, record.own);
        else delete record.target[record.key];
      }
    } catch (error) { warn(error); }
  }
  function patch(target, key, after, skipCategory = '', around = null) {
    if (!alive(target)) return false;
    let map = patches.get(target);
    if (map?.has(key)) return true;
    const original = read(() => target[key]); if (typeof original !== 'function') return false;
    const own = Object.getOwnPropertyDescriptor(target, key);
    if (own && (!('value' in own) || own.writable === false && own.configurable === false)) return false;
    const record = { target, key, own, original, active: true };
    record.wrapper = function (...args) {
      if (record.active && enabled(skipCategory)) { counts[skipCategory]++; return undefined; }
      const invoke = (next = args) => Reflect.apply(original, this, next);
      const result = record.active && !closed && around ? around(this, args, invoke) : invoke();
      if (record.active && !closed) { try { after?.(this, args, result); } catch (error) { warn(error); } }
      return result;
    };
    try {
      Object.defineProperty(target, key, { ...(own || { configurable: true, enumerable: false, writable: true }), value: record.wrapper });
      if (!map) { map = new Map(); patches.set(target, map); }
      map.set(key, record); return true;
    } catch (error) { warn(error); return false; }
  }
  const extended = createExtendedEffects(ctx, { enabled, mask, patch, read, alive, items, propertyOwner,
    ready: key => available.add(key), hit: key => { counts[key]++; } });
  function inspectEffect(effect, category) {
    if (!alive(effect)) return;
    mask(effect, category || classifyEffect(read(() => effect.EffectData) || read(() => effect.EffectUrl) || read(() => effect.effectUrl), read(() => effect.effectName)));
    const owner = propertyOwner(effect, 'InitEffect');
    if (owner) patchBase(owner);
  }
  function patchBase(proto) {
    if (patch(proto, 'InitEffect', (self, args) => {
      const category = classifyEffect(args[0]);
      // InitEffect also reuses pooled objects. Remove a previous mask when the
      // object is initialized for a different, unblocked effect.
      mask(self, category);
    })) VISUAL_KEYS.forEach(key => available.add(key));
  }
  function controller(target) {
    if (!alive(target)) return;
    for (const method of CONTROLLER_METHODS) {
      // Seat and scene controllers share this prototype in the inspected
      // client; binding the actual method owner covers new controllers too.
      const owner = propertyOwner(target, method);
      if (patch(owner, method, (_self, args, result) => inspectEffect(result, classifyEffect(args[0], args[method === 'ShowMulitEffectByData' ? 3 : 2])))) {
        VISUAL_KEYS.forEach(key => available.add(key));
      }
    }
    for (const key of ['effectDic', 'jsonEffectDic']) {
      for (const group of items(read(() => target[key]), 64)) {
        for (const effect of Array.isArray(group) ? group.slice(0, 32) : [group]) inspectEffect(effect);
      }
    }
  }
  function noticeNodes(manager) {
    return [read(() => manager.marqueeUI), ...items(read(() => manager.marqueeUIList)), ...items(read(() => manager.marqueeUIActList))].filter(alive).slice(0, 128);
  }
  function noticeManager(target) {
    if (!alive(target) || typeof read(() => target.ShowMarquee) !== 'function' || typeof read(() => target.HideAllMarquee) !== 'function') return;
    // Existing Laya listeners can retain the pre-patch intActDataMarquee
    // function. Native creation adds the node to its dictionary before
    // this.addChild(), so this also masks that saved callback's new node in
    // the same call, without waiting for the periodic discovery pass.
    for (const method of ['ShowMarquee', 'intActDataMarquee', 'ShowNextActMarquee', 'addChild']) {
      if (patch(target, method, self => noticeNodes(self).forEach(node => mask(node, 'notice')))) available.add('notice');
    }
    noticeNodes(target).forEach(node => mask(node, 'notice'));
  }
  function discovery(scene) {
    const queue = [scene, read(() => ctx.window.Laya.stage), read(() => ctx.game.getServerProxy())].filter(alive), seen = new Set();
    let handlerBudget = 512;
    for (let index = 0; index < queue.length && index < 512; index++) {
      const node = queue[index]; if (!alive(node) || seen.has(node)) continue; seen.add(node);
      extended.inspect(node);
      if (flags.notice) {
        noticeManager(node);
        for (const dispatcher of [node, read(() => node.ged)]) {
          for (const event of NOTICE_EVENTS) {
            const handlers = read(() => dispatcher._events[event]);
            for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) noticeManager(read(() => handler.caller));
          }
        }
      }
      if (VISUAL_KEYS.some(enabled) && typeof read(() => node.PlayNanManEffect) === 'function') controller(read(() => node.effectCtrl));
      // Managers are retained by native event handlers, outside the display tree.
      for (const dispatcher of [node, read(() => node.ged)]) {
        if (handlerBudget <= 0) break;
        const events = read(() => dispatcher._events);
        if (!events || typeof events !== 'object') continue;
        let count = 0;
        for (const event in events) {
          if (++count > 128) break;
          const handlers = read(() => events[event]);
          for (const handler of Array.isArray(handlers) ? handlers.slice(0, 16) : [handlers]) {
            if (handlerBudget-- <= 0) break;
            const caller = read(() => handler.caller);
            extended.inspect(caller);
            if (VISUAL_KEYS.some(enabled)) controller(read(() => caller.effectCtrl));
          }
        }
      }
      const children = read(() => node._children);
      if (Array.isArray(children)) queue.push(...children.slice(0, Math.max(0, 512 - queue.length)));
      // EO draw children are not Laya Sprite._children. Hall buttons and
      // task tabs live in this separate native display list.
      const drawChildren = read(() => node.Childs);
      if (Array.isArray(drawChildren) && drawChildren !== children) queue.push(...drawChildren.slice(0, Math.max(0, 512 - queue.length)));
    }
  }
  function clear(keepProb = false) {
    for (const map of patches.values()) for (const record of map.values()) releasePatch(record);
    patches.clear(); for (const node of [...masks.keys()]) unmask(node);
    try { extended.clear(keepProb); } catch (error) { warn(error); }
  }
  function refresh() {
    if (closed || checking) return;
    checking = true;
    try {
      for (const [node, record] of masks) if (!alive(node) || !enabled(record.category)) unmask(node);
      if (!Object.values(flags).some(Boolean)) { clear(); available = new Set(); changed(); return; }
      const scene = read(() => ctx.game.getScene()) || null;
      if (scene !== currentScene) { clear(); currentScene = scene; }
      available = new Set();
      extended.refresh(scene);
      const hasVisual = VISUAL_KEYS.some(enabled);
      if (hasVisual) {
        const base = read(() => ctx.game.getClass('BaseEffect').prototype);
        if (base) patchBase(base);
      }
      const seats = read(() => ctx.game.getSeatUIs()) || [];
      for (const seat of seats.slice(0, 16)) {
        extended.seat(seat);
        if (hasVisual) {
          controller(read(() => seat.EffectCtrl) || read(() => seat.effectCtrl));
          if (patch(seat, 'OnShowAttackedEffect', self => inspectEffect(read(() => self.allowAttackEffect), 'selection'))) available.add('selection');
          inspectEffect(read(() => seat.allowAttackEffect), 'selection');
          for (const child of items(read(() => seat.effectSprite._children), 64)) inspectEffect(child);
        }
        if (flags.shake && patch(seat, 'playHurtShake', null, 'shake')) available.add('shake');
      }
      if (flags.shake) for (const method of ['PlaySimpleShakeEffect', 'PlaySimpleShakeEffect2', 'PlayRuMoShakeEffect']) {
        if (patch(scene, method, null, 'shake')) available.add('shake');
      }
      if (hasVisual) controller(read(() => scene.effectCtrl));
      discovery(scene);
      extended.updateNotices();
      changed();
    } catch (error) { warn(error); changed(); }
    finally { checking = false; }
  }
  function setEnabled(key, value) {
    setMany({ [key]: value });
  }
  function setMany(values) {
    if (closed) return;
    let modified = false;
    const expanded = {};
    for (const [key, value] of Object.entries(values)) {
      const members = OTHER_OPTIONS.find(option => option[0] === key)?.[3] || [key];
      for (const member of members) expanded[member] = value;
    }
    for (const [key, value] of Object.entries(expanded)) {
      if (!Object.hasOwn(flags, key) || flags[key] === !!value) continue;
      ctx.settings.set(key, !!value); flags[key] = !!value; modified = true;
    }
    if (!modified) return;
    // Release and rebuild the owned wrappers immediately on option changes.
    clear(true); refresh();
  }
  function dispose() { if (closed) return; closed = true; clear(); }
  ctx.scope.add(dispose); ctx.scope.interval(refresh, 750); refresh();
  return { setEnabled, setMany, refresh, dispose, getStatus: () => ({ flags: { ...flags }, counts: { ...counts }, available: [...available], warning, masked: masks.size }) };
}
