import { MAP_SCENES } from './model.js';

// Own only the map's existing button; keep server shop flags and click handling intact.
export function createShopButtonReveal(ctx) {
  let owner = null, button = null, prior = false, off = null;
  function restore() {
    off?.(); off = null;
    if (button && !button.destroyed && button.visible === true) button.visible = prior;
    owner = button = null;
  }
  function reveal() {
    if (!button || button.destroyed) return;
    if (button.visible !== true) { prior = button.visible; button.visible = true; }
  }
  function refresh(scene, enabled = true) {
    const left = enabled && MAP_SCENES.has(scene?.SceneName || scene?.sceneName || scene?.name) ? scene?.leftView : null;
    const next = left?.shopBtn;
    if (owner !== left || button !== next || next?.destroyed) {
      restore();
      if (!left || !next || next.destroyed) return;
      owner = left; button = next; prior = next.visible;
      if (typeof left.UpdateShopData === 'function') off = ctx.scope.patch(left, 'UpdateShopData', original => function (...args) {
        const result = original.apply(this, args);
        if (this === owner && this.shopBtn === button) { prior = button.visible; reveal(); }
        return result;
      });
    }
    reveal();
  }
  ctx.scope.add(restore);
  return { refresh, clear: restore };
}
