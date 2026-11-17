import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { SessionJournal } from '../src/core/session.js';
import { attachSessionSnapshots } from '../src/core/snapshots.js';
import { projectMessage } from '../src/core/protocol.js';
import { initialState, reduce } from '../src/plugins/cards/model.js';

test('legacy correlation packets project only the required public state', () => {
  assert.deepEqual(projectMessage('GsCUpdateRoleDataExNtf', { Protocol: {
    seat_id: 2, is_spell: true, data_id: 3652, datas: [6], token: 'secret', HandCards: [99],
  } }), { SeatID: 2, IsSpell: true, DataID: 3652, Datas: [6] });
  assert.deepEqual(projectMessage('PubGsCMoveCard', { SrcSeatID: 2, FromZone: 2, ToZone: 5, private: 'secret' }),
    { FromZone: 2, ToZone: 5, SrcSeatID: 2 });
  assert.deepEqual(projectMessage('SmsgGamePlayerDead', { SeatID: 2, MurderSeatID: 1, login: 'secret' }), { SeatID: 2, MurSeatID: 1 });
});

test('card definitions come from the known opening deck and never count as observed cards', async t => {
  const journal = new SessionJournal(), scope = new ResourceScope();
  t.after(() => scope.dispose());
  let state = initialState();
  journal.subscribe(event => { state = reduce(state, event); });
  const reads = [];
  attachSessionSnapshots({ journal, scope, game: {
    onSceneChange: () => () => {},
    getSnapshot: () => ({ inGame: true, selfSeatId: 0, seats: [{ seatId: 0 }] }),
    getCardMeta(id) { reads.push(id); return id === 2 ? { unknown: true } : { suit: 1, number: 7, type: 1, private: 'secret' }; },
  } });
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(reads, [1, 2]);
  assert.deepEqual(state.cardMeta, { 1: { suit: 1, number: 7, type: 1 } });
  assert.equal(state.cards[1].seen, false);
  assert.doesNotMatch(JSON.stringify(state.cardMeta), /secret/);
  const unchanged = reduce(state, { type: 'toolbox:snapshot', seq: state.lastSeq + 1,
    payload: { cardMeta: { 999: { suit: 1, number: 7, type: 1 } } } });
  assert.equal(unchanged.cardMeta[999], undefined);
});
