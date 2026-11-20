import test from 'node:test';
import assert from 'node:assert/strict';
import { skillCount } from '../src/plugins/cards/skill-counts.js';
import { initialState, reduce } from '../src/plugins/cards/model.js';
const skill = (extra = {}) => ({ SkillId: 123, SpecialModeDesc: '出牌阶段限三次，你可以摸牌。',
  TimelimitRound: 3, TimeLimitGame: Number.MAX_SAFE_INTEGER, GetSkillUseCountInRound: () => 1,
  Seat: { Index: 0, InDealRound: true, GetSkillUseCountInGame: () => 0 }, ...extra });
test('native counts distinguish zero, unknown, unlimited and stricter game limits', () => {
  assert.equal(skillCount(skill()).remaining, 2);
  assert.equal(skillCount(skill({ GetSkillUseCountInRound: () => 5 })).remaining, 0);
  assert.equal(skillCount(skill({ GetSkillUseCountInRound: () => undefined })).remaining, null);
  assert.equal(skillCount(skill({ hasUnlimitedUses: () => true })).remaining, Infinity);
  assert.equal(skillCount(skill({ TimeLimitGame: 2, Seat: { InDealRound: true, GetSkillUseCountInGame: () => 1 } })).remaining, 1);
  assert.equal(skillCount(skill({ SpecialModeDesc: '出牌阶段限一次，你可以摸牌。' })), null);
  assert.equal(skillCount(skill({ Seat: { InDealRound: false } })), null);
});
test('dynamic limits retain previously counted one-use and zero-use states', () => {
  const seen = new Set();
  skillCount(skill(), seen);
  assert.equal(skillCount(skill({ TimelimitRound: 1, SpecialModeDesc: '出牌阶段限一次，你可以摸牌。' }), seen).remaining, 0);
  assert.equal(skillCount(skill({ TimelimitRound: 0 }), seen).remaining, 0);
  assert.equal(skillCount(skill({ SkillId: 0x35a, SpecialModeDesc: '每回合限三次', TimelimitRound: 1 })).remaining, 2);
  assert.equal(skillCount(skill({ SkillId: 0xc4e, opFlag1: 1, Seat: { InDealRound: true, InOwnRound2: true } })).remaining, 1);
  assert.equal(skillCount(skill({ SkillId: 0xe62, Seat: { InDealRound: true, GetSkillBuffInfo: () => [4] } })).remaining, 3);
});
test('Jie Jiang Wei displays the second Tiao Xin only when the native use state permits it', () => {
  let used = 0, settled = 0;
  const tiaoxin = skill({ SkillId: 985, SpecialModeDesc: '',
    TimelimitRound: 2, GetSkillUseCountInRound: () => used,
    Seat: { InDealRound: true, GetStateValue: key => key === 286 ? settled : undefined } });
  assert.equal(skillCount(tiaoxin).remaining, 1);
  used = 1;
  settled = 1;
  assert.equal(skillCount(tiaoxin).remaining, 1);
  settled = 2;
  assert.equal(skillCount(tiaoxin).remaining, 0);
  used = 2;
  settled = 1;
  assert.equal(skillCount(tiaoxin).remaining, 0);
  used = settled = 0;
  assert.equal(skillCount(tiaoxin).remaining, 1);
  used = undefined;
  assert.equal(skillCount(tiaoxin).remaining, null);
  used = 0;
  settled = undefined;
  assert.equal(skillCount(tiaoxin).remaining, null);
  tiaoxin.Seat.InDealRound = false;
  assert.equal(skillCount(tiaoxin), null);
});
test('RenChe displays the native play-phase limit from the first use, even at one', () => {
  let limit = 1, used = 0;
  const renChe = { ...skill({ SkillId: 4009, SpecialModeDesc: '出牌阶段限X次，你可弃置X张牌。' }),
    get TimelimitRound() { return limit; }, GetSkillUseCountInRound: () => used };
  const seen = new Set();
  const read = () => skillCount(renChe, seen);
  assert.equal(read().remaining, 1);
  used = 1;
  assert.equal(read().remaining, 0);
  limit = 3;
  assert.equal(read().remaining, 2);
  used = 2;
  limit = 1;
  assert.equal(read().remaining, 0);
  assert.equal(skillCount(renChe).remaining, 0);
  limit = undefined;
  assert.equal(read().remaining, null);
  limit = 2;
  used = undefined;
  assert.equal(read().remaining, null);
  renChe.Seat.InDealRound = false;
  assert.equal(read(), null);
});
test('special counters reject partial histories, deduplicate and reset on turn/reconnect', () => {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload, seq: ++seq, sessionId: 's' });
  const special = skill({ SkillId: 0xea7, Seat: { Index: 0, MaxHp: 4 } });
  assert.equal(skillCount(special, new Set(), state).remaining, null);
  send('MsgGameTurnNtf', { SeatID: 0, TurnCnt: 1 });
  assert.equal(skillCount(special, new Set(), state).remaining, 4);
  send('PubGsCUseSpell', { SpellID: 0xea7, EffectIndex: 1, SeatID: 0 });
  send('PubGsCUseSpell', { SpellID: 0xea7, EffectIndex: 2, SeatID: 0, isSend: true });
  assert.equal(skillCount(special, new Set(), state).remaining, 4);
  send('PubGsCUseSpell', { SpellID: 0xea7, EffectIndex: 2, SeatID: 0 });
  assert.equal(skillCount(special, new Set(), state).remaining, 3);
  assert.equal(reduce(state, { type: 'PubGsCUseSpell', payload: { SpellID: 0xea7, EffectIndex: 2, SeatID: 0 }, seq, sessionId: 's' }), state);
  send('MsgReconnectGame', {});
  assert.equal(skillCount(special, new Set(), state).remaining, null);
  send('MsgGameTurnNtf', { SeatID: 1, TurnCnt: 2 });
  assert.equal(skillCount(special, new Set(), state).remaining, 4);
  send('PubGsCUseSpell', { SpellID: 0xc12, EffectIndex: 1, SeatID: 0 });
  assert.equal(skillCount(skill({ SkillId: 0xc12 }), new Set(), state, { gameManager: { Seats: Array.from({ length: 4 }, () => ({ IsLegalOperable: true })) } }).remaining, 2);
});
