import { isNativeNodeMounted } from '../../shared/native-tree.js';
import { labelLines } from './presentation.js';
import { createPlacementTask, validatePlacement, comparePlacementResults } from './placement.js';
import { capturePlacementGeometry, placementRectToClient } from './placement-geometry.js';
import { createPlacementOverlay, placementOverlaySignature } from './overlay-host.js';
import { createInfoCardView } from './card-view-v2.js';
import { createNodeDetails, intersects } from './node-details-v2.js';

// This renderer consumes only the existing content contract. Geometry and
// placement are collected/computed independently of the retired label system.
const CARD_WIDTH = 220;
const CARD_WIDTHS = Object.freeze([160, 170, 190, CARD_WIDTH, 250, 280, 320]);
const copyMeasurement = card => ({ ...card, ...(card.alternatives ? { alternatives: card.alternatives.map(size => ({ ...size })) } : {}) });
const key = id => String(id);
const heading = node => `${node.name || '节点'} · ${node.city || '地点待同步'}`;
const contains = (rect, { x, y }) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
const COMPACT_DETAIL_SIZES = [
  { w: 252, h: 188 }, { w: 220, h: 162 }, { w: 188, h: 148 },
  { w: 188, h: 126 }, { w: 156, h: 112 }, { w: 144, h: 104 },
].map(size => ({ ...size, carousel: true }));

