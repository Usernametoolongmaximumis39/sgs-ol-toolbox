import { mountPluginUI } from '../src/ui/plugin-ui.js';
import { createNativeTheme } from '../src/ui/native-theme.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import cards from '../src/plugins/cards/index.js';
import { ResourceScope } from '../src/core/resources.js';
import { markPokerReplay } from '../src/shared/poker-replay-mode.js';
import { POSITION } from '../src/plugins/cards/model.js';
import { revealWindowClip, sortHand, SORT_INHIBITOR_SKILL, createNativeEnhancements, nativeAnchor, seatRevealAnchor, handSortAnchor, roundInfoBounds } from '../src/plugins/cards/native.js';

function setup() {
  const dom = new JSDOM('<!doctype html><html><body><canvas></canvas><main></main></body></html>', { url: 'https://web.sanguosha.com/' });
  const { window } = dom, { document } = window;
  document.querySelector('canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
  window.Laya = { stage: { width: 1000, height: 700 }, Point: class { constructor(x, y) { this.x = x; this.y = y; } } };
  class Sprite {
    constructor() { this._children = []; this._events = {}; this.visible = true; this.graphics = { clear() {}, drawRect() {} }; }
    size(w,h) { this.width=w;this.height=h;return this; }
    pos(x,y) { this.x=x;this.y=y;return this; }
    addChild(child) { child.removeSelf();child.parent=this;this._children.push(child);return child; }
    removeSelf() { if(this.parent?._children)this.parent._children=this.parent._children.filter(c=>c!==this);this.parent=null;return this; }
    getChildByName(name) { return this._children.find(c=>c.name===name); }
    on(type,owner,fn) { (this._events[type]??=[]).push({owner,fn}); }
    off(type,owner,fn) { this._events[type]=(this._events[type]||[]).filter(h=>h.owner!==owner||h.fn!==fn); }
    event(type,payload) { for(const h of this._events[type]||[])h.fn.call(h.owner,payload); }
    destroy() { for(const child of [...this._children])child.destroy();this.removeSelf();this._events={};this.destroyed=true; }
  }
  Object.assign(window.Laya, { Sprite, Text: class extends Sprite {} });
  Object.assign(window.Laya.stage, new Sprite()); Object.setPrototypeOf(window.Laya.stage, Sprite.prototype);
  const anchor = (x, y) => ({ visible: true, localToGlobal(point) { return { x: point.x + x, y: point.y + y }; }, globalToLocal(point) { return { x: point.x - x, y: point.y - y }; } });
  const cardModels = [
    { CardId: 1, CardNumber: 9, FlowerOnSeat: 2, CardType: 1, CardName: '杀' },
    { CardId: 2, CardNumber: 3, FlowerOnSeat: 3, CardType: 2, CardName: '闪' },
    { CardId: 3, CardNumber: 7, FlowerOnSeat: 1, CardType: 1, CardName: '桃' },
  ];
  const cardUis = cardModels.map((Card, index) => ({ ...anchor(100 + index * 80, 500), Card, selected: index === 1, setSelected(value) { this.selected = value; } }));
  let layouts = 0, inhibited = false;
  const container = Object.assign(new Sprite(), { ...anchor(0, 480), parent: { visible: true }, HandCardRect: { x: 163 }, NORMAL_Y: 32,
    cardUis, seat: { HandCards: cardModels.slice(), SortHandCardsCompare(a, b) { return a.CardType - b.CardType; } }, invalidateLayoutHandCard() { layouts++; },
    SortNormalCards() { this.seat.HandCards.sort(this.seat.SortHandCardsCompare.bind(this.seat)); this.cardUis.sort((a, b) => this.seat.SortHandCardsCompare(a.Card, b.Card)); this.invalidateLayoutHandCard(); } });
  const self = { ...anchor(100, 500), seatID: 0, cardContainer: container,
    seat: { index: 0, HasSkill(id) { return inhibited && id === SORT_INHIBITOR_SKILL; } },
    sortCardBtn: { ...anchor(550, 600), enabled: true, alpha: 1, mouseEnabled: true },
    countdownTimer: Object.assign(new Sprite(), anchor(400, 450), { RemainValue: 13.4, countTween: {}, width: 80, height: 12 }) };
  window.Laya.stage.addChild(self.countdownTimer);
  const other = { ...anchor(500, 100), height: 100, seatID: 1, seat: { index: 1 }, seatAvatar: { ...anchor(500, 100), height: 100 } };
  const scene = { SceneName: 'GameScene', SelfSeatUi: self, seatContainer: { seatUIs: [self, other] } };
  scene.gameRoundInfo = { ...anchor(600, 40), parent: scene, width: 186, height: 58 };
  class SelectCardWindow { createCardUis(input) { return input; } }
  const originalSelection = SelectCardWindow.prototype.createCardUis;
  let currentScene = scene;
  const sceneListeners = new Set();
  const game = { getScene: () => currentScene, getSelfSeatUI: () => self, getSeatUIs: () => [self, other],
    getCardMeta: id => cardModels.find(card => card.CardId === Number(id)) || { id, name: `卡牌 ${id}` },
    getClass: name => name === 'SelectCardWindow' ? SelectCardWindow : null,
    getSnapshot: () => ({ selfSeatId: 0 }), onSceneChange(fn) { sceneListeners.add(fn); return () => sceneListeners.delete(fn); } };
  function changeScene(next = scene) {
    currentScene = next;
    sceneListeners.forEach(fn => fn(next));
  }
  const values = new Map(), listeners = new Set(), notifications = [];
  const settings = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) };
  let state = cards.initialState(), seq = 0, scope, deactivate, panelCount = 0;
  const send = (type, payload = {}) => {
    state = cards.reduce(state, { seq: ++seq, sessionId: 'test', type, payload });
    listeners.forEach(fn => fn(state));
  };
  send('MsgGamePlayCardNtf', { CardList: [1, 2, 3, 4, 5] });
  send('toolbox:snapshot', { selfSeatId: 0, sceneName: 'GameScene', handCardIds: [1, 2, 3], seats: [{ seatId: 0 }, { seatId: 1, knownHandCardIds: [4], handCount: 1 }] });
  function activate() {
    scope = new ResourceScope();
    const ctx = { window, document, game, scope, settings, storage: settings,
      themes: { current: { tokens: { accent: '#d0b050', bg: '#151515' } } },
      getState: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, notify: text => notifications.push(text),
      ui: { registerPanel(spec) { panelCount++; const clean = spec.render(document.querySelector('main')); let done = false; return () => { if (done) return; done = true; panelCount--; clean?.(); }; } } };
    Object.assign(ctx.ui, mountPluginUI(ctx, () => ctx), { nativeTheme: createNativeTheme(ctx) });
    deactivate = cards.activate(ctx);
    return ctx;
  }
  function stop() { deactivate?.(); deactivate = null; scope?.dispose(); }
  function close() { stop(); window.close(); }
  return { window, document, game, settings, self, other, container, SelectCardWindow, originalSelection,
    send, activate, stop, close, changeScene, notifications, cardModels,
    get state() { return state; }, get listeners() { return listeners.size; }, get panelCount() { return panelCount; },
    set inhibited(value) { inhibited = value; }, get layouts() { return layouts; },
    get overlay() { return document.querySelector('[data-sgs-cards-overlay]')?.shadowRoot; } };
}

