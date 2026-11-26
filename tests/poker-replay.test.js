import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { fields, messages, number, Reader, readReplay } from '../src/plugins/poker-lobby/replay/reader.js';
import { defaultReplayPerspective } from '../src/plugins/poker-lobby/replay/perspective.js';
import { buildTimeline, cardDetail, cardFace, isWildCard, playType, pointIndex } from '../src/plugins/poker-lobby/replay/model.js';
import { paintCard } from '../src/plugins/poker-lobby/replay/board.js';
import { resolveNativePalette } from '../src/ui/native-theme.js';
import { THEMES } from '../src/core/theme-palettes.js';
import { originalRank, POKER_ZONE, trackRemainingCards } from '../src/plugins/poker-lobby/replay/remaining.js';
import { createPokerReplay } from '../src/plugins/poker-lobby/replay/controller.js';
import { connectNativeReplay } from '../src/plugins/poker-lobby/replay/native-entry.js';
import { nativeTableRecording, NATIVE_SCENE } from '../src/plugins/poker-lobby/replay/native-recording.js';
import { pokerFixture } from './fixtures/poker-replay.js';

function at(timeline, time) {
  return timeline.points[pointIndex(timeline.points, time)].state;
}

test('replay accepts the official single-member ZIP and unwrapped server format', async () => {
  for (const options of [{}, { compression: 6 }, { zip: false }]) {
    const record = await readReplay(pokerFixture(options));
    assert.equal(record.version, '4.10.0');
    assert.equal(record.duration, 7000);
    assert.deepEqual(record.seats.map(seat => seat.id), [0, 1, 2]);
  }
  await assert.rejects(readReplay(pokerFixture({ mode: 148 })), /不属于/);
  assert.equal(await readReplay(pokerFixture({ mode: 148 }), null, { passthrough: true }), null);
  assert.equal(await readReplay(new Uint8Array([0, 0]), null, { passthrough: true }), null);
  await assert.rejects(readReplay(pokerFixture().slice(0, -20)), /官方 .sip/);
  await assert.rejects(readReplay(pokerFixture({ zip: false }).slice(0, -3)), /读取完成前结束/);
});

test('default replay perspective matches one valid client ID from the native seat metadata', async () => {
  const record = await readReplay(pokerFixture({ clientIds: [11, 4294967295, 4294967313n] }));
  assert.deepEqual([...record.seatClientIds], [[0, '11'], [1, '4294967295']]);
  assert.equal(defaultReplayPerspective(record, '4294967295'), 1);
  assert.equal(defaultReplayPerspective(record, '17'), 0);
  assert.equal(defaultReplayPerspective(record, ''), 0);
  const duplicated = await readReplay(pokerFixture({ clientIds: [11, 17, 17] }));
  assert.equal(defaultReplayPerspective(duplicated, '17'), 0);
  const anonymous = await readReplay(pokerFixture());
  assert.equal(defaultReplayPerspective(anonymous, '17'), 0);
});

test('the native file entry keeps the original replay callback for other recordings and restores it on disposal', async () => {
  const { window } = new JSDOM('<input id="inputFile" type="file" accept=".sgs">');
  const scope = new ResourceScope();
  try {
    const native = [];
    const recognized = [];
    let request;
    const stock = function (...args) { native.push({ receiver: this, args }); return 'stock'; };
    window.PlayLocalRecord = stock;
    connectNativeReplay({ window, document: window.document, scope, game: {} }, (read, name, fallback) => {
      request = (async () => {
        const replay = await readReplay(read(), null, { passthrough: true });
        if (replay) recognized.push(name);
        else fallback();
      })();
    });
    const input = window.document.getElementById('inputFile');
    assert.equal(input.accept, '.sgs,.sip');
    const caller = {};
    const bytes = new Uint8Array([0x41, 0x99]);
    assert.equal(window.PlayLocalRecord.call(caller, bytes, 'normal.sgs'), 'stock');
    const normalZip = pokerFixture({ mode: 148 });
    const third = {};
    window.PlayLocalRecord.call(caller, normalZip, 'normal.sip', third);
    await request;
    assert.equal(native.length, 2);
    assert.equal(native[1].receiver, caller);
    assert.deepEqual(native[1].args, [normalZip, 'normal.sip', third]);
    window.PlayLocalRecord(pokerFixture(), 'poker.sip', third);
    await request;
    assert.deepEqual(recognized, ['poker.sip']);
    assert.equal(native.length, 2);
    scope.dispose();
    assert.equal(window.PlayLocalRecord, stock);
    assert.equal(input.accept, '.sgs');
  } finally {
    scope.dispose();
    window.close();
  }
});

