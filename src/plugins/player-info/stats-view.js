import { singleRiderShopVisible } from '../../shared/native-shop.js';
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

// The current ranked BP UI lives inside the scene; older variants are windows.
// Return an attached display object, without creating a window or requiring bounds.
function rankedSelection(ctx, L, scene) {
  const visible = node => {
    for (let n = node, i = 0; n && i < 64; n = n.parent, i++) {
      if (n.destroyed || n.visible === false || n._visible === false || n.alpha === 0) return false;
      if (n === L.stage) return true;
    }
    return false;
  };
  if (scene?.selectGeneralView && visible(scene.selectGeneralView)) return scene.selectGeneralView;
  const names = ['SelectNewPaiWeiGeneralWindow', 'PWRandomSelectGeneralWindow', 'PWStandardSelectGenralWindow'];
  const types = names.map(name => { try { return ctx.game.getClass(name); } catch { return null; } });
  const queue = [...(L.stage._children || [])], seen = new Set();
  for (let i = 0; i < queue.length && i < 512; i++) {
    const node = queue[i];
    if (!node || seen.has(node) || !visible(node)) continue;
    seen.add(node);
    if (names.includes(node.name) || names.includes(node.ClassName) || types.some(Type => typeof Type === 'function' && node instanceof Type)) return node;
    if (Array.isArray(node._children)) queue.push(...node._children.slice(0, 512 - queue.length));
  }
  return null;
}

function selectionRects(selection, L) {
  if (!selection) return [];
  const parts = [selection.selectGeneralItem0, selection.selectGeneralItem1, selection.selectGeneralBpItem].filter(Boolean);
  return (parts.length ? parts : [selection]).flatMap(node => {
    if (node.destroyed || node.visible === false || node.alpha === 0) return [];
    const bounds = node.getBounds();
    // getBounds is in parent coordinates, including children of zero-sized containers.
    const parent = node.parent;
    if (!parent || !bounds || bounds.width <= 0 || bounds.height <= 0) return [];
    const a = L.stage.globalToLocal(parent.localToGlobal(new L.Point(bounds.x, bounds.y)));
    const b = L.stage.globalToLocal(parent.localToGlobal(new L.Point(bounds.x + bounds.width, bounds.y + bounds.height)));
    return [{ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }];
  });
}

function maskOverlap(entry, position, rects, L) {
  const w = position.width, h = position.height;
  const overlaps = rects.map(r => ({ x: Math.max(0, r.x - position.x), y: Math.max(0, r.y - position.y),
    right: Math.min(w, r.x + r.width - position.x), bottom: Math.min(h, r.y + r.height - position.y) }))
    .filter(r => r.right > r.x && r.bottom > r.y);
  const normal = entry.parts[0], faded = entry.parts[1];
  normal.root.mask = overlaps.length ? normal.mask : null;
  faded.root.visible = overlaps.length > 0;
  if (!overlaps.length) return;
  faded.root.mask = faded.mask;
  normal.mask.graphics.clear(); faded.mask.graphics.clear();
  const xs = [...new Set([0, w, ...overlaps.flatMap(r => [r.x, r.right])])].sort((a,b) => a-b);
  const ys = [...new Set([0, h, ...overlaps.flatMap(r => [r.y, r.bottom])])].sort((a,b) => a-b);
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    const hit = overlaps.some(r => xs[x] >= r.x && xs[x+1] <= r.right && ys[y] >= r.y && ys[y+1] <= r.bottom);
    (hit ? faded.mask : normal.mask).graphics.drawRect(xs[x], ys[y], xs[x+1]-xs[x], ys[y+1]-ys[y], '#fff');
  }
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
  function disposeEntry(e) { e.root.destroy(true); for (const part of e.parts) part.mask.destroy(true); }
  function clear() { for (const e of entries.values()) disposeEntry(e); entries.clear(); }
  ctx.scope.add(clear);
  ctx.scope.add(theme.watch(p => { palette = p; }));
  const view = { scene: null, clear, update(rows, seats = rows.map(row => row.ui), mode = null) {
    const L = ctx.window?.Laya ?? ctx.window?.laya, stage = L?.stage;
    if (!stage || !L.Sprite || !L.Text || !L.Point) { clear(); return; }
    if (singleRiderShopVisible(ctx.window, ctx.game)) { clear(); return; }
    const selection = mode === 'rank' ? rankedSelection(ctx, L, view.scene) : null;
    const occluders = selectionRects(selection, L);
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
      let entry = entries.get(row.ui);
      if (!entry || entry.root.destroyed) {
        const wrapper = new L.Sprite(); wrapper.name = 'sgs-player-stats'; wrapper.mouseEnabled = false; wrapper.zOrder = 90;
        const makePart = alpha => {
        const root = new L.Sprite(); root.name = 'sgs-player-stats-content'; root.mouseEnabled = false; root.alpha = alpha;
        const background = new L.Sprite(); background.name = 'sgs-player-stats-background'; background.alpha = .76;
        background.mouseEnabled = false; root.addChild(background);
        const lines = Array.from({ length: 4 }, (_, i) => {
          const t = new L.Text(); t.font = 'Microsoft YaHei'; t.fontSize = 12; t.height = 23;
          t.pos(12, [9, 35, 61, 85][i]); root.addChild(t); return t;
        });
        const badge = new L.Sprite(); root.addChild(badge);
        const badgeText = new L.Text(); badgeText.width = 85; badgeText.height = 18; badge.addChild(badgeText);
        const mask = new L.Sprite(); wrapper.addChild(root);
        return { root, background, lines, badge, badgeText, mask };
        };
        entry = { root: wrapper, parts: [makePart(1), makePart(.5)] };
        stage.addChild(wrapper); entries.set(row.ui, entry);
      }
      entry.root.pos(position.x, position.y); entry.root.size(position.width, height);
      maskOverlap(entry, position, occluders, L);
      for (const e of entry.parts) {
      const { root, lines, badge } = e, p = palette;
      root.size(position.width, height);
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
    }
    for (const [ui, e] of entries) if (!active.has(ui)) { disposeEntry(e); entries.delete(ui); }
  } };
  return view;
}
