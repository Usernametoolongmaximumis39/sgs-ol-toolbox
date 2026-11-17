import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyEvent, legacyBeforeMove, legacyAfterMove } from '../src/plugins/cards/legacy-moves.js';

const key = (kind, who = 255, param = 0) => `${kind}:${[0, 1, 2, 3, 8, 12].includes(kind) ? 255 : who}${[4, 8, 10].includes(kind) ? ':' + param : ''}`;
function recording() {
  const state = { sessionId: 'a', turn: 1, phase: 0, selfSeatId: 0, currentSeatId: 0, pending: {}, cards: {}, zones: {}, cardMeta: {} };
  const zone = (s, k) => s.zones[k] ||= { count: 0, order: [], top: [], bottom: [] };
  const locate = (s, id, k, seq, tag) => { const c = s.cards[id] ||= { id, tags: [] }; c.locations = [k]; if (tag) c.tags.push(tag); };
  const h = { zoneKey: key, zone, locate, reveal(s, ids, k, seq) { ids.forEach(id => locate(s, id, k, seq)); } };
  function put(ids, kind, who, suits = []) { const k = key(kind, who); ids.forEach((id, i) => { locate(state, id, k, 1); state.cardMeta[id] = { suit: suits[i] }; }); zone(state, k).order = ids.slice(); zone(state, k).count = ids.length; }
  const event = (type, data) => legacyEvent(state, data, 1, type, h);
  const before = data => legacyBeforeMove(state, data, 2, h);
  const after = (data, ids) => legacyAfterMove(state, data, 3, ids, h);
  return { state, put, event, before, after, h };
}
const move = (SpellID, FromZone, ToZone, CardCount, extra = {}) => ({ SpellID, FromZone, ToZone, CardCount, CardIDs: [], FromID: 1, ToID: 0, SrcSeatID: 0, MoveType: 15, ...extra });

