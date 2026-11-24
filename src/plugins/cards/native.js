import { observedHandCandidates, cardsInZone, zoneKey, seatLabel } from './model.js';
import { createSortControls, sortControlsOrigin } from './sort-controls.js';
import { createShanheAutoPlay } from './shanhe-auto-play.js';
import { createCountdowns } from './countdowns.js';
import { createSeatReveals, nativeAnchor } from '../../shared/card-reveals.js';
import { pokerRevealedHand } from '../../shared/card-miniatures.js';
import { createSkillCounts } from './skill-counts.js';
import { compareHandTypes } from './hand-order.js';
import { createHandGrouping, setHandGroupingMode } from './hand-groups.js';
import { ResourceScope } from '../../core/resources.js';
import { isNativePokerTable } from '../../shared/poker-table-mode.js';
import { isPokerReplayActive } from '../../shared/poker-replay-mode.js';

export const SORT_INHIBITOR_SKILL = 0xde2;
export { REVEAL_COLUMN_LEVELS, REVEAL_OPACITY_LEVELS, nativeAnchor, revealColumns, revealOpacity,
  revealWindowClip, seatRevealAnchor } from '../../shared/card-reveals.js';

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

export function createNativeEnhancements(ctx, overlay, makeCard, refreshSettings, readState = ctx.getState,
  { initialScene } = {}) {
  const { document, window, game, scope, settings } = ctx;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const reveals = createSeatReveals(ctx, overlay);
  const labelLayer = node('div', 'sgs-card-label-layer');
  const countdowns = createCountdowns(ctx);
  const skillCounts = createSkillCounts(ctx);
  const handGrouping = createHandGrouping(ctx);
  overlay.append(labelLayer);
  let ownedButton = null, original = null, previousSignature = '', lockedMode = settings.get('lockedSort', null);
  let disposed = false, restoreSelectionWindow = null, patchedSelectionPrototype = null;
  let labelSignature = '';
  let lastScene = initialScene;
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
    const state = readState();
    if (!state) return;
    if (state.active) {
      try { lastScene = game.getScene?.() ?? null; } catch { lastScene = null; }
    }
    const scene = lastScene;
    const pokerTable = isNativePokerTable(scene);
    const pokerHands = pokerTable && !isPokerReplayActive(document) ? ctx.pokerTableCards?.read(scene) : null;
    const active = state.active && !pokerTable;
    const self = (active || pokerHands) && scene ? scene.SelfSeatUi ?? scene.selfSeatUI ?? ownUi(game) : null;
    const autoPlayMode = autoPlay.sync(scene, active ? self : null, state);
    if (!active) {
      if (labelLayer.hasChildNodes()) labelLayer.replaceChildren();
      labelSignature = '';
      skillCounts.clear(); sortControls.hide(); handGrouping.detach(); releaseOriginal();
      restoreSelectionWindow?.(); restoreSelectionWindow = null; patchedSelectionPrototype = null;
      if (!pokerHands) {
        reveals.clear();
        countdowns.clear();
        return;
      }
    }
    // Loading and lobby screens have no card overlays to position. Discovering
    // seats there repeatedly can scan thousands of native UI nodes each tick.
    let seats = [];
    try { seats = pokerHands ? scene.seatContainer?.seatUIs
      : game.getSeatUIs?.() ?? game.getScene?.()?.seatContainer?.seatUIs; } catch { /* Scene may be tearing down. */ }
    if (!Array.isArray(seats)) seats = [];
    const fourColors = settings.get('fourColors', false);
    const describe = id => {
      const { locations, tags } = state.cards[id];
      return [id, tags, locations.map(location => {
        const owner = Number(location.split(':')[1]);
        return [location, owner < 255 ? seatLabel(state, owner) : null];
      })];
    };
    reveals.update(seats, self, (ui, seatId) => {
      // Allow an earlier installed poker package to keep publishing confirmed cards.
      if (pokerHands) return pokerRevealedHand(ctx, ui, seatId, pokerHands.find(row => row.seat === seatId)?.cards);
      if (seatId === state.selfSeatId || state.seats[seatId]?.dead) return null;
      const known = cardsInZone(state, zoneKey(5, seatId));
      const possible = observedHandCandidates(state, seatId);
      if (!known.length && !possible.length) return null;
      return { count: known.length + possible.length,
        label: `${seatLabel(state, seatId)}手牌：确定有 ${known.length} 张，可能有 ${possible.length} 张`,
        signature: JSON.stringify([state.sessionId, fourColors, known.map(describe), possible.map(describe)]),
        render: () => [...known.map(id => makeCard(id, false, true, true)), ...possible.map(id => makeCard(id, true, true, true))],
      };
    }, pokerHands ? scene : undefined);
    countdowns.update([...new Set([self, ...seats].filter(Boolean))], settings.get('countdown', true), { poker: pokerTable });
    if (!active) return;
    const labels = [];
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
        labels.push({ text: tags.at(-1), title: tags.join(' · '),
          left: `${Math.max(0, Math.min(window.innerWidth - 24, anchor.x))}px`,
          top: `${Math.max(0, Math.min(window.innerHeight - 24, anchor.y))}px` });
      }
    }
    const labelKey = JSON.stringify(labels);
    if (labelKey !== labelSignature) {
      labelSignature = labelKey;
      labelLayer.replaceChildren(...labels.map(({ text, title, left, top }) => {
        const label = node('span', 'sgs-card-source-label', text);
        label.title = title; label.style.left = left; label.style.top = top;
        return label;
      }));
    }
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
    reveals.dispose(); labelLayer.remove();
  } };
}