test('the native table opens with only ordinary replay metadata and three local seats', async () => {
  const record = await readReplay(pokerFixture());
  const buffer = nativeTableRecording(record);
  const reader = new Reader(new Uint8Array(buffer));
  assert.ok(buffer.byteLength >= 1200);
  assert.equal(reader.string(), '4.10.0');
  assert.equal(reader.string(), 'SanGuoShaServer');
  assert.deepEqual([reader.uint32(), reader.uint32(), reader.uint32()], [0, 7, 7]);
  for (let i = 0; i < 4; i++) reader.string();
  assert.deepEqual(Array.from({ length: 5 }, () => reader.uint32()), [0, 0, 148, 2, 0]);
  assert.equal(reader.string(), '');
  const header = fields(reader.take(reader.uint32()));
  assert.deepEqual([33, 148, 2, 0, 3], [3, 4, 5, 17, 21].map(field => number(header, field)));
  assert.deepEqual(messages(header, 50).map(seat => number(seat, 1)), [0, 1, 2]);
  assert.equal(reader.remaining, 0);
});

test('the shared playback controller restores its originating lobby only for a native return in the same session', async () => {
  for (const [exit, switches, restores] of [
    ['escape', 1, 1], ['navigation', 0, 0], ['pending-navigation', 0, 0], ['account', 0, 0], ['disable', 1, 0],
  ]) {
    const { window } = new JSDOM('<body></body>');
    const scope = new ResourceScope();
    const origin = { SceneName: 'DouDiZhu2023Scene', SceneData: { activity: 175 } };
    const table = { SceneName: NATIVE_SCENE };
    const nextLobby = { SceneName: origin.SceneName };
    const unrelated = { SceneName: 'ModeScene' };
    const calls = [];
    const restored = [];
    const notices = [];
    const token = {};
    let owner = 'player';
    const router = {
      CurrentScene: origin,
      SwitchScene(...args) {
        calls.push(args);
        this.nextScene = nextLobby;
      },
    };
    const manager = {
      ReadyReplay() { router.CurrentScene = table; return true; },
      ReplayRecord() {},
      StopReplay() {},
      ClearReplay() {},
    };
    const dispatcher = { _events: { routed: { caller: router }, managed: { caller: { constructor: { managerList: [manager] } } } } };
    const ctx = {
      window, document: window.document, scope, native: { account: () => ({ id: owner }) }, notify: message => notices.push(message),
      game: { getScene: () => router.CurrentScene, getConfigData: () => null,
        isInGame: () => false, isReplay: () => false, getDispatcher: () => dispatcher },
      ui: { nativeTheme: { watch: () => () => {} } },
    };
    window.Laya = { ClassUtils: { getClass: () => function Scene() {} } };
    try {
      const replay = createPokerReplay(ctx, {
        captureOrigin: () => token, restoreOrigin: (...args) => restored.push(args),
      });
      const read = () => pokerFixture();
      let opening = 0;
      origin.isMatching = true;
      assert.equal(await replay.playBytes(read, { beforePlay: () => opening++ }), false);
      assert.match(notices.pop(), /牌局或匹配/);
      assert.equal(opening, 0);
      origin.isMatching = false;
      const laya = window.Laya;
      delete window.Laya;
      assert.equal(await replay.playBytes(read, { beforePlay: () => opening++ }), false);
      assert.match(notices.pop(), /原生录像牌桌暂未就绪/);
      assert.equal(opening, 0);
      assert.equal(router.CurrentScene, origin);
      window.Laya = laya;
      assert.equal(await replay.playBytes(read, { beforePlay: () => false }), false);
      assert.equal(router.CurrentScene, origin);
      assert.equal(await replay.playBytes(read, { beforePlay: () => opening++ }), true);
      assert.equal(opening, 1);
      if (exit === 'escape') {
        assert.equal(await replay.playBytes(() => new Uint8Array([0, 0])), false);
        assert.match(notices.pop(), /录像/);
      }
      if (exit === 'navigation') router.CurrentScene = unrelated;
      if (exit === 'pending-navigation') router.nextScene = unrelated;
      if (exit === 'account') owner = 'other-player';
      if (exit === 'disable') scope.dispose();
      else window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

      assert.deepEqual(calls, switches ? [[origin.SceneName, origin.SceneData, false]] : [], exit);
      assert.deepEqual(restored, restores ? [[token, nextLobby]] : [], exit);
      assert.deepEqual(notices, [], exit);
    } finally {
      scope.dispose();
      window.close();
    }
  }
});

