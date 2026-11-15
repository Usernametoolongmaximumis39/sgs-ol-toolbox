// The overlay is a scene sibling of the native UI, while all placement
// coordinates remain local to cityView. Native scene/map nodes are read only.
const EPSILON = 1e-6;
const finite = Number.isFinite;

function overlayGeometry({ host, scene, viewport }) {
  if (!host || !scene || host.destroyed || scene.destroyed
    || typeof host.localToGlobal !== 'function' || typeof scene.globalToLocal !== 'function') {
    throw new Error('地图浮层缺少有效原生坐标接口');
  }
  const ancestors = new Set();
  let ancestor = host;
  while (ancestor && ancestor !== scene && !ancestors.has(ancestor)) {
    ancestors.add(ancestor); ancestor = ancestor.parent;
  }
  if (ancestor !== scene) throw new Error('地图浮层所属场景已分离');
  if (!viewport || ![viewport.x, viewport.y, viewport.w, viewport.h].every(finite)
    || viewport.w <= 0 || viewport.h <= 0) throw new Error('地图浮层可见区域无效');
  const map = (x, y) => {
    const point = scene.globalToLocal(host.localToGlobal({ x, y }, true), true);
    if (!finite(point?.x) || !finite(point?.y)) throw new Error('地图浮层坐标变换产生无效数值');
    return { x: point.x, y: point.y };
  };
  const origin = map(0, 0), unitX = map(1, 0), unitY = map(0, 1);
  const matrix = {
    a: unitX.x - origin.x, b: unitX.y - origin.y,
    c: unitY.x - origin.x, d: unitY.y - origin.y,
    tx: origin.x, ty: origin.y,
  };
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Object.values(matrix).every(finite) || !finite(determinant) || determinant === 0) {
    throw new Error('地图浮层坐标变换不可逆');
  }
  // A rotated or skewed viewport cannot be represented by one scrollRect.
  // Do not expand its AABB and accidentally expose pixels outside the clip.
  if (Math.abs(matrix.b) > EPSILON || Math.abs(matrix.c) > EPSILON) {
    throw new Error('地图浮层暂不支持旋转或斜切裁剪');
  }
  const points = [
    [viewport.x, viewport.y], [viewport.x + viewport.w, viewport.y],
    [viewport.x + viewport.w, viewport.y + viewport.h], [viewport.x, viewport.y + viewport.h],
  ].map(([x, y]) => {
    const point = map(x, y);
    if (Math.abs(point.x - (matrix.a * x + matrix.c * y + matrix.tx)) > EPSILON
      || Math.abs(point.y - (matrix.b * x + matrix.d * y + matrix.ty)) > EPSILON) {
      throw new Error('地图浮层坐标变换不是可靠仿射映射');
    }
    return point;
  });
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const clip = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  if (![clip.x, clip.y, clip.w, clip.h].every(finite) || clip.w <= 0 || clip.h <= 0) {
    throw new Error('地图浮层映射后可见区域无效');
  }
  return { matrix, clip };
}

/** Include this in renderer invalidation: scene and host can move separately. */
export function placementOverlaySignature(context) {
  const { matrix, clip } = overlayGeometry(context);
  return JSON.stringify([matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty, clip.x, clip.y, clip.w, clip.h]);
}

/**
 * Create a detached overlay. The caller commits it with scene.addChild(root)
 * and owns root.destroy(true). Add cards/lines to content in cityView units.
 */
export function createPlacementOverlay(L, context) {
  if (typeof L?.Sprite !== 'function' || typeof L?.Matrix !== 'function' || typeof L?.Rectangle !== 'function') {
    throw new Error('地图浮层缺少 Laya Sprite/Matrix/Rectangle');
  }
  const { matrix, clip } = overlayGeometry(context);
  let root = null, content = null;
  try {
    root = new L.Sprite();
    root.name = 'sgs-shanhetu-labels-v2';
    root.mouseEnabled = false;
    root.pos(clip.x, clip.y);
    root.size(clip.w, clip.h);
    // A nonzero scrollRect origin translates Laya content. Use a positioned
    // wrapper with a zero-origin clip instead, preserving every card point.
    root.scrollRect = new L.Rectangle(0, 0, clip.w, clip.h);
    content = new L.Sprite();
    content.name = 'sgs-shanhetu-label-content-v2';
    content.mouseEnabled = false;
    root.addChild(content);
    content.transform = new L.Matrix(matrix.a, matrix.b, matrix.c, matrix.d,
      matrix.tx - clip.x, matrix.ty - clip.y);
    return { root, content };
  } catch (error) {
    if (root && !root.destroyed) root.destroy(true);
    if (content && !content.destroyed) content.destroy(true);
    throw error;
  }
}
