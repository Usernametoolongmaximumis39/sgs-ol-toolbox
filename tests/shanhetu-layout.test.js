import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLabelPosition, reflowLabelPositions, overlaps, inside, labelConnection, labelDistance } from '../src/plugins/shanhetu/label-layout.js';
const viewport = {x:0,y:0,w:1000,h:700}, anchor={x:400,y:330,w:120,h:90};

test('exact obstacle edges recover a valid slot narrower than the sampling step',()=>{
  const a={x:500,y:300,w:100,h:80},walls=[{x:0,y:0,w:276,h:700},{x:503,y:0,w:497,h:700}];
  const p=chooseLabelPosition(a,204,140,walls,viewport);
  assert.ok(p&&p.x>=284&&p.x<=291);assert.ok(walls.every(w=>!overlaps(p,w)));
});

test('an impossible complete plan never relaxes real buildings or character markers',()=>{
  const cards=[{id:1,anchor,variants:[{w:204,h:140},{w:240,h:140}]}];
  assert.equal(reflowLabelPositions(cards,viewport,[],[viewport],new Map(),[viewport]).size,0);
  // Decoration can relax independently, with all real objects still protected.
  const protectedBoxes=[anchor,{x:420,y:220,w:80,h:110},{x:140,y:330,w:220,h:200}];
  const p=reflowLabelPositions(cards,viewport,[],[viewport],new Map(),protectedBoxes)?.get(1);
  assert.ok(p);assert.ok(protectedBoxes.every(b=>!overlaps(p,b)));
});

test('crowded chapter reserves other cities and markers before relaxing any card',()=>{
  const cards=[[101,650,190,155],[102,875,510,221],[103,640,385,238]].map(([id,x,y,h])=>
    ({id,anchor:{x,y,w:130,h:80},variants:[{w:204,h},{w:240,h}]}));
  const buildings=cards.flatMap(({anchor:a})=>[{x:a.x-14,y:a.y,w:a.w+28,h:a.h+18},
    {x:a.x+a.w/2-32,y:a.y-64,w:64,h:64}]);
  buildings.push({x:810,y:310,w:130,h:90},{x:960,y:210,w:130,h:80});
  const v={x:8,y:8,w:1184,h:834},controls=[{x:0,y:0,w:1200,h:90},{x:950,y:700,w:250,h:150}];
  const plan=reflowLabelPositions(cards,v,controls,buildings);
  assert.equal(plan.size,3);
  for(const c of cards){
    const p=plan.get(c.id);
    assert.ok([...buildings,...controls,...[...plan].filter(([id])=>id!==c.id).map(([,p])=>p)].every(b=>!overlaps(p,b)));
    assert.ok(inside(p,v));
  }
  assert.deepEqual(reflowLabelPositions([...cards].reverse(),v,controls,buildings,plan),plan,'whole valid plan survives packet order changes');
  const bad=new Map(plan);bad.set(101,{...plan.get(101),x:650,y:385});
  const repaired=reflowLabelPositions(cards,v,controls,buildings,bad);
  assert.ok([...repaired.values()].every(p=>buildings.every(b=>!overlaps(p,b))),'a cached card over another city is not preserved');
});
test('whole-map reflow recovers the tall boss blocked by two earlier cards',()=>{
  const v={x:8,y:8,w:1184,h:834},controls=[{x:0,y:0,w:1200,h:90},{x:950,y:650,w:250,h:200}];
  const cards=[[899,282,170],[681,214,230],[636,591,290]].map(([x,y,h],id)=>({id,anchor:{x,y,w:130,h:80},variants:[{w:204,h},{w:240,h}]}));
  const buildings=cards.map(c=>c.anchor);
  // Recorded 0.1.19 placements left no sampled slot for the boss. Exact-edge
  // candidates may now recover one even before the whole-map solver runs.
  const greedy=[{x:695,y:372,w:204,h:170},{x:477,y:308,w:204,h:230}];
  for(const d of cards[2].variants){const p=chooseLabelPosition(cards[2].anchor,d.w,d.h,[...controls,...greedy],v);if(p)assert.ok([...controls,...greedy].every(o=>!overlaps(p,o)));}
  const plan=reflowLabelPositions(cards,v,controls,buildings);
  assert.equal(plan.size,3);
  for(const c of cards){
    const p=plan.get(c.id);
    assert.ok(inside(p,v));
    assert.equal(p.h,c.variants[p.variant].h,'never truncate information to fit');
    assert.ok([...controls,...[...plan].filter(([id])=>id!==c.id).map(([,q])=>q)].every(q=>!overlaps(p,q)));
  }
  assert.deepEqual(reflowLabelPositions([...cards].reverse(),v,controls,buildings),plan,'packet order does not change the plan');
  assert.equal(reflowLabelPositions(cards,v,[v],buildings).size,0,'cannot solve by covering controls');
});
test('edge nodes put labels toward the canvas centre, including offset viewports',()=>{
  for(const [dx,dy] of [[0,0],[-500,-350]]) for(const [x,y] of [[140,260],[740,260],[440,160],[440,480]]) {
    const v={...viewport,x:dx,y:dy},a={x:x+dx,y:y+dy,w:100,h:70};
    const p=chooseLabelPosition(a,204,140,[a],v);
    const ax=a.x+a.w/2,ay=a.y+a.h/2,cx=v.x+v.w/2,cy=v.y+v.h/2;
    assert.ok(p&&inside(p,v));assert.ok(!overlaps(p,a));
    assert.ok((p.x+p.w/2-ax)*(cx-ax)+(p.y+p.h/2-ay)*(cy-ay)>0,'label must face inward');
    assert.ok(Math.hypot(p.x+p.w/2-cx,p.y+p.h/2-cy)<Math.hypot(ax-cx,ay-cy),'label centre is nearer canvas centre');
  }
});
test('decoration cannot outweigh hard controls or visible bounds',()=>{
  const controls=[{x:0,y:0,w:1000,h:90},{x:0,y:600,w:1000,h:100}];
  assert.equal(chooseLabelPosition(anchor,204,260,[viewport],viewport),null);
  const p=chooseLabelPosition(anchor,204,260,controls,viewport,null,[viewport]);
  assert.ok(p&&inside(p,viewport));
  assert.ok(controls.every(o=>!overlaps(p,o)));
});
test('diagonal connector reaches the building centre instead of empty bounding-box corner', () => {
  const a={x:550,y:80,w:220,h:160}, card={x:220,y:310,w:335,h:275};
  assert.deepEqual(labelConnection(a,card),{start:{x:660,y:160},end:{x:555,y:310}});
});
test('valid saved map label position wins over a newly emptier location', () => {
  const previous={x:160,y:310,w:204,h:140};
  assert.deepEqual(chooseLabelPosition(anchor,204,140,[anchor],viewport,previous),previous);
});
test('search uses open space and avoids unrelated buildings and card rectangles', () => {
  const obstacles=[anchor,{x:140,y:310,w:220,h:200},{x:560,y:280,w:210,h:220}];
  const p=chooseLabelPosition(anchor,204,140,obstacles,viewport);
  assert.ok(p); assert.ok(inside(p,viewport)); assert.ok(obstacles.every(o=>!overlaps(p,o)));
});
test('safe distant cached slots are rejected to restore a nearby association', () => {
  const old={x:10,y:10,w:204,h:140};
  const p=chooseLabelPosition(anchor,204,140,[anchor],viewport,old);
  assert.notDeepEqual(p,old);assert.ok(inside(p,viewport));assert.ok(!overlaps(p,anchor));assert.ok(labelDistance(p,anchor)<=160);
});
test('a full card cannot overflow a narrow horizontal band when only a shorter card fits', () => {
  const a={x:400,y:300,w:100,h:80}, obstacles=[a,{x:0,y:0,w:1000,h:280},{x:0,y:400,w:1000,h:300}];
  assert.equal(chooseLabelPosition(a,204,140,obstacles,viewport),null);
  const p=chooseLabelPosition(a,176,80,obstacles,viewport);
  assert.ok(p&&inside(p,viewport));assert.ok(obstacles.every(o=>!overlaps(p,o)));
});
test('resize or a real obstacle can invalidate a previous map position; impossible space stays empty', () => {
  const old={x:770,y:500,w:204,h:140}, smaller={x:0,y:0,w:700,h:450};
  const p=chooseLabelPosition(anchor,204,140,[anchor],smaller,old);
  assert.ok(inside(p,smaller));assert.notDeepEqual(p,old);
  assert.equal(chooseLabelPosition(anchor,204,140,[viewport],viewport,old),null);
});

