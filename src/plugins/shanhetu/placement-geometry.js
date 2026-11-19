// Geometry is taken from the native client's explicit scene, city and control
// fields. In particular, never measure cityView's descendants as a viewport.
const EPSILON = 1e-5;
const positive = value => Number.isFinite(value) && value > 0;
const finite = value => Number.isFinite(value);
const rect = (x, y, w, h) => [x, y, w, h].every(finite) && w > 0 && h > 0 ? { x, y, w, h } : null;
const fromNativeRect = value => value && rect(value.x, value.y, value.w ?? value.width, value.h ?? value.height);
const corners = value => [
  { x: value.x, y: value.y }, { x: value.x + value.w, y: value.y },
  { x: value.x + value.w, y: value.y + value.h }, { x: value.x, y: value.y + value.h },
];
const boundingRect = points => {
  if (!points.every(p => finite(p?.x) && finite(p?.y))) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return rect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const intersect = (a, b) => a && b && rect(Math.max(a.x, b.x), Math.max(a.y, b.y),
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const union = values => boundingRect(values.flatMap(corners));

function reaches(node, ancestor) {
  const seen = new Set();
  for (let item = node; item && !seen.has(item); item = item.parent) {
    if (item === ancestor) return true;
    seen.add(item);
  }
  return false;
}

function visible(node, stop) {
  const seen = new Set();
  for (let item = node; item && !seen.has(item); item = item.parent) {
    // Laya Sprite.set_visible stores the supplied value verbatim. The native
    // city name uses `name && name.length > 0`, whose hidden value is ''.
    if (item.destroyed || ('visible' in item && !item.visible)
      || ('renderVisible' in item && !item.renderVisible) || item.alpha === 0) return false;
    if (item === stop) break;
    seen.add(item);
  }
  return true;
}

function nativeEmptyTexture(item) {
  // fO.getDrawSize (official cache 1948283) collapses ONLY this exact
  // sentinel to .01. Its renderWidth still exposes the declared full size.
  // p$t inherits the same static sentinel. Do not guess from pixel size,
  // filenames, alpha, or a nominally transparent-looking texture.
  return !!item && typeof item.getDrawSize === 'function' && item.texture != null
    && item.constructor?.EmptyTexture === item.texture;
}

function emptyDecoration(item) {
  if (!item || !visible(item) || item.text === '' || item.innerHTML === '' || nativeEmptyTexture(item)) return true;
  if (item.IsFlatButton === true && item.background && item.background !== item) {
    return ['background', 'wordTex', 'textField', 'redPointTex'].every(key => emptyDecoration(item[key]));
  }
  return false;
}

function emptyStaticEventMarker(item) {
  // a8t.ShowBossIcon (12738779) re-shows this gO even when the active
  // marker is eventEffect and no static texture was ever assigned. It has
  // no asynchronous image loader. Inspect backing graphics, since the
  // public graphics getter would allocate one and mutate the native node.
  if (!item || typeof item.localToGlobal !== 'function' || item.texture != null
    || item.width !== 0 || item.height !== 0 || item.numChildren !== 0) return false;
  const graphics = item._graphics;
  return !graphics || (!graphics._one && !graphics._cmds?.length);
}

function recordException(diagnostics, error, phase) {
  if (diagnostics) diagnostics.exception = {
    phase, name: typeof error?.name === 'string' ? error.name.slice(0,80) : 'Error',
    message: typeof error?.message === 'string' ? error.message.slice(0,240) : 'Geometry operation failed',
  };
}

function recordPending(diagnostics, item, field, reason = 'missing-rendered-size') {
  if (!diagnostics) return;
  const number = key => { try { return finite(item?.[key]) ? item[key] : null; } catch { return null; } };
  const contract = !item ? 'missing' : item.IsFlatButton === true ? 'flat-button'
    : typeof item.localToGlobal === 'function' ? 'sprite'
      : item.render || item.Render ? 'draw-object' : 'explicit-rectangle';
  (diagnostics.pendingDetails ||= []).push({ field, reason, contract,
    width: number('width'), height: number('height'), renderWidth: number('renderWidth'), renderHeight: number('renderHeight'),
    textureWidth: number('textureWidth'), textureHeight: number('textureHeight') });
}

function mapPoints(value, from, to, diagnostics) {
  if (!from || !to || typeof from.localToGlobal !== 'function' || typeof to.globalToLocal !== 'function') return null;
  try {
    const points = corners(value).map(point => to.globalToLocal(from.localToGlobal(point, true), true));
    return points.every(point => finite(point?.x) && finite(point?.y)) ? points : null;
  } catch (error) { recordException(diagnostics, error, 'native-coordinate-transform'); return null; }
}

/** Transform all four corners; suitable for protecting a rendered rectangle. */
export function transformRect(value, from, to, diagnostics) {
  const input = fromNativeRect(value);
  const points = input && mapPoints(input, from, to, diagnostics);
  return points ? boundingRect(points) : null;
}

function aligned(points) {
  return points && Math.abs(points[0].y - points[1].y) < EPSILON
    && Math.abs(points[1].x - points[2].x) < EPSILON
    && Math.abs(points[2].y - points[3].y) < EPSILON
    && Math.abs(points[3].x - points[0].x) < EPSILON;
}

function transformClip(value, from, to, diagnostics) {
  const input = fromNativeRect(value), points = input && mapPoints(input, from, to, diagnostics);
  // An AABB around a rotated clip would include pixels outside that clip.
  return aligned(points) ? boundingRect(points) : null;
}

function cssAxisAligned(style) {
  if (!style) return false;
  if (style.perspective && style.perspective !== 'none') return false;
  if (style.rotate && style.rotate !== 'none' && style.rotate !== '0deg') return false;
  if (style.scale && style.scale !== 'none' && !style.scale.split(/\s+/).every(value => positive(Number(value)))) return false;
  const transform = style.transform;
  if (!transform || transform === 'none') return true;
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!match) return false;
  const values = match[1].split(',').map(Number);
  return values.length === 6 && values.every(finite) && values[0] > 0 && values[3] > 0
    && Math.abs(values[1]) < EPSILON && Math.abs(values[2]) < EPSILON;
}

function domRect(element) {
  const value = element?.getBoundingClientRect?.();
  return value && rect(value.left ?? value.x, value.top ?? value.y, value.width, value.height);
}

function clientMapping({ stage, canvas, window: browserWindow }, diagnostics = {}) {
  const fail = (reason, detail) => { diagnostics.reason = reason; diagnostics.detail = detail; return null; };
  if (!stage || !canvas || !browserWindow || typeof browserWindow.getComputedStyle !== 'function') return fail('invalid-client-mapping', 'missing-client-surface');
  if (stage.canvasRotation || (stage.canvasDegree && stage.canvasDegree % 360)) return fail('transform-unsupported', 'rotated-stage');
  const canvasRect = domRect(canvas);
  if (!canvasRect || !positive(canvas.width) || !positive(canvas.height)) return fail('invalid-client-mapping', 'invalid-canvas-size');
  diagnostics.canvas = { ...canvasRect, pixelWidth: canvas.width, pixelHeight: canvas.height };
  const matrix = stage.transform || stage._transform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const { a, b, c, d, tx = 0, ty = 0 } = matrix;
  if (![a, b, c, d, tx, ty].every(finite) || !positive(a) || !positive(d)
    || Math.abs(b) > EPSILON || Math.abs(c) > EPSILON) return fail('transform-unsupported', 'invalid-stage-matrix');
  const screen = rect(0, 0, browserWindow.innerWidth, browserWindow.innerHeight);
  if (!screen) return fail('invalid-client-mapping', 'invalid-window-viewport');
  diagnostics.screen = screen;
  let clip = intersect(canvasRect, screen);
  const vv = browserWindow.visualViewport;
  if (vv) {
    const visual = rect(vv.offsetLeft, vv.offsetTop, vv.width, vv.height);
    if (!visual) return fail('invalid-client-mapping', 'invalid-visual-viewport');
    clip = intersect(clip, visual);
  }
  const document = canvas.ownerDocument || browserWindow.document;
  const root = document?.documentElement, body = document?.body;
  const rootStyle = root ? browserWindow.getComputedStyle(root) : null;
  const bodyStyle = body ? browserWindow.getComputedStyle(body) : null;
  const contains = style => style?.contain && style.contain !== 'none';
  // CSS Overflow 3 §3.3: root overflow belongs to the viewport. If HTML's
  // overflow is visible in BOTH axes, BODY supplies it instead, unless
  // containment disables propagation. That source element then has used
  // overflow:visible; a zero-height body is not a zero-height canvas clip.
  // https://www.w3.org/TR/css-overflow-3/#overflow-propagation
  const bodyPropagates = root?.tagName?.toLowerCase() === 'html' && body?.parentElement === root
    && rootStyle?.display !== 'none' && bodyStyle?.display !== 'none'
    && rootStyle?.overflowX === 'visible' && rootStyle?.overflowY === 'visible'
    && !contains(rootStyle) && !contains(bodyStyle);
  diagnostics.overflowSource = bodyPropagates ? 'body-viewport' : root ? 'root-viewport' : 'unknown-document-root';
  for (let element = canvas; element; element = element.parentElement) {
    const style = browserWindow.getComputedStyle(element);
    if (!cssAxisAligned(style) || (style.clipPath && style.clipPath !== 'none')
      || (style.maskImage && style.maskImage !== 'none')
      || (style.clip && style.clip !== 'auto')) return fail('transform-unsupported', 'unsupported-css-transform-or-mask');
    if (element === canvas) {
      if (style.objectFit && style.objectFit !== 'fill') return fail('transform-unsupported', 'unsupported-canvas-object-fit');
      for (const key of ['borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
        if ((parseFloat(style[key]) || 0) !== 0) return fail('transform-unsupported', 'canvas-border-or-padding');
      }
    } else {
      // Window/visualViewport above already supplies the actual root clip.
      // All ordinary containers, including non-propagating BODY, still use
      // their own padding-box clip below.
      if (element === root || (element === body && bodyPropagates)) continue;
      const clipX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
      const clipY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
      if (clipX || clipY) {
        const box = domRect(element);
        if (!box || !positive(element.offsetWidth) || !positive(element.offsetHeight)) return fail('clip-empty', 'empty-css-ancestor');
        const sx = box.w / element.offsetWidth, sy = box.h / element.offsetHeight;
        const paddingBox = rect(box.x + element.clientLeft * sx, box.y + element.clientTop * sy,
          element.clientWidth * sx, element.clientHeight * sy);
        if (!paddingBox || !clip) return fail('clip-empty', 'empty-css-padding-box');
        clip = intersect(clip, {
          x: clipX ? paddingBox.x : clip.x, y: clipY ? paddingBox.y : clip.y,
          w: clipX ? paddingBox.w : clip.w, h: clipY ? paddingBox.h : clip.h,
        });
      }
    }
  }
  if (!clip) return fail('clip-empty', 'canvas-outside-client-viewport');
  diagnostics.clientClip = clip;
  const sx = canvasRect.w / canvas.width, sy = canvasRect.h / canvas.height;
  const stageClip = stage.scrollRect ? fromNativeRect(stage.scrollRect) : null;
  if (stage.scrollRect && !stageClip) return fail('clip-empty', 'invalid-stage-scroll-rect');
  const scrollX = stageClip?.x || 0, scrollY = stageClip?.y || 0;
  return {
    clip,
    // RenderSprite._clip draws content at (-scrollRect.x,-scrollRect.y).
    // Stage is excluded by Sprite.localToGlobal, so account for it here.
    toClient: point => ({ x: canvasRect.x + ((point.x - scrollX) * a + tx) * sx, y: canvasRect.y + ((point.y - scrollY) * d + ty) * sy }),
    toStage: point => ({ x: ((point.x - canvasRect.x) / sx - tx) / a + scrollX, y: ((point.y - canvasRect.y) / sy - ty) / d + scrollY }),
  };
}

/** Convert a cityView rectangle to fixed-position CSS coordinates. */
export function placementRectToClient(value, context) {
  try {
    const input = fromNativeRect(value), mapping = clientMapping(context);
    if (!input || !mapping || !reaches(context.cityView, context.stage)) return null;
    const points = corners(input).map(point => mapping.toClient(context.cityView.localToGlobal(point, true)));
    return aligned(points) ? boundingRect(points) : null;
  } catch { return null; }
}

function nativeRect(item, cityView, owner, diagnostics) {
  if (!item || !visible(item, cityView) || nativeEmptyTexture(item)) return null;
  // Native $jt extends EO (cached client 9901351): flat buttons expose
  // renderX/Y but NOT renderWidth/Height. Their fO background already
  // includes the button's position/scale through parentContainer.
  if (item.IsFlatButton === true) {
    if (!item.background || item.background === item) return null;
    const regions = [];
    for (const key of ['background', 'wordTex', 'textField', 'redPointTex']) {
      const part = item[key];
      if (emptyDecoration(part)) continue;
      const area = nativeRect(part, cityView, undefined, diagnostics);
      if (!area) return null;
      regions.push(area);
    }
    return regions.length ? union(regions) : null;
  }
  if (typeof item.localToGlobal === 'function') {
    const width = positive(item.width) ? item.width : item.textWidth || item.contextWidth;
    const height = positive(item.height) ? item.height : item.textHeight || item.contextHeight;
    return transformRect({ x: 0, y: 0, w: width, h: height }, item, cityView, diagnostics);
  }
  // Official cached sgsGame_a.sgs, SHA-256:
  // c1f3d824d59a7c2ca9f335cbe50fcc24dd4cd75a614fadf26cf65ddd7b668473.
  // fO at
  // character 1935753: renderX/Y include parentContainer; renderWidth/Height
  // are width/height * renderScaleX/Y (1939202). p$t extends fO; CO has
  // the same contract (2000705). These EventDispatchers are not Sprites.
  const render = item.render || item.Render;
  if (render && finite(item.renderX) && finite(item.renderY)) {
    if (item.rotation || item.rotationRadian) return null;
    const width = item.renderWidth, height = item.renderHeight;
    const input = rect(item.renderX - (item.AnchorsX || 0) * width,
      item.renderY - (item.AnchorsY || 0) * height, width, height);
    return input && visible(render, cityView) ? transformRect(input, render, cityView, diagnostics) : null;
  }
  // Some native seat helpers expose only an explicitly positioned rectangle
  // and use their owning scene to draw it. No child-tree bounds are consulted.
  if (owner && finite(item.x) && finite(item.y)) {
    if (item.rotation || item.rotationRadian || item.pivotX || item.pivotY || item.AnchorsX || item.AnchorsY
      || (item.scaleX != null && item.scaleX !== 1) || (item.scaleY != null && item.scaleY !== 1)) return null;
    return transformRect({ x: item.x, y: item.y, w: item.ScaledWidth ?? item.width,
      h: item.ScaledHeight ?? item.height }, owner, cityView, diagnostics);
  }
  return null;
}

function collectControls(scene, cityView, diagnostics) {
  const result = [], pending = [];
  const add = (item, owner, field) => {
    if (!item || !visible(item) || !visible(item.render || item.Render || owner)) return;
    if (emptyDecoration(item)) return;
    const value = nativeRect(item, cityView, owner, diagnostics);
    if (value) result.push(value);
    else { pending.push(item); recordPending(diagnostics, item, field); }
    return value;
  };
  const top = scene.topProcesserView;
  if (top && visible(top)) for (const key of ['barbg', 'bossicon', 'bossTxtBg', 'bossTxtIcon', 'nameTxt', 'yearTxt', 'monthTxt', 'tongqian']) add(top[key], top, `topProcesserView.${key}`);
  const left = scene.leftView;
  let shop = null;
  if (left && visible(left)) {
    for (const key of ['bg', 'titleLeftTex', 'titleTex', 'seedbg', 'seedIcon', 'seedTxt', 'helpBtn', 'diffInfoUI']) add(left[key], left, `leftView.${key}`);
    shop = add(left.shopBtn, left, 'leftView.shopBtn') || null;
  }
  const bottom = scene.bottomView;
  if (bottom && visible(bottom)) {
    for (const key of ['selfSeatUi', 'zhanfaItemTex', 'changeIcon', 'backupPanel', 'matePart', 'btnRefine']) add(bottom[key], bottom, `bottomView.${key}`);
    for (const key of ['cardItemList', 'skillItemList']) if (Array.isArray(bottom[key])) bottom[key].forEach((item, index) => add(item, bottom, `bottomView.${key}[${index}]`));
  }
  // The player portrait and raid entry are native siblings of city nodes.
  add(cityView.playerPoint, cityView, 'cityView.playerPoint');
  if (cityView.raidItem && visible(cityView.raidItem)) {
    for (const key of ['raid', 'nameBg', 'raidName']) add(cityView.raidItem[key], cityView.raidItem, `cityView.raidItem.${key}`);
  }
  return { controls: result, shop, pending };
}

function cityEntries(dictionary) {
  const values = [];
  if (!dictionary || typeof dictionary.forEach !== 'function') return null;
  dictionary.forEach((first, second) => {
    // SNt calls (key, value), whereas Map calls (value, key).
    const value = first && typeof first === 'object' ? first : second;
    if (value && typeof value === 'object') values.push(value);
  });
  return values;
}

function geometrySignature(result) {
  const encodeRect = value => value && [value.x, value.y, value.w, value.h].map(number => Math.round(number * 64) / 64);
  return JSON.stringify([result.ready, result.reason, result.controlsComplete, encodeRect(result.viewport), encodeRect(result.shop),
    result.nodes.map(node => [node.id, encodeRect(node.anchor), node.regions.map(encodeRect)]), result.controls.map(encodeRect)]);
}

/** Pure snapshot; the renderer owns COMPLETE/resize subscriptions and cleanup. */
export function capturePlacementGeometry(context) {
  const diagnostics = { phase: 'context' };
  const result = { ready: false, reason: 'not-ready', viewport: null, nodes: [], controls: [], shop: null, controlsComplete: null,
    pending: [], signature: '', diagnostics };
  const finish = reason => {
    result.reason = reason || (result.ready ? 'ready' : 'not-ready');
    diagnostics.nodeCount = result.nodes.length;
    diagnostics.controlCount = result.controls.length;
    diagnostics.pendingCount = result.pending.length;
    result.signature = geometrySignature(result);
    return result;
  };
  try {
    const { cityView, scene, stage } = context;
    if (!cityView || !scene || !stage) return finish('missing-native-context');
    if (!visible(cityView)) return finish('inactive-scene');
    if (!reaches(cityView, scene) || !reaches(scene, stage)) return finish('detached-scene');
    if (stage.mask) return finish('transform-unsupported');
    diagnostics.phase = 'client-mapping';
    const mapping = clientMapping(context, diagnostics);
    if (!mapping) return finish(diagnostics.reason || 'invalid-client-mapping');
    diagnostics.phase = 'scene-viewport';
    const sceneRect = rect(0, 0, scene.width, scene.height);
    if (!sceneRect) return finish('empty-scene-viewport');
    let viewport = transformClip(sceneRect, scene, cityView, diagnostics);
    if (!viewport) return finish('transform-unsupported');
    diagnostics.phase = 'ancestor-clip';
    for (let ancestor = cityView; ancestor && ancestor !== stage; ancestor = ancestor.parent) {
      if (ancestor.mask) return finish('transform-unsupported');
      if (ancestor.scrollRect) {
        if (!fromNativeRect(ancestor.scrollRect)) return finish('clip-empty');
        const clip = transformClip(ancestor.scrollRect, ancestor, cityView, diagnostics);
        if (!clip) return finish('transform-unsupported');
        if (!(viewport = intersect(viewport, clip))) return finish('clip-empty');
      }
    }
    if (stage.scrollRect) {
      const stageClip = transformClip(stage.scrollRect, stage, cityView, diagnostics);
      if (!stageClip) return finish('transform-unsupported');
      if (!(viewport = intersect(viewport, stageClip))) return finish('clip-empty');
    }
    const clientPoints = corners(mapping.clip).map(point => cityView.globalToLocal(mapping.toStage(point), true));
    if (!aligned(clientPoints)) return finish('transform-unsupported');
    if (!(viewport = intersect(viewport, boundingRect(clientPoints)))) return finish('clip-empty');
    result.viewport = viewport;
    diagnostics.phase = 'city-nodes';
    const cities = cityEntries(cityView.cityItemDic);
    if (!cities) return finish('missing-city-dictionary');
    const ids = new Set();
    for (const city of cities) {
      if (!visible(city, cityView)) continue;
      const id = Number(city.CityId ?? city.levelVo?.CityID);
      if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id) || !reaches(city, cityView)) return finish('invalid-city-identity');
      ids.add(id);
      const image = city.cityImg;
      if (!image || nativeEmptyTexture(image) || !positive(image.textureWidth) || !positive(image.textureHeight)) {
        recordPending(diagnostics, image, `cities[${id}].cityImg`, 'image-not-loaded');
        result.pending.push(image || city); continue;
      }
      const body = nativeRect(image, cityView, city, diagnostics);
      if (!body) { recordPending(diagnostics, image, `cities[${id}].cityImg`); return finish('invalid-native-geometry'); }
      const regions = [body], anchorParts = [body];
      for (const key of ['citynameImg', 'citynameTxt']) {
        const item = city[key];
        const area = nativeRect(item, cityView, undefined, diagnostics);
        if (area) { regions.push(area); anchorParts.push(area); }
        else if (item && !emptyDecoration(item) && visible(item.render || item.Render)) {
          result.pending.push(item); recordPending(diagnostics, item, `cities[${id}].${key}`);
        }
      }
      for (const item of [city.citynameTagTex, city.eventtypeImg]) {
        if (emptyDecoration(item) || (item === city.eventtypeImg && emptyStaticEventMarker(item))) continue;
        const area = nativeRect(item, cityView, undefined, diagnostics);
        if (area) regions.push(area);
        else if (item === city.eventtypeImg && item && visible(item)) {
          result.pending.push(item); recordPending(diagnostics, item, `cities[${id}].eventtypeImg`);
        }
      }
      // Animated Spine bounds, selection glows and temporary speech bubbles
      // deliberately do not change a city's identity or its stable geometry.
      result.nodes.push({ id, anchor: union(anchorParts), regions });
    }
    result.nodes.sort((a, b) => a.id - b.id);
    const cityPendingCount = result.pending.length;
    diagnostics.phase = 'controls';
    const controls = collectControls(scene, cityView, diagnostics);
    result.controls = controls.controls;
    result.shop = controls.shop;
    result.controlsComplete = controls.pending.length === 0;
    result.pending.push(...controls.pending);
    // Native UI is now a soft placement cost. Keep unresolved controls in
    // pending for COMPLETE subscriptions and diagnostics, but do not hide
    // every map card while an optional control is waiting for dimensions.
    // Cities remain strict because their geometry determines card ownership.
    result.ready = cityPendingCount === 0;
    diagnostics.cityPendingCount = cityPendingCount;
    diagnostics.controlPendingCount = controls.pending.length;
    diagnostics.controlCoverage = result.controlsComplete ? 'complete' : 'known-controls-only';
    diagnostics.phase = result.ready ? 'complete' : 'native-geometry';
    return finish(!result.ready ? 'native-geometry-pending'
      : result.controlsComplete ? 'ready' : 'ready-with-unresolved-controls');
  } catch (error) {
    recordException(diagnostics, error, diagnostics.phase);
    return finish('geometry-exception');
  }
}
