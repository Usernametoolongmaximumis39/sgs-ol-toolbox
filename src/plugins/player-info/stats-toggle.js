export const STATS_TOGGLE_SIZE = 28;

export function createStatsToggle(ctx, L, parent, toggle) {
  const sprite = new L.Sprite();
  const disc = new L.Sprite();
  const glyph = new L.Sprite();
  const tip = new L.Text();
  const keyboard = ctx.document.createElement('button');
  const center = STATS_TOGGLE_SIZE / 2;
  let collapsed = false, palette, hovered = false, available = true;

  sprite.name = 'sgs-player-stats-toggle';
  sprite.size(STATS_TOGGLE_SIZE, STATS_TOGGLE_SIZE);
  sprite.hitArea = new L.Rectangle(0, 0, STATS_TOGGLE_SIZE, STATS_TOGGLE_SIZE);
  disc.mouseEnabled = glyph.mouseEnabled = tip.mouseEnabled = false;
  tip.font = 'Microsoft YaHei'; tip.fontSize = 12; tip.padding = [3, 6, 3, 6];
  sprite.addChild(disc); sprite.addChild(glyph); sprite.addChild(tip); parent.addChild(sprite);

  keyboard.type = 'button'; keyboard.dataset.sgsPlayerStatsToggle = '';
  keyboard.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);pointer-events:none;white-space:nowrap';
  ctx.document.body.append(keyboard);

  function paint() {
    if (!palette) return;
    const focused = ctx.document.activeElement === keyboard;
    const active = hovered || focused;
    disc.alpha = active ? .88 : collapsed ? .25 : .46;
    disc.graphics.clear();
    disc.graphics.drawCircle(center, center, 8, palette.raised, palette.accent, 1);
    glyph.graphics.clear();
    // A contrasting edge keeps the glyph readable behind the transparent dot.
    const start = center - 3.5, end = center + 3.5;
    for (const [ink, width] of [[palette.surface, 3], [palette.text, 1.6]]) {
      glyph.graphics.drawLine(start, center, end, center, ink, width);
      if (collapsed) glyph.graphics.drawLine(center, start, center, end, ink, width);
    }
    if (focused) glyph.graphics.drawCircle(center, center, 11, null, palette.accent, 1.5);
    tip.visible = hovered;
    tip.text = available ? (collapsed ? '展开卡片' : '收起卡片') : '空间不足，暂无法展开';
    tip.color = palette.text; tip.bgColor = palette.surface;
    tip.pos(parent.x + sprite.x > tip.textWidth + 8 ? -tip.textWidth - 5 : STATS_TOGGLE_SIZE + 2, 4);
  }

  const activate = () => { if (available && sprite.visible) toggle(); };
  sprite.on(L.Event.CLICK, sprite, event => { event?.stopPropagation(); activate(); });
  sprite.on(L.Event.MOUSE_OVER, sprite, () => { hovered = true; paint(); });
  sprite.on(L.Event.MOUSE_OUT, sprite, () => { hovered = false; paint(); });
  keyboard.onclick = activate;
  keyboard.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); };
  keyboard.onfocus = keyboard.onblur = paint;

  return {
    update({ x, y }, { name, compact, visible, canExpand, colors }) {
      const redraw = compact !== collapsed || visible !== sprite.visible || canExpand !== available || colors !== palette;
      if (compact !== collapsed || sprite.x !== x || sprite.y !== y || !visible) hovered = false;
      collapsed = compact; palette = colors; available = canExpand;
      sprite.pos(x, y); sprite.visible = sprite.mouseEnabled = visible;
      keyboard.hidden = !visible;
      keyboard.setAttribute('aria-expanded', String(!compact));
      keyboard.setAttribute('aria-label', `${compact ? '展开' : '收起'}${name}的玩家信息卡片`);
      keyboard.setAttribute('aria-disabled', String(!available));
      if (redraw || tip.visible !== hovered) paint();
    },
    remove() { keyboard.remove(); },
  };
}
