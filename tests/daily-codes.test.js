import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodes, parseClipboardCodes, planCodes, managerSpecs } from '../src/plugins/daily-rewards/codes.js';
import { awaitClaim, createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';
import { Settings } from '../src/core/storage.js';

function fixture(text = 'ABC123') {
  const sent = [], manager = { SendGetGift: (...args) => sent.push(args) };
  const proxy = { on() {}, off() {} };
  const adapter = { manager: () => manager, proxy: () => proxy };
  const selected = { codes: true, codeText: text };
  return { sent, manager, proxy, adapter, selected, plan: () => planCodes(adapter, selected) };
}
const reply = (CDKey, Result, extra = {}) => ({ Protocol: { CDKey, Result, Type: 0, mid: '0', ...extra } });

test('clipboard accepts whole 4–8 Han phrases and bounded mixed codes, without extracting prose', () => {
  for (const code of ['正赛开启', '主播赴战局', '力争32强', '三国OL周年快乐', '三国杀周年庆快乐']) {
    assert.equal(parseClipboardCodes(code).text, code);
    assert.equal(parseClipboardCodes('  ' + code + ' \n').text, code);
  }
  for (const text of ['已确认0项', '正在领取奖励', '剪贴板读取失败', '三国杀周年庆典大狂欢', '正赛开启 说明文字']) {
    assert.equal(parseClipboardCodes(text).text, '', text);
  }
  for (const text of ['正赛开启\n说明：本周可用', '正赛开启\n已确认0项']) {
    assert.equal(parseClipboardCodes(text).text, '正赛开启');
    assert.equal(parseClipboardCodes(text).skipped, 1);
  }
  const batch = parseClipboardCodes(['失效：正赛开启','说明：请复制下面内容','已确认0项','???','短','A'.repeat(41),'无法识别：旧码','临战夺锋','狭路决存亡','竭智搏生机'].join('\n'));
  assert.equal(batch.text, '临战夺锋\n狭路决存亡\n竭智搏生机');
  assert.equal(batch.skipped, 7);
  assert.equal(parseClipboardCodes('兑换码：超出短口令范围的特殊口令').text, '超出短口令范围的特殊口令');
});

test('parsing accepts pasted codes, exact deduplication, native byte and text limits', () => {
  assert.deepEqual(parseCodes(' ABC123\nABC123,abc123；中文码 ; DEF ').codes, ['ABC123', 'abc123', '中文码', 'DEF']);
  assert.equal(parseCodes('ABC ABC').duplicates, 1);
  assert.equal(parseCodes('A'.repeat(41)).invalid, 1);
  assert.equal(parseCodes('中'.repeat(22)).invalid, 1);
  assert.equal(parseCodes('A\0B').invalid, 1);
  assert.equal(parseCodes('\ud800').invalid, 1);
  assert.equal(parseCodes('A'.repeat(16001)).tooLong, true);
  assert.equal(parseCodes('A'.repeat(16001)).codes.length, 0);
  const many = parseCodes(Array.from({ length: 102 }, (_, i) => `A${i}`).join('\n'));
  assert.equal(many.codes.length, 100); assert.equal(many.overflow, 2);
  assert.deepEqual(parseCodes(null).codes, []);
});

test('planning is read-only, category optional and requires existing native manager and proxy', () => {
  const f = fixture();
  assert.equal(f.plan().actions.length, 1); assert.equal(f.sent.length, 0);
  assert.equal(planCodes(f.adapter, { ...f.selected, codes: false }).actions.length, 0);
  assert.equal(managerSpecs.GiftManager.guard(f.manager), true);
  assert.deepEqual(managerSpecs.GiftManager.events, ['ClientPickupgiftbagRep']);
  f.adapter.proxy = () => null;
  assert.equal(f.plan().actions.length, 0); assert.match(f.plan().notes[0].text, /等待/);
});

test('native exchange request uses ordinary Type 0 and permanent stable code keys', () => {
  const f = fixture('ABC123 ABC123 abc123'), actions = f.plan().actions;
  assert.equal(actions.length, 2);
  assert.equal(actions[0].permanent, true); assert.equal(actions[0].category, 'codes');
  assert.equal(actions[0].key, f.plan().actions[0].key);
  assert.notEqual(actions[0].key, actions[1].key);
  assert.equal(actions[0].done(), false);
  actions[0].send(); assert.deepEqual(f.sent, [[0, 'ABC123', 0]]);
  f.adapter.manager = () => ({ SendGetGift() {} });
  assert.equal(actions[1].eligible(), false);
  assert.equal(actions[1].send(), false); assert.equal(f.sent.length, 1);
});

test('server replies correlate exact code, ordinary type and zero mail id', () => {
  const f = fixture(), action = f.plan().actions[0];
  const success = action.confirmations[0], failure = action.rejections[0];
  assert.equal(success.manager, f.proxy); assert.equal(success.event, 'ClientPickupgiftbagRep');
  for (const result of [1, 2, 16]) { assert.equal(success.accept(reply('ABC123', result)), true); assert.equal(failure.accept(reply('ABC123', result)), false); }
  for (const result of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18]) { assert.equal(failure.accept(reply('ABC123', result)), true); assert.equal(success.accept(reply('ABC123', result)), false); }
  for (const message of [null, {}, reply('abc123', 1), reply('', 1), reply('OTHER', 1), reply('ABC123', 1, { Type: 1 }), reply('ABC123', 1, { mid: '4' }), reply('ABC123', 1, { mid: '' }), reply('ABC123', '1'), reply('ABC123', 99)]) {
    assert.equal(success.accept(message), false); assert.equal(failure.accept(message), false);
  }
});