test('timeline applies card movement and checkpoints without revealing other perspectives', async () => {
  const record = await readReplay(pokerFixture());
  for (const { id } of record.seats) {
    const timeline = buildTimeline(record, id);
    const initial = at(timeline, 0);
    assert.deepEqual(initial.seats.map(seat => seat.count), [2, 2, 2]);
    assert.deepEqual(initial.seats.map(seat => seat.hand.length), record.seats.map(seat => seat.id === id ? 2 : 0));
    const played = at(timeline, 1200);
    assert.equal(played.lastPlay.cards[0].face, '6');
    assert.equal(played.seats[0].count, 1);
    assert.equal(at(timeline, 2200).active, 1);
    assert.equal(timeline.audit.countChecks, 3);
    assert.equal(timeline.audit.handChecks, 1);
    assert.equal(timeline.audit.countDifferences + timeline.audit.handDifferences, 0);
    assert.deepEqual(timeline.log.map(action => action.type), ['gain', 'gain', 'gain', 'play', 'pass', 'skill', 'play', 'result']);
    assert.deepEqual(at(timeline, 7000).seats.map(seat => seat.beans), [100, -50, -50]);
    assert.deepEqual(at(timeline, 7000).seats.map(seat => seat.result), [0, 1, 1]);
    assert.equal(at(timeline, 7000).ended, true);
  }
});

test('poker faces and combination labels follow the recorded codes', () => {
  assert.equal(cardFace(51700).face, '大王');
  assert.deepEqual([cardFace(40701).symbol, cardFace(40701).face], ['♦', '7']);
  assert.equal(cardFace(40701, 1, 15).face, '2');
  assert.equal(playType(1005), '顺子');
  assert.equal(playType(2003), '连对');
  assert.equal(playType(3202), '飞机带对子');
  assert.equal(playType(9000), '炸弹');
  assert.equal(playType(0, 2), '特殊出牌');
  assert.ok(isWildCard(cardFace(30501, 0, 0, 0, 40)));
  assert.equal(cardDetail(cardFace(30501, 0, 0, 10, 40)), '♣10（癞·原♣5）');
  assert.equal(cardFace(30501, 0, 8, 10, 40).rank, 8);
});

test('paintCard omits opaque theme backing behind native poker textures and avoids white shadows in light themes', () => {
  const lightPalette = resolveNativePalette(THEMES.find(theme => theme.id === 'themes.ricepaper').tokens);
  const texture = name => ({ name, bitmap: { destroyed: false }, destroyed: false, width: 93, height: 130 });
  const resources = new Map([
    ['cards/cardBack_0.png', texture('cardBack_0')],
    ['activityCards/poker_card_bg.png', texture('card_bg')],
    ['activityCards/poker_spade.png', texture('spade')],
    ['activityCards/poker_spade_big.png', texture('spade_big')],
    ['activityCards/poker_black_A.png', texture('black_A')],
  ]);
  class Text {
    size(w, h) { this.width = w; this.height = h; }
    pos(x, y) { this.x = x; this.y = y; }
  }
  const makeLaya = withAssets => ({
    Text,
    loader: { getRes: key => withAssets ? resources.get(key) ?? null : null },
  });
  const makeLayer = () => {
    const rects = [], textures = [], children = [];
    return {
      rects, textures, children,
      graphics: {
        drawRect(x, y, w, h, fill, stroke, lineWidth) { rects.push({ x, y, w, h, fill, stroke, lineWidth }); },
        drawTexture(img, x, y, w, h) { textures.push({ img, x, y, w, h }); },
      },
      addChild(child) { children.push(child); return child; },
    };
  };

  const faceLayer = makeLayer();
  paintCard(makeLaya(true), faceLayer, cardFace(11400), 0, 0, 93, 130, lightPalette);
  assert.equal(faceLayer.textures.length, 4);
  assert.equal(faceLayer.rects.length, 0);

  const jokerLayer = makeLayer();
  paintCard(makeLaya(true), jokerLayer, cardFace(51700), 0, 0, 93, 130, lightPalette);
  assert.equal(jokerLayer.textures.length, 1);
  assert.equal(jokerLayer.rects.length, 0);

  const backLayer = makeLayer();
  paintCard(makeLaya(true), backLayer, null, 0, 0, 93, 130, lightPalette);
  assert.equal(backLayer.textures.length, 1);
  assert.equal(backLayer.rects.length, 0);

  const wildLayer = makeLayer();
  paintCard(makeLaya(true), wildLayer, cardFace(11400, 0, 0, 14, 40), 0, 0, 93, 130, lightPalette);
  assert.ok(wildLayer.rects.every(rect => rect.fill !== lightPalette.shadow));
  assert.equal(wildLayer.rects[0].fill, null);

  const fallbackLayer = makeLayer();
  paintCard(makeLaya(false), fallbackLayer, cardFace(11400), 0, 0, 93, 130, lightPalette);
  assert.equal(fallbackLayer.textures.length, 0);
  assert.ok(fallbackLayer.rects.every(rect => rect.fill !== lightPalette.shadow));
  assert.equal(fallbackLayer.rects[0].fill, '#00000055');
});

