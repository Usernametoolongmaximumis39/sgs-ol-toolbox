import test from 'node:test';
import assert from 'node:assert/strict';
import { skillCount } from '../src/plugins/cards/skill-counts.js';
import { initialState, reduce } from '../src/plugins/cards/model.js';
import { projectMessage } from '../src/core/protocol.js';
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
test('YuShi shares its MaxHp allowance across player turns and refreshes on the next game round', () => {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload: projectMessage(type, payload) ?? payload, seq: ++seq, sessionId: 's' });
  const seat = { Index: 0, Hp: 1, MaxHp: 4 };
  const yushi = skill({ SkillId: 3751, Seat: seat, GetSkillUseCountInRound: () => 0 });
  const remaining = () => skillCount(yushi, new Set(), state).remaining;
  const use = { SpellID: 3751, EffectIndex: 2, SeatID: 0 };

  assert.equal(remaining(), null);
  send('MsgGamePlayCardNtf', { CardList: [1, 2] });
  assert.equal(remaining(), 4);
  send('PubGsCUseSpell', { ...use, EffectIndex: 1 });
  send('PubGsCUseSpell', { ...use, isSend: true });
  send('PubGsCUseSpell', { ...use, SeatID: 1 });
  assert.equal(remaining(), 4);
  send('PubGsCUseSpell', use);
  assert.equal(remaining(), 3);
  assert.equal(reduce(state, { type: 'PubGsCUseSpell', payload: use, seq, sessionId: 's' }), state);
  send('MsgGameTurnNtf', { Protocol: { TurnCnt: 1, IsResume: false } });
  send('GsCGamephaseNtf', { SeatID: 0, Round: 0 });
  assert.equal(remaining(), 3);
  send('PubGsCUseSpell', use);
  send('GsCGamephaseNtf', { SeatID: 1, Round: 0 });
  assert.equal(remaining(), 2);
  send('GsCGamephaseNtf', { SeatID: 1, Round: 7 });
  send('GsCGamephaseNtf', { SeatID: 1, Round: 0 });
  assert.equal(remaining(), 2);
  for (const TurnCnt of [1, 0, undefined, 1.5]) send('MsgGameTurnNtf', { TurnCnt });
  assert.equal(remaining(), 2);

  seat.MaxHp = 1;
  assert.equal(remaining(), 0);
  seat.MaxHp = 3;
  assert.equal(remaining(), 1);
  send('MsgGameTurnNtf', { TurnCnt: 2 });
  assert.equal(remaining(), 3);
  send('PubGsCUseSpell', use);
  send('MsgGameTurnNtf', { TurnCnt: 1 });
  assert.equal(remaining(), 2);
  send('MsgReconnectGame', {});
  send('GsCGamephaseNtf', { SeatID: 2, Round: 0 });
  send('MsgGameTurnNtf', { Protocol: { TurnCnt: 2, IsResume: true } });
  send('MsgGameTurnNtf', { Protocol: { TurnCnt: 3, IsResume: true } });
  send('PubGsCUseSpell', use);
  assert.equal(remaining(), null);
  send('MsgGameTurnNtf', { TurnCnt: 4 });
  assert.equal(remaining(), 3);
  send('toolbox:gap', {});
  send('MsgGameTurnNtf', { TurnCnt: 4 });
  assert.equal(remaining(), null);
  send('MsgGameTurnNtf', { TurnCnt: 5 });
  assert.equal(remaining(), 3);
  send('MsgGamePlayCardNtf', { Protocol: { CardList: [1, 2], IsResume: true } });
  assert.equal(remaining(), null);
  send('MsgGamePlayCardNtf', { CardList: [1, 2] });
  assert.equal(remaining(), 3);
});

test('the per-turn observed counter still resets at player turn start', () => {
  let state = initialState(), seq = 0;
  const send = (type, payload) => state = reduce(state, { type, payload, seq: ++seq, sessionId: 's' });
  const shuhui = skill({ SkillId: 0xc12 });
  const scene = { gameManager: { Seats: Array.from({ length: 4 }, () => ({ IsLegalOperable: true })) } };
  const remaining = () => skillCount(shuhui, new Set(), state, scene).remaining;
  assert.equal(remaining(), null);
  send('GsCGamephaseNtf', { SeatID: 0, Round: 0 });
  send('PubGsCUseSpell', { SpellID: 0xc12, EffectIndex: 1, SeatID: 0 });
  assert.equal(remaining(), 2);
  send('GsCGamephaseNtf', { SeatID: 1, Round: 0 });
  assert.equal(remaining(), 3);
});
