import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { caifengContext, openMap, readBattle, selectSuit, suitGeometry } from '../src/plugins/play-assist/peixiu/native.js';
import { createOverlay, placeSuits } from '../src/plugins/play-assist/peixiu/overlay.js';
import { planRoutes, readBoard } from '../src/plugins/play-assist/peixiu/routes.js';

const paths = board => planRoutes(board).paths;

function board(cells, start, effects, drawnCells = [], rewards = effects.map(([CellID]) => ({ CellID }))) {
  return readBoard({ currentPos: start, drawnCells,
    mapConfig: {
      Cells: cells, PreCell: cells[0], RewardCells: rewards,
      SpecialCells: effects.map(([CellID, EffectID, Param1, Param2]) => ({ CellID, EffectID, Param1, Param2 })),
    },
  });
}

test('offers distinct routes and recalculates from the live position and remaining cities', () => {
  const cells = [7, 8, 12, 13];
  const cities = [[7, 1], [13, 2]];
  assert.deepEqual(paths(board(cells, 8, cities)), [[1, 3, 4], [1, 4, 3], [4, 1, 2]]);
  assert.deepEqual(paths(board(cells, 7, cities, [7])), [[3, 4], [4, 3]]);
  assert.deepEqual(paths(board(cells, 13, cities, [7, 13])), []);
});

test('sliding stops at gaps and edges, and normalizes native cell coordinates', () => {
  assert.deepEqual(paths(board([1, 3], 1, [[3, 1]])), []);
  assert.deepEqual(paths(board([5, 6], 5, [[6, 1]])), []);
  const map = board([17, 18, 23], 43, [[53, 1]]);
  assert.equal(map.start, 18);
  assert.deepEqual(paths(map)[0], [4]);
});

test('the planner reports the best partial coverage for the display to reject', () => {
  const map = board([1, 2, 7, 10], 1, [[2, 1], [10, 1]]);
  assert.deepEqual(planRoutes(map), { paths: [[3]], covered: 1 });
});

test('arrows move after the paid slide, may chain, and activate only once', () => {
  const cells = [7, 8, 9, 12, 13, 14, 18, 19];
  const cities = [[8, 3, 4, 1], [14, 3, 1, 1], [18, 2]];
  const map = board(cells, 7, cities);
  assert.deepEqual(paths(map)[0], [3, 4], 'right crosses 8, ends at 9, then arrows move to 14 and 13');
  const afterArrows = board(cells, 13, cities, [8, 14]);
  assert.deepEqual(paths(afterArrows)[0], [4]);
  assert.deepEqual(paths(board(cells, 7, cities, [8]))[0], [3, 4], 'right now ends at 9 and down draws 14');
});

test('uses the Classic practice turn and visible map even with a stale poker seat number and nonmodal windows', () => {
  const stage = { width: 1366, height: 820 };
  const windowLayer = { layerOrder: 4, _children: [{ visible: true, mouseEnabled: true, width: 180, height: 92 }] };
  const background = { layerOrder: 1, parent: stage };
  const map = { parent: background, mapState: { mapId: 3 }, boardLayer: { visible: true, alpha: 1 } };
  background.getChildByName = () => map;
  stage._children = [background, windowLayer];
  const seat = { IsSelf: true, Index: 2, InDealRound: true, HasSkill: id => id === 4021 };
  const scene = { SelfSeatUi: { seat, cardContainer: { SelectContext: { Purpose: 'deal' } } } };
  const gameContext = { CurrentRoundSeatID: 0, CurrentRoundPlayerSeat: seat };
  const ctx = { window: { Laya: { stage } }, game: { getScene: () => scene, getClass: () => gameContext } };
  assert.equal(openMap(readBattle(ctx)), map);
  windowLayer._children.push({ IsModal: true, alpha: 0 });
  assert.equal(openMap(readBattle(ctx)), map);
  windowLayer._children.at(-1).alpha = .5;
  assert.equal(openMap(readBattle(ctx)), null);
  windowLayer._children.pop();

  const wrapper = { parent: background };
  map.parent = wrapper;
  background.getChildByName = () => null;
  seat.GetGeneralSkill = id => id === 4021 ? { SpecialBackground: map } : null;
  assert.equal(openMap(readBattle(ctx)), map);
  wrapper.visible = false;
  assert.equal(openMap(readBattle(ctx)), null);
  wrapper.visible = true;
  seat.InDealRound = false;
  scene.SelfSeatUi.cardContainer.SelectContext = null;
  assert.equal(openMap(readBattle(ctx)), map);
  gameContext.CurrentRoundPlayerSeat = { Index: 0 };
  assert.equal(openMap(readBattle(ctx)), null);
});

