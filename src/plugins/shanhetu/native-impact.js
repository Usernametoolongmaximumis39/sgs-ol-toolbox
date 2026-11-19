import { optionImpact } from '../../shared/shanhe-impact.js';
import { mounted, nativeWindow, windowByClass } from './native-windows.js';

const WINDOW = 'RogueAdventureSelectWindow';

export function createImpactLabels(ctx) {
  const labels = new Map();
  function remove(card) {
    const label = labels.get(card);
    if (label && !label.destroyed) label.destroy(true);
    labels.delete(card);
  }
  const clear = () => { for (const card of labels.keys()) remove(card); };
  ctx.scope.add(clear);
  function update(season) {
    if (!season) { clear(); return; }
    const Laya = ctx.window.Laya, stage = Laya?.stage;
    const win = stage && typeof Laya.Text === 'function'
      ? nativeWindow(ctx.game, stage, WINDOW) || windowByClass(ctx.game, stage, WINDOW) : null;
    const cards = Array.isArray(win?.showItemList) ? win.showItemList.slice(0, 12) : [];
    const keep = new Set();
    const palette = ctx.ui.nativeTheme.palette;
    for (const card of cards) {
      if (!mounted(card, stage) || typeof card.addChild !== 'function') continue;
      const impact = optionImpact(season, card.id);
      if (!impact) continue;
      keep.add(card);
      let label = labels.get(card);
      if (!label || label.destroyed || label.parent !== card) {
        remove(card);
        label = new Laya.Text();
        label.name = 'sgs-shanhe-option-impact';
        label.mouseEnabled = false;
        label.mouseThrough = true;
        label.align = 'center';
        label.valign = 'middle';
        label.fontSize = 13;
        label.height = 20;
        label.stroke = 2;
        card.addChild(label);
        labels.set(card, label);
      }
      const width = Number(card.width) || 210;
      label.width = Math.max(0, width - 20);
      label.pos(10, Math.max(0, (Number(card.effectValue?.y) || 245) - 24));
      label.color = palette.highlight;
      label.strokeColor = palette.surface;
      const text = impact.changes.join(' · ');
      if (label.text !== text) label.text = text;
    }
    for (const card of labels.keys()) if (!keep.has(card)) remove(card);
  }
  return { update, clear };
}
