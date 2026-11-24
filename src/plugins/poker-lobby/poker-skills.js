import { read } from '../../shared/safe-read.js';

export function pokerSkill(ctx, id) {
  return read(() => {
    const PokerSkill = ctx.game.getClass('PokerSkill');
    if (typeof PokerSkill?.GetInstance !== 'function') return null;
    const skill = PokerSkill.GetInstance(id, null, 0);
    return skill instanceof PokerSkill && Number(skill.ID) === id && skill.Name ? skill : null;
  }) || null;
}

export function pokerSkillsFor(ctx, info) {
  if (!Array.isArray(info?.Skills)) return [];
  const ids = new Set(info.Skills.map(Number));
  return [...ids].filter(id => Number.isSafeInteger(id) && id > 0)
    .map(id => pokerSkill(ctx, id)).filter(Boolean);
}

export function withPokerGeneralCard(scope, GeneralCard, itemId, skills, render) {
  const restore = scope.patch(GeneralCard, 'GetInstance', original => function (...args) {
    if (args.length === 1 && Number(args[0]) === itemId) return { Skills: skills };
    return Reflect.apply(original, this, args);
  });
  try { return render(); }
  finally { restore(); }
}