test('replans Qingzhou after the arrow cell takes the marker from 17 to 13', () => {
  const cells = [4, 6, 7, 9, 10, 11, 12, 13, 14, 17, 18, 22];
  const cities = [[18, 3, 2, 1], [6, 1, 2], [12, 1, 1], [9, 1, 2]];
  assert.deepEqual(planRoutes(board(cells, 13, cities, [18])), {
    paths: [[1, 2, 4, 3, 2], [3, 2, 4, 1, 2], [1, 3, 2, 4, 1, 2]], covered: 3,
  });
});

test('keeps a one-step route visible even when the docking regions intersect native UI', t => {
  const { window } = new JSDOM('<body></body>');
  const scope = new ResourceScope();
  t.after(() => { scope.dispose(); window.close(); });
  const overlay = createOverlay({ window, document: window.document, scope,
    ui: { mountStyles() {}, nativeTheme: { watch() {} } } }, () => {});
  const routes = window.document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.routes');
  Object.defineProperties(routes, {
    offsetWidth: { get: () => Number.parseFloat(routes.style.width) || 44 },
    offsetHeight: { value: 35 },
  });
  const table = { left: 0, top: 0, right: 320, bottom: 180 };
  window.innerWidth = table.right;
  window.innerHeight = table.bottom;
  const map = { table, board: { left: 90, top: 53, right: 230, bottom: 128 } };
  const remaining = board([1, 2, 7], 1, [[2, 1], [7, 1]], [7]);
  const complete = planRoutes(remaining);
  assert.deepEqual(complete, { paths: [[3]], covered: 1 });
  overlay.updateRoutes(map, complete, remaining.count, []);
  assert.equal(routes.hidden, false);
  assert.equal(routes.querySelector('li').getAttribute('aria-label'), '黑桃');
  assert.equal(routes.style.top, '10px');
  assert.ok(Number.parseFloat(routes.style.width) < 90);
  overlay.updateRoutes(map, complete, remaining.count, [table]);
  assert.equal(routes.hidden, false);
  assert.ok(Number.parseFloat(routes.style.top) >= 0);
  assert.ok(Number.parseFloat(routes.style.top) + routes.offsetHeight <= table.bottom);
  const partial = board([1, 2, 7, 10], 1, [[2, 1], [10, 1]]);
  overlay.updateRoutes(map, planRoutes(partial), partial.count, []);
  assert.equal(routes.hidden, true);
  overlay.updateRoutes(map, { paths: [], covered: 0 }, 1, []);
  assert.equal(routes.hidden, true);
  overlay.updateRoutes(map, complete, remaining.count, []);
  assert.equal(routes.hidden, false);
});

