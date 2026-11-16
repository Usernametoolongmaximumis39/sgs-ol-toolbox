import { toCanvas } from 'html-to-image';
import { MICROCLIENT } from './distribution.js';

export const DEFAULT_SCREENSHOT_SHORTCUT = { code: 'KeyS', ctrl: true, shift: true, alt: false, meta: false };
export function shortcutFromEvent(event) {
  if (!event.code || ['Control', 'Shift', 'Alt', 'Meta'].some(key => event.code.startsWith(key))) return null;
  return { code: event.code, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
}
export function shortcutLabel(shortcut) {
  if (!shortcut?.code) return '未绑定';
  return [shortcut.ctrl && 'Ctrl', shortcut.shift && 'Shift', shortcut.alt && 'Alt', shortcut.meta && 'Meta', shortcut.code.replace(/^(Key|Digit)/, '')].filter(Boolean).join(' + ');
}
export function matchesShortcut(event, shortcut) {
  return !!shortcut?.code && event.code === shortcut.code && ['ctrl', 'shift', 'alt', 'meta'].every(key => !!event[key + 'Key'] === !!shortcut[key]);
}
export function isTyping(event) {
  return event.composedPath().some(node => node?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName));
}

export function gameCanvas(win) {
  const rendered = win.Laya?.Render?.canvas, source = rendered?.source ?? rendered;
  const canvas = source?.getBoundingClientRect ? source : win.document.getElementById('layaCanvas');
  if (!canvas || !canvas.width || !canvas.height) throw new Error('尚未找到游戏有效画面');
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) throw new Error('游戏画面尚未显示');
  // Axis-aligned game canvas; the client uses this rectangle for its letterboxed viewport.
  return { canvas, rect };
}

// Only our in-game native additions. Do not hide skin controls in hall windows.
export function hideNativeOverlays(stage) {
  const saved = [], queue = stage ? [stage] : [], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (!node || node.destroyed || seen.has(node)) continue;
    seen.add(node);
    if (['sgs-toolbox-hand-sort', 'sgs-toolbox-countdown'].includes(node.name)) {
      saved.push([node, node.visible]); node.visible = false;
    } else if (Array.isArray(node._children)) queue.push(...node._children);
  }
  return () => { for (const [node, visible] of saved) if (!node.destroyed) node.visible = visible; };
}

export function captureNative(win, canvas, hide) {
  const doc = win.document, stage = win.Laya?.stage;
  const restore = hide ? hideNativeOverlays(stage) : () => {};
  let rendered;
  try {
    const output = doc.createElement('canvas');
    const width = Math.round(stage?.width || canvas.width), height = Math.round(stage?.height || canvas.height);
    if (!(width > 0 && height > 0 && width * height <= 33554432)) throw new Error('游戏画面尺寸无效或过大');
    output.width = width; output.height = height;
    const context = output.getContext('2d');
    if (typeof stage?.drawToCanvas !== 'function') {
      // A normal 2D canvas is sufficient in tests/older clients; WebGL needs a fresh render.
      if (!canvas.getContext('2d')) throw new Error('当前游戏引擎不支持截图，请刷新游戏后重试');
      context.drawImage(canvas, 0, 0, width, height); return output;
    }
    rendered = stage.drawToCanvas(width, height, 0, 0);
    const target = rendered?._ctx?._targets;
    if (target?.getData) {
      const pixels = target.getData(0, 0, width, height);
      if (!pixels || pixels.length < width * height * 4) throw new Error('游戏画面读取失败');
      const data = context.createImageData(width, height), stride = width * 4;
      // Laya's render texture uses a bottom-left framebuffer origin.
      for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      context.putImageData(data, 0, 0);
    } else {
      const source = rendered?.source ?? rendered?._source;
      if (!source) throw new Error('游戏画面读取失败');
      context.drawImage(source, 0, 0, width, height);
    }
    if (stage.bgColor) {
      context.globalCompositeOperation = 'destination-over'; context.fillStyle = stage.bgColor;
      context.fillRect(0, 0, width, height); context.globalCompositeOperation = 'source-over';
    }
    return output;
  } finally { try { rendered?.destroy?.(); } finally { restore(); } }
}

export async function captureGameImage(win, game, { hideUI = true } = {}) {
  const { canvas, rect } = gameCanvas(win), inGame = game.isInGame();
  const output = captureNative(win, canvas, hideUI && inGame), ctx = output.getContext('2d');
  // DOM overlays are omitted from the copy, never removed from the live game.
  const layerOrder = host => Math.max(Number(win.getComputedStyle(host).zIndex) || 0,
    ...[...(host.shadowRoot?.children || [])].filter(child => !child.classList.contains('toast')).map(child => Number(win.getComputedStyle(child).zIndex) || 0));
  const hosts = [...win.document.querySelectorAll('[data-sgs-toolbox]')]
    .filter(host => !(hideUI && (host.dataset.sgsToolbox === 'core' || inGame)))
    .sort((a, b) => layerOrder(a) - layerOrder(b));
  for (const host of hosts) {
    const css = win.getComputedStyle(host);
    if (css.display === 'none' || css.visibility === 'hidden') continue;
    const box = host.getBoundingClientRect(), fullViewport = !box.width || !box.height;
    const width = fullViewport ? win.innerWidth : box.width, height = fullViewport ? win.innerHeight : box.height;
    const x = fullViewport ? 0 : box.left, y = fullViewport ? 0 : box.top;
    if (x >= rect.right || y >= rect.bottom || x + width <= rect.left || y + height <= rect.top) continue;
    const layer = await toCanvas(host, { width, height, pixelRatio: 1, skipFonts: true,
      filter: node => !['STYLE', 'SCRIPT'].includes(node.tagName) && !node.classList?.contains('toast'),
      style: { position: 'relative', left: '0', top: '0', right: 'auto', bottom: 'auto', margin: '0', transform: 'none' } });
    ctx.drawImage(layer, (x - rect.left) * output.width / rect.width, (y - rect.top) * output.height / rect.height,
      width * output.width / rect.width, height * output.height / rect.height);
  }
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 截图生成失败')), 'image/png'));
}

export function createScreenshotController({ window: win, game, settings, scope, notify }) {
  let busy = false;
  async function capture() {
    if (busy || scope.closed) return;
    busy = true;
    try {
      if (!win.ClipboardItem || !win.navigator.clipboard?.write) throw new Error('浏览器不支持图片剪贴板，请使用 HTTPS 页面和新版 Chrome / Edge');
      // Start clipboard write within the click/key gesture, before rendering awaits.
      const image = captureGameImage(win, game, { hideUI: settings.get('screenshotHideUI', true) });
      image.catch(() => {});
      // Chromium 85 accepts Blob values only; promise-valued ClipboardItem
      // entries were added in later Chromium versions.
      const png = MICROCLIENT ? await image : image;
      await win.navigator.clipboard.write([new win.ClipboardItem({ 'image/png': png })]);
      if (!scope.closed) notify('游戏截图已复制到剪贴板');
    } catch (error) {
      if (!scope.closed) notify(error?.name === 'NotAllowedError' ? '无法复制截图：请允许此页面访问剪贴板，再点击截图重试' : `截图失败：${error?.message || error}`);
    } finally { busy = false; }
  }
  scope.listen(win.document, 'keydown', event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || isTyping(event)) return;
    if (!matchesShortcut(event, settings.get('screenshotShortcut', DEFAULT_SCREENSHOT_SHORTCUT))) return;
    event.preventDefault(); event.stopPropagation(); void capture();
  });
  return { capture };
}
