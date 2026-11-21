export function supportsSkinBackgroundAttack(dynamic) {
  return dynamic?.kind === 'spine' && dynamic.modern === true && dynamic.attack !== false;
}

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
export function isSkinDetail(node) {
  return typeof node?.showMaxSkinWindow === 'function' && typeof node.updateSkinInfo === 'function'
    && Boolean(node.skinData?.skinBaseVo && node.skinImg);
}

export function findSkinDetail(stage) {
  const queue = stage ? [stage] : [];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const node = queue[i];
    if (!node || node.destroyed || node.visible === false) continue;
    if (isSkinDetail(node)) return node;
    const children = node._children;
    if (Array.isArray(children)) for (let j = 0; j < children.length && queue.length < 4000; j++) queue.push(children[j]);
  }
  return null;
}
