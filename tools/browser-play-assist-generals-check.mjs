import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const output = resolve('test-results/play-assist-generals');
await mkdir(output, { recursive: true });
const client = await readFile(process.env.SGS_CLIENT_SOURCE || resolve('test-results/reference/client-static/sgsGame_a.js'), 'utf8');
function nativeHpLayout(size) {
  const init = client.indexOf(`this.hpBgRes="blood_bg_${size}"`);
  const start = client.indexOf('layout(){', init);
  const last = 'this.layoutBloodText()}';
  const end = client.indexOf(last, start);
  assert.ok(init >= 0 && start > init && end > start && end - start < 1000, `native ${size} health-bar layout`);
  return client.slice(start, end + last.length);
}
function contrast(ink, surface) {
  const luminance = hex => hex.slice(1).match(/../g).map(channel => {
    const level = parseInt(channel, 16) / 255;
    return level <= .04045 ? level / 12.92 : ((level + .055) / 1.055) ** 2.4;
  }).reduce((sum, level, i) => sum + level * [.2126, .7152, .0722][i], 0);
  return (luminance(ink) + .05) / (luminance(surface) + .05);
}
const bundle = await build({
  stdin: { contents: `export {createRuntime} from './src/plugins/play-assist/runtime.js';
    export {ResourceScope} from './src/core/resources.js';
    export {DEFAULT_NATIVE_PALETTE} from './src/ui/native-theme.js';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'AssistGenerals',
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: process.env.SGS_LAYA_CORE || resolve('../小抄屏蔽服务器/公告语料整理/临时/laya.core.min.js') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: `window.hpLayouts = [{${nativeHpLayout('s')}},{${nativeHpLayout('b')}}];` });
  await page.evaluate(() => {
    Laya.init(960,640);
    Laya.stage.bgColor = '#172322';
    const { ResourceScope, DEFAULT_NATIVE_PALETTE: palette, createRuntime } = AssistGenerals;
    const scope = new ResourceScope(), saved = new Map();
    const themeListeners = new Set();
    const nativeTheme = {
      palette,
      watch(fn) { themeListeners.add(fn); fn(this.palette); return () => themeListeners.delete(fn); },
    };
    window.setThemeBackground = bg => {
      nativeTheme.palette = { ...palette, bg };
      for (const fn of themeListeners) fn(nativeTheme.palette);
    };
    window.options = { tianshuAssist: true, quanyuAssist: true, zhuohunAssist: true };
    window.proxy = new Laya.EventDispatcher();
    const ged = new Laya.EventDispatcher();
    function sprite(parent, name, x, y, w, h) {
      const node = new Laya.Sprite();
      node.name = name; node.pos(x,y); node.size(w,h); parent.addChild(node);
      return node;
    }
    function label(parent, text, x, y, color = '#ece7d8') {
      const node = new Laya.Text();
      node.text = text; node.fontSize = 14; node.color = color; node.pos(x,y); parent.addChild(node);
      return node;
    }
    function showHp(ui) {
      const bar = ui.hpbarManager, bg = bar.gradeHpBg;
      const {Hp: hp, MaxHp: max, IsSelf: mine} = ui.seat;
      const compact = max > 5, count = compact ? 1 : max;
      bar.MaxValue = max;
      bar.height = compact ? (mine ? 100 : 70) : count * bar.bloodHei + (count - 1) * bar.gap + 2 * bar.top;
      bg.size(mine ? 24 : 18, bar.height);
      bg.pos(146 - bg.width, 172 - bg.height);
      bg.graphics.clear();
      bg.graphics.drawRect(0,0,bg.width,bg.height,'#24231c','#807457',1);
      for (const pip of bar.bloodArr) pip.destroy();
      const hpColor = hp <= Math.floor(max / 3) ? '#dc5656' : hp <= Math.floor(2 * max / 3) ? '#e0a43a' : '#69b761';
      bar.bloodArr = Array.from({ length: count }, (_, i) => {
        const pip = sprite(bg, `hp-${i + 1}`, 0, 0, bg.width - 2 * bar.bloodX, bar.bloodHei);
        pip.graphics.drawCircle(pip.width / 2, pip.height / 2, Math.min(pip.width, pip.height) * .34, i < hp ? hpColor : '#68645b');
        pip.posInteger = pip.pos.bind(pip);
        Object.defineProperties(pip, {
          renderY: { get: () => bg.y + pip.y * bg.scaleY },
          renderScaleY: { get: () => bg.scaleY },
        });
        return pip;
      });
      bar.bloodText.text = `${hp}\n/\n${max}`;
      bar.bloodText.visible = compact;
      hpLayouts[Number(mine)].layout.call(bar);
    }
    function seat(index, x, name, mine) {
      const ui = sprite(Laya.stage, name, x, 118, 146, 172);
      const avatar = ui.seatAvatar = sprite(ui, 'avatar', 0,0,146,172);
      avatar.graphics.drawRect(0,0,146,172,'#223431','#516760',1);
      label(avatar,name,12,12);
      ui.stateContainer = sprite(ui,'state',0,0,146,172);
      ui.stateContainer.mouseThrough = true;
      ui.seat = {Index:index, IsSelf:mine, Hp:3, MaxHp:3, HasSkill:id=>mine && id===3870};
      const render = sprite(ui, 'hp-render', 0,0,146,172), bg = sprite(render,'hp-bg',0,0,1,1);
      Object.defineProperties(bg, {
        renderX: { get: () => bg.x }, renderY: { get: () => bg.y },
        renderScaleX: { get: () => bg.scaleX }, renderScaleY: { get: () => bg.scaleY },
      });
      ui.hpbarManager = {
        render, gradeHpBg: bg, bloodArr: [], bloodText: label(bg,'',5,mine ? 32 : 21),
        visible: true, top: 6, bloodHei: mine ? 26 : 14, gap: mine ? 5 : 3, bloodX: mine ? 1 : 3,
        layoutBloodText() {},
      };
      showHp(ui);
      return ui;
    }
    window.selfUI = seat(0, 703, '魔张飞', true);
    selfUI.y = 395;
    window.targetUI = seat(1, 358, '曹操', false);
    selfUI.cardContainer = {cardUis:[]}; selfUI.skillItems = [];
    window.quan = { ID:3793, Value:0, mask:0 };
    targetUI.seat.GetSeatState = () => quan;
    targetUI.seat.GetSkillBuffInfo = () => [quan.mask];
    const old = window.official = sprite(targetUI.stateContainer,'official-quanyu',-32,25,30,30);
    old.SeatState = quan; old.mouseEnabled = true;
    old.graphics.drawCircle(15,15,14,'#1c5970','#9ecfdb',1); label(old,'辟邪',1,6);
    const adjacent = window.adjacentMark = sprite(targetUI.stateContainer,'next-state',-32,25,30,30);
    adjacent.graphics.drawCircle(15,15,14,'#384252','#a1a8bf',1); label(adjacent,'印',8,6);
    adjacent.y = -5;
    adjacent.SeatState = {ID:100};
    targetUI.layoutStateIcons = function () {
      const x = this.sideRight ? this.stateContainer.width : -32;
      old.pos(x, 25);
      adjacent.pos(x, -5);
    };
    const ownState = { ID:3793, Value:4 };
    const own = window.ownOfficial = sprite(selfUI.stateContainer,'own-quanyu',-95,-2,30,30);
    own.SeatState = ownState;
    own.graphics.drawCircle(15,15,14,'#1c5970','#9ecfdb',1); label(own,'紫电',1,6);
    selfUI.seat.GetSkillBuffInfo = () => [1 << 4 | 1 << 5 | 1 << 6];
    selfUI.seat.GetSeatState = () => ownState;
    window.clicks = 0;
    function historyButton(ui, x, y) {
      const button = sprite(ui.stateContainer,'official-history',x,y,47,23);
      button.SeatState = {ID:37937, ClickCallback:()=>window.clicks++};
      button.mouseEnabled = true;
      button.graphics.drawRect(0,0,47,23,'#3f2a1f','#b89963',1); label(button,'权御',9,4);
      return button;
    }
    window.officialButton = historyButton(targetUI,20,25);
    window.ownButton = historyButton(selfUI,10,143);
    window.scene = { SelfSeatUi:selfUI, seatContainer:{seatUIs:[selfUI, targetUI]}, ged };
    const tooltip = sprite(Laya.stage,'native-tip-fixture',0,0,144,26); tooltip.zOrder = 1000;
    tooltip.graphics.drawRect(0,0,144,26,'#252a29','#8c958f',1);
    const tooltipText = label(tooltip,'',8,5);
    tooltip.visible = false;
    ged.on('TIPS_OVER_EVENT', {}, event => {
      tooltipText.text = event.target.ToolTip; tooltip.pos(event.stageX - 30, event.stageY + 18); tooltip.visible = true;
    });
    ged.on('TIPS_OUT_EVENT', {}, () => { tooltip.visible = false; });
    window.tip = tooltip;
    window.tipText = tooltipText;
    const layer = sprite(Laya.stage,'WindowLayer',0,0,960,640);
    layer.mouseThrough = true;
    const win = window.tian = sprite(layer,'TianShuWindow',76,30,807,570);
    win.visible = false; win.seat = selfUI.seat;
    win.graphics.drawRect(0,0,807,548,'#202825','#6d705b',1);
    win.selectItems = Array.from({length:3}, (_, index) => {
      const item = sprite(win, 'item' + index, 0,305,177,125);
      item.pivot(88.5,62.5); item.mouseEnabled = true;
      item.graphics.drawRect(0,0,177,125,'#334542','#7a8f86',1);
      item.selectBg = sprite(item, 'selected',0,0,177,125);
      item.selectBg.graphics.drawRect(0,0,177,125,null,'#e8c981',3);
      item.useCntTxt = label(item,'',60,-19);
      item.description = label(item,'',19,52);
      Object.defineProperties(item, {
        UseCnt: {set(value) { this.useCntTxt.text = value; }},
        SelectBgVisible: {set(value) { this.selectBg.visible = value; }},
      });
      item.on('click', item, () => { window.selectedTianshu = win.selectIds[index]; });
      return item;
    });
    win.layout = function () { this.selectItems.forEach((item, index) => { item.x = 213 + index * 194; }); };
    window.tianNativeLayout = win.layout;
    win.updateWinUI = function ({ type, ids, descriptions }) {
      this.type = type; this.selectIds = ids;
      this.selectItems.forEach((item, index) => {
        item.description.text = descriptions[index]; item.UseCnt = ''; item.SelectBgVisible = false;
      });
      this.layout();
    };
    const windows = new Map([[win.name, win]]);
    ged.on('OPEN_WINDOW', {gamePopUpWindowDict: windows}, () => {});
    window.runtime = createRuntime({
      window, scope, settings:{get:(key, fallback)=>saved.get(key) ?? fallback,set:(key,value)=>saved.set(key,value)},
      game:{ getScene:()=>scene, getSnapshot:()=>({inGame:true}), getClass:()=>null, getServerProxy:()=>proxy },
      ui:{nativeTheme}, reportError:error=>{window.failure = String(error.stack);},
    }, () => options);
    window.row = () => targetUI.stateContainer.getChildByName('sgs-play-assist-quanyu');
    window.effectOrder = () => row()?._children.filter(icon=>icon.visible).sort((a,b)=>a.y-b.y || a.x-b.x).map(icon=>Number(icon.name.at(-1)));
    window.sideSnapshot = () => [official, adjacentMark, ownOfficial].map(node =>
      [node.x,node.y,node.width,node.height,node.alpha,node.mouseEnabled,node.visible]);
    window.hpMarks = (ui = targetUI) => ui.hpbarManager.render.getChildByName('sgs-play-assist-zhuohun');
    window.hpText = ui => hpMarks(ui)?._children.filter(label => label.visible).map(label => label.text);
    window.hpScreenGeometry = () => {
      const stage = Laya.stage;
      const screen = (label, x, y) => {
        const point = label.localToGlobal(new Laya.Point(x, y));
        point.x *= stage.clientScaleX; point.y *= stage.clientScaleY;
        return stage._canvasTransform.transformPoint(point);
      };
      return hpMarks()._children.filter(label => label.visible).map(label => {
        const top = screen(label, 0, 0), bottom = screen(label, label.width, label.height);
        const font = screen(label, 0, label.fontSize);
        return { text: label.text, textWidth: label.textWidth, fontPx: font.y - top.y, top: top.y, bottom: bottom.y,
          width: bottom.x - top.x, ink: label.color, background: label.bgColor };
      });
    };
    window.setHp = (hp, isSync = false) => {
      targetUI.seat.Hp = hp;
      showHp(targetUI);
      proxy.event('GsCUpdateHpNtf',{Protocol:{SeatID:1,HP:hp,isMaxHp:false,isSync}});
    };
    window.setMaxHp = max => {
      targetUI.seat.MaxHp = max;
      showHp(targetUI);
      proxy.event('GsCUpdateHpNtf',{Protocol:{SeatID:1,HP:max,isMaxHp:true}});
    };
    window.disposeAll = () => { runtime.dispose(); scope.dispose(); };
  });

  const sideBefore = await page.evaluate(()=>sideSnapshot());
  await page.evaluate(() => {
    options.quanyuAssist = false;
    proxy.event('MsgGameTurnNtf',{Protocol:{SeatID:0,TurnCnt:1}});
    proxy.event('GsCGamephaseNtf',{Protocol:{SeatID:0,Round:0}});
    for (const current of [2,5,1,4,6,3]) {
      quan.Value = current; quan.mask |= 1 << current;
      proxy.event('GsCUpdateRoleDataExNtf',{Protocol:{SeatID:1,IsSpell:false,DataID:8,Datas:[3793,0,current,quan.mask]}});
    }
    setHp(1);
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>[hpText(),hpText(selfUI)]), [['2','1✓'],['2','1']], 'both bars show the threshold values and jumping to red records red only');
  assert.ok(await page.evaluate(() => [targetUI, selfUI].every(ui => {
    const root = hpMarks(ui), bar = ui.hpbarManager;
    return !ui.seatAvatar.getChildByName(root.name) && !root.mouseEnabled && root._children.every((mark, i) => {
      const tag = mark.localToGlobal(new Laya.Point(mark.width, mark.height / 2));
      const pip = bar.bloodArr[1 - i].localToGlobal(new Laya.Point(0, bar.bloodHei / 2));
      return tag.x < pip.x && pip.x - tag.x < 6 && Math.abs(tag.y - pip.y) < .01;
    });
  })), 'both seats follow the native pip centers without intercepting input');
  const targetClip = { x: 346, y: 106, width: 175, height: 196 };
  await page.screenshot({ path: resolve(output,'zhuohun-hp-pips.png'), clip: targetClip });
  await page.evaluate(() => { setHp(2); runtime.tick(); });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['2✓','1✓']);
  await page.screenshot({ path: resolve(output,'quanyu-stock-card-button.png') });
  await page.evaluate(() => { options.quanyuAssist = true; runtime.tick(); });
  assert.deepEqual(await page.evaluate(()=>effectOrder()), [3,6,4,1,5,2]);
  assert.deepEqual(await page.evaluate(()=>hpText()), ['2✓','1✓']);
  assert.deepEqual(await page.evaluate(()=>sideSnapshot()),sideBefore,'side marks keep their exact geometry and interaction');
  assert.deepEqual(await page.evaluate(()=>[official.alpha,officialButton.alpha,ownButton.alpha]), [1,0,0]);
  assert.deepEqual(await page.evaluate(() => {
    const active = row().getChildByName('sgs-quanyu-3');
    const own = selfUI.stateContainer.getChildByName('sgs-play-assist-quanyu');
    const current = own.getChildByName('sgs-quanyu-4'), before = own.getChildByName('sgs-quanyu-6');
    return [row().x + active.x, row().y + active.y, official.height, adjacentMark.y,
      own.x + current.x, own.y + current.y, own.x + before.x, own.y + before.y];
  }), [20,25,30,-5,10,143,10,119], 'the first effect starts at the exact stock button coordinates');
  await page.screenshot({ path: resolve(output,'quanyu-replaced-card-button.png') });
  const point = await page.evaluate(() => row().getChildByName('sgs-quanyu-5').localToGlobal(new Laya.Point(12,12)));
  await page.mouse.move(point.x,point.y);
  await page.waitForFunction(()=>tip.visible && tipText.text.includes('额外结算'));
  await page.screenshot({ path: resolve(output,'quanyu-zhuohun.png') });
  await page.mouse.move(640, 170, {steps: 8});
  await page.waitForFunction(()=>!tip.visible, null, {timeout: 3000});
  await page.mouse.click(point.x,point.y);
  assert.equal(await page.evaluate(()=>clicks),1,'native history entry remains clickable');
  await page.mouse.move(640, 170, {steps: 8});
  await page.evaluate(() => {
    targetUI.sideRight = true;
    targetUI.layoutStateIcons(); runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>effectOrder()), [3,6,4,1,5,2]);
  assert.deepEqual(await page.evaluate(()=>[row().x,row().y,adjacentMark.x,adjacentMark.y]), [20,25,146,-5]);
  await page.evaluate(() => {
    const blocker = window.blocker = new Laya.Sprite();
    blocker.SeatState = {ID:999};
    blocker.pos(20,49); blocker.size(47,23);
    targetUI.stateContainer.addChild(blocker);
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>effectOrder()),[3,6,4,1,5,2]);
  assert.deepEqual(await page.evaluate(()=>[blocker.y,blocker.alpha,row().getChildByName('sgs-quanyu-4').y]),[49,1,48],
    'history skips a neighboring native on-card marker');
  await page.evaluate(() => {
    officialButton.visible = false;
    runtime.tick();
  });
  assert.equal(await page.evaluate(()=>row()),null,'the side mark alone cannot mount a replacement');
  assert.deepEqual(await page.evaluate(()=>[official.height,official.alpha,officialButton.alpha]),[30,1,1]);
  await page.evaluate(() => {
    officialButton.visible = true;
    blocker.destroy();
    targetUI.layoutStateIcons(); runtime.tick();
  });
  await page.evaluate(() => {
    proxy.event('MsgGameTurnNtf',{Protocol:{SeatID:1,TurnCnt:2}});
    proxy.event('GsCGamephaseNtf',{Protocol:{SeatID:1,Round:0}});
    setHp(3);
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>[hpText(),hpText(selfUI)]), [undefined,undefined], 'another player’s turn has no marks');
  await page.evaluate(() => {
    setMaxHp(6); setHp(6);
    proxy.event('MsgGameTurnNtf',{Protocol:{SeatID:0,TurnCnt:3}});
    proxy.event('GsCGamephaseNtf',{Protocol:{SeatID:0,Round:0}});
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['4','2'], 'new turn clears history and the compressed bar shows the same labels');
  await page.evaluate(() => {
    setHp(4, true);
    const bar = targetUI.hpbarManager;
    bar.gradeHpBg.pos(137,47).scale(.72,.72);
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['4','2'], 'an HP sync does not count as a color change');
  assert.deepEqual(await page.evaluate(()=>[hpMarks().x,hpMarks().y]), [137,47]);
  await page.screenshot({ path: resolve(output,'zhuohun-hp-numeric.png'), clip: targetClip });
  await page.setViewportSize({ width: 768, height: 512 });
  await page.evaluate(() => {
    Laya.stage.scaleMode = Laya.Stage.SCALE_SHOWALL;
    Laya.stage.setScreenSize(768, 512);
    setThemeBackground('#faf6ee');
    runtime.tick();
  });
  const compactTags = await page.evaluate(() => hpScreenGeometry());
  assert.ok(compactTags.every(tag => tag.fontPx >= 13.99 && tag.width >= tag.textWidth + 4));
  assert.ok(compactTags.every(tag => contrast(tag.ink, tag.background) >= 7), 'ink remains bright on the opaque background in a light theme');
  assert.ok(compactTags[1].top >= compactTags[0].bottom + .99, 'tags remain separated at a reduced viewport and seat scale');
  await page.screenshot({ path: resolve(output,'zhuohun-hp-small-viewport.png') });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.evaluate(() => {
    Laya.stage.setScreenSize(960, 640);
    setThemeBackground('#171b1d');
    setMaxHp(30);
    runtime.tick();
  });
  const wideTags = await page.evaluate(() => hpScreenGeometry());
  assert.deepEqual(wideTags.map(tag => tag.text), ['20','10✓']);
  assert.ok(wideTags.every(tag => tag.width >= tag.textWidth + 4), 'multiple digits and the state glyph fit together');
  await page.evaluate(() => { setMaxHp(6); runtime.tick(); });
  await page.evaluate(() => {
    selfUI.seat.IsOutOfRound = false;
    proxy.event('MsgReconnectGame',{});
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['4?','2?'], 'reconnect does not claim that unseen colors are unused');
  await page.evaluate(() => {
    proxy.event('GsCUpdateHpNtf',{Protocol:{SeatID:1,HP:2,isMaxHp:false}});
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['4?','2✓'], 'a pre-model notification is retained without recording the stale color');
  await page.evaluate(() => { setHp(2); runtime.tick(); });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['4?','2✓']);
  await page.evaluate(() => {
    proxy.event('GsCGamephaseNtf',{Protocol:{SeatID:0,Round:0}});
    proxy.event('MsgGameTurnNtf',{Protocol:{SeatID:0,TurnCnt:3,IsResume:true}});
    setMaxHp(2);
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>hpText()), ['1?'], 'two max HP has no positive red threshold');
  await page.evaluate(() => { targetUI.hpbarManager.gradeHpBg.visible = false; runtime.tick(); });
  assert.equal(await page.evaluate(()=>hpText()),undefined,'hiding the native health bar removes its marks');
  await page.evaluate(() => { targetUI.hpbarManager.gradeHpBg.visible = true; runtime.tick(); });
  await page.evaluate(() => {
    options.quanyuAssist = options.zhuohunAssist = false;
    tian.updateWinUI({type:1,ids:[9,1,5],descriptions:['一名角色进入濒死时','你使用牌后','准备阶段']});
    tian.visible = true;
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>[official.alpha,officialButton.alpha,Boolean(row()),Boolean(hpText())]), [1,1,false,false]);
  assert.deepEqual(await page.evaluate(()=>[official.height,adjacentMark.y,ownOfficial.width]), [30,-5,30]);
  assert.deepEqual(await page.evaluate(()=>tian.selectItems.map(item=>[item.x,item.useCntTxt.text,item.selectBg.visible])),
    [[601,'第3类型',true],[213,'第1类型',false],[407,'第2类型',false]]);
  const guide = await page.evaluate(() => {
    const root = tian.getChildByName('sgs-play-assist-tianshu');
    const panel = root.getChildByName('sgs-tianshu-effect-guide'), help = root.getChildByName('sgs-tianshu-help');
    const card = tian.selectItems[0], type = card.useCntTxt.localToGlobal(new Laya.Point(0,0));
    return { tipAt: help.localToGlobal(new Laya.Point(13,13)), bottom: panel.localToGlobal(new Laya.Point(0,panel.height)).y, typeTop: type.y };
  });
  assert.ok(guide.bottom <= guide.typeTop - 2,'effects guide leaves native type labels unobstructed');
  await page.screenshot({ path: resolve(output,'tianshu-triggers.png') });
  await page.mouse.click(guide.tipAt.x,guide.tipAt.y);
  assert.deepEqual(await page.evaluate(()=>tian.selectItems.map(item=>item.useCntTxt.text)), ['','','']);
  await page.mouse.click(guide.tipAt.x,guide.tipAt.y);
  assert.deepEqual(await page.evaluate(()=>tian.selectItems.map(item=>item.useCntTxt.text)), ['第3类型','第1类型','第2类型']);
  await page.mouse.click(76+213,30+305);
  assert.equal(await page.evaluate(()=>selectedTianshu),1,'sorted card retains native click index');
  await page.evaluate(() => {
    tian.updateWinUI({type:2,ids:[29,4,11],descriptions:['交换两人手牌','弃牌并摸等量','非锁定技失效']});
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>tian.selectItems.map(item=>item.selectBg.visible)), [true,false,true]);
  assert.equal(await page.evaluate(()=>tian.getChildByName('sgs-play-assist-tianshu').visible),false);
  await page.screenshot({ path: resolve(output,'tianshu-effects.png') });
  await page.evaluate(() => {
    options.tianshuAssist = false;
    runtime.tick();
  });
  assert.deepEqual(await page.evaluate(()=>tian.selectItems.map(item=>item.selectBg.visible)), [false,false,false]);
  assert.equal(await page.evaluate(()=>Boolean(tian.getChildByName('sgs-play-assist-tianshu'))),false);
  assert.equal(await page.evaluate(()=>tian.layout === tianNativeLayout),true);
  await page.evaluate(() => {
    options.quanyuAssist = options.zhuohunAssist = true;
    runtime.tick(); proxy.event('MsgGameOver',{});
  });
  assert.deepEqual(await page.evaluate(()=>[official.alpha,Boolean(row()),Boolean(hpText())]), [1,false,false]);
  await page.evaluate(()=>disposeAll());
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>window.failure),undefined);
  await writeFile(resolve(output,'report.json'),JSON.stringify({
    clientSha256: createHash('sha256').update(client).digest('hex'),
    checks:['Laya native window order and click IDs','effect guides and highlights','six icons in observed order','replaces only the stock card button while keeping side markers','history avoids neighboring markers and stays above a bottom-anchored button','mouse hover and native history button','high-contrast HP tags follow native own and opponent HP layouts','text size and spacing survive reduced viewport and seat scaling','direct color changes, numeric HP, sync, turn reset and reconnect','hidden native HP, toggle and end-of-game cleanup'], compactTags, errors,
  },null,2)+'\n');
  console.log('PASS play-assist Laya TianShu, QuanYu and ZhuoHun');
} finally { await browser.close(); }
