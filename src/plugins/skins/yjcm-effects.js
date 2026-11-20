import { read } from './native-model.js';
import { yjcmEffectSoundFile, yjcmSkillName } from './yjcm-effect-data.js';
import { loadYjcmEffectTemplate } from './yjcm-motion.js';

const SLASH = 1, DODGE = 2;
const slashNames = new Set(['杀', '火杀', '雷杀', '冰杀']);
const assetWait = 2000;
const soundRoot = 'https://web.sanguosha.com/x/pc/res/assets/runtime/voice/skinSpellEffect/';
const soundLimit = 4 * 1024 * 1024;
const effectLists = new WeakMap();
const actionKey = plan => `action:${plan.id}:${plan.placement}:` + plan.clips.map(({ file, name }) => `${file}/${name}`).join('+');
const effectKey = /^action:([1-9][0-9]*):(?:seat|near|center):[A-Za-z0-9_./+\-]+$/;
const mobileEffectKey = /^mobile:(?:attack|special)$/;
const placementLabels = { seat: '座位内', near: '座位旁', center: '中央' };

export const isYjcmSkillTrigger = id => Number.isSafeInteger(id) && id > DODGE;
export const isYjcmSkillEffect = effect => effect?.plan?.bindable === true || isYjcmSkillTrigger(effect?.plan?.id);
export const automaticCardEffects = spec => [
  yjcmSkinAction(spec, SLASH) && '出杀自动播放攻击',
  yjcmSkinAction(spec, DODGE) && '用闪自动播放闪避',
].filter(Boolean);

export function listYjcmEffects(spec) {
  if (!spec) return [];
  const known = effectLists.get(spec);
  if (known) return known;
  const actions = spec.actions.map(plan => ({ key: plan.key ?? actionKey(plan), plan,
    label: plan.id === SLASH ? '攻击' : plan.id === DODGE ? '闪避' : plan.name || `技能 ${plan.id}`,
  }));
  const labels = new Map();
  for (const { label } of actions) labels.set(label, (labels.get(label) ?? 0) + 1);
  for (const effect of actions) {
    if (labels.get(effect.label) > 1) effect.label += `（${placementLabels[effect.plan.placement]}）`;
  }
  const result = [spec.enter && { key: 'enter', label: '入场', plan: spec.enter }, ...actions,
    spec.transition && { key: 'transition', label: '形态切换', plan: spec.transition }].filter(Boolean);
  effectLists.set(spec, result);
  return result;
}

export function normalizeYjcmEffectBindings(value, maxForm = 2) {
  const result = {};
  for (let form = 1; form <= Math.min(32, maxForm); form++) {
    const choices = value?.[form];
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) continue;
    const entries = Object.entries(choices).filter(([id, key]) => {
      const trigger = Number(id);
      if (!isYjcmSkillTrigger(trigger) || String(trigger) !== id) return false;
      if (key === null) return true;
      if (typeof key !== 'string' || key.length > 512) return false;
      return mobileEffectKey.test(key) || isYjcmSkillTrigger(Number(effectKey.exec(key)?.[1]));
    });
    if (entries.length) result[form] = Object.fromEntries(entries);
  }
  return result;
}

function effectVolume(ctx, scene, laya) {
  if (laya.SoundManager?.muted || laya.SoundManager?.soundMuted) return 0;
  const settings = read(() => scene.topMenu.soundUI.manger);
  if (settings) return settings.MainClose || settings.OtherClose ? 0 : Math.min(100, settings.MainVol, settings.OtherVol) / 100;
  const mobile = read(() => ctx.game.getClass('GameContext').IsLayaMobile) === true;
  const get = key => read(() => laya.LocalStorage.getItem(key));
  const setting = key => (mobile ? get('mobile' + key) : undefined) ?? get(key[0].toLowerCase() + key.slice(1));
  if (setting('MainClose') === '1' || setting('OtherClose') === '1') return 0;
  return Math.min(100, Number(setting('MainVol') ?? (mobile ? 70 : 100)), Number(setting('OtherVol') ?? (mobile ? 70 : 60))) / 100;
}

