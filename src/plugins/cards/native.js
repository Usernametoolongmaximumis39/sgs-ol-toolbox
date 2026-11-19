import { observedHandCandidates, cardsInZone, metadata, zoneKey, seatLabel } from './model.js';
import { nativeSeat, nativeSeatId, nativeSeatOccupied } from '../../core/seat.js';
import { createSortControls, sortControlsOrigin } from './sort-controls.js';
import { createShanheAutoPlay } from './shanhe-auto-play.js';
import { createCountdowns } from './countdowns.js';
import { createSkillCounts } from './skill-counts.js';
import { compareHandTypes } from './hand-order.js';
import { createHandGrouping, setHandGroupingMode } from './hand-groups.js';
import { ResourceScope } from '../../core/resources.js';

export const SORT_INHIBITOR_SKILL = 0xde2;

function ownUi(game) {
  try { return game.getSelfSeatUI?.() ?? game.getScene?.()?.SelfSeatUi ?? null; } catch { return null; }
}

export function sortHand(game, mode, { automatic = false } = {}) {
  const self = ownUi(game), container = self?.cardContainer, button = self?.sortCardBtn;
  if (!container || !Array.isArray(container.cardUis)) return false;
  if (button?.enabled === false || button?._enabled === false || button?.disabled === true) return false;
  if (automatic && self?.seat?.HasSkill?.(SORT_INHIBITOR_SKILL)) return false;
  const cards = container.cardUis;
  const selected = new Map(cards.map(ui => [ui, ui.selected ?? ui.Selected]));
  if (mode === 'type') {
    if (typeof container.SortNormalCards !== 'function') return false;
    const seat = container.seat ?? container.Seat;
    if (typeof seat?.SortHandCardsCompare === 'function') {
      // Let the native operation retain its synchronization and special-skill
      // behavior, with our priority before its equipment / same-card ordering.
      const temporary = new ResourceScope();
      try {
        temporary.patch(seat, 'SortHandCardsCompare', original => function (a, b) {
          return compareHandTypes(a, b) || original.call(this, a, b);
        });
        container.SortNormalCards();
      } finally { temporary.dispose(); }
    } else {
      container.SortNormalCards();
      cards.sort((a, b) => compareHandTypes(a.Card, b.Card));
      if (Array.isArray(seat?.HandCards)) seat.HandCards.sort(compareHandTypes);
      for (const ui of cards) {
        if (typeof ui.clear === 'function' && typeof ui.Draw === 'function') { ui.clear(false); ui.Draw(container); }
      }
      container.invalidateLayoutHandCard?.();
    }
  } else {
    if (mode !== 'suit' && mode !== 'number') return false;
    const suitOrder = [3, 1, 4, 2];
    const value = ui => mode === 'number' ? Number(ui.Card?.CardNumber) || 0 :
      (suitOrder.includes(Number(ui.Card?.FlowerOnSeat)) ? suitOrder.indexOf(Number(ui.Card?.FlowerOnSeat)) : 4);
    cards.sort((a, b) => value(a) - value(b));
    if (Array.isArray(container.seat?.HandCards)) {
      const order = new Map(cards.map((ui, index) => [ui.Card, index]));
      container.seat.HandCards.sort((a, b) => (order.get(a) ?? cards.length) - (order.get(b) ?? cards.length));
    }
    // Match SortNormalCards: layout moves cards but does not reorder the
    // flat renderer's existing graphics commands. Reattach in sorted order.
    for (const ui of cards) {
      if (typeof ui.clear === 'function' && typeof ui.Draw === 'function') {
        ui.clear(false);
        ui.Draw(container);
      }
    }
    container.invalidateLayoutHandCard?.();
  }
  setHandGroupingMode(container, mode);
  for (const [ui, value] of selected) {
    if (value !== undefined && (ui.selected ?? ui.Selected) !== value) {
      if (typeof ui.setSelected === 'function') ui.setSelected(value);
      else if ('selected' in ui) ui.selected = value;
    }
  }
  return true;
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

// Flat card UIs are drawn by a real Sprite using renderX/Y; their own global
// point can be zero before Draw, or their controller may not be in the tree.
export function handSourceAnchor(window, ui) {
  if (!ui || ui.destroyed || ui.visible === false || ui._visible === false || ui.drawed === false) return null;
  try {
    if (ui.render) {
      if (![ui.renderX, ui.renderY].every(Number.isFinite)) return null;
      const sx = Number.isFinite(ui.renderScaleX) ? ui.renderScaleX : 1;
      const sy = Number.isFinite(ui.renderScaleY) ? ui.renderScaleY : 1;
      return nativeAnchor(window, ui.render, ui.renderX + 4 * sx, ui.renderY + 3 * sy);
    }
    return ui.parent ? nativeAnchor(window, ui, 4, 3) : null;
  } catch { return null; }
}

function signature(container) {
  return (container?.cardUis || []).map(ui => ui.Card?.CardId ?? ui.Card?.cardId).sort((a, b) => a - b).join(',');
}

// The hand container is attached to the self-seat display tree. Position above
// its normal card row, to the right of the phase label, rather than at the
// native sort button on the far right. Convert both offsets with game scaling.
export function handSortAnchor(window, self) {
  try {
    const container = self?.cardContainer, rect = container?.HandCardRect;
    if (!container?.parent || !Number.isFinite(rect?.x) || !Number.isFinite(container.NORMAL_Y)) return null;
    const { x, y } = sortControlsOrigin(container);
    return nativeAnchor(window, container, x, y);
  } catch { return null; }
}

// GameScene repositions this attached native widget when the right panel is
// toggled. Following its bounds also handles game scale and canvas offsets.
export function roundInfoBounds(window, scene) {
  try {
    const round = scene?.gameRoundInfo;
    if (!round?.parent || !Number.isFinite(round.width) || !Number.isFinite(round.height) || round.width <= 0 || round.height <= 0) return null;
    const start = nativeAnchor(window, round), end = nativeAnchor(window, round, round.width, round.height);
    if (!start || !end || end.x <= start.x || end.y <= start.y) return null;
    return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
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

export function createNativeEnhancements(ctx, overlay, makeCard, refreshSettings) {
  const { document, window, game, scope, settings } = ctx;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const seatLayer = node('div', 'sgs-card-seat-layer');
  const labelLayer = node('div', 'sgs-card-label-layer');
  const countdowns = createCountdowns(ctx);
  const skillCounts = createSkillCounts(ctx);
  const handGrouping = createHandGrouping(ctx);
  overlay.append(seatLayer, labelLayer);
  let ownedButton = null, original = null, previousSignature = '', lockedMode = settings.get('lockedSort', null);
  let disposed = false, restoreSelectionWindow = null, patchedSelectionPrototype = null;
  let lastScene;
  const autoPlay = createShanheAutoPlay(ctx);
  const sortControls = createSortControls(ctx, {
    toggleAutoPlay: autoPlay.toggle,
    sort(mode) { if (!sortHand(game, mode)) ctx.notify?.('当前手牌暂不能整理'); },
    lock(mode) {
      lockedMode = lockedMode === mode ? null : mode;
      settings.set('lockedSort', lockedMode);
      if (lockedMode) sortHand(game, lockedMode, { automatic: true });
      refreshSettings?.();
    },
  });

  function releaseOriginal() {
    if (ownedButton && original && !ownedButton.destroyed) {
      if (ownedButton.alpha === 0) ownedButton.alpha = original.alpha;
      if (ownedButton.mouseEnabled === false) ownedButton.mouseEnabled = original.mouseEnabled;
    }
    ownedButton = null; original = null;
    previousSignature = '';
  }

  function position(element, anchor) {
    if (!anchor) { element.hidden = true; return; }
    element.hidden = false;
    element.style.left = `${Math.max(0, Math.min(window.innerWidth - 24, anchor.x))}px`;
    element.style.top = `${Math.max(0, Math.min(window.innerHeight - 24, anchor.y))}px`;
  }

  function updateSelectionOrder() {
    if (!settings.get('handSort', true)) {
      restoreSelectionWindow?.(); restoreSelectionWindow = null; patchedSelectionPrototype = null;
      return;
    }
    let proto;
    try { proto = game.getClass?.('SelectCardWindow')?.prototype; } catch { return; }
    if (!proto || proto === patchedSelectionPrototype || typeof proto.createCardUis !== 'function' || !scope.patch) return;
    restoreSelectionWindow?.();
    patchedSelectionPrototype = proto;
    restoreSelectionWindow = scope.patch(proto, 'createCardUis', originalMethod => function (cards, ...args) {
      if (!Array.isArray(cards)) return originalMethod.call(this, cards, ...args);
      const current = ownUi(game)?.cardContainer?.cardUis || [];
      const order = new Map(current.map((ui, index) => [ui.Card?.CardId, index]));
      const local = cards.filter(item => order.has(item?.CardId)).sort((a, b) => order.get(a.CardId) - order.get(b.CardId));
      let index = 0;
      return originalMethod.call(this, cards.map(item => order.has(item?.CardId) ? local[index++] : item), ...args);
    });
  }

  function update(allowAutoPlay = false) {
    if (disposed) return;
    const state = ctx.getState();
    if (!state) return;
    if (state.active) {
      try { lastScene = game.getScene?.() ?? null; } catch { lastScene = null; }
    }
    const scene = lastScene;
    const self = state.active && scene ? scene.SelfSeatUi ?? scene.selfSeatUI ?? ownUi(game) : null;
    const autoPlayMode = autoPlay.sync(scene, self, state);
    const revealBoxes = new Map([...seatLayer.children].map(box => [box.dataset.seatId, box]));
    const visibleReveals = new Set();
    if (!state.active) {
      seatLayer.replaceChildren();
      labelLayer.replaceChildren();
      seatLayer.style.clipPath = '';
      countdowns.clear(); skillCounts.clear(); sortControls.hide(); handGrouping.detach(); releaseOriginal();
      restoreSelectionWindow?.(); restoreSelectionWindow = null; patchedSelectionPrototype = null;
      return;
    }
    // Loading and lobby screens have no card overlays to position. Discovering
    // seats there repeatedly can scan thousands of native UI nodes each tick.
    let seats = [];
    try { seats = game.getSeatUIs?.() ?? game.getScene?.()?.seatContainer?.seatUIs ?? []; } catch { /* Scene may be tearing down. */ }
    if (!Array.isArray(seats)) seats = [];
    const revealWrites = [];
    let revealClip = '';
    if (settings.get('reveals', true)) {
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
      const fourColors = settings.get('fourColors', false);
      const describe = id => {
        const { locations, tags } = state.cards[id];
        return [id, tags, locations.map(location => {
          const owner = Number(location.split(':')[1]);
          return [location, owner < 255 ? seatLabel(state, owner) : null];
        })];
      };
      seats.forEach(ui => {
        const seatId = nativeSeatId(ui);
        if (!nativeSeatOccupied(ui) || seatId === undefined || seatId === state.selfSeatId || ui === self || nativeSeat(ui)?.IsDead || nativeSeat(ui)?.isDead || state.seats[seatId]?.dead) return;
        const known = cardsInZone(state, zoneKey(5, seatId));
        const possible = observedHandCandidates(state, seatId);
        if (!known.length && !possible.length) return;
        const anchor = anchorFor(ui);
        if (!anchor) return;
        const avatar = ui.seatAvatar ?? ui.SeatAvatar;
        const clip = avatar?.scrollRect;
        const top = avatar && nativeAnchor(window, avatar, Number(clip?.x) || 0, Number(clip?.y) || 0, bounds);
        // A standard native portrait is 172 game units high. Use its visible
        // height in CSS pixels, including per-seat and canvas scaling. Cap at
        // 40 × 54 CSS pixels per card when desktop portraits grow larger.
        const scale = Math.min(1, top && anchor.y > top.y ? (anchor.y - top.y) / 172 : 1);
        const left = Math.max(0, anchor.x - 20 * scale);
        const right = avatar && nativeAnchor(window, avatar,
          (Number(clip?.x) || 0) + Number(clip?.width ?? avatar.width),
          (Number(clip?.y) || 0) + Number(clip?.height ?? avatar.height), bounds);
        let available = innerWidth - left - 4;
        if (right && right.x > anchor.x) available = Math.min(available, right.x - anchor.x + 40 * scale);
        for (const other of seats) {
          if (other === ui || !nativeSeatOccupied(other)) continue;
          const next = anchorFor(other);
          if (next && next.x > anchor.x && Math.abs(next.y - anchor.y) < 54 * scale)
            available = Math.min(available, next.x - anchor.x - 4);
        }
        const revealWidth = Math.max(1, Math.min(344 * scale, available, ((known.length + possible.length) * 42 - 2) * scale));
        revealWrites.push(() => {
          const key = String(seatId);
          const box = revealBoxes.get(key) ?? node('div', 'sgs-card-seat-reveal');
          visibleReveals.add(box);
          if (!box.parentNode) {
            box.dataset.seatId = key;
            box.tabIndex = 0;
          }
          const label = `${seatLabel(state, seatId)}手牌：确定有 ${known.length} 张，可能有 ${possible.length} 张`;
          if (box.getAttribute('aria-label') !== label) box.setAttribute('aria-label', label);
          const signature = JSON.stringify([state.sessionId, fourColors, known.map(describe), possible.map(describe)]);
          if (box.dataset.cards !== signature) {
            box.replaceChildren(
              ...known.map(id => makeCard(id, false, true, true)),
              ...possible.map(id => makeCard(id, true, true, true)));
            box.dataset.cards = signature;
          }
          const revealScale = String(scale);
          if (box.style.getPropertyValue('--sgs-reveal-scale') !== revealScale) box.style.setProperty('--sgs-reveal-scale', revealScale);
          const layout = {
            width: revealWidth,
            left: Math.max(0, Math.min(innerWidth - revealWidth - 4, left)),
            top: Math.max(0, Math.min(innerHeight - 24, anchor.y)),
            // Two full rows plus half of the third hint at the scrollable content.
            maxHeight: Math.max(0, Math.min(139 * scale, innerHeight - anchor.y - 4)),
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
    if (seatLayer.style.clipPath !== revealClip) seatLayer.style.clipPath = revealClip;
    revealWrites.forEach(write => write());
    for (const box of revealBoxes.values()) if (!visibleReveals.has(box)) box.remove();
    labelLayer.replaceChildren();
    skillCounts.update(self, state, settings.get('skillCounts', true));
    if (settings.get('labels', true)) {
      for (const ui of self?.cardContainer?.cardUis || []) {
        const id = ui.Card?.CardId ?? ui.Card?.cardId;
        const record = state.cards[id];
        const tags = record?.tags?.filter(tag => tag !== '摸牌');
        if (!tags?.length) continue;
        if (record.locations.length !== 1 || record.locations[0] !== zoneKey(5, state.selfSeatId)) continue;
        const anchor = handSourceAnchor(window, ui);
        if (!anchor) continue;
        const label = node('span', 'sgs-card-source-label', tags.at(-1));
        label.title = tags.join(' · '); position(label, anchor); labelLayer.append(label);
      }
    }
    countdowns.update([...new Set([self, ...seats].filter(Boolean))], settings.get('countdown', true));
    updateSelectionOrder();
    handGrouping.update(settings.get('handSort', true) ? self?.cardContainer : null);
    const button = self?.sortCardBtn;
    const anchor = settings.get('handSort', true) ? handSortAnchor(window, self) : null;
    const canReplaceSort = button && button.enabled !== false && button._enabled !== false && button.disabled !== true;
    if (!anchor || (!canReplaceSort && !autoPlayMode) || !sortControls.update(self.cardContainer, lockedMode, autoPlayMode)) {
      sortControls.hide(); releaseOriginal(); return;
    }
    if (!canReplaceSort) releaseOriginal();
    else if (button !== ownedButton) {
      releaseOriginal(); ownedButton = button;
      original = { alpha: button.alpha ?? 1, mouseEnabled: button.mouseEnabled ?? true };
    }
    if (canReplaceSort) { button.alpha = 0; button.mouseEnabled = false; }
    const nextSignature = signature(self.cardContainer);
    if (nextSignature !== previousSignature) {
      if (lockedMode) sortHand(game, lockedMode, { automatic: true });
      previousSignature = nextSignature;
    }
    if (allowAutoPlay) autoPlay.update({ scene, self, state });
  }
  scope.interval(() => update(true), 250);
  const sceneUnsubscribe = game.onSceneChange?.(scene => { lastScene = scene; update(); });
  if (typeof sceneUnsubscribe === 'function') scope.add(sceneUnsubscribe);
  update();
  return { update, dispose() {
    if (disposed) return;
    disposed = true; countdowns.dispose(); skillCounts.dispose(); sortControls.dispose(); handGrouping.dispose(); releaseOriginal(); restoreSelectionWindow?.();
    [seatLayer, labelLayer].forEach(element => element.remove());
  } };
}
