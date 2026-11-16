import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleMapViewport} from '../src/plugins/shanhetu/map-viewport.js';

function fixture({retina=1,rect={left:0,top:0,width:1200,height:850}}={}) {
  const stage={width:1200,height:850,localToGlobal:p=>p,fromParentPoint(p){p.x/=retina;p.y/=retina;return p;}};
  const canvas={width:1200*retina,height:850*retina,getBoundingClientRect:()=>rect};
  const city={parent:stage,localToGlobal:p=>p,globalToLocal:p=>p};
  const win={innerWidth:1200,innerHeight:850,Laya:{stage,Point:class{constructor(x,y){this.x=x;this.y=y;}},Render:{canvas}}};
  return {win,stage,city,canvas};
}
test('canvas CSS crop and retina scaling constrain the logical map to visible pixels',()=>{
  for(const retina of [1,2]){
    const {win,city}=fixture({retina,rect:{left:-200,top:-100,width:1600,height:1000}});
    const p=visibleMapViewport(win,city);
    assert.ok(Math.abs(p.x-156)<1e-6);assert.ok(Math.abs(p.y-91.8)<1e-6);
    assert.ok(Math.abs(p.w-888)<1e-6);assert.ok(Math.abs(p.h-708.9)<1e-6);
  }
});
test('parent display-list clips are intersected even when cityView itself does not clip',()=>{
  const {win,stage,city}=fixture();
  city.parent={parent:stage,localToGlobal:p=>p,scrollRect:{x:150,y:120,width:800,height:500}};
  assert.deepEqual(visibleMapViewport(win,city),{x:150,y:120,w:800,h:500});
  city.scrollRect={x:200,y:160,width:700,height:300};
  assert.deepEqual(visibleMapViewport(win,city),{x:200,y:160,w:700,h:300});
});
test('browser container clips and hidden canvases cannot yield offscreen placements',()=>{
  const {win,city,canvas}=fixture();
  canvas.parentElement={getBoundingClientRect:()=>({left:100,top:80,width:1000,height:700})};
  win.getComputedStyle=()=>({overflowX:'hidden',overflowY:'hidden'});
  assert.deepEqual(visibleMapViewport(win,city),{x:108,y:88,w:984,h:684});
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});
  assert.equal(visibleMapViewport(win,city),null);
});

test('body overflow propagated to the viewport does not clip to its empty layout box',()=>{
  const {win,city,canvas}=fixture();
  const html={getBoundingClientRect:()=>({left:0,top:0,width:1200,height:0})};
  const body={parentElement:html,getBoundingClientRect:()=>({left:0,top:0,width:1200,height:0})};
  win.document={body,documentElement:html};canvas.parentElement=body;
  win.getComputedStyle=n=>({overflowX:n===html?'visible':'hidden',overflowY:n===html?'visible':'hidden'});
  assert.deepEqual(visibleMapViewport(win,city),{x:8,y:8,w:1184,h:834});
  // A genuine empty child clip must still suppress labels.
  canvas.parentElement={parentElement:body,getBoundingClientRect:()=>({left:0,top:0,width:1200,height:0})};
  assert.equal(visibleMapViewport(win,city),null);
  // Body remains a regular clip when html owns the viewport overflow.
  canvas.parentElement=body;
  win.getComputedStyle=()=>({overflowX:'hidden',overflowY:'hidden'});
  assert.equal(visibleMapViewport(win,city),null);
});


test('native centred map uses game dimensions and top band, leaving sparse bottom controls to local obstacles',()=>{
  const {win,stage,city}=fixture();
  const scene={parent:stage,cityView:city,localToGlobal:p=>({x:p.x,y:p.y+70})};
  Object.assign(city,{parent:scene,x:600,y:375,globalToLocal:p=>({x:p.x-600,y:p.y-445})});
  scene.bottomView={parent:scene,y:750};
  scene.topProcesserView={width:500,height:70,localToGlobal:p=>({x:p.x+350,y:p.y+70})};
  scene.bottomView.skillItemSpr={width:260,height:95,localToGlobal:p=>({x:p.x+900,y:p.y+725})};
  const v=visibleMapViewport(win,city,scene);
  assert.deepEqual(v,{x:-592,y:-297,w:1184,h:664});
  scene.bottomView.skillItemSpr.visible=false;
  assert.equal(visibleMapViewport(win,city,scene).h,664);
  // Hidden tools do not change the accepted map frame.
  scene.topProcesserView.visible=false;
  assert.equal(visibleMapViewport(win,city,scene).y,-367);
});
