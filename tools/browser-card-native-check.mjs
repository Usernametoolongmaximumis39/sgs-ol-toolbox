import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { CARDS_VERSION } from '../src/core/version.js';

// Use the cached official engine, without loading the game or logging in.
const engine = process.env.SGS_LAYA_CORE || path.join(process.env.TEMP, 'sgsres/game/laya.core.min.js');
await readFile(engine);
const packet = JSON.parse(await readFile(`release/market/packages/cards/${CARDS_VERSION}.json`, 'utf8'));
const bundle = await build({ stdin: { contents: "export { mountPluginUI } from './src/ui/plugin-ui.js'; export { ResourceScope } from './src/core/resources.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'NativeCardCheck' });
const output = path.resolve('test-results'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<html><body style="margin:0;background:#172a24"><main></main></body></html>');
  await page.addScriptTag({ path: engine });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: `window.NativeCardPlugin = new Function(${JSON.stringify(packet.code)})();` });
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
    hand.invalidateLayoutHandCard = () => {};
    hand.SortNormalCards = () => hand.cardUis.reverse();
    self.cardContainer = hand; self.sortCardBtn = { enabled: true, alpha: 1, mouseEnabled: true };
    const staleTimer=new Laya.Sprite();staleTimer.size(91,11);staleTimer.RemainValue=11;staleTimer.countTween={};
    self.countdownTimer=staleTimer; // Allocated, positive, but never added to stage.
    self.seat = { index: 0 }; self.seatID = 0;
    self.seat.Index = 0; self.seat.InDealRound = true;
    self.skillItems = ['正常', '用尽', '无限', '未知'].map((name, index) => {
      const item = new Laya.Sprite(); item.pos(460 + index * 70, -10); item.size(64, 28);
      item.graphics.drawRect(0, 0, 64, 28, '#302d25', '#82714d', 1);
      const text = new Laya.Text(); text.text = name; text.fontSize = 14; text.color = '#eee3cc'; text.pos(7, 7); item.addChild(text);
      item.Skill = { SkillId: 100 + index, Seat: self.seat, SpecialModeDesc: '出牌阶段限三次，你可以摸牌。',
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
    let clicks = 0;
    const dispose = NativeCardPlugin.activate({ document, window, scope, themes,
      game: { getScene: () => ({ SelfSeatUi: self }), getSelfSeatUI: () => self, getSeatUIs: () => [self,observed], getClass: name => name === 'CheckSeatCardWindow' ? CheckSeatCardWindow : null,
        getCardMeta:id=>({name:'杀',suit:id===4?3:4,number:id===4?10:2}) },
      getState: () => state, settings: { get: (key, fallback) => settings.has(key) ? settings.get(key) : fallback, set: (key, value) => settings.set(key, value) },
      subscribe: () => () => {}, ui: { ...NativeCardCheck.mountPluginUI({document,window,scope}, () => ({document,window,scope})), registerPanel: () => () => {} },
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
    window.nativeCheck = { themes, themeListeners, state, gameLayer, windowLayer, hand, self, avatar, staleTimer, settings, scope, enhancement, modal, get clicks() { return clicks; }, get handPresses() { return handPresses; } };
  });
  await page.waitForFunction(() => !!nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort'));
  const counts = () => page.evaluate(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').map(n => n.text));
  assert.deepEqual(await counts(), ['2', '0', '∞', '?']);
  await page.screenshot({ path: path.join(output, 'card-skill-counts.png') });
  await page.evaluate(() => {
    nativeCheck.themes.current.tokens = { bg: '#f6f2e9', accent: '#77581d', muted: '#746752', scheme: 'light' };
    nativeCheck.themeListeners.forEach(fn => fn());
    Laya.stage.bgColor = '#f6f2e9';
    nativeCheck.self.skillItems.forEach(item => { item.graphics.clear(); item.graphics.drawRect(0,0,64,28,'#fffaf1','#c4b492',1); item.getChildAt(0).color='#302b23'; });
  });
  assert.deepEqual(await page.evaluate(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').map(n => n.color)), ['#77581d','#746752','#77581d','#77581d']);
  await page.screenshot({ path: path.join(output, 'card-skill-counts-light.png') });
  await page.evaluate(() => { nativeCheck.themes.current.tokens = {}; nativeCheck.themeListeners.forEach(fn => fn()); Laya.stage.bgColor = '#172a24'; });
  await page.evaluate(() => nativeCheck.settings.set('skillCounts', false));
  await page.waitForFunction(() => !nativeCheck.self._children.some(n => n.name === 'sgs-toolbox-skill-count'));
  await page.evaluate(() => nativeCheck.settings.set('skillCounts', true));
  await page.waitForFunction(() => nativeCheck.self._children.filter(n => n.name === 'sgs-toolbox-skill-count').length === 4);
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
      return Math.abs(actual.x-Math.max(0,expected.x-20))<.1&&Math.abs(actual.y-expected.y)<.1;
    });
    assert.equal(await page.evaluate(()=>!!nativeCheck.staleTimer.getChildByName('sgs-toolbox-countdown')),false);
    assert.equal(await page.locator('[data-sgs-cards-overlay]').locator('.sgs-card-countdown').count(),0);
    assert.equal(await page.evaluate(() => nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort').numChildren), 3);
    assert.equal(bounds.fontSize, 12); assert.ok(Math.abs(bounds.height - 24 * scale) < .1);
    assert.ok(Math.abs(bounds.width - 108 * scale) < .1);
    await page.waitForTimeout(350);
    await page.mouse.click(bounds.cx, bounds.cy);
    assert.deepEqual(await page.evaluate(() => nativeCheck.hand.cardUis.map(ui => ui.Card.CardNumber)), [3, 7, 9]);
    assert.equal(await page.evaluate(() => nativeCheck.hand.cardUis.find(ui => ui.Card.CardNumber === 3).selected), true);
  }
  await page.evaluate(() => { for(let id=4;id<37;id++) nativeCheck.state.cards[id]={id,locations:id%2?['5:1','5:2']:['5:1'],tags:[],lastSeq:1,seen:true}; });
  await page.waitForFunction(()=>document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelectorAll('.sgs-card-seat-reveal .sgs-card-mini').length===33);
  assert.deepEqual(await page.evaluate(()=>{
    const box=document.querySelector('[data-sgs-cards-overlay]').shadowRoot.querySelector('.sgs-card-seat-reveal');
    const cards=[...box.children].map(c=>c.getBoundingClientRect());
    return {columns:cards.filter(c=>c.y===cards[0].y).length,wrapped:cards[8].y>cards[0].y,scroll:box.scrollHeight>box.clientHeight};
  }),{columns:8,wrapped:true,scroll:true});
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
  await page.mouse.move(bounds.x + 16, bounds.y + 24); await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(bounds.x + 48, bounds.y + 40, { steps: 4 }); await page.mouse.up();
  const offset = await page.evaluate(() => nativeCheck.settings.get('nativeSortOffset'));
  assert.ok(Math.abs(offset.x - 20) < .1 && Math.abs(offset.y - 10) < .1, `drag offset must be stored in native units: ${JSON.stringify(offset)}`);
  for (const [targetX, targetY] of [[1095, 795], [5, 5]]) {
    const current = await measure();
    await page.mouse.move(current.x + 20, current.y + 12); await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(targetX, targetY, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(80);
    const limited = await page.evaluate(() => {
      const root = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
      return { x: root.x, y: root.y, width: root.width, height: root.height };
    });
    assert.ok(limited.x >= 163 && limited.x + limited.width <= 700);
    assert.ok(limited.y >= -40 && limited.y + limited.height <= 24, 'drag must remain in the narrow band above hand cards');
    const drawn = await measure();
    assert.ok(drawn.x >= 0 && drawn.y >= 0 && drawn.x + drawn.width <= 1100 && drawn.y + drawn.height <= 800);
  }
  await page.setViewportSize({ width: 560, height: 600 });
  await page.waitForFunction(() => {
    const root = nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort');
    const point = root.localToGlobal(new Laya.Point(root.width, root.height), true);
    return root.visible && point.x <= 560 && point.y <= 600;
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  assert.equal(await page.evaluate(() => nativeCheck.handPresses), 0, 'toolbar presses must not leak into hand-card gestures');
  await page.evaluate(() => { nativeCheck.enhancement.dispose(); nativeCheck.scope.dispose(); });
  assert.deepEqual(await counts(), []);
  assert.equal(await page.evaluate(() => nativeCheck.themeListeners.size), 0);
  assert.deepEqual(await page.evaluate(() => ({ toolbar: !!nativeCheck.hand.getChildByName('sgs-toolbox-hand-sort'), alpha: nativeCheck.self.sortCardBtn.alpha, enabled: nativeCheck.self.sortCardBtn.mouseEnabled })), { toolbar: false, alpha: 1, enabled: true });
  assert.deepEqual(errors, []);
  const result = { scope: '官方缓存Laya引擎2.12.2 + 独立牌局节点演练，非真实账号牌局', packageVersion: CARDS_VERSION, checks: ['无拖动柄；12原生字号、108×24尺寸随1/1.6缩放', '排序及选中状态保留', '双击锁定/解锁', '真实引擎窗口层遮挡及点击归属', '选牌弹窗原生数字读秒8→4，停止/移除后清理', '旁观未挂载及停止计时器不生成数字', '双将scrollRect.x=36，明牌在1/1.6缩放下对齐可见头像左下', '弹窗关闭后恢复', '整排长按拖动；手牌上方限位及画布/视口限制；不触发手牌手势', '卸载移除并恢复原生按钮'], pageErrors: errors };
  await writeFile(path.join(output, 'browser-card-native-report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