test('remaining natural ranks follow private hands and physical cards through returns', () => {
  const { HAND, DECK, OUTSIDE, PLAYED, DISCARD } = POKER_ZONE;
  const counter = trackRemainingCards();
  const naturalFive = cardFace(30500, 0, 10);
  const extraFive = cardFace(30501, 0, 0, 10, 40);
  const joker = cardFace(51700);
  const hand = [naturalFive, extraFive];
  assert.equal(originalRank(extraFive.id), 0);
  assert.equal(counter.counts(hand)[5], 3);
  assert.equal(counter.counts(hand)[10], 4);
  counter.play(hand);
  assert.equal(counter.counts(hand)[5], 3);
  counter.move(PLAYED, DISCARD, [naturalFive], 1);
  counter.move(DECK, OUTSIDE, [joker], 1);
  assert.equal(counter.counts([])[17], 0);
  counter.move(DISCARD, HAND, [naturalFive], 1);
  counter.move(OUTSIDE, HAND, [joker], 1);
  assert.equal(counter.counts([])[5], 4);
  assert.equal(counter.counts([])[17], 1);
  assert.equal(counter.counts([joker])[17], 0);
  counter.move(HAND, DISCARD, [naturalFive], 1);
  counter.move(DISCARD, DECK, [], 1);
  assert.equal(counter.counts([])[5], 4);
});

test('a virtual card completes a recorded play without depleting an extra hand card', async () => {
  const record = await readReplay(pokerFixture({ virtualPlay: true }));
  for (const perspective of [0, 1, 2]) {
    const state = at(buildTimeline(record, perspective), 3000);
    const seat = state.seats[1];
    assert.equal(seat.count, 1);
    assert.deepEqual(state.lastPlay.cards.map(card => [card.id, card.virtual]), [[20500, false], [20502, true]]);
    assert.equal(state.lastPlay.remaining, 1);
    assert.equal(state.remaining[5], 3);
  }
});

test('skill piles belong to the holding seat and preserve the recorded face-up and hidden slots', async () => {
  const record = await readReplay(pokerFixture({ opening: true, skillPiles: true }));
  for (const perspective of [0, 1, 2]) {
    const timeline = buildTimeline(record, perspective);
    const piles = time => at(timeline, time).seats[2].skillPiles.map(pile => [pile.skill, pile.cards.map(card => card?.id ?? 0)]);
    const concealed = perspective === 2 ? 51700 : 0;
    assert.deepEqual(piles(3100), []);
    assert.deepEqual(piles(3300), [[46, [40900, concealed]]]);
    for (const time of [4250, 4800]) assert.deepEqual(piles(time), [[46, [40900, concealed]], [47, [11301]]]);
    assert.deepEqual(piles(5200), [[46, [concealed]], [47, [11301]]]);
    assert.deepEqual(piles(5800), []);
    assert.ok(at(timeline, 4500).seats.filter(seat => seat.id !== 2).every(seat => !seat.skillPiles.length));
  }
});

test('table actions coexist until their own cards are collected or the trick ends', async () => {
  const record = await readReplay(pokerFixture({ tableActions: true }));
  const timeline = buildTimeline(record, 2);
  const mixed = at(timeline, 4500);
  assert.deepEqual(mixed.seats.map(seat => seat.tableAction?.type), ['play', 'play', 'pass']);
  assert.equal(mixed.seats[2].count, 1);
  assert.equal(mixed.lastPlay, mixed.seats[1].tableAction);
  assert.deepEqual(timeline.log.filter(action => ['discard', 'clear-play'].includes(action.type))
    .map(action => [action.type, action.seat, action.cards[0].id]), [['discard', 2, 40900], ['clear-play', 0, 10600]]);
  const collected = at(timeline, 5000);
  assert.equal(collected.seats[0].tableAction, null);
  assert.equal(collected.lastPlay, mixed.lastPlay);
  assert.ok(at(timeline, 5500).seats.every(seat => seat.tableAction === null));
  assert.equal(at(timeline, 5500).lastPlay, null);
  assert.equal(at(timeline, 5500).rate, 8);
});