test('safe placements survive alternating nonblocking geometry',()=>{
 const cards=[{id:1,anchor:{x:300,y:180,w:80,h:60},variants:[{w:204,h:140},{w:240,h:120}]}];
 const previous=new Map([[1,{x:20,y:20,w:240,h:120,variant:1}]]);
 let plan=previous;
 for(let i=0;i<12;i++) {
  plan=reflowLabelPositions(cards,viewport,[],[cards[0].anchor,{x:800,y:500,w:40,h:40+i%2}],plan);
  assert.deepEqual(plan,previous);
 }
 const blocked=reflowLabelPositions(cards,viewport,[{x:20,y:20,w:240,h:120}],[],plan);
 assert.ok(!overlaps(blocked.get(1),previous.get(1)));
});

test('native refresh retains safe fallback beyond preferred distance across animation frames',()=>{
 const cards=[{id:1,anchor:{x:700,y:500,w:80,h:60},variants:[{w:204,h:140},{w:240,h:120}]}];
 const previous=new Map([[1,{x:20,y:20,w:240,h:120,variant:1}]]);
 let plan=previous;
 for(let frame=0;frame<24;frame++) {
  const buildings=[cards[0].anchor,{x:500,y:300,w:40,h:40+frame%2}];
  plan=reflowLabelPositions(cards,viewport,[],buildings,plan,buildings,true);
  assert.deepEqual(plan,previous);
 }
 const blocker={x:20,y:20,w:240,h:120};
 const repaired=reflowLabelPositions(cards,viewport,[blocker],[],plan,[],true);
 assert.ok(repaired.size===1&&!overlaps(repaired.get(1),blocker));
});
