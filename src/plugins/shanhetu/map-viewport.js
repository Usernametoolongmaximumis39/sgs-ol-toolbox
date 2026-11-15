import { stableControlBounds } from './stable-control-bounds.js';
const finiteRect = r => r && [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
export function intersectRect(a,b) {
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
  return {x,y,w:Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h:Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y)};
}
function enclosing(points) {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
const corners = r => [[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]];

// localToGlobal stops at Laya.stage: its logical width alone does not describe
// the visible browser canvas (noborder, CSS scaling, clipping or page offsets).
export function visibleMapViewport(win, cityView, scene = cityView.parent) {
  const L=win.Laya,stage=L?.stage;
  if (!(stage?.width>0 && stage?.height>0)) return null;
  const toMap=(sprite,r)=>enclosing(corners(r).map(([x,y])=>
    cityView.globalToLocal(sprite.localToGlobal(new L.Point(x,y),true),true)));
  let viewport=toMap(stage,{x:8,y:8,w:stage.width-16,h:stage.height-16});
  // Port the old cheat sheet's qE map-space boundary, instead of treating the
  // entire Laya stage as the game map. Native RogueSmallMapScene positions
  // cityView at (gameWidth>>1, gameHeight>>1) and bottomView at (0,gameHeight).
  // Check that native shape before applying it to older/synthetic containers.
  const bottom=scene?.bottomView,cx=cityView.x,cy=cityView.y;
  if(scene?.cityView===cityView && cityView.parent===scene && bottom?.parent===scene
    && cx>0 && cy>0 && Math.abs(bottom.y-2*cy)<=1) {
    viewport=intersectRect(viewport,toMap(scene,{x:8,y:8,w:2*cx-16,h:bottom.y-16}));
    // Keep the progress band as a top boundary. Sparse hand/skill controls
    // constrain individual regions in mapControlRegions, not this full width.
    const bounds=part=>{
      if(!part || part.destroyed || part.visible===false || part.alpha===0)return null;
      const r=stableControlBounds(part);
      if(!(r?.width>0 && r.height>0) || typeof part.localToGlobal!=='function')return null;
      return toMap(part,{x:r.x,y:r.y,w:r.width,h:r.height});
    };
    const top=bounds(scene.topProcesserView);
    const y=Math.max(viewport.y,top?top.y+top.h+8:viewport.y);
    const end=viewport.y+viewport.h;
    viewport={...viewport,y,h:Math.max(0,end-y)};
  }
  // Every display-list ancestor may clip its children, not just cityView.
  for(let parent=cityView,depth=0;parent&&depth<64;parent=parent.parent,depth++) {
    const clip=parent.scrollRect;
    if(clip) viewport=intersectRect(viewport,toMap(parent,{x:clip.x,y:clip.y,w:clip.width,h:clip.height}));
    if(parent===stage)break;
  }
  const rendered=L.Render?.canvas,canvas=(rendered?.source ?? rendered)?.getBoundingClientRect
    ? (rendered.source ?? rendered) : win.document?.getElementById('layaCanvas');
  const rect=canvas?.getBoundingClientRect?.();
  if (rect && !(rect.width>0 && rect.height>0)) return null;
  if (rect?.width>0 && rect?.height>0 && canvas.width>0 && canvas.height>0 && win.innerWidth>0 && win.innerHeight>0) {
    let visible=intersectRect({x:rect.left,y:rect.top,w:rect.width,h:rect.height},
      {x:0,y:0,w:win.document?.documentElement?.clientWidth||win.innerWidth,h:win.innerHeight});
    const vv=win.visualViewport;
    if(vv?.width>0&&vv?.height>0)visible=intersectRect(visible,{x:vv.offsetLeft,y:vv.offsetTop,w:vv.width,h:vv.height});
    for(let parent=canvas.parentElement,depth=0;parent&&depth<32;parent=parent.parentElement,depth++) {
      const css=win.getComputedStyle?.(parent),r=parent.getBoundingClientRect();
      if(!css)continue;
      // Root overflow clips the viewport, not the root element's layout box.
      // When html has visible overflow on both axes, body overflow propagates
      // to that viewport too. Laya's absolute canvas leaves body height at 0.
      const doc=win.document,rootCSS=doc?.documentElement&&win.getComputedStyle?.(doc.documentElement);
      if(parent===doc?.documentElement || (parent===doc?.body
        && rootCSS?.overflowX==='visible' && rootCSS?.overflowY==='visible'))continue;
      const clipped=/^(hidden|clip|auto|scroll)$/;
      if(clipped.test(css.overflowX))visible=intersectRect(visible,{x:r.left,y:visible.y,w:r.width,h:visible.h});
      if(clipped.test(css.overflowY))visible=intersectRect(visible,{x:visible.x,y:r.top,w:visible.w,h:r.height});
    }
    // Margin in actual CSS pixels, before mapping back through retina/stage
    // scaling. Quarter-turn canvas rotation is used by Laya's screen adapter.
    visible={x:visible.x+8,y:visible.y+8,w:Math.max(0,visible.w-16),h:Math.max(0,visible.h-16)};
    const degree=((Number(stage.canvasDegree)||0)%360+360)%360;
    const clippedMap=enclosing(corners(visible).map(([x,y])=>{
      const u=(x-rect.left)/rect.width,v=(y-rect.top)/rect.height;
      const [cx,cy]=degree===90?[v,1-u]:degree===270?[1-v,u]:degree===180?[1-u,1-v]:[u,v];
      const point=new L.Point(cx*canvas.width,cy*canvas.height);
      stage.fromParentPoint?.(point);
      return cityView.globalToLocal(point,true);
    }));
    viewport=intersectRect(viewport,clippedMap);
  }
  return finiteRect(viewport)?viewport:null;
}