test('skill updates track uses and show the forced card only from its owner’s perspective', async () => {
  const record = await readReplay(pokerFixture({ tableActions: true }));
  for (const { id } of record.seats) {
    const timeline = buildTimeline(record, id);
    assert.equal(at(timeline, 4200).seats[0].skillUses[22], 1);
    assert.deepEqual(at(timeline, 4300).seats[2].skillStates, [{ id: 100022, cards: id === 2 ? [40900] : [] }]);
    assert.deepEqual(at(timeline, 5400).seats[2].skillStates, []);
  }
});

test('recorded prompts match the full option index and keep skill choices in the actor’s replay view', async () => {
  const record = await readReplay(pokerFixture({ skillChoice: true }));
  const owner = buildTimeline(record, 0);
  assert.equal(at(owner, 2530).playPrompt.canRecommend, false);
  assert.equal(at(owner, 2600).playPrompt.canRecommend, true);
  assert.equal(at(owner, 3000).playPrompt, null);
  assert.equal(at(owner, 4400).skillChoice.index, '4294967312');
  assert.deepEqual(at(owner, 4400).skillChoice.cards.map(card => card.id), [20500, 40700]);
  assert.deepEqual(at(owner, 4650).skillChoice.selected, []);
  assert.deepEqual(at(owner, 4800).skillChoice.selected.map(card => card.id), [20500]);
  assert.equal(at(owner, 5000).skillChoice, null);
  assert.equal(at(owner, 5600).skillChoice.skill, 15);
  assert.equal(at(owner, 5750).skillChoice, null);
  assert.deepEqual(owner.log.filter(action => action.type === 'skill-choice').map(action => [action.skill, action.cards[0].id]), [[15, 20500]]);

  for (const other of [1, 2]) {
    const timeline = buildTimeline(record, other);
    assert.equal(at(timeline, 2600).playPrompt, null);
    assert.equal(at(timeline, 4400).skillChoice, null);
    assert.equal(timeline.log.some(action => action.type === 'skill-choice'), false);
  }
});

test('opening steps expand zero-time records in order without shifting the recorded timeline or exposing other candidates', async () => {
  const record = await readReplay(pokerFixture({ opening: true }));
  for (const { id } of record.seats) {
    const timeline = buildTimeline(record, id);
    assert.deepEqual(timeline.opening.map(step => step.kind),
      ['selection', 'confirmed', 'deal', 'bid', 'decision', 'bid', 'decision', 'bid', 'decision', 'landlord']);
    assert.deepEqual(timeline.opening[0].state.selection.candidates, [8020 + id * 2, 8021 + id * 2]);
    assert.equal(timeline.opening[1].state.selection.chosen, 8021 + id * 2);
    assert.deepEqual(timeline.opening.filter(step => step.kind === 'decision').map(step => step.state.bidding.decision),
      [true, false, false]);
    assert.deepEqual(timeline.log.filter(action => action.type === 'bid').map(({ grab, grabTimes }) => [grab, grabTimes]),
      [[false, 1], [true, 1], [true, 1]]);
    assert.equal(timeline.opening.at(-1).state.seats[0].role, 1);
    assert.equal(timeline.points[0].time, 0);
    assert.equal(timeline.log.find(action => action.type === 'play').time, 1000);
    assert.equal(record.duration, 7000);
  }
});

test('operator-provided replay agrees with the included snapshots in each view', {
  skip: !process.env.SGS_POKER_REPLAY_SAMPLE,
}, async t => {
  const record = await readReplay(new Uint8Array(await readFile(process.env.SGS_POKER_REPLAY_SAMPLE)));
  for (const { id } of record.seats) {
    const { points, log, audit } = buildTimeline(record, id);
    assert.ok(log.some(action => action.type === 'play'));
    assert.equal(points.at(-1).state.ended, true);
    assert.ok(audit.handChecks > 0 && audit.countChecks > 0);
    assert.equal(audit.countDifferences + audit.handDifferences, 0);
    t.diagnostic(`座位 ${id + 1}：${audit.handChecks} 次手牌和 ${audit.countChecks} 次牌数与检查点一致`);
  }
});
