import { getNativeTheme } from '../../ui/native-theme.js';
import { labelLines } from './presentation.js';
import { reflowLabelPositions, labelConnection } from './label-layout.js';
import { createRewardTextureResolver } from './native-assets.js';
import { currencyTokens } from './reward-tokens.js';
import { collectMapGeometry } from './map-geometry.js';
const read = fn => { try { return fn(); } catch { return null; } };
const round = (g, w, h, fill, stroke) => g.drawPath(0, 0,
  [['moveTo', 5, 0], ['lineTo', w - 5, 0], ['arcTo', w, 0, w, 5, 5], ['lineTo', w, h - 5], ['arcTo', w, h, w - 5, h, 5],
    ['lineTo', 5, h], ['arcTo', 0, h, 0, h - 5, 5], ['lineTo', 0, 5], ['arcTo', 0, 0, 5, 0, 5], ['closePath']],
  fill ? { fillStyle: fill } : null, stroke ? { strokeStyle: stroke, lineWidth: .7 } : null);

export function createMapLabels(ctx) {
  const theme = getNativeTheme(ctx);
  const rewardTexture = createRewardTextureResolver(ctx);
  let root, owner, signature = '', releaseTheme, drawings = [], positions = new Map();
  const savedLayouts = new Map();
  let mapKey = '';
  const traceKey=Symbol.for('sgs.ol.toolbox.shanhe.layout'), trace={entries:[]};
  ctx.window[traceKey]=trace;
  ctx.scope.add(()=>{if(ctx.window[traceKey]===trace)delete ctx.window[traceKey];});
  const record=entry=>{trace.entries.push({at:Date.now(),...entry});if(trace.entries.length>32)trace.entries.shift();};
  function clear(keepPositions = false) { if(root)record({kind:'detach',keepPositions,mapKey}); releaseTheme?.(); releaseTheme = null; root?.removeSelf?.(); root?.destroy?.(true); root = owner = null; signature = ''; drawings = []; if (!keepPositions) { positions = new Map(); savedLayouts.clear(); mapKey = ''; } }
  ctx.scope.add(clear);
  function paint(p = theme.palette) {
    if (!root || root.destroyed) return;
    root.graphics.clear();
    for (const d of drawings) {
      const { a, pos, backdrop, frame, texts, separator } = d;
      const { start, end } = labelConnection(a, pos);
      root.graphics.drawLine(start.x, start.y, end.x, end.y, p.accentSoft, 1);
      root.graphics.drawCircle(start.x, start.y, 2, p.accent);
      root.graphics.drawCircle(end.x, end.y, 1.7, p.accent);
      backdrop.graphics.clear(); round(backdrop.graphics, pos.w, pos.h, p.bg, null); backdrop.alpha = .82;
      frame.graphics.clear(); round(frame.graphics, pos.w, pos.h, null, p.border);
      if (a.node.current) frame.graphics.drawLine(12, 0, 42, 0, p.accent, 2);
      if (separator) frame.graphics.drawLine(12, separator, pos.w - 12, separator, p.borderSoft, .7);
      for (const t of texts) t.color = t.name === 'warning' ? p.danger : t.name === 'title' || t.name === 'reward' ? p.accent : t.name === 'name' ? p.text : p.muted;
    }
  }
  function update(scene, nodes, enabled) {
    const L = ctx.window.Laya, cityView = read(() => scene.cityView);
    if (!enabled || scene?.SceneName !== 'RogueSmallMapScene' || !cityView || cityView.destroyed || !L?.Sprite || !L?.Text) { clear(true); return; }
    const geometry = collectMapGeometry(ctx, scene, nodes);
    if (!geometry?.viewport) { clear(true); return; }
    const { anchors, buildings, protectedBuildings, controls, viewport } = geometry;
    // Scene transitions and partial entry snapshots detach drawings, but must
    // not discard the last arrangement for this map. Store geometry only.
    if (!anchors.length) { clear(true); return; }
    const nextMapKey = JSON.stringify(anchors.map(a=>a.node.id).sort((a,b)=>String(a).localeCompare(String(b))));
    if (nextMapKey !== mapKey) { mapKey = nextMapKey; positions = savedLayouts.get(mapKey) || new Map(); }
    const textures = new Map();
    for (const a of anchors) for (const line of labelLines(a.node)) for (const token of [...(line.tokens || []),...(line.inlineTokens || []),...currencyTokens(line.text)])
      if (token.icon && !textures.has(token.icon)) textures.set(token.icon, rewardTexture(L, token.icon));
    const next = JSON.stringify([anchors, buildings, protectedBuildings, controls, viewport, [...textures].map(([name,t])=>[name,!!t])]);
    if (owner === cityView && signature === next && root?.parent === owner) return;
    clear(true); owner = cityView; signature = next;
    root = new L.Sprite(); root.name = 'sgs-toolbox-shanhe-labels'; root.mouseEnabled = false; root.mouseThrough = true; root.zOrder = 997; owner.addChild(root);

    const create = (a, compact) => {
      const w = compact ? 240 : 204, label = new L.Sprite(), backdrop = new L.Sprite(), frame = new L.Sprite(), texts = [];
      label.name = 'shanhe-node-' + a.node.id; label.mouseEnabled = backdrop.mouseEnabled = frame.mouseEnabled = false;
      label.addChild(backdrop); label.addChild(frame); let y = compact ? 8 : 10, separator = 0;
      const addInline = (tokens, kind = 'option') => {
        let x = 12, rowY = y, rowHeight = 20;
        for (const token of tokens.flatMap(t=>t.icon || t.breakBefore ? [t] : currencyTokens(t.text))) {
          if (token.breakBefore && x > 12) { x=12;rowY+=rowHeight;rowHeight=20; }
          const texture = textures.get(token.icon), iconSize = 19, iconWidth = texture ? iconSize + 2 : 0;
          const t = new L.Text(); t.name = token.warning ? 'warning' : kind; t.bold = !!token.warning; t.text = texture ? token.text : token.fallback ?? token.text;
          t.font = 'Microsoft YaHei'; t.fontSize = 12; t.leading = 3;
          const natural = t.textWidth, width = Math.min(w - 24,iconWidth + natural);
          if (x > 12 && x + width > w - 12) { x = 12; rowY += rowHeight; rowHeight = 20; }
          if (texture) {
            const icon = new L.Sprite(); icon.name = 'reward-icon'; icon.mouseEnabled = false;
            const scale = Math.min(iconSize / texture.width,iconSize / texture.height);
            icon.graphics.drawTexture(texture,x,rowY,texture.width*scale,texture.height*scale);label.addChild(icon);
          }
          t.width = Math.min(natural,w - 24 - iconWidth); t.wordWrap = true; t.height = t.textHeight || 16;
          t.pos(x+iconWidth,rowY+2); t.mouseEnabled = false;label.addChild(t);texts.push(t);
          rowHeight = Math.max(rowHeight,t.height+4); x += width;
        }
        y = rowY + rowHeight + 3;
        return {textWidth:x-12,textHeight:y-rowY};
      };
      const add = (text, kind) => {
        const tokens = currencyTokens(text);
        if (tokens.some(t=>t.icon)) return addInline(tokens,kind);
        const t = new L.Text(); t.name = kind; t.text = text; t.font = 'Microsoft YaHei'; t.fontSize = kind === 'title' ? 16 : kind === 'name' ? 14 : 12;
        t.bold = kind === 'title' || kind === 'warning'; t.leading = 3; t.width = w - 24; t.wordWrap = true; t.overflow = 'hidden';
        t.height = t.textHeight || 20; t.pos(12, y); t.mouseEnabled = false;
        y += t.height + (kind === 'title' || kind === 'option' ? compact ? 4 : 6 : kind === 'stats' || kind === 'reward' ? compact ? 2 : 3 : 2); label.addChild(t); texts.push(t); return t;
      };
      const addName = line => {
        const top = y, name = add(line.text, 'name');
        let x = 12 + name.textWidth + 7, rowY = top;
        if (name.textHeight > 20) { x = 12; rowY = y; }
        for (const value of line.warnings || []) {
          const t = new L.Text(); t.name = 'warning'; t.text = value; t.font = 'Microsoft YaHei'; t.fontSize = 12; t.bold = true;
          const width = t.textWidth;
          if (x + width > w - 12) { x = 12; rowY += 18; }
          t.pos(x, rowY + 1); t.size(width, 17); t.mouseEnabled = false; label.addChild(t); texts.push(t); x += width + 6;
        }
        y = Math.max(y, rowY + 20);
      };
      const addRewards = tokens => {
        // Keep compensation next to its owning reward; never turn it into an
        // unconditional coin reward or mix it with the next reward's amount.
        let row = [];
        for (const token of tokens) {
          if (row.length) row.push({text:'   '});
          row.push({...token,fallback:token.labelFallback||token.fallback});
          if (token.abandonMoney > 0) {
            // The compensation belongs to this reward alone, so give that
            // reward its own row if earlier rewards were already collected.
            const previous = row.slice(0,-2);
            if (previous.length) addInline(previous,'reward');
            addInline([{...token,fallback:token.labelFallback||token.fallback}],'reward');
            addInline(currencyTokens(`  可弃换 ${token.abandonMoney}铜钱`),'reward'); row=[];
          }
        }
        if (row.length) addInline(row,'reward');
      };
      add(a.node.name + (a.node.finished ? ' · 已完成' : ''), 'title');
      for (const line of labelLines(a.node, compact)) {
        if (line.kind === 'reward' && !separator) { separator = y + 1; y += compact ? 8 : 10; }
        if (line.kind === 'name') addName(line);
        else if (line.inlineTokens) addInline(line.inlineTokens,'option');
        else if (line.tokens) addRewards(line.tokens);
        else add(line.text, line.kind);
      }
      // The wider variant trims padding only; every enemy, warning and reward
      // keeps its original text and font size even when the nearby gap is tight.
      const height = y + (compact ? 4 : 6); label.size(w, height); return { label, backdrop, frame, texts, separator, w, h: height };
    };
    const cards=anchors.map(a=>({id:a.node.id,anchor:a,variants:[create(a,false),create(a,true)]}));
    // Revalidate saved positions against current geometry instead of discarding
    // every card when a native animated footprint changes. A valid fallback
    // beyond the preferred distance must also survive: otherwise the planner
    // rejects its own fallback on the next native geometry update.
    const before=[...positions];
    const plan=reflowLabelPositions(cards,viewport,controls,buildings,positions,protectedBuildings,true);
    if(JSON.stringify(before)!==JSON.stringify([...plan]))record({kind:'layout',mapKey,anchors:cards.map(c=>({id:c.id,x:c.anchor.x,y:c.anchor.y,w:c.anchor.w,h:c.anchor.h,variants:c.variants.map(v=>({w:v.w,h:v.h}))})),viewport,controls,buildings:protectedBuildings,before,after:[...plan]});
    const nextPositions=new Map();
    for (const card of cards) {
      const pos=plan.get(card.id);
      card.variants.forEach((d,i)=>{if(!pos||i!==pos.variant)d.label.destroy(true);});
      if(!pos)continue;
      const chosen=card.variants[pos.variant];
      nextPositions.set(card.id,pos);
      chosen.label.pos(pos.x,pos.y);root.addChild(chosen.label);
      drawings.push({a:card.anchor,pos,...chosen});
    }
    // An incomplete loading frame must not erase positions of absent cards.
    if (nextPositions.size) {
      positions = nextPositions;
      savedLayouts.delete(mapKey); savedLayouts.set(mapKey, positions);
      while (savedLayouts.size > 4) savedLayouts.delete(savedLayouts.keys().next().value);
    }
    releaseTheme = theme.watch(paint, { target: root });
  }
  return { update, clear };
}