function controlDeckTimer(window) {
  const setTimeout = window.setTimeout.bind(window), clearTimeout = window.clearTimeout.bind(window);
  const pending = new Map();
  let next = 0;
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 250) return setTimeout(callback, delay, ...args);
    const id = --next;
    pending.set(id, () => callback(...args));
    return id;
  };
  window.clearTimeout = id => id < 0 ? pending.delete(id) : clearTimeout(id);
  return {
    get count() { return pending.size; },
    flush() { for (const [id, run] of [...pending]) { pending.delete(id); run(); } },
  };
}

test('poker replay suspends the ordinary cards HUD and restores it at exit', async () => {
  const game = setup(), poker = new ResourceScope();
  try {
    game.activate();
    const hud = game.overlay.querySelector('.sgs-card-hud');
    const reveals = () => game.overlay.querySelectorAll('.sgs-card-seat-reveal').length;
    assert.equal(hud.hidden, false);
    assert.equal(reveals(), 1);
    const state = game.state;
    markPokerReplay(poker, game.document);
    await Promise.resolve();
    game.send('toolbox:snapshot', { pokerReplay: true, inGame: true, selfSeatId: 2, handCardIds: [51500] });
    assert.equal(game.state, state);
    assert.equal(hud.hidden, true);
    assert.equal(reveals(), 0);
    assert.equal(game.self.sortCardBtn.mouseEnabled, true);
    poker.dispose();
    await Promise.resolve();
    assert.equal(hud.hidden, false);
    assert.equal(reveals(), 1);
  } finally { poker.dispose(); game.close(); }
});

test('native poker suspend and return restores native and ordinary card controls', () => {
  const env = setup();
  try {
    env.activate();
    const hud = env.overlay.querySelector('.sgs-card-hud');
    assert.equal(hud.hidden, false);
    assert.equal(env.self.sortCardBtn.mouseEnabled, false);
    assert.notEqual(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);

    const ordinary = env.state;
    env.changeScene({ sceneName: 'PokerTableGameScene', SelfSeatUi: env.self });
    env.send('toolbox:snapshot', { pokerTable: true, inGame: true, selfSeatId: 2, handCardIds: [51500] });
    assert.equal(env.state, ordinary);
    assert.equal(hud.hidden, true);
    assert.equal(env.self.sortCardBtn.mouseEnabled, true);
    assert.equal(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);

    env.changeScene();
    assert.equal(hud.hidden, false);
    assert.equal(env.self.sortCardBtn.mouseEnabled, false);
  } finally { env.close(); }
});

test('inactive native card overlays never discover seats or classes during loading and lobby ticks', () => {
  const dom = new JSDOM('<!doctype html><body><main></main></body>', { url: 'https://web.sanguosha.com/' });
  const { window } = dom, scope = new ResourceScope(), reads = [];
  let sceneChanged;
  const game = { onSceneChange(fn) { sceneChanged = fn; return () => {}; } };
  for (const name of ['getScene', 'getSelfSeatUI', 'getSeatUIs', 'getClass']) game[name] = () => { reads.push(name); throw new Error('not available during login'); };
  try {
    const ctx = { window, document: window.document, scope, game,
      settings: { get: (key, fallback) => fallback }, getState: () => ({ active: false }) };
    ctx.ui = { nativeTheme: createNativeTheme(ctx) };
    const enhancements = createNativeEnhancements(ctx, window.document.querySelector('main'), () => {});
    for (let i = 0; i < 8; i++) enhancements.update();
    sceneChanged();
    assert.deepEqual(reads, []);
    assert.equal(window.document.querySelector('.sgs-card-sortbar'), null);
    enhancements.dispose();
  } finally { scope.dispose(); window.close(); }
});

test('cards panel retains settings and queries without duplicating external displays', () => {
  const env = setup();
  try {
    env.activate();
    for (const label of ['最近用牌', '牌堆结构', '本回合弃牌', '他人明牌', '卡牌组合查询', '来源标签', '四色花色', '出牌读秒']) {
      assert.ok(env.document.querySelector('main').textContent.includes(label), label);
    }
    assert.deepEqual([...env.document.querySelectorAll('main h3')].map(node => node.textContent), ['牌堆结构', '手牌推断', '技能提示']);
    assert.equal(env.document.querySelector('[data-card-skill-hints]').hidden, true, 'irrelevant hints stay hidden');
    assert.doesNotMatch(env.document.querySelector('main').textContent, /未知归属/);
    assert.equal(env.document.querySelector('main .sgs-card-seat-row'), null, 'confirmed hands appear only beside portraits');
    assert.equal(env.document.querySelectorAll('main .sgs-card-controls').length, 1, 'only deck composition grouping remains');
    assert.equal(env.document.querySelector('[data-sgs-toolbox="cards"]').style.getPropertyValue('--sgs-accent'), '#d0b050');
    assert.equal(env.overlay.querySelectorAll('.sgs-card-seat-reveal').length, 1);
    assert.equal(env.self.countdownTimer.getChildByName('sgs-toolbox-countdown').text, '14');
  } finally { env.close(); }
});

test('revealed card opacity defaults to 80% and applies saved choices without replacing the cards', () => {
  const env = setup();
  try {
    env.activate();
    const revealToggle = env.document.querySelector('[data-setting="reveals"]');
    const row = revealToggle.parentElement.nextElementSibling;
    const options = [...row.querySelectorAll('button')];
    const selected = () => options.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent);
    const layer = () => env.overlay.querySelector('.sgs-card-seat-layer');
    const card = layer().querySelector('.sgs-card-mini');
    assert.deepEqual(options.map(button => button.textContent), ['60%', '80%', '100%']);
    assert.deepEqual(selected(), ['80%']);
    assert.equal(layer().style.opacity, '0.8');

    for (const value of [60, 100, 80, 60]) {
      options.find(button => button.textContent === `${value}%`).click();
      assert.deepEqual(selected(), [`${value}%`]);
      assert.equal(layer().style.opacity, String(value / 100));
      assert.equal(layer().querySelector('.sgs-card-mini'), card);
    }
    assert.equal(env.overlay.querySelector('.sgs-card-hud').style.opacity, '');
    env.stop();
    env.activate();
    assert.equal(layer().style.opacity, '0.6');
    const group = env.document.querySelector('[aria-label="明牌不透明度"]');
    assert.equal(group.querySelector('[aria-pressed="true"]').textContent, '60%');
  } finally { env.close(); }
});

test('revealed cards default to seven per row and retain the chosen size across activations', () => {
  const env = setup();
  try {
    const ids = Array.from({ length: 10 }, (_, index) => index + 4);
    env.send('toolbox:snapshot', { seats: [{ seatId: 1, knownHandCardIds: ids, handCount: ids.length }] });
    env.settings.set('revealColumns', 9);
    env.activate();
    const group = () => env.document.querySelector('[aria-label="明牌大小"]');
    const reveal = () => env.overlay.querySelector('.sgs-card-seat-reveal');
    const columns = () => reveal().style.getPropertyValue('--sgs-reveal-columns');
    const card = reveal().firstElementChild;
    const buttons = [...group().querySelectorAll('button')];
    assert.deepEqual(buttons.map(button => button.textContent), ['4', '5', '6', '7', '8']);
    assert.equal(group().querySelector('[aria-pressed="true"]').textContent, '7');
    assert.equal(columns(), '7');
    for (const button of buttons) {
      button.click();
      assert.equal(group().querySelector('[aria-pressed="true"]'), button);
      assert.equal(columns(), button.textContent);
      assert.equal(reveal().firstElementChild, card);
    }
    env.stop();
    env.activate();
    assert.equal(env.settings.get('revealColumns'), 8);
    assert.equal(group().querySelector('[aria-pressed="true"]').textContent, '8');
    assert.equal(columns(), '8');
  } finally { env.close(); }
});

