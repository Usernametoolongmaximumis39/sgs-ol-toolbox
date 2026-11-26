const footerHeight = 24;
const css = `
:host{position:fixed;inset:0;z-index:2147483600;pointer-events:none;color:var(--sh-text);font:12px/1.5 "Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
section,.marker{position:absolute;transform-origin:top left}
button{appearance:none;border:0;border-radius:4px;padding:0;background:transparent;color:var(--sh-muted);font:inherit;cursor:pointer;pointer-events:auto}
button:hover,button:focus-visible{background:var(--sh-raised);color:var(--sh-accent)}
button:focus-visible{outline:1px solid var(--sh-accent);outline-offset:-2px}
.marker{border:1px solid var(--sh-border);border-radius:6px;background:var(--sh-surface);font-weight:bold;letter-spacing:.08em;color:var(--sh-accent)}
.close,.step{width:32px;height:100%;flex:none;display:grid;place-items:center}
.close{font-size:16px}
.step::before{content:'';width:6px;height:6px;border-top:1px solid currentColor;border-right:1px solid currentColor;transform:rotate(45deg)}
.step[data-action=previous]::before{transform:rotate(-135deg)}
.body{position:absolute;left:0;right:0;overflow:hidden}
.body[data-scrollable]{pointer-events:auto;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}
.body::-webkit-scrollbar{display:none}
.body:focus{outline:none}
.body:focus-visible{box-shadow:inset -1px 0 var(--sh-border)}
.summary{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:pre}
.nav{position:absolute;left:7px;right:7px;bottom:0;display:flex;align-items:center;justify-content:flex-end;gap:4px;color:var(--sh-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.nav span{flex:1;text-align:center}
`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const right = r => r.x + r.w;
const bottom = r => r.y + r.h;
export const intersects = (a, b) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
const contains = (r, x, y) => x >= r.x && x <= right(r) && y >= r.y && y <= bottom(r);

function markerRect(anchor, viewport, occupied, markers) {
  const w = Math.min(32, viewport.w), h = Math.min(30, viewport.h);
  const xs = [right(anchor) - w, anchor.x, anchor.x + (anchor.w - w) / 2];
  const ys = [anchor.y - h - 2, bottom(anchor) + 2, anchor.y, bottom(anchor) - h, anchor.y + (anchor.h - h) / 2];
  const candidates = ys.flatMap(y => xs.map(x => ({
    x: clamp(x, viewport.x, right(viewport) - w), y: clamp(y, viewport.y, bottom(viewport) - h), w, h,
  })));
  const available = candidates.filter(rect => markers.every(other => !intersects(rect, other)));
  return available.find(rect => occupied.every(other => !intersects(rect, other))) || available[0] || candidates[0];
}

function popupRect(anchor, viewport, w, h) {
  const above = anchor.y - viewport.y, below = bottom(viewport) - bottom(anchor);
  return { x: clamp(anchor.x + (anchor.w - w) / 2, viewport.x, right(viewport) - w),
    y: clamp(below >= h + 3 || below >= above ? bottom(anchor) + 3 : anchor.y - h - 3, viewport.y, bottom(viewport) - h), w, h };
}

function position(element, rect, size = rect) {
  Object.assign(element.style, { left: rect.x + 'px', top: rect.y + 'px', width: size.w + 'px', height: size.h + 'px',
    transform: 'scale(' + rect.w / size.w + ',' + rect.h / size.h + ')' });
}

function splitPages(lines) {
  const groups = [];
  for (const line of lines) {
    if (!groups.length || ['name', 'option', 'reward'].includes(line.kind)) groups.push([]);
    groups.at(-1).push(line);
  }
  if (groups.length < 2) return null;
  const middle = Math.ceil(groups.length / 2);
  return [groups.slice(0, middle).flat(), groups.slice(middle).flat()];
}

