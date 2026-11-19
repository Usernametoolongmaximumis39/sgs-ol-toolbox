import { read } from './native-model.js';
import { readInventory } from './model.js';
import { resolveSkinManager, resolveSkinRuntime, SKIN_CONFIG } from './runtime.js';
import { bindPortraitAvatar, bindAvatarSkinTransition, bindSkinPresentation, bindLegacyKillEffects,
  bindSkinDebut, clearOriginalRoundEntrance, clearSkinEffects, clearLegacyKillEffects } from './local-presentation.js';
import { indexFormSkills, indexOfficialFormRules, isRepeatingSkinRule, localSkinForm, skinFormInfo } from './local-forms.js';
import { createSkinPreviews } from './local-preview.js';
import { account } from '../../shared/info-runtime.js';
import { configuredCardSkills, createCrossVoice, loadCardSkills, playCrossDeath, playCrossVoice } from './cross-voice.js';
import { loadYjcmWindow } from './yjcm.js';
import { fitYjcmMotion, playYjcmSeatMotion } from './yjcm-motion.js';
import { createYjcmEffects, yjcmBattleEvents, yjcmSkinAction } from './yjcm-effects.js';
import { createYjcmCatalogue } from './yjcm-catalogue.js';
import { createPortraitCache } from './portrait-cache.js';
import { createSeatFormButton } from './seat-form-button.js';
import { createSeatNameToggle } from './seat-name.js';
import { createChatRowToggle } from './chat-row.js';
import { createFormProgress, normalizeFormRule } from './form-rules.js';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const portraitLayers = ['skinTex', 'skinBigSps', 'spineSkeleon', 'skeleton', 'skeletonBg', 'skeletonTop', 'tempStaticSkin'];
const portraitName = 'sgs-local-skin-portrait';
const hiddenPortraitLayers = new WeakMap();
const setting = (ctx, key) => ctx.settings.get(key, false) === true;
const seatAvatar = (ui, deputy) => deputy ? ui.seatAvatarFu ?? ui.fuSeatUI?.seatAvatar : ui.seatAvatar;

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
  const artworkCache = createPortraitCache(ctx.window, ctx.scope);
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
  let nextCatalogueRetry = 0;
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
  function ruleKey(general, kind, skin, accountId = account(ctx).id) {
    return accountId && `formRule.${accountId}.${general}.${kind}.${skin}`;
  }
  function formRule(general, kind, skin) {
    const key = ruleKey(general, kind, skin);
    return key ? normalizeFormRule(ctx.settings.get(key, null)) : null;
  }
  function saveFormRule(general, kind, skin, config) {
    const key = ruleKey(general, kind, skin);
    if (key && (config || ctx.settings.get(key, null))) ctx.settings.set(key, config);
  }
  function save(id, selection, accountId = owner) {
    if (!accountId) return;
    const key = memoryKey(id, accountId);
    if (ctx.settings.get(key, null) !== selection) ctx.settings.set(key, selection);
  }
  function rememberYjcm(id, entry, bindings, config = formRule(id, 'cross', entry.id)) {
    const accountId = account(ctx).id;
    if (!accountId) throw new Error('登录后可保存到下次对局。');
    save(id, { kind: 'cross', id: entry.id, general: entry.general, bindings }, accountId);
    if (yjcm.current?.yjcmSkinForms(entry).length === 2) saveFormRule(id, 'cross', entry.id, normalizeFormRule(config));
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
    if (selection?.kind === 'cross' && setting(ctx, 'crossServer') && (yjcm.current || Date.now() >= nextCatalogueRetry)) return 'cross';
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
    const previous = presentations.get(ui);
    if (!covered().length && !selected().some(choice => choice.portrait || changedNative(choice))) {
      previous?.dispose();
      presentations.delete(ui);
    } else if (previous) previous.refreshEvents();
    else presentations.set(ui, bindSkinPresentation(ctx.scope, ui, seat, () => selected().filter(currentNative), portraits, {
      skillVoice: (play, args, damage) => playCrossVoice(seat, findVoice, play, args, damage),
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
  function formProgress(target, config, options) {
    let cardSkillIds;
    const getCardSkillIds = () => {
      if (cardSkillIds) return cardSkillIds;
      const skills = read(() => configuredCardSkills(ctx, target.id));
      if (skills) cardSkillIds = new Set(skills.map(skill => skill.id));
      return cardSkillIds;
    };
    if (config?.rules?.some(rule => rule.skills) && !getCardSkillIds()) {
      void loadCardSkills(ctx, target.id).catch(() => {});
    }
    return createFormProgress({ target, config, getCardSkillIds,
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
        const update = () => {
          for (const target of observer.targets) {
            const choice = choices.get(target.key);
            if (!matchesTarget(choice?.target, target)) continue;
            if (choice.portrait && choice.progress && isCurrent(target, allowsPortrait(target))) syncPortraitForm(choice);
            else if (choice.option?.forms && isCurrent(target)) syncSelectedSkin(target, choice);
          }
        };
        for (const event of ['GENERAL_HP_CHANGED', 'GENERAL_SKIN_CHANGED']) {
          seat.on(event, observer, update);
          release.push(ctx.scope.add(() => seat.off(event, observer, update)));
        }
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
    const nextOwner = account(ctx).id;
    const sameOwner = owner === nextOwner;
    if (!sameOwner) {
      selfVoiceHistory.clear();
      nextCatalogueRetry = 0;
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
      if (previous?.kind === 'cross' && allowsPortrait(target) && !rememberedAttempts.has(target.key) && !imports.has(target.key) &&
          target.avatar.skinTex && target.avatar.width > 0 && target.avatar.height > 0 &&
          (yjcm.current || Date.now() >= nextCatalogueRetry)) {
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
    const optimize = self && active === scene && setting(ctx, 'crossServer') &&
      ctx.settings.get('yjcmDynamicOptimization', true) === true;
    const next = optimize ? [...choices.values()].filter(choice =>
      choice.target.isSelf && choice.target.ui === self && choice.portrait?.motionPlaying) : [];
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
      const state = [active, seat, owner || account(ctx).id, seat?.General, seat?.General2, ui?.effectSprite,
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
    let catalogue = yjcm.current ?? yjcm.cached;
    const findEntry = () => catalogue?.findYjcmSkin(selection.id, selection.general);
    const entry = findEntry();
    if (!entry || !artworkCache.get(entry)) {
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
    }, 8000);
    const cancelTimeout = ctx.scope.add(() => ctx.window.clearTimeout(timer));
    async function apply() {
      if (!entry && !yjcm.current) {
        await yjcm.warm();
        if (controller.signal.aborted) return;
        catalogue = yjcm.current ?? yjcm.cached;
        if (!findEntry()) {
          try { catalogue = await yjcm.load(); }
          catch (error) {
            if (!controller.signal.aborted) {
              nextCatalogueRetry = Date.now() + 30000;
              if (rememberedAttempts.get(target.key) === attempt) rememberedAttempts.delete(target.key);
            }
            throw error;
          }
        }
      }
      const available = entry ?? findEntry();
      if (!available || controller.signal.aborted) return;
      const config = selection.id === available.id ? undefined : formRule(target.id, 'cross', selection.id);
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
      choice.formControl = { count: 2, get current() { return choice.applied.form; }, advance(signal) {
        if (signal.aborted || choices.get(target.key) !== choice || !isCurrent(target)) return;
        progress.advance();
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
    save(generalId, null, account(ctx).id);
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
      if (!artwork || controller.signal.aborted || account(ctx).id !== accountId || !isCurrent(target, allowsPortrait(target))) return;
      preview.portrait = preparePortrait(target, artwork.image, true, artwork.seatBounds, true);
      preview.portrait.refresh();
      preview.portrait.animate(ctx.window, entry.motion);
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
  async function applyYjcm(target, entry, bindings, signal, config, attempt, catalogue = yjcm.current) {
    if (!attempt) {
      target = liveTarget(target);
      cancelRemembered(target);
    }
    const accountId = owner;
    const startScene = scene;
    const request = {};
    if (!attempt) imports.set(target.key, request);
    let artwork;
    try {
      artwork = artworkCache.get(entry) ?? await artworkCache.load(entry, signal);
      if ((attempt ? rememberedAttempts.get(target.key) !== attempt : imports.get(target.key) !== request) ||
          !artwork || signal.aborted || startScene !== ctx.game.getScene?.() ||
          !isCurrent(target, allowsPortrait(target)) || account(ctx).id !== accountId) return;
    } finally { if (imports.get(target.key) === request) imports.delete(target.key); }
    const forms = catalogue.yjcmSkinForms(entry);
    let updatedForms;
    function latestForm(index) {
      if (!yjcm.current || yjcm.current === catalogue) return forms[index];
      if (!updatedForms) {
        const updated = yjcm.current.findYjcmSkin(entry.id, entry.general);
        updatedForms = updated ? yjcm.current.yjcmSkinForms(updated) : [];
      }
      return updatedForms[index] ?? forms[index];
    }
    const rule = forms.length === 2 ? normalizeFormRule(config === undefined ? formRule(target.id, 'cross', entry.id) : config) : null;
    const progress = forms.length > 1 ? formProgress(target, rule, { count: forms.length }) : null;
    const hasBindings = Object.keys(bindings ?? {}).length > 0;
    const needsVoiceSkills = hasBindings || (yjcm.current ?? catalogue).hasYjcmVoices(entry) || yjcm.needsRefresh;
    const skillOptions = { includeDerived: true };
    let skills = needsVoiceSkills ? read(() => configuredCardSkills(ctx, target.id, skillOptions)) : null;
    const playback = target.isSelf ? selfVoiceHistory.get(target.id) ?? {} : {};
    function voiceAt(index) {
      const voiceCatalogue = yjcm.current ?? catalogue;
      const voiceEntry = voiceCatalogue === catalogue ? entry : voiceCatalogue.findYjcmSkin(entry.id, entry.general) ?? entry;
      if (!hasBindings && !voiceCatalogue.hasYjcmVoices(voiceEntry)) return null;
      const form = forms.length > 1 ? index : undefined;
      return createCrossVoice(skills ?? [], voiceCatalogue.yjcmSkinVoices(voiceEntry, form, attempt?.selectedId ?? entry.id), bindings, playback,
        reference => voiceCatalogue.findYjcmVoice(reference, form));
    }
    releaseCover(attempt);
    const choice = installPortrait(target, artwork.image, {
      trimPadding: true, seatBounds: artwork.seatBounds, voice: voiceAt(1),
      loadPreview: signal => loadYjcmWindow(ctx.window, entry, signal),
    });
    choice.portrait.animate(ctx.window, latestForm(0).motion, refreshBattleChrome);
    const active = () => choices.get(target.key) === choice && account(ctx).id === accountId &&
      isCurrent(target, allowsPortrait(target));
    const effects = choice.effects = createYjcmEffects(ctx, target, active);
    const activeForm = () => latestForm((choice.formControl?.current ?? 1) - 1);
    const effectSpec = () => activeForm().effects;
    choice.playYjcmEffect = (kind, skill, name, targets) => {
      const spec = effectSpec();
      const plan = kind === 'enter' || kind === 'transition' ? spec?.[kind] : yjcmSkinAction(spec, skill, name);
      return effects.play(spec, plan, kind, choice.portrait, targets);
    };
    choice.playYjcmEffect('enter');
    effects.warm(effectSpec());
    if (yjcm.needsRefresh) void yjcm.load().then(() => {
      if (!active()) return;
      choice.voice = voiceAt(choice.formControl?.current ?? 1);
      choice.portrait.animate(ctx.window, activeForm().motion, refreshBattleChrome);
      effects.warm(effectSpec());
    }).catch(() => {});
    if (progress) {
      choice.progress = progress;
      const control = choice.formControl = { current: 1, count: forms.length, async advance(signal) {
        if (signal.aborted || !active()) return;
        progress.advance();
        await choice.renderForm();
      } };
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
          if (!art || controller.signal.aborted || !active()) return;
          const portrait = preparePortrait(target, art.image, true, art.seatBounds);
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
          portrait.animate(ctx.window, latestForm(next - 1).motion, refreshBattleChrome);
          choice.playYjcmEffect('transition');
          effects.warm(effectSpec());
          seatPreview?.portrait?.refresh();
          void loadPortraitPreview(choice, ctx.window.Laya ?? ctx.window.laya, signal => loadYjcmWindow(ctx.window, form, signal));
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
    if (!attempt && progress) saveFormRule(target.id, 'cross', entry.id, rule);
    if (!attempt && target.isSelf) {
      save(target.id, { kind: 'cross', id: entry.id, general: entry.general, bindings });
    }
    if (needsVoiceSkills && target.isSelf) selfVoiceHistory.set(target.id, playback);
    if (needsVoiceSkills && !skills) void loadCardSkills(ctx, target.id, skillOptions).then(result => {
      if (result && active()) {
        skills = result;
        choice.voice = voiceAt(choice.formControl?.current ?? 1);
      }
    }).catch(() => {});
    return true;
  }
  function preparePortrait(target, image, trimPadding, seatBounds, preview) {
    const { window: win } = ctx;
    const laya = win.Laya ?? win.laya, { avatar } = target;
    if (!avatar?.skinTex || !laya?.Texture2D || !laya?.Texture || !laya?.Sprite || !laya?.Rectangle) throw new Error('当前座位不支持外服立绘。');
    const source = seatBounds ? cropPortrait(win.document, image, seatBounds)
      : trimPadding ? trimPortraitPadding(win.document, image) : image;
    return createPortrait(laya, avatar, source, Boolean(seatBounds), preview, target.isSelf ? ctx.game.getScene?.() : null);
  }
  function installPortrait(target, image, { trimPadding = false, seatBounds, loadPreview, voice } = {}) {
    const portrait = preparePortrait(target, image, trimPadding, seatBounds);
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
  return { yjcm, refresh, allows, options, select, selectNative, clearNative, hasOwnGeneral, ownPortraitTarget, importPortrait, previewYjcm, applyYjcm, rememberYjcm, has, formRule, officialForms,
    bindings(target, entry) {
      const accountId = account(ctx).id;
      const selection = target?.isSelf && accountId && ctx.settings.get(memoryKey(target.id, accountId), null);
      return selection?.kind === 'cross' && (selection.id === entry.id || selection.id === entry.dynamicId) &&
          yjcm.current?.findYjcmSkin(selection.id, selection.general)?.general === entry.general
        ? selection.bindings : undefined;
    },
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
  const { naturalWidth: width, naturalHeight: height } = image;
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

function createPortraitOverhang(laya, avatar, portrait, getActor) {
  const layer = new laya.Sprite();
  const origin = new laya.Point(), unitX = new laya.Point(), unitY = new laya.Point();
  layer.name = 'sgs-yjcm-idle-overhang';
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
      getActor()?.render(context, 0, 0);
    } finally { context.restore(); }
  };
  return layer;
}

function createPortrait(laya, avatar, image, alignTop, preview, scene) {
  const art = createImageTexture(laya, image);
  const { texture } = art;
  const sourceWidth = texture.width, sourceHeight = texture.height;
  let sprite, lastBounds, motion, motionSpec, motionRequest, activeMotion, overhang, overhangAnchor;
  let effectHidden = false;
  const layers = hidePortraitLayers(avatar, preview);
  function draw() {
    const clip = avatar.scrollRect;
    const x = clip?.x || 0, y = clip?.y || 0;
    const width = clip?.width || avatar.width, height = clip?.height || avatar.height;
    if (!(width > 0 && height > 0)) return false;
    const fullWidth = x > 0 ? Math.max(avatar.width, avatar.constructor.AVATAR_MAX_WIDTH || width + x * 2) : avatar.width;
    const key = [x, y, width, height, fullWidth, avatar.height].join('/');
    if (lastBounds === key) return true;
    const scale = Math.max(fullWidth / sourceWidth, avatar.height / sourceHeight);
    const imageWidth = sourceWidth * scale, imageHeight = sourceHeight * scale;
    // Seat artwork places faces near the top. Crop excess height below them.
    const imageY = alignTop ? 0 : (avatar.height - imageHeight) / 2;
    sprite.pos(x, y);
    sprite.size(width, height);
    sprite.scrollRect = new laya.Rectangle(0, 0, width, height);
    sprite.graphics.clear();
    if (motion) {
      const heightAbove = fitYjcmMotion(motion, -x, -y, fullWidth, avatar.height);
      if (heightAbove && !overhang) overhang = createPortraitOverhang(laya, avatar, sprite, () => motion?.actor);
      if (overhang) overhang.height = y === 0 ? heightAbove : 0;
    } else sprite.graphics.drawTexture(texture, (fullWidth - imageWidth) / 2 - x, imageY - y, imageWidth, imageHeight);
    lastBounds = key;
    return true;
  }
  function dispose() {
    motionRequest?.abort();
    activeMotion?.abort();
    overhang?.destroy();
    layers.dispose();
    sprite?.destroy(true);
    art.dispose();
  }
  function refresh() {
    sprite.visible = draw() && !effectHidden && !hiddenPortraitLayers.has(sprite);
    if (overhang) {
      // Like the native layout, keep the card inside its clip and let the headdress clear the chat edge.
      const chat = scene?.chatViewUI;
      const anchor = chat?.parent === scene && scene?.contains?.(avatar) ? chat : avatar;
      const parent = anchor.parent;
      if (parent && (overhang.parent !== parent || overhangAnchor !== anchor)) {
        overhang.removeSelf();
        overhang.zOrder = anchor.zOrder;
        parent.addChildAt(overhang, parent.getChildIndex(anchor) + 1);
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
  return { texture, dispose, get motionPlaying() { return motion?.actor.parent === sprite; }, effectAnchor(host) {
    const actor = motion?.actor;
    if (!actor || actor.destroyed || sprite.destroyed) return;
    const point = host.globalToLocal(sprite.localToGlobal(new laya.Point(actor.x, actor.y)));
    const lower = host.globalToLocal(sprite.localToGlobal(new laya.Point(actor.x, actor.y + actor.scaleY)));
    const right = host.globalToLocal(sprite.localToGlobal(new laya.Point(actor.x + actor.scaleX, actor.y)));
    return { x: point.x, y: point.y, scale: Math.abs(lower.y - point.y), scaleX: Math.abs(right.x - point.x) };
  }, setEffectHidden(hidden) {
    if (sprite.destroyed) return;
    effectHidden = hidden;
    refresh();
  }, animate(win, spec, onStarted) {
    if (!spec || spec === motionSpec || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    motionSpec = spec;
    motionRequest?.abort();
    const controller = motionRequest = new win.AbortController();
    void playYjcmSeatMotion(win, spec, controller.signal, animation => {
      if (sprite.destroyed) { controller.abort(); return; }
      const started = activeMotion !== controller;
      if (started) {
        activeMotion?.abort();
        activeMotion = controller;
        motionRequest = null;
      }
      animation.actor.name = 'sgs-yjcm-idle';
      sprite.addChild(animation.actor);
      motion = animation;
      lastBounds = null;
      refresh();
      if (started) onStarted?.();
    }).catch(() => controller.abort());
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