test('skill hints appear for native skills, react to settings and release on disposal', () => {
  const env = setup();
  try {
    env.self.seat.HasSkill = id => id === 4007;
    env.activate();
    const hints = env.document.querySelector('[data-card-skill-hints]');
    assert.equal(hints.hidden, false);
    assert.match(hints.textContent, /夏晟.*黑色 1.*红色 2/);
    const toggle = env.document.querySelector('[data-setting="skillHints"]');
    toggle.checked = false; toggle.dispatchEvent(new env.window.Event('change'));
    assert.equal(hints.hidden, true);
    toggle.checked = true; toggle.dispatchEvent(new env.window.Event('change'));
    assert.equal(hints.hidden, false);
    env.stop();
    assert.equal(env.document.querySelector('[data-card-skill-hints]'), null);
  } finally { env.close(); }
});

test('ordinary draw labels are omitted; useful sources follow the real flat hand-card renderer', () => {
  const env = setup();
  try {
    env.send('PubGsCMoveCard', { FromID: 255, FromZone: 1, ToID: 0, ToZone: 5, CardIDs: [2], CardCount: 1, MoveType: 1 });
    const renderer = { visible: true, localToGlobal(point) { return { x: 100 + 2 * point.x, y: 300 + 2 * point.y }; } };
    const card = { Card: { CardId: 4 }, render: renderer, renderX: 200, renderY: 100, renderScaleX: .5, renderScaleY: .5, drawed: true,
      localToGlobal() { throw new Error('flat controller is not a displayed card'); } };
    env.container.cardUis.push(card);
    env.send('PubGsCMoveCard', { FromID: 1, FromZone: 5, ToID: 0, ToZone: 5, CardIDs: [4], CardCount: 1, MoveType: 1 });
    env.activate();
    const labels = env.overlay.querySelectorAll('.sgs-card-source-label');
    assert.equal(labels.length, 1);
    assert.equal(labels[0].textContent, '来自玩家（ID 1）');
    assert.equal(labels[0].style.left, '504px'); assert.equal(labels[0].style.top, '503px');
    assert.ok(env.state.cards[2].tags.includes('摸牌'), 'ordinary source remains in the record, not as a floating tag');
    card.drawed = false;
    env.send('MsgGameTurnNtf', { SeatID: 0 });
    assert.equal(env.overlay.querySelectorAll('.sgs-card-source-label').length, 0);
    card.drawed = true; card.render = null; card.parent = null;
    env.send('MsgGameTurnNtf', { SeatID: 1 });
    assert.equal(env.overlay.querySelectorAll('.sgs-card-source-label').length, 0, 'missing render coordinates must not emit a top-left tag');
  } finally { env.close(); }
});

test('selection windows get native countdown text and clear it on hide or disable', () => {
  const env = setup();
  try {
    const layer = new env.window.Laya.Sprite(); layer.layerOrder = 4;
    const popup = new env.window.Laya.Sprite(), timer = new env.window.Laya.Sprite();
    env.window.Laya.stage.addChild(layer); layer.addChild(popup); popup.addChild(timer);
    popup.countdownTimer = timer; timer.RemainValue = 5.8; timer.countTween = {}; timer.size(230,12);
    env.activate();
    assert.equal(timer.getChildByName('sgs-toolbox-countdown').text,'6');
    timer.RemainValue = 4.2; env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(timer.getChildByName('sgs-toolbox-countdown').text,'5');
    assert.equal(timer.getChildByName('sgs-toolbox-countdown').color,'#f3988c');
    popup.visible=false; env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(timer.getChildByName('sgs-toolbox-countdown'),undefined);
    popup.visible=true; env.send('MsgGameTurnNtf',{SeatID:1});
    const input=env.document.querySelector('[data-setting="countdown"]');input.checked=false;
    input.dispatchEvent(new env.window.Event('change',{bubbles:true}));
    assert.equal(timer.getChildByName('sgs-toolbox-countdown'),undefined);
    assert.equal(timer.RemainValue,4.2,'do not change the original countdown');
  } finally {env.close();}
});

test('joining as spectator ignores detached and stopped timer caches while retaining a live visible countdown', () => {
  const env=setup();
  try {
    const make=seconds=>Object.assign(new env.window.Laya.Sprite(),{RemainValue:seconds,countTween:{}}).size(91,11);
    const detached=make(11), detachedParent=new env.window.Laya.Sprite(), orphan=make(6), stopped=make(11), live=make(6);
    detachedParent.addChild(orphan);
    env.window.Laya.stage.addChild(stopped); stopped.countTween=null;
    env.window.Laya.stage.addChild(live);
    env.game.getSelfSeatUI=()=>null;
    env.game.getSeatUIs=()=>[detached,orphan,stopped,live].map(countdownTimer=>({countdownTimer}));
    env.activate();
    for(const timer of [detached,orphan,stopped])assert.equal(timer.getChildByName('sgs-toolbox-countdown'),undefined);
    assert.equal(live.getChildByName('sgs-toolbox-countdown').text,'6');
    assert.equal(env.overlay.querySelector('.sgs-card-countdown'),null,'never paint a detached HTML countdown');
    live.countTween=null;env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(live.getChildByName('sgs-toolbox-countdown'),undefined,'stopped timers may retain positive seconds');
    live.countTween={};live.alpha=0;env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(live.getChildByName('sgs-toolbox-countdown'),undefined);
    live.alpha=1;env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(live.getChildByName('sgs-toolbox-countdown').text,'6');
    live.removeSelf();env.send('MsgGameTurnNtf',{SeatID:1});
    assert.equal(live.getChildByName('sgs-toolbox-countdown'),undefined);
  } finally {env.close();}
});

