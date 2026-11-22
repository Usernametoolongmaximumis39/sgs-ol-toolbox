import { read } from './native-model.js';
import { readInventory } from './model.js';
import { resolveSkinManager, resolveSkinRuntime, SKIN_CONFIG } from './runtime.js';
import { bindPortraitAvatar, bindAvatarSkinTransition, bindSkinPresentation, bindLegacyKillEffects,
  bindSkinDebut, clearOriginalRoundEntrance, clearSkinEffects, clearLegacyKillEffects } from './local-presentation.js';
import { indexFormSkills, indexOfficialFormRules, isRepeatingSkinRule, localSkinForm, skinFormInfo } from './local-forms.js';
import { createSkinPreviews } from './local-preview.js';
import { configuredCardSkills, createCrossVoice, isBindableVoice, loadCardSkills, normalizeMobileVoiceOptions,
  playCrossCard, playCrossDeath, playCrossVoice, voiceBindingsForForm, voiceClipKey } from './cross-voice.js';
import { createMobileMvpVoice } from './mobile-mvp-voice.js';
import { loadYjcmWindow } from './yjcm.js';
import { fitYjcmMotion, playYjcmSeatMotion, yjcmSeatTransform } from './yjcm-motion.js';
import { createSeatIdleRate } from './seat-idle-rate.js';
import { allowsSkinEffects, createYjcmEffects, normalizeYjcmEffectBindings, resolveYjcmEffect, skinEffectVolume, yjcmBattleEvents } from './yjcm-effects.js';
import { createYjcmCatalogue } from './yjcm-catalogue.js';
import { createMobileCatalogue, loadMobileAudio, loadMobileMotion, loadMobilePreview, resizeMobileArtwork } from './mobile-skins.js';
import { mobileBattleViewport } from './mobile-effects.js';
import { mobileSeatLayout } from './mobile-portrait-layout.js';
import { createPortraitCache } from './portrait-cache.js';
import { createSeatFormButton } from './seat-form-button.js';
import { createSeatNameToggle } from './seat-name.js';
import { createChatRowToggle } from './chat-row.js';
import { CARD_SKILL_DETAILS, createFormProgress, defaultCrossFormRules, nativeConversionUpdate, normalizeFormRule } from './form-rules.js';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const portraitLayers = ['skinTex', 'skinBigSps', 'spineSkeleon', 'skeleton', 'skeletonBg', 'skeletonTop', 'tempStaticSkin'];
const portraitName = 'sgs-local-skin-portrait';
const hiddenPortraitLayers = new WeakMap();
const setting = (ctx, key) => ctx.settings.get(key, false) === true;
const seatAvatar = (ui, deputy) => deputy ? ui.seatAvatarFu ?? ui.fuSeatUI?.seatAvatar : ui.seatAvatar;
const isCrossSkin = kind => kind === 'cross' || kind === 'mobile';
const crossSkinKind = entry => entry.source === 'mobile' ? 'mobile' : 'cross';
async function loadCrossWindow(win, entry, signal) {
  if (entry.source !== 'mobile') return loadYjcmWindow(win, entry, signal);
  const image = await loadMobilePreview(win, entry, signal);
  if (image) return resizeMobileArtwork(win.document, image);
}

function seatArtwork(win, entry, image) {
  if (entry.source !== 'mobile') return { image };
  const { top, hasArtworkAbove } = mobileSeatLayout(win.document, image, entry.nativePortrait);
  const artwork = resizeMobileArtwork(win.document, image);
  const seatTop = top ? top * (artwork.naturalHeight ?? artwork.height) / image.naturalHeight : 0;
  return { image: artwork, seatTop, hasArtworkAbove };
}

function currentSkin(target) {
  const { general } = target;
  return { id: Number(general.SkinId ?? general.SkinItemId) || 0, dynamic: general.IsDynamic === true,
    form: Number(general.DySkinType) || 1 };
}

function sameSkin(left, right) {
  return left.id === right.id && left.dynamic === right.dynamic && left.form === right.form;
}

function animationLayer(avatar) {
  return avatar.skinBigSps || avatar.spineSkeleon || avatar.skeleton;
}

