export function isNativeNodeMounted(node, stage, maxDepth = Infinity, checkAlpha = false) {
  for (let depth = 0; node && depth < maxDepth; depth++, node = node.parent) {
    if (node.destroyed || node.visible === false || (checkAlpha && node.alpha === 0)) return false;
    if (node === stage) return true;
  }
  return false;
}

export function isNativeNodeVisibleOnStage(node, stage) {
  return isNativeNodeMounted(node, stage, Infinity, true);
}
