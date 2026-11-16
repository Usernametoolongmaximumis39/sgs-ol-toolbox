import test from 'node:test';
import assert from 'node:assert/strict';
import { sideOf, groupedStatistics } from '../src/plugins/appearances/groups.js';
import { nativeSide } from '../src/plugins/appearances/battle.js';

test('roles and actual play order are separated; raw seats never stand in for order',()=>{
  assert.deepEqual([1,3,0,null].map(figure=>sideOf({mode:35,figure})),['landlord','farmer','unknown','unknown']);
  assert.deepEqual([1,2,3,4].map(position=>sideOf({mode:26,position})),['first','second','second','first']);
  assert.deepEqual([1,2,3].map(position=>sideOf({mode:44,position})),['first','second','unknown']);
  assert.equal(sideOf({mode:26,seat:0}),'unknown');
  assert.equal(sideOf({mode:44,seat:1}),'unknown');
  assert.equal(sideOf({mode:26},{position:4}),'first');
  const ctx={game:{getClass:()=>({GetSeat:()=>({FixedViewId:4,Figure:3,ViewId:1})})}};
  assert.deepEqual(nativeSide(ctx,0),{position:4,figure:3});
  assert.deepEqual(nativeSide(ctx,null),{position:null,figure:null});
});

test('same general has independent mode/side denominators including legacy unknown and uncollected frames',()=>{
  const frames=[
    {id:'a',mode:35,figure:1,general:[1,2],selected:[1]},
    {id:'b',mode:35,figure:1,general:[2],selected:[2]},
    {id:'c',mode:35,figure:3,general:[1],selected:[1]},
    {id:'d',mode:26,position:4,general:[1],selected:[1]},
    {id:'e',mode:26,position:2,general:[1],selected:[1]},
    {id:'old',mode:26,seat:0,general:[1],selected:null},
    {id:'linked',mode:44,general:[1],selected:[1]},
  ];
  const battles=frames.filter(r=>r.id!=='old').map(r=>({...r,general:r.selected,result:r.id==='c'?1:0,...(r.id==='linked'?{position:2}:{})}));
  battles.push({id:'no-frame',mode:35,figure:1,general:[1],result:1});
  const stats=groupedStatistics(frames,battles,{1:'刘备',2:'关羽'}).filter(r=>r.id===1);
  assert.equal(stats.length,5);
  const lord=stats.find(r=>r.side==='landlord');
  assert.equal(lord.appear,1);assert.equal(lord.frameCount,2);assert.equal(lord.selectionRate,1);
  assert.equal(lord.played,2);assert.equal(lord.rate,.5);
  assert.equal(stats.find(r=>r.side==='farmer').rate,0);
  assert.equal(stats.some(r=>r.side==='unknown'),false);
  assert.equal(stats.find(r=>r.mode===44).side,'second');
});


test('unrestricted sides pool counts and denominators instead of averaging side win rates',()=>{
 const battles=[{id:'a',mode:26,position:1,general:[1],result:0},{id:'b',mode:26,position:2,general:[1],result:1},{id:'c',mode:26,position:3,general:[1],result:1}];
 const frames=battles.map(r=>({...r,selected:r.general}));
 const rows=groupedStatistics(frames,battles,{1:'刘备'},{combineSides:true});
 assert.equal(rows.length,1);assert.equal(rows[0].rate,1/3);assert.equal(rows[0].wins,1);assert.equal(rows[0].losses,2);assert.equal(rows[0].frameCount,3);assert.equal(rows[0].appear,3);assert.equal(rows[0].groupLabel,'排位赛 · 合计');
 assert.equal(groupedStatistics(frames,battles,{}).length,2);
});


test('four requested sorts honor both directions and unknown win rates remain last', async()=>{
 const {compareStats}=await import('../src/plugins/appearances/panel.js');
 for(const key of ['rate','wins','played','appear']){
  const rows=[{id:1,appear:1,[key]:1},{id:2,appear:2,[key]:3},{id:3,appear:3,[key]:2}];
  assert.deepEqual([...rows].sort((a,b)=>compareStats(a,b,key)).map(r=>r.id),[2,3,1]);
  assert.deepEqual([...rows].sort((a,b)=>compareStats(a,b,key,'asc')).map(r=>r.id),[1,3,2]);
 }
 for(const dir of ['asc','desc'])assert.equal([{id:1,appear:1,rate:null},{id:2,appear:1,rate:0}].sort((a,b)=>compareStats(a,b,'rate',dir))[1].rate,null);
});