test('Xiashu requires spell target, displayed subset and matching caster choice', () => {
  const r = recording(); r.put([1, 2, 3], 5, 1);
  r.event('PubGsCUseSpell', { SpellID: 361, SeatID: 0, DestSeatIDs: [1] });
  r.before(move(361, 5, 5, 2, { FromID: 1, ToID: 1, MoveType: 21, CardIDs: [1, 2] }));
  r.event('CGsRoleSpellOptRep', { SpellID: 361, SeatID: 0, Type: 22, Datas: [2] });
  assert.deepEqual(r.before(move(361, 5, 5, 1, { MoveType: 18 })).ids, [3]);
  assert.equal(r.before(move(361, 5, 5, 1, { MoveType: 18 })).ids, undefined, 'consumed correlation cannot replay');
});
test('Xiashu missing choice and unobserved complement do not reveal identities', () => {
  const r = recording(); r.put([1], 5, 1); r.state.zones[key(5, 1)].count = 3;
  r.event('PubGsCUseSpell', { SpellID: 361, SeatID: 0, DestSeatIDs: [1] });
  r.before(move(361, 5, 5, 1, { ToID: 1, MoveType: 21, CardIDs: [1] }));
  r.event('CGsRoleSpellOptRep', { SpellID: 361, SeatID: 0, Type: 22, Datas: [2] });
  assert.equal(r.before(move(361, 5, 5, 2, { MoveType: 18 })).ids, undefined);
});
test('Jianzhi correlates declared suit and full observed discard set, not an arbitrary subset', () => {
  const r = recording(); r.put([1, 2, 3], 2, 255, [1, 1, 3]);
  r.event('GsCUpdateRoleDataExNtf', { IsSpell: true, DataID: 3652, SeatID: 0, Datas: [2] });
  r.event('PubGsCUseSpell', { SpellID: 3653, SeatID: 0, EffectIndex: 0 });
  r.after(move(3653, 3, 2, 3, { MoveType: 14 }), [1, 2, 3]);
  assert.equal(r.before(move(3653, 2, 5, 1)).ids, undefined);
  assert.deepEqual(r.before(move(3653, 2, 5, 2)).ids, [1, 2]);
});
test('Jianzhi rejects missing suit metadata and invalid masks', () => {
  for (const mask of [2, 255]) {
    const r = recording(); r.put([1], 2);
    r.event('GsCUpdateRoleDataExNtf', { IsSpell: true, DataID: 3652, SeatID: 0, Datas: [mask] });
    r.event('PubGsCUseSpell', { SpellID: 3653, SeatID: 0, EffectIndex: 0 });
    r.after(move(3653, 3, 2, 1, { MoveType: 14 }), [1]);
    assert.equal(r.before(move(3653, 2, 5, 1)).ids, undefined);
  }
});
test('Jiaoyu takes only the matching color of this actor’s observed judgments', () => {
  const r = recording(); r.put([1, 2], 8, 255, [1, 4]);
  r.event('GsCUpdateRoleDataExNtf', { IsSpell: true, DataID: 3571, SeatID: 0, Datas: [2] });
  r.event('PubGsCUseSpell', { SpellID: 3571, SeatID: 0, EffectIndex: 1 });
  r.after(move(3571, 3, 8, 2, { MoveType: 6 }), [1, 2]);
  assert.deepEqual(r.before(move(3571, 8, 5, 1, { MoveType: 8 })).ids, [2]);
});
test('Zuolian remembered shown card follows its own temporary transfer only', () => {
  const r = recording(); r.put([1, 2], 5, 1);
  r.after(move(3488, 5, 5, 1, { ToID: 1, MoveType: 21 }), [2]);
  const a = move(3488, 5, 10, 1, { MoveType: 11 });
  assert.deepEqual(r.before(a).ids, [2]);
  r.put([2], 10, 0);
  assert.deepEqual(r.before(move(3488, 10, 1, 1, { FromID: 0, MoveType: 11 })).ids, [2]);
});
test('Wengua requires known one-card gift to same later returning owner', () => {
  const r = recording(); r.put([3], 5, 1);
  r.after(move(780, 5, 5, 1, { FromID: 0, ToID: 1 }), [3]);
  assert.deepEqual(r.before(move(780, 5, 1, 1, { FromPosition: 0xff02 })).ids, [3]);
});
test('Siqi resolves reverse red discard order only with complete color metadata', () => {
  const r = recording(); r.put([1, 2, 3], 2, 255, [1, 3, 2]);
  assert.deepEqual(r.before(move(3543, 2, 1, 2)).ids, [3, 1]);
  r.state.cardMeta[2] = {};
  assert.equal(r.before(move(3543, 2, 1, 2)).ids, undefined);
});
test('Gailan explicitly masks identities generated into an unknown deck position', () => {
  const r = recording();
  assert.deepEqual(r.before(move(3694, 0, 1, 1, { ToPosition: 0xff01, MoveType: 19, CardIDs: [999] })), { ids: [], position: 0xff02, destination: 0xff02, hiddenCreation: true });
});
test('Trace-based return needs a valid closed trace and uses the remembered grid', () => {
  const r = recording();
  const enter = move(987, 1, 8, 2, { SrcSeatID: 0 });
  r.after(enter, [1, 2]); r.put([1, 2], 8);
  const back = move(987, 8, 1, 2, { ToPosition: 0xff00 });
  assert.equal(r.before(back).ids, undefined);
  r.event('CGsRoleSpellOptRep', { SpellID: 987, SeatID: 0, Type: 12, Datas: [0] });
  assert.deepEqual(r.before(back).ids, [1, 2]);
  r.event('CGsRoleSpellOptRep', { SpellID: 987, SeatID: 0, Type: 12, Datas: [99, 1, 0] });
  assert.equal(r.before(back).ids, undefined);
});
test('Known qi discarded by a killed owner is linked only to matching immediate recipient', () => {
  const r = recording();
  r.event('CGsRoleSpellOptRep', { SpellID: 0, Type: 72, Datas: [4] });
  r.event('ClientHappyGetFriendHandcardRep', { seatId: 1, Cards: [4] }); r.put([4], 2);
  r.event('SmsgGamePlayerDead', { SeatID: 1, MurSeatID: 0 });
  assert.deepEqual(r.before(move(3731, 2, 5, 1)).ids, [4]);
});
test('Temporary correlations clear on new turn and outgoing events cannot mutate them', () => {
  const r = recording(); r.put([3], 5, 1);
  r.after(move(780, 5, 5, 1, { FromID: 0, ToID: 1 }), [3]);
  r.state.turn++;
  assert.equal(r.before(move(780, 5, 1, 1, { FromPosition: 0xff02 })).ids, undefined);
  const before = JSON.stringify(r.state);
  r.event('PubGsCUseSpell', { isSend: true, SpellID: 361, SeatID: 0, DestSeatIDs: [1] });
  assert.equal(JSON.stringify(r.state), before);
});