export function createNodeDetails(ctx, theme, cardView) {
  const doc = ctx.document, remembered = new Map(), views = new Set();
  let host = null, popup = null, releaseOutside = null;
  function close(returnFocus = false) {
    if (!popup) return;
    const { view, marker, restore } = popup; popup = null;
    view.destroy(); restore(); marker.setAttribute('aria-expanded', 'false');
    if (returnFocus) marker.focus({ preventScroll: true });
  }
  function clear() {
    close();
    for (const view of views) view.destroy();
    releaseOutside?.(); releaseOutside = null; host?.remove(); host = null;
  }
  function create(tag, value, className) {
    const element = doc.createElement(tag);
    if (value) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function safely(action) {
    try { action(); } catch (error) { ctx.reportError?.(error); }
  }
  function button(text, label, className, action, click) {
    const element = create('button', text, className);
    element.type = 'button'; element.title = label; element.setAttribute('aria-label', label);
    element.dataset.action = action; element.addEventListener('click', () => safely(click));
    return element;
  }
  function measure(row, w) {
    const full = cardView.measure(row.node, row.lines, w, true);
    const pages = splitPages(row.lines)?.map(lines => cardView.measure(row.node, lines, w, true)) ?? [full];
    const pagedHeight = Math.max(...pages.map(page => page.h)) + (pages.length > 1 ? footerHeight : 0);
    return { w, full, pages, pagedHeight };
  }
  function createPanel(row, layout, placement, rect, drawing, toClient, dismiss) {
    const id = String(row.node.id), mode = dismiss ? 'popup' : 'carousel';
    const pages = layout.full.h + (dismiss ? footerHeight : 0) <= placement.h ? [layout.full] : layout.pages;
    const footer = pages.length > 1 || dismiss ? footerHeight : 0;
    const panel = create('section'); panel.dataset.nodeId = id; panel.dataset.role = mode;
    panel.setAttribute('aria-label', layout.full.name + ' · ' + (row.node.city || '地点待同步'));
    position(panel, rect, placement);
    const body = create('div', '', 'body'), summary = create('span', '', 'summary'), spacer = create('div');
    summary.setAttribute('aria-live', 'polite'); spacer.setAttribute('aria-hidden', 'true');
    body.setAttribute('role', 'region'); body.setAttribute('aria-label', '节点内容');
    body.append(summary, spacer); panel.append(body);
    const count = create('span');
    const view = { panel, placement, rect, toClient, card: null, spec: null,
      destroy() { views.delete(view); if (view.card && !view.card.destroyed) view.card.destroy(true); panel.remove(); } };
    let page = Math.min(remembered.get(id) || 0, pages.length - 1);
    function show(offset) {
      const next = (page + offset + pages.length) % pages.length, spec = pages[next];
      const card = cardView.build(spec, { h: placement.h, footer, mode });
      try {
        card.pos(placement.x, placement.y);
        if (dismiss) card.zOrder = 1;
        drawing.addChild(card);
      } catch (error) { card.destroy(true); throw error; }
      if (view.card && !view.card.destroyed) view.card.destroy(true);
      view.card = card; view.spec = spec; view.iconOffset = null; page = next;
      remembered.set(id, page);
      const { bodyY, bodyHeight, range } = card._shanheDetail;
      body.style.top = bodyY + 'px'; body.style.height = bodyHeight + 'px';
      spacer.style.height = bodyHeight + range + 'px'; body.scrollTop = 0;
      summary.textContent = spec.accessibleText;
      count.textContent = (page + 1) + ' / ' + pages.length;
      body.toggleAttribute('data-scrollable', range > 0 && bodyHeight > 0);
      if (body.hasAttribute('data-scrollable')) body.tabIndex = 0;
      else body.removeAttribute('tabindex');
    }
    body.addEventListener('scroll', () => view.card?.scrollBody(body.scrollTop), { passive: true });
    if (footer) {
      const nav = create('div', '', 'nav'); nav.style.height = footer + 'px';
      if (pages.length > 1) {
        nav.append(button('', '上一页', 'step', 'previous', () => show(-1)), count,
          button('', '下一页', 'step', 'next', () => show(1)));
        panel.addEventListener('keydown', event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault(); safely(() => show(event.key === 'ArrowLeft' ? -1 : 1));
        });
      }
      if (dismiss) nav.append(button('×', '关闭节点详情', 'close', 'close', dismiss));
      panel.append(nav);
    }
    show(0);
    views.add(view);
    return view;
  }
  function iconAt(x, y) {
    const opened = popup?.view;
    let view = opened && contains(opened.rect, x, y) ? opened : null;
    if (!view) for (const candidate of views) {
      if (candidate.card.visible && contains(candidate.rect, x, y)) { view = candidate; break; }
    }
    if (!view || view.card.destroyed) return undefined;
    const { bodyY, bodyHeight, offset } = view.card._shanheDetail;
    if (view.iconOffset !== offset) {
      view.iconOffset = offset;
      view.icons = view.spec.images.flatMap(icon => {
        const y0 = Math.max(icon.y - offset, bodyY), y1 = Math.min(icon.y - offset + icon.h, bodyY + bodyHeight);
        if (y1 <= y0) return [];
        const rect = view.toClient({ x: view.placement.x + icon.x, y: view.placement.y + y0, w: icon.w, h: y1 - y0 });
        return rect ? [{ rect, label: icon.label }] : [];
      });
    }
    return view.icons.find(({ rect }) => contains(rect, x, y))?.label || null;
  }
  function coverCards(view, drawing, shadow) {
    const cards = [], controls = [];
    for (let i = 0; i < drawing.numChildren; i++) {
      const card = drawing.getChildAt(i);
      if (card === view.card || !card.visible || !card._shanheAccessibleText) continue;
      if (!intersects(view.placement, { x: card.x, y: card.y, w: card.width, h: card.height })) continue;
      card.visible = false; cards.push(card);
    }
    for (const element of shadow.querySelectorAll('section, .marker')) {
      if (element === view.panel) continue;
      const { x, y, width, height } = element.getBoundingClientRect();
      if (!intersects(view.rect, { x, y, w: width, h: height })) continue;
      element.style.visibility = 'hidden'; controls.push(element);
    }
    return () => {
      for (const card of cards) if (!card.destroyed) card.visible = true;
      for (const element of controls) element.style.visibility = '';
    };
  }
  function paint(rows, viewport, clientViewport, occupied, drawing, toClient) {
    clear();
    const ids = new Set(rows.map(({ node }) => String(node.id)));
    for (const id of remembered.keys()) if (!ids.has(id)) remembered.delete(id);
    if (!rows.length || !clientViewport || !doc?.body) return [];
    host = create('div'); host.dataset.sgsShanheNodeDetails = '';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(create('style', css));
    for (const key of ['surface', 'raised', 'text', 'muted', 'accent', 'border']) host.style.setProperty('--sh-' + key, theme.palette[key]);
    for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'keydown', 'keyup']) {
      shadow.addEventListener(event, e => e.stopPropagation(), { passive: true });
    }
    shadow.addEventListener('keydown', event => { if (event.key === 'Escape') close(true); });
    releaseOutside = ctx.scope.listen(doc, 'pointerdown', event => { if (!event.composedPath().includes(host)) close(); }, { capture: true, passive: true });
    doc.body.append(host);
    const result = [], markers = [];
    for (const row of rows) {
      const { node, anchor, mapAnchor, placement, rect } = row;
      if (rect) {
        const view = createPanel(row, measure(row, placement.w), placement, rect, drawing, toClient);
        shadow.append(view.panel); result.push({ id: node.id, mode: 'carousel', rect });
        continue;
      }
      const area = markerRect(anchor, clientViewport, occupied, markers);
      markers.push(area);
      const title = [node.name || '节点', node.city].filter(Boolean).join(' · ');
      const marker = button('···', title + ' · 查看详情', 'marker', 'open', () => {
        if (popup?.marker === marker) { close(true); return; }
        close();
        const w = Math.min(300, Math.floor(viewport.w));
        if (w < 1) return;
        const layout = measure(row, w);
        const fullHeight = layout.full.h + footerHeight;
        const preferred = fullHeight <= viewport.h || layout.pages.length === 1 ? fullHeight : layout.pagedHeight;
        const h = Math.min(Math.floor(viewport.h), preferred);
        if (h < 1) return;
        const placement = popupRect(mapAnchor, viewport, w, h), rect = toClient(placement);
        if (!rect) return;
        const view = createPanel(row, layout, placement, rect, drawing, toClient, () => close(true));
        popup = { marker, view, restore: coverCards(view, drawing, shadow) };
        shadow.append(view.panel);
        marker.setAttribute('aria-expanded', 'true'); view.panel.querySelector('.close').focus({ preventScroll: true });
      });
      marker.dataset.nodeId = String(node.id); marker.setAttribute('aria-expanded', 'false');
      position(marker, area); shadow.append(marker);
      result.push({ id: node.id, mode: 'marker', rect: area });
    }
    return result;
  }
  return { measure, paint, iconAt, clear, ownsClick: event => !!host && event.composedPath().includes(host),
    reset() { clear(); remembered.clear(); } };
}
