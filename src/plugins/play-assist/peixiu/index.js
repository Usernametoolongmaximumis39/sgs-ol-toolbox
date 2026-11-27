import { ResourceScope } from '../../../core/resources.js';
import { read } from '../../../shared/safe-read.js';
import {
  actionBar, caifengContext, cardAt, confirmButton, gameCanvas, openMap, ownedCards, readBattle, routeObstacles,
  selectSuit, setSelection, suitGeometry,
} from './native.js';
import { createOverlay, mapBoxes } from './overlay.js';
import { planRoutes, readBoard } from './routes.js';

const HOLD_MS = 500;
const RELEASE_MS = 500;
const touchAt = (touches, id) => Array.from(touches).find(touch => touch.identifier === id);

function bindBattle(ctx, battle) {
  const { document, scope, window } = ctx;
  const locked = new Set();
  const overlay = createOverlay(ctx, onSuit);
  let previousMap, previousConfig, previousState, plan, cityCount = 0;
  let press, releaseTail, heldControl;

  function releasePress() {
    press?.cancelTimer();
    press = null;
  }
  function releaseClick() {
    releaseTail?.();
    releaseTail = null;
    heldControl = null;
  }
  function render(state) {
    if (scope.closed) return;
    const cards = ownedCards(state.hand);
    const present = new Set(cards.map(card => card.id));
    for (const id of locked) if (!present.has(id)) locked.delete(id);
    const active = !state.modal;
    const map = active && openMap(state);
    let boxes = null;
    if (map) {
      const info = map.mapState;
      const drawn = Array.isArray(info.drawnCells) ? info.drawnCells : [];
      const key = [info.mapId, info.currentPos, ...drawn].join(',');
      if (map !== previousMap || info.mapConfig !== previousConfig || key !== previousState) {
        previousMap = map; previousConfig = info.mapConfig; previousState = key;
        const board = readBoard(info);
        plan = planRoutes(board);
        cityCount = board?.count ?? 0;
      }
      boxes = mapBoxes(window, map);
    } else previousMap = null;
    const picking = active && caifengContext(state.hand);
    const bar = boxes || picking ? actionBar(state.self) : null;
    const confirm = picking && confirmButton(bar);
    const obstacles = boxes && cityCount || confirm ? routeObstacles(window, state, bar, cards) : [];
    overlay.updateSuits(confirm && suitGeometry(window, state, confirm), cards, locked, boxes, obstacles);
    overlay.updateRoutes(boxes, plan, cityCount, obstacles);
    overlay.updateLocks(active ? cards : [], locked);
  }
  function currentBattle() {
    const state = read(() => readBattle(ctx));
    return sameBattle(battle, state) && !state.modal ? state : null;
  }

  function onSuit(suit, inverse, event, expectedContext) {
    if (scope.closed || (!inverse && heldControl === event.currentTarget && event.detail !== 0)) return false;
    const state = currentBattle();
    if (!state || !confirmButton(actionBar(state.self))) return false;
    const context = caifengContext(state.hand);
    if (!context || expectedContext && context !== expectedContext) return false;
    selectSuit(state.hand, context, locked, suit, inverse);
    render(state);
    return true;
  }
  function toggleCard(hit) {
    const state = currentBattle();
    if (!state || state.hand !== hit.hand
      || !ownedCards(state.hand).some(({ ui, card }) => ui === hit.ui && card === hit.card)) return false;
    if (locked.has(hit.id)) locked.delete(hit.id);
    else {
      locked.add(hit.id);
      if (caifengContext(state.hand)) setSelection(hit.ui, false);
    }
    render(state);
    return true;
  }
  function locate(event, x, y) {
    const suit = overlay.suitHit(event);
    if (suit) return suit;
    const canvas = gameCanvas(window);
    if (!canvas || event.target !== canvas) return null;
    const state = currentBattle();
    if (!state) return null;
    const card = read(() => cardAt(window, state, canvas, x, y));
    if (!card) return null;
    const target = typeof state.hand.getTextureByPosition === 'function' ? state.hand : card.ui;
    return { ...card, hand: state.hand, target };
  }

  scope.listen(document, 'contextmenu', event => {
    const hit = locate(event, event.clientX, event.clientY);
    if (!hit) return;
    const touch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents || press || heldControl;
    if (!touch && event.button !== 2 && !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (touch) return;
    if (hit.control) onSuit(hit.suit, true, event);
    else toggleCard(hit);
  }, true);
  scope.listen(document, 'mousedown', event => {
    if (!event.sourceCapabilities?.firesTouchEvents && event.button === 0) releaseClick();
  }, true);

  const capture = { capture: true, passive: true };
  scope.listen(document, 'touchstart', event => {
    releasePress();
    releaseClick();
    if (event.touches.length !== 1) return;
    const touch = event.changedTouches[0];
    const hit = locate(event, touch.clientX, touch.clientY);
    if (!hit || (!hit.control && typeof hit.target.event !== 'function')) return;
    const context = hit.control && caifengContext(battle.hand);
    const gesture = { hit, x: touch.clientX, y: touch.clientY, id: touch.identifier, held: false };
    const timer = setTimeout(() => {
      gesture.cancelTimer();
      if (press !== gesture || scope.closed) return;
      if (hit.control) {
        if (context && overlay.canPick(hit.control) && onSuit(hit.suit, true, event, context)) {
          gesture.held = true;
          heldControl = hit.control;
        }
      } else if (!hit.hand.dragIng) gesture.held = toggleCard(hit);
    }, HOLD_MS);
    gesture.cancelTimer = scope.add(() => clearTimeout(timer));
    press = gesture;
  }, capture);
  scope.listen(document, 'touchmove', event => {
    if (!press) return;
    const touch = touchAt(event.changedTouches, press.id);
    if (touch && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) press.cancelTimer();
  }, capture);
  const end = event => {
    if (!press || !touchAt(event.changedTouches, press.id)) return;
    const { hit, held, id } = press;
    releasePress();
    if (!held) return;
    if (!hit.control && !hit.target.destroyed) {
      // Laya normally translates the release into a click. Let it complete
      // mouse-up/drag cleanup while consuming just this touch's click.
      releaseTail = scope.patch(hit.target, 'event', original => function (type, data, ...args) {
        const touches = data?.nativeEvent?.changedTouches;
        if (type === 'click' && (!touches || touchAt(touches, id))) {
          releaseClick();
          return false;
        }
        return original.call(this, type, data, ...args);
      });
    }
    const tail = releaseTail, control = heldControl;
    scope.timeout(() => { if (releaseTail === tail && heldControl === control) releaseClick(); }, RELEASE_MS);
  };
  scope.listen(document, 'touchend', end, capture);
  scope.listen(document, 'touchcancel', end, capture);
  scope.listen(window, 'blur', releasePress);
  scope.add(() => { releasePress(); releaseClick(); locked.clear(); });
  return render;
}

function sameBattle(before, next) {
  return !!next && before.scene === next.scene && before.seat === next.seat && before.hand === next.hand;
}

export function createPeixiuDisplay(ctx) {
  let binding = null;
  function clear() {
    binding?.scope.dispose();
    binding = null;
  }
  ctx.scope.add(clear);
  return { clear, update(scene, enabled) {
    const state = enabled && read(() => readBattle(ctx, scene));
    if (binding && !sameBattle(binding.state, state)) clear();
    if (!state) return;
    if (!binding) {
      const scope = new ResourceScope();
      try { binding = { state, scope, render: bindBattle({ ...ctx, scope }, state) }; }
      catch (error) { scope.dispose(); throw error; }
    }
    binding.render(state);
  } };
}
