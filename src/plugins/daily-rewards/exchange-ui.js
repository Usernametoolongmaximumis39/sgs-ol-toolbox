import { findExchangeViews } from './exchange-native.js';

export function createExchangeUI(ctx, controller, adapter) {
  const doc = ctx.document, controls = new Map(), owners = new Map(), root = doc.createElement('div');
  root.dataset.shopAutoExchange = '';
  const style = doc.createElement('style');
  style.textContent = `[data-shop-auto-exchange]{position:fixed;inset:0;pointer-events:none;z-index:10020}
    [data-shop-auto-exchange] button{position:absolute;pointer-events:auto;box-sizing:border-box;height:24px;min-width:62px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid #63583e;border-radius:12px;background:linear-gradient(#302c24,#191a1b);box-shadow:0 2px 5px #0007,inset 0 1px #ffffff0a;color:#bcb5a5;font:11px/22px 'Microsoft YaHei',sans-serif;cursor:pointer;white-space:nowrap}
    [data-shop-auto-exchange] button[aria-checked=true]{border-color:#b99b5d;color:#f1d797;background:linear-gradient(#4a3e25,#29251e)}
    [data-shop-auto-exchange] button:focus-visible{outline:2px solid #f1d797;outline-offset:2px}
    [data-shop-auto-exchange] button:disabled{cursor:default;opacity:.55}
    [data-shop-auto-exchange] .exchange-mark{font-size:12px;width:12px;text-align:center}
    [data-shop-auto-exchange] button:hover:not(:disabled){border-color:#e1c382}`;
  root.append(style); doc.body.append(root);
  function refresh() {
    const L = ctx.window.Laya ?? ctx.window.laya, stage = L?.stage;
    const canvas = L?.Render?.canvas || doc.querySelector('canvas'), rect = canvas?.getBoundingClientRect?.();
    const snapshot = adapter.snapshot(), view = controller.view(), seen = new Set();
    if (rect?.width && stage?.width) for (const shop of findExchangeViews(stage)) for (const item of shop.itemList) {
      const id = item?.limitInfo?.ItemID;
      if (!item.goodsinfo || item.visible === false || item.destroyed || !snapshot.rows.some(row => row.id === id)) continue;
      // Official shop goods are flat draw items, not Laya Sprite children.
      const point = shop.localToGlobal?.(new L.Point(item.x + item.width - 52, item.y + 3));
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      seen.add(item);
      let button = controls.get(item);
      if (!button) {
        button = doc.createElement('button'); button.type = 'button'; button.setAttribute('role', 'checkbox');
        button.innerHTML = '<span class="exchange-mark" aria-hidden="true"></span><span class="exchange-label"></span>';
        button.addEventListener('click', event => { event.stopPropagation(); const current = item.limitInfo?.ItemID; controller.toggle(current, !controller.selected(current)); refresh(); });
        for (const event of ['pointerdown', 'mousedown', 'dblclick']) button.addEventListener(event, e => e.stopPropagation());
        root.append(button); controls.set(item, button); owners.set(item, shop);
      }
      const selected = controller.selected(id), period = { 1: '每日', 2: '每周', 3: '每月' }[item.limitInfo.MaxBuyType];
      button.disabled = !adapter.account() || !period || !(item.limitInfo.MaxBuyCount > 0);
      button.setAttribute('aria-checked', String(selected));
      button.setAttribute('aria-label', `${item.goodsinfo.name || '商品'}自动兑换`);
      button.title = period ? `${period}兑换至限购上限，消耗地主豆；按账号保存。选中后等待5秒，取消选择可停止尚未发送的购买。余额不足时仅兑换可负担数量，等待地主豆余额变化。` : '无周期限购，不支持自动兑换';
      button.querySelector('.exchange-mark').textContent = selected ? '✓' : '+';
      button.querySelector('.exchange-label').textContent = view.countdown?.id === id ? `${view.countdown.seconds}秒` : selected ? '已选' : '自动';
      button.style.left = `${rect.left + point.x * rect.width / stage.width}px`;
      button.style.top = `${rect.top + point.y * rect.height / stage.height}px`;
    }
    for (const [item, button] of controls) if (!seen.has(item)) { button.remove(); controls.delete(item); owners.delete(item); }
  }
  // Visibility and positioning follow the native frame, independently of the
  // slower business-data poll. Flat items have no display lifecycle of their own.
  let frame;
  const requestFrame = typeof ctx.window.requestAnimationFrame === 'function'
    ? callback => ctx.window.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
  const cancelFrame = typeof ctx.window.cancelAnimationFrame === 'function'
    ? id => ctx.window.cancelAnimationFrame(id) : id => clearTimeout(id);
  const followWindow = () => {
    const L = ctx.window.Laya ?? ctx.window.laya, stage = L?.stage;
    const canvas = L?.Render?.canvas || doc.querySelector('canvas'), rect = canvas?.getBoundingClientRect?.();
    for (const [item, button] of controls) {
      const shop = owners.get(item); let connected = false, hidden = item.destroyed || item.visible === false;
      for (let node = shop, depth = 0; node && depth++ < 64; node = node.parent) {
        if (node.destroyed || node.visible === false || node.alpha < .99) hidden = true;
        if (node === stage) { connected = true; break; }
      }
      button.hidden = hidden || !connected;
      // Author styles set display:flex, so explicitly override it when hidden.
      button.style.display = button.hidden ? 'none' : 'flex';
      if (!button.hidden && rect?.width && stage?.width) {
        const point = shop.localToGlobal?.(new L.Point(item.x + item.width - 52, item.y + 3));
        if (point) {
          button.style.left = `${rect.left + point.x * rect.width / stage.width}px`;
          button.style.top = `${rect.top + point.y * rect.height / stage.height}px`;
        }
      }
    }
    frame = requestFrame(followWindow);
  };
  frame = requestFrame(followWindow);
  ctx.scope.add(() => { cancelFrame(frame); controls.clear(); owners.clear(); root.remove(); });
  return { refresh };
}