test('changing a GuanXu selection restores the previous pile card instead of handing out both', () => {
  const r = recording();
  r.after(move(987, 1, 8, 3), [1, 2, 3]); r.put([1, 2, 3], 8);
  r.event('CGsRoleSpellOptRep', { SpellID: 987, SeatID: 0, Type: 12, Datas: [0, 3, 0] });
  r.event('CGsRoleSpellOptRep', { SpellID: 987, SeatID: 0, Type: 12, Datas: [1, 4, 0] });
  assert.deepEqual(r.before(move(987, 8, 5, 1)).ids, [2]);
});
test('Ordinary friend-hand packets never label qi without the matching qi context', () => {
  const r = recording(); r.put([4], 5, 1);
  r.event('ClientHappyGetFriendHandcardRep', { seatId: 1, Cards: [4] });
  assert.equal(r.state.cards[4].qiOwner, undefined);
  assert.deepEqual(r.state.cards[4].tags, []);
  r.event('SmsgGamePlayerDead', { SeatID: 1, MurSeatID: 0 }); r.put([4], 2);
  assert.equal(r.before(move(3731, 2, 5, 1)).ids, undefined);
});
test('Unrelated spell reply types cannot close the temporary-card trace', () => {
  const r = recording(); r.after(move(987, 1, 8, 2), [1, 2]); r.put([1, 2], 8);
  for (const Type of [0, 22, 48, 50]) r.event('CGsRoleSpellOptRep', { SpellID: 987, SeatID: 0, Type, Datas: [0] });
  assert.equal(r.before(move(987, 8, 1, 2, { ToPosition: 0xff00 })).ids, undefined);
});
test('Same-zone pseudo moves in Quanbian and Zhitian suppress false card reveals', () => {
  const r = recording();
  for (const [skill, kind] of [[7011, 19], [3744, 21]]) {
    assert.equal(r.before(move(skill, 1, 1, 2, { FromID: 255, ToID: 255, MoveType: kind, CardIDs: [1, 2] })).suppressReveal, true);
    assert.equal(r.before(move(skill, 1, 1, 2, { FromID: 255, ToID: 255, MoveType: 18, CardIDs: [1, 2] })).suppressReveal, undefined);
  }
});
test('Jieli defers unknown returned deck identities until the next complete hand result', () => {
  const r = recording(); r.put([1, 2, 3], 10, 1);
  r.after(move(3483, 5, 10, 1, { ToID: 1 }), [3]);
  const deck = move(3483, 10, 1, 2, { FromID: 1, FromPosition: 0xff02, ToPosition: 0xff00 });
  assert.equal(r.before(deck).ids, undefined);
  r.before(move(3483, 10, 5, 1, { FromID: 1 }));
  r.after(move(3483, 10, 5, 1, { FromID: 1 }), [2]);
  assert.deepEqual(r.state.cards[1].locations, [key(1)]);
  assert.deepEqual(r.state.cards[3].locations, [key(1)]);
  assert.deepEqual(r.state.zones[key(1)]?.top || [], [], 'a known set cannot fabricate a multi-card order');
});