export function allowsSkinEffects(ctx) {
  return !ctx.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
    read(() => ctx.game.getClass('GameContext').ShowGameSkinEffects) !== false;
}

export function skinEffectVolume(ctx) {
  const laya = ctx.window.Laya ?? ctx.window.laya;
  return laya ? effectVolume(ctx, ctx.game.getScene?.(), laya) : 0;
}

export function yjcmSkinAction(spec, id, name) {
  const actions = spec?.actions ?? [];
  if (id === SLASH || id === DODGE) return actions.find(action => action.id === id);
  const key = yjcmSkillName(name);
  if (!isYjcmSkillTrigger(id) || !key) return;
  // OL and 一将成名 assign IDs independently. The same name establishes the
  // match, with an exact ID used only to resolve same-name variants.
  return actions.find(action => action.id === id && action.name === key) ??
    actions.find(action => isYjcmSkillTrigger(action.id) && action.name === key);
}

export function resolveYjcmEffect(spec, id, name, bindings, form = 1) {
  const options = listYjcmEffects(spec);
  if (isYjcmSkillTrigger(id)) {
    const selected = bindings?.[form]?.[id];
    if (selected === null) return;
    // Retain an explicitly saved attack override from the earlier mobile picker.
    const custom = selected !== undefined && options.find(effect => effect.key === selected &&
      (isYjcmSkillEffect(effect) || effect.key === 'mobile:attack'));
    if (custom) return custom;
  }
  const plan = yjcmSkinAction(spec, id, name);
  return options.find(effect => effect.plan === plan);
}

export function yjcmBattleEvents(ctx, seat, portraits) {
  let cardSkill;
  return {
    cardEffect([card, useType]) {
      const recent = cardSkill?.card === Number(card) ? cardSkill : null;
      cardSkill = null;
      const candidates = portraits().filter(choice => choice.playYjcmEffect);
      if (!candidates.length) return;
      const meta = recent ? null : read(() => ctx.game.getCardMeta(card));
      const id = recent?.id ?? (slashNames.has(meta?.name) || meta?.firstSkillId === SLASH ? SLASH
        : meta?.name === '闪' || meta?.firstSkillId === DODGE ? DODGE : 0);
      if (!id || (id === SLASH && Number(useType) !== 1)) return;
      candidates.sort((a, b) => a.target.deputy - b.target.deputy);
      candidates.some(choice => choice.playYjcmEffect(id === SLASH ? 'attack' : 'dodge', id, '', recent?.targets));
    },
    skillEffect(event) {
      const skill = event?.Skill;
      const id = Number(skill?.SkillId ?? skill?.ID);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      if (id <= DODGE) {
        // Card animation and the use-type notification arrive in the same
        // native call. Only the latter distinguishes playing a Slash from responding with it.
        const card = Number(event.CardID);
        if (card > 0) {
          const observed = cardSkill = { card, id, targets: event.DestSeatIDs };
          queueMicrotask(() => { if (cardSkill === observed) cardSkill = null; });
        }
        return;
      }
      if (skill.IsGeneral === false || seat.HuaShenCard) return;
      const ownerFor = id => read(() => seat.GetGeneralBySkillIdOnlyId(id)) ?? read(() => seat.GetGeneralBySkillId(id));
      const parent = Number(skill.FromSkillId);
      const owner = ownerFor(id) ?? (parent > DODGE ? ownerFor(parent) : null);
      if (!owner) return;
      const choice = portraits().find(item => item.target.general === owner && item.playYjcmEffect);
      if (!choice || choice.playYjcmEffect('skill', id, read(() => skill.SkillName || skill.Name), event.DestSeatIDs)) return;
      const virtual = skill.UsedVirtualSkill;
      if (Number(virtual?.ID) === SLASH && Number(virtual.CardUseType ?? skill.CardUseType) === 1) {
        choice.playYjcmEffect('attack', SLASH, '', event.DestSeatIDs);
      }
    },
  };
}

