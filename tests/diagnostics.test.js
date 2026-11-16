import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardDiagnostics } from '../src/core/diagnostics.js';
import { SessionJournal } from '../src/core/session.js';
import { ResourceScope } from '../src/core/resources.js';

test('diagnostics retain only projected card fields without invoking unknown or account getters', () => {
  const diagnostic = createCardDiagnostics({ version: '0.1.6', now: () => 12 });
  let reads = 0;
  const payload = { CardIDs: [1, { cardID: 2, userID: 99 }], SeatID: 3, CardCount: 2, userID: 123, nickname: 'do-not-save', token: 'secret' };
  Object.defineProperty(payload, 'Profile', { get() { reads++; throw new Error('must never read'); } });
  Object.defineProperty(payload, 'FromID', { get() { reads++; throw new Error('native getter must not be inspected by diagnostics'); } });
  diagnostic.record({ type: 'PubGsCMoveCard', seq: 1, sessionId: 1, at: 10, payload });
  const report = diagnostic.snapshot({ bridge: { received: 5, pending: 0, userID: 123, errors: ['secret'], targets: ['ServerProxy', 'account'], lastType: 'ClientLoginRep' } });
  assert.equal(reads, 0);
  assert.deepEqual(report.events[0].payload, { CardIDs: [1, { cardID: 2 }], CardCount: 2, SeatID: 3 });
  assert.ok(report.events[0].missingFields.includes('FromID'));
  assert.deepEqual(report.bridge, { received: 5, pending: 0, targets: ['ServerProxy'] });
  assert.doesNotMatch(JSON.stringify(report), /secret|do-not-save|userID|nickname|token/);
  payload.CardIDs[0] = 100; report.events[0].payload.CardIDs[0] = 999;
  assert.equal(diagnostic.snapshot().events[0].payload.CardIDs[0], 1);
});

test('unknown message observation stores only valid bounded names and fixed source labels', () => {
  const diagnostic = createCardDiagnostics({ maxTypes: 2 });
  diagnostic.observeType('PubGsCShowCard', 'native:ServerProxy', false);
  diagnostic.observeType('PubGsCShowCard', 'native:ServerProxy', true);
  diagnostic.observeType('MsgSecretNtf', 'untrusted source with account', false);
  diagnostic.observeType('ClientOtherNtf', 'console', false);
  diagnostic.observeType('ClientLoginRep', 'console', true);
  diagnostic.observeType("Client'name'bad", 'console', false);
  diagnostic.observeType('Msg' + 'A'.repeat(100), 'console', false);
  const report = diagnostic.snapshot();
  assert.equal(report.observedTypes.length, 2); assert.equal(report.omittedTypeObservations, 1);
  assert.deepEqual(report.observedTypes[0], { type: 'PubGsCShowCard', supported: true, count: 2, sources: { 'native:ServerProxy': 2 } });
  assert.deepEqual(report.observedTypes[1].sources, { unknown: 1 });
  assert.equal(report.events.length, 0);
});

test('ring buffer and list limits preserve counts and disclose truncation', () => {
  const diagnostic = createCardDiagnostics({ maxEvents: 2 });
  for (let i = 1; i <= 3; i++) diagnostic.record({ type: 'PubGsCUseCard', seq: i, sessionId: 1, payload: { SeatID: 1, CardID: i } });
  let report = diagnostic.snapshot();
  assert.deepEqual(report.events.map(e => e.seq), [2, 3]); assert.equal(report.omittedEvents, 1); assert.equal(report.recordedTypes.PubGsCUseCard, 3);
  diagnostic.record({ type: 'MsgGamePlayCardNtf', seq: 4, sessionId: 2, payload: { CardList: Array.from({ length: 500 }, (_, i) => i + 1) } });
  report = diagnostic.snapshot();
  assert.equal(report.events.length, 1); assert.equal(report.omittedEvents, 0);
  assert.equal(report.events[0].payload.CardList.length, 256);
  assert.deepEqual(report.events[0].truncated.CardList, { originalLength: 500, retainedLength: 256 });
});

test('new journal session removes previous cards and login never records account payload', t => {
  // Keep numeric privacy sentinels from accidentally matching wall-clock timestamps.
  t.mock.method(Date, 'now', () => 12);
  const journal = new SessionJournal(), scope = new ResourceScope();
  const diagnostic = createCardDiagnostics({ journal, scope });
  journal.push('PubGsCMoveCard', { CardIDs: [999], FromID: 1, ToID: 2 });
  journal.push('ClientLoginRep', { userID: 876, nickname: 'private' });
  assert.equal(diagnostic.snapshot().events.length, 1);
  journal.push('MsgGamePlayCardNtf', { CardList: [1, 2] });
  const report = diagnostic.snapshot();
  assert.equal(report.events.length, 1); assert.equal(report.events[0].type, 'MsgGamePlayCardNtf');
  assert.doesNotMatch(diagnostic.serialize(), /999|876|private/);
  scope.dispose(); journal.push('PubGsCUseCard', { SeatID: 1, CardID: 3 });
  assert.equal(diagnostic.snapshot().events.length, 1);
});

test('gap reporting does not retain arbitrary reason strings; clearing removes all retained data', () => {
  const diagnostic = createCardDiagnostics();
  diagnostic.record({ type: 'toolbox:gap', seq: 2, sessionId: 1, payload: { reason: 'account-secret' } });
  diagnostic.observeType('PubGsCMoveCard', 'console', true);
  assert.deepEqual(diagnostic.snapshot().events, [{ type: 'toolbox:gap', seq: 2, gap: true }]);
  diagnostic.clear(); assert.equal(diagnostic.snapshot().events.length, 0); assert.equal(diagnostic.snapshot().observedTypes.length, 0);
});