test('card HUD stays fixed beside the native round area and follows right-panel collapse', () => {
  const env = setup();
  try {
    env.settings.set('hudPosition', { x: 20, y: 400 });
    env.activate();
    const hud = env.overlay.querySelector('.sgs-card-hud'), round = env.game.getScene().gameRoundInfo;
    assert.equal(hud.style.left, '534px'); assert.equal(hud.style.top, '40px');
    assert.equal(hud.querySelector('.sgs-card-hud-handle'), null);
    assert.equal(hud.style.getPropertyValue('--sgs-card-pile-width'), '186px');
    assert.deepEqual(roundInfoBounds(env.window, env.game.getScene()), { x: 600, y: 40, width: 186, height: 58 });
    round.localToGlobal = point => ({ x: point.x + 800, y: point.y + 40 });
    env.send('MsgGameTurnNtf', { SeatID: 1 });
    assert.equal(hud.style.left, '734px'); assert.equal(hud.style.top, '40px');
    round.localToGlobal = point => ({ x: point.x + 826, y: point.y + 40 });
    env.window.dispatchEvent(new env.window.Event('resize'));
    assert.equal(hud.style.left, '760px', 'the widened popover must not displace the native anchor near the right edge');
    assert.equal(hud.style.getPropertyValue('--sgs-card-list-width'), '186px');
    round.localToGlobal = point => ({ x: point.x + 800, y: point.y + 40 });
    env.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 30, top: 20, width: 800, height: 560 });
    env.window.dispatchEvent(new env.window.Event('resize'));
    const scaled = roundInfoBounds(env.window, env.game.getScene());
    assert.equal(scaled.x, 670); assert.equal(scaled.y, 52);
    assert.ok(Math.abs(scaled.width - 148.8) < .001 && Math.abs(scaled.height - 46.4) < .001);
    assert.equal(hud.style.left, '604px'); assert.equal(hud.style.top, '52px');
    round.visible = false;
    env.window.dispatchEvent(new env.window.Event('resize'));
    assert.equal(hud.hidden, true);
    round.visible = true;
    env.window.dispatchEvent(new env.window.Event('resize'));
    assert.equal(hud.hidden, false);
    round.parent = null;
    env.window.dispatchEvent(new env.window.Event('resize'));
    assert.equal(hud.hidden, true, 'no detached round controller or viewport guess');
  } finally { env.close(); }
});

test('revealed miniature cards follow model seat identity through reordered native UIs', () => {
  const env = setup();
  try {
    env.other.Seat = { Index: 5 }; delete env.other.seat;
    // The old overlay matched UI seatID=1 or fell back to array index=1.
    env.other.seatID = 1;
    const otherTarget = { ...env.other, Seat: { Index: 3 }, seatID: 2,
      seatAvatar: { height: 100, localToGlobal(point) { return { x: point.x + 60, y: point.y + 100 }; } },
      localToGlobal(point) { return { x: point.x + 60, y: point.y + 100 }; } };
    const unidentified = { ...env.other, Seat: null, seatID: undefined };
    env.game.getSeatUIs = () => [otherTarget, env.self, unidentified, env.other];
    env.send('toolbox:snapshot', { seats: [{ seatId: 5, knownHandCardIds: [4], handCount: 1 }, { seatId: 3, knownHandCardIds: [5], handCount: 1 }] });
    env.activate();
    const boxes = [...env.overlay.querySelectorAll('.sgs-card-seat-reveal')];
    assert.equal(boxes.length, 2);
    const cardsAt = seat => boxes.find(box => box.dataset.seatId === String(seat));
    assert.equal(cardsAt(5).querySelector('.sgs-card-mini').dataset.cardId, '4');
    assert.equal(cardsAt(5).style.left, `${500 - 20 * (100 / 172)}px`);
    assert.equal(cardsAt(3).querySelector('.sgs-card-mini').dataset.cardId, '5');
    assert.equal(cardsAt(3).style.left, `${60 - 20 * (100 / 172)}px`);
    assert.equal(env.overlay.querySelector('.sgs-card-possible-count'), null);
    // Native seat rotation/reuse moves each player's cards along with its model.
    env.other.Seat = { Index: 3 }; otherTarget.Seat = { Index: 5 };
    env.send('MsgGameTurnNtf', { SeatID: 0 });
    assert.equal(env.overlay.querySelector('[data-seat-id="5"]').style.left, `${60 - 20 * (100 / 172)}px`);
  } finally { env.close(); }
});

test('detached native seat controllers anchor through the rendered scaled avatar, including resize', () => {
  const env = setup();
  try {
    const layer = { x: 100, y: 70, scale: 1.25, parent: null, localToGlobal(point) { return { x: this.x + point.x * this.scale, y: this.y + point.y * this.scale }; } };
    const avatar = { x: 600, y: 200, height: 172, scale: .75, parent: layer,
      localToGlobal(point) { return this.parent.localToGlobal({ x: this.x + point.x * this.scale, y: this.y + point.y * this.scale }); } };
    Object.assign(env.other, { parent: null, seatX: 600, seatY: 200, height: 172, ScaledHeight: 129,
      seatBaseSprite: layer, seatAvatar: avatar,
      localToGlobal(point) { return { x: 600 + point.x, y: 200 + point.y }; } });
    env.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 80, top: 40, width: 800, height: 560 });
    // Laya may expose its HTMLCanvas wrapper rather than the DOM canvas itself.
    env.window.Laya.Render = { canvas: { source: env.document.querySelector('canvas') } };
    assert.deepEqual(seatRevealAnchor(env.window, env.other), { x: 760, y: 425 });
    assert.notDeepEqual(nativeAnchor(env.window, env.other, 0, env.other.height), { x: 760, y: 425 }, 'old controller conversion demonstrably misses the layer and seat scales');
    env.activate();
    assert.equal(env.overlay.querySelector('[data-seat-id="1"]').style.left, '745px');
    assert.equal(env.overlay.querySelector('[data-seat-id="1"]').style.top, '425px');
    layer.scale = 1; layer.x = 20; layer.y = 30; avatar.scale = .5;
    env.send('MsgGameTurnNtf', { SeatID: 0 });
    assert.deepEqual(seatRevealAnchor(env.window, env.other), { x: 576, y: 292.8 });
    assert.equal(env.overlay.querySelector('[data-seat-id="1"]').style.top, '292.8px');
  } finally { env.close(); }
});

test('seat anchors use the verified base-sprite fallback and hide when the actual portrait or layer is unavailable', () => {
  const env = setup();
  try {
    const layer = { visible: true, parent: null, localToGlobal(point) { return { x: point.x + 150, y: point.y + 60 }; } };
    Object.assign(env.other, { seatBaseSprite: layer, seatX: 500, seatY: 100, ScaledHeight: 86, seatAvatar: null });
    assert.deepEqual(seatRevealAnchor(env.window, env.other), { x: 650, y: 246 });
    env.other.seatAvatar = { parent: layer, height: 172, visible: false, localToGlobal() { throw new Error('hidden'); } };
    assert.equal(seatRevealAnchor(env.window, env.other), null, 'hidden portrait must not fall back to stale controller coordinates');
    env.other.seatAvatar.visible = true; layer.visible = false;
    assert.equal(seatRevealAnchor(env.window, env.other), null);
    layer.visible = true; env.other.seatAvatar.parent = null;
    assert.equal(seatRevealAnchor(env.window, env.other), null, 'detached portrait is unavailable');
    env.other.seatAvatar = null; env.other.seatBaseSprite = null;
    assert.equal(seatRevealAnchor(env.window, env.other), null, 'controller localToGlobal is not a safe fallback');
  } finally { env.close(); }
});