export function createLocalSkins(ctx) {
  const choices = new Map(), imports = new Map(), pending = new Map(), rememberedAttempts = new Map();
  const yjcm = createYjcmCatalogue(ctx);
  const mobile = createMobileCatalogue(ctx);
  const catalogueFor = kind => kind === 'mobile' ? mobile : yjcm;
  const artworkCache = createPortraitCache(ctx.window, ctx.scope);
  const seatIdleRate = createSeatIdleRate(ctx.window, ctx.scope);
  const updateSeatFormButton = createSeatFormButton(ctx);
  const updateSeatName = createSeatNameToggle(ctx);
  const updateChatRow = createChatRowToggle(ctx);
  const selfVoiceHistory = new Map();
  const presentations = new Map();
  const killPresentations = new Map();
  const debutPresentations = new Map();
  const renderingSkins = new WeakSet();
  const formObservers = new Map();
  const formData = { skills: null, classicRows: null, rules: null };
  const formSources = new Map(), requestedFormSources = new Map();
  let scene, inGame, lastAutoDynamic, owner = '', seatPreview;
  let optimizedChoices = [], automaticCollapse;
  let entryStage, releaseEntry, entryLayer, releaseEntryLayer, lastEntry, lobbyPreload;
  const nextCatalogueRetry = new Map();
  const canRestore = kind => catalogueFor(kind).current || Date.now() >= (nextCatalogueRetry.get(kind) ?? 0);
  let failedAnimations = new WeakMap();
  let formUses = new WeakMap(), useOrder = 0;
  const refreshPreviews = createSkinPreviews(ctx.scope, ctx.window, () =>
    scene === ctx.game.getScene?.() && ctx.game.isInGame?.());
  function updatePreviews() {
    refreshPreviews([...choices.values()].filter(choice => choice.portrait ||
      (choice.option && choice.original.id !== choice.applied.id)));
  }
  function updateFormButton() {
    updateSeatFormButton([...choices.values()].filter(choice => choice.formControl));
  }
  async function loadPortraitPreview(choice, laya, loadPreview) {
    const controller = choice.previewRequest = new ctx.window.AbortController();
    const { signal } = controller;
    const { target } = choice;
    try {
      const image = await loadPreview(signal);
      if (!image || signal.aborted || choices.get(target.key) !== choice || !isCurrent(target, allowsPortrait(target))) return;
      choice.preview = createImageTexture(laya, image);
      updatePreviews();
    } catch {
      // Keep the native tooltip while the official window art is unavailable.
    } finally {
      if (choice.previewRequest === controller) choice.previewRequest = null;
    }
  }
  function targets() {
    if (!ctx.game.isInGame?.()) return [];
    const self = ctx.game.getSelfSeatUI?.();
    return (ctx.game.getSeatUIs?.() || []).flatMap((ui, index) => {
      const seat = ui.Seat ?? ui.seat;
      if (!seat || seat.IsFull === false || seat.IsNameless || seat.destroyed) return [];
      const isSelf = seat.IsSelf === true || ui === self;
      const results = [];
      for (const deputy of [false, true]) {
        const general = deputy ? seat.General2 : seat.General;
        const id = Number(deputy ? seat.General2Id : seat.GeneralId);
        // A face-down general has no public name or skin selection.
        if (!general || general.IsShibing || !Number.isSafeInteger(id) || id <= 0 || id === 65535) continue;
        if (typeof seat.IsFaceUp === 'function' && seat.IsFaceUp(deputy ? 1 : 0) !== true) continue;
        const avatar = seatAvatar(ui, deputy);
        if (!avatar || avatar.destroyed || avatar.generalCard !== general || typeof avatar.SetSkin !== 'function') continue;
        const key = (seat.Index ?? index) + ':' + Number(deputy);
        const name = general.CardName || general.Name || general.GeneralName || general.generalName || `武将 ${id}`;
        const label = `${isSelf ? '自己' : `${seat.FixedViewId || index + 1} 号位`} · ${deputy ? '副将 · ' : ''}${name}`;
        results.push({ key, ui, seat, general, id, name, label, isSelf, deputy, avatar, x: ui.seatX });
      }
      return results;
    });
  }

  function allows(target) {
    return setting(ctx, target.isSelf ? 'unlockSkin' : 'otherPlayers');
  }
  function allowsPortrait(target) {
    return setting(ctx, 'crossServer') && (target.isSelf || setting(ctx, 'otherPlayers'));
  }
  const memoryKey = (id, accountId = owner) => 'localSkin.' + accountId + '.' + id;
  const remembered = id => owner && ctx.settings.get(memoryKey(id), null);
  function ruleKey(general, kind, skin, accountId = ctx.native.account().id) {
    return accountId && `formRule.${accountId}.${general}.${kind}.${skin}`;
  }
  function formRule(general, kind, skin, count = 2, transitions) {
    const key = ruleKey(general, kind, skin);
    return key ? normalizeFormRule(ctx.settings.get(key, null), count, transitions, { customTransitions: kind === 'mobile' }) : null;
  }
  function saveFormRule(general, kind, skin, config) {
    const key = ruleKey(general, kind, skin);
    if (key && (config || ctx.settings.get(key, null))) ctx.settings.set(key, config);
  }
  function effectBindingKey(general, entry, accountId = ctx.native.account().id) {
    if (!accountId || !Number.isSafeInteger(general) || general < 1 || !entry) return;
    const id = entry.id;
    const suffix = crossSkinKind(entry) === 'mobile' ?
      (/^cloud-(?:char-)?[1-9]\d*(?:#[1-9]\d*)?$/.test(id) ? 'mobile.' + id : undefined) :
      (Number.isSafeInteger(id) && id > 0 ? id : undefined);
    if (suffix) return `effectBindings.${accountId}.${general}.${suffix}`;
  }
  function effectBindings(recipient, entry) {
    const key = effectBindingKey(recipient?.id, entry);
    if (!key) return {};
    const forms = entry.source === 'mobile' ? mobile.current?.skinForms(entry) : undefined;
    const config = normalizeYjcmEffectBindings(ctx.settings.get(key, null), forms?.length);
    // These variants had separate settings when they each occupied slot 1.
    if (entry.mobileFamily && entry.number !== entry.mobileFamily && config[1]) {
      const index = forms?.indexOf(entry) ?? -1;
      if (index >= 0) return { [index + 1]: config[1] };
    }
    return config;
  }
  function saveEffectBindings(general, entry, config, accountId) {
    const key = effectBindingKey(general, entry, accountId);
    if (!key || config === undefined) return;
    const previous = ctx.settings.get(key, null) ?? null;
    const next = Object.keys(config).length ? config : null;
    if (JSON.stringify(previous) !== JSON.stringify(next)) ctx.settings.set(key, next);
  }
  function save(id, selection, accountId = owner) {
    if (!accountId) return;
    const key = memoryKey(id, accountId);
    if (ctx.settings.get(key, null) !== selection) ctx.settings.set(key, selection);
  }
  function portraitSelection(kind, entry, bindings, startingForm, voiceOptions) {
    return { kind, id: entry.id, general: entry.general, bindings, ...(startingForm !== undefined && { form: startingForm }),
      ...(kind === 'mobile' && { voiceOptions: normalizeMobileVoiceOptions(voiceOptions) }) };
  }
  function rememberYjcm(id, entry, bindings, config, effectConfig, startingForm, voiceOptions) {
    const accountId = ctx.native.account().id;
    if (!accountId) throw new Error('登录后可保存到下次对局。');
    const kind = crossSkinKind(entry);
    save(id, portraitSelection(kind, entry, bindings, startingForm, voiceOptions), accountId);
    const catalogue = catalogueFor(kind).current;
    const forms = catalogue?.skinForms(entry), transitions = catalogue?.skinTransitions?.(entry);
    const count = forms?.length;
    if (effectConfig !== undefined) {
      saveEffectBindings(id, entry, normalizeYjcmEffectBindings(effectConfig, kind === 'mobile' ? count : undefined), accountId);
    }
    if (count > 1) {
      const ruleId = forms[0].id;
      const rule = config === undefined ? formRule(id, kind, ruleId, count, transitions) :
        normalizeFormRule(config, count, transitions, { customTransitions: kind === 'mobile' });
      saveFormRule(id, kind, ruleId, rule);
    }
    if (!setting(ctx, 'crossServer') || artworkCache.get(entry)) return;
    lobbyPreload?.abort();
    const controller = lobbyPreload = new ctx.window.AbortController();
    void artworkCache.load(entry, controller.signal).catch(() => {}).finally(() => {
      if (lobbyPreload === controller) lobbyPreload = null;
    });
  }
  function cancelRemembered(target) {
    imports.delete(target.key);
    const previous = rememberedAttempts.get(target.key);
    previous?.controller?.abort();
    releaseCover(previous);
    rememberedAttempts.set(target.key, { target, manual: true });
  }
  function releaseCover(attempt) {
    if (!attempt?.cover) return;
    attempt.releaseAvatar?.();
    attempt.cover.dispose();
    attempt.cover = null;
    updatePresentation(attempt.target);
  }
  function catalogue(manager, target) {
    const items = read(() => manager.GetOnlineSKinList(target.id));
    return Array.isArray(items) ? items : [];
  }
  function supportsDynamic(target, id) {
    const skinId = id || read(() => target.avatar.defaultDynamicSkinId());
    if (!skinId) return false;
    const current = target.avatar.skinBaseVO;
    if (Number(current?.skinID) === skinId) return Boolean(read(() => current.SeatAnimateUrl));
    const manager = resolveSkinManager(ctx.game);
    const vo = read(() => manager.GetGeneralSkinBySkinID(skinId)) ??
      catalogue(manager, target).find(entry => Number(entry?.skinID) === skinId);
    return Boolean(read(() => vo.SeatAnimateUrl));
  }
  function officialForms(vo) {
    const forms = skinFormInfo(vo);
    return forms?.count === 2 && !forms.rule ? formData.rules?.get(Number(vo.skinID)) ?? forms : forms;
  }
  function options(target) {
    if (!allows(target)) return [];
    const runtime = target.isSelf ? resolveSkinRuntime(ctx.game) : null;
    const manager = runtime?.skinManager ?? resolveSkinManager(ctx.game);
    const results = new Map([[0, { id: 0, name: '经典形象', owned: true, dynamic: supportsDynamic(target, 0) }]]);
    for (const vo of catalogue(manager, target)) {
      const id = Number(vo?.skinID);
      if (!Number.isSafeInteger(id) || id <= 0 || results.has(id)) continue;
      const owned = runtime?.ready ? readInventory(read(() => manager.GetSkinListBySkinID(id))).owned : null;
      results.set(id, { id, name: vo.skinname || `皮肤 ${id}`, owned,
        dynamic: Boolean(read(() => vo.SeatAnimateUrl)), forms: officialForms(vo) });
    }
    return [...results.values()];
  }
  function matchesTarget(left, right) {
    return left && right && left.ui === right.ui && left.seat === right.seat && left.general === right.general &&
      left.id === right.id && left.isSelf === right.isSelf && left.avatar === right.avatar;
  }
  function isCurrent(target, enabled = allows(target)) {
    const { ui, seat, avatar, general, deputy, id } = target;
    return !ctx.scope.signal.aborted && enabled && scene === ctx.game.getScene?.() && ctx.game.isInGame?.() &&
      !ui.destroyed && !seat.destroyed && (ui.Seat ?? ui.seat) === seat &&
      !avatar.destroyed && seatAvatar(ui, deputy) === avatar && avatar.generalCard === general &&
      (deputy ? seat.General2 : seat.General) === general && Number(deputy ? seat.General2Id : seat.GeneralId) === id &&
      (typeof seat.IsFaceUp !== 'function' || seat.IsFaceUp(Number(deputy)) === true);
  }
  const changedNative = choice => choice.option && !sameSkin(choice.original, choice.applied);
  const currentNative = choice => changedNative(choice) && isCurrent(choice.target) &&
    choice.target.avatar.skinItemID === choice.applied.id && sameSkin(currentSkin(choice.target), choice.original);
  const currentPortrait = ({ target }) => isCurrent(target, allowsPortrait(target));
  function entranceReplacement(ui, deputy) {
    const seat = ui.Seat ?? ui.seat;
    if (!seat || seat.IsFull === false || seat.IsNameless || seat.destroyed) return;
    const general = deputy ? seat.General2 : seat.General;
    const id = Number(deputy ? seat.General2Id : seat.GeneralId);
    if (!general || general.IsShibing || !Number.isSafeInteger(id) || id <= 0 || id === 65535 ||
        (typeof seat.IsFaceUp === 'function' && !seat.IsFaceUp(Number(deputy)))) return;
    const matches = ({ target }) => target.ui === ui && target.seat === seat && target.general === general && target.deputy === deputy;
    const choice = [...choices.values()].find(matches);
    if (choice?.portrait && currentPortrait(choice)) return 'cross';
    if (choice && currentNative(choice)) return 'native';
    const attempt = [...rememberedAttempts.values()].find(matches);
    if (attempt) return attempt.cover && allowsPortrait(attempt.target) ? 'cross' : undefined;
    if (!owner || !(seat.IsSelf === true || ui === ctx.game.getSelfSeatUI?.())) return;
    const selection = remembered(id);
    if (isCrossSkin(selection?.kind) && setting(ctx, 'crossServer') && canRestore(selection.kind)) return 'cross';
    if (selection?.kind === 'native' && setting(ctx, 'unlockSkin') && selection.id !== currentSkin({ general }).id) return 'pending-native';
  }
  function clearWaitingRoundEntrance(ui) {
    if (!ui || (!ui.skinRoundEffect && !ui.spSkinRoundEffect && !ui.skinRoundEffectList?.length)) return;
    clearOriginalRoundEntrance(ui, deputy => {
      const kind = entranceReplacement(ui, deputy);
      return kind === 'cross' || kind === 'pending-native';
    });
  }
  function updateDebutPresentation(ui) {
    const previous = debutPresentations.get(ui);
    const replaced = deputy => entranceReplacement(ui, deputy);
    if (!ui.destroyed && (replaced(false) || replaced(true))) {
      clearWaitingRoundEntrance(ui);
      if (!previous && typeof ui.PlayDebutEffect !== 'function') return;
      const binding = previous ?? bindSkinDebut(ctx.scope, ui, replaced, () =>
        (ui.Seat ?? ui.seat)?.IsSelf && read(() => ctx.game.getClass('GameContext')?.IsCountryWar) === true);
      debutPresentations.set(ui, binding);
      binding.refresh();
    } else if (previous) {
      previous.dispose();
      debutPresentations.delete(ui);
    }
  }
  function killParticipants(index) {
    if (index == null) return [];
    return [...choices.values(), ...rememberedAttempts.values()].filter(choice => choice.target.seat.Index === index &&
      (choice.portrait || choice.cover ? currentPortrait(choice) : currentNative(choice)));
  }
  function updateKillPresentations() {
    const current = new Set(presentations.size ? ctx.game.getSeatUIs?.() ?? [] : []);
    for (const [ui, release] of killPresentations) {
      if (current.has(ui) && !ui.destroyed) continue;
      release();
      killPresentations.delete(ui);
    }
    for (const ui of current) {
      if (!ui.destroyed && !killPresentations.has(ui) && typeof ui.PlayKillEffect === 'function') {
        killPresentations.set(ui, bindLegacyKillEffects(ctx.scope, ui, killParticipants));
      }
    }
  }
  function clearPresentationEffects(target, previousSkin) {
    read(() => clearSkinEffects(target.ui, target, previousSkin));
    for (const ui of ctx.game.getSeatUIs?.() ?? []) read(() => clearLegacyKillEffects(ui, target, previousSkin));
  }
  function updatePresentation({ ui, seat }) {
    const selected = () => [...choices.values()].filter(choice => choice.target.ui === ui && choice.target.seat === seat);
    const covered = () => [...rememberedAttempts.values()].filter(({ target, cover }) => cover && target.ui === ui && target.seat === seat);
    const portraits = () => [...selected().filter(choice => choice.portrait), ...covered()].filter(currentPortrait);
    const findVoice = general => portraits().find(({ target, voice }) => voice && target.general === general);
    const cardVoice = (name, event) => {
      const owner = Number(event?.GeneralID);
      const candidates = portraits();
      if (owner > 0) return candidates.find(({ target }) => target.id === owner)?.voice?.card?.(name);
      return candidates.find(({ target }) => !target.deputy)?.voice?.card?.(name) ??
        candidates.find(({ target }) => target.deputy)?.voice?.card?.(name);
    };
    const previous = presentations.get(ui);
    if (!covered().length && !selected().some(choice => choice.portrait || changedNative(choice))) {
      previous?.dispose();
      presentations.delete(ui);
    } else if (previous) previous.refreshEvents();
    else presentations.set(ui, bindSkinPresentation(ctx.scope, ui, seat, () => selected().filter(currentNative), portraits, {
      skillVoice: (play, args, damage) => damage || args[1] !== 'card' || args[0]?.IsGeneral !== false ?
        playCrossVoice(seat, findVoice, play, args, damage) : playCrossCard(seat, cardVoice, play, args),
      deathVoice: (play, args) => playCrossDeath(seat, findVoice, play, args),
      ...yjcmBattleEvents(ctx, seat, portraits),
    }));
    updateKillPresentations();
    updateDebutPresentation(ui);
  }
  function usesFor(target) {
    const record = formUses.get(target.general);
    return record?.id === target.id && record.seat === target.seat ? record.uses : undefined;
  }
  const refreshMvpVoice = createMobileMvpVoice(ctx, (seat, general) => {
    if (scene !== ctx.game.getScene?.() || owner !== ctx.native.account().id) return;
    return [...choices.values()].find(choice => {
      const { target, voice } = choice;
      return voice?.victory && Number(target.seat.Index) === seat && target.id === general && currentPortrait(choice);
    })?.voice.victory;
  });
  function formProgress(target, config, options) {
    let cardSkillIds, conversionSkillIds;
    const getCardSkillIds = () => {
      if (cardSkillIds) return cardSkillIds;
      const skills = read(() => configuredCardSkills(ctx, target.id));
      if (skills) cardSkillIds = new Set(skills.map(skill => skill.id));
      return cardSkillIds;
    };
    const getConversionSkillIds = () => {
      if (conversionSkillIds) return conversionSkillIds;
      const skills = read(() => configuredCardSkills(ctx, target.id, CARD_SKILL_DETAILS));
      if (skills) conversionSkillIds = new Set(skills.filter(skill => skill.conversion).map(skill => skill.id));
      return conversionSkillIds;
    };
    if (config?.rules?.some(rule => rule.skills) && !getCardSkillIds()) {
      void loadCardSkills(ctx, target.id).catch(() => {});
    } else if (config?.rules?.some(rule => rule.kind === 'conversion') && !getConversionSkillIds()) {
      void loadCardSkills(ctx, target.id, CARD_SKILL_DETAILS).catch(() => {});
    }
    return createFormProgress({ target, config, getCardSkillIds, getConversionSkillIds,
      getSkillCount: skill => usesFor(target)?.get(skill)?.cardCount ?? 0, ...options });
  }
  function refreshFormData() {
    for (const [name, key, parse] of [
      ['cha_spell', 'skills', indexFormSkills],
      [SKIN_CONFIG, 'classicRows', config => config?.generalskin?.specialgeneral ?? null],
    ]) {
      if (formData[key]) continue;
      const accept = config => {
        if (ctx.scope.signal.aborted || !config || formSources.get(name) === config) return;
        formSources.set(name, config);
        formData[key] = parse(config);
        if (name === SKIN_CONFIG) formData.rules = indexOfficialFormRules(config);
      };
      accept(read(() => ctx.game.getConfigData(name)));
      if (!formData[key] && (!requestedFormSources.has(name) || requestedFormSources.get(name) !== scene) &&
          typeof ctx.game.loadConfigData === 'function') {
        requestedFormSources.set(name, scene);
        Promise.resolve().then(() => ctx.scope.signal.aborted ? null : ctx.game.loadConfigData(name)).then(accept).catch(() => {});
      }
    }
  }
  function updateFormObservers(current) {
    const bySeat = new Map();
    for (const target of current) {
      if (!allows(target) && !allowsPortrait(target)) continue;
      if (!bySeat.has(target.seat)) bySeat.set(target.seat, []);
      bySeat.get(target.seat).push(target);
    }
    for (const [seat, observer] of formObservers) {
      if (bySeat.has(seat)) continue;
      observer.dispose();
      formObservers.delete(seat);
    }
    for (const [seat, visibleTargets] of bySeat) {
      const existing = formObservers.get(seat);
      if (existing) { existing.targets = visibleTargets; continue; }
      const observer = { targets: visibleTargets };
      const release = [];
      if (typeof seat.OnChangeOriSkinBySkill === 'function') {
        release.push(ctx.scope.patch(seat, 'OnChangeOriSkinBySkill', original => function (...args) {
          const result = Reflect.apply(original, this, args);
          const generalId = Number(args[0]), skill = Number(args[1]);
          if (this === seat && Number.isSafeInteger(skill) && skill > 0) {
            // The client calls this after processing a confirmed skill use.
            const resolveOwner = () => read(() => seat.GetGeneralBySkillId(skill)) ??
              read(() => seat.GetGeneralBySkillIdOnlyId(skill));
            const owner = generalId > 0 ? null : resolveOwner();
            const targets = observer.targets.filter(target => isCurrent(target, allows(target) || allowsPortrait(target)));
            let matches = targets.filter(target =>
              (generalId > 0 ? target.id === generalId : target.general === owner));
            let cardMatch = matches.length === 1;
            if (!matches.length && generalId > 0 && typeof seat.inSkinGeneralId === 'function') {
              matches = targets.filter(target => read(() => seat.inSkinGeneralId(target.id, generalId)) === true);
              cardMatch = matches.length === 1 && matches[0].general === resolveOwner();
            }
            if (matches.length === 1) {
              const [target] = matches;
              const uses = usesFor(target) ?? new Map();
              if (!uses.has(skill) && uses.size >= 512) return result;
              const prior = uses.get(skill);
              uses.set(skill, { count: (prior?.count ?? 0) + 1, order: ++useOrder,
                cardCount: (prior?.cardCount ?? 0) + Number(cardMatch) });
              formUses.set(target.general, { seat, id: target.id, uses });
              const choice = choices.get(target.key);
              if (!matchesTarget(choice?.target, target)) return result;
              const event = cardMatch ? { skill } : undefined;
              if (choice.portrait && choice.progress && allowsPortrait(target)) syncPortraitForm(choice, event);
              else if (choice.option?.forms && allows(target)) syncSelectedSkin(target, choice, event);
            }
          }
          return result;
        }));
      }
      if (typeof seat.on === 'function' && typeof seat.off === 'function') {
        const update = event => {
          for (const target of observer.targets) {
            const choice = choices.get(target.key);
            if (!matchesTarget(choice?.target, target) || (event && !choice.progress?.hasConversion)) continue;
            if (choice.portrait && choice.progress && isCurrent(target, allowsPortrait(target))) syncPortraitForm(choice, event);
            else if (choice.option?.forms && isCurrent(target)) syncSelectedSkin(target, choice, event);
          }
        };
        const watch = (event, handler) => {
          seat.on(event, observer, handler);
          release.push(ctx.scope.add(() => seat.off(event, observer, handler)));
        };
        watch('GENERAL_HP_CHANGED', () => update());
        watch('GENERAL_SKIN_CHANGED', () => update());
        watch('SKILL_CHANGE', () => {
          for (const target of observer.targets) {
            const choice = choices.get(target.key);
            if (choice?.progress?.hasConversion && matchesTarget(choice.target, target)) choice.progress.rebaseConversion();
          }
        });
        watch('UPDATE_SWITCH_SKILL', () => {
          if (!observer.targets.some(target => choices.get(target.key)?.progress?.hasConversion)) return;
          const conversion = nativeConversionUpdate(seat);
          if (conversion) update({ conversion });
        });
      }
      observer.dispose = () => { for (const off of release) off(); };
      formObservers.set(seat, observer);
    }
  }
  function drawSkin(target, skin) {
    const { avatar, general, x } = target;
    // This avatar method reads and writes the awakening form on generalCard.
    // Give only the renderer a temporary view, never change the seat's model.
    avatar.generalCard = Object.create(general, {
      IsDynamic: { value: skin.dynamic },
      JueXingState: { value: skin.form, writable: true },
    });
    renderingSkins.add(avatar);
    try { avatar.SetSkin(skin.id, x ?? avatar.x, '', 0, skin.form, false, false); }
    finally { renderingSkins.delete(avatar); avatar.generalCard = general; }
  }
  function animationChanged(target, choice) {
    return choice.animation && (animationLayer(target.avatar) !== choice.animation || choice.animation.destroyed);
  }
  function applySkin(target, original, applied, option = null, choice = {}) {
    const previous = choices.get(target.key);
    const previousSkin = target.avatar.skinBaseVO ?? null;
    const releaseTransition = option && !choice.releaseTransition
      ? bindAvatarSkinTransition(ctx.scope, target.avatar, () => renderingSkins.has(target.avatar) ||
        (choices.get(target.key) === choice && !sameSkin(choice.original, choice.applied) && isCurrent(target)))
      : null;
    try {
      drawSkin(target, applied);
      if (target.avatar.skinItemID !== applied.id) throw new Error('当前模式未应用这款本地皮肤。');
    } catch (error) {
      if (previous && !previous.portrait) {
        read(() => drawSkin(target, previous.applied));
        previous.animation = previous.applied.dynamic ? animationLayer(target.avatar) : null;
      } else read(() => drawSkin(target, original));
      releaseTransition?.();
      throw error;
    }
    if (releaseTransition) choice.releaseTransition = releaseTransition;
    if ((option || previous?.option) && !sameSkin(previous?.applied ?? original, applied)) {
      clearPresentationEffects(target, previousSkin);
    }
    imports.delete(target.key);
    const multiForm = applied.id > 0 && Number(target.avatar.skinBaseVO?.skinID) === applied.id &&
      Boolean(read(() => target.avatar.skinBaseVO.IsManyStateDyskin));
    Object.assign(choice, { target, original, applied, option, multiForm, animation: applied.dynamic ? animationLayer(target.avatar) : null });
    choices.set(target.key, choice);
    updatePreviews();
    if (previous?.portrait) disposePortrait(previous);
    if (previous !== choice) previous?.releaseTransition?.();
    if (option || previous?.option || previous?.portrait) updatePresentation(target);
    return choice;
  }
  function syncAnimation(target, original, applied, option, transition = false, choice) {
    const failed = failedAnimations.get(target.avatar);
    if (matchesTarget(failed?.target, target) && sameSkin(failed.original, original) && sameSkin(failed.applied, applied)) return;
    try { applySkin(target, original, applied, option, choice); }
    catch (error) {
      failedAnimations.set(target.avatar, { target, original, applied });
      ctx.window.console?.warn('皮肤管理：本地动态切换失败', error);
      return;
    }
    if (transition && applied.dynamic && !target.deputy) read(() => presentations.get(target.ui)?.playFormTransition());
    return true;
  }
  function selectedSkin(target, original, option, autoDynamic, previousForm, progress, event) {
    const same = original.id === option.id;
    const form = progress ? (event?.manual ? progress.current : progress.update(event))
      : localSkinForm(option, original, target, usesFor(target), formData, previousForm);
    return { id: option.id, form,
      dynamic: (same && original.dynamic) || (autoDynamic && option.dynamic) };
  }
  function syncSelectedSkin(target, choice, event) {
    const original = currentSkin(target);
    const rendered = target.avatar.skinItemID;
    if (!allows(target) || original.id !== choice.original.id ||
        (rendered !== choice.applied.id && rendered !== original.id)) {
      restore(target.key, target);
      return;
    }
    const applied = selectedSkin(target, original, choice.option, setting(ctx, 'unlockDynamic'), choice.applied.form, choice.progress, event);
    const formChanged = choice.applied.form !== applied.form;
    const nativeTransition = sameSkin(applied, original) && sameSkin(choice.applied, choice.original);
    const nativeRedraw = choice.progress && rendered === original.id && !sameSkin(choice.original, original);
    if (!nativeTransition && (!sameSkin(choice.applied, applied) || rendered !== applied.id || nativeRedraw || animationChanged(target, choice))) {
      return syncAnimation(target, original, applied, choice.option, formChanged, choice);
    } else if (!sameSkin(choice.original, original)) {
      choice.original = original;
      if (nativeTransition) {
        choice.applied = applied;
        choice.animation = animationLayer(target.avatar);
      }
      updatePresentation(target);
    }
    return true;
  }
  function restore(key, activeTarget) {
    imports.delete(key);
    const choice = choices.get(key);
    if (!choice) return;
    choices.delete(key);
    try {
      updatePreviews();
      if (choice.portrait) disposePortrait(choice);
      else if (matchesTarget(choice.target, activeTarget) && activeTarget.avatar.skinItemID === choice.applied.id &&
          (choice.option || !animationChanged(activeTarget, choice))) {
        const original = currentSkin(activeTarget);
        if (choice.option && !sameSkin(choice.applied, original)) clearPresentationEffects(activeTarget);
        drawSkin(activeTarget, original);
      }
    } finally {
      choice.releaseTransition?.();
      if (choice.option || choice.portrait) updatePresentation(choice.target);
      if (choice.formControl) updateFormButton();
    }
  }
  function refresh() {
    const nextScene = ctx.game.getScene?.();
    const playing = Boolean(ctx.game.isInGame?.());
    const current = targets();
    const byKey = new Map(current.map(target => [target.key, target]));
    const sameScene = scene === nextScene && playing === inGame;
    const nextOwner = ctx.native.account().id;
    const sameOwner = owner === nextOwner;
    if (!sameOwner) {
      selfVoiceHistory.clear();
      nextCatalogueRetry.clear();
    }
    if (!sameOwner || !setting(ctx, 'crossServer')) lobbyPreload?.abort();
    owner = nextOwner;
    scene = nextScene;
    inGame = playing;
    if (seatPreview && (!sameScene || !sameOwner || !matchesTarget(seatPreview.target, byKey.get(seatPreview.target.key)) ||
        !isCurrent(seatPreview.target, allowsPortrait(seatPreview.target)))) seatPreview.release();
    watchEntry();
    for (const [key, attempt] of rememberedAttempts) {
      const enabled = attempt.kind === 'cross' ? allowsPortrait(attempt.target) : allows(attempt.target);
      if (sameScene && sameOwner && matchesTarget(attempt.target, byKey.get(key)) && (attempt.manual || enabled)) {
        attempt.cover?.refresh();
        continue;
      }
      attempt.controller?.abort();
      releaseCover(attempt);
      rememberedAttempts.delete(key);
    }
    if (!sameScene || !sameOwner) {
      seatIdleRate.reset();
      updateFormObservers([]);
      formUses = new WeakMap();
      useOrder = 0;
    }
    updateFormObservers(current);
    if (formObservers.size) refreshFormData();
    if (!sameScene || !sameOwner || !ctx.game.isInGame?.() || !setting(ctx, 'unlockSkin')) pending.clear();
    const autoDynamic = setting(ctx, 'unlockDynamic');
    if (autoDynamic !== lastAutoDynamic || !sameScene) failedAnimations = new WeakMap();
    lastAutoDynamic = autoDynamic;
    for (const [key, choice] of choices) {
      const target = sameScene ? byKey.get(key) : null;
      if (!sameOwner || !matchesTarget(choice.target, target)) {
        restore(key, target);
        continue;
      }
      if (choice.portrait) {
        if (allowsPortrait(target)) {
          choice.portrait.refresh();
          choice.effects?.refresh();
          if (choice.kind === 'mobile' && !allowsSkinEffects(ctx)) choice.portrait.stopMobileEffect();
          if (choice.progress) syncPortraitForm(choice);
        }
        else restore(key, target);
        continue;
      }
      if (choice.option) {
        syncSelectedSkin(target, choice);
        continue;
      }
      if (!sameSkin(currentSkin(target), choice.original) || target.avatar.skinItemID !== choice.applied.id || !autoDynamic) {
        restore(key, target);
        continue;
      }
      if (animationChanged(target, choice)) choices.delete(key);
    }
    for (const target of current) {
      if (!target.isSelf || choices.has(target.key)) continue;
      const original = currentSkin(target);
      const option = pending.get(target.id);
      if (option) {
        if (target.avatar.skinItemID !== original.id) continue;
        pending.delete(target.id);
        try { chooseNative(target, option); }
        catch (error) { ctx.notify?.(error.message); }
        continue;
      }
      const previous = remembered(target.id);
      if (isCrossSkin(previous?.kind) && allowsPortrait(target) && !rememberedAttempts.has(target.key) && !imports.has(target.key) &&
          target.avatar.skinTex && target.avatar.width > 0 && target.avatar.height > 0 &&
          canRestore(previous.kind)) {
        restoreCrossPortrait(target, previous);
        continue;
      }
      if (target.avatar.skinItemID !== original.id) continue;
      if (imports.has(target.key) || rememberedAttempts.get(target.key)?.controller) continue;
      if (previous && !rememberedAttempts.has(target.key)) {
        if (previous.kind === 'native' && allows(target)) {
          const option = options(target).find(entry => entry.id === previous.id);
          if (option) {
            rememberedAttempts.set(target.key, { target, kind: 'native' });
            try { applyNativeChoice(target, original, option, formRule(target.id, 'native', option.id)); }
            catch (error) { ctx.notify?.(error.message); }
            continue;
          }
        }
      }
      if (!autoDynamic || original.dynamic) continue;
      if (!supportsDynamic(target, original.id)) continue;
      syncAnimation(target, original, { ...original, dynamic: true });
    }
    seatPreview?.portrait?.refresh();
    for (const presentation of presentations.values()) presentation.refreshEvents();
    updateKillPresentations();
    const self = ctx.game.getSelfSeatUI?.();
    for (const ui of new Set([...debutPresentations.keys(), ...presentations.keys(), ...(playing && self ? [self] : [])])) {
      if (playing && (ui === self || presentations.has(ui))) updateDebutPresentation(ui);
      else {
        debutPresentations.get(ui)?.dispose();
        debutPresentations.delete(ui);
      }
    }
    updatePreviews();
    updateFormButton();
    updateBattleChrome(playing ? nextScene : null);
    return current;
  }
  function updateBattleChrome(active) {
    const self = active && (ctx.game.getSelfSeatUI?.() ?? active.SelfSeatUi ?? active.selfSeatUI);
    const optimize = self && active === scene && ctx.settings.get('yjcmDynamicOptimization', true) === true;
    const next = optimize ? [...choices.values()].filter(choice =>
      choice.target.isSelf && choice.target.ui === self && choice.portrait?.needsChromeClearance) : [];
    if (next.some(choice => !optimizedChoices.includes(choice))) automaticCollapse = {};
    else if (!next.length) automaticCollapse = undefined;
    optimizedChoices = next;
    updateSeatName(self, active, automaticCollapse);
    updateChatRow(active?.chatViewUI, active, automaticCollapse);
  }
  function refreshBattleChrome() {
    updateBattleChrome(ctx.game.isInGame?.() ? ctx.game.getScene?.() : null);
  }
  function watchEntry() {
    const { window: win, scope } = ctx;
    const stage = (setting(ctx, 'crossServer') || setting(ctx, 'unlockSkin')) && (win.Laya ?? win.laya)?.stage;
    if (entryStage === stage) return;
    releaseEntry?.();
    entryStage = stage;
    lastEntry = null;
    releaseEntry = null;
    if (typeof stage?.render !== 'function') return;
    if (setting(ctx, 'crossServer')) {
      void yjcm.warm();
      void artworkCache.warm();
    }
    let activeWatch = true;
    function beforePaint(active = ctx.game.getScene?.()) {
      const ui = active?.SelfSeatUi ?? active?.selfSeatUI;
      const seat = ui?.Seat ?? ui?.seat;
      const state = [active, seat, owner || ctx.native.account().id, seat?.General, seat?.General2, ui?.effectSprite,
        seat?.IsFaceUp?.(0), seat?.IsFaceUp?.(1), seat?.SkinID, seat?.Skin2ID];
      for (const deputy of [false, true]) {
        const avatar = ui && seatAvatar(ui, deputy);
        state.push(avatar, avatar?.generalCard, avatar?.skinItemID, !!(avatar?.skinTex && avatar.width > 0 && avatar.height > 0));
      }
      if (!lastEntry || !state.every((value, i) => value === lastEntry[i])) {
        lastEntry = state;
        refresh();
      } else clearWaitingRoundEntrance(ui);
    }
    const unpatch = scope.patch(stage, 'render', original => function (...args) {
      if (activeWatch && this === stage && (!entryLayer?.parent || entryLayer.destroyed)) {
        read(() => {
          const active = ctx.game.getScene?.();
          const layer = active?.parent ?? stage.getChildByName?.('SceneLayer');
          if (typeof layer?.render === 'function' && layer !== stage && (layer.name === 'SceneLayer' || layer.layerOrder === 2)) {
            if (layer === entryLayer) return;
            releaseEntryLayer?.();
            entryLayer = layer;
            releaseEntryLayer = scope.patch(layer, 'render', paint => function (...drawArgs) {
              // CallLater runs inside Stage.render, before the scene layer draws.
              if (activeWatch && this === layer) read(beforePaint);
              return Reflect.apply(paint, this, drawArgs);
            });
          } else beforePaint(active);
        });
      }
      return Reflect.apply(original, this, args);
    });
    releaseEntry = () => {
      activeWatch = false;
      releaseEntryLayer?.();
      releaseEntryLayer = entryLayer = null;
      unpatch();
    };
  }
  function restoreCrossPortrait(target, selection) {
    const controller = new ctx.window.AbortController();
    const attempt = { target, kind: 'cross', controller, selectedId: selection.id };
    rememberedAttempts.set(target.key, attempt);
    const source = catalogueFor(selection.kind);
    let catalogue = source.current ?? source.cached;
    const findEntry = () => catalogue?.findSkin(selection.id, selection.general);
    const entry = findEntry();
    if (selection.kind !== 'mobile' && (!entry || !artworkCache.get(entry))) {
      attempt.cover = hidePortraitLayers(target.avatar);
      const active = () => attempt.cover && isCurrent(target, allowsPortrait(target));
      attempt.releaseAvatar = bindPortraitAvatar(ctx.scope, target, currentSkin(target), active, attempt.cover.refresh);
      attempt.cover.refresh();
      updatePresentation(target);
      clearPresentationEffects(target);
    }
    const timer = ctx.window.setTimeout(() => {
      cancelTimeout();
      if (controller.signal.aborted) return;
      controller.abort();
      releaseCover(attempt);
      attempt.controller = null;
      if (isCurrent(target, allowsPortrait(target))) ctx.notify?.('外服皮肤加载超时，已恢复原皮肤。');
    }, selection.kind === 'mobile' ? 60000 : 8000);
    const cancelTimeout = ctx.scope.add(() => ctx.window.clearTimeout(timer));
    async function apply() {
      if (selection.kind === 'mobile') {
        const available = entry ?? await source.resolveSkin(selection.id, selection.general);
        if (!available || controller.signal.aborted) return;
        catalogue = available.download ? source.current : source.legacy;
        await applyYjcm(target, available, selection.bindings ?? {}, controller.signal, undefined, attempt, catalogue,
          undefined, selection.form, selection.voiceOptions);
        return;
      }
      if (!entry && !source.current) {
        await source.warm?.();
        if (controller.signal.aborted) return;
        catalogue = source.current ?? source.cached;
        if (!findEntry()) {
          try { catalogue = await source.load(); }
          catch (error) {
            if (!controller.signal.aborted) {
              nextCatalogueRetry.set(selection.kind, Date.now() + 30000);
              if (rememberedAttempts.get(target.key) === attempt) rememberedAttempts.delete(target.key);
            }
            throw error;
          }
        }
      }
      const available = entry ?? findEntry();
      if (!available || controller.signal.aborted) return;
      const config = selection.id === available.id ? undefined : formRule(target.id, selection.kind, selection.id);
      await applyYjcm(target, available, selection.bindings ?? {}, controller.signal, config, attempt, catalogue);
    }
    void apply().catch(error => {
      if (!controller.signal.aborted) ctx.notify?.(error.message.split('\n', 1)[0]);
    }).finally(() => { cancelTimeout(); releaseCover(attempt); attempt.controller = null; });
  }
  function liveTarget(target) {
    const current = refresh().find(entry => matchesTarget(entry, target));
    if (!current) throw new Error('座位或武将已变化，请重新选择。');
    return current;
  }
  function select(target, id, config = undefined) {
    target = liveTarget(target);
    const option = options(target).find(entry => entry.id === id);
    if (!option) throw new Error('当前皮肤选项不可用。');
    chooseNative(target, option, config);
    return option;
  }
  function applyNativeChoice(target, original, option, config) {
    let progress;
    if (option.forms?.count === 2) {
      const official = previous => localSkinForm(option, currentSkin(target), target, usesFor(target), formData, previous);
      official.repeat = () => isRepeatingSkinRule(option, target, usesFor(target), formData);
      const form = config ? 1 : official(1);
      progress = formProgress(target, config, { form, official });
    }
    const applied = selectedSkin(target, original, option, setting(ctx, 'unlockDynamic'), 1, progress, { initial: true });
    const choice = applySkin(target, original, applied, option, { progress });
    if (progress) {
      choice.formControl = { count: 2, get current() { return choice.applied.form; }, destinations: progress.destinations, advance(signal, to) {
        if (signal.aborted || choices.get(target.key) !== choice || !isCurrent(target)) return;
        progress.advance(to);
        if (!syncSelectedSkin(target, choice, { manual: true })) {
          progress.setForm(choice.applied.form);
          throw new Error('当前座位未能切换皮肤形态。');
        }
      } };
    }
    updateFormButton();
  }
  function chooseNative(target, option, config = formRule(target.id, 'native', option.id)) {
    cancelRemembered(target);
    const original = currentSkin(target);
    config = option.forms?.count === 2 ? normalizeFormRule(config) : null;
    applyNativeChoice(target, original, option, config);
    if (option.forms?.count === 2) saveFormRule(target.id, 'native', option.id, config);
    if (target.isSelf) save(target.id, option.owned === false || option.forms?.count === 2 ? { kind: 'native', id: option.id } : null);
  }
  function selectNative(generalId, option, waitForSeat, config) {
    const current = refresh();
    if (!scene || !ctx.game.isInGame?.() || !setting(ctx, 'unlockSkin')) throw new Error('当前牌局的本地换肤未启用。');
    const target = current.find(entry => entry.isSelf && entry.id === generalId);
    if (!target) {
      if (!waitForSeat) throw new Error('当前武将无法本地换肤。');
      if (option.forms?.count === 2 && config !== undefined) saveFormRule(generalId, 'native', option.id, normalizeFormRule(config));
      pending.set(generalId, option);
      return;
    }
    chooseNative(target, option, config);
  }
  function clearNative(generalId) {
    save(generalId, null, ctx.native.account().id);
    pending.delete(generalId);
    for (const target of refresh()) {
      const choice = choices.get(target.key);
      if (!target.isSelf || target.id !== generalId) continue;
      cancelRemembered(target);
      if (choice?.option || choice?.portrait) restore(target.key, target);
    }
  }
  function hasOwnGeneral(generalId) {
    return targets().some(target => target.isSelf && target.id === generalId);
  }
  function ownPortraitTarget(generalId) {
    return targets().find(target => target.isSelf && target.id === generalId && allowsPortrait(target));
  }
  async function previewYjcm(target, entry, signal) {
    if (signal.aborted || ctx.scope.signal.aborted) return;
    target = liveTarget(target);
    if (!isCurrent(target, allowsPortrait(target))) return;
    seatPreview?.release();
    const controller = new ctx.window.AbortController();
    const accountId = owner;
    const preview = { target, release() {
      if (seatPreview !== preview) return;
      seatPreview = null;
      signal.removeEventListener('abort', preview.release);
      controller.abort();
      preview.portrait?.dispose();
    } };
    seatPreview = preview;
    signal.addEventListener('abort', preview.release, { once: true });
    try {
      const artwork = artworkCache.get(entry) ?? await artworkCache.load(entry, controller.signal);
      if (!artwork || controller.signal.aborted || ctx.native.account().id !== accountId || !isCurrent(target, allowsPortrait(target))) return;
      const { image, ...framing } = seatArtwork(ctx.window, entry, artwork.image);
      preview.portrait = preparePortrait(target, image, {
        trimPadding: !entry.nativePortrait, seatBounds: artwork.seatBounds, preview: true, alignTop: entry.nativePortrait, ...framing,
      });
      preview.portrait.refresh();
      preview.portrait.animate(ctx.window, entry);
      return artwork.image;
    } catch (error) {
      preview.release();
      throw error;
    } finally {
      if (!preview.portrait) preview.release();
    }
  }
  function syncPortraitForm(choice, event) {
    choice.progress.update(event);
    void choice.renderForm();
  }
  async function applyYjcm(target, entry, bindings, signal, config, attempt, catalogue, effectConfig, startingForm, voiceOptions) {
    const kind = crossSkinKind(entry);
    const source = catalogueFor(kind);
    catalogue ??= source.current;
    if (!attempt) {
      target = liveTarget(target);
      cancelRemembered(target);
    }
    const accountId = owner;
    const startScene = scene;
    const request = {};
    const forms = catalogue.skinForms(entry);
    const count = forms.length;
    const initial = kind === 'mobile' ? Math.max(0, forms.findIndex(form =>
      (form.number ?? form.id) === (startingForm ?? entry.number ?? entry.id))) + 1 : 1;
    const initialForm = forms[initial - 1];
    if (!attempt) imports.set(target.key, request);
    let artwork;
    try {
      const preparation = catalogue.prepare?.(entry, bindings);
      if (preparation) await preparation;
      artwork = artworkCache.get(initialForm) ?? await artworkCache.load(initialForm, signal);
      if ((attempt ? rememberedAttempts.get(target.key) !== attempt : imports.get(target.key) !== request) ||
          !artwork || signal.aborted || startScene !== ctx.game.getScene?.() ||
          !isCurrent(target, allowsPortrait(target)) || ctx.native.account().id !== accountId) return;
    } finally { if (imports.get(target.key) === request) imports.delete(target.key); }
    let updatedForms;
    function latestForm(index) {
      if (!source.current || source.current === catalogue) return forms[index];
      if (!updatedForms) {
        const updated = source.current.findSkin(entry.id, entry.general);
        updatedForms = updated ? source.current.skinForms(updated) : [];
      }
      return updatedForms[index] ?? forms[index];
    }
    const primary = forms[0];
    const transitions = catalogue.skinTransitions?.(entry);
    const customTransitions = kind === 'mobile';
    const rulesAvailable = count > 1;
    const rule = !rulesAvailable ? null : config === undefined ?
      formRule(target.id, kind, primary.id, count, transitions) : normalizeFormRule(config, count, transitions, { customTransitions });
    const useDefaultRules = count === 2 && !rule;
    const audio = kind === 'mobile' ? normalizeMobileVoiceOptions(voiceOptions) : {};
    const formVoiceBindings = forms.map((form, index) => voiceBindingsForForm(bindings, form, index + 1));
    const hasBindings = formVoiceBindings.some(config => Object.keys(config).length);
    const needsVoiceSkills = hasBindings || (source.current ?? catalogue).hasVoices(entry) || source.needsRefresh;
    const needsSkillNames = useDefaultRules || needsVoiceSkills || forms.some(form => form.mobileMotion || form.effects?.actions.length);
    const skillOptions = useDefaultRules ? CARD_SKILL_DETAILS : { includeDerived: true };
    let skills = needsSkillNames ? read(() => configuredCardSkills(ctx, target.id, skillOptions)) : null;
    const makeProgress = form => formProgress(target, rule, { count, form, transitions, customTransitions,
      defaultRules: useDefaultRules ? defaultCrossFormRules(skills, target) : undefined });
    let progress = rulesAvailable ? makeProgress(initial) : null;
    const playback = target.isSelf ? selfVoiceHistory.get(target.id) ?? {} : {};
    const voiceFiles = new Map();
    function audible(voice) {
      if (!voice?.load) return voice;
      const clips = voice.urls.flatMap(path => voiceFiles.has(path) ? [[voiceFiles.get(path), voiceClipKey(voice, path)]] : []);
      return { ...voice, urls: clips.map(([url]) => url), clipKeys: new Map(clips) };
    }
    function voiceAt(index) {
      const voiceCatalogue = source.current ?? catalogue;
      const voiceEntry = voiceCatalogue === catalogue ? entry : voiceCatalogue.findSkin(entry.id, entry.general) ?? entry;
      if (!hasBindings && !audio.victory && !voiceCatalogue.hasVoices(voiceEntry)) return null;
      const form = count > 1 ? index : undefined;
      return createCrossVoice(skills ?? [], voiceCatalogue.skinVoices(voiceEntry, form, attempt?.selectedId ?? entry.id).map(audible),
        formVoiceBindings[index - 1], playback, reference => audible(voiceCatalogue.findVoice(reference, form)), audio);
    }
    releaseCover(attempt);
    const { image, ...framing } = seatArtwork(ctx.window, initialForm, artwork.image);
    const choice = installPortrait(target, image, {
      trimPadding: !initialForm.nativePortrait, seatBounds: artwork.seatBounds, alignTop: initialForm.nativePortrait, ...framing, voice: voiceAt(initial),
      loadPreview: signal => loadCrossWindow(ctx.window, initialForm, signal),
    });
    choice.kind = kind;
    choice.selection = portraitSelection(kind, entry, bindings, startingForm, audio);
    if (attempt) choice.selection.id = attempt.selectedId;
    if (audio.victory) refreshMvpVoice();
    const active = () => choices.get(target.key) === choice && ctx.native.account().id === accountId &&
      isCurrent(target, allowsPortrait(target));
    if (entry.download && needsVoiceSkills) {
      const win = ctx.window;
      const controller = new win.AbortController();
      choice.disposeVoice = () => {
        controller.abort();
        for (const url of voiceFiles.values()) win.URL.revokeObjectURL(url);
        voiceFiles.clear();
      };
      const selectedVoices = new Set(formVoiceBindings.flatMap(config =>
        Object.values(config).flatMap(refs => Array.isArray(refs) ? refs : [])));
      const linked = [...selectedVoices].filter(ref => typeof ref === 'string').map(ref => catalogue.findVoice(ref));
      const clips = new Map();
      const formOrder = [initial, ...forms.map((_form, i) => i + 1).filter(form => form !== initial)];
      const localVoices = formOrder.flatMap(form => catalogue.skinVoices(entry, form))
        .filter(voice => voice.kind !== 'unidentified' || selectedVoices.has(voice.id) || voice.aliases?.some(id => selectedVoices.has(id)));
      const extra = voice => voice.kind === 'victory' && audio.victory || voice.kind === 'card' && audio.card;
      for (const voice of [...localVoices.filter(extra), ...localVoices.filter(isBindableVoice), ...linked]) {
        if (voice?.load) for (const path of voice.urls) clips.set(path, voice);
      }
      const queue = clips.entries();
      async function loadVoices() {
        for (const [path, voice] of queue) {
          if (controller.signal.aborted || !active()) return;
          const url = await loadMobileAudio(win, voice, path, controller.signal).catch(() => undefined);
          if (!url) continue;
          if (!active() || controller.signal.aborted) { win.URL.revokeObjectURL(url); return; }
          voiceFiles.set(path, url);
          choice.voice = voiceAt(choice.formControl?.current ?? initial);
        }
      }
      for (let i = 0; i < Math.min(4, clips.size); i++) void loadVoices();
    }
    const effects = choice.effects = kind === 'cross' ? createYjcmEffects(ctx, target, active) : null;
    const activeForm = () => latestForm((choice.formControl?.current ?? initial) - 1);
    const effectSpec = () => kind === 'mobile' ? choice.portrait.mobileEffects() : activeForm().effects;
    const effectRules = effectConfig === undefined ? effectBindings(target, entry) :
      normalizeYjcmEffectBindings(effectConfig, kind === 'mobile' ? count : undefined);
    choice.playYjcmEffect = (kind, skill, name, targets) => {
      const spec = effectSpec();
      const form = choice.formControl?.current ?? initial;
      const skillName = name || skills?.find(item => item.id === skill)?.name;
      const plan = kind === 'enter' || kind === 'transition' ? spec?.[kind] : resolveYjcmEffect(spec, skill, skillName, effectRules, form)?.plan;
      if (effects) return effects.play(spec, plan, kind, choice.portrait, targets);
      if (!plan || !allowsSkinEffects(ctx)) return false;
      const viewport = plan.key === 'mobile:attack' ? mobileBattleViewport(ctx, target.avatar) : undefined;
      return choice.portrait.playMobileEffect(plan, { kind, viewport, volume: () => skinEffectVolume(ctx) });
    };
    function playIdle(form, entering = false) {
      choice.portrait.animate(ctx.window, form, () => {
        if (entering && kind === 'mobile' && active()) choice.playYjcmEffect('enter');
        refreshBattleChrome();
      });
    }
    playIdle(latestForm(initial - 1), true);
    if (kind === 'cross') choice.playYjcmEffect('enter');
    effects?.warm(effectSpec());
    if (source.needsRefresh) void source.load().then(() => {
      if (!active()) return;
      choice.voice = voiceAt(choice.formControl?.current ?? initial);
      playIdle(activeForm());
      effects?.warm(effectSpec());
    }).catch(() => {});
    if (progress) {
      choice.progress = progress;
      const control = choice.formControl = {
        current: initial, count,
        destinations: () => control.current === progress.current ? progress.destinations() : [],
        async advance(signal, to) {
          if (signal.aborted || !active() || control.current !== progress.current) return;
          progress.advance(to);
          await choice.renderForm();
        },
      };
      let requested;
      choice.renderForm = async () => {
        const next = progress.current;
        if (!active() || next === requested) return;
        choice.formRequest?.abort();
        if (next === control.current) {
          requested = null;
          choice.formRequest = null;
          return;
        }
        const controller = new ctx.window.AbortController();
        choice.formRequest = controller;
        requested = next;
        const form = forms[next - 1];
        try {
          const art = artworkCache.get(form) ?? await artworkCache.load(form, controller.signal);
          if (controller.signal.aborted || !active()) return;
          if (!art) throw new Error('当前形态的立绘暂不可用。');
          const { image, ...framing } = seatArtwork(ctx.window, form, art.image);
          const portrait = preparePortrait(target, image, {
            trimPadding: !form.nativePortrait, seatBounds: art.seatBounds, alignTop: form.nativePortrait, ...framing,
          });
          const { portrait: previousPortrait, preview: previousPreview } = choice;
          choice.previewRequest?.abort();
          choice.portrait = portrait;
          choice.preview = null;
          choice.voice = voiceAt(next);
          control.current = next;
          updatePreviews();
          if (previousPreview !== previousPortrait) previousPreview?.dispose();
          previousPortrait.dispose();
          portrait.refresh();
          playIdle(latestForm(next - 1), true);
          if (kind === 'cross') choice.playYjcmEffect('transition');
          effects?.warm(effectSpec());
          seatPreview?.portrait?.refresh();
          void loadPortraitPreview(choice, ctx.window.Laya ?? ctx.window.laya, signal => loadCrossWindow(ctx.window, form, signal));
        } catch (error) {
          if (!controller.signal.aborted && active()) {
            progress.setForm(control.current);
            ctx.notify?.(error.message.split('\n', 1)[0]);
          }
        } finally {
          if (choice.formRequest === controller) {
            requested = null;
            choice.formRequest = null;
          }
        }
      };
      syncPortraitForm(choice, { initial: true });
      updateFormButton();
    }
    if (!attempt && rulesAvailable) saveFormRule(target.id, kind, primary.id, rule);
    if (!attempt && effectConfig !== undefined) saveEffectBindings(target.id, entry, effectRules, accountId);
    if (!attempt && target.isSelf) save(target.id, choice.selection);
    if (needsVoiceSkills && target.isSelf) selfVoiceHistory.set(target.id, playback);
    if (needsSkillNames && !skills) void loadCardSkills(ctx, target.id, skillOptions).then(result => {
      if (result && active()) {
        skills = result;
        if (useDefaultRules) choice.progress = progress = makeProgress(progress.current);
        if (needsVoiceSkills) choice.voice = voiceAt(choice.formControl?.current ?? initial);
      }
    }).catch(() => {});
    return true;
  }
  function preparePortrait(target, image, {
    trimPadding = false, seatBounds, preview = false, alignTop = false, seatTop = 0, hasArtworkAbove = false,
  } = {}) {
    const { window: win } = ctx;
    const laya = win.Laya ?? win.laya, { avatar } = target;
    if (!avatar?.skinTex || !laya?.Texture2D || !laya?.Texture || !laya?.Sprite || !laya?.Rectangle) throw new Error('当前座位不支持外服立绘。');
    const source = seatBounds ? cropPortrait(win.document, image, seatBounds)
      : trimPadding ? trimPortraitPadding(win.document, image) : image;
    return createPortrait(laya, avatar, source, Boolean(seatBounds) || alignTop, preview,
      target.isSelf ? ctx.game.getScene?.() : null, {
        seatTop: source === image ? seatTop : 0, hasArtworkAbove: source === image && hasArtworkAbove,
        idleRate: target.isSelf && !target.deputy ? seatIdleRate : undefined,
      });
  }
  function installPortrait(target, image, { loadPreview, voice, ...placement } = {}) {
    const portrait = preparePortrait(target, image, placement);
    const choice = { target, portrait, preview: loadPreview ? null : portrait, voice };
    try {
      restore(target.key, target);
      portrait.refresh();
      choices.set(target.key, choice);
      choice.releaseAvatar = bindPortraitAvatar(ctx.scope, target, currentSkin(target),
        () => choices.get(target.key) === choice && isCurrent(target, allowsPortrait(target)), () => choice.portrait.refresh());
      updatePresentation(target);
      clearPresentationEffects(target);
    } catch (error) {
      if (choices.get(target.key) === choice) restore(target.key, target);
      else portrait.dispose();
      throw error;
    }
    seatPreview?.portrait?.refresh();
    updatePreviews();
    if (loadPreview) void loadPortraitPreview(choice, ctx.window.Laya ?? ctx.window.laya, loadPreview);
    return choice;
  }
  async function importPortrait(target, file, { signal: cancelSignal } = {}) {
    if (ctx.scope.signal.aborted || cancelSignal?.aborted) return;
    target = liveTarget(target);
    cancelRemembered(target);
    if (!allowsPortrait(target)) throw new Error('当前座位的外服换肤未启用。');
    if (!imageTypes.has(file?.type) || !file.size || file.size > 12 * 1024 * 1024) throw new Error('请选择 12 MB 以内的 PNG、JPEG 或 WebP 图片。');
    const { window: win, scope } = ctx;
    const url = win.URL.createObjectURL(file), image = new win.Image();
    const release = scope.add(() => win.URL.revokeObjectURL(url));
    const request = { scene, owner };
    imports.set(target.key, request);
    try {
      await new Promise((resolve, reject) => {
        const abort = () => finish(reject, new Error('已取消图片载入。'));
        function finish(done, value) {
          scope.signal.removeEventListener('abort', abort);
          cancelSignal?.removeEventListener('abort', abort);
          image.onload = image.onerror = null;
          done(value);
        }
        scope.signal.addEventListener('abort', abort, { once: true });
        cancelSignal?.addEventListener('abort', abort, { once: true });
        image.onload = () => finish(resolve);
        image.onerror = () => finish(reject, new Error('无法打开这张图片。'));
        image.src = url;
      });
      if (scope.signal.aborted || cancelSignal?.aborted || imports.get(target.key) !== request) return;
      target = liveTarget(target);
      if (imports.get(target.key) !== request || scene !== request.scene || owner !== request.owner) return;
      if (!allowsPortrait(target)) return;
      if (Math.max(image.naturalWidth, image.naturalHeight) > 4096) throw new Error('图片长边不能超过 4096 像素。');
      installPortrait(target, image);
      return true;
    } finally {
      if (imports.get(target.key) === request) imports.delete(target.key);
      release();
    }
  }
  const tick = () => {
    if (choices.size || pending.size || formObservers.size ||
        ['unlockDynamic', 'unlockSkin', 'otherPlayers', 'crossServer'].some(key => setting(ctx, key))) refresh();
    else {
      refreshBattleChrome();
      watchEntry();
    }
  };
  ctx.scope.interval(tick, 300);
  ctx.scope.add(() => {
    seatPreview?.release();
    refreshPreviews([]);
    updateFormObservers([]);
    lobbyPreload?.abort();
    for (const attempt of rememberedAttempts.values()) { attempt.controller?.abort(); releaseCover(attempt); }
    rememberedAttempts.clear(); imports.clear(); pending.clear();
    const current = scene === ctx.game.getScene?.() ? targets() : [];
    for (const key of choices.keys()) restore(key, current.find(target => target.key === key));
  });
  tick();
  function has(target) {
    const choice = choices.get(target.key);
    return Boolean((choice?.option || choice?.portrait) && matchesTarget(choice.target, target));
  }
  function portraitBinding(recipient, kind, entry) {
    if (!recipient) return;
    const accountId = ctx.native.account().id;
    const choice = choices.get(recipient.key);
    const active = owner === accountId && choice?.selection && matchesTarget(choice.target, recipient) && currentPortrait(choice);
    const selection = active ? choice.selection :
      recipient.isSelf && accountId && ctx.settings.get(memoryKey(recipient.id, accountId), null);
    if (selection?.kind !== kind) return;
    if (!entry) return selection;
    const catalogue = catalogueFor(kind).current;
    const selected = catalogue?.findSkin(selection.id, selection.general);
    const base = selected && catalogue.skinForms(selected)[0];
    if (base && base.id === entry.id && base.general === entry.general) return selection;
  }
  return { yjcm, mobile, refresh, allows, options, select, selectNative, clearNative, hasOwnGeneral, ownPortraitTarget, importPortrait, previewYjcm, applyYjcm, rememberYjcm, has, formRule, officialForms, effectBindings,
    portraitBinding,
    bindings: (target, entry) => portraitBinding(target, crossSkinKind(entry), entry)?.bindings,
    voiceOptions: (target, entry) => entry.source === 'mobile' ?
      normalizeMobileVoiceOptions(portraitBinding(target, 'mobile', entry)?.voiceOptions) : { card: false, victory: false },
    reset(target) {
      target = liveTarget(target);
      cancelRemembered(target);
      if (target.isSelf) save(target.id, null);
      if (has(target)) restore(target.key, target);
    } };
}

function cropPortrait(doc, image, { x, y, width, height }) {
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function trimPortraitPadding(doc, image) {
  const width = image.naturalWidth ?? image.width, height = image.naturalHeight ?? image.height;
  const sample = Math.min(1, 256 / Math.max(width, height));
  const canvas = doc.createElement('canvas');
  const w = canvas.width = Math.max(1, Math.round(width * sample));
  const h = canvas.height = Math.max(1, Math.round(height * sample));
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, w, h);
  const pixels = g.getImageData(0, 0, w, h).data;
  const rows = new Uint16Array(h), columns = new Uint16Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] < 128) continue;
      rows[y]++;
      columns[x]++;
    }
  }
  // Ignore isolated pixels in the transparent margins of official illustrations.
  const left = columns.findIndex(count => count >= h * .05);
  const right = w - columns.reverse().findIndex(count => count >= h * .05);
  const top = rows.findIndex(count => count >= w * .05);
  const bottom = h - rows.reverse().findIndex(count => count >= w * .05);
  if (left < 0 || top < 0 || (left === 0 && top === 0 && right === w && bottom === h)) return image;
  const x = Math.round(left * width / w), y = Math.round(top * height / h);
  return cropPortrait(doc, image, { x, y,
    width: Math.max(1, Math.round(right * width / w) - x),
    height: Math.max(1, Math.round(bottom * height / h) - y) });
}

