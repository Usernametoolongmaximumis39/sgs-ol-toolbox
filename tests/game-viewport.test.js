import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { createGameAdapter } from '../src/core/game.js';
import { createGameViewport } from '../src/ui/game-viewport.js';

test('fixed HUD reserves Laya screen pixels, follows resize and restores native layout', () => {
 const dom=new JSDOM('<div id="bgDiv" style="width:97% !important"></div><div id="layaContainer"></div>');
 const win=dom.window, scope=new ResourceScope(), calls=[];
 win.innerWidth=1000;win.innerHeight=700;
 const original=function(w,h){calls.push([w,h]);};
 win.Laya={Browser:{pixelRatio:2},stage:{setScreenSize:original}};
 const viewport=createGameViewport({window:win,document:win.document,scope});
 viewport.reserve(280);assert.deepEqual(calls.at(-1),[1440,1400]);
 assert.equal(win.document.getElementById('bgDiv').style.width,'720px');
 win.Laya.stage.setScreenSize(2000,1400);assert.deepEqual(calls.at(-1),[1440,1400]);
 win.innerWidth=1200;win.dispatchEvent(new win.Event('resize'));assert.deepEqual(calls.at(-1),[1840,1400]);
 viewport.reserve(420);assert.deepEqual(calls.at(-1),[1560,1400]);
 viewport.reserve(0);assert.equal(win.Laya.stage.setScreenSize,original);assert.deepEqual(calls.at(-1),[2400,1400]);
 assert.equal(win.document.getElementById('bgDiv').style.width,'97%');
 assert.equal(win.document.getElementById('bgDiv').style.getPropertyPriority('width'),'important');
 viewport.reserve(280);scope.dispose();assert.equal(win.Laya.stage.setScreenSize,original);assert.deepEqual(calls.at(-1),[2400,1400]);dom.window.close();
});

test('fixed HUD handles late and replaced stages without overwriting later wrappers', () => {
 const dom=new JSDOM('<div id="GameDiv"></div>'),win=dom.window,scope=new ResourceScope();
 const viewport=createGameViewport({window:win,document:win.document,scope});viewport.reserve(280);
 const calls=[],a={setScreenSize:(...args)=>calls.push(['a',...args])},b={setScreenSize:(...args)=>calls.push(['b',...args])};
 win.Laya={stage:a,Browser:{pixelRatio:1}};viewport.reserve(280);assert.equal(calls.at(-1)[0],'a');
 win.Laya.stage=b;viewport.reserve(280);assert.equal(calls.at(-1)[0],'b');
 const wrapper=b.setScreenSize,later=(...args)=>wrapper(...args);b.setScreenSize=later;
 scope.dispose();assert.equal(b.setScreenSize,later);assert.deepEqual(calls.at(-1),['b',win.innerWidth,win.innerHeight]);assert.doesNotThrow(()=>later(1024,768));dom.window.close();
});

test('official Browser.clientWidth and SystemContext share reserved width and getter restores exactly', () => {
 const dom=new JSDOM('<div id="layaContainer"></div>'),win=dom.window,scope=new ResourceScope();
 win.innerWidth=1400;const nativeGet=()=>win.innerWidth;const Browser={pixelRatio:1,clientHeight:850};
 Object.defineProperty(Browser,'clientWidth',{configurable:true,enumerable:false,get:nativeGet});
 const updates=[];win.Laya={Browser,stage:{setScreenSize(){}}};win.SystemContext={UpdateGameSize:(w,h)=>updates.push([w,h,Browser.clientWidth])};
 const viewport=createGameViewport({window:win,document:win.document,scope});
 viewport.reserve(280);assert.equal(Browser.clientWidth,1120);assert.deepEqual(updates.at(-1),[1120,850,1120]);
 win.innerWidth=1200;win.dispatchEvent(new win.Event('resize'));assert.equal(Browser.clientWidth,920);assert.deepEqual(updates.at(-1),[920,850,920]);
 viewport.reserve(0);assert.equal(Object.getOwnPropertyDescriptor(Browser,'clientWidth').get,nativeGet);assert.equal(Browser.clientWidth,1200);
 viewport.reserve(420);scope.dispose();assert.equal(Object.getOwnPropertyDescriptor(Browser,'clientWidth').get,nativeGet);assert.equal(Browser.clientWidth,1200);dom.window.close();
});

test('a saved fixed sidebar leaves login and unmounted scenes at the native width', () => {
 const dom = new JSDOM('<div id="bgDiv" style="width:100%"></div>'), win = dom.window, scope = new ResourceScope();
 try {
  win.innerWidth = 1400;
  const game = createGameAdapter(win);
  const viewport = createGameViewport({ window: win, document: win.document, scope, canReserve: game.canReserveViewport });
  const background = win.document.getElementById('bgDiv');
  viewport.reserve(280);
  assert.equal(background.style.width, '100%');
  const login = { SceneName: 'LoginScene', initialized: true };
  const hall = { SceneName: 'ModeScene', initialized: false };
  const layer = { name: 'SceneLayer', _children: [login] };
  const calls = [], original = (...args) => calls.push(args);
  const Browser = { get clientWidth() { return win.innerWidth; }, pixelRatio: 1 };
  const nativeWidth = Object.getOwnPropertyDescriptor(Browser, 'clientWidth').get;
  win.Laya = { Browser, stage: { _children: [layer], setScreenSize: original } };
  win.dispatchEvent(new win.Event('resize'));
  assert.equal(Browser.clientWidth, 1400);
  assert.equal(win.Laya.stage.setScreenSize, original);
  assert.equal(background.style.width, '100%');
  assert.deepEqual(calls, []);

  layer._children = [hall];
  win.dispatchEvent(new win.Event('resize'));
  assert.deepEqual(calls, []);
  hall.initialized = true;
  win.dispatchEvent(new win.Event('resize'));
  assert.equal(Browser.clientWidth, 1120);
  assert.equal(background.style.width, '1120px');
  assert.equal(background.style.getPropertyPriority('width'), 'important');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 1120);

  layer._children = [login];
  win.dispatchEvent(new win.Event('resize'));
  assert.equal(win.Laya.stage.setScreenSize, original);
  assert.equal(Object.getOwnPropertyDescriptor(Browser, 'clientWidth').get, nativeWidth);
  assert.equal(background.style.width, '100%');
  assert.equal(calls.at(-1)[0], 1400);
 } finally {
  scope.dispose();
  dom.window.close();
 }
});
