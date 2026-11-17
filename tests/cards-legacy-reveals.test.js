import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyReveal } from '../src/plugins/cards/legacy-reveals.js';

function recording() {
  const state = { turn: 1, selfSeatId: 0, cards: {}, zones: {}, pending: {}, mode: { flags: [] } };
  const zoneKey = (kind, owner = 255) => `${kind}:${owner}`;
  const zone = (s, key) => s.zones[key] ||= { key, count: 0, order: [], top: [], bottom: [] };
  const locate = (s, id, key, seq) => {
    const old = s.cards[id]; s.cards[id] = { ...(old || { id, tags: [] }), locations: [key], seen: true, lastSeq: seq };
  };
  const reveal = (s, values, key, seq, count) => {
    values.forEach(id => locate(s, id, key, seq)); const z = zone(s, key);
    z.count = count ?? Math.max(z.count, values.length); z.order = [...new Set([...z.order, ...values])];
  };
  const send = (data, eventType = 'GsCRoleOptTargetNtf') => legacyReveal(state, data, 4, { zoneKey, zone, reveal, locate, eventType });
  return { state, send, hand: owner => Object.values(state.cards).filter(c => c.locations.length === 1 && c.locations[0] === zoneKey(5, owner)).map(c => c.id) };
}

test('native target reveal routes use explicit skill/type guards without exposing control data', () => {
  for (const [SpellID, Type] of [[4,1],[5,1],[921,28],[372,29],[811,29],[357,28],[3119,28],[501,3],[3437,29],[851,28],[361,29],[3854,29]]) {
    const r = recording();
    assert.equal(r.send({ SpellID, Type, TargetSeatID: 2, Param: 0, Params: [17,18] }), true, String(SpellID));
    assert.deepEqual(r.hand(2), [17,18]);
    const bad = recording();
    assert.equal(bad.send({ SpellID, Type: 73, TargetSeatID: 2, Param: 0, Params: [17,18] }), false);
    assert.deepEqual(bad.state.cards, {});
  }
});

test('WangXi choices belong to the operator and HuiSheng does not relabel equipment as hand', () => {
  const r = recording();
  r.send({ SpellID: 3310, Type: 28, Param: 0, SeatID: 0, SrcSeatID: 0, TargetSeatID: 2, Params: [17,18] });
  assert.deepEqual(r.hand(0), [17,18]); assert.deepEqual(r.hand(2), []);
  r.state.cards[19] = { id: 19, tags: [], seen: true, locations: ['6:2'] };
  r.send({ SpellID: 774, Type: 30, Param: 0, SeatID: 0, SrcSeatID: 2, TargetSeatID: 0, Params: [19,20] });
  assert.deepEqual(r.state.cards[19].locations, ['6:2']);
  assert.deepEqual(r.state.cards[20].locations, ['5:2','6:2']);
  assert.deepEqual(r.hand(2), []);
});

test('malformed, outgoing, masked and duplicate ID lists do not erase or create observations', () => {
  for (const Params of [[17,0],[17,17],[-1],[65535],['17'],[],null]) {
    const r = recording();
    assert.equal(r.send({ SpellID: 372, Type: 29, TargetSeatID: 2, Params }), false);
    assert.deepEqual(r.state.cards, {});
  }
  for (const extra of [{ isSend: true }, { TargetSeatID: 255 }, { TargetSeatID: null }]) {
    const r = recording();
    assert.equal(r.send({ SpellID: 372, Type: 29, TargetSeatID: 2, Params: [17], ...extra }), false);
    assert.deepEqual(r.state.cards, {});
  }
});