function disposePortrait(choice) {
  choice.effects?.dispose();
  choice.disposeVoice?.();
  choice.releaseAvatar?.();
  choice.formRequest?.abort();
  choice.previewRequest?.abort();
  if (choice.preview !== choice.portrait) choice.preview?.dispose();
  choice.portrait.dispose();
}

function createImageTexture(laya, image) {
  const bitmap = new laya.Texture2D(image.naturalWidth ?? image.width, image.naturalHeight ?? image.height);
  let texture;
  try {
    // Match the native image loader's premultiplied alpha for Laya blending.
    bitmap.loadImageSource(image, true);
    texture = new laya.Texture(bitmap);
  } catch (error) {
    bitmap.destroy();
    throw error;
  }
  return { texture, dispose() { texture.destroy(); bitmap.destroy(); } };
}

function createPortraitOverhang(laya, avatar, portrait, name, paint) {
  const layer = new laya.Sprite();
  const origin = new laya.Point(), unitX = new laya.Point(), unitY = new laya.Point();
  layer.name = name;
  layer.mouseEnabled = false;
  layer.customRenderEnable = true;
  layer.customRender = (context, x, y) => {
    const parent = layer.parent;
    if (!layer.height || !parent || avatar.mask) return;
    let alpha = 1;
    for (let node = portrait; node !== parent; node = node.parent) {
      if (!node || node.destroyed || !node.visible) return;
      alpha *= node.alpha;
    }
    if (!alpha) return;
    portrait.localToGlobal(origin.setTo(0, 0), false, parent);
    portrait.localToGlobal(unitX.setTo(1, 0), false, parent);
    portrait.localToGlobal(unitY.setTo(0, 1), false, parent);
    context.save();
    try {
      context.transform(unitX.x - origin.x, unitX.y - origin.y, unitY.x - origin.x, unitY.y - origin.y, x + origin.x, y + origin.y);
      context.clipRect(0, -layer.height, portrait.width, layer.height);
      context.globalAlpha *= alpha;
      // The spine triangle batch can otherwise keep the clip of the card draw
      // even though this pass uses a different viewport.
      context.breakNextMerge?.();
      paint(context);
    } finally {
      context.restore();
      context.breakNextMerge?.();
    }
  };
  return layer;
}

