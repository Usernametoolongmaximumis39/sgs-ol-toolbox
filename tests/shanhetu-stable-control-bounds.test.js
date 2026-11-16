import test from 'node:test';
import assert from 'node:assert/strict';
import {stableControlBounds} from '../src/plugins/shanhetu/stable-control-bounds.js';
test('progress animation cannot repeatedly shrink and expand the reserved control bounds',()=>{
 let raw={x:0,y:-4,width:821,height:123};
 const part={width:348,height:97,getSelfBounds:()=>raw};
 const envelope=stableControlBounds(part);
 for(let i=0;i<24;i++) {
  raw=i%2?{x:0,y:3,width:821,height:108}:{x:0,y:-4,width:821,height:123};
  assert.deepEqual(stableControlBounds(part),envelope);
 }
 part.width=400;raw={x:0,y:0,width:400,height:97};
 assert.deepEqual(stableControlBounds(part),raw,'a real control resize starts a new envelope');
});
