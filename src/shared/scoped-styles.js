export function scopedStyles(document, scope, css) {
  const installed = new WeakSet();
  return container => {
    const root = container.getRootNode();
    const target = root.host ? root : document.head || document.documentElement;
    if (installed.has(target)) return;
    const style = document.createElement('style');
    style.textContent = css;
    target.append(style);
    installed.add(target);
    scope.add(() => style.remove());
  };
}