test('Caifeng layout follows the native table through letterboxing and quarter turns', () => {
  for (const [screenW, screenH, turn] of [
    [1920, 1080, 0], [1280, 960, 0], [1180, 820, 0], [768, 1024, 0],
    [540, 820, 0], [844, 390, 0], [390, 844, 0], [390, 844, 90], [390, 844, -90],
  ]) {
    const stage = { width: 1320, height: 760, canvasDegree: turn, localToGlobal: point => point };
    const w = turn ? stage.height : stage.width, h = turn ? stage.width : stage.height;
    const scale = Math.min(screenW / w, screenH / h);
    const width = w * scale, height = h * scale;
    const left = (screenW - width) / 2, top = (screenH - height) / 2;
    const canvas = { getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) };
    const window = { Laya: { stage, Render: { canvas } } };
    const hand = { parent: stage, width: 1320, height: 140, localToGlobal: ({ x, y }) => ({ x, y: y + 620 }) };
    const button = { x: 594, y: 551, width: 80, height: 43 };
    const bar = { parent: stage, btns: [button], x: 0, y: 0,
      localToGlobal({ x, y }) { return { x: x + this.x, y: y + this.y }; } };
    const viewport = { left: 0, top: 0, right: screenW, bottom: screenH };
    const geometry = () => suitGeometry(window, { stage, hand }, { bar, button });
    const fit = placeSuits(geometry(), viewport, []);
    assert.ok(fit?.size >= 24, `usable at ${screenW}×${screenH} (${turn}°)`);
    const span = fit.size * 4 + fit.gap * 3;
    const right = fit.left + (fit.vertical ? fit.size : span);
    const bottom = fit.top + (fit.vertical ? span : fit.size);
    assert.ok(fit.left >= left && fit.top >= top && right <= left + width && bottom <= top + height);
    const { confirm } = geometry();
    if (turn > 0) assert.ok(bottom < confirm.top);
    else if (turn < 0) assert.ok(fit.top > confirm.bottom);
    else assert.ok(right < confirm.left);
    const centerDelta = turn ? fit.left + right - confirm.left - confirm.right : fit.top + bottom - confirm.top - confirm.bottom;
    assert.ok(Math.abs(centerDelta) <= 1, 'the row is centered on the confirm line');
    bar.SetActualSize = () => {};
    bar.width = 930;
    const chatGeometry = geometry();
    assert.ok(placeSuits(chatGeometry, viewport, []));
    if (!turn) assert.ok(chatGeometry.table.right < left + width, 'chat width lies outside the playable table');
  }
});

test('Classic Caifeng aligns with the actual confirm button and stays locked while the bar moves', t => {
  const { window } = new JSDOM('<body></body>');
  const scope = new ResourceScope();
  t.after(() => { scope.dispose(); window.close(); });
  const stage = { width: 1320, height: 760, localToGlobal: point => point };
  const viewport = { left: 0, top: 0, right: stage.width, bottom: stage.height };
  window.innerWidth = stage.width;
  window.innerHeight = stage.height;
  const canvas = { getBoundingClientRect: () => ({ ...viewport, width: stage.width, height: stage.height }) };
  window.Laya = { stage, Render: { canvas } };
  const hand = { parent: stage, y: 591, width: 1320, height: 169,
    localToGlobal({ x, y }) { return { x, y: y + this.y }; } };
  const box = fit => ({ x: fit.left, y: fit.top, right: fit.left + fit.size * 4 + fit.gap * 3, bottom: fit.top + fit.size });
  for (const [chatWidth, selfY, selfH, barY] of [[0, 611, 149, -81], [240, 611, 149, -81]]) {
    const tableWidth = stage.width - chatWidth;
    const self = { parent: stage, y: selfY, width: stage.width, height: selfH,
      localToGlobal({ x, y }) { return { x, y: y + this.y }; } };
    const button = { x: tableWidth / 2 - 115, y: 40, width: 80, height: 43 };
    const bar = { parent: self, width: tableWidth - 150, SetActualSize() {},
      pos(x, y) { Object.assign(this, { x, y }); },
      localToGlobal({ x, y }) { return { x: x + this.x, y: y + this.y + self.y }; } };
    bar.pos(75, barY);
    const geometry = () => suitGeometry(window, { stage, hand }, { bar, button });
    const { confirm, table } = geometry();
    assert.deepEqual(table, { left: 0, right: tableWidth, top: 0, bottom: stage.height });
    assert.deepEqual(confirm, { left: button.x + 75, right: button.x + 155, top: selfY + barY + 40, bottom: selfY + barY + 83 });
    const fit = placeSuits(geometry(), viewport, []);
    const row = box(fit);
    assert.equal(row.right, confirm.left - 8);
    assert.equal(row.y, Math.round((confirm.top + confirm.bottom - fit.size) / 2));
    assert.ok(row.bottom <= selfY, 'suit row stays above the 149px SelfSeatUi bottom strip');
    const localScope = new ResourceScope();
    const overlay = createOverlay({ window, document: window.document, scope: localScope,
      ui: { mountStyles() {}, nativeTheme: { watch() {} } } }, () => {});
    const suits = window.document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.suits');
    overlay.updateSuits(geometry(), [], new Set());
    const lockedStyle = suits.style.cssText;
    bar.pos(68, barY - 35);
    overlay.updateSuits(geometry(), [], new Set());
    assert.equal(suits.style.cssText, lockedStyle, 'moving the bar keeps the locked confirm-row position');
    window.SystemContext = { gameWidth: 1100, gameHeight: 633, gameScale: 1.2 };
    bar.pos(75, barY - 50);
    overlay.updateSuits(geometry(), [], new Set());
    const resizedConfirm = geometry().confirm;
    const resizedSize = Number.parseFloat(suits.style.getPropertyValue('--suit-size'));
    assert.equal(Number.parseFloat(suits.style.top), Math.round((resizedConfirm.top + resizedConfirm.bottom - resizedSize) / 2),
      'changing game resolution or scale re-anchors suits to the updated confirm button');
    delete window.SystemContext;
    bar.pos(75, barY);
    localScope.dispose();
    assert.deepEqual(placeSuits(geometry(), viewport, [table]), placeSuits(geometry(), viewport, []), 'a blocked row keeps the shortcut visible');
    const clipped = { left: confirm.left - 30, top: confirm.top + 5, right: confirm.left + 24, bottom: confirm.bottom + 5 };
    const fallback = box(placeSuits(geometry(), clipped, [table]));
    assert.ok(fallback.x >= clipped.left && fallback.y >= clipped.top
      && fallback.right <= clipped.right && fallback.bottom <= clipped.bottom);
  }
});

