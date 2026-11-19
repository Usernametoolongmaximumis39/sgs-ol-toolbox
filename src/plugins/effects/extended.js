// Focused ports of the 1.6.75 reference's visual/popup adapters. No reference
// runtime, account settings, auto-play, reward requests or global timers.
const SLOGANS = new Set([
  '中原人杰地灵，天下归心！', '一统中原，天下归心！', '赴此雄途，一统山河！', '对酒当歌，人生几何！',
  '周公吐哺，天下归心。', '雄踞北方，睥睨天下！', '兵锋四向，所向披靡！', '势贯长虹，锐不可当！',
  '魏武挥鞭，龙骧虎战！', '魏风烈烈，霸业千秋！', '枕山河之固，展霸业鸿图！', '执戟兴邦，志在八方！',
  '魏骑驰骋，踏破山河！', '枕山河之固，扬魏武雄风！', '魏德昭彰，恩威并施！', '志在魏邦，雄图万里！',
  '战合肥，破成都胜者为王！', '外驱胡虏，内平吴蜀！', '魏武藏奇略，霸业定乾坤！', '诸公半虎狼，魏旗不留藏!',
  '长驱蹈匈奴，左顾凌鲜卑！', '扇挥白羽迥，甲锁黄金明！', '魏光璀璨耀星河', '魏恩广布润人心',
  '护魏山河，霸业千秋！', '舳舻千里，旌旗蔽空', '受禅汉庭，魏起征程！', '奇谋鬼才，算无遗策！',
  '魏威如岳，气吞山河！', '大魏雄师，势不可挡！', '匡扶汉室，入主中原', '忠义为先，蜀汉必兴！',
  '鞠躬尽瘁，死而后已！', '惟贤惟德，方能匡复汉室！', '能进能退，方能百战不殆！', '蜀风烈烈，其志昭昭！',
  '天地英雄气，千秋尚凛然', '蜀道崎岖，壮志不屈！', '蜀锦为裳，剑指北方！', '血染征袍，荡涤乱世！',
  '汉业兴亡惟我在', '蜀汉精忠，义贯长虹！', '壮志盈怀，忠义为先！', '蜀汉英魂，壮志凌云！',
  '蜀汉兴邦，志在四方', '犯我大吴疆土，虽远必诛', '上有天堂，下有苏杭！', '羽扇纶巾，计定天下！',
  '何人敢犯大吴疆土', '赴汤蹈火，在所不辞！', '犯大吴疆土者，吾必击而破之！', '江东子弟，何惧于天下！',
  '天下英雄谁敌手', '英雄何不带吴钩', '东吴水师，横行江海！', '吴钩似霜，斩破千障！',
  '吴营谋深，弹指乾坤！', '天险固垒，欲攻则锐！', '智谋如渊，踏浪焚天！', '江东子弟多才俊谁怕！',
]);
const WINDOWS = {
  AdPushWindow: ['ad', 'Close'], VersionNoticeWindow: ['version', 'Close'],
  GameResultWindow: ['result', 'laterClose'], GameMvpWindow: ['result', 'laterClose'],
  RogueLike1v1ZhanJiWindow: ['result', 'onClickClose'],
  GeneralOpenResultWindow: ['package', 'Close'], SkinOpenResultWindowNew: ['package', 'Close'],
  OldbackOneClickDrawAwdWin: ['package', 'Close'], SelectSkinWindow: ['package', 'Close'],
  RogueChapterStoryWindow: ['rogue', 'Close'],
};
const PROB_WINDOWS = ['GetPropSpecialWindow', 'GetNewGeneralWindow', 'SkinNewGetWin', 'GetPropXianDingWindow'];
const RECRUIT_VIEWS = ['GeneralOpenWindow', 'GeneralOpenNewbieView'];
const RECRUIT_EFFECT = /^res\/assets\/animate\/hall\/generalopen\/zhaomuchaibao0[1-3]\.sk$/;
const SKIN_NODES = ['outAvatarEffect', 'outAvatarEffect2', 'playingNewSpEffect', 'newFullScreenEffect'];
const YEHUO_SKIN_ID = 75001;
const SKIN_ACTION_TYPES = [1, 2, 3, 5]; // Interaction, skill, attack, second skill. Form changes have their own lifecycle.
const HALL_AD_BADGES = [10049, 10307]; // Bottom_Notice, Bottom_Calendar
const HALL_AD_MANAGERS = [
  ['decodeSyncGameDataEvent', 'NoticeRed'],
  ['ClientLobbyAdRep', 'ShowNewAdNoticeRed'],
  ['decodeClientActivityCalendarDataResp', 'GetSpecialActivityCalendar'],
];

