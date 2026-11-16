import test from 'node:test';
import assert from 'node:assert/strict';
import { mailRewardItems } from '../src/plugins/daily-rewards/mail-rewards.js';
import { planRewards } from '../src/plugins/daily-rewards/native.js';

const mail = (type, values) => ({ AttachmentType: type, attachment: { getStringKey: key => values[key] } });
test('native ITEM attachment id and ctn arrays expose item metadata without a mail window', () => {
  assert.deepEqual(mailRewardItems({}, mail(2, { id: ['81', 82], ctn: [1, '2'] })), [{ ItemID: 81, ItemNum: 1 }, { ItemID: 82, ItemNum: 2 }]);
  for (const values of [{ id: [81] }, { id: [81, 82], ctn: [1] }, { id: [0], ctn: [1] }, { id: [81], ctn: [-1] }]) assert.equal(mailRewardItems({}, mail(2, values)), undefined);
});
test('GIFT ID is resolved from the actual giftID and dataInfo table, never mistaken for a goods ID', () => {
  const raw = { giftsys: { gifts: { giftsItem: { Item: [{ giftID: 42, dataInfo: '81,1;82,2' }, { giftID: 43, dataInfo: '81,1;82' }] } } } };
  const adapter = { config: name => { assert.equal(name, 'gn_dbs_giftbag.sgs'); return raw; } };
  assert.deepEqual(mailRewardItems(adapter, mail(1, { id: [42] })), [{ ItemID: 81, ItemNum: 1 }, { ItemID: 82, ItemNum: 2 }]);
  for (const id of [43, 44]) assert.equal(mailRewardItems(adapter, mail(1, { id: [id] })), undefined);
  assert.equal(mailRewardItems({ config: () => null }, mail(1, { id: [42] })), undefined);
});
test('real mail attachments no longer all defer when an unrelated item exclusion is enabled', () => {
  const ordinary = { ...mail(2, { id: [81], ctn: [1], key: ['a'] }), mid: 'ordinary', hasAttachMent: true, Geted: false };
  const coupon = { ...mail(2, { id: [82], ctn: [1], key: ['b'] }), mid: 'coupon', hasAttachMent: true, Geted: false };
  const manager = { systemMailList: [ordinary, coupon], friendMailList: [], SendClientDbsGetgmawardReq() {} };
  const adapter = { manager: name => name === 'MailManager' ? manager : null, day: () => '2026-11-14', config: () => null,
    goods: id => ({ name: id === 81 ? '银两' : '抵价券' }) };
  const plan = planRewards(adapter, { mail: true, excludeCoupon: true });
  assert.deepEqual(plan.actions.map(action => action.key), ['mail:ordinary']);
  assert.equal(planRewards(adapter, { mail: false, excludeCoupon: true }).actions.length, 0);
});