test('Caifeng stays anchored directly left of confirm even when hand cards are present or raised', t => {
  const { window } = new JSDOM('<body></body>');
  const scope = new ResourceScope();
  t.after(() => { scope.dispose(); window.close(); });
  window.innerWidth = 1320;
  window.innerHeight = 760;
  const stage = { width: 1320, height: 760, localToGlobal: point => point };
  window.Laya = { stage, Render: { canvas: { getBoundingClientRect: () => ({
    left: 0, top: 0, right: 1320, bottom: 760, width: 1320, height: 760,
  }) } } };
  const hand = { parent: stage, NORMAL_Y: 32, SELECTED_Y: 15,
    localToGlobal({ x, y }) { return { x, y: y + 591 }; } };
  const bar = { parent: stage, width: 1170, SetActualSize() {},
    localToGlobal({ x, y }) { return { x: x + 75, y: y + 480 }; } };
  const button = { x: 545, y: 40, width: 80, height: 43 };
  const overlay = createOverlay({ window, document: window.document, scope,
    ui: { mountStyles() {}, nativeTheme: { watch() {} } } }, () => {});
  const suits = window.document.querySelector('[data-sgs-peixiu]').shadowRoot.querySelector('.suits');
  const face = { render: hand, renderX: 440, renderY: hand.NORMAL_Y, renderWidth: 83, renderHeight: 108 };
  const cards = [{ ui: { ...pickable(10, 1), bmpFace: face }, id: 10, inHand: true }];
  const geometry = suitGeometry(window, { stage, hand }, { bar, button });
  overlay.updateSuits(geometry, cards, new Set());
  const position = suits.style.cssText;
  assert.equal(suits.hidden, false);
  const size = Number.parseFloat(suits.style.getPropertyValue('--suit-size'));
  const gap = Number.parseFloat(suits.style.getPropertyValue('--suit-gap'));
  assert.equal(Number.parseFloat(suits.style.left) + size * 4 + gap * 3, geometry.confirm.left - 8);
  assert.equal(Number.parseFloat(suits.style.top), Math.round((geometry.confirm.top + geometry.confirm.bottom - size) / 2));
  face.renderY = hand.SELECTED_Y;
  cards[0].ui.Card.Selected = true;
  overlay.updateSuits(geometry, cards, new Set());
  assert.equal(suits.style.cssText, position);
});

