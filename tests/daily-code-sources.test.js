import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeSources, codeServerUrl, mergeCodeText } from '../src/plugins/daily-rewards/code-sources.js';
import { createRewardsController } from '../src/plugins/daily-rewards/controller.js';
import { ResourceScope } from '../src/core/resources.js';
import { shareableCode } from '../src/plugins/daily-rewards/codes.js';
import { readFile } from 'node:fs/promises';

test('source accepts official HTTPS and loopback and merges UTF-8 lists/comments without duplicate codes', () => {
  assert.equal(codeServerUrl('https://redeem.3gs.xyz'), 'https://redeem.3gs.xyz');
  assert.throws(() => codeServerUrl('http://redeem.3gs.xyz'));
  assert.throws(() => codeServerUrl('https://redeem.3gs.xyz.evil.com'));
  assert.equal(codeServerUrl('http://127.0.0.1:17321/reward-codes.txt'), 'http://127.0.0.1:17321');
  for (const url of ['https://example.com', 'http://localhost', 'http://127.0.0.1/a', 'http://user@127.0.0.1', 'http://127.0.0.1/?file=x']) assert.throws(() => codeServerUrl(url));
  assert.deepEqual(mergeCodeText('ONE TWO', '\uFEFF# 注释\r\nTWO\r\n三国码，NEW'), { text: 'ONE\nTWO\n三国码\nNEW', count: 3, added: 2, invalid: 0 });
  assert.throws(() => mergeCodeText('', 'X'.repeat(16001)), /超过/);
  assert.throws(() => mergeCodeText('EXISTING', Array.from({ length: 100 }, (_, i) => 'CODE' + i).join('\n')), /合并后超过/);
});

