export function watchSkinDetail(scope, owner, hide) {
  let closing = false;
  const releases = [];
  for (const key of ['Close', 'startAnimateOut']) if (typeof owner[key] === 'function') {
    releases.push(scope.patch(owner, key, original => function (...args) {
      closing = true; hide(); return Reflect.apply(original, this, args);
    }));
  }
  if (typeof owner.enterWindow === 'function') releases.push(scope.patch(owner, 'enterWindow', original => function (...args) {
    closing = false; return Reflect.apply(original, this, args);
  }));
  return { get closing() { return closing; }, dispose() { [...releases].reverse().forEach(fn => fn()); } };
}
export function findSkinDetail(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    if (node.skinData?.skinBaseVo && node.skinImg && typeof node.showMaxSkinWindow === 'function'
      && typeof node.updateSkinInfo === 'function') return node;
    if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return null;
}