test('spectator double-general cards align with the visible cropped portrait instead of its unclipped origin', () => {
  const env=setup();
  try {
    const avatar={parent:{visible:true},height:172,scrollRect:{x:36,y:8,width:73,height:160},
      localToGlobal(point){const clip=this.scrollRect;return {x:(450+point.x-(clip?.x||0))*1.6,y:(70+point.y-(clip?.y||0))*1.6};}};
    env.other.seatAvatar=avatar;
    assert.deepEqual(seatRevealAnchor(env.window,env.other),{x:720,y:368});
    assert.ok(Math.abs(nativeAnchor(env.window,avatar,0,172).x-720+57.6)<.001,'reproduce the 36-native-unit crop error');
    env.activate();
    assert.equal(env.overlay.querySelector('[data-seat-id="1"]').style.left,'700px');
    const scale = Number(env.overlay.querySelector('[data-seat-id="1"]').style.getPropertyValue('--sgs-reveal-scale'));
    assert.ok(Math.abs(scale - (73 * 1.6 + 40) / (7 * 42 - 2)) < .001);
    assert.equal(env.overlay.querySelector('[data-seat-id="1"]').style.top,'368px');
    avatar.displayedInStage=false;
    assert.equal(seatRevealAnchor(env.window,env.other),null);
    avatar.displayedInStage=true;avatar.scrollRect.width=0;
    assert.equal(seatRevealAnchor(env.window,env.other),null);
  } finally {env.close();}
});

test('hidden deals never paint broad candidate badges over portraits or list them before pile exhaustion', () => {
  const env = setup();
  try {
    env.send('MsgGamePlayCardNtf', { CardList: Array.from({ length: 147 }, (_, i) => i + 1) });
    env.send('PubGsCMoveCard', { FromID: 255, FromZone: 1, ToID: 1, ToZone: 5, CardIDs: [], CardCount: 4, MoveType: 1 });
    env.activate();
    assert.equal(env.overlay.querySelectorAll('.sgs-card-seat-reveal').length, 0);
    assert.doesNotMatch(env.document.querySelector('main').textContent, /可能持有|推断候选/);
  } finally { env.close(); }
});

test('deck catalog expands categories and pins them without persisting or carrying pins to a new game', () => {
  const env=setup();
  const timer = controlDeckTimer(env.window);
  try {
    env.activate(); env.send('MsgGamePlayCardNtf',{CardList:[1,2,3]});
    const section=[...env.document.querySelectorAll('.sgs-card-section')].find(node=>node.querySelector('h3')?.textContent==='牌堆结构');
    assert.match(section.textContent,/已见 0 · 开局 3/); assert.doesNotMatch(section.textContent,/0–/);
    env.document.querySelector('button[aria-label="查看类别 闪"]').click();
    assert.equal(section.querySelector('.sgs-card-category-cards .sgs-card-mini').dataset.cardId,'2');
    env.document.querySelector('button[aria-label="置顶类别 闪"]').click();
    assert.equal(section.querySelector('tbody tr').dataset.cardCategory,'name:闪');
    assert.equal(env.settings.get('pinnedDeckRows'),undefined);
    env.send('PubGsCUseCard',{SeatID:1,CardID:2});
    timer.flush();
    assert.equal(section.querySelector('tbody tr td:nth-child(2)').textContent,'0/1');
    assert.ok(section.querySelector('.sgs-card-catalog-item.is-seen .sgs-card-mini'));
    assert.equal(section.querySelector('.sgs-card-catalog-item small'), null);
    env.stop();env.activate();
    assert.equal(env.document.querySelector('.sgs-card-composition .is-pinned'),null,'reload does not restore pins');
    env.document.querySelector('button[aria-label="置顶类别 闪"]').click();
    env.send('MsgGamePlayCardNtf',{CardList:[1,2,3]});
    assert.equal(env.document.querySelector('.sgs-card-composition .is-pinned'),null,'new game clears pins');
    env.send('MsgGamePlayCardNtf',{CardList:[]});
    assert.equal(env.document.querySelector('.sgs-card-composition'),null);
    assert.match(env.document.querySelector('.sgs-card-deck-summary').textContent,/开局牌表未知/);
  } finally {env.close();}
});

test('type, suit and number sorting use native card objects and preserve selected state', () => {
  const env = setup();
  try {
    assert.equal(sortHand(env.game, 'suit'), true);
    assert.deepEqual(env.container.cardUis.map(ui => ui.Card.CardId), [2, 3, 1]);
    assert.deepEqual(env.container.seat.HandCards.map(card => card.CardId), [2, 3, 1]);
    assert.equal(env.container.cardUis.find(ui => ui.Card.CardId === 2).selected, true);
    assert.equal(sortHand(env.game, 'number'), true);
    assert.deepEqual(env.container.cardUis.map(ui => ui.Card.CardId), [2, 3, 1]);
    assert.equal(sortHand(env.game, 'type'), true);
    assert.deepEqual(env.container.cardUis.map(ui => ui.Card.CardName), ['杀', '闪', '桃']);
    assert.deepEqual(env.container.seat.HandCards.map(card => card.CardName), ['杀', '闪', '桃']);
    env.inhibited = true;
    const before = env.layouts;
    assert.equal(sortHand(env.game, 'number', { automatic: true }), false);
    assert.equal(env.layouts, before);
    env.self.sortCardBtn.enabled = false;
    assert.equal(sortHand(env.game, 'number'), false);
  } finally { env.close(); }
});

test('deck statistics coalesce changes, reuse metadata and skip hidden unpinned views', async () => {
  const env = setup(), timer = controlDeckTimer(env.window);
  const container = env.document.querySelector('main');
  container.classList.add('plugin-body');
  container.hidden = true;
  const lookups = [];
  const getMeta = env.game.getCardMeta;
  env.game.getCardMeta = id => { lookups.push(id); return getMeta(id); };
  try {
    env.send('MsgGamePlayCardNtf', { CardList: [1, 2, 3] });
    env.activate();
    const summary = env.document.querySelector('.sgs-card-deck-summary');
    const play = id => env.send('PubGsCUseCard', { SeatID: 1, CardID: id });
    play(1);
    assert.equal(timer.count, 0);
    assert.deepEqual(lookups, []);

    container.hidden = false;
    await Promise.resolve();
    assert.match(summary.textContent, /已见 1 · 开局 3/);
    assert.deepEqual(lookups, [1, 2, 3]);
    play(2); play(3);
    assert.equal(timer.count, 1);
    assert.equal(env.state.cards[3].seen, true);
    assert.match(summary.textContent, /已见 1/);
    timer.flush();
    assert.match(summary.textContent, /已见 3/);
    assert.deepEqual(lookups, [1, 2, 3]);
    const table = env.document.querySelector('.sgs-card-composition');
    play(3); timer.flush();
    assert.equal(env.document.querySelector('.sgs-card-composition'), table);

    env.document.querySelector('.sgs-card-controls button:nth-child(2)').click();
    assert.match(env.document.querySelector('.sgs-card-composition th').textContent, /花色/);
    assert.deepEqual(lookups, [1, 2, 3]);
    env.send('toolbox:gap', { reason: '测试消息缺口' });
    assert.equal(timer.count, 1);
    env.stop();
    assert.equal(timer.count, 0);
  } finally { env.close(); }
});

