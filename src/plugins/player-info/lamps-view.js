import { ResourceScope } from '../../core/resources.js';
// Native sprites share the card's stage order: game windows naturally occlude them.
export function createLampStrip(ctx) {
  let artScope=new ResourceScope();ctx.scope.add(()=>artScope.dispose());
  let root = null, stamp = '', tooltip = null, masks = [], accessible = null, currentPosition;
  function hideTip() { tooltip?.remove(); tooltip = null; }
  function clearMasks() { for (const mask of masks) if (!mask.destroyed) mask.destroy(true); masks = []; }
  function remove() { artScope.dispose(); hideTip(); root?.destroy(true); clearMasks(); accessible?.remove(); accessible=null; root = null; stamp = ''; }
  function showTip(text, x, y) {
    hideTip(); const doc = ctx.document, win = ctx.window;
    tooltip = doc.createElement('div'); tooltip.setAttribute('role','tooltip'); tooltip.textContent = text;
    tooltip.style.cssText = 'position:fixed;z-index:2147483600;max-width:260px;padding:7px 10px;border:1px solid var(--sgs-border,#746342);border-radius:7px;background:var(--sgs-surface,#242722);color:var(--sgs-text,#f0e4cb);font:12px/1.7 sans-serif;pointer-events:none;box-shadow:0 4px 14px #0005';
    doc.body.append(tooltip);
    tooltip.style.left = Math.max(8,Math.min(x,win.innerWidth-tooltip.offsetWidth-8))+'px';
    tooltip.style.top = Math.max(8,Math.min(y+12,win.innerHeight-tooltip.offsetHeight-8))+'px';
  }
  return { remove, update(rows, position, L, parent) {
    if (!rows?.length || !L.Sprite?.prototype?.loadImage) { remove(); return; }
    currentPosition=position;
    if (!root || root.destroyed) { root = new L.Sprite(); root.name = 'sgs-player-lamps'; root.mouseEnabled = true; parent.addChild(root); }
    if (!accessible) {
      accessible=ctx.document.createElement('div');accessible.setAttribute('role','group');
      accessible.style.cssText='position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
      ctx.document.body.append(accessible);
    }
    accessible.setAttribute('aria-label',`${position.label || '玩家'}的将灯`);
    root.pos(10,position.height-94);
    const next = JSON.stringify([rows,position.width]); if (next === stamp) return;
    stamp = next; artScope.dispose();artScope=new ResourceScope();hideTip(); root.destroyChildren(); clearMasks(); accessible.replaceChildren();
    const groupCount=part=>part.reduce((n,r,i)=>n+(i>0&&part[i-1].status!==r.status?1:0),0);
    const size=Math.min(40,Math.floor((position.width-20-24-Math.max(groupCount(rows.slice(0,5)),groupCount(rows.slice(5,10)))*4)/5));
    let x=0,previous;
    for (const [index,row] of rows.entries()) {
      if(row.status==='unknown')continue;
      if(index%5===0){x=0;previous=null;}
      if(previous&&previous!==row.status)x+=4;previous=row.status;
      const item = new L.Sprite(); item.name = row.tip; item.mouseEnabled = true; item.size(size,size); item.pos(x,Math.floor(index/5)*(size+6)); root.addChild(item); x+=size+6;
      const face = new L.Sprite(); face.mouseEnabled=false;
      face.size(size,size*1.4); face.pos(0,-1);
      const urls=row.urls?.length?row.urls:row.url?[row.url]:[];
      function loadFace(index=0,attempt=0){
        if(!urls[index]||face.destroyed||artScope.signal.aborted)return;
        const local=artScope;let settled=false;
        const complete=texture=>{
          if(settled||local.signal.aborted||face.destroyed)return;settled=true;
          if(texture){face.texture=texture;face.size(size,size*1.4);}
          else local.timeout(()=>loadFace(attempt?index+1:index,attempt?0:1),1500);
        };
        if(L.loader?.load&&L.Handler?.create){
          L.loader.load(urls[index],L.Handler.create(null,complete),null,L.Loader?.IMAGE);
          local.timeout(()=>complete(null),5000);
        }else face.loadImage(urls[index]);
      }
      loadFace();
      const mask = new L.Sprite(); mask.graphics.drawCircle(size/2,size/2,size/2,'#fff');
      masks.push(mask);
      const crop = new L.Sprite(); crop.size(size,size); crop.addChild(face); crop.mask=mask; item.addChild(crop);
      if(row.status !== 'owned' && L.ColorFilter) { const filter=new L.ColorFilter(); filter.gray(); crop.filters=[filter]; }
      item.graphics.drawCircle(size/2,size/2,size/2,null,'#aa936666',1);
      if(row.status==='missing') {
        const cross = new L.Sprite(); cross.mouseEnabled=false; item.addChild(cross);
        cross.graphics.drawLine(4,4,size-5,size-5,'#ff5353',2); cross.graphics.drawLine(size-4,4,4,size-4,'#ff5353',2);
      } else if(row.status==='unknown') { const text=new L.Text();text.text='?';text.color='#ead9ae';text.bold=true;text.fontSize=size;text.size(size,size);text.align='center';item.addChild(text); }
      item.on(L.Event.MOUSE_OVER,item,() => { const rect=ctx.document.querySelector('canvas')?.getBoundingClientRect(); if(rect) showTip(row.tip,rect.left+L.stage.mouseX*rect.width/L.stage.width,rect.top+L.stage.mouseY*rect.height/L.stage.height); });
      item.on(L.Event.MOUSE_OUT,item,hideTip);
      const keyboard=ctx.document.createElement('button');keyboard.type='button';keyboard.textContent=row.tip;
      keyboard.onfocus=()=>{const r=ctx.document.querySelector('canvas')?.getBoundingClientRect(),p=currentPosition;if(r)showTip(row.tip,r.left+(p.x+10+item.x)*r.width/L.stage.width,r.top+(p.y+p.height-94+item.y)*r.height/L.stage.height);};
      keyboard.onblur=hideTip;keyboard.onkeydown=e=>{if(e.key==='Escape')hideTip();};accessible.append(keyboard);
      // Clicking/tapping also reveals the explanation on touch devices.
      item.on(L.Event.CLICK,item,() => { const rect=ctx.document.querySelector('canvas')?.getBoundingClientRect(); if(rect) showTip(row.tip,rect.left+L.stage.mouseX*rect.width/L.stage.width,rect.top+L.stage.mouseY*rect.height/L.stage.height); });
    }
  } };
}