test('SanWen extracts only the counted card prefix; GuanGu extracts IDs rather than spell/property triples', () => {
  const r = recording();
  assert.equal(r.send({ SpellID: 898, Type: 28, Param: 0, SrcSeatID: 2, Params: [2,17,18,100,101] }), true);
  assert.deepEqual(r.hand(2), [17,18]);
  const g = recording();
  assert.equal(g.send({ SpellID: 3266, Type: 29, Param: 0, SrcSeatID: 0, TargetSeatID: 2, Params: [0,17,1,0,18,3,0] }), true);
  assert.deepEqual(g.hand(2), [17,18]);
  assert.equal(g.state.cards[1], undefined);
  assert.equal(g.send({ SpellID: 3266, Type: 29, Param: 0, SrcSeatID: 0, TargetSeatID: 2, Params: [0,19,1] }), false);
});

test('exchange windows validate exact two group sizes and record pile/hand separately', () => {
  for (const [SpellID, Type, Param] of [[987,29,1],[988,29,1],[3483,28,1],[3903,28,0]]) {
    const r = recording();
    assert.equal(r.send({ SpellID, Type, Param, SrcSeatID: 0, TargetSeatID: 2, Params: [2,1,17,18,19] }), true);
    assert.deepEqual(r.state.zones['1:255'].top, [17,18]); assert.deepEqual(r.hand(2), [19]);
    assert.equal(r.state.cards[2], undefined);
    assert.deepEqual(r.state.pending[`legacyExchange:${SpellID}:0`].hand, [19]);
    const bad = recording();
    assert.equal(bad.send({ SpellID, Type, Param, SrcSeatID: 0, TargetSeatID: 2, Params: [2,2,17,18,19] }), false);
    assert.deepEqual(bad.state.cards, {});
  }
});

test('YanXi candidates remain possible until one hand or two pile identities distinguish ownership', () => {
  const r = recording();
  const data = { SpellID: 7017, Type: 28, SrcSeatID: 0, Param: 2, Params: [17,18,19] };
  r.send(data);
  assert.deepEqual(r.hand(2), []);
  for (const c of Object.values(r.state.cards)) assert.deepEqual(c.locations, ['5:2','1:255']);
  const known = recording();
  known.send({ SpellID: 372, Type: 29, TargetSeatID: 2, Params: [18] });
  known.send(data);
  assert.deepEqual(known.hand(2), [18]);
  assert.deepEqual(known.state.cards[17].locations, ['1:255']);
  assert.deepEqual(known.state.pending['legacyCandidates:7017:0'].pile, [17,19]);
});

test('reply event types identify generic hand results, Jiewu and top/bottom views', () => {
  for (const data of [{ SpellID: 0, Type: 48 }, { SpellID: 3659, Type: 61 }]) {
    const r = recording(); r.send({ ...data, SeatID: 2, Datas: [17,18] }, 'CGsRoleSpellOptRep');
    assert.deepEqual(r.hand(2), [17,18]);
  }
  const r = recording();
  r.send({ SpellID: 3868, Type: 50, Datas: [17,18] }, 'CGsRoleSpellOptRep');
  assert.deepEqual(r.state.zones['1:255'].top, [17,18]);
  r.send({ SpellID: 3336, Type: 50, Datas: [17,18] }, 'CGsRoleSpellOptRep');
  assert.deepEqual(r.state.zones['1:255'].bottom, [18,17]);
  const wrong = recording(); wrong.send({ SpellID: 3336, Type: 73, Datas: [17] }, 'CGsRoleSpellOptRep');
  assert.deepEqual(wrong.state.cards, {});
});

test('Yingshi correlation is bounded to the current turn and never publishes partial-stage payloads', () => {
  const r = recording();
  r.send({ SpellID: 7010, Type: 28, TargetSeatID: 255, SrcSeatID: 0, Params: [17] });
  r.send({ SpellID: 7009, Type: 50, Datas: [18] }, 'CGsRoleSpellOptRep');
  assert.equal(r.state.cards[18], undefined);
  r.send({ SpellID: 7009, Type: 50, Datas: [19] }, 'CGsRoleSpellOptRep');
  assert.deepEqual(r.state.zones['1:255'].top, [19]);
  assert.equal(r.state.pending.legacyYingshi, undefined);
});
