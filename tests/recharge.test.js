import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { md5Hex, qrData } from '../src/plugins/recharge/encoding.js';
import { buildPayload, paymentResult, validateCard, queryCards } from '../src/plugins/recharge/payment.js';
test('MD5 matches independent Node implementation including UTF8',()=>{for(const s of ['', 'abc', '昵称😀'])assert.equal(md5Hex(s),createHash('md5').update(s).digest('hex').toUpperCase());assert.match(qrData('https://qr.alipay.com/test'),/^data:image\/gif;base64,/);});
test('payload matches legacy signature and rejects invalid amount/identity',()=>{const p=buildPayload({account:'test',userId:'1234567890',nickname:'测试',yb:'3000'},1234);const {sign,...rest}=p;assert.equal(sign,createHash('md5').update(Object.keys(rest).sort().map(k=>k+'='+rest[k]).join('')+'IqCUMcHyvGTtw4ThpEky5jtjEl8PG0V5').digest('hex').toUpperCase());assert.equal(p.channel,'210000');for(const yb of [0,-1,1.5,'Infinity',10000000])assert.throws(()=>buildPayload({account:'test',userId:'1234567890',yb}));});
test('payment result validates success and address/data boundaries',()=>{assert.equal(paymentResult('alipay',{code:0,data:{code_url:'https://qr.alipay.com/test'}}).url,'https://qr.alipay.com/test');for(const code_url of ['javascript:alert(1)','https://alipay.com.evil.org/a','http://qr.alipay.com/a','https://u:p@qr.alipay.com/a'])assert.throws(()=>paymentResult('alipay',{code:0,data:{code_url}}));assert.throws(()=>paymentResult('wechat',{code:0,data:{code_url:'<svg>'}}));assert.throws(()=>paymentResult('alipay',{code:1,msg:'failure'}));});
test('legacy purchase requires exact fresh quote and explicit inactive state',()=>{const info={cards:[{cardType:2,cardId:12981201,payType:1,priceNum:1200}]},data={code:0,datas:[{type:2,bActive:false}]};assert.equal(validateCard(2,info,data).id,12981201);for(const bActive of [true,undefined,null])assert.throws(()=>validateCard(2,info,{code:0,datas:[{type:2,bActive}]}));assert.throws(()=>validateCard(3,info,data));info.cards[0].priceNum++;assert.throws(()=>validateCard(2,info,data));});
test('cancelled query removes both native event handlers',async()=>{const handlers=new Map(),proxy={on(e,c,f){handlers.set(e,f)},off(e){handlers.delete(e)}};const control=new AbortController();const promise=queryCards(proxy,{SendClientPrivilegeInfoReq(){},SendClientPrivilegeDataReq(){}},control.signal);assert.equal(handlers.size,2);control.abort();await assert.rejects(promise,/取消/);assert.equal(handlers.size,0);});

test('expiry reminders keep unknown distinct, deduplicate, reset account and release native listeners',async()=>{
 const {JSDOM}=await import('jsdom');const {ResourceScope}=await import('../src/core/resources.js');const {activate}=await import('../src/plugins/recharge/index.js');
 const dom=new JSDOM('<main></main>',{url:'https://web.sanguosha.com'}),scope=new ResourceScope(),handlers=new Map(),notes=[];let self={ClientId:1234567890};
 const proxy={_events:{},on(e,c,f){if(!handlers.has(e))handlers.set(e,[]);handlers.get(e).push({c,f});},off(e,c,f){handlers.set(e,(handlers.get(e)||[]).filter(x=>x.c!==c||x.f!==f));}};
 const send=rows=>handlers.get('ClientPrivilegeDataRep')?.forEach(x=>x.f({Protocol:{code:0,datas:rows}}));
 const values=new Map();let cleanup;activate({window:dom.window,document:dom.window.document,scope,settings:{get:(k,d)=>values.get(k)??d,set:(k,v)=>values.set(k,v)},notify:text=>notes.push(text),game:{getSelf:()=>self,getServerProxy:()=>proxy,getClass:()=>null},ui:{registerPanel(p){cleanup=p.render(dom.window.document.querySelector('main'));}}});
 send([{type:2,bActive:false}]);assert.equal(notes.length,0);
 const toggle=dom.window.document.querySelector('[aria-label="旧周卡到期提醒"]');assert.equal(toggle.checked,false);toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));
 send([{type:2}]);assert.equal(notes.length,0);send([{type:2,bActive:false}]);send([{type:2,bActive:false}]);assert.equal(notes.length,1);
 send([{type:2,bActive:true}]);send([{type:2,bActive:false}]);assert.equal(notes.length,2);
 self={ClientId:9876543210};send([{type:2,bActive:false}]);assert.equal(notes.length,2);
 cleanup();scope.dispose();assert.equal([...handlers.values()].flat().length,0);assert.equal(dom.window.document.querySelector('[data-sgs-recharge]'),null);dom.window.close();
});
import { isOfficialServer } from '../src/plugins/recharge/payment.js';
test('official host embedded in 4399 is rejected, including inaccessible top',()=>{
 const official={location:{href:'https://web.sanguosha.com/220/h5_2/index.php'}};official.top=official;assert.equal(isOfficialServer(official),true);
 assert.equal(isOfficialServer({...official,top:{location:{href:'https://game.4399iw2.com/yxsgs/'}}}),false);
 const cross={location:official.location,get top(){throw Error('cross origin')}};assert.equal(isOfficialServer(cross),false);
 assert.equal(isOfficialServer({location:{href:'https://web.sanguosha.com/game?client=4399'},top:official}),false);
});