export function createExtendedEffects(ctx, api) {
  const { enabled, mask, patch, read, alive, items, propertyOwner, ready, hit } = api;
  let probStates = new WeakMap(), inspected = new Set();
  const redTrees = new Set(), closing = new WeakSet();
  const getters = new Map(), noticeBars = new Set();
  const calendarViews = new Set();
  const probNodes = new Set();
  const treeBars = new Set(), blessManagers = new Set();
  const blockedTree = () => enabled('banner') && [...blessManagers].some(manager => alive(manager) && read(() => manager.FreeBlessItemEnough) === false);
  const openingDepth = new WeakMap();
  let bossTransitions = 0;
  const hidden = (node, category) => { if (alive(node)) mask(node, category, 'visible', false); };
  function wrap(target, method, categories, handler) {
    if (!categories.some(enabled)) return false;
    const owner = propertyOwner(target, method);
    if (!owner || !patch(owner, method, null, '', handler)) return false;
    categories.forEach(ready); return true;
  }
  function windowWrap(target, method, categories, handler) {
    if (!categories.some(enabled) || !alive(target)) return false;
    // A window's entry methods often live on a shared PopUpWindow ancestor.
    // Shadow them on the specific window prototype/instance, never that owner.
    const isPrototype = read(() => target.constructor.prototype) === target;
    if (!patch(target, method, null, '', (self, args, invoke) => {
      const matches = self === target ? !isPrototype : read(() => Object.prototype.isPrototypeOf.call(target, self));
      return matches ? handler(self, args, invoke) : invoke();
    })) return false;
    categories.forEach(ready); return true;
  }
  function skip(target, method, category, condition = () => true, value) {
    return wrap(target, method, [category], (self, args, invoke) => {
      if (enabled(category) && condition(self, args)) { hit(category); return value; }
      return invoke();
    });
  }
  function closeWindow(node, category, method = 'Close') {
    if (!enabled(category) || !alive(node) || closing.has(node) || typeof read(() => node[method]) !== 'function') return;
    // Do not close an already removed native window or its modal layer twice.
    if ('parent' in node && !read(() => node.parent)) return;
    closing.add(node);
    try {
      if (alive(node)) node[method]();
      hit(category);
    } finally { closing.delete(node); }
  }
  function maskRecruitEffect(view) {
    const effect = read(() => view.zhaoMuEffect);
    const url = read(() => effect.EffectUrl || effect.effectUrl);
    if (typeof url === 'string' && RECRUIT_EFFECT.test(url)) mask(effect, 'package');
  }
  function windowAdapter(target, name, instance = false) {
    if (!alive(target)) return;
    if (RECRUIT_VIEWS.includes(name)) {
      windowWrap(target, 'showOpenEffect', ['package'], (self, _args, invoke) => {
        const result = invoke();
        // The reveal label and stop events drive the result window and cleanup.
        maskRecruitEffect(self);
        return result;
      });
      return;
    }
    if (name === 'RogueComChangeWindow') {
      for (const method of ['enterWindow', 'UpdateWindow']) windowWrap(target, method, ['rogue'], (self, args, invoke) => {
        const before = bossTransitions, data = args[0];
        const result = invoke();
        // SetData runs the boss callback synchronously, but leaves a modal
        // window for 2.1 seconds. Finish only that observed boss transition,
        // after native entry completes; ShowNext clears its timer and queue.
        if (enabled('rogue') && bossTransitions !== before && data?.onlyCallback
          && !data.isFight && !data.showtip && !data.showSchool && !data.ShowRuQin) {
          closeWindow(self, 'rogue', 'ShowNext');
        }
        return result;
      });
      return;
    }
    if (name === 'TianShuWindow') {
      windowWrap(target, 'updateWinUI', ['tianshu', 'skill'], (self, args, invoke) => {
        if (args[0]?.type === 6 && typeof self.Close === 'function' && (enabled('tianshu') || enabled('skill'))) {
          self.Close(); hit(enabled('tianshu') ? 'tianshu' : 'skill'); return;
        }
        return invoke();
      });
      if (instance && read(() => target.type) === 6) closeWindow(target, enabled('tianshu') ? 'tianshu' : 'skill');
      return;
    }
    if (PROB_WINDOWS.includes(name)) { probability(target, name, instance); return; }
    const spec = WINDOWS[name]; if (!spec || !enabled(spec[0])) return;
    const [category, method] = spec;
    const eligible = node => !(category === 'result' && node.isShare)
      && !(name === 'SelectSkinWindow' && !(node.selectView?.usingSkinID >= 0));
    // showHandler runs halfway through native enterWindow, before listeners
    // and window initialization finish. Close only after the outer entry ends.
    for (const key of ['enterWindow', 'UpdateWindow']) windowWrap(target, key, [category], (self, _args, invoke) => {
      const depth = openingDepth.get(self) || 0;
      openingDepth.set(self, depth + 1);
      let complete = false;
      try { const result = invoke(); complete = true; return result; }
      finally {
        if (depth) openingDepth.set(self, depth); else openingDepth.delete(self);
        if (complete && depth === 0 && eligible(self)) closeWindow(self, category, method);
      }
    });
    if (instance && eligible(target)) closeWindow(target, category, method);
  }
  function hideProb(node) {
    hidden(node, 'prob'); hidden(read(() => node.modalBg), 'prob');
  }
  function finishProb(node) {
    const state = probStates.get(node);
    if (!state || state.pending) return;
    if (state.name === 'GetPropSpecialWindow' && read(() => node.cantClose) !== true) return;
    state.pending = true;
    queueMicrotask(() => {
      state.pending = false;
      // Disabling/unloading cancels queued work, even if another wrapper kept us.
      if (probStates.get(node) === state && enabled('prob')) {
        if (typeof read(() => node.isAboveWindowShowing) === 'function' && node.isAboveWindowShowing()) return;
        closeWindow(node, 'prob'); probNodes.delete(node); probStates.delete(node);
      }
    });
  }
  function probability(target, name, instance) {
    if (!enabled('prob')) return;
    windowWrap(target, 'enterWindow', ['prob'], (self, args, invoke) => {
      // Native -1 denotes a preview/share, not a newly obtained item.
      const preview = name === 'GetNewGeneralWindow' && args[6] === -1 || name === 'SkinNewGetWin' && args[2] === -1;
      probStates.delete(self);
      probNodes.delete(self);
      if (preview) { mask(self, ''); mask(read(() => self.modalBg), ''); }
      if (!preview && enabled('prob') && probNodes.size < 128) {
        probStates.set(self, { officerReady: !!args[5], name }); probNodes.add(self); hideProb(self);
      }
      const result = invoke();
      if (probStates.has(self)) {
        hideProb(self);
        if (name === 'SkinNewGetWin' || name === 'GetPropXianDingWindow') finishProb(self);
      }
      return result;
    });
    windowWrap(target, 'showHandler', ['prob'], (self, _args, invoke) => {
      const result = invoke(); if (probStates.has(self)) hideProb(self); return result;
    });
    // Keep native officer points, general unlocks, lamp collection and item
    // creation. Close only at their native completion stage.
    if (name === 'GetNewGeneralWindow') {
      for (const method of ['delayFunc', 'onShowOfficerPoint']) windowWrap(target, method, ['prob'], (self, _args, invoke) => {
        const result = invoke(), state = probStates.get(self);
        if (state) {
          state[method === 'delayFunc' ? 'generalReady' : 'officerReady'] = true;
          if (state.generalReady && state.officerReady) finishProb(self);
        }
        return result;
      });
    }
    if (name === 'GetPropSpecialWindow') windowWrap(target, 'showFinalResult', ['prob'], (self, _args, invoke) => {
      const result = invoke(); if (probStates.has(self)) { hideProb(self); finishProb(self); } return result;
    });
    if (name === 'GetPropSpecialWindow') windowWrap(target, 'cantCloseChange', ['prob'], (self, _args, invoke) => {
      const result = invoke(); if (probStates.has(self)) finishProb(self); return result;
    });
    if (instance && !probStates.has(target) && read(() => target.isFinalResultShown) === true) {
      probStates.set(target, { name }); hideProb(target); finishProb(target);
    }
  }
  const skinSeat = ui => read(() => ui.seat) || read(() => ui.Seat);
  function skinCategory(seat, type, general = false) {
    const own = read(() => seat.IsSelf);
    // Unknown ownership must not be treated as an opponent.
    const side = own === true ? 'selfSkin' : own === false ? 'otherSkin' : '';
    if (enabled(side)) return side;
    return enabled('skill') && (general || [2, 4, 5].includes(type)) ? 'skill' : '';
  }
  function skinNodes(self, category) {
    if (!category) return;
    for (const key of SKIN_NODES) mask(read(() => self[key]), category);
  }
  function seat(target) {
    if (!alive(target)) return;
    for (const method of ['playGeneralSpEffect', 'onPlayNewSpEffect']) wrap(target, method,
      ['selfSkin', 'otherSkin', 'skill'], (self, args, invoke) => {
        const general = method === 'playGeneralSpEffect';
        const seat = skinSeat(self);
        const category = skinCategory(seat, args[0], general);
        // 业火淬魂's optional out-of-seat action also launches the secondary
        // visuals. Skip that presentation before it hides the idle portrait or
        // schedules any follow-ups. Native card/skill resolution is upstream.
        if (!general && category && !args[3] && SKIN_ACTION_TYPES.includes(args[0])
          && Number(read(() => seat.SkinItemID)) === YEHUO_SKIN_ID) {
          hit(category);
          return;
        }
        const result = invoke(); skinNodes(self, category); return result;
      });
    skinNodes(target, skinCategory(skinSeat(target)));
    const top = read(() => target.otherTopManager);
    skip(target, 'ShowBigFace', 'emotion', self => read(() => self.seat.IsSelf) === false);
    skip(top, 'ShowBigFace', 'emotion', self => read(() => self.seat.IsSelf) === false);
    if (enabled('emotion') && read(() => target.seat.IsSelf) === false) hidden(read(() => top.bigFaceView), 'emotion');
    skip(target, 'ShowChatMessage', 'slogan', (_self, args) => isSlogan(args[0]));
    skip(top, 'ShowChatMessage', 'slogan', (_self, args) => isSlogan(args[0]));
    for (const method of ['playEquipSkillAnimate', 'play3DEquipSkill', 'ShowEquipTrailEffect']) skip(target, method, 'equip');
    skip(target, 'play2DHurtShaEffect', 'shake');
    skip(target, 'playXDJXSkillEffect', 'skill');
  }
  function isSlogan(data) {
    return Number(data?.Channel ?? data?.ChannelNum) === 2 && SLOGANS.has(data?.chatMsg ?? data?.ChatMsg);
  }
  function downloadEntry(target) {
    if (!enabled('download') || !alive(target) || typeof read(() => target.showDownloadWin) !== 'function'
      || typeof read(() => target.recommendPos) !== 'function') return;
    const hide = self => {
      if (self !== target) return;
      const button = read(() => self.downloadBtn);
      if (alive(button)) { hidden(button, 'download'); ready('download'); }
    };
    // The hall widget creates downloadBtn in showLimitBtn and can later
    // animate it. Keep the native routines and every sibling button intact.
    for (const method of ['showLimitBtn', 'recommendPos', 'addChild']) {
      if (patch(target, method, self => hide(self))) ready('download');
    }
    hide(target);
  }
  function redTree(manager) {
    if (!enabled('redDot')) return;
    const tree = read(() => manager.tree);
    if (!alive(tree) || typeof read(() => tree.notifyNodeEvent) !== 'function') return;
    if (patch(tree, 'notifyNodeEvent', null, '', (self, args, invoke) => {
      const node = args[0];
      if (self !== tree || !enabled('redDot') || typeof node?.event !== 'function') return invoke();
      hit('redDot'); return node.event(read(() => node.constructor.RED_UPDATE) || 'RED_UPDATE', false);
    })) ready('redDot');
    redTrees.add(tree);
    const queue = [read(() => tree.Root)], seen = new Set();
    for (let i = 0; i < queue.length && i < 512; i++) {
      const node = queue[i]; if (!alive(node) || seen.has(node)) continue; seen.add(node);
      tree.notifyNodeEvent(node);
      const children = read(() => node.children);
      if (Array.isArray(children)) queue.push(...children.slice(0, Math.max(0, 512 - queue.length)));
    }
  }
  function redVisual(target) {
    if (!enabled('redDot') || !alive(target)) return;
    const point = typeof read(() => target.ShowRedPoint) === 'function' && typeof read(() => target.RemoveRedPoint) === 'function';
    const dot = typeof read(() => target.ShowRedDot) === 'function' && typeof read(() => target.UpdateRedNum) === 'function';
    // Exact button APIs identify notification badges. Never hide a button or
    // an arbitrary node just because its field/name happens to contain "red".
    if (!point && !dot) return;
    const hide = self => {
      if (self !== target || !enabled('redDot')) return;
      const keys = point ? ['redPointTex', 'redPointTexture', 'numDotNode'] : [];
      if (dot) keys.push('redDot');
      for (const key of keys) {
        const badge = read(() => self[key]);
        if (alive(badge)) { hidden(badge, 'redDot'); ready('redDot'); }
      }
    };
    for (const method of ['ShowRedPoint', 'RemoveRedPoint', 'ShowRedDot', 'UpdateRedNum', 'SetNumber', 'addDrawChild', 'addDrawChildAt']) {
      // Shadow only the confirmed button instance; shared base methods stay
      // intact, including widgets from other plugins.
      if (typeof read(() => target[method]) === 'function') patch(target, method, self => hide(self));
    }
    hide(target);
  }
  function redGetter(target, key, blocked = () => enabled('redDot') || enabled('version')) {
    if (!(enabled('redDot') || enabled('version') || enabled('banner')) || !alive(target)) return;
    let records = getters.get(target);
    if (records?.has(key)) { ready('redDot'); return; }
    const owner = propertyOwner(target, key), descriptor = owner && Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor?.get) return;
    const own = Object.getOwnPropertyDescriptor(target, key);
    if (own?.configurable === false) return;
    const record = { active: true, own, get: null };
    record.get = function () {
      return record.active && blocked() ? false : Reflect.apply(descriptor.get, this, []);
    };
    Object.defineProperty(target, key, { ...descriptor, configurable: true, get: record.get });
    if (!records) { records = new Map(); getters.set(target, records); }
    records.set(key, record); ready('redDot');
  }
  function inspectHallAdManagers(proxy) {
    // These private singletons are already registered on the server proxy.
    for (const [event, member] of HALL_AD_MANAGERS) {
      const handlers = read(() => proxy._events[event]);
      for (const handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
        const manager = read(() => handler.caller);
        if (alive(manager) && member in manager) inspect(manager);
      }
    }
  }
  function protectMoreMenu(bar) {
    const view = read(() => bar.moreView);
    patch(view, 'UpdateRedPoint', null, '', (self, args, invoke) =>
      invoke(self === view && enabled('version') && HALL_AD_BADGES.includes(args[0])
        ? [args[0], false, ...args.slice(2)] : args));
  }
  function inspect(target) {
    if (!alive(target) || inspected.has(target) || inspected.size >= 2048) return;
    inspected.add(target);
    // Only named client surfaces are inspected; never invoke singleton factories.
    if (enabled('package')) maskRecruitEffect(target);
    if (enabled('banner')) {
      const hide = self => hidden(read(() => self.adBanner), 'banner');
      if (alive(read(() => target.adBanner))) { hide(target); ready('banner'); }
      wrap(target, 'showAdView', ['banner'], (self, _args, invoke) => { const result = invoke(); hide(self); return result; });
    }
    if (enabled('banner')) {
      if ('FreeBlessItemEnough' in target) blessManagers.add(target);
      redGetter(target, 'ShowKanshuRed', blockedTree);
      // The tree window's namesake marks its guide read; only refresh the hall.
      if (typeof read(() => target.checkKanShuTime) === 'function'
          && typeof read(() => target.checkKanShuRed) === 'function') treeBars.add(target);
    }
    downloadEntry(target); downloadEntry(read(() => target.hallleftDownBtn));
    redTree(target);
    redTree(read(() => target.manager));
    redVisual(target);
    if (enabled('version')) {
      // Calendar unread status feeds both the More aggregate and activity tab.
      // Identify its manager by its dedicated APIs, preserving read history.
      if (typeof read(() => target.GetSpecialActivityCalendar) === 'function'
          && typeof read(() => target.GetLimitActivityCalendar) === 'function') {
        skip(target, 'IsReddot', 'version', () => true, false);
      }
      if (typeof read(() => target.activityCalendarRedHandler) === 'function') {
        calendarViews.add(target);
        patch(target, 'activityCalendarRedHandler', null, '', (_self, args, invoke) =>
          invoke(enabled('version') ? [false, ...args.slice(1)] : args));
        const button = read(() => target.calendarBtn);
        const hide = () => hidden(read(() => button.redPointTex), 'version');
        for (const method of ['ShowRedPoint', 'addDrawChild']) patch(button, method, hide);
        hide();
      }
    }
    // These hall surfaces can be outside the Sprite child list.
    if (enabled('redDot') || enabled('version')) for (const key of ['hallToolbar', 'toolBar', 'moreView']) inspect(read(() => target[key]));
    for (const key of ['IsReddot', 'HasRedDot']) skip(target, key, 'redDot', () => true, false);
    for (const key of ['NoticeRed', 'ShowNewAdNoticeRed']) redGetter(target, key);
    if (enabled('version') && typeof read(() => target.checkMoreRed) === 'function'
        && typeof read(() => target.moreUpdate) === 'function') {
      noticeBars.add(target);
      protectMoreMenu(target);
      // The panel is created on first click, just before the first check.
      patch(target, 'checkMoreRed', null, '', (self, _args, invoke) => {
        if (self === target && enabled('version')) protectMoreMenu(self);
        return invoke();
      });
      ready('version');
    }
    skip(target, 'dealChatMessage', 'slogan', (_self, args) => isSlogan(args[0]));
    for (const method of ['showGameRewardPointEffect1', 'showGameRewardPointEffect3']) skip(target, method, 'kill');
    for (const method of ['showGameRewardPointEffect2', 'showGameRewardPointEffect5']) skip(target, method, 'heal');
    skip(target, 'PlayTriggerEffect', 'skill');
    if (enabled('skill')) wrap(target, 'GetHighQualitySkillEffect', ['skill'], (_self, _args, invoke) => {
      const result = invoke(); inspect(result); return result;
    });
    for (const effect of items(read(() => target.HighQualitySkillDic) || read(() => target.highQualitySkillDic), 64)) inspect(effect);
    if (enabled('entrance')) {
      // Preserve native entry queues and STOPPED callbacks; hide the dedicated
      // entrance visual after native setup, rather than freezing its queue.
      for (const method of ['PlaySeatShowAnimate', 'PlayLegendShow']) wrap(target, method, ['entrance'], (self, _args, invoke) => {
        const result = invoke(); mask(read(() => self.avatarAnimate), 'entrance');
        mask(read(() => self.currentLegendShow), 'entrance'); return result;
      });
      mask(read(() => target.avatarAnimate), 'entrance');
      mask(read(() => target.currentLegendShow), 'entrance');
    }
    if (enabled('rogue')) {
      const city = read(() => target.cityView) || target;
      patch(city, 'ShowBossEffect', null, '', (self, args, invoke) => {
        const boss = read(() => self.currentBossCityItem);
        if (enabled('rogue') && args.length === 0 && read(() => self.IsBossShow)
          && typeof read(() => boss.ShowBossIcon) === 'function'
          && typeof read(() => self.clearBossEffct) === 'function') {
          boss.ShowBossIcon(); bossTransitions++; hit('rogue'); return;
        }
        const result = invoke(); mask(read(() => self.bossEffect), 'rogue'); return result;
      });
      // Also cover STOPPED from an animation started before the toggle.
      for (const method of ['playShakeEffect', 'playBGShakeEffect']) {
        if (typeof read(() => city.ShowBossEffect) === 'function') patch(city, method, null, 'rogue');
      }
      mask(read(() => city.bossEffect), 'rogue');
    }
    const name = read(() => target.WindowName) || read(() => target.windowName) || read(() => target.name)
      || read(() => target.constructor.name);
    windowAdapter(target, name, true);
  }
  function refresh(scene) {
    inspected = new Set(); blessManagers.clear(); inspect(scene);
    for (const node of probNodes) {
      if (!alive(node)) { probNodes.delete(node); probStates.delete(node); }
      else hideProb(node);
    }
    for (const name of [...Object.keys(WINDOWS), ...PROB_WINDOWS, ...RECRUIT_VIEWS, 'RogueComChangeWindow', 'TianShuWindow', 'ModeScene']) {
      const type = read(() => ctx.game.getClass(name));
      const proto = read(() => type.prototype);
      if (proto) { windowAdapter(proto, name); if (name === 'ModeScene') inspect(proto); }
    }
    for (const name of ['TaskRedDotManager', 'ChatManager', 'RoomControler', 'WindowManager', 'WelfareManger', 'BlessManager']) {
      const type = read(() => ctx.game.getClass(name));
      if (typeof type === 'function') inspect(read(() => type.prototype)); else inspect(type);
      // Observe existing singletons without invoking I()/GetInstance or a
      // getter that could construct a manager or send requests.
      if (enabled('redDot') || enabled('banner')) for (const key of ['instance', '_instance', 's_instance']) {
        const descriptor = read(() => Object.getOwnPropertyDescriptor(type, key));
        if (descriptor && 'value' in descriptor) inspect(descriptor.value);
      }
      const managers = read(() => type.managerList) || read(() => type.constructor.managerList);
      if (Array.isArray(managers)) managers.slice(0, 256).forEach(inspect);
    }
    const proxy = read(() => ctx.game.getServerProxy());
    if (enabled('version')) inspectHallAdManagers(proxy);
    for (const managers of [read(() => proxy.constructor.managerList), read(() => scene.ged.constructor.managerList)]) {
      if (Array.isArray(managers)) managers.slice(0, 256).forEach(inspect);
    }
  }
  function updateNotices() {
    for (const view of calendarViews) if (alive(view)) read(() => view.initCalendarRedDot());
    for (const bar of treeBars) if (alive(bar)) read(() => bar.checkKanShuRed());
    for (const bar of noticeBars) if (alive(bar)) {
      for (const id of HALL_AD_BADGES) read(() => bar.moreView?.UpdateRedPoint(id, false));
      read(() => bar.moreUpdate());
    }
  }
  function clear(keepProb = false) {
    if (!keepProb || !enabled('prob')) { probStates = new WeakMap(); probNodes.clear(); }
    inspected.clear();
    for (const [target, records] of getters) for (const [key, record] of records) {
      record.active = false;
      if (Object.getOwnPropertyDescriptor(target, key)?.get !== record.get) continue;
      if (record.own) Object.defineProperty(target, key, record.own); else delete target[key];
    }
    getters.clear();
    for (const view of calendarViews) if (alive(view)) read(() => view.initCalendarRedDot());
    calendarViews.clear();
    for (const bar of treeBars) if (alive(bar)) read(() => bar.checkKanShuRed());
    treeBars.clear(); blessManagers.clear();
    for (const bar of noticeBars) if (alive(bar)) read(() => bar.moreUpdate());
    noticeBars.clear();
    // Restore red-dot presentation from current native states without marking
    // tasks read, changing reward state or losing updates received while hidden.
    for (const tree of redTrees) {
      const queue = [read(() => tree.Root)], seen = new Set();
      for (let i = 0; i < queue.length && i < 512; i++) {
        const node = queue[i]; if (!alive(node) || seen.has(node)) continue; seen.add(node);
        if (typeof read(() => node.event) === 'function') node.event(read(() => node.constructor.RED_UPDATE) || 'RED_UPDATE', !!(node.state === 1 && node.enable));
        const children = read(() => node.children);
        if (Array.isArray(children)) queue.push(...children.slice(0, Math.max(0, 512 - queue.length)));
      }
    }
    redTrees.clear();
  }
  return { refresh, seat, inspect, clear, updateNotices };
}