test('switching sort basis rebuilds flat draw order without losing selection or masks', () => {
  const env = setup(), drawOrder = [], calls = [];
  try {
    for (const ui of env.container.cardUis) {
      ui.enabled = ui.Card.CardId !== 3;
      ui.clear = full => {
        assert.equal(full, false);
        calls.push(['clear', ui.Card.CardId]);
        const index = drawOrder.indexOf(ui);
        if (index >= 0) drawOrder.splice(index, 1);
      };
      ui.Draw = target => {
        assert.equal(target, env.container);
        calls.push(['draw', ui.Card.CardId]);
        drawOrder.push(ui);
      };
      drawOrder.push(ui);
    }
    const nativeSort = env.container.SortNormalCards;
    env.container.SortNormalCards = function () {
      nativeSort.call(this);
      for (const ui of this.cardUis) { ui.clear(false); ui.Draw(this); }
    };
    for (const mode of ['type', 'suit', 'number', 'type', 'number', 'suit']) {
      calls.length = 0;
      assert.equal(sortHand(env.game, mode), true);
      assert.deepEqual(drawOrder.map(ui => ui.Card.CardId), env.container.cardUis.map(ui => ui.Card.CardId));
      assert.equal(calls.length, 6);
      assert.equal(drawOrder.find(ui => ui.Card.CardId === 2).selected, true);
      assert.equal(drawOrder.find(ui => ui.Card.CardId === 3).enabled, false);
    }
    calls.length = 0;
    assert.equal(sortHand(env.game, 'invalid'), false);
    assert.deepEqual(calls, []);
  } finally { env.close(); }
});

test('held shortcuts close on release/blur and do not intercept focused text input', () => {
  const env = setup();
  try {
    env.activate();
    env.send('decodeGameDealPileTopCardList', { IsResume: true, ProtoObj: { list_card_id: [5] } });
    const topButton = env.overlay.querySelector('.sgs-card-hud-actions button');
    assert.equal(topButton.textContent, '顶 1');
    topButton.dispatchEvent(new env.window.Event('pointerenter'));
    assert.equal(env.overlay.querySelector('.sgs-card-hud-list').hidden, false);
    env.overlay.querySelector('.sgs-card-hud').dispatchEvent(new env.window.Event('pointerleave'));
    assert.equal(env.overlay.querySelector('.sgs-card-hud-list').hidden, true);
    const key = (type, target, value) => { const event = new env.window.KeyboardEvent(type, { key: value, bubbles: true, cancelable: true, composed: true }); target.dispatchEvent(event); return event; };
    assert.equal(key('keydown', env.window, '1').defaultPrevented, true);
    assert.equal(env.overlay.querySelector('.sgs-card-hud-list').hidden, false);
    assert.ok(env.overlay.querySelector('.sgs-card-hud-list').textContent.includes('最顶在左'));
    key('keyup', env.window, '1'); assert.equal(env.overlay.querySelector('.sgs-card-hud-list').hidden, true);
    const input = env.document.querySelector('select[aria-label="按牌名筛选"]');
    assert.equal(key('keydown', input, '1').defaultPrevented, false);
    key('keydown', env.window, '3'); env.window.dispatchEvent(new env.window.Event('blur'));
    assert.equal(env.overlay.querySelector('.sgs-card-hud-list').hidden, true);
  } finally { env.close(); }
});

test('combined card filtering retains select focus/value during state refresh and puts pinned cards first', () => {
  const env = setup();
  try {
    env.activate();
    const query = env.document.querySelector('.sgs-card-query-section');
    query.open = true; query.dispatchEvent(new env.window.Event('toggle'));
    const input = env.document.querySelector('select[aria-label="按牌名筛选"]');
    assert.deepEqual([...input.options].slice(0, 3).map(option => option.textContent), ['全部牌名', '桃', '闪']);
    env.document.querySelector('button[aria-label="置顶类别 闪"]').click();
    assert.equal(input.options[1].textContent, '闪');
    input.value = '杀'; input.focus(); input.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    const select = env.document.querySelector('select[aria-label="按花色筛选"]');
    select.value = '2'; select.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.ok(env.document.querySelector('.sgs-card-query').parentElement.textContent.includes('符合条件 1 张'));
    env.send('PubGsCUseCard', { SeatID: 0, CardID: 1, useType: 1 });
    assert.equal(input.value, '杀'); assert.equal(env.document.activeElement, input);
  } finally { env.close(); }
});

test('combined card query previews 30 matches and can find cards outside that preview', () => {
  const env = setup();
  try {
    const ids = Array.from({ length: 41 }, (_, i) => i + 1);
    const lastId = ids.at(-1);
    env.cardModels.push({ CardId: lastId, CardName: '无中生有', FlowerOnSeat: 1, CardNumber: 8 });
    env.send('MsgGamePlayCardNtf', { CardList: ids });
    env.settings.set('queryExpanded', true);
    env.activate();
    const query = env.document.querySelector('.sgs-card-query-section');
    const renderedIds = () => [...query.querySelectorAll('.sgs-card-mini')].map(card => Number(card.dataset.cardId));
    assert.deepEqual(renderedIds(), ids.slice(0, 30));
    assert.match(query.textContent, /符合条件 41 张/);
    assert.match(query.textContent, /显示前 30 张/);

    const name = query.querySelector('[aria-label="按牌名筛选"]');
    name.value = '无中生有';
    name.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.deepEqual(renderedIds(), [lastId]);
    assert.match(query.textContent, /符合条件 1 张/);
    assert.doesNotMatch(query.textContent, /显示前 30 张/);
  } finally { env.close(); }
});

test('query expansion persists across reloads while bottom settings always start closed', async () => {
  const env = setup();
  try {
    env.activate();
    const query = () => env.document.querySelector('.sgs-card-query-section');
    const settings = () => env.document.querySelector('.sgs-card-settings');
    assert.equal(query().open, false);
    assert.equal(query().querySelectorAll('.sgs-card-mini').length, 0, 'closed queries do not render results');
    assert.equal(settings().open, false);
    assert.equal(settings().parentElement.lastElementChild, settings());
    query().open = true; settings().open = true;
    await new Promise(resolve => env.window.setTimeout(resolve, 5));
    assert.equal(env.settings.get('queryExpanded'), true);
    env.stop(); env.activate();
    assert.equal(query().open, true);
    assert.equal(settings().open, false);
    query().open = false;
    await new Promise(resolve => env.window.setTimeout(resolve, 5));
    env.send('MsgGameTurnNtf', { SeatID: 1 });
    assert.equal(query().querySelectorAll('.sgs-card-mini').length, 0);
    env.stop(); env.activate();
    assert.equal(query().open, false);
    assert.equal(env.settings.get('queryExpanded'), false);
  } finally { env.close(); }
});

test('discard ordering remains available in the external list after panel deduplication', () => {
  const env = setup();
  try {
    env.activate();
    env.send('PubGsCMoveCard', { FromID: 0, FromZone: 5, ToID: 255, ToZone: 2, CardIDs: [1, 2, 3], CardCount: 3, MoveType: 2 });
    env.overlay.querySelectorAll('.sgs-card-hud-actions button')[2].click();
    const list = env.overlay.querySelector('.sgs-card-hud-list');
    assert.equal(list.querySelectorAll('[aria-label="弃牌排序"] button').length, 4);
    [...list.querySelectorAll('button')].find(button => button.textContent === '点数').click();
    assert.deepEqual([...list.querySelectorAll('.sgs-card-mini')].map(card => Number(card.dataset.cardId)), [2, 3, 1]);
    assert.equal(env.settings.get('discardMode'), 'number');
  } finally { env.close(); }
});