export function createYjcmEffects(ctx, target, active) {
  const win = ctx.window, cache = new Map(), useCounts = new Map();
  const controller = new win.AbortController();
  let current, warmTimer, round;

  function canPlay() {
    return !controller.signal.aborted && active() && allowsSkinEffects(ctx);
  }

  function getAsset(spec, clip, shared = false) {
    if (!clip) return;
    const key = (shared ? '/' : spec.resource + '/') + clip.file;
    let record = cache.get(key);
    if (record && (!record.retryAt || Date.now() < record.retryAt)) return record;
    if (!record && cache.size >= 16) return;
    record = {};
    cache.set(key, record);
    record.ready = loadYjcmEffectTemplate(win, spec.resource, clip.file, controller.signal, shared).then(asset => {
      if (controller.signal.aborted) asset?.dispose();
      else record.asset = asset;
    }).catch(() => {}).finally(() => {
      if (!record.asset) record.retryAt = Date.now() + 30000;
    });
    return record;
  }

  function warm(spec) {
    win.clearTimeout(warmTimer);
    warmTimer = null;
    if (!spec?.actions.length) return;
    // Let the selected portrait paint before preparing the shared attack and skill art.
    warmTimer = win.setTimeout(() => {
      warmTimer = null;
      if (!canPlay()) return;
      const action = spec.actions.find(action => action.placement !== 'seat');
      getAsset(spec, action?.clips[0]);
      getAsset(spec, action?.background);
    }, 800);
  }

  function play(spec, plan, kind, portrait, targetIds) {
    if (!plan || !canPlay()) return false;
    if (kind === 'transition' && current?.kind === 'skill') {
      current.after = () => play(spec, plan, kind, portrait, targetIds);
      return true;
    }
    if (current?.kind === 'skill' || (current?.kind === 'attack' && kind === 'attack')) return true;
    const scene = ctx.game.getScene?.();
    const laya = win.Laya ?? win.laya;
    if (!scene?.addChild || !laya?.Sprite || !laya.Point || !target.avatar.localToGlobal) return false;
    const countInRound = plan.maxCount > 0 && Number.isSafeInteger(scene.GameRound);
    if (countInRound) {
      if (round !== scene.GameRound) {
        round = scene.GameRound;
        useCounts.clear();
      }
      if ((useCounts.get(plan) ?? 0) >= plan.maxCount) return false;
    }
    current?.dispose();
    const run = { kind, after: null, dispose };
    current = run;
    const ids = new Set(Array.isArray(targetIds) ? targetIds.map(Number) : []);
    const main = plan.clips.map(clip => [clip, getAsset(spec, clip, plan.shared)]);
    const background = getAsset(spec, plan.background);
    const projectile = ids.size ? getAsset(spec, plan.projectile) : undefined;
    const impact = ids.size ? getAsset(spec, plan.impact) : undefined;
    const actors = new Set();
    const soundController = new win.AbortController();
    const startedSounds = new Set(), releaseSounds = new Set();
    const sceneLayer = new laya.Sprite();
    sceneLayer.name = 'sgs-yjcm-' + kind;
    sceneLayer.mouseEnabled = false;
    sceneLayer.zOrder = 100;
    let remaining = 0, mainRemaining = 0, faded = false, disposed = false;
    let timer;

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (current === run) current = null;
      win.clearTimeout(timer);
      soundController.abort();
      for (const release of releaseSounds) release();
      for (const actor of actors) if (!actor.destroyed) actor.destroy(true);
      actors.clear();
      if (!sceneLayer.destroyed) sceneLayer.destroy(true);
      if (faded) portrait.setEffectHidden(false);
    }
    function finish() {
      if (disposed) return;
      dispose();
      run.after?.();
    }
    function anchor(avatar) {
      const { scrollRect: clip } = avatar;
      const x = (clip?.x ?? 0) + (clip?.width || avatar.width) / 2;
      const y = (clip?.y ?? 0) + (clip?.height || avatar.height) / 2;
      const point = scene.globalToLocal(avatar.localToGlobal(new laya.Point(x, y)));
      const lower = scene.globalToLocal(avatar.localToGlobal(new laya.Point(x, y + avatar.height)));
      return { x: point.x, y: point.y, scale: Math.abs(lower.y - point.y) / 270 };
    }
    function spawn(clip, asset, position, loop, label, done) {
      if (!asset || disposed) return;
      let actor;
      try {
        actor = asset.template.buildArmature(asset.spine ? undefined : 2);
        const count = actor.getAnimNum();
        const index = clip.name === 0 ? 0
          : Array.from({ length: count }, (_, i) => actor.getAniNameByIndex(i)).indexOf(clip.name);
        if (index < 0 || index >= count) {
          actor.destroy(true);
          return;
        }
        actor.mouseEnabled = false;
        actor.pos(position.x, position.y);
        const scaleX = position.scaleX ?? position.scale;
        actor.scale(position.mirror ? -scaleX : scaleX, position.scale);
        actor.rotation = position.rotation || 0;
        if (asset.spine) actor.forceUpdate = true;
        sceneLayer.addChild(actor);
        actors.add(actor);
        if (label) actor.once(laya.Event.LABEL, run, label);
        if (!loop) actor.once(laya.Event.STOPPED, run, () => {
          // Dispose after the runtime finishes notifying the current armature.
          queueMicrotask(() => {
            if (disposed) return;
            destroyActor(actor);
            done();
          });
        });
        actor.play(index, loop, true, 0, 0, true, false);
        return actor;
      } catch {
        if (actor) destroyActor(actor);
      }
    }
    function destroyActor(actor) {
      actors.delete(actor);
      if (!actor.destroyed) actor.destroy(true);
    }

    function playSound(file) {
      if (!yjcmEffectSoundFile.test(file) || startedSounds.has(file) || !win.Audio || !(effectVolume(ctx, scene, laya) > 0)) return;
      startedSounds.add(file);
      const signal = soundController.signal;
      void win.fetch(soundRoot + file, { credentials: 'omit', redirect: 'error', signal }).then(response => {
        if (response.ok && !(Number(response.headers.get('content-length')) > soundLimit)) return response.blob();
      }).then(data => {
        const volume = effectVolume(ctx, scene, laya);
        if (!data?.size || data.size > soundLimit || signal.aborted || !canPlay() || !(volume > 0)) return;
        const audio = new win.Audio();
        const url = win.URL.createObjectURL(data);
        const release = () => {
          if (!releaseSounds.delete(release)) return;
          audio.pause();
          win.URL.revokeObjectURL(url);
        };
        releaseSounds.add(release);
        audio.volume = volume;
        audio.addEventListener('ended', release, { once: true });
        audio.addEventListener('error', release, { once: true });
        audio.src = url;
        void audio.play().catch(release);
      }).catch(() => {});
    }

    // Start the layers together when ready. The deadline still permits a
    // partial effect if an optional layer or one of the main clips is slow.
    const ready = Promise.all([...main.map(([, record]) => record), background, projectile, impact].map(record => record?.ready));
    const deadline = new Promise(resolve => { timer = win.setTimeout(resolve, assetWait); });
    void Promise.race([ready, deadline]).then(() => {
      if (disposed) return;
      win.clearTimeout(timer);
      if (!canPlay() || ctx.game.getScene?.() !== scene) return finish();
      const origin = anchor(target.avatar);
      if (!origin.scale || !Number.isFinite(origin.x + origin.y)) return finish();
      const seatPosition = portrait.effectAnchor(scene) ?? origin;
      const stage = laya.stage;
      const rightWidth = Number(read(() => ctx.game.getClass('GameContext').SceneRightWidth)) || 0;
      const center = scene.globalToLocal(stage.localToGlobal(new laya.Point((stage.width - rightWidth) / 2, stage.height / 2)));
      const targets = ids.size ? (ctx.game.getSeatUIs?.() ?? []).filter(ui => ids.has(Number((ui.Seat ?? ui.seat)?.Index)))
        .map(ui => ui.seatAvatar).filter(avatar => avatar?.localToGlobal && !avatar.destroyed).map(anchor) : [];
      const towardsRight = targets.length && targets.every(pos => pos.x > origin.x + 10) ? true
        : targets.length && targets.every(pos => pos.x < origin.x - 10) ? false : origin.x < center.x;
      let position = plan.placement === 'seat' ? seatPosition : origin;
      if (plan.placement === 'center') position = { ...center, scale: origin.scale };
      if (plan.placement === 'near') {
        const { x, y, scale, threshold, mirror } = plan.position;
        const upper = origin.y < threshold ? 0 : 1;
        const size = kind === 'enter' ? seatPosition : origin;
        position = { x: origin.x + x[towardsRight ? 0 : 1] * origin.scale, y: origin.y + y[upper] * origin.scale,
          scale: size.scale * scale[upper], scaleX: (size.scaleX ?? size.scale) * scale[upper], mirror: mirror && towardsRight };
      }
      if (plan.clipToSeat || plan === spec.transition) {
        const clip = portrait.effectClip(scene);
        if (clip) {
          // Move the viewport and its scroll offset together to keep all actor coordinates in scene space.
          sceneLayer.pos(clip.x, clip.y);
          sceneLayer.scrollRect = clip;
        }
      }
      scene.addChild(sceneLayer);
      let backgroundActor, reacted = false;
      const complete = () => { if (remaining === 0 && mainRemaining === 0) finish(); };
      const hit = (info, record, pos, rotation, onLabel) => {
        if (!info) return;
        const position = { x: pos.x + info.x * pos.scale, y: pos.y + info.y * pos.scale, scale: pos.scale * info.scale, rotation };
        const actor = spawn(info, record?.asset, position, false, onLabel, () => {
          onLabel?.();
          remaining--;
          complete();
        });
        if (actor) {
          remaining++;
          playSound(info.sound);
        }
        return actor;
      };
      function react() {
        if (reacted || disposed) return;
        reacted = true;
        for (const pos of targets) {
          let struck = false;
          const strike = () => {
            if (struck) return;
            struck = true;
            hit(plan.impact, impact, pos, 0);
          };
          const angle = Math.atan2(pos.y - origin.y, pos.x - origin.x) * 180 / Math.PI;
          if (!hit(plan.projectile, projectile, pos, angle, strike)) strike();
        }
      }
      function mainDone() {
        if (--mainRemaining) return;
        react();
        if (backgroundActor) destroyActor(backgroundActor);
        if (faded) {
          portrait.setEffectHidden(false);
          faded = false;
        }
        complete();
      }
      if (background?.asset) backgroundActor = spawn(plan.background, background.asset, seatPosition, true);
      for (const [clip, record] of main) {
        if (spawn(clip, record?.asset, position, false, react, mainDone)) mainRemaining++;
      }
      if (!mainRemaining) return finish();
      playSound(plan.sound);
      if (countInRound) useCounts.set(plan, (useCounts.get(plan) ?? 0) + 1);
      faded = Boolean(plan.replace || backgroundActor);
      if (faded) portrait.setEffectHidden(true);
      win.clearTimeout(timer);
      timer = win.setTimeout(finish, 12000);
    }).catch(finish);
    return true;
  }

  return { play, warm, refresh() {
    if (current && !canPlay()) current.dispose();
  }, dispose() {
    controller.abort();
    win.clearTimeout(warmTimer);
    current?.dispose();
    for (const record of cache.values()) record.asset?.dispose();
    cache.clear();
  } };
}
