import { nativeSeat, nativeSeatId, nativeSeatOccupied } from '../core/seat.js';

export const CARD_OVERLAY_STYLES = `.sgs-cards-overlay{position:fixed;inset:0;z-index:2147482900;pointer-events:none;font:12px/1.4 var(--sgs-font,"Microsoft YaHei",sans-serif);color:var(--sgs-text,#eee3cc)}`;
export const SEAT_REVEAL_STYLES = `
.sgs-card-seat-layer{position:absolute;inset:0;pointer-events:none}.sgs-card-seat-reveal{position:absolute}
.sgs-card-seat-reveal{display:grid;grid-template-columns:repeat(var(--sgs-reveal-columns),minmax(0,1fr));gap:calc(2px * var(--sgs-reveal-scale));align-content:start;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;pointer-events:auto;touch-action:pan-y;overscroll-behavior:contain}.sgs-card-seat-reveal::-webkit-scrollbar{display:none}
.sgs-card-seat-reveal .sgs-card-mini{width:100%;min-width:0;height:calc(54px * var(--sgs-reveal-scale));pointer-events:auto}.sgs-card-seat-reveal .sgs-card-suit,.sgs-card-seat-reveal .sgs-card-name{font-size:calc(16px * var(--sgs-reveal-scale))}.sgs-card-seat-reveal .sgs-card-certainty{font-size:calc(9px * var(--sgs-reveal-scale));line-height:calc(10px * var(--sgs-reveal-scale));text-align:center}.sgs-card-seat-reveal .sgs-card-mini:hover{z-index:1}
.sgs-card-seat-reveal[data-poker] .sgs-card-suit,.sgs-card-seat-reveal[data-poker] .sgs-card-name{font-size:clamp(8px,calc(16px * var(--sgs-reveal-scale)),16px)}
.sgs-card-mini.has-only-rank{grid-template-rows:1fr}.sgs-card-mini.has-only-rank .sgs-card-suit{border:0}.sgs-card-mini.has-only-rank .sgs-card-name{display:none}
`;

export const REVEAL_OPACITY_LEVELS = Object.freeze([60, 80, 100]);
export const REVEAL_COLUMN_LEVELS = Object.freeze([4, 5, 6, 7, 8]);
const DEFAULT_REVEAL_COLUMNS = 7;

export function revealOpacity(settings) {
  const value = settings.get('revealOpacity', 80);
  return REVEAL_OPACITY_LEVELS.includes(value) ? value : 80;
}

export function revealColumns(settings) {
  const value = settings.get('revealColumns', DEFAULT_REVEAL_COLUMNS);
  return REVEAL_COLUMN_LEVELS.includes(value) ? value : DEFAULT_REVEAL_COLUMNS;
}

function canvasBounds(window, laya) {
  const rendered = laya?.Render?.canvas;
  const source = rendered?.source ?? rendered;
  const canvas = typeof source?.getBoundingClientRect === 'function' ? source : window.document.getElementById('layaCanvas') ?? window.document.querySelector('canvas');
  return canvas?.getBoundingClientRect?.();
}

/** Only use established coordinates; a missing transform leaves the panel usable. */
export function nativeAnchor(window, target, x = 0, y = 0, bounds = canvasBounds) {
  if (!target || target.destroyed || target.visible === false || target._visible === false || typeof target.localToGlobal !== 'function') return null;
  try {
    const ancestors = new Set();
    for (let node = target; node; node = node.parent) {
      if (ancestors.has(node) || ancestors.size >= 64 || node.destroyed || node.visible === false || node._visible === false) return null;
      ancestors.add(node);
    }
    const laya = window.Laya ?? window.laya;
    const point = laya?.Point ? new laya.Point(x, y) : { x, y };
    const global = target.localToGlobal(point, true) ?? point;
    const stage = laya?.stage;
    const rect = bounds(window, laya);
    if (!rect?.width || !rect?.height || !Number.isFinite(global.x) || !Number.isFinite(global.y)) return null;
    const width = Number(stage?.width) || rect.width, height = Number(stage?.height) || rect.height;
    return { x: rect.left + global.x * rect.width / width, y: rect.top + global.y * rect.height / height };
  } catch { return null; }
}

