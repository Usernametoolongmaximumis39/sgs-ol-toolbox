import { getNativeTheme } from '../../ui/native-theme.js';
import { placeStats } from './stats-model.js';
import { officerColor } from './officer-style.js';

export function displayRect(host, L) {
  if (!host || host.destroyed || host.visible === false || host.parent === null || !host.localToGlobal) return null;
  for (let n = host, i = 0; n && i < 64; n = n.parent, i++) if (n.visible === false || n.destroyed) return null;
  const a = host.localToGlobal(new L.Point(0, 0)), b = host.localToGlobal(new L.Point(host.width, host.height));
  return [a.x, a.y, b.x, b.y].every(Number.isFinite) && b.x > a.x && b.y > a.y
    ? { x: a.x - 5, y: a.y - 5, width: b.x - a.x + 10, height: b.y - a.y + 10 } : null;
}

export function portraitRect(ui, L) {
  if (!ui || ui.destroyed || ui.visible === false) return null;
  const avatar = ui.seatAvatar ?? ui.SeatAvatar, clip = avatar?.scrollRect;
  const host = avatar || ui.seatBaseSprite;
  if (!host || host.destroyed || host.parent === null || host.displayedInStage === false || typeof host.localToGlobal !== 'function') return null;
  for (let n = host, i = 0; n && i < 64; n = n.parent, i++) if (n.visible === false || n.destroyed) return null;
  const x = avatar ? clip?.x || 0 : ui.seatX, y = avatar ? clip?.y || 0 : ui.seatY;
  const w = avatar ? clip?.width || avatar.width : ui.ScaledWidth;
  const h = avatar ? clip?.height || avatar.height : ui.ScaledHeight;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const a = host.localToGlobal(new L.Point(x, y)), b = host.localToGlobal(new L.Point(x + w, y + h));
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
export function createStatsView(ctx) {
  const entries = new Map(), theme = getNativeTheme(ctx);
  let palette = theme.palette;
  function clear() { for (const e of entries.values()) e.root.destroy(true); entries.clear(); }
  ctx.scope.add(clear);
  ctx.scope.add(theme.watch(p => { palette = p; }));
  const view = { scene: null, clear, update(rows, seats = rows.map(row => row.ui)) {
    const L = ctx.window?.Laya ?? ctx.window?.laya, stage = L?.stage;
    if (!stage || !L.Sprite || !L.Text || !L.Point) { clear(); return; }
    const mapped = rows.map(row => ({ ...row, rect: portraitRect(row.ui, L) })).filter(row => row.rect);
    const portraits = seats.map(ui => ({ ui, rect: portraitRect(ui, L) })).filter(row => row.rect);
    const obstacles = portraits.flatMap(({ rect: r }) => [r,
      // Reserve the entire strip below each portrait for teammate/public hands.
      { x: r.x - 180, y: r.y + r.height - 2, width: r.width + 360, height: 110 }]);
    for (const { ui } of portraits) for (const node of [ui.otherTopManager?.handCardSpr, ui.otherTopManager?.proptip]) {
      const r = displayRect(node, L); if (r) obstacles.push(r);
    }
    const active = new Set();
    for (const row of mapped) {
      const height = row.roles ? 110 : 86;
      let position = null;
      for (const width of [248, 224, 208]) { position = placeStats(row.rect, obstacles, stage, width, height); if (position) break; }
      if (!position) continue;
      obstacles.push(position); active.add(row.ui);
      let e = entries.get(row.ui);
      if (!e || e.root.destroyed) {
        const root = new L.Sprite(); root.name = 'sgs-player-stats'; root.mouseEnabled = false; root.zOrder = 90;
        const background = new L.Sprite(); background.name = 'sgs-player-stats-background'; background.alpha = .76;
        background.mouseEnabled = false; root.addChild(background);
        const lines = Array.from({ length: 4 }, (_, i) => {
          const t = new L.Text(); t.font = 'Microsoft YaHei'; t.fontSize = 12; t.height = 23;
          t.pos(12, [9, 35, 61, 85][i]); root.addChild(t); return t;
        });
        const badge = new L.Sprite(); root.addChild(badge);
        const badgeText = new L.Text(); badgeText.width = 85; badgeText.height = 18; badge.addChild(badgeText);
        stage.addChild(root); e = { root, background, lines, badge, badgeText }; entries.set(row.ui, e);
      }
      const { root, lines, badge } = e, p = palette;
      root.pos(position.x, position.y); root.size(position.width, height);
      e.background.size(position.width, height); theme.surface(e.background, { kind: 'panel' });
      lines[0].text = row.name; lines[0].bold = true; lines[0].color = p.text;
      lines[1].text = row.second; lines[2].text = row.roles || row.third; lines[3].text = row.roles ? row.third : ''; lines[3].visible = Boolean(row.roles);
      for (const line of lines) { line.width = position.width - 24; line.fontSize = 12; line.wordWrap = false; line.overflow = 'hidden'; }
      lines[0].fontSize = 14; lines[1].fontSize = row.second.length > 22 ? 12 : 14;
      lines[1].bold = true;
      if (row.roles) while (lines[2].textWidth > lines[2].width && lines[2].fontSize > 10) lines[2].fontSize--;
      lines[0].width = position.width - 120;
      while (lines[0].textWidth > lines[0].width && lines[0].text.length > 2) lines[0].text = lines[0].text.replace(/…$/, '').slice(0, -1) + '…';
      root.ToolTip = row.name;
      lines[1].color = p.text; lines[2].color = row.roles ? p.text : row.streakState === 'win' ? p.accent : row.streakState === 'loss' ? p.danger : p.muted;
      lines[3].color = row.streakState === 'win' ? p.accent : row.streakState === 'loss' ? p.danger : p.muted;
      badge.graphics.clear();
      badge.pos(position.width - 107, 10); e.badgeText.visible = !row.robot;
      if (row.robot) {
        // Compact line icon, not a font-dependent emoji.
        badge.graphics.drawRect(5, 3, 18, 12, null, p.accent, 1.5);
        badge.graphics.drawLine(14, 0, 14, 3, p.accent, 1.5);
        badge.graphics.drawCircle(10, 8, 1.3, p.accent); badge.graphics.drawCircle(18, 8, 1.3, p.accent);
        badge.graphics.drawLine(10, 12, 18, 12, p.accent, 1); badge.graphics.drawLine(2, 6, 2, 12, p.accent, 1.5);
        badge.graphics.drawLine(26, 6, 26, 12, p.accent, 1.5);
      } else {
        const native = row.ui.otherTopManager, texture = native?.officerIcon?.texture;
        if (texture) badge.graphics.drawTexture(texture, 0, -1, 23, 20);
        const label = e.badgeText; label.text = native?.officerText?.text || '官阶未知';
        label.font = native?.officerText?.font || 'Microsoft YaHei'; label.fontSize = 12; label.bold = true;
        label.color = officerColor(label.text, p.surface, p.muted); label.pos(texture ? 27 : 0, 1);
      }
    }
    for (const [ui, e] of entries) if (!active.has(ui)) { e.root.destroy(true); entries.delete(ui); }
  } };
  return view;
}