test('long HUD lists keep their scroll container and expand in batches without dropping cards', () => {
  const env = setup();
  try {
    const ids = Array.from({ length: 130 }, (_, i) => i + 1);
    env.send('MsgGamePlayCardNtf', { CardList: ids });
    env.activate();
    env.send('PubGsCMoveCard', { FromID: 0, FromZone: 5, ToID: 255, ToZone: 2, CardIDs: ids, CardCount: ids.length, MoveType: 2 });
    env.overlay.querySelectorAll('.sgs-card-hud-actions button')[2].click();
    const list = env.overlay.querySelector('.sgs-card-hud-list');
    const scroll = list.querySelector('.sgs-card-hud-scroll');
    const more = list.querySelector('.sgs-card-hud-more');
    const rendered = () => [...scroll.querySelectorAll('.sgs-card-mini')].map(card => Number(card.dataset.cardId));
    assert.deepEqual(rendered(), ids.slice(0, 60));
    const first = scroll.querySelector('.sgs-card-mini');
    env.send('MsgGameRoundNtf', { isPassed: true });
    assert.equal(scroll.querySelector('.sgs-card-mini'), first);
    more.click();
    assert.deepEqual(rendered(), ids.slice(0, 120));
    more.click();
    assert.deepEqual(rendered(), ids);
    assert.equal(more.hidden, true);
    assert.equal(list.querySelector('.sgs-card-hud-scroll'), scroll);
  } finally { env.close(); }
});

test('deduplicated panel keeps eligible inference but does not repeat confirmed hands', () => {
  const env = setup();
  try {
    env.send('MsgGamePlayCardNtf', { CardList: [1, 2, 3, 4, 5, 6] });
    env.send('toolbox:snapshot', { selfSeatId: 0, seats: [0, 1, 2, 3].map(seatId => ({ seatId, handCount: 0, dead: false })) });
    for (const [seat, ids, count] of [[0, [1], 1], [2, [2], 1], [3, [3], 1], [2, [], 1], [1, [], 2]]) {
      env.send('PubGsCMoveCard', { FromID: 255, FromZone: 1, FromPosition: POSITION.unknown, ToID: seat, ToZone: 5, ToPosition: POSITION.unknown, CardIDs: ids, CardCount: count, MoveType: 1 });
    }
    env.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 2, knownHandCardIds: [2, 4] }] });
    env.activate();
    const section = [...env.document.querySelectorAll('main .sgs-card-section')].find(node => node.querySelector('h3').textContent === '手牌推断');
    assert.equal(section.hidden, false);
    assert.deepEqual([...section.querySelectorAll('.sgs-card-mini')].map(card => Number(card.dataset.cardId)), [5, 6]);
    env.send('toolbox:snapshot', { seats: [{ seatId: 2, handCount: 3, knownHandCardIds: [2, 4] }] });
    assert.equal(section.hidden, true, 'new hidden teammate card disables inference');
  } finally { env.close(); }
});

test('sort controls use the hand area above the left side and follow canvas scaling', () => {
  const env = setup();
  try {
    env.settings.set('sortOffset', { x: 700, y: 400 });
    env.activate();
    const bar = env.container.getChildByName('sgs-toolbox-hand-sort');
    assert.equal(env.overlay.querySelector('.sgs-card-sortbar'), null, 'no HTML control above the game canvas');
    assert.equal(bar.visible, true);
    assert.equal(bar.x, 233); assert.equal(bar.y, -22);
    assert.equal(bar.getChildByName('number')._children[0].fontSize, 12);
    assert.deepEqual(handSortAnchor(env.window, env.self), { x: 233, y: 458 });
    env.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 30, top: 20, width: 800, height: 560 });
    const scaled = handSortAnchor(env.window, env.self);
    assert.equal(scaled.x, 216.4);
    assert.ok(Math.abs(scaled.y - 386.4) < .01);
    env.container.parent = null;
    assert.equal(handSortAnchor(env.window, env.self), null, 'never anchor a detached hand controller');
  } finally { env.close(); }
});

test('sort controls clamp saved offsets to the visible lower half of the canvas', () => {
  const env = setup();
  try {
    env.settings.set('nativeSortOffset', { x: 1e6, y: -1e6 });
    env.activate();
    const bar = env.container.getChildByName('sgs-toolbox-hand-sort');
    assert.deepEqual(bar._children.filter(child => ['spacing', 'type', 'suit', 'number'].includes(child.name)).map(child => child.name), ['spacing', 'type', 'suit', 'number']); assert.equal(bar.getChildByName('drag'), undefined);
    assert.equal(bar.x, 860); assert.equal(bar.y, -126);
    env.window.innerWidth = 340;
    env.window.innerHeight = 400;
    env.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 30, top: -100, width: 800, height: 560 });
    env.send('MsgGameTurnNtf', { SeatID: 1 });
    assert.equal(bar.x, 247.5);
    assert.equal(bar.y, -126, 'use the canvas midpoint even when the top of the canvas is clipped');
  } finally { env.close(); }
});

test('switching sort enhancement off restores native button and selection method', () => {
  const env = setup();
  try {
    env.activate();
    assert.equal(env.self.sortCardBtn.alpha, 0); assert.equal(env.self.sortCardBtn.mouseEnabled, false);
    assert.notEqual(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);
    const checkbox = env.document.querySelector('[data-setting="handSort"]');
    checkbox.checked = false; checkbox.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(env.self.sortCardBtn.alpha, 1); assert.equal(env.self.sortCardBtn.mouseEnabled, true);
    assert.equal(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);
    assert.notEqual(env.container.getChildByName('sgs-toolbox-hand-sort')?.visible, true);
  } finally { env.close(); }
});

test('missing native rendering classes keep the original sort button usable', () => {
  const env = setup();
  try {
    delete env.window.Laya.Sprite;
    env.activate();
    assert.equal(env.self.sortCardBtn.alpha, 1);
    assert.equal(env.self.sortCardBtn.mouseEnabled, true);
    assert.equal(env.container.getChildByName('sgs-toolbox-hand-sort'), undefined);
    assert.equal(env.overlay.querySelector('.sgs-card-sortbar'), null);
  } finally { env.close(); }
});

test('locking sort persists; card selection dialog follows current own hand order', () => {
  const env = setup();
  try {
    env.activate();
    env.container.getChildByName('sgs-toolbox-hand-sort').getChildByName('number').event('doubleclick');
    assert.equal(env.settings.get('lockedSort'), 'number');
    const dialog = new env.SelectCardWindow();
    const output = dialog.createCardUis(env.cardModels.slice());
    assert.deepEqual(output.map(card => card.CardId), [2, 3, 1]);
    assert.deepEqual(env.cardModels.map(card => card.CardId), [1, 2, 3]);
  } finally { env.close(); }
});

test('ten reload cycles retain card observations and remove all owned controls/listeners', () => {
  const env = setup();
  try {
    const state = JSON.stringify(env.state);
    for (let i = 0; i < 10; i++) {
      env.activate();
      assert.equal(env.document.querySelectorAll('[data-sgs-cards-overlay]').length, 1);
      assert.equal(env.listeners, 1); assert.equal(env.panelCount, 1);
      assert.equal(env.container._children.filter(c=>c.name==='sgs-toolbox-hand-sort').length, 1);
      env.stop();
      assert.equal(env.document.querySelectorAll('[data-sgs-cards-overlay]').length, 0);
      assert.equal(env.document.querySelector('main').children.length, 0);
      assert.equal(env.listeners, 0); assert.equal(env.panelCount, 0);
      assert.equal(env.container.getChildByName('sgs-toolbox-hand-sort'), undefined);
      assert.equal(env.self.sortCardBtn.alpha, 1); assert.equal(env.self.sortCardBtn.mouseEnabled, true);
      assert.equal(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);
    }
    assert.equal(JSON.stringify(env.state), state);
  } finally { env.close(); }
});

