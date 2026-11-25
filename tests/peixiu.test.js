import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caifengContext, openMap, readBattle, selectSuit } from '../src/plugins/play-assist/peixiu/native.js';
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

test('shows the shortest partial progress when not every remaining city can be drawn', () => {
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
