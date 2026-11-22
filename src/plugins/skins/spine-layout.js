export function checkedFrame(x, y, width, height) {
  if ([x, y, width, height].every(Number.isFinite) && width > 1 && height > 1) return { x, y, width, height };
}

export function rotatedFrame(frame, rotation) {
  if (!rotation) return frame;
  const { x, y, width, height } = frame;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
  const xs = corners.map(([x, y]) => x * cos - y * sin);
  const ys = corners.map(([x, y]) => x * sin + y * cos);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function attachmentFrame(spine, slot, rotation = 0) {
  const attachment = slot?.getAttachment();
  if (!slot?.color.a || !attachment?.color?.a) return;
  let vertices;
  if (attachment instanceof spine.RegionAttachment) {
    vertices = new Float32Array(8);
    attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
  } else if (attachment instanceof spine.MeshAttachment) {
    vertices = new Float32Array(attachment.worldVerticesLength);
    attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
  } else return;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i] * cos + vertices[i + 1] * sin;
    const y = vertices[i] * sin - vertices[i + 1] * cos;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return checkedFrame(left, top, right - left, bottom - top);
}
