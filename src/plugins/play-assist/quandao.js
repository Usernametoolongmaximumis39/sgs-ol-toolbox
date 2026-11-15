// QuanDao2 (3184), not the older QuanDao (3140). Match native ami's
// FirstSkill classification, which includes elemental Sha under skill ID 1.
export function quandaoCounts(cards) {
  if (!Array.isArray(cards)) return null;
  let sha = 0, trick = 0;
  for (const card of cards) {
    if (!card?.FirstSkill) return null;
    if (Number(card.FirstSkillId) === 1) sha++;
    else if (card.FirstSkill.IsJinNang === true && card.FirstSkill.IsJudgeSkill === false) trick++;
  }
  return `${sha}/${trick}`;
}

export function createQuandaoDisplay() {
  const labels = new Map();
  function restore(item, saved) {
    if (!item.destroyed && item.Skill === saved.skill && item.label === saved.value) {
      item.label = saved.original;
      item.adjustLabelSize?.();
    }
    labels.delete(item);
  }
  function clear() { for (const [item, saved] of labels) restore(item, saved); }
  function update(self, enabled) {
    const items = enabled ? (self?.skillItems || []).filter(item => !item.destroyed && Number(item.Skill?.SkillId) === 3184) : [];
    for (const [item, saved] of labels) if (!items.includes(item) || item.Skill !== saved.skill) restore(item, saved);
    const value = items.length ? quandaoCounts(self?.seat?.HandCards) : null;
    for (const item of items) {
      if (value === null) { if (labels.has(item)) restore(item, labels.get(item)); continue; }
      let saved = labels.get(item);
      if (!saved) { saved = {skill:item.Skill, original:item.label, value:null}; labels.set(item, saved); }
      else if (item.label !== saved.value) saved.original = item.label;
      saved.value = value;
      if (item.label !== value) { item.label = value; item.adjustLabelSize?.(); }
    }
  }
  return {update, clear};
}
