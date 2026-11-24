import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createMarketServer} from './market-server.mjs';
const market=await createMarketServer({rootDir:'release/market',port:0});
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('test-results',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${market.url}/dev/index.html`);
 await page.waitForFunction(()=>window[Symbol.for('sgs.ol.toolbox.core')]?.manager?.slots.get('cards')?.active);
 // The demo starts its initial deal 500ms after load; finish that setup before
 // replacing seats, otherwise its delayed new-game packet clears this fixture.
 await page.waitForFunction(()=>document.querySelector('#event-log')?.textContent.includes('MsgGamePlayCardNtf'));
 await page.evaluate(()=>{
  const api=window[Symbol.for('sgs.ol.toolbox.core')],demo=window.__SGS_TOOLBOX_DEMO__;
  const nativeSeats=demo.scene.seatContainer.seatUIs;
  const seats=[1,2,3].map((id,i)=>({seatID:6-i,seatAvatar:nativeSeats[i].seatAvatar,
   seat:{Index:id,FixedViewId:i+1,IsFull:true,HandCount:[1,2,1][i],HandShowCardIDs:[]}}));
  seats[0].seat.HandCards=[1];seats[0].cardContainer={seat:seats[0].seat,cardUis:[]};
  seats.push({seat:{Index:6,FixedViewId:7,IsFull:false,HandShowCardIDs:[2,3,4]}});
  demo.scene.SelfSeatUi=seats[0];demo.scene.seatContainer.seatUIs=seats;
  const portraits=document.querySelectorAll('.players .player');
  portraits[0].lastChild.textContent='手牌 2';portraits[1].lastChild.textContent='手牌 1';
  api.journal.push('MsgGamePlayCardNtf',{CardList:[1,2,3,4,5,6]});
  const move=(from,to,ids,count)=>api.journal.push('PubGsCMoveCard',{FromID:from,FromZone:from===255?1:5,ToID:to,ToZone:5,CardIDs:ids,CardCount:count,MoveType:1});
  move(255,1,[1],1);move(255,2,[2,3,4],3);move(2,3,[],1);
  api.journal.push('toolbox:snapshot',api.game.getSnapshot());
 });
 const host=page.locator('[data-sgs-toolbox="core"]');
 await page.waitForFunction(()=>window[Symbol.for('sgs.ol.toolbox.core')].manager.slots.get('cards').state.seats[3]?.position===3);
 await host.locator('.sgs-card-seat-heading').first().waitFor({state:'visible'});
 assert.deepEqual(await host.locator('.sgs-card-seat-heading').allTextContents(),['2号位','3号位']);
 assert.equal(await host.locator('.sgs-card-seat-row').count(),2);
 const summary=host.locator('.sgs-card-possibilities summary').first();
 await summary.focus();await page.keyboard.press('Enter');
 assert.equal(await host.locator('.sgs-card-possibilities').first().getAttribute('open'),'');
 assert.equal(await host.locator('.sgs-card-possibilities').first().locator('.sgs-card-mini').count(),3);
 await page.evaluate(()=>{
  const api=window[Symbol.for('sgs.ol.toolbox.core')];
  api.themes.register({id:'fixture.paper',name:'纸色演练',tokens:{bg:'#f3eee4',surface:'#fffaf0',raised:'#e9dfcb',text:'#332b22',muted:'#6f6049',accent:'#866027',border:'#c7bba4',scheme:'light'}},'fixture');
  document.querySelector('[data-sgs-cards-overlay]').style.visibility='hidden';
 });
 for(const width of [248,280,420]) for(const light of [false,true]) {
  await host.evaluate((h,{width,light})=>{
   window[Symbol.for('sgs.ol.toolbox.core')].themes.select(light?'fixture.paper':'core.black-gold');
   h.style.width=width+'px';h.shadowRoot.querySelector('.shell').style.width=width+'px';
  },{width,light});
  await page.waitForFunction(()=>{
   const row=document.querySelector('[data-sgs-toolbox="core"]')?.shadowRoot.querySelector('.sgs-card-seat-row');
   if(!row)return false;
   row.scrollIntoView({block:'center'});return true;
  });
  await host.screenshot({path:`test-results/card-seat-${width}-${light?'light':'dark'}.png`});
  for(const row of await host.locator('.sgs-card-seat-heading').evaluateAll(nodes=>nodes.map(n=>({w:n.clientWidth,scroll:n.scrollWidth})))) assert.ok(row.scroll<=row.w+1);
 }
 await page.setViewportSize({width:760,height:460});
 await host.locator('.sgs-card-settings summary').click();
 const size = host.getByRole('group',{name:'明牌大小'});
 const seven = size.getByRole('button',{name:'每行 7 张'});
 const eight = size.getByRole('button',{name:'每行 8 张'});
 assert.equal(await seven.getAttribute('aria-pressed'),'true');
 await eight.focus();
 await page.keyboard.press('Space');
 assert.equal(await eight.getAttribute('aria-pressed'),'true');
 await seven.click();
 for(const width of [248,280,420]) for(const light of [false,true]) for(const font of [-2,-1,0,2]){
  await host.evaluate((h,{width,light,font})=>{
   window[Symbol.for('sgs.ol.toolbox.core')].themes.select(light?'fixture.paper':'core.black-gold');
   h.style.setProperty('--sgs-font-offset',font+'px');
   h.style.width=width+'px';h.shadowRoot.querySelector('.shell').style.width=width+'px';
  },{width,light,font});
  const layout=await host.evaluate(host=>{
   const root=host.shadowRoot, disclosure=root.querySelector('.sgs-card-settings');
   disclosure.open=true;
   const group=disclosure.querySelector('[aria-label="明牌大小"]'), row=group.parentElement;
   row.scrollIntoView({block:'center'});
   const panel=root.querySelector('.shell').getBoundingClientRect(), hostBounds=host.getBoundingClientRect();
   const bounds=row.getBoundingClientRect(), label=row.firstElementChild;
   const choices=[...group.children].map(button=>button.getBoundingClientRect());
   const labelBounds=label.getBoundingClientRect();
   return {width:panel.width, fits:panel.left>=hostBounds.left-.5&&panel.right<=hostBounds.right+.5,
    font:parseFloat(getComputedStyle(label).fontSize), scroll:row.scrollWidth<=row.clientWidth+1,
    singleRow:choices[0].top<labelBounds.bottom&&labelBounds.top<choices[0].bottom,
    buttons:choices.every(r=>r.width>=24&&r.height>=24&&r.top===choices[0].top&&r.right<=bounds.right+.5)};
  });
  assert.equal(layout.width,width);
  assert.equal(layout.font,12+font);
  assert.ok(layout.fits&&layout.scroll&&layout.buttons&&layout.singleRow,JSON.stringify({width,light,font,layout}));
  if(font===2) await host.screenshot({path:`test-results/card-reveal-settings-${width}-${light?'light':'dark'}.png`});
 }
 await page.setViewportSize({width:1100,height:850});
 await host.evaluate(h=>{
  window[Symbol.for('sgs.ol.toolbox.core')].themes.select('core.black-gold');
  h.style.width='280px';h.style.removeProperty('--sgs-font-offset');
  h.shadowRoot.querySelector('.shell').style.width='280px';
  h.shadowRoot.querySelector('.sgs-card-settings').open=false;
  document.querySelector('[data-sgs-cards-overlay]').style.removeProperty('visibility');
 });
 const overlay=page.locator('[data-sgs-cards-overlay]');
 const seatTwo=overlay.locator('.sgs-card-seat-reveal[data-seat-id="2"]');
 const seatThree=overlay.locator('.sgs-card-seat-reveal[data-seat-id="3"]');
 await seatTwo.locator('.is-possible[data-card-id="3"]').waitFor();
 await seatThree.locator('.is-possible[data-card-id="3"]').waitFor();
 await host.locator('.sgs-card-seat-heading').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{
  const root=document.querySelector('[data-sgs-cards-overlay]').shadowRoot;
  return [...document.querySelectorAll('.players .player')].every((portrait,index)=>{
   const box=root.querySelector(`[data-seat-id="${index+2}"]`)?.getBoundingClientRect();
   const bounds=portrait.getBoundingClientRect();
   return box&&Math.abs(box.top-bounds.bottom)<1&&Math.abs(box.left-bounds.left)<20;
  });
 });
 await page.screenshot({path:'test-results/card-last-hand-before.png'});
 await page.evaluate(()=>{
  const api=window[Symbol.for('sgs.ol.toolbox.core')],demo=window.__SGS_TOOLBOX_DEMO__;
  demo.scene.seatContainer.seatUIs[2].seat.HandCount=0;
  document.querySelectorAll('.players .player')[1].lastChild.textContent='手牌 0';
  api.journal.push('PubGsCMoveCard',{FromID:3,FromZone:5,ToID:255,ToZone:2,CardIDs:[2],CardCount:1,MoveType:2});
 });
 await seatThree.waitFor({state:'detached'});
 await seatTwo.locator('[data-card-id="3"]:not(.is-possible)').waitFor();
 assert.equal(await host.locator('.sgs-card-seat-row').count(),0);
 await page.screenshot({path:'test-results/card-last-hand-after.png'});

 assert.deepEqual(errors,[]);
 console.log('Three-player browser fixture: native positions 2/3 and last-card loss synchronized across portraits and hand inference. Reveal size keyboard and layout passed at 248/280/420px in both themes and all four font sizes.');
} finally {await browser.close();await market.close();}