test('missing keys, malformed input and missing methods explain readiness without requests', () => {
  const f = fixture(''); assert.match(f.plan().notes[0].text, /未填写/);
  f.selected.codeText = 'A'.repeat(16001); assert.equal(f.plan().actions.length, 0); assert.match(f.plan().notes[0].text, /超过/);
  f.selected.codeText = 'ABC'; delete f.manager.SendGetGift;
  assert.equal(f.plan().actions.length, 0); assert.equal(f.sent.length, 0);
});

test('queue binds before immediate replies and removes listeners on success, rejection and timeout', async () => {
  for (const [result, expected] of [[1, 'confirmed'], [15, 'rejected'], [99, 'unconfirmed']]) {
    const f = fixture(), listeners = new Set();
    f.proxy.on = (event, caller, handler) => listeners.add(handler);
    f.proxy.off = (event, caller, handler) => listeners.delete(handler);
    f.manager.SendGetGift = () => {
      assert.equal(listeners.size, 2);
      for (const handler of [...listeners]) handler(reply('OTHER', 1));
      assert.equal(listeners.size, 2, 'unrelated reply must not finish');
      for (const handler of [...listeners]) handler(reply('ABC123', result));
    };
    const outcome = await awaitClaim(f.plan().actions[0], { valid: () => true, timeout: 10, poll: 2 });
    assert.equal(outcome.status, expected);
    assert.equal(listeners.size, 0);
  }
});

test('controller preserves oversized input and sends no truncated final code', async t => {
  const f = fixture(), scope = new ResourceScope(), saved = new Map();
  t.after(() => scope.dispose());
  f.adapter.account = () => 'codes-test'; f.adapter.day = () => '2026-11-13';
  const settings = new Settings({ getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) });
  const controller = createRewardsController({ adapter: f.adapter, settings, scope, timeout: 10, poll: 2 });
  const text = `${'A\n'.repeat(7998)}ABCDEFGHIJ`;
  assert.ok(text.length > 16000);
  controller.options({ automatic: true, sign: false, mail: false, tasks: false, welfare: false, activities: false, codes: true, codeText: text });
  assert.equal(controller.snapshot().config.codeText, text);
  await controller.run();
  assert.equal(f.sent.length, 0);
  assert.ok(controller.snapshot().capabilities.some(note => note.category === 'codes' && /超过 16000/.test(note.text)));
});
