import assert from 'node:assert/strict';
import test from 'node:test';
import { mountPluginUI } from '../src/ui/plugin-ui.js';
import { validateCard, queryCards } from '../src/plugins/recharge/legacy-cards.js';
test('legacy purchase requires exact fresh quote and explicit inactive state',()=>{const info={cards:[{cardType:2,cardId:12981201,payType:1,priceNum:1200}]},data={code:0,datas:[{type:2,bActive:false}]};assert.equal(validateCard(2,info,data).id,12981201);for(const bActive of [true,undefined,null])assert.throws(()=>validateCard(2,info,{code:0,datas:[{type:2,bActive}]}));assert.throws(()=>validateCard(3,info,data));info.cards[0].priceNum++;assert.throws(()=>validateCard(2,info,data));});
test('cancelled query removes both native event handlers',async()=>{const handlers=new Map(),proxy={on(e,c,f){handlers.set(e,f)},off(e){handlers.delete(e)}};const control=new AbortController();const promise=queryCards(proxy,{SendClientPrivilegeInfoReq(){},SendClientPrivilegeDataReq(){}},control.signal);assert.equal(handlers.size,2);control.abort();await assert.rejects(promise,/取消/);assert.equal(handlers.size,0);});

test('expiry reminders keep unknown distinct, deduplicate, reset account and release native listeners',async()=>{
 const {JSDOM}=await import('jsdom');const {ResourceScope}=await import('../src/core/resources.js');const {activate}=await import('../src/plugins/recharge/index.js');
 const dom=new JSDOM('<main></main>',{url:'https://web.sanguosha.com'}),scope=new ResourceScope(),handlers=new Map(),notes=[];let self={ClientId:1234567890};
 const proxy={_events:{},on(e,c,f){if(!handlers.has(e))handlers.set(e,[]);handlers.get(e).push({c,f});},off(e,c,f){handlers.set(e,(handlers.get(e)||[]).filter(x=>x.c!==c||x.f!==f));}};
 const send=rows=>handlers.get('ClientPrivilegeDataRep')?.forEach(x=>x.f({Protocol:{code:0,datas:rows}}));
 const values=new Map();let cleanup;
 const ctx={window:dom.window,document:dom.window.document,scope,settings:{get:(k,d)=>values.get(k)??d,set:(k,v)=>values.set(k,v)},notify:text=>notes.push(text),game:{getSelf:()=>self,getServerProxy:()=>proxy,getClass:()=>null}};
 ctx.ui={...mountPluginUI(ctx,()=>ctx),registerPanel(p){cleanup=p.render(dom.window.document.querySelector('main'));}};activate(ctx);
 send([{type:2,bActive:false}]);assert.equal(notes.length,0);
 const toggle=dom.window.document.querySelector('[aria-label="旧周卡到期提醒"]');assert.equal(toggle.checked,false);toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));
 send([{type:2}]);assert.equal(notes.length,0);send([{type:2,bActive:false}]);send([{type:2,bActive:false}]);assert.equal(notes.length,1);
 send([{type:2,bActive:true}]);send([{type:2,bActive:false}]);assert.equal(notes.length,2);
 self={ClientId:9876543210};send([{type:2,bActive:false}]);assert.equal(notes.length,2);
 cleanup();scope.dispose();assert.equal([...handlers.values()].flat().length,0);assert.equal(dom.window.document.querySelector('[data-sgs-recharge]'),null);dom.window.close();
});