// Native table-seat controllers are NOT added to the display tree. Their
// portraits are children of seatAvatarSprite, which carries the scene offset
// and game scale. Converting the controller itself loses that transform.
export function seatRevealAnchor(window, ui, bounds) {
  if (!ui || ui.destroyed || ui.visible === false || ui._visible === false) return null;
  try {
    const avatar = ui.seatAvatar ?? ui.SeatAvatar;
    if (avatar) {
      const clip = avatar.scrollRect;
      const height = Number(clip?.height ?? avatar.height);
      if (avatar.parent === null || avatar.displayedInStage === false || !Number.isFinite(height) || height <= 0 || clip && !(clip.width > 0)) return null;
      // Double-general portraits crop their middle: Kjt.ShowType sets
      // scrollRect.x=36. Laya.localToGlobal subtracts that scroll offset, so
      // convert the visible rectangle's corner, not the unclipped (0,height).
      const x = Number.isFinite(clip?.x) ? clip.x : 0;
      const y = Number.isFinite(clip?.y) ? clip.y : 0;
      return nativeAnchor(window, avatar, x, y + height, bounds);
    }
    // Verified client fallback: GetEffectPos uses seatBaseSprite with seatX/Y;
    // ScaledHeight already includes the portrait's per-seat scale.
    const { seatBaseSprite, seatX, seatY, ScaledHeight } = ui;
    if (seatBaseSprite && [seatX, seatY, ScaledHeight].every(Number.isFinite) && ScaledHeight > 0) {
      return nativeAnchor(window, seatBaseSprite, seatX, seatY + ScaledHeight, bounds);
    }
    return null;
  } catch { return null; }
}

// Only native card-interaction windows can cover revealed hands. Never use
// aggregate child bounds: hidden/offscreen children can enlarge those bounds.
export function revealWindowClip(window, game, bounds) {
  const classes = ['CheckSeatCardWindow', 'SelectCardWindow'].flatMap(name => {
    try { const type = game?.getClass?.(name); return typeof type === 'function' ? [type] : []; }
    catch { return []; }
  });
  if (!classes.length) return '';
  const stage = (window.Laya ?? window.laya)?.stage;
  let regions = [{ x: 0, y: 0, right: window.innerWidth, bottom: window.innerHeight }];
  let clipped = false;
  const queue = [...(stage?._children || [])], seen = new Set();
  for (let i = 0; i < queue.length && i < 128; i++) {
    const layer = queue[i];
    if (!layer || seen.has(layer) || layer.destroyed || layer.visible === false || layer._visible === false || layer.alpha === 0) continue;
    seen.add(layer);
    if (layer.layerOrder === 4 || layer.LayerOrder === 4) {
      for (const panel of (layer._children || []).slice(0, 128)) {
        if (!panel || !classes.some(type => panel instanceof type)) continue;
        let attached = false;
        const ancestors = new Set();
        for (let node = panel; node && !ancestors.has(node) && ancestors.size < 64; node = node.parent) {
          if (node.destroyed || node.visible === false || node._visible === false || node.alpha === 0 || node.scaleX === 0 || node.scaleY === 0) break;
          if (node === stage) { attached = true; break; }
          ancestors.add(node);
        }
        if (!attached) continue;
        try {
          const b = panel.scrollRect ?? { x: 0, y: 0, width: panel.width, height: panel.height };
          if (!(b.width > 0 && b.height > 0)) continue;
          const points = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]]
            .map(([x, y]) => nativeAnchor(window, panel, x, y, bounds));
          if (points.some(p => !p)) continue;
          const x = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
          const y = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
          regions = regions.flatMap(r => {
            const l = Math.max(r.x, x), t = Math.max(r.y, y), rr = Math.min(r.right, right), bb = Math.min(r.bottom, bottom);
            if (l >= rr || t >= bb) return [r];
            clipped = true;
            return [{ ...r, bottom: t }, { ...r, y: bb }, { x: r.x, y: t, right: l, bottom: bb }, { x: rr, y: t, right: r.right, bottom: bb }]
              .filter(a => a.right > a.x && a.bottom > a.y);
          });
        } catch { /* A native window may be closing. */ }
      }
    } else if (layer.layerOrder !== 2 && layer.LayerOrder !== 2 && Array.isArray(layer._children)) queue.push(...layer._children);
  }
  if (!clipped) return '';
  const path = regions.map(r => 'M' + r.x + ' ' + r.y + 'H' + r.right + 'V' + r.bottom + 'H' + r.x + 'Z').join('') || 'M0 0Z';
  return 'path("' + path + '")';
}