test('settings and overlays tolerate missing native scene and unknown card definitions', () => {
  const env = setup();
  try {
    env.game.getScene = () => null; env.game.getSelfSeatUI = () => null; env.game.getSeatUIs = () => [];
    env.game.getClass = () => null; env.game.getCardMeta = () => { throw new Error('not ready'); };
    env.activate();
    const query = env.document.querySelector('.sgs-card-query-section');
    query.open = true; query.dispatchEvent(new env.window.Event('toggle'));
    assert.equal(env.overlay.querySelector('.sgs-card-hud').hidden, true);
    assert.notEqual(env.container.getChildByName('sgs-toolbox-hand-sort')?.visible, true);
    const unknown = env.document.querySelector('main .sgs-card-mini[data-card-id="1"]');
    assert.ok(unknown.title.startsWith('卡牌 1 '));
    assert.equal(unknown.querySelector('.sgs-card-name').textContent, '未知');
  } finally { env.close(); }
});

test('returning to hall hides gameplay overlays and restores native changes', () => {
  const env = setup();
  try {
    env.activate();
    assert.equal(env.overlay.querySelector('.sgs-card-hud').hidden, false);
    env.send('toolbox:snapshot', { inGame: false, sceneName: 'HallScene' });
    assert.equal(env.overlay.querySelector('.sgs-card-hud').hidden, true);
    assert.notEqual(env.container.getChildByName('sgs-toolbox-hand-sort')?.visible, true);
    assert.equal(env.overlay.querySelectorAll('.sgs-card-seat-reveal').length, 0);
    assert.equal(env.self.sortCardBtn.alpha, 1);
    assert.equal(env.SelectCardWindow.prototype.createCardUis, env.originalSelection);
    const root = env.document.querySelector('main .sgs-cards');
    const visibleSections = () => [...root.children].filter(node => node.tagName !== 'STYLE' && !node.hidden);
    assert.deepEqual(visibleSections().map(node => node.classList[0]), ['sgs-card-settings']);
    const checkbox = root.querySelector('[data-setting="fourColors"]');
    checkbox.checked = true; checkbox.dispatchEvent(new env.window.Event('change'));
    assert.equal(env.settings.get('fourColors'), true, 'settings remain usable in the hall');
    env.send('toolbox:gap', { reason: '缺少开局记录' });
    assert.equal(root.querySelector('.sgs-card-status').hidden, true);
    assert.deepEqual(visibleSections().map(node => node.classList[0]), ['sgs-card-settings']);
    env.send('MsgGamePlayCardNtf', { CardList: [1, 2, 3] });
    assert.equal(root.querySelector('.sgs-card-status').hidden, false);
    assert.equal(root.querySelector('.sgs-card-query-section').hidden, false);
    assert.equal(root.querySelector('.sgs-card-composition').closest('section').hidden, false);
  } finally { env.close(); }
});

test('initial hall with missing records only renders settings and does not read card metadata', () => {
  const env = setup();
  try {
    env.send('ClientLeavetableRep');
    env.settings.set('queryExpanded', true);
    let reads = 0;
    env.game.getCardMeta = () => { reads++; throw new Error('no game'); };
    env.activate();
    const root = env.document.querySelector('main .sgs-cards');
    assert.deepEqual([...root.children].filter(node => node.tagName !== 'STYLE' && !node.hidden).map(node => node.classList[0]), ['sgs-card-settings']);
    const query = root.querySelector('.sgs-card-query-section');
    query.dispatchEvent(new env.window.Event('toggle'));
    assert.equal(query.open, true, 'hall visibility does not overwrite saved query preference');
    assert.equal(root.querySelectorAll('.sgs-card-mini').length, 0);
    assert.equal(reads, 0);
    assert.equal(root.querySelector('.sgs-card-settings').open, false);
  } finally { env.close(); }
});

test('observed random theft paints possible cards and public play resolves ownership', () => {
  const env = setup();
  try {
    env.send('toolbox:snapshot', { selfSeatId: 0, seats: [{seatId: 1, knownHandCardIds: [4,5], handCount: 2}, {seatId: 2, handCount: 0}] });
    env.send('PubGsCMoveCard', {FromID:1, FromZone:5, ToID:2, ToZone:5, CardIDs:[], CardCount:1, MoveType:1});
    env.activate();
    assert.equal(env.overlay.querySelectorAll('[data-seat-id="1"] .is-possible').length,2);
    assert.match(env.overlay.querySelector('[data-seat-id="1"]').getAttribute('aria-label'), /确定有 0 张，可能有 2 张/);
    assert.match(env.overlay.querySelector('.is-possible').textContent,/可能/);
    env.send('PubGsCMoveCard', {FromID:2, FromZone:5, ToID:255, ToZone:2, CardIDs:[4], CardCount:1, MoveType:2});
    assert.equal(env.overlay.querySelector('[data-seat-id="1"] [data-card-id="4"]'),null);
    env.send('PubGsCMoveCard', {FromID:1, FromZone:5, ToID:1, ToZone:5, CardIDs:[5], CardCount:1, MoveType:1});
    assert.equal(env.overlay.querySelector('[data-seat-id="1"] [data-card-id="5"]').classList.contains('is-possible'),false);
  } finally {env.close();}
});


test('reveal occlusion accepts only attached visible card windows and ignores hidden child bounds', () => {
  const env = setup();
  try {
    const stage = env.window.Laya.stage;
    const layer = { layerOrder: 4, parent: stage, _children: [] };
    stage._children.push(layer);
    class CardWindow {}
    const panel = Object.assign(new CardWindow(), { parent: layer, width: 80, height: 60,
      getSelfBounds() { throw new Error('aggregate child bounds must not be used'); },
      localToGlobal(p) { return { x: p.x + 200, y: p.y + 100 }; } });
    const game = { getClass: name => name === 'CheckSeatCardWindow' ? CardWindow : null };
    layer._children.push({ ...panel, width: 1000, height: 700 });
    assert.equal(revealWindowClip(env.window, game), '', 'unrelated windows never occlude');
    layer._children.push(panel);
    const clip = revealWindowClip(env.window, game);
    assert.ok(clip.includes('280') && clip.includes('160'), 'use the card window dimensions');
    for (const [key, value] of [['visible', false], ['_visible', false], ['alpha', 0], ['scaleX', 0], ['destroyed', true], ['parent', null]]) {
      const old = panel[key]; panel[key] = value;
      assert.equal(revealWindowClip(env.window, game), '', key);
      panel[key] = old;
    }
    layer.alpha = 0;
    assert.equal(revealWindowClip(env.window, game), '', 'invisible ancestor');
    layer.alpha = 1;
    assert.equal(revealWindowClip(env.window, { getClass: () => null }), '', 'unknown classes never widen occlusion');
  } finally { env.close(); }
});