function portraitFrame(avatar) {
  const clip = avatar.scrollRect;
  const { x = 0, y = 0, width = avatar.width, height = avatar.height } = clip ?? {};
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
      !(avatar.width > 0 && avatar.height > 0)) return;
  // OL ShowType shrinks the display width to a half-seat but still clips the full card.
  const split = clip && (avatar.showType === 2 || avatar.showType === 3);
  const declaredWidth = avatar.constructor?.AVATAR_MAX_WIDTH;
  const restoredWidth = split || (x > 0 && avatar.width === width) ?
    (Number.isFinite(declaredWidth) && declaredWidth > 0 ? declaredWidth : split ? width * 2 : width + x * 2) : 0;
  const fullWidth = Math.max(avatar.width, x + width, restoredWidth);
  const fullHeight = Math.max(avatar.height, y + height);
  return { x, y, width, height, fullWidth, fullHeight };
}

function createPortrait(laya, avatar, image, alignTop, preview, scene, { seatTop, hasArtworkAbove, idleRate }) {
  const art = createImageTexture(laya, image);
  const { texture } = art;
  const sourceWidth = texture.width, bodyHeight = texture.height - seatTop;
  let sprite, lastBounds, frameTransform, clipped, motion, motionSpec, motionRequest, activeMotion, overhang, overhangAnchor;
  let staticDraw, releaseIdleRate, motionVisible = false;
  let effectHidden = false;
  const layers = hidePortraitLayers(avatar, preview);
  function paintOverhang(context) {
    if (motionVisible && motion.renderOverhang) motion.renderOverhang(context);
    else if (motionVisible) motion.actor.render(context, 0, 0);
    else context.drawTexture(texture, ...staticDraw);
  }
  function draw() {
    const frame = portraitFrame(avatar);
    if (!frame) return false;
    const { x, y, width, height, fullWidth, fullHeight } = frame;
    const key = [x, y, width, height, fullWidth, fullHeight].join('/');
    if (lastBounds === key) return true;
    const scale = Math.max(fullWidth / sourceWidth, fullHeight / bodyHeight);
    const imageWidth = sourceWidth * scale, imageHeight = bodyHeight * scale;
    // Seat artwork places faces near the top. Crop excess height below them.
    const imageY = alignTop ? 0 : (fullHeight - imageHeight) / 2;
    sprite.pos(x, y);
    sprite.size(width, height);
    sprite.scrollRect = new laya.Rectangle(0, 0, width, height);
    sprite.graphics.clear();
    frameTransform = yjcmSeatTransform(-x, -y, fullWidth, fullHeight);
    clipped = x !== 0 || y !== 0 || width < fullWidth || height < fullHeight;
    let heightAbove;
    if (motion) {
      heightAbove = motion.fit ? motion.fit(-x, -y, fullWidth, fullHeight)
        : fitYjcmMotion(motion, -x, -y, fullWidth, fullHeight);
      motionVisible = heightAbove !== undefined;
      if (motion.actor.visible !== motionVisible) {
        motion.actor.visible = motionVisible;
        if (!motionVisible) motion.stopEffect?.();
        motion.setPlaying?.(motionVisible);
      }
    }
    if (!motionVisible) {
      heightAbove = seatTop * scale;
      staticDraw = [(fullWidth - imageWidth) / 2 - x, imageY - y - heightAbove, imageWidth, texture.height * scale];
      sprite.graphics.drawTexture(texture, ...staticDraw);
    }
    if (heightAbove && !overhang) {
      const name = seatTop || motion?.renderOverhang ? 'sgs-mobile-seat-overhang' : 'sgs-yjcm-idle-overhang';
      overhang = createPortraitOverhang(laya, avatar, sprite, name, paintOverhang);
    }
    if (overhang) overhang.height = y === 0 ? heightAbove : 0;
    lastBounds = key;
    return true;
  }
  function dispose() {
    releaseIdleRate?.();
    motionRequest?.abort();
    activeMotion?.abort();
    overhang?.destroy();
    layers.dispose();
    sprite?.destroy(true);
    art.dispose();
  }
  function refresh() {
    sprite.visible = draw() && !effectHidden && !hiddenPortraitLayers.has(sprite);
    if (!sprite.visible) motion?.stopEffect?.();
    if (overhang) {
      // Mobile character artwork sits behind the chat controls.
      const chat = scene?.chatViewUI;
      const anchor = chat?.parent === scene && scene?.contains?.(avatar) ? chat : avatar;
      const parent = anchor.parent;
      if (parent && (overhang.parent !== parent || overhangAnchor !== anchor)) {
        overhang.removeSelf();
        overhang.zOrder = anchor.zOrder;
        const behindChat = (seatTop || motion?.renderOverhang) && anchor === chat;
        parent.addChildAt(overhang, parent.getChildIndex(anchor) + (behindChat ? 0 : 1));
        overhangAnchor = anchor;
      }
    }
    layers.refresh();
  }
  try {
    sprite = new laya.Sprite();
    sprite.name = preview ? 'sgs-local-skin-seat-preview' : portraitName;
    sprite.mouseEnabled = false;
    if (!draw()) throw new Error('当前座位立绘区域不可用。');
    avatar.addChildAt(sprite, 0);
  } catch (error) { dispose(); throw error; }
  return { texture, dispose, get needsChromeClearance() {
    return !avatar.mask && overhang?.height > 0 && Boolean(motionVisible || hasArtworkAbove);
  },
    mobileEffects() { return motion?.effects; },
    stopMobileEffect() { motion?.stopEffect?.(); },
    playMobileEffect(plan, options) { return motionVisible && (motion.playEffect?.(plan, options) ?? false); },
    effectAnchor(host) {
    if (sprite.destroyed || !draw()) return;
    const actor = motionVisible ? motion.actor : undefined;
    // Entry clips can start while their idle is loading. Use the same authored card frame in that case.
    const { x, y, scaleX, scaleY } = actor?.parent === sprite ? actor : frameTransform;
    const point = host.globalToLocal(sprite.localToGlobal(new laya.Point(x, y)));
    const lower = host.globalToLocal(sprite.localToGlobal(new laya.Point(x, y + scaleY)));
    const right = host.globalToLocal(sprite.localToGlobal(new laya.Point(x + scaleX, y)));
    return { x: point.x, y: point.y, scale: Math.abs(lower.y - point.y), scaleX: Math.abs(right.x - point.x) };
  }, effectClip(host) {
    if (sprite.destroyed || !draw() || !clipped) return;
    const first = host.globalToLocal(sprite.localToGlobal(new laya.Point(0, 0)));
    const last = host.globalToLocal(sprite.localToGlobal(new laya.Point(sprite.width, sprite.height)));
    return new laya.Rectangle(Math.min(first.x, last.x), Math.min(first.y, last.y),
      Math.abs(last.x - first.x), Math.abs(last.y - first.y));
  }, setEffectHidden(hidden) {
    if (sprite.destroyed) return;
    effectHidden = hidden;
    refresh();
  }, animate(win, entry, onStarted) {
    const spec = entry.mobileMotion ? `${entry.mobileMotion}:${entry.mobileForm ?? ''}` : entry.motion;
    if (!spec || spec === motionSpec || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    motionSpec = spec;
    motionRequest?.abort();
    const controller = motionRequest = new win.AbortController();
    function show(animation) {
      if (sprite.destroyed) { controller.abort(); return; }
      releaseIdleRate?.();
      const started = activeMotion !== controller;
      if (started) {
        activeMotion?.abort();
        activeMotion = controller;
        motionRequest = null;
      }
      animation.actor.name = entry.mobileMotion ? 'sgs-mobile-idle' : 'sgs-yjcm-idle';
      sprite.addChild(animation.actor);
      motion = animation;
      lastBounds = null;
      refresh();
      releaseIdleRate = idleRate?.watch(animation.setSmoothIdle, () =>
        animation.actor.parent === sprite && animation.actor.visible && sprite.visible &&
        sprite.displayedInStage && sprite.realVisible !== false);
      if (started && idleRate) controller.signal.addEventListener('abort', () => {
        releaseIdleRate?.();
        releaseIdleRate = undefined;
      }, { once: true });
      if (started) onStarted?.();
    }
    const loading = entry.mobileMotion ? loadMobileMotion(win, entry, controller.signal).then(animation => {
      if (animation) show(animation);
    }) : playYjcmSeatMotion(win, spec, controller.signal, show);
    void loading.catch(() => controller.abort());
  }, refresh };
}

function hidePortraitLayers(avatar, preview) {
  // The seat preview, selected portrait and loading cover can overlap.
  const hidden = new Set();
  function release(node) {
    hidden.delete(node);
    const state = hiddenPortraitLayers.get(node);
    if (--state.count > 0) return;
    hiddenPortraitLayers.delete(node);
    if (!node.destroyed) node.visible = state.visible;
  }
  return { refresh() {
    for (const node of hidden) if (node.destroyed) release(node);
    const nodes = portraitLayers.map(key => avatar[key]);
    if (preview) nodes.push(avatar.getChildByName(portraitName));
    for (const node of nodes) {
      if (!node || node.destroyed) continue;
      let state = hiddenPortraitLayers.get(node);
      if (!state) hiddenPortraitLayers.set(node, state = { count: 0, visible: node.visible });
      if (!hidden.has(node)) { hidden.add(node); state.count++; }
      if (node.visible !== false) state.visible = node.visible;
      node.visible = false;
    }
  }, dispose() {
    for (const node of hidden) release(node);
  } };
}
