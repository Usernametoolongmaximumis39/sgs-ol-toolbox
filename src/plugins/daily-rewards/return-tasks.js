// Return activities must be claimed in the game's own UI, never by this plugin.
export function isReturnTask(task) {
  const base = task?.baseVo;
  if (!base) return false;
  if (base._rewardItem?.ReturnReward || base.rewardItem?.ReturnReward) return true;
  return [base.name, base.Name, base._name, base.desc, base.Desc, base._desc]
    .some(value => typeof value === 'string' && /回归|回流|老玩家/.test(value));
}
