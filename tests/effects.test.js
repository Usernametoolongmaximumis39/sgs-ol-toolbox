import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import effects from '../src/plugins/effects/index.js';
import { OPTIONS, OTHER_OPTIONS, OPTION_GROUPS, EFFECT_LEVELS, classifyEffect, createEffectController } from '../src/plugins/effects/native.js';
import { NativeDraw, NativeDictionary, nativeToolbar } from '../dev/effects-native-fixtures.js';
import { windowFixture } from '../dev/effects-window-fixtures.js';
import { NativeRedButton, NativeRedTree, nativeRedFixture } from '../dev/effects-red-fixtures.js';

function setup(initial = {}) {
  const scope = new ResourceScope(), store = new Map(Object.entries(initial)), classes = new Map();
  let lookups = 0, scans = 0, hits = 0, ends = 0;
  class Effect {
    constructor() { this._alpha = 0.8; this.visible = true; this.destroyed = false; }
    get alpha() { return this._alpha; }
    set alpha(value) { this._alpha = value; }
    InitEffect(path, ...args) { this.effectUrl = path; this.alpha = 0.8; this.args = args; return 'initialized'; }
  }
  classes.set('BaseEffect', Effect);
  class Controller {
    constructor() { this.effectDic = { _maps: {} }; this.jsonEffectDic = { _maps: {} }; this.calls = []; }
    ShowEffectByData(data, layer, name = '', params = {}) {
      this.calls.push([...arguments]);
      if (data.fail) throw data.fail;
      const result = new Effect(); result.EffectData = data; result.effectName = name;
      result.InitEffect(data.EffectPath, 0, false);
      result.hit = () => { hits++; params.HitTrigger?.(); };
      result.end = () => { ends++; params.EndTrigger?.(); result.destroyed = true; };
      this.effectDic._maps[name || data.EffectPath] = [result]; return result;
    }
    ShowEffectByDataWithJson(...args) { return this.ShowEffectByData(...args); }
    ShowMulitEffectByData(data, layer, index, name, params) { return this.ShowEffectByData(data, layer, name, params); }
  }
  const nativeController = new Controller();
  const seat = { EffectCtrl: nativeController, shakeCalls: 0,
    playHurtShake(...args) { this.shakeCalls++; this.shakeArgs = args; return 'shake'; },
    OnShowAttackedEffect() { this.allowAttackEffect ||= new Effect(); this.allowAttackEffect.visible = true; return 'selected'; },
    effectSprite: { _children: [] } };
  const broadcast = { marqueeUI: new Effect(), marqueeUIList: { _maps: {} }, marqueeUIActList: { _objDatum: [] }, calls: 0,
    ShowMarquee(text) { this.calls++; this.marqueeUI.alpha = 0.7; this.marqueeUI.text = text; return 'notice'; },
    HideAllMarquee() { this.marqueeUI.destroyed = true; },
    ShowNextActMarquee() { const node = new Effect(); this.marqueeUIActList._objDatum.push(node); return node; } };
  const scene = { SelfSeatUi: seat, seatContainer: { seatUIs: [seat] },
    ged: { _events: { CHAT_MARQUEE_ADD: { caller: broadcast } } },
    PlaySimpleShakeEffect() { this.shakes = (this.shakes || 0) + 1; return 'scene shake'; } };
  let currentScene = scene;
  const ctx = { window: { Laya: { stage: { _children: [scene] } } }, scope,
    settings: { get: (key, fallback) => store.has(key) ? store.get(key) : fallback, set: (key, value) => store.set(key, value) },
    game: { getClass: name => { lookups++; return classes.get(name); }, getScene: () => currentScene,
      getSeatUIs: () => { scans++; return currentScene?.seatContainer?.seatUIs || []; } } };
  const controller = createEffectController(ctx);
  return { ctx, controller, scope, store, classes, Effect, seat, scene, broadcast, nativeController,
    setScene(value) { currentScene = value; ctx.window.Laya.stage._children = value ? [value] : []; },
    get lookups() { return lookups; }, get scans() { return scans; }, get hits() { return hits; }, get ends() { return ends; },
    dispose() { scope.dispose(); } };
}

test('effects: all toggles default off and no client discovery or method changes occur', () => {
  const f = setup();
  try {
    assert.equal(f.lookups, 0); assert.equal(f.scans, 0);
    assert.equal(Object.values(f.controller.getStatus().flags).some(Boolean), false);
    assert.equal(Object.hasOwn(f.nativeController, 'ShowEffectByData'), false);
    f.controller.refresh(); assert.equal(f.lookups, 0); assert.equal(f.scans, 0);
  } finally { f.dispose(); }
});

for (const [category, path, name] of [
  ['sha', 'EF_Basic_Sha_normal', ''], ['shan', 'EFF_shan', ''], ['heal', 'OtherEffect/FX_MatchGame_huixie_01', ''],
  ['equip', 'EF_Equip_Qinggang', ''], ['trick', 'EF_Plot_Wanjianqifa02_1', ''], ['trick', 'unclassified', 'nanman'],
  ['skill', 'SkillEffect/FX_1234', ''], ['selection', 'Ol_guanjiexuanze', ''],
]) test(`effects: ${category} masks only its visual and retains native return, args and completion callbacks (${path})`, () => {
  const f = setup({ [category]: true });
  try {
    let hit = 0, end = 0;
    const data = { EffectPath: path }, params = { HitTrigger: () => hit++, EndTrigger: () => end++ };
    const node = f.nativeController.ShowEffectByData(data, 6, name, params);
    assert.equal(node.alpha, 0); assert.equal(node._alpha, 0); assert.equal(node.visible, true);
    assert.deepEqual(f.nativeController.calls.at(-1), [data, 6, name, params]);
    assert.equal(hit, 0); assert.equal(end, 0);
    node.hit(); node.end(); assert.equal(hit, 1); assert.equal(end, 1);
    assert.equal(f.hits, 1); assert.equal(f.ends, 1);
  } finally { f.dispose(); }
});

