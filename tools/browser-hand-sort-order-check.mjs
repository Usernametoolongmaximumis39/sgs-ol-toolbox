import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const bundle = await build({stdin:{contents:"export { sortHand } from './src/plugins/cards/native.js'",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'SortCheck'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:400}});
 await page.setContent('<body style="margin:0;background:#172a24">');
 await page.addScriptTag({path:process.env.SGS_LAYA_CORE || path.join(os.homedir(),'AppData/Local/Temp/sgsres/game/laya.core.min.js')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  Laya.init(1000,400);Laya.stage.bgColor='#172a24';
  const hand=new Laya.Sprite();Laya.stage.addChild(hand);
  const cards=[{CardId:1,CardType:1,FlowerOnSeat:2,CardNumber:9},{CardId:2,CardType:2,FlowerOnSeat:3,CardNumber:3},{CardId:3,CardType:1,FlowerOnSeat:1,CardNumber:7},{CardId:4,CardType:2,FlowerOnSeat:4,CardNumber:2}];
  hand.cardUis=cards.map((Card,i)=>({Card,selected:i===1,enabled:i!==2,cmds:[],x:0,
   clear(full){if(full!==false)throw Error('destructive clear');const cmds=hand.graphics.cmds;for(const cmd of this.cmds){const index=cmds.indexOf(cmd);if(index>=0)cmds.splice(index,1);}this.cmds=[];},
   Draw(){const before=(hand.graphics.cmds||[]).length;hand.graphics.drawRect(this.x,this.selected?120:145,185,180,this.enabled?'#eee3cc':'#77746e','#bda060',2);hand.graphics.fillText(String(this.Card.CardId),this.x+12,this.selected?132:157,'28px Arial','#332819','left');this.cmds=(hand.graphics.cmds||[]).slice(before);},
  }));
  hand.seat={HandCards:cards.slice()};
  hand.invalidateLayoutHandCard=()=>{hand.cardUis.forEach((ui,i)=>{const next=65+i*135,delta=next-ui.x;ui.x=next;for(const cmd of ui.cmds)cmd.x+=delta;});hand.repaint();};
  hand.SortNormalCards=()=>{hand.cardUis.sort((a,b)=>a.Card.CardType-b.Card.CardType);for(const ui of hand.cardUis){ui.clear(false);ui.Draw(hand);}hand.invalidateLayoutHandCard();};
  for(const ui of hand.cardUis)ui.Draw(hand);hand.invalidateLayoutHandCard();
  const game={getSelfSeatUI:()=>({cardContainer:hand,sortCardBtn:{enabled:true}})},checks=[];
  for(const mode of ['type','suit','number','type','suit','number']){
   SortCheck.sortHand(game,mode);
   const cmds=hand.graphics.cmds,order=hand.cardUis.map(ui=>cmds.indexOf(ui.cmds[0]));
   if(!order.every((index,i)=>i===0||index>order[i-1]))throw Error('stale draw order: '+mode);
   checks.push({mode,order:hand.cardUis.map(ui=>ui.Card.CardId)});
  }
  const title=new Laya.Text();title.text='Sort basis switches · flat drawing order regression';title.color='#eee3cc';title.fontSize=22;title.pos(60,35);Laya.stage.addChild(title);
  await new Promise(resolve=>setTimeout(resolve,100));return checks;
 });
 assert.equal(result.length,6);await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/hand-sort-order.png'});
 await writeFile('test-results/hand-sort-order-report.json',JSON.stringify({scope:'cached Laya engine + simulated flat-card draw commands, not live game',checks:result},null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
