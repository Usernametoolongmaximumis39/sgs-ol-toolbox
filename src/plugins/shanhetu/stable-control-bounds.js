// Native progress/market UI contains animated children. Its historical local
// envelope is stable through animation and map re-entry, while parent transforms
// are still projected afresh. Weak ownership avoids retaining destroyed scenes.
const envelopes = new WeakMap();
export function stableControlBounds(part) {
  const raw=part?.getSelfBounds?.() || {x:0,y:0,width:part?.width,height:part?.height};
  if (!raw || ![raw.x,raw.y,raw.width,raw.height].every(Number.isFinite) || raw.width<=0 || raw.height<=0) return raw;
  const size=[part.width,part.height].join(':'),old=envelopes.get(part);
  let bounds={x:raw.x,y:raw.y,width:raw.width,height:raw.height};
  if(old?.size===size) {
    const x=Math.min(bounds.x,old.bounds.x),y=Math.min(bounds.y,old.bounds.y);
    bounds={x,y,width:Math.max(bounds.x+bounds.width,old.bounds.x+old.bounds.width)-x,
      height:Math.max(bounds.y+bounds.height,old.bounds.y+old.bounds.height)-y};
  }
  envelopes.set(part,{size,bounds});return {...bounds};
}