test('effects: preserved state markers, unknown effects and other categories remain visible', () => {
  const f = setup({ trick: true, skill: true });
  try {
    for (const [data, name] of [
      [{ EffectPath: 'Plot_tiesuolianhuan', AniName: 'idle' }, ''], [{ EffectPath: 'SkillEffect/FX_PaiJu_card_fengyao' }, ''],
      [{ EffectPath: 'EFF_jiu' }, ''], [{ EffectPath: 'unrecognized' }, ''], [{ EffectPath: 'EF_Plot_tiesuo' }, 'tiesuo01'],
      [{ EffectPath: 'EFF_shan' }, ''],
    ]) assert.equal(f.nativeController.ShowEffectByData(data, 0, name).alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: after native failure the same exception escapes and no fake completion occurs', () => {
  const f = setup({ sha: true });
  try {
    const error = new Error('native unavailable');
    assert.throws(() => f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal', fail: error }), actual => actual === error);
    assert.equal(f.hits, 0); assert.equal(f.ends, 0);
  } finally { f.dispose(); }
});

test('effects: alpha writes during a blocked animation are restored to latest requested value', () => {
  const f = setup({ sha: true });
  try {
    const node = f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal' });
    node.alpha = 0.35; assert.equal(node.alpha, 0); assert.equal(node._alpha, 0);
    f.controller.setEnabled('sha', false);
    assert.equal(node.alpha, 0.35); assert.equal(node._alpha, 0.35); assert.equal(Object.hasOwn(node, 'alpha'), false);
    assert.equal(Object.hasOwn(f.nativeController, 'ShowEffectByData'), false);
  } finally { f.dispose(); }
});

test('effects: a pooled object reused for an unblocked effect is no longer masked', () => {
  const f = setup({ sha: true });
  try {
    const node = new f.Effect(); node.InitEffect('res/assets/animate/game/neweffect/EF_Basic_Sha_01.sk', 1, false);
    assert.equal(node.alpha, 0);
    node.InitEffect('res/assets/animate/game/neweffect/EFF_jiu.sk', 1, false);
    assert.equal(node.alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: new scene controllers sharing the observed native prototype are already covered', () => {
  const f = setup({ sha: true });
  try {
    const next = new f.nativeController.constructor();
    assert.equal(next.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_new' }).alpha, 0);
    f.controller.setEnabled('sha', false);
    assert.equal(next.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_new' }).alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: a later alpha accessor remains installed and unload restores underlying native rendering', () => {
  const f = setup({ sha: true });
  const node = f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal' });
  const saved = Object.getOwnPropertyDescriptor(node, 'alpha');
  const get = function () { return saved.get.call(this); };
  const set = function (value) { return saved.set.call(this, value); };
  Object.defineProperty(node, 'alpha', { configurable: true, get, set });
  node.alpha = 0.4; f.dispose();
  assert.equal(Object.getOwnPropertyDescriptor(node, 'alpha').get, get);
  assert.equal(node.alpha, 0.4); assert.equal(node._alpha, 0.4);
});

test('effects: late client classes and controllers attach on refresh without an old Xiaochao instance', () => {
  const f = setup();
  try {
    f.classes.clear(); f.setScene(null); f.controller.setEnabled('sha', true);
    assert.equal(f.controller.getStatus().available.includes('sha'), false);
    f.setScene(f.scene); f.controller.refresh();
    const node = f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal' });
    assert.equal(node.alpha, 0); assert.equal(f.controller.getStatus().available.includes('sha'), true);
  } finally { f.dispose(); }
});

test('effects: selection masks officer flourish while retaining selected-state/native work', () => {
  const f = setup({ selection: true });
  try {
    assert.equal(f.seat.OnShowAttackedEffect(), 'selected');
    assert.equal(f.seat.allowAttackEffect.visible, true); assert.equal(f.seat.allowAttackEffect.alpha, 0);
    f.controller.setEnabled('selection', false); assert.equal(f.seat.allowAttackEffect.alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: new seat and scene shake starts are suppressed and original calls resume after disable', () => {
  const f = setup({ shake: true });
  try {
    f.seat.playHurtShake(25, 'left'); f.scene.PlaySimpleShakeEffect();
    assert.equal(f.seat.shakeCalls, 0); assert.equal(f.scene.shakes, undefined);
    f.controller.setEnabled('shake', false);
    assert.equal(f.seat.playHurtShake(25, 'left'), 'shake'); assert.equal(f.scene.PlaySimpleShakeEffect(), 'scene shake');
    assert.deepEqual(f.seat.shakeArgs, [25, 'left']);
  } finally { f.dispose(); }
});

test('effects: broadcast continues its native queue while old and new visuals are hidden and restored', () => {
  const f = setup({ notice: true });
  try {
    assert.equal(f.broadcast.marqueeUI.alpha, 0);
    assert.equal(f.broadcast.ShowMarquee('message'), 'notice'); assert.equal(f.broadcast.calls, 1);
    assert.equal(f.broadcast.marqueeUI.alpha, 0); assert.equal(f.broadcast.marqueeUI.text, 'message');
    const next = f.broadcast.ShowNextActMarquee(); assert.equal(next.alpha, 0);
    f.controller.setEnabled('notice', false);
    assert.equal(f.broadcast.marqueeUI.alpha, 0.7); assert.equal(next.alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: unload preserves a later wrapper and the old plugin wrapper becomes inert', () => {
  const f = setup({ sha: true });
  const previous = f.nativeController.ShowEffectByData;
  let externalCalls = 0;
  const external = function (...args) { externalCalls++; return Reflect.apply(previous, this, args); };
  f.nativeController.ShowEffectByData = external;
  f.dispose();
  assert.equal(f.nativeController.ShowEffectByData, external);
  const node = f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal' });
  assert.equal(node.alpha, 0.8); assert.equal(externalCalls, 1);
});

test('effects: bounded visual capacity and destroyed effects are released on refresh', () => {
  const f = setup({ sha: true });
  try {
    const nodes = [];
    for (let i = 0; i < 270; i++) { const node = new f.Effect(); node.InitEffect('EF_Basic_Sha_normal'); nodes.push(node); }
    assert.equal(f.controller.getStatus().masked, 256); assert.equal(nodes.at(-1).alpha, 0.8);
    for (const node of nodes) node.destroyed = true;
    f.controller.refresh(); assert.equal(f.controller.getStatus().masked, 0);
  } finally { f.dispose(); }
});

test('effects: independent panel persists toggles and has no card/session state requirement', () => {
  const f = setup(), dom = new JSDOM('<main></main>'); f.controller.dispose();
  let panel, cleanup;
  Object.assign(f.ctx, { document: dom.window.document, ui: { registerPanel(spec) { panel = spec; cleanup = spec.render(dom.window.document.querySelector('main')); } } });
  Object.assign(f.ctx.ui, mountPluginUI(f.ctx, () => f.ctx));
  const stop = effects.activate(f.ctx);
  try {
    assert.equal(panel.category, 'tools'); assert.equal(effects.manifest.id, 'effects');
    const input = dom.window.document.querySelector('[data-effect=sha]');
    input.click();
    assert.equal(f.store.get('sha'), true);
    assert.equal(f.nativeController.ShowEffectByData({ EffectPath: 'EF_Basic_Sha_normal' }).alpha, 0);
    cleanup(); cleanup = null;
    assert.equal(dom.window.document.querySelector('[data-plugin=effects]'), null);
  } finally { cleanup?.(); stop(); f.dispose(); dom.window.close(); }
});

test('effects: normal full resource paths classify without matching arbitrary similarly named files', () => {
  assert.equal(classifyEffect('https://game/res/assets/animate/game/neweffect/EF_Basic_Sha_test.sk?v=1'), 'sha');
  assert.equal(classifyEffect('/pictures/EF_Basic_Sha_test.png'), '');
  assert.equal(classifyEffect('res/assets/animate/game/effect/Ol_guanjiexuanze.sk'), 'selection');
});

test('effects: collapsed slider applies cumulative levels atomically, keeps custom settings and leaves advertisements independent', () => {
  const f = setup({ sha: true, download: true }), dom = new JSDOM('<main></main>'); f.controller.dispose();
  let cleanup;
  Object.assign(f.ctx, { document: dom.window.document, ui: { registerPanel(spec) { cleanup = spec.render(dom.window.document.querySelector('main')); } } });
  Object.assign(f.ctx.ui, mountPluginUI(f.ctx, () => f.ctx));
  const stop = effects.activate(f.ctx), doc = dom.window.document;
  try {
    const slider = doc.querySelector('[data-effects-level]'), text = doc.querySelector('[data-effects-level-text]'), details = doc.querySelector('[data-effects-details]');
    const grid = doc.querySelector('.effects-detail-grid');
    assert.equal(grid.hidden, true); assert.equal(details.getAttribute('aria-expanded'), 'false');
    assert.equal(text.textContent, '自定义 · 1/12'); assert.equal(f.store.get('sha'), true);
    details.click(); assert.equal(grid.hidden, false); assert.equal(details.getAttribute('aria-expanded'), 'true');
    let previous = [];
    for (const [index, level] of EFFECT_LEVELS.entries()) {
      assert.ok(previous.every(key => level.keys.includes(key))); previous = level.keys;
      const before = f.scans;
      slider.value = String(index); slider.dispatchEvent(new dom.window.Event('input'));
      assert.ok(f.scans - before <= 1, 'one native discovery at most for each slider movement');
      for (const key of OPTION_GROUPS[0].keys) assert.equal(doc.querySelector(`[data-effect=${key}]`).getAttribute('aria-pressed'), String(level.keys.includes(key)));
      assert.equal(f.store.get('download'), true); assert.equal(doc.querySelector('[data-effect=ads]').getAttribute('aria-pressed'), 'mixed');
      assert.equal(text.textContent, `${index} · ${level.name}`);
    }
    assert.equal(EFFECT_LEVELS.at(-1).keys.length, 12);
    const sha = doc.querySelector('[data-effect=sha]'); sha.click();
    assert.equal(text.textContent, '自定义 · 11/12');
    details.click(); assert.equal(grid.hidden, true); assert.equal(f.store.get('sha'), false);
    cleanup(); cleanup = null; stop();
    const restart = effects.activate(f.ctx);
    try {
      assert.equal(doc.querySelector('[data-effects-level-text]').textContent, '自定义 · 11/12');
      assert.equal(doc.querySelector('.effects-detail-grid').hidden, true);
      doc.querySelector('[aria-label=全部恢复]').click();
      assert.equal(doc.querySelectorAll('[data-effect][aria-pressed=true]').length, 0);
      assert.equal(doc.querySelector('[data-effects-level-text]').textContent, '0 · 无屏蔽');
    } finally { cleanup?.(); cleanup = null; restart(); }
  } finally { cleanup?.(); stop(); f.dispose(); dom.window.close(); }
});

test('effects: twelve battle controls plus exactly six combined options cover all retained adapters', () => {
  assert.equal(OPTIONS.length, 25);
  assert.deepEqual(OPTION_GROUPS.map(group => group.keys.length), [12, 6]);
  assert.deepEqual(OTHER_OPTIONS.map(option => option[1]), ['狗卡广告', '任务红点', '进房特效', '动画表情', '出货动画', '过场结算']);
  assert.deepEqual([...new Set([...OPTION_GROUPS[0].keys, ...OTHER_OPTIONS.flatMap(option => option[3])])].sort(), OPTIONS.map(([key]) => key).sort());
  assert.deepEqual(EFFECT_LEVELS[1].keys, ['tianshu']);
  assert.equal(EFFECT_LEVELS[2].keys.includes('selection'), false);
  assert.equal(EFFECT_LEVELS[3].keys.includes('selection'), true);
  const f = setup({ shake: true, notice: true, recharge: true, names: true });
  try {
    const flags = f.controller.getStatus().flags;
    assert.equal(flags.shake, true); assert.equal(flags.notice, true);
    assert.equal(Object.hasOwn(flags, 'recharge'), false); assert.equal(Object.hasOwn(flags, 'names'), false);
    for (const [key, , , members] of OTHER_OPTIONS) {
      f.controller.setEnabled(key, true);
      for (const member of members) assert.equal(f.controller.getStatus().flags[member], true);
      f.controller.setEnabled(key, false);
      for (const member of members) assert.equal(f.controller.getStatus().flags[member], false);
    }
  } finally { f.dispose(); }
});

test('effects: combined buttons preserve partial old settings and persist every member together without native checkboxes', () => {
  const f = setup({ notice: true, slogan: true, package: true, rogue: true }), dom = new JSDOM('<main></main>'); f.controller.dispose();
  let cleanup;
  Object.assign(f.ctx, { document: dom.window.document, ui: { registerPanel(spec) { cleanup = spec.render(dom.window.document.querySelector('main')); } } });
  Object.assign(f.ctx.ui, mountPluginUI(f.ctx, () => f.ctx));
  const stop = effects.activate(f.ctx), doc = dom.window.document;
  try {
    assert.equal(doc.querySelectorAll('[data-effect]').length, 18);
    assert.equal(doc.querySelectorAll('input[type=checkbox]').length, 0);
    for (const key of ['ads', 'room', 'draw', 'transition']) {
      const button = doc.querySelector(`[data-effect=${key}]`);
      assert.equal(button.getAttribute('aria-pressed'), 'mixed');
      assert.equal(button.querySelector('.effects-option-state-text').textContent, '部分屏蔽');
      assert.match(button.getAttribute('aria-label'), /部分屏蔽，点击全部屏蔽/);
    }
    for (const [key, , , members] of OTHER_OPTIONS) {
      const button = doc.querySelector(`[data-effect=${key}]`), before = f.scans;
      button.click(); assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(button.querySelector('.effects-option-state-text').textContent, '已屏蔽');
      assert.ok(f.scans - before <= 1);
      for (const member of members) assert.equal(f.store.get(member), true);
      button.click(); assert.equal(button.getAttribute('aria-pressed'), 'false');
      assert.equal(button.querySelector('.effects-option-state-text').textContent, '未屏蔽');
      for (const member of members) assert.equal(f.store.get(member), false);
    }
    assert.equal(f.store.has('recharge'), false); assert.equal(f.store.has('names'), false);
    cleanup(); cleanup = null; stop();
    const restart = effects.activate(f.ctx);
    try { assert.equal(doc.querySelectorAll('[data-effect][aria-pressed=false]').length, 18); }
    finally { cleanup?.(); cleanup = null; restart(); }
  } finally { cleanup?.(); stop(); f.dispose(); dom.window.close(); }
});

for (const side of ['selfSkin', 'otherSkin']) test(`effects: ${side} hides that player's skin only and retains native callbacks/returns`, () => {
  const f = setup();
  try {
    let finished = 0;
    class SkinSeat {
      constructor(own) { this.seat = { IsSelf: own }; }
      onPlayNewSpEffect(type, callback) { this.playingNewSpEffect = new f.Effect(); this.callback = callback; return `skin-${type}`; }
      playGeneralSpEffect(callback) { this.outAvatarEffect = new f.Effect(); this.callback = callback; return true; }
    }
    const own = new SkinSeat(true), other = new SkinSeat(false), unknown = new SkinSeat(undefined);
    f.scene.seatContainer.seatUIs = [own, other, unknown]; f.controller.setEnabled(side, true);
    for (const node of [own, other, unknown]) {
      assert.equal(node.onPlayNewSpEffect(1, () => finished++), 'skin-1'); node.callback();
      assert.equal(node.playingNewSpEffect.alpha, node === (side === 'selfSkin' ? own : other) ? 0 : 0.8);
    }
    assert.equal(finished, 3);
    const blocked = side === 'selfSkin' ? own : other;
    assert.equal(blocked.playGeneralSpEffect(() => finished++), true); assert.equal(blocked.outAvatarEffect.alpha, 0);
    f.controller.setEnabled(side, false); assert.equal(blocked.playingNewSpEffect.alpha, 0.8); assert.equal(blocked.outAvatarEffect.alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: kill/heal reward visuals and high-quality skill triggers are independent', () => {
  const f = setup();
  try {
    let calls = 0;
    for (const key of [1, 2, 3, 5]) f.scene[`showGameRewardPointEffect${key}`] = () => ++calls;
    f.scene.PlayTriggerEffect = () => ++calls;
    f.controller.setEnabled('kill', true);
    f.scene.showGameRewardPointEffect1(); f.scene.showGameRewardPointEffect3(); assert.equal(calls, 0);
    f.scene.showGameRewardPointEffect2(); f.scene.showGameRewardPointEffect5(); f.scene.PlayTriggerEffect(); assert.equal(calls, 3);
    f.controller.setEnabled('skill', true); f.scene.PlayTriggerEffect(); assert.equal(calls, 3);
    f.controller.setEnabled('kill', false); f.scene.showGameRewardPointEffect1(); assert.equal(calls, 4);
  } finally { f.dispose(); }
});

test('effects: tianshu blocks only type 6 spectator animation and preserves all interactive types', () => {
  const f = setup();
  try {
    class TianShu {
      constructor() { this.closed = 0; this.updates = []; }
      updateWinUI(data) { this.updates.push(data); return 'interactive'; }
      Close() { this.closed++; }
    }
    f.classes.set('TianShuWindow', TianShu); f.controller.setEnabled('tianshu', true);
    const win = new TianShu();
    for (const type of [1, 2, 3, 4, 5]) assert.equal(win.updateWinUI({ type }), 'interactive');
    win.updateWinUI({ type: 6 }); assert.equal(win.closed, 1); assert.equal(win.updates.length, 5);
    f.controller.setEnabled('tianshu', false); assert.equal(win.updateWinUI({ type: 6 }), 'interactive');
  } finally { f.dispose(); }
});

for (const [name, category, method] of [['AdPushWindow', 'ad', 'Close'], ['VersionNoticeWindow', 'version', 'Close'],
  ['GameMvpWindow', 'result', 'laterClose'], ['RogueLike1v1ZhanJiWindow', 'result', 'onClickClose'],
  ['GeneralOpenResultWindow', 'package', 'Close'], ['RogueChapterStoryWindow', 'rogue', 'Close']]) {
  test(`effects: ${name} uses native close/continuation and disable restores future windows`, () => {
    const f = setup();
    try {
      let advances = 0;
      class Popup {
        constructor() { this.closed = 0; this.curViewList = [{ closeClicker() { advances++; } }]; }
        enterWindow(...args) { this.args = args; return 42; }
        [method]() { this.closed++; if (category === 'ad') advances++; }
      }
      f.classes.set(name, Popup); f.controller.setEnabled(category, true);
      const win = new Popup(); assert.equal(win.enterWindow('payload', () => {}), 42); assert.equal(win.closed, 1);
      assert.equal(advances, category === 'ad' ? 1 : 0);
      if (category === 'result') { win.isShare = true; win.enterWindow('shared'); assert.equal(win.closed, 1); }
      f.controller.setEnabled(category, false); win.enterWindow('normal'); assert.equal(win.closed, 1);
    } finally { f.dispose(); }
  });
}

test('effects: advertisements hide banners while removed charge/name settings never touch native visuals or layout', () => {
  const f = setup({ recharge: true, names: true }), charge = new NativeDraw(), shop = new NativeDraw();
  try {
    f.scene.adBanner = new NativeDraw();
    f.scene.showAdView = function () { this.adBanner.visible = true; return 7; };
    const bar = f.scene.hallToolbar = nativeToolbar(charge, shop), originalLayout = bar.layout;
    const top = f.seat.otherTopManager = { playerNameTxt: new NativeDraw(), playerNameBg: new NativeDraw(), playerLevelTxt: new NativeDraw(), UpdatePlayerName() { this.playerNameTxt.visible = true; } };
    const originalUpdate = top.UpdatePlayerName;
    f.controller.setEnabled('ads', true);
    f.controller.setEnabled('recharge', true); f.controller.setEnabled('names', true);
    assert.equal(f.scene.showAdView(), 7); assert.equal(f.scene.adBanner.renderedVisible, false);
    assert.equal(bar.layout, originalLayout); assert.equal(top.UpdatePlayerName, originalUpdate);
    bar.layout(); top.UpdatePlayerName();
    assert.equal(charge.renderedVisible, true); assert.equal(shop.renderedVisible, true);
    assert.equal(bar.width, 210); assert.equal(bar.x + bar.width, 610);
    assert.equal(top.playerNameTxt.renderedVisible, true); assert.equal(top.playerLevelTxt.renderedVisible, true);
    f.scene.adBanner.visible = false;
    f.dispose(); assert.equal(f.scene.adBanner.renderedVisible, false); assert.equal(charge.visible, true);
  } finally { f.dispose(); }
});

test('effects: task dots keep true task state and restore updates without marking tasks read', () => {
  const f = setup();
  try {
    const updates = [], node = { state: 1, enable: true, children: [], event(_name, state) { updates.push(state); } };
    const manager = { tree: { Root: node, notifyNodeEvent(item) { item.event('RED_UPDATE', item.state === 1 && item.enable); } } };
    class Notice { get NoticeRed() { return this.latest; } }
    const notice = new Notice(); notice.latest = true;
    f.scene.ged.constructor = { managerList: [manager, notice] };
    f.controller.setEnabled('redDot', true); assert.equal(updates.at(-1), false); assert.equal(node.state, 1); assert.equal(notice.NoticeRed, false);
    node.state = 0; manager.tree.notifyNodeEvent(node); notice.latest = false;
    f.controller.setEnabled('redDot', false); assert.equal(updates.at(-1), false); assert.equal(notice.NoticeRed, false);
    node.state = 1; manager.tree.notifyNodeEvent(node); assert.equal(updates.at(-1), true);
  } finally { f.dispose(); }
});

test('effects: native draw-list task badges hide immediately, direct state reads cannot reshow them and stop restores current state', () => {
  const f = setup(), red = nativeRedFixture();
  try {
    f.scene.Childs = [red.drawRoot]; f.ctx.game.getServerProxy = () => red.proxy;
    const show = NativeRedButton.prototype.ShowRedPoint, notify = NativeRedTree.prototype.notifyNodeEvent;
    f.controller.setEnabled('redDot', true);
    assert.equal(red.button.redPointTex.renderedVisible, false);
    assert.equal(red.node.state, 1); assert.deepEqual(red.node.taskIds, [9001]);
    assert.equal(red.manager.GetNodeIsShowByPath(), true);
    assert.equal(NativeRedButton.prototype.ShowRedPoint, show); assert.equal(NativeRedTree.prototype.notifyNodeEvent, notify);
    // This bypasses notifyNodeEvent exactly as the native hall initRed does.
    red.update(red.manager.GetNodeIsShowByPath());
    assert.equal(red.button.redPointTex.renderedVisible, false); assert.equal(red.button.renderedVisible, true);
    assert.equal(red.button.SetNumber(7), 7); assert.equal(red.button.latestNumber, 7);
    assert.equal(red.button.numDotNode.renderedVisible, false);
    // Sibling instance, outside the observed draw tree, must stay untouched.
    const sibling = new NativeRedButton(); sibling.ShowRedPoint(); assert.equal(sibling.redPointTex.renderedVisible, true);
    f.controller.setEnabled('redDot', false);
    assert.equal(red.button.redPointTex.renderedVisible, true); assert.equal(red.button.numDotNode.renderedVisible, true);
    assert.equal(Object.hasOwn(red.button, 'ShowRedPoint'), false); assert.equal(Object.hasOwn(red.tree, 'notifyNodeEvent'), false);
    f.controller.setEnabled('redDot', true);
    red.tree.SetNodeState(red.node, 0); red.button.SetNumber(0);
    f.controller.setEnabled('redDot', false);
    assert.equal(red.node.state, 0); assert.equal(red.button.redPointTex.renderedVisible, false); assert.equal(red.button.numDotNode.renderedVisible, false);
    f.controller.setEnabled('redDot', true); red.tree.SetNodeState(red.node, 1);
    f.dispose(); assert.equal(red.button.redPointTex.renderedVisible, true);
  } finally { f.dispose(); }
});

test('effects: ads suppress both calendar entries and More aggregate, preserving unrelated reminders and unread state', () => {
  const f = setup(), calendar = new NativeRedButton(), activity = new NativeRedButton(), more = new NativeRedButton();
  const manager = { unread: true, GetSpecialActivityCalendar() {}, GetLimitActivityCalendar() {}, IsReddot() { return this.unread; } };
  const menu = { UpdateRedPoint(id, value) { if (id === 10307) value ? calendar.ShowRedPoint() : calendar.RemoveRedPoint(); } };
  const bar = { moreView: menu, other: false, checkMoreRed() { const value = manager.IsReddot(); menu.UpdateRedPoint(10307, value); return value || this.other; },
    moreUpdate() { this.checkMoreRed() ? more.ShowRedPoint() : more.RemoveRedPoint(); } };
  const view = { calendarBtn: activity, activityCalendarRedHandler(value) { value ? activity.ShowRedPoint() : activity.RemoveRedPoint(); },
    initCalendarRedDot() { this.activityCalendarRedHandler(manager.unread); } };
  const saved = view.activityCalendarRedHandler.bind(view);
  try {
    f.scene._children = [manager, bar, view]; bar.moreUpdate(); view.initCalendarRedDot();
    f.controller.setEnabled('ads', true);
    assert.equal(calendar.redPointTex.renderedVisible, false); assert.equal(activity.redPointTex.renderedVisible, false);
    assert.equal(more.redPointTex.renderedVisible, false); assert.equal(manager.unread, true);
    saved(true); menu.UpdateRedPoint(10307, true); bar.moreUpdate();
    assert.equal(activity.redPointTex.renderedVisible, false); assert.equal(calendar.redPointTex.renderedVisible, false);
    bar.other = true; bar.moreUpdate(); assert.equal(more.redPointTex.renderedVisible, true);
    f.controller.setEnabled('ads', false);
    assert.equal(calendar.redPointTex.renderedVisible, true); assert.equal(activity.redPointTex.renderedVisible, true);
    f.controller.setEnabled('ads', true); manager.unread = false; f.controller.setEnabled('ads', false);
    assert.equal(calendar.redPointTex.renderedVisible, false); assert.equal(activity.redPointTex.renderedVisible, false);
  } finally { f.dispose(); }
});

test('effects: existing singleton task managers attach without invoking their factories or getter singletons', () => {
  const f = setup(), red = nativeRedFixture(); let invoked = 0;
  try {
    class Manager { static instance = red.manager; static I() { invoked++; throw new Error('must not construct'); } }
    Object.defineProperty(Manager, '_instance', { get() { invoked++; throw new Error('must not read'); } });
    f.classes.set('TaskRedDotManager', Manager);
    f.controller.setEnabled('redDot', true);
    assert.equal(invoked, 0); assert.equal(red.button.redPointTex.visible, false); assert.equal(red.node.state, 1);
    red.tree.SetNodeState(red.node, 0); red.tree.SetNodeState(red.node, 1);
    assert.equal(red.button.redPointTex.visible, false);
    f.controller.setEnabled('redDot', false); assert.equal(red.button.redPointTex.visible, true);
  } finally { f.dispose(); }
});

test('effects: late draw-list badges and both task tab badge forms mask only their dedicated visuals', () => {
  const f = setup(), button = new NativeRedButton(), unrelated = new NativeDraw();
  try {
    f.scene.Childs = [button, { redPointTex: unrelated }];
    f.controller.setEnabled('redDot', true);
    button.ShowRedPoint(); button.SetNumber(3);
    assert.equal(button.redPointTex.renderedVisible, false); assert.equal(button.numDotNode.renderedVisible, false);
    const texture = new NativeDraw(), dot = new NativeDraw();
    const tab = { redPointTexture: texture, redDot: dot, ShowRedPoint() { texture.visible = true; }, RemoveRedPoint() { texture.visible = false; },
      ShowRedDot() { dot.visible = true; }, UpdateRedNum(value) { dot.visible = value > 0; } };
    f.scene.Childs.push(tab); f.controller.refresh();
    tab.ShowRedPoint(); tab.ShowRedDot(); tab.UpdateRedNum(2);
    assert.equal(texture.renderedVisible, false); assert.equal(dot.renderedVisible, false); assert.equal(unrelated.renderedVisible, true);
    f.dispose(); assert.equal(texture.renderedVisible, true); assert.equal(dot.renderedVisible, true);
  } finally { f.dispose(); }
});

test('effects: known room slogans and opponent expressions only, with ordinary chat and own expressions preserved', () => {
  const f = setup();
  try {
    f.seat.seat = { IsSelf: false }; f.seat.ShowBigFace = () => 'face'; f.seat.ShowChatMessage = data => data.chatMsg;
    f.scene.dealChatMessage = data => data.ChatMsg;
    f.controller.setEnabled('slogan', true); f.controller.setEnabled('emotion', true);
    const slogan = { Channel: 2, chatMsg: '中原人杰地灵，天下归心！' };
    assert.equal(f.seat.ShowChatMessage(slogan), undefined); assert.equal(f.scene.dealChatMessage({ ...slogan, ChatMsg: slogan.chatMsg }), undefined);
    assert.equal(f.seat.ShowChatMessage({ Channel: 2, chatMsg: '正常聊天' }), '正常聊天');
    assert.equal(f.seat.ShowChatMessage({ ...slogan, Channel: 1 }), slogan.chatMsg);
    assert.equal(f.seat.ShowBigFace('emoji'), undefined); f.seat.seat.IsSelf = true; assert.equal(f.seat.ShowBigFace('emoji'), 'face');
    f.seat.seat.IsSelf = undefined; assert.equal(f.seat.ShowBigFace('emoji'), 'face');
  } finally { f.dispose(); }
});

test('effects: entry and rogue boss visuals keep their native progression callbacks', () => {
  const f = setup();
  try {
    const item = { PlaySeatShowAnimate(done) { this.avatarAnimate = new f.Effect(); this.finish = done; return 'entry'; } };
    const city = { ShowBossEffect(done) { this.bossEffect = new f.Effect(); this.finish = done; return 'boss'; } };
    f.scene._children = [item]; f.scene.cityView = city;
    f.controller.setEnabled('entrance', true); f.controller.setEnabled('rogue', true);
    let completed = 0;
    assert.equal(item.PlaySeatShowAnimate(() => completed++), 'entry'); assert.equal(item.avatarAnimate.alpha, 0);
    assert.equal(city.ShowBossEffect(() => completed++), 'boss'); assert.equal(city.bossEffect.alpha, 0);
    item.finish(); city.finish(); assert.equal(completed, 2);
    f.dispose(); assert.equal(item.avatarAnimate.alpha, 0.8); assert.equal(city.bossEffect.alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: probability windows wait for officer/general completion; previews stay visible and unload cancels close', async () => {
  const f = setup();
  try {
    class Obtained {
      constructor() { this.visible = true; this.modalBg = { visible: true }; this.closed = 0; this.officer = 0; this.general = 0; }
      enterWindow() { return 'native'; }
      delayFunc() { this.general++; }
      onShowOfficerPoint() { this.officer++; }
      Close() { this.closed++; }
    }
    f.classes.set('GetNewGeneralWindow', Obtained); f.controller.setEnabled('prob', true);
    const win = new Obtained(); assert.equal(win.enterWindow(), 'native'); assert.equal(win.visible, false); assert.equal(win.modalBg.visible, false);
    win.delayFunc(); await Promise.resolve(); assert.equal(win.closed, 0);
    f.controller.setEnabled('banner', true); assert.equal(win.visible, false);
    win.onShowOfficerPoint(); await Promise.resolve(); assert.equal(win.closed, 1); assert.equal(win.officer, 1); assert.equal(win.general, 1);
    const preview = new Obtained(); preview.enterWindow(0, 0, 0, 0, 0, 0, -1); assert.equal(preview.visible, true);
    preview.delayFunc(); preview.onShowOfficerPoint(); await Promise.resolve(); assert.equal(preview.closed, 0);
    win.enterWindow(0, 0, 0, 0, 0, 0, -1); assert.equal(win.visible, true); assert.equal(win.modalBg.visible, true);
    const pending = new Obtained(); pending.enterWindow(); pending.delayFunc(); pending.onShowOfficerPoint();
    f.dispose(); await Promise.resolve(); assert.equal(pending.closed, 0); assert.equal(pending.visible, true);
  } finally { f.dispose(); }
});

test('effects: special rewards close only when native final stage allows it and retain all item work', async () => {
  const f = setup();
  try {
    class Special {
      constructor() { this.visible = true; this.cantClose = false; this.closed = 0; this.created = 0; }
      enterWindow() { this.created++; }
      showFinalResult() { this.isFinalResultShown = true; this.visible = true; }
      cantCloseChange() { this.cantClose = true; }
      Close() { if (this.cantClose) this.closed++; }
    }
    f.classes.set('GetPropSpecialWindow', Special); f.controller.setEnabled('prob', true);
    const win = new Special(); win.enterWindow(); win.showFinalResult(); await Promise.resolve();
    assert.equal(win.visible, false); assert.equal(win.closed, 0); assert.equal(win.created, 1);
    win.cantCloseChange(); await Promise.resolve(); assert.equal(win.closed, 1);
  } finally { f.dispose(); }
});

test('effects: later visible wrappers stay installed while unload repaints native draw state', () => {
  const f = setup(), banner = f.scene.adBanner = new NativeDraw();
  f.controller.setEnabled('ads', true);
  const saved = Object.getOwnPropertyDescriptor(banner, 'visible');
  const get = function () { return saved.get.call(this); };
  const set = function (value) { return saved.set.call(this, value); };
  Object.defineProperty(banner, 'visible', { configurable: true, get, set });
  banner.visible = true; assert.equal(banner.renderedVisible, false);
  f.dispose();
  assert.equal(Object.getOwnPropertyDescriptor(banner, 'visible').get, get);
  assert.equal(banner.visible, true); assert.equal(banner._visible, true); assert.equal(banner.renderedVisible, true);
});

test('effects: normal and activity marquees in native dual-namespace dictionaries hide at startup and on creation', () => {
  const f = setup();
  try {
    const normal = new NativeDraw(), activity = new NativeDraw(), objectKeyed = new NativeDraw();
    const manager = f.broadcast;
    delete manager.marqueeUI;
    manager.marqueeUIList = new NativeDictionary(); manager.marqueeUIActList = new NativeDictionary();
    manager.marqueeUIList.add(10, normal); manager.marqueeUIActList.add('act', activity);
    manager.marqueeUIActList.add({}, objectKeyed);
    assert.deepEqual(manager.marqueeUIList._objDatum, []);
    // The adapter must inspect backing fields without concatenating the native
    // datum getter, which can allocate across an arbitrarily large dictionary.
    Object.defineProperty(manager.marqueeUIList, 'datum', { get() { throw new Error('unbounded read'); } });
    manager.ShowMarquee = function (id) { const node = new NativeDraw(); this.marqueeUIList.add(id, node); return node; };
    manager.ShowNextActMarquee = function (id) { const node = new NativeDraw(); this.marqueeUIActList.add(id, node); return node; };
    f.controller.setEnabled('notice', true);
    for (const node of [normal, activity, objectKeyed]) assert.equal(node.renderedAlpha, 0);
    assert.equal(f.controller.getStatus().counts.notice, 3);
    const next = manager.ShowMarquee(11), nextAct = manager.ShowNextActMarquee(12);
    assert.equal(next.renderedAlpha, 0); assert.equal(nextAct.renderedAlpha, 0);
    normal.alpha = 0.5; next.alpha = 0.35; assert.equal(normal.renderedAlpha, 0);
    f.controller.setEnabled('notice', false);
    assert.equal(normal.renderedAlpha, 0.5); assert.equal(next.renderedAlpha, 0.35); assert.equal(nextAct.renderedAlpha, 0.8);
    assert.equal(manager.ShowMarquee(13).renderedAlpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: existing general effects in string-key maps are scanned despite empty object-key arrays', () => {
  const f = setup();
  try {
    const node = new f.Effect(); node.EffectData = { EffectPath: 'EF_Basic_Sha_normal' };
    f.nativeController.effectDic = new NativeDictionary(); f.nativeController.effectDic.add('sha', [node]);
    f.controller.setEnabled('sha', true); assert.equal(node._alpha, 0);
    f.controller.setEnabled('sha', false); assert.equal(node._alpha, 0.8);
  } finally { f.dispose(); }
});

test('effects: saved activity listener references are masked on native addChild without waiting for refresh', () => {
  const f = setup();
  try {
    const manager = f.broadcast;
    delete manager.marqueeUI;
    manager.marqueeUIActList = new NativeDictionary(); manager._children = [];
    manager.addChild = function (node) { this._children.push(node); return node; };
    manager.intActDataMarquee = function () {
      const node = new NativeDraw(); this.marqueeUIActList.add(30, node); this.addChild(node); node.alpha = 1; return node;
    };
    const listener = manager.intActDataMarquee;
    f.controller.setEnabled('notice', true);
    const node = listener.call(manager);
    assert.equal(node.renderedAlpha, 0);
    const unrelatedPrompt = new NativeDraw(); assert.equal(manager.addChild(unrelatedPrompt), unrelatedPrompt);
    assert.equal(unrelatedPrompt.renderedAlpha, 0.8);
    f.controller.setEnabled('notice', false); assert.equal(node.renderedAlpha, 1);
  } finally { f.dispose(); }
});

for (const key of ['ad', 'version', 'result', 'package', 'rogue', 'prob']) test(`effects: ${key} leaves shared popup ancestors and ordinary windows interactive`, () => {
  const f = setup(), windows = windowFixture();
  try {
    const originals = Object.fromEntries(['enterWindow', 'showHandler', 'UpdateWindow'].map(key => [key, windows.BaseWindow.prototype[key]]));
    Object.entries(windows.classes).forEach(([name, type]) => f.classes.set(name, type));
    f.controller.setEnabled(key, true);
    for (const method of Object.keys(originals)) assert.equal(windows.BaseWindow.prototype[method], originals[method]);
    for (const name of ['ShopWindow', 'BagWindow', 'MailWindow']) {
      const win = new windows.classes[name]();
      assert.equal(win.enterWindow('payload'), name); assert.equal(win.closed, 0);
      assert.equal(win.visible, true); assert.equal(win.alpha, 1); assert.equal(win.modalBg.visible, true);
      assert.equal(win.click(), 1); assert.equal(win.UpdateWindow('new data'), 'updated'); assert.equal(win.closed, 0);
      win.Close(); assert.equal(win.modalBg.parent, null); assert.equal(windows.opened.size, 0);
    }
  } finally { f.dispose(); }
});

test('effects: ad closes once after full initialization, without closing other windows or leaving a modal', () => {
  const f = setup(), windows = windowFixture();
  try {
    Object.entries(windows.classes).forEach(([name, type]) => f.classes.set(name, type));
    f.controller.setEnabled('ad', true);
    const shop = new windows.classes.ShopWindow(); shop.enterWindow();
    const ad = new windows.classes.AdPushWindow();
    ad.curViewList = [{ closeClicker() { throw new Error('must not close the whole ad repeatedly through each view'); } }];
    assert.equal(ad.enterWindow('ad data'), 'ad-ready');
    assert.equal(ad.closed, 1); assert.equal(ad.closedAfterInit, true); assert.equal(ad.eventsAdded, false);
    assert.equal(ad.parent, null); assert.equal(ad.modalBg.parent, null); assert.equal(ad.modalBg.visible, false);
    assert.equal(shop.closed, 0); assert.equal(shop.click(), 1);
    assert.ok(windows.trace.indexOf('AdPushWindow:ready') < windows.trace.indexOf('AdPushWindow:close'));
    f.controller.setEnabled('ad', false);
    const normalAd = new windows.classes.AdPushWindow(); normalAd.enterWindow(); assert.equal(normalAd.closed, 0);
    assert.equal(normalAd.click(), 1); normalAd.Close(); shop.Close(); assert.equal(windows.opened.size, 0);
  } finally { f.dispose(); }
});

test('effects: ad and version switches remain independent when their entries share the same base method', () => {
  const f = setup(), windows = windowFixture();
  try {
    Object.entries(windows.classes).forEach(([name, type]) => f.classes.set(name, type));
    f.controller.setEnabled('ad', true); f.controller.setEnabled('version', true);
    const ad = new windows.classes.AdPushWindow(), version = new windows.classes.VersionNoticeWindow();
    ad.enterWindow(); version.enterWindow(); assert.equal(ad.closed, 1); assert.equal(version.closed, 1);
    f.controller.setEnabled('ad', false);
    const nextAd = new windows.classes.AdPushWindow(), nextVersion = new windows.classes.VersionNoticeWindow();
    nextAd.enterWindow(); nextVersion.enterWindow(); assert.equal(nextAd.closed, 0); assert.equal(nextVersion.closed, 1);
    f.dispose();
    const nextShop = new windows.classes.ShopWindow(); nextShop.enterWindow(); assert.equal(nextShop.click(), 1);
    assert.equal(Object.hasOwn(windows.classes.VersionNoticeWindow.prototype, 'enterWindow'), false);
    assert.equal(Object.hasOwn(windows.classes.AdPushWindow.prototype, 'UpdateWindow'), false);
  } finally { f.dispose(); }
});

test('effects: ad entry borrowed by a sibling window retains its native behavior without filtering the sibling', () => {
  const f = setup(), windows = windowFixture();
  try {
    Object.entries(windows.classes).forEach(([name, type]) => f.classes.set(name, type));
    f.controller.setEnabled('ad', true);
    const shop = new windows.classes.ShopWindow();
    const borrowed = windows.classes.AdPushWindow.prototype.UpdateWindow;
    assert.equal(borrowed.call(shop, 'normal data'), 'updated'); assert.equal(shop.closed, 0);
  } finally { f.dispose(); }
});

test('effects: an already-open named ad is closed through its instance without touching its siblings', () => {
  const f = setup(), windows = windowFixture();
  try {
    const ad = new windows.classes.AdPushWindow(), shop = new windows.classes.ShopWindow();
    ad.enterWindow(); shop.enterWindow(); f.scene._children = [ad, shop];
    f.controller.setEnabled('ad', true);
    assert.equal(ad.closed, 1); assert.equal(shop.closed, 0); assert.equal(shop.click(), 1);
    f.controller.refresh(); assert.equal(ad.closed, 1); assert.equal(shop.closed, 0);
    assert.equal(Object.hasOwn(windows.BaseWindow.prototype, 'enterWindow'), true);
    assert.equal(Object.hasOwn(windows.classes.ShopWindow.prototype, 'enterWindow'), false);
  } finally { f.dispose(); }
});

test('effects: download entry hides the native cached visual, keeps sibling buttons and restores latest state', () => {
  const f = setup(), button = new NativeDraw(), shop = new NativeDraw(), vip = new NativeDraw();
  try {
    const widget = f.scene.hallleftDownBtn = { downloadBtn: button, shopBtn: shop, vipOpenTipBtn: vip,
      showDownloadWin() { return 'native-download'; }, recommendPos() { this.downloadBtn.visible = true; this.downloadBtn.alpha = 1; return 'positioned'; },
      showLimitBtn(show) { this.downloadBtn.visible = !show; return 'limit'; } };
    const original = widget.recommendPos;
    f.controller.setEnabled('download', true);
    assert.equal(button.visible, false); assert.equal(button._visible, false); assert.equal(button.renderedVisible, false);
    assert.equal(widget.recommendPos(), 'positioned'); assert.equal(button.renderedVisible, false);
    button.alpha = 0.25; button.alpha = 1; assert.equal(button.renderedVisible, false);
    assert.equal(shop.renderedVisible, true); assert.equal(vip.renderedVisible, true);
    f.controller.setEnabled('download', false);
    assert.equal(button.renderedVisible, true); assert.equal(widget.recommendPos, original);
    f.controller.setEnabled('download', true); widget.showLimitBtn(true);
    f.dispose(); assert.equal(button.renderedVisible, false);
  } finally { f.dispose(); }
});

test('effects: late download creation is hidden in the native addChild call and unrelated widgets stay unchanged', () => {
  const f = setup();
  try {
    const widget = f.scene.hallleftDownBtn = { showDownloadWin() {}, recommendPos() {},
      addChild(node) { this.child = node; return node; },
      showLimitBtn() { this.downloadBtn = new NativeDraw(); this.addChild(this.downloadBtn); this.downloadBtn.visible = true; return this.downloadBtn; } };
    const savedListener = widget.showLimitBtn;
    const foreign = { downloadBtn: new NativeDraw(), _children: [] }; f.scene._children = [foreign];
    f.controller.setEnabled('download', true);
    const created = savedListener.call(widget);
    assert.equal(created.renderedVisible, false); assert.equal(foreign.downloadBtn.renderedVisible, true);
    const unrelated = new NativeDraw(); widget.addChild(unrelated); assert.equal(unrelated.renderedVisible, true);
    f.dispose(); assert.equal(created.renderedVisible, true);
  } finally { f.dispose(); }
});

test('effects: boss arrival skips both shakes and finishes only its modal wait; disable restores native flow', () => {
  const f = setup();
  try {
    const boss = { visible: false, ShowBossIcon() { this.visible = true; } };
    const city = { currentBossCityItem: boss, IsBossShow: true, animations: 0, shakes: 0,
      ShowBossEffect() { this.animations++; },
      clearBossEffct() { boss.ShowBossIcon(); this.playShakeEffect(); this.playBGShakeEffect(); },
      playShakeEffect() { this.shakes++; }, playBGShakeEffect() { this.shakes++; } };
    class Transition {
      enterWindow(data) { this.parent = {}; this.initialized = false; this.SetData(data); this.initialized = true; return 42; }
      UpdateWindow(data) { this.SetData(data); }
      SetData(data) { this.blocked = true; this.timer = true; data.callback?.(); this.events = (this.events || 0) + 1; }
      ShowNext() { assert.equal(this.initialized, true); this.timer = false; this.blocked = false; this.finishes = (this.finishes || 0) + 1; this.parent = null; }
    }
    f.classes.set('RogueComChangeWindow', Transition); f.scene.cityView = city;
    f.controller.setEnabled('rogue', true);
    const win = new Transition();
    assert.equal(win.enterWindow({ onlyCallback: true, callback: () => city.ShowBossEffect() }), 42);
    assert.equal(city.animations, 0); assert.equal(boss.visible, true);
    assert.equal(win.blocked, false); assert.equal(win.timer, false); assert.equal(win.finishes, 1); assert.equal(win.events, 1);
    city.clearBossEffct(); assert.equal(city.shakes, 0);
    for (const data of [{ onlyCallback: true }, { onlyCallback: true, isFight: true, callback: () => city.ShowBossEffect() }]) {
      const other = new Transition(); other.enterWindow(data); assert.equal(other.blocked, true); assert.equal(other.finishes, undefined);
    }
    win.parent = {}; win.UpdateWindow({ onlyCallback: true, callback: () => city.ShowBossEffect() }); assert.equal(win.finishes, 2);
    f.controller.setEnabled('rogue', false);
    const normal = new Transition(); normal.enterWindow({ onlyCallback: true, callback: () => city.ShowBossEffect() });
    assert.equal(normal.blocked, true); assert.equal(city.animations, 1);
    city.clearBossEffct(); assert.equal(city.shakes, 2);
    f.controller.setEnabled('rogue', true); f.dispose(); city.ShowBossEffect(); assert.equal(city.animations, 2);
  } finally { f.dispose(); }
});


test('effects: ad group suppresses only notice contribution and restores current native state', () => {
  const f = setup();
  class Notice { get NoticeRed() { return this.unread; } }
  class Ad { get ShowNewAdNoticeRed() { return this.unread; } }
  const notice = new Notice(), ad = new Ad(); notice.unread = ad.unread = true;
  const menu = { values: new Map(), UpdateRedPoint(id, value) { this.values.set(id, value); } };
  const bar = { moreView: menu, other: false, checkMoreRed() {
    const value = notice.NoticeRed || ad.ShowNewAdNoticeRed;
    menu.UpdateRedPoint(10049, value); return value || this.other;
  }, moreUpdate() { this.dot = this.checkMoreRed(); } };
  f.scene._children = [notice, ad, bar]; bar.moreUpdate();
  try {
    f.controller.setEnabled('version', true);
    assert.equal(menu.values.get(10049), false); assert.equal(bar.dot, false);
    assert.equal(notice.unread, true); assert.equal(ad.unread, true);
    menu.UpdateRedPoint(10049, true); assert.equal(menu.values.get(10049), false);
    menu.UpdateRedPoint(10050, true); assert.equal(menu.values.get(10050), true);
    bar.other = true; bar.moreUpdate(); assert.equal(bar.dot, true);
    f.controller.setEnabled('version', false);
    assert.equal(menu.values.get(10049), true); assert.equal(notice.NoticeRed, true);
    f.controller.setEnabled('version', true); notice.unread = ad.unread = false; bar.other = false;
    f.dispose(); assert.equal(bar.dot, false); assert.equal(menu.values.get(10049), false);
  } finally { f.dispose(); }
});

test('effects: ads suppress locked tree only and restore native state', () => {
  const f = setup();
  class Welfare { get ShowKanshuRed() { return true; } }
  const welfare = new Welfare(), bless = { FreeBlessItemEnough: false };
  const hall = { checkKanShuTime() {}, checkKanShuRed() { this.red = welfare.ShowKanshuRed; } };
  f.classes.set('WelfareManger', { instance: welfare });
  f.classes.set('BlessManager', { instance: bless });
  f.scene._children = [hall];
  try {
    f.controller.setEnabled('ads', true);
    assert.equal(welfare.ShowKanshuRed, false); assert.equal(hall.red, false);
    bless.FreeBlessItemEnough = true; f.controller.refresh();
    assert.equal(welfare.ShowKanshuRed, true); assert.equal(hall.red, true);
    delete bless.FreeBlessItemEnough; f.controller.refresh();
    assert.equal(welfare.ShowKanshuRed, true);
    bless.FreeBlessItemEnough = false; f.controller.refresh();
    f.controller.setEnabled('ads', false);
    assert.equal(welfare.ShowKanshuRed, true); assert.equal(hall.red, true);
    f.controller.setEnabled('ads', true); f.dispose();
    assert.equal(welfare.ShowKanshuRed, true); assert.equal(hall.red, true);
    assert.equal(Object.hasOwn(welfare, 'ShowKanshuRed'), false);
  } finally { f.dispose(); }
});
