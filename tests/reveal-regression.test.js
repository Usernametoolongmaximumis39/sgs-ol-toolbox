import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAdapter } from '../src/core/game.js';
import { initialState, reduce, cardsInZone, zoneKey } from '../src/plugins/cards/model.js';

// Public-field shapes supported by the inspected 95chong Uo/zo reader.
// These are fixtures for client API compatibility, not captured live packets.
function adapterFor(scene) {
  const layer = { name: 'SceneLayer', _children: [scene] };
  return { game: createGameAdapter({ Laya: { stage: { _children: [layer] } } }), layer };
}

function snapshotOf(opponent) {
  const self = { seatID: 0, seat: { index: 0, HandCards: [] } };
  const scene = { SceneName: 'GameScene', SelfSeatUi: self, seatUIs: [self, opponent] };
  return adapterFor(scene).game.getSnapshot();
}

function opponentKnown(opponent) {
  return snapshotOf(opponent).seats.find(seat => seat.seatId === 2).knownHandCardIds;
}

test('an empty public ID cache does not hide populated HandShowCards', () => {
  assert.deepEqual(opponentKnown({
    seatID: 2,
    seat: { index: 2, HandShowCardIDs: [], HandShowCards: [{ CardId: 101 }] },
  }), [101]);
});

test('public hand observations accept the client UI card wrappers and cardID alias', () => {
  assert.deepEqual(opponentKnown({
    seatID: 2,
    seat: { index: 2, HandShowCards: [
      { Card: { CardId: 101 } }, { card: { cardID: 102 } }, { cardInfo: { id: 103 } },
    ] },
  }), [101, 102, 103]);
});

test('public HandShowCards on the seat UI supplement the seat model', () => {
  assert.deepEqual(opponentKnown({
    seatID: 2, seat: { index: 2, HandShowCards: [{ CardId: 101 }] },
    HandShowCards: [{ CardId: 102 }],
  }), [101, 102]);
});

test('hidden public hand UI cards do not become known cards', () => {
  assert.deepEqual(opponentKnown({
    seatID: 2,
    seat: { index: 2, HandShowCards: [
      { CardId: 101, IsHide: true }, { CardId: 102, isHide: true }, { CardId: 103 },
    ] },
  }), [103]);
});

test('hidden card UI flags also suppress stale cached IDs without reading private hand fields', () => {
  assert.deepEqual(opponentKnown({
    seatID: 2,
    seat: {
      index: 2, HandShowCardIDs: [101, 102],
      HandShowCards: [{ Card: { CardId: 101 }, IsHide: true }],
      get HandCards() { assert.fail('opponent hidden HandCards must never be read'); },
      get handCards() { assert.fail('opponent hidden handCards must never be read'); },
    },
  }), [102]);
});

test('an empty later opponent snapshot preserves an explicitly seen hand', () => {
  let state = initialState();
  state = reduce(state, { seq: 1, type: 'decodeClientGetCardInfoResp', payload: { SeatID: 2, CardIDs: [101, 102] } });
  state = reduce(state, { seq: 2, type: 'toolbox:snapshot', payload: snapshotOf({
    seatID: 2, seat: { index: 2, HandCardCount: 2, HandShowCards: [] },
  }) });
  assert.deepEqual(cardsInZone(state, zoneKey(5, 2)), [101, 102]);
});