export function createMapLabels(ctx) {
  const theme = ctx.ui.nativeTheme, doc = ctx.document;
  const cardView = createInfoCardView(ctx, theme), nodeDetails = createNodeDetails(ctx, theme, cardView);
  const now = () => ctx.window.performance?.now?.() ?? Date.now();
  let work = null, workFrame = null, sourceRows = [], lastPerformance = null, cancelledJobs = 0;
  let scene = null, host = null, source = [], enabled = false, disposed = false;
  let layer = null, frozen = false, mapProgress = null, committedPosition = '';
  let iconHints = [], tooltip = null, accessibleMap = null;
  let lastSignature = '', contentSignature = '', previous = [], revision = 0, scheduled = false;
  let geometry = null, lastLayout = null, localDetails = [], measuredCards = [];
  let status = { state: 'inactive', sourceCount: 0, reason: null }, failureSince = null, reportedFailure = '';
  let sceneCleanup = [], pendingCleanup = [], frame = null;
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
  function clearIconHints() {
    iconHints = []; tooltip?.remove(); accessibleMap?.remove(); tooltip = accessibleMap = null;
  }
  function destroyLayer() {
    if (layer) { layer.destroy(true); layer = null; }
    committedPosition = '';
    clearIconHints();
  }
  function showIconHints(entries) {
    clearIconHints();
    if (!doc?.body) return;
    accessibleMap = doc.createElement('section'); accessibleMap.setAttribute('aria-label', '山河图地图节点信息');
    Object.assign(accessibleMap.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden',
      clipPath: 'inset(50%)', whiteSpace: 'pre-wrap', pointerEvents: 'none' });
    for (const { placement, spec, sprite } of entries) {
      const item = doc.createElement('p'); item.textContent = spec.accessibleText; accessibleMap.append(item);
      for (const icon of spec.images) {
        const rect = placementRectToClient({ x: placement.x + icon.x, y: placement.y + icon.y, w: icon.w, h: icon.h }, mapping());
        if (rect) iconHints.push({ rect, label: icon.label, sprite });
      }
    }
    doc.body.append(accessibleMap);
  }
  if (ctx.window.addEventListener) ctx.scope.listen(ctx.window, 'pointermove', event => {
    const detailLabel = nodeDetails.iconAt(event.clientX, event.clientY);
    const label = detailLabel === undefined ? iconHints.find(({ rect: r, sprite }) => !sprite.destroyed && sprite.visible !== false
      && event.clientX >= r.x && event.clientX <= r.x + r.w && event.clientY >= r.y && event.clientY <= r.y + r.h)?.label : detailLabel;
    if (!label) { if (tooltip) tooltip.hidden = true; return; }
    if (!tooltip) {
      tooltip = doc.createElement('div'); tooltip.className = 'sgs-shanhetu-icon-tooltip'; tooltip.setAttribute('role', 'tooltip');
      Object.assign(tooltip.style, { position: 'fixed', zIndex: '2147483601', pointerEvents: 'none', padding: '5px 8px',
        border: '1px solid ' + theme.palette.border, borderRadius: '5px', background: theme.palette.raised,
        color: theme.palette.text, font: '12px/1.6 "Microsoft YaHei",sans-serif', maxWidth: '260px', overflowWrap: 'anywhere' });
      doc.body.append(tooltip);
    }
    tooltip.textContent = label; tooltip.hidden = false;
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(event.clientX + 12, ctx.window.innerWidth - bounds.width - 8)) + 'px';
    tooltip.style.top = Math.max(8, Math.min(event.clientY + 16, ctx.window.innerHeight - bounds.height - 8)) + 'px';
  }, { passive: true });
  if (ctx.window.addEventListener) ctx.scope.listen(ctx.window, 'click', event => {
    if (enabled && !frozen && nodeDetails.ownsClick(event)) freezeLayout();
  }, { capture: true, passive: true });
  function freezeLayout() {
    frozen = true;
    cancelScheduled();
    cancelWork();
    release(pendingCleanup);
    displayStatus('frozen');
  }
  function onMapClick(event) {
    if (!enabled || frozen || !geometry?.viewport) return;
    // Native dialogs can cover the same screen coordinates as map cards.
    if (event.target !== engine()?.stage && !isNativeNodeMounted(event.target, scene)) return;
    const point = host.globalToLocal({ x: event.stageX, y: event.stageY }, true);
    if (!contains(geometry.viewport, point)) return;
    const onCard = layer && lastLayout && (lastLayout.placements.some(rect => contains(rect, point))
      || lastLayout.carousels.some(rect => contains(rect, point)));
    if (onCard || geometry.nodes.some(node => node.regions.some(rect => contains(rect, point)))) freezeLayout();
  }
  function resetVisuals() {
    release(pendingCleanup); destroyLayer(); nodeDetails.reset();
    geometry = lastLayout = null; localDetails = []; previous = []; measuredCards = []; lastSignature = '';
  }
  function cancelScheduled() {
    if (frame != null) ctx.window.cancelAnimationFrame?.(frame);
    frame = null; scheduled = false;
  }
  function schedule() {
    if (!alive() || !enabled || frozen || scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; frame = null; if (alive()) refresh(); };
    if (ctx.window.requestAnimationFrame) frame = ctx.window.requestAnimationFrame(run);
    else { scheduled = false; refresh(); }
  }
  function bindScene() {
    release(sceneCleanup);
    const L = engine(), stage = L?.stage, click = L?.Event?.CLICK;
    if (click && stage?.on && stage.off) {
      const caller = {};
      stage.on(click, caller, onMapClick);
      sceneCleanup.push(ctx.scope.add(() => stage.off(click, caller, onMapClick)));
    }
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
  function positionSignature(next) {
    const client = next.viewport && placementRectToClient(next.viewport, mapping());
    return JSON.stringify([next.signature, client,
      next.viewport ? placementOverlaySignature({ host, scene, viewport: next.viewport }) : null]);
  }
  const snapshotSignature = position => JSON.stringify([contentSignature, position, theme.palette]);
  function cancelWork() {
    workFrame?.();
    workFrame = null;
    if (work) { const old = work; work = null; cancelledJobs++; old.task?.cancel(); old.iterator.return(); }
  }
  function fail(error) {
    destroyLayer(); nodeDetails.clear(); localDetails = []; previous = []; measuredCards = []; lastLayout = null; lastSignature = '';
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
      if (!job || !alive() || !enabled || frozen) return;
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
    const { next, position, signature, ownerScene, ownerHost, rows } = job;
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
      const needsAlternatives = () => result.overflow.length || result.diagnostics?.shopOverlapIds.length ||
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
        const shopOverlap = new Set((result.diagnostics?.shopOverlapIds || []).map(key));
        yield* measureAlternatives(knownCards.filter(card => !above.has(key(card.id)) || shopOverlap.has(key(card.id))));
        const flexible = yield* solve(snapshot);
        attempts.push({ phase: 'measured-widths', overflow: flexible.overflow.map(row => ({ ...row })), diagnostics: flexible.diagnostics });
        if (comparePlacementResults(flexible, result) < 0) result = flexible;
        if (needsAlternatives() && (yield* measureAlternatives(knownCards))) {
          const wholeGroup = yield* solve(snapshot);
          attempts.push({ phase: 'measured-widths-all', overflow: wholeGroup.overflow.map(row => ({ ...row })), diagnostics: wholeGroup.diagnostics });
          if (comparePlacementResults(wholeGroup, result) < 0) result = wholeGroup;
        }
      }
      let final = [];
      for (const placement of result.placements) {
        if (validatePlacement(snapshot, placement, final).valid) final.push(placement);
        yield;
      }
      const anchors = new Map(next.nodes.filter(({ anchor }) => intersects(anchor, next.viewport)).map(node => [key(node.id), node.anchor]));
      const wholeById = new Map(final.map(card => [key(card.id), card]));
      const missing = knownCards.filter(card => anchors.has(key(card.id)) && !wholeById.has(key(card.id)));
      const sizes = COMPACT_DETAIL_SIZES.filter(size => size.w <= next.viewport.w - 16 && size.h <= next.viewport.h - 16);
      let carousels = [];
      if (next.ready && missing.length && sizes.length) {
        const visibleCards = knownCards.filter(card => anchors.has(key(card.id)) || wholeById.has(key(card.id)));
        const tryLayout = function* (phase, cards, occupied) {
          const layout = yield* solve({ ...snapshot, cards, occupied });
          attempts.push({ phase, overflow: layout.overflow, diagnostics: layout.diagnostics });
          return layout;
        };
        const acceptLayout = layout => {
          if (layout.placements.length <= final.length + carousels.length) return;
          final = layout.placements.filter(card => !card.carousel);
          carousels = layout.placements.filter(card => card.carousel);
        };
        const compact = yield* tryLayout('node-carousel',
          missing.map(({ id }) => ({ id, ...sizes[0], alternatives: sizes.slice(1) })), final);
        carousels = compact.placements;
        let reflow = compact;
        // A full card can occupy the only legal space for a nearby node.
        if (compact.overflow.length && final.length) {
          const mixedCards = visibleCards.map(card => {
            const { w, h } = wholeById.get(key(card.id)) || card;
            return { id: card.id, w, h, alternatives: sizes.filter(size => size.w !== w || size.h !== h) };
          });
          reflow = yield* tryLayout('joint-node-cards', mixedCards);
          acceptLayout(reflow);
        }
        // Larger partial layouts can crowd smaller solutions out of the
        // bounded search. Give compact cards a pass before creating markers.
        if (sizes.length > 1 && reflow.overflow.some(({ reason }) => reason === 'no-compatible-placement')) {
          acceptLayout(yield* tryLayout('compact-node-cards', visibleCards.map(({ id }) => ({ id, ...sizes.at(-1) }))));
        }
      }
      // Expand only after a legal arrangement has been found. Every existing
      // card remains a candidate, and an expansion may not hide a node.
      if (carousels.length && doc?.body) {
        const maxW = Math.floor(next.viewport.w - 16), maxH = Math.floor(next.viewport.h - 16);
        const expanded = [];
        for (const card of carousels) {
          const row = byId.get(key(card.id));
          const widths = [...new Set([card.w, Math.min(maxW, 252), Math.min(maxW, 320)])];
          const available = timed('measureMs', () => widths.map(w => {
            const { full, pagedHeight } = nodeDetails.measure(row, w);
            return { w, full: full.h, paged: pagedHeight };
          }));
          const choices = new Map();
          const add = ({ w, full, paged }, h) => {
            if (h <= 0 || h > maxH) return;
            choices.set(`${w},${h}`, { w, h, carousel: true, detailFit: h >= full ? 2 : h >= paged ? 1 : 0 });
          };
          if (!available.length) continue;
          add(available[0], card.h);
          for (const measured of available) {
            add(measured, Math.min(maxH, measured.paged));
            add(measured, measured.full);
          }
          const current = available[0];
          if (choices.size < 7 && current.paged > card.h) {
            add(current, Math.floor((card.h + Math.min(maxH, current.paged)) / 2));
          }
          const [base, ...alternatives] = choices.values();
          expanded.push({ id: card.id, ...base, alternatives }); yield;
        }
        if (expanded.length === carousels.length && expanded.some(card => card.alternatives.length)) {
          const layout = yield* solve({ ...snapshot, occupied: final, cards: expanded, previous: carousels });
          attempts.push({ phase: 'expand-node-cards', overflow: layout.overflow, diagnostics: layout.diagnostics });
          if (!layout.overflow.length) carousels = layout.placements;
        }
      }
      const placed = new Set(final.map(({ id }) => key(id)));
      const detailRows = rows.filter(({ node }) => !placed.has(key(node.id)) && anchors.has(key(node.id)));
      const carouselById = new Map(carousels.map(card => [key(card.id), card]));
      const client = rect => placementRectToClient(rect, mapping());
      const clientViewport = client(next.viewport);
      const details = detailRows.flatMap(row => {
        const id = key(row.node.id), mapAnchor = anchors.get(id);
        const anchor = client(mapAnchor), placement = carouselById.get(id), rect = placement && client(placement);
        return anchor && clientViewport && intersects(anchor, clientViewport) ? [{ ...row, anchor, mapAnchor, placement, rect }] : [];
      });
      const drawLine = ({ line: { fromX, fromY, toX, toY } }) => {
        if (fromX !== toX || fromY !== toY) drawing.graphics.drawLine(fromX, fromY, toX, toY, theme.palette.accent, 1);
      };
      const { root: fresh, content: drawing } = createPlacementOverlay(engine(),
        { host: ownerHost, scene: ownerScene, viewport: next.viewport });
      transient.push(fresh); fresh.zOrder = 990;
      const fullViews = [];
      for (const placement of final) {
        const spec = byId.get(key(placement.id))?.specs.get(placement.w);
        if (!spec || spec.h !== placement.h) throw new Error('完整卡片实测尺寸与布局结果不一致');
        const sprite = timed('renderMs', () => cardView.build(spec)); transient.push(sprite);
        drawLine(placement);
        sprite.pos(placement.x, placement.y); drawing.addChild(sprite);
        fullViews.push({ placement, spec, sprite }); yield;
      }
      for (const detail of details) if (detail.rect) drawLine(detail.placement);
      // No obsolete computation is ever committed after resize, content change,
      // battle return, disable or a native scene replacement.
      if (work !== job || !alive() || !enabled || frozen || scene !== ownerScene || host !== ownerHost
        || snapshotSignature(positionSignature(capturePlacementGeometry(mapping()))) !== signature) { schedule(); return; }
      const priorLayer = layer; ownerScene.addChild(fresh); layer = fresh; priorLayer?.destroy(true);
      showIconHints(fullViews);
      measuredCards = cards.map(copyMeasurement);
      localDetails = timed('renderMs', () => nodeDetails.paint(details, next.viewport, clientViewport,
        [...final, ...carousels, ...next.controls].map(client).filter(Boolean), drawing, client));
      const visible = new Set([...final, ...localDetails].map(({ id }) => key(id)));
      lastLayout = { placements: final, carousels, overflow: rows.filter(({ node }) => !visible.has(key(node.id)))
        .map(({ node }) => ({ id: node.id, reason: anchors.has(key(node.id)) ? '节点详情暂不可用' : '节点不在可见地图或几何待就绪' })),
        diagnostics: result.diagnostics || null, attempts };
      previous = final.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
      if (detailRows.length && !final.length && !localDetails.length) displayStatus('no-display-space', '未找到节点详情位置');
      else displayStatus(rows.length ? next.ready ? 'ready' : 'geometry-pending' : 'no-content', next.reason || null);
      committedPosition = position; lastSignature = signature; revision++;
    } finally {
      job.task?.cancel(); job.task = null;
      for (const sprite of transient) if (!sprite.destroyed && !sprite.parent) sprite.destroy(true);
    }
  }
  function refresh() {
    if (!alive() || !enabled || frozen) return;
    if (!host || host.destroyed || !scene || scene.destroyed) { clear(); return; }
    const L = engine();
    if (!L?.Sprite || !L?.Text) { cancelWork(); lastSignature = ''; displayStatus('engine-unavailable', 'Laya Sprite/Text 尚未就绪'); return; }
    try {
      const started = now(), next = capturePlacementGeometry(mapping()), position = positionSignature(next);
      const signature = snapshotSignature(position);
      if (signature === lastSignature || signature === work?.signature) {
        if (['no-display-space', 'viewport-unavailable'].includes(status.state)) displayStatus(status.state, status.reason);
        return;
      }
      cancelWork(); waitForImages(next.pending);
      geometry = { ready: next.ready, controlsComplete: next.controlsComplete, viewport: next.viewport, nodes: next.nodes,
        controls: next.controls, shop: next.shop, signature: next.signature, reason: next.reason || null, diagnostics: next.diagnostics || null };
      lastSignature = '';
      // Keep the latest committed cards available during content refreshes.
      // Changes to map geometry can invalidate the old positions immediately.
      if (position !== committedPosition) { destroyLayer(); nodeDetails.clear(); localDetails = []; }
      if (!next.viewport) {
        lastLayout = null; previous = []; measuredCards = [];
        lastSignature = signature; displayStatus('viewport-unavailable', next.reason || '可见画布边界不可用'); return;
      }
      const job = { next, position, signature, ownerScene: scene, ownerHost: host, rows: sourceRows.slice(), started,
        performance: { geometryMs: now() - started, measureMs: 0, solveMs: 0, renderMs: 0, workMs: 0,
          elapsedMs: 0, slices: 0, maxSliceMs: 0 }, task: null, iterator: null };
      job.iterator = renderLayout(job); work = job; displayStatus('placing'); queueWork();
    } catch (error) { cancelWork(); fail(error); }
  }
  function clear() {
    cancelScheduled();
    enabled = frozen = false; cancelWork(); release(sceneCleanup); resetVisuals(); scene = host = null; source = []; sourceRows = []; contentSignature = '';
    mapProgress = null;
    displayStatus('inactive');
  }
  function update(nextScene, nodes, nextEnabled, nextMapProgress = null) {
    if (!alive()) return;
    const nextHost = nextScene?.cityView;
    if (!nextEnabled || !nextHost || nextHost.destroyed || nextScene.destroyed) { clear(); return; }
    if (scene !== nextScene || host !== nextHost) { clear(); scene = nextScene; host = nextHost; bindScene(); }
    if (frozen) {
      // Adventures can advance the chapter map without replacing its scene.
      if (nextMapProgress === null || nextMapProgress === mapProgress) return;
      frozen = false;
      lastSignature = '';
    }
    mapProgress = nextMapProgress;
    const rows = (nodes || []).filter(node => node && node.type !== 'camp' && node.id != null)
      .map(node => ({ node, lines: labelLines(node, false) })).filter(row => row.lines.length);
    const nextSignature = JSON.stringify(rows.map(row => [row.node.id, heading(row.node), row.lines]));
    if (nextSignature !== contentSignature) cancelWork();
    sourceRows = rows; source = rows.map(row => row.node); enabled = true; contentSignature = nextSignature;
    schedule();
  }
  const offTheme = theme.watch(() => { lastSignature = ''; schedule(); });
  ctx.scope.interval(schedule, 250);
  ctx.scope.add(() => {
    disposed = true; clear(); offTheme();
  });
  return { update, clear, inspect: () => ({ geometry, lastLayout, status: { ...status }, measuredCards: measuredCards.map(copyMeasurement), localDetails: localDetails.map(item => ({ ...item, rect: { ...item.rect } })), cards: layer ? previous.map(row => ({ ...row })) : [], revision, frozen, pending: !!work || scheduled, performance: { last: lastPerformance, cancelledJobs }, caches: cardView.inspect() }) };
}
