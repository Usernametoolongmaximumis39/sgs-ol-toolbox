import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import cards from '../src/plugins/cards/index.js';
const CARDS_VERSION = cards.manifest.version;
import { THEMES } from '../src/plugins/themes/palettes.js';

// Use the cached official engine, without loading the game or logging in.
const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
await readFile(engine);
const clientSource = await readFile(process.env.SGS_CLIENT_SOURCE || 'test-results/reference/client-static/sgsGame_a.js', 'utf8');
function nativeSlice(start, end) {
  const first = clientSource.indexOf(start), last = clientSource.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first && last - first < 5000, start);
  return clientSource.slice(first, last);
}
const selectContextSource = nativeSlice('class rGt{', 'class ');
const clickCardSource = nativeSlice('CardUI_Click(t){if(Zni.CanOperationInGame())if(t.CardUi instanceof iei)', 'invalidateLayoutHandCardFlag=!1');
const packet = JSON.parse(await readFile(`release/market/packages/cards/${CARDS_VERSION}.json`, 'utf8'));
const bundle = await build({ stdin: { contents: `export { mountPluginUI } from './src/ui/plugin-ui.js'; export { ResourceScope } from './src/core/resources.js';
  export { createNativeTheme } from './src/ui/native-theme.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'NativeCardCheck' });
const output = path.resolve('test-results'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<html><body style="margin:0;background:#172a24"><main></main></body></html>');
  await page.addScriptTag({ path: engine });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: `window.NativeCardPlugin = new Function(${JSON.stringify(packet.code)})();` });
  await page.addScriptTag({ content: `(() => {
    const nGt = { NONE: 'none' };
    const Jri = { I: () => ({ ID: 0 }) };
    const Zni = { CanOperationInGame: () => true };
    const j1i = { I: () => ({ UpdateCardUseGuideYingBianClickCardUI() {}, UpdateCardUseGuideNewbieClickCardUI() {} }) };
    class iei {}
    class u2i {}
    class tei { constructor(Card) { this.Card = Card; this.Activated = true; } }
    ${selectContextSource}
    class CachedHand { ${clickCardSource} }
    window.ShanheNative = { CardUI: tei, Selection: rGt, clickCard: CachedHand.prototype.CardUI_Click };
  })();` });
  await page.evaluate(() => {
    Laya.init(1100, 800); Laya.stage.bgColor = '#172a24';
    class CheckSeatCardWindow extends Laya.Sprite {}
    window.CheckSeatCardWindow = CheckSeatCardWindow;
    const gameLayer = new Laya.Sprite(), windowLayer = new Laya.Sprite();
    gameLayer.layerOrder = 2; windowLayer.layerOrder = 4;
    Laya.stage.addChild(gameLayer); Laya.stage.addChild(windowLayer);
    const self = new Laya.Sprite(), hand = new Laya.Sprite();
    gameLayer.addChild(self); self.addChild(hand); self.pos(0, 300); hand.size(700, 169);
    hand.HandCardRect = { x: 163 }; hand.NORMAL_Y = 32;
    hand.cardUis = [9, 3, 7].map((number, i) => ({ Card: { CardId: i + 1, CardNumber: number, FlowerOnSeat: i + 1, CardType: 1 }, selected: i === 1 }));
    hand.seat = { HandCards: hand.cardUis.map(ui => ui.Card) };
    let handLayouts = 0;
    hand.invalidateLayoutHandCard = () => handLayouts++;
    hand.SortNormalCards = () => hand.cardUis.reverse();
    self.cardContainer = hand; self.sortCardBtn = { enabled: true, alpha: 1, mouseEnabled: true };
    const staleTimer=new Laya.Sprite();staleTimer.size(91,11);staleTimer.RemainValue=11;staleTimer.countTween={};
    self.countdownTimer=staleTimer; // Allocated, positive, but never added to stage.
    self.seat = { index: 0 }; self.seatID = 0;
    self.seat.Index = 0; self.seat.InDealRound = true;
    const renChe = { limit: 1, used: 0 };
    self.skillItems = ['正常', '用尽', '无限', '未知', '刃掣'].map((name, index) => {
      const item = new Laya.Sprite(); item.pos(460 + index * 70, -10); item.size(64, 28);
      item.graphics.drawRect(0, 0, 64, 28, '#302d25', '#82714d', 1);
      const text = new Laya.Text(); text.text = name; text.fontSize = 14; text.color = '#eee3cc'; text.pos(7, 7); item.addChild(text);
      item.Skill = name === '刃掣' ? { SkillId: 4009, Seat: self.seat, SpecialModeDesc: '出牌阶段限X次，你可弃置X张牌。',
        get TimelimitRound() { return renChe.limit; }, GetSkillUseCountInRound: () => renChe.used }
        : { SkillId: 100 + index, Seat: self.seat, SpecialModeDesc: '出牌阶段限三次，你可以摸牌。',
        TimelimitRound: 3, TimeLimitGame: Number.MAX_SAFE_INTEGER,
        GetSkillUseCountInRound: () => [1, 3, 0, undefined][index], hasUnlimitedUses: () => index === 2 };
      self.addChild(item); return item;
    });
    const avatar=new Laya.Sprite();avatar.size(73,172);avatar.pos(400,30);
    avatar.scrollRect=new Laya.Rectangle(36,0,73,172);
    avatar.graphics.drawRect(36,0,73,172,'#587550','#dbba70',2);gameLayer.addChild(avatar);
    const observed={seat:{index:1},seatID:1,seatAvatar:avatar};
    for (let i = 0; i < 3; i++) {
      const card = new Laya.Sprite(); card.pos(163 + i * 96, 32); card.size(93, 130);
      card.graphics.drawRect(0, 0, 93, 130, '#e9d8b4', '#988568', 1);
      const label = new Laya.Text(); label.text = ['♠9 杀', '♥3 闪', '♦7 桃'][i]; label.fontSize = 20; label.color = '#252018'; label.pos(5, 7); card.addChild(label); hand.addChild(card);
    }
    const phase = new Laya.Text(); phase.text = '出牌阶段'; phase.fontSize = 16; phase.color = '#dbba70'; phase.pos(0, -4); self.addChild(phase);
    const settings = new Map(), scope = new NativeCardCheck.ResourceScope();
    const themeListeners = new Set(), themes = { current: { tokens: {} }, subscribe(fn) { themeListeners.add(fn); return () => themeListeners.delete(fn); } };
    const state = Object.assign(NativeCardPlugin.initialState(), { active: true, selfSeatId: 0, seats: { 0: {} } });
    state.cards={4:{id:4,locations:['5:1'],tags:[],lastSeq:1,seen:true},5:{id:5,locations:['5:1','5:2'],tags:[],lastSeq:1,seen:true}};
    let gameState = state;
    let onStateChange;
    const send = (type, payload) => {
      gameState = NativeCardPlugin.reduce(gameState, { type, payload, sessionId: 'yushi', seq: gameState.lastSeq + 1 });
      onStateChange?.(gameState);
    };
    let clicks = 0;
    const scene = { SelfSeatUi: self, SceneName: 'GameScene' };
    const dispose = NativeCardPlugin.activate({ document, window, scope, themes,
      game: { getScene: () => scene, getSelfSeatUI: () => self, getSeatUIs: () => [self,observed], getClass: name => name === 'CheckSeatCardWindow' ? CheckSeatCardWindow : null,
        getCardMeta:id=>({name:'杀',suit:id===4?3:4,number:id===4?10:2}) },
      getState: () => gameState, settings: { get: (key, fallback) => settings.has(key) ? settings.get(key) : fallback, set: (key, value) => settings.set(key, value) },
      subscribe(fn) { onStateChange = fn; return () => { onStateChange = undefined; }; },
      ui: { ...NativeCardCheck.mountPluginUI({document,window,scope}, () => ({document,window,scope})),
        nativeTheme: NativeCardCheck.createNativeTheme({document,window,scope,themes}), registerPanel(spec) {
        const main = document.querySelector('main'); main.hidden = true;
        return spec.render(main);
      } },
    });
    const enhancement = { dispose };
    let handPresses = 0;
    hand.on('mousedown', hand, () => handPresses++);
    const modal = new Laya.Sprite(); modal.name = 'SelectCardWindowFixture'; modal.size(540, 250); modal.pos(80, 240);
    modal.graphics.drawRect(0, 0, 540, 250, '#30485a', '#dbba70', 2);
    const modalTitle = new Laya.Text(); modalTitle.text = '原生选牌弹窗（引擎演练）'; modalTitle.fontSize = 24; modalTitle.color = '#fff3dc'; modalTitle.pos(20, 16); modal.addChild(modalTitle);
    const countdown = new Laya.Sprite(); countdown.size(230,12); countdown.pos(155,220); countdown.RemainValue=7.4;countdown.countTween={};
    countdown.graphics.drawRect(0,0,230,12,'#70251c'); modal.addChild(countdown); modal.countdownTimer=countdown;
    modal.on('click', modal, () => clicks++);
    window.nativeCheck = { themes, themeListeners, state, scene, gameLayer, windowLayer, hand, self, avatar, staleTimer, settings, scope, enhancement, modal, renChe,
      send, restoreGameState() { gameState = state; onStateChange?.(gameState); }, get clicks() { return clicks; },
      get handPresses() { return handPresses; }, get handLayouts() { return handLayouts; } };
  });
  await page.waitForFunction(() => !!nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort'));
  const counts = () => page.evaluate(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').map(n => n.text));
  assert.deepEqual(await counts(), ['2', '0', '∞', '?', '1']);
  await page.screenshot({ path: path.join(output, 'card-skill-counts.png') });
  await page.evaluate(() => {
    nativeCheck.themes.current.tokens = { bg: '#f6f2e9', accent: '#77581d', muted: '#746752', scheme: 'light' };
    nativeCheck.themeListeners.forEach(fn => fn());
    Laya.stage.bgColor = '#f6f2e9';
    nativeCheck.self.skillItems.forEach(item => { item.graphics.clear(); item.graphics.drawRect(0,0,64,28,'#fffaf1','#c4b492',1); item.getChildAt(0).color='#302b23'; });
  });
  assert.deepEqual(await page.evaluate(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').map(n => n.color)), ['#77581d','#746752','#77581d','#77581d','#77581d']);
  await page.screenshot({ path: path.join(output, 'card-skill-counts-light.png') });
  await page.evaluate(() => { nativeCheck.themes.current.tokens = {}; nativeCheck.themeListeners.forEach(fn => fn()); Laya.stage.bgColor = '#172a24'; });
  await page.evaluate(() => nativeCheck.settings.set('skillCounts', false));
  await page.waitForFunction(() => !nativeCheck.self._children.some(n => n.name === 'sgs-toolbox-skill-count'));
  await page.evaluate(() => nativeCheck.settings.set('skillCounts', true));
  await page.waitForFunction(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').length === 5);
  for (const [limit, used, remaining] of [[1, 1, '0'], [3, 1, '2'], [1, 2, '0']]) {
    await page.evaluate(({ limit, used }) => Object.assign(nativeCheck.renChe, { limit, used }), { limit, used });
    await page.waitForFunction(remaining => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').at(-1)?.text === remaining, remaining);
  }
  await page.evaluate(() => {
    nativeCheck.tiaoxin = { used: 0, settled: 0 };
    nativeCheck.self.skillItems.at(-1).Skill = {
      SkillId: 985, TimelimitRound: 2, GetSkillUseCountInRound: () => nativeCheck.tiaoxin.used,
      Seat: { Index: 0, InDealRound: true, GetStateValue: () => nativeCheck.tiaoxin.settled },
    };
  });
  for (const [used, settled, remaining] of [[0, 0, '1'], [1, 2, '0'], [1, 1, '1'], [2, 1, '0']]) {
    await page.evaluate(({ used, settled }) => Object.assign(nativeCheck.tiaoxin, { used, settled }), { used, settled });
    await page.waitForFunction(expected => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').at(-1)?.text === expected, remaining);
  }
  await page.evaluate(() => {
    const { self, send } = nativeCheck, item = self.skillItems.at(-1);
    nativeCheck.previousSkill = item.Skill;
    self.seat.MaxHp = 4;
    item.Skill = { SkillId: 3751, Seat: self.seat };
    item.getChildAt(0).text = '驭势';
    send('MsgGamePlayCardNtf', { CardList: [1, 2, 3] });
    send('MsgGameTurnNtf', { TurnCnt: 1 });
  });
  for (const [type, payload, remaining] of [
    ['PubGsCUseSpell', { SeatID: 0, SpellID: 3751, EffectIndex: 2 }, '3'],
    ['GsCGamephaseNtf', { SeatID: 1, Round: 0 }, '3'],
    ['PubGsCUseSpell', { SeatID: 0, SpellID: 3751, EffectIndex: 2 }, '2'],
    ['MsgGameTurnNtf', { TurnCnt: 1 }, '2'],
    ['MsgGameTurnNtf', { TurnCnt: 2 }, '4'],
    ['MsgReconnectGame', {}, '?'],
    ['MsgGameTurnNtf', { TurnCnt: 2, IsResume: true }, '?'],
    ['MsgGameTurnNtf', { TurnCnt: 3 }, '4'],
  ]) {
    await page.evaluate(({ type, payload }) => nativeCheck.send(type, payload), { type, payload });
    await page.waitForFunction(expected => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').at(-1)?.text === expected, remaining);
    if (type === 'GsCGamephaseNtf') await page.screenshot({ path: path.join(output, 'card-yushi-across-turns.png') });
  }
  await page.evaluate(() => {
    const item = nativeCheck.self.skillItems.at(-1);
    item.Skill = nativeCheck.previousSkill;
    item.getChildAt(0).text = '刃掣';
    nativeCheck.restoreGameState();
  });
  await page.evaluate(() => nativeCheck.self.skillItems[0].Skill.GetSkillUseCountInRound = () => 2);
  await page.waitForFunction(() => nativeCheck.self._children.find(n => n.name === 'sgs-toolbox-skill-count').text === '1');
  const measure = () => page.evaluate(() => {
    const { hand } = nativeCheck, root = hand.getChildByName('sgs-toolbox-hand-sort');
    const button = root.getChildByName('number');
    const start = root.localToGlobal(new Laya.Point(0, 0), true), end = root.localToGlobal(new Laya.Point(root.width, root.height), true);
    const center = button.localToGlobal(new Laya.Point(button.width / 2, button.height / 2), true);
    return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y, fontSize: button.getChildAt(0).fontSize, cx: center.x, cy: center.y };
  });
  for (const scale of [1, 1.6]) {
    await page.evaluate(scale => nativeCheck.gameLayer.scale(scale, scale), scale);
    const bounds = await measure();
    await page.waitForFunction(() => {
      const {avatar}=nativeCheck;
      const expected=avatar.parent.localToGlobal(new Laya.Point(avatar.x,avatar.y+172),true);
      const revealed=document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
      if(!revealed)return false;
      const actual=revealed.getBoundingClientRect();
      const top=avatar.parent.localToGlobal(new Laya.Point(avatar.x,avatar.y),true);
      return Math.abs(actual.x-Math.max(0,expected.x-20*Math.min(1,(expected.y-top.y)/172)))<.1&&Math.abs(actual.y-expected.y)<.1;
    });
    assert.equal(await page.evaluate(()=>!!nativeCheck.staleTimer.getChildByName('sgs-toolbox-countdown')),false);
    assert.equal(await page.locator('[data-sgs-cards-overlay]').locator('.sgs-card-countdown').count(),0);
    assert.equal(await page.evaluate(() => nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').numChildren), 5);
    assert.equal(bounds.fontSize, 12); assert.ok(Math.abs(bounds.height - 24 * scale) < .1);
    assert.ok(Math.abs(bounds.width - 136 * scale) < .1);
    assert.ok(Math.abs(bounds.x - 233 * scale) < .1, 'the default horizontal anchor follows the hand');
    assert.ok(Math.abs(bounds.y - 278 * scale) < .1, 'toolbar sits one quarter-height above its previous anchor');
    await page.waitForTimeout(350);
    await page.mouse.click(bounds.cx, bounds.cy);
    assert.deepEqual(await page.evaluate(() => nativeCheck.hand.cardUis.map(ui => ui.Card.CardNumber)), [3, 7, 9]);
    assert.equal(await page.evaluate(() => nativeCheck.hand.cardUis.find(ui => ui.Card.CardNumber === 3).selected), true);
  }
  // Seven cards per row must fit the rendered portrait at every viewport scale.
  for (const [width, portraitWidth, scale] of [[640,140,.65],[900,140,1],[1280,140,1.6]]) {
    await page.setViewportSize({width,height:800});
    await page.evaluate(({portraitWidth,scale}) => {
      nativeCheck.gameLayer.scale(scale,scale);
      nativeCheck.avatar.pos(200,30);
      nativeCheck.avatar.scrollRect.width=portraitWidth;
      nativeCheck.avatar.graphics.clear();
      nativeCheck.avatar.graphics.drawRect(36,0,portraitWidth,172,'#587550','#dbba70',2);
      nativeCheck.state.cards={};
      for(let id=4;id<27;id++) nativeCheck.state.cards[id]={id,locations:['5:1'],tags:[],lastSeq:1,seen:true};
    }, {portraitWidth,scale});
    await page.waitForTimeout(350);
    const layout=await page.locator('[data-sgs-cards-overlay]').locator('.sgs-card-seat-reveal').evaluate(box=>{
      const rect=box.getBoundingClientRect(), cards=[...box.children].map(n=>n.getBoundingClientRect());
      return {right:rect.right,width:rect.width,height:rect.height,cardWidth:cards[0].width,cardHeight:cards[0].height,columns:cards.filter(r=>r.top===cards[0].top).length,rows:new Set(cards.map(r=>r.top)).size,inside:cards.every(r=>r.left>=rect.left&&r.right<=rect.right+.1)};
    });
    assert.ok(layout.rows>1); assert.ok(layout.inside); assert.ok(layout.right<=width);
    assert.ok(layout.width<=(portraitWidth+40)*scale+.1);
    assert.equal(layout.columns, 7);
    const cardScale = layout.width / (7 * 42 - 2);
    assert.ok(Math.abs(layout.cardWidth-40*cardScale)<.1);
    assert.ok(Math.abs(layout.cardHeight-54*cardScale)<.1);
    assert.ok(Math.abs(layout.height-139*cardScale)<.1,'two and a half visible rows');
    const reveal=page.locator('[data-sgs-cards-overlay]').locator('.sgs-card-seat-reveal');
    await reveal.evaluate(box=>{box.scrollTop=0;window.revealBeforeScroll=box;});
    await page.screenshot({path:path.join(output,`card-reveal-wrap-${width}.png`)});
    await reveal.hover();await page.mouse.wheel(0,100);
    await page.waitForFunction(()=>document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal').scrollTop>0);
    await page.waitForTimeout(300);
    assert.equal(await reveal.evaluate(box=>box===window.revealBeforeScroll&&box.scrollTop>0),true,'refresh preserves scroll container and offset');
    if(width===640){
      await reveal.evaluate(box=>{box.scrollTop=0;});
      const r=await reveal.boundingBox(), session=await page.context().newCDPSession(page);
      await session.send('Emulation.setTouchEmulationEnabled',{enabled:true});
      const x=r.x+r.width/2,y=r.y+r.height-8;
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let dy=8;dy<=48;dy+=8){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-dy}]});await page.waitForTimeout(25);}
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>window.revealBeforeScroll.scrollTop>0);
      await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});await session.detach();
    }
  }
  await page.setViewportSize({width:1100,height:800});
  await page.evaluate(()=>{nativeCheck.avatar.pos(400,30);nativeCheck.avatar.scrollRect.width=73;nativeCheck.gameLayer.scale(1.6,1.6);});
  await page.evaluate(() => { for(let id=4;id<37;id++) nativeCheck.state.cards[id]={id,locations:id%2?['5:1','5:2']:['5:1'],tags:[],lastSeq:1,seen:true}; });
  await page.waitForFunction(()=>document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelectorAll('.sgs-card-seat-reveal .sgs-card-mini').length===33);
  const reveal = page.locator('[data-sgs-cards-overlay]').locator('.sgs-card-seat-reveal');
  await reveal.evaluate(box => {
    window.unchangedRevealCard = box.firstElementChild;
    nativeCheck.state.lastSeq++;
    nativeCheck.avatar.x += 5;
    window.previousRevealLeft = box.style.left;
  });
  await page.waitForFunction(() => window.unchangedRevealCard.parentNode?.style.left !== window.previousRevealLeft);
  assert.equal(await reveal.evaluate(box => box.firstElementChild === window.unchangedRevealCard), true,
    'an unrelated sequence change and portrait move preserve card nodes');
  await page.evaluate(() => { nativeCheck.state.cards[4].tags.push('展示'); });
  await page.waitForFunction(() => document.querySelector('[data-sgs-cards-overlay]').shadowRoot
    .querySelector('.sgs-card-seat-reveal [data-card-id="4"]').title.includes('展示'));
  await page.evaluate(() => { nativeCheck.avatar.x -= 5; });
  assert.deepEqual(await page.evaluate(()=>{
    const box=document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
    const cards=[...box.children].map(c=>c.getBoundingClientRect());
    return {columns:cards.filter(c=>c.y===cards[0].y).length,wrapped:cards[8].y>cards[0].y,scroll:box.scrollHeight>box.clientHeight};
  }),{columns:7,wrapped:true,scroll:true});
  let previousCardWidth = Infinity;
  for (const columns of [4, 5, 6, 7, 8]) {
    await page.evaluate(columns => nativeCheck.settings.set('revealColumns', columns), columns);
    await page.waitForFunction(columns => {
      const box = document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
      return getComputedStyle(box).gridTemplateColumns.split(' ').length === columns;
    }, columns);
    const layout = await reveal.evaluate(box => {
      const cards = [...box.children].map(card => card.getBoundingClientRect()), first = cards[0];
      const right = box.getBoundingClientRect().right;
      return { columns: cards.filter(card => card.top === first.top).length, width: first.width,
        inside: cards.every(card => card.right <= right + .1) };
    });
    assert.equal(layout.columns, columns);
    assert.ok(layout.inside && layout.width < previousCardWidth);
    previousCardWidth = layout.width;
    if (columns === 4 || columns === 8) {
      await reveal.evaluate(box => { box.scrollTop = 0; });
      await reveal.screenshot({ path: path.join(output, `card-reveal-size-${columns}.png`) });
    }
  }
  await page.evaluate(() => nativeCheck.settings.delete('revealColumns'));
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
    return box.style.getPropertyValue('--sgs-reveal-columns') === '7';
  });
  const bounds = await measure();
  await page.screenshot({path:path.join(output,'toolbox-spectator-reveals.png'),clip:{x:600,y:20,width:400,height:540}});
  // A native dialog must cover only the intersecting part of the HTML reveals.
  await page.evaluate(() => {
    const box=document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
    const r=box.getBoundingClientRect();
    const popup=new window.CheckSeatCardWindow(); popup.pos(r.x,r.y); popup.size(65,90);
    popup.graphics.drawRect(0,0,65,90,'#242d38','#dbba70',1);
    const label=new Laya.Text();label.text='知天';label.color='#eee3cc';label.fontSize=18;label.pos(10,12);popup.addChild(label);
    const hidden=new Laya.Sprite();hidden.size(900,700);hidden.visible=false;popup.addChild(hidden);
    const unrelated=new Laya.Sprite();unrelated.size(1100,800);nativeCheck.windowLayer.addChild(unrelated);nativeCheck.unrelated=unrelated;
    nativeCheck.windowLayer.addChild(popup);nativeCheck.revealPopup=popup;
    nativeCheck.revealHit={x:r.x+15,y:r.y+15};
  });
  await page.waitForFunction(()=>document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-layer').style.clipPath);
  assert.equal(await page.evaluate(()=>{
    const p=nativeCheck.revealHit;
    return document.elementFromPoint(p.x,p.y)===document.querySelector('[data-sgs-cards-overlay]');
  }),false,'covered reveal must not intercept native dialog input');
  await page.screenshot({path:path.join(output,'card-reveal-under-window.png'),clip:{x:600,y:20,width:400,height:540}});
  await page.evaluate(()=>nativeCheck.revealPopup.visible=false);
  await page.waitForFunction(()=>!document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-layer').style.clipPath);
  await page.screenshot({path:path.join(output,'card-reveal-unrelated-window.png'),clip:{x:600,y:20,width:400,height:540}});
  await page.evaluate(()=>nativeCheck.revealPopup.removeSelf());
  await page.waitForFunction(()=>!document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-layer').style.clipPath);
  assert.equal(await page.evaluate(()=>{const p=nativeCheck.revealHit;return document.elementFromPoint(p.x,p.y)===document.querySelector('[data-sgs-cards-overlay]');}),true,'reveal input returns after closing dialog');
  await page.screenshot({ path: path.join(output, 'toolbox-hand-sort-native.png'), clip: { x: 0, y: 410, width: 1000, height: 380 } });
  await page.waitForTimeout(350);
  await page.mouse.dblclick(bounds.cx, bounds.cy);
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('lockedSort')), 'number');
  await page.evaluate(() => { nativeCheck.windowLayer.scale(1.6,1.6); nativeCheck.windowLayer.addChild(nativeCheck.modal); });
  await page.waitForFunction(() => nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown')?.text === '8');
  await page.evaluate(() => {nativeCheck.modal.countdownTimer.RemainValue=3.1;});
  await page.waitForFunction(() => nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown')?.text === '4');
  assert.equal(await page.evaluate(() => {
    const label=nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown');
    const start=label.localToGlobal(new Laya.Point(0,0),true),end=label.localToGlobal(new Laya.Point(0,20),true);
    return end.y-start.y;
  }),32,'popup countdown inherits the native window scale');
  await page.evaluate(()=>{nativeCheck.modal.countdownTimer.countTween=null;});
  await page.waitForFunction(()=>!nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown'));
  assert.equal(await page.evaluate(()=>nativeCheck.modal.countdownTimer.RemainValue),3.1,'stopped timer retains its cache without rendering it');
  await page.evaluate(()=>{nativeCheck.modal.countdownTimer.countTween={};});
  await page.waitForFunction(()=>nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown')?.text==='4');
  await page.mouse.click(bounds.cx, bounds.cy);
  assert.equal(await page.evaluate(() => nativeCheck.clicks), 1, 'native modal must receive the click over the toolbar');
  await page.screenshot({ path: path.join(output, 'toolbox-hand-sort-modal.png'), clip: { x: 0, y: 410, width: 1000, height: 380 } });
  await page.evaluate(() => nativeCheck.modal.removeSelf());
  await page.waitForFunction(() => !nativeCheck.modal.countdownTimer.getChildByName('sgs-toolbox-countdown'));
  await page.waitForTimeout(350);
  await page.mouse.dblclick(bounds.cx, bounds.cy);
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('lockedSort')), null, 'toolbar must work again when the modal closes');
  const beforeDrag = await page.evaluate(() => nativeCheck.handLayouts);
  await page.mouse.move(bounds.cx - 8, bounds.cy);
  await page.mouse.down();
  await page.mouse.move(bounds.cx + 8, bounds.cy);
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeDrag, 'a fast drag within one sort button must not sort cards');
  const moved = await measure();
  assert.ok(Math.abs(moved.x - bounds.x - 16) < .1, 'the bar follows a quick mouse movement');
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('lockedSort')), null, 'the drag cannot lock a sorting basis');
  await page.mouse.down();
  await page.mouse.move(moved.cx - 6, moved.cy);
  await page.mouse.up();
  await page.waitForFunction(expected => nativeCheck.handLayouts >= expected, beforeDrag + 1);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeDrag + 1, 'an immediate click with slight jitter sorts once');
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('lockedSort')), null, 'the first click after dragging cannot complete a double click');

  await page.mouse.move(moved.cx, moved.cy);
  await page.mouse.down();
  await page.mouse.move(moved.cx + 18, moved.cy);
  await page.waitForFunction(x => {
    const bar = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
    return Math.abs(bar.localToGlobal(new Laya.Point(0, 0), true).x - x) < .1;
  }, moved.x + 18);
  await page.mouse.move(moved.cx, moved.cy);
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeDrag + 1, 'returning to the press point still counts as a drag');
  await page.mouse.down();
  await page.waitForTimeout(330);
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeDrag + 1, 'holding and releasing without movement does not sort');

  const dragSort = async (targetX, targetY) => {
    const current = await measure();
    await page.mouse.move(current.x + 20, current.y + 12);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    return measure();
  };
  const screenshotDrag = async ({ cx, cy }, file) => {
    await page.mouse.move(cx, cy);
    await page.waitForFunction(() => {
      const toolbar = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
      const hint = toolbar._children.find(child => child instanceof Laya.Text && child.visible);
      if (!hint) return false;
      const start = hint.localToGlobal(new Laya.Point(0, 0), true);
      const end = hint.localToGlobal(new Laya.Point(hint.width, hint.height), true);
      return start.x >= 0 && start.y >= 400 && end.x <= 1100 && end.y <= 800;
    });
    await page.screenshot({ path: path.join(output, file) });
  };
  const beforeNudge = await page.evaluate(() => nativeCheck.settings.get('nativeSortOffset'));
  await dragSort(moved.x + 52, moved.y + 28);
  const offset = await page.evaluate(() => nativeCheck.settings.get('nativeSortOffset'));
  assert.ok(Math.abs(offset.x - beforeNudge.x - 20) < .1 && Math.abs(offset.y - beforeNudge.y - 10) < .1,
    `drag offset must be stored in native units: ${JSON.stringify(offset)}`);
  const bottomRight = await dragSort(1095, 795);
  assert.ok(bottomRight.x + bottomRight.width >= 1090 && bottomRight.x + bottomRight.width <= 1100,
    'the bar reaches the right edge of the canvas');
  assert.ok(bottomRight.y + bottomRight.height >= 790 && bottomRight.y + bottomRight.height <= 800,
    'the bar can move below the hand row and stay inside the canvas');
  await screenshotDrag(bottomRight, 'toolbox-hand-sort-drag-bottom.png');
  await page.setViewportSize({ width: 560, height: 600 });
  await page.waitForFunction(() => {
    const root = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
    const point = root.localToGlobal(new Laya.Point(root.width, root.height), true);
    return root.visible && point.x <= 560 && point.y <= 600;
  });
  const clipped = await measure();
  const nudged = await dragSort(clipped.x - 10, clipped.y - 18);
  assert.ok(Math.abs(nudged.x - clipped.x + 30) < .1 && Math.abs(nudged.y - clipped.y + 30) < .1,
    'drag starts from the visible position after the viewport clips the saved position');
  await page.setViewportSize({ width: 1100, height: 800 });
  const topLeft = await dragSort(5, 5);
  assert.ok(topLeft.x >= 0 && topLeft.x <= 10, 'the bar reaches the left edge of the canvas');
  assert.ok(topLeft.y >= 400 && topLeft.y <= 410, 'the whole bar stays below the canvas midpoint');
  await screenshotDrag(topLeft, 'toolbox-hand-sort-drag-midline.png');
  await dragSort(280, 458);
  assert.equal(await page.evaluate(() => nativeCheck.handPresses), 0, 'toolbar presses must not leak into hand-card gestures');
  await page.evaluate(() => {
    const { scene, self, hand, state } = nativeCheck;
    scene.SceneName = 'RogueLikeGameScene';
    Object.assign(self.seat, { IsSelf: true, PlayerInfo: { ClientId: 42 }, InActiveState: false,
      GetAllZhanfaIds: () => [2190] });
    state.currentSeatId = 1; // The journal still describes the previous player's turn.
    hand.areChoosingCard = true;
    hand.CardUI_Click = ShanheNative.clickCard;
    self.PlayCard_Result = () => {};
    const dealPrompt = '出牌阶段，请选择一张卡牌';
    const wrappedPlay = self.PlayCard_Result.bind(self);
    const selection = () => Object.assign(new ShanheNative.Selection(), {
      Purpose: 'deal', Message: dealPrompt, SelectResultCallback: wrappedPlay,
      CardSelector: { SelectCountMax: 1, SelectedCount: 0, FirstSelectedCard: null, SpecialSkillIDs: [] },
    });
    const selected = [], played = [];
    const ok = { name: 'btnOK', enabled: true, onClick() { played.push(hand.selectCardContext.CardSelector.FirstSelectedCard.FirstSkillId); } };
    const end = { name: 'btnDiscard', enabled: true };
    // The updated client stores the bar in Ai and exposes it through getButtonBar().
    self.Ai = { btns: [ok, end], getButton(name) { return this.btns.find(button => button.name === name); } };
    self.getButtonBar = function () { return this.Ai; };
    hand.selectCardContext = selection();
    const cards = skills => skills.map((skill, index) => {
      const card = { CardId: 100 + index, FirstSkillId: skill, FirstIndexSkillID: skill === 11111 ? 1 : skill, $(value) {
        if (!value) throw new Error('Unexpected deselection');
        selected.push(skill);
        Object.assign(hand.selectCardContext.CardSelector, { SelectedCount: 1, FirstSelectedCard: this });
        end.visible = false;
        if ([1, 8, 11111].includes(skill)) {
          const count = skill === 1 ? 1 : 0; // Native automatic target on the last 杀.
          self.SelectSeatContext = { Card: this, SelectComplete: Boolean(count), TargetSelector: { SelectedSeatCount: count } };
        } else {
          self.SelectSeatContext = { SelectComplete: true, TargetSelector: { SelectedSeatCount: 0 } };
        }
      } };
      return new ShanheNative.CardUI(card);
    });
    hand.cardUis = cards([11111, 10, 5, 9, 8, 9, 1]);
    nativeCheck.auto = { ok, selected, played, cards, dealPrompt, advance() {
      const card = hand.selectCardContext.CardSelector.FirstSelectedCard;
      hand.cardUis = hand.cardUis.filter(ui => ui.Card !== card);
      hand.selectCardContext = selection();
      self.SelectSeatContext = null;
      end.visible = true;
    }, selectTarget() { self.SelectSeatContext.SelectComplete = true; self.SelectSeatContext.TargetSelector.SelectedSeatCount = 1; } };
  });
  const waitAutoIcon = text => page.waitForFunction(expected => {
    const button = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('auto-play');
    return button?.toolTip === expected && button.accessibilityLabel === expected &&
      button.numChildren === 0 && button.graphics.cmds?.length >= 3;
  }, text, { timeout: 5000 });
  const autoOff = '自动打牌 · 点击开启 · 右键记住', autoOn = '自动打牌中 · 点击取消', autoRemembered = '已记住自动打牌 · 点击取消';
  const clickAuto = async (button = 'left') => {
    const center = await page.evaluate(() => {
      const auto = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('auto-play');
      const point = auto.localToGlobal(new Laya.Point(auto.width / 2, auto.height / 2), true);
      return { x: point.x, y: point.y };
    });
    await page.mouse.click(center.x, center.y, { button });
  };
  await waitAutoIcon(autoOff);
  assert.equal(await page.getByRole('heading', { name: '自动打牌判定', exact: true }).count(), 0);
  await clickAuto();
  await waitAutoIcon(autoOn);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.selected), [], 'wait outside own active play');
  await page.evaluate(() => {
    nativeCheck.self.seat.InActiveState = true;
    nativeCheck.hand.selectCardContext.Message = '请选择一张手牌响应技能';
  });
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.selected), [], 'a skill prompt does not count as ordinary play');
  await page.evaluate(() => { nativeCheck.hand.selectCardContext.Message = nativeCheck.auto.dealPrompt; });
  await page.waitForFunction(() => nativeCheck.auto.selected[0] === 8, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.played), [], 'duel waits for a selected target');
  await page.evaluate(() => nativeCheck.auto.selectTarget());
  const waitForPlay = count => page.waitForFunction(n => nativeCheck.auto.played.length === n, count);
  await waitForPlay(1);
  await page.waitForTimeout(320);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.played), [8], 'pending confirmation cannot repeat');
  for (const count of [2, 3, 4]) {
    await page.evaluate(() => nativeCheck.auto.advance());
    await waitForPlay(count);
  }
  await page.evaluate(() => nativeCheck.auto.advance());
  await page.waitForFunction(() => nativeCheck.auto.selected.at(-1) === 11111);
  await page.evaluate(() => { nativeCheck.self.SelectSeatContext.SelectComplete = true; });
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.played), [8, 9, 9, 10], 'a legal but unselected slash target does not submit');
  await page.evaluate(() => nativeCheck.auto.selectTarget());
  await waitForPlay(5);
  await page.evaluate(() => nativeCheck.auto.advance());
  await waitForPlay(6);
  await page.evaluate(() => nativeCheck.auto.advance());
  await page.waitForTimeout(300); // Give the native poll time to reject the remaining card.
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.played), [8, 9, 9, 10, 11111, 1]);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.selected), [8, 9, 9, 10, 11111, 1]);
  await clickAuto('right');
  await waitAutoIcon(autoRemembered);
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('shanheAutoPlay:42')), true);
  const shanheBar = await measure();
  assert.ok(Math.abs(shanheBar.width - 170 * 1.6) < 0.1);
  assert.equal(await page.evaluate(() => {
    const toolbar = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
    const hint = toolbar._children.find(child => child instanceof Laya.Text && child.visible);
    return Boolean(hint && hint.textWidth <= hint.width);
  }), true, 'the icon tooltip fits on one line');
  await page.screenshot({ path: path.join(output, 'toolbox-hand-sort-shanhe.png'), clip: {
    x: Math.floor(shanheBar.x) - 10, y: Math.floor(shanheBar.y) - 55, width: 320, height: 110
  } });
  await page.setViewportSize({ width: 560, height: 600 });
  await page.evaluate(tokens => {
    nativeCheck.themes.current.tokens = tokens;
    nativeCheck.themeListeners.forEach(fn => fn());
    Laya.stage.bgColor = '#e5dece';
  }, THEMES.find(theme => theme.id === 'themes.ricepaper').tokens);
  await page.waitForFunction(() => {
    const root = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
    const end = root.localToGlobal(new Laya.Point(root.width, root.height), true);
    return root.visible && end.x <= 556 && end.y <= 600;
  });
  const narrowBar = await measure();
  await page.screenshot({ path: path.join(output, 'toolbox-hand-sort-shanhe-light.png'), clip: {
    x: Math.floor(narrowBar.x) - 4, y: Math.floor(narrowBar.y) - 50, width: 303, height: 105
  } });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.evaluate(() => { nativeCheck.scene.SceneName = 'GameScene'; });
  await page.waitForFunction(() => !nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('auto-play'));
  await page.evaluate(() => { nativeCheck.scene.SceneName = 'RogueLikeGameScene'; nativeCheck.self.seat.PlayerInfo.ClientId = 43; });
  await waitAutoIcon(autoOff);
  await page.evaluate(() => { nativeCheck.self.seat.PlayerInfo.ClientId = 42; });
  await waitAutoIcon(autoRemembered);
  await clickAuto();
  await waitAutoIcon(autoOff);
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('shanheAutoPlay:42')), false);
  await page.evaluate(() => {
    const { self, hand, auto } = nativeCheck;
    self.Pt = self.Ai;
    delete self.Ai;
    delete self.getButtonBar;
    self.seat.GetAllZhanfaIds = () => [];
    hand.cardUis = auto.cards([8, 10, 1, 5]);
    auto.ok.enabled = false;
  });
  await page.keyboard.press('Enter');
  await waitAutoIcon(autoOn);
  await page.waitForFunction(() => nativeCheck.auto.selected.length === 7);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => nativeCheck.auto.selected.slice(6)), [1], 'without the tactic only slash is selected');
  assert.equal(await page.evaluate(() => nativeCheck.auto.played.length), 6, 'disabled confirmation is left alone');
  await page.evaluate(() => { nativeCheck.auto.ok.enabled = true; });
  await waitForPlay(7);
  await page.evaluate(() => { nativeCheck.scene.IsReplay = true; });
  await page.waitForFunction(() => !nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').getChildByName('auto-play'));
  await page.evaluate(() => { nativeCheck.scene.IsReplay = false; });
  await waitAutoIcon(autoOff);
  await clickAuto();
  await waitAutoIcon(autoOn);
  await page.evaluate(() => { nativeCheck.state.deckStartSeq++; });
  await waitAutoIcon(autoOff);

  // Run touch checks after mouse checks because Laya filters the first mouse press after touch input.
  const beforeTouch = await page.evaluate(() => nativeCheck.handLayouts);
  const touchStart = await measure();
  const touchSession = await page.context().newCDPSession(page);
  const touch = (type, points = []) => touchSession.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x: touchStart.cx, y: touchStart.cy, id: 1 }]);
  await touch('touchMove', [{ x: touchStart.cx + 16, y: touchStart.cy, id: 1 }]);
  await touch('touchEnd');
  await page.waitForTimeout(80);
  const touchMoved = await measure();
  assert.ok(Math.abs(touchMoved.x - touchStart.x - 16) < .1, 'touch moves the bar without a long press');
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeTouch, 'touch dragging does not sort cards');
  await touch('touchStart', [{ x: touchMoved.cx, y: touchMoved.cy, id: 2 }]);
  await touch('touchEnd');
  await page.waitForFunction(expected => nativeCheck.handLayouts >= expected, beforeTouch + 1);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeTouch + 1, 'a touch tap still sorts once');
  await touch('touchStart', [{ x: touchMoved.cx, y: touchMoved.cy, id: 3 }]);
  await touch('touchCancel');
  await touchSession.detach();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => nativeCheck.handLayouts), beforeTouch + 1, 'cancelling touch input does not sort');
  assert.equal(await page.evaluate(() => nativeCheck.settings.get('lockedSort')), null);
  assert.equal(await page.evaluate(() => nativeCheck.handPresses), 0, 'touch gestures stay within the native toolbar');

  await page.evaluate(() => { nativeCheck.enhancement.dispose(); nativeCheck.scope.dispose(); });
  assert.deepEqual(await counts(), []);
  assert.equal(await page.evaluate(() => nativeCheck.themeListeners.size), 0);
  assert.deepEqual(await page.evaluate(() => ({ toolbar: !!nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort'), alpha: nativeCheck.self.sortCardBtn.alpha, enabled: nativeCheck.self.sortCardBtn.mouseEnabled })), { toolbar: false, alpha: 1, enabled: true });
  assert.deepEqual(errors, []);
  const result = { scope: '官方缓存Laya引擎2.12.2 + 独立牌局节点演练，非真实账号牌局', packageVersion: CARDS_VERSION, checks: ['理牌栏默认位置及 12 原生字号随 1／1.6 缩放', '排序及选中状态保留', '双击锁定/解锁', '真实引擎窗口层遮挡及点击归属', '选牌弹窗原生数字读秒8→4，停止/移除后清理', '旁观未挂载及停止计时器不生成数字', '双将scrollRect.x=36，明牌在1/1.6缩放下对齐可见头像左下', '弹窗关闭后恢复', '整排直接拖动，边界为画布下半部和可见视口，缩小视口后可从显示位置接着拖，不触发手牌手势', '山河图自动打牌图标的三档状态、单行提示、出牌顺序及右键按账号记住', '通过新客户端 getButtonBar 出南蛮入侵，兼容旧操作栏，技能询问不触发自动出牌', '卸载移除并恢复原生按钮'], pageErrors: errors };
  result.checks.push('明牌每行 4／5／6／7／8 张，默认 7 张，卡片随档位缩放并保留滚轮和触控滚动');
  result.checks.push('驭势跨玩家回合累计，同轮通知不补次数，新一轮恢复，重连缺记录时显示问号');
  result.checks.push('理牌栏拖到中线或右下角后，悬停提示仍完整显示在画布下半部');
  result.checks.push('鼠标及触屏直接拖动无需长按，短拖和拖回按下点不会触发排序或锁定，松手后仍可立即点按');
  result.checks.push('长按后原地松手、触屏取消均不触发排序');
  await writeFile(path.join(output, 'browser-card-native-report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
