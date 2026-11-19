import { getNativeTheme } from '../../ui/native-theme.js';

const count = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const prefix = /^(?:(?:锁定技|转换技|[魏蜀吴群晋]势力技)[，,])?(?:出牌阶段|每回合|每轮|每阶段|每局|整局)(?:内)?限([一二两三四五六七八九十百\d]+|[Xx])次/;
function eligible(desc, seen) {
  const match = prefix.exec(desc);
  if (!match) return false;
  return !['一', '1'].includes(match[1]) || /你的回合限(?:两|二|2)次/.test(desc) ||
    seen.size > 0 && !/[；;。](?:出牌阶段|每回合|每轮|每阶段|每局|整局)(?:内)?限/.test(desc) ||
    /(?:本技能|此技能)[^。；;]*?(?:改为)?(?:出牌阶段)?限(?:[二两三四五六七八九十百]|[2-9]|[1-9]\d+)次/.test(desc);
}

// Read-only native skill values; never infer remaining uses from button enabled.
export function skillCount(skill, seen = new Set(), state = {}, scene = {}) {
  if (!skill?.Seat) return null;
  const id = skill.SkillId, seat = skill.Seat;
  const observed = () => state.skillUses?.complete ? state.skillUses.counts[`${id}:${seat.Index}`] || 0 : null;
  const result = (limit, used) => ({ remaining: count(limit) && count(used) ? Math.max(0, limit - used) : null });
  if (id === 0xea7) return result(seat.MaxHp, observed());
  if (id === 4009) { // 刃掣的原生上限随本回合弃牌堆中的【杀】变化，最低为 1。
    return seat.InDealRound ? result(skill.TimelimitRound, skill.GetSkillUseCountInRound?.()) : null;
  }
  const desc = String(skill.SpecialModeDesc || '').replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '');
  if (!eligible(desc, seen)) return null;
  if (/^(?:(?:锁定技|转换技|[魏蜀吴群晋]势力技)[，,])?出牌阶段(?:内)?限/.test(desc) && !seat.InDealRound) return null;
  if (skill.hasUnlimitedUses?.()) return { remaining: Infinity };
  let round = skill.TimelimitRound;
  if (id === 0x35a && /每回合限三次/.test(desc)) round = 3;
  if (id === 0xc4e) round = (skill.opFlag1 === 1 || skill.opFlag2 === 1) && seat.InOwnRound2 ? 2 : 1;
  if (id === 0xc12) round = Array.isArray(scene.gameManager?.Seats) ? Math.min(3, scene.gameManager.Seats.filter(s => s?.IsLegalOperable).length) : null;
  if (id === 0xe62) round = seat.GetSkillBuffInfo?.(0xe61)?.[0] ?? null;
  if (id === 0x3d9 && round === 2) {
    const used = skill.GetSkillUseCountInRound?.(), value = seat.GetStateValue?.(0x11e);
    if (!count(used) || !count(value)) return { remaining: null };
    if (used === 0 || used === 1 && value >= 2) round = 1;
  }
  const candidates = [];
  for (const [kind, limit, read] of [
    ['round', round, () => id === 0xc12 ? observed() : skill.GetSkillUseCountInRound?.()],
    ['game', skill.TimeLimitGame, () => seat.GetSkillUseCountInGame?.(id)],
  ]) {
    if (count(limit) && limit > 1) seen.add(kind);
    if (!seen.has(kind)) continue;
    const value = result(limit, read());
    if (value.remaining === null) return value;
    candidates.push(value.remaining);
  }
  return { remaining: candidates.length ? Math.min(...candidates) : null };
}

export function createSkillCounts(ctx) {
  const labels = new Map(), seen = new Map(), theme = getNativeTheme(ctx);
  let owner = null, seat = null, session = null, releaseTheme = null;
  const paint = (palette = theme.palette) => {
    for (const label of labels.values()) if (!label.destroyed) {
      label.color = label.text === '0' ? palette.muted : palette.accent;
      label.strokeColor = palette.bg;
    }
  };
  function clear() {
    releaseTheme?.(); releaseTheme = null;
    for (const label of labels.values()) if (!label.destroyed) label.destroy(true);
    labels.clear(); seen.clear(); owner = seat = session = null;
  }
  return { clear, dispose: clear, update(self, state, enabled) {
    if (!enabled || !state.active || !self?.seat || self.destroyed) { clear(); return; }
    const identity = `${state.sessionId}:${state.deckStartSeq}`;
    if (owner !== self || seat !== self.seat || session !== identity) clear();
    owner = self; seat = self.seat; session = identity;
    const laya = ctx.window.Laya ?? ctx.window.laya;
    if (typeof laya?.Text !== 'function') return;
    const items = new Set((self.skillItems || []).filter(item => item && !item.destroyed));
    for (const [item, label] of labels) if (!items.has(item)) { if (!label.destroyed) label.destroy(true); labels.delete(item); }
    const keys = new Set();
    for (const item of items) {
      let label = labels.get(item), value = null;
      const skill = item.Skill, key = `${skill?.Seat?.Index}:${skill?.SkillCard?.CardId}:${skill?.SkillId}`;
      keys.add(key);
      if (!seen.has(key)) seen.set(key, new Set());
      try { value = skillCount(skill, seen.get(key), state, ctx.game.getScene?.()); } catch { value = { remaining: null }; }
      if (!value || !item.parent || item.visible === false || item._visible === false) { if (label) label.visible = false; continue; }
      if (!label || label.destroyed) {
        label = new laya.Text(); label.name = 'sgs-toolbox-skill-count';
        label.font = 'Arial'; label.fontSize = 12; label.bold = true; label.align = 'center';
        label.stroke = 2; label.mouseEnabled = false; label.mouseThrough = true;
        labels.set(item, label);
      }
      if (label.parent !== item.parent) item.parent.addChild(label);
      label.text = value.remaining === null ? '?' : value.remaining === Infinity ? '∞' : String(value.remaining);
      label.size(Math.max(12, label.text.length * 8), 14);
      const sx = item.scaleX ?? 1, sy = item.scaleY ?? 1;
      label.scale(sx, sy); label.pos(item.x + (item.width - label.width - 1) * sx, item.y - sy);
      label.zOrder = Math.max(...[...items].filter(other => other.parent === item.parent).map(other => other.zOrder || 0)) + 1;
      label.visible = true; item.parent.updateZOrder?.();
    }
    for (const key of seen.keys()) if (!keys.has(key)) seen.delete(key);
    if (!releaseTheme && labels.size) releaseTheme = theme.watch(paint);
    paint();
  } };
}
