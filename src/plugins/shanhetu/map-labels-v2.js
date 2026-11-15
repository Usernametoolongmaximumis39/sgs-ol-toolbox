import { getNativeTheme } from '../../ui/native-theme.js';
import { labelLines } from './presentation.js';
import { createPlacementTask, findDrawerRect, validatePlacement, comparePlacementResults } from './placement.js';
import { capturePlacementGeometry, placementRectToClient } from './placement-geometry.js';
import { createPlacementOverlay, placementOverlaySignature } from './overlay-host.js';
import { createInfoCardView } from './card-view-v2.js';
import { infoIcon } from './info-icons.js';
import { infoLineTokens } from './info-content.js';

// This renderer consumes only the existing content contract. Geometry and
// placement are collected/computed independently of the retired label system.
const CARD_WIDTH = 220;
const CARD_WIDTHS = Object.freeze([160, 170, 190, CARD_WIDTH, 250, 280, 320]);
const copyMeasurement = card => ({ ...card, ...(card.alternatives ? { alternatives: card.alternatives.map(size => ({ ...size })) } : {}) });
const key = id => String(id);
const heading = node => `${node.name || '节点'} · ${node.city || '地点待同步'}`;
const content = (node, forCard = false) => labelLines(node, false).flatMap(line => [line,
  ...(!forCard && line.warnings?.length ? [{ kind: 'warning', text: '注意 · ' + line.warnings.join('、') }] : [])]);
const css = `
.sgs-shanhetu-drawer-v2{position:fixed;z-index:2147483600;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--sh-border);border-radius:10px;background:var(--sh-bg);color:var(--sh-text);box-shadow:0 5px 18px #0003;font:14px/1.6 "Microsoft YaHei",sans-serif;transform-origin:top left;pointer-events:auto}
.sgs-shanhetu-drawer-v2 *{box-sizing:border-box}
.sgs-shanhetu-drawer-v2 button{appearance:none;border:0;border-bottom:1px solid var(--sh-border);border-radius:0;background:var(--sh-raised);color:var(--sh-text);font:13px/20px "Microsoft YaHei",sans-serif;text-align:left;height:32px;min-height:32px;max-height:32px;white-space:nowrap;width:100%;padding:5px 10px;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer;flex:none}
.sgs-shanhetu-drawer-v2 button span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
.sgs-shanhetu-drawer-v2 button span:last-child{flex:none}
.sgs-shanhetu-drawer-v2 button:disabled{cursor:default;color:var(--sh-muted)}
.sgs-shanhetu-drawer-v2 button:hover{color:var(--sh-accent)}
.sgs-shanhetu-drawer-v2 :focus-visible{outline:2px solid var(--sh-accent);outline-offset:-3px}
.sgs-shanhetu-drawer-v2 [data-role=body]{overflow:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--sh-border) transparent;padding:0 12px 10px}
.sgs-shanhetu-drawer-v2 article{padding:12px 0;border-bottom:1px solid var(--sh-border);overflow-wrap:anywhere;white-space:pre-wrap}
.sgs-shanhetu-drawer-v2 article:last-child{border-bottom:0}
.sgs-shanhetu-drawer-v2 h3{font-size:14px;line-height:1.5;margin:0 0 7px;color:var(--sh-accent);font-weight:600}
.sgs-shanhetu-drawer-v2 p{margin:3px 0}
.sgs-shanhetu-drawer-v2 [data-kind=stats],.sgs-shanhetu-drawer-v2 [data-kind=hint]{color:var(--sh-muted)}
.sgs-shanhetu-drawer-v2 [data-kind=warning]{color:var(--sh-danger);font-weight:700}
.sgs-shanhetu-drawer-v2 [data-kind=name]{font-weight:600}
.sgs-shanhetu-drawer-v2 .sh-info-token{display:inline-flex;align-items:center;gap:4px;max-width:100%;margin-right:6px;vertical-align:middle}
.sgs-shanhetu-drawer-v2 .sh-info-token img{width:17px;height:17px;object-fit:contain;flex:none}
.sgs-shanhetu-drawer-v2 .sh-info-token span{min-width:0;overflow-wrap:anywhere}
`;

