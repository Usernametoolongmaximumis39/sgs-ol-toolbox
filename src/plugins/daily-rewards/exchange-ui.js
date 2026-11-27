import { findExchangeViews } from './exchange-native.js';
import { isNativeNodeMounted } from '../../shared/native-tree.js';
import { read } from '../../shared/safe-read.js';
import { watchNativeWindowEvents } from '../../shared/window-cache.js';

const DISCOVERY_INTERVAL = 1500;

function shopIsVisible(shop, stage) {
  for (let node = shop, depth = 0; node && depth++ < 64; node = node.parent) {
    if (node.destroyed || node.visible === false || node.alpha < .99) return false;
    if (node === stage) return true;
    // The purchase window and the shop's enclosing window share a native layer. The modal mask
    // blocks the whole shop, including controls outside the purchase window.
    const purchase = node.parent?.getChildByName?.('GuildShopExchangeWindow');
    if (purchase && !purchase.destroyed && purchase.visible) return false;
  }
  return false;
}

export function createExchangeUI(ctx, controller, adapter) {
  const doc = ctx.document, controls = new Map(), owners = new Map(), root = doc.createElement('div');
  root.dataset.shopAutoExchange = '';
  const style = doc.createElement('style');
  style.textContent = `[data-shop-auto-exchange]{position:fixed;inset:0;pointer-events:none;z-index:10020}
    [data-shop-auto-exchange] button{position:absolute;pointer-events:auto;box-sizing:border-box;height:24px;min-width:62px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid #63583e;border-radius:12px;background:linear-gradient(#302c24,#191a1b);box-shadow:0 2px 5px #0007,inset 0 1px #ffffff0a;color:#bcb5a5;font:11px/22px 'Microsoft YaHei',sans-serif;cursor:pointer;white-space:nowrap}
    [data-shop-auto-exchange] button[aria-checked=true]{border-color:#b99b5d;color:#f1d797;background:linear-gradient(#4a3e25,#29251e)}
    [data-shop-auto-exchange] button:focus-visible{outline:2px solid #f1d797;outline-offset:2px}
    [data-shop-auto-exchange] button:disabled{cursor:default;opacity:.55}
    [data-shop-auto-exchange] button[hidden]{display:none}
    [data-shop-auto-exchange] .exchange-mark{font-size:12px;width:12px;text-align:center}
    [data-shop-auto-exchange] button:hover:not(:disabled){border-color:#e1c382}`;
  root.append(style); doc.body.append(root);
  let shops = [], previousStage, lastDiscovery = -Infinity, queued = false;
  const bindWindows = watchNativeWindowEvents(ctx.scope, null, queueDiscovery);
  function queueDiscovery() {
    if (queued || ctx.scope.signal.aborted) return;
    queued = true;
    ctx.scope.timeout(() => { queued = false; refresh(true); }, 0);
  }
  function refresh(forceDiscovery = false) {
    if (ctx.scope.signal.aborted) return;
    const L = ctx.window.Laya ?? ctx.window.laya, stage = L?.stage;
    bindWindows(stage ? read(() => ctx.game?.getDispatcher?.()) ?? null : null);
    if (stage !== previousStage) { previousStage = stage; lastDiscovery = -Infinity; shops = []; }
    if (!doc.hidden && stage && (forceDiscovery || Date.now() - lastDiscovery >= DISCOVERY_INTERVAL)) {
      lastDiscovery = Date.now();
      shops = findExchangeViews(stage);
    }
    const visibleShops = doc.hidden ? [] : shops.filter(shop => shopIsVisible(shop, stage));
    if (!visibleShops.length) {
      // Keep mounted shops under a native modal; they can resume as soon as it closes.
      for (const [item, button] of controls) {
        if (isNativeNodeMounted(owners.get(item), stage, 64)) button.hidden = true;
        else { button.remove(); controls.delete(item); owners.delete(item); }
      }
      if (!controls.size) stopFollowing();
      return;
    }
    const canvas = L?.Render?.canvas || doc.querySelector('canvas'), rect = canvas?.getBoundingClientRect?.();
    const goods = new Set(adapter.snapshot().rows.map(row => row.id)), view = controller.view(), seen = new Set();
    if (rect?.width && stage?.width) for (const shop of visibleShops) {
      for (const item of shop.itemList) {
        const id = item?.limitInfo?.ItemID;
        if (!item?.goodsinfo || item.visible === false || item.destroyed || !goods.has(id)) continue;
        // Official shop goods are flat draw items, not Laya Sprite children.
        const point = shop.localToGlobal?.(new L.Point(item.x + item.width - 52, item.y + 3));
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        seen.add(item);
        let button = controls.get(item);
        if (!button) {
          button = doc.createElement('button'); button.type = 'button'; button.setAttribute('role', 'checkbox');
          button.innerHTML = '<span class="exchange-mark" aria-hidden="true"></span><span class="exchange-label"></span>';
          button.addEventListener('click', event => {
            event.stopPropagation();
            if (!shopIsVisible(shop, (ctx.window.Laya ?? ctx.window.laya)?.stage)) return;
            const current = item.limitInfo?.ItemID;
            controller.toggle(current, !controller.selected(current));
            refresh();
          });
          for (const event of ['pointerdown', 'mousedown', 'dblclick']) button.addEventListener(event, e => e.stopPropagation());
          root.append(button); controls.set(item, button); owners.set(item, shop);
        }
        const selected = controller.selected(id), period = { 1: '每日', 2: '每周', 3: '每月' }[item.limitInfo.MaxBuyType];
        button.hidden = false;
        button.disabled = !adapter.account() || !period || !(item.limitInfo.MaxBuyCount > 0);
        button.setAttribute('aria-checked', String(selected));
        button.setAttribute('aria-label', `${item.goodsinfo.name || '商品'}自动兑换`);
        button.title = period ? `${period}兑换至限购上限，消耗地主豆；按账号保存。选中后等待5秒，取消选择可停止尚未发送的购买。余额不足时仅兑换可负担数量，等待地主豆余额变化。` : '无周期限购，不支持自动兑换';
        button.querySelector('.exchange-mark').textContent = selected ? '✓' : '+';
        button.querySelector('.exchange-label').textContent = view.countdown?.id === id ? `${view.countdown.seconds}秒` : selected ? '已选' : '自动';
        button.style.left = `${rect.left + point.x * rect.width / stage.width}px`;
        button.style.top = `${rect.top + point.y * rect.height / stage.height}px`;
      }
    }
    for (const [item, button] of controls) if (!seen.has(item)) { button.remove(); controls.delete(item); owners.delete(item); }
    if (controls.size) scheduleFollow();
    else stopFollowing();
  }
  // Visibility and positioning follow the native frame, independently of the
  // slower business-data poll. Flat items have no display lifecycle of their own.
  let frame;
  const requestFrame = typeof ctx.window.requestAnimationFrame === 'function'
    ? callback => ctx.window.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
  const cancelFrame = typeof ctx.window.cancelAnimationFrame === 'function'
    ? id => ctx.window.cancelAnimationFrame(id) : id => clearTimeout(id);
  function scheduleFollow() {
    if (frame === undefined && !doc.hidden && !ctx.scope.signal.aborted) frame = requestFrame(followWindow);
  }
  function stopFollowing() {
    if (frame !== undefined) { cancelFrame(frame); frame = undefined; }
  }
  const followWindow = () => {
    frame = undefined;
    const L = ctx.window.Laya ?? ctx.window.laya, stage = L?.stage;
    const visibility = new Map();
    let rect, hasMountedShop = false;
    for (const [item, button] of controls) {
      const shop = owners.get(item);
      if (!visibility.has(shop)) {
        const mounted = isNativeNodeMounted(shop, stage, 64);
        visibility.set(shop, mounted && shopIsVisible(shop, stage));
        hasMountedShop ||= mounted;
      }
      const hidden = item.destroyed || item.visible === false || !visibility.get(shop);
      if (button.hidden !== hidden) button.hidden = hidden;
      if (!hidden && rect === undefined) {
        const canvas = L?.Render?.canvas || doc.querySelector('canvas');
        rect = canvas?.getBoundingClientRect?.() ?? null;
      }
      if (!button.hidden && rect?.width && stage?.width) {
        const point = shop.localToGlobal?.(new L.Point(item.x + item.width - 52, item.y + 3));
        if (point) {
          const left = `${rect.left + point.x * rect.width / stage.width}px`;
          const top = `${rect.top + point.y * rect.height / stage.height}px`;
          if (button.style.left !== left) button.style.left = left;
          if (button.style.top !== top) button.style.top = top;
        }
      }
    }
    if (hasMountedShop) scheduleFollow();
  };
  if (ctx.game?.onSceneChange) ctx.scope.add(ctx.game.onSceneChange(queueDiscovery));
  ctx.scope.listen(doc, 'visibilitychange', () => {
    if (doc.hidden) stopFollowing();
    else queueDiscovery();
  });
  ctx.scope.add(() => { stopFollowing(); controls.clear(); owners.clear(); root.remove(); });
  return { refresh };
}
