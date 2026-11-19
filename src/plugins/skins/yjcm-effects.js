import { read } from './native-model.js';
import { yjcmSkillName } from './yjcm-effect-data.js';
import { loadYjcmEffectTemplate } from './yjcm-motion.js';

const SLASH = 1, DODGE = 2;
const slashNames = new Set(['杀', '火杀', '雷杀', '冰杀']);
const assetWait = 2000;

export function yjcmSkinAction(spec, id, name) {
  const key = yjcmSkillName(name);
  const actions = spec?.actions ?? [];
  return actions.find(action => action.id === id && (!key || !action.name || action.name === key)) ??
    (id > DODGE && key ? actions.find(action => action.name === key) : undefined);
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
      const id = Number(skill?.ID);
      if (!(id > 0)) return;
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
      const owner = read(() => seat.GetGeneralBySkillIdOnlyId(id)) ?? read(() => seat.GetGeneralBySkillId(id));
      if (!owner) return;
      const choice = portraits().find(item => item.target.general === owner && item.playYjcmEffect);
      choice?.playYjcmEffect('skill', id, read(() => skill.SkillName ?? skill.Name), event.DestSeatIDs);
    },
  };
}

export function createYjcmEffects(ctx, target, active) {
  const win = ctx.window, cache = new Map(), useCounts = new Map();
  const controller = new win.AbortController();
  let current, warmTimer, round;

  function canPlay() {
    return !controller.signal.aborted && active() && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
      read(() => ctx.game.getClass('GameContext').ShowGameSkinEffects) !== false;
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
    const sceneLayer = new laya.Sprite();
    sceneLayer.name = 'sgs-yjcm-' + kind;
    sceneLayer.mouseEnabled = false;
    sceneLayer.zOrder = 100;
    let remaining = 0, mainRemaining = 0, faded = false, disposed = false;
    let timer = win.setTimeout(finish, assetWait);

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (current === run) current = null;
      win.clearTimeout(timer);
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

    void Promise.all(main.map(([, record]) => record?.ready)).then(() => {
      if (disposed) return;
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
      let position = plan.replace ? seatPosition : origin;
      if (plan.placement === 'center') position = { ...center, scale: origin.scale };
      if (plan.placement === 'near') {
        const { x, y, scale, threshold, mirror } = plan.position;
        const upper = origin.y < threshold ? 0 : 1;
        position = { x: origin.x + x[towardsRight ? 0 : 1] * origin.scale, y: origin.y + y[upper] * origin.scale,
          scale: origin.scale * scale[upper], mirror: mirror && towardsRight };
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
        if (actor) remaining++;
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