export function createMapLabels(ctx) {
  const theme = getNativeTheme(ctx), doc = ctx.document;
  const cardView = createInfoCardView(ctx, theme);
  const now = () => ctx.window.performance?.now?.() ?? Date.now();
  let work = null, workFrame = null, sourceRows = [], lastPerformance = null, cancelledJobs = 0;
  let scene = null, host = null, source = [], enabled = false, disposed = false;
  let layer = null, drawerElement = null, drawerBody = null, drawerToggle = null, style = null;
  let iconHints = [], tooltip = null, accessibleMap = null;
  let lastSignature = '', contentSignature = '', previous = [], revision = 0, scheduled = false;
  let geometry = null, lastLayout = null, drawerRect = null, overflowIds = [], measuredCards = [];
  let status = { state: 'inactive', sourceCount: 0, reason: null }, failureSince = null, reportedFailure = '';
  let drawerOpen = ctx.settings?.get('placementDrawerOpen', true) !== false;
  let sceneCleanup = [], pendingCleanup = [], domCleanup = [], frame = null;
  const engine = () => ctx.window.Laya || ctx.window.laya;
  const canvas = () => {
    const L = engine(), nativeCanvas = L?.Render?.canvas;
    return nativeCanvas?.getBoundingClientRect ? nativeCanvas : nativeCanvas?.source?.getBoundingClientRect
      ? nativeCanvas.source : doc?.getElementById('layaCanvas') || null;
  };
  const mapping = () => ({ cityView: host, scene, stage: engine()?.stage, canvas: canvas(), window: ctx.window });
  const alive = () => !disposed && !ctx.scope.signal.aborted;
  function displayStatus(state, reason = null) {
    const prior = status;
    status = { state, sourceCount: source.length, reason };
    if (source.length && ['viewport-unavailable', 'engine-unavailable', 'no-display-space'].includes(state)) {
      if (prior.state !== state || prior.reason !== reason || failureSince == null) failureSince = Date.now();
      const message = `地图标注暂时无法显示，已同步的完整内容仍可在山河图面板查看。\n原因：${reason || state}`;
      if (Date.now() - failureSince >= 1500 && message !== reportedFailure) {
        reportedFailure = message; ctx.reportError?.(message);
      }
    } else if (state !== 'render-error') {
      failureSince = null;
      if (reportedFailure) { reportedFailure = ''; if (alive()) ctx.reportError?.(null); }
    }
  }
  const release = list => { for (const off of list.splice(0)) off(); };
  function destroyLayer() {
    if (layer) { layer.destroy(true); layer = null; }
    iconHints = []; tooltip?.remove(); accessibleMap?.remove(); tooltip = accessibleMap = null;
  }
  function showIconHints(entries) {
    if (!doc?.body) return;
    accessibleMap = doc.createElement('section'); accessibleMap.setAttribute('aria-label', '山河图地图节点信息');
    Object.assign(accessibleMap.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden',
      clipPath: 'inset(50%)', whiteSpace: 'pre-wrap', pointerEvents: 'none' });
    for (const { placement, spec } of entries) {
      const item = doc.createElement('p'); item.textContent = spec.accessibleText; accessibleMap.append(item);
      for (const icon of spec.images) {
        const rect = placementRectToClient({ x: placement.x + icon.x, y: placement.y + icon.y, w: icon.w, h: icon.h }, mapping());
        if (rect) iconHints.push({ rect, label: icon.label });
      }
    }
    doc.body.append(accessibleMap);
  }
  if (ctx.window.addEventListener) ctx.scope.listen(ctx.window, 'pointermove', event => {
    const item = iconHints.find(({ rect: r }) => event.clientX >= r.x && event.clientX <= r.x + r.w
      && event.clientY >= r.y && event.clientY <= r.y + r.h);
    if (!item) { if (tooltip) tooltip.hidden = true; return; }
    if (!tooltip) {
      tooltip = doc.createElement('div'); tooltip.className = 'sgs-shanhetu-icon-tooltip'; tooltip.setAttribute('role', 'tooltip');
      Object.assign(tooltip.style, { position: 'fixed', zIndex: '2147483601', pointerEvents: 'none', padding: '5px 8px',
        border: '1px solid ' + theme.palette.border, borderRadius: '5px', background: theme.palette.raised,
        color: theme.palette.text, font: '12px/1.6 "Microsoft YaHei",sans-serif', maxWidth: '260px', overflowWrap: 'anywhere' });
      doc.body.append(tooltip);
    }
    tooltip.textContent = item.label; tooltip.hidden = false;
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(event.clientX + 12, ctx.window.innerWidth - bounds.width - 8)) + 'px';
    tooltip.style.top = Math.max(8, Math.min(event.clientY + 16, ctx.window.innerHeight - bounds.height - 8)) + 'px';
  }, { passive: true });
  function removeDrawer() {
    release(domCleanup); drawerElement?.remove(); style?.remove();
    drawerElement = drawerBody = drawerToggle = style = null;
  }
  function resetVisuals() {
    release(pendingCleanup); destroyLayer(); removeDrawer();
    geometry = lastLayout = drawerRect = null; overflowIds = []; previous = []; measuredCards = []; lastSignature = '';
  }
  function schedule() {
    if (!alive() || scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; frame = null; if (alive()) refresh(); };
    if (ctx.window.requestAnimationFrame) frame = ctx.window.requestAnimationFrame(run);
    else { scheduled = false; refresh(); }
  }
  function bindScene() {
    release(sceneCleanup);
    for (const [target, method] of [[scene, 'OnStageResize'], [scene, 'UpdateChapterData'], [host, 'UpdateCity'], [host, 'InitMap']]) {
      if (typeof target?.[method] !== 'function') continue;
      sceneCleanup.push(ctx.scope.patch(target, method, original => function (...args) {
        const value = Reflect.apply(original, this, args); schedule(); return value;
      }));
    }
    if (ctx.window.addEventListener) sceneCleanup.push(ctx.scope.listen(ctx.window, 'resize', schedule));
    if (ctx.window.visualViewport?.addEventListener) {
      sceneCleanup.push(ctx.scope.listen(ctx.window.visualViewport, 'resize', schedule));
      sceneCleanup.push(ctx.scope.listen(ctx.window.visualViewport, 'scroll', schedule));
    }
  }
  function waitForImages(pending) {
    release(pendingCleanup);
    const owner = {};
    for (const target of new Set((pending || []).flatMap(item => [item, item?.render]).filter(Boolean))) {
      if (typeof target.on !== 'function' || typeof target.off !== 'function') continue;
      target.on('complete', owner, schedule);
      pendingCleanup.push(ctx.scope.add(() => target.off('complete', owner, schedule)));
    }
  }
  function ensureDrawer() {
    if (drawerElement || !doc?.body) return;
    style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
    drawerElement = doc.createElement('section'); drawerElement.className = 'sgs-shanhetu-drawer-v2';
    drawerElement.setAttribute('aria-label', '山河图完整节点详情');
    drawerToggle = doc.createElement('button'); drawerToggle.type = 'button'; drawerToggle.dataset.action = 'toggle';
    drawerBody = doc.createElement('div'); drawerBody.dataset.role = 'body'; drawerBody.tabIndex = 0;
    drawerBody.setAttribute('aria-label', '完整节点详情列表');
    drawerElement.append(drawerToggle, drawerBody); doc.body.append(drawerElement);
    domCleanup.push(ctx.scope.listen(drawerToggle, 'click', () => {
      drawerOpen = !drawerOpen; ctx.settings?.set('placementDrawerOpen', drawerOpen); lastSignature = ''; refresh();
    }));
    for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'keydown', 'keyup']) {
      domCleanup.push(ctx.scope.listen(drawerElement, event, e => e.stopPropagation(), { passive: true }));
    }
  }
  function paintDrawer(nodes, rect) {
    if (!rect || !nodes.length) { removeDrawer(); return; }
    const client = placementRectToClient(rect, mapping());
    if (!client || ![client.x, client.y, client.w, client.h].every(Number.isFinite) || client.w <= 0 || client.h <= 0) { removeDrawer(); return; }
    ensureDrawer(); if (!drawerElement) return;
    const palette = theme.palette;
    for (const [name, value] of Object.entries({ bg: palette.surface, raised: palette.raised, text: palette.text,
      muted: palette.muted, accent: palette.accent, border: palette.border, danger: palette.danger })) drawerElement.style.setProperty('--sh-' + name, value);
    Object.assign(drawerElement.style, { left: `${client.x}px`, top: `${client.y}px`, width: `${rect.w}px`, height: `${rect.h}px`,
      transform: `scale(${client.w / rect.w},${client.h / rect.h})` });
    drawerToggle.replaceChildren();
    const shownOpen = drawerOpen && rect.h >= 58;
    const title = doc.createElement('span'); title.textContent = `${rect.w < 180 ? '详情' : '节点详情'} · ${nodes.length}`;
    const action = doc.createElement('span'); action.textContent = rect.w < 180 ? shownOpen ? '▴' : '▾' : shownOpen ? '收起 ▴' : '展开 ▾';
    drawerToggle.append(title, action); drawerToggle.setAttribute('aria-expanded', String(shownOpen));
    drawerToggle.setAttribute('aria-label', `${shownOpen ? '收起' : '展开'} ${nodes.length} 个节点的完整详情`);
    drawerToggle.disabled = drawerOpen && !shownOpen;
    drawerToggle.title = drawerToggle.disabled ? '可见画布过小，请放大窗口或在工具箱的山河图面板查看完整详情' : '';
    if (drawerToggle.disabled) {
      action.textContent = rect.w < 180 ? '—' : '窗口过小';
      drawerToggle.setAttribute('aria-label', drawerToggle.title);
    }
    drawerBody.hidden = !shownOpen;
    const savedScroll = drawerBody.scrollTop, focusBody = doc.activeElement === drawerBody;
    drawerBody.replaceChildren();
    for (const node of nodes) {
      const article = doc.createElement('article'); article.dataset.nodeId = key(node.id);
      const titleNode = doc.createElement('h3'); titleNode.textContent = heading(node); article.append(titleNode);
      for (const line of content(node)) {
        const p = doc.createElement('p'); p.dataset.kind = line.kind || 'text'; p.setAttribute('aria-label', line.text);
        for (const token of infoLineTokens(line)) {
          if (token.breakBefore) p.append(doc.createElement('br'));
          const icon = infoIcon(token.icon);
          if (!icon) { p.append(doc.createTextNode(token.fallback ?? token.text)); continue; }
          const group = doc.createElement('span'), img = doc.createElement('img'), value = doc.createElement('span');
          group.className = 'sh-info-token'; group.title = token.full || token.fallback || icon.label;
          group.setAttribute('role', 'img'); group.setAttribute('aria-label', group.title);
          img.src = icon.data; img.alt = icon.label; value.textContent = token.text;
          group.append(img, value); p.append(group);
        }
        article.append(p);
      }
      drawerBody.append(article);
    }
    drawerBody.scrollTop = savedScroll; if (focusBody) drawerBody.focus({ preventScroll: true });
  }
  function snapshotSignature(next) {
    const client = next.viewport && placementRectToClient(next.viewport, mapping());
    return JSON.stringify([contentSignature, next.signature, next.ready, next.reason, client,
      next.viewport ? placementOverlaySignature({ host, scene, viewport: next.viewport }) : null, drawerOpen, theme.palette]);
  }
  function cancelWork() {
    workFrame?.();
    workFrame = null;
    if (work) { const old = work; work = null; cancelledJobs++; old.task?.cancel(); old.iterator.return(); }
  }
  function fail(error) {
    destroyLayer(); removeDrawer(); previous = []; measuredCards = []; lastLayout = null; lastSignature = '';
    displayStatus('render-error', error?.message || String(error));
    const message = String(error?.stack || error);
    if (message !== reportedFailure) { reportedFailure = message; ctx.reportError?.(error); }
  }
  function queueWork() {
    if (!work || workFrame != null) return;
    const scheduledJob = work;
    const run = () => {
      if (work !== scheduledJob) return;
      workFrame = null;
      const job = work;
      if (!job || !alive() || !enabled) return;
      const started = now();
      try {
        let progress;
        do {
          progress = job.iterator.next();
          if (progress.done) { if (work === job) work = null; break; }
          if (progress.value === 'frame') break;
        } while (work === job && now() - started < 4);
      } catch (error) {
        if (work === job) work = null;
        job.task?.cancel(); job.iterator.return(); fail(error);
      } finally {
        const duration = now() - started;
        job.performance.slices++; job.performance.workMs += duration;
        job.performance.maxSliceMs = Math.max(job.performance.maxSliceMs, duration);
        job.performance.elapsedMs = now() - job.started;
        lastPerformance = { ...job.performance };
      }
      if (work) queueWork();
    };
    if (ctx.window.requestAnimationFrame) {
      const handle = ctx.window.requestAnimationFrame(run);
      workFrame = () => ctx.window.cancelAnimationFrame?.(handle);
    } else {
      // ResourceScope.timeout returns a timer id, not an unsubscribe function.
      // Own the cancellation explicitly so a suspended scene has no live timer.
      let release = () => {};
      const handle = ctx.window.setTimeout(() => { release(); run(); }, 0);
      release = ctx.scope.add(() => ctx.window.clearTimeout(handle));
      workFrame = release;
    }
  }
  function* renderLayout(job) {
    const { next, signature, ownerScene, ownerHost, rows } = job;
    const transient = [];
    const timed = (name, fn) => {
      const start = now(); try { return fn(); } finally { job.performance[name] += now() - start; }
    };
    const measure = (row, width) => timed('measureMs', () => cardView.measure(row.node, row.lines, width));
    const solve = function* (snapshot) {
      const task = job.task = createPlacementTask(snapshot);
      try {
        for (;;) {
          const progress = timed('solveMs', () => task.step(3));
          if (progress.done) { job.task = null; return progress.result; }
          yield 'frame';
        }
      } finally { if (job.task === task) { task.cancel(); job.task = null; } }
    };
    try {
      const priorWidths = new Map(previous.map(card => [key(card.id), card.w]));
      const built = [], cards = [];
      for (const row of rows) {
        const priorWidth = priorWidths.get(key(row.node.id));
        const spec = measure(row, CARD_WIDTHS.includes(priorWidth) ? priorWidth : CARD_WIDTH);
        built.push({ ...row, specs: new Map([[spec.w, spec]]) });
        cards.push({ id: row.node.id, w: spec.w, h: spec.h }); yield;
      }
      const byId = new Map(built.map(row => [key(row.node.id), row]));
      const knownIds = new Set(next.nodes.map(node => key(node.id)));
      const knownCards = cards.filter(card => knownIds.has(key(card.id)));
      const snapshot = { ...next, cards: knownCards, previous };
      let result = next.ready ? yield* solve(snapshot)
        : { placements: [], overflow: cards.map(card => ({ id: card.id, reason: '节点几何待就绪' })) };
      const attempts = [{ phase: next.ready ? 'nearby' : 'geometry-pending',
        overflow: result.overflow.map(row => ({ ...row })), diagnostics: result.diagnostics || null }];
      const needsAlternatives = () => result.overflow.length ||
        (result.diagnostics?.preferredAboveIds?.length || 0) < knownCards.length;
      const measureAlternatives = function* (targets) {
        let changed = false;
        for (const card of targets) {
          if (card.alternatives) continue;
          changed = true; card.alternatives = [];
          const row = byId.get(key(card.id));
          for (const width of CARD_WIDTHS) {
            if (width === card.w || width > next.viewport.w - 16) continue;
            const spec = measure(row, width);
            if (row.specs.has(spec.w)) continue;
            row.specs.set(spec.w, spec);
            card.alternatives.push({ w: spec.w, h: spec.h }); yield;
          }
        }
        return changed;
      };
      if (next.ready && needsAlternatives()) {
        const above = new Set((result.diagnostics?.preferredAboveIds || []).map(key));
        yield* measureAlternatives(knownCards.filter(card => !above.has(key(card.id))));
        const flexible = yield* solve(snapshot);
        attempts.push({ phase: 'measured-widths', overflow: flexible.overflow.map(row => ({ ...row })), diagnostics: flexible.diagnostics });
        if (comparePlacementResults(flexible, result) < 0) result = flexible;
        if (needsAlternatives() && (yield* measureAlternatives(knownCards))) {
          const wholeGroup = yield* solve(snapshot);
          attempts.push({ phase: 'measured-widths-all', overflow: wholeGroup.overflow.map(row => ({ ...row })), diagnostics: wholeGroup.diagnostics });
          if (comparePlacementResults(wholeGroup, result) < 0) result = wholeGroup;
        }
      }
      const overflow = new Set(result.overflow.map(row => key(row.id)));
      for (const card of cards) if (!knownIds.has(key(card.id))) overflow.add(key(card.id));
      let nextDrawer = null;
      if (overflow.size) {
        nextDrawer = findDrawerRect(next.viewport, next.controls, { width: Number(ctx.settings?.get('placementDrawerWidth', 280)) || 280, collapsed: !drawerOpen });
        if (!nextDrawer && drawerOpen) nextDrawer = findDrawerRect(next.viewport, next.controls,
          { width: Number(ctx.settings?.get('placementDrawerWidth', 280)) || 280, collapsed: true });
        if (nextDrawer && next.ready) {
          for (let pass = 0; pass <= cards.length; pass++) {
            result = yield* solve({ ...snapshot, cards: knownCards.filter(card => !overflow.has(key(card.id))), drawer: nextDrawer });
            attempts.push({ phase: 'drawer', overflow: result.overflow.map(row => ({ ...row })), diagnostics: result.diagnostics });
            const count = overflow.size;
            for (const row of result.overflow) overflow.add(key(row.id));
            if (overflow.size === count) break;
          }
        }
      }
      const accepted = [];
      for (const placement of result.placements) {
        if (overflow.has(key(placement.id))) continue;
        if (validatePlacement({ ...snapshot, drawer: nextDrawer }, placement, accepted).valid) accepted.push(placement);
        else overflow.add(key(placement.id));
        yield;
      }
      if (overflow.size && !nextDrawer) nextDrawer = findDrawerRect(next.viewport, next.controls,
        { width: Number(ctx.settings?.get('placementDrawerWidth', 280)) || 280, collapsed: !drawerOpen });
      const final = [];
      for (const placement of accepted) {
        if (validatePlacement({ ...snapshot, drawer: nextDrawer }, placement, final).valid) final.push(placement);
        else overflow.add(key(placement.id));
      }
      const { root: fresh, content: drawing } = createPlacementOverlay(engine(),
        { host: ownerHost, scene: ownerScene, viewport: next.viewport });
      transient.push(fresh); fresh.zOrder = 990;
      for (const placement of final) {
        const spec = byId.get(key(placement.id))?.specs.get(placement.w);
        if (!spec || spec.h !== placement.h) throw new Error('完整卡片实测尺寸与布局结果不一致');
        const sprite = timed('renderMs', () => cardView.build(spec)); transient.push(sprite);
        const { fromX, fromY, toX, toY } = placement.line;
        if (fromX !== toX || fromY !== toY) drawing.graphics.drawLine(fromX, fromY, toX, toY, theme.palette.accent, 1);
        sprite.pos(placement.x, placement.y); drawing.addChild(sprite); yield;
      }
      // No obsolete computation is ever committed after resize, content change,
      // battle return, disable or a native scene replacement.
      if (work !== job || !alive() || !enabled || scene !== ownerScene || host !== ownerHost
        || snapshotSignature(capturePlacementGeometry(mapping())) !== signature) { schedule(); return; }
      const priorLayer = layer; ownerScene.addChild(fresh); layer = fresh; priorLayer?.destroy(true);
      showIconHints(final.map(placement => ({ placement, spec: byId.get(key(placement.id)).specs.get(placement.w) })));
      measuredCards = cards.map(copyMeasurement); drawerRect = nextDrawer;
      overflowIds = rows.filter(row => overflow.has(key(row.node.id))).map(row => row.node.id);
      lastLayout = { placements: final, overflow: overflowIds.map(id => ({ id, reason: next.ready ? '未找到合法位置' : '节点几何待就绪' })),
        diagnostics: result.diagnostics || null, attempts };
      previous = final.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
      paintDrawer(rows.filter(row => overflow.has(key(row.node.id))).map(row => row.node), drawerRect);
      if (rows.length && !final.length && !drawerElement) displayStatus('no-display-space', '未找到合法卡片位置及可读详情区域');
      else displayStatus(rows.length ? next.ready ? 'ready' : 'geometry-pending' : 'no-content', next.reason || null);
      lastSignature = signature; revision++;
    } finally {
      job.task?.cancel(); job.task = null;
      for (const sprite of transient) if (!sprite.destroyed && !sprite.parent) sprite.destroy(true);
    }
  }
  function refresh() {
    if (!alive() || !enabled) return;
    if (!host || host.destroyed || !scene || scene.destroyed) { clear(); return; }
    const L = engine();
    if (!L?.Sprite || !L?.Text) { cancelWork(); lastSignature = ''; displayStatus('engine-unavailable', 'Laya Sprite/Text 尚未就绪'); return; }
    try {
      const started = now(), next = capturePlacementGeometry(mapping()), signature = snapshotSignature(next);
      if (signature === lastSignature || signature === work?.signature) {
        if (['no-display-space', 'viewport-unavailable'].includes(status.state)) displayStatus(status.state, status.reason);
        return;
      }
      cancelWork(); waitForImages(next.pending);
      geometry = { ready: next.ready, controlsComplete: next.controlsComplete, viewport: next.viewport, nodes: next.nodes,
        controls: next.controls, signature: next.signature, reason: next.reason || null, diagnostics: next.diagnostics || null };
      lastSignature = ''; destroyLayer(); removeDrawer();
      if (!next.viewport) {
        lastLayout = null; previous = []; drawerRect = null; overflowIds = []; measuredCards = [];
        lastSignature = signature; displayStatus('viewport-unavailable', next.reason || '可见画布边界不可用'); return;
      }
      const job = { next, signature, ownerScene: scene, ownerHost: host, rows: sourceRows.slice(), started,
        performance: { geometryMs: now() - started, measureMs: 0, solveMs: 0, renderMs: 0, workMs: 0,
          elapsedMs: 0, slices: 0, maxSliceMs: 0 }, task: null, iterator: null };
      job.iterator = renderLayout(job); work = job; displayStatus('placing'); queueWork();
    } catch (error) { cancelWork(); fail(error); }
  }
  function clear() {
    if (frame != null) ctx.window.cancelAnimationFrame?.(frame);
    frame = null; scheduled = false;
    enabled = false; cancelWork(); release(sceneCleanup); resetVisuals(); scene = host = null; source = []; sourceRows = []; contentSignature = '';
    displayStatus('inactive');
  }
  function update(nextScene, nodes, nextEnabled) {
    if (!alive()) return;
    const nextHost = nextScene?.cityView;
    if (!nextEnabled || !nextHost || nextHost.destroyed) { clear(); return; }
    if (scene !== nextScene || host !== nextHost) { clear(); scene = nextScene; host = nextHost; bindScene(); }
    const rows = (nodes || []).filter(node => node && node.type !== 'camp' && node.id != null)
      .map(node => ({ node, lines: content(node, true) })).filter(row => row.lines.length);
    const nextSignature = JSON.stringify(rows.map(row => [row.node.id, heading(row.node), row.lines]));
    if (nextSignature !== contentSignature) cancelWork();
    sourceRows = rows; source = rows.map(row => row.node); enabled = true; contentSignature = nextSignature;
    schedule();
  }
  const offTheme = theme.watch(() => { lastSignature = ''; schedule(); });
  ctx.scope.interval(schedule, 250);
  ctx.scope.add(() => {
    disposed = true; clear(); offTheme();
    if (frame != null) ctx.window.cancelAnimationFrame?.(frame); scheduled = false;
  });
  return { update, clear, inspect: () => ({ geometry, lastLayout, status: { ...status }, measuredCards: measuredCards.map(copyMeasurement), drawer: { open: drawerOpen, rect: drawerRect, ids: [...overflowIds] }, cards: layer ? previous.map(row => ({ ...row })) : [], revision, pending: !!work || scheduled, performance: { last: lastPerformance, cancelledJobs }, caches: cardView.inspect() }) };
}