test('Caifeng uses the flattened button box if the standard local position is unavailable', () => {
  const stage = { width: 1320, height: 760, localToGlobal: point => point };
  const window = { Laya: { stage, Render: { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1320, height: 760 }) } } } };
  const bar = { parent: stage, width: 1170, SetActualSize() {} };
  const button = { render: stage, renderX: 620, renderY: 571, renderWidth: 80, renderHeight: 43 };
  assert.deepEqual(suitGeometry(window, { stage }, { bar, button }).confirm,
    { left: 620, right: 700, top: 571, bottom: 614 });
});

function pickable(id, suit, selected = false, activated = true) {
  return {
    Card: { CardId: id, FlowerOnSeat: suit, Selected: selected },
    Activated: activated, calls: 0,
    CardUI_Click(event) { assert.equal(event, null); this.calls++; this.Card.Selected = !this.Card.Selected; },
  };
}

test('Caifeng toggles hand and equipped cards of one suit, skipping locks and unavailable cards', () => {
  const context = { Skill: { SkillId: 4023 } };
  const lockedHeart = pickable(10, 1, true), heart = pickable(11, 1, true), nextHeart = pickable(12, 1);
  const spade = pickable(13, 3, true), club = pickable(14, 4, false, false), diamond = pickable(15, 2);
  const heartEquip = pickable(17, 1), lockedEquip = pickable(18, 2, true);
  const spadeEquip = pickable(19, 3), unavailableEquip = pickable(20, 4, false, false);
  const hand = { SelectContext: context, AreChoosingCard: true,
    CardUis: [lockedHeart, heart, nextHeart, spade, club, diamond],
    EquipCardUis: [heartEquip, lockedEquip, spadeEquip, unavailableEquip] };
  const locked = new Set([10, 18]);
  assert.equal(caifengContext(hand), context);
  selectSuit(hand, context, locked, 1, false);
  assert.deepEqual(hand.CardUis.map(ui => ui.Card.Selected), [true, true, true, true, false, false]);
  assert.deepEqual(hand.EquipCardUis.map(ui => ui.Card.Selected), [true, true, false, false]);
  assert.equal(heart.calls + spade.calls + lockedHeart.calls, 0);
  selectSuit(hand, context, locked, 2, false);
  assert.deepEqual(hand.CardUis.map(ui => ui.Card.Selected), [true, true, true, true, false, true]);
  selectSuit(hand, context, locked, 1, false);
  selectSuit(hand, context, locked, 4, false);
  assert.deepEqual(hand.CardUis.map(ui => ui.Card.Selected), [true, false, false, true, false, true]);
  assert.deepEqual(hand.EquipCardUis.map(ui => ui.Card.Selected), [false, true, false, false]);
  selectSuit(hand, context, locked, 1, true);
  assert.deepEqual(hand.CardUis.map(ui => ui.Card.Selected), [false, false, false, true, false, true]);
  assert.deepEqual(hand.EquipCardUis.map(ui => ui.Card.Selected), [false, false, true, false]);
  assert.equal(club.calls + unavailableEquip.calls, 0);
  hand.SelectContext = { Skill: { SkillId: 3910 } };
  assert.equal(caifengContext(hand), null);
  selectSuit(hand, context, locked, 1, false);
  assert.equal(diamond.Card.Selected, true);
});

test('stops a bulk pick if the native selection context is replaced mid-action', () => {
  const first = pickable(1, 4), second = pickable(2, 4);
  const context = { Skill: { ID: 4023 } };
  const hand = { selectCardContext: context, areChoosingCard: true, cardUis: [first, second] };
  first.CardUI_Click = () => { hand.areChoosingCard = false; };
  selectSuit(hand, context, new Set(), 4, false);
  assert.equal(second.calls, 0);
});
