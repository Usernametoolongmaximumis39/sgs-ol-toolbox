import { read } from './native-model.js';

const DDZ_ATTACK_SKILL = 3073;
const FORM_TRANSITION_EFFECT = 4;
const SPINE_EFFECT = 3;
const DEBUT_ASSET = /(?:^|\/)res\/assets\/animate\/game\/fight\/(jin|yin)longkuang\.sk(?:[?#]|$)/i;

function ownsSkin(target, skin) {
  const id = Number(skin?.skinID);
  return id > 0 && (id === Number(target.deputy ? target.seat?.Skin2ID : target.seat?.SkinID) ||
    id === Number(target.general?.SkinId ?? target.general?.SkinItemId));
}

function sameArt(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return true;
  const path = url => url.split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+\//i, '').replace(/^\//, '');
  const a = path(left), b = path(right);
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}

// The native player reads skin metadata again when resolving battle audio and
// effects. Expose the local choice only for the duration of those calls.
function useLocalSkin(choices, play) {
  const restore = [];
  function show(owner, values) {
    for (const [key, value] of Object.entries(values)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor ? !descriptor.configurable : !Object.isExtensible(owner)) continue;
      const get = () => value;
      Object.defineProperty(owner, key, { configurable: true, enumerable: descriptor?.enumerable, get });
      restore.push(() => {
        if (Object.getOwnPropertyDescriptor(owner, key)?.get !== get) return;
        if (descriptor) Object.defineProperty(owner, key, descriptor);
        else delete owner[key];
      });
    }
  }
  try {
    for (const { target, applied, multiForm } of choices) {
      const { seat, general, deputy } = target;
      show(general, {
        SkinId: applied.id, SkinItemId: applied.id, IsDynamic: applied.dynamic, DySkinType: applied.form,
        JuexingNum: multiForm ? applied.form : 0,
      });
      show(seat, deputy
        ? { Skin2ID: applied.id, SkinItem2ID: applied.id, DySkinType2: applied.form }
        : { SkinID: applied.id, SkinItemID: applied.id, DySkinType: applied.form });
    }
    return play();
  } finally {
    for (const reset of restore.reverse()) reset();
  }
}

export function bindSkinPresentation(scope, ui, seat, getChoices, getPortraits, { skillVoice, deathVoice, cardEffect, skillEffect }) {
  const releases = [];
  const events = new Map();
  let playingChoices, localTransition, disposed = false;
  function present(play) {
    if (playingChoices) return play();
    const choices = getChoices();
    if (!choices.length) return play();
    playingChoices = choices;
    try { return useLocalSkin(choices, play); }
    finally { playingChoices = null; }
  }
  function patch(owner, key, handle = play => play(), withSkin = true) {
    if (typeof owner[key] !== 'function') return;
    releases.push(scope.patch(owner, key, original => function (...args) {
      if (disposed || this !== owner) return Reflect.apply(original, this, args);
      const play = (next = args) => Reflect.apply(original, this, next);
      return handle(withSkin ? next => present(() => play(next)) : play, args);
    }));
  }
  patch(seat, 'PlaySkillSound', skillVoice);
  patch(seat, 'PlaySkillHurtSound', (play, args) => skillVoice ? skillVoice(play, args, true) : play());
  patch(seat, 'PlayDeadSound', deathVoice);
  patch(seat, 'PlayDiscardSound');

  // Round effects are scene sprites, independent of the avatar's own spine.
  const roundSkin = () => read(() => ui.maxSeatSkinVO) ?? read(() => seat.MaxSkinVO);
  const replaced = skin => getPortraits().some(({ target }) => ownsSkin(target, skin));
  const allowRoundArt = url => {
    const skin = roundSkin();
    return !replaced(skin) && sameArt(url, read(() => skin.SkinUrlInTip));
  };
  patch(ui, 'playSkinRoundEffect', play => present(() => {
    if (!replaced(roundSkin())) return play();
  }), false);
  const allowSpecialRoundArt = url => {
    const skin = roundSkin();
    return !replaced(skin) && sameArt(url, read(() => skin.ShowEffectUrl));
  };
  patch(ui, 'showSkinEffect', (play, [url]) => present(() => {
    if (allowSpecialRoundArt(url)) return play();
  }), false);
  patch(ui, 'skinInWindowLoaded', (play, [, url]) => present(() => {
    if (allowRoundArt(url)) return play();
  }), false);
  patch(ui, 'addRoundEffectList', play => present(() => {
    if (!replaced(roundSkin())) return play();
  }), false);
  patch(ui, 'addGameSceneEffect', (play, [effect]) => {
    // The loader can hold the native callback from before the local choice.
    // Keep its exact sprite detached and clear it after the callback positions it.
    const round = effect && effect === ui.skinRoundEffect;
    const special = effect && effect === ui.spSkinRoundEffect;
    if ((round || special) && !present(() => special
      ? allowSpecialRoundArt(effect.EffectUrl ?? effect.effectUrl) : allowRoundArt(ui.skinTexture?.url))) {
      effect.visible = false;
      queueMicrotask(() => {
        if (ui.skinRoundEffect === effect || ui.spSkinRoundEffect === effect) ui.clearSkinRoundEffect?.();
        else if (!effect.destroyed) effect.destroy?.();
      });
      return;
    }
    return play();
  }, false);

  // These effects explicitly read the primary general's skin even when a skill
  // belongs to the deputy. Returning false lets the generic skill effect run.
  const replacesPrimary = () => getPortraits().some(({ target }) => !target.deputy);
  patch(ui, 'onPlayNewSpEffect', play => { if (!replacesPrimary()) return play(); });
  patch(ui, 'onShowDoubleSkinJuexing', play => { if (!replacesPrimary()) return play(); });
  patch(ui, 'playGeneralSpEffect', play => replacesPrimary() ? false : play());
  patch(ui, 'skinHasXDJXSkill', (play, [skill]) => {
    const portraits = getPortraits();
    const general = portraits.length && read(() => seat.GetGeneralBySkillId(skill?.ID));
    return portraits.some(({ target }) => target.general === general) ? false : play();
  });
  patch(ui, 'loadSkinHasSkillComplete', play => {
    // A loader callback already queued when the portrait took over can still
    // assign its texture after the original skin's pending URLs were cleared.
    if (!getPortraits().length || (ui.skinSkillGeneralUrl && ui.skinSkillTxtUrl)) return play();
  });
  patch(ui, 'ddzGongJiImgLoaded', (play, [texture, url, skill]) =>
    replacesPrimary() && texture ? play([null, url, skill]) : play());
  for (const key of ['aniNewcallBack', 'interruptPlayingNewSpEffect']) patch(ui, key);
  const isLocalTransition = () => localTransition && (localTransition.starting ||
    (localTransition.effect && ui.playingNewSpEffect === localTransition.effect));
  patch(ui, 'onLoadSpineComplete', play => {
    if (!isLocalTransition()) return play();
  });
  patch(ui, 'aniEventNew', (play, [variant, , label]) => {
    // The native transition broadcasts to every avatar using this skin ID.
    // The local avatar already displays the destination form.
    if (isLocalTransition() && (label?.name === 'Ahide' || label?.name === 'Bshow')) return;
    if (label?.name === 'Skill' && ui.playingNewSpEffectEvent) {
      const choice = (playingChoices ?? getChoices()).find(({ target, applied }) => !target.deputy &&
        applied.form > 1 && applied.id === Number(ui.playingSkinVo?.skinID));
      const effect = Number(variant) === 1 ? ui.generalSpEffectStop2 : ui.generalSpEffectStop1;
      if (choice && typeof effect === 'function') {
        const base = ui.playingSkinVo.DynamicSkinBigSkeletonUrlNew?.(choice.applied.form, true);
        if (base) return Reflect.apply(effect, ui, [ui.playingNewSpEffectEvent, ui.playingNewSpEffectSkill,
          base + '/jineng02.json', SPINE_EFFECT, Number(variant) === 1 ? 'shouji_kapai' : 'JiNeng']);
      }
    }
    return play();
  });

  // Laya captures these callbacks when it binds the seat. Wrap the matching
  // handler's invocation so native listener identity and ordering are preserved.
  function refreshEvents() {
    for (const [event, key] of [['USE_CARD', 'useCardAniPlay'], ['USE_SKILL', 'onUseSkill']]) {
      const entries = seat._events?.[event];
      const method = ui[key];
      const handler = (Array.isArray(entries) ? entries : [entries])
        .find(entry => entry && entry.caller === ui && entry.method === method && typeof entry.runWith === 'function');
      const previous = events.get(event);
      if (previous?.handler === handler) continue;
      previous?.release();
      events.delete(event);
      if (!handler) continue;
      const release = scope.patch(handler, 'runWith', original => function (...args) {
        const [data] = args;
        const run = () => Reflect.apply(original, this, args);
        if (disposed || this.caller !== ui || this.method !== method) return run();
        if (event === 'USE_CARD') {
          if (Array.isArray(data)) read(() => cardEffect?.(data));
          return present(run);
        }
        const notification = Array.isArray(data) ? data[0] : data;
        read(() => skillEffect?.(notification));
        // The USE_SKILL listener also runs unrelated skill logic.
        return notification?.Skill?.ID === DDZ_ATTACK_SKILL ? present(run) : run();
      });
      events.set(event, { handler, release });
    }
  }
  refreshEvents();
  function playFormTransition() {
    if (typeof ui.onPlayNewSpEffect !== 'function') return;
    const previous = ui.playingNewSpEffect;
    const transition = { starting: true, effect: null };
    localTransition = transition;
    try { ui.onPlayNewSpEffect(FORM_TRANSITION_EFFECT); }
    finally {
      transition.starting = false;
      if (ui.playingNewSpEffect !== previous && ui.playingNewSpType === FORM_TRANSITION_EFFECT) transition.effect = ui.playingNewSpEffect;
      if (!transition.effect) localTransition = null;
    }
  }
  return { refreshEvents, playFormTransition, dispose() {
    disposed = true;
    for (const entry of events.values()) entry.release();
    for (const release of releases.reverse()) release();
    events.clear();
  } };
}

export function bindSkinDebut(scope, ui, replaced, splitDebut) {
  const sides = new WeakMap();
  let layer, releaseRender;

  function clear() {
    if (!layer?.numChildren || typeof layer.getChildAt !== 'function') return;
    const main = replaced(false), deputy = replaced(true);
    if (!main && !deputy) return;
    const split = splitDebut();
    const seat = ui.Seat ?? ui.seat;
    for (let index = layer.numChildren - 1; index >= 0; index--) {
      const effect = layer.getChildAt(index);
      const asset = DEBUT_ASSET.exec(effect?.EffectUrl ?? effect?.effectUrl);
      if (!asset) continue;
      let side = sides.get(effect);
      if (side === undefined && split && main !== deputy) {
        // Before our hook was installed, a country-war seat may already have
        // created a debut. The visual identifies the rank that was revealed.
        const grade = asset[1].toLowerCase() === 'jin' ? 4 : 3;
        const mainGrade = Number(seat?.General?.Gradation), deputyGrade = Number(seat?.General2?.Gradation);
        if ((mainGrade === grade) === (deputyGrade === grade)) continue;
        side = deputyGrade === grade;
      }
      if (!split || (main && deputy) || (side ? deputy : main)) effect.destroy?.();
    }
  }
  const releasePlay = scope.patch(ui, 'PlayDebutEffect', original => function (position = 0, ...args) {
    if (this !== ui) return Reflect.apply(original, this, [position, ...args]);
    const split = splitDebut(), deputy = position === 1;
    if (split ? replaced(deputy) : replaced(false) || replaced(true)) return;
    const before = split ? layer?.numChildren : undefined;
    const result = Reflect.apply(original, this, [position, ...args]);
    if (before !== undefined && typeof layer.getChildAt === 'function') {
      for (let index = before; index < layer.numChildren; index++) {
        const effect = layer.getChildAt(index);
        if (effect && DEBUT_ASSET.test(effect.EffectUrl ?? effect.effectUrl)) sides.set(effect, deputy);
      }
    }
    return result;
  });
  function refresh() {
    if (layer !== ui.effectSprite) {
      releaseRender?.();
      layer = ui.effectSprite;
      releaseRender = typeof layer?.render === 'function' ? scope.patch(layer, 'render', original => function (...args) {
        // Laya runs callLater inside Stage.render. Check the seat layer again
        // before it can paint any debut queued in that same frame.
        if (this === layer) clear();
        return Reflect.apply(original, this, args);
      }) : null;
    }
    clear();
  }
  return { refresh, dispose() { releaseRender?.(); releasePlay(); } };
}

export function bindLegacyKillEffects(scope, ui, getParticipant) {
  return scope.patch(ui, 'PlayKillEffect', native => function (caster, victim, ...args) {
    const play = () => Reflect.apply(native, this, [caster, victim, ...args]);
    if (this !== ui) return play();
    const participants = [getParticipant(caster), getParticipant(victim)].flat();
    const choices = participants.filter(choice => choice.applied);
    const portraits = participants.filter(choice => !choice.applied);
    return useLocalSkin(choices, () => {
      // This legacy cutscene uses both participants' skins. Returning zero
      // leaves the independent gameplay and generic kill effects alone.
      if (portraits.some(({ target }) => ownsSkin(target, read(() => target.seat.MaxSkinVO)))) return 0;
      return play();
    });
  });
}

export function clearLegacyKillEffects(ui, target, previousSkin) {
  const index = target?.seat.Index;
  if (index == null || typeof ui.clearKillEffct !== 'function') return;
  const source = read(() => target.seat.MaxSkinVO);
  if (source && !ownsSkin(target, source) && Number(source.skinID) !== Number(previousSkin?.skinID)) return;
  ui.killEffectDict?.forEach?.((key, effect) => {
    const [caster, victim] = typeof key === 'string' ? key.split('_') : [];
    if (!effect || (caster !== String(index) && victim !== String(index))) return;
    ui.clearKillEffct(key);
    // A retired limited-skin load retains this record until its request
    // finishes, and only creates a sprite while killEffect1 is absent.
    effect.killEffect1 = true;
  });
}

const avatarTransitions = new WeakMap();

export function bindAvatarSkinTransition(scope, avatar, isActive, refresh) {
  let state = avatarTransitions.get(avatar);
  if (!state) {
    const users = new Map();
    const active = () => [...users.keys()].some(check => check());
    const releases = [];
    releases.push(scope.patch(avatar, 'SetSkin', native => function (...args) {
      if (this !== avatar || !active()) return Reflect.apply(native, this, args);
      // Ignore native entry and form-transition requests while a local
      // selection owns the portrait. The idle animation is rendered directly.
      args[5] = args[6] = false;
      const result = Reflect.apply(native, this, args);
      for (const [check, repaint] of users) if (repaint && check()) repaint();
      return result;
    }));
    if (typeof avatar.loadSkinComplete === 'function' && 'needShowChangeAni' in avatar) {
      releases.push(scope.patch(avatar, 'loadSkinComplete', native => function (...args) {
        if (this !== avatar || !active()) return Reflect.apply(native, this, args);
        const animate = avatar.needShowChangeAni;
        avatar.needShowChangeAni = false;
        try { return Reflect.apply(native, this, args); }
        finally { avatar.needShowChangeAni = animate; }
      }));
    }
    if (typeof avatar.playEffect === 'function') {
      releases.push(scope.patch(avatar, 'playEffect', native => function (...args) {
        if (this !== avatar || !active()) return Reflect.apply(native, this, args);
        // A loader can still use the callback captured before the local swap.
        avatar.clearTempStaticSkin?.();
        avatar.onEffectComplete?.();
      }));
    }
    state = { users, releases };
    avatarTransitions.set(avatar, state);
  }
  state.users.set(isActive, refresh);
  if (avatar.changSkinEffect || avatar.tempStaticSkin) {
    avatar.clearMaskTween?.();
    avatar.clearTempStaticSkin?.();
    avatar.clearEffect?.();
  }
  return scope.add(() => {
    state.users.delete(isActive);
    if (state.users.size) return;
    avatarTransitions.delete(avatar);
    for (const release of state.releases.reverse()) release();
  });
}

export function bindPortraitAvatar(scope, { avatar, x }, original, isActive, refresh) {
  const releaseSkeleton = typeof avatar.ShowSkeleton === 'function' ? scope.patch(avatar, 'ShowSkeleton', native => function (...args) {
    const result = Reflect.apply(native, this, args);
    if (this === avatar && isActive()) refresh();
    return result;
  }) : null;
  const releaseChange = bindAvatarSkinTransition(scope, avatar, isActive, refresh);
  const spine = avatar.skinBigSps;
  const role = spine?.SpineRole;
  if (role && (role.getCrtNameOrIndex?.() === 'ChuChang' ||
      (spine.JuexingState > 0 && spine.JuexingState !== original.form))) {
    // Replacing the native spine also removes pending entry labels and the
    // listener that waits for a form transition to finish.
    read(() => avatar.SetSkin(original.id, x ?? avatar.x, '', 0, original.form, false, false));
  }
  return () => { releaseChange(); releaseSkeleton?.(); };
}

export function clearOriginalRoundEntrance(ui, replaced) {
  const seat = ui.Seat ?? ui.seat;
  const source = read(() => ui.maxSeatSkinVO) ?? read(() => seat.MaxSkinVO);
  const textureUrl = ui.skinTexture?.url;
  const specialUrl = ui.spSkinRoundEffect?.EffectUrl ?? ui.spSkinRoundEffect?.effectUrl;
  for (const deputy of [false, true]) {
    if (!replaced(deputy)) continue;
    const general = deputy ? seat?.General2 : seat?.General;
    const avatar = deputy ? ui.seatAvatarFu ?? ui.fuSeatUI?.seatAvatar : ui.seatAvatar;
    const skin = avatar?.skinBaseVO;
    const tip = read(() => skin.SkinUrlInTip), special = read(() => skin.ShowEffectUrl);
    if (ownsSkin({ seat, general, deputy }, source) || (tip && textureUrl && sameArt(textureUrl, tip)) ||
        (special && specialUrl && sameArt(specialUrl, special))) {
      ui.clearSkinRoundEffect?.();
      return;
    }
  }
}

export function clearSkinEffects(ui, portraitTarget, previousSkin = portraitTarget.avatar.skinBaseVO) {
  const seat = ui.Seat ?? ui.seat;
  const roundSkin = read(() => ui.maxSeatSkinVO) ?? read(() => seat.MaxSkinVO);
  if (ownsSkin(portraitTarget, roundSkin) ||
      (roundSkin && Number(roundSkin.skinID) === Number(previousSkin?.skinID))) {
    ui.clearSkinRoundEffect?.();
  }
  if (!portraitTarget.deputy) {
    if ('needPlayChange' in ui) ui.needPlayChange = false;
    if (ui.playingNewSpEffect || ui.newFullScreenEffect) ui.interruptPlayingNewSpEffect?.(false);
    if (ui.outAvatarEffect) ui.clearOutAvatarAni?.();
    if (ui.animDdzGongJi || ui.ddzGongJiImgUrl) ui.ddzGongJiAnimStopped?.();
  }
  // Awakening/limited-skill effects use the skill owner's skin, which can be
  // either general. Associate an in-flight load with that skin's portrait URL.
  if (ui.skinSkillGeneralUrl && ui.skinSkillGeneralUrl === read(() => previousSkin.GetSkinSkillGeneralUrl())) {
    ui.skinSkillAnimStopped?.();
  }
}
