import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SessionJournal, installMessageBridge } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 25));
const sessionUrl = new URL('../src/core/session.js', import.meta.url).href;
const resourcesUrl = new URL('../src/core/resources.js', import.meta.url).href;

function isolated(body) {
  // A regression that invokes an infinite foreign getter must terminate in the
  // child, not freeze this runner. No third-party runtime or real login data.
  const code = `import assert from 'node:assert/strict';
    import { SessionJournal, installMessageBridge } from ${JSON.stringify(sessionUrl)};
    import { ResourceScope } from ${JSON.stringify(resourcesUrl)};
    const journal = new SessionJournal(), scope = new ResourceScope();
    let forwarded = 0;
    const target = { event() { forwarded++; return 'native'; } };
    installMessageBridge({console:{log(){}}}, journal, scope, () => {},
      {getTargets:() => [{name:'ServerProxy',target}]});
    try { ${body} } finally { scope.dispose(); }
    process.stdout.write('completed');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', timeout: 2000, maxBuffer: 8192,
  });
  assert.equal(result.error?.code, undefined, `Observation blocked native progress: ${result.error?.code}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'completed');
}

test('unrelated protocol getters cannot block native delivery or the queued observer', () => {
  isolated(`
    class Packet {
      get CardIDs() { return [10001]; }
      get CardCount() { return 1; }
      get FromZone() { return 5; }
      get ToZone() { return 2; }
      get WholeClient() { while (true) {} }
    }
    assert.equal(target.event('PubGsCMoveCard', new Packet()), 'native');
    assert.equal(forwarded, 1);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(journal.events.find(e => e.type === 'PubGsCMoveCard')?.payload.CardIDs, [10001]);
  `);
});

test('login packets with shared runtime graphs do not expand into exponential snapshots', () => {
  isolated(`
    let node = {value: 1};
    for (let depth = 0; depth < 8; depth++) node = {a:node,b:node,c:node,d:node,e:node,f:node};
    let unrelatedReads = 0;
    const packet = {profile: node};
    Object.defineProperty(packet, 'UnrelatedLazyState', {get() { unrelatedReads++; return node; }});
    target.event('ClientLoginRep', packet);
    assert.equal(forwarded, 1);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(unrelatedReads, 0);
    assert.ok(JSON.stringify(journal.snapshot()).length < 10000);
  `);
});

test('plugin consumers never execute inside the native event call stack', async t => {
  const scope = new ResourceScope(), journal = new SessionJournal(), order = [];
  t.after(() => scope.dispose());
  journal.subscribe(() => order.push('consumer'));
  const target = { event() { order.push('native'); return 42; } };
  installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  assert.equal(target.event('PubGsCMoveCard', { CardIDs: [10001], CardCount: 1, FromZone: 5, ToZone: 2 }), 42);
  order.push('returned');
  assert.deepEqual(order, ['native', 'returned']);
  await tick();
  assert.deepEqual(order, ['native', 'returned', 'consumer']);
});

test('deferred observers retain the permitted card fields before native packet reuse', async t => {
  const scope = new ResourceScope(), journal = new SessionJournal();
  t.after(() => scope.dispose());
  const target = { event(name, packet) { packet.CardIDs.length = 0; packet.CardCount = 0; } };
  installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  const packet = { CardIDs: [10001], CardCount: 1, FromZone: 5, ToZone: 2 };
  target.event('PubGsCMoveCard', packet);
  assert.deepEqual(packet.CardIDs, []);
  await tick();
  const event = journal.events.find(item => item.type === 'PubGsCMoveCard');
  assert.deepEqual(event?.payload.CardIDs, [10001]);
  assert.equal(event?.payload.CardCount, 1);
});

test('native forwarding preserves absent arguments, explicit undefined, receiver, values and exceptions', t => {
  const scope = new ResourceScope(), journal = new SessionJournal(), calls = [];
  t.after(() => scope.dispose());
  const receiver = {}, failure = new Error('original-failure');
  const target = { event(...args) { calls.push({ receiver: this, args }); if (args[0] === 'throw') throw failure; return args.length; } };
  installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  for (const args of [[], ['EMPTY'], ['EMPTY', undefined], ['EMPTY', null], ['EMPTY', {}, 'extra']]) {
    assert.equal(target.event.apply(receiver, args), args.length);
    assert.equal(calls.at(-1).receiver, receiver);
    assert.deepEqual(calls.at(-1).args, args);
  }
  assert.throws(() => target.event('throw'), error => error === failure);
});

test('disposing the core cancels observations already queued behind native dispatch', async () => {
  const scope = new ResourceScope(), journal = new SessionJournal();
  const target = { event() {} };
  installMessageBridge({ console: { log() {} } }, journal, scope, () => {}, {
    getTargets: () => [{ name: 'ServerProxy', target }],
  });
  target.event('PubGsCMoveCard', { CardIDs: [10001], CardCount: 1, FromZone: 5, ToZone: 2 });
  scope.dispose();
  await tick();
  assert.equal(journal.events.length, 0);
});

test('oversized card lists are rejected before element iteration and native delivery continues', () => {
  isolated(`
    let elementReads = 0;
    const cards = new Proxy({length: 0x7fffffff}, {get(object, key) {
      if (/^\\d+$/.test(String(key))) { elementReads++; throw new Error('must reject before indexing'); }
      return object[key];
    }});
    assert.equal(target.event('MsgGamePlayCardNtf', {CardList:cards}), 'native');
    assert.equal(forwarded, 1);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(elementReads, 0);
    assert.equal(journal.incomplete, true);
  `);
});
