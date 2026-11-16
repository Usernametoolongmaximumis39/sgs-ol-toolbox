import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAdapter } from '../src/core/game.js';
import { initialState, reduce, seatLabel, zoneKey, cardsInZone } from '../src/plugins/cards/model.js';
import { createCardDiagnostics } from '../src/core/diagnostics.js';

function sceneGame(uis) {
  return createGameAdapter({ __SGS_TOOLBOX_DEMO__: { scene: { SceneName: 'GameScene', SelfSeatUi: uis[0], seatUIs: uis } } });
}
test('three-player room keeps protocol IDs separate from native one-based positions and empty controllers', () => {
  const uis = [1, 2, 3].map((id, i) => ({ seatID: 6-i, Seat: { Index: id, FixedViewId: i+1, IsFull: true, HandCount: 4 } }));
  uis.push({ Seat: { Index: 6, FixedViewId: 7, IsFull: false, HandShowCardIDs: [54] } });
  const game = sceneGame(uis), snapshot = game.getSnapshot();
  assert.deepEqual(snapshot.seats.map(s => s.seatId), [1,2,3]);
  assert.deepEqual(snapshot.emptySeatIds, [6]);
  assert.equal(snapshot.selfSeatId, 1);
  assert.equal(game.getSeatUIs().length, 3);
  let state = reduce(initialState(), { type: 'toolbox:snapshot', seq: 1, payload: snapshot });
  assert.deepEqual([1,2,3].map(id => seatLabel(state,id)), ['1号位','2号位','3号位']);
  assert.equal(seatLabel(state,6), '玩家（ID 6）');
  state = reduce(state, { type: 'toolbox:snapshot', seq: 2, payload: { seats: [{seatId:2,handCount:3}] } });
  assert.equal(seatLabel(state,2), '2号位', 'partial snapshot preserves the confirmed position');
});

test('explicitly empty seats remove stale hand candidates without turning other possibilities into certainty', () => {
  let state = initialState();
  state.active = true;
  state.seats = { 2:{seatId:2}, 6:{seatId:6} };
  state.zones = { '5:6':{key:'5:6',seatId:6,kind:5,count:1} };
  state.cards = {54:{id:54,seen:true,locations:['5:2','5:6']}};
  state = reduce(state, { type:'toolbox:snapshot',seq:1,payload:{emptySeatIds:[6]} });
  assert.equal(state.seats[6],undefined);
  assert.equal(state.zones['5:6'],undefined);
  assert.deepEqual(state.cards[54].locations,['5:2','?']);
  assert.deepEqual(cardsInZone(state,zoneKey(5,2)),[]);
});

test('seat diagnostics retain bounded numeric mapping, reset across sessions, and omit names and hand identities', () => {
  const d = createCardDiagnostics();
  let getterReads=0;
  const seat={seatId:3,position:2,viewId:7,handCount:4,dead:false,name:'private',handCardIds:[999]};
  Object.defineProperty(seat,'account',{get(){getterReads++;throw Error('must not read');}});
  d.record({type:'toolbox:snapshot',sessionId:1,payload:{selfSeatId:1,inGame:true,seats:[seat],emptySeatIds:[6]}});
  assert.deepEqual(d.snapshot().seatSnapshot,{selfSeatId:1,inGame:true,seats:[{seatId:3,position:2,viewId:7,handCount:4,dead:false}],emptySeatIds:[6]});
  assert.equal(getterReads,0);
  assert.doesNotMatch(d.serialize(),/private|999|account/);
  d.record({type:'MsgGamePlayCardNtf',sessionId:2,payload:{CardList:[1]}});
  assert.equal(d.snapshot().seatSnapshot,null);
});

test('user diagnostic protocol replay contains players 1/2/3 and public cards remain attached to their protocol IDs', async () => {
  const {readFile}=await import('node:fs/promises');
  const events=JSON.parse(await readFile(new URL('./fixtures/three-player-card-events.json',import.meta.url),'utf8'));
  const state=events.reduce((state,event)=>reduce(state,event),initialState());
  assert.deepEqual(Object.keys(state.seats).map(Number),[1,2,3]);
  assert.equal(state.seats[6],undefined);
  assert.deepEqual(cardsInZone(state,zoneKey(5,3)),[54]);
  assert.ok(cardsInZone(state,zoneKey(5,2)).includes(113));
  assert.ok(Object.values(state.cards).every(card=>!card.locations.includes('5:6')));
});
