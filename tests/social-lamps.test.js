import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {ResourceScope} from '../src/core/resources.js';
import {createLampTracking,projectLamp} from '../src/plugins/social/lamps.js';
const wait=()=>new Promise(r=>setTimeout(r,15));
test('lamp tracking commits complete permanent snapshots, alerts once, preserves failed writes and isolates accounts',async t=>{
 const dom=new JSDOM('<canvas></canvas>'),scope=new ResourceScope(),stored=new Map(),handlers=new Map(),requests=[],errors=[];
 const self={ClientId:1000000001},data={pins:['1000000002'],friends:{1000000002:{name:'好友<甲>'}}};
 const m={ReqOtherbuygeneral(n){requests.push(n)}},proxy={on(e,c,f){handlers.set(e,f)},off(e){handlers.delete(e)}};
 let now=1000000,fail=false;const original=Date.now;Date.now=()=>now;
 t.after(()=>{Date.now=original;scope.dispose();dom.window.close()});
 const ctx={scope,document:dom.window.document,window:dom.window,game:{getSelf:()=>self,getClass:n=>n==='GeneralManager'?m:null,getServerProxy:()=>proxy,getConfigData:()=>({GameCharacters:{character:[{id:1,name:'周瑜',name_prefix:'谋'},{id:2,name:'曹操',name_prefix:'界'}]}})},storage:{get:k=>stored.get(k),set(k,v){if(fail)throw Error('disk full');stored.set(k,structuredClone(v))}},reportError:e=>errors.push(String(e))};
 const run=createLampTracking(ctx,{getRecord:()=>data});assert.equal(requests.length,1);
 const send=async(ids,end=true)=>{handlers.get('ClientSelfbuygeneralRep')({Protocol:{Type:1,Nickname:data.friends[1000000002].name,IsEnd:end,GeneralIDList:ids.map(ID=>({ID,EndTime:0,GoodsID:ID}))}});await wait()};
 await send([1],false);assert.equal(stored.size,0);await send([],true);assert.equal(stored.size,1);assert.equal(dom.window.document.querySelector('[data-social-lamps]'),null);
 now+=660001;run.tick();await send([1,2]);let banner=dom.window.document.querySelector('[data-social-lamps]');assert.match(banner.textContent,/氪了\[1\]个武将：界曹操/);assert.equal(banner.querySelector('甲'),null);
 now+=660001;run.tick();await send([1,2]);assert.equal(banner.children.length,1);
 assert.deepEqual(run.getRecords()['1000000002'].generals,[{id:1,name:'谋周瑜'},{id:2,name:'界曹操'}]);
 data.pins=[];const beforeUnpin=structuredClone(stored.get('lamps:1000000001')),requestCount=requests.length;
 now+=660001;run.tick();assert.equal(requests.length,requestCount);
 assert.deepEqual(stored.get('lamps:1000000001'),beforeUnpin);
 assert.equal(run.getRecords()['1000000002'].pinned,false);
 assert.equal(run.getRecords()['1000000002'].generals.length,2);
 // Reload from disk while unpinned: retain both IDs and full names even without config.
 const reloadScope=new ResourceScope(),reload=createLampTracking({...ctx,scope:reloadScope,game:{...ctx.game,getConfigData:()=>null,getServerProxy:()=>({on(){},off(){}})}},{getRecord:()=>data});
 assert.deepEqual(reload.getRecords()['1000000002'].generals,[{id:1,name:'谋周瑜'},{id:2,name:'界曹操'}]);reloadScope.dispose();
 data.pins=['1000000002'];
 banner.querySelector('button').click();assert.equal(dom.window.document.querySelector('[data-social-lamps]'),null);
 fail=true;now+=660001;run.tick();await send([1]);assert.deepEqual(stored.get('lamps:1000000001').friends[1000000002].ids,[1,2]);assert.match(errors.join(),/disk full/);
 fail=false;self.ClientId=1000000003;run.tick();await send([1,2]);assert.equal(dom.window.document.querySelector('[data-social-lamps]'),null);
 scope.dispose();assert.equal(handlers.size,0);
});
test('lamp projection rejects non-query and malformed rows and excludes trial ownership',()=>{
 const p={Type:1,Nickname:'甲',IsEnd:1,GeneralIDList:[{ID:1,GoodsID:1,EndTime:0},{ID:2,GoodsID:1,EndTime:50},{ID:3,GoodsID:0,EndTime:0}]};
 assert.deepEqual(projectLamp(p).ids,[1]);assert.equal(projectLamp({...p,Type:0}),null);assert.equal(projectLamp({...p,GeneralIDList:[{ID:4}]}),null);
});
