export function rectCorners({ x, y, w, h }) {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}

export function enclosingRect(points) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