export function createSeatReveals({ window, document, game, settings }, overlay) {
  const seatLayer = document.createElement('div');
  seatLayer.className = 'sgs-card-seat-layer';
  overlay.append(seatLayer);

  function update(seats, self, readHand, pokerScene) {
    const revealBoxes = new Map([...seatLayer.children].map(box => [box.dataset.seatId, box]));
    const visibleReveals = new Set();
    const revealWrites = [];
    let revealClip = '';
    if (seats.length && settings.get('reveals', true)) {
      let rect;
      let measured = false;
      const bounds = (win, laya) => {
        if (!measured) {
          rect = canvasBounds(win, laya);
          measured = true;
        }
        return rect;
      };
      const anchors = new Map();
      const anchorFor = ui => {
        if (!anchors.has(ui)) anchors.set(ui, seatRevealAnchor(window, ui, bounds));
        return anchors.get(ui);
      };
      const { innerWidth, innerHeight } = window;
      const handTop = pokerScene && nativeAnchor(window, self?.cardContainer, 0, self?.cardContainer?.NORMAL_Y, bounds)?.y;
      const tableRight = nativeAnchor(window, pokerScene?.rightView, 0, 0, bounds)?.x;
      const revealRight = tableRight > 0 ? Math.min(innerWidth, tableRight) : innerWidth;
      const columns = revealColumns(settings);
      const rowWidth = columns * 42 - 2;
      seats.forEach(ui => {
        const seatId = nativeSeatId(ui);
        if (!nativeSeatOccupied(ui) || seatId === undefined || ui === self || nativeSeat(ui)?.IsDead || nativeSeat(ui)?.isDead) return;
        const hand = readHand(ui, seatId);
        if (!hand?.count) return;
        const anchor = anchorFor(ui);
        if (!anchor) return;
        const avatar = ui.seatAvatar ?? ui.SeatAvatar;
        const clip = avatar?.scrollRect;
        const top = avatar && nativeAnchor(window, avatar, Number(clip?.x) || 0, Number(clip?.y) || 0, bounds);
        // Scale the default seven-card row with the visible portrait height.
        const portraitScale = Math.min(1, top && anchor.y > top.y ? (anchor.y - top.y) / 172 : 1);
        const left = Math.max(0, anchor.x - 20 * portraitScale);
        const right = avatar && nativeAnchor(window, avatar,
          (Number(clip?.x) || 0) + Number(clip?.width ?? avatar.width),
          (Number(clip?.y) || 0) + Number(clip?.height ?? avatar.height), bounds);
        let available = Math.min(revealRight - left - 4, (DEFAULT_REVEAL_COLUMNS * 42 - 2) * portraitScale);
        if (right && right.x > anchor.x) available = Math.min(available, right.x - anchor.x + 40 * portraitScale);
        const sameRowHeight = 54 * Math.max(portraitScale, available / rowWidth);
        for (const other of seats) {
          if (other === ui || !nativeSeatOccupied(other)) continue;
          const next = anchorFor(other);
          if (next && next.x > anchor.x && Math.abs(next.y - anchor.y) < sameRowHeight)
            available = Math.min(available, next.x - anchor.x - 4);
        }
        const scale = Math.max(1, available) / rowWidth;
        const visibleColumns = Math.min(columns, hand.count);
        const revealWidth = (visibleColumns * 42 - 2) * scale;
        const timer = pokerScene && ui.otherTopManager?.countdownTimer;
        const countdownBottom = timer?.parent && timer.countTween && nativeAnchor(window, timer, 0, timer.height, bounds)?.y;
        const revealTop = Math.max(anchor.y, countdownBottom > 0 ? countdownBottom + 4 : 0);
        revealWrites.push(() => {
          const key = String(seatId);
          let box = revealBoxes.get(key);
          if (!box) {
            box = document.createElement('div');
            box.className = 'sgs-card-seat-reveal';
            box.dataset.seatId = key;
            box.tabIndex = 0;
          }
          visibleReveals.add(box);
          box.toggleAttribute('data-poker', Boolean(pokerScene));
          if (box.getAttribute('aria-label') !== hand.label) box.setAttribute('aria-label', hand.label);
          if (box.dataset.cards !== hand.signature) {
            box.replaceChildren(...hand.render());
            box.dataset.cards = hand.signature;
          }
          const revealScale = String(scale);
          if (box.style.getPropertyValue('--sgs-reveal-scale') !== revealScale) box.style.setProperty('--sgs-reveal-scale', revealScale);
          const gridColumns = String(visibleColumns);
          if (box.style.getPropertyValue('--sgs-reveal-columns') !== gridColumns) box.style.setProperty('--sgs-reveal-columns', gridColumns);
          const layout = {
            width: revealWidth,
            left: Math.max(0, Math.min(revealRight - revealWidth - 4, left)),
            top: Math.max(0, Math.min(innerHeight - 24, revealTop)),
            // Two full rows plus half of the third hint at the scrollable content.
            maxHeight: Math.max(0, Math.min(139 * scale, (handTop || innerHeight) - revealTop - 4)),
          };
          for (const [property, pixels] of Object.entries(layout)) {
            const value = pixels + 'px';
            if (box.style[property] !== value) box.style[property] = value;
          }
          if (!box.parentNode) seatLayer.append(box);
        });
      });
      if (revealWrites.length) revealClip = revealWindowClip(window, game, bounds);
    }
    const opacity = String(revealOpacity(settings) / 100);
    if (seatLayer.style.opacity !== opacity) seatLayer.style.opacity = opacity;
    if (seatLayer.style.clipPath !== revealClip) seatLayer.style.clipPath = revealClip;
    revealWrites.forEach(write => write());
    for (const box of revealBoxes.values()) if (!visibleReveals.has(box)) box.remove();
  }

  return { update, clear() {
    if (seatLayer.hasChildNodes()) seatLayer.replaceChildren();
    seatLayer.style.clipPath = '';
  }, dispose: () => seatLayer.remove() };
}