test('server source uses fresh anonymous GET, validates type/UTF-8/size, and does not read clipboard', async () => {
  let clipboard = 0, request;
  const win = { fetch: async (...args) => { request = args; return new Response('中文码\nCODE', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }, navigator: { clipboard: { readText: () => { clipboard++; return Promise.resolve('CLIP'); } } } };
  const sources = createCodeSources(win);
  assert.equal(await sources.readServer('http://127.0.0.1:17321'), '中文码\nCODE');
  assert.equal(request[0], 'http://127.0.0.1:17321/reward-codes.txt');
  assert.equal(request[1].credentials, 'omit'); assert.equal(request[1].redirect, 'error'); assert.equal(request[1].cache, 'no-store');
  assert.equal(clipboard, 0);
  win.fetch = async () => new Response('<html>wrong</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(sources.readServer(sources.defaultUrl), /不是纯文本/);
  win.fetch = async () => new Response(new Uint8Array([255]), { headers: { 'content-type': 'text/plain' } });
  await assert.rejects(sources.readServer(sources.defaultUrl), /UTF-8/);
  win.fetch = async () => new Response('A'.repeat(64001), { headers: { 'content-type': 'text/plain' } });
  await assert.rejects(sources.readServer(sources.defaultUrl), /64 KB/);
  win.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(sources.readServer(sources.defaultUrl), /404/);
  assert.equal(await sources.readClipboard(), 'CLIP'); assert.equal(clipboard, 1);
  win.navigator.clipboard.readText = () => Promise.reject(new Error('denied'));
  await assert.rejects(sources.readClipboard(), /未获允许/);
});

function fixture(t, overrides = {}) {
  const scope = new ResourceScope(); t.after(() => scope.dispose());
  const storage = new Map(), sent = [], handlers = new Map(); let owner = 'A', serverReads = 0, clipboardReads = 0;
  const proxy = { on(event, caller, fn) { (handlers.get(event) || handlers.set(event, []).get(event)).push({ caller, fn }); },
    off(event, caller, fn) { handlers.set(event, (handlers.get(event) || []).filter(item => item.caller !== caller || item.fn !== fn)); },
    event(event, packet) { for (const item of [...(handlers.get(event) || [])]) item.fn.call(item.caller, packet); } };
  const gift = { SendGetGift(Type, CDKey, mid) { sent.push(CDKey); proxy.event('ClientPickupgiftbagRep', { Protocol: { Type, CDKey, mid, Result: 1 } }); } };
  const adapter = { account: () => owner, day: () => '2026-11-13', manager: name => name === 'GiftManager' ? gift : null, proxy: () => proxy, config: () => null };
  const sources = { readServer: async () => { serverReads++; return '# 服务码\nSERVER\nSERVER'; }, readClipboard: () => { clipboardReads++; return Promise.resolve('兑换码：CLIP\n兑换码：SERVER'); }, ...overrides };
  const settings = { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, structuredClone(value)) };
  const controller = createRewardsController({ adapter, scope, sources, settings, timeout: 25, poll: 2 });
  return { scope, sources, sent, storage, settings, adapter, controller, switchAccount: value => { owner = value; }, counts: () => ({ serverReads, clipboardReads }) };
}

test('old default bridge address migrates to HTTPS without enabling sharing or altering ledger', t => {
  const f = fixture(t, { defaultUrl: 'https://redeem.3gs.xyz' });
  f.settings.set('account:A:options', { schemaVersion: 2, codeServerUrl: 'http://127.0.0.1:17321', automatic: false, shareCodes: false });
  f.settings.set('account:A:permanent-attempts', { old: { status: 'confirmed' } });
  const config = f.controller.snapshot().config;
  assert.equal(config.codeServerUrl, 'https://redeem.3gs.xyz');
  assert.equal(config.automatic, false);
  assert.equal(config.shareCodes, false);
  assert.deepEqual(f.settings.get('account:A:permanent-attempts'), { old: { status: 'confirmed' } });
});

test('user twelve-line list continues past rejected and unanswered codes to the last three successes', async t => {
  const codes = ['正赛开启','主播赴战局','挥策竞荣光','次轮争锋','凭谋夺胜局','擂上见高低','力争32强','弈局分高下','谋策定荣枯','临战夺锋','狭路决存亡','竭智搏生机'];
  const f = fixture(t, { readClipboard: async () => codes.join('\n') });
  f.adapter.manager('GiftManager').SendGetGift = (Type, CDKey, mid) => {
    f.sent.push(CDKey);
    if (codes.indexOf(CDKey) < 2) return; // Unanswered requests must not block later codes.
    f.adapter.proxy().event('ClientPickupgiftbagRep', { Protocol: { Type, CDKey, mid, Result: codes.indexOf(CDKey) < 9 ? 4 : 1 } });
  };
  f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
  await f.controller.run();
  assert.deepEqual(f.sent, codes);
  assert.equal(f.controller.snapshot().confirmed, 3);
  await f.controller.run();
  assert.deepEqual(f.sent, codes, 'no failed, uncertain or successful key is resent');
});

test('startup reads server only once and unchanged clipboard does not add exchanges', async t => {
  const f = fixture(t);
  assert.equal(f.controller.snapshot().config.clipboardCodes, false);
  assert.equal(await f.controller.importCodes('clipboard'), false); assert.equal(f.counts().clipboardReads, 0);
  f.controller.options({ automatic: true });
  assert.equal(await f.controller.importCodes('server'), true); assert.deepEqual(f.sent, []);
  assert.equal(f.controller.snapshot().config.codeText, 'SERVER');
  f.controller.options({ automatic: true, clipboardCodes: true });
  assert.equal(await f.controller.importCodes('clipboard'), true);
  await f.controller.run(); assert.deepEqual(f.sent, ['SERVER', 'CLIP']);
  await f.controller.run(); assert.equal(f.sent.length, 2);
  assert.equal(f.counts().clipboardReads, 3); assert.equal(f.counts().serverReads, 1);
  await f.controller.run(); assert.equal(f.counts().clipboardReads, 4); assert.equal(f.sent.length, 2, 'unchanged clipboard never retries');
});

test('pending clipboard is ignored after opt-out, stop, account switch or disposal', async t => {
  for (const change of [f => f.controller.options({ clipboardCodes: false }), f => f.controller.stop(), f => f.switchAccount('B'), f => f.scope.dispose()]) {
    let complete;
    const f = fixture(t, { readClipboard: () => new Promise(resolve => { complete = resolve; }) });
    f.controller.options({ automatic: true, clipboardCodes: true });
    const pending = f.controller.importCodes('clipboard'); change(f); complete('OLD-CODE');
    assert.equal(await pending, false); assert.equal(f.controller.snapshot().config.codeText, ''); assert.deepEqual(f.sent, []);
  }
});

test('source errors preserve manual input and server opt-out performs no network read', async t => {
  const f = fixture(t, { readServer: async () => { throw new Error('server offline'); } });
  f.controller.options({ automatic: true, codeText: 'MANUAL' });
  await f.controller.run(); assert.deepEqual(f.sent, ['MANUAL']);
  assert.match(f.controller.snapshot().sourceStatus, /offline/);
  f.controller.options({ serverCodes: false, codeText: 'NEXT' });
  f.sources.readServer = () => { throw new Error('Must not read'); };
  await f.controller.run(); assert.deepEqual(f.sent, ['MANUAL', 'NEXT']);
});

test('sharing is off by default, requires verified universal code, and never uploads serials or clipboard contents', async t => {
  const shared = [], code = '三国杀周年快乐';
  const f = fixture(t, { readServer: async () => code + '\nAB12Cd34', shareCode: async (...args) => shared.push(args), readClipboard: async () => '兑换码：未知的通用口令\n兑换码：XYZ987' });
  assert.equal(f.controller.snapshot().config.shareCodes, false);
  f.controller.options({ automatic: true, shareCodes: true, clipboardCodes: true });
  await f.controller.run();
  assert.equal(shared.length, 1); assert.equal(shared[0][1], code);
  assert.equal(shared[0][2].signal.aborted, false);
  assert.deepEqual(f.sent, ['未知的通用口令', 'XYZ987', code, 'AB12Cd34']);
  for (const value of ['ABC123XYZ', 'abcdef', '123456', '中文AB123XYZ', 'https://example.com', '短码', '三国 杀快乐']) assert.equal(shareableCode(value), false, value);
});

test('network sharing sends only code and is anonymous, bounded and cancellable', async () => {
  const requests = [], sources = createCodeSources({ location: { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:17321' }, fetch: async (...args) => { requests.push(args); return new Response('{}'); } });
  assert.equal(await sources.shareCode(sources.defaultUrl, 'AB12CD34'), false); assert.equal(requests.length, 0);
  await sources.shareCode(sources.defaultUrl, '三国杀周年快乐');
  assert.equal(requests[0][0], sources.defaultUrl + '/reward-codes/share');
  assert.equal(requests[0][1].credentials, 'omit'); assert.deepEqual(JSON.parse(requests[0][1].body), { code: '三国杀周年快乐' });
  const control = new AbortController(); control.abort();
  assert.equal(await sources.shareCode(sources.defaultUrl, '三国杀周年快乐', { signal: control.signal }), false); assert.equal(requests.length, 1);
});

test('community sharing collects unknown successful candidates only with user opt-in', async t => {
  const shared = [];
  const f = fixture(t, { communityConfirmations: true, readServer: async () => '', readClipboard: async () => '兑换码：AB123456', shareCode: async (...args) => shared.push(args) });
  f.controller.options({ automatic: true, clipboardCodes: true });
  await f.controller.run();
  assert.equal(shared.length, 0, 'sharing remains off by default');
  f.controller.options({ shareCodes: true, codeText: '新成功口令' });
  await f.controller.run();
  assert.equal(shared.length, 1);
  assert.equal(shared[0][1], '新成功口令');
  assert.equal(shared[0][2].account, 'A');
});

test('clipboard rejection remains visible after a successful server refresh', async t => {
  const f = fixture(t, { readClipboard: () => Promise.reject(new Error('剪贴板读取未获允许')) });
  f.controller.options({ automatic: true, clipboardCodes: true });
  await f.controller.run();
  assert.match(f.controller.snapshot().sourceError, /未获允许/);
  assert.deepEqual(f.sent, ['SERVER']);
});

test('all automatic execution is gated by the master switch and code opt-in', async t => {
  const f = fixture(t);
  await f.controller.run(); assert.deepEqual(f.counts(), { serverReads: 0, clipboardReads: 0 }); assert.deepEqual(f.sent, []);
  f.controller.options({ automatic: true, codes: false, clipboardCodes: true });
  await f.controller.run(); assert.deepEqual(f.counts(), { serverReads: 0, clipboardReads: 0 }); assert.deepEqual(f.sent, []);
});

test('clipboard prose and copied status lines send nothing, including a valid-looking serial embedded in prose', async t => {
  for (const text of ['已确认 0 项；2 项未收到成功状态，待核对且未重发', '传说.限定皮肤带不带动态分为几种情况\n皮肤可以是没有动态、动态+水晶和本身就是动态', '0 2 项', '主播赴战局 这是一段说明', '说明 D4e5fa6wg4']) {
    const f = fixture(t, { readClipboard: async () => text });
    f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
    await f.controller.run();
    assert.deepEqual(f.sent, [], text);
    assert.equal(f.controller.snapshot().config.codeText, '');
    assert.equal(f.controller.snapshot().issues.length, 0);
  }
});

test('unrecognized lines do not discard independently recognizable lines or reattempt old codes', async t => {
  const f = fixture(t, { readClipboard: async () => '已确认0项\n说明：以下为兑换码\nD4e5fa6wg4\n主播赴战局' });
  f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
  await f.controller.run();
  assert.deepEqual(f.sent, ['D4e5fa6wg4', '主播赴战局']);
  assert.match(f.controller.snapshot().sourceStatus, /跳过 2 行/);
  await f.controller.run();
  assert.equal(f.sent.length, 2);
});

test('short Chinese clipboard codes are reread after parser upgrade without resending prior attempts', async t => {
  const clipboard = (await readFile(new URL('./fixtures/reward-clipboard-short-codes.txt', import.meta.url), 'utf8')).trim();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clipboard)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const f = fixture(t, { readClipboard: async () => clipboard });
  f.storage.set('account:A:last-clipboard', digest); // Previous parser ignored this exact text.
  f.storage.set('account:A:clipboard-parser-version', 2);
  f.storage.set('account:A:permanent-attempts', { ['code:' + encodeURIComponent('主播赴战局')]: { status: 'rejected' } });
  f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
  await f.controller.run();
  assert.deepEqual(f.sent, clipboard.split(/\r?\n/).filter(code => code !== '主播赴战局'));
  assert.equal(f.storage.get('account:A:clipboard-parser-version'), 3);
  await f.controller.run();
  assert.equal(f.sent.length, 12);
  assert.equal(f.controller.snapshot().sourceStatus, '剪贴板未变化，已跳过');
});

test('legacy unproven clipboard queue is not replayed and cannot contaminate a fresh server import', async t => {
  const f = fixture(t);
  f.storage.set('account:A:options', { schemaVersion: 2, automatic: true, codeText: '已确认 0 项 普通聊天内容', codes: true, serverCodes: false });
  await f.controller.run(); assert.deepEqual(f.sent, []);
  assert.equal(f.controller.snapshot().config.codeText, '已确认 0 项 普通聊天内容');
  f.controller.options({ serverCodes: true }); await f.controller.run();
  assert.deepEqual(f.sent, ['SERVER']);
});

test('complete serials and explicitly labeled Chinese codes remain supported, rejection history is readable and separate', async t => {
  const f = fixture(t, { readClipboard: async () => 'D4e5fa6wg4\nAB12Cd34' });
  f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
  await f.controller.run(); assert.deepEqual(f.sent, ['D4e5fa6wg4', 'AB12Cd34']);
  const key = 'code:' + encodeURIComponent('已确认');
  f.storage.set('account:A:permanent-attempts', { [key]: { status: 'rejected' } });
  const state = f.controller.snapshot();
  assert.equal(state.issues.length, 0);
  assert.equal(state.codeHistory[0].label, '兑换码 · 已确认');
  assert.match(state.codeHistory[0].text, /未保存具体结果码/);
  assert.equal(f.storage.get('account:A:permanent-attempts')[key].status, 'rejected');
});

test('clipboard compares the last content across reloads and never retries old failed or uncertain keys', async t => {
  let clipboard = '兑换码：OLD\n兑换码：UNKNOWN\n兑换码：NEW';
  const f = fixture(t, { readClipboard: async () => clipboard });
  f.storage.set('account:A:permanent-attempts', { 'code:OLD': { status: 'rejected' }, 'code:UNKNOWN': { status: 'unconfirmed' } });
  f.controller.options({ automatic: true, clipboardCodes: true, serverCodes: false });
  await f.controller.run(); assert.deepEqual(f.sent, ['NEW']);
  const digest = f.storage.get('account:A:last-clipboard'); assert.match(digest, /^[a-f0-9]{64}$/);
  const reload = createRewardsController({ adapter: f.adapter, scope: f.scope, sources: f.sources, settings: f.settings, timeout: 25, poll: 2 });
  await reload.run(); assert.deepEqual(f.sent, ['NEW']); assert.equal(reload.snapshot().sourceStatus, '剪贴板未变化，已跳过');
  clipboard = '兑换码：NEW\n兑换码：NEXT'; await reload.run(); assert.deepEqual(f.sent, ['NEW', 'NEXT']);
  assert.notEqual(f.storage.get('account:A:last-clipboard'), digest);
});

test('one failed startup check is not retried on toggles, account changes, days or hot reload', async t => {
  let requests = 0;
  const f = fixture(t, { readServer: async () => { requests++; throw new Error('offline'); } });
  f.controller.options({ automatic: true }); await f.controller.run();
  f.controller.options({ automatic: false }); f.controller.options({ automatic: true }); await f.controller.run();
  f.switchAccount('B'); f.controller.options({ automatic: true }); await f.controller.run();
  f.adapter.day = () => '2026-11-14';
  const reload = createRewardsController({ adapter: f.adapter, scope: f.scope, sources: f.sources, settings: f.settings, timeout: 25, poll: 2 });
  await reload.run(); assert.equal(requests, 1); assert.deepEqual(f.sent, []);
});

test('new game page discovers only new server codes and can serve another account without refetching', async t => {
  const f = fixture(t); f.controller.options({ automatic: true }); await f.controller.run();
  let requests = 0;
  const nextPageSources = { readServer: async () => { requests++; return 'SERVER NEW'; } };
  const reload = createRewardsController({ adapter: f.adapter, scope: f.scope, sources: nextPageSources, settings: f.settings, timeout: 25, poll: 2 });
  await reload.run(); assert.deepEqual(f.sent, ['SERVER', 'NEW']);
  f.switchAccount('B'); reload.options({ automatic: true }); await reload.run();
  assert.deepEqual(f.sent, ['SERVER', 'NEW', 'SERVER', 'NEW']); assert.equal(requests, 1);
});

test('clipboard monitor only queues changed text and does not poll the server every two seconds', async t => {
  let clipboard = '兑换码：FIRST', clock = 0, monitor, preparations = 0;
  const f = fixture(t, { readClipboard: async () => clipboard });
  f.adapter.prepare = async selected => { if (selected.sign) preparations++; };
  const scope = { signal: f.scope.signal, add: fn => f.scope.add(fn), interval: fn => { monitor = fn; } };
  const controller = createRewardsController({ adapter: f.adapter, settings: f.settings, sources: f.sources, scope, now: () => clock, timeout: 25, poll: 2 });
  controller.options({ automatic: true, clipboardCodes: true });
  await controller.run(); assert.deepEqual(f.sent, ['FIRST', 'SERVER']);
  async function tick(time) {
    clock = time; monitor();
    await new Promise(resolve => setImmediate(resolve));
    for (let i = 0; i < 100 && (controller.snapshot().sourceLoading || controller.snapshot().running); i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(controller.snapshot().running || controller.snapshot().sourceLoading, false);
  }
  await tick(2000); assert.deepEqual(f.sent, ['FIRST', 'SERVER']); assert.equal(preparations, 1);
  clipboard = '兑换码：SECOND'; await tick(4000); assert.deepEqual(f.sent, ['FIRST', 'SERVER', 'SECOND']); assert.equal(preparations, 1);
  await tick(6000); assert.equal(f.sent.length, 3); assert.equal(f.counts().serverReads, 1);
});

test('public server cache uses one conditional GET with no response body when unchanged', async () => {
  const storage = new Map(), requests = [], etag = '"' + 'a'.repeat(64) + '"';
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const first = { localStorage, fetch: async (...args) => { requests.push(args); return new Response('SERVER', { headers: { etag, 'content-type': 'text/plain' } }); } };
  const source = createCodeSources(first); assert.equal(await source.readServer(source.defaultUrl), 'SERVER');
  const nextPage = createCodeSources({ localStorage, fetch: async (...args) => { requests.push(args); return new Response(null, { status: 304 }); } });
  assert.equal(await nextPage.readServer(nextPage.defaultUrl), 'SERVER');
  assert.equal(requests.length, 2); assert.equal(requests[1][0], nextPage.defaultUrl + '/reward-codes.txt?since=' + 'a'.repeat(64));
  assert.equal(requests[1][1].headers, undefined);
  assert.equal(createCodeSources(first).serverSession, source.serverSession, 'hot reloads share the page check marker');
});
