const component = /^[A-Za-z0-9_-]+$/;
export const yjcmClipFile = /^[A-Za-z0-9_-]+\.(sk|skel)$/;
export const yjcmSkillName = name => typeof name === 'string' ? name.normalize('NFKC').trim() : '';
export const YJCM_EFFECT_SCHEMA = 2;

function clip(file, name = 0, extension = '.sk') {
  if (typeof file !== 'string') return;
  if (component.test(file)) file += extension;
  if (yjcmClipFile.test(file) && (name === 0 || component.test(name))) return { file, name };
}

function position(row, threshold, mirror = false) {
  return { x: [Number(row.LeftX) || 0, Number(row.RightX) || 0],
    y: [Number(row.TopY) || 0, Number(row.BottomY) || 0],
    scale: [(Number(row.TopScale) || 100) / 100, (Number(row.BottomScale) || 100) / 100],
    threshold, mirror };
}

function companion(rows, id) {
  const row = rows?.find(row => String(row.SkillID).split('|').some(value => Number(value) === id));
  const animation = clip(row?.FileName, row?.AnimateName || 0);
  if (animation) return { ...animation, x: Number(row.OffSetX) || 0, y: Number(row.OffSetY) || 0,
    scale: (Number(row.Scale) || 100) / 100 };
}

export function yjcmFormEffects(form, skin, spine, skillNames, awake, staticSkin) {
  const resource = String(form.Resource ?? '');
  if (!component.test(resource)) return;
  const seatEntry = spine?.EnterSceneAnimateInfoInGame?.find(row => row.Index === 1);
  const entry = seatEntry ? clip(seatEntry.FileName) : !skin.IsNoChuChangEffect && clip('chuchang');
  const enter = entry && (seatEntry || skin.IsNewChuChang || staticSkin?.IsNewChuChang
    ? { clips: [entry], placement: 'seat', replace: true }
    : { clips: [entry], placement: 'near', replace: true,
      position: position(form.DynamicDebut ?? skin.DynamicDebut ?? {}, 200) });

  function actions(rows, inSeat) {
    return (rows ?? []).flatMap(row => {
      const ids = [...new Set(String(row.SkillID).split('|').map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
      const names = String(row.AnimateNames ?? '').split('|');
      const clips = String(row.FileNames ?? '').split('|').map((file, i) => clip(file, names[i] || 0)).filter(Boolean);
      if (!ids.length || !clips.length) return [];
      const action = {
        clips, placement: inSeat ? 'seat' : row.Center ? 'center' : 'near', replace: true,
        position: position(row, 250, true), maxCount: Number(row.MaxCount) || 0,
        background: !inSeat ? clip(spine.BgAnimateName) : undefined,
      };
      return ids.map(id => ({ ...action, id, name: id > 2 ? skillNames.get(id) : undefined,
        projectile: companion(spine.DefenceBallisticAnimateInfos, id),
        impact: companion(spine.DefenceAnimateInfos, id) }));
    });
  }
  const transition = clip(form === awake ? awake?.ChangeSkinEffect : awake?.RestoreSkinEffect, 0, '.skel');
  return { resource, enter, actions: [...actions(spine?.AttackAnimateInfos, false), ...actions(spine?.AttackAnimateInSeatInfos, true)],
    transition: transition && { clips: [transition], placement: 'seat', shared: true } };
}
